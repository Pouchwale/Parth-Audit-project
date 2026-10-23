// MITRA'S FREE VOICE: GOOGLE'S GEMINI TEXT-TO-SPEECH (23-Oct-2026).
//
// The owner wants Mitra to speak "real very fluent" English, Hindi and Gujarati, with a human tone, and will not pay
// for a voice. ChatGPT's (backend/ai.ts, gpt-4o-mini-tts) is billed by the minute, and he found it "very slow
// speaking". Google's Gemini speech models sound natural, hear for themselves which language a line is in (Gujarati,
// Hindi and English among them), and are free on a Google AI Studio key: the free tier needs no billing account and
// no card. So wherever GEMINI_API_KEY is set, backend/ai.ts aiSpeakClip asks Gemini first, and the AI service's voice
// (ChatGPT's, or Groq's on an older setup) says only a line Gemini cannot.
//
// FOR THE OWNER TO DECIDE. Google's terms for its unpaid services let it use what it is sent — here the words of
// Mitra's spoken lines: reminders and briefings, which name people, documents and figures — to improve its products,
// and people at Google may read them; those terms ask that nothing confidential or personal be sent to the unpaid
// tier. A key on a project with billing switched on is not used that way, but is paid for.
//
// THE FREE TIER'S LIMITS (requests a minute and a day) are shown only in AI Studio, and may be low. So as little is
// asked of it as can be: every clip made is kept (backend/tts.ts SpeechCache), the route's "can the server speak?"
// is answered from a clip Gemini already made (backend/index.ts probeVoice), and after a failure Gemini rests rather
// than be asked again for every line (below).
//
// THE SETTINGS, read at each call as backend/ai.ts reads its own (backend/.env; backend/.env.example names them):
//   GEMINI_API_KEY            the Google AI Studio key: set, Gemini speaks first. Sent in the x-goog-api-key header
//                             and nowhere else — never in an address, a log line or an error's words
//   GEMINI_TTS_MODEL          the speech model: gemini-3.8-flash-tts
//   GEMINI_TTS_VOICE_FEMALE   Mitra's female voice: Sulafat ("warm", in Google's list of its voices)
//   GEMINI_TTS_VOICE_MALE     Mitra's male voice: Achird ("friendly")
// Nothing here is counted against the plant's daily AI allowance (backend/ai.ts countTokens): that guards the paid key.
//
// THE CALL, as Google documents it (Oct-2026): POST /v1beta/interactions with the line as a verbatim transcript and
// how to say it as its `style` (speech_metadata, GEMINI_STYLE). The audio comes back as base64 in steps[].content[].data:
// the last "audio" item of the "model_output" steps, a WAV by default (24 kHz, mono, 16-bit PCM). Raw PCM, should it
// come, is given a WAV header. The whole line goes in one call: a browser sends at most 600 characters.
//
// WHEN IT FAILS. A refusal only the key's owner can put right is LASTING — 400 (Google answers a key it does not take
// with a 400), 401, 403, 404 (no such model for this key) — and Gemini is not asked again for ten minutes. Anything
// else is PASSING — 429 (the free tier's limit for the minute or the day), a 5xx, no answer within the 30 seconds,
// an answer with no audio in it — and Gemini rests a minute: after a 429 as long as Google asks (ten seconds to ten
// minutes), ten minutes when the day's limit is used up. Meanwhile the other voice speaks where there is one
// (backend/ai.ts aiSpeakClip), else the browser's own.
import { joinWavs, pcmWav, type VoiceKind } from "./tts.ts";

/** Where Google's Interactions API takes a request. */
export const GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";

/** The defaults: Google's Gemini 3.8 Flash speech model, and two of its voices — Sulafat ("warm") and Achird ("friendly"). */
export const GEMINI_DEFAULTS = { model: "gemini-3.8-flash-tts", voiceFemale: "Sulafat", voiceMale: "Achird" } as const;

/** Gemini's raw audio when it is not a WAV (audio/l16): 24 kHz, mono, 16-bit little-endian. */
const RAW_PCM = { sampleRate: 24000, channels: 1, bitsPerSample: 16 } as const;

const setting = (name: string): string => (process.env[name] ?? "").trim();

/** Whether Gemini speaks first: GEMINI_API_KEY is set (a blank or spaces-only key is no key). */
export function geminiConfigured(): boolean {
  return setting("GEMINI_API_KEY") !== "";
}

/** The speech model: GEMINI_TTS_MODEL, else gemini-3.8-flash-tts. */
export function geminiTtsModel(): string {
  return setting("GEMINI_TTS_MODEL") || GEMINI_DEFAULTS.model;
}

/** Gemini's voice for Mitra's female or male voice: GEMINI_TTS_VOICE_FEMALE / _MALE, else Sulafat / Achird. */
export function geminiVoiceName(kind: VoiceKind): string {
  const set = kind === "male" ? setting("GEMINI_TTS_VOICE_MALE") : setting("GEMINI_TTS_VOICE_FEMALE");
  return set || (kind === "male" ? GEMINI_DEFAULTS.voiceMale : GEMINI_DEFAULTS.voiceFemale);
}

/** A line's language by its script (backend/ai.ts speechLanguage). */
export type SpeechLanguage = "en" | "hi" | "gu";

/**
 * How Gemini is told to say a line, by its language: Mitra as a colleague at the plant, fluent, at a natural pace —
 * "never slow", since the owner found the voice he had "very slow speaking" (23-Oct-2026). Short, as Google advises:
 * the model hears the language itself, so this only says how.
 */
export const GEMINI_STYLE: Readonly<Record<SpeechLanguage, string>> = {
  en: "Warm, friendly and fluent, like a helpful colleague at a printing plant in Gujarat, India: natural everyday English with an Indian accent, at a natural conversational pace - never slow, never robotic.",
  hi: "Warm, friendly and fluent, like a helpful colleague at a printing plant in Gujarat, India: natural everyday Hindi as a native speaker, at a natural conversational pace - never slow, never robotic.",
  gu: "Warm, friendly and fluent, like a helpful colleague at a printing plant in Gujarat, India: natural everyday Gujarati as a native speaker from Gujarat, at a natural conversational pace - never slow, never robotic.",
};

/** The request for one line, as Google documents it: the words verbatim, how to say them, the voice, audio back. */
function geminiRequest(text: string, model: string, voiceName: string, language: SpeechLanguage): Record<string, unknown> {
  return {
    model,
    input: [{ type: "user_input", content: [{ type: "text", text, annotations: [{ type: "speech_metadata", style: GEMINI_STYLE[language] }] }] }],
    response_format: { type: "audio" },
    generation_config: { speech_config: [{ voice: voiceName }] },
  };
}

// ---------------------------------------------------------------------------
// WHEN GEMINI CANNOT SPEAK, and how long it then rests.

/** Refusals only the key's owner can put right: a key Google does not take (400, 401), no permission (403), no such model (404). */
const LASTING_STATUSES: ReadonlySet<number> = new Set([400, 401, 403, 404]);
/** A lasting refusal, or the free tier's day used up: Gemini is asked again after ten minutes. */
export const GEMINI_LASTING_REST_MS = 10 * 60 * 1000;
/** Any other failure: after a minute. */
export const GEMINI_PASSING_REST_MS = 60 * 1000;
/** A 429's own wait is kept to at least this. */
const SHORTEST_REST_MS = 10 * 1000;

/** The text with the key taken out: its value, and anything shaped like a Google API key. */
function withoutKey(text: string): string {
  let out = String(text ?? "");
  const key = setting("GEMINI_API_KEY");
  if (key.length >= 8) out = out.split(key).join("[key]");
  return out.replace(/\bAIza[0-9A-Za-z_-]{20,}/g, "[key]");
}

/** A line Gemini did not say: Google's status (0 when it never answered), whether only the key's owner can put it right, and how long Gemini rests. */
export class GeminiSpeechError extends Error {
  readonly status: number;
  readonly lasting: boolean;
  readonly restMs: number;
  constructor(status: number, message: string, restMs = GEMINI_PASSING_REST_MS) {
    super(withoutKey(message));
    this.name = "GeminiSpeechError";
    this.status = status;
    this.lasting = LASTING_STATUSES.has(status);
    this.restMs = this.lasting ? GEMINI_LASTING_REST_MS : restMs;
  }
}

/** What stops Gemini being asked, until when; `why` is the failure's words (no key in them). */
export interface GeminiRest {
  until: number;
  status: number;
  lasting: boolean;
  why: string;
}

// In memory: a rest that ends when the server restarts costs one more call, and nothing about it is plant data.
let rest: GeminiRest | null = null;

/** Whether Gemini is resting after a failure, and until when; null when it may be asked. */
export function geminiRest(now = Date.now()): GeminiRest | null {
  return rest && now < rest.until ? { ...rest } : null;
}

/** For the unit tests (backend/ai.ts resetAiStateForTests): no rest. */
export function resetGeminiForTests(): void {
  rest = null;
}

/** Starts Gemini's rest after this failure — unless one that ends later is already running (two lines were in flight). */
function restAfter(err: GeminiSpeechError): GeminiSpeechError {
  const until = Date.now() + err.restMs;
  if (!rest || rest.until < until) rest = { until, status: err.status, lasting: err.lasting, why: err.message };
  return err;
}

const errorWords = (err: unknown): string => (err instanceof Error ? `${err.name}: ${err.message}` : String(err));

/** A failed answer in a line for the log: the status, Google's own code for it (PERMISSION_DENIED, RESOURCE_EXHAUSTED…) and its message. */
function failureWords(status: number, bodyText: string): string {
  let code = "";
  let message = "";
  try {
    const e = (JSON.parse(bodyText) as { error?: { status?: unknown; message?: unknown } } | null)?.error;
    code = typeof e?.status === "string" ? e.status : "";
    message = typeof e?.message === "string" ? e.message : "";
  } catch {
    /* not JSON: the body's start says what it can */
  }
  const said = [String(status), code].filter(Boolean).join(", ");
  return `Gemini speech request failed (${said}): ${(message || bodyText).replace(/\s+/g, " ").trim().slice(0, 300)}`;
}

/** How long a 429 asks Gemini be left alone: its Retry-After, Google's RetryInfo ("retryDelay": "41s") or "Please retry in 41.6s". */
function askedToWaitMs(res: Response, bodyText: string): number | null {
  const header = Number(res.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return header * 1000;
  const m = /"retryDelay"\s*:\s*"([\d.]+)s"/.exec(bodyText) ?? /retry in ([\d.]+)\s*s\b/i.exec(bodyText);
  const seconds = m ? Number(m[1]) : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

/** The rest after a failed answer (the status decides a lasting one: GeminiSpeechError). A 429 for the free tier's DAY ("…PerDay…" in Google's quota id) is not over in a minute: ten. */
function restFor(res: Response, bodyText: string): number {
  if (res.status !== 429) return GEMINI_PASSING_REST_MS;
  if (/PerDay/i.test(bodyText)) return GEMINI_LASTING_REST_MS;
  const asked = askedToWaitMs(res, bodyText);
  return asked === null ? GEMINI_PASSING_REST_MS : Math.min(Math.max(asked, SHORTEST_REST_MS), GEMINI_LASTING_REST_MS);
}

// ---------------------------------------------------------------------------
// THE CLIP IN GOOGLE'S ANSWER.

/** The audio in an answer, as Google's documentation reads it: the last "audio" item of the "model_output" steps, its base64 `data` decoded. Null when there is none. */
export function audioOfAnswer(answer: unknown): Buffer | null {
  const steps = (answer as { steps?: unknown } | null)?.steps;
  if (!Array.isArray(steps)) return null;
  let data = "";
  for (const step of steps as ({ type?: unknown; content?: unknown } | null)[]) {
    if (step?.type !== "model_output" || !Array.isArray(step.content)) continue;
    for (const item of step.content as ({ type?: unknown; data?: unknown } | null)[]) {
      if (item?.type === "audio" && typeof item.data === "string" && item.data) data = item.data;
    }
  }
  return data ? Buffer.from(data, "base64") : null;
}

/**
 * The audio as one WAV the browser plays: a RIFF clip with its sizes written out (one written as a stream says
 * "unknown" for them; backend/tts.ts joinWavs), or raw 16-bit 24 kHz mono PCM given a header (pcmWav). Throws on a
 * RIFF clip it cannot read.
 */
export function wavOfAudio(audio: Buffer): Buffer {
  if (audio.length >= 4 && audio.toString("latin1", 0, 4) === "RIFF") return joinWavs([audio]);
  return pcmWav(audio, RAW_PCM);
}

// ---------------------------------------------------------------------------
// SAYING ONE LINE.

/** A line Gemini said: the WAV, and the model and voice that said it. */
export interface GeminiClip {
  clip: Buffer;
  model: string;
  voice: string;
}

/**
 * Says `text` in Gemini's voice for Mitra's `voice`, told how by the line's `language`: one WAV. Throws
 * GeminiSpeechError (and starts Gemini's rest) when Google does not answer with audio; never waits out a 429 — the
 * caller has the other voice say the line at once. The caller checks geminiConfigured and geminiRest first
 * (backend/ai.ts aiSpeakClip).
 */
export async function geminiSpeak({ text, voice, language, timeoutMs }: { text: string; voice: VoiceKind; language: SpeechLanguage; timeoutMs: number }): Promise<GeminiClip> {
  const key = setting("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not set.");
  const line = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!line) throw new Error("There is nothing to say.");
  const model = geminiTtsModel();
  const voiceName = geminiVoiceName(voice);
  let res: Response;
  try {
    res = await fetch(GEMINI_INTERACTIONS_URL, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(geminiRequest(line, model, voiceName, language)),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // No answer at all: the 30 seconds ran out, or no network.
    throw restAfter(new GeminiSpeechError(0, `Gemini speech request failed: ${errorWords(err)}`));
  }
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw restAfter(new GeminiSpeechError(res.status, failureWords(res.status, bodyText), restFor(res, bodyText)));
  }
  let audio: Buffer | null;
  try {
    audio = audioOfAnswer(await res.json());
  } catch (err) {
    throw restAfter(new GeminiSpeechError(res.status, `Gemini speech request failed: the answer could not be read (${errorWords(err)}).`));
  }
  if (!audio || audio.length < 2) throw restAfter(new GeminiSpeechError(res.status, "Gemini speech request failed: the answer had no audio in it."));
  let clip: Buffer;
  try {
    clip = wavOfAudio(audio);
  } catch (err) {
    throw restAfter(new GeminiSpeechError(res.status, `Gemini speech request failed: its audio is not a WAV this server can read (${errorWords(err)}).`));
  }
  return { clip, model, voice: voiceName };
}
