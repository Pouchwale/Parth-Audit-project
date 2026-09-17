// THE DATABASE: PostgreSQL, and nothing else (REQUIREMENTS §55).
//
// Every piece of data the system keeps lives here — the user accounts, the
// reminder digest log, and all of the app's own data: the records, the
// document definitions, master data, the HR Master Data sheet, reference
// edits, the deletions log (company-wide), and each person's settings and
// assistant conversations (their own). The browser holds only a working copy,
// loaded from here when a person signs in and written back as they work
// (frontend/src/data/storageAdapter.ts).
//
// Where the database is:
//   DATABASE_URL set    that PostgreSQL server — how a deployment runs
//   DATABASE_URL unset  a PostgreSQL server of the app's own, started on this
//                       machine from the embedded-postgres package (real
//                       PostgreSQL binaries, no installation), its data in
//                       backend/data/postgres — so `npm start` still needs
//                       nothing but Node.js
//
// An install that used the earlier SQLite file (backend/data/app.db) has its
// accounts and digest log copied into PostgreSQL the first time it starts
// against an empty database; the file is then renamed app.db.imported and is
// never read again.
import pg from "pg";
import crypto from "node:crypto";
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
let stopEmbedded: (() => Promise<void>) | null = null;

export function database(): pg.Pool {
  if (!pool) throw new Error("The database is not open yet.");
  return pool;
}

const EMBEDDED_DIR = path.join(dataDir, "postgres");
const EMBEDDED_PASSWORD_FILE = path.join(dataDir, "postgres-password");
const EMBEDDED_DB = "dcrs";

function embeddedPassword(): string {
  if (existsSync(EMBEDDED_PASSWORD_FILE)) return readFileSync(EMBEDDED_PASSWORD_FILE, "utf-8").trim();
  const password = crypto.randomBytes(24).toString("hex");
  writeFileSync(EMBEDDED_PASSWORD_FILE, password, { mode: 0o600 });
  return password;
}

async function canConnect(connectionString: string): Promise<boolean> {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    try {
      await client.end();
    } catch {
      /* not connected */
    }
    return false;
  }
}

/** The app's own PostgreSQL on this machine, started if it is not already running. */
async function embeddedDatabaseUrl(): Promise<string> {
  const port = Number(process.env.EMBEDDED_PG_PORT ?? 5433);
  const password = embeddedPassword();
  const url = (db: string) => `postgres://postgres:${password}@127.0.0.1:${port}/${db}`;
  // Already running — left over from a server that was stopped hard, or
  // shared with a second server on this machine.
  if (!(await canConnect(url("postgres")))) {
    const { default: EmbeddedPostgres } = await import("embedded-postgres");
    const server = new EmbeddedPostgres({
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
    if (!existsSync(path.join(EMBEDDED_DIR, "PG_VERSION"))) {
      console.log("Setting up the local PostgreSQL database (first start only)...");
      await server.initialise();
    }
    await server.start();
    stopEmbedded = () => server.stop();
    const stop = () => {
      void server.stop().finally(() => process.exit(0));
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  }
  const admin = new pg.Client({ connectionString: url("postgres") });
  await admin.connect();
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [EMBEDDED_DB]);
  if (exists.rowCount === 0) await admin.query(`CREATE DATABASE ${EMBEDDED_DB} ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'`);
  await admin.end();
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
  -- seq orders every write, so a browser can ask for what changed since.
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
`;

/** The accounts and digest log of the earlier SQLite file, copied in once. */
async function importSqliteOnce(db: pg.Pool): Promise<void> {
  const file = path.join(dataDir, "app.db");
  // SQLITE_IMPORT=0: a throwaway database (the test runner's) never takes the real file.
  if (process.env.SQLITE_IMPORT === "0" || !existsSync(file)) return;
  const { rows } = await db.query<{ c: string }>("SELECT COUNT(*)::text AS c FROM users");
  if (Number(rows[0].c) > 0) return;
  const { DatabaseSync } = await import("node:sqlite");
  const sqlite = new DatabaseSync(file, { readOnly: true });
  try {
    const hasDepartments = (sqlite.prepare("PRAGMA table_info(users)").all() as { name: string }[]).some((c) => c.name === "departments");
    const users = sqlite.prepare("SELECT * FROM users ORDER BY created_at").all() as unknown as UserRow[];
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      for (const u of users) {
        await client.query(
          "INSERT INTO users (id, name, email, password_hash, role, created_at, departments) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING",
          [u.id, u.name, u.email, u.password_hash, u.role, u.created_at, hasDepartments ? (u.departments ?? "") : ""]
        );
      }
      const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'digest_log'").all();
      if (tables.length > 0) {
        const log = sqlite.prepare("SELECT last_sent_date FROM digest_log WHERE id = 1").get() as { last_sent_date: string | null } | undefined;
        if (log) await client.query("INSERT INTO digest_log (id, last_sent_date) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET last_sent_date = EXCLUDED.last_sent_date", [log.last_sent_date]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    console.log(`Copied ${users.length} account${users.length === 1 ? "" : "s"} from the old SQLite file into PostgreSQL.`);
  } finally {
    sqlite.close();
  }
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
  await importSqliteOnce(pool);
  return pool;
}

export async function closeDatabase(): Promise<void> {
  await pool?.end();
  pool = null;
  if (stopEmbedded) await stopEmbedded();
  stopEmbedded = null;
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
  const client = await database().connect();
  try {
    await client.query("BEGIN");
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
    await client.query("COMMIT");
    return rows[0] ?? null;
  } catch (err) {
    await client.query("ROLLBACK");
    if ((err as { code?: string }).code === "23505") return null; // the email is taken
    throw err;
  } finally {
    client.release();
  }
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

/** Everything a person's browser loads: the company's items and their own. */
export async function storedItems(userId: string, sinceSeq = 0): Promise<{ items: (StoredItem & { scope: "company" | "user" })[]; seq: number }> {
  const { rows } = await database().query<{ scope: string; key: string; value: string; version: number; seq: string }>(
    "SELECT scope, key, value, version, seq::text AS seq FROM app_storage WHERE scope IN ('company', $1) AND seq > $2 ORDER BY seq",
    [userId, sinceSeq]
  );
  const top = await database().query<{ seq: string }>("SELECT COALESCE(MAX(seq), 0)::text AS seq FROM app_storage WHERE scope IN ('company', $1)", [userId]);
  return {
    items: rows.map((r) => ({ scope: r.scope === "company" ? "company" : "user", key: r.key, value: r.value, version: r.version, seq: Number(r.seq) })),
    seq: Math.max(sinceSeq, Number(top.rows[0].seq)),
  };
}

export type WriteResult = { ok: true; version: number; seq: number } | { ok: false; current: StoredItem | null };

/**
 * Writes one item. `baseVersion` is the version the browser's copy was made
 * from (0 for an item it believes is new); when the stored item has moved on
 * since, nothing is written and the current item comes back to be merged.
 * `baseVersion` null writes regardless.
 */
export async function writeItem(scope: string, key: string, value: string, baseVersion: number | null, by: string): Promise<WriteResult> {
  const { rows } = await database().query<{ version: number; seq: string }>(
    `INSERT INTO app_storage (scope, key, value, version, seq, updated_at, updated_by)
     SELECT $1, $2, $3, 1, nextval('app_storage_seq'), now(), $4
     WHERE $5::int IS NULL OR $5::int = 0 OR EXISTS (SELECT 1 FROM app_storage WHERE scope = $1 AND key = $2)
     ON CONFLICT (scope, key) DO UPDATE
       SET value = EXCLUDED.value, version = app_storage.version + 1, seq = nextval('app_storage_seq'), updated_at = now(), updated_by = EXCLUDED.updated_by
       WHERE $5::int IS NULL OR app_storage.version = $5::int
     RETURNING version, seq::text AS seq`,
    [scope, key, value, by, baseVersion]
  );
  if (rows[0]) return { ok: true, version: rows[0].version, seq: Number(rows[0].seq) };
  const current = await database().query<{ key: string; value: string; version: number; seq: string }>(
    "SELECT key, value, version, seq::text AS seq FROM app_storage WHERE scope = $1 AND key = $2",
    [scope, key]
  );
  const row = current.rows[0];
  return { ok: false, current: row ? { key: row.key, value: row.value, version: row.version, seq: Number(row.seq) } : null };
}

export async function deleteItem(scope: string, key: string): Promise<void> {
  await database().query("DELETE FROM app_storage WHERE scope = $1 AND key = $2", [scope, key]);
}
