// THE RODENT BOXES THE PHONE IS GIVEN (REQUIREMENTS §104), backend/engineHost.ts with frontend/src/engineHost/entry.ts:
// GET /api/v1/records/{id}'s layout for F/HR/17, as DCRS's own engine makes it for the Mitra mobile app.
//   * check points 8 and 9 carry `noteChoices` [{id, area?}] (none picked), where they came from, and the line saying
//     so in the language the app is read in; 8 alone carries `noteOther`;
//   * the list: RC-1 to RC-<check point 4's count on the record>, else the last confirmed record's, else Master Data's
//     Active stations once the plant has entered them (they come first);
//   * the patch shape names a box: {"9": {"value": "Yes", "note": "RC-17"}}, and a change naming a box that is not on
//     the stations list is refused in words while "rc 17" is written RC-17.
// Run: npm run test:unit -- engineHostRodentBoxes
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { StoredItem, WriteResult } from "../db.ts";
import { createEngineHost, type EngineCaller, type EngineHost, type EngineStore } from "../engineHost.ts";

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

const day = (checkpoints: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  isHoliday: false,
  checkpoints,
  checker: "Roshni",
  timeOfChecking: "09:00",
  summaryActions: [],
  rodentCatches: [],
  photos: [],
  ...extra,
});
const record = (id: string, dueDate: string, status: string, data: unknown) => ({
  id,
  documentId: "daily-pest-monitoring",
  periodKey: `daily-pest-monitoring:${dueDate}:${id}`,
  dueDate,
  status,
  isDemo: false,
  data,
  createdAt: `${dueDate}T04:00:00.000Z`,
  updatedAt: `${dueDate}T05:00:00.000Z`,
});

const ADMIN: EngineCaller = { userId: "u-admin", userName: "Super Admin", email: "admin@test.local", departments: null, role: "admin", client: "Mitra mobile app" };
type Body = Record<string, any>;
const checkpoint = (body: unknown, no: number): Body => ((body as Body).layout.checkpoints as Body[]).find((c) => c.number === no)!;

describe("the rodent boxes in the phone's layout of F/HR/17", { timeout: 300_000 }, () => {
  let store: MemoryStore;
  let host: EngineHost;
  const noLog = () => undefined;

  before(async () => {
    store = new MemoryStore();
    store.put("records", [
      record("rb-confirmed", "2026-09-07", "Verified", day({ "4": { value: 100 } })),
      record("rb-open", "2026-09-08", "In Progress", day({})),
      record("rb-own", "2026-09-09", "In Progress", day({ "4": { value: 12 } })),
    ]);
    store.put("deletions", []);
    host = createEngineHost({ store, bundleDir: BUNDLE_DIR });
    await host.warm();
  });
  after(() => host.close());

  it("8 and 9 carry the boxes, none picked, from the last confirmed record's count; 8 alone takes a place in words", async () => {
    const r = await host.read(ADMIN, "record", { id: "rb-open" });
    assert.equal(r.status, 200);
    const eight = checkpoint(r.body, 8);
    const nine = checkpoint(r.body, 9);
    assert.equal(nine.noteChoices.length, 100);
    assert.deepEqual([nine.noteChoices[0], nine.noteChoices[99]], [{ id: "RC-1" }, { id: "RC-100" }]);
    assert.equal(nine.noteChoicesFrom, "last");
    assert.match(nine.noteChoicesSaid, /^Box numbers RC-1 to RC-100 from the trap count of 07-Sep-2026 \(check point 4\)/);
    assert.equal(nine.noteOther, undefined);
    assert.deepEqual(eight.noteChoices, nine.noteChoices);
    assert.equal(eight.noteOther, true);
    assert.equal(eight.noteAsks, "Mention the location", "the paper's words stay");
    for (const no of [1, 4, 7, 10]) assert.equal(checkpoint(r.body, no).noteChoices, undefined, `check point ${no} names no box`);
    assert.match((r.body as Body).patchShape, /"9": \{"value": "Yes", "note": "RC-17"\}/);
    assert.equal(JSON.stringify((r.body as Body).data.checkpoints), "{}", "nothing is written into the record");
  });

  it("this record's own count comes first, and the line is said in the language the app is read in", async () => {
    const own = await host.read(ADMIN, "record", { id: "rb-own" });
    assert.equal(checkpoint(own.body, 9).noteChoices.length, 12);
    assert.equal(checkpoint(own.body, 9).noteChoicesFrom, "today");
    const gu = await host.read({ ...ADMIN, lang: "gu" }, "record", { id: "rb-own" });
    assert.match(checkpoint(gu.body, 9).noteChoicesSaid, /^બોક્સ નંબર RC-1 થી RC-12, આજની ટ્રેપની સંખ્યા/);
    const hi = await host.read({ ...ADMIN, lang: "hi" }, "record", { id: "rb-own" });
    assert.match(checkpoint(hi.body, 9).noteChoicesSaid, /^बॉक्स नंबर RC-1 से RC-12, आज की ट्रैप गिनती/);
  });

  it("Master Data's Active stations come first, with their areas; a box not on them is refused, 'rc 17' is written RC-17", async () => {
    store.put("master", {
      rodentStations: [
        { id: "RC-1", location: "Canteen", type: "Tamper Proof Bait Station", status: "Active" },
        { id: "RC-17", location: "TO BE CONFIRMED", type: "TO BE CONFIRMED", status: "Active" },
        { id: "RC-30", location: "QC Lab", type: "TO BE CONFIRMED", status: "Inactive" },
      ],
    });
    const r = await host.read(ADMIN, "record", { id: "rb-own" });
    assert.deepEqual(checkpoint(r.body, 9).noteChoices, [{ id: "RC-1", area: "Canteen" }, { id: "RC-17" }]);
    assert.equal(checkpoint(r.body, 9).noteChoicesFrom, "stations");

    const refused = await host.change(ADMIN, "change", { id: "rb-own", patch: { checkpoints: { "9": { value: "Yes", note: "RC-140" } } }, note: "" }, noLog);
    assert.equal(refused.status, 200, "the Yes is written");
    assert.match(((refused.body as Body).problems as string[]).join(" "), /RC-140 is not on the rodent box list \(Master Data → Rodent Stations\)/);
    const after1 = await host.read(ADMIN, "record", { id: "rb-own" });
    assert.deepEqual((after1.body as Body).data.checkpoints["9"], { value: "Yes" });
    assert.ok(((after1.body as Body).problems as string[]).includes("Checkpoint 9: Mention the Rodent box number is required when the answer is Yes."));

    const written = await host.change(ADMIN, "change", { id: "rb-own", patch: { checkpoints: { "9": { note: "rc 17" } } }, note: "" }, noLog);
    assert.equal(written.status, 200);
    const after2 = await host.read(ADMIN, "record", { id: "rb-own" });
    assert.deepEqual((after2.body as Body).data.checkpoints["9"], { value: "Yes", note: "RC-17" });
    assert.ok(!((after2.body as Body).problems as string[]).some((p) => /Checkpoint 9/.test(p)), "nothing left to say about check point 9");
  });
});
