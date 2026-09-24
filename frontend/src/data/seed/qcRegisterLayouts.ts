import type { LogColumn, LogHeaderField, LogSheetLayout } from "../../types";

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
//   * F/QC/08 prints the company heading "GUJARAT PRINT PACK PUBLICATION
//     PRIVATE LIMITED" above the title and the long Note above the table. A
//     layout has no field for a heading, so both are carried verbatim as
//     printed instructions, in the printed order.
//   * F/QC/20's issue and review dates are printed in the form's footer, not in
//     a box anyone fills; they are carried as a printed instruction rather than
//     as fields, so nobody can type over them.
//   * F-QC-19 IS A PHYSICAL CARD: sample labels are mounted on its panels, and
//     a mounted label cannot be reproduced on screen. What is reproduced is the
//     card's panels in their printed order, each panel's error category as
//     headed, and the approval box. The three column headings of that grid
//     ("Error category", "Sample mounted", "Remarks") are NOT printed on the
//     card — the card has no grid — they name what the grid holds.
//   * F-QC-19 repeats an APPROVED BY / SIGN. box under EVERY panel. A layout's
//     footer is printed once, below the grid, so the sheet carries one approval
//     for the whole card.
//   * The grid's Sr. No. column is the renderer's own and is never declared.
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

// ---------------------------------------------------------------------------
// F/QC/16 — REGISTER OF OBSOLETE ARTWORK
//
// One line per artwork or master shade card withdrawn: whose job it was, which
// FG code, who sold it, why it went obsolete and on what date.

const obsoleteArtworkColumns = (): LogColumn[] => [
  { key: "customerName", label: "Customer name", type: "text", width: 240 },
  { key: "jobName", label: "Job name", type: "text", width: 300 },
  { key: "artworkNumber", label: "Artwork number / Master Shade card number (FG Code)", type: "text", width: 220 },
  { key: "salesPerson", label: "Sales Person", type: "text", width: 150 },
  { key: "reasonObsolete", label: "Reason for artwork obsolete", type: "text", width: 200 },
  { key: "dateOfObsolete", label: "Date of obsolete", type: "date", width: 140 },
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
 * and ninth lines down are numbered out of order on the paper. Keeping the
 * printed order means the renderer's own Sr. No. will differ from the page's on
 * those two lines; re-sorting them to match would move the lines themselves,
 * which the record must not do.
 *
 * Updated by - QC In-charge and Remarks are blank on every line of the page,
 * so they stay blank here.
 */
export const OBSOLETE_ARTWORK_LINES: Record<string, string>[] = [
  { customerName: "Nivea India Pvt Ltd", jobName: "Soft 50ml Side label", artworkNumber: "FGLA11067", salesPerson: "Savan Sathwara", reasonObsolete: "A/W Change", dateOfObsolete: "2022-01-03", updatedBy: "", remarks: "" },
  { customerName: "Nivea India Pvt Ltd", jobName: "Nivea Gel body lotion Aloevera Front 200ml label", artworkNumber: "FGLA10900", salesPerson: "Keyur Sathwara", reasonObsolete: "A/W Change", dateOfObsolete: "2022-01-05", updatedBy: "", remarks: "" },
  { customerName: "Dabur India Ltd. Kolkata", jobName: "SA Label Ashokarishta 680 ml Kolkata", artworkNumber: "FGLA9871", salesPerson: "Keyur Sathwara", reasonObsolete: "A/W Change", dateOfObsolete: "2022-01-08", updatedBy: "", remarks: "" },
  { customerName: "Aculife Healthcare Pvt. Ltd./ Nirma", jobName: "RL 500ml label", artworkNumber: "FGLA8665", salesPerson: "Savan Sathwara", reasonObsolete: "A/W Change", dateOfObsolete: "2022-01-21", updatedBy: "", remarks: "" },
  { customerName: "Shreeji Agchem Pvt. Ltd", jobName: "Wilbond 3gm Label", artworkNumber: "FGLA8542", salesPerson: "Keyur Sathwara", reasonObsolete: "A/W Change", dateOfObsolete: "2022-01-23", updatedBy: "", remarks: "" },
  // The page's job name opens a bracket it never closes — the paper's own.
  { customerName: "Purity Polytubes Private Limited", jobName: "Clarifying Mud Mask 75ml _ Russia Label ( Change Cylinder", artworkNumber: "FGLA9462", salesPerson: "Keyur Sathwara", reasonObsolete: "A/W Change", dateOfObsolete: "2022-01-25", updatedBy: "", remarks: "" },
  { customerName: "Neilmed Pharmaceuticals Inc", jobName: "Neil Cleanse Piercing Aftercare 75ml Sleeves Rev-2", artworkNumber: "FGSL1153", salesPerson: "Keyur Sathwara", reasonObsolete: "A/W Change", dateOfObsolete: "2022-01-28", updatedBy: "", remarks: "" },
  { customerName: "Neilmed Pharmaceuticals Inc", jobName: "Wound Wash 177mL Sleeve", artworkNumber: "FGSL1126", salesPerson: "Keyur Sathwara", reasonObsolete: "A/W Change", dateOfObsolete: "2022-01-30", updatedBy: "", remarks: "" },
  { customerName: "Aculife Healthcare Pvt. Ltd./ Nirma", jobName: "C Box Label NS Euroflex Label", artworkNumber: "FGLA9984", salesPerson: "Savan Sathwara", reasonObsolete: "A/W Change", dateOfObsolete: "2022-02-02", updatedBy: "", remarks: "" },
  { customerName: "M/s. UPL Ltd Vapi", jobName: "Viraat 100ml Label Rev2", artworkNumber: "FGLA6505", salesPerson: "Keyur Sathwara", reasonObsolete: "A/W Change", dateOfObsolete: "2022-02-02", updatedBy: "", remarks: "" },
  { customerName: "Ceego Labs Pvt.Ltd.", jobName: "Magnesa Joint rescue Sleeve", artworkNumber: "FGSL0148", salesPerson: "Savan Sathwara", reasonObsolete: "A/W Change", dateOfObsolete: "2022-02-07", updatedBy: "", remarks: "" },
  { customerName: "Shreeji Agchem Pvt. Ltd", jobName: "Wiltez 100ml Label", artworkNumber: "FGLA7696", salesPerson: "Keyur Sathwara", reasonObsolete: "A/W Change", dateOfObsolete: "2022-02-18", updatedBy: "", remarks: "" },
  { customerName: "Shreeji Agchem Pvt. Ltd", jobName: "Wiltez 250ml Label", artworkNumber: "FGLA7697", salesPerson: "Keyur Sathwara", reasonObsolete: "A/W Change", dateOfObsolete: "2022-02-18", updatedBy: "", remarks: "" },
];

// ---------------------------------------------------------------------------
// F/QC/20 — DESTRUCTION RECORD (PRINTING AIDS DESTRUCTION RECORD)

const printingAidsDestructionColumns = (): LogColumn[] => [
  { key: "itemDescription", label: "Item Description", type: "text", width: 380 },
  { key: "actualQty", label: "Actual Qty.", type: "text", width: 120 },
  { key: "destroyedBy", label: "Destroyed By", type: "text", width: 180, autoFill: { sign: true } },
  { key: "checkedBy", label: "Checked By", type: "text", width: 180, autoFill: { sign: true } },
];

/** The Date box printed above the grid; the supplied page reads "Date: 01.06.2022". */
const printingAidsDestructionHeader = (): LogHeaderField[] => [
  { key: "date", label: "Date", type: "date", required: true, width: 150, autoFill: { dueDate: true } },
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

const TOLERANCE_CARD_NOTE =
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

const toleranceCardColumns = (): LogColumn[] => [
  // The card prints each error category as a panel heading; the three headings
  // of this grid are not printed on the card, they name what the grid holds.
  { key: "errorCategory", label: "Error category", type: "text", fixed: true, width: 300 },
  { key: "sampleMounted", label: "Sample mounted", type: "yesno", width: 140 },
  { key: "remarks", label: "Remarks", type: "text", width: 260 },
];

/**
 * The card prints an APPROVED BY / SIGN. box under every panel. A footer is
 * printed once, below the grid, so the sheet carries one approval for the card.
 */
const toleranceCardFooter = (): LogHeaderField[] => [
  { key: "approvedBy", label: "APPROVED BY:", type: "text", width: 220, autoFill: { sign: true } },
  { key: "sign", label: "SIGN. :", type: "text", width: 200 },
];

// ---------------------------------------------------------------------------

export const QC_REGISTER_LAYOUTS: Record<string, LogSheetLayout> = {
  // ---- F/QC/08 (01 / 01.12.2021) — MASTER LIST OF CALIBRATION INSTRUMENTS ----
  "qc-calibration-master-list": {
    documentId: "qc-calibration-master-list",
    // The list's own Note, printed above the table. The company heading and the
    // title above it are the page's letterhead, which every document page prints
    // already (components/documents/DocumentHeader.tsx).
    instructions: [CALIBRATION_MASTER_LIST_NOTE],
    headerFields: [],
    columns: calibrationMasterListColumns(),
    // The blank form prints eleven numbered lines; the list grows as
    // instruments are purchased, so lines can be added.
    rowMode: { kind: "free", minRows: 11, typicalRows: 11 },
    specimenSource: blankForm("Copy of F-QC-08_Master list of Calibration instruments (2).pdf"),
  } satisfies LogSheetLayout,

  // ---- F/QC/16 (00 / 01.12.2021) — REGISTER OF OBSOLETE ARTWORK ----
  "qc-obsolete-artwork": {
    documentId: "qc-obsolete-artwork",
    headerFields: [],
    columns: obsoleteArtworkColumns(),
    rowMode: { kind: "free", minRows: 1, typicalRows: 13 },
    specimenRows: OBSOLETE_ARTWORK_LINES,
    specimenSource:
      "Copy of F-QC-16 OBSOLETE ARTWORK & SHADE CARD RECORD.pdf — F/QC/16 (00 / 01.12.2021), the supplied page's thirteen lines, 03.01.2022 to 18.02.2022 (on file as a record, qcRegisterRecords.ts)",
  } satisfies LogSheetLayout,

  // ---- F/QC/20 (Rev. no. - 00) — DESTRUCTION RECORD ----
  "qc-printing-aids-destruction": {
    documentId: "qc-printing-aids-destruction",
    instructions: [
      // Printed in the form's footer, not in a box anyone fills.
      'The form\'s footer prints "Current Issue date 1st January 2022" and "Next Review date 31st December 2024".',
    ],
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
    instructions: [TOLERANCE_CARD_NOTE],
    headerFields: [],
    columns: toleranceCardColumns(),
    rowMode: { kind: "fixedRows", rows: TOLERANCE_CARD_PANELS.map((errorCategory) => ({ errorCategory })) },
    footerFields: toleranceCardFooter(),
    specimenSource: "F-QC-19_ Tolerance card for Nivea.pdf (the card as supplied 18-Sep-2026 — its sample labels are mounted on the paper and nothing is written in, so there is no filled specimen)",
  } satisfies LogSheetLayout,
};
