import type { HrMasterColumnKey, HrMasterPerson } from "../../types";
import { hrMasterSeed, HR_MASTER_SEEDED_BY, HR_MASTER_STAFF_BY } from "../seed/hrMasterSeed";
import { readJSON, readJSONCached, writeJSON } from "../storageAdapter";
import { blankHrMasterValues, HR_MASTER_COLUMNS, namesPerson, sameGp3, type HrMasterValues, type ImportPlan } from "../../engine/hrMaster";
import type { RegisterTake } from "../../engine/hrMasterRegisters";
import { generateId } from "../../utils/id";

// THE HR MASTER SHEET'S STORE (REQUIREMENTS §53) — localStorage key
// "hrMasterData", the same in Live and Demo mode (it is master data, not a
// record). The sheet HR edits is the store; the seed (data/seed/hrMasterSeed.ts)
// is only merged in additively by id, and a seeded line HR deletes stays
// deleted, as with the rest of the master data (masterRepository.ts).

const KEY = "hrMasterData";

interface Store {
  people: HrMasterPerson[];
  removedSeedIds: string[];
  /** Every line removed — so a copy merged with someone else's never brings one back (data/serverSync.ts). */
  removedIds?: string[];
}

let seedIds: Set<string> | null = null;
const SEED_IDS = { has: (id: string) => (seedIds ??= new Set(hrMasterSeed().map((p) => p.id))).has(id) };

// Read once per stored value (REQUIREMENTS §65) — the sheet is 39 KB and every
// HR format that names a person reads it. ensureSeeded and the writers below
// use readJSON and get a copy of their own.
function load(): Store {
  const raw = readJSONCached<Store | null>(KEY, null);
  if (!raw || !Array.isArray(raw.people)) return { people: hrMasterSeed(), removedSeedIds: [] };
  // A line stored before a column existed (Sub Department, Machine / Process Name, §169) has it blank.
  return { people: raw.people.map((p) => ({ ...blankHrMasterValues(), ...p })), removedSeedIds: raw.removedSeedIds ?? [], removedIds: raw.removedIds ?? [] };
}

function save(store: Store): boolean {
  return writeJSON(KEY, store);
}

export function ensureSeeded(): void {
  const raw = readJSON<Store | null>(KEY, null);
  if (!raw || !Array.isArray(raw.people)) {
    save({ people: hrMasterSeed(), removedSeedIds: [] });
    return;
  }
  const ids = new Set(raw.people.map((p) => p.id));
  const removed = new Set(raw.removedSeedIds ?? []);
  const removedAny = new Set(raw.removedIds ?? []);
  const seed = hrMasterSeed();
  // THE STAFF SHEET'S WORD ONTO A SHEET ALREADY KEPT (REQUIREMENTS §169). A line the registers put on the sheet that
  // nobody has touched since (updatedBy still the registers') is the staff sheet's person: it takes the sheet's every
  // column, aliases, sources and notes, under its own id. Any other stored line - one HR wrote on, or added - takes the
  // seed's values into its BLANK boxes only, by id or by name, and nothing HR wrote is changed. A seeded person whose
  // name is already on the sheet is never added a second time.
  let filled = 0;
  const people = raw.people.map((stored) => {
    const from = seed.find((s) => s.id === stored.id) ?? seed.find((s) => namesPerson(s.fullName, stored) || (s.aliases ?? []).some((a) => namesPerson(a, stored)));
    if (!from) return stored;
    if (stored.updatedBy === HR_MASTER_SEEDED_BY && from.updatedBy === HR_MASTER_STAFF_BY) {
      const changed = HR_MASTER_COLUMNS.some(({ key }) => String(stored[key] ?? "") !== String(from[key] ?? ""));
      if (!changed) return stored;
      filled += 1;
      return { ...from, id: stored.id };
    }
    let next = stored;
    for (const { key } of HR_MASTER_COLUMNS) {
      if (!String(stored[key] ?? "").trim() && String(from[key] ?? "").trim()) {
        next = { ...next, [key]: from[key] };
        filled += 1;
      }
    }
    return next;
  });
  const named = (s: HrMasterPerson) => people.some((p) => namesPerson(s.fullName, p) || (s.aliases ?? []).some((a) => namesPerson(a, p)));
  const additions = seed.filter((s) => !ids.has(s.id) && !removed.has(s.id) && !removedAny.has(s.id) && !named(s));
  if (additions.length > 0 || filled > 0) save({ people: [...people, ...additions], removedSeedIds: raw.removedSeedIds ?? [], removedIds: raw.removedIds ?? [] });
}

const clean = (values: Partial<HrMasterValues>): Partial<HrMasterValues> =>
  Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v ?? "").replace(/\s+/g, " ").trim()])) as Partial<HrMasterValues>;

export type UpsertResult = "added" | "updated" | "unchanged";

function addPerson(values: Partial<HrMasterValues>, actor: string): HrMasterPerson {
  const store = load();
  const person: HrMasterPerson = { id: generateId("hrm"), ...blankHrMasterValues(), ...clean(values), updatedAt: new Date().toISOString(), updatedBy: actor };
  save({ ...store, people: [...store.people, person] });
  return person;
}

// A page that opens the sheet already filtered — Search's "Show on the sheet".
let pendingFilter = "";

export const hrMasterRepository = {
  all(): HrMasterPerson[] {
    return load().people;
  },

  get(id: string): HrMasterPerson | undefined {
    return load().people.find((p) => p.id === id);
  },

  add: addPerson,

  /** One cell edited. Returns the line as saved, or undefined when it is gone. */
  update(id: string, key: HrMasterColumnKey, value: string, actor: string): HrMasterPerson | undefined {
    const store = load();
    let saved: HrMasterPerson | undefined;
    const people = store.people.map((p) => {
      if (p.id !== id) return p;
      saved = { ...p, [key]: key === "fullName" || key === "gp3No" || key === "department" || key === "subDepartment" || key === "machine" || key === "designation" ? value.replace(/\s+/g, " ") : value, updatedAt: new Date().toISOString(), updatedBy: actor };
      return saved;
    });
    if (saved) save({ ...store, people });
    return saved;
  },

  remove(id: string): void {
    const store = load();
    const removedSeedIds = SEED_IDS.has(id) && !store.removedSeedIds.includes(id) ? [...store.removedSeedIds, id] : store.removedSeedIds;
    save({ people: store.people.filter((p) => p.id !== id), removedSeedIds, removedIds: [...(store.removedIds ?? []), id] });
  },

  /**
   * THE REGISTERS' WORD TAKEN ONTO THE SHEET (engine/hrMasterRegisters.ts, REQUIREMENTS §161): each fill into a box
   * that is still blank (checked again here: the sheet may have been written since the take was worked out), and
   * each newcomer as a new line with where they came from. One save.
   */
  takeFromRegisters(take: RegisterTake, actor: string): { filled: number; added: number } {
    const store = load();
    const now = new Date().toISOString();
    let filled = 0;
    const people = store.people.map((p) => {
      const mine = take.fills.filter((f) => f.personId === p.id && !String(p[f.key] ?? "").trim());
      if (mine.length === 0) return p;
      filled += mine.length;
      return { ...p, ...Object.fromEntries(mine.map((f) => [f.key, f.after])), updatedAt: now, updatedBy: actor };
    });
    const added: HrMasterPerson[] = take.newcomers
      .filter((n) => n.fullName.trim() && !people.some((p) => namesPerson(n.fullName, p)))
      .map((n) => ({
        id: generateId("hrm"),
        ...blankHrMasterValues(),
        ...clean(n.values),
        fullName: n.fullName.replace(/\s+/g, " ").trim(),
        ...(n.aliases.length ? { aliases: n.aliases } : {}),
        sources: n.sources,
        updatedAt: now,
        updatedBy: actor,
      }));
    if (filled > 0 || added.length > 0) save({ ...store, people: [...people, ...added] });
    return { filled, added: added.length };
  },

  /** Carries out an upload the person has looked over (engine/hrMaster.ts planImport). */
  applyImport(plan: ImportPlan, actor: string): { added: number; updated: number } {
    const store = load();
    const now = new Date().toISOString();
    const updates = new Map(plan.updates.map((u) => [u.personId, u]));
    const people = store.people.map((p) => {
      const u = updates.get(p.id);
      if (!u) return p;
      return { ...p, ...Object.fromEntries(u.changes.map((c) => [c.key, c.after])), updatedAt: now, updatedBy: actor };
    });
    const added = plan.additions.map((a) => ({ id: generateId("hrm"), ...a.values, updatedAt: now, updatedBy: actor }));
    save({ ...store, people: [...people, ...added] });
    return { added: added.length, updated: updates.size };
  },

  /**
   * A person written in from elsewhere — the CV import's new joiner. Matched by
   * GP3 No., else by full name when that line has no GP3 No. of its own; a
   * matched line takes the filled values, an unmatched one is added.
   */
  upsert(values: Partial<HrMasterValues>, actor: string): { person: HrMasterPerson; result: UpsertResult } {
    const v = clean(values);
    const store = load();
    // Matched the way an upload matches (engine/hrMaster.ts planImport): by GP3
    // No.; else by name, and only when that name is one person's.
    let match: HrMasterPerson | undefined;
    if (v.gp3No) {
      match = store.people.find((p) => sameGp3(p.gp3No, v.gp3No));
      if (!match && v.fullName) {
        const unnumbered = store.people.filter((p) => !p.gp3No.trim() && namesPerson(v.fullName, p));
        if (unnumbered.length === 1) match = unnumbered[0];
      }
    } else if (v.fullName) {
      const named = store.people.filter((p) => namesPerson(v.fullName, p));
      if (named.length === 1) match = named[0];
    }
    if (!match) {
      const person = addPerson(v, actor);
      return { person, result: "added" };
    }
    const found = match;
    const changes = HR_MASTER_COLUMNS.map((c) => c.key).filter((k) => v[k] && v[k] !== found[k] && !(k === "gp3No" && sameGp3(v[k], found[k])));
    if (changes.length === 0) return { person: found, result: "unchanged" };
    const person: HrMasterPerson = { ...found, ...Object.fromEntries(changes.map((k) => [k, v[k]])), updatedAt: new Date().toISOString(), updatedBy: actor };
    save({ ...store, people: store.people.map((p) => (p.id === found.id ? person : p)) });
    return { person, result: "updated" };
  },

  isSeeded(id: string): boolean {
    return SEED_IDS.has(id);
  },

  setPendingFilter(query: string): void {
    pendingFilter = query;
  },

  takePendingFilter(): string {
    const q = pendingFilter;
    pendingFilter = "";
    return q;
  },
};

