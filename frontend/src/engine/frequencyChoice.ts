import type { Frequency, ScheduleConfig } from "../types";
import { todayISO } from "../utils/date";

// THE CHOICE OF A FREQUENCY, IN ONE PLACE (REQUIREMENTS §143, §163, §202): the kinds the picker offers and the schedule
// each makes - the picker on Master Data's Documents tab and the Frequency panel (components/master/FrequencyPicker.tsx)
// read them here, and so does Mitra when told to set a frequency by word (engine/mitraTools.ts set_document_frequency;
// the owner, 7-Nov-2026: "from now user can tell for any module to ai to set frequency"). Import-free but for the date,
// so the engine and the tests read the one rule.

export type Kind = ScheduleConfig["type"];
export const KINDS: { kind: Kind; label: string; frequency: Frequency }[] = [
  { kind: "daily", label: "Every day", frequency: "Daily" },
  { kind: "weekly", label: "Every week", frequency: "Weekly" },
  { kind: "fortnightly", label: "Twice a month (1st & 3rd of a weekday)", frequency: "Fortnightly" },
  { kind: "monthly", label: "Every month", frequency: "Monthly" },
  { kind: "quarterly", label: "Every quarter", frequency: "Quarterly" },
  { kind: "half-yearly", label: "Every half year", frequency: "Half-yearly" },
  { kind: "yearly", label: "Every year", frequency: "Yearly" },
  { kind: "as-required", label: "As required", frequency: "As Required" },
  { kind: "custom", label: "Custom…", frequency: "Custom" },
];

/** The three ways a custom frequency can be said (§202). */
export type CustomMode = "every" | "weekdays" | "days";
export interface CustomChoice {
  mode: CustomMode;
  everyDays: number;
  from: string;
  weekdays: number[];
  daysOfMonth: number[];
}

/** The custom choice a schedule holds, or the default one (every 10 days from today, Monday, the 1st). */
export function customOf(now: ScheduleConfig, today: string = todayISO()): CustomChoice {
  const base: CustomChoice = { mode: "every", everyDays: 10, from: today, weekdays: [1], daysOfMonth: [1] };
  if (now.type !== "custom") return base;
  if (now.everyDays !== undefined) return { ...base, mode: "every", everyDays: now.everyDays, from: now.from };
  if (now.weekdays !== undefined) return { ...base, mode: "weekdays", weekdays: [...now.weekdays] };
  return { ...base, mode: "days", daysOfMonth: [...now.daysOfMonth] };
}

/** The custom schedule the choice makes, or null while it says nothing (no weekday, no day, no count). */
export function customSchedule(c: CustomChoice): ScheduleConfig | null {
  if (c.mode === "every") {
    const everyDays = Math.floor(c.everyDays);
    return Number.isFinite(everyDays) && everyDays >= 1 && everyDays <= 366 && /^\d{4}-\d{2}-\d{2}$/.test(c.from) ? { type: "custom", everyDays, from: c.from } : null;
  }
  if (c.mode === "weekdays") {
    const weekdays = [...new Set(c.weekdays.filter((w) => Number.isInteger(w) && w >= 0 && w <= 6))].sort((a, b) => a - b);
    return weekdays.length ? { type: "custom", weekdays } : null;
  }
  const daysOfMonth = [...new Set(c.daysOfMonth.filter((d) => Number.isInteger(d) && d >= 1 && d <= 31))].sort((a, b) => a - b);
  return daysOfMonth.length ? { type: "custom", daysOfMonth } : null;
}

/** "5, 15, 25" as the days it names, in order, each once. */
export function parseDays(text: string): number[] {
  return [...new Set((text.match(/\d{1,2}/g) ?? []).map(Number).filter((d) => d >= 1 && d <= 31))].sort((a, b) => a - b);
}

/** The schedule of this kind, keeping what the current one shares with it (its weekday, its day of the month). */
export function scheduleOf(kind: Kind, now: ScheduleConfig, weekday: number, day: number, month: number, custom?: CustomChoice): ScheduleConfig {
  switch (kind) {
    case "daily":
      return { type: "daily" };
    case "weekly":
      return { type: "weekly", weekday };
    case "fortnightly":
      return { type: "fortnightly", weekday };
    case "monthly":
      return { type: "monthly", dayOfMonth: day };
    case "quarterly":
      return { type: "quarterly", anchorMonth: now.type === "quarterly" ? now.anchorMonth : month % 3, dayOfMonth: day };
    case "half-yearly":
      // Twice a year from the month chosen (January and July when none is), on the day chosen (REQUIREMENTS §163).
      return { type: "half-yearly", anchorMonth: now.type === "half-yearly" ? now.anchorMonth : month % 6, dayOfMonth: day };
    case "yearly":
      return { type: "yearly", month, dayOfMonth: day };
    case "custom":
      // Nothing chosen yet: the current schedule stands (so nothing changed, nothing to set).
      return customSchedule(custom ?? customOf(now)) ?? now;
    default:
      return { type: "as-required" };
  }
}

// ---------------------------------------------------------------------------
// a frequency said in words (Mitra's tool, §202)

const WEEKDAY_WORDS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTH_WORDS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const word = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : "").trim().toLowerCase();

/** A weekday as a number (0 Sunday to 6 Saturday) or a name ("Thursday", "thu"), or null. */
export function weekdayOf(v: unknown): number | null {
  const w = word(v);
  if (/^[0-6]$/.test(w)) return Number(w);
  const at = WEEKDAY_WORDS.findIndex((name) => w.length >= 3 && name.startsWith(w.slice(0, 3)));
  return at >= 0 && /^[a-z]+$/.test(w) ? at : null;
}

/** A month as 0 to 11: a number 1 to 12, or a name ("April", "apr"), or null. */
export function monthOf(v: unknown): number | null {
  const m = word(v);
  if (/^\d{1,2}$/.test(m)) return Number(m) >= 1 && Number(m) <= 12 ? Number(m) - 1 : null;
  const at = MONTH_WORDS.findIndex((name) => m.length >= 3 && name.startsWith(m.slice(0, 3)));
  return at >= 0 && /^[a-z]+$/.test(m) ? at : null;
}

/** The kind a word names - "daily", "every week", "twice a month", "half yearly", "annual", "as required", "custom" - or "issued" (the frequency it was issued with), or null. */
export function kindOf(v: unknown): Kind | "issued" | null {
  const k = word(v).replace(/[_\s]+/g, "-");
  if (!k) return null;
  if (/^(issued|as-issued|default|reset|original)$/.test(k)) return "issued";
  if (/^(daily|every-day|each-day)$/.test(k)) return "daily";
  if (/^(weekly|every-week|each-week)$/.test(k)) return "weekly";
  if (/^(fortnightly|fortnight|twice-a-month|bi-?weekly|biweekly|1st-and-3rd|every-two-weeks)$/.test(k)) return "fortnightly";
  if (/^(monthly|every-month|each-month)$/.test(k)) return "monthly";
  if (/^(quarterly|every-quarter|three-monthly|every-3-months)$/.test(k)) return "quarterly";
  if (/^(half-yearly|halfyearly|half-year|six-monthly|every-6-months|every-six-months|twice-a-year|semi-annual(ly)?)$/.test(k)) return "half-yearly";
  if (/^(yearly|annual|annually|every-year|each-year|once-a-year)$/.test(k)) return "yearly";
  if (/^(as-required|as-needed|on-demand|when-required|when-needed|manual|manually)$/.test(k)) return "as-required";
  if (/^(custom|customly|own|special)$/.test(k)) return "custom";
  return null;
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;/ ]+/).filter(Boolean) : v === undefined || v === null ? [] : [v]);
const int = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.floor(n) : null;
};

/**
 * THE FREQUENCY SAID IN WORDS (§202): the kind, and what it needs - a weekday for weekly and fortnightly, a day of the month
 * for monthly, quarterly, half-yearly and yearly (and a month for the last three), and for custom one of: every so many
 * days (from a date, today unless said), the weekdays, or the days of the month. What is not said is kept from the
 * schedule as it is, or defaulted (Monday, the 1st, January). The words of what is wrong, when it is.
 */
export function frequencyFromWords(
  args: Record<string, unknown>,
  now: ScheduleConfig,
  today: string = todayISO()
): { schedule: ScheduleConfig; frequency: Frequency } | { error: string } {
  const kind = kindOf(args.kind);
  if (kind === null) return { error: `the frequency “${word(args.kind) || "?"}” is not one of: daily, weekly, fortnightly, monthly, quarterly, half-yearly, yearly, as-required, custom, issued` };
  if (kind === "issued") return { error: "issued is handled apart: nothing to make" };
  const weekdaySaid = args.weekday !== undefined && args.weekday !== null && args.weekday !== "";
  const weekday = weekdaySaid ? weekdayOf(args.weekday) : "weekday" in now && typeof now.weekday === "number" ? now.weekday : 1;
  if (weekday === null) return { error: `“${word(args.weekday)}” is not a weekday (Sunday to Saturday)` };
  const daySaid = args.dayOfMonth !== undefined && args.dayOfMonth !== null && args.dayOfMonth !== "";
  const day = daySaid ? int(args.dayOfMonth) : "dayOfMonth" in now && typeof now.dayOfMonth === "number" ? now.dayOfMonth : 1;
  if (day === null || day < 1 || day > 31) return { error: `“${word(args.dayOfMonth)}” is not a day of the month (1 to 31)` };
  const monthSaid = args.month !== undefined && args.month !== null && args.month !== "";
  const month = monthSaid ? monthOf(args.month) : now.type === "yearly" ? now.month : now.type === "quarterly" || now.type === "half-yearly" ? now.anchorMonth : 0;
  if (month === null) return { error: `“${word(args.month)}” is not a month (January to December, or 1 to 12)` };
  const frequency = KINDS.find((k) => k.kind === kind)!.frequency;
  if (kind !== "custom") {
    // The month said sets the anchor of a quarter or a half-year too, which scheduleOf keeps from the current schedule otherwise.
    const base = monthSaid && (kind === "quarterly" || kind === "half-yearly") ? ({ type: "as-required" } as ScheduleConfig) : now;
    return { schedule: scheduleOf(kind, base, weekday, day, month), frequency };
  }
  const everyDays = args.everyDays !== undefined && args.everyDays !== null && args.everyDays !== "" ? int(args.everyDays) : null;
  const weekdays = list(args.weekdays).map(weekdayOf);
  const daysOfMonth = list(args.daysOfMonth).map(int);
  if (everyDays !== null) {
    const from = word(args.from) || today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return { error: `“${word(args.from)}” is not a date — give YYYY-MM-DD` };
    const schedule = customSchedule({ mode: "every", everyDays, from, weekdays: [], daysOfMonth: [] });
    return schedule ? { schedule, frequency } : { error: "every so many days: a count from 1 to 366 is needed" };
  }
  if (weekdays.length > 0) {
    if (weekdays.some((w) => w === null)) return { error: "a weekday was not understood: give Sunday to Saturday, or 0 to 6" };
    const schedule = customSchedule({ mode: "weekdays", everyDays: 0, from: today, weekdays: weekdays as number[], daysOfMonth: [] });
    return schedule ? { schedule, frequency } : { error: "at least one weekday is needed" };
  }
  if (daysOfMonth.length > 0) {
    if (daysOfMonth.some((d) => d === null || d < 1 || d > 31)) return { error: "a day of the month was not understood: give 1 to 31" };
    const schedule = customSchedule({ mode: "days", everyDays: 0, from: today, weekdays: [], daysOfMonth: daysOfMonth as number[] });
    return schedule ? { schedule, frequency } : { error: "at least one day of the month is needed" };
  }
  return { error: "a custom frequency needs one of: everyDays (with from), weekdays, or daysOfMonth" };
}
