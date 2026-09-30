import pg from "pg";
import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import type { PublicUser } from "./auth.ts";

// THE DATABASE OVERVIEW, READ-ONLY, FOR THE SUPER ADMIN (REQUIREMENTS §83).
//
// DCRS and the Audit Assistant share one PostgreSQL database. Its schema
// "overview" holds plain-English views over both (database/sql/02 and 03):
// one row per real-world thing, every view and column described in a comment.
// These routes let the super admin read them from DCRS's admin area, "Database
// overview" (frontend/src/pages/DatabaseOverviewPage.tsx), without writing SQL:
//
//   GET /api/overview/status              set up or not, and which views there are
//   GET /api/overview/views               each view: its comment, its columns and theirs
//   GET /api/overview/views/:name         its rows: ?from=&to=&q=&limit=&offset=
//   GET /api/overview/views/:name.csv     the same rows as a CSV file (up to 20,000)
//   GET /api/overview/questions           the ready-made questions this database can answer
//   GET /api/overview/questions/:key      one answered: ?week=this|last&limit=&offset=
//   GET /api/overview/questions/:key.csv  the same answer as a CSV file
//
// HOW IT IS KEPT SAFE.
//   * It reads through a pool of its own (at most two connections), signed in
//     as the role overview_viewer (OVERVIEW_DATABASE_URL): a role that can read
//     the overview views and nothing else, and cannot write anywhere. DCRS's own
//     connection is never used here.
//   * It only ever runs SELECT, and only on a view the database's own catalog
//     lists in "overview" as readable by that role. A view name somebody sends
//     is looked up in that list; the name that goes into the SQL is the
//     catalog's own, quoted.
//   * Everything else a person sends (dates, search words, how many rows) goes
//     to PostgreSQL as a query parameter, never into the SQL text.
//   * Only the super admin (role "admin") gets past the door, after the same
//     sign-in check as every other route (requireAuth).
// Opening the page and every CSV taken away are lines in the activity log.
//
// NOT SET UP: when OVERVIEW_DATABASE_URL is unset, or the database has no
// overview views (docs/database/README.md says how to add them), every route
// answers 503 with the code "overview-not-set-up" and says so in plain words.

type LogActivity = (req: Request, who: PublicUser | null, action: string, target?: string, detail?: string, department?: string) => void;

/** One column of an answer: its name in the database, its heading in plain words, and its comment. */
export interface OverviewColumn {
  name: string;
  label: string;
  comment: string | null;
}

/** What a query gives back: the columns' names and PostgreSQL types, and the rows as text (null for NULL). */
export interface OverviewQueryResult {
  fields: { name: string; dataTypeID: number }[];
  rows: unknown[][];
}

/** Where the routes read. The viewer's own pool by default; a unit test hands in a stand-in. */
export interface OverviewDatabase {
  query(text: string, values?: unknown[]): Promise<OverviewQueryResult>;
}

export interface OverviewDeps {
  requireAuth: RequestHandler;
  logActivity: LogActivity;
  /** The database to read, or null when OVERVIEW_DATABASE_URL is not set. */
  database?: () => OverviewDatabase | null;
}

// ---------------------------------------------------------------------------
// the viewer's own connection

// Every value comes back as the text PostgreSQL wrote. A date or a time is
// then shown exactly as the view gives it, never moved into this computer's
// time zone by a JavaScript Date.
const AS_TEXT = { getTypeParser: () => (value: string) => value } as unknown as pg.CustomTypesConfig;

let shared: { url: string; pool: pg.Pool; db: OverviewDatabase } | null = null;

/** The pool signed in as overview_viewer, made when first needed; null while OVERVIEW_DATABASE_URL is not set. */
function viewerDatabase(): OverviewDatabase | null {
  const url = process.env.OVERVIEW_DATABASE_URL?.trim() ?? "";
  if (!url) return null;
  if (shared?.url === url) return shared.db;
  void shared?.pool.end().catch(() => undefined);
  const pool = new pg.Pool({
    connectionString: url,
    // At most two: the viewer role itself may hold only a handful (01-schemas-and-roles.sql).
    max: 2,
    idleTimeoutMillis: 10_000,
    // Also how long a third request waits for one of the two to be free.
    connectionTimeoutMillis: 20_000,
    application_name: "DCRS database overview",
    // Read-only from the first statement, even if the address named a role that could write.
    options: "-c default_transaction_read_only=on",
    types: AS_TEXT,
  });
  pool.on("error", (err) => console.error("[database overview]", err.message));
  const db: OverviewDatabase = {
    async query(text, values = []) {
      const result = await pool.query({ text, values, rowMode: "array" });
      return { fields: result.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })), rows: result.rows };
    },
  };
  shared = { url, pool, db };
  return db;
}

// ---------------------------------------------------------------------------
// the catalog: which views there are, and what they say about themselves

interface CatalogColumn {
  name: string;
  comment: string | null;
}

export interface CatalogView {
  name: string;
  comment: string | null;
  columns: CatalogColumn[];
}

/** A plain lower-case PostgreSQL name. The overview's views and columns are all written so; anything else is never offered. */
const PLAIN_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

/** A name from the catalog, quoted for SQL. It is a plain name already (PLAIN_NAME); the quotes are a second guard. */
const ident = (name: string): string => {
  if (!PLAIN_NAME.test(name)) throw new Error(`Not a plain name: ${name}`);
  return pg.escapeIdentifier(name);
};

const CATALOG_SQL = `
SELECT c.relname, obj_description(c.oid, 'pg_class'), a.attname, col_description(c.oid, a.attnum)
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE n.nspname = 'overview' AND c.relkind IN ('v', 'm') AND pg_catalog.has_table_privilege(c.oid, 'SELECT')
ORDER BY c.relname, a.attnum`;

const SCHEMA_SQL = `SELECT to_regnamespace('overview') IS NOT NULL, current_database(), current_user, current_setting('transaction_read_only')`;

const text = (value: unknown): string | null => (typeof value === "string" ? value : value === null || value === undefined ? null : String(value));

export function catalogFrom(rows: unknown[][]): CatalogView[] {
  const views: CatalogView[] = [];
  for (const [viewName, viewComment, columnName, columnComment] of rows) {
    const name = text(viewName) ?? "";
    const column = text(columnName) ?? "";
    if (!PLAIN_NAME.test(name) || !PLAIN_NAME.test(column)) continue;
    let view = views[views.length - 1];
    if (!view || view.name !== name) {
      view = { name, comment: text(viewComment), columns: [] };
      views.push(view);
    }
    view.columns.push({ name: column, comment: text(columnComment) });
  }
  return views;
}

// Read again at most every 15 seconds, and at once when a name is not found in
// it, so a view added to the database shows without a restart.
const CATALOG_MS = 15_000;
let catalogCache: { db: OverviewDatabase; at: number; views: CatalogView[] } | null = null;

async function readCatalog(db: OverviewDatabase, fresh = false): Promise<CatalogView[]> {
  if (!fresh && catalogCache && catalogCache.db === db && Date.now() - catalogCache.at < CATALOG_MS) return catalogCache.views;
  const views = catalogFrom((await db.query(CATALOG_SQL)).rows);
  catalogCache = { db, at: Date.now(), views };
  return views;
}

async function findView(db: OverviewDatabase, name: string): Promise<CatalogView | null> {
  const hit = (await readCatalog(db)).find((v) => v.name === name);
  if (hit) return hit;
  return (await readCatalog(db, true)).find((v) => v.name === name) ?? null;
}

const hasColumns = (view: CatalogView, names: string[]): boolean => names.every((n) => view.columns.some((c) => c.name === n));

// ---------------------------------------------------------------------------
// words

// A column's heading in plain words, made from its name: happened_factory_time
// reads "Happened (factory time)", ip_address "IP address". The comment the
// view gives it is shown beside it (the page's tooltip).
const HEADINGS: Record<string, string> = {
  happened_date: "Day it happened",
  asked_date: "Day asked",
  through_client: "Came through",
};
const WORDS: Record<string, string> = { dcrs: "DCRS", id: "ID", ip: "IP", utc: "UTC", sha256: "SHA-256", url: "URL", pdf: "PDF", capa: "CAPA" };

export function plainLabel(column: string): string {
  if (HEADINGS[column]) return HEADINGS[column];
  let rest = column;
  let after = "";
  for (const [ending, words] of [
    ["_factory_time", " (factory time)"],
    ["_utc", " (UTC)"],
    ["_bytes", " (bytes)"],
  ] as const) {
    if (rest.endsWith(ending) && rest.length > ending.length) {
      rest = rest.slice(0, -ending.length);
      after = words;
      break;
    }
  }
  const words = rest
    .replace(/sign_in/g, "sign-in")
    .split("_")
    .filter(Boolean)
    .map((w) => WORDS[w] ?? w)
    .join(" ");
  return (words.charAt(0).toUpperCase() + words.slice(1) + after).trim();
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_MS = 86_400_000;

const utcDate = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const isoOf = (d: Date): string => d.toISOString().slice(0, 10);

/** "Monday 21 September 2026". */
export function dayWords(iso: string): string {
  const d = utcDate(iso);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** A real calendar date written YYYY-MM-DD, or null. */
export function calendarDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return isoOf(utcDate(value)) === value ? value : null;
}

export interface Span {
  from: string;
  to: string;
  label: string;
  week?: "this" | "last";
}

/** A week, Monday to Sunday: the one that holds `today`, or the one before it. */
export function weekSpan(today: string, which: "this" | "last"): Span {
  const t = utcDate(today);
  const monday = new Date(t.getTime() - ((t.getUTCDay() + 6) % 7) * DAY_MS - (which === "last" ? 7 * DAY_MS : 0));
  const sunday = new Date(monday.getTime() + 6 * DAY_MS);
  const from = isoOf(monday);
  const to = isoOf(sunday);
  return { from, to, label: `${dayWords(from)} to ${dayWords(to)}`, week: which };
}

/** The month so far: its first day to `today`. */
export function monthSpan(today: string): Span {
  const from = `${today.slice(0, 8)}01`;
  return { from, to: today, label: `${dayWords(from)} to ${dayWords(today)} (today)` };
}

// ---------------------------------------------------------------------------
// what a cell says

const BOOLEAN = 16;
const TIMESTAMP = 1114;
const TIMESTAMPTZ = 1184;

/** A value as the page and the CSV show it: a moment to the second, true and false as Yes and No. */
export function cellText(value: unknown, dataTypeID: number): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value);
  if (dataTypeID === BOOLEAN) return s === "t" || s === "true" ? "Yes" : s === "f" || s === "false" ? "No" : s;
  if (dataTypeID === TIMESTAMP || dataTypeID === TIMESTAMPTZ) return s.replace(/\.\d+(?=$|[+-]\d)/, "");
  return s;
}

const tableOf = (result: OverviewQueryResult): (string | null)[][] => result.rows.map((row) => row.map((v, i) => cellText(v, result.fields[i]?.dataTypeID ?? 0)));

// ---------------------------------------------------------------------------
// the date each view is filtered by: its main day, named here and nowhere else

interface DayColumn {
  column: string;
  /** A moment, filtered by the day it falls on. */
  moment?: boolean;
}

const DAY_COLUMNS: Record<string, DayColumn> = {
  dcrs_accounts: { column: "created_factory_time", moment: true },
  records: { column: "record_date" },
  findings: { column: "report_date" },
  customer_complaints: { column: "complaint_received_date" },
  pest_control_reports_by_day: { column: "report_date" },
  dcrs_activity: { column: "happened_date" },
  dcrs_downloads: { column: "happened_date" },
  people: { column: "created_factory_time", moment: true },
  assistant_sessions: { column: "started_factory_time", moment: true },
  assistant_sign_ins: { column: "happened_date" },
  assistant_activity: { column: "asked_date" },
  file_handouts: { column: "happened_date" },
  downloads: { column: "happened_date" },
};

/** The view's main day, when it has one and the view still has that column. */
function dayColumnOf(view: CatalogView): DayColumn | null {
  const day = DAY_COLUMNS[view.name];
  return day && hasColumns(view, [day.column]) ? day : null;
}

// ---------------------------------------------------------------------------
// the queries

export interface Filter {
  from: string | null;
  to: string | null;
  q: string | null;
}

export interface Built {
  text: string;
  values: unknown[];
}

/** A search typed by a person, as a LIKE pattern: its own % and _ are plain characters. */
const likePattern = (q: string): string => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** The rows of one view, filtered and a page long (one row more, to know whether there are more). */
export function viewQuery(view: CatalogView, filter: Filter, limit: number, offset: number): Built {
  const values: unknown[] = [];
  const where: string[] = [];
  const day = dayColumnOf(view);
  const dayExpr = day ? (day.moment ? `(${ident(day.column)})::date` : ident(day.column)) : null;
  if (dayExpr && filter.from) {
    values.push(filter.from);
    where.push(`${dayExpr} >= $${values.length}::date`);
  }
  if (dayExpr && filter.to) {
    values.push(filter.to);
    where.push(`${dayExpr} <= $${values.length}::date`);
  }
  if (filter.q) {
    values.push(likePattern(filter.q));
    // Every column of the row as text, one after another: the search finds its words in any of them.
    where.push(`array_to_string(ARRAY[${view.columns.map((c) => `${ident(c.name)}::text`).join(", ")}], ' ') ILIKE $${values.length}`);
  }
  values.push(limit + 1, offset);
  // No ORDER BY of its own: each view is sorted by its own definition, and
  // PostgreSQL keeps that order under a filter and a LIMIT (a view that sorts
  // is never merged into the query around it).
  return {
    text: `SELECT ${view.columns.map((c) => ident(c.name)).join(", ")} FROM overview.${ident(view.name)}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  };
}

// THE READY-MADE QUESTIONS. Each is one fixed query on one view, written here;
// the only things a person chooses are the week and how far down to read, and
// both go in as parameters. A question is offered only when its view and every
// column it names are in the database, so part 3's questions appear once the
// Audit Assistant's views are there (database/sql/03-overview-chatbot.sql).

interface QuestionSource {
  view: string;
  select: string[];
  /** Fixed SQL on the view's own columns; $FROM and $TO stand for the span's first and last day. */
  where?: string;
  orderBy: string;
  /** The columns `where` and `orderBy` name, checked against the catalog. */
  uses: string[];
  description: string;
}

interface Question {
  key: string;
  title: (span: Span | null) => string;
  span: "week" | "month" | null;
  /** In order of preference: the first whose view is there is used. */
  sources: QuestionSource[];
}

const DOWNLOAD_WORDS = "Every download (as Excel, Word or PDF), print and upload of changes, newest first.";

const QUESTIONS: Question[] = [
  {
    key: "downloads",
    title: (span) => `Who downloaded or printed what ${span?.week === "this" ? "this" : "last"} week?`,
    span: "week",
    sources: [
      {
        // Both systems together, once the Audit Assistant's views are there.
        view: "downloads",
        select: ["happened_factory_time", "system", "person_name", "what_happened", "what", "detail", "ip_address", "device"],
        where: "happened_date BETWEEN $FROM AND $TO",
        orderBy: "happened_utc DESC",
        uses: ["happened_date", "happened_utc"],
        description: `${DOWNLOAD_WORDS} DCRS and the Audit Assistant together: its files and conversations opened, downloaded or shared are here too.`,
      },
      {
        view: "dcrs_downloads",
        select: ["happened_factory_time", "person_name", "what_happened", "document", "detail", "department_name", "ip_address", "through_client"],
        where: "happened_date BETWEEN $FROM AND $TO",
        orderBy: "happened_utc DESC, activity_id DESC",
        uses: ["happened_date", "happened_utc", "activity_id"],
        description: `${DOWNLOAD_WORDS} From DCRS's activity log.`,
      },
    ],
  },
  {
    key: "open-findings",
    title: () => "Which CAPA findings are open?",
    span: null,
    sources: [
      {
        view: "findings",
        select: ["finding_id", "status", "days_overdue", "report_date", "finding", "target_date", "corrective_action_by_plant", "corrective_action_by_contractor", "report_status", "record_id"],
        where: "status IN ('Open', 'Overdue')",
        orderBy: "target_date NULLS LAST, report_date, finding_number, finding_id",
        uses: ["status", "target_date", "report_date", "finding_number", "finding_id"],
        description: "The internal CAPA findings not yet closed or verified, the most overdue first. Overdue means past the target date with no date of action.",
      },
    ],
  },
  {
    key: "missing-pest-control-reports",
    title: () => "Which pest control reports are missing this month?",
    span: "month",
    sources: [
      {
        view: "pest_control_reports_by_day",
        select: ["report_date", "weekday", "status", "record_id", "checked_by", "checkpoints_answered", "submitted_by"],
        where: "report_date BETWEEN $FROM AND $TO AND status NOT IN ('Submitted', 'Pending Verification', 'Verified') AND holiday IS NOT TRUE",
        orderBy: "report_date",
        uses: ["report_date", "status", "holiday"],
        description:
          "The days of this month, up to today, whose Daily Pest Control Monitoring Record (F/HR/17) is not submitted yet: not started at all, or started and not finished. Days marked as a holiday are left out; Thursday is the weekly day off.",
      },
    ],
  },
  {
    key: "changes-through-assistant",
    title: () => "What changed in DCRS through the Audit Assistant?",
    span: null,
    sources: [
      {
        view: "dcrs_activity",
        select: ["happened_factory_time", "person_name", "action", "on_what", "detail", "through_client", "department_name", "ip_address"],
        where: "through_client IS NOT NULL",
        orderBy: "happened_utc DESC, activity_id DESC",
        uses: ["through_client", "happened_utc", "activity_id"],
        description: "Every line of DCRS's activity log that came through another system rather than DCRS's own pages: the changes it made as the person, and the reports it downloaded. Newest first.",
      },
    ],
  },
  {
    key: "assistant-actions",
    title: (span) => `What did the Audit Assistant do ${span?.week === "this" ? "this" : "last"} week?`,
    span: "week",
    sources: [
      {
        view: "assistant_activity",
        select: ["asked_factory_time", "person_name", "dcrs_action", "reads_or_changes", "what_was_asked", "status", "error", "finding_id", "document_name", "record_date"],
        where: "asked_date BETWEEN $FROM AND $TO",
        orderBy: "asked_utc DESC",
        uses: ["asked_date", "asked_utc"],
        description: "Every action the Audit Assistant took or proposed in DCRS, for whom, and what happened. Never the person's own words. Newest first.",
      },
    ],
  },
  {
    key: "assistant-devices",
    title: () => "Who signed in to the Audit Assistant, from which device?",
    span: null,
    sources: [
      {
        view: "assistant_sessions",
        select: ["person_name", "device_name", "device_model", "operating_system", "app_version", "sign_in_ip_address", "last_ip_address", "started_factory_time", "last_seen_factory_time", "state", "end_reason"],
        orderBy: "last_seen_utc DESC NULLS LAST",
        uses: ["last_seen_utc"],
        description: "One line per device a person has signed in to the Audit Assistant from: the device, the addresses, when, and whether it is still signed in. The most recently used first.",
      },
    ],
  },
];

/** The question's source this database can answer it from, or null. */
function sourceFor(question: Question, views: CatalogView[]): { source: QuestionSource; view: CatalogView } | null {
  for (const source of question.sources) {
    const view = views.find((v) => v.name === source.view);
    if (view && hasColumns(view, [...source.select, ...source.uses])) return { source, view };
  }
  return null;
}

export function questionQuery(source: QuestionSource, span: Span | null, limit: number, offset: number): Built {
  const values: unknown[] = [];
  let where = source.where ?? "";
  if (span && where.includes("$FROM")) {
    values.push(span.from, span.to);
    where = where.replaceAll("$FROM", "$1::date").replaceAll("$TO", "$2::date");
  }
  values.push(limit + 1, offset);
  return {
    text: `SELECT ${source.select.map(ident).join(", ")} FROM overview.${ident(source.view)}${where ? ` WHERE ${where}` : ""} ORDER BY ${source.orderBy} LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  };
}

// ---------------------------------------------------------------------------
// CSV

// DCRS's own CSV writer, frontend/src/utils/csv.ts toCSV: its quoting, and its
// guard that keeps a cell such as =HYPERLINK(...) from running as a formula
// when the file is opened in Excel. Loaded when first needed, by a path held in
// a variable: that file also holds the browser's download helpers, which the
// server's type check (no browser in it) cannot read and which are never called here.
type ToCsv = (headers: string[], rows: (string | number)[][]) => string;
const CSV_MODULE = "../frontend/src/utils/csv.ts";
let csvWriter: Promise<ToCsv> | null = null;
const loadCsvWriter = (): Promise<ToCsv> => (csvWriter ??= (import(CSV_MODULE) as Promise<{ toCSV: ToCsv }>).then((m) => m.toCSV));

/** The file's text: a byte-order mark first, so Excel reads it as UTF-8 (names in Gujarati, dashes). */
export async function csvText(columns: OverviewColumn[], rows: (string | null)[][]): Promise<string> {
  const toCSV = await loadCsvWriter();
  return String.fromCharCode(0xfeff) + toCSV(
    columns.map((c) => c.label),
    rows.map((r) => r.map((v) => v ?? ""))
  );
}

/** What the activity log says about a CSV file taken away: how many rows, whether there were more, and the filter. */
function csvDetail(rows: number, more: boolean, filter: string): string {
  const count = `${rows.toLocaleString("en-IN")} row${rows === 1 ? "" : "s"} as CSV`;
  return [more ? `${count}, the first ${MAX_CSV_ROWS.toLocaleString("en-IN")} of more` : count, filter].filter(Boolean).join(" · ");
}

/** A file name with nothing in it a browser or a disk could stumble on. */
const fileName = (words: string): string => `${words.replace(/[^A-Za-z0-9 ._-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "overview"}.csv`;

// ---------------------------------------------------------------------------
// the answers

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MAX_OFFSET = 10_000_000;
const MAX_CSV_ROWS = 20_000;
const MAX_SEARCH = 200;

class BadRequest extends Error {}

function whole(value: unknown, fallback: number, max: number, name: string): number {
  if (value === undefined || value === "") return fallback;
  if (typeof value !== "string" || !/^\d{1,9}$/.test(value)) throw new BadRequest(`${name} must be a whole number.`);
  const n = Number(value);
  if (n > max) throw new BadRequest(`${name} can be at most ${max.toLocaleString("en-IN")}.`);
  return n;
}

function pageOf(req: Request): { limit: number; offset: number } {
  const limit = whole(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT, "limit");
  if (limit < 1) throw new BadRequest("limit must be at least 1.");
  return { limit, offset: whole(req.query.offset, 0, MAX_OFFSET, "offset") };
}

function filterOf(req: Request): Filter {
  const date = (key: "from" | "to"): string | null => {
    const raw = req.query[key];
    if (raw === undefined || raw === "") return null;
    const day = calendarDate(raw);
    if (!day) throw new BadRequest(`${key} must be a date written YYYY-MM-DD.`);
    return day;
  };
  const from = date("from");
  const to = date("to");
  if (from && to && from > to) throw new BadRequest("The from date is after the to date.");
  const raw = req.query.q;
  if (raw !== undefined && typeof raw !== "string") throw new BadRequest("q must be one piece of text.");
  const q = (raw ?? "").trim();
  if (q.length > MAX_SEARCH) throw new BadRequest(`The search can be at most ${MAX_SEARCH} characters.`);
  return { from, to, q: q || null };
}

function weekOf(req: Request): "this" | "last" {
  const raw = req.query.week;
  if (raw === undefined || raw === "" || raw === "last") return "last";
  if (raw === "this") return "this";
  throw new BadRequest('week must be "this" or "last".');
}

/** The factory's today, as the overview's own views count it (overview.factory_today(), Asia/Kolkata). */
async function factoryToday(db: OverviewDatabase): Promise<string> {
  const day = text((await db.query("SELECT overview.factory_today()::text")).rows[0]?.[0]);
  if (!day || !calendarDate(day)) throw new Error("The database did not say what day it is at the factory.");
  return day;
}

const columnsOf = (view: CatalogView, names?: string[]): OverviewColumn[] =>
  (names ?? view.columns.map((c) => c.name)).map((name) => ({ name, label: plainLabel(name), comment: view.columns.find((c) => c.name === name)?.comment ?? null }));

function filterWords(view: CatalogView, filter: Filter): string {
  const day = dayColumnOf(view);
  const parts: string[] = [];
  if (day && (filter.from || filter.to)) parts.push(`${plainLabel(day.column)} ${filter.from ? `from ${filter.from}` : ""}${filter.from && filter.to ? " " : ""}${filter.to ? `to ${filter.to}` : ""}`);
  if (filter.q) parts.push(`search "${filter.q.slice(0, 80)}"`);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// when it cannot answer

const SET_UP_WORDS =
  "To set it up: apply database/sql/01-schemas-and-roles.sql and 02-overview-dcrs.sql to the DCRS database as a PostgreSQL superuser (npm run db:shared -- setup), give the role overview_viewer a password, put OVERVIEW_DATABASE_URL=postgres://overview_viewer:<its password>@<database host>:<port>/<DCRS database> in backend/.env and restart DCRS. docs/database/README.md has the steps.";

interface Failure {
  status: number;
  code: string;
  error: string;
}

const notSetUp = (why: string): Failure => ({ status: 503, code: "overview-not-set-up", error: `${why} ${SET_UP_WORDS}` });

/** What a database error means for the person looking, or null for one that is a fault here. */
export function describeFailure(err: unknown): Failure | null {
  const code = (err as { code?: unknown })?.code;
  const message = err instanceof Error ? err.message : String(err);
  switch (code) {
    case "28P01":
    case "28000":
      return notSetUp("The database refused the viewer's sign-in: check the user name and password in OVERVIEW_DATABASE_URL.");
    case "3D000":
      return notSetUp("The database named in OVERVIEW_DATABASE_URL does not exist.");
    case "42P01":
    case "42501":
    case "42883":
      return notSetUp("The overview views are missing or changed, or the viewer may not read them.");
    case "53300":
      return { status: 503, code: "overview-busy", error: "The database has too many connections open just now. Try again in a moment." };
    case "57014":
      return { status: 504, code: "overview-timeout", error: "That took too long to read. Narrow it down with dates or a search, and try again." };
    case "57P01":
    case "57P03":
    case "08000":
    case "08001":
    case "08003":
    case "08006":
    case "ECONNREFUSED":
    case "ECONNRESET":
    case "ENOTFOUND":
    case "EAI_AGAIN":
    case "ETIMEDOUT":
    case "EHOSTUNREACH":
      return { status: 503, code: "overview-unreachable", error: "The database named in OVERVIEW_DATABASE_URL could not be reached, or is too busy to answer. Try again in a moment; if it goes on, tell whoever looks after the server." };
    default:
      if (/timeout|terminated|connection/i.test(message) && !code) {
        return { status: 503, code: "overview-unreachable", error: "The database named in OVERVIEW_DATABASE_URL could not be reached, or is too busy to answer. Try again in a moment; if it goes on, tell whoever looks after the server." };
      }
      return null;
  }
}

function fail(res: Response, status: number, code: string, error: string): void {
  res.status(status).json({ error, code });
}

// ---------------------------------------------------------------------------
// the routes

export function registerOverviewRoutes(app: Express, deps: OverviewDeps): void {
  const { requireAuth, logActivity } = deps;
  const database = deps.database ?? viewerDatabase;

  // THE SUPER ADMIN'S ALONE, after the same sign-in check as every route
  // (which also stops an account still on the administrator's password).
  const superAdmin = (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as Request & { user?: PublicUser }).user;
    if (user?.role !== "admin") return fail(res, 403, "not-admin", "Only the super admin can open the database overview.");
    next();
  };
  const door = [requireAuth, superAdmin];
  const userOf = (req: Request): PublicUser => (req as Request & { user: PublicUser }).user;

  /** Runs `work` on the viewer's database, and says in plain words when it cannot. */
  const answer = async (res: Response, work: (db: OverviewDatabase) => Promise<void>): Promise<void> => {
    const db = database();
    if (!db) {
      const f = notSetUp("The database overview is not set up on this server: OVERVIEW_DATABASE_URL is not set.");
      return fail(res, f.status, f.code, f.error);
    }
    try {
      await work(db);
    } catch (err) {
      if (err instanceof BadRequest) return fail(res, 400, "bad-request", err.message);
      const failure = describeFailure(err);
      if (!failure) throw err;
      catalogCache = null;
      if (failure.status >= 500) console.error("[database overview]", err instanceof Error ? err.message : err);
      fail(res, failure.status, failure.code, failure.error);
    }
  };

  /** The views, or a "not set up" answer already sent. */
  const viewsOrRefusal = async (db: OverviewDatabase, res: Response, fresh = false): Promise<CatalogView[] | null> => {
    const views = await readCatalog(db, fresh);
    if (views.length > 0) return views;
    const [hasSchema] = (await db.query(SCHEMA_SQL)).rows[0] ?? [];
    const f = notSetUp(
      hasSchema === "t" || hasSchema === true
        ? "The overview schema has no views the viewer may read yet."
        : "The database named in OVERVIEW_DATABASE_URL has no overview schema yet."
    );
    fail(res, f.status, f.code, f.error);
    return null;
  };

  // ---- set up or not, and which views there are. Called once each time the page opens.
  app.get("/api/overview/status", ...door, async (req: Request, res: Response): Promise<void> => {
    logActivity(req, userOf(req), "Database overview opened");
    await answer(res, async (db) => {
      const views = await viewsOrRefusal(db, res, true);
      if (!views) return;
      const [, databaseName, role, readOnly] = (await db.query(SCHEMA_SQL)).rows[0] ?? [];
      res.json({ setUp: true, database: text(databaseName), role: text(role), readOnly: readOnly === "on" || readOnly === "t", views: views.map((v) => v.name) });
    });
  });

  // ---- every view, what it holds, and what each of its columns means
  app.get("/api/overview/views", ...door, async (_req: Request, res: Response): Promise<void> => {
    await answer(res, async (db) => {
      const views = await viewsOrRefusal(db, res);
      if (!views) return;
      res.json({
        views: views.map((v) => ({ name: v.name, label: plainLabel(v.name), comment: v.comment, dayColumn: dayColumnOf(v)?.column ?? null, columns: columnsOf(v) })),
      });
    });
  });

  // ---- one view's rows, or all of them as a CSV file
  app.get("/api/overview/views/:name", ...door, async (req: Request, res: Response): Promise<void> => {
    const asked = String(req.params.name ?? "");
    const csv = asked.endsWith(".csv");
    const name = csv ? asked.slice(0, -4) : asked;
    await answer(res, async (db) => {
      const filter = filterOf(req);
      const { limit, offset } = csv ? { limit: MAX_CSV_ROWS, offset: 0 } : pageOf(req);
      const views = await viewsOrRefusal(db, res);
      if (!views) return;
      const view = PLAIN_NAME.test(name) ? await findView(db, name) : null;
      if (!view) return fail(res, 404, "no-such-view", `There is no view "${name.slice(0, 80)}" in the database overview.`);
      const query = viewQuery(view, filter, limit, offset);
      const result = await db.query(query.text, query.values);
      const rows = tableOf(result);
      const more = rows.length > limit;
      const shown = more ? rows.slice(0, limit) : rows;
      const columns = columnsOf(view);
      if (csv) {
        const body = await csvText(columns, shown);
        logActivity(req, userOf(req), "Database overview exported", `overview.${view.name}`, csvDetail(shown.length, more, filterWords(view, filter)));
        const span = filter.from || filter.to ? ` ${filter.from ?? "start"} to ${filter.to ?? "today"}` : "";
        res
          .status(200)
          .set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${fileName(`${view.name}${span}`)}"`, "Cache-Control": "no-store" })
          .send(body);
        return;
      }
      res.json({
        view: view.name,
        title: plainLabel(view.name),
        comment: view.comment,
        dayColumn: dayColumnOf(view)?.column ?? null,
        filter,
        columns,
        rows: shown,
        offset,
        limit,
        more,
      });
    });
  });

  // ---- the ready-made questions this database can answer
  app.get("/api/overview/questions", ...door, async (_req: Request, res: Response): Promise<void> => {
    await answer(res, async (db) => {
      const views = await viewsOrRefusal(db, res);
      if (!views) return;
      const offered = QUESTIONS.flatMap((q) => {
        const found = sourceFor(q, views);
        if (!found) return [];
        const example = q.span === "week" ? { from: "", to: "", label: "", week: "last" as const } : null;
        return [{ key: q.key, title: q.title(example), description: found.source.description, span: q.span, view: found.view.name }];
      });
      res.json({ questions: offered });
    });
  });

  // ---- one question answered, or its whole answer as a CSV file
  app.get("/api/overview/questions/:key", ...door, async (req: Request, res: Response): Promise<void> => {
    const asked = String(req.params.key ?? "");
    const csv = asked.endsWith(".csv");
    const key = csv ? asked.slice(0, -4) : asked;
    await answer(res, async (db) => {
      const week = weekOf(req);
      const { limit, offset } = csv ? { limit: MAX_CSV_ROWS, offset: 0 } : pageOf(req);
      const question = QUESTIONS.find((q) => q.key === key);
      const views = await viewsOrRefusal(db, res);
      if (!views) return;
      const found = question ? sourceFor(question, views) : null;
      if (!question || !found) return fail(res, 404, "no-such-question", `There is no question "${key.slice(0, 80)}" this database can answer.`);
      const span = question.span === "week" ? weekSpan(await factoryToday(db), week) : question.span === "month" ? monthSpan(await factoryToday(db)) : null;
      const query = questionQuery(found.source, span, limit, offset);
      const result = await db.query(query.text, query.values);
      const rows = tableOf(result);
      const more = rows.length > limit;
      const shown = more ? rows.slice(0, limit) : rows;
      const columns = columnsOf(found.view, found.source.select);
      const title = question.title(span);
      if (csv) {
        const body = await csvText(columns, shown);
        logActivity(req, userOf(req), "Database overview exported", title, csvDetail(shown.length, more, span ? `${span.from} to ${span.to}` : ""));
        res
          .status(200)
          .set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${fileName(`${question.key}${span ? ` ${span.from} to ${span.to}` : ""}`)}"`, "Cache-Control": "no-store" })
          .send(body);
        return;
      }
      res.json({
        key: question.key,
        title,
        description: found.source.description,
        view: found.view.name,
        comment: found.view.comment,
        span: question.span,
        range: span,
        columns,
        rows: shown,
        offset,
        limit,
        more,
      });
    });
  });

  // Anything else under /api/overview: said as JSON, never the app's page.
  app.use("/api/overview", ...door, (_req: Request, res: Response): void => {
    fail(res, 404, "no-such-route", "There is no such route in the database overview.");
  });
}
