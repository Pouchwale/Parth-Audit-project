// THE DATABASE OVERVIEW WITH NO MANUAL STEP (REQUIREMENTS §107), backend/overviewSetup.ts with backend/overviewRoutes.ts.
//
// Without a database, the decisions and their words: what is missing, who may set it up (a superuser, or a role that
// may make roles and create in the database), the PostgreSQL version, the one step when DCRS may not, and
// OVERVIEW_DATABASE_URL, when set, used as before with nothing looked at.
//
// With DCRS_OVERVIEW_TEST_URL — a SUPERUSER's address on a THROWAWAY PostgreSQL server (these tests make and drop
// databases and roles there) — the whole of it on PostgreSQL, for each kind of role DCRS may sign in with:
//   * a role that may make roles and owns its database (CREATEROLE), on a server with none of the overview's roles;
//   * a superuser;
//   * a plain role that may do neither: nothing is changed, the page says the one step; after a superuser's
//     `npm run db:shared -- setup` the page reads, with no restart.
// Each time: DCRS's own tables made by DCRS's own code (backend/db.ts) with rows in them, then every DCRS table's
// definition and rows (and every sequence) read before and after the start-up set-up, and again after the page has
// been used: unchanged. The page's own routes answer (status, the views, the questions, a CSV) through DCRS's own pool,
// as overview_viewer, read-only; and inside the overview's transaction every write is refused, the superuser's own
// powers too.
// Run: npm run test:unit -- overviewSetup
//      DCRS_OVERVIEW_TEST_URL=postgres://postgres:<password>@127.0.0.1:<port>/postgres npm run test:unit -- overviewSetup
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import express, { type NextFunction, type Request, type Response } from "express";
import pg from "pg";
import type { PublicUser } from "../auth.ts";
import { repoRoot } from "../paths.ts";
import { registerOverviewRoutes } from "../overviewRoutes.ts";
import {
  AS_THE_VIEWER,
  LOOK_AGAIN_MS,
  OVERVIEW_DCRS_VIEWS,
  SUPERUSER_STEP,
  judge,
  lookAgain,
  mayApply,
  missingParts,
  notPermittedReason,
  overviewReadiness,
  ownPoolDatabase,
  prepareOverview,
  resetOverviewReadiness,
  type OverviewFacts,
} from "../overviewSetup.ts";
import { DCRS_VIEWS } from "../../scripts/database/shared-database.ts";

const ALL_THERE: OverviewFacts = {
  user: "dcrs",
  superuser: false,
  createRole: false,
  createOnDatabase: true,
  version: 180004,
  versionText: "18.4",
  schema: true,
  roles: ["audit_assistant", "overview_owner", "overview_viewer"],
  views: [...OVERVIEW_DCRS_VIEWS].sort(),
  canBecomeViewer: true,
};

describe("what DCRS decides, and says", () => {
  it("knows the seven views part 2 makes, as db:shared does", () => {
    assert.deepEqual([...OVERVIEW_DCRS_VIEWS], [...DCRS_VIEWS]);
  });

  it("is ready when the schema, the three roles and the seven views are there, the viewer may read them, and DCRS may become the viewer", () => {
    assert.deepEqual(missingParts(ALL_THERE), []);
    assert.equal(judge(ALL_THERE)?.state, "ready");
  });

  it("names what is missing in plain words", () => {
    const empty: OverviewFacts = { ...ALL_THERE, schema: false, roles: [], views: [], canBecomeViewer: false };
    assert.deepEqual(missingParts(empty), ['the schema "overview"', "the roles audit_assistant, overview_owner, overview_viewer"]);
    assert.deepEqual(missingParts({ ...ALL_THERE, views: ALL_THERE.views.filter((v) => v !== "findings") }), ["the view findings"]);
    assert.deepEqual(missingParts({ ...ALL_THERE, canBecomeViewer: false }), ["DCRS's role dcrs may not read as overview_viewer"]);
    assert.equal(judge({ ...ALL_THERE, views: [] }), null);
  });

  it("sets it up itself only as a superuser, or as a role that may make roles AND create in the database", () => {
    assert.equal(mayApply({ ...ALL_THERE, superuser: true, createRole: false, createOnDatabase: false }), true);
    assert.equal(mayApply({ ...ALL_THERE, createRole: true, createOnDatabase: true }), true);
    assert.equal(mayApply({ ...ALL_THERE, createRole: true, createOnDatabase: false }), false);
    assert.equal(mayApply({ ...ALL_THERE, createRole: false, createOnDatabase: true }), false);
  });

  it("says why it may not, naming its role and what is missing, and that nothing was changed", () => {
    const words = notPermittedReason({ ...ALL_THERE, schema: false, roles: [], views: [] });
    assert.match(words, /its database role, dcrs, is not a PostgreSQL superuser and may not make roles\./);
    assert.match(words, /Missing: the schema "overview"; the roles/);
    assert.match(words, /Nothing was changed\.$/);
    assert.match(notPermittedReason({ ...ALL_THERE, createRole: true, createOnDatabase: false }), /may not create in the DCRS database/);
  });

  it("gives the one step: a superuser's db:shared setup, once, then the page again; no address, no password", () => {
    assert.match(SUPERUSER_STEP, /^Once, as a PostgreSQL superuser .* npm run db:shared -- setup/);
    assert.match(SUPERUSER_STEP, /changes nothing of DCRS's own tables and removes nothing/);
    assert.match(SUPERUSER_STEP, /OVERVIEW_DATABASE_URL may stay unset/);
    assert.ok(!/postgres:\/\//.test(SUPERUSER_STEP));
  });

  it("needs PostgreSQL 16 or newer, and says which it found", () => {
    const old = judge({ ...ALL_THERE, version: 150004, versionText: "15.4" });
    assert.equal(old?.state, "not-ready");
    assert.match(old?.state === "not-ready" ? old.reason : "", /needs PostgreSQL 16 or newer; this database server is PostgreSQL 15\.4/);
  });

  it("reads as the viewer with the viewer's own limits, as part 1 sets them on the role", () => {
    const part1 = readFileSync(path.join(repoRoot, "database", "sql", "01-schemas-and-roles.sql"), "utf8");
    assert.match(AS_THE_VIEWER, /^SET LOCAL ROLE overview_viewer;/);
    for (const [setting, value] of [["statement_timeout", "60s"], ["idle_in_transaction_session_timeout", "60s"], ["search_path", "overview"]]) {
      assert.ok(part1.includes(`('overview_viewer', '${setting}', '${value}')`), `part 1 sets ${setting} = ${value} on overview_viewer`);
      assert.ok(AS_THE_VIEWER.includes(`SET LOCAL ${setting} = ${setting === "search_path" ? value : `'${value}'`}`), `the page's transaction sets ${setting}`);
    }
  });

  it("with OVERVIEW_DATABASE_URL set, reads through it as before and looks at nothing", async () => {
    resetOverviewReadiness();
    let asked = 0;
    const found = await prepareOverview({
      pool: () => {
        asked++;
        throw new Error("DCRS's pool must not be used");
      },
      env: { OVERVIEW_DATABASE_URL: "postgres://overview_viewer@db-host:5432/dcrs" },
      log: () => undefined,
    });
    assert.equal(found.state, "viewer-login");
    assert.equal(asked, 0);
    resetOverviewReadiness();
  });
});

// ---------------------------------------------------------------------------
// on PostgreSQL

const TEST_URL = process.env.DCRS_OVERVIEW_TEST_URL?.trim() ?? "";

const withDatabase = (url: string, database: string, user?: { name: string; password: string }): string => {
  const u = new URL(url);
  u.pathname = `/${database}`;
  if (user) {
    u.username = user.name;
    u.password = user.password;
  }
  return u.toString();
};

async function open(url: string): Promise<pg.Client> {
  const c = new pg.Client({ connectionString: url });
  c.on("error", () => undefined);
  await c.connect();
  return c;
}

const ADMIN: PublicUser = { id: "u-admin", name: "Super Admin", email: "admin@gpp.local", role: "admin", departments: [] };

// The plant's records as DCRS stores them: one CAPA finding open and overdue, a day of F/HR/17, a customer complaint.
const RECORDS = [
  {
    id: "rec-gap-1",
    documentId: "gap-inspection",
    isDemo: false,
    dueDate: "2026-09-01",
    status: "In Progress",
    createdAt: "2026-09-01T05:00:00.000Z",
    updatedAt: "2026-09-02T06:30:00.123Z",
    data: { inspectionDate: "2026-09-01", findings: [{ id: "f1", sNo: 1, findingOfInspection: "Rodent box 4 missing its number", targetDate: "2026-09-10", status: "Open" }] },
    history: [{ by: "Kapila Barad", at: "2026-09-02T06:30:00.123Z" }],
  },
  {
    id: "rec-pest-1",
    documentId: "daily-pest-monitoring",
    isDemo: false,
    dueDate: "2026-10-01",
    status: "Verified",
    submittedBy: "Kapila Barad",
    verifiedBy: "Super Admin",
    createdAt: "2026-10-01T03:00:00.000Z",
    updatedAt: "2026-10-01T09:00:00.000Z",
    data: { checker: "Kapila Barad", checkpoints: { a: { value: "Yes" } } },
    history: [],
  },
  {
    id: "rec-complaint-1",
    documentId: "capa-customer-complaint",
    isDemo: false,
    dueDate: "2026-09-15",
    status: "In Progress",
    createdAt: "2026-09-15T03:00:00.000Z",
    updatedAt: "2026-09-15T03:00:00.000Z",
    data: { complaintNo: "26-27/001", customerName: "A customer", sections: [{ items: [{ done: true }, { comment: "" }] }] },
    history: [],
  },
];
const DOCUMENTS = [{ id: "gap-inspection", formatNo: "F/QA/01", name: "Pest Control Inspection Findings Report" }];

/** DCRS's own tables, made by DCRS's own code as `url`'s role, with rows in each the views read. */
async function makeDcrsTables(url: string): Promise<void> {
  process.env.SQLITE_IMPORT = "0";
  // The modules that keep tables of their own register them when loaded, as the server loads them (backend/db.ts MORE_SCHEMA).
  await import("../activityArchive.ts");
  await import("../escalation.ts");
  await import("../notifications.ts");
  const db = await import("../db.ts");
  await db.closeDatabase();
  const saved = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url;
  try {
    const pool = await db.openDatabase();
    await pool.query("INSERT INTO users (id, name, email, password_hash, role, created_at, departments) VALUES ('u-admin', 'Super Admin', 'admin@gpp.local', 'hash-of-a-secret-1', 'admin', '2026-09-01T03:00:00.000Z', ''), ('u-qc', 'Kapila Barad', 'kapila.barad@gpp.local', 'hash-of-a-secret-2', 'staff', '2026-09-01T03:01:00.000Z', 'QC,HR')");
    await pool.query("INSERT INTO app_storage (scope, key, value, updated_by) VALUES ('company', 'records', $1, 'u-admin'), ('company', 'documents', $2, 'u-admin'), ('u-qc', 'settings', '{\"theme\":\"dark\"}', 'u-qc')", [
      JSON.stringify(RECORDS),
      JSON.stringify(DOCUMENTS),
    ]);
    await pool.query(
      "INSERT INTO activity_log (user_id, user_name, user_email, action, target, detail, department, ip) VALUES ('u-qc', 'Kapila Barad', 'kapila.barad@gpp.local', 'Document downloaded as Excel', 'F/HR/17 Daily Pest Control Monitoring Record', '', 'HR', '10.0.0.5'), ('u-admin', 'Super Admin', 'admin@gpp.local', 'Signed in', '', 'Windows computer - Chrome (Website) from 10.0.0.2', '', '10.0.0.2')"
    );
    await pool.query("INSERT INTO user_sessions (id, user_id, device_name, ends_at) VALUES ('s-1', 'u-qc', 'Android phone - Chrome', now() + interval '8 hours')");
  } finally {
    await db.closeDatabase();
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
  }
}

// Every relation of public as the catalog describes it — owner, grants, columns, defaults, constraints, indexes,
// triggers, comments — and every table's rows (how many, and a fingerprint of all of them), and every sequence's place.
const PUBLIC_CATALOG = `
SELECT jsonb_object_agg(c.relname, jsonb_build_object(
  'kind', c.relkind, 'owner', pg_get_userbyid(c.relowner), 'acl', c.relacl::text, 'comment', obj_description(c.oid, 'pg_class'),
  'index', CASE WHEN c.relkind IN ('i', 'I') THEN pg_get_indexdef(c.oid) END,
  'columns', (SELECT jsonb_agg(jsonb_build_object('name', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'not_null', a.attnotnull,
                                                  'default', pg_get_expr(d.adbin, d.adrelid), 'acl', a.attacl::text, 'comment', col_description(c.oid, a.attnum)) ORDER BY a.attnum)
              FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
              WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped),
  'constraints', (SELECT jsonb_agg(pg_get_constraintdef(co.oid) ORDER BY co.conname) FROM pg_constraint co WHERE co.conrelid = c.oid),
  'triggers', (SELECT jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid = c.oid AND NOT t.tgisinternal)
)) AS catalog
FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace`;

interface Snapshot {
  catalog: unknown;
  rows: Record<string, { count: number; fingerprint: string | null }>;
  sequences: Record<string, string>;
}

async function snapshotOf(url: string): Promise<Snapshot> {
  const c = await open(url);
  try {
    const catalog = (await c.query(PUBLIC_CATALOG)).rows[0].catalog;
    const rows: Snapshot["rows"] = {};
    for (const { name } of (await c.query<{ name: string }>("SELECT relname AS name FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p') ORDER BY 1")).rows) {
      const r = await c.query<{ count: string; fingerprint: string | null }>(`SELECT count(*)::text AS count, md5(string_agg(md5(t::text), '' ORDER BY md5(t::text))) AS fingerprint FROM public.${pg.escapeIdentifier(name)} t`);
      rows[name] = { count: Number(r.rows[0].count), fingerprint: r.rows[0].fingerprint };
    }
    const sequences: Snapshot["sequences"] = {};
    for (const { name } of (await c.query<{ name: string }>("SELECT relname AS name FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'S' ORDER BY 1")).rows) {
      const s = await c.query<{ at: string }>(`SELECT last_value::text || CASE WHEN is_called THEN ' (called)' ELSE '' END AS at FROM public.${pg.escapeIdentifier(name)}`);
      sequences[name] = s.rows[0].at;
    }
    return { catalog, rows, sequences };
  } finally {
    await c.end();
  }
}

/** What overview holds in a database: its views and their owners, and DCRS's role's membership of overview_viewer. */
async function overviewIn(url: string, dcrsRole: string): Promise<{ views: Record<string, string>; membership: { set: boolean; inherit: boolean; admin: boolean } | null }> {
  const c = await open(url);
  try {
    const views = Object.fromEntries(
      (await c.query<{ name: string; owner: string }>("SELECT c.relname AS name, pg_get_userbyid(c.relowner) AS owner FROM pg_class c WHERE c.relnamespace = to_regnamespace('overview') AND c.relkind = 'v' ORDER BY 1")).rows.map((r) => [r.name, r.owner])
    );
    const m = (
      await c.query<{ set: boolean; inherit: boolean; admin: boolean }>(
        "SELECT bool_or(m.set_option) AS set, bool_or(m.inherit_option) AS inherit, bool_or(m.admin_option) AS admin FROM pg_auth_members m WHERE m.roleid = to_regrole('overview_viewer') AND m.member = to_regrole($1) GROUP BY m.member",
        [dcrsRole]
      )
    ).rows[0];
    return { views, membership: m ?? null };
  } finally {
    await c.end();
  }
}

/** Statements the overview's transaction must refuse, and why each would matter. */
const WRITES = [
  "INSERT INTO public.activity_log (action) VALUES ('probe')",
  "UPDATE public.app_storage SET value = value",
  "DELETE FROM public.users WHERE false",
  "TRUNCATE public.app_storage",
  "CREATE TABLE public.overview_probe (id integer)",
  "CREATE TEMP TABLE overview_probe (id integer)",
  "SELECT nextval('public.app_storage_seq')",
  "DROP VIEW overview.records",
  "INSERT INTO overview.records DEFAULT VALUES",
  "SELECT 1 FROM public.users LIMIT 1",
  "SELECT value FROM public.app_storage LIMIT 1",
];
// A superuser's own powers, gone once the transaction is the viewer's.
const SUPERUSER_POWERS = ["COPY (SELECT 1) TO PROGRAM 'echo overview'", "SELECT pg_read_file('postgresql.conf')", "SELECT pg_reload_conf()", "CREATE ROLE overview_probe"];

if (!TEST_URL) {
  describe("the overview set up by DCRS itself, on PostgreSQL", () => {
    it("skipped (DCRS_OVERVIEW_TEST_URL is not set; the same checks run on a throwaway PostgreSQL server when it is)", { skip: true }, () => undefined);
  });
} else {
  const tag = randomBytes(3).toString("hex");
  const made = { databases: [] as string[], roles: [] as string[] };
  let su: pg.Client;
  let base = "";
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let rolesAtStart: string[] = [];

  const get = async (route: string): Promise<{ status: number; json: any; text: string }> => {
    const res = await fetch(base + route, { headers: { "x-test-user": "admin" } });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: res.status, json, text };
  };

  /** A database of DCRS's, owned by `owner` (a role made here, or the superuser), with DCRS's tables and rows. */
  async function dcrsDatabase(kind: string, owner: { name: string; password: string; attributes: string } | null): Promise<{ url: string; role: string }> {
    const database = `ovw_${kind}_${tag}`;
    if (owner) {
      await su.query(`CREATE ROLE ${pg.escapeIdentifier(owner.name)} LOGIN PASSWORD ${pg.escapeLiteral(owner.password)} ${owner.attributes}`);
      made.roles.push(owner.name);
    }
    await su.query(`CREATE DATABASE ${pg.escapeIdentifier(database)} ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'${owner ? ` OWNER ${pg.escapeIdentifier(owner.name)}` : ""}`);
    made.databases.push(database);
    const url = withDatabase(TEST_URL, database, owner ? { name: owner.name, password: owner.password } : undefined);
    await makeDcrsTables(url);
    return { url, role: owner?.name ?? new URL(TEST_URL).username };
  }

  /** The start-up set-up, as backend/index.ts runs it, on a pool of `url`'s role. */
  async function startUp(url: string, lines: string[]): Promise<{ pool: pg.Pool; state: ReturnType<typeof overviewReadiness> }> {
    resetOverviewReadiness();
    const pool = new pg.Pool({ connectionString: url, max: 4 });
    pool.on("error", () => undefined);
    const state = await prepareOverview({ pool: () => pool, env: {}, log: (line) => lines.push(line) });
    return { pool, state };
  }

  async function writesRefused(pool: pg.Pool, also: string[] = []): Promise<string[]> {
    const own = ownPoolDatabase(() => pool);
    const wrong: string[] = [];
    for (const sql of [...WRITES, ...also]) {
      try {
        await own.query(sql);
        wrong.push(`${sql}  ->  ALLOWED`);
      } catch (err) {
        const code = (err as { code?: string }).code ?? "";
        // Refused as a write in a read-only transaction, for want of the privilege, or (a view) as not writable at all.
        if (!["25006", "42501", "55000", "0A000"].includes(code)) wrong.push(`${sql}  ->  ${code} ${(err as Error).message}`);
      }
    }
    return wrong;
  }

  async function pageReads(): Promise<void> {
    const status = await get("/api/overview/status");
    assert.equal(status.status, 200, status.text);
    assert.equal(status.json.role, "overview_viewer");
    assert.equal(status.json.readOnly, true);
    assert.equal(status.json.through, "dcrs-connection");
    assert.deepEqual(status.json.views.filter((v: string) => (OVERVIEW_DCRS_VIEWS as readonly string[]).includes(v)).sort(), [...OVERVIEW_DCRS_VIEWS].sort());
    const questions = await get("/api/overview/questions");
    assert.equal(questions.status, 200, questions.text);
    assert.ok(questions.json.questions.some((q: { key: string }) => q.key === "open-findings"), questions.text);
    const open = await get("/api/overview/questions/open-findings");
    assert.equal(open.status, 200, open.text);
    assert.equal(open.json.rows.length, 1, open.text);
    assert.equal(open.json.rows[0][0], "CAPA-2026-09-01-1");
    assert.equal(open.json.rows[0][1], "Overdue");
    const records = await get("/api/overview/views/records");
    assert.equal(records.status, 200, records.text);
    assert.equal(records.json.rows.length, 3);
    const accounts = await get("/api/overview/views/dcrs_accounts");
    assert.equal(accounts.status, 200, accounts.text);
    assert.ok(!accounts.text.includes("hash-of-a-secret") && !accounts.json.columns.some((c: { name: string }) => c.name === "password_hash"), "never a password hash");
    const csv = await get("/api/overview/views/dcrs_activity.csv");
    assert.equal(csv.status, 200, csv.text);
    assert.match(csv.text, /Document downloaded as Excel/);
    const missing = await get("/api/overview/questions/missing-pest-control-reports");
    assert.equal(missing.status, 200, missing.text);
  }

  before(async () => {
    su = await open(TEST_URL);
    rolesAtStart = (await su.query<{ rolname: string }>("SELECT rolname FROM pg_roles WHERE rolname IN ('audit_assistant', 'overview_viewer', 'overview_owner')")).rows.map((r) => r.rolname);
    const app = express();
    app.use((req: Request, res: Response, next: NextFunction) => {
      (req as Request & { user: PublicUser }).user = ADMIN;
      next();
    });
    registerOverviewRoutes(app, { requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(), logActivity: () => undefined });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    resetOverviewReadiness();
    for (const database of made.databases) await su.query(`DROP DATABASE IF EXISTS ${pg.escapeIdentifier(database)} WITH (FORCE)`).catch(() => undefined);
    // The overview's roles, when these tests made them (they are the whole server's), then the tests' own.
    const theirs = ["audit_assistant", "overview_owner", "overview_viewer"].filter((r) => !rolesAtStart.includes(r));
    for (const role of [...theirs, ...made.roles]) {
      await su.query(`DROP OWNED BY ${pg.escapeIdentifier(role)}`).catch(() => undefined);
      await su.query(`DROP ROLE IF EXISTS ${pg.escapeIdentifier(role)}`).catch((e: Error) => console.log(`could not drop ${role}: ${e.message}`));
    }
    await su.end();
  });

  describe("the overview set up by DCRS itself, on PostgreSQL (a throwaway server)", () => {
    it("as a role that may make roles and owns its database: set up at start-up, DCRS's tables and rows unchanged, read as the viewer, every write refused", async (t) => {
      if (rolesAtStart.length) return t.skip(`the server already has ${rolesAtStart.join(", ")}: this case needs a server without them`);
      const role = { name: `ovw_cr_${tag}`, password: randomBytes(12).toString("hex"), attributes: "CREATEROLE" };
      const { url } = await dcrsDatabase("cr", role);
      const before0 = await snapshotOf(url);
      const lines: string[] = [];
      const { pool, state } = await startUp(url, lines);
      try {
        assert.equal(state.state, "ready", JSON.stringify(state));
        assert.equal(state.state === "ready" && state.madeNow, true);
        assert.match(lines.join("\n"), /DCRS set it up itself in its own database/);
        assert.deepEqual(await snapshotOf(url), before0, "the start-up set-up changed DCRS's tables or rows");
        const found = await overviewIn(url, role.name);
        assert.deepEqual(Object.keys(found.views).sort(), [...OVERVIEW_DCRS_VIEWS].sort());
        assert.ok(Object.values(found.views).every((owner) => owner === role.name), `the views belong to the owner of app_storage: ${JSON.stringify(found.views)}`);
        assert.deepEqual(found.membership, { set: true, inherit: false, admin: true }, "DCRS's role may become the viewer, never inherit its rights");
        await pageReads();
        assert.deepEqual(await writesRefused(pool), []);
        // Started again: nothing to do, nothing changed.
        const again = await startUp(url, lines);
        await again.pool.end();
        assert.equal(again.state.state === "ready" && again.state.madeNow, false);
        assert.deepEqual(await snapshotOf(url), before0, "using the page changed DCRS's tables or rows");
      } finally {
        await pool.end();
      }
    });

    it("as a superuser: set up at start-up, unchanged tables and rows, read as the viewer, and the superuser's own powers gone inside the overview's transaction", async () => {
      const { url } = await dcrsDatabase("su", null);
      const before0 = await snapshotOf(url);
      const lines: string[] = [];
      const { pool, state } = await startUp(url, lines);
      try {
        assert.equal(state.state, "ready", JSON.stringify(state));
        assert.equal(state.state === "ready" && state.madeNow, true);
        assert.deepEqual(await snapshotOf(url), before0, "the start-up set-up changed DCRS's tables or rows");
        const found = await overviewIn(url, new URL(TEST_URL).username);
        assert.ok(Object.values(found.views).every((owner) => owner === new URL(TEST_URL).username), JSON.stringify(found.views));
        assert.equal(found.membership, null, "a superuser needs no membership, and is given none");
        await pageReads();
        assert.deepEqual(await writesRefused(pool, SUPERUSER_POWERS), []);
        const own = ownPoolDatabase(() => pool);
        assert.deepEqual((await own.query("SELECT current_user::text, current_setting('transaction_read_only'), current_setting('statement_timeout')")).rows[0], ["overview_viewer", "on", "1min"]);
        // The connection goes back to DCRS as DCRS's own role, writable: the viewer's role ended with the transaction.
        const c = await pool.connect();
        try {
          assert.deepEqual((await c.query("SELECT current_user::text AS who, current_setting('transaction_read_only') AS ro")).rows[0], { who: new URL(TEST_URL).username, ro: "off" });
        } finally {
          c.release();
        }
        assert.deepEqual(await snapshotOf(url), before0, "using the page changed DCRS's tables or rows");
      } finally {
        await pool.end();
      }
    });

    it("as a role that may do neither: nothing changed, the one step said; after a superuser's db:shared setup the page reads with no restart", async () => {
      const role = { name: `ovw_plain_${tag}`, password: randomBytes(12).toString("hex"), attributes: "" };
      const { url } = await dcrsDatabase("plain", role);
      const before0 = await snapshotOf(url);
      const lines: string[] = [];
      const { pool, state } = await startUp(url, lines);
      try {
        assert.equal(state.state, "not-ready", JSON.stringify(state));
        if (state.state !== "not-ready") return;
        assert.match(state.reason, new RegExp(`its database role, ${role.name}, is not a PostgreSQL superuser and may not make roles\\.`));
        assert.equal(state.step, SUPERUSER_STEP);
        assert.match(lines.join("\n"), /Database overview: not set up\./);
        assert.deepEqual(await snapshotOf(url), before0);
        assert.deepEqual((await overviewIn(url, role.name)).views, {}, "nothing was made");
        const refused = await get("/api/overview/status");
        assert.equal(refused.status, 503);
        assert.equal(refused.json.code, "overview-not-set-up");
        assert.equal(refused.json.reason, state.reason);
        assert.deepEqual(refused.json.steps, [SUPERUSER_STEP]);
        assert.ok(!refused.text.includes(role.password) && !/postgres:\/\//.test(refused.text), "no address, no password");

        // The one step, as whoever looks after the server takes it.
        const setup = spawnSync(process.execPath, ["--no-warnings=ExperimentalWarning", path.join(repoRoot, "scripts", "database", "shared-database.ts"), "setup"], {
          cwd: repoRoot,
          encoding: "utf8",
          env: { ...process.env, SUPERUSER_DATABASE_URL: withDatabase(TEST_URL, new URL(url).pathname.slice(1)), AUDIT_ASSISTANT_PASSWORD: "", OVERVIEW_VIEWER_PASSWORD: "" },
        });
        assert.equal(setup.status, 0, `${setup.stdout}\n${setup.stderr}`);
        assert.deepEqual((await overviewIn(url, role.name)).membership, { set: true, inherit: false, admin: false }, "setup lets DCRS's role become the viewer, and nothing more");
        assert.deepEqual(await snapshotOf(url), before0, "setup changed DCRS's tables or rows");
        // Too soon to look again: still the same answer. A minute later the page finds it, with no restart.
        assert.equal((await get("/api/overview/status")).status, 503);
        assert.equal((await lookAgain(Date.now() + LOOK_AGAIN_MS + 1)).state, "ready");
        await pageReads();
        assert.deepEqual(await writesRefused(pool), []);
        assert.deepEqual(await snapshotOf(url), before0, "using the page changed DCRS's tables or rows");
      } finally {
        await pool.end();
      }
    });
  });
}
