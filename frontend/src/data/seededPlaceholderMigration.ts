// A BOX DCRS COULD NOT READ, AS THE PAPER'S BLANK BOX, IN THE RECORDS THAT STORED DCRS'S MARK (REQUIREMENTS §111 part 6).
//
// The 31.12.2024 F/QC/11 page on file was transcribed with "TO BE CONFIRMED" in its Serial No, a scribble on the
// scan. It printed on the page, and, the Serial No being a standing box, the morning prepare and the sample fill
// carried it onto every new F/QC/11 sheet. The seed now leaves the box blank, as the paper's box is
// (data/seed/qcCalibrationLayouts.ts GSM_HEADER), and nothing carries the mark any more (engine/observations.ts
// isPlaceholder). A copy stored before takes the seed's blank: only a box of a seeded record that holds exactly
// "TO BE CONFIRMED" where its seed now holds something else is changed, with ONE line in the record's history
// saying why; its status, signatures and updatedAt stay as they were (upsertMany), as with every start-up clean-up,
// and a record reopened for correction is left alone. Run on every start by data/bootstrap.ts: nothing to do,
// nothing written.
import type { RecordInstance } from "../types";
import { SEED_HISTORICAL_RECORDS } from "./seed/historicalRecords";
import { recordRepository } from "./repositories/recordRepository";
import { appendHistory, diffRecordData, historyOf, makeEntry } from "../engine/recordHistory";
import { isPlaceholder } from "../engine/observations";

/** What each changed record's history says. */
export const PLACEHOLDER_NOTE = "DCRS's \"TO BE CONFIRMED\" taken out of a box the paper leaves blank (REQUIREMENTS §111)";

const SEEDS = new Map(SEED_HISTORICAL_RECORDS.map((r) => [r.id, r]));

const headerOf = (data: unknown): Record<string, unknown> | null => {
  const header = data && typeof data === "object" ? (data as { header?: unknown }).header : null;
  return header && typeof header === "object" ? (header as Record<string, unknown>) : null;
};

/** Brings the seeded records' boxes that hold DCRS's mark in step with their seeds; returns how many records changed. */
export function alignSeededPlaceholders(): number {
  const updates: RecordInstance[] = [];
  for (const r of recordRepository.snapshot()) {
    if (r.correction) continue;
    const seed = SEEDS.get(r.id);
    const seedHeader = seed ? headerOf(seed.data) : null;
    const header = headerOf(r.data);
    if (!seedHeader || !header) continue;
    let next: Record<string, unknown> | null = null;
    for (const [key, value] of Object.entries(header)) {
      const want = seedHeader[key];
      if (!isPlaceholder(value) || typeof want !== "string" || isPlaceholder(want)) continue;
      next = next ?? { ...header };
      next[key] = want;
    }
    if (!next) continue;
    const data = { ...(r.data as object), header: next } as RecordInstance["data"];
    const entry = appendHistory({ ...r, history: [] }, makeEntry("edited", "System", { changes: diffRecordData(r.data, data), note: PLACEHOLDER_NOTE })).history![0];
    updates.push({ ...r, data, history: [...historyOf(r), entry] });
  }
  if (updates.length) recordRepository.upsertMany(updates);
  return updates.length;
}
