import type { LogSheetData, LogSheetRow } from "../types";

// MARKETING'S WORKED-OUT CELLS AND BOXES (REQUIREMENTS §77). Two of the
// Marketing formats print figures that are arithmetic on what is written
// beside them, and the company's own workbooks work them out with formulas:
//
//   F/MKT/02  Customer Feedback analysis — for each attribute, how many
//             customers gave each rating (5 Excellent, 4 Very Good, 3 Good,
//             2 Average, - 5 Poor). Then, per line, the "Average Rating" (the
//             counts weighted by their rating: 5·c5 + 4·c4 + 3·c3 + 2·c2 −
//             5·cPoor), the "Ideal Rating" (every count at 5: (c5 + c4 + c3 +
//             c2 + cPoor)·5) and "Satisfied % average" (Average / Ideal to two
//             decimals, "97.78%"). Below the grid: the tally of each rating
//             column (the "Average Rating" row — 35, 17, 2 on the LABELS page),
//             each tally at its weight (the "Ideal Rating" row — 175, 68, 6),
//             the total Average Rating (249, the weighted tallies added), the
//             total Ideal Rating (270, every line's Ideal Rating added; the
//             workbook types it as customers × attributes × 5, "=9*6*5") and
//             the "% Satisfaction Index" (249 / 270 as a whole per cent,
//             "92%").
//   F/MKT/04  Customer Complaints Trend Analysis — the trend table's "Total"
//             row (each period's complaints added over the sheet's series; the
//             company keeps one series per sheet, so it repeats the series row)
//             and the Pareto of causes: each cause's cumulative share of the
//             defects to one decimal ("28.6%"), "Vital Few" while that share is
//             within the cutoff (80% unless the box says otherwise) and "Useful
//             Many" after, and the template's sentence "The first N Causes
//             cover X% of the Total Defects".
//
// Worked out here, the same whoever wrote the figures — the marketing head,
// Mitra or sample data — the way F/SYS/07's Sum and Audit frequency are
// (engine/auditRisk.ts): a person types only the counts, the causes and the
// defects, and every worked-out cell is "" until something is written.
//
// Rounding is on the decimal digits, half away from zero, as Excel shows a
// cell formatted 0.00% or 0%: (1.005).toFixed(2) is "1.00" in JavaScript and
// 1.01 in Excel, and the page is the workbook's print.
//
// The workbook has weights only for the 5, 4 and 3 columns (F13 = F12*5, G13 =
// G12*4, H13 = H12*3); no 2 Average or - 5 Poor has ever been counted, so the
// weights 2 and −5 are read from the headings as printed — every printed
// figure is the same either way. The Pareto's lines are taken in the order
// written (the analyst's order, not re-sorted), and a line with no defects
// written gets "" for both cells and is left out of the totals.
//
// This file imports no seed layout, so the layouts may import it without an
// import cycle.

/** The document id of F/MKT/02. */
export const FEEDBACK_ANALYSIS_ID = "mkt-feedback-analysis";
/** The document id of F/MKT/04. */
export const COMPLAINT_TREND_ID = "mkt-complaint-trend";

/**
 * The five rating columns of F/MKT/02: the column's key, the weight its
 * heading prints, and the suffix of the two boxes under it (tally5 … tallyPoor,
 * weighted5 … weightedPoor).
 */
export const FEEDBACK_RATINGS: readonly { key: string; weight: number; box: string }[] = [
  { key: "count5", weight: 5, box: "5" },
  { key: "count4", weight: 4, box: "4" },
  { key: "count3", weight: 3, box: "3" },
  { key: "count2", weight: 2, box: "2" },
  { key: "countPoor", weight: -5, box: "Poor" },
];

/** The trend table's period slots on F/MKT/04: period1 … period6, complaints1 … complaints6, total1 … total6. */
export const COMPLAINT_PERIODS = 6;

type Cells = Record<string, string | number | null>;

/** A written count, or null when nothing (or nothing readable) is written. */
function count(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** `value` to `decimals` places, rounded half away from zero on its decimal digits (as Excel rounds), as text. */
function fixed(value: number, decimals: number): string {
  const digits = value.toPrecision(15);
  if (/e/i.test(digits)) return value.toFixed(decimals);
  const scaled = Number(`${digits}e${decimals}`);
  const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled));
  return (rounded / 10 ** decimals).toFixed(decimals);
}

/** A ratio as a percentage: percent(44 / 45, 2) is "97.78%", percent(249 / 270, 0) is "92%". */
export function percent(ratio: number, decimals: number): string {
  return `${fixed(ratio * 100, decimals)}%`;
}

/**
 * One line's three worked-out cells of F/MKT/02: Average Rating (the counts
 * weighted by their rating), Ideal Rating (every count at 5) and Satisfied %
 * average (Average / Ideal, two decimals) — all "" while no count is written
 * on the line. A count left blank beside a written one is none.
 */
export function feedbackRowCells(row: Cells): Record<string, string> {
  const counts = FEEDBACK_RATINGS.map((r) => count(row[r.key]));
  if (counts.every((c) => c === null)) return { averageRating: "", idealRating: "", satisfiedPct: "" };
  const average = FEEDBACK_RATINGS.reduce((sum, r, i) => sum + (counts[i] ?? 0) * r.weight, 0);
  const ideal = counts.reduce<number>((sum, c) => sum + (c ?? 0), 0) * 5;
  return {
    averageRating: String(average),
    idealRating: String(ideal),
    satisfiedPct: ideal === 0 ? "" : percent(average / ideal, 2),
  };
}

/**
 * The boxes under F/MKT/02's grid: each rating's tally over the six lines
 * (tally5 … tallyPoor — "" where that rating was never counted), each tally
 * at its weight (weighted5 … weightedPoor), the total Average Rating (the
 * weighted tallies added), the total Ideal Rating (every line's Ideal Rating
 * added) and the % Satisfaction Index (Average / Ideal as a whole per cent).
 * Everything is "" while no count is written anywhere.
 */
export function feedbackTotals(rows: Cells[]): Record<string, string> {
  const boxes: Record<string, string> = {};
  let averageTotal = 0;
  let idealTotal = 0;
  let written = false;
  for (const r of FEEDBACK_RATINGS) {
    const counts = rows.map((row) => count(row[r.key])).filter((c): c is number => c !== null);
    if (counts.length === 0) {
      boxes[`tally${r.box}`] = "";
      boxes[`weighted${r.box}`] = "";
      continue;
    }
    written = true;
    const tally = counts.reduce((a, b) => a + b, 0);
    boxes[`tally${r.box}`] = String(tally);
    boxes[`weighted${r.box}`] = String(tally * r.weight);
    averageTotal += tally * r.weight;
    idealTotal += tally * 5;
  }
  boxes.averageRatingTotal = written ? String(averageTotal) : "";
  boxes.idealRatingTotal = written ? String(idealTotal) : "";
  boxes.satisfactionIndex = written && idealTotal !== 0 ? percent(averageTotal / idealTotal, 0) : "";
  return boxes;
}

/** What paretoCells works out: a pair of cells per line, in the order given, and the sentence under the chart. */
export interface ParetoCells {
  /** Per line: its cumulative share of the defects ("28.6%") and "Vital Few" / "Useful Many" — both "" for a line with no defects written. */
  rows: { cumulativePct: string; classification: string }[];
  /** "The first N Causes cover X% of the Total Defects" — N the Vital Few lines, X their share to two decimals; "" while no defects are written. */
  summary: string;
}

/** The cutoff a box holds, a whole number of per cent ("80", or "80%" as the template prints it); 80 when blank or unreadable. */
export function paretoCutoff(value: unknown): number {
  const n = count(value === null || value === undefined ? "" : String(value).replace(/%\s*$/, ""));
  return n === null ? 80 : n;
}

/**
 * F/MKT/04's Pareto, line by line in the order written: the running total of
 * defects as a share of all of them, one decimal; "Vital Few" while that share
 * is within `cutoffPct`, "Useful Many" after; and the sentence under the chart.
 * A line with no defects written is skipped and left out of the totals.
 */
export function paretoCells(rows: Cells[], cutoffPct: number): ParetoCells {
  const defects = rows.map((row) => count(row.defects));
  const total = defects.reduce<number>((sum, d) => sum + (d ?? 0), 0);
  if (total === 0) return { rows: rows.map(() => ({ cumulativePct: "", classification: "" })), summary: "" };
  let running = 0;
  let vitalFew = 0;
  let vitalDefects = 0;
  const cells = defects.map((d) => {
    if (d === null) return { cumulativePct: "", classification: "" };
    running += d;
    // running / total ≤ cutoff / 100, multiplied out so that no division turns 80% into 80.00000000000001.
    const vital = running * 100 <= cutoffPct * total;
    if (vital) {
      vitalFew += 1;
      vitalDefects += d;
    }
    return { cumulativePct: percent(running / total, 1), classification: vital ? "Vital Few" : "Useful Many" };
  });
  return { rows: cells, summary: `The first ${vitalFew} Causes cover ${fixed((vitalDefects / total) * 100, 2)}% of the Total Defects` };
}

/**
 * F/MKT/04's "Total" row: each period's complaints added over the sheet's
 * series. The company keeps one series per sheet (LABELS, SHRINK SLEEVE or
 * LAMINATES), so each total is that period's own count — "" where none is
 * written, as the page leaves an unused period's cells blank.
 */
export function complaintTotals(header: Record<string, string>): Record<string, string> {
  const boxes: Record<string, string> = {};
  for (let n = 1; n <= COMPLAINT_PERIODS; n++) {
    const c = count(header[`complaints${n}`]);
    boxes[`total${n}`] = c === null ? "" : String(c);
  }
  return boxes;
}

/** A line with its worked-out cells written in; the line itself when none of them changed. */
function withCells(row: LogSheetRow, cells: Record<string, string>): LogSheetRow {
  const next = { ...row, ...cells };
  return Object.keys(next).every((k) => next[k] === row[k]) ? row : next;
}

/**
 * The record's data with every worked-out cell and box worked out; any other
 * document's data is returned as it is. A line whose cells are unchanged is
 * handed back as it was, so the sheet redraws only the line that changed
 * (components/records/LogSheetRecordView.tsx SheetRow), and nothing changed —
 * lines and boxes — is the very same object (engine/auditRisk.ts).
 */
export function withMarketingCalc<T>(documentId: string | undefined, data: T): T {
  if (documentId !== FEEDBACK_ANALYSIS_ID && documentId !== COMPLAINT_TREND_ID) return data;
  const d = data as unknown as LogSheetData | undefined;
  if (!d || !Array.isArray(d.rows)) return data;
  const header = d.header ?? {};
  let rows: LogSheetRow[];
  let boxes: Record<string, string>;
  if (documentId === FEEDBACK_ANALYSIS_ID) {
    rows = d.rows.map((r) => withCells(r, feedbackRowCells(r)));
    boxes = feedbackTotals(d.rows);
  } else {
    const pareto = paretoCells(d.rows, paretoCutoff(header.cutoff));
    rows = d.rows.map((r, i) => withCells(r, pareto.rows[i]));
    boxes = { ...complaintTotals(header), paretoSummary: pareto.summary };
  }
  const sameRows = rows.every((r, i) => r === d.rows[i]);
  const sameHeader = Object.keys(boxes).every((k) => (header[k] ?? "") === boxes[k]);
  if (sameRows && sameHeader) return data;
  return { ...d, header: sameHeader ? d.header : { ...header, ...boxes }, rows: sameRows ? d.rows : rows } as unknown as T;
}
