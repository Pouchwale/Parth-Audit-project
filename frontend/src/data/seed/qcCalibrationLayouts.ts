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
// "I. Calibration Date:-"), F/QC/11's Due Date stands at the right of its line (taken away 28-Oct-2026, back 30-Oct-2026);
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

/**
 * THE CALIBRATION CERTIFICATE OF THE WEIGHT SCALE AND THE GSM CUTTING PLATES (the owner, 27-Oct-2026: "in qc 12 and
 * 11 calibration date, calibration due date and is fix which is 21-9-26 and due date is 20-9-27"; on 28-Oct-2026:
 * "you need to add calibration expiry date is 20-9-27 in qc-11 and 12"). Every new sheet starts with the due date in
 * its Calibration Expiry - F/QC/12's and F/QC/11's - and it stays editable; a sheet keeps the later of the last sheet's
 * date and this (autoFill.newest), so the 2024 dates of the pages on file never come back, and the next certificate's
 * date, once written, carries on. F/QC/11's "I. Calibration Date:- / Due Date:-" row holds the certificate's 21-09-26 and
 * 20-09-27 the same way (taken away on 28-Oct-2026, back on the owner's word of 30-Oct-2026: "you have missed the
 * calibration date and due date in format so add that", REQUIREMENTS §147); F/QC/12's paper has no Calibration Date box.
 */
export const CALIBRATION_CERTIFICATE = { date: "2026-09-21", due: "2027-09-20" } as const;

/** The procedure both papers print below the grid, word for word. */
export const CALIBRATION_PROCEDURE =
  "Calibration to be done by qualified QA person as per calibration work procedure. If any deviation is found during internal calibration, it must be reported to the QA manager. Calibration records of all weights used must be available and valid.";

/** The line both calibration papers print under the company's name (REQUIREMENTS §111 part 6). */
export const MANUFACTURERS_LINE = "Manufacturers of Printed Cartons, Self Adhesive Labels, Shrink sleeves, Corrugated Boxes";

const text = (key: string, label: string, width?: number): LogColumn => ({ key, label, type: "text", width });

/** The five test weights of the weight scale sheet, as the form prints them. */
export const WEIGHT_SCALE_COLUMNS: LogColumn[] = [
  // THE DATE IS THE PERSON'S (the owner, 29-Oct-2026, REQUIREMENTS §145: "date will decide by user not system"): the
  // first line's is typed; each line below starts on the Next Due Date above it (LogSheetLayout.nextDueChain). A demo
  // sheet's are its month's weeks (engine/autoFill.ts calibrationSample), never the supplied page's 2024 dates (§75).
  { key: "date", label: "Date", type: "date", width: 130 },
  { key: "testedBy", label: "Tested By", type: "text", width: 130, autoFill: { sign: true } },
];
/**
 * THE STANDARD TEST WEIGHTS (REQUIREMENTS §117). The owner, 16-Oct-2026, on DCRS's printed sheet: "Weights should be
 * fixed (default) (ex: 50, 100, 200)" — the five weights the laboratory places each week, written in the Weight cells
 * of every new sheet, in the unit the plant writes on the paper ("gm"), and editable. The scale reads 0.1 gm to 600 gm.
 */
// The owner, 29-Oct-2026, with the laboratory's own page (Meet's and Harsh's weeks of Sep-Oct 2026) and his DCRS sheet:
// "weight 1 is always 0.050 mg and weight 2 is always 50.000 gm and weight 3 is 100.000 gm and weight 4 is 200.000gm and
// weight 5 is always 400.000 gm" - as the page writes them (REQUIREMENTS §142).
export const STANDARD_WEIGHTS = ["0.050mg", "50.000gm", "100.000gm", "200.000gm", "400.000gm"];
/**
 * TESTED VALUES 1 AND 2 ARE FIXED (REQUIREMENTS §142; the owner, 29-Oct-2026: "tested value 1 has fix 0.050 mg and tested
 * value 2 is 50.000gm", deviation 0% "always by default"): written on every new line as the weight itself, as the
 * laboratory's page has them every week. Tested Values 3 to 5 are what the scale shows: the person's to type, the
 * Deviation and Pass / Fail following.
 */
export const FIXED_TESTED_VALUES = 2;

for (let i = 1; i <= 5; i++) {
  // Fixed on every line, never typed over (the owner, 30-Oct-2026, REQUIREMENTS §146).
  WEIGHT_SCALE_COLUMNS.push({ ...text(`weight${i}`, `Weight ${i}`, 110), standard: STANDARD_WEIGHTS[i - 1], locked: true });
  WEIGHT_SCALE_COLUMNS.push(
    i <= FIXED_TESTED_VALUES ? { ...text(`testedValue${i}`, `Tested Value ${i}`, 120), standard: STANDARD_WEIGHTS[i - 1] } : text(`testedValue${i}`, `Tested Value ${i}`, 120)
  );
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

/** THE BOXES EVERY NEW F/QC/12 SHEET STARTS WITH (the owner, 29-Oct-2026, with his sheet's header block: "i want this
 * values fix in but editable in format of qc-12", REQUIREMENTS §142 note 6): the balance's standing facts as the format's
 * own fixed values (autoFill.default), there with or without an earlier page, each editable on the sheet; what a person
 * writes over one carries to the next sheet as before (§117), and a box left blank starts fixed again. The Serial No is
 * the person's, as the owner's page leaves it; the Calibration Expiry is the certificate's (CALIBRATION_CERTIFICATE). */
export const WEIGHT_SCALE_FIXED_BOXES: Record<string, string> = {
  deviceIdNo: "QC-76",
  location: "Laboratory",
  department: "LAB",
  manufacturer: "Force Strain Sensors",
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
  // "Manufacturers of Printed Cartons, ..." under the company's name, as the paper prints it.
  underCompany: [MANUFACTURERS_LINE],
  // Three rows of three: Device ID No, Location, Department / Manufacturer, Serial No,
  // Calibration Expiry / Minimum Reading Capacity, Maximum Reading Capacity, Acceptable Tolerance.
  headerColumns: 3,
  // "Date", "Tested By", "Weight 1", "Pass / Fail" in the paper's own letters, not the sheet's capitals.
  headingsAsPrinted: true,
  // Each box's words as the paper prints them, its colon included; the names stay those the history and Mitra go by.
  headerFields: [
    // The balance's standing facts as the format's own fixed values, editable on the sheet (WEIGHT_SCALE_FIXED_BOXES).
    { key: "deviceIdNo", label: "Device ID No", printedLabel: "Device ID No:", type: "text", width: 140, autoFill: { carryForward: true, default: WEIGHT_SCALE_FIXED_BOXES.deviceIdNo } },
    { key: "location", label: "Location", printedLabel: "Location:", type: "text", width: 140, autoFill: { carryForward: true, default: WEIGHT_SCALE_FIXED_BOXES.location } },
    { key: "department", label: "Department", printedLabel: "Department:", type: "text", width: 120, autoFill: { carryForward: true, default: WEIGHT_SCALE_FIXED_BOXES.department } },
    { key: "manufacturer", label: "Manufacturer", printedLabel: "Manufacturer:", type: "text", width: 170, autoFill: { carryForward: true, default: WEIGHT_SCALE_FIXED_BOXES.manufacturer } },
    { key: "serialNo", label: "Serial No", printedLabel: "Serial No:", type: "text", width: 110, autoFill: { carryForward: true } },
    // The certificate's due date, 20-09-27, on every new sheet (CALIBRATION_CERTIFICATE, the owner, 27-Oct-2026).
    { key: "calibrationExpiry", label: "Calibration Expiry", printedLabel: "Calibration Expiry:", type: "date", width: 150, autoFill: { carryForward: true, default: CALIBRATION_CERTIFICATE.due, newest: true } },
    { key: "minReadingCapacity", label: "Minimum Reading Capacity", printedLabel: "Minimum Reading Capacity:", type: "text", width: 150, autoFill: { carryForward: true, default: WEIGHT_SCALE_FIXED_BOXES.minReadingCapacity } },
    { key: "maxReadingCapacity", label: "Maximum Reading Capacity", printedLabel: "Maximum Reading Capacity:", type: "text", width: 150, autoFill: { carryForward: true, default: WEIGHT_SCALE_FIXED_BOXES.maxReadingCapacity } },
    { key: "acceptableTolerance", label: "Acceptable Tolerance", printedLabel: "Acceptable Tolerance:", type: "text", width: 140, autoFill: { carryForward: true, default: WEIGHT_SCALE_FIXED_BOXES.acceptableTolerance } },
  ],
  columns: WEIGHT_SCALE_COLUMNS,
  // A SHEET A MONTH, A LINE A WEEK (the owner, 29-Oct-2026, REQUIREMENTS §145: "month wise from January to December ...
  // 4 rows in document each row denotes one week"), as the laboratory's own page has four weeks on it - until then one
  // sheet a week (§111 rule 3, §117). A fifth week, or a re-test after a Fail, is a line added (22-Oct-2026).
  rowMode: { kind: "free", minRows: 4, typicalRows: 4 },
  // The weeks follow one another: a line's Next Due Date a week on from its date, the next line starting on it (§145).
  nextDueChain: { dateKey: "date", nextKey: "nextDueDate", days: 7 },
  // A new month's sheet is written as the last one was — every box, editable (§117)...
  carryForwardAll: true,
  // ...but not its lines (the owner, 29-Oct-2026, REQUIREMENTS §142): each week's line starts from its standards - the
  // five weights and the fixed Tested Values 1 and 2 - and its readings and date are that week's own.
  carryLines: false,
  // A landscape page, as the original is (§117): the print, the PDF, the Word and Excel files follow it.
  paper: "landscape",
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
/** The four lines a plate is measured on (engine/nominalFill.ts). */
export const GSM_MEASURED = ["Tasted-1", "2", "3", "4"];

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

/**
 * What the paper prints in its first four boxes (REQUIREMENTS §111): the four plates and where they are kept. Since
 * §117 (the owner, 16-Oct-2026: "Location: LAB" circled, "make each and every part of document editable") they are
 * the START of every new sheet's boxes, not read-only words: the person writes over any of them, and the next sheet
 * carries what was written (carryForwardAll).
 */
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
  // A landscape page, as the original is (REQUIREMENTS §117): the print, the PDF, the Word and Excel files follow it.
  paper: "landscape",
  // The paper's own Index column (Tasted-1, 2, 3, 4, Pass/Fail, Sign.) numbers the lines (REQUIREMENTS §102).
  ownLineNumbers: true,
  // "Manufacturers of Printed Cartons, ..." under the company's name, as the paper prints it.
  underCompany: [MANUFACTURERS_LINE],
  headerColumns: 3,
  // "Index", "No. 54", "20 x 20cm", "Deviation" in the paper's own letters, not the sheet's capitals.
  headingsAsPrinted: true,
  // Each box's words as the paper prints them, its colon or ":-" included; the names stay those the history and Mitra go by.
  headerFields: [
    // The paper's words start each of these four boxes; every one is editable (§117).
    { key: "deviceIdNo", label: "Device ID No", printedLabel: "Device ID No:", type: "text", width: 170, autoFill: { default: GSM_PRINTED.deviceIdNo, carryForward: true } },
    { key: "location", label: "Location", printedLabel: "Location:", type: "text", width: 120, autoFill: { default: GSM_PRINTED.location, carryForward: true } },
    { key: "department", label: "Department", printedLabel: "Department:", type: "text", width: 120, autoFill: { default: GSM_PRINTED.department, carryForward: true } },
    { key: "manufacturer", label: "Manufacturer", printedLabel: "Manufacturer:", type: "text", width: 170, autoFill: { default: GSM_PRINTED.manufacturer, carryForward: true } },
    { key: "serialNo", label: "Serial No", printedLabel: "Serial No:", type: "text", width: 120, autoFill: { carryForward: true } },
    // THE CERTIFICATE'S DATES ON EVERY NEW SHEET (CALIBRATION_CERTIFICATE, the owner, 27-Oct-2026): Calibration Expiry and
    // Due Date 20-09-27, I. Calibration Date 21-09-26, each editable and kept when a later one is written (autoFill.newest).
    // The paper prints "I. Calibration Date:-" over the grid; its name stays "Calibration Date". The row was taken away on
    // 28-Oct-2026 and is back on the owner's word of 30-Oct-2026 (REQUIREMENTS §147): what a sheet held in it shows again.
    { key: "calibrationExpiry", label: "Calibration Expiry", printedLabel: "Calibration Expiry:", type: "date", width: 150, autoFill: { carryForward: true, default: CALIBRATION_CERTIFICATE.due, newest: true } },
    { key: "calibrationDate", label: "Calibration Date", printedLabel: "I. Calibration Date:-", type: "date", width: 150, autoFill: { default: CALIBRATION_CERTIFICATE.date, newest: true } },
    // "Due Date:-" at the right of the line, where the paper prints it (paperColumn).
    { key: "dueDate", label: "Due Date", printedLabel: "Due Date:-", type: "date", width: 150, paperColumn: 3, autoFill: { default: CALIBRATION_CERTIFICATE.due, newest: true } },
  ],
  columns: gsmColumns,
  rowMode: { kind: "fixedRows", rows: GSM_ROWS.map((parameter) => ({ parameter })) },
  // A new month's sheet is written as the last one was — every box and every line, editable (§117).
  carryForwardAll: true,
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
