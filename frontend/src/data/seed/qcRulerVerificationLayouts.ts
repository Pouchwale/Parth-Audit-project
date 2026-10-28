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
//
// TWO PAPERS, ONE LAYOUT (REQUIREMENTS §117, the owner, 17-Oct-2026, with a second PDF: "this PDF is for QC17 for
// 300mm. So add this also."). The plant verifies two scales against the master, and each has its own page of this one
// format: the 600 mm scale's (Serial number GP-3/MS/04, Range 0-600 mm) and the 300 mm scale's (GP-3/MS/42, 0-300 mm).
// The two pages are the same in every other line, so both documents are built by ONE function, rulerVerificationLayout,
// from a RulerScale that holds the only things which differ — the scale's Serial number and Range, its six points and
// the page each is shown against — and they cannot drift apart.
//
// THE 600 MM PAGE UPDATED (the owner, 27-Oct-2026, "Copy of F-QC-17-Updated Scale (Ruler) internal verification record
// 600 mm- Copy.pdf"): the scale under calibration is Ajanta GP-3/MS/36, 0-600mm, and its six points are 100, 200,
// 300, 400, 500 and 490 mm - the last exactly as the page prints it, though it stands beside an observed 590 and a
// Difference of 0.0 (the owner chose it, 28-Oct-2026: "490 mm, exactly as printed"; 590 from 27-Oct until then). The
// ruler's Calibration date and Calibration due date start every new sheet of both scales as 23-09-26 and 22-09-27
// (RULER_CERTIFICATE), the master scale's as 21-09-26 and 20-09-27 (MASTER_CERTIFICATE), each editable.

/**
 * THE RULER'S CALIBRATION, ON EVERY NEW SHEET (the owner, 27-Oct-2026: "measuring scale (ruler) under calibration details
 * are two date called calibration date and calibration due date which is 23-9-26 and calibration due date is 22-9-27"):
 * editable, and a sheet keeps the later of the last sheet's date and these (autoFill.newest). Until then the Calibration
 * date was the day the record is for.
 */
export const RULER_CERTIFICATE = { date: "2026-09-23", due: "2027-09-22" } as const;

/**
 * THE MASTER SCALE'S CERTIFICATE, ON EVERY NEW SHEET (the owner, 28-Oct-2026, the upper table "Master Measuring Scale
 * (Ruler) Details": "Calibration 21-9-26, due date 20-9-27"): editable, the later date kept (autoFill.newest), on both
 * scales' pages. Its report number stays the person's to write.
 */
export const MASTER_CERTIFICATE = { date: "2026-09-21", due: "2027-09-20" } as const;

/** The paper's acceptable tolerance, printed in its box. */
export const RULER_TOLERANCE = "+ / - 1 mm";

/** The title both pages print, in its own letters; the documents' names add the scale, so the library tells them apart. */
export const RULER_PAPER_TITLE = "Measuring Scale (Ruler) Internal Verification Record";

/** One scale's page of F/QC/17: what its paper prints that the other's does not. */
export interface RulerScale {
  /** The document that holds its records. */
  documentId: string;
  /** The scale under calibration, in millimetres, as the plant names the two ("600 mm", "300 mm"). */
  lengthMm: number;
  /** The Serial number its paper prints in the scale-under-calibration table. */
  serialNo: string;
  /** The Range its paper prints there, in the paper's own spelling. */
  range: string;
  /** The six points its paper prints under "Master calibrator reading", in mm. */
  points: readonly number[];
  /** The points a former page of it printed: a sheet with those lines carries its boxes, not its lines (formerRows). */
  formerPoints?: readonly (readonly number[])[];
  /**
   * Whether the paper's Serial number and Range START a new record's two boxes. The 300 mm paper's do (the owner,
   * 17-Oct-2026: "add this also", the paper's words as the start); the 600 mm document has always started with both
   * boxes empty for the person to write (§111 part 8) and is kept exactly so.
   */
  startsWithThem: boolean;
  /** The owner's PDF the page is read from, and who it was supplied to DCRS by when. */
  specimenSource: string;
  /** The picture of the page the "Show original" button opens (frontend/public/source). */
  page: { src: string; caption: string };
}

/** The 600 mm scale's document: supplied on 14-Oct-2026, its page updated on 27-Oct-2026. */
export const RULER_600_ID = "qc-ruler-verification";
/** The 300 mm scale's document: the second page of F/QC/17, supplied on 17-Oct-2026. */
export const RULER_300_ID = "qc-ruler-verification-300";

export const RULER_SCALES: readonly RulerScale[] = [
  {
    documentId: RULER_600_ID,
    lengthMm: 600,
    serialNo: "GP-3/MS/36",
    range: "0-600mm",
    points: [100, 200, 300, 400, 500, 490],
    // The page of 14-Oct-2026 printed the 300 mm page's points, and 27-Oct-2026's read its last as 590: a sheet written
    // on either carries its boxes, not its lines.
    formerPoints: [
      [50, 100, 150, 200, 250, 290],
      [100, 200, 300, 400, 500, 590],
    ],
    startsWithThem: true,
    specimenSource:
      "Copy of F-QC-17-Updated Scale (Ruler) internal verification record 600 mm- Copy.pdf (supplied 27-Oct-2026; the page of 14-Oct-2026 before it read GP-3/MS/04 and 50 to 290 mm)",
    page: {
      src: "/source/fqc17-600-ruler-internal-verification.jpg",
      caption: "F/QC/17 (00/01.12.2021) - Measuring Scale (Ruler) Internal Verification Record, the 600 mm scale's page as updated and supplied on 27-Oct-2026",
    },
  },
  {
    documentId: RULER_300_ID,
    lengthMm: 300,
    serialNo: "GP-3/MS/42",
    range: "0-300 mm",
    points: [50, 100, 150, 200, 250, 290],
    startsWithThem: true,
    specimenSource: "Copy of F-QC-17-Updated Scale (Ruler) internal verification record-300.pdf (filled 24.09.2024, supplied 17-Oct-2026)",
    page: {
      src: "/source/fqc17-300-ruler-internal-verification.jpg",
      caption: "F/QC/17 (00/01.12.2021) - Measuring Scale (Ruler) Internal Verification Record, the 300 mm scale's page of 24.09.2024 as supplied on 17-Oct-2026",
    },
  },
];

/** Every document of F/QC/17, the 600 mm scale's first. */
export const RULER_VERIFICATION_IDS: readonly string[] = RULER_SCALES.map((s) => s.documentId);

/** Whether a document is a page of F/QC/17 (the engine's calibration, sample and summary read it by this, not by one id). */
export const isRulerVerification = (documentId: string | undefined): boolean => documentId !== undefined && RULER_VERIFICATION_IDS.includes(documentId);

/** The scale a document verifies. */
export const rulerScaleOf = (documentId: string | undefined): RulerScale | undefined => RULER_SCALES.find((s) => s.documentId === documentId);

const MASTER_ROWS = ["Make", "Serial number", "Range", "Least count", "Calibration date", "Calibration due date", "Calibration report number"];
const RULER_ROWS = ["Make", "Serial number", "Range", "Least count", "Calibration date", "Calibration due date", "Accetable tolerance"];

/** The master scale's table's boxes: the plant's own scale, the same on every page. */
const masterBoxes = (): LogHeaderField[] => [
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
  // 21-09-26 and 20-09-27 on every new sheet, editable (MASTER_CERTIFICATE, the owner, 28-Oct-2026).
  { key: "masterCalibrationDate", label: "Master Calibration date", type: "date", required: true, autoFill: { default: MASTER_CERTIFICATE.date, newest: true } },
  { key: "masterCalibrationDueDate", label: "Master Calibration due date", type: "date", required: true, autoFill: { default: MASTER_CERTIFICATE.due, newest: true } },
  { key: "masterCalibrationReportNo", label: "Master Calibration report number", type: "text", required: true },
];

/** The scale-under-calibration table's boxes: the same on every page but the paper's own Serial number and Range, where its page starts them. */
function rulerBoxes(scale: RulerScale): LogHeaderField[] {
  return [
    {
      key: "make",
      label: "Make",
      type: "text",
      required: true,
      // The scale's Make and Least count as the plant's own pages print them (Ajanta, 1 mm), on every new sheet of either
      // scale and editable, as its serial and range are (the owner, 28-Oct-2026: "make this also fix ... but should be editable").
      autoFill: { default: "Ajanta" },
      boxTable: { corner: "Measuring Scale (Ruler) under calibration details", columns: [], rows: RULER_ROWS },
    },
    { key: "serialNo", label: "Serial number", type: "text", required: true, ...(scale.startsWithThem ? { autoFill: { default: scale.serialNo } } : {}) },
    { key: "range", label: "Range", type: "text", ...(scale.startsWithThem ? { autoFill: { default: scale.range } } : {}) },
    { key: "leastCount", label: "Least count", type: "text", autoFill: { default: "1 mm" } },
    // 23-09-26 and 22-09-27 on every new sheet, editable (RULER_CERTIFICATE, the owner, 27-Oct-2026).
    { key: "calibrationDate", label: "Calibration date", type: "date", required: true, autoFill: { default: RULER_CERTIFICATE.date, newest: true } },
    { key: "calibrationDueDate", label: "Calibration due date", type: "date", required: true, autoFill: { default: RULER_CERTIFICATE.due, newest: true } },
    // "Accetable" is the paper's own spelling; the paper's "+ / - 1 mm" starts the box and judges every Difference
    // (toleranceFrom reads what the box holds), and the person may write another over it (REQUIREMENTS §117).
    { key: "acceptableTolerance", label: "Accetable tolerance", type: "text", autoFill: { default: RULER_TOLERANCE } },
  ];
}

/** F/QC/17's layout for one scale: every page of it is this, whatever its scale. */
export function rulerVerificationLayout(scale: RulerScale): LogSheetLayout {
  return {
    documentId: scale.documentId,
    // The title as the paper prints it: the document's name adds its scale ("... - 300 mm") to tell the two apart.
    paperTitle: RULER_PAPER_TITLE,
    // A portrait page, as the original is (REQUIREMENTS §117).
    paper: "portrait",
    titleAsPrinted: true,
    headingsAsPrinted: true,
    // The paper numbers its six points under "#": the sheet's own numbers, headed as the paper heads them.
    srNoLabel: "#",
    headerFields: [...masterBoxes(), ...rulerBoxes(scale)],
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
    rowMode: { kind: "fixedRows", rows: scale.points.map((mm) => ({ masterReading: `${mm} mm` })) },
    ...(scale.formerPoints ? { formerRows: scale.formerPoints.map((points) => points.map((mm) => ({ masterReading: `${mm} mm` }))) } : {}),
    // A new record is written as the last one was — of ITS OWN document: the master's and the ruler's details, the
    // readings — every box editable (REQUIREMENTS §117: "once I have filled the data, same should be filled
    // automatically as per previous").
    carryForwardAll: true,
    specimenSource: scale.specimenSource,
    originalPages: [{ src: scale.page.src, caption: scale.page.caption }],
  };
}

export const QC_RULER_VERIFICATION_LAYOUTS: Record<string, LogSheetLayout> = Object.fromEntries(RULER_SCALES.map((s) => [s.documentId, rulerVerificationLayout(s)]));
