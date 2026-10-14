// THE ACTIVITY LOG'S READINGS (REQUIREMENTS §62, §73, §75; the owner,
// 14-Oct-2026: "which user what does and in which modules and documents"),
// backend/activityRoutes.ts and archiveRoutes.ts, run on a real Express server
// over a stand-in for the database — no PostgreSQL. What is proved here:
//   * each of the query's parameters — person, department, document, action,
//     from, to, q — reaches the filter the lines AND the tally are read with,
//     and they combine, one AND each;
//   * the archive's two readings take exactly the same filter;
//   * the SQL (db.ts activityWhere) names each as a parameter — the value is
//     never in the SQL text — and a document's words are matched as typed,
//     "F_QC" never finding "F/QC";
//   * staff cannot filter beyond their own lines: the scope is still there under
//     every chip, so a member of QC asking for HR's lines gets their own lines
//     in HR and nobody else's; and a value that is not a module's code is no
//     filter at all, never an error and never a wider reading;
//   * what is not a parameter — a cursor too long for a bigint, an action
//     longer than the log keeps — is dropped, not sent on.
// The chips themselves are driven in tests/e2e_portal_controls.py.
// Run: npm run test:unit -- activityRoutes
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import express, { type NextFunction, type Request, type Response } from "express";
import type { PublicUser } from "../auth.ts";
import { activityWhere, type ActivityFilter, type ActivityLine, type ActivityTally } from "../db.ts";
import { readActivityFilter, readActivityPage, registerActivityRoutes } from "../activityRoutes.ts";
import { registerActivityArchiveRoutes } from "../archiveRoutes.ts";

// ---------------------------------------------------------------------------
// the stand-in: the log's lines, and the filter applied to them as activityWhere would

interface StoredLine extends ActivityLine {
  archived: boolean;
}

const ESCALATION = "Escalated to the super admin";

let id = 0;
const line = (userId: string, userName: string, action: string, target: string, department: string, day: string, archived = false): StoredLine => ({
  id: String(++id),
  at: `${day}T09:00:00.000Z`,
  userId,
  userName,
  userEmail: `${userId}@gpp.local`,
  action,
  target,
  detail: "",
  department,
  archived,
});

const LINES: StoredLine[] = [
  line("u-kapila", "Kapila Barad", "Signed in", "u-kapila@gpp.local", "", "2026-10-14"),
  line("u-kapila", "Kapila Barad", "Record started", "F/QC/01 Daily Pest Control Monitoring — 2026-10-14", "QC", "2026-10-14"),
  line("u-kapila", "Kapila Barad", "Submitted", "F/QC/01 Daily Pest Control Monitoring — 2026-10-14", "QC", "2026-10-14"),
  line("u-kapila", "Kapila Barad", "Record started", "F/HR/17 Fly Catcher — 2026-10-14", "HR", "2026-10-14"),
  line("u-vinay", "Vinay Bhojak", "Record started", "F/HR/17 Fly Catcher — 2026-10-14", "HR", "2026-10-14"),
  line("u-vinay", "Vinay Bhojak", "Verified", "F/HR/17 Fly Catcher — 2026-10-13", "HR", "2026-10-13"),
  line("u-vinay", "Vinay Bhojak", "Record started", "F_QC_01 (a name with underscores)", "HR", "2026-10-12"),
  line("u-admin", "Super Admin", ESCALATION, "QC", "", "2026-10-14"),
  line("u-kapila", "Kapila Barad", "Submitted", "F/QC/01 Daily Pest Control Monitoring — 2025-01-10", "QC", "2025-01-10", true),
];

/** The filter as db.ts activityWhere means it, applied in memory. */
function matches(l: StoredLine, f: ActivityFilter): boolean {
  if (f.departments && !(l.userId === f.userId || f.departments.includes(l.department))) return false;
  if (!f.superAdmin && l.action === ESCALATION) return false;
  if (f.person && l.userId !== f.person) return false;
  if (f.from && l.at.slice(0, 10) < f.from) return false;
  if (f.to && l.at.slice(0, 10) > f.to) return false;
  if (f.search && !`${l.userName} ${l.action} ${l.target} ${l.detail}`.toLowerCase().includes(f.search.toLowerCase())) return false;
  if (f.department && l.department !== f.department) return false;
  if (f.action && l.action !== f.action) return false;
  if (f.document && !l.target.toLowerCase().includes(f.document.toLowerCase())) return false;
  return true;
}

const asked: { route: string; filter: ActivityFilter; limit?: number; before?: string }[] = [];

const listOver = (archive: boolean) => async (opts: ActivityFilter & { limit: number; before?: string }) => {
  const { limit, before, ...filter } = opts;
  asked.push({ route: archive ? "with-archive" : "lines", filter, limit, before });
  return LINES.filter((l) => (archive || !l.archived) && (!before || Number(l.id) < Number(before)) && matches(l, filter))
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, limit)
    .map((l) => (archive ? l : (({ archived: _a, ...rest }) => rest)(l)));
};

const tallyOver = (archive: boolean) => async (opts: ActivityFilter): Promise<ActivityTally[]> => {
  asked.push({ route: archive ? "with-archive/summary" : "summary", filter: opts });
  const people = new Map<string, ActivityTally>();
  for (const l of LINES.filter((l) => (archive || !l.archived) && matches(l, opts))) {
    const t = people.get(l.userId ?? "") ?? { userId: l.userId, userName: l.userName, byAction: {}, total: 0, firstAt: l.at, lastAt: l.at, activeDays: 1 };
    t.byAction[l.action] = (t.byAction[l.action] ?? 0) + 1;
    t.total += 1;
    people.set(l.userId ?? "", t);
  }
  return [...people.values()];
};

// ---------------------------------------------------------------------------
// the server

const ADMIN: PublicUser = { id: "u-admin", name: "Super Admin", email: "admin@gpp.local", role: "admin", departments: [] };
const STAFF: PublicUser = { id: "u-kapila", name: "Kapila Barad", email: "kapila.barad@gpp.local", role: "staff", departments: ["QC"] };
const EVERY_STAFF: PublicUser = { id: "u-qa", name: "QA Manager", email: "qa@gpp.local", role: "staff", departments: [] };

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const who = req.get("x-test-user");
  const user = who === "admin" ? ADMIN : who === "staff" ? STAFF : who === "every" ? EVERY_STAFF : null;
  if (!user) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }
  (req as Request & { user: PublicUser }).user = user;
  // The modules the person sees (index.ts requireAuthWithModules): staff their own, the rest everything.
  (req as Request & { accessModules?: string[] | null }).accessModules = user.role === "admin" ? null : user.departments.length ? user.departments : null;
  next();
}

let base = "";
let close: () => Promise<void> = async () => undefined;

before(async () => {
  const app = express();
  const sendJson = (_req: Request, res: Response, status: number, body: unknown) => void res.status(status).json(body);
  registerActivityRoutes(app, { requireAuth, lines: listOver(false), summary: tallyOver(false), sendJson });
  registerActivityArchiveRoutes(app, {
    requireAuth,
    activityFilter: (req) => readActivityFilter(req.query as Record<string, unknown>, (req as Request & { user: PublicUser }).user, (req as Request & { accessModules?: string[] | null }).accessModules),
    sendJson,
    read: { lines: listOver(true) as never, tally: tallyOver(true) },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise<void>((resolve) => server.close(() => resolve()));
});
after(async () => {
  await close();
});

async function get(route: string, who: string | null = "admin"): Promise<{ status: number; json: any }> {
  asked.length = 0;
  const res = await fetch(base + route, { headers: who ? { "x-test-user": who } : {} });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const targets = (json: { lines: ActivityLine[] }) => json.lines.map((l) => `${l.userName} · ${l.action} · ${l.target}`);

// ---------------------------------------------------------------------------

describe("each chip is one parameter, read into the one filter the lines and the tally share", () => {
  it("refuses anybody not signed in", async () => {
    for (const route of ["/api/activity", "/api/activity/summary", "/api/activity/with-archive", "/api/activity/with-archive/summary"]) assert.equal((await get(route, null)).status, 401, route);
  });

  it("by person", async () => {
    const res = await get("/api/activity?person=u-vinay");
    assert.equal(res.status, 200);
    assert.ok(targets(res.json).every((t) => t.startsWith("Vinay Bhojak")), targets(res.json).join("\n"));
    assert.equal(res.json.lines.length, 3);
    assert.equal(asked[0].filter.person, "u-vinay");
  });

  it("by module: the department the line was filed under, whatever case it was typed in", async () => {
    const res = await get("/api/activity?department=hr");
    assert.deepEqual(
      targets(res.json),
      ["Vinay Bhojak · Record started · F_QC_01 (a name with underscores)", "Vinay Bhojak · Verified · F/HR/17 Fly Catcher — 2026-10-13", "Vinay Bhojak · Record started · F/HR/17 Fly Catcher — 2026-10-14", "Kapila Barad · Record started · F/HR/17 Fly Catcher — 2026-10-14"]
    );
    assert.equal(asked[0].filter.department, "HR");
  });

  it("by document: the format number's words anywhere in the line's target", async () => {
    const res = await get("/api/activity?document=" + encodeURIComponent("F/QC/01"));
    assert.equal(res.json.lines.length, 2, targets(res.json).join("\n"));
    assert.ok(targets(res.json).every((t) => t.includes("F/QC/01")));
    assert.equal(asked[0].filter.document, "F/QC/01");
  });

  it("by action, exactly as the log holds it", async () => {
    const res = await get("/api/activity?action=" + encodeURIComponent("Record started"));
    assert.equal(res.json.lines.length, 4);
    assert.ok(res.json.lines.every((l: ActivityLine) => l.action === "Record started"));
    assert.equal(asked[0].filter.action, "Record started");
  });

  it("combined: person AND module AND document AND action AND span AND the words typed, one AND each", async () => {
    const res = await get("/api/activity?person=u-kapila&department=QC&document=F%2FQC%2F01&action=Submitted&from=2026-10-01&to=2026-10-14&q=pest");
    assert.deepEqual(targets(res.json), ["Kapila Barad · Submitted · F/QC/01 Daily Pest Control Monitoring — 2026-10-14"]);
    const { filter } = asked[0];
    assert.deepEqual(
      { ...filter },
      { departments: null, userId: "u-admin", superAdmin: true, search: "pest", person: "u-kapila", from: "2026-10-01", to: "2026-10-14", department: "QC", document: "F/QC/01", action: "Submitted" }
    );
    // The tally beside the list is counted over the very same filter.
    const sum = await get("/api/activity/summary?person=u-kapila&department=QC&document=F%2FQC%2F01&action=Submitted&from=2026-10-01&to=2026-10-14&q=pest");
    assert.deepEqual(asked[0].filter, filter);
    assert.equal(sum.json.people.length, 1);
    assert.equal(sum.json.people[0].total, 1, "the count of matching lines, for the chips to show");
  });

  it("the archive's two readings take exactly the same filter, and the page's cursor", async () => {
    const res = await get("/api/activity/with-archive?document=F%2FQC%2F01&action=Submitted&limit=50&before=10");
    assert.equal(res.status, 200);
    // Newest id first, across both tables (the archived line was written last in this stand-in).
    assert.deepEqual(
      res.json.lines.map((l: StoredLine) => [l.target.slice(-10), l.archived]),
      [["2025-01-10", true], ["2026-10-14", false]]
    );
    assert.equal(asked[0].route, "with-archive");
    assert.deepEqual([asked[0].filter.document, asked[0].filter.action, asked[0].limit, asked[0].before], ["F/QC/01", "Submitted", 50, "10"]);
    const sum = await get("/api/activity/with-archive/summary?document=F%2FQC%2F01&action=Submitted");
    assert.equal(sum.json.people[0].total, 2, "the archived line counted too");
    assert.deepEqual([asked[0].filter.document, asked[0].filter.action], ["F/QC/01", "Submitted"]);
    assert.equal((await get("/api/activity/with-archive?document=x", "staff")).status, 403, "the archive is the super admin's alone");
  });
});

describe("staff cannot filter beyond their own lines", () => {
  it("a member of QC, or an account with every department, is refused the log's readings: the super admin's alone (§116)", async () => {
    for (const who of ["staff", "every"]) {
      for (const route of ["/api/activity?department=HR", "/api/activity?person=u-vinay&department=HR", `/api/activity?action=${encodeURIComponent(ESCALATION)}`, "/api/activity/summary"]) {
        const res = await get(route, who);
        assert.equal(res.status, 403, `${who} ${route}`);
        assert.equal(res.json.error, "Only the super admin can open the Activity Log.");
        assert.equal(asked.length, 0, "nothing is read for a refused request");
      }
    }
    assert.equal((await get(`/api/activity?action=${encodeURIComponent(ESCALATION)}`, "admin")).json.lines.length, 1);
  });

  it("a value that is not a module's code is no filter at all — never an error, never a wider reading", async () => {
    for (const bad of ["Quality Control", "'; drop table users;--", "Q", "ABCDE", ""]) {
      const res = await get(`/api/activity?department=${encodeURIComponent(bad)}`, "admin");
      assert.equal(res.status, 200, bad);
      assert.equal(asked[0].filter.department, undefined, bad);
      // The scope under a bad chip for a staff account is proved on the filter itself below (the readings are the
      // super admin's, §116).
      assert.equal(asked[0].filter.superAdmin, true, bad);
    }
  });
});

describe("what the SQL is handed", () => {
  it("names the module, the action and the document's words as parameters, never in the text", () => {
    const args: unknown[] = [];
    const where = activityWhere({ departments: ["QC"], userId: "u-kapila", department: "HR", action: "Record started", document: "F/QC/01 100%_x" }, args);
    assert.deepEqual(where, ["(user_id = $1 OR department = ANY($2))", "action <> ALL($3::text[])", "department = $4", "action = $5", "lower(target) LIKE $6 ESCAPE E'\\\\'"]);
    assert.deepEqual(args.slice(3), ["HR", "Record started", "%f/qc/01 100\\%\\_x%"], "the document's words as typed: % and _ mean themselves, so F_QC never finds F/QC");
    assert.ok(where.every((w) => !w.includes("HR") && !w.includes("Record started") && !w.includes("F/QC")));
  });

  it("adds nothing for a chip not pressed", () => {
    const args: unknown[] = [];
    assert.deepEqual(activityWhere({ departments: null, userId: "u-admin", superAdmin: true }, args), []);
    assert.deepEqual(args, []);
  });
});

describe("what is read from the query, and what is dropped", () => {
  it("trims the words, clips them to what the log keeps, and takes only a cursor a bigint holds", () => {
    const f = readActivityFilter({ action: `  ${"x".repeat(100)}  `, document: " f/qc/01 ", person: " u-1 ", q: "  " }, ADMIN, null);
    assert.equal(f.action?.length, 80);
    assert.equal(f.document, "f/qc/01");
    assert.equal(f.person, "u-1");
    assert.equal(f.search, undefined);
    assert.deepEqual(readActivityPage({ limit: "9999", before: "1".repeat(19) }), { limit: 500, before: undefined });
    assert.deepEqual(readActivityPage({ limit: "0", before: "42" }), { limit: 100, before: "42" });
    assert.deepEqual(readActivityPage({ before: ["1", "2"] }), { limit: 100, before: undefined });
  });

  it("reads an account's scope as before: the modules worked out for it, else its departments, else everything", () => {
    assert.equal(readActivityFilter({}, STAFF, ["QC", "PRD"]).departments?.join(), "QC,PRD");
    assert.deepEqual(readActivityFilter({}, STAFF, undefined).departments, ["QC"]);
    assert.equal(readActivityFilter({}, EVERY_STAFF, undefined).departments, null);
    assert.equal(readActivityFilter({}, ADMIN, ["QC"]).departments, null, "the super admin reads everything whatever the modules say");
  });
});
