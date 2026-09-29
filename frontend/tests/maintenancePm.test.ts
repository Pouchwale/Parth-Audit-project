// F/MNT/03 FOLLOWS F/MNT/02 (REQUIREMENTS §82), held to cases whose answer is known.
//
// The yearly schedule's Actual dates are read from the machines' F/MNT/02 sheets
// each time the schedule is shown, and never stored on it (engine/pmSchedule.ts).
// So each promise is checked here: the frequencies match exactly; a PM is placed
// under the plan it was done for, early or late; the same date on two sheets
// counts once; another year, the other side of Demo and Live and a sheet nobody
// wrote are left out; a number printed on two blocks links neither; nothing is
// ever written into F/MNT/03; a corrected or deleted F/MNT/02 is followed; M6,
// the monthly summary and Mitra read the same Actuals; and the sample year that
// ships with the app is what it says it is.
//
// "Today" is fixed, not the clock, so the answers are the same whatever day the
// tests run.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { LogSheetData, LogSheetRow, RecordInstance } from "../src/types";
import { YEARLY_PM_2026_ROWS } from "../src/data/seed/maintenanceLayouts";
import { SEED_MASTER_DATA } from "../src/data/seed/masterData";
import {
  SAMPLE_PM_MACHINES,
  SAMPLE_PM_NOTE,
  SAMPLE_SCHEDULE_ID,
  SAMPLE_UP_TO,
  SEED_MNT_SAMPLE_RECORDS,
  samplePmSheetId,
} from "../src/data/seed/maintenanceSampleRecords";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrMasterSeeded } from "../src/data/repositories/hrMasterRepository";
import { recordRepository, ensureSeeded as ensureRecordsSeeded } from "../src/data/repositories/recordRepository";
import { computeInsights } from "../src/engine/insights";
import { withComputedCells } from "../src/engine/computedCells";
import { applyAssistantPatch } from "../src/engine/recordPatch";
import { mitraTools, runTool } from "../src/engine/mitraTools";
import type { MitraToolContext } from "../src/engine/mitraTypes";
import { createElement as h, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import { todayISO } from "../src/utils/date";
import {
  currentPmIndex,
  dueWords,
  isLinkedLine,
  planDate,
  pmActuals,
  pmCellText,
  pmDate,
  pmDoneIndex,
  pmDue,
  pmFrequency,
  pmSheetMachine,
  pinSchedulesWrittenOnRev00,
  REV00_PIN_NOTE,
  type PmLinkedLine,
} from "../src/engine/pmSchedule";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrMasterSeeded();
ensureRecordsSeeded();
// The router reads the address the moment it loads (the pages are imported below, after this).
const scopeGlobals = globalThis as unknown as Record<string, unknown>;
if (!scopeGlobals.location) scopeGlobals.location = { hash: "", href: "http://localhost/", pathname: "/", search: "", origin: "http://localhost" };
if (!scopeGlobals.history) scopeGlobals.history = { state: null, replaceState() {}, pushState() {}, go() {}, back() {} };

const PM_ROWS = [
  ...Array.from({ length: 12 }, () => "Monthly Preventive maintenance"),
  ...Array.from({ length: 4 }, () => "Quarterly Preventive maintenance"),
  "Six monthly Preventive maintenance",
  "Six monthly Preventive maintenance",
  "Yearly Preventive maintenance",
];

type Slot = { slot: number; date: string; maintenance?: string; supervisor?: string };

/** An F/MNT/02 sheet for one machine with the given dated slots. */
function pmSheet(id: string, machine: string, slots: Slot[], extra: Partial<RecordInstance<LogSheetData>> = {}): RecordInstance<LogSheetData> {
  const rows: LogSheetRow[] = PM_ROWS.map((parameter, i) => {
    const s = slots.find((x) => x.slot === i);
    return { id: `s${i}`, parameter, date: s?.date ?? "", maintenance: s ? s.maintenance ?? "Rahul Patel" : "", supervisor: s ? s.supervisor ?? "Mukesh Patel" : "", findings: "", actionTaken: "" };
  });
  return {
    id,
    documentId: "mnt-pm-record",
    periodKey: `mnt-pm-record:2026-01-01:${id}`,
    dueDate: "2026-12-31",
    status: "Verified",
    isDemo: false,
    data: { header: { machineName: "Delta 330", machineIdNo: machine }, rows },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}

/** A schedule line: machine, equipment, frequency and plans by month key. */
const line = (machineNo: string, equipment: string, frequency: string, plans: Record<string, string> = {}): LogSheetRow => {
  const row: LogSheetRow = { id: `${machineNo}-${frequency}`, machineNo, equipment, frequency };
  for (const [m, p] of Object.entries(plans)) row[`${m}Plan`] = p;
  return row;
};

const linked = (a: ReturnType<typeof pmActuals>[number]): PmLinkedLine => {
  assert.ok(isLinkedLine(a), `the line should be linked: ${JSON.stringify(a)}`);
  return a;
};
const cells = (a: PmLinkedLine): string[] => a.months.map(pmCellText);

// ---------------------------------------------------------------------------
// the words each paper uses

test("frequencies: F/MNT/03's Monthly, Monthaly, Quarterly, Half Yearly and Yearly are F/MNT/02's four slot names", () => {
  assert.equal(pmFrequency("Monthly"), "Monthly");
  assert.equal(pmFrequency("Monthaly"), "Monthly", "Rev 00's spelling");
  assert.equal(pmFrequency("Quarterly"), "Quarterly");
  assert.equal(pmFrequency("Half Yearly"), "Six monthly");
  assert.equal(pmFrequency("Yearly"), "Yearly");
  assert.equal(pmFrequency("Monthly Preventive maintenance "), "Monthly");
  assert.equal(pmFrequency("Quarterly Preventive maintenance"), "Quarterly");
  assert.equal(pmFrequency("Six monthly Preventive maintenance"), "Six monthly");
  assert.equal(pmFrequency("Yearly Preventive maintenance"), "Yearly");
  assert.equal(pmFrequency("Weekly"), null, "a frequency F/MNT/02 has no slot for is not guessed at");
  assert.equal(pmFrequency(""), null);
});

test("dates: F/MNT/02's ISO or d.m.yyyy; F/MNT/03's day.month in the schedule's year; a machine however its box writes it", () => {
  assert.equal(pmDate("2026-01-28"), "2026-01-28");
  assert.equal(pmDate("28.01.2026"), "2026-01-28");
  assert.equal(pmDate("28/1/26"), "2026-01-28");
  assert.equal(pmDate("28.01"), null, "F/MNT/02 prints no year to take one from");
  assert.equal(pmDate("2026-02-31"), null);
  assert.equal(planDate("10.01", 2026), "2026-01-10");
  assert.equal(planDate("31.02", 2026), null);
  assert.equal(planDate("—", 2026), null);
  assert.equal(pmSheetMachine("M-47"), "M-47");
  assert.equal(pmSheetMachine("m47"), "M-47");
  assert.equal(pmSheetMachine("47"), "M-47", "the box exists to hold the number");
  assert.equal(pmSheetMachine("Lombardi / Delta 330 / M-47"), "M-47");
  assert.equal(pmSheetMachine("Delta 330"), "");
  assert.equal(dueWords(-11), "due in 11 days");
  assert.equal(dueWords(0), "due today");
  assert.equal(dueWords(5), "5 days overdue");
});

// ---------------------------------------------------------------------------
// where a PM falls

test("28.01 lands under Jan, against the plan 10.01, eighteen days late", () => {
  const index = pmDoneIndex([pmSheet("a", "M-47", [{ slot: 0, date: "2026-01-28" }])]);
  const [a] = pmActuals([line("M-47", "LOMBARDI PRINTING MACHINE", "Monthly", { jan: "10.01", feb: "10.02" })], 2026, index);
  const l = linked(a);
  assert.equal(cells(l)[0], "28.01");
  assert.equal(l.months[0][0].plan, "2026-01-10");
  assert.equal(l.months[0][0].lateDays, 18);
  assert.deepEqual(cells(l).slice(1), Array(11).fill(""));
});

test("03.02 and 12.02 against plans 10.01 and 10.02: Jan shows 03.02 (late) and Feb 12.02 — January is not 'not done'", () => {
  const index = pmDoneIndex([pmSheet("a", "M-47", [{ slot: 0, date: "2026-02-03" }, { slot: 1, date: "2026-02-12" }])]);
  const l = linked(pmActuals([line("M-47", "LOMBARDI PRINTING MACHINE", "Monthly", { jan: "10.01", feb: "10.02" })], 2026, index)[0]);
  assert.equal(cells(l)[0], "03.02");
  assert.equal(cells(l)[1], "12.02");
  assert.equal(l.months[0][0].lateDays, 24);
});

test("an early PM lands in its plan's month; an unplanned PM in its own; two in one month show as '03.02 · 12.02'", () => {
  // Planned 25.03, done 05.03: more than a week early, still March's.
  let index = pmDoneIndex([pmSheet("a", "M-47", [{ slot: 2, date: "2026-03-05" }])]);
  let l = linked(pmActuals([line("M-47", "X", "Monthly", { mar: "25.03" })], 2026, index)[0]);
  assert.equal(cells(l)[2], "05.03");
  assert.equal(l.months[2][0].lateDays, -20);
  // No plan written at all: each PM in its own month.
  index = pmDoneIndex([pmSheet("a", "M-47", [{ slot: 0, date: "2026-04-03" }, { slot: 1, date: "2026-04-12" }])]);
  l = linked(pmActuals([line("M-47", "X", "Monthly")], 2026, index)[0]);
  assert.equal(cells(l)[3], "03.04 · 12.04");
  assert.equal(l.months[3][0].plan, null);
});

test("the frequency must match exactly: a Half Yearly line reads only the Six monthly slots", () => {
  const index = pmDoneIndex([pmSheet("a", "M-47", [{ slot: 0, date: "2026-06-08" }, { slot: 16, date: "2026-06-15" }, { slot: 12, date: "2026-03-20" }])]);
  const [monthly, half] = pmActuals([line("M-47", "X", "Monthly", { jun: "10.06" }), line("M-47", "X", "Half Yearly", { jun: "12.06" })], 2026, index);
  assert.equal(cells(linked(monthly))[5], "08.06");
  assert.equal(cells(linked(half))[5], "15.06");
  assert.deepEqual(cells(linked(half)).filter(Boolean), ["15.06"], "the quarterly slot's date is not on the half-yearly line");
});

test("the same date on two sheets counts once; another year is left out; a sheet not yet Verified is marked '*'", () => {
  const index = pmDoneIndex([
    pmSheet("a", "M-47", [{ slot: 0, date: "2026-01-12" }]),
    pmSheet("b", "M-47", [{ slot: 3, date: "2026-01-12" }, { slot: 4, date: "2025-12-10" }, { slot: 5, date: "2026-02-11" }], { status: "In Progress" }),
  ]);
  const l = linked(pmActuals([line("M-47", "X", "Monthly", { jan: "10.01", feb: "10.02" })], 2026, index)[0]);
  assert.equal(cells(l)[0], "12.01", "once, and from the Verified sheet");
  assert.equal(l.months[0][0].recordId, "a");
  assert.equal(cells(l)[1], "11.02*");
  assert.equal(l.months.flat().length, 2, "December 2025 belongs to last year's schedule");
});

test("M-07 printed on two blocks links neither, and says why; the other lines are unaffected", () => {
  const index = pmDoneIndex([pmSheet("a", "M-07", [{ slot: 0, date: "2026-01-12" }]), pmSheet("b", "M-06", [{ slot: 0, date: "2026-01-12" }])]);
  const rows = [
    line("M-07", "ZHEJIANG MANUAL INSPECTION MACHINE", "Monthly", { jan: "10.01" }),
    line("M-06", "SHRI TRIVEDI SLITTING MACHINE", "Monthly", { jan: "10.01" }),
    line("M-07", "DK 450 SLITTING MACHINE", "Monthly", { jan: "10.01" }),
    line("M-07", "DK 450 SLITTING MACHINE", "Half Yearly", { jun: "10.06" }),
  ];
  const out = pmActuals(rows, 2026, index, (m) => (m === "M-07" ? "the DK-450 Label Slitting Machine" : null));
  for (const i of [0, 2, 3]) {
    const a = out[i];
    assert.ok(!isLinkedLine(a), `line ${i + 1} (M-07) must not be linked`);
    assert.match(a.unlinked, /M-07 is printed on 2 blocks/);
    assert.match(a.unlinked, /"ZHEJIANG MANUAL INSPECTION MACHINE" and "DK 450 SLITTING MACHINE"/);
    assert.match(a.unlinked, /F\/MNT\/01 lists M-07 as the DK-450 Label Slitting Machine/);
  }
  assert.equal(cells(linked(out[1]))[0], "12.01");
  // pmDue says nothing about a line it cannot read.
  assert.deepEqual(
    pmDue(rows, 2026, index, "2026-09-29").map((d) => d.machine),
    []
  );
});

test("pmDue lists the plans no PM was counted against, with how far past each is", () => {
  const index = pmDoneIndex([pmSheet("a", "M-47", [{ slot: 0, date: "2026-01-12" }])]);
  const rows = [line("M-47", "LOMBARDI PRINTING MACHINE", "Monthly", { jan: "10.01", feb: "10.02", oct: "10.10" })];
  const due = pmDue(rows, 2026, index, "2026-09-29");
  assert.deepEqual(
    due.map((d) => [d.plan, d.daysPast]),
    [
      ["2026-02-10", 231],
      ["2026-10-10", -11],
    ]
  );
});

test("a corrected F/MNT/02 is followed, and a deleted one drops out", () => {
  const rows = [line("M-47", "X", "Monthly", { jan: "10.01" })];
  const before = pmSheet("a", "M-47", [{ slot: 0, date: "2026-01-12" }]);
  assert.equal(cells(linked(pmActuals(rows, 2026, pmDoneIndex([before]))[0]))[0], "12.01");
  const corrected = pmSheet("a", "M-47", [{ slot: 0, date: "2026-01-14" }], { updatedAt: "2026-02-01T00:00:00.000Z" });
  assert.equal(cells(linked(pmActuals(rows, 2026, pmDoneIndex([corrected]))[0]))[0], "14.01");
  assert.equal(cells(linked(pmActuals(rows, 2026, pmDoneIndex([]))[0]))[0], "");
});

// ---------------------------------------------------------------------------
// the sample year that ships with the app ("all dates are always fake")

const sampleSheets = SEED_MNT_SAMPLE_RECORDS.filter((r) => r.documentId === "mnt-pm-record");
const sampleSchedule = SEED_MNT_SAMPLE_RECORDS.find((r) => r.id === SAMPLE_SCHEDULE_ID)!;

test("the sample: every machine number on the 2026 schedule has one F/MNT/02 sheet (M-07 once), and M-68's supplied sheet is there too", () => {
  const scheduled = [...new Set(YEARLY_PM_2026_ROWS.map((r) => r.machineNo))];
  assert.equal(scheduled.length, 20);
  assert.deepEqual(SAMPLE_PM_MACHINES.map((m) => m.machine), scheduled);
  for (const machine of scheduled) {
    const sheets = sampleSheets.filter((r) => r.data.header.machineIdNo === machine);
    assert.equal(sheets.length, 1, `${machine} should have exactly one sheet`);
    assert.equal(sheets[0].id, samplePmSheetId(machine));
    assert.equal(sheets[0].status, "In Progress");
    assert.equal(sheets[0].dueDate, "2026-12-31");
    assert.equal(sheets[0].isDemo, false);
  }
  const m47 = sampleSheets.find((r) => r.data.header.machineIdNo === "M-47")!;
  assert.equal(m47.data.header.machineName, "Delta 330", "the name the Machine No. fetch gives: F/MNT/01's model");
  const m52 = sampleSheets.find((r) => r.data.header.machineIdNo === "M-52")!;
  assert.equal(m52.data.header.machineName, "", "F/MNT/01 writes '-' for M-52's model, and the fetch copies no placeholder");
  const m68 = sampleSheets.find((r) => r.data.header.machineIdNo === "M-68")!;
  assert.equal(m68.data.header.machineName, "DCM Sleeve Seaming Machine");
  assert.equal(m68.data.header.monthlyCheckPoints.split("\n").length, 5, "both boxes the paper heads 'Monthly Check points'");
  assert.match(m68.data.header.monthlyCheckPoints, /Lubrication – Oil & greasing/);
  assert.equal(m68.data.header.yearlyCheckPoints, "Wiring checking");
  assert.ok(m68.data.rows.every((r) => !r.date), "the paper dates no PM");
  assert.equal(sampleSheets.length, 21);
  for (const r of SEED_MNT_SAMPLE_RECORDS) {
    assert.ok(r.id.startsWith("seed-sample-mnt-pm-"), r.id);
    assert.ok(r.history && r.history.length > 0, `${r.id} says in its history what it is`);
    if (r.id !== samplePmSheetId("M-68")) assert.equal(r.history![0].note, SAMPLE_PM_NOTE);
  }
});

test("the sample: no date is a Thursday, a festival holiday or after 29-Sep-2026 — and nothing is random", () => {
  const holidays = new Set(SEED_MASTER_DATA.holidays.map((h) => h.date));
  const dates = sampleSheets.flatMap((r) => r.data.rows.map((row) => String(row.date ?? ""))).filter(Boolean);
  assert.ok(dates.length > 150, `a year of PMs: ${dates.length}`);
  for (const d of dates) {
    assert.match(d, /^2026-\d{2}-\d{2}$/);
    assert.notEqual(new Date(`${d}T00:00:00Z`).getUTCDay(), 4, `${d} is a Thursday`);
    assert.ok(!holidays.has(d), `${d} is a festival holiday`);
    assert.ok(d <= SAMPLE_UP_TO, `${d} is after ${SAMPLE_UP_TO}`);
  }
  const plans = sampleSchedule.data.rows.flatMap((row) => Object.entries(row).filter(([k, v]) => k.endsWith("Plan") && v).map(([, v]) => planDate(v, 2026)!));
  assert.equal(plans.length, 21 * 12 + 5 * 4 + 15 * 2 + 1, "every Plan the 42 lines need");
  for (const p of plans) {
    assert.notEqual(new Date(`${p}T00:00:00Z`).getUTCDay(), 4, `the plan ${p} is a Thursday`);
    assert.ok(!holidays.has(p), `the plan ${p} is a festival holiday`);
  }
  const source = readFileSync(path.join(process.env.DCRS_REPO_ROOT ?? process.cwd(), "frontend", "src", "data", "seed", "maintenanceSampleRecords.ts"), "utf8");
  assert.ok(!/Math\.random\(|Date\.now\(|new Date\(\)/.test(source), "the sample is the same on every installation");
});

test("the sample schedule: Rev 01, Verified by Mukesh Patel on 15.07.2026, every Plan written, no Actual stored", () => {
  assert.equal(sampleSchedule.status, "Verified");
  assert.equal(sampleSchedule.verifiedBy, "Mukesh Patel");
  assert.equal(sampleSchedule.verifiedAt?.slice(0, 10), "2026-07-15");
  assert.equal(sampleSchedule.formatRevision, undefined, "on the current revision, Rev 01");
  assert.equal(sampleSchedule.data.rows.length, 42);
  const planCount: Record<string, number> = { Monthly: 12, Quarterly: 4, "Half Yearly": 2, Yearly: 1 };
  for (const row of sampleSchedule.data.rows) {
    const plans = Object.keys(row).filter((k) => k.endsWith("Plan") && row[k]);
    assert.equal(plans.length, planCount[String(row.frequency)], `${row.machineNo} ${row.frequency}`);
    assert.ok(Object.keys(row).filter((k) => k.endsWith("Actual")).every((k) => row[k] === ""), "no Actual is stored");
  }
});

test("the sample: the schedule's Actuals worked out from the F/MNT/02 sheets fill Jan–Aug, with two missed and four late", () => {
  const index = pmDoneIndex(sampleSheets);
  const actuals = pmActuals(sampleSchedule.data.rows, 2026, index);
  const monthly = actuals.filter((a, i) => isLinkedLine(a) && sampleSchedule.data.rows[i].frequency === "Monthly") as PmLinkedLine[];
  assert.equal(monthly.length, 19, "twenty machines on twenty-one blocks, less the two M-07 lines, which are not linked");
  for (let m = 0; m <= 7; m++) assert.ok(actuals.some((a) => isLinkedLine(a) && a.months[m].length > 0), `month ${m + 1} has Actuals`);
  // Every Monthly line has one PM under each month to September, bar the two missed.
  const missed: string[] = [];
  const late: string[] = [];
  for (const line of monthly) {
    for (let m = 0; m <= 8; m++) {
      if (line.months[m].length === 0) missed.push(`${line.machine}|${m}`);
      else {
        assert.equal(line.months[m].length, 1, `${line.machine} month ${m + 1}`);
        assert.equal(line.months[m][0].plan, line.plans[m], `${line.machine} month ${m + 1} is counted against its own plan`);
        if ((line.months[m][0].lateDays ?? 0) > 7) late.push(`${line.machine}|${m}`);
      }
    }
    assert.ok(line.months.slice(9).every((c) => c.length === 0), "nothing after September");
  }
  assert.deepEqual(missed.sort(), ["M-12|4", "M-44|6"]);
  assert.deepEqual(late.sort(), ["M-03|1", "M-09|5", "M-36|7", "M-47|2"]);
  // The M-07 lines are not linked, and say why.
  const m07 = actuals.filter((a, i) => sampleSchedule.data.rows[i].machineNo === "M-07");
  assert.equal(m07.length, 3);
  assert.ok(m07.every((a) => !isLinkedLine(a)));
  // Quarterly in Mar/Jun/Sep, Half Yearly in Jun, Yearly none yet.
  for (const [i, a] of actuals.entries()) {
    if (!isLinkedLine(a)) continue;
    const f = sampleSchedule.data.rows[i].frequency;
    const months = a.months.map((c, m) => (c.length ? m : -1)).filter((m) => m >= 0);
    if (f === "Quarterly") assert.deepEqual(months, [2, 5, 8], `${a.machine} quarterly`);
    if (f === "Half Yearly") assert.deepEqual(months, [5], `${a.machine} half yearly`);
    if (f === "Yearly") assert.deepEqual(months, [], `${a.machine} yearly`);
  }
});

// ---------------------------------------------------------------------------
// what reads the Actuals: M6, M8, Mitra — and what never writes them

const TODAY = "2026-09-24";

/** A Rev 01 schedule (or, with formatRevision "00", a Rev 00 one) for 2026, Verified. */
function schedule2026(id: string, rows: LogSheetRow[], extra: Partial<RecordInstance<LogSheetData>> = {}): RecordInstance<LogSheetData> {
  return {
    id,
    documentId: "mnt-yearly-pm-schedule",
    periodKey: `mnt-yearly-pm-schedule:2026-01-01:${id}`,
    dueDate: "2026-01-02",
    status: "Verified",
    isDemo: false,
    data: { header: {}, rows: rows.map((r, i) => ({ ...r, id: `r${i}` })) },
    createdAt: "2026-01-02T03:00:00.000Z",
    updatedAt: "2026-01-02T06:00:00.000Z",
    ...extra,
  };
}
const insightsOf = (records: RecordInstance[], today = TODAY) => computeInsights({ records, documents: documentRepository.getAll(), today, isDemo: false });

test("M6 on Rev 01: an F/MNT/02 date of 20.08 against a plan of 10.08 is done late, and opens the machine's F/MNT/02; a plan with no F/MNT/02 date is not done; a stored Actual is not a PM", () => {
  const sheet47 = pmSheet("unit-pm-47", "M-47", [{ slot: 7, date: "2026-08-20" }]);
  const sched = schedule2026("unit-sched-01", [
    line("M-47", "LOMBARDI PRINTING MACHINE", "Monthly", { aug: "10.08" }),
    { ...line("M-06", "SHRI TRIVEDI SLITTING MACHINE", "Monthly", { aug: "12.08" }), augActual: "13.08" },
  ]);
  const m6 = insightsOf([sched, sheet47]).filter((i) => i.rule === "M6");
  const late = m6.find((i) => i.title.startsWith("M-47"));
  assert.ok(late, m6.map((i) => i.title).join("\n"));
  assert.equal(late.severity, "medium");
  assert.match(late.detail, /planned 10\.08, done 20\.08 \(10 days late\)/);
  assert.match(late.detail, /record it on M-47's F\/MNT\/02 — the schedule's Actual follows/);
  assert.ok(late.evidence.some((e) => e.recordId === "unit-pm-47" && e.field === "date"), "it cites the F/MNT/02 date");
  assert.ok(late.evidence.some((e) => e.recordId === "unit-sched-01" && e.field === "augPlan"), "and the plan");
  assert.equal(late.route, "/record/unit-pm-47");
  const missed = m6.find((i) => i.title.startsWith("M-06"));
  assert.ok(missed, "the typed 13.08 is not read: M-06 has no F/MNT/02 date");
  assert.equal(missed.severity, "high");
  assert.match(missed.detail, /planned 12\.08, not done \(43 days past the plan\)/);
});

test("M6 on a schedule kept on Rev 00 still reads its typed Actuals", () => {
  const sched = schedule2026("unit-sched-00", [{ id: "x", equipment: "PRINTING MACHINE", frequency: "Monthaly", augPlan: "10.08", augActual: "20.08" }], { formatRevision: "00" });
  const m6 = insightsOf([sched]).filter((i) => i.rule === "M6");
  assert.equal(m6.length, 1);
  assert.match(m6[0].detail, /planned 10\.08, done 20\.08 \(10 days late\)/);
  assert.match(m6[0].detail, /write the Actual on this schedule/);
});

test("M8: M-07 printed on two blocks is said, and M6 says nothing of lines it cannot read", () => {
  const sched = schedule2026("unit-sched-07", [
    line("M-07", "ZHEJIANG MANUAL INSPECTION MACHINE", "Monthly", { jan: "10.01" }),
    line("M-07", "DK 450 SLITTING MACHINE", "Monthly", { jan: "10.01" }),
  ]);
  const found = insightsOf([sched]);
  const m8 = found.find((i) => i.rule === "M8" && i.id.startsWith("m8|duplicate|"));
  assert.ok(m8, found.map((i) => `${i.rule} ${i.title}`).join("\n"));
  assert.equal(m8.severity, "medium");
  assert.match(m8.title, /M-07 is printed on 2 blocks/);
  assert.equal(found.filter((i) => i.rule === "M6").length, 0);
});

test("no write: drawing the schedule's Actuals changes nothing on F/MNT/03, and withComputedCells passes it through untouched", () => {
  const stored = recordRepository.getById(SAMPLE_SCHEDULE_ID) as RecordInstance<LogSheetData>;
  assert.ok(stored, "the sample schedule is seeded");
  const before = JSON.stringify(stored);
  assert.equal(withComputedCells("mnt-yearly-pm-schedule", stored.data), stored.data);
  const lines = pmActuals(stored.data.rows, 2026, currentPmIndex(false));
  assert.ok(lines.some((l) => isLinkedLine(l) && l.months[0].length > 0), "January's Actuals are read");
  pmDue(stored.data.rows, 2026, currentPmIndex(false), "2026-09-29");
  assert.equal(JSON.stringify(recordRepository.getById(SAMPLE_SCHEDULE_ID)), before);
});

test("the index is built once per change to the F/MNT/02 records, keeps Demo and Live apart, and leaves out a sheet nobody wrote", () => {
  const first = currentPmIndex(false);
  assert.equal(currentPmIndex(false), first, "the same index while nothing changed");
  const demo = currentPmIndex(true);
  assert.notEqual(demo, first);
  assert.equal([...demo.values()].flat().length, 0, "the Live sample is not on the Demo side");
  // A sheet the assistant prepared, and nobody touched: not a PM record.
  const prepared = pmSheet("unit-pm-prepared", "M-85", [{ slot: 0, date: "2026-09-01" }], {
    status: "In Progress",
    prepared: { at: "2026-09-01T00:00:00.000Z", by: "assistant", notes: [], basedOn: "the specimen" },
    history: [{ id: "h1", at: "2026-09-01T00:00:00.000Z", by: "Assistant", action: "prepared" }],
  });
  recordRepository.upsert(prepared);
  const second = currentPmIndex(false);
  assert.notEqual(second, first, "rebuilt after the F/MNT/02 change");
  assert.equal(second.get("M-85|Monthly"), undefined, "an untouched prepared sheet says nothing about a machine");
  // A person writes on it: now it counts.
  const stamped = recordRepository.getById("unit-pm-prepared")!;
  recordRepository.upsert({ ...stamped, history: [...(stamped.history ?? []), { id: "h2", at: "2026-09-02T00:00:00.000Z", by: "Rahul Patel", action: "edited" }] });
  assert.equal(currentPmIndex(false).get("M-85|Monthly")?.[0]?.dateISO, "2026-09-01");
  recordRepository.remove("unit-pm-prepared");
  assert.equal(currentPmIndex(false).get("M-85|Monthly"), undefined, "a deleted F/MNT/02 drops out");
});

test("the start-up migration pins a schedule written on Rev 00 to Rev 00, keeps its typed Actuals, and leaves Rev 01 alone — once", () => {
  const old = schedule2026("unit-sched-old", [{ id: "x", equipment: "PRINTING MACHINE", frequency: "Monthaly", janPlan: "10.01", janActual: "28.01" }], { formatRevision: undefined });
  const blank = schedule2026("unit-sched-blank", []);
  recordRepository.upsertMany([old, blank]);
  assert.equal(pinSchedulesWrittenOnRev00(), 1);
  const pinned = recordRepository.getById("unit-sched-old")!;
  assert.equal(pinned.formatRevision, "00");
  assert.equal((pinned.data as LogSheetData).rows[0].janActual, "28.01", "its typed Actual stays as written");
  assert.equal(pinned.updatedAt, old.updatedAt);
  assert.equal(pinned.history?.at(-1)?.by, "System");
  assert.equal(pinned.history?.at(-1)?.note, REV00_PIN_NOTE);
  assert.equal(recordRepository.getById(SAMPLE_SCHEDULE_ID)?.formatRevision, undefined, "the Rev 01 sample is not pinned");
  assert.equal(recordRepository.getById("unit-sched-blank")?.formatRevision, undefined, "a schedule with no lines has nothing to keep");
  assert.equal(pinSchedulesWrittenOnRev00(), 0, "idempotent");
  recordRepository.removeIds(["unit-sched-old", "unit-sched-blank"]);
});

test("Mitra: get_record shows the linked Actuals as _linked (never stored), and edit_open_record refuses an Actual, pointing to F/MNT/02", async () => {
  const ctx = {
    today: "2026-09-29",
    isDemo: false,
    language: "en",
    userName: "Unit Test",
    currentRoute: "/dashboard",
    navigate: () => {},
    target: null,
    bump: () => {},
    attachments: [],
    confirm: async () => true,
    userWords: "unit test",
  } as unknown as MitraToolContext;
  const getRecord = mitraTools(ctx).find((t) => t.name === "get_record")!;
  const read = await runTool(getRecord, JSON.stringify({ recordId: SAMPLE_SCHEDULE_ID }), ctx);
  assert.ok(read.ok, JSON.stringify(read.result));
  const data = (read.result as { data: { _linked?: { note: string; actuals: string[]; notLinked?: string[] } } }).data;
  assert.ok(data._linked, "the Actuals are shown beside the data");
  assert.match(data._linked.note, /read from each machine's F\/MNT\/02/);
  assert.ok(data._linked.actuals.length > 0 && /^row \d+ M-\d\d /.test(data._linked.actuals[0]), data._linked.actuals[0]);
  assert.match(data._linked.actuals[0], /seed-sample-mnt-pm-M-\d\d-2026 by Rahul Patel/);
  assert.ok(!("_linked" in (recordRepository.getById(SAMPLE_SCHEDULE_ID)!.data as object)), "never stored");

  // The patch path: a linked Actual is refused and nothing is written; a Plan is written.
  const stored = recordRepository.getById(SAMPLE_SCHEDULE_ID)! as RecordInstance<LogSheetData>;
  const m47 = stored.data.rows.findIndex((r) => r.machineNo === "M-47" && r.frequency === "Monthly");
  const out = applyAssistantPatch(
    "log-sheet",
    "mnt-yearly-pm-schedule",
    { ...stored.data, _linked: { note: "x" } },
    { _linked: { note: "x" }, itemEdits: [{ collection: "rows", match: { row: m47 + 1 }, set: { octActual: "12.10", octPlan: "14.10" } }] },
    stored
  );
  assert.equal(out.problems.length, 1, out.problems.join("\n"));
  assert.match(out.problems[0], /read from M-47's F\/MNT\/02 \(Preventive Maintenance Schedule & Record\)/);
  const row = (out.data as LogSheetData).rows[m47];
  assert.equal(row.octActual, "", "the Actual was not written");
  assert.equal(row.octPlan, "14.10", "the Plan, which is typed, was");

  // And through the tool, on the open record.
  let committed: unknown = null;
  const target = {
    documentKind: "log-sheet",
    documentId: "mnt-yearly-pm-schedule",
    recordId: SAMPLE_SCHEDULE_ID,
    status: "In Progress",
    editable: true,
    currentData: stored.data,
    getData: () => stored.data,
    commit: (next: unknown) => {
      committed = next;
    },
    title: "F/MNT/03 2026",
  };
  const openCtx = { ...ctx, target, currentRoute: `/record/${SAMPLE_SCHEDULE_ID}` } as unknown as MitraToolContext;
  const edit = mitraTools(openCtx).find((t) => t.name === "edit_open_record")!;
  const edited = await runTool(edit, JSON.stringify({ patch: { itemEdits: [{ collection: "rows", match: { row: m47 + 1 }, set: { janActual: "03.01" } }] } }), openCtx);
  assert.match(JSON.stringify(edited.result), /read from M-47's F\/MNT\/02/);
  assert.ok(committed === null || ((committed as LogSheetData).rows[m47].janActual ?? "") === "", "no Actual reaches the record");
});

test("the pages: F/MNT/03's Actuals are links to the F/MNT/02 they are read from, M-07 says why it is not linked, and F/MNT/02 shows its next plan", async () => {
  const [auth, store, router, assistant, recordPage] = await Promise.all([
    import("../src/store/AuthContext"),
    import("../src/store/AppStore"),
    import("../src/store/router"),
    import("../src/store/AssistantContext"),
    import("../src/pages/RecordPage"),
  ]);
  const render = (el: ReactElement): string =>
    renderToStaticMarkup(h(auth.AuthProvider, null, h(store.AppStoreProvider, null, h(router.RouterProvider, null, h(assistant.AssistantProvider, null, el)))));
  const html = render(h(recordPage.RecordPage, { recordId: SAMPLE_SCHEDULE_ID }));
  assert.match(html, /data-section="pm-link-notice"/);
  assert.match(html, /data-state="pm-unlinked" data-machine="M-07"[^>]*>.*?M-07 is printed on 2 blocks/s);
  assert.match(html, /<a href="#\/record\/seed-sample-mnt-pm-M-47-2026" data-linked-record="seed-sample-mnt-pm-M-47-2026" title="Done \d\d\.01\.2026 by Rahul Patel, supervised by Mukesh Patel — F\/MNT\/02, M-47 \(In Progress — not yet Verified\)/);
  assert.match(html, /data-section="pm-actuals-note"/);
  assert.ok(!/data-computed="\w+Actual"[^>]*>\s*<(?:input|select|textarea)/.test(html), "no Actual is a box");
  const links = html.match(/data-linked-record="/g)?.length ?? 0;
  assert.ok(links > 100, `${links} linked Actuals drawn`);

  const year = Number(todayISO().slice(0, 4));
  const sheet = render(h(recordPage.RecordPage, { recordId: samplePmSheetId("M-47") }));
  assert.match(sheet, /data-section="pm-plan-line" data-machine="M-47"/);
  if (year === 2026) {
    assert.match(sheet, /On <a href="#\/record\/seed-sample-mnt-pm-schedule-2026" data-action="open-pm-schedule">the 2026 schedule \(F\/MNT\/03\)<\/a>: Monthly planned \d\d\.\d\d — /);
    const m68 = render(h(recordPage.RecordPage, { recordId: samplePmSheetId("M-68") }));
    assert.match(m68, /M-68 is not on the 2026 schedule \(F\/MNT\/03\)\./);
  }
});
