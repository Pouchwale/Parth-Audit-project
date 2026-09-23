import type { LogSheetData, LogSheetRow } from "../types";

// THE WEIGHTED RATINGS ON THE TWO PURCHASE MONITORING REGISTERS ARE WORKED
// OUT, NOT TYPED (REQUIREMENTS §68). Both formats print the arithmetic on the
// form itself, and F/PUR/05 says so in as many words across the grid: "Don't
// enter value in the following cell, its formula based".
//
//   F/PUR/05  RM & PM supplier performance   the buyer writes the three
//             ratings the printed criteria give — product safety (X), quality
//             (Y), delivery (Z) — and the form carries each at the weight
//             printed over its column: 50%, 40%, 10%. The Overall Rating is
//             the three weighted figures added, and the Grade is the letter the
//             form's own Overall Rating table gives that figure ("A" at 90 and
//             above, "B" below 90 and 80 or above, "C" below 80).
//   F/PUR/06  Service provider performance   the Overall Rating is the delivery
//             rating plus the quality & product safety rating, each printed
//             "Max 50" — so 100 at most.
//
// It is done here, on the data, so the figure is the same whoever wrote the
// ratings: a buyer typing into the register, Mitra filling it, or the printed
// specimen. The blank form prints 0.00 in every weighted cell of F/PUR/05 and 0
// in every Overall Rating cell of F/PUR/06, so an untouched line reads the same
// way here. The Grade is the one exception: a letter beside a line nobody has
// rated yet would assert that the supplier had failed, so it stays blank until
// there is a rating to grade.

/** The document ids of the two registers this works on. */
export const RM_PM_PERFORMANCE_ID = "pur-supplier-performance";
export const SERVICE_PROVIDER_PERFORMANCE_ID = "pur-service-provider-performance";

/** The weights printed over F/PUR/05's three weighted columns. */
export const PRODUCT_SAFETY_WEIGHT = 0.5;
export const QUALITY_WEIGHT = 0.4;
export const DELIVERY_WEIGHT = 0.1;

/** F/PUR/05's printed Overall Rating table: the grade a figure earns, and the action beside it. */
export const OVERALL_GRADES: { grade: string; action: string }[] = [
  { grade: "A", action: "Continue" },
  { grade: "B", action: "Continue & improve" },
  { grade: "C", action: "Replace / improve" },
];

/** One line's cells, as a record holds them. */
export type RatingCells = Record<string, string | number | null>;

/** A rating as it was written; null when there is nothing readable in the cell. */
function figure(value: unknown): number | null {
  const s = String(value ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 43.75 → "43.75", 50 → "50.00": the two decimals the blank form prints. */
const twoPlaces = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);

/** One rating carried at its printed weight. A cell with nothing in it weighs nothing, and the form prints 0.00 for it. */
export function weightedRating(rating: unknown, weight: number): string {
  return twoPlaces((figure(rating) ?? 0) * weight);
}

/**
 * The three weighted figures added — added as the form PRINTS them, each
 * already at two decimals, so the Overall Rating on the sheet is always the sum
 * of the three columns beside it and an auditor's own arithmetic agrees.
 */
export function overallWeightedRating(productSafety: unknown, quality: unknown, delivery: unknown): string {
  const parts = [
    weightedRating(productSafety, PRODUCT_SAFETY_WEIGHT),
    weightedRating(quality, QUALITY_WEIGHT),
    weightedRating(delivery, DELIVERY_WEIGHT),
  ];
  return twoPlaces(parts.reduce((sum, part) => sum + Number(part), 0));
}

/** The letter the printed Overall Rating table gives a figure. */
export function gradeForOverall(overall: number): string {
  if (overall >= 90) return "A";
  return overall >= 80 ? "B" : "C";
}

/** The action the same table prints beside that letter — "Continue", "Continue & improve", "Replace / improve". */
export function actionForGrade(grade: string): string {
  return OVERALL_GRADES.find((g) => g.grade === grade)?.action ?? "";
}

/** F/PUR/05's five formula cells for one line, worked out from the ratings written on it. */
export function supplierRatingCells(row: RatingCells): RatingCells {
  const overall = overallWeightedRating(row.productSafetyRating, row.qualityRating, row.deliveryRating);
  const rated = [row.productSafetyRating, row.qualityRating, row.deliveryRating].some((v) => figure(v) !== null);
  return {
    productSafetyWeightage: weightedRating(row.productSafetyRating, PRODUCT_SAFETY_WEIGHT),
    qualityWeightage: weightedRating(row.qualityRating, QUALITY_WEIGHT),
    deliveryWeightage: weightedRating(row.deliveryRating, DELIVERY_WEIGHT),
    overallRating: overall,
    grade: rated ? gradeForOverall(Number(overall)) : "",
  };
}

/** F/PUR/06's one formula cell: the two parameter ratings added, each out of 50. */
export function serviceRatingCells(row: RatingCells): RatingCells {
  const total = (figure(row.deliveryRating) ?? 0) + (figure(row.qualityRating) ?? 0);
  return { overallRating: String(Math.round(total * 100) / 100) };
}

/** The record's data with every formula cell worked out; any other document's data is returned as it is. */
export function withPurchaseRatings<T>(documentId: string | undefined, data: T): T {
  if (documentId !== RM_PM_PERFORMANCE_ID && documentId !== SERVICE_PROVIDER_PERFORMANCE_ID) return data;
  const d = data as unknown as LogSheetData | undefined;
  if (!d || !Array.isArray(d.rows)) return data;
  const cells = documentId === RM_PM_PERFORMANCE_ID ? supplierRatingCells : serviceRatingCells;
  const rows: LogSheetRow[] = d.rows.map((r) => ({ ...r, ...cells(r) }));
  // Nothing changed is nothing to re-render: the same object goes back, so a
  // register of thirteen lines does not rebuild on every keystroke elsewhere.
  const same = rows.every((r, i) => Object.keys(r).every((k) => r[k] === d.rows[i][k]));
  return same ? data : ({ ...d, rows } as unknown as T);
}
