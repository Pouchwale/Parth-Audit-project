// A DAY'S WORK, A STREAK, A BADGE — AND WHAT MITRA SAYS ABOUT THEM (REQUIREMENTS §81).
//
// "If user complete all the task the bot will enthusiasm them … show reactions
// when user complete the task in given time frame and this is applicable to
// each and every module; also make sure to motivate them not only for score."
//
// Three questions, answered from the records the person already keeps:
//
//   1. HOW IS TODAY GOING — what of theirs was on today's plate (due today, still
//      waiting from an earlier day however long ago, handed in today), how much
//      is done, on time or late, and what is left (dayProgress). "Theirs" is
//      what the day's notification calls theirs (engine/notifications.ts
//      daysWork, over engine/reminders.ts computeReminders): the documents
//      Master Data names them on while some of their work there is due, late
//      or coming up, or else every document their departments may see — so the
//      day card, the bell and "that was the last one due today" never disagree
//      about what is left.
//   2. HOW HAS IT BEEN GOING — the streak: consecutive working days, ending
//      yesterday (and today, once today's are all in on time), on which
//      everything of theirs that fell due was handed in on time. A closed day
//      (the weekly off, a festival) is stepped over; a day with nothing of
//      theirs due neither adds nor breaks; the streak never reaches back before
//      the day the system went live, or more than 60 working days. And the
//      month's on-time share. On time and late are engine/latenessCore.ts's
//      judgement — the Performance Scorecard's own rule — never a second one;
//      and so is WHOSE a handed-in record is (latenessCore attribute): where a
//      department has more than one account, a record one of the others handed
//      in is off the shared plate, but it is that colleague's on time, early
//      bird, streak and month, never this person's.
//   3. WHAT DID TODAY EARN — achievements, worked out afresh every time and
//      never stored: the first on time today, all done today, a 3/5/10/20/50-day
//      streak reached today, an early bird (handed in on its day before 11:00),
//      a clean week so far, a whole module on time this month. Which of them
//      were already celebrated today is the one thing kept (settings
//      celebratedToday, per person, not handed on to the next person at a
//      shared PC).
//   4. WHAT IS STILL MISSING — today's score, loss-framed (dayGapScore): 8 of
//      10 done reads −20, not 80; only a day with nothing missing reads 0.
//
// And the words: praiseLine / lateLine pick one of MANY lines
// (i18n/strings.motivation.ts, English and Gujarati) by a seed, so the same
// moment always reads the same way and the next one reads differently — and
// the lines are about pride, the team, the customer, being ready for an audit
// and safety as much as about the score (engine/purpose.ts). A late record is
// never scolded: "Done — a day late this time; the next one is due tomorrow."
//
// COST (the low-end standard, REQUIREMENTS §65): one pass over the person's
// documents' records of the last hundred days (and every older one still
// open), through the per-document index — and, for somebody Master Data names,
// the reminders' own walk that says whether the named documents are theirs
// today. Remembered against the stored records' identity
// (recordRepository.snapshot, a new array on every change), the day, the
// person, the accounts of their departments and the master data — so the
// toast's line, the celebration and the day card ask it three times and the
// walk happens once. Asked only from an effect, a timeout or an event handler:
// never while drawing. The accounts (GET /api/users/directory) are asked for
// apart, once and kept a few minutes (askAccountsFor).

import type { DocumentDefinition, RecordInstance } from "../types";
import { STRINGS, type Language } from "../i18n/strings";
import { documentRepository } from "../data/repositories/documentRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { settingsRepository } from "../data/repositories/settingsRepository";
import { departmentOfDocument } from "../data/seed/departments";
import { usersApi } from "../api/client";
import { addDaysISO, attribute, judge, keptTo, sameName, type LatenessPerson, type LatenessRecord, type PlantCalendar } from "./latenessCore";
import { closedDays } from "./performance";
import { PRIORITY_ORDER, daysWork, priorityOf } from "./notifications";
import { computeReminders, routeForRecord } from "./reminders";
import { resolveResponsibleEmployees } from "./documentInfo";
import { daysLate, type ReactionEvent } from "./reactions";
import { generalPurposeLine, purposeLine } from "./purpose";
import { isMine } from "./departmentScope";
import { formatDisplayDate, fromISODate, toISODate, todayISO } from "../utils/date";

// ---- The facts ---------------------------------------------------------------

/** Still somebody's to do — engine/reminders.ts PENDING_STATUSES (a record sent back is theirs again). */
const OPEN: ReadonlySet<string> = new Set(["Scheduled", "Due", "In Progress", "Rejected"]);
/** Handed in and not sent back. */
const HANDED_IN: ReadonlySet<string> = new Set(["Submitted", "Pending Verification", "Verified"]);

/** Calendar days of records read for the streak — 60 working days and the closed days between them. */
export const LOOKBACK_DAYS = 100;
/** The streak looks back at most this many working days. */
export const STREAK_WORKING_DAYS = 60;
/** Streak lengths that are a milestone of their own. */
export const STREAK_MILESTONES: readonly number[] = [3, 5, 10, 20, 50];
/** Handed in on its own day before this hour: an early bird. */
export const EARLY_BIRD_HOUR = 11;
/** A module's month counts for "module hero" from this many records on time. */
export const MODULE_HERO_MIN = 5;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * An achievement's key: "first-on-time-today", "all-done-today", "streak-5",
 * "early-bird", "clean-week", "module-hero:<module>". Derived, never stored.
 */
export type AchievementKey = string;

export interface DayProgress {
  /** Everything of theirs on today's plate: handed in today plus still waiting (due today or from an earlier day). */
  total: number;
  /** Handed in today (or earlier, for a record due today) — by them, or by a colleague of a shared department: it is off the plate either way. */
  done: number;
  /** Of what they handed in themselves (the scorecard's attribution): on time … */
  onTime: number;
  /** … and late. A colleague's record is neither. */
  late: number;
  /** Still waiting — due today, or overdue. */
  remaining: number;
  /** Of the remaining, how many are from an earlier day. */
  overdue: number;
  /** Records of theirs due today, whatever their state. */
  dueToday: number;
}

/** The most urgent thing still waiting, as the day card offers it. */
export interface NextTask {
  recordId: string;
  documentId: string;
  /** Format number and name, as written. */
  what: string;
  /** The format number alone ("" while it is still to be confirmed) and the name alone — a page shows the name in the chosen language (i18n/documentText.ts). */
  formatNo: string;
  name: string;
  module: string;
  route: string;
  dueDate: string;
  /** Negative once overdue. */
  daysUntilDue: number;
}

export interface MotivationStats {
  today: string;
  firstName: string;
  day: DayProgress;
  /** Today's score, counted from what is missing (dayGapScore of `day`): 8 of 10 done is −20, all done is 0. */
  gapScore: number;
  /** Consecutive working days all on time, ending yesterday — and today, once today's are all in on time. */
  streakDays: number;
  streakIncludesToday: boolean;
  /** On time ÷ (on time + late + never done) × 100 over their records due this month so far; null when none is judged yet. */
  onTimeThisMonth: number | null;
  judgedThisMonth: number;
  /** What today's work has earned (see the list at the top). */
  achievements: AchievementKey[];
  next: NextTask | null;
  /** The modules of what was handed in on time today, the latest first — for a purpose line. */
  modulesToday: string[];
  /**
   * THE PLANT'S DAY, NOT A PERSON'S (REQUIREMENTS §96): true for the super admin, who answers for no document. The
   * counts are then every open record of the plant, and there is no score of their own (the card shows none).
   */
  plantDay: boolean;
}

export interface MotivationInput {
  /** The person's documents (engine/notifications.ts's rule — see motivationFor). */
  docs: readonly DocumentDefinition[];
  /** Records of those documents; anything else is ignored. */
  records: readonly RecordInstance[];
  today: string;
  /** The plant's closed days, and `countedFrom` — the day the system went live. */
  calendar: PlantCalendar;
  firstName?: string;
  /**
   * WHOSE A HANDED-IN RECORD IS — the Performance Scorecard's rule
   * (engine/latenessCore.ts attribute). `self` is the person asking, `people`
   * the accounts of their departments (GET /api/users/directory) and
   * `departmentOf` the department that owns a document. Left out, or with
   * nobody else known, every record counts for them (the person alone).
   */
  self?: LatenessPerson | null;
  people?: readonly LatenessPerson[] | null;
  departmentOf?: (doc: DocumentDefinition) => string | null;
}

function firstHandedInAt(r: RecordInstance): string | null {
  const first = r.history?.find((h) => h.action === "submitted");
  return first?.at ?? r.submittedAt ?? null;
}

function localDateOf(stamp: string | null): string | null {
  if (!stamp) return null;
  const when = new Date(stamp);
  return Number.isNaN(when.getTime()) ? null : toISODate(when);
}

function daysBetween(fromISO: string, toISO: string): number {
  const days = Math.round((Date.parse(toISO) - Date.parse(fromISO)) / MS_PER_DAY);
  return Number.isFinite(days) ? days : 0;
}

/** Monday of the week `iso` falls in. */
function mondayOf(iso: string): string {
  return addDaysISO(iso, -((fromISODate(iso).getDay() + 6) % 7));
}

const calledBy = (doc: DocumentDefinition): string =>
  doc.formatNo && !doc.formatNo.toUpperCase().startsWith("TO BE") ? `${doc.formatNo} ${doc.name}` : doc.name;

export const firstNameOf = (name: string | null | undefined): string => (name ?? "").trim().split(/\s+/)[0] ?? "";

interface Tally {
  onTime: number;
  bad: number;
}
const tally = (map: Map<string, Tally>, key: string): Tally => {
  let t = map.get(key);
  if (!t) {
    t = { onTime: 0, bad: 0 };
    map.set(key, t);
  }
  return t;
};

// ---- Today's score, counted from what is missing ------------------------------
//
// "When some user is given 10 tasks for a day and completes 8 of them, his
// score will not be 80, it will be −20 … for their psychology" (the plant,
// 27-Sep-2026). The day's score is LOSS-FRAMED: it starts from what is still
// missing, so the only perfect day is one with nothing missing — 0 — and every
// task left takes points off. "Done" and "total" are the day card's own
// (DayProgress): what was handed in today and what is still waiting, overdue
// work included, so the ring and the score never disagree.

/**
 * round(done ÷ total × 100) − 100, between −100 and 0. 8 of 10 → −20; 10 of 10
 * → 0; 0 of 4 → −100; nothing due (total ≤ 0) → 0. While anything is missing
 * the score stays below 0 (199 of 200 is −1, not a rounded-up 0): only a day
 * with nothing missing reads as perfect.
 */
export function dayGapScore(done: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  const d = Number.isFinite(done) ? Math.min(Math.max(done, 0), total) : 0;
  let score = Math.round((d / total) * 100) - 100;
  if (d < total) score = Math.min(score, -1);
  return Math.max(-100, Math.min(0, score));
}

export type GapTone = "perfect" | "close" | "behind" | "far";

/** How far from 0: perfect (0), close (−1 … −20), behind (−21 … −50), far (below −50). */
export function gapTone(score: number): GapTone {
  if (!(score < 0)) return "perfect";
  if (score >= -20) return "close";
  if (score >= -50) return "behind";
  return "far";
}

/** The score as shown: "0", or "−20" with a true minus sign (U+2212). */
export function formatGapScore(score: number): string {
  const n = Math.round(Math.abs(score));
  return score < 0 && n > 0 ? `−${n}` : "0";
}

// ---- Whose work a handed-in record is ------------------------------------------

/** Every due date there is: whose a record is does not depend on its day. */
const EVERY_DUE_DATE = { from: "0000-01-01", to: "9999-12-31" };

/**
 * THE RECORDS A COLLEAGUE HANDED IN — the ids of the handed-in records that
 * count for another account, not for `self`, by the Performance Scorecard's
 * own walk (engine/latenessCore.ts attribute): where a department has more
 * than one account, a record that was handed in counts for the one who handed
 * it in, matched by name however it was typed; one nobody handed in, or one
 * somebody outside those accounts handed in (the administrator, an operator),
 * counts for every one of them. Only a department of `self`'s own is asked
 * about — a document Master Data names them on elsewhere, and the
 * administrator's whole plant, stay theirs as the notification has it.
 *
 * Who handed a record in does not depend on the day it was due, so the walk is
 * given the handed-in records alone, as the few fields the rule reads, with no
 * day closed and no go-live floor: a record the score leaves out (the
 * register's holiday line, a closed day's) is attributed as well. Nothing is
 * walked when no department of theirs has another account known.
 */
function colleaguesRecords(input: MotivationInput): Set<string> {
  const found = new Set<string>();
  const { self, people, departmentOf } = input;
  if (!self || !people || !departmentOf) return found;
  const own = new Set(keptTo(self));
  if (own.size === 0) return found;
  const everyone = people.some((p) => p.id === self.id) ? people : [...people, self];
  if (!everyone.some((p) => p.id !== self.id && keptTo(p).some((code) => own.has(code)))) return found;
  const handedIn: (LatenessRecord & { id: string })[] = [];
  for (const r of input.records) {
    if (!HANDED_IN.has(r.status)) continue;
    handedIn.push({ id: r.id, documentId: r.documentId, dueDate: r.dueDate, status: r.status, submittedAt: r.submittedAt, submittedBy: r.submittedBy, history: r.history });
  }
  if (handedIn.length === 0) return found;
  attribute(handedIn, input.docs, everyone, EVERY_DUE_DATE, input.today, { isClosedDay: () => false, dateOf: input.calendar.dateOf }, departmentOf, ({ record, department, answering }) => {
    if (own.has(department) && !answering.some((p) => p.id === self.id)) found.add(record.id);
  });
  return found;
}

/** THE WHOLE ANSWER, from records and documents handed in — pure, so a test can hold it to a made-up month. */
export function computeMotivation(input: MotivationInput): MotivationStats {
  const { docs, records, today, calendar } = input;
  const countedFrom = calendar.countedFrom ?? null;
  const docById = new Map<string, DocumentDefinition>();
  for (const d of docs) if (!d.isReferenceOnly) docById.set(d.id, d);
  // A colleague's (a department shared with another account): off the plate, but theirs to be praised for.
  const colleagues = colleaguesRecords(input);

  const monthStart = `${today.slice(0, 8)}01`;
  const weekStart = mondayOf(today);
  const lookbackFrom = addDaysISO(today, -LOOKBACK_DAYS);

  const day: DayProgress = { total: 0, done: 0, onTime: 0, late: 0, remaining: 0, overdue: 0, dueToday: 0 };
  const byDay = new Map<string, Tally>();
  const byModuleThisMonth = new Map<string, Tally>();
  const month = { onTime: 0, bad: 0 };
  const week = { onTime: 0, bad: 0, days: new Set<string>() };
  const onTimeToday: { module: string; at: string }[] = [];
  let earlyBird = false;
  const waiting: { record: RecordInstance; doc: DocumentDefinition }[] = [];

  for (const r of records) {
    const doc = docById.get(r.documentId);
    if (!doc) continue;
    const beforeLive = !!countedFrom && r.dueDate < countedFrom;

    // ---- today's plate
    if (r.dueDate === today && !calendar.isClosedDay(today)) day.dueToday += 1;
    if (OPEN.has(r.status)) {
      // What the bell counts as due or overdue (engine/reminders.ts): open, its day come, not a closed day, not before go-live.
      if (r.dueDate <= today && !calendar.isClosedDay(r.dueDate) && !beforeLive) {
        day.remaining += 1;
        if (r.dueDate < today) day.overdue += 1;
        waiting.push({ record: r, doc });
      }
    } else if (HANDED_IN.has(r.status)) {
      const at = firstHandedInAt(r);
      const on = localDateOf(at);
      if (on === today || r.dueDate === today) {
        day.done += 1;
        if (!colleagues.has(r.id)) {
          const j = judge(r, doc, today, calendar);
          // A record the score does not count (the register's holiday line) is still work done, and never late.
          if (j.outcome === "late") day.late += 1;
          else {
            day.onTime += 1;
            onTimeToday.push({ module: doc.module, at: at ?? "" });
            if (r.dueDate === today && on === today && at && new Date(at).getHours() < EARLY_BIRD_HOUR) earlyBird = true;
          }
        }
      }
    }

    // ---- the days behind (and today), for the streak, the week and the month — their own work only
    if (r.dueDate < lookbackFrom || r.dueDate > today || colleagues.has(r.id)) continue;
    const j = judge(r, doc, today, calendar);
    if (j.outcome !== "onTime" && j.outcome !== "late" && j.outcome !== "overdue") continue;
    const good = j.outcome === "onTime";
    const t = tally(byDay, r.dueDate);
    if (good) t.onTime += 1;
    else t.bad += 1;
    if (r.dueDate >= monthStart) {
      if (good) month.onTime += 1;
      else month.bad += 1;
      const m = tally(byModuleThisMonth, doc.module);
      if (good) m.onTime += 1;
      else m.bad += 1;
    }
    if (r.dueDate >= weekStart) {
      if (good) {
        week.onTime += 1;
        week.days.add(r.dueDate);
      } else week.bad += 1;
    }
  }
  day.total = day.done + day.remaining;

  // ---- the streak: back from yesterday, over working days only
  let streak = 0;
  let working = 0;
  for (let cursor = addDaysISO(today, -1); working < STREAK_WORKING_DAYS && cursor >= lookbackFrom; cursor = addDaysISO(cursor, -1)) {
    if (countedFrom && cursor < countedFrom) break;
    if (calendar.isClosedDay(cursor)) continue;
    working += 1;
    const t = byDay.get(cursor);
    if (!t) continue; // nothing of theirs fell due: neither adds nor breaks
    if (t.bad > 0) break;
    if (t.onTime > 0) streak += 1;
  }
  const todays = byDay.get(today);
  const streakIncludesToday = !!todays && todays.onTime > 0 && todays.bad === 0 && day.remaining === 0;
  const streakDays = streak + (streakIncludesToday ? 1 : 0);

  const judgedThisMonth = month.onTime + month.bad;
  const onTimeThisMonth = judgedThisMonth === 0 ? null : Math.round((100 * month.onTime) / judgedThisMonth);

  // ---- what today earned
  const achievements: AchievementKey[] = [];
  if (day.onTime > 0) achievements.push("first-on-time-today");
  if (earlyBird) achievements.push("early-bird");
  if (day.done > 0 && day.remaining === 0) achievements.push("all-done-today");
  if (streakIncludesToday && STREAK_MILESTONES.includes(streakDays)) achievements.push(`streak-${streakDays}`);
  if (day.onTime > 0 && week.bad === 0 && week.onTime >= 3 && week.days.size >= 2) achievements.push("clean-week");
  const modulesToday: string[] = [];
  for (const { module } of onTimeToday.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))) {
    if (modulesToday.includes(module)) continue;
    modulesToday.push(module);
    const m = byModuleThisMonth.get(module);
    if (m && m.bad === 0 && m.onTime >= MODULE_HERO_MIN) achievements.push(`module-hero:${module}`);
  }

  // ---- the next thing to do: worst first, as the day's notification orders it
  let next: NextTask | null = null;
  if (waiting.length > 0) {
    const rank = (w: { record: RecordInstance; doc: DocumentDefinition }) => PRIORITY_ORDER.indexOf(priorityOf(w.doc.schedule, daysBetween(today, w.record.dueDate)));
    const first = waiting
      .slice()
      .sort((a, b) => rank(a) - rank(b) || a.record.dueDate.localeCompare(b.record.dueDate) || calledBy(a.doc).localeCompare(calledBy(b.doc)))[0];
    next = {
      recordId: first.record.id,
      documentId: first.doc.id,
      what: calledBy(first.doc),
      formatNo: first.doc.formatNo && !first.doc.formatNo.toUpperCase().startsWith("TO BE") ? first.doc.formatNo : "",
      name: first.doc.name,
      module: first.doc.module,
      route: routeForRecord(first.doc, first.record.id),
      dueDate: first.record.dueDate,
      daysUntilDue: daysBetween(today, first.record.dueDate),
    };
  }

  return {
    today,
    firstName: input.firstName ?? "",
    day,
    gapScore: dayGapScore(day.done, day.total),
    streakDays,
    streakIncludesToday,
    onTimeThisMonth,
    judgedThisMonth,
    achievements,
    next,
    modulesToday,
    plantDay: false,
  };
}

// ---- The signed-in person's, from the repositories (cached) -------------------

/** The signed-in person as this file reads them: an AuthUser fits; a name alone works too (the person alone, nobody else's work told apart). */
export interface MotivationPerson {
  id?: string;
  name?: string | null;
  role?: string;
  departments?: readonly string[] | null;
}

/** The person as the scorecard's rule needs them — only with an account id to be told apart by. */
function selfOf(person: MotivationPerson | null | undefined): LatenessPerson | null {
  if (!person || typeof person.id !== "string" || !person.id) return null;
  return { id: person.id, name: person.name ?? "", role: person.role ?? "", departments: Array.isArray(person.departments) ? person.departments : [] };
}

// ---- The accounts of the person's departments (GET /api/users/directory) ---------------

/** How long the list is kept before it is asked for again: accounts change rarely. */
const ACCOUNTS_KEEP_MS = 5 * 60 * 1000;
/** After a list that could not be read, how long before it is asked for again. */
const ACCOUNTS_RETRY_MS = 60 * 1000;

/** The last list, for one account and the departments it had: `people` null when it could not be read. */
let accountsKept: { key: string; at: number; people: readonly LatenessPerson[] | null } | null = null;
let accountsAsked: { key: string; answer: Promise<boolean> } | null = null;

const accountsKeyOf = (self: LatenessPerson): string => `${self.id}|${keptTo(self).join("+")}`;

/** The accounts known for this person, or null (not asked yet, or unreadable): then they are counted alone. */
function knownAccounts(self: LatenessPerson | null): readonly LatenessPerson[] | null {
  return self && accountsKept && accountsKept.key === accountsKeyOf(self) ? accountsKept.people : null;
}

/**
 * ASK FOR THE ACCOUNTS OF THE PERSON'S DEPARTMENTS — the Performance
 * Scorecard's own list (GET /api/users/directory) — so a record a colleague of
 * a shared department handed in is never praised as theirs. Asked once, kept
 * five minutes (a minute after a failure), one request at a time; never for
 * the administrator or an account kept to no department (nothing of theirs is
 * anybody else's), and not while the browser is offline. Resolves true when a
 * new list came, so the caller works the figures out again; never rejects and
 * never logs. `read` is the request itself, replaceable in a test.
 */
export function askAccountsFor(
  person: MotivationPerson | null | undefined,
  read: () => Promise<{ people: readonly LatenessPerson[] }> = () => usersApi.directory()
): Promise<boolean> {
  const self = selfOf(person);
  if (!self || keptTo(self).length === 0) return Promise.resolve(false);
  const key = accountsKeyOf(self);
  if (accountsKept && accountsKept.key === key && Date.now() - accountsKept.at < (accountsKept.people ? ACCOUNTS_KEEP_MS : ACCOUNTS_RETRY_MS)) return Promise.resolve(false);
  if (accountsAsked && accountsAsked.key === key) return accountsAsked.answer;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return Promise.resolve(false);
  const answer = Promise.resolve()
    .then(read)
    .then(
      (res) => {
        const list = Array.isArray(res?.people) ? res.people : null;
        const people = list
          ? list
              .filter((p) => p && typeof p.id === "string" && typeof p.name === "string" && Array.isArray(p.departments))
              .map((p): LatenessPerson => ({
                id: p.id,
                name: p.name,
                role: typeof p.role === "string" ? p.role : "",
                departments: (p.departments as readonly unknown[]).filter((c): c is string => typeof c === "string"),
              }))
          : null;
        const before = accountsKept && accountsKept.key === key ? accountsKept.people : null;
        accountsKept = { key, at: Date.now(), people };
        return people !== null && JSON.stringify(people) !== JSON.stringify(before);
      },
      () => {
        accountsKept = { key, at: Date.now(), people: accountsKept && accountsKept.key === key ? accountsKept.people : null };
        return false;
      }
    )
    .finally(() => {
      if (accountsAsked && accountsAsked.answer === answer) accountsAsked = null;
    });
  accountsAsked = { key, answer };
  return answer;
}

let remembered: { key: string; records: readonly RecordInstance[]; master: unknown; people: readonly LatenessPerson[] | null; stats: MotivationStats } | null = null;

/**
 * THE SIGNED-IN PERSON'S DAY, STREAK AND BADGES. Their documents are the
 * ones they answer for and may fill (REQUIREMENTS §96, engine/departmentScope.ts
 * isMine: what the bell, the briefing and the scorecard count), never every
 * document they may see; among those, engine/notifications.ts's (daysWork): the
 * ones Master Data names them on while some of their work there is due, late or
 * coming up. The super admin answers for no document: their card is the plant's
 * day (every document), with no score of their own (`plantDay`). And
 * a record a colleague of a shared department handed in is that colleague's
 * (the accounts from askAccountsFor; until they are known, the person is
 * counted alone). Worked out once per change of the records, the day, the
 * person, the accounts or the master data; never call it while drawing.
 */
export function motivationFor(person: MotivationPerson | null | undefined, isDemo = false): MotivationStats {
  const today = todayISO();
  const master = masterRepository.get();
  const snapshot = recordRepository.snapshot();
  const visible = documentRepository.getRecordable().filter((d) => isMine(d.id));
  const plantDay = person?.role === "admin";
  const liveStart = isDemo ? null : settingsRepository.get().liveStartDate;
  const name = person?.name ?? "";
  const self = selfOf(person);
  const people = knownAccounts(self);
  const key = [today, isDemo ? "demo" : "live", sameName(name), self ? accountsKeyOf(self) : "", liveStart ?? "", plantDay ? "plant" : "", visible.map((d) => d.id).join(",")].join("|");
  if (remembered && remembered.key === key && remembered.records === snapshot && remembered.master === master && remembered.people === people) return remembered.stats;

  const me = sameName(name);
  const named = me ? visible.filter((d) => resolveResponsibleEmployees(d, master).some((e) => sameName(e.name) === me)) : [];
  // The day's notification's own answer: the named documents are theirs only while a reminder there names them.
  const theirOwn = named.length > 0 && daysWork(computeReminders(isDemo), { name }).theirOwn;
  const docs = theirOwn ? named : visible;
  const from = addDaysISO(today, -LOOKBACK_DAYS);
  const records: RecordInstance[] = [];
  for (const d of docs) {
    for (const r of recordRepository.query({ documentId: d.id, isDemo })) {
      // Older than the look-back: only if it is still open and its day has come
      // (the bell lists it however old it is), or it was handed in today (long overdue, finally in).
      if (r.dueDate >= from || (OPEN.has(r.status) && r.dueDate <= today) || localDateOf(r.submittedAt ?? null) === today) records.push(r);
    }
  }
  const stats = computeMotivation({
    docs,
    records,
    today,
    calendar: { isClosedDay: closedDays(master), countedFrom: liveStart },
    firstName: firstNameOf(name),
    self,
    people,
    departmentOf: (d) => departmentOfDocument(d.id, d.formatNo),
  });
  stats.plantDay = plantDay;
  remembered = { key, records: snapshot, master, people, stats };
  return stats;
}

/** The earliest day a document's next open record is due, from today on — for "the next one is due tomorrow". */
export function nextDueOf(documentId: string, today = todayISO(), isDemo = false): string | null {
  const closed = closedDays(masterRepository.get());
  let best: string | null = null;
  for (const r of recordRepository.query({ documentId, isDemo })) {
    if (!OPEN.has(r.status) || r.dueDate < today || closed(r.dueDate)) continue;
    if (best === null || r.dueDate < best) best = r.dueDate;
  }
  return best;
}

// ---- Celebrated once a day ---------------------------------------------------

/** What today earned that has not been celebrated yet today. */
export function newAchievements(stats: MotivationStats, celebrated: (key: string) => boolean = (k) => settingsRepository.doneToday("celebratedToday", stats.today, k)): AchievementKey[] {
  return stats.achievements.filter((k) => !celebrated(k));
}

/** Remembers that these were celebrated today (settings celebratedToday — per person, not handed on). */
export function markCelebrated(keys: readonly string[], today = todayISO()): void {
  for (const k of keys) settingsRepository.markDoneToday("celebratedToday", today, k);
}

// ---- The words -----------------------------------------------------------------

type Vars = Record<string, string | number | boolean | null | undefined>;
const PLACEHOLDER = /\{(\w+)\}/g;
const table = (lang: Language): Record<string, string> => (STRINGS[lang] ?? STRINGS.en) as Record<string, string>;
const EN = STRINGS.en as Record<string, string>;

function fill(template: string, vars: Vars): string {
  let out = template.replace(/\{ontime\}/g, "");
  const name = typeof vars.name === "string" ? vars.name.trim() : "";
  if (!name) {
    const leading = /^\s*\{name\}/.test(out);
    out = out.replace(/,\s*\{name\}/g, "").replace(/\{name\},\s*/g, "").replace(/\s*\{name\}/g, "");
    if (leading) out = out.charAt(0).toUpperCase() + out.slice(1);
  }
  return out.replace(PLACEHOLDER, (whole, k: string) => (k === "name" ? name : vars[k] === undefined || vars[k] === null ? whole : String(vars[k]))).trim();
}

/** One line of i18n/strings.motivation.ts, filled in. */
export function cheerText(lang: Language, key: string, vars: Vars = {}): string {
  return fill(table(lang)[key] ?? EN[key] ?? "", vars);
}

const variantsOf = new Map<string, string[]>();
/** Every numbered variant of one kind of line: "cheer.onTime" → cheer.onTime.1, cheer.onTime.2 … */
export function variantKeys(prefix: string): string[] {
  let keys = variantsOf.get(prefix);
  if (!keys) {
    const head = `${prefix}.`;
    keys = Object.keys(EN)
      .filter((k) => k.startsWith(head) && /^\d+$/.test(k.slice(head.length)))
      .sort((a, b) => Number(a.slice(head.length)) - Number(b.slice(head.length)));
    variantsOf.set(prefix, keys);
  }
  return keys;
}

/** A variant is said only when every figure it names is worth saying (judged on the English line, so both languages pick the same one). */
function sayable(template: string, vars: Vars): boolean {
  if (template.includes("{ontime}") && vars.ontime !== true) return false;
  for (const m of template.matchAll(PLACEHOLDER)) {
    const k = m[1];
    if (k === "name" || k === "ontime") continue;
    if (vars[k] === undefined || vars[k] === null || vars[k] === false) return false;
  }
  return true;
}

/** FNV-1a of the seed — engine/purpose.ts's pick — so a moment always reads the same way. */
function hashOf(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** One of a kind's variants, chosen by the seed among those that can be said. */
export function pickVariant(prefix: string, lang: Language, vars: Vars, seed: string): string {
  const all = variantKeys(prefix);
  const fit = all.filter((k) => sayable(EN[k] ?? "", vars));
  if (fit.length === 0) return "";
  return cheerText(lang, fit[hashOf(`${prefix}|${seed}`) % fit.length], vars);
}

export type PraiseKind =
  | "onTime"
  | "asRequired"
  | "again"
  | "verified"
  | "sentBack"
  | "dayDone"
  | "allDone"
  | "streak"
  | "earlyBird"
  | "cleanWeek"
  | "moduleHero"
  | "progress"
  | "dayHappy"
  | "nothingDue"
  | "sayAllDone"
  | "sayStreak";

const PREFIX: Record<PraiseKind, string> = {
  onTime: "cheer.onTime",
  asRequired: "cheer.asRequired",
  again: "cheer.again",
  verified: "cheer.verified",
  sentBack: "cheer.sentBack",
  dayDone: "cheer.dayDone",
  allDone: "cheer.allDone",
  streak: "cheer.streak",
  earlyBird: "cheer.earlyBird",
  cleanWeek: "cheer.cleanWeek",
  moduleHero: "cheer.moduleHero",
  progress: "cheer.progress",
  dayHappy: "cheer.dayHappy",
  nothingDue: "cheer.nothingDue",
  sayAllDone: "cheer.say.allDone",
  sayStreak: "cheer.say.streakMilestone",
};

/** The figures a line may name — each only when it is worth saying. */
function varsOf(stats: MotivationStats | null): Vars {
  if (!stats) return {};
  return {
    name: stats.firstName,
    count: stats.day.onTime >= 2 ? stats.day.onTime : undefined,
    done: stats.day.done >= 2 ? stats.day.done : undefined,
    left: stats.day.remaining > 0 ? stats.day.remaining : undefined,
    streak: stats.streakDays >= 2 ? stats.streakDays : undefined,
    pct: stats.onTimeThisMonth ?? undefined,
    ontime: stats.day.done > 0 && stats.day.late === 0 ? true : undefined,
  };
}

/** A warm line of one kind, chosen by `seed` among many — never the same few words every time. */
export function praiseLine(kind: PraiseKind, stats: MotivationStats | null, lang: Language, seed = ""): string {
  return pickVariant(PREFIX[kind], lang, varsOf(stats), `${kind}|${seed}`);
}

/** "due today" / "due tomorrow" / "3 days late" / "due on 29-Sep-2026". */
export function whenText(dueDate: string, today: string, lang: Language): string {
  const d = daysBetween(today, dueDate);
  if (d < 0) return cheerText(lang, d === -1 ? "cheer.when.late.one" : "cheer.when.late.many", { n: -d });
  if (d === 0) return cheerText(lang, "cheer.when.dueToday");
  if (d === 1) return cheerText(lang, "cheer.when.dueTomorrow");
  return cheerText(lang, "cheer.when.dueOn", { date: formatDisplayDate(dueDate) });
}

/**
 * THE GENTLE LINE, never a scolding one. "late": a record just handed in after
 * its day — "Done — a day late this time; the next one is due tomorrow — a
 * fresh chance to be on time." "waiting": records from earlier days still to do.
 */
export function lateLine(
  kind: "late" | "waiting",
  info: { days?: number; count?: number; nextDue?: string | null; today: string },
  lang: Language,
  seed = ""
): string {
  if (kind === "waiting") {
    const n = Math.max(1, info.count ?? 1);
    return cheerText(lang, n === 1 ? "cheer.waiting.one" : "cheer.waiting.many", { n });
  }
  const days = Math.max(1, info.days ?? 1);
  const lead = cheerText(lang, days === 1 ? "cheer.late.lead.one" : "cheer.late.lead.many", { days });
  const next = info.nextDue ?? null;
  const tomorrow = addDaysISO(info.today, 1);
  const tail =
    next === info.today
      ? cheerText(lang, "cheer.late.nextToday")
      : next === tomorrow
        ? cheerText(lang, "cheer.late.nextTomorrow")
        : next && next > info.today
          ? cheerText(lang, "cheer.late.nextOn", { date: formatDisplayDate(next) })
          : pickVariant("cheer.late.after", lang, {}, `late|${seed}`);
  return `${lead}${tail}`;
}

/**
 * THE LINE UNDER TODAY'S SCORE on the day card: what the number means and how
 * to reach 0. "8 of 10 done — finish 2 more to reach 0." / "All done — nothing
 * missing today." / "Nothing due today — nothing missing."
 */
export function gapScoreNote(done: number, total: number, lang: Language): string {
  if (!(total > 0)) return cheerText(lang, "cheer.score.line.free");
  const d = Math.min(Math.max(0, done), total);
  const left = total - d;
  if (left <= 0) return cheerText(lang, "cheer.score.line.perfect");
  return cheerText(lang, left === 1 ? "cheer.score.line.one" : "cheer.score.line.many", { done: d, total, left });
}

/**
 * TODAY'S SCORE, SAID ALOUD — for Mitra's spoken reminders: "You are at minus
 * 20 today — finish 2 more to reach zero." / "You are at zero today — nothing
 * missing. Well done!" In English or Gujarati (`lang`).
 */
export function gapScoreLine(done: number, total: number, lang: Language): string {
  if (!(total > 0)) return cheerText(lang, "cheer.say.score.free");
  const d = Math.min(Math.max(0, done), total);
  const left = total - d;
  if (left <= 0) return cheerText(lang, "cheer.say.score.zero");
  const n = -dayGapScore(d, total);
  return cheerText(lang, left === 1 ? "cheer.say.score.minus.one" : "cheer.say.score.minus.many", { n, left });
}

// ---- Under the reaction toast ----------------------------------------------------

export interface CheerContext {
  stats: MotivationStats | null;
  /** The language the line is shown in. */
  lang: Language;
  today: string;
  /** A document's module, for the purpose line of a first record of the day. */
  moduleOf?: (documentId: string) => string | undefined;
  /** When a document's next record is due, for the line under a late one. */
  nextDueOf?: (documentId: string) => string | null;
}

function onTimeCheer(stats: MotivationStats | null, module: string | undefined, lang: Language, seed: string): string {
  const count = stats?.day.onTime ?? 0;
  if (stats && count >= 2) {
    const head =
      stats.streakDays >= 2
        ? cheerText(lang, "cheer.toast.countStreak", { count, streak: stats.streakDays })
        : cheerText(lang, "cheer.toast.count", { count });
    return `${head}. ${praiseLine("onTime", stats, lang, seed)}`;
  }
  // The first of the day: why this module's records matter at all.
  return `✨ ${module ? purposeLine(module, lang, seed) : generalPurposeLine(lang, seed)}`;
}

/**
 * THE LINE UNDER MITRA'S REACTION (components/common/MitraReaction.tsx,
 * `reaction-cheer`) for the reaction made of `events` — one event, or several
 * said as one. Null when there is nothing to add.
 */
export function cheerLine(events: readonly ReactionEvent[], ctx: CheerContext): string | null {
  if (events.length === 0) return null;
  const { stats, lang } = ctx;
  const seed = `${ctx.today}|${events.map((e) => e.recordId ?? e.what).join(",")}`;
  const submitted = events.filter((e): e is Extract<ReactionEvent, { kind: "submitted" }> => e.kind === "submitted");
  if (submitted.some((e) => e.lastOneDue)) return praiseLine("dayDone", stats, lang, seed);

  if (events.length === 1) {
    const e = events[0];
    if (e.kind === "verified") return `👏 ${praiseLine("verified", stats, lang, seed)}`;
    if (e.kind === "rejected") return `🙏 ${praiseLine("sentBack", stats, lang, seed)}`;
    if (e.again) return `🔧 ${praiseLine("again", stats, lang, seed)}`;
    if (e.asRequired) return `📝 ${praiseLine("asRequired", stats, lang, seed)}`;
    const late = daysLate(e.dueDate, e.on);
    if (late > 0) {
      const nextDue = e.documentId && ctx.nextDueOf ? ctx.nextDueOf(e.documentId) : null;
      return `💪 ${lateLine("late", { days: late, nextDue, today: ctx.today }, lang, seed)}`;
    }
    return onTimeCheer(stats, e.documentId && ctx.moduleOf ? ctx.moduleOf(e.documentId) : undefined, lang, seed);
  }

  if (submitted.length === 0) {
    const verified = events.filter((e) => e.kind === "verified").length;
    return verified >= events.length - verified ? `👏 ${praiseLine("verified", stats, lang, seed)}` : `🙏 ${praiseLine("sentBack", stats, lang, seed)}`;
  }
  const allLate = submitted.every((e) => !e.asRequired && !e.again && daysLate(e.dueDate, e.on) > 0);
  // Several in at once, all of them after their day: no count of days to say, only that the gaps are closed.
  if (allLate) return `💪 ${pickVariant("cheer.late.after", lang, {}, `late|${seed}`).replace(/^[.;]\s*/, "")}`;
  return onTimeCheer(stats, undefined, lang, seed);
}

/** The toast's line for the signed-in person, from the repositories — asked in a timeout after the toast is up. */
export function toastCheer(events: readonly ReactionEvent[], person: MotivationPerson | null | undefined, lang: Language): string | null {
  const today = todayISO();
  let stats: MotivationStats | null = null;
  try {
    stats = motivationFor(person, false);
  } catch {
    stats = null;
  }
  return cheerLine(events, {
    stats,
    lang,
    today,
    moduleOf: (id) => documentRepository.getById(id)?.module,
    nextDueOf: (id) => nextDueOf(id, today),
  });
}

// ---- Badges, the all-done card and what is said aloud --------------------------------

export interface BadgeView {
  key: AchievementKey;
  emoji: string;
  label: string;
  /** The module of a "module hero" badge — for a tooltip on the Dashboard only; never printed in a celebration. */
  module?: string;
}

export function badgeFor(key: AchievementKey, lang: Language): BadgeView {
  if (key === "first-on-time-today") return { key, emoji: "🎯", label: cheerText(lang, "cheer.badge.first") };
  if (key === "all-done-today") return { key, emoji: "🌟", label: cheerText(lang, "cheer.badge.allDone") };
  if (key === "early-bird") return { key, emoji: "🌅", label: cheerText(lang, "cheer.badge.earlyBird") };
  if (key === "clean-week") return { key, emoji: "✨", label: cheerText(lang, "cheer.badge.cleanWeek") };
  if (key.startsWith("streak-")) return { key, emoji: "🔥", label: cheerText(lang, "cheer.badge.streak", { n: Number(key.slice(7)) || 0 }) };
  if (key.startsWith("module-hero:")) return { key, emoji: "🏅", label: cheerText(lang, "cheer.badge.moduleHero"), module: key.slice(12) };
  return { key, emoji: "⭐", label: key };
}

/** The badges worth a celebration of their own — the first on time is praised under the toast, all done by the big card. */
export function notableAchievements(keys: readonly AchievementKey[]): AchievementKey[] {
  return keys.filter((k) => k !== "first-on-time-today" && k !== "all-done-today");
}

/** The kind of praise that suits a set of badges best: a streak, then a whole module, a clean week, an early start. */
export function praiseKindFor(keys: readonly AchievementKey[]): PraiseKind {
  if (keys.some((k) => k.startsWith("streak-"))) return "streak";
  if (keys.some((k) => k.startsWith("module-hero:"))) return "moduleHero";
  if (keys.includes("clean-week")) return "cleanWeek";
  if (keys.includes("early-bird")) return "earlyBird";
  return "onTime";
}

export interface AllDoneView {
  title: string;
  /** "Today's score: 0 — nothing missing": the day card's score, at its best. */
  score: string;
  count: string;
  streak: string;
  onTime: string | null;
  praise: string;
  purpose: string;
  badges: BadgeView[];
}

/** "🌟 All done for today, Kavya!" — the card's words. No document and no module is named. */
export function allDoneView(stats: MotivationStats | null, fresh: readonly AchievementKey[], lang: Language, seed = ""): AllDoneView {
  const done = stats?.day.done ?? 0;
  const streak = stats?.streakDays ?? 0;
  return {
    title: cheerText(lang, "cheer.card.title", { name: stats?.firstName ?? "" }),
    score: cheerText(lang, "cheer.card.score"),
    count: cheerText(lang, done === 1 ? "cheer.card.count.one" : "cheer.card.count.many", { n: done }),
    streak: cheerText(lang, streak === 0 ? "cheer.card.streak.none" : streak === 1 ? "cheer.card.streak.one" : "cheer.card.streak.many", { n: streak }),
    onTime: stats && stats.onTimeThisMonth !== null ? cheerText(lang, "cheer.onTimeMonth", { pct: stats.onTimeThisMonth }) : null,
    praise: praiseLine("allDone", stats, lang, seed),
    purpose: generalPurposeLine(lang, seed),
    badges: notableAchievements(fresh).map((k) => badgeFor(k, lang)),
  };
}

/** What Mitra says aloud when the day is done: the praise with the first name, the count, the streak, and why it matters. */
export function spokenAllDone(stats: MotivationStats | null, lang: Language, seed = ""): string {
  const done = stats?.day.done ?? 0;
  const parts = [praiseLine("sayAllDone", stats ?? null, lang, seed) || cheerText(lang, "cheer.say.allDone.1", { name: stats?.firstName ?? "" })];
  if (done > 0) parts.push(cheerText(lang, done === 1 ? "cheer.say.count.one" : "cheer.say.count.many", { n: done }));
  if (stats && stats.streakDays >= 2) parts.push(cheerText(lang, "cheer.say.streak", { streak: stats.streakDays }));
  parts.push(generalPurposeLine(lang, seed));
  return parts.filter(Boolean).join(" ");
}

/** What Mitra says aloud on reaching a streak milestone. */
export function spokenStreak(stats: MotivationStats, lang: Language, seed = ""): string {
  return praiseLine("sayStreak", stats, lang, seed);
}

// ---- One press, several records: what the batch amounted to ------------------------

export interface BatchOutcome {
  onTime: number;
  late: number;
  /** As-required records: started when needed, so never late. */
  plain: number;
  /** Put right and handed in again. */
  again: number;
  verified: number;
  sentBack: number;
  lastOneDue: boolean;
}

export function outcomeOf(events: readonly ReactionEvent[]): BatchOutcome {
  const out: BatchOutcome = { onTime: 0, late: 0, plain: 0, again: 0, verified: 0, sentBack: 0, lastOneDue: false };
  for (const e of events) {
    if (e.kind === "verified") out.verified += 1;
    else if (e.kind === "rejected") out.sentBack += 1;
    else {
      if (e.lastOneDue) out.lastOneDue = true;
      if (e.again) out.again += 1;
      else if (e.asRequired) out.plain += 1;
      else if (daysLate(e.dueDate, e.on) > 0) out.late += 1;
      else out.onTime += 1;
    }
  }
  return out;
}

export type CelebrationKind = "all-done" | "badge" | "everyday";

/**
 * WHICH CEREMONY A BATCH GETS (components/common/Celebration.tsx). The big one
 * — the rain, the fanfare, the all-done card, Mitra saying so aloud — only
 * when the last thing due today went in: `lastOneDue`, the toast's own 🌟
 * "last one due today" (engine/recordLifecycle.ts, from what the bell still
 * lists), never the person's own tally alone, which may call the day done
 * while the bell still lists work. A badge card when work handed in on time
 * (or as required, or put right) earned a badge worth one; otherwise the
 * everyday answer.
 */
export function celebrationKind(outcome: BatchOutcome, fresh: readonly AchievementKey[]): CelebrationKind {
  if (outcome.lastOneDue) return "all-done";
  if (outcome.onTime + outcome.plain + outcome.again > 0 && notableAchievements(fresh).length > 0) return "badge";
  return "everyday";
}
