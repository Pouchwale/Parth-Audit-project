// THE MAINTENANCE MODULE'S PAPERS DRAWN AS THE OWNER'S OWN (REQUIREMENTS §351, 25-Nov-2026).
//
// The owner: "same format present in my system which is present in google drive ... whenever user download any document of
// any module or take a print on A4 size paper, that should be very perfect". F/MNT/01 to F/MNT/10 were printed in DCRS's own
// style (FORMAT-AUDIT-24-11-2026.md: every one MAJOR). Each is drawn here as the owner's page, measured in mm off his file's
// own printout (pymupdf: every rule and every line of words) or, where the paper is a workbook, off its columns and rows:
//
//   F/MNT/01  Master List of Equipments-Flexo & Pouch.xlsx (Flexo sheet, the 29-09-2026 issue, 47 machines: newer than the
//             Drive's Formats copy of 05-12-2025, which lacks M-16, M-17, M-43 and M-86), as its PDF prints it.
//   F/MNT/02  DCM Sleeves Seaming Machine - F-MNT-02_PM schedule & record_GALLOPS.docx (the original on file), two pages.
//   F/MNT/03  F-MNT-03_Yearly PM Schedule(R).xls, Sheet1 - 2023 (01/15.07.2026), four pages of machine blocks.
//   F/MNT/04  F-MNT-04_Daily Equipment Health Status & Cleaning Record.pdf and its back side (Copy of ...-2.pdf); the
//             Drive's F-MNT-04 workbook (26-02-2022) draws the same two sheets.
//   F/MNT/05  Copy of F-MNT-05_Breakdown intimation Slip (1).pdf (two slips to a page) and Slip (2).pdf.
//   F/MNT/06  F-MNT-06_Equipment breakdown record.pdf; the Drive's workbook of 19-11-2025 is the same format (00/01.12.2021,
//             the same fifteen headings, 26 ruled lines).
//   F/MNT/07  Copy of F-MNT-07_Temporary engineering record.pdf.
//   F/MNT/08  F-MNT-08_New Equipment Installation & commissioning record.doc (its PDF), two pages.
//   F/MNT/09  F-MNT-09_...doc as printed, with the list and revision history of the 01.09.2025 issue (the Drive's Formats
//             copy of 01-12-2025, the revision DCRS is on since 7-Oct-2026).
//   F/MNT/10  F-MNT-10_...doc as printed, Rev 02 of 15.12.2024, three pages.
//
// Every printed word is the record's to type over where it stands (ownWords, as the HR papers, §275); no colour (§282). Every
// place a person writes is the record's own box or grid cell, under the layout's own keys (maintenanceLayouts.ts): records,
// auto-fill, Indexing (§305: F/MNT/02, 05, 06, 07 Automatic) and the checks keep working as before. Each paper is drawn in
// the millimetres of its own printout and printed as large as A4 holds it (fillA4), its letters never under 8 pt.

import type { PaperCell, PaperPick, PaperRow, PaperTable } from "./qcPaperTables";
import { GLASS_ARTICLES, MNT04_CHECK_PARAMETERS, MNT04_FOOTNOTES, MNT05_HYGIENE_CLEARANCE, WOODEN_ARTICLES } from "./maintenanceLayouts";

/** The plant's logo as the maintenance papers print it (the same picture F/MNT/11 prints, §316). */
const LOGO = "brand/gpp-logo-fmnt11.jpg";
const LOGO_ALT = "Gujarat Print Pack Publications Pvt. Ltd.";
const COMPANY = "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED";

const sum = (a: number[]): number => Math.round(a.reduce((x, y) => x + y, 0) * 100) / 100;
/** A strip of the page with no rules (a margin between two tables, or beside a narrower one). */
const gap = (w: number): PaperCell => ({ w, t: "", edges: "" });
/** A strip at a row's end, left out where it has no width (the engine keeps no column under 0.35 mm). */
const gapEnd = (w: number): PaperCell[] => (w >= 0.4 ? [gap(w)] : []);
const gapRow = (h: number, w: number, more: Partial<PaperRow> = {}): PaperRow => ({ h, cells: [gap(w)], ...more });
/** Printed words in a ruled cell, in the middle of its height. */
const word = (w: number, t: string, more: Partial<PaperCell> = {}): PaperCell => ({ w, t, vm: true, ...more });
/** A record's box filling a ruled cell. */
const boxCell = (w: number, key: string, more: Partial<PaperCell> = {}): PaperCell => ({ w, box: key, vm: true, ...more });
/** A cell of the record's grid: line ln, column col. */
const gridCell = (w: number, col: string, ln: number, more: Partial<PaperCell> = {}): PaperCell => ({ w, col, ln, vm: true, ...more });
/** A label with the record's box written after it on the same line, the box from x to the cell's right (mm). */
const labelled = (w: number, t: string, key: string, x: number, h: number, more: Partial<PaperCell> = {}): PaperCell => ({
  w,
  t,
  vm: true,
  over: [{ box: key, x, y: 0.6, w: Math.round((w - x - 0.6) * 100) / 100, h: Math.round((h - 1.2) * 100) / 100 }],
  ...more,
});
/** The same row's cells, each its paper's place on page 1 (a later page prints the same words again, typed over once). */
const samePlaces = (row: PaperRow, r: number, skip: number[] = []): PaperRow => ({
  ...row,
  cells: row.cells.map((c, ci) => (skip.includes(ci) || c.t === "" || c.t === undefined ? c : { ...c, pl: `${r}:${ci}` })),
});

// =====================================================================================================================
// F/MNT/01 LIST OF EQUIPMENTS & UTILITIES. The workbook's Flexo sheet as its PDF prints it (Letter landscape at 65%):
// the company over the whole width, the title beside "F/MNT/01 (00/01.12.2021)", a hair of a gap, the eleven headings in
// the sheet's own words and letters, and a ruled line for every machine (the sheet's 47). No Sr. No.: the sheet has none.
// =====================================================================================================================

/** The eleven columns, mm (19.79 to 255.88 on the PDF's page). */
const EQ_W = [14.49, 13.67, 20.62, 38.87, 33.4, 30.53, 19.18, 16.56, 14.6, 14.61, 19.56];
const EQ_WIDTH = sum(EQ_W);
const EQ_KEYS = ["machineNo", "department", "location", "manufacturer", "model", "description", "countryOfOrigin", "size", "month", "year", "serialNo"];
const EQ_HEADS = ["Machine No.", "Department", "Location / Room", "Machine Manufacturer Name", "Machine Name /\nModel No.", "Machine Description", "Country of Origin", "Machine Size /\nCapacity", "Month of\nmanufacture", "Year of\nManufacture", "Serial No."];
/** The sheet centres Department, Location / Room and Country of Origin; the rest stand at the left. */
const EQ_CENTRED = new Set([1, 2, 6]);
/** 6.5 pt on the PDF; 7 pt here, which prints at 8 pt on A4 (the sheet is printed 1.156 times as large). */
const EQ_PT = 7;

const EQUIPMENT_LIST_PAPER: PaperTable = {
  page: "landscape",
  left: 19.79,
  top: 16.23,
  font: "calibri",
  pt: EQ_PT,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  flows: true,
  head: [
    { h: 6.15, cells: [word(EQ_WIDTH, COMPANY, { b: true, a: "c", pt: 9.45 })] },
    {
      h: 6.1,
      cells: [
        word(sum(EQ_W.slice(0, 8)), "LIST OF EQUIPMENTS & UTILITIES", { b: true, a: "c", pt: 9.45 }),
        word(sum(EQ_W.slice(8)), "F/MNT/01 (00/01.12.2021)", { b: true, a: "c", pt: EQ_PT }),
      ],
    },
    { h: 0.8, cells: [{ w: EQ_WIDTH, t: "", edges: "lr" }] },
  ],
  body: [{ h: 6.18, head: true, cells: EQ_HEADS.map((t, i) => word(EQ_W[i], t, { b: true, x: 0.45, lh: 3.0, ...(EQ_CENTRED.has(i) ? { a: "c" as const } : {}) })) }],
  lines: {
    h: 3.0,
    count: 47,
    cells: EQ_KEYS.map((col, i): PaperCell => ({ w: EQ_W[i], col, x: 0.45, vm: true, ...(EQ_CENTRED.has(i) ? { a: "c" as const } : {}) })),
  },
  foot: [],
};

// =====================================================================================================================
// F/MNT/02 PREVENTIVE MAINTENANCE SCHEDULE & RECORD (Rev 01). The Word original's two pages (A4, 1:1): the head box with
// "Format No.: F/MNT/02 | Rev No: 01 | Date: 01.12.2021 | Page No.: 1 Of 2" on both pages; the machine and its four lists of
// check points; Monthly (4 bands of 3), Quarterly (4), Six monthly (2) and Yearly (1) Date / Maintenance / Supervisor, the
// nineteen PM slots of the record in their order; the Hygiene clearance under them; the Remarks box at the foot; page 2's
// Date of Preventive maintenance / Any abnormal findings / Action taken. Page 2 rules a line for each of the record's 19
// visits (the paper rules 16): each visit's findings are kept with it, so its date is written again beside them.
// =====================================================================================================================

/** The Hygiene clearance F/MNT/02 prints under its grids (its own words: "in charge", "equipments", "is free"). */
const MNT02_HYGIENE =
  "Hygiene clearance: - Prior to start of Maintenance activity, Product & product contact surfaces shall be adequately isolated / protected from maintenance debris, tools, cotton waste, lubricants etc. Maintenance Technician / Production in charge shall ensure that all the Maintenance related tools, lubricants, cotton waste, spares, are removed from the equipments after completion of the maintenance activity. Respective product supervisor/ in charge shall verify & acknowledge that post maintenance activity, equipment & Product contact surface is free from all tools, lubricant, cotton waste etc.";

/** The page's width: 7.83 (the tables' left) to 201.72 (the head box's right) mm. */
const PM_W = 193.89;
/** The tables' own width (7.83 to 199.77) and the strip beside them under the head box's right edge. */
const PM_T = 191.94;
const PM_R = PM_W - PM_T;
/** The head box stands 2.67 mm right of the tables (10.50 to 201.72). */
const PM_HL = 2.67;
const PM_HW = PM_W - PM_HL;
const PM_TRIPLE_M = [17.87, 24.68, 21.05, 18.93, 24.68, 21.26, 17.96, 24.63, 20.88];
const PM_TRIPLE_Q = [15.97, 15.96, 16.0, 16.01, 16.0, 16.01, 15.96, 16.01, 16.0, 16.01, 16.0, 16.01];
const PM_TRIPLE_6 = [31.93, 32.01, 32.01, 31.97, 32.01, 32.01];
const PM_TRIPLE_Y = [63.94, 63.98, 64.02];
const PM_COLS = ["date", "maintenance", "supervisor"];
const PM_ROW = 7.7;

function pmHead(page: number): PaperRow[] {
  const first = page === 1;
  const rows: PaperRow[] = [
    { h: 13.16, cells: [gap(PM_HL), word(PM_HW, COMPANY, { b: true, a: "c", pt: 16, heavy: "b", edges: "ltr" })] },
    { h: 13.01, cells: [gap(PM_HL), word(PM_HW, "PREVENTIVE MAINTENANCE SCHEDULE & RECORD", { b: true, u: true, a: "c", pt: 14, edges: "lr" })] },
    {
      h: 8.17,
      cells: [
        gap(PM_HL),
        word(56.87, "Format No.: F/MNT/02", { pt: 11, x: 1.65, heavy: "b", edges: "ltr" }),
        word(43.02, "Rev No: 01", { pt: 11, x: 1.65, heavy: "b", edges: "ltr" }),
        word(44.8, "Date: 01.12.2021", { pt: 11, x: 1.69, heavy: "b", edges: "ltr" }),
        word(46.53, `Page No.: ${page} Of 2`, { pt: 11, x: 1.65, heavy: "b", edges: "ltr" }),
      ],
    },
  ];
  if (first) return rows;
  // (page 2 prints page 1's words again, typed over once; its own page number stays its own)
  return rows.map((r, i) => ({ ...samePlaces(r, i, i === 2 ? [4] : []), ...(i === 0 ? { pb: true as const } : {}) }));
}

/** A band's label ("Monthly Preventive maintenance") across the table. */
const pmBand = (t: string, h: number): PaperRow => ({ h, cells: [word(PM_T, t, { b: true, pt: 10, x: 1.91 }), gap(PM_R)] });
/** A band's headings (Date / Maintenance / Supervisor, three at a time) and the line under them for its slots. */
function pmTriples(widths: number[], heads: string[], firstSlot: number, withEntry = true): PaperRow[] {
  const rows: PaperRow[] = [{ h: PM_ROW, cells: [...widths.map((w, i) => word(w, heads[i % 3], { pt: 10, a: "c" })), gap(PM_R)] }];
  if (withEntry) rows.push({ h: PM_ROW, cells: [...widths.map((w, i) => gridCell(w, PM_COLS[i % 3], firstSlot + Math.floor(i / 3), { pt: 10, a: "c" })), gap(PM_R)] });
  return rows;
}
const PM_HEADS = ["Date", "Maintenance", "Supervisor"];
const PM_CHECK_W = [47.93, 46.37, 48.14, 49.5];

const PM_RECORD_PAPER: PaperTable = {
  page: "portrait",
  left: 7.83,
  top: 8.13,
  font: "calibri",
  pt: 10,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  flows: true,
  // The slots' own names (Monthly Preventive maintenance ...) are the bands' printed labels.
  offPaper: ["parameter"],
  head: pmHead(1),
  body: [
    {
      h: 14.14,
      cells: [
        word(PM_CHECK_W[0], "Machine Name:", { b: true, x: 1.91 }),
        boxCell(PM_CHECK_W[1], "machineName", { x: 1.91 }),
        word(PM_CHECK_W[2], "Machine Identification No", { b: true, x: 1.9 }),
        boxCell(PM_CHECK_W[3], "machineIdNo", { x: 1.94, b: true }),
        gap(PM_R),
      ],
    },
    { h: 4.48, cells: [...["Monthly Check points", "Monthly Check points", "6 Monthly Check points", "Yearly Check points"].map((t, i) => word(PM_CHECK_W[i], t, { b: true, x: 1.91 })), gap(PM_R)] },
    {
      h: 23.88,
      cells: [
        ...["monthlyCheckPoints", "quarterlyCheckPoints", "sixMonthlyCheckPoints", "yearlyCheckPoints"].map((key, i): PaperCell => ({ w: PM_CHECK_W[i], box: key, lines: true, x: 1.91, y: 0.85, lh: 4.6 })),
        gap(PM_R),
      ],
    },
    pmBand("Monthly Preventive maintenance", 7.67),
    ...[0, 1, 2, 3].flatMap((b) => pmTriples(PM_TRIPLE_M, PM_HEADS, b * 3)),
    pmBand("Quarterly Preventive maintenance", 7.72),
    ...pmTriples(PM_TRIPLE_Q, ["Date", "Maint.", "S/visor"], 12),
    pmBand("Six monthly Preventive maintenance", 7.66),
    ...pmTriples(PM_TRIPLE_6, PM_HEADS, 16),
    pmBand("Yearly Preventive maintenance", 7.7),
    ...pmTriples(PM_TRIPLE_Y, PM_HEADS, 18),
    // The Hygiene clearance under the grids, its lead in bold, no rules round it.
    { h: 33.74, cells: [{ w: PM_T, t: MNT02_HYGIENE, bs: [0, 20], pt: 10, x: 1.91, y: 0.84, lh: 4.66, edges: "" }, gap(PM_R)] },
    { h: 10.62, cells: [gap(1.91), word(189.06, "Remarks / Any abnormal observation or findings during preventive maintenance", { b: true, u: true, x: 1.8 }), gap(PM_W - 1.91 - 189.06)] },
    // PAGE 2: the head again, then the findings of each visit.
    ...pmHead(2),
    {
      h: 17.06,
      head: true,
      cells: [
        gap(1.91),
        word(37.26, "Date of Preventive\nmaintenance", { b: true, x: 1.9, lh: 6.43 }),
        word(79.86, "Any abnormal findings / learning or observation", { b: true, x: 1.94 }),
        word(71.94, "Action taken", { b: true, x: 1.94 }),
        gap(PM_W - 1.91 - 37.26 - 79.86 - 71.94),
      ],
    },
    ...Array.from(
      { length: 19 },
      (_, ln): PaperRow => ({
        h: 10.33,
        cells: [gap(1.91), gridCell(37.26, "date", ln, { x: 1.9 }), gridCell(79.86, "findings", ln, { x: 1.94 }), gridCell(71.94, "actionTaken", ln, { x: 1.94 }), gap(PM_W - 1.91 - 37.26 - 79.86 - 71.94)],
      })
    ),
  ],
  foot: [],
};

// =====================================================================================================================
// F/MNT/03 YEARLY PREVENTIVE MAINTENANCE SCHEDULE - 2023 (01/15.07.2026). The workbook's Sheet1 as its PDF prints it (Letter
// landscape at 90%, four pages): every page heads with the company, the underlined title and "F/MNT/03 (01/15.07.2026)", and
// M/C No. | Equipment Name | Frequency | Jan ... Dec.; then one block for each machine, its number and name down the block,
// each of its frequencies two lines high, Plan over Actual, each month one column. The 21 machines of the 2026 schedule, five
// to a page as printed (six on the last). The Actual is read from the machine's F/MNT/02, as before.
// =====================================================================================================================

const YP_W = [18.29, 23.33, 17.78, 14.74];
const YP_M = [13.85, 13.84, 13.84, 13.85, 13.84, 13.85, 13.84, 13.84, 13.86, 13.84, 13.84, 13.85];
const YP_WIDTH = sum([...YP_W, ...YP_M]);
const YP_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const YP_MONTH_WORDS = ["Jan", "Feb", "Mar.", "Apr", "May", "Jun.", "July", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];
const YP_ROW = 5.46;
/** The schedule's machines in its order, each with how many frequencies it is kept at (YEARLY_PM_2026_ROWS, 42 lines). */
const YP_BLOCKS = [2, 2, 2, 2, 2, 2, 1, 2, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2];
/** The blocks each printed page starts at (five to a page, six on the last, as the workbook prints them). */
const YP_PAGE_STARTS = [5, 10, 15];

function ypHead(page: number): PaperRow[] {
  const rows: PaperRow[] = [
    { h: 9.61, cells: [{ w: YP_W[0], t: "", rs: 2 }, word(YP_WIDTH - YP_W[0], COMPANY, { b: true, a: "c", pt: 15 })] },
    {
      h: 9.27,
      cells: [
        { w: YP_W[0], t: "", skip: true },
        word(166.6, "YEARLY PREVENTIVE MAINTENANCE SCHEDULE - 2023", { b: true, u: true, a: "c", pt: 15 }),
        word(YP_WIDTH - YP_W[0] - 166.6, "F/MNT/03 (01/15.07.2026)", { b: true, u: true, a: "c", pt: 10 }),
      ],
    },
  ];
  return page === 1 ? rows : rows.map((r, i) => ({ ...samePlaces(r, i), ...(i === 0 ? { pb: true as const } : {}) }));
}

function ypHeadings(page: number): PaperRow {
  const row: PaperRow = {
    h: 9.27,
    head: true,
    cells: [
      word(YP_W[0], "M/C No.", { b: true, a: "c", pt: 10 }),
      word(YP_W[1], "Equipment\nName", { b: true, pt: 11.6, x: 0.7, lh: 5.29 }),
      word(YP_W[2] + YP_W[3], "Frequency", { b: true, a: "c", pt: 11.6 }),
      ...YP_M.map((w, i) => word(w, YP_MONTH_WORDS[i], { b: true, a: "c", pt: 10 })),
    ],
  };
  return page === 1 ? row : samePlaces(row, 2);
}

function ypBlocks(): PaperRow[] {
  const rows: PaperRow[] = [];
  let ln = 0;
  YP_BLOCKS.forEach((frequencies, b) => {
    const page = YP_PAGE_STARTS.indexOf(b);
    if (page >= 0) rows.push(...ypHead(page + 2), ypHeadings(page + 2));
    const first = ln;
    for (let f = 0; f < frequencies; f++, ln++) {
      const top = f === 0;
      const machine: PaperCell[] = top
        ? [
            gridCell(YP_W[0], "machineNo", first, { b: true, a: "c", rs: 2 * frequencies }),
            // (M-07's long name a little smaller, as the workbook sets it, so that it reads whole in its two lines)
            gridCell(YP_W[1], "equipment", first, { b: true, x: 0.62, rs: 2 * frequencies, lh: 4.57, ...(frequencies === 1 ? { pt: 8.4, lh: 3.6 } : {}) }),
          ]
        : [
            { w: YP_W[0], t: "", skip: true },
            { w: YP_W[1], t: "", skip: true },
          ];
      rows.push({
        h: YP_ROW,
        cells: [
          ...machine,
          gridCell(YP_W[2], "frequency", ln, { b: true, x: 0.61, rs: 2 }),
          word(YP_W[3], "Plan", { b: true, pt: 8.3, x: 0.53 }),
          ...YP_M.map((w, i) => gridCell(w, `${YP_MONTHS[i]}Plan`, ln, { a: "c", pt: 8.3 })),
        ],
      });
      rows.push({
        h: YP_ROW,
        cells: [
          { w: YP_W[0], t: "", skip: true },
          { w: YP_W[1], t: "", skip: true },
          { w: YP_W[2], t: "", skip: true },
          word(YP_W[3], "Actual", { b: true, pt: 8.3, x: 0.53 }),
          ...YP_M.map((w, i) => gridCell(w, `${YP_MONTHS[i]}Actual`, ln, { a: "c", pt: 8.3 })),
        ],
      });
    }
  });
  return rows;
}

const YEARLY_PM_PAPER: PaperTable = {
  page: "landscape",
  left: 19.58,
  top: 22.68,
  font: "calibri",
  pt: 10,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  flows: true,
  head: ypHead(1),
  body: [ypHeadings(1), ...ypBlocks()],
  foot: [],
};

// =====================================================================================================================
// F/MNT/04 DAILY EQUIPMENT HEALTH STATUS & CLEANING RECORD. The front as its PDF prints it (Letter portrait at 68%): logo |
// the title over "Month & Year : -" | "F/MNT/04 (00/01.12.2021)"; Machine discription / Machine No.; Check Parameter, seven
// rows in Hindi and Gujarati; the two notes; DAY SHIFT and NIGHT SHIFT, each the dates across the page (1 to 16, then 17 to
// 31) with the tick and the Operator under each, the sentence and "PTO" under each shift. The back, as its own PDF: the
// same head, then Date | Observation / Concerns reported | Action Taken | Maintenance Technician Sign | Machine Operator Sign,
// a ruled line for each day of the month (the paper rules 30), its Date the day's own.
// =====================================================================================================================

/** The page's width: 28.80 to 197.73 mm. */
const DH_WIDTH = 168.93;
const DH_LOGO_W = 28.78;
const DH_TITLE_W = 103.41;
const DH_NO_W = DH_WIDTH - DH_LOGO_W - DH_TITLE_W;
/** The grid's seventeen columns: Date / tick / Operator, then the sixteen days. */
const DH_DAYS = [17.16, 11.64, 9.19, 9.19, 9.19, 9.19, 11.51, 9.2, 9.18, 9.19, 9.18, 9.19, 9.2, 9.18, 9.19, 9.19, 9.16];
const DH_PARAM_W = [86.27, DH_WIDTH - 86.27];
const DH_PARAM_H = [7.41, 7.4, 7.12, 7.11, 15.7, 9.28, 10.06];
/** Sizes as its PDF prints them (62%): 14 pt words 8.8 pt, 16 pt 10, 18 pt 11.2, 22 pt 13.7, 12 pt 7.4; its 11 pt notes (6.8)
 * at 7.3, which prints at 8 pt on A4 (the page is printed 1.101 times as large). */
const DH_PT = 8.8;
const DH_SMALL = 7.3;
/** The Hindi and Gujarati lines' pitch on the paper (mm): their letters stand taller than a Latin line's. */
const DH_INDIC_LH = 3.94;
const DH_SENTENCE = "If any Observation found by operator , details of concerns & actions taken shall be described on back side of this page.";

/** The logo | title / Month & Year | number band and the machine's line (page 1's boxes; the back prints their words again). */
function dhHead(back: boolean): PaperRow[] {
  const box = (key: string, before: string, boxWidth: number): Partial<PaperCell> => ({ sentence: { before, box: key, after: "", boxWidth, pw: true, ...(back ? { copy: true as const } : {}) } });
  const rows: PaperRow[] = [
    {
      h: 6.81,
      cells: [
        { w: DH_LOGO_W, t: "", rs: 2, img: { src: LOGO, x: 1.31, y: 1.8, w: 26.5, h: 8.4, alt: LOGO_ALT } },
        word(DH_TITLE_W, "Daily Equipment Health Status & Cleaning Record", { b: true, a: "c", pt: 13.7 }),
        word(DH_NO_W, "F/MNT/04 (00/01.12.2021)", { b: true, a: "c", pt: 7.4, rs: 2 }),
      ],
    },
    {
      h: 6.82,
      cells: [{ w: DH_LOGO_W, t: "", skip: true }, { w: DH_TITLE_W, pt: 11.2, b: true, x: 0.5, vm: true, ...box("monthYear", "Month & Year : -", 60) }, { w: DH_NO_W, t: "", skip: true }],
    },
    {
      h: 5.98,
      cells: [
        { w: 122.99, pt: 10, b: true, x: 0.4, vm: true, ...box("machineDescription", "Machine discription :", 80) },
        { w: DH_WIDTH - 122.99, pt: 10, b: true, x: 0.4, vm: true, ...box("machineNo", "Machine No. :", 20) },
      ],
    },
  ];
  if (!back) return rows;
  return rows.map((r, i) => ({ ...r, ...(i === 0 ? { pb: true as const } : {}), cells: r.cells.map((c, ci) => (c.skip || c.img ? c : { ...c, pl: `${i}:${ci}` })) }));
}

/** A shift's grid: the dates 1-16, the tick and the Operator; the dates 17-31 under them; the sentence and PTO. */
function dhShift(title: string, check: string, operator: string, h: number[]): PaperRow[] {
  const strip = (from: number, count: number, hi: number): PaperRow[] => {
    const days = (col: string, more: Partial<PaperCell> = {}): PaperCell[] => DH_DAYS.slice(1).map((w, i) => (i < count ? gridCell(w, col, from + i, { a: "c", ...more }) : { w, t: "" }));
    return [
      { h: h[hi], cells: [word(DH_DAYS[0], "Date", { a: "c" }), ...days("date")] },
      { h: h[hi + 1], cells: [word(DH_DAYS[0], "✓", { a: "c", pt: 12 }), ...days(check, { pt: 12 })] },
      { h: h[hi + 2], cells: [word(DH_DAYS[0], "Operator", { a: "c" }), ...days(operator, { pt: DH_SMALL })] },
    ];
  };
  return [
    { h: h[0], cells: [word(DH_WIDTH, title, { b: true, a: "c" })] },
    ...strip(0, 16, 1),
    ...strip(16, 15, 4),
    { h: h[7], cells: [word(DH_WIDTH - DH_DAYS[16], DH_SENTENCE, { pt: DH_SMALL, x: 0.4 }), word(DH_DAYS[16], "PTO", { b: true, a: "c", pt: DH_SMALL })] },
  ];
}

/** The back's five columns (its Date under the front's Date, its rules under the front's day columns). */
const DH_BACK_W = [17.16, 59.74, 55.14, 18.37, DH_WIDTH - 17.16 - 59.74 - 55.14 - 18.37];
const DH_BACK_KEYS = ["date", "backObservation", "backActionTaken", "backTechnicianSign", "backOperatorSign"];

const DAILY_HEALTH_PAPER: PaperTable = {
  page: "portrait",
  left: 28.8,
  top: 11.6,
  font: "calibri",
  pt: DH_PT,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  flows: true,
  // The front's old box for the back side's details (§74): the back side is drawn now, each day's line its own (§82).
  offPaper: ["observations"],
  head: dhHead(false),
  body: [
    { h: 5.99, cells: [word(DH_WIDTH, "Check Parameter", { b: true, a: "c", pt: 10 })] },
    ...MNT04_CHECK_PARAMETERS.map(([hindi, gujarati], i): PaperRow => ({ h: DH_PARAM_H[i], cells: [word(DH_PARAM_W[0], hindi, { x: 0.8, lh: DH_INDIC_LH }), word(DH_PARAM_W[1], gujarati, { x: 0.8, lh: DH_INDIC_LH })] })),
    { h: 7.13, cells: [word(DH_WIDTH, MNT04_FOOTNOTES[0][0], { pt: DH_SMALL, x: 0.4, lh: DH_INDIC_LH })] },
    { h: 7.11, cells: [word(DH_WIDTH, MNT04_FOOTNOTES[1][0], { b: true, x: 0.4, lh: DH_INDIC_LH })] },
    ...dhShift("DAY SHIFT", "dayCheck", "dayOperator", [7.09, 4.64, 6.6, 6.61, 4.95, 6.61, 6.61, 4.42]),
    ...dhShift("NIGHT  SHIFT", "nightCheck", "nightOperator", [6.63, 4.61, 6.6, 6.61, 5.76, 6.6, 6.61, 4.43]),
    // THE BACK SIDE
    ...dhHead(true),
    {
      h: 7.06,
      head: true,
      cells: ["Date", "Observation / Concerns reported", "Action Taken", "Maintenance\nTechnician Sign", "Machine\nOperator Sign"].map((t, i) => word(DH_BACK_W[i], t, { b: true, a: "c", pt: i === 0 ? 7.4 : DH_SMALL, lh: 3.2 })),
    },
    ...Array.from({ length: 31 }, (_, ln): PaperRow => ({ h: 7.0, cells: DH_BACK_KEYS.map((col, i) => gridCell(DH_BACK_W[i], col, ln, i === 0 ? { a: "c" } : { x: 0.8 })) })),
  ],
  foot: [],
};

// =====================================================================================================================
// F/MNT/05 (1) BREAKDOWN MAINTENANCE MEMO & POST MAINTENANCE HYGIENE RECORD. Its PDF (Letter portrait at 88%): two slips to a
// page. Each slip: the company; the title beside "F/MNT/05 (00/01.12.2021)"; Machine Name- | Date of Breakdown Intimation : -;
// Machine No.- | Time of Breakdown Intimation : -; PROBLEM | WORK CARRIED OUT | SPARES USED | PREVENTIVE MEASURE TAKEN over
// their four boxes; the repair's date, time and minutes; Machine Operator- | Maintenance Technician -; the Hygiene clearance;
// Production Supervisor : - | Maintenance Supervisor : -. Both slips are this record's: the lower is its copy, its boxes the
// same boxes (the paper's lower slip is squeezed and cuts its hygiene paragraph; here it is whole).
// =====================================================================================================================

const MM_WIDTH = 183.08;
const MM_HALF = [88.21, MM_WIDTH - 88.21];
const MM_FOUR = [43.63, 44.58, 42.11, MM_WIDTH - 43.63 - 44.58 - 42.11];
const MM_REPAIR = [58.5, 71.82, MM_WIDTH - 58.5 - 71.82];
const MM_PT = 9.7;
const thinRow = (h: number): PaperRow => ({ h, cells: [{ w: MM_WIDTH, t: "", edges: "lrb" }] });

function memoSlip(copy: boolean): PaperRow[] {
  const L = (w: number, t: string, key: string, x: number, h: number) => labelled(w, t, key, x, h, { b: true, x: 0.63 });
  const rows: PaperRow[] = [
    { h: 5.88, cells: [word(MM_WIDTH, COMPANY, { b: true, a: "c", pt: 12.4 })] },
    {
      h: 8.72,
      cells: [word(130.32, "BREAKDOWN MAINTENANCE MEMO & POST MAINTENANCE HYGIENE RECORD", { b: true, pt: 10.6, x: 4.1 }), word(MM_WIDTH - 130.32, "F/MNT/05 (00/01.12.2021)", { b: true, a: "c", pt: 10.6 })],
    },
    { h: 8.75, cells: [L(MM_HALF[0], "Machine Name-", "machineName", 24, 8.75), L(MM_HALF[1], "Date of Breakdown Intimation : -", "intimationDate", 49, 8.75)] },
    { h: 8.72, cells: [L(MM_HALF[0], "Machine No.-", "machineNo", 21, 8.72), L(MM_HALF[1], "Time of Breakdown Intimation : -", "intimationTime", 49.5, 8.72)] },
    thinRow(1.44),
    { h: 4.19, cells: ["PROBLEM", "WORK CARRIED OUT", "SPARES USED", "PREVENTIVE MEASURE TAKEN"].map((t, i) => word(MM_FOUR[i], t, { b: true, a: "c", lh: 3.6 })) },
    { h: 37.26, cells: ["problem", "workCarriedOut", "sparesUsed", "preventiveMeasureTaken"].map((key, i): PaperCell => ({ w: MM_FOUR[i], box: key, lines: true, x: 0.63, y: 0.6, lh: 4.2 })) },
    {
      h: 7.25,
      cells: [L(MM_REPAIR[0], "Date of Breakdown repair : -", "repairDate", 41.8, 7.25), L(MM_REPAIR[1], "Time of Breakdown repair :-", "repairTime", 41.2, 7.25), L(MM_REPAIR[2], "Breakdown minutes : -", "breakdownMinutes", 34.3, 7.25)],
    },
    thinRow(1.31),
    { h: 7.24, cells: [L(MM_HALF[0], "Machine Operator-", "machineOperator", 28.6, 7.24), L(MM_HALF[1], "Maintenance Technician -", "maintenanceTechnician", 38, 7.24)] },
    thinRow(1.08),
    { h: 25.95, cells: [{ w: MM_WIDTH, t: MNT05_HYGIENE_CLEARANCE, bs: [0, 20], bsu: true, x: 0.63, y: 1.3, lh: 4.49 }] },
    thinRow(1.46),
    { h: 7.21, cells: [L(MM_HALF[0], "Production Supervisor : -", "productionSupervisor", 37.3, 7.21), L(MM_HALF[1], "Maintenance Supervisor : -", "maintenanceSupervisor", 39.6, 7.21)] },
  ];
  return copy ? rows.map((r, i) => samePlaces(r, i)) : rows;
}

const BREAKDOWN_MEMO_PAPER: PaperTable = {
  page: "portrait",
  left: 16.43,
  top: 7.03,
  font: "calibri",
  pt: MM_PT,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  // (the first slip's company and title are the paper's head: the print takes the page's width from its first row)
  head: memoSlip(false).slice(0, 2),
  body: [...memoSlip(false).slice(2), gapRow(15.51, MM_WIDTH), ...memoSlip(true)],
  foot: [],
};

// =====================================================================================================================
// F/MNT/05 (2) BREAKDOWN MAINTENANCE MEMO & HYGIENE CLEARANCE RECORD. Its PDF (Letter portrait, edge to edge): one heavy-
// ruled slip under "GUJARAT PRINT PACK PUBLICATION LIMITED" (the slip's own name for the company); the underlined title at
// the left of "F/MNT/05 (00/01.12.2021)"; the user, the date, the machine, its ID, the breakdown time; the three boxed writing
// areas under their underlined labels; Job Completion & Handover time; the training question with "Yes / No" to ring; the
// Hygiene clearance; Problem attended by : - | Sign of the User dept. : -.
// =====================================================================================================================

const BC_WIDTH = 215.14;
const BC_LEFT = 141.84;
const BC_PT = 13.8;
/** Every rule of this slip is its heavy rule: each cell rules its right and its foot heavy, the frame its left and top. */
const heavyCell = (c: PaperCell): PaperCell => ({ ...c, edges: "lt", heavy: "rb" });
const area = (t: string, key: string, h: number): PaperRow => ({
  h,
  cells: [heavyCell({ w: BC_WIDTH, t, u: true, x: 0.81, y: 1.17, over: [{ box: key, x: 0.81, y: 7.2, w: BC_WIDTH - 2, h: h - 8.2, lines: true }] })],
});
const trainingPicks: PaperPick[] = ["Yes", "No"].map((value) => ({ box: "trainingOrPmChangeNeeded", value, word: value, mark: "ring" }));

const BREAKDOWN_CLEARANCE_PAPER: PaperTable = {
  page: "portrait",
  left: 0.38,
  top: 19.22,
  font: "calibri",
  pt: BC_PT,
  rules: "cells",
  frame: "heavy",
  ownWords: true,
  fillA4: true,
  head: [
    { h: 12.96, cells: [heavyCell(word(BC_WIDTH, "GUJARAT PRINT PACK PUBLICATION LIMITED", { a: "c", pt: 21.8 }))] },
    {
      h: 8.81,
      cells: [
        heavyCell(word(BC_LEFT, "BREAKDOWN MAINTENANCE MEMO & HYGIENE CLEARANCE RECORD", { b: true, u: true, pt: 12.8, x: 0.76 })),
        heavyCell(word(BC_WIDTH - BC_LEFT, "F/MNT/05 (00/01.12.2021)", { b: true, a: "c", pt: 11.9 })),
      ],
    },
  ],
  body: [
    { h: 9.82, cells: [heavyCell(labelled(BC_LEFT, "Name of the User  :", "userName", 40, 9.82, { x: 0.81 })), heavyCell(labelled(BC_WIDTH - BC_LEFT, "DATE :", "date", 14.6, 9.82, { x: 0.81 }))] },
    { h: 9.82, cells: [heavyCell(labelled(BC_LEFT, "Name of the Machine :", "machineName", 46.9, 9.82, { x: 0.81 })), heavyCell(labelled(BC_WIDTH - BC_LEFT, "M/c ID No. :", "machineIdNo", 25.5, 9.82, { x: 0.81 }))] },
    { h: 9.82, cells: [heavyCell(word(BC_LEFT, "Machine Breakdown time :", { x: 0.81 })), heavyCell(boxCell(BC_WIDTH - BC_LEFT, "breakdownTime", { x: 0.81 }))] },
    area("Problem reported by User :", "problemReportedByUser", 29.47),
    area("Problem observed by Maintenance department  :", "problemObservedByMaintenance", 29.47),
    area("Action taken :", "actionTaken", 39.29),
    { h: 14.01, cells: [heavyCell(word(71.14, "Job Completion & Handover time :", { x: 0.81 })), heavyCell(boxCell(BC_WIDTH - 71.14, "handoverTime", { x: 1.5 }))] },
    {
      h: 14.02,
      cells: [
        heavyCell(word(BC_LEFT, "Need for training of machine operators or modification of PM check\npoints & frequency : -", { x: 0.81, lh: 6.3 })),
        heavyCell({ w: BC_WIDTH - BC_LEFT, t: "", a: "c", vm: true, pick: trainingPicks }),
      ],
    },
    { h: 30.7, cells: [heavyCell({ w: BC_WIDTH, t: MNT05_HYGIENE_CLEARANCE, bs: [0, 18], bsu: true, pt: 11.9, x: 0.72, y: 2.4, lh: 5.46 })] },
    { h: 12.74, cells: [heavyCell(labelled(88.71, "Problem attended by : -", "problemAttendedBy", 49.2, 12.74, { x: 0.81 })), heavyCell(labelled(BC_WIDTH - 88.71, "Sign of the User dept. : -", "userDeptSign", 50.2, 12.74, { x: 0.81 }))] },
  ],
  foot: [],
};

// =====================================================================================================================
// F/MNT/06 EQUIPMENTS BREAKDOWN MAINTENANCE RECORD. Its PDF (A3 landscape) and the Drive's workbook of 19-11-2025: logo |
// title | "F/MNT/06 (00/01.12.2021)"; BREAKDOWN HISTORY over SR.NO. to FAULT ATTEND. BY, ACTION TAKEN down both heading rows,
// USED MATERIALS, BREAKDOWN HISTORY & SUMMARY; the fifteen headings in the paper's words ("REASON For Breakdown"); 26 ruled
// lines. On A4 the page is drawn at 65%: its letters 12.3 pt here print at 8 pt, so the four columns whose heading words
// would not fit at that size (SR.NO., the two failure columns, EQUIPMENT ID NO., SPECIFICATION) take a little of the
// width of EQUIPMENT NAME, FAULT REPORTED and REASON For Breakdown. QTY. keeps the paper's width.
// =====================================================================================================================

const BR_W = [14.12, 24.76, 24.76, 31.17, 24.75, 29.9, 25.78, 25.78, 28.57, 22.44, 33.74, 33.75, 31.83, 31.84, 36.0];
const BR_WIDTH = sum(BR_W);
const BR_PT = 12.3;
const BR_KEYS = ["failureDate", "failureTime", "equipmentName", "equipmentIdNo", "faultReported", "faultAttendedBy", "actionTaken", "specification", "qty", "repairedDate", "repairedTime", "totalBreakdownMinutes", "productionLossMinutes", "reason"];
/** The headings of the second row, under the groups (ACTION TAKEN stands down both rows). */
const BR_HEADS: [string, "c" | undefined][] = [
  ["SR.NO.", "c"],
  ["EQUIPMENT FAILURE REPORTED DATE", "c"],
  ["EQUIPMENT FAILURE REPORTED TIME", "c"],
  ["EQUIPMENT NAME", "c"],
  ["EQUIPMENT ID NO.", "c"],
  ["FAULT REPORTED", undefined],
  ["FAULT ATTEND. BY", undefined],
  ["", undefined],
  ["SPECIFICATION", undefined],
  ["QTY.", "c"],
  ["EQUIPMENT REPAIRED DATE", undefined],
  ["EQUIPMENT REPAIRED TIME", undefined],
  ["TOTAL BREAKDOWN MINUTES", undefined],
  ["PRODUCTION LOSS MINUTES", undefined],
  ["REASON For Breakdown", "c"],
];

const BREAKDOWN_RECORD_PAPER: PaperTable = {
  page: "landscape",
  left: 0.42,
  top: 10.08,
  font: "calibri",
  pt: BR_PT,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  flows: true,
  head: [
    {
      h: 22.52,
      cells: [
        { w: 59.95, t: "", img: { src: LOGO, x: 1.06, y: 0.7, w: 57.4, h: 21.05, alt: LOGO_ALT } },
        word(290.31, "EQUIPMENTS BREAKDOWN MAINTENANCE RECORD", { b: true, a: "c", pt: 19.8 }),
        word(BR_WIDTH - 59.95 - 290.31, "F/MNT/06 (00/01.12.2021)", { b: true, a: "c", pt: BR_PT }),
      ],
    },
    { h: 1.36, cells: [{ w: BR_WIDTH, t: "", edges: "lr" }] },
  ],
  body: [
    {
      h: 8.47,
      head: true,
      cells: [
        word(sum(BR_W.slice(0, 7)), "BREAKDOWN HISTORY", { b: true, a: "c" }),
        word(BR_W[7], "ACTION TAKEN", { b: true, a: "c", rs: 2 }),
        word(BR_W[8] + BR_W[9], "USED MATERIALS", { b: true, a: "c" }),
        word(sum(BR_W.slice(10)), "BREAKDOWN HISTORY & SUMMARY", { b: true, a: "c" }),
      ],
    },
    {
      h: 21.5,
      head: true,
      cells: BR_HEADS.map(([t, a], i): PaperCell => (i === 7 ? { w: BR_W[i], t: "", skip: true } : word(BR_W[i], t, { b: true, x: 0.55, lh: 5.08, ...(a ? { a } : {}) }))),
    },
  ],
  lines: {
    h: 8.47,
    count: 26,
    cells: [{ w: BR_W[0], num: "rows", a: "c", vm: true }, ...BR_KEYS.map((col, i): PaperCell => ({ w: BR_W[i + 1], col, x: 0.55, vm: true, ...(col === "qty" ? { a: "c" as const } : {}) }))],
  },
  foot: [],
};

// =====================================================================================================================
// F/MNT/07 TEMPORARY ENGINEERING LOG. Its PDF (Letter landscape, edge to edge): the company; the title beside
// "F/MNT/07 (00/01.12.2021)"; notes 1 to 5 inside the frame; the ten headings in the paper's words, Description of Temporary
// engineering work & Reason for temporary engineering the widest; nine ruled lines. No Sr. No.: the paper has none.
// =====================================================================================================================

const TE_W = [19.64, 19.65, 63.81, 27.64, 24.9, 21.38, 25.91, 19.65, 25.91, 29.39];
const TE_WIDTH = sum(TE_W);
const TE_KEYS = ["date", "startTime", "description", "equipmentDetails", "tempVerifiedMaintenance", "tempVerifiedProduction", "permanentDate", "endTime", "permVerifiedMaintenance", "permVerifiedProduction"];
const TE_HEADS = [
  "Date",
  "Start time - Temporary engineering done",
  "Description of Temporary engineering work & Reason for temporary engineering",
  "Equipment Details",
  "Temporary engineering varified by (Maintenance In-charge)",
  "Temporary engineering varified by (Production In-charge)",
  "Date of Permanent repair / Solution or removal of temporay engineering",
  "End time (Temporary Engineering removed)",
  "Permanent repair varified by (Maintenance In-charge)",
  "Permanent repair varified by (Production In-charge)",
];
/** The five notes as the paper sets them: the number, then the words at the tab. */
const TE_NOTES = [
  "1.       Temporary engineering should only be used where there is no immediate, permanent solution",
  "2.       Temporary engineering must be suitably risk assessed and approved by a department head in conjunction with engineering.",
  "3.       Initial details must be recorded below",
  "4.       The engineering department must ensure a permanent solution is implemented as soon as practicable",
  "5.       Once the permanent solution is implemented the record must be completed",
];

const TEMPORARY_ENGINEERING_PAPER: PaperTable = {
  page: "landscape",
  left: 0.76,
  top: 16.51,
  font: "calibri",
  pt: 9.7,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  flows: true,
  head: [
    { h: 11.95, cells: [word(TE_WIDTH, COMPANY, { b: true, a: "c", pt: 17.6 })] },
    { h: 11.93, cells: [word(222.58, "TEMPORARY ENGINEERING LOG", { b: true, a: "c", pt: 17.6 }), word(TE_WIDTH - 222.58, "F/MNT/07 (00/01.12.2021)", { b: true, a: "c", pt: 8.8 })] },
  ],
  body: [
    { h: 31.55, cells: [{ w: TE_WIDTH, t: TE_NOTES.join("\n"), x: 0.64, y: 1.4, lh: 6.31 }] },
    { h: 31.75, head: true, cells: TE_HEADS.map((t, i) => word(TE_W[i], t, { b: true, a: "c", lh: 4.49 })) },
  ],
  lines: { h: 10.92, count: 9, cells: TE_KEYS.map((col, i): PaperCell => ({ w: TE_W[i], col, x: 0.6, vm: true })) },
  foot: [],
};

// =====================================================================================================================
// F/MNT/08 NEW EQUIPMENT INSTALLATION REPORT. The Word original's two pages (A4, 1:1): logo | NEW EQUIPMENT INSTALLATION
// REPORT | "F/MNT/08 (00/01.12.2021)" on both pages; page 1 the equipment's five boxes beside their bold labels and the ten
// requirements with Assessment of Equipment Y/N and Comments, each row as tall as the paper's; page 2 Benefits:, Risks
// including deviation accepted conditionally:, the declaration in bold, Hand over & Take over Protocol, and each head with
// his Date.
// =====================================================================================================================

/** The page's width: 16.04 to 197.73 mm. */
const NE_WIDTH = 181.69;
const NE_L = 74.61;
const NE_R = NE_WIDTH - NE_L;
const NE_REQ = [NE_L, 32.52, NE_WIDTH - NE_L - 32.52];
const NE_REQ_H = [19.73, 9.65, 9.65, 19.15, 14.39, 14.39, 14.35, 9.66, 9.66, 9.69];
/** Page 2's table is narrower: 16.04 to 193.37 mm. */
const NE_P2 = 177.33;
const NE_P2_GAP = NE_WIDTH - NE_P2;

function neHead(page: number): PaperRow[] {
  const row: PaperRow = {
    h: 21.59,
    cells: [
      // (the head box stands 0.3 mm in from the table's left and 0.46 mm short of its right: drawn on the table's edges)
      { w: 62.89, t: "", img: { src: LOGO, x: 2.13, y: 0.09, w: 58.84, h: 21.41, alt: LOGO_ALT } },
      word(81.72, "NEW EQUIPMENT INSTALLATION REPORT", { b: true, a: "c", pt: 12 }),
      { w: NE_WIDTH - 62.89 - 81.72, t: "F/MNT/08\n(00/01.12.2021)", pt: 11, x: 1.9, y: 6.81, lh: 4.75 },
    ],
  };
  const gapUnder = gapRow(5.55, NE_WIDTH);
  return page === 1 ? [row] : [{ ...samePlaces(row, 0), pb: true }, gapUnder];
}

const NEW_EQUIPMENT_PAPER: PaperTable = {
  page: "portrait",
  left: 16.04,
  top: 6.14,
  font: "calibri",
  pt: 11,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  flows: true,
  head: neHead(1),
  body: [
    gapRow(5.55, NE_WIDTH),
    { h: 7.54, cells: [word(NE_L, "Name of Equipment:", { b: true, x: 2.08 }), boxCell(NE_R, "equipmentName", { x: 1.9 })] },
    { h: 9.14, cells: [{ w: NE_L, t: "Manufacturer:", b: true, x: 2.08, y: 5.08 }, boxCell(NE_R, "manufacturer", { x: 1.9 })] },
    { h: 9.14, cells: [{ w: NE_L, t: "Supplier (contact information)", b: true, x: 2.08, y: 5.08 }, boxCell(NE_R, "supplier", { x: 1.9 })] },
    { h: 9.66, cells: [{ w: NE_L, t: "Model & Serial Number:", b: true, x: 2.08, y: 5.59 }, boxCell(NE_R, "modelSerial", { x: 1.9 })] },
    { h: 19.13, cells: [{ w: NE_L, t: "Location and Function of Equipment:", b: true, x: 2.08, y: 5.58 }, { w: NE_R, box: "locationFunction", lines: true, x: 1.9, y: 1.0, lh: 4.75 }] },
    {
      h: 10.0,
      cells: [
        { w: NE_REQ[0], t: "Requirement", b: true, x: 2.08, y: 0.85 },
        { w: NE_REQ[1], t: "Assessment of\nEquipment   Y/N", b: true, x: 1.91, y: 0.85, lh: 4.75 },
        { w: NE_REQ[2], t: "Comments along with date of action", b: true, x: 1.91, y: 0.85 },
      ],
    },
    ...NE_REQ_H.map((h, ln): PaperRow => ({
      h,
      cells: [gridCell(NE_REQ[0], "parameter", ln, { x: 2.08, y: 0.85, lh: 4.93, vm: undefined }), gridCell(NE_REQ[1], "assessment", ln, { a: "c" }), gridCell(NE_REQ[2], "comments", ln, { x: 1.91 })],
    })),
    // PAGE 2
    ...neHead(2),
    {
      h: 23.88,
      cells: [{ w: NE_P2, t: "Benefits:", x: 2.08, y: 0.85, over: [{ box: "benefits", x: 2.08, y: 5.6, w: NE_P2 - 4, h: 17.6, lines: true }] }, gap(NE_P2_GAP)],
    },
    {
      h: 23.83,
      cells: [{ w: NE_P2, t: "Risks including deviation accepted conditionally:", x: 2.08, y: 0.85, over: [{ box: "risks", x: 2.08, y: 5.6, w: NE_P2 - 4, h: 17.6, lines: true }] }, gap(NE_P2_GAP)],
    },
    {
      h: 11.1,
      cells: [{ w: NE_P2, t: "The Benefits and Risks have been assessed, PM, Sanitation etc.  Attach any supportive documents, procedures photos.  Approval has been made.", b: true, x: 2.08, y: 0.9, lh: 5.46 }, gap(NE_P2_GAP)],
    },
    { h: 7.28, cells: [word(NE_P2, "Hand over & Take over Protocol", { b: true, a: "c" }), gap(NE_P2_GAP)] },
    ...[
      ["Maintenance Head: -", "maintenanceHead", 35.8, "maintenanceHeadDate"],
      ["Production Head: -", "productionHead", 32.4, "productionHeadDate"],
      ["QC Head: -", "qcHead", 19.7, "qcHeadDate"],
    ].map(
      ([t, key, x, dateKey]): PaperRow => ({
        h: 9.65,
        cells: [labelled(97.52, t as string, key as string, x as number, 9.65, { x: 2.08 }), labelled(NE_P2 - 97.52, "Date:", dateKey as string, 11.8, 9.65, { x: 1.91 }), gap(NE_P2_GAP)],
      })
    ),
  ],
  foot: [],
};

// =====================================================================================================================
// F/MNT/09 LIST OF GLASS ARTICLES & WEEKLY GLASS BREKAGE MONITORING RECORD. The Word original's two pages (A4 landscape,
// 1:1): logo | title | "F/MNT/09 (02 / 01.09.2025)" on both; page 1 the list of glass and brittle plastic articles by area
// (the 01.09.2025 list, its TOTAL row, the grand total blank as the paper leaves it) and the revision history; page 2 Month &
// Year and Monitoring Weeks as the table's own rows, Date of monitoring, the twelve areas, BREAKAGE, CHECKED BY and VARIFIED
// BY over Week - 1 to Week - 5, the four instructions in the column at the right.
// =====================================================================================================================

/** The page's width: 8.85 to 292.73 mm. */
const GL_WIDTH = 283.88;
const GL_HEAD = [62.66, 164.75, 55.63];
/** The list: 13.72 to 290.45 mm. */
const GL_LIST = [44.75, 30.74, 36.75, 33.7, 25.7, 21.01, 27.05, 27.01, 30.02];
const GL_LIST_HEADS = ["Glass\nWindow/Door", "Acrylic Sheets for\nFalse Ceiling", "Tubelight", "CCTV\nCamera", "LED Light", "Monitor+TV", "Insect Killer", "Total Qty"];
/** The 01.09.2025 list's rows: each as tall as the paper's (two lines where the area's name takes two). */
const GL_LIST_H = [6.23, 9.36, 7.16, 6.98, 6.5, 6.26, 6.27, 5.46, 4.92, 4.95, 4.91, 4.91];
const GL_TOTALS = [349, 3015, 182, 66, 324, 36, 8];
/** The revision history: 13.72 to 292.73 mm. */
const GL_REV = [20.07, 33.32, 121.68, 103.94];
/** The monitoring table: 14.90 to 210.86, the instructions to 291.42 mm. */
const GL_MON = [78.08, 23.58, 23.54, 23.59, 23.58, 23.59];
const GL_NOTES_W = 80.56;
const GL_MON_H = [8.43, 6.44, 7.79, 7.36, 8.0, 7.29, 6.69, 6.69, 6.73, 6.69, 6.69, 6.73, 6.69, 8.31, 8.34, 8.33];
const WEEK_WORDS = ["Week - 1", "Week – 2", "Week – 3", "Week – 4", "Week - 5"];
const WEEK_KEYS = ["week1", "week2", "week3", "week4", "week5"];
/** The instructions, each bullet's lines as the paper breaks them, their words at its indent. */
const GL_NOTES = [
  ["Pl checks the condition of Glass / Brittle", "Plastic article for any sign of breakage /", "cracks as per List of Glass articles mentioned", "above."],
  ["In case of any crack or breakage of Glass /", "Brittle Plastic article is noted during Weekly", "monitoring, Maintenance Fitter shall", "immediately inform to Maintenance In-", "charge as well as HOD of the area, where", "deviation found"],
  ["Please refer SOP for Handling of Glass", "breakage for prevention of cross", "contamination of affected products"],
  ["Pl fill up CA / Incident record along with root", "cause analysis, correction & corrective action", "for actual breakage or crack"],
];
const WOOD_NOTES = [
  ["If any chipping observed from table,", "chair or any other wooden articles", "other than wooden pallets, locate", "the missing part."],
  ["Immediately inform to HOD /", "Manager of the identified area"],
  ["Take further actions as per guidance", "of HOD"],
];
/** Bulleted lines as the paper sets them: the bullet, then the words at the indent, the lines after it under the words. */
const bulleted = (notes: string[][]): string => notes.map((lines) => lines.map((l, i) => (i === 0 ? `•    ${l}` : `      ${l}`)).join("\n")).join("\n");
const GL_NOTES_TEXT = bulleted(GL_NOTES);
const GL_BOLD_FROM = GL_NOTES_TEXT.indexOf("CA / Incident record");

function glHead(page: number): PaperRow[] {
  const row: PaperRow = {
    h: 24.23,
    cells: [
      { w: GL_HEAD[0], t: "", img: { src: LOGO, x: 1.91, y: 1.4, w: 58.84, h: 21.42, alt: LOGO_ALT } },
      word(GL_HEAD[1], "LIST OF GLASS ARTICLES & WEEKLY GLASS BREKAGE MONITORING RECORD", { b: true, a: "c", pt: 14 }),
      word(GL_HEAD[2], "F/MNT/09 (02 / 01.09.2025)", { a: "c", pt: 11 }),
      gap(GL_WIDTH - sum(GL_HEAD)),
    ],
  };
  return page === 1 ? [row] : [{ ...samePlaces(row, 0), pb: true }];
}

const listNumber = (w: number, n: number | string, more: Partial<PaperCell> = {}): PaperCell => word(w, String(n), { a: "c", ...more });
const GL_L = 4.87;
const GL_LIST_R = GL_WIDTH - GL_L - sum(GL_LIST);
const GL_REV_R = GL_WIDTH - GL_L - sum(GL_REV);
const GL_MON_L = 6.05;
const GL_MON_R = GL_WIDTH - GL_MON_L - sum(GL_MON) - GL_NOTES_W;

const GLASS_PAPER: PaperTable = {
  page: "landscape",
  left: 8.85,
  top: 6.43,
  font: "calibri",
  pt: 11,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  flows: true,
  head: glHead(1),
  body: [
    gapRow(9.01, GL_WIDTH),
    {
      h: 9.19,
      cells: [gap(GL_L), word(GL_LIST[0], "Nos. & Type of articles", { b: true, x: 1.9, edges: "ltr" }), ...GL_LIST_HEADS.map((t, i) => word(GL_LIST[i + 1], t, { b: true, a: "c", pt: i < 5 ? 12 : 11, rs: 2, lh: 5.16 })), gap(GL_LIST_R)],
    },
    {
      h: 10.03,
      cells: [gap(GL_L), word(GL_LIST[0], "Location / Area\nOf Glass", { b: true, x: 1.9, lh: 4.74, edges: "lrb" }), ...GL_LIST_HEADS.map((_, i): PaperCell => ({ w: GL_LIST[i + 1], t: "", skip: true })), gap(GL_LIST_R)],
    },
    ...GLASS_ARTICLES.map(([areaName, counts, total], i): PaperRow => ({
      h: GL_LIST_H[i],
      cells: [gap(GL_L), word(GL_LIST[0], areaName, { x: 1.9, lh: 4.74 }), ...counts.map((n, k) => listNumber(GL_LIST[k + 1], n)), listNumber(GL_LIST[8], total), gap(GL_LIST_R)],
    })),
    {
      h: 5.71,
      cells: [gap(GL_L), word(GL_LIST[0], "TOTAL", { b: true, x: 1.9 }), ...GL_TOTALS.map((n, k) => listNumber(GL_LIST[k + 1], n, { b: true })), { w: GL_LIST[8], t: "" }, gap(GL_LIST_R)],
    },
    gapRow(5.04, GL_WIDTH),
    { h: 7.51, cells: [gap(GL_L), word(sum(GL_REV), "Revision history for update in addition / removal of Glass & Brittle plastic articles", { b: true, x: 1.9 }), ...gapEnd(GL_REV_R)] },
    { h: 7.57, cells: [gap(GL_L), ...["Rev. no.", "Effective date", "Details of change", "Reason for change"].map((t, i) => word(GL_REV[i], t, { a: "c" })), ...gapEnd(GL_REV_R)] },
    {
      h: 11.81,
      cells: [
        gap(GL_L),
        word(GL_REV[0], "1.", { a: "c" }),
        word(GL_REV[1], "15.12.2024", { a: "c" }),
        { w: GL_REV[2], t: "New Glass Articals Added", a: "c", f: "times", pt: 12, y: 0.62 },
        { w: GL_REV[3], t: "New Warehouse Constructed & Old Paper Godown\nConverted To Pouching Department", a: "c", f: "times", pt: 12, y: 0.62, lh: 4.86 },
        ...gapEnd(GL_REV_R),
      ],
    },
    {
      h: 11.81,
      cells: [
        gap(GL_L),
        word(GL_REV[0], "2.", { a: "c" }),
        word(GL_REV[1], "01.09.2025", { a: "c" }),
        { w: GL_REV[2], t: "New Glass Articals Added", a: "c", f: "times", pt: 12, y: 0.62 },
        { w: GL_REV[3], t: "New ink kitchen added, Old ink kitchen merged with slitting room", a: "c", f: "times", pt: 12, y: 0.62, lh: 4.86 },
        ...gapEnd(GL_REV_R),
      ],
    },
    { h: 7.58, cells: [gap(GL_L), word(GL_REV[0], "3.", { a: "c" }), { w: GL_REV[1], t: "" }, { w: GL_REV[2], t: "" }, { w: GL_REV[3], t: "" }, ...gapEnd(GL_REV_R)] },
    // PAGE 2
    ...glHead(2),
    gapRow(13.88, GL_WIDTH),
    {
      h: 8.43,
      cells: [
        gap(GL_MON_L),
        word(GL_MON[0], "Month & Year", { b: true, x: 1.91 }),
        boxCell(sum(GL_MON.slice(1)), "monthYear", { x: 1.91 }),
        { w: GL_NOTES_W, t: GL_NOTES_TEXT, bs: [GL_BOLD_FROM, GL_BOLD_FROM + "CA / Incident record".length], x: 1.9, y: 0.4, lh: 7.1, rs: 18 },
        gap(GL_MON_R),
      ],
    },
    {
      h: 8.38,
      head: true,
      cells: [gap(GL_MON_L), word(GL_MON[0], "Monitoring Weeks", { b: true, x: 1.91 }), ...WEEK_WORDS.map((t, i) => word(GL_MON[i + 1], t, { b: true, a: "c" })), { w: GL_NOTES_W, t: "", skip: true }, gap(GL_MON_R)],
    },
    ...GL_MON_H.map(
      (h, ln): PaperRow => ({
        h,
        cells: [
          gap(GL_MON_L),
          gridCell(GL_MON[0], "parameter", ln, { x: 1.91, ...(ln === 0 || ln >= 13 ? { b: true as const } : {}) }),
          ...WEEK_KEYS.map((col, i) => gridCell(GL_MON[i + 1], col, ln, { a: "c" })),
          { w: GL_NOTES_W, t: "", skip: true },
          gap(GL_MON_R),
        ],
      })
    ),
  ],
  foot: [],
};

// =====================================================================================================================
// F/MNT/10 LIST OF WOODEN ARTICLES & WEEKLY WOODEN ARTICLE MONITORING RECORD. The Word original's three pages (A4 landscape,
// 1:1), Rev 02 of 15.12.2024: the company, the underlined title and "Format No.: F/MNT/10 | Rev No: 02 | Date: 15.12.2024 |
// Page No.: 1 Of 3" on every page; page 1 the list of wooden articles by area with its Total row and the revision history
// (its line 3 on page 2, as the paper breaks it); page 2 Month & Year, Monitoring Weeks, Date of monitoring and the twelve
// areas, the three instructions at the right; page 3 BREAKAGE, Nos. of Discarded Wooden Pallets (Store & Production),
// CHECKED BY and VARIFIED BY (no colour, §282).
// =====================================================================================================================

/** The page's width: 4.44 to 284.23 mm; the head box 4.95 to 284.23. */
const WD_WIDTH = 279.79;
const WD_HL = 0.51;
const WD_HW = WD_WIDTH - WD_HL;
const WD_NO = [79.22, 69.99, 57.54, WD_HW - 79.22 - 69.99 - 57.54];
/** The list: 4.44 to 282.66 mm. */
const WD_LIST = [78.12, 23.84, 25.4, 30.15, 20.66, 69.65, 30.4];
const WD_LIST_R = WD_WIDTH - sum(WD_LIST);
const WD_LIST_H = [7.03, 6.99, 7.03, 8.08, 7.03, 6.99, 7.02, 7.0, 6.98, 7.03, 6.98, 7.03];
/** The revision history: 4.44 to 283.46 mm. */
const WD_REV = [20.07, 33.32, 121.69, 103.94];
const WD_REV_R = WD_WIDTH - sum(WD_REV);
/** The monitoring table: 4.44 to 215.89, the instructions to 283.93 mm. */
const WD_MON = [93.58, 23.54, 23.58, 23.58, 23.58, 23.59];
const WD_NOTES_W = 68.34;
const WD_MON_R = WD_WIDTH - sum(WD_MON) - WD_NOTES_W;
const WD_MON_H = [8.43, 7.28, 7.28, 7.28, 7.28, 7.29, 7.28, 7.28, 7.29, 8.34, 7.28, 8.35, 8.38];
const WD_END_H = [8.34, 8.34, 8.35, 8.34];

function wdHead(page: number): PaperRow[] {
  const rows: PaperRow[] = [
    { h: 11.69, cells: [gap(WD_HL), word(WD_HW, COMPANY, { b: true, a: "c", pt: 16, edges: "ltr" })] },
    { h: 11.52, cells: [gap(WD_HL), word(WD_HW, "LIST OF WOODEN ARTICLES & WEEKLY WOODEN ARTICLE MONITORING RECORD", { b: true, u: true, a: "c", pt: 12, edges: "ltr" })] },
    {
      h: 7.28,
      cells: [
        gap(WD_HL),
        word(WD_NO[0], "Format No.:  F/MNT/10", { x: 1.4, heavy: "b", edges: "ltr" }),
        word(WD_NO[1], "Rev No: 02", { a: "c", heavy: "b", edges: "ltr" }),
        word(WD_NO[2], "Date: 15.12.2024", { a: "c", heavy: "b", edges: "ltr" }),
        word(WD_NO[3], `Page No.: ${page} Of 3`, { a: "c", heavy: "b", edges: "ltr" }),
      ],
    },
    gapRow(4.32, WD_WIDTH),
  ];
  if (page === 1) return rows;
  return rows.map((r, i) => ({ ...samePlaces(r, i, i === 2 ? [4] : []), ...(i === 0 ? { pb: true as const } : {}) }));
}

const WD_NOTES_TEXT = bulleted(WOOD_NOTES);
const timesNo = (w: number, n: number | string, more: Partial<PaperCell> = {}): PaperCell => listNumber(w, n, { f: "times", pt: 12, ...more });

const WOODEN_PAPER: PaperTable = {
  page: "landscape",
  left: 4.44,
  top: 6.6,
  font: "calibri",
  pt: 11,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  flows: true,
  head: wdHead(1),
  body: [
    {
      h: 6.98,
      cells: [
        word(WD_LIST[0], "Nos. & Type of articles", { b: true, x: 1.91, edges: "ltr" }),
        ...["Cupboard", "Bench", "Inspection\nTable", "Working\nDesk", "Wooden sheets", "Total Qty"].map((t, i) => word(WD_LIST[i + 1], t, { b: true, a: "c", pt: 12, rs: 2, lh: 7.75 })),
        gap(WD_LIST_R),
      ],
    },
    { h: 6.99, cells: [word(WD_LIST[0], "Location / Area of Wooden Articles", { b: true, x: 1.91, edges: "lrb" }), ...WD_LIST.slice(1).map((w): PaperCell => ({ w, t: "", skip: true })), gap(WD_LIST_R)] },
    ...WOODEN_ARTICLES.map(([areaName, counts, total], i): PaperRow => ({
      h: WD_LIST_H[i],
      cells: [word(WD_LIST[0], areaName, { x: 1.91 }), listNumber(WD_LIST[1], counts[0], { pt: 12 }), ...counts.slice(1).map((n, k) => timesNo(WD_LIST[k + 2], n)), timesNo(WD_LIST[6], total, { b: true, pt: 16 }), gap(WD_LIST_R)],
    })),
    {
      h: 6.99,
      cells: [
        word(WD_LIST[0], "Total", { x: 1.91 }),
        listNumber(WD_LIST[1], 170, { pt: 12 }),
        listNumber(WD_LIST[2], 23, { pt: 14 }),
        timesNo(WD_LIST[3], 21),
        timesNo(WD_LIST[4], 26),
        timesNo(WD_LIST[5], 320),
        listNumber(WD_LIST[6], 560, { b: true, pt: 16 }),
        gap(WD_LIST_R),
      ],
    },
    gapRow(5.03, WD_WIDTH),
    { h: 7.51, cells: [word(sum(WD_REV), "Revision history for update in addition / removal of Wooden articles", { b: true, x: 1.91 }), gap(WD_REV_R)] },
    { h: 7.62, cells: [...["Rev. no.", "Effective date", "Details of change", "Reason for change"].map((t, i) => word(WD_REV[i], t, { a: "c" })), gap(WD_REV_R)] },
    {
      h: 14.18,
      cells: [
        word(WD_REV[0], "1.", { a: "c" }),
        word(WD_REV[1], "15.12.2024", { a: "c" }),
        word(WD_REV[2], "New Wooden articles added", { x: 1.91 }),
        word(WD_REV[3], "New warehouse And Pouching Department and Some Of Area\nAdded", { a: "c", lh: 7.1 }),
        gap(WD_REV_R),
      ],
    },
    { h: 7.58, cells: [word(WD_REV[0], "2.", { a: "c" }), { w: WD_REV[1], t: "" }, { w: WD_REV[2], t: "" }, { w: WD_REV[3], t: "" }, gap(WD_REV_R)] },
    // PAGE 2: the revision history's line 3, then the month's sheet.
    ...wdHead(2),
    { h: 7.58, cells: [word(WD_REV[0], "3.", { a: "c" }), { w: WD_REV[1], t: "" }, { w: WD_REV[2], t: "" }, { w: WD_REV[3], t: "" }, gap(WD_REV_R)] },
    {
      h: 8.42,
      cells: [
        word(WD_MON[0], "Month & Year", { b: true, x: 1.91 }),
        boxCell(sum(WD_MON.slice(1)), "monthYear", { x: 1.91 }),
        { w: WD_NOTES_W, t: WD_NOTES_TEXT, x: 1.91, y: 0.4, lh: 7.1, rs: 15 },
        ...gapEnd(WD_MON_R),
      ],
    },
    {
      h: 8.39,
      head: true,
      cells: [word(WD_MON[0], "Monitoring Weeks", { b: true, x: 1.91 }), ...WEEK_WORDS.map((t, i) => word(WD_MON[i + 1], t, { b: true, a: "c" })), { w: WD_NOTES_W, t: "", skip: true }, ...gapEnd(WD_MON_R)],
    },
    ...WD_MON_H.map(
      (h, ln): PaperRow => ({
        h,
        cells: [
          gridCell(WD_MON[0], "parameter", ln, { x: 1.91, ...(ln === 0 ? { b: true as const } : {}) }),
          ...WEEK_KEYS.map((col, i) => gridCell(WD_MON[i + 1], col, ln, { a: "c" })),
          { w: WD_NOTES_W, t: "", skip: true },
          ...gapEnd(WD_MON_R),
        ],
      })
    ),
    // PAGE 3: the sheet's last four lines.
    ...wdHead(3),
    ...WD_END_H.map(
      (h, k): PaperRow => ({
        h,
        cells: [
          gridCell(WD_MON[0], "parameter", 13 + k, { b: true, x: 1.91 }),
          ...WEEK_KEYS.map((col, i) => gridCell(WD_MON[i + 1], col, 13 + k, { a: "c" })),
          k === 0 ? { w: WD_NOTES_W, t: "", rs: 4 } : { w: WD_NOTES_W, t: "", skip: true },
          ...gapEnd(WD_MON_R),
        ],
      })
    ),
  ],
  foot: [],
};

export const MNT_PAPERS_351: Record<string, PaperTable> = {
  "mnt-equipment-list": EQUIPMENT_LIST_PAPER,
  "mnt-pm-record": PM_RECORD_PAPER,
  "mnt-yearly-pm-schedule": YEARLY_PM_PAPER,
  "mnt-daily-health": DAILY_HEALTH_PAPER,
  "mnt-breakdown-memo": BREAKDOWN_MEMO_PAPER,
  "mnt-breakdown-clearance": BREAKDOWN_CLEARANCE_PAPER,
  "mnt-breakdown-record": BREAKDOWN_RECORD_PAPER,
  "mnt-temporary-engineering": TEMPORARY_ENGINEERING_PAPER,
  "mnt-new-equipment": NEW_EQUIPMENT_PAPER,
  "mnt-glass-breakage": GLASS_PAPER,
  "mnt-wooden-articles": WOODEN_PAPER,
};
