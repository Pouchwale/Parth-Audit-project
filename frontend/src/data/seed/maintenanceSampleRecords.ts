import type { HistoryEntry, LogSheetData, LogSheetRow, RecordInstance } from "../../types";
import { EQUIPMENT_LIST_2026_09_29_ROWS, YEARLY_PM_2026_ROWS } from "./maintenanceLayouts";
import { SEED_MASTER_DATA } from "./masterData";

// SAMPLE PM DATES FOR 2026, TO TRY F/MNT/02 → F/MNT/03 (REQUIREMENTS §82).
//
// Asked for on 29-Sep-2026: "mnt-02 … when maintenance is done and all dates
// are always fake, and mnt-03 is connected to 02, so make the data operate
// accordingly." The plant runs without Demo Mode, so the made-up dates are
// SAMPLE records on the Live side, each saying so in its history — so the link
// can be seen working on the schedule the plant actually has:
//
//   F/MNT/02  one sheet for each machine number on the 2026 schedule — twenty,
//             M-07 once although the schedule prints it on two blocks — its
//             header fetched from the 29-Sep-2026 issue of F/MNT/01 the way the
//             Machine No. fetch fills it (the name is the list's "Machine Name /
//             Model No.", left blank where the list writes "-"), and made-up PM
//             dates for 2026 up to 29-Sep-2026: Monthly January to September,
//             Quarterly in March, June and September, Half Yearly in June, no
//             Yearly yet. Most are within a few days of the plan; four are more
//             than a week late and two are missed, so the schedule shows slips
//             as a real year would. None falls on a Thursday (the weekly off) or
//             a festival holiday of the leave calendar (Master Data). Done by
//             Rahul Patel, supervised by Mukesh Patel — the Maintenance
//             supervisor and manager on the plant's own HR papers (hrRecords.ts).
//             In Progress, due 31-Dec-2026: a sheet is complete at the year's end.
//   F/MNT/02  the supplied sheet for M-68 itself ("DCM Sleeve Seaming Machine"),
//             its check points as printed and no date, as the paper has none.
//   F/MNT/03  the 2026 schedule on Rev 01, every Plan written for the year as
//             each line's frequency needs, and NO Actual: the Actuals are read
//             from the F/MNT/02 sheets above (engine/pmSchedule.ts). Verified by
//             Mukesh Patel on 15.07.2026, the Rev 01 date.
//
// DETERMINISTIC — no Math.random: every date comes from a hash of the machine
// and the month, so every installation is seeded with the same year, and a
// test can hold it to its promises (frontend/tests/maintenancePm.test.ts).
// Like every seed, a record is added only where its id is missing
// (recordRepository.ensureSeeded): once on file it is the plant's to replace.

export const SAMPLE_PM_NOTE = "Sample data — made-up dates for trying F/MNT/02 → F/MNT/03 (asked for on 29-Sep-2026). Replace with the real PM dates.";
/** Who the sample entry is by in each record's history: not "System", so the sheets read as written ones (engine/insights.ts isHumanRecord). */
export const SAMPLE_BY = "Maintenance (sample data, 29-Sep-2026)";
/** No sample date is later than the day the samples were asked for. */
export const SAMPLE_UP_TO = "2026-09-29";
export const SAMPLE_YEAR = 2026;
export const SAMPLE_SCHEDULE_ID = "seed-sample-mnt-pm-schedule-2026";
export const samplePmSheetId = (machine: string): string => `seed-sample-mnt-pm-${machine}-2026`;

const MAINTENANCE = "Rahul Patel";
const SUPERVISOR = "Mukesh Patel";
const MADE_AT = "2026-09-29T04:30:00.000Z";

// ---------------------------------------------------------------------------
// the plant's calendar

const HOLIDAYS = new Set((SEED_MASTER_DATA.holidays ?? []).map((h) => h.date));
const WEEKLY_OFF = typeof SEED_MASTER_DATA.weeklyOffDay === "number" ? SEED_MASTER_DATA.weeklyOffDay : 4;

const dayNumber = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
const isoOf = (day: number): string => new Date(day * 86400000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number): string => isoOf(dayNumber(iso) + n);
const weekday = (iso: string): number => new Date(dayNumber(iso) * 86400000).getUTCDay();
/** A Thursday — even an adjustment Thursday the plant works — or a festival holiday. */
export const isSampleClosedDay = (iso: string): boolean => weekday(iso) === WEEKLY_OFF || HOLIDAYS.has(iso);
/** The day itself, or the next day the plant is open. */
const openDay = (iso: string): string => {
  let d = iso;
  while (isSampleClosedDay(d)) d = addDays(d, 1);
  return d;
};
const iso = (month0: number, day: number): string => `${SAMPLE_YEAR}-${String(month0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
/** The same day a month later; the 31st becomes the month's last day. */
const monthLater = (date: string): string => {
  const [y, m, d] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return `${m === 12 ? y + 1 : y}-${String((m % 12) + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
};
const dayDotMonth = (date: string): string => `${date.slice(8, 10)}.${date.slice(5, 7)}`;

/** FNV-1a: the same number for the same words on every computer. */
function hash(words: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < words.length; i++) {
    h ^= words.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// ---------------------------------------------------------------------------
// the plan, machine by machine

/** Each scheduled machine number once, in the order the schedule first prints it, with every frequency printed for it. */
export const SAMPLE_PM_MACHINES: { machine: string; frequencies: string[] }[] = (() => {
  const out: { machine: string; frequencies: string[] }[] = [];
  for (const r of YEARLY_PM_2026_ROWS) {
    let m = out.find((x) => x.machine === r.machineNo);
    if (!m) out.push((m = { machine: r.machineNo, frequencies: [] }));
    if (!m.frequencies.includes(r.frequency)) m.frequencies.push(r.frequency);
  }
  return out;
})();

/** A machine's planning day in the month: between the 5th and the 18th, so September's PM is done before the samples' last day. */
const planDay = (machine: string): number => 5 + (hash(machine) % 14);
/** The machine's plan for a month (0 = January): its planning day, or the next day the plant is open. */
const planOf = (machine: string, month0: number): string => openDay(iso(month0, planDay(machine)));

/** The months a frequency's plans fall in (0 = January). */
const PLAN_MONTHS: Record<string, number[]> = {
  Monthly: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  Quarterly: [2, 5, 8, 11],
  "Half Yearly": [5, 11],
  Yearly: [11],
};
/** The months a PM has been done in by 29-Sep-2026. */
const DONE_MONTHS: Record<string, number[]> = { Monthly: [0, 1, 2, 3, 4, 5, 6, 7, 8], Quarterly: [2, 5, 8], "Half Yearly": [5], Yearly: [] };

// The slips, named so a person trying the link can find them: four monthly PMs
// done more than M6's week after their plan, and two not done at all.
const LATE: Record<string, number> = { "M-03|1": 12, "M-47|2": 10, "M-09|5": 11, "M-36|7": 9 };
const MISSED = new Set(["M-12|4", "M-44|6"]);

/** The Monthly PM dates of one machine, by month; null where it was missed. */
function monthlyDone(machine: string): (string | null)[] {
  const out: (string | null)[] = [];
  let missedPlan: string | null = null;
  for (const m of DONE_MONTHS.Monthly) {
    const key = `${machine}|${m}`;
    const plan = planOf(machine, m);
    if (MISSED.has(key)) {
      out[m] = null;
      missedPlan = plan;
      continue;
    }
    const offset = LATE[key] ?? (hash(`${machine}|${m}|done`) % 8) - 3; // three days early to four late
    let date = addDays(plan, offset);
    // After a missed month the next PM is dated more than a month after the
    // missed plan, so it is read as that month's PM and not as the missed one
    // done late (engine/pmSchedule.ts, the placement rule).
    if (missedPlan) {
      const after = addDays(monthLater(missedPlan), 1);
      if (date < after) date = after;
      missedPlan = null;
    }
    date = openDay(date);
    out[m] = date <= SAMPLE_UP_TO ? date : null;
  }
  return out;
}

/** One made-up PM of a machine: which F/MNT/02 slot group it goes in and its date. */
export interface SamplePm {
  machine: string;
  frequency: string;
  month0: number;
  date: string;
}

/** Every made-up PM, machine by machine. A Quarterly or Half Yearly PM is done with that month's Monthly one. */
export const SAMPLE_PMS: SamplePm[] = SAMPLE_PM_MACHINES.flatMap(({ machine, frequencies }) => {
  const monthly = monthlyDone(machine);
  const out: SamplePm[] = [];
  for (const frequency of frequencies) {
    for (const m of DONE_MONTHS[frequency] ?? []) {
      const date = frequency === "Monthly" ? monthly[m] : monthly[m] ?? openDay(addDays(planOf(machine, m), 1));
      if (date && date <= SAMPLE_UP_TO) out.push({ machine, frequency, month0: m, date });
    }
  }
  return out;
});

// ---------------------------------------------------------------------------
// the records

const history = (entries: [at: string, by: string, action: HistoryEntry["action"], note?: string][], id: string): HistoryEntry[] =>
  entries.map(([at, by, action, note], i) => ({ id: `${id}-h${i + 1}`, at, by, action, ...(note ? { note } : {}) }));

// The F/MNT/02 slots in the Rev 01 page's order (maintenanceLayouts.ts PM_SLOTS).
const SLOTS: string[] = [
  ...Array.from({ length: 12 }, () => "Monthly Preventive maintenance"),
  ...Array.from({ length: 4 }, () => "Quarterly Preventive maintenance"),
  "Six monthly Preventive maintenance",
  "Six monthly Preventive maintenance",
  "Yearly Preventive maintenance",
];
const FIRST_SLOT: Record<string, number> = { Monthly: 0, Quarterly: 12, "Half Yearly": 16, Yearly: 18 };

const blankSlot = (parameter: string, i: number): LogSheetRow => ({
  id: `s${String(i + 1).padStart(2, "0")}`,
  parameter,
  date: "",
  maintenance: "",
  supervisor: "",
  findings: "",
  actionTaken: "",
});

// The Machine No. fetch's rule (engine/equipmentMaster.ts machineValue): the
// list's "NA", "-" and blanks are not values to copy. Kept here as the rule's
// words, because a seed must not import the engine that reads the records.
const PLACEHOLDER = /^(?:|na|n\/a|n\.a\.?|nil|none|-+|–|—)$/i;
const usable = (v: unknown): string => (PLACEHOLDER.test(String(v ?? "").trim()) ? "" : String(v ?? "").trim());

function pmSheet(machine: string): RecordInstance<LogSheetData> {
  const listed = EQUIPMENT_LIST_2026_09_29_ROWS.find((r) => r.machineNo === machine);
  const rows = SLOTS.map(blankSlot);
  const used: Record<string, number> = {};
  for (const pm of SAMPLE_PMS.filter((p) => p.machine === machine).sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const slot = FIRST_SLOT[pm.frequency] + (used[pm.frequency] ?? 0);
    used[pm.frequency] = (used[pm.frequency] ?? 0) + 1;
    rows[slot] = { ...rows[slot], date: pm.date, maintenance: MAINTENANCE, supervisor: SUPERVISOR };
  }
  const id = samplePmSheetId(machine);
  return {
    id,
    documentId: "mnt-pm-record",
    periodKey: `mnt-pm-record:2026-12-31:sample-${machine}`,
    dueDate: "2026-12-31",
    status: "In Progress",
    isDemo: false,
    data: {
      header: {
        machineName: usable(listed?.model),
        machineIdNo: listed?.machineNo ?? machine,
        monthlyCheckPoints: "",
        quarterlyCheckPoints: "",
        sixMonthlyCheckPoints: "",
        yearlyCheckPoints: "",
      },
      rows,
    },
    createdAt: MADE_AT,
    updatedAt: MADE_AT,
    history: history([[MADE_AT, SAMPLE_BY, "edited", SAMPLE_PM_NOTE]], id),
  };
}

/**
 * The F/MNT/02 supplied for M-68 on 29-Sep-2026 (DCM Sleeves Seaming Machine -
 * F-MNT-02_PM schedule & record_GALLOPS), as written: the machine's name in the
 * label box, its number, and its check points. The paper heads its second box
 * "Monthly Check points" too, so all five Monthly items are the Monthly list.
 * No slot is dated on it, and none is here. M-68 is not on the 2026 schedule.
 */
export const SAMPLE_M68_NOTE =
  "The F/MNT/02 sheet supplied for M-68 on 29-Sep-2026 (DCM Sleeves Seaming Machine - F-MNT-02_PM schedule & record_GALLOPS), its check points as printed; the paper dates no PM, so none is dated here. Its second box is headed \"Monthly Check points\" on the paper, so its two items are listed with the Monthly ones.";

function m68Sheet(): RecordInstance<LogSheetData> {
  const id = samplePmSheetId("M-68");
  return {
    id,
    documentId: "mnt-pm-record",
    periodKey: "mnt-pm-record:2026-12-31:sample-M-68",
    dueDate: "2026-12-31",
    status: "In Progress",
    isDemo: false,
    data: {
      header: {
        machineName: "DCM Sleeve Seaming Machine",
        machineIdNo: "M-68",
        monthlyCheckPoints: ["Machine Part cleaning", "Tooling and Part cleaning", "Machine roll cleaning", "Lubrication – Oil & greasing", "Gluing Tap Leakage Checking"].join("\n"),
        quarterlyCheckPoints: "",
        sixMonthlyCheckPoints: ["Panel board cleaning", "Earthing check"].join("\n"),
        yearlyCheckPoints: "Wiring checking",
      },
      rows: SLOTS.map(blankSlot),
    },
    createdAt: MADE_AT,
    updatedAt: MADE_AT,
    history: history([[MADE_AT, SAMPLE_BY, "edited", SAMPLE_M68_NOTE]], id),
  };
}

const MONTH_KEYS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** The 2026 schedule, Rev 01: the 42 printed lines, every Plan the frequency needs, and no Actual (it is read from F/MNT/02). */
function schedule(): RecordInstance<LogSheetData> {
  const rows: LogSheetRow[] = YEARLY_PM_2026_ROWS.map((line, i) => {
    const row: LogSheetRow = { id: `r${String(i + 1).padStart(2, "0")}`, machineNo: line.machineNo, equipment: line.equipment, frequency: line.frequency };
    const planned = new Set(PLAN_MONTHS[line.frequency] ?? []);
    MONTH_KEYS.forEach((m, month0) => {
      row[`${m}Plan`] = planned.has(month0) ? dayDotMonth(planOf(line.machineNo, month0)) : "";
      row[`${m}Actual`] = "";
    });
    return row;
  });
  const PLANNED = "2026-07-15T05:00:00.000Z";
  const SUBMITTED = "2026-07-15T06:00:00.000Z";
  const VERIFIED = "2026-07-15T10:30:00.000Z";
  return {
    id: SAMPLE_SCHEDULE_ID,
    documentId: "mnt-yearly-pm-schedule",
    // The year's own record: the period the generator makes for 1-Jan, due the
    // next day the plant is open (1-Jan-2026 is a Thursday).
    periodKey: "mnt-yearly-pm-schedule:2026-01-01",
    dueDate: "2026-01-02",
    status: "Verified",
    isDemo: false,
    data: { header: {}, rows },
    createdAt: PLANNED,
    updatedAt: VERIFIED,
    submittedBy: MAINTENANCE,
    submittedAt: SUBMITTED,
    verifiedBy: SUPERVISOR,
    verifiedAt: VERIFIED,
    history: history(
      [
        [PLANNED, SAMPLE_BY, "edited", SAMPLE_PM_NOTE],
        [SUBMITTED, MAINTENANCE, "submitted"],
        [VERIFIED, SUPERVISOR, "verified"],
      ],
      SAMPLE_SCHEDULE_ID
    ),
  };
}

export const SEED_MNT_SAMPLE_RECORDS: RecordInstance<LogSheetData>[] = [...SAMPLE_PM_MACHINES.map(({ machine }) => pmSheet(machine)), m68Sheet(), schedule()];
