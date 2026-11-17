import { FLY_MONTHLY_FACTOR, FLY_UNIT_BASE } from "../data/seed/pestPattern";
import { makeRng } from "../utils/random";

// DEMO MODE ONLY (REQUIREMENTS §98): a Live fly catcher record's counts are
// written at the visit; this pattern fills Demo Mode's records and the sample
// data of a test server. The tube light dates below are the register's own, and
// a Live record does carry those (engine/knownParts.ts).
//
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

/**
 * THE DUE DATE FOLLOWS THE INSTALLATION DATE (the owner, 30-10-26): a year less a day after it, as the register's own
 * pair reads - installed 24-11-2025, due 23-11-2026. Null for a date that is not a whole yyyy-mm-dd.
 */
export function tubeLightDueFor(installISO: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(installISO ?? "");
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]) + 1, Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * THE TUBE LIGHT CHANGED EVERY YEAR ON ITS DUE DATE (the owner, 17-Nov-2026, REQUIREMENTS §253: "DUE DATE FOR TUBE LIGHT
 * REPLACEMENT is 23-11-2026 so after that new date ... like wise it will repeat every year"; asked, "23-11-2026 -> 22-11-2027"
 * from the "first visit on/after due date"): on a visit on or after the due date, the installation date is that due date
 * and the new due date a year less a day after it - 24-11-2025 / 23-11-2026, then 23-11-2026 / 22-11-2027, then
 * 22-11-2027 / 21-11-2028 - as many years on as the visit is. A visit before the due date keeps the pair it has.
 */
export function tubeLightPairOn(
  installISO: string | null | undefined,
  dueISO: string | null | undefined,
  visitISO: string
): { install: string | null; due: string | null } {
  let install = installISO ?? null;
  let due = dueISO ?? tubeLightDueFor(install);
  if (!install || !due || !/^\d{4}-\d{2}-\d{2}$/.test(due) || !/^\d{4}-\d{2}-\d{2}$/.test(visitISO)) return { install, due };
  for (let guard = 0; visitISO >= due && guard < 200; guard++) {
    const next = tubeLightDueFor(due);
    if (!next) break;
    install = due;
    due = next;
  }
  return { install, due };
}

/** The register's tube-light dates on a visit's day: the stated pair (24-11-2025 / 23-11-2026), a year on for each due date passed (§253). */
export function tubeLightCycle(visitISO?: string): { installed: string; due: string } {
  if (!visitISO) return { installed: TUBE_LIGHT_INSTALLED, due: TUBE_LIGHT_DUE };
  const p = tubeLightPairOn(TUBE_LIGHT_INSTALLED, TUBE_LIGHT_DUE, visitISO);
  return { installed: p.install ?? TUBE_LIGHT_INSTALLED, due: p.due ?? TUBE_LIGHT_DUE };
}

/** A visit's lines with each unit's tube-light pair brought to the visit's day (tubeLightPairOn); null when nothing changes. */
export function withTubeLightsOn<T extends { entries: { tubeLightInstallDate: string | null; tubeLightDueDate: string | null }[] }>(data: T, visitISO: string): T | null {
  if (!Array.isArray(data?.entries)) return null;
  let changed = false;
  const entries = data.entries.map((e) => {
    if (!e.tubeLightInstallDate) return e;
    const p = tubeLightPairOn(e.tubeLightInstallDate, e.tubeLightDueDate, visitISO);
    if (p.install === e.tubeLightInstallDate && p.due === e.tubeLightDueDate) return e;
    changed = true;
    return { ...e, tubeLightInstallDate: p.install, tubeLightDueDate: p.due };
  });
  return changed ? { ...data, entries } : null;
}

export function flySeasonLabel(month: number): string {
  const f = FLY_MONTHLY_FACTOR[month] ?? 1;
  return f >= 0.85 ? "peak fly season" : f >= 0.55 ? "moderate fly season" : "low fly season";
}
