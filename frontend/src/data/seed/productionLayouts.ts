import type { LogColumn, LogHeaderField, LogSheetLayout } from "../../types";

// THE PRODUCTION MODULE'S FORMATS (REQUIREMENTS §91), supplied by the owner on 06-Oct-2026: "add those documents
// perfectly without any mistake in the module called production module".
//
// Each layout here is transcribed from the company's own original, the .xls or .xlsx the plant keeps the format in,
// read cell by cell (xlrd / openpyxl), with the PDF it was sent as for the page's look. Every title, box, heading,
// note and checklist item is the paper's own wording, letter for letter: its spellings ("SCISSSOR", "Varified",
// "Produciton", "toll box"), its double spaces ("WORK ORDER  No.", "LOOSE BLADES IN STOCK  (INSTALLED"), its
// capitals and its punctuation (" ?" with the space before the question mark). The one thing never copied is the
// company's name, which the papers print as GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED and GUJARAT PRINTPACK
// PUBLICATIONS PRIVATE LIMITED: every header prints the owner's one name (masterData.ts COMPANY, REQUIREMENTS §87).
//
//   F/PRD/10 (00/01.12.2021)  DAILY ISSUE & RETURN OF SHARP METAL OBJECT (SCISSSOR / MANUAL CUTTER) MONITORING RECORD
//            F-PRD-10.pdf. Sent as a PDF alone, but its original is in the company's own workbook all the same: it is
//            the second sheet ("F-SYS-20 (2)") of the F-PRD-23 .xls, cell for cell the PDF, its two filled lines
//            included. Those two lines (01.12.2021 and 02.12.2021) are the specimen.
//   F/PRD/21 (00-15.12.2024)  AREA LINE CLEARANCE REPORT -  POUCHING ( MACHINE NO. : )
//   F/PRD/22 (00/15.12.2024)  RAZOR BLADE ( USED ON - LAMINATED FILMS - POUCHING MACHINE BLADE HOLDER) MONITORING RECORD
//   F/PRD/23 (00/15.12.2025)  DAILY ISSUE & RETURN OF SHARP METAL OBJECT (MANUAL CUTTER) MONITORING RECORD - ALL
//                             POUCHING SECTION. The paper prints 15.12.2025 where the Master List of Formats has
//                             15.12.2024 for F-PRD-23 (confirmation item, REQUIREMENTS §91); DCRS follows the paper.
//   F/PRD/24 (00/15.12.2024)  RAZOR BLADE ( USED ON - LAMINATED FILM'S SLITTING MACHINE BLADE HOLDER) MONITORING RECORD
//   F-PRD-20 (01/25.06.2025)  SLITTING - ALC & PRODUCTION REPORT
//   F-PRD-26 (01/23.07.2025)  DOCTORING - ALC & PRODUCTION REPORT
// (F-PRD-18 and F-PRD-19, the two solvent base lamination records, have been in DCRS since September and keep their
// layouts in logSheetLayouts.ts, corrected there against their originals. F-PRD-25, POUCHING - PROCESS PARAMETER
// RECORD, was sent as an .xlsx whose three sheets are empty: there is no form in it to build, and it waits on the
// owner.) Each number is written as its paper prints it: F/PRD/21 with slashes, F-PRD-20 with dashes. Search and
// Mitra read both spellings of every one (engine/formatNumbers.ts formatKey: "F-PRD-20" and "F/PRD/20" are PRD-20).
//
// WHERE THE DIGITAL FORM DIFFERS FROM THE PAPER, AND WHY:
//   * A heading the paper prints over two or three columns (F/PRD/10's "Description of Sharp Metal Object Issued"
//     over Scissor and Manual cutter; F/PRD/21's two "Operator shall update ..." headings; F/PRD/22 and 24's "Nos. of
//     new blades replaced on Machine" over SHIFT and New Blade nos.) is the column `group`, drawn as the paper draws
//     it: a second heading row.
//   * A heading the paper breaks over two lines ("Date" / "(Old Job Production complete)") is one line here, its
//     words unchanged. Trailing spaces in a cell ("Total Stock ", "FG CODE ") are dropped.
//   * The printed note above a grid (the stock to be maintained, the Line Clearance definition and its numbered
//     points) is the layout's `instructions`; the Line Clearance definition and its numbered checklist, one
//     paragraph on the paper, are two lines here (the definition, then the checklist, its own numbering kept), as
//     F-PRD-18's own original breaks them and as the QC line clearances are shown (qcLineClearanceLayouts.ts).
//   * The header boxes print with the paper's colon ("OPERATOR NAME :"), as the Maintenance slips keep theirs.
//     "DATE & SHIFT :" is one box, written by the person as on the paper (and as F/QC/36's "Date / SHIFT" is), never
//     carried from the last sheet; DCRS also prints the record's own date in the header block.
//   * F/PRD/21's machine number is printed inside its title ("POUCHING ( MACHINE NO. :      )"); here it is a box
//     of its own, MACHINE NO., carried forward like every machine box.
//   * The paper's empty grid lines (18 on F/PRD/10, 26 and 3 on F/PRD/23's two pages, 23 on F/PRD/22 and 24, 11 on
//     F-PRD-20 and F-PRD-26, 9 on F/PRD/21) are lines added as they are needed: each record holds the day's (or,
//     for F/PRD/21, the machine's) lines.
//   * F-PRD-26 prints an empty cell between OPERATOR NAME and DATE & SHIFT, where its two sister reports print
//     MACHINE NAME: it is no box, and is not one here.
//
// THE SPECIMENS. F/PRD/10 was supplied with two filled lines and they are its specimen, exactly as written. The
// other six were supplied blank, so their specimen lines are typical values for the assistant, said to be such in
// `specimenSource`: the jobs are the F-PRD-18 register's own (FG 7204 to 6766, PO 88823 to 88903), the machines
// the pouch section's own from F/MNT/01 (M-66 Slitter Rewinder Machine, M-69 Star 3 Side Pouching), and the
// quantities follow the paper's own rules (a blade count that adds up to the 20 NOS the note maintains; F/PRD/23's
// 13 manual cutters are F/PRD/10's filled line). A name is never invented: the operator's and the supervisor's
// boxes and signatures are left for the person.

// ---------------------------------------------------------------------------
// what the papers print above their grids, verbatim

/** F/PRD/10: the stock note printed under the title. */
export const FPRD10_STOCK_NOTE =
  "(Scissor stock - 15 Nos & Cutter Blade - 20 Nos to be maintained including Issued to Operator as well as available in Cup board)";
/** F/PRD/23: the same note for the pouching section, with its own figure (40). */
export const FPRD23_STOCK_NOTE =
  "(Scissor stock - 15 Nos & Cutter Blade - 40 Nos to be maintained including Issued to Operator as well as available in Cup board)";
/** F/PRD/22: the note as printed, its opening bracket missing and all. */
export const FPRD22_BLADE_NOTE =
  "LOOSE BLADES IN STOCK INCLUDING - INSTALLED ON MACHINE + LOOSE OK BLADE + LOOSE DISCARDED BLADE) SHALL BE ALWAYS MAINTAINED 20 NOS";
/** F/PRD/24: worded otherwise than F/PRD/22's, with the double space before its bracket. */
export const FPRD24_BLADE_NOTE =
  "LOOSE BLADES IN STOCK  (INSTALLED ON MACHINE + LOOSE OK BLADE + LOOSE DISCARDED BLADE) SHALL BE ALWAYS MAINTAINED 20 NOS";

/** The Line Clearance definition the slitting, pouching and doctoring papers print, with its two spaces after the colon. */
export const LINE_CLEARANCE_DEFINITION =
  "Line Clearance * :  Activity to make sure a production line & its processing area are completely cleared of any material from the previous process";

/** F-PRD-20's seven points (the last ends without a question mark on the paper). */
export const FPRD20_CHECKLIST =
  "(1) Printed / Unprinted Rolls of Previous Job removed if any left out & properly labelled with original Roll number ? (2) Paper core of previous Job removed if different size (3) Printed / Unprinted Rolls of current Job loaded on machine (4) Printed / Unprinted Rolls for Current Job verified as per Job order ? (5) Job change waste removed ? (6) Finished Slitted Rolls of Previous Job shifted to designated place / Finish Goods Warehouse ? (7) Cutter blade position set as per new job size & excess blade / blade holder isolated";
/** F/PRD/21's five points. */
export const FPRD21_CHECKLIST =
  "(1) Printed / Unprinted Rolls of Previous Job removed if any left out & properly labelled with original Roll number ? (2) Printed / Unprinted Rolls of current Job loaded on machine (3) Printed / Unprinted Rolls for Current Job verified as per Job order ? (4) Job change waste removed ? (5) Corrugated box of Finished Pouches of Previous Job shifted to designated place / Finish Goods Warehouse ?";
/** F-PRD-26's six points. */
export const FPRD26_CHECKLIST =
  "(1) Printed Rolls of Previous Job removed if any left out & properly labelled with original Roll number ? (2) Paper core of previous Job removed if different size (3) Printed Rolls of current Job loaded on machine (4) Printed Rolls for Current Job verified as per Job order ? (5) Job change waste removed ? (6) Finished DOCTORING Rolls of Previous Job shifted to designated place / Finish Goods Warehouse ?";

/** F/PRD/21's two column headings, each over its half of the grid. */
export const FPRD21_OLD_JOB_GROUP = "Operator shall update the details mentioned in below columns, when existing Job completed";
export const FPRD21_NEW_JOB_GROUP = "Operator shall update the details mentioned in below columns, when New Job started & only after Line clearance done";

// ---------------------------------------------------------------------------
// the boxes and columns the papers share

/** The line's date: the day the record is for, on every line, never the date the last sheet was for. */
const lineDate = (label: string): LogColumn => ({ key: "date", label, type: "date", required: true, autoFill: { dueDate: true }, width: 120 });

/** OPERATOR NAME : and DATE & SHIFT : (and MACHINE NAME : where printed), as the ALC & production reports print them. */
const operatorBox: LogHeaderField = { key: "operatorName", label: "OPERATOR NAME :", type: "text", autoFill: { carryForward: true } };
const machineBox: LogHeaderField = { key: "machineName", label: "MACHINE NAME :", type: "text", autoFill: { carryForward: true } };
/** One box on the paper: the date and the shift written together, by the person. Never carried forward. */
const dateShiftBox: LogHeaderField = { key: "dateShift", label: "DATE & SHIFT :", type: "text" };

const alcDone = (): LogColumn => ({
  key: "alcDone",
  label: "ALC DONE AS PER ABOVE (YES/NO)",
  type: "yesno",
  required: true,
  autoFill: { carryForward: true, default: "Yes" },
  width: 110,
});
/** The operator signs each line himself: left for him, never filled by the assistant nor carried from the last sheet. */
const operatorSignColumn = (label: string, key = "operatorSign"): LogColumn => ({ key, label, type: "text", autoFill: { fresh: true }, width: 130 });

/** F/PRD/22 and F/PRD/24: the same ten headings, in the same order. */
const BLADE_GROUP = "Nos. of new blades replaced on Machine";
const bladeColumns = (): LogColumn[] => [
  lineDate("Date"),
  { key: "openingStock", label: "Opening stock of OK Blade", type: "number", decimals: 0, required: true, width: 110 },
  { key: "newIssuedFromStore", label: "New Blades Issued from Store", type: "number", decimals: 0, width: 110 },
  { key: "totalStock", label: "Total Stock", type: "number", decimals: 0, required: true, width: 90 },
  { key: "replacedShift", label: "SHIFT", type: "text", group: BLADE_GROUP, width: 70 },
  { key: "replacedNos", label: "New Blade nos.", type: "number", decimals: 0, group: BLADE_GROUP, width: 100 },
  { key: "closingOkStock", label: "Closing stock of OK Blade", type: "number", decimals: 0, required: true, width: 110 },
  { key: "closingDiscarded", label: "Closing Stock of Discarded blades", type: "number", decimals: 0, width: 120 },
  { key: "discardedReturned", label: "Nos. of discarded blades returned to Store", type: "number", decimals: 0, width: 130 },
  // The Production Manager's check of the line, signed by him: never filled by the assistant nor carried forward.
  { key: "verifiedBy", label: "Varified & Checked by - Produciton Manager", type: "text", autoFill: { fresh: true }, width: 150 },
];

// ---------------------------------------------------------------------------
// the seven layouts

export const PRODUCTION_LAYOUTS: Record<string, LogSheetLayout> = {
  // ---- F/PRD/10 (00/01.12.2021) - DAILY ISSUE & RETURN OF SHARP METAL OBJECT (SCISSSOR / MANUAL CUTTER) MONITORING RECORD
  // Four headings over two columns each, as printed; "Cutter blade " loses its trailing space. The Broken and New
  // Qty. columns are text because the paper writes "Nil" and "NA" in them as often as a number.
  "prd-sharp-object-issue": {
    documentId: "prd-sharp-object-issue",
    instructions: [FPRD10_STOCK_NOTE],
    headerFields: [],
    columns: [
      lineDate("Date"),
      { key: "shift", label: "Shift", type: "text", width: 70 },
      { key: "issuedScissor", label: "Scissor", type: "number", decimals: 0, required: true, group: "Description of Sharp Metal Object Issued", width: 90 },
      { key: "issuedManualCutter", label: "Manual cutter", type: "number", decimals: 0, required: true, group: "Description of Sharp Metal Object Issued", width: 100 },
      { key: "returnedScissor", label: "Scissor", type: "number", decimals: 0, required: true, group: "Description of Sharp Metal Object Returned", width: 90 },
      { key: "returnedManualCutter", label: "Manual cutter", type: "number", decimals: 0, required: true, group: "Description of Sharp Metal Object Returned", width: 100 },
      { key: "brokenScissor", label: "Scissor", type: "text", group: "Broken / Damaged or Worn-out Qty. if any", width: 90 },
      { key: "brokenCutterBlade", label: "Cutter blade", type: "text", group: "Broken / Damaged or Worn-out Qty. if any", width: 100 },
      { key: "newScissor", label: "Scissor", type: "text", group: "New Qty. Issued if any", width: 90 },
      { key: "newCutterBlade", label: "Cutter blade", type: "text", group: "New Qty. Issued if any", width: 100 },
      { key: "supervisorSign", label: "Supervisor Sign", type: "text", autoFill: { fresh: true }, width: 130 },
      { key: "remarks", label: "Remarks", type: "text", width: 200 },
    ],
    // One line a shift; the paper's own example shows one a day. The assistant writes the first line's figures.
    rowMode: { kind: "free", minRows: 1, typicalRows: 1 },
    // The paper's own two lines, exactly as written: 02.12.2021 has no shift written, and its 1 cutter blade worn out
    // and 1 issued, with the remark. (A remark is never carried onto another day: engine/autoFill.ts isRemarkColumn.)
    specimenRows: [
      { date: "2021-12-01", shift: "I", issuedScissor: 12, issuedManualCutter: 13, returnedScissor: 12, returnedManualCutter: 13, brokenScissor: "Nil", brokenCutterBlade: "Nil", newScissor: "NA", newCutterBlade: "NA", supervisorSign: "", remarks: "" },
      { date: "2021-12-02", shift: "", issuedScissor: 12, issuedManualCutter: 13, returnedScissor: 12, returnedManualCutter: 13, brokenScissor: "Nil", brokenCutterBlade: "1", newScissor: "NA", newCutterBlade: "1", supervisorSign: "", remarks: "Cutter blade worn out" },
    ],
    specimenSource: "F-PRD-10.pdf, F/PRD/10 (00/01.12.2021): the paper's own two filled lines, 01.12.2021 (shift I) and 02.12.2021",
    originalPages: [
      { src: "/source/fprd10-sharp-metal-object-issue-p1.jpg", caption: "F/PRD/10 (00/01.12.2021) - Daily Issue & Return of Sharp Metal Object (Scisssor / Manual Cutter) Monitoring Record, as supplied, with its two filled lines" },
    ],
  } satisfies LogSheetLayout,

  // ---- F/PRD/23 (00/15.12.2025) - DAILY ISSUE & RETURN OF SHARP METAL OBJECT (MANUAL CUTTER) MONITORING RECORD - ALL POUCHING SECTION
  // Its own single-column headings, in its own capitals: "BROKEN / DAMAGED QTY (IF ANY)", "NEW QTY. ISSUED" (its
  // trailing space dropped). The paper prints the same table on two pages; here it is one list of lines.
  "prd-pouching-cutter-issue": {
    documentId: "prd-pouching-cutter-issue",
    instructions: [FPRD23_STOCK_NOTE],
    headerFields: [],
    columns: [
      lineDate("Date"),
      { key: "shift", label: "Shift", type: "text", width: 70 },
      { key: "qtyIssued", label: "QTY. ISSUED", type: "number", decimals: 0, required: true, width: 100 },
      { key: "qtyReturned", label: "QTY. RETURNED", type: "number", decimals: 0, required: true, width: 110 },
      { key: "brokenQty", label: "BROKEN / DAMAGED QTY (IF ANY)", type: "text", width: 130 },
      { key: "newQtyIssued", label: "NEW QTY. ISSUED", type: "text", width: 110 },
      { key: "supervisorSign", label: "SUPERVISOR SIGN", type: "text", autoFill: { fresh: true }, width: 130 },
      { key: "remarks", label: "Remarks", type: "text", width: 200 },
    ],
    rowMode: { kind: "free", minRows: 1, typicalRows: 1 },
    specimenRows: [{ date: "", shift: "I", qtyIssued: 13, qtyReturned: 13, brokenQty: "Nil", newQtyIssued: "NA", supervisorSign: "", remarks: "" }],
    specimenSource:
      "F-PRD-23_Manual cutter Daily Issue & Return monitoring record.pdf, F/PRD/23 (00/15.12.2025), the blank format: a typical line for the assistant, the 13 manual cutters issued and returned on F/PRD/10's own filled line",
    originalPages: [
      { src: "/source/fprd23-manual-cutter-issue-p1.jpg", caption: "F/PRD/23 (00/15.12.2025) - Daily Issue & Return of Sharp Metal Object (Manual Cutter) Monitoring Record - All Pouching Section, page 1 of 2, the blank format as supplied" },
      { src: "/source/fprd23-manual-cutter-issue-p2.jpg", caption: "F/PRD/23, page 2 of 2: the same table continued" },
    ],
  } satisfies LogSheetLayout,

  // ---- F/PRD/22 (00/15.12.2024) - RAZOR BLADE ( USED ON - LAMINATED FILMS - POUCHING MACHINE BLADE HOLDER) MONITORING RECORD
  "prd-pouching-blade": {
    documentId: "prd-pouching-blade",
    instructions: [FPRD22_BLADE_NOTE],
    headerFields: [],
    columns: bladeColumns(),
    rowMode: { kind: "free", minRows: 1, typicalRows: 1 },
    // A day's stock that keeps the paper's rule: 10 loose OK blades and 2 discarded at the day's close, with 8 on the
    // pouching machines' blade holders, are the 20 NOS the note says are always maintained.
    specimenRows: [{ date: "", openingStock: 12, newIssuedFromStore: 0, totalStock: 12, replacedShift: "I", replacedNos: 2, closingOkStock: 10, closingDiscarded: 2, discardedReturned: 0, verifiedBy: "" }],
    specimenSource:
      "F-PRD-22_Blade Change Record - All Pouching machine.pdf, F/PRD/22 (00/15.12.2024), the blank format: a typical day for the assistant, its counts adding up to the 20 NOS the note maintains",
    originalPages: [
      { src: "/source/fprd22-pouching-razor-blade-p1.jpg", caption: "F/PRD/22 (00/15.12.2024) - Razor Blade ( Used On - Laminated Films - Pouching Machine Blade Holder) Monitoring Record, the blank format as supplied" },
    ],
  } satisfies LogSheetLayout,

  // ---- F/PRD/24 (00/15.12.2024) - RAZOR BLADE ( USED ON - LAMINATED FILM'S SLITTING MACHINE BLADE HOLDER) MONITORING RECORD
  // The same ten headings as F/PRD/22. The PDF prints the last one, "Varified & Checked by - Produciton Manager",
  // on a second page of its own, because the sheet was a column too wide for Excel's page; it is one grid here.
  "prd-slitting-blade": {
    documentId: "prd-slitting-blade",
    instructions: [FPRD24_BLADE_NOTE],
    headerFields: [],
    columns: bladeColumns(),
    rowMode: { kind: "free", minRows: 1, typicalRows: 1 },
    // 14 loose OK blades and 1 discarded at the close, with 5 on the slitting machine's blade holder: the 20 NOS.
    specimenRows: [{ date: "", openingStock: 15, newIssuedFromStore: 0, totalStock: 15, replacedShift: "I", replacedNos: 1, closingOkStock: 14, closingDiscarded: 1, discardedReturned: 0, verifiedBy: "" }],
    specimenSource:
      "F-PRD-24_Razor Blade Change Record - Laminated FIlms Slittig machine.pdf, F/PRD/24 (00/15.12.2024), the blank format: a typical day for the assistant, its counts adding up to the 20 NOS the note maintains",
    originalPages: [
      { src: "/source/fprd24-slitting-razor-blade-p1.jpg", caption: "F/PRD/24 (00/15.12.2024) - Razor Blade ( Used On - Laminated Film's Slitting Machine Blade Holder) Monitoring Record, page 1 of 2, the blank format as supplied" },
      { src: "/source/fprd24-slitting-razor-blade-p2.jpg", caption: "F/PRD/24, page 2 of 2: the grid's last column, Varified & Checked by - Produciton Manager, which Excel printed on a page of its own" },
    ],
  } satisfies LogSheetLayout,

  // ---- F/PRD/21 (00-15.12.2024) - AREA LINE CLEARANCE REPORT -  POUCHING ( MACHINE NO. : )
  // One sheet per pouching machine, a line per job change: the left half when the old job is complete, the right
  // half when the new job starts, only after the line is cleared. The paper prints "Format no. - F/PRD/21
  // (00-15.12.2024)" with a dash between the revision and its date.
  "prd-pouching-line-clearance": {
    documentId: "prd-pouching-line-clearance",
    instructions: [LINE_CLEARANCE_DEFINITION, FPRD21_CHECKLIST],
    headerFields: [{ key: "machineNo", label: "MACHINE NO. :", type: "text", required: true, autoFill: { carryForward: true }, width: 220 }],
    columns: [
      { key: "oldJobDate", label: "Date (Old Job Production complete)", type: "date", required: true, autoFill: { dueDate: true }, group: FPRD21_OLD_JOB_GROUP, width: 130 },
      { key: "oldJobTime", label: "Time (Old Job Production complete)", type: "time", group: FPRD21_OLD_JOB_GROUP, width: 110 },
      // The two spaces after "WORK ORDER" are the original's own.
      { key: "previousWorkOrderNo", label: "WORK ORDER  No. of previous Product", type: "text", required: true, group: FPRD21_OLD_JOB_GROUP, width: 130 },
      { key: "previousJobName", label: "Previous Product Job Name", type: "text", group: FPRD21_OLD_JOB_GROUP, width: 200 },
      { ...operatorSignColumn("Operator sign", "operatorSignOld"), group: FPRD21_OLD_JOB_GROUP },
      // The heading prints the two permitted answers in brackets (and two spaces before them).
      { key: "lineClearance", label: "Line Clearance*  (Done/Not Done)", type: "select", options: ["Done", "Not Done"], required: true, autoFill: { carryForward: true, default: "Done" }, group: FPRD21_NEW_JOB_GROUP, width: 130 },
      { key: "newJobDate", label: "Date (New Job Production Start)", type: "date", required: true, autoFill: { dueDate: true }, group: FPRD21_NEW_JOB_GROUP, width: 130 },
      // "start" in small letters here, "Start" in the column before: both as printed.
      { key: "newJobTime", label: "Time (New Job Production start)", type: "time", group: FPRD21_NEW_JOB_GROUP, width: 110 },
      { key: "newWorkOrderNo", label: "WORK ORDER No. of New Product", type: "text", required: true, group: FPRD21_NEW_JOB_GROUP, width: 130 },
      { key: "newProductName", label: "New Product Name", type: "text", group: FPRD21_NEW_JOB_GROUP, width: 200 },
      { ...operatorSignColumn("Operator sign", "operatorSignNew"), group: FPRD21_NEW_JOB_GROUP },
      { key: "verifiedBySupervisor", label: "Verified by Shift supervisor", type: "text", autoFill: { fresh: true }, group: FPRD21_NEW_JOB_GROUP, width: 140 },
    ],
    rowMode: { kind: "free", minRows: 1, typicalRows: 2 },
    specimenHeader: { machineNo: "M-69" },
    // Two job changes on the F-PRD-18 register's own jobs, one after the other.
    specimenRows: [
      { oldJobDate: "", oldJobTime: "10:40", previousWorkOrderNo: "88825", previousJobName: "VP Bedekar Fenugreek Powder", operatorSignOld: "", lineClearance: "Done", newJobDate: "", newJobTime: "11:05", newWorkOrderNo: "88826", newProductName: "VP Bedekar Cumin Powder", operatorSignNew: "", verifiedBySupervisor: "" },
      { oldJobDate: "", oldJobTime: "15:20", previousWorkOrderNo: "88826", previousJobName: "VP Bedekar Cumin Powder", operatorSignOld: "", lineClearance: "Done", newJobDate: "", newJobTime: "15:50", newWorkOrderNo: "88827", newProductName: "VP Bedekar Jeshthamadh Powder", operatorSignNew: "", verifiedBySupervisor: "" },
    ],
    specimenSource:
      "F-PRD-21_Area Line clearance record - POUCHING.pdf, F/PRD/21 (00-15.12.2024), the blank format: typical lines for the assistant, the jobs the F-PRD-18 register's own and M-69 (Star 3 Side Pouching) from F/MNT/01",
    originalPages: [
      { src: "/source/fprd21-line-clearance-pouching-p1.jpg", caption: "F/PRD/21 (00-15.12.2024) - Area Line Clearance Report - Pouching, the blank format as supplied" },
    ],
  } satisfies LogSheetLayout,

  // ---- F-PRD-20 (01/25.06.2025) - SLITTING - ALC & PRODUCTION REPORT
  // Rev 01 added OUT TIME (HOTROOM) (the Master List's note: "Hotroom -out time added"): the laminated roll comes out
  // of the hot room that F-PRD-18's IN TIME (HOTROOM) sent it into.
  "prd-slitting-alc": {
    documentId: "prd-slitting-alc",
    instructions: [LINE_CLEARANCE_DEFINITION, FPRD20_CHECKLIST],
    headerFields: [operatorBox, machineBox, dateShiftBox],
    columns: [
      { key: "fgCode", label: "FG CODE", type: "text", required: true, width: 80 },
      { key: "poNo", label: "INTERNAL PO No.", type: "text", required: true, width: 90 },
      { key: "jobName", label: "JOB NAME", type: "text", required: true, width: 200 },
      { key: "outTimeHotroom", label: "OUT TIME (HOTROOM)", type: "time", width: 100 },
      { key: "filmLayer", label: "FILM LAYER", type: "text", width: 110 },
      { key: "inputRollKg", label: "INPUT ROLL (Kgs.)", type: "number", unit: "kg", decimals: 2, width: 90 },
      { key: "inputRollWidth", label: "INPUT ROLL WIDTH (mm)", type: "number", unit: "mm", decimals: 0, autoFill: { carryForward: true }, width: 100 },
      alcDone(),
      operatorSignColumn("OPERATOR SIGN"),
      { key: "startTime", label: "START TIME", type: "time", width: 90 },
      { key: "endTime", label: "END TIME", type: "time", width: 90 },
      { key: "outputRollKg", label: "OUTPUT ROLL (Kgs.)", type: "number", unit: "kg", decimals: 2, width: 90 },
      { key: "outputRollWidth", label: "OUT PUT ROLL WIDTH (mm)", type: "number", unit: "mm", decimals: 0, autoFill: { carryForward: true }, width: 100 },
      { key: "wastageKg", label: "WASTAGE (Kgs)", type: "number", unit: "kg", decimals: 2, width: 90 },
      { key: "okMeters", label: "OK METERs", type: "number", decimals: 0, width: 90 },
    ],
    rowMode: { kind: "free", minRows: 1, typicalRows: 3 },
    specimenHeader: { machineName: "M-66 Slitter Rewinder Machine" },
    // The F-PRD-18 register's first rolls of 07-09-26, out of the hot room and slit: output and wastage add up to
    // the input roll. (Each day's own jobs are worked out by engine/autoFill.ts from the lamination line's.)
    specimenRows: [
      { fgCode: "7204", poNo: "88825", jobName: "VP Bedekar Fenugreek Powder", outTimeHotroom: "10:00", filmLayer: "PET + MetPET", inputRollKg: 69.1, inputRollWidth: 640, alcDone: "Yes", operatorSign: "", startTime: "10:20", endTime: "10:55", outputRollKg: 67.6, outputRollWidth: 300, wastageKg: 1.5, okMeters: 1905 },
      { fgCode: "7205", poNo: "88826", jobName: "VP Bedekar Cumin Powder", outTimeHotroom: "10:50", filmLayer: "PET + MetPET", inputRollKg: 70.2, inputRollWidth: 640, alcDone: "Yes", operatorSign: "", startTime: "11:05", endTime: "11:45", outputRollKg: 68.5, outputRollWidth: 300, wastageKg: 1.7, okMeters: 1900 },
    ],
    specimenSource:
      "F-PRD-20_SLITTING PRODUCTION LOGBOOK -24.06.25.pdf, F-PRD-20 (01/25.06.2025), the blank format: typical lines for the assistant, the rolls the F-PRD-18 register laminated (FG 7204, 7205) and M-66 from F/MNT/01; widths and weights illustrative",
    originalPages: [
      { src: "/source/fprd20-slitting-alc-production-p1.jpg", caption: "F-PRD-20 (01/25.06.2025) - Slitting - ALC & Production Report, the blank format as supplied" },
    ],
  } satisfies LogSheetLayout,

  // ---- F-PRD-26 (01/23.07.2025) - DOCTORING - ALC & PRODUCTION REPORT
  // Rev 01 added "Job bag Require KG" (the Master List's note: "Job bag require KG added"), in the paper's own
  // mixed capitals, as are "OK Running Mtr" and "INPUT ROLL Kgs.". INTERNAL PO No. comes before FG CODE here, as
  // on F-PRD-19; F-PRD-18 and F-PRD-20 print FG CODE first.
  "prd-doctoring-alc": {
    documentId: "prd-doctoring-alc",
    instructions: [LINE_CLEARANCE_DEFINITION, FPRD26_CHECKLIST],
    headerFields: [operatorBox, dateShiftBox],
    columns: [
      { key: "poNo", label: "INTERNAL PO No.", type: "text", required: true, width: 90 },
      { key: "fgCode", label: "FG CODE", type: "text", required: true, width: 80 },
      { key: "jobName", label: "JOB NAME", type: "text", required: true, width: 200 },
      { key: "inputRollKg", label: "INPUT ROLL Kgs.", type: "number", unit: "kg", decimals: 2, width: 90 },
      { key: "jobBagRequireKg", label: "Job bag Require KG", type: "number", unit: "kg", decimals: 0, width: 90 },
      alcDone(),
      operatorSignColumn("OPERATOR SIGN"),
      { key: "startTime", label: "START TIME", type: "time", width: 90 },
      { key: "endTime", label: "END TIME", type: "time", width: 90 },
      { key: "outputRollKg", label: "OUTPUT ROLL Kgs.", type: "number", unit: "kg", decimals: 2, width: 90 },
      { key: "wastageKg", label: "WASTAGE (Kgs)", type: "number", unit: "kg", decimals: 2, width: 90 },
      { key: "okRunningMtr", label: "OK Running Mtr", type: "number", decimals: 0, width: 100 },
    ],
    rowMode: { kind: "free", minRows: 1, typicalRows: 2 },
    specimenRows: [
      { poNo: "88823", fgCode: "7202", jobName: "VP Bedekar Dry Ginger Powder", inputRollKg: 70, jobBagRequireKg: 65, alcDone: "Yes", operatorSign: "", startTime: "09:30", endTime: "10:20", outputRollKg: 68.9, wastageKg: 1.1, okRunningMtr: 1915 },
      { poNo: "88903", fgCode: "6766", jobName: "Sweet Karam Gusset", inputRollKg: 64.5, jobBagRequireKg: 60, alcDone: "Yes", operatorSign: "", startTime: "10:35", endTime: "11:30", outputRollKg: 63.2, wastageKg: 1.3, okRunningMtr: 2480 },
    ],
    specimenSource:
      "F-PRD-26_Doctoring PRODUCTION LOGBOOK.pdf, F-PRD-26 (01/23.07.2025), the blank format: typical lines for the assistant, the F-PRD-18 register's jobs (FG 7202, 6766); weights illustrative",
    originalPages: [
      { src: "/source/fprd26-doctoring-alc-production-p1.jpg", caption: "F-PRD-26 (01/23.07.2025) - Doctoring - ALC & Production Report, the blank format as supplied" },
    ],
  } satisfies LogSheetLayout,
};

/** The Production formats this file lays out, in the order the Master List of Formats numbers them. */
export const PRODUCTION_LAYOUT_IDS = [
  "prd-sharp-object-issue",
  "prd-slitting-alc",
  "prd-pouching-line-clearance",
  "prd-pouching-blade",
  "prd-pouching-cutter-issue",
  "prd-slitting-blade",
  "prd-doctoring-alc",
] as const;
