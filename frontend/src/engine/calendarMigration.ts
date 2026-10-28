import type { DailyPestMonitoringData, RecordInstance } from "../types";
import { documentRepository } from "../data/repositories/documentRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { dayInfo, effectiveDueDatesInMonth, isCompanyHoliday, nextWorkingDay } from "./holidays";
import { compareISO, todayISO } from "../utils/date";
import { mayWriteRecordsOf } from "./departmentScope";

// ALIGN EXISTING RECORDS WITH THE WORKING CALENDAR. Runs at every boot
// (idempotent). Records created before the calendar existed — or before an
// admin changed it in Master Data → Holidays — can sit on a day the plant is
// closed: a fly-catcher inspection dated Thursday 03-Sep-2026, a lamination
// log sheet for a festival holiday, a Daily Monitoring record the assistant
// prepared as a normal day. Reminders and the briefing already ignore closed
// days, so such a record would just show as "overdue" on the Calendar with
// nobody ever being asked about it. This puts each one where the generator
// would put it today, touching only records no person has worked on:
//   * fortnightly / monthly / quarterly / yearly → moved to the next working
//     day (the periodKey is untouched, so it is still that visit)
//   * lamination log sheets and other daily registers → removed (no sheet on
//     a closed day)
//   * Daily Pest Control Monitoring → re-marked as a holiday
// "No person has worked on it" = never submitted / verified / rejected, and
// either (a) a blank shell the generator made — Scheduled / Due, never
// prepared, not written to since it was created — or (b) prepared by the
// assistant and not edited since (updatedAt within two minutes of
// prepared.at — the same test engine/backlogCleanup.ts uses). A record a
// person has saved a draft into ("In Progress" without a prepared marker,
// or edited after preparation) is theirs and is left exactly where it is.

const UNTOUCHED_WINDOW_MS = 2 * 60 * 1000;

function within(a: string, b: string): boolean {
  const gap = Math.abs(Date.parse(a) - Date.parse(b));
  return Number.isFinite(gap) && gap <= UNTOUCHED_WINDOW_MS;
}

function untouchedByPeople(r: RecordInstance): boolean {
  if (r.submittedAt || r.verifiedAt || r.rejectedAt) return false;
  if (r.prepared) return r.status === "In Progress" && within(r.updatedAt, r.prepared.at);
  return (r.status === "Scheduled" || r.status === "Due") && within(r.updatedAt, r.createdAt);
}

export interface CalendarAlignment {
  moved: number;
  removed: number;
  remarked: number;
}

export function alignRecordsToWorkingCalendar(): CalendarAlignment {
  const master = masterRepository.get();
  // Unscoped: a boot-time migration moves every department's records onto
  // working days, not only the ones the person logged in may see.
  const docs = new Map(documentRepository.getAllUnscoped().map((d) => [d.id, d] as const));
  const updates: RecordInstance[] = [];
  const removeIds: string[] = [];
  let remarked = 0;

  for (const r of recordRepository.getAll()) {
    if (!isCompanyHoliday(r.dueDate, master)) continue;
    if (!untouchedByPeople(r)) continue;
    const doc = docs.get(r.documentId);
    // Only a record the signed-in person may fill is changed from this browser (REQUIREMENTS §96).
    if (!doc || !mayWriteRecordsOf(doc.id)) continue;

    if (doc.schedule.type === "daily" || doc.schedule.type === "as-required") {
      if (doc.kind === "daily-pest-monitoring") {
        const d = r.data as DailyPestMonitoringData;
        if (d.isHoliday) continue;
        const day = dayInfo(r.dueDate, master);
        const note =
          day.kind === "weekly-off"
            ? `Marked as a holiday — ${day.weekday} is the weekly off, so no checkpoint entry is needed today.`
            : `Marked as a holiday (${day.name}) — no checkpoint entry is needed today.`;
        updates.push({
          ...r,
          data: { ...d, isHoliday: true, checkpoints: {}, summaryActions: [], rodentCatches: [] },
          prepared: r.prepared ? { ...r.prepared, notes: [note], basedOn: "the Gujarat Print Pack Leave Calendar 2026 (Master Data → Holidays)" } : r.prepared,
        });
        remarked += 1;
      } else if (doc.schedule.type === "daily") {
        removeIds.push(r.id);
      }
      continue;
    }

    const due = nextWorkingDay(r.dueDate, master);
    if (due !== r.dueDate) updates.push({ ...r, dueDate: due });
  }

  // upsertMany deliberately leaves updatedAt alone, so a record the assistant
  // prepared still reads as "untouched" to the pre-launch clean-up.
  if (updates.length) recordRepository.upsertMany(updates);
  const removed = removeIds.length ? recordRepository.removeIds(removeIds) : 0;
  return { moved: updates.length - remarked, removed, remarked };
}

/**
 * SHEETS A CHANGED SCHEDULE NO LONGER NAMES (the owner, 28-Oct-2026: F/QC/11 every Tuesday, F/QC/12 every Sunday,
 * F/HR/18 the 1st and 3rd Monday). On a document whose schedule was changed (DocumentDefinition.scheduleSince), a
 * Live sheet the schedule made for today or later, that nobody has worked on (untouchedByPeople), on a date the
 * schedule no longer names (its periodKey's), is taken away: nobody is asked for a sheet that is no longer due, and the
 * generator makes the new schedule's. A sheet a person wrote on, and every sheet of a day gone by, stays as it is.
 * Runs at every start (data/bootstrap.ts): nothing to do, nothing written.
 */
export function removeOffScheduleShells(today: string = todayISO()): number {
  const master = masterRepository.get();
  const docs = new Map(documentRepository.getAllUnscoped().filter((d) => d.scheduleSince).map((d) => [d.id, d] as const));
  if (docs.size === 0) return 0;
  const named = new Map<string, Set<string>>();
  const removeIds: string[] = [];
  for (const r of recordRepository.getAll()) {
    const doc = docs.get(r.documentId);
    if (!doc || r.isDemo || compareISO(r.dueDate, today) < 0 || !untouchedByPeople(r) || !mayWriteRecordsOf(doc.id)) continue;
    if (doc.schedule.type === "daily" || doc.schedule.type === "as-required") continue;
    const filed = /(\d{4}-\d{2}-\d{2})/.exec(r.periodKey ?? "")?.[1] ?? r.dueDate;
    const month = `${doc.id}|${filed.slice(0, 7)}`;
    if (!named.has(month)) named.set(month, new Set(effectiveDueDatesInMonth(doc, Number(filed.slice(0, 4)), Number(filed.slice(5, 7)) - 1, master).map((s) => s.scheduled)));
    if (!named.get(month)!.has(filed)) removeIds.push(r.id);
  }
  return removeIds.length ? recordRepository.removeIds(removeIds) : 0;
}
