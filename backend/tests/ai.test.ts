// ONE AI KEY FOR BOTH APPS (REQUIREMENTS §109): backend/ai.ts, with the AI service stood in for at the network edge.
//
// globalThis.fetch is replaced: every request is recorded (its address, its headers, its body or form) and answered
// in OpenAI's own shapes at api.openai.com (Groq's at api.groq.com for an older setup), so nothing goes out on the
// network and no real key is needed: the tests set stand-in keys of their own. What is proved: which service answers
// (the provider chosen in one place), the request shapes ChatGPT is sent (reasoning_effort "none",
// max_completion_tokens, image_url, the speech and transcription bodies), the second model when the first cannot
// answer, the daily cost guard, that no key reaches a log line, and that both test runners blank every key.
// Run: npm run test:unit -- ai
process.env.MITRA_OCR = "0";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "node:util";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  AiAllowanceError,
  AiRequestError,
  aiChatJSON,
  aiChatWithTools,
  aiConfigured,
  aiProviderName,
  aiReadPicture,
  aiSpeak,
  aiTranscribe,
  aiUsage,
  countTokens,
  dailyAllowanceUsedUp,
  dailyBudgetSpent,
  dailyTokenBudget,
  modelsFor,
  openaiReasoningEffort,
  redactSecrets,
  resetAiStateForTests,
  SPEECH_INSTRUCTIONS,
  speechLanguage,
  speechTokens,
  tokensUsedToday,
  transcribeModel,
  ttsModel,
  ttsVoiceName,
  type ToolSchema,
} from "../ai.ts";
import { readAttachment } from "../attachments.ts";
import { interpretChecklistAnswer } from "../assistant.ts";
import { readCv } from "../cvExtract.ts";
import { runAgentStep, setAgentTransportForTests, TRANSCRIBE_PROMPT, validateAgentRequest } from "../mitraAgent.ts";
import { parseWav, VoiceUnavailableError } from "../tts.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---------------------------------------------------------------------------
// the environment, set test by test and put back after

const SETTINGS = [
  "CHATGPT_API_KEY",
  "OPENAI_API_KEY",
  "GROQ_API_KEY",
  "AI_CHAT_MODEL",
  "AI_AGENT_MODEL",
  "AI_SHORT_MODEL",
  "AI_VISION_MODEL",
  "AI_FALLBACK_MODEL",
  "AI_TRANSCRIBE_MODEL",
  "AI_TTS_MODEL",
  "AI_TTS_VOICE_FEMALE",
  "AI_TTS_VOICE_MALE",
  "AI_DAILY_TOKEN_BUDGET",
  "GROQ_MODEL",
  "GROQ_AGENT_MODEL",
  "GROQ_DAILY_TOKEN_BUDGET",
  "PICTURES_READ_WITH_ASSISTANT",
  // Google's free voice (23-Oct-2026, backend/geminiSpeech.ts): unset here, so every voice below is the AI service's.
  "GEMINI_API_KEY",
  "GEMINI_TTS_MODEL",
  "GEMINI_TTS_VOICE_FEMALE",
  "GEMINI_TTS_VOICE_MALE",
] as const;
const saved = Object.fromEntries(SETTINGS.map((name) => [name, process.env[name]]));

/** A stand-in, never a real key: shaped like OpenAI's so the redaction is tested on the real shape. */
const OPENAI_KEY = "sk-test-stand-in-0000000000000000";
const GROQ_KEY = "gsk_test_stand_in_000000000000";

function onChatGPT(more: Partial<Record<(typeof SETTINGS)[number], string>> = {}): void {
  process.env.CHATGPT_API_KEY = OPENAI_KEY;
  Object.assign(process.env, more);
}

function onGroq(more: Partial<Record<(typeof SETTINGS)[number], string>> = {}): void {
  process.env.GROQ_API_KEY = GROQ_KEY;
  Object.assign(process.env, more);
}

// ---------------------------------------------------------------------------
// the service, stood in for

interface Seen {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
  form: Record<string, string> | null;
}

const realFetch = globalThis.fetch;
let seen: Seen[] = [];

function standIn(handler: (req: Seen, n: number) => Response | Promise<Response>): void {
  seen = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    let body: Record<string, unknown> | null = null;
    let form: Record<string, string> | null = null;
    if (init?.body instanceof FormData) {
      form = {};
      for (const [k, v] of init.body.entries()) form[k] = typeof v === "string" ? v : `[file ${v.name} ${v.type} ${v.size}]`;
    } else if (typeof init?.body === "string") {
      body = JSON.parse(init.body) as Record<string, unknown>;
    }
    const req: Seen = { url: String(input), method: init?.method ?? "GET", headers, body, form };
    seen.push(req);
    return handler(req, seen.length);
  }) as typeof fetch;
}

/** The form the n-th request sent (a function, so an earlier assertion's narrowing does not stick to it). */
const formOf = (n = 0): Record<string, string> => seen[n]?.form ?? {};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

/** A chat completion as OpenAI answers it. */
const completion = (content: string | null, message: Record<string, unknown> = {}, totalTokens = 120): Response =>
  json({
    id: "chatcmpl-stand-in",
    object: "chat.completion",
    model: "gpt-5.4-mini",
    choices: [{ index: 0, message: { role: "assistant", content, ...message }, finish_reason: "stop" }],
    usage: { prompt_tokens: totalTokens - 20, completion_tokens: 20, total_tokens: totalTokens },
  });

const openaiError = (status: number, error: Record<string, unknown>): Response => json({ error: { type: "invalid_request_error", param: null, code: null, ...error } }, status);

/** A WAV of `seconds` of silence, written as a stream (its sizes "unknown"), as a service may send it. */
function wav(seconds: number, streaming = false, rate = 24000): Buffer {
  const data = Buffer.alloc(Math.round(seconds * rate) * 2);
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
  const body = Buffer.concat([Buffer.from("WAVE", "latin1"), head("fmt ", 16), fmt, head("data", streaming ? 0xffffffff : data.length), data]);
  return Buffer.concat([head("RIFF", streaming ? 0xffffffff : body.length), body]);
}

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

beforeEach(() => {
  for (const name of SETTINGS) delete process.env[name];
  resetAiStateForTests();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setAgentTransportForTests(null);
  for (const name of SETTINGS) {
    const value = saved[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  resetAiStateForTests();
});

// ---------------------------------------------------------------------------

describe("which service answers: chosen in one place (REQUIREMENTS §109)", () => {
  it("ChatGPT (OpenAI) when CHATGPT_API_KEY is set, even with a Groq key beside it", () => {
    onChatGPT();
    onGroq();
    assert.equal(aiProviderName(), "openai");
    assert.equal(aiConfigured(), true);
  });

  it("OPENAI_API_KEY is the same key under OpenAI's own name", () => {
    process.env.OPENAI_API_KEY = OPENAI_KEY;
    assert.equal(aiProviderName(), "openai");
  });

  it("Groq only on a server with no OpenAI key (an older setup)", () => {
    onGroq();
    assert.equal(aiProviderName(), "groq");
  });

  it("none without a key; a blank or spaces-only key is no key", () => {
    assert.equal(aiProviderName(), null);
    assert.equal(aiConfigured(), false);
    process.env.CHATGPT_API_KEY = "";
    process.env.OPENAI_API_KEY = "   ";
    process.env.GROQ_API_KEY = "";
    assert.equal(aiProviderName(), null);
    assert.equal(aiConfigured(), false);
  });

  it("both test runners blank every name a key goes by, so no suite and no unit test makes a paid call", () => {
    const e2e = readFileSync(path.join(root, "scripts", "run-e2e.ts"), "utf8");
    const unit = readFileSync(path.join(root, "scripts", "unit-tests.ts"), "utf8");
    for (const name of ["CHATGPT_API_KEY", "OPENAI_API_KEY", "GROQ_API_KEY"]) {
      assert.match(e2e, new RegExp(`\\b${name}: "",`), `scripts/run-e2e.ts blanks ${name}`);
      assert.match(unit, new RegExp(`\\b${name}: "",`), `scripts/unit-tests.ts blanks ${name}`);
    }
    assert.match(e2e, /PICTURES_READ_WITH_ASSISTANT: "0",/, "pictures are read by OCR on the test servers");
    assert.match(e2e, /CV_READ_WITH_ASSISTANT: "0",/);
  });
});

describe("the models and settings: the brief's defaults, each overridable", () => {
  it("ChatGPT: gpt-5.4-mini for the chat, the agent and pictures; gpt-5.4-nano for short jobs; gpt-4.1-mini second", () => {
    onChatGPT();
    assert.deepEqual(modelsFor("chat"), { model: "gpt-5.4-mini", fallback: "gpt-4.1-mini" });
    assert.deepEqual(modelsFor("agent"), { model: "gpt-5.4-mini", fallback: "gpt-4.1-mini" });
    assert.deepEqual(modelsFor("short"), { model: "gpt-5.4-nano", fallback: "gpt-4.1-mini" });
    assert.deepEqual(modelsFor("vision"), { model: "gpt-5.4-mini", fallback: "gpt-4.1-mini" });
    assert.equal(transcribeModel(), "gpt-4o-mini-transcribe");
    assert.equal(ttsModel(), "gpt-4o-mini-tts");
    assert.equal(ttsVoiceName("female"), "coral");
    assert.equal(ttsVoiceName("male"), "ash");
    assert.equal(dailyTokenBudget(), 3_000_000);
  });

  it("every one changes with its setting; AI_AGENT_MODEL follows AI_CHAT_MODEL unless set; AI_FALLBACK_MODEL=none, no second model", () => {
    onChatGPT({ AI_CHAT_MODEL: "gpt-4.1-mini", AI_SHORT_MODEL: "gpt-4.1-nano", AI_VISION_MODEL: "gpt-4.1", AI_FALLBACK_MODEL: "none" });
    assert.deepEqual(modelsFor("chat"), { model: "gpt-4.1-mini", fallback: null });
    assert.deepEqual(modelsFor("agent"), { model: "gpt-4.1-mini", fallback: null });
    assert.deepEqual(modelsFor("short"), { model: "gpt-4.1-nano", fallback: null });
    assert.deepEqual(modelsFor("vision"), { model: "gpt-4.1", fallback: null });
    process.env.AI_AGENT_MODEL = "gpt-5-mini";
    process.env.AI_FALLBACK_MODEL = "gpt-4.1-mini";
    assert.deepEqual(modelsFor("agent"), { model: "gpt-5-mini", fallback: "gpt-4.1-mini" });
    assert.deepEqual(modelsFor("chat"), { model: "gpt-4.1-mini", fallback: null }, "no second model that is the first");
    Object.assign(process.env, { AI_TRANSCRIBE_MODEL: "gpt-4o-transcribe", AI_TTS_MODEL: "tts-1", AI_TTS_VOICE_FEMALE: "nova", AI_TTS_VOICE_MALE: "onyx", AI_DAILY_TOKEN_BUDGET: "500000" });
    assert.equal(transcribeModel(), "gpt-4o-transcribe");
    assert.equal(ttsModel(), "tts-1");
    assert.equal(ttsVoiceName("female"), "nova");
    assert.equal(ttsVoiceName("male"), "onyx");
    assert.equal(dailyTokenBudget(), 500_000);
  });

  it("Groq keeps its own settings and defaults, as before §109", () => {
    onGroq();
    assert.deepEqual(modelsFor("chat"), { model: "openai/gpt-oss-120b", fallback: null });
    process.env.GROQ_AGENT_MODEL = "openai/gpt-oss-20b";
    assert.equal(modelsFor("agent").model, "openai/gpt-oss-20b");
    assert.equal(transcribeModel(), "whisper-large-v3");
    assert.equal(ttsModel(), "canopylabs/orpheus-v1-english");
    assert.equal(ttsVoiceName("female"), "hannah");
    assert.equal(dailyTokenBudget(), 200_000);
    process.env.GROQ_DAILY_TOKEN_BUDGET = "150000";
    assert.equal(dailyTokenBudget(), 150_000);
    process.env.AI_DAILY_TOKEN_BUDGET = "90000";
    assert.equal(dailyTokenBudget(), 90_000, "AI_DAILY_TOKEN_BUDGET holds whichever service answers");
  });

  it("each model is sent the least reasoning its family takes, so it answers at once and may call tools", () => {
    for (const m of ["gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.4", "gpt-5.5", "gpt-5.6-luna", "gpt-6-luna", "GPT-5.4-mini"]) assert.equal(openaiReasoningEffort(m), "none", m);
    for (const m of ["gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-5-mini-2025-08-07"]) assert.equal(openaiReasoningEffort(m), "minimal", m);
    for (const m of ["o3", "o4-mini"]) assert.equal(openaiReasoningEffort(m), "low", m);
    for (const m of ["gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o-mini", "gpt-5-chat-latest"]) assert.equal(openaiReasoningEffort(m), null, m);
  });
});

describe("the request shapes ChatGPT is sent (api.openai.com)", () => {
  it("the chat: gpt-5.4-mini, reasoning_effort none, max_completion_tokens (never max_tokens), JSON, the history between", async () => {
    onChatGPT();
    standIn(() => completion('{"action":"reply","reply":"Namaste"}'));
    const out = await aiChatJSON({
      system: "S",
      user: "U",
      history: [
        { role: "user", text: "a" },
        { role: "assistant", text: "b" },
      ],
      reasoningEffort: "medium",
      maxTokens: 4000,
    });
    assert.deepEqual(out, { action: "reply", reply: "Namaste" });
    assert.equal(seen.length, 1);
    const [req] = seen;
    assert.equal(req.url, "https://api.openai.com/v1/chat/completions");
    assert.equal(req.method, "POST");
    assert.equal(req.headers.authorization, `Bearer ${OPENAI_KEY}`);
    assert.equal(req.headers["content-type"], "application/json");
    const body = req.body as Record<string, unknown>;
    assert.equal(body.model, "gpt-5.4-mini");
    assert.equal(body.reasoning_effort, "none", "never the Groq effort the caller named");
    assert.equal(body.max_completion_tokens, 4000);
    assert.equal("max_tokens" in body, false);
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.equal(body.temperature, 0.2);
    assert.deepEqual(body.messages, [
      { role: "system", content: "S" },
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "U" },
    ]);
    assert.equal("tools" in body, false);
  });

  it("the agent's round: the tools, tool_choice auto, reasoning none, and the calls handed back", async () => {
    onChatGPT();
    const tools: ToolSchema[] = [{ type: "function", function: { name: "navigate", description: "Open an app route.", parameters: { type: "object", properties: { route: { type: "string" } }, required: ["route"] } } }];
    standIn(() =>
      completion(null, { tool_calls: [{ id: "call_1", type: "function", function: { name: "navigate", arguments: '{"route":"/insights"}' } }] })
    );
    const reply = await aiChatWithTools({ system: "SYS", messages: [{ role: "user", content: "open insights" }], tools, maxTokens: 1200 });
    assert.deepEqual(reply, { content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "navigate", arguments: '{"route":"/insights"}' } }] });
    const body = seen[0].body as Record<string, unknown>;
    assert.equal(seen[0].url, "https://api.openai.com/v1/chat/completions");
    assert.equal(body.model, "gpt-5.4-mini");
    assert.equal(body.reasoning_effort, "none");
    assert.deepEqual(body.tools, tools);
    assert.equal(body.tool_choice, "auto");
    assert.equal(body.parallel_tool_calls, true);
    assert.equal(body.max_completion_tokens, 1200);
    assert.equal("max_tokens" in body, false);
    assert.deepEqual(body.messages, [
      { role: "system", content: "SYS" },
      { role: "user", content: "open insights" },
    ]);
  });

  it("Mitra's agent round through the server's own path: the prompt first, the browser's tools and words as sent", async () => {
    onChatGPT();
    setAgentTransportForTests(null);
    standIn(() => completion("Opened today's breakdown record, Parth."));
    const checked = validateAgentRequest({
      today: "2026-10-12",
      currentRoute: "/assistant",
      language: "gu",
      userName: "Parth",
      tools: [{ type: "function", function: { name: "open_document", description: "Open a document.", parameters: { type: "object", properties: {} } } }],
      messages: [{ role: "user", content: "aaje nu breakdown record kholo" }],
    });
    assert.equal(checked.ok, true);
    if (!checked.ok) return;
    assert.deepEqual(await runAgentStep(checked.request), { kind: "final", text: "Opened today's breakdown record, Parth." });
    const body = seen[0].body as { model: string; reasoning_effort: string; messages: { role: string; content: string }[]; tools: unknown[] };
    assert.equal(body.model, "gpt-5.4-mini");
    assert.equal(body.reasoning_effort, "none");
    assert.equal(body.messages[0].role, "system");
    assert.match(body.messages[0].content, /^You are Mitra,/);
    assert.deepEqual(body.messages.slice(1), [{ role: "user", content: "aaje nu breakdown record kholo" }]);
    assert.equal(body.tools.length, 1);
  });

  it("a checklist answer goes to the short-jobs model, gpt-5.4-nano", async () => {
    onChatGPT();
    standIn(() => completion('{"done":true,"notRequired":false,"date":"2026-10-11","comment":"samples received"}'));
    const out = await interpretChecklistAnswer({ activity: "Collect the samples", answer: "got the samples yesterday", today: "2026-10-12" });
    assert.deepEqual(out, { done: true, notRequired: false, date: "2026-10-11", comment: "samples received" });
    const body = seen[0].body as Record<string, unknown>;
    assert.equal(body.model, "gpt-5.4-nano");
    assert.equal(body.reasoning_effort, "none");
    assert.equal(body.temperature, 0.1);
    assert.deepEqual(body.response_format, { type: "json_object" });
  });

  it("the CV reader asks the chat model, at temperature 0, and its answer fills what the rules missed", async () => {
    onChatGPT();
    standIn(() =>
      completion(JSON.stringify({ name: null, sex: null, dateOfBirth: null, email: null, phone: null, highestQualification: "B.Com", totalExperienceYears: 3, fresher: false, lastDesignation: "QC Executive", lastEmployer: null, positionAppliedFor: null }))
    );
    const cv = Buffer.from("HEENA PATEL\nCareer summary: three years in quality control at a packaging plant.\nEducation\nBachelor of Commerce, Gujarat University\nWork\nQC Executive at a printing plant in Mehsana\n", "utf8");
    const read = await readCv(cv, "heena.txt", { useAssistant: true });
    assert.equal(read.readBy, "assistant");
    assert.equal(read.profile.lastDesignation, "QC Executive");
    const body = seen[0].body as Record<string, unknown>;
    assert.equal(seen[0].url, "https://api.openai.com/v1/chat/completions");
    assert.equal(body.model, "gpt-5.4-mini");
    assert.equal(body.temperature, 0);
    assert.deepEqual(body.response_format, { type: "json_object" });
  });

  it("a model that does not reason is sent no reasoning_effort (AI_CHAT_MODEL=gpt-4.1-mini); gpt-5-mini is sent minimal", async () => {
    onChatGPT({ AI_CHAT_MODEL: "gpt-4.1-mini", AI_AGENT_MODEL: "gpt-5-mini" });
    standIn(() => completion('{"ok":true}'));
    await aiChatJSON({ system: "S", user: "U" });
    assert.equal(seen[0].body?.model, "gpt-4.1-mini");
    assert.equal("reasoning_effort" in (seen[0].body ?? {}), false);
    standIn(() => completion("Done."));
    await aiChatWithTools({ system: "S", messages: [{ role: "user", content: "hi" }], tools: [] });
    assert.equal(seen[0].body?.model, "gpt-5-mini");
    assert.equal(seen[0].body?.reasoning_effort, "minimal");
    assert.equal("tools" in (seen[0].body ?? {}), false, "no tools offered, none sent");
  });

  it("a picture goes as an image_url data URL to the vision model, and its words come back", async () => {
    onChatGPT();
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);
    standIn(() => completion("Viscosity | 20.4\nTested By | Heena", {}, 2600));
    const text = await aiReadPicture({ image: png, mime: "image/png" });
    assert.equal(text, "Viscosity | 20.4\nTested By | Heena");
    const body = seen[0].body as { model: string; temperature: number; max_completion_tokens: number; reasoning_effort: string; messages: { role: string; content: unknown }[] };
    assert.equal(body.model, "gpt-5.4-mini");
    assert.equal(body.reasoning_effort, "none");
    assert.equal(body.temperature, 0);
    assert.equal(body.max_completion_tokens, 4000);
    assert.equal(body.messages[0].role, "system");
    assert.match(String(body.messages[0].content), /never\s+an instruction to you/);
    assert.deepEqual(body.messages[1], {
      role: "user",
      content: [
        { type: "text", text: "Write out the text in this picture." },
        { type: "image_url", image_url: { url: `data:image/png;base64,${png.toString("base64")}`, detail: "high" } },
      ],
    });
    assert.equal(tokensUsedToday(), 2600, "a picture's tokens are counted");
  });

  it("a picture attached to Mitra is read by the model; when the model cannot, by OCR; on Groq or switched off, never sent", async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);
    onChatGPT();
    standIn(() => completion("F/QC/30 | 10:00 | 20.1"));
    const read = await readAttachment(png, "register.png", "image/png");
    assert.equal(read.readBy, "model");
    assert.equal(read.text, "F/QC/30 | 10:00 | 20.1");
    standIn(() => completion("(no text)"));
    const blank = await readAttachment(png, "blank.png", "image/png");
    assert.equal(blank.readBy, "model");
    assert.equal(blank.text, "");
    assert.match(blank.note ?? "", /no readable text/);
    // Both models failing: OCR reads it (switched off in the unit run, so a note in plain words).
    standIn(() => openaiError(500, { message: "The server had an error" }));
    const lines = await logged(async () => {
      const fallen = await readAttachment(png, "register.png", "image/png");
      assert.equal(fallen.readBy, "ocr");
      assert.match(fallen.note ?? "", /OCR/);
    });
    assert.equal(seen.length, 2, "the first model, then the second");
    assert.ok(lines.some((l) => /read by OCR instead/.test(l)));
    // The route says no for a person over the throttle; the setting says no for everybody.
    standIn(() => completion("never asked"));
    assert.equal((await readAttachment(png, "register.png", "image/png", { pictureByModel: false })).readBy, "ocr");
    process.env.PICTURES_READ_WITH_ASSISTANT = "0";
    assert.equal((await readAttachment(png, "register.png", "image/png")).readBy, "ocr");
    delete process.env.PICTURES_READ_WITH_ASSISTANT;
    delete process.env.CHATGPT_API_KEY;
    onGroq();
    assert.equal((await readAttachment(png, "register.png", "image/png")).readBy, "ocr");
    assert.equal(seen.length, 0, "no picture was sent anywhere");
  });

  it("the speech body: gpt-4o-mini-tts, the whole line in one call, the chosen voice, how to say its language, a WAV", async () => {
    onChatGPT();
    standIn(() => audio(wav(2, true)));
    const line = Array.from({ length: 12 }, (_, i) => `Sentence ${i + 1} of the morning briefing, Heena.`).join(" ").slice(0, 600);
    const clip = await aiSpeak({ text: line, voice: "female" });
    assert.equal(seen.length, 1, "one call: OpenAI takes 4,096 characters, a browser sends at most 600");
    assert.equal(seen[0].url, "https://api.openai.com/v1/audio/speech");
    assert.equal(seen[0].headers.authorization, `Bearer ${OPENAI_KEY}`);
    assert.deepEqual(seen[0].body, { model: "gpt-4o-mini-tts", input: line, voice: "coral", instructions: SPEECH_INSTRUCTIONS.en, response_format: "wav" });
    const info = parseWav(clip);
    assert.equal(clip.readUInt32LE(4), clip.length - 8, "the sizes written out, not a stream's 'unknown'");
    assert.equal(info.dataLength, 2 * 24000 * 2);

    standIn(() => audio(wav(1)));
    await aiSpeak({ text: "તમારું F/HR/17 આજે બાકી છે.", voice: "male" });
    assert.equal(seen[0].body?.voice, "ash");
    assert.equal(seen[0].body?.instructions, SPEECH_INSTRUCTIONS.gu);
    standIn(() => audio(wav(1)));
    await aiSpeak({ text: "आपका रिकॉर्ड आज बाकी है।", voice: "female" });
    assert.equal(seen[0].body?.instructions, SPEECH_INSTRUCTIONS.hi);
    assert.equal(speechLanguage("Your record is due."), "en");
    assert.match(SPEECH_INSTRUCTIONS.gu, /Gujarati/);
    assert.match(SPEECH_INSTRUCTIONS.hi, /Hindi/);
    assert.match(SPEECH_INSTRUCTIONS.en, /Indian accent/);
    // 23-Oct-2026: the owner found the voice "very slow speaking" — fluent, at a conversational pace, no longer "easy".
    for (const words of Object.values(SPEECH_INSTRUCTIONS)) {
      assert.match(words, /fluently and at a natural conversational pace, neither slow nor rushed/);
      assert.doesNotMatch(words, /easy pace|clearly/);
    }

    // tts-1 takes no instructions.
    process.env.AI_TTS_MODEL = "tts-1";
    standIn(() => audio(wav(1)));
    await aiSpeak({ text: "Hello.", voice: "female" });
    assert.equal("instructions" in (seen[0].body ?? {}), false);
  });

  it("the voice not on the account (403, 404) is VoiceUnavailableError in ChatGPT's words; anything else an ordinary error", async () => {
    onChatGPT();
    standIn(() => openaiError(404, { message: "The model `gpt-4o-mini-tts` does not exist or you do not have access to it.", code: "model_not_found" }));
    await assert.rejects(aiSpeak({ text: "Hello.", voice: "female" }), (err: unknown) => err instanceof VoiceUnavailableError && err.service === "openai" && err.model === "gpt-4o-mini-tts");
    standIn(() => openaiError(500, { message: "upstream" }));
    await assert.rejects(aiSpeak({ text: "Hello.", voice: "female" }), (err: unknown) => err instanceof AiRequestError && err.status === 500);
    standIn(() => json({ ok: true }));
    await assert.rejects(aiSpeak({ text: "Hello.", voice: "female" }), /instead of audio/);
  });

  it("the transcription body: gpt-4o-mini-transcribe, json, the plant's words, a language only when chosen, no temperature", async () => {
    onChatGPT();
    standIn(() => json({ text: "  હા, આજનું રેકોર્ડ ખોલો  ", usage: { type: "tokens", input_tokens: 40, output_tokens: 19, total_tokens: 59 } }));
    const heard = await aiTranscribe({ audio: Buffer.alloc(2048, 1), mime: "audio/webm;codecs=opus", prompt: TRANSCRIBE_PROMPT });
    assert.deepEqual(heard, { text: "હા, આજનું રેકોર્ડ ખોલો" });
    assert.equal(seen[0].url, "https://api.openai.com/v1/audio/transcriptions");
    assert.equal(seen[0].headers.authorization, `Bearer ${OPENAI_KEY}`);
    assert.equal("content-type" in seen[0].headers, false, "fetch writes the multipart boundary itself");
    assert.deepEqual(seen[0].form, { file: "[file recording.webm audio/webm 2048]", model: "gpt-4o-mini-transcribe", response_format: "json", prompt: TRANSCRIBE_PROMPT });
    assert.equal(tokensUsedToday(), 59, "the tokens it reports are counted");

    standIn(() => json({ text: "હા" }));
    await aiTranscribe({ audio: Buffer.alloc(16, 1), mime: "audio/mp4", language: "gu" });
    assert.equal(formOf().language, "gu");
    assert.equal(formOf().file, "[file recording.mp4 audio/mp4 16]");

    // whisper-1, named by the setting, answers verbose_json and takes a temperature.
    process.env.AI_TRANSCRIBE_MODEL = "whisper-1";
    standIn(() => json({ text: "yes", language: "english", duration: 1.24 }));
    assert.deepEqual(await aiTranscribe({ audio: Buffer.alloc(16, 1), mime: "audio/webm" }), { text: "yes", language: "english", seconds: 1.2 });
    assert.equal(formOf().response_format, "verbose_json");
    assert.equal(formOf().temperature, "0");
  });

  it("Groq, on a server with no OpenAI key, keeps its own address and shapes", async () => {
    onGroq();
    standIn(() => completion('{"reply":"ok"}'));
    await aiChatJSON({ system: "S", user: "U", reasoningEffort: "medium", maxTokens: 4000 });
    assert.equal(seen[0].url, "https://api.groq.com/openai/v1/chat/completions");
    assert.equal(seen[0].headers.authorization, `Bearer ${GROQ_KEY}`);
    assert.equal(seen[0].body?.model, "openai/gpt-oss-120b");
    assert.equal(seen[0].body?.reasoning_effort, "medium");
    standIn(() => json({ text: "hello", language: "en", duration: 2 }));
    await aiTranscribe({ audio: Buffer.alloc(16, 1), mime: "audio/webm" });
    assert.equal(seen[0].url, "https://api.groq.com/openai/v1/audio/transcriptions");
    assert.equal(formOf().model, "whisper-large-v3");
    assert.equal(formOf().response_format, "verbose_json");
  });
});

describe("when a model cannot answer", () => {
  it("a parameter the model refuses is learnt once, the question asked again without it, and left out after", async () => {
    onChatGPT();
    standIn((req, n) =>
      n === 1
        ? openaiError(400, { message: "Unsupported value: 'temperature' does not support 0.2 with this model. Only the default (1) value is supported.", param: "temperature", code: "unsupported_value" })
        : completion('{"reply":"ok"}')
    );
    const lines = await logged(() => aiChatJSON({ system: "S", user: "U" }));
    assert.equal(seen.length, 2);
    assert.equal(seen[0].body?.temperature, 0.2);
    assert.equal("temperature" in (seen[1].body ?? {}), false);
    assert.equal(seen[1].body?.model, "gpt-5.4-mini", "the same model, asked again");
    assert.ok(lines.some((l) => /gpt-5\.4-mini does not take temperature/.test(l)));
    standIn(() => completion('{"reply":"ok"}'));
    await aiChatJSON({ system: "S", user: "U" });
    assert.equal(seen.length, 1);
    assert.equal("temperature" in (seen[0].body ?? {}), false, "remembered: one round trip in the server's life");
  });

  it("the gpt-5.4 model refusing tools ('use /v1/responses'): gpt-4.1-mini answers instead, sent no reasoning effort", async () => {
    onChatGPT();
    standIn((req) =>
      req.body?.model === "gpt-5.4-mini"
        ? openaiError(400, { message: "Function tools with reasoning_effort are not supported for gpt-5.4-mini in /v1/chat/completions. Please use /v1/responses instead.", param: "reasoning_effort" })
        : completion("Opening it.")
    );
    const lines = await logged(() => aiChatWithTools({ system: "S", messages: [{ role: "user", content: "open qc" }], tools: [{ type: "function", function: { name: "navigate", description: "d", parameters: { type: "object", properties: {} } } }] }));
    assert.deepEqual(
      seen.map((r) => [r.body?.model, r.body?.reasoning_effort]),
      [
        ["gpt-5.4-mini", "none"],
        ["gpt-4.1-mini", undefined],
      ]
    );
    assert.ok(
      lines.some((l) => /gpt-5\.4-mini could not answer \(400\); gpt-4\.1-mini answers instead\. .*use \/v1\/responses/.test(l)),
      "the log says why, in the service's words: " + lines.join(" | ")
    );
  });

  it("a model that declines says why: its refusal is its words to the person", async () => {
    onChatGPT();
    standIn(() => completion(null, { refusal: "I can't help with that." }));
    assert.deepEqual(await aiChatWithTools({ system: "S", messages: [{ role: "user", content: "x" }], tools: [] }), { content: "I can't help with that." });
  });

  it("a model not on the account (404) is skipped for ten minutes: the next question goes straight to the second", async () => {
    onChatGPT();
    standIn((req) => (req.body?.model === "gpt-5.4-mini" ? openaiError(404, { message: "The model `gpt-5.4-mini` does not exist or you do not have access to it.", code: "model_not_found" }) : completion('{"reply":"ok"}')));
    await logged(() => aiChatJSON({ system: "S", user: "U" }));
    assert.equal(seen.length, 2);
    standIn(() => completion('{"reply":"ok"}'));
    await aiChatJSON({ system: "S", user: "U" });
    assert.deepEqual(
      seen.map((r) => r.body?.model),
      ["gpt-4.1-mini"]
    );
  });

  it("a wrong key (401) and an account out of credit (429 insufficient_quota) are neither waited out nor asked of the second model", async () => {
    onChatGPT();
    standIn(() => openaiError(401, { message: "Incorrect API key provided.", code: "invalid_api_key" }));
    await assert.rejects(aiChatJSON({ system: "S", user: "U" }), (err: unknown) => err instanceof AiRequestError && err.status === 401);
    assert.equal(seen.length, 1);
    standIn(() => openaiError(429, { message: "You exceeded your current quota, please check your plan and billing details.", type: "insufficient_quota", code: "insufficient_quota" }));
    const started = Date.now();
    await assert.rejects(aiChatJSON({ system: "S", user: "U" }), (err: unknown) => err instanceof AiRequestError && err.status === 429);
    assert.equal(seen.length, 1);
    assert.ok(Date.now() - started < 1000, "not waited out");
  });

  it("a 429 asking to wait is waited out, as long as it asks (bounded), then answered", async () => {
    onChatGPT();
    standIn((_req, n) => (n === 1 ? json({ error: { message: "Rate limit reached. Please try again in 20ms." } }, 429, { "retry-after-ms": "20" }) : completion('{"reply":"ok"}')));
    const lines = await logged(() => aiChatJSON({ system: "S", user: "U" }));
    assert.equal(seen.length, 2);
    assert.ok(lines.some((l) => /AI rate limit \(429\): retry 1 of 2 in 20 ms/.test(l)));
  });

  it("no answer at all (the network) is not asked of the second model: it would wait the same", async () => {
    onChatGPT();
    standIn(() => {
      throw new TypeError("fetch failed");
    });
    await assert.rejects(aiChatJSON({ system: "S", user: "U" }), (err: unknown) => err instanceof AiRequestError && err.status === 0 && /fetch failed/.test(err.message));
    assert.equal(seen.length, 1);
  });
});

describe("the daily cost guard (AI_DAILY_TOKEN_BUDGET)", () => {
  it("every answer's tokens are counted; at 90% the chat stops, at 100% nothing is asked — and the log says each once", async () => {
    onChatGPT({ AI_DAILY_TOKEN_BUDGET: "1000" });
    standIn(() => completion('{"reply":"ok"}', {}, 600));
    const lines = await logged(async () => {
      await aiChatJSON({ system: "S", user: "U" });
      assert.equal(tokensUsedToday(), 600);
      assert.equal(dailyAllowanceUsedUp(), false);
      standIn(() => completion('{"reply":"ok"}', {}, 350));
      await aiChatJSON({ system: "S", user: "U" });
      assert.equal(tokensUsedToday(), 950);
      assert.equal(dailyAllowanceUsedUp(), true, "the chat and the agent stop at 90%");
      assert.equal(dailyBudgetSpent(), false, "the last tenth is kept for the checklist, CVs, pictures, the microphone and the voice");
      await interpretChecklistAnswer({ activity: "a", answer: "done", today: "2026-10-12" });
      assert.equal(tokensUsedToday(), 1300);
      assert.equal(dailyBudgetSpent(), true);
      countTokens(10);
    });
    assert.equal(lines.filter((l) => /90% used/.test(l)).length, 1);
    assert.equal(lines.filter((l) => /AI allowance for today is used up/.test(l)).length, 1, "said once, not at every count");
    assert.ok(lines.some((l) => /1,300 of 1,000 tokens \(AI_DAILY_TOKEN_BUDGET\)/.test(l)), lines.join("\n"));

    // Spent: no call goes out, whatever it is.
    standIn(() => completion("never"));
    await assert.rejects(aiChatJSON({ system: "S", user: "U" }), (err: unknown) => err instanceof AiAllowanceError && err.code === "daily-allowance");
    await assert.rejects(aiChatWithTools({ system: "S", messages: [{ role: "user", content: "hi" }], tools: [] }), AiAllowanceError);
    await assert.rejects(aiTranscribe({ audio: Buffer.alloc(8), mime: "audio/webm" }), AiAllowanceError);
    await assert.rejects(aiSpeak({ text: "Hello.", voice: "female" }), AiAllowanceError);
    await assert.rejects(aiReadPicture({ image: Buffer.alloc(8), mime: "image/png" }), AiAllowanceError);
    assert.equal(seen.length, 0);
    assert.match(new AiAllowanceError().message, /used up: answers come from this system's own records until tomorrow/);
  });

  it("on a Groq key the allowance holds the model's answers, while the microphone and the voice go on, as before §109", async () => {
    onGroq({ GROQ_DAILY_TOKEN_BUDGET: "100" });
    countTokens(150);
    assert.equal(dailyBudgetSpent(), true);
    standIn(() => completion("never"));
    await assert.rejects(aiChatJSON({ system: "S", user: "U" }), AiAllowanceError);
    assert.equal(seen.length, 0);
    standIn(() => json({ text: "hello", language: "en", duration: 1 }));
    assert.equal((await aiTranscribe({ audio: Buffer.alloc(8), mime: "audio/webm" })).text, "hello");
    standIn(() => audio(wav(0.5)));
    await aiSpeak({ text: "Hello.", voice: "female" });
    assert.equal(seen.length, 1, "Groq billed hearing and speech apart from tokens");
    assert.equal(seen[0].url, "https://api.groq.com/openai/v1/audio/speech");
  });

  it("3,000,000 tokens a day on ChatGPT; the super admin's count says the service, the allowance and where the chat stops", () => {
    onChatGPT();
    countTokens(1234);
    countTokens("12" as unknown);
    countTokens(-5);
    countTokens(Number.NaN);
    const usage = aiUsage();
    assert.equal(usage.service, "openai");
    assert.equal(usage.budget, 3_000_000);
    assert.equal(usage.usedToday, 1234, "only a positive number of tokens counts");
    assert.equal(usage.chatStopsAt, 2_700_000);
    assert.match(usage.day, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(JSON.stringify(usage).includes(OPENAI_KEY), false);
  });

  it("speech, which reports no tokens, is counted by estimate: its words and its seconds of audio", async () => {
    onChatGPT();
    standIn(() => audio(wav(2)));
    await aiSpeak({ text: "Hello Heena, your record is due.", voice: "female" });
    const expected = speechTokens("Hello Heena, your record is due.", wav(2));
    assert.equal(expected, Math.ceil(32 / 4) + Math.ceil(2 * 21));
    assert.equal(tokensUsedToday(), expected);
  });
});

describe("no key reaches a log line", () => {
  it("a 401 that echoes the key: the error's words, its stack and everything logged carry no key", async () => {
    onChatGPT();
    standIn(() =>
      openaiError(401, { message: `Incorrect API key provided: ${OPENAI_KEY}. You can find your API key at https://platform.openai.com/account/api-keys.`, code: "invalid_api_key" })
    );
    let caught: unknown = null;
    const lines = await logged(async () => {
      try {
        await aiChatJSON({ system: "S", user: "U" });
      } catch (err) {
        caught = err;
        console.error(err); // as the routes do
      }
    });
    assert.ok(caught instanceof AiRequestError);
    const err = caught as AiRequestError;
    assert.ok(!err.message.includes(OPENAI_KEY) && !String(err.stack).includes(OPENAI_KEY));
    assert.match(err.message, /\[key\]/);
    assert.ok(lines.length > 0);
    for (const line of lines) assert.ok(!line.includes(OPENAI_KEY) && !line.includes("sk-test"), line);
  });

  it("every warning on the way (a refused parameter, the second model, a rate limit, the allowance) names no key", async () => {
    onChatGPT({ AI_DAILY_TOKEN_BUDGET: "100" });
    standIn((req, n) => {
      if (n === 1) return json({ error: { message: `Rate limit for ${OPENAI_KEY}. Please try again in 5ms.` } }, 429);
      if (n === 2) return openaiError(400, { message: `'temperature' refused for key ${OPENAI_KEY}`, param: "temperature" });
      if (req.body?.model === "gpt-5.4-mini") return openaiError(500, { message: `Bearer ${OPENAI_KEY} failed` });
      return completion('{"reply":"ok"}', {}, 500);
    });
    const lines = await logged(() => aiChatJSON({ system: "S", user: "U" }));
    assert.ok(lines.length >= 4, lines.join("\n"));
    for (const line of lines) assert.ok(!line.includes(OPENAI_KEY), line);
  });

  it("the transcription's and the voice's failures name no key", async () => {
    onChatGPT();
    standIn(() => openaiError(401, { message: `Incorrect API key provided: ${OPENAI_KEY}.` }));
    for (const call of [() => aiTranscribe({ audio: Buffer.alloc(8), mime: "audio/webm" }), () => aiSpeak({ text: "Hello.", voice: "female" })]) {
      const lines = await logged(async () => {
        try {
          await call();
        } catch (err) {
          console.error(err);
          assert.ok(!(err as Error).message.includes(OPENAI_KEY));
        }
      });
      for (const line of lines) assert.ok(!line.includes(OPENAI_KEY), line);
    }
  });

  it("a key in any shape is taken out: OpenAI's partly hidden one, a Groq key, a Bearer value, a key of no known shape", () => {
    assert.equal(redactSecrets("Incorrect API key provided: sk-proj-********************abcd. You can"), "Incorrect API key provided: [key]. You can");
    assert.equal(redactSecrets("key gsk_abcdef0123456789 refused"), "key [key] refused");
    assert.equal(redactSecrets("Authorization: Bearer abc.def-123"), "Authorization: Bearer [key]");
    process.env.CHATGPT_API_KEY = "plain-key-of-no-known-shape-0042";
    assert.equal(redactSecrets("echoed plain-key-of-no-known-shape-0042 back"), "echoed [key] back");
    assert.equal(redactSecrets("Speech request failed (500): upstream down"), "Speech request failed (500): upstream down", "words with no key stay as they are");
  });
});
