// TESTS THAT A BACKUP RESTORES (REQUIREMENTS §83): `npm run db:restore-test`,
// or `npm run db:restore-test -- <dump file> [--roles <roles file>]`.
//
// It restores the newest backup in backend/data/backups (or BACKUP_DIR), or the
// dump named, into a NEW database of its own on the server that
// RESTORE_TEST_SERVER_URL names (a superuser's address, for example
// postgres://postgres:<password>@127.0.0.1:5432/postgres), checks it, and drops
// it again:
//
//   1. The roles the server lacks are made from the roles file beside the dump
//      (roles-<same stamp>.sql, written by scripts/database/backup.ts). A role
//      already on the server is left exactly as it is. The roles this run made
//      are dropped again at the end.
//   2. Its database is made the way the dump describes (encoding, locale) and
//      given the dump's own grants on it, such as the Audit Assistant's right
//      to create its schema: pg_restore applies those only with --create, which
//      would use the source's name. Then pg_restore restores everything else.
//   3. The checks: the restore ran without an error; the schemas public,
//      chatbot and overview are there when the dump has them; every table is
//      there, with as many rows as in the source when SOURCE_DATABASE_URL names
//      it (otherwise the restore's own counts are shown); every overview view
//      answers as overview_viewer; audit_assistant still cannot read any of
//      DCRS's tables; audit_assistant can still create its schema, as the Audit
//      Assistant does at every start.
//   4. Its database is dropped.
//
// IT TOUCHES NO OTHER DATABASE. Its database is named restore_test_<date>_<time>_<random>
// by this run; it stops if that name is already taken, and every restore,
// grant and DROP names only that database. The source is only read, in a
// read-only session. A restore_test_… database left by a run that was cut off
// is listed, never dropped.
//
// docs/DEPLOYMENT.md, "Backups of the shared database", says when to run it.
import "../../backend/env.ts";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import {
  backupDir,
  count,
  databaseStatements,
  findPgTools,
  formatBytes,
  hidePassword,
  newestDump,
  parseDatabaseUrl,
  parseRolesFile,
  parseToc,
  plainList,
  quoteIdent,
  readIdent,
  renameDatabase,
  rolesFileFor,
  runTool,
  stampOf,
  statementsForMissingRoles,
  toolEnv,
  toolVersion,
  tocDatabaseEntries,
  tocSchemas,
  tocTables,
  tocViews,
  withDatabase,
  type DatabaseAddress,
} from "./backup-common.ts";

const APP = "DCRS restore test";
const OWN_NAME = /^restore_test_\d{8}_\d{4}_[0-9a-f]{4}$/;
/** The addresses in use, so that no message ever shows their passwords. */
const addresses: DatabaseAddress[] = [];

interface Check {
  /** true passed, false failed, null nothing to check. */
  ok: boolean | null;
  title: string;
  details: string[];
}

async function connect(address: DatabaseAddress): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: address.full, connectionTimeoutMillis: 15000, application_name: APP });
  client.on("error", () => {});
  await client.connect();
  return client;
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));
const codeOf = (err: unknown) => (err as { code?: string }).code ?? "";

function commandLine(): { dump: string | null; roles: string | null } {
  const argv = process.argv.slice(2);
  let dump: string | null = null;
  let roles: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--roles") roles = argv[++i] ?? null;
    else if (arg.startsWith("--roles=")) roles = arg.slice("--roles=".length);
    else if (arg.startsWith("-")) throw new Error(`Unknown option ${arg}. Use: npm run db:restore-test -- [dump file] [--roles roles file]`);
    else dump = arg;
  }
  return { dump, roles };
}

/** Runs each query as `role`, one after another, in a transaction that is rolled back; an error in one does not stop the next. */
async function asRole(
  db: pg.Client,
  role: string,
  queries: Array<{ label: string; sql: string }>
): Promise<Array<{ label: string; rows: Array<Record<string, unknown>> | null; error: unknown; ms: number }>> {
  const results: Array<{ label: string; rows: Array<Record<string, unknown>> | null; error: unknown; ms: number }> = [];
  await db.query("BEGIN");
  try {
    await db.query(`SET LOCAL ROLE ${quoteIdent(role)}`);
    await db.query("SET LOCAL statement_timeout = '120s'");
    for (const q of queries) {
      const started = Date.now();
      await db.query("SAVEPOINT one_check");
      try {
        const r = await db.query(q.sql);
        results.push({ label: q.label, rows: r.rows as Array<Record<string, unknown>>, error: null, ms: Date.now() - started });
        await db.query("RELEASE SAVEPOINT one_check");
      } catch (err) {
        results.push({ label: q.label, rows: null, error: err, ms: Date.now() - started });
        await db.query("ROLLBACK TO SAVEPOINT one_check");
      }
    }
  } finally {
    await db.query("ROLLBACK");
  }
  return results;
}

async function main(): Promise<number> {
  const options = commandLine();
  const serverUrl = process.env.RESTORE_TEST_SERVER_URL?.trim();
  if (!serverUrl) {
    throw new Error(
      "Set RESTORE_TEST_SERVER_URL to a superuser's address on the server to restore into, for example " +
        "postgres://postgres:<password>@127.0.0.1:5432/postgres. The test makes a database of its own there and drops it at the end."
    );
  }
  const server = parseDatabaseUrl(serverUrl, "RESTORE_TEST_SERVER_URL");
  const sourceUrl = process.env.SOURCE_DATABASE_URL?.trim();
  const source = sourceUrl ? parseDatabaseUrl(sourceUrl, "SOURCE_DATABASE_URL") : null;
  addresses.push(server, ...(source ? [source] : []));
  const hide = (text: string) => hidePassword(text, ...addresses);

  const dumpPath = options.dump ? path.resolve(options.dump) : newestDump(backupDir());
  if (!dumpPath) {
    throw new Error(
      `There is no backup in ${backupDir()} (files named dcrs-YYYY-MM-DD-HHmm.dump). Run npm run db:backup first, or name the dump: npm run db:restore-test -- <file>.`
    );
  }
  if (!existsSync(dumpPath)) throw new Error(`There is no file ${dumpPath}.`);
  const rolesPath = options.roles ? path.resolve(options.roles) : rolesFileFor(dumpPath);
  if (rolesPath && !existsSync(rolesPath)) throw new Error(`There is no file ${rolesPath}.`);

  const tools = findPgTools(["pg_restore"]);
  const pgRestore = tools.path("pg_restore");
  const listing = await runTool(pgRestore, ["--list", "--create", dumpPath], process.env);
  if (listing.code !== 0) throw new Error(`pg_restore cannot read ${dumpPath}. It said:\n    ${listing.stderr.trim()}`);
  const toc = parseToc(listing.stdout);

  console.log(`Restore test of ${dumpPath} (${formatBytes(statSync(dumpPath).size)})`);
  console.log(`  made ${toc.createdAt || "(time unknown)"} from the database "${toc.database}" (PostgreSQL ${toc.serverVersion || "?"})`);
  console.log(`  roles from ${rolesPath ?? "(no roles file beside the dump)"}`);
  console.log(`  with pg_restore ${toolVersion(pgRestore) || "(version unknown)"} from ${tools.dir}`);

  const admin = await connect(server);
  const stamp = stampOf(new Date()).replace(/^(\d{4})-(\d{2})-(\d{2})-(\d{4})$/, "$1$2$3_$4");
  const own = `restore_test_${stamp}_${randomBytes(2).toString("hex")}`;
  let ownCreated = false;
  const createdRoles: string[] = [];
  let db: pg.Client | null = null;
  let sourceClient: pg.Client | null = null;
  let scratch: string | null = null;
  const checks: Check[] = [];

  // Every step that names a database other than the admin connection's own goes through here.
  const ownDatabase = (name: string): string => {
    if (name !== own || !OWN_NAME.test(name)) throw new Error(`Refusing to touch the database "${name}": it is not this run's own throwaway database.`);
    return name;
  };

  let cleaning: Promise<string[]> | null = null;
  const cleanUp = (): Promise<string[]> =>
    (cleaning ??= (async () => {
      const said: string[] = [];
      for (const client of [db, sourceClient]) {
        try {
          await client?.end();
        } catch {
          /* already closed */
        }
      }
      if (ownCreated) {
        try {
          await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(ownDatabase(own))} WITH (FORCE)`);
          said.push(`dropped the database ${own}`);
        } catch (err) {
          said.push(`could NOT drop the database ${own} (${hide(messageOf(err))}); drop it by hand`);
        }
      }
      const droppedRoles: string[] = [];
      for (const role of [...createdRoles].reverse()) {
        try {
          await admin.query(`DROP ROLE IF EXISTS ${quoteIdent(role)}`);
          droppedRoles.push(role);
        } catch (err) {
          said.push(`could NOT drop the role ${role} this test made (${hide(messageOf(err))})`);
        }
      }
      if (droppedRoles.length) said.push(`dropped the ${count(droppedRoles.length, "role")} this test made (${plainList(droppedRoles)})`);
      try {
        await admin.end();
      } catch {
        /* already closed */
      }
      if (scratch) rmSync(scratch, { recursive: true, force: true });
      return said;
    })());
  process.once("SIGINT", () => {
    console.log("\nStopped. Cleaning up first...");
    void cleanUp().then((said) => {
      if (said.length) console.log(`Cleaned up: ${said.join("; ")}.`);
      process.exit(130);
    });
  });

  try {
    const me = await admin.query<{ superuser: boolean; version: string }>(
      "SELECT r.rolsuper AS superuser, current_setting('server_version') AS version FROM pg_roles r WHERE r.rolname = current_user"
    );
    if (!me.rows[0]?.superuser) {
      throw new Error(
        `RESTORE_TEST_SERVER_URL signs in as ${server.user}, which is not a superuser. The test makes roles and restores things owned by several roles, which needs a superuser.`
      );
    }
    console.log(`  into the new database ${own} on ${server.host}:${server.port} (PostgreSQL ${me.rows[0].version}), as ${server.user}`);
    const taken = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [own]);
    if (taken.rowCount) throw new Error(`A database named ${own} is already on the server. It is not this run's, so the test will not touch it. Run the test again.`);
    const leftovers = await admin.query<{ datname: string }>("SELECT datname FROM pg_database WHERE datname LIKE 'restore\\_test\\_%' ORDER BY 1");
    console.log("");
    if (leftovers.rows.length) {
      console.log(`Note: ${plainList(leftovers.rows.map((r) => r.datname))} ${leftovers.rows.length === 1 ? "is" : "are"} left from an earlier run that was cut off. Not touched; drop by hand when no test is running.`);
    }

    // 1. The roles the server lacks, from the roles file.
    if (rolesPath) {
      const file = parseRolesFile(readFileSync(rolesPath, "utf-8"));
      const present = new Set(
        (await admin.query<{ rolname: string }>("SELECT rolname FROM pg_roles WHERE rolname = ANY($1)", [file.roles])).rows.map((r) => r.rolname)
      );
      const missing = file.roles.filter((r) => !present.has(r));
      for (const sql of statementsForMissingRoles(file, new Set(missing))) {
        await admin.query(sql);
        if (/^CREATE\s+ROLE\s/i.test(sql)) {
          const made = readIdent(sql.replace(/^CREATE\s+ROLE\s+/i, ""));
          if (made) createdRoles.push(made[0]);
        }
      }
      const others = file.statements.filter((s) => s.kind === "other").length;
      if (missing.length) {
        console.log(
          `Roles: made ${plainList(missing)} from the roles file (${missing.length === 1 ? "it was" : "they were"} not on this server)` +
            (present.size ? `; ${plainList([...present])} ${present.size === 1 ? "was" : "were"} already there and left as ${present.size === 1 ? "it was" : "they were"}.` : ".") +
            " The roles made here are dropped again at the end."
        );
      } else {
        console.log(`Roles: all ${count(file.roles.length, "role")} in the roles file are already on this server; none was made or changed.`);
      }
      if (others) console.log(`  (${count(others, "other statement")} in the roles file, not about a missing role, ${others === 1 ? "was" : "were"} not run.)`);
    } else {
      console.log("Roles: no roles file, so no role was made. A role the dump names that this server lacks makes part of the restore fail.");
    }

    // 2. Its database, made as the dump describes, with the dump's own grants on it.
    let create = `CREATE DATABASE ${quoteIdent(own)} WITH TEMPLATE = template0 ENCODING = 'UTF8'`;
    const databaseLevel: string[] = [];
    const dbEntries = tocDatabaseEntries(toc);
    if (dbEntries.length) {
      scratch = mkdtempSync(path.join(os.tmpdir(), "dcrs-restore-test-"));
      const listFile = path.join(scratch, "database-entries.list");
      writeFileSync(listFile, dbEntries.map((e) => e.line).join("\n") + "\n");
      const script = await runTool(pgRestore, ["--create", "--schema-only", `--use-list=${listFile}`, "--file=-", dumpPath], process.env);
      if (script.code !== 0) throw new Error(`pg_restore could not read the database's own settings from the dump:\n    ${script.stderr.trim()}`);
      const statements = databaseStatements(script.stdout);
      const renamedCreate = statements.create ? renameDatabase(statements.create, toc.database, own) : null;
      if (renamedCreate) create = renamedCreate;
      for (const sql of statements.rest) {
        const renamed = renameDatabase(sql, toc.database, own);
        if (renamed) databaseLevel.push(renamed);
        else console.log(`  (Not run, as it does not name only the dump's own database: ${sql})`);
      }
    }
    let made = `as the dump describes it: ${create.replace(/^CREATE\s+DATABASE\s+\S+\s*(WITH\s+)?/i, "")}`;
    try {
      await admin.query(create);
    } catch (err) {
      if (codeOf(err) === "42P04") throw err; // the name was taken after all: not ours, never touched
      made = `with UTF8 and the C locale, as the dump's own settings for it cannot be used on this server (${hide(messageOf(err))})`;
      await admin.query(`CREATE DATABASE ${quoteIdent(own)} WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'C'`);
    }
    ownCreated = true;
    const applied: string[] = [];
    const refused: string[] = [];
    for (const sql of databaseLevel) {
      try {
        await admin.query(sql);
        applied.push(sql);
      } catch (err) {
        refused.push(`${sql}: ${hide(messageOf(err))}`);
      }
    }
    console.log(`Database: made ${ownDatabase(own)} ${made}.`);
    if (applied.length) console.log(`  with the dump's own statements about the database: ${applied.join("; ")}.`);
    if (refused.length) checks.push({ ok: false, title: "Some of the dump's own statements about the database failed here:", details: refused });

    // 3. Everything else.
    const target = withDatabase(server, ownDatabase(own));
    const restore = await runTool(pgRestore, ["--no-password", `--dbname=${target.forTools}`, dumpPath], toolEnv(target, APP));
    const said = hide(restore.stderr)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const errors = said.filter((l) => /\berror:/i.test(l));
    checks.push(
      restore.code === 0
        ? { ok: true, title: `The restore ran without an error (${(restore.ms / 1000).toFixed(1)} s).`, details: [] }
        : { ok: false, title: `The restore reported ${count(errors.length || 1, "error")} (pg_restore exited ${restore.code}).`, details: said.slice(0, 12) }
    );

    db = await connect(target);

    // The schemas.
    const dumpSchemas = tocSchemas(toc);
    const wanted = ["public", "chatbot", "overview"];
    const expected = [...wanted.filter((s) => dumpSchemas.includes(s)), ...dumpSchemas.filter((s) => !wanted.includes(s))];
    const notInDump = wanted.filter((s) => !dumpSchemas.includes(s));
    const schemasHere = new Set((await db.query<{ nspname: string }>("SELECT nspname FROM pg_namespace")).rows.map((r) => r.nspname));
    const missingSchemas = expected.filter((s) => !schemasHere.has(s));
    checks.push({
      ok: missingSchemas.length === 0,
      title: missingSchemas.length ? `The schema ${plainList(missingSchemas)} is missing from the restore.` : `The schemas ${plainList(expected)} are there.`,
      details: notInDump.length ? [`The dump has no schema ${plainList(notInDump)}: the shared-database setup had not been applied to the database it came from.`] : [],
    });

    // Every table, and its rows.
    if (source) {
      try {
        sourceClient = await connect(source);
        await sourceClient.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
      } catch (err) {
        sourceClient = null;
        console.log(`Note: the source ${source.shown} could not be reached (${hide(messageOf(err))}); the restore's own counts are shown.`);
      }
      if (sourceClient && source.database !== toc.database) {
        console.log(`Note: SOURCE_DATABASE_URL names the database "${source.database}", but the dump was made from "${toc.database}".`);
      }
    }
    const rows: string[] = [];
    const differences: string[] = [];
    const absent: string[] = [];
    let notCompared = 0;
    const tables = tocTables(toc);
    const width = Math.max(0, ...tables.map((t) => `${t.schema}.${t.name}`.length));
    for (const t of tables) {
      const qualified = `${quoteIdent(t.schema)}.${quoteIdent(t.name)}`;
      const label = `${t.schema}.${t.name}`.padEnd(width);
      let here: string;
      try {
        here = String((await db.query<{ n: string }>(`SELECT count(*)::bigint AS n FROM ${qualified}`)).rows[0].n);
      } catch (err) {
        absent.push(`${t.schema}.${t.name} (${messageOf(err)})`);
        rows.push(`${label}  MISSING: ${messageOf(err)}`);
        continue;
      }
      const inRestore = `${here.padStart(9)} ${here === "1" ? "row " : "rows"}`;
      if (!sourceClient) {
        rows.push(`${label}  ${inRestore}`);
        continue;
      }
      try {
        const there = String((await sourceClient.query<{ n: string }>(`SELECT count(*)::bigint AS n FROM ${qualified}`)).rows[0].n);
        if (there === here) rows.push(`${label}  ${inRestore}, as in the source`);
        else {
          differences.push(`${t.schema}.${t.name}`);
          rows.push(`${label}  ${inRestore}, but ${there} in the source: DIFFERENT`);
        }
      } catch (err) {
        notCompared++;
        rows.push(`${label}  ${inRestore} (not counted in the source: ${hide(messageOf(err))})`);
      }
    }
    const tablesOk = absent.length === 0 && differences.length === 0;
    checks.push({
      ok: tablesOk,
      title: absent.length
        ? `${count(absent.length, "table")} of the dump ${absent.length === 1 ? "is" : "are"} missing from the restore.`
        : differences.length
          ? `${count(differences.length, "table")} ${differences.length === 1 ? "has" : "have"} a different number of rows from the source: ${plainList(differences)}. ` +
            `If the source has been used since the backup was made (${toc.createdAt}), make a new backup and run this test straight after it.`
          : sourceClient
            ? `All ${count(tables.length, "table")} are there, with as many rows as the source ${source?.shown}${notCompared ? ` (${notCompared} not counted in the source)` : ""}.`
            : `All ${count(tables.length, "table")} of the dump are there${source ? "" : " (no SOURCE_DATABASE_URL to compare with)"}; their rows:`,
      details: rows,
    });

    // The overview views, as the viewer.
    const views = (
      await db.query<{ relname: string }>(
        "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'overview' AND c.relkind IN ('v', 'm') ORDER BY 1"
      )
    ).rows.map((r) => r.relname);
    const lostViews = tocViews(toc, "overview").filter((v) => !views.includes(v));
    const viewerExists = ((await db.query("SELECT 1 FROM pg_roles WHERE rolname = 'overview_viewer'")).rowCount ?? 0) > 0;
    if (!views.length && !lostViews.length) {
      checks.push({ ok: null, title: "The dump has no overview views (parts 2 and 3 of the shared-database setup were not applied to its database), so there are none to ask.", details: [] });
    } else if (!viewerExists) {
      checks.push({ ok: false, title: "The role overview_viewer is not on this server, so the overview views cannot be read as it.", details: [] });
    } else {
      const answers = await asRole(
        db,
        "overview_viewer",
        views.map((v) => ({ label: v, sql: `SELECT count(*)::bigint AS n FROM overview.${quoteIdent(v)}` }))
      );
      const failed = answers.filter((a) => a.error);
      const vw = Math.max(0, ...views.map((v) => v.length));
      checks.push({
        ok: failed.length === 0 && lostViews.length === 0,
        title: lostViews.length
          ? `${count(lostViews.length, "overview view")} of the dump ${lostViews.length === 1 ? "is" : "are"} missing from the restore: ${plainList(lostViews)}.`
          : failed.length
            ? `${count(failed.length, "overview view")} of ${views.length} did not answer as overview_viewer.`
            : `All ${count(views.length, "overview view")} answer as overview_viewer:`,
        details: answers.map((a) =>
          a.error
            ? `${a.label.padEnd(vw)}  FAILED: ${messageOf(a.error)}`
            : `${a.label.padEnd(vw)}  ${String(a.rows?.[0]?.n ?? "?").padStart(7)} ${String(a.rows?.[0]?.n) === "1" ? "row " : "rows"}  (${a.ms} ms)`
        ),
      });
    }

    // The Audit Assistant's role, locked out of DCRS's data, and still able to start.
    const assistantExists = ((await db.query("SELECT 1 FROM pg_roles WHERE rolname = 'audit_assistant'")).rowCount ?? 0) > 0;
    const hasChatbot = dumpSchemas.includes("chatbot");
    if (!assistantExists) {
      checks.push(
        hasChatbot
          ? { ok: false, title: "The role audit_assistant is not on this server, though the dump has the schema chatbot.", details: [] }
          : { ok: null, title: "There is no role audit_assistant here, and the dump has no schema chatbot: nothing to check for the Audit Assistant.", details: [] }
      );
    } else {
      const dcrsTables = (
        await db.query<{ relname: string }>(
          "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f') ORDER BY 1"
        )
      ).rows.map((r) => r.relname);
      const attempts = await asRole(db, "audit_assistant", [
        ...dcrsTables.map((t) => ({ label: `public.${t}`, sql: `SELECT 1 FROM public.${quoteIdent(t)} LIMIT 1` })),
        ...views.map((v) => ({ label: `overview.${v}`, sql: `SELECT 1 FROM overview.${quoteIdent(v)} LIMIT 1` })),
      ]);
      const readable = attempts.filter((a) => !a.error).map((a) => a.label);
      const oddErrors = attempts.filter((a) => a.error && codeOf(a.error) !== "42501").map((a) => `${a.label}: ${messageOf(a.error)}`);
      checks.push({
        ok: readable.length === 0 && oddErrors.length === 0,
        title: readable.length
          ? `audit_assistant CAN READ ${plainList(readable)}: it must not.`
          : oddErrors.length
            ? "audit_assistant was stopped from reading, but not always by a permission check:"
            : `audit_assistant cannot read any of DCRS's ${count(dcrsTables.length, "table")}` +
              (views.length ? `, nor any of the ${count(views.length, "overview view")}` : "") +
              ": permission denied on each.",
        details: oddErrors,
      });
      if (hasChatbot) {
        const start = await asRole(db, "audit_assistant", [{ label: "chatbot", sql: "CREATE SCHEMA IF NOT EXISTS chatbot" }]);
        const error = start[0]?.error;
        checks.push(
          error
            ? {
                ok: false,
                title: `audit_assistant cannot run CREATE SCHEMA IF NOT EXISTS chatbot (${messageOf(error)}), so the Audit Assistant would not start on this database.`,
                details: [
                  "The database's own grants come back with pg_restore --create, or by running database/sql/01-schemas-and-roles.sql again after the restore.",
                ],
              }
            : { ok: true, title: "audit_assistant can still run CREATE SCHEMA IF NOT EXISTS chatbot, as the Audit Assistant does at every start.", details: [] }
        );
      }
    }
  } catch (err) {
    checks.push({ ok: false, title: `The test stopped: ${hide(messageOf(err))}`, details: [] });
  }

  const cleaned = await cleanUp();

  console.log("");
  console.log("Checks");
  for (const c of checks) {
    console.log(`  ${c.ok === true ? "OK    " : c.ok === false ? "FAILED" : "NOTE  "}  ${c.title}`);
    for (const d of c.details) console.log(`            ${d}`);
  }
  console.log("");
  if (cleaned.length) console.log(`Cleaned up: ${cleaned.join("; ")}.`);
  const failed = checks.filter((c) => c.ok === false).length;
  const passed = checks.filter((c) => c.ok === true).length;
  if (failed === 0 && passed > 0) {
    console.log(`RESULT: PASSED. The backup made ${toc.createdAt || ""} restores completely on ${server.host}:${server.port}.`);
    return 0;
  }
  console.log(`RESULT: FAILED. ${count(failed, "check")} of ${checks.length} failed (above).`);
  return 1;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(`The restore test could not run. ${hidePassword(messageOf(err), ...addresses)}`);
    process.exit(1);
  }
);
