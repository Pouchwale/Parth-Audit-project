// THE ENGINE HOST (REQUIREMENTS §85, backend/engineHost.ts): DCRS's own engine,
// bundled from frontend/src/engineHost/entry.ts and run in a worker, over an
// in-memory stand-in for the stored items. What is proved here:
//   * the bundle is used only while it is newer than every file it was built
//     from, and only when it speaks this server's version;
//   * each request is answered on what is stored NOW — somebody else's write
//     is seen at once — and a department's account is given only its
//     departments' lines, as GET /api/storage gives a browser;
//   * a change is written over every record as stored, other departments'
//     untouched, and the deletions log keeps their lines too;
//   * a stopped worker is started again at the next request.
// The routes over it are tested in backend/tests/apiV1Records.test.ts.
// Run: npm run test:unit -- engineHost
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { StoredItem, WriteResult } from "../db.ts";
import { createEngineHost, ENGINE_API_VERSION, engineBundleIsCurrent, type ActivityLine, type EngineCaller, type EngineHost, type EngineStore } from "../engineHost.ts";

const BUNDLE_DIR = path.join(os.tmpdir(), "dcrs-engine-host-tests");

class MemoryStore implements EngineStore {
  items = new Map<string, { value: string; version: number; seq: number }>();
  seq = 0;
  put(key: string, value: unknown): void {
    const now = this.items.get(key);
    this.seq += 1;
    this.items.set(key, { value: typeof value === "string" ? value : JSON.stringify(value), version: (now?.version ?? 0) + 1, seq: this.seq });
  }
  get<T>(key: string): T {
    return JSON.parse(this.items.get(key)?.value ?? "null") as T;
  }
  async itemSeq(_scope: string, key: string): Promise<number | null> {
    return this.items.get(key)?.seq ?? null;
  }
  async readItem(_scope: string, key: string): Promise<StoredItem | null> {
    const i = this.items.get(key);
    return i ? { key, ...i } : null;
  }
  async writeItem(_scope: string, key: string, value: string, baseVersion: number): Promise<WriteResult> {
    const now = this.items.get(key);
    if ((now?.version ?? 0) !== baseVersion) return { ok: false, current: now ? { key, ...now } : null };
    this.put(key, value);
    const w = this.items.get(key)!;
    return { ok: true, version: w.version, seq: w.seq };
  }
}

const record = (id: string, documentId: string, dueDate: string, extra: Record<string, unknown> = {}) => ({
  id,
  documentId,
  periodKey: `${documentId}:${dueDate}:${id}`,
  dueDate,
  status: "In Progress",
  isDemo: false,
  data: { header: {}, rows: [] },
  createdAt: `${dueDate}T04:00:00.000Z`,
  updatedAt: `${dueDate}T05:00:00.000Z`,
  ...extra,
});

const QC: EngineCaller = { userId: "u-qc", userName: "Kapila Barad", email: "qc@test.local", departments: ["QC"], client: "Mitra mobile app" };
const ADMIN: EngineCaller = { userId: "u-admin", userName: "Super Admin", email: "admin@test.local", departments: null, client: "Mitra mobile app" };

describe("the bundle is used only while it is current", () => {
  let dir = "";
  before(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "dcrs-engine-index-"));
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("older than a file it was built from, of another version, or missing a file: built again", () => {
    const source = path.join(dir, "source.ts");
    const bundle = path.join(dir, "engine-0123456789ab.mjs");
    writeFileSync(source, "export {};");
    writeFileSync(bundle, "export {};");
    const past = new Date(Date.now() - 60_000);
    utimesSync(source, past, past);
    const index = (over: Record<string, unknown> = {}) =>
      writeFileSync(path.join(dir, "current.json"), JSON.stringify({ file: path.basename(bundle), inputs: [source], builtAt: Date.now(), api: ENGINE_API_VERSION, ...over }));
    assert.equal(engineBundleIsCurrent(dir), false, "no index yet");
    index();
    assert.equal(engineBundleIsCurrent(dir), true);
    index({ api: ENGINE_API_VERSION + 1 });
    assert.equal(engineBundleIsCurrent(dir), false, "another version");
    index();
    const later = new Date(Date.now() + 60_000);
    utimesSync(source, later, later);
    assert.equal(engineBundleIsCurrent(dir), false, "a source changed since");
    utimesSync(source, past, past);
    index({ inputs: [source, path.join(dir, "gone.ts")] });
    assert.equal(engineBundleIsCurrent(dir), false, "a source is gone");
  });
});

describe("the host, over a stand-in store", { timeout: 300_000 }, () => {
  let store: MemoryStore;
  let host: EngineHost;
  before(async () => {
    store = new MemoryStore();
    store.put("records", [record("rec-hr-1", "daily-pest-monitoring", "2026-09-01", { status: "Submitted", data: { isHoliday: false, checkpoints: {}, checker: "Roshni", timeOfChecking: "09:00", summaryActions: [], rodentCatches: [], photos: [] } })]);
    store.put("deletions", [{ id: "del-hr-old", recordId: "rec-hr-gone", documentId: "daily-pest-monitoring", documentName: "Daily Pest Control Monitoring Record", dueDate: "2026-08-01", status: "Due", isDemo: false, deletedBy: "Vinay Bhojak", deletedAt: "2026-08-02T05:00:00.000Z", reason: "Duplicate", historyEntries: 0 }]);
    host = createEngineHost({ store, bundleDir: BUNDLE_DIR });
    await host.warm();
  });
  after(() => host.close());

  it("a department's account holds only its departments' records; the super admin holds all", async () => {
    const qc = await host.read(QC, "records", { from: "2026-09-01", to: "2026-09-01", limit: 200 });
    assert.equal(qc.status, 200);
    assert.ok(!(qc.body as { records: { recordId: string }[] }).records.some((r) => r.recordId === "rec-hr-1"));
    const all = await host.read(ADMIN, "records", { from: "2026-09-01", to: "2026-09-01", limit: 200 });
    assert.ok((all.body as { records: { recordId: string }[] }).records.some((r) => r.recordId === "rec-hr-1"));
  });

  it("what somebody else stored is seen at the next request", async () => {
    const records = store.get<unknown[]>("records");
    store.put("records", [...records, record("rec-qc-browser", "qc-viscosity", "2026-09-10")]);
    const r = await host.read(QC, "record", { id: "rec-qc-browser" });
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  });

  it("a change is laid over every record as stored; the deletions log keeps other departments' lines", async () => {
    const lines: ActivityLine[] = [];
    const hrBefore = JSON.stringify(store.get<{ id: string }[]>("records").find((r) => r.id === "rec-hr-1"));
    const opened = await host.change(QC, "open", { documentId: "qc-viscosity", date: "2026-09-11" }, (l) => lines.push(l));
    assert.equal(opened.status, 201);
    const id = (opened.body as { record: { recordId: string } }).record.recordId;
    const stored = store.get<{ id: string }[]>("records");
    assert.ok(stored.some((r) => r.id === id));
    assert.equal(JSON.stringify(stored.find((r) => r.id === "rec-hr-1")), hrBefore, "Human Resources' record, byte for byte");
    assert.ok(lines.every((l) => l.detail.startsWith("Through Mitra mobile app")));

    const gone = await host.change(QC, "action", { id, action: "delete", reason: "Opened by mistake" }, () => undefined);
    assert.equal(gone.status, 200);
    const log = store.get<{ id: string; recordId: string; reason: string }[]>("deletions");
    assert.equal(log[0].recordId, id);
    assert.equal(log[0].reason, "Through Mitra mobile app: Opened by mistake");
    assert.ok(log.some((d) => d.id === "del-hr-old"), "the HR line is kept");
    assert.ok(!store.get<{ id: string }[]>("records").some((r) => r.id === id));
  });

  it("a worker that was stopped is started again", async () => {
    await host.close();
    const r = await host.read(QC, "today", {});
    assert.equal(r.status, 200);
  });
});
