// ONE AI KEY FOR BOTH APPS (DCRS REQUIREMENTS §109): the AI service this server asks, chosen in one place.
//
// "i have added new api so make sure from now use that only everywhere for both mobile and audit software" (the
// owner, 12-Oct-2026). ChatGPT (OpenAI, api.openai.com) when CHATGPT_API_KEY or OPENAI_API_KEY is set, in this
// server's environment or in DCRS's backend/.env (config.ts, withDcrsAiSettings); else Groq with GROQ_API_KEY, as
// before §109; else none: people can sign in, but the assistant cannot answer yet. Every call is plain fetch, made
// through here: the agent's streamed answers (agent/model.ts), conversation titles (agent/titles.ts), the photos
// people attach (files/vision.ts) and what people say into the microphone (voice/transcriber.ts). The settings'
// names, the models and the way each model is asked are DCRS's (its backend/ai.ts), wherever they mean the same.
//
// No key leaves this file but in the Authorization header to the service: never in a log line, an error's words, an
// answer or a test (redactSecrets).
import type { Config } from './config.ts';
import { localDate } from './time.ts';

export type AiProvider = 'openai' | 'groq';

export const OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

/**
 * ChatGPT's models and the cost guard, DCRS's own (backend/ai.ts), each overridable by the same setting as in DCRS:
 * AI_CHAT_MODEL / AI_AGENT_MODEL, AI_SHORT_MODEL, AI_VISION_MODEL, AI_FALLBACK_MODEL, AI_TRANSCRIBE_MODEL and
 * AI_DAILY_TOKEN_BUDGET. Measured on the owner's key on 12-Oct-2026: gpt-5.4-mini with reasoning_effort "none" streams
 * its first words in about 0.65 s (1.1 s in Gujarati) and calls tools on /v1/chat/completions; gpt-4.1-mini, which does
 * not reason, is as quick and answers Gujarati well, so it answers when the first cannot; gpt-5.4-nano for the short
 * jobs; gpt-4o-mini-transcribe hears Gujarati, Hindi and English.
 */
export const OPENAI_DEFAULTS = {
  chat: 'gpt-5.4-mini',
  short: 'gpt-5.4-nano',
  vision: 'gpt-5.4-mini',
  fallback: 'gpt-4.1-mini',
  transcribe: 'gpt-4o-mini-transcribe',
  dailyTokens: 3_000_000,
} as const;

/** Groq's, as before §109: GROQ_MODEL, GROQ_TITLE_MODEL, GROQ_TRANSCRIPTION_MODEL and GROQ_VISION_MODEL. */
export const GROQ_DEFAULTS = {
  chat: 'openai/gpt-oss-120b',
  title: 'openai/gpt-oss-20b',
  transcribe: 'whisper-large-v3',
  vision: 'qwen/qwen3.8-27b',
} as const;

/** The service's address: OpenAI's, or Groq's OpenAI-compatible one. */
export function baseUrlOf(provider: AiProvider): string {
  return provider === 'openai' ? OPENAI_BASE_URL : GROQ_BASE_URL;
}

/** The service in words, for the log and the start-up line. */
export function serviceName(provider: AiProvider | null): string {
  return provider === 'openai' ? 'ChatGPT (OpenAI)' : provider === 'groq' ? 'Groq' : 'no AI service';
}

/**
 * The reasoning_effort an OpenAI model is sent: the least its family takes, so it answers at once and may call tools
 * on /v1/chat/completions (DCRS's openaiReasoningEffort, the same rule). The gpt-5.4 family (and 5.6, 6) refuses
 * function tools there with any other effort, or with none given (400, "use /v1/responses"; measured 12-Oct-2026);
 * gpt-5, gpt-5-mini and gpt-5-nano take "minimal" at least; the o-series "low"; gpt-4.1 and gpt-4o do not reason and are
 * sent nothing.
 */
export function openaiReasoningEffort(model: string): 'none' | 'minimal' | 'low' | null {
  const m = model.trim().toLowerCase();
  if (/^gpt-5(?:-mini|-nano)?(?:-\d{4}-\d{2}-\d{2})?$/.test(m)) return 'minimal';
  if (/^gpt-5\.\d/.test(m) || /^gpt-(?:[6-9]|\d{2,})(?:[.-]|$)/.test(m)) return 'none';
  if (/^o\d/.test(m)) return 'low';
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// WHEN THE SERVICE CANNOT ANSWER. Each failure is one of these, so the routes can say it in plain words (model.ts
// explainAiError) and nothing of the service's own client leaks into the rest of the server.

/** No AI key is set: CHATGPT_API_KEY (here or in DCRS's backend/.env), or GROQ_API_KEY. The assistant cannot answer yet. */
export class AiNotConfigured extends Error {
  constructor(message = 'No AI key is set: CHATGPT_API_KEY in DCRS\'s backend/.env or in server/.env, or GROQ_API_KEY.') {
    super(message);
    this.name = 'AiNotConfigured';
  }
}

/** The service's own words for a refusal: its code, its kind, the parameter it names and its message. */
export interface RefusalWords {
  code?: string | undefined;
  type?: string | undefined;
  param?: string | undefined;
  message?: string | undefined;
}

/** What the key has left of its limits, from the service's x-ratelimit-* headers: numbers and durations only. */
export type LimitNumbers = Partial<Record<'limitRequests' | 'remainingRequests' | 'limitTokens' | 'remainingTokens' | 'retryAfter', number>> &
  Partial<Record<'resetRequests' | 'resetTokens', string>>;

/** The service answered and refused the request. Its words are kept without any key (redactSecrets). */
export class AiApiError extends Error {
  /** The HTTP status; 0 for a refusal sent part-way through a stream. */
  readonly status: number;
  readonly code: string | undefined;
  readonly type: string | undefined;
  /** The parameter it named, such as "temperature". */
  readonly param: string | undefined;
  /** How long it asked to wait before trying again: set for a 429 that a wait mends, never for an account out of credit. */
  readonly retryInMs: number | undefined;
  readonly limits: LimitNumbers;

  constructor(status: number, words: RefusalWords = {}, extra: { retryInMs?: number | undefined; limits?: LimitNumbers } = {}) {
    super(words.message || `The AI service refused the request (${status || 'during the answer'}).`);
    this.name = 'AiApiError';
    this.status = status;
    this.code = words.code;
    this.type = words.type;
    this.param = words.param;
    this.retryInMs = extra.retryInMs;
    this.limits = extra.limits ?? {};
  }
}

/** No answer came, or it broke off: the network, a dropped connection, an answer that ended part-way. */
export class AiConnectionError extends Error {
  constructor(message = 'The AI service could not be reached.') {
    super(message);
    this.name = 'AiConnectionError';
  }
}

/** The service went quiet for too long. Not tried again: it already took that long. */
export class AiTimeoutError extends AiConnectionError {
  constructor(message = 'The AI service took too long to answer.') {
    super(message);
    this.name = 'AiTimeoutError';
  }
}

/** The person stopped the reply. */
export class AiAbortError extends Error {
  constructor() {
    super('The reply was stopped.');
    this.name = 'AiAbortError';
  }
}

/** Today's AI allowance (AI_DAILY_TOKEN_BUDGET) is used up: the model is not asked until tomorrow. */
export class AiAllowanceError extends Error {
  constructor() {
    super("Today's AI allowance is used up: the assistant answers again tomorrow.");
    this.name = 'AiAllowanceError';
  }
}

/** Whether a second model may answer a request the first refused: OpenAI's 400 (such as "use /v1/responses"), a model not on the account (403, 404), or a failure on its side (5xx). Never a wrong key (401) or an account out of credit (429). */
export function secondModelHelps(error: unknown): boolean {
  return error instanceof AiApiError && (error.status === 400 || error.status === 403 || error.status === 404 || error.status >= 500);
}

// ---------------------------------------------------------------------------------------------------------------------
// NO KEY IN A LOG LINE. A service's error can echo the key it was sent (OpenAI's 401 names it, partly hidden), and
// its sentences name the organization. So every word of the service's that is kept passes through here first.

/** `text` with every key taken out: the keys given, anything shaped like a key (sk-…, gsk_…), a Bearer value and an organization's id. */
export function redactSecrets(text: string, keys: readonly (string | undefined)[] = []): string {
  let out = String(text ?? '');
  for (const key of keys) if (key && key.length >= 8) out = out.split(key).join('[key]');
  return out
    .replace(/\b(?:sk|gsk|rk|sess)[-_][A-Za-z0-9*_-]{6,}/g, '[key]')
    .replace(/\bBearer\s+[^\s"',]+/gi, 'Bearer [key]')
    .replace(/\borg[-_][A-Za-z0-9]{4,}/g, '[organization]');
}

/** The service's words in an error body ({ error: { message, type, param, code } }, OpenAI's and Groq's shape). */
export function refusalWords(raw: unknown): RefusalWords {
  const outer = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const inner = outer && outer.error && typeof outer.error === 'object' ? (outer.error as Record<string, unknown>) : outer;
  const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);
  if (!inner) return {};
  return { code: text(inner.code), type: text(inner.type), param: text(inner.param), message: text(inner.message) };
}

// ---------------------------------------------------------------------------------------------------------------------
// WAITING WHEN ASKED TO. A 429 says how long to wait, in a header and in its sentence ("Please try again in 7.66s").

/** A length of time as the services write it, such as "7.66s", "2m59.56s" or "120ms", in milliseconds. */
export function durationMs(text: string | null | undefined): number | undefined {
  const written = text?.trim();
  if (!written) return undefined;
  const parts = [...written.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)];
  if (parts.length === 0 || parts.map((part) => part[0]).join('') !== written) return undefined;
  const unit: Record<string, number> = { h: 3_600_000, m: 60_000, s: 1_000, ms: 1 };
  return Math.round(parts.reduce((sum, part) => sum + Number(part[1]) * (unit[part[2]!] ?? 0), 0));
}

/** How long a 429 asked to wait: retry-after-ms, else its own sentence (exact), else retry-after (whole seconds), else when the tokens are back, else 5 seconds. */
export function retryAfterMs(headers: Headers | undefined, message: string | undefined): number {
  const header = (name: string) => {
    const value = headers?.get(name);
    return value === null || value === undefined || value === '' || Number.isNaN(Number(value)) ? undefined : Number(value);
  };
  const asked =
    header('retry-after-ms') ??
    durationMs(/try again in ([0-9.hms]+?)\.?(?:\s|$)/i.exec(message ?? '')?.[1]) ??
    (header('retry-after') === undefined ? undefined : header('retry-after')! * 1000) ??
    durationMs(headers?.get('x-ratelimit-reset-tokens')) ??
    5_000;
  return Math.max(0, Math.round(asked));
}

const present = <T extends Record<string, unknown>>(values: T): Partial<T> =>
  Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== null)) as Partial<T>;

/** What is left of the key's limits, from the headers the service answers with (OpenAI's and Groq's names are the same). */
export function limitNumbers(headers: Headers | undefined): LimitNumbers {
  if (!headers) return {};
  const number = (name: string) => {
    const value = headers.get(name);
    return value === null || value === '' || Number.isNaN(Number(value)) ? undefined : Number(value);
  };
  const text = (name: string) => headers.get(name) ?? undefined;
  return present({
    limitRequests: number('x-ratelimit-limit-requests'),
    remainingRequests: number('x-ratelimit-remaining-requests'),
    resetRequests: text('x-ratelimit-reset-requests'),
    limitTokens: number('x-ratelimit-limit-tokens'),
    remainingTokens: number('x-ratelimit-remaining-tokens'),
    resetTokens: text('x-ratelimit-reset-tokens'),
    retryAfter: number('retry-after'),
  }) as LimitNumbers;
}

// ---------------------------------------------------------------------------------------------------------------------
// THE PLANT'S DAILY ALLOWANCE, A COST GUARD (DCRS REQUIREMENTS §109). OpenAI is paid by the token, so this server's
// use is capped by AI_DAILY_TOKEN_BUDGET, 3,000,000 tokens a day unless set (DCRS counts its own calls against the same
// figure). Every answer's tokens are added up here, per day on the plant's clock (REPORT_TIME_ZONE): what each answer
// reports (usage.total_tokens), the transcriptions' too. At 90% the agent stops asking the model: the person is told,
// in their language, that the assistant answers again tomorrow (agent.ts), and the last tenth is kept for titles, photos
// and the microphone. At 100% nothing is asked of the model until the next day. The server's log says each, once.
//
// In memory, on purpose: a count that starts again when the server restarts can only err towards asking the model
// once more, and the service's own limits stand behind it. On a Groq key there is none unless AI_DAILY_TOKEN_BUDGET or
// GROQ_DAILY_TOKEN_BUDGET is set: Groq's own limits stand there, as before §109.

/** The share of the day's allowance after which the agent stops asking the model. */
const AGENT_SHARE = 0.9;

/** Today's use, in numbers. */
export interface AiUsage {
  service: AiProvider | null;
  /** Tokens a day; null when there is no allowance. */
  budget: number | null;
  usedToday: number;
  /** Where the agent stops asking the model: 90% of the allowance. */
  agentStopsAt: number | null;
  /** Today on the plant's clock, YYYY-MM-DD. */
  day: string;
}

export interface AiMeter {
  /** Adds a call's tokens to today's count (anything that isn't a positive number is ignored). */
  count(tokens: unknown): void;
  usedToday(): number;
  /** 90% of today's allowance is used: the agent no longer asks the model. */
  agentStopped(): boolean;
  /** All of today's allowance is used: nothing is asked of the model. */
  spent(): boolean;
  usage(): AiUsage;
}

const thousands = (n: number): string => Math.round(n).toLocaleString('en-US');

export function aiMeter({
  provider,
  budget,
  timeZone,
  warn = () => {},
  now = () => new Date(),
}: {
  provider: AiProvider | null;
  budget: number | null;
  timeZone: string;
  warn?: (line: string) => void;
  now?: () => Date;
}): AiMeter {
  let meter = { day: '', used: 0, said: 0 };
  const today = () => {
    let day: string;
    try {
      day = localDate(now(), timeZone);
    } catch {
      day = now().toISOString().slice(0, 10);
    }
    if (meter.day !== day) meter = { day, used: 0, said: 0 };
    return meter;
  };
  return {
    count(tokens) {
      if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens <= 0) return;
      const m = today();
      m.used += Math.round(tokens);
      if (budget === null) return;
      if (m.said < 2 && m.used >= budget) {
        m.said = 2;
        warn(`The AI allowance for today is used up: ${thousands(m.used)} of ${thousands(budget)} tokens (AI_DAILY_TOKEN_BUDGET). Nothing more is asked of the model until tomorrow.`);
      } else if (m.said < 1 && m.used >= budget * AGENT_SHARE) {
        m.said = 1;
        warn(
          `The AI allowance for today is 90% used: ${thousands(m.used)} of ${thousands(budget)} tokens (AI_DAILY_TOKEN_BUDGET). Mitra answers no more questions with the model until tomorrow, and says so; the rest is kept for titles, photos and the microphone.`,
        );
      }
    },
    usedToday: () => today().used,
    agentStopped: () => budget !== null && today().used >= budget * AGENT_SHARE,
    spent: () => budget !== null && today().used >= budget,
    usage() {
      const m = today();
      return { service: provider, budget, usedToday: m.used, agentStopsAt: budget === null ? null : Math.floor(budget * AGENT_SHARE), day: m.day };
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// ASKING THE SERVICE.

/** One chat request (/chat/completions), before it is shaped for the model that answers it. */
export interface ChatRequest {
  model: string;
  messages: readonly unknown[];
  tools?: readonly unknown[] | undefined;
  stream?: boolean;
  temperature?: number | undefined;
  maxTokens: number;
  /** Groq only: how hard gpt-oss thinks (GROQ_REASONING_EFFORT; low for titles). An OpenAI model is sent the least its family takes. */
  groqEffort?: '' | 'low' | 'medium' | 'high' | undefined;
  /** OpenAI only: one name for the requests that start the same, so the service finds its cache of their start more often. */
  cacheKey?: string | undefined;
}

/** A chat answer as the services give it, not streamed (or put together from a stream: agent/model.ts). */
export interface Completion {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: CompletionChoice[];
  usage?: Usage | undefined;
}

export type FinishReason = 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call' | null;

export interface CompletionChoice {
  index: number;
  finish_reason: FinishReason;
  message: { role: 'assistant'; content: string | null; tool_calls?: ToolCall[]; reasoning?: string; refusal?: string | null };
}

/** A call the model asked for; `arguments` is JSON text. */
export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/** The tokens an answer used, as OpenAI and Groq report them (Groq adds its queue, prompt and completion times). */
export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number } | null;
  completion_tokens_details?: { reasoning_tokens?: number } | null;
  queue_time?: number;
  prompt_time?: number;
  completion_time?: number;
}

/** What a parameter a model refused by name, with a 400, may be left out of: learnt once, for as long as the server runs. */
const DROPPABLE = new Set(['temperature', 'top_p', 'parallel_tool_calls', 'prompt_cache_key']);
/** A model the account cannot use (403, 404) is skipped this long, so it costs one round trip in ten minutes, not one a question. */
const UNUSABLE_FOR_MS = 10 * 60_000;

export interface AiService {
  /** Which service answers, or null when no key is set. */
  readonly provider: AiProvider | null;
  /** Today's allowance, shared by every call this server makes. */
  readonly meter: AiMeter;
  /** Throws AiNotConfigured with no key, and AiAllowanceError once today's allowance is used (for the agent, 90% of it). */
  ready(use: 'agent' | 'other'): void;
  /** The body of a chat request for its model: the reasoning effort its family takes, max_completion_tokens, and nothing it refused before. */
  chatBody(request: ChatRequest): Record<string, unknown>;
  /** POSTs to the service: its answer, whatever the status. Throws AiAbortError, AiTimeoutError or AiConnectionError when none came. */
  send(path: string, body: string | FormData, options?: { signal?: AbortSignal | undefined; timeoutMs?: number | undefined }): Promise<Response>;
  /** A refusal read into an AiApiError: its status, code and parameter, how long to wait, and its words without any key. */
  refusal(response: Response): Promise<AiApiError>;
  /** Learns from a 400 naming a parameter this model does not take, which `body` sent: it is left out from now on. Says whether it learnt one. */
  learnRefused(model: string, error: AiApiError, body: Record<string, unknown>): boolean;
  /** A model the account cannot use (403, 404): skipped for ten minutes. */
  setUnusable(model: string): void;
  usable(model: string): boolean;
  /**
   * One chat answer, not streamed (a title, a photo), with its tokens counted: `models` in turn, the next only when
   * secondModelHelps; a parameter a model refuses is left out and the question asked again. Throws the last failure.
   */
  complete(models: readonly string[], request: Omit<ChatRequest, 'model' | 'stream'>, options: { timeoutMs: number; use: 'agent' | 'other' }): Promise<Completion>;
}

export interface AiServiceOptions {
  /** Stands in for the network in tests. */
  fetch?: typeof fetch;
  /** Where the allowance's lines go: the server's log. */
  warn?: (line: string) => void;
  now?: () => Date;
}

type ServiceConfig = Pick<Config, 'aiProvider' | 'aiApiKey' | 'dailyTokenBudget' | 'reportTimeZone'>;

export function aiService(config: ServiceConfig, options: AiServiceOptions = {}): AiService {
  const provider = config.aiProvider && config.aiApiKey ? config.aiProvider : null;
  const key = provider ? config.aiApiKey : undefined;
  const base = provider ? baseUrlOf(provider) : '';
  const send = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());
  const meter = aiMeter({ provider, budget: config.dailyTokenBudget, timeZone: config.reportTimeZone, warn: options.warn, now });
  const refusedParams = new Map<string, Set<string>>();
  const unusableUntil = new Map<string, number>();
  const redact = (text: string) => redactSecrets(text, [key]);

  const service: AiService = {
    provider,
    meter,

    ready(use) {
      if (!provider) throw new AiNotConfigured();
      if (use === 'agent' ? meter.agentStopped() : meter.spent()) throw new AiAllowanceError();
    },

    chatBody(request) {
      const openai = provider === 'openai';
      const body: Record<string, unknown> = { model: request.model, messages: request.messages };
      if (request.tools && request.tools.length > 0) {
        body.tools = request.tools;
        body.tool_choice = 'auto';
        // Several lookups in one answer: the fewest rounds (§109). Groq's gpt-oss calls one tool at a time.
        if (openai) body.parallel_tool_calls = true;
      }
      if (request.temperature !== undefined) body.temperature = request.temperature;
      const effort = openai ? openaiReasoningEffort(request.model) : request.groqEffort || null;
      if (effort) body.reasoning_effort = effort;
      // Never max_tokens: the gpt-5 families refuse it.
      body.max_completion_tokens = request.maxTokens;
      if (request.stream) {
        body.stream = true;
        // OpenAI says what a streamed answer used only when asked, and the cost guard counts it; Groq says it anyway.
        if (openai) body.stream_options = { include_usage: true };
      }
      if (openai && request.cacheKey) body.prompt_cache_key = request.cacheKey;
      for (const name of refusedParams.get(request.model) ?? []) delete body[name];
      return body;
    },

    async send(path, body, { signal, timeoutMs } = {}) {
      if (!provider || !key) throw new AiNotConfigured();
      const timer = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined;
      const signals = [signal, timer].filter((s): s is AbortSignal => s !== undefined);
      try {
        return await send(`${base}${path}`, {
          method: 'POST',
          // A form writes its own Content-Type, with the boundary.
          headers: typeof body === 'string' ? { 'content-type': 'application/json', authorization: `Bearer ${key}` } : { authorization: `Bearer ${key}` },
          body,
          ...(signals.length > 0 ? { signal: signals.length === 1 ? signals[0] : AbortSignal.any(signals) } : {}),
        });
      } catch {
        if (signal?.aborted) throw new AiAbortError();
        if (timer?.aborted) throw new AiTimeoutError();
        throw new AiConnectionError();
      }
    },

    async refusal(response) {
      const text = await response.text().catch(() => '');
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { error: { message: text.slice(0, 300) } };
      }
      const words = refusalWords(parsed);
      const message = words.message ? redact(words.message).slice(0, 500) : undefined;
      // A 429 is waited out as it asks, unless the account has no credit left: no wait mends that.
      const waits = response.status === 429 && words.code !== 'insufficient_quota';
      return new AiApiError(
        response.status,
        { ...words, message },
        { retryInMs: waits ? retryAfterMs(response.headers, words.message) : undefined, limits: limitNumbers(response.headers) },
      );
    },

    learnRefused(model, error, body) {
      if (error.status !== 400) return false;
      const named = [...DROPPABLE].find((name) => name in body && (error.param === name || new RegExp(`\\b${name}\\b`).test(error.message)));
      if (!named) return false;
      const refused = refusedParams.get(model) ?? new Set<string>();
      refused.add(named);
      refusedParams.set(model, refused);
      options.warn?.(`AI: ${model} does not take ${named}; it is asked without it from now on.`);
      return true;
    },

    setUnusable(model) {
      unusableUntil.set(model, now().getTime() + UNUSABLE_FOR_MS);
    },

    usable(model) {
      return (unusableUntil.get(model) ?? 0) <= now().getTime();
    },

    async complete(models, request, { timeoutMs, use }) {
      service.ready(use);
      const unique = [...new Set(models.filter(Boolean))];
      const usable = unique.filter((model) => service.usable(model));
      const order = usable.length > 0 ? usable : unique;
      let last: unknown = new AiConnectionError();
      for (const [i, model] of order.entries()) {
        for (let tries = 0; tries <= DROPPABLE.size; tries++) {
          const body = service.chatBody({ ...request, model });
          const response = await service.send('/chat/completions', JSON.stringify(body), { timeoutMs });
          if (response.ok) {
            let completion: Completion;
            try {
              completion = (await response.json()) as Completion;
            } catch {
              throw new AiConnectionError('The AI service answered in a way this server does not understand.');
            }
            meter.count(completion?.usage?.total_tokens);
            if (!Array.isArray(completion?.choices)) throw new AiConnectionError('The AI service answered in a way this server does not understand.');
            return completion;
          }
          const error = await service.refusal(response);
          if (service.learnRefused(model, error, body)) continue;
          last = error;
          break;
        }
        const another = i < order.length - 1;
        if (!(provider === 'openai' && another && secondModelHelps(last))) throw last;
        if ((last as AiApiError).status === 403 || (last as AiApiError).status === 404) service.setUnusable(model);
        options.warn?.(`AI: ${model} could not answer (${(last as AiApiError).status}); ${order[i + 1]} answers instead. ${(last as AiApiError).message.slice(0, 200)}`);
      }
      throw last;
    },
  };
  return service;
}
