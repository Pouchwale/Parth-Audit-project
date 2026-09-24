import type { MasterData } from "../../types";
import { SEED_MASTER_DATA } from "../seed/masterData";
import { RETIRED_DOCUMENT_IDS } from "../seed/documentDefinitions";
import { readJSON, readJSONCached, writeJSON } from "../storageAdapter";

const KEY = "master";

// Read once per stored value, like the documents list (REQUIREMENTS §65): this
// is asked fifty-three times over a screen. Read-only — ensureSeeded and
// update() use readJSON and get a copy of their own to change.
function load(): MasterData {
  return readJSONCached<MasterData>(KEY, SEED_MASTER_DATA);
}
function save(data: MasterData): void {
  writeJSON(KEY, data);
}

// Master data IS user-editable (Master Data screen), so unlike documents it
// can't simply be overwritten from the seed. Instead, new seed rows are
// merged in additively by id: an employee / holiday / chemical the seed
// knows about but the stored copy doesn't gets added, everything the admin
// already has (including their edits to seeded rows) is left alone, and
// role-keyword defaults are only filled in for documents that have no entry
// yet. That's how an existing install gains the lamination staff and the
// new documents' reminder assignments without losing local changes.
/**
 * Seeded employee lines the seed has since corrected from the company's own
 * papers, each with the role the OLD seed gave it. Only a stored line still
 * reading exactly that is updated (see ensureSeeded).
 */
const SEED_CORRECTIONS: { id: string; fromRole: string }[] = [
  // §68: Chirag Parmar is Purchase Manager on F/HR/01, not only a trainee.
  { id: "emp-chirag", fromRole: "Staff — pest control awareness trainee" },
  // §74: Mukesh Patel is "Manager - Mentainance" on F/HR/01 and F/HR/13.
  { id: "emp-mukesh", fromRole: "Staff — pest control awareness trainee" },
];

export function ensureSeeded(): void {
  const raw = readJSON<MasterData | null>(KEY, null as unknown as MasterData);
  if (!raw) {
    save(SEED_MASTER_DATA);
    return;
  }
  let changed = false;
  // Seed rows an admin deliberately deleted (Master Data → Holidays) stay
  // deleted — otherwise the additive merge would resurrect them every boot.
  const removed = new Set(raw.removedSeedIds ?? []);
  const mergeById = <T extends { id: string }>(current: T[] | undefined, seed: T[]): T[] => {
    const list = current ?? [];
    const ids = new Set(list.map((x) => x.id));
    const additions = seed.filter((x) => !ids.has(x.id) && !removed.has(x.id));
    if (additions.length > 0) changed = true;
    return additions.length ? [...list, ...additions] : list;
  };
  const next: MasterData = {
    ...raw,
    employees: mergeById(raw.employees, SEED_MASTER_DATA.employees),
    chemicals: mergeById(raw.chemicals, SEED_MASTER_DATA.chemicals),
    holidays: mergeById(raw.holidays, SEED_MASTER_DATA.holidays),
    areas: mergeById(raw.areas, SEED_MASTER_DATA.areas),
    pcLocations: mergeById(raw.pcLocations, SEED_MASTER_DATA.pcLocations),
    serviceTypeChemicals: mergeById(raw.serviceTypeChemicals, SEED_MASTER_DATA.serviceTypeChemicals),
    rodentStations: raw.rodentStations ?? [],
    checkpoints: raw.checkpoints?.length ? raw.checkpoints : SEED_MASTER_DATA.checkpoints,
    documentRoleKeywords: { ...raw.documentRoleKeywords },
    // Working-calendar fields added later: the weekly off defaults from the
    // seed (Thursday) only when the stored copy has never set one; adjustment
    // days merge additively like every other list.
    weeklyOffDay: raw.weeklyOffDay ?? SEED_MASTER_DATA.weeklyOffDay,
    adjustmentDays: mergeById(raw.adjustmentDays, SEED_MASTER_DATA.adjustmentDays ?? []),
  };
  if (raw.weeklyOffDay === undefined && SEED_MASTER_DATA.weeklyOffDay !== undefined) changed = true;
  // A SEEDED LINE THE SEED ITSELF HAS SINCE CORRECTED (REQUIREMENTS §74). The
  // merge above adds what is missing and never touches what is there — right
  // for an admin's own edits, wrong for a line the seed got wrong and later put
  // right from the company's own papers: that correction would reach a fresh
  // install and never the plant's. So a stored line is brought up to the seed
  // only while it still reads EXACTLY as the old seed wrote it; one anybody has
  // since edited is theirs, and is left alone.
  for (const fix of SEED_CORRECTIONS) {
    const i = next.employees.findIndex((e) => e.id === fix.id && e.role === fix.fromRole);
    const to = SEED_MASTER_DATA.employees.find((e) => e.id === fix.id);
    if (i >= 0 && to) {
      next.employees = next.employees.map((e, j) => (j === i ? { ...e, role: to.role, department: to.department } : e));
      changed = true;
    }
  }
  for (const [docId, keyword] of Object.entries(SEED_MASTER_DATA.documentRoleKeywords)) {
    if (next.documentRoleKeywords[docId] === undefined) {
      next.documentRoleKeywords[docId] = keyword;
      changed = true;
    }
  }
  // A retired document's reminder assignment has nothing left to point at.
  for (const docId of RETIRED_DOCUMENT_IDS) {
    if (next.documentRoleKeywords[docId] !== undefined) {
      delete next.documentRoleKeywords[docId];
      changed = true;
    }
  }
  if (changed) save(next);
}

export const masterRepository = {
  get(): MasterData {
    return load();
  },
  update(patch: Partial<MasterData>): MasterData {
    const next = { ...load(), ...patch };
    save(next);
    return next;
  },
  resetToSeed(): void {
    save(SEED_MASTER_DATA);
  },
};
