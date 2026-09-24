// Thin client for Groq's OpenAI-compatible chat completions API. Server-side
// only — the key must never reach the browser bundle (see assistant.ts's
// header comment for why: only index.ts's /api/assistant/* routes ever call
// into this file). Kept as its own module so assistant.ts's prompt-building
// logic stays separate from the HTTP mechanics of whichever LLM provider is
// configured.
import { plantTimeZone } from "./db.ts";

// This account's Groq key only has access to a specific model set (checked
// against GET /openai/v1/models at integration time) — no meta-llama chat
// models, so default to the largest general-purpose instruction model that
// IS available rather than a commonly-documented Groq default that 404s here.
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

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

function countTokens(n: unknown): void {
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

  let res = await postChat(apiKey, payload);
  for (let attempt = 1; attempt <= MAX_RETRIES && res.status === 429; attempt++) {
    const text = await res.text().catch(() => "");
    const delay = retryDelayMs(res, text);
    console.warn(`Groq rate limit (429) — retry ${attempt} of ${MAX_RETRIES} in ${delay} ms`);
    await new Promise((resolve) => setTimeout(resolve, delay + 250));
    res = await postChat(apiKey, payload);
  }

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
