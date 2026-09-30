// WHAT THE BACKUP AND THE RESTORE TEST SHARE (REQUIREMENTS §83; docs/DEPLOYMENT.md,
// "Backups of the shared database"): where the backups go and what they are
// called, which of them are old enough to delete, finding PostgreSQL's own
// tools, a database address that is never shown with its password, and
// reading what the tools write: a dump's table of contents, a roles file, SQL
// split into statements.
//
// Nothing here connects to a database; scripts/database/backup.ts and
// scripts/database/restore-test.ts do. backend/tests/databaseBackup.test.ts
// tests these functions.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "..", "..");

/** How long backups are kept, in days. */
export const KEEP_DAYS = 14;
const DAY_MS = 86_400_000;

/** Where the backups go: the folder BACKUP_DIR names, or backend/data/backups. */
export function backupDir(env: NodeJS.ProcessEnv = process.env): string {
  const chosen = env.BACKUP_DIR?.trim();
  return chosen ? path.resolve(chosen) : path.join(repoRoot, "backend", "data", "backups");
}

// ---------------------------------------------------------------- the file names

/** The database: dcrs-YYYY-MM-DD-HHmm.dump. */
export const DUMP_NAME = /^dcrs-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})\.dump$/;
/** Its roles: roles-YYYY-MM-DD-HHmm.sql. */
export const ROLES_NAME = /^roles-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})\.sql$/;
/** Either of them while it is being written. */
const PARTIAL_SUFFIX = ".partial";

/** YYYY-MM-DD-HHmm on this computer's clock. */
export function stampOf(at: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}-${two(at.getHours())}${two(at.getMinutes())}`;
}

/** When a backup file of ours was made, from its name; null for any other file. */
export function stampTime(name: string): Date | null {
  const base = name.endsWith(PARTIAL_SUFFIX) ? name.slice(0, -PARTIAL_SUFFIX.length) : name;
  const m = DUMP_NAME.exec(base) ?? ROLES_NAME.exec(base);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1, 6).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const at = new Date(year, month - 1, day, hour, minute);
  // 2026-02-31 would roll over into March: not a name this script writes.
  return at.getDate() === day ? at : null;
}

/**
 * The files to delete after a successful backup: OUR OWN backups (named as
 * above) made more than `keepDays` days before `now`, and our own unfinished
 * files (.partial, left by a run that was cut off) more than a day old. Any
 * other file in the folder is never chosen, nor any name in `keep`.
 */
export function oldBackupFiles(names: string[], now: Date, keepDays = KEEP_DAYS, keep: ReadonlySet<string> = new Set()): string[] {
  const oldest = now.getTime() - keepDays * DAY_MS;
  return names.filter((name) => {
    if (keep.has(name)) return false;
    const at = stampTime(name);
    if (!at) return false;
    return name.endsWith(PARTIAL_SUFFIX) ? at.getTime() < now.getTime() - DAY_MS : at.getTime() < oldest;
  });
}

/** The newest dcrs-….dump in the folder, or null. */
export function newestDump(dir: string): string | null {
  let names: string[] = [];
  try {
    names = readdirSync(dir).filter((n) => DUMP_NAME.test(n) && stampTime(n));
  } catch {
    return null;
  }
  // The stamp sorts the same way as time does.
  names.sort();
  return names.length ? path.join(dir, names[names.length - 1]) : null;
}

/** The roles file made with a dump (roles-<same stamp>.sql beside it), or null. */
export function rolesFileFor(dumpPath: string): string | null {
  const m = DUMP_NAME.exec(path.basename(dumpPath));
  if (!m) return null;
  const roles = path.join(path.dirname(dumpPath), `roles-${m[1]}-${m[2]}-${m[3]}-${m[4]}${m[5]}.sql`);
  return existsSync(roles) ? roles : null;
}

// ---------------------------------------------------------------- PostgreSQL's tools

export interface PgTools {
  /** The folder they are in. */
  dir: string;
  /** How it was found, in words. */
  foundBy: string;
  /** The full path of one of them. */
  path(tool: string): string;
}

const exe = (tool: string) => (process.platform === "win32" ? `${tool}.exe` : tool);

function toolsIn(dir: string, foundBy: string): PgTools {
  return { dir, foundBy, path: (tool) => path.join(dir, exe(tool)) };
}

function missingIn(dir: string, tools: string[]): string[] {
  return tools.filter((t) => !existsSync(path.join(dir, exe(t))));
}

/**
 * The folder holding all of `tools` (e.g. pg_dump, pg_dumpall, pg_restore), so
 * that they are one version: PG_BIN when it is set (and then only there), else
 * the first folder on PATH that has them, else C:\Program Files\PostgreSQL\<n>\bin,
 * the newest version first.
 */
export function findPgTools(tools: string[], env: NodeJS.ProcessEnv = process.env): PgTools {
  const pgBin = env.PG_BIN?.trim().replace(/^"(.*)"$/, "$1");
  if (pgBin) {
    const missing = missingIn(pgBin, tools);
    if (missing.length) throw new Error(`PG_BIN is set to ${pgBin}, but ${plainList(missing.map(exe))} ${missing.length === 1 ? "is" : "are"} not in that folder.`);
    return toolsIn(pgBin, "PG_BIN");
  }
  for (const entry of (env.PATH ?? "").split(path.delimiter)) {
    const dir = entry.trim().replace(/^"(.*)"$/, "$1");
    if (dir && missingIn(dir, tools).length === 0) return toolsIn(dir, "PATH");
  }
  if (process.platform === "win32") {
    const base = path.join(env.ProgramFiles ?? "C:\\Program Files", "PostgreSQL");
    let versions: string[] = [];
    try {
      versions = readdirSync(base).filter((v) => /^\d+(\.\d+)?$/.test(v));
    } catch {
      /* no PostgreSQL installed there */
    }
    versions.sort((a, b) => Number(b) - Number(a));
    for (const version of versions) {
      const dir = path.join(base, version, "bin");
      if (missingIn(dir, tools).length === 0) return toolsIn(dir, `the PostgreSQL ${version} installation`);
    }
  }
  throw new Error(
    `PostgreSQL's ${plainList(tools)} ${tools.length === 1 ? "was" : "were"} not found (looked in PG_BIN, PATH` +
      (process.platform === "win32" ? ", and C:\\Program Files\\PostgreSQL\\<version>\\bin" : "") +
      `). Install PostgreSQL 18's command-line tools, or set PG_BIN to the folder that holds them.`
  );
}

/** "18.6" from `pg_dump --version` ("pg_dump (PostgreSQL) 18.6"), or "" when it cannot be run. */
export function toolVersion(file: string): string {
  const result = spawnSync(file, ["--version"], { encoding: "utf8", windowsHide: true, timeout: 15000 });
  return /\(PostgreSQL\)\s+(\d+(?:\.\d+)*)/.exec(result.stdout ?? "")?.[1] ?? "";
}

export interface ToolResult {
  code: number;
  stdout: string;
  stderr: string;
  ms: number;
}

/** Runs one of the tools with no window and no input (so it can never wait for a password), and collects what it says. */
export function runTool(file: string, args: string[], env: NodeJS.ProcessEnv): Promise<ToolResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(file, args, { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", (e) => resolve({ code: -1, stdout: "", stderr: e.message, ms: Date.now() - started }));
    child.on("close", (code) =>
      resolve({ code: code ?? -1, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8"), ms: Date.now() - started })
    );
  });
}

// ---------------------------------------------------------------- database addresses

export interface DatabaseAddress {
  /** As given, password included: for node-postgres only. Never printed. */
  full: string;
  /** The same address WITHOUT the password, for the tools' command line (the password goes in PGPASSWORD). */
  forTools: string;
  password: string | undefined;
  host: string;
  port: string;
  user: string;
  database: string;
  /** Safe to show: user@host:port/database. */
  shown: string;
}

/** Reads postgres://user:password@host:port/database[?options]. `what` names it in a message (e.g. "DATABASE_URL"). */
export function parseDatabaseUrl(value: string, what: string): DatabaseAddress {
  const full = value.trim();
  let url: URL;
  try {
    url = new URL(full);
  } catch {
    throw new Error(`${what} is not a database address of the form postgres://user:password@host:5432/database.`);
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`${what} must start with postgres:// or postgresql:// (it starts with ${url.protocol}//).`);
  }
  let password = url.password ? decodeURIComponent(url.password) : undefined;
  const passwordOption = url.searchParams.get("password");
  if (passwordOption !== null) {
    password = passwordOption;
    url.searchParams.delete("password");
  }
  url.password = "";
  const user = decodeURIComponent(url.username);
  const host = url.hostname || "localhost";
  const port = url.port || "5432";
  const database = decodeURIComponent(url.pathname.replace(/^\//, "")) || user;
  return { full, forTools: url.toString(), password, host, port, user, database, shown: `${user || "(default user)"}@${host}:${port}/${database}` };
}

/** The same server and sign-in, another database on it. */
export function withDatabase(address: DatabaseAddress, database: string): DatabaseAddress {
  const swap = (value: string) => {
    const url = new URL(value);
    url.pathname = "/" + encodeURIComponent(database);
    return url.toString();
  };
  return { ...address, full: swap(address.full), forTools: swap(address.forTools), database, shown: `${address.user || "(default user)"}@${address.host}:${address.port}/${database}` };
}

/** The environment for a tool: the password (when the address has one) in PGPASSWORD, never on its command line. */
export function toolEnv(address: DatabaseAddress, appName: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, PGAPPNAME: appName, PGCONNECT_TIMEOUT: process.env.PGCONNECT_TIMEOUT ?? "15" };
  if (address.password !== undefined) env.PGPASSWORD = address.password;
  return env;
}

/** The text with the address's password blotted out, wherever it appears. */
export function hidePassword(text: string, ...addresses: Array<DatabaseAddress | null | undefined>): string {
  let out = text;
  for (const a of addresses) {
    if (a?.password && a.password.length >= 3) out = out.split(a.password).join("********");
  }
  return out;
}

// ---------------------------------------------------------------- SQL text

/** "name" in double quotes, for any role, schema, table or database name. */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** A name (plain or "quoted") at the start of `text`: the name, and what follows it. */
export function readIdent(text: string): [string, string] | null {
  const t = text.trimStart();
  if (t.startsWith('"')) {
    let name = "";
    for (let i = 1; i < t.length; i++) {
      if (t[i] === '"') {
        if (t[i + 1] === '"') {
          name += '"';
          i++;
          continue;
        }
        return [name, t.slice(i + 1)];
      }
      name += t[i];
    }
    return null;
  }
  const m = /^[A-Za-z_\u0080-\uffff][A-Za-z0-9_$\u0080-\uffff]*/.exec(t);
  // PostgreSQL folds a plain name to lower case.
  return m ? [m[0].toLowerCase(), t.slice(m[0].length)] : null;
}

/**
 * SQL text as its statements, without the closing semicolons. Leaves out
 * comments and psql's own commands (\restrict, \connect, …), and keeps what
 * is inside '…', "…" and $$…$$ whole.
 */
export function splitSql(text: string): string[] {
  const statements: string[] = [];
  let current = "";
  let lineStart = true;
  let i = 0;
  const closeQuote = (from: number, quote: string): number => {
    for (let j = from + 1; j < text.length; j++) {
      if (text[j] === quote) {
        if (text[j + 1] === quote) {
          j++;
          continue;
        }
        return j + 1;
      }
    }
    return text.length;
  };
  while (i < text.length) {
    const c = text[i];
    if (lineStart) {
      lineStart = false;
      let j = i;
      while (text[j] === " " || text[j] === "\t") j++;
      // psql's own commands take the whole line, between statements.
      if (text[j] === "\\" && current.trim() === "") {
        const end = text.indexOf("\n", j);
        i = end === -1 ? text.length : end + 1;
        lineStart = true;
        continue;
      }
    }
    if (c === "-" && text[i + 1] === "-") {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end;
      continue;
    }
    if (c === "'" || c === '"') {
      const end = closeQuote(i, c);
      current += text.slice(i, end);
      i = end;
      continue;
    }
    if (c === "$") {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(i, i + 80))?.[0];
      if (tag) {
        const close = text.indexOf(tag, i + tag.length);
        const end = close === -1 ? text.length : close + tag.length;
        current += text.slice(i, end);
        i = end;
        continue;
      }
    }
    if (c === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
      i++;
      continue;
    }
    if (c === "\n") lineStart = true;
    current += c;
    i++;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

// ---------------------------------------------------------------- the roles file

export interface RolesStatement {
  sql: string;
  /**
   * session  SET …, for the session only
   * role     CREATE ROLE / ALTER ROLE / COMMENT ON ROLE / SECURITY LABEL … ON ROLE, about one role
   * member   GRANT role TO role: one role made a member of another
   * other    anything else (e.g. GRANT SET ON PARAMETER): never applied by the restore test
   */
  kind: "session" | "role" | "member" | "other";
  /** The roles it names. */
  roles: string[];
}

export interface RolesFile {
  /** Every role the file makes, in its order. */
  roles: string[];
  statements: RolesStatement[];
}

/** The roles a GRANT … TO … names when it makes one role a member of another; null when it grants a privilege ON something. */
function memberGrantRoles(sql: string): string[] | null {
  const readList = (text: string): [string[], string] | null => {
    const names: string[] = [];
    let rest = text;
    for (;;) {
      const id = readIdent(rest);
      if (!id) return null;
      names.push(id[0]);
      rest = id[1].trimStart();
      if (!rest.startsWith(",")) return [names, rest];
      rest = rest.slice(1);
    }
  };
  const granted = readList(sql.replace(/^GRANT\s+/i, ""));
  if (!granted || !/^TO\s/i.test(granted[1])) return null;
  const members = readList(granted[1].slice(2));
  if (!members) return null;
  const by = /\bGRANTED\s+BY\s+/i.exec(members[1]);
  const grantor = by ? readIdent(members[1].slice(by.index + by[0].length)) : null;
  return [...granted[0], ...members[0], ...(grantor ? [grantor[0]] : [])];
}

function classifyRolesStatement(sql: string): RolesStatement {
  if (/^(SET|RESET)\s/i.test(sql) || /^SELECT\s+pg_catalog\.set_config\s*\(/i.test(sql)) return { sql, kind: "session", roles: [] };
  const aboutOne = /^(?:CREATE\s+ROLE|ALTER\s+ROLE|COMMENT\s+ON\s+ROLE|SECURITY\s+LABEL\s+(?:FOR\s+\S+\s+)?ON\s+ROLE)\s+/i.exec(sql);
  if (aboutOne) {
    const id = readIdent(sql.slice(aboutOne[0].length));
    if (id) return { sql, kind: "role", roles: [id[0]] };
  }
  if (/^GRANT\s/i.test(sql)) {
    const roles = memberGrantRoles(sql);
    if (roles) return { sql, kind: "member", roles };
  }
  return { sql, kind: "other", roles: [] };
}

/** Reads what `pg_dumpall --roles-only` wrote. */
export function parseRolesFile(text: string): RolesFile {
  const statements = splitSql(text).map(classifyRolesStatement);
  const roles = statements.filter((s) => s.kind === "role" && /^CREATE\s+ROLE\s/i.test(s.sql)).map((s) => s.roles[0]);
  return { roles, statements };
}

/**
 * The statements that make the roles in `missing` as the file describes them,
 * in the file's order: each one's CREATE ROLE, ALTER ROLE (its options and
 * settings), COMMENT, and the memberships that involve it. Nothing about a
 * role that is not in `missing` is included, so a role already on the server
 * is left exactly as it is.
 */
export function statementsForMissingRoles(file: RolesFile, missing: ReadonlySet<string>): string[] {
  return file.statements
    .filter((s) => (s.kind === "role" && missing.has(s.roles[0])) || (s.kind === "member" && s.roles.some((r) => missing.has(r))))
    .map((s) => s.sql);
}

// ---------------------------------------------------------------- a dump's table of contents

export interface TocEntry {
  id: number;
  /** TABLE, TABLE DATA, VIEW, SCHEMA, DATABASE, ACL, … */
  kind: string;
  /** "-" when the thing is in no schema. */
  schema: string;
  name: string;
  owner: string;
  /** The line as pg_restore --list wrote it (what pg_restore --use-list reads back). */
  line: string;
}

export interface Toc {
  /** The database the dump was made from. */
  database: string;
  createdAt: string;
  serverVersion: string;
  dumpVersion: string;
  entries: TocEntry[];
}

// The longer names first, so "TABLE DATA" is not read as "TABLE".
const TOC_KINDS = [
  "MATERIALIZED VIEW DATA",
  "MATERIALIZED VIEW",
  "DATABASE PROPERTIES",
  "SEQUENCE OWNED BY",
  "SEQUENCE SET",
  "SECURITY LABEL",
  "FK CONSTRAINT",
  "TABLE DATA",
  "DEFAULT ACL",
  "DATABASE",
  "EXTENSION",
  "SEQUENCE",
  "FUNCTION",
  "CONSTRAINT",
  "TRIGGER",
  "DEFAULT",
  "COMMENT",
  "SCHEMA",
  "TABLE",
  "INDEX",
  "VIEW",
  "ACL",
];

/** Reads what `pg_restore --list` prints. */
export function parseToc(listing: string): Toc {
  const toc: Toc = { database: "", createdAt: "", serverVersion: "", dumpVersion: "", entries: [] };
  for (const line of listing.split(/\r?\n/)) {
    if (line.startsWith(";")) {
      const header = (re: RegExp) => re.exec(line)?.[1]?.trim() ?? "";
      toc.database ||= header(/^;\s+dbname:\s*(.*)$/);
      toc.createdAt ||= header(/^;\s*Archive created at\s+(.*)$/);
      toc.serverVersion ||= header(/^;\s+Dumped from database version:\s*(.*)$/);
      toc.dumpVersion ||= header(/^;\s+Dumped by pg_dump version:\s*(.*)$/);
      continue;
    }
    const m = /^(\d+);\s+\d+\s+\d+\s+(.*)$/.exec(line);
    if (!m) continue;
    const rest = m[2];
    const kind = TOC_KINDS.find((k) => rest.startsWith(k + " ")) ?? rest.split(" ")[0];
    const tail = rest.slice(kind.length + 1);
    const first = tail.indexOf(" ");
    const last = tail.lastIndexOf(" ");
    const schema = first === -1 ? tail : tail.slice(0, first);
    const name = first === -1 ? "" : last > first ? tail.slice(first + 1, last) : tail.slice(first + 1);
    const owner = last > first ? tail.slice(last + 1) : "";
    toc.entries.push({ id: Number(m[1]), kind, schema, name, owner, line });
  }
  return toc;
}

/** The schemas the dump holds something in (public among them when it holds DCRS's tables): public, chatbot and overview first. */
export function tocSchemas(toc: Toc): string[] {
  const schemas = new Set<string>();
  for (const e of toc.entries) {
    if (e.kind === "SCHEMA") schemas.add(e.name);
    else if (e.schema !== "-" && e.schema !== "pg_catalog" && ["TABLE", "VIEW", "MATERIALIZED VIEW", "SEQUENCE", "FUNCTION"].includes(e.kind)) schemas.add(e.schema);
  }
  const first = ["public", "chatbot", "overview"];
  return [...first.filter((s) => schemas.has(s)), ...[...schemas].filter((s) => !first.includes(s)).sort()];
}

export function tocTables(toc: Toc): Array<{ schema: string; name: string }> {
  return toc.entries.filter((e) => e.kind === "TABLE").map((e) => ({ schema: e.schema, name: e.name }));
}

export function tocViews(toc: Toc, schema: string): string[] {
  return toc.entries.filter((e) => (e.kind === "VIEW" || e.kind === "MATERIALIZED VIEW") && e.schema === schema).map((e) => e.name);
}

/** The entries about the database itself (how it is made, its own grants and settings): pg_restore applies them only with --create. */
export function tocDatabaseEntries(toc: Toc): TocEntry[] {
  return toc.entries.filter(
    (e) => e.kind === "DATABASE" || e.kind === "DATABASE PROPERTIES" || (["ACL", "COMMENT", "SECURITY LABEL"].includes(e.kind) && e.name.startsWith("DATABASE "))
  );
}

// ---------------------------------------------------------------- the database's own statements

/**
 * What `pg_restore --create --schema-only --use-list=<the database's own
 * entries>` prints, as statements: the CREATE DATABASE, and the rest (its
 * owner, its grants, its settings, its comment). Session SETs are left out.
 */
export function databaseStatements(sqlText: string): { create: string | null; rest: string[] } {
  const statements = splitSql(sqlText).filter((s) => !/^(SET|RESET)\s/i.test(s) && !/^SELECT\s+pg_catalog\.set_config\s*\(/i.test(s));
  const create = statements.find((s) => /^CREATE\s+DATABASE\s/i.test(s)) ?? null;
  return { create, rest: statements.filter((s) => s !== create) };
}

// The only shapes of statement about a database that the restore test will run, once renamed.
const DATABASE_STATEMENT = [
  /^CREATE\s+DATABASE\s/i,
  /^ALTER\s+DATABASE\s/i,
  /^(?:GRANT|REVOKE)\s[\s\S]*?\sON\s+DATABASE\s/i,
  /^COMMENT\s+ON\s+DATABASE\s/i,
  /^SECURITY\s+LABEL\s[\s\S]*?\sON\s+DATABASE\s/i,
  /^ALTER\s+ROLE\s[\s\S]*?\sIN\s+DATABASE\s/i,
];

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The same statement about the database `from`, made about `to` instead: the
 * name right after the word DATABASE, the first time it appears. Null when the
 * statement is not one of the known shapes or does not name `from` there, so
 * that nothing is ever run against the database the dump came from.
 */
export function renameDatabase(sql: string, from: string, to: string): string | null {
  if (!DATABASE_STATEMENT.some((re) => re.test(sql))) return null;
  const forms = [escapeRegExp(quoteIdent(from))];
  if (/^[a-z_][a-z0-9_$]*$/.test(from)) forms.push(escapeRegExp(from));
  const re = new RegExp(`(\\bDATABASE\\s+)(?:${forms.join("|")})(?=\\s|;|$)`, "i");
  if (!re.test(sql)) return null;
  return sql.replace(re, `$1${quoteIdent(to)}`);
}

// ---------------------------------------------------------------- words

/** "a", "a and b", "a, b and c". */
export function plainList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** "1 table", "2 tables". */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
