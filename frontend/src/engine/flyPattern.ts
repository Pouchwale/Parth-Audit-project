import { FLY_MONTHLY_FACTOR, FLY_UNIT_BASE } from "../data/seed/pestPattern";
import { makeRng } from "../utils/random";

// "Flies Catch Count Approx." for one fly catcher unit on one inspection
// date, from the generated seasonal pattern (tools/pest_pattern.py). Seeded
// by unit + date, so the assistant's pre-fill, Demo Mode and a re-run "Fill
// again" all agree, and Pest Control > Trend Analysis > Fly Catcher
// Infestation reads as one consistent story: busiest in the monsoon, busy
// again in winter, and quietest in the dry summer heat (REQUIREMENTS §45, §62).
export function flyCatchFor(pcId: string, dateISO: string): number {
  const rng = makeRng(`fly|${pcId}|${dateISO}`);
  const month = Number(dateISO.slice(5, 7)) - 1;
  const lambda = (FLY_UNIT_BASE[pcId] ?? 1) * (FLY_MONTHLY_FACTOR[month] ?? 1);
  // Knuth's Poisson sampler — small integer counts with the right spread
  // (a unit that averages one fly a visit still shows 0 and 3 sometimes).
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng.next();
  } while (p > limit && k < 12);
  return Math.min(k - 1, 9);
}

// TUBE-LIGHT VALIDITY — TWO FIXED DATES ON THE REGISTER, not a computed cycle.
// The department's own statement (13-Sep-2026): the date of tube light
// installation is fixed at 24-11-2025 and the due date for replacement at
// 23-11-2026, for every one of the thirteen fly catcher units. The tubes are
// changed together, once, and both dates are the same on every line of
// F/HR/18 — which is why the specimen dittoes them down the page.
//
// This replaces two earlier readings, and it is worth saying why neither
// survived. The first staggered the dates across the year, on the assumption
// that thirteen identical dates was a data-entry artefact; the register showed
// it was not. The second read the specimen's month as December and rolled the
// pair forward from whatever the service date was, so a 2027 record would have
// claimed an install date nobody has stated. Both computed a date the company
// had not given. These two constants are what the company gave, and nothing
// derives a third date from them: when the tubes are next changed, a person
// types the new dates on the register (or these two lines are updated), which
// is the only honest way for the system to learn a fact only the plant knows.
// A record dated after the due date still flags the unit as overdue in the
// assistant's notes, which is exactly the prompt to enter the new dates.
// REQUIREMENTS §44.
export const TUBE_LIGHT_INSTALLED = "2025-11-24";
export const TUBE_LIGHT_DUE = "2026-11-23";

/** The register's tube-light dates. Takes no date: they do not vary. */
export function tubeLightCycle(): { installed: string; due: string } {
  return { installed: TUBE_LIGHT_INSTALLED, due: TUBE_LIGHT_DUE };
}

export function flySeasonLabel(month: number): string {
  const f = FLY_MONTHLY_FACTOR[month] ?? 1;
  return f >= 0.85 ? "peak fly season" : f >= 0.55 ? "moderate fly season" : "low fly season";
}
