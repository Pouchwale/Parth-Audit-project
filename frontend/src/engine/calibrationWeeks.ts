import type { LogSheetData, RecordInstance } from "../types";
import { recordRepository } from "../data/repositories/recordRepository";
import { todayISO } from "../utils/date";

// F/QC/12'S FIRST DATE IS FILLED (the owner, 30-Oct-2026: "in date section of today is 30/10/2026 then … the date should
// be filled automatic of due date of previous week"). A sheet's first line starts on the last Next Due Date written on the
// device's previous sheet — the week after the last calibration — and each line below on the Next Due Date above it
// (engine/nextDueChain.ts). With no earlier sheet, the day it is opened. A date a person types is kept, and the lines
// below follow it.

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** The last Next Due Date written on the sheets of `documentId` before `record`, or null where there is none. */
export function previousNextDue(documentId: string, record: Pick<RecordInstance, "id" | "dueDate" | "isDemo">): string | null {
  const earlier = recordRepository
    .queryUnscoped({ documentId, isDemo: record.isDemo })
    .filter((r) => r.id !== record.id && r.dueDate < record.dueDate)
    .sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1));
  for (const r of earlier) {
    const rows = (r.data as LogSheetData | undefined)?.rows ?? [];
    for (let i = rows.length - 1; i >= 0; i--) {
      const due = String(rows[i].nextDueDate ?? "").trim();
      if (ISO.test(due)) return due;
    }
  }
  return null;
}

/** The date the sheet's first line starts on: the previous week's Next Due Date, or today. */
export function firstWeekDate(documentId: string, record: Pick<RecordInstance, "id" | "dueDate" | "isDemo">): string {
  return previousNextDue(documentId, record) ?? todayISO();
}
