// THE PLANT'S WORKING HOURS AND ITS CALENDAR — ONE RULE FOR THE SERVER AND THE
// BROWSER (REQUIREMENTS §84).
//
// The owner, 30-Sep-2026: "Daily working hours: after them nobody but the admin
// can use this software. The time runs from 8:40 am to 6:20 pm. Mostly Thursday
// is the holiday — check the company's calendar properly, because there are
// adjustment days too, and sometimes a Thursday counts as a working day, so the
// software must run on that day as well."
//
// So the STAFF'S HOURS run on a WORKING DAY of the plant's calendar from START
// to END, in the factory's own time zone, and at no other moment ("open" and
// "closed" below are the staff's hours, never DCRS itself):
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
// but the super admin, who may sign in and work at any hour of any day — so the
// hours are the STAFF's, and every sentence below says so (the owner,
// 6-Oct-2026). A session lasts until the close of the day it was started — END
// for a non-admin, midnight for the super admin (the midnight after, for his
// sign-in in the day's last ten minutes) — so every morning starts with
// signing in.
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
/** Why the browser signed the super admin out at the end of the day, the factory's midnight — POST /api/auth/logout { reason }. */
export const END_OF_DAY_REASON = "end-of-day";
/**
 * A super admin's sign-in this close to the factory's midnight is a session for
 * the next day: it runs to the midnight after, so a sign-in at 23:58 is not cut
 * off two minutes later (and the phone app's last-second sign-in is not
 * refused as "no session"). The same span as the closing warning: a session
 * that would start inside its own warning starts the next day's instead.
 */
export const LATE_SIGN_IN_MS = CLOSING_WARNING_MS;
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
  /** "Staff working hours: 8:40 am to 6:20 pm on working days. The super admin can sign in at any time." */
  hoursText: string;
  /** Where today stands for the staff's hours, in words ("Today is Thursday, the weekly off; staff hours start again on Friday 2 October at 8:40 am."). */
  todayText: string;
}

/** The answer for one signed-in person: the public one, with whether the hours hold them and a line for the super admin. */
export interface PersonHours extends PublicHours {
  /** True for an account held to the hours (anybody but the super admin, while the server enforces them). */
  heldToHours: boolean;
  /** For the super admin: "You are the super admin: these are the staff's hours, and you can keep working at any time." Null for staff. */
  forYou: string | null;
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
 * the hours outside them gets no session at all: its end is now. The super
 * admin's sign-in in the day's last LATE_SIGN_IN_MS runs to the midnight after
 * (6-Oct-2026: he may sign in at any time, so a sign-in at 23:59 must not be a
 * session of one minute); every session still ends at a midnight, so he still
 * signs in each day.
 */
export function sessionEndsAt(opts: { admin: boolean; enforced: boolean; state: PlantNow }): Date {
  const { state } = opts;
  if (opts.admin) {
    const midnight = nextMidnight(state.now, state.timeZone);
    return midnight.getTime() - state.now.getTime() <= LATE_SIGN_IN_MS ? nextMidnight(midnight, state.timeZone) : midnight;
  }
  if (!opts.enforced) return nextMidnight(state.now, state.timeZone);
  return state.phase === "open" && state.closesAt ? state.closesAt : state.now;
}

// ---------------------------------------------------------------------------
// in words
//
// THE HOURS ARE THE STAFF'S (the owner, 6-Oct-2026): he quoted the sign-in page
// — "DCRS is open 8:40 am to 6:20 pm on working days. Today's working hours
// ended at 6:20 pm — it opens again on Wednesday 7 October at 8:40 am." — and
// said it "is not valid for superadmin because superadmin can login at any
// time". DCRS itself never closes: the hours hold every account but the super
// admin's. So every sentence here says STAFF working hours, and the hours' own
// sentence says the super admin can sign in at any time; nothing says "DCRS is
// open", "it opens again" or "DCRS is closed".
//
// In English everywhere (the server's answers, the sign-in page, /api/v1, the
// phone app, which passes DCRS's words through), and in Gujarati on the app's
// own screens when Gujarati is chosen and Google cannot translate them
// (i18n/googleTranslate.ts): the same sentences, built from the same parts.

/** The languages the hours are said in. */
export type HoursLanguage = "en" | "gu";

const GU_WEEKDAYS = ["રવિવાર", "સોમવાર", "મંગળવાર", "બુધવાર", "ગુરુવાર", "શુક્રવાર", "શનિવાર"];
const GU_MONTHS = ["જાન્યુઆરી", "ફેબ્રુઆરી", "માર્ચ", "એપ્રિલ", "મે", "જૂન", "જુલાઈ", "ઑગસ્ટ", "સપ્ટેમ્બર", "ઑક્ટોબર", "નવેમ્બર", "ડિસેમ્બર"];

/** 520 → "સવારે 8:40", 1100 → "સાંજે 6:20": the part of the day, then the twelve-hour clock. */
function guClockWords(minute: number): string {
  const m = ((Math.floor(minute) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const part = h < 4 ? "રાત્રે" : h < 12 ? "સવારે" : h < 16 ? "બપોરે" : h < 20 ? "સાંજે" : "રાત્રે";
  return `${part} ${h12}:${pad2(m % 60)}`;
}

/** "2026-10-02" → "શુક્રવાર, 2 ઑક્ટોબર" (with the year when it is not `thisYear`). */
function guDayWords(iso: string, thisYear?: string): string {
  const m = ISO_DATE_RE.exec(iso);
  if (!m) return iso;
  const words = `${GU_WEEKDAYS[weekdayOf(iso)]}, ${Number(m[3])} ${GU_MONTHS[Number(m[2]) - 1]}`;
  return thisYear !== undefined && thisYear !== m[1] ? `${words} ${m[1]}` : words;
}

/** A time of day in words, in either language. */
export function clockWordsIn(minute: number, lang: HoursLanguage): string {
  return lang === "gu" ? guClockWords(minute) : clockWords(minute);
}

/** What the sentences need about today — had from the factory's clock (PlantNow) or from the server's answer (PublicHours). */
interface DayFacts {
  startMinute: number;
  endMinute: number;
  phase: HoursPhase;
  today: { date: string; kind: PlantDayKind; name: string | null };
  /** The date staff hours start again on (today before START); null while open, or with no working day ahead. */
  opensOnDate: string | null;
}

const factsOf = (state: PlantNow): DayFacts => ({
  startMinute: state.hours.startMinute,
  endMinute: state.hours.endMinute,
  phase: state.phase,
  today: state.today,
  opensOnDate: state.opensOn ? state.opensOn.date : null,
});

/** The sentences' parts, one table per language; `again` is "they start again …" after-closing and "staff hours start again …" on a closed day. */
const WORDS: Record<
  HoursLanguage,
  {
    clock: (minute: number) => string;
    day: (iso: string, thisYear: string) => string;
    weekday: (iso: string) => string;
    staffHours: (start: string, end: string) => string;
    superAdmin: string;
    workingDay: string;
    adjustment: (weekday: string, name: string | null) => string;
    open: (lead: string, end: string) => string;
    beforeOpening: (lead: string, start: string) => string;
    afterClosing: (end: string, again: string) => string;
    holiday: (name: string, again: string) => string;
    weeklyOff: (weekday: string, again: string) => string;
    again: (they: boolean, day: string, start: string) => string;
    noWorkingDay: string;
    forSuperAdmin: string;
  }
> = {
  en: {
    clock: clockWords,
    day: (iso, year) => dayWords(iso, year),
    weekday: (iso) => WEEKDAYS[weekdayOf(iso)] ?? "",
    staffHours: (start, end) => `Staff working hours: ${start} to ${end} on working days.`,
    superAdmin: "The super admin can sign in at any time.",
    workingDay: "Today is a working day",
    adjustment: (weekday, name) => `Today is ${weekday}, an adjustment day${name ? ` for ${name}` : ""}, so the plant works`,
    open: (lead, end) => `${lead} — staff hours run until ${end}.`,
    beforeOpening: (lead, start) => `${lead}. Staff hours start today at ${start}.`,
    afterClosing: (end, again) => `Today's staff hours ended at ${end}; ${again}.`,
    holiday: (name, again) => `Today is ${name}, a company holiday; ${again}.`,
    weeklyOff: (weekday, again) => `Today is ${weekday}, the weekly off; ${again}.`,
    again: (they, day, start) => `${they ? "they" : "staff hours"} start again on ${day} at ${start}`,
    noWorkingDay: "the calendar has no working day in the year ahead",
    forSuperAdmin: "You are the super admin: these are the staff's hours, and you can keep working at any time.",
  },
  gu: {
    clock: guClockWords,
    day: (iso, year) => guDayWords(iso, year),
    weekday: (iso) => GU_WEEKDAYS[weekdayOf(iso)] ?? "",
    staffHours: (start, end) => `સ્ટાફના કામના કલાકો: કામકાજના દિવસોમાં ${start} થી ${end}.`,
    superAdmin: "સુપર એડમિન કોઈપણ સમયે સાઇન ઇન કરી શકે છે.",
    workingDay: "આજે કામકાજનો દિવસ છે",
    adjustment: (weekday, name) => `આજે ${weekday} છે, ${name ? `${name} માટેનો ` : ""}એડજસ્ટમેન્ટ દિવસ, તેથી પ્લાન્ટ ચાલુ છે`,
    open: (lead, end) => `${lead} — સ્ટાફના કલાકો ${end} સુધી છે.`,
    beforeOpening: (lead, start) => `${lead}. સ્ટાફના કલાકો આજે ${start} વાગ્યે શરૂ થશે.`,
    afterClosing: (end, again) => `આજના સ્ટાફના કલાકો ${end} વાગ્યે પૂરા થયા; ${again}.`,
    holiday: (name, again) => `આજે ${name} છે, કંપનીની રજા; ${again}.`,
    weeklyOff: (weekday, again) => `આજે ${weekday} છે, સાપ્તાહિક રજા; ${again}.`,
    again: (they, day, start) => `${they ? "તે" : "સ્ટાફના કલાકો"} ફરી ${day}ના રોજ ${start} વાગ્યે શરૂ થશે`,
    noWorkingDay: "કૅલેન્ડરમાં આવતા એક વર્ષમાં કોઈ કામકાજનો દિવસ નથી",
    forSuperAdmin: "તમે સુપર એડમિન છો: આ સ્ટાફના કલાકો છે, અને તમે કોઈપણ સમયે કામ ચાલુ રાખી શકો છો.",
  },
};

/** "Staff working hours: 8:40 am to 6:20 pm on working days." — the hours alone, as staff are told them when refused. */
export function staffHoursSentence(hours: Pick<PlantHours, "startMinute" | "endMinute">, lang: HoursLanguage = "en"): string {
  const w = WORDS[lang];
  return w.staffHours(w.clock(hours.startMinute), w.clock(hours.endMinute));
}

/** "Staff working hours: 8:40 am to 6:20 pm on working days. The super admin can sign in at any time." — the hours' own sentence, said before anybody is known (the sign-in page). */
export function hoursSentence(hours: Pick<PlantHours, "startMinute" | "endMinute">, lang: HoursLanguage = "en"): string {
  return `${staffHoursSentence(hours, lang)} ${WORDS[lang].superAdmin}`;
}

/** The line for a person the hours do not hold (the super admin): "You are the super admin: these are the staff's hours, and you can keep working at any time." */
export function superAdminHoursLine(lang: HoursLanguage = "en"): string {
  return WORDS[lang].forSuperAdmin;
}

function todayWords(f: DayFacts, lang: HoursLanguage): string {
  const w = WORDS[lang];
  const { today } = f;
  const end = w.clock(f.endMinute);
  const again = (they: boolean) => (f.opensOnDate ? w.again(they, w.day(f.opensOnDate, today.date.slice(0, 4)), w.clock(f.startMinute)) : w.noWorkingDay);
  const lead = today.kind === "adjustment" ? w.adjustment(w.weekday(today.date), today.name) : w.workingDay;
  switch (f.phase) {
    case "open":
      return w.open(lead, end);
    case "before-opening":
      return w.beforeOpening(lead, w.clock(f.startMinute));
    case "after-closing":
      return w.afterClosing(end, again(true));
    default:
      return today.kind === "holiday" ? w.holiday(today.name ?? (lang === "gu" ? "કંપનીની રજા" : "a company holiday"), again(false)) : w.weeklyOff(w.weekday(today.date), again(false));
  }
}

/** Where today stands for the staff's hours, in one sentence. */
export function todaySentence(state: PlantNow, lang: HoursLanguage = "en"): string {
  return todayWords(factsOf(state), lang);
}

/**
 * The words of the server's answer in another language, built from its own
 * fields (the hours, the phase, today and the next opening) — the very
 * sentences `publicHours` wrote, so a screen in Gujarati says what the English
 * one does. In English they are the answer's own words.
 */
export function hoursWordsIn(answer: PublicHours, lang: HoursLanguage): { hoursText: string; todayText: string } {
  if (lang === "en") return { hoursText: answer.hoursText, todayText: answer.todayText };
  const hours = workingHoursOf({ workingHours: { start: answer.start, end: answer.end } });
  const opensOnDate = answer.opensAt ? wallClock(new Date(answer.opensAt), knownTimeZone(answer.timeZone)).date : null;
  const f: DayFacts = { startMinute: hours.startMinute, endMinute: hours.endMinute, phase: answer.phase, today: answer.today, opensOnDate };
  return { hoursText: hoursSentence(hours, lang), todayText: todayWords(f, lang) };
}

/** The whole refusal staff are given outside their hours: their hours, then where today stands and when their hours start again. */
export function refusalMessage(state: PlantNow): string {
  return `${staffHoursSentence(state.hours)} ${todaySentence(state)}`;
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

/**
 * The same answer for one signed-in person (POST /api/auth/login, GET
 * /api/auth/me, GET /api/v1/today — what Mitra on the phone is told): whether
 * the hours hold them, and for the super admin a line saying they are the
 * staff's hours and that he can keep working.
 */
export function personHours(state: PlantNow, enforced: boolean, person: { admin: boolean }): PersonHours {
  return { ...publicHours(state, enforced), heldToHours: enforced && !person.admin, forYou: person.admin ? superAdminHoursLine() : null };
}

/** A moment as the factory's time of day in words ("6:20 pm") — for the browser's warning and notice. */
export function momentWords(at: Date, timeZone: string, lang: HoursLanguage = "en"): string {
  return clockWordsIn(Math.floor(wallClock(at, timeZone).secondOfDay / 60), lang);
}
