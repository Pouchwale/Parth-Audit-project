// MITRA'S NATURAL VOICE, MADE ON THE SERVER (REQUIREMENTS §81, §109).
//
// "our bot will also remind with voice like in today briefing it seem to be
// real voice so if user heard it look like some one is telling them". The
// browser's own voices range from Edge's natural ones to a robotic default, so
// when the server has an AI key Mitra's lines are spoken by the service's
// text-to-speech model (backend/ai.ts aiSpeak) and sent to the browser as a
// WAV: since §109 ChatGPT's (OpenAI's gpt-4o-mini-tts, which speaks English,
// Hindi and Gujarati), or Groq's on a server set up before it. Since 23-Oct-2026
// Google's Gemini voice speaks first wherever GEMINI_API_KEY is set: free, and
// fluent in all three ("real very fluent", the owner asked; backend/geminiSpeech.ts),
// the AI service's voice answering only for a line Gemini cannot say. This file
// holds the parts of that which are not HTTP:
//
//   chunkForSpeech  Groq's model takes at most 200 characters a call, so a
//                   briefing is cut into pieces — at the end of a sentence where
//                   it can be, else at a comma, else between words — and each
//                   piece is spoken in turn (OpenAI's takes 4,096: a line is one
//                   piece)
//   joinWavs        the pieces come back as separate WAV files of the same
//                   format; they are joined into one (one header, the sizes
//                   rewritten, each later header skipped) so the browser plays
//                   one clip with no gap to stitch
//   SpeechCache     reminders repeat ("the Line Clearance Checklist is due
//                   today"), so the last 60 clips (30 MB at most) are kept in
//                   MEMORY, keyed by the service that made them, the voice and
//                   the text — so a line Gemini said is never answered with the
//                   clip ChatGPT's voice made of it while Gemini rested, nor the
//                   other way round (23-Oct-2026). Memory only: PostgreSQL is
//                   the one store for the plant's data (REQUIREMENTS §55), and a
//                   cache that empties on a restart only costs one more call
//   speakFailure    what the route answers for each way the voice can fail —
//                   never the service's own words, which are not for a person
//   VoiceAvailability, speakStatus
//                   whether the server can speak, learnt once from the service
//                   and remembered, for GET /api/assistant/speak — the browser
//                   asks that before it ever asks for a line (REQUIREMENTS §85),
//                   so a voice that is not available is never an error in its console
//
// The browser sends English lines only, and only when it has no natural Indian
// English voice of its own (Edge's Neerja and Prabhat speak first: the staff's own
// accent); its Hindi and Gujarati voices say Hindi and Gujarati lines
// (frontend/src/utils/voice.ts, REQUIREMENTS §89). OpenAI's voice would say those
// too: it is told the line's language by its script (backend/ai.ts).
//
// NOT A LOCAL VOICE (REQUIREMENTS §85, measured 30-Sep-2026). A neural voice
// made on this server without Groq — Kokoro-82M through kokoro-js/onnxruntime —
// was tried on the plant's kind of machine (a 4-thread Core i3-1115G4): a
// 21-word reminder took 4.0 s at best (fp32 model, all four threads, the process
// at high priority) and 5.4 to 8.7 s at normal priority, the 92 MB q8 model 10 s,
// with about 1 GB of memory and every core busy while it spoke — against a bar
// of 3 s, on the machine that also serves every page. It was not adopted: where
// the service's voice cannot speak, the browser's best natural voice does, the
// words made for the ear first (frontend/src/utils/earText.ts).

/** Groq's speech model's own limit on one call's input. */
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
  return wavFile(first.fmt, samples);
}

/** A WAV file of one "fmt " chunk's body and the samples after it: the RIFF and data sizes written for them, each chunk padded to an even length. */
function wavFile(fmt: Buffer, samples: Buffer[]): Buffer {
  const dataLength = samples.reduce((n, s) => n + s.length, 0);
  const fmtSize = fmt.length;
  const fmtPad = fmtSize & 1;
  const dataPad = dataLength & 1;
  const header = Buffer.alloc(12 + 8 + fmtSize + fmtPad + 8);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(4 + 8 + fmtSize + fmtPad + 8 + dataLength + dataPad, 4);
  header.write("WAVE", 8, "latin1");
  header.write("fmt ", 12, "latin1");
  header.writeUInt32LE(fmtSize, 16);
  fmt.copy(header, 20);
  const dataAt = 20 + fmtSize + fmtPad;
  header.write("data", dataAt, "latin1");
  header.writeUInt32LE(dataLength, dataAt + 4);
  return Buffer.concat([header, ...samples, ...(dataPad ? [Buffer.alloc(1)] : [])]);
}

/**
 * Raw PCM samples as a WAV: Gemini's audio/l16 (backend/geminiSpeech.ts), which has
 * no header of its own — 24 kHz, mono, 16-bit little-endian unless said otherwise.
 * A trailing part-frame is dropped, as joinWavs drops one.
 */
export function pcmWav(samples: Buffer, { sampleRate = 24000, channels = 1, bitsPerSample = 16 }: { sampleRate?: number; channels?: number; bitsPerSample?: number } = {}): Buffer {
  const blockAlign = Math.max(1, (channels * bitsPerSample) / 8);
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0); // PCM
  fmt.writeUInt16LE(channels, 2);
  fmt.writeUInt32LE(sampleRate, 4);
  fmt.writeUInt32LE(sampleRate * blockAlign, 8);
  fmt.writeUInt16LE(blockAlign, 12);
  fmt.writeUInt16LE(bitsPerSample, 14);
  return wavFile(fmt, [samples.subarray(0, samples.length - (samples.length % blockAlign))]);
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

/**
 * A clip's key: the service that made it (backend/ai.ts speechEngine — Gemini's and ChatGPT's voices sound
 * nothing alike, so one is never served for the other), Mitra's voice, and the text. Left out, the key is the
 * voice and the text, as before 23-Oct-2026.
 */
export const speechCacheKey = (voice: VoiceKind, text: string, service?: VoiceService): string => (service ? `${service}\n${voice}\n${text}` : `${voice}\n${text}`);

// ---------------------------------------------------------------------------
// When the voice cannot be made

/**
 * The service that makes the voice (backend/ai.ts speechEngine): Google's Gemini where GEMINI_API_KEY is set
 * (free, since 23-Oct-2026), else ChatGPT's (OpenAI) since §109, or Groq on an older setup.
 */
export type VoiceService = "openai" | "groq" | "gemini";

const REFUSED: Record<VoiceService, (model: string) => string> = {
  openai: (model) => `The speech model ${model} is not available to this OpenAI key.`,
  groq: (model) => `The speech model ${model} needs its terms accepted by the Groq organisation's admin.`,
  gemini: (model) => `The speech model ${model} is not available to this Google AI Studio key (GEMINI_API_KEY).`,
};

/**
 * The service will not speak with this model, and only its account's admin can change that: on OpenAI the key's
 * project cannot use the speech model (403, 404); on Groq the model's terms have not been accepted; on Gemini the
 * key is refused or cannot use the model (400, 401, 403, 404). `detail` is the service's own reason, for the
 * server's log only (with no key in it: backend/geminiSpeech.ts); the browser is told voiceUnavailableMessage.
 */
export class VoiceUnavailableError extends Error {
  readonly code = "voice-unavailable";
  readonly model: string;
  readonly service: VoiceService;
  constructor(model: string, service: VoiceService, detail = "") {
    super(detail ? `${REFUSED[service](model)} ${detail}` : REFUSED[service](model));
    this.name = "VoiceUnavailableError";
    this.model = model;
    this.service = service;
  }
}

/** No key for a voice on this server (CHATGPT_API_KEY, or GROQ_API_KEY on an older setup; nor GEMINI_API_KEY). */
export class VoiceNotConfiguredError extends Error {
  readonly code = "not-configured";
  constructor() {
    super("The assistant isn't configured yet (missing CHATGPT_API_KEY).");
    this.name = "VoiceNotConfiguredError";
  }
}

/** What the plant's admin is told when the service will not speak with the model. */
export function voiceUnavailableMessage(model: string, service: VoiceService): string {
  if (service === "gemini") {
    return `Mitra's free voice needs a Google AI Studio key that can use the speech model ${model}: check GEMINI_API_KEY at aistudio.google.com, or set GEMINI_TTS_MODEL to a speech model the key has.`;
  }
  return service === "openai"
    ? `Mitra's natural voice needs the speech model ${model} on the ChatGPT (OpenAI) account: give the key's project access to it at platform.openai.com, or set AI_TTS_MODEL to a speech model it has.`
    : `Mitra's natural voice needs the Groq organisation's admin to accept the model's terms at console.groq.com (${model}).`;
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

// ---------------------------------------------------------------------------
// Whether the server can speak: asked once, remembered (REQUIREMENTS §85)
//
// A browser must not find out by trying: a 503 for every page that opens is an
// error in its console on the plant's normal day (on 30-Sep-2026, the Groq terms
// not accepted yet). So it ASKS first — GET /api/assistant/speak, always a 200 —
// and keeps the answer for as long as the answer says (recheckAfterMs). The
// server, for its part, asks the service once — one short line, kept as a clip —
// and remembers what it learnt: the voice not available for ten minutes (the
// admin may put it right at any time), a failure for two, a working voice for an hour.

export type SpeakStatusCode = "available" | "not-configured" | "voice-unavailable" | "failed";

/** The GET's answer. */
export interface SpeakStatus {
  available: boolean;
  code: SpeakStatusCode;
  /** In plain words, for the Master Data card. */
  message: string;
  /** What speaks when the server does: the service's speech model. */
  engine: VoiceService | null;
  model: string;
  /** The model's voice for Mitra's female and male voice. */
  voices: { female: string; male: string } | null;
  /** How long the browser may go by this answer before asking again. */
  recheckAfterMs: number;
}

export const VOICE_RECHECK_MS = {
  available: 60 * 60 * 1000,
  "voice-unavailable": 10 * 60 * 1000,
  failed: 2 * 60 * 1000,
  "not-configured": 60 * 60 * 1000,
} as const;

/** The line the server asks the service to say when it has to find out whether it can: short, and kept as a clip. */
export const VOICE_PROBE_TEXT = "Hello.";

type Learnt = "available" | "voice-unavailable" | "failed";

/** What was learnt, with the service it was learnt of when that was said (Gemini's or the AI service's voice, since 23-Oct-2026). */
export interface LearntVoice {
  code: Learnt;
  model: string;
  until: number;
  service?: VoiceService;
}

/** What the server has learnt of the service's voice, and until when it goes by it. */
export class VoiceAvailability {
  private learnt: LearntVoice | null = null;

  /** What is known now, or null when it must be found out. */
  current(now = Date.now()): LearntVoice | null {
    if (!this.learnt || now >= this.learnt.until) return null;
    return { ...this.learnt };
  }

  /** Whether the service is known, now, to refuse the voice (the route answers at once without asking). */
  refusing(now = Date.now()): boolean {
    return this.current(now)?.code === "voice-unavailable";
  }

  private learn(code: Learnt, model: string, now: number, service: VoiceService | undefined): void {
    this.learnt = { code, until: now + VOICE_RECHECK_MS[code], model, ...(service ? { service } : {}) };
  }

  markAvailable(model: string, now = Date.now(), service?: VoiceService): void {
    this.learn("available", model, now, service);
  }

  /** The voice is not available. True when this is news (it was not already known), so the server says so once. */
  markUnavailable(model: string, now = Date.now(), service?: VoiceService): boolean {
    const news = !this.refusing(now);
    this.learn("voice-unavailable", model, now, service);
    return news;
  }

  markFailed(model: string, now = Date.now(), service?: VoiceService): void {
    this.learn("failed", model, now, service);
  }

  forget(): void {
    this.learnt = null;
  }
}

/** The voice's name in the card's words: Google's Gemini voice (free, 23-Oct-2026), ChatGPT's (OpenAI's) since §109, or Groq's on an older setup. */
const VOICE_OF: Record<VoiceService, string> = { openai: "ChatGPT's natural voice (OpenAI)", groq: "Groq's natural voice", gemini: "Google's Gemini voice" };

/** The GET's answer for what is known; `service` is the voice it was learnt of (backend/ai.ts voiceStatus, speechEngine). */
export function speakStatus(
  code: SpeakStatusCode,
  model: string,
  voices: { female: string; male: string } | null,
  now = Date.now(),
  until?: number,
  service: VoiceService = "openai"
): SpeakStatus {
  const words: Record<SpeakStatusCode, string> = {
    available: `Mitra speaks with ${VOICE_OF[service]}, made on this server.`,
    "not-configured": "The natural voice needs an AI key on this server (CHATGPT_API_KEY); until then this browser's own voice speaks.",
    "voice-unavailable": voiceUnavailableMessage(model, service),
    failed: `${VOICE_OF[service]} could not be reached just now; this browser's own voice speaks meanwhile.`,
  };
  const left = until !== undefined ? Math.max(1000, until - now) : VOICE_RECHECK_MS[code];
  return {
    available: code === "available",
    code,
    message: words[code],
    engine: code === "available" ? service : null,
    model,
    voices: code === "not-configured" ? null : voices,
    recheckAfterMs: Math.min(left, VOICE_RECHECK_MS[code]),
  };
}

/**
 * The route's answer for a failure: 503 with a code the browser acts on
 * (it falls back to its own voice and stops asking this session), 429 when the
 * day's AI allowance is spent (backend/ai.ts AiAllowanceError), or 502 for
 * anything else. Never the service's own text: it is not written for a person
 * and can name the account.
 */
export function speakFailure(err: unknown): { status: number; body: { error: string; code: string } } {
  if (err instanceof VoiceNotConfiguredError) {
    return { status: 503, body: { error: "Mitra's natural voice isn't configured on this server.", code: "not-configured" } };
  }
  if (err instanceof VoiceUnavailableError) {
    return { status: 503, body: { error: voiceUnavailableMessage(err.model, err.service), code: "voice-unavailable" } };
  }
  if ((err as { code?: unknown } | null)?.code === "daily-allowance") {
    return { status: 429, body: { error: "The AI allowance for today is used up — the browser's own voice speaks until tomorrow.", code: "daily-allowance" } };
  }
  return { status: 502, body: { error: "Mitra's voice couldn't be made just now — the browser's own voice is used instead.", code: "failed" } };
}
