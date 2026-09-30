// BACKS UP THE SHARED DATABASE (REQUIREMENTS §83): `npm run db:backup`.
//
// DCRS and the Audit Assistant keep their data in one PostgreSQL database:
// DCRS in the schema public, the assistant in chatbot, the readable views in
// overview. So one backup holds both applications. It writes two files:
//
//   dcrs-YYYY-MM-DD-HHmm.dump   the whole database (pg_dump --format=custom):
//                               every schema, table, row, view, owner and grant
//   roles-YYYY-MM-DD-HHmm.sql   the server's roles (pg_dumpall --roles-only
//                               --no-role-passwords). A dump holds no roles, but
//                               its owners and grants name them, so a restore on
//                               a new server makes them first. No passwords.
//
// WHICH DATABASE: BACKUP_DATABASE_URL, else DATABASE_URL (the one DCRS uses),
// else this computer's own local database, found the way backend/db.ts finds
// it (127.0.0.1, port EMBEDDED_PG_PORT or 5433, the database dcrs, the
// password in backend/data/postgres-password). Each may be set in backend/.env,
// which is read the way the server reads it (a real environment variable
// wins). The role must be able to read BOTH applications' tables: a superuser,
// or a role given pg_read_all_data. DCRS's own role cannot read the
// assistant's tables, so a deployment where DCRS signs in with a role of its
// own sets BACKUP_DATABASE_URL.
//
// WHERE, AND FOR HOW LONG: backend/data/backups, or the folder BACKUP_DIR names.
// After a successful backup its own files older than 14 days are deleted: only
// files named as above, never anything else in the folder, and nothing at all
// when the backup failed. Every run adds a line to backup-log.txt in the same
// folder, so a backup that runs by itself (scripts/database/schedule-backup.ps1)
// can be checked afterwards.
//
// THE TOOLS: pg_dump, pg_dumpall and pg_restore, all from one folder: PG_BIN,
// else PATH, else C:\Program Files\PostgreSQL\<version>\bin, newest first. The
// password reaches them in PGPASSWORD, never on their command line, and is
// never printed or logged.
//
// Restoring, and testing a restore (scripts/database/restore-test.ts):
// docs/DEPLOYMENT.md, "Backups of the shared database".
import "../../backend/env.ts";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { dataDir } from "../../backend/paths.ts";
import {
  KEEP_DAYS,
  backupDir,
  count,
  findPgTools,
  formatBytes,
  hidePassword,
  oldBackupFiles,
  parseDatabaseUrl,
  parseRolesFile,
  parseToc,
  plainList,
  runTool,
  stampOf,
  toolEnv,
  toolVersion,
  tocSchemas,
  type DatabaseAddress,
  type Toc,
  type ToolResult,
} from "./backup-common.ts";

interface Source {
  address: DatabaseAddress;
  /** Where the address came from, in words. */
  from: string;
  /** This computer's own local database (DATABASE_URL not set). */
  local: boolean;
}

function databaseToBackUp(): Source {
  const backupUrl = process.env.BACKUP_DATABASE_URL?.trim();
  if (backupUrl) return { address: parseDatabaseUrl(backupUrl, "BACKUP_DATABASE_URL"), from: "BACKUP_DATABASE_URL", local: false };
  const url = process.env.DATABASE_URL?.trim();
  if (url) return { address: parseDatabaseUrl(url, "DATABASE_URL"), from: "DATABASE_URL", local: false };
  // Built the way backend/db.ts builds it (embeddedDatabaseUrl): the local
  // PostgreSQL that DCRS starts on this computer when DATABASE_URL is not set.
  const passwordFile = path.join(dataDir, "postgres-password");
  if (!existsSync(passwordFile)) {
    throw new Error(
      `There is nothing to back up: DATABASE_URL is not set, and this computer has no local DCRS database (${passwordFile} is missing). ` +
        `Set DATABASE_URL, or BACKUP_DATABASE_URL, to the database to back up.`
    );
  }
  const password = readFileSync(passwordFile, "utf-8").trim();
  const port = Number(process.env.EMBEDDED_PG_PORT ?? 5433);
  return {
    address: parseDatabaseUrl(`postgres://postgres:${password}@127.0.0.1:${port}/dcrs`, "The local database's address"),
    from: "this computer's own DCRS database, as DATABASE_URL is not set",
    local: true,
  };
}

/** A plain reason for the usual failures, from what the tool said. */
function hint(said: string, source: Source): string {
  const a = source.address;
  if (/connection refused|could not connect|no connection could be made|timeout expired|timed out|could not translate host name/i.test(said)) {
    return source.local
      ? `The local DCRS database is not running. It starts with DCRS (npm run dev or npm start) and keeps running after DCRS stops.`
      : `Nothing answered at ${a.host}:${a.port}. Check that the database server is running and that the address is right.`;
  }
  if (/password authentication failed|no password supplied/i.test(said)) return `The server refused the password for the role ${a.user}.`;
  if (/server version mismatch/i.test(said)) return `These tools are older than the database server. Set PG_BIN to the bin folder of a PostgreSQL at least as new as the server.`;
  if (/permission denied/i.test(said)) {
    return (
      `The role ${a.user} may not read everything in the database. A backup has to read both applications' tables: ` +
      `set BACKUP_DATABASE_URL to a superuser, or to a role given pg_read_all_data.`
    );
  }
  if (/database ".*" does not exist/i.test(said)) return `There is no database "${a.database}" on that server.`;
  return "";
}

function toolFailure(tool: string, result: ToolResult, source: Source): Error {
  const said = result.stderr.trim() || result.stdout.trim();
  const lines = hidePassword(said, source.address)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 8);
  const reason = hint(said, source);
  return new Error(
    `${tool} did not finish (exit code ${result.code}).` +
      (lines.length ? ` It said:\n${lines.map((l) => `    ${l}`).join("\n")}` : " It said nothing.") +
      (reason ? `\n${reason}` : "")
  );
}

/** Renames the finished file into place; a virus scanner may hold a new file for a moment. */
async function moveInto(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      renameSync(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= 5 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) throw err;
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
}

/** "public (11 tables), chatbot (11 tables) and overview (13 views)". */
function describeDump(toc: Toc): string {
  return plainList(
    tocSchemas(toc).map((schema) => {
      const tables = toc.entries.filter((e) => e.kind === "TABLE" && e.schema === schema).length;
      const views = toc.entries.filter((e) => (e.kind === "VIEW" || e.kind === "MATERIALIZED VIEW") && e.schema === schema).length;
      const parts = [tables ? count(tables, "table") : "", views ? count(views, "view") : ""].filter(Boolean);
      return `${schema} (${parts.length ? plainList(parts) : "empty"})`;
    })
  );
}

function logLine(dir: string, line: string): void {
  try {
    mkdirSync(dir, { recursive: true });
    appendFileSync(path.join(dir, "backup-log.txt"), line.replace(/\s*\r?\n\s*/g, " / ") + "\n");
  } catch {
    /* the folder itself is the trouble, and that has been printed */
  }
}

async function main(): Promise<number> {
  const started = new Date();
  const when = stampOf(started).replace(/^(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})$/, "$1 $2:$3");
  const dir = backupDir();
  let source: Source | null = null;
  try {
    source = databaseToBackUp();
    const a = source.address;
    const tools = findPgTools(["pg_dump", "pg_dumpall", "pg_restore"]);
    const version = toolVersion(tools.path("pg_dump"));
    console.log(`Backing up the database "${a.database}" on ${a.host}:${a.port} as ${a.user || "(default user)"}: ${source.from}.`);
    console.log(`With the PostgreSQL ${version || "(version unknown)"} tools in ${tools.dir} (found through ${tools.foundBy}).`);

    mkdirSync(dir, { recursive: true });
    const stamp = stampOf(started);
    const dumpName = `dcrs-${stamp}.dump`;
    const rolesName = `roles-${stamp}.sql`;
    const dumpPath = path.join(dir, dumpName);
    const rolesPath = path.join(dir, rolesName);
    if (existsSync(dumpPath) || existsSync(rolesPath)) {
      throw new Error(`A backup made in this same minute is already in ${dir} (${dumpName}). Nothing was overwritten; run it again in a minute.`);
    }
    const env = toolEnv(a, "DCRS backup");

    // 1. The database, written under a temporary name until it is complete.
    const dumpPartial = `${dumpPath}.partial`;
    const dump = await runTool(tools.path("pg_dump"), ["--format=custom", "--no-password", `--file=${dumpPartial}`, `--dbname=${a.forTools}`], env);
    if (dump.code !== 0) {
      rmSync(dumpPartial, { force: true });
      throw toolFailure("pg_dump", dump, source);
    }
    await moveInto(dumpPartial, dumpPath);

    // 2. What it holds, read back from the file itself.
    const list = await runTool(tools.path("pg_restore"), ["--list", dumpPath], process.env);
    if (list.code !== 0) throw toolFailure("pg_restore --list (reading the new dump back)", list, source);
    const toc = parseToc(list.stdout);
    const holds = describeDump(toc);
    const schemas = tocSchemas(toc);
    const lacking = ["chatbot", "overview"].filter((s) => !schemas.includes(s));

    // 3. The roles. pg_dumpall reads them from pg_roles (--no-role-passwords),
    // which any role may read, so this needs no superuser.
    const rolesPartial = `${rolesPath}.partial`;
    const roles = await runTool(
      tools.path("pg_dumpall"),
      ["--roles-only", "--no-role-passwords", "--no-password", `--file=${rolesPartial}`, `--dbname=${a.forTools}`, `--database=${a.database}`],
      env
    );
    if (roles.code !== 0) {
      rmSync(rolesPartial, { force: true });
      const failure = toolFailure("pg_dumpall", roles, source);
      console.log("");
      console.log(`The database was backed up to ${dumpPath} (${formatBytes(statSync(dumpPath).size)}), but its roles were NOT:`);
      console.log(failure.message);
      console.log(
        `A restore on a new server needs the roles first. Without this file, make them by hand ` +
          `(database/sql/01-schemas-and-roles.sql makes audit_assistant, overview_viewer and overview_owner). No older backup was deleted.`
      );
      logLine(dir, `${when}  FAILED  ${dumpName} written, but not its roles, from ${a.shown}: ${failure.message}`);
      return 1;
    }
    await moveInto(rolesPartial, rolesPath);
    const roleNames = parseRolesFile(readFileSync(rolesPath, "utf-8")).roles;

    // 4. Fourteen days kept: only now that both files are safely written.
    const old = oldBackupFiles(readdirSync(dir), started, KEEP_DAYS, new Set([dumpName, rolesName]));
    const deleted: string[] = [];
    const notDeleted: string[] = [];
    for (const name of old) {
      try {
        rmSync(path.join(dir, name), { force: true });
        deleted.push(name);
      } catch (err) {
        notDeleted.push(`${name} (${(err as Error).message})`);
      }
    }

    const dumpSize = formatBytes(statSync(dumpPath).size);
    console.log("");
    console.log("Done. The backup is complete.");
    console.log(`  The database:  ${dumpPath}  (${dumpSize}, ${(dump.ms / 1000).toFixed(1)} s)`);
    console.log(`                 It holds the schemas ${holds}.`);
    console.log(`  The roles:     ${rolesPath}  (${count(roleNames.length, "role")}: ${plainList(roleNames)}; no passwords)`);
    console.log(
      `  Kept for ${KEEP_DAYS} days: ${deleted.length ? `deleted ${count(deleted.length, "older file")}: ${plainList(deleted)}.` : "no older file to delete."}`
    );
    if (notDeleted.length) console.log(`  Could not delete: ${notDeleted.join("; ")}.`);
    if (lacking.length) {
      console.log(
        `  Note: the database has no schema ${plainList(lacking)} yet: the shared-database setup (npm run db:shared -- setup) has not been applied to it.`
      );
    }
    console.log(`To restore it, or to test a restore: docs/DEPLOYMENT.md, "Backups of the shared database".`);
    logLine(
      dir,
      `${when}  OK      ${dumpName} (${dumpSize}; ${holds}) and ${rolesName} (${count(roleNames.length, "role")}) from ${a.shown}. ` +
        `Deleted ${count(deleted.length, "older file")}${deleted.length ? `: ${deleted.join(", ")}` : ""}.`
    );
    return 0;
  } catch (err) {
    const message = hidePassword(err instanceof Error ? err.message : String(err), source?.address);
    console.error("");
    console.error(`The backup FAILED. ${message}`);
    console.error("Nothing older was deleted.");
    logLine(dir, `${when}  FAILED  ${source ? `from ${source.address.shown}: ` : ""}${message}`);
    return 1;
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  }
);
