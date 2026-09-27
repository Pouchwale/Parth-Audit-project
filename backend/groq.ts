// Thin client for Groq's OpenAI-compatible chat completions API. Server-side
// only — the key must never reach the browser bundle (see assistant.ts's
// header comment for why: only index.ts's /api/assistant/* routes ever call
// into this file). Kept as its own module so assistant.ts's prompt-building
// logic stays separate from the HTTP mechanics of whichever LLM provider is
// configured.
//
// Three calls live here: groqChatJSON (one JSON answer — the chat, the
// checklist and the CV reader), groqChatWithTools (one round of Mitra's agent
// loop, REQUIREMENTS §80 — the model answers in words or asks for tool calls)
// and groqTranscribe (Whisper, for what a person says into the microphone).
import { plantTimeZone } from "./db.ts";

// This account's Groq key only has access to a specific model set (checked
// against GET /openai/v1/models at integration time) — no meta-llama chat
// models, so default to the largest general-purpose instruction model that
// IS available rather than a commonly-documented Groq default that 404s here.
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Whisper, for the microphone (REQUIREMENTS §80): the one speech model this
// key has. Groq bills it by audio seconds, apart from the token allowance below.
const GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const TRANSCRIBE_MODEL = "whisper-large-v3";

// A 429 from Groq is almost always the account's tokens-per-minute allowance
// being briefly exhausted (a burst of chat messages, each carrying the route
// guide and the live-facts context). Groq says how long to wait — in a
// Retry-After header and/or "Please try again in 2.6s" in the body — so wait
// that long (bounded) and try again before giving up. Two retries, because a
// single one still fails when several messages land inside the same minute.
const RETRY_MAX_MS = 8000;
const MAX_RETRIES = 2;

// A call that hangs must not hang the request that made it (REQUIREMENTS §75):
// each attempt gives up after 30 seconds, and the browser then answers from
// the app's own records with the §72 label, as for any other failure.
const REQUEST_TIMEOUT_MS = 30000;
// A recording is at most 90 seconds (frontend/src/utils/recorder.ts) and
// Whisper answers in a few; twice the chat timeout leaves room for a slow upload.
const TRANSCRIBE_TIMEOUT_MS = 60000;

function retryDelayMs(res: Response, bodyText: string): number {
  const header = Number(res.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, RETRY_MAX_MS);
  const m = bodyText.match(/try again in ([\d.]+)\s*(ms|s)\b/i);
  if (m) return Math.min(Number(m[1]) * (m[2].toLowerCase() === "ms" ? 1 : 1000), RETRY_MAX_MS);
  return 2500;
}

async function postChat(apiKey: string, body: string): Promise<Response> {
  return fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

/** Sends a request and, when Groq answers 429, waits as long as it asks (bounded) and sends again — MAX_RETRIES times at most. */
export async function sendWithRateLimitRetry(send: () => Promise<Response>): Promise<Response> {
  let res = await send();
  for (let attempt = 1; attempt <= MAX_RETRIES && res.status === 429; attempt++) {
    const text = await res.text().catch(() => "");
    const delay = retryDelayMs(res, text);
    console.warn(`Groq rate limit (429) — retry ${attempt} of ${MAX_RETRIES} in ${delay} ms`);
    await new Promise((resolve) => setTimeout(resolve, delay + 250));
    res = await send();
  }
  return res;
}

// ---------------------------------------------------------------------------
// THE PLANT'S DAILY ALLOWANCE (REQUIREMENTS §75).
//
// The Groq plan behind this key allows about 200,000 tokens a DAY for the
// whole plant (and 8,000 a minute), and every person's questions draw on the
// same allowance. Once it is gone Groq refuses every call with a 429 until the
// next day, and a question would only wait out the retries above to fail. So
// every answer's usage (body.usage.total_tokens) is added up here, per day on
// the plant's own clock (PLANT_TIMEZONE, backend/db.ts), and the chat route
// stops asking once 90% of GROQ_DAILY_TOKEN_BUDGET is used — the last tenth is
// left for the checklist walk-through and the CV reader, which are one short
// call each. The browser then answers from the app's own records and says why
// (engine/assistantReach.ts, "allowance"), as it does with no key or no network.
//
// In memory, on purpose: a count that resets when the server restarts can
// only err towards asking the model once more, and Groq's own limit still
// stands behind it. Nothing about it is plant data, so nothing is stored.
const DEFAULT_DAILY_TOKEN_BUDGET = 200000;
const ALLOWANCE_SHARE = 0.9;

let meter = { day: "", used: 0 };

/** Today on the plant's clock, "YYYY-MM-DD". */
function plantDay(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: plantTimeZone(), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** The day's token allowance for the whole plant: GROQ_DAILY_TOKEN_BUDGET, or 200,000. */
export function dailyTokenBudget(): number {
  const n = Number(process.env.GROQ_DAILY_TOKEN_BUDGET);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_DAILY_TOKEN_BUDGET;
}

/** Tokens the plant's calls have used so far today. */
export function tokensUsedToday(): number {
  const day = plantDay();
  if (meter.day !== day) meter = { day, used: 0 };
  return meter.used;
}

/** Adds an answer's usage.total_tokens to today's count (anything that isn't a positive number is ignored). */
export function countTokens(n: unknown): void {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return;
  tokensUsedToday(); // turns the day over first
  meter.used += Math.round(n);
}

/** Whether today's allowance is as good as used (90% of it or more), so the chat should not ask the model. */
export function dailyAllowanceUsedUp(): boolean {
  return tokensUsedToday() >= dailyTokenBudget() * ALLOWANCE_SHARE;
}

// ---------------------------------------------------------------------------

/** One earlier turn of the conversation, as the browser sends it (backend/index.ts checks the limits). */
export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

// reasoning_effort is understood by the gpt-oss models this key uses; another
// model named in GROQ_MODEL may refuse the field, so it is sent only to those.
const takesReasoningEffort = (model: string): boolean => /gpt-oss/i.test(model);

// Sends a system + user message pair and returns the parsed JSON object the
// model replied with (Groq's json_object response format guarantees valid
// JSON syntax, but not any particular shape — callers still validate shape).
// `history` — earlier turns of the conversation — goes between the two, so a
// follow-up question ("and the month before?") can be understood. Every
// option is optional: the checklist, chat and CV callers that pass only
// system, user and temperature are answered exactly as before.
export async function groqChatJSON({
  system,
  user,
  history,
  temperature = 0.2,
  reasoningEffort,
  maxTokens,
}: {
  system: string;
  user: string;
  history?: readonly ChatTurn[];
  temperature?: number;
  reasoningEffort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<unknown> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("The assistant isn't configured yet (missing GROQ_API_KEY).");

  const payload = JSON.stringify({
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: system },
      ...(history ?? []).map((turn) => ({ role: turn.role, content: turn.text })),
      { role: "user", content: user },
    ],
    temperature,
    response_format: { type: "json_object" },
    ...(reasoningEffort && takesReasoningEffort(GROQ_MODEL) ? { reasoning_effort: reasoningEffort } : {}),
    ...(maxTokens && maxTokens > 0 ? { max_completion_tokens: Math.floor(maxTokens) } : {}),
  });

  const res = await sendWithRateLimitRetry(() => postChat(apiKey, payload));

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Assistant request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const body = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { total_tokens?: unknown } };
  countTokens(body?.usage?.total_tokens);
  const text = body?.choices?.[0]?.message?.content;
  if (!text) throw new Error("The assistant returned no content.");

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The assistant returned invalid JSON.");
  }
}

// ---------------------------------------------------------------------------
// ONE ROUND OF MITRA'S AGENT LOOP (REQUIREMENTS §80, backend/mitraAgent.ts).
//
// The OpenAI function-calling shapes, as Groq takes and returns them. The
// browser builds the same shapes (frontend/src/engine/mitraTypes.ts); the
// server checks them (mitraAgent.ts validateAgentRequest) before they get here.

/** One tool the model may call. */
export interface ToolSchema {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/** A call the model asked for; `arguments` is JSON text the browser parses. */
export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

/** The assistant message the model answered with: words, tool calls, or both. */
export interface AssistantReply {
  content: string | null;
  tool_calls?: ToolCall[];
}

/** The model the agent asks: GROQ_AGENT_MODEL, else GROQ_MODEL, else the default above. */
export function agentModel(): string {
  return process.env.GROQ_AGENT_MODEL || GROQ_MODEL;
}

// Groq returns `arguments` as JSON text; a provider that returned an object
// would still be understood. Anything without an id or a name is not a call.
function shapeToolCall(raw: unknown): ToolCall | null {
  const c = raw as { id?: unknown; function?: { name?: unknown; arguments?: unknown } } | null;
  if (!c || typeof c !== "object" || typeof c.id !== "string" || !c.id || !c.function || typeof c.function !== "object") return null;
  const { name, arguments: args } = c.function;
  if (typeof name !== "string" || !name) return null;
  const argumentsText = typeof args === "string" ? args : args && typeof args === "object" ? JSON.stringify(args) : "{}";
  return { id: c.id, type: "function", function: { name, arguments: argumentsText } };
}

/**
 * Sends the system prompt, the conversation and the tool schemas, and returns
 * the assistant message — the model's words, the tool calls it wants run, or
 * both. Same retries, timeout and token metering as groqChatJSON. Low
 * reasoning effort (gpt-oss only) and a small completion cap: a round is one
 * decision, and the plant's minute allowance is 8,000 tokens in all.
 */
export async function groqChatWithTools({
  system,
  messages,
  tools,
  maxTokens = 1200,
  temperature = 0.2,
}: {
  system: string;
  messages: readonly ChatMessage[];
  tools: readonly ToolSchema[];
  maxTokens?: number;
  temperature?: number;
}): Promise<AssistantReply> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("The assistant isn't configured yet (missing GROQ_API_KEY).");

  const model = agentModel();
  const payload = JSON.stringify({
    model,
    messages: [{ role: "system", content: system }, ...messages],
    ...(tools.length > 0 ? { tools, tool_choice: "auto", parallel_tool_calls: true } : {}),
    temperature,
    ...(takesReasoningEffort(model) ? { reasoning_effort: "low" } : {}),
    max_completion_tokens: Math.max(1, Math.floor(maxTokens)),
  });

  const res = await sendWithRateLimitRetry(() => postChat(apiKey, payload));
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Assistant request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const body = (await res.json()) as { choices?: { message?: { content?: unknown; tool_calls?: unknown } }[]; usage?: { total_tokens?: unknown } };
  countTokens(body?.usage?.total_tokens);
  const message = body?.choices?.[0]?.message;
  if (!message || typeof message !== "object") throw new Error("The assistant returned no message.");
  const content = typeof message.content === "string" ? message.content : null;
  const calls = Array.isArray(message.tool_calls) ? message.tool_calls.map(shapeToolCall).filter((c): c is ToolCall => c !== null) : [];
  return calls.length > 0 ? { content, tool_calls: calls } : { content };
}

// ---------------------------------------------------------------------------
// WHAT A PERSON SAID (REQUIREMENTS §80): Whisper turns a recording into text.

// The file name's extension tells Whisper the container; the browser records
// WebM/Opus where it can, MP4 on Safari (frontend/src/utils/recorder.ts).
const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/mp4": "mp4",
  "video/mp4": "mp4",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/flac": "flac",
};

/**
 * Transcribes a recording with whisper-large-v3. `language` narrows Whisper
 * to English or Gujarati when the person chose one; left out, Whisper decides
 * (a mix of the two is common on the shop floor). `prompt` is vocabulary the
 * plant uses, so format numbers and names come out as written. Nothing is
 * metered: Whisper is billed by audio seconds, apart from the token allowance.
 */
export async function groqTranscribe({
  audio,
  mime,
  language,
  prompt,
}: {
  audio: Buffer;
  mime: string;
  language?: "en" | "gu";
  prompt?: string;
}): Promise<{ text: string; language?: string; seconds?: number }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("The assistant isn't configured yet (missing GROQ_API_KEY).");

  const baseMime = (mime.split(";")[0] ?? "").trim().toLowerCase() || "audio/webm";
  const extension = AUDIO_EXTENSIONS[baseMime] ?? "webm";
  // A fresh form for every attempt: a body is consumed by the request that sends it.
  const send = (): Promise<Response> => {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type: baseMime }), `recording.${extension}`);
    form.append("model", TRANSCRIBE_MODEL);
    form.append("response_format", "verbose_json");
    form.append("temperature", "0");
    if (prompt) form.append("prompt", prompt);
    if (language) form.append("language", language);
    return fetch(GROQ_TRANSCRIBE_URL, {
      method: "POST",
      // No Content-Type: fetch writes the multipart boundary itself.
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
    });
  };

  const res = await sendWithRateLimitRetry(send);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Transcription request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const body = (await res.json()) as { text?: unknown; language?: unknown; duration?: unknown } | null;
  if (!body || typeof body.text !== "string") throw new Error("The transcription returned no text.");
  return {
    text: body.text.trim(),
    ...(typeof body.language === "string" && body.language ? { language: body.language } : {}),
    ...(typeof body.duration === "number" && Number.isFinite(body.duration) ? { seconds: Math.round(body.duration * 10) / 10 } : {}),
  };
}
