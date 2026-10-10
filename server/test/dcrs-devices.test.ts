// WHO IS SIGNED IN WHERE, FROM THE PHONE'S SIDE (DCRS REQUIREMENTS §106), through the real server and the real DCRS
// connector, with DCRS the stand-in:
//   * the Mitra server says which phone signs in: with MITRA_SERVER_KEY set, X-Mitra-Key and the phone's id, name,
//     model, system, kind, app version and address go with DCRS's sign-in (percent-encoded, so a Gujarati name travels
//     as ASCII), with the app's language; without the key, none of them; and the key is in no log line and no answer;
//   * a phone signing in again sends the DCRS session it still holds, so DCRS replaces it rather than counting it twice;
//   * DCRS's refusal of one device too many reaches the app in DCRS's own words, unchanged, in the app's language;
//   * a phone DCRS's super admin signed out is signed out of Mitra at its next request, saying so in DCRS's words; on
//     the inbox, tasks and Review screens too; DCRS out of reach is not a sign-out;
//   * ONE PASSWORD FOR THE WEBSITE AND THE PHONE (DCRS §105): in a production setup the only way in is DCRS's own
//     sign-in, and nothing of the password is kept here, so the password DCRS's super admin sets is the phone's too.
// Run: npm test -- dcrs-devices
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { getTableColumns, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { LoginResponse } from '@shared/api.ts';
import { buildApp } from '../src/app.ts';
import { unseal } from '../src/auth/crypto.ts';
import { loadConfig } from '../src/config.ts';
import { phoneHeaders } from '../src/connectors/dcrs/client.ts';
import { createDcrsConnector } from '../src/connectors/dcrs/index.ts';
import { connectors, SIGN_IN_CONNECTOR } from '../src/connectors/index.ts';
import { createRegistry } from '../src/connectors/registry.ts';
import { openDatabase, type Database } from '../src/db/index.ts';
import { connectorCredentials, loginEvents, sessions, users } from '../src/db/schema.ts';
import { BASE, json, ME, refusal, signedIn, standInDcrs, TOKEN, type Route } from './dcrs-standin.ts';
import { scriptedModel, testConfig } from './helpers.ts';

const KEY = 'the-mitra-server-key-0123456789abcdef';
const PHONE = {
  deviceId: '3f1c2d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f',
  name: 'કપિલાનો ફોન',
  model: 'Pixel 8',
  os: 'Android',
  osVersion: '14',
  appVersion: '1.1.0',
  type: 'phone' as const,
};
const LIMIT_WORDS_GU =
  'આ ખાતું પહેલેથી 2 ઉપકરણો પર સાઇન ઇન છે: Windows computer - Chrome (વેબસાઇટ, 09:02 થી) અને iPhone - Safari (વેબસાઇટ, 10:15 થી). તેમાંથી એક પર સાઇન આઉટ કરો, અથવા સુપર એડમિનને એક સાઇન આઉટ કરવા કહો.';
const ENDED_WORDS = 'The super admin signed this device out at 14:05. Sign in again to carry on.';

let database: Database;
beforeAll(async () => {
  database = await openDatabase('memory://');
});
afterAll(async () => {
  await database.close();
});

let running: Awaited<ReturnType<typeof buildApp>> | undefined;
beforeEach(async () => {
  await database.db.execute(sql`truncate users, sessions, connector_credentials, login_events, conversations, actions, message_events, files, conversation_exports, weekly_reports cascade`);
});
afterEach(async () => {
  await running?.close();
  running = undefined;
});

/** The server on the stand-in DCRS, with MITRA_SERVER_KEY or without, every log line kept. */
async function start(routes: Record<string, Route> = {}, options: { key?: string; checkEveryMs?: number } = {}) {
  const dcrs = standInDcrs(routes);
  const connector = createDcrsConnector({ baseUrl: BASE, fetch: dcrs.fetch, serverKey: options.key });
  const logged: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      logged.push(String(chunk));
      done();
    },
  });
  const config = testConfig({ dcrsBaseUrl: BASE, mitraServerKey: options.key, ...(options.checkEveryMs === undefined ? {} : { upstreamCheckMs: options.checkEveryMs }) });
  const app = await buildApp(
    { config, db: database.db, registry: createRegistry([connector], 'dcrs'), model: scriptedModel().model, transcriber: async () => '', imageReader: async () => '' },
    { logger: { level: 'trace', stream } },
  );
  running = app;
  const login = (headers: Record<string, string> = {}, device: object = PHONE, password = 'right') =>
    app.inject({ method: 'POST', url: '/auth/login', headers, payload: { username: 'kapila.barad@gpp.local', password, device } });
  const as = (token: string, headers: Record<string, string> = {}) => ({
    get: (url: string) => app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}`, ...headers } }),
  });
  return { app, dcrs, login, as, logged, config };
}

it('tells DCRS which phone signs in, beside the key, in the app\'s language; the key is in no log and no answer', async () => {
  const { dcrs, login, as, logged } = await start({}, { key: KEY });
  const response = await login({ 'x-language': 'gu' });
  expect(response.statusCode).toBe(200);
  const sent = dcrs.seen.find((r) => r.method === 'POST' && r.path === '/api/auth/login')!;
  // Each value percent-encoded, as DCRS reads them (decodeURIComponent): every header stays plain ASCII.
  for (const [name, value] of Object.entries(sent.headers)) if (name.startsWith('x-mitra-')) expect(/^[\x21-\x7e]+$/.test(value), name).toBe(true);
  const decoded = Object.fromEntries(Object.entries(sent.headers).map(([k, v]) => [k, k.startsWith('x-mitra-') ? decodeURIComponent(v) : v]));
  expect(decoded).toMatchObject({
    'x-mitra-key': KEY,
    'x-mitra-device-id': PHONE.deviceId,
    'x-mitra-device-model': 'Pixel 8',
    'x-mitra-device-system': 'Android 14',
    'x-mitra-device-type': 'phone',
    'x-mitra-app-version': '1.1.0',
    'x-mitra-device-address': '127.0.0.1',
    'x-language': 'gu',
    'x-client-name': 'Mitra mobile app',
  });
  expect(decoded['x-mitra-device-name']).toBe('કપિલાનો ફોન');
  expect(/^[\x20-\x7e]+$/.test(sent.headers['x-mitra-device-name']!)).toBe(true);
  // Only the sign-in carries it: no other call to DCRS does.
  const token = response.json<LoginResponse>().token;
  await as(token).get('/me');
  expect(dcrs.seen.filter((r) => r.headers['x-mitra-key'] !== undefined).map((r) => r.path)).toEqual(['/api/auth/login']);
  expect(response.body).not.toContain(KEY);
  expect(logged.length).toBeGreaterThan(0);
  for (const line of logged) expect(line).not.toContain(KEY);
});

it('sends none of the phone\'s headers without MITRA_SERVER_KEY: DCRS then records the Mitra server\'s request', async () => {
  const { dcrs, login } = await start();
  expect((await login()).statusCode).toBe(200);
  const sent = dcrs.seen.find((r) => r.path === '/api/auth/login')!;
  expect(Object.keys(sent.headers).filter((h) => h.startsWith('x-mitra-'))).toEqual([]);
  expect(phoneHeaders(undefined, { device: PHONE })).toEqual({});
  expect(phoneHeaders(KEY, undefined)).toEqual({});
});

it('hands DCRS the session this phone still holds when it signs in again, so DCRS replaces it rather than counting it twice', async () => {
  let n = 0;
  const { dcrs, login } = await start({
    'POST /api/auth/login': () => {
      n += 1;
      return signedIn({ maxAge: 30_600, cookie: `dcrs_session=${TOKEN}-${n}; Max-Age=30600; Path=/; HttpOnly` });
    },
  });
  expect((await login()).statusCode).toBe(200);
  expect((await login()).statusCode).toBe(200);
  const sign = dcrs.seen.filter((r) => r.path === '/api/auth/login');
  expect(sign[0]!.headers.cookie).toBeUndefined();
  expect(sign[1]!.headers.cookie).toBe(`dcrs_session=${TOKEN}-1`);
  // Another phone of the same person holds nothing of it.
  await login({}, { ...PHONE, deviceId: 'another-phone-0001' });
  expect(dcrs.seen.filter((r) => r.path === '/api/auth/login')[2]!.headers.cookie).toBeUndefined();
});

it("passes DCRS's refusal of one device too many to the app unchanged, in the app's language", async () => {
  const { login } = await start({
    'POST /api/auth/login': (r) =>
      refusal(403, 'device-limit', r.headers['x-language'] === 'gu' ? LIMIT_WORDS_GU : 'This account is already signed in on 2 devices.', {
        limit: 2,
        devices: [],
      }),
  });
  const refused = await login({ 'x-language': 'gu' });
  expect(refused.statusCode).toBe(403);
  expect(refused.json()).toEqual({ error: 'device_limit', message: LIMIT_WORDS_GU });
  const [event] = await database.db.select().from(loginEvents);
  expect(event).toMatchObject({ success: false, failureReason: 'forbidden' });
  expect(await database.db.select().from(sessions)).toEqual([]);
});

it('signs a phone out at its next request once DCRS\'s super admin has signed it out, in DCRS\'s words', async () => {
  let ended = false;
  const { login, as, dcrs } = await start(
    {
      'GET /api/v1/me': (r) => (ended ? refusal(401, 'session-ended', ENDED_WORDS, { why: 'super-admin', endedAtText: '14:05' }) : json(200, { ...ME, _lang: r.headers['x-language'] ?? null })),
    },
    { checkEveryMs: 0 },
  );
  const token = (await login()).json<LoginResponse>().token;
  expect((await as(token).get('/me')).statusCode).toBe(200);
  ended = true;
  const next = await as(token).get('/me');
  expect(next.statusCode).toBe(401);
  expect(next.json()).toEqual({ error: 'session_ended', message: ENDED_WORDS });
  const [session] = await database.db.select().from(sessions);
  expect(session!.endedAt).not.toBeNull();
  expect(session!.endReason).toBe('upstream_signed_out');
  expect(await database.db.select().from(connectorCredentials)).toEqual([]);
  // Signed out here for good: the next request is Mitra's own refusal, without asking DCRS again.
  const asked = dcrs.seen.length;
  const after = await as(token).get('/me');
  expect(after.statusCode).toBe(401);
  expect(after.json<{ error: string }>().error).toBe('session_expired');
  expect(dcrs.seen.length).toBe(asked);
});

it("says DCRS's words on the inbox, tasks and Review screens too, when DCRS refuses the relayed request", async () => {
  const { login, as } = await start({
    'GET /api/v1/today': () => refusal(401, 'session-ended', ENDED_WORDS, { why: 'super-admin', endedAtText: '14:05' }),
  });
  const token = (await login()).json<LoginResponse>().token;
  const tasks = await as(token).get('/tasks');
  expect(tasks.statusCode).toBe(401);
  expect(tasks.json()).toEqual({ error: 'session_ended', message: ENDED_WORDS });
});

it("keeps the words of a plain end of DCRS's day as they were: the sign-in has expired", async () => {
  const again = await start({ 'GET /api/v1/today': () => json(401, { error: 'Not signed in, or the session has ended.', code: 'not-signed-in' }) });
  const other = (await again.login()).json<LoginResponse>().token;
  const plain = await again.as(other).get('/tasks');
  expect(plain.statusCode).toBe(401);
  expect(plain.json<{ error: string }>().error).toBe('session_expired');
});

it('keeps the phone signed in when DCRS cannot be reached to check, or refuses for another reason', async () => {
  let answer: 'ok' | 'down' | 'hours' = 'ok';
  const { login, as } = await start(
    {
      'GET /api/v1/me': () => {
        if (answer === 'ok') return json(200, ME);
        if (answer === 'down') throw new TypeError('fetch failed');
        return refusal(403, 'outside-working-hours', 'Staff working hours are over for today.');
      },
    },
    { checkEveryMs: 0 },
  );
  const token = (await login()).json<LoginResponse>().token;
  answer = 'down';
  expect((await as(token).get('/me')).statusCode).toBe(200);
  answer = 'hours';
  expect((await as(token).get('/me')).statusCode).toBe(200);
  const [session] = await database.db.select().from(sessions);
  expect(session!.endedAt).toBeNull();
});

it('asks DCRS at most once every upstreamCheckMs per session: a sign-in counts as asked', async () => {
  const { login, as, dcrs } = await start({}, { checkEveryMs: 60_000 });
  const token = (await login()).json<LoginResponse>().token;
  const before = dcrs.seen.filter((r) => r.path === '/api/v1/me').length;
  for (let i = 0; i < 3; i++) expect((await as(token).get('/me')).statusCode).toBe(200);
  expect(dcrs.seen.filter((r) => r.path === '/api/v1/me').length).toBe(before);
});

it('ONE PASSWORD: in a production setup the phone signs in only through DCRS\'s own sign-in, and keeps nothing of the password', async () => {
  // The server as `npm start` builds it (src/index.ts): the connectors of the configuration, DCRS's the sign-in one.
  const config = loadConfig({ CREDENTIALS_KEY: randomBytes(32).toString('base64'), DCRS_BASE_URL: 'http://dcrs-host:4000', MITRA_SERVER_KEY: KEY } as NodeJS.ProcessEnv);
  const registry = createRegistry(connectors(config), SIGN_IN_CONNECTOR);
  expect(registry.connectors.map((c) => c.id)).toEqual(['dcrs']);
  expect(registry.signIn.id).toBe('dcrs');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const entry = readFileSync(path.join(here, '..', 'src', 'index.ts'), 'utf8');
  expect(entry).toContain('createRegistry(connectors(config), SIGN_IN_CONNECTOR)');
  expect(entry).not.toMatch(/demo/i);
  // No table here holds a password: an account is DCRS's id and name, a session DCRS's token, sealed.
  for (const table of [users, sessions, loginEvents, connectorCredentials]) {
    expect(Object.keys(getTableColumns(table)).filter((c) => /pass(word)?/i.test(c))).toEqual([]);
  }

  // The password typed goes to DCRS's sign-in and nowhere else; what is kept is DCRS's session token alone.
  const { login, dcrs, config: running } = await start({
    'POST /api/auth/login': (r) => ((r.body as { password: string }).password === 'set-by-the-super-admin' ? signedIn({ maxAge: 30_600 }) : json(401, { error: 'Invalid email or password.' })),
  });
  expect((await login({}, PHONE, 'an-old-password')).statusCode).toBe(401);
  const ok = await login({}, PHONE, 'set-by-the-super-admin');
  expect(ok.statusCode).toBe(200);
  expect(dcrs.seen.filter((r) => JSON.stringify(r.body ?? '').includes('set-by-the-super-admin')).map((r) => r.path)).toEqual(['/api/auth/login']);
  const [kept] = await database.db.select().from(connectorCredentials);
  expect(unseal(running.credentialsKey, kept!.sealed)).toEqual({ token: TOKEN });
  const everything = JSON.stringify(await database.db.execute(sql`select * from users, sessions, login_events`));
  expect(everything).not.toContain('set-by-the-super-admin');
  expect(everything).not.toContain('an-old-password');
});

it('refuses a MITRA_SERVER_KEY too short to be safe, as DCRS does, saying so', () => {
  expect(() => loadConfig({ CREDENTIALS_KEY: randomBytes(32).toString('base64'), MITRA_SERVER_KEY: 'short' } as NodeJS.ProcessEnv)).toThrow(/MITRA_SERVER_KEY must be at least 16 characters/);
  expect(loadConfig({ CREDENTIALS_KEY: randomBytes(32).toString('base64') } as NodeJS.ProcessEnv).mitraServerKey).toBeUndefined();
});
