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
 * REQUIREMENTS §124). Two figures for the year: 2000 to 2099.
 */
export function formatDisplayDate(iso: string | null): string {
  if (!iso) return "TO BE CONFIRMED";
  const d = fromISODate(iso);
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${pad2(d.getFullYear() % 100)}`;
}

/** What formatDisplayDate writes, read back: "24-10-26" -> "2026-10-24"; null when it is not a real day. */
export function displayDateToISO(text: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), 2000 + Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo - 1)) return null;
  return `${y}-${m[2]}-${m[1]}`;
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
