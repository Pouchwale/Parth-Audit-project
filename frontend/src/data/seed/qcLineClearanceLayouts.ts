import type { LogColumn, LogHeaderField, LogSheetLayout } from "../../types";

// THE AREA LINE CLEARANCE REPORTS (REQUIREMENTS §57) — the Quality Control
// formats supplied on 18-Sep-2026, reproduced as log-sheet layouts
// (types/logSheet.ts): the machine box printed above the grid, the Line
// Clearance definition and the area's numbered checklist as printed
// instructions, and the twelve-column register of job changeovers.
//
// All six carry "Rev. no. - 00" and "Effective date : 16.02.2022":
//
//   F/QC/15-A (00 / 16.02.2022)  AREA LINE CLEARANCE REPORT -  PRINTING
//     — "F-QC-15-A-G Line Clearance Printing Printing.pdf"
//   F/QC/15-C (00 / 16.02.2022)  AREA LINE CLEARANCE REPORT -  QC MACHINE INSPECTION
//     — "F-QC-15-A-G Line Clearance Quality inspection - Printing.pdf"
//   F/QC/15-D (00 / 16.02.2022)  AREA LINE CLEARANCE REPORT -  QC MANUAL INSPECTION
//     — "F-QC-15-A-G Line Clearance Quality inspection-2 - Printing.pdf"
//   F/QC/15-E (00 / 16.02.2022)  AREA LINE CLEARANCE REPORT -  SLITTING
//     — "Copy of F-QC-15-A-G Line Clearance for slitting- Printing.pdf"
//   F/QC/15-F (00 / 16.02.2022)  AREA LINE CLEARANCE REPORT -  SHRINK SLEEVE GLUING
//     — "Copy of F-QC-15-A-G Line Clearance - Printing.pdf"
//   F/QC/15-G (00 / 16.02.2022)  AREA LINE CLEARANCE REPORT -  SHRINK SLEEVE CUTTING
//     — "Copy of F-QC-15-A-G Line Clearance - Printing (2).pdf"
//
// F/QC/15-B was NOT supplied with this upload, so there is no layout for it
// here; the series runs A, C, D, E, F, G.
//
// Every title, heading, checklist item and printed instruction is the paper's
// own wording — spacing, punctuation and numbering included. Where the paper
// is odd (15-A's checklist jumps from (5) to (7); 15-D's box says "QC MACHINE
// NAME" although the report is the manual one; 15-F's item (3) ends without a
// question mark), it is kept as printed and flagged beside the layout.
//
// WHAT HAD TO BE REPRESENTED DIFFERENTLY FROM THE PAPER, and why:
//   * The numbered checklist is printed as a block of numbered lines above the
//     grid. `instructions` is a list of printed paragraphs, so the whole
//     checklist is carried as ONE instruction line, verbatim and with its own
//     numbering, rather than being re-numbered into separate items.
//   * Completion Time and Starting Time are text, not `time` fields: the form
//     is written in clock-face style ("11.00 AM"), which a time input cannot
//     hold as written.
//   * Completion Date and Starting Date are date fields, so the specimen dates
//     are stored in the ISO form a date field uses; the paper writes them
//     "03.02.22" / "04.02.22".
//   * Two columns carry the same printed heading, "Verified by IPQC executive"
//     (one for the clearance, one for the new job). Same label, different keys.
//   * The grid's Sr. No. column is the renderer's own and is never declared.
//   * The machine box keeps the paper's printed rule of underscores inside its
//     label, so the box reads as it does on the form; the value itself is
//     typed in and carries forward from the previous sheet.

/** Printed above the grid on every one of the six, verbatim (the paper's own spacing). */
const LINE_CLEARANCE_NOTE =
  "Line Clearance * :  Activity to make sure a production line & its processing area are completely cleared of any material from the previous process";

/** Title line, checklist note and the area's own numbered checklist — all as printed. */
// Only what the form prints above its grid: its title, the note on what a line
// clearance is, and that area's own checklist. (What the register is for belongs
// in the document's description, not in the form's own words.)
const printedAboveGrid = (area: string, checklist: string): string[] => [
  `AREA LINE CLEARANCE REPORT -  ${area}`,
  LINE_CLEARANCE_NOTE,
  checklist,
];

/** The machine box printed above the grid — its label is the paper's own, rule of underscores included. */
const machineBox = (label: string): LogHeaderField[] => [
  { key: "machineName", label, type: "text", width: 300, autoFill: { carryForward: true } },
];

/**
 * The twelve printed columns, in the order the form prints them. The first six
 * close out the previous job, the last six open the new one.
 */
const clearanceColumns = (): LogColumn[] => [
  { key: "completionDate", label: "Completion Date", type: "date", width: 130 },
  // Written on the form in clock-face style ("11.00 AM"), so text.
  { key: "completionTime", label: "Completion Time", type: "text", width: 110 },
  { key: "previousJobPoNo", label: "PO No. of previous Job", type: "text", width: 150 },
  { key: "previousPoCustomerName", label: "Previous PO Customer name", type: "text", width: 180 },
  // The heading prints the two permitted answers in brackets — kept verbatim.
  { key: "lineClearance", label: "Line Clearance* (Done/Not Done)", type: "select", options: ["Done", "Not Done"], width: 170 },
  // Same printed heading as the last column of the row (the paper's own), distinct key.
  { key: "verifiedByIpqcClearance", label: "Verified by IPQC executive", type: "text", width: 170, autoFill: { sign: true } },
  { key: "startingDate", label: "Starting Date", type: "date", width: 130 },
  { key: "startingTime", label: "Starting Time", type: "text", width: 110 },
  { key: "newJobPoNo", label: "PO No. of New Job", type: "text", width: 150 },
  { key: "newPoCustomerName", label: "New PO Customer name", type: "text", width: 180 },
  { key: "operatorSign", label: "Operator sign", type: "text", width: 140, autoFill: { sign: true } },
  { key: "verifiedByIpqcNewJob", label: "Verified by IPQC executive", type: "text", width: 170, autoFill: { sign: true } },
];

/**
 * The three part-filled example lines the blank template itself carries. They
 * are the template's own filler, not a record: the PO number it shows (36633)
 * and the "customer name" it shows ("xyz") are NOT a real order or customer,
 * so they are deliberately left out of the specimen — the assistant must never
 * write them onto a real sheet. Only the dates, the time and the Done are kept,
 * and the signature columns are blank on the template, so they stay blank.
 * The three lines differ only in the starting date (the third starts a day later).
 */
const templateExampleLines = (): Record<string, string | number | null>[] => [
  { completionDate: "2022-02-03", completionTime: "11.00 AM", lineClearance: "Done", startingDate: "2022-02-03" },
  { completionDate: "2022-02-03", completionTime: "11.00 AM", lineClearance: "Done", startingDate: "2022-02-03" },
  { completionDate: "2022-02-03", completionTime: "11.00 AM", lineClearance: "Done", startingDate: "2022-02-04" },
];

/** Lines are added as changeovers happen — the form is a register, not a fixed list. */
const REGISTER: LogSheetLayout["rowMode"] = { kind: "free", minRows: 1, typicalRows: 3 };

const exampleLinesNote = "the blank template's own three example lines (dates, time and clearance only — its filler PO number and \"xyz\" customer name are not carried)";

export const QC_LINE_CLEARANCE_LAYOUTS: Record<string, LogSheetLayout> = {
  // ---- F/QC/15-A — AREA LINE CLEARANCE REPORT -  PRINTING ----
  // The printed checklist really does jump from (5) to (7) — there is no (6)
  // on the form — and item (4) has a double space before its question mark.
  // Both are the paper's own and are kept.
  "qc-line-clearance-printing": {
    documentId: "qc-line-clearance-printing",
    instructions: printedAboveGrid(
      "PRINTING",
      "(1) Unprinted Rolls, Master Shade card, Nylo Plates, Magnetic die, Special Varnish, Screen & Inks of Previous Job removed ? (2) Ink of Current Job changed ? (3) Master shade card of new Job issued ? (4) Nylo Plates of New job changed & verified as per Master shade card  ? (5) Job change waste removed ? (7) Finished printed Rolls of Previous Production order shifted to designated place ?",
    ),
    headerFields: machineBox("PRINTING MACHINE NAME : - ____________________"),
    columns: clearanceColumns(),
    rowMode: REGISTER,
    specimenRows: templateExampleLines(),
    specimenSource: `F-QC-15-A-G Line Clearance Printing Printing.pdf — F/QC/15-A (00/16.02.2022), ${exampleLinesNote}`,
  } satisfies LogSheetLayout,

  // ---- F/QC/15-C — AREA LINE CLEARANCE REPORT -  QC MACHINE INSPECTION ----
  "qc-line-clearance-qc-machine": {
    documentId: "qc-line-clearance-qc-machine",
    instructions: printedAboveGrid(
      "QC MACHINE INSPECTION",
      "(1) Finished QC Inspected Rolls of Previous Production order shifted to designated place ? (2) Wastage of previous job removed ?",
    ),
    headerFields: machineBox("QC INSPECTION MACHINE NAME : - ____________________"),
    columns: clearanceColumns(),
    rowMode: REGISTER,
    specimenRows: templateExampleLines(),
    specimenSource: `F-QC-15-A-G Line Clearance Quality inspection - Printing.pdf — F/QC/15-C (00/16.02.2022), ${exampleLinesNote}`,
  } satisfies LogSheetLayout,

  // ---- F/QC/15-D — AREA LINE CLEARANCE REPORT -  QC MANUAL INSPECTION ----
  // The machine box on this one is printed "QC MACHINE NAME", not "QC MANUAL
  // INSPECTION MACHINE NAME" — the paper's own, kept as printed.
  "qc-line-clearance-qc-manual": {
    documentId: "qc-line-clearance-qc-manual",
    instructions: printedAboveGrid(
      "QC MANUAL INSPECTION",
      "(1) Finished QC Inspected Rolls of Previous Production order shifted to designated place ? (2) Wastage of previous job removed ?",
    ),
    headerFields: machineBox("QC MACHINE NAME : - ____________________"),
    columns: clearanceColumns(),
    rowMode: REGISTER,
    specimenRows: templateExampleLines(),
    specimenSource: `F-QC-15-A-G Line Clearance Quality inspection-2 - Printing.pdf — F/QC/15-D (00/16.02.2022), ${exampleLinesNote}`,
  } satisfies LogSheetLayout,

  // ---- F/QC/15-E — AREA LINE CLEARANCE REPORT -  SLITTING ----
  "qc-line-clearance-slitting": {
    documentId: "qc-line-clearance-slitting",
    instructions: printedAboveGrid(
      "SLITTING",
      "(1) Finished Slitted Rolls of Previous Production order shifted to designated place ? (2) Wastage of previous job removed ?",
    ),
    headerFields: machineBox("SLITTING MACHINE NAME : - ____________________"),
    columns: clearanceColumns(),
    rowMode: REGISTER,
    specimenRows: templateExampleLines(),
    specimenSource: `Copy of F-QC-15-A-G Line Clearance for slitting- Printing.pdf — F/QC/15-E (00/16.02.2022), ${exampleLinesNote}`,
  } satisfies LogSheetLayout,

  // ---- F/QC/15-F — AREA LINE CLEARANCE REPORT -  SHRINK SLEEVE GLUING ----
  // Item (3) is printed without a question mark, and the machine box has a
  // double space before MACHINE and a shorter printed rule. The paper's own.
  "qc-line-clearance-sleeve-gluing": {
    documentId: "qc-line-clearance-sleeve-gluing",
    instructions: printedAboveGrid(
      "SHRINK SLEEVE GLUING",
      "(1) Finished Printed Rolls of Previous Production order shifted to designated place ? (2) Wastage of previous job removed ? (3) Leaflet plate of previous Job removed",
    ),
    headerFields: machineBox("SHRINK SLEEVE GLUING  MACHINE NAME : - ____________"),
    columns: clearanceColumns(),
    rowMode: REGISTER,
    specimenRows: templateExampleLines(),
    specimenSource: `Copy of F-QC-15-A-G Line Clearance - Printing.pdf — F/QC/15-F (00/16.02.2022), ${exampleLinesNote}`,
  } satisfies LogSheetLayout,

  // ---- F/QC/15-G — AREA LINE CLEARANCE REPORT -  SHRINK SLEEVE CUTTING ----
  // This box, too, is printed with the shorter rule. The paper's own.
  "qc-line-clearance-sleeve-cutting": {
    documentId: "qc-line-clearance-sleeve-cutting",
    instructions: printedAboveGrid(
      "SHRINK SLEEVE CUTTING",
      "(1) Cut Shrink sleeve packed boxes of Previous Production order shifted to designated place ? (2) Wastage of previous job removed ?",
    ),
    headerFields: machineBox("SHRINK SLEEVE CUTTING MACHINE NAME : - ____________"),
    columns: clearanceColumns(),
    rowMode: REGISTER,
    specimenRows: templateExampleLines(),
    specimenSource: `Copy of F-QC-15-A-G Line Clearance - Printing (2).pdf — F/QC/15-G (00/16.02.2022), ${exampleLinesNote}`,
  } satisfies LogSheetLayout,
};
