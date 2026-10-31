// Minimal, dependency-free date helpers (no date-fns / dayjs available in
// this offline build environment — see docs/DEPLOYMENT.md). All dates are stored
// and compared as "YYYY-MM-DD" strings in local time.

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function fromISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function todayISO(): string {
  return toISODate(new Date());
}

/**
 * A date as the app writes it everywhere, in numbers, day-month-year: "24-10-26" (the owner, 24-Oct-2026: "all are
 * number like this example:- 24-10-26 and not 24-oct-2026 and this applies to all document for all modules",
 * REQUIREMENTS §124). Two figures for the years 2000-2099; a date outside them (a date of birth in 1985) keeps its four,
 * "15-06-1985", so nothing reads it back as 20xx. Text that is not a date as the app stores one comes back as it was
 * written (a date column made Text, "12.09.2026").
 */
/** A date with its whole year, 01-12-2021: how a header prints its revision's date (the owner, 31-Oct-2026, REQUIREMENTS §155). */
export function fullYearDate(iso: string | null | undefined, sep = "-"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}${sep}${m[2]}${sep}${m[1]}` : formatDisplayDate(iso ?? null);
}

export function formatDisplayDate(iso: string | null): string {
  if (!iso) return "TO BE CONFIRMED";
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
  const d = fromISODate(iso.slice(0, 10));
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${y >= 2000 && y <= 2099 ? pad2(y % 100) : String(y)}`;
}

/**
 * A year a person wrote with two figures, as they mean it: in the 2000s up to twenty years ahead of `today`, else the
 * 1900s ("15-06-85", a date of birth, is 1985; "24-10-26" is 2026). The app itself writes two figures only for
 * 2000-2099 (formatDisplayDate).
 */
export function twoFigureYear(n: number, today: string = todayISO()): number {
  const y = 2000 + n;
  return y <= Number(today.slice(0, 4)) + 20 ? y : 1900 + n;
}

/** A moment as the app writes one: its date as formatDisplayDate writes it, and the time on the 24-hour clock, "24-10-26 15:30". "" when there is none. */
export function formatDisplayDateTime(at: string | number | Date | null | undefined): string {
  if (at === null || at === undefined || at === "") return "";
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  return `${formatDisplayDate(toISODate(d))} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** What formatDisplayDate writes, read back: "24-10-26" -> "2026-10-24", "15-06-1985" -> "1985-06-15"; null when it is not a real day. */
export function displayDateToISO(text: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{2}|\d{4})$/.exec(text);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), m[3].length === 4 ? Number(m[3]) : 2000 + Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo - 1)) return null;
  return `${String(y).padStart(4, "0")}-${m[2]}-${m[1]}`;
}

export function formatMonthYearShort(year: number, month: number): string {
  return `${MONTH_NAMES[month].slice(0, 3)}-${String(year).slice(2)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function addDays(iso: string, n: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function compareISO(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isToday(iso: string, referenceISO = todayISO()): boolean {
  return iso === referenceISO;
}
