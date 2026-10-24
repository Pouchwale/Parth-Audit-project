// MITRA'S FREE VOICE (23-Oct-2026): backend/geminiSpeech.ts — Google's Gemini text-to-speech — and how backend/ai.ts
// aiSpeakClip puts it first and has the AI service's voice say what it cannot.
//
// globalThis.fetch is replaced in every test: each request is recorded (its address, headers, body and signal) and
// answered in Google's own shapes at generativelanguage.googleapis.com (OpenAI's at api.openai.com, Groq's at
// api.groq.com), so nothing goes out on the network; the keys are stand-ins ("test-key"), never a real one. What is
// proved: the request exactly as Google documents it (the address, the key's header, the model, the voice for Mitra's
// female and male voice, the style by the line's language, the words verbatim); the clip read from the answer (a WAV
// from base64, raw PCM given a header, the last "audio" of the "model_output" steps); the other voice when Gemini
// cannot speak (429); a refusal remembered and not asked again for ten minutes (403); nothing counted against the paid
// allowance; the GET's answer naming Google's voice on a server with only GEMINI_API_KEY; features.voice; and that no
// key reaches an error or a log line.
// Run: npm run test:unit -- geminiSpeech
//
// backend/env.ts FIRST, on purpose: features.ts (imported fresh below, once for each set of keys) imports it, and it
// fills from backend/.env every name not already set. Loaded here, under the unit runner (scripts/unit-tests.ts blanks
// every key), it fills no key; and loaded once, it never runs again in the middle of a test that has unset them.
import "../env.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "node:util";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  AiRequestError,
  aiConfigured,
  aiProviderName,
  aiSpeak,
  aiSpeakClip,
  countTokens,
  dailyBudgetSpent,
  redactSecrets,
  resetAiStateForTests,
  SPEECH_INSTRUCTIONS,
  speechEngine,
  speechSetup,
  tokensUsedToday,
  voiceConfigured,
  voiceStatus,
} from "../ai.ts";
import {
  audioOfAnswer,
  GEMINI_INTERACTIONS_URL,
  GEMINI_LASTING_REST_MS,
  GEMINI_PASSING_REST_MS,
  GEMINI_STYLE,
  geminiConfigured,
  geminiRest,
  geminiTtsModel,
  geminiVoiceName,
  wavOfAudio,
} from "../geminiSpeech.ts";
import { parseWav, speakFailure, speakStatus, VOICE_PROBE_TEXT, VOICE_RECHECK_MS, VoiceAvailability, voiceUnavailableMessage, VoiceUnavailableError } from "../tts.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---------------------------------------------------------------------------
// the environment, set test by test and put back after

const SETTINGS = [
  "GEMINI_API_KEY",
  "GEMINI_TTS_MODEL",
  "GEMINI_TTS_VOICE_FEMALE",
  "GEMINI_TTS_VOICE_MALE",
  "CHATGPT_API_KEY",
  "OPENAI_API_KEY",
  "GROQ_API_KEY",
  "AI_TTS_MODEL",
  "AI_TTS_VOICE_FEMALE",
  "AI_TTS_VOICE_MALE",
  // Unset, ChatGPT's PAID voice never speaks (REQUIREMENTS §122, "i want all free", 24-Oct-2026): a test that wants
  // the paid fallback switches it on itself.
  "AI_TTS_PAID",
  "AI_DAILY_TOKEN_BUDGET",
  "GROQ_TTS_MODEL",
  "GROQ_TTS_VOICE_FEMALE",
  "GROQ_TTS_VOICE_MALE",
  "GROQ_DAILY_TOKEN_BUDGET",
] as const;
const saved = Object.fromEntries(SETTINGS.map((name) => [name, process.env[name]]));

/** Stand-ins, never real keys. */
const GEMINI_KEY = "test-key";
const OPENAI_KEY = "sk-test-stand-in-0000000000000000";
const GROQ_KEY = "gsk_test_stand_in_000000000000";

const GOOGLE = "https://generativelanguage.googleapis.com/v1beta/interactions";
const OPENAI_SPEECH = "https://api.openai.com/v1/audio/speech";
const GROQ_SPEECH = "https://api.groq.com/openai/v1/audio/speech";

// ---------------------------------------------------------------------------
// the services, stood in for

interface Seen {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
  signal: AbortSignal | null;
}

const realFetch = globalThis.fetch;
let seen: Seen[] = [];

function standIn(handler: (req: Seen, n: number) => Response | Promise<Response>): void {
  seen = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const req: Seen = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null,
      signal: init?.signal ?? null,
    };
    seen.push(req);
    return handler(req, seen.length);
  }) as typeof fetch;
}

const isGoogle = (req: Seen): boolean => req.url === GOOGLE;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

/** A WAV of 16-bit mono samples; written as a stream (its sizes "unknown") when asked. */
function wav(samples: Buffer, { rate = 24000, streaming = false }: { rate?: number; streaming?: boolean } = {}): Buffer {
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0);
  fmt.writeUInt16LE(1, 2);
  fmt.writeUInt32LE(rate, 4);
  fmt.writeUInt32LE(rate * 2, 8);
  fmt.writeUInt16LE(2, 12);
  fmt.writeUInt16LE(16, 14);
  const head = (id: string, size: number) => {
    const b = Buffer.alloc(8);
    b.write(id, 0, "latin1");
    b.writeUInt32LE(size, 4);
    return b;
  };
  const body = Buffer.concat([Buffer.from("WAVE", "latin1"), head("fmt ", 16), fmt, head("data", streaming ? 0xffffffff : samples.length), samples]);
  return Buffer.concat([head("RIFF", streaming ? 0xffffffff : body.length), body]);
}

const pcm = (...values: number[]): Buffer => {
  const b = Buffer.alloc(values.length * 2);
  values.forEach((v, i) => b.writeInt16LE(v, i * 2));
  return b;
};

const samplesOf = (clip: Buffer): Buffer => {
  const info = parseWav(clip);
  return clip.subarray(info.dataOffset, info.dataOffset + info.dataLength);
};

/** Google's answer: an interaction whose steps are these. */
const interaction = (...steps: unknown[]): Response => json({ id: "v1_stand-in", status: "completed", steps });
const userStep = { type: "user_input", content: [{ type: "text", text: "the line" }] };
const audioStep = (...clips: Buffer[]) => ({ type: "model_output", content: clips.map((c) => ({ type: "audio", data: c.toString("base64") })) });
/** Google's answer to a line: the clip, as it documents it. */
const spoken = (clip: Buffer): Response => interaction(userStep, audioStep(clip));
/** Google's error answer. */
const googleError = (status: number, code: string, message: string, details: unknown[] = []): Response => json({ error: { code: status, message, status: code, details } }, status);

/** ChatGPT's (or Groq's) voice answering a line. */
const audio = (clip: Buffer): Response => new Response(new Uint8Array(clip), { status: 200, headers: { "content-type": "audio/wav" } });

/** Everything written to the console while `work` runs, as the log would show it. */
async function logged(work: () => Promise<unknown>): Promise<string[]> {
  const lines: string[] = [];
  const real = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  for (const method of ["log", "info", "warn", "error"] as const) {
    console[method] = (...args: unknown[]) => {
      lines.push(format(...args));
    };
  }
  try {
    await work();
  } finally {
    Object.assign(console, real);
  }
  return lines;
}

/** What the speech request asked for, by its parts. */
const speechOf = (n = 0) =>
  seen[n]?.body as { model: string; input: { content: { text: string; annotations: { style: string }[] }[] }[]; generation_config: { speech_config: { voice: string }[] } };

beforeEach(() => {
  for (const name of SETTINGS) delete process.env[name];
  resetAiStateForTests();
  // No test reaches the network: one that forgot to stand a service in gets this, not the internet.
  standIn((req) => {
    throw new Error(`No network in a unit test: ${req.url}`);
  });
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const name of SETTINGS) {
    const value = saved[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  resetAiStateForTests();
});

// ---------------------------------------------------------------------------

describe("the request, exactly as Google documents it (Oct-2026)", () => {
  it("POST /v1beta/interactions: the key in x-goog-api-key only, the line verbatim with its style, Mitra's voice, audio back", async () => {
    process.env.GEMINI_API_KEY = GEMINI_KEY;
    standIn(() => spoken(wav(pcm(1, 2, 3))));
    const line = "Good morning, Heena. The Line Clearance Checklist is due today.";
    const made = await aiSpeakClip({ text: line, voice: "female" });
    assert.equal(made.engine, "gemini");
    assert.equal(made.model, "gemini-3.8-flash-tts");
    assert.deepEqual(samplesOf(made.clip), pcm(1, 2, 3));
    assert.equal(seen.length, 1, "the whole line in one call");
    const [req] = seen;
    assert.equal(GEMINI_INTERACTIONS_URL, GOOGLE);
    assert.equal(req.url, GOOGLE);
    assert.equal(req.method, "POST");
    assert.equal(req.headers["x-goog-api-key"], GEMINI_KEY);
    assert.equal(req.headers["content-type"], "application/json");
    assert.equal("authorization" in req.headers, false, "Google's header, never a Bearer");
    assert.ok(!req.url.includes(GEMINI_KEY), "never in the address");
    assert.ok(req.signal instanceof AbortSignal, "a call that hangs gives up, as the other voices' do");
    assert.deepEqual(req.body, {
      model: "gemini-3.8-flash-tts",
      input: [{ type: "user_input", content: [{ type: "text", text: line, annotations: [{ type: "speech_metadata", style: GEMINI_STYLE.en }] }] }],
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice: "Sulafat" }] },
    });
  });

  it("Mitra's male voice is Achird; a Gujarati or Hindi line is told so in its style; each setting changes its part", async () => {
    process.env.GEMINI_API_KEY = GEMINI_KEY;
    standIn(() => spoken(wav(pcm(1))));
    await aiSpeak({ text: "Your record is due.", voice: "male" });
    assert.equal(speechOf().generation_config.speech_config[0].voice, "Achird");
    assert.equal(speechOf().input[0].content[0].annotations[0].style, GEMINI_STYLE.en);

    const gujarati = "તમારું F/HR/17 આજે બાકી છે.";
    standIn(() => spoken(wav(pcm(1))));
    await aiSpeak({ text: gujarati, voice: "female" });
    assert.equal(speechOf().input[0].content[0].annotations[0].style, GEMINI_STYLE.gu);
    assert.equal(speechOf().input[0].content[0].text, gujarati, "the words verbatim: Gemini hears the language itself");
    standIn(() => spoken(wav(pcm(1))));
    await aiSpeak({ text: "आपका रिकॉर्ड आज बाकी है।", voice: "female" });
    assert.equal(speechOf().input[0].content[0].annotations[0].style, GEMINI_STYLE.hi);

    assert.match(GEMINI_STYLE.en, /natural everyday English with an Indian accent/);
    assert.match(GEMINI_STYLE.hi, /natural everyday Hindi as a native speaker/);
    assert.match(GEMINI_STYLE.gu, /natural everyday Gujarati as a native speaker from Gujarat/);
    for (const style of Object.values(GEMINI_STYLE)) {
      assert.match(style, /^Warm, friendly and fluent, like a helpful colleague at a printing plant in Gujarat, India: /);
      assert.match(style, /at a natural conversational pace - never slow, never robotic\.$/, "the owner found the voice 'very slow speaking'");
    }

    Object.assign(process.env, { GEMINI_TTS_MODEL: "gemini-3.8-flash-lite-tts", GEMINI_TTS_VOICE_FEMALE: "Kore", GEMINI_TTS_VOICE_MALE: "Puck" });
    assert.equal(geminiTtsModel(), "gemini-3.8-flash-lite-tts");
    assert.equal(geminiVoiceName("female"), "Kore");
    standIn(() => spoken(wav(pcm(1))));
    const made = await aiSpeakClip({ text: "Hello.", voice: "male" });
    assert.equal(made.model, "gemini-3.8-flash-lite-tts");
    assert.equal(speechOf().model, "gemini-3.8-flash-lite-tts");
    assert.equal(speechOf().generation_config.speech_config[0].voice, "Puck");
  });

  it("without GEMINI_API_KEY nothing goes to Google: ChatGPT's voice, exactly as before (a blank key is no key; AI_TTS_PAID on, §122)", async () => {
    process.env.CHATGPT_API_KEY = OPENAI_KEY;
    process.env.AI_TTS_PAID = "1";
    process.env.GEMINI_API_KEY = "   ";
    assert.equal(geminiConfigured(), false);
    standIn(() => audio(wav(pcm(1))));
    const made = await aiSpeakClip({ text: "Hello.", voice: "female" });
    assert.equal(made.engine, "openai");
    assert.deepEqual(
      seen.map((r) => r.url),
      [OPENAI_SPEECH]
    );
  });
});

describe("the clip in Google's answer", () => {
  it("a WAV from base64: the same samples, its sizes written out when it came as a stream", async () => {
    process.env.GEMINI_API_KEY = GEMINI_KEY;
    standIn(() => spoken(wav(pcm(5, 6, 7, 8), { streaming: true })));
    const clip = await aiSpeak({ text: "Hello.", voice: "female" });
    assert.equal(parseWav(clip).sampleRate, 24000);
    assert.deepEqual(samplesOf(clip), pcm(5, 6, 7, 8));
    assert.equal(clip.readUInt32LE(4), clip.length - 8, "the RIFF size written, not a stream's 'unknown'");
    assert.ok(wavOfAudio(wav(pcm(1, 2))).equals(wav(pcm(1, 2))), "a WAV that says its sizes goes on as it came");
  });

  it("raw 16-bit PCM (audio/l16) is given a WAV header: 24 kHz, mono, 16-bit, a trailing odd byte dropped", async () => {
    process.env.GEMINI_API_KEY = GEMINI_KEY;
    const raw = Buffer.concat([pcm(100, -100, 200), Buffer.from([1])]);
    standIn(() => interaction(userStep, { type: "model_output", content: [{ type: "audio", data: raw.toString("base64") }] }));
    const clip = await aiSpeak({ text: "Hello.", voice: "female" });
    const info = parseWav(clip);
    assert.deepEqual([info.audioFormat, info.channels, info.sampleRate, info.bitsPerSample], [1, 1, 24000, 16]);
    assert.deepEqual(samplesOf(clip), pcm(100, -100, 200));
  });

  it("the clip is the LAST audio item of the model_output steps, as Google's own example reads it", async () => {
    const [a, b, c] = [wav(pcm(1)), wav(pcm(2)), wav(pcm(3))];
    const answer = {
      steps: [
        userStep,
        audioStep(a),
        { type: "thought", content: [{ type: "audio", data: wav(pcm(9)).toString("base64") }] },
        { type: "model_output", content: [{ type: "audio", data: b.toString("base64") }, { type: "text", text: "Here it is." }, { type: "audio", data: c.toString("base64") }] },
        { type: "model_output", content: [{ type: "text", text: "no audio in this one" }] },
      ],
    };
    assert.deepEqual(audioOfAnswer(answer), c);
    process.env.GEMINI_API_KEY = GEMINI_KEY;
    standIn(() => json(answer));
    assert.deepEqual(samplesOf(await aiSpeak({ text: "Hello.", voice: "female" })), pcm(3));
    for (const none of [{ steps: [userStep] }, { steps: [{ type: "model_output", content: [{ type: "audio", data: "" }] }] }, { steps: "x" }, {}, null, 7]) {
      assert.equal(audioOfAnswer(none), null, JSON.stringify(none));
    }
  });

  it("an answer with no audio, one that cannot be read, or audio that is no WAV: a passing failure", async () => {
    process.env.GEMINI_API_KEY = GEMINI_KEY;
    standIn(() => interaction(userStep, { type: "model_output", content: [{ type: "text", text: "I can't say that." }] }));
    await assert.rejects(aiSpeak({ text: "Hello.", voice: "female" }), (err: unknown) => err instanceof AiRequestError && /no audio/.test(err.message));
    assert.equal(geminiRest()?.lasting, false);
    resetAiStateForTests();
    standIn(() => new Response("<html>a proxy's page</html>", { status: 200, headers: { "content-type": "text/html" } }));
    await assert.rejects(aiSpeak({ text: "Hello.", voice: "female" }), (err: unknown) => err instanceof AiRequestError && /could not be read/.test(err.message));
    resetAiStateForTests();
    standIn(() => interaction(audioStep(Buffer.from("RIFF\u0000\u0000\u0000\u0000WAVEjunk", "latin1"))));
    await assert.rejects(aiSpeak({ text: "Hello.", voice: "female" }), (err: unknown) => err instanceof AiRequestError && /not a WAV/.test(err.message));
  });
});

describe("when Gemini cannot speak", () => {
  it("429 with AI_TTS_PAID on: ChatGPT's voice says the line at once, and Gemini rests as long as Google asks", async () => {
    process.env.GEMINI_API_KEY = GEMINI_KEY;
    process.env.CHATGPT_API_KEY = OPENAI_KEY;
    process.env.AI_TTS_PAID = "1"; // §122: the owner switched the paid fallback on — yesterday's behaviour exactly.
    const retry = [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "41s" }];
    standIn((req) => (isGoogle(req) ? googleError(429, "RESOURCE_EXHAUSTED", "You exceeded your current quota. Please retry in 41.2s.", retry) : audio(wav(pcm(4, 4)))));
    const started = Date.now();
    const lines = await logged(async () => {
      const made = await aiSpeakClip({ text: "Your record is due today.", voice: "female" });
      assert.equal(made.engine, "openai");
      assert.equal(made.model, "gpt-4o-mini-tts");
      assert.deepEqual(samplesOf(made.clip), pcm(4, 4));
    });
    assert.deepEqual(
      seen.map((r) => r.url),
      [GOOGLE, OPENAI_SPEECH],
      "Google once — a 429 is not waited out — then ChatGPT's voice"
    );
    assert.deepEqual(seen[1].body, { model: "gpt-4o-mini-tts", input: "Your record is due today.", voice: "coral", instructions: SPEECH_INSTRUCTIONS.en, response_format: "wav" });
    assert.ok(Date.now() - started < 1000, "not waited out");
    const rest = geminiRest();
    assert.equal(rest?.status, 429);
    assert.equal(rest?.lasting, false);
    assert.ok(rest && Math.abs(rest.until - started - 41_000) < 2000, `as long as Google asked: ${rest?.until} vs ${started}`);
    assert.ok(
      lines.some((l) => /Google's Gemini could not say a line, so ChatGPT's voice \(OpenAI\) says it; Gemini is asked again in 4[01] seconds\. Gemini speech request failed \(429, RESOURCE_EXHAUSTED\)/.test(l)),
      lines.join("\n")
    );

    // While Gemini rests the next line goes straight to ChatGPT's voice — and the route looks for its clip under that voice.
    assert.equal(speechEngine(), "openai");
    standIn((req) => (isGoogle(req) ? googleError(500, "INTERNAL", "never asked") : audio(wav(pcm(5)))));
    assert.equal((await aiSpeakClip({ text: "The next line.", voice: "female" })).engine, "openai");
    assert.deepEqual(
      seen.map((r) => r.url),
      [OPENAI_SPEECH]
    );
    assert.equal(speechEngine(started + 43_000), "gemini", "Gemini speaks first again once its rest is over");
  });

  it("§122, the default: with the ChatGPT key beside Gemini's, a passing failure never falls back to the paid voice — the error reaches the caller", async () => {
    // "i want all free" (the owner, 24-Oct-2026): no AI_TTS_PAID, so api.openai.com is never asked to speak, and the
    // browser's own voice says the line when Gemini cannot.
    process.env.GEMINI_API_KEY = GEMINI_KEY;
    process.env.CHATGPT_API_KEY = OPENAI_KEY;
    standIn(() => spoken(wav(pcm(7))));
    assert.equal((await aiSpeakClip({ text: "Hello.", voice: "female" })).engine, "gemini", "Gemini speaks as before");
    for (const [status, code] of [
      [429, "RESOURCE_EXHAUSTED"],
      [503, "UNAVAILABLE"],
    ] as const) {
      resetAiStateForTests();
      standIn((req) => (isGoogle(req) ? googleError(status, code, "Cannot just now.") : audio(wav(pcm(9)))));
      await assert.rejects(aiSpeak({ text: "Your record is due.", voice: "female" }), (err: unknown) => err instanceof AiRequestError && err.status === status, String(status));
      assert.deepEqual(
        seen.map((r) => r.url),
        [GOOGLE],
        `no POST to api.openai.com after a ${status}`
      );
    }
    assert.equal(voiceConfigured(), true, "Gemini is a voice; the GET never says not-configured here");
    assert.equal(tokensUsedToday(), 0, "nothing paid, nothing counted");
  });

  it("429 with no other voice: an ordinary failure for the route (502), and the free tier's DAY used up rests Gemini ten minutes", async () => {
    process.env.GEMINI_API_KEY = GEMINI_KEY;
    const perDay = [
      { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests", quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "21s" },
    ];
    standIn(() => googleError(429, "RESOURCE_EXHAUSTED", "You exceeded your current quota.", perDay));
    const started = Date.now();
    let caught: unknown = null;
    try {
      await aiSpeak({ text: "Hello.", voice: "female" });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof AiRequestError && caught.status === 429, String(caught));
    assert.equal((caught as { code?: unknown }).code, undefined, "not the paid key's daily allowance");
    const answered = speakFailure(caught);
    assert.equal(answered.status, 502);
    assert.equal(answered.body.code, "failed");
    const rest = geminiRest();
    assert.ok(rest && Math.abs(rest.until - started - GEMINI_LASTING_REST_MS) < 2000, "the day's limit is not over in 21 seconds");
    // Resting: Google is not asked, and it is still a passing failure.
    assert.equal(speechEngine(), "gemini", "the only voice there is");
    standIn(() => {
      throw new Error("never asked");
    });
    await assert.rejects(aiSpeak({ text: "Hello again.", voice: "female" }), (err: unknown) => err instanceof AiRequestError && err.status === 429 && /resting/.test(err.message));
    assert.equal(seen.length, 0);
  });

  it("403: remembered — Google not asked again for ten minutes; with no other voice, the route's voice-unavailable, in words for the admin", async () => {
    process.env.GEMINI_API_KEY = GEMINI_KEY;
    standIn(() => googleError(403, "PERMISSION_DENIED", "Method doesn't allow unregistered callers."));
    const started = Date.now();
    await assert.rejects(
      aiSpeak({ text: "Hello.", voice: "female" }),
      (err: unknown) => err instanceof VoiceUnavailableError && err.service === "gemini" && err.model === "gemini-3.8-flash-tts" && /403, PERMISSION_DENIED/.test(err.message)
    );
    assert.equal(seen.length, 1);
    const rest = geminiRest();
    assert.equal(rest?.lasting, true);
    assert.ok(rest && Math.abs(rest.until - started - 10 * 60 * 1000) < 2000);
    assert.ok(geminiRest(started + 9 * 60 * 1000), "still resting after nine minutes");
    assert.equal(geminiRest(started + 10 * 60 * 1000 + 2000), null, "asked again after ten: the key may have been put right");
    for (let i = 0; i < 3; i++) {
      await assert.rejects(aiSpeak({ text: `Line ${i}.`, voice: "female" }), (err: unknown) => err instanceof VoiceUnavailableError && err.service === "gemini");
    }
    assert.equal(seen.length, 1, "Google asked once in all");
    const answered = speakFailure(new VoiceUnavailableError("gemini-3.8-flash-tts", "gemini", "Gemini speech request failed (403, PERMISSION_DENIED): unregistered callers"));
    assert.equal(answered.status, 503);
    assert.equal(answered.body.code, "voice-unavailable");
    assert.match(answered.body.error, /GEMINI_API_KEY at aistudio\.google\.com/);
    assert.doesNotMatch(answered.body.error, /PERMISSION_DENIED|unregistered/, "never Google's words to the browser");
  });

  it("a key Google does not take (400), 401 and no such model (404) last too; a 5xx, no answer in time and no network pass in a minute", async () => {
    process.env.GEMINI_API_KEY = GEMINI_KEY;
    for (const [status, code] of [
      [400, "INVALID_ARGUMENT"],
      [401, "UNAUTHENTICATED"],
      [404, "NOT_FOUND"],
    ] as const) {
      resetAiStateForTests();
      standIn(() => googleError(status, code, status === 400 ? "API key not valid. Please pass a valid API key." : "Refused."));
      await assert.rejects(aiSpeak({ text: "Hello.", voice: "female" }), (err: unknown) => err instanceof VoiceUnavailableError, String(status));
      assert.equal(geminiRest()?.lasting, true, String(status));
    }
    const passing: [string, () => Response][] = [
      ["500", () => googleError(500, "INTERNAL", "An internal error has occurred.")],
      ["503", () => googleError(503, "UNAVAILABLE", "The model is overloaded. Please try again later.")],
      [
        "no answer in time",
        () => {
          throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
        },
      ],
      [
        "no network",
        () => {
          throw new TypeError("fetch failed");
        },
      ],
    ];
    for (const [what, answer] of passing) {
      resetAiStateForTests();
      standIn(answer);
      const started = Date.now();
      await assert.rejects(aiSpeak({ text: "Hello.", voice: "female" }), (err: unknown) => err instanceof AiRequestError, what);
      const rest = geminiRest();
      assert.equal(rest?.lasting, false, what);
      assert.ok(rest && Math.abs(rest.until - started - GEMINI_PASSING_REST_MS) < 2000, what);
    }
  });

  it("403 with ChatGPT's key beside it (AI_TTS_PAID on): ChatGPT's voice says every line meanwhile, Google is asked once, the log says so once", async () => {
    process.env.GEMINI_API_KEY = GEMINI_KEY;
    process.env.CHATGPT_API_KEY = OPENAI_KEY;
    process.env.AI_TTS_PAID = "1";
    standIn((req) => (isGoogle(req) ? googleError(403, "PERMISSION_DENIED", "Denied.") : audio(wav(pcm(1)))));
    const lines = await logged(async () => {
      for (let i = 0; i < 3; i++) assert.equal((await aiSpeakClip({ text: `Line ${i}.`, voice: "female" })).engine, "openai");
    });
    assert.equal(seen.filter(isGoogle).length, 1);
    assert.equal(seen.length, 4);
    assert.equal(lines.filter((l) => /Gemini could not say a line/.test(l)).length, 1, lines.join("\n"));
    assert.ok(lines.some((l) => /Gemini is asked again in 10 minutes/.test(l)), lines.join("\n"));
  });

  it("both voices refused (AI_TTS_PAID on): the route hears Gemini's refusal (the free voice is the one to put right); a passing failure of either stays passing", async () => {
    process.env.GEMINI_API_KEY = GEMINI_KEY;
    process.env.CHATGPT_API_KEY = OPENAI_KEY;
    process.env.AI_TTS_PAID = "1";
    const noSpeechModel = () => json({ error: { message: "The model `gpt-4o-mini-tts` does not exist or you do not have access to it.", type: "invalid_request_error", param: null, code: "model_not_found" } }, 404);
    standIn((req) => (isGoogle(req) ? googleError(403, "PERMISSION_DENIED", "Denied.") : noSpeechModel()));
    await logged(() => assert.rejects(aiSpeak({ text: "Hello.", voice: "female" }), (err: unknown) => err instanceof VoiceUnavailableError && err.service === "gemini"));
    resetAiStateForTests();
    standIn((req) => (isGoogle(req) ? googleError(429, "RESOURCE_EXHAUSTED", "Quota.") : noSpeechModel()));
    await logged(() => assert.rejects(aiSpeak({ text: "Hello.", voice: "female" }), (err: unknown) => err instanceof AiRequestError && err.status === 429));
    resetAiStateForTests();
    standIn((req) => (isGoogle(req) ? googleError(403, "PERMISSION_DENIED", "Denied.") : json({ error: { message: "upstream" } }, 500)));
    await logged(() => assert.rejects(aiSpeak({ text: "Hello.", voice: "female" }), (err: unknown) => err instanceof AiRequestError && err.status === 500));
  });

  it("Groq's voice says English only: an English line Gemini could not say, never a Gujarati one", async () => {
    process.env.GEMINI_API_KEY = GEMINI_KEY;
    process.env.GROQ_API_KEY = GROQ_KEY;
    standIn((req) => (isGoogle(req) ? googleError(503, "UNAVAILABLE", "Overloaded.") : audio(wav(pcm(2)))));
    await logged(async () => assert.equal((await aiSpeakClip({ text: "Hello.", voice: "female" })).engine, "groq"));
    assert.deepEqual(
      seen.map((r) => r.url),
      [GOOGLE, GROQ_SPEECH]
    );
    resetAiStateForTests();
    standIn((req) => (isGoogle(req) ? googleError(503, "UNAVAILABLE", "Overloaded.") : audio(wav(pcm(2)))));
    await assert.rejects(aiSpeak({ text: "તમારું રેકોર્ડ બાકી છે.", voice: "female" }), (err: unknown) => err instanceof AiRequestError && err.status === 503);
    assert.deepEqual(
      seen.map((r) => r.url),
      [GOOGLE],
      "Groq's English voice is not asked to say Gujarati"
    );
  });
});

describe("free: nothing counted against the paid allowance", () => {
  it("a Gemini line adds no tokens; Gemini still speaks when ChatGPT's allowance is spent, and then nothing falls back to the paid voice", async () => {
    process.env.GEMINI_API_KEY = GEMINI_KEY;
    process.env.CHATGPT_API_KEY = OPENAI_KEY;
    process.env.AI_TTS_PAID = "1"; // §122: even switched on, the paid voice is held by the day's allowance below.
    standIn(() => spoken(wav(pcm(1, 2))));
    await aiSpeak({ text: "Hello Heena, your record is due.", voice: "female" });
    assert.equal(tokensUsedToday(), 0, "Gemini's voice costs nothing, so nothing is counted");

    process.env.AI_DAILY_TOKEN_BUDGET = "100";
    await logged(async () => countTokens(150));
    assert.equal(dailyBudgetSpent(), true);
    standIn(() => spoken(wav(pcm(3))));
    assert.equal((await aiSpeakClip({ text: "Hello.", voice: "female" })).engine, "gemini", "the allowance guards the paid key, not the free voice");
    standIn((req) => (isGoogle(req) ? googleError(503, "UNAVAILABLE", "Overloaded.") : audio(wav(pcm(4)))));
    await assert.rejects(aiSpeak({ text: "Hello again.", voice: "female" }), (err: unknown) => err instanceof AiRequestError && err.status === 503);
    assert.deepEqual(
      seen.map((r) => r.url),
      [GOOGLE],
      "ChatGPT's voice is not asked once the day's allowance is spent"
    );
    assert.equal(tokensUsedToday(), 150);
  });
});

describe("what the browser is told", () => {
  it("only GEMINI_API_KEY: no model to ask, but the voice is AVAILABLE as Google's Gemini voice, with its voices", async () => {
    process.env.GEMINI_API_KEY = GEMINI_KEY;
    assert.equal(aiConfigured(), false);
    assert.equal(aiProviderName(), null);
    assert.equal(voiceConfigured(), true);
    assert.equal(speechEngine(), "gemini");
    assert.deepEqual(speechSetup("gemini"), { model: "gemini-3.8-flash-tts", voices: { female: "Sulafat", male: "Achird" } });

    // As the route learns it (backend/index.ts probeVoice): one short line, and then the GET's answer.
    standIn(() => spoken(wav(pcm(1))));
    const said = await aiSpeakClip({ text: VOICE_PROBE_TEXT, voice: "female" });
    const learnt = new VoiceAvailability();
    learnt.markAvailable(said.model, Date.now(), said.engine);
    const status = voiceStatus(learnt.current());
    assert.deepEqual(
      { available: status.available, code: status.code, engine: status.engine, model: status.model, voices: status.voices },
      { available: true, code: "available", engine: "gemini", model: "gemini-3.8-flash-tts", voices: { female: "Sulafat", male: "Achird" } }
    );
    assert.equal(status.message, "Mitra speaks with Google's Gemini voice, made on this server.");
    assert.ok(status.recheckAfterMs > 59 * 60 * 1000, "kept for the hour, as any working voice");
    assert.ok(!JSON.stringify(status).includes(GEMINI_KEY), "whether, never the key");

    // Nothing learnt: "failed", in Google's words. Refused: what the admin must do, still with Gemini's voices.
    assert.match(voiceStatus(null).message, /^Google's Gemini voice could not be reached just now/);
    learnt.markUnavailable("gemini-3.8-flash-tts", Date.now(), "gemini");
    const refused = voiceStatus(learnt.current());
    assert.equal(refused.code, "voice-unavailable");
    assert.equal(refused.message, voiceUnavailableMessage("gemini-3.8-flash-tts", "gemini"));
    assert.deepEqual(refused.voices, { female: "Sulafat", male: "Achird" });

    // ChatGPT's voice spoke last (Gemini resting; a state only AI_TTS_PAID allows, §122): the answer names it, with its own voices.
    process.env.CHATGPT_API_KEY = OPENAI_KEY;
    process.env.AI_TTS_PAID = "1";
    learnt.markAvailable("gpt-4o-mini-tts", Date.now(), "openai");
    const other = voiceStatus(learnt.current());
    assert.deepEqual({ engine: other.engine, voices: other.voices }, { engine: "openai", voices: { female: "coral", male: "ash" } });

    // No key for either: not configured, as it always was.
    delete process.env.GEMINI_API_KEY;
    delete process.env.CHATGPT_API_KEY;
    assert.equal(voiceConfigured(), false);
    assert.equal(speechEngine(), null);
    const none = voiceStatus(null);
    assert.equal(none.code, "not-configured");
    assert.equal(none.voices, null);
  });

  it("on a ChatGPT key alone with AI_TTS_PAID on, the answer is exactly the one it always was", () => {
    process.env.CHATGPT_API_KEY = OPENAI_KEY;
    process.env.AI_TTS_PAID = "1"; // Without it the key is no voice at all (§122): backend/tests/ai.test.ts proves that side.
    assert.equal(speechEngine(), "openai");
    const coral = { female: "coral", male: "ash" };
    const learnt = new VoiceAvailability();
    learnt.markAvailable("gpt-4o-mini-tts", 0, "openai");
    assert.deepEqual(voiceStatus(learnt.current(1000), 1000), speakStatus("available", "gpt-4o-mini-tts", coral, 1000, VOICE_RECHECK_MS.available, "openai"));
    assert.deepEqual(voiceStatus(null, 1000), speakStatus("failed", "gpt-4o-mini-tts", coral, 1000, undefined, "openai"));
    learnt.markUnavailable("gpt-4o-mini-tts", 0, "openai");
    assert.deepEqual(voiceStatus(learnt.current(1000), 1000), speakStatus("voice-unavailable", "gpt-4o-mini-tts", coral, 1000, VOICE_RECHECK_MS["voice-unavailable"], "openai"));
  });

  it("features.voice is true only when a voice may actually speak (§122): a Gemini key, a Groq key, or an AI key with AI_TTS_PAID on", async () => {
    // A fresh features.ts for each set of keys: it reads them once, as it is loaded (so a changed .env needs a restart).
    const fresh = async (label: string) => ((await import(new URL(`../features.ts?${label}`, import.meta.url).href)) as typeof import("../features.ts")).FEATURES;
    process.env.GEMINI_API_KEY = GEMINI_KEY;
    const gemini = await fresh("gemini-only");
    assert.equal(gemini.voice, true);
    assert.equal(gemini.assistant, false, "a Gemini key is a voice, not a model to ask");
    assert.ok(!JSON.stringify(gemini).includes(GEMINI_KEY), "whether, never the key");
    delete process.env.GEMINI_API_KEY;

    // "i want all free" (the owner, 24-Oct-2026): ChatGPT's paid voice counts only when he set AI_TTS_PAID.
    process.env.CHATGPT_API_KEY = OPENAI_KEY;
    const chatgpt = await fresh("chatgpt-only");
    assert.deepEqual({ voice: chatgpt.voice, assistant: chatgpt.assistant }, { voice: false, assistant: true }, "a model to ask, but no voice the owner would pay for");
    process.env.AI_TTS_PAID = "1";
    const paid = await fresh("chatgpt-paid");
    assert.deepEqual({ voice: paid.voice, assistant: paid.assistant }, { voice: true, assistant: true });
    delete process.env.AI_TTS_PAID;

    process.env.GROQ_API_KEY = GROQ_KEY;
    const both = await fresh("chatgpt-and-groq");
    assert.equal(both.voice, true, "Groq's free voice may speak beside the ChatGPT key");
    delete process.env.CHATGPT_API_KEY;
    const groq = await fresh("groq-only");
    assert.deepEqual({ voice: groq.voice, assistant: groq.assistant }, { voice: true, assistant: true }, "Groq's free tier, as before §109");
    delete process.env.GROQ_API_KEY;

    const none = await fresh("no-key");
    assert.deepEqual({ voice: none.voice, assistant: none.assistant }, { voice: false, assistant: false });
    assert.deepEqual(Object.keys(none).sort(), ["assistant", "demoMode", "signup", "voice"]);
  });
});

describe("no key reaches an error or a log line", () => {
  it("a refusal that echoes the key: the log, the error and the route's answer carry no key", async () => {
    process.env.GEMINI_API_KEY = GEMINI_KEY;
    process.env.CHATGPT_API_KEY = OPENAI_KEY;
    process.env.AI_TTS_PAID = "1"; // §122: on, so the fallback's log line is written and checked for the key.
    const echoed = () => googleError(400, "INVALID_ARGUMENT", `API key not valid: ${GEMINI_KEY}. Please pass a valid API key.`);
    standIn((req) => (isGoogle(req) ? echoed() : audio(wav(pcm(1)))));
    const lines = await logged(() => aiSpeak({ text: "Hello.", voice: "female" }));
    assert.ok(lines.some((l) => /API key not valid: \[key\]/.test(l)), lines.join("\n"));
    for (const line of lines) assert.ok(!line.includes(GEMINI_KEY), line);

    delete process.env.CHATGPT_API_KEY;
    resetAiStateForTests();
    standIn(echoed);
    let caught: unknown = null;
    const more = await logged(async () => {
      try {
        await aiSpeak({ text: "Hello.", voice: "female" });
      } catch (err) {
        caught = err;
        console.error(err); // as the route does
      }
    });
    assert.ok(caught instanceof VoiceUnavailableError);
    const err = caught as VoiceUnavailableError;
    assert.ok(!err.message.includes(GEMINI_KEY) && !String(err.stack).includes(GEMINI_KEY));
    assert.ok(more.length > 0);
    for (const line of more) assert.ok(!line.includes(GEMINI_KEY), line);
    assert.ok(!JSON.stringify(speakFailure(err)).includes(GEMINI_KEY));
  });

  it("redactSecrets takes out the Gemini key and anything shaped like a Google API key", () => {
    process.env.GEMINI_API_KEY = "plain-gemini-stand-in-0042";
    assert.equal(redactSecrets("echoed plain-gemini-stand-in-0042 back"), "echoed [key] back");
    assert.equal(redactSecrets("key=AIzaTESTstandIn000000000000000000000 refused"), "key=[key] refused");
  });

  it("the unit runner blanks GEMINI_API_KEY, so no unit test speaks with the owner's key", () => {
    const unit = readFileSync(path.join(root, "scripts", "unit-tests.ts"), "utf8");
    assert.match(unit, /\bGEMINI_API_KEY: "",/);
  });
});
