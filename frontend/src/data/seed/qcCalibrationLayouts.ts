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
// Every heading, every printed word and the procedure note are the paper's own.
// The one difference in shape, and it is the paper's own doing: the weight
// scale sheet prints the Deviation % of each entry on a second line under it,
// which a grid cannot hold, so each weight carries its own Deviation % column
// on the same line. Nothing is added and nothing is dropped.
//
// THE DEVIATION IS WORKED OUT, NOT TYPED (REQUIREMENTS §61, engine/calibration.ts):
// (tested value − weight) ÷ weight × 100 on the weight scale, with Pass / Fail
// against the sheet's Acceptable Tolerance; measured area against the plate's
// printed size on the GSM cutting plate. The Deviation % columns are `computed`.

const PROCEDURE =
  "PROCEDURE: Calibration to be done by qualified QA person as per calibration work procedure. If any deviation is found during internal calibration, it must be reported to the QA manager. Calibration records of all weights used must be available and valid.";

const text = (key: string, label: string, width?: number): LogColumn => ({ key, label, type: "text", width });
const deviation = (key: string): LogColumn => ({ key, label: "Deviation %", type: "text", width: 90, computed: true });

/** The five test weights of the weight scale sheet, as the form prints them. */
export const WEIGHT_SCALE_COLUMNS: LogColumn[] = [
  { key: "date", label: "Date", type: "date", width: 130 },
  { key: "testedBy", label: "Tested By", type: "text", width: 130, autoFill: { sign: true } },
];
for (let i = 1; i <= 5; i++) {
  WEIGHT_SCALE_COLUMNS.push(text(`weight${i}`, `Weight ${i}`, 110));
  WEIGHT_SCALE_COLUMNS.push(text(`testedValue${i}`, `Tested Value ${i}`, 120));
  WEIGHT_SCALE_COLUMNS.push(deviation(`deviation${i}`));
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
  instructions: [
    "WEEKLY INTERNAL CALIBRATION RECORDS - WEIGHT SCALE. One line per weekly calibration: the five test weights, the value the scale showed for each, the deviation, Pass / Fail, the tester's sign and when the next one is due.",
    PROCEDURE,
    "On the paper the Deviation % of each entry is written on a second line beneath it; here every weight carries its own Deviation % column on the same line. Each Deviation % is worked out from the weight and its tested value — (tested − weight) ÷ weight × 100, in whatever unit they are written — and Pass / Fail follows the Acceptable Tolerance above.",
  ],
  headerFields: [
    { key: "deviceIdNo", label: "Device ID No", type: "text", width: 140, autoFill: { carryForward: true } },
    { key: "location", label: "Location", type: "text", width: 140, autoFill: { carryForward: true } },
    { key: "department", label: "Department", type: "text", width: 120, autoFill: { carryForward: true } },
    { key: "manufacturer", label: "Manufacturer", type: "text", width: 170, autoFill: { carryForward: true } },
    { key: "serialNo", label: "Serial No", type: "text", width: 110, autoFill: { carryForward: true } },
    { key: "calibrationExpiry", label: "Calibration Expiry", type: "date", width: 150, autoFill: { carryForward: true } },
    { key: "minReadingCapacity", label: "Minimum Reading Capacity", type: "text", width: 150, autoFill: { carryForward: true } },
    { key: "maxReadingCapacity", label: "Maximum Reading Capacity", type: "text", width: 150, autoFill: { carryForward: true } },
    { key: "acceptableTolerance", label: "Acceptable Tolerance", type: "text", width: 140, autoFill: { carryForward: true } },
  ],
  columns: WEIGHT_SCALE_COLUMNS,
  rowMode: { kind: "free", minRows: 1, typicalRows: 4 },
  specimenHeader: WEIGHT_SCALE_HEADER,
  specimenRows: WEIGHT_SCALE_SPECIMEN_LINES,
  specimenSource: "weekly and monthly internal calibration records.pdf, page 1 — F/QC/12 (01/01.01.2022), four calibrations Feb–Mar 2024",
};

// ---------------------------------------------------------------------------
// F/QC/11 — MONTHLY INTERNAL CALIBRATION RECORDS – GSM CUTTING PLATE
//
// The paper's grid is read down the page: four test rows, then Pass/Fail, then
// Sign — each of the four plates a pair of columns (the size measured, and the
// deviation). Exactly that, here.

export const GSM_PLATES: { key: string; no: string; size: string }[] = [
  { key: "p54", no: "No. 54", size: "20 x 20cm" },
  { key: "p55", no: "No. 55", size: "10 x 10cm" },
  { key: "p56", no: "No. 56", size: "5 x 5cm" },
  { key: "p57", no: "No. 57", size: "2.5 x 2.5cm" },
];

export const GSM_ROWS = ["Tasted-1", "2", "3", "4", "Pass/Fail", "Sign."];

const gsmColumns: LogColumn[] = [{ key: "parameter", label: "Index", type: "text", fixed: true, width: 90 }];
for (const plate of GSM_PLATES) {
  gsmColumns.push(text(plate.key, `${plate.no} (${plate.size})`, 130));
  gsmColumns.push(deviation(`${plate.key}dev`));
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

export const GSM_HEADER: Record<string, string> = {
  deviceIdNo: "1-54, 2-55, 3-56, 4-57",
  location: "LAB",
  department: "LAB",
  manufacturer: "Global Eng. Co. (GEC)",
  serialNo: "TO BE CONFIRMED",
  calibrationExpiry: "2025-09-22",
  calibrationDate: "2024-12-31",
  dueDate: "",
};

const gsmPlate: LogSheetLayout = {
  documentId: "qc-gsm-plate-calibration",
  instructions: [
    "MONTHLY INTERNAL CALIBRATION RECORDS – GSM CUTTING PLATE. The four plates — No. 54 (20 x 20cm), No. 55 (10 x 10cm), No. 56 (5 x 5cm), No. 57 (2.5 x 2.5cm) — measured four times each, with the deviation beside every measurement, then Pass / Fail and the tester's sign for each plate.",
    PROCEDURE,
    "Each Deviation % is worked out from the size written beside it, by area, against the plate's own size printed at the head of its column.",
  ],
  headerFields: [
    { key: "deviceIdNo", label: "Device ID No", type: "text", width: 170, autoFill: { carryForward: true } },
    { key: "location", label: "Location", type: "text", width: 120, autoFill: { carryForward: true } },
    { key: "department", label: "Department", type: "text", width: 120, autoFill: { carryForward: true } },
    { key: "manufacturer", label: "Manufacturer", type: "text", width: 170, autoFill: { carryForward: true } },
    { key: "serialNo", label: "Serial No", type: "text", width: 120, autoFill: { carryForward: true } },
    { key: "calibrationExpiry", label: "Calibration Expiry", type: "date", width: 150, autoFill: { carryForward: true } },
    { key: "calibrationDate", label: "Calibration Date", type: "date", width: 150 },
    { key: "dueDate", label: "Due Date", type: "date", width: 150 },
  ],
  columns: gsmColumns,
  rowMode: { kind: "fixedRows", rows: GSM_ROWS.map((parameter) => ({ parameter })) },
  specimenHeader: GSM_HEADER,
  specimenRows: GSM_SPECIMEN_ROWS,
  specimenSource: "weekly and monthly internal calibration records.pdf, page 2 — F/QC/11 (01/01.01.2022), calibration of 31.12.2024",
};

export const QC_CALIBRATION_LAYOUTS: Record<string, LogSheetLayout> = {
  "qc-weight-scale-calibration": weightScale,
  "qc-gsm-plate-calibration": gsmPlate,
};
