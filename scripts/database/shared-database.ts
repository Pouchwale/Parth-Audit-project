// THE SHARED DATABASE OF DCRS AND THE AUDIT ASSISTANT (REQUIREMENTS §83):
// set it up, test it, and make a copy to build on first.
//
//   npm run db:shared -- setup [--with-chatbot] [--with-dcrs-comments]
//                              [--with-chatbot-comments] [--rebuild-views]
//     Applies database/sql/01-schemas-and-roles.sql and 02-overview-dcrs.sql
//     (and 03-overview-chatbot.sql with --with-chatbot, and the optional
//     comment files with their flags) to the database SUPERUSER_DATABASE_URL
//     names, all in ONE transaction: either all of it is done or none of it.
//     Sets the two logins' passwords from AUDIT_ASSISTANT_PASSWORD and
//     OVERVIEW_VIEWER_PASSWORD when they are given, sent as SCRAM-SHA-256
//     hashes, never as the passwords themselves (so no server log can hold
//     them). Refuses, and changes nothing, when the URL is not a superuser's.
//
//   npm run db:shared -- test
//     Runs database/tests against SUPERUSER_DATABASE_URL. With the two
//     passwords set as well, it also checks real sign-ins of the two logins.
//
//   npm run db:shared -- copy --from <source URL> --to <URL of a new database>
//     pg_dump of the source, restored into a NEW database on a scratch server
//     (the database named in --to, which must not exist yet), so the set-up
//     can be built and tested on a copy before the real database. The source
//     is only read. Also SOURCE_DATABASE_URL and COPY_DATABASE_URL.
//
// The steps, in order, and what each role may do: docs/database/README.md.
// A password may be left out of a URL and given in PGPASSWORD or in pgpass.conf
// instead, which keeps it out of the command line and the shell's history.
import { spawnSync } from "node:child_process";
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

/** The repository's root folder. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SQL_DIR = path.join(ROOT, "database", "sql");
const TESTS_DIR = path.join(ROOT, "database", "tests");

/** The views part 2 makes over DCRS's data. */
export const DCRS_VIEWS = ["dcrs_accounts", "records", "findings", "customer_complaints", "pest_control_reports_by_day", "dcrs_activity", "dcrs_downloads"] as const;
/** The views part 3 makes over the Audit Assistant's tables. */
export const ASSISTANT_VIEWS = ["people", "assistant_sessions", "assistant_sign_ins", "assistant_activity", "file_handouts", "downloads"] as const;
// Every overview view, in an order in which each can be dropped: a view before the views it reads.
const DROP_ORDER = [
  "downloads", "people", "assistant_sessions", "assistant_sign_ins", "assistant_activity", "file_handouts",
  "dcrs_downloads", "dcrs_activity", "dcrs_accounts", "records", "findings", "customer_complaints", "pest_control_reports_by_day",
];

const USAGE = `The shared database of DCRS and the Audit Assistant (REQUIREMENTS §83).

  npm run db:shared -- setup
      Sets up the schemas, roles and views in the database that
      SUPERUSER_DATABASE_URL names (the URL of a superuser, such as postgres).
      --with-chatbot            also the views over the Audit Assistant's tables
                                (once the assistant has started and made them)
      --with-dcrs-comments      also plain-English comments on DCRS's own tables
                                (optional: the owner's call)
      --with-chatbot-comments   also plain-English comments on the assistant's tables
      --rebuild-views           drop every overview view first, then make them again
                                (before an Audit Assistant migration that changes a
                                column the views read, or when a view's columns change)
      AUDIT_ASSISTANT_PASSWORD, OVERVIEW_VIEWER_PASSWORD
                                when set, the passwords of the two logins

  npm run db:shared -- test
      Runs the database tests (database/tests) against SUPERUSER_DATABASE_URL.
      With the two passwords set as well, it also checks real sign-ins.

  npm run db:shared -- copy --from <source URL> --to <URL of a new database>
      Copies a database (pg_dump) into a NEW database on a scratch server, to set
      up and test on before the real one. The source is only read.
      --keep-dump <file>        keep the dump there (it holds all the data)

Every step, in order: docs/database/README.md`;

// ---------------------------------------------------------------------------
// small helpers, also used by database/tests

/** A connection URL with its password hidden, for printing. */
export function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "(a URL that could not be read)";
  }
}

/** The same server and role, another database. */
export function withDatabase(url: string, database: string): string {
  const u = new URL(url);
  u.pathname = `/${encodeURIComponent(database)}`;
  return u.toString();
}

/** The same server and database, another role (and its password, when given). */
export function withUser(url: string, user: string, password?: string): string {
  const u = new URL(url);
  u.username = encodeURIComponent(user);
  u.password = password ? encodeURIComponent(password) : "";
  return u.toString();
}

/** The database a URL names. */
export function databaseOf(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

/** A name written safely into SQL: "name". */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** A string written safely into SQL: 'text'. */
function quoteLiteral(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}

/**
 * The password as PostgreSQL stores it, a SCRAM-SHA-256 verifier, worked out
 * here (as psql's \password does) so the password itself never travels in a
 * statement. Only printable ASCII is accepted (checkPassword), which needs no
 * Unicode normalisation on either side.
 */
export function scramVerifier(password: string, iterations = 4096, salt: Buffer = randomBytes(16)): string {
  const salted = pbkdf2Sync(Buffer.from(password, "utf8"), salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}

/** Why a password will not do, or null when it will. */
export function checkPassword(password: string): string | null {
  if (password.length < 12) return "it is shorter than 12 characters";
  if (!/^[\x21-\x7e]+$/.test(password)) return "it may hold only letters, digits and punctuation (no spaces, no accented letters)";
  return null;
}

/** A PostgreSQL client program (pg_dump, pg_restore) new enough for a server of `serverMajor`. */
export function findPgTool(name: "pg_dump" | "pg_restore" | "psql", serverMajor: number): { path: string; version: string } {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const dirs: string[] = [];
  if (process.env.PG_BIN) dirs.push(process.env.PG_BIN);
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) if (dir.trim()) dirs.push(dir.trim());
  if (process.platform === "win32") {
    for (const base of [process.env.ProgramFiles ?? "C:\\Program Files", process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)"]) {
      const root = path.join(base, "PostgreSQL");
      let versions: string[] = [];
      try {
        versions = readdirSync(root).filter((d) => /^\d+(\.\d+)?$/.test(d));
      } catch {
        continue;
      }
      versions.sort((a, b) => parseFloat(b) - parseFloat(a));
      for (const v of versions) dirs.push(path.join(root, v, "bin"));
    }
  }
  const tooOld: string[] = [];
  for (const dir of dirs) {
    const candidate = path.join(dir, exe);
    if (!existsSync(candidate)) continue;
    const run = spawnSync(candidate, ["--version"], { encoding: "utf8", windowsHide: true });
    const version = (run.stdout ?? "").trim();
    const major = Number(version.match(/(\d+)(?:\.\d+)*/)?.[1] ?? 0);
    if (run.status === 0 && major >= serverMajor) return { path: candidate, version };
    tooOld.push(`${candidate} (${version || "no version"})`);
  }
  throw new Error(
    `No ${name} for PostgreSQL ${serverMajor} or newer was found` +
      (tooOld.length ? ` (too old: ${tooOld.join("; ")})` : "") +
      `. Install the PostgreSQL ${serverMajor} client tools, or set PG_BIN to the folder that holds ${exe}.`
  );
}

/** How to run a PostgreSQL client program on a URL without its password on the command line. */
export function toolConnection(url: string): { url: string; env: NodeJS.ProcessEnv } {
  const u = new URL(url);
  const password = decodeURIComponent(u.password);
  u.password = "";
  const env = { ...process.env };
  if (password) env.PGPASSWORD = password;
  return { url: u.toString(), env };
}

/** Runs a PostgreSQL client program and says plainly what went wrong when it fails. */
export function runTool(tool: string, args: string[], env: NodeJS.ProcessEnv): void {
  const run = spawnSync(tool, args, { encoding: "utf8", env, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (run.error) throw new Error(`${path.basename(tool)} could not be started: ${run.error.message}`);
  if (run.status !== 0) {
    const said = `${run.stderr ?? ""}\n${run.stdout ?? ""}`.trim().split(/\r?\n/).slice(-12).join("\n");
    throw new Error(`${path.basename(tool)} stopped with code ${run.status}:\n${said}`);
  }
}

async function connect(url: string, purpose: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url, application_name: `dcrs shared-database ${purpose}` });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(`Could not connect to ${maskUrl(url)}: ${(err as Error).message}`);
  }
  return client;
}

interface ServerFacts {
  user: string;
  superuser: boolean;
  database: string;
  version: string;
  major: number;
}

async function serverFacts(client: pg.Client): Promise<ServerFacts> {
  const { rows } = await client.query(
    `SELECT current_user AS user, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superuser,
            current_database() AS database, current_setting('server_version') AS version,
            current_setting('server_version_num')::int AS num`
  );
  const r = rows[0] as { user: string; superuser: boolean; database: string; version: string; num: number };
  return { user: r.user, superuser: r.superuser, database: r.database, version: r.version, major: Math.floor(r.num / 10000) };
}

function refuseUnlessSuperuser(facts: ServerFacts, url: string, what: string): void {
  if (facts.superuser) return;
  throw new Refusal(
    `REFUSED: ${facts.user} is not a superuser on ${maskUrl(url)}.\n` +
      `${what} makes roles, schemas and grants, and must run as a superuser (for example postgres).\n` +
      `Nothing was changed.`
  );
}

/** A refusal: said plainly, exit code 2, and nothing was changed. */
class Refusal extends Error {}

function line(label: string, said: string): void {
  console.log(`  ${label.padEnd(44, ".")} ${said}`);
}

// ---------------------------------------------------------------------------
// setup

interface SetupOptions {
  chatbot: boolean;
  dcrsComments: boolean;
  chatbotComments: boolean;
  rebuildViews: boolean;
}

/** Where in a file an error from PostgreSQL points, as "line N". */
function whereInFile(sql: string, err: unknown): string {
  const position = Number((err as { position?: string }).position ?? 0);
  if (!position) return "";
  return ` at line ${sql.slice(0, position - 1).split("\n").length}`;
}

async function applyFile(client: pg.Client, relative: string): Promise<void> {
  const file = path.join(SQL_DIR, relative);
  const sql = readFileSync(file, "utf8");
  try {
    await client.query(sql);
  } catch (err) {
    throw new Error(`database/sql/${relative} failed${whereInFile(sql, err)}: ${(err as Error).message}`);
  }
}

async function setup(options: SetupOptions): Promise<void> {
  const url = process.env.SUPERUSER_DATABASE_URL?.trim();
  if (!url) throw new Refusal(`SUPERUSER_DATABASE_URL is not set. It names the DCRS database, as a superuser:\n  postgres://postgres@db-host:5432/dcrs  (the password in PGPASSWORD, pgpass.conf or the URL)\n\n${USAGE}`);
  const passwords: { role: string; variable: string; value: string }[] = [];
  for (const [role, variable] of [["audit_assistant", "AUDIT_ASSISTANT_PASSWORD"], ["overview_viewer", "OVERVIEW_VIEWER_PASSWORD"]] as const) {
    const value = process.env[variable] ?? "";
    if (!value) continue;
    const wrong = checkPassword(value);
    if (wrong) throw new Refusal(`REFUSED: ${variable} will not do: ${wrong}. Nothing was changed.`);
    passwords.push({ role, variable, value });
  }

  const client = await connect(url, "setup");
  const warnings: string[] = [];
  client.on("notice", (notice) => {
    if (notice.severity === "WARNING") warnings.push(notice.message ?? "");
  });
  try {
    const facts = await serverFacts(client);
    console.log("Shared database set-up (REQUIREMENTS §83)");
    console.log(`  Database: ${maskUrl(url)}`);
    console.log(`  PostgreSQL ${facts.version}, signed in as ${facts.user}${facts.superuser ? ", a superuser" : ""}`);
    console.log("");
    refuseUnlessSuperuser(facts, url, "Setup");

    const rolesBefore = new Set(
      (await client.query(`SELECT rolname FROM pg_roles WHERE rolname IN ('audit_assistant', 'overview_viewer', 'overview_owner')`)).rows.map((r) => (r as { rolname: string }).rolname)
    );

    await client.query("BEGIN");
    try {
      if (options.rebuildViews) {
        for (const view of DROP_ORDER) await client.query(`DROP VIEW IF EXISTS overview.${quoteIdent(view)}`);
      }
      await applyFile(client, "01-schemas-and-roles.sql");
      await applyFile(client, "02-overview-dcrs.sql");
      if (options.chatbot) await applyFile(client, "03-overview-chatbot.sql");
      if (options.dcrsComments) await applyFile(client, "optional/dcrs-table-comments.sql");
      if (options.chatbotComments) await applyFile(client, "optional/chatbot-table-comments.sql");
      for (const p of passwords) await client.query(`ALTER ROLE ${quoteIdent(p.role)} PASSWORD ${quoteLiteral(scramVerifier(p.value))}`);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw new Error(`${(err as Error).message}\n\nNothing was changed: the whole set-up is one transaction, and it was rolled back.`);
    }

    // What there is now, read back from the database itself.
    const roles = (
      await client.query(
        `SELECT r.rolname, r.rolcanlogin, r.rolconnlimit, a.rolpassword IS NOT NULL AS has_password
           FROM pg_roles r JOIN pg_authid a ON a.oid = r.oid
          WHERE r.rolname IN ('audit_assistant', 'overview_viewer', 'overview_owner') ORDER BY r.rolname`
      )
    ).rows as { rolname: string; rolcanlogin: boolean; rolconnlimit: number; has_password: boolean }[];
    const views = new Set(
      (await client.query(`SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'overview'::regnamespace AND c.relkind = 'v'`)).rows.map((r) => (r as { relname: string }).relname)
    );
    const dcrsViews = DCRS_VIEWS.filter((v) => views.has(v));
    const assistantViews = ASSISTANT_VIEWS.filter((v) => views.has(v));

    if (options.rebuildViews) line("Every overview view", "dropped first, to be made again");
    line("Part 1: schemas and roles", "applied (database/sql/01-schemas-and-roles.sql)");
    for (const r of roles) {
      const made = rolesBefore.has(r.rolname) ? "already there" : "made now";
      const how = r.rolcanlogin ? `a login, at most ${r.rolconnlimit < 0 ? "any number of" : r.rolconnlimit} connections` : "no login";
      line(`    role ${r.rolname}`, `${made}; ${how}`);
    }
    line("    schemas", "chatbot (owned by audit_assistant), overview");
    line("Part 2: views over DCRS's data", `applied: ${dcrsViews.length} views (database/sql/02-overview-dcrs.sql)`);
    if (options.chatbot) line("Part 3: views over the assistant's tables", `applied: ${assistantViews.length} views (database/sql/03-overview-chatbot.sql)`);
    else if (assistantViews.length) line("Part 3: views over the assistant's tables", `left as they were: ${assistantViews.length} views`);
    else line("Part 3: views over the assistant's tables", "not applied (add --with-chatbot once the Audit Assistant has made its tables)");
    line("Comments on DCRS's own tables", options.dcrsComments ? "applied (database/sql/optional/dcrs-table-comments.sql)" : "not applied this time (optional: --with-dcrs-comments)");
    line("Comments on the assistant's tables", options.chatbotComments ? "applied (database/sql/optional/chatbot-table-comments.sql)" : "not applied this time (optional: --with-chatbot-comments)");
    for (const r of roles.filter((x) => x.rolcanlogin)) {
      const given = passwords.find((p) => p.role === r.rolname);
      const variable = r.rolname === "audit_assistant" ? "AUDIT_ASSISTANT_PASSWORD" : "OVERVIEW_VIEWER_PASSWORD";
      if (given) line(`Password of ${r.rolname}`, `set from ${given.variable} (sent as a SCRAM-SHA-256 hash)`);
      else if (r.has_password) line(`Password of ${r.rolname}`, `not changed (${variable} is not set)`);
      else line(`Password of ${r.rolname}`, `NONE YET: nobody can sign in as ${r.rolname} until ${variable} is set and setup runs again`);
    }
    for (const w of warnings) console.log(`  Warning from PostgreSQL: ${w}`);
    console.log("");
    console.log("Done, in one transaction.");
    console.log(`The views in overview now: ${[...views].sort().join(", ") || "none"}.`);
    console.log("Next: npm run db:shared -- test");
  } finally {
    await client.end().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// test

async function runTests(): Promise<number> {
  const url = process.env.SUPERUSER_DATABASE_URL?.trim();
  if (!url) throw new Refusal(`SUPERUSER_DATABASE_URL is not set: it names the database to test, as a superuser.\n\n${USAGE}`);
  const client = await connect(url, "test");
  try {
    const facts = await serverFacts(client);
    console.log(`Testing the shared database in ${maskUrl(url)} (PostgreSQL ${facts.version}).`);
    refuseUnlessSuperuser(facts, url, "The test");
  } finally {
    await client.end().catch(() => undefined);
  }
  if (!process.env.AUDIT_ASSISTANT_PASSWORD || !process.env.OVERVIEW_VIEWER_PASSWORD) {
    console.log("AUDIT_ASSISTANT_PASSWORD and OVERVIEW_VIEWER_PASSWORD are not both set: the checks of a real sign-in of those logins are skipped.");
  }
  const files = readdirSync(TESTS_DIR)
    .filter((f) => f.endsWith(".test.ts"))
    .sort()
    .map((f) => path.join(TESTS_DIR, f));
  const run = spawnSync(process.execPath, ["--no-warnings=ExperimentalWarning", "--test", "--test-reporter=spec", ...files], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, SHARED_DB_TEST_URL: url },
  });
  if (run.error) throw run.error;
  return run.status ?? 1;
}

// ---------------------------------------------------------------------------
// copy

// Every role the database's objects belong to or are granted to: they must
// exist on the scratch server before the restore, or its owners and grants
// could not be put back.
const ROLES_NEEDED = `
  SELECT DISTINCT r.rolname
  FROM pg_roles r
  JOIN (
    SELECT c.relowner AS id FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname !~ '^pg_toast'
    UNION SELECT nspowner FROM pg_namespace WHERE nspname NOT IN ('pg_catalog', 'information_schema') AND nspname !~ '^pg_'
    UNION SELECT p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    UNION SELECT t.typowner FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    UNION SELECT (aclexplode(c.relacl)).grantee FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relacl IS NOT NULL AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    UNION SELECT (aclexplode(a.attacl)).grantee FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE a.attacl IS NOT NULL AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    UNION SELECT (aclexplode(nspacl)).grantee FROM pg_namespace WHERE nspacl IS NOT NULL AND nspname NOT IN ('pg_catalog', 'information_schema')
    UNION SELECT (aclexplode(p.proacl)).grantee FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.proacl IS NOT NULL AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    UNION SELECT defaclrole FROM pg_default_acl
    UNION SELECT (aclexplode(defaclacl)).grantee FROM pg_default_acl
  ) used ON used.id = r.oid
  WHERE r.rolname !~ '^pg_'
  ORDER BY 1`;

// The tables to count, in the source and in the copy, to show the copy is whole.
const USER_TABLES = `
  SELECT n.nspname AS schema, c.relname AS name, has_table_privilege(c.oid, 'SELECT') AS readable
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname !~ '^pg_'
  ORDER BY 1, 2`;

async function countRows(client: pg.Client, tables: { schema: string; name: string }[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const t of tables) {
    const { rows } = await client.query(`SELECT count(*)::bigint AS n FROM ${quoteIdent(t.schema)}.${quoteIdent(t.name)}`);
    counts.set(`${t.schema}.${t.name}`, Number((rows[0] as { n: string }).n));
  }
  return counts;
}

async function copy(from: string | undefined, to: string | undefined, keepDump: string | undefined): Promise<void> {
  const source = (from ?? process.env.SOURCE_DATABASE_URL ?? "").trim();
  const target = (to ?? process.env.COPY_DATABASE_URL ?? "").trim();
  if (!source || !target) throw new Refusal(`copy needs the database to copy (--from or SOURCE_DATABASE_URL) and the new database to make (--to or COPY_DATABASE_URL).\n\n${USAGE}`);
  const name = databaseOf(target);
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(name)) {
    throw new Refusal(`REFUSED: "${name}" will not do as the new database's name: use letters, digits and _ (at most 63), starting with a letter. Nothing was changed.`);
  }
  const s = new URL(source);
  const t = new URL(target);
  if (s.hostname === t.hostname && (s.port || "5432") === (t.port || "5432") && databaseOf(source) === name) {
    throw new Refusal("REFUSED: the copy would be the source itself. Name a new database in --to. Nothing was changed.");
  }

  console.log("Copy of a database, to build the shared set-up on first (REQUIREMENTS §83)");
  console.log(`  From: ${maskUrl(source)} (only read)`);
  console.log(`  To:   ${maskUrl(target)} (a new database)`);
  console.log("");

  const src = await connect(source, "copy (source)");
  const admin = await connect(withDatabase(target, "postgres"), "copy (scratch server)");
  let created = false;
  let dumpDir: string | null = null;
  try {
    const srcFacts = await serverFacts(src);
    const adminFacts = await serverFacts(admin);
    refuseUnlessSuperuser(adminFacts, withDatabase(target, "postgres"), "Copy (on the scratch server)");
    if (adminFacts.major < srcFacts.major) {
      throw new Refusal(`REFUSED: the scratch server runs PostgreSQL ${adminFacts.version}, older than the source's ${srcFacts.version}; a copy may not restore there. Nothing was changed.`);
    }
    const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (exists.rowCount) throw new Refusal(`REFUSED: the database ${name} already exists on the scratch server. copy never writes over a database: name a new one, or drop that one yourself. Nothing was changed.`);

    const pgDump = findPgTool("pg_dump", srcFacts.major);
    const pgRestore = findPgTool("pg_restore", srcFacts.major);
    line("Source", `${srcFacts.database}, PostgreSQL ${srcFacts.version}, read as ${srcFacts.user}`);
    line("Scratch server", `PostgreSQL ${adminFacts.version}, as ${adminFacts.user} (a superuser)`);
    line("Tools", `${pgDump.version}; ${pgRestore.version}`);

    // One snapshot for the count and for the dump, so the two describe the
    // same moment even while DCRS is writing.
    await src.query("BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    const snapshot = ((await src.query("SELECT pg_export_snapshot() AS s")).rows[0] as { s: string }).s;
    const tables = (await src.query(USER_TABLES)).rows as { schema: string; name: string; readable: boolean }[];
    const unreadable = tables.filter((x) => !x.readable).map((x) => `${x.schema}.${x.name}`);
    if (unreadable.length) {
      throw new Refusal(`REFUSED: ${srcFacts.user} may not read ${unreadable.join(", ")}, so pg_dump could not copy them. Use a superuser's URL for the source. Nothing was changed.`);
    }
    const sourceCounts = await countRows(src, tables);
    const roles = ((await src.query(ROLES_NEEDED)).rows as { rolname: string }[]).map((r) => r.rolname);
    const collation = (await src.query("SELECT datcollate, datctype FROM pg_database WHERE datname = current_database()")).rows[0] as { datcollate: string; datctype: string };

    dumpDir = mkdtempSync(path.join(os.tmpdir(), "dcrs-copy-"));
    const dumpFile = path.join(dumpDir, `${srcFacts.database}.dump`);
    const dumpFrom = toolConnection(source);
    runTool(pgDump.path, ["--format=custom", "--no-password", `--snapshot=${snapshot}`, `--file=${dumpFile}`, `--dbname=${dumpFrom.url}`], dumpFrom.env);
    await src.query("COMMIT");
    line("Dumped", `${(statSync(dumpFile).size / 1024).toFixed(0)} KB, ${tables.length} tables`);

    const present = new Set(((await admin.query("SELECT rolname FROM pg_roles WHERE rolname = ANY($1)", [roles])).rows as { rolname: string }[]).map((r) => r.rolname));
    for (const role of roles.filter((r) => !present.has(r))) {
      // A login only for the two roles that are logins; no password: setup sets them.
      const login = role === "audit_assistant" || role === "overview_viewer" ? "LOGIN" : "NOLOGIN";
      await admin.query(`CREATE ROLE ${quoteIdent(role)} ${login}`);
      line(`Role ${role}`, `made on the scratch server (${login === "LOGIN" ? "a login with no password yet" : "no login"}), for the owners and grants of the copy`);
    }

    try {
      await admin.query(`CREATE DATABASE ${quoteIdent(name)} TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE ${quoteLiteral(collation.datcollate)} LC_CTYPE ${quoteLiteral(collation.datctype)}`);
    } catch {
      await admin.query(`CREATE DATABASE ${quoteIdent(name)} TEMPLATE template0 ENCODING 'UTF8'`);
      line("Note", `the scratch server has no locale ${collation.datcollate}; the copy uses its default`);
    }
    created = true;
    line("Database", `${name} made (UTF8)`);

    const restoreTo = toolConnection(target);
    runTool(pgRestore.path, ["--no-password", "--single-transaction", `--dbname=${restoreTo.url}`, dumpFile], restoreTo.env);
    line("Restored", "in one transaction");

    const copyClient = await connect(target, "copy (check)");
    try {
      const copyCounts = await countRows(copyClient, tables);
      const differ = [...sourceCounts].filter(([k, n]) => copyCounts.get(k) !== n).map(([k, n]) => `${k}: ${n} in the source, ${copyCounts.get(k) ?? "missing"} in the copy`);
      if (differ.length) throw new Error(`The copy is not whole:\n  ${differ.join("\n  ")}`);
      const rows = [...sourceCounts.values()].reduce((a, b) => a + b, 0);
      line("Checked", `all ${tables.length} tables hold the same number of rows as the source (${rows} rows)`);
    } finally {
      await copyClient.end().catch(() => undefined);
    }

    if (keepDump) {
      copyFileSync(dumpFile, keepDump);
      line("Dump kept", `${path.resolve(keepDump)} (it holds all the data, password hashes too: keep it safe)`);
    }
    console.log("");
    console.log(`The copy is ready: ${maskUrl(target)}`);
    // pg_dump carries a database's own grants (such as the assistant's CREATE on
    // it) only with --create, which would need the source's name: setup makes them again.
    console.log("The grants on the database itself are not copied; setup, the next step, makes them again.");
    console.log("Next, on the copy (never on the real database first):");
    console.log(`  SUPERUSER_DATABASE_URL=${maskUrl(target)}`);
    console.log("  npm run db:shared -- setup");
    console.log("  npm run db:shared -- test");
  } catch (err) {
    await src.query("ROLLBACK").catch(() => undefined);
    if (created) {
      await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(name)} WITH (FORCE)`).catch(() => undefined);
      throw new Error(`${(err as Error).message}\n\nThe half-made copy ${name} was dropped again. The source was only read.`);
    }
    throw err;
  } finally {
    if (dumpDir) rmSync(dumpDir, { recursive: true, force: true });
    await src.end().catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------

async function main(argv: string[]): Promise<number> {
  const command = argv[0];
  const flags = new Set<string>();
  const values = new Map<string, string>();
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (["--from", "--to", "--keep-dump"].includes(a)) {
      const v = argv[++i];
      if (!v) throw new Refusal(`${a} needs a value.\n\n${USAGE}`);
      values.set(a, v);
    } else if (["--with-chatbot", "--with-dcrs-comments", "--with-chatbot-comments", "--rebuild-views"].includes(a)) {
      flags.add(a);
    } else {
      throw new Refusal(`"${a}" is not something db:shared knows.\n\n${USAGE}`);
    }
  }
  const wrongFlags = (allowed: string[]): string[] => [...flags, ...values.keys()].filter((f) => !allowed.includes(f));
  switch (command) {
    case "setup": {
      const extra = wrongFlags(["--with-chatbot", "--with-dcrs-comments", "--with-chatbot-comments", "--rebuild-views"]);
      if (extra.length) throw new Refusal(`setup does not take ${extra.join(", ")}.\n\n${USAGE}`);
      await setup({
        chatbot: flags.has("--with-chatbot"),
        dcrsComments: flags.has("--with-dcrs-comments"),
        chatbotComments: flags.has("--with-chatbot-comments"),
        rebuildViews: flags.has("--rebuild-views"),
      });
      return 0;
    }
    case "test": {
      const extra = wrongFlags([]);
      if (extra.length) throw new Refusal(`test does not take ${extra.join(", ")}.\n\n${USAGE}`);
      return runTests();
    }
    case "copy": {
      const extra = wrongFlags(["--from", "--to", "--keep-dump"]);
      if (extra.length) throw new Refusal(`copy does not take ${extra.join(", ")}.\n\n${USAGE}`);
      await copy(values.get("--from"), values.get("--to"), values.get("--keep-dump"));
      return 0;
    }
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(USAGE);
      return command === undefined ? 2 : 0;
    default:
      throw new Refusal(`"${command}" is not something db:shared knows.\n\n${USAGE}`);
  }
}

if (import.meta.main) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      if (err instanceof Refusal) {
        console.error(err.message);
        process.exit(2);
      }
      console.error(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  );
}
