import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { GROQ_DEFAULTS, OPENAI_DEFAULTS, serviceName, type AiProvider } from './ai.ts';
import { isTimeZone } from './time.ts';

const Env = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().optional(),
  CREDENTIALS_KEY: z.string({ error: 'CREDENTIALS_KEY is required (see server/.env.example)' }),
  SUPER_ADMINS: z.string().default(''),
  SESSION_TTL_DAYS: z.coerce.number().positive().default(30),
  CONFIRMATION_TTL_MINUTES: z.coerce.number().positive().default(10),
  CONVERSATION_RETENTION_DAYS: z.coerce.number().positive().default(30),
  REPORT_TIME_ZONE: z.string().default('UTC').refine(isTimeZone, 'REPORT_TIME_ZONE must be an IANA time zone, such as Europe/London'),
  // ONE AI KEY FOR BOTH APPS (DCRS REQUIREMENTS §109): ChatGPT (OpenAI), with DCRS's settings' names. When this server's
  // environment has no OpenAI key, they are taken from DCRS's backend/.env (withDcrsAiSettings below).
  CHATGPT_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  AI_CHAT_MODEL: z.string().optional(),
  AI_AGENT_MODEL: z.string().optional(),
  AI_SHORT_MODEL: z.string().optional(),
  AI_VISION_MODEL: z.string().optional(),
  AI_FALLBACK_MODEL: z.string().optional(),
  AI_TRANSCRIBE_MODEL: z.string().optional(),
  // Read leniently (allowance below): a value DCRS's file holds that is not a number must not stop this server.
  AI_DAILY_TOKEN_BUDGET: z.string().optional(),
  // Groq: only for a server with no OpenAI key, as before §109.
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default(GROQ_DEFAULTS.chat),
  GROQ_REASONING_EFFORT: z.enum(['', 'low', 'medium', 'high']).default('medium'),
  GROQ_FALLBACK_MODEL: z.string().optional(),
  GROQ_TITLE_MODEL: z.string().default(GROQ_DEFAULTS.title),
  // Not the turbo: people speak Gujarati and Hindi as well as English (see server/.env.example).
  GROQ_TRANSCRIPTION_MODEL: z.string().default(GROQ_DEFAULTS.transcribe),
  GROQ_VISION_MODEL: z.string().default(GROQ_DEFAULTS.vision),
  GROQ_DAILY_TOKEN_BUDGET: z.string().optional(),
  FILE_MAX_MB: z.coerce.number().positive().default(20),
  FILE_TEXT_CHARS: z.coerce.number().int().positive().default(16_000),
  HISTORY_CHARS: z.coerce.number().int().positive().default(12_000),
  DCRS_BASE_URL: z.url().optional(),
  // The secret shared with DCRS, the same on both servers (DCRS REQUIREMENTS §106): at least 16 characters, as DCRS asks.
  MITRA_SERVER_KEY: z.string().trim().min(16, 'MITRA_SERVER_KEY must be at least 16 characters, the same key as on the DCRS server').optional(),
  TRUST_PROXY: z.string().optional(),
  CORS_ORIGINS: z.string().default('http://localhost:8081,http://127.0.0.1:8081'),
  // Production (DCRS REQUIREMENTS §107): either says it. Then the data is kept in PostgreSQL only (loadConfig).
  NODE_ENV: z.string().optional(),
  MITRA_ENV: z.string().optional(),
});

/** A PostgreSQL address: what production keeps its data in (src/db/index.ts opens anything else as PGlite). */
export const POSTGRES_URL = /^postgres(ql)?:\/\//;

/**
 * Which variable says this server is in production: NODE_ENV=production or MITRA_ENV=production (DCRS REQUIREMENTS
 * §107), or null. In production every piece of Mitra's data is kept in PostgreSQL, never in an embedded PGlite folder.
 */
export function productionSaidBy(env: NodeJS.ProcessEnv = process.env): 'NODE_ENV' | 'MITRA_ENV' | null {
  if (env.NODE_ENV?.trim().toLowerCase() === 'production') return 'NODE_ENV';
  if (env.MITRA_ENV?.trim().toLowerCase() === 'production') return 'MITRA_ENV';
  return null;
}

/** Why production may not start on this DATABASE_URL, in plain words (never the address itself: it may hold a password). */
export function productionDatabaseRefusal(saidBy: 'NODE_ENV' | 'MITRA_ENV', databaseUrl: string | undefined): string {
  const now = !databaseUrl
    ? 'DATABASE_URL is not set, so the server would keep its data in the embedded database folder .data/pglite'
    : databaseUrl.includes('://')
      ? 'DATABASE_URL is not a postgres:// address'
      : `DATABASE_URL names the embedded database folder ${databaseUrl}`;
  return (
    `This Mitra server is set to production (${saidBy}=production), and in production Mitra keeps its data in PostgreSQL only: ${now}. ` +
    'Set DATABASE_URL in server/.env to the PostgreSQL database for Mitra, for example postgres://mitra:<its password>@127.0.0.1:5432/mitra ' +
    `(the README says how to make it, under "Deployment: Mitra's data in PostgreSQL"). ` +
    'To bring over what an embedded database folder already holds, first run, with the server stopped: ' +
    'npm --prefix server run db:copy -- --from .data/pglite --to postgres://mitra:<its password>@127.0.0.1:5432/mitra. ' +
    'The server did not start, and nothing was changed.'
  );
}

/**
 * WHERE THE DATA IS KEPT, SAID AS THE SERVER STARTS (DCRS REQUIREMENTS §107, review of 12-Oct-2026): nothing for
 * PostgreSQL, or for a database in memory (a test's, the demo's: nothing is kept); for an embedded PGlite folder, the
 * default when DATABASE_URL is empty, the words of what that means and how to move it. The owner asked for both
 * applications' data in PostgreSQL; the folder is on this computer's disk only, and no backup of the PostgreSQL server
 * holds it. Production refuses it outright (loadConfig); anything else starts as before, saying this every time.
 * Never an address that is not PostgreSQL's: it may hold a password.
 */
export function embeddedDatabaseWarning(databaseUrl: string): string | null {
  if (POSTGRES_URL.test(databaseUrl) || databaseUrl.startsWith('memory://')) return null;
  const folder = !databaseUrl.includes('://');
  const said = folder
    ? `Mitra's data is kept in the embedded database folder ${databaseUrl}, not in PostgreSQL`
    : "Mitra's data is not kept in PostgreSQL (DATABASE_URL is not a postgres:// address)";
  return (
    `${said}: it is on this computer's disk only, and no backup of the PostgreSQL server holds it ` +
    "(DCRS's npm run db:backup takes Mitra's database only when it is in PostgreSQL). For the plant, keep it in PostgreSQL with DCRS's: " +
    "make the database mitra (README, \"Deployment: Mitra's data in PostgreSQL\"), then, with this server stopped, bring what it holds over: " +
    `npm --prefix server run db:copy -- --from ${folder ? databaseUrl : '<the folder>'} --to postgres://mitra:<its password>@127.0.0.1:5432/mitra, ` +
    'then set DATABASE_URL in server/.env to that address and NODE_ENV=production, and start the server again.'
  );
}

export interface Config {
  port: number;
  host: string;
  /** Postgres URL. Anything else (or nothing) runs the embedded PGlite database at that path. */
  databaseUrl: string;
  /** AES-256 key for connector credentials stored at rest. */
  credentialsKey: Buffer;
  /** Lower-cased usernames that get the super admin view. */
  superAdmins: ReadonlySet<string>;
  sessionTtlMs: number;
  confirmationTtlMs: number;
  conversationRetentionMs: number;
  /** IANA time zone whose Monday-to-Sunday weeks the weekly reports cover, and whose day the AI allowance counts. */
  reportTimeZone: string;
  /**
   * Which AI service answers (DCRS REQUIREMENTS §109): ChatGPT (OpenAI) when CHATGPT_API_KEY or OPENAI_API_KEY is set,
   * else Groq with GROQ_API_KEY, else none: sign-in and the admin view still work, but the assistant can't answer yet.
   */
  aiProvider: AiProvider | null;
  /** That service's key: sent to it in the Authorization header, and nowhere else. Never logged. */
  aiApiKey: string | undefined;
  /** The agent's model: AI_AGENT_MODEL, else AI_CHAT_MODEL, else gpt-5.4-mini (on Groq GROQ_MODEL). */
  model: string;
  /** Groq's reasoning models such as gpt-oss only (GROQ_REASONING_EFFORT); empty sends nothing. An OpenAI model is sent the least effort its family takes (ai.ts). */
  reasoningEffort: '' | 'low' | 'medium' | 'high';
  /**
   * The second model. On ChatGPT AI_FALLBACK_MODEL (gpt-4.1-mini unless "none"): it answers when the first cannot (it
   * refused the request, is not on the account, or failed on OpenAI's side) or is busy. On Groq GROQ_FALLBACK_MODEL: it
   * answers while Groq's limits keep the first busy for more than a moment. Undefined: no second model.
   */
  fallbackModel: string | undefined;
  /** Names new conversations: AI_SHORT_MODEL, else gpt-5.4-nano (on Groq GROQ_TITLE_MODEL). */
  titleModel: string;
  /** Turns voice recordings into text, in whichever of English, Gujarati and Hindi was spoken: AI_TRANSCRIBE_MODEL, else gpt-4o-mini-transcribe (on Groq GROQ_TRANSCRIPTION_MODEL). */
  transcriptionModel: string;
  /** Reads the photos people attach. It must accept images: AI_VISION_MODEL, else gpt-5.4-mini (on Groq GROQ_VISION_MODEL). */
  visionModel: string;
  /**
   * The cost guard (§109): the tokens a day this server may use. AI_DAILY_TOKEN_BUDGET, else 3,000,000 on ChatGPT; on
   * Groq GROQ_DAILY_TOKEN_BUDGET, else none (null: Groq's own limits stand, as before).
   */
  dailyTokenBudget: number | null;
  /** The largest file a person can attach. */
  fileMaxBytes: number;
  /**
   * How much of the attached files' text the model is given in one request, in characters across the whole
   * conversation. About four characters make a token. A lean request is a quick answer (§109), and Groq's free key
   * allows 8,000 tokens a minute.
   */
  fileTextChars: number;
  /**
   * How much of a conversation's earlier turns the model is given with each request, in characters. Older turns are
   * left out first, whole. The turn being answered is always given in full.
   */
  historyChars: number;
  dcrsBaseUrl: string | undefined;
  /**
   * MITRA_SERVER_KEY: sent to DCRS as X-Mitra-Key with a phone's sign-in, so DCRS believes which phone it is (its name,
   * model, system and address) and lists it for its super admin. Set the same key on the DCRS server. Never logged,
   * never sent to the app. Without it DCRS records the phone's sign-in as this server's request, and says so.
   */
  mitraServerKey: string | undefined;
  /**
   * How often a session's sign-in with the connected system is checked at most, in milliseconds: a phone signed out in
   * DCRS (by its super admin) is signed out here at its first request after that (auth/sessions.ts).
   */
  upstreamCheckMs: number;
  trustProxy: boolean | string[] | ((address: string, hop: number) => boolean);
  corsOrigins: string[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const blankToUndefined = Object.fromEntries(
    Object.entries(env).map(([k, v]) => [k, v === '' && k !== 'GROQ_REASONING_EFFORT' ? undefined : v]),
  );
  const parsed = Env.safeParse(blankToUndefined);
  if (!parsed.success) throw new Error(`Invalid server configuration:\n${z.prettifyError(parsed.error)}`);
  const e = parsed.data;

  const credentialsKey = Buffer.from(e.CREDENTIALS_KEY, 'base64');
  if (credentialsKey.length !== 32) throw new Error('CREDENTIALS_KEY must be 32 random bytes, base64-encoded');
  // PRODUCTION KEEPS ITS DATA IN POSTGRESQL (DCRS REQUIREMENTS §107): never in a PGlite folder on one disk, which no
  // backup of the database server holds and two servers cannot share.
  const saidBy = productionSaidBy({ NODE_ENV: e.NODE_ENV, MITRA_ENV: e.MITRA_ENV });
  if (saidBy && !POSTGRES_URL.test(e.DATABASE_URL ?? '')) throw new Error(productionDatabaseRefusal(saidBy, e.DATABASE_URL));

  return {
    port: e.PORT,
    host: e.HOST,
    databaseUrl: e.DATABASE_URL ?? '.data/pglite',
    credentialsKey,
    superAdmins: new Set(list(e.SUPER_ADMINS).map((u) => u.toLowerCase())),
    sessionTtlMs: e.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    confirmationTtlMs: e.CONFIRMATION_TTL_MINUTES * 60 * 1000,
    conversationRetentionMs: e.CONVERSATION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    reportTimeZone: e.REPORT_TIME_ZONE,
    ...aiSettings(e),
    fileMaxBytes: Math.floor(e.FILE_MAX_MB * 1024 * 1024),
    fileTextChars: e.FILE_TEXT_CHARS,
    historyChars: e.HISTORY_CHARS,
    dcrsBaseUrl: e.DCRS_BASE_URL,
    mitraServerKey: e.MITRA_SERVER_KEY || undefined,
    upstreamCheckMs: 15_000,
    trustProxy: parseTrustProxy(e.TRUST_PROXY),
    corsOrigins: list(e.CORS_ORIGINS),
  };
}

type AiConfig = Pick<Config, 'aiProvider' | 'aiApiKey' | 'model' | 'reasoningEffort' | 'fallbackModel' | 'titleModel' | 'transcriptionModel' | 'visionModel' | 'dailyTokenBudget'>;

/** A whole number above zero, or undefined: an allowance written as anything else is left at its default. */
function allowance(value: string | undefined): number | undefined {
  const n = Number(value?.trim());
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : undefined;
}

/**
 * WHICH AI SERVICE, AND ITS MODELS (DCRS REQUIREMENTS §109). ChatGPT (OpenAI) when CHATGPT_API_KEY (read first) or
 * OPENAI_API_KEY is set: then nothing calls Groq, and the models are DCRS's defaults unless set (ai.ts OPENAI_DEFAULTS).
 * Else Groq with GROQ_API_KEY and its own settings, exactly as before §109. Else none. A key of spaces is no key.
 */
function aiSettings(e: z.infer<typeof Env>): AiConfig {
  const openaiKey = e.CHATGPT_API_KEY?.trim() || e.OPENAI_API_KEY?.trim() || undefined;
  const groqKey = e.GROQ_API_KEY?.trim() || undefined;
  const set = (value: string | undefined) => value?.trim() || undefined;
  if (openaiKey || !groqKey) {
    const chat = set(e.AI_CHAT_MODEL) ?? OPENAI_DEFAULTS.chat;
    const model = set(e.AI_AGENT_MODEL) ?? chat;
    const fallback = set(e.AI_FALLBACK_MODEL) ?? OPENAI_DEFAULTS.fallback;
    return {
      aiProvider: openaiKey ? 'openai' : null,
      aiApiKey: openaiKey,
      model,
      reasoningEffort: e.GROQ_REASONING_EFFORT,
      fallbackModel: fallback.toLowerCase() === 'none' || fallback === model ? undefined : fallback,
      titleModel: set(e.AI_SHORT_MODEL) ?? OPENAI_DEFAULTS.short,
      transcriptionModel: set(e.AI_TRANSCRIBE_MODEL) ?? OPENAI_DEFAULTS.transcribe,
      visionModel: set(e.AI_VISION_MODEL) ?? OPENAI_DEFAULTS.vision,
      dailyTokenBudget: allowance(e.AI_DAILY_TOKEN_BUDGET) ?? OPENAI_DEFAULTS.dailyTokens,
    };
  }
  return {
    aiProvider: 'groq',
    aiApiKey: groqKey,
    model: e.GROQ_MODEL,
    reasoningEffort: e.GROQ_REASONING_EFFORT,
    fallbackModel: set(e.GROQ_FALLBACK_MODEL),
    titleModel: e.GROQ_TITLE_MODEL,
    transcriptionModel: e.GROQ_TRANSCRIPTION_MODEL,
    visionModel: e.GROQ_VISION_MODEL,
    dailyTokenBudget: allowance(e.AI_DAILY_TOKEN_BUDGET) ?? allowance(e.GROQ_DAILY_TOKEN_BUDGET) ?? null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// ONE KEY, ONE PLACE: DCRS'S backend/.env (DCRS REQUIREMENTS §109). The owner keeps the ChatGPT key in DCRS's settings
// file only. When this server's own environment has no OpenAI key, the AI settings are taken from that file: the
// names DCRS_AI_SETTINGS lists and nothing else (never DCRS's database, ports or passwords), each only where this
// server has not set it itself. The file is read, never printed or logged; only its path and the names taken are said.

/**
 * The AI settings this server reads by the same names as DCRS (DCRS's docs/chatbot-integration.md): the only ones taken
 * from DCRS's file. Not DCRS's voice settings (AI_TTS_*): the phones speak with their own voices.
 */
export const DCRS_AI_SETTINGS = [
  'CHATGPT_API_KEY',
  'OPENAI_API_KEY',
  'AI_CHAT_MODEL',
  'AI_AGENT_MODEL',
  'AI_SHORT_MODEL',
  'AI_VISION_MODEL',
  'AI_FALLBACK_MODEL',
  'AI_TRANSCRIBE_MODEL',
  'AI_DAILY_TOKEN_BUDGET',
] as const;

/** This repository's folder: the one that holds server/ and mobile/. */
export const MITRA_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** DCRS's package name, which tells its folder from any other. */
const DCRS_PACKAGE = 'digital-controlled-record-system';

export interface DcrsAiSettings {
  /** The environment to load the configuration from: this server's own, with DCRS's AI settings added where it has none. */
  env: NodeJS.ProcessEnv;
  /** DCRS's settings file, when the AI settings were looked for there. */
  file: string | null;
  /** The names taken from it, never a value. */
  taken: string[];
  /** Why it could not be read, in plain words, without anything it holds. */
  problem: string | null;
}

/**
 * DCRS's settings file: DCRS_ENV_FILE (a path of its own, or relative to the server folder; "none" for none), else the
 * DCRS folder's backend/.env when this repository sits inside the DCRS folder, as "Audit project chatbot-mobile" does.
 */
export function dcrsEnvFile(env: NodeJS.ProcessEnv, mitraRoot: string = MITRA_ROOT): string | null {
  const said = env.DCRS_ENV_FILE?.trim();
  if (said) return said.toLowerCase() === 'none' ? null : path.resolve(mitraRoot, 'server', said);
  const dcrs = path.dirname(path.resolve(mitraRoot));
  const file = path.join(dcrs, 'backend', '.env');
  return isDcrsFolder(dcrs) && existsSync(file) ? file : null;
}

function isDcrsFolder(folder: string): boolean {
  try {
    return (JSON.parse(readFileSync(path.join(folder, 'package.json'), 'utf8')) as { name?: unknown }).name === DCRS_PACKAGE;
  } catch {
    return false;
  }
}

/**
 * KEY=value lines, read as DCRS's own backend/env.ts reads them: a line starting with # is a comment, "KEY="value"" and
 * "KEY='value'" keep what is inside the quotes, and an unquoted value ends at " # a comment". The first of two lines
 * with one name counts, as in DCRS. A file Notepad saved with a byte-order mark reads the same.
 */
export function parseEnvFile(text: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const line of text.replace(/^﻿/, '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    const quoted = /^(["'])(.*)\1\s*(?:#.*)?$/.exec(raw);
    const value = quoted ? quoted[2]! : raw.replace(/\s+#.*$/, '');
    if (key && !found.has(key)) found.set(key, value);
  }
  return found;
}

/**
 * The environment this server starts with: its own, and, when it has no OpenAI key, the AI settings from DCRS's
 * settings file (dcrsEnvFile) where it has not set them itself. `mitraRoot` is for the tests.
 */
export function withDcrsAiSettings(env: NodeJS.ProcessEnv = process.env, { mitraRoot = MITRA_ROOT }: { mitraRoot?: string } = {}): DcrsAiSettings {
  const own = (name: string) => env[name]?.trim();
  if (own('CHATGPT_API_KEY') || own('OPENAI_API_KEY')) return { env, file: null, taken: [], problem: null };
  const file = dcrsEnvFile(env, mitraRoot);
  if (!file) return { env, file: null, taken: [], problem: null };
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const why = code === 'ENOENT' ? 'there is no such file' : `it could not be read (${code ?? 'an error'})`;
    const named = env.DCRS_ENV_FILE?.trim() ? `DCRS_ENV_FILE names ${file}` : `DCRS's settings file is ${file}`;
    return { env, file, taken: [], problem: `${named}, but ${why}, so no AI settings were taken from DCRS.` };
  }
  const found = parseEnvFile(text);
  const merged: NodeJS.ProcessEnv = { ...env };
  const taken: string[] = [];
  for (const name of DCRS_AI_SETTINGS) {
    const value = found.get(name)?.trim();
    if (!value || own(name)) continue;
    merged[name] = value;
    taken.push(name);
  }
  return { env: merged, file, taken, problem: null };
}

/**
 * What the server says about its AI service as it starts (DCRS REQUIREMENTS §109): which service answers, with which
 * models and allowance, and where the settings came from (DCRS's file, and the names taken from it). Names and numbers
 * only: never a key, never anything else the file holds. `warn` is for what needs putting right.
 */
export function aiSetupWords(config: Config, from?: DcrsAiSettings): { info: string[]; warn: string[] } {
  const info: string[] = [];
  const warn: string[] = [];
  if (from?.problem) warn.push(from.problem);
  if (from?.file && from.taken.length > 0) info.push(`AI settings taken from DCRS's settings file ${from.file} (DCRS_ENV_FILE): ${from.taken.join(', ')}.`);
  if (!config.aiProvider) {
    warn.push(
      "No AI key is set (CHATGPT_API_KEY in DCRS's backend/.env, or in server/.env; GROQ_API_KEY only for an older setup): people can sign in, but the assistant cannot answer yet.",
    );
    return { info, warn };
  }
  const allowance =
    config.dailyTokenBudget === null
      ? "no daily allowance of its own (Groq's limits stand)"
      : `at most ${config.dailyTokenBudget.toLocaleString('en-US')} tokens a day (AI_DAILY_TOKEN_BUDGET)`;
  info.push(
    `AI: ${serviceName(config.aiProvider)}. Answers ${config.model}${config.fallbackModel ? `, else ${config.fallbackModel}` : ''}; titles ${config.titleModel}; ` +
      `photos ${config.visionModel}; the microphone ${config.transcriptionModel}; ${allowance}.`,
  );
  return { info, warn };
}

function list(value: string): string[] {
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

// Fastify's trustProxy: true (any proxy), a hop count, or the proxy addresses to trust.
function parseTrustProxy(value: string | undefined): Config['trustProxy'] {
  if (!value || value === 'false') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    return (_address, hop) => hop < hops;
  }
  return list(value);
}
