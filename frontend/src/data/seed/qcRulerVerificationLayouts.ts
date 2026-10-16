import type { LogHeaderField, LogSheetLayout } from "../../types";

// F/QC/17, THE MEASURING SCALE (RULER) INTERNAL VERIFICATION RECORD (REQUIREMENTS §111, part 8). The owner sent it on
// 14-Oct-2026 as "Copy of F-QC-17-Updated Scale (Ruler) internal verification record - Copy.pdf" (with its .xlsx), a
// page filled in on 24.09.2024; until then it was on the Master List of Formats only (F/SYS/02: "Scale / Ruler
// internal calibration record", 01.12.21). One record verifies one ruler against the master scale.
//
// As the paper: "Measuring Scale (Ruler) Internal Verification Record" in its own letters; the master scale's details
// as a table under "Master Measuring Scale (Ruler) Details" — Make, Serial number, Range, Least count, Calibration date,
// Calibration due date, Calibration report number; the ruler's under "Measuring Scale (Ruler) under calibration
// details" — the same, but its last line "Accetable tolerance" (the paper's spelling) with "+ / - 1 mm" printed in it;
// then # | Master calibrator reading | Observed reading (mm) | Difference | Status (Pass/Fail) | Calibration performed
// by, its six points 50, 100, 150, 200, 250 and 290 mm printed, and the Status and the name ONE cell down the six
// lines. The Difference is worked out (engine/calibration.ts) and judged by the printed tolerance (toleranceFrom); the
// Status follows it.
//
// The master scale is the plant's own (Kristeen, QC-44, 0 - 600 mm, 1 mm): its identity is a standing value, written on
// every sheet. Its calibration date, due date and report number are its current certificate's, and the ruler's own
// details are the ruler's: the person writes them. The 2024 dates of the page supplied are never put into a new record.

/** The six points the paper prints, in mm. */
export const RULER_POINTS = [50, 100, 150, 200, 250, 290];

/** The paper's acceptable tolerance, printed in its box. */
export const RULER_TOLERANCE = "+ / - 1 mm";

const MASTER_ROWS = ["Make", "Serial number", "Range", "Least count", "Calibration date", "Calibration due date", "Calibration report number"];
const RULER_ROWS = ["Make", "Serial number", "Range", "Least count", "Calibration date", "Calibration due date", "Accetable tolerance"];

const master: LogHeaderField[] = [
  {
    key: "masterMake",
    label: "Master Make",
    type: "text",
    required: true,
    autoFill: { default: "Kristeen" },
    // The paper's table, headed across its two columns (BoxTable: no columns of its own, the heading in its corner).
    boxTable: { corner: "Master Measuring Scale (Ruler) Details", columns: [], rows: MASTER_ROWS },
  },
  { key: "masterSerialNo", label: "Master Serial number", type: "text", required: true, autoFill: { default: "QC-44" } },
  { key: "masterRange", label: "Master Range", type: "text", autoFill: { default: "0 - 600 mm" } },
  { key: "masterLeastCount", label: "Master Least count", type: "text", autoFill: { default: "1 mm" } },
  { key: "masterCalibrationDate", label: "Master Calibration date", type: "date", required: true },
  { key: "masterCalibrationDueDate", label: "Master Calibration due date", type: "date", required: true },
  { key: "masterCalibrationReportNo", label: "Master Calibration report number", type: "text", required: true },
];

const ruler: LogHeaderField[] = [
  {
    key: "make",
    label: "Make",
    type: "text",
    required: true,
    boxTable: { corner: "Measuring Scale (Ruler) under calibration details", columns: [], rows: RULER_ROWS },
  },
  { key: "serialNo", label: "Serial number", type: "text", required: true },
  { key: "range", label: "Range", type: "text" },
  { key: "leastCount", label: "Least count", type: "text" },
  { key: "calibrationDate", label: "Calibration date", type: "date", required: true, autoFill: { dueDate: true } },
  { key: "calibrationDueDate", label: "Calibration due date", type: "date", required: true },
  // "Accetable" is the paper's own spelling; the paper's "+ / - 1 mm" starts the box and judges every Difference
  // (toleranceFrom reads what the box holds), and the person may write another over it (REQUIREMENTS §117).
  { key: "acceptableTolerance", label: "Accetable tolerance", type: "text", autoFill: { default: RULER_TOLERANCE } },
];

export const QC_RULER_VERIFICATION_LAYOUTS: Record<string, LogSheetLayout> = {
  "qc-ruler-verification": {
    documentId: "qc-ruler-verification",
    // A portrait page, as the original is (REQUIREMENTS §117).
    paper: "portrait",
    titleAsPrinted: true,
    headingsAsPrinted: true,
    // The paper numbers its six points under "#": the sheet's own numbers, headed as the paper heads them.
    srNoLabel: "#",
    headerFields: [...master, ...ruler],
    columns: [
      // The six printed points start every line, and the person may write the master's own readings over them: the
      // owner, 16-Oct-2026, "master cal. reading not available for 600 mm scale" (REQUIREMENTS §117). The Difference
      // follows what is written (engine/calibration.ts).
      { key: "masterReading", label: "Master calibrator reading", type: "text", width: 170 },
      { key: "observed", label: "Observed reading (mm)", type: "number", decimals: 0, required: true, width: 120 },
      { key: "difference", label: "Difference", type: "text", computed: true, toleranceFrom: "acceptableTolerance", width: 100 },
      // One Status and one name down the six lines, as the paper draws them.
      { key: "status", label: "Status (Pass/Fail)", type: "select", options: ["Pass", "Fail"], required: true, merged: {}, width: 110 },
      { key: "performedBy", label: "Calibration performed by", type: "text", required: true, merged: {}, autoFill: { sign: true }, width: 170 },
    ],
    rowMode: { kind: "fixedRows", rows: RULER_POINTS.map((mm) => ({ masterReading: `${mm} mm` })) },
    // A new record is written as the last one was: the master's and the ruler's details, the readings — every box
    // editable (REQUIREMENTS §117: "once I have filled the data, same should be filled automatically as per previous").
    carryForwardAll: true,
    specimenSource: "Copy of F-QC-17-Updated Scale (Ruler) internal verification record - Copy.pdf (filled 24.09.2024, supplied 14-Oct-2026)",
    originalPages: [{ src: "/source/fqc17-ruler-internal-verification.jpg", caption: "F/QC/17 (00/01.12.2021) - Measuring Scale (Ruler) Internal Verification Record, the page of 24.09.2024 as supplied on 14-Oct-2026" }],
  },
};
