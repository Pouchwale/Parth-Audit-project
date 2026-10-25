// THE DAILY STREAK'S RULE (engine/streakCore.ts; the owner, 25-Oct-2026: "streak for user can atleast
// login daily for once and complete it work ... like snapchat"), held to hand-made calendars:
//   * a working day is kept by a sign-in with nothing of theirs late or never done - by the sign-in alone
//     when nothing of theirs was due; no sign-in, or a late or never-done record, breaks it;
//   * the Thursday weekly off and a festival are stepped over, an adjustment Thursday is a working day,
//     and the streak never reaches back before the system went live;
//   * today joins once signed in with nothing waiting; until then it is at risk (shown from 15:30), never
//     broken;
//   * where the sign-ins are not known - none read, or a day before the first sign-in on record - a day
//     is judged by its records alone, the rule before them;
//   * the best run, the last fourteen days, the next working day, and a hundred days in a row.
// Run: npm run test:unit -- streakCore
import test from "node:test";
import assert from "node:assert/strict";
import { addDaysISO, plantClosedDays } from "../src/engine/latenessCore";
import {
  STREAK_AT_RISK_FROM,
  STREAK_LOOKBACK_DAYS,
  STREAK_MILESTONES,
  STREAK_STRIP_DAYS,
  STREAK_WORKING_DAYS,
  isStreakMilestone,
  judgeStreak,
  showsAtRisk,
  streakSignIns,
  type StreakDayTally,
  type StreakInput,
  type StreakSignIns,
} from "../src/engine/streakCore";

// ---- A made-up fortnight ------------------------------------------------------------------------
//
// Monday 26-Oct-2026 is today. Thursday 15-Oct is the weekly off; Monday 19-Oct and Tuesday 20-Oct
// are festival holidays; Thursday 22-Oct is an adjustment day, worked to make up for them.
const TODAY = "2026-10-26";
const CLOSED = plantClosedDays({ weeklyOffDay: 4, holidays: [{ date: "2026-10-19" }, { date: "2026-10-20" }], adjustmentDays: [{ date: "2026-10-22" }] });
const WORKING = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"];

const signedIn = (days: readonly string[], from: string | null = [...days].sort()[0] ?? null): StreakSignIns => ({ days: new Set(days), from });
const tally = (entries: Record<string, StreakDayTally>): Map<string, StreakDayTally> => new Map(Object.entries(entries));

function streak(over: Partial<StreakInput> = {}) {
  return judgeStreak({
    today: TODAY,
    judged: new Map(),
    waiting: 0,
    signIns: signedIn([...WORKING, TODAY]),
    isClosedDay: CLOSED,
    countedFrom: "2026-10-01",
    ...over,
  });
}

const stateOn = (r: ReturnType<typeof streak>, date: string) => r.lastDays.find((d) => d.date === date)?.state;

test("the calendar is the one meant: the 22nd an adjustment Thursday, the 15th the weekly off, the 19th and 20th festivals", () => {
  assert.equal(CLOSED("2026-10-15"), true);
  assert.equal(CLOSED("2026-10-19"), true);
  assert.equal(CLOSED("2026-10-20"), true);
  assert.equal(CLOSED("2026-10-22"), false, "the adjustment Thursday is worked");
  for (const d of [...WORKING, TODAY]) assert.equal(CLOSED(d), false, d);
});

test("signed in on every working day with nothing due: each one kept by the sign-in alone; the weekly off and the festivals stepped over; the adjustment Thursday counted", () => {
  const r = streak({ countedFrom: "2026-10-12" });
  assert.equal(r.before, WORKING.length, "eleven working days, the 15th, 19th and 20th stepped over");
  assert.equal(r.todayKept, true, "signed in, nothing waiting");
  assert.equal(r.days, 12);
  assert.equal(r.best, 12);
  assert.equal(r.todayAtRisk, false);
  assert.equal(r.signInsKnown, true);
  assert.equal(r.lastDays.length, STREAK_STRIP_DAYS);
  assert.deepEqual(r.lastDays[0], { date: "2026-10-13", state: "kept" }, "the strip starts thirteen days back");
  assert.deepEqual(r.lastDays[STREAK_STRIP_DAYS - 1], { date: TODAY, state: "kept" }, "and ends with today");
  assert.equal(stateOn(r, "2026-10-15"), "closed", "the weekly off");
  assert.equal(stateOn(r, "2026-10-19"), "closed", "a festival");
  assert.equal(stateOn(r, "2026-10-22"), "kept", "the adjustment Thursday");
});

test("a working day with no sign-in breaks the streak — the adjustment Thursday as much as any", () => {
  const r = streak({ signIns: signedIn([...WORKING, TODAY].filter((d) => d !== "2026-10-22")) });
  assert.equal(r.before, 3, "the 23rd, 24th and 25th");
  assert.equal(r.days, 4);
  assert.equal(stateOn(r, "2026-10-22"), "missed");
  assert.equal(r.best, 7, "before the gap: the 12th to the 21st was seven working days");
  const weekday = streak({ signIns: signedIn([...WORKING, TODAY].filter((d) => d !== "2026-10-24")) });
  assert.equal(weekday.before, 1);
  assert.equal(stateOn(weekday, "2026-10-24"), "missed");
});

test("a record ended late, or never done, breaks it however often they signed in; one all in on time keeps it", () => {
  const late = streak({ judged: tally({ "2026-10-23": { onTime: 1, bad: 1 } }) });
  assert.equal(late.before, 2, "the 24th and 25th, then the 23rd's late record");
  assert.equal(stateOn(late, "2026-10-23"), "missed");
  const never = streak({ judged: tally({ "2026-10-25": { onTime: 0, bad: 2 } }) });
  assert.equal(never.before, 0, "yesterday's work was never done");
  assert.equal(never.days, 1, "today, kept, starts it again");
  const allIn = streak({ judged: tally({ "2026-10-24": { onTime: 3, bad: 0 }, "2026-10-25": { onTime: 1, bad: 0 } }) });
  assert.equal(allIn.before, WORKING.length, "all in on time: every day kept");
  assert.equal(stateOn(allIn, "2026-10-24"), "kept");
});

test("the streak never reaches back before the system went live; those days are stepped over in the strip", () => {
  const r = streak({ countedFrom: "2026-10-21" });
  assert.equal(r.before, 5, "the 21st to the 25th");
  assert.equal(r.days, 6);
  assert.equal(stateOn(r, "2026-10-18"), "closed", "before go-live");
  assert.equal(stateOn(r, "2026-10-21"), "kept");
  const fresh = streak({ countedFrom: TODAY });
  assert.equal(fresh.before, 0);
  assert.equal(fresh.days, 1, "the first day the system is live, kept by the sign-in");
});

test("today: kept once signed in with nothing waiting; while something waits it is at risk — from 15:30 — and never broken", () => {
  const waiting = streak({ waiting: 2, judged: tally({ [TODAY]: { onTime: 1, bad: 0 } }) });
  assert.equal(waiting.todayKept, false);
  assert.equal(waiting.todayAtRisk, true);
  assert.equal(waiting.days, waiting.before, "the run ending yesterday still stands");
  assert.equal(waiting.days, 11);
  assert.equal(stateOn(waiting, TODAY), "today");
  assert.equal(showsAtRisk(waiting, STREAK_AT_RISK_FROM - 1), false, "15:29: not yet");
  assert.equal(showsAtRisk(waiting, STREAK_AT_RISK_FROM), true, "15:30: the hourglass");
  assert.equal(STREAK_AT_RISK_FROM, 15 * 60 + 30);
  const done = streak({ waiting: 0, judged: tally({ [TODAY]: { onTime: 3, bad: 0 } }) });
  assert.equal(done.todayKept, true);
  assert.equal(done.days, 12);
  assert.equal(showsAtRisk(done, 17 * 60), false, "kept: nothing at risk");
  // Nothing to lose: no streak before today, so nothing is at risk.
  const nothingBefore = streak({ waiting: 1, signIns: signedIn([TODAY]) });
  assert.equal(nothingBefore.before, 0);
  assert.equal(nothingBefore.todayAtRisk, false);
  // Not signed in today (the server's view, or a phone that has not come in): at risk with nothing waiting.
  const notIn = streak({ waiting: 0, signIns: signedIn(WORKING, WORKING[0]) });
  assert.equal(notIn.todayKept, false);
  assert.equal(notIn.todayAtRisk, true);
});

test("today closed: nothing at risk, nothing kept, the streak waits for the next working day", () => {
  const thursday = judgeStreak({ today: "2026-10-15", judged: new Map(), waiting: 0, signIns: signedIn(["2026-10-12", "2026-10-13", "2026-10-14"]), isClosedDay: CLOSED, countedFrom: "2026-10-01" });
  assert.equal(thursday.todayIsWorking, false);
  assert.equal(thursday.todayKept, false);
  assert.equal(thursday.todayAtRisk, false);
  assert.equal(thursday.days, 3);
  assert.equal(thursday.lastDays[STREAK_STRIP_DAYS - 1].state, "closed");
  assert.equal(thursday.nextWorkingDay, "2026-10-16");
});

test("where the sign-ins are not known, a day is judged by its records alone: on time keeps, late breaks, nothing due neither", () => {
  const judged = tally({
    "2026-10-18": { onTime: 1, bad: 1 },
    "2026-10-21": { onTime: 2, bad: 0 },
    "2026-10-23": { onTime: 1, bad: 0 },
    "2026-10-25": { onTime: 4, bad: 0 },
  });
  const r = streak({ signIns: null, judged });
  assert.equal(r.signInsKnown, false);
  assert.equal(r.before, 3, "the 21st, 23rd and 25th; the 22nd and 24th had nothing due; the 18th was late");
  assert.equal(r.todayKept, false, "nothing of theirs due today: a free day, not a kept one");
  assert.equal(r.todayAtRisk, false, "and nothing to lose by it");
  assert.equal(stateOn(r, "2026-10-24"), "free");
  assert.equal(stateOn(r, "2026-10-18"), "missed");
  const doneToday = streak({ signIns: null, judged: new Map([...judged, [TODAY, { onTime: 1, bad: 0 }]]) });
  assert.equal(doneToday.todayKept, true, "something due today, all in on time");
  assert.equal(doneToday.days, 4);
  const waitingToday = streak({ signIns: null, judged, waiting: 1 });
  assert.equal(waitingToday.todayAtRisk, true, "something still waiting today would break it");
  // A list with nobody's first sign-in on record and nobody signed in now is not known either.
  assert.equal(streak({ signIns: { days: new Set(), from: null }, judged }).before, 3);
});

test("days before the first sign-in on record are judged by the records alone; from it on, a day without one breaks", () => {
  const judged = tally({ "2026-10-18": { onTime: 1, bad: 1 }, "2026-10-21": { onTime: 1, bad: 0 } });
  const r = streak({ judged, signIns: signedIn(["2026-10-23", "2026-10-24", "2026-10-25", TODAY], "2026-10-23") });
  // 25, 24, 23 signed in; 22 before the first sign-in, nothing due (free); 21 on time; 18 late.
  assert.equal(r.before, 4);
  assert.equal(r.days, 5);
  assert.equal(stateOn(r, "2026-10-22"), "free");
  const gap = streak({ judged, signIns: signedIn(["2026-10-23", "2026-10-25", TODAY], "2026-10-23") });
  assert.equal(gap.before, 1, "the 24th is after the first sign-in on record, with none: missed");
});

test("the best run: the longest of the walk, today's own included", () => {
  const r = streak({ signIns: signedIn([...WORKING, TODAY].filter((d) => d !== "2026-10-21")) });
  assert.equal(r.days, 5, "the 22nd to today");
  assert.equal(r.best, 6, "the 12th to the 18th: six working days");
  const longer = streak({ signIns: signedIn([...WORKING, TODAY].filter((d) => d !== "2026-10-13")) });
  assert.equal(longer.days, 10);
  assert.equal(longer.best, 10, "today's run is the best");
});

test("the next working day steps over the weekly off and the festivals, and stops at an adjustment Thursday", () => {
  const next = (today: string) => judgeStreak({ today, judged: new Map(), waiting: 0, signIns: null, isClosedDay: CLOSED }).nextWorkingDay;
  assert.equal(next("2026-10-14"), "2026-10-16", "Thursday the 15th is off");
  assert.equal(next("2026-10-18"), "2026-10-21", "the 19th and 20th are festivals");
  assert.equal(next("2026-10-21"), "2026-10-22", "the 22nd is an adjustment Thursday");
  assert.equal(next("2026-10-25"), TODAY);
});

test("the sign-ins as the rule reads them: today joins while signed in now; the first on record is the earliest; anything else is dropped", () => {
  const s = streakSignIns(["2026-10-20", "not a day", 5, "2026-10-21", "2026-10-21"], "2026-10-09", TODAY, true);
  assert.deepEqual([...s.days].sort(), ["2026-10-20", "2026-10-21", TODAY]);
  assert.equal(s.from, "2026-10-09");
  const first = streakSignIns([], null, TODAY, true);
  assert.deepEqual([...first.days], [TODAY]);
  assert.equal(first.from, TODAY, "a first sign-in ever is today's");
  const none = streakSignIns([], "garbage", TODAY, false);
  assert.equal(none.days.size, 0);
  assert.equal(none.from, null, "nothing on record: not known");
});

test("a hundred working days in a row with today is the 100-day milestone; the walk counts back at most 100 working days", () => {
  assert.deepEqual(STREAK_MILESTONES, [3, 5, 10, 20, 50, 100]);
  assert.ok(isStreakMilestone(100) && isStreakMilestone(3) && !isStreakMilestone(99));
  const closed = plantClosedDays({});
  // Every working day back from yesterday, and the day the 99th of them falls on.
  const days: string[] = [];
  let cursor = addDaysISO(TODAY, -1);
  while (days.length < 99) {
    if (!closed(cursor)) days.push(cursor);
    cursor = addDaysISO(cursor, -1);
  }
  const ninetyNinth = days[days.length - 1];
  const hundred = judgeStreak({ today: TODAY, judged: new Map(), waiting: 0, signIns: signedIn([...days, TODAY]), isClosedDay: closed, countedFrom: ninetyNinth });
  assert.equal(hundred.before, 99);
  assert.equal(hundred.days, 100);
  assert.ok(isStreakMilestone(hundred.days));
  // Signed in for longer than the walk reaches: it counts back STREAK_WORKING_DAYS working days and stops.
  const all: string[] = [];
  for (let i = 1; i <= STREAK_LOOKBACK_DAYS + 40; i++) all.push(addDaysISO(TODAY, -i));
  const capped = judgeStreak({ today: TODAY, judged: new Map(), waiting: 0, signIns: signedIn([...all, TODAY]), isClosedDay: closed, countedFrom: null });
  assert.equal(capped.before, STREAK_WORKING_DAYS);
  assert.equal(capped.days, STREAK_WORKING_DAYS + 1);
});

test("the look-back covers a hundred working days with a whole festival season between them", () => {
  // Thursdays off and fifteen festival days in the stretch: 100 working days still fit in the records read.
  const festivals = Array.from({ length: 15 }, (_, i) => ({ date: addDaysISO(TODAY, -10 - i) }));
  const closed = plantClosedDays({ holidays: festivals });
  let working = 0;
  let cursor = addDaysISO(TODAY, -1);
  let back = 1;
  while (working < STREAK_WORKING_DAYS) {
    if (!closed(cursor)) working += 1;
    cursor = addDaysISO(cursor, -1);
    back += 1;
  }
  assert.ok(back <= STREAK_LOOKBACK_DAYS, `100 working days took ${back} calendar days, more than the ${STREAK_LOOKBACK_DAYS} read`);
});
