import type { AuthUser } from "../types/auth";
import type { DocumentDefinition, ScheduleConfig } from "../types";
import { documentRepository } from "../data/repositories/documentRepository";
import { computeReminders, type DocumentReminder } from "./reminders";
import { formatDisplayDate } from "../utils/date";

// THE DAY'S NOTIFICATIONS, FOR ONE PERSON (REQUIREMENTS §69).
//
// "make a dedicated notification system which comes daily to encourage the user
// to finish there work and lead in that score dashboard ... according to
// frequency and due date system will notify the user and this applies to all
// modules. So that will like highest priority, medium, low like wise according
// to frequency of that document."
//
// Three questions are answered here, and nothing else:
//   1. WHICH documents are this person's — their department's, and the ones
//      Master Data names them on (the same rule Mitra uses, §67).
//   2. HOW URGENT is each one — high, medium or low, from the document's OWN
//      FREQUENCY and its due date, because those are not the same thing: a
//      daily sheet not filled today leaves a gap in the file that tomorrow's
//      sheet cannot fill, while a yearly review due in a week can wait a day.
//   3. WHAT TO SAY so that finishing the work is the obvious next thing —
//      counted, named, and tied to where they stand on the scorecard (§64),
//      which is what they are measured by.
//
// Everything here is PURE: the records, the definitions, the account and the
// day come in as arguments and words go out. Nothing is read from storage and
// nothing is written, so the bell, the daily nudge and the briefing can all
// ask the same question and never disagree — and a caller decides WHEN to ask,
// which matters because working the reminders out walks every format's records
// (§65). Never call this while drawing.

export type Priority = "high" | "medium" | "low";

/** Worst first, which is the order everything here is listed in. */
export const PRIORITY_ORDER: readonly Priority[] = ["high", "medium", "low"];

/**
 * HOW LONG THE DOCUMENT'S OWN PERIOD IS, in days. This is what makes a daily
 * sheet more urgent than a yearly one on the same day: the period is how much
 * room there is before the next one is due, and so how much of the file is
 * lost if this one is not filled.
 *
 * "As required" has no period — it is started when something happens — so it
 * is judged by its own two-day allowance instead (§64, AS_REQUIRED_DAYS).
 */
export function periodDays(schedule: ScheduleConfig): number | null {
  switch (schedule.type) {
    case "daily":
      return 1;
    case "weekly":
      return 7;
    case "fortnightly":
      return 15;
    case "monthly":
      return 30;
    case "quarterly":
      return 91;
    case "yearly":
      return 365;
    case "as-required":
      return null;
  }
}

/**
 * HIGH, MEDIUM OR LOW, from the frequency and the due date together.
 *
 *   high    late already — whatever it is, the file has a hole in it; or due
 *           TODAY on a document whose period is a week or less, because there
 *           is no room: tomorrow's sheet is tomorrow's.
 *   medium  due today on anything longer (a month's or a year's review can be
 *           done tomorrow without losing a day of the record); or due tomorrow
 *           on a short-period one, which is worth knowing tonight.
 *   low     due later than that.
 *
 * `daysUntilDue` is what engine/reminders.ts already works out: negative once
 * overdue, 0 on the day it is due.
 */
export function priorityOf(schedule: ScheduleConfig, daysUntilDue: number): Priority {
  if (daysUntilDue < 0) return "high";
  const period = periodDays(schedule);
  // As required: no period to be short of, so being due at all is a medium ask.
  if (period === null) return daysUntilDue === 0 ? "medium" : "low";
  if (daysUntilDue === 0) return period <= 7 ? "high" : "medium";
  if (daysUntilDue === 1 && period <= 7) return "medium";
  return "low";
}

/** One thing waiting, as a notification says it. */
export interface Notification {
  documentId: string;
  recordId: string;
  /** The format number and name, as written: "F/QC/01 Line Clearance Checklist". */
  what: string;
  /** The module it belongs to, so a person sees which of their modules is behind. */
  module: string;
  /** The frequency as the paper states it — "Daily", "Fortnightly" — which is why it is as urgent as it is. */
  frequency: string;
  dueDate: string;
  /** Negative once overdue. */
  daysUntilDue: number;
  priority: Priority;
  /** Where it opens. */
  route: string;
  /** Plain words for the line: "3 days late" / "due today" / "due on 26-Sep-2026". */
  when: string;
}

const whenWords = (daysUntilDue: number, dueDate: string): string => {
  if (daysUntilDue < -1) return `${-daysUntilDue} days late`;
  if (daysUntilDue === -1) return "1 day late";
  if (daysUntilDue === 0) return "due today";
  if (daysUntilDue === 1) return "due tomorrow";
  return `due on ${formatDisplayDate(dueDate)}`;
};

/** The format's number and name, or its name alone while the number is still to be confirmed (§58). */
const calledBy = (doc: DocumentDefinition): string =>
  doc.formatNo && !doc.formatNo.toUpperCase().startsWith("TO BE") ? `${doc.formatNo} ${doc.name}` : doc.name;

const sameName = (a: string): string => a.trim().replace(/\s+/g, " ").toLowerCase();

export interface DaysWork {
  /** Worst first: overdue, then due today, then what is coming. */
  notifications: Notification[];
  high: number;
  medium: number;
  low: number;
  /** Late already — the count a person is judged on. */
  overdue: number;
  /**
   * False when nobody is named on this work in Master Data: the administrator,
   * the MR and QA answer for the plant rather than for a list of their own, and
   * are told so rather than being addressed as if it were theirs (§67).
   */
  theirOwn: boolean;
  /** The modules the work falls in, worst first — "Quality Control — Inspection Records" and so on. */
  modules: string[];
}

/**
 * WHAT IS WAITING FOR THIS PERSON TODAY. `reminders` is what
 * engine/reminders.ts computeReminders returned (already kept to the
 * departments this account may see, §40), so this function stays pure and the
 * caller pays for that walk once.
 */
export function daysWork(reminders: readonly DocumentReminder[], person: Pick<AuthUser, "name"> | null | undefined): DaysWork {
  const me = sameName(person?.name ?? "");
  const named = me ? reminders.filter((r) => r.assignedEmployees.some((e) => sameName(e.name) === me)) : [];
  const theirOwn = named.length > 0;
  const mine = theirOwn ? named : reminders;

  const notifications: Notification[] = [];
  for (const r of mine) {
    const doc = documentRepository.getById(r.documentId);
    if (!doc) continue; // another department's, or retired since the reminder was made
    notifications.push({
      documentId: r.documentId,
      recordId: r.recordId,
      what: calledBy(doc),
      module: doc.module,
      frequency: doc.frequency,
      dueDate: r.dueDate,
      daysUntilDue: r.daysUntilDue,
      priority: priorityOf(doc.schedule, r.daysUntilDue),
      route: r.route,
      when: whenWords(r.daysUntilDue, r.dueDate),
    });
  }
  // Worst first: by priority, then by how long it has waited, then by name so
  // the order never shuffles between two readings of the same day.
  const rank = (p: Priority) => PRIORITY_ORDER.indexOf(p);
  notifications.sort((a, b) => rank(a.priority) - rank(b.priority) || a.daysUntilDue - b.daysUntilDue || a.what.localeCompare(b.what));

  const count = (p: Priority) => notifications.filter((n) => n.priority === p).length;
  const modules: string[] = [];
  for (const n of notifications) if (!modules.includes(n.module)) modules.push(n.module);

  return {
    notifications,
    high: count("high"),
    medium: count("medium"),
    low: count("low"),
    overdue: notifications.filter((n) => n.daysUntilDue < 0).length,
    theirOwn,
  modules,
  };
}

/**
 * WHERE THEY STAND, as the scorecard has it (§64) — the encouragement half of
 * the request. Given to `encourage` below; the caller works it out from
 * engine/performance.ts so this file stays free of that walk too.
 */
export interface Standing {
  /** Their own score for the period, or null when nothing of theirs has fallen due. */
  score: number | null;
  /** The grade's own words: "Excellent", "On track". */
  grade: string;
  /** 1 for the person with the best score among those scored; null when they are not scored. */
  rank: number | null;
  /** How many people are scored at all. */
  outOf: number;
  /** The score of whoever is first, so "two of these and you lead" can be said truthfully. */
  best: number | null;
}

/**
 * THE DAY'S WORDS. One short line that says what is waiting, and one that says
 * where finishing it takes them — because "you are second, and the first is two
 * records ahead" is what makes a person open the sheet, and a number with no
 * meaning is what makes them close the tab.
 *
 * Nothing here exaggerates: if they are top it says so, if nothing is waiting
 * it says that, and it never invents a position for somebody the scorecard does
 * not score.
 */
export function encourage(work: DaysWork, standing: Standing | null, firstName: string): { headline: string; standing: string } {
  const who = firstName ? `${firstName}, ` : "";
  const headline =
    work.notifications.length === 0
      ? work.theirOwn
        ? `Nothing is waiting for you today${firstName ? `, ${firstName}` : ""} — every one of your documents is in.`
        : `Nothing is waiting anywhere today — the whole file is in.`
      : work.overdue > 0
        ? `${who}${work.overdue} ${work.overdue === 1 ? "document is" : "documents are"} late and ${work.notifications.length - work.overdue > 0 ? `${work.notifications.length - work.overdue} more ${work.notifications.length - work.overdue === 1 ? "is" : "are"} due` : "nothing else is due"}.`
        : `${who}${work.notifications.length} ${work.notifications.length === 1 ? "document is" : "documents are"} waiting${work.high > 0 ? `, ${work.high} of them high priority` : ""}.`;

  if (!standing || standing.score === null) {
    return {
      headline,
      standing: work.notifications.length === 0 ? "" : "Finishing them on time is what the Performance Scorecard counts.",
    };
  }
  // A SCORE BUT NO PLACE YET. Where the person stands against everybody else
  // needs the directory of accounts, which is the Performance Scorecard's own
  // question to ask (§64). Told only their score, Mitra still says the useful
  // half — what they are at, and that finishing today is what holds it.
  if (standing.rank === null) {
    return {
      headline,
      standing: `You are at ${standing.score}% on the scorecard — ${standing.grade}.${work.notifications.length > 0 ? " Finishing these on time is what holds it there." : ""}`,
    };
  }
  const { score, grade, rank, outOf, best } = standing;
  const leading = rank === 1;
  const behind = best !== null && best > score ? best - score : 0;
  const standingWords = leading
    ? `You are top of the scorecard at ${score}% — ${grade}. Keeping these on time keeps you there.`
    : behind > 0
      ? `You are ${rank} of ${outOf} on the scorecard at ${score}% — ${grade}. The leader is ${best}%; on-time work is what closes ${behind} point${behind === 1 ? "" : "s"}.`
      : `You are ${rank} of ${outOf} on the scorecard at ${score}% — ${grade}.`;
  return { headline, standing: standingWords };
}

/**
 * The day's notifications for the signed-in person, worked out in one go.
 * A convenience for the callers that want all of it — the bell, the daily
 * nudge — so the reminders are walked once, by them, not once per question.
 */
export function notificationsFor(person: Pick<AuthUser, "name"> | null | undefined, isDemo: boolean): DaysWork {
  return daysWork(computeReminders(isDemo), person);
}
