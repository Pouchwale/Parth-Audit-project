import type { DocumentDefinition, Employee } from "../types";
import { documentRepository } from "../data/repositories/documentRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { settingsRepository } from "../data/repositories/settingsRepository";
import { ensureRecordsGeneratedForMonth } from "./recordGenerator";
import { resolveResponsibleEmployees } from "./documentInfo";
import { isCompanyHoliday } from "./holidays";
import { addDays, compareISO, fromISODate, todayISO } from "../utils/date";

// How far ahead an "upcoming" reminder starts firing. Anything due today is
// "due"; anything with an unresolved due date in the past is "overdue" (and
// stays that way, re-surfacing every day, until it's actually filled).
const ADVANCE_WARNING_DAYS = 3;

// Statuses where the concerned person still has something to do — a
// submitted/verified record is no longer their problem; a rejected one is
// (it needs to be resumed and resubmitted), so it's treated the same as an
// unfilled one for reminder purposes.
const PENDING_STATUSES = ["Scheduled", "Due", "In Progress", "Rejected"] as const;

export type ReminderUrgency = "overdue" | "due" | "upcoming";

export interface DocumentReminder {
  documentId: string;
  documentName: string;
  recordId: string;
  dueDate: string;
  urgency: ReminderUrgency;
  daysUntilDue: number; // negative once overdue
  route: string; // where "Open" should navigate
  assignedEmployees: Employee[]; // matched by role keyword; empty if unconfigured/no match
}

// Each document kind renders through a different page — see App.tsx's route
// table. The single source of truth for "where does this record open",
// shared by reminders, the briefing, Dashboard, Day View and Search.
// Reference-only kinds never reach here since they're excluded by
// documentRepository.getRecordable().
export function routeForRecord(doc: DocumentDefinition | undefined, recordId: string): string {
  switch (doc?.kind) {
    case "gap-inspection":
      return `/gap/${recordId}`;
    case "complaint-checklist":
      return `/gap/complaint/${recordId}`;
    case "training-record":
      return `/training/${recordId}`;
    default:
      return `/record/${recordId}`;
  }
}


// The frequency engine only generates record shells for months someone has
// actually opened (Calendar/Dashboard); a document due in 2 days needs its
// shell to exist *now* for it to show up here, so make sure this month and,
// if the advance window crosses into it, next month are both generated
// first. Idempotent — safe to call as often as needed. Callers run this as
// a side effect (e.g. inside a useEffect, same as DashboardPage/CalendarPage
// already do for their own generation) and then read the result via
// computeReminders, which stays a pure read over the repositories.
/** Returns how many records it had to make, so a caller can redraw only when there is something new (REQUIREMENTS §65). */
export function ensureNearTermRecordsGenerated(isDemo: boolean): number {
  const now = new Date();
  let made = ensureRecordsGeneratedForMonth(now.getFullYear(), now.getMonth(), { isDemo }).length;
  const horizon = fromISODate(addDays(todayISO(), ADVANCE_WARNING_DAYS));
  if (horizon.getFullYear() !== now.getFullYear() || horizon.getMonth() !== now.getMonth()) {
    made += ensureRecordsGeneratedForMonth(horizon.getFullYear(), horizon.getMonth(), { isDemo }).length;
  }
  return made;
}

export function computeReminders(isDemo: boolean): DocumentReminder[] {
  const today = todayISO();
  const master = masterRepository.get();
  const docs = documentRepository.getRecordable();
  const reminders: DocumentReminder[] = [];
  // Live records dated before this browser's launch floor are generator
  // noise (see engine/backlogCleanup.ts), not obligations — never remind
  // anyone about them; the Dashboard / briefing offer to clean them up.
  const liveStartDate = isDemo ? null : settingsRepository.get().liveStartDate;

  for (const doc of docs) {
    const records = recordRepository.query({ documentId: doc.id, isDemo });
    const assignedEmployees = resolveResponsibleEmployees(doc, master);

    for (const record of records) {
      if (!PENDING_STATUSES.includes(record.status as (typeof PENDING_STATUSES)[number])) continue;
      if (liveStartDate && compareISO(record.dueDate, liveStartDate) < 0) continue;
      // Nobody's expected to file paperwork on a day the company's closed
      // (the Thursday weekly off, a festival holiday) — applies to every
      // document kind, not just Daily Monitoring.
      if (isCompanyHoliday(record.dueDate, master)) continue;

      const cmp = compareISO(record.dueDate, today);
      const daysUntilDue = daysBetween(today, record.dueDate);
      let urgency: ReminderUrgency;
      if (cmp < 0) urgency = "overdue";
      else if (cmp === 0) urgency = "due";
      else if (daysUntilDue <= ADVANCE_WARNING_DAYS) urgency = "upcoming";
      else continue; // too far out to surface yet

      reminders.push({
        documentId: doc.id,
        documentName: doc.name,
        recordId: record.id,
        dueDate: record.dueDate,
        urgency,
        daysUntilDue,
        route: routeForRecord(doc, record.id),
        assignedEmployees,
      });
    }
  }

  const urgencyRank: Record<ReminderUrgency, number> = { overdue: 0, due: 1, upcoming: 2 };
  return reminders.sort((a, b) => urgencyRank[a.urgency] - urgencyRank[b.urgency] || compareISO(a.dueDate, b.dueDate));
}

function daysBetween(fromISO: string, toISO: string): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const from = Date.parse(fromISO);
  const to = Date.parse(toISO);
  return Math.round((to - from) / MS_PER_DAY);
}
