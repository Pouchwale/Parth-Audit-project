import type { LogSheetData, LogSheetRow, RecordInstance } from "../types";
import { recordRepository } from "./repositories/recordRepository";
import { getLogSheetLayoutForRecord } from "./seed/logSheetLayouts";
import { appendHistory, diffRecordData, historyOf, makeEntry } from "../engine/recordHistory";
import { mayWriteRecordsOf } from "../engine/departmentScope";
import { withComputedCells } from "../engine/computedCells";
import { onStandardWeights, SCALE_WEEKS_NOTE } from "../engine/nominalFill";
import { newRow } from "../engine/recordLines";
import { previousNextDue } from "../engine/calibrationWeeks";
import { SCALE_DOC, unreadScaleLine, weekMonth, withScaleWeeks } from "../engine/scaleWeeks";
import { generateId } from "../utils/id";

/** What each changed sheet's history says. */
export { SCALE_WEEKS_NOTE };

const OPEN: ReadonlySet<string> = new Set(["Scheduled", "Due", "In Progress", "Rejected"]);

/**
 * The sheet's lines fitted to its month's weeks (engine/scaleWeeks.ts): a line added as Add Row adds one (on the fixed
 * weights; `line` may fill it further, in the opener's name), or a blank one taken off the foot, the dates following on.
 * Null where the sheet already has its weeks.
 */
export function scaleSheetFitted(record: RecordInstance, data: LogSheetData | undefined = record.data as LogSheetData | undefined, line: (row: LogSheetRow, data: LogSheetData) => LogSheetRow = (row) => row): LogSheetData | null {
  if (record.documentId !== SCALE_DOC || !data) return null;
  const layout = getLogSheetLayoutForRecord(SCALE_DOC, record);
  if (!layout) return null;
  const month = record.dueDate.slice(0, 7);
  const last = previousNextDue(SCALE_DOC, record);
  // A sheet nobody has read a weight on starts on the last sheet's Next Due Date (December 2026 on 29-11): one dated
  // otherwise - opened before the sheet before had its last week - is dated again from it, its lines following on.
  let sheet = data;
  if (last && weekMonth(last) === month && sheet.rows.length > 0 && sheet.rows.every(unreadScaleLine) && String(sheet.rows[0].date ?? "").trim() !== last) {
    sheet = { ...sheet, rows: sheet.rows.map((r, i) => ({ ...r, date: i === 0 ? last : "", nextDueDate: "" })) };
  }
  const fitted = withScaleWeeks(sheet, month, last, (rows) => line(onStandardWeights(newRow(layout, rows, generateId("row"))), sheet)) ?? (sheet !== data ? sheet : null);
  return fitted ? withComputedCells(SCALE_DOC, fitted) : null;
}

/** Every open F/QC/12 sheet with a line for each week of its month; returns how many sheets changed. Runs at every start. */
export function scaleWeeksOnOpenSheets(): number {
  if (!mayWriteRecordsOf(SCALE_DOC)) return 0;
  const updates: RecordInstance[] = [];
  for (const r of recordRepository.snapshot()) {
    if (r.documentId !== SCALE_DOC || r.isDemo || r.correction || !OPEN.has(r.status)) continue;
    const data = scaleSheetFitted(r);
    if (!data) continue;
    const entry = appendHistory({ ...r, history: [] }, makeEntry("edited", "System", { changes: diffRecordData(r.data, data), note: SCALE_WEEKS_NOTE })).history![0];
    updates.push({ ...r, data, history: [...historyOf(r), entry] });
  }
  if (updates.length) recordRepository.upsertMany(updates);
  return updates.length;
}
