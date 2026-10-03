// THREE MORE THINGS DCRS'S MITRA ANSWERS, FROM THE MITRA MOBILE APP (2-Oct-2026):
// the routes of backend/apiV1Records.ts for the equipment list (F/MNT/01), what
// stands out (the insights headline Mitra is given with every message) and the
// super admin's escalations, on a real Express server. The first two are
// answered by DCRS's own engine run in a worker (backend/engineHost.ts — the
// real bundle of frontend/src/engineHost/entry.ts) over an in-memory stand-in
// for the stored items; the escalations by a stand-in for backend/escalation.ts.
// No database, no browser. What is proved here:
//   * a machine named by its number, with Mitra's own words and every column; a
//     model name the list repeats offers every machine it could be and picks
//     none; a serial two machines share names both; M-68, printed one column out
//     of step, read back in step and said so; the list itself without words;
//   * the list is Maintenance's: another department is refused in words;
//   * the insights headline and the insights behind it, most severe first, kept
//     to the person's departments;
//   * the escalations, with the line Mitra adds for the super admin, to the
//     super admin only; the database failing is said as that;
//   * the same checks as every /api/v1 route.
// Nothing here depends on the day of the week the tests run on: the plant's
// hours are off, the equipment list is the seeded one, and the insights are
// checked for their shape and their scope, not for what today's records say.
// Run: npm run test:unit -- apiV1Lookups
process.env.DCRS_WORKING_HOURS = "off";

import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import cookieParser from "cookie-parser";
import express, { type Request } from "express";
import { signSessionToken, type PublicUser } from "../auth.ts";
import type { StoredItem, UserRow, WriteResult } from "../db.ts";
import { registerApiV1, type ApiV1Store } from "../apiV1.ts";
import { escalationsLine, PHOTO_ROUTE, type EscalationItem, type EscalationsFound } from "../apiV1Records.ts";
import { createEngineHost, type EngineHost } from "../engineHost.ts";
import { departmentOfDocument } from "../../frontend/src/data/seed/documentDepartments.ts";

// The bundle is kept between runs in the system's temp folder (rebuilt when a file it is made from changes).
const BUNDLE_DIR = path.join(os.tmpdir(), "dcrs-engine-host-tests");

class MemoryStore implements ApiV1Store {
  users = new Map<string, UserRow>();
  items = new Map<string, { value: string; version: number; seq: number }>();
  seq = 0;

  put(key: string, value: unknown): void {
    const now = this.items.get(key);
    this.seq += 1;
    this.items.set(key, { value: typeof value === "string" ? value : JSON.stringify(value), version: (now?.version ?? 0) + 1, seq: this.seq });
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
  async writeItem(scope: string, key: string, value: string, baseVersion: number): Promise<WriteResult> {
    const now = this.items.get(key);
    if (scope !== "company" || (now ? now.version !== baseVersion : baseVersion !== 0)) {
      return { ok: false, current: now ? { key, value: now.value, version: now.version, seq: now.seq } : null };
    }
    this.put(key, value);
    const written = this.items.get(key)!;
    return { ok: true, version: written.version, seq: written.seq };
  }
}

function account(id: string, name: string, role: "admin" | "staff", departments: string, extra: Partial<UserRow> = {}): UserRow {
  return { id, name, email: `${id}@test.local`, password_hash: "x", role, created_at: "2026-01-01T00:00:00.000Z", departments, must_change_password: false, active: true, last_sign_in: null, ...extra };
}

const USERS = {
  admin: account("u-admin", "Super Admin", "admin", ""),
  qc: account("u-qc", "Kapila Barad", "staff", "QC"),
  mnt: account("u-mnt", "Mahesh Maintenance", "staff", "MNT"),
  change: account("u-change", "New Person", "staff", "MNT", { must_change_password: true }),
};

const tokenOf = (row: UserRow): string => {
  const user: PublicUser = { id: row.id, name: row.name, email: row.email, role: row.role, departments: row.departments ? row.departments.split(",") : [] };
  return signSessionToken(user);
};
const T = Object.fromEntries(Object.entries(USERS).map(([k, u]) => [k, tokenOf(u)])) as Record<keyof typeof USERS, string>;
const CLIENT = { "X-Client-Name": "Mitra mobile app" };

// Three escalations as backend/escalation.ts keeps them: a person late three times, a department with two records
// never done, and one the super admin has already acknowledged.
const evidenceOf = (records: EscalationItem["evidence"]["records"], worst: EscalationItem["evidence"]["worst"], people?: string[]): EscalationItem["evidence"] => ({
  window: { from: "2026-09-03", to: "2026-10-02" },
  rule: { late: 3, neverDone: 2, windowDays: 30 },
  ...(people ? { people } : {}),
  worst,
  records,
});
const ESCALATIONS: EscalationItem[] = [
  {
    id: "11",
    raisedAt: "2026-10-01T04:30:00.000Z",
    updatedAt: "2026-10-02T04:30:00.000Z",
    kind: "person",
    subjectKey: "u-qc",
    subjectName: "Kapila Barad",
    department: "QC",
    period: "2026-W40",
    late: 3,
    neverDone: 0,
    evidence: evidenceOf(
      [{ id: "rec-late-1", documentId: "qc-viscosity", what: "F-QC-30", dueDate: "2026-09-28", outcome: "late", daysLate: 2 }],
      [{ documentId: "qc-viscosity", what: "F-QC-30", late: 3, neverDone: 0 }]
    ),
    acknowledgedBy: null,
    acknowledgedAt: null,
    sentence: "3 late in the 30 days to 02-Oct-2026 — F-QC-30: 3 late",
  },
  {
    id: "12",
    raisedAt: "2026-10-02T04:30:00.000Z",
    updatedAt: "2026-10-02T04:30:00.000Z",
    kind: "department",
    subjectKey: "dept:HR",
    subjectName: "Human Resources (Vinay Bhojak, Sandeep Parekh)",
    department: "HR",
    period: "2026-W40",
    late: 0,
    neverDone: 2,
    evidence: evidenceOf(
      [{ id: "rec-never-1", documentId: "daily-pest-monitoring", what: "F/HR/17", dueDate: "2026-09-25", outcome: "never done", daysLate: 7 }],
      [{ documentId: "daily-pest-monitoring", what: "F/HR/17", late: 0, neverDone: 2 }],
      ["Vinay Bhojak", "Sandeep Parekh"]
    ),
    acknowledgedBy: null,
    acknowledgedAt: null,
  },
  {
    id: "9",
    raisedAt: "2026-09-24T04:30:00.000Z",
    updatedAt: "2026-09-24T04:30:00.000Z",
    kind: "person",
    subjectKey: "u-old",
    subjectName: "Somebody Seen",
    department: "PRD",
    period: "2026-W39",
    late: 4,
    neverDone: 0,
    evidence: evidenceOf([], []),
    acknowledgedBy: "Super Admin",
    acknowledgedAt: "2026-09-25T05:00:00.000Z",
  },
];

interface Server {
  base: string;
  engine: EngineHost;
  asked: boolean[];
  escalations: { rows: EscalationItem[]; fail: boolean };
  close: () => Promise<void>;
}

async function start(): Promise<Server> {
  const store = new MemoryStore();
  for (const u of Object.values(USERS)) store.users.set(u.id, { ...u });
  store.put("records", []);
  const asked: boolean[] = [];
  const escalations = { rows: ESCALATIONS, fail: false };
  const app = express();
  const json = express.json();
  app.use((req, res, next) => (req.method === "POST" && PHOTO_ROUTE.test(req.path) ? next() : json(req, res, next)));
  app.use(cookieParser());
  const engine = createEngineHost({ store, bundleDir: BUNDLE_DIR });
  registerApiV1(app, {
    requireAuth: (_req, _res, next) => next(),
    logActivity: (_req: Request) => undefined,
    store,
    appBuilt: () => true,
    engine,
    escalations: async (open): Promise<EscalationsFound> => {
      asked.push(open);
      if (escalations.fail) throw new Error("connection refused");
      const rows = open ? escalations.rows.filter((e) => !e.acknowledgedAt) : escalations.rows;
      return { escalations: rows, rule: { late: 3, neverDone: 2, windowDays: 30 }, today: "2026-10-02", week: "2026-W40" };
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    engine,
    asked,
    escalations,
    close: async () => {
      await engine.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;

async function get(s: Server, route: string, token?: string): Promise<{ status: number; body: Body }> {
  const res = await fetch(s.base + route, { headers: { ...CLIENT, ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  return { status: res.status, body: await res.json() };
}

describe("the equipment list, the insights and the escalations, for the Mitra mobile app", { timeout: 300_000 }, () => {
  let s: Server;
  before(async () => {
    s = await start();
    await s.engine.warm();
  });
  after(() => s.close());

  it("GET /equipment names a machine by its number, with Mitra's own words and every column", async () => {
    const r = await get(s, `/api/v1/equipment?q=${encodeURIComponent("which machine is M-47?")}`, T.mnt);
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 400));
    assert.equal(r.body.exact, "M-47");
    assert.equal(r.body.total, 1);
    assert.deepEqual(
      {
        machineNo: r.body.machines[0].machineNo,
        model: r.body.machines[0].model,
        manufacturer: r.body.machines[0].manufacturer,
        location: r.body.machines[0].location,
        section: r.body.machines[0].section,
        serialNo: r.body.machines[0].serialNo,
      },
      { machineNo: "M-47", model: "Delta 330", manufacturer: "Lombardi", location: "Lombardi Printing", section: "Flexo", serialNo: "88562" }
    );
    // Mitra's own answer, as her rules path gives it in DCRS.
    assert.match(r.body.answer, /^M-47, as F\/MNT\/01/);
    assert.match(r.body.answer, /Delta 330/);
    assert.equal(r.body.list.formatNo, "F/MNT/01");
    assert.ok(r.body.list.machines >= 60, `the list's machines: ${r.body.list.machines}`);
    assert.match(r.body.list.link, /#\/document\/mnt-equipment-list$/, "the list opens in DCRS from its link");
  });

  it("a model name the list repeats offers every machine it could be and picks none; a serial two machines share names both", async () => {
    const brison = await get(s, `/api/v1/equipment?q=${encodeURIComponent("Brison 370")}`, T.mnt);
    assert.equal(brison.status, 200);
    assert.equal(brison.body.exact, null, "a model name never picks a machine");
    const numbers = brison.body.machines.map((m: Body) => m.machineNo);
    assert.ok(numbers.includes("M-13") && numbers.includes("M-14"), JSON.stringify(numbers));
    const serial = await get(s, `/api/v1/equipment?q=${encodeURIComponent("serial no. 194")}`, T.mnt);
    assert.equal(serial.status, 200);
    assert.equal(serial.body.exact, null, "a serial two machines share picks neither");
    assert.match(serial.body.answer, /2 machines on F\/MNT\/01 .* carry Serial No\. 194/);
    assert.match(serial.body.answer, /M-61/);
    assert.match(serial.body.answer, /M-62/);
    const unique = await get(s, `/api/v1/equipment?q=${encodeURIComponent("serial no. 88562")}`, T.mnt);
    assert.equal(unique.body.exact, "M-47", "a serial only one machine has names it");
    assert.deepEqual(unique.body.machines.map((m: Body) => m.machineNo), ["M-47"]);
  });

  it("a question Mitra answers in words is hers alone; a place on its own is searched", async () => {
    const question = await get(s, `/api/v1/equipment?q=${encodeURIComponent("machines in QC")}`, T.mnt);
    assert.equal(question.status, 200);
    const said = /^(\d+) machines on F\/MNT\/01 .* are in QC:/.exec(question.body.answer);
    assert.ok(said, question.body.answer);
    assert.deepEqual(question.body.machines, [], "not a second, different list beside hers");
    const place = await get(s, "/api/v1/equipment?q=QC&limit=100", T.mnt);
    assert.equal(place.status, 200);
    assert.equal(place.body.answer, null);
    const hers: string[] = question.body.answer.match(/M-\d\d/g) ?? [];
    assert.equal(hers.length, Number(said![1]));
    const found = new Set(place.body.machines.map((m: Body) => m.machineNo));
    assert.deepEqual(
      hers.filter((n) => !found.has(n)),
      [],
      "the search for the place finds every machine she names"
    );
  });

  it("M-68, printed one column out of step, is read back in step and says so", async () => {
    const r = await get(s, "/api/v1/equipment?q=M-68", T.admin);
    assert.equal(r.status, 200);
    const m = r.body.machines[0];
    assert.equal(m.machineNo, "M-68");
    assert.equal(m.manufacturer, "DCM Usimeca");
    assert.equal(m.countryOfOrigin, "France");
    assert.equal(m.serialNo, null, "the year printed under Serial No. is not a serial");
    assert.match(m.note, /one column out of step/);
  });

  it("without words: the list itself, how many machines and the numbers it skips", async () => {
    const r = await get(s, "/api/v1/equipment?limit=5", T.mnt);
    assert.equal(r.status, 200);
    assert.equal(r.body.query, "");
    assert.equal(r.body.answer, null);
    assert.equal(r.body.machines.length, 5);
    assert.equal(r.body.total, r.body.list.machines);
    assert.ok(Array.isArray(r.body.list.gaps) && r.body.list.gaps.length > 0, "the numbering has gaps");
    assert.match(r.body.list.numbered.first, /^M-\d\d$/);
    for (const bad of ["limit=0", "limit=many", `q=${"x".repeat(201)}`]) {
      const refused = await get(s, `/api/v1/equipment?${bad}`, T.mnt);
      assert.equal(refused.status, 400, bad);
      assert.equal(refused.body.code, "bad-request");
    }
    // Past the most, as on every route: the most.
    const most = await get(s, "/api/v1/equipment?limit=500", T.mnt);
    assert.equal(most.status, 200);
    assert.equal(most.body.machines.length, Math.min(100, most.body.list.machines));
  });

  it("the list is Maintenance's: another department is refused in words; the super admin sees it", async () => {
    const qc = await get(s, "/api/v1/equipment?q=M-47", T.qc);
    assert.equal(qc.status, 403);
    assert.equal(qc.body.code, "not-your-department");
    assert.match(qc.body.error, /F\/MNT\/01 .*Maintenance/);
    const admin = await get(s, "/api/v1/equipment?q=M-47", T.admin);
    assert.equal(admin.status, 200);
    assert.equal(admin.body.exact, "M-47");
  });

  it("GET /insights gives the headline Mitra is given with every message, and the insights behind it, kept to the person's departments", async () => {
    const all = await get(s, "/api/v1/insights", T.admin);
    assert.equal(all.status, 200, JSON.stringify(all.body).slice(0, 400));
    assert.match(all.body.headline, /^Insights/);
    assert.match(all.body.date, /^\d{4}-\d{2}-\d{2}$/);
    const { high, medium, low } = all.body.counts;
    assert.ok([high, medium, low].every((n: unknown) => Number.isInteger(n)));
    assert.equal(high + medium + low, all.body.total);
    assert.ok(all.body.insights.length <= 10);
    const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    for (const [i, insight] of all.body.insights.entries()) {
      assert.ok(insight.severity in rank && typeof insight.title === "string" && typeof insight.detail === "string", JSON.stringify(insight).slice(0, 300));
      assert.ok(Array.isArray(insight.evidence) && insight.evidence.length <= 5);
      if (i > 0) assert.ok(rank[all.body.insights[i - 1].severity] <= rank[insight.severity], "most severe first");
    }
    const qc = await get(s, "/api/v1/insights?limit=50", T.qc);
    assert.equal(qc.status, 200);
    assert.ok(qc.body.total <= all.body.total, "a department's account sees no more than the super admin");
    for (const insight of qc.body.insights) {
      if (!insight.documentId) continue;
      const code = departmentOfDocument(insight.documentId, insight.formatNo);
      assert.ok(code === null || code === "QC", `${insight.documentId} (${code}) is not Quality Control's`);
    }
    const two = await get(s, "/api/v1/insights?limit=2", T.admin);
    assert.ok(two.body.insights.length <= 2);
    const bad = await get(s, "/api/v1/insights?limit=0", T.admin);
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, "bad-request");
  });

  it("GET /escalations: the super admin's, with the line Mitra adds for them; anybody else is refused", async () => {
    const before = s.asked.length;
    const open = await get(s, "/api/v1/escalations", T.admin);
    assert.equal(open.status, 200, JSON.stringify(open.body));
    assert.equal(open.body.open, true);
    assert.equal(
      open.body.summary,
      "Escalated to the super admin, not yet acknowledged: Kapila Barad (3 late); Human Resources (Vinay Bhojak, Sandeep Parekh) (2 never done)."
    );
    assert.equal(open.body.waiting, 2);
    assert.equal(open.body.total, 2);
    assert.equal(open.body.week, "2026-W40");
    assert.deepEqual(open.body.rule, { late: 3, neverDone: 2, windowDays: 30 });
    const kapila = open.body.escalations[0];
    assert.equal(kapila.departmentName, "Quality Control");
    assert.equal(kapila.sentence, "3 late in the 30 days to 02-Oct-2026 — F-QC-30: 3 late");
    assert.equal(kapila.records[0].id, "rec-late-1");
    assert.equal(open.body.escalations[1].sentence, "2 never done", "without the server's sentence, the counts in words");
    assert.deepEqual(open.body.escalations[1].people, ["Vinay Bhojak", "Sandeep Parekh"]);

    const every = await get(s, "/api/v1/escalations?open=0", T.admin);
    assert.equal(every.status, 200);
    assert.equal(every.body.total, 3);
    assert.equal(every.body.waiting, 2);
    assert.equal(every.body.escalations[2].acknowledged, true);
    assert.deepEqual(s.asked.slice(before), [true, false]);

    for (const token of [T.qc, T.mnt]) {
      const refused = await get(s, "/api/v1/escalations", token);
      assert.equal(refused.status, 403);
      assert.equal(refused.body.code, "super-admin-only");
      assert.match(refused.body.error, /super admin/);
    }
    assert.equal(s.asked.length, before + 2, "nothing is read for anybody else");
    const bad = await get(s, "/api/v1/escalations?open=maybe", T.admin);
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, "bad-request");
  });

  it("no escalation waiting is said in words; the database failing is said as that", async () => {
    assert.equal(escalationsLine([]), "Nothing is escalated to the super admin and waiting to be acknowledged.");
    const many = Array.from({ length: 5 }, (_, i) => ({ subjectName: `P${i}`, late: 3, neverDone: i % 2 ? 2 : 0 }));
    assert.equal(escalationsLine(many), "Escalated to the super admin, not yet acknowledged: P0 (3 late); P1 (3 late, 2 never done); P2 (3 late) and 2 more.");
    s.escalations.rows = [];
    const none = await get(s, "/api/v1/escalations", T.admin);
    assert.equal(none.status, 200);
    assert.equal(none.body.summary, "Nothing is escalated to the super admin and waiting to be acknowledged.");
    assert.deepEqual(none.body.escalations, []);
    // A line stored without its evidence (the column's default is {}) is still answered, with its counts in words.
    s.escalations.rows = [{ ...ESCALATIONS[1], evidence: {} as EscalationItem["evidence"], sentence: undefined }];
    const bare = await get(s, "/api/v1/escalations", T.admin);
    assert.equal(bare.status, 200);
    assert.equal(bare.body.escalations[0].sentence, "2 never done");
    assert.deepEqual([bare.body.escalations[0].worst, bare.body.escalations[0].records], [[], []]);
    s.escalations.fail = true;
    const down = await get(s, "/api/v1/escalations", T.admin);
    assert.equal(down.status, 503);
    assert.equal(down.body.code, "database-unavailable");
    s.escalations.rows = ESCALATIONS;
    s.escalations.fail = false;
  });

  it("the same checks as every /api/v1 route: not signed in, and still on the administrator's password", async () => {
    for (const route of ["/api/v1/equipment?q=M-47", "/api/v1/insights", "/api/v1/escalations"]) {
      const none = await get(s, route);
      assert.equal(none.status, 401, route);
      assert.equal(none.body.code, "not-signed-in");
      const change = await get(s, route, T.change);
      assert.equal(change.status, 403, route);
      assert.equal(change.body.code, "password-change-required");
    }
  });
});
