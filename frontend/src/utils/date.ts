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

export function formatDisplayDate(iso: string | null): string {
  if (!iso) return "TO BE CONFIRMED";
  const d = fromISODate(iso);
  return `${pad2(d.getDate())}-${MONTH_NAMES[d.getMonth()].slice(0, 3)}-${d.getFullYear()}`;
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
