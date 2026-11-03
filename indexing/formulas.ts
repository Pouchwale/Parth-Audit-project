// THE FORMULAS THE PLANT'S FORMATS WORK OUT, AS THE INDEX SHOWS AND THE SUPER ADMIN MAY CHANGE THEM.
//
// Each entry is one worked-out cell of a format. Its `defaultExpr` is the formula the app has always used, written in
// the formula language (indexing/formulaLanguage.ts); the app's own code works that out while the formula is the
// default, so nothing changes until the super admin changes a formula. A changed formula is worked out by
// indexing/formulaRuntime.ts in place of the code, from the moment it is saved (see there for which records it reaches).

export type FormulaResult = "number" | "percent" | "text" | "yes/no";

export interface FormulaVariable {
  name: string;
  meaning: string;
  /** A figure to try the formula on in the editor. */
  sample: number;
}

export interface FormulaSlot {
  id: string;
  /** The formats it works on (document ids) and how the index names them. */
  documentIds: string[];
  formats: string;
  /** The cell or box it fills, as the form prints it. */
  cell: string;
  title: string;
  variables: FormulaVariable[];
  defaultExpr: string;
  result: FormulaResult;
  /** How the result is written on the form. */
  shownAs: string;
}

export const FORMULA_SLOTS: readonly FormulaSlot[] = [
  // ---- QC calibration ---------------------------------------------------------------------------------------------
  //FORMULA DONE MANUALLY-30-10-2026
  {
    id: "qc12.tested-value-3",
    documentIds: ["qc-weight-scale-calibration"],
    formats: "F/QC/12 Weighing balance internal calibration",
    cell: "Tested Value 3",
    title: "Random Tested Value 3 with deviation between 0.003% and 0.008%",
    variables: [
      { name: "W", meaning: "Standard weight, in mg", sample: 100000 },
      { name: "MIN_DEV", meaning: "Minimum deviation percentage", sample: 0.003 },
      { name: "MAX_DEV", meaning: "Maximum deviation percentage", sample: 0.008 },
    ],
    defaultExpr: "ROUND(W * (1 + IF(RAND() < 0.5, -1, 1) * (MIN_DEV + RAND() * (MAX_DEV - MIN_DEV)) / 100), 3)",
    result: "number",
    shownAs: 'In the weight\'s own unit and places: "100.004gm" against "100.000gm"',
  },
  {
    id: "qc12.tested-value-4",
    documentIds: ["qc-weight-scale-calibration"],
    formats: "F/QC/12 Weighing balance internal calibration",
    cell: "Tested Value 4",
    title: "Random Tested Value 4 with deviation between 0.007% and 0.010%",
    variables: [
      { name: "W", meaning: "Standard weight, in mg", sample: 100000 },
      { name: "MIN_DEV", meaning: "Minimum deviation percentage", sample: 0.007 },
      { name: "MAX_DEV", meaning: "Maximum deviation percentage", sample: 0.010 },
    ],
    defaultExpr: "ROUND(W * (1 + IF(RAND() < 0.5, -1, 1) * (MIN_DEV + RAND() * (MAX_DEV - MIN_DEV)) / 100), 3)",
    result: "number",
    shownAs: 'In the weight\'s own unit and places: "100.009gm" against "100.000gm"',
  },
  {
    id: "qc12.tested-value-5",
    documentIds: ["qc-weight-scale-calibration"],
    formats: "F/QC/12 Weighing balance internal calibration",
    cell: "Tested Value 5",
    title: "Random Tested Value 5 with deviation between 0.006% and 0.020%",
    variables: [
      { name: "W", meaning: "Standard weight, in mg", sample: 100000 },
      { name: "MIN_DEV", meaning: "Minimum deviation percentage", sample: 0.006 },
      { name: "MAX_DEV", meaning: "Maximum deviation percentage", sample: 0.020 },
    ],
    defaultExpr: "ROUND(W * (1 + IF(RAND() < 0.5, -1, 1) * (MIN_DEV + RAND() * (MAX_DEV - MIN_DEV)) / 100), 3)",
    result: "number",
    shownAs: 'In the weight\'s own unit and places: "100.015gm" against "100.000gm"',
  },
  //till here
  {
    id: "qc12.deviation",
    documentIds: ["qc-weight-scale-calibration"],
    formats: "F/QC/12 Weighing balance internal calibration",
    cell: "Deviation 1 to 5",
    title: "Deviation % of each standard weight (never written with a minus, since 30-Oct-2026)",
    variables: [
      { name: "W", meaning: "Standard weight, in mg (any unit written is turned into mg)", sample: 200000 },
      { name: "T", meaning: "Tested value, in mg", sample: 200040 },
    ],
    defaultExpr: "ABS(T - W) / W * 100",
    result: "percent",
    shownAs: 'Per cent, up to 3 places, no minus: "0.02%"',
  },
  {
    id: "qc12.within",
    documentIds: ["qc-weight-scale-calibration"],
    formats: "F/QC/12 Weighing balance internal calibration",
    cell: "Pass / Fail",
    title: "Is a deviation within the Acceptable Tolerance? (Pass when every weight is)",
    variables: [
      { name: "D", meaning: "One weight's deviation, in %", sample: 0.02 },
      { name: "TOL", meaning: "Acceptable Tolerance written on the sheet, in %", sample: 0.1 },
    ],
    defaultExpr: "ABS(D) <= TOL",
    result: "yes/no",
    shownAs: '"Pass" when yes for every weight, else "Fail"',
  },
  {
    id: "qc11.deviation",
    documentIds: ["qc-gsm-plate-calibration"],
    formats: "F/QC/11 GSM cutting plate internal calibration",
    cell: "Deviation of each plate",
    title: "Deviation % of a plate, by area",
    variables: [
      { name: "N", meaning: "Area printed at the head of the column (e.g. 20 x 20 = 400)", sample: 400 },
      { name: "M", meaning: "Measured area of the plate", sample: 399.99 },
    ],
    defaultExpr: "(M - N) / N * 100",
    result: "percent",
    shownAs: 'Per cent, up to 3 places: "-0.003%"',
  },
  {
    id: "qc17.difference",
    documentIds: ["qc-ruler-verification", "qc-ruler-verification-300"],
    formats: "F/QC/17 Scale (ruler) internal verification, 600 mm and 300 mm",
    cell: "Difference",
    title: "Difference from the master scale, in mm",
    variables: [
      { name: "O", meaning: "Observed reading, in mm", sample: 50.5 },
      { name: "P", meaning: "Master's printed point, in mm", sample: 50 },
    ],
    defaultExpr: "O - P",
    result: "number",
    shownAs: 'mm to one place: "0.5"',
  },
  {
    id: "qc17.within",
    documentIds: ["qc-ruler-verification", "qc-ruler-verification-300"],
    formats: "F/QC/17 Scale (ruler) internal verification, 600 mm and 300 mm",
    cell: "Status",
    title: "Is a difference within the tolerance? (Pass when all six points are)",
    variables: [
      { name: "D", meaning: "One point's difference, in mm", sample: 0.5 },
      { name: "TOL", meaning: 'Tolerance printed in the box ("+ / - 1 mm" = 1)', sample: 1 },
    ],
    defaultExpr: "ABS(D) <= TOL",
    result: "yes/no",
    shownAs: '"Pass" when every point is within, "Fail" when any is outside',
  },
  // ---- Purchase -----------------------------------------------------------------------------------------------------
  {
    id: "pur05.safetyWeighted",
    documentIds: ["pur-supplier-performance"],
    formats: "F/PUR/05 RM & PM supplier performance",
    cell: "Product safety weightage",
    title: "Product safety rating at its weight (50%)",
    variables: [{ name: "R", meaning: "Product safety rating (X)", sample: 90 }],
    defaultExpr: "R * 0.5",
    result: "number",
    shownAs: 'Two places: "45.00"',
  },
  {
    id: "pur05.qualityWeighted",
    documentIds: ["pur-supplier-performance"],
    formats: "F/PUR/05 RM & PM supplier performance",
    cell: "Quality weightage",
    title: "Quality rating at its weight (40%)",
    variables: [{ name: "R", meaning: "Quality rating (Y)", sample: 85 }],
    defaultExpr: "R * 0.4",
    result: "number",
    shownAs: 'Two places: "34.00"',
  },
  {
    id: "pur05.deliveryWeighted",
    documentIds: ["pur-supplier-performance"],
    formats: "F/PUR/05 RM & PM supplier performance",
    cell: "Delivery weightage",
    title: "Delivery rating at its weight (10%)",
    variables: [{ name: "R", meaning: "Delivery rating (Z)", sample: 80 }],
    defaultExpr: "R * 0.1",
    result: "number",
    shownAs: 'Two places: "8.00"',
  },
  {
    id: "pur05.overall",
    documentIds: ["pur-supplier-performance"],
    formats: "F/PUR/05 RM & PM supplier performance",
    cell: "Overall Rating",
    title: "Overall rating from the three weighted figures",
    variables: [
      { name: "PS", meaning: "Product safety weightage", sample: 45 },
      { name: "Q", meaning: "Quality weightage", sample: 34 },
      { name: "D", meaning: "Delivery weightage", sample: 8 },
    ],
    defaultExpr: "PS + Q + D",
    result: "number",
    shownAs: 'Two places: "87.00"',
  },
  {
    id: "pur05.grade",
    documentIds: ["pur-supplier-performance"],
    formats: "F/PUR/05 RM & PM supplier performance",
    cell: "Grade",
    title: "Grade from the Overall Rating",
    variables: [{ name: "OVERALL", meaning: "Overall Rating", sample: 87 }],
    defaultExpr: 'IF(OVERALL >= 90, "A", IF(OVERALL >= 80, "B", "C"))',
    result: "text",
    shownAs: "The letter (A, B or C), blank while nothing is rated",
  },
  {
    id: "pur06.overall",
    documentIds: ["pur-service-provider-performance"],
    formats: "F/PUR/06 Service provider performance",
    cell: "Overall Rating",
    title: "Overall rating of a service provider",
    variables: [
      { name: "D", meaning: "Delivery rating (max 50)", sample: 45 },
      { name: "Q", meaning: "Quality & product safety rating (max 50)", sample: 40 },
    ],
    defaultExpr: "D + Q",
    result: "number",
    shownAs: 'Up to two places: "85"',
  },
  // ---- System -------------------------------------------------------------------------------------------------------
  {
    id: "sys07.sum",
    documentIds: ["sys-audit-risk"],
    formats: "F/SYS/07 Internal audit risk assessment",
    cell: "Sum",
    title: "Sum of internal and external non-conformities",
    variables: [
      { name: "IQA", meaning: "IQA NC count", sample: 3 },
      { name: "EXT", meaning: "External NCs count", sample: 2 },
    ],
    defaultExpr: "IQA + EXT",
    result: "number",
    shownAs: 'Whole number: "5"',
  },
  {
    id: "sys07.frequency",
    documentIds: ["sys-audit-risk"],
    formats: "F/SYS/07 Internal audit risk assessment",
    cell: "Audit frequency",
    title: "Audit frequency from the Sum",
    variables: [{ name: "SUM", meaning: "The Sum", sample: 5 }],
    defaultExpr: 'IF(SUM >= 16, "3 times / Year", IF(SUM >= 5, "Twice / Year", "Once / Year"))',
    result: "text",
    shownAs: 'The words: "Twice / Year"',
  },
  // ---- Maintenance --------------------------------------------------------------------------------------------------
  {
    id: "mnt.breakdownMinutes",
    documentIds: ["mnt-breakdown-record", "mnt-breakdown-memo"],
    formats: "F/MNT/06 Equipment breakdown record, F/MNT/05 Breakdown intimation slip (1)",
    cell: "Total breakdown minutes",
    title: "Breakdown minutes",
    variables: [{ name: "MINUTES", meaning: "Minutes from failure (intimation) to repair, worked out from the dates and times written", sample: 95 }],
    defaultExpr: "MINUTES",
    result: "number",
    shownAs: 'Whole minutes: "95" (blank when the repair is written before the failure)',
  },
  // ---- Marketing ----------------------------------------------------------------------------------------------------
  {
    id: "mkt02.average",
    documentIds: ["mkt-feedback-analysis"],
    formats: "F/MKT/02 Customer feedback analysis",
    cell: "Average Rating (each line, and the total)",
    title: "Average rating from the counts of each rating",
    variables: [
      { name: "C5", meaning: "Count of 5 Excellent", sample: 6 },
      { name: "C4", meaning: "Count of 4 Very Good", sample: 3 },
      { name: "C3", meaning: "Count of 3 Good", sample: 0 },
      { name: "C2", meaning: "Count of 2 Average", sample: 0 },
      { name: "CP", meaning: "Count of -5 Poor", sample: 0 },
    ],
    defaultExpr: "5*C5 + 4*C4 + 3*C3 + 2*C2 - 5*CP",
    result: "number",
    shownAs: 'Whole number: "42"',
  },
  {
    id: "mkt02.ideal",
    documentIds: ["mkt-feedback-analysis"],
    formats: "F/MKT/02 Customer feedback analysis",
    cell: "Ideal Rating (each line, and the total)",
    title: "Ideal rating: every count at 5",
    variables: [
      { name: "C5", meaning: "Count of 5 Excellent", sample: 6 },
      { name: "C4", meaning: "Count of 4 Very Good", sample: 3 },
      { name: "C3", meaning: "Count of 3 Good", sample: 0 },
      { name: "C2", meaning: "Count of 2 Average", sample: 0 },
      { name: "CP", meaning: "Count of -5 Poor", sample: 0 },
    ],
    defaultExpr: "(C5 + C4 + C3 + C2 + CP) * 5",
    result: "number",
    shownAs: 'Whole number: "45"',
  },
  {
    id: "mkt02.satisfied",
    documentIds: ["mkt-feedback-analysis"],
    formats: "F/MKT/02 Customer feedback analysis",
    cell: "Satisfied % average (each line)",
    title: "Satisfied % of one attribute",
    variables: [
      { name: "AVG", meaning: "The line's Average Rating", sample: 42 },
      { name: "IDEAL", meaning: "The line's Ideal Rating", sample: 45 },
    ],
    defaultExpr: "AVG / IDEAL * 100",
    result: "percent",
    shownAs: 'Per cent, two places: "93.33%"',
  },
  {
    id: "mkt02.index",
    documentIds: ["mkt-feedback-analysis"],
    formats: "F/MKT/02 Customer feedback analysis",
    cell: "% Satisfaction Index",
    title: "% Satisfaction Index of the whole sheet",
    variables: [
      { name: "AVG", meaning: "Total Average Rating", sample: 249 },
      { name: "IDEAL", meaning: "Total Ideal Rating", sample: 270 },
    ],
    defaultExpr: "AVG / IDEAL * 100",
    result: "percent",
    shownAs: 'Whole per cent: "92%"',
  },
  {
    id: "mkt04.vital",
    documentIds: ["mkt-complaint-trend"],
    formats: "F/MKT/04 Customer complaints trend analysis",
    cell: "Classification (Pareto)",
    title: "Is a cause one of the Vital Few?",
    variables: [
      { name: "RUNNING", meaning: "Defects counted so far, down to this cause", sample: 14 },
      { name: "TOTAL", meaning: "All defects on the sheet", sample: 20 },
      { name: "CUTOFF", meaning: "The cutoff, in % (80 unless the box says otherwise)", sample: 80 },
    ],
    defaultExpr: "RUNNING * 100 <= CUTOFF * TOTAL",
    result: "yes/no",
    shownAs: '"Vital Few" when yes, "Useful Many" when no',
  },
];

export const formulaSlot = (id: string): FormulaSlot | undefined => FORMULA_SLOTS.find((s) => s.id === id);

export const formulaSlotsOf = (documentId: string): FormulaSlot[] => FORMULA_SLOTS.filter((s) => s.documentIds.includes(documentId));

/** The rules the app follows on its own that are NOT arithmetic a person could rewrite: shown in the index, not edited there. */
export const BUILT_IN_RULES: readonly { documentIds: string[]; rule: string }[] = [
  { documentIds: ["qc-weight-scale-calibration"], rule: "Date: the first line starts on the previous week's Next Due Date; Next Due Date = Date + the days between checks; each line below starts on the Next Due Date above it. A date typed by a person is kept." },
  { documentIds: ["qc-weight-scale-calibration"], rule: "Weights 1–5 and Tested Values 1–2 are fixed (0.050mg, 50.000gm, 100.000gm, 200.000gm, 400.000gm). Tested Values 3–5 are filled automatically on opening by the Tested Values 3 to 5 formula above, a random reading within the Acceptable Tolerance (Pass); the person confirms the scale showed them with one click, or types the figure it did show (100.002 → 100.002gm). The sheet is not submitted until every line is confirmed." },
  { documentIds: ["qc-weight-scale-calibration"], rule: "Deviation % is never written with a minus. Within ± the Acceptable Tolerance → Pass; outside → red, Fail, and an alert on Insights (C4): report to the QA manager." },
  { documentIds: ["qc-gsm-plate-calibration"], rule: 'The Device ID No box always prints "1-54, 2-55, 3-56, 4-57" as the paper does.' },
  { documentIds: ["mnt-yearly-pm-schedule"], rule: "Actual dates are read from the F/MNT/02 PM records." },
  { documentIds: ["mkt-complaint-trend"], rule: "The trend table's Total row is each period's complaints added." },
  { documentIds: ["mkt-feedback-analysis"], rule: "The tally under each rating column is that column's counts added, and each is shown at its weight." },
];
