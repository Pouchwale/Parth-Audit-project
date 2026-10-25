// THE DATABASE: PostgreSQL, and nothing else (REQUIREMENTS §55).
//
// Every piece of data the system keeps lives here — the user accounts, the
// reminder emails' tables (backend/emailContacts.ts), and all of the app's own data: the records, the
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
//                       process of its own, not a child of this server, in
//                       the background WITH NO WINDOW (see pgCtl below): it
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
import { FORMER_SEPARATOR, RELEASED_MARK, releasedFrom, releasedSignIn } from "../frontend/src/engine/accountNames.ts";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: "admin" | "staff";
  created_at: string;
  /** Comma-separated department codes; "" = every department. */
  departments: string;
  /** The administrator set this password: the person chooses their own before they can work (REQUIREMENTS §66). */
  must_change_password: boolean;
  /** False for somebody who has left — they cannot sign in, and nothing of theirs is deleted. */
  active: boolean;
  /** When they last signed in, ISO; null until they have. */
  last_sign_in: string | null;
  /** When the super admin removed the account (REQUIREMENTS §110), ISO; null (or absent) while it is on the plant's list. */
  removed_at?: string | null;
  /** The super admin who removed it (an account id). */
  removed_by?: string | null;
  /** Whether it was switched on when it was removed: "Bring back" gives it back as it was. */
  active_before_removal?: boolean | null;
  /** The sign-ins it had before it was renamed, one a line (§110): never made again by the seeding. */
  former_emails?: string;
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

// Runs pg_ctl so that the database it starts outlives this server AND HAS NO WINDOW.
//
// On Windows `detached: true` was what opened a black console window beside
// `npm run dev` — one that had to stay open, because closing it killed the
// database. A detached process is given no console at all, so the postgres.exe
// that pg_ctl launches (through cmd.exe) made a new, visible one of its own, and
// `windowsHide` cannot help: Windows ignores it on a detached process. Without
// `detached`, and with nothing inherited, pg_ctl gets a hidden console and the
// server inherits that — no window, and not the terminal's console either, so
// Ctrl+C on `npm run dev` does not reach the database. It still outlives this
// server: only pg_ctl itself is tied to this process, and it has exited by the
// time the database is up. (Measured both ways on a throwaway cluster, 19-Sep-2026.)
//
// Elsewhere there is no console to open, and `detached` is what keeps the
// terminal's Ctrl+C away from the database, so it stays.
async function pgCtl(args: string[]): Promise<number> {
  const bin = await pgCtlPath();
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { detached: process.platform !== "win32", stdio: "ignore", windowsHide: true });
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
    console.log(`Local PostgreSQL started in the background on port ${port} - no window, nothing to keep open. (npm run db:stop stops it.)`);
  } else {
    console.log(`Local PostgreSQL is already running in the background on port ${port}.`);
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

  -- ACCOUNTS THE ADMINISTRATOR MAKES (REQUIREMENTS §66). Added to a table that
  -- is already in use, so both have a default that leaves every existing row
  -- exactly as it was: the accounts the plant signs in with today are not asked
  -- to change their password, and none of them is switched off.
  --   must_change_password  given a password by the administrator, so the person
  --                         chooses their own before they can do anything.
  --   active                false for somebody who has left: they cannot sign in
  --                         and their session stops at its next request. NOTHING
  --                         is ever deleted — their name stays on what they signed.
  ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS last_sign_in TEXT;

  -- REMOVED ACCOUNTS, AND THE SIGN-INS AN ACCOUNT HAD (REQUIREMENTS §110). Added to a table already in use with
  -- nothing in them for the rows already there, so every account stays exactly as it was: nobody is removed and
  -- nobody renamed by the change itself.
  --   removed_at             when the super admin removed it (ISO); null while it is on the plant's list. A removed
  --                          account is switched off as well and its sessions ended. NOTHING is deleted: its name
  --                          stays on every record, history line and line of the activity log it wrote.
  --   removed_by             the super admin who removed it (an account id).
  --   active_before_removal  whether it was switched on when it was removed, so "Bring back" gives it back as it was.
  --   former_emails          the sign-ins it had before it was renamed, one a line: the seeding and "Create the
  --                          missing accounts" never make an account for one of them again.
  -- An account whose sign-in was given to another (a rename's "replace it") keeps a sign-in nobody types: its own
  -- with "#removed-" and its id after it (frontend/src/engine/accountNames.ts releasedSignIn).
  ALTER TABLE users ADD COLUMN IF NOT EXISTS removed_at TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS removed_by TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS active_before_removal BOOLEAN;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS former_emails TEXT NOT NULL DEFAULT '';

  -- Single row (id is always 1): the last date the browser's reminder digest
  -- email went out. RETIRED on 25-Oct-2026: the server's own reminder emails
  -- (backend/emailReminders.ts, email_log) replaced the digest a browser asked
  -- for, and nothing writes this table any more. Kept, as every table is: a
  -- plant's database still has it, and nothing is deleted.
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
  -- ONE PERSON, AND ONE DEPARTMENT, OVER A SPAN (REQUIREMENTS §73). The
  -- scorecard asks "what did this person do this month", and an account kept
  -- to its departments reads "my lines OR my departments' lines". Without these
  -- two, both are answered by walking the whole log backwards; with them, by
  -- reading only the lines asked for — at a million lines, 29 ms became 3 ms
  -- for one person's month and 252 ms became 0.3 ms for a department whose few
  -- lines are old. at_idx above still serves the plain day/month/year spans.
  CREATE INDEX IF NOT EXISTS activity_log_user_at_idx ON activity_log (user_id, at);
  CREATE INDEX IF NOT EXISTS activity_log_department_at_idx ON activity_log (department, at);
  -- A LINE SENT TWICE IS WRITTEN ONCE (REQUIREMENTS §62, §75). The browser
  -- gives each line a random id of its own (a UUID) the moment the line is
  -- queued, and keeps it however many times the line is sent. When the answer
  -- to a send is lost after the lines were already written — the connection
  -- dropped just after COMMIT — the browser sends the batch again, and this
  -- index is what makes that second send write nothing new (insertActivity:
  -- ON CONFLICT on this index, DO NOTHING). NULL for every line written before this, for a
  -- browser too old to make an id, and for the server's own lines (signing in,
  -- the jobs), which are never sent twice — and a unique index never compares
  -- NULLs, so those lines are written exactly as before. Added to a table
  -- already in use, with no default: no existing line is touched (the table
  -- refuses an UPDATE anyway, activityArchive.ts). Never handed out by a read.
  ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS client_id TEXT;
  CREATE UNIQUE INDEX IF NOT EXISTS activity_log_client_id_idx ON activity_log (client_id) WHERE client_id IS NOT NULL;

  -- WHO IS SIGNED IN WHERE (REQUIREMENTS §106): one row per session, keyed by
  -- the id its token carries (backend/auth.ts \`sid\`), so that a sign-out, the
  -- super admin's "Sign out this device" and a device signing in again END a
  -- session, which a signed token alone could not. backend/deviceSessions.ts
  -- reads and writes it. A session is open while ended_at is null and ends_at
  -- (the close of its day, §84) is still to come. Nothing deletes a row: an
  -- ended one says when, why and by whom.
  --   device_id        the device's own id: the browser's (frontend/src/utils/
  --                    deviceId.ts) or the phone's; '' when none was sent
  --   device_name      the device in words: "Windows computer - Chrome"
  --   device_category  computer, mobile or tablet
  --   place            website, phone-app or api (another program)
  --   device_client    the browser or the app: "Chrome 141", "Mitra app 1.1.0"
  --   device_system    "Windows", "Android 14", "iOS 18.1"
  --   ended_why        signed-out, super-admin, replaced, account-off (switched off or removed, §110) or
  --                    renamed (its sign-in changed by the super admin, §110)
  --   ended_by         the account that ended it: the person, or the super admin
  CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL DEFAULT '',
    device_name TEXT NOT NULL DEFAULT '',
    device_category TEXT NOT NULL DEFAULT 'computer',
    place TEXT NOT NULL DEFAULT 'website',
    device_client TEXT NOT NULL DEFAULT '',
    device_system TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    signed_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    ended_why TEXT,
    ended_by TEXT
  );
  CREATE INDEX IF NOT EXISTS user_sessions_open_idx ON user_sessions (user_id, ends_at) WHERE ended_at IS NULL;
`;

// THE WORDS A SEARCH OF THE ACTIVITY LOG LOOKS IN (REQUIREMENTS §62, §73):
// who, what, on what, and the detail, lower-cased. Written ONCE, here, because
// two things must agree on it to the character: the search itself
// (activityWhere) and the trigram index that makes it fast
// (ensureActivitySearchIndex), and the archive's own (activityArchive.ts).
// PostgreSQL uses an expression index only when the query spells exactly the
// same expression, so a later edit to one copy and not the other would not
// fail — it would silently go back to reading every line.
export const ACTIVITY_SEARCH_TEXT = "lower(user_name || ' ' || action || ' ' || target || ' ' || detail)";

// Held while this server brings the tables up to date, so two servers starting
// against one database (the test runner starts a second) do not race each
// other on the same CREATE. 4711 and 4712 are taken (insertUser, writeItem);
// 4714 heads the two-part lock of one account's sign-in (deviceSessions.ts).
const SCHEMA_LOCK = 4713;

// TABLES KEPT BY THE MODULE THAT USES THEM (REQUIREMENTS §75). A module with
// tables of its own — backend/escalation.ts: job_runs, escalations and
// weekly_digests — hands its CREATE ... IF NOT EXISTS here when it is loaded,
// and it is run just after SCHEMA, under the same lock, every time the
// database is opened. Same database, same idempotent DDL; only kept beside
// the code that reads it.
const MORE_SCHEMA: string[] = [];
export function registerSchema(ddl: string): void {
  MORE_SCHEMA.push(ddl);
}

/**
 * THE SEARCH INDEX, A STEP OF ITS OWN (REQUIREMENTS §75). A trigram index
 * answers "any line that mentions F/QC/13" without reading every line — at a
 * million lines a search that finds nothing went from 2.2 s to under 1 ms —
 * and it keeps the search exactly what it was: a match anywhere in the words,
 * so a format number with slashes in it is still found.
 *
 * It needs the pg_trgm extension, and CREATE EXTENSION is not a right every
 * database account has (a hosted PostgreSQL may refuse it). That is why this
 * is NOT part of SCHEMA: SCHEMA failing stops the server, and a server that
 * cannot have the index must still start — the search then works as before,
 * only unindexed. One line in the console says so.
 */
async function ensureActivitySearchIndex(client: pg.PoolClient): Promise<void> {
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    await client.query(`CREATE INDEX IF NOT EXISTS activity_log_search_trgm_idx ON activity_log USING gin (${ACTIVITY_SEARCH_TEXT} gin_trgm_ops)`);
  } catch (err) {
    console.warn(`[postgres] The activity log's search index was not made (${err instanceof Error ? err.message : String(err)}); searching still works, only more slowly on a long log.`);
  }
}

// THE PLANT'S OWN CLOCK FOR "TODAY" (REQUIREMENTS §73). A day, a month and a
// person's active days are counted in PostgreSQL by casting a moment to a
// date, and that cast uses the connection's time zone. The app's own database
// takes India's from the machine, but a hosted server usually runs in UTC — and
// there, everything done before 05:30 would be counted on the day before.
// Every connection is therefore set to the plant's zone (openDatabase, as each
// connection is made); PLANT_TIMEZONE is for a plant somewhere else. Only a
// plain zone name is accepted; anything else falls back to India's, and the
// same name is what the jobs, the archive and the assistant date their days by.
// Read when the database is opened, not when this file is loaded, so a value
// from backend/.env is seen whichever file happens to import this one first.
const TIME_ZONE_RE = /^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/;
export function plantTimeZone(): string {
  const zone = process.env.PLANT_TIMEZONE?.trim() ?? "";
  return TIME_ZONE_RE.test(zone) ? zone : "Asia/Kolkata";
}

/**
 * A pooled client for a transaction. A connection that drops while it is
 * checked out emits 'error' on the client, and with no listener that would
 * take the whole server down — so one is attached until the client goes back.
 */
export async function withClient<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
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

export async function transaction<T>(client: pg.PoolClient, work: () => Promise<T>): Promise<T> {
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
  const zone = plantTimeZone();
  pool = new pg.Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX ?? 10),
    // THE PLANT'S ZONE ON EVERY CONNECTION, WHATEVER ELSE IT WAS STARTED WITH
    // (REQUIREMENTS §73). It used to go in the start-up `options`, and there it
    // could be lost without a word: a DATABASE_URL carrying its own ?options=
    // (a hosted PostgreSQL's search_path, say) replaced it — every day then
    // counted in the server's zone — and it replaced a PGOPTIONS the host had
    // set. So it is set here instead, as each new connection is made, before
    // the pool hands the connection to anybody (pg-pool awaits this hook), and
    // the URL's and PGOPTIONS' own options are left exactly as they were. A
    // zone PostgreSQL does not know fails the connection, as it did before, so
    // the server stops at start-up instead of counting days in the wrong zone.
    // (Measured both ways on a throwaway cluster, 24-Sep-2026.)
    onConnect: (client) => client.query("SELECT set_config('TimeZone', $1, false)", [zone]),
  });
  pool.on("error", (err) => console.error("[postgres pool]", err.message));
  // The records are written in English and Gujarati, with dashes and arrows: a
  // database in a Windows or Latin-1 encoding would refuse them one save at a time.
  const encoding = await pool.query<{ encoding: string }>("SELECT pg_encoding_to_char(encoding) AS encoding FROM pg_database WHERE datname = current_database()");
  if (encoding.rows[0]?.encoding !== "UTF8") {
    const found = encoding.rows[0]?.encoding ?? "unknown";
    await closeDatabase();
    throw new Error(`The PostgreSQL database must use UTF8 encoding (it uses ${found}). Create it with: CREATE DATABASE <name> ENCODING 'UTF8' TEMPLATE template0;`);
  }
  // SCHEMA and the search index under one lock, on one connection; the lock
  // goes with the connection if it drops, so it can never be left held.
  await withClient(async (client) => {
    await client.query("SELECT pg_advisory_lock($1)", [SCHEMA_LOCK]);
    try {
      await client.query(SCHEMA);
      for (const ddl of MORE_SCHEMA) await client.query(ddl);
      await ensureActivitySearchIndex(client);
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [SCHEMA_LOCK]).catch(() => {});
    }
  });
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

/**
 * THE PLANT'S ACCOUNTS: every one but those the super admin removed (REQUIREMENTS §110), which are left out of every
 * list of people, the notifications, the reminders, the escalation and the minus score. listAllUsers for those too.
 */
export async function listUsers(): Promise<UserRow[]> {
  const { rows } = await database().query<UserRow>("SELECT * FROM users WHERE removed_at IS NULL ORDER BY created_at");
  return rows;
}

/** Every account, the removed ones too (Users & Access's "Show removed accounts", the start-up's password settling). */
export async function listAllUsers(): Promise<UserRow[]> {
  const { rows } = await database().query<UserRow>("SELECT * FROM users ORDER BY created_at");
  return rows;
}

/**
 * Adds an account. The first account ever is the administrator (and covers
 * every department), decided under a lock held for the insert — so two
 * signups racing on an empty database cannot both become admin. Returns null
 * when the email is taken.
 */
export async function insertUser(u: Omit<UserRow, "role" | "departments" | "must_change_password" | "active" | "last_sign_in"> & { departments: string }): Promise<UserRow | null> {
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

/**
 * Adds a named account with its role and departments as given, unless an account has that sign-in, gave it up to
 * another (a rename's "replace it"), or had it before it was renamed (REQUIREMENTS §110): an account the super admin
 * removed or renamed is never made again. Returns true when it was added.
 */
export async function seedUser(u: UserRow): Promise<boolean> {
  const { rowCount } = await database().query(
    `INSERT INTO users (id, name, email, password_hash, role, created_at, departments, must_change_password)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8
      WHERE NOT EXISTS (SELECT 1 FROM users WHERE split_part(email, $9, 1) = $3 OR $3 = ANY(string_to_array(former_emails, $10)))
     ON CONFLICT (email) DO NOTHING`,
    [u.id, u.name, u.email, u.password_hash, u.role, u.created_at, u.departments, u.must_change_password, RELEASED_MARK, FORMER_SEPARATOR]
  );
  return (rowCount ?? 0) > 0;
}

/**
 * An account the administrator makes (REQUIREMENTS §66): never an administrator
 * itself — there is one, and it is the seeded super admin — and always on a
 * password of the administrator's choosing, so the person must choose their own.
 * Returns null when the email is taken.
 */
export async function createStaffUser(u: {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  created_at: string;
  departments: string;
}): Promise<UserRow | null> {
  try {
    const { rows } = await database().query<UserRow>(
      `INSERT INTO users (id, name, email, password_hash, role, created_at, departments, must_change_password)
       VALUES ($1, $2, $3, $4, 'staff', $5, $6, false) RETURNING *`,
      [u.id, u.name, u.email, u.password_hash, u.created_at, u.departments]
    );
    return rows[0] ?? null;
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return null; // the email is taken
    throw err;
  }
}

/** The password, and whether its owner must now choose one of their own (REQUIREMENTS §66). */
export async function setUserPassword(id: string, passwordHash: string, mustChange = false): Promise<void> {
  await database().query("UPDATE users SET password_hash = $1, must_change_password = $2 WHERE id = $3", [passwordHash, mustChange, id]);
}

/**
 * Switches an account on or off. Returns the row as it now stands, or undefined when there is no such account. A
 * removed account (REQUIREMENTS §110) is left as it is: it is brought back, not switched on (the route says so).
 */
export async function setUserActive(id: string, active: boolean): Promise<UserRow | undefined> {
  const { rows } = await database().query<UserRow>("UPDATE users SET active = CASE WHEN removed_at IS NULL THEN $1 ELSE active END WHERE id = $2 RETURNING *", [active, id]);
  return rows[0];
}

/**
 * MAKES AN ACCOUNT THE SUPER ADMIN, OR STAFF (REQUIREMENTS §96). On 8-Oct-2026 the owner's own account was stuck as
 * staff, refused on the weekly off again and again, and no screen could make it the super admin. Switched on as well,
 * and a super admin covers every department (none are kept). Never the plant's last active super admin to staff:
 * decided under the lock the first sign-up takes (insertUser), so two changes at once cannot both leave nobody.
 * Returns null when there is no such account.
 */
export async function setUserRole(id: string, role: "admin" | "staff"): Promise<{ row: UserRow; before: UserRow } | { refused: "last-super-admin" | "removed" } | null> {
  return withClient((client) =>
    transaction(client, async () => {
      await client.query("SELECT pg_advisory_xact_lock(4711)");
      const found = await client.query<UserRow>("SELECT * FROM users WHERE id = $1", [id]);
      const before = found.rows[0];
      if (!before) return null;
      // A removed account (REQUIREMENTS §110) is brought back first: this would switch it on.
      if (before.removed_at) return { refused: "removed" as const };
      if (role === "staff" && before.role === "admin") {
        const others = await client.query("SELECT 1 FROM users WHERE role = 'admin' AND active AND removed_at IS NULL AND id <> $1 LIMIT 1", [id]);
        if ((others.rowCount ?? 0) === 0) return { refused: "last-super-admin" as const };
      }
      const { rows } = await client.query<UserRow>(
        "UPDATE users SET role = $2::text, active = true, departments = CASE WHEN $2::text = 'admin' THEN '' ELSE departments END WHERE id = $1 RETURNING *",
        [id, role]
      );
      return { row: rows[0], before };
    })
  );
}

/** Stamped at every sign-in, so the administrator can see who has never used their account. */
export async function markSignedIn(id: string, atISO: string): Promise<void> {
  await database().query("UPDATE users SET last_sign_in = $1 WHERE id = $2", [atISO, id]);
}

// ---------------------------------------------------------------------------
// renaming and removing accounts (REQUIREMENTS §110; the routes are backend/accountRoutes.ts)
//
// Each change is ONE transaction: the accounts' lock (insertUser's, 4711) and then the lock every write of app_storage
// takes (writeItem's, 4712), always in that order, so nothing else changes an account or the stored items meanwhile;
// the users rows and the access rules ("access": who fills what moves with a renamed account, a removed account is
// listed there as removed) are written together or not at all.

/** The sign-ins an account had before it was renamed (§110), one a line (accountNames.ts FORMER_SEPARATOR). */
export function formerSignIns(u: Pick<UserRow, "former_emails">): string[] {
  return String(u.former_emails ?? "")
    .split(FORMER_SEPARATOR)
    .map((e) => e.trim())
    .filter(Boolean);
}

/** The two stored items the access rules are worked out from, as they are inside the change's transaction. */
export interface AccessItemsNow {
  /** The access rules ("access"), as stored; null when none are. */
  access: string | null;
  /** The plant's catalogue ("documents"), as stored; null when none is. */
  documents: string | null;
}

/** What an account has done that makes it more than an empty account (§110): any one of them, and it is used. */
export interface AccountUse {
  /** It has signed in (users.last_sign_in). */
  signedIn: boolean;
  /** It has a session on record, open or ended (user_sessions, §106). */
  sessions: boolean;
  /** A line of its own in the activity log or its archive, beyond a failed or refused sign-in (which anybody causes by typing its address). */
  lines: boolean;
  /** Items of its own in app_storage: its settings, its conversations with Mitra. */
  ownData: boolean;
}

/** Never used: never signed in, never a session, nothing of its own in the log or the storage. Its work is known by its id; a name on a record may be another account's of the same name. */
export const unusedAccount = (u: AccountUse): boolean => !u.signedIn && !u.sessions && !u.lines && !u.ownData;

/** The lines a stranger causes by typing an address at the sign-in: not the account's own doing. */
const DOOR_LINES = ["Sign-in failed", "Sign-in refused"];

type Queryable = pg.Pool | pg.PoolClient;

async function accountUseOn(q: Queryable, id: string): Promise<AccountUse> {
  const { rows } = await q.query<{ signed_in: boolean | null; sessions: boolean; lines: boolean; own_data: boolean; archive: boolean }>(
    `SELECT (SELECT last_sign_in IS NOT NULL FROM users WHERE id = $1) AS signed_in,
            EXISTS (SELECT 1 FROM user_sessions WHERE user_id = $1) AS sessions,
            EXISTS (SELECT 1 FROM activity_log WHERE user_id = $1 AND action <> ALL($2::text[])) AS lines,
            EXISTS (SELECT 1 FROM app_storage WHERE scope = $1) AS own_data,
            to_regclass('activity_log_archive') IS NOT NULL AS archive`,
    [id, DOOR_LINES]
  );
  const r = rows[0];
  let lines = !!r?.lines;
  if (!lines && r?.archive) {
    const a = await q.query<{ found: boolean }>("SELECT EXISTS (SELECT 1 FROM activity_log_archive WHERE user_id = $1 AND action <> ALL($2::text[])) AS found", [id, DOOR_LINES]);
    lines = !!a.rows[0]?.found;
  }
  return { signedIn: !!r?.signed_in, sessions: !!r?.sessions, lines, ownData: !!r?.own_data };
}

/** What an account has done (§110). */
export async function accountUse(id: string): Promise<AccountUse> {
  return accountUseOn(database(), id);
}

async function lockAccounts(client: pg.PoolClient): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(4711)");
  await client.query("SELECT pg_advisory_xact_lock(4712)");
}

/** Whether the plant still has a super admin who can sign in once these accounts are gone. */
async function anotherSuperAdmin(client: pg.PoolClient, leaving: readonly string[]): Promise<boolean> {
  const { rowCount } = await client.query("SELECT 1 FROM users WHERE role = 'admin' AND active AND removed_at IS NULL AND NOT (id = ANY($1::text[])) LIMIT 1", [leaving]);
  return (rowCount ?? 0) > 0;
}

/**
 * One item written inside a transaction the caller already holds (with the storage lock, lockAccounts): the same
 * row writeItem writes, its version one up, its seq the next. The change journal that once wrapped this is withdrawn
 * (REQUIREMENTS §108 part 2), so the item is written plainly.
 */
async function upsertItem(client: pg.PoolClient, scope: string, key: string, value: string, by: string): Promise<void> {
  await client.query(
    `INSERT INTO app_storage (scope, key, value, version, seq, updated_at, updated_by)
     VALUES ($1, $2, $3, 1, nextval('app_storage_seq'), now(), $4)
     ON CONFLICT (scope, key) DO UPDATE
       SET value = EXCLUDED.value, version = app_storage.version + 1, seq = EXCLUDED.seq, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [scope, key, value, by]
  );
}

/** The access rules rewritten in the change's own transaction: `compose` answers the new value, or null to leave them. */
async function writeAccessIn(client: pg.PoolClient, by: string, compose: (now: AccessItemsNow) => string | null): Promise<boolean> {
  const { rows } = await client.query<{ key: string; value: string }>("SELECT key, value FROM app_storage WHERE scope = 'company' AND key = ANY($1::text[])", [["access", "documents"]]);
  const access = rows.find((r) => r.key === "access")?.value ?? null;
  const next = compose({ access, documents: rows.find((r) => r.key === "documents")?.value ?? null });
  if (next === null || next === access) return false;
  await upsertItem(client, "company", "access", next, by);
  return true;
}

/** Removes accounts inside a transaction already holding the locks: stamped, switched off, what each was kept. */
async function removeIn(client: pg.PoolClient, ids: readonly string[], byId: string, at: string): Promise<UserRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await client.query<UserRow>(
    `UPDATE users SET removed_at = $2, removed_by = $3, active_before_removal = active, active = false
      WHERE id = ANY($1::text[]) AND removed_at IS NULL RETURNING *`,
    [ids, at, byId]
  );
  return rows;
}

/** Who changes an account: the super admin's id (users.removed_by) and sign-in (app_storage.updated_by). */
export interface AccountChanger {
  id: string;
  email: string;
}

export type RenameOutcome =
  | { kind: "renamed"; before: UserRow; row: UserRow; replaced: UserRow | null; replacedBefore: UserRow | null }
  | { kind: "not-found" }
  | { kind: "removed"; row: UserRow }
  | { kind: "unchanged"; row: UserRow }
  /** The sign-in is another account's: `unused` when that one has never been used, and could be replaced. */
  | { kind: "held"; row: UserRow; holder: UserRow; unused: boolean }
  | { kind: "last-super-admin"; row: UserRow; holder: UserRow };

/** The rename the access rules are told of: the old and the new sign-in, and a replaced account's sign-in as it is now. */
export interface RenameChange {
  from: string;
  to: string;
  /** The given-up sign-in of the account replaced, or null when none was. */
  released: string | null;
}

/**
 * RENAMES AN ACCOUNT (§110): its name and its sign-in. A sign-in another account holds is refused (`held`), unless that
 * account has never been used and `replace` is said: then it is removed, its sign-in given up (releasedSignIn), and the
 * renamed account takes the sign-in, in one step. Never leaves the plant without a super admin who can sign in. The
 * old sign-in is kept in former_emails. `compose` rewrites the access rules in the same transaction.
 */
export async function renameAccount(input: {
  id: string;
  name: string;
  email: string;
  replace: boolean;
  by: AccountChanger;
  at: string;
  compose: (now: AccessItemsNow, change: RenameChange) => string | null;
}): Promise<RenameOutcome> {
  const tryOnce = (): Promise<RenameOutcome> =>
    withClient((client) =>
      transaction(client, async (): Promise<RenameOutcome> => {
        await lockAccounts(client);
        const found = await client.query<UserRow>("SELECT * FROM users WHERE id = $1", [input.id]);
        const before = found.rows[0];
        if (!before) return { kind: "not-found" };
        if (before.removed_at) return { kind: "removed", row: before };
        if (before.email === input.email && before.name === input.name) return { kind: "unchanged", row: before };
        let holder: UserRow | null = null;
        let replaced: UserRow | null = null;
        if (before.email !== input.email) {
          holder = (await client.query<UserRow>("SELECT * FROM users WHERE email = $1", [input.email])).rows[0] ?? null;
          if (holder) {
            const unused = unusedAccount(await accountUseOn(client, holder.id));
            if (!input.replace || !unused) return { kind: "held", row: before, holder, unused };
            if (holder.role === "admin" && holder.active && !holder.removed_at && !(await anotherSuperAdmin(client, [holder.id]))) return { kind: "last-super-admin", row: before, holder };
            // The unused account is removed (if it was not already) and gives its sign-in up.
            const released = await client.query<UserRow>(
              `UPDATE users SET email = $2,
                      removed_by = CASE WHEN removed_at IS NULL THEN $4 ELSE removed_by END,
                      active_before_removal = CASE WHEN removed_at IS NULL THEN active ELSE active_before_removal END,
                      removed_at = COALESCE(removed_at, $3), active = false
                WHERE id = $1 RETURNING *`,
              [holder.id, releasedSignIn(holder.email, holder.id), input.at, input.by.id]
            );
            replaced = released.rows[0];
          }
        }
        const formers = formerSignIns(before);
        if (before.email !== input.email && !formers.includes(before.email)) formers.push(before.email);
        const updated = await client.query<UserRow>("UPDATE users SET name = $2, email = $3, former_emails = $4 WHERE id = $1 RETURNING *", [input.id, input.name, input.email, formers.join(FORMER_SEPARATOR)]);
        const row = updated.rows[0];
        await writeAccessIn(client, input.by.email, (now) => input.compose(now, { from: before.email, to: input.email, released: replaced?.email ?? null }));
        return { kind: "renamed", before, row, replaced, replacedBefore: holder && replaced ? holder : null };
      })
    );
  try {
    return await tryOnce();
  } catch (err) {
    // An account made with the sign-in at that very moment (the users table keeps each sign-in once): asked again, it is held.
    if ((err as { code?: string }).code === "23505") return tryOnce();
    throw err;
  }
}

export type RemoveOutcome =
  | { kind: "removed"; rows: UserRow[]; already: UserRow[] }
  | { kind: "not-found"; ids: string[] }
  | { kind: "own-account" }
  | { kind: "last-super-admin"; row: UserRow }
  /** "Keep only these": the accounts that would go now are not the ones the page showed. */
  | { kind: "list-changed"; remove: UserRow[] };

/**
 * REMOVES ACCOUNTS (§110): each stamped removed, switched off, what it was kept for "Bring back"; never the super
 * admin's own, never so that no super admin who can sign in is left. Nothing of theirs is deleted. With `keep`
 * ("Keep only these"): every account on the list but those and the super admin's own, and only when that is exactly
 * `ids`, the list the page showed (`list-changed` with the list now, otherwise). `compose` lists them as removed in the
 * access rules, in the same transaction.
 */
export async function removeAccounts(input: {
  ids: readonly string[];
  keep?: readonly string[];
  by: AccountChanger;
  at: string;
  compose: (now: AccessItemsNow, removedEmails: string[]) => string | null;
}): Promise<RemoveOutcome> {
  return withClient((client) =>
    transaction(client, async (): Promise<RemoveOutcome> => {
      await lockAccounts(client);
      let targets: UserRow[];
      if (input.keep) {
        const kept = new Set([...input.keep, input.by.id]);
        const listed = (await client.query<UserRow>("SELECT * FROM users WHERE removed_at IS NULL ORDER BY created_at")).rows;
        targets = listed.filter((u) => !kept.has(u.id));
        const asked = new Set(input.ids);
        if (targets.length !== asked.size || targets.some((u) => !asked.has(u.id))) return { kind: "list-changed", remove: targets };
      } else {
        targets = (await client.query<UserRow>("SELECT * FROM users WHERE id = ANY($1::text[])", [input.ids])).rows;
        const known = new Set(targets.map((u) => u.id));
        const missing = input.ids.filter((id) => !known.has(id));
        if (missing.length > 0) return { kind: "not-found", ids: missing };
      }
      if (targets.some((u) => u.id === input.by.id)) return { kind: "own-account" };
      const going = targets.filter((u) => !u.removed_at);
      const already = targets.filter((u) => !!u.removed_at);
      const boss = going.find((u) => u.role === "admin" && u.active);
      if (boss && !(await anotherSuperAdmin(client, going.map((u) => u.id)))) return { kind: "last-super-admin", row: boss };
      const rows = await removeIn(
        client,
        going.map((u) => u.id),
        input.by.id,
        input.at
      );
      if (rows.length > 0) await writeAccessIn(client, input.by.email, (now) => input.compose(now, rows.map((u) => u.email)));
      return { kind: "removed", rows, already };
    })
  );
}

export type BringBackOutcome =
  /** `signIn`: its own sign-in kept, given back (it had given it up and nobody holds it now), or held by `holder`. */
  | { kind: "back"; before: UserRow; row: UserRow; signIn: "kept" | "restored" | "taken"; holder: UserRow | null }
  | { kind: "not-found" }
  | { kind: "not-removed"; row: UserRow };

/**
 * BRINGS A REMOVED ACCOUNT BACK (§110): on the plant's list again, switched on or off as it was when it was removed.
 * One that gave its sign-in up to another account gets it back when nobody holds it by then; otherwise it keeps the
 * given-up one until it is renamed. `compose` takes it off the removed list of the access rules, in the same transaction.
 */
export async function bringBackAccount(input: {
  id: string;
  by: AccountChanger;
  compose: (now: AccessItemsNow, change: { was: string; now: string }) => string | null;
}): Promise<BringBackOutcome> {
  return withClient((client) =>
    transaction(client, async (): Promise<BringBackOutcome> => {
      await lockAccounts(client);
      const before = (await client.query<UserRow>("SELECT * FROM users WHERE id = $1", [input.id])).rows[0];
      if (!before) return { kind: "not-found" };
      if (!before.removed_at) return { kind: "not-removed", row: before };
      let email = before.email;
      let signIn: "kept" | "restored" | "taken" = "kept";
      let holder: UserRow | null = null;
      const gaveUp = releasedFrom(before.email);
      if (gaveUp) {
        holder = (await client.query<UserRow>("SELECT * FROM users WHERE email = $1", [gaveUp])).rows[0] ?? null;
        if (holder) signIn = "taken";
        else {
          email = gaveUp;
          signIn = "restored";
        }
      }
      const { rows } = await client.query<UserRow>(
        `UPDATE users SET email = $2, removed_at = NULL, removed_by = NULL, active = COALESCE(active_before_removal, true), active_before_removal = NULL
          WHERE id = $1 RETURNING *`,
        [input.id, email]
      );
      await writeAccessIn(client, input.by.email, (now) => input.compose(now, { was: before.email, now: email }));
      return { kind: "back", before, row: rows[0], signIn, holder };
    })
  );
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
  /** The browser's own id for the line (a UUID, checked by the route), so a resent line is written once; none for the server's own lines. */
  clientId?: string | null;
}

/**
 * Writes a batch of lines ALL OR NOTHING, in the order given (REQUIREMENTS
 * §62). One statement, not one per line: the browser sends its lines several
 * at a time and sends the whole batch again when the request fails, so a batch
 * that was half written before a failure would put its first half in the log
 * twice — an audit trail that says a thing was done twice when it was done once.
 * A single INSERT is one transaction; it is also fifteen times quicker.
 *
 * AND ONCE ONLY (§75). All-or-nothing covers a send that fails BEFORE it is
 * written; it cannot cover one written and then unheard of — the connection
 * dropped after COMMIT, the browser saw a failure and sent the batch again.
 * A line the browser named (clientId) and the log already has is therefore
 * passed over (ON CONFLICT on the unique index on client_id — that index
 * only, so any other clash still fails the batch loudly): a resent batch
 * writes only what it had not written, still in order, and a retry racing the
 * first send waits for it and then writes nothing. A line with no id is
 * written as it always was.
 */
export async function insertActivity(lines: ActivityInput[]): Promise<void> {
  if (lines.length === 0) return;
  const column = (pick: (l: ActivityInput) => string | null) => lines.map(pick);
  await database().query(
    `INSERT INTO activity_log (user_id, user_name, user_email, action, target, detail, department, ip, client_id)
     SELECT user_id, user_name, user_email, action, target, detail, department, ip, client_id
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[])
            WITH ORDINALITY AS line (user_id, user_name, user_email, action, target, detail, department, ip, client_id, n)
      ORDER BY n
     ON CONFLICT (client_id) WHERE client_id IS NOT NULL DO NOTHING`,
    [
      column((l) => l.userId),
      column((l) => l.userName),
      column((l) => l.userEmail),
      column((l) => l.action),
      column((l) => l.target ?? ""),
      column((l) => l.detail ?? ""),
      column((l) => l.department ?? ""),
      column((l) => l.ip ?? ""),
      column((l) => l.clientId ?? null),
    ]
  );
}

/**
 * A search as typed, made safe to put inside LIKE's %...%: a backslash, a
 * percent sign or an underscore in the box means that character, not "any
 * characters" or "any one character" — "F_QC" must not find "F/QC", and "100%"
 * must not find every line that has "100" in it. Matched with ESCAPE '\'.
 */
function likeContaining(search: string): string {
  return `%${search.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// WHO DID WHAT, OVER A DAY, A MONTH OR A YEAR (REQUIREMENTS §73).
//
// "whatever the work that user has done in whole day, month, year and
// according to that logs also score will decide."
//
// The scoping rule does not change — the administrator reads every line, an
// account kept to departments reads its own and its departments' — and two
// more ways to narrow it are added: ONE PERSON, and A SPAN OF DAYS. `from` and
// `to` are plain YYYY-MM-DD and the span INCLUDES both ends, which is what a
// person means by "this month"; they are compared as a half-open range on `at`
// so the index on it is still used, rather than wrapping the column in a cast.
//
// The line list and the tally beside it take the SAME filter — scope, person,
// span and search — so the counts always describe the lines on the screen.
//
// LINES FOR THE SUPER ADMIN ALONE (REQUIREMENTS §75). An escalation names
// people, and nobody but the super admin is handed one (escalationRoutes.ts),
// so the log's two lines about escalations are the super admin's as well. They
// are written under no department and with no figures (escalation.ts), which
// keeps them from an account kept to departments; activityWhere below keeps
// them from every other reader too — an account with no departments set reads
// every other line of the plant — and from the lines written before that,
// which were filed under the escalated department with its counts and format
// numbers in the detail and, the log refusing an UPDATE, stay so for ever.
export const ESCALATION_ACTIONS = { raised: "Escalated to the super admin", acknowledged: "Escalation acknowledged" } as const;
// THE REMINDER EMAILS' LINES (the owner, 25-Oct-2026; backend/emailReminders.ts, backend/emailRoutes.ts) are the super
// admin's too: who has a reminder email and what went to whom is the super admin's business, as an escalation is. They
// never name an address.
export const EMAIL_ACTIONS = {
  sent: "Reminder emails sent",
  set: "Reminder email set",
  removed: "Reminder email removed",
  on: "Reminder emails switched on",
  off: "Reminder emails switched off",
  test: "Test email sent",
} as const;
const SUPER_ADMIN_ACTIONS: string[] = [...Object.values(ESCALATION_ACTIONS), ...Object.values(EMAIL_ACTIONS)];

export interface ActivityFilter {
  departments: string[] | null;
  userId: string;
  /** The super admin, who reads every line. Anybody else (false, or left out) never reads the SUPER_ADMIN_ACTIONS lines. */
  superAdmin?: boolean;
  /** Words anywhere in who, what, on what or the detail; matched as typed, not as a pattern. */
  search?: string;
  /** One person's lines only — their account id. */
  person?: string;
  /** Inclusive day bounds, YYYY-MM-DD. */
  from?: string;
  to?: string;
  // WHICH MODULE, WHICH DOCUMENT, WHICH ACTION (the owner, 14-Oct-2026: "which
  // user what does and in which modules and documents"). Each is one more
  // condition ANDed onto the scope above — narrowing what the account may
  // already read, never widening it — and each is a parameter, never put in
  // the SQL text (activityRoutes.ts reads them from the query).
  /** One module's lines only — the department code the line was filed under ("QC"). */
  department?: string;
  /** One document's lines only — words of its format number or name, anywhere in the line's target. */
  document?: string;
  /** One action's lines only — exactly as the log holds it ("Record started"). */
  action?: string;
}

/**
 * Appends this filter's conditions to `args` and returns them. Also read by activityArchive.ts, for the log and its
 * archive together — and its tally puts the same conditions on its day rows, which hold only the day (`at`), the person,
 * the department and the action: a condition on any other column must be named in activityArchive.ts dayRowsCanAnswer,
 * or PostgreSQL refuses the tally.
 */
export function activityWhere(opts: ActivityFilter, args: unknown[]): string[] {
  const where: string[] = [];
  if (opts.departments) {
    args.push(opts.userId, opts.departments);
    where.push(`(user_id = $${args.length - 1} OR department = ANY($${args.length}))`);
  }
  if (!opts.superAdmin) {
    args.push(SUPER_ADMIN_ACTIONS);
    where.push(`action <> ALL($${args.length}::text[])`);
  }
  if (opts.person) {
    args.push(opts.person);
    where.push(`user_id = $${args.length}`);
  }
  if (opts.from) {
    args.push(opts.from);
    where.push(`at >= $${args.length}::date`);
  }
  if (opts.to) {
    args.push(opts.to);
    where.push(`at < ($${args.length}::date + 1)`);
  }
  if (opts.search) {
    args.push(likeContaining(opts.search));
    // E'\\' is one backslash whatever standard_conforming_strings says.
    where.push(`${ACTIVITY_SEARCH_TEXT} LIKE $${args.length} ESCAPE E'\\\\'`);
  }
  if (opts.department) {
    args.push(opts.department);
    where.push(`department = $${args.length}`);
  }
  if (opts.action) {
    args.push(opts.action);
    where.push(`action = $${args.length}`);
  }
  if (opts.document) {
    // The target names the document or the record ("F/QC/01 Daily ... — 2026-10-14"); the words typed, anywhere in it.
    args.push(likeContaining(opts.document));
    where.push(`lower(target) LIKE $${args.length} ESCAPE E'\\\\'`);
  }
  return where;
}

/** One person's tally for the span: how much of each thing they did. */
export interface ActivityTally {
  userId: string | null;
  userName: string;
  /** Lines, by action. */
  byAction: Record<string, number>;
  total: number;
  /** The first and last thing they did in the span, so a day reads at a glance. */
  firstAt: string;
  lastAt: string;
  /** Separate days they did anything at all — the honest measure of a month. */
  activeDays: number;
}

/**
 * THE TALLY THE SCORE IS READ BESIDE (REQUIREMENTS §73, §75): one row per
 * person for the span — lines by action, the first and the last, and the
 * separate days — grouped in the database, not by walking lines in the browser.
 *
 * Worked out in activityArchive.ts, which also counts the archive for the super
 * admin: closed days are read from a day-by-day count (activity_daily) and the
 * last two days from the lines themselves. At a million lines "Everything"
 * took 2 to 9 seconds counted line by line; from the day rows, 0.2 s on a
 * plant-shaped log — the same counts, to the line. Reached with a dynamic
 * import because that module imports this one: it is loaded (and its tables
 * made) when the server starts, long before a tally is asked for.
 */
export async function activitySummary(opts: ActivityFilter): Promise<ActivityTally[]> {
  const { activityTally } = await import("./activityArchive.ts");
  return activityTally(opts, false);
}

/**
 * NEWEST FIRST, a page at a time. `departments` null = every line; otherwise
 * the person's own lines and their departments'. `before` is the id of the
 * last line of the page already shown, and the next page is the lines below it.
 *
 * The id is handed out as TEXT (a bigint can outgrow a JavaScript number), so
 * the ordering and the cursor must both name the TABLE's id: a bare
 * `ORDER BY id` resolves to the text column of the same name in the SELECT
 * list, which sorted 99 above 158 — the log was not newest first, "Show older"
 * skipped and repeated lines, and every page sorted the whole table to find
 * its hundred. Ordered by activity_log.id it is read straight off the primary
 * key, backwards, and stops at the hundredth line.
 */
export async function listActivity(opts: ActivityFilter & { limit: number; before?: string }): Promise<ActivityLine[]> {
  const args: unknown[] = [];
  const where: string[] = [];
  if (opts.before) {
    args.push(opts.before);
    where.push(`activity_log.id < $${args.length}::bigint`);
  }
  where.push(...activityWhere(opts, args));
  args.push(opts.limit);
  const { rows } = await database().query<{ id: string; at: Date; user_id: string | null; user_name: string; user_email: string; action: string; target: string; detail: string; department: string }>(
    `SELECT id::text AS id, at, user_id, user_name, user_email, action, target, detail, department FROM activity_log
     ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY activity_log.id DESC LIMIT $${args.length}`,
    args
  );
  return rows.map((r) => ({ id: r.id, at: r.at.toISOString(), userId: r.user_id, userName: r.user_name, userEmail: r.user_email, action: r.action, target: r.target, detail: r.detail, department: r.department }));
}

export async function setUserDepartments(id: string, departments: string): Promise<UserRow | undefined> {
  const { rows } = await database().query<UserRow>("UPDATE users SET departments = $1 WHERE id = $2 RETURNING *", [departments, id]);
  return rows[0];
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
