import type { LogSheetData, RecordInstance } from "../types";
import { recordRepository } from "./repositories/recordRepository";
import { appendHistory, diffRecordData, historyOf, makeEntry } from "../engine/recordHistory";
import { mayWriteRecordsOf } from "../engine/departmentScope";
import { getLogSheetLayout } from "./seed/logSheetLayouts";
import { TICK, TICK_WORDS, tickCell } from "../engine/cleaningMonth";

// F/HR/15 AND F/HR/16: AN AREA'S BOX IS A TICK (REQUIREMENTS §378). On the sheets still open, a word written for "done" in an
// area's day or month box before the tick ("ok", "done", "yes", "x", a tick typed) reads as the tick, with a line in the sheet's
// history. A name or anything else written stays as written; submitted and verified sheets are not touched. Run again it
// changes nothing.

export const CLEANING_TICK_NOTE = "An area's box is a tick now: what was written for done reads as the tick (REQUIREMENTS §378)";
const DOCS = ["hr-daily-cleaning", "hr-monthly-cleaning"];
const OPEN = ["Scheduled", "Due", "In Progress", "Rejected"];

/** The sheet with its area boxes' "done" words as ticks; null where there is none. */
export function cleaningTicked(r: RecordInstance): LogSheetData | null {
  const layout = DOCS.includes(r.documentId) ? getLogSheetLayout(r.documentId) : undefined;
  const d = r.data as LogSheetData | undefined;
  if (!layout || !d || !Array.isArray(d.rows)) return null;
  const ticking = layout.columns.filter((c) => c.tickOnLinesWith);
  let changed = false;
  const rows = d.rows.map((row) => {
    let next = row;
    for (const c of ticking) {
      if (!tickCell(c, row)) continue;
      const v = String(row[c.key] ?? "").trim();
      if (!v || v === TICK || !TICK_WORDS.test(v)) continue;
      next = { ...next, [c.key]: TICK };
      changed = true;
    }
    return next;
  });
  return changed ? { ...d, rows } : null;
}

/** Every open F/HR/15 and F/HR/16 sheet, once; returns how many changed. */
export function cleaningBoxesTicked(): number {
  if (!DOCS.some((id) => mayWriteRecordsOf(id))) return 0;
  const updates: RecordInstance[] = [];
  for (const r of recordRepository.snapshot()) {
    if (!DOCS.includes(r.documentId) || !OPEN.includes(r.status) || !mayWriteRecordsOf(r.documentId)) continue;
    const data = cleaningTicked(r);
    if (!data) continue;
    const entry = appendHistory({ ...r, history: [] }, makeEntry("edited", "System", { changes: diffRecordData(r.data, data), note: CLEANING_TICK_NOTE })).history![0];
    updates.push({ ...r, data, history: [...historyOf(r), entry] });
  }
  if (updates.length) recordRepository.upsertMany(updates);
  return updates.length;
}
