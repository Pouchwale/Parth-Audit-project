// THE NUMBER THE SHEET ALREADY GIVES, TAKEN OUT OF THE RECORDS THAT STORED IT (REQUIREMENTS §102).
//
// Second pass, 9-Oct-2026 (the owner: "still in the starting of any question there are number
// present"): the phone, Mitra and the record's history read what a record STORES, not the sheet
// as drawn. So every record whose printed line holds exactly the layout's words with that line's
// own number in front (F/HR/19, 20 and 21 made before the layouts changed) takes the words, and so
// does a minutes record (F/QC/30) whose point is exactly a sample point with its number in front,
// copied there by the sample fill or from the record before. Demo Mode's records are left as made.
//
// Two of the plant's own records on file were transcribed with each line's
// number in its words, beside the sheet's Sr. No.: the 07.06.2022 minutes with
// Gangwal Healthcare (F/QC/30, "1.Anilox line issue ...") and the January-2026
// Product Safety Culture analysis (F/HR/21, "1. I can freely speak up ...").
// Their seeds no longer carry the number (data/seed/qcReportLayouts.ts,
// data/seed/hrRecords.ts); a copy stored before takes the line's words without
// it. Only a cell that is exactly its seed's words with that line's own number
// in front is changed, with ONE line in the record's history saying why; its
// status, signatures and updatedAt stay as they were (upsertMany), as with
// every start-up clean-up, and a record reopened for correction is left alone.
// Run on every start by data/bootstrap.ts: nothing to do, nothing written.
import type { LogSheetLayout, RecordInstance } from "../types";
import { SEED_HISTORICAL_RECORDS } from "./seed/historicalRecords";
import { getLogSheetLayoutForRecord } from "./seed/logSheetLayouts";
import { MINUTES_GANGWAL_POINTS } from "./seed/qcReportLayouts";
import { recordRepository } from "./repositories/recordRepository";
import { appendHistory, diffRecordData, historyOf, makeEntry } from "../engine/recordHistory";
import { withoutLineNumber } from "../engine/lineNumbers";

/** What each changed record's history says. */
export const LINE_NUMBER_NOTE = "Each line's own number taken out of its words: the sheet's Sr. No. numbers the lines (REQUIREMENTS §102)";

type Row = Record<string, unknown>;

/** A grid's lines, or null when the data is not a grid. */
function rowsOf(data: unknown): Row[] | null {
  if (!data || typeof data !== "object") return null;
  const rows = (data as { rows?: unknown }).rows;
  return Array.isArray(rows) && rows.every((r) => !!r && typeof r === "object") ? (rows as Row[]) : null;
}

const SEEDS = new Map(SEED_HISTORICAL_RECORDS.map((r) => [r.id, r]));

/** The words each line of `r` should hold, by line and key, where the record's own may carry the line's number; null when none. */
function wordsFor(r: RecordInstance): ((i: number, key: string) => string | undefined) | null {
  const seed = SEEDS.get(r.id);
  const seedRows = seed ? rowsOf(seed.data) : null;
  if (seedRows) return (i, key) => (typeof seedRows[i]?.[key] === "string" ? (seedRows[i][key] as string) : undefined);
  if (r.isDemo) return null;
  if (r.documentId === "qc-minutes-of-meetings") return (i, key) => (key === "keyPointsDiscussed" ? MINUTES_GANGWAL_POINTS[i]?.keyPointsDiscussed : undefined);
  const layout: LogSheetLayout | undefined = getLogSheetLayoutForRecord(r.documentId, r);
  if (!layout || layout.rowMode.kind !== "fixedRows" || layout.ownLineNumbers) return null;
  const printed = layout.rowMode.rows;
  const fixed = new Set(layout.columns.filter((c) => c.fixed).map((c) => c.key));
  return (i, key) => (fixed.has(key) && typeof printed[i]?.[key] === "string" ? (printed[i][key] as string) : undefined);
}

/** Brings the seeded records' lines in step with their seeds; returns how many records changed. */
export function alignSeededLineNumbers(): number {
  const updates: RecordInstance[] = [];
  for (const r of recordRepository.snapshot()) {
    if (r.correction) continue;
    const words = wordsFor(r);
    if (!words) continue;
    const rows = rowsOf(r.data);
    if (!rows) continue;
    let changed = false;
    const lines = rows.map((row, i) => {
      let line: Row | null = null;
      for (const [key, value] of Object.entries(row)) {
        const want = words(i, key);
        if (typeof value !== "string" || typeof want !== "string" || value === want) continue;
        if (withoutLineNumber(value, i + 1) !== want) continue;
        line = line ?? { ...row };
        line[key] = want;
      }
      if (line) changed = true;
      return line ?? row;
    });
    if (!changed) continue;
    const data = { ...(r.data as object), rows: lines } as RecordInstance["data"];
    // A line of its own, never folded into a change another start-up clean-up made a moment before.
    const entry = appendHistory({ ...r, history: [] }, makeEntry("edited", "System", { changes: diffRecordData(r.data, data), note: LINE_NUMBER_NOTE })).history![0];
    updates.push({ ...r, data, history: [...historyOf(r), entry] });
  }
  if (updates.length) recordRepository.upsertMany(updates);
  return updates.length;
}
