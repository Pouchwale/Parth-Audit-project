// THE BLANK SHEETS FROM BEFORE GO-LIVE ARE MOVED, NEVER DELETED (REQUIREMENTS §115), backend/recordsArchive.ts over an
// in-memory stand-in for the records item and the archive table (the same contracts: the version check on the write,
// the archive idempotent by id):
//   * exactly the sheets the rule finds are moved — an untouched Due shell and an untouched preparation dated before
//     go-live — and nothing else is touched: a sheet a person wrote on, a submitted one, a blank after go-live, a
//     demo record, all stay, in their order;
//   * run again, nothing moves twice (idempotent); a crash between the two steps (the archive holds a copy the records
//     still have) is finished by the next run, with one row in the archive, not two;
//   * a browser saving in between (the version moved) is retried, not lost;
//   * a browser holding the old copy cannot write them back: PUT /api/storage/records keeps them out;
//   * "Bring them back" restores exactly those, whole, never a duplicate, and they are never moved again by itself.
// Run: npm run test:unit -- recordsArchive
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import express, { type NextFunction, type Request, type Response } from "express";
import type { PublicUser } from "../auth.ts";
import type { StoredItem, WriteResult } from "../db.ts";
import { archivePreLaunchBlanks, archivedRecordIds, restoreArchivedBlanks, type ArchiveRow, type ArchiveStore } from "../recordsArchive.ts";
import { registerStorageRoutes } from "../storageRoutes.ts";
import { DOCS_JSON } from "./accessFixtures.ts";

class MemoryArchive implements ArchiveStore {
  items = new Map<string, { value: string; version: number; seq: number }>();
  rows = new Map<string, ArchiveRow & { restoredBy: string | null }>();
  seq = 0;
  /** Set by a test: the next write is refused once, as if a browser saved in between. */
  refuseNextWrite = false;
  writes = 0;
  put(key: string, value: unknown): void {
    const now = this.items.get(key);
    this.seq += 1;
    this.items.set(key, { value: typeof value === "string" ? value : JSON.stringify(value), version: (now?.version ?? 0) + 1, seq: this.seq });
  }
  records(): { id: string }[] {
    return JSON.parse(this.items.get("records")?.value ?? "[]") as { id: string }[];
  }
  version(): number {
    return this.items.get("records")?.version ?? 0;
  }
  async readItem(_scope: string, key: string): Promise<StoredItem | null> {
    const i = this.items.get(key);
    return i ? { key, ...i } : null;
  }
  async writeItem(_scope: string, key: string, value: string, baseVersion: number): Promise<WriteResult> {
    this.writes += 1;
    const now = this.items.get(key);
    if (this.refuseNextWrite) {
      this.refuseNextWrite = false;
      // The browser's save: one more record, and the version moves.
      this.put(key, JSON.stringify([...(JSON.parse(now?.value ?? "[]") as unknown[]), { id: "saved-meanwhile", documentId: "qc-viscosity", dueDate: "2026-10-14", status: "In Progress", isDemo: false }]));
      const moved = this.items.get(key)!;
      return { ok: false, current: { key, ...moved } };
    }
    if ((now?.version ?? 0) !== baseVersion) return { ok: false, current: now ? { key, ...now } : null };
    this.put(key, value);
    const w = this.items.get(key)!;
    return { ok: true, version: w.version, seq: w.seq };
  }
  async archive(rows: ArchiveRow[]): Promise<void> {
    for (const r of rows) if (!this.rows.has(r.id)) this.rows.set(r.id, { ...r, record: JSON.parse(JSON.stringify(r.record)), restoredBy: null });
  }
  async kept(): Promise<ArchiveRow[]> {
    return [...this.rows.values()].filter((r) => r.restoredBy === null).map(({ restoredBy: _r, ...row }) => row);
  }
  async keptIds(): Promise<Set<string>> {
    return new Set([...this.rows.values()].filter((r) => r.restoredBy === null).map((r) => r.id));
  }
  async restoredIds(): Promise<Set<string>> {
    return new Set([...this.rows.values()].filter((r) => r.restoredBy !== null).map((r) => r.id));
  }
  async markRestored(ids: string[], by: string): Promise<void> {
    for (const id of ids) {
      const r = this.rows.get(id);
      if (r && r.restoredBy === null) r.restoredBy = by;
    }
  }
}

const LIVE = "2026-09-08";
const rec = (id: string, dueDate: string, status: string, extra: Record<string, unknown> = {}) => ({
  id,
  documentId: "daily-pest-monitoring",
  periodKey: `daily-pest-monitoring:${dueDate}`,
  dueDate,
  status,
  isDemo: false,
  data: { checkpoints: {}, note: "ગુજરાતી → test" },
  createdAt: `${dueDate}T03:00:00.000Z`,
  updatedAt: `${dueDate}T03:00:00.000Z`,
  ...extra,
});

/** The plant's records: two blank sheets from before go-live among everything that must stay. */
function plant(): Record<string, unknown>[] {
  return [
    rec("blank-before", "2026-08-01", "Due"),
    rec("written-before", "2026-08-02", "In Progress", { updatedAt: "2026-08-02T09:00:00.000Z", history: [{ id: "h1", action: "edited" }] }),
    rec("prepared-untouched", "2026-08-03", "In Progress", { prepared: { at: "2026-08-03T03:00:00.000Z", notes: [] }, updatedAt: "2026-08-03T03:00:00.500Z" }),
    rec("prepared-then-edited", "2026-08-04", "In Progress", { prepared: { at: "2026-08-04T03:00:00.000Z", notes: [] }, updatedAt: "2026-08-04T03:10:00.000Z" }),
    rec("submitted-before", "2026-08-05", "Submitted", { submittedAt: "2026-08-05T06:00:00.000Z" }),
    rec("verified-before", "2026-08-06", "Verified"),
    rec("blank-after", "2026-09-09", "Due"),
    rec("demo-before", "2026-08-07", "Due", { isDemo: true }),
    rec("scheduled-on-live-day", LIVE, "Scheduled"),
  ];
}

function seeded(): MemoryArchive {
  const store = new MemoryArchive();
  store.put("live-start", { date: LIVE });
  store.put("records", plant());
  return store;
}

const ids = (list: { id: string }[]) => list.map((r) => r.id);
const STAY = ["written-before", "prepared-then-edited", "submitted-before", "verified-before", "blank-after", "demo-before", "scheduled-on-live-day"];

describe("the move: exactly the blank sheets from before go-live, nothing deleted", () => {
  it("copies them into the archive, then takes them out of the records, in one version step", async () => {
    const store = seeded();
    const out = await archivePreLaunchBlanks(store);
    assert.deepEqual(out, { copied: 2, moved: 2, kept: 2 });
    assert.deepEqual(ids(store.records()), STAY, "everything a person touched, after go-live, or demo stays, in its order");
    assert.equal(store.version(), 2, "one write of the records item");
    const kept = await store.kept();
    assert.deepEqual(kept.map((r) => r.id).sort(), ["blank-before", "prepared-untouched"]);
    const original = plant().find((r) => r.id === "blank-before");
    assert.deepEqual(kept.find((r) => r.id === "blank-before")?.record, original, "the whole record, as it was");
    assert.match(kept[0].why, /before the system went live on 08-Sep-2026/);
    assert.deepEqual([...archivedRecordIds()].sort(), ["blank-before", "prepared-untouched"], "the storage route's guard knows them");
  });

  it("does nothing without a go-live day, and nothing twice", async () => {
    const empty = new MemoryArchive();
    empty.put("records", plant());
    assert.deepEqual(await archivePreLaunchBlanks(empty), { copied: 0, moved: 0, kept: 0 });
    assert.equal(empty.version(), 1, "not written");

    const store = seeded();
    await archivePreLaunchBlanks(store);
    const again = await archivePreLaunchBlanks(store);
    assert.deepEqual(again, { copied: 0, moved: 0, kept: 2 });
    assert.equal(store.version(), 2, "the records were not written again");
    assert.equal(store.rows.size, 2, "no row twice");
  });

  it("finishes after a crash between the copy and the removal, with one row in the archive", async () => {
    const store = seeded();
    // The first run died after step 1: the archive holds the copy, the records still have the sheet.
    await store.archive([{ id: "blank-before", documentId: "daily-pest-monitoring", dueDate: "2026-08-01", record: plant()[0], why: "earlier run" }]);
    const out = await archivePreLaunchBlanks(store);
    assert.deepEqual(out, { copied: 1, moved: 2, kept: 2 }, "the one left behind and the one not yet copied");
    assert.deepEqual(ids(store.records()), STAY);
    assert.equal(store.rows.size, 2);
    assert.equal(store.rows.get("blank-before")?.why, "earlier run", "the earlier copy was left as it was");
  });

  it("is worked out again when a browser saved in between, losing neither side's change", async () => {
    const store = seeded();
    store.refuseNextWrite = true;
    const out = await archivePreLaunchBlanks(store);
    assert.deepEqual(out, { copied: 2, moved: 2, kept: 2 });
    assert.deepEqual(ids(store.records()), [...STAY, "saved-meanwhile"], "the browser's record is there, the blanks are not");
    assert.equal(store.writes, 2, "one refused, one written");
  });
});

describe("bring them back: exact, never a duplicate, never moved again by itself", () => {
  it("restores the whole records and marks them restored", async () => {
    const store = seeded();
    await archivePreLaunchBlanks(store);
    const out = await restoreArchivedBlanks(store, "admin@gpp.local");
    assert.deepEqual(out, { restored: 2, alreadyThere: 0 });
    const back = store.records() as ({ id: string } & Record<string, unknown>)[];
    assert.deepEqual(ids(back), [...STAY, "blank-before", "prepared-untouched"]);
    assert.deepEqual(
      back.find((r) => r.id === "prepared-untouched"),
      plant().find((r) => r.id === "prepared-untouched"),
      "exactly as it was"
    );
    assert.equal((await store.keptIds()).size, 0);
    assert.equal(archivedRecordIds().size, 0, "the guard lets them through again");
    assert.deepEqual(await restoreArchivedBlanks(store, "admin@gpp.local"), { restored: 0, alreadyThere: 0 }, "nothing left to bring back");
    // The server starts again: the sheets the super admin brought back are theirs to keep.
    assert.deepEqual(await archivePreLaunchBlanks(store), { copied: 0, moved: 0, kept: 0 });
    assert.deepEqual(ids(store.records()), [...STAY, "blank-before", "prepared-untouched"]);
  });

  it("never duplicates a sheet the records already hold", async () => {
    const store = seeded();
    await archivePreLaunchBlanks(store);
    // An old copy put one of them back meanwhile (the guard off, say): restore adds only the other.
    store.put("records", [...store.records(), plant()[0] as { id: string }]);
    const out = await restoreArchivedBlanks(store, "admin@gpp.local");
    assert.deepEqual(out, { restored: 1, alreadyThere: 1 });
    const back = ids(store.records());
    assert.equal(back.filter((id) => id === "blank-before").length, 1);
    assert.ok(back.includes("prepared-untouched"));
  });
});

// ---------------------------------------------------------------------------
// a browser holding the old copy: PUT /api/storage/records keeps the archived sheets out

const ADMIN: PublicUser = { id: "u-admin", name: "Super Admin", email: "admin@gpp.local", role: "admin", departments: [] };

describe("a browser holding the old copy cannot bring them back", () => {
  let base = "";
  let close: () => Promise<void> = async () => undefined;
  let store: MemoryArchive;
  const lines: { action: string; detail: string }[] = [];
  before(async () => {
    store = seeded();
    store.put("documents", DOCS_JSON);
    await archivePreLaunchBlanks(store);
    const app = express();
    const requireAuth = (req: Request, _res: Response, next: NextFunction): void => {
      (req as Request & { user: PublicUser }).user = ADMIN;
      next();
    };
    const storage = {
      storedItems: async () => ({ items: [], seq: 0, versions: {} }),
      readItem: (scope: string, key: string) => store.readItem(scope, key),
      writeItem: async (scope: string, key: string, value: string, baseVersion: number | null, by: string, compose?: (stored: string | null) => string) => {
        const now = store.items.get(key);
        if (baseVersion !== null && (now?.version ?? 0) !== baseVersion) return { ok: false as const, current: now ? { key, ...now } : null };
        store.put(key, compose ? compose(now?.value ?? null) : value);
        const w = store.items.get(key)!;
        return { ok: true as const, version: w.version, seq: w.seq };
      },
      deleteItem: async () => undefined,
      itemSeq: async (_s: string, key: string) => store.items.get(key)?.seq ?? null,
    };
    registerStorageRoutes(app, { requireAuth, logActivity: (_r, _w, action, _t = "", detail = "") => lines.push({ action, detail }), store: storage, archivedRecordIds });
    const server = app.listen(0);
    await new Promise<void>((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => new Promise((r) => server.close(() => r()));
  });
  after(() => close());

  it("writes everything the browser posted but the archived sheets, and says so", async () => {
    const old = [...plant(), rec("new-today", "2026-10-14", "In Progress")]; // the copy from before the move, plus today's work
    const res = await fetch(`${base}/api/storage/records`, { method: "PUT", body: JSON.stringify(old), headers: { "x-base-version": String(store.version()), "x-account": ADMIN.id } });
    const body = (await res.json()) as { keptOut?: number; error?: string };
    assert.equal(res.status, 200, body.error ?? "");
    assert.equal(body.keptOut, 2);
    assert.deepEqual(ids(store.records()), [...STAY, "new-today"], "today's work saved; the archived sheets stay out");
    assert.equal((await store.keptIds()).size, 2, "and stay in the archive");
    assert.ok(lines.some((l) => l.action === "Archived sheets kept out" && l.detail.startsWith("2 blank sheets")), "a line of the activity log says so");
  });

  it("costs a browser without them nothing: no line, no keptOut", async () => {
    lines.length = 0;
    const res = await fetch(`${base}/api/storage/records`, { method: "PUT", body: JSON.stringify(store.records()), headers: { "x-base-version": String(store.version()), "x-account": ADMIN.id } });
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { keptOut?: number }).keptOut, undefined);
    assert.equal(lines.length, 0);
  });
});
