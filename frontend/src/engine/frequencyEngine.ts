import type { DocumentDefinition } from "../types";
import { addDays, daysInMonth, MONTH_NAMES, pad2 } from "../utils/date";

// Given a document's configured schedule, compute every date within the given
// (year, month) [month is 0-indexed] on which an instance of that document is
// due. This is the single source of truth the Calendar, Day View and the
// recurring-record generator all consume — change a document's schedule once
// and every screen reacts.
export function dueDatesInMonth(doc: DocumentDefinition, year: number, month: number): string[] {
  const dim = daysInMonth(year, month);
  const iso = (day: number) => `${year}-${pad2(month + 1)}-${pad2(day)}`;
  const s = doc.schedule;

  switch (s.type) {
    case "daily": {
      const out: string[] = [];
      for (let d = 1; d <= dim; d++) out.push(iso(d));
      return out;
    }
    case "weekly": {
      const out: string[] = [];
      for (let d = 1; d <= dim; d++) {
        const dt = new Date(year, month, d);
        if (dt.getDay() === s.weekday) out.push(iso(d));
      }
      return out;
    }
    case "fortnightly": {
      const out: string[] = [];
      const first = s.anchorDayOfMonth;
      const second = s.anchorDayOfMonth + 14;
      if (first >= 1 && first <= dim) out.push(iso(first));
      if (second >= 1 && second <= dim) out.push(iso(second));
      return out;
    }
    case "monthly": {
      const day = Math.min(s.dayOfMonth, dim);
      return [iso(day)];
    }
    case "quarterly": {
      const offset = (month - s.anchorMonth + 12) % 12;
      if (offset % 3 !== 0) return [];
      const day = Math.min(s.dayOfMonth, dim);
      return [iso(day)];
    }
    case "yearly": {
      if (month !== s.month) return [];
      const day = Math.min(s.dayOfMonth, dim);
      return [iso(day)];
    }
    case "as-required":
      return [];
    default:
      return [];
  }
}

// THE SCHEDULE PERIOD A DATE FALLS IN (REQUIREMENTS §93; the audit of
// 7-Oct-2026, H-7). A scheduled document has one sheet for each date its
// schedule names, and each of those dates stands for a stretch of time. "New
// record" used to look for a sheet of the very date it was pressed on, so a
// monthly sheet due on the 1st was not found on the 7th and a second sheet was
// started for a month that already had one. The stretches:
//   weekly       Monday to Sunday
//   fortnightly  the 1st to the day before the second date, then the second
//                date to the month's end
//   monthly      the calendar month
//   quarterly    the three months from a quarter's first month (counted from
//                the schedule's anchor month)
//   yearly       the calendar year
// Each holds exactly one of the dates the schedule names (`scheduled`): the
// date the generator keys that period's sheet on (engine/recordGenerator.ts),
// so the sheet New opens and the sheet the schedule makes are the same sheet.
// A daily or an as-required document has no period wider than its own day.
export interface SchedulePeriod {
  /** The period's first day. */
  from: string;
  /** The period's last day. */
  to: string;
  /** The one date the schedule names in it: the key of the period's sheet. */
  scheduled: string;
}

export function schedulePeriodOf(doc: DocumentDefinition, dateISO: string): SchedulePeriod | null {
  const parts = dateISO.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [year, monthNo, day] = parts;
  const month = monthNo - 1;
  const iso = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
  const s = doc.schedule;
  switch (s.type) {
    case "weekly": {
      const from = addDays(dateISO, -((new Date(year, month, day).getDay() + 6) % 7));
      return { from, to: addDays(from, 6), scheduled: addDays(from, (s.weekday + 6) % 7) };
    }
    case "fortnightly": {
      const dim = daysInMonth(year, month);
      const first = s.anchorDayOfMonth;
      const second = first + 14;
      if (first < 1 || first > dim) return null;
      if (second <= dim && day >= second) return { from: iso(year, month, second), to: iso(year, month, dim), scheduled: iso(year, month, second) };
      return { from: iso(year, month, 1), to: iso(year, month, second <= dim ? second - 1 : dim), scheduled: iso(year, month, first) };
    }
    case "monthly": {
      const dim = daysInMonth(year, month);
      return { from: iso(year, month, 1), to: iso(year, month, dim), scheduled: iso(year, month, Math.min(s.dayOfMonth, dim)) };
    }
    case "quarterly": {
      const back = (((month - s.anchorMonth) % 3) + 3) % 3;
      const startYear = month - back < 0 ? year - 1 : year;
      const startMonth = (month - back + 12) % 12;
      const endYear = startMonth + 2 > 11 ? startYear + 1 : startYear;
      const endMonth = (startMonth + 2) % 12;
      return {
        from: iso(startYear, startMonth, 1),
        to: iso(endYear, endMonth, daysInMonth(endYear, endMonth)),
        scheduled: iso(startYear, startMonth, Math.min(s.dayOfMonth, daysInMonth(startYear, startMonth))),
      };
    }
    case "yearly":
      return { from: `${year}-01-01`, to: `${year}-12-31`, scheduled: iso(year, s.month, Math.min(s.dayOfMonth, daysInMonth(year, s.month))) };
    default:
      return null;
  }
}

export function scheduleLabel(doc: DocumentDefinition): string {
  const s = doc.schedule;
  switch (s.type) {
    case "daily":
      return "Every day";
    case "weekly":
      return `Every ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][s.weekday]}`;
    case "fortnightly":
      return `Day ${s.anchorDayOfMonth} & ${s.anchorDayOfMonth + 14} of each month`;
    case "monthly":
      return `Day ${s.dayOfMonth} of each month`;
    case "quarterly":
      return `Quarterly (day ${s.dayOfMonth}, from ${MONTH_NAMES[s.anchorMonth].slice(0, 3)})`;
    case "yearly":
      return `Yearly (${s.dayOfMonth} ${MONTH_NAMES[s.month].slice(0, 3)})`;
    case "as-required":
      return "As Required (created manually)";
    default:
      return "TO BE CONFIRMED";
  }
}
