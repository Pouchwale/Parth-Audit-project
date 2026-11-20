import { makeRng } from "../utils/random";

// F/HR/20's ANSWERS FILLED BY THE ASSISTANT, AND F/HR/21 WORKED OUT FROM THEM (REQUIREMENTS §267; the owner, 20-Nov-2026:
// "from HR-20 all helper score which is already good by default editable and which is 7 or 6 and sometime 1 also so this
// document is also fill by system and keep good score ... on that basics score in hr-21 will be decided ... percentage will
// come more than 90% all time and it should random like sometime 91").
//
// THE ANSWERS (F/HR/20). Every form of the year's round is answered on the printed scale as the company's January-2026 round
// was (F/HR/21 on file): 7 Strongly Agree or 6 Moderately Agree to every attribute, and to attribute 8 - managers telling
// people to take shortcuts, the one asked the other way round - 1 Strongly Disagree (now and then 2). Each answer stays a
// dropdown the person or HR can change.
//
// HOW GOOD. Each year has its own overall figure, between 91% and 97% (random by the year: one year 91.4%, the next 95.8%),
// and each attribute its own near it (within about 1.5 points, never under 90.5%). The number of 7s (of 1s on attribute 8)
// is set so the attribute comes to its figure, and which forms carry them is shuffled by the year - so one person answers
// 7, 7, 6, 7 ... and the next 6, 7, 7, 6 ..., as people do. The same on every device and every run.
//
// THE ANALYSIS (F/HR/21), read from the year's forms as the company's own workbook works it out (F-HR-21 ... record.xlsx):
// how many answered each point of the scale; Actual Responses = the answers added up (7 x the 7s + 6 x the 6s ...); Ideal
// response = everyone answering 7 (respondents x 7); Achieved = Actual / Ideal. Attribute 8, where the ideal answer is 1:
// Ideal = respondents x 1, Achieved = Ideal / Actual. Overall achieved = the average of the fifteen (the workbook's
// =AVERAGE(N5:N19)). A figure a person changes on a survey form changes the analysis with it.

/** The printed scale, as F/HR/20's Response dropdown offers it (hrLayouts.ts PSC_SCALE). */
export const PSC_ANSWERS = ["7 — Strongly Agree", "6 — Moderately Agree", "5 — Agree", "4 — Neutral", "3 — Disagree", "2 — Moderately Disagree", "1 — Strongly Disagree"] as const;
export const answerOf = (score: number): string => PSC_ANSWERS[7 - score];

/** The attributes asked the other way round, whose best answer is 1 Strongly Disagree: attribute 8 (shortcuts), as the company's analysis scores it. */
export const PSC_REVERSED: ReadonlySet<number> = new Set([7]);
export const PSC_ATTRIBUTE_COUNT = 15;

/** The year's overall figure aimed at, 91.0 to 97.0 (%). */
export const PSC_YEAR_RANGE = { least: 91, most: 97 };
/** No attribute under this (%). */
export const PSC_FLOOR = 90.5;

const pct2 = (x: number): number => Math.round(x * 10000) / 100;

/** The score an answer gives: "6 — Moderately Agree" is 6; anything else null. */
export function scoreOf(answer: unknown): number | null {
  const m = /^\s*([1-7])\b/.exec(String(answer ?? ""));
  return m ? Number(m[1]) : null;
}

/** An attribute's Achieved (%) from its answers' counts by score (index 1-7). */
export function achievedOf(counts: readonly number[], reversed: boolean): number | null {
  const n = counts.reduce((s, c, score) => (score >= 1 && score <= 7 ? s + c : s), 0);
  if (n === 0) return null;
  const actual = counts.reduce((s, c, score) => (score >= 1 && score <= 7 ? s + c * score : s), 0);
  return reversed ? (100 * n) / actual : (100 * actual) / (7 * n);
}

/** Each attribute's figure aimed at for the year (%), around the year's overall. */
export function pscTargets(year: number): number[] {
  const rng = makeRng(`psc-year:${year}`);
  const overall = PSC_YEAR_RANGE.least + rng.next() * (PSC_YEAR_RANGE.most - PSC_YEAR_RANGE.least);
  return Array.from({ length: PSC_ATTRIBUTE_COUNT }, () => Math.min(98.5, Math.max(PSC_FLOOR + 0.5, overall + (rng.next() - 0.5) * 3)));
}

/**
 * How many of `n` forms give an attribute its best answer (7; 1 on attribute 8), so it comes to `target` % - and never
 * under PSC_FLOOR, however few the forms.
 */
export function topCount(n: number, target: number, reversed: boolean): number {
  if (n <= 0) return 0;
  const counts = (top: number) => {
    const c = Array(8).fill(0);
    if (reversed) {
      c[1] = top;
      c[2] = n - top;
    } else {
      c[7] = top;
      c[6] = n - top;
    }
    return c;
  };
  const t = target / 100;
  // positive: (7k + 6(n-k)) / 7n = t  ->  k = n(7t - 6);  reversed: n / (k + 2(n-k)) = t  ->  k = n(2 - 1/t)
  let top = Math.round(reversed ? n * (2 - 1 / t) : n * (7 * t - 6));
  top = Math.max(0, Math.min(n, top));
  while (top < n && (achievedOf(counts(top), reversed) ?? 0) < PSC_FLOOR) top++;
  return top;
}

/**
 * The answers of a year's round of `n` forms: answers[form][attribute], each "7 — Strongly Agree" and so on. The same for
 * the same year and `n` every time.
 */
export function pscRoundAnswers(year: number, n: number): string[][] {
  const targets = pscTargets(year);
  const answers: string[][] = Array.from({ length: n }, () => Array(PSC_ATTRIBUTE_COUNT).fill(""));
  for (let a = 0; a < PSC_ATTRIBUTE_COUNT; a++) {
    const reversed = PSC_REVERSED.has(a);
    const top = topCount(n, targets[a], reversed);
    // Which forms carry the best answer: shuffled by the year and the attribute.
    const rng = makeRng(`psc-forms:${year}:${a}`);
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.forEach((form, k) => {
      answers[form][a] = answerOf(k < top ? (reversed ? 1 : 7) : reversed ? 2 : 6);
    });
  }
  return answers;
}

/**
 * The answers of ONE form started by hand with New (not one of the round's): each attribute's best answer (7; 1 on
 * attribute 8) as often as the year's figure has it, else the next (6; 2) - random by the form, the same every time.
 */
export function pscFormAnswers(year: number, seed: string): string[] {
  const targets = pscTargets(year);
  const rng = makeRng(`psc-form:${seed}`);
  return targets.map((target, a) => {
    const reversed = PSC_REVERSED.has(a);
    const t = target / 100;
    const best = rng.next() < (reversed ? 2 - 1 / t : 7 * t - 6);
    return answerOf(best ? (reversed ? 1 : 7) : reversed ? 2 : 6);
  });
}

/** One form's answers, as its rows hold them (rows[i].response), by attribute. */
export type SurveyAnswers = readonly unknown[];

export interface PscAnalysisRow {
  sa7: number | null;
  ma6: number | null;
  a5: number | null;
  n4: number | null;
  d3: number | null;
  md2: number | null;
  sd1: number | null;
  actual: number | null;
  ideal: number | null;
  achieved: string;
}

const COUNT_KEYS = [null, "sd1", "md2", "d3", "n4", "a5", "ma6", "sa7"] as const;

/**
 * F/HR/21 worked out from the year's forms: each attribute's counts (blank where none, as the paper leaves them), Actual,
 * Ideal and Achieved, and the overall achieved - "93.99%".
 */
export function pscAnalysis(forms: readonly SurveyAnswers[]): { rows: PscAnalysisRow[]; overall: string; respondents: number } {
  const rows: PscAnalysisRow[] = [];
  const figures: number[] = [];
  for (let a = 0; a < PSC_ATTRIBUTE_COUNT; a++) {
    const counts = Array(8).fill(0);
    for (const f of forms) {
      const s = scoreOf(f[a]);
      if (s !== null) counts[s]++;
    }
    const reversed = PSC_REVERSED.has(a);
    const n = counts.reduce((s, c) => s + c, 0);
    const actual = counts.reduce((s, c, score) => s + c * score, 0);
    const got = achievedOf(counts, reversed);
    const row = { actual: n ? actual : null, ideal: n ? (reversed ? n : 7 * n) : null, achieved: got === null ? "" : `${pct2(got / 100).toFixed(2)}%` } as PscAnalysisRow;
    for (let s = 1; s <= 7; s++) row[COUNT_KEYS[s]!] = counts[s] || null;
    rows.push(row);
    if (got !== null) figures.push(got);
  }
  const overall = figures.length ? `${pct2(figures.reduce((s, x) => s + x, 0) / figures.length / 100).toFixed(2)}%` : "";
  const respondents = forms.filter((f) => f.some((x) => scoreOf(x) !== null)).length;
  return { rows, overall, respondents };
}
