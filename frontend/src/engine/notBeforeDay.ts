import type { DocumentDefinition, RecordInstance } from "../types";
import { addDays, compareISO, todayISO } from "../utils/date";

// NOT BEFORE ITS DAY (REQUIREMENTS §201; the owner, 7-Nov-2026, with the F/HR/18 register on the screen showing a fly
// count against the visit of 16-11-2026 on the 7th: "make sure the third column which is files catch count approx is not
// filled before that particular date and user should get notification in reminder as well as notification and this
// applies to all the documents of every modules").
//
// A LIVE RECORD IS WRITTEN FROM THE FIRST DAY IT COVERS, AND NOT BEFORE: a day's record, a visit's, a weekly or an
// as-required one from its due date; a sheet that covers a month, a quarter, a half-year or a year from that period's
// first day, since it is filled as the period goes (a year-long sheet from the first of its twelve months, as
// engine/recordGenerator.ts filingStart counts them; a sheet drawn up ahead of its year - madeAheadDays - from that many
// days before). Until then the record's page shows the sheet read only and names the day it waits for; F/HR/18's register
// keeps a future visit's line blank and locked; Mitra's tools say the same. On the day the bell reminds (engine/
// reminders.ts: due today) and the phone is told (engine/notificationPlan.ts: upcoming, then due), as for every record.
// A demo record is a demo's sample data, filled through the year (engine/sampleFill.ts): it never waits. Import-free
// but for the dates, so every page and every tool reads the one rule.

type Schedule = DocumentDefinition["schedule"];
type Doc = Pick<DocumentDefinition, "schedule" | "yearLong" | "madeAheadDays">;

const first = (year: number, month1: number): string => `${year}-${String(month1).padStart(2, "0")}-01`;

/** The first day of the period of `months` months, anchored at `anchor` (0-11), that holds `due`. */
function periodFirst(due: string, months: number, anchor: number): string {
  const y = Number(due.slice(0, 4));
  const m0 = Number(due.slice(5, 7)) - 1;
  const back = (((m0 - anchor) % months) + months) % months;
  let sm = m0 - back;
  let sy = y;
  if (sm < 0) {
    sm += 12;
    sy -= 1;
  }
  return first(sy, sm + 1);
}

/** The first of the twelve months a year-long sheet due on `due` covers (recordGenerator.ts filingStart, kept import-free here). */
function yearLongStart(due: string): string {
  const y = Number(due.slice(0, 4));
  const m = Number(due.slice(5, 7));
  return first(m === 12 ? y : y - 1, m === 12 ? 1 : m + 1);
}

/** The first day a record of this document may be written: its due date, or the first day of the period it covers. */
export function writableFrom(doc: Doc | null | undefined, record: Pick<RecordInstance, "dueDate">): string {
  const due = String(record.dueDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return due;
  const s: Schedule | undefined = doc?.schedule;
  let from = due;
  if (s?.type === "monthly") from = periodFirst(due, 1, 0);
  else if (s?.type === "quarterly") from = periodFirst(due, 3, s.anchorMonth);
  else if (s?.type === "half-yearly") from = periodFirst(due, 6, s.anchorMonth);
  else if (s?.type === "yearly") from = doc?.yearLong ? yearLongStart(due) : periodFirst(due, 12, s.month);
  if (doc?.madeAheadDays) from = addDays(from, -doc.madeAheadDays);
  return compareISO(from, due) < 0 ? from : due;
}

/**
 * The day a live record waits for before it may be written - or null: it may be written today (its day has come, or it
 * is a demo record).
 */
export function waitsUntil(doc: Doc | null | undefined, record: Pick<RecordInstance, "dueDate" | "isDemo"> | null | undefined, today: string = todayISO()): string | null {
  if (!record || record.isDemo) return null;
  const from = writableFrom(doc, record);
  return from && compareISO(from, today) > 0 ? from : null;
}
