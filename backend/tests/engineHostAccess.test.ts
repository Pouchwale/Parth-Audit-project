// THE ENGINE HOST AT EACH PERSON'S LEVEL (REQUIREMENTS §96), backend/engineHost.ts with frontend/src/engineHost/entry.ts:
// DCRS's own engine, run for the Mitra mobile app, given the person and the super admin's stored rules.
//   * a person holds the records of the documents they see at Read or more, by the owner's table and what the super
//     admin set (not their departments); a record of a document they do not see is refused by name;
//   * every change is asked of their level first: start, fill, submit, verify, send back at Write; reopen, cancel a
//     correction and delete at Edit — refused with 403 "access-level" in the website's own words, in the language asked;
//   * the super admin passes everything, and a load made for one person is never another's.
// Run: npm run test:unit -- engineHostAccess
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { StoredItem, WriteResult } from "../db.ts";
import { createEngineHost, type EngineCaller, type EngineHost, type EngineStore } from "../engineHost.ts";
import { DOCS_JSON } from "./accessFixtures.ts";

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
  history: [{ id: `h-${id}`, at: `${dueDate}T05:00:00.000Z`, by: "Somebody", action: "edited" }],
  createdAt: `${dueDate}T04:00:00.000Z`,
  updatedAt: `${dueDate}T05:00:00.000Z`,
  ...extra,
});

const person = (userId: string, userName: string, email: string, departments: string[] | null, role = "staff"): EngineCaller => ({ userId, userName, email, departments, role, client: "Mitra mobile app" });
const ANKUR = person("u-ankur", "Ankur Raval", "ankur.raval@gpp.local", ["QC"]);
const KAPILA = person("u-kapila", "Kapila Barad", "kapila.barad@gpp.local", ["QC"]);
const VINAY = person("u-vinay", "Vinay Bhojak", "vinay.bhojak@gpp.local", ["HR"]);
const ADMIN = person("u-admin", "Super Admin", "admin@gpp.local", null, "admin");

type Body = Record<string, any>;
/** The stored records listed (a register the calendar has not stored yet has no id). */
const ids = (body: unknown): string[] => ((body as { records: { recordId: string | null }[] }).records ?? []).flatMap((r) => (r.recordId ? [r.recordId] : [])).sort();

describe("the engine host, at each person's level", { timeout: 300_000 }, () => {
  let store: MemoryStore;
  let host: EngineHost;
  const noLog = () => undefined;

  before(async () => {
    store = new MemoryStore();
    store.put("documents", DOCS_JSON);
    store.put("records", [
      record("rec-hr", "daily-pest-monitoring", "2026-09-01", { status: "Pending Verification", submittedBy: "Kapila Barad", data: { isHoliday: false, checkpoints: {}, checker: "Roshni", timeOfChecking: "09:00", summaryActions: [], rodentCatches: [], photos: [] } }),
      record("rec-pouch", "qc-inspection-pouching", "2026-09-01"),
      record("rec-visc", "qc-viscosity", "2026-09-01"),
    ]);
    store.put("deletions", []);
    // The super admin gave Vinay Bhojak Write on F/HR/17 (he only views it by the owner's table).
    store.put("access", { version: 1, people: { "vinay.bhojak@gpp.local": { documents: { "daily-pest-monitoring": "write" } } }, responsibility: {} });
    host = createEngineHost({ store, bundleDir: BUNDLE_DIR });
    await host.warm();
  });
  after(() => host.close());

  it("a person holds the documents they see at Read or more: Quality Control's for Ankur Raval, every module for Kapila Barad", async () => {
    const ankur = await host.read(ANKUR, "records", { from: "2026-09-01", to: "2026-09-01", limit: 200 });
    assert.equal(ankur.status, 200);
    assert.deepEqual(ids(ankur.body), ["rec-pouch", "rec-visc"]);
    const kapila = await host.read(KAPILA, "records", { from: "2026-09-01", to: "2026-09-01", limit: 200 });
    assert.deepEqual(ids(kapila.body), ["rec-hr", "rec-pouch", "rec-visc"], "she views every module, though her account is kept to QC");
    const hr = await host.read(ANKUR, "record", { id: "rec-hr" });
    assert.equal(hr.status, 403);
    assert.equal((hr.body as Body).code, "not-your-department");
    assert.match((hr.body as Body).error, /^You do not have access to F\/HR\/17 Daily Pest Control Monitoring Record \(Human Resources\)\. Ask the super admin for Read access\.$/);
  });

  it("a load made for one person is never another's: the super admin after Ankur Raval holds everything", async () => {
    await host.read(ANKUR, "records", { from: "2026-09-01", to: "2026-09-01", limit: 200 });
    const all = await host.read(ADMIN, "records", { from: "2026-09-01", to: "2026-09-01", limit: 200 });
    assert.deepEqual(ids(all.body), ["rec-hr", "rec-pouch", "rec-visc"]);
    const again = await host.read(ANKUR, "records", { from: "2026-09-01", to: "2026-09-01", limit: 200 });
    assert.deepEqual(ids(again.body), ["rec-pouch", "rec-visc"]);
  });

  it("Read: nothing may be started, filled or submitted, said in the website's words", async () => {
    const before = store.get<unknown[]>("records");
    const fill = await host.change(ANKUR, "change", { id: "rec-pouch", patch: { header: { remarks: "x" } }, note: "" }, noLog);
    assert.equal(fill.status, 403);
    assert.equal((fill.body as Body).code, "access-level");
    assert.match((fill.body as Body).error, /^F\/QC\/37 .+ is Read only for you\. Filling in a record needs Write access: ask the super admin for it\.$/);
    assert.deepEqual([(fill.body as Body).level, (fill.body as Body).needed, (fill.body as Body).action, (fill.body as Body).recordId], ["read", "write", "fill", "rec-pouch"]);
    const submit = await host.change(ANKUR, "action", { id: "rec-pouch", action: "submit", reviewed: true }, noLog);
    assert.equal((submit.body as Body).action, "submit");
    const start = await host.change(ANKUR, "open", { documentId: "qc-inspection-pouching", date: "2026-09-02" }, noLog);
    assert.equal(start.status, 403);
    assert.equal((start.body as Body).action, "start");
    assert.deepEqual(store.get<unknown[]>("records"), before, "nothing written");
  });

  it("says it in the language the phone asks for", async () => {
    const gu = await host.change({ ...ANKUR, lang: "gu" }, "action", { id: "rec-pouch", action: "submit" }, noLog);
    assert.equal(gu.status, 403);
    assert.match((gu.body as Body).error, /તમારા માટે ફક્ત Read છે\. રેકોર્ડ જમા કરવા માટે Write ઍક્સેસ જોઈએ/);
    const hi = await host.change({ ...ANKUR, lang: "hi" }, "action", { id: "rec-pouch", action: "submit" }, noLog);
    assert.match((hi.body as Body).error, /आपके लिए केवल Read है।/);
  });

  it("Edit on what the person answers for: Ankur Raval starts and deletes F-QC-30's records", async () => {
    const opened = await host.change(ANKUR, "open", { documentId: "qc-viscosity", date: "2026-09-02" }, noLog);
    assert.ok(opened.status === 201 || opened.status === 200, JSON.stringify(opened.body).slice(0, 300));
    const id = (opened.body as Body).record.recordId as string;
    const gone = await host.change(ANKUR, "action", { id, action: "delete", reason: "Opened by mistake" }, noLog);
    assert.equal(gone.status, 200, JSON.stringify(gone.body).slice(0, 300));
  });

  it("Write: verify and send back, but reopening for correction and deleting need Edit", async () => {
    const reopen = await host.change(VINAY, "action", { id: "rec-hr", action: "reopen", reason: "A typo" }, noLog);
    assert.equal(reopen.status, 403);
    assert.equal((reopen.body as Body).needed, "edit");
    assert.match((reopen.body as Body).error, /^You have Write access to F\/HR\/17 Daily Pest Control Monitoring Record\. Correcting a signed-off record needs Edit access: ask the super admin for it\.$/);
    const del = await host.change(VINAY, "action", { id: "rec-hr", action: "delete", reason: "x" }, noLog);
    assert.equal((del.body as Body).action, "delete");
    const verified = await host.change(VINAY, "action", { id: "rec-hr", action: "verify" }, noLog);
    assert.equal(verified.status, 200, JSON.stringify(verified.body).slice(0, 300));
    assert.equal((verified.body as Body).status, "Verified");
  });

  it("the super admin passes everything", async () => {
    const reopen = await host.change(ADMIN, "action", { id: "rec-hr", action: "reopen", reason: "Checked by the super admin" }, noLog);
    assert.equal(reopen.status, 200, JSON.stringify(reopen.body).slice(0, 300));
    const back = await host.change(ADMIN, "action", { id: "rec-hr", action: "cancel_correction" }, noLog);
    assert.equal(back.status, 200, JSON.stringify(back.body).slice(0, 300));
  });
});
