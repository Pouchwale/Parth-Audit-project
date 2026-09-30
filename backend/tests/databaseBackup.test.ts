// The backup and the restore test of the shared database (REQUIREMENTS §83;
// scripts/database/backup.ts, scripts/database/restore-test.ts): the parts that
// need no database. Which files the 14 days of keeping deletes (only our own,
// only old ones), that a password never reaches a tool's command line or a
// message, that only MISSING roles are made from a roles file, and that a
// statement about a database is renamed to the test's own database or not run
// at all. The samples are what PostgreSQL 18's tools wrote on 30-Sep-2026.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  backupDir,
  databaseStatements,
  findPgTools,
  hidePassword,
  newestDump,
  oldBackupFiles,
  parseDatabaseUrl,
  parseRolesFile,
  parseToc,
  readIdent,
  renameDatabase,
  repoRoot,
  rolesFileFor,
  splitSql,
  stampOf,
  stampTime,
  statementsForMissingRoles,
  tocDatabaseEntries,
  tocSchemas,
  tocTables,
  tocViews,
  withDatabase,
} from "../../scripts/database/backup-common.ts";

const ROLES_FILE = [
  "--",
  "-- PostgreSQL database cluster dump",
  "--",
  "",
  "\\restrict djWhPhXWz0dQCRrfC0UZHLvJHhmzjq4rTZ34KD13JO12c2zkFOJ6jN8laklgHOS",
  "",
  "SET default_transaction_read_only = off;",
  "",
  "SET client_encoding = 'UTF8';",
  "SET standard_conforming_strings = on;",
  "",
  "--",
  "-- Roles",
  "--",
  "",
  "CREATE ROLE audit_assistant;",
  "ALTER ROLE audit_assistant WITH NOSUPERUSER NOINHERIT NOCREATEROLE NOCREATEDB LOGIN NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 20;",
  "COMMENT ON ROLE audit_assistant IS 'The Audit Assistant server''s login; it never reads DCRS''s tables -- ever.';",
  "CREATE ROLE dcrs_backup;",
  "ALTER ROLE dcrs_backup WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB LOGIN NOREPLICATION NOBYPASSRLS;",
  "CREATE ROLE overview_viewer;",
  "ALTER ROLE overview_viewer WITH NOSUPERUSER NOINHERIT NOCREATEROLE NOCREATEDB LOGIN NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5;",
  'CREATE ROLE "Plant ""QA"" lead";',
  'ALTER ROLE "Plant ""QA"" lead" WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB NOLOGIN NOREPLICATION NOBYPASSRLS;',
  "CREATE ROLE postgres;",
  "ALTER ROLE postgres WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS;",
  "",
  "--",
  "-- User Configurations",
  "--",
  "",
  "ALTER ROLE audit_assistant SET statement_timeout TO '30s';",
  "ALTER ROLE audit_assistant SET search_path TO 'chatbot';",
  "ALTER ROLE overview_viewer SET default_transaction_read_only TO 'on';",
  "",
  "--",
  "-- Role memberships",
  "--",
  "",
  "GRANT pg_read_all_data TO dcrs_backup WITH INHERIT TRUE GRANTED BY postgres;",
  'GRANT overview_viewer TO "Plant ""QA"" lead" WITH INHERIT TRUE GRANTED BY postgres;',
  "GRANT SET ON PARAMETER work_mem TO overview_viewer;",
  "",
  "\\unrestrict djWhPhXWz0dQCRrfC0UZHLvJHhmzjq4rTZ34KD13JO12c2zkFOJ6jN8laklgHOS",
  "",
  "--",
  "-- PostgreSQL database cluster dump complete",
  "--",
  "",
].join("\n");

const TOC_LISTING = [
  ";",
  "; Archive created at 2026-09-30 09:26:11",
  ";     dbname: dcrs_restore_source",
  ";     TOC Entries: 180",
  ";     Compression: gzip",
  ";     Format: CUSTOM",
  ";     Dumped from database version: 18.6",
  ";     Dumped by pg_dump version: 18.6",
  ";",
  "; Selected TOC Entries:",
  ";",
  "5317; 1262 16388 DATABASE - dcrs_restore_source postgres",
  "5318; 0 0 ACL - DATABASE dcrs_restore_source postgres",
  "7; 2615 16687 SCHEMA - chatbot audit_assistant",
  "5320; 0 0 ACL - SCHEMA chatbot audit_assistant",
  "8; 2615 16688 SCHEMA - overview postgres",
  "2; 3079 16389 EXTENSION - pg_trgm ",
  "236; 1259 16690 TABLE chatbot __drizzle_migrations audit_assistant",
  "237; 1259 16700 TABLE chatbot actions audit_assistant",
  "228; 1259 16540 TABLE public app_storage postgres",
  "233; 1259 16598 TABLE public users postgres",
  "300; 1259 17001 VIEW overview findings postgres",
  "301; 1259 17002 VIEW overview people overview_owner",
  "5293; 0 16540 TABLE DATA public app_storage postgres",
  "5327; 0 0 SEQUENCE SET chatbot __drizzle_migrations_id_seq audit_assistant",
  "5400; 0 0 COMMENT - VIEW findings postgres",
].join("\n");

// pg_restore --create --schema-only --use-list=<the database's own entries> --file=-
const DATABASE_SCRIPT = [
  "--",
  "-- PostgreSQL database dump",
  "--",
  "\\restrict mWUsQPIUfTX3L6FxMjj0WTE3ZohRA9C5UZzqcFcv9BJrq9gRAFy2uajJb7bXaOq",
  "SET statement_timeout = 0;",
  "SET client_encoding = 'UTF8';",
  "SELECT pg_catalog.set_config('search_path', '', false);",
  "--",
  "-- Name: dcrs; Type: DATABASE; Schema: -; Owner: postgres",
  "--",
  "CREATE DATABASE dcrs WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'C';",
  "",
  "ALTER DATABASE dcrs OWNER TO postgres;",
  "\\unrestrict mWUsQPIUfTX3L6FxMjj0WTE3ZohRA9C5UZzqcFcv9BJrq9gRAFy2uajJb7bXaOq",
  "\\connect dcrs",
  "\\restrict mWUsQPIUfTX3L6FxMjj0WTE3ZohRA9C5UZzqcFcv9BJrq9gRAFy2uajJb7bXaOq",
  "SET statement_timeout = 0;",
  "--",
  "-- Name: DATABASE dcrs; Type: ACL; Schema: -; Owner: postgres",
  "--",
  "GRANT CREATE,CONNECT ON DATABASE dcrs TO audit_assistant;",
  "GRANT CONNECT ON DATABASE dcrs TO overview_viewer;",
  "\\unrestrict mWUsQPIUfTX3L6FxMjj0WTE3ZohRA9C5UZzqcFcv9BJrq9gRAFy2uajJb7bXaOq",
  "",
].join("\n");

test("a database address: the password is kept apart from what the tools are given, and never shown", () => {
  const a = parseDatabaseUrl("postgres://dcrs:s3cr%40t-pass@db-host:5432/dcrs?sslmode=require", "DATABASE_URL");
  assert.equal(a.password, "s3cr@t-pass");
  assert.equal(a.forTools, "postgres://dcrs@db-host:5432/dcrs?sslmode=require");
  assert.equal(a.shown, "dcrs@db-host:5432/dcrs");
  assert.equal(a.database, "dcrs");
  assert.ok(!a.forTools.includes("s3cr"));

  // libpq also takes the password as an option.
  const b = parseDatabaseUrl("postgresql://viewer@127.0.0.1/dcrs?password=hunter22&sslmode=disable", "X");
  assert.equal(b.password, "hunter22");
  assert.equal(b.forTools, "postgresql://viewer@127.0.0.1/dcrs?sslmode=disable");
  assert.equal(b.port, "5432");

  // Another database on the same server, the password still apart.
  const c = withDatabase(a, "restore_test_20260930_2030_ab12");
  assert.equal(c.forTools, "postgres://dcrs@db-host:5432/restore_test_20260930_2030_ab12?sslmode=require");
  assert.equal(c.password, "s3cr@t-pass");
  assert.match(c.full, /^postgres:\/\/dcrs:s3cr%40t-pass@db-host:5432\/restore_test_20260930_2030_ab12\?sslmode=require$/);

  assert.equal(hidePassword("auth failed for s3cr@t-pass here", a), "auth failed for ******** here");
  assert.throws(() => parseDatabaseUrl("host=db user=dcrs password=zzz", "DATABASE_URL"), (err: Error) => /DATABASE_URL/.test(err.message) && !err.message.includes("zzz"));
  assert.throws(() => parseDatabaseUrl("mysql://u:p@h/db", "DATABASE_URL"), /postgres:\/\//);
});

test("backups go to backend/data/backups unless BACKUP_DIR says otherwise", () => {
  assert.equal(backupDir({}), path.join(repoRoot, "backend", "data", "backups"));
  const elsewhere = path.join(os.tmpdir(), "dcrs-backups-elsewhere");
  assert.equal(backupDir({ BACKUP_DIR: ` ${elsewhere} ` }), path.resolve(elsewhere));
});

test("file names carry the time, on this computer's clock", () => {
  assert.equal(stampOf(new Date(2026, 8, 30, 20, 30)), "2026-09-30-2030");
  assert.equal(stampOf(new Date(2026, 0, 5, 7, 4)), "2026-01-05-0704");
  assert.deepEqual(stampTime("dcrs-2026-09-30-2030.dump"), new Date(2026, 8, 30, 20, 30));
  assert.deepEqual(stampTime("roles-2026-09-30-2030.sql.partial"), new Date(2026, 8, 30, 20, 30));
  for (const other of ["dcrs-before-demo-removal-2026-09-19.dump", "dcrs-2026-02-31-2030.dump", "dcrs-2026-09-30-2460.dump", "dcrs-2026-09-30-2030.dump.bak", "notes.txt", "DCRS-2026-09-30-2030.dump"]) {
    assert.equal(stampTime(other), null, other);
  }
});

test("fourteen days are kept, and only our own files are ever deleted", () => {
  const now = new Date(2026, 8, 30, 20, 30);
  const names = [
    "dcrs-2026-09-30-2030.dump", // this run's
    "roles-2026-09-30-2030.sql", // this run's
    "dcrs-2026-09-16-2030.dump", // exactly 14 days: kept
    "roles-2026-09-16-2030.sql",
    "dcrs-2026-09-16-2029.dump", // a minute more: deleted
    "dcrs-2026-09-01-2030.dump", // deleted
    "roles-2026-09-01-2030.sql", // deleted
    "dcrs-2026-09-01-2030.dump.partial", // unfinished, a month old: deleted
    "roles-2026-09-30-0900.sql.partial", // unfinished, today: kept (it may still be being written)
    "dcrs-before-demo-removal-2026-09-19.dump", // somebody's own: never
    "dcrs-2020-01-01-0000.dump.bak", // not ours: never
    "backup-log.txt",
    "notes.txt",
  ];
  const keep = new Set(["dcrs-2026-09-30-2030.dump", "roles-2026-09-30-2030.sql"]);
  assert.deepEqual(oldBackupFiles(names, now, 14, keep).sort(), [
    "dcrs-2026-09-01-2030.dump",
    "dcrs-2026-09-01-2030.dump.partial",
    "dcrs-2026-09-16-2029.dump",
    "roles-2026-09-01-2030.sql",
  ]);
  // The files in `keep` are never chosen, however old.
  assert.deepEqual(oldBackupFiles(["dcrs-2025-01-01-2030.dump"], now, 14, new Set(["dcrs-2025-01-01-2030.dump"])), []);
});

test("the newest backup, and the roles file made with it", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "dcrs-backup-test-"));
  try {
    assert.equal(newestDump(dir), null);
    assert.equal(newestDump(path.join(dir, "not-there")), null);
    for (const name of ["dcrs-2026-09-29-2030.dump", "roles-2026-09-29-2030.sql", "dcrs-2026-09-30-2030.dump", "dcrs-2026-10-01-0100.dump.partial", "dcrs-zzz.dump"]) {
      writeFileSync(path.join(dir, name), "x");
    }
    assert.equal(newestDump(dir), path.join(dir, "dcrs-2026-09-30-2030.dump"));
    assert.equal(rolesFileFor(path.join(dir, "dcrs-2026-09-29-2030.dump")), path.join(dir, "roles-2026-09-29-2030.sql"));
    assert.equal(rolesFileFor(path.join(dir, "dcrs-2026-09-30-2030.dump")), null); // no roles file beside it
    assert.equal(rolesFileFor(path.join(dir, "dcrs-zzz.dump")), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("SQL splits into statements: comments and psql's own commands left out, quoted text kept whole", () => {
  assert.deepEqual(
    splitSql(
      [
        "\\restrict abc",
        "-- a comment; with a semicolon",
        "SET a = 'x;y';",
        "COMMENT ON ROLE r IS 'it''s -- not a comment; really';",
        'CREATE ROLE "odd;name";',
        "DO $$ BEGIN PERFORM 1; END $$;",
        "SELECT $tag$ ; $tag$ AS t; -- trailing",
        "\\unrestrict abc",
        "",
      ].join("\n")
    ),
    ["SET a = 'x;y'", "COMMENT ON ROLE r IS 'it''s -- not a comment; really'", 'CREATE ROLE "odd;name"', "DO $$ BEGIN PERFORM 1; END $$", "SELECT $tag$ ; $tag$ AS t"]
  );
  assert.deepEqual(readIdent(' "Plant ""QA"" lead" WITH'), ['Plant "QA" lead', " WITH"]);
  assert.deepEqual(readIdent("Audit_Assistant TO x"), ["audit_assistant", " TO x"]);
});

test("the roles file: only the roles a server lacks are made, and nothing about a role it has", () => {
  const file = parseRolesFile(ROLES_FILE);
  assert.deepEqual(file.roles, ["audit_assistant", "dcrs_backup", "overview_viewer", 'Plant "QA" lead', "postgres"]);
  assert.deepEqual(
    file.statements.filter((s) => s.kind === "other").map((s) => s.sql),
    ["GRANT SET ON PARAMETER work_mem TO overview_viewer"]
  );

  // A server that has postgres and overview_viewer already.
  assert.deepEqual(statementsForMissingRoles(file, new Set(["audit_assistant", "dcrs_backup", 'Plant "QA" lead'])), [
    "CREATE ROLE audit_assistant",
    "ALTER ROLE audit_assistant WITH NOSUPERUSER NOINHERIT NOCREATEROLE NOCREATEDB LOGIN NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 20",
    "COMMENT ON ROLE audit_assistant IS 'The Audit Assistant server''s login; it never reads DCRS''s tables -- ever.'",
    "CREATE ROLE dcrs_backup",
    "ALTER ROLE dcrs_backup WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB LOGIN NOREPLICATION NOBYPASSRLS",
    'CREATE ROLE "Plant ""QA"" lead"',
    'ALTER ROLE "Plant ""QA"" lead" WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB NOLOGIN NOREPLICATION NOBYPASSRLS',
    "ALTER ROLE audit_assistant SET statement_timeout TO '30s'",
    "ALTER ROLE audit_assistant SET search_path TO 'chatbot'",
    "GRANT pg_read_all_data TO dcrs_backup WITH INHERIT TRUE GRANTED BY postgres",
    'GRANT overview_viewer TO "Plant ""QA"" lead" WITH INHERIT TRUE GRANTED BY postgres',
  ]);
  // A server that has them all: nothing is run.
  assert.deepEqual(statementsForMissingRoles(file, new Set()), []);
});

test("a dump's table of contents", () => {
  const toc = parseToc(TOC_LISTING);
  assert.equal(toc.database, "dcrs_restore_source");
  assert.equal(toc.createdAt, "2026-09-30 09:26:11");
  assert.equal(toc.serverVersion, "18.6");
  assert.equal(toc.dumpVersion, "18.6");
  assert.deepEqual(tocSchemas(toc), ["public", "chatbot", "overview"]);
  assert.deepEqual(tocTables(toc), [
    { schema: "chatbot", name: "__drizzle_migrations" },
    { schema: "chatbot", name: "actions" },
    { schema: "public", name: "app_storage" },
    { schema: "public", name: "users" },
  ]);
  assert.deepEqual(tocViews(toc, "overview"), ["findings", "people"]);
  assert.deepEqual(
    tocDatabaseEntries(toc).map((e) => e.line),
    ["5317; 1262 16388 DATABASE - dcrs_restore_source postgres", "5318; 0 0 ACL - DATABASE dcrs_restore_source postgres"]
  );
  const extension = toc.entries.find((e) => e.kind === "EXTENSION");
  assert.deepEqual([extension?.schema, extension?.name, extension?.owner], ["-", "pg_trgm", ""]);
});

test("the database's own statements are made about the test's own database, or not run at all", () => {
  const { create, rest } = databaseStatements(DATABASE_SCRIPT);
  assert.equal(create, "CREATE DATABASE dcrs WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'C'");
  assert.deepEqual(rest, ["ALTER DATABASE dcrs OWNER TO postgres", "GRANT CREATE,CONNECT ON DATABASE dcrs TO audit_assistant", "GRANT CONNECT ON DATABASE dcrs TO overview_viewer"]);

  const own = "restore_test_20260930_2030_ab12";
  assert.equal(renameDatabase(create ?? "", "dcrs", own), `CREATE DATABASE "${own}" WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'C'`);
  assert.deepEqual(
    rest.map((s) => renameDatabase(s, "dcrs", own)),
    [`ALTER DATABASE "${own}" OWNER TO postgres`, `GRANT CREATE,CONNECT ON DATABASE "${own}" TO audit_assistant`, `GRANT CONNECT ON DATABASE "${own}" TO overview_viewer`]
  );
  assert.equal(renameDatabase("ALTER ROLE audit_assistant IN DATABASE dcrs SET work_mem TO '8MB'", "dcrs", own), `ALTER ROLE audit_assistant IN DATABASE "${own}" SET work_mem TO '8MB'`);
  // Only the name after DATABASE changes; words inside the comment stay as they are.
  assert.equal(renameDatabase("COMMENT ON DATABASE dcrs IS 'the DATABASE dcrs of the plant'", "dcrs", own), `COMMENT ON DATABASE "${own}" IS 'the DATABASE dcrs of the plant'`);
  // A name that needs quotes.
  assert.equal(renameDatabase('GRANT CONNECT ON DATABASE "Plant DB" TO x', "Plant DB", own), `GRANT CONNECT ON DATABASE "${own}" TO x`);

  // Anything that does not name the dump's own database, or is not about a database, is never run.
  assert.equal(renameDatabase("GRANT CONNECT ON DATABASE dcrs_live TO audit_assistant", "dcrs", own), null);
  assert.equal(renameDatabase("GRANT CONNECT ON DATABASE postgres TO audit_assistant", "dcrs", own), null);
  assert.equal(renameDatabase("DROP DATABASE dcrs", "dcrs", own), null);
  assert.equal(renameDatabase("DROP TABLE users", "dcrs", own), null);
  assert.equal(renameDatabase("ALTER DATABASE dcrs2 OWNER TO postgres", "dcrs", own), null);
});

test("the tools: PG_BIN when it is set, then PATH, then the newest PostgreSQL under Program Files", () => {
  const exe = (tool: string) => (process.platform === "win32" ? `${tool}.exe` : tool);
  const root = mkdtempSync(path.join(os.tmpdir(), "dcrs-pgtools-test-"));
  const folder = (...parts: string[]) => {
    const dir = path.join(root, ...parts);
    mkdirSync(dir, { recursive: true });
    return dir;
  };
  const put = (dir: string, ...tools: string[]) => tools.forEach((t) => writeFileSync(path.join(dir, exe(t)), ""));
  try {
    const half = folder("half");
    put(half, "pg_dump");
    const full = folder("full");
    put(full, "pg_dump", "pg_dumpall", "pg_restore");
    const wanted = ["pg_dump", "pg_dumpall", "pg_restore"];

    assert.equal(findPgTools(wanted, { PG_BIN: full, PATH: "" }).foundBy, "PG_BIN");
    assert.throws(() => findPgTools(wanted, { PG_BIN: half, PATH: full }), /PG_BIN is set to .*not in that folder/);
    // The first folder on PATH that has ALL of them, so they are one version.
    const found = findPgTools(wanted, { PATH: [half, full].join(path.delimiter), ProgramFiles: folder("empty") });
    assert.equal(found.dir, full);
    assert.equal(found.path("pg_restore"), path.join(full, exe("pg_restore")));
    assert.throws(() => findPgTools(wanted, { PATH: half, ProgramFiles: folder("empty") }), /not found/);

    if (process.platform === "win32") {
      const programFiles = folder("pf");
      for (const version of ["9.6", "17", "18"]) put(folder("pf", "PostgreSQL", version, "bin"), ...wanted);
      folder("pf", "PostgreSQL", "data");
      const newest = findPgTools(wanted, { PATH: "", ProgramFiles: programFiles });
      assert.equal(newest.dir, path.join(programFiles, "PostgreSQL", "18", "bin"));
      assert.equal(newest.foundBy, "the PostgreSQL 18 installation");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
