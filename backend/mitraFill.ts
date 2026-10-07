// A FILL'S ONE SMALL MODEL CALL (REQUIREMENTS §94).
//
// When DCRS's own rules cannot read every value a person said (frontend/src/
// engine/fillRequest.ts), ONE JSON call is made: a fixed prompt, the form's card
// (frontend/src/engine/fillCard.ts formCard, at most 1,200 characters) and the
// person's words. Measured live on 7-Oct-2026 with this prompt: 575 to 1,018
// tokens a call, against 6,000 to 21,000 for a fill through the agent loop. When
// the document is not certain, a smaller call picks it from at most twelve
// candidates (about 500 tokens). The answer is then checked here field by field
// (checkFillReply) and again by DCRS's engine, word by word against what the
// person said (frontend/src/engine/fillPlan.ts), before anything is written.
//
// Before sending, the plant's allowance is asked: the day's (90% of it gone, or
// Groq's own "tokens per day") is "allowance"; the minute's, from the ledger of
// Groq's own headers (backend/groq.ts), waits for the refill when the caller
// allows it (the phone's route waits up to 20 s) and is otherwise "busy", with
// how long — nothing is sent to fail. Both servers use THIS prompt: the website
// through POST /api/assistant/fill, the phone through POST /api/v1/fill/plan.
import { dailyAllowanceUsedUp, estimateRequestTokens, groqJSONOnce, GroqRefusal, minuteRoomFor } from "./groq.ts";

/** The fixed prompt (the probe's v2 text, 7-Oct-2026): the same bytes every call. */
export const FILL_PROMPT = [
  "You read what a factory worker said and pick out the values to write on ONE form. Answer with JSON only:",
  '{"doc":"<form id>","date":"YYYY-MM-DD","header":{},"slots":{"HH:MM":{}},"rows":[{}],"checks":{"n":"ok|not ok|Yes|No|<number>"},"fields":{},"submit":false,"unclear":""}',
  "Rules: only keys on the FORM card. Copy names and numbers exactly as said, in the script they were said in. Never add a value the person did not say: leave it out.",
  'A box marked sign gets a name only when the person said whose. checks: "ok" = no problem at that point, "not ok" = a problem there. When they say all/everything is fine, normal, ok, theek, barabar, sab theek, badhu barabar, every check is "ok", even one that asks about a problem. Write "not ok" only for a point they named as a problem. A count only when a count is said.',
  "Times as HH:MM, 24-hour (2 pm = 14:00). Dates YYYY-MM-DD; today is on the card. submit is true only if they asked to submit or send for verification.",
  "Leave out empty parts. If you cannot tell what to write, put one short question in unclear, in the person's language and script.",
].join("\n");

/** Which form, from at most twelve lines "id | formatNo name". */
export const PICK_PROMPT = [
  'Which form does a factory worker mean? Answer with JSON only: {"doc":"<id from the list, or none>","date":"YYYY-MM-DD","unclear":""}.',
  "Choose only an id from the list. If two fit equally, doc is none and unclear asks which, in the person's language and script.",
].join("\n");

export const FILL_MAX_COMPLETION_TOKENS = 900;
export const PICK_MAX_COMPLETION_TOKENS = 300;
/** The longest the minute's refill is waited for on the phone's route; the website shows its own countdown instead. */
export const FILL_MAX_WAIT_MS = 20_000;

export const FILL_LIMITS = {
  words: 2000,
  card: 2500,
  candidates: 1600,
  candidateLines: 12,
  keys: 30,
  value: 200,
  slots: 48,
  rows: 30,
  doc: 80,
  unclear: 200,
} as const;

export type FillCode = "allowance" | "busy" | "unavailable";

/** Why no values came back: the day's allowance, the minute's (with how long), or the model not answering. */
export class FillRefusal extends Error {
  readonly code: FillCode;
  readonly retryInMs: number | null;
  constructor(code: FillCode, message: string, retryInMs: number | null = null) {
    super(message);
    this.name = "FillRefusal";
    this.code = code;
    this.retryInMs = retryInMs;
  }
}

type Scalar = string | number | boolean | null;
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** The values as the engine takes them (frontend/src/engine/fillRequest.ts FillValues). */
export interface CheckedFill {
  doc?: string;
  date?: string | null;
  header?: Record<string, Scalar>;
  slots?: Record<string, Record<string, Scalar>>;
  rows?: Record<string, Scalar>[];
  checks?: Record<string, Scalar>;
  fields?: Record<string, Scalar>;
  submit?: boolean;
  unclear?: string;
}

function scalars(v: unknown): Record<string, Scalar> | undefined {
  if (!isObj(v)) return undefined;
  const out: Record<string, Scalar> = {};
  for (const [k, x] of Object.entries(v).slice(0, FILL_LIMITS.keys)) {
    if (!k || k.length > 60) continue;
    if (typeof x === "string") {
      if (x.trim()) out[k] = x.trim().slice(0, FILL_LIMITS.value);
    } else if (typeof x === "number" && Number.isFinite(x)) out[k] = x;
    else if (typeof x === "boolean") out[k] = x;
  }
  return Object.keys(out).length ? out : undefined;
}

function hhmm(key: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(key.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 23 && min <= 59 ? `${String(h).padStart(2, "0")}:${m[2]}` : null;
}

/**
 * THE REPLY, CHECKED: only the fixed shape, each part held to its limits —
 * doc ≤ 80 characters, date ISO or null, header and fields ≤ 30 scalar values of
 * ≤ 200 characters, slots keyed HH:MM (≤ 48), rows ≤ 30, checks keyed 1 to 10,
 * submit a boolean, unclear ≤ 200 characters. Anything else is dropped.
 */
export function checkFillReply(raw: unknown): CheckedFill {
  const out: CheckedFill = {};
  if (!isObj(raw)) return out;
  if (typeof raw.doc === "string" && raw.doc.trim() && raw.doc.length <= FILL_LIMITS.doc) out.doc = raw.doc.trim();
  if (typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)) out.date = raw.date;
  else if (raw.date === null) out.date = null;
  const header = scalars(raw.header);
  if (header) out.header = header;
  const fields = scalars(raw.fields);
  if (fields) out.fields = fields;
  if (isObj(raw.slots)) {
    const slots: Record<string, Record<string, Scalar>> = {};
    for (const [k, v] of Object.entries(raw.slots).slice(0, FILL_LIMITS.slots)) {
      const t = hhmm(k);
      const set = scalars(v);
      if (t && set) slots[t] = set;
    }
    if (Object.keys(slots).length) out.slots = slots;
  }
  if (Array.isArray(raw.rows)) {
    const rows = raw.rows.slice(0, FILL_LIMITS.rows).map(scalars).filter((r): r is Record<string, Scalar> => !!r);
    if (rows.length) out.rows = rows;
  }
  if (isObj(raw.checks)) {
    const checks: Record<string, Scalar> = {};
    for (const [k, v] of Object.entries(raw.checks)) {
      const n = Number(k);
      if (!Number.isInteger(n) || n < 1 || n > 10) continue;
      if (typeof v === "string" && v.trim()) checks[String(n)] = v.trim().slice(0, 40);
      else if (typeof v === "number" && Number.isFinite(v)) checks[String(n)] = v;
    }
    if (Object.keys(checks).length) out.checks = checks;
  }
  if (typeof raw.submit === "boolean") out.submit = raw.submit;
  if (typeof raw.unclear === "string" && raw.unclear.trim()) out.unclear = raw.unclear.trim().slice(0, FILL_LIMITS.unclear);
  return out;
}

/** The pick, checked: an id from the list, or none. */
export function checkPickReply(raw: unknown, ids: readonly string[]): { doc: string | null; date: string | null; unclear: string } {
  const r = isObj(raw) ? raw : {};
  const doc = typeof r.doc === "string" && ids.includes(r.doc.trim()) ? r.doc.trim() : null;
  const date = typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null;
  const unclear = typeof r.unclear === "string" ? r.unclear.trim().slice(0, FILL_LIMITS.unclear) : "";
  return { doc, date, unclear };
}

// ---------------------------------------------------------------------------
// the call

export interface FillTransportCall {
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
}
export type FillTransport = (call: FillTransportCall) => Promise<{ text: string; usage: { prompt: number; completion: number; total: number; cached: number } | null }>;

const groqTransport: FillTransport = (call) => groqJSONOnce({ system: call.system, user: call.user, temperature: call.temperature, reasoningEffort: "low", maxTokens: call.maxTokens });
let transport: FillTransport = groqTransport;

/** The unit tests stand in for Groq here; null puts the real client back. */
export function setFillTransportForTests(fn: FillTransport | null): void {
  transport = fn ?? groqTransport;
}

export interface FillCallInput {
  words: string;
  /** The form's card: the values are read for it. */
  card?: string;
  /** Instead, at most twelve lines "id | formatNo name": the form is picked. */
  candidates?: string;
  today: string;
  /** How long the minute's refill may be waited for before "busy" (0: never). */
  maxWaitMs?: number;
}

export type FillCallResult =
  | { kind: "values"; values: CheckedFill; usage: { total: number } | null }
  | { kind: "pick"; doc: string | null; date: string | null; unclear: string; usage: { total: number } | null };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The user message: the card (or the candidates) and what was said. */
export function fillUserMessage(input: Pick<FillCallInput, "words" | "card" | "candidates" | "today">): string {
  if (input.candidates) return `Today ${input.today}.\nFORMS:\n${input.candidates}\nSAID: ${input.words}`;
  return `${input.card ?? ""}\nSAID: ${input.words}`;
}

/** ONE CALL (see the header). Throws FillRefusal for the allowance, the minute and a model that does not answer. */
export async function runFillCall(input: FillCallInput): Promise<FillCallResult> {
  if (dailyAllowanceUsedUp()) throw new FillRefusal("allowance", "The assistant's allowance for today is used up.");
  const picking = !!input.candidates;
  const system = picking ? PICK_PROMPT : FILL_PROMPT;
  const user = fillUserMessage(input);
  const maxTokens = picking ? PICK_MAX_COMPLETION_TOKENS : FILL_MAX_COMPLETION_TOKENS;
  const room = minuteRoomFor(estimateRequestTokens(system.length + user.length, maxTokens));
  if (!room.ok) {
    if (room.waitMs <= (input.maxWaitMs ?? 0)) await sleep(room.waitMs + 250);
    else throw new FillRefusal("busy", "Mitra is busy for about a minute.", room.waitMs);
  }
  let reply: Awaited<ReturnType<FillTransport>>;
  try {
    reply = await transport({ system, user, maxTokens, temperature: 0 });
  } catch (err) {
    if (err instanceof GroqRefusal && err.status === 429) {
      if (err.perDay) throw new FillRefusal("allowance", "Groq's allowance for today is used up.");
      throw new FillRefusal("busy", "Mitra is busy for about a minute.", err.retryAfterMs ?? 60_000);
    }
    console.error("[mitra fill] the model did not answer:", err instanceof Error ? err.message : err);
    throw new FillRefusal("unavailable", "The model could not be reached.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.text);
  } catch {
    throw new FillRefusal("unavailable", "The model's answer was not JSON.");
  }
  const usage = reply.usage ? { total: reply.usage.total } : null;
  if (picking) {
    const ids = (input.candidates ?? "").split("\n").map((l) => l.split("|")[0].trim()).filter(Boolean);
    return { kind: "pick", ...checkPickReply(parsed, ids), usage };
  }
  return { kind: "values", values: checkFillReply(parsed), usage };
}

/** The request as the browser sends it (POST /api/assistant/fill), checked; or the one thing wrong with it. */
export function validateFillRequest(body: unknown): { ok: true; input: FillCallInput & { language: "en" | "hi" | "gu"; turnId?: string } } | { ok: false; error: string } {
  const b = isObj(body) ? body : null;
  if (!b) return { ok: false, error: "The request body must be a JSON object." };
  const { words, card, candidates, today, language, turnId } = b;
  if (typeof words !== "string" || !words.trim() || words.length > FILL_LIMITS.words) return { ok: false, error: `words must be text of 1 to ${FILL_LIMITS.words} characters.` };
  if (typeof today !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return { ok: false, error: "today must be an ISO date string." };
  if (language !== "en" && language !== "hi" && language !== "gu") return { ok: false, error: "language must be en, hi or gu." };
  if (card !== undefined && (typeof card !== "string" || card.length > FILL_LIMITS.card)) return { ok: false, error: `card must be text of at most ${FILL_LIMITS.card} characters.` };
  if (candidates !== undefined && (typeof candidates !== "string" || candidates.length > FILL_LIMITS.candidates || candidates.split("\n").length > FILL_LIMITS.candidateLines)) {
    return { ok: false, error: `candidates must be at most ${FILL_LIMITS.candidateLines} lines.` };
  }
  if (!card && !candidates) return { ok: false, error: "card or candidates is needed." };
  if (turnId !== undefined && (typeof turnId !== "string" || !/^[a-z0-9-]{1,64}$/i.test(turnId))) return { ok: false, error: "turnId must be a short id." };
  return {
    ok: true,
    input: {
      words: words.trim(),
      ...(typeof card === "string" && card ? { card } : {}),
      ...(typeof candidates === "string" && candidates ? { candidates } : {}),
      today,
      language,
      ...(typeof turnId === "string" ? { turnId } : {}),
    },
  };
}
