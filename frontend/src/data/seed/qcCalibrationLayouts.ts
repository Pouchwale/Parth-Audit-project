import type { LogColumn, LogSheetLayout } from "../../types";

// THE TWO INTERNAL CALIBRATION RECORDS (REQUIREMENTS §51) — the pages supplied
// on 16-Sep-2026 as "weekly and monthly internal calibration records.pdf",
// reproduced as log-sheet layouts:
//
//   F/QC/12 (01 / 01.01.2022)  WEEKLY INTERNAL CALIBRATION RECORDS - WEIGHT SCALE
//   F/QC/11 (01 / 01.01.2022)  MONTHLY INTERNAL CALIBRATION RECORDS – GSM CUTTING PLATE
//
// Both are on the company's Master List of Formats (F-QC-11 "GSM cutting plate
// internal calibration record", F-QC-12 "Weighing balance internal calibration
// record", both Rev. 01 of 01.01.22), and both are Quality Control's.
//
// EXACTLY AS THE PAPER (REQUIREMENTS §111, 13-Oct-2026). The owner sent both
// blank originals again ("F-QC-11 GSM cutting plate internal calibration record
// (2).pdf", "F-QC-12 Weighing balance internal calibration record (2).pdf") with
// DCRS's own prints of them, which showed DCRS's explanations above the grid,
// the device's printed values typed over, a Sr. No. the weight scale sheet does
// not have, and its Deviation % moved up beside each weight. Now:
//   * nothing is printed above either grid but the header boxes; the PROCEDURE
//     is printed BELOW the grid, where both papers print it (notesBelow);
//   * F/QC/11's Device ID No, Location, Department and Manufacturer are printed
//     on the paper, so they are printed here and never typed (printed);
//   * F/QC/12's entries take two lines, the second headed "Deviation %" with each
//     weight's Deviation % under its Tested Value (secondLine, beneath), and the
//     sheet has no Sr. No. column (ownLineNumbers);
//   * F/QC/11's plates head their columns as the paper does: "No. 54" over
//     "20 x 20cm" and "Deviation" (group).
// The boxes stand three to a line, as both papers draw them (headerColumns).
//
// AND FROM THE FINDINGS ON §111 (13-Oct-2026, REQUIREMENTS §111 part 6): every box
// carries the paper's own words, colons and ":-" included ("Device ID No:",
// "I. Calibration Date:-"), F/QC/11's Due Date stands at the right of its line;
// the headings print in the paper's letters ("No. 54", "20 x 20cm", "Deviation %"),
// not the sheet's capitals; F/QC/11's Pass/Fail and Sign. lines are one cell a
// plate (groupCellLines); a Deviation % outside F/QC/12's Acceptable Tolerance is
// highlighted (toleranceFrom); and the 31.12.2024 page's Serial No, a scribble on
// the scan, is left blank as the paper's box is, not DCRS's "TO BE CONFIRMED" —
// which the morning prepare and the sample fill carried onto every new sheet.
//
// THE DEVIATION IS WORKED OUT, NOT TYPED (REQUIREMENTS §61, engine/calibration.ts):
// (tested value − weight) ÷ weight × 100 on the weight scale, with Pass / Fail
// against the sheet's Acceptable Tolerance; measured area against the plate's
// printed size on the GSM cutting plate. The Deviation columns are `computed`.

/** The procedure both papers print below the grid, word for word. */
export const CALIBRATION_PROCEDURE =
  "Calibration to be done by qualified QA person as per calibration work procedure. If any deviation is found during internal calibration, it must be reported to the QA manager. Calibration records of all weights used must be available and valid.";

const text = (key: string, label: string, width?: number): LogColumn => ({ key, label, type: "text", width });

/** The five test weights of the weight scale sheet, as the form prints them. */
export const WEIGHT_SCALE_COLUMNS: LogColumn[] = [
  // A calibration line prepared for a week is that week's calibration, so its
  // Date is the day the record is for, and the Next Due Date on the line keeps
  // its own interval after it (engine/autoFill.ts). Copied as written, every
  // weekly sheet of a demo year read the supplied page's 2024 dates
  // (REQUIREMENTS §75).
  { key: "date", label: "Date", type: "date", width: 130, autoFill: { dueDate: true } },
  { key: "testedBy", label: "Tested By", type: "text", width: 130, autoFill: { sign: true } },
];
for (let i = 1; i <= 5; i++) {
  WEIGHT_SCALE_COLUMNS.push(text(`weight${i}`, `Weight ${i}`, 110));
  WEIGHT_SCALE_COLUMNS.push(text(`testedValue${i}`, `Tested Value ${i}`, 120));
  // On the entry's second line, under its Tested Value (REQUIREMENTS §111). Its
  // name says which weight it is: the paper heads the line "Deviation %" once.
  // Highlighted outside ± the Acceptable Tolerance written above the grid (REQUIREMENTS §111, rule 2).
  WEIGHT_SCALE_COLUMNS.push({ key: `deviation${i}`, label: `Deviation % ${i}`, type: "text", width: 90, computed: true, beneath: `testedValue${i}`, toleranceFrom: "acceptableTolerance" });
}
WEIGHT_SCALE_COLUMNS.push({ key: "passFail", label: "Pass / Fail", type: "select", options: ["Pass", "Fail"], width: 100 });
WEIGHT_SCALE_COLUMNS.push({ key: "sign", label: "Sign", type: "text", width: 110, autoFill: { sign: true } });
WEIGHT_SCALE_COLUMNS.push({ key: "nextDueDate", label: "Next Due Date", type: "date", width: 130 });

// The supplied page's four calibrations, as written (0.050mg and the four
// gram weights, every tested value equal to its weight, every deviation 0%).
const WEIGHT_SCALE_LINE = {
  weight1: "0.050mg",
  testedValue1: "0.050mg",
  deviation1: "0%",
  weight2: "50.000gm",
  testedValue2: "50.000gm",
  deviation2: "0%",
  weight3: "100.000gm",
  testedValue3: "100.000gm",
  deviation3: "0%",
  weight4: "200.000gm",
  testedValue4: "200.000gm",
  deviation4: "0%",
  weight5: "400.000gm",
  testedValue5: "400.000gm",
  deviation5: "0%",
  passFail: "Pass",
};

export const WEIGHT_SCALE_SPECIMEN_LINES: Record<string, string>[] = [
  { date: "2024-02-25", testedBy: "Rashmi", ...WEIGHT_SCALE_LINE, sign: "", nextDueDate: "2024-03-08" },
  { date: "2024-03-08", testedBy: "Rashmi", ...WEIGHT_SCALE_LINE, sign: "", nextDueDate: "2024-03-20" },
  { date: "2024-03-20", testedBy: "Anjali", ...WEIGHT_SCALE_LINE, sign: "", nextDueDate: "2024-03-27" },
  // The last line's Next Due Date is not legible on the supplied copy.
  { date: "2024-03-27", testedBy: "Anjali", ...WEIGHT_SCALE_LINE, sign: "", nextDueDate: "" },
];

export const WEIGHT_SCALE_HEADER: Record<string, string> = {
  deviceIdNo: "QC-76",
  location: "Laboratory",
  department: "LAB",
  manufacturer: "Force Strain Sensors",
  serialNo: "06",
  calibrationExpiry: "2024-08-27",
  minReadingCapacity: "0.1 gm",
  maxReadingCapacity: "600 gm",
  acceptableTolerance: "0.05 %",
};

const weightScale: LogSheetLayout = {
  documentId: "qc-weight-scale-calibration",
  // The paper has no Sr. No. column: its entries are known by their Date (REQUIREMENTS §111).
  ownLineNumbers: true,
  // Every entry takes two lines; the second is headed "Deviation %" in the Date column.
  secondLine: { label: "Deviation %" },
  // Three rows of three: Device ID No, Location, Department / Manufacturer, Serial No,
  // Calibration Expiry / Minimum Reading Capacity, Maximum Reading Capacity, Acceptable Tolerance.
  headerColumns: 3,
  // "Date", "Tested By", "Weight 1", "Pass / Fail" in the paper's own letters, not the sheet's capitals.
  headingsAsPrinted: true,
  // Each box's words as the paper prints them, its colon included; the names stay those the history and Mitra go by.
  headerFields: [
    { key: "deviceIdNo", label: "Device ID No", printedLabel: "Device ID No:", type: "text", width: 140, autoFill: { carryForward: true } },
    { key: "location", label: "Location", printedLabel: "Location:", type: "text", width: 140, autoFill: { carryForward: true } },
    { key: "department", label: "Department", printedLabel: "Department:", type: "text", width: 120, autoFill: { carryForward: true } },
    { key: "manufacturer", label: "Manufacturer", printedLabel: "Manufacturer:", type: "text", width: 170, autoFill: { carryForward: true } },
    { key: "serialNo", label: "Serial No", printedLabel: "Serial No:", type: "text", width: 110, autoFill: { carryForward: true } },
    { key: "calibrationExpiry", label: "Calibration Expiry", printedLabel: "Calibration Expiry:", type: "date", width: 150, autoFill: { carryForward: true } },
    { key: "minReadingCapacity", label: "Minimum Reading Capacity", printedLabel: "Minimum Reading Capacity:", type: "text", width: 150, autoFill: { carryForward: true } },
    { key: "maxReadingCapacity", label: "Maximum Reading Capacity", printedLabel: "Maximum Reading Capacity:", type: "text", width: 150, autoFill: { carryForward: true } },
    { key: "acceptableTolerance", label: "Acceptable Tolerance", printedLabel: "Acceptable Tolerance:", type: "text", width: 140, autoFill: { carryForward: true } },
  ],
  columns: WEIGHT_SCALE_COLUMNS,
  // One sheet a week, and one calibration on it: the week's (REQUIREMENTS §111, rule 3 — never
  // four lines on one day). The supplied page carries four weeks because it is a month of paper.
  rowMode: { kind: "free", minRows: 1, typicalRows: 1 },
  notesBelow: ["PROCEDURE:", CALIBRATION_PROCEDURE],
  specimenHeader: WEIGHT_SCALE_HEADER,
  specimenRows: WEIGHT_SCALE_SPECIMEN_LINES,
  specimenSource: "weekly and monthly internal calibration records.pdf, page 1 — F/QC/12 (01/01.01.2022), four calibrations Feb–Mar 2024",
};

// ---------------------------------------------------------------------------
// F/QC/11 — MONTHLY INTERNAL CALIBRATION RECORDS – GSM CUTTING PLATE
//
// The paper's grid is read down the page: four test rows, then Pass/Fail, then
// Sign — each of the four plates a pair of columns under its number (the size
// measured, and the deviation). Exactly that, here.

export const GSM_PLATES: { key: string; no: string; size: string }[] = [
  { key: "p54", no: "No. 54", size: "20 x 20cm" },
  { key: "p55", no: "No. 55", size: "10 x 10cm" },
  { key: "p56", no: "No. 56", size: "5 x 5cm" },
  { key: "p57", no: "No. 57", size: "2.5 x 2.5cm" },
];

export const GSM_ROWS = ["Tasted-1", "2", "3", "4", "Pass/Fail", "Sign."];

const gsmColumns: LogColumn[] = [{ key: "parameter", label: "Index", type: "text", fixed: true, width: 90 }];
for (const plate of GSM_PLATES) {
  gsmColumns.push({ key: plate.key, label: plate.size, type: "text", width: 130, group: plate.no });
  gsmColumns.push({ key: `${plate.key}dev`, label: "Deviation", type: "text", width: 90, computed: true, group: plate.no });
}

/** The supplied page: every plate measured at its own size, deviation 0%, all Pass, signed Rashmi. */
export const GSM_SPECIMEN_ROWS: Record<string, string>[] = GSM_ROWS.map((row) => {
  const line: Record<string, string> = { parameter: row };
  for (const plate of GSM_PLATES) {
    line[plate.key] = row === "Pass/Fail" ? "Pass" : row === "Sign." ? "Rashmi" : plate.size;
    line[`${plate.key}dev`] = row === "Pass/Fail" || row === "Sign." ? "" : "0%";
  }
  return line;
});

/** What the paper prints in its first four boxes (REQUIREMENTS §111): the four plates and where they are kept. */
export const GSM_PRINTED = {
  deviceIdNo: "1-54, 2-55, 3-56, 4-57",
  location: "LAB",
  department: "LAB",
  manufacturer: "Global Eng. Co. (GEC)",
} as const;

export const GSM_HEADER: Record<string, string> = {
  ...GSM_PRINTED,
  // A scribble on the scan, not legible: left blank, as the paper's box is (REQUIREMENTS §51's list of what is
  // to be confirmed says so). DCRS's "TO BE CONFIRMED" written here printed on the page and, as this is also the
  // specimen a new sheet's standing boxes come from, on every new sheet (§111 part 6).
  serialNo: "",
  calibrationExpiry: "2025-09-22",
  calibrationDate: "2024-12-31",
  dueDate: "",
};

const gsmPlate: LogSheetLayout = {
  documentId: "qc-gsm-plate-calibration",
  // The paper's own Index column (Tasted-1, 2, 3, 4, Pass/Fail, Sign.) numbers the lines (REQUIREMENTS §102).
  ownLineNumbers: true,
  headerColumns: 3,
  // "Index", "No. 54", "20 x 20cm", "Deviation" in the paper's own letters, not the sheet's capitals.
  headingsAsPrinted: true,
  // Each box's words as the paper prints them, its colon or ":-" included; the names stay those the history and Mitra go by.
  headerFields: [
    { key: "deviceIdNo", label: "Device ID No", printedLabel: "Device ID No:", type: "text", width: 170, printed: GSM_PRINTED.deviceIdNo },
    { key: "location", label: "Location", printedLabel: "Location:", type: "text", width: 120, printed: GSM_PRINTED.location },
    { key: "department", label: "Department", printedLabel: "Department:", type: "text", width: 120, printed: GSM_PRINTED.department },
    { key: "manufacturer", label: "Manufacturer", printedLabel: "Manufacturer:", type: "text", width: 170, printed: GSM_PRINTED.manufacturer },
    { key: "serialNo", label: "Serial No", printedLabel: "Serial No:", type: "text", width: 120, autoFill: { carryForward: true } },
    { key: "calibrationExpiry", label: "Calibration Expiry", printedLabel: "Calibration Expiry:", type: "date", width: 150, autoFill: { carryForward: true } },
    // The month's calibration is done on the day its record is for; left to the
    // specimen it was blank on every sheet (REQUIREMENTS §75). The Calibration
    // Expiry above is the plates' own, carried as written. The paper prints
    // "I. Calibration Date:-" over the grid; its name stays "Calibration Date".
    { key: "calibrationDate", label: "Calibration Date", printedLabel: "I. Calibration Date:-", type: "date", width: 150, autoFill: { dueDate: true } },
    // "Due Date:-" at the right of the line, where the paper prints it (paperColumn).
    { key: "dueDate", label: "Due Date", printedLabel: "Due Date:-", type: "date", width: 150, paperColumn: 3 },
  ],
  columns: gsmColumns,
  rowMode: { kind: "fixedRows", rows: GSM_ROWS.map((parameter) => ({ parameter })) },
  // Pass/Fail and Sign.: one cell under each plate, across its size and Deviation, as printed.
  groupCellLines: [GSM_ROWS.indexOf("Pass/Fail"), GSM_ROWS.indexOf("Sign.")],
  notesBelow: [`PROCEDURE: ${CALIBRATION_PROCEDURE}`],
  specimenHeader: GSM_HEADER,
  specimenRows: GSM_SPECIMEN_ROWS,
  specimenSource: "weekly and monthly internal calibration records.pdf, page 2 — F/QC/11 (01/01.01.2022), calibration of 31.12.2024",
};

export const QC_CALIBRATION_LAYOUTS: Record<string, LogSheetLayout> = {
  "qc-weight-scale-calibration": weightScale,
  "qc-gsm-plate-calibration": gsmPlate,
};
