// THE NUMBER THE SHEET ALREADY GIVES, TAKEN OUT OF TWO SEEDED RECORDS (REQUIREMENTS §102).
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
import type { RecordInstance } from "../types";
import { SEED_HISTORICAL_RECORDS } from "./seed/historicalRecords";
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

/** Brings the seeded records' lines in step with their seeds; returns how many records changed. */
export function alignSeededLineNumbers(): number {
  const updates: RecordInstance[] = [];
  for (const r of recordRepository.snapshot()) {
    const seed = SEEDS.get(r.id);
    if (!seed || r.correction) continue;
    const rows = rowsOf(r.data);
    const seedRows = rowsOf(seed.data);
    if (!rows || !seedRows) continue;
    let changed = false;
    const lines = rows.map((row, i) => {
      const seedRow = seedRows[i];
      if (!seedRow) return row;
      let line: Row | null = null;
      for (const [key, value] of Object.entries(row)) {
        const want = seedRow[key];
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
