import type { LogSheetData, LogSheetRow } from "../types";

// THE BREAKDOWN MINUTES ON F/MNT/06 ARE WORKED OUT, NOT TYPED (REQUIREMENTS
// §74). The Equipments Breakdown Maintenance Record prints the moment a machine
// failed (FAILURE DATE, FAILURE TIME) and the moment it was running again
// (REPAIRED DATE, REPAIRED TIME), and then asks for the TOTAL BREAKDOWN MINUTES
// between the two. That is arithmetic, so it is done here, on the data, the way
// the purchase registers work out their ratings (engine/purchaseRatings.ts) and
// the calibration records their deviations (engine/calibration.ts): the figure
// is the same whoever wrote the times — a technician typing into the register,
// Mitra filling it, sample data or the demo year — and it is the figure the
// maintenance insights add up into downtime, MTTR and MTBF.
//
// The two moments are read as wall-clock times on the plant's own calendar and
// subtracted as such (Date.UTC on both), so the answer never moves with the
// time zone of the computer that happens to open the sheet, and a breakdown
// that runs past midnight or across the end of a month counts every minute.
//
// This file imports no seed layout, so any layout may import it to work out a
// specimen row without an import cycle.

/** The document id of F/MNT/06, the breakdown register this works on. */
export const BREAKDOWN_RECORD_ID = "mnt-breakdown-record";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
// "08:30", and "08:30:00" from a time box that carries seconds; the seconds are
// not something the paper records, so they are not counted.
const CLOCK_TIME = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;

/** A written date and time as minutes-precise milliseconds, or null when either cannot be read as a real moment. */
function moment(date: unknown, time: unknown): number | null {
  const d = String(date ?? "").trim().match(ISO_DATE);
  const t = String(time ?? "").trim().match(CLOCK_TIME);
  if (!d || !t) return null;
  const year = Number(d[1]);
  const month = Number(d[2]);
  const day = Number(d[3]);
  const hour = Number(t[1]);
  const minute = Number(t[2]);
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59) return null;
  const ms = Date.UTC(year, month - 1, day, hour, minute);
  // Date.UTC quietly rolls 31-Apr over into 1-May; a date the calendar does not
  // have is a mistake in what was written, not a moment to count from.
  const back = new Date(ms);
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) return null;
  return ms;
}

/**
 * The minutes from failure to repair, signed: negative when the repair is
 * written as earlier than the failure. Null when any of the four is missing or
 * unreadable. For the insights, which flag a negative span as a mistake in the
 * register rather than silently dropping it.
 */
export function breakdownSpanMinutes(failureDate: unknown, failureTime: unknown, repairedDate: unknown, repairedTime: unknown): number | null {
  const failed = moment(failureDate, failureTime);
  const repaired = moment(repairedDate, repairedTime);
  if (failed === null || repaired === null) return null;
  return Math.round((repaired - failed) / 60000);
}

/**
 * TOTAL BREAKDOWN MINUTES as the register holds it: whole minutes as text
 * ("95"), or "" while any of the four is not written yet or cannot be read. A
 * repair written before its failure is "" too — the sheet does not print a
 * negative downtime; the insights engine flags that line separately.
 */
export function breakdownMinutes(failureDate: unknown, failureTime: unknown, repairedDate: unknown, repairedTime: unknown): string {
  const minutes = breakdownSpanMinutes(failureDate, failureTime, repairedDate, repairedTime);
  return minutes === null || minutes < 0 ? "" : String(minutes);
}

/** F/MNT/06's one formula cell for one line, worked out from the four moments written on it. */
export function breakdownCells(row: Record<string, string | number | null>): Record<string, string> {
  return { totalBreakdownMinutes: breakdownMinutes(row.failureDate, row.failureTime, row.repairedDate, row.repairedTime) };
}

// F/MNT/05 SLIP (1) — THE BREAKDOWN MINUTES ON ONE SLIP (REQUIREMENTS §82). The
// Breakdown Maintenance Memo & Post Maintenance Hygiene Record prints the
// "Date / Time of Breakdown Intimation" at its head and the "Date / Time of
// Breakdown repair" at its foot, then "Breakdown minutes : -". The same
// arithmetic as the register's, on the slip's four boxes: whole minutes as
// text, "" while any of the four is missing or the repair is written before
// the intimation. (Slip (2) prints no minutes box, so nothing is worked out on it.)

/** The document id of F/MNT/05 slip (1). */
export const BREAKDOWN_MEMO_ID = "mnt-breakdown-memo";

/** Slip (1)'s worked-out box and the four boxes it is worked out from. */
export const BREAKDOWN_MEMO_FIELDS = {
  minutes: "breakdownMinutes",
  intimationDate: "intimationDate",
  intimationTime: "intimationTime",
  repairDate: "repairDate",
  repairTime: "repairTime",
} as const;

/** The slip's "Breakdown minutes" for what its header holds. */
export function breakdownMemoMinutes(header: Record<string, unknown> | undefined): string {
  const h = header ?? {};
  const f = BREAKDOWN_MEMO_FIELDS;
  return breakdownMinutes(h[f.intimationDate], h[f.intimationTime], h[f.repairDate], h[f.repairTime]);
}

function withMemoMinutes<T>(data: T): T {
  const d = data as unknown as LogSheetData | undefined;
  if (!d || typeof d !== "object") return data;
  const header = (d.header ?? {}) as Record<string, string>;
  const minutes = breakdownMemoMinutes(header);
  // Unchanged is handed back as it was, so the slip is not redrawn for nothing.
  if ((header[BREAKDOWN_MEMO_FIELDS.minutes] ?? "") === minutes) return data;
  return { ...d, header: { ...header, [BREAKDOWN_MEMO_FIELDS.minutes]: minutes } } as unknown as T;
}

/** The record's data with every formula cell worked out; any other document's data is returned as it is. */
export function withMaintenanceCalc<T>(documentId: string | undefined, data: T): T {
  if (documentId === BREAKDOWN_MEMO_ID) return withMemoMinutes(data);
  if (documentId !== BREAKDOWN_RECORD_ID) return data;
  const d = data as unknown as LogSheetData | undefined;
  if (!d || !Array.isArray(d.rows)) return data;
  // A line whose figures are unchanged is handed back as it was, so the sheet
  // redraws only the line that changed (components/records/LogSheetRecordView.tsx SheetRow).
  const rows: LogSheetRow[] = d.rows.map((r) => {
    const next = { ...r, ...breakdownCells(r) };
    return Object.keys(next).every((k) => next[k] === r[k]) ? r : next;
  });
  // Nothing changed is nothing to re-render: the same object goes back, so a
  // long register does not rebuild on every keystroke elsewhere.
  const same = rows.every((r, i) => r === d.rows[i]);
  return same ? data : ({ ...d, rows } as unknown as T);
}
