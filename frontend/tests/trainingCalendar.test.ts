// THE TRAINING PLAN CALENDAR PLANS THE YEAR, AND THE SYSTEM KEEPS TO ITS DATES (F/HR/09, REQUIREMENTS §164; the owner,
// 2-Nov-2026: "from March 2027 it should plan for next March 2028 ... the system will plan the date for various trainings
// ... and it will remind the responsible person that this day this training is coming, so do it and write the actual date").
//
// What is proved here:
//   * the calendar's year: a sheet due 31-03-2028 covers 01.04.2027 ~ 31.03.2028; its months April to March;
//   * a date as a person wrote it: the paper's 7/22/2026 and 2/4/2027 (month first), the app's 22-07-2027, ISO, a bare day;
//   * the trainings the 2026-27 calendar on file plans: held where the date has passed, planned on the pre-written date
//     where it has not, on the month's last working day where no date is written;
//   * next year's plan from this year's: every topic, every planned month on the same day of the month, moved past the
//     Thursday off, the 15th where no date was written, the Actual cells empty;
//   * the schedule: due 31 March, one sheet for the twelve months from April - the 2026-27 sheet on file counts as its
//     year's, the 2027-28 sheet is made when April 2027 is generated (a month ahead by the near-term generator), and
//     F/HR/16 keeps its 31 December;
//   * the morning prepare writes the plan and the period into the new sheet, noting where it came from;
//   * the notifications: each planned training told of from three days ahead to the people who answer for the calendar,
//     high and counted in days once its day has passed, none once held, none from before the go-live.
// Run: npm run test:unit -- trainingCalendar
import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition, LogSheetData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { settingsRepository } from "../src/data/repositories/settingsRepository";
import { CALENDAR_TOPICS, calendarRow } from "../src/data/seed/hrLayouts";
import { SEED_HR_TRAINING_CALENDAR } from "../src/data/seed/hrRecords";
import { ensureRecordsGeneratedForMonth, fillsThroughYear, filingStart, filingYear, periodKeyFor } from "../src/engine/recordGenerator";
import { prepareKnownParts } from "../src/engine/knownParts";
import { createDefaultData } from "../src/engine/recordDefaults";
import { planNotifications, type PlanDocument, type PlanPerson, type PlanRecord } from "../src/engine/notificationPlan";
import { plantClosedDays } from "../src/engine/latenessCore";
import {
  CALENDAR_MONTH_NAMES,
  calendarMonth,
  calendarPeriod,
  calendarStartYear,
  displayDay,
  lastWorkingDay,
  nextYearPlan,
  plannedTrainings,
  TRAINING_CALENDAR_ID,
  writtenDate,
} from "../src/engine/trainingCalendar";

ensureDocumentsSeeded();
ensureMasterSeeded();
settingsRepository.update({ liveStartDate: "2026-09-01" });

// The plant's calendar in these tests: Thursday off, no festival.
const closed = plantClosedDays({ weeklyOffDay: 4, holidays: [], adjustmentDays: [] });
const master = masterRepository.get();
const doc = (id: string): DocumentDefinition => documentRepository.getByIdUnscoped(id)!;
const live = (id: string): RecordInstance[] => recordRepository.queryUnscoped({ documentId: id, isDemo: false });
const rows2026 = () => CALENDAR_TOPICS.map((t, i) => ({ id: `hrk-${i}`, ...calendarRow(t) }));

test("the calendar's year: due 31 March, from the April before; its months April to March", () => {
  assert.equal(calendarStartYear("2028-03-31"), 2027);
  assert.equal(calendarStartYear("2026-04-01"), 2026, "the 2026-27 calendar on file, filed on its first day");
  assert.equal(calendarPeriod("2028-03-31"), "01-04-2027 ~ 31-03-2028");
  assert.equal(calendarPeriod("2027-03-31"), "01-04-2026 ~ 31-03-2027");
  assert.deepEqual(CALENDAR_MONTH_NAMES.slice(0, 2), ["Apr", "May"]);
  assert.deepEqual(calendarMonth(2027, 0), { year: 2027, month: 4 });
  assert.deepEqual(calendarMonth(2027, 9), { year: 2028, month: 1 }, "January is the tenth month");
  assert.deepEqual(calendarMonth(2027, 11), { year: 2028, month: 3 });
  assert.equal(displayDay("2027-07-23"), "23-07-2027");
  assert.equal(lastWorkingDay(2026, 8, closed), "2026-08-31", "Monday 31-08-2026");
  assert.equal(lastWorkingDay(2026, 12, closed), "2026-12-30", "31-12-2026 is a Thursday");
});

test("a date as a person wrote it under a month: the paper's month-first slashes, the app's day-first dashes, ISO, a bare day", () => {
  assert.equal(writtenDate("7/22/2026", 2026, 7), "2026-07-22");
  assert.equal(writtenDate("2/4/2027", 2027, 2), "2027-02-04", "under February: the 4th");
  assert.equal(writtenDate("2/4/2027", 2027, 4), "2027-04-02", "under April: the 2nd");
  assert.equal(writtenDate("13/1/2027", 2027, 1), "2027-01-13", "13 can only be the day");
  assert.equal(writtenDate("22-07-2027", 2027, 7), "2027-07-22");
  assert.equal(writtenDate("04-11-2026", 2027, 4), "2026-11-04", "dashes are day first even under April: a date typed for another month is honoured as written");
  assert.equal(writtenDate("11-04-2027", 2027, 4), "2027-04-11");
  assert.equal(writtenDate("04-13-2027", 2027, 4), "2027-04-13", "13 can only be the day");
  assert.equal(writtenDate("22.07.2027", 2027, 7), "2027-07-22");
  assert.equal(writtenDate("2027-07-22", 2027, 7), "2027-07-22");
  assert.equal(writtenDate("22", 2027, 7), "2027-07-22");
  assert.equal(writtenDate("Yes", 2027, 7), null);
  assert.equal(writtenDate("Done", 2027, 7), null);
  assert.equal(writtenDate("", 2027, 7), null);
  assert.equal(writtenDate("31/2/2027", 2027, 2), null, "no 31 February");
});

test("the trainings the 2026-27 calendar plans: held when its date has passed, planned on the pre-written date, the month's last working day with no date", () => {
  const today = "2026-11-02";
  const all = plannedTrainings(rows2026(), "2026-04-01", today, closed);
  const brcgs = all.filter((t) => t.topic.startsWith("BRCGS"));
  assert.equal(brcgs.length, 2, "July and February");
  assert.deepEqual(brcgs.map((t) => [t.date, t.held, t.key]), [["2026-07-22", true, "hrk-0|3"], ["2027-02-04", false, "hrk-0|10"]]);
  assert.equal(brcgs[0].by, "External (Shashank Sheth)");
  const ccp = all.filter((t) => t.topic === "CCP monitoring");
  assert.deepEqual(ccp.map((t) => [t.monthIndex, t.date, t.held]), [[1, "2026-05-25", true], [4, "2026-08-31", false], [7, "2026-11-30", false], [9, "2027-01-10", false]], "August: planned, no date written - its last working day");
  assert.equal(all.length, CALENDAR_TOPICS.reduce((n, t) => n + Object.keys(t.plan).length, 0), "one per topic and planned month");
  assert.ok(all.every((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.date)));
  // DCRS's own planned date in the Plan cell is the training's day; the actual date written makes it held.
  const planned = plannedTrainings([{ id: "r1", parameter: "GMP Principles", source: "Kapila Barad(PSTL)", m0Plan: "09-04-2027", m0Actual: "" }], "2028-03-31", "2027-04-01", closed);
  assert.deepEqual(planned.map((t) => [t.date, t.held]), [["2027-04-09", false]]);
  const held = plannedTrainings([{ id: "r1", parameter: "GMP Principles", m0Plan: "09-04-2027", m0Actual: "10-04-2027" }], "2028-03-31", "2027-04-12", closed);
  assert.deepEqual(held.map((t) => [t.date, t.held]), [["2027-04-09", true]]);
  const words = plannedTrainings([{ id: "r1", parameter: "GMP Principles", m0Plan: "Yes", m0Actual: "Done" }], "2028-03-31", "2027-04-12", closed);
  assert.equal(words[0].held, true, "words that are no date under Actual still say it was held");
});

test("next year's plan from this year's: every topic, each planned month on the same day of the month, past the Thursday off; the 15th with no date; Actual empty", () => {
  const next = nextYearPlan(rows2026(), "2028-03-31", closed);
  assert.equal(next.length, 19);
  const r0 = next[0];
  assert.equal(r0.parameter, "BRCGS - Packaging (Issue 07)Awareness");
  assert.equal(r0.source, "External (Shashank Sheth)");
  assert.equal(r0.duration, "16 hours");
  assert.equal(r0.m3Plan, "23-07-2027", "22-07-2027 is a Thursday: the day after");
  assert.equal(r0.m10Plan, "04-02-2028", "Friday 4-02-2028");
  assert.equal(r0.m3Actual, "");
  assert.equal(r0.m10Actual, "");
  assert.equal(r0.m0Plan, "", "April was not planned");
  const ccp = next[8];
  assert.equal(ccp.parameter, "CCP monitoring");
  assert.equal(ccp.m4Plan, "15-08-2027", "no date was written for August: the 15th (a Sunday, a working day)");
  assert.equal(ccp.m7Plan, "30-11-2027", "held 11/30/2026: Tuesday 30-11-2027");
  const gmp = next[4];
  assert.deepEqual([gmp.m0Plan, gmp.m5Plan, gmp.m10Plan], ["09-04-2027", "19-09-2027", "05-02-2028"], "Friday 9-04-2027; Sunday 19-09-2027 (a working day); Saturday 5-02-2028");
});

test("the schedule: F/HR/09 due 31 March, year-long and made a month ahead; F/HR/16 still 31 December", () => {
  const cal = doc(TRAINING_CALENDAR_ID);
  assert.deepEqual(cal.schedule, { type: "yearly", month: 2, dayOfMonth: 31 });
  assert.equal(cal.frequency, "Yearly");
  assert.equal(fillsThroughYear(cal), true);
  assert.equal(cal.madeAheadDays, 31);
  assert.deepEqual(filingYear(cal, 2027, 3), { year: 2028, month: 2 }, "April 2027 writes on the sheet due March 2028");
  assert.deepEqual(filingYear(cal, 2028, 1), { year: 2028, month: 2 }, "February 2028 too");
  assert.deepEqual(filingYear(cal, 2028, 3), { year: 2029, month: 2 });
  assert.equal(filingStart("2028-03-31"), "2027-04-01");
  const cleaning = doc("hr-monthly-cleaning");
  assert.equal(fillsThroughYear(cleaning), true);
  assert.deepEqual(filingYear(cleaning, 2027, 5), { year: 2027, month: 11 });
  assert.equal(filingStart("2027-12-31"), "2027-01-01");
});

test("the generator: the 2026-27 calendar on file is its year's sheet; April 2027 makes the 2027-28 sheet, once; the morning prepare plans it", () => {
  const cal = doc(TRAINING_CALENDAR_ID);
  live(cal.id).forEach((r) => recordRepository.remove(r.id));
  recordRepository.upsert({ ...SEED_HR_TRAINING_CALENDAR, isDemo: false } as RecordInstance);
  assert.equal(live(cal.id).length, 1);
  // Any month of 2026-27 generated: the sheet filed on 1-04-2026 stands, no second one for 31-03-2027.
  for (const [y, m] of [[2026, 10], [2027, 0], [2027, 2]] as const) {
    assert.equal(ensureRecordsGeneratedForMonth(y, m, { documentIds: [cal.id] }).length, 0, `${y}-${m + 1}`);
  }
  assert.equal(live(cal.id).length, 1);
  // April 2027 (the month the near-term generator reaches 31 days ahead, in March): the 2027-28 sheet, due 31-03-2028.
  const made = ensureRecordsGeneratedForMonth(2027, 3, { documentIds: [cal.id] });
  assert.equal(made.length, 1);
  const sheet = made[0];
  assert.equal(sheet.dueDate, "2028-03-31");
  assert.equal(sheet.periodKey, periodKeyFor(cal, "2028-03-31"));
  assert.equal(sheet.status, "Due");
  assert.equal((sheet.data as LogSheetData).header.period, "01-04-2027 ~ 31-03-2028", "the blank sheet's period is its own");
  assert.equal(ensureRecordsGeneratedForMonth(2027, 8, { documentIds: [cal.id] }).length, 0, "September 2027 writes on the same sheet");
  assert.equal(ensureRecordsGeneratedForMonth(2028, 1, { documentIds: [cal.id] }).length, 0, "February 2028 too");
  assert.equal(live(cal.id).length, 2);
  assert.equal((createDefaultData(cal, "2029-03-31", master) as LogSheetData).header.period, "01-04-2028 ~ 31-03-2029");

  // The morning prepare: the known parts of the new sheet are the coming year's plan, from the calendar on file.
  const result = prepareKnownParts(cal, "2028-03-31", master, SEED_HR_TRAINING_CALENDAR as RecordInstance);
  assert.ok(result);
  const data = result.data as LogSheetData;
  assert.equal(data.header.period, "01-04-2027 ~ 31-03-2028");
  assert.equal(data.rows.length, 19);
  assert.equal(data.rows[0].parameter, "BRCGS - Packaging (Issue 07)Awareness");
  assert.equal(data.rows[0].m3Plan, "23-07-2027");
  assert.equal(data.rows[0].m3Actual, "");
  assert.equal(data.rows[0].m10Plan, "04-02-2028");
  assert.ok(data.rows.every((r) => typeof r.id === "string" && r.id));
  assert.match(result.basedOn, /training plan calendar of 01\.04\.2026 ~ 31\.03\.2027/);
  assert.ok(result.notes.some((n) => n.startsWith("Planned as the calendar of 01.04.2026 ~ 31.03.2027 was: its 19 topics")), result.notes.join(" | "));
  live(cal.id).forEach((r) => recordRepository.remove(r.id));
});

test("the notifications: each planned training told of from three days ahead to those who answer for the calendar, counted in days late after its day, never once held or from before the go-live", () => {
  const calendar: PlanDocument = { id: TRAINING_CALENDAR_ID, formatNo: "F/HR/09", name: "Training Plan Calender", module: "HR", schedule: { type: "yearly" } };
  const hr: PlanPerson = { id: "u-hr", name: "Sandeep Parekh", boss: false, answersFor: new Set([TRAINING_CALENDAR_ID]), mayVerify: () => true };
  const qc: PlanPerson = { id: "u-qc", name: "Kapila Barad", boss: false, answersFor: new Set(["qc-x"]), mayVerify: () => false };
  const boss: PlanPerson = { id: "u-boss", name: "Super Admin", boss: true, answersFor: new Set(), mayVerify: () => true };
  const record: PlanRecord = {
    id: "hr-training-calendar-2026-27",
    documentId: TRAINING_CALENDAR_ID,
    dueDate: "2026-04-01",
    status: "Verified",
    stored: true,
    prepared: false,
    problems: 0,
    trainings: [
      { key: "hrk-8|4", topic: "CCP monitoring", by: "Ajay Vaghela (Flexo Manager)", date: "2026-08-31", held: false },
      { key: "hrk-8|7", topic: "CCP monitoring", by: "Ajay Vaghela (Flexo Manager)", date: "2026-11-30", held: false },
      { key: "hrk-4|5", topic: "GMP Principles", by: "Kapila Barad(PSTL)", date: "2026-09-19", held: true },
      { key: "hrk-5|5", topic: "Housekeeping", by: "Kapila Barad(PSTL & In charge - Housekeeping)", date: "2026-09-19", held: false },
      { key: "hrk-0|10", topic: "BRCGS - Packaging (Issue 07)Awareness", by: "External (Shashank Sheth)", date: "2027-02-04", held: false },
    ],
  };
  const plan = (today: string, countedFrom = "2026-09-01") =>
    planNotifications({ today, time: "09:00", documents: [calendar], records: [record], people: [hr, qc, boss], isClosedDay: closed, countedFrom }).filter((i) => i.kind === "training");
  // 2-11-2026: the housekeeping training of 19-09-2026 is 44 days late; August's is from before the go-live; November's and February's are too far ahead.
  const nov2 = plan("2026-11-02");
  assert.deepEqual(nov2.map((i) => [i.userId, i.key, i.priority, i.data.daysLate, i.data.subject, i.data.dueDate]), [["u-hr", "training|hr-training-calendar-2026-27|hrk-5|5", "high", 44, "Housekeeping", "2026-09-19"]]);
  assert.equal(nov2[0].data.by, "Kapila Barad(PSTL & In charge - Housekeeping)");
  assert.equal(nov2[0].data.formatNo, "F/HR/09");
  assert.equal(nov2[0].data.recordId, "hr-training-calendar-2026-27");
  // 27-11-2026: three days ahead of 30-11-2026, the heads-up starts, low; on the day, medium; the day after, high and one day late.
  assert.deepEqual(plan("2026-11-26").map((i) => i.data.dueDate), ["2026-09-19"]);
  assert.deepEqual(plan("2026-11-27").map((i) => [i.data.dueDate, i.priority, i.data.daysLate]), [["2026-09-19", "high", 69], ["2026-11-30", "low", 0]]);
  assert.deepEqual(plan("2026-11-30").map((i) => [i.data.dueDate, i.priority]), [["2026-09-19", "high"], ["2026-11-30", "medium"]]);
  assert.deepEqual(plan("2026-12-01").map((i) => [i.data.dueDate, i.priority, i.data.daysLate]), [["2026-09-19", "high", 73], ["2026-11-30", "high", 1]]);
  // Nobody but the HR people: not QC, not the super admin while somebody answers for it.
  assert.ok(plan("2026-12-01").every((i) => i.userId === "u-hr"));
  // Before the go-live nothing was told; with no go-live floor, August's is told too (as late as it is).
  assert.deepEqual(plan("2026-11-02", "").map((i) => i.data.dueDate), ["2026-08-31", "2026-09-19"]);
  // Held: nothing.
  const held: PlanRecord = { ...record, trainings: record.trainings!.map((t) => ({ ...t, held: true })) };
  assert.equal(planNotifications({ today: "2026-12-01", time: "09:00", documents: [calendar], records: [held], people: [hr], isClosedDay: closed }).filter((i) => i.kind === "training").length, 0);
});
