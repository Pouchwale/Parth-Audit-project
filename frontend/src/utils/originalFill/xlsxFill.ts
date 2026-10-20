// THE OWNER'S OWN WORKBOOK, FILLED WITH THE RECORD (REQUIREMENTS §119).
//
// The template is his .xls saved by Excel as .xlsx (scripts/originals/convert.py), one sheet: the document's own. The page's
// blocks are placed INTO it by their words:
//   the header band  his "Format no.", "Rev. no.", "Effective date", "Page" cells take DCRS's values (the format's own edits
//                    show), the company's name its one spelling, the title DCRS's title where the plant changed it; the
//                    header's DATE cell is blanked (REQUIREMENTS §117) unless it is the revision's date
//   a box            its label is found in a cell; the value goes into the empty cell after it (or below it), or after the
//                    label in the same cell where the paper writes "Label : ____"
//   a grid           its headings are found in a row; each column goes under its heading; a fixed line (a parameter) onto
//                    the paper's row of the same words, the free lines into the rows under the heading; more lines than
//                    the paper has rows: the last row is copied, everything below moved down (cells, merges, names, the print
//                    area, pictures)
// Before anything is written, every value cell of the boxes and the grid bodies is cleared: a template that came filled
// with his example entries never carries them into a download (REQUIREMENTS §98). The round-trip map goes in as
// utils/documentExport.ts workbookFromBlocks writes it (a very hidden "_dcrs" sheet, a hidden name on each bound cell, the
// envelope in the custom properties), so an edited file reads back through engine/roundTrip/readFile.ts as before.

import type { Cell, ExportBlock } from "../documentExport";
import { columnIndex, columnName, isoToSerial, serialToIso } from "../xlsx";
import { formatDisplayDate } from "../date";
import { fractionToTime, numberFormatKind } from "../../engine/roundTrip/readFile";
import {
  ENVELOPE_PROPERTY,
  ExportMapBuilder,
  MAP_SHEET_NAME,
  entryName,
  envelopePropertyValue,
  mapSheetRows,
  rowSignature,
  tableName,
  type ExportBinding,
  type ExportSegment,
  type ExportTableBinding,
  type RoundTripEnvelope,
} from "../../engine/roundTrip/exportMap";
import { Pkg, setCustomProperty } from "./pkg";
import { el, kid, kids, all, attrOf, clone, type XmlElement } from "./xml";
import { modelOf, bandValue, labelsOf, type DcrsModel, type ModelField, type ModelGrid } from "./model";
import { COMPANY_RE, FORMAT_NO_RE, REVISION_AFTER_RE, afterLabel, bandWordOf, dotted, isBlankish, isSerialHeading, isoOf, norm, same, similarity } from "./text";
import { emptyReport, type FillHints, type FillReport } from "./types";

const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NUMBER_RE = /^-?(?:0|[1-9]\d{0,14})(?:\.\d+)?$/;

type StyleKind = ReturnType<typeof numberFormatKind>;

interface Merge {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

const key = (r: number, c: number) => r * 20000 + c;

// ---------------------------------------------------------------------------------------------------------------------
// the workbook's styles: which cells show a date, which are text, which are ruled

class Styles {
  kinds: StyleKind[] = [];
  text: boolean[] = [];
  ruled: boolean[] = [];
  constructor(styles: XmlElement | null) {
    if (!styles) return;
    const custom = new Map<number, string>();
    for (const f of all(styles, "numFmt")) custom.set(Number(attrOf(f, "numFmtId")), attrOf(f, "formatCode") ?? "");
    const borders = all(styles, "borders")[0];
    const sided = (borders ? kids(borders, "border") : []).map((b) => ["left", "right", "top", "bottom"].some((side) => !!kid(b, side)?.attrs.style && kid(b, side)!.attrs.style !== "none"));
    const xfs = all(styles, "cellXfs")[0];
    for (const xf of xfs ? kids(xfs, "xf") : []) {
      const id = Number(attrOf(xf, "numFmtId") ?? 0);
      this.kinds.push(numberFormatKind(id, custom.get(id)));
      this.text.push(id === 49 || (custom.get(id) ?? "").trim() === "@");
      this.ruled.push(!!sided[Number(attrOf(xf, "borderId") ?? 0)]);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// the sheet

const unescapeX = (s: string) => (s.indexOf("_x") === -1 ? s : s.replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))));

function itemText(si: XmlElement): string {
  let s = "";
  for (const c of si.children) {
    if (typeof c === "string") continue;
    if (c.local === "t") s += textAll(c);
    else if (c.local === "r") for (const t of kids(c, "t")) s += textAll(t);
  }
  return unescapeX(s).replace(/\r\n?/g, "\n");
}

const textAll = (e: XmlElement): string => e.children.map((c) => (typeof c === "string" ? c : textAll(c))).join("");

const numberText = (n: number) => String(Number(n.toPrecision(15)));

class XSheet {
  sheetData: XmlElement;
  rows = new Map<number, XmlElement>();
  cells = new Map<number, XmlElement>();
  merges: Merge[] = [];
  private mergeAt = new Map<number, Merge>();
  constructor(
    public root: XmlElement,
    private shared: string[],
    public styles: Styles
  ) {
    this.sheetData = kid(root, "sheetData") ?? el("sheetData");
    if (!kid(root, "sheetData")) root.children.push(this.sheetData);
    this.index();
  }

  index(): void {
    this.rows.clear();
    this.cells.clear();
    for (const row of kids(this.sheetData, "row")) {
      const r = Number(row.attrs.r);
      this.rows.set(r, row);
      for (const c of kids(row, "c")) {
        const ref = c.attrs.r ?? "";
        const m = /^([A-Z]+)(\d+)$/.exec(ref);
        if (m) this.cells.set(key(Number(m[2]), columnIndex(m[1])), c);
      }
    }
    this.merges = [];
    this.mergeAt.clear();
    const mc = kid(this.root, "mergeCells");
    for (const m of mc ? kids(mc, "mergeCell") : []) {
      const g = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(m.attrs.ref ?? "");
      if (!g) continue;
      const merge = { r1: Number(g[2]), c1: columnIndex(g[1]), r2: Number(g[4]), c2: columnIndex(g[3]) };
      this.merges.push(merge);
      for (let r = merge.r1; r <= merge.r2; r++) for (let c = merge.c1; c <= merge.c2; c++) this.mergeAt.set(key(r, c), merge);
    }
  }

  maxRow(): number {
    let m = 0;
    for (const r of this.rows.keys()) if (r > m) m = r;
    return m;
  }

  maxCol(): number {
    let m = 0;
    for (const k of this.cells.keys()) if (k % 20000 > m) m = k % 20000;
    for (const g of this.merges) if (g.c2 > m) m = g.c2;
    return m;
  }

  mergeOf(r: number, c: number): Merge | undefined {
    return this.mergeAt.get(key(r, c));
  }

  /** Inside a merged range but not its first cell. */
  covered(r: number, c: number): boolean {
    const m = this.mergeAt.get(key(r, c));
    return !!m && (m.r1 !== r || m.c1 !== c);
  }

  styleOf(r: number, c: number): number {
    return Number(this.cells.get(key(r, c))?.attrs.s ?? this.rows.get(r)?.attrs.s ?? 0) || 0;
  }

  ruled(r: number, c: number): boolean {
    return !!this.styles.ruled[this.styleOf(r, c)];
  }

  hasFormula(r: number, c: number): boolean {
    const cell = this.cells.get(key(r, c));
    return !!cell && !!kid(cell, "f");
  }

  /** The cell's words as the upload reader reads them (engine/roundTrip/readFile.ts cellValue). */
  text(r: number, c: number): string {
    const cell = this.cells.get(key(r, c));
    if (!cell) return "";
    const t = cell.attrs.t ?? "n";
    const vEl = kid(cell, "v");
    const v = vEl ? textAll(vEl) : undefined;
    switch (t) {
      case "s":
        return v === undefined ? "" : (this.shared[Number(v)] ?? "");
      case "inlineStr": {
        const is = kid(cell, "is");
        return is ? itemText(is) : unescapeX(v ?? "");
      }
      case "str":
        return unescapeX(v ?? "").replace(/\r\n?/g, "\n");
      case "b":
        return v === "1" || /^true$/i.test(v ?? "") ? "TRUE" : "FALSE";
      case "e":
        return v ?? "";
      case "d": {
        const m = /^(\d{4}-\d{2}-\d{2})/.exec((v ?? "").trim());
        return m ? formatDisplayDate(m[1]) : (v ?? "");
      }
      default: {
        if (v === undefined || v.trim() === "") return "";
        const n = Number(v);
        if (!Number.isFinite(n)) return v;
        const kind = this.styles.kinds[this.styleOf(r, c)] ?? null;
        if (kind === "time" || (kind === "datetime" && n < 1)) return fractionToTime(n);
        if (kind === "date" || kind === "datetime") {
          const iso = serialToIso(n);
          return iso ? formatDisplayDate(iso) : numberText(n);
        }
        return numberText(n);
      }
    }
  }

  private rowEl(r: number): XmlElement {
    let row = this.rows.get(r);
    if (row) return row;
    row = el("row", { r: String(r) });
    const after = Array.from(this.rows.keys())
      .filter((x) => x < r)
      .sort((a, b) => b - a)[0];
    const at = after !== undefined ? this.sheetData.children.indexOf(this.rows.get(after)!) + 1 : 0;
    this.sheetData.children.splice(at, 0, row);
    this.rows.set(r, row);
    return row;
  }

  /** The cell element, made (in its place in the row) when the sheet has none there. */
  cellEl(r: number, c: number): XmlElement {
    const known = this.cells.get(key(r, c));
    if (known) return known;
    const row = this.rowEl(r);
    const cell = el("c", { r: `${columnName(c)}${r}` });
    // A cell Excel never wrote takes its column's style (or its row's).
    const colStyle = this.colStyle(c) ?? row.attrs.s;
    if (colStyle) cell.attrs.s = colStyle;
    const cs = kids(row, "c");
    const before = cs.find((x) => columnIndex((x.attrs.r ?? "").replace(/\d+$/, "")) > c);
    if (before) row.children.splice(row.children.indexOf(before), 0, cell);
    else row.children.push(cell);
    this.cells.set(key(r, c), cell);
    return cell;
  }

  private colStyle(c: number): string | undefined {
    const cols = kid(this.root, "cols");
    for (const col of cols ? kids(cols, "col") : []) {
      const min = Number(col.attrs.min) - 1;
      const max = Number(col.attrs.max) - 1;
      if (c >= min && c <= max) return col.attrs.style;
    }
    return undefined;
  }

  /** Empties a cell (its words, its number, its formula), keeping its style. */
  clear(r: number, c: number): boolean {
    const cell = this.cells.get(key(r, c));
    if (!cell) return false;
    const had = this.text(r, c) !== "";
    cell.children = [];
    delete cell.attrs.t;
    return had;
  }

  /** Writes words (or a number, or a date) into a cell, keeping its style. */
  write(r: number, c: number, text: string, opts: { date?: string; plainText?: boolean } = {}): void {
    const cell = this.cellEl(r, c);
    const style = Number(cell.attrs.s ?? 0) || 0;
    cell.children = [];
    delete cell.attrs.t;
    if (text === "") return;
    const kind = this.styles.kinds[style] ?? null;
    if (opts.date && (kind === "date" || kind === "datetime")) {
      const serial = isoToSerial(opts.date);
      if (serial !== null) {
        cell.children.push(el("v", {}, [String(serial)]));
        return;
      }
    }
    if (!opts.plainText && NUMBER_RE.test(text) && !this.styles.text[style]) {
      cell.children.push(el("v", {}, [text]));
      return;
    }
    cell.attrs.t = "inlineStr";
    cell.children.push(el("is", {}, [el("t", { "xml:space": "preserve" }, [text])]));
  }

  /** Every cell's words of a row, left to right, the empty left out (what the upload reader takes a line's signature from). */
  rowTexts(r: number): string[] {
    const out: [number, string][] = [];
    const row = this.rows.get(r);
    if (!row) return [];
    for (const c of kids(row, "c")) {
      const col = columnIndex((c.attrs.r ?? "").replace(/\d+$/, ""));
      out.push([col, this.text(r, col)]);
    }
    return out.sort((a, b) => a[0] - b[0]).map(([, t]) => t);
  }

  // ---- rows added

  /**
   * `count` new rows after row `after`, each a copy of row `like` (its height, its cells' styles, its merges within the row),
   * everything below moved down: cells, merges, the conditional formats' and validations' ranges, the hyperlinks, the row
   * breaks, the dimension; the workbook's names and the pictures are moved by the caller (they live in other parts).
   */
  insertRows(after: number, count: number, like: number): void {
    if (count <= 0) return;
    const shiftRef = (ref: string) => ref.replace(/([A-Z]+)(\d+)/g, (_, col: string, row: string) => `${col}${Number(row) > after ? Number(row) + count : Number(row)}`);
    // Rows below, from the bottom up.
    for (const row of kids(this.sheetData, "row")) {
      const r = Number(row.attrs.r);
      if (r <= after) continue;
      row.attrs.r = String(r + count);
      for (const c of kids(row, "c")) {
        c.attrs.r = shiftRef(c.attrs.r ?? "");
        const f = kid(c, "f");
        if (f) {
          if (f.attrs.ref) f.attrs.ref = shiftRef(f.attrs.ref);
          f.children = f.children.map((x) => (typeof x === "string" ? shiftFormula(x, after, count) : x));
        }
      }
    }
    // The new rows, copies of `like`.
    const source = this.rows.get(like);
    const anchor = this.rows.get(after) ?? source;
    let at = anchor ? this.sheetData.children.indexOf(anchor) + 1 : this.sheetData.children.length;
    for (let i = 1; i <= count; i++) {
      const r = after + i;
      const row = source ? clone(source) : el("row", {});
      row.attrs.r = String(r);
      if (row.attrs.spans) delete row.attrs.spans;
      for (const c of kids(row, "c")) {
        const col = (c.attrs.r ?? "").replace(/\d+$/, "");
        c.attrs.r = `${col}${r}`;
        c.children = [];
        delete c.attrs.t;
      }
      this.sheetData.children.splice(at++, 0, row);
    }
    // Merges.
    const mc = kid(this.root, "mergeCells");
    if (mc) {
      const added: XmlElement[] = [];
      for (const m of kids(mc, "mergeCell")) {
        const g = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(m.attrs.ref ?? "");
        if (!g) continue;
        const r1 = Number(g[2]);
        const r2 = Number(g[4]);
        if (r1 === like && r2 === like) for (let i = 1; i <= count; i++) added.push(el("mergeCell", { ref: `${g[1]}${after + i}:${g[3]}${after + i}` }));
        if (r1 > after) m.attrs.ref = `${g[1]}${r1 + count}:${g[3]}${r2 + count}`;
        else if (r2 > after) m.attrs.ref = `${g[1]}${r1}:${g[3]}${r2 + count}`;
      }
      mc.children.push(...added);
      mc.attrs.count = String(kids(mc, "mergeCell").length);
    }
    // Ranges on the sheet.
    for (const local of ["conditionalFormatting", "dataValidation", "hyperlink", "selection"]) {
      for (const e of all(this.root, local)) {
        for (const a of ["sqref", "ref"]) if (e.attrs[a]) e.attrs[a] = e.attrs[a].split(/\s+/).map(shiftRef).join(" ");
      }
    }
    for (const brk of all(this.root, "brk")) {
      if (all(this.root, "rowBreaks").some((rb) => rb.children.includes(brk)) && Number(brk.attrs.id) > after) brk.attrs.id = String(Number(brk.attrs.id) + count);
    }
    const dim = kid(this.root, "dimension");
    if (dim?.attrs.ref) dim.attrs.ref = shiftRef(dim.attrs.ref);
    this.index();
  }
}

/** A formula's cell references below row `after` moved down by `count` (references in quotes left alone). */
function shiftFormula(f: string, after: number, count: number): string {
  return f
    .split(/("[^"]*")/)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/(\$?[A-Z]{1,3})(\$?)(\d+)(?![\d(])/g, (_, col: string, dollar: string, row: string) => `${col}${dollar}${Number(row) > after ? Number(row) + count : Number(row)}`)))
    .join("");
}

// ---------------------------------------------------------------------------------------------------------------------
// placing

const isBound = (c: Cell | undefined): boolean => !!c?.parts?.some((p) => p.bind);

/** The words a paper's foot starts with, under a grid: where its rows end. */
const FOOT_RE = /^(checked|verified|approved|prepared|reviewed|remarks?|note|cleaning (done|verified) by|signature|sign of)\b/i;

/** "Education — Required": the group heading and the column's own, as DCRS writes a heading of two rows in one. */
function headingParts(h: string): { full: string; group: string; sub: string } {
  const at = h.lastIndexOf(" — ");
  return at === -1 ? { full: h, group: "", sub: h } : { full: h, group: h.slice(0, at).trim(), sub: h.slice(at + 3).trim() };
}

/** Each bound value of a cell with the fixed words before it (since the last value) and after it (to the next). */
function boundPieces(parts: ExportSegment[] | undefined): { bind: ExportBinding; pre: string; post: string }[] {
  const out: { bind: ExportBinding; pre: string; post: string }[] = [];
  if (!parts) return out;
  let words = "";
  let last: { bind: ExportBinding; pre: string; post: string } | null = null;
  for (const p of parts) {
    if (p.bind) {
      if (last) last.post = words;
      last = { bind: p.bind, pre: words, post: "" };
      out.push(last);
      words = "";
    } else words += p.text;
  }
  if (last) last.post = words;
  return out;
}

const MAX_MAPPED_TEXT = 30000;

/** A value written into a cell: the words around it in the cell, and its binding(s). */
interface Written {
  r: number;
  c: number;
  pieces: { bind: ExportBinding; pre: string; post: string }[];
  /** The line's own fixed words (its Sr. No., its parameter) and their column, to find it again after a sort. */
  anchor?: { col: number; text: string; grid: number };
}

/** Where a box's value goes: its own cell, after its label in the label's cell, or (a choice) on the paper's options. */
interface FieldPlace {
  field: ModelField;
  r: number;
  c: number;
  pre: string;
  post: string;
  mode: "cell" | "same" | "choice";
  /** A choice: the paper's options on the label's line (their cells and words). */
  options?: { c: number; text: string }[];
}

/** A box whose value is one of a few printed words (LOT STATUS, Yes / No): its options' words. */
export function choiceWords(cell: Cell): string[] {
  const bind = cell.bind ?? cell.parts?.find((p) => p.bind)?.bind;
  if (!bind) return [];
  if (bind.type === "yesno") return ["Yes", "No"];
  if (bind.type === "select" && bind.options?.length) return bind.options.map((o) => o.label || o.value);
  return [];
}

interface GridPlace {
  grid: ModelGrid;
  gridNo: number;
  headingRow: number;
  /** DCRS column -> sheet column (0-based). */
  colOf: Map<number, number>;
  /** The paper's body rows under the heading (1-based), in order. */
  body: number[];
  /** DCRS body line index -> sheet row. */
  rowOf: Map<number, number>;
  /** Lines that found no row: added after the last body row. */
  extra: number[];
  /** The first row after the grid (its foot), or undefined when the grid runs to the sheet's end. */
  next?: number;
  fixedGrid: boolean;
}

export interface XlsxFillOptions {
  envelope?: RoundTripEnvelope;
  /** The sheet that is this document (the template keeps only it; the first visible otherwise). */
  sheet?: string;
  hints?: FillHints;
  /** The company's one name (COMPANY.name). */
  company: string;
}

export async function fillXlsx(template: ArrayBuffer, blocks: ExportBlock[], opts: XlsxFillOptions): Promise<{ bytes: Uint8Array<ArrayBuffer>; report: FillReport }> {
  const report = emptyReport("xlsx");
  const pkg = await Pkg.open(template);
  const workbook = pkg.xml("xl/workbook.xml");
  if (!workbook) throw new Error("not a workbook");
  const wbRels = pkg.relsOf("xl/workbook.xml").tree;
  const sheetsEl = kid(workbook, "sheets");
  if (!sheetsEl) throw new Error("no sheets");
  const sheetEls = kids(sheetsEl, "sheet");
  const target = sheetEls.find((s) => opts.sheet && s.attrs.name === opts.sheet) ?? sheetEls.find((s) => !s.attrs.state || s.attrs.state === "visible") ?? sheetEls[0];
  if (!target) throw new Error("no sheet");
  const rid = attrOf(target, "id") ?? "";
  const rel = kids(wbRels, "Relationship").find((r) => r.attrs.Id === rid);
  if (!rel) throw new Error("no sheet part");
  const sheetPath = resolvePath("xl/", rel.attrs.Target ?? "");
  const sheetName = target.attrs.name ?? "Sheet1";
  const sst = pkg.xml("xl/sharedStrings.xml");
  const shared = sst ? kids(sst, "si").map(itemText) : [];
  const styles = new Styles(pkg.xml("xl/styles.xml"));
  const root = pkg.xml(sheetPath);
  if (!root) throw new Error("no sheet xml");
  const sheet = new XSheet(root, shared, styles);
  const model = modelOf(blocks);
  const labels = labelsOf(model);
  const hints = opts.hints ?? {};

  // Cells taken by something already: a grid's heading or body, a box's label or value.
  const taken = new Set<number>();
  const maxRow = sheet.maxRow();
  const maxCol = sheet.maxCol();
  const masters = (from = 1, to = maxRow): { r: number; c: number; text: string }[] => {
    const out: { r: number; c: number; text: string }[] = [];
    for (let r = from; r <= to; r++) for (let c = 0; c <= maxCol; c++) if (!sheet.covered(r, c)) {
      const text = sheet.text(r, c);
      if (text.trim()) out.push({ r, c, text });
    }
    return out;
  };
  const all1 = masters();

  // ---- grids
  const places: GridPlace[] = [];
  model.grids.forEach((grid, gridNo) => {
    if (hints.skipGrids?.includes(gridNo)) return;
    const place = placeGrid(sheet, grid, gridNo, all1, taken, labels, model, hints.headingRow?.[gridNo]);
    if (place) places.push(place);
  });
  const firstHeading = places.length ? Math.min(...places.map((p) => p.headingRow)) : maxRow + 1;

  // ---- boxes
  const fieldPlaces: FieldPlace[] = [];
  for (const field of model.fields) {
    if (!isBound(field.cell)) continue;
    if (hints.notOnPaper?.some((l) => same(l, field.label))) {
      report.leftOut.push(field.label);
      continue;
    }
    const at = placeField(sheet, field, all1, taken, labels);
    if (!at) {
      report.notPlaced.push(field.label || field.cell.text);
      continue;
    }
    fieldPlaces.push(at);
  }

  // ---- the header band, the company's name, the title, the fixed lines (words only)
  const ownNumber = findOwnFormatNo(sheet, all1, firstHeading, taken);
  const dcrsFormat = bandValue(model, "formatNo");
  const dcrsRev = bandValue(model, "revNo");
  const dcrsRevDate = bandValue(model, "revDate");
  const dcrsPage = bandValue(model, "page");
  const textEdits: { r: number; c: number; text: string }[] = [];
  const blanks: { r: number; c: number }[] = [];
  for (const m of all1) {
    if (taken.has(key(m.r, m.c))) continue;
    let text = m.text;
    // The company's one name (REQUIREMENTS §95).
    if (COMPANY_RE.test(text)) text = text.replace(COMPANY_RE, opts.company);
    // The format's own number, revision and date, wherever the paper prints them (its head, its foot).
    if (ownNumber && dcrsFormat && norm(text).includes(norm(ownNumber))) {
      text = replaceFormat(text, ownNumber, dcrsFormat, dcrsRev, dcrsRevDate);
    }
    // A band cell by its label: "Rev. no. - 00", "Effective date : 16.02.2022", "Page No. : 1 Of 1", "Date: ...".
    if (m.r < firstHeading) {
      const band = bandEdit(text, { formatNo: dcrsFormat, revNo: dcrsRev, revDate: dcrsRevDate, page: dcrsPage });
      if (band === null) {
        blanks.push({ r: m.r, c: m.c });
        report.dateCellsBlanked++;
        // A label alone: its value is the next cell.
        const right = nextMaster(sheet, m.r, m.c, maxCol);
        if (right !== null && !taken.has(key(m.r, right))) blanks.push({ r: m.r, c: right });
        continue;
      }
      if (band !== undefined) text = band;
    }
    if (text !== m.text) {
      textEdits.push({ r: m.r, c: m.c, text });
      report.replaced.push(`${columnName(m.c)}${m.r}: ${m.text.slice(0, 40)} -> ${text.slice(0, 40)}`);
    }
  }
  // The title, where the plant changed it: the cell reading most like DCRS's title, above the first grid.
  if (model.title) {
    let best: { r: number; c: number; text: string; s: number } | null = null;
    for (const m of all1) {
      if (m.r >= firstHeading || taken.has(key(m.r, m.c))) continue;
      const s = similarity(m.text, model.title);
      if (s > 0.6 && (!best || s > best.s)) best = { ...m, s };
    }
    if (best && !same(best.text, model.title) && !textEdits.some((e) => e.r === best!.r && e.c === best!.c)) {
      textEdits.push({ r: best.r, c: best.c, text: model.title });
      report.replaced.push(`${columnName(best.c)}${best.r}: title -> ${model.title.slice(0, 40)}`);
    }
  }

  // ---- rows added where a grid has more lines than the paper has rows (from the bottom up, so the rows above stay put)
  const pictures = drawingParts(pkg, sheetPath);
  for (const place of [...places].sort((a, b) => b.headingRow - a.headingRow)) {
    if (place.extra.length === 0) continue;
    const last = place.body.length ? place.body[place.body.length - 1] : place.headingRow;
    const like = place.body.length ? place.body[place.body.length - 1] : place.headingRow;
    const count = place.extra.length;
    sheet.insertRows(last, count, like);
    shiftNames(workbook, sheetName, last, count);
    for (const d of pictures) shiftDrawing(pkg, d, last, count);
    // Everything recorded below moves down.
    const down = (r: number) => (r > last ? r + count : r);
    for (const p of places) {
      if (p === place) continue;
      p.headingRow = down(p.headingRow);
      p.body = p.body.map(down);
      for (const [i, r] of p.rowOf) p.rowOf.set(i, down(r));
      if (p.next !== undefined) p.next = down(p.next);
    }
    for (const f of fieldPlaces) f.r = down(f.r);
    for (const e of textEdits) e.r = down(e.r);
    for (const b of blanks) b.r = down(b.r);
    if (place.next !== undefined) place.next = down(place.next);
    place.extra.forEach((line, i) => {
      place.rowOf.set(line, last + 1 + i);
      place.body.push(last + 1 + i);
    });
  }

  // ---- clear what the owner wrote as an example (REQUIREMENTS §98): the grid bodies, the boxes' values
  for (const place of places) {
    const cols = Array.from(new Set(place.colOf.values())).sort((a, b) => a - b);
    const boundCols = new Set<number>();
    place.grid.rows.slice(place.grid.headerRows).forEach((row) => row.forEach((cell, ci) => isBound(cell) && place.colOf.has(ci) && boundCols.add(place.colOf.get(ci)!)));
    const lo = cols[0] ?? 0;
    const hi = cols[cols.length - 1] ?? 0;
    const printed = printedWords(place.grid);
    for (const r of place.body) {
      for (let c = lo; c <= hi; c++) {
        if (sheet.covered(r, c)) continue;
        // A grid of printed lines (parameters) keeps its printed words where DCRS has no line; its readings are cleared.
        if (place.fixedGrid && !boundCols.has(c) && !Array.from(place.rowOf.values()).includes(r)) continue;
        // Words the grid's lines print themselves (an entry's second line's heading, a parameter) stay printed.
        if (printed.has(norm(sheet.text(r, c)))) continue;
        if (sheet.clear(r, c)) report.cleared++;
      }
    }
  }
  for (const f of fieldPlaces) {
    if (f.mode === "cell" && sheet.clear(f.r, f.c)) report.cleared++;
  }
  for (const b of blanks) sheet.clear(b.r, b.c);
  for (const e of textEdits) sheet.write(e.r, e.c, e.text, { plainText: true });

  // ---- write DCRS's values
  const written: Written[] = [];
  const writeCell = (r: number, c: number, cell: Cell, pre = "", post = "", anchor?: Written["anchor"]) => {
    const pieces = boundPieces(cell.parts).filter((p) => p.bind.text.length <= MAX_MAPPED_TEXT);
    const text = `${pre}${cell.text}${post}`;
    const plain = !pre && !post && pieces.length === 1 && !pieces[0].pre && !pieces[0].post;
    sheet.write(r, c, text, { date: plain ? cell.date : undefined, plainText: !plain });
    if (pieces.length) {
      const all = pieces.map((p, i) => ({ bind: p.bind, pre: i === 0 ? pre + p.pre : p.pre, post: i === pieces.length - 1 ? p.post + post : p.post }));
      written.push({ r, c, pieces: all, anchor });
      report.placed += pieces.length;
    }
  };
  for (const f of fieldPlaces) {
    if (f.mode === "same") {
      const head = f.pre;
      writeCell(f.r, f.c, f.field.cell, head, f.post);
    } else if (f.mode === "choice") {
      // The chosen word marked (and bound), the others boxed; nothing chosen: the value after the label, empty.
      const chosen = f.options!.find((o) => same(o.text, f.field.cell.text));
      for (const o of f.options!) {
        if (o === chosen) writeCell(f.r, o.c, f.field.cell, "☑ ");
        else sheet.write(f.r, o.c, `☐ ${o.text}`, { plainText: true });
      }
      if (!chosen) writeCell(f.r, f.c, f.field.cell, f.pre);
    } else writeCell(f.r, f.c, f.field.cell);
  }
  const tables: { place: GridPlace; bind: ExportTableBinding }[] = [];
  for (const place of places) {
    const body = place.grid.rows.slice(place.grid.headerRows);
    // Each line's own fixed words, when no other line of the grid has the same: found again after a sort (exportMap anchor).
    const anchors = body.map((row) => {
      if (!row.some(isBound)) return null;
      const ci = row.findIndex((c) => !isBound(c) && c.text.trim() !== "");
      return ci === -1 || !place.colOf.has(ci) ? null : { col: place.colOf.get(ci)!, text: row[ci].text, grid: place.gridNo };
    });
    const seen = new Map<string, number>();
    for (const a of anchors) if (a) seen.set(rowSignature([a.text]), (seen.get(rowSignature([a.text])) ?? 0) + 1);
    body.forEach((row, i) => {
      const r = place.rowOf.get(i);
      if (r === undefined) {
        for (const cell of row) for (const p of boundPieces(cell.parts)) report.notPlaced.push(p.bind.label ?? p.bind.path);
        return;
      }
      const a = anchors[i];
      const anchor = a && seen.get(rowSignature([a.text])) === 1 ? a : undefined;
      row.forEach((cell, ci) => {
        const c = place.colOf.get(ci);
        if (c === undefined) {
          for (const p of boundPieces(cell.parts)) report.notPlaced.push(p.bind.label ?? p.bind.path);
          return;
        }
        const at = sheet.covered(r, c) ? sheet.mergeOf(r, c)! : { r1: r, c1: c };
        if (isBound(cell)) writeCell(at.r1, at.c1, cell, "", "", anchor);
        else if (cell.text.trim() && !same(sheet.text(at.r1, at.c1), cell.text)) sheet.write(at.r1, at.c1, cell.text, { plainText: true });
      });
    });
    report.grids.push({ rows: body.length, paperRows: place.body.length - place.extra.length, added: place.extra.length, where: `${columnName(Math.min(...place.colOf.values()))}${place.headingRow}` });
    if (place.grid.bindTable) {
      const columns = place.grid.bindTable.columns.filter((col) => place.colOf.has(col.col)).map((col) => ({ ...col, col: place.colOf.get(col.col)! }));
      tables.push({ place, bind: { ...place.grid.bindTable, columns } });
    }
  }

  // ---- formulas: a cached result of the owner's example is not kept; Excel works it out again on opening
  let formulas = false;
  for (const c of all(sheet.sheetData, "c")) {
    const f = kid(c, "f");
    if (!f) continue;
    formulas = true;
    c.children = c.children.filter((x) => typeof x === "string" || x.local !== "v");
    if (c.attrs.t === "str" || c.attrs.t === "e" || c.attrs.t === "b") delete c.attrs.t;
  }
  pkg.remove("xl/calcChain.xml");
  pkg.removeContentType("/xl/calcChain.xml");
  for (const r of kids(wbRels, "Relationship")) if ((r.attrs.Type ?? "").endsWith("/calcChain")) wbRels.children.splice(wbRels.children.indexOf(r), 1);
  if (formulas) {
    let calc = kid(workbook, "calcPr");
    if (!calc) {
      calc = el("calcPr", {});
      const defined = kid(workbook, "definedNames");
      const after = defined ?? sheetsEl;
      workbook.children.splice(workbook.children.indexOf(after) + 1, 0, calc);
    }
    calc.attrs.fullCalcOnLoad = "1";
  }

  // ---- the map (REQUIREMENTS §81)
  if (opts.envelope) writeMap(pkg, workbook, wbRels, sheet, sheetName, written, tables, opts.envelope);
  sheet.index();
  return { bytes: pkg.build(), report };
}

// ---------------------------------------------------------------------------------------------------------------------

function resolvePath(dir: string, target: string): string {
  const t = target.replace(/\\/g, "/");
  const joined = t.startsWith("/") ? t.slice(1) : dir + t;
  const out: string[] = [];
  for (const seg of joined.split("/")) {
    if (seg === "..") out.pop();
    else if (seg !== "." && seg !== "") out.push(seg);
  }
  return out.join("/");
}

function nextMaster(sheet: XSheet, r: number, c: number, maxCol: number): number | null {
  const m = sheet.mergeOf(r, c);
  const from = m ? m.c2 + 1 : c + 1;
  for (let x = from; x <= maxCol; x++) if (!sheet.covered(r, x)) return x;
  return null;
}

function belowMaster(sheet: XSheet, r: number, c: number): number | null {
  const m = sheet.mergeOf(r, c);
  const down = m ? m.r2 + 1 : r + 1;
  return sheet.covered(down, c) ? null : down;
}

/** The paper's own format number: the first one written above the grids (or anywhere outside them). */
function findOwnFormatNo(sheet: XSheet, cells: { r: number; c: number; text: string }[], firstHeading: number, taken: Set<number>): string | null {
  const free = cells.filter((m) => !taken.has(key(m.r, m.c)));
  const top = free.filter((m) => m.r < firstHeading);
  for (const m of [...top, ...free]) {
    const f = FORMAT_NO_RE.exec(m.text);
    if (f) return f[0];
  }
  void sheet;
  return null;
}

/** The paper's format number, revision and date in a cell, as DCRS has them now ("F/QC/16 (00/01.12.2021)"). */
export function replaceFormat(text: string, own: string, formatNo: string, revNo: string, revDate: string): string {
  const at = norm(text).indexOf(norm(own));
  if (at === -1) return text;
  const m = FORMAT_NO_RE.exec(text);
  if (!m) return text;
  let out = text.slice(0, m.index) + formatNo + text.slice(m.index + m[0].length);
  const after = out.slice(m.index + formatNo.length);
  const rev = REVISION_AFTER_RE.exec(after);
  if (rev && rev.index < 4 && (revNo || revDate)) {
    const date = revDate ? (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(rev[2]) || /\./.test(rev[2]) ? dotted(revDate) : revDate) : rev[2];
    const sep = /\(\s*\d+(\s*[/-]\s*)/.exec(rev[0])?.[1] ?? "/";
    const replaced = rev[0].replace(/\(\s*\d{1,2}\s*[/-]\s*[\d./-]+\s*\)/, `(${revNo || rev[1]}${sep}${date})`);
    out = out.slice(0, m.index + formatNo.length) + after.slice(0, rev.index) + replaced + after.slice(rev.index + rev[0].length);
  }
  return out;
}

/**
 * A header-band cell by its label, as DCRS has it now: "Rev. no. - 00" -> "Rev. no. - 01"; "Page No. : 1 Of 1" kept as
 * DCRS's page; the record's own "Date" -> null (blanked, REQUIREMENTS §117), unless the date it holds is the revision's.
 * undefined when the cell is no band cell.
 */
export function bandEdit(text: string, dcrs: { formatNo: string; revNo: string; revDate: string; page: string }): string | null | undefined {
  // "Label <sep> value" or "Label" alone.
  const m = /^\s*([A-Za-z][A-Za-z .]*?)\s*(?:[:\-–=]+\s*)+(.*)$/s.exec(text) ?? /^\s*([A-Za-z][A-Za-z .]*?)\s*$/.exec(text);
  if (!m) return undefined;
  const word = bandWordOf(m[1]);
  if (!word) return undefined;
  const rest = (m[2] ?? "").trim();
  const head = text.slice(0, text.length - (m[2] ?? "").length);
  if (word === "date") {
    const iso = isoOf(rest);
    if (iso && dcrs.revDate && iso === isoOf(dcrs.revDate)) return head + (/\./.test(rest) ? dotted(dcrs.revDate) : dcrs.revDate);
    return null;
  }
  const value = word === "formatNo" ? dcrs.formatNo : word === "revNo" ? dcrs.revNo : word === "revDate" ? (/\./.test(rest) ? dotted(dcrs.revDate) : dcrs.revDate) : dcrs.page;
  if (!value) return undefined;
  if (word === "page") return undefined;
  // A format number already there was brought to DCRS's with its revision (replaceFormat); anything else is not the band's.
  if (word === "formatNo" && rest && !isBlankish(rest)) return undefined;
  if (rest === value) return text;
  // "Format No.:" with nothing after it: one space before the value.
  return /\S$/.test(head) ? `${head} ${value}` : head + value;
}

// ---- a grid

function headingTexts(grid: ModelGrid): string[] {
  const width = Math.max(0, ...grid.rows.map((r) => r.length));
  const heads: string[] = [];
  const hr = grid.headerRows > 0 ? grid.headerRows : 0;
  for (let c = 0; c < width; c++) {
    let t = "";
    for (let r = hr - 1; r >= 0 && !t; r--) t = (grid.rows[r]?.[c]?.text ?? "").split("\n")[0].trim();
    heads.push(t);
  }
  return heads;
}

function placeGrid(
  sheet: XSheet,
  grid: ModelGrid,
  gridNo: number,
  cells: { r: number; c: number; text: string }[],
  taken: Set<number>,
  labels: Set<string>,
  model: DcrsModel,
  headingHint?: number
): GridPlace | null {
  if (grid.headerRows === 0) return null;
  const heads = headingTexts(grid);
  const named = heads.map((h, i) => ({ h, i })).filter((x) => x.h);
  if (named.length < 2) return null;
  // The row of the paper where most of the headings stand (a heading of two rows: the lower row, the upper read too).
  const byRow = new Map<number, { r: number; c: number; text: string }[]>();
  for (const m of cells) {
    if (taken.has(key(m.r, m.c))) continue;
    const list = byRow.get(m.r) ?? [];
    list.push(m);
    byRow.set(m.r, list);
  }
  // A heading of two rows written as one ("Education — Required") is read as the paper writes it: "Required" under "Education".
  const depth = Math.max(2, Math.min(3, grid.headerRows + 1));
  const score = (t: string, h: string) => (isSerialHeading(h) && isSerialHeading(t) ? 1 : same(t.split("\n")[0], h) || same(t, h) ? 1 : similarity(t, h));
  const groupAbove = (r: number, c: number, group: string) => {
    for (let rr = r - 1; rr >= Math.max(1, r - 3); rr--) {
      const m = sheet.mergeOf(rr, c);
      const t = m ? sheet.text(m.r1, m.c1) : sheet.text(rr, c);
      if (t && score(t, group) >= 0.72) return true;
    }
    return false;
  };
  const matchIn = (rows: number[], h: string, used: Set<number>) => {
    const { full, group, sub } = headingParts(h);
    let best: { r: number; c: number; s: number } | null = null;
    for (const r of rows)
      for (const m of byRow.get(r) ?? []) {
        if (used.has(key(m.r, m.c))) continue;
        let s = score(m.text, full);
        if (group) {
          const subS = score(m.text, sub);
          if (subS >= 0.72) s = Math.max(s, groupAbove(m.r, m.c, group) ? subS : subS * 0.8);
        }
        if (s >= 0.72 && (!best || s > best.s)) best = { r: m.r, c: m.c, s };
      }
    return best;
  };
  let bestRow = -1;
  let bestScore = 0;
  const candidates = headingHint ? [headingHint] : Array.from(byRow.keys()).sort((a, b) => a - b);
  for (const r of candidates) {
    const rows = Array.from({ length: depth + 1 }, (_, k) => r - k).filter((x) => x >= 1);
    const used = new Set<number>();
    let score = 0;
    for (const { h } of named) {
      const hit = matchIn(rows, h, used);
      if (hit) {
        used.add(key(hit.r, hit.c));
        score += hit.s;
      }
    }
    if (score > bestScore + 1e-9) {
      bestScore = score;
      bestRow = r;
    }
  }
  if (bestRow < 0 || bestScore < Math.max(1.5, named.length * 0.45)) return null;
  // Columns: each heading's cell (the lowest of a heading of two rows).
  const rows = Array.from({ length: depth + 1 }, (_, k) => bestRow - k).filter((x) => x >= 1);
  const colOf = new Map<number, number>();
  const used = new Set<number>();
  // The deepest headings first (they name the columns), then the ones above.
  for (const { h, i } of named) {
    const hit = matchIn([bestRow], h, used) ?? matchIn(rows, h, used);
    if (hit && !Array.from(colOf.values()).includes(hit.c)) {
      colOf.set(i, hit.c);
      used.add(key(hit.r, hit.c));
    }
  }
  // A column with no heading of its own (or none matched) between two that matched: the paper's column between them.
  const width = heads.length;
  for (let i = 0; i < width; i++) {
    if (colOf.has(i)) continue;
    const left = [...colOf.keys()].filter((k) => k < i).sort((a, b) => b - a)[0];
    const right = [...colOf.keys()].filter((k) => k > i).sort((a, b) => a - b)[0];
    if (left !== undefined && right !== undefined) {
      const span = colOf.get(right)! - colOf.get(left)!;
      const want = colOf.get(left)! + Math.round((span * (i - left)) / (right - left));
      if (want > colOf.get(left)! && want < colOf.get(right)! && !Array.from(colOf.values()).includes(want)) colOf.set(i, want);
    } else if (left !== undefined && right === undefined) {
      // After the last matched heading: the next free column of the paper's heading row.
      let want = colOf.get(left)! + (i - left);
      const m = sheet.mergeOf(bestRow, colOf.get(left)!);
      if (m) want = m.c2 + (i - left);
      if (!Array.from(colOf.values()).includes(want) && byRow.get(bestRow)?.some((x) => x.c === want)) colOf.set(i, want);
    }
  }
  for (const k of used) taken.add(k);
  // The body: the rows under the heading (under its merged cells), until a row holding a label of something else, the
  // paper's foot, or the end of the ruled rows.
  let start = bestRow + 1;
  for (const c of colOf.values()) {
    const m = sheet.mergeOf(bestRow, c);
    if (m && m.r2 + 1 > start) start = m.r2 + 1;
  }
  const cols = Array.from(new Set(colOf.values())).sort((a, b) => a - b);
  const stopWords = new Set<string>([...labels]);
  for (const t of model.texts) stopWords.add(norm(t));
  for (const g of model.grids) if (g !== grid) for (const h of headingTexts(g)) if (h) stopWords.add(norm(h));
  const own = new Set(heads.map(norm));
  const body: number[] = [];
  const lastRow = sheet.maxRow();
  const fixedLines = grid.rows.slice(grid.headerRows).filter((row) => fixedKey(row) !== null).length;
  for (let r = start; r <= lastRow + 1 && body.length < 4000; r++) {
    const texts = cols.map((c) => (sheet.covered(r, c) ? "" : sheet.text(r, c)));
    const rowWords = sheet.rowTexts(r);
    // A row of the paper's foot: a label DCRS prints outside this grid, or the words a foot starts with.
    const stop =
      rowWords.some((t) => {
        const n = norm(t);
        return n.length > 2 && stopWords.has(n) && !own.has(n);
      }) || rowWords.some((t) => FOOT_RE.test(t.trim()) && !own.has(norm(t)));
    if (stop) break;
    const ruled = cols.some((c) => sheet.ruled(r, c));
    const any = texts.some((t) => t.trim());
    if (!ruled && !any) break;
    if (r > lastRow && !ruled) break;
    body.push(r);
  }
  const next = body.length ? body[body.length - 1] + 1 : start;
  for (const r of body) for (const c of cols) taken.add(key(r, c));
  // Lines: a fixed line onto the paper's row with the same words; the free lines into the rows left, in order.
  const lines = grid.rows.slice(grid.headerRows);
  const rowOf = new Map<number, number>();
  const usedRows = new Set<number>();
  lines.forEach((row, i) => {
    const k = fixedKey(row);
    if (!k) return;
    const c = colOf.get(k.col);
    if (c === undefined) return;
    let best: { r: number; s: number } | null = null;
    for (const r of body) {
      if (usedRows.has(r)) continue;
      const s = similarity(sheet.text(r, c), k.text);
      if (s >= 0.7 && (!best || s > best.s)) best = { r, s };
    }
    if (best) {
      rowOf.set(i, best.r);
      usedRows.add(best.r);
    }
  });
  const free = body.filter((r) => !usedRows.has(r));
  const extra: number[] = [];
  let f = 0;
  lines.forEach((_, i) => {
    if (rowOf.has(i)) return;
    // A grid whose every line has fixed words keeps the paper's order for the ones not found by them.
    if (f < free.length) rowOf.set(i, free[f++]);
    else extra.push(i);
  });
  return { grid, gridNo, headingRow: bestRow, colOf, body, rowOf, extra, next: next <= lastRow ? next : undefined, fixedGrid: fixedLines > 0 };
}

/** The words a grid's lines print themselves (not a value, not a number): an entry's second line's heading, a parameter. */
function printedWords(grid: ModelGrid): Set<string> {
  const out = new Set<string>();
  for (const row of grid.rows.slice(grid.headerRows))
    for (const c of row) {
      const t = c.text.trim();
      if (!isBound(c) && t && !/^[\d.\s]+$/.test(t)) out.add(norm(t));
    }
  return out;
}

/** A line's fixed words: its longest cell that holds no bound value and is not only a number ("SIZE (mm)"), with its column. */
function fixedKey(row: Cell[]): { col: number; text: string } | null {
  if (!row.some(isBound)) return null;
  let best: { col: number; text: string } | null = null;
  row.forEach((c, col) => {
    if (isBound(c)) return;
    const t = c.text.trim();
    if (!t || /^[\d.\s]+$/.test(t)) return;
    if (!best || t.length > best.text.length) best = { col, text: t };
  });
  return best;
}

// ---- a box

function placeField(
  sheet: XSheet,
  field: ModelField,
  cells: { r: number; c: number; text: string }[],
  taken: Set<number>,
  labels: Set<string>
): FieldPlace | null {
  const label = field.label;
  if (!norm(label)) return null;
  const maxCol0 = sheet.maxCol();
  // "Change requested by — Name": the group's cell, then "Name" after it on its line, then the value after that.
  const { group, sub } = headingParts(label);
  if (group) {
    const g = cells.find((m) => same(m.text, group) || afterLabel(m.text, group) !== null);
    const s = g ? cells.find((m) => m.r === g.r && m.c > g.c && !taken.has(key(m.r, m.c)) && (same(m.text, sub) || same(m.text.replace(/[\s:\-–_.=]+$/, ""), sub))) : undefined;
    if (s) {
      taken.add(key(s.r, s.c));
      const right = nextMaster(sheet, s.r, s.c, maxCol0);
      if (right !== null && !taken.has(key(s.r, right)) && !labels.has(norm(sheet.text(s.r, right)))) {
        taken.add(key(s.r, right));
        return { field, r: s.r, c: right, pre: "", post: "", mode: "cell" };
      }
      return { field, r: s.r, c: s.c, pre: `${s.text.replace(/\s+$/, "")} `, post: "", mode: "same" };
    }
  }
  // The label's cell: its words exactly, else starting with them, else the nearest.
  const exact = cells.filter((m) => !taken.has(key(m.r, m.c)) && (same(m.text, label) || same(m.text.replace(/[\s:\-–_.=]+$/, ""), label)));
  const prefixed = cells.filter((m) => !taken.has(key(m.r, m.c)) && !exact.includes(m) && afterLabel(m.text, label) !== null);
  let hit: (typeof cells)[number] | undefined = exact[0] ?? prefixed[0];
  if (!hit) {
    let best: { m: (typeof cells)[number]; s: number } | null = null;
    for (const m of cells) {
      if (taken.has(key(m.r, m.c)) || m.text.length > label.length * 2.5 + 12) continue;
      const s = similarity(m.text.replace(/[\s:\-–_.=]+$/, ""), label);
      if (s >= 0.8 && (!best || s > best.s)) best = { m, s };
    }
    hit = best?.m;
  }
  if (!hit) {
    // The label inside a cell's words ("PERSONAL COMPETENCE RECORDS ( STAFF MEMBERS ONLY) Reviewed as on 01.10.2026"): the
    // value after it, in the same cell.
    for (const m of cells) {
      if (taken.has(key(m.r, m.c))) continue;
      const inside = labelInside(m.text, label);
      if (inside) {
        taken.add(key(m.r, m.c));
        return { field, r: m.r, c: m.c, pre: inside.head, post: "", mode: "same" };
      }
    }
    return null;
  }
  taken.add(key(hit.r, hit.c));
  const split = afterLabel(hit.text, label);
  const maxCol = sheet.maxCol();
  // A choice printed across the label's line (LOT STATUS | ACCEPTED | REJECT ... | SEGREGATION | ...): marked where it is.
  const words = choiceWords(field.cell);
  if (words.length >= 2) {
    const options: { c: number; text: string }[] = [];
    for (let x = nextMaster(sheet, hit.r, hit.c, maxCol); x !== null && x <= maxCol; x = nextMaster(sheet, hit.r, x, maxCol)) {
      const t = sheet.text(hit.r, x).replace(/^[☐☑☒✓✔□■]\s*/, "");
      if (words.some((w) => same(w, t))) options.push({ c: x, text: t });
      else if (t.trim()) break;
    }
    if (options.length >= 2) {
      for (const o of options) taken.add(key(hit.r, o.c));
      return { field, r: hit.r, c: hit.c, pre: `${hit.text.replace(/\s+$/, "")} `, post: "", mode: "choice", options };
    }
  }
  const isLabel = (t: string) => {
    const n = norm(t.replace(/[\s:\-–_.=]+$/, ""));
    return n.length > 0 && (labels.has(n) || bandWordOf(t.replace(/[\s:\-–_.=]+$/, "")) !== null);
  };
  // "Label : ____" (or the owner's example after the label): the value after the label in the same cell.
  if (split && split.rest.trim() && (isBlankish(split.rest) || !/[\s:\-–=]$/.test(split.head) || true)) {
    const right = nextMaster(sheet, hit.r, hit.c, maxCol);
    const rightEmpty = right !== null && !sheet.text(hit.r, right).trim();
    // A label with a written value after it in its cell, and an empty cell to its right that is not ruled as a box: the cell's own.
    if (!(rightEmpty && right !== null && sheet.ruled(hit.r, right) && isBlankish(split.rest))) {
      const head = /[\s:\-–=]$/.test(split.head) ? split.head : `${split.head} `;
      return { field, r: hit.r, c: hit.c, pre: head, post: "", mode: "same" };
    }
  }
  // The cell after the label, then the one under it.
  const right = nextMaster(sheet, hit.r, hit.c, maxCol);
  if (right !== null && !taken.has(key(hit.r, right)) && !isLabel(sheet.text(hit.r, right))) {
    taken.add(key(hit.r, right));
    return { field, r: hit.r, c: right, pre: "", post: "", mode: "cell" };
  }
  const below = belowMaster(sheet, hit.r, hit.c);
  if (below !== null && !taken.has(key(below, hit.c)) && !isLabel(sheet.text(below, hit.c))) {
    taken.add(key(below, hit.c));
    return { field, r: below, c: hit.c, pre: "", post: "", mode: "cell" };
  }
  // Nowhere else: after the label, in its cell.
  const head = split ? (/[\s:\-–=]$/.test(split.head) ? split.head : `${split.head} `) : `${hit.text.replace(/\s+$/, "")} `;
  return { field, r: hit.r, c: hit.c, pre: head, post: "", mode: "same" };
}

/** A label inside a piece of text (after other words), and the words up to its end and separator. */
export function labelInside(text: string, label: string): { head: string; rest: string } | null {
  const want = norm(label);
  if (want.length < 4) return null;
  const words = text.split(/(\s+)/);
  let at = 0;
  for (let i = 0; i < words.length; i++) {
    if (i > 0 && /\S/.test(words[i])) {
      const split = afterLabel(text.slice(at), label);
      if (split && (split.rest.trim() || want.includes(" ")) && split.rest.length <= 40 && !/[A-Za-z]{4,}\s+[A-Za-z]{4,}\s+[A-Za-z]{4,}/.test(split.rest)) return { head: text.slice(0, at) + split.head, rest: split.rest };
    }
    at += words[i].length;
  }
  return null;
}

// ---- the workbook's names and the pictures, moved with the rows

function shiftNames(workbook: XmlElement, sheetName: string, after: number, count: number): void {
  const defined = kid(workbook, "definedNames");
  if (!defined) return;
  const quoted = sheetName.replace(/'/g, "''");
  for (const d of kids(defined, "definedName")) {
    d.children = d.children.map((x) => {
      if (typeof x !== "string") return x;
      if (!x.includes(sheetName) && !x.includes(quoted)) return x;
      return x.replace(/(\$?[A-Z]{1,3})(\$?)(\d+)/g, (_, col: string, dollar: string, row: string) => `${col}${dollar}${Number(row) > after ? Number(row) + count : Number(row)}`);
    });
  }
}

function drawingParts(pkg: Pkg, sheetPath: string): string[] {
  const rels = pkg.relsOf(sheetPath).tree;
  const dir = sheetPath.slice(0, sheetPath.lastIndexOf("/") + 1);
  return kids(rels, "Relationship")
    .filter((r) => (r.attrs.Type ?? "").endsWith("/drawing"))
    .map((r) => resolvePath(dir, r.attrs.Target ?? ""));
}

function shiftDrawing(pkg: Pkg, part: string, after: number, count: number): void {
  const d = pkg.xml(part);
  if (!d) return;
  // Anchors count rows from 0: a picture whose row is below the added rows moves down with them.
  for (const local of ["from", "to"]) {
    for (const a of all(d, local)) {
      const row = kid(a, "row");
      if (!row) continue;
      const n = Number(textAll(row));
      if (Number.isFinite(n) && n >= after) row.children = [String(n + count)];
    }
  }
}

// ---- the map

function writeMap(pkg: Pkg, workbook: XmlElement, wbRels: XmlElement, sheet: XSheet, sheetName: string, written: Written[], tables: { place: GridPlace; bind: ExportTableBinding }[], envelope: RoundTripEnvelope): void {
  sheet.index();
  const builder = new ExportMapBuilder();
  const quoted = `'${sheetName.replace(/'/g, "''")}'`;
  const names: XmlElement[] = [];
  const nameCell = (name: string, col: number, row: number) => names.push(el("definedName", { name, hidden: "1" }, [`${quoted}!$${columnName(col)}$${row}`]));
  const occupied = new Set<number>();
  for (const w of written) {
    const ref = `${columnName(w.c)}${w.r}`;
    const plain = w.pieces.length === 1 && !w.pieces[0].pre.trim() && !w.pieces[0].post.trim();
    for (const p of w.pieces) {
      const entry = builder.add(p.bind, { ref, ...(plain ? {} : { pre: p.pre, post: p.post }), ...(w.anchor ? { anchor: w.anchor } : {}) });
      nameCell(entryName(entry.i), w.c, w.r);
    }
    occupied.add(w.r);
  }
  for (const { place, bind } of tables) {
    const header = place.headingRow;
    const mine = Array.from(place.rowOf.values());
    const last = mine.length ? Math.max(...mine.filter((r) => written.some((w) => w.r === r)), header) : header;
    const next = place.next;
    // Every row of the grid's place that holds no value of DCRS's and has words (the paper's own, a printed number): not a new line.
    const fixed: string[] = [header, ...place.body].filter((r) => !occupied.has(r)).map((r) => rowSignature(sheet.rowTexts(r))).filter(Boolean);
    const stop = next ?? sheet.maxRow() + 1;
    for (let r = (place.body[place.body.length - 1] ?? header) + 1; r < stop; r++) {
      const sig = rowSignature(sheet.rowTexts(r));
      if (sig && !occupied.has(r)) fixed.push(sig);
    }
    const table = builder.addTable(bind, {
      firstRow: header,
      headerRow: header,
      lastRow: last,
      ...(next !== undefined ? { nextRow: next } : {}),
      ...(fixed.length ? { fixedRows: Array.from(new Set(fixed)) } : {}),
    });
    nameCell(tableName(table.t, "h"), 0, header);
    nameCell(tableName(table.t, "z"), 0, last);
    if (next !== undefined) nameCell(tableName(table.t, "n"), 0, next);
  }
  // The names, beside the workbook's own (after its sheets, before its calculation settings).
  let defined = kid(workbook, "definedNames");
  if (!defined) {
    defined = el("definedNames");
    const before = ["calcPr", "oleSize", "customWorkbookViews", "pivotCaches", "smartTagPr", "smartTagTypes", "webPublishing", "fileRecoveryPr", "webPublishObjects", "extLst"].map((l) => kid(workbook, l)).find(Boolean);
    if (before) workbook.children.splice(workbook.children.indexOf(before), 0, defined);
    else workbook.children.push(defined);
  }
  defined.children.push(...names);
  // The very hidden "_dcrs" sheet.
  const rows = mapSheetRows(envelope, builder.entries, builder.tables);
  const sheetData = el(
    "sheetData",
    {},
    rows.map((r, ri) =>
      el(
        "row",
        { r: String(ri + 1) },
        r.flatMap((text, ci) => (text ? [el("c", { r: `${columnName(ci)}${ri + 1}`, t: "inlineStr" }, [el("is", {}, [el("t", { "xml:space": "preserve" }, [text])])])] : []))
      )
    )
  );
  let n = 1;
  while (pkg.has(`xl/worksheets/sheet${n}.xml`)) n++;
  const part = `xl/worksheets/sheet${n}.xml`;
  pkg.setXml(part, el("worksheet", { xmlns: MAIN, "xmlns:r": REL }, [sheetData]));
  pkg.addContentType(part, "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml");
  const relId = Pkg.freeRelId(wbRels);
  wbRels.children.push(el("Relationship", { Id: relId, Type: `${REL}/worksheet`, Target: `worksheets/sheet${n}.xml` }));
  const sheetsEl = kid(workbook, "sheets")!;
  const ids = kids(sheetsEl, "sheet").map((s) => Number(s.attrs.sheetId) || 0);
  const rPrefix = Object.keys(workbook.attrs).find((k) => workbook.attrs[k] === REL)?.replace(/^xmlns:/, "") ?? "r";
  if (!workbook.attrs[`xmlns:${rPrefix}`]) workbook.attrs["xmlns:r"] = REL;
  sheetsEl.children.push(el("sheet", { name: MAP_SHEET_NAME, sheetId: String(Math.max(0, ...ids) + 1), state: "veryHidden", [`${rPrefix}:id`]: relId }));
  setCustomProperty(pkg, ENVELOPE_PROPERTY, envelopePropertyValue(envelope));
}
