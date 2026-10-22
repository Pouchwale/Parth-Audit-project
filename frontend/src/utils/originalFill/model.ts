// WHAT DCRS SHOWS, AS THE FILLER PLACES IT (REQUIREMENTS §119).
//
// The page is read as it is for every download (utils/documentExport.ts documentBlocks): the company's name, the title, the
// header band, the boxes, the grids, the fixed words. This sorts those blocks into what the filler looks for in the owner's
// file: the band's four cells, each box with its label, each grid with its headings and lines, and the fixed words.

import type { Cell, ExportBlock } from "../documentExport";
import type { ExportSegment, ExportTableBinding } from "../../engine/roundTrip/exportMap";
import { COMPANY_RE, norm } from "./text";

export interface ModelField {
  label: string;
  cell: Cell;
  /** DCRS's own label, where the paper's words for it are looked for instead (hints.ts labelAs). */
  shown?: string;
  /** The block it came from, in the page's order (a box before or after a grid). */
  order?: number;
}

export interface ModelGrid {
  rows: Cell[][];
  headerRows: number;
  bindTable?: ExportTableBinding;
  /** The block it came from, in the page's order. */
  order?: number;
}

export interface DcrsModel {
  /** The company's name as DCRS prints it (COMPANY.name, REQUIREMENTS §95's one spelling). */
  company: string;
  title: string;
  /** Every other fixed line DCRS prints (notes, the lines under the company's name, the address at the foot). */
  texts: string[];
  /** The header band: Format No., Rev No., Rev Date, Page No. (label, value). */
  band: ModelField[];
  /** Every box with its label: the boxes above and below the grids, and a line of words holding a bound value. */
  fields: ModelField[];
  grids: ModelGrid[];
}

const isBound = (c: Cell | undefined): boolean => !!c?.parts?.some((p) => p.bind);

/** A line of words holding bound values ("Month & Year : <value>"): each value with the words before it as its label. */
function fieldsOfText(parts: ExportSegment[]): ModelField[] {
  const out: ModelField[] = [];
  let words = "";
  for (const p of parts) {
    if (!p.bind) {
      words += p.text;
      continue;
    }
    const label = words.replace(/[\s:\-–=]+$/, "").trim();
    const bind = { ...p.bind };
    out.push({ label, cell: { text: p.bind.text, parts: [{ text: p.bind.text, bind }], bind } });
    words = "";
  }
  return out;
}

/** A sheet block (a page drawn as its Excel paper, data-paper-sheet) as rows of cells, each merged cell's words in its first cell. */
function rowsOfSheet(b: Extract<ExportBlock, { kind: "sheet" }>): Cell[][] {
  const width = Math.max(b.widths.length, ...b.cells.map((c) => c.col + c.colSpan));
  const rows: Cell[][] = Array.from({ length: b.rowCount }, () => Array.from({ length: width }, () => ({ text: "" }) as Cell));
  for (const c of b.cells) rows[c.row][c.col] = { text: c.text, ...(c.parts ? { parts: c.parts } : {}), ...(c.bind ? { bind: c.bind } : {}), ...(c.date ? { date: c.date } : {}) };
  return rows;
}

export function modelOf(blocks: ExportBlock[]): DcrsModel {
  const model: DcrsModel = { company: "", title: "", texts: [], band: [], fields: [], grids: [] };
  for (const [order, b] of blocks.entries()) {
    const fieldsBefore = model.fields.length;
    const gridsBefore = model.grids.length;
    if (b.kind === "text") {
      if (b.parts?.some((p) => p.bind)) {
        model.fields.push(...fieldsOfText(b.parts));
        for (const f of model.fields.slice(fieldsBefore)) f.order = order;
        continue;
      }
      const text = b.text.trim();
      if (!text) continue;
      if (b.title && !model.company && COMPANY_RE.test(text)) model.company = text;
      else if (b.title && !model.title) model.title = text;
      else model.texts.push(text);
    } else if (b.kind === "fields") {
      for (const [label, cell] of b.pairs) {
        if (!label.trim() && !isBound(cell)) continue;
        model.fields.push({ label: label.trim(), cell });
      }
    } else if (b.kind === "table") {
      if (b.band) {
        const row = b.rows[0] ?? [];
        for (let i = 0; i + 1 < row.length; i += 2) {
          model.band.push({ label: row[i].text.trim(), cell: row[i + 1] });
          // A value of the record written in the band (a page number typed over, a report's date in its letterhead) is a box too.
          if (isBound(row[i + 1])) model.fields.push({ label: row[i].text.trim(), cell: row[i + 1] });
        }
        continue;
      }
      // A table of one line of label-and-box pairs and no heading (a letterhead's boxes) reads as boxes, not as a grid.
      model.grids.push({ rows: b.rows, headerRows: b.headerRows, ...(b.bindTable ? { bindTable: b.bindTable } : {}) });
    } else if (b.kind === "sheet") {
      model.grids.push({ rows: rowsOfSheet(b), headerRows: 0 });
    } else if (b.kind === "paper") {
      const rows = b.rows.map((r) => r.cells.map((c) => ({ text: c.text, ...(c.parts ? { parts: c.parts } : {}), ...(c.bind ? { bind: c.bind } : {}) }) as Cell));
      model.grids.push({ rows, headerRows: 0 });
    }
    for (const f of model.fields.slice(fieldsBefore)) f.order ??= order;
    for (const g of model.grids.slice(gridsBefore)) g.order ??= order;
  }
  return model;
}

/**
 * The paper's own words for DCRS's labels and grid headings (hints.ts labelAs: a paper that words a box differently, or is
 * in another language): the box or column is then looked for by the paper's words. Each field keeps DCRS's label as `shown`.
 */
export function withPaperWords(model: DcrsModel, labelAs: Record<string, string> | undefined): DcrsModel {
  if (!labelAs) return model;
  const map = new Map(Object.entries(labelAs).map(([k, v]) => [norm(k), v]));
  for (const f of model.fields) {
    const as = map.get(norm(f.label));
    if (as !== undefined) {
      f.shown = f.label;
      f.label = as;
    }
  }
  for (const g of model.grids) for (let r = 0; r < g.headerRows; r++) g.rows[r] = g.rows[r].map((c) => (map.has(norm(c.text)) ? { ...c, text: map.get(norm(c.text))! } : c));
  return model;
}

/**
 * Boxes DCRS numbers in groups ("Attendance 3 — Name", "NC 2 — Section", "HARA Review Team 5 — Designation"): a list the
 * paper keeps as a table, headed by the boxes' own words, a row to each number. Given as a grid of one line per number, for
 * the filler to try on the paper's tables before the boxes are looked for one by one.
 */
export function numberedGroups(fields: ModelField[]): { grid: ModelGrid; fields: ModelField[] }[] {
  const groups = new Map<string, { n: number; sub: string; f: ModelField }[]>();
  for (const f of fields) {
    const m = /^(.*?\S)\s*(\d{1,2})\s+—\s+(.+)$/.exec(f.label);
    if (!m || !isBound(f.cell)) continue;
    const name = norm(m[1]);
    groups.set(name, [...(groups.get(name) ?? []), { n: Number(m[2]), sub: m[3].trim(), f }]);
  }
  const out: { grid: ModelGrid; fields: ModelField[] }[] = [];
  for (const items of groups.values()) {
    const numbers = Array.from(new Set(items.map((x) => x.n))).sort((a, b) => a - b);
    const subs = Array.from(new Set(items.map((x) => x.sub)));
    if (numbers.length < 2 || subs.length < 2) continue;
    const rows: Cell[][] = [subs.map((text) => ({ text }))];
    for (const n of numbers) rows.push(subs.map((sub) => items.find((x) => x.n === n && x.sub === sub)?.f.cell ?? { text: "" }));
    out.push({ grid: { rows, headerRows: 1, order: items[0].f.order }, fields: items.map((x) => x.f) });
  }
  return out;
}

/** The value DCRS's band holds under a label: "Format No." -> "F/QC/01". */
export function bandValue(model: DcrsModel, word: "formatNo" | "revNo" | "revDate" | "page"): string {
  const want: Record<typeof word, RegExp> = {
    formatNo: /^format\s*no|^format\s*number|^doc/i,
    revNo: /^rev(ision)?\.?\s*no/i,
    revDate: /date/i,
    page: /^page/i,
  };
  const hit = model.band.find((f) => want[word].test(f.label) && (word !== "revDate" || /rev|issue|effective|date/i.test(f.label)));
  return (hit?.cell.text ?? "").trim();
}

/** Every label DCRS prints (boxes, band, grid headings): words the filler must not take for a value. */
export function labelsOf(model: DcrsModel): Set<string> {
  const out = new Set<string>();
  for (const f of [...model.fields, ...model.band]) if (f.label) out.add(norm(f.label));
  for (const g of model.grids) for (let r = 0; r < g.headerRows; r++) for (const c of g.rows[r] ?? []) if (c.text) out.add(norm(c.text));
  return out;
}
