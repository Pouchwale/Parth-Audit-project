import type { LogSheetData, LogSheetRow } from "../types";
import { addDays } from "../utils/date";

// F/QC/12'S SHEET HAS A LINE FOR EACH WEEK OF ITS MONTH - FOUR OR FIVE (REQUIREMENTS §235; the owner, 16-Nov-2026, with
// November's page - 01-11, 08-11, 15-11, 22-11, Next Due Date 29-11: "every row has denotes 1 week ... some months has five
// week also ... when december month will start then it should start with 29-11-2026"; asked: a week that runs into the
// next month is the sheet's of the month that holds most of its seven days). The sheet's first line starts on the last
// Next Due Date of the sheet before (engine/calibrationWeeks.ts), each line below a week on (engine/nextDueChain.ts); the
// lines are the weeks, from that first date, whose middle day (the 4th of the seven) is in the sheet's month:
//   November 2026  01-11, 08-11, 15-11, 22-11            (29-11's week is mostly December's)
//   December 2026  29-11, 06-12, 13-12, 20-12, 27-12     (five)
//   January 2027   03-01, 10-01, 17-01, 24-01            (31-01's week is mostly February's)
// A line someone has written a reading on is never taken off.

export const SCALE_DOC = "qc-weight-scale-calibration";
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MOST_LINES = 6;

/** The month (YYYY-MM) a week starting on `date` belongs to: the one holding most of its seven days. */
export const weekMonth = (date: string): string => addDays(date, 3).slice(0, 7);

/**
 * The week starts of the sheet for `month` (YYYY-MM), from `first`, a week apart, at most six; none where the first week is
 * not the month's own (a first date far from the month - a sheet long before, a date mistyped): the lines are left as they are.
 */
export function scaleWeeksIn(month: string, first: string): string[] {
  if (!ISO.test(first) || weekMonth(first) !== month) return [];
  const out = [first];
  for (let d = addDays(first, 7); weekMonth(d) <= month && out.length < MOST_LINES; d = addDays(d, 7)) out.push(d);
  return out;
}

/** A line with no reading on it: nothing tested, no Pass / Fail. */
export function unreadScaleLine(row: LogSheetRow): boolean {
  for (let w = 1; w <= 5; w++) if (String(row[`testedValue${w}`] ?? "").trim()) return false;
  return !String(row.passFail ?? "").trim();
}

/**
 * The sheet with a line for each of its month's weeks (`month`: the sheet's own, its due date's), counted from its first
 * line's date - or `first` where none is written yet. Lines are added with `newLine` (as Add Row makes them) or blank ones
 * taken off the foot; null where the sheet already has its weeks, or no first date is known.
 */
export function withScaleWeeks(data: LogSheetData | undefined, month: string, first: string | null, newLine: (rows: LogSheetRow[]) => LogSheetRow): LogSheetData | null {
  if (!data?.rows) return null;
  const start = String(data.rows[0]?.date ?? "").trim() || first || "";
  const want = scaleWeeksIn(month, start).length;
  if (want === 0 || data.rows.length === want) return null;
  const rows = data.rows.slice();
  while (rows.length < want) rows.push(newLine(rows));
  while (rows.length > want && unreadScaleLine(rows[rows.length - 1])) rows.pop();
  return rows.length === data.rows.length ? null : { ...data, rows };
}
