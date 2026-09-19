import { makeRng, type Rng } from "../utils/random";

// THE LIZARD YEAR, FOR YEARS THE SERVICE PROVIDER HAS NOT REPORTED YET
// (REQUIREMENTS §62).
//
// The company's Lizard Catch Report is the provider's monthly count, and the
// years it covers are transcribed as reported (data/seed/trendReports.ts —
// three in 2024, three to November 2025). A year after those had no row at
// all. The department describes its own plant (19-Sep-2026): more lizards, as
// more flies, in the rains and in winter than in the dry summer — they follow
// the insects. So a year the provider has not reported is planned the way the
// rodent year is (engine/rodentPattern.ts): a small quota drawn once from the
// year alone, each catch placed in a month by this seasonal weighting, the
// same answer whoever asks. The sheet says which rows are the provider's and
// which are this pattern; a provider's figure, once entered, replaces it.

/** Jan..Dec — the rains (Jun–Sep) highest, winter (Nov–Feb) next, the dry summer (Mar–May) lowest. */
export const LIZARD_MONTH_WEIGHT: number[] = [0.09, 0.08, 0.03, 0.02, 0.02, 0.1, 0.15, 0.16, 0.13, 0.06, 0.07, 0.09];

/** Lizards in a year, inclusive: the reported years hold three each; a wetter year a few more. */
export const LIZARDS_PER_YEAR: [number, number] = [3, 6];

function pickMonth(rng: Rng): number {
  const total = LIZARD_MONTH_WEIGHT.reduce((s, w) => s + w, 0);
  let x = rng.next() * total;
  for (let m = 0; m < 12; m++) {
    x -= LIZARD_MONTH_WEIGHT[m];
    if (x <= 0) return m;
  }
  return 11;
}

const plans = new Map<number, number[]>();

/** The planned count for each month of `year`, Jan..Dec. */
export function lizardYearPlan(year: number): number[] {
  const cached = plans.get(year);
  if (cached) return cached;
  const rng = makeRng(`lizard-year|${year}`);
  const months = Array(12).fill(0) as number[];
  const [low, high] = LIZARDS_PER_YEAR;
  for (let i = rng.int(low, high); i > 0; i--) months[pickMonth(rng)] += 1;
  plans.set(year, months);
  return months;
}
