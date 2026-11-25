// THE HR MODULE'S HOUSEKEEPING AND PEST-CONTROL PAPERS, DRAWN AS THE OWNER'S OWN (REQUIREMENTS §373; the owner, 24/25-Nov-2026:
// "same format present in my system which is present in google drive ... whenever user download any document of any module or
// take a print on A4 size paper, that should be very perfect").
//
// F/HR/15 DAILY CLEANING RECORD and F/HR/16 MONTHLY CLEANING RECORD are drawn here as PaperTables (data/seed/qcPaperTables.ts),
// read off the owner's workbooks (source-documents/F-HR-15_Daily Cleaning record_01_15.12.2024.xls and F-HR-16_..., the same
// sheets as the Drive's BRC-25/HR copies): his letterhead row, his title row with the Month & Year (or the YEAR) written in it and
// his number in its right cell, the NOTE inside the frame, his headings ("#", the blank area headings, 1 to 31; "#", "Area", Jan
// to Dec), a row to an area, "Cleaning done by" / "Cleaning verified by" right-aligned across the area columns, the medium rules
// of his frame and header and the thin rules inside. His sheets print at 49 % and 52 % on A4 landscape (7 pt letters); here every
// letter is 8 pt or more on one A4 landscape page (the owner, 22-Nov-2026, REQUIREMENTS §282), so the day and month columns are
// a little narrower than his and the area columns keep his proportions. No colour (§282).
//
// Every box of the record keeps its key (data/seed/hrLayouts.ts): Month & Year (monthYear), YEAR (year), the record's lines in
// their order (no, parameter, cleaning, d1..d31; jan..dec). F/HR/16's what-is-cleaned and "Cleaning by" are the paper's two
// cells, his words; the record's one Cleaning cell holding both is kept on the record, not drawn (offPaper). Every printed word
// is the record's to type over (ownWords, §275).
//
// The other five documents of §373 keep their own pages (components/records/*, pages/*); the words they print as the owner's
// or the contractor's paper are here too, so the papers of §373 are read in one place.

import type { PaperCell, PaperRow, PaperTable } from "./qcPaperTables";

/** The company as the owner's HR papers print it (his letterhead, not DCRS's header name, §275). */
export const HR_PAPER_COMPANY = "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED";

const blank = (w: number, more: Partial<PaperCell> = {}): PaperCell => ({ w, t: "", ...more });

// ---------------------------------------------------------------------------
// F/HR/15 DAILY CLEANING RECORD (01/15.12.2024): A1:AH24 of his sheet, Calibri bold. Columns # 5 | area 42.9 | cleaning 40.7 |
// 31 days x 5.7 Excel characters; rows 39 / 42 / 42 / 45 pt, an area 39 pt, the two signature rows 45 pt.

const D15 = { no: 6.0, area: 46.0, cleaning: 43.5, day: 5.6 };
/** The table's width: 269.1 mm on the A4 landscape page, whatever the month (§378: a shorter month's days are drawn wider). */
export const FHR15_WIDTH = D15.no + D15.area + D15.cleaning + 31 * D15.day;

const HEAD_PT = 9.2;
const BODY_PT = 8;
/** Two lines of an area's words, 3.2 mm apart, with room above and below them in an 8 mm row (§373: the words touched the rules). */
const AREA_LH = 3.2;

/** The record's 17 areas and its two signature lines (rowMode.rows of hr-daily-cleaning). */
const FHR15_AREAS = 17;

/**
 * F/HR/15 DRAWN WITH ITS MONTH'S DAYS (the owner, 25-Nov-2026, REQUIREMENTS §378: "the days should come according to the month of
 * the days like November has 30 days"): 1 to 28, 29, 30 or 31, the day columns sharing his 31 columns' width so the sheet still
 * fills the A4 page; the title over the days but his two before it and his seven of the number after it.
 */
function fhr15Paper(days: number): PaperTable {
  const n = Math.min(31, Math.max(28, Math.round(days)));
  const day = (31 * D15.day) / n;
  /** The first five columns his "Month & Year" cell spans (A to E), the title over the days between, the number's last 7. */
  const monthW = D15.no + D15.area + D15.cleaning + 2 * day;
  const titleW = (n - 9) * day;
  const numberW = 7 * day;
  const dayCells = (ln: number): PaperCell[] => Array.from({ length: n }, (_, i): PaperCell => ({ w: day, col: `d${i + 1}`, ln, a: "c", vm: true }));

  const head: PaperRow[] = [
    { h: 7.4, cells: [{ w: FHR15_WIDTH, t: HR_PAPER_COMPANY, pt: HEAD_PT, b: true, u: true, a: "c", vm: true, heavy: "b" }] },
    {
      h: 8.2,
      cells: [
        // "Month & Year : - " and the month written after it, in the cell his sheet merges over A to E.
        { w: monthW, t: "Month & Year : - ", pt: HEAD_PT, b: true, x: 1.2, vm: true, heavy: "rb", over: [{ box: "monthYear", x: 25.5, y: 1.6, w: 77, h: 5.0 }] },
        { w: titleW, t: "DAILY CLEANING RECORD", pt: HEAD_PT, b: true, u: true, a: "c", vm: true, heavy: "rb" },
        { w: numberW, t: "F/HR/15 (01/15.12.2024)", pt: HEAD_PT, b: true, a: "c", vm: true, heavy: "rb" },
      ],
    },
    // The NOTE inside the frame, across the sheet (the layout's own words, as the format keeps them).
    { h: 8.0, cells: [{ w: FHR15_WIDTH, lab: "@instructions:0", pt: HEAD_PT, b: true, x: 1.2, vm: true, heavy: "b" }] },
  ];

  const body: PaperRow[] = [
    // "#", the two area columns with no heading (as his sheet), and the month's days.
    {
      h: 8.2,
      head: true,
      cells: [
        { w: D15.no, t: "#", pt: BODY_PT, b: true, a: "c", vm: true },
        blank(D15.area),
        blank(D15.cleaning),
        ...Array.from({ length: n }, (_, i): PaperCell => ({ w: day, t: String(i + 1), pt: BODY_PT, b: true, a: "c", vm: true })),
      ],
    },
    ...Array.from({ length: FHR15_AREAS }, (_, ln): PaperRow => ({
      h: 8.0,
      cells: [
        { w: D15.no, col: "no", ln, pt: BODY_PT, b: true, a: "c", vm: true },
        { w: D15.area, col: "parameter", ln, pt: BODY_PT, b: true, x: 1.0, lh: AREA_LH, vm: true },
        { w: D15.cleaning, col: "cleaning", ln, pt: BODY_PT, b: true, x: 1.0, lh: AREA_LH, vm: true },
        ...dayCells(ln),
      ],
    })),
    // "Cleaning done by" and "Cleaning verified by": right-aligned in one cell across #, the area and the cleaning (A:C merged).
    ...[FHR15_AREAS, FHR15_AREAS + 1].map(
      (ln): PaperRow => ({
        h: 8.2,
        cells: [{ w: D15.no + D15.area + D15.cleaning, col: "parameter", ln, pt: BODY_PT, b: true, a: "r", vm: true }, ...dayCells(ln)],
      })
    ),
  ];

  return {
    page: "landscape",
    left: 14,
    top: 12,
    font: "calibri",
    pt: BODY_PT,
    frame: "heavy",
    ownWords: true,
    fillA4: true,
    head,
    body,
    foot: [],
    // A day the month has not (the 31st of November): kept on the record, not drawn.
    ...(n < 31 ? { offPaper: Array.from({ length: 31 - n }, (_, i) => `d${n + i + 1}`) } : {}),
  };
}

const FHR15_BY_DAYS = new Map<number, PaperTable>();
/** F/HR/15 for a month of this many days (the same drawing every time for one month length). */
export function fhr15PaperFor(days: number): PaperTable {
  const n = Math.min(31, Math.max(28, Math.round(days) || 31));
  let form = FHR15_BY_DAYS.get(n);
  if (!form) FHR15_BY_DAYS.set(n, (form = fhr15Paper(n)));
  return form;
}

/** F/HR/15 as the format stands, 1 to 31 (a sheet is drawn with its own month's days: fhr15PaperFor). */
export const FHR15_PAPER: PaperTable = fhr15PaperFor(31);

// ---------------------------------------------------------------------------
// F/HR/16 MONTHLY CLEANING RECORD (01/15.12.2024): A1:P24 of his sheet. Columns # 5 | Area 34.9 | Walls & Ceiling + Glass doors
// 13.7 | Cleaning by 15.9 | 12 months x 12 Excel characters; rows 29 / 40 / 40 / 32 / 34 pt, an area 49 pt, the foot 29 pt. The
// title row's YEAR is written in its blank; "Date" leads the date line with his arrow to the months.

const D16 = { no: 6.5, area: 48.0, what: 20.5, by: 18.0, month: 14.6 };
export const FHR16_WIDTH = D16.no + D16.area + D16.what + D16.by + 12 * D16.month;
const FHR16_AREA_W = D16.area + D16.what + D16.by;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthCells = (ln: number): PaperCell[] => MONTHS.map((m): PaperCell => ({ w: D16.month, col: m.toLowerCase(), ln, a: "c", vm: true }));
const FHR16_AREAS = 18;

const fhr16Head: PaperRow[] = [
  { h: 7.4, cells: [{ w: FHR16_WIDTH, t: HR_PAPER_COMPANY, pt: 13, b: true, u: true, a: "c", vm: true, heavy: "b" }] },
  {
    h: 8.6,
    cells: [
      // "MONTHLY CLEANING RECORD ( YEAR :          )": the year written in its blank, the whole title underlined as his.
      { w: D16.no + FHR16_AREA_W + 9 * D16.month, pt: 10.5, b: true, u: true, a: "c", vm: true, heavy: "rb", sentence: { before: "MONTHLY CLEANING RECORD ( YEAR :", box: "year", after: ")", boxWidth: 30 } },
      { w: 3 * D16.month, t: "F/HR/16 (01/15.12.2024)", pt: 10.5, b: true, a: "c", vm: true, heavy: "rb" },
    ],
  },
  { h: 7.6, cells: [{ w: FHR16_WIDTH, lab: "@instructions:0", pt: 9.6, b: true, x: 1.2, vm: true }] },
];

const fhr16Body: PaperRow[] = [
  {
    h: 6.6,
    head: true,
    cells: [
      { w: D16.no, t: "#", pt: 8.5, b: true, a: "c", vm: true, rs: 2 },
      { w: FHR16_AREA_W, t: "Area", pt: 8.5, b: true, a: "c", vm: true },
      ...MONTHS.map((m): PaperCell => ({ w: D16.month, t: m, pt: 8.5, b: true, a: "c", vm: true })),
    ],
  },
  // The date line (the record's line 0): "Date" and his arrow pointing to the months, then each month's date.
  {
    h: 6.8,
    cells: [
      { w: D16.no, skip: true },
      {
        w: FHR16_AREA_W,
        pt: 8.5,
        at: [
          { t: "Date", y: 1.95, x: 1.2, pt: 8.5, b: true },
          { t: "———————————→", y: 1.95, x: 26, pt: 8.5 },
        ],
      },
      ...monthCells(0),
    ],
  },
  ...Array.from({ length: FHR16_AREAS }, (_, i): PaperRow => {
    const ln = i + 1;
    return {
      h: 7.9,
      cells: [
        { w: D16.no, col: "no", ln, pt: BODY_PT, b: true, a: "c", vm: true },
        { w: D16.area, col: "parameter", ln, pt: 8.5, b: true, x: 1.0, lh: 3.25, vm: true },
        { w: D16.what, t: "Walls & Ceiling + Glass doors", pt: BODY_PT, b: true, x: 0.8, lh: 3.1, vm: true },
        { w: D16.by, t: "Cleaning by", pt: BODY_PT, b: true, x: 0.8, vm: true },
        ...monthCells(ln),
      ],
    };
  }),
  {
    h: 6.6,
    cells: [{ w: D16.no + FHR16_AREA_W, col: "parameter", ln: FHR16_AREAS + 1, pt: 8.5, b: true, a: "r", vm: true }, ...monthCells(FHR16_AREAS + 1)],
  },
];

export const FHR16_PAPER: PaperTable = {
  page: "landscape",
  left: 14,
  top: 12,
  font: "calibri",
  pt: BODY_PT,
  frame: "heavy",
  ownWords: true,
  fillA4: true,
  head: fhr16Head,
  body: fhr16Body,
  foot: [],
  // The record's one Cleaning cell ("Walls & Ceiling + Glass doors" over "Cleaning by"): the paper prints its two cells instead.
  offPaper: ["cleaning"],
};

/** The papers of §373 drawn as PaperTables, by document (qcPaperTables.ts paperTableFor). */
export const HR_PAPERS_357: Record<string, PaperTable> = {
  "hr-daily-cleaning": FHR15_PAPER,
  "hr-monthly-cleaning": FHR16_PAPER,
};

// ---------------------------------------------------------------------------
// F/HR/17 DAILY PEST CONTROL MONITORING RECORD (00/01.12.2021), the owner's three-page paper ("Daily pest control monitoring
// record .pdf", source-documents/F-HR-17_Daily pest Control monitoring Record.doc): each page under his header box - the
// company, the title underlined, and one row of four cells, each label and its value on one line, as his page prints them.
// The register draws it (components/records/DailyRegisterSheet.tsx), and a day's record prints on it, its date's line.

/** The words of his four cells: "Format No.: F/HR/17 | Rev No: 00 | Date: 01.12.2021 | Page No.: 1 Of 3". */
export const FHR17_PAPER_CELLS = { formatNo: "Format No.:", revNo: "Rev No:", revDate: "Date:", page: "Page No.:" };

// ---------------------------------------------------------------------------
// F/HR/18 FORTNIGHTLY – FLY CATCHER INSPECTION & CLEANING RECORD (02/15.12.2024), the owner's Word file
// (source-documents/F-HR-18_Fly Catcher Inspection & Cleaning Record.doc; the Drive's BRC-25/HR copy prints the same words).
// Its units are named as his page names them: "PC – 01" (an en dash) in the legend of his page header, "PC - 01" (a hyphen) to
// "PC - 10" and "PC – 11" to "PC – 13" in the grid. Master Data's ids (PC-01 ...) stay the records' keys.

/** The legend's names, word for word (his "PC – 10 " has a space after it, not printed). */
export const FHR18_LEGEND_LABELS: Readonly<Record<string, string>> = {
  "PC-01": "PC – 01",
  "PC-02": "PC – 02",
  "PC-03": "PC – 03",
  "PC-04": "PC – 04",
  "PC-05": "PC – 05",
  "PC-06": "PC – 06",
  "PC-07": "PC – 07",
  "PC-08": "PC – 08",
  "PC-09": "PC – 09",
  "PC-10": "PC – 10",
  "PC-11": "PC – 11",
  "PC-12": "PC - 12",
  "PC-13": "PC - 13",
};

/** The grid's names, word for word. */
export const FHR18_GRID_LABELS: Readonly<Record<string, string>> = {
  "PC-01": "PC - 01",
  "PC-02": "PC - 02",
  "PC-03": "PC - 03",
  "PC-04": "PC - 04",
  "PC-05": "PC - 05",
  "PC-06": "PC - 06",
  "PC-07": "PC - 07",
  "PC-08": "PC - 08",
  "PC-09": "PC - 09",
  "PC-10": "PC - 10",
  "PC-11": "PC – 11",
  "PC-12": "PC – 12",
  "PC-13": "PC – 13",
};

/** A unit's name in the legend and in the grid: his words for the thirteen he prints, the plant's id for one added since. */
export const fhr18LegendLabel = (pcId: string): string => FHR18_LEGEND_LABELS[pcId] ?? pcId;
export const fhr18GridLabel = (pcId: string): string => FHR18_GRID_LABELS[pcId] ?? pcId;

// ---------------------------------------------------------------------------
// THE PEST CONTROL SERVICE REPORT (Gurudev Pest Control's sheet, drawn since §118 in components/records/ServiceReportRecordView.tsx,
// data/seed/serviceReportPaper.ts): the plant addressed in his words, as his March and April 2026 sheets write it, the same on
// the rodent, general and fly reports.

export const SERVICE_PAPER_UNIT_LINE = "Unit: GUJARAT PRINTPACK PUBLICATION PRIVATE LIMITED, 308/9, GIDC, DEDIYASAN, MEHSANA, GUAJRAT, INDIA - 384002";

// ---------------------------------------------------------------------------
// THE PEST CONTROL TRAINING RECORD AS GURUDEV PEST CONTROL'S LETTER ("Training - Yrl (1).doc", the awareness programme of
// 24.12.2025, signed Rohit Patel; pages/TrainingPage.tsx). His letterhead stationery is not drawn (the owner, 17-Nov-2026,
// REQUIREMENTS §251): its room at the top of the page is left blank, as his Word file leaves it. The plant is addressed as his
// letter addresses it, his spelling ("PRINTPACK", "GUAJRAT"). The date is the record's (written dd-mm-yyyy, §171), the topics
// and the people are the record's, the sign-off's company is the record's Trainer / Provider.

export const TRAINING_LETTER = {
  date: "Date:",
  to: ["GUJARAT PRINTPACK PUBLICATION PRIVATE LIMITED", "308/9, GIDC, DEDIYASAN, MEHSANA, GUAJRAT, INDIA - 384002"],
  subject: "Subject: Pest control awareness Training Program",
  topicsHeading: "Training Topics covered",
  personnel: "List of Personnel who attended the training",
  signatory: "Rohit Patel",
} as const;

// ---------------------------------------------------------------------------
// THE PESTICIDE APPLICATION CHART AS THE COMPANY'S CHART ("Chemical Cahrt new.docx"; pages/ChemicalMasterPage.tsx): his five
// headings, word for word and in his letters, over a grid ruled throughout, at his column widths (18.2 / 35.1 / 41.0 / 69.9 /
// 41.8 mm of 206 mm; his Sr. No column a little wider on the A4 page's 186 mm, so "Sr. No" stays on one line as his). The title
// is the owner's of 17-Nov-2026 (REQUIREMENTS §251), in the ruled box his chart draws round its own.

export const CHEMICAL_HEADINGS = ["Sr. No", "Services Name", "Pest Covered", "Chemicals to be use", "Dilution Ratio"] as const;
/** The columns' share of the chart's width, %. */
export const CHEMICAL_COLUMNS = [10.2, 16.6, 19.5, 33.4, 20.3];
