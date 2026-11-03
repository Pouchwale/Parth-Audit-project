// THE PLANT'S WORKING HOURS AND ITS CALENDAR (REQUIREMENTS §84) —
// engine/workingHoursCore.ts, the one rule the server's gate and the browser run.
//
//   * the calendar: every day of 2026 (and 2027) read by the rule exactly as
//     engine/holidays.ts reads it — the same open or closed, the same kind, the
//     same festival name — and as engine/latenessCore.ts plantClosedDays, which
//     the server's escalation reads; on the seeded leave calendar and on one
//     built to catch a wrong weekly off, a festival on the weekly off and an
//     adjustment day missed;
//   * the edges of the day: 08:39 and 08:39:59 closed, 08:40 open, 18:19:59
//     open, 18:20 closed — on the FACTORY's clock, whatever this computer's;
//   * an adjustment Thursday open, a plain Thursday and a festival closed;
//   * the next opening across the weekly off and a festival (Thursday 3 and
//     Friday 4 September), across the Diwali run (five closed days, the weekly
//     off inside it) and across the new year;
//   * the owner's own sentences, word for word — since 6-Oct-2026 the STAFF's
//     hours, with the super admin free to sign in at any time, and never
//     "DCRS is open" or "it opens again" (§84 addendum) — in English and in
//     Gujarati, and the Gujarati rebuilt from the server's answer alone;
//   * the super admin's sign-in in the day's last ten minutes runs to the
//     midnight after;
//   * the hours from Master Data (and the standard ones when they do not make a
//     day), when a session ends, and the moments in a zone with summer time.
//
// "Now" is always a moment written here, never the clock.
import test from "node:test";
import assert from "node:assert/strict";
import type { MasterData } from "../src/types";
import { SEED_MASTER_DATA } from "../src/data/seed/masterData";
import { dayInfo, isCompanyHoliday } from "../src/engine/holidays";
import { plantClosedDays } from "../src/engine/latenessCore";
import {
  addDaysISO,
  clockWords,
  clockWordsIn,
  DEFAULT_WORKING_HOURS,
  hoursProblem,
  hoursSentence,
  hoursWordsIn,
  LATE_SIGN_IN_MS,
  nextMidnight,
  OUTSIDE_HOURS_CODE,
  outsideHoursRefusal,
  personHours,
  plantDay,
  plantNow,
  publicHours,
  refusalMessage,
  sessionEndsAt,
  staffHoursSentence,
  superAdminHoursLine,
  todaySentence,
  wallClock,
  workingHoursOf,
  zonedMoment,
} from "../src/engine/workingHoursCore";

const IST = "Asia/Kolkata";
const SEED = SEED_MASTER_DATA;

/** A moment on the factory's clock in India (UTC+5:30, no summer time): "2026-09-30", 8, 40 → 03:10 UTC. */
function ist(date: string, h: number, m: number, s = 0): Date {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, m, s) - (5 * 60 + 30) * 60 * 1000);
}

function everyDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysISO(d, 1)) out.push(d);
  return out;
}

const DAYS_2026 = everyDay("2026-01-01", "2026-12-31");

// ---------------------------------------------------------------------------

test("every day of 2026 is open or closed exactly as engine/holidays.ts and plantClosedDays say, with the same kind and name", () => {
  assert.equal(DAYS_2026.length, 365);
  const closedByServer = plantClosedDays(SEED);
  let open = 0;
  for (const d of DAYS_2026) {
    const rule = plantDay(d, SEED);
    const app = dayInfo(d, SEED);
    assert.equal(rule.open, !isCompanyHoliday(d, SEED), d);
    assert.equal(rule.open, !closedByServer(d), d);
    assert.equal(rule.kind, app.kind, d);
    assert.equal(rule.weekday, app.weekday, d);
    if (app.kind === "holiday" || app.kind === "adjustment") assert.equal(rule.name, app.name ?? null, d);
    if (rule.open) open += 1;
  }
  // 52 Thursdays (+1: 2026 starts on a Thursday, so 53), 13 festivals of which 12-Nov is a Thursday, 5 adjustment days
  // (20-Nov-2026 is a Friday that was already a working day, as printed on the notice — REQUIREMENTS §16).
  const thursdays = DAYS_2026.filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 4).length;
  assert.equal(thursdays, 53);
  assert.equal(open, 365 - 53 - 12 + 4);
});

test("2027 agrees too (no festivals loaded yet: every Thursday closed, nothing else)", () => {
  const closedByServer = plantClosedDays(SEED);
  for (const d of everyDay("2027-01-01", "2027-12-31")) {
    const rule = plantDay(d, SEED);
    assert.equal(rule.open, !isCompanyHoliday(d, SEED), d);
    assert.equal(rule.open, !closedByServer(d), d);
    assert.equal(rule.kind, dayInfo(d, SEED).kind, d);
  }
});

test("a calendar built to catch mistakes: Sunday off, a festival on the weekly off, a Sunday worked, a date that is both", () => {
  const master = {
    ...SEED,
    weeklyOffDay: 0,
    holidays: [
      { id: "h1", date: "2026-10-04", name: "Festival on a Sunday" },
      { id: "h2", date: "2026-10-07", name: "Midweek Festival" },
      { id: "h3", date: "2026-10-18", name: "Both" },
    ],
    adjustmentDays: [
      { id: "a1", date: "2026-10-11", forHoliday: "Midweek Festival" },
      { id: "a2", date: "2026-10-18", forHoliday: "Listed twice" },
    ],
  } as MasterData;
  const closedByServer = plantClosedDays(master);
  for (const d of everyDay("2026-09-01", "2026-11-30")) {
    const rule = plantDay(d, master);
    assert.equal(rule.open, !isCompanyHoliday(d, master), d);
    assert.equal(rule.open, !closedByServer(d), d);
    assert.equal(rule.kind, dayInfo(d, master).kind, d);
  }
  assert.equal(plantDay("2026-10-01", master).open, true, "a Thursday is a working day when the weekly off is Sunday");
  assert.equal(plantDay("2026-10-11", master).kind, "adjustment");
  assert.equal(plantDay("2026-10-18", master).kind, "holiday", "a festival closes the day even when it is also listed as an adjustment day");
  assert.equal(plantDay("2026-10-25", master).kind, "weekly-off");
});

test("the edges of the day, on the factory's clock: 08:39 closed, 08:40 open, 18:19 open, 18:20 closed", () => {
  const day = "2026-09-30"; // a Wednesday, a working day
  const at = (h: number, m: number, s = 0) => plantNow(SEED, ist(day, h, m, s), IST);
  assert.equal(at(8, 39).phase, "before-opening");
  assert.equal(at(8, 39, 59).phase, "before-opening");
  assert.equal(at(8, 40).phase, "open");
  assert.equal(at(8, 40).open, true);
  assert.equal(at(12, 0).phase, "open");
  assert.equal(at(18, 19).phase, "open");
  assert.equal(at(18, 19, 59).phase, "open");
  assert.equal(at(18, 20).phase, "after-closing");
  assert.equal(at(18, 20).open, false);
  assert.equal(at(23, 59, 59).phase, "after-closing");
  assert.equal(at(0, 0).phase, "before-opening");

  // Before the opening, the opening is today's; while open there is none; the close is today's END.
  assert.equal(at(8, 39).opensAt?.toISOString(), "2026-09-30T03:10:00.000Z");
  assert.equal(at(8, 39).closesAt?.toISOString(), "2026-09-30T12:50:00.000Z");
  assert.equal(at(12, 0).opensAt, null);
  assert.equal(at(12, 0).closesAt?.toISOString(), "2026-09-30T12:50:00.000Z");
  assert.equal(at(18, 20).closesAt, null);
});

test("the factory's clock, not this computer's: the same moment is after hours in India and open in a plant on UTC", () => {
  const moment = new Date("2026-09-30T13:00:00.000Z"); // 18:30 in India, 13:00 in London's winter-less UTC
  assert.equal(plantNow(SEED, moment, IST).phase, "after-closing");
  assert.equal(plantNow(SEED, moment, "UTC").phase, "open");
  assert.deepEqual(wallClock(moment, IST), { date: "2026-09-30", secondOfDay: 18 * 3600 + 30 * 60 });
  // A zone the runtime does not know is read as the plant's own.
  assert.equal(plantNow(SEED, moment, "Not/AZone").timeZone, IST);
  assert.equal(plantNow(SEED, moment, "Not/AZone").phase, "after-closing");
  // Just after the factory's midnight it is already the next day there — a Thursday, the weekly off.
  const past = new Date("2026-09-30T18:45:00.000Z"); // 00:15 on 1 October in India, still 30 September in UTC
  assert.equal(plantNow(SEED, past, IST).today.date, "2026-10-01");
  assert.equal(plantNow(SEED, past, IST).phase, "closed-day");
});

test("an adjustment Thursday is open; a plain Thursday is the weekly off", () => {
  const adj = plantNow(SEED, ist("2026-10-22", 10, 0), IST);
  assert.equal(adj.today.kind, "adjustment");
  assert.equal(adj.phase, "open");
  assert.equal(adj.today.name, "Navratri Navam (20-10-2026)");
  assert.equal(todaySentence(adj), "Today is Thursday, an adjustment day for Navratri Navam (20-10-2026), so the plant works — staff hours run until 6:20 pm.");
  for (const d of ["2026-01-22", "2026-08-06", "2026-11-05"]) assert.equal(plantNow(SEED, ist(d, 10, 0), IST).open, true, d);

  const plain = plantNow(SEED, ist("2026-10-15", 10, 0), IST);
  assert.equal(plain.today.kind, "weekly-off");
  assert.equal(plain.phase, "closed-day");
  assert.equal(plain.opensAt?.toISOString(), "2026-10-16T03:10:00.000Z");
});

test("the owner's own sentences, word for word: the staff's hours, on Thursday 1 October 2026 and after the close on 6 October", () => {
  const thursday = plantNow(SEED, ist("2026-10-01", 10, 0), IST);
  // Staff refused: their hours, then when they start again — nothing about DCRS opening or closing.
  assert.equal(refusalMessage(thursday), "Staff working hours: 8:40 am to 6:20 pm on working days. Today is Thursday, the weekly off; staff hours start again on Friday 2 October at 8:40 am.");
  // The sign-in page, before anybody is known (the owner, 6-Oct-2026, 21:30): the staff's hours and the super admin's freedom, first.
  const tuesday = plantNow(SEED, ist("2026-10-06", 21, 30), IST);
  assert.equal(hoursSentence(tuesday.hours), "Staff working hours: 8:40 am to 6:20 pm on working days. The super admin can sign in at any time.");
  assert.equal(todaySentence(tuesday), "Today's staff hours ended at 6:20 pm; they start again on Wednesday 7 October at 8:40 am.");
  assert.equal(staffHoursSentence(tuesday.hours), "Staff working hours: 8:40 am to 6:20 pm on working days.");
  for (const s of [thursday, tuesday]) {
    for (const words of [refusalMessage(s), hoursSentence(s.hours), todaySentence(s)]) {
      assert.doesNotMatch(words, /DCRS is open|opens again|DCRS is closed|DCRS closes|not open yet/, words);
    }
  }
  const refusal = outsideHoursRefusal(thursday);
  assert.equal(refusal.code, OUTSIDE_HOURS_CODE);
  assert.equal(refusal.code, "outside-working-hours");
  assert.equal(refusal.opensAt, "2026-10-02T03:10:00.000Z");
  assert.equal(refusal.error, refusalMessage(thursday));
});

test("a festival is closed, whatever the weekday, and says which festival", () => {
  const janmashtami = plantNow(SEED, ist("2026-09-04", 10, 0), IST); // a Friday
  assert.equal(janmashtami.phase, "closed-day");
  assert.equal(janmashtami.today.kind, "holiday");
  assert.equal(janmashtami.today.name, "Janmashtami");
  assert.equal(todaySentence(janmashtami), "Today is Janmashtami, a company holiday; staff hours start again on Saturday 5 September at 8:40 am.");
  assert.equal(plantNow(SEED, ist("2026-01-26", 9, 0), IST).today.name, "Republic Day");
});

test("the next opening across a run of closed days: the weekly off and a festival, the Diwali run, the new year", () => {
  // Wednesday 2 September after the close: Thursday 3 is the weekly off, Friday 4 Janmashtami — Saturday 5 at 08:40.
  const beforeJanmashtami = plantNow(SEED, ist("2026-09-02", 18, 30), IST);
  assert.equal(beforeJanmashtami.phase, "after-closing");
  assert.equal(beforeJanmashtami.opensAt?.toISOString(), "2026-09-05T03:10:00.000Z");
  assert.equal(todaySentence(beforeJanmashtami), "Today's staff hours ended at 6:20 pm; they start again on Saturday 5 September at 8:40 am.");

  // Sunday 8 November after the close: New Year (Mon 9), Bhai Dooj (Tue 10), Padtar Diwas (Wed 11, Thu 12 — the weekly
  // off too — and Fri 13): open again on Saturday 14 November.
  const diwali = plantNow(SEED, ist("2026-11-08", 19, 0), IST);
  assert.equal(diwali.opensAt?.toISOString(), "2026-11-14T03:10:00.000Z");
  assert.equal(diwali.opensOn?.date, "2026-11-14");
  for (const d of ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]) {
    const s = plantNow(SEED, ist(d, 11, 0), IST);
    assert.equal(s.phase, "closed-day", d);
    assert.equal(s.opensAt?.toISOString(), "2026-11-14T03:10:00.000Z", d);
  }

  // Thursday 31 December 2026, the weekly off: Friday 1 January 2027, the year said because it is another year.
  const newYear = plantNow(SEED, ist("2026-12-31", 12, 0), IST);
  assert.equal(newYear.opensAt?.toISOString(), "2027-01-01T03:10:00.000Z");
  assert.equal(todaySentence(newYear), "Today is Thursday, the weekly off; staff hours start again on Friday 1 January 2027 at 8:40 am.");
});

test("a calendar with no working day in the year ahead says so and gives no opening", () => {
  const closedAlways = { holidays: everyDay("2026-09-30", "2027-12-31").map((d, i) => ({ id: `x${i}`, date: d, name: "Shut" })) };
  const s = plantNow(closedAlways, ist("2026-09-30", 10, 0), IST);
  assert.equal(s.phase, "closed-day");
  assert.equal(s.opensAt, null);
  assert.equal(outsideHoursRefusal(s).opensAt, null);
  assert.match(todaySentence(s), /no working day in the year ahead/);
});

test("the hours come from Master Data; hours that do not make a day are the standard 08:40 to 18:20", () => {
  assert.deepEqual(DEFAULT_WORKING_HOURS, { start: "08:40", end: "18:20" });
  assert.deepEqual(SEED.workingHours, { start: "08:40", end: "18:20" });
  const custom = workingHoursOf({ workingHours: { start: "9:00", end: "17:30" } });
  assert.deepEqual([custom.start, custom.end, custom.startMinute, custom.endMinute, custom.isDefault], ["09:00", "17:30", 540, 1050, false]);
  const withCustom = { ...SEED, workingHours: { start: "09:00", end: "17:30" } };
  assert.equal(plantNow(withCustom, ist("2026-09-30", 8, 59), IST).phase, "before-opening");
  assert.equal(plantNow(withCustom, ist("2026-09-30", 9, 0), IST).phase, "open");
  assert.equal(plantNow(withCustom, ist("2026-09-30", 17, 30), IST).phase, "after-closing");
  assert.equal(refusalMessage(plantNow(withCustom, ist("2026-09-30", 18, 0), IST)), "Staff working hours: 9:00 am to 5:30 pm on working days. Today's staff hours ended at 5:30 pm; they start again on Friday 2 October at 9:00 am.");
  assert.equal(todaySentence(plantNow(withCustom, ist("2026-09-30", 8, 0), IST)), "Today is a working day. Staff hours start today at 9:00 am.");
  assert.equal(todaySentence(plantNow(withCustom, ist("2026-09-30", 12, 0), IST)), "Today is a working day — staff hours run until 5:30 pm.");

  for (const bad of [undefined, null, {}, { start: "25:00", end: "18:20" }, { start: "18:20", end: "08:40" }, { start: "08:40", end: "08:40" }, { start: 840, end: 1820 }, { start: "8.40", end: "18.20" }]) {
    const h = workingHoursOf({ workingHours: bad as never });
    assert.deepEqual([h.start, h.end, h.isDefault], ["08:40", "18:20", true], JSON.stringify(bad));
  }
  assert.equal(hoursProblem("08:40", "18:20"), null);
  assert.match(hoursProblem("", "18:20") ?? "", /opens/);
  assert.match(hoursProblem("08:40", "") ?? "", /closes/);
  assert.match(hoursProblem("18:00", "09:00") ?? "", /after it opens/);
});

test("times said the way the plant says them", () => {
  assert.equal(clockWords(8 * 60 + 40), "8:40 am");
  assert.equal(clockWords(18 * 60 + 20), "6:20 pm");
  assert.equal(clockWords(12 * 60), "12:00 pm");
  assert.equal(clockWords(0), "12:00 am");
  assert.equal(clockWords(9 * 60 + 5), "9:05 am");
});

test("a session ends at END of its working day for staff, at the factory's midnight for the super admin and when the hours are off", () => {
  const morning = plantNow(SEED, ist("2026-09-30", 10, 0), IST);
  assert.equal(sessionEndsAt({ admin: false, enforced: true, state: morning }).toISOString(), "2026-09-30T12:50:00.000Z");
  assert.equal(sessionEndsAt({ admin: true, enforced: true, state: morning }).toISOString(), "2026-09-30T18:30:00.000Z");
  assert.equal(sessionEndsAt({ admin: false, enforced: false, state: morning }).toISOString(), "2026-09-30T18:30:00.000Z");
  // Outside the hours staff get no session at all; the super admin's still runs to midnight.
  const thursday = plantNow(SEED, ist("2026-10-01", 10, 0), IST);
  assert.equal(sessionEndsAt({ admin: false, enforced: true, state: thursday }).getTime(), thursday.now.getTime());
  assert.equal(sessionEndsAt({ admin: true, enforced: true, state: thursday }).toISOString(), "2026-10-01T18:30:00.000Z");
  assert.equal(nextMidnight(ist("2026-12-31", 23, 59), IST).toISOString(), "2026-12-31T18:30:00.000Z");
});

test("the super admin's sign-in in the day's last ten minutes runs to the midnight after — never a session of a minute", () => {
  assert.equal(LATE_SIGN_IN_MS, 10 * 60 * 1000);
  const ends = (h: number, m: number, s = 0, admin = true, enforced = true) => sessionEndsAt({ admin, enforced, state: plantNow(SEED, ist("2026-10-07", h, m, s), IST) }).toISOString();
  // Up to 23:49:59 his session ends at tonight's midnight (18:30 UTC on 7 October)…
  assert.equal(ends(23, 49, 59), "2026-10-07T18:30:00.000Z");
  assert.equal(ends(18, 20), "2026-10-07T18:30:00.000Z");
  // …from 23:50 it runs to the next one, the end of Thursday 8 October.
  assert.equal(ends(23, 50), "2026-10-08T18:30:00.000Z");
  assert.equal(ends(23, 59, 30), "2026-10-08T18:30:00.000Z");
  assert.equal(ends(23, 59, 59), "2026-10-08T18:30:00.000Z");
  // From midnight a new day's session is a whole day again.
  assert.equal(ends(0, 0, 1), "2026-10-07T18:30:00.000Z");
  // Nobody else's session changes: staff outside the hours get none; with the hours off everybody's runs to tonight's midnight.
  assert.equal(ends(23, 55, 0, false, true), ist("2026-10-07", 23, 55).toISOString());
  assert.equal(ends(23, 55, 0, false, false), "2026-10-07T18:30:00.000Z");
  // Every session still ends at a midnight, so he signs in each day: never more than a day and ten minutes.
  for (let minute = 0; minute < 24 * 60; minute += 7) {
    const now = ist("2026-10-07", Math.floor(minute / 60), minute % 60);
    const end = sessionEndsAt({ admin: true, enforced: true, state: plantNow(SEED, now, IST) });
    assert.equal(wallClock(end, IST).secondOfDay, 0, String(minute));
    const left = end.getTime() - now.getTime();
    assert.ok(left > LATE_SIGN_IN_MS && left <= 24 * 3600 * 1000 + LATE_SIGN_IN_MS, `${minute}: ${left}`);
  }
});

test("a factory time is the right moment on every day of 2026, and in a zone with summer time", () => {
  for (const d of DAYS_2026) {
    const at = zonedMoment(d, 8 * 60 + 40, IST);
    assert.deepEqual(wallClock(at, IST), { date: d, secondOfDay: (8 * 60 + 40) * 60 }, d);
  }
  const london = "Europe/London";
  for (const d of ["2026-03-28", "2026-03-29", "2026-03-30", "2026-10-24", "2026-10-25", "2026-10-26", "2026-07-01", "2026-12-01"]) {
    const at = zonedMoment(d, 8 * 60 + 40, london);
    assert.deepEqual(wallClock(at, london), { date: d, secondOfDay: (8 * 60 + 40) * 60 }, d);
  }
  assert.equal(zonedMoment("2026-07-01", 8 * 60 + 40, london).toISOString(), "2026-07-01T07:40:00.000Z");
  assert.equal(zonedMoment("2026-12-01", 8 * 60 + 40, london).toISOString(), "2026-12-01T08:40:00.000Z");
});

test("the public answer says the staff's hours and today in words, and nothing about anybody", () => {
  const answer = publicHours(plantNow(SEED, ist("2026-10-01", 10, 0), IST), true);
  assert.deepEqual(Object.keys(answer).sort(), ["closesAt", "end", "enforced", "hoursText", "now", "openNow", "opensAt", "phase", "start", "timeZone", "today", "todayText"]);
  assert.equal(answer.hoursText, "Staff working hours: 8:40 am to 6:20 pm on working days. The super admin can sign in at any time.");
  assert.equal(answer.todayText, "Today is Thursday, the weekly off; staff hours start again on Friday 2 October at 8:40 am.");
  assert.equal(answer.openNow, false);
  assert.equal(answer.opensAt, "2026-10-02T03:10:00.000Z");
  assert.deepEqual(answer.today, { date: "2026-10-01", weekday: "Thursday", kind: "weekly-off", name: null });
  assert.equal(publicHours(plantNow(SEED, ist("2026-10-02", 9, 0), IST), false).enforced, false);
});

test("a signed-in person's answer: the super admin is told the hours are the staff's and that he can keep working; staff are not told anything new", () => {
  const closed = plantNow(SEED, ist("2026-10-07", 21, 0), IST);
  const admin = personHours(closed, true, { admin: true });
  assert.equal(admin.heldToHours, false);
  assert.equal(admin.forYou, "You are the super admin: these are the staff's hours, and you can keep working at any time.");
  assert.equal(admin.hoursText, "Staff working hours: 8:40 am to 6:20 pm on working days. The super admin can sign in at any time.");
  assert.equal(admin.todayText, "Today's staff hours ended at 6:20 pm; they start again on Friday 9 October at 8:40 am.");
  const staff = personHours(plantNow(SEED, ist("2026-10-07", 10, 0), IST), true, { admin: false });
  assert.equal(staff.heldToHours, true);
  assert.equal(staff.forYou, null);
  assert.equal(personHours(closed, false, { admin: false }).heldToHours, false, "a server that holds nobody to the hours holds staff to none");
  // Everything else is the public answer, word for word.
  const { heldToHours: _h, forYou: _f, ...rest } = admin;
  assert.deepEqual(rest, publicHours(closed, true));
});

/** Moments that reach every sentence: open, before the opening, after the close (and across the year's end), the weekly off, a festival, an adjustment day, a calendar with no working day ahead. */
function everyKindOfMoment() {
  const closedAlways = { holidays: everyDay("2026-09-30", "2027-12-31").map((d, i) => ({ id: `x${i}`, date: d, name: "Shut" })) };
  return [
    plantNow(SEED, ist("2026-10-07", 10, 0), IST),
    plantNow(SEED, ist("2026-10-07", 6, 30), IST),
    plantNow(SEED, ist("2026-10-07", 21, 30), IST),
    plantNow(SEED, ist("2026-12-30", 19, 0), IST),
    plantNow(SEED, ist("2026-10-01", 10, 0), IST),
    plantNow(SEED, ist("2026-09-04", 10, 0), IST),
    plantNow(SEED, ist("2026-10-22", 10, 0), IST),
    plantNow(SEED, ist("2026-10-22", 7, 0), IST),
    plantNow({ ...SEED, workingHours: { start: "07:05", end: "15:45" } }, ist("2026-10-07", 16, 0), IST),
    plantNow(closedAlways, ist("2026-09-30", 10, 0), IST),
  ];
}

test("the hours in Gujarati, for the app's own Gujarati screens: the same sentences from the same parts", () => {
  const tuesday = plantNow(SEED, ist("2026-10-06", 21, 30), IST);
  assert.equal(hoursSentence(tuesday.hours, "gu"), "સ્ટાફના કામના કલાકો: કામકાજના દિવસોમાં સવારે 8:40 થી સાંજે 6:20. સુપર એડમિન કોઈપણ સમયે સાઇન ઇન કરી શકે છે.");
  assert.equal(todaySentence(tuesday, "gu"), "આજના સ્ટાફના કલાકો સાંજે 6:20 વાગ્યે પૂરા થયા; તે ફરી બુધવાર, 7 ઑક્ટોબરના રોજ સવારે 8:40 વાગ્યે શરૂ થશે.");
  assert.equal(todaySentence(plantNow(SEED, ist("2026-10-01", 10, 0), IST), "gu"), "આજે ગુરુવાર છે, સાપ્તાહિક રજા; સ્ટાફના કલાકો ફરી શુક્રવાર, 2 ઑક્ટોબરના રોજ સવારે 8:40 વાગ્યે શરૂ થશે.");
  assert.equal(todaySentence(plantNow(SEED, ist("2026-10-07", 10, 0), IST), "gu"), "આજે કામકાજનો દિવસ છે — સ્ટાફના કલાકો સાંજે 6:20 સુધી છે.");
  assert.equal(todaySentence(plantNow(SEED, ist("2026-10-07", 7, 0), IST), "gu"), "આજે કામકાજનો દિવસ છે. સ્ટાફના કલાકો આજે સવારે 8:40 વાગ્યે શરૂ થશે.");
  assert.equal(superAdminHoursLine("gu"), "તમે સુપર એડમિન છો: આ સ્ટાફના કલાકો છે, અને તમે કોઈપણ સમયે કામ ચાલુ રાખી શકો છો.");
  assert.equal(clockWordsIn(0, "gu"), "રાત્રે 12:00");
  assert.equal(clockWordsIn(12 * 60, "gu"), "બપોરે 12:00");
  assert.equal(clockWordsIn(16 * 60 + 5, "gu"), "સાંજે 4:05");
  assert.equal(clockWordsIn(21 * 60, "gu"), "રાત્રે 9:00");
  for (const s of everyKindOfMoment()) {
    const gu = `${hoursSentence(s.hours, "gu")} ${todaySentence(s, "gu")}`;
    assert.doesNotMatch(gu, /[A-Za-z]/.test(s.today.name ?? "") ? /\b(am|pm|today|staff)\b/i : /[A-Za-z]/, gu);
  }
});

test("a screen rebuilds the server's words from its answer alone: English exactly as the server said them, Gujarati from the same parts", () => {
  for (const s of everyKindOfMoment()) {
    const answer = publicHours(s, true);
    // Through JSON, as the browser has it.
    const received = JSON.parse(JSON.stringify(answer));
    assert.deepEqual(hoursWordsIn(received, "en"), { hoursText: answer.hoursText, todayText: answer.todayText });
    assert.deepEqual(hoursWordsIn(received, "gu"), { hoursText: hoursSentence(s.hours, "gu"), todayText: todaySentence(s, "gu") }, s.now.toISOString());
  }
});

test("no sentence the hours make says DCRS itself opens or closes, in either language (the owner, 6-Oct-2026)", () => {
  for (const s of everyKindOfMoment()) {
    for (const words of [hoursSentence(s.hours), todaySentence(s), refusalMessage(s), superAdminHoursLine()]) {
      assert.doesNotMatch(words, /DCRS is open|opens again|it opens|DCRS is closed|DCRS closes|not open yet|open now/, words);
      assert.match(words, /[Ss]taff|super admin|Today is/, words);
    }
  }
});
