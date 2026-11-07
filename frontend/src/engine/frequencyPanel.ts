import type { DocumentDefinition, Frequency } from "../types";
import { departmentOfDocument, PLANT_DEPARTMENTS } from "../data/seed/documentDepartments";
import { isBossSignedIn, mayDo } from "./departmentScope";

// THE FREQUENCY PANEL (REQUIREMENTS §163; the owner, 2-Nov-2026: "give the super admin a panel called Frequency in
// which all the documents of all modules are listed, so the super admin can set the frequency of each and every
// document — daily, weekly, monthly, half-yearly, yearly"). One page, every document that holds records, grouped by
// module in the master list's order, each with the same picker Master Data's Documents tab carries (§143) — so the
// frequency set here and the one set there are one setting (Master Data's scheduleOverrides). Half-yearly joined the
// frequencies for it (types/common.ts, engine/frequencyEngine.ts).

export interface FrequencyModule {
  code: string;
  name: string;
  docs: DocumentDefinition[];
}

/** The order the frequencies are counted and offered in. */
export const FREQUENCY_ORDER: readonly Frequency[] = ["Daily", "Weekly", "Fortnightly", "Monthly", "Quarterly", "Half-yearly", "Yearly", "As Required", "Custom"];

/**
 * THE DOCUMENTS WHOSE FREQUENCY THIS PERSON MAY SET (REQUIREMENTS §202; the owner, 7-Nov-2026: "give option in frequency
 * so user can add manually frequency of all the document of which he is responsible"): every scheduled document for the
 * super admin; for anybody else, the scheduled documents they may fill - the ones they answer for. The server keeps the
 * same line (backend/storageRoutes.ts withStoredMaster).
 */
export function frequencyDocsFor(docs: readonly DocumentDefinition[], boss: boolean = isBossSignedIn()): DocumentDefinition[] {
  const scheduled = docs.filter((d) => !d.isReferenceOnly);
  return boss ? scheduled : scheduled.filter((d) => mayDo(d.id, "fill"));
}

/**
 * Every document that holds records, by module in the master list's order (System first, Dispatch last), each
 * module's documents in the catalogue's order. A document of no module goes under "Other". Reference documents
 * (kept as issued, never scheduled) are left out.
 */
export function frequencyModules(docs: readonly DocumentDefinition[]): FrequencyModule[] {
  const byCode = new Map<string, DocumentDefinition[]>();
  for (const d of docs) {
    if (d.isReferenceOnly) continue;
    const code = departmentOfDocument(d.id, d.formatNo) ?? "OTHER";
    byCode.set(code, [...(byCode.get(code) ?? []), d]);
  }
  const out: FrequencyModule[] = [];
  for (const dept of PLANT_DEPARTMENTS) {
    const list = byCode.get(dept.code);
    if (list?.length) out.push({ code: dept.code, name: dept.name, docs: list });
    byCode.delete(dept.code);
  }
  for (const [code, list] of byCode) out.push({ code, name: code === "OTHER" ? "Other" : code, docs: list });
  return out;
}

/** How many documents fall due at each frequency, in FREQUENCY_ORDER; a frequency nobody has is left out. */
export function frequencyCounts(docs: readonly DocumentDefinition[]): { frequency: Frequency; count: number }[] {
  const counts = new Map<Frequency, number>();
  for (const d of docs) if (!d.isReferenceOnly) counts.set(d.frequency, (counts.get(d.frequency) ?? 0) + 1);
  return FREQUENCY_ORDER.filter((f) => counts.has(f)).map((frequency) => ({ frequency, count: counts.get(frequency)! }));
}

/** The documents whose number, name or frequency holds the words typed. */
export function frequencySearch(docs: readonly DocumentDefinition[], query: string): DocumentDefinition[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...docs];
  return docs.filter((d) => `${d.formatNo} ${d.name} ${d.frequency}`.toLowerCase().includes(q));
}
