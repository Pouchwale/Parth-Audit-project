import type { LogSheetData, LogSheetRow } from "../types";
import { getLogSheetLayout } from "../data/seed/logSheetLayouts";
import { addDays } from "../utils/date";

// THE WEEKS OF A MONTHLY CALIBRATION PAGE FOLLOW ONE ANOTHER (the owner, 29-Oct-2026, REQUIREMENTS §145, on F/QC/12:
// "user fill date in first row ... next date should be after 6 day and 7th day date will be enter over there and in
// next second new row it will take old date and start"). On a layout with `nextDueChain`:
//   * the person writes the first line's date - the system never decides it;
//   * a line's Next Due Date is its date + `days` where none is written;
//   * the line below starts on that Next Due Date where it has no date of its own;
//   * a date changed later moves what the chain had written from it - the line's Next Due Date, the next line's date,
//     and on down - while a date a person typed differently is kept.
// Run with every save (engine/computedCells.ts): `before` is the sheet as it stood, where the caller has it, so a change
// is followed; without it the chain only fills what is blank.

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isoOf = (v: unknown): string => {
  const s = String(v ?? "").trim();
  return ISO.test(s) ? s : "";
};
const textOf = (v: unknown): string => String(v ?? "").trim();

export function withNextDueChain<T>(documentId: string | undefined, data: T, before?: unknown): T {
  const chain = documentId ? getLogSheetLayout(documentId)?.nextDueChain : undefined;
  const sheet = data as unknown as LogSheetData;
  if (!chain || !sheet || !Array.isArray(sheet.rows) || sheet.rows.length === 0) return data;
  const { dateKey, nextKey, days } = chain;
  const beforeRows = Array.isArray((before as LogSheetData | undefined)?.rows) ? (before as LogSheetData).rows : [];
  const was = new Map(beforeRows.map((r) => [r.id, r] as const));
  const rows: LogSheetRow[] = sheet.rows.map((r) => ({ ...r }));
  let changed = false;
  const put = (row: LogSheetRow, key: string, value: string) => {
    if (textOf(row[key]) === value) return;
    row[key] = value;
    changed = true;
  };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const old = was.get(row.id);
    const date = isoOf(row[dateKey]);
    if (date) {
      const due = textOf(row[nextKey]);
      const oldDate = old ? isoOf(old[dateKey]) : "";
      // Blank: a week on. Still the chain's figure from the date as it was (untouched by this change): it moves with it.
      if (!due) put(row, nextKey, addDays(date, days));
      else if (old && oldDate && oldDate !== date && due === textOf(old[nextKey]) && due === addDays(oldDate, days)) put(row, nextKey, addDays(date, days));
    }
    const below = rows[i + 1];
    const due = isoOf(row[nextKey]);
    if (!below || !due) continue;
    const belowDate = textOf(below[dateKey]);
    const oldDue = old ? isoOf(old[nextKey]) : "";
    const belowOld = was.get(below.id);
    // The next line starts on this one's Next Due Date: where it has none, or still holds the one this line had.
    if (!belowDate) put(below, dateKey, due);
    else if (oldDue && oldDue !== due && belowOld && belowDate === textOf(belowOld[dateKey]) && belowDate === oldDue) put(below, dateKey, due);
  }
  return changed ? ({ ...sheet, rows } as unknown as T) : data;
}
