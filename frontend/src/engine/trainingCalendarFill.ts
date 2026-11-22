import type { LogSheetData, RecordInstance } from "../types";
import { documentRepository } from "../data/repositories/documentRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { untouchedByPeople } from "./calendarMigration";
import { mayDo } from "./departmentScope";
import { isCompanyHoliday } from "./holidays";
import { diffRecordData, makeEntry } from "./recordHistory";
import { fieldLabels } from "./recordPatch";
import { calendarDatesDue, calendarStartYear, TRAINING_CALENDAR_ID } from "./trainingCalendar";
import { todayISO } from "../utils/date";

// F/HR/09's PLAN AND ACTUAL DATES WRITTEN BY THE SYSTEM, EVERY YEAR (the owner, 21-Nov-2026, REQUIREMENTS §271). Run by the
// server's morning job (engineHost/entry.ts prepareOp) and at every start (data/bootstrap.ts), on each Live calendar from 2026-27 on
// (engine/trainingCalendar.ts calendarDatesDue says what is due). The calendar is written on all year, so a signed-off sheet
// takes its dates too: its status and signatures stay, and each change is a line in its history. From a browser only a person
// who may make that change does it (a signed-off sheet: a correction); the server's morning job does it for the plant.

export const CALENDAR_DATES_NOTE = "Training dates by the system (REQUIREMENTS §271, §272): X under Plan for each planned month, and its date under Actual on the day picked for it. Change the Actual date if the training was held on another day, or clear it if it was not held: it is not written back.";

const OPEN = new Set(["Scheduled", "Due", "In Progress"]);

export function fillTrainingCalendarDue(referenceISO = todayISO(), onlyRecordId?: string): RecordInstance[] {
  const doc = documentRepository.getByIdUnscoped(TRAINING_CALENDAR_ID);
  if (!doc) return [];
  const master = masterRepository.get();
  const now = new Date().toISOString();
  const updates: RecordInstance[] = [];
  for (const r of recordRepository.queryUnscoped({ documentId: TRAINING_CALENDAR_ID, isDemo: false })) {
    if ((onlyRecordId && r.id !== onlyRecordId) || r.status === "Rejected" || calendarStartYear(r.dueDate) < 2026) continue;
    if (!mayDo(TRAINING_CALENDAR_ID, OPEN.has(r.status) && !r.correction ? "fill" : "correct")) continue;
    const data = r.data as LogSheetData | undefined;
    if (!data?.rows?.length) continue;
    const rows = calendarDatesDue(data.rows, r.dueDate, referenceISO, (d) => isCompanyHoliday(d, master));
    if (!rows) continue;
    const after: LogSheetData = { ...data, rows };
    const changes = diffRecordData(data, after, fieldLabels(doc.kind, TRAINING_CALENDAR_ID));
    // A sheet still the assistant's own stays so; one a person has worked on keeps what says so.
    const prepared = r.prepared && untouchedByPeople(r) ? { ...r.prepared, at: now } : r.prepared;
    updates.push({
      ...r,
      data: after,
      updatedAt: now,
      ...(prepared ? { prepared } : {}),
      // Only the day kept out of sight changed: nothing on the sheet to put in its history.
      history: changes.length ? [...(r.history ?? []), { ...makeEntry("prepared", "Assistant", { note: CALENDAR_DATES_NOTE, changes }), at: now }] : (r.history ?? []),
    });
  }
  if (updates.length) recordRepository.upsertMany(updates);
  return updates;
}
