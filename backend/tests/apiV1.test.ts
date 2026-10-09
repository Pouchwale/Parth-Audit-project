// THE DCRS API FOR THE AUDIT ASSISTANT (REQUIREMENTS §83), backend/apiV1.ts,
// run on a real Express server over an in-memory stand-in for the stored items
// (the ApiV1Store the routes are given) — no database. What is proved here:
//   * every /api/v1 route in docs/api/dcrs-api.openapi.json is registered, and
//     every route registered is documented;
//   * the session is taken as a Bearer token or the cookie, the account is read
//     again on every request, and an account switched off or still on the
//     administrator's password is refused;
//   * department scoping, the readable finding ids, the filters;
//   * a close writes what DCRS's Close button writes, with the version it read,
//     tries again when somebody wrote meanwhile (and gives up after three), and
//     leaves a history entry and an activity line that say "Through <client>";
//   * DCRS's own refusals (already closed, verified, sent back);
//   * the pest control report: the summary, and the PDF through the printer
//     (a stand-in here; backend/pdfReport.ts is tested on its own), with its
//     refusals, its timeout and its "Document downloaded as PDF" line.
// The same routes are driven end to end by tests/e2e_audit_assistant_api.py.
// Run: npm run test:unit -- apiV1
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import cookieParser from "cookie-parser";
import express, { type Request } from "express";
import { signSessionToken, type PublicUser } from "../auth.ts";
import type { StoredItem, UserRow, WriteResult } from "../db.ts";
import { calendarDate, factoryToday, registerApiV1, type ApiV1Store, type PdfPrinter } from "../apiV1.ts";
import { repoRoot } from "../paths.ts";

// ---------------------------------------------------------------------------
// the stand-ins

class MemoryStore implements ApiV1Store {
  users = new Map<string, UserRow>();
  items = new Map<string, { value: string; version: number; seq: number }>();
  seq = 0;
  /** Writes still to be refused as if somebody else had written first. */
  conflictsToCome = 0;
  writes: { key: string; baseVersion: number; by: string }[] = [];

  put(key: string, value: unknown): void {
    const now = this.items.get(key);
    this.seq += 1;
    this.items.set(key, { value: typeof value === "string" ? value : JSON.stringify(value), version: (now?.version ?? 0) + 1, seq: this.seq });
  }
  get(key: string): unknown {
    return JSON.parse(this.items.get(key)!.value);
  }
  async userById(id: string): Promise<UserRow | undefined> {
    return this.users.get(id);
  }
  async itemSeq(scope: string, key: string): Promise<number | null> {
    return scope === "company" ? (this.items.get(key)?.seq ?? null) : null;
  }
  async readItem(scope: string, key: string): Promise<StoredItem | null> {
    const i = scope === "company" ? this.items.get(key) : undefined;
    return i ? { key, value: i.value, version: i.version, seq: i.seq } : null;
  }
  async writeItem(scope: string, key: string, value: string, baseVersion: number, by: string): Promise<WriteResult> {
    this.writes.push({ key, baseVersion, by });
    if (this.conflictsToCome > 0) {
      // Somebody else's browser wrote the same item a moment before.
      this.conflictsToCome -= 1;
      this.put(key, this.items.get(key)!.value);
    }
    const now = this.items.get(key);
    if (!now || now.version !== baseVersion || scope !== "company") return { ok: false, current: now ? { key, value: now.value, version: now.version, seq: now.seq } : null };
    this.put(key, value);
    const written = this.items.get(key)!;
    return { ok: true, version: written.version, seq: written.seq };
  }
}

function account(id: string, name: string, role: "admin" | "staff", departments: string, extra: Partial<UserRow> = {}): UserRow {
  return { id, name, email: `${id}@test.local`, password_hash: "x", role, created_at: "2026-01-01T00:00:00.000Z", departments, must_change_password: false, active: true, last_sign_in: null, ...extra };
}

function tokenOf(row: UserRow): string {
  const user: PublicUser = { id: row.id, name: row.name, email: row.email, role: row.role, departments: row.departments ? row.departments.split(",") : [] };
  return signSessionToken(user);
}

const gapFinding = (id: string, sNo: number, extra: Record<string, unknown> = {}) => ({
  id,
  sNo,
  findingOfInspection: `Finding ${id}`,
  commentsOnFindings: "Comment",
  correctiveActionContractor: "Contractor action",
  correctiveActionClient: "Plant action",
  targetDate: "2023-12-31",
  actualDateOfAction: null,
  verifiedByServiceProvider: "",
  status: "Overdue",
  source: "External",
  ...extra,
});

const gapReport = (id: string, dueDate: string, status: string, findings: unknown[], extra: Record<string, unknown> = {}) => ({
  id,
  documentId: "gap-inspection",
  periodKey: `gap-inspection:${dueDate}`,
  dueDate,
  status,
  isDemo: false,
  data: { inspectionDate: dueDate, premisesName: "", premisesAddress: "", contactPerson: "", findings, generalComments: [] },
  createdAt: `${dueDate}T09:00:00.000Z`,
  updatedAt: `${dueDate}T09:00:00.000Z`,
  ...extra,
});

const pestRecord = (id: string, date: string, updatedAt: string, extra: Record<string, unknown> = {}) => ({
  id,
  documentId: "daily-pest-monitoring",
  periodKey: `daily-pest-monitoring:${date}`,
  dueDate: date,
  status: "Pending Verification",
  isDemo: false,
  data: {
    isHoliday: false,
    checkpoints: { 1: { value: "Yes" }, 4: { value: 100 }, 8: { value: "Yes", note: "Near the store" } },
    timeOfChecking: "09:30",
    checker: "Roshni",
    summaryActions: [{ id: "s1", dateOfObservation: date, descriptionOfObservation: "Dead rodent near the store", actionTaken: "Removed", remarks: "" }],
    rodentCatches: [{ id: "c1", trapBoxNo: "RB-3", location: "Store", count: 2 }, { id: "c2", trapBoxNo: "RB-4", location: "Store", count: 1 }],
  },
  createdAt: updatedAt,
  updatedAt,
  submittedBy: "Roshni",
  ...extra,
});

const USERS = {
  admin: account("u-admin", "Super Admin", "admin", ""),
  qa: account("u-qa", "Kajal Shah", "staff", "QA"),
  qc: account("u-qc", "Kapila Barad", "staff", "QC"),
  hr: account("u-hr", "Vinay Bhojak", "staff", "HR"),
  mkt: account("u-mkt", "Marketing Person", "staff", "MKT"),
  unassigned: account("u-all", "No Departments", "staff", ""),
  change: account("u-change", "New Person", "staff", "", { must_change_password: true }),
  off: account("u-off", "Left The Company", "staff", "", { active: false }),
};

function seed(store: MemoryStore): void {
  for (const u of Object.values(USERS)) store.users.set(u.id, { ...u });
  store.put("records", [
    gapReport("gap-2023-12-13", "2023-12-13", "Submitted", [gapFinding("finding-a", 1), gapFinding("finding-b", 2), gapFinding("finding-c", 3, { status: "Closed", actualDateOfAction: "2024-01-05" })]),
    gapReport("gap-2023-12-13-later", "2023-12-13", "Due", [gapFinding("finding-d", 1, { status: "Open", targetDate: "2030-01-01" })], { createdAt: "2023-12-13T15:00:00.000Z" }),
    gapReport("gap-verified", "2024-01-02", "Verified", [gapFinding("finding-v", 1, { status: "Open", targetDate: "2030-01-01" })]),
    gapReport("gap-rejected", "2024-01-03", "Rejected", [gapFinding("finding-r", 1, { status: "Open", targetDate: "2030-01-01" })]),
    gapReport("demo-gap", "2024-01-04", "Due", [gapFinding("finding-demo", 1)], { isDemo: true }),
    {
      id: "rec-complaint-1",
      documentId: "capa-customer-complaint",
      dueDate: "2026-09-20",
      status: "In Progress",
      isDemo: false,
      data: {
        customerName: "Shree Foods",
        complaintNo: "26-27/001",
        jobName: "Masala pouch",
        jobCode: "SF-200",
        complaintReceivedDate: "2026-09-20",
        poNo: "",
        sections: [
          { key: "A", title: "A", items: [{ srNo: 1, activity: "a", done: true, date: null, comment: "", notRequired: false }, { srNo: 2, activity: "b", done: false, date: null, comment: "Called", notRequired: false }] },
          { key: "B", title: "B", items: [{ srNo: 3, activity: "c", done: false, date: null, comment: " ", notRequired: false }, { srNo: 4, activity: "d", done: false, date: null, comment: "", notRequired: true }] },
        ],
        preparedBy: { name: "", designation: "", date: null },
        approvedBy: { name: "", designation: "", date: null },
      },
      createdAt: "2026-09-20T09:00:00.000Z",
      updatedAt: "2026-09-20T09:00:00.000Z",
    },
    {
      id: "rec-complaint-2",
      documentId: "capa-customer-complaint",
      dueDate: "2026-08-01",
      status: "Verified",
      isDemo: false,
      data: { customerName: "Old Customer", complaintNo: "25-26/044", jobName: "Old job", jobCode: "OJ", complaintReceivedDate: "2026-08-01", sections: [], approvedBy: { name: "QA Head", designation: "", date: "2026-08-20" } },
      createdAt: "2026-08-01T09:00:00.000Z",
      updatedAt: "2026-08-20T09:00:00.000Z",
    },
    pestRecord("rec-pest-old", "2026-09-28", "2026-09-28T04:00:00.000Z"),
    pestRecord("rec-pest-new", "2026-09-28", "2026-09-28T05:00:00.000Z"),
    pestRecord("rec-pest-demo", "2026-09-27", "2026-09-27T05:00:00.000Z", { isDemo: true }),
  ]);
  store.put("documents", [
    { id: "gap-inspection", name: "CAPA — Internal: Pest Control Inspection Findings Report", formatNo: "TO BE CONFIRMED" },
    { id: "daily-pest-monitoring", name: "Daily Pest Control Monitoring Record", formatNo: "F/HR/17" },
  ]);
  store.put("master", { checkpoints: [{ no: 1, text: "Pest proofing working?" }, { no: 4, text: "Total number of rodent traps provided" }, { no: 8, text: "Any dead rodent observed?" }] });
}

interface Logged {
  who: string | null;
  action: string;
  target: string;
  detail: string;
  department: string;
}

interface Server {
  base: string;
  store: MemoryStore;
  lines: Logged[];
  printed: { appUrl: string; sessionToken: string; recordId: string; timeoutMs?: number }[];
  app: express.Express;
  close: () => Promise<void>;
}

const NOW = new Date("2026-09-29T06:30:00.000Z"); // 12:00 at the factory

async function start(opts: { pdf?: PdfPrinter; appBuilt?: boolean } = {}): Promise<Server> {
  const store = new MemoryStore();
  seed(store);
  const lines: Logged[] = [];
  const printed: Server["printed"] = [];
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  const printer: PdfPrinter = opts.pdf ?? {
    browserPath: () => "C:/fake/chrome.exe",
    render: async (o) => {
      printed.push(o);
      return Buffer.from("%PDF-1.7\n% a stand-in\n%%EOF\n");
    },
  };
  registerApiV1(app, {
    requireAuth: (_req, _res, next) => next(),
    logActivity: (_req: Request, who, action, target = "", detail = "", department = "") => lines.push({ who: who?.name ?? null, action, target, detail, department }),
    store,
    clock: () => NOW,
    pdf: printer,
    appBuilt: () => opts.appBuilt ?? true,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, store, lines, printed, app, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

async function call(s: Server, method: string, route: string, opts: { token?: string; cookie?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.cookie) headers.Cookie = `dcrs_session=${opts.cookie}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(s.base + route, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const type = res.headers.get("content-type") ?? "";
  const body = type.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, headers: res.headers, body: body as any };
}

const T = Object.fromEntries(Object.entries(USERS).map(([k, u]) => [k, tokenOf(u)])) as Record<keyof typeof USERS, string>;
const CLIENT = { "X-Client-Name": "Audit Assistant" };

// ---------------------------------------------------------------------------

describe("the routes and their description", () => {
  let s: Server;
  before(async () => (s = await start()));
  after(() => s.close());
  const openapi = JSON.parse(readFileSync(path.join(repoRoot, "docs", "api", "dcrs-api.openapi.json"), "utf-8")) as { openapi: string; paths: Record<string, Record<string, unknown>> };

  it("the description is OpenAPI 3.1 and is served as it is on disk, without signing in", async () => {
    assert.match(openapi.openapi, /^3\.1\./);
    const r = await call(s, "GET", "/api/v1/openapi.json");
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, openapi);
  });

  it("every documented /api/v1 route is registered: each answers (not signed in: 401), none falls through to 404", async () => {
    let checked = 0;
    for (const [route, methods] of Object.entries(openapi.paths)) {
      if (!route.startsWith("/api/v1/") || route === "/api/v1/openapi.json") continue;
      for (const method of Object.keys(methods)) {
        const r = await call(s, method.toUpperCase(), route.replace("{id}", "CAPA-2023-12-13-1") + (route.includes("pest-control") ? "?date=2026-09-28" : ""));
        assert.equal(r.status, 401, `${method} ${route}`);
        assert.equal(r.body.code, "not-signed-in", `${method} ${route}`);
        checked += 1;
      }
    }
    // Seven of REQUIREMENTS §83, fourteen of §85 (the Mitra mobile app, backend/apiV1Records.ts), and three of
    // 2-Oct-2026 (the equipment list, the insights and the super admin's escalations, backend/apiV1Records.ts).
    assert.equal(checked, 24);
    const nothing = await call(s, "GET", "/api/v1/not-a-route", { token: T.admin });
    assert.equal(nothing.status, 404);
    assert.equal(nothing.body.code, "no-such-route");
  });

  it("every route registered is documented", () => {
    const stack = (s.app as unknown as { router: { stack: { route?: { path: string; methods: Record<string, boolean> } }[] } }).router.stack;
    const registered = stack.filter((l) => l.route?.path.startsWith("/api/v1")).flatMap((l) => Object.keys(l.route!.methods).map((m) => `${m} ${l.route!.path.replace(/:(\w+)/g, "{$1}")}`));
    assert.ok(registered.length >= 8);
    for (const r of registered) {
      const [method, route] = r.split(" ");
      assert.ok(openapi.paths[route]?.[method], `${r} is not in docs/api/dcrs-api.openapi.json`);
    }
  });

  it("the sign-in routes it documents are DCRS's own, registered by the server itself", () => {
    const index = readFileSync(path.join(repoRoot, "backend", "index.ts"), "utf-8");
    for (const route of Object.keys(openapi.paths).filter((p) => !p.startsWith("/api/v1/"))) {
      for (const method of Object.keys(openapi.paths[route])) assert.ok(index.includes(`app.${method}("${route}"`), `${method} ${route}`);
    }
  });
});

describe("signing in", () => {
  let s: Server;
  before(async () => (s = await start()));
  after(() => s.close());

  it("takes the session as a Bearer token or as the dcrs_session cookie", async () => {
    const bearer = await call(s, "GET", "/api/v1/me", { token: T.qa });
    assert.equal(bearer.status, 200);
    assert.deepEqual(bearer.body, { id: "u-qa", name: "Kajal Shah", email: "u-qa@test.local", role: "staff", departments: ["QA"] });
    const cookie = await call(s, "GET", "/api/v1/me", { cookie: T.admin });
    assert.equal(cookie.status, 200);
    assert.equal(cookie.body.role, "admin");
    assert.deepEqual(cookie.body.departments, []);
    assert.equal(bearer.headers.get("cache-control"), "no-store");
  });

  it("refuses no token, a token it did not sign, and a malformed Authorization header", async () => {
    for (const opts of [{}, { token: "not-a-token" }, { headers: { Authorization: "Basic abc" } }]) {
      const r = await call(s, "GET", "/api/v1/me", opts);
      assert.equal(r.status, 401);
      assert.equal(r.body.code, "not-signed-in");
    }
  });

  it("refuses an account switched off, and one still on the administrator's password", async () => {
    const off = await call(s, "GET", "/api/v1/me", { token: T.off });
    assert.equal(off.status, 401);
    const change = await call(s, "GET", "/api/v1/findings", { token: T.change });
    assert.equal(change.status, 403);
    assert.equal(change.body.code, "password-change-required");
  });

  it("reads the account again on every request: switched off meanwhile, the next call is refused", async () => {
    assert.equal((await call(s, "GET", "/api/v1/me", { token: T.unassigned })).status, 200);
    s.store.users.get("u-all")!.active = false;
    assert.equal((await call(s, "GET", "/api/v1/me", { token: T.unassigned })).status, 401);
    s.store.users.get("u-all")!.active = true;
  });
});

describe("reading the findings", () => {
  let s: Server;
  before(async () => (s = await start()));
  after(() => s.close());

  it("lists the open findings of live reports by default, newest report first, with their readable ids", async () => {
    const r = await call(s, "GET", "/api/v1/findings", { token: T.qa });
    assert.equal(r.status, 200);
    assert.deepEqual(
      r.body.findings.map((f: { id: string; status: string }) => [f.id, f.status]),
      [
        ["CAPA-2024-01-03-1", "Open"],
        ["CAPA-2024-01-02-1", "Open"],
        ["CAPA-2023-12-13-1", "Overdue"],
        ["CAPA-2023-12-13-2", "Overdue"],
        ["CAPA-2023-12-13b-1", "Open"],
      ]
    );
    assert.equal(r.body.total, 5);
    const f = r.body.findings[2];
    assert.deepEqual(f, {
      id: "CAPA-2023-12-13-1",
      ref: "gap-2023-12-13:finding-a",
      recordId: "gap-2023-12-13",
      number: 1,
      reportDate: "2023-12-13",
      inspectionDate: "2023-12-13",
      finding: "Finding finding-a",
      comments: "Comment",
      correctiveActionByContractor: "Contractor action",
      correctiveActionByPlant: "Plant action",
      targetDate: "2023-12-31",
      actionDate: null,
      verifiedByServiceProvider: "",
      status: "Overdue",
      source: "External",
      reportStatus: "Submitted",
      department: "Quality Assurance",
      link: `${s.base}/index.html#/gap/gap-2023-12-13`,
    });
  });

  it("filters by status, text, dates, and pages with limit and offset", async () => {
    const closed = await call(s, "GET", "/api/v1/findings?status=closed", { token: T.admin });
    assert.deepEqual(closed.body.findings.map((f: { id: string }) => f.id), ["CAPA-2023-12-13-3"]);
    const all = await call(s, "GET", "/api/v1/findings?status=all", { token: T.admin });
    assert.equal(all.body.total, 6);
    const text = await call(s, "GET", "/api/v1/findings?status=all&q=FINDING-B", { token: T.admin });
    assert.deepEqual(text.body.findings.map((f: { id: string }) => f.id), ["CAPA-2023-12-13-2"]);
    const dated = await call(s, "GET", "/api/v1/findings?status=all&from=2024-01-01&to=2024-01-02", { token: T.admin });
    assert.deepEqual(dated.body.findings.map((f: { id: string }) => f.id), ["CAPA-2024-01-02-1"]);
    const page = await call(s, "GET", "/api/v1/findings?status=all&limit=2&offset=1", { token: T.admin });
    assert.deepEqual(page.body.findings.map((f: { id: string }) => f.id), ["CAPA-2024-01-02-1", "CAPA-2023-12-13-1"]);
    assert.equal(page.body.total, 6);
    const most = await call(s, "GET", "/api/v1/findings?limit=5000", { token: T.admin });
    assert.equal(most.status, 200, "a limit over 200 is read as 200");
    for (const bad of ["status=later", "limit=0", "limit=x", "offset=-1", "from=2024-02-30", "to=yesterday", `q=${"x".repeat(201)}`]) {
      const r = await call(s, "GET", `/api/v1/findings?${bad}`, { token: T.admin });
      assert.equal(r.status, 400, bad);
      assert.equal(r.body.code, "bad-request", bad);
    }
  });

  it("finds one by its readable id in any case, or by its stable reference", async () => {
    const byId = await call(s, "GET", `/api/v1/findings/${encodeURIComponent(" capa-2023-12-13b-1 ")}`, { token: T.qa });
    assert.equal(byId.status, 200);
    assert.equal(byId.body.ref, "gap-2023-12-13-later:finding-d");
    const byRef = await call(s, "GET", `/api/v1/findings/${encodeURIComponent("gap-2023-12-13:finding-b")}`, { token: T.qa });
    assert.equal(byRef.body.id, "CAPA-2023-12-13-2");
    const none = await call(s, "GET", "/api/v1/findings/CAPA-2024-01-04-1", { token: T.qa });
    assert.equal(none.status, 404, "a demo report's finding is not there");
    assert.equal(none.body.code, "not-found");
  });

  it("is Quality Assurance's: an account kept to other departments is refused; the admin and an unassigned account may read", async () => {
    for (const route of ["/api/v1/findings", "/api/v1/findings/CAPA-2023-12-13-1", "/api/v1/findings/no-such-id"]) {
      const r = await call(s, "GET", route, { token: T.qc });
      assert.equal(r.status, 403, route);
      assert.equal(r.body.code, "not-your-department");
    }
    assert.equal((await call(s, "GET", "/api/v1/findings", { token: T.unassigned })).status, 200);
  });
});

describe("closing a finding", () => {
  let s: Server;
  before(async () => (s = await start()));
  after(() => s.close());

  it("closes it as DCRS's Close button does, writes with the version it read, and says through whom in the history and the log", async () => {
    const versionBefore = s.store.items.get("records")!.version;
    const r = await call(s, "POST", "/api/v1/findings/CAPA-2023-12-13-1/close", { token: T.qa, body: { note: "  Rodent box numbers painted.  " }, headers: CLIENT });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.finding.status, "Closed");
    assert.equal(r.body.finding.actionDate, "2026-09-29");
    assert.deepEqual(r.body.record, { id: "gap-2023-12-13", status: "Submitted" });
    assert.deepEqual(r.body.history, { at: NOW.toISOString(), by: "Kajal Shah", note: "Through Audit Assistant: Rodent box numbers painted." });
    assert.deepEqual(s.store.writes.at(-1), { key: "records", baseVersion: versionBefore, by: "u-qa@test.local" });

    const stored = (s.store.get("records") as { id: string; status: string; updatedAt: string; history?: { by: string; action: string; note: string; changes: unknown[] }[]; data: { findings: Record<string, unknown>[] } }[]).find((x) => x.id === "gap-2023-12-13")!;
    assert.equal(stored.updatedAt, NOW.toISOString());
    assert.deepEqual(stored.data.findings[0], gapFinding("finding-a", 1, { status: "Closed", actualDateOfAction: "2026-09-29" }));
    assert.deepEqual(stored.data.findings[1], gapFinding("finding-b", 2), "the other findings are untouched");
    const entry = stored.history!.at(-1)!;
    assert.equal(entry.by, "Kajal Shah");
    assert.equal(entry.action, "edited");
    assert.equal(entry.note, "Through Audit Assistant: Rodent box numbers painted.");
    assert.equal(entry.changes.length, 2);

    assert.deepEqual(s.lines.at(-1), {
      who: "Kajal Shah",
      action: "Record edited",
      target: "CAPA — Internal: Pest Control Inspection Findings Report — 2023-12-13",
      detail: "Through Audit Assistant: Rodent box numbers painted. · 2 field(s): Finding 1 · Actual date of action, Finding 1 · Status",
      department: "QA",
    });
  });

  it("moves a report that was still Due to In Progress, and names an unnamed caller DCRS API", async () => {
    const r = await call(s, "POST", "/api/v1/findings/CAPA-2023-12-13b-1/close", { token: T.admin, body: { note: "Done" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.record.status, "In Progress");
    assert.equal(r.body.history.note, "Through DCRS API: Done");
    assert.match(s.lines.at(-1)!.detail, /^Through DCRS API: Done · /);
  });

  it("refuses what DCRS refuses: a closed finding, a verified report's, a report sent back's — and changes nothing", async () => {
    const version = s.store.items.get("records")!.version;
    const cases: [string, string][] = [
      ["CAPA-2023-12-13-1", "already-closed"],
      ["CAPA-2023-12-13-3", "already-closed"],
      ["CAPA-2024-01-02-1", "report-verified"],
      ["CAPA-2024-01-03-1", "report-sent-back"],
    ];
    for (const [id, code] of cases) {
      const r = await call(s, "POST", `/api/v1/findings/${id}/close`, { token: T.qa, body: { note: "again" }, headers: CLIENT });
      assert.equal(r.status, 409, id);
      assert.equal(r.body.code, code, id);
    }
    assert.equal(s.store.items.get("records")!.version, version);
  });

  it("asks for a note of 1 to 1000 characters, refuses another department, and says when there is no such finding", async () => {
    for (const body of [{}, { note: "" }, { note: "   " }, { note: 5 }, { note: "x".repeat(1001) }]) {
      const r = await call(s, "POST", "/api/v1/findings/CAPA-2023-12-13-2/close", { token: T.qa, body });
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.equal(r.body.code, "bad-note");
    }
    const other = await call(s, "POST", "/api/v1/findings/CAPA-2023-12-13-2/close", { token: T.qc, body: { note: "x" } });
    assert.equal(other.status, 403);
    const none = await call(s, "POST", "/api/v1/findings/CAPA-1999-01-01-1/close", { token: T.qa, body: { note: "x" } });
    assert.equal(none.status, 404);
  });

  it("reads again and tries again when somebody else wrote meanwhile — the same finding, by its reference", async () => {
    s.store.conflictsToCome = 2;
    const writesBefore = s.store.writes.length;
    const r = await call(s, "POST", "/api/v1/findings/CAPA-2023-12-13-2/close", { token: T.qa, body: { note: "Third time" }, headers: CLIENT });
    assert.equal(r.status, 200);
    assert.equal(r.body.finding.ref, "gap-2023-12-13:finding-b");
    assert.equal(s.store.writes.length - writesBefore, 3);
    const history = (s.store.get("records") as { id: string; history?: unknown[] }[]).find((x) => x.id === "gap-2023-12-13")!.history!;
    assert.equal(history.length, 2, "one entry per close, however many tries it took");
  });

  it("gives up after three conflicts and says so", async () => {
    const t = await start();
    try {
      t.store.conflictsToCome = 3;
      const r = await call(t, "POST", "/api/v1/findings/CAPA-2023-12-13-1/close", { token: T.qa, body: { note: "x" } });
      assert.equal(r.status, 409);
      assert.equal(r.body.code, "busy");
      assert.equal(t.lines.length, 0, "nothing logged for a change that was not made");
    } finally {
      await t.close();
    }
  });
});

describe("the customer complaints", () => {
  let s: Server;
  before(async () => (s = await start()));
  after(() => s.close());

  it("lists the open complaints by default and the closed ones when asked, counting answered activities as DCRS does", async () => {
    const open = await call(s, "GET", "/api/v1/complaints", { token: T.mkt });
    assert.equal(open.status, 200);
    assert.deepEqual(open.body.complaints, [
      {
        recordId: "rec-complaint-1",
        complaintNumber: "26-27/001",
        customerName: "Shree Foods",
        jobName: "Masala pouch",
        jobCode: "SF-200",
        receivedDate: "2026-09-20",
        activitiesAnswered: 3,
        activitiesTotal: 4,
        status: "Open",
        recordStatus: "In Progress",
        approvedBy: null,
        approvedDate: null,
        link: `${s.base}/index.html#/gap/complaint/rec-complaint-1`,
      },
    ]);
    const closed = await call(s, "GET", "/api/v1/complaints?status=closed", { token: T.admin });
    assert.deepEqual(closed.body.complaints.map((c: { complaintNumber: string; status: string; approvedBy: string }) => [c.complaintNumber, c.status, c.approvedBy]), [["25-26/044", "Closed", "QA Head"]]);
    const found = await call(s, "GET", "/api/v1/complaints?status=all&q=shree", { token: T.admin });
    assert.equal(found.body.complaints.length, 1);
  });

  it("is Marketing's", async () => {
    const r = await call(s, "GET", "/api/v1/complaints", { token: T.qa });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "not-your-department");
  });
});

describe("the daily pest control report", () => {
  let s: Server;
  before(async () => (s = await start()));
  after(() => s.close());

  it("gives the day's report as data, the one changed last when a day has two, with the check points' own questions", async () => {
    const r = await call(s, "GET", "/api/v1/pest-control/daily-report/summary?date=2026-09-28", { token: T.hr });
    assert.equal(r.status, 200);
    assert.equal(r.body.recordId, "rec-pest-new");
    assert.equal(r.body.status, "Pending Verification");
    assert.equal(r.body.checkedBy, "Roshni");
    assert.equal(r.body.rodentsCaught, 3);
    assert.deepEqual(r.body.checkpoints, [
      { number: 1, question: "Pest proofing working?", answer: "Yes", note: null },
      { number: 4, question: "Total number of rodent traps provided", answer: 100, note: null },
      { number: 8, question: "Any dead rodent observed?", answer: "Yes", note: "Near the store" },
    ]);
    assert.deepEqual(r.body.observations, [{ date: "2026-09-28", description: "Dead rodent near the store", actionTaken: "Removed", remarks: "" }]);
    assert.equal(r.body.link, `${s.base}/index.html#/record/rec-pest-new`);
  });

  it("prints DCRS's own page for that date as the same person, and logs the download through the client", async () => {
    const r = await call(s, "GET", "/api/v1/pest-control/daily-report?date=2026-09-28", { token: T.hr, headers: CLIENT });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "application/pdf");
    assert.equal(r.headers.get("content-disposition"), 'attachment; filename="F-HR-17 Daily Pest Control Monitoring Record 2026-09-28.pdf"');
    assert.ok((r.body as Buffer).subarray(0, 5).equals(Buffer.from("%PDF-")));
    assert.equal(s.printed.length, 1);
    assert.equal(s.printed[0].recordId, "rec-pest-new");
    assert.equal(s.printed[0].sessionToken, T.hr, "printed as the person who asked");
    assert.equal(s.printed[0].appUrl, s.base, "the browser reaches this very server");
    assert.deepEqual(s.lines.at(-1), { who: "Vinay Bhojak", action: "Document downloaded as PDF", target: "F/HR/17 Daily Pest Control Monitoring Record", detail: "Through Audit Assistant: 2026-09-28", department: "HR" });
  });

  it("refuses a bad date, a day with no live report, and another department — before printing anything", async () => {
    const printedBefore = s.printed.length;
    for (const route of ["/api/v1/pest-control/daily-report", "/api/v1/pest-control/daily-report/summary"]) {
      for (const [query, status, code] of [
        ["", 400, "bad-date"],
        ["?date=2026-02-30", 400, "bad-date"],
        ["?date=28-09-2026", 400, "bad-date"],
        ["?date=2026-09-27", 404, "no-report"],
        ["?date=2001-01-01", 404, "no-report"],
      ] as const) {
        const r = await call(s, "GET", route + query, { token: T.hr });
        assert.equal(r.status, status, route + query);
        assert.equal(r.body.code, code, route + query);
      }
      const other = await call(s, "GET", `${route}?date=2026-09-28`, { token: T.qa });
      assert.equal(other.status, 403);
      assert.equal(other.body.code, "not-your-department");
    }
    assert.equal(s.printed.length, printedBefore);
  });

  it("says plainly when this server cannot print, and when printing took too long; logs nothing then", async () => {
    const cases: [Parameters<typeof start>[0], number, string][] = [
      [{ pdf: { browserPath: () => null, render: async () => Buffer.from("") } }, 503, "pdf-unavailable"],
      [{ appBuilt: false }, 503, "pdf-unavailable"],
      [{ pdf: { browserPath: () => "chrome", render: async () => Promise.reject(Object.assign(new Error("The page did not finish in 60 s (timed out)"), { name: "TimeoutError" })) } }, 504, "pdf-timeout"],
      [{ pdf: { browserPath: () => "chrome", render: async () => Promise.reject(new Error("Chrome crashed")) } }, 503, "pdf-unavailable"],
    ];
    for (const [opts, status, code] of cases) {
      const t = await start(opts);
      try {
        const r = await call(t, "GET", "/api/v1/pest-control/daily-report?date=2026-09-28", { token: T.hr });
        assert.equal(r.status, status, code);
        assert.equal(r.body.code, code);
        assert.equal(t.lines.length, 0);
      } finally {
        await t.close();
      }
    }
  });

  it("does not say 'try again' when the person's records could not be loaded to print: trying again would not help", async () => {
    const noRoom = Object.assign(new Error("DCRS could not load its records in the browser (database-no-room)."), { code: "pdf-database-unavailable" });
    const t = await start({ pdf: { browserPath: () => "chrome", render: async () => Promise.reject(noRoom) } });
    try {
      const r = await call(t, "GET", "/api/v1/pest-control/daily-report?date=2026-09-28", { token: T.hr });
      assert.equal(r.status, 503);
      assert.equal(r.body.code, "pdf-unavailable");
      assert.match(r.body.error, /could not load this person's records/);
      assert.doesNotMatch(r.body.error, /try again/i);
      assert.equal(t.lines.length, 0);
    } finally {
      await t.close();
    }
  });
});

describe("dates", () => {
  it("the factory's today is India's date, not the server's or UTC's", () => {
    assert.equal(factoryToday(new Date("2026-09-29T18:29:00.000Z")), "2026-09-29");
    assert.equal(factoryToday(new Date("2026-09-29T18:31:00.000Z")), "2026-09-30");
  });
  it("a date is a real calendar date written YYYY-MM-DD", () => {
    assert.equal(calendarDate("2024-02-29"), "2024-02-29");
    assert.equal(calendarDate("2023-02-29"), null);
    assert.equal(calendarDate("2026-9-1"), null);
    assert.equal(calendarDate(["2026-09-01"]), null);
  });
});
