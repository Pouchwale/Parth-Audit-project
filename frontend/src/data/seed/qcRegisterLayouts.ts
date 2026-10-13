import type { LogColumn, LogHeaderField, LogSheetLayout } from "../../types";
import { GSM_PLATES, GSM_PRINTED, WEIGHT_SCALE_HEADER } from "./qcCalibrationLayouts";

// THE FIVE QUALITY CONTROL REGISTERS AND CARDS (REQUIREMENTS §57) — the last of
// the Quality Control formats supplied on 18-Sep-2026, reproduced as log-sheet
// layouts (types/logSheet.ts). These five are not inspection records: they are
// the department's standing lists, its two destruction / obsolescence registers,
// the camera challenge test log and the customer's physical tolerance card.
//
//   qc-calibration-master-list    F/QC/08 (01 / 01.12.2021)   MASTER LIST OF CALIBRATION INSTRUMENTS
//     — "Copy of F-QC-08_Master list of Calibration instruments (2).pdf"
//   qc-obsolete-artwork           F/QC/16 (00 / 01.12.2021)   REGISTER OF OBSOLETE ARTWORK
//     — "Copy of F-QC-16 OBSOLETE ARTWORK & SHADE CARD RECORD.pdf"
//   qc-printing-aids-destruction  F/QC/20 (Rev. no. - 00)     DESTRUCTION RECORD / PRINTING AIDS DESTRUCTION RECORD
//     — "F-QC-20.pdf"
//   qc-camera-challenge-test      F: QA/PRO/FL/CCT/01 (00 / 01.12.21)  Defect Detection System Camera Challenge Test
//     — "Update - Defect detection system- camera challenge.pdf"
//   qc-tolerance-card-nivea       F-QC-19                     TOLERANCE CARD FOR BEIERSDORF AG. GERMANY
//     — "F-QC-19_ Tolerance card for Nivea.pdf"
//
// TWO OF THE FIVE WERE SUPPLIED FILLED IN and are on file as real records —
// the obsolete artwork page (thirteen lines, Jan–Feb 2022) and the printing
// aids destruction page (01.06.2022, one line). Their values live in this file
// as the formats' specimens and are seeded as records in qcRegisterRecords.ts,
// so the two pages are read from one place only. The other three were supplied
// blank, so they carry no specimenHeader and no specimenRows — a box the form
// leaves blank stays blank.
//
// Every label, heading, note and printed value below is the paper's own wording,
// spelling, punctuation and spacing included. Where the paper is odd it is kept
// as printed and flagged beside the layout: the destruction page's "Nourshing",
// the camera test's "(1 st shift)" and its double spaces, the tolerance card's
// "COADING" and its three identical MISREGISTRATION panels.
//
// WHAT HAD TO BE REPRESENTED DIFFERENTLY FROM THE PAPER, and why:
//   * F/QC/08 prints the company heading above the title and the long Note
//     above the table. The heading is the header block's company line, which
//     prints the name as the owner gave it on 02-Oct-2026 (COMPANY.name); a
//     layout has no field for the Note, so it is carried verbatim as a printed
//     instruction.
//   * F/QC/20's issue and review dates are printed in the form's footer, in the
//     block that holds its format number and revision, not in a box anyone
//     fills; the header prints them there, beside the revision
//     (printedWithNumber, the review of 13-Oct-2026), so nobody can type over them.
//   * F-QC-19 IS A PHYSICAL CARD: sample labels are mounted on its panels, and
//     a mounted label cannot be reproduced on screen. What is reproduced is the
//     card's seven panels in their printed order, one line each: the panel's
//     heading as printed, and its own APPROVED BY: and SIGN. : boxes — the
//     card prints those two under EVERY panel (REQUIREMENTS §111, 13-Oct-2026;
//     until then the sheet carried one approval for the card, and two columns
//     of its own, "Sample mounted" and "Remarks", the card does not print).
//     The card heads nothing over its panel headings, so that heading is not
//     printed (printedLabel ""), and it numbers nothing, so the sheet draws no
//     Sr. No. (ownLineNumbers). Its banner, "TOLERANCE CARD FOR BEIERSDORF AG.
//     GERMANY", and its "DOC NO. : F-QC-19", printed on every panel, are the
//     page's own title and format number (components/documents/DocumentHeader.tsx).
//   * Every other grid's Sr. No. column is the renderer's own and is never declared.
//
// F/QC/20 IS CARRIED BY TWO FORMATS. This destruction record and the Kraft
// Paper & White Top Liner inspection record (qcIncomingLayouts.ts) were both
// supplied on 18-Sep-2026 numbered F/QC/20. Both are reproduced as supplied;
// it is for the MR to confirm which format should carry the number.

const blankForm = (file: string) => `${file} (blank form supplied 18-Sep-2026 — no filled specimen)`;

// ---------------------------------------------------------------------------
// F/QC/08 — MASTER LIST OF CALIBRATION INSTRUMENTS
//
// The Note printed above the table, verbatim. It is the form's own instruction
// on what belongs on the list, who may calibrate, when the list is updated and
// where the responsibility lies.

const CALIBRATION_MASTER_LIST_NOTE =
  "Note : List of calibration instruments are those which impact the process conformity as well as product conformity. These instruments are either installed on production equipments, utility equipments, QC testing equipments. Calibration / Verification can be done by internal method (Weighing scale, Measure tape, Measuring scale, pH meter, TDS meter etc.) & External laboratories including Legal metrology for Weighing scale by weight & measure department. This list shall be updated as & when any existing instrument is calibrated / verified by external calibration agency, which may result in failure of calibration status or acceptance of calibration results. This list shall also be updated as & when any instrument is purchased. Responsibility for acceptance of calibration results lies with user department only. User department shall ensure to get their instrument calibrated / verified prior to due date of calibration / verification.";

/**
 * The sixteen printed headings, in the order the form prints them. An
 * instrument's own particulars carry forward — the form's Note says the list is
 * re-issued as instruments are calibrated or purchased, so every line that was
 * on the last list is on the next one unchanged. What changes at each
 * calibration (the current date, the next due date, the agency's report number
 * and the remark) is entered, never carried.
 */
const calibrationMasterListColumns = (): LogColumn[] => [
  { key: "instrumentName", label: "Name of Instrument", type: "text", width: 200, autoFill: { carryForward: true } },
  { key: "instrumentIdNo", label: "Instrument ID No.", type: "text", width: 140, autoFill: { carryForward: true } },
  { key: "make", label: "Make", type: "text", width: 160, autoFill: { carryForward: true } },
  { key: "purpose", label: "Purpose of Instrument", type: "text", width: 200, autoFill: { carryForward: true } },
  { key: "locationOfUse", label: "Location of use", type: "text", width: 150, autoFill: { carryForward: true } },
  { key: "instrumentRange", label: "Instrument - Range", type: "text", width: 150, autoFill: { carryForward: true } },
  { key: "leastCount", label: "Least count", type: "text", width: 120, autoFill: { carryForward: true } },
  { key: "accuracy", label: "Accuracy / Acceptable Error", type: "text", width: 170, autoFill: { carryForward: true } },
  {
    key: "methodOfCalibration",
    label: "Method of Calibration - Internal / External",
    type: "select",
    options: ["Internal", "External"],
    width: 220,
    autoFill: { carryForward: true },
  },
  { key: "frequency", label: "Frequency of Calibration", type: "text", width: 170, autoFill: { carryForward: true } },
  { key: "initialCalibrationDate", label: "Date of Initial Calibration", type: "date", width: 160, autoFill: { carryForward: true } },
  { key: "currentCalibrationDate", label: "Current Calibration date", type: "date", width: 160 },
  { key: "nextDueDate", label: "Next due date of calibration", type: "date", width: 170 },
  { key: "calibrationAgency", label: "Calibration agency", type: "text", width: 180, autoFill: { carryForward: true } },
  { key: "reportNumber", label: "Calibration report number", type: "text", width: 170 },
  { key: "remarks", label: "Remarks", type: "text", width: 180 },
];

/**
 * The instruments DCRS's two internal calibration records name, as a sample list (qcCalibrationLayouts.ts): the
 * weighing balance of F/QC/12, calibrated in-house weekly against its Acceptable Tolerance, and the four GSM cutting
 * plates of F/QC/11, monthly. Their own boxes say the rest; what neither record says (a least count, a plate's
 * error) is left blank, and the calibration dates are the person's.
 */
const CALIBRATION_MASTER_SAMPLE: Record<string, string>[] = [
  {
    instrumentName: "Weighing Balance", instrumentIdNo: WEIGHT_SCALE_HEADER.deviceIdNo, make: WEIGHT_SCALE_HEADER.manufacturer, purpose: "Weighing of GSM samples",
    locationOfUse: WEIGHT_SCALE_HEADER.location, instrumentRange: `${WEIGHT_SCALE_HEADER.minReadingCapacity} – ${WEIGHT_SCALE_HEADER.maxReadingCapacity}`, leastCount: WEIGHT_SCALE_HEADER.minReadingCapacity,
    accuracy: `± ${WEIGHT_SCALE_HEADER.acceptableTolerance}`, methodOfCalibration: "Internal", frequency: "Weekly", calibrationAgency: "In-house (F/QC/12)",
  },
  ...GSM_PLATES.map((plate) => ({
    instrumentName: `GSM Cutting Plate ${plate.size}`, instrumentIdNo: plate.no.replace("No. ", ""), make: GSM_PRINTED.manufacturer, purpose: "Cutting of GSM samples",
    locationOfUse: GSM_PRINTED.location, instrumentRange: plate.size, leastCount: "", accuracy: "", methodOfCalibration: "Internal", frequency: "Monthly", calibrationAgency: "In-house (F/QC/11)",
  })),
];

// ---------------------------------------------------------------------------
// F/QC/16 — REGISTER OF OBSOLETE ARTWORK
//
// One line per artwork or master shade card withdrawn: whose job it was, which
// FG code, who sold it, why it went obsolete and on what date.

const obsoleteArtworkColumns = (): LogColumn[] => [
  // The paper's own Sr. No., written on each line (the review of 13-Oct-2026): the page of 2022 numbers two of its lines
  // out of order, 7, 9, 8, 10, and the record keeps that. A new line is numbered after the one above it.
  { key: "srNo", label: "Sr. No.", type: "text", width: 60, autoFill: { lineNumber: true } },
  { key: "customerName", label: "Customer name", type: "text", width: 240 },
  { key: "jobName", label: "Job name", type: "text", width: 300 },
  { key: "artworkNumber", label: "Artwork number / Master Shade card number (FG Code)", type: "text", width: 220 },
  { key: "salesPerson", label: "Sales Person", type: "text", width: 150 },
  { key: "reasonObsolete", label: "Reason for artwork obsolete", type: "text", width: 200 },
  // The day the artwork was withdrawn: the record's day in Demo Mode and a sample fill (the person writes it otherwise).
  { key: "dateOfObsolete", label: "Date of obsolete", type: "date", width: 140, autoFill: { dueDate: true } },
  { key: "updatedBy", label: "Updated by - QC In-charge", type: "text", width: 170, autoFill: { sign: true } },
  { key: "remarks", label: "Remarks", type: "text", width: 180 },
];

/**
 * The supplied page: thirteen lines, 03.01.2022 to 18.02.2022, every one of
 * them obsolete for "A/W Change". The dates are written on the page as
 * dd.mm.yyyy and stored here as the ISO dates a date column holds.
 *
 * THE LINES ARE IN THE PRINTED ORDER, NOT IN Sr. No. ORDER. The page's own
 * Sr. No. column reads 1, 2, 3, 4, 5, 6, 7, 9, 8, 10, 11, 12, 13 — the eighth
 * and ninth lines down are numbered out of order on the paper. The Sr. No. is
 * the paper's own column (the review of 13-Oct-2026), so each line keeps the
 * number written on it; re-sorting the lines to match would move the lines
 * themselves, which the record must not do.
 *
 * Updated by - QC In-charge and Remarks are blank on every line of the page,
 * so they stay blank here.
 */
export const OBSOLETE_ARTWORK_LINES: Record<string, string>[] = [
  { srNo: "1", customerName: "Nivea India Pvt Ltd", jobName: "Soft 50ml Side label", artworkNumber: "FGLA11067", salesPerson: "Savan Sathwara", reasonObsolete: "A/W Change", dateOfObsolete: "2022-01-03", updatedBy: "", remarks: "" },
  { srNo: "2", customerName: "Nivea India Pvt Ltd", jobName: "Nivea Gel body lotion Aloevera Front 200ml label", artworkNumber: "FGLA10900", salesPerson: "Keyur Sathwara", reasonObsolete: "A/W Change", dateOfObsolete: "2022-01-05", updatedBy: "", remarks: "" },
  { srNo: "3", customerName: "Dabur India Ltd. Kolkata", jobName: "SA Label Ashokarishta 680 ml Kolkata", artworkNumber: "FGLA9871", salesPerson: "Keyur Sathwara", reasonObsolete: "A/W Change", dateOfObsolete: "2022-01-08", updatedBy: "", remarks: "" },
  { srNo: "4", customerName: "Aculife Healthcare Pvt. Ltd./ Nirma", jobName: "RL 500ml label", artworkNumber: "FGLA8665", salesPerson: "Savan Sathwara", reasonObsolete: "A/W Change", dateOfObsolete: "2022-01-21", updatedBy: "", remarks: "" },
  { srNo: "5", customerName: "Shreeji Agchem Pvt. Ltd", jobName: "Wilbond 3gm Label", artworkNumber: "FGLA8542", salesPerson: "Keyur Sathwara", reasonObsolete: "A/W Change", dateOfObsolete: "2022-01-23", updatedBy: "", remarks: "" },
  // The page's job name opens a bracket it never closes — the paper's own.
  { srNo: "6", customerName: "Purity Polytubes Private Limited", jobName: "Clarifying Mud Mask 75ml _ Russia Label ( Change Cylinder", artworkNumber: "FGLA9462", salesPerson: "Keyur Sathwara", reasonObsolete: "A/W Change", dateOfObsolete: "2022-01-25", updatedBy: "", remarks: "" },
  { srNo: "7", customerName: "Neilmed Pharmaceuticals Inc", jobName: "Neil Cleanse Piercing Aftercare 75ml Sleeves Rev-2", artworkNumber: "FGSL1153", salesPerson: "Keyur Sathwara", reasonObsolete: "A/W Change", dateOfObsolete: "2022-01-28", updatedBy: "", remarks: "" },
  { srNo: "9", customerName: "Neilmed Pharmaceuticals Inc", jobName: "Wound Wash 177mL Sleeve", artworkNumber: "FGSL1126", salesPerson: "Keyur Sathwara", reasonObsolete: "A/W Change", dateOfObsolete: "2022-01-30", updatedBy: "", remarks: "" },
  { srNo: "8", customerName: "Aculife Healthcare Pvt. Ltd./ Nirma", jobName: "C Box Label NS Euroflex Label", artworkNumber: "FGLA9984", salesPerson: "Savan Sathwara", reasonObsolete: "A/W Change", dateOfObsolete: "2022-02-02", updatedBy: "", remarks: "" },
  { srNo: "10", customerName: "M/s. UPL Ltd Vapi", jobName: "Viraat 100ml Label Rev2", artworkNumber: "FGLA6505", salesPerson: "Keyur Sathwara", reasonObsolete: "A/W Change", dateOfObsolete: "2022-02-02", updatedBy: "", remarks: "" },
  { srNo: "11", customerName: "Ceego Labs Pvt.Ltd.", jobName: "Magnesa Joint rescue Sleeve", artworkNumber: "FGSL0148", salesPerson: "Savan Sathwara", reasonObsolete: "A/W Change", dateOfObsolete: "2022-02-07", updatedBy: "", remarks: "" },
  { srNo: "12", customerName: "Shreeji Agchem Pvt. Ltd", jobName: "Wiltez 100ml Label", artworkNumber: "FGLA7696", salesPerson: "Keyur Sathwara", reasonObsolete: "A/W Change", dateOfObsolete: "2022-02-18", updatedBy: "", remarks: "" },
  { srNo: "13", customerName: "Shreeji Agchem Pvt. Ltd", jobName: "Wiltez 250ml Label", artworkNumber: "FGLA7697", salesPerson: "Keyur Sathwara", reasonObsolete: "A/W Change", dateOfObsolete: "2022-02-18", updatedBy: "", remarks: "" },
];

// ---------------------------------------------------------------------------
// F/QC/20 — DESTRUCTION RECORD (PRINTING AIDS DESTRUCTION RECORD)

/** What F/QC/20 printed above its grid until 13-Oct-2026 and its paper does not (logSheetLayouts.ts WITHDRAWN_EXPLANATIONS). */
export const PRINTING_AIDS_WITHDRAWN_LINE = 'The form\'s footer prints "Current Issue date 1st January 2022" and "Next Review date 31st December 2024".';

const printingAidsDestructionColumns = (): LogColumn[] => [
  { key: "itemDescription", label: "Item Description", type: "text", width: 380 },
  { key: "actualQty", label: "Actual Qty.", type: "text", width: 120 },
  { key: "destroyedBy", label: "Destroyed By", type: "text", width: 180, autoFill: { sign: true } },
  { key: "checkedBy", label: "Checked By", type: "text", width: 180, autoFill: { sign: true } },
];

/** The Date box printed above the grid, at the right of its line; the supplied page reads "Date: 01.06.2022". */
const printingAidsDestructionHeader = (): LogHeaderField[] => [
  { key: "date", label: "Date:", type: "date", required: true, width: 150, autoFill: { dueDate: true }, paperColumn: 3 },
];

/** The issue and review dates the paper prints with its format number and revision ("Format number: - F/QC/20 | Rev. no. - 00"). */
export const PRINTING_AIDS_ISSUE_DATES: { label: string; value: string }[] = [
  { label: "Current Issue date", value: "1st January 2022" },
  { label: "Next Review date", value: "31st December 2024" },
];

/**
 * The supplied page: one printing aid destroyed on 01.06.2022. "Nourshing" is
 * the page's own spelling of "Nourishing". Destroyed By and Checked By are both
 * blank on the page, so they stay blank.
 */
export const PRINTING_AIDS_DESTRUCTION_LINES: Record<string, string>[] = [
  {
    itemDescription: "Nivea Nourshing Body milk lotion 5 in 1 400ml Back Label",
    actualQty: "2",
    destroyedBy: "",
    checkedBy: "",
  },
];

export const PRINTING_AIDS_DESTRUCTION_HEADER: Record<string, string> = { date: "2022-06-01" };

// ---------------------------------------------------------------------------
// F: QA/PRO/FL/CCT/01 — Defect Detection System Camera Challenge Test
//
// The objective and the methodology as printed. "(1 st shift)" is the paper's
// own spacing, and so are the double spaces before "Also" and before "Basis".

const CAMERA_CHALLENGE_OBJECTIVE =
  "Objective: The objective of the camera challenge test is to ensure that defect detection systems are fully functional, calibrated and performing as intended.";

const CAMERA_CHALLENGE_METHODOLOGY =
  "Methodology: At the start of every cycle of production (1 st shift), the machine operator must make intentional markings on the loaded roll. Number of markings made must be more than 3, and size of each marking should be more than 0.5 mm.  Also this test will have to be done at post breakdown, Machine stoppage, Power failure etc.  Basis this, the operator must fill the below form and only if every marking has been captured, the challenge test can be considered to be pass. This process must be verified by an IPQC executive.";

const cameraChallengeColumns = (): LogColumn[] => [
  // A daily record: the challenge tests on it are that day's (REQUIREMENTS §75).
  { key: "date", label: "Date", type: "date", width: 140, autoFill: { dueDate: true } },
  { key: "machineNo", label: "M/C No.", type: "text", width: 120 },
  { key: "operatorName", label: "Operator Name", type: "text", width: 180, autoFill: { carryForward: true } },
  { key: "marksMade", label: "No. Of Marks Made", type: "number", decimals: 0, width: 150 },
  { key: "marksDetected", label: "No. Of Marks Detected", type: "number", decimals: 0, width: 170 },
  { key: "result", label: "Result", type: "select", options: ["Pass", "Fail"], width: 110 },
  { key: "verificationSign", label: "Verification Sign", type: "text", width: 160, autoFill: { sign: true } },
];

// ---------------------------------------------------------------------------
// F-QC-19 — TOLERANCE CARD FOR BEIERSDORF AG. GERMANY
//
// A physical card: seven printed panels, each headed with an error category,
// onto which sample labels are mounted, with an APPROVED BY / SIGN. box under
// each panel. DOC NO. : F-QC-19 is printed on the card as its format number,
// not as a box anyone fills, so it is not a field; nor is the customer, which
// the card names in its own title.

/** The explanation DCRS used to print above the card, withdrawn (REQUIREMENTS §111, data/seed/logSheetLayouts.ts asThePaper). */
export const TOLERANCE_CARD_NOTE =
  "The card's mounted sample labels are physical; this reproduces the card's panels, their error categories and the approval boxes.";

/**
 * The card's panels in the printed order, each exactly as headed. THREE PANELS
 * CARRY "ERROR : MISREGISTRATION" — the card really does head three of its
 * seven panels the same way, each with its own mounted samples — and "COADING"
 * is the card's own spelling of "CODING". Both are kept as printed.
 */
const TOLERANCE_CARD_PANELS: string[] = [
  "ERROR : MISREGISTRATION",
  "ERROR : MISREGISTRATION",
  "ERROR : MISREGISTRATION",
  "ERROR : OTHER",
  "ERROR : IN BATCH COADING AREA",
  "ERROR : IN NIVEA LOGO",
  "ERROR : IN PLAIN AREA",
];

/**
 * One line per panel: its heading as the card prints it, and the APPROVED BY: and SIGN. : boxes the
 * card prints under every panel (REQUIREMENTS §111). The panel heading's column has a name of its own
 * for Mitra and a record's history; the card prints no heading over it.
 */
const toleranceCardColumns = (): LogColumn[] => [
  { key: "errorCategory", label: "Error category", printedLabel: "", type: "text", fixed: true, width: 300 },
  { key: "approvedBy", label: "APPROVED BY:", type: "text", width: 240, autoFill: { sign: true } },
  { key: "sign", label: "SIGN. :", type: "text", width: 200, autoFill: { sign: true } },
];

// ---------------------------------------------------------------------------

export const QC_REGISTER_LAYOUTS: Record<string, LogSheetLayout> = {
  // ---- F/QC/08 (01 / 01.12.2021) — MASTER LIST OF CALIBRATION INSTRUMENTS ----
  "qc-calibration-master-list": {
    documentId: "qc-calibration-master-list",
    // Its sixteen headings in the paper's own letters ("Name of Instrument", "Least count"), not in capitals.
    headingsAsPrinted: true,
    // The list's own Note, printed above the table. The company heading and the
    // title above it are the page's letterhead, which every document page prints
    // already (components/documents/DocumentHeader.tsx).
    instructions: [CALIBRATION_MASTER_LIST_NOTE],
    headerFields: [],
    columns: calibrationMasterListColumns(),
    // The blank form prints eleven numbered lines; the list grows as
    // instruments are purchased, so lines can be added.
    rowMode: { kind: "free", minRows: 11, typicalRows: 11 },
    // Demo Mode's and the sample fill's lines (never a Live record's, REQUIREMENTS §98, §111): the instruments DCRS's own
    // calibration records name, with what those records print about them. The rest of the eleven lines stay blank.
    specimenRows: CALIBRATION_MASTER_SAMPLE,
    specimenSource: blankForm("Copy of F-QC-08_Master list of Calibration instruments (2).pdf"),
  } satisfies LogSheetLayout,

  // ---- F/QC/16 (00 / 01.12.2021) — REGISTER OF OBSOLETE ARTWORK ----
  "qc-obsolete-artwork": {
    documentId: "qc-obsolete-artwork",
    headingsAsPrinted: true,
    // The paper's Sr. No. is its own column (above): no second number of the sheet's beside it.
    ownLineNumbers: true,
    headerFields: [],
    columns: obsoleteArtworkColumns(),
    // A sample day withdraws two artworks, not the supplied page's thirteen of January and February 2022.
    rowMode: { kind: "free", minRows: 1, typicalRows: 2 },
    specimenRows: OBSOLETE_ARTWORK_LINES,
    specimenSource:
      "Copy of F-QC-16 OBSOLETE ARTWORK & SHADE CARD RECORD.pdf — F/QC/16 (00 / 01.12.2021), the supplied page's thirteen lines, 03.01.2022 to 18.02.2022 (on file as a record, qcRegisterRecords.ts)",
  } satisfies LogSheetLayout,

  // ---- F/QC/20 (Rev. no. - 00) — DESTRUCTION RECORD ----
  // As "F-QC-20.pdf" (REQUIREMENTS §111): titled DESTRUCTION RECORD, with PRINTING AIDS DESTRUCTION RECORD printed
  // above the Date and the grid, "Date:" at the right, and its issue and review dates printed with its format number
  // and revision (the review of 13-Oct-2026: they printed under the grid). DCRS's own line describing the footer is
  // gone (logSheetLayouts.ts WITHDRAWN_EXPLANATIONS).
  "qc-printing-aids-destruction": {
    documentId: "qc-printing-aids-destruction",
    paperTitle: "DESTRUCTION RECORD",
    instructions: ["PRINTING AIDS DESTRUCTION RECORD"],
    printedWithNumber: PRINTING_AIDS_ISSUE_DATES,
    headingsAsPrinted: true,
    headerColumns: 3,
    headerFields: printingAidsDestructionHeader(),
    columns: printingAidsDestructionColumns(),
    // The blank form prints two lines; more are added as aids are destroyed.
    rowMode: { kind: "free", minRows: 1, typicalRows: 2 },
    specimenHeader: PRINTING_AIDS_DESTRUCTION_HEADER,
    specimenRows: PRINTING_AIDS_DESTRUCTION_LINES,
    specimenSource: "F-QC-20.pdf — F/QC/20 (Rev. no. - 00), the supplied page of 01.06.2022, one line (on file as a record, qcRegisterRecords.ts)",
  } satisfies LogSheetLayout,

  // ---- F: QA/PRO/FL/CCT/01 (00 / 01.12.21) — Defect Detection System Camera Challenge Test ----
  "qc-camera-challenge-test": {
    documentId: "qc-camera-challenge-test",
    instructions: [CAMERA_CHALLENGE_OBJECTIVE, CAMERA_CHALLENGE_METHODOLOGY],
    headerFields: [],
    columns: cameraChallengeColumns(),
    // The blank form prints fourteen lines: one per challenge test.
    rowMode: { kind: "free", minRows: 1, typicalRows: 14 },
    specimenSource: blankForm("Update - Defect detection system- camera challenge.pdf"),
  } satisfies LogSheetLayout,

  // ---- F-QC-19 — TOLERANCE CARD FOR BEIERSDORF AG. GERMANY ----
  "qc-tolerance-card-nivea": {
    documentId: "qc-tolerance-card-nivea",
    // The card numbers nothing: no Sr. No. beside its panels (REQUIREMENTS §111).
    ownLineNumbers: true,
    headerFields: [],
    columns: toleranceCardColumns(),
    rowMode: { kind: "fixedRows", rows: TOLERANCE_CARD_PANELS.map((errorCategory) => ({ errorCategory })) },
    specimenSource: "F-QC-19_ Tolerance card for Nivea.pdf (the card as supplied 18-Sep-2026 — its sample labels are mounted on the paper and nothing is written in, so there is no filled specimen)",
  } satisfies LogSheetLayout,
};
