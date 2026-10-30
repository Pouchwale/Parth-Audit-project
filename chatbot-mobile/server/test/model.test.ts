// The agent's model (src/agent/model.ts) on the AI service (src/ai.ts), with the network stood in for: the service
// answers server-sent events as OpenAI and Groq do, or refuses before any stream. No real call is ever made.
import { afterEach, expect, it, vi } from 'vitest';
import { AiAbortError, AiAllowanceError, AiApiError, AiConnectionError, AiNotConfigured, aiService, durationMs, retryAfterMs, type AiProvider } from '../src/ai.ts';
import { aiModel, busyMessage, explainAiError, MAX_WAIT_MS, ModelBusy, SHORT_WAIT_MS, wireMessages, type ModelRequest } from '../src/agent/model.ts';
import type { Config } from '../src/config.ts';
import { HttpError } from '../src/http.ts';
import { testConfig } from './helpers.ts';

/** A key shaped like OpenAI's, which must never appear in a log line or an error's words. */
const KEY = 'sk-proj-TESTKEY0123456789abcdefghijklmnop';

interface Delta {
  role?: string;
  content?: string | null;
  reasoning?: string | null;
  refusal?: string | null;
  tool_calls?: { index: number; id?: string; type?: 'function'; function?: { name?: string; arguments?: string } }[];
}
interface Chunk {
  id?: string;
  created?: number;
  choices?: { index: number; delta: Delta; finish_reason: 'stop' | 'length' | 'tool_calls' | null }[];
  usage?: Record<string, unknown> | null;
  x_groq?: Record<string, unknown> | null;
  error?: Record<string, unknown>;
}

function chunk(delta: Delta, finishReason: 'stop' | 'length' | 'tool_calls' | null = null, extra: Partial<Chunk> = {}): Chunk {
  return { id: 'chatcmpl_1', created: 1, choices: [{ index: 0, delta, finish_reason: finishReason }], ...extra };
}

/** A response stream: chunks in order, where an Error breaks the connection when it is reached and a function runs then. */
type Script = (Chunk | Error | (() => void))[];
/** A refusal before any stream: its status, the body the service sends and its headers. */
interface Refusal {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}
/** What one call answers: a stream, or a refusal. */
type Answer = Script | { refuse: Refusal } | { script: Script; headers: Record<string, string> };

/** The stream as the service sends it: "data: {chunk}" lines, then "data: [DONE]". Breaks off when the person stops it. */
function sse(script: Script, signal: AbortSignal | undefined): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const steps = [...script];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      signal?.addEventListener('abort', () => {
        try {
          controller.error(new DOMException('The operation was aborted.', 'AbortError'));
        } catch {
          // Already closed.
        }
      });
    },
    pull(controller) {
      const step = steps.shift();
      if (step === undefined) {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } else if (step instanceof Error) {
        controller.error(step);
      } else if (typeof step === 'function') {
        step();
      } else {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(step)}\n\n`));
      }
    },
  });
}

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** Stands in for the AI service at the network edge: each call streams, or refuses with, the next answer. */
function fakeService(answers: Answer[], config: Partial<Config> = {}, provider: AiProvider = 'groq') {
  const calls: Call[] = [];
  const warnings: string[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string>, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    const answer = answers.shift() ?? [];
    if ('refuse' in answer) {
      return new Response(JSON.stringify(answer.refuse.body ?? {}), { status: answer.refuse.status, headers: answer.refuse.headers ?? {} });
    }
    const script = Array.isArray(answer) ? answer : answer.script;
    const headers = Array.isArray(answer) ? {} : answer.headers;
    return new Response(sse(script, init?.signal ?? undefined), { status: 200, headers: { 'content-type': 'text/event-stream', ...headers } });
  };
  const cfg = testConfig({ aiProvider: provider, aiApiKey: KEY, ...config });
  const service = aiService(cfg, { fetch: fetch as typeof globalThis.fetch, warn: (line) => warnings.push(line) });
  return { calls, warnings, service, model: aiModel(cfg, service) };
}

const request: ModelRequest = { system: 'You help.', tools: [], messages: [{ role: 'user', content: 'Hi' }] };

/** How Groq reports, part-way through a stream, a tool call it couldn't parse: an error of its own in the stream. */
const failedToolCall = (): Chunk => ({ error: { code: 'tool_use_failed', message: 'Failed to call a function.' } });

/** A 429 as the services send it: the headers, and the sentence saying how long to wait. */
function rateLimited(retryAfter: string, limit = 'TPM', message = `Rate limit reached for model \`openai/gpt-oss-120b\` in organization \`org_x\` service tier \`on_demand\` on tokens per minute (${limit}): Limit 8000, Used 7000, Requested 3000. Please try again in ${retryAfter}.`): Answer {
  return {
    refuse: {
      status: 429,
      body: { error: { message, type: 'tokens', code: 'rate_limit_exceeded' } },
      headers: { 'retry-after': String(Math.ceil((durationMs(retryAfter) ?? 0) / 1000)), 'x-ratelimit-limit-tokens': '8000', 'x-ratelimit-remaining-tokens': '0', 'x-ratelimit-reset-tokens': retryAfter },
    },
  };
}

const done = (text: string): Script => [chunk({ content: text }), chunk({}, 'stop')];

afterEach(() => {
  vi.useRealTimers();
});

it('passes text on as it streams and assembles the whole response, including tool calls sent in pieces', async () => {
  const { model } = fakeService([
    [
      chunk({ role: 'assistant' }),
      chunk({ reasoning: 'Look it up.' }),
      chunk({ content: 'Let me ' }),
      chunk({ content: 'check.' }),
      chunk({ tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'fake__list_items', arguments: '{"sta' } }] }),
      chunk({ tool_calls: [{ index: 1, id: 'call_2', type: 'function', function: { name: 'fake__close_item', arguments: '{}' } }] }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: 'tus":"open"}' } }] }),
      chunk({}, 'tool_calls'),
    ],
  ]);
  const text: string[] = [];

  const completion = await model(request, { onText: (delta) => text.push(delta) });
  expect(text).toEqual(['Let me ', 'check.']);
  expect(completion.choices).toEqual([
    {
      index: 0,
      finish_reason: 'tool_calls',
      message: {
        role: 'assistant',
        content: 'Let me check.',
        reasoning: 'Look it up.',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'fake__list_items', arguments: '{"status":"open"}' } },
          { id: 'call_2', type: 'function', function: { name: 'fake__close_item', arguments: '{}' } },
        ],
      },
    },
  ]);
});

it('sends the instructions, then what differs by person and day, then the conversation, as one streamed chat request with the key in its header only', async () => {
  const { model, calls } = fakeService([done('Hello.')]);
  await model({ ...request, context: 'Signed-in person: Alice.' });
  expect(calls[0]!.url).toBe('https://api.groq.com/openai/v1/chat/completions');
  expect(calls[0]!.headers).toEqual({ 'content-type': 'application/json', authorization: `Bearer ${KEY}` });
  expect(calls[0]!.body).toMatchObject({ model: 'test-model', stream: true, temperature: 0.3, max_completion_tokens: 8192 });
  expect(calls[0]!.body).not.toHaveProperty('max_tokens');
  expect(calls[0]!.body.messages).toEqual([
    { role: 'system', content: 'You help.' },
    { role: 'user', content: 'Signed-in person: Alice.' },
    { role: 'user', content: 'Hi' },
  ]);
  expect(wireMessages(request)).toEqual([{ role: 'system', content: 'You help.' }, { role: 'user', content: 'Hi' }]);
});

it('on ChatGPT asks gpt-5.4-mini with reasoning_effort "none", max_completion_tokens, parallel tools, usage in the stream and the prompt cache key, and never sends it what Groq thought', async () => {
  const usage = { prompt_tokens: 1200, completion_tokens: 30, total_tokens: 1230, prompt_tokens_details: { cached_tokens: 1024 } };
  const { model, calls, service } = fakeService([[chunk({ content: 'Hello.' }), chunk({}, 'stop'), { usage, choices: [] }]], { model: 'gpt-5.4-mini', fallbackModel: 'gpt-4.1-mini' }, 'openai');
  const tools = [{ type: 'function' as const, function: { name: 'fake__list_items', description: 'Lists items.', parameters: { type: 'object' } } }];
  const completion = await model({
    ...request,
    tools,
    messages: [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello', reasoning: 'A greeting.' },
      { role: 'user', content: 'What is open?' },
    ],
  });
  expect(calls[0]!.url).toBe('https://api.openai.com/v1/chat/completions');
  expect(calls[0]!.headers.authorization).toBe(`Bearer ${KEY}`);
  expect(calls[0]!.body).toMatchObject({
    model: 'gpt-5.4-mini',
    reasoning_effort: 'none',
    max_completion_tokens: 8192,
    stream: true,
    stream_options: { include_usage: true },
    tools,
    tool_choice: 'auto',
    parallel_tool_calls: true,
    prompt_cache_key: 'mitra-agent',
  });
  expect(calls[0]!.body).not.toHaveProperty('max_tokens');
  expect(calls[0]!.body.messages).toEqual([
    { role: 'system', content: 'You help.' },
    { role: 'user', content: 'Hi' },
    { role: 'assistant', content: 'Hello' },
    { role: 'user', content: 'What is open?' },
  ]);
  // OpenAI's usage comes in a last piece with no choices; the cost guard counts it.
  expect(completion.usage).toEqual(usage);
  expect(service.meter.usedToday()).toBe(1230);
});

it('on ChatGPT the second model answers a request the first refused, and one the account cannot use is not asked again for a while', async () => {
  vi.useFakeTimers();
  const { model, calls, warnings } = fakeService(
    [
      { refuse: { status: 400, body: { error: { message: 'This model is only supported in v1/responses and not in v1/chat/completions.', type: 'invalid_request_error' } } } },
      done('Hello.'),
      { refuse: { status: 404, body: { error: { message: 'The model `gpt-5.4-mini` does not exist or you do not have access to it.', code: 'model_not_found' } } } },
      done('Again.'),
      done('Still.'),
    ],
    { model: 'gpt-5.4-mini', fallbackModel: 'gpt-4.1-mini' },
    'openai',
  );
  expect((await model(request)).choices[0]!.message.content).toBe('Hello.');
  expect(calls.map((call) => call.body.model)).toEqual(['gpt-5.4-mini', 'gpt-4.1-mini']);

  expect((await model(request)).choices[0]!.message.content).toBe('Again.');
  // Not on the account: the next question goes straight to the second model.
  expect((await model(request)).choices[0]!.message.content).toBe('Still.');
  expect(calls.map((call) => call.body.model)).toEqual(['gpt-5.4-mini', 'gpt-4.1-mini', 'gpt-5.4-mini', 'gpt-4.1-mini', 'gpt-4.1-mini']);
  expect(warnings).toEqual([]);
});

it('learns a parameter a model refuses by name and asks again without it, saying so without the key', async () => {
  const { model, calls, warnings } = fakeService(
    [{ refuse: { status: 400, body: { error: { message: `Unsupported parameter: 'temperature' is not supported with this model. (key ${KEY})`, type: 'invalid_request_error', param: 'temperature', code: 'unsupported_parameter' } } } }, done('Hello.'), done('Again.')],
    { model: 'gpt-5.4-mini' },
    'openai',
  );
  expect((await model(request)).choices[0]!.message.content).toBe('Hello.');
  await model(request);
  expect(calls.map((call) => 'temperature' in call.body)).toEqual([true, false, false]);
  expect(warnings).toEqual(['AI: gpt-5.4-mini does not take temperature; it is asked without it from now on.']);
  expect(warnings.join('\n')).not.toContain(KEY);
});

it('logs one line per call: the service, the model, the attempt, the tokens used and cached, and what is left of the limits, never any words or the key', async () => {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const usage = { prompt_tokens: 2500, completion_tokens: 40, total_tokens: 2540, prompt_tokens_details: { cached_tokens: 2048 }, queue_time: 0.012, prompt_time: 0.05, completion_time: 0.2, total_time: 0.262 };
  const { model } = fakeService([
    {
      script: [chunk({ content: 'Hello.' }), chunk({}, 'stop', { x_groq: { id: 'req_1', usage } })],
      headers: { 'x-ratelimit-limit-tokens': '8000', 'x-ratelimit-remaining-tokens': '5460', 'x-ratelimit-reset-tokens': '7.66s', 'x-ratelimit-limit-requests': '1000', 'x-ratelimit-remaining-requests': '999', 'x-ratelimit-reset-requests': '2m59.56s' },
    },
  ]);
  const completion = await model(request, { log: log as never });
  expect(completion.usage).toEqual(usage);
  expect(log.info).toHaveBeenCalledTimes(1);
  const [line, message] = log.info.mock.calls[0]!;
  expect(message).toBe('model call');
  expect(line).toMatchObject({
    service: 'groq',
    model: 'test-model',
    attempt: 1,
    finishReason: 'stop',
    toolCalls: 0,
    promptTokens: 2500,
    cachedTokens: 2048,
    completionTokens: 40,
    limitTokens: 8000,
    remainingTokens: 5460,
    resetTokens: '7.66s',
    limitRequests: 1000,
    remainingRequests: 999,
    resetRequests: '2m59.56s',
    queueMs: 12,
    promptMs: 50,
    completionMs: 200,
    tokensToday: 2540,
  });
  expect(line.ms).toBeGreaterThanOrEqual(0);
  expect(line.firstWordMs).toBeGreaterThanOrEqual(0);
  expect(line.requestChars).toBeGreaterThan(0);
  expect(JSON.stringify(line)).not.toContain('You help');
  expect(JSON.stringify(line)).not.toContain('Hello');
  expect(JSON.stringify(line)).not.toContain(KEY);
});

it('keeps the key out of a refusal that echoes it, in the log and in what the person is told', async () => {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const { model } = fakeService([{ refuse: { status: 401, body: { error: { message: `Incorrect API key provided: ${KEY}. You can find your API key at https://platform.openai.com.`, type: 'invalid_request_error', code: 'invalid_api_key' } } } }], {}, 'openai');
  const error = await model(request, { log: log as never }).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AiApiError);
  expect((error as Error).message).toBe('Incorrect API key provided: [key]. You can find your API key at https://platform.openai.com.');
  expect(log.warn).toHaveBeenCalledTimes(1);
  const line = JSON.stringify(log.warn.mock.calls[0]![0]);
  expect(line).toContain('"status":401');
  expect(line).toContain('"code":"invalid_api_key"');
  expect(line).not.toContain(KEY);
  expect(line).not.toContain('TESTKEY');
  const explained = explainAiError(error, log as never) as HttpError;
  expect(explained).toMatchObject({ status: 503, code: 'assistant_not_configured' });
  expect(explained.message).not.toContain(KEY);
  expect(JSON.stringify(log.error.mock.calls)).not.toContain(KEY);
});

it("stops asking the model for the agent once 90% of the day's allowance is used, and says so in the log once", async () => {
  const { model, service, warnings } = fakeService([[chunk({ content: 'Hi.' }), chunk({}, 'stop', { usage: { total_tokens: 950 } })], done('Never.')], { dailyTokenBudget: 1000 }, 'openai');
  await model(request);
  expect(service.meter.usedToday()).toBe(950);
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain('90% used: 950 of 1,000 tokens');
  await expect(model(request)).rejects.toBeInstanceOf(AiAllowanceError);
  // The last tenth is still there for the short jobs.
  expect(() => service.ready('other')).not.toThrow();
  service.meter.count(60);
  expect(() => service.ready('other')).toThrow(AiAllowanceError);
  expect(warnings).toHaveLength(2);
  const explained = explainAiError(new AiAllowanceError(), { error: vi.fn() } as never) as HttpError;
  expect(explained).toMatchObject({ status: 503, code: 'assistant_allowance_used' });
});

it('tries a failed tool call again, colder, when none of it was shown yet', async () => {
  const { model, calls } = fakeService([[chunk({ reasoning: 'Hmm.' }), failedToolCall()], done('Done.')]);
  const completion = await model(request);
  expect(completion.choices[0]!.message.content).toBe('Done.');
  expect(calls.map((call) => call.body.temperature)).toEqual([0.3, 0]);
});

it('does not try again once part of the reply was shown', async () => {
  const { model, calls } = fakeService([[chunk({ content: 'Closing' }), failedToolCall()], done('Again')]);
  await expect(model(request, { onText: () => {} })).rejects.toBeInstanceOf(AiApiError);
  expect(calls).toHaveLength(1);
});

it('never hands over a response that was stopped part-way', async () => {
  const stop = new AbortController();
  const { model } = fakeService([[chunk({ tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'fake__close_item', arguments: '{"id' } }] }), () => stop.abort()]]);
  await expect(model(request, { signal: stop.signal })).rejects.toBeInstanceOf(AiAbortError);
});

it('tries a dropped connection or a stream that ends early twice more, then calls the assistant unavailable', async () => {
  vi.useFakeTimers();
  const dropped = fakeService([[chunk({ reasoning: 'Hmm' }), new TypeError('terminated')], [], []]);
  const failing = dropped.model(request);
  failing.catch(() => {});
  // After half a second, then a second.
  await vi.advanceTimersByTimeAsync(2_000);
  await expect(failing).rejects.toBeInstanceOf(AiConnectionError);
  expect(dropped.calls).toHaveLength(3);

  // And goes on with the answer when a later try works.
  const recovered = fakeService([[new TypeError('terminated')], done('Hello.')]);
  const answered = recovered.model(request);
  await vi.advanceTimersByTimeAsync(600);
  expect((await answered).choices[0]!.message.content).toBe('Hello.');

  // Not once the person has seen part of the reply: what they saw can't be taken back.
  const shown = fakeService([[chunk({ content: 'Hel' }), new TypeError('terminated')], done('Hello.')]);
  await expect(shown.model(request, { onText: () => {} })).rejects.toBeInstanceOf(AiConnectionError);
  expect(shown.calls).toHaveLength(1);
});

it('just waits out a short wait the service asks for, and asks again', async () => {
  vi.useFakeTimers();
  const waits: (number | null)[] = [];
  const { model, calls } = fakeService([rateLimited('1.5s'), done('Hello.')]);
  const answered = model(request, { onWait: (ms) => waits.push(ms) });
  await vi.advanceTimersByTimeAsync(1_000);
  expect(calls).toHaveLength(1);
  // 1.5 seconds as asked, and a little over.
  await vi.advanceTimersByTimeAsync(1_000);
  expect((await answered).choices[0]!.message.content).toBe('Hello.');
  expect(calls.map((call) => call.body.model)).toEqual(['test-model', 'test-model']);
  // Nobody is told of a wait this short.
  expect(waits).toEqual([]);
});

it('tells the person about a longer wait, with how long, and clears it when the model answers', async () => {
  vi.useFakeTimers();
  const waits: (number | null)[] = [];
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const { model, calls } = fakeService([rateLimited('7.66s'), done('Hello.')]);
  const answered = model(request, { onWait: (ms) => waits.push(ms), log: log as never });
  await vi.advanceTimersByTimeAsync(7_000);
  expect(waits).toEqual([7_910]);
  expect(calls).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1_000);
  expect((await answered).choices[0]!.message.content).toBe('Hello.');
  expect(waits).toEqual([7_910, null]);
  // The refusal is logged with what the service said about the limit, as numbers; its sentence (which names the organization) is not kept.
  expect(log.warn).toHaveBeenCalledTimes(1);
  expect(log.warn.mock.calls[0]![0]).toMatchObject({ service: 'groq', model: 'test-model', attempt: 1, failed: 'rate_limited', status: 429, retryInMs: 7_660, limit: 'TPM', limitSize: 8000, limitUsed: 7000, requested: 3000 });
  expect(JSON.stringify(log.warn.mock.calls[0]![0])).not.toContain('org_x');
  expect(log.info.mock.calls[0]![0]).toMatchObject({ attempt: 2 });
  expect(SHORT_WAIT_MS).toBe(2_000);
});

it('goes to the fallback model at once when the first is busy for more than a moment, and comes back when it is free', async () => {
  vi.useFakeTimers();
  const waits: (number | null)[] = [];
  const { model, calls } = fakeService([rateLimited('20s'), done('Hello.'), done('Again.'), done('Back.')], { fallbackModel: 'small-model' });
  const first = await model(request, { onWait: (ms) => waits.push(ms) });
  expect(first.choices[0]!.message.content).toBe('Hello.');
  expect(calls.map((call) => call.body.model)).toEqual(['test-model', 'small-model']);
  expect(waits).toEqual([]);

  // The first model is not asked again until the service said its allowance is back.
  await model(request);
  expect(calls.at(-1)!.body.model).toBe('small-model');
  await vi.advanceTimersByTimeAsync(21_000);
  await model(request);
  expect(calls.at(-1)!.body.model).toBe('test-model');
});

it('gives up on a wait longer than a person should be kept, with a clear error that says when to try again', async () => {
  vi.useFakeTimers();
  const waits: (number | null)[] = [];
  const { model, calls } = fakeService([rateLimited('2m59s', 'TPD')]);
  const failing = model(request, { onWait: (ms) => waits.push(ms) });
  await expect(failing).rejects.toBeInstanceOf(ModelBusy);
  expect(calls).toHaveLength(1);
  expect(waits).toEqual([]);
  const explained = explainAiError(await failing.catch((error: unknown) => error), { error: vi.fn() } as never) as HttpError;
  expect(explained).toBeInstanceOf(HttpError);
  expect(explained).toMatchObject({ status: 503, code: 'assistant_busy', message: 'The assistant is busy right now. Try again in about 3 minutes.' });
  expect(MAX_WAIT_MS).toBe(30_000);
});

it("bounds a turn's waiting: a wait the turn has no room left for ends it", async () => {
  vi.useFakeTimers();
  const { model } = fakeService([rateLimited('10s')]);
  const failing = model(request, { wait: { leftMs: 5_000 } });
  await expect(failing).rejects.toBeInstanceOf(ModelBusy);
});

it('says plainly when the account has no credit left, rather than waiting', async () => {
  const { model, calls } = fakeService([{ refuse: { status: 429, body: { error: { message: 'You exceeded your current quota, please check your plan and billing details.', type: 'insufficient_quota', code: 'insufficient_quota' } } } }], {}, 'openai');
  const error = await model(request).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AiApiError);
  expect(calls).toHaveLength(1);
  expect(explainAiError(error, { error: vi.fn() } as never)).toMatchObject({ status: 503, code: 'assistant_unavailable', message: "The assistant's AI account has no credit left. Ask an administrator to check it." });
});

it('reads how long the service asked to wait from its headers, its sentence or its reset time, and says it as a person would', () => {
  expect(durationMs('7.66s')).toBe(7_660);
  expect(durationMs('2m59.56s')).toBe(179_560);
  expect(durationMs('120ms')).toBe(120);
  expect(durationMs('1h2m')).toBe(3_720_000);
  expect(durationMs('soon')).toBeUndefined();
  expect(retryAfterMs(new Headers({ 'retry-after': '12' }), undefined)).toBe(12_000);
  expect(retryAfterMs(new Headers(), 'Please try again in 3.5s.')).toBe(3_500);
  expect(retryAfterMs(new Headers({ 'x-ratelimit-reset-tokens': '45s' }), undefined)).toBe(45_000);
  expect(retryAfterMs(new Headers(), undefined)).toBe(5_000);
  expect(busyMessage(undefined)).toBe('The assistant is busy right now. Try again in a minute.');
  expect(busyMessage(60_000)).toBe('The assistant is busy right now. Try again in a minute.');
  expect(busyMessage(179_560)).toBe('The assistant is busy right now. Try again in about 3 minutes.');
  expect(busyMessage(3 * 3_600_000)).toBe('The assistant is busy right now. Try again in about 3 hours.');
});

it('needs an AI key, and says so to the person without naming Groq', async () => {
  const config = testConfig();
  const model = aiModel(config, aiService(config));
  const error = await model(request).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AiNotConfigured);
  const explained = explainAiError(error, { error: vi.fn() } as never) as HttpError;
  expect(explained).toMatchObject({ status: 503, code: 'assistant_not_configured', message: "The assistant isn't set up yet. Ask an administrator to add its AI key." });
});
