// THE DATABASE: PostgreSQL, and nothing else (REQUIREMENTS §55).
//
// Every piece of data the system keeps lives here — the user accounts, the
// reminder digest log, and all of the app's own data: the records, the
// document definitions, master data, the HR Master Data sheet, reference
// edits, the deletions log, the date the system went live (company-wide), and
// each person's settings and assistant conversations (their own). The browser
// holds only a working copy, loaded from here when a person signs in and
// written back as they work (frontend/src/data/serverSync.ts).
//
// Where the database is:
//   DATABASE_URL set    that PostgreSQL server — how a deployment runs
//   DATABASE_URL unset  a PostgreSQL server of the app's own on this machine,
//                       from the embedded-postgres package (real PostgreSQL
//                       binaries, no installation), its data in
//                       backend/data/postgres — so `npm start` still needs
//                       nothing but Node.js. It is started with pg_ctl as a
//                       process of its own, not a child of this server: it
//                       keeps running when the server stops (a second server
//                       on this machine may be using it), and the next start
//                       uses it. `npm run db:stop` shuts it down cleanly.
//
// An install that used the earlier SQLite file (backend/data/app.db) has its
// accounts and digest log copied into PostgreSQL the first time it starts
// against an empty database; the file is then renamed app.db.imported and is
// never read again.
import pg from "pg";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "./paths.ts";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: "admin" | "staff";
  created_at: string;
  /** Comma-separated department codes; "" = every department. */
  departments: string;
}

let pool: pg.Pool | null = null;

export function database(): pg.Pool {
  if (!pool) throw new Error("The database is not open yet.");
  return pool;
}

export const EMBEDDED_DIR = path.join(dataDir, "postgres");
const EMBEDDED_PASSWORD_FILE = path.join(dataDir, "postgres-password");
const EMBEDDED_LOG_FILE = path.join(dataDir, "postgres.log");
const EMBEDDED_DB = "dcrs";

function embeddedPassword(): string {
  if (existsSync(EMBEDDED_PASSWORD_FILE)) return readFileSync(EMBEDDED_PASSWORD_FILE, "utf-8").trim();
  const password = crypto.randomBytes(24).toString("hex");
  writeFileSync(EMBEDDED_PASSWORD_FILE, password, { mode: 0o600 });
  return password;
}

/** pg_ctl from the embedded-postgres binaries for this platform. */
export async function pgCtlPath(): Promise<string> {
  const platform = process.platform === "win32" ? "windows" : process.platform;
  const binaries = (await import(`@embedded-postgres/${platform}-${process.arch}`)) as { pg_ctl: string };
  return binaries.pg_ctl;
}

type Probe = { kind: "running" } | { kind: "absent" } | { kind: "starting" } | { kind: "refused"; reason: string };

/** Is a PostgreSQL answering at this address, and will it let us in? */
async function probe(connectionString: string): Promise<Probe> {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 3000 });
  client.on("error", () => {});
  try {
    await client.connect();
    await client.end();
    return { kind: "running" };
  } catch (err) {
    try {
      await client.end();
    } catch {
      /* not connected */
    }
    const code = (err as { code?: string }).code;
    const message = err instanceof Error ? err.message : String(err);
    if (code === "ECONNREFUSED" || code === "ECONNRESET" || /timeout/i.test(message)) return { kind: "absent" };
    if (code === "57P03") return { kind: "starting" };
    return { kind: "refused", reason: `${code ?? ""} ${message}`.trim() };
  }
}

const sameDir = (a: string, b: string) => {
  const norm = (p: string) => path.resolve(p).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? norm(a).toLowerCase() === norm(b).toLowerCase() : norm(a) === norm(b);
};

function lastLines(file: string, n: number): string {
  try {
    return readFileSync(file, "utf-8").split(/\r?\n/).filter(Boolean).slice(-n).join("\n");
  } catch {
    return "";
  }
}

/** Runs pg_ctl as a process of its own (detached), so the database outlives this server. */
async function pgCtl(args: string[]): Promise<number> {
  const bin = await pgCtlPath();
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.on("error", reject);
    // Waited for (pg_ctl exits once the server is up); the server it starts is not this process's child.
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

/** The app's own PostgreSQL on this machine, started if it is not already running. */
async function embeddedDatabaseUrl(): Promise<string> {
  const port = Number(process.env.EMBEDDED_PG_PORT ?? 5433);
  const password = embeddedPassword();
  const url = (db: string) => `postgres://postgres:${password}@127.0.0.1:${port}/${db}`;
  const otherServer = (reason: string) =>
    new Error(
      `Port ${port} is already used by another PostgreSQL (${reason}), not this app's own database in ${EMBEDDED_DIR}. ` +
        `Set EMBEDDED_PG_PORT to a free port, or DATABASE_URL to use that server.`
    );

  let state = await probe(url("postgres"));
  for (let i = 0; i < 30 && state.kind === "starting"; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    state = await probe(url("postgres"));
  }
  if (state.kind === "refused") throw otherServer(state.reason);
  if (state.kind === "starting") throw new Error(`The local PostgreSQL on port ${port} did not finish starting.`);

  if (state.kind === "absent") {
    if (!existsSync(path.join(EMBEDDED_DIR, "PG_VERSION"))) {
      console.log("Setting up the local PostgreSQL database (first start only)...");
      const { default: EmbeddedPostgres } = await import("embedded-postgres");
      const setup = new EmbeddedPostgres({
        databaseDir: EMBEDDED_DIR,
        user: "postgres",
        password,
        port,
        persistent: true,
        // UTF-8 whatever the machine's language: the records hold Gujarati, "→", "–".
        initdbFlags: ["--encoding=UTF8", "--locale=C"],
        onLog: () => {},
        onError: (message: unknown) => console.error("[postgres]", String(message)),
      });
      await setup.initialise();
    }
    const code = await pgCtl(["start", "-w", "-t", "90", "-D", EMBEDDED_DIR, "-l", EMBEDDED_LOG_FILE, "-o", `-p ${port} -c listen_addresses=127.0.0.1`]);
    if (code !== 0) {
      const log = lastLines(EMBEDDED_LOG_FILE, 6);
      throw new Error(
        `The local PostgreSQL (port ${port}, data ${EMBEDDED_DIR}) did not start (pg_ctl exited ${code}).` +
          (log ? `\nLast lines of ${EMBEDDED_LOG_FILE}:\n${log}` : "") +
          `\nIf a postgres.exe from an earlier run is still listed in the Task Manager, end it and start again.`
      );
    }
    state = await probe(url("postgres"));
    if (state.kind !== "running") throw new Error(`The local PostgreSQL started but does not answer on port ${port}.`);
  }

  const admin = new pg.Client({ connectionString: url("postgres") });
  admin.on("error", () => {});
  await admin.connect();
  try {
    // Reusing a running server: only if it is this app's own, from its own data directory.
    const dir = await admin.query<{ data_directory: string }>("SHOW data_directory");
    if (!sameDir(dir.rows[0].data_directory, EMBEDDED_DIR)) throw otherServer(`its data is in ${dir.rows[0].data_directory}`);
    const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [EMBEDDED_DB]);
    if (exists.rowCount === 0) await admin.query(`CREATE DATABASE ${EMBEDDED_DB} ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'`);
  } finally {
    await admin.end();
  }
  return url(EMBEDDED_DB);
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    created_at TEXT NOT NULL,
    -- The departments a user may see: department codes of the company's
    -- master list of formats (F/SYS/02), comma separated; empty = every
    -- department (frontend/src/engine/departmentScope.ts).
    departments TEXT NOT NULL DEFAULT ''
  );

  -- Single row (id is always 1): the last date a reminder digest email went
  -- out, so five people opening the app one morning send one digest.
  CREATE TABLE IF NOT EXISTS digest_log (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_sent_date TEXT
  );

  -- The app's own data, one row per stored item: scope is 'company' for what
  -- the whole plant shares, or a user's id for what is theirs alone. value is
  -- the item exactly as the app wrote it (JSON text). version counts writes to
  -- the row, so a stale write is refused and merged instead of overwriting;
  -- seq orders every write (writes take their seq one at a time, in commit
  -- order), so a browser can ask for what changed since.
  CREATE SEQUENCE IF NOT EXISTS app_storage_seq;
  CREATE TABLE IF NOT EXISTS app_storage (
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    seq BIGINT NOT NULL DEFAULT nextval('app_storage_seq'),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by TEXT,
    PRIMARY KEY (scope, key)
  );
  CREATE INDEX IF NOT EXISTS app_storage_seq_idx ON app_storage (seq);

  -- THE ACTIVITY LOG (REQUIREMENTS §62): one line for everything anybody does
  -- on the portal — signing in and out, opening, writing, submitting,
  -- verifying, correcting, deleting, printing, downloading, changing a format,
  -- changing who sees what. Who and when are stamped HERE from the session,
  -- never taken from the browser, and nothing updates or deletes a line.
  CREATE TABLE IF NOT EXISTS activity_log (
    id BIGSERIAL PRIMARY KEY,
    at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id TEXT,
    user_name TEXT NOT NULL DEFAULT '',
    user_email TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    target TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT '',
    -- The department code of the document it concerns ('' when it concerns none).
    department TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS activity_log_at_idx ON activity_log (at DESC);
`;

/**
 * A pooled client for a transaction. A connection that drops while it is
 * checked out emits 'error' on the client, and with no listener that would
 * take the whole server down — so one is attached until the client goes back.
 */
async function withClient<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await database().connect();
  const onError = (err: Error) => console.error("[postgres client]", err.message);
  client.on("error", onError);
  try {
    return await work(client);
  } finally {
    client.removeListener("error", onError);
    client.release();
  }
}

async function transaction<T>(client: pg.PoolClient, work: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    const result = await work();
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }
}

/** The accounts and digest log of the earlier SQLite file, copied in once. */
async function importSqliteOnce(): Promise<void> {
  const file = path.join(dataDir, "app.db");
  // SQLITE_IMPORT=0: a throwaway database (the test runner's) never takes the real file.
  if (process.env.SQLITE_IMPORT === "0" || !existsSync(file)) return;
  const { rows } = await database().query<{ c: string }>("SELECT COUNT(*)::text AS c FROM users");
  if (Number(rows[0].c) > 0) return;
  const { DatabaseSync } = await import("node:sqlite");
  const sqlite = new DatabaseSync(file, { readOnly: true });
  let copied = 0;
  try {
    const hasDepartments = (sqlite.prepare("PRAGMA table_info(users)").all() as { name: string }[]).some((c) => c.name === "departments");
    const users = sqlite.prepare("SELECT * FROM users ORDER BY created_at").all() as unknown as UserRow[];
    const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'digest_log'").all();
    const log = tables.length > 0 ? (sqlite.prepare("SELECT last_sent_date FROM digest_log WHERE id = 1").get() as { last_sent_date: string | null } | undefined) : undefined;
    await withClient((client) =>
      transaction(client, async () => {
        for (const u of users) {
          await client.query(
            "INSERT INTO users (id, name, email, password_hash, role, created_at, departments) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING",
            [u.id, u.name, u.email, u.password_hash, u.role, u.created_at, hasDepartments ? (u.departments ?? "") : ""]
          );
        }
        if (log) await client.query("INSERT INTO digest_log (id, last_sent_date) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET last_sent_date = EXCLUDED.last_sent_date", [log.last_sent_date]);
      })
    );
    copied = users.length;
  } finally {
    sqlite.close();
  }
  console.log(`Copied ${copied} account${copied === 1 ? "" : "s"} from the old SQLite file into PostgreSQL.`);
  renameSync(file, `${file}.imported`);
}

/** Opens the database, creates what is missing, and brings in an old SQLite file's accounts. */
export async function openDatabase(): Promise<pg.Pool> {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL || (await embeddedDatabaseUrl());
  pool = new pg.Pool({ connectionString, max: Number(process.env.PG_POOL_MAX ?? 10) });
  pool.on("error", (err) => console.error("[postgres pool]", err.message));
  // The records are written in English and Gujarati, with dashes and arrows: a
  // database in a Windows or Latin-1 encoding would refuse them one save at a time.
  const encoding = await pool.query<{ encoding: string }>("SELECT pg_encoding_to_char(encoding) AS encoding FROM pg_database WHERE datname = current_database()");
  if (encoding.rows[0]?.encoding !== "UTF8") {
    const found = encoding.rows[0]?.encoding ?? "unknown";
    await closeDatabase();
    throw new Error(`The PostgreSQL database must use UTF8 encoding (it uses ${found}). Create it with: CREATE DATABASE <name> ENCODING 'UTF8' TEMPLATE template0;`);
  }
  await pool.query(SCHEMA);
  await importSqliteOnce();
  return pool;
}

/** Closes this server's connections. The database itself keeps running. */
export async function closeDatabase(): Promise<void> {
  await pool?.end();
  pool = null;
}

/** A connection-level failure: the database is down or unreachable, not a bad request. */
export function isDatabaseUnavailable(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code ?? "";
  return ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EPIPE", "57P01", "57P02", "57P03", "53300", "08000", "08001", "08003", "08004", "08006"].includes(code) ||
    /Connection terminated|connection timeout/i.test(err instanceof Error ? err.message : "");
}

// ---------------------------------------------------------------------------
// accounts

export async function getUserByEmail(email: string): Promise<UserRow | undefined> {
  const { rows } = await database().query<UserRow>("SELECT * FROM users WHERE email = $1", [email]);
  return rows[0];
}

export async function getUserById(id: string): Promise<UserRow | undefined> {
  const { rows } = await database().query<UserRow>("SELECT * FROM users WHERE id = $1", [id]);
  return rows[0];
}

export async function listUsers(): Promise<UserRow[]> {
  const { rows } = await database().query<UserRow>("SELECT * FROM users ORDER BY created_at");
  return rows;
}

/**
 * Adds an account. The first account ever is the administrator (and covers
 * every department), decided under a lock held for the insert — so two
 * signups racing on an empty database cannot both become admin. Returns null
 * when the email is taken.
 */
export async function insertUser(u: Omit<UserRow, "role" | "departments"> & { departments: string }): Promise<UserRow | null> {
  try {
    return await withClient((client) =>
      transaction(client, async () => {
        await client.query("SELECT pg_advisory_xact_lock(4711)");
        const { rows } = await client.query<UserRow>(
          `INSERT INTO users (id, name, email, password_hash, role, created_at, departments)
           SELECT $1, $2, $3, $4,
                  CASE WHEN EXISTS (SELECT 1 FROM users) THEN 'staff' ELSE 'admin' END,
                  $5,
                  CASE WHEN EXISTS (SELECT 1 FROM users) THEN $6 ELSE '' END
           RETURNING *`,
          [u.id, u.name, u.email, u.password_hash, u.created_at, u.departments]
        );
        return rows[0] ?? null;
      })
    );
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return null; // the email is taken
    throw err;
  }
}

/** Adds a named account with its role and departments as given, unless that email already has one. Returns true when it was added. */
export async function seedUser(u: UserRow): Promise<boolean> {
  const { rowCount } = await database().query(
    `INSERT INTO users (id, name, email, password_hash, role, created_at, departments)
     VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (email) DO NOTHING`,
    [u.id, u.name, u.email, u.password_hash, u.role, u.created_at, u.departments]
  );
  return (rowCount ?? 0) > 0;
}

export async function setUserPassword(id: string, passwordHash: string): Promise<void> {
  await database().query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, id]);
}

// ---------------------------------------------------------------------------
// the activity log

export interface ActivityLine {
  id: string;
  at: string;
  userId: string | null;
  userName: string;
  userEmail: string;
  action: string;
  target: string;
  detail: string;
  department: string;
}

export interface ActivityInput {
  userId: string | null;
  userName: string;
  userEmail: string;
  action: string;
  target?: string;
  detail?: string;
  department?: string;
  ip?: string;
}

export async function insertActivity(lines: ActivityInput[]): Promise<void> {
  for (const l of lines) {
    await database().query(
      `INSERT INTO activity_log (user_id, user_name, user_email, action, target, detail, department, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [l.userId, l.userName, l.userEmail, l.action, l.target ?? "", l.detail ?? "", l.department ?? "", l.ip ?? ""]
    );
  }
}

/** Newest first. `departments` null = every line; otherwise the person's own lines and their departments'. */
export async function listActivity(opts: { limit: number; before?: string; departments: string[] | null; userId: string; search?: string }): Promise<ActivityLine[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.before) {
    args.push(opts.before);
    where.push(`id < $${args.length}`);
  }
  if (opts.departments) {
    args.push(opts.userId, opts.departments);
    where.push(`(user_id = $${args.length - 1} OR department = ANY($${args.length}))`);
  }
  if (opts.search) {
    args.push(`%${opts.search.toLowerCase()}%`);
    where.push(`lower(user_name || ' ' || action || ' ' || target || ' ' || detail) LIKE $${args.length}`);
  }
  args.push(opts.limit);
  const { rows } = await database().query<{ id: string; at: Date; user_id: string | null; user_name: string; user_email: string; action: string; target: string; detail: string; department: string }>(
    `SELECT id::text, at, user_id, user_name, user_email, action, target, detail, department FROM activity_log
     ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT $${args.length}`,
    args
  );
  return rows.map((r) => ({ id: r.id, at: r.at.toISOString(), userId: r.user_id, userName: r.user_name, userEmail: r.user_email, action: r.action, target: r.target, detail: r.detail, department: r.department }));
}

export async function setUserDepartments(id: string, departments: string): Promise<UserRow | undefined> {
  const { rows } = await database().query<UserRow>("UPDATE users SET departments = $1 WHERE id = $2 RETURNING *", [departments, id]);
  return rows[0];
}

// ---------------------------------------------------------------------------
// the reminder digest log

export async function lastDigestDate(): Promise<string | null> {
  const { rows } = await database().query<{ last_sent_date: string | null }>("SELECT last_sent_date FROM digest_log WHERE id = 1");
  return rows[0]?.last_sent_date ?? null;
}

/** Claims `date` for today's digest; false when another request already has. */
export async function claimDigestDate(date: string): Promise<boolean> {
  const { rowCount } = await database().query(
    `INSERT INTO digest_log (id, last_sent_date) VALUES (1, $1)
     ON CONFLICT (id) DO UPDATE SET last_sent_date = EXCLUDED.last_sent_date
     WHERE digest_log.last_sent_date IS DISTINCT FROM EXCLUDED.last_sent_date`,
    [date]
  );
  return (rowCount ?? 0) > 0;
}

export async function setDigestDate(date: string | null): Promise<void> {
  await database().query(
    "INSERT INTO digest_log (id, last_sent_date) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET last_sent_date = EXCLUDED.last_sent_date",
    [date]
  );
}

// ---------------------------------------------------------------------------
// the app's data

export interface StoredItem {
  key: string;
  value: string;
  version: number;
  seq: number;
}

export interface StoredItems {
  /** The items written since `sinceSeq`. */
  items: (StoredItem & { scope: "company" | "user" })[];
  /** Where the next "what changed since" starts. */
  seq: number;
  /** The version of every item this person has, changed or not — a browser whose copy is newer than the database's knows the database was reset or restored. */
  versions: Record<string, number>;
}

/**
 * What a person's browser loads: the company's items and their own. One
 * statement, so the items, the versions and the cursor all come from the same
 * moment; and since writes take their seq in commit order (writeItem), no
 * write can later appear below a cursor already handed out.
 */
export async function storedItems(userId: string, sinceSeq = 0): Promise<StoredItems> {
  const { rows } = await database().query<{ scope: string; key: string; value: string | null; version: number; seq: string }>(
    `SELECT scope, key, CASE WHEN seq > $2 THEN value END AS value, version, seq::text AS seq
       FROM app_storage WHERE scope IN ('company', $1) ORDER BY seq`,
    [userId, sinceSeq]
  );
  const items: StoredItems["items"] = [];
  const versions: Record<string, number> = {};
  let seq = sinceSeq;
  for (const r of rows) {
    const s = Number(r.seq);
    seq = Math.max(seq, s);
    versions[r.key] = r.version;
    if (r.value !== null) items.push({ scope: r.scope === "company" ? "company" : "user", key: r.key, value: r.value, version: r.version, seq: s });
  }
  return { items, seq, versions };
}

export type WriteResult = { ok: true; version: number; seq: number } | { ok: false; current: StoredItem | null };

/**
 * Writes one item. `baseVersion` is the version the browser's copy was made
 * from (0 for an item it believes is new); when the stored item has moved on
 * since, nothing is written and the current item comes back to be merged.
 * `baseVersion` null writes regardless. `compose`, when given, builds the
 * value to store from the stored one (a department-scoped account's records
 * are laid over everyone else's — backend/index.ts).
 *
 * Every write holds one lock from taking its seq until it commits, so seqs
 * are committed in order and a browser asking "what changed since N" can
 * never miss a write that took a lower seq but committed later.
 */
export async function writeItem(
  scope: string,
  key: string,
  value: string,
  baseVersion: number | null,
  by: string,
  compose?: (stored: string | null) => string
): Promise<WriteResult> {
  return withClient((client) =>
    transaction(client, async () => {
      await client.query("SELECT pg_advisory_xact_lock(4712)");
      const found = await client.query<{ value: string; version: number; seq: string }>("SELECT value, version, seq::text AS seq FROM app_storage WHERE scope = $1 AND key = $2", [scope, key]);
      const row = found.rows[0];
      const current = row ? { key, value: row.value, version: row.version, seq: Number(row.seq) } : null;
      if (baseVersion !== null) {
        if (row ? row.version !== baseVersion : baseVersion !== 0) return { ok: false as const, current };
      }
      const toStore = compose ? compose(row ? row.value : null) : value;
      const written = await client.query<{ version: number; seq: string }>(
        `INSERT INTO app_storage (scope, key, value, version, seq, updated_at, updated_by)
         VALUES ($1, $2, $3, 1, nextval('app_storage_seq'), now(), $4)
         ON CONFLICT (scope, key) DO UPDATE
           SET value = EXCLUDED.value, version = app_storage.version + 1, seq = EXCLUDED.seq, updated_at = now(), updated_by = EXCLUDED.updated_by
         RETURNING version, seq::text AS seq`,
        [scope, key, toStore, by]
      );
      return { ok: true as const, version: written.rows[0].version, seq: Number(written.rows[0].seq) };
    })
  );
}

export async function readItem(scope: string, key: string): Promise<StoredItem | null> {
  const { rows } = await database().query<{ value: string; version: number; seq: string }>("SELECT value, version, seq::text AS seq FROM app_storage WHERE scope = $1 AND key = $2", [scope, key]);
  const row = rows[0];
  return row ? { key, value: row.value, version: row.version, seq: Number(row.seq) } : null;
}

export async function deleteItem(scope: string, key: string): Promise<void> {
  await database().query("DELETE FROM app_storage WHERE scope = $1 AND key = $2", [scope, key]);
}
