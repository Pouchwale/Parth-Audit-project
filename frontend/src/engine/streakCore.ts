// THE DAILY STREAK: ONE RULE, FOR THE PAGE AND FOR THE SERVER (the owner, 25-Oct-2026).
//
// "Also add streak for user can atleast login daily for once and complete it work which is help to
// improve there score so there improved like snapchat."
//
// A STREAK is the working days in a row a person KEPT. A day is kept when they signed in at least once
// that day - on the website or on the Mitra phone app - and nothing of theirs that fell due that day
// ended late or was never done. On a working day with nothing of theirs due, the sign-in alone keeps it:
// the habit asked for is coming in every working day. A working day with no sign-in, or with a record of
// theirs that ended late or was never done, BREAKS it. Closed days are stepped over - the weekly off
// (Thursday), a festival holiday, and every day before the system went live - and an adjustment day (a
// Thursday the plant works to make up for a festival) is a working day like any other.
//
// TODAY joins once they have signed in (being signed in now counts) and nothing of theirs is still
// waiting, due today or from an earlier day. Until then today is AT RISK, never broken: the run ending
// yesterday stands until the day is over. From 15:30 the top bar says so (STREAK_AT_RISK_FROM).
//
// WHERE THE SIGN-INS ARE NOT KNOWN - the browser offline, the list not read, or a day before the
// person's first sign-in on record (user_sessions is kept from 9-Oct-2026) - a day is judged by the
// records alone, the rule before sign-ins counted (REQUIREMENTS §81): kept when something of theirs fell
// due and all of it was in on time, broken by a late or never-done record, neither kept nor broken when
// nothing fell due ("free"). A gap in what is known is never read as a day missed.
//
// The walk counts back at most STREAK_WORKING_DAYS working days and never past the records read
// (STREAK_LOOKBACK_DAYS calendar days), so a 100-day milestone can be reached and it stays a few hundred
// steps of a Set and a Map - nothing on the plant's low-end laptops notices it.
//
// WITH NO IMPORTS AT ALL - like engine/latenessCore.ts - so the server (Node's type stripping, which
// cannot follow the app's extensionless imports) can load it as it is, should it ever say the streak
// itself (a push to the phone at 15:30, say). On time, late and never done stay latenessCore's
// judgement: the caller judges its records and hands the tally in, day by day.
//
// frontend/tests/streakCore.test.ts holds it to hand-made calendars.

/** The streak counts back at most this many working days (yesterday first). */
export const STREAK_WORKING_DAYS = 100;
/** Calendar days of records read for it: 100 working days, the weekly offs and a festival season between them. */
export const STREAK_LOOKBACK_DAYS = 160;
/** Streak lengths that are a milestone of their own: a badge, a card, Mitra saying so aloud. */
export const STREAK_MILESTONES: readonly number[] = [3, 5, 10, 20, 50, 100];
/** The day card's strip: the last fourteen days, today the last of them. */
export const STREAK_STRIP_DAYS = 14;
/** From this time of day (minutes after midnight, the plant's clock) a streak whose today is not kept yet shows the hourglass. */
export const STREAK_AT_RISK_FROM = 15 * 60 + 30;

/**
 * One day of the strip. kept: signed in and nothing missed (or, where sign-ins are not known, all of
 * it in on time); missed: no sign-in, or something late or never done; closed: the weekly off, a
 * festival, a day before the system went live; today: today, still open; free: a day judged by the
 * records alone with nothing of theirs due - it neither adds nor breaks.
 */
export type StreakDayState = "kept" | "missed" | "closed" | "today" | "free";

export interface StreakDay {
  date: string;
  state: StreakDayState;
}

/** A day's records of theirs, judged (latenessCore judge): in on time, and ended late or never done. */
export interface StreakDayTally {
  onTime: number;
  bad: number;
}

/**
 * The plant days the person signed in on, and the day from which a working day without one breaks the
 * streak: their first sign-in on record. Before `from` (and on every day, while `from` is null) the
 * sign-ins are not known and a day is judged by its records alone.
 */
export interface StreakSignIns {
  days: ReadonlySet<string>;
  from: string | null;
}

export interface StreakInput {
  /** The plant's date today, YYYY-MM-DD. */
  today: string;
  /** Their records' tally by the day each was due; a day with nothing of theirs judged is absent. */
  judged: ReadonlyMap<string, StreakDayTally>;
  /** Records of theirs still waiting today (due today, or from an earlier day): today is kept only once this is 0. */
  waiting: number;
  /** The days they signed in; null (or left out) when not known: every day is judged by its records alone. */
  signIns?: StreakSignIns | null;
  isClosedDay: (dateISO: string) => boolean;
  /** The day the system went live: the streak never reaches back before it. */
  countedFrom?: string | null;
}

export interface StreakResult {
  /** The streak: the run ending yesterday, and today once today is kept. */
  days: number;
  /** The run ending yesterday, before today joins it. */
  before: number;
  todayKept: boolean;
  /** Today is a working day not kept yet, and the run before it would be lost if the day ended now. */
  todayAtRisk: boolean;
  /** Today is a working day on or after go-live (not the weekly off, a festival, or a day before the system went live). */
  todayIsWorking: boolean;
  /** The longest run within the same walk, today's run included. */
  best: number;
  /** The last STREAK_STRIP_DAYS days, oldest first, today last. */
  lastDays: StreakDay[];
  /** Whether the sign-ins were known (false: every day judged by its records alone). */
  signInsKnown: boolean;
  /** The next working day after today: "sign in tomorrow", or the day it really is. */
  nextWorkingDay: string;
}

// ---- The few lines of date arithmetic, written in (no imports) --------------

const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

/** An ISO date n days on (or back), worked in UTC so no clock's summer time can move it (latenessCore addDaysISO). */
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const when = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + n));
  return `${when.getUTCFullYear()}-${pad2(when.getUTCMonth() + 1)}-${pad2(when.getUTCDate())}`;
}

/** A plant date as YYYY-MM-DD, or false: what a sign-in day must look like to be read at all. */
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// ---- The sign-ins, as the rule reads them -------------------------------------

/**
 * The sign-ins as the rule reads them, from what the server keeps (GET /api/me/sign-in-days): the
 * days, with today among them while the person is signed in now, and the first day of them on record -
 * today, for somebody whose first sign-in is this one. Anything that is not a plant date is left out.
 */
export function streakSignIns(days: Iterable<unknown>, firstDay: unknown, today: string, signedInNow: boolean): StreakSignIns {
  const set = new Set<string>();
  for (const d of days) if (isDay(d)) set.add(d);
  if (signedInNow) set.add(today);
  const firsts = [isDay(firstDay) ? firstDay : null, signedInNow ? today : null].filter((d): d is string => d !== null).sort();
  return { days: set, from: firsts[0] ?? null };
}

// ---- The streak ---------------------------------------------------------------

/** A past working day: kept, missed, or (judged by the records alone, with nothing due) free. */
type PastState = "kept" | "missed" | "free";

/** THE STREAK, worked out from the person's judged days, their sign-ins and the plant's calendar. */
export function judgeStreak(input: StreakInput): StreakResult {
  const { today, judged, isClosedDay } = input;
  const countedFrom = input.countedFrom ?? null;
  const signIns = input.signIns ?? null;
  const waiting = Number.isFinite(input.waiting) ? Math.max(0, input.waiting) : 0;
  const lookbackFrom = addDays(today, -STREAK_LOOKBACK_DAYS);

  /** Whether a working day is held to the sign-in: from the first sign-in on record on. */
  const signInCounts = (d: string): boolean => !!signIns && signIns.from !== null && d >= signIns.from;
  /** Stepped over: the weekly off, a festival, a day before go-live. */
  const closed = (d: string): boolean => isClosedDay(d) || (!!countedFrom && d < countedFrom);

  const past = (d: string): PastState => {
    const t = judged.get(d);
    if (t && t.bad > 0) return "missed";
    if (signInCounts(d)) return signIns!.days.has(d) ? "kept" : "missed";
    return t && t.onTime > 0 ? "kept" : "free";
  };

  // Today: signed in (or, not known, something of theirs in on time), nothing late, nothing waiting.
  const todayIsWorking = !closed(today);
  const todays = judged.get(today);
  const todayBad = !!todays && todays.bad > 0;
  const todayKept =
    todayIsWorking && !todayBad && waiting === 0 && (signInCounts(today) ? signIns!.days.has(today) : !!todays && todays.onTime > 0);

  // The walk: yesterday back, over working days only - newest first.
  const walked: PastState[] = [];
  for (let cursor = addDays(today, -1), working = 0; working < STREAK_WORKING_DAYS && cursor >= lookbackFrom; cursor = addDays(cursor, -1)) {
    if (countedFrom && cursor < countedFrom) break;
    if (isClosedDay(cursor)) continue;
    working += 1;
    walked.push(past(cursor));
  }
  let before = 0;
  for (const s of walked) {
    if (s === "missed") break;
    if (s === "kept") before += 1;
  }
  // The best run of the same walk, oldest first; a free day neither adds nor breaks.
  let best = 0;
  let run = 0;
  for (let i = walked.length - 1; i >= 0; i--) {
    if (walked[i] === "missed") run = 0;
    else if (walked[i] === "kept") best = Math.max(best, (run += 1));
  }
  const days = before + (todayKept ? 1 : 0);
  best = Math.max(best, days);

  // At risk: the run would be lost if today ended as it stands - held to the sign-in, anything not kept
  // is lost; judged by the records alone, only something still waiting is (nothing due neither adds nor breaks).
  const todayAtRisk = todayIsWorking && !todayKept && before > 0 && (signInCounts(today) || waiting > 0 || todayBad);

  const lastDays: StreakDay[] = [];
  for (let i = STREAK_STRIP_DAYS - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const state: StreakDayState = closed(date) ? "closed" : date === today ? (todayKept ? "kept" : "today") : past(date);
    lastDays.push({ date, state });
  }

  let nextWorkingDay = addDays(today, 1);
  for (let i = 0; i < 31 && isClosedDay(nextWorkingDay); i++) nextWorkingDay = addDays(nextWorkingDay, 1);

  return { days, before, todayKept, todayAtRisk, todayIsWorking, best, lastDays, signInsKnown: !!signIns && signIns.from !== null, nextWorkingDay };
}

/** Whether the streak shows the hourglass now: today at risk, and the time of day at or past STREAK_AT_RISK_FROM. */
export function showsAtRisk(streak: Pick<StreakResult, "todayAtRisk">, minutesNow: number): boolean {
  return streak.todayAtRisk && minutesNow >= STREAK_AT_RISK_FROM;
}

/** Whether a streak of this length is a milestone of its own. */
export const isStreakMilestone = (n: number): boolean => STREAK_MILESTONES.includes(n);
