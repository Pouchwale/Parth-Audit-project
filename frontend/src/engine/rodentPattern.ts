import type { RodentCatch } from "../types";
import {
  RODENT_CAKE_BITING_ALONE_P,
  RODENT_CAKE_BITING_P,
  RODENT_CATCHES_PER_YEAR,
  RODENT_DEAD_P,
  RODENT_LOCATIONS,
  RODENT_MONTH_WEIGHT,
} from "../data/seed/pestPattern";
import { makeRng, type Rng } from "../utils/random";
import { generateId } from "../utils/id";

// What the rodent side of a given day's Daily Pest Control Monitoring Record
// looks like, from the generated pattern (tools/pest_pattern.py). Seeded
// by the calendar date, so the same day always gets the same answer — the
// assistant's pre-fill, Demo Mode and a re-run "Fill again" all agree, and
// an auditor reading a month sees one consistent story: mostly quiet days,
// the odd catch (location + how many), a bait-biting sign now and then.
//
// THE YEAR IS PLANNED, NOT ROLLED DAY BY DAY. The department states its own
// figure — three to four rodents a year, in three or four different months
// (13-Sep-2026) — and that is a statement about the year, which a per-day
// probability cannot hold: at the rate that averages three and a half a year,
// the seeded draws gave 4, 2, 1, 1 and 5 across 2024-2028, because the
// variance of a few rare independent events is as large as the events. So a
// year's catches are drawn once, from the year alone, and each is placed on a
// date chosen by the monsoon-leaning month weighting; every other day of that
// year is quiet. The total is then exactly what the department said while the
// seasonal shape is kept, and the answer for any one date is still a pure
// function of that date. REQUIREMENTS §45.
export interface RodentDayEvent {
  catches: RodentCatch[]; // checkpoint 7 = Yes when non-empty
  deadRodentLocation: string | null; // checkpoint 8
  cakeBitingBoxNo: string | null; // checkpoint 9
}

function pickLocation(rng: Rng, exclude?: string) {
  const pool = RODENT_LOCATIONS.filter((l) => l.area !== exclude);
  const total = pool.reduce((s, l) => s + l.weight, 0);
  let x = rng.next() * total;
  for (const l of pool) {
    x -= l.weight;
    if (x <= 0) return l;
  }
  return pool[pool.length - 1];
}

function boxNo(n: number): string {
  return `RB-${String(n).padStart(2, "0")}`;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysIn = (year: number, month: number) => (month === 1 && leap(year) ? 29 : DAYS_IN_MONTH[month]);
const pad2 = (n: number) => String(n).padStart(2, "0");

/** A month for one catch, drawn from the seasonal weighting. */
function pickMonth(rng: Rng): number {
  const total = RODENT_MONTH_WEIGHT.reduce((s, w) => s + w, 0);
  let x = rng.next() * total;
  for (let m = 0; m < RODENT_MONTH_WEIGHT.length; m++) {
    x -= RODENT_MONTH_WEIGHT[m];
    if (x <= 0) return m;
  }
  return RODENT_MONTH_WEIGHT.length - 1;
}

// The catches of one year, keyed by date. Drawn from the year alone, so every
// date of that year gets the same answer whoever asks and in whatever order,
// and memoised because a month of records asks thirty-odd times over.
const yearPlans = new Map<number, Map<string, RodentCatch[]>>();

function planFor(year: number): Map<string, RodentCatch[]> {
  const cached = yearPlans.get(year);
  if (cached) return cached;
  const rng = makeRng(`rodent-year|${year}`);
  const [low, high] = RODENT_CATCHES_PER_YEAR;
  const howMany = rng.int(low, high);
  const plan = new Map<string, RodentCatch[]>();
  const monthsUsed = new Set<number>();
  for (let i = 0; i < howMany; i++) {
    // Each catch gets its own month where it can: the department describes
    // them as found in three or four different months, not clustered in one.
    let month = pickMonth(rng);
    for (let tries = 0; tries < 6 && monthsUsed.has(month); tries++) month = pickMonth(rng);
    monthsUsed.add(month);
    const day = rng.int(1, daysIn(year, month));
    const dateISO = `${year}-${pad2(month + 1)}-${pad2(day)}`;
    const where = pickLocation(rng);
    const one: RodentCatch = {
      id: generateId("rc"),
      trapBoxNo: boxNo(rng.int(where.boxFrom, where.boxTo)),
      location: where.area,
      count: 1,
    };
    // Two on one date reads as two in the same box on the same round, which
    // is how a pair turns up; the year's total is unchanged either way.
    plan.set(dateISO, [...(plan.get(dateISO) ?? []), one]);
  }
  yearPlans.set(year, plan);
  return plan;
}

export function rodentEventFor(dateISO: string): RodentDayEvent {
  const rng = makeRng(`rodent|${dateISO}`);
  const year = Number(dateISO.slice(0, 4));
  const event: RodentDayEvent = { catches: [], deadRodentLocation: null, cakeBitingBoxNo: null };
  const planned = planFor(year).get(dateISO);

  if (planned) {
    // Fresh ids per call: two records must never share a row id, and nothing
    // downstream matches a catch by id (engine/autoFill.ts writes them into
    // the record's own rodentCatches).
    event.catches = planned.map((c) => ({ ...c, id: generateId("rc") }));
    if (rng.next() < RODENT_CAKE_BITING_P) event.cakeBitingBoxNo = event.catches[0].trapBoxNo;
    if (rng.next() < RODENT_DEAD_P) event.deadRodentLocation = event.catches[0].location;
  } else if (rng.next() < RODENT_CAKE_BITING_ALONE_P) {
    // A bait-cake bitten with nothing caught: a sign, not a catch, so it does
    // not count against the year's three or four.
    const loc = pickLocation(rng);
    event.cakeBitingBoxNo = boxNo(rng.int(loc.boxFrom, loc.boxTo));
  }
  return event;
}

export function totalRodents(catches: RodentCatch[] | undefined): number {
  return (catches ?? []).reduce((s, c) => s + (Number(c.count) || 0), 0);
}

// One-line description of a day's rodent situation, for the assistant's
// notes and the reports' "Rodents" column.
export function describeRodentEvent(ev: RodentDayEvent): string {
  if (ev.catches.length === 0) return ev.cakeBitingBoxNo ? `No rodent trapped; bait-cake biting seen in ${ev.cakeBitingBoxNo}.` : "";
  const parts = ev.catches.map((c) => `${c.count} at ${c.trapBoxNo} (${c.location})`);
  const n = totalRodents(ev.catches);
  return `${n} rodent${n === 1 ? "" : "s"} trapped — ${parts.join("; ")}${ev.deadRodentLocation ? `; dead rodent observed at ${ev.deadRodentLocation}` : ""}${ev.cakeBitingBoxNo ? `; cake biting in ${ev.cakeBitingBoxNo}` : ""}.`;
}
