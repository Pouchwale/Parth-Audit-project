// THE TRAINING PLAN CALENDAR PLANS THE YEAR, AND THE SYSTEM KEEPS TO ITS DATES (F/HR/09; the owner, 2-Nov-2026:
// "from March 2027 it should plan for next March 2028 ... the system will plan the date for various trainings which are
// there in the document and it will remind the responsible person that this day this training is coming, so do it and
// write the actual date").
//
// The calendar is one sheet a year, April to March, nineteen topics (or whatever the last calendar holds), each with a
// Plan cell and an Actual cell under every month. The paper marks a planned month with X and writes the date the
// training was held under it; the plant also writes the intended date ahead of time. DCRS reads both ways:
//
//   Plan     X, as the paper prints it (§272; the owner, 21-Nov-2026: "don't write yes instead of that keep X"). The day
//            picked for it is kept on the line, out of sight (dayKey). An older "Yes" or date reads as planned too
//   Actual   the date the training was held, written by the person; the plant's pre-written date counts once its day
//            has passed
//
// THE NEXT YEAR'S CALENDAR is drawn from this year's (nextYearPlan): every topic with its source, method, duration and
// evaluation; every planned month planned again, on the same day of the month it was held (or planned) this year, moved
// forward off the weekly off and the festival holidays; the 15th where this year's month has no date at all. The Actual
// cells start empty.
//
// THE SYSTEM WRITES THE DATES, EVERY YEAR (calendarDatesDue; the owner, 21-Nov-2026, REQUIREMENTS §271, §272: "keep X in that
// planned date and user get notification and on that day of actual date should come directly and it is random date
// only"): every planned month has a random working day, told to the people who answer for F/HR/09 ahead of it, and on that
// day the date is written under Actual once - never before it (§201). A person's date under Actual stands, they change it
// where the training was held on another day, and a date they clear because it was not held is not written back.
//
// THE TRAININGS A CALENDAR PLANS (plannedTrainings): one per topic and planned month, each with its date - the date in
// the Plan cell, else the date pre-written under Actual, else the month's last working day - and whether it has been
// held. engine/notificationPlan.ts tells the people who answer for F/HR/09 of each one ahead of its day and every day
// after it until the actual date is written (kind `training`).
//
// WITH NO IMPORTS AT ALL, like engine/notificationPlan.ts: the server's engine host runs it on the plant's calendar.

export const TRAINING_CALENDAR_ID = "hr-training-calendar";

/** The calendar's months in order: April first, March last. */
export const CALENDAR_MONTH_NAMES = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"] as const;

export const planKey = (monthIndex: number): string => `m${monthIndex}Plan`;
export const actualKey = (monthIndex: number): string => `m${monthIndex}Actual`;
/** What the Plan cell of a planned month reads, as the paper prints it (§272). */
export const PLAN_MARK = "X";
/** The day the system planned the month's training for, kept on the line and shown nowhere on the sheet (§272). */
export const dayKey = (monthIndex: number): string => `trainingDay${monthIndex}`;
/** The month's Actual is past the system's one writing: "system" wrote it, or it was "kept" as a person left it (§272). */
export const settledKey = (monthIndex: number): string => `trainingSettled${monthIndex}`;
const SETTLED_BY_SYSTEM = "system";
const SETTLED_KEPT = "kept";

/** The calendar's fixed columns: the topic and how it is trained, carried from one year to the next as they are. */
export const CALENDAR_FIXED_KEYS = ["parameter", "source", "method", "duration", "evaluation"] as const;

type Cells = Record<string, unknown>;

const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`);
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** An ISO date n days on (or back), in UTC so no clock's summer time moves it. */
function addDays(iso: string, n: number): string {
  const m = DAY_RE.exec(iso);
  const when = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n)) : new Date(NaN);
  return `${when.getUTCFullYear()}-${pad2(when.getUTCMonth() + 1)}-${pad2(when.getUTCDate())}`;
}

const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

const isoOf = (year: number, month: number, day: number): string => `${year}-${pad2(month)}-${pad2(Math.min(Math.max(1, day), daysInMonth(year, month)))}`;

/**
 * The first April of the year a calendar due on `dueDate` covers: a calendar due 31-03-2028 (or filed 01-04-2027) runs
 * from April 2027 to March 2028.
 */
export function calendarStartYear(dueDate: string): number {
  const m = DAY_RE.exec(dueDate);
  if (!m) return new Date().getFullYear();
  return Number(m[2]) >= 4 ? Number(m[1]) : Number(m[1]) - 1;
}

/** The period the calendar's own box names: "01-04-2027 ~ 31-03-2028" (dates as the app writes them, REQUIREMENTS §171). */
export function calendarPeriod(dueDate: string): string {
  const start = calendarStartYear(dueDate);
  return `01-04-${start} ~ 31-03-${start + 1}`;
}

/** The year and month (1-12) of the calendar's month `i` (0 = April) in the year starting `startYear`. */
export function calendarMonth(startYear: number, i: number): { year: number; month: number } {
  return i < 9 ? { year: startYear, month: i + 4 } : { year: startYear + 1, month: i - 8 };
}

/** A date as the app writes it, "22-07-2027" (utils/date.ts formatDisplayDate, written in; REQUIREMENTS §171). */
export function displayDay(iso: string): string {
  const m = DAY_RE.exec(iso);
  if (!m) return iso;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * A date as a person wrote it in a cell under the month `month` (1-12) of `year`: "2027-07-22", "22-07-27", "22.07.2027",
 * "7/22/2026" (the paper writes month first with slashes), "2/4/2027" under February (so the 4th), or just "22". The
 * column's own month settles which figure is the day when either could be. Null for anything that is not a date.
 */
export function writtenDate(text: unknown, year: number, month: number): string | null {
  const t = str(text);
  if (!t) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})$/.exec(t);
  if (m) return valid(year, month, Number(m[1]));
  m = /^(\d{1,2})([-./])(\d{1,2})\2(\d{2}|\d{4})$/.exec(t);
  if (!m) return null;
  const [a, sep, b] = [Number(m[1]), m[2], Number(m[3])];
  const y = m[4].length === 2 ? 2000 + Number(m[4]) : Number(m[4]);
  // Which figure is the month. With dashes or dots the app's way, day first ("04-11-26" is 4 November), unless the
  // second figure can only be a day. With slashes the paper's way, month first ("7/22/2026"), unless a figure past 12
  // can only be the day, or only one of the two is this column's month ("2/4/2027" under February is the 4th).
  let monthFirst: boolean;
  if (sep !== "/") monthFirst = b > 12 && a <= 12;
  else if (a > 12) monthFirst = false;
  else if (b > 12) monthFirst = true;
  else if (a === month && b !== month) monthFirst = true;
  else if (b === month && a !== month) monthFirst = false;
  else monthFirst = true;
  return monthFirst ? valid(y, a, b) : valid(y, b, a);
}

function valid(y: number, m: number, d: number): string | null {
  if (!(y >= 1990 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m))) return null;
  return isoOf(y, m, d);
}

export type ClosedDay = (iso: string) => boolean;

/** `iso` or the first working day after it. */
export function onWorkingDay(iso: string, isClosedDay: ClosedDay): string {
  let day = iso;
  for (let i = 0; i < 14 && isClosedDay(day); i++) day = addDays(day, 1);
  return day;
}

/** The last working day of the month (1-12). */
export function lastWorkingDay(year: number, month: number, isClosedDay: ClosedDay): string {
  let day = isoOf(year, month, daysInMonth(year, month));
  for (let i = 0; i < 14 && isClosedDay(day); i++) day = addDays(day, -1);
  return day;
}

export interface PlannedTraining {
  /** The line and month: "<row id>|<month index>", one per training, the notification's key. */
  key: string;
  topic: string;
  /** The source of training (the trainer), as the calendar names it. */
  by: string;
  /** The day it is planned for (YYYY-MM-DD). */
  date: string;
  /** The actual date is written (or the plant's pre-written date has passed): nothing more to tell. */
  held: boolean;
  monthIndex: number;
}

/**
 * The trainings a calendar due on `dueDate` plans, from its lines: one per topic and planned month. Planned: the Plan
 * cell holds anything (the paper's "Yes", DCRS's date). Its date: the date in the Plan cell, else the one written under
 * Actual, else the month's last working day. Held: an Actual date on or before `today` (or words that are no date).
 */
export function plannedTrainings(rows: readonly Cells[] | undefined, dueDate: string, today: string, isClosedDay: ClosedDay): PlannedTraining[] {
  const start = calendarStartYear(dueDate);
  const out: PlannedTraining[] = [];
  (rows ?? []).forEach((row, ri) => {
    const id = str(row.id) || String(ri);
    for (let i = 0; i < 12; i++) {
      const plan = str(row[planKey(i)]);
      if (!plan) continue;
      const { year, month } = calendarMonth(start, i);
      const actual = str(row[actualKey(i)]);
      const actualDate = writtenDate(actual, year, month);
      const planned = writtenDate(plan, year, month);
      const date = planned ?? actualDate ?? writtenDate(row[dayKey(i)], year, month) ?? lastWorkingDay(year, month, isClosedDay);
      // The date the system wrote this morning: the people are still told of today's training (§272).
      const writtenToday = str(row[settledKey(i)]) === SETTLED_BY_SYSTEM && actualDate === today;
      const held = !!actual && (actualDate === null || actualDate <= today) && !writtenToday;
      out.push({ key: `${id}|${i}`, topic: str(row.parameter), by: str(row.source), date, held, monthIndex: i });
    }
  });
  return out;
}

/**
 * NEXT YEAR'S LINES from this year's: every topic as it is, every planned month planned again with its X and a new random
 * working day (§272). The Actual cells are empty until each day comes. `nextDueDate` is the new calendar's due date (its
 * 31st March).
 */
export function nextYearPlan(previousRows: readonly Cells[], nextDueDate: string, isClosedDay: ClosedDay): Record<string, string>[] {
  const start = calendarStartYear(nextDueDate);
  return previousRows.map((prev) => {
    const row: Record<string, string> = {};
    for (const k of CALENDAR_FIXED_KEYS) row[k] = str(prev[k]);
    for (let i = 0; i < 12; i++) {
      const plan = str(prev[planKey(i)]);
      if (!plan) {
        row[planKey(i)] = "";
        row[actualKey(i)] = "";
        continue;
      }
      const { year, month } = calendarMonth(start, i);
      row[planKey(i)] = PLAN_MARK;
      row[dayKey(i)] = randomWorkingDay(`${str(prev.parameter)}|${str(prev.source)}`, year, month, isClosedDay) ?? lastWorkingDay(year, month, isClosedDay);
      row[actualKey(i)] = "";
    }
    return row;
  });
}

/** `iso` or the next working day, kept under its own month's column: the month's last working day where none is left after it. */
function workingDayInMonth(iso: string, isClosedDay: ClosedDay): string {
  const day = onWorkingDay(iso, isClosedDay);
  return day.slice(0, 7) === iso.slice(0, 7) ? day : lastWorkingDay(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), isClosedDay);
}

/** The first day the system writes an Actual date (§271): a planned day before it was the paper's to record, and is not written in afterwards. */
export const ACTUALS_WRITTEN_FROM = "2026-11-21";

/**
 * A working day of the month, picked at random but the same every time for the same topic and month, so the plant's days
 * differ from topic to topic and year to year. `notBefore` keeps it from a day already gone; null when no working day is left.
 */
export function randomWorkingDay(seed: string, year: number, month: number, isClosedDay: ClosedDay, notBefore = ""): string | null {
  const days: string[] = [];
  for (let d = 1; d <= daysInMonth(year, month); d++) {
    const iso = isoOf(year, month, d);
    if (iso >= notBefore && !isClosedDay(iso)) days.push(iso);
  }
  if (days.length === 0) return null;
  let h = 2166136261;
  for (const ch of `${seed}|${year}-${month}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return days[((h ^ (h >>> 16)) >>> 0) % days.length];
}

/**
 * THE DATES DUE ON A CALENDAR (§271, §272). For each planned month:
 *   - the Plan cell reads X. Its day is kept on the line, out of sight (dayKey): a date typed under Plan, else the day
 *     already kept, else the day written under Actual (one still to come moves out of Actual, off a closed day), else a
 *     random working day from today on. A month already gone with no date gets no day;
 *   - on that day a blank Actual takes the date, ONCE (settledKey). If a person clears it because the training was not held,
 *     it stays clear. A day before ACTUALS_WRITTEN_FROM, or one typed after it had passed, is never written in.
 * Whatever else is in a cell stays. The lines with the dates in; null when there is nothing to write.
 */
export function calendarDatesDue<T extends Cells>(rows: readonly T[], dueDate: string, today: string, isClosedDay: ClosedDay): T[] | null {
  const start = calendarStartYear(dueDate);
  let changed = false;
  const next = rows.map((row) => {
    const cells: Cells = { ...row };
    const put = (key: string, value: string) => {
      if (str(cells[key]) === value) return;
      cells[key] = value;
      changed = true;
    };
    for (let i = 0; i < 12; i++) {
      const plan = str(row[planKey(i)]);
      if (!plan) {
        // The X taken off: its day goes with it.
        for (const key of [dayKey(i), settledKey(i)]) {
          if (key in cells) {
            delete cells[key];
            changed = true;
          }
        }
        continue;
      }
      const { year, month } = calendarMonth(start, i);
      let actual = str(row[actualKey(i)]);
      const written = writtenDate(actual, year, month);
      const typed = writtenDate(plan, year, month);
      // Words of a person's own under Plan are theirs: only the mark ("Yes", x) or a date is read as the plan.
      if (!typed && !/^(?:x|yes)$/i.test(plan)) continue;
      const kept = writtenDate(row[dayKey(i)], year, month);
      let settled = str(row[settledKey(i)]);
      let day = typed ?? kept;
      if (typed && typed !== kept) settled = !actual && typed < today ? SETTLED_KEPT : "";
      if (!day) {
        if (written && written <= today) day = written;
        else if (written) {
          day = workingDayInMonth(written, isClosedDay);
          actual = "";
        } else day = randomWorkingDay(`${str(row.parameter)}|${str(row.source)}`, year, month, isClosedDay, today);
      }
      put(planKey(i), PLAN_MARK);
      put(actualKey(i), actual);
      if (day) {
        put(dayKey(i), day);
        if (!settled && actual && (written ?? day) <= today) settled = SETTLED_KEPT;
        if (!settled && !actual && day >= ACTUALS_WRITTEN_FROM && day <= today) {
          put(actualKey(i), displayDay(day));
          settled = SETTLED_BY_SYSTEM;
        }
      }
      if (settled) put(settledKey(i), settled);
      else if (settledKey(i) in cells) {
        delete cells[settledKey(i)];
        changed = true;
      }
    }
    return cells as T;
  });
  return changed ? next : null;
}

/** How many of the lines plan at least one training. */
export const plannedCount = (rows: readonly Cells[]): number => rows.reduce((n, r) => n + (Array.from({ length: 12 }, (_, i) => str(r[planKey(i)])).some(Boolean) ? 1 : 0), 0);
