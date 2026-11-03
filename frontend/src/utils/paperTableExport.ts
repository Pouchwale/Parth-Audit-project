import type { Cell, ExportBlock, PaperCellSpec, SheetCell } from "./documentExport";
import { lineRow, paperTableFor, paperTablePrint, type PaperCell, type PaperRow, type PaperTable } from "../data/seed/qcPaperTables";

// A PAPER DRAWN AS ITS OWN TABLE, DOWNLOADED AS IT IS DRAWN (the owner, 30-10-26, F/QC/17 with its printout beside its
// Excel download: "when i download the excel it is all ruin, it should be in the perfect format and way just like the
// document. and also give me the option to download word also besides download excel").
//
// The page draws the paper from data/seed/qcPaperTables.ts, row by row in millimetres, as three tables on one set of
// columns (components/records/PaperTableSheet.tsx). Read from the page, those tables are plain grids, and filling the
// owner's workbook with them could fall through to a generic grid with no merged cell, rule or face. So for a document
// here the download is drawn from the same rows the page and the print are: every cell at its columns and its rows, its
// face, size, weight, alignment and underline, the paper's thin and heavy rules, at the size it prints on A4
// (paperTablePrint). The words and the bound values are the page's - each cell of the definition takes the cell the page
// shows at the same row and column - so a file edited in Excel or Word reads back as every download does.

/** The documents downloaded so - as an Excel workbook or a Word document, the person's choice. */
// F/QC/16 too (the owner, 31-10-26: "just add the download in word option in qc 16 document").
export const PAPER_TABLE_EXPORTS: ReadonlySet<string> = new Set(["qc-ruler-verification", "qc-ruler-verification-300", "qc-obsolete-artwork"]);

/**
 * Documents whose EXCEL download is drawn as the page draws its paper, their Word (where they have one) as before: F/QC/16
 * (the owner, 31-10-26, with its Excel download beside the page: "this is not the actual format ... the second photo shows
 * the exact format").
 */
export const PAPER_TABLE_EXCEL: ReadonlySet<string> = new Set(["qc-obsolete-artwork"]);

/** The page's margin around the paper in the Word file (pt): the print's 12 mm, a hair less so the table never touches it. */
const WORD_MARGIN = 33;

const FACE: Record<PaperTable["font"], string> = { calibri: "Calibri", arial: "Arial", times: "Times New Roman", gothic: "Century Gothic" };

/** The column edges every row is cut from (as the page's): each cell's edges, merged where a hair apart. */
function columnEdges(rows: PaperRow[]): number[] {
  const xs = new Set<number>([0]);
  for (const row of rows) {
    let x = 0;
    for (const c of row.cells) {
      x = Math.round((x + c.w) * 100) / 100;
      xs.add(x);
    }
  }
  const out: number[] = [];
  for (const x of Array.from(xs).sort((a, b) => a - b)) if (out.length === 0 || x - out[out.length - 1] > 0.35) out.push(x);
  return out;
}

const nearest = (edges: number[], x: number): number => {
  let best = 0;
  for (let i = 1; i < edges.length; i++) if (Math.abs(edges[i] - x) < Math.abs(edges[best] - x)) best = i;
  return best;
};

/** One cell of the paper, placed: its row and columns, the rows it runs down, how it is set and ruled (0 none, 1 thin, 2 heavy). */
interface Placed {
  def: PaperCell;
  shown: Cell;
  row: number;
  col: number;
  colSpan: number;
  rowSpan: number;
  size: number;
  bold: boolean;
  underline: boolean;
  /** The cell's shading, where the paper shades it (F/QC/16's number box). */
  fill?: string;
  align: "left" | "center" | "right";
  font: string;
  borders: [number, number, number, number];
}

/**
 * The paper's rows with what the page shows in each cell, or null where the page does not read as this paper (the
 * generic download stands then). `blocks` are the page's, read as every download reads it.
 */
function placed(form: PaperTable, blocks: ExportBlock[]): { rows: PaperRow[]; edges: number[]; cells: Placed[] } | null {
  // A paper ruled cell by cell, or of several blocks of lines side by side, keeps the generic download.
  if (form.rules || (form.lines?.blocks ?? 1) > 1) return null;
  const grids = blocks.filter((b): b is Extract<ExportBlock, { kind: "table" }> => b.kind === "table" && !b.band);
  // A register (form.lines, F/QC/16): the body's table on the page holds its rows, then the record's lines - the
  // paper's blank ruled lines beyond them are not on the page, and are not in the file.
  const parts = [form.head, form.body, form.foot].map((rows, i) => ({ rows, lines: i === 1 && !!form.lines })).filter((p) => p.rows.length > 0 || p.lines);
  if (grids.length < parts.length) return null;
  const shownRows: Cell[][] = [];
  const rows: PaperRow[] = [];
  for (let i = 0; i < parts.length; i++) {
    const { rows: own, lines } = parts[i];
    const held = grids[i].rows.length - own.length;
    if (lines ? held < 0 : held !== 0) return null;
    shownRows.push(...grids[i].rows);
    rows.push(...own);
    for (let ln = 0; ln < held; ln++) rows.push({ h: form.lines!.h, cells: lineRow(form, ln), line: ln });
  }
  const edges = columnEdges([...rows, ...(form.lines ? [{ h: 0, cells: lineRow(form, 0) }] : [])]);
  const lastCol = edges.length - 2;
  const lastRow = rows.length - 1;
  const heavy = form.frame === "heavy";
  const cells: Placed[] = [];
  rows.forEach((row, ri) => {
    let x = 0;
    for (const c of row.cells) {
      const from = nearest(edges, x);
      x = Math.round((x + c.w) * 100) / 100;
      const to = nearest(edges, x);
      if (c.skip) continue;
      const rowSpan = Math.max(1, c.rs ?? 1);
      const endRow = ri + rowSpan - 1;
      const right = c.open?.includes("r") ? 0 : c.heavy?.includes("r") || (heavy && to - 1 === lastCol) ? 2 : 1;
      const bottom = c.open?.includes("b") ? 0 : c.heavy?.includes("b") || (heavy && endRow === lastRow) ? 2 : 1;
      cells.push({
        def: c,
        shown: shownRows[ri]?.[from] ?? { text: "" },
        row: ri,
        col: from,
        colSpan: Math.max(1, to - from),
        rowSpan,
        size: c.pt ?? form.pt,
        bold: !!c.b,
        underline: !!c.u,
        ...(c.bg ? { fill: c.bg } : {}),
        align: c.a === "c" ? "center" : c.a === "r" ? "right" : "left",
        font: FACE[c.f ?? form.font],
        borders: [from === 0 ? (heavy ? 2 : 1) : 0, right, ri === 0 ? (heavy ? 2 : 1) : 0, bottom],
      });
    }
  });
  return { rows, edges, cells };
}

const MM_PT = 72 / 25.4;
const round = (n: number, step: number) => Math.round(n / step) * step;

/**
 * Millimetres a column takes from its neighbour in the file, where Excel's and Word's own room inside a cell would break a
 * heading the print keeps on one line: F/QC/17's "Difference" (column 4) takes 2.5 mm from "Observed reading (mm)"
 * (column 3), whose words are on two lines anyway. Merged cells across both keep their width.
 */
const WIDER: Record<string, { from: number; to: number; mm: number }> = {
  "qc-ruler-verification": { from: 2, to: 3, mm: 2.5 },
  "qc-ruler-verification-300": { from: 2, to: 3, mm: 2.5 },
};

/** The paper's column widths (mm), as the file lays them. */
function columnsMm(documentId: string, edges: number[]): number[] {
  const mm = edges.slice(1).map((e, i) => e - edges[i]);
  const w = WIDER[documentId];
  if (w && mm[w.from] > w.mm && mm[w.to] !== undefined) {
    mm[w.from] -= w.mm;
    mm[w.to] += w.mm;
  }
  return mm;
}

/** A heading row's height in the file: never less than three lines of its words (Excel wraps "Observed reading (mm)" so and does not grow a row to hold them). */
const rowPt = (r: PaperRow, scale: number, size: number): number => Math.max(r.h * scale * MM_PT, r.head ? 3 * size * scale * 1.3 + 2 : 0);

/**
 * A register's line (form.lines, F/QC/16) as tall as its longest words need, since Excel does not grow a row it is given a
 * height for: each cell's words over its width (pt), at about half the face's size a letter, each line 1.25 times the size.
 */
function linePt(cells: Placed[], widthsPt: number[], base: number): number {
  let lines = 1;
  for (const c of cells) {
    const room = widthsPt.slice(c.col, c.col + c.colSpan).reduce((a, b) => a + b, 0) - 5;
    // Word by word, as Excel wraps them: a long word ("Pharmaceuticals") starts a line of its own.
    const perLine = Math.max(1, Math.floor(Math.max(1, room) / (c.size * 0.5)));
    const need = c.shown.text.split("\n").reduce((n, line) => {
      let count = 1;
      let used = 0;
      for (const word of line.split(/\s+/).filter(Boolean)) {
        const w = word.length + (used ? 1 : 0);
        if (used && used + w > perLine) {
          count++;
          used = word.length;
        } else used += w;
      }
      return n + count;
    }, 0);
    lines = Math.max(lines, need);
  }
  return Math.max(base, lines * (cells[0]?.size ?? 11) * 1.25 + 4);
}

/** The paper as an Excel sheet: its columns (Excel characters), rows (points), merged cells, faces and rules, at its printed size. */
export function paperTableSheet(documentId: string, blocks: ExportBlock[], sheetName = ""): ExportBlock[] | null {
  const form = paperTableFor(documentId);
  if (!form || !(PAPER_TABLE_EXPORTS.has(documentId) || PAPER_TABLE_EXCEL.has(documentId))) return null;
  const read = placed(form, blocks);
  if (!read) return null;
  const { scale } = paperTablePrint(form);
  // A column's width in Excel characters: its pixels at 96 to the inch, less Excel's 5 px of padding, 7 px a character.
  const widths = columnsMm(documentId, read.edges).map((mm) => Math.max(0.5, Math.round((((mm * scale * 96) / 25.4 - 5) / 7) * 100) / 100));
  const mmCols = columnsMm(documentId, read.edges);
  const widthsPt = mmCols.map((mm) => mm * scale * MM_PT);
  const firstLine = form.head.length + form.body.length;
  const heights = read.rows.map((r, ri) =>
    round(form.lines && ri >= firstLine && r.line !== undefined ? linePt(read.cells.filter((c) => c.row === ri), widthsPt, rowPt(r, scale, form.pt)) : rowPt(r, scale, form.pt), 0.25)
  );
  const cells: SheetCell[] = read.cells.map((p) => ({
    ...p.shown,
    row: p.row,
    col: p.col,
    rowSpan: p.rowSpan,
    colSpan: p.colSpan,
    style: { size: round(p.size * scale, 0.5), bold: p.bold, underline: p.underline, align: p.align, valign: "center", wrap: true, borders: p.borders, font: p.font, ...(p.fill ? { fill: p.fill } : {}), ...(/\.\d*0$/.test(p.shown.text.trim()) ? { keepText: true } : {}) },
  }));
  return [{ kind: "sheet", name: sheetName, widths, heights, rowCount: read.rows.length, cells }];
}

/** The paper as a Word page: one table on its columns (points), its rows' heights, merged cells, faces and rules, at its printed size. */
export function paperTableWord(documentId: string, blocks: ExportBlock[]): ExportBlock[] | null {
  const form = paperTableFor(documentId);
  if (!form || !PAPER_TABLE_EXPORTS.has(documentId)) return null;
  const read = placed(form, blocks);
  if (!read) return null;
  const { scale } = paperTablePrint(form);
  const widths = columnsMm(documentId, read.edges).map((mm) => Math.round(mm * scale * MM_PT * 100) / 100);
  const eighths = (level: number) => (level === 2 ? 12 : level === 1 ? 6 : 0);
  // Each row's cells in column order; a cell merged down from a row above stands in its rows below as a "continue".
  const byRow: { col: number; cell: PaperCellSpec }[][] = read.rows.map(() => []);
  for (const p of read.cells) {
    const [l, r, t, b] = p.borders.map(eighths) as PaperCellSpec["borders"];
    const set = { size: Math.round(p.size * scale * 2), bold: p.bold, align: p.align, valign: "center" as const, font: p.font, ...(p.underline ? { underline: true } : {}), ...(p.fill ? { fill: p.fill } : {}), ...(p.colSpan > 1 ? { colSpan: p.colSpan } : {}) };
    byRow[p.row].push({ col: p.col, cell: { ...p.shown, ...set, borders: [l, r, t, b], ...(p.rowSpan > 1 ? { vMerge: "restart" as const } : {}) } });
    for (let d = 1; d < p.rowSpan; d++) byRow[p.row + d]?.push({ col: p.col, cell: { text: "", ...set, borders: [l, r, 0, b], vMerge: "continue" } });
  }
  return [
    {
      kind: "paper",
      widths,
      spaceAfter: 1,
      rows: read.rows.map((r, ri) => ({ height: Math.round(r.h * scale * MM_PT * 100) / 100, cells: byRow[ri].sort((a, b) => a.col - b.col).map((c) => c.cell) })),
    },
  ];
}

/** The Word page's margins for such a paper (points): the print's own, all round. */
export function paperTableWordMargins(documentId: string): { top: number; right: number; bottom: number; left: number } | undefined {
  return PAPER_TABLE_EXPORTS.has(documentId) ? { top: WORD_MARGIN, right: WORD_MARGIN, bottom: WORD_MARGIN, left: WORD_MARGIN } : undefined;
}
