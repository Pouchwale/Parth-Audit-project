import type { DocumentDefinition, RecordInstance } from "../types";
import { documentRepository } from "../data/repositories/documentRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { settingsRepository } from "../data/repositories/settingsRepository";
import { effectiveDueDatesInMonth } from "./holidays";
import { createDefaultData } from "./recordDefaults";
import { generateId } from "../utils/id";
import { compareISO, todayISO } from "../utils/date";
import { mayWriteRecordsOf } from "./departmentScope";

/**
 * A SHEET FILLED THROUGH THE YEAR AND DUE AT ITS END (REQUIREMENTS §86): F/HR/16,
 * the monthly cleaning record — twelve months on one page, due on 31 December as a
 * month sheet is due on its last day. Its record is filed from the year's first day,
 * so the months are written on as they come: generating any month of the year files
 * it. A yearly format due on any other day is generated in its own month, as before.
 */
export const fillsThroughYear = (doc: DocumentDefinition): boolean =>
  doc.schedule.type === "yearly" && doc.schedule.month === 11 && doc.schedule.dayOfMonth === 31;

// AUTOMATIC RECORD GENERATION (section 28). Idempotent: safe to call every
// time the Calendar/Day View/Dashboard mounts for a given month — existing
// instances for a (document, date) are never duplicated or overwritten.
export function ensureRecordsGeneratedForMonth(
  year: number,
  month: number,
  opts: { documentIds?: string[]; isDemo?: boolean } = {}
): RecordInstance[] {
  const master = masterRepository.get();
  const docs = documentRepository
    // Unscoped on purpose: the plant's registers must be generated in full
    // whoever is logged in, or a department's records would simply never exist
    // (engine/departmentScope.ts).
    .getRecordableUnscoped()
    // ...but only the documents the signed-in person may fill (REQUIREMENTS §96): the server refuses a new record
    // below Write, and its morning job makes the plant's sheets for every document (engine/departmentScope.ts).
    .filter((d) => (!opts.documentIds || opts.documentIds.includes(d.id)) && (!!opts.isDemo || mayWriteRecordsOf(d.id)));
  const existing = recordRepository.periodKeys(!!opts.isDemo);
  // Demo data is isolated and explicitly opt-in (Demo Mode), so it has no
  // business having a launch-date floor — only real Live obligations do.
  // ensureLiveStartDate() is idempotent, so this is just a read after the
  // very first call anywhere in the app's lifetime (see data/bootstrap.ts).
  const liveStartDate = opts.isDemo ? null : settingsRepository.ensureLiveStartDate(todayISO());

  const created: RecordInstance[] = [];
  const now = new Date().toISOString();

  for (const doc of docs) {
    // Holiday-aware dates (engine/holidays.ts): the weekly off (Thursday),
    // the leave calendar's festival holidays and its adjustment (working)
    // days. `scheduled` is the date the schedule names and is what the
    // periodKey is built from, so a record is created once whether or not
    // its due date moved; `due` is the day it is actually expected.
    const dates = fillsThroughYear(doc) && month !== 11 ? effectiveDueDatesInMonth(doc, year, 11, master) : effectiveDueDatesInMonth(doc, year, month, master);
    for (const { scheduled, due, holiday } of dates) {
      // Never manufacture a Live obligation for a date before this system
      // went live on this browser — otherwise simply browsing the Calendar
      // back to, say, last year would silently backfill months of "overdue"
      // records for a period when the digital system didn't exist. Judged on
      // the date the record is actually due: a visit scheduled for the
      // Thursday before go-live but due on go-live Friday IS an obligation.
      if (liveStartDate && compareISO(due, liveStartDate) < 0) continue;
      // Daily Monitoring has its own on-paper "holiday" concept (a checkbox,
      // no checkpoints required — see recordDefaults.ts/validation.ts), so it
      // still gets a record shell on a closed day, just pre-flagged. Every
      // other DAILY register (the lamination log sheets) simply has no sheet
      // for a day the company's closed — there's nothing to submit/verify, so
      // nothing should ever show as pending or overdue for that date.
      // (Fortnightly/monthly/… obligations are never dropped — `due` has
      // already been moved to the next working day for them.)
      if (holiday && doc.kind !== "daily-pest-monitoring") continue;
      if (existing.has(`${doc.id}|${periodKeyFor(doc, scheduled)}`)) continue;
      const rec: RecordInstance = {
        id: generateId("rec"),
        documentId: doc.id,
        periodKey: periodKeyFor(doc, scheduled),
        dueDate: due,
        status: "Due",
        isDemo: !!opts.isDemo,
        data: createDefaultData(doc, due, master),
        createdAt: now,
        updatedAt: now,
      };
      created.push(rec);
    }
  }

  if (created.length > 0) recordRepository.upsertMany(created);
  return created;
}

export function periodKeyFor(doc: DocumentDefinition, dueDateISO: string): string {
  return `${doc.id}:${dueDateISO}`;
}
