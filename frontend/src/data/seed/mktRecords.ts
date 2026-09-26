import type { LogSheetData, LogSheetRow, RecordInstance } from "../../types";
import { FEEDBACK_RATINGS, withMarketingCalc } from "../../engine/marketingCalc";
import {
  COMPLAINT_MONTHS,
  COMPLAINT_PERIOD_SLOTS,
  FEEDBACK_ATTRIBUTES,
  FEEDBACK_PIDILITE_2025_01,
  FEEDBACK_PIDILITE_2025_01_RATINGS,
  LABELS_CAUSES_2026,
  LAMINATED_POUCH_CAUSES_2026,
  SLEEVE_CAUSES_2026,
} from "./mktLayouts";

// THE MARKETING PAGES SUPPLIED FILLED IN (REQUIREMENTS §77), on file as LIVE
// records (isDemo: false) the way the internal audit's are
// (sysInternalAuditRecords.ts), so the formats open with the company's own
// entries. Read from the pages and the workbooks, cell for cell (mktLayouts.ts
// says how each page is laid out and what is odd on it), and nothing else
// invented — a box the page leaves blank is blank here:
//   F/MKT/01  Pidilite's feedback of 22.01.2025 on its Tenax wraparound labels:
//             the six ratings where its "Yes □" sits, its comment, Satisfactory
//             and Yes highlighted, no seal or signature.
//   F/MKT/02  the analyses of 01.01.2025 to 31.12.2025 for LABELS (the printed
//             page), POUCHES and SLEEVES (the workbooks), filed on 1, 2 and 3
//             January 2026 so that one format's three products keep distinct
//             period keys; the counts are the workbooks', every Average Rating,
//             Ideal Rating, Satisfied % average, tally, total and index is the
//             engine's answer and equals the printed figure.
//   F/MKT/04  the trend of calendar year 2025 and the Pareto up to January 2026
//             for LABELS, SHRINK SLEEVE and LAMINATED POUCH, filed on 31, 30
//             and 29 January 2026 for the same reason; the Total row, every
//             Cumulative%, every Vital Few / Useful Many and the sentence under
//             the chart are the engine's.
// Every worked-out cell and box is written by running withMarketingCalc over
// the data as the record is built — never typed here.

const ON_FILE = "Marketing (sheet as supplied, 26-Sep-2026)";
const SEEDED_AT = "2026-09-26T00:00:00.000Z";

function seeded(id: string, documentId: string, dueDate: string, data: LogSheetData): RecordInstance<LogSheetData> {
  return {
    id,
    documentId,
    periodKey: `${documentId}:${dueDate}`,
    dueDate,
    status: "Verified",
    isDemo: false,
    data: withMarketingCalc(documentId, data),
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    submittedBy: ON_FILE,
    submittedAt: SEEDED_AT,
    verifiedBy: ON_FILE,
    verifiedAt: SEEDED_AT,
  };
}

/** Short, stable row ids: r1, r2 … */
const rowId = (i: number) => `r${i + 1}`;

/** Every key of `keys` blank, for the boxes the engine fills. */
const blank = (keys: string[]): Record<string, string> => Object.fromEntries(keys.map((k) => [k, ""]));

// ---------------------------------------------------------------------------
// F/MKT/01 — Pidilite, 22.01.2025.

export const SEED_MKT_FEEDBACK_PIDILITE_2025_01 = seeded("seed-mkt-feedback-pidilite-2025-01", "mkt-customer-feedback", "2025-01-22", {
  header: {
    date: "2025-01-22",
    ...FEEDBACK_PIDILITE_2025_01,
    comments:
      "While overall servicing is good. Quality check needs to be more robust. Repeat rejections needs to be taken with more stringent approach to ensure quality material been delivered.",
    overallSatisfaction: "Satisfactory ☻",
    associateInFuture: "Yes",
    companySealSign: "",
  },
  rows: FEEDBACK_ATTRIBUTES.map((attribute, i) => ({ id: rowId(i), attribute, rating: FEEDBACK_PIDILITE_2025_01_RATINGS[i] })),
});

// ---------------------------------------------------------------------------
// F/MKT/02 — the three products, 01.01.2025 to 31.12.2025. Per line the
// counts under 5 Excellent, 4 Very Good, 3 Good, 2 Average, - 5 Poor (a count
// left out is a blank cell) and the further action written beside it.

type AnalysisLine = [counts: (number | null)[], furtherAction: string];

const FEEDBACK_ANALYSIS_BOXES = [
  ...FEEDBACK_RATINGS.map((r) => `tally${r.box}`),
  ...FEEDBACK_RATINGS.map((r) => `weighted${r.box}`),
  "averageRatingTotal",
  "idealRatingTotal",
  "satisfactionIndex",
];

const CONCLUSION_2025 = "Overall CSI found satisfactory. No major concerns or complaints received from above customer related to above parameters";

function feedbackAnalysis(id: string, dueDate: string, product: string, lines: AnalysisLine[]): RecordInstance<LogSheetData> {
  return seeded(id, "mkt-feedback-analysis", dueDate, {
    header: { product, periodFrom: "2025-01-01", periodTo: "2025-12-31", ...blank(FEEDBACK_ANALYSIS_BOXES), conclusion: CONCLUSION_2025 },
    rows: FEEDBACK_ATTRIBUTES.map((attribute, i): LogSheetRow => {
      const [counts, furtherAction] = lines[i];
      const row: LogSheetRow = { id: rowId(i), attribute };
      FEEDBACK_RATINGS.forEach((r, j) => {
        row[r.key] = counts[j] ?? null;
      });
      return { ...row, averageRating: "", idealRating: "", satisfiedPct: "", furtherAction };
    }),
  });
}

const NOT_NEEDED = "Not needed";

// The printed LABELS page: 9 customers.
export const SEED_MKT_FEEDBACK_ANALYSIS_LABELS_2025 = feedbackAnalysis("seed-mkt-feedback-analysis-labels-2025", "2026-01-01", "LABELS", [
  [[8, 1], NOT_NEEDED],
  [[7, 2], NOT_NEEDED],
  [[4, 4, 1], NOT_NEEDED],
  [[6, 3], NOT_NEEDED],
  [[5, 3, 1], NOT_NEEDED],
  [[5, 4], NOT_NEEDED],
]);

// The POUCHES workbook: 4 customers.
export const SEED_MKT_FEEDBACK_ANALYSIS_POUCHES_2025 = feedbackAnalysis("seed-mkt-feedback-analysis-pouches-2025", "2026-01-02", "POUCHES", [
  [[3, null, 1], NOT_NEEDED],
  [[3, null, 1], NOT_NEEDED],
  [[2, 1, 1], NOT_NEEDED],
  [[3, null, 1], NOT_NEEDED],
  [[3, null, 1], NOT_NEEDED],
  [[3, null, 1], NOT_NEEDED],
]);

// The SLEEVES workbook: 3 customers.
export const SEED_MKT_FEEDBACK_ANALYSIS_SLEEVES_2025 = feedbackAnalysis("seed-mkt-feedback-analysis-sleeves-2025", "2026-01-03", "SLEEVES", [
  [[1, 2], NOT_NEEDED],
  [[1, 2], NOT_NEEDED],
  [[1, null, 2], "Not needed due to fewer order qty"],
  [[1, 1, 1], NOT_NEEDED],
  [[2, null, 1], NOT_NEEDED],
  [[1, 2], NOT_NEEDED],
]);

// ---------------------------------------------------------------------------
// F/MKT/04 — calendar year 2025 and the Pareto up to January 2026, per
// product: the trend table's periods with their counts, the twelve months
// (the page prints every month, 0 where none), the Pareto's title after
// "Customer Complaints -" and its causes.

function complaintTrend(
  id: string,
  dueDate: string,
  product: string,
  seriesName: string,
  periods: [label: string, complaints: number][],
  months: number[],
  paretoTitle: string,
  causes: [cause: string, defects: number][]
): RecordInstance<LogSheetData> {
  const header: Record<string, string> = { product, seriesName };
  for (const n of COMPLAINT_PERIOD_SLOTS) {
    const period = periods[n - 1];
    header[`period${n}`] = period ? period[0] : "";
    header[`complaints${n}`] = period ? String(period[1]) : "";
    header[`total${n}`] = "";
  }
  header.calendarYear = "2025";
  COMPLAINT_MONTHS.forEach((m, i) => {
    header[m.key] = String(months[i]);
  });
  Object.assign(header, { paretoTitle, cutoff: "80", paretoSummary: "" });
  return seeded(id, "mkt-complaint-trend", dueDate, {
    header,
    rows: causes.map(([cause, defects], i) => ({ id: rowId(i), cause, defects, cumulativePct: "", classification: "" })),
  });
}

export const SEED_MKT_COMPLAINT_TREND_LABELS_2025 = complaintTrend(
  "seed-mkt-complaint-trend-labels-2025",
  "2026-01-31",
  "LABELS",
  "LABELS",
  [["DEC 2021", 1], ["CY 2022", 7], ["CY 2023", 6], ["CY 2024", 4], ["CY 2025", 2]],
  [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1],
  "LABELS (Jan 2021 to JANUARY 2026)",
  LABELS_CAUSES_2026
);

export const SEED_MKT_COMPLAINT_TREND_SHRINK_SLEEVE_2025 = complaintTrend(
  "seed-mkt-complaint-trend-shrink-sleeve-2025",
  "2026-01-30",
  "SHRINK SLEEVE",
  "SHRINK SLEEVE",
  [["DEC 2021", 2], ["CY 2022", 3], ["CY 2023", 4], ["CY 2024", 3], ["CY 2025", 1]],
  [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
  "SLEEVE - UP TO 31.01.2026",
  SLEEVE_CAUSES_2026
);

export const SEED_MKT_COMPLAINT_TREND_LAMINATED_POUCH_2025 = complaintTrend(
  "seed-mkt-complaint-trend-laminated-pouch-2025",
  "2026-01-29",
  "LAMINATED POUCH",
  "LAMINATES",
  [["CY 2024", 0], ["CY 2025", 2]],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
  "LAMINATED POUCHES (Jan 2024 to JANUARY 2026)",
  LAMINATED_POUCH_CAUSES_2026
);

export const SEED_MKT_RECORDS: RecordInstance<LogSheetData>[] = [
  SEED_MKT_FEEDBACK_PIDILITE_2025_01,
  SEED_MKT_FEEDBACK_ANALYSIS_LABELS_2025,
  SEED_MKT_FEEDBACK_ANALYSIS_POUCHES_2025,
  SEED_MKT_FEEDBACK_ANALYSIS_SLEEVES_2025,
  SEED_MKT_COMPLAINT_TREND_LABELS_2025,
  SEED_MKT_COMPLAINT_TREND_SHRINK_SLEEVE_2025,
  SEED_MKT_COMPLAINT_TREND_LAMINATED_POUCH_2025,
];
