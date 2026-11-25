// F-QC-19 TOLERANCE CARD FOR BEIERSDORF AG. GERMANY DRAWN AS THE OWNER'S OWN PAPER (REQUIREMENTS §370; the owner, 24-Nov-2026:
// "same format present in my system which is present in google drive ... whenever user download any document of any module or
// take a print on A4 size paper, that should be very perfect").
//
// The card is four A4 pages of separate boxed labels, cut out and stuck on the card beside the mounted samples ("F-QC-19_
// Tolerance card for Nivea.docx", printed as source-documents/originals-pdf/qc-tolerance-card-nivea.pdf). Measured off that
// PDF in mm (scratchpad measure_pdf.py, pymupdf: every rule and every word):
//   page 1  ERROR : MISREGISTRATION three times, then ERROR : OTHER, ERROR : IN BATCH COADING AREA, ERROR : IN NIVEA LOGO,
//           ERROR : IN PLAIN AREA, ERROR : OTHER - Calibri bold 24 pt, each box as wide as its words;
//   page 2  ERROR : IN BATCH COADING AREA again, then eight boxes TOLERANCE CARD FOR BEIERSDORF AG. GERMANY (22 pt, centred);
//   page 3  two more TOLERANCE CARD boxes, the second with the first of ten DOC NO. : F-QC-19 boxes (16 pt) under it, and
//           the first APPROVED BY: / SIGN. : table (12 pt);
//   page 4  six more APPROVED BY: / SIGN. : tables.
// Every box starts 20.53 mm from the page's left edge. The print keeps 12 mm either side of the A4 page (A4_MARGIN_MM), so the
// paper is drawn on that 186 mm width with the boxes 8.53 mm in from it: printed, it is the card's own size and place.
//
// The record's boxes (data/seed/qcRegisterLayouts.ts, unchanged): the nine ERROR labels are its nine printed lines
// (errorCategory, the line's own words, typed over on the record); the seven APPROVED BY / SIGN. tables are the approvedBy and
// sign of lines 1 to 7 in turn. The card has no approval box for its eighth and ninth labels (ERROR : OTHER and ERROR : IN
// BATCH COADING AREA again): what a record holds there is kept, not printed. Every printed word is the record's to type over
// where it stands (ownWords, §275). The card's own spelling ("COADING") is kept.

import type { PaperCell, PaperRow, PaperTable } from "./qcPaperTables";

/** The print's width on A4 portrait: 12 mm kept either side. */
const TC_W = 186;
/** The boxes' left rule, 20.53 mm from the page's edge: 8.53 mm in from the print's 12 mm. */
const TC_IN = 8.53;
/** The words stand 1.92 mm in from a box's left rule (22.45 mm on the page). */
const TC_X = 1.92;

/** Space between the boxes, or above the first on a page (pb: the paper starts a new page here). */
const space = (h: number, pb?: true): PaperRow => ({ h, cells: [{ w: TC_W, t: "", edges: "" }], ...(pb ? { pb } : {}) });

/** A row of boxed cells starting at the boxes' left rule, the rest of the width blank. */
const boxes = (h: number, cells: PaperCell[]): PaperRow => {
  const used = TC_IN + cells.reduce((a, c) => a + c.w, 0);
  return { h, cells: [{ w: TC_IN, t: "", edges: "" }, ...cells, { w: Math.round((TC_W - used) * 100) / 100, t: "", edges: "" }] };
};

/** An ERROR label: its line of the record, its words the line's own, bold 24 pt. */
const error = (h: number, w: number, ln: number): PaperRow => boxes(h, [{ w, col: "errorCategory", ln, edges: "ltrb", b: true, pt: 24, x: TC_X, y: 1.78 }]);

const TOLERANCE = "TOLERANCE CARD FOR BEIERSDORF AG. GERMANY";
/** A TOLERANCE CARD banner, bold 22 pt, centred; open beneath where the DOC NO. box hangs under it. */
const banner = (h: number, w: number): PaperRow => boxes(h, [{ w, t: TOLERANCE, edges: "ltrb", b: true, pt: 22, a: "c", y: 1.68 }]);

/** A DOC NO. : F-QC-19 label, bold 16 pt. */
const docNo = (h: number): PaperRow => boxes(h, [{ w: 47.39, t: "DOC NO. : F-QC-19", edges: "ltrb", b: true, pt: 16, x: TC_X, y: 1.24 }]);

/** An APPROVED BY: / SIGN. : table, its two rows: the words bold 12 pt, the record's approvedBy and sign of line `ln` beside them. */
const approval = (heights: [number, number], label: number, value: number, ln: number, y: [number, number]): PaperRow[] => [
  boxes(heights[0], [
    { w: label, t: "APPROVED BY:", edges: "ltrb", b: true, pt: 12, x: TC_X, y: y[0] },
    { w: value, col: "approvedBy", ln, edges: "ltrb", pt: 12, x: TC_X, vm: true },
  ]),
  boxes(heights[1], [
    { w: label, t: "SIGN. :", edges: "ltrb", b: true, pt: 12, x: TC_X, y: y[1] },
    { w: value, col: "sign", ln, edges: "ltrb", pt: 12, x: TC_X, vm: true },
  ]),
];

/** Page 3's table is 30.79 + 61.06 mm wide; page 4's six are 30.49 + 60.55 mm. */
const P4_HEIGHTS: [number, number][] = [
  [10.72, 10.42],
  [10.75, 10.42],
  [10.72, 10.42],
  [10.71, 10.41],
  [10.76, 10.41],
  [10.71, 10.41],
];

const TOLERANCE_CARD: PaperTable = {
  page: "portrait",
  left: 12,
  top: 12,
  font: "calibri",
  pt: 12,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  flows: true,
  // Page 1: the first box's top rule 40.9 mm down the page.
  head: [space(28.9)],
  body: [
    error(10.54, 102.43, 0),
    space(15.58),
    error(10.5, 102.43, 1),
    space(15.59),
    error(10.54, 102.43, 2),
    space(46.4),
    error(11.69, 60.22, 3),
    space(15.62),
    error(10.5, 126.52, 4),
    space(15.58),
    error(11.81, 88.62, 5),
    space(15.59),
    error(10.5, 86.42, 6),
    space(15.57),
    error(10.54, 58.35, 7),
    // Page 2: the last ERROR label, then eight TOLERANCE CARD banners.
    space(28.9, true),
    error(10.54, 124.91, 8),
    space(27.1),
    banner(14.4, 168.95),
    space(9.14),
    banner(14.4, 168.14),
    space(9.14),
    banner(14.39, 168.95),
    space(9.15),
    banner(14.4, 168.95),
    space(9.14),
    banner(14.4, 168.95),
    space(9.14),
    banner(14.39, 168.95),
    space(9.16),
    banner(14.39, 168.95),
    space(9.14),
    banner(14.4, 168.95),
    // Page 3: two banners, the ten DOC NO. labels (the first hung under the second banner), the first approval table.
    space(13.48, true),
    banner(14.41, 168.95),
    space(9.14),
    banner(14.39, 168.95),
    docNo(7.07),
    ...[9.15, 9.15, 9.14, 9.15, 9.14, 9.15, 9.15, 9.14, 9.15].flatMap((gap, i): PaperRow[] => [space(gap), docNo(i === 4 ? 7.11 : 7.07)]),
    space(18.12),
    ...approval([11.22, 10.97], 30.79, 61.06, 0, [0.94, 0.98]),
    // Page 4: six approval tables.
    space(13.48, true),
    ...P4_HEIGHTS.flatMap((h, i): PaperRow[] => [...(i > 0 ? [space(i >= 4 ? 9.15 : 9.14)] : []), ...approval(h, 30.49, 60.55, i + 1, [0.94, 0.93])]),
  ],
  foot: [],
};

export const QC_PAPERS_370: Record<string, PaperTable> = {
  "qc-tolerance-card-nivea": TOLERANCE_CARD,
};
