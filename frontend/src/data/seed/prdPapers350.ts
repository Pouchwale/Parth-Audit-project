// THE PRODUCTION SHEETS DRAWN AS THE OWNER'S OWN PAPERS (REQUIREMENTS §350; the owner, 24-Nov-2026: "same format present in my
// system which is present in google drive ... whenever user download any document of any module or take a print on A4 size
// paper, that should be very perfect"). F-PRD-18 and F-PRD-19 (the solvent base lamination's ALC & production report and its
// process parameter record), F-PRD-20 (slitting), F/PRD/21 (the pouching area's line clearance) and F-PRD-26 (doctoring), each
// as its workbook in his Google Drive prints it (BRCGS 25-26 / Formats / 6 Production and BRC-25 / Pouch / PRD -Formats, the
// same files as source-documents/): his company line as he spells it on that sheet, his title row with the format's number in
// its right cell, the boxes row (OPERATOR NAME : / MACHINE NAME : / DATE & SHIFT :, the record's boxes written after the
// words), the ALC protocol or the line clearance in its ruled box, his headings in his words and letters, and as many ruled
// blank lines as his sheet has, on one landscape A4 page.
//
// The measures are his sheet's (column widths and row heights read from the workbook's XML), brought to the printed page:
// every column keeps its share of the sheet's width across 272.9 mm (the A4 page less 12 mm each side), the rows of the
// header keep the sheet's heights at that scale, and the ruled lines share the rest of the page. His sheets print at 60 to 83 %,
// their words at 5.5 to 7.7 pt; here no word prints under 8 pt (the owner's rule of 22-Nov-2026, §282), so a heading the
// larger words no longer hold on two lines is given the third its row needs, from the lines' height. F/PRD/21 alone keeps his
// own proportions throughout (its words already print at 8.3 pt).
//
// Every printed word is the record's to type over where it stands (ownWords, as the HR papers, §275). The record's boxes and
// columns are the layouts' (productionLayouts.ts, logSheetLayouts.ts), bound by their keys; nothing is renamed. No fill of his
// is kept (the owner's rule, §282): F/PRD/21's grey bands print white.

import type { PaperCell, PaperRow, PaperTable } from "./qcPaperTables";

const MM = 25.4 / 72;
const round2 = (n: number): number => Math.round(n * 100) / 100;
/** The printed width: the A4 landscape page less 12 mm each side, a hair under so the print is never scaled down. */
const WIDTH = 272.9;
/** The words' size: his 10 pt words at the size the page prints them, never under 8 pt. */
const PT = 8;
/** His 16 pt company and title lines, at the same share. */
const TITLE_PT = 12.8;
/** The pitch of a cell's wrapped lines (mm), as Excel sets a wrapped cell's lines: 1.25 of the letters' size. */
const pitch = (pt: number): number => round2(pt * MM * 1.25);
/** Words at a cell's left stand this far in from its rule (mm), as Excel's do. */
const X = 0.8;

/** His columns (mm, as the workbook sets them at 100 %) across the printed width; the last takes what rounding leaves. */
function columns(sheetMm: number[], width = WIDTH): number[] {
  const k = width / sheetMm.reduce((a, b) => a + b, 0);
  const out = sheetMm.map((c) => round2(c * k));
  out[out.length - 1] = round2(width - out.slice(0, -1).reduce((a, b) => a + b, 0));
  return out;
}
/** A merged cell's width: his columns from..to (to not included). */
const spanOf = (cols: number[], from: number, to: number): number => round2(cols.slice(from, to).reduce((a, b) => a + b, 0));

/** A line of bold words across its cell's middle: the company, the title, the number. */
const titled = (w: number, t: string, more: Partial<PaperCell> = {}): PaperCell => ({ w, t, a: "c", b: true, pt: TITLE_PT, vm: true, ...more });
/** His words with the record's box written after them ("OPERATOR NAME : Gaurav Singh"): printed as one line of words. */
const boxAfter = (w: number, words: string, box: string, boxWidth: number, more: Partial<PaperCell> = {}): PaperCell => ({
  w,
  b: true,
  x: X,
  vm: true,
  lh: pitch(PT),
  sentence: { before: words, box, after: "", boxWidth, pw: true },
  ...more,
});
/** A ruled box of his words at its left (the ALC protocol, the line clearance). */
const note = (w: number, t: string, more: Partial<PaperCell> = {}): PaperCell => ({ w, t, b: true, x: X, vm: true, lh: pitch(PT), ...more });
/** A column's heading, centred as his are (or at the cell's left where his sheet leaves it so). */
const heading = (w: number, t: string, atLeft = false, more: Partial<PaperCell> = {}): PaperCell => ({ w, t, b: true, vm: true, lh: pitch(more.pt ?? PT), ...(atLeft ? { x: 0.5 } : { a: "c" }), ...more });
/**
 * A ruled line's cell: the record's column, its words centred; a name may run on to a second line. It rules its sides and its
 * foot: the rule over the first line is the headings' own (the header rows and the lines are two tables, and a rule drawn by
 * both printed twice as thick).
 */
const lineCell = (w: number, col: string, more: Partial<PaperCell> = {}): PaperCell => ({ w, col, a: "c", vm: true, lh: pitch(PT), edges: "lrb", ...more });

/** The lines' height: what the page has left under the header rows, shared by the sheet's ruled lines. */
function lineHeight(rows: PaperRow[], count: number, page = 185.4): number {
  return Math.floor(((page - rows.reduce((a, r) => a + r.h, 0)) / count) * 100) / 100;
}

/**
 * One sheet: its header rows (the heading row last) and its ruled lines, on the landscape page, every rule its cells' own;
 * the frame heavier, as his medium frame, where his sheet rules it so.
 */
const paper = (head: PaperRow[], lines: PaperTable["lines"], options: { thinFrame?: true; pt?: number } = {}): PaperTable => ({
  page: "landscape",
  left: round2((297 - WIDTH) / 2),
  top: 12,
  font: "calibri",
  pt: options.pt ?? PT,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  ...(options.thinFrame ? {} : { frame: "heavy" as const }),
  head,
  body: [],
  lines,
  foot: [],
});

// ---------------------------------------------------------------------------
// F-PRD-18 (01/25.06.2025) SOLVENT BASE LAMINATION - ALC & PRODUCTION REPORT: "F-PRD-18_SB LAMINATION Logbook -24.06.25.xls",
// sheet ASFASFSADF, A1:N17 (landscape, 73 %). The three copies (source-documents, both Drive folders) are cell for cell the same.

const C18 = columns([17.99, 27.25, 65.09, 16.4, 23.55, 22.49, 22.49, 22.49, 22.49, 16.4, 16.4, 26.19, 26.19, 24.34]);
const ALC_PROTOCOL =
  "ALC PROTOCOL : Activity to make sure a production line & its processing area are completely cleared of any material from the previous process\n" +
  "(1) Balance roll & scrap of Previous Job removed ? (2) Film type & Width for Current Job verified as per New Job order ? (3) Job change waste removed ? (4) Finished Product Rolls of Previous Job shifted to designated place / Finish Goods Warehouse ? (5) Tools & Tackles if any, removed from machine & put safely in toll box ?";
const HEAD18: PaperRow[] = [
  { h: 8, cells: [titled(WIDTH, "GUJARAT PRINTPACK PUBLICATIONS PRIVATE LIMITED")] },
  { h: 8, cells: [titled(spanOf(C18, 0, 10), "SOLVENT BASE LAMINATION - ALC & PRODUCTION REPORT"), titled(spanOf(C18, 10, 14), "F-PRD-18 (01/25.06.2025)")] },
  {
    h: 8,
    cells: [
      boxAfter(spanOf(C18, 0, 3), "OPERATOR NAME :", "operatorName", 55),
      boxAfter(spanOf(C18, 3, 10), "MACHINE NAME :", "machineName", 80),
      boxAfter(spanOf(C18, 10, 14), "DATE & SHIFT :", "shift", 45),
    ],
  },
  { h: 14.6, cells: [note(WIDTH, ALC_PROTOCOL)] },
  {
    h: 11.2,
    head: true,
    cells: [
      "FG CODE",
      "INTERNAL PO No.",
      "JOB NAME",
      "LAYER 1 TYPE",
      "LAYER 1 - Kgs.",
      "LAYER 2 TYPE",
      "LAYER 2 - Kgs.",
      "ALC DONE AS PER ABOVE (YES/NO)",
      "OPERATOR SIGN",
      "START TIME",
      "END TIME",
      "LAMINATED ROLL WEIGHT -  Kgs.",
      "OK METERs",
      "IN TIME (HOTROOM)",
    ].map((t, i) => heading(C18[i], t)),
  },
];
const ALC_PRODUCTION: PaperTable = paper(HEAD18, {
  h: lineHeight(HEAD18, 12),
  count: 12,
  cells: ["fgCode", "poNo", "jobName", "layer1Type", "layer1Kg", "layer2Type", "layer2Kg", "alcDone", "operatorSign", "startTime", "endTime", "rollWeight", "okMeters", "inTimeHotroom"].map((col, i) =>
    lineCell(C18[i], col, col === "jobName" ? { lines: true } : {})
  ),
});

// ---------------------------------------------------------------------------
// F-PRD-19 (00/15.12.2024) SOLVENT BASE LAMINATION - PROCESS PARAMETER RECORD: "F-PRD-19_SOLVENT BASE LAMINATION - PROCESS
// PARAMETER RECORD.xlsx", sheet "ASFASFSADF (2)", A1:O21 (landscape, 60 %). The Drive's copy of 08-07-2026 (BRC-25 / Pouch) is
// cell for cell the one of 09-11-2025. His only sheet ruled thin throughout, its headings at the cells' left.

const C19 = columns([28.57, 17.46, 65.09, ...Array<number>(12).fill(23.81)]);
const HEAD19: PaperRow[] = [
  { h: 7.1, cells: [titled(WIDTH, "GUJARAT PRINTPACK PUBLICATIONS PRIVATE LIMITED")] },
  { h: 7.1, cells: [titled(spanOf(C19, 0, 8), "SOLVENT BASE LAMINATION - PROCESS PARAMETER RECORD"), titled(spanOf(C19, 8, 15), "F-PRD-19 (00/15.12.2024)")] },
  {
    h: 7.7,
    cells: [
      boxAfter(spanOf(C19, 0, 3), "OPERATOR NAME :", "operatorName", 45),
      boxAfter(spanOf(C19, 3, 8), "MACHINE NAME :", "machineName", 50),
      boxAfter(spanOf(C19, 8, 11), "DATE & SHIFT :", "shift", 28),
      // (his words fill the cell's line: the ratio is written under them, whole - "10 : 1.1 : 9.5" - not broken at a space)
      boxAfter(spanOf(C19, 11, 15), "ADHESIVE + HARDENER + SOLVENT MIXING RATIO :\n", "mixingRatio", 30),
    ],
  },
  {
    h: 7.7,
    cells: [
      boxAfter(spanOf(C19, 0, 2), "ADHESIVE (MAKE) :", "adhesiveMake", 15),
      boxAfter(spanOf(C19, 2, 3), "ADHESIVE (PRODUCT CODE) :", "adhesiveCode", 15),
      boxAfter(spanOf(C19, 3, 7), "ADHESIVE (BATCH NUMBER) :", "adhesiveBatch", 28),
      boxAfter(spanOf(C19, 7, 9), "HARDENER (MAKE) :", "hardenerMake", 15),
      boxAfter(spanOf(C19, 9, 12), "HARDENER (PRODUCT CODE) :", "hardenerCode", 15),
      boxAfter(spanOf(C19, 12, 15), "HARDENER (BATCH NUMBER) :", "hardenerBatch", 20),
    ],
  },
  {
    h: 11.2,
    head: true,
    cells: [
      "INTERNAL PO No.",
      "FG CODE",
      "JOB NAME",
      "COATING NIP PRESSURE",
      "DOCTOR BLADE PRESSURE",
      "PRIMARY U/W TENSION",
      "LAY ON ROLL PRESSURE",
      "HOOD A TEMP.",
      "HOOD B TEMP.",
      "LINE SPEET",
      "REWINDER TENSION",
      "SECONDARY U/W TENSION",
      "TAPPER TENSION",
      "LAMINATOR NIP PRESSUTE",
      "LAMINATION NIP TEMP.",
    ].map((t, i) => heading(C19[i], t, true)),
  },
];
const PROCESS_PARAMETER: PaperTable = paper(
  HEAD19,
  {
    h: lineHeight(HEAD19, 16),
    count: 16,
    cells: [
      "poNo",
      "fgCode",
      "jobName",
      "coatingNip",
      "doctorBlade",
      "primaryUw",
      "layOnRoll",
      "hoodA",
      "hoodB",
      "lineSpeed",
      "rewinderTension",
      "secondaryUw",
      "tapperTension",
      "laminatorNip",
      "laminationNipTemp",
    ].map((col, i) => lineCell(C19[i], col, col === "jobName" ? { lines: true } : {})),
  },
  // (his frame is thin, as every rule of the sheet)
  { thinFrame: true }
);

// ---------------------------------------------------------------------------
// F-PRD-20 (01/25.06.2025) SLITTING - ALC & PRODUCTION REPORT: "F-PRD-20_SLITTING PRODUCTION LOGBOOK -24.06.25.xlsx", sheet
// Slitting, A1:O16 (landscape, 74 %). The Drive's copy (BRC-25 / Pouch / PRD -Formats) is the same form with a note of its
// revision beside the frame ("01 - OUT TIME (HOTROOM) - Added"), outside what it rules; the note is not on the paper.

const C20 = ((cols) => {
  // OPERATOR SIGN's column takes 0.66 mm of JOB NAME's, so that OPERATOR, its longest word, stands inside its rules at 8 pt.
  cols[2] = round2(cols[2] - 0.66);
  cols[8] = round2(cols[8] + 0.66);
  return cols;
})(columns([22.75, 17.46, 65.09, 21.43, 23.55, 22.49, 22.49, 22.49, 17.99, 16.4, 26.19, 25.93, 25.93, 19.31, 18.52]));
const LINE_CLEARANCE = "Line Clearance * :  Activity to make sure a production line & its processing area are completely cleared of any material from the previous process";
const HEAD20: PaperRow[] = [
  { h: 7.6, cells: [titled(WIDTH, "GUJARAT PRINTPACK PUBLICATIONS PRIVATE LIMITED")] },
  { h: 7.6, cells: [titled(spanOf(C20, 0, 11), "SLITTING - ALC & PRODUCTION REPORT"), titled(spanOf(C20, 11, 15), "F-PRD-20 (01/25.06.2025)")] },
  {
    h: 7.6,
    cells: [
      boxAfter(spanOf(C20, 0, 3), "OPERATOR NAME :", "operatorName", 50),
      boxAfter(spanOf(C20, 3, 11), "MACHINE NAME :", "machineName", 90),
      boxAfter(spanOf(C20, 11, 15), "DATE & SHIFT :", "dateShift", 40),
    ],
  },
  {
    h: 12.3,
    cells: [
      note(
        WIDTH,
        `${LINE_CLEARANCE} (1) Printed / Unprinted Rolls of Previous Job removed if any left out & properly labelled with original Roll number ? (2) Paper core of previous Job removed if different size (3) Printed / Unprinted Rolls of current Job loaded on machine (4) Printed / Unprinted Rolls for Current Job verified as per Job order ? (5) Job change waste removed ? (6) Finished Slitted Rolls of Previous Job shifted to designated place / Finish Goods Warehouse ? (7) Cutter blade position set as per new job size & excess blade / blade holder isolated`
      ),
    ],
  },
  {
    h: 11.2,
    head: true,
    cells: [
      "FG CODE",
      "INTERNAL PO No.",
      "JOB NAME",
      "OUT TIME (HOTROOM)",
      "FILM LAYER",
      "INPUT ROLL (Kgs.)",
      "INPUT ROLL WIDTH (mm)",
      "ALC DONE AS PER ABOVE (YES/NO)",
      "OPERATOR SIGN",
      "START TIME",
      "END TIME",
      "OUTPUT ROLL (Kgs.)",
      "OUT PUT ROLL WIDTH (mm)",
      "WASTAGE (Kgs)",
      "OK METERs",
    ].map((t, i) => heading(C20[i], t)),
  },
];
const SLITTING_ALC: PaperTable = paper(HEAD20, {
  h: lineHeight(HEAD20, 11),
  count: 11,
  cells: [
    "fgCode",
    "poNo",
    "jobName",
    "outTimeHotroom",
    "filmLayer",
    "inputRollKg",
    "inputRollWidth",
    "alcDone",
    "operatorSign",
    "startTime",
    "endTime",
    "outputRollKg",
    "outputRollWidth",
    "wastageKg",
    "okMeters",
  ].map((col, i) => lineCell(C20[i], col, col === "jobName" ? { lines: true } : {})),
});

// ---------------------------------------------------------------------------
// F/PRD/21 (00-15.12.2024) AREA LINE CLEARANCE REPORT - POUCHING: "F-PRD-21_Area Line clearance record - POUCHING.xlsx", Sheet1,
// A1:L14 (landscape, 83 %), the same file in both Drive folders. Drawn at his own proportions: Excel prints a sheet's columns
// 6.5 % wider than their widths read at 96 to the inch (measured on all five of these printouts), so his widths are taken so,
// and the whole sheet brought to the page's width (0.832); his 10 pt headings print at 8.3 pt. The company and the title rows
// are ruled heavy all round, as his; the line clearance is in Arial, as his printout sets it (the sheet names "Calibri (Body)",
// a font no printer has, and Excel prints it in Arial).

/** 272.9 mm / (307.96 mm x 1.065): his sheet's share of the page. */
const K21 = 0.832;
const C21 = columns([24.87, 24.87, 24.87, 24.87, 24.87, 24.87, 24.87, 24.87, 24.87, 26.72, 28.31, 29.1]);
const pt21 = (pt: number): number => round2(pt * K21);
const TITLE21 = "AREA LINE CLEARANCE REPORT -  POUCHING ( MACHINE NO. :                                                          )";
const GROUP_OLD = "Operator shall update the details mentioned in below columns, when existing Job completed";
const GROUP_NEW = "Operator shall update the details mentioned in below columns, when New Job started & only after Line clearance done";
const HEAD21: PaperRow[] = [
  { h: 9.47, cells: [{ w: WIDTH, t: "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED", a: "c", b: true, pt: pt21(24), vm: true, edges: "ltr", heavy: "b" }] },
  {
    h: 6.38,
    cells: [
      // The machine's number is written in the title's underlined blank (129.1 to 189.6 mm of the cell, Calibri Bold's own
      // widths at 13.31 pt), between "MACHINE NO. :" and its bracket.
      { w: spanOf(C21, 0, 9), t: TITLE21, a: "c", b: true, u: true, pt: pt21(16), vm: true, edges: "lt", heavy: "rb", over: [{ box: "machineNo", x: 130.5, y: 0.6, w: 57, h: 5.2 }] },
      { w: spanOf(C21, 9, 12), t: "Format no. - F/PRD/21 (00-15.12.2024)", a: "c", b: true, u: true, pt: pt21(14), vm: true, edges: "ltr", heavy: "b" },
    ],
  },
  {
    h: 17.01,
    cells: [
      note(
        WIDTH,
        `${LINE_CLEARANCE}                    (1) Printed / Unprinted Rolls of Previous Job removed if any left out & properly labelled with original Roll number ? (2) Printed / Unprinted Rolls of current Job loaded on machine (3) Printed / Unprinted Rolls for Current Job verified as per Job order ? (4) Job change waste removed ? (5) Corrugated box of Finished Pouches of Previous Job shifted to designated place / Finish Goods Warehouse ?`,
        { pt: pt21(12), f: "arial", lh: 4.0, x: 0.3 }
      ),
    ],
  },
  {
    h: 9.86,
    cells: [
      { w: spanOf(C21, 0, 5), t: GROUP_OLD, b: true, pt: pt21(12), x: 0.3, vm: true, lh: pitch(pt21(12)), edges: "ltb", heavy: "r" },
      { w: spanOf(C21, 5, 12), t: GROUP_NEW, b: true, pt: pt21(12), x: 0.3, vm: true, lh: pitch(pt21(12)) },
    ],
  },
  {
    h: 14.97,
    head: true,
    cells: [
      heading(C21[0], "Date \n(Old Job Production complete)", false, { pt: pt21(10), lh: 3.5 }),
      heading(C21[1], "Time \n(Old Job Production complete)", false, { pt: pt21(10), lh: 3.5 }),
      heading(C21[2], "WORK ORDER  No. of previous Product", false, { pt: pt21(10), lh: 3.5 }),
      heading(C21[3], "Previous Product Job Name", false, { pt: pt21(10), lh: 3.5 }),
      heading(C21[4], "Operator sign", false, { pt: pt21(10), lh: 3.5 }),
      heading(C21[5], "Line Clearance*  (Done/Not Done)", false, { pt: pt21(10), lh: 3.5, u: true }),
      heading(C21[6], "Date (New Job Production Start)", false, { pt: pt21(10), lh: 3.5 }),
      heading(C21[7], "Time (New Job Production start)", false, { pt: pt21(10), lh: 3.5 }),
      heading(C21[8], "WORK ORDER No. of New Product", false, { pt: pt21(10), lh: 3.5 }),
      heading(C21[9], "New Product Name", false, { pt: pt21(10), lh: 3.5 }),
      heading(C21[10], "Operator sign", false, { pt: pt21(10), lh: 3.5 }),
      heading(C21[11], "Verified by Shift supervisor", true, { pt: pt21(10), lh: 3.5, x: 0.3 }),
    ],
  },
];
const POUCHING_LINE_CLEARANCE: PaperTable = paper(
  HEAD21,
  {
    h: lineHeight(HEAD21, 9),
    count: 9,
    cells: [
      "oldJobDate",
      "oldJobTime",
      "previousWorkOrderNo",
      "previousJobName",
      "operatorSignOld",
      "lineClearance",
      "newJobDate",
      "newJobTime",
      "newWorkOrderNo",
      "newProductName",
      "operatorSignNew",
      "verifiedBySupervisor",
    ].map((col, i) => lineCell(C21[i], col, { pt: pt21(10), lh: pitch(pt21(10)), ...(col === "previousJobName" || col === "newProductName" ? { lines: true } : {}) })),
  },
  { pt: pt21(10) }
);

// ---------------------------------------------------------------------------
// F-PRD-26 (01/23.07.2025) DOCTORING - ALC & PRODUCTION REPORT: "F-PRD-26_Doctoring PRODUCTION LOGBOOK (2).xlsx", sheet
// "Doctoring ", A1:L16 (landscape, 82 %), the same file in both Drive folders and in source-documents. Its headings stand at
// their cells' left but "Job bag Require KG", centred; the cell between OPERATOR NAME and DATE & SHIFT is blank, as his.

const C26 = columns([28.57, 28.31, 65.09, 23.55, 23.55, 24.34, 22.49, 20.11, 20.9, 26.19, 26.19, 25.93]);
const HEAD26: PaperRow[] = [
  { h: 8.35, cells: [titled(WIDTH, "GUJARAT PRINTPACK PUBLICATIONS PRIVATE LIMITED")] },
  { h: 8.35, cells: [titled(spanOf(C26, 0, 8), "DOCTORING - ALC & PRODUCTION REPORT"), titled(spanOf(C26, 8, 12), "F-PRD-26 (01/23.07.2025)")] },
  {
    h: 8.35,
    cells: [boxAfter(spanOf(C26, 0, 3), "OPERATOR NAME :", "operatorName", 60), { w: spanOf(C26, 3, 8), t: "" }, boxAfter(spanOf(C26, 8, 12), "DATE & SHIFT :", "dateShift", 45)],
  },
  {
    h: 17.5,
    cells: [
      note(
        WIDTH,
        `${LINE_CLEARANCE} (1) Printed Rolls of Previous Job removed if any left out & properly labelled with original Roll number ? (2) Paper core of previous Job removed if different size (3) Printed Rolls of current Job loaded on machine (4) Printed Rolls for Current Job verified as per Job order ? (5) Job change waste removed ? (6) Finished DOCTORING Rolls of Previous Job shifted to designated place / Finish Goods Warehouse ?`
      ),
    ],
  },
  {
    h: 11.2,
    head: true,
    cells: [
      heading(C26[0], "INTERNAL PO No.", true),
      heading(C26[1], "FG CODE", true),
      heading(C26[2], "JOB NAME", true),
      heading(C26[3], "INPUT ROLL Kgs.", true),
      heading(C26[4], "Job bag Require KG"),
      heading(C26[5], "ALC DONE AS PER ABOVE (YES/NO)", true),
      heading(C26[6], "OPERATOR SIGN", true),
      heading(C26[7], "START TIME", true),
      heading(C26[8], "END TIME", true),
      heading(C26[9], "OUTPUT ROLL Kgs.", true),
      // (his rule between WASTAGE and OK Running Mtr is heavier in the headings' row)
      heading(C26[10], "WASTAGE (Kgs)", true, { edges: "ltb", heavy: "r" }),
      heading(C26[11], "OK Running Mtr", true),
    ],
  },
];
const DOCTORING_ALC: PaperTable = paper(HEAD26, {
  h: lineHeight(HEAD26, 11),
  count: 11,
  cells: ["poNo", "fgCode", "jobName", "inputRollKg", "jobBagRequireKg", "alcDone", "operatorSign", "startTime", "endTime", "outputRollKg", "wastageKg", "okRunningMtr"].map((col, i) =>
    lineCell(C26[i], col, col === "jobName" ? { lines: true } : {})
  ),
});

export const PRD_PAPERS_350: Record<string, PaperTable> = {
  "prd-alc-production": ALC_PRODUCTION,
  "prd-process-parameter": PROCESS_PARAMETER,
  "prd-slitting-alc": SLITTING_ALC,
  "prd-pouching-line-clearance": POUCHING_LINE_CLEARANCE,
  "prd-doctoring-alc": DOCTORING_ALC,
};
