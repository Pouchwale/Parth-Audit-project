// THE SHARED DATABASE, CHECKED AGAINST A REAL ONE (REQUIREMENTS §83).
//
// Run it on a COPY (npm run db:shared -- copy), never first on the real database:
//   npm run db:shared -- test          (SUPERUSER_DATABASE_URL: a superuser's URL of the database)
// or directly:
//   SHARED_DB_TEST_URL=postgres://postgres:<password>@<host>:<port>/<database> \
//     node --no-warnings=ExperimentalWarning --test database/tests/sharedDatabase.test.ts
// Without SHARED_DB_TEST_URL every check here is skipped, with one message.
//
// Also read, when set:
//   AUDIT_ASSISTANT_PASSWORD, OVERVIEW_VIEWER_PASSWORD  check a real sign-in of each login too
//   SHARED_DB_TEST_DUMP  a pg_dump (custom format) of a DCRS database WITHOUT the shared set-up;
//                        "DCRS unchanged" restores it into a throwaway database. Without it,
//                        that check copies the database under test there, without the
//                        schemas overview and chatbot.
//
// Every check runs as the role concerned: by SET ROLE inside a transaction that
// is always rolled back, or by a real sign-in. Nothing here changes the database
// under test. The one database these tests make ("DCRS unchanged") is their
// own, named <database>_unchanged_check_<random>, and it is dropped at the end.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { after, before, describe, it, test } from "node:test";
import pg from "pg";
import { closeFindingChange, findingStatus, identifyFindings, isOpenStatus, type StoredRecord } from "../../backend/findingsCore.ts";
import { departmentOfDocument, DOCUMENT_DEPARTMENTS, PLANT_DEPARTMENTS } from "../../frontend/src/data/seed/documentDepartments.ts";
import {
  ASSISTANT_VIEWS,
  DCRS_VIEWS,
  findPgTool,
  quoteIdent,
  ROOT,
  runTool,
  toolConnection,
  withDatabase,
  withUser,
} from "../../scripts/database/shared-database.ts";

const TEST_URL = process.env.SHARED_DB_TEST_URL?.trim() ?? "";
const ASSISTANT_PASSWORD = process.env.AUDIT_ASSISTANT_PASSWORD ?? "";
const VIEWER_PASSWORD = process.env.OVERVIEW_VIEWER_PASSWORD ?? "";
const TEST_DUMP = process.env.SHARED_DB_TEST_DUMP?.trim() ?? "";
const SCRIPT = path.join(ROOT, "scripts", "database", "shared-database.ts");
const NO_ASSISTANT_PASSWORD = "AUDIT_ASSISTANT_PASSWORD is not set, so a real sign-in of audit_assistant is not checked";
const NO_VIEWER_PASSWORD = "OVERVIEW_VIEWER_PASSWORD is not set, so a real sign-in of overview_viewer is not checked";
const NO_PART_3 = "part 3 (database/sql/03-overview-chatbot.sql) is not applied to this database";
const NO_CHATBOT = "the Audit Assistant's tables are not in this database yet";

/** The Audit Assistant's ten tables (its server/src/db/schema.ts). */
const CHATBOT_TABLES = ["users", "sessions", "connector_credentials", "login_events", "conversations", "actions", "message_events", "files", "conversation_exports", "weekly_reports"];

/** What no view may reach, by any path (contract C5): "all" means every column of the table. */
const SECRETS: Record<string, readonly string[] | "all"> = {
  "public.users": ["password_hash"],
  "chatbot.connector_credentials": "all",
  "chatbot.sessions": ["token_hash"],
  "chatbot.conversations": ["transcript", "messages", "title", "pending"],
  "chatbot.files": ["data", "text"],
  "chatbot.conversation_exports": ["content", "content_bytes", "conversation_title"],
  "chatbot.actions": ["request"],
  "chatbot.weekly_reports": ["report"],
};

/** DCRS's own words for a download, a print and an upload (the activity log's action). */
const DOWNLOAD_ACTIONS = [
  "Document downloaded as Excel", "Document downloaded as Word", "Document downloaded as PDF", "Document printed",
  "Document changes uploaded from Word", "Document changes uploaded from Excel",
];

// ---------------------------------------------------------------------------
// helpers

type Client = pg.Client;

async function open(url: string, purpose: string): Promise<Client> {
  const client = new pg.Client({ connectionString: url, application_name: `dcrs database tests: ${purpose}` });
  client.on("error", () => undefined);
  await client.connect();
  return client;
}

async function rowsOf<R extends pg.QueryResultRow>(c: Client, sql: string, values: unknown[] = []): Promise<R[]> {
  return (await c.query<R>(sql, values)).rows;
}

/** Runs `work` inside a transaction that is always rolled back. */
async function rolledBack<T>(c: Client, work: () => Promise<T>): Promise<T> {
  await c.query("BEGIN");
  try {
    return await work();
  } finally {
    await c.query("ROLLBACK");
  }
}

/** Tries one statement inside a savepoint (so the transaction goes on either way): "allowed", or the error's code and words. */
async function attempt(c: Client, sql: string): Promise<{ code: string; message: string }> {
  await c.query("SAVEPOINT attempt");
  try {
    await c.query(sql);
    await c.query("ROLLBACK TO SAVEPOINT attempt");
    return { code: "allowed", message: "" };
  } catch (err) {
    await c.query("ROLLBACK TO SAVEPOINT attempt");
    const e = err as { code?: string; message?: string };
    return { code: e.code ?? "unknown", message: e.message ?? String(err) };
  }
}

/** Tries each statement; lists every one that was not refused with one of `codes`. */
async function refusals(c: Client, statements: string[], codes: string[]): Promise<string[]> {
  const wrong: string[] = [];
  for (const sql of statements) {
    const r = await attempt(c, sql);
    if (!codes.includes(r.code)) wrong.push(`${sql}  ->  ${r.code === "allowed" ? "ALLOWED" : `${r.code} ${r.message}`}`);
  }
  return wrong;
}

function noneOf(problems: string[], what: string): void {
  assert.deepEqual(problems, [], `${what}:\n  ${problems.join("\n  ")}`);
}

interface Relation {
  name: string;
  kind: string;
  first_column: string | null;
}

/** Every relation of a schema, of the given kinds (r table, p partitioned table, v view, m materialised view, f foreign table, S sequence). */
async function relationsIn(c: Client, schema: string, kinds: string[]): Promise<Relation[]> {
  return rowsOf<Relation>(
    c,
    `SELECT quote_ident(n.nspname) || '.' || quote_ident(c.relname) AS name, c.relkind::text AS kind,
            (SELECT quote_ident(a.attname) FROM pg_attribute a
              WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum LIMIT 1) AS first_column
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind::text = ANY($2::text[])
      ORDER BY c.relname`,
    [schema, kinds]
  );
}

/** The statements that read, add, change, delete and empty a table. */
function writesTo(t: Relation): string[] {
  return [
    `INSERT INTO ${t.name} DEFAULT VALUES`,
    `UPDATE ${t.name} SET ${t.first_column} = ${t.first_column} WHERE false`,
    `DELETE FROM ${t.name} WHERE false`,
  ];
}

async function storedRecords(c: Client): Promise<{ value: string; records: StoredRecord[] }> {
  const rows = await rowsOf<{ value: string }>(c, "SELECT value FROM public.app_storage WHERE scope = 'company' AND key = 'records'");
  const value = rows[0]?.value ?? "[]";
  const parsed = JSON.parse(value) as unknown;
  return { value, records: Array.isArray(parsed) ? (parsed as StoredRecord[]) : [] };
}

/** Writes the company's records as DCRS writes them (backend/db.ts writeItem), inside the caller's transaction. */
async function writeRecords(c: Client, records: unknown[]): Promise<void> {
  await c.query(
    `UPDATE public.app_storage SET value = $1, version = version + 1, updated_at = now(), updated_by = 'database test (rolled back)'
      WHERE scope = 'company' AND key = 'records'`,
    [JSON.stringify(records)]
  );
}

async function factoryToday(c: Client): Promise<string> {
  return (await rowsOf<{ d: string }>(c, "SELECT to_char(overview.factory_today(), 'YYYY-MM-DD') AS d"))[0].d;
}

/** Where two snapshots differ, as readable lines. */
function differences(a: unknown, b: unknown, at = ""): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const x = a as Record<string, unknown>;
    const y = b as Record<string, unknown>;
    return [...new Set([...Object.keys(x), ...Object.keys(y)])].flatMap((k) => differences(x[k], y[k], at ? `${at}.${k}` : k));
  }
  const show = (v: unknown): string => (v === undefined ? "(nothing)" : JSON.stringify(v).slice(0, 300));
  return [`${at}: before ${show(a)}, after ${show(b)}`];
}

function withoutComments(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutComments);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([k]) => k !== "comment").map(([k, v]) => [k, withoutComments(v)]));
  }
  return value;
}

// Everything that makes up DCRS's schema public, as one JSON value: its
// tables, columns, types, defaults, indexes, constraints, triggers, policies,
// rules, sequences, functions, operators, extensions, owners, grants and
// comments. Row data is not in it, nor a sequence's current value.
const PUBLIC_SNAPSHOT = `
SELECT jsonb_build_object(
  'schema', (
    SELECT jsonb_build_object('owner', pg_get_userbyid(n.nspowner), 'acl', n.nspacl::text, 'comment', obj_description(n.oid, 'pg_namespace'))
    FROM pg_namespace n WHERE n.nspname = 'public'
  ),
  'relations', (
    SELECT coalesce(jsonb_object_agg(c.relname, jsonb_build_object(
      'kind', c.relkind, 'owner', pg_get_userbyid(c.relowner), 'acl', c.relacl::text, 'options', c.reloptions::text,
      'persistence', c.relpersistence, 'row_security', c.relrowsecurity, 'force_row_security', c.relforcerowsecurity,
      'replica_identity', c.relreplident, 'access_method', (SELECT amname FROM pg_am WHERE oid = c.relam),
      'tablespace', c.reltablespace, 'comment', obj_description(c.oid, 'pg_class'),
      'index', CASE WHEN c.relkind IN ('i', 'I') THEN pg_get_indexdef(c.oid) END,
      'view', CASE WHEN c.relkind IN ('v', 'm') THEN pg_get_viewdef(c.oid) END,
      'columns', (
        SELECT jsonb_agg(jsonb_build_object(
          'name', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'not_null', a.attnotnull,
          'default', pg_get_expr(d.adbin, d.adrelid), 'identity', a.attidentity, 'generated', a.attgenerated,
          'collation', CASE WHEN a.attcollation <> 0 THEN a.attcollation::regcollation::text END,
          'storage', a.attstorage, 'acl', a.attacl::text, 'comment', col_description(c.oid, a.attnum)
        ) ORDER BY a.attnum)
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      ),
      'constraints', (
        SELECT jsonb_agg(jsonb_build_object('name', co.conname, 'definition', pg_get_constraintdef(co.oid),
                                            'comment', obj_description(co.oid, 'pg_constraint')) ORDER BY co.conname)
        FROM pg_constraint co WHERE co.conrelid = c.oid
      ),
      'triggers', (
        SELECT jsonb_agg(jsonb_build_object('name', t.tgname, 'definition', pg_get_triggerdef(t.oid), 'enabled', t.tgenabled,
                                            'comment', obj_description(t.oid, 'pg_trigger')) ORDER BY t.tgname)
        FROM pg_trigger t WHERE t.tgrelid = c.oid AND NOT t.tgisinternal
      ),
      'policies', (
        SELECT jsonb_agg(jsonb_build_object('name', p.polname, 'command', p.polcmd, 'permissive', p.polpermissive,
                                            'roles', p.polroles::regrole[]::text, 'using', pg_get_expr(p.polqual, p.polrelid),
                                            'check', pg_get_expr(p.polwithcheck, p.polrelid)) ORDER BY p.polname)
        FROM pg_policy p WHERE p.polrelid = c.oid
      ),
      'rules', (
        SELECT jsonb_agg(pg_get_ruledef(r.oid) ORDER BY r.rulename) FROM pg_rewrite r WHERE r.ev_class = c.oid AND c.relkind NOT IN ('v', 'm')
      ),
      'sequence', (
        SELECT jsonb_build_object('type', format_type(s.seqtypid, NULL), 'start', s.seqstart, 'increment', s.seqincrement,
                                  'max', s.seqmax, 'min', s.seqmin, 'cache', s.seqcache, 'cycle', s.seqcycle,
                                  'owned_by', (SELECT d.refobjid::regclass::text || '.' || a.attname FROM pg_depend d
                                               JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
                                               WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'a'
                                                 AND d.refclassid = 'pg_class'::regclass))
        FROM pg_sequence s WHERE s.seqrelid = c.oid
      )
    )), '{}'::jsonb)
    FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace
  ),
  'functions', (
    SELECT coalesce(jsonb_object_agg(p.oid::regprocedure::text, jsonb_build_object(
      'kind', p.prokind, 'owner', pg_get_userbyid(p.proowner), 'acl', p.proacl::text, 'security_definer', p.prosecdef,
      'volatility', p.provolatile, 'config', p.proconfig::text, 'comment', obj_description(p.oid, 'pg_proc'),
      'definition', CASE WHEN p.prokind IN ('f', 'p') THEN md5(pg_get_functiondef(p.oid)) END
    )), '{}'::jsonb)
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
  ),
  'types', (
    SELECT coalesce(jsonb_object_agg(t.oid::regtype::text, jsonb_build_object(
      'kind', t.typtype, 'owner', pg_get_userbyid(t.typowner), 'acl', t.typacl::text, 'comment', obj_description(t.oid, 'pg_type')
    )), '{}'::jsonb)
    FROM pg_type t WHERE t.typnamespace = 'public'::regnamespace
  ),
  'operators', (
    SELECT coalesce(jsonb_object_agg(o.oid::regoperator::text, jsonb_build_object(
      'owner', pg_get_userbyid(o.oprowner), 'function', o.oprcode::text, 'comment', obj_description(o.oid, 'pg_operator')
    )), '{}'::jsonb)
    FROM pg_operator o WHERE o.oprnamespace = 'public'::regnamespace
  ),
  'operator_classes', (
    SELECT coalesce(jsonb_object_agg(oc.opcname || ' ' || (SELECT amname FROM pg_am WHERE oid = oc.opcmethod), jsonb_build_object(
      'owner', pg_get_userbyid(oc.opcowner), 'comment', obj_description(oc.oid, 'pg_opclass')
    )), '{}'::jsonb)
    FROM pg_opclass oc WHERE oc.opcnamespace = 'public'::regnamespace
  ),
  'extensions', (
    SELECT coalesce(jsonb_object_agg(e.extname, jsonb_build_object(
      'version', e.extversion, 'owner', pg_get_userbyid(e.extowner), 'schema', e.extnamespace::regnamespace::text,
      'comment', obj_description(e.oid, 'pg_extension')
    )), '{}'::jsonb)
    FROM pg_extension e
  ),
  'default_privileges', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('role', pg_get_userbyid(d.defaclrole), 'kind', d.defaclobjtype, 'acl', d.defaclacl::text)
                              ORDER BY pg_get_userbyid(d.defaclrole), d.defaclobjtype), '[]'::jsonb)
    FROM pg_default_acl d WHERE d.defaclnamespace IN (0, 'public'::regnamespace)
  )
) AS snapshot`;

async function snapshotOfPublic(c: Client): Promise<unknown> {
  return (await rowsOf<{ snapshot: unknown }>(c, PUBLIC_SNAPSHOT))[0].snapshot;
}

/** Tables and columns of a schema that have no comment. */
async function uncommented(c: Client, schema: string): Promise<string[]> {
  const rows = await rowsOf<{ what: string }>(
    c,
    `SELECT c.relname AS what FROM pg_class c
      WHERE c.relnamespace = $1::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm') AND coalesce(obj_description(c.oid, 'pg_class'), '') = ''
     UNION ALL
     SELECT c.relname || '.' || a.attname FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      WHERE c.relnamespace = $1::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm') AND coalesce(col_description(c.oid, a.attnum), '') = ''
     ORDER BY 1`,
    [schema]
  );
  return rows.map((r) => r.what);
}

// ---------------------------------------------------------------------------
// the four detectors behind "no view reaches a secret"; each lists what it finds

/** Views of overview that depend on a secret column, or on connector_credentials at all (pg_depend). */
async function secretColumnUses(c: Client): Promise<{ found: string[]; dependencies: number }> {
  const deps = await rowsOf<{ view: string; tbl: string; col: string | null }>(
    c,
    `SELECT v.relname AS view, n.nspname || '.' || t.relname AS tbl, a.attname AS col
       FROM pg_class v
       JOIN pg_rewrite r ON r.ev_class = v.oid
       JOIN pg_depend d ON d.classid = 'pg_rewrite'::regclass AND d.objid = r.oid AND d.refclassid = 'pg_class'::regclass
                       AND d.deptype = 'n' AND d.refobjid <> v.oid
       JOIN pg_class t ON t.oid = d.refobjid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid AND d.refobjsubid > 0
      WHERE v.relnamespace = 'overview'::regnamespace AND v.relkind = 'v'`
  );
  const found: string[] = [];
  for (const d of deps) {
    const secret = SECRETS[d.tbl];
    if (!secret) continue;
    if (secret === "all") found.push(`${d.view} reads ${d.tbl}${d.col ? `.${d.col}` : ""}`);
    else if (d.col && secret.includes(d.col)) found.push(`${d.view} reads ${d.tbl}.${d.col}`);
  }
  return { found, dependencies: deps.length };
}

/** Views of overview that use a WHOLE ROW of a table holding a secret: a Var of the table's row type in the view's rule (pg_rewrite). */
async function wholeRowUses(c: Client): Promise<string[]> {
  const secretTypes = new Map(
    (
      await rowsOf<{ name: string; reltype: string }>(
        c,
        `SELECT n.nspname || '.' || c.relname AS name, c.reltype::text AS reltype FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname || '.' || c.relname = ANY($1::text[])`,
        [Object.keys(SECRETS)]
      )
    ).map((r) => [r.reltype, r.name])
  );
  const rules = await rowsOf<{ view: string; tree: string }>(
    c,
    `SELECT v.relname AS view, r.ev_action::text AS tree FROM pg_class v JOIN pg_rewrite r ON r.ev_class = v.oid
      WHERE v.relnamespace = 'overview'::regnamespace AND v.relkind = 'v'`
  );
  const found: string[] = [];
  for (const rule of rules) {
    for (const m of rule.tree.matchAll(/\{VAR :varno \d+ :varattno 0 :vartype (\d+) /g)) {
      const table = secretTypes.get(m[1]);
      if (table) found.push(`${rule.view} uses whole rows of ${table}`);
    }
  }
  return [...new Set(found)];
}

/** Views of overview that call a SECURITY DEFINER function (which would run with its owner's rights, not the reader's). */
async function securityDefinerUses(c: Client): Promise<string[]> {
  const rows = await rowsOf<{ what: string }>(
    c,
    `SELECT v.relname || ' calls ' || p.oid::regprocedure::text AS what
       FROM pg_class v JOIN pg_rewrite r ON r.ev_class = v.oid
       JOIN pg_depend d ON d.classid = 'pg_rewrite'::regclass AND d.objid = r.oid AND d.refclassid = 'pg_proc'::regclass
       JOIN pg_proc p ON p.oid = d.refobjid
      WHERE v.relnamespace = 'overview'::regnamespace AND p.prosecdef
     UNION
     SELECT 'overview has the SECURITY DEFINER function ' || p.oid::regprocedure::text FROM pg_proc p
      WHERE p.pronamespace = 'overview'::regnamespace AND p.prosecdef
     ORDER BY 1`
  );
  return rows.map((r) => r.what);
}

/** Views of overview that read app_storage other than as scope company, key records, documents or master (pg_get_viewdef). */
async function appStorageReads(c: Client): Promise<{ found: string[]; views: string[] }> {
  const rows = await rowsOf<{ view: string; def: string }>(
    c,
    `SELECT v.relname AS view, pg_get_viewdef(v.oid, true) AS def FROM pg_class v
      WHERE v.relnamespace = 'overview'::regnamespace AND v.relkind = 'v'
        AND EXISTS (SELECT 1 FROM pg_rewrite r JOIN pg_depend d ON d.classid = 'pg_rewrite'::regclass AND d.objid = r.oid
                     WHERE r.ev_class = v.oid AND d.refclassid = 'pg_class'::regclass AND d.refobjid = 'public.app_storage'::regclass)
      ORDER BY 1`
  );
  const found: string[] = [];
  for (const r of rows) {
    const reads = (r.def.match(/\bapp_storage\b/g) ?? []).length;
    // Each read must be a whole subquery of exactly this form, as PostgreSQL prints it back.
    const guarded = [...r.def.matchAll(/FROM (?:public\.)?app_storage (\w+)\s+WHERE \1\.scope = 'company'::text AND \1\.key = '(?:records|documents|master)'::text\s*\)/g)].length;
    if (guarded !== reads) found.push(`${r.view} reads app_storage ${reads} time(s), only ${guarded} of them limited to the company's records, documents or master`);
  }
  return { found, views: rows.map((r) => r.view) };
}

// ---------------------------------------------------------------------------

interface Facts {
  database: string;
  major: number;
  views: Set<string>;
  chatbot: boolean;
  part3: boolean;
}

async function readFacts(url: string): Promise<Facts> {
  const c = await open(url, "facts");
  try {
    const r = (
      await rowsOf<{ database: string; num: number; views: string[]; chatbot: number }>(
        c,
        `SELECT current_database() AS database, current_setting('server_version_num')::int AS num,
                ARRAY(SELECT relname::text FROM pg_class WHERE relnamespace = to_regnamespace('overview') AND relkind = 'v') AS views,
                (SELECT count(*)::int FROM unnest($1::text[]) t WHERE to_regclass('chatbot.' || t) IS NOT NULL) AS chatbot`,
        [CHATBOT_TABLES]
      )
    )[0];
    const views = new Set(r.views);
    return { database: r.database, major: Math.floor(r.num / 10000), views, chatbot: r.chatbot === CHATBOT_TABLES.length, part3: ASSISTANT_VIEWS.every((v) => views.has(v)) };
  } finally {
    await c.end();
  }
}

if (!TEST_URL) {
  test("the shared database (REQUIREMENTS §83)", {
    skip: "SHARED_DB_TEST_URL is not set. These checks need a superuser's URL of a database to check (a copy): run npm run db:shared -- test, as docs/database/README.md says.",
  }, () => undefined);
} else {
  const facts = await readFacts(TEST_URL);
  let su: Client;
  before(async () => {
    su = await open(TEST_URL, "superuser");
  });
  after(async () => {
    await su?.end();
  });

  describe("the set-up is there", () => {
    it("has the schemas chatbot and overview, the three roles, and the seven views over DCRS's data", async () => {
      const r = (
        await rowsOf<{ schemas: string[]; roles: string[] }>(
          su,
          `SELECT ARRAY(SELECT nspname::text FROM pg_namespace WHERE nspname IN ('chatbot', 'overview') ORDER BY 1) AS schemas,
                  ARRAY(SELECT rolname::text FROM pg_roles WHERE rolname IN ('audit_assistant', 'overview_owner', 'overview_viewer') ORDER BY 1) AS roles`
        )
      )[0];
      assert.deepEqual(r.schemas, ["chatbot", "overview"], "Apply the set-up first: npm run db:shared -- setup");
      assert.deepEqual(r.roles, ["audit_assistant", "overview_owner", "overview_viewer"]);
      assert.deepEqual(DCRS_VIEWS.filter((v) => !facts.views.has(v)), [], "views of part 2 missing: apply npm run db:shared -- setup");
    });
  });

  // -------------------------------------------------------------------------
  describe("audit_assistant, the Audit Assistant's login", () => {
    it("is a plain login: no superuser, cannot make roles or databases, a member of no other role, at most 20 connections", async () => {
      const r = (
        await rowsOf<Record<string, unknown>>(
          su,
          `SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls, rolcanlogin, rolconnlimit,
                  (SELECT count(*)::int FROM pg_auth_members m WHERE m.member = r.oid) AS member_of
             FROM pg_roles r WHERE rolname = 'audit_assistant'`
        )
      )[0];
      assert.deepEqual(r, { rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolreplication: false, rolbypassrls: false, rolcanlogin: true, rolconnlimit: 20, member_of: 0 });
    });

    it("is refused SELECT, INSERT, UPDATE, DELETE and TRUNCATE on every table in public", async (t) => {
      const tables = await relationsIn(su, "public", ["r", "p", "v", "m", "f"]);
      assert.ok(tables.length >= 10, `DCRS's tables should be in public; found ${tables.length}`);
      const problems = await rolledBack(su, async () => {
        await su.query("SET LOCAL ROLE audit_assistant");
        const statements = tables.flatMap((x) => [`SELECT 1 FROM ${x.name} LIMIT 1`, ...(["r", "p"].includes(x.kind) ? [...writesTo(x), `TRUNCATE ${x.name}`] : [])]);
        return refusals(su, statements, ["42501"]);
      });
      noneOf(problems, "audit_assistant was not refused");
      t.diagnostic(`${tables.length} tables in public, each refused 5 ways: ${tables.map((x) => x.name.replace("public.", "")).join(", ")}`);
    });

    it("is refused every sequence in public", async (t) => {
      const sequences = await relationsIn(su, "public", ["S"]);
      const problems = await rolledBack(su, async () => {
        await su.query("SET LOCAL ROLE audit_assistant");
        return refusals(su, sequences.flatMap((s) => [`SELECT last_value FROM ${s.name}`, `SELECT nextval('${s.name}')`]), ["42501"]);
      });
      noneOf(problems, "audit_assistant was not refused");
      t.diagnostic(`${sequences.length} sequences: ${sequences.map((s) => s.name).join(", ")}`);
    });

    it("is refused every overview view", async (t) => {
      const views = await relationsIn(su, "overview", ["v"]);
      const problems = await rolledBack(su, async () => {
        await su.query("SET LOCAL ROLE audit_assistant");
        return refusals(su, views.flatMap((v) => [`SELECT 1 FROM ${v.name} LIMIT 1`, ...writesTo(v)]), ["42501"]);
      });
      noneOf(problems, "audit_assistant was not refused");
      t.diagnostic(`${views.length} views, each refused 4 ways`);
    });

    it("may run CREATE SCHEMA IF NOT EXISTS chatbot, as its migrations do at every start, and make a table in chatbot", async () => {
      await rolledBack(su, async () => {
        await su.query("SET LOCAL ROLE audit_assistant");
        await su.query("CREATE SCHEMA IF NOT EXISTS chatbot");
        await su.query("CREATE TABLE chatbot.shared_db_test_probe (id integer)");
        await su.query("INSERT INTO chatbot.shared_db_test_probe VALUES (1)");
      });
    });

    it("may not make anything in public or overview", async () => {
      const problems = await rolledBack(su, async () => {
        await su.query("SET LOCAL ROLE audit_assistant");
        return refusals(
          su,
          [
            "CREATE TABLE public.shared_db_test_probe (id integer)",
            "CREATE VIEW public.shared_db_test_probe AS SELECT 1 AS one",
            "CREATE FUNCTION public.shared_db_test_probe() RETURNS integer LANGUAGE sql AS 'SELECT 1'",
            "CREATE TABLE overview.shared_db_test_probe (id integer)",
            "CREATE VIEW overview.shared_db_test_probe AS SELECT 1 AS one",
            "CREATE FUNCTION overview.shared_db_test_probe() RETURNS integer LANGUAGE sql AS 'SELECT 1'",
          ],
          ["42501"]
        );
      });
      noneOf(problems, "audit_assistant could make something");
    });

    it("owns no schema but chatbot, and nothing outside it", async () => {
      const r = (
        await rowsOf<{ schemas: string[]; outside: string[] }>(
          su,
          // (A table's TOAST table, where PostgreSQL keeps its long values, sits in pg_toast and
          // belongs to the table's owner: part of the table, not something outside chatbot.)
          `SELECT ARRAY(SELECT nspname::text FROM pg_namespace WHERE nspowner = 'audit_assistant'::regrole ORDER BY 1) AS schemas,
                  ARRAY(SELECT c.oid::regclass::text FROM pg_class c WHERE c.relowner = 'audit_assistant'::regrole AND c.relnamespace <> 'chatbot'::regnamespace
                           AND c.relnamespace::regnamespace::text !~ '^pg_toast'
                        UNION ALL SELECT p.oid::regprocedure::text FROM pg_proc p WHERE p.proowner = 'audit_assistant'::regrole AND p.pronamespace <> 'chatbot'::regnamespace
                        UNION ALL SELECT t.oid::regtype::text FROM pg_type t WHERE t.typowner = 'audit_assistant'::regrole AND t.typnamespace <> 'chatbot'::regnamespace
                        UNION ALL SELECT 'database ' || datname FROM pg_database WHERE datdba = 'audit_assistant'::regrole) AS outside`
        )
      )[0];
      assert.deepEqual(r.schemas, ["chatbot"]);
      assert.deepEqual(r.outside, []);
    });

    it("needs CREATE on the database for CREATE SCHEMA IF NOT EXISTS on its own existing schema: both halves, on a scratch role", async () => {
      const role = `shared_db_test_scratch_${randomBytes(4).toString("hex")}`;
      const schema = `${role}_schema`;
      await rolledBack(su, async () => {
        await su.query(`CREATE ROLE ${role} NOLOGIN`);
        await su.query(`CREATE SCHEMA ${schema} AUTHORIZATION ${role}`);
        const may = (await rowsOf<{ may: boolean }>(su, `SELECT has_database_privilege('${role}', current_database(), 'CREATE') AS may`))[0].may;
        assert.equal(may, false, "the scratch role may already create in this database: PUBLIC holds CREATE on it");
        await su.query(`SET LOCAL ROLE ${role}`);
        const without = await attempt(su, `CREATE SCHEMA IF NOT EXISTS ${schema}`);
        assert.equal(without.code, "42501", `without CREATE on the database: ${without.code} ${without.message}`);
        assert.match(without.message, /permission denied for database/);
        await su.query("RESET ROLE");
        await su.query(`GRANT CREATE ON DATABASE ${quoteIdent(facts.database)} TO ${role}`);
        await su.query(`SET LOCAL ROLE ${role}`);
        const withIt = await attempt(su, `CREATE SCHEMA IF NOT EXISTS ${schema}`);
        assert.equal(withIt.code, "allowed", `with CREATE on the database: ${withIt.code} ${withIt.message}`);
      });
      const granted = (await rowsOf<{ may: boolean }>(su, "SELECT has_database_privilege('audit_assistant', current_database(), 'CREATE') AS may"))[0].may;
      assert.equal(granted, true, "audit_assistant must hold CREATE on the database (01-schemas-and-roles.sql grants it)");
    });

    it("a real sign-in has the 30 s statement limit, the 60 s idle-in-transaction limit and the search path chatbot, and is refused DCRS's tables", { skip: !ASSISTANT_PASSWORD && NO_ASSISTANT_PASSWORD }, async () => {
      const c = await open(withUser(TEST_URL, "audit_assistant", ASSISTANT_PASSWORD), "audit_assistant sign-in");
      try {
        const settings = Object.fromEntries(
          (await rowsOf<{ name: string; setting: string }>(c, "SELECT name, setting FROM pg_settings WHERE name IN ('statement_timeout', 'idle_in_transaction_session_timeout', 'search_path')")).map((r) => [r.name, r.setting])
        );
        assert.deepEqual(settings, { idle_in_transaction_session_timeout: "60000", search_path: "chatbot", statement_timeout: "30000" });
        const who = (await rowsOf<{ current_user: string; limit: number }>(c, "SELECT current_user, (SELECT rolconnlimit FROM pg_roles WHERE rolname = current_user) AS limit"))[0];
        assert.deepEqual(who, { current_user: "audit_assistant", limit: 20 });
        const problems = await rolledBack(c, async () => {
          const tables = await relationsIn(c, "public", ["r", "p"]);
          return refusals(c, tables.map((x) => `SELECT 1 FROM ${x.name} LIMIT 1`), ["42501"]);
        });
        noneOf(problems, "a real sign-in of audit_assistant read DCRS's tables");
        await rolledBack(c, async () => {
          await c.query("CREATE SCHEMA IF NOT EXISTS chatbot");
        });
      } finally {
        await c.end();
      }
    });
  });

  // -------------------------------------------------------------------------
  describe("PUBLIC (every role)", () => {
    it("holds no privilege on any table, view or sequence in public", async (t) => {
      const rows = await rowsOf<{ name: string; acl_entry: string | null; may: boolean }>(
        su,
        `SELECT c.oid::regclass::text AS name,
                (SELECT string_agg(a.privilege_type, ', ') FROM aclexplode(c.relacl) a WHERE a.grantee = 0) AS acl_entry,
                CASE WHEN c.relkind = 'S' THEN has_sequence_privilege('public', c.oid, 'USAGE, SELECT, UPDATE')
                     ELSE has_table_privilege('public', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') END AS may
           FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
          ORDER BY 1`
      );
      noneOf(rows.filter((r) => r.acl_entry || r.may).map((r) => `${r.name}: PUBLIC may ${r.acl_entry ?? "do something"}`), "PUBLIC holds a privilege on a DCRS table");
      t.diagnostic(`${rows.length} tables, views and sequences in public: no privilege for PUBLIC in any relacl`);
    });

    it("holds no privilege on any overview view or function", async () => {
      const rows = await rowsOf<{ what: string }>(
        su,
        `SELECT c.oid::regclass::text AS what FROM pg_class c
          WHERE c.relnamespace = 'overview'::regnamespace AND has_table_privilege('public', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
         UNION ALL
         SELECT p.oid::regprocedure::text FROM pg_proc p
          WHERE p.pronamespace = 'overview'::regnamespace AND has_function_privilege('public', p.oid, 'EXECUTE')`
      );
      noneOf(rows.map((r) => r.what), "PUBLIC may use");
    });
  });

  // -------------------------------------------------------------------------
  describe("overview_viewer, the viewer's login", () => {
    it("is a plain login, a member of no other role, with a read-only default", async () => {
      const r = (
        await rowsOf<Record<string, unknown>>(
          su,
          `SELECT rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolcanlogin,
                  (SELECT count(*)::int FROM pg_auth_members m WHERE m.member = r.oid) AS member_of,
                  'default_transaction_read_only=on' = ANY(rolconfig) AS read_only
             FROM pg_roles r WHERE rolname = 'overview_viewer'`
        )
      )[0];
      assert.deepEqual(r, { rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolbypassrls: false, rolcanlogin: true, member_of: 0, read_only: true });
    });

    it("may read every overview view", async (t) => {
      const views = await relationsIn(su, "overview", ["v"]);
      const problems = await rolledBack(su, async () => {
        await su.query("SET LOCAL ROLE overview_viewer");
        const wrong: string[] = [];
        for (const v of views) {
          const r = await attempt(su, `SELECT * FROM ${v.name} LIMIT 1`);
          if (r.code !== "allowed") wrong.push(`${v.name}: ${r.code} ${r.message}`);
        }
        return wrong;
      });
      noneOf(problems, "overview_viewer could not read");
      t.diagnostic(`${views.length} views read`);
    });

    it("is refused every table in public and chatbot", async (t) => {
      const tables = [...(await relationsIn(su, "public", ["r", "p", "v", "m", "f", "S"])), ...(await relationsIn(su, "chatbot", ["r", "p", "v", "m", "f", "S"]))];
      const problems = await rolledBack(su, async () => {
        await su.query("SET LOCAL ROLE overview_viewer");
        return refusals(su, tables.map((x) => (x.kind === "S" ? `SELECT last_value FROM ${x.name}` : `SELECT 1 FROM ${x.name} LIMIT 1`)), ["42501"]);
      });
      noneOf(problems, "overview_viewer read");
      t.diagnostic(`${tables.length} tables and sequences in public and chatbot, each refused`);
    });

    it("may not insert, change or delete anywhere, nor make anything in overview or public", async () => {
      const views = await relationsIn(su, "overview", ["v"]);
      const tables = await relationsIn(su, "public", ["r", "p"]);
      const privileges = await rowsOf<{ what: string }>(
        su,
        `SELECT c.oid::regclass::text || ' (' || p || ')' AS what FROM pg_class c
          CROSS JOIN unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p
          WHERE c.relnamespace IN ('overview'::regnamespace, 'public'::regnamespace) AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
            AND has_table_privilege('overview_viewer', c.oid, p)
         UNION ALL
         SELECT s || ' (CREATE)' FROM unnest(ARRAY['overview', 'public', 'chatbot']) s
          WHERE to_regnamespace(s) IS NOT NULL AND has_schema_privilege('overview_viewer', s, 'CREATE')`
      );
      noneOf(privileges.map((r) => r.what), "overview_viewer holds a privilege to write");
      const problems = await rolledBack(su, async () => {
        await su.query("SET LOCAL ROLE overview_viewer");
        return [
          // A view is refused either for want of the privilege or because it cannot be written at all.
          ...(await refusals(su, views.flatMap(writesTo), ["42501", "0A000", "55000"])),
          ...(await refusals(su, tables.flatMap(writesTo), ["42501"])),
          ...(await refusals(
            su,
            [
              "CREATE TABLE overview.shared_db_test_probe (id integer)",
              "CREATE VIEW overview.shared_db_test_probe AS SELECT 1 AS one",
              "CREATE TABLE public.shared_db_test_probe (id integer)",
              "CREATE FUNCTION public.shared_db_test_probe() RETURNS integer LANGUAGE sql AS 'SELECT 1'",
            ],
            ["42501"]
          )),
        ];
      });
      noneOf(problems, "overview_viewer was not refused");
    });

    it("a real sign-in is read-only by default: it reads the views but cannot write, nor make even a temporary table", { skip: !VIEWER_PASSWORD && NO_VIEWER_PASSWORD }, async () => {
      const c = await open(withUser(TEST_URL, "overview_viewer", VIEWER_PASSWORD), "overview_viewer sign-in");
      try {
        const settings = Object.fromEntries(
          (await rowsOf<{ name: string; setting: string }>(c, "SELECT name, setting FROM pg_settings WHERE name IN ('default_transaction_read_only', 'transaction_read_only', 'search_path', 'statement_timeout')")).map((r) => [r.name, r.setting])
        );
        assert.deepEqual(settings, { default_transaction_read_only: "on", search_path: "overview", statement_timeout: "60000", transaction_read_only: "on" });
        await c.query("SELECT count(*) FROM overview.findings");
        await c.query("SELECT count(*) FROM overview.dcrs_downloads");
        const problems = await rolledBack(c, async () => [
          ...(await refusals(c, ["CREATE TEMP TABLE shared_db_test_probe (id integer)", "CREATE TABLE overview.shared_db_test_probe (id integer)"], ["25006"])),
          ...(await refusals(c, ["INSERT INTO public.activity_log (action) VALUES ('probe')", "DELETE FROM public.app_storage WHERE false"], ["25006", "42501"])),
          ...(await refusals(c, ["INSERT INTO overview.findings DEFAULT VALUES", "DELETE FROM overview.records WHERE false"], ["25006", "42501", "0A000", "55000"])),
        ]);
        noneOf(problems, "a real sign-in of overview_viewer was not refused");
      } finally {
        await c.end();
      }
    });
  });

  // -------------------------------------------------------------------------
  describe("overview_owner, the owner of the views over the assistant's tables", () => {
    it("reads DCRS only through the DCRS views: no privilege on any table in public", async () => {
      const rows = await rowsOf<{ what: string }>(
        su,
        `SELECT c.oid::regclass::text AS what FROM pg_class c
          WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
            AND has_table_privilege('overview_owner', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')`
      );
      noneOf(rows.map((r) => r.what), "overview_owner may use");
    });

    it("may not read the assistant's secrets: connector_credentials, chat text, file bytes, handed-out content, session tokens, a person's own words", { skip: (!facts.chatbot && NO_CHATBOT) || (!facts.part3 && NO_PART_3) }, async (t) => {
      const secretColumns = Object.entries(SECRETS).filter(([table]) => table.startsWith("chatbot."));
      const catalog = await rowsOf<{ what: string }>(
        su,
        `SELECT 'chatbot.' || c.relname AS what FROM pg_class c
          WHERE c.relnamespace = 'chatbot'::regnamespace AND c.relkind IN ('r', 'p') AND has_table_privilege('overview_owner', c.oid, 'SELECT')
         UNION ALL
         SELECT 'chatbot.connector_credentials (a column of it)' WHERE has_any_column_privilege('overview_owner', 'chatbot.connector_credentials', 'SELECT')`
      );
      noneOf(catalog.map((r) => r.what), "overview_owner may read the whole of");
      let tried = 0;
      const problems = await rolledBack(su, async () => {
        await su.query("SET LOCAL ROLE overview_owner");
        const statements: string[] = ["SELECT 1 FROM chatbot.connector_credentials LIMIT 1", "SELECT * FROM chatbot.connector_credentials LIMIT 1"];
        for (const [table, columns] of secretColumns) {
          if (columns === "all") continue;
          for (const column of columns) statements.push(`SELECT ${quoteIdent(column)} FROM ${table} LIMIT 1`);
        }
        tried = statements.length;
        return refusals(su, statements, ["42501"]);
      });
      noneOf(problems, "overview_owner read a secret");
      t.diagnostic(`${tried} reads of secret columns refused`);
    });
  });

  // -------------------------------------------------------------------------
  describe("no view reaches a secret", () => {
    it("the four detectors find what they should: probe views that break each rule are caught (rolled back)", async () => {
      await rolledBack(su, async () => {
        await su.query("CREATE VIEW overview.shared_db_test_probe_column AS SELECT u.password_hash FROM public.users u");
        await su.query("CREATE VIEW overview.shared_db_test_probe_row AS SELECT to_jsonb(u) AS everything, u.id FROM public.users u");
        await su.query("CREATE VIEW overview.shared_db_test_probe_storage AS WITH s AS (SELECT a.value FROM public.app_storage a WHERE a.scope = 'company' AND a.key = 'settings') SELECT * FROM s");
        await su.query("CREATE FUNCTION overview.shared_db_test_probe_function() RETURNS integer LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'");
        await su.query("CREATE VIEW overview.shared_db_test_probe_definer AS SELECT overview.shared_db_test_probe_function() AS one");
        assert.deepEqual((await secretColumnUses(su)).found, ["shared_db_test_probe_column reads public.users.password_hash"]);
        assert.deepEqual(await wholeRowUses(su), ["shared_db_test_probe_row uses whole rows of public.users"]);
        assert.deepEqual((await appStorageReads(su)).found, ["shared_db_test_probe_storage reads app_storage 1 time(s), only 0 of them limited to the company's records, documents or master"]);
        assert.deepEqual(await securityDefinerUses(su), [
          "overview has the SECURITY DEFINER function overview.shared_db_test_probe_function()",
          "shared_db_test_probe_definer calls overview.shared_db_test_probe_function()",
        ]);
      });
    });

    it("no overview view depends on a secret column, nor on connector_credentials at all (pg_depend)", async (t) => {
      const { found, dependencies } = await secretColumnUses(su);
      assert.ok(dependencies > 20, `too few dependencies read (${dependencies}): the check itself is broken`);
      noneOf(found, "a view reaches a secret");
      t.diagnostic(`${dependencies} column and table dependencies of the overview views checked`);
    });

    it("no overview view uses a whole row of a table that holds a secret (pg_rewrite)", async () => {
      noneOf(await wholeRowUses(su), "a view uses whole rows");
    });

    it("no overview view calls a SECURITY DEFINER function", async () => {
      noneOf(await securityDefinerUses(su), "SECURITY DEFINER");
    });

    it("every view that reads app_storage reads only the company's records, documents and master (pg_get_viewdef)", async (t) => {
      const { found, views } = await appStorageReads(su);
      assert.deepEqual(views, ["customer_complaints", "findings", "pest_control_reports_by_day", "records"]);
      noneOf(found, "a view reads more of app_storage");
      t.diagnostic(`views reading app_storage: ${views.join(", ")}`);
    });
  });

  // -------------------------------------------------------------------------
  describe("DCRS unchanged: setup changes nothing in public (on a fresh database restored for the purpose)", () => {
    const fresh = `${facts.database.slice(0, 30)}_unchanged_check_${randomBytes(3).toString("hex")}`;
    const freshUrl = withDatabase(TEST_URL, fresh);
    let made = false;
    let source = "";
    let before0: unknown;

    const setup = (flags: string[]): string => {
      const run = spawnSync(process.execPath, ["--no-warnings=ExperimentalWarning", SCRIPT, "setup", ...flags], {
        cwd: ROOT,
        encoding: "utf8",
        // Never the passwords: the roles are the whole server's, and this is a check, not a set-up.
        env: { ...process.env, SUPERUSER_DATABASE_URL: freshUrl, AUDIT_ASSISTANT_PASSWORD: "", OVERVIEW_VIEWER_PASSWORD: "" },
      });
      assert.equal(run.status, 0, `setup ${flags.join(" ")} failed:\n${run.stdout}\n${run.stderr}`);
      assert.match(run.stdout, /Done, in one transaction\./);
      return run.stdout;
    };
    const snapshot = async (): Promise<unknown> => {
      const c = await open(freshUrl, "fresh database");
      try {
        return await snapshotOfPublic(c);
      } finally {
        await c.end();
      }
    };

    before(async () => {
      const where = (await rowsOf<{ datcollate: string; datctype: string }>(su, "SELECT datcollate, datctype FROM pg_database WHERE datname = current_database()"))[0];
      await su.query(`CREATE DATABASE ${quoteIdent(fresh)} TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE '${where.datcollate}' LC_CTYPE '${where.datctype}'`);
      made = true;
      const restore = findPgTool("pg_restore", facts.major);
      const into = toolConnection(freshUrl);
      if (TEST_DUMP) {
        runTool(restore.path, ["--no-password", "--single-transaction", `--dbname=${into.url}`, TEST_DUMP], into.env);
        source = `restored from ${TEST_DUMP}`;
      } else {
        const dir = mkdtempSync(path.join(os.tmpdir(), "dcrs-db-test-"));
        try {
          const dump = findPgTool("pg_dump", facts.major);
          const from = toolConnection(TEST_URL);
          const file = path.join(dir, "dcrs.dump");
          // Everything but what the shared set-up adds: DCRS's database as it was before it.
          runTool(dump.path, ["--format=custom", "--no-password", "--exclude-schema=overview", "--exclude-schema=chatbot", `--file=${file}`, `--dbname=${from.url}`], from.env);
          runTool(restore.path, ["--no-password", "--single-transaction", `--dbname=${into.url}`, file], into.env);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
        source = `a copy of ${facts.database} without the schemas overview and chatbot`;
      }
      before0 = await snapshot();
    });

    after(async () => {
      if (made) await su.query(`DROP DATABASE IF EXISTS ${quoteIdent(fresh)} WITH (FORCE)`);
    });

    it("setup (parts 1 and 2) leaves every table, column, type, default, index, constraint, trigger, owner, grant and comment in public as it was", async (t) => {
      const c = await open(freshUrl, "fresh database");
      try {
        const tables = (await rowsOf<{ n: number }>(c, "SELECT count(*)::int AS n FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'"))[0].n;
        assert.ok(tables >= 10, `the fresh database should hold DCRS's tables; it holds ${tables}`);
      } finally {
        await c.end();
      }
      setup([]);
      const after1 = await snapshot();
      noneOf(differences(before0, after1), "setup changed public");
      const again = setup([]);
      noneOf(differences(before0, await snapshot()), "setup, run a second time, changed public");
      assert.match(again, /views over DCRS's data\.* applied: 7 views/);
      t.diagnostic(`fresh database ${fresh}: ${source}; setup run twice; public's catalog identical (${JSON.stringify(before0).length} characters compared)`);
    });

    it("with --with-dcrs-comments only comments change, and every DCRS table and column gets one", async () => {
      setup(["--with-dcrs-comments"]);
      const after2 = await snapshot();
      noneOf(differences(withoutComments(before0), withoutComments(after2)), "setup --with-dcrs-comments changed more than comments");
      const c = await open(freshUrl, "fresh database");
      try {
        noneOf(await uncommented(c, "public"), "DCRS tables or columns left without a comment by database/sql/optional/dcrs-table-comments.sql");
      } finally {
        await c.end();
      }
    });

    it("setup refuses, and changes nothing, when the URL is not a superuser's", { skip: !VIEWER_PASSWORD && NO_VIEWER_PASSWORD }, async () => {
      const run = spawnSync(process.execPath, ["--no-warnings=ExperimentalWarning", SCRIPT, "setup", "--with-dcrs-comments"], {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, SUPERUSER_DATABASE_URL: withUser(freshUrl, "overview_viewer", VIEWER_PASSWORD), AUDIT_ASSISTANT_PASSWORD: "", OVERVIEW_VIEWER_PASSWORD: "" },
      });
      assert.equal(run.status, 2, `${run.stdout}\n${run.stderr}`);
      assert.match(run.stderr, /REFUSED: overview_viewer is not a superuser/);
      assert.match(run.stderr, /Nothing was changed\./);
    });
  });

  // -------------------------------------------------------------------------
  describe("live: a change made in DCRS shows in the overview at once", () => {
    it("closing a finding in the stored records, as DCRS does, shows in overview.findings in the same transaction, for the viewer (rolled back)", async (t) => {
      const today = await factoryToday(su);
      let shown: { status: string; action_date: string | null; entries: number; by: string | null } | undefined;
      let reference = "";
      let beforeStatus = "";
      await rolledBack(su, async () => {
        const { records } = await storedRecords(su);
        let found = identifyFindings(records).find((f) => f.ref && isOpenStatus(findingStatus(f.finding, today)));
        let list: StoredRecord[] = records;
        if (!found) {
          // No open finding in this database: add a report with one, first.
          const report: StoredRecord = { id: "shared-db-test-live", documentId: "gap-inspection", isDemo: false, status: "In Progress", dueDate: today, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), data: { findings: [{ id: "live-1", sNo: 1, status: "Open", targetDate: null, actualDateOfAction: null }] } };
          list = [...records, report];
          await writeRecords(su, list);
          found = identifyFindings(list).find((f) => f.record.id === report.id);
        }
        assert.ok(found?.ref);
        reference = found.ref;
        beforeStatus = findingStatus(found.finding, today);
        const history = Array.isArray(found.record.history) ? found.record.history.length : 0;
        const { record: closed } = closeFindingChange(found.record, found.position, { today, at: new Date().toISOString(), by: "Database test", note: "Through database test: rolled back", historyId: "shared-db-test-live" });
        await writeRecords(su, list.map((r) => (r === found!.record ? closed : r)));
        await su.query("SET LOCAL ROLE overview_viewer");
        const f = (await rowsOf<{ status: string; action_date: string | null }>(su, "SELECT status, action_date::text FROM overview.findings WHERE finding_reference = $1", [reference]))[0];
        const r = (await rowsOf<{ entries: number; by: string | null }>(su, "SELECT history_entries AS entries, last_changed_by AS by FROM overview.records WHERE record_id = $1", [closed.id]))[0];
        shown = { ...f, entries: r.entries - history, by: r.by };
      });
      assert.deepEqual(shown, { status: "Closed", action_date: today, entries: 1, by: "Database test" });
      const now = await rowsOf<{ status: string }>(su, "SELECT status FROM overview.findings WHERE finding_reference = $1", [reference]);
      assert.deepEqual(now.map((r) => r.status), reference.startsWith("shared-db-test") ? [] : [beforeStatus], "after the roll-back the view shows the stored finding again");
      t.diagnostic(`finding ${reference}: ${beforeStatus} -> Closed inside the transaction, ${beforeStatus} again after it`);
    });
  });

  // -------------------------------------------------------------------------
  describe("the readable finding id (contract C2): the view and backend/findingsCore.ts agree", () => {
    type Named = { record_id: string; finding_id: string; finding_reference: string | null; finding_number: number; status: string };
    const fromView = async (): Promise<Named[]> =>
      (await rowsOf<Named & { finding_number: string }>(su, "SELECT record_id, finding_id, finding_reference, finding_number::text, status FROM overview.findings"))
        .map((r) => ({ ...r, finding_number: Number(r.finding_number) }))
        .sort((a, b) => (a.record_id + " " + a.finding_id < b.record_id + " " + b.finding_id ? -1 : 1));
    const fromCode = (records: readonly StoredRecord[], today: string): Named[] =>
      identifyFindings(records)
        .map((f) => ({ record_id: f.record.id, finding_id: f.id, finding_reference: f.ref, finding_number: f.number, status: findingStatus(f.finding, today) }))
        .sort((a, b) => (a.record_id + " " + a.finding_id < b.record_id + " " + b.finding_id ? -1 : 1));

    it("on every finding of this database", async (t) => {
      const { view, code } = await rolledBack(su, async () => {
        await su.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
        const today = await factoryToday(su);
        const { records } = await storedRecords(su);
        return { view: await fromView(), code: fromCode(records, today) };
      });
      assert.deepEqual(view, code);
      t.diagnostic(`${view.length} findings, the same id, reference, number and status on both sides: ${view.map((f) => f.finding_id).join(", ")}`);
    });

    it("on made-up reports that hit every rule: 28 reports on one day, repeated, missing and odd numbers, demo and undated reports (rolled back)", async (t) => {
      const { view, code, made } = await rolledBack(su, async () => {
        const today = await factoryToday(su);
        const { records } = await storedRecords(su);
        const extra = madeUpReports(today);
        const all = [...records, ...extra];
        await writeRecords(su, all);
        return { view: await fromView(), code: fromCode(all, today), made: extra };
      });
      assert.deepEqual(view, code);
      const ids = new Set(view.map((f) => f.finding_id));
      for (const id of ["CAPA-2099-01-15-1", "CAPA-2099-01-15b-1", "CAPA-2099-01-15z-1", "CAPA-2099-01-15-27-1", "CAPA-2099-01-15-28-1", "CAPA-2099-01-16-1.2", "CAPA-2099-01-16-1.3", "CAPA-2099-01-16-4.2", "CAPA--1"]) {
        assert.ok(ids.has(id), `${id} should be among the ids`);
      }
      t.diagnostic(`${made.length} made-up reports added; ${view.length} findings named alike`);
    });
  });

  // -------------------------------------------------------------------------
  describe("the department map: overview.department_of_document is DCRS's own rule", () => {
    it("equals departmentOfDocument (frontend/src/data/seed/documentDepartments.ts) for every stored document, every mapped id, and awkward numbers", async (t) => {
      const stored = await rowsOf<{ id: string; format_number: string | null }>(
        su,
        `SELECT d->>'id' AS id, CASE WHEN jsonb_typeof(d->'formatNo') = 'string' THEN d->>'formatNo' END AS format_number
           FROM public.app_storage s CROSS JOIN LATERAL jsonb_array_elements(s.value::jsonb) d
          WHERE s.scope = 'company' AND s.key = 'documents' AND jsonb_typeof(s.value::jsonb) = 'array' AND jsonb_typeof(d->'id') = 'string'`
      );
      const cases: { id: string; format_number: string | null }[] = [
        ...stored,
        ...Object.keys(DOCUMENT_DEPARTMENTS).map((id) => ({ id, format_number: null })),
        ...[
          ["no-such-document", "F/QC/37"], ["no-such-document", "f-hr-17"], ["no-such-document", "F/QC-09"], ["no-such-document", "F/QCA/01"],
          ["no-such-document", "F/DISP/02"], ["no-such-document", "F: QA/PRO/FL/CCT/01"], ["no-such-document", "TO BE CONFIRMED"],
          ["no-such-document", ""], ["no-such-document", null], ["constructor", null], ["__proto__", "F/HR/1"], ["gap-inspection", "F/HR/17"],
          ["no-such-document", "F/QA/"], ["no-such-document", " F/QC/37"], ["no-such-document", "F/QCX/37"], ["no-such-document", "FF/QC/37"],
        ].map(([id, format_number]) => ({ id: id as string, format_number })),
      ];
      const sql = await rowsOf<{ i: number; code: string | null }>(
        su,
        `SELECT i::int, overview.department_of_document(c->>'id', c->>'format_number') AS code
           FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS x(c, i)`,
        [JSON.stringify(cases)]
      );
      const wrong = sql
        .map((r) => ({ c: cases[r.i - 1], sql: r.code, ts: departmentOfDocument(cases[r.i - 1].id, cases[r.i - 1].format_number ?? undefined) }))
        .filter((x) => x.sql !== x.ts)
        .map((x) => `${x.c.id} / ${JSON.stringify(x.c.format_number)}: SQL says ${x.sql}, DCRS says ${x.ts}`);
      noneOf(wrong, "the department map differs");
      assert.ok(stored.length > 0, "no stored documents were read");
      t.diagnostic(`${stored.length} stored documents, ${Object.keys(DOCUMENT_DEPARTMENTS).length} mapped ids and 16 awkward cases agree`);
    });

    it("names every department as DCRS does (PLANT_DEPARTMENTS)", async () => {
      const rows = await rowsOf<{ code: string; name: string | null }>(
        su,
        "SELECT c AS code, overview.department_name(c) AS name FROM unnest($1::text[]) c",
        [PLANT_DEPARTMENTS.map((d) => d.code)]
      );
      assert.deepEqual(rows.map((r) => [r.code, r.name]), PLANT_DEPARTMENTS.map((d) => [d.code, d.name]));
    });
  });

  // -------------------------------------------------------------------------
  describe("the views: sensible counts, comments, and fast", () => {
    it("each view holds as many rows as the data under it", async (t) => {
      const { got, want } = await rolledBack(su, async () => {
        await su.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
        const today = await factoryToday(su);
        const { records } = await storedRecords(su);
        const live = records.filter((r) => r && r.isDemo === false);
        const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
        const pestDays = new Set(live.filter((r) => r.documentId === "daily-pest-monitoring" && isDate(r.dueDate)).map((r) => r.dueDate as string));
        const first = [...pestDays].sort()[0];
        const dayCount = first && first <= today ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000) + 1 : 0;
        const raw = (
          await rowsOf<Record<string, number>>(
            su,
            `SELECT (SELECT count(*)::int FROM public.users) AS users,
                    (SELECT count(*)::int FROM public.activity_log) + (SELECT count(*)::int FROM public.activity_log_archive) AS lines,
                    (SELECT count(*)::int FROM (SELECT action FROM public.activity_log UNION ALL SELECT action FROM public.activity_log_archive) a
                      WHERE a.action = ANY($1::text[])) AS downloads`,
            [DOWNLOAD_ACTIONS]
          )
        )[0];
        const want: Record<string, number> = {
          dcrs_accounts: raw.users,
          records: live.length,
          findings: identifyFindings(records).length,
          customer_complaints: live.filter((r) => r.documentId === "capa-customer-complaint").length,
          pest_control_reports_by_day: dayCount,
          "pest_control_reports_by_day with a record": [...pestDays].filter((d) => d <= today).length,
          dcrs_activity: raw.lines,
          dcrs_downloads: raw.downloads,
        };
        if (facts.part3) {
          const a = (
            await rowsOf<Record<string, number>>(
              su,
              `SELECT (SELECT count(*)::int FROM chatbot.sessions) AS sessions, (SELECT count(*)::int FROM chatbot.login_events) AS sign_ins,
                      (SELECT count(*)::int FROM chatbot.actions) AS actions, (SELECT count(*)::int FROM chatbot.conversation_exports) AS handouts`
            )
          )[0];
          Object.assign(want, { people: raw.users, assistant_sessions: a.sessions, assistant_sign_ins: a.sign_ins, assistant_activity: a.actions, file_handouts: a.handouts, downloads: raw.downloads + a.handouts });
        }
        const got: Record<string, number> = {};
        for (const view of Object.keys(want)) {
          if (view.includes(" ")) continue;
          got[view] = (await rowsOf<{ n: number }>(su, `SELECT count(*)::int AS n FROM overview.${quoteIdent(view)}`))[0].n;
        }
        got["pest_control_reports_by_day with a record"] = (await rowsOf<{ n: number }>(su, "SELECT count(record_id)::int AS n FROM overview.pest_control_reports_by_day"))[0].n;
        return { got, want };
      });
      assert.deepEqual(got, want);
      for (const [view, n] of Object.entries(want)) if (n > 0) assert.ok(got[view] > 0, `${view} is empty while its data has rows`);
      t.diagnostic(Object.entries(got).map(([v, n]) => `${v} ${n}`).join(", "));
    });

    it("each view answers in under 5 seconds, read in full by the viewer", async (t) => {
      const views = await relationsIn(su, "overview", ["v"]);
      const times = await rolledBack(su, async () => {
        await su.query("SET LOCAL ROLE overview_viewer");
        const out: [string, number, number][] = [];
        for (const v of views) {
          const start = performance.now();
          const { rowCount } = await su.query(`SELECT * FROM ${v.name}`);
          out.push([v.name.replace("overview.", ""), Math.round(performance.now() - start), rowCount ?? 0]);
        }
        return out;
      });
      noneOf(times.filter(([, ms]) => ms >= 5000).map(([v, ms]) => `${v}: ${ms} ms`), "a view took 5 seconds or more");
      t.diagnostic(times.map(([v, ms, n]) => `${v} ${ms} ms (${n} rows)`).join(", "));
    });

    it("every view and every column in overview has a comment", async () => {
      noneOf(await uncommented(su, "overview"), "without a comment");
    });

    it("the optional comments on the assistant's tables leave no table or column without one (rolled back)", { skip: !facts.chatbot && NO_CHATBOT }, async () => {
      const missing = await rolledBack(su, async () => {
        await su.query(readFileSync(path.join(ROOT, "database", "sql", "optional", "chatbot-table-comments.sql"), "utf8"));
        return uncommented(su, "chatbot");
      });
      noneOf(missing, "left without a comment by database/sql/optional/chatbot-table-comments.sql");
    });

    it("the assistant's views read what the assistant writes: people, sessions, sign-ins, actions tied to DCRS records, hand-outs, downloads; never a secret (rolled back)", { skip: (!facts.chatbot && NO_CHATBOT) || (!facts.part3 && NO_PART_3) }, async (t) => {
      await rolledBack(su, async () => {
        const person = (
          await rowsOf<{ person_id: string; name: string; email: string }>(
            su,
            `SELECT person_id, name, email FROM overview.dcrs_accounts a
              WHERE NOT EXISTS (SELECT 1 FROM chatbot.users u WHERE u.provider = 'dcrs' AND u.external_id = a.person_id)
                AND NOT EXISTS (SELECT 1 FROM chatbot.login_events e WHERE lower(btrim(e.username)) = lower(a.email))
                AND NOT EXISTS (SELECT 1 FROM chatbot.conversation_exports x WHERE lower(btrim(x.username)) = lower(a.email))
              ORDER BY name, email LIMIT 1`
          )
        )[0];
        assert.ok(person, "no DCRS account to try with");
        const finding = (await rowsOf<{ finding_id: string; finding_reference: string; record_id: string; report_date: string }>(su, "SELECT finding_id, finding_reference, record_id, report_date::text FROM overview.findings WHERE finding_reference IS NOT NULL LIMIT 1"))[0];
        const day = (await rowsOf<{ report_date: string; record_id: string }>(su, "SELECT report_date::text, record_id FROM overview.pest_control_reports_by_day WHERE record_id IS NOT NULL ORDER BY report_date DESC LIMIT 1"))[0];
        const device = JSON.stringify({ name: "Test Phone", model: "Pixel 8", os: "Android", osVersion: "15", appVersion: "1.0.0" });

        await su.query("SET LOCAL ROLE audit_assistant");
        const userId = (await rowsOf<{ id: string }>(su, "INSERT INTO chatbot.users (provider, external_id, username, display_name) VALUES ('dcrs', $1, $2, $3) RETURNING id", [person.person_id, person.email, person.name]))[0].id;
        const sessionId = (
          await rowsOf<{ id: string }>(
            su,
            `INSERT INTO chatbot.sessions (user_id, token_hash, device_id, device_name, device_model, os, os_version, app_version, user_agent, sign_in_ip, last_ip, expires_at)
             VALUES ($1, 'SECRET-shared-db-test-token', 'shared-db-test-device', 'Test Phone', 'Pixel 8', 'Android', '15', '1.0.0', 'AuditAssistant/1.0 (test)', '10.0.0.5', '10.0.0.6', now() + interval '30 days') RETURNING id`,
            [userId]
          )
        )[0].id;
        await su.query("INSERT INTO chatbot.login_events (user_id, session_id, username, success, ip, user_agent, device) VALUES ($1, $2, $3, true, '10.0.0.5', 'AuditAssistant/1.0 (test)', $4::jsonb)", [userId, sessionId, person.email, device]);
        await su.query("INSERT INTO chatbot.login_events (user_id, username, success, failure_reason, ip) VALUES (NULL, upper($1), false, 'invalid_credentials', '10.0.0.9')", [person.email]);
        const act = async (action: string, kind: string, input: object, status: string): Promise<void> => {
          await su.query(
            `INSERT INTO chatbot.actions (user_id, session_id, conversation_id, connector_id, action, kind, input, summary, status, request, finished_at)
             VALUES ($1, $2, gen_random_uuid(), 'dcrs', $3, $4, $5::jsonb, 'A test action', $6, 'SECRET-shared-db-test words', CASE WHEN $6 = 'succeeded' THEN now() END)`,
            [userId, sessionId, action, kind, JSON.stringify(input), status]
          );
        };
        if (finding) {
          await act("close_finding", "write", { findingId: `  ${finding.finding_id.toLowerCase()} `, note: "Done" }, "succeeded");
          await act("get_finding", "read", { ref: finding.finding_reference }, "succeeded");
        }
        if (day) await act("get_pest_control_report", "read", { date: day.report_date }, "awaiting_confirmation");
        await su.query("INSERT INTO chatbot.message_events (user_id, session_id, conversation_id, chars, attachments) VALUES ($1, $2, gen_random_uuid(), 42, 1)", [userId, sessionId]);
        await su.query(
          `INSERT INTO chatbot.conversation_exports (kind, purpose, user_id, username, display_name, session_id, conversation_id, conversation_title, source, filename,
                                                     mime_type, size_bytes, sha256, content_bytes, ip, user_agent, device, time_zone)
           VALUES ('file', 'download', $1, $2, $3, $4, gen_random_uuid(), 'SECRET-shared-db-test title', 'Digital Controlled Record System', 'shared-db-test report.pdf',
                   'application/pdf', 2048, repeat('a', 64), '\\x00'::bytea, '10.0.0.6', 'AuditAssistant/1.0 (test)', $5::jsonb, 'Asia/Kolkata')`,
          [userId, person.email, person.name, sessionId, device]
        );

        await su.query("SET LOCAL ROLE overview_viewer");
        const p = (await rowsOf<Record<string, unknown>>(
          su,
          `SELECT assistant_sign_ins, assistant_failed_sign_ins, assistant_devices, assistant_signed_in_devices, assistant_last_ip_address,
                  assistant_messages_sent, assistant_actions, assistant_first_sign_in_factory_time IS NOT NULL AS first_known
             FROM overview.people WHERE person_id = $1`,
          [person.person_id]
        ))[0];
        assert.deepEqual(p, { assistant_sign_ins: 1, assistant_failed_sign_ins: 1, assistant_devices: 1, assistant_signed_in_devices: 1, assistant_last_ip_address: "10.0.0.6", assistant_messages_sent: 1, assistant_actions: (finding ? 2 : 0) + (day ? 1 : 0), first_known: true });
        const s = (await rowsOf<Record<string, unknown>>(su, "SELECT person_id, person_name, operating_system, state, end_reason FROM overview.assistant_sessions WHERE session_id = $1", [sessionId]))[0];
        assert.deepEqual(s, { person_id: person.person_id, person_name: person.name, operating_system: "Android 15", state: "Signed in", end_reason: null });
        const sign = await rowsOf<Record<string, unknown>>(su, "SELECT result, failure_reason, person_id, device FROM overview.assistant_sign_ins WHERE person_id = $1 ORDER BY result DESC", [person.person_id]);
        assert.deepEqual(sign, [
          { result: "Signed in", failure_reason: null, person_id: person.person_id, device: "Test Phone, Pixel 8, Android 15, app 1.0.0" },
          { result: "Refused", failure_reason: "Wrong username or password", person_id: person.person_id, device: null },
        ]);
        const acts = await rowsOf<Record<string, unknown>>(
          su,
          "SELECT dcrs_action, reads_or_changes, status, dcrs_record_id, finding_id, document_name IS NOT NULL AS named, record_date::text FROM overview.assistant_activity WHERE person_id = $1 ORDER BY dcrs_action",
          [person.person_id]
        );
        const expected: Record<string, unknown>[] = [];
        if (finding) {
          expected.push({ dcrs_action: "Close finding", reads_or_changes: "Changes", status: "Done", dcrs_record_id: finding.record_id, finding_id: finding.finding_id, named: true, record_date: finding.report_date });
          expected.push({ dcrs_action: "Get finding", reads_or_changes: "Reads", status: "Done", dcrs_record_id: finding.record_id, finding_id: finding.finding_id, named: true, record_date: finding.report_date });
        }
        if (day) expected.push({ dcrs_action: "Get pest control report", reads_or_changes: "Reads", status: "Waiting for confirmation", dcrs_record_id: day.record_id, finding_id: null, named: true, record_date: day.report_date });
        assert.deepEqual(acts, expected);
        const h = (await rowsOf<Record<string, unknown>>(su, "SELECT person_id, kind, what_happened, file_type, device FROM overview.file_handouts WHERE file_name = 'shared-db-test report.pdf'"))[0];
        assert.deepEqual(h, { person_id: person.person_id, kind: "File", what_happened: "Downloaded", file_type: "application/pdf", device: "Test Phone, Pixel 8, Android 15, app 1.0.0" });
        const d = (await rowsOf<Record<string, unknown>>(su, "SELECT system, person_name, what_happened, detail FROM overview.downloads WHERE what = 'shared-db-test report.pdf'"))[0];
        assert.deepEqual(d, { system: "Audit Assistant", person_name: person.name, what_happened: "Downloaded a file", detail: "from Digital Controlled Record System, application/pdf, 2048 bytes" });

        const leaks: string[] = [];
        for (const v of await relationsIn(su, "overview", ["v"])) {
          const n = (await rowsOf<{ n: number }>(su, `SELECT count(*)::int AS n FROM ${v.name} t WHERE t::text LIKE '%SECRET-shared-db-test%'`))[0].n;
          if (n) leaks.push(`${v.name}: ${n} row(s)`);
        }
        noneOf(leaks, "a secret the assistant wrote shows in");
        t.diagnostic(`sample rows for ${person.name}: every assistant view read them back; no view shows the token, the title or the person's words`);
      });
    });
  });
}

/** Made-up internal CAPA reports that exercise every rule of contract C2 and C3. */
function madeUpReports(today: string): StoredRecord[] {
  const base = { documentId: "gap-inspection", isDemo: false, status: "In Progress", updatedAt: "2099-01-01T00:00:00.000Z" };
  const out: StoredRecord[] = [];
  // 28 live reports on one day: 2099-01-15, then b ... z, then -27 and -28. Made in pairs at the same
  // moment, so the record id decides within a pair; one has no time at all, so it comes first.
  for (let i = 0; i < 28; i++) {
    const made = i === 5 ? undefined : `2099-01-15T08:${String(Math.floor(i / 2)).padStart(2, "0")}:00.000Z`;
    out.push({ ...base, id: `shared-db-test-day-${String(27 - i).padStart(2, "0")}`, dueDate: "2099-01-15", createdAt: made, data: { findings: [{ id: `day-${i}`, sNo: 1, status: "Open" }] } });
  }
  // Not live: never named, and they must not push the live reports' letters along.
  out.push({ ...base, id: "shared-db-test-demo", isDemo: true, dueDate: "2099-01-15", createdAt: "2000-01-01T00:00:00.000Z", data: { findings: [{ id: "demo-1", sNo: 1 }] } });
  const { isDemo: _live, ...noFlag } = base;
  out.push({ ...noFlag, id: "shared-db-test-no-flag", dueDate: "2099-01-15", createdAt: "2000-01-01T00:00:00.000Z", data: { findings: [{ id: "flag-1", sNo: 1 }] } } as StoredRecord);
  // One report with every awkward finding.
  out.push({
    ...base,
    id: "shared-db-test-awkward",
    dueDate: "2099-01-16",
    createdAt: "2099-01-16T09:00:00.000Z",
    data: {
      findings: [
        { id: "a1", sNo: 1, status: "Open", targetDate: "2020-01-01", actualDateOfAction: null }, // -1, Overdue
        { id: "a2", sNo: 1, status: "Open", targetDate: "2020-01-01", actualDateOfAction: "" }, // -1.2, Overdue: an empty date is no date
        { id: "a3", sNo: 1, status: "Closed", targetDate: "2020-01-01", actualDateOfAction: "2020-01-02" }, // -1.3, Closed
        { id: "a4", status: "Open", targetDate: "2999-01-01" }, // no S.No: its place, 4; Open
        { id: "a5", sNo: 0, status: "Verified" }, // 0 is no number: place 5; Verified
        { id: "a6", sNo: -2, status: "Overdue", targetDate: "2999-12-31", actualDateOfAction: null }, // place 6; stored Overdue, but not due: Open
        { id: "a7", sNo: 2.5, status: "Open", targetDate: "2020/01/01" }, // not whole: place 7; a date not written YYYY-MM-DD: Open
        { id: "a8", sNo: "4", status: "Open", targetDate: today }, // S.No as text: place 8; due today, not before it: Open
        "not a finding", // skipped, but it holds place 9
        null, // skipped, place 10
        { sNo: 3.0, status: "Open" }, // no id of its own: no permanent reference
        { id: "", sNo: 7, status: "Open", targetDate: "2020-01-01", actualDateOfAction: "2020-02-02" }, // empty id: no reference; acted on: Open
        { id: "a13", sNo: 9007199254740991, status: "Open" }, // the largest whole number both sides read exactly
        { id: "a14", sNo: 4, status: "Open" }, // 4 again (a4 took it by place): -4.2
      ],
    },
  });
  // No date at all: an empty day tag, CAPA--1. And a report whose findings are not a list.
  out.push({ ...base, id: "shared-db-test-no-date", dueDate: null, createdAt: "2099-01-01T00:00:00.000Z", data: { findings: [{ id: "n1", sNo: 1, status: "Open" }] } });
  out.push({ ...base, id: "shared-db-test-no-list", dueDate: "2099-01-17", createdAt: "2099-01-17T00:00:00.000Z", data: { findings: "none" } });
  return out;
}
