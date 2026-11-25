// F-QC-32 ADHESIVE MIXING RATIO RECORD DRAWN AS THE OWNER'S OWN PAPER (REQUIREMENTS §350). Until now DCRS drew it from a
// photograph of a filled page (WhatsApp Image 2026-09-07 at 2.15.17 PM.jpeg; qcPaperTables.ts, §117), its measures judged by
// eye: 33 lines, a band of DCRS's own logo. His Google Drive holds the sheet itself: "F-QC-32_ Adhesive mixing ratio.xlsx"
// (BRC-25 / Pouch / QC - Formats, 14-02-2025), sheet "Adhesive mixing", A1:J34, A4 portrait at 80 %, the paper the photograph
// shows (its 31 ruled lines counted on the photograph too). Drawn as that sheet: his logo picture (the workbook's own,
// brand/gpp-logo-fqc32.png) where his drawing anchors it, the title, the number, revision and date in their cell on three lines,
// the blank band under them inside the frame, the ten headings in his words and letters ("Sr. No.", "Adhesive (kg)" ...), and
// the 31 lines, the record's own lines numbered under Sr. No. as on every DCRS register. His columns (read from the
// workbook's XML; column A at Excel's own width, 64 px) across 185.9 mm, the A4 page less 12 mm each side: 0.803 of the sheet,
// so his 10 pt headings print at 8 pt and his 11 pt ones at 8.8; the lines share what the page leaves (7.7 mm, his 7.9).
// Every printed word is the record's to type over where it stands (ownWords, §275).

import type { PaperCell, PaperTable } from "./qcPaperTables";

const MM = 25.4 / 72;
const round2 = (n: number): number => Math.round(n * 100) / 100;
/** The printed width: the A4 portrait page less 12 mm each side, a hair under. */
const WIDTH = 185.9;
/** His sheet's columns A to J (mm at 100 %): 231.51 mm. */
const SHEET = [16.93, 19.58, 19.58, 19.58, 19.58, 19.58, 19.58, 45.24, 24.87, 26.99];
const K = WIDTH / SHEET.reduce((a, b) => a + b, 0);
const COLS = ((): number[] => {
  const out = SHEET.map((c) => round2(c * K));
  out[out.length - 1] = round2(WIDTH - out.slice(0, -1).reduce((a, b) => a + b, 0));
  return out;
})();
const spanOf = (from: number, to: number): number => round2(COLS.slice(from, to).reduce((a, b) => a + b, 0));
/** His sizes on the page: 18 pt -> 14.45, 12 -> 9.64, 11 -> 8.83, 10 -> 8.03. */
const pt = (sheetPt: number): number => round2(sheetPt * K);
const pitch = (size: number): number => round2(size * MM * 1.25);

/** A heading: bold, centred on its cell's middle, at his size for it. */
const heading = (i: number, t: string, sheetPt: number): PaperCell => ({ w: COLS[i], t, a: "c", b: true, pt: pt(sheetPt), lh: pitch(pt(sheetPt)), vm: true });

const ADHESIVE_MIXING_PAPER: PaperTable = {
  page: "portrait",
  left: round2((210 - WIDTH) / 2),
  top: 12,
  font: "calibri",
  // (what is written on the lines at his 10 pt, 8 pt here: a date, 25-11-2026, stands inside the Date column's rules)
  pt: pt(10),
  rules: "cells",
  ownWords: true,
  fillA4: true,
  frame: "heavy",
  head: [
    {
      h: 21.25,
      cells: [
        // His picture where his drawing anchors it: 3.53 mm in, 4.59 mm down, 48.33 x 18.17 mm on the sheet.
        { w: spanOf(0, 3), t: "", img: { src: "brand/gpp-logo-fqc32.png", x: round2(3.53 * K), y: round2(4.59 * K), w: round2(48.33 * K), h: round2(18.17 * K), alt: "Gujarat Print Pack Publications Pvt. Ltd." } },
        { w: spanOf(3, 8), t: "Adhesive Mixing Ratio Record", a: "c", b: true, pt: pt(18), vm: true },
        { w: spanOf(8, 10), t: "Format No.: F-QC-32\nRev. 00\nDate : 15.12.2024", a: "c", b: true, pt: pt(12), lh: pitch(pt(12)), vm: true },
      ],
    },
    // The blank band under the title, inside the frame.
    { h: 4.25, cells: [{ w: WIDTH, t: "", edges: "lr" }] },
    {
      h: 8.5,
      head: true,
      cells: [
        heading(0, "Sr. No.", 11),
        heading(1, "Date", 11),
        heading(2, "Time", 11),
        heading(3, "Adhesive (kg)", 11),
        heading(4, "Hardener (kg)", 10),
        heading(5, "Ethyl (kg)", 10),
        heading(6, "Viscosity (Sec.)", 10),
        heading(7, "Remark", 11),
        heading(8, "Checked by", 11),
        heading(9, "Verified by", 11),
      ],
    },
  ],
  body: [],
  lines: {
    // (31 lines in what the page leaves under the 34 mm of the band and the headings, 272.5 mm all told)
    h: Math.floor(((272.5 - 34) / 31) * 100) / 100,
    count: 31,
    cells: [
      // (each line rules its sides and its foot: the rule over the first is the headings' own, as the two tables would
      // otherwise both print it)
      { w: COLS[0], num: "rows", a: "c", vm: true, edges: "lrb" },
      ...["date", "time", "adhesive", "hardener", "ethyl", "viscosity", "remark", "checkedBy", "verifiedBy"].map(
        (col, i): PaperCell => ({ w: COLS[i + 1], col, a: "c", vm: true, lh: pitch(pt(10)), edges: "lrb", ...(col === "remark" ? { lines: true as const } : {}) })
      ),
    ],
  },
  foot: [],
};

export const LAMINATION_QC_PAPERS_350: Record<string, PaperTable> = {
  "qc-adhesive-mixing": ADHESIVE_MIXING_PAPER,
};
