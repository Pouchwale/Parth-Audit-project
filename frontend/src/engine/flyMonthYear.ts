import type { FlyCatcherData } from "../types";
import { MONTH_NAMES, formatMonthYearShort } from "../utils/date";

// F/HR/18'S "MONTH & YEAR" IS THE VISIT'S OWN MONTH (REQUIREMENTS §238; the owner, 16-Nov-2026, with a visit's page
// reading "Nov-26": "when month and year change then according to that it will come so if user open old, current or new
// then it will come name and year accordingly"). A visit is made with its month written there (engine/recordDefaults.ts,
// "Nov-26"); a visit dated into another month takes that month's, where the box still holds a month DCRS wrote ("Nov-26",
// or the demo's "November-26") - words a person wrote there instead stay.

const DCRS_LABEL = new RegExp(`^(${MONTH_NAMES.map((m) => m.slice(0, 3)).join("|")})[a-z]*-\\d{2}$`, "i");

/** The Month & Year a visit due on `dueDate` is headed with: "Dec-26". */
export const visitMonthYear = (dueDate: string): string => formatMonthYearShort(Number(dueDate.slice(0, 4)), Number(dueDate.slice(5, 7)) - 1);

/** The visit's data with its Month & Year its date's, where the box is blank or holds a month DCRS wrote; null where it already does or a person wrote it. */
export function withVisitMonthYear(data: FlyCatcherData | undefined, dueDate: string): FlyCatcherData | null {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null;
  const want = visitMonthYear(dueDate);
  const have = String(data.monthYear ?? "").trim();
  if (have === want || (have !== "" && !DCRS_LABEL.test(have))) return null;
  return { ...data, monthYear: want };
}
