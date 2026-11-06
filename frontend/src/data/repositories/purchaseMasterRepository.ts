import type { ApprovedSupplier, SupplierValues } from "../../types";
import { purchaseMasterSeed } from "../seed/purchaseMasterSeed";
import { readJSON, readJSONCached, writeJSON } from "../storageAdapter";
import { blankSupplierValues, type SupplierImportPlan } from "../../engine/purchaseMaster";
import { generateId } from "../../utils/id";

// THE PURCHASE MASTER SHEET'S STORE (REQUIREMENTS §186) — the List of Approved Suppliers with their ratings, kept under
// "purchaseMasterData", the same for everyone who holds it (master data, not a record). The server hands it to those who
// see Purchase and takes a change from those with Write on a Purchase document (backend/accessLevels.ts
// holdsPurchaseMaster, writesPurchaseMaster). The seed (data/seed/purchaseMasterSeed.ts) is only merged in additively by
// id, and a seeded line Purchase removes stays removed, as HR Master Data's does (hrMasterRepository.ts).

const KEY = "purchaseMasterData";

interface Store {
  suppliers: ApprovedSupplier[];
  removedSeedIds: string[];
  /** Every line removed — so a copy merged with someone else's never brings one back (data/serverSync.ts). */
  removedIds?: string[];
  /** The sheet's headings as Purchase typed them over, by column (REQUIREMENTS §189); a heading not here is the list's own. */
  headings?: Record<string, string>;
}

let seedIds: Set<string> | null = null;
const isSeedId = (id: string) => (seedIds ??= new Set(purchaseMasterSeed().map((s) => s.id))).has(id);

/** Read once per stored value; the writers below take a copy of their own. A line stored before a cell existed has it blank (a rating, full). */
function load(): Store {
  const raw = readJSONCached<Store | null>(KEY, null);
  if (!raw || !Array.isArray(raw.suppliers)) return { suppliers: purchaseMasterSeed(), removedSeedIds: [], removedIds: [] };
  return {
    suppliers: raw.suppliers.map((s) => ({ ...blankSupplierValues(), ...s })),
    removedSeedIds: raw.removedSeedIds ?? [],
    removedIds: raw.removedIds ?? [],
    headings: raw.headings ?? {},
  };
}

function save(store: Store): boolean {
  return writeJSON(KEY, store);
}

/** The seed's lines the stored sheet does not have yet, and never had removed, added at its end. */
export function ensureSeeded(): void {
  const raw = readJSON<Store | null>(KEY, null);
  if (!raw || !Array.isArray(raw.suppliers)) {
    save({ suppliers: purchaseMasterSeed(), removedSeedIds: [], removedIds: [] });
    return;
  }
  const ids = new Set(raw.suppliers.map((s) => s.id));
  const gone = new Set([...(raw.removedSeedIds ?? []), ...(raw.removedIds ?? [])]);
  const additions = purchaseMasterSeed().filter((s) => !ids.has(s.id) && !gone.has(s.id));
  if (additions.length > 0) save({ ...raw, suppliers: [...raw.suppliers, ...additions], removedSeedIds: raw.removedSeedIds ?? [], removedIds: raw.removedIds ?? [] });
}

const clean = (values: Partial<SupplierValues>): Partial<SupplierValues> =>
  Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v ?? "").replace(/\s+/g, " ").trim()])) as Partial<SupplierValues>;

export const purchaseMasterRepository = {
  all(): ApprovedSupplier[] {
    return load().suppliers;
  },

  get(id: string): ApprovedSupplier | undefined {
    return load().suppliers.find((s) => s.id === id);
  },

  /** A new line, its ratings full unless given. */
  add(values: Partial<SupplierValues>, actor: string): ApprovedSupplier {
    const store = load();
    const supplier: ApprovedSupplier = { id: generateId("pms"), ...blankSupplierValues(), ...clean(values), updatedAt: new Date().toISOString(), updatedBy: actor };
    save({ ...store, suppliers: [...store.suppliers, supplier] });
    return supplier;
  },

  /** Cells of one line changed. Returns the line as saved, or undefined when it is gone. */
  update(id: string, changes: Partial<SupplierValues>, actor: string): ApprovedSupplier | undefined {
    const store = load();
    let saved: ApprovedSupplier | undefined;
    const suppliers = store.suppliers.map((s) => {
      if (s.id !== id) return s;
      saved = { ...s, ...clean(changes), updatedAt: new Date().toISOString(), updatedBy: actor };
      return saved;
    });
    if (saved) save({ ...store, suppliers });
    return saved;
  },

  remove(id: string): void {
    const store = load();
    const removedSeedIds = isSeedId(id) && !store.removedSeedIds.includes(id) ? [...store.removedSeedIds, id] : store.removedSeedIds;
    save({ ...store, suppliers: store.suppliers.filter((s) => s.id !== id), removedSeedIds, removedIds: [...(store.removedIds ?? []), id] });
  },

  /** Carries out an upload the person has looked over (engine/purchaseMaster.ts planSupplierImport). One save. */
  applyImport(plan: SupplierImportPlan, actor: string): { added: number; updated: number } {
    const store = load();
    const now = new Date().toISOString();
    const updates = new Map(plan.updates.map((u) => [u.supplierId, u]));
    const suppliers = store.suppliers.map((s) => {
      const u = updates.get(s.id);
      if (!u) return s;
      return { ...s, ...Object.fromEntries(u.changes.map((c) => [c.key, c.after])), updatedAt: now, updatedBy: actor };
    });
    const added: ApprovedSupplier[] = plan.additions.map((a) => ({ id: generateId("pms"), ...a.values, updatedAt: now, updatedBy: actor }));
    save({ ...store, suppliers: [...suppliers, ...added] });
    return { added: added.length, updated: updates.size };
  },

  isSeeded(id: string): boolean {
    return isSeedId(id);
  },

  /** The sheet's headings as Purchase typed them over (REQUIREMENTS §189). */
  headings(): Record<string, string> {
    return load().headings ?? {};
  },

  /** A heading typed over; emptied, the list's own heading again. */
  setHeading(key: string, text: string): void {
    const store = load();
    const headings = { ...(store.headings ?? {}) };
    const words = text.replace(/\s+/g, " ").trim();
    if (words) headings[key] = words;
    else delete headings[key];
    save({ ...store, headings });
  },
};
