import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { repoRoot } from "./paths.ts";
import type { OverviewDatabase } from "./overviewRoutes.ts";

// THE DATABASE OVERVIEW WITH NO MANUAL STEP (REQUIREMENTS §107).
//
// The owner, 9-Oct-2026, with a picture of the super admin's Database overview saying "OVERVIEW_DATABASE_URL is not
// set": "fix it or add it ... make sure this does not remove any document from anywhere". Until then the page read
// the overview views (§83) only through a login of the read-only role overview_viewer, made by hand by a PostgreSQL
// superuser and written into backend/.env as OVERVIEW_DATABASE_URL. Now, when OVERVIEW_DATABASE_URL is not set:
//
//   * AT START-UP DCRS LOOKS (prepareOverview): are the schema "overview", its three roles and the seven views over
//     DCRS's data there, may overview_viewer read each view, and may DCRS's own role become overview_viewer?
//   * WHAT IS MISSING, DCRS ADDS ITSELF, when its own role may: a superuser, or a role that may make roles
//     (CREATEROLE) and create in the database. It applies database/sql/01-schemas-and-roles.sql and
//     02-overview-dcrs.sql, the very files `npm run db:shared -- setup` applies, in ONE transaction (all of it or
//     none), under a lock of its own so two servers starting at once do not both do it. Both files look before each
//     step and change only what differs. A role that is not a superuser makes the three roles with
//     createrole_self_grant = 'set', so it may BECOME them but never inherits their rights.
//   * THEN THE PAGE READS THROUGH DCRS'S OWN POOL (ownPoolDatabase): each query in a READ ONLY transaction that first
//     becomes overview_viewer (SET LOCAL ROLE) with the viewer's own limits (a minute per statement, idle a minute at
//     most, the search path "overview"), so it holds exactly the viewer's rights: it reads the views and nothing
//     else, and can change nothing, even when DCRS's own role is a superuser. Two such queries at a time at most, so
//     the page never takes DCRS's own connections from the people working.
//   * WHEN DCRS'S ROLE MAY NOT, nothing is changed, and the page says the one step in plain words: once, as a
//     PostgreSQL superuser, `npm run db:shared -- setup`, which also lets DCRS's role become overview_viewer (02's
//     last step). DCRS looks again when the page is next opened (at most once a minute), so no restart is needed.
//
// THE §83 RULES HOLD: nothing of DCRS's own tables is created, altered, moved or regranted by this (the two files
// touch only the schemas overview and chatbot, the three roles, and the views); the views over DCRS's data belong to
// the role that owns public.app_storage; no document, record or row is removed. Proved on a throwaway PostgreSQL by
// backend/tests/overviewSetup.test.ts: every DCRS table's rows and definition the same before and after, the page's
// queries answered, and a write inside the overview's transaction refused.
//
// OVERVIEW_DATABASE_URL, WHEN SET, IS USED AS BEFORE (backend/overviewRoutes.ts viewerDatabase), and none of this runs.

/** The two parts DCRS applies itself, in this order (database/sql). */
export const OVERVIEW_PARTS = ["01-schemas-and-roles.sql", "02-overview-dcrs.sql"] as const;
/** The seven views part 2 makes over DCRS's data (scripts/database/shared-database.ts DCRS_VIEWS, checked equal by the tests). */
export const OVERVIEW_DCRS_VIEWS = ["dcrs_accounts", "records", "findings", "customer_complaints", "pest_control_reports_by_day", "dcrs_activity", "dcrs_downloads"] as const;
const OVERVIEW_ROLES = ["audit_assistant", "overview_owner", "overview_viewer"] as const;
/** The views need PostgreSQL 16 (pg_input_is_valid, role membership's SET option). */
const MIN_VERSION = 160000;
// Held while DCRS sets the overview up. 4711-4714 are taken (backend/db.ts SCHEMA_LOCK and its neighbours).
const SETUP_LOCK = 4715;
/** How often the page may make DCRS look again while the overview is not ready. */
export const LOOK_AGAIN_MS = 60_000;
/** The page's queries at once through DCRS's own pool, as the viewer's own pool held (backend/overviewRoutes.ts). */
const AT_ONCE = 2;

/** The one step, in plain words: what whoever looks after the server does once, when DCRS may not do it itself. */
export const SUPERUSER_STEP =
  "Once, as a PostgreSQL superuser (for example postgres), run npm run db:shared -- setup in the DCRS folder, with SUPERUSER_DATABASE_URL set to that superuser's address of the DCRS database. It adds the overview's views and lets DCRS read them as the read-only role overview_viewer; it changes nothing of DCRS's own tables and removes nothing. Then open this page again: nothing else is needed, and OVERVIEW_DATABASE_URL may stay unset (docs/database/README.md).";

/** What the database says about the overview and DCRS's own role. */
export interface OverviewFacts {
  /** DCRS's own role (current_user). */
  user: string;
  superuser: boolean;
  createRole: boolean;
  createOnDatabase: boolean;
  /** server_version_num, e.g. 180004. */
  version: number;
  versionText: string;
  schema: boolean;
  roles: string[];
  /** The views of part 2 that are there AND that overview_viewer may read. */
  views: string[];
  /** DCRS's role may become overview_viewer (SET ROLE). */
  canBecomeViewer: boolean;
}

export type OverviewReadiness =
  /** OVERVIEW_DATABASE_URL is set: the page signs in as the viewer, as before (§83). */
  | { state: "viewer-login" }
  /** Start-up has not looked yet. */
  | { state: "unchecked" }
  /** The page reads through DCRS's own pool, as overview_viewer. `madeNow`: DCRS added what was missing. */
  | { state: "ready"; madeNow: boolean; facts: OverviewFacts }
  /** Not ready, in plain words: why, and the one step. Nothing was changed. */
  | { state: "not-ready"; reason: string; step: string; facts: OverviewFacts | null };

const FACTS_SQL = `
SELECT current_user::text AS "user",
       r.rolsuper AS superuser,
       r.rolcreaterole AS create_role,
       has_database_privilege(current_database(), 'CREATE') AS create_on_database,
       current_setting('server_version_num')::int AS version,
       current_setting('server_version') AS version_text,
       to_regnamespace('overview') IS NOT NULL AS schema,
       ARRAY(SELECT rolname::text FROM pg_roles WHERE rolname = ANY ($1::text[]) ORDER BY 1) AS roles,
       CASE WHEN to_regrole('overview_viewer') IS NULL OR to_regnamespace('overview') IS NULL THEN ARRAY[]::text[]
            ELSE ARRAY(SELECT c.relname::text FROM pg_class c
                        WHERE c.relnamespace = to_regnamespace('overview') AND c.relkind = 'v' AND c.relname = ANY ($2::text[])
                          AND has_table_privilege('overview_viewer', c.oid, 'SELECT')
                        ORDER BY 1)
       END AS views,
       CASE WHEN to_regrole('overview_viewer') IS NULL THEN false
            ELSE pg_has_role(current_user, 'overview_viewer', 'SET')
       END AS can_become_viewer
  FROM pg_roles r
 WHERE r.rolname = current_user`;

interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

export async function readFacts(db: Queryable): Promise<OverviewFacts> {
  const row = (await db.query(FACTS_SQL, [[...OVERVIEW_ROLES], [...OVERVIEW_DCRS_VIEWS]])).rows[0] as {
    user: string;
    superuser: boolean;
    create_role: boolean;
    create_on_database: boolean;
    version: number;
    version_text: string;
    schema: boolean;
    roles: string[];
    views: string[];
    can_become_viewer: boolean;
  };
  return {
    user: row.user,
    superuser: row.superuser,
    createRole: row.create_role,
    createOnDatabase: row.create_on_database,
    version: row.version,
    versionText: row.version_text,
    schema: row.schema,
    roles: row.roles,
    views: row.views,
    canBecomeViewer: row.can_become_viewer,
  };
}

/** What is missing for the page to read, in plain words; none when it may. */
export function missingParts(f: OverviewFacts): string[] {
  const missing: string[] = [];
  if (!f.schema) missing.push('the schema "overview"');
  const roles = OVERVIEW_ROLES.filter((r) => !f.roles.includes(r));
  if (roles.length) missing.push(`the role${roles.length === 1 ? "" : "s"} ${roles.join(", ")}`);
  const views = OVERVIEW_DCRS_VIEWS.filter((v) => !f.views.includes(v));
  if (f.schema && views.length) missing.push(`${views.length === OVERVIEW_DCRS_VIEWS.length ? "the views over DCRS's data" : `the view${views.length === 1 ? "" : "s"} ${views.join(", ")}`}`);
  if (f.roles.includes("overview_viewer") && !f.canBecomeViewer) missing.push(`DCRS's role ${f.user} may not read as overview_viewer`);
  return missing;
}

/** A superuser, or a role that may make roles and create in the database: what applying part 1 and 2 needs. */
export const mayApply = (f: OverviewFacts): boolean => f.superuser || (f.createRole && f.createOnDatabase);

/** Why DCRS may not set it up itself, in plain words. */
export function notPermittedReason(f: OverviewFacts): string {
  const lacks = [!f.createRole ? "may not make roles" : "", !f.createOnDatabase ? "may not create in the DCRS database" : ""].filter(Boolean).join(" and ");
  return `The database overview is not set up on this server yet, and DCRS cannot set it up by itself: its database role, ${f.user}, is not a PostgreSQL superuser and ${lacks}. Missing: ${missingParts(f).join("; ")}. Nothing was changed.`;
}

/** The readiness the facts give, before anything is applied. */
export function judge(f: OverviewFacts, madeNow = false): OverviewReadiness | null {
  if (f.version < MIN_VERSION) {
    return {
      state: "not-ready",
      reason: `The database overview needs PostgreSQL 16 or newer; this database server is PostgreSQL ${f.versionText}. Nothing was changed.`,
      step: "Move DCRS's database to PostgreSQL 16 or newer (the plant's server runs 18), then open this page again.",
      facts: f,
    };
  }
  if (missingParts(f).length === 0) return { state: "ready", madeNow, facts: f };
  return null;
}

// ---------------------------------------------------------------------------
// applying the two parts

/** The parts' SQL, read once from database/sql. */
let partsSql: { name: string; sql: string }[] | null = null;
function parts(): { name: string; sql: string }[] {
  partsSql ??= OVERVIEW_PARTS.map((name) => ({ name, sql: readFileSync(path.join(repoRoot, "database", "sql", name), "utf8") }));
  return partsSql;
}

/**
 * Applies part 1 and part 2 in ONE transaction, under the set-up lock: either all of it is done or none of it.
 * Returns PostgreSQL's warnings, if any.
 */
export async function applyOverviewParts(pool: pg.Pool, facts: OverviewFacts): Promise<string[]> {
  const client = await pool.connect();
  const warnings: string[] = [];
  const onNotice = (notice: { severity?: string; message?: string }) => {
    if (notice.severity === "WARNING") warnings.push(notice.message ?? "");
  };
  let broken: Error | undefined;
  const onError = (err: Error) => {
    broken = err;
  };
  client.on("notice", onNotice);
  client.on("error", onError);
  try {
    await client.query("BEGIN");
    try {
      await client.query("SELECT pg_advisory_xact_lock($1)", [SETUP_LOCK]);
      // A role that is not a superuser may become the roles it makes, never inherit their rights (01's header).
      if (!facts.superuser) await client.query("SET LOCAL createrole_self_grant = 'set'");
      for (const part of parts()) {
        try {
          await client.query(part.sql);
        } catch (err) {
          throw new Error(`database/sql/${part.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch((e: Error) => {
        broken = e;
      });
      throw err;
    }
  } finally {
    client.removeListener("notice", onNotice);
    client.removeListener("error", onError);
    client.release(broken);
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// the state, looked at at start-up and again when the page asks

let readiness: OverviewReadiness = { state: "unchecked" };
let lastLook = 0;
let looking: Promise<OverviewReadiness> | null = null;
let poolOf: (() => pg.Pool) | null = null;
let log: (line: string) => void = (line) => console.log(line);

export function overviewReadiness(): OverviewReadiness {
  return readiness;
}

/** For the tests: forget what was found. */
export function resetOverviewReadiness(): void {
  readiness = { state: "unchecked" };
  lastLook = 0;
  looking = null;
  poolOf = null;
  ownDatabase = null;
}

/**
 * Looks, and sets up what is missing when DCRS's role may (the header). Never throws: anything unexpected is a
 * "not ready" in words. `pool` is DCRS's own (backend/db.ts database()).
 */
export async function prepareOverview(options: { pool: () => pg.Pool; log?: (line: string) => void; env?: NodeJS.ProcessEnv }): Promise<OverviewReadiness> {
  const env = options.env ?? process.env;
  if (options.log) log = options.log;
  poolOf = options.pool;
  if (env.OVERVIEW_DATABASE_URL?.trim()) {
    readiness = { state: "viewer-login" };
    return readiness;
  }
  looking ??= look(options.pool()).finally(() => {
    looking = null;
  });
  return looking;
}

async function look(pool: pg.Pool): Promise<OverviewReadiness> {
  lastLook = Date.now();
  let facts: OverviewFacts | null = null;
  try {
    facts = await readFacts(pool);
    const found = judge(facts);
    if (found) return say(found);
    if (!mayApply(facts)) return say({ state: "not-ready", reason: notPermittedReason(facts), step: SUPERUSER_STEP, facts });
    const missing = missingParts(facts);
    const warnings = await applyOverviewParts(pool, facts);
    for (const w of warnings) log(`Database overview: PostgreSQL warned: ${w}`);
    const after = await readFacts(pool);
    const made = judge(after, true);
    if (made) {
      log(`Database overview: DCRS set it up itself in its own database (database/sql/01 and 02, in one transaction; it added ${missing.join("; ")}). Nothing of DCRS's own tables was changed. The super admin's page reads it as overview_viewer, read-only.`);
      return say(made, true);
    }
    return say({ state: "not-ready", reason: `DCRS set the database overview up, but some of it is still missing: ${missingParts(after).join("; ")}.`, step: SUPERUSER_STEP, facts: after });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return say({
      state: "not-ready",
      reason: `DCRS tried to set the database overview up by itself, and PostgreSQL refused (${message}). Nothing was changed: it is all one transaction.`,
      step: SUPERUSER_STEP,
      facts,
    });
  }
}

function say(found: OverviewReadiness, quiet = false): OverviewReadiness {
  const before = readiness;
  readiness = found;
  if (found.state === "ready" && !quiet && before.state !== "ready") {
    log(`Database overview: ready. The super admin's page reads it through DCRS's own connection as overview_viewer, read-only (OVERVIEW_DATABASE_URL is not needed).`);
  }
  if (found.state === "not-ready" && (before.state !== "not-ready" || before.reason !== found.reason)) {
    log(`Database overview: not set up. ${found.reason} ${found.step}`);
  }
  return found;
}

/**
 * The page found the overview missing, or was refused it, while reading through DCRS's own pool (somebody dropped a
 * view, or took DCRS's right to become overview_viewer away): it is not ready, and the next opening looks again at once.
 */
export function overviewFailed(reason: string): void {
  if (readiness.state !== "ready") return;
  readiness = { state: "not-ready", reason, step: SUPERUSER_STEP, facts: null };
  lastLook = 0;
}

/**
 * The page's own look again, while it is not ready: at most once a minute, so a superuser's `db:shared -- setup` run
 * after DCRS started is found without a restart. Answers what is known now when it is too soon.
 */
export async function lookAgain(now = Date.now()): Promise<OverviewReadiness> {
  if (readiness.state === "ready" || readiness.state === "viewer-login" || !poolOf) return readiness;
  if (looking) return looking;
  if (now - lastLook < LOOK_AGAIN_MS) return readiness;
  return prepareOverview({ pool: poolOf });
}

// ---------------------------------------------------------------------------
// reading through DCRS's own pool, as overview_viewer

// Every value comes back as the text PostgreSQL wrote, as on the viewer's own pool (backend/overviewRoutes.ts).
const AS_TEXT = { getTypeParser: () => (value: string) => value } as unknown as pg.CustomTypesConfig;

/**
 * What each query's transaction does first: becomes the viewer, with the viewer's own limits (01-schemas-and-roles.sql
 * sets the same on the role for a sign-in of its own; a SET ROLE does not take a role's settings, so they are said here).
 */
export const AS_THE_VIEWER =
  "SET LOCAL ROLE overview_viewer; SET LOCAL statement_timeout = '60s'; SET LOCAL idle_in_transaction_session_timeout = '60s'; SET LOCAL search_path = overview";

let ownDatabase: OverviewDatabase | null = null;

/** The page's database while the overview is ready through DCRS's own pool; null otherwise. */
export function ownOverviewDatabase(): OverviewDatabase | null {
  if (readiness.state !== "ready" || !poolOf) return null;
  ownDatabase ??= ownPoolDatabase(poolOf);
  return ownDatabase;
}

/**
 * Each query in a READ ONLY transaction that is overview_viewer from its first statement. A connection that broke is
 * thrown away, never handed back to DCRS's pool.
 */
export function ownPoolDatabase(pool: () => pg.Pool): OverviewDatabase {
  let running = 0;
  const waiting: (() => void)[] = [];
  const take = async (): Promise<void> => {
    if (running < AT_ONCE) {
      running++;
      return;
    }
    await new Promise<void>((resolve) => waiting.push(resolve));
  };
  const give = (): void => {
    const next = waiting.shift();
    if (next) next();
    else running--;
  };
  return {
    async query(text, values = []) {
      await take();
      try {
        const client = await pool().connect();
        let broken: Error | undefined;
        const onError = (err: Error) => {
          broken = err;
        };
        client.on("error", onError);
        try {
          await client.query("BEGIN READ ONLY");
          try {
            await client.query(AS_THE_VIEWER);
            const result = await client.query({ text, values, rowMode: "array", types: AS_TEXT });
            await client.query("COMMIT");
            return { fields: result.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })), rows: result.rows as unknown[][] };
          } catch (err) {
            await client.query("ROLLBACK").catch((e: Error) => {
              broken = e;
            });
            throw err;
          }
        } finally {
          client.removeListener("error", onError);
          client.release(broken);
        }
      } finally {
        give();
      }
    },
  };
}
