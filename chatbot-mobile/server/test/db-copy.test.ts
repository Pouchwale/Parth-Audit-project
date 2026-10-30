// MITRA'S DATA IN POSTGRESQL FOR DEPLOYMENT (DCRS REQUIREMENTS §107).
//
// Production keeps its data in PostgreSQL only: with NODE_ENV or MITRA_ENV set to production the server refuses to
// start on an embedded PGlite folder, in plain words and without the address (src/config.ts), and so does the demo.
//
// The copy of an embedded database into an empty PostgreSQL one loses nothing (src/db/copy.ts): every table of the
// schema, each after the tables it points to; every row with its id; moments to the microsecond, every byte of a file,
// JSON with Gujarati and Hindi in it; one transaction; the rows counted and fingerprinted on both sides; sequences set
// past the highest id. A target that already holds Mitra's rows, DCRS's own database, a folder a server still has
// open, and a folder that is not a database are refused, and nothing is changed.
//
// Always run here: PGlite to PGlite (the copy itself) and the refusals. With MITRA_PG_TEST_URL — a SUPERUSER's address
// on a THROWAWAY PostgreSQL server (the test makes and drops databases there) — the whole command into a real
// PostgreSQL, and the server's own migrations opening the result.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { embeddedDatabaseWarning, loadConfig, productionDatabaseRefusal, productionSaidBy } from '../src/config.ts';
import { CopyRefused, copyIntoPostgres, copyTables, setSequences, tablesInOrder, targetProblem } from '../src/db/copy.ts';
import { openDatabase, type Db } from '../src/db/index.ts';

const KEY = randomBytes(32).toString('base64');
const SERVER = fileURLToPath(new URL('..', import.meta.url));

describe('production keeps its data in PostgreSQL', () => {
  it('refuses to start in production on anything but a postgres:// DATABASE_URL, saying why and what to do', () => {
    expect(() => loadConfig({ CREDENTIALS_KEY: KEY, NODE_ENV: 'production' })).toThrow(
      /set to production \(NODE_ENV=production\), and in production Mitra keeps its data in PostgreSQL only: DATABASE_URL is not set/,
    );
    expect(() => loadConfig({ CREDENTIALS_KEY: KEY, MITRA_ENV: 'production', DATABASE_URL: '.data/pglite' })).toThrow(
      /MITRA_ENV=production.*DATABASE_URL names the embedded database folder \.data\/pglite/,
    );
    expect(() => loadConfig({ CREDENTIALS_KEY: KEY, NODE_ENV: 'production', DATABASE_URL: 'memory://' })).toThrow(/DATABASE_URL is not a postgres:\/\/ address/);
    const words = productionDatabaseRefusal('NODE_ENV', undefined);
    expect(words).toMatch(/npm --prefix server run db:copy -- --from \.data\/pglite --to postgres:\/\//);
    expect(words).toMatch(/The server did not start, and nothing was changed\.$/);
  });

  it('never says the address it refused: it may hold a password', () => {
    let said = '';
    try {
      loadConfig({ CREDENTIALS_KEY: KEY, NODE_ENV: 'production', DATABASE_URL: 'mysql://mitra:a-secret-word@db-host/mitra' });
    } catch (err) {
      said = (err as Error).message;
    }
    expect(said).toMatch(/not a postgres:\/\/ address/);
    expect(said).not.toContain('a-secret-word');
  });

  it('starts in production on PostgreSQL, and in development on the embedded database as before', () => {
    expect(loadConfig({ CREDENTIALS_KEY: KEY, NODE_ENV: 'production', DATABASE_URL: 'postgres://mitra:pw@db-host:5432/mitra' }).databaseUrl).toBe('postgres://mitra:pw@db-host:5432/mitra');
    expect(loadConfig({ CREDENTIALS_KEY: KEY, MITRA_ENV: 'production', DATABASE_URL: 'postgresql://mitra@db-host/mitra' }).databaseUrl).toBe('postgresql://mitra@db-host/mitra');
    expect(loadConfig({ CREDENTIALS_KEY: KEY }).databaseUrl).toBe('.data/pglite');
    expect(loadConfig({ CREDENTIALS_KEY: KEY, NODE_ENV: 'development' }).databaseUrl).toBe('.data/pglite');
    expect(productionSaidBy({ NODE_ENV: ' Production ' })).toBe('NODE_ENV');
    expect(productionSaidBy({ MITRA_ENV: 'production' })).toBe('MITRA_ENV');
    expect(productionSaidBy({ NODE_ENV: 'test' })).toBeNull();
  });

  it('says, every time the server starts on an embedded folder, that its data is not in PostgreSQL and how to move it (review of 12-Oct-2026)', () => {
    // The default (DATABASE_URL empty, NODE_ENV unset) kept everything in .data/pglite and said nothing about it, so the
    // owner's "both applications' data in our PostgreSQL" held only if somebody set DATABASE_URL by hand.
    const words = embeddedDatabaseWarning('.data/pglite');
    expect(words).toMatch(/^Mitra's data is kept in the embedded database folder \.data\/pglite, not in PostgreSQL:/);
    expect(words).toMatch(/no backup of the PostgreSQL server holds it/);
    expect(words).toMatch(/npm --prefix server run db:copy -- --from \.data\/pglite --to postgres:\/\/mitra:<its password>@127\.0\.0\.1:5432\/mitra/);
    expect(words).toMatch(/set DATABASE_URL in server\/\.env to that address and NODE_ENV=production/);
    // PostgreSQL itself, and a database in memory (a test's, the demo's: nothing kept), say nothing.
    expect(embeddedDatabaseWarning('postgres://mitra:pw@127.0.0.1:5432/mitra')).toBeNull();
    expect(embeddedDatabaseWarning('postgresql://mitra@db-host/mitra')).toBeNull();
    expect(embeddedDatabaseWarning('memory://')).toBeNull();
    // An address that is not PostgreSQL's is not printed: it may hold a password.
    const other = embeddedDatabaseWarning('mysql://mitra:a-secret-word@db-host/mitra') ?? '';
    expect(other).toMatch(/DATABASE_URL is not a postgres:\/\/ address/);
    expect(other).not.toContain('a-secret-word');
    // The real server says it as it starts, before it opens the folder: here one it cannot make (under a file), so it
    // stops at once instead of serving.
    const dir = mkdtempSync(join(tmpdir(), 'mitra-embedded-'));
    try {
      writeFileSync(join(dir, 'a-file'), 'not a folder');
      const folder = join(dir, 'a-file', 'pglite');
      const env = { ...process.env, CREDENTIALS_KEY: KEY, DATABASE_URL: folder, NODE_ENV: '', MITRA_ENV: '', PORT: '39871', HOST: '127.0.0.1' };
      const run = spawnSync(process.execPath, ['--no-warnings', 'src/index.ts'], { cwd: SERVER, env, encoding: 'utf8', timeout: 60_000 });
      expect(`${run.stdout}${run.stderr}`).toContain(`Mitra's data is kept in the embedded database folder ${folder}, not in PostgreSQL:`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the server and the demo say it in words and stop, with no stack trace', () => {
    const env = { ...process.env, NODE_ENV: 'production', CREDENTIALS_KEY: KEY, DATABASE_URL: '', MITRA_ENV: '' };
    for (const [file, words] of [
      ['src/index.ts', /set to production \(NODE_ENV=production\)/],
      ['src/demo.ts', /Demo mode is never run in production \(NODE_ENV=production\)/],
    ] as const) {
      const run = spawnSync(process.execPath, ['--no-warnings', file], { cwd: SERVER, env, encoding: 'utf8', timeout: 60_000 });
      expect(run.status, `${file}: ${run.stderr}`).toBe(1);
      expect(run.stderr).toMatch(words);
      expect(run.stderr).not.toMatch(/\n\s+at /);
    }
  });
});

// ---------------------------------------------------------------------------
// the copy

const ADA = '0b8a3b9e-1f6c-4d7e-9a2b-3c4d5e6f7a81';
const KAPILA = '0b8a3b9e-1f6c-4d7e-9a2b-3c4d5e6f7a82';
const SESSION = '1c9b4c0f-2a7d-4e8f-8b3c-4d5e6f7a8b91';
const SESSION_2 = '1c9b4c0f-2a7d-4e8f-8b3c-4d5e6f7a8b92';
const CONVERSATION = '2dac5d1a-3b8e-4f9a-9c4d-5e6f7a8b9ca1';
const ACTION = '3ebd6e2b-4c9f-4a0b-8d5e-6f7a8b9cadb1';
const FILE = '4fce7f3c-5d0a-4b1c-9e6f-7a8b9cadbec1';

/** One row or more in every table, with what a copy could lose: microseconds, every byte value, Gujarati and Hindi, emoji, nulls. */
async function fill(db: Db): Promise<void> {
  const run = (text: string) => db.execute(sql.raw(text));
  await run(`INSERT INTO users (id, provider, external_id, username, display_name, created_at, last_login_at, system_admin) VALUES
    ('${ADA}', 'dcrs', 'u-admin', 'admin@gpp.local', 'Super Admin', '2026-10-01 08:40:00.000001+05:30', '2026-10-09 10:15:03.123456+05:30', true),
    ('${KAPILA}', 'dcrs', 'u-qc', 'kapila.barad@gpp.local', 'કપિલા બારડ', '2026-10-02 09:00:00.5+05:30', NULL, false)`);
  await run(`INSERT INTO sessions (id, user_id, token_hash, device_id, device_name, device_model, os, os_version, app_version, user_agent, sign_in_ip, last_ip, created_at, last_seen_at, expires_at, ended_at, end_reason) VALUES
    ('${SESSION}', '${KAPILA}', 'hash-1', 'phone-1', 'Kapila''s phone', 'Pixel 7', 'Android', '14', '1.1.0', 'okhttp', '10.0.0.7', '10.0.0.8', '2026-10-09 09:00:00.654321+05:30', '2026-10-09 11:00:00+05:30', '2026-11-08 09:00:00+05:30', NULL, NULL),
    ('${SESSION_2}', '${ADA}', 'hash-2', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-08 18:00:00+05:30', '2026-10-08 18:30:00+05:30', '2026-11-07 18:00:00+05:30', '2026-10-08 18:31:00.000009+05:30', 'signed_out')`);
  await run(`INSERT INTO connector_credentials (session_id, connector_id, sealed, expires_at) VALUES ('${SESSION}', 'dcrs', 'sealed:abc==', '2026-10-09 18:20:00+05:30')`);
  await run(`INSERT INTO login_events (user_id, session_id, username, success, failure_reason, ip, user_agent, device, created_at) VALUES
    ('${KAPILA}', '${SESSION}', 'kapila.barad@gpp.local', true, NULL, '10.0.0.7', 'okhttp', '{"name": "Kapila''s phone", "model": "Pixel 7", "type": "phone"}', '2026-10-09 09:00:00.654321+05:30'),
    (NULL, NULL, 'someone@gpp.local', false, 'wrong password', '10.0.0.9', NULL, NULL, '2026-10-09 09:05:00+05:30')`);
  await run(`INSERT INTO conversations (id, user_id, session_id, title, transcript, messages, pending, created_at, updated_at) VALUES
    ('${CONVERSATION}', '${KAPILA}', '${SESSION}', 'આજે શું બાકી છે?', '[{"role": "user", "text": "आज क्या बाकी है? 🙂"}, {"role": "assistant", "text": "F/HR/17 \\\\ \\"quoted\\""}]', '[{"role": "user", "content": "x"}]', NULL, '2026-10-09 09:01:00+05:30', '2026-10-09 09:02:00.999999+05:30')`);
  await run(`INSERT INTO actions (id, user_id, session_id, conversation_id, connector_id, action, kind, input, summary, status, error, request, created_at, finished_at) VALUES
    ('${ACTION}', '${KAPILA}', '${SESSION}', '${CONVERSATION}', 'dcrs', 'pestControl.dailyReport', 'read', '{"date": "2026-10-09"}', 'The daily report of 9 October', 'done', NULL, 'the daily report', '2026-10-09 09:03:00+05:30', '2026-10-09 09:03:04.000123+05:30')`);
  await run(`INSERT INTO message_events (user_id, session_id, conversation_id, chars, attachments, created_at) VALUES ('${KAPILA}', '${SESSION}', '${CONVERSATION}', 17, 1, '2026-10-09 09:01:00+05:30')`);
  await run(`INSERT INTO files (id, user_id, conversation_id, origin, connector_id, action_id, filename, relative_path, mime_type, size_bytes, sha256, width, height, data, text, text_status, created_at) VALUES
    ('${FILE}', '${KAPILA}', '${CONVERSATION}', 'system', 'dcrs', '${ACTION}', 'F-HR-17 2026-10-09.pdf', NULL, 'application/pdf', 256, 'abc123', NULL, NULL,
     (SELECT decode(string_agg(lpad(to_hex(g), 2, '0'), '' ORDER BY g), 'hex') FROM generate_series(0, 255) g), NULL, 'none', '2026-10-09 09:03:05+05:30')`);
  await run(`INSERT INTO conversation_exports (kind, purpose, user_id, username, display_name, session_id, conversation_id, conversation_title, source, file_id, filename, mime_type, size_bytes, message_count, sha256, content, content_bytes, ip, user_agent, device, time_zone, created_at) VALUES
    ('file', 'download', '${KAPILA}', 'kapila.barad@gpp.local', 'કપિલા બારડ', '${SESSION}', '${CONVERSATION}', 'આજે શું બાકી છે?', 'dcrs', '${FILE}', 'F-HR-17 2026-10-09.pdf', 'application/pdf', 3, NULL, 'def456', NULL, '\\x00ff10', '10.0.0.7', 'okhttp', '{"name": "Pixel 7"}', 'Asia/Kolkata', '2026-10-09 09:04:00.000001+05:30')`);
  await run(`INSERT INTO weekly_reports (week_start, time_zone, generated_at, report) VALUES ('2026-09-28', 'Asia/Kolkata', '2026-10-05 00:00:01+05:30', '{"signIns": 12, "people": ["કપિલા"]}')`);
  // More rows than a page holds: the copy reads on from the last primary key (500 rows a page; 4 for a table with bytes).
  await run(`INSERT INTO login_events (username, success, created_at) SELECT 'someone-' || g || '@gpp.local', g % 3 <> 0, '2026-10-01 00:00:00.000001+00'::timestamptz + g * interval '1.000001 second' FROM generate_series(1, 1200) g`);
  await run(`INSERT INTO files (user_id, origin, filename, mime_type, size_bytes, sha256, data, text_status, created_at) SELECT '${KAPILA}', 'upload', 'photo-' || g || '.jpg', 'image/jpeg', 16, md5(g::text), decode(md5(g::text), 'hex'), 'none', '2026-10-09 09:00:00+05:30' FROM generate_series(1, 9) g`);
}

/** Every table's rows as text (moments in UTC), and an MD5 of them: what must be the same on both sides. */
async function contents(db: Db): Promise<Record<string, { rows: number; md5: string }>> {
  await db.execute(sql.raw("SET TimeZone = 'UTC'"));
  const out: Record<string, { rows: number; md5: string }> = {};
  for (const table of tablesInOrder()) {
    const [r] = ((await db.execute(sql.raw(`SELECT count(*)::int AS n, coalesce(md5(string_agg(t::text, '|' ORDER BY t::text)), '') AS f FROM public."${table.name}" t`))) as unknown as { rows: { n: number; f: string }[] }).rows;
    out[table.name] = { rows: Number(r?.n), md5: r?.f ?? '' };
  }
  return out;
}

const EXPECTED_ROWS = { users: 2, sessions: 2, connector_credentials: 1, login_events: 1202, conversations: 1, actions: 1, message_events: 1, files: 10, conversation_exports: 1, weekly_reports: 1 };

describe('the copy of an embedded database', () => {
  let folder = '';
  let before: Record<string, { rows: number; md5: string }> = {};

  beforeAll(async () => {
    folder = mkdtempSync(join(tmpdir(), 'mitra-pglite-'));
    const source = await openDatabase(folder);
    await fill(source.db);
    before = await contents(source.db);
    await source.close();
  });

  afterAll(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it('takes every table of the schema, each after the tables its foreign keys point to', () => {
    const order = tablesInOrder().map((t) => t.name);
    expect(new Set(order)).toEqual(new Set(Object.keys(EXPECTED_ROWS)));
    for (const table of tablesInOrder()) for (const parent of table.references) expect(order.indexOf(parent)).toBeLessThan(order.indexOf(table.name));
    expect(tablesInOrder().find((t) => t.name === 'connector_credentials')?.primaryKey).toEqual(['session_id', 'connector_id']);
  });

  it('copies every row of every table whole: ids, moments to the microsecond, every byte, JSON with Gujarati, Hindi and emoji, nulls', async () => {
    const source = await openDatabase(folder);
    const target = await openDatabase('memory://');
    try {
      const lines: string[] = [];
      const copied = await copyTables(source.db, target.db, (line) => lines.push(line));
      expect(Object.fromEntries(copied.map((t) => [t.table, t.copied]))).toEqual(EXPECTED_ROWS);
      expect(copied.every((t) => t.rows === t.copied)).toBe(true);
      expect(lines.join('\n')).toMatch(/files\.* 10 rows copied, the same as in the embedded database/);
      expect(await contents(target.db)).toEqual(before);
      // And read back as the app reads it.
      const file = ((await target.db.execute(sql.raw(`SELECT encode(data, 'hex') AS hex, length(data) AS n FROM files WHERE id = '${FILE}'`))) as unknown as { rows: { hex: string; n: number }[] }).rows[0];
      expect(file?.n).toBe(256);
      expect(file?.hex).toBe(Array.from({ length: 256 }, (_v, i) => i.toString(16).padStart(2, '0')).join(''));
      const user = ((await target.db.execute(sql.raw(`SELECT display_name, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') AS at FROM users WHERE id = '${KAPILA}'`))) as unknown as { rows: { display_name: string; at: string }[] }).rows[0];
      expect(user).toEqual({ display_name: 'કપિલા બારડ', at: '2026-10-02 03:30:00.500000' });
      const said = ((await target.db.execute(sql.raw(`SELECT transcript->0->>'text' AS t FROM conversations`))) as unknown as { rows: { t: string }[] }).rows[0];
      expect(said?.t).toBe('आज क्या बाकी है? 🙂');
    } finally {
      await source.close();
      await target.close();
    }
  });

  it('refuses a target that already holds Mitra\'s rows, and DCRS\'s own database, and changes nothing', async () => {
    const source = await openDatabase(folder);
    const target = await openDatabase('memory://');
    try {
      await copyTables(source.db, target.db);
      const once = await contents(target.db);
      await expect(copyTables(source.db, target.db)).rejects.toThrow(/already holds Mitra's data: users \(2 rows\).*Nothing was copied/);
      expect(await contents(target.db)).toEqual(once);
    } finally {
      await source.close();
      await target.close();
    }
    const dcrs = await openDatabase('memory://');
    try {
      await dcrs.db.execute(sql.raw('CREATE TABLE public.app_storage (scope text, key text, value text)'));
      expect(await targetProblem(dcrs.db)).toMatch(/That is DCRS's database.*"mitra"/);
    } finally {
      await dcrs.close();
    }
  });

  it('sets a sequence past the highest id copied, so a new row never takes a used one', async () => {
    const db = await openDatabase('memory://');
    try {
      await db.db.execute(sql.raw('CREATE TABLE public.counted (id serial PRIMARY KEY, x text)'));
      await db.db.execute(sql.raw("INSERT INTO public.counted (id, x) VALUES (5, 'a'), (9, 'b')"));
      expect(await setSequences(db.db, 'counted')).toEqual(['public.counted_id_seq']);
      const next = ((await db.db.execute(sql.raw("INSERT INTO public.counted (x) VALUES ('c') RETURNING id"))) as unknown as { rows: { id: number }[] }).rows[0];
      expect(next?.id).toBe(10);
    } finally {
      await db.close();
    }
  });

  it('refuses a folder that is not a database, a folder a server has open, and an address that is not PostgreSQL, changing nothing', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'mitra-not-a-database-'));
    try {
      await expect(copyIntoPostgres({ from: empty, to: 'postgres://mitra@127.0.0.1:1/mitra', log: () => undefined })).rejects.toThrow(/There is no embedded database at/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
    const open = await openDatabase(folder);
    try {
      expect(existsSync(join(folder, 'postmaster.pid'))).toBe(true);
      const refused = copyIntoPostgres({ from: folder, to: 'postgres://mitra@127.0.0.1:1/mitra', log: () => undefined });
      await expect(refused).rejects.toBeInstanceOf(CopyRefused);
      await expect(refused).rejects.toThrow(/is open: a Mitra server is using it.*--not-running/);
    } finally {
      await open.close();
    }
    await expect(copyIntoPostgres({ from: folder, to: 'mysql://mitra@db-host/mitra', log: () => undefined })).rejects.toThrow(/--to must be a postgres:\/\/ address/);
    // The folder is as it was.
    const again = await openDatabase(folder);
    try {
      expect(await contents(again.db)).toEqual(before);
    } finally {
      await again.close();
    }
  });
});

// ---------------------------------------------------------------------------
// into a real PostgreSQL

const PG_URL = process.env.MITRA_PG_TEST_URL?.trim() ?? '';

describe.skipIf(!PG_URL)('into a real PostgreSQL (a throwaway server: MITRA_PG_TEST_URL)', () => {
  const tag = randomBytes(3).toString('hex');
  const made: string[] = [];
  let su: pg.Client;
  let folder = '';
  let before: Record<string, { rows: number; md5: string }> = {};
  const urlOf = (database: string): string => {
    const u = new URL(PG_URL);
    u.pathname = `/${database}`;
    return u.toString();
  };

  beforeAll(async () => {
    su = new pg.Client({ connectionString: PG_URL });
    await su.connect();
    folder = mkdtempSync(join(tmpdir(), 'mitra-pglite-pg-'));
    const source = await openDatabase(folder);
    await fill(source.db);
    before = await contents(source.db);
    await source.close();
  });

  afterAll(async () => {
    for (const database of made) await su.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`).catch(() => undefined);
    await su.end();
    rmSync(folder, { recursive: true, force: true });
  });

  it('copies the folder whole into an empty database, which the server then opens; a second copy is refused', async () => {
    const database = `mitra_copy_${tag}`;
    await su.query(`CREATE DATABASE "${database}" ENCODING 'UTF8' TEMPLATE template0`);
    made.push(database);
    const lines: string[] = [];
    const copied = await copyIntoPostgres({ from: folder, to: urlOf(database), log: (line) => lines.push(line) });
    expect(Object.fromEntries(copied.map((t) => [t.table, t.copied]))).toEqual(EXPECTED_ROWS);
    expect(lines.join('\n')).toMatch(/Done: 10 tables, 1222 rows, every row checked/);
    const password = new URL(PG_URL).password;
    if (password) expect(lines.join('\n')).not.toContain(password);
    // The server opens it as it is (its migrations are there already) and reads exactly what the folder held.
    const opened = await openDatabase(urlOf(database));
    try {
      expect(await contents(opened.db)).toEqual(before);
    } finally {
      await opened.close();
    }
    // The folder was only read.
    const again = await openDatabase(folder);
    try {
      expect(await contents(again.db)).toEqual(before);
    } finally {
      await again.close();
    }
    await expect(copyIntoPostgres({ from: folder, to: urlOf(database), log: () => undefined })).rejects.toThrow(/already holds Mitra's data.*Nothing was changed/);
  });

  it("refuses DCRS's own database, and a database not in UTF8, and changes nothing", async () => {
    const dcrs = `mitra_dcrs_like_${tag}`;
    await su.query(`CREATE DATABASE "${dcrs}" ENCODING 'UTF8' TEMPLATE template0`);
    made.push(dcrs);
    const c = new pg.Client({ connectionString: urlOf(dcrs) });
    await c.connect();
    try {
      await c.query('CREATE TABLE public.app_storage (scope text, key text, value text)');
      await expect(copyIntoPostgres({ from: folder, to: urlOf(dcrs), log: () => undefined })).rejects.toThrow(/That is DCRS's database/);
      expect((await c.query("SELECT count(*)::int AS n FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'")).rows[0].n).toBe(1);
    } finally {
      await c.end();
    }
    const latin = `mitra_latin_${tag}`;
    await su.query(`CREATE DATABASE "${latin}" ENCODING 'LATIN1' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`);
    made.push(latin);
    await expect(copyIntoPostgres({ from: folder, to: urlOf(latin), log: () => undefined })).rejects.toThrow(/LATIN1 encoding.*must be UTF8/);
  });
});
