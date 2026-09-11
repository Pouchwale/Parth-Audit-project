import type { RecordInstance, RecordStatus } from "../../types";
import { SEED_HISTORICAL_RECORDS } from "../seed/historicalRecords";
import { onExternalChange, readJSON, writeJSON } from "../storageAdapter";
import { compareISO, todayISO } from "../../utils/date";

const KEY = "records";

// In-memory copy of the parsed records array. Every page/engine function
// reads through the repository many times per render, and with the
// lamination log sheets (24 hourly rows per day, five daily formats) the
// stored JSON is large enough that re-parsing localStorage on each call made
// the Demo generator visibly freeze the page. Within one tab this module is
// the only writer of the key, so caching the parsed array (and refreshing it
// on every write) is safe; nothing above the repository layer changes.
let cache: RecordInstance[] | null = null;

// Another tab of the app saved records: drop the copy, or the next save here
// would write this tab's stale array back over what that tab just saved.
onExternalChange((key) => {
  if (key === null || key === KEY) cache = null;
});

function loadAll(): RecordInstance[] {
  if (cache === null) cache = readJSON<RecordInstance[]>(KEY, []);
  return cache;
}
function saveAll(records: RecordInstance[]): void {
  // The copy is only updated once the array is really stored. When the
  // browser's storage is full the write fails; a cached copy showing the
  // change would be lost, silently, on the next reload. Dropping it makes the
  // screens show what is actually stored, and StorageFullBanner says why.
  cache = writeJSON(KEY, records) ? records : null;
}

// Historical (real, source-document) records are added by id if missing —
// not only on a completely empty store — so an install that already has
// data still receives newly transcribed history (e.g. the Dec-2025
// awareness training from "Training - Yrl (1).doc"). Existing records are
// never overwritten: once seeded, they belong to the user.
export function ensureSeeded(): void {
  const existing = loadAll();
  const ids = new Set(existing.map((r) => r.id));
  const missing = SEED_HISTORICAL_RECORDS.filter((r) => !ids.has(r.id));
  if (missing.length > 0) saveAll([...existing, ...missing]);
}

export interface RecordFilter {
  documentId?: string;
  status?: RecordStatus;
  isDemo?: boolean;
  fromDate?: string;
  toDate?: string;
  dueDate?: string;
}

function matches(r: RecordInstance, f: RecordFilter): boolean {
  if (f.documentId && r.documentId !== f.documentId) return false;
  if (f.status && r.status !== f.status) return false;
  if (f.isDemo !== undefined && r.isDemo !== f.isDemo) return false;
  if (f.dueDate && r.dueDate !== f.dueDate) return false;
  if (f.fromDate && compareISO(r.dueDate, f.fromDate) < 0) return false;
  if (f.toDate && compareISO(r.dueDate, f.toDate) > 0) return false;
  return true;
}

export const recordRepository = {
  getAll(): RecordInstance[] {
    return loadAll().slice();
  },
  getById(id: string): RecordInstance | undefined {
    return loadAll().find((r) => r.id === id);
  },
  query(filter: RecordFilter): RecordInstance[] {
    return loadAll().filter((r) => matches(r, filter));
  },
  upsert(record: RecordInstance): RecordInstance {
    const all = loadAll().slice();
    const idx = all.findIndex((r) => r.id === record.id);
    const stamped = { ...record, updatedAt: new Date().toISOString() };
    if (idx >= 0) all[idx] = stamped;
    else all.push(stamped);
    saveAll(all);
    return stamped;
  },
  // Set of "documentId|periodKey" for one Demo/Live side — lets the record
  // generators check a whole month of due dates without a scan per date.
  periodKeys(isDemo: boolean): Set<string> {
    const out = new Set<string>();
    for (const r of loadAll()) if (r.isDemo === isDemo) out.add(`${r.documentId}|${r.periodKey}`);
    return out;
  },
  // Unlike upsert() (above), this does NOT re-stamp updatedAt — every
  // current caller (recordGenerator.ts, demoGenerator.ts, assistantPrepare.ts)
  // already sets it explicitly on each record before calling this, often to
  // a value shared with another field on the same record (e.g. prepared.at)
  // that a caller needs to remain exactly equal. Batch callers are always
  // system code generating/preparing records, never a direct human edit —
  // upsert() is what a real save/submit/verify goes through, and that still
  // always mints a fresh timestamp.
  upsertMany(records: RecordInstance[]): void {
    if (records.length === 0) return;
    const all = loadAll();
    const byId = new Map(all.map((r) => [r.id, r] as const));
    for (const r of records) byId.set(r.id, r);
    saveAll(Array.from(byId.values()));
  },
  // The three removals below skip the write when nothing matched: the
  // records array is megabytes, and boot-time clean-ups that find nothing
  // (e.g. the retired Lizard report) used to rewrite all of it every start.
  remove(id: string): void {
    const all = loadAll();
    const keep = all.filter((r) => r.id !== id);
    if (keep.length !== all.length) saveAll(keep);
  },
  // Bulk variant of remove() — one filter pass and one write, instead of one
  // of each per id. Matters for a backlog cleanup that can touch thousands
  // of records at once (see engine/backlogCleanup.ts).
  removeIds(ids: Iterable<string>): number {
    const idSet = ids instanceof Set ? ids : new Set(ids);
    if (idSet.size === 0) return 0;
    const all = loadAll();
    const keep = all.filter((r) => !idSet.has(r.id));
    if (keep.length !== all.length) saveAll(keep);
    return all.length - keep.length;
  },
  removeWhere(filter: RecordFilter): number {
    const all = loadAll();
    const keep = all.filter((r) => !matches(r, filter));
    if (keep.length !== all.length) saveAll(keep);
    return all.length - keep.length;
  },
  clearDemoData(): number {
    return this.removeWhere({ isDemo: true });
  },

  // ---- Dashboard aggregate helper ----
  monthStats(year: number, month: number, opts: { isDemo?: boolean } = {}) {
    const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const to = `${year}-${String(month + 1).padStart(2, "0")}-31`;
    const all = loadAll().filter((r) => (opts.isDemo === undefined ? true : r.isDemo === opts.isDemo));
    const inMonth = all.filter((r) => compareISO(r.dueDate, from) >= 0 && compareISO(r.dueDate, to) <= 0);
    const today = todayISO();
    const completed = inMonth.filter((r) => ["Submitted", "Pending Verification", "Verified"].includes(r.status));
    const overdue = inMonth.filter((r) => compareISO(r.dueDate, today) < 0 && ["Scheduled", "Due", "In Progress"].includes(r.status));
    const pending = inMonth.filter((r) => ["Scheduled", "Due", "In Progress"].includes(r.status) && compareISO(r.dueDate, today) >= 0);
    return {
      total: inMonth.length,
      completed: completed.length,
      pending: pending.length,
      overdue: overdue.length,
    };
  },
};
