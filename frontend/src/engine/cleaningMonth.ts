import type { LogColumn, LogSheetRow } from "../types";

// F/HR/15 AND F/HR/16: A TICK IN A DAY'S OR A MONTH'S BOX, AND THE DAYS THE SHEET'S MONTH HAS (REQUIREMENTS §378; the owner,
// 25-Nov-2026: "give tick mark and the days should come according to the month of the days like November has 30 days").
//
// * An area's box takes a tick, one click to put it and one to take it off (the column's tickOnLinesWith: the numbered area
//   lines). The lines with no number - F/HR/15's "Cleaning done by" / "Cleaning verified by", F/HR/16's Date line and its
//   "Cleaning verified by" - stay written boxes for a name or a date.
// * F/HR/15 is drawn with the days of its month: 28, 29, 30 or 31 columns, the month read from its "Month & Year" box when that
//   names one, else the sheet's own month (its due date).

export const TICK = "✓";

/** A box of this line is a tick box: its column ticks, and the line is one of the paper's numbered area lines. */
export const tickCell = (col: LogColumn, row: LogSheetRow | Record<string, unknown> | undefined): boolean =>
  !!col.tickOnLinesWith && !!row && String(row[col.tickOnLinesWith] ?? "").trim() !== "";

/** A word a person wrote for "done" in a day's box before the tick: read as the tick. */
export const TICK_WORDS = /^(?:✓|✔|☑|√|✅|x|tick|ok|okay|done|yes|y|1|true)$/i;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const fullYear = (y: string): number => (y.length <= 2 ? 2000 + Number(y) : Number(y));

/** The month a "Month & Year" box names: "November 2026", "Nov-26", "11/2026", "2026-11", "11.2026"; null when it names none. */
export function monthNamed(text: unknown): { year: number; month: number } | null {
  const t = String(text ?? "").trim().toLowerCase();
  if (!t) return null;
  const word = /([a-z]{3,})[a-z]*\.?[\s,'/-]*(\d{4}|\d{2})\b/.exec(t);
  if (word) {
    const m = MONTHS.indexOf(word[1].slice(0, 3));
    if (m >= 0) return { year: fullYear(word[2]), month: m + 1 };
  }
  const yFirst = /\b(\d{4})[\s./-](\d{1,2})\b/.exec(t);
  if (yFirst && Number(yFirst[2]) >= 1 && Number(yFirst[2]) <= 12) return { year: Number(yFirst[1]), month: Number(yFirst[2]) };
  const mFirst = /\b(\d{1,2})[\s./-](\d{4}|\d{2})\b/.exec(t);
  if (mFirst && Number(mFirst[1]) >= 1 && Number(mFirst[1]) <= 12) return { year: fullYear(mFirst[2]), month: Number(mFirst[1]) };
  return null;
}

/** How many days the sheet's month has: its "Month & Year" when that names a month, else its due date's month; 31 when neither. */
export function daysOfSheet(monthYear: unknown, dueDate: string | undefined): number {
  const named = monthNamed(monthYear);
  const due = /^(\d{4})-(\d{2})/.exec(dueDate ?? "");
  const at = named ?? (due ? { year: Number(due[1]), month: Number(due[2]) } : null);
  return at ? new Date(Date.UTC(at.year, at.month, 0)).getUTCDate() : 31;
}
