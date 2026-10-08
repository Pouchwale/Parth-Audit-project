// THE MINUS SCORE ON THE PERFORMANCE DASHBOARD (REQUIREMENTS §92).
//
// "i need display score in -10 and in subtraction like example whenever any
// user given 10 task and he is completed 8 of them then his score will be -20
// so this will be applicable to all user" (the plant, 7-Oct-2026).
//
// Beside the score out of 100 (§64), every line of the scorecard carries a
// minus score: -10 for each record never done, exactly 0 when nothing was
// missed. A record handed in late was done and costs nothing; a record whose
// day has not ended costs nothing yet, and the ones whose last day is TODAY are
// counted apart ("still open today") so nobody is surprised in the morning.
// The records, the people, the plant's calendar and the period are the
// scorecard's own (engine/latenessCore.ts), so these tests ask the scorecard
// itself, on records built for each case, and then on two demo months.
//
// "Today" is fixed here, never the clock.
import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { generateDemoRecordsForMonth } from "../src/data/demoGenerator";
import { departmentOfDocument } from "../src/data/seed/departments";
import {
  MINUS_PER_MISSED,
  closedDays,
  formatMinus,
  minusScore,
  monthRange,
  scorecards,
  type PeriodKey,
  type PeriodRange,
  type Person,
  type PlantCalendar,
  type ScoreLine,
  type Scorecards,
} from "../src/engine/performance";
import { addDaysISO, judge, plantClosedDays } from "../src/engine/latenessCore";

ensureDocumentsSeeded();
ensureMasterSeeded();

const MINUS = String.fromCharCode(0x2212);
const ALWAYS_OPEN: PlantCalendar = { isClosedDay: () => false };
// Thursday off, a festival on Friday 04-Sep, and Thursday 15-Oct worked to make up for it.
const PLANT: PlantCalendar = { isClosedDay: plantClosedDays({ weeklyOffDay: 4, holidays: [{ date: "2026-09-04" }], adjustmentDays: [{ date: "2026-10-15" }] }) };

const documents: DocumentDefinition[] = documentRepository.getAll();
function firstOf(what: string, pred: (d: DocumentDefinition) => boolean): DocumentDefinition {
  const d = documents.find((x) => !x.isReferenceOnly && pred(x));
  assert.ok(d, `the catalogue has ${what}`);
  return d;
}
const dept = (d: DocumentDefinition) => departmentOfDocument(d.id, d.formatNo);
const qcDaily = firstOf("a QC document filled in every day", (d) => dept(d) === "QC" && d.schedule.type === "daily");
const qcAsRequired = firstOf("a QC document kept as required", (d) => dept(d) === "QC" && d.schedule.type === "as-required");
const hrDaily = firstOf("an HR document filled in every day", (d) => dept(d) === "HR" && d.schedule.type === "daily");
const prdDoc = firstOf("a scheduled Production document", (d) => dept(d) === "PRD" && d.schedule.type !== "as-required");
const mntDoc = firstOf("a scheduled Maintenance document", (d) => dept(d) === "MNT" && d.schedule.type !== "as-required");

const JENI: Person = { id: "qc-jeni", name: "Jeni", role: "staff", departments: ["QC"] };
const ASHA: Person = { id: "hr-asha", name: "Asha Patel", role: "staff", departments: ["HR"] };
const BHAVNA: Person = { id: "hr-bhavna", name: "Bhavna Shah", role: "staff", departments: ["HR"] };
const PRIYA: Person = { id: "priya", name: "Priya Solanki", role: "staff", departments: ["PRD", "MNT"] };
const ADMIN: Person = { id: "admin", name: "Super Admin", role: "admin", departments: [] };
const MR: Person = { id: "mr", name: "Management Rep", role: "staff", departments: [] };
const EVERYBODY = [JENI, ASHA, BHAVNA, PRIYA, ADMIN, MR];

let n = 0;
/** A record of `doc` for `dueDate`: still open ("Due") unless handed in. */
function rec(doc: DocumentDefinition, dueDate: string, extra: Partial<RecordInstance> = {}): RecordInstance {
  n += 1;
  return {
    id: `minus-${n}`,
    documentId: doc.id,
    periodKey: `${doc.id}:${dueDate}:${n}`,
    dueDate,
    status: "Due",
    isDemo: false,
    data: {},
    createdAt: `${dueDate}T03:00:00.000Z`,
    updatedAt: `${dueDate}T03:00:00.000Z`,
    ...extra,
  } as RecordInstance;
}
/** Handed in on `on` (midday in the plant, the same date on any clock) by `by`. */
const handedIn = (on: string, by: string): Partial<RecordInstance> => ({ status: "Submitted", submittedAt: `${on}T06:30:00.000Z`, submittedBy: by });
const sep = (d: number) => `2026-09-${String(d).padStart(2, "0")}`;

const card = (cards: Scorecards, who: Person) => {
  const p = cards.byPerson.find((x) => x.person.id === who.id);
  assert.ok(p, `${who.name} has a card`);
  return p;
};
const department = (cards: Scorecards, code: string) => cards.byDepartment.find((d) => d.code === code);
const docLine = (cards: Scorecards, doc: DocumentDefinition) => cards.byDocument.find((d) => d.doc.id === doc.id);
const score = (records: RecordInstance[], today: string, calendar: PlantCalendar = ALWAYS_OPEN, people: readonly Person[] = EVERYBODY, period: PeriodKey | PeriodRange = "this-month") =>
  scorecards(records, documents, people, period, today, calendar);

// ---------------------------------------------------------------------------

test("the figure and its words: -10 for each never done, 0 (never -0) when nothing was missed", () => {
  assert.equal(MINUS_PER_MISSED, 10);
  assert.equal(minusScore(2), -20);
  assert.equal(minusScore(1), -10);
  assert.ok(Object.is(minusScore(0), 0), "nothing missed is 0, not -0");
  assert.ok(Object.is(minusScore(-0), 0));
  assert.ok(Object.is(minusScore(Number.NaN), 0));
  assert.equal(formatMinus(0), "0");
  assert.equal(formatMinus(-0), "0", "never written as -0");
  assert.equal(formatMinus(-20), `${MINUS}20`, "a true minus sign (U+2212)");
  assert.equal(formatMinus(-1230), `${MINUS}1230`);
  assert.equal(formatMinus(minusScore(123)), `${MINUS}1230`);
});

test("the owner's example: 10 records due and 8 handed in is -20, for the person, the department, the document and the module", () => {
  // QC's daily sheet, 01-Sep to 10-Sep: 6 on time, 2 late, 2 never handed in.
  const records = [
    ...[1, 2, 3, 4, 5, 6].map((d) => rec(qcDaily, sep(d), handedIn(sep(d), "Jeni"))),
    ...[7, 8].map((d) => rec(qcDaily, sep(d), handedIn(sep(d + 2), "Jeni"))),
    ...[9, 10].map((d) => rec(qcDaily, sep(d))),
  ];
  const cards = score(records, "2026-09-24");
  const jeni = card(cards, JENI);
  assert.deepEqual([jeni.due, jeni.onTime, jeni.late, jeni.overdue, jeni.pending], [10, 6, 2, 2, 0]);
  assert.equal(jeni.minus, -20, "10 due, 8 handed in: -20");
  assert.equal(formatMinus(jeni.minus), `${MINUS}20`);
  assert.equal(jeni.score, 70, "the score out of 100 is the same formula as ever: (6 + 1) / 10");
  assert.equal(jeni.openToday, 0);
  assert.equal(department(cards, "QC")?.minus, -20);
  assert.equal(docLine(cards, qcDaily)?.minus, -20);
  assert.equal(cards.byModule.find((m) => m.module === qcDaily.module)?.minus, -20);

  // All 8 on time and 2 never done: the minus score is still -20; the score is 80.
  const straight = [...[1, 2, 3, 4, 5, 6, 7, 8].map((d) => rec(qcDaily, sep(d), handedIn(sep(d), "Jeni"))), ...[9, 10].map((d) => rec(qcDaily, sep(d)))];
  const again = card(score(straight, "2026-09-24"), JENI);
  assert.deepEqual([again.minus, again.score], [-20, 80]);
});

test("a record handed in late was done: it costs nothing", () => {
  const records = [...[1, 2, 3, 4, 5, 6].map((d) => rec(qcDaily, sep(d), handedIn(sep(d), "Jeni"))), ...[7, 8, 9, 10].map((d) => rec(qcDaily, sep(d), handedIn(sep(d + 3), "Jeni")))];
  const jeni = card(score(records, "2026-09-24"), JENI);
  assert.deepEqual([jeni.due, jeni.late, jeni.overdue], [10, 4, 0]);
  assert.ok(Object.is(jeni.minus, 0), `nothing missed is exactly 0, got ${jeni.minus}`);
  assert.equal(formatMinus(jeni.minus), "0");
  assert.equal(jeni.score, 80);
});

test("not due yet costs nothing, and a record whose last day is today is counted as still open today", () => {
  // Judged on Thursday 24-Sep with every day open: the 24th's own record and the six after it.
  const records = [rec(qcDaily, sep(24)), ...[25, 26, 27, 28, 29, 30].map((d) => rec(qcDaily, sep(d)))];
  const on24 = card(score(records, sep(24)), JENI);
  assert.deepEqual([on24.pending, on24.openToday, on24.overdue], [7, 1, 0]);
  assert.ok(Object.is(on24.minus, 0), "nothing has been missed yet");
  assert.equal(docLine(score(records, sep(24)), qcDaily)?.openToday, 1);
  // The next day the 24th's is never done: 10 off, and the 25th's is the one open today.
  const on25 = card(score(records, sep(25)), JENI);
  assert.deepEqual([on25.overdue, on25.minus, on25.pending, on25.openToday], [1, -10, 6, 1]);
  // Handed in on the day: nothing open, nothing off.
  const done = [rec(qcDaily, sep(24), handedIn(sep(24), "Jeni")), ...[25, 26].map((d) => rec(qcDaily, sep(d)))];
  const doneLine = card(score(done, sep(24)), JENI);
  assert.deepEqual([doneLine.onTime, doneLine.openToday, doneLine.minus], [1, 0, 0]);
  // Future records only: nothing open today.
  assert.equal(card(score(records.slice(1), sep(24)), JENI).openToday, 0);
});

test("the plant's closed days: never counted against anybody, and an adjustment day counts like any working day", () => {
  // Thursday 17-Sep is the weekly off and Friday 04-Sep a festival: neither is counted.
  const closed = [rec(qcDaily, sep(17)), rec(qcDaily, sep(4))];
  const onCalendar = card(score(closed, sep(24), PLANT), JENI);
  assert.deepEqual([onCalendar.due, onCalendar.minus], [0, 0]);
  assert.equal(card(score(closed, sep(24), ALWAYS_OPEN), JENI).minus, -20, "without the calendar both would cost 10");
  // Thursday 15-Oct is worked to make up for a festival: never done, it costs 10.
  const adjustment = card(score([rec(qcDaily, "2026-10-15")], "2026-10-16", PLANT), JENI);
  assert.deepEqual([adjustment.overdue, adjustment.minus], [1, -10]);
  // Today is the weekly off: a record dated today is not counted, so nothing is open today.
  const onOff = card(score([rec(qcDaily, sep(24))], sep(24), PLANT), JENI);
  assert.deepEqual([onOff.pending, onOff.openToday], [0, 0]);
  // The day before the weekly off (Wednesday 23-Sep): today's record is still open today, and costs 10 on Thursday.
  const eve = card(score([rec(qcDaily, sep(23))], sep(23), PLANT), JENI);
  assert.deepEqual([eve.openToday, eve.minus], [1, 0]);
  assert.equal(card(score([rec(qcDaily, sep(23))], sep(24), PLANT), JENI).minus, -10);
});

test("an as-required record has its 2 days, run past the weekly off, before it costs anything", () => {
  // Started Tuesday 15-Sep and never handed in: the 2 days end on Thursday the 17th, the weekly off, so it has until Friday the 18th.
  const records = [rec(qcAsRequired, sep(15), { status: "In Progress" })];
  const on = (day: number) => card(score(records, sep(day), PLANT), JENI);
  assert.deepEqual([on(16).pending, on(16).openToday, on(16).minus], [1, 0, 0], "16th: not its last day");
  assert.deepEqual([on(17).pending, on(17).openToday, on(17).minus], [1, 0, 0], "17th: the weekly off, not its last day either");
  assert.deepEqual([on(18).pending, on(18).openToday, on(18).minus], [1, 1, 0], "18th: its last day, still open today");
  assert.deepEqual([on(19).overdue, on(19).openToday, on(19).minus], [1, 0, -10], "19th: never done, 10 off");
});

test("the go-live date: a record nobody handed in from before the system went live costs nothing", () => {
  const records = [rec(qcDaily, sep(9)), rec(qcDaily, sep(10))];
  const jeni = card(score(records, sep(24), { isClosedDay: () => false, countedFrom: sep(10) }), JENI);
  assert.deepEqual([jeni.overdue, jeni.minus], [1, -10], "only the 10th is counted");
});

test("every person gets it, by the scorecard's own rule of who answers for a record", () => {
  const records = [
    rec(hrDaily, sep(7)), // nobody handed it in: against both HR accounts
    rec(hrDaily, sep(8), handedIn(sep(10), "Asha Patel")), // Asha's, late: costs nobody
    rec(hrDaily, sep(9), handedIn(sep(9), "Bhavna Shah")), // Bhavna's, on time
    rec(hrDaily, sep(24)), // today's, not in yet: open today for both
    rec(prdDoc, sep(7)), // Priya answers for Production...
    rec(mntDoc, sep(8)), // ...and for Maintenance
  ];
  const cards = score(records, sep(24));
  const asha = card(cards, ASHA);
  const bhavna = card(cards, BHAVNA);
  assert.deepEqual([asha.late, asha.overdue, asha.minus, asha.openToday], [1, 1, -10, 1]);
  assert.deepEqual([bhavna.onTime, bhavna.overdue, bhavna.minus, bhavna.openToday], [1, 1, -10, 1]);
  // The department loses 10 once for the record nobody did, though each of its two accounts loses 10 for it.
  assert.deepEqual([department(cards, "HR")?.overdue, department(cards, "HR")?.minus, department(cards, "HR")?.openToday], [1, -10, 1]);
  const priya = card(cards, PRIYA);
  assert.deepEqual([priya.overdue, priya.minus], [2, -20], "one never done in each of her two departments");
  assert.equal(department(cards, "PRD")?.minus, -10);
  assert.equal(department(cards, "MNT")?.minus, -10);
  // The administrator and an account with no departments answer for no record: no score, and nothing taken off.
  for (const who of [ADMIN, MR]) {
    const p = card(cards, who);
    assert.equal(p.answers, false);
    assert.ok(Object.is(p.minus, 0) && p.openToday === 0, `${who.name}: ${p.minus}, ${p.openToday}`);
  }
  // Jeni (QC) has nothing in these records: 0.
  assert.ok(Object.is(card(cards, JENI).minus, 0));
});

test("the period chosen is the period counted", () => {
  const records = [rec(qcDaily, "2026-08-20")]; // never done, last month
  for (const period of ["last-month", "last-3-months", "this-year", monthRange(2026, 7)] as (PeriodKey | PeriodRange)[]) {
    assert.equal(card(score(records, sep(24), ALWAYS_OPEN, EVERYBODY, period), JENI).minus, -10, JSON.stringify(period));
  }
  assert.ok(Object.is(card(score(records, sep(24)), JENI).minus, 0), "not in this month's");
});

test("a record due after today is judged once: only one whose last day can be today is judged again, as of tomorrow", () => {
  // The review of 8-Oct-2026: still open today judged every record not due yet a second time, as of tomorrow,
  // though a record due after today can never end today (its last day is never before its own date). This year,
  // early in October, is some 800 such records at every switch of the period. The plant's calendar is asked once
  // each time a scheduled record is judged, so counting what it is asked counts the judgements.
  let asked = 0;
  const counting: PlantCalendar = {
    isClosedDay: () => {
      asked += 1;
      return false;
    },
  };
  const later = [25, 26, 27, 28, 29, 30].map((d) => rec(qcDaily, sep(d)));
  const ahead = card(score(later, sep(24), counting), JENI);
  assert.deepEqual([ahead.pending, ahead.openToday, ahead.minus], [6, 0, 0]);
  assert.equal(asked, later.length, "each record due after today is judged once");
  // Today's own record is judged again, as of tomorrow: it is the one still open today.
  asked = 0;
  const withToday = card(score([rec(qcDaily, sep(24)), ...later], sep(24), counting), JENI);
  assert.deepEqual([withToday.pending, withToday.openToday], [7, 1]);
  assert.equal(asked, later.length + 2, "today's record twice, every later one once");
  // The same answers as before on the plant's real calendar: nothing due after today is ever open today.
  const plant = card(score([rec(qcDaily, sep(23)), ...later], sep(23), PLANT), JENI);
  assert.deepEqual([plant.pending, plant.openToday], [7, 1], "the 23rd's own and the six after it, past the weekly off; only the 23rd's ends today");
});

// ---------------------------------------------------------------------------
// Two demo months: every line of every table, judged on every day of a month.

/** The last day a record can be handed in, worked out here on its own: its date, or 2 days on for an as-required one, past any closed day. */
function lastDay(r: RecordInstance, doc: DocumentDefinition, calendar: PlantCalendar): string {
  if (doc.schedule.type !== "as-required") return r.dueDate;
  let d = addDaysISO(r.dueDate, 2);
  for (let i = 0; i < 14 && calendar.isClosedDay(d); i++) d = addDaysISO(d, 1);
  return d;
}

test("on two demo months, every line's minus score is -10 x its never done, and still open today is the records whose last day is today", () => {
  generateDemoRecordsForMonth(2026, 4);
  generateDemoRecordsForMonth(2026, 5);
  const demo = recordRepository.queryUnscoped({ isDemo: true });
  assert.ok(demo.length > 500, `a demo month's volume of records (${demo.length})`);
  const calendar: PlantCalendar = { isClosedDay: closedDays(masterRepository.get()) };
  const docById = new Map(documents.map((d) => [d.id, d]));
  let missed = 0;
  let openSeen = 0;
  for (let day = 1; day <= 30; day++) {
    const today = `2026-06-${String(day).padStart(2, "0")}`;
    const cards = scorecards(demo, documents, EVERYBODY, "this-month", today, calendar);
    const lines: ScoreLine[] = [...cards.byPerson, ...cards.byPerson.flatMap((p) => p.worst), ...cards.byDepartment, ...cards.byModule, ...cards.byDocument];
    for (const l of lines) {
      assert.ok(Object.is(l.minus, l.overdue > 0 ? -10 * l.overdue : 0), `${today}: ${l.minus} for ${l.overdue} never done`);
      assert.ok(l.openToday >= 0 && l.openToday <= l.pending, `${today}: ${l.openToday} open today of ${l.pending} not due yet`);
    }
    // The departments add up to the plant, minus score included.
    const plantNever = cards.byDocument.reduce((s, d) => s + d.overdue, 0);
    assert.equal(cards.byDepartment.reduce((s, d) => s + d.minus, 0), minusScore(plantNever), today);
    assert.equal(cards.byDepartment.reduce((s, d) => s + d.openToday, 0), cards.byDocument.reduce((s, d) => s + d.openToday, 0), today);
    // Still open today, recounted here from the records: not handed in, counted today, and today is its last day.
    const expected = new Map<string, number>();
    for (const r of demo) {
      if (r.dueDate < "2026-06-01" || r.dueDate > "2026-06-30") continue;
      const doc = docById.get(r.documentId);
      if (!doc || doc.isReferenceOnly) continue;
      if (judge(r, doc, today, calendar).outcome !== "pending") continue;
      if (lastDay(r, doc, calendar) !== today) continue;
      expected.set(doc.id, (expected.get(doc.id) ?? 0) + 1);
    }
    for (const d of cards.byDocument) assert.equal(d.openToday, expected.get(d.doc.id) ?? 0, `${today}: ${d.doc.id} open today`);
    missed += plantNever;
    openSeen += [...expected.values()].reduce((s, x) => s + x, 0);
  }
  assert.ok(missed > 0, "the demo months have records never done to take off");
  assert.ok(openSeen > 0, "and days with a record still open on its last day");
});
