// THE MAINTENANCE PAPERS DRAWN AS THE OWNER'S OWN PAGE (REQUIREMENTS §316).
//
// F/MNT/11 LUX LEVEL MEASUREMENT RECORD, the owner, 24-Nov-2026, sending "F-MNT-11_LUX LEVEL MEASUREMENT RECORD-1.pdf": "the
// format that is present right now is not correct replace it with this ... but dont fill the data of date of management and
// lux level it will be filled manually. but keep the format exactly just like how i provided you now". Drawn as that page,
// measured off the PDF (mm): the band of the logo, the title and the Doc No. with its revision; Make/Model with Sr.No. at the
// right, no rule between them; the Range; the headings; and the 26 areas, each line 8 mm, as the page lists and spells them.
// Its rules as the paper's: the band, the frame and the lines under the header 0.47 mm, the grid's own 0.25 mm. Every printed
// word is the record's to type over where it stands (ownWords, as the HR papers, §275); the Date of Measurement and the Lux
// Level are the person's, never filled.

import type { PaperTable } from "./qcPaperTables";
import { MNT_PAPERS_351 } from "./mntPapers351";

/** The paper's own logo, taken from the owner's PDF. */
const LUX_LOGO = "brand/gpp-logo-fmnt11.jpg";

/** The table's columns: Area & Location, Date of Measurement, Lux Level (mm; 143.79 across). */
const COLS = [74.16, 33.74, 35.89];
const WIDTH = 143.79;

const LUX_PAPER: PaperTable = {
  page: "portrait",
  left: 33.1,
  top: 15,
  font: "calibri",
  pt: 7.56,
  frame: "heavy",
  ownWords: true,
  // printed as large as the A4 page holds it (by its height), in the middle of the page's width
  fillA4: true,
  clearFoot: true,
  // The meter's Make/Model, Sr.No. and Range are the page's printed words, bold on its lines, typed over where they stand
  // like every word of it; the record keeps its three boxes (written as the page prints them), not drawn.
  offPaper: ["makeModel", "serialNo", "range"],
  head: [
    {
      h: 15.71,
      cells: [
        { w: 47.17, t: "", heavy: "rb", img: { src: LUX_LOGO, x: 3.25, y: 1.19, w: 40.6, h: 13.81, alt: "Gujarat Print Pack Publications Pvt. Ltd." } },
        { w: 60.75, t: "LUX LEVEL MEASUREMENT\nRECORD", b: true, a: "c", pt: 13.8, y: 2.6, lh: 6.18, heavy: "rb" },
        { w: 35.89, t: "Doc No.:   F/MNT/11\n(00/01.12.2021)", b: true, a: "c", pt: 9.6, y: 4.3, lh: 4.4, heavy: "b" },
      ],
    },
  ],
  body: [
    {
      h: 7.15,
      cells: [
        { w: 107.9, t: "Make/Model: Kusam-Meco/KM-LUX-99", b: true, pt: 9.6, x: 0.61, y: 2.18, open: "r", heavy: "b" },
        { w: 35.89, t: "Sr.No.: S1135510", b: true, pt: 9.6, x: 6.06, y: 2.18, heavy: "b" },
      ],
    },
    {
      h: 7.17,
      cells: [{ w: WIDTH, t: "Range: 0 to 2000/20000 Lux", b: true, pt: 9.6, x: 0.61, y: 2.19, heavy: "b" }],
    },
    {
      h: 7.98,
      head: true,
      cells: [
        { w: COLS[0], t: "Area & Location", b: true, pt: 8.28, x: 0.53, vm: true },
        { w: COLS[1], t: "Date of Measurement", b: true, pt: 8.28, a: "c", vm: true },
        { w: COLS[2], t: "Lux Level", b: true, pt: 8.28, a: "c", vm: true },
      ],
    },
  ],
  lines: {
    h: 8.0,
    count: 26,
    cells: [
      { w: COLS[0], col: "parameter", x: 0.49, vm: true },
      { w: COLS[1], col: "measurementDate", a: "c", vm: true },
      { w: COLS[2], col: "luxLevel", a: "c", b: true, pt: 8.28, vm: true },
    ],
  },
  foot: [],
};

// F/MNT/01 to F/MNT/10 drawn as the owner's papers too (REQUIREMENTS §351, mntPapers351.ts).
export const MNT_PAPER_TABLES: Record<string, PaperTable> = {
  "mnt-lux-level": LUX_PAPER,
  ...MNT_PAPERS_351,
};
