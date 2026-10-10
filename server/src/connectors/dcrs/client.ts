import { ConnectorError, type ConnectorAccount, type SignInContext } from '../types.ts';

/**
 * The name DCRS writes into its own audit trail beside the person: the record's history reads
 * "Through Mitra mobile app: <note>", and so does DCRS's activity log (docs/chatbot-integration.md in DCRS).
 */
export const CLIENT_NAME = 'Mitra mobile app';

/** The cookie DCRS keeps its session token in. */
export const SESSION_COOKIE = 'dcrs_session';

const TIMEOUT_MS = 30_000;
/** DCRS prints a PDF with a headless browser: about 5 seconds, and a third print waits for two before it. */
export const PDF_TIMEOUT_MS = 90_000;

export interface DcrsOptions {
  /** The DCRS server's address, e.g. http://dcrs-host:4000 (DCRS_BASE_URL). */
  baseUrl: string | undefined;
  /** Stands in for the network in tests. */
  fetch?: typeof fetch;
  /** The time now, in milliseconds. Tests may fix it. */
  now?: () => number;
  /**
   * MITRA_SERVER_KEY, the same on the DCRS server: sent as X-Mitra-Key with a phone's sign-in, and only then, so DCRS
   * believes the X-Mitra-Device-* headers beside it (DCRS REQUIREMENTS §106). Never logged, never in an answer.
   */
  serverKey?: string;
}

/** What the connector keeps (encrypted, by the server) for each signed-in person. */
export interface DcrsCredentials {
  token: string;
}

export type Query = Record<string, string | number | boolean | undefined>;

/** The methods DCRS's API answers: PUT for the notification preferences, DELETE for a phone's push registration. */
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

interface CallOptions {
  token?: string;
  query?: Query;
  body?: unknown;
  timeoutMs?: number;
  accept?: string;
  cookie?: string;
  /** Sent as X-Language: DCRS then words its refusals and reasons in English, Hindi or Gujarati. */
  language?: string;
  /** More headers, such as the phone's at sign-in. */
  headers?: Record<string, string>;
}

/** A file DCRS answered with, such as a record printed as a PDF. */
export interface DcrsFile {
  filename: string | null;
  mimeType: string;
  data: Uint8Array;
}

interface Refusal {
  error?: unknown;
  code?: unknown;
  problems?: unknown;
  errors?: unknown;
  /** With the code "ambiguous": the documents the words could mean. */
  candidates?: unknown;
}

interface LoginAnswer {
  mustChangePassword?: unknown;
  session?: { endsAt?: unknown } | null;
}

interface Me {
  id?: unknown;
  name?: unknown;
  email?: unknown;
  /** "admin" for DCRS's super admin, "staff" otherwise: DCRS reads it from its own accounts on every call. */
  role?: unknown;
}

const UNREACHABLE = "DCRS couldn't be reached. Check that the DCRS server is running, then try again.";
const REDIRECTED = 'DCRS answered from another address. Check DCRS_BASE_URL on the assistant server.';
const SIGNED_OUT = 'Your DCRS sign-in has ended: DCRS ends every sign-in at the close of its day. Sign in again.';
/** DCRS's code for a session that was ended (its super admin's "Sign out this device", or a sign-in again on the device). */
export const SESSION_ENDED = 'session-ended';
/** DCRS's code for a sign-in refused because the account is signed in on as many devices as it may be. */
export const DEVICE_LIMIT = 'device-limit';

/**
 * THE PHONE, FOR DCRS (DCRS REQUIREMENTS §106): the headers that say which phone signs in, with the key that makes DCRS
 * believe them. Each value percent-encoded, so a name in Gujarati travels as ASCII; none without the key, so a phone's
 * name is never sent where it would not be believed.
 */
export function phoneHeaders(serverKey: string | undefined, context: SignInContext | undefined): Record<string, string> {
  if (!serverKey || !context?.device) return {};
  const d = context.device;
  const put = (headers: Record<string, string>, name: string, value: string | null | undefined) => {
    const v = (value ?? '').trim();
    if (v) headers[name] = encodeURIComponent(v.slice(0, 120));
  };
  const headers: Record<string, string> = { 'X-Mitra-Key': serverKey };
  put(headers, 'X-Mitra-Device-Id', d.deviceId);
  put(headers, 'X-Mitra-Device-Name', d.name);
  put(headers, 'X-Mitra-Device-Model', d.model);
  put(headers, 'X-Mitra-Device-System', [d.os, d.osVersion].filter(Boolean).join(' '));
  put(headers, 'X-Mitra-Device-Type', d.type);
  put(headers, 'X-Mitra-App-Version', d.appVersion);
  put(headers, 'X-Mitra-Device-Address', context.address);
  return headers;
}

/** The token behind a person's session, or an "unauthorized" error that makes them sign in again. */
export function tokenOf(credentials: unknown): string {
  const token = (credentials as Partial<DcrsCredentials> | null | undefined)?.token;
  if (typeof token !== 'string' || !token) throw new ConnectorError('unauthorized', SIGNED_OUT);
  return token;
}

/** Talks to one DCRS server's API as the signed-in person. */
export function dcrsClient(options: DcrsOptions) {
  const send = options.fetch ?? fetch;
  const now = options.now ?? Date.now;

  function address(path: string, query: Query = {}): URL {
    if (!options.baseUrl) {
      throw new ConnectorError('unavailable', 'DCRS is not connected yet: DCRS_BASE_URL is not set on the assistant server.');
    }
    // Joined as text, so a base URL with a path of its own (http://host/dcrs) keeps it.
    const url = new URL(options.baseUrl.replace(/\/+$/, '') + path);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }
    return url;
  }

  async function call(method: Method, path: string, init: CallOptions = {}): Promise<Response> {
    const headers: Record<string, string> = { ...init.headers, 'X-Client-Name': CLIENT_NAME, Accept: init.accept ?? 'application/json' };
    if (init.token) headers.Authorization = `Bearer ${init.token}`;
    if (init.cookie) headers.Cookie = init.cookie;
    if (init.language) headers['X-Language'] = init.language;
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    const url = address(path, init.query);
    try {
      return await send(url, {
        method,
        headers,
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        signal: AbortSignal.timeout(init.timeoutMs ?? TIMEOUT_MS),
        redirect: 'manual',
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new ConnectorError('unavailable', timedOut ? 'DCRS took too long to answer. Try again in a moment.' : UNREACHABLE);
    }
  }

  /** Calls a JSON route and answers its body, or throws DCRS's refusal as a ConnectorError. */
  async function json<T = unknown>(method: Method, path: string, init: CallOptions = {}): Promise<T> {
    const response = await call(method, path, init);
    if (!response.ok) throw await refusalOf(response);
    const body = await readJson(response);
    if (body === undefined) throw new ConnectorError('unavailable', 'DCRS answered in a way the assistant does not understand.');
    return body as T;
  }

  /** Calls a route that answers a file, such as a PDF. */
  async function file(path: string, init: CallOptions & { mimeType: string }): Promise<DcrsFile> {
    const response = await call('GET', path, { ...init, accept: `${init.mimeType}, application/json` });
    if (!response.ok) throw await refusalOf(response);
    const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    if (type !== init.mimeType) throw new ConnectorError('unavailable', 'DCRS answered in a way the assistant does not understand.');
    const data = new Uint8Array(await response.arrayBuffer());
    return { filename: filenameOf(response.headers.get('content-disposition')), mimeType: type, data };
  }

  /**
   * Checks an email and password with DCRS's own sign-in (POST /api/auth/login), then reads the person's stable id,
   * name and role (GET /api/v1/me). The session token is the dcrs_session cookie; it lasts until the close of the day
   * it was started, which is when the connector says the credentials stop working. DCRS's super admin (role "admin",
   * as DCRS answers it at this sign-in, never anything the person typed) is this app's super admin too.
   *
   * ONE PASSWORD FOR THE WEBSITE AND THE PHONE (DCRS REQUIREMENTS §105, §106): this is the only way a person signs in
   * to Mitra with DCRS, and nothing of the password is kept here, so the password DCRS's super admin sets is the one.
   *
   * THE PHONE (§106): with MITRA_SERVER_KEY set, the phone's id, name, model, system, kind and address go with it
   * (phoneHeaders), so DCRS names the device for its super admin; the session this phone's earlier sign-in still holds
   * goes as the cookie, so DCRS replaces it rather than counting a second device. DCRS's refusal of one device too many
   * comes back in its own words, in the app's language (X-Language), unchanged.
   */
  async function signIn(email: string, password: string, context?: SignInContext): Promise<ConnectorAccount> {
    const previous = (context?.previous as Partial<DcrsCredentials> | null | undefined)?.token;
    const response = await call('POST', '/api/auth/login', {
      body: { email, password },
      headers: phoneHeaders(options.serverKey, context),
      language: context?.language,
      ...(typeof previous === 'string' && previous ? { cookie: `${SESSION_COOKIE}=${previous}` } : {}),
    });
    const answer = (await readJson(response)) as (LoginAnswer & Refusal) | undefined;
    const said = wordsOf(answer?.error);
    if (response.status === 400 || response.status === 401) throw new ConnectorError('invalid_credentials', 'Wrong email or password.');
    // Switched off, outside the plant's working hours, one device too many, or too many wrong passwords: DCRS's own
    // words say which, and its code goes with them.
    if (response.status === 403 || response.status === 429) {
      throw new ConnectorError('forbidden', said ?? 'DCRS refused the sign-in.', { code: typeof answer?.code === 'string' ? answer.code : undefined });
    }
    if (!response.ok) throw new ConnectorError('unavailable', response.status >= 300 && response.status < 400 ? REDIRECTED : UNREACHABLE);
    const session = sessionCookie(response.headers, now());
    // A session DCRS started that this app does not take up is ended there at once, so it holds none of the account's
    // places on DCRS's list of devices (DCRS REQUIREMENTS §106): an account still on its first password, or an answer
    // this app cannot read. Best effort: what was refused is said either way.
    const dropped = async (error: unknown): Promise<never> => {
      if (session) await signOut(session.token).catch(() => undefined);
      throw error;
    };
    if (answer?.mustChangePassword === true) {
      return dropped(new ConnectorError('forbidden', 'Sign in to DCRS in a browser and choose your own password first.'));
    }
    if (!session) throw new ConnectorError('unavailable', 'DCRS did not start a session. Try again in a moment.');

    const me = await json<Me>('GET', '/api/v1/me', { token: session.token }).catch(dropped);
    if (typeof me.id !== 'string' || !me.id) return dropped(new ConnectorError('unavailable', 'DCRS answered in a way the assistant does not understand.'));
    const username = typeof me.email === 'string' && me.email ? me.email : email.trim().toLowerCase();
    const endsAt = earliest(session.expiresAt, dateOf(answer?.session?.endsAt));
    return {
      externalId: me.id,
      username,
      displayName: typeof me.name === 'string' && me.name.trim() ? me.name.trim() : username,
      credentials: { token: session.token } satisfies DcrsCredentials,
      expiresAt: endsAt,
      systemAdmin: me.role === 'admin',
    };
  }

  /**
   * Signs out with DCRS: DCRS ends the session, so the token is refused from then on and the device leaves its super
   * admin's list (DCRS REQUIREMENTS §106), and writes "Signed out" in its activity log. DCRS's sign-out reads the token
   * from the cookie only. The server deletes its own copy either way.
   */
  async function signOut(token: string): Promise<void> {
    await call('POST', '/api/auth/logout', { cookie: `${SESSION_COOKIE}=${token}` });
  }

  /**
   * Whether DCRS still takes this sign-in (GET /api/v1/me): a 401 throws its refusal, in DCRS's words when it gave some
   * (a device its super admin signed out); DCRS out of reach, or anything else, is not a sign-out and throws nothing.
   */
  async function stillSignedIn(token: string, language?: string): Promise<void> {
    let response: Response;
    try {
      response = await call('GET', '/api/v1/me', { token, language, timeoutMs: 10_000 });
    } catch {
      return;
    }
    if (response.status === 401) throw await refusalOf(response);
  }

  return { json, file, signIn, signOut, stillSignedIn };
}

export type DcrsClient = ReturnType<typeof dcrsClient>;

async function readJson(response: Response): Promise<unknown> {
  const type = response.headers.get('content-type') ?? '';
  if (!/\bjson\b/i.test(type)) return undefined;
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function wordsOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** A problem DCRS listed, in words: a sentence, or an object carrying one. */
function problemWords(problem: unknown): string | undefined {
  if (typeof problem === 'string') return wordsOf(problem);
  if (problem && typeof problem === 'object') {
    const p = problem as Record<string, unknown>;
    const said = wordsOf(p.message) ?? wordsOf(p.error) ?? wordsOf(p.problem) ?? wordsOf(p.text);
    const where = wordsOf(p.label) ?? wordsOf(p.field);
    if (said) return where && !said.toLowerCase().includes(where.toLowerCase()) ? `${where}: ${said}` : said;
  }
  return undefined;
}

/** A document as its format number and name, or its name alone while its number is still to be confirmed. */
export function documentLabel(doc: { formatNo?: unknown; name?: unknown; id?: unknown }): string {
  const number = wordsOf(doc.formatNo);
  const name = wordsOf(doc.name) ?? wordsOf(doc.id) ?? 'a document';
  return number && !/^to be /i.test(number) ? `${number} ${name}` : name;
}

/** The documents an unclear name could mean, for the assistant to offer the person: "F/QC/15-A Name (id)". */
function candidateWords(candidates: unknown): string[] {
  if (!Array.isArray(candidates)) return [];
  return candidates.slice(0, 8).flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const doc = candidate as { id?: unknown; formatNo?: unknown; name?: unknown };
    const id = wordsOf(doc.id);
    return [`${documentLabel(doc)}${id ? ` (${id})` : ''}`];
  });
}

/** DCRS's refusal as the connector error the assistant shows, in DCRS's own words where it gave some. */
export async function refusalOf(response: Response): Promise<ConnectorError> {
  const body = (await readJson(response)) as Refusal | undefined;
  const said = wordsOf(body?.error);
  const code = typeof body?.code === 'string' ? body.code : undefined;
  const listed = [body?.problems, body?.errors].find(Array.isArray) as unknown[] | undefined;
  const problems = (listed ?? []).map(problemWords).filter((p): p is string => !!p);
  const withProblems = (message: string) => {
    const extra = problems.filter((p) => !message.includes(p)).slice(0, 6);
    return extra.length > 0 ? `${message.replace(/[.:]?\s*$/, ':')} ${extra.join('; ')}.` : message;
  };

  switch (response.status) {
    case 400:
    case 415:
    case 422: {
      // A name that fits several documents: DCRS lists them, so the assistant can ask the person which one.
      const which = code === 'ambiguous' ? candidateWords(body?.candidates) : [];
      if (which.length > 0) return new ConnectorError('invalid_request', `${said ?? 'Several documents fit that name.'} They are: ${which.join('; ')}.`);
      return new ConnectorError('invalid_request', withProblems(said ?? 'DCRS turned the request down.'));
    }
    case 401:
      // A session DCRS ended (its super admin signed the device out): DCRS's own words, as they are (§106).
      if (code === SESSION_ENDED && said) return new ConnectorError('unauthorized', said, { code });
      return new ConnectorError('unauthorized', SIGNED_OUT);
    case 403:
      // Outside the plant's working hours, another department's records, a password still to change: DCRS says which.
      return new ConnectorError('forbidden', said ?? "DCRS doesn't let this account do that.");
    case 404:
      if (code === 'no-such-route') {
        return new ConnectorError('unavailable', "This DCRS server doesn't offer that yet. It needs updating to the version with the mobile app's API.");
      }
      return new ConnectorError('not_found', said ?? "DCRS has nothing like that. Check the details and try again.");
    case 409: {
      if (code === 'needs-reopen') {
        const message = said ?? 'That record cannot be changed as it stands.';
        return new ConnectorError(
          'conflict',
          /reopen/i.test(message) ? message : `${message} To correct it, it must first be reopened for correction, with a reason.`,
        );
      }
      return new ConnectorError('conflict', withProblems(said ?? 'DCRS could not do that as things stand.'));
    }
    case 413:
      return new ConnectorError('invalid_request', said ?? 'That is too large for DCRS to take.');
    case 429:
      // DCRS asks the person to wait (a second test push within 20 seconds): its words, as "too many", never "unavailable".
      return new ConnectorError('too_many', said ?? 'DCRS is busy. Try again in a minute.');
    case 503:
    case 504:
      // Such as a PDF that could not be printed: DCRS says why in words.
      return new ConnectorError('unavailable', said ?? "DCRS couldn't do that just now. Try again in a moment.");
    default:
      if (response.status >= 300 && response.status < 400) {
        // Not followed: a sign-in must never be sent on to another address unasked.
        return new ConnectorError('unavailable', REDIRECTED);
      }
      return new ConnectorError('unavailable', "DCRS couldn't do that just now. Try again in a moment.");
  }
}

/** The dcrs_session cookie DCRS set, with the moment it stops working (Max-Age first, then Expires). */
export function sessionCookie(headers: Headers, nowMs: number): { token: string; expiresAt: Date | null } | null {
  for (const line of headers.getSetCookie()) {
    const [pair = '', ...attributes] = line.split(';');
    const equals = pair.indexOf('=');
    if (equals < 0 || pair.slice(0, equals).trim() !== SESSION_COOKIE) continue;
    const token = pair.slice(equals + 1).trim();
    if (!token) return null;
    let maxAge: number | undefined;
    let expires: Date | null = null;
    for (const attribute of attributes) {
      const at = attribute.indexOf('=');
      const name = (at < 0 ? attribute : attribute.slice(0, at)).trim().toLowerCase();
      const value = at < 0 ? '' : attribute.slice(at + 1).trim();
      if (name === 'max-age' && /^-?\d+$/.test(value)) maxAge = Number(value);
      if (name === 'expires') expires = dateOf(value);
    }
    if (maxAge !== undefined) {
      // A cookie that has already ended is DCRS clearing it, not a session.
      if (maxAge <= 0) return null;
      return { token, expiresAt: new Date(nowMs + maxAge * 1000) };
    }
    if (expires && expires.getTime() <= nowMs) return null;
    return { token, expiresAt: expires };
  }
  return null;
}

function dateOf(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function earliest(...dates: (Date | null)[]): Date | null {
  const known = dates.filter((d): d is Date => d !== null);
  return known.length === 0 ? null : new Date(Math.min(...known.map((d) => d.getTime())));
}

/** The file name in a Content-Disposition header: the UTF-8 one when given, else the plain one. */
export function filenameOf(disposition: string | null): string | null {
  if (!disposition) return null;
  const encoded = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(disposition)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded.trim().replace(/^"|"$/g, ''));
    } catch {
      // Falls through to the plain name.
    }
  }
  const quoted = /filename\s*=\s*"((?:[^"\\]|\\.)*)"/.exec(disposition)?.[1];
  if (quoted !== undefined) return quoted.replace(/\\(.)/g, '$1') || null;
  const bare = /filename\s*=\s*([^;]+)/.exec(disposition)?.[1];
  return bare?.trim() || null;
}
