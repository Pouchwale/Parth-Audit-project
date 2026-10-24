import type { Cell, ExportBlock, PaperCellSpec, SheetCell, SheetStyle } from "./documentExport";

// A DOCUMENT'S DOWNLOAD DRAWN AS ITS OWN EXCEL ORIGINAL (REQUIREMENTS §118; the owner, 17-Oct-2026: "whenever user download
// the Excel file or Word file, it should be real, which I have supplied to you").
//
// A register or a log sheet is read from the page as blocks (a title, a band, boxes, a grid). For a document whose
// original was supplied as a workbook, those blocks are re-laid on the original's own grid: its merged cells, its column
// widths (Excel characters) and row heights (points), its fonts and its rules, read off the supplied .xls
// (source-documents/F-HR-15_Daily Cleaning record_01_15.12.2024.xls). The words and the bound values come from the blocks,
// so a file edited in Excel reads back exactly as before (the map is written from the same cells, utils/documentExport.ts).
//
// Where a document is not here, its download is the generic one: the blocks as a bordered grid.

const st = (size: number, bold: boolean, align: SheetStyle["align"], borders: SheetStyle["borders"], underline = false, valign: SheetStyle["valign"] = "center"): SheetStyle => ({
  size,
  bold,
  align,
  valign,
  wrap: true,
  borders,
  ...(underline ? { underline: true } : {}),
});

const text = (c: Cell | undefined): string => (c?.text ?? "").trim();

type Grid = Extract<ExportBlock, { kind: "table" }>;

const tablesOf = (blocks: ExportBlock[]): Grid[] => blocks.filter((b): b is Grid => b.kind === "table");
const textsOf = (blocks: ExportBlock[]): Extract<ExportBlock, { kind: "text" }>[] => blocks.filter((b): b is Extract<ExportBlock, { kind: "text" }> => b.kind === "text");

/** The value after a label in the band the page draws (cells alternate label, value). */
function bandValue(blocks: ExportBlock[], label: RegExp): string {
  for (const t of tablesOf(blocks)) {
    if (!t.band) continue;
    const row = t.rows[0] ?? [];
    for (let i = 0; i + 1 < row.length; i += 2) if (label.test(text(row[i]))) return text(row[i + 1]);
  }
  return "";
}

/** F/HR/15's printed "Rev Date" is 15.12.2024, where the page reads 15-12-24 (15-Dec-2024 before §124). */
const dotted = (words: string): string => {
  const numeric = /^(\d{2})-(\d{2})-(\d{2})$/.exec(words);
  if (numeric) return `${numeric[1]}.${numeric[2]}.20${numeric[3]}`;
  const m = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(words);
  if (!m) return words;
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[2].toLowerCase()) + 1;
  return month ? `${m[1]}.${String(month).padStart(2, "0")}.${m[3]}` : words;
};

/**
 * F/HR/15 — the Daily Cleaning Record on the supplied workbook's grid: 34 columns (the number, the area, what is cleaned,
 * the 31 days), the title row merged across, "Month & Year", the title and the format's number in three merged cells, the
 * NOTE merged across, the numbered heading, one row to an area, and the two foot rows ("Cleaning done by", "Cleaning
 * verified by") merged over the first three columns. Medium rules round the sheet, thin rules between the cells.
 */
function dailyCleaningSheet(blocks: ExportBlock[]): ExportBlock[] | null {
  const grid = tablesOf(blocks).find((t) => !t.band && Math.max(...t.rows.map((r) => r.length)) >= 30);
  if (!grid || grid.rows.length < 3) return null;
  const words = textsOf(blocks);
  const company = words[0]?.text ?? "";
  const title = words[1]?.text ?? "DAILY CLEANING RECORD";
  const note = words.find((w) => /^NOTE\b/i.test(w.text))?.text ?? "";
  const monthBox = blocks.find((b): b is Extract<ExportBlock, { kind: "fields" }> => b.kind === "fields" && b.pairs.some(([label]) => /^Month/i.test(label)));
  const monthCell: Cell = monthBox?.pairs.find(([label]) => /^Month/i.test(label))?.[1] ?? { text: "" };
  const formatNo = bandValue(blocks, /^Format No/i);
  const revNo = bandValue(blocks, /^Rev No/i);
  const revDate = dotted(bandValue(blocks, /^Rev Date/i));

  const days = 31;
  const columns = 3 + days;
  const last = columns - 1;
  const body = grid.rows.slice(1).filter((r) => !/^Cleaning (done|verified) by/i.test(text(r[1])) && !/^Cleaning (done|verified) by/i.test(text(r[0])));
  const foot = grid.rows.slice(1).filter((r) => /^Cleaning (done|verified) by/i.test(text(r[1])) || /^Cleaning (done|verified) by/i.test(text(r[0])));
  const lastRow = 3 + body.length + foot.length;
  const cells: SheetCell[] = [];
  const heights: (number | undefined)[] = [39, 42, 42, 45];

  // The frame: medium round the sheet, thin between the cells.
  const edge = (row: number, col: number, top = 1, bottom = 1): SheetStyle["borders"] => [col === 0 ? 2 : 1, col === last ? 2 : 1, row === 0 ? 2 : top, row === lastRow ? 2 : bottom];
  const put = (row: number, col: number, cell: Cell, style: SheetStyle, rowSpan = 1, colSpan = 1) => cells.push({ ...cell, row, col, rowSpan, colSpan, style });

  put(0, 0, { text: company }, st(16, true, "center", [2, 2, 2, 2], true), 1, columns);
  // Row 2: Month & Year | the title | the format's number.
  const prefix = "Month & Year : - ";
  put(
    1,
    0,
    { ...monthCell, text: `${prefix}${monthCell.text}`, parts: [{ text: prefix }, ...(monthCell.parts ?? (monthCell.text ? [{ text: monthCell.text }] : []))], bind: undefined },
    st(16, true, "left", [2, 0, 2, 2]),
    1,
    5
  );
  put(1, 5, { text: title }, st(16, true, "center", [2, 0, 2, 2], true), 1, 22);
  put(1, 27, { text: `${formatNo} (${revNo}/${revDate})` }, st(16, true, "center", [2, 2, 2, 2]), 1, 7);
  put(2, 0, { text: note }, st(16, true, "left", [2, 2, 2, 2]), 1, columns);
  // The numbered heading: "#" over the number, the two area columns unnamed, 1 to 31.
  const heading = grid.rows[0];
  put(3, 0, { text: text(heading[0]) || "#" }, st(14, true, "center", [2, 1, 0, 1]));
  put(3, 1, { text: "" }, st(14, true, "center", [0, 1, 0, 1]));
  put(3, 2, { text: "" }, st(14, true, "center", [0, 1, 0, 1]));
  for (let d = 0; d < days; d++) put(3, 3 + d, { text: text(heading[3 + d]) || String(d + 1) }, st(14, true, "center", [1, 1, 0, 1]));
  body.forEach((r, i) => {
    const row = 4 + i;
    heights.push(39);
    put(row, 0, r[0] ?? { text: "" }, st(14, true, "center", edge(row, 0, 1, 0)));
    put(row, 1, r[1] ?? { text: "" }, st(14, true, "left", edge(row, 1, 1, 0)));
    put(row, 2, r[2] ?? { text: "" }, st(14, true, "left", edge(row, 2, 1, 0)));
    for (let d = 0; d < days; d++) put(row, 3 + d, r[3 + d] ?? { text: "" }, st(11, false, "center", edge(row, 3 + d)));
  });
  foot.forEach((r, i) => {
    const row = 4 + body.length + i;
    heights.push(45);
    const label = text(r[1]) || text(r[0]);
    put(row, 0, { text: label }, st(14, true, "right", [2, 0, 1, 2]), 1, 3);
    for (let d = 0; d < days; d++) put(row, 3 + d, r[3 + d] ?? { text: "" }, st(11, false, "center", edge(row, 3 + d)));
  });
  return [{ kind: "sheet", name: formatNo.replace(/\//g, "-") || "Cleaning", widths: [5, 42.89, 40.66, ...Array(days).fill(5.66)], heights, rowCount: lastRow + 1, cells }];
}

/**
 * F/HR/16 - the Monthly Cleaning Record on the supplied workbook's grid: 16 columns (the number, the area, what is cleaned,
 * "Cleaning by", the twelve months), the title row merged across, the year's line and the format's number, the NOTE, the
 * two heading rows (the months, then "Date" over the area columns), one row to an area, and "Cleaning verified by" merged
 * over the first four columns. DCRS holds what is cleaned and "Cleaning by" as the two lines of one cell; the workbook has
 * them in two cells side by side, and the file is laid as the workbook is.
 */
function monthlyCleaningSheet(blocks: ExportBlock[]): ExportBlock[] | null {
  const grid = tablesOf(blocks).find((t) => !t.band && Math.max(...t.rows.map((r) => r.length)) >= 14);
  if (!grid || grid.rows.length < 4) return null;
  const words = textsOf(blocks);
  const company = words[0]?.text ?? "";
  const note = words.find((w) => /^NOTE\b/i.test(w.text))?.text ?? "";
  const yearBox = blocks.find((b): b is Extract<ExportBlock, { kind: "fields" }> => b.kind === "fields" && b.pairs.some(([label]) => /^YEAR/i.test(label)));
  const yearCell: Cell = yearBox?.pairs.find(([label]) => /^YEAR/i.test(label))?.[1] ?? { text: "" };
  const formatNo = bandValue(blocks, /^Format No/i);
  const revNo = bandValue(blocks, /^Rev No/i);
  const revDate = dotted(bandValue(blocks, /^Rev Date/i));
  const months = 12;
  const columns = 4 + months;
  const last = columns - 1;
  const verifiedBy = (r: Cell[]) => /^Cleaning verified by/i.test(text(r[1])) || /^Cleaning verified by/i.test(text(r[0])) || /^Cleaning verified by/i.test(text(r[2]));
  const dateRow = grid.rows.slice(1, 3).find((r) => /^Date\b/i.test(text(r[1])) || /^Date\b/i.test(text(r[2])));
  const body = grid.rows.slice(1).filter((r) => r !== dateRow && !verifiedBy(r));
  const foot = grid.rows.slice(1).find(verifiedBy);
  const lastRow = 4 + body.length + (foot ? 1 : 0);
  const cells: SheetCell[] = [];
  const heights: (number | undefined)[] = [29, 39.75, 39.75, 32, 33.75];
  const edge = (row: number, col: number, top = 1, bottom = 1): SheetStyle["borders"] => [col === 0 ? 2 : 1, col === last ? 2 : 1, row === 0 ? 2 : top, row === lastRow ? 2 : bottom];
  const put = (row: number, col: number, cell: Cell, style: SheetStyle, rowSpan = 1, colSpan = 1) => cells.push({ ...cell, row, col, rowSpan, colSpan, style });

  put(0, 0, { text: company }, st(20, true, "center", [2, 2, 2, 0], true), 1, columns);
  const prefix = "MONTHLY CLEANING RECORD ( YEAR : ";
  put(
    1,
    0,
    { ...yearCell, text: `${prefix}${yearCell.text} ) `, parts: [{ text: prefix }, ...(yearCell.parts ?? (yearCell.text ? [{ text: yearCell.text }] : [])), { text: " ) " }], bind: undefined },
    st(16, true, "center", [2, 0, 2, 2], true),
    1,
    13
  );
  put(1, 13, { text: `${formatNo} (${revNo}/${revDate})` }, st(16, true, "center", [2, 2, 2, 2]), 1, 3);
  put(2, 0, { text: note }, st(16, true, "left", [2, 2, 0, 1]), 1, columns);
  put(3, 0, { text: "#" }, st(12, true, "center", [2, 1, 1, 0]), 2, 1);
  put(3, 1, { text: "Area" }, st(12, true, "center", [1, 1, 1, 1]), 1, 3);
  const heading = grid.rows[0];
  for (let m = 0; m < months; m++) put(3, 4 + m, { text: text(heading[3 + m]) }, st(12, true, "center", [1, m === months - 1 ? 2 : 1, 1, 1]));
  put(4, 1, { text: "Date " }, st(12, true, "left", [1, 0, 1, 1]), 1, 3);
  for (let m = 0; m < months; m++) put(4, 4 + m, dateRow?.[3 + m] ?? { text: "" }, st(12, true, "center", [1, m === months - 1 ? 2 : 1, 1, 1]));
  body.forEach((r, i) => {
    const row = 5 + i;
    heights.push(49);
    const both = text(r[2]);
    const method = both.replace(/\s*Cleaning by\s*$/i, "").trim();
    put(row, 0, r[0] ?? { text: "" }, st(12, true, "center", edge(row, 0, 1, 0)));
    put(row, 1, r[1] ?? { text: "" }, st(14, true, "left", edge(row, 1, 1, 0)));
    put(row, 2, { text: method }, st(11, true, "left", edge(row, 2, 1, 0)));
    put(row, 3, { text: "Cleaning by" }, st(12, true, "left", edge(row, 3)));
    for (let m = 0; m < months; m++) put(row, 4 + m, r[3 + m] ?? { text: "" }, st(12, true, "center", edge(row, 4 + m)));
  });
  if (foot) {
    heights.push(29);
    put(lastRow, 0, { text: "Cleaning verified by" }, st(12, true, "right", [2, 0, 1, 2]), 1, 4);
    for (let m = 0; m < months; m++) put(lastRow, 4 + m, foot[3 + m] ?? { text: "" }, st(12, true, "center", edge(lastRow, 4 + m)));
  }
  return [{ kind: "sheet", name: formatNo.replace(/\//g, "-") || "Cleaning", widths: [5, 34.83, 13.66, 15.83, ...Array(months).fill(12)], heights, rowCount: lastRow + 1, cells }];
}

/** The blocks of a document redrawn as its supplied workbook, or null where there is no such original here (the generic download stands). */
export function paperSheetBlocks(documentId: string, blocks: ExportBlock[]): ExportBlock[] | null {
  try {
    if (documentId === "hr-daily-cleaning") return dailyCleaningSheet(blocks);
    if (documentId === "hr-monthly-cleaning") return monthlyCleaningSheet(blocks);
  } catch {
    /* a page that does not read as the original's is downloaded as the generic grid */
  }
  return null;
}

// ---------------------------------------------------------------------------
// F/HR/18 - the Fortnightly Fly Catcher Inspection & Cleaning Record, as the company's Word page (the owner's .doc and its
// two-page PDF): A4 portrait, the framed band (the company's name 20 pt, the title 14 pt, four cells 12 pt), the Month &
// Year box, the legend in four columns, the heading box, then two boxed lines to a unit with the unit's number merged down.
// Measured in points off the PDF (REQUIREMENTS §118).

/** The page a document's Word download is set up on, where the original names it (else the grid's width decides). */
export function paperPageOf(documentId: string): "portrait" | "landscape" | undefined {
  return documentId === "fly-catcher" ? "portrait" : undefined;
}

/** The page's margins in points where the paper's are not the default (F/HR/18's page: 18 pt above, 28.7 pt at the left). */
export function paperMarginsOf(documentId: string): { top: number; right: number; bottom: number; left: number } | undefined {
  return documentId === "fly-catcher" ? { top: 18, right: 27.4, bottom: 18, left: 28.7 } : undefined;
}

const E = (l: number, r: number, t: number, b: number): PaperCellSpec["borders"] => [l, r, t, b];
const FRAME = 12; // a point and a half
const HAIR = 4; // half a point

const pc = (cell: Cell | undefined, size: number, bold: boolean, align: PaperCellSpec["align"], valign: PaperCellSpec["valign"], borders: PaperCellSpec["borders"], more: Partial<PaperCellSpec> = {}): PaperCellSpec => ({
  ...(cell ?? { text: "" }),
  size,
  bold,
  align,
  valign,
  borders,
  ...more,
});

function flyCatcherWord(blocks: ExportBlock[]): ExportBlock[] | null {
  type Page = { company: string; title: string; band: Cell[]; month?: Cell; legend?: Cell[][]; grid?: Cell[][] };
  const pages: Page[] = [];
  let lastTexts: string[] = [];
  // The box's label and its value are two blocks (the box is a flex line, so each of its two spans is a block of its own).
  let monthValueNext = false;
  for (const b of blocks) {
    if (b.kind === "text") {
      if (b.title) lastTexts = [...lastTexts, b.text].slice(-2);
      else if (monthValueNext && pages.length) {
        pages[pages.length - 1].month = { text: b.text, parts: b.parts };
        monthValueNext = false;
      } else if (/^Month\s*&\s*Year/i.test(b.text) && pages.length) {
        const value = b.text.replace(/^Month\s*&\s*Year\s*/i, "").trim();
        if (value) pages[pages.length - 1].month = { text: value, parts: b.parts?.filter((p) => p.text.trim() !== "Month & Year") };
        else monthValueNext = true;
      }
    } else if (b.kind === "table" && b.band) {
      pages.push({ company: lastTexts[0] ?? "", title: lastTexts[1] ?? "", band: b.rows[0] ?? [] });
    } else if (b.kind === "table" && pages.length) {
      const page = pages[pages.length - 1];
      const width = Math.max(...b.rows.map((r) => r.length));
      if (width === 4 && !b.headerRows) page.legend = b.rows;
      else if (width === 7 && b.headerRows) page.grid = b.rows;
    }
  }
  if (pages.length === 0 || pages.some((p) => !p.grid || !p.legend)) return null;
  const out: ExportBlock[] = [];
  pages.forEach((page, pi) => {
    // The band: the company's name, the title, then the four cells (label and value to a cell, as the paper writes them).
    const cells4: Cell[] = [];
    for (let i = 0; i + 1 < page.band.length; i += 2) cells4.push({ text: `${text(page.band[i])} ${text(page.band[i + 1])}`.trim() });
    const w4 = [160, 121, 126, 131];
    out.push({
      kind: "paper",
      widths: w4,
      pageBreakBefore: pi > 0,
      spaceAfter: 12.5,
      rows: [
        { height: 34.2, cells: [pc({ text: page.company }, 40, true, "center", "center", E(FRAME, FRAME, FRAME, HAIR), { colSpan: 4 })] },
        { height: 34.3, cells: [pc({ text: page.title }, 28, true, "center", "center", E(FRAME, FRAME, 0, HAIR), { colSpan: 4 })] },
        {
          height: 20.8,
          cells: cells4.map((c, i) => pc(c, 24, false, "center", "center", E(i === 0 ? FRAME : HAIR, i === 3 ? FRAME : 0, 0, FRAME))),
        },
      ],
    });
    // Month & Year, then the legend of the units - one box.
    const month: Cell = page.month ?? { text: "" };
    out.push({
      kind: "paper",
      widths: [532.1],
      indent: 9.6,
      spaceAfter: 0,
      rows: [{ height: 17.2, cells: [pc({ ...month, text: `Month & Year  ${month.text}`.trimEnd(), parts: month.parts ? [{ text: "Month & Year  " }, ...month.parts] : undefined }, 22, true, "left", "center", E(HAIR, HAIR, HAIR, HAIR))] }],
    });
    out.push({
      kind: "paper",
      widths: [78, 188, 133.1, 133],
      indent: 9.6,
      spaceAfter: 14.3,
      rows: (page.legend ?? []).map((r) => ({ height: 16.7, cells: [0, 1, 2, 3].map((i) => pc(r[i], 20, false, "left", "center", E(HAIR, HAIR, HAIR, HAIR))) })),
    });
    // The heading box, then the units: PC ID NO. merged down each unit's lines.
    const grid = page.grid ?? [];
    const widths = [63.7, 71.9, 73.6, 87.9, 88.9, 75.9, 73.7];
    out.push({
      kind: "paper",
      widths,
      indent: 7.9,
      spaceAfter: pi === 0 && grid.length > 13 ? 26.6 : 12.8,
      rows: [{ height: 41.1, cells: grid[0].map((c) => pc(c, 20, true, "left", "top", E(HAIR, HAIR, HAIR, HAIR))) }],
    });
    const units = grid.slice(1).filter((r) => r.some((c) => text(c) !== "") || true);
    out.push({
      kind: "paper",
      widths,
      indent: 7.9,
      spaceAfter: 1,
      rows: units.map((r) => ({
        height: 28.9,
        cells: r.slice(0, 7).map((c, i) => {
          const starts = i === 0 && text(c) !== "";
          const continues = i === 0 && text(c) === "";
          return pc(c, 20, i === 0, "left", "top", E(HAIR, HAIR, HAIR, HAIR), starts ? { vMerge: "restart" as const } : continues ? { vMerge: "continue" as const } : {});
        }),
      })),
    });
  });
  return out;
}

/** The blocks of a document redrawn as its Word original's page, or null where there is no such original here (the generic download stands). */
export function paperWordBlocks(documentId: string, blocks: ExportBlock[]): ExportBlock[] | null {
  try {
    if (documentId === "fly-catcher") return flyCatcherWord(blocks);
  } catch {
    /* a page that does not read as the original's is downloaded as the generic document */
  }
  return null;
}
