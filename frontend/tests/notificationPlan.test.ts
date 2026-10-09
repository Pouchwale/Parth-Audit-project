// WHO IS TOLD WHAT, AND WHEN (REQUIREMENTS §97): engine/notificationPlan.ts on a fake clock and the plant's calendar.
//
// What is proved here:
//   * the rules it shares with the browser's files are theirs: periodDays and priorityOf (engine/notifications.ts),
//     ADVANCE_WARNING_DAYS (engine/reminders.ts), AS_REQUIRED_DAYS (engine/latenessCore.ts);
//   * every frequency: daily (the same day, never a heads-up), weekly and fortnightly (the working day before, across
//     the Thursday off), monthly, quarterly and yearly (three days ahead), as-required (only once started, overdue when
//     its two-day allowance runs out, never on a closed day);
//   * the calendar: nothing is due on the weekly off or a festival holiday; an adjustment day is a working day;
//   * one task per record: ready, needs_input (with the count of what still stops a submit), due, overdue;
//   * the people: those who answer for the document; nobody: the super admin; verify for everybody with Write but
//     the submitter; sent_back for the submitter, a new one each time;
//   * a sheet not stored is told of by its document and date, a sheet from before the go-live not at all;
//   * the super admin's morning and evening summaries, by module; none on a closed day.
// A record the morning prepare leaves with empty readings is needs_input with the readings waiting: this file never
// assumes a prepared record is ready (the prepare fills only the known parts, REQUIREMENTS §97).
// Run: npm run test:unit -- notificationPlan
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ADVANCE_WARNING_DAYS,
  AS_REQUIRED_DAYS,
  asRequiredDeadline,
  headsUpFrom,
  NOTIFICATION_KINDS,
  periodDays,
  planNotifications,
  PLANNED_KINDS,
  priorityOf,
  type PlanDocument,
  type PlannedItem,
  type PlanPerson,
  type PlanRecord,
} from "../src/engine/notificationPlan";
import { periodDays as browserPeriodDays, priorityOf as browserPriorityOf } from "../src/engine/notifications";
import { AS_REQUIRED_DAYS as LATENESS_AS_REQUIRED_DAYS, plantClosedDays } from "../src/engine/latenessCore";
import type { ScheduleConfig } from "../src/types";

const repoRoot = process.env.DCRS_REPO_ROOT ?? process.cwd();

// The plant's calendar: Thursday off; Monday 19-Oct-2026 a festival; Thursday 22-Oct-2026 an adjustment day (worked).
const closed = plantClosedDays({ weeklyOffDay: 4, holidays: [{ date: "2026-10-19" }], adjustmentDays: [{ date: "2026-10-22" }] });

const SCHEDULES: ScheduleConfig[] = [
  { type: "daily" },
  { type: "weekly", weekday: 6 },
  { type: "fortnightly", anchorDayOfMonth: 1 },
  { type: "monthly", dayOfMonth: 12 },
  { type: "quarterly", anchorMonth: 0, dayOfMonth: 12 },
  { type: "yearly", month: 9, dayOfMonth: 12 },
  { type: "as-required" },
];

const doc = (id: string, schedule: ScheduleConfig, module = "QC", extra: Partial<PlanDocument> = {}): PlanDocument => ({ id, formatNo: `F/${module}/${id.length}`, name: `Doc ${id}`, module, schedule, ...extra });

const DOCS: PlanDocument[] = [
  doc("daily", { type: "daily" }),
  doc("weekly", { type: "weekly", weekday: 6 }),
  doc("fortnightly", { type: "fortnightly", anchorDayOfMonth: 1 }),
  doc("monthly", { type: "monthly", dayOfMonth: 12 }, "HR"),
  doc("quarterly", { type: "quarterly", anchorMonth: 0, dayOfMonth: 12 }, "HR"),
  doc("yearly", { type: "yearly", month: 9, dayOfMonth: 12 }, "HR"),
  doc("asreq", { type: "as-required" }),
  doc("orphan", { type: "daily" }, "STR"),
  doc("licence", { type: "yearly", month: 0, dayOfMonth: 1 }, "SYS", { reference: true }),
];

const person = (id: string, name: string, answers: string[], verifies: string[] = answers, boss = false): PlanPerson => ({
  id,
  name,
  boss,
  answersFor: new Set(answers),
  mayVerify: (d) => boss || verifies.includes(d),
});
const KAPILA = person("u-kapila", "Kapila Barad", ["daily", "weekly", "fortnightly", "asreq"], ["daily", "weekly", "fortnightly", "asreq"]);
const ANKUR = person("u-ankur", "Ankur Raval", [], ["daily", "weekly"]);
const VINAY = person("u-vinay", "Vinay Bhojak", ["monthly", "quarterly", "yearly"]);
const BOSS = person("u-boss", "Super Admin", [], [], true);
const PEOPLE = [KAPILA, ANKUR, VINAY, BOSS];

let n = 0;
const rec = (documentId: string, dueDate: string, status: string, extra: Partial<PlanRecord> = {}): PlanRecord => ({
  id: `rec-${documentId}-${dueDate}-${++n}`,
  documentId,
  dueDate,
  status,
  stored: true,
  prepared: false,
  problems: 0,
  ...extra,
});

function plan(today: string, records: PlanRecord[], time = "09:00", countedFrom: string | null = null): PlannedItem[] {
  return planNotifications({ today, time, documents: DOCS, records, people: PEOPLE, isClosedDay: closed, countedFrom });
}
const of = (items: PlannedItem[], userId: string, kind?: string) => items.filter((i) => i.userId === userId && (!kind || i.kind === kind));

test("the rules it shares are the browser's own: periodDays, priorityOf, ADVANCE_WARNING_DAYS, AS_REQUIRED_DAYS", () => {
  for (const s of SCHEDULES) {
    assert.equal(periodDays(s), browserPeriodDays(s), s.type);
    for (let d = -3; d <= 10; d++) assert.equal(priorityOf(s, d), browserPriorityOf(s, d), `${s.type} ${d}`);
  }
  const reminders = readFileSync(path.join(repoRoot, "frontend", "src", "engine", "reminders.ts"), "utf-8");
  const m = /const ADVANCE_WARNING_DAYS = (\d+);/.exec(reminders);
  assert.ok(m, "engine/reminders.ts still names ADVANCE_WARNING_DAYS");
  assert.equal(ADVANCE_WARNING_DAYS, Number(m![1]));
  assert.equal(AS_REQUIRED_DAYS, LATENESS_AS_REQUIRED_DAYS);
  assert.deepEqual([...PLANNED_KINDS].filter((k) => !NOTIFICATION_KINDS.includes(k)), []);
});

test("the heads-up by frequency: the working day before (across the Thursday off), three days ahead, never for daily or as-required", () => {
  assert.equal(headsUpFrom({ type: "daily" }, "2026-10-10", closed), null);
  assert.equal(headsUpFrom({ type: "as-required" }, "2026-10-10", closed), null);
  assert.equal(headsUpFrom({ type: "weekly" }, "2026-10-10", closed), "2026-10-09", "Saturday's: Friday");
  assert.equal(headsUpFrom({ type: "weekly" }, "2026-10-16", closed), "2026-10-14", "Friday's: Wednesday, past the Thursday off");
  assert.equal(headsUpFrom({ type: "fortnightly" }, "2026-10-20", closed), "2026-10-18", "Tuesday's: Sunday (a working day), past the Monday festival");
  for (const type of ["monthly", "quarterly", "yearly"]) assert.equal(headsUpFrom({ type }, "2026-10-12", closed), "2026-10-09", type);
  assert.equal(asRequiredDeadline("2026-10-07", closed), "2026-10-09", "two days on");
  assert.equal(asRequiredDeadline("2026-10-13", closed), "2026-10-16", "never ending on the Thursday off");
});

test("daily: due today and not started is `due`; an open sheet with readings to enter is needs_input with the count; filled and passing is ready", () => {
  const blank = rec("daily", "2026-10-09", "Due");
  const prepared = rec("daily", "2026-10-09", "In Progress", { prepared: true, problems: 12 });
  const filled = rec("daily", "2026-10-09", "In Progress", { problems: 0 });
  const items = plan("2026-10-09", [blank, prepared, filled]);
  const mine = of(items, KAPILA.id);
  const due = mine.find((i) => i.kind === "due");
  assert.ok(due, JSON.stringify(mine));
  assert.equal(due!.key, "due|daily|2026-10-09");
  assert.equal(due!.priority, "high", "a daily sheet due today has no room");
  const needs = mine.find((i) => i.kind === "needs_input");
  assert.equal(needs?.key, `needs_input|${prepared.id}`);
  assert.equal(needs?.data.count, 12, "the readings waiting");
  assert.equal(needs?.data.recordId, prepared.id);
  assert.equal(needs?.data.module, "QC");
  const ready = mine.find((i) => i.kind === "ready");
  assert.equal(ready?.key, `ready|${filled.id}`);
  assert.equal(of(items, ANKUR.id).filter((i) => i.kind !== "verify").length, 0, "Ankur answers for none of it");
  assert.equal(of(items, BOSS.id).filter((i) => i.kind !== "boss_summary").length, 0, "the super admin is not told every record");
});

test("a freshly prepared record with empty readings is needs_input with the number of readings waiting, never ready", () => {
  const prepared = rec("daily", "2026-10-09", "In Progress", { prepared: true, problems: 3 });
  const items = of(plan("2026-10-09", [prepared]), KAPILA.id);
  assert.deepEqual(items.map((i) => [i.kind, i.data.count]), [["needs_input", 3]]);
});

test("overdue: one per record, the days late counted from its day; a closed day is not work; an adjustment day is", () => {
  const wednesday = rec("daily", "2026-10-07", "In Progress", { prepared: true, problems: 0 });
  const thursday = rec("daily", "2026-10-08", "Due");
  const items = plan("2026-10-09", [wednesday, thursday]);
  const mine = of(items, KAPILA.id);
  assert.deepEqual(mine.map((i) => i.key), [`overdue|${wednesday.id}`], "Wednesday's is late, not also ready; Thursday is the weekly off");
  assert.equal(mine[0].data.daysLate, 2);
  assert.equal(mine[0].priority, "high");
  // The festival (Monday 19th) is no work; the adjustment day (Thursday 22nd) is.
  const festival = rec("daily", "2026-10-19", "Due");
  const adjustment = rec("daily", "2026-10-22", "Due");
  const later = of(plan("2026-10-23", [festival, adjustment]), KAPILA.id);
  assert.deepEqual(later.map((i) => i.key), [`overdue|${adjustment.id}`]);
  assert.equal(later[0].data.daysLate, 1);
});

test("weekly and fortnightly: a heads-up the working day before, then due on the day", () => {
  const saturday = rec("weekly", "2026-10-10", "Due");
  assert.deepEqual(of(plan("2026-10-08", [saturday]), KAPILA.id), [], "two days before: nothing yet");
  const before = of(plan("2026-10-09", [saturday]), KAPILA.id);
  assert.deepEqual(before.map((i) => [i.kind, i.key, i.priority]), [["upcoming", "upcoming|weekly|2026-10-10", "medium"]]);
  assert.equal(before[0].data.dueDate, "2026-10-10");
  const onTheDay = of(plan("2026-10-10", [saturday]), KAPILA.id);
  assert.deepEqual(onTheDay.map((i) => i.kind), ["due"]);
  const friday = rec("weekly", "2026-10-16", "Due");
  assert.deepEqual(of(plan("2026-10-13", [friday]), KAPILA.id), []);
  assert.deepEqual(of(plan("2026-10-14", [friday]), KAPILA.id).map((i) => i.kind), ["upcoming"], "Wednesday, past the Thursday off");
  const fortnight = rec("fortnightly", "2026-10-20", "Due");
  assert.deepEqual(of(plan("2026-10-17", [fortnight]), KAPILA.id), []);
  assert.deepEqual(of(plan("2026-10-18", [fortnight]), KAPILA.id).map((i) => i.kind), ["upcoming"], "the working day before, past the festival");
});

test("monthly, quarterly and yearly: three days ahead, low priority until the day, to the person who answers for them", () => {
  for (const id of ["monthly", "quarterly", "yearly"]) {
    const r = rec(id, "2026-10-12", "Due");
    assert.deepEqual(of(plan("2026-10-08", [r]), VINAY.id), [], `${id}: four days ahead, nothing`);
    const items = of(plan("2026-10-09", [r]), VINAY.id);
    assert.deepEqual(items.map((i) => [i.kind, i.priority]), [["upcoming", "low"]], id);
    assert.equal(items[0].data.module, "HR");
    assert.equal(of(plan("2026-10-12", [r]), VINAY.id)[0].priority, "medium", `${id} due today: medium (a long period)`);
  }
});

test("as-required: told once started, overdue only when the two-day allowance runs out, never a heads-up", () => {
  const started = rec("asreq", "2026-10-07", "In Progress", { problems: 4 });
  assert.deepEqual(of(plan("2026-10-09", [started]), KAPILA.id).map((i) => [i.kind, i.data.count]), [["needs_input", 4]], "within its allowance");
  const late = of(plan("2026-10-10", [started]), KAPILA.id);
  assert.deepEqual(late.map((i) => [i.kind, i.data.daysLate]), [["overdue", 1]]);
  const beforeTheOff = rec("asreq", "2026-10-13", "In Progress", { problems: 1 });
  assert.deepEqual(of(plan("2026-10-15", [beforeTheOff]), KAPILA.id).map((i) => i.kind), ["needs_input"], "its last day is not the Thursday off");
  assert.deepEqual(of(plan("2026-10-17", [beforeTheOff]), KAPILA.id).map((i) => [i.kind, i.data.daysLate]), [["overdue", 1]]);
  const future = rec("asreq", "2026-10-12", "Due");
  assert.deepEqual(of(plan("2026-10-09", [future]), KAPILA.id), [], "no heads-up");
});

test("verify goes to everybody with Write but the submitter; nobody: the super admin; a send-back goes to the submitter, once per send-back", () => {
  const submitted = rec("daily", "2026-10-08", "Pending Verification", { submittedBy: "Kapila Barad" });
  const items = plan("2026-10-09", [submitted]);
  assert.deepEqual(of(items, ANKUR.id).map((i) => [i.kind, i.key, i.data.by]), [["verify", `verify|${submitted.id}`, "Kapila Barad"]]);
  assert.deepEqual(of(items, KAPILA.id), [], "not to the person who submitted it");
  assert.equal(of(items, BOSS.id, "verify").length, 0);
  const monthly = rec("monthly", "2026-10-05", "Submitted", { submittedBy: "Vinay Bhojak" });
  assert.deepEqual(of(plan("2026-10-09", [monthly]), BOSS.id, "verify").map((i) => i.key), [`verify|${monthly.id}`], "nobody else may verify it: the super admin");
  const sent = rec("daily", "2026-10-07", "Rejected", { submittedBy: "Kapila Barad", rejectedBy: "Ankur Raval", rejectionReason: "Sign the sheet", rejections: 2 });
  const back = of(plan("2026-10-09", [sent]), KAPILA.id);
  assert.deepEqual(back.map((i) => [i.kind, i.key, i.data.reason, i.data.by]), [["sent_back", `sent_back|${sent.id}|2`, "Sign the sheet", "Ankur Raval"]]);
  assert.deepEqual(of(plan("2026-10-09", [sent]), ANKUR.id), []);
});

test("nobody answers for a document: the super admin is told; a reference document is never told", () => {
  const orphan = rec("orphan", "2026-10-09", "Due");
  const licence = rec("licence", "2026-10-09", "Due");
  const items = plan("2026-10-09", [orphan, licence]);
  assert.deepEqual(of(items, BOSS.id, "due").map((i) => i.key), ["due|orphan|2026-10-09"]);
  assert.ok(!items.some((i) => i.data.documentId === "licence"));
});

test("a sheet not stored is told of by its document and date; an open one not stored is not told as ready; before the go-live, nothing", () => {
  const shell = rec("daily", "2026-10-09", "Due", { stored: false });
  const items = of(plan("2026-10-09", [shell]), KAPILA.id);
  assert.deepEqual(items.map((i) => i.key), ["due|daily|2026-10-09"]);
  assert.equal(items[0].data.recordId, undefined, "no id to open it by");
  const lateShell = rec("daily", "2026-10-07", "Due", { stored: false });
  assert.deepEqual(of(plan("2026-10-09", [lateShell]), KAPILA.id).map((i) => i.key), ["overdue|daily|2026-10-07"]);
  const beforeLive = rec("daily", "2026-10-07", "Due");
  assert.deepEqual(of(plan("2026-10-09", [beforeLive], "09:00", "2026-10-09"), KAPILA.id), []);
});

test("the super admin's summaries: the morning one after the prepare, both at the last call, counted by module; none on a closed day", () => {
  const records = [
    rec("daily", "2026-10-09", "In Progress", { prepared: true, problems: 5 }),
    rec("daily", "2026-10-09", "In Progress", { problems: 0 }),
    rec("daily", "2026-10-07", "Due"),
    rec("monthly", "2026-10-05", "Submitted", { submittedBy: "Vinay Bhojak" }),
  ];
  assert.deepEqual(of(plan("2026-10-09", records, "08:00"), BOSS.id, "boss_summary"), [], "before the morning prepare");
  const morning = of(plan("2026-10-09", records, "09:00"), BOSS.id, "boss_summary");
  assert.deepEqual(morning.map((i) => [i.key, i.data.part]), [["boss_summary|2026-10-09|morning", "morning"]]);
  assert.deepEqual(morning[0].data.modules, [
    { module: "HR", ready: 0, needsInput: 0, awaitingVerification: 1, notSubmitted: 0, overdue: 0 },
    { module: "QC", ready: 1, needsInput: 1, awaitingVerification: 0, notSubmitted: 2, overdue: 1 },
  ]);
  const evening = of(plan("2026-10-09", records, "17:50"), BOSS.id, "boss_summary");
  assert.deepEqual(evening.map((i) => i.data.part), ["morning", "evening"]);
  assert.equal(of(items0("2026-10-08"), BOSS.id, "boss_summary").length, 0, "Thursday, the weekly off");
  function items0(today: string) {
    return plan(today, records, "18:00");
  }
});

test("the same input gives the same items, and every key is one per person", () => {
  const records = [rec("daily", "2026-10-09", "Due"), rec("weekly", "2026-10-10", "Due"), rec("daily", "2026-10-07", "In Progress", { problems: 2 })];
  const a = plan("2026-10-09", records);
  const b = plan("2026-10-09", [...records].reverse());
  assert.deepEqual(a, b);
  const keys = a.map((i) => `${i.userId}|${i.key}`);
  assert.equal(new Set(keys).size, keys.length);
});
