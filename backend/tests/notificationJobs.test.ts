// THE MORNING PREPARE AND THE NOTIFY JOB (REQUIREMENTS §97, backend/notificationJobs.ts), over DCRS's own engine
// (backend/engineHost.ts, the real bundle) and an in-memory stand-in for the stored items and the ledger, at a fixed
// working-day morning (Friday 9 October 2026, 08:45 factory time). No database, no browser. What is proved here:
//   * the morning prepare stores the day's sheets and prepares the blank ones due by today, one record per document and
//     period, stamped as the assistant's and dated at the job's moment; one line in the activity log names the modules;
//     run again, it writes nothing and logs nothing;
//   * a sheet a person has started is left exactly as it was;
//   * a browser preparing at the same moment: the job's write meets the browser's, is worked out again on what is
//     stored, and no second sheet is made for that document and period (the other order, the browser's merge, is
//     frontend/tests/morningPrepareMerge.test.ts);
//   * with no go-live day stored, the one the prepare set is stored with it;
//   * notify: each task goes to the people who answer for the document (engine/accessRules.ts), the super admin gets the
//     morning summary and the escalations; run again, nothing new; a record that moves on is resolved, and its
//     verification goes to the others with Write on it.
// A prepared record may be ready or still need readings (the prepare fills only the known parts): nothing here assumes
// which. Run: npm run test:unit -- notificationJobs
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { ActivityInput, StoredItem, WriteResult } from "../db.ts";
import { createEngineHost, type EngineHost, type EngineStore } from "../engineHost.ts";
import { runMorningPrepare, runNotify, SYSTEM_CALLER, type JobAccount, type JobDeps, type OpenEscalation } from "../notificationJobs.ts";
import { buildAccess, type AccessDoc } from "../../frontend/src/engine/accessRules.ts";
import { createMemoryLedger, type MemoryLedger } from "./memoryLedger.ts";

const BUNDLE_DIR = path.join(os.tmpdir(), "dcrs-engine-host-tests");
/** 08:45 at the factory on Friday 9 October 2026, a working day. */
const NOW = new Date("2026-10-09T03:15:00.000Z");
const TODAY = "2026-10-09";

class MemoryStore implements EngineStore {
  items = new Map<string, { value: string; version: number; seq: number }>();
  seq = 0;
  writes: { key: string; ok: boolean }[] = [];
  /** Runs once, just before the next write of the records: somebody else saving at that very moment. */
  beforeRecordsWrite: (() => void) | null = null;
  put(key: string, value: unknown): void {
    const now = this.items.get(key);
    this.seq += 1;
    this.items.set(key, { value: typeof value === "string" ? value : JSON.stringify(value), version: (now?.version ?? 0) + 1, seq: this.seq });
  }
  get<T>(key: string): T {
    return JSON.parse(this.items.get(key)?.value ?? "null") as T;
  }
  version(key: string): number {
    return this.items.get(key)?.version ?? 0;
  }
  async itemSeq(_scope: string, key: string): Promise<number | null> {
    return this.items.get(key)?.seq ?? null;
  }
  async readItem(_scope: string, key: string): Promise<StoredItem | null> {
    const i = this.items.get(key);
    return i ? { key, ...i } : null;
  }
  async writeItem(_scope: string, key: string, value: string, baseVersion: number): Promise<WriteResult> {
    if (key === "records" && this.beforeRecordsWrite) {
      const hook = this.beforeRecordsWrite;
      this.beforeRecordsWrite = null;
      hook();
    }
    const now = this.items.get(key);
    const ok = (now?.version ?? 0) === baseVersion;
    this.writes.push({ key, ok });
    if (!ok) return { ok: false, current: now ? { key, ...now } : null };
    this.put(key, value);
    const w = this.items.get(key)!;
    return { ok: true, version: w.version, seq: w.seq };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = any;

const ACCOUNTS: JobAccount[] = [
  { id: "u-admin", name: "Super Admin", email: "admin@gpp.local", role: "admin", departments: [], active: true },
  { id: "u-kapila", name: "Kapila Barad", email: "kapila.barad@gpp.local", role: "staff", departments: ["QC"], active: true },
  { id: "u-ankur", name: "Ankur Raval", email: "ankur.raval@gpp.local", role: "staff", departments: ["QC"], active: true },
  { id: "u-vinay", name: "Vinay Bhojak", email: "vinay.bhojak@gpp.local", role: "staff", departments: ["HR"], active: true },
  { id: "u-gone", name: "Somebody Who Left", email: "left@gpp.local", role: "staff", departments: ["QC"], active: false },
];

/** A sheet a person started: the 09-Oct viscosity record (F-QC-30, Ankur Raval's), In Progress, not prepared. */
const PERSONS_SHEET = {
  id: "rec-person-started-1",
  documentId: "qc-viscosity",
  periodKey: "qc-viscosity:2026-10-09",
  dueDate: TODAY,
  status: "In Progress",
  isDemo: false,
  data: { header: {}, rows: [] },
  createdAt: "2026-10-09T02:50:00.000Z",
  updatedAt: "2026-10-09T03:00:00.000Z",
  history: [{ id: "hist-person-1", at: "2026-10-09T03:00:00.000Z", by: "Ankur Raval", action: "edited" }],
};

/** Two sheets for one document and period among the plant's sheets of these days (the seeded history is the paper's own: eight people's job responsibilities share a date). */
function onePerPeriod(records: Rec[]): string[] {
  const seen = new Map<string, number>();
  for (const r of records) if (r.isDemo === false && r.periodKey && r.dueDate >= "2026-10-01") seen.set(`${r.documentId}|${r.periodKey}`, (seen.get(`${r.documentId}|${r.periodKey}`) ?? 0) + 1);
  return [...seen.entries()].filter(([, n]) => n > 1).map(([k, n]) => `${k} x${n}`);
}

describe("the morning prepare and the notify job, at a working-day morning", { timeout: 300_000 }, () => {
  let store: MemoryStore;
  let engine: EngineHost;
  let ledger: MemoryLedger;
  const logged: ActivityInput[] = [];
  let escalations: OpenEscalation[] = [];
  const deps = (): JobDeps => ({ engine, ledger, accounts: async () => ACCOUNTS, escalations: async () => escalations, activity: async (lines) => void logged.push(...lines) });

  before(async () => {
    store = new MemoryStore();
    store.put("live-start", { date: "2026-10-07" });
    store.put("records", [PERSONS_SHEET]);
    engine = createEngineHost({ store, bundleDir: BUNDLE_DIR });
    ledger = createMemoryLedger(() => NOW);
    await engine.warm();
  });
  after(() => engine.close());

  it("stores the day's sheets and prepares the blank ones due by today, one per document and period, dated at the job's moment", async () => {
    const { outcome, result } = await runMorningPrepare({ now: NOW }, deps());
    assert.equal(result.date, TODAY);
    assert.ok(result.prepared + result.sheetsMade > 0, outcome);
    const records = store.get<Rec[]>("records");
    assert.deepEqual(onePerPeriod(records), [], "no second sheet for a document and period");
    const stored = new Map(records.map((r: Rec) => [r.id, r]));
    for (const p of result.records) {
      const r = stored.get(p.recordId);
      assert.ok(r, `${p.recordId} is stored`);
      assert.equal(r.status, "In Progress");
      assert.equal(r.prepared?.by, "assistant");
      assert.ok(String(r.prepared.at).startsWith(TODAY), r.prepared.at);
      assert.ok(r.dueDate <= TODAY && r.dueDate >= "2026-10-07", `${r.documentId} ${r.dueDate}: due by today, not before the go-live`);
    }
    assert.ok(!records.some((r: Rec) => r.isDemo === false && r.prepared && r.dueDate > TODAY), "a future sheet is left blank");
    const lines = logged.filter((l) => l.action === "Records prepared by the assistant");
    assert.equal(lines.length, result.prepared > 0 ? 1 : 0);
    if (result.prepared > 0) {
      assert.equal(lines[0].userName, "System");
      assert.match(lines[0].target ?? "", /^The assistant prepared \d+ records?$/);
      assert.match(lines[0].detail ?? "", /The known parts only/);
    }
  });

  it("leaves a sheet a person started exactly as it was", () => {
    const records = store.get<Rec[]>("records");
    assert.deepEqual(records.find((r: Rec) => r.id === PERSONS_SHEET.id), PERSONS_SHEET);
    assert.equal(records.filter((r: Rec) => r.periodKey === PERSONS_SHEET.periodKey).length, 1);
  });

  it("run again, it writes nothing and logs nothing", async () => {
    const version = store.version("records");
    const lines = logged.length;
    const { outcome, result } = await runMorningPrepare({ now: NOW }, deps());
    assert.equal(result.prepared, 0);
    assert.equal(result.sheetsMade, 0);
    assert.equal(outcome, "nothing to prepare");
    assert.equal(store.version("records"), version, "the records are not written");
    assert.equal(logged.length, lines);
  });

  it("notify: the tasks go to the people who answer for them, the super admin gets the summary and the escalations; run again, nothing new", async () => {
    escalations = [{ id: "41", subjectName: "Store", department: "STR", late: 0, neverDone: 3 }];
    const { result } = await runNotify({ now: NOW }, deps());
    assert.ok(result.planned > 0);
    assert.equal(result.escalations, 1);
    const docs = (await engine.read(SYSTEM_CALLER, "documents", { limit: 200 })).body as { documents: { id: string; formatNo: string; department: { code: string } | null; referenceOnly: boolean }[] };
    const access = buildAccess(docs.documents.map((d): AccessDoc => ({ id: d.id, formatNo: d.formatNo, department: d.department?.code ?? null, reference: d.referenceOnly })));
    const TASKS = ["ready", "needs_input", "due", "upcoming", "overdue"];
    for (const a of ACCOUNTS.filter((x) => x.role === "staff")) {
      const answers = new Set(access.answersFor({ email: a.email, role: a.role, departments: a.departments }));
      const tasks = ledger.rows.filter((r) => r.userId === a.id && TASKS.includes(r.kind));
      for (const t of tasks) assert.ok(answers.has(t.data.documentId!), `${a.name} was told of ${t.data.formatNo} ${t.data.documentName}, which is not theirs`);
    }
    assert.equal(ledger.rows.filter((r) => r.userId === "u-gone").length, 0, "an account switched off is told nothing");
    const persons = ledger.rows.find((r) => r.userId === "u-ankur" && r.data.recordId === PERSONS_SHEET.id);
    assert.ok(persons && ["needs_input", "ready"].includes(persons.kind), `Ankur answers for F-QC-30: ${JSON.stringify(ledger.rows.filter((r) => r.userId === "u-ankur").map((r) => r.key))}`);
    const boss = ledger.rows.filter((r) => r.userId === "u-admin");
    assert.ok(boss.some((r) => r.key === `boss_summary|${TODAY}|morning`), "the morning summary");
    assert.ok(boss.some((r) => r.key === "escalation|41" && r.data.subject === "Store" && r.data.neverDone === 3));
    assert.ok(!boss.some((r) => r.data.recordId === PERSONS_SHEET.id), "the super admin is not told every record");
    const again = await runNotify({ now: NOW }, deps());
    assert.equal(again.result.written, 0, "nothing new");
    assert.equal(again.result.resolved, 0);
  });

  it("a record that moves on is resolved; its verification goes to the others with Write on it; an escalation acknowledged is resolved", async () => {
    store.put(
      "records",
      store.get<Rec[]>("records").map((r: Rec) => (r.id === PERSONS_SHEET.id ? { ...r, status: "Pending Verification", submittedBy: "Ankur Raval", submittedAt: "2026-10-09T03:10:00.000Z" } : r))
    );
    escalations = [];
    const { result } = await runNotify({ now: NOW }, deps());
    assert.ok(result.resolved >= 2, JSON.stringify(result));
    const task = ledger.rows.find((r) => r.userId === "u-ankur" && r.data.recordId === PERSONS_SHEET.id && r.kind !== "verify");
    assert.ok(task?.resolvedAt, "Ankur's task is done with");
    assert.ok(ledger.rows.some((r) => r.userId === "u-kapila" && r.key === `verify|${PERSONS_SHEET.id}` && r.resolvedAt === null && r.data.by === "Ankur Raval"), "Kapila (Edit in QC) may verify it");
    assert.ok(!ledger.rows.some((r) => r.userId === "u-ankur" && r.key === `verify|${PERSONS_SHEET.id}`), "not the person who submitted it");
    assert.ok(ledger.rows.find((r) => r.key === "escalation|41")?.resolvedAt);
  });
});

describe("the morning prepare beside a browser, and on a plant with no go-live day stored", { timeout: 300_000 }, () => {
  it("a browser preparing at the same moment: the job is worked out again on what is stored, and no second sheet is made", async () => {
    const store = new MemoryStore();
    store.put("live-start", { date: "2026-10-07" });
    store.put("records", []);
    const engine = createEngineHost({ store, bundleDir: BUNDLE_DIR });
    try {
      const at = "2026-10-09T03:14:00.000Z";
      const browsers = {
        id: "rec-browser-0001",
        documentId: "qc-viscosity",
        periodKey: "qc-viscosity:2026-10-09",
        dueDate: TODAY,
        status: "In Progress",
        isDemo: false,
        data: { header: {}, rows: [] },
        createdAt: at,
        updatedAt: at,
        prepared: { at, by: "assistant", notes: ["Prepared in a browser"] },
      };
      // The browser saves its prepared sheet just as the job is about to write its own.
      store.beforeRecordsWrite = () => store.put("records", [...store.get<Rec[]>("records"), browsers]);
      const { result } = await runMorningPrepare({ now: NOW }, { engine, activity: async () => undefined });
      const tries = store.writes.filter((w) => w.key === "records");
      assert.deepEqual(tries.map((w) => w.ok), [false, true], "refused once, then written on what is stored");
      const records = store.get<Rec[]>("records");
      assert.deepEqual(onePerPeriod(records), []);
      const viscosity = records.filter((r: Rec) => r.periodKey === "qc-viscosity:2026-10-09");
      assert.deepEqual(viscosity.map((r: Rec) => r.id), ["rec-browser-0001"], "the browser's sheet, and only it");
      assert.ok(!result.records.some((r) => r.recordId !== "rec-browser-0001" && r.documentId === "qc-viscosity" && r.dueDate === TODAY));
    } finally {
      await engine.close();
    }
  });

  it("with no go-live day stored, the one the prepare set is stored with the records", async () => {
    const store = new MemoryStore();
    store.put("records", []);
    const engine = createEngineHost({ store, bundleDir: BUNDLE_DIR });
    try {
      await runMorningPrepare({ now: NOW }, { engine, activity: async () => undefined });
      assert.deepEqual(store.get("live-start"), { date: TODAY });
      const records = store.get<Rec[]>("records");
      assert.ok(records.length > 0);
      assert.ok(!records.some((r: Rec) => r.isDemo === false && r.status !== "Verified" && r.dueDate < TODAY && !r.submittedBy && r.prepared), "nothing before the go-live day is prepared");
    } finally {
      await engine.close();
    }
  });
});
