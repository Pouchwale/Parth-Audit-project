// THE COMPANY'S THREE PEST TREND REPORTS, transcribed cell for cell from
// "GP-3 Trend Analysis - 2025.pdf" as supplied on 13-Sep-2026:
//
//   page 1  RODENT CATCH REPORT AND TREND ANALYSIS   Trapped on Glue boards in
//                                                    Roda-boxes / Number / Rodents
//   page 2  LIZARD CATCH REPORT AND TREND ANALYSIS   Trapped on Glue boards in
//                                                    Roda-boxes / Number / Lizard
//   page 3  FLIES CATCH REPORT AND TREND ANALYSIS    Collected in EFKs /
//                                                    Gramms / Flies
//
// Each page is one table — Source | Unit | Target Pest | YEAR | JAN..DEC |
// Total, one row per year — over a bar chart of one year, with a "Report
// prepared by" signature line at the foot. The header wording, the unit
// ("Gramms", the company's own spelling) and every figure below are the
// company's, not this system's: nothing is rounded, re-scaled or filled in.
// A month the report leaves empty stays empty here (null), including the
// Total of a year still in progress.
//
// WHAT IS COMPUTED AND WHAT IS TRANSCRIBED. Only the rodent report has a
// digital register behind it: F/HR/17's check point 7 records each catch with
// its trap box, location and number, so for the months the register covers the
// figure is added up from it (data/selectors.ts, rodentTrendRows) and the sheet
// tints it. Lizards are counted by the service provider on the same glue boards
// but F/HR/17 has no column for them, and the flies are WEIGHED in grams out of
// the electric fly killers, which is a different measurement from the
// approximate board counts on the fortnightly F/HR/18 register — so those two
// reports are what the provider reported, transcribed, and the sheet says so.
// See REQUIREMENTS §41.

export interface TrendReportYear {
  year: number;
  /** Jan..Dec; null = the cell is empty on the company's own page. */
  months: (number | null)[];
  /** As printed — null where the year was still in progress. */
  total: number | null;
}

/** The header wording of one of the three reports, exactly as printed. */
export interface TrendReportMeta {
  title: string;
  source: string;
  unit: string;
  targetPest: string;
  /** The y axis title on all three pages. */
  yAxisLabel: string;
  /** Singular/plural word for a bar's tooltip ("3 rodent(s)"). */
  unitWord: string;
}

export const TREND_REPORT_SOURCE_FILE = "GP-3 Trend Analysis - 2025.pdf";
export const TREND_PREPARED_BY = "Report prepared by";
const Y_AXIS = "Number or Quantity Trapped";
const GLUE_BOARDS = "Trapped on Glue boards in Roda-boxes";

export const RODENT_TREND_REPORT: TrendReportMeta = {
  title: "RODENT CATCH REPORT AND TREND ANALYSIS",
  source: GLUE_BOARDS,
  unit: "Number",
  targetPest: "Rodents",
  yAxisLabel: Y_AXIS,
  unitWord: "rodent(s)",
};

export const LIZARD_TREND_REPORT: TrendReportMeta = {
  title: "LIZARD CATCH REPORT AND TREND ANALYSIS",
  source: GLUE_BOARDS,
  unit: "Number",
  targetPest: "Lizard",
  yAxisLabel: Y_AXIS,
  unitWord: "lizard(s)",
};

export const FLIES_TREND_REPORT: TrendReportMeta = {
  title: "FLIES CATCH REPORT AND TREND ANALYSIS",
  source: "Collected in EFKs",
  unit: "Gramms",
  targetPest: "Flies",
  yAxisLabel: Y_AXIS,
  unitWord: "gramms",
};

// The fortnightly F/HR/18 register counts boards rather than weighing the
// catch, so a year it covers is reported in its own unit and says so.
export const FLY_BOARD_COUNT_SOURCE = "Caught on Glue boards of Fly catchers (PC-01 to PC-13)";

// ---------------------------------------------------------------------------
// page 2 — LIZARD CATCH REPORT AND TREND ANALYSIS

export const LIZARD_HISTORY_REPORTED: TrendReportYear[] = [
  { year: 2024, months: [0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0], total: 3 },
  // 2025 is reported to November; December and the Total are blank on the page.
  { year: 2025, months: [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, null], total: null },
];

// ---------------------------------------------------------------------------
// page 3 — FLIES CATCH REPORT AND TREND ANALYSIS (grams collected in the EFKs)

export const FLIES_GRAMS_HISTORY_REPORTED: TrendReportYear[] = [
  { year: 2024, months: [30, 22, 22, 16, 15, 17, 15, 13, 22, 24, 22, 17], total: 235 },
  // 2025 is reported to October; November, December and the Total are blank.
  { year: 2025, months: [25, 23, 21, 30, 23, 23, 26, 23, 23, 29, null, null], total: null },
];
