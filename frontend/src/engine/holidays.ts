import type { DocumentDefinition, MasterData } from "../types";
import { addDays, compareISO, formatDisplayDate, fromISODate } from "../utils/date";
import { dueDatesInMonth } from "./frequencyEngine";

// THE COMPANY'S WORKING CALENDAR — one place that answers "is the plant
// open on this date?" for every screen and engine.
//
// Three things make a day a non-working day or, unusually, a working one:
//   1. The weekly off. Gujarat Printpack's weekly holiday is THURSDAY
//      (Master Data → Holidays, `weeklyOffDay`; the leave calendar's
//      adjustment days are all Thursdays, which is how the notice itself
//      says so).
//   2. Festival holidays from the "Gujarat Print Pack Leave Calendar 2026"
//      (`holidays`).
//   3. Adjustment days (`adjustmentDays`): "Everyone must report to the
//      company on adjustment Day" — a Thursday the plant WORKS to make up for
//      a festival holiday. The opposite of a holiday.
//
// Scheduling follows from that: a Daily Pest Control Monitoring Record still
// exists on a holiday (pre-marked, like the "H O L I D A Y" rows on paper);
// other daily registers (the lamination log sheets) simply have no sheet on a
// closed day; and a fortnightly / monthly / quarterly / yearly obligation that
// lands on a closed day moves to the next working day — a service visit or
// fly-catcher inspection scheduled for a Thursday happens on the Friday, it
// doesn't vanish.

export const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DEFAULT_WEEKLY_OFF = 4; // Thursday

export type DayKind = "working" | "weekly-off" | "holiday" | "adjustment";

export interface DayInfo {
  date: string;
  weekday: string;
  kind: DayKind;
  isHoliday: boolean; // true = the plant is closed
  name?: string; // festival name, or the holiday an adjustment day makes up for
  label: string; // one-line explanation for banners and the assistant
  short: string; // chip text for the calendar ("Weekly off", "Janmashtami", "Working day")
}

export function weeklyOffDay(master: MasterData): number {
  const d = master.weeklyOffDay;
  return typeof d === "number" && d >= 0 && d <= 6 ? d : DEFAULT_WEEKLY_OFF;
}

export function dayInfo(dateISO: string, master: MasterData): DayInfo {
  const dow = fromISODate(dateISO).getDay();
  const weekday = WEEKDAY_LONG[dow];
  const festival = (master.holidays ?? []).find((h) => h.date === dateISO);
  if (festival) {
    return { date: dateISO, weekday, kind: "holiday", isHoliday: true, name: festival.name, label: `${festival.name} — company holiday`, short: festival.name };
  }
  const adjustment = (master.adjustmentDays ?? []).find((a) => a.date === dateISO);
  if (adjustment) {
    const forLabel = adjustment.forHoliday ? ` for ${adjustment.forHoliday}` : "";
    return {
      date: dateISO,
      weekday,
      kind: "adjustment",
      isHoliday: false,
      name: adjustment.forHoliday,
      label: `Adjustment day${forLabel} — the plant works this ${weekday}`,
      short: "Working day",
    };
  }
  if (dow === weeklyOffDay(master)) {
    return { date: dateISO, weekday, kind: "weekly-off", isHoliday: true, label: `${weekday} — weekly off`, short: "Weekly off" };
  }
  return { date: dateISO, weekday, kind: "working", isHoliday: false, label: "Working day", short: "" };
}

export function isCompanyHoliday(dateISO: string, master: MasterData): boolean {
  return dayInfo(dateISO, master).isHoliday;
}

// First working day on or after `dateISO` (bounded, so a mis-configured
// calendar can never loop forever — after the bound the date is returned as is).
export function nextWorkingDay(dateISO: string, master: MasterData, maxLookahead = 14): string {
  let d = dateISO;
  for (let i = 0; i < maxLookahead; i++) {
    if (!isCompanyHoliday(d, master)) return d;
    d = addDays(d, 1);
  }
  return d;
}

// Last working day on or before `dateISO` (bounded as nextWorkingDay is).
export function previousWorkingDay(dateISO: string, master: MasterData, maxLookback = 14): string {
  let d = dateISO;
  for (let i = 0; i < maxLookback; i++) {
    if (!isCompanyHoliday(d, master)) return d;
    d = addDays(d, -1);
  }
  return d;
}

/**
 * THE DAY A SCHEDULED SHEET IS DUE, IN ITS OWN MONTH (REQUIREMENTS §236): the next working day when the plant is closed on
 * the day the schedule names - unless that is next month's: a month-end sheet (F/HR/15 and F/HR/22 on the 31st) whose day
 * is the Thursday off, 31-12-2026, is due on the last working day before it, 30-12, and is December's sheet, listed under
 * December, never January's.
 */
export function workingDueDate(scheduled: string, master: MasterData): string {
  const next = nextWorkingDay(scheduled, master);
  if (next.slice(0, 7) === scheduled.slice(0, 7)) return next;
  const before = previousWorkingDay(scheduled, master);
  return before.slice(0, 7) === scheduled.slice(0, 7) ? before : next;
}

export function nextWeeklyOff(fromISO: string, master: MasterData): string {
  let d = fromISO;
  for (let i = 0; i < 14; i++) {
    if (dayInfo(d, master).kind === "weekly-off") return d;
    d = addDays(d, 1);
  }
  return d;
}

export interface EffectiveDueDate {
  scheduled: string; // the date the schedule names (periodKey is derived from this — stable)
  due: string; // the date the record is actually due (moved to the next working day when closed, kept in its month: workingDueDate)
  shifted: boolean;
  holiday: boolean; // daily schedules only: the scheduled day itself is a closed day
}

// The frequency engine's dates for a month, made holiday-aware. Daily
// schedules keep every date and just flag the closed ones (the caller decides
// whether a shell still exists — Daily Monitoring yes, lamination log sheets
// no); every other cadence moves a closed-day due date to the next working day.
export function effectiveDueDatesInMonth(doc: DocumentDefinition, year: number, month: number, master: MasterData): EffectiveDueDate[] {
  const scheduled = dueDatesInMonth(doc, year, month);
  if (doc.schedule.type === "daily" || doc.schedule.type === "as-required") {
    return scheduled.map((d) => ({ scheduled: d, due: d, shifted: false, holiday: isCompanyHoliday(d, master) }));
  }
  return scheduled.map((d) => {
    const due = workingDueDate(d, master);
    return { scheduled: d, due, shifted: due !== d, holiday: false };
  });
}

// Festival holidays and adjustment days ahead of `fromISO` (weekly offs are
// every week, so they're not listed — see nextWeeklyOff). Sorted by date.
export function upcomingHolidays(fromISO: string, master: MasterData, limit = 6, horizonDays = 120): DayInfo[] {
  const out: DayInfo[] = [];
  const horizon = addDays(fromISO, horizonDays);
  const dates = [
    ...(master.holidays ?? []).map((h) => h.date),
    ...(master.adjustmentDays ?? []).map((a) => a.date),
  ]
    .filter((d) => compareISO(d, fromISO) >= 0 && compareISO(d, horizon) <= 0)
    .sort(compareISO);
  for (const d of dates) {
    if (out.some((x) => x.date === d)) continue;
    out.push(dayInfo(d, master));
    if (out.length >= limit) break;
  }
  return out;
}

export function describeDay(info: DayInfo): string {
  return `${info.weekday}, ${formatDisplayDate(info.date)} — ${info.label}`;
}
