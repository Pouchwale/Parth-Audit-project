// THE RECORDS NUMBERED 01, 02, 03 (REQUIREMENTS §226, §233, §234). The owner, 16-Nov-2026, of F/QC/11's list: "remove
// detail from screen and instead of that add serial number"; then of F/QC/12's list the same, and of F/QC/11's "Serial
// No:" box: "serial number should also able to come" (the record's number, editable); then: "if there are 4 document a
// month means each per week also in qc-11 ... serial number is number wise 01, 02, 03, 04 and it should be same for
// document also" (asked: F/QC/12, a sheet a month, 01 to 12 through the year). So each record is numbered in its period,
// oldest first, two figures: F/QC/11's weeks 01 to 04 (05) in each month, F/QC/12's months 01 to 12 in each year - as
// F/QC/17's rulers are 01 to 20 in each year (§220). The list's Serial number column shows it, and the sheet's Serial No
// box holds it (data/serialNumbersMigration.ts) until a person writes another number there.

import type { RecordInstance } from "../types";
import { compareISO } from "../utils/date";

/** The documents whose records are numbered so, and the period the count starts again in. */
export const RUNNING_NUMBER_SPAN: Readonly<Record<string, "month" | "year">> = {
  "qc-gsm-plate-calibration": "month",
  "qc-weight-scale-calibration": "year",
};
export const RUNNING_NUMBER_DOCS: ReadonlySet<string> = new Set(Object.keys(RUNNING_NUMBER_SPAN));

/** The header box that holds the record's number on these documents' sheets. */
export const RUNNING_NUMBER_BOX = "serialNo";

type Numbered = Pick<RecordInstance, "id" | "dueDate" | "createdAt">;

/** A number as the plant writes it: two figures, 01, 02 … */
export const twoFigures = (n: number): string => String(n).padStart(2, "0");

/** Each record's number in its month (F/QC/11) or year (F/QC/12), oldest first; null for a document not numbered so. */
export function runningNumbers(documentId: string, records: Numbered[]): Map<string, string> | null {
  const span = RUNNING_NUMBER_SPAN[documentId];
  if (!span) return null;
  const oldestFirst = records.slice().sort((a, b) => compareISO(a.dueDate, b.dueDate) || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  const counts = new Map<string, number>();
  const out = new Map<string, string>();
  for (const r of oldestFirst) {
    const period = String(r.dueDate ?? "").slice(0, span === "month" ? 7 : 4);
    const n = (counts.get(period) ?? 0) + 1;
    counts.set(period, n);
    out.set(r.id, twoFigures(n));
  }
  return out;
}
