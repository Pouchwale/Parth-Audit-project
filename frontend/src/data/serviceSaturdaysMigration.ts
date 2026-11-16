import { masterRepository } from "./repositories/masterRepository";
import { documentRepository } from "./repositories/documentRepository";
import { frequencyDocsFor } from "../engine/frequencyPanel";
import { isBossSignedIn } from "../engine/departmentScope";
import { logActivity } from "../utils/activityLog";
import { recordRepository } from "./repositories/recordRepository";
import { mayWriteRecordsOf } from "../engine/departmentScope";
import { schedulePeriodOf } from "../engine/frequencyEngine";
import { workingDueDate } from "../engine/holidays";
import { appendHistory, makeEntry } from "../engine/recordHistory";
import { compareISO, formatDisplayDate } from "../utils/date";
import type { RecordInstance } from "../types";

/**
 * THE THREE SERVICE REPORTS ON THEIR SATURDAYS (REQUIREMENTS §221; the owner, 15-Nov-2026: "twice a month and on saturday
 * ... for all three service record"). A frequency set on the Frequency page for one of them on or before that day - the
 * Super Admin's 1st and 3rd Sunday for General and Fly, set that morning - is taken off, so all three follow the issued
 * 1st and 3rd Saturday, with a line in the activity log. One set after that day is the plant's newer word and stays.
 * Run at every start by whoever may set those frequencies; nothing to do, nothing written. Returns how many were taken off.
 */
export const SERVICE_REPORT_IDS = ["service-report-rodent", "service-report-general", "service-report-fly"] as const;
const SATURDAYS_FROM = "2026-11-15";

export function serviceReportsOnSaturdays(): number {
  const master = masterRepository.get();
  const overrides = master.scheduleOverrides ?? {};
  const mine = new Set(frequencyDocsFor(documentRepository.getRecordableUnscoped(), isBossSignedIn()).map((d) => d.id));
  const off = SERVICE_REPORT_IDS.filter((id) => overrides[id] && overrides[id].since <= SATURDAYS_FROM && mine.has(id));
  if (off.length === 0) return 0;
  const next = { ...overrides };
  for (const id of off) delete next[id];
  masterRepository.update({ scheduleOverrides: next });
  for (const id of off) {
    const doc = documentRepository.getByIdUnscoped(id);
    logActivity("Frequency changed", doc ? doc.name : id, "back to the issued frequency: the 1st and 3rd Saturday (REQUIREMENTS §221)", id);
  }
  return off.length;
}

/**
 * ...AND NOVEMBER 2026 ON ITS SATURDAYS TOO (the owner, 16-Nov-2026, "check for this month which is november 2026": the
 * 1st and 3rd Saturday, the 7th and the 21st). An open visit of the three (not handed in, not under correction) filed on a
 * day the Saturdays do not name, from the month the Saturdays start in (scheduleSince, 01-11-2026), is moved to its
 * fortnight's Saturday - the 4th to the 7th - with everything written on it and a line in its history, when that Saturday
 * has no visit of its own yet. A visit handed in or signed off stays where it is. Returns how many were moved.
 */
export function serviceVisitsOnSaturdays(): number {
  const moved: RecordInstance[] = [];
  for (const id of SERVICE_REPORT_IDS) {
    const doc = documentRepository.getByIdUnscoped(id);
    if (!doc || doc.schedule.type !== "fortnightly" || !doc.scheduleSince || !mayWriteRecordsOf(id)) continue;
    const records = recordRepository.queryUnscoped({ documentId: id, isDemo: false });
    const keys = new Set(records.map((r) => r.periodKey));
    for (const r of records) {
      if (!["Scheduled", "Due", "In Progress"].includes(r.status) || r.submittedAt || r.correction) continue;
      const filed = /^[^:]*:(\d{4}-\d{2}-\d{2})$/.exec(r.periodKey ?? "")?.[1];
      if (!filed || compareISO(filed, doc.scheduleSince) < 0) continue;
      const period = schedulePeriodOf(doc, filed);
      if (!period || period.scheduled === filed) continue;
      const key = `${id}:${period.scheduled}`;
      if (keys.has(key)) continue;
      keys.add(key);
      const due = workingDueDate(period.scheduled, masterRepository.get());
      moved.push(appendHistory({ ...r, periodKey: key, dueDate: due }, makeEntry("edited", "System", { note: `Moved to ${formatDisplayDate(due)}, the fortnight's Saturday (was ${formatDisplayDate(r.dueDate)}; the 1st and 3rd Saturday, REQUIREMENTS §221).` })));
    }
  }
  for (const r of moved) recordRepository.upsert(r);
  return moved.length;
}
