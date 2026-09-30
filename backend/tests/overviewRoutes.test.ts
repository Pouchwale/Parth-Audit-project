// THE DATABASE OVERVIEW (REQUIREMENTS §83), backend/overviewRoutes.ts, run on a
// real Express server over a stand-in for the viewer's database — no
// PostgreSQL. What needs no database is proved here:
//   * the door: not signed in is refused, anybody but the super admin gets 403
//     and the database is never asked;
//   * "not set up" (no OVERVIEW_DATABASE_URL, no overview schema, no views, a
//     refused sign-in) is a 503 that says in words how to set it up;
//   * only views the catalog lists are ever read, by the catalog's own name;
//     every value a person sends goes in as a parameter, never into the SQL;
//   * the filters, the paging and "more", the CSV (Excel's formula guard, the
//     byte-order mark, the 20,000-row cap) and its line in the activity log;
//   * the ready-made questions: offered only when their views are there, the
//     weeks Monday to Sunday in the factory's time, with the dates in words.
// The same routes are driven end to end by tests/e2e_database_overview.py.
// Run: npm run test:unit -- overviewRoutes
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import express, { type NextFunction, type Request, type Response } from "express";
import type { PublicUser } from "../auth.ts";
import {
  calendarDate,
  cellText,
  dayWords,
  describeFailure,
  monthSpan,
  plainLabel,
  registerOverviewRoutes,
  weekSpan,
  type OverviewDatabase,
  type OverviewQueryResult,
} from "../overviewRoutes.ts";

// ---------------------------------------------------------------------------
// the stand-ins

interface ViewDef {
  comment: string;
  columns: [string, string | null][];
  /** The view's rows, all of them; the stand-in pages them by the query's LIMIT and OFFSET. */
  rows?: unknown[][];
  /** PostgreSQL type ids by column name (text when not given). */
  types?: Record<string, number>;
}

class FakeDb implements OverviewDatabase {
  views = new Map<string, ViewDef>();
  hasSchema = true;
  today = "2026-09-30";
  calls: { text: string; values: unknown[] }[] = [];
  failWith: unknown = null;

  async query(text: string, values: unknown[] = []): Promise<OverviewQueryResult> {
    this.calls.push({ text, values });
    if (this.failWith) throw this.failWith;
    if (text.includes("pg_catalog.pg_attribute")) {
      const rows: unknown[][] = [];
      for (const name of [...this.views.keys()].sort()) {
        const v = this.views.get(name)!;
        for (const [column, comment] of v.columns) rows.push([name, v.comment, column, comment]);
      }
      return { fields: [], rows };
    }
    if (text.includes("to_regnamespace")) return { fields: [], rows: [[this.hasSchema ? "t" : "f", "dcrs", "overview_viewer", "on"]] };
    if (text.includes("factory_today")) return { fields: [], rows: [[this.today]] };
    const m = /FROM overview\."([a-z_]+)"/.exec(text);
    assert.ok(m, `a query the stand-in does not know: ${text}`);
    const view = this.views.get(m[1]);
    assert.ok(view, `a query on a view the catalog does not list: ${m[1]}`);
    const select = /^SELECT (.+?) FROM /.exec(text)![1].split(", ").map((c) => c.replace(/"/g, ""));
    const limit = Number(values[values.length - 2]);
    const offset = Number(values[values.length - 1]);
    const all = view.rows ?? [];
    const index = (name: string) => view.columns.findIndex(([c]) => c === name);
    return {
      fields: select.map((name) => ({ name, dataTypeID: view.types?.[name] ?? 25 })),
      rows: all.slice(offset, offset + limit).map((row) => select.map((name) => row[index(name)])),
    };
  }

  /** The queries that read a view (not the catalog, not today). */
  reads(): { text: string; values: unknown[] }[] {
    return this.calls.filter((c) => /FROM overview\./.test(c.text));
  }
}

const FINDING_COLUMNS: [string, string | null][] = [
  ["finding_id", "The finding's readable id."],
  ["finding_reference", "The permanent reference."],
  ["record_id", "The report."],
  ["finding_number", "Its S.No."],
  ["report_date", "The date of the report."],
  ["finding", "What was found."],
  ["target_date", "By when."],
  ["corrective_action_by_plant", "The plant's action."],
  ["corrective_action_by_contractor", "The contractor's action."],
  ["status", "Open, Overdue, Closed or Verified."],
  ["days_overdue", "Days past the target."],
  ["report_status", "The report's status."],
  ["last_changed_factory_time", "When the report last changed, in factory time."],
];

function findingRow(n: number, extra: Partial<Record<string, unknown>> = {}): unknown[] {
  const row: Record<string, unknown> = {
    finding_id: `CAPA-2023-12-13-${n}`,
    finding_reference: `gap-2023-12-13:f${n}`,
    record_id: "gap-2023-12-13",
    finding_number: String(n),
    report_date: "2023-12-13",
    finding: n === 2 ? "Rodent box numbering missing" : `Finding ${n}`,
    target_date: "2023-12-31",
    corrective_action_by_plant: "=HYPERLINK(\"http://x\")",
    corrective_action_by_contractor: null,
    status: "Overdue",
    days_overdue: "1004",
    report_status: "Submitted",
    last_changed_factory_time: "2026-09-29 10:15:03.123456",
    ...extra,
  };
  return FINDING_COLUMNS.map(([c]) => row[c]);
}

const DOWNLOAD_COLUMNS: [string, string | null][] = [
  ["activity_id", "The line's number."],
  ["happened_factory_time", "When, in factory time."],
  ["happened_utc", "When, in UTC."],
  ["happened_date", "The day, at the factory."],
  ["person_name", "Who."],
  ["person_email", "Their email."],
  ["what_happened", "Downloaded as Excel ..."],
  ["document", "Which document."],
  ["detail", "More about it."],
  ["department_name", "The department."],
  ["ip_address", "The address."],
  ["through_client", "The other system."],
];

/** The views of part 2 that the questions read. */
function partTwo(db: FakeDb): void {
  db.views.set("findings", { comment: "One row per internal CAPA finding.", columns: FINDING_COLUMNS, rows: [1, 2, 3].map((n) => findingRow(n)), types: { last_changed_factory_time: 1114 } });
  db.views.set("dcrs_downloads", {
    comment: "Every time a document left DCRS.",
    columns: DOWNLOAD_COLUMNS,
    rows: [["7", "2026-09-30 11:00:00.5", "2026-09-30 05:30:00.5", "2026-09-30", "Super Admin", "admin@gpp.local", "Downloaded as Excel", "F/HR/01 Personal Competence Records", "", "Human Resources", "::1", null]],
  });
  db.views.set("pest_control_reports_by_day", {
    comment: "One row per day of F/HR/17.",
    columns: [
      ["report_date", "The day."],
      ["weekday", "The weekday."],
      ["record_id", "The record."],
      ["status", "Its status."],
      ["holiday", "A holiday?"],
      ["checked_by", "Who checked."],
      ["checkpoints_answered", "How many."],
      ["submitted_by", "Who submitted."],
    ],
    rows: [["2026-09-01", "Tuesday", null, "Not started", null, null, null, null]],
    types: { holiday: 16 },
  });
  db.views.set("dcrs_activity", {
    comment: "Every line of the activity log.",
    columns: [
      ["activity_id", "Number."],
      ["happened_factory_time", "When."],
      ["happened_utc", "When, UTC."],
      ["happened_date", "Day."],
      ["person_name", "Who."],
      ["action", "What."],
      ["on_what", "On what."],
      ["detail", "Detail."],
      ["department_name", "Department."],
      ["ip_address", "Address."],
      ["through_client", "Through."],
      ["archived", "Archived?"],
    ],
    rows: [],
    types: { archived: 16 },
  });
}

/** The views of part 3, the Audit Assistant's. */
function partThree(db: FakeDb): void {
  db.views.set("downloads", {
    comment: "Both systems together.",
    columns: [
      ["happened_factory_time", "When."],
      ["happened_utc", "When, UTC."],
      ["happened_date", "Day."],
      ["system", "DCRS or Audit Assistant."],
      ["person_name", "Who."],
      ["what_happened", "What."],
      ["what", "Which."],
      ["detail", "More."],
      ["ip_address", "Address."],
      ["device", "Device."],
    ],
    rows: [],
  });
  db.views.set("assistant_activity", {
    comment: "Every action of the assistant.",
    columns: ["asked_factory_time", "asked_utc", "asked_date", "person_name", "dcrs_action", "reads_or_changes", "what_was_asked", "status", "error", "finding_id", "document_name", "record_date"].map((c) => [c, `${c}.`]),
    rows: [],
  });
  db.views.set("assistant_sessions", {
    comment: "One row per device.",
    columns: ["person_name", "device_name", "device_model", "operating_system", "app_version", "sign_in_ip_address", "last_ip_address", "started_factory_time", "last_seen_factory_time", "last_seen_utc", "state", "end_reason"].map((c) => [c, `${c}.`]),
    rows: [],
  });
  db.views.set("people", { comment: "People.", columns: [["person_id", "Id."], ["name", "Name."]], rows: [] });
}

const ADMIN: PublicUser = { id: "u-admin", name: "Super Admin", email: "admin@gpp.local", role: "admin", departments: [] };
const STAFF: PublicUser = { id: "u-staff", name: "Kapila Barad", email: "kapila@gpp.local", role: "staff", departments: ["QC"] };

// The server's own requireAuth reads the session; this one reads a test header.
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const who = req.get("x-test-user");
  if (who === "admin") (req as Request & { user: PublicUser }).user = ADMIN;
  else if (who === "staff") (req as Request & { user: PublicUser }).user = STAFF;
  else if (who === "first-password") {
    res.status(403).json({ error: "Choose a password of your own before you carry on.", code: "password-change-required" });
    return;
  } else {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }
  next();
}

interface Line {
  who: string | undefined;
  action: string;
  target: string;
  detail: string;
}

interface Server {
  base: string;
  lines: Line[];
  setDb(db: FakeDb | null): void;
  close(): Promise<void>;
}

async function start(): Promise<Server> {
  let current: FakeDb | null = null;
  const lines: Line[] = [];
  const app = express();
  registerOverviewRoutes(app, {
    requireAuth,
    logActivity: (_req, who, action, target = "", detail = "") => lines.push({ who: who?.email, action, target, detail }),
    database: () => current,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    lines,
    setDb: (db) => {
      current = db;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

let s: Server;
before(async () => {
  s = await start();
});
after(async () => {
  await s.close();
});

async function get(route: string, who: string | null = "admin"): Promise<{ status: number; json: any; text: string; headers: Headers }> {
  const res = await fetch(s.base + route, { headers: who ? { "x-test-user": who } : {} });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text, headers: res.headers };
}

function fresh(withPartThree = false): FakeDb {
  const db = new FakeDb();
  partTwo(db);
  if (withPartThree) partThree(db);
  s.setDb(db);
  s.lines.length = 0;
  return db;
}

const ROUTES = [
  "/api/overview/status",
  "/api/overview/views",
  "/api/overview/views/findings",
  "/api/overview/views/findings.csv",
  "/api/overview/questions",
  "/api/overview/questions/open-findings",
  "/api/overview/questions/downloads.csv",
];

// ---------------------------------------------------------------------------
// words and days

describe("plain words", () => {
  it("heads each column with its name in plain words", () => {
    assert.equal(plainLabel("finding_id"), "Finding ID");
    assert.equal(plainLabel("happened_factory_time"), "Happened (factory time)");
    assert.equal(plainLabel("created_utc"), "Created (UTC)");
    assert.equal(plainLabel("last_sign_in_factory_time"), "Last sign-in (factory time)");
    assert.equal(plainLabel("assistant_failed_sign_ins"), "Assistant failed sign-ins");
    assert.equal(plainLabel("sign_in_ip_address"), "Sign-in IP address");
    assert.equal(plainLabel("dcrs_record_id"), "DCRS record ID");
    assert.equal(plainLabel("sha256"), "SHA-256");
    assert.equal(plainLabel("size_bytes"), "Size (bytes)");
    assert.equal(plainLabel("corrective_action_by_plant"), "Corrective action by plant");
    assert.equal(plainLabel("happened_date"), "Day it happened");
    assert.equal(plainLabel("through_client"), "Came through");
    assert.equal(plainLabel("pest_control_reports_by_day"), "Pest control reports by day");
    assert.equal(plainLabel("dcrs_accounts"), "DCRS accounts");
  });

  it("writes a day in words", () => {
    assert.equal(dayWords("2026-09-21"), "Monday 21 September 2026");
    assert.equal(dayWords("2027-01-03"), "Sunday 3 January 2027");
  });

  it("takes a week from Monday to Sunday, this one or the one before", () => {
    // Wednesday 30 September 2026.
    assert.deepEqual(weekSpan("2026-09-30", "this"), { from: "2026-09-28", to: "2026-10-04", label: "Monday 28 September 2026 to Sunday 4 October 2026", week: "this" });
    assert.deepEqual(weekSpan("2026-09-30", "last"), { from: "2026-09-21", to: "2026-09-27", label: "Monday 21 September 2026 to Sunday 27 September 2026", week: "last" });
    // A Monday is the first day of its own week; a Sunday the last.
    assert.equal(weekSpan("2026-09-28", "this").from, "2026-09-28");
    assert.equal(weekSpan("2026-10-04", "this").from, "2026-09-28");
    assert.equal(weekSpan("2026-10-04", "last").to, "2026-09-27");
    // Across a year's end.
    assert.deepEqual([weekSpan("2027-01-01", "this").from, weekSpan("2027-01-01", "this").to], ["2026-12-28", "2027-01-03"]);
    assert.deepEqual([weekSpan("2027-01-01", "last").from, weekSpan("2027-01-01", "last").to], ["2026-12-21", "2026-12-27"]);
  });

  it("takes the month so far", () => {
    assert.deepEqual(monthSpan("2026-09-30"), { from: "2026-09-01", to: "2026-09-30", label: "Tuesday 1 September 2026 to Wednesday 30 September 2026 (today)" });
    assert.equal(monthSpan("2026-10-01").from, "2026-10-01");
  });

  it("reads only real calendar dates", () => {
    assert.equal(calendarDate("2026-09-30"), "2026-09-30");
    assert.equal(calendarDate("2026-02-30"), null);
    assert.equal(calendarDate("2026-9-30"), null);
    assert.equal(calendarDate(["2026-09-30"]), null);
  });

  it("shows a moment to the second, and yes or no for true or false", () => {
    assert.equal(cellText("2026-09-29 10:15:03.123456", 1114), "2026-09-29 10:15:03");
    assert.equal(cellText("2026-09-29 10:15:03.5+05:30", 1184), "2026-09-29 10:15:03+05:30");
    assert.equal(cellText("2026-09-29 10:15:03", 1114), "2026-09-29 10:15:03");
    assert.equal(cellText("t", 16), "Yes");
    assert.equal(cellText("f", 16), "No");
    assert.equal(cellText(null, 25), null);
    assert.equal(cellText("12.50", 1700), "12.50");
  });

  it("says what a database failure means", () => {
    assert.equal(describeFailure({ code: "28P01" })?.code, "overview-not-set-up");
    assert.equal(describeFailure({ code: "3D000" })?.code, "overview-not-set-up");
    assert.equal(describeFailure({ code: "42P01" })?.code, "overview-not-set-up");
    assert.equal(describeFailure(Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" }))?.code, "overview-unreachable");
    assert.equal(describeFailure(new Error("timeout exceeded when trying to connect"))?.code, "overview-unreachable");
    assert.equal(describeFailure({ code: "57014" })?.status, 504);
    assert.equal(describeFailure({ code: "53300" })?.code, "overview-busy");
    // A fault of this server's own is not dressed up as the database's.
    assert.equal(describeFailure(new TypeError("x is not a function")), null);
  });
});

// ---------------------------------------------------------------------------
// the door

describe("the door", () => {
  it("refuses anybody not signed in", async () => {
    const db = fresh();
    for (const route of ROUTES) assert.equal((await get(route, null)).status, 401, route);
    assert.equal(db.calls.length, 0);
  });

  it("refuses anybody but the super admin, before the database is asked anything", async () => {
    const db = fresh();
    for (const route of [...ROUTES, "/api/overview/anything"]) {
      const r = await get(route, "staff");
      assert.equal(r.status, 403, route);
      assert.equal(r.json.code, "not-admin", route);
    }
    assert.equal(db.calls.length, 0);
    assert.equal(s.lines.length, 0);
  });

  it("keeps the sign-in check's own refusal for an account still on the administrator's password", async () => {
    fresh();
    const r = await get("/api/overview/status", "first-password");
    assert.equal(r.status, 403);
    assert.equal(r.json.code, "password-change-required");
  });

  it("answers an unknown route under /api/overview as JSON", async () => {
    fresh();
    const r = await get("/api/overview/tables");
    assert.equal(r.status, 404);
    assert.equal(r.json.code, "no-such-route");
  });
});

// ---------------------------------------------------------------------------
// not set up

describe("not set up", () => {
  it("says so, and how to set it up, when OVERVIEW_DATABASE_URL is not set", async () => {
    fresh();
    s.setDb(null);
    for (const route of ROUTES) {
      const r = await get(route);
      assert.equal(r.status, 503, route);
      assert.equal(r.json.code, "overview-not-set-up", route);
      assert.match(r.json.error, /OVERVIEW_DATABASE_URL is not set/);
      assert.match(r.json.error, /01-schemas-and-roles\.sql/);
      assert.match(r.json.error, /docs\/database\/README\.md/);
    }
  });

  it("logs that the page was opened, set up or not", async () => {
    fresh();
    s.setDb(null);
    await get("/api/overview/status");
    assert.deepEqual(s.lines.map((l) => [l.who, l.action]), [["admin@gpp.local", "Database overview opened"]]);
  });

  it("says so when the database has no overview schema, or no views in it", async () => {
    const db = fresh();
    db.views.clear();
    db.hasSchema = false;
    let r = await get("/api/overview/status");
    assert.equal(r.status, 503);
    assert.equal(r.json.code, "overview-not-set-up");
    assert.match(r.json.error, /no overview schema/);
    db.hasSchema = true;
    r = await get("/api/overview/views/findings");
    assert.equal(r.status, 503);
    assert.match(r.json.error, /no views the viewer may read/);
  });

  it("says so when the database refuses the viewer's sign-in, and that it could not be reached when it is down", async () => {
    const db = fresh();
    db.failWith = Object.assign(new Error("password authentication failed for user \"overview_viewer\""), { code: "28P01" });
    let r = await get("/api/overview/status");
    assert.equal(r.status, 503);
    assert.equal(r.json.code, "overview-not-set-up");
    assert.match(r.json.error, /refused the viewer's sign-in/);
    db.failWith = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" });
    r = await get("/api/overview/questions");
    assert.equal(r.status, 503);
    assert.equal(r.json.code, "overview-unreachable");
  });
});

// ---------------------------------------------------------------------------
// the views

describe("the views", () => {
  it("says it is set up, which database and role it reads as, and logs the opening", async () => {
    fresh(true);
    const r = await get("/api/overview/status");
    assert.equal(r.status, 200);
    assert.equal(r.json.setUp, true);
    assert.equal(r.json.database, "dcrs");
    assert.equal(r.json.role, "overview_viewer");
    assert.equal(r.json.readOnly, true);
    assert.deepEqual(r.json.views, ["assistant_activity", "assistant_sessions", "dcrs_activity", "dcrs_downloads", "downloads", "findings", "people", "pest_control_reports_by_day"]);
    assert.deepEqual(s.lines.map((l) => l.action), ["Database overview opened"]);
  });

  it("lists every view with its comment, its columns in plain words with theirs, and the day it is filtered by", async () => {
    const db = fresh();
    db.views.set("some_new_view", { comment: "Not in the map.", columns: [["a_date", "A day."]] });
    // In the map, but without the column the map names: no date filter rather than a failing query.
    db.views.set("records", { comment: "Records.", columns: [["record_id", "Id."]] });
    const r = await get("/api/overview/views");
    assert.equal(r.status, 200);
    const byName = new Map<string, any>(r.json.views.map((v: any) => [v.name, v]));
    const findings = byName.get("findings");
    assert.equal(findings.comment, "One row per internal CAPA finding.");
    assert.equal(findings.label, "Findings");
    assert.equal(findings.dayColumn, "report_date");
    assert.deepEqual(findings.columns[0], { name: "finding_id", label: "Finding ID", comment: "The finding's readable id." });
    assert.equal(byName.get("dcrs_downloads").dayColumn, "happened_date");
    assert.equal(byName.get("some_new_view").dayColumn, null);
    assert.equal(byName.get("records").dayColumn, null);
  });

  it("never offers a name that is not a plain lower-case one", async () => {
    const db = fresh();
    db.views.set("Odd View", { comment: "A quoted name.", columns: [["x", null]] });
    const r = await get("/api/overview/views");
    assert.ok(!r.json.views.some((v: any) => v.name === "Odd View"));
    assert.equal((await get(`/api/overview/views/${encodeURIComponent("Odd View")}`)).status, 404);
  });

  it("reads a view's rows by the catalog's name, a page at a time, and says when there are more", async () => {
    const db = fresh();
    let r = await get("/api/overview/views/findings?limit=2");
    assert.equal(r.status, 200);
    assert.equal(r.json.view, "findings");
    assert.equal(r.json.comment, "One row per internal CAPA finding.");
    assert.equal(r.json.rows.length, 2);
    assert.equal(r.json.more, true);
    assert.equal(r.json.rows[0][0], "CAPA-2023-12-13-1");
    // A moment is shown to the second.
    assert.equal(r.json.rows[0][FINDING_COLUMNS.findIndex(([c]) => c === "last_changed_factory_time")], "2026-09-29 10:15:03");
    const read = db.reads().at(-1)!;
    assert.match(read.text, /^SELECT "finding_id", "finding_reference", .* FROM overview\."findings" LIMIT \$1 OFFSET \$2$/);
    assert.deepEqual(read.values, [3, 0]);
    r = await get("/api/overview/views/findings?limit=2&offset=2");
    assert.equal(r.json.rows.length, 1);
    assert.equal(r.json.more, false);
    assert.equal(r.json.rows[0][0], "CAPA-2023-12-13-3");
    // A hundred at a time unless asked.
    await get("/api/overview/views/findings");
    assert.deepEqual(db.reads().at(-1)!.values, [101, 0]);
  });

  it("filters by the view's own day and by a search, every value a parameter", async () => {
    const db = fresh();
    const search = "'; DROP TABLE users; --";
    const r = await get(`/api/overview/views/findings?from=2023-12-01&to=2023-12-31&q=${encodeURIComponent(search)}`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.filter, { from: "2023-12-01", to: "2023-12-31", q: search });
    const read = db.reads().at(-1)!;
    assert.ok(!read.text.includes("DROP"), read.text);
    assert.ok(!read.text.includes("2023-12"), read.text);
    assert.match(read.text, /WHERE "report_date" >= \$1::date AND "report_date" <= \$2::date AND array_to_string\(ARRAY\["finding_id"::text, .*\], ' '\) ILIKE \$3 LIMIT \$4 OFFSET \$5$/);
    assert.deepEqual(read.values, ["2023-12-01", "2023-12-31", `%${search}%`, 101, 0]);
  });

  it("takes a search's % and _ as plain characters", async () => {
    const db = fresh();
    await get(`/api/overview/views/findings?q=${encodeURIComponent("50%_off\\")}`);
    assert.equal(db.reads().at(-1)!.values[0], "%50\\%\\_off\\\\%");
  });

  it("filters a view whose day is a moment by the day it falls on", async () => {
    const db = fresh();
    db.views.set("dcrs_accounts", { comment: "Accounts.", columns: [["name", "Name."], ["created_factory_time", "When."]], rows: [] });
    await get("/api/overview/views/dcrs_accounts?from=2026-09-01");
    assert.match(db.reads().at(-1)!.text, /WHERE \("created_factory_time"\)::date >= \$1::date LIMIT/);
  });

  it("ignores dates on a view that has no day", async () => {
    const db = fresh();
    db.views.set("some_new_view", { comment: "No day.", columns: [["a", null]], rows: [] });
    await get("/api/overview/views/some_new_view?from=2026-09-01&to=2026-09-30");
    assert.deepEqual(db.reads().at(-1)!.values, [101, 0]);
  });

  it("refuses a view the catalog does not list, and never puts its name in SQL", async () => {
    const db = fresh();
    for (const name of ["users", "app_storage", "findings; DROP TABLE users", "../public/users", "FINDINGS"]) {
      const r = await get(`/api/overview/views/${encodeURIComponent(name)}`);
      assert.equal(r.status, 404, name);
      assert.equal(r.json.code, "no-such-view", name);
    }
    assert.equal(db.reads().length, 0);
  });

  it("finds a view made after the catalog was last read", async () => {
    const db = fresh();
    await get("/api/overview/views");
    db.views.set("later_view", { comment: "Made later.", columns: [["a", null]], rows: [["x"]] });
    const r = await get("/api/overview/views/later_view");
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.rows, [["x"]]);
  });

  it("refuses what it cannot read: a bad date, dates the wrong way round, too many rows, a long search", async () => {
    const db = fresh();
    for (const query of ["from=2026-02-30", "to=yesterday", "from=2026-09-30&to=2026-09-01", "limit=501", "limit=0", "limit=ten", "offset=-1", `q=${"x".repeat(201)}`, "q=a&q=b"]) {
      const r = await get(`/api/overview/views/findings?${query}`);
      assert.equal(r.status, 400, query);
      assert.equal(r.json.code, "bad-request", query);
    }
    assert.equal(db.reads().length, 0);
  });
});

// ---------------------------------------------------------------------------
// CSV

describe("CSV", () => {
  it("hands over the rows as a CSV file Excel reads, with the headings in plain words", async () => {
    fresh();
    const r = await get("/api/overview/views/findings.csv?q=rodent");
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type") ?? "", /^text\/csv; charset=utf-8/);
    assert.equal(r.headers.get("content-disposition"), 'attachment; filename="findings.csv"');
    // The byte-order mark comes first (fetch's text() drops it, so the bytes are read).
    const bytes = new Uint8Array(await (await fetch(`${s.base}/api/overview/views/findings.csv?q=rodent`, { headers: { "x-test-user": "admin" } })).arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
    const lines = r.text.split("\n");
    assert.equal(lines[0], FINDING_COLUMNS.map(([c]) => plainLabel(c)).join(","));
    assert.equal(lines.length, 4);
    // Excel's formula guard, from DCRS's own CSV writer: a cell that starts with = is plain text.
    assert.ok(lines[1].includes(`"'=HYPERLINK(""http://x"")"`), lines[1]);
  });

  it("names the file for the view and its dates", async () => {
    fresh();
    const r = await get("/api/overview/views/findings.csv?from=2023-12-01&to=2023-12-31");
    assert.equal(r.headers.get("content-disposition"), 'attachment; filename="findings 2023-12-01 to 2023-12-31.csv"');
  });

  it("logs every file taken away: which view, how many rows, and the filter", async () => {
    fresh();
    await get("/api/overview/views/findings.csv?from=2023-12-01&q=rodent");
    assert.deepEqual(s.lines, [{ who: "admin@gpp.local", action: "Database overview exported", target: "overview.findings", detail: '3 rows as CSV · Report date from 2023-12-01 · search "rodent"' }]);
  });

  it("stops at 20,000 rows, and says so in the log", async () => {
    const db = fresh();
    db.views.get("findings")!.rows = Array.from({ length: 20_005 }, (_, i) => findingRow(i + 1));
    const r = await get("/api/overview/views/findings.csv");
    assert.equal(r.text.split("\n").length, 20_001);
    assert.deepEqual(db.reads().at(-1)!.values, [20_001, 0]);
    assert.equal(s.lines.at(-1)!.detail, "20,000 rows as CSV, the first 20,000 of more");
  });
});

// ---------------------------------------------------------------------------
// the ready-made questions

describe("the ready-made questions", () => {
  it("offers only the questions whose views are there", async () => {
    fresh();
    let r = await get("/api/overview/questions");
    assert.deepEqual(
      r.json.questions.map((q: any) => [q.key, q.view, q.span]),
      [
        ["downloads", "dcrs_downloads", "week"],
        ["open-findings", "findings", null],
        ["missing-pest-control-reports", "pest_control_reports_by_day", "month"],
        ["changes-through-assistant", "dcrs_activity", null],
      ]
    );
    assert.equal(r.json.questions[0].title, "Who downloaded or printed what last week?");
    fresh(true);
    r = await get("/api/overview/questions");
    assert.deepEqual(
      r.json.questions.map((q: any) => [q.key, q.view]),
      [
        ["downloads", "downloads"],
        ["open-findings", "findings"],
        ["missing-pest-control-reports", "pest_control_reports_by_day"],
        ["changes-through-assistant", "dcrs_activity"],
        ["assistant-actions", "assistant_activity"],
        ["assistant-devices", "assistant_sessions"],
      ]
    );
  });

  it("leaves a question out when its view has lost a column it reads", async () => {
    const db = fresh();
    db.views.get("dcrs_activity")!.columns = db.views.get("dcrs_activity")!.columns.filter(([c]) => c !== "through_client");
    const r = await get("/api/overview/questions");
    assert.ok(!r.json.questions.some((q: any) => q.key === "changes-through-assistant"));
    assert.equal((await get("/api/overview/questions/changes-through-assistant")).status, 404);
  });

  it("answers who downloaded or printed what last week, Monday to Sunday by the factory's calendar, with the dates in words", async () => {
    const db = fresh();
    db.today = "2026-09-30";
    const r = await get("/api/overview/questions/downloads");
    assert.equal(r.status, 200);
    assert.equal(r.json.title, "Who downloaded or printed what last week?");
    assert.deepEqual(r.json.range, { from: "2026-09-21", to: "2026-09-27", label: "Monday 21 September 2026 to Sunday 27 September 2026", week: "last" });
    const read = db.reads().at(-1)!;
    assert.equal(
      read.text,
      'SELECT "happened_factory_time", "person_name", "what_happened", "document", "detail", "department_name", "ip_address", "through_client" FROM overview."dcrs_downloads" WHERE happened_date BETWEEN $1::date AND $2::date ORDER BY happened_utc DESC, activity_id DESC LIMIT $3 OFFSET $4'
    );
    assert.deepEqual(read.values, ["2026-09-21", "2026-09-27", 101, 0]);
    assert.deepEqual(r.json.columns.map((c: any) => c.label), ["Happened (factory time)", "Person name", "What happened", "Document", "Detail", "Department name", "IP address", "Came through"]);
    assert.equal(r.json.columns[0].comment, "When, in factory time.");
  });

  it("answers the same for this week", async () => {
    const db = fresh();
    db.today = "2026-10-04";
    const r = await get("/api/overview/questions/downloads?week=this&limit=50&offset=50");
    assert.equal(r.json.title, "Who downloaded or printed what this week?");
    assert.equal(r.json.range.label, "Monday 28 September 2026 to Sunday 4 October 2026");
    assert.deepEqual(db.reads().at(-1)!.values, ["2026-09-28", "2026-10-04", 51, 50]);
    assert.equal((await get("/api/overview/questions/downloads?week=next")).status, 400);
  });

  it("asks both systems' downloads once the Audit Assistant's views are there", async () => {
    const db = fresh(true);
    await get("/api/overview/questions/downloads");
    assert.match(db.reads().at(-1)!.text, /FROM overview\."downloads" WHERE happened_date BETWEEN \$1::date AND \$2::date ORDER BY happened_utc DESC/);
  });

  it("answers the open CAPA findings, and the pest control reports missing this month", async () => {
    const db = fresh();
    let r = await get("/api/overview/questions/open-findings");
    assert.equal(r.status, 200);
    assert.equal(r.json.range, null);
    assert.match(db.reads().at(-1)!.text, /FROM overview\."findings" WHERE status IN \('Open', 'Overdue'\) ORDER BY target_date NULLS LAST/);
    assert.deepEqual(db.reads().at(-1)!.values, [101, 0]);
    assert.equal(r.json.rows.length, 3);
    db.today = "2026-09-30";
    r = await get("/api/overview/questions/missing-pest-control-reports");
    assert.equal(r.json.range.label, "Tuesday 1 September 2026 to Wednesday 30 September 2026 (today)");
    assert.deepEqual(db.reads().at(-1)!.values, ["2026-09-01", "2026-09-30", 101, 0]);
    assert.match(db.reads().at(-1)!.text, /status NOT IN \('Submitted', 'Pending Verification', 'Verified'\) AND holiday IS NOT TRUE/);
  });

  it("hands over a whole answer as a CSV file, and logs it by the question", async () => {
    fresh();
    const r = await get("/api/overview/questions/downloads.csv?week=this");
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-disposition"), 'attachment; filename="downloads 2026-09-28 to 2026-10-04.csv"');
    assert.ok(r.text.includes("F/HR/01 Personal Competence Records"));
    assert.deepEqual(s.lines, [{ who: "admin@gpp.local", action: "Database overview exported", target: "Who downloaded or printed what this week?", detail: "1 row as CSV · 2026-09-28 to 2026-10-04" }]);
  });

  it("refuses a question it does not know", async () => {
    fresh();
    const r = await get("/api/overview/questions/everything");
    assert.equal(r.status, 404);
    assert.equal(r.json.code, "no-such-question");
  });
});
