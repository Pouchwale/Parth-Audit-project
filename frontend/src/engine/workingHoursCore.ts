// THE PLANT'S WORKING HOURS AND ITS CALENDAR — ONE RULE FOR THE SERVER AND THE
// BROWSER (REQUIREMENTS §84).
//
// The owner, 30-Sep-2026: "Daily working hours: after them nobody but the admin
// can use this software. The time runs from 8:40 am to 6:20 pm. Mostly Thursday
// is the holiday — check the company's calendar properly, because there are
// adjustment days too, and sometimes a Thursday counts as a working day, so the
// software must run on that day as well."
//
// So DCRS is OPEN on a WORKING DAY of the plant's calendar from START to END,
// in the factory's own time zone, and closed at every other moment:
//   * a working day is a day the leave calendar does not close — a festival
//     holiday is closed, an adjustment day is open, and otherwise the weekly off
//     (Thursday unless Master Data says another day) is closed. This is exactly
//     engine/holidays.ts dayInfo and engine/latenessCore.ts plantClosedDays;
//     frontend/tests/workingHours.test.ts holds the three to each other for
//     every day of 2026;
//   * START and END are master data (`MasterData.workingHours`, "HH:MM",
//     24-hour), 08:40 and 18:20 when absent or unreadable — edited on the Master
//     Data page by the super admin;
//   * the factory's time zone is the server's PLANT_TIMEZONE (backend/db.ts,
//     Asia/Kolkata unless set), handed to every function here, so a browser or a
//     server whose own clock runs in another zone reads the same answer.
//
// Who is held to it (the server's gate, backend/workingHours.ts): every account
// but the super admin. A session lasts until the close of the day it was
// started — END for a non-admin, midnight for the super admin — so every
// morning starts with signing in.
//
// WITH NO IMPORTS AT ALL, like latenessCore.ts and data/seed/documentDepartments.ts:
// the server runs its .ts files with Node's type stripping, which cannot follow
// the app's extensionless imports. Everything it needs is written in here or
// passed in. It is also cheap: a calendar is read once per master object, and
// the time zone's formatter is made once per zone.

// ---------------------------------------------------------------------------
// the constants every side agrees on

/** The plant's hours when Master Data says none (the owner's words: 8:40 am to 6:20 pm). */
export const DEFAULT_WORKING_HOURS: { readonly start: string; readonly end: string } = { start: "08:40", end: "18:20" };
/** The factory's time zone when the server says none (backend/db.ts plantTimeZone). */
export const DEFAULT_PLANT_TIME_ZONE = "Asia/Kolkata";
/** Thursday (0 = Sunday … 6 = Saturday) — engine/holidays.ts DEFAULT_WEEKLY_OFF. */
export const DEFAULT_WEEKLY_OFF_DAY = 4;
/** The browser warns this long before a non-admin's session closes (C4). */
export const CLOSING_WARNING_MS = 10 * 60 * 1000;
/** What the server says a refusal outside the hours IS (C2). */
export const OUTSIDE_HOURS_CODE = "outside-working-hours";
/** Why the browser signed a person out at the close of the day (C4) — POST /api/auth/logout { reason }. */
export const END_OF_HOURS_REASON = "end-of-working-hours";
/** Why the browser signed a person out when the server refused a session outside the hours. */
export const OUTSIDE_HOURS_REASON = "outside-working-hours";
/** How far ahead the next working day is looked for — a whole year, so a calendar that closes every day cannot loop. */
const LOOKAHEAD_DAYS = 400;

// ---------------------------------------------------------------------------
// the shapes

/** The fields of MasterData the rule reads — the app's MasterData fits, and so does the master item parsed on the server. */
export interface HoursCalendar {
  weeklyOffDay?: number | null;
  holidays?: readonly unknown[] | null;
  adjustmentDays?: readonly unknown[] | null;
  workingHours?: { start?: unknown; end?: unknown } | null;
}

/** The plant's opening hours, read and checked. Minutes are counted from midnight. */
export interface PlantHours {
  start: string;
  end: string;
  startMinute: number;
  endMinute: number;
  /** True when Master Data says nothing usable and the owner's 08:40–18:20 is in force. */
  isDefault: boolean;
}

export type PlantDayKind = "working" | "weekly-off" | "holiday" | "adjustment";

/** One date of the plant's calendar, as the rule reads it. */
export interface PlantDay {
  date: string;
  /** "Thursday". */
  weekday: string;
  kind: PlantDayKind;
  /** Whether the plant works that day (a working day or an adjustment day). */
  open: boolean;
  /** A festival's name, or the holiday an adjustment day makes up for; null otherwise. */
  name: string | null;
}

/**
 * Where the plant's day stands at one moment:
 *   open            a working day, between START and END;
 *   before-opening  a working day, before START;
 *   after-closing   a working day, at or after END;
 *   closed-day      the weekly off or a festival holiday.
 */
export type HoursPhase = "open" | "before-opening" | "after-closing" | "closed-day";

export interface PlantNow {
  timeZone: string;
  now: Date;
  hours: PlantHours;
  today: PlantDay;
  /** Seconds since the factory's midnight. */
  secondOfDay: number;
  phase: HoursPhase;
  open: boolean;
  /** The next opening moment (START of the next working day, or of today before START); null while open, or when the calendar has no working day within a year. */
  opensAt: Date | null;
  /** The day that opening falls on. */
  opensOn: PlantDay | null;
  /** Today's END, on a working day not yet closed; null otherwise. */
  closesAt: Date | null;
}

/** What the server answers about the hours before anybody signs in (GET /api/auth/config `hours`) and with every session. */
export interface PublicHours {
  /** False on a server started with DCRS_WORKING_HOURS=off (the e2e runner's): nobody is held to the hours. */
  enforced: boolean;
  start: string;
  end: string;
  timeZone: string;
  /** The server's clock when it answered. */
  now: string;
  today: { date: string; weekday: string; kind: PlantDayKind; name: string | null };
  phase: HoursPhase;
  openNow: boolean;
  opensAt: string | null;
  closesAt: string | null;
  /** "DCRS is open 8:40 am to 6:20 pm on working days." */
  hoursText: string;
  /** Where today stands, in words ("Today is Thursday, the weekly off — it opens again on Friday 2 October at 8:40 am."). */
  todayText: string;
}

/** The server's refusal outside the hours (C2): 403 with this body. */
export interface OutsideHoursRefusal {
  error: string;
  code: typeof OUTSIDE_HOURS_CODE;
  opensAt: string | null;
}

// ---------------------------------------------------------------------------
// times and dates, written in

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`);
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_RE = /^(\d{1,2}):(\d{2})$/;

/** "08:40" → 520 minutes after midnight; null for anything that is not a time of day. */
export function parseClock(text: unknown): number | null {
  if (typeof text !== "string") return null;
  const m = CLOCK_RE.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 23 && min <= 59 ? h * 60 + min : null;
}

/** 520 → "08:40". */
export function clockText(minute: number): string {
  const m = ((Math.floor(minute) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

/** 520 → "8:40 am", 1100 → "6:20 pm", 720 → "12:00 pm", 0 → "12:00 am". */
export function clockWords(minute: number): string {
  const m = ((Math.floor(minute) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(m % 60)} ${h < 12 ? "am" : "pm"}`;
}

/** An ISO date n days on (or back), worked in UTC so no clock's summer time can move it. */
export function addDaysISO(iso: string, n: number): string {
  const m = ISO_DATE_RE.exec(iso);
  const when = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n)) : new Date(NaN);
  return `${when.getUTCFullYear()}-${pad2(when.getUTCMonth() + 1)}-${pad2(when.getUTCDate())}`;
}

/** 0 = Sunday … 6 = Saturday, of a calendar date (the date itself, not a moment in any zone). */
export function weekdayOf(iso: string): number {
  const m = ISO_DATE_RE.exec(iso);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay() : -1;
}

/** "2026-10-02" → "Friday 2 October" (with the year when it is not `thisYear`). */
export function dayWords(iso: string, thisYear?: string): string {
  const m = ISO_DATE_RE.exec(iso);
  if (!m) return iso;
  const words = `${WEEKDAYS[weekdayOf(iso)]} ${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
  return thisYear !== undefined && thisYear !== m[1] ? `${words} ${m[1]}` : words;
}

// ---------------------------------------------------------------------------
// the factory's clock

const formatters = new Map<string, Intl.DateTimeFormat>();

/** A zone the runtime knows, or the default one. */
export function knownTimeZone(zone: unknown): string {
  if (typeof zone === "string" && zone) {
    if (formatters.has(zone)) return zone;
    try {
      new Intl.DateTimeFormat("en-GB", { timeZone: zone });
      return zone;
    } catch {
      /* not a zone this runtime knows */
    }
  }
  return DEFAULT_PLANT_TIME_ZONE;
}

function formatterFor(zone: string): Intl.DateTimeFormat {
  const known = knownTimeZone(zone);
  let f = formatters.get(known);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: known,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(known, f);
  }
  return f;
}

/** A moment as the factory's wall clock: its date and the seconds since its midnight. */
export function wallClock(at: Date, zone: string): { date: string; secondOfDay: number } {
  const parts = formatterFor(zone).formatToParts(at);
  const part = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? NaN);
  const hour = part("hour") % 24;
  return { date: `${part("year")}-${pad2(part("month"))}-${pad2(part("day"))}`, secondOfDay: hour * 3600 + part("minute") * 60 + part("second") };
}

/** The zone's distance from UTC at one moment, in milliseconds. */
function offsetAt(ms: number, zone: string): number {
  const wall = wallClock(new Date(ms), zone);
  const m = ISO_DATE_RE.exec(wall.date);
  if (!m) return 0;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + wall.secondOfDay * 1000 - Math.floor(ms / 1000) * 1000;
}

/** The moment a factory wall-clock time happens: `minute` minutes after midnight of `date`, in `zone`. */
export function zonedMoment(date: string, minute: number, zone: string): Date {
  const m = ISO_DATE_RE.exec(date);
  if (!m) return new Date(NaN);
  const asIfUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, minute);
  // Twice, so a moment next to a change of summer time lands on the right side of it.
  const first = asIfUtc - offsetAt(asIfUtc, zone);
  return new Date(asIfUtc - offsetAt(first, zone));
}

// ---------------------------------------------------------------------------
// the calendar

interface ReadCalendar {
  festivals: Map<string, string>;
  adjustments: Map<string, string | null>;
  weeklyOff: number;
}

const readCalendars = new WeakMap<object, ReadCalendar>();
let noCalendar: ReadCalendar | null = null;

function calendarOf(master: HoursCalendar | null | undefined): ReadCalendar {
  if (!master || typeof master !== "object") return (noCalendar ??= { festivals: new Map(), adjustments: new Map(), weeklyOff: DEFAULT_WEEKLY_OFF_DAY });
  const known = readCalendars.get(master);
  if (known) return known;
  const festivals = new Map<string, string>();
  for (const h of Array.isArray(master.holidays) ? master.holidays : []) {
    const row = h as { date?: unknown; name?: unknown } | null;
    if (row && typeof row.date === "string" && !festivals.has(row.date)) festivals.set(row.date, typeof row.name === "string" && row.name.trim() ? row.name.trim() : "A company holiday");
  }
  const adjustments = new Map<string, string | null>();
  for (const a of Array.isArray(master.adjustmentDays) ? master.adjustmentDays : []) {
    const row = a as { date?: unknown; forHoliday?: unknown } | null;
    if (row && typeof row.date === "string" && !adjustments.has(row.date)) adjustments.set(row.date, typeof row.forHoliday === "string" && row.forHoliday.trim() ? row.forHoliday.trim() : null);
  }
  const w = master.weeklyOffDay;
  const read: ReadCalendar = { festivals, adjustments, weeklyOff: typeof w === "number" && Number.isInteger(w) && w >= 0 && w <= 6 ? w : DEFAULT_WEEKLY_OFF_DAY };
  readCalendars.set(master, read);
  return read;
}

/**
 * One date as the plant's calendar has it — in the order engine/holidays.ts
 * reads it: a festival holiday is closed whatever the day; an adjustment day is
 * open; the weekly off is closed; any other day is a working day.
 */
export function plantDay(date: string, master: HoursCalendar | null | undefined): PlantDay {
  const cal = calendarOf(master);
  const dow = weekdayOf(date);
  const weekday = WEEKDAYS[dow] ?? "";
  const festival = cal.festivals.get(date);
  if (festival !== undefined) return { date, weekday, kind: "holiday", open: false, name: festival };
  if (cal.adjustments.has(date)) return { date, weekday, kind: "adjustment", open: true, name: cal.adjustments.get(date) ?? null };
  if (dow === cal.weeklyOff) return { date, weekday, kind: "weekly-off", open: false, name: null };
  return { date, weekday, kind: "working", open: true, name: null };
}

/** The first working day after `date` (not `date` itself), within a year; null when the calendar has none. */
export function nextWorkingDay(date: string, master: HoursCalendar | null | undefined): PlantDay | null {
  let d = date;
  for (let i = 0; i < LOOKAHEAD_DAYS; i++) {
    d = addDaysISO(d, 1);
    const day = plantDay(d, master);
    if (day.open) return day;
  }
  return null;
}

/** The weekly off day of this calendar, 0 = Sunday … 6 = Saturday. */
export function weeklyOffOf(master: HoursCalendar | null | undefined): number {
  return calendarOf(master).weeklyOff;
}

/** A weekday's name, 0 = Sunday. */
export function weekdayName(dow: number): string {
  return WEEKDAYS[dow] ?? "";
}

// ---------------------------------------------------------------------------
// the hours

/** Whether a start and an end make a day, and if not, what is wrong in plain words (the Master Data form). */
export function hoursProblem(start: unknown, end: unknown): string | null {
  const s = parseClock(start);
  const e = parseClock(end);
  if (s === null) return "Give the time the plant opens, like 08:40.";
  if (e === null) return "Give the time the plant closes, like 18:20.";
  if (e <= s) return "The plant must close after it opens, on the same day.";
  return null;
}

/** The plant's hours from Master Data; the owner's 08:40–18:20 when they are absent or do not make a day. */
export function workingHoursOf(master: HoursCalendar | null | undefined): PlantHours {
  const wh = master && typeof master === "object" ? master.workingHours : null;
  const s = parseClock(wh?.start);
  const e = parseClock(wh?.end);
  if (s !== null && e !== null && e > s) return { start: clockText(s), end: clockText(e), startMinute: s, endMinute: e, isDefault: false };
  const ds = parseClock(DEFAULT_WORKING_HOURS.start) as number;
  const de = parseClock(DEFAULT_WORKING_HOURS.end) as number;
  return { start: DEFAULT_WORKING_HOURS.start, end: DEFAULT_WORKING_HOURS.end, startMinute: ds, endMinute: de, isDefault: true };
}

/** Where the plant's day stands at `now`, in the factory's zone. */
export function plantNow(master: HoursCalendar | null | undefined, now: Date, timeZone: string): PlantNow {
  const zone = knownTimeZone(timeZone);
  const hours = workingHoursOf(master);
  const { date, secondOfDay } = wallClock(now, zone);
  const today = plantDay(date, master);
  const startS = hours.startMinute * 60;
  const endS = hours.endMinute * 60;
  const phase: HoursPhase = !today.open ? "closed-day" : secondOfDay < startS ? "before-opening" : secondOfDay < endS ? "open" : "after-closing";
  const opensOn = phase === "open" ? null : phase === "before-opening" ? today : nextWorkingDay(date, master);
  return {
    timeZone: zone,
    now,
    hours,
    today,
    secondOfDay,
    phase,
    open: phase === "open",
    opensAt: opensOn ? zonedMoment(opensOn.date, hours.startMinute, zone) : null,
    opensOn,
    closesAt: phase === "open" || phase === "before-opening" ? zonedMoment(date, hours.endMinute, zone) : null,
  };
}

/** The factory's next midnight after `now` — the close of the day for the super admin, and for everyone when the hours are not enforced. */
export function nextMidnight(now: Date, timeZone: string): Date {
  const zone = knownTimeZone(timeZone);
  return zonedMoment(addDaysISO(wallClock(now, zone).date, 1), 0, zone);
}

/**
 * When a session started at `state.now` ends (C3): at END of that working day
 * for an account held to the hours, at the factory's midnight for the super
 * admin — and for everybody while the hours are not enforced. An account held to
 * the hours outside them gets no session at all: its end is now.
 */
export function sessionEndsAt(opts: { admin: boolean; enforced: boolean; state: PlantNow }): Date {
  const { state } = opts;
  if (opts.admin || !opts.enforced) return nextMidnight(state.now, state.timeZone);
  return state.phase === "open" && state.closesAt ? state.closesAt : state.now;
}

// ---------------------------------------------------------------------------
// in words

/** "DCRS is open 8:40 am to 6:20 pm on working days." */
export function hoursSentence(hours: PlantHours): string {
  return `DCRS is open ${clockWords(hours.startMinute)} to ${clockWords(hours.endMinute)} on working days.`;
}

function opensAgain(state: PlantNow): string {
  if (!state.opensOn) return "the calendar has no working day in the year ahead";
  return `it opens again on ${dayWords(state.opensOn.date, state.today.date.slice(0, 4))} at ${clockWords(state.hours.startMinute)}`;
}

/** Where today stands, in one sentence. */
export function todaySentence(state: PlantNow): string {
  const { today, hours } = state;
  const end = clockWords(hours.endMinute);
  const adjustment = today.kind === "adjustment" ? `Today is ${today.weekday}, an adjustment day${today.name ? ` for ${today.name}` : ""}, so the plant works` : "Today is a working day";
  switch (state.phase) {
    case "open":
      return `${adjustment} — open now, until ${end}.`;
    case "before-opening":
      return `${adjustment}. It is not open yet — it opens today at ${clockWords(hours.startMinute)}.`;
    case "after-closing":
      return `Today's working hours ended at ${end} — ${opensAgain(state)}.`;
    default:
      return today.kind === "holiday"
        ? `Today is ${today.name ?? "a company holiday"}, a company holiday — ${opensAgain(state)}.`
        : `Today is ${today.weekday}, the weekly off — ${opensAgain(state)}.`;
  }
}

/** The whole refusal in plain words: the hours, then where today stands. */
export function refusalMessage(state: PlantNow): string {
  return `${hoursSentence(state.hours)} ${todaySentence(state)}`;
}

/** The server's 403 body outside the hours (C2). */
export function outsideHoursRefusal(state: PlantNow): OutsideHoursRefusal {
  return { error: refusalMessage(state), code: OUTSIDE_HOURS_CODE, opensAt: state.opensAt ? state.opensAt.toISOString() : null };
}

/** What the server says about the hours, to anybody (the sign-in page) — nothing about any person. */
export function publicHours(state: PlantNow, enforced: boolean): PublicHours {
  return {
    enforced,
    start: state.hours.start,
    end: state.hours.end,
    timeZone: state.timeZone,
    now: state.now.toISOString(),
    today: { date: state.today.date, weekday: state.today.weekday, kind: state.today.kind, name: state.today.name },
    phase: state.phase,
    openNow: state.open,
    opensAt: state.opensAt ? state.opensAt.toISOString() : null,
    closesAt: state.closesAt ? state.closesAt.toISOString() : null,
    hoursText: hoursSentence(state.hours),
    todayText: todaySentence(state),
  };
}

/** A moment as the factory's time of day in words ("6:20 pm") — for the browser's warning and notice. */
export function momentWords(at: Date, timeZone: string): string {
  return clockWords(Math.floor(wallClock(at, timeZone).secondOfDay / 60));
}
