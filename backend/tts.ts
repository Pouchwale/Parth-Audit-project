// MITRA'S NATURAL VOICE, MADE ON THE SERVER (REQUIREMENTS §81).
//
// "our bot will also remind with voice like in today briefing it seem to be
// real voice so if user heard it look like some one is telling them". The
// browser's own voices range from Edge's natural ones to a robotic default, so
// when the server has a Groq key Mitra's English lines are spoken by Groq's
// text-to-speech model (backend/groq.ts groqSpeak) and sent to the browser as
// a WAV. This file holds the parts of that which are not HTTP:
//
//   chunkForSpeech  the model takes at most 200 characters a call, so a
//                   briefing is cut into pieces — at the end of a sentence where
//                   it can be, else at a comma, else between words — and each
//                   piece is spoken in turn
//   joinWavs        the pieces come back as separate WAV files of the same
//                   format; they are joined into one (one header, the sizes
//                   rewritten, each later header skipped) so the browser plays
//                   one clip with no gap to stitch
//   SpeechCache     reminders repeat ("the Line Clearance Checklist is due
//                   today"), so the last 60 clips (30 MB at most) are kept in
//                   MEMORY, keyed by voice and text. Memory only: PostgreSQL is
//                   the one store for the plant's data (REQUIREMENTS §55), and a
//                   cache that empties on a restart only costs one more call
//   speakFailure    what the route answers for each way the voice can fail —
//                   never Groq's own words, which are not for a person
//
// Gujarati is never sent here: the model speaks English only, and the browser's
// Gujarati voice (where Edge has one) says Gujarati lines (frontend/src/utils/voice.ts).

/** The model's own limit on one call's input. */
export const TTS_CHUNK_CHARS = 200;
/** The most a browser may ask to be said in one request. */
export const TTS_MAX_TEXT_CHARS = 600;

// ---------------------------------------------------------------------------
// Cutting a line into pieces the model accepts

/** Greedily packs `pieces` into strings of at most `max` characters, joined with a space. */
function pack(pieces: string[], max: number): string[] {
  const out: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (!piece) continue;
    if (!current) current = piece;
    else if (current.length + 1 + piece.length <= max) current += ` ${piece}`;
    else {
      out.push(current);
      current = piece;
    }
  }
  if (current) out.push(current);
  return out;
}

/** A sentence longer than `max`: cut at clause marks, then between words, then — a "word" longer than a whole piece — anywhere. */
function splitLong(sentence: string, max: number): string[] {
  const clauses = sentence.split(/(?<=[,;:—–])\s+/);
  const pieces: string[] = [];
  for (const clause of clauses) {
    if (clause.length <= max) {
      pieces.push(clause);
      continue;
    }
    for (const word of clause.split(" ")) {
      if (word.length <= max) pieces.push(word);
      else for (let i = 0; i < word.length; i += max) pieces.push(word.slice(i, i + max));
    }
  }
  return pack(pieces, max);
}

/**
 * The text as the pieces the model is asked to say, in order: each at most
 * `max` characters, cut at a sentence's end where possible, else at a comma or
 * a dash, else between words. Whitespace is collapsed; nothing else changes, so
 * the pieces joined with a space are the text again (unless one word was
 * longer than a whole piece). A decimal point ("92.5%") is not a sentence's end:
 * only a mark followed by a space is.
 */
export function chunkForSpeech(text: string, max = TTS_CHUNK_CHARS): string[] {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];
  const sentences = clean.split(/(?<=[.!?।…])\s+/);
  const pieces: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length <= max) pieces.push(sentence);
    else pieces.push(...splitLong(sentence, max));
  }
  return pack(pieces, max);
}

// ---------------------------------------------------------------------------
// WAV files: reading one, and joining several of the same format

export interface WavInfo {
  /** 1 = PCM, 3 = IEEE float, 0xFFFE = extensible. */
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  blockAlign: number;
  /** The "fmt " chunk's body, copied into the joined file as it is. */
  fmt: Buffer;
  /** Where the samples start, and how many bytes of them there are. */
  dataOffset: number;
  dataLength: number;
}

const ascii = (buf: Buffer, at: number): string => buf.toString("latin1", at, at + 4);

/**
 * Reads a WAV file's format and where its samples are. A clip written as a
 * stream says "unknown" for its sizes (0 or 0xFFFFFFFF); the samples then run
 * to the end of the file, and so does a size that claims more than is there.
 * Throws on anything that is not a WAV.
 */
export function parseWav(buf: Buffer): WavInfo {
  if (!Buffer.isBuffer(buf) || buf.length < 12 || ascii(buf, 0) !== "RIFF" || ascii(buf, 8) !== "WAVE") throw new Error("Not a WAV file.");
  let at = 12;
  let fmt: Buffer | null = null;
  while (at + 8 <= buf.length) {
    const id = ascii(buf, at);
    const size = buf.readUInt32LE(at + 4);
    const body = at + 8;
    if (id === "fmt ") {
      if (size < 16 || body + size > buf.length) throw new Error("The WAV file's format is damaged.");
      fmt = Buffer.from(buf.subarray(body, body + size));
    } else if (id === "data") {
      if (!fmt) throw new Error("The WAV file has its samples before its format.");
      const remaining = buf.length - body;
      const dataLength = size === 0 || size === 0xffffffff || size > remaining ? remaining : size;
      const blockAlign = fmt.readUInt16LE(12) || 1;
      return {
        audioFormat: fmt.readUInt16LE(0),
        channels: fmt.readUInt16LE(2),
        sampleRate: fmt.readUInt32LE(4),
        bitsPerSample: fmt.readUInt16LE(14),
        blockAlign,
        fmt,
        dataOffset: body,
        dataLength,
      };
    }
    // A chunk's body is padded to an even length.
    at = body + size + (size & 1);
  }
  throw new Error("The WAV file has no samples.");
}

/**
 * One WAV of the clips played one after another. They must share a format
 * (the model answers every piece the same way); the first one's format is
 * written once, the samples follow each other, and the RIFF and data sizes are
 * rewritten for the whole. A clip's trailing part-frame, if any, is dropped so
 * the next clip starts on a frame.
 */
export function joinWavs(clips: Buffer[]): Buffer {
  if (!clips.length) throw new Error("No clips to join.");
  const infos = clips.map(parseWav);
  const first = infos[0];
  for (const info of infos.slice(1)) {
    if (info.audioFormat !== first.audioFormat || info.channels !== first.channels || info.sampleRate !== first.sampleRate || info.bitsPerSample !== first.bitsPerSample) {
      throw new Error("The clips are not in the same format.");
    }
  }
  const samples = infos.map((info, i) => {
    const whole = info.dataLength - (info.dataLength % first.blockAlign);
    return clips[i].subarray(info.dataOffset, info.dataOffset + whole);
  });
  const dataLength = samples.reduce((n, s) => n + s.length, 0);
  const fmtSize = first.fmt.length;
  const fmtPad = fmtSize & 1;
  const dataPad = dataLength & 1;
  const header = Buffer.alloc(12 + 8 + fmtSize + fmtPad + 8);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(4 + 8 + fmtSize + fmtPad + 8 + dataLength + dataPad, 4);
  header.write("WAVE", 8, "latin1");
  header.write("fmt ", 12, "latin1");
  header.writeUInt32LE(fmtSize, 16);
  first.fmt.copy(header, 20);
  const dataAt = 20 + fmtSize + fmtPad;
  header.write("data", dataAt, "latin1");
  header.writeUInt32LE(dataLength, dataAt + 4);
  return Buffer.concat([header, ...samples, ...(dataPad ? [Buffer.alloc(1)] : [])]);
}

// ---------------------------------------------------------------------------
// The last clips made, kept in memory

/** A least-recently-used cache of clips, bounded by count and by bytes. */
export class SpeechCache {
  private readonly clips = new Map<string, Buffer>();
  private total = 0;
  readonly maxEntries: number;
  readonly maxBytes: number;
  constructor(maxEntries = 60, maxBytes = 30 * 1024 * 1024) {
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
  }

  get size(): number {
    return this.clips.size;
  }

  get bytes(): number {
    return this.total;
  }

  get(key: string): Buffer | undefined {
    const clip = this.clips.get(key);
    if (clip) {
      // Used again: it moves to the newest end.
      this.clips.delete(key);
      this.clips.set(key, clip);
    }
    return clip;
  }

  set(key: string, clip: Buffer): void {
    if (clip.length > this.maxBytes) return;
    const old = this.clips.get(key);
    if (old) {
      this.total -= old.length;
      this.clips.delete(key);
    }
    this.clips.set(key, clip);
    this.total += clip.length;
    while (this.clips.size > this.maxEntries || this.total > this.maxBytes) {
      const oldest = this.clips.keys().next().value;
      if (oldest === undefined) break;
      this.total -= this.clips.get(oldest)?.length ?? 0;
      this.clips.delete(oldest);
    }
  }
}

/** The server's one cache of clips (backend/index.ts, POST /api/assistant/speak). */
export const speechCache = new SpeechCache();

export type VoiceKind = "female" | "male";

export const speechCacheKey = (voice: VoiceKind, text: string): string => `${voice}\n${text}`;

// ---------------------------------------------------------------------------
// When the voice cannot be made

/** The model's terms have not been accepted for the Groq organisation: nothing but its admin can change that. */
export class VoiceUnavailableError extends Error {
  readonly code = "voice-unavailable";
  readonly model: string;
  constructor(model: string) {
    super(`The speech model ${model} needs its terms accepted by the Groq organisation's admin.`);
    this.name = "VoiceUnavailableError";
    this.model = model;
  }
}

/** No GROQ_API_KEY on this server. */
export class VoiceNotConfiguredError extends Error {
  readonly code = "not-configured";
  constructor() {
    super("The assistant isn't configured yet (missing GROQ_API_KEY).");
    this.name = "VoiceNotConfiguredError";
  }
}

/** What the plant's admin is told when the model's terms are not accepted. */
export function voiceUnavailableMessage(model: string): string {
  return `Mitra's natural voice needs the Groq organisation's admin to accept the model's terms at console.groq.com (${model}).`;
}

/**
 * Whether Groq's error answer says the model's terms are not accepted:
 * `{"error":{"code":"model_terms_required", …}}`, or those words anywhere in a
 * body that is not JSON.
 */
export function termsRequired(bodyText: string): boolean {
  try {
    const parsed = JSON.parse(bodyText) as { error?: { code?: unknown } } | null;
    if (parsed?.error?.code === "model_terms_required") return true;
  } catch {
    /* not JSON — look for the words */
  }
  return /model_terms_required/.test(bodyText);
}

/**
 * The route's answer for a failure: 503 with a code the browser acts on
 * (it falls back to its own voice and stops asking this session), or 502 for
 * anything else. Never Groq's own text: it is not written for a person and
 * can name the account.
 */
export function speakFailure(err: unknown): { status: number; body: { error: string; code: string } } {
  if (err instanceof VoiceNotConfiguredError) {
    return { status: 503, body: { error: "Mitra's natural voice isn't configured on this server.", code: "not-configured" } };
  }
  if (err instanceof VoiceUnavailableError) {
    return { status: 503, body: { error: voiceUnavailableMessage(err.model), code: "voice-unavailable" } };
  }
  return { status: 502, body: { error: "Mitra's voice couldn't be made just now — the browser's own voice is used instead.", code: "failed" } };
}
