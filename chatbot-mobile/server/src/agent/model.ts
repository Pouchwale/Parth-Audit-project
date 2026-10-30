import { performance } from 'node:perf_hooks';
import type { FastifyBaseLogger } from 'fastify';
import {
  AiAbortError,
  AiAllowanceError,
  AiApiError,
  AiConnectionError,
  AiNotConfigured,
  AiTimeoutError,
  limitNumbers,
  redactSecrets,
  refusalWords,
  secondModelHelps,
  type AiProvider,
  type AiService,
  type Completion,
  type FinishReason,
  type ToolCall,
  type Usage,
} from '../ai.ts';
import type { Config } from '../config.ts';
import { HttpError } from '../http.ts';

export type { Completion, ToolCall } from '../ai.ts';

/** One tool the model may call: an action of a connected system (agent.ts toolDefinitions), in OpenAI's function shape. */
export interface Tool {
  type: 'function';
  function: { name: string; description?: string; parameters?: Record<string, unknown> };
}

/** A tool's answer, for the model. */
export interface ToolMessage {
  role: 'tool';
  tool_call_id: string;
  content: string;
}

/** A message of a conversation as the model is sent it. `reasoning` is what Groq's gpt-oss thought; ChatGPT is never sent it. */
export type Message =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[]; reasoning?: string }
  | ToolMessage;

export interface ModelRequest {
  /**
   * The standing instructions. They and the tools are the same for every person and every turn, to the byte, so the
   * service can reuse its work on them (prompt caching: OpenAI's for a start of 1,024 tokens or more, Groq's for gpt-oss),
   * which makes the first words come sooner and costs less.
   */
  system: string;
  tools: Tool[];
  /** What differs between people and days: who is asking, and today's date. It follows the instructions and tools. */
  context?: string | undefined;
  messages: Message[];
}

/** How long a turn may still wait for a busy model, in all. Every wait is taken from it. */
export interface WaitBudget {
  leftMs: number;
}

export interface ModelOptions {
  /** Aborts the call when the person stops the reply. */
  signal?: AbortSignal | undefined;
  /** Receives the reply's text as it is written. */
  onText?: ((delta: string) => void) | undefined;
  /** Told how long the call will wait when the model is busy, and null when it goes on. */
  onWait?: ((retryInMs: number | null) => void) | undefined;
  /** What the turn may still wait. Without it, the call may wait as long as a whole turn may. */
  wait?: WaitBudget | undefined;
  /** Gets one line for every call made to the model: names and numbers, never the key or anybody's words. */
  log?: FastifyBaseLogger | undefined;
}

/** One call to the model. Tests swap in a scripted fake, or stand in for the service at the network edge. */
export type Model = (request: ModelRequest, options?: ModelOptions) => Promise<Completion>;

/** Thrown when the model's limits keep it from answering sooner than a person should be kept waiting. */
export class ModelBusy extends Error {
  /** When the service said to try again, from now. */
  readonly retryInMs: number;

  constructor(retryInMs: number) {
    super('The model is busy');
    this.name = 'ModelBusy';
    this.retryInMs = retryInMs;
  }
}

/** A wait this short is just waited: nobody is told. */
export const SHORT_WAIT_MS = 2_000;
/** The longest one wait for the model's limits that is worth making. Past it, the person retries when they choose. */
export const MAX_WAIT_MS = 30_000;
/** All the waiting for the model's limits that one turn may do. Per-minute limits clear within a minute. */
export const TURN_WAIT_MS = 60_000;
/** Added to the wait the service asks for, which it rounds. */
const WAIT_MARGIN_MS = 250;
/** How often one call asks the service at most, whatever the reasons. */
const MAX_ATTEMPTS = 6;
/** A dropped connection or a server error is tried again this often, after 0.5 and 1 second. */
const TRANSIENT_RETRIES = 2;
/** The most one answer may write. A cap, not a cost: a round is usually a few hundred tokens. */
const MAX_COMPLETION_TOKENS = 8192;
/** One name for every agent request, whose start is the same for everyone (prompt.ts): OpenAI finds its cache of it more often. */
const PROMPT_CACHE_KEY = 'mitra-agent';

/**
 * The messages as the service is sent them: the standing instructions, then what differs, then the conversation. To
 * ChatGPT only what it takes: a model's reasoning, which Groq's gpt-oss writes and Groq takes back, is left out.
 */
export function wireMessages(request: ModelRequest, provider: AiProvider | null = null): Message[] {
  const conversation =
    provider === 'openai'
      ? request.messages.map((message) => {
          if (message.role !== 'assistant' || !('reasoning' in message)) return message;
          const { reasoning: _, ...rest } = message;
          return rest;
        })
      : request.messages;
  return [
    { role: 'system', content: request.system },
    // A message of its own after the instructions and the tools, never part of them: see ModelRequest.system.
    ...(request.context ? [{ role: 'user' as const, content: request.context }] : []),
    ...conversation,
  ];
}

/**
 * The model, on ChatGPT (or Groq for a server with no OpenAI key; DCRS REQUIREMENTS §109). Its answer streams to the
 * person from its first word. Every call is logged. A short wait the service asks for is just waited; a longer one goes
 * to the second model when there is one, or is waited with the person told (onWait); a wait too long ends as
 * ModelBusy, for the person to retry. On ChatGPT the second model also answers when the first cannot (secondModelHelps),
 * and a parameter a model refuses by name is left out of its requests from then on.
 */
export function aiModel(config: Config, service: AiService): Model {
  const models = config.fallbackModel && config.fallbackModel !== config.model ? [config.model, config.fallbackModel] : [config.model];
  // When each model's allowance is back, as the service last said. The limits are the whole key's, so this is shared
  // by everyone's calls: a model that has just turned a call away is not asked again until then.
  const busyUntil = new Map<string, number>();
  const openai = service.provider === 'openai';

  return async (request, { signal, onText, onWait, wait = { leftMs: TURN_WAIT_MS }, log } = {}) => {
    service.ready('agent');
    const messages = wireMessages(request, service.provider);
    const size = { messages: messages.length, requestChars: JSON.stringify(messages).length + JSON.stringify(request.tools).length };
    let streamed = false;
    const forward = (delta: string) => {
      streamed = true;
      onText?.(delta);
    };
    // The models that turned this very request away for their limits. A model busy for someone else's larger request
    // is still asked.
    const turnedDown = new Set<string>();
    // The models that could not answer this request at all (ChatGPT): the second model answers it.
    const couldNot = new Set<string>();
    let temperature = 0.3;
    let transient = 0;

    for (let attempt = 1; ; attempt++) {
      const left = models.filter((m) => !couldNot.has(m));
      const usable = left.filter((m) => service.usable(m));
      const model = await nextModel(usable.length > 0 ? usable : left, busyUntil, turnedDown, wait, onWait, signal);
      const body = service.chatBody({
        model,
        messages,
        tools: request.tools,
        stream: true,
        // A low temperature for reliable tool calls (Groq's advice); a model that refuses it is asked without it.
        temperature,
        maxTokens: MAX_COMPLETION_TOKENS,
        groqEffort: config.reasoningEffort,
        cacheKey: PROMPT_CACHE_KEY,
      });
      const started = performance.now();
      const took = () => Math.round(performance.now() - started);
      try {
        const { completion, headers, firstByteMs, firstWordMs } = await streamCompletion(service, body, signal, forward);
        service.meter.count(completion.usage?.total_tokens);
        const choice = completion.choices[0];
        log?.info(
          {
            service: service.provider,
            model,
            attempt,
            ms: took(),
            firstByteMs,
            ...(firstWordMs === undefined ? {} : { firstWordMs }),
            ...size,
            finishReason: choice?.finish_reason,
            toolCalls: choice?.message.tool_calls?.length ?? 0,
            ...usageNumbers(completion.usage),
            ...limitNumbers(headers),
            tokensToday: service.meter.usedToday(),
          },
          'model call',
        );
        return completion;
      } catch (error) {
        const refused = error instanceof AiApiError ? error : undefined;
        log?.warn(
          {
            service: service.provider,
            model,
            attempt,
            ms: took(),
            ...size,
            failed: failureName(error, signal),
            ...(refused ? { ...(refused.status ? { status: refused.status } : {}), ...refusalNumbers(refused), ...refused.limits } : {}),
            ...(refused?.retryInMs === undefined ? {} : { retryInMs: refused.retryInMs }),
          },
          'model call',
        );
        // Not once the person has stopped the reply or seen part of it: what they saw can't be taken back here.
        if (signal?.aborted || streamed || attempt >= MAX_ATTEMPTS) throw error;
        if (refused) {
          if (refused.retryInMs !== undefined) {
            busyUntil.set(model, Date.now() + refused.retryInMs);
            turnedDown.add(model);
            continue;
          }
          // Such as a temperature the model does not take: learnt, and asked again without it.
          if (service.learnRefused(model, refused, body)) continue;
          // Groq rejects a response whose tool call it can't parse; a second, colder try usually works.
          if (isFailedToolCall(refused) && temperature > 0) {
            temperature = 0;
            continue;
          }
          if (openai && secondModelHelps(refused) && models.some((m) => m !== model && !couldNot.has(m))) {
            if (refused.status === 403 || refused.status === 404) service.setUnusable(model);
            couldNot.add(model);
            continue;
          }
        }
        if (isTransient(error) && transient < TRANSIENT_RETRIES) {
          await sleep(500 * 2 ** transient++, signal);
          continue;
        }
        throw error;
      }
    }
  };
}

/**
 * The model to ask now: the first whose allowance is back, or back in a moment. When every model is busy, the one
 * that is back soonest, after waiting for it (the person is told of any wait they would notice), or at once when it
 * has not yet turned this request down. Throws ModelBusy when the wait is longer than the person should be kept.
 */
async function nextModel(
  models: readonly string[],
  busyUntil: ReadonlyMap<string, number>,
  turnedDown: ReadonlySet<string>,
  wait: WaitBudget,
  onWait: ModelOptions['onWait'],
  signal: AbortSignal | undefined,
): Promise<string> {
  const now = Date.now();
  const waits = models.map((model) => ({ model, ms: Math.max(0, (busyUntil.get(model) ?? 0) - now) }));
  const soon = waits.find(({ ms }) => ms <= SHORT_WAIT_MS);
  const { model, ms } = soon ?? waits.reduce((best, next) => (next.ms < best.ms ? next : best));
  if (ms === 0) return model;

  const pause = ms + WAIT_MARGIN_MS;
  if (pause > MAX_WAIT_MS || pause > wait.leftMs) {
    // Busy with someone else's request, which may have been larger: this one is still worth asking once.
    if (!turnedDown.has(model)) return model;
    throw new ModelBusy(ms);
  }
  const told = ms > SHORT_WAIT_MS;
  if (told) onWait?.(pause);
  wait.leftMs -= pause;
  try {
    await sleep(pause, signal);
  } finally {
    if (told) onWait?.(null);
  }
  return model;
}

/** Waits, unless the person stops the reply first. */
function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AiAbortError());
    const stop = () => {
      clearTimeout(timer);
      reject(new AiAbortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', stop);
      resolve();
    }, ms);
    signal?.addEventListener('abort', stop, { once: true });
  });
}

// A stream that says nothing for this long is cut off: the wait for it to start, and between its pieces.
const STALLED_MS = 60_000;
// How long a stream that has said [DONE] is given to end (readToEnd).
const END_WAIT_MS = 1_000;

/** Reads what is left of a stream, up to its end, for at most `ms`. Says whether it ended. */
async function readToEnd(reader: ReadableStreamDefaultReader<Uint8Array>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<'late'>((resolve) => {
    timer = setTimeout(() => resolve('late'), ms);
  });
  try {
    for (;;) {
      const next = await Promise.race([reader.read(), late]);
      if (next === 'late') return false;
      if (next.done) return true;
    }
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

interface Streamed {
  completion: Completion;
  /** The response's headers, which carry what is left of the key's limits. */
  headers: Headers | undefined;
  /** How long the service took to start answering. */
  firstByteMs: number;
  /** How long until the answer's first words (or first tool call): what a person waits for. */
  firstWordMs: number | undefined;
}

/** One piece of a streamed answer, as OpenAI and Groq send it. */
interface Chunk {
  id?: string;
  created?: number;
  choices?: {
    delta?: {
      content?: string | null;
      reasoning?: string | null;
      refusal?: string | null;
      tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[];
    };
    finish_reason?: FinishReason;
  }[];
  usage?: Usage | null;
  x_groq?: { usage?: Usage } | null;
  error?: unknown;
}

/**
 * Streams one completion (server-sent events, "data: {chunk}" lines and "data: [DONE]"), passing its text on as it
 * arrives, and puts together what a call that is not streamed answers.
 */
async function streamCompletion(service: AiService, body: Record<string, unknown>, signal: AbortSignal | undefined, onText: (delta: string) => void): Promise<Streamed> {
  const stalled = new AbortController();
  const watchdog = setTimeout(() => stalled.abort(), STALLED_MS);
  const started = performance.now();
  // Why the answer broke off: the person stopping it, a minute without a word, or the network.
  const lost = (error: unknown): unknown => {
    if (signal?.aborted) return new AiAbortError();
    if (stalled.signal.aborted) return new AiTimeoutError('The AI service stopped responding.');
    if (error instanceof AiApiError || error instanceof AiConnectionError) return error;
    return new AiConnectionError('The connection to the AI service was lost.');
  };

  let id = '';
  let created = 0;
  let content = '';
  let reasoning = '';
  let finishReason: FinishReason = null;
  let usage: Usage | undefined;
  let firstWordMs: number | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let finished = false;
  const toolCalls = new Map<number, ToolCall>();
  const said = () => (firstWordMs ??= Math.round(performance.now() - started));

  const take = (chunk: Chunk) => {
    // A refusal part-way through the answer (Groq's tool_use_failed, say) comes as an error of its own.
    if (chunk.error) throw new AiApiError(0, redactedWords(chunk.error));
    id ||= chunk.id ?? '';
    created ||= chunk.created ?? 0;
    // The tokens used come with the last piece: OpenAI's when asked (stream_options), Groq's in x_groq.
    usage = chunk.x_groq?.usage ?? chunk.usage ?? usage;
    const choice = chunk.choices?.[0];
    if (!choice) return;
    const delta = choice.delta ?? {};
    if (delta.reasoning) reasoning += delta.reasoning;
    // A model that declines says why in `refusal`: those are its words to the person, as DCRS shows them.
    for (const words of [delta.content, delta.refusal]) {
      if (!words) continue;
      said();
      content += words;
      onText(words);
    }
    // A tool call can arrive in pieces: its id and name once, its arguments in fragments.
    for (const piece of delta.tool_calls ?? []) {
      said();
      const call = toolCalls.get(piece.index) ?? { id: '', type: 'function', function: { name: '', arguments: '' } };
      toolCalls.set(piece.index, call);
      if (piece.id) call.id = piece.id;
      if (piece.function?.name) call.function.name = piece.function.name;
      call.function.arguments += piece.function?.arguments ?? '';
    }
    finishReason = choice.finish_reason ?? finishReason;
  };

  try {
    const response = await service.send('/chat/completions', JSON.stringify(body), { signal: signal ? AbortSignal.any([signal, stalled.signal]) : stalled.signal });
    if (!response.ok) throw await service.refusal(response);
    if (!response.body) throw new AiConnectionError('The AI service answered without a body.');
    const firstByteMs = Math.round(performance.now() - started);
    watchdog.refresh();

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let data: string[] = [];
    let done = false;
    const event = () => {
      const payload = data.join('\n');
      data = [];
      if (payload === '[DONE]') done = true;
      else if (payload) take(JSON.parse(payload) as Chunk);
    };
    while (!done) {
      const { value, done: ended } = await reader.read();
      if (ended) {
        finished = true;
        break;
      }
      watchdog.refresh();
      buffer += decoder.decode(value, { stream: true });
      for (let newline = buffer.indexOf('\n'); newline >= 0 && !done; newline = buffer.indexOf('\n')) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (line === '') event();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
        // Comments (":") and "event:" lines carry nothing an answer needs.
      }
    }
    if (!done && data.length > 0) event();
    // The service ends the stream right after [DONE]. Reading it to its end lets the connection go back to the pool, so
    // the turn's next round needs no new connection (a TLS handshake: hundreds of milliseconds from the plant); a
    // stream given up instead is closed with its connection. Never waited on for long.
    if (done && !finished) finished = await readToEnd(reader, END_WAIT_MS);

    // An abort can end the stream part-way through a tool call, so nothing of it may be used.
    if (signal?.aborted) throw new AiAbortError();
    if (!finishReason) throw new AiConnectionError('The answer from the AI service ended early.');

    const calls = [...toolCalls].sort(([a], [b]) => a - b).map(([, call]) => call);
    return {
      headers: response.headers,
      firstByteMs,
      firstWordMs,
      completion: {
        id,
        object: 'chat.completion',
        created,
        model: String(body.model),
        choices: [
          {
            index: 0,
            finish_reason: finishReason,
            message: {
              role: 'assistant',
              content,
              ...(calls.length > 0 ? { tool_calls: calls } : {}),
              ...(reasoning ? { reasoning } : {}),
            },
          },
        ],
        ...(usage ? { usage } : {}),
      },
    };
  } catch (error) {
    throw lost(error);
  } finally {
    clearTimeout(watchdog);
    // An answer read to its [DONE], or one given up part-way: the connection is let go either way.
    if (reader && !finished) void reader.cancel().catch(() => {});
  }
}

/** A refusal sent inside a stream, its words without any key. */
function redactedWords(raw: unknown) {
  const words = refusalWords(raw);
  return { ...words, message: words.message ? redactSecrets(words.message).slice(0, 500) : undefined };
}

const present = <T extends Record<string, unknown>>(values: T): Partial<T> =>
  Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== null)) as Partial<T>;

const milliseconds = (seconds: number | undefined) => (seconds === undefined ? undefined : Math.round(seconds * 1000));

/** The tokens a call used and where its time went, from the service's usage block. */
function usageNumbers(usage: Usage | undefined) {
  if (!usage) return {};
  return present({
    promptTokens: usage.prompt_tokens,
    // The part of the prompt the service had kept from an earlier call: quicker, and cheaper.
    cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
    completionTokens: usage.completion_tokens,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens,
    queueMs: milliseconds(usage.queue_time),
    promptMs: milliseconds(usage.prompt_time),
    completionMs: milliseconds(usage.completion_time),
  });
}

/**
 * Why the service turned a call down, as names and numbers: its code, the parameter it named, and for a limit which one
 * it was (such as TPM) with how much of it was used and asked for. For anything but a limit, its own sentence too,
 * without any key or organization (ai.ts redactSecrets), so the log says what to put right.
 */
function refusalNumbers(error: AiApiError) {
  const limit = /\((TPM|TPD|RPM|RPD|ITPM|OTPM)\)[^0-9]*Limit (\d+), Used (\d+), Requested (\d+)/.exec(error.message);
  return present({
    code: error.code,
    type: error.type,
    param: error.param,
    limit: limit?.[1],
    limitSize: limit ? Number(limit[2]) : undefined,
    limitUsed: limit ? Number(limit[3]) : undefined,
    requested: limit ? Number(limit[4]) : undefined,
    reason: error.status === 429 ? undefined : error.message.slice(0, 200),
  });
}

function failureName(error: unknown, signal: AbortSignal | undefined): string {
  if (signal?.aborted || error instanceof AiAbortError) return 'stopped';
  if (error instanceof AiApiError) {
    if (error.code === 'insufficient_quota') return 'no_credit';
    if (error.status === 429) return 'rate_limited';
    return error.code ?? 'refused';
  }
  if (error instanceof AiTimeoutError) return 'timed_out';
  if (error instanceof AiConnectionError) return 'connection';
  if (error instanceof AiAllowanceError) return 'allowance';
  return 'error';
}

/** A dropped connection, or an error on the service's side: worth another try. A timeout is not: it already took a minute. */
function isTransient(error: unknown): boolean {
  if (error instanceof AiTimeoutError) return false;
  if (error instanceof AiConnectionError) return true;
  return error instanceof AiApiError && (error.status === 408 || error.status === 409 || error.status >= 500);
}

/** Groq rejected a tool call it couldn't parse: before the response (400) or part-way through a stream. */
export function isFailedToolCall(error: unknown): boolean {
  return error instanceof AiApiError && error.code === 'tool_use_failed';
}

/** The service turned the request down for its size: more tokens than the model, or the key's tier, takes in one request. */
export function isRequestTooLarge(error: unknown): boolean {
  return error instanceof AiApiError && (error.status === 413 || error.code === 'context_length_exceeded');
}

/** "Try again in a minute", or in about how many minutes or hours. */
export function busyMessage(retryInMs: number | undefined): string {
  const busy = 'The assistant is busy right now.';
  if (retryInMs === undefined || retryInMs <= 90_000) return `${busy} Try again in a minute.`;
  const minutes = Math.ceil(retryInMs / 60_000);
  if (minutes <= 90) return `${busy} Try again in about ${minutes} minutes.`;
  const hours = Math.round(minutes / 60);
  return `${busy} Try again in about ${hours} ${hours === 1 ? 'hour' : 'hours'}.`;
}

/** Turns a failed call to the AI service into an error that is safe to show the person. Other errors are returned unchanged. */
export function explainAiError(error: unknown, log: FastifyBaseLogger): unknown {
  if (error instanceof AiNotConfigured) {
    return new HttpError(503, 'assistant_not_configured', "The assistant isn't set up yet. Ask an administrator to add its AI key.");
  }
  if (error instanceof AiAllowanceError) {
    return new HttpError(503, 'assistant_allowance_used', "Today's AI allowance is used up, so the assistant can't do this until tomorrow.");
  }
  if (error instanceof ModelBusy) return new HttpError(503, 'assistant_busy', busyMessage(error.retryInMs));
  if (!(error instanceof AiApiError || error instanceof AiConnectionError)) return error;
  log.error({ err: error }, 'AI call failed');
  if (error instanceof AiApiError) {
    if (error.status === 401 || error.status === 403) {
      return new HttpError(503, 'assistant_not_configured', "The assistant isn't set up correctly. Ask an administrator to check its AI key.");
    }
    if (error.code === 'insufficient_quota') {
      return new HttpError(503, 'assistant_unavailable', "The assistant's AI account has no credit left. Ask an administrator to check it.");
    }
    if (error.status === 429) return new HttpError(503, 'assistant_busy', busyMessage(error.retryInMs));
    if (isFailedToolCall(error)) {
      return new HttpError(422, 'not_understood', "Sorry, I couldn't work that out. Could you say it another way?");
    }
  }
  return new HttpError(503, 'assistant_unavailable', 'The assistant is unavailable right now. Try again in a moment.');
}
