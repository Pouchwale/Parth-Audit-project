import type { Cell, ExportBlock, PaperCellSpec, SheetCell } from "./documentExport";
import { lineRow, paperTableFor as ownPaper, paperTablePrint, shownPaperTable as paperTableFor, type PaperCell, type PaperRow, type PaperTable } from "../data/seed/qcPaperTables";

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
  const own = ownPaper(documentId);
  if (own?.ownWords && !own.flows) return { top: 18, right: WORD_MARGIN, bottom: 18, left: WORD_MARGIN };
  return PAPER_TABLE_EXPORTS.has(documentId) || own?.ownWords ? { top: WORD_MARGIN, right: WORD_MARGIN, bottom: WORD_MARGIN, left: WORD_MARGIN } : undefined;
}

// AN HR PAPER IN THE KIND OF FILE ITS ORIGINAL IS NOT (REQUIREMENTS §275: "as it is, no new things"). The company's own Word or
// Excel file is filled where it is that kind; the other kind, and a record with words its file has no place for, is drawn
// here from the paper on the page: its cells, merges, rules, faces and every word the record holds - and nothing else.

/** The words of a cell holding a box or a choice inside its printed words, read in the order the paper shows them. */
function wordsInPlace(td: HTMLTableCellElement, read: (el: Element) => Cell): string {
  const pieces: { t: string; x: number; y: number; h: number; right: number; filled?: boolean }[] = [];
  const add = (t: string, b: DOMRect, filled = false) => {
    if (t) pieces.push({ t, x: b.left, y: b.top + b.height / 2, h: b.height || 10, right: b.right, filled });
  };
  const walker = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode as Text;
    const up = n.parentElement;
    if (!up || up.closest(".no-print, [aria-hidden='true'], .pt-pick, input, textarea, select, option")) continue;
    const over = up.closest(".pt-over");
    if (over && !over.querySelector(".pt-pick")) continue;
    for (const m of n.data.matchAll(/\S+/g)) {
      const r = document.createRange();
      r.setStart(n, m.index);
      r.setEnd(n, m.index + m[0].length);
      add(m[0], r.getBoundingClientRect());
    }
  }
  for (const p of Array.from(td.querySelectorAll(".pt-pick"))) {
    const on = p.classList.contains("is-on");
    const word = (p.textContent ?? "").trim();
    add(p.classList.contains("pt-pick-tick") ? (on ? "✓" : "") : p.classList.contains("pt-pick-check") ? (p.classList.contains("pt-pick-after") ? `${word} ${on ? "☑" : "☐"}` : `${on ? "☑" : "☐"} ${word}`).trim() : on ? `(${word})` : word, p.getBoundingClientRect(), on);
  }
  for (const o of Array.from(td.querySelectorAll(":scope > .pt-over"))) {
    if (!o.querySelector(".pt-pick")) add(read(o).text.trim(), o.getBoundingClientRect(), true);
  }
  // (the paper's writing line under a value is the value's place: the value stands there instead)
  const kept = pieces.filter((p) => !/^[_.…]{3,}$/.test(p.t) || !pieces.some((v) => v.filled && Math.abs(v.y - p.y) < p.h && v.x < p.right && v.right > p.x));
  const lines: (typeof kept)[] = [];
  for (const p of [...kept].sort((a, b) => a.y - b.y)) {
    const line = lines.find((l) => Math.abs(l[0].y - p.y) < Math.max(l[0].h, p.h) * 0.6);
    if (line) line.push(p);
    else lines.push([p]);
  }
  return lines.map((l) => l.sort((a, b) => a.x - b.x).map((p) => p.t).join(" ")).join("\n");
}

/**
 * Millimetres a drawn paper's columns give to each other in the file, adding up to nothing. F/HR/20's tick boxes: "Agree",
 * "Neutral" and "Disagree" broke in their narrow columns in Word and Excel, and a box parted from its number. The room comes
 * from the Moderately columns and the last one, which have some to spare; the Attribute column keeps its width.
 */
const DRAWN_COLUMN_SHIFT: Record<string, number[]> = { "hr-psc-survey": [0, 0, 1, -1.7, 1.4, 1.4, 1.4, -2, -1.5] };
/** Word's room inside each cell of such a paper (twentieths of a point), so the headings stay whole. */
const DRAWN_CELL_PAD: Record<string, number> = { "hr-psc-survey": 40 };

function drawnWords(td: HTMLTableCellElement, read: (el: Element) => Cell): Cell {
  if (td.querySelector(":scope > .pt-over, .pt-pick")) return { text: wordsInPlace(td, read) };
  const at = Array.from(td.querySelectorAll(":scope > .pt-at"));
  if (at.length) return { text: at.map((a) => read(a).text.trim()).filter(Boolean).join("\n") };
  const bullets = Array.from(td.querySelectorAll(".pt-bullet"));
  if (bullets.length) return { text: bullets.map((b) => `• ${read(b).text.trim().replace(/^[•●]\s*/, "")}`).join("\n") };
  return read(td);
}

/** The paper on the page as a sheet or a Word table, or null for any other document. */
export function paperDrawnBlocks(documentId: string, kind: "xlsx" | "docx", roots: Element[], read: (el: Element) => Cell, sheetName = ""): ExportBlock[] | null {
  const form = ownPaper(documentId);
  if (!form?.ownWords) return null;
  const papers = roots.flatMap((r) => (r.matches(".paper-table-sheet") ? [r] : Array.from(r.querySelectorAll(".paper-table-sheet"))));
  const first = papers[0]?.querySelector("table.pt-table");
  if (!first) return null;
  const drawnMm = Array.from(first.querySelectorAll(":scope > colgroup > col")).map((c) => Number((c as HTMLElement).style.getPropertyValue("--pt-col")) || 0);
  const shift = DRAWN_COLUMN_SHIFT[documentId];
  const widthsMm = shift?.length === drawnMm.length ? drawnMm.map((mm, i) => mm + shift[i]) : drawnMm;
  const totalMm = widthsMm.reduce((a, b) => a + b, 0);
  if (!(totalMm > 0)) return null;
  const heightsMm: number[] = [];
  const starts: number[] = [];
  const drawn: Omit<Placed, "def" | "shown">[] = [];
  const words: Cell[] = [];
  for (const paper of papers) {
    starts.push(heightsMm.length);
    for (const table of Array.from(paper.querySelectorAll<HTMLTableElement>("table.pt-table"))) {
      const perMm = table.getBoundingClientRect().width / totalMm || 1;
      const held = new Map<number, Set<number>>();
      for (const tr of Array.from(table.rows)) {
        const ri = heightsMm.length;
        // A new page of the paper (its head again, PaperRow.pb) starts a new page in Word too: F/MNT/02's page 2 ran on
        // under page 1's foot, its head box parted across the two (§386).
        if (kind === "docx" && tr.classList.contains("pt-pb") && ri > (starts[starts.length - 1] ?? 0)) starts.push(ri);
        const own = Number(tr.style.getPropertyValue("--pt-h")) || 0;
        heightsMm.push(Math.max(own, tr.getBoundingClientRect().height / perMm));
        const blankLine = tr.classList.contains("pt-pad");
        const taken = held.get(ri);
        let col = 0;
        for (const td of Array.from(tr.cells)) {
          while (taken?.has(col)) col++;
          const colSpan = Math.max(1, td.colSpan);
          const rowSpan = Math.max(1, td.rowSpan);
          const has = (c: string) => td.classList.contains(c);
          const line = td.querySelector<HTMLElement>(":scope > .pt-at");
          const rule = (e: string, open: string, heavy?: string) => (has(open) || !has(`pt-e${e}`) ? 0 : heavy && has(heavy) ? 2 : 1);
          const face = (["arial", "times", "gothic"] as const).find((f) => has(`pt-f-${f}`) || line?.classList.contains(`pt-f-${f}`));
          const fill = has("pt-bg") ? td.style.getPropertyValue("--pt-bg").trim() : "";
          words.push(blankLine || has("pt-padc") ? { text: "" } : drawnWords(td, read));
          drawn.push({
            row: ri,
            col,
            colSpan,
            rowSpan,
            size: Number(line?.style.getPropertyValue("--pt-size")) || Number(td.style.getPropertyValue("--pt-size")) || form.pt,
            bold: has("pt-b") || !!line?.classList.contains("pt-b"),
            underline: has("pt-u"),
            ...(fill ? { fill } : {}),
            align: has("pt-ac") ? "center" : has("pt-ar") ? "right" : "left",
            font: FACE[face ?? form.font],
            borders: [rule("l", "pt-nl"), rule("r", "pt-or", "pt-hr"), rule("t", "pt-nt"), rule("b", "pt-ob", "pt-hb")],
          });
          for (let d = 1; d < rowSpan; d++) {
            const below = held.get(ri + d) ?? new Set<number>();
            for (let c = col; c < col + colSpan; c++) below.add(c);
            held.set(ri + d, below);
          }
          col += colSpan;
        }
      }
    }
  }
  // (a thin empty strip at the very end is nothing of the paper's: in Excel it made a blank last page of its own)
  while (heightsMm.length > 1 && heightsMm[heightsMm.length - 1] < 4 && !drawn.some((p, i) => p.row === heightsMm.length - 1 && words[i].text.trim() !== "")) {
    const last = heightsMm.length - 1;
    for (const p of drawn) if (p.row < last && p.row + p.rowSpan - 1 >= last) p.rowSpan = last - p.row;
    heightsMm.pop();
    for (let i = drawn.length - 1; i >= 0; i--) {
      if (drawn[i].row === last) {
        drawn.splice(i, 1);
        words.splice(i, 1);
      }
    }
  }
  // The size it prints on A4, inside the page's margins.
  // (the page and the size the sheet itself is drawn at: a paper fitted to be read may have turned its page, §282)
  const sheet = papers[0] as HTMLElement;
  const page = sheet.getAttribute("data-paper") === "landscape" ? "landscape" : "portrait";
  const roomPt = (page === "portrait" ? 595.28 : 841.89) - 2 * WORD_MARGIN;
  const scale = Math.min(Number(sheet.style.getPropertyValue("--pt-print-scale")) || 1, roomPt / (totalMm * MM_PT));
  if (kind === "xlsx") {
    const narrow = (p: { col: number; colSpan: number }, text: string) => /^\d/.test(text) && widthsMm.slice(p.col, p.col + p.colSpan).reduce((a, b) => a + b, 0) * scale < 3.2 * text.length + 4;
    const cells: SheetCell[] = drawn.map((p, i) => ({
      ...words[i],
      row: p.row,
      col: p.col,
      rowSpan: p.rowSpan,
      colSpan: p.colSpan,
      style: { size: round(p.size * scale, 0.5), bold: p.bold, underline: p.underline, align: p.align, valign: "center", wrap: true, borders: p.borders, font: p.font, ...(p.fill ? { fill: p.fill } : {}), ...(/^0\d|\.\d*0$/.test(words[i].text.trim()) || narrow(p, words[i].text.trim()) ? { keepText: true } : {}) },
    }));
    const widths = widthsMm.map((mm) => Math.max(0.5, Math.round((((mm * scale * 96) / 25.4 - 5) / 7) * 100) / 100));
    const heights = heightsMm.map((h) => round(Math.min(409, h * scale * MM_PT), 0.25));
    return [{ kind: "sheet", name: sheetName, widths, heights, rowCount: heightsMm.length, cells, breaks: starts.slice(1), page, ...(form.flows ? {} : { onePage: true }) }];
  }
  const eighths = (level: number) => (level === 2 ? 12 : level === 1 ? 6 : 0);
  const byRow: { col: number; cell: PaperCellSpec }[][] = heightsMm.map(() => []);
  // (F/HR/04 is a full page: Word sets its lines a little taller, so half a point less keeps its foot on that one page)
  const wordFit = documentId === "hr-pre-employment-health" ? 0.94 : 1;
  drawn.forEach((p, i) => {
    const [l, r, t, b] = p.borders.map(eighths) as PaperCellSpec["borders"];
    const set = { size: Math.round(p.size * scale * wordFit * 2), bold: p.bold, align: p.align, valign: "center" as const, font: p.font, ...(p.underline ? { underline: true } : {}), ...(p.fill ? { fill: p.fill } : {}), ...(p.colSpan > 1 ? { colSpan: p.colSpan } : {}) };
    byRow[p.row].push({ col: p.col, cell: { ...words[i], ...set, borders: [l, r, t, b], ...(p.rowSpan > 1 ? { vMerge: "restart" as const } : {}) } });
    for (let d = 1; d < p.rowSpan; d++) byRow[p.row + d]?.push({ col: p.col, cell: { text: "", ...set, borders: [l, r, 0, b], vMerge: "continue" } });
  });
  const wordWidths = widthsMm.map((mm) => Math.round(mm * scale * MM_PT * 100) / 100);
  return starts.map((from, n) => ({
    kind: "paper" as const,
    widths: wordWidths,
    spaceAfter: 1,
    ...(DRAWN_CELL_PAD[documentId] !== undefined ? { cellPad: DRAWN_CELL_PAD[documentId] } : {}),
    ...(n > 0 ? { pageBreakBefore: true } : {}),
    // (a one-page paper: Word's lines stand a little taller than the page's, so its rows give up their spare height)
    rows: heightsMm.slice(from, starts[n + 1] ?? heightsMm.length).map((h, k) => ({ height: Math.round(h * scale * MM_PT * (form.flows ? 1 : 0.48) * 100) / 100, cells: byRow[from + k].sort((a, b) => a.col - b.col).map((c) => c.cell) })),
  }));
}
