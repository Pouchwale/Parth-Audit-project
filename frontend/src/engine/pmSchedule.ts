import type { LogSheetData, LogSheetRow, RecordInstance, RecordStatus } from "../types";
import { recordRepository } from "../data/repositories/recordRepository";
import { settingsRepository } from "../data/repositories/settingsRepository";
import { machineKey, machineNumbersIn } from "./equipmentMaster";
import { isHumanRecord } from "./insights";
import { historyOf, makeEntry } from "./recordHistory";

// F/MNT/03 FOLLOWS F/MNT/02 (REQUIREMENTS §82).
//
// The plant asked on 29-Sep-2026 that the Yearly Preventive Maintenance
// Schedule (F/MNT/03) be "connected to" the Preventive Maintenance Schedule &
// Record (F/MNT/02). The two papers hold one fact twice: a PM is written on the
// machine's own F/MNT/02 — its date, who did it, the supervisor, what was found
// — and again as an Actual date on the year's schedule. So the Actual is now
// READ FROM F/MNT/02 each time the schedule is shown, and NEVER STORED on
// F/MNT/03:
//
//   * one place records a PM. A date corrected on F/MNT/02 is corrected on the
//     schedule the next time it is drawn; a deleted F/MNT/02 drops out.
//   * F/MNT/03 gets no write, no history entry and no sync traffic for a PM. It
//     is one record for a year of about twenty machines; writing an Actual into
//     it at every PM would make it the most written record there is, a
//     simultaneous edit elsewhere would lose one side (data/serverSync.ts
//     laterRecord), and a Verified schedule would have to be reopened for each
//     PM. Its sign-off covers what is typed on it: the Plan.
//   * the Plan stays typed. A plan is a decision, never worked out.
//
// Nothing here goes through engine/computedCells.ts withComputedCells: that
// function's answer is SAVED with the record, and an out-of-date copy of the
// Actuals would then be written into F/MNT/03 on its next keystroke. The view
// (components/records/LogSheetRecordView.tsx) draws the Actuals from here as
// linked text; rule M6 (engine/insightRules.ts), the monthly summary
// (engine/monthlySummary.ts) and Mitra (engine/mitraTools.ts) read them from
// here too, so the four always agree.
//
// A MACHINE IS ITS NUMBER (engine/equipmentMaster.ts). A schedule line is
// matched to F/MNT/02 by its M/C No. only — never by the equipment name, which
// the schedule writes its own way ("CANARA", "XI CUTTING"). A number the
// schedule prints on two blocks — the 2026 page prints M-07 for both the
// Zhejiang manual inspection machine and the DK 450 slitting machine — links
// NEITHER, and each says why, until the department corrects the line.
// Frequencies must match exactly: a Half Yearly line reads only the
// "Six monthly" slots of F/MNT/02.
//
// Pure apart from currentPmIndex (the one reader of the repository, at the end),
// and no seed layout is imported: the layouts import nothing from here either.

export const PM_RECORD_DOC_ID = "mnt-pm-record";
export const PM_SCHEDULE_DOC_ID = "mnt-yearly-pm-schedule";

/** The month keys of F/MNT/03's Plan / Actual columns (janPlan, janActual …), in the year's order. */
export const PM_MONTH_KEYS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;
/** Short month names for sentences ("set against Jan's plan"). The column headings are the paper's own ("Mar.", "July"). */
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** M6's allowance: a PM done more than this many days after its plan is a slip (engine/insightRules.ts, monthlySummary.ts). */
export const PM_SLIP_DAYS = 7;

// ---------------------------------------------------------------------------
// frequencies

/**
 * The four frequencies F/MNT/02 prints a slot for, by the name its slots carry.
 * F/MNT/03 calls the six-monthly one "Half Yearly" and, on Rev 00, spells the
 * monthly one "Monthaly".
 */
export type PmFrequency = "Monthly" | "Quarterly" | "Six monthly" | "Yearly";

/** How far apart two PMs of a frequency are, in months. */
export const PM_INTERVAL_MONTHS: Record<PmFrequency, number> = { Monthly: 1, Quarterly: 3, "Six monthly": 6, Yearly: 12 };

/**
 * The frequency a schedule line or an F/MNT/02 slot names: "Monthly" and Rev
 * 00's "Monthaly", "Quarterly" (and F/MNT/02's "3 Monthly"), "Half Yearly" and
 * F/MNT/02's "Six monthly Preventive maintenance", "Yearly". Null for anything
 * else — such a line is not linked, rather than linked to a guess.
 */
export function pmFrequency(value: unknown): PmFrequency | null {
  const s = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!s) return null;
  if (/\b(?:half\s*yearly|six\s*monthly|6\s*monthly|half\s*year)\b/.test(s)) return "Six monthly";
  if (/\b(?:quarterly|3\s*monthly|three\s*monthly)\b/.test(s)) return "Quarterly";
  if (/\b(?:monthly|monthaly)\b/.test(s)) return "Monthly";
  if (/\b(?:yearly|annual|annually)\b/.test(s)) return "Yearly";
  return null;
}

// The slots F/MNT/02 Rev 01 prints, in order — twelve monthly, four quarterly,
// two six-monthly, one yearly (data/seed/maintenanceLayouts.ts PM_SLOTS). Used
// only for a line that has lost its printed name, so it is still read as the
// slot it is.
const SLOT_FREQUENCY: PmFrequency[] = [
  ...Array.from({ length: 12 }, (): PmFrequency => "Monthly"),
  ...Array.from({ length: 4 }, (): PmFrequency => "Quarterly"),
  "Six monthly",
  "Six monthly",
  "Yearly",
];

// ---------------------------------------------------------------------------
// dates

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days since 1970 for an ISO date, in UTC so no time zone moves it. */
const dayNumber = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
const isoOfDay = (day: number): string => new Date(day * 86400000).toISOString().slice(0, 10);
/** Days from one ISO date to another (negative when `to` is earlier). */
export const pmDaysBetween = (from: string, to: string): number => dayNumber(to) - dayNumber(from);
const addDaysISO = (iso: string, n: number): string => isoOfDay(dayNumber(iso) + n);
const isRealISO = (iso: string): boolean => ISO.test(iso) && isoOfDay(dayNumber(iso)) === iso;

/** The same day `n` months earlier or later; the 31st becomes the month's last day. */
function addMonthsISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const year = Math.floor(total / 12);
  const month0 = total - year * 12;
  const last = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  return `${year}-${String(month0 + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/**
 * A date written on F/MNT/02: the ISO date its Date box holds, or "28.01.2026"
 * where a date column has been made text (Edit format). A date with no year is
 * not a date there — the sheet prints no year to take it from.
 */
export function pmDate(value: unknown): string | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  if (ISO.test(s)) return isRealISO(s) ? s : null;
  const m = /^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4}|\d{2})$/.exec(s);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const iso = `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return isRealISO(iso) ? iso : null;
}

/** A Plan as F/MNT/03 writes it — "10.01", day.month, in the schedule's year — as ISO. Null when it is not a date ("31.02", "—"). */
export function planDate(value: unknown, year: number): string | null {
  const m = /^(\d{1,2})\s*[./-]\s*(\d{1,2})(?:\s*[./-]\s*(\d{4}|\d{2}))?$/.exec(String(value ?? "").trim());
  if (!m) return null;
  const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : year;
  const iso = `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return isRealISO(iso) ? iso : null;
}

/** "2026-01-28" → "28.01", the schedule's own way of writing a day. */
export const dayDotMonth = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
/** "2026-01-28" → "28.01.2026". */
export const dayDotMonthYear = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

// ---------------------------------------------------------------------------
// the PMs written on F/MNT/02

/** One PM as F/MNT/02 records it: a dated slot of one machine's sheet. */
export interface PmDone {
  /** The machine, as compared ("M-47"). */
  machine: string;
  frequency: PmFrequency;
  dateISO: string;
  /** The F/MNT/02 record and the slot (its line) the date is written on. */
  recordId: string;
  rowId: string;
  maintenance: string;
  supervisor: string;
  /** The F/MNT/02 record's status: a PM from a sheet not yet Verified is shown with a "*". */
  status: RecordStatus;
}

/** The PMs of each machine and frequency, keyed "M-47|Monthly", oldest first. */
export type PmIndex = Map<string, PmDone[]>;

export const pmIndexKey = (machine: string, frequency: PmFrequency): string => `${machine}|${frequency}`;

/**
 * The machine an F/MNT/02 header names in its "Machine Identification No" box:
 * "M-47", "m47", a bare "47" (the box exists to hold the number), or one
 * machine number inside longer words ("Lombardi / Delta 330 / M-47"). "" when
 * it names none, or several.
 */
export function pmSheetMachine(value: unknown): string {
  const key = machineKey(value);
  if (key) return key;
  const bare = /^\s*0*(\d{1,3})\s*$/.exec(String(value ?? ""));
  if (bare) return `M-${String(Number(bare[1])).padStart(2, "0")}`;
  const named = machineNumbersIn(value);
  return named.length === 1 ? named[0] : "";
}

const STATUS_RANK: Partial<Record<RecordStatus, number>> = { Verified: 0, "Pending Verification": 1, Submitted: 2 };
const rankOf = (s: RecordStatus): number => STATUS_RANK[s] ?? 3;

const text = (v: unknown): string => String(v ?? "").trim();

/**
 * Every dated slot of the F/MNT/02 sheets handed in, by machine and frequency.
 * Which sheets count is the caller's choice (only what a person wrote, one side
 * of Demo and Live: currentPmIndex below, rule M6, the monthly summary). The
 * same date for the same machine and frequency counts once, however many
 * sheets or slots carry it — the one from the furthest-signed sheet is kept.
 */
export function pmDoneIndex(records: readonly RecordInstance[]): PmIndex {
  const byKey = new Map<string, Map<string, PmDone>>();
  for (const r of records) {
    if (r.documentId !== PM_RECORD_DOC_ID) continue;
    const data = r.data as LogSheetData | undefined;
    const machine = pmSheetMachine(data?.header?.machineIdNo);
    if (!machine) continue;
    const rows = Array.isArray(data?.rows) ? data!.rows : [];
    rows.forEach((row: LogSheetRow, i: number) => {
      const dateISO = pmDate(row?.date);
      if (!dateISO) return;
      const frequency = pmFrequency(row.parameter) ?? (text(row.parameter) ? null : SLOT_FREQUENCY[i] ?? null);
      if (!frequency) return;
      const key = pmIndexKey(machine, frequency);
      let byDate = byKey.get(key);
      if (!byDate) byKey.set(key, (byDate = new Map()));
      const done: PmDone = {
        machine,
        frequency,
        dateISO,
        recordId: r.id,
        rowId: String(row.id ?? i),
        maintenance: text(row.maintenance),
        supervisor: text(row.supervisor),
        status: r.status,
      };
      const had = byDate.get(dateISO);
      if (!had || rankOf(done.status) < rankOf(had.status)) byDate.set(dateISO, done);
    });
  }
  const index: PmIndex = new Map();
  for (const [key, byDate] of byKey) index.set(key, [...byDate.values()].sort((a, b) => (a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : 0)));
  return index;
}

// ---------------------------------------------------------------------------
// the schedule's lines, and which Actual each PM is

/** A PM as it sits on the schedule: the month it is shown under and the plan it was counted against. */
export interface PmPlaced extends PmDone {
  /** 0 = January: the month column the PM is shown under. */
  month: number;
  /** The plan it was counted against (ISO), or null for a PM with no plan open for it. */
  plan: string | null;
  /** Days after that plan (negative for early); null with no plan. */
  lateDays: number | null;
}

/** One schedule line, linked: its machine and frequency, and the PMs under each month (0 = January). */
export interface PmLinkedLine {
  machine: string;
  frequency: PmFrequency;
  months: PmPlaced[][];
  /** The plan written in each month (ISO), null where none is. */
  plans: (string | null)[];
}

/** One schedule line that is not linked, and why, in words for the person reading the sheet. */
export interface PmUnlinkedLine {
  machine: string;
  unlinked: string;
}

export type PmRowActuals = PmLinkedLine | PmUnlinkedLine;

export const isLinkedLine = (a: PmRowActuals | undefined): a is PmLinkedLine => !!a && !("unlinked" in a);

/** What F/MNT/01 says a machine is — "the DK-450 Label Slitting Machine" — for the reason a line is not linked; null when it is not on the list. */
export type ListedAs = (machine: string) => string | null;

const nameKey = (v: unknown): string =>
  String(v ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * Where each PM of one line falls on the schedule (REQUIREMENTS §82). The PMs
 * are taken in date order, and each is counted against the first of these:
 *   1. the OLDEST plan still open that is dated no more than one interval
 *      before it (a month, a quarter, six months, a year) and no more than
 *      M6's seven days after it — a PM done late for that plan;
 *   2. the plan still open in its own month — a PM done early;
 *   3. its own month, with no plan: a PM nobody planned, or a year whose plans
 *      were never written.
 * Plans 10.01 and 10.02 with PMs on 03.02 and 12.02 give Jan "03.02" (late) and
 * Feb "12.02". Placing each date by its calendar month alone would call
 * January not done — which M6 rates HIGH — when it was done, late.
 */
function placeLine(frequency: PmFrequency, plans: (string | null)[], dones: PmDone[]): PmPlaced[][] {
  const months: PmPlaced[][] = Array.from({ length: 12 }, () => []);
  const open = new Set<number>();
  plans.forEach((p, m) => p && open.add(m));
  const interval = PM_INTERVAL_MONTHS[frequency];
  for (const d of dones) {
    const lower = addMonthsISO(d.dateISO, -interval);
    const upper = addDaysISO(d.dateISO, PM_SLIP_DAYS);
    let chosen = -1;
    for (const m of open) {
      const p = plans[m]!;
      if (p < lower || p > upper) continue;
      if (chosen < 0 || p < plans[chosen]! || (p === plans[chosen]! && m < chosen)) chosen = m;
    }
    const own = Number(d.dateISO.slice(5, 7)) - 1;
    if (chosen < 0 && open.has(own)) chosen = own;
    if (chosen >= 0) {
      open.delete(chosen);
      const plan = plans[chosen]!;
      months[chosen].push({ ...d, month: chosen, plan, lateDays: pmDaysBetween(plan, d.dateISO) });
    } else months[own].push({ ...d, month: own, plan: null, lateDays: null });
  }
  return months;
}

/**
 * The Actuals of each line of a Rev 01 schedule for `year`, read from the
 * F/MNT/02 index — or, for a line that cannot be linked, why. Only PMs dated in
 * the schedule's own year are read: next January's PM belongs to next year's
 * sheet. `listedAs` adds what F/MNT/01 says a machine is to the reason a
 * duplicated number is not linked.
 */
export function pmActuals(rows: readonly LogSheetRow[], year: number, index: PmIndex, listedAs?: ListedAs): PmRowActuals[] {
  // A number printed on more than one block, or a frequency printed twice for
  // one machine, cannot be told apart on F/MNT/02: neither line is linked.
  const namesOf = new Map<string, string[]>();
  const linesOf = new Map<string, number>();
  for (const row of rows) {
    const machine = machineKey(row.machineNo);
    if (!machine) continue;
    const names = namesOf.get(machine) ?? [];
    const name = text(row.equipment);
    if (!names.some((n) => nameKey(n) === nameKey(name))) names.push(name);
    namesOf.set(machine, names);
    const frequency = pmFrequency(row.frequency);
    if (frequency) linesOf.set(pmIndexKey(machine, frequency), (linesOf.get(pmIndexKey(machine, frequency)) ?? 0) + 1);
  }
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  return rows.map((row): PmRowActuals => {
    const written = text(row.machineNo);
    const machine = machineKey(written);
    if (!machine) return { machine: written, unlinked: written ? `Not linked: "${written}" is not a machine number, so no F/MNT/02 can be read for this line.` : "Not linked: this line has no M/C No., so no F/MNT/02 can be read for it." };
    const names = namesOf.get(machine) ?? [];
    if (names.length > 1) {
      const listed = listedAs?.(machine);
      return {
        machine,
        unlinked:
          `Not linked: ${machine} is printed on ${names.length} blocks of this schedule (${names.map((n) => `"${n || "unnamed"}"`).join(" and ")}), so a PM written on ${machine}'s F/MNT/02 cannot be placed on either.` +
          (listed ? ` F/MNT/01 lists ${machine} as ${listed}.` : "") +
          " Confirm the number with the department and correct the line (Edit format); the link then follows.",
      };
    }
    const frequency = pmFrequency(row.frequency);
    if (!frequency) return { machine, unlinked: `Not linked: the frequency "${text(row.frequency)}" is not one F/MNT/02 records (Monthly, Quarterly, Half Yearly, Yearly).` };
    if ((linesOf.get(pmIndexKey(machine, frequency)) ?? 0) > 1) {
      return { machine, unlinked: `Not linked: ${machine}'s ${text(row.frequency)} PM is printed on more than one line of this schedule, so its F/MNT/02 dates cannot be placed on one of them. Confirm with the department.` };
    }
    const plans = PM_MONTH_KEYS.map((m) => {
      const p = planDate(row[`${m}Plan`], year);
      return p && p >= from && p <= to ? p : null;
    });
    const dones = (index.get(pmIndexKey(machine, frequency)) ?? []).filter((d) => d.dateISO >= from && d.dateISO <= to);
    return { machine, frequency, plans, months: placeLine(frequency, plans, dones) };
  });
}

/** A month cell's words: "28.01", "03.02 · 12.02", with "*" after a PM from an F/MNT/02 not yet Verified. */
export function pmCellText(done: readonly PmDone[]): string {
  return done.map((d) => `${dayDotMonth(d.dateISO)}${d.status === "Verified" ? "" : "*"}`).join(" · ");
}

/** The tooltip of one linked Actual: when, by whom, from which sheet, and the plan it was counted against. */
export function pmDoneTitle(d: PmPlaced): string {
  const who = d.maintenance ? ` by ${d.maintenance}` : "";
  const sup = d.supervisor ? `, supervised by ${d.supervisor}` : "";
  const status = d.status === "Verified" ? "Verified" : `${d.status} — not yet Verified`;
  let against = "";
  if (d.plan === null) against = ` No plan was open for it, so it is shown in its own month.`;
  else if (d.month !== Number(d.dateISO.slice(5, 7)) - 1 || (d.lateDays ?? 0) > PM_SLIP_DAYS) {
    const days = d.lateDays ?? 0;
    against = ` Set against ${MONTH_SHORT[d.month]}'s plan ${dayDotMonth(d.plan)} — ${days === 0 ? "on the day" : days > 0 ? `${days} day${days === 1 ? "" : "s"} late` : `${-days} day${days === -1 ? "" : "s"} early`}.`;
  }
  return `Done ${dayDotMonthYear(d.dateISO)}${who}${sup} — F/MNT/02, ${d.machine} (${status}).${against}`;
}

// ---------------------------------------------------------------------------
// what is still to be done

/** A planned PM with no F/MNT/02 date counted against it. */
export interface PmDueItem {
  /** The schedule line (0-based) it is on. */
  rowIndex: number;
  machine: string;
  equipment: string;
  /** The frequency as the line prints it ("Half Yearly"). */
  frequencyLabel: string;
  frequency: PmFrequency;
  month: number;
  /** ISO. */
  plan: string;
  /** Days past the plan today: negative while it is still ahead. */
  daysPast: number;
}

/**
 * Every plan of a Rev 01 schedule that no PM on F/MNT/02 has been counted
 * against, oldest first — overdue ones and those still to come. A line that is
 * not linked has nothing here: its PMs cannot be read, so they cannot be said
 * to be missing either.
 */
export function pmDue(rows: readonly LogSheetRow[], year: number, index: PmIndex, today: string, actuals?: PmRowActuals[]): PmDueItem[] {
  const lines = actuals ?? pmActuals(rows, year, index);
  const out: PmDueItem[] = [];
  lines.forEach((line, rowIndex) => {
    if (!isLinkedLine(line)) return;
    line.plans.forEach((plan, month) => {
      if (!plan) return;
      if (line.months.some((cell) => cell.some((d) => d.plan === plan))) return;
      const row = rows[rowIndex];
      out.push({
        rowIndex,
        machine: line.machine,
        equipment: text(row?.equipment),
        frequencyLabel: text(row?.frequency),
        frequency: line.frequency,
        month,
        plan,
        daysPast: pmDaysBetween(plan, today),
      });
    });
  });
  return out.sort((a, b) => (a.plan < b.plan ? -1 : a.plan > b.plan ? 1 : a.rowIndex - b.rowIndex));
}

/** "due in 11 days", "due today", "5 days overdue". */
export function dueWords(daysPast: number): string {
  if (daysPast === 0) return "due today";
  if (daysPast < 0) return `due in ${-daysPast} day${daysPast === -1 ? "" : "s"}`;
  return `${daysPast} day${daysPast === 1 ? "" : "s"} overdue`;
}

// ---------------------------------------------------------------------------
// which schedule, and the index as it stands now

/** Is this F/MNT/03 on a revision whose Actuals are read from F/MNT/02? Rev 00 pages keep their typed Actuals. */
export const schedulesLinked = (record: Pick<RecordInstance, "documentId" | "formatRevision">): boolean =>
  record.documentId === PM_SCHEDULE_DOC_ID && !record.formatRevision;

/** The schedule's year: the paper prints it in its title ("- 2026"), the record holds it in its due date. */
export const scheduleYear = (record: Pick<RecordInstance, "dueDate">): number => Number(String(record.dueDate).slice(0, 4));

/**
 * The F/MNT/03 a machine's F/MNT/02 is read against: the given year's linked
 * (Rev 01) schedule with the most plans written, a Verified one before one not
 * yet signed, then the latest written.
 */
export function scheduleForYear(records: readonly RecordInstance[], year: number): RecordInstance<LogSheetData> | undefined {
  let best: RecordInstance | undefined;
  let bestScore = -1;
  for (const r of records) {
    if (!schedulesLinked(r) || scheduleYear(r) !== year) continue;
    const rows = (r.data as LogSheetData | undefined)?.rows ?? [];
    let plans = 0;
    for (const row of rows) for (const m of PM_MONTH_KEYS) if (text(row[`${m}Plan`])) plans++;
    const score = (plans > 0 ? 2 : 0) + (r.status === "Verified" ? 1 : 0);
    if (score > bestScore || (score === bestScore && best && r.updatedAt > best.updatedAt)) {
      best = r;
      bestScore = score;
    }
  }
  return best as RecordInstance<LogSheetData> | undefined;
}

let indexMemo: { key: string; index: PmIndex } | null = null;

/**
 * The PMs on F/MNT/02 as they stand now, on one side of Demo and Live: only
 * sheets a person wrote (engine/insights.ts isHumanRecord — a sheet the
 * assistant prepared and nobody touched says nothing about a machine), and only
 * the departments this account may see (the scoped query). Built once per
 * version of the F/MNT/02 records — their ids, when each was last written and
 * its status — so drawing the schedule again, or typing into it, does not read
 * the sheets again.
 */
export function currentPmIndex(isDemo: boolean): PmIndex {
  const records = recordRepository.query({ documentId: PM_RECORD_DOC_ID, isDemo });
  const liveStartDate = isDemo ? null : settingsRepository.get().liveStartDate;
  let key = `${isDemo ? 1 : 0}|${liveStartDate ?? ""}`;
  for (const r of records) key += `|${r.id}:${r.updatedAt}:${r.status}`;
  if (!indexMemo || indexMemo.key !== key) {
    indexMemo = { key, index: pmDoneIndex(records.filter((r) => isHumanRecord(r, liveStartDate))) };
  }
  return indexMemo.index;
}

/** The F/MNT/03 schedules as they stand now, on one side of Demo and Live (scoped). */
export const currentSchedules = (isDemo: boolean): RecordInstance[] => recordRepository.query({ documentId: PM_SCHEDULE_DOC_ID, isDemo });

// ---------------------------------------------------------------------------
// the start-up migration: schedules written on Rev 00 stay on Rev 00

export const REV00_PIN_NOTE =
  "Kept on F/MNT/03 Rev 00 (00/01.12.2021), the revision this schedule was written on: its machine classes and its typed Actual dates are shown as they were written. Rev 01 (15.07.2026) lists the machines by M/C No. and reads each Actual from the machine's F/MNT/02.";

/**
 * F/MNT/03 BECAME REV 01 ON 15.07.2026 (REQUIREMENTS §82). A schedule written
 * before holds Rev 00's lines — PRINTING MACHINE, SLITTING MACHINE, a third
 * block — and its Actual dates TYPED on it. Drawn on Rev 01 its lines would
 * not be the lines printed, and its Actuals would be replaced by what F/MNT/02
 * says. So each such record is pinned to revision "00" (RecordInstance.
 * formatRevision) and keeps its own page, its typed Actuals and its sample
 * marks. Runs at every start (data/bootstrap.ts) and is idempotent: a record
 * already pinned is skipped, and so is one written on Rev 01 — its lines carry
 * an M/C No. — and one with no lines at all, which has nothing to keep. The
 * pin is written into the record's history by "System"; updatedAt is left as
 * it was (upsertMany), so nothing reads the record as newly worked on.
 */
export function pinSchedulesWrittenOnRev00(): number {
  const updates: RecordInstance[] = [];
  // Unscoped on purpose, as every boot-time migration is: the register must be
  // put right whoever is signed in (engine/departmentScope.ts).
  for (const r of recordRepository.queryUnscoped({ documentId: PM_SCHEDULE_DOC_ID })) {
    if (r.formatRevision) continue;
    const rows = (r.data as LogSheetData | undefined)?.rows;
    if (!Array.isArray(rows) || rows.length === 0) continue;
    if (rows.some((row) => text(row?.machineNo))) continue;
    const history = r.history && r.history.length > 0 ? r.history : historyOf(r);
    updates.push({ ...r, formatRevision: "00", history: [...history, makeEntry("edited", "System", { note: REV00_PIN_NOTE })] });
  }
  if (updates.length > 0) recordRepository.upsertMany(updates);
  return updates.length;
}

/** The F/MNT/02 sheets of one machine, newest first (scoped) — where "record it on F/MNT/02" sends a person. */
export function pmSheetsOf(machine: string, isDemo: boolean): RecordInstance[] {
  return recordRepository
    .query({ documentId: PM_RECORD_DOC_ID, isDemo })
    .filter((r) => pmSheetMachine((r.data as LogSheetData | undefined)?.header?.machineIdNo) === machine)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}
