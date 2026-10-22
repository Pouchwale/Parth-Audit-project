// THE OWNER'S OWN WORD FILE, FILLED WITH THE RECORD (REQUIREMENTS §119).
//
// The template is his .doc saved by Word as .docx (scripts/originals/convert.py). The page's blocks are placed INTO it by
// their words, as utils/originalFill/xlsxFill.ts places them in a workbook:
//   the header band  his page header's "Format No.", "Rev No", "Date", "Page No." (and a format number with its revision
//                    anywhere: "Format number: - F/QC/01 (01 / 16.02.2022)") take DCRS's values; the company's name its one
//                    spelling; the header's DATE cell blanked unless it is the revision's date (REQUIREMENTS §117)
//   a box            its label found in a table cell (the value into the next cell, or the one under it) or in a paragraph
//                    ("Date of Change request: ____", the value after the label); a box alone in a frame (a one-cell
//                    table headed by its label) takes its value under the label, in the same cell
//   a grid           the table whose row reads as the grid's headings; each column under its heading; a fixed line (a
//                    parameter) on the row of the same words, the free lines into the rows under the heading, more lines
//                    than rows: the last row copied (w:tr)
// Every value cell is cleared before it is written (REQUIREMENTS §98: the owner's example entries never reach a download).
// The round-trip map goes in as utils/docx.ts writes it: a content control "dcrs:<i>" round each bound value, the map as a
// custom XML part, a captioned table "dcrs:t<t>" for a grid a person may add lines to, the envelope in the custom properties.

import type { Cell, ExportBlock } from "../documentExport";
import { wordText } from "../../engine/roundTrip/readFile";
import { ENVELOPE_PROPERTY, ExportMapBuilder, MAP_XML_NAMESPACE, envelopePropertyValue, mapJson, rowSignature, type ExportBinding, type ExportSegment, type ExportTableBinding, type RoundTripEnvelope } from "../../engine/roundTrip/exportMap";
import { Pkg, setCustomProperty } from "./pkg";
import { el, kid, kids, all, clone, insertAfter, parents, removeChild, type XmlElement, type XmlNode } from "./xml";
import { modelOf, bandValue, labelsOf, numberedGroups, withPaperWords, type DcrsModel, type ModelField, type ModelGrid } from "./model";
import { COMPANY_RE, FORMAT_NO_RE, afterLabel, bandWordOf, headingPrefix, isBlankish, isSerialHeading, norm, same, similarity } from "./text";
import { bandEdit, choiceWords, labelInside, replaceFormat } from "./xlsxFill";
import { emptyReport, type FillHints, type FillReport } from "./types";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NBSP4 = String.fromCharCode(160).repeat(4);
/** The marks a choice is written with: the chosen word ticked, the others boxed. */
const CHECKED = `${String.fromCharCode(0x2611)} `;
const UNCHECKED = `${String.fromCharCode(0x2610)} `;
const TICK = `${String.fromCharCode(0x2714)} `;
const MARKS_RE = new RegExp(`^[${String.fromCharCode(0x2610, 0x2611, 0x2612, 0x2713, 0x2714, 0x25a1, 0x25a0)}]\s*`);

const isBound = (c: Cell | undefined): boolean => !!c?.parts?.some((p) => p.bind);

/** "Change requested by — Name": the group and its own part, as DCRS writes a label under a heading. */
function headingParts(h: string): { full: string; group: string; sub: string } {
  const at = h.lastIndexOf(" — ");
  return at === -1 ? { full: h, group: "", sub: h } : { full: h, group: h.slice(0, at).trim(), sub: h.slice(at + 3).trim() };
}

// ---------------------------------------------------------------------------------------------------------------------
// paragraphs: their words, and changing them in place

interface TextPiece {
  t: XmlElement;
  text: string;
}

/** The w:t pieces of a paragraph in order (inside runs, hyperlinks, insertions, controls; deletions left out). */
function pieces(p: XmlElement): TextPiece[] {
  const out: TextPiece[] = [];
  const walk = (x: XmlElement) => {
    for (const c of x.children) {
      if (typeof c === "string") continue;
      if (c.local === "del" || c.local === "pPr" || c.local === "rPr" || c.local === "sdtPr" || c.local === "drawing" || c.local === "pict") continue;
      if (c.local === "t") out.push({ t: c, text: c.children.map((s) => (typeof s === "string" ? s : "")).join("") });
      else if (c.local === "tab" || c.local === "br" || c.local === "cr") out.push({ t: c, text: c.local === "tab" ? "\t" : "\n" });
      else walk(c);
    }
  };
  walk(p);
  return out;
}

const paraText = (p: XmlElement): string => pieces(p).map((x) => x.text).join("");

/** Replaces the paragraph's words [from, to) with `text`, keeping the first piece's run (its font) and every picture. */
function replaceRange(p: XmlElement, from: number, to: number, text: string): void {
  let at = 0;
  let placed = false;
  for (const piece of pieces(p)) {
    const start = at;
    const end = at + piece.text.length;
    at = end;
    if (end <= from || start >= to) continue;
    if (piece.t.local !== "t") {
      // A tab or a break inside the range goes with the words it stood among.
      piece.t.local = "t";
      piece.t.name = piece.t.name.replace(/(tab|br|cr)$/, "t");
      piece.t.attrs = { "xml:space": "preserve" };
      piece.t.children = [];
      piece.text = "";
    }
    const keepBefore = piece.text.slice(0, Math.max(0, from - start));
    const keepAfter = piece.text.slice(Math.max(0, to - start));
    const mid = placed ? "" : text;
    placed = true;
    setT(piece.t, keepBefore + mid + keepAfter);
  }
  if (!placed && text) appendRun(p, text, firstRunProps(p));
}

function setT(t: XmlElement, text: string): void {
  t.attrs["xml:space"] = "preserve";
  t.children = text ? [text] : [];
}

/** The run properties of a paragraph's first run with words (else of its mark): the paper's own font for what is written. */
function firstRunProps(p: XmlElement): XmlElement | null {
  for (const r of all(p, "r")) {
    if (kid(r, "t")) {
      const rPr = kid(r, "rPr");
      return rPr ? clone(rPr) : null;
    }
  }
  const pPr = kid(p, "pPr");
  const mark = pPr ? kid(pPr, "rPr") : null;
  return mark ? clone(mark) : null;
}

/** A run's properties for a written value: the paper's face, size and colour, not a label's bold, italic or underline. */
function valueProps(rPr: XmlElement | null): XmlElement | null {
  if (!rPr) return null;
  const out = clone(rPr);
  out.children = out.children.filter((c) => typeof c === "string" || !["b", "bCs", "u", "i", "iCs", "caps", "smallCaps", "strike", "dstrike", "vanish", "highlight", "shd", "rStyle"].includes(c.local));
  return out;
}

function runOf(text: string, rPr: XmlElement | null): XmlElement {
  const parts: XmlNode[] = [];
  if (rPr) parts.push(clone(rPr));
  text.split("\n").forEach((line, i) => {
    if (i > 0) parts.push(el("w:br"));
    line.split("\t").forEach((piece, j) => {
      if (j > 0) parts.push(el("w:tab"));
      if (piece) parts.push(el("w:t", { "xml:space": "preserve" }, [piece]));
    });
  });
  return el("w:r", {}, parts);
}

function appendRun(p: XmlElement, text: string, rPr: XmlElement | null): void {
  p.children.push(runOf(text, rPr));
}

/** The run (and its parent) holding the paragraph's words at `pos`, split there: where nodes go to stand at `pos`. */
function splitAt(p: XmlElement, pos: number): { parent: XmlElement; index: number } {
  const parent = new Map<XmlElement, XmlElement>();
  const walk = (x: XmlElement) => {
    for (const c of x.children) {
      if (typeof c === "string") continue;
      parent.set(c, x);
      walk(c);
    }
  };
  walk(p);
  let at = 0;
  for (const piece of pieces(p)) {
    const start = at;
    const end = at + piece.text.length;
    at = end;
    if (pos > end || (pos === end && end !== start)) continue;
    const run = parent.get(piece.t);
    const holder = run ? parent.get(run) : undefined;
    if (!run || !holder || run.local !== "r") break;
    const index = holder.children.indexOf(run);
    const ti0 = run.children.indexOf(piece.t);
    const firstContent = run.children.findIndex((c) => typeof c !== "string" && c.local !== "rPr");
    if (pos <= start && ti0 <= firstContent) return { parent: holder, index };
    if (pos <= start) {
      // The words start inside the run (after its tab or break): the run is split before them.
      const after0 = clone(run);
      const rPr0 = kid(after0, "rPr");
      after0.children = [...(rPr0 ? [rPr0] : []), ...after0.children.slice(ti0)];
      run.children = run.children.slice(0, ti0);
      holder.children.splice(index + 1, 0, after0);
      return { parent: holder, index: index + 1 };
    }
    // Split the run: what is before `pos` stays, the rest goes into a copy after it.
    const k = pos - start;
    const after = clone(run);
    const ti = run.children.indexOf(piece.t);
    const tail = after.children[ti] as XmlElement;
    setT(piece.t, piece.text.slice(0, k));
    setT(tail, piece.text.slice(k));
    run.children = run.children.slice(0, ti + 1);
    const rPr = kid(after, "rPr");
    after.children = [...(rPr ? [rPr] : []), ...after.children.slice(ti)];
    holder.children.splice(index + 1, 0, after);
    return { parent: holder, index: index + 1 };
  }
  return { parent: p, index: p.children.length };
}

function insertAt(p: XmlElement, pos: number, nodes: XmlElement[]): void {
  const { parent, index } = splitAt(p, pos);
  parent.children.splice(index, 0, ...nodes);
}

/** Everything written in a paragraph taken out (its runs, fields, links, controls); its properties and bookmarks kept. */
function emptyParagraph(p: XmlElement): boolean {
  const had = paraText(p).trim() !== "";
  p.children = p.children.filter((c) => typeof c !== "string" && ["pPr", "bookmarkStart", "bookmarkEnd"].includes(c.local));
  return had;
}

/** The words of a paragraph after position `at` taken out (pictures and runs before it kept). */
function cutAfter(p: XmlElement, at: number): boolean {
  const total = paraText(p).length;
  if (at >= total) return false;
  const had = paraText(p).slice(at).trim() !== "";
  replaceRange(p, at, total, "");
  return had;
}

// ---------------------------------------------------------------------------------------------------------------------
// the content controls (REQUIREMENTS §81)

class Controls {
  constructor(
    private builder: ExportMapBuilder | null,
    private report: FillReport
  ) {}
  private next = 900001;

  /**
   * The cell's pieces as runs: the fixed words as words, each bound value in a control tagged "dcrs:<i>". `shown` writes a
   * value the paper's way where it reads back the same (a tick box's Yes as a ticked box).
   */
  runs(cell: Cell, rPr: XmlElement | null, fallbackLabel?: string, shown?: (text: string) => string, keepFace = false): XmlElement[] {
    const parts: ExportSegment[] = cell.parts?.length ? cell.parts : cell.text ? [{ text: cell.text }] : [];
    const out: XmlElement[] = [];
    for (const p of parts) {
      if (!p.bind || !this.builder || p.bind.text.length > 30000) {
        if (p.text) out.push(runOf(shown && p.bind ? shown(p.text) : p.text, rPr));
        continue;
      }
      const entry = this.builder.add(p.bind, { fallbackLabel });
      this.report.placed++;
      out.push(this.control(entry.i, entry.label, shown ? shown(p.bind.text) : p.bind.text, keepFace ? rPr : valueProps(rPr)));
    }
    return out;
  }

  control(i: number, alias: string, text: string, rPr: XmlElement | null): XmlElement {
    const name = alias.replace(/\s+/g, " ").trim().slice(0, 120);
    const pr = el("w:sdtPr", {}, [
      ...(name ? [el("w:alias", { "w:val": name })] : []),
      el("w:tag", { "w:val": `dcrs:${i}` }),
      el("w:id", { "w:val": String(this.next++) }),
      el("w:lock", { "w:val": "sdtLocked" }),
      el("w:text", { "w:multiLine": "1" }),
    ]);
    return el("w:sdt", {}, [pr, el("w:sdtContent", {}, [runOf(text === "" ? NBSP4 : text, rPr)])]);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// tables

interface TCell {
  tc: XmlElement;
  col: number;
  span: number;
  /** A cell continuing the one above it (w:vMerge with no value). */
  cont: boolean;
}

interface TRow {
  tr: XmlElement;
  cells: TCell[];
}

interface Table {
  tbl: XmlElement;
  rows: TRow[];
  index: number;
}

function tableOf(tbl: XmlElement, index: number): Table {
  const rows: TRow[] = [];
  for (const tr of kids(tbl, "tr")) {
    const trPr = kid(tr, "trPr");
    const before = trPr ? kid(trPr, "gridBefore") : null;
    let col = before ? Number(before.attrs["w:val"] ?? 0) || 0 : 0;
    const cells: TCell[] = [];
    for (const tc of kids(tr, "tc")) {
      const tcPr = kid(tc, "tcPr");
      const gs = tcPr ? kid(tcPr, "gridSpan") : null;
      const span = gs ? Math.max(1, Number(gs.attrs["w:val"] ?? 1) || 1) : 1;
      const vm = tcPr ? kid(tcPr, "vMerge") : null;
      const cont = !!vm && (vm.attrs["w:val"] ?? "continue") === "continue";
      cells.push({ tc, col, span, cont });
      col += span;
    }
    rows.push({ tr, cells });
  }
  return { tbl, rows, index };
}

const cellText = (c: TCell): string => wordText(c.tc);

function cellAt(row: TRow, col: number): TCell | undefined {
  return row.cells.find((c) => col >= c.col && col < c.col + c.span);
}

/** A cell's words taken out, every paragraph kept (its height on the paper) but emptied. */
function clearCell(c: TCell): boolean {
  let had = false;
  const ps = kids(c.tc, "p");
  for (const p of ps) if (emptyParagraph(p)) had = true;
  // Nested tables and the like: left as they are (they are the paper's).
  return had;
}

/** The value into a cell: its first paragraph, in the paper's font for that cell. */
function writeCell(c: TCell, cell: Cell, controls: Controls, fallbackLabel?: string): void {
  let p = kids(c.tc, "p")[0];
  if (!p) {
    p = el("w:p");
    c.tc.children.push(p);
  }
  const rPr = firstRunProps(p) ?? cellMarkProps(c.tc);
  emptyParagraph(p);
  p.children.push(...controls.runs(cell, rPr, fallbackLabel));
}

/** A cell whose paragraph Word numbers itself (a numbered list: the paper's "1.", "2." down its Sr. No.). */
function numbered(c: TCell): boolean {
  return kids(c.tc, "p").some((p) => {
    const pPr = kid(p, "pPr");
    return !!pPr && !!kid(pPr, "numPr");
  });
}

function cellMarkProps(tc: XmlElement): XmlElement | null {
  for (const p of kids(tc, "p")) {
    const r = firstRunProps(p);
    if (r) return r;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------

export interface DocxFillOptions {
  envelope?: RoundTripEnvelope;
  hints?: FillHints;
  company: string;
}

export async function fillDocx(template: ArrayBuffer, blocks: ExportBlock[], opts: DocxFillOptions): Promise<{ bytes: Uint8Array<ArrayBuffer>; report: FillReport }> {
  const report = emptyReport("docx");
  const pkg = await Pkg.open(template);
  const docPart = "word/document.xml";
  const doc = pkg.xml(docPart);
  if (!doc) throw new Error("not a Word document");
  const body = kid(doc, "body");
  if (!body) throw new Error("no body");
  const hints = opts.hints ?? {};
  const model = withPaperWords(modelOf(blocks), hints.labelAs);
  const labels = labelsOf(model);
  const builder = opts.envelope ? new ExportMapBuilder() : null;
  const controls = new Controls(builder, report);
  // The owner's further filled copies of the same form (F/HR/07's other positions) are his examples: left out.
  if (hints.cutFromTable !== undefined) cutCopies(body, hints.cutFromTable);
  pageWidth = textWidth(body);

  // The body's tables (every one, nested ones too) and its paragraphs outside tables.
  const tables = all(body, "tbl").map((t, i) => tableOf(t, i));
  // Cells a table draws past the page's right margin (F/HR/11's): never a value's place.
  offCells = new Set(tables.flatMap((t) => t.rows.flatMap((r) => r.cells.filter((c) => offPage(body, t, c)).map((c) => c.tc))));
  const inTable = new Set<XmlElement>();
  for (const t of tables) for (const p of all(t.tbl, "p")) inTable.add(p);
  const paragraphs = all(body, "p").filter((p) => !inTable.has(p));
  const usedCells = new Set<XmlElement>();
  const usedParas = new Set<XmlElement>();

  // ---- the header and footer parts, and the band wherever it is: words only
  const headerParts = pkg.names().filter((n) => /^word\/(header|footer)\d*\.xml$/i.test(n));
  const dcrs = { formatNo: bandValue(model, "formatNo"), revNo: bandValue(model, "revNo"), revDate: bandValue(model, "revDate"), page: bandValue(model, "page") };
  const own = ownFormatNo([...headerParts.map((n) => pkg.xml(n)!).filter(Boolean), doc]);
  const fixWords = (p: XmlElement, inBand: boolean) => {
    const text = paraText(p);
    if (!text.trim()) return;
    let next = text;
    if (COMPANY_RE.test(next)) next = next.replace(COMPANY_RE, opts.company);
    if (own && dcrs.formatNo && norm(next).includes(norm(own))) next = replaceFormat(next, own, dcrs.formatNo, dcrs.revNo, dcrs.revDate);
    if (inBand) {
      const band = bandEdit(next.trim(), dcrs);
      if (band === null) {
        emptyParagraph(p);
        report.dateCellsBlanked++;
        return;
      }
      if (band !== undefined) next = next.replace(next.trim(), band);
    }
    if (next !== text) {
      setParagraphText(p, next);
      report.replaced.push(`${text.trim().slice(0, 40)} -> ${next.trim().slice(0, 40)}`);
    }
  };
  for (const name of headerParts) {
    const part = pkg.xml(name);
    if (!part) continue;
    // A header or footer is the format's band when it carries its number or a "Format No." label; another document's left
    // over in the file (F/QC/01's spare footer of a specification) keeps its own words.
    const words = all(part, "p").map(paraText).join(" ");
    const band = (!!own && norm(words).includes(norm(own))) || /format\s*no/i.test(words);
    const alone = labelsAlone(part);
    for (const p of all(part, "p")) fixWords(p, band && !alone.has(p));
  }

  // ---- grids
  const gridPlaces: GridPlaceW[] = [];
  const keyedPlaces: { grid: ModelGrid; lines: KeyedLine[] }[] = [];
  const cardPlaces: CardPlace[] = [];
  model.grids.forEach((grid, gridNo) => {
    if (hints.skipGrids?.includes(gridNo)) return;
    const rowsHint = hints.gridRows?.[gridNo];
    const place = rowsHint ? placeGridRowsW(tables, grid, gridNo, rowsHint) : placeGridW(tables, grid, gridNo, labels, model, hints.table?.[gridNo], usedCells);
    // A card per line (F/QC/19's tolerance cards), its headings the labels of each card: never rows added to the first card.
    if (place && place.body.length === 0 && grid.rows.length > grid.headerRows && !place.unbound) {
      const cards = placeCardsW(tables, grid, usedCells);
      if (cards) {
        cardPlaces.push(cards);
        for (const t of cards.tables) for (const r of t.rows) for (const c of r.cells) usedCells.add(c.tc);
        return;
      }
    }
    // A heading printed in a table of its own, the lines in the tables after it (F/SYS/12's two pages): each line found by its
    // own words, its values under the heading's columns.
    if (place && place.body.length === 0 && grid.rows.length > grid.headerRows && !place.unbound) {
      for (const r of place.headRows) for (const c of r.cells) usedCells.add(c.tc);
      const keyed = placeKeyedGridW(tables, grid, usedCells);
      // Only rows ruled as the heading is: a cell under each of its columns, apart from the line's own words.
      const boundCols = new Set<number>();
      grid.rows.slice(grid.headerRows).forEach((row) => row.forEach((c, ci) => isBound(c) && place.colOf.has(ci) && boundCols.add(place.colOf.get(ci)!)));
      const ruledAlike = keyed?.every((k) => [...boundCols].every((col) => {
        const c = cellAt(k.row, col);
        return !!c && c !== k.key && !c.cont;
      }));
      if (keyed && ruledAlike && boundCols.size > 0) {
        const found = new Set(keyed.map((k) => k.line));
        place.body = keyed.map((k) => k.row);
        place.rowOf = new Map(keyed.map((k) => [k.line, k.row]));
        // A line the paper does not print: written on a row added after its last.
        place.extra = grid.rows.slice(grid.headerRows).map((_, i) => i).filter((i) => !found.has(i));
        place.fixedGrid = true;
      }
    }
    if (place) {
      gridPlaces.push(place);
      for (const r of [...place.headRows, ...(place.alsoHeads ?? [])]) for (const c of r.cells) usedCells.add(c.tc);
      for (const r of place.body) for (const c of r.cells) usedCells.add(c.tc);
      return;
    }
    // The heading printed in the page's header, on every page (F/STR/02): the lines in the body's table of the same columns.
    const viaHeader = grid.rows.length > grid.headerRows ? placeGridUnderHeaderW(pkg, headerParts, tables, grid, gridNo, labels, model) : null;
    if (viaHeader) {
      gridPlaces.push(viaHeader);
      for (const r of viaHeader.body) for (const c of r.cells) usedCells.add(c.tc);
      return;
    }
    // No heading row of its own on the paper: each line found by its own words (F/HR/04's questions, F/HR/14's conditions).
    const keyed = grid.rows.length > grid.headerRows ? placeKeyedGridW(tables, grid, usedCells) : null;
    if (keyed) {
      keyedPlaces.push({ grid, lines: keyed });
      for (const k of keyed) {
        for (const c of k.row.cells) usedCells.add(c.tc);
        const under = blankRowUnder(k.table, k.row, new Set());
        if (under) for (const c of under.cells) usedCells.add(c.tc);
      }
      return;
    }
    if (grid.rows.length > grid.headerRows && grid.headerRows > 0) report.gridsMissed.push(grid.rows[0]?.map((c) => c.text).filter(Boolean).slice(0, 3).join(" | ") ?? "");
    // A table of the page with no heading row whose values found no place (a page drawn as its paper's table, F/QC/06's
    // certificate): its values are not in the file, which is then not the record - never a file of the owner's words alone.
    else if (grid.headerRows === 0) for (const row of grid.rows) for (const cell of row) for (const part of cell.parts ?? (cell.bind ? [{ text: cell.text, bind: cell.bind }] : [])) if (part.bind) report.notPlaced.push(part.bind.label ?? part.bind.path);
  });

  // ---- boxes DCRS numbers in groups ("Attendance 3 — Name") the paper keeps as a table: placed as its lines
  for (const [i, group] of numberedGroups(model.fields).entries()) {
    const place = placeGridW(tables, group.grid, 1000 + i, labels, model, undefined, usedCells);
    if (!place || place.unbound || place.body.length === 0) continue;
    gridPlaces.push(place);
    for (const r of place.headRows) for (const c of r.cells) usedCells.add(c.tc);
    for (const r of place.body) for (const c of r.cells) usedCells.add(c.tc);
    model.fields = model.fields.filter((f) => !group.fields.includes(f));
  }

  // ---- boxes
  type FieldAt =
    | { field: ModelField; kind: "cell"; cell: TCell }
    | { kind: "after"; field: ModelField; p: XmlElement; at: number; to?: number; example?: boolean }
    | { kind: "under"; field: ModelField; cell: TCell; p: XmlElement }
    | { kind: "choiceCells"; field: ModelField; label: TCell; options: { cell: TCell; text: string }[] }
    | { kind: "choiceIn"; field: ModelField; cell: TCell; words: string[] }
    | { kind: "choiceText"; field: ModelField; p: XmlElement; at: number; occurrences: { p: XmlElement; from: number; to: number; text: string }[] };
  const fieldAts: FieldAt[] = [];
  // Each paragraph's neighbours (the body's own, or a cell's): where a choice's words written on the next lines are found.
  paraSiblings = new Map<XmlElement, XmlElement[]>();
  labelSubs = new Set(model.fields.map((f) => headingParts(f.label)).filter((h) => h.group && norm(h.sub).length >= 4).map((h) => norm(h.sub)));
  lineSpans = new Map<XmlElement, { from: number; to: number }[]>();
  for (const p of paragraphs) paraSiblings.set(p, paragraphs);
  for (const t of tables)
    for (const row of t.rows)
      for (const c of row.cells) {
        const ps = kids(c.tc, "p");
        for (const p of ps) paraSiblings.set(p, ps);
      }
  // The page headers the document shows (not a spare one left in the file): a box the paper prints there (F/DISP/04).
  const shownHeaderParas = shownHeaders(pkg, docPart, body).flatMap((part) => all(part, "p"));
  // A box's group, from its bind's label ("Prepared by · Name"): where the paper has no box of the group's first label, the
  // group's own words are its box - the person's name written at "Prepared By" (F/MKT/05's "Prepared By | Approved By" over
  // their Designation and Sign & Date). Every group's words are then a label, never a value's place.
  const groupOf = (f: ModelField): string | null => {
    const bind = f.cell.bind ?? f.cell.parts?.find((x) => x.bind)?.bind;
    const m = bind?.label ? /^(.+?)\s+·\s+(.+)$/.exec(bind.label) : null;
    return m && same(m[2], f.label) ? m[1].trim() : null;
  };
  const groupLabels = new Set([...labels, ...model.fields.flatMap((f) => groupOf(f) ?? []).map(norm)]);
  for (const field of model.fields) {
    if (!isBound(field.cell)) continue;
    if (hints.notOnPaper?.some((l) => same(l, field.label))) {
      report.leftOut.push(field.label);
      continue;
    }
    const example = Object.entries(hints.exampleOf ?? {}).find(([, l]) => same(l, field.label))?.[0];
    // A signature block printed as lines is looked for first: its labels' line holds the label's words, never its value.
    let at = (example ? exampleAt(field, example, paragraphs, tables) : null) ?? signatureUnder(field, model.fields, paragraphs) ?? (placeFieldW(field, tables, paragraphs, usedCells, usedParas, labels) as FieldAt | null) ?? headerAt(field, shownHeaderParas) ?? choiceCellsAnywhere(field, tables, usedCells);
    const group = at ? null : groupOf(field);
    if (!at && group && model.fields.find((f) => same(groupOf(f) ?? "", group)) === field) at = placeFieldW({ ...field, label: group }, tables, paragraphs, usedCells, usedParas, groupLabels) as FieldAt | null;
    if (!at) {
      // No box on the paper for it: left out of the file, which stays the owner's format (owner, 22-Oct-2026); the record keeps it.
      report.leftOut.push(field.label);
      continue;
    }
    fieldAts.push(at);
  }

  // ---- the band, the company's name, the title and fixed lines in the body (outside the grids and the boxes)
  const firstGridTable = gridPlaces.length ? Math.min(...gridPlaces.map((g) => g.table.index)) : Infinity;
  for (const t of tables) {
    for (const row of t.rows)
      for (const c of row.cells) {
        if (usedCells.has(c.tc)) continue;
        for (const p of kids(c.tc, "p")) if (!usedParas.has(p)) fixWords(p, t.index < firstGridTable && isBandRow(row) && row.cells.some((x) => FORMAT_NO_RE.test(cellText(x)) || /format\s*no/i.test(cellText(x))));
      }
  }
  for (const p of paragraphs) if (!usedParas.has(p)) fixWords(p, false);
  if (model.title) {
    let best: { p: XmlElement; s: number } | null = null;
    const candidates = [...headerParts.flatMap((n) => all(pkg.xml(n)!, "p")), ...paragraphs, ...tables.filter((t) => t.index < firstGridTable).flatMap((t) => all(t.tbl, "p"))];
    for (const p of candidates) {
      // A line holding a box's value (F/DISP/04's header "... RECORD [ Vehicle number: ]") keeps its words.
      if (usedParas.has(p) || lineSpans.has(p)) continue;
      const s = similarity(paraText(p), model.title);
      if (s > 0.6 && (!best || s > best.s)) best = { p, s };
    }
    // The paper printing the title already, word for word (on a line that also holds a box, F/DISP/04's header): no other
    // line takes it ("Protocol for Cleaning ..." stays).
    const printed = candidates.some((p) => norm(paraText(p)).startsWith(norm(model.title)));
    if (best && !printed && !same(paraText(best.p), model.title)) {
      report.replaced.push(`title -> ${model.title.slice(0, 40)}`);
      setParagraphText(best.p, model.title);
    }
  }

  // ---- rows added where a grid has more lines than the paper's table has rows
  for (const place of gridPlaces) {
    if (place.extra.length === 0) continue;
    const last = place.body[place.body.length - 1] ?? place.headRows[place.headRows.length - 1];
    // The table the last row stands in (a grid whose lines run on in the tables after its heading's).
    const holder = tables.find((t) => t.tbl.children.includes(last.tr))?.tbl ?? place.table.tbl;
    let after = last.tr;
    for (const line of place.extra) {
      const copy = clone(last.tr);
      insertAfter(holder, after, copy);
      after = copy;
      const row = tableOf(el("w:tbl", {}, [copy]), -1).rows[0];
      // vMerge restarts copied as continuations would join the rows: the copy starts its own.
      for (const c of row.cells) clearCell(c);
      place.rowOf.set(line, row);
      place.body.push(row);
    }
  }

  // ---- a choice a grid's line answers where the paper prints its words ("Yes / No" in the cell, or one word to a cell): the
  // paper's words are kept and the answer marked on them
  const spots = new Map<string, ChoiceSpot>();
  const keepCells = new Set<XmlElement>();
  gridPlaces.forEach((place, pi) => {
    if (place.unbound) return;
    const cols = [...place.colOf.values()];
    place.grid.rows.slice(place.grid.headerRows).forEach((row, i) => {
      const r = place.rowOf.get(i);
      if (!r || place.extra.includes(i)) return;
      row.forEach((cell, ci) => {
        const col = place.colOf.get(ci);
        if (col === undefined || !isBound(cell)) return;
        const spot = choiceSpot(r, col, cell, Math.min(Infinity, ...cols.filter((x) => x > col)) - 1);
        if (!spot) return;
        spots.set(`${pi}:${i}:${ci}`, spot);
        for (const c of spot.cells) keepCells.add(c.tc);
      });
    });
  });

  // ---- clear the owner's example entries (REQUIREMENTS §98), then write
  for (const place of gridPlaces) {
    if (place.unbound === "keep") continue;
    const boundCols = new Set<number>();
    place.grid.rows.slice(place.grid.headerRows).forEach((row) => row.forEach((cell, ci) => isBound(cell) && place.colOf.has(ci) && boundCols.add(place.colOf.get(ci)!)));
    const placedRows = new Set(Array.from(place.rowOf.values()));
    const printed = printedWords(place.grid);
    for (const row of place.body) {
      const mappedCols = new Set(place.colOf.values());
      for (const c of row.cells) {
        if (c.cont || keepCells.has(c.tc)) continue;
        // The paper's own numbering in a column DCRS writes nothing into (F/SYS/12's team list "1" to "6") stays.
        if (!mappedCols.has(c.col) && /^\s*\d{1,3}\.?\s*$/.test(cellText(c))) continue;
        if (place.fixedGrid && !placedRows.has(row) && !boundCols.has(c.col)) continue;
        // Words the grid's lines print themselves ("Deviation %" under each of F/QC/12's weeks) stay printed.
        if (printed.has(norm(cellText(c)))) continue;
        if (place.fixedGrid && !boundCols.has(c.col)) continue;
        if (clearCell(c)) report.cleared++;
      }
    }
  }
  for (const f of fieldAts) {
    if (f.kind === "cell" && clearCell(f.cell)) report.cleared++;
  }

  // Two choices on one line (F/SYS/11's "Actions Found ... CPAR ..."): the right one marked first, the left one's places kept.
  const choiceSlots = fieldAts.map((f, i) => (f.kind === "choiceText" ? i : -1)).filter((i) => i >= 0);
  const firstOnLine = new Map<XmlElement, number>();
  for (const i of choiceSlots) {
    const f = fieldAts[i] as Extract<FieldAt, { kind: "choiceText" }>;
    if (!firstOnLine.has(f.p)) firstOnLine.set(f.p, i);
  }
  const choicesInOrder = choiceSlots
    .map((i) => fieldAts[i] as Extract<FieldAt, { kind: "choiceText" }>)
    .sort((a, b) => firstOnLine.get(a.p)! - firstOnLine.get(b.p)! || b.at - a.at);
  const writeOrder = [...fieldAts];
  choiceSlots.forEach((slot, k) => (writeOrder[slot] = choicesInOrder[k]));
  for (const f of writeOrder) {
    if (f.kind === "cell") writeCell(f.cell, f.field.cell, controls, f.field.label);
    else if (f.kind === "choiceCells") {
      // The chosen word marked and bound, the others boxed (LOT STATUS | ACCEPTED | REJECT ... ); none: the value after the label.
      const chosen = f.options.find((o) => same(o.text, f.field.cell.text));
      for (const o of f.options) {
        const p = kids(o.cell.tc, "p")[0];
        if (!p) continue;
        const rPr = firstRunProps(p);
        if (o === chosen) {
          emptyParagraph(p);
          p.children.push(runOf(CHECKED, rPr), ...controls.runs(f.field.cell, rPr, f.field.label));
        } else insertAt(p, paraText(p).length - paraText(p).replace(/^\s+/, "").length, [runOf(UNCHECKED, rPr)]);
      }
      if (!chosen) {
        const p = kids(f.label.tc, "p").find((x) => paraText(x).trim()) ?? kids(f.label.tc, "p")[0];
        if (p) p.children.push(runOf(" ", firstRunProps(p)), ...controls.runs(f.field.cell, firstRunProps(p), f.field.label));
      }
    } else if (f.kind === "choiceText") {
      const chosen = f.occurrences.find((o) => same(o.text, f.field.cell.text));
      // The paper's own boxes (a symbol, a drawn shape) before its choices: ours are not added; the chosen one is ticked.
      const ownBoxes = f.occurrences.some((o) => all(o.p, "sym").length + all(o.p, "pict").length + all(o.p, "drawing").length + all(o.p, "AlternateContent").length > 0);
      // From the last to the first, so the positions before stay where they are.
      for (const o of [...f.occurrences].reverse()) {
        const rPr = firstRunProps(o.p);
        if (o === chosen) {
          replaceRange(o.p, o.from, o.to, "");
          insertAt(o.p, o.from, [runOf(ownBoxes ? TICK : CHECKED, rPr), ...controls.runs(f.field.cell, rPr, f.field.label)]);
        } else if (!ownBoxes) insertAt(o.p, o.from, [runOf(UNCHECKED, rPr)]);
      }
      if (!chosen) {
        // Nothing chosen: the value's place after the label - at the end of its line when the choices are written on it.
        const onLine = f.occurrences.some((o) => o.p === f.p);
        const at = onLine ? paraText(f.p).length : f.at;
        insertAt(f.p, at, [runOf(" ", firstRunProps(f.p)), ...controls.runs(f.field.cell, firstRunProps(f.p), f.field.label)]);
      }
    } else if (f.kind === "after") {
      // Written with the others of its line, from the right (below).
      continue;
    } else if (f.kind === "choiceIn") {
      markChoiceInCell(f.cell, f.field.cell, f.words, controls, f.field.label);
    } else {
      // Under the label, in the same frame: the paragraphs after the label's emptied, the value in the first of them.
      const ps = kids(f.cell.tc, "p");
      const at = ps.indexOf(f.p);
      for (const p of ps.slice(at + 1)) if (emptyParagraph(p)) report.cleared++;
      let target = ps[at + 1];
      if (!target) {
        target = el("w:p", {}, kid(f.p, "pPr") ? [clone(kid(f.p, "pPr")!)] : []);
        insertAfter(f.cell.tc, f.p, target);
      }
      target.children.push(...controls.runs(f.field.cell, firstRunProps(f.p), f.field.label));
    }
  }
  // Values after their labels, line by line, from the right so the places on the left stay where they are: the region's blank
  // ("____") or the owner's example taken out, its tabs kept, the value right after the label.
  const afters = fieldAts.filter((f): f is Extract<FieldAt, { kind: "after" }> => f.kind === "after");
  const byLine = new Map<XmlElement, Extract<FieldAt, { kind: "after" }>[]>();
  for (const f of afters) byLine.set(f.p, [...(byLine.get(f.p) ?? []), f]);
  for (const [p, fs] of byLine) {
    for (const f of [...fs].sort((a, b) => b.at - a.at)) {
      const text = paraText(p);
      const to = Math.min(f.to ?? text.length, text.length);
      const region = text.slice(f.at, to);
      const lead = region.length - region.replace(/^\s+/, "").length;
      const tail = region.length - region.replace(/\s+$/, "").length;
      const middle = region.slice(lead, region.length - tail);
      const value = f.field.cell.text.trim();
      // An empty value keeps the paper's blank to write on ("Signed: ________"); a written one takes its place.
      const keepBlank = !value && middle !== "" && isBlankish(middle);
      // The value takes the place of the owner's example or of the blank ("Position -> Executive", "Signed: ____"), after the
      // paper's own spacing and marks; with nothing there it goes right after the label.
      const tookPlace = middle !== "" && !keepBlank;
      // In place of the owner's example the value keeps the example's own face (F/QC/29's bold "PSL Analysis Report").
      const face = f.example && tookPlace ? runPropsAt(p, f.at + lead) : null;
      if (tookPlace) {
        if (/[^_.\s]/.test(middle)) report.cleared++;
        replaceRange(p, f.at + lead, to - tail, "");
      }
      // The tabs that spaced an empty box out go as the value takes their room, so the line's next label keeps its place
      // ("NAME:<tabs>DESIGNATION:"); after the line's last box they are only filler and all go.
      if (value && !tookPlace) {
        const room = paraText(p).slice(f.at, f.at + lead);
        const tabs = Array.from(room).map((ch, i) => (ch === "\t" ? f.at + i : -1)).filter((i) => i >= 0);
        const drop = to >= text.length ? tabs.length : Math.min(tabs.length - 1, Math.ceil((value.length + 1) / 8));
        for (const i of tabs.slice(0, Math.max(0, drop)).reverse()) replaceRange(p, i, i + 1, "");
        // A blank of spaces before a closing bracket ("Vehicle number:      ]"): as many go as the value takes.
        if (!tabs.length && /^ {4,}$/.test(room) && /[\])]/.test(text[to] ?? "")) replaceRange(p, f.at, f.at + room.length - 1, "");
      }
      const rPr = face ?? firstRunProps(p);
      const spaced = (tookPlace && lead > 0) || /\s$/.test(paraText(p).slice(0, f.at));
      insertAt(p, tookPlace ? f.at + lead : f.at, [...(spaced ? [] : [runOf(" ", valueProps(rPr))]), ...controls.runs(f.field.cell, rPr, f.field.label, undefined, !!face)]);
    }
  }
  const tableBinds: { place: GridPlaceW; bind: ExportTableBinding }[] = [];
  for (const [pi, place] of gridPlaces.entries()) {
    const lines = place.grid.rows.slice(place.grid.headerRows);
    const heads = headingTexts(place.grid);
    // The line's remarks column, where a value of a column the paper does not print is written (as a person would).
    const remarkCi = [...place.colOf.keys()].find((ci) => /remark|comment|observation/i.test(heads[ci] ?? ""));
    lines.forEach((row, i) => {
      const r = place.rowOf.get(i);
      if (!r) {
        for (const cell of row) for (const p of cell.parts ?? []) if (p.bind) report.notPlaced.push(p.bind.label ?? p.bind.path);
        return;
      }
      const spare: { cell: Cell; heading: string }[] = [];
      row.forEach((cell, ci) => {
        const col = place.colOf.get(ci);
        const target = col === undefined ? undefined : cellAt(r, col);
        if ((!target || target.cont) && isBound(cell) && remarkCi !== undefined && cellAt(r, place.colOf.get(remarkCi)!)) {
          spare.push({ cell, heading: heads[ci] || "" });
          return;
        }
        if (!target || target.cont) {
          for (const p of cell.parts ?? []) if (p.bind) report.notPlaced.push(p.bind.label ?? p.bind.path);
          return;
        }
        const spot = spots.get(`${pi}:${i}:${ci}`);
        if (spot?.kind === "in") markChoiceInCell(spot.cells[0], cell, spot.words, controls, undefined);
        else if (spot) markChoiceCells(spot.cells, cell, controls, undefined, spot.cells[0]);
        else if (isBound(cell)) writeCell(target, cell, controls);
        else if (/^\d+\.?$/.test(cell.text.trim()) && numbered(target)) return;
        // DCRS's fixed words replace the paper's only where they are an edit of them: a paper worded otherwise, or in
        // another language (F/DISP/02's Gujarati checklist), keeps its own.
        else if (cell.text.trim() && !same(cellText(target), cell.text) && (!cellText(target).trim() || similarity(cellText(target), cell.text) >= 0.5)) writeCell(target, cell, controls);
      });
      // A value of the line with no cell of its own on the paper: left out (owner, 22-Oct-2026), never written into another cell.
      for (const x of spare) report.leftOut.push(`${x.heading} (line ${i + 1})`);
    });
    report.grids.push({ rows: lines.length, paperRows: place.body.length - place.extra.length, added: place.extra.length, where: `table ${place.table.index + 1}` });
    if (place.grid.bindTable) {
      const columns = place.grid.bindTable.columns.filter((c) => place.colOf.has(c.col)).map((c) => ({ ...c, col: place.colOf.get(c.col)! }));
      tableBinds.push({ place, bind: { ...place.grid.bindTable, columns } });
    }
  }

  // ---- the grids printed as a card per line: each line's values beside its card's labels, the cards no line takes blanked
  for (const cp of cardPlaces) {
    cp.lines.forEach((at, k) => {
      for (const [ci, target] of at) {
        clearCell(target);
        const cell = cp.grid.rows[cp.grid.headerRows + k][ci];
        if (cell) writeCell(target, cell, controls);
      }
    });
    for (const c of cp.spare) if (clearCell(c)) report.cleared++;
    const heads = headingTexts(cp.grid);
    cp.grid.rows.slice(cp.grid.headerRows + cp.lines.length).forEach((row, k) => row.forEach((c, ci) => isBound(c) && report.leftOut.push(`${heads[ci] || "value"} (line ${cp.lines.length + k + 1})`)));
    report.grids.push({ rows: cp.grid.rows.length - cp.grid.headerRows, paperRows: cp.tables.length, added: 0, where: "a card per line" });
  }

  // ---- the grids found by their lines' own words, and the boxes the paper has no place for
  const keyedRows = new Set<XmlElement>();
  for (const { grid, lines } of keyedPlaces) {
    for (const k of lines) writeKeyedLine(body, k, grid, controls, report, keyedRows);
    // A line the paper does not print (F/PUR/02's second "Specification suitability" under section 6 when the paper numbers
    // it otherwise): a row like the line's before it, added right after it, the line's own words in it.
    const found = new Map(lines.map((k) => [k.line, k]));
    const afterRow = new Map<XmlElement, XmlElement>();
    let added = 0;
    grid.rows.slice(grid.headerRows).forEach((row, i) => {
      if (found.has(i) || !row.some(isBound)) return;
      const prev = [...lines].reverse().find((k) => k.line < i) ?? lines[0];
      const holder = prev ? tables.find((t) => t.tbl.children.includes(prev.row.tr))?.tbl : undefined;
      const own = prev?.dcrsCol !== undefined ? row[prev.dcrsCol]?.text.trim() : "";
      const key = own ? { text: own } : fixedKey(row);
      if (!prev || !holder || !key) {
        for (const cell of row) for (const p of cell.parts ?? []) if (p.bind) report.notPlaced.push(p.bind.label ?? p.bind.path);
        return;
      }
      const copy = clone(prev.row.tr);
      const at = afterRow.get(prev.row.tr) ?? prev.row.tr;
      if (prev.line < i) insertAfter(holder, at, copy);
      else holder.children.splice(holder.children.indexOf(prev.row.tr), 0, copy);
      afterRow.set(prev.row.tr, copy);
      const newRow = tableOf(el("w:tbl", {}, [copy]), -1).rows[0];
      for (const c of newRow.cells) clearCell(c);
      const keyCell = cellAt(newRow, prev.key.col);
      if (!keyCell) return;
      writeCell(keyCell, { text: key.text }, controls);
      writeKeyedLine(body, { line: i, table: prev.table, row: newRow, key: keyCell, rowKeys: [keyCell.col] }, grid, controls, report, keyedRows);
      added++;
    });
    report.grids.push({ rows: grid.rows.length - grid.headerRows, paperRows: lines.length, added, where: "by the lines' own words" });
  }

  endWithoutBlankPage(body);

  // ---- the map (REQUIREMENTS §81)
  // A file kept in an older Word's compatibility mode (below Word 2010's 14) refuses a table caption.
  const settings = pkg.xml("word/settings.xml");
  const mode = settings ? all(settings, "compatSetting").find((c) => (c.attrs["w:name"] ?? c.attrs.name) === "compatibilityMode") : undefined;
  const oldWord = !mode || Number(mode.attrs["w:val"] ?? mode.attrs.val ?? 0) < 14;
  if (builder && opts.envelope) {
    for (const { place, bind } of tableBinds) {
      // Every row of the table holding no control: the paper's own words, never a new line when the file comes back.
      const headerRows = place.table.rows.indexOf(place.headRows[place.headRows.length - 1]) + 1;
      const all1 = tableOf(place.table.tbl, place.table.index);
      const fixed: string[] = [];
      for (const row of all1.rows) {
        if (all(row.tr, "sdt").length) continue;
        const texts: string[] = [];
        for (const c of row.cells) texts[c.col] = cellText(c);
        const sig = rowSignature(Array.from(texts, (t) => t ?? ""));
        if (sig) fixed.push(sig);
      }
      const table = builder.addTable(bind, { headerRows: Math.max(0, headerRows), ...(fixed.length ? { fixedRows: Array.from(new Set(fixed)) } : {}) });
      if (oldWord) {
        // Word 2003's compatibility mode (the owner's .doc files converted): a hidden bookmark in the table's first cell.
        const firstP = all(place.table.tbl, "p")[0];
        if (firstP) {
          const id = String(990000 + table.t);
          const at = firstP.children.findIndex((c) => typeof c !== "string" && c.local !== "pPr");
          const marks = [el("w:bookmarkStart", { "w:id": id, "w:name": `_dcrs_t${table.t}` }), el("w:bookmarkEnd", { "w:id": id })];
          if (at === -1) firstP.children.push(...marks);
          else firstP.children.splice(at, 0, ...marks);
        }
        continue;
      }
      let tblPr = kid(place.table.tbl, "tblPr");
      if (!tblPr) {
        tblPr = el("w:tblPr");
        place.table.tbl.children.unshift(tblPr);
      }
      tblPr.children = tblPr.children.filter((c) => typeof c === "string" || c.local !== "tblCaption");
      // tblCaption comes after the table's look and layout settings (its place in CT_TblPr).
      const after = ["tblLook", "tblCellMar", "tblLayout", "shd", "tblBorders", "tblInd", "tblCellSpacing", "jc", "tblW", "tblStyleColBandSize", "tblStyleRowBandSize", "bidiVisual", "tblOverlap", "tblpPr", "tblStyle"].map((l) => kid(tblPr!, l)).find(Boolean);
      const caption = el("w:tblCaption", { "w:val": `dcrs:t${table.t}` });
      if (after) insertAfter(tblPr, after, caption);
      else tblPr.children.push(caption);
      // tblDescription, when there is one, must follow the caption.
      const desc = kid(tblPr, "tblDescription");
      if (desc) {
        removeChild(tblPr, desc);
        insertAfter(tblPr, caption, desc);
      }
    }
    const json = mapJson(opts.envelope, builder.entries, builder.tables);
    let n = 1;
    while (pkg.has(`customXml/item${n}.xml`)) n++;
    pkg.setXml(`customXml/item${n}.xml`, el("dcrsMap", { xmlns: MAP_XML_NAMESPACE }, [json]));
    pkg.setXml(
      `customXml/itemProps${n}.xml`,
      el("ds:datastoreItem", { "ds:itemID": guid(), "xmlns:ds": "http://schemas.openxmlformats.org/officeDocument/2006/customXml" }, [el("ds:schemaRefs", {}, [el("ds:schemaRef", { "ds:uri": MAP_XML_NAMESPACE })])])
    );
    pkg.setXml(
      `customXml/_rels/item${n}.xml.rels`,
      el("Relationships", { xmlns: "http://schemas.openxmlformats.org/package/2006/relationships" }, [el("Relationship", { Id: "rId1", Type: `${R_NS}/customXmlProps`, Target: `itemProps${n}.xml` })])
    );
    pkg.addContentType(`customXml/itemProps${n}.xml`, "application/vnd.openxmlformats-officedocument.customXmlProperties+xml");
    const rels = pkg.relsOf(docPart).tree;
    rels.children.push(el("Relationship", { Id: Pkg.freeRelId(rels), Type: `${R_NS}/customXml`, Target: `../customXml/item${n}.xml` }));
    setCustomProperty(pkg, ENVELOPE_PROPERTY, envelopePropertyValue(opts.envelope));
  }
  void W_NS;
  return { bytes: pkg.build(), report };
}

/** The blank lines given the roles' line's places for the names (each role there is replaced by its name when written). */
const namesFromRoles = new WeakSet<XmlElement>();

/** The properties of the run that holds a paragraph's character at `at` (before its words are taken out). */
function runPropsAt(p: XmlElement, at: number): XmlElement | null {
  // Counted as paraText counts: a word's letters, a tab or a break one each; deletions left out.
  let pos = 0;
  const walk = (x: XmlElement): XmlElement | null | undefined => {
    for (const c of x.children) {
      if (typeof c === "string" || ["del", "pPr", "rPr", "sdtPr", "drawing", "pict"].includes(c.local)) continue;
      if (c.local !== "r") {
        const found = walk(c);
        if (found !== undefined) return found;
        continue;
      }
      let len = 0;
      for (const k of c.children) if (typeof k !== "string") len += k.local === "t" ? k.children.map((t) => (typeof t === "string" ? t : "")).join("").length : ["tab", "br", "cr"].includes(k.local) ? 1 : 0;
      if (len > 0 && at < pos + len) {
        const rPr = kid(c, "rPr");
        return rPr ? clone(rPr) : null;
      }
      pos += len;
    }
    return undefined;
  };
  return walk(p) ?? null;
}

/** A box's label as its words and its role in brackets ("Testing By (QA Executive)"). */
function labelAndRole(label: string): { base: string; role: string } | null {
  const m = /^(.*?\S)\s*\(([^()]+)\)\s*$/.exec(label);
  return m ? { base: m[1], role: m[2] } : null;
}

/**
 * A signature block printed as lines (F/QC/29's analysis reports): the labels on one line ("Testing By   Approved By"), the
 * names under them on a line below (his example "Karan ... Kapila"), the roles under those ("(QA Executive)  (QA Manager)").
 * DCRS's box "Testing By (QA Executive)" is the label and the role: its value takes the place of the name under its label -
 * the k-th name on the names line for the line's k-th label - and the owner's example name is gone (REQUIREMENTS §98).
 */
function signatureUnder(field: ModelField, fields: ModelField[], paragraphs: XmlElement[]): { kind: "after"; field: ModelField; p: XmlElement; at: number; to: number } | null {
  // The role from the box's label, or from its binding's ("Testing By" on the page, bound as "Testing By (QA Executive)").
  const roleOf = (f: ModelField) => labelAndRole(f.label) ?? labelAndRole((f.cell.bind ?? f.cell.parts?.find((x) => x.bind)?.bind)?.label ?? "");
  const own = roleOf(field);
  if (!own || !isBound(field.cell)) return null;
  const all1 = fields.map(roleOf).filter((x): x is { base: string; role: string } => !!x);
  for (let i = 0; i < paragraphs.length; i++) {
    const text = paraText(paragraphs[i]);
    const hit = findWords(text, own.base, 0);
    if (!hit) continue;
    const onLine = all1.map((x) => findWords(text, x.base, 0)).filter((x): x is { from: number; to: number } => !!x).sort((a, b) => a.from - b.from);
    const k = onLine.findIndex((x) => x.from === hit.from);
    if (k < 0 || onLine.length < 2) continue;
    // The names: the next line with words on it, as many groups of words (two spaces or a tab apart) as the labels; the roles'
    // line under it names this box's role.
    const groupsOf = (t: string) => [...t.matchAll(/\S+(?: \S+)*/g)].map((m) => ({ from: m.index ?? 0, to: (m.index ?? 0) + m[0].length }));
    for (let j = i + 1; j < Math.min(paragraphs.length, i + 4); j++) {
      const t = paraText(paragraphs[j]);
      if (!t.trim()) continue;
      const groups = groupsOf(t);
      // The blank line a fellow box of the line filled already with the roles' places (below): this box's place on it.
      if (namesFromRoles.has(paragraphs[j]) && groups.length === onLine.length) return { kind: "after", field, p: paragraphs[j], at: groups[k].from, to: groups[k].to };
      if (groups.length === onLine.length && t.includes("(") && findWords(t, own.role, 0) !== null) {
        // No names printed: the roles straight under the labels, a blank line between (F/QC/29's utility test report). The
        // names go on that blank line, each where its role is printed under it (the roles' line's own tabs and spaces).
        const blank = paragraphs.slice(i + 1, j).reverse().find((q) => !paraText(q).trim() && !all(q, "drawing").length && !all(q, "pict").length);
        if (!blank) break;
        if (!namesFromRoles.has(blank)) {
          // Its empty runs give way to the roles' line's own runs (their tabs and spaces), each role then replaced by its name.
          blank.children = blank.children.filter((c) => typeof c === "string" || c.local === "pPr");
          for (const c of paragraphs[j].children) if (typeof c !== "string" && c.local !== "pPr") blank.children.push(clone(c));
        }
        namesFromRoles.add(blank);
        const copied = groupsOf(paraText(blank));
        if (copied.length !== onLine.length) break;
        return { kind: "after", field, p: blank, at: copied[k].from, to: copied[k].to };
      }
      if (groups.length !== onLine.length || t.includes("(")) break;
      const roles = paragraphs.slice(j + 1, j + 4).map(paraText).find((r) => r.trim());
      if (!roles || findWords(roles, own.role, 0) === null) break;
      return { kind: "after", field, p: paragraphs[j], at: groups[k].from, to: groups[k].to };
    }
  }
  return null;
}

/** A child put in its place among an element's children, by the schema's order (the children named in `before` follow it). */
function putInOrder(parent: XmlElement, child: XmlElement, before: string[]): void {
  const same = parent.children.findIndex((c) => typeof c !== "string" && c.local === child.local);
  if (same !== -1) {
    parent.children[same] = child;
    return;
  }
  const at = parent.children.findIndex((c) => typeof c !== "string" && before.includes(c.local));
  if (at === -1) parent.children.push(child);
  else parent.children.splice(at, 0, child);
}

// CT_PPrBase after w:spacing, and CT_ParaRPr / CT_RPr after w:sz and w:szCs (the order Word reads them in).
const AFTER_SPACING = ["ind", "contextualSpacing", "mirrorIndents", "suppressOverlap", "jc", "textDirection", "textAlignment", "textboxTightWrap", "outlineLvl", "divId", "cnfStyle", "rPr", "sectPr", "pPrChange"];
const AFTER_SZ = ["highlight", "u", "effect", "bdr", "shd", "fitText", "vertAlign", "rtl", "cs", "em", "lang", "eastAsianLayout", "specVanish", "oMath"];

/** A run's properties (or a paragraph mark's) at one point high. */
function onePoint(rPr: XmlElement): void {
  putInOrder(rPr, el("w:sz", { "w:val": "2" }), ["szCs", ...AFTER_SZ]);
  putInOrder(rPr, el("w:szCs", { "w:val": "2" }), AFTER_SZ);
}

/**
 * The empty lines after the document's last words or table take no room on the paper (REQUIREMENTS §119, A4, 22-Oct-2026):
 * a record's longer values or added lines push them past the page's foot, and a sheet printed with nothing on it but the
 * page's header is no page of his paper (F/HR/11's third page, F/QC/05's and F/QC/18's second). Each stays where it is,
 * empty, one point high with no space around it; nothing on the pages before changes.
 */
function endWithoutBlankPage(body: XmlElement): void {
  const nodes = body.children.filter((c): c is XmlElement => typeof c !== "string");
  for (let i = nodes.length - 1; i >= 0; i--) {
    const p = nodes[i];
    if (p.local === "sectPr") continue;
    if (p.local !== "p" || paraText(p).trim()) break;
    // Anything a run prints or marks (a picture, a field, a break, a tab character: not the paragraph's own tab stops).
    if (["drawing", "pict", "object", "fldChar", "instrText", "br", "tab", "sym"].some((l) => kids(p, "r").some((r) => all(r, l).length > 0))) break;
    if (["sdt", "bookmarkStart", "hyperlink", "fldSimple"].some((l) => all(p, l).length > 0)) break;
    let pPr = kid(p, "pPr");
    if (pPr && (kid(pPr, "sectPr") || kid(pPr, "pageBreakBefore") || kid(pPr, "framePr"))) break;
    if (!pPr) {
      pPr = el("w:pPr");
      p.children.unshift(pPr);
    }
    putInOrder(pPr, el("w:spacing", { "w:before": "0", "w:beforeAutospacing": "0", "w:after": "0", "w:afterAutospacing": "0", "w:line": "20", "w:lineRule": "exact" }), AFTER_SPACING);
    let mark = kid(pPr, "rPr");
    if (!mark) {
      mark = el("w:rPr");
      putInOrder(pPr, mark, ["sectPr", "pPrChange"]);
    }
    onePoint(mark);
    for (const r of kids(p, "r")) {
      let rPr = kid(r, "rPr");
      if (!rPr) {
        rPr = el("w:rPr");
        r.children.unshift(rPr);
      }
      onePoint(rPr);
    }
  }
}

/**
 * A paragraph's words set to `text`: only the words that differ are replaced, so the rest keeps its own runs (F/DISP/01's
 * bold company name followed by plain words stays so); pictures and fields kept where they were.
 */
function setParagraphText(p: XmlElement, text: string): void {
  const old = paraText(p);
  let a = 0;
  while (a < old.length && a < text.length && old[a] === text[a]) a++;
  let b = 0;
  while (b < old.length - a && b < text.length - a && old[old.length - 1 - b] === text[text.length - 1 - b]) b++;
  // Words only added: the change takes in the letter before them (or after), so it lands in that letter's run, in place.
  if (a === old.length - b && a > 0) a--;
  else if (a === old.length - b && b > 0) b--;
  replaceRange(p, a, old.length - b, text.slice(a, text.length - b));
}

function guid(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
  return `{${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}}`;
}

function ownFormatNo(parts: XmlElement[]): string | null {
  for (const part of parts) {
    for (const p of all(part, "p")) {
      const m = FORMAT_NO_RE.exec(paraText(p));
      if (m) return m[0];
    }
  }
  return null;
}

/** The paragraphs of a band label alone in its cell whose value the next cell prints ("Document no. | F/PUR/01"). */
function labelsAlone(part: XmlElement): Set<XmlElement> {
  const out = new Set<XmlElement>();
  for (const tbl of all(part, "tbl")) {
    for (const row of tableOf(tbl, -1).rows) {
      row.cells.forEach((c, i) => {
        const t = cellText(c).replace(/[\s:\-–=]+$/, "").trim();
        const next = row.cells[i + 1];
        // The next cell holds the value, not the band's next label ("Format No.: | Rev No: 00" keeps its value in its own cell).
        const nextLabel = next ? /^\s*([A-Za-z][A-Za-z .]*?)\s*(?:[:\-–=]|$)/.exec(cellText(next)) : null;
        if (t && bandWordOf(t) !== null && next && cellText(next).trim() && !(nextLabel && bandWordOf(nextLabel[1]) !== null)) for (const p of kids(c.tc, "p")) out.add(p);
      });
    }
  }
  return out;
}

/** A row of the band: a cell reading "Format No", "Rev No", "Page" or "Date" in it. */
function isBandRow(row: TRow): boolean {
  return row.cells.some((c) => {
    const t = cellText(c).trim();
    const m = /^\s*([A-Za-z][A-Za-z .]*?)\s*(?:[:\-–=]|$)/.exec(t);
    const w = m ? bandWordOf(m[1]) : null;
    return w === "formatNo" || w === "revNo" || w === "page" || w === "revDate";
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// a grid

interface GridPlaceW {
  grid: ModelGrid;
  gridNo: number;
  table: Table;
  headRows: TRow[];
  /** DCRS column -> the table's grid column. */
  colOf: Map<number, number>;
  body: TRow[];
  rowOf: Map<number, TRow>;
  extra: number[];
  fixedGrid: boolean;
  /** A grid holding no value of the record: its paper's grid kept as it is ("keep"), or only cleared of the example ("blank"). */
  unbound?: "keep" | "blank";
  /** The heading rows of the tables the grid runs on in (F/HR/06's pages): the paper's words, no other box's place. */
  alsoHeads?: TRow[];
}

function headingTexts(grid: ModelGrid): string[] {
  const width = Math.max(0, ...grid.rows.map((r) => r.length));
  const heads: string[] = [];
  for (let c = 0; c < width; c++) {
    let t = "";
    for (let r = grid.headerRows - 1; r >= 0 && !t; r--) t = (grid.rows[r]?.[c]?.text ?? "").split("\n")[0].trim();
    heads.push(t);
  }
  return heads;
}

const FOOT_RE = /^(checked|verified|approved|prepared|reviewed|remarks?|note|signature|sign of)\b/i;

/** The words a grid's lines print themselves (not a value, not a number): "Deviation %", a parameter's name. */
export function printedWords(grid: ModelGrid): Set<string> {
  const out = new Set<string>();
  for (const row of grid.rows.slice(grid.headerRows))
    for (const c of row) {
      const t = c.text.trim();
      if (!isBound(c) && t && !/^[\d.\s]+$/.test(t)) out.add(norm(t));
    }
  return out;
}

/**
 * A grid of the page that holds no value of the record (a fixed list, or "No findings added." on a register with no line yet):
 * "keep" when its lines are the paper's own lines (F/SYS/07's audit scopes, printed on the paper too) - the paper's grid is
 * left as it is; "blank" otherwise - the paper's body is cleared of the owner's example and nothing is written.
 */
function unboundGrid(lines: Cell[][], paperTexts: string[]): "keep" | "blank" | null {
  if (lines.some((row) => row.some(isBound))) return null;
  const keys = lines.map((row) => row.map((c) => c.text.trim()).filter((t) => t && !/^[\d.\s]+$/.test(t)).sort((a, b) => b.length - a.length)[0]).filter((t): t is string => !!t);
  if (keys.length === 0) return "blank";
  const paper = new Set(paperTexts.map(norm).filter(Boolean));
  const found = keys.filter((k) => paper.has(norm(k))).length;
  return found / keys.length >= 0.6 ? "keep" : "blank";
}

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

function placeGridW(tables: Table[], grid: ModelGrid, gridNo: number, labels: Set<string>, model: DcrsModel, tableHint?: number, taken?: Set<XmlElement>): GridPlaceW | null {
  if (grid.headerRows === 0) return null;
  const heads = headingTexts(grid);
  const named = heads.map((h, i) => ({ h, i })).filter((x) => x.h);
  if (named.length < 2) return null;
  const score = (t: string, h: string) => (isSerialHeading(h) && isSerialHeading(t) ? 1 : same(t.split("\n")[0], h) || same(t, h) ? 1 : Math.max(similarity(t, h), headingPrefix(t, h)));
  let best = null as { table: Table; ri: number; s: number } | null;
  for (const table of tableHint !== undefined ? tables.filter((t) => t.index === tableHint) : tables) {
    table.rows.forEach((row, ri) => {
      const rows = [row, table.rows[ri - 1]].filter(Boolean) as TRow[];
      const used = new Set<XmlElement>();
      let s = 0;
      for (const { h } of named) {
        const { group, sub } = headingParts(h);
        let hit: { c: TCell; s: number } | null = null;
        for (const r of rows)
          for (const c of r.cells) {
            // A table another grid of the page took is that grid's (F/MKT/05's five sections, each its own table).
            if (used.has(c.tc) || c.cont || taken?.has(c.tc)) continue;
            const t = cellText(c);
            const v = Math.max(score(t, h), group ? score(t, sub) * 0.95 : 0);
            if (v >= 0.72 && (!hit || v > hit.s)) hit = { c, s: v };
          }
        if (hit) {
          used.add(hit.c.tc);
          s += hit.s;
        }
      }
      if (!best || s > best.s + 1e-9) best = { table, ri, s };
    });
  }
  if (!best || best.s < Math.max(1.5, named.length * 0.45)) return null;
  const { table, ri } = best;
  const headRow = table.rows[ri];
  const upper = table.rows[ri - 1];
  const colOf = new Map<number, number>();
  const used = new Set<XmlElement>();
  for (const { h, i } of named) {
    const { group, sub } = headingParts(h);
    let hit: { c: TCell; s: number } | null = null;
    for (const r of [headRow, upper].filter(Boolean) as TRow[])
      for (const c of r.cells) {
        if (used.has(c.tc) || c.cont) continue;
        const t = cellText(c);
        let v = score(t, h);
        if (group && r === headRow) {
          const subS = score(t, sub);
          const g = upper ? cellAt(upper, c.col) : undefined;
          v = Math.max(v, g && score(cellText(g), group) >= 0.72 ? subS : subS * 0.8);
        }
        if (v >= 0.72 && (!hit || v > hit.s)) hit = { c, s: v };
      }
    if (hit && !Array.from(colOf.values()).includes(hit.c.col)) {
      colOf.set(i, hit.c.col);
      used.add(hit.c.tc);
    }
  }
  // A column whose heading was not found, between two that were: the table's column between them.
  for (let i = 0; i < heads.length; i++) {
    if (colOf.has(i)) continue;
    const left = [...colOf.keys()].filter((k) => k < i).sort((a, b) => b - a)[0];
    const right = [...colOf.keys()].filter((k) => k > i).sort((a, b) => a - b)[0];
    const cols = headRow.cells.map((c) => c.col);
    if (left !== undefined) {
      const after = cols.filter((c) => c > colOf.get(left)! && (right === undefined || c < colOf.get(right)!));
      const want = after[i - left - 1];
      if (want !== undefined && !Array.from(colOf.values()).includes(want)) colOf.set(i, want);
    }
  }
  // The body: the rows under the heading, to the table's end or a foot row.
  const stopWords = new Set<string>([...labels]);
  for (const t of model.texts) stopWords.add(norm(t));
  const own = new Set([...heads.map(norm), ...printedWords(grid)]);
  const body: TRow[] = [];
  const footRow = (row: TRow) =>
    row.cells.map(cellText).some((t) => {
      const n = norm(t);
      return (n.length > 2 && stopWords.has(n) && !own.has(n)) || (FOOT_RE.test(t.trim()) && !own.has(n));
    });
  for (const row of table.rows.slice(ri + 1)) {
    if (footRow(row)) break;
    body.push(row);
  }
  // The same heading printed again over the tables after this one, a page each (F/HR/06's induction record, eight people to
  // a page): the grid runs on in their rows, in order, before a row is added, and the owner's example lines there are
  // cleared too. Only for the page's one grid of that heading, its lines not the paper's own (F/MKT/05's five sections share
  // a heading: each section is its own grid and table).
  const sameHeading = model.grids.filter((g) => g.headerRows > 0 && headingTexts(g).join("|") === heads.join("|")).length === 1;
  const freeLines = grid.rows.slice(grid.headerRows).every((l) => fixedKey(l) === null);
  const alsoHeads: TRow[] = [];
  if (sameHeading && freeLines) {
    // Its heading again: the same cells, each column the grid writes in worded alike (F/HR/06's pages word their first
    // column apart: "Name of the Operator / Worker"), as a heading is found at all.
    const cols = [...new Set(colOf.values())];
    const alike = (r: TRow) =>
      r.cells.length === headRow.cells.length &&
      cols.length >= 2 &&
      cols.every((col) => {
        const a = cellAt(r, col);
        const b = cellAt(headRow, col);
        return !!a && !!b && !!cellText(b).trim() && (same(cellText(a), cellText(b)) || similarity(cellText(a), cellText(b)) >= 0.72);
      });
    for (const next of tables.filter((t) => t.index > table.index)) {
      const head = next.rows.find(alike);
      if (!head || head.cells.some((c) => taken?.has(c.tc))) continue;
      alsoHeads.push(head);
      for (const row of next.rows.slice(next.rows.indexOf(head) + 1)) {
        if (footRow(row)) break;
        body.push(row);
      }
    }
  }
  // Lines.
  const lines = grid.rows.slice(grid.headerRows);
  const rowOf = new Map<number, TRow>();
  const usedRows = new Set<TRow>();
  const fixedLines = lines.filter((l) => fixedKey(l) !== null).length;
  lines.forEach((line, i) => {
    const k = fixedKey(line);
    if (!k || !colOf.has(k.col)) return;
    let hit: { r: TRow; s: number } | null = null;
    for (const r of body) {
      if (usedRows.has(r)) continue;
      const c = cellAt(r, colOf.get(k.col)!);
      if (!c) continue;
      const s = similarity(cellText(c), k.text);
      if (s >= 0.7 && (!hit || s > hit.s)) hit = { r, s };
    }
    if (hit) {
      rowOf.set(i, hit.r);
      usedRows.add(hit.r);
    }
  });
  // A row continuing the one above it in every cell is part of it: the free lines go to rows of their own.
  const free = body.filter((r) => !usedRows.has(r) && !r.cells.every((c) => c.cont));
  const extra: number[] = [];
  let f = 0;
  lines.forEach((_, i) => {
    if (rowOf.has(i)) return;
    // An entry's second line (F/QC/12's "Deviation %"): onto the paper's row reading the same, after its entry.
    const second = grid.bindTable?.secondLine;
    if (second && lines[i].some((c) => same(c.text, second))) {
      const at = free.findIndex((r, k) => k >= f && r.cells.some((c) => same(cellText(c), second)));
      if (at !== -1) {
        rowOf.set(i, free[at]);
        f = at + 1;
        return;
      }
    }
    while (f < free.length && second && free[f].cells.some((c) => same(cellText(c), second)) && !lines[i].some((c) => same(c.text, second))) f++;
    if (f < free.length) rowOf.set(i, free[f++]);
    else extra.push(i);
  });
  const headRows = upper && headingTextsMatch(upper, heads) ? [upper, headRow] : [headRow];
  const unbound = unboundGrid(lines, body.flatMap((r) => r.cells.map(cellText)));
  if (unbound) return { grid, gridNo, table, headRows, colOf, body, rowOf: new Map(), extra: [], fixedGrid: false, unbound, alsoHeads };
  return { grid, gridNo, table, headRows, colOf, body, rowOf, extra, fixedGrid: fixedLines > 0, alsoHeads };
}

/**
 * A grid whose heading row the paper prints in its page header, repeated on every page (F/STR/02's register): the heading's
 * columns are found there, the lines go into the body's first table drawn on the same columns (as wide, as many).
 */
function placeGridUnderHeaderW(pkg: Pkg, headerParts: string[], tables: Table[], grid: ModelGrid, gridNo: number, labels: Set<string>, model: DcrsModel): GridPlaceW | null {
  const widthsOf = (tbl: XmlElement) => {
    const g = kid(tbl, "tblGrid");
    return g ? kids(g, "gridCol").map((c) => Number(c.attrs["w:w"] ?? 0) || 0) : [];
  };
  for (const name of headerParts) {
    const part = pkg.xml(name);
    if (!part) continue;
    const headerTables = all(part, "tbl").map((t) => tableOf(t, -1));
    const head = placeGridW(headerTables, grid, gridNo, labels, model);
    if (!head || head.body.length > 0) continue;
    const want = widthsOf(head.table.tbl);
    const table = tables.find((t) => {
      const w = widthsOf(t.tbl);
      return w.length === want.length && w.every((x, k) => Math.abs(x - want[k]) <= Math.max(20, want[k] * 0.02));
    });
    if (!table) continue;
    const body = table.rows.filter((r) => !r.cells.every((c) => c.cont));
    const lines = grid.rows.slice(grid.headerRows);
    const rowOf = new Map<number, TRow>();
    const extra: number[] = [];
    lines.forEach((_, i) => (i < body.length ? rowOf.set(i, body[i]) : extra.push(i)));
    const unbound = unboundGrid(lines, body.flatMap((r) => r.cells.map(cellText)));
    if (unbound) return { grid, gridNo, table, headRows: [], colOf: head.colOf, body, rowOf: new Map(), extra: [], fixedGrid: false, unbound };
    return { grid, gridNo, table, headRows: [], colOf: head.colOf, body, rowOf, extra, fixedGrid: false };
  }
  return null;
}

/** A grid placed where hints.ts gridRows says (a paper printing no heading row over it): its table, rows and columns. */
function placeGridRowsW(tables: Table[], grid: ModelGrid, gridNo: number, h: { table: number; from: number; to: number; cols: Record<number, number> }): GridPlaceW | null {
  const table = tables.find((t) => t.index === h.table);
  if (!table) return null;
  const body = table.rows.slice(h.from, h.to + 1);
  if (body.length === 0) return null;
  const colOf = new Map(Object.entries(h.cols).map(([k, v]) => [Number(k), v] as [number, number]));
  const lines = grid.rows.slice(grid.headerRows);
  const rowOf = new Map<number, TRow>();
  const extra: number[] = [];
  lines.forEach((_, i) => (i < body.length ? rowOf.set(i, body[i]) : extra.push(i)));
  // The rows above are the paper's own boxes (F/HR/07's Position row), not a heading: left to the boxes.
  const headRows: TRow[] = [];
  const unbound = unboundGrid(lines, body.flatMap((r) => r.cells.map(cellText)));
  if (unbound) return { grid, gridNo, table, headRows, colOf, body, rowOf: new Map(), extra: [], fixedGrid: false, unbound };
  return { grid, gridNo, table, headRows, colOf, body, rowOf, extra, fixedGrid: false };
}

/** A grid the paper prints as a card per line: the k-th card's value cell beside each heading's label, for line k. */
interface CardPlace {
  grid: ModelGrid;
  tables: Table[];
  lines: Map<number, TCell>[];
  /** The value cells of the cards no line takes (the owner's example cleared). */
  spare: TCell[];
}

/**
 * A grid the paper prints as a card per line (F/QC/19's tolerance cards: each card's "APPROVED BY: | ____" and "SIGN. : |
 * ____" a small table of its own, the cards in the order of their printed errors, the grid's lines in the same order): line
 * k's values go beside their headings' labels on the k-th card; a line past the paper's last card has no box, and is left
 * out (his paper prints seven cards for its nine errors). Two cards at least, each with every heading the grid writes in as
 * its own label.
 */
function placeCardsW(tables: Table[], grid: ModelGrid, taken: Set<XmlElement>): CardPlace | null {
  const heads = headingTexts(grid);
  const lines = grid.rows.slice(grid.headerRows);
  const cols = heads.map((_, i) => i).filter((i) => lines.some((l) => !!l[i] && isBound(l[i])));
  if (cols.length === 0 || cols.some((i) => !heads[i].trim())) return null;
  const bare = (t: string) => t.replace(/[\s:.\-–—]+$/, "");
  const found: { table: Table; at: Map<number, TCell> }[] = [];
  for (const t of tables) {
    if (t.rows.length > cols.length + 1) continue;
    const at = new Map<number, TCell>();
    for (const i of cols)
      for (const r of t.rows) {
        const k = r.cells.findIndex((c) => !c.cont && !taken.has(c.tc) && (same(cellText(c), heads[i]) || same(bare(cellText(c)), bare(heads[i]))));
        const value = k >= 0 ? r.cells[k + 1] : undefined;
        if (value && !value.cont && !taken.has(value.tc) && ![...at.values()].includes(value)) {
          at.set(i, value);
          break;
        }
      }
    if (at.size === cols.length) found.push({ table: t, at });
  }
  if (found.length < 2) return null;
  return { grid, tables: found.map((f) => f.table), lines: found.slice(0, lines.length).map((f) => f.at), spare: found.slice(lines.length).flatMap((f) => [...f.at.values()]) };
}

function headingTextsMatch(row: TRow, heads: string[]): boolean {
  return row.cells.some((c) => heads.some((h) => headingParts(h).group && similarity(cellText(c), headingParts(h).group) >= 0.72));
}

// ---------------------------------------------------------------------------------------------------------------------
// a box

/** Where a choice's words are on a line, by words (case, spaces and punctuation aside), from `from` on. */
function findWords(text: string, words: string, from: number): { from: number; to: number } | null {
  if (!norm(words)) return null;
  for (let i = from; i < text.length; i++) {
    if (!/[\p{L}\p{N}]/u.test(text[i])) continue;
    if (i > 0 && /[\p{L}\p{N}]/u.test(text[i - 1])) continue;
    const split = afterLabel(text.slice(i), words);
    if (split) {
      let end = i + split.head.length;
      while (end > i && !/[\p{L}\p{N})]/u.test(text[end - 1])) end--;
      return { from: i, to: end };
    }
  }
  return null;
}

let paraSiblings = new Map<XmlElement, XmlElement[]>();
/** The own words of DCRS's grouped labels ("Non-Technical" of "NO. OF EMPLOYEES - Non-Technical"): a line's next box starts there. */
let labelSubs = new Set<string>();

/**
 * A choice whose own words the paper prints one to a cell, every one of them, with no label (F/SYS/10 and 11's
 * "Non-Conformance | Observation"): marked there. Looked for last, after the page header.
 */
function choiceCellsAnywhere(field: ModelField, tables: Table[], usedCells: Set<XmlElement>): { kind: "choiceCells"; field: ModelField; label: TCell; options: { cell: TCell; text: string }[] } | null {
  const choice = choiceWords(field.cell);
  if (choice.length < 2) return null;
  for (const t of tables)
    for (const row of t.rows) {
      const options = row.cells.filter((o) => !o.cont && !usedCells.has(o.tc) && choice.some((w) => same(w, cellText(o).replace(MARKS_RE, "").trim())));
      if (options.length !== choice.length) continue;
      for (const o of options) usedCells.add(o.tc);
      return { kind: "choiceCells", field, label: options[0], options: options.map((o) => ({ cell: o, text: cellText(o).replace(MARKS_RE, "").trim() })) };
    }
  return null;
}

/** The header parts the document's sections show. */
function shownHeaders(pkg: Pkg, docPart: string, body: XmlElement): XmlElement[] {
  const rels = pkg.relsOf(docPart).tree;
  const ids = new Set(all(body, "headerReference").map((r) => r.attrs["r:id"] ?? ""));
  const out: XmlElement[] = [];
  for (const r of kids(rels, "Relationship")) {
    if (!ids.has(r.attrs.Id ?? "") || !/\/header$/.test(r.attrs.Type ?? "")) continue;
    const part = pkg.xml(`word/${(r.attrs.Target ?? "").replace(/^\/?(word\/)?/, "")}`);
    if (part) out.push(part);
  }
  return out;
}

/**
 * A box the paper prints in its page header ("... RECORD [ Vehicle number: ________ ]", F/DISP/04): the value after its label,
 * up to the header's closing bracket. Read back with the body's (engine/roundTrip/readFile.ts).
 */
function headerAt(field: ModelField, paras: XmlElement[]): { kind: "after"; field: ModelField; p: XmlElement; at: number; to: number } | null {
  for (const p of paras) {
    const text = paraText(p);
    const hit = findWords(text, field.label, 0);
    if (!hit) continue;
    let at = hit.to;
    while (at < text.length && /[:\-–=]/.test(text[at])) at++;
    const close = text.slice(at).search(/[\])]/);
    lineSpans.set(p, [...(lineSpans.get(p) ?? []), { from: hit.from, to: at }]);
    return { kind: "after", field, p, at, to: close === -1 ? text.length : at + close };
  }
  return null;
}

/** The owner's example words in a sentence of the paper, the place of a box (hints.ts exampleOf): the value takes their place. */
function exampleAt(field: ModelField, words: string, paragraphs: XmlElement[], tables: Table[]): { kind: "after"; field: ModelField; p: XmlElement; at: number; to: number; example: true } | null {
  for (const p of [...paragraphs, ...tables.flatMap((t) => all(t.tbl, "p"))]) {
    const at = paraText(p).indexOf(words);
    if (at === -1) continue;
    const spans = lineSpans.get(p) ?? [];
    if (spans.some((x) => at < x.to && x.from < at + words.length)) continue;
    spans.push({ from: at, to: at + words.length });
    lineSpans.set(p, spans);
    return { kind: "after", field, p, at, to: at + words.length, example: true };
  }
  return null;
}

/**
 * A choice's words after its label: on the label's own line, else on the few lines under it ("This is a request for" and the
 * kinds of request below it). A line that holds them itself never reaches into the next one (F/PUR/02's criteria, one a line).
 */
function choiceOccurrences(p: XmlElement, at: number, words: string[]): { p: XmlElement; from: number; to: number; text: string }[] {
  const container = paraSiblings.get(p) ?? [p];
  const from = container.indexOf(p);
  const occurrences: { p: XmlElement; from: number; to: number; text: string }[] = [];
  for (const q of container.slice(Math.max(0, from), from + 4)) {
    const qt = paraText(q);
    const before = occurrences.length;
    // The longer words first; a shorter one inside them ("Limited" in "Private Limited") is looked for after them.
    for (const w of [...words].sort((x, y) => norm(y).length - norm(x).length)) {
      let start = q === p ? at : 0;
      let idx = findWords(qt, w, start);
      while (idx && occurrences.some((o) => o.p === q && idx!.from < o.to && o.from < idx!.to)) {
        start = idx.from + 1;
        idx = findWords(qt, w, start);
      }
      if (idx) occurrences.push({ p: q, ...idx, text: w });
    }
    if (q === p && occurrences.length >= 2) break;
    if (q !== p && occurrences.length === before) break;
  }
  occurrences.sort((a, b) => (a.p === b.p ? a.from - b.from : container.indexOf(a.p) - container.indexOf(b.p)));
  return occurrences;
}
/** The labels found on each line so far: a second box on the same line is looked for outside them. */
let lineSpans = new Map<XmlElement, { from: number; to: number }[]>();

function placeFieldW(field: ModelField, tables: Table[], paragraphs: XmlElement[], usedCells: Set<XmlElement>, usedParas: Set<XmlElement>, labels: Set<string>): unknown {
  const label = field.label;
  if (!norm(label)) return null;
  const own = norm(label);
  const isLabel = (t: string) => {
    const s = t.replace(/[\s:\-–_.=]+$/, "");
    const n = norm(s);
    if (n.length === 0) return false;
    if (labels.has(n) || bandWordOf(s) !== null) return true;
    // A cell starting with another box's label and its own words ("Sex   Male / Female", F/HR/04): a label, never a value's place.
    for (const l of labels) if (l.length >= 3 && l !== own && n.startsWith(`${l} `) && /[:\t]|\s{2,}/.test(t)) return true;
    return false;
  };
  const { group, sub } = headingParts(label);
  // A choice whose words the paper prints after its label on a line ("1. HACCP/Quality system   Y / N / NA", F/PUR/02): that
  // line first, before a cell or a line that only repeats the label's words (its section's heading, its summary line).
  const choice = choiceWords(field.cell);
  if (choice.length >= 2) {
    const free = tables.flatMap((t) => t.rows.flatMap((r) => r.cells.filter((c) => !usedCells.has(c.tc)).flatMap((c) => kids(c.tc, "p"))));
    for (const p of [...paragraphs, ...free]) {
      if (usedParas.has(p)) continue;
      const text = paraText(p);
      const spans = lineSpans.get(p) ?? [];
      const hit = findWords(text, group ? sub : label, 0);
      if (!hit || spans.some((x) => hit.from < x.to && x.from < hit.to)) continue;
      let at = hit.to;
      while (at < text.length && /[:\-–—=.)\]]/.test(text[at])) at++;
      const occurrences = choiceOccurrences(p, at, choice);
      if (occurrences.length < 2) continue;
      // Only the label's and the choice's own words are taken: a second box on the same line is still found (F/SYS/11's CPAR).
      spans.push({ from: hit.from, to: at });
      lineSpans.set(p, spans);
      for (const o of occurrences) {
        const own = lineSpans.get(o.p) ?? [];
        own.push({ from: o.from, to: o.to });
        lineSpans.set(o.p, own);
      }
      return { kind: "choiceText", field, p, at, occurrences };
    }
  }
  // In a table: "Change requested by | Name | ____ | Designation | ____".
  for (const t of tables) {
    for (let ri = 0; ri < t.rows.length; ri++) {
      const row = t.rows[ri];
      for (let ci = 0; ci < row.cells.length; ci++) {
        const c = row.cells[ci];
        if (usedCells.has(c.tc) || c.cont) continue;
        const text = cellText(c);
        let hit = false;
        if (group) {
          if (!(same(text, sub) || same(text.replace(/[\s:\-–_.=]+$/, ""), sub))) continue;
          const isGroup = (g: string) => same(g, group) || afterLabel(g, group) !== null || similarity(g, group) >= 0.75;
          hit = row.cells.slice(0, ci).some((g) => isGroup(cellText(g)));
          // The group's name printed over its column, a few rows up ("For, GUJARAT ..." over "Name of the person").
          for (let up = ri - 1; !hit && up >= Math.max(0, ri - 6); up--) {
            const g = cellAt(t.rows[up], c.col);
            if (g && !g.cont && isGroup(cellText(g))) hit = true;
          }
        } else hit = same(text, label) || same(text.replace(/[\s:\-–_.=]+$/, ""), label);
        if (!hit) continue;
        usedCells.add(c.tc);
        const words = choiceWords(field.cell);
        if (words.length >= 2) {
          const options: { cell: TCell; text: string }[] = [];
          for (const o of row.cells.slice(ci + 1)) {
            const t = cellText(o).replace(MARKS_RE, "").trim();
            if (words.some((w) => same(w, t))) options.push({ cell: o, text: t });
            else if (t) break;
          }
          if (options.length >= 2) {
            for (const o of options) usedCells.add(o.cell.tc);
            return { kind: "choiceCells", field, label: c, options };
          }
          // Every word in the next cell ("Interview / On the Job observation / Written test"): marked there.
          const next = row.cells[ci + 1];
          if (next && !usedCells.has(next.tc) && !next.cont && wordsIn(cellText(next), words) >= 2) {
            usedCells.add(next.tc);
            return { kind: "choiceIn", field, cell: next, words };
          }
          // One word to a cell on the row under the label (F/HR/11's "Yes, very much | Partly | No, not at all").
          const under = t.rows[ri + 1];
          const below2 = under ? under.cells.filter((o) => !o.cont && !usedCells.has(o.tc) && words.some((w) => same(w, cellText(o).replace(MARKS_RE, "").trim()))).map((o) => ({ cell: o, text: cellText(o).replace(MARKS_RE, "").trim() })) : [];
          if (below2.length >= 2) {
            for (const o of below2) usedCells.add(o.cell.tc);
            return { kind: "choiceCells", field, label: c, options: below2 };
          }
        }
        const right = row.cells[ci + 1];
        if (right && !usedCells.has(right.tc) && !right.cont && !offCells.has(right.tc) && !isLabel(cellText(right))) {
          usedCells.add(right.tc);
          return { kind: "cell", field, cell: right };
        }
        const below = t.rows[ri + 1] ? cellAt(t.rows[ri + 1], c.col) : undefined;
        if (below && !usedCells.has(below.tc) && !below.cont && !offCells.has(below.tc) && !isLabel(cellText(below))) {
          usedCells.add(below.tc);
          return { kind: "cell", field, cell: below };
        }
        // A label written "Device ID No:" in its own box: the value after it, on its line.
        const ps = kids(c.tc, "p");
        const labelP = ps.find((p) => norm(paraText(p)).length > 0) ?? ps[0];
        if (labelP && /[:\-\u2013=]\s*$/.test(paraText(labelP))) {
          usedParas.add(labelP);
          return { kind: "after", field, p: labelP, at: paraText(labelP).replace(/\s+$/, "").length };
        }
        // A frame headed by its label: the value under the label, in the same cell.
        if (labelP) {
          usedParas.add(labelP);
          return { kind: "under", field, cell: c, p: labelP };
        }
      }
    }
  }
  // In a paragraph (outside tables, or a cell's own line): "Date of Change request: ____".
  const cellParas = tables.flatMap((t) => t.rows.flatMap((r) => r.cells.filter((c) => !usedCells.has(c.tc)).flatMap((c) => kids(c.tc, "p"))));
  for (const p of [...paragraphs, ...cellParas]) {
    if (usedParas.has(p)) continue;
    const text = paraText(p);
    // A line may hold several boxes ("NAME:  ...  DESIGNATION:", "Signed: ____  Date : ____"): the label at a word's start,
    // outside the labels already found on it.
    const spans = lineSpans.get(p) ?? [];
    let hit: { from: number; to: number } | null = null;
    for (let from = 0; from < text.length; ) {
      const found = findWords(text, group ? sub : label, from);
      if (!found) break;
      if (!spans.some((x) => found.from < x.to && x.from < found.to)) {
        hit = found;
        break;
      }
      from = found.from + 1;
    }
    if (!hit) continue;
    // The label ends with its own marks (":", " - ", ")"), never the blanks after it.
    let at = hit.to;
    while (at < text.length && /[:\-\u2013\u2014=.)\]]/.test(text[at])) at++;
    // "Signature\t: ", "Date  :" - a separator after blanks is the label's too (never the owner's example to clear).
    const sep = /^[ \t\u00a0]+[:\-\u2013\u2014=]+/.exec(text.slice(at));
    if (sep) at += sep[0].length;
    spans.push({ from: hit.from, to: at });
    lineSpans.set(p, spans);
    // A choice written on the label's line and the lines after it ("This is a request for  Existing Document Change" ...).
    const words = choiceWords(field.cell);
    if (words.length >= 2) {
      const occurrences = choiceOccurrences(p, at, words);
      if (occurrences.length >= 2) {
        for (const o of occurrences) usedParas.add(o.p);
        return { kind: "choiceText", field, p, at, occurrences };
      }
    }
    // The words after the label up to the line's next label are a blank or the owner's example: the value takes their place.
    let to = text.length;
    for (const other of [...labels, ...labelSubs]) {
      if (!other || other === norm(label) || other === norm(sub)) continue;
      const next = findWords(text, other, at);
      if (next && next.from >= at && next.from < to && !/^[\s_.]*$/.test(other)) to = next.from;
    }
    void isBlankish;
    return { kind: "after", field, p, at, to };
  }
  // The nearest words, for a label the plant edited.
  let best: { p: XmlElement; s: number } | null = null;
  for (const p of paragraphs) {
    if (usedParas.has(p)) continue;
    const text = paraText(p).trim();
    if (!text || text.length > label.length * 2 + 20) continue;
    const s = similarity(text.replace(/[\s:\-–_.=]+$/, ""), label);
    if (s >= 0.82 && (!best || s > best.s)) best = { p, s };
  }
  if (best) {
    usedParas.add(best.p);
    return { kind: "after", field, p: best.p, at: paraText(best.p).length };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// round 2 (REQUIREMENTS §119): the owner's further copies, a grid with no heading row, a choice in a grid, a value with no box

/** The usable width of the page (twips): where a table's cell starts past it, it is off the paper. */
let pageWidth = Infinity;
/** The cells of this file's tables that stand past the page's right margin. */
let offCells = new Set<XmlElement>();

function textWidth(body: XmlElement): number {
  const sect = kid(body, "sectPr");
  const size = sect ? kid(sect, "pgSz") : null;
  const margin = sect ? kid(sect, "pgMar") : null;
  const w = Number(size?.attrs["w:w"] ?? NaN);
  if (!Number.isFinite(w)) return Infinity;
  return w - (Number(margin?.attrs["w:left"] ?? 0) || 0) - (Number(margin?.attrs["w:right"] ?? 0) || 0);
}

/** A cell of a table on the body that starts past the page's right margin (a table drawn wider than the paper). */
function offPage(body: XmlElement, table: Table, c: TCell): boolean {
  if (!body.children.includes(table.tbl) || !Number.isFinite(pageWidth)) return false;
  const grid = kid(table.tbl, "tblGrid");
  const widths = grid ? kids(grid, "gridCol").map((g) => Number(g.attrs["w:w"] ?? 0) || 0) : [];
  const tblPr = kid(table.tbl, "tblPr");
  const ind = tblPr ? kid(tblPr, "tblInd") : null;
  const left = (Number(ind?.attrs["w:w"] ?? 0) || 0) + widths.slice(0, c.col).reduce((a, b) => a + b, 0);
  return left >= pageWidth - 60;
}

/** The body from the `index`-th table (every table, nested ones too, in body order) to its end taken out; its last page settings kept. */
function cutCopies(body: XmlElement, index: number): void {
  const tbl = all(body, "tbl")[index];
  if (!tbl) return;
  const holder = body.children.find((c): c is XmlElement => typeof c !== "string" && (c === tbl || all(c, "tbl").includes(tbl)));
  if (!holder) return;
  const sect = kid(body, "sectPr");
  const kept = body.children.slice(0, body.children.indexOf(holder));
  // The empty lines that only pushed the next copy to its page go too (one is kept: a body ends with a paragraph).
  while (kept.length > 1) {
    const last = kept[kept.length - 1];
    const before = kept[kept.length - 2];
    if (typeof last === "string" || last.local !== "p" || paraText(last).trim() || typeof before === "string" || before.local !== "p") break;
    kept.pop();
  }
  const last = kept[kept.length - 1];
  if (!last || typeof last === "string" || last.local !== "p") kept.push(el("w:p"));
  body.children = [...kept, ...(sect ? [sect] : [])];
}

const BOXES_RE = /[\u2610\u2611\u2612\u25a1\u25a0\u2713\u2714]/g;

/** How many of a choice's words a piece of text prints ("YES / NO" holds both of Yes and No). */
function wordsIn(text: string, words: string[]): number {
  return words.filter((w) => findWords(text, w, 0) !== null).length;
}

/** A cell the paper leaves to be written in: nothing in it but blanks, dots or its own tick box. */
const blankCell = (c: TCell): boolean => isBlankish(cellText(c).replace(BOXES_RE, ""));

/** Writes a value into a cell: a cell with the paper's own tick box keeps it, the value after it; any other is emptied first. */
function writeInto(target: TCell, cell: Cell, controls: Controls, label: string | undefined, rPrLike: XmlElement | null): void {
  // The paper's own tick box: a symbol, a box character, or Word's check box field (F/HR/04's FORMCHECKBOX).
  const box = all(target.tc, "sym").length > 0 || all(target.tc, "checkBox").length > 0 || BOXES_RE.test(cellText(target));
  BOXES_RE.lastIndex = 0;
  if (!box) {
    clearCell(target);
    let p = kids(target.tc, "p")[0];
    if (!p) {
      p = el("w:p");
      target.tc.children.push(p);
    }
    p.children.push(...controls.runs(cell, firstRunProps(p) ?? rPrLike, label));
    return;
  }
  const ps = kids(target.tc, "p");
  const p = ps.find((x) => paraText(x).trim() || all(x, "sym").length) ?? ps[0];
  if (!p) return;
  const bind = cell.bind ?? cell.parts?.find((x) => x.bind)?.bind;
  if (bind && (bind.type === "yesno" || bind.type === "bool") && cell.text.trim()) {
    // A yes / no in the paper's tick box: the box itself ticked (Yes) or left empty (No), in place of the paper's.
    emptyParagraph(p);
    p.children.push(...controls.runs(cell, rPrLike, label, TICK_BOX));
    return;
  }
  // The box is drawn in a symbol font: the value is written in the line's own face.
  p.children.push(runOf(" ", valueProps(rPrLike)), ...controls.runs(cell, rPrLike, label));
}

/** The chosen word of a choice printed one to a cell ticked and bound, the others boxed; none chosen: the value after `none`. */
function markChoiceCells(options: TCell[], cell: Cell, controls: Controls, label: string | undefined, none: TCell): void {
  const chosen = options.find((o) => same(cellText(o).replace(MARKS_RE, "").trim(), cell.text));
  for (const o of options) {
    const p = kids(o.tc, "p").find((x) => paraText(x).trim()) ?? kids(o.tc, "p")[0];
    if (!p) continue;
    const rPr = firstRunProps(p);
    // The paper's own box before the word (a symbol, a check box, a drawn square, F/SYS/11's): kept, never a second one added.
    const ownBox = all(o.tc, "sym").length + all(o.tc, "checkBox").length + all(o.tc, "drawing").length + all(o.tc, "pict").length > 0;
    const text = paraText(p);
    const from = text.length - text.replace(/^\s+/, "").length;
    if (o === chosen && ownBox) {
      replaceRange(p, from, text.length, "");
      insertAt(p, from, [runOf(TICK, rPr), ...controls.runs(cell, rPr, label)]);
    } else if (o === chosen) {
      emptyParagraph(p);
      p.children.push(runOf(CHECKED, rPr), ...controls.runs(cell, rPr, label));
    } else if (!ownBox) insertAt(p, from, [runOf(UNCHECKED, rPr)]);
  }
  if (!chosen) {
    const p = kids(none.tc, "p").find((x) => paraText(x).trim()) ?? kids(none.tc, "p")[0];
    if (p) p.children.push(runOf(" ", firstRunProps(p)), ...controls.runs(cell, firstRunProps(p), label));
  }
}

/**
 * A choice whose words are printed together in one cell ("YES / NO", "Yes / No"): marked as a person strikes it on the paper -
 * the others struck through, the chosen bound in its place; nothing is added, so the narrow cell keeps its one line.
 */
function markChoiceInCell(holder: TCell, cell: Cell, words: string[], controls: Controls, label: string | undefined): void {
  const p = kids(holder.tc, "p").find((x) => wordsIn(paraText(x), words) >= 1) ?? kids(holder.tc, "p")[0];
  if (!p) return;
  const text = paraText(p);
  const found: { from: number; to: number; text: string }[] = [];
  for (const w of words) {
    const at = findWords(text, w, 0);
    if (at) found.push({ ...at, text: w });
  }
  found.sort((a, b) => a.from - b.from);
  const chosen = found.find((o) => same(o.text, cell.text));
  if (!chosen) {
    p.children.push(runOf(" ", firstRunProps(p)), ...controls.runs(cell, firstRunProps(p), label));
    return;
  }
  for (const o of [...found].reverse()) {
    const rPr = firstRunProps(p);
    const word = paraText(p).slice(o.from, o.to);
    replaceRange(p, o.from, o.to, "");
    insertAt(p, o.from, o === chosen ? controls.runs(cell, rPr, label) : [runOf(word, struck(rPr))]);
  }
}

/** A run's properties with the words struck through (w:strike in its place among them). */
function struck(rPr: XmlElement | null): XmlElement {
  const out = rPr ? clone(rPr) : el("w:rPr");
  out.children = out.children.filter((c) => typeof c === "string" || (c.local !== "strike" && c.local !== "dstrike"));
  let at = 0;
  out.children.forEach((c, i) => {
    if (typeof c !== "string" && ["rStyle", "rFonts", "b", "bCs", "i", "iCs", "caps", "smallCaps"].includes(c.local)) at = i + 1;
  });
  out.children.splice(at, 0, el("w:strike"));
  return out;
}

/** A yes / no written in the paper's own tick box: ticked for Yes, an empty box for No (read back as Yes and No). */
const TICK_BOX = (t: string): string => (/^yes$/i.test(t.trim()) ? String.fromCharCode(0x2611) : /^no$/i.test(t.trim()) ? String.fromCharCode(0x2610) : t);

/** A choice's words printed as the headings of a row above (F/HR/11's "Excellent | Very Good | ..."): their columns. */
function optionsAbove(table: Table, row: TRow, words: string[]): { col: number; text: string }[] | null {
  const at = table.rows.indexOf(row);
  for (let r = at - 1; r >= Math.max(0, at - 4); r--) {
    const hits = table.rows[r].cells.filter((c) => words.some((w) => same(w, cellText(c).replace(MARKS_RE, "").trim()))).map((c) => ({ col: c.col, text: cellText(c).replace(MARKS_RE, "").trim() }));
    if (hits.length >= 2) return hits;
  }
  return null;
}

/** The row right under `row` when every cell of it is blank (the paper's blank line for the answer's details). */
function blankRowUnder(table: Table, row: TRow, used: Set<XmlElement>): TRow | null {
  const next = table.rows[table.rows.indexOf(row) + 1];
  if (!next || used.has(next.tr) || next.cells.length === 0 || next.cells.some((c) => c.cont || !blankCell(c))) return null;
  return next;
}

/** A line of a grid found on the paper by its own words. */
interface KeyedLine {
  line: number;
  table: Table;
  row: TRow;
  key: TCell;
  /** The key cells' columns of every line found on the same row. */
  rowKeys?: number[];
  /** The DCRS column whose words found the line. */
  dcrsCol?: number;
}

/** A line's own words as the paper prints them, its numbering ("01.", "a", "06. -") left out; the item after a stem too. */
function keyWords(t: string): string[] {
  const s = t.replace(/\s+/g, " ").trim();
  const bare = s
    .replace(/^(?:\(?\d{1,3}(?:\.\d{1,3})*[.)]?|[a-z][.)]?)\s+(?=\S)/i, "")
    .replace(/^[\u2013\u2014\-\u2022\u00b7*]+\s*/, "")
    .trim();
  const out = [bare];
  // "Have you ever had any of the following? - Chest trouble ...": the paper prints the item on a row of its own.
  const m = /\s[\u2013\u2014-]\s([^\u2013\u2014]+)$/.exec(bare);
  if (m) out.push(m[1].trim());
  return out.filter((x) => norm(x).length >= 3);
}

function keyScore(paper: string, key: string): number {
  const p = norm(paper.replace(/^\s*(?:\(?\d{1,3}(?:\.\d{1,3})*[.)]?|[a-z][.)])\s+/i, ""));
  const k = norm(key);
  if (!p || !k) return 0;
  if (p === k) return 1;
  const [shorter, longer] = p.length <= k.length ? [p, k] : [k, p];
  if (shorter.length >= 10 && longer.startsWith(shorter)) return 0.9;
  return similarity(p, k);
}

/**
 * A grid the paper prints with no heading row of its own (F/HR/04's questions, F/HR/14's conditions, F/HR/11's points): each
 * line found by its own words in a row of the paper's tables. Null unless most of the grid's lines are found.
 */
function placeKeyedGridW(tables: Table[], grid: ModelGrid, usedCells: Set<XmlElement>): KeyedLine[] | null {
  const lines = grid.rows.slice(grid.headerRows);
  const answered = lines.filter((row) => row.some(isBound)).length;
  if (answered < 2) return null;
  // Words more than one line shares (F/PUR/02's section name) never tell a line apart; a line's own number may ("6.1").
  const seen = new Map<string, number>();
  for (const row of lines) for (const t of new Set(row.filter((c) => !isBound(c)).map((c) => norm(c.text)))) if (t) seen.set(t, (seen.get(t) ?? 0) + 1);
  const cells: { t: Table; r: TRow; c: TCell; text: string }[] = [];
  for (const t of tables)
    for (const r of t.rows)
      for (const c of r.cells) {
        if (c.cont || usedCells.has(c.tc)) continue;
        const text = cellText(c);
        if (norm(text).length >= 3) cells.push({ t, r, c, text });
      }
  const wordsAt = (row: Cell[], ci: number): string | null => {
    const c = row[ci];
    return c && !isBound(c) && norm(c.text).length >= 3 && !/^[\d.\s]+$/.test(c.text.trim()) ? c.text : null;
  };
  const width = Math.max(0, ...lines.map((r) => r.length));
  let best: KeyedLine[] | null = null;
  // Each column of words a line could be known by, tried in turn: the one that finds the most lines on the paper is kept
  // (F/SYS/12's attributes, not its reference documents the paper leaves blank).
  for (let col = 0; col < width; col++) {
    const keyed: { i: number; words: string[]; full: string }[] = [];
    lines.forEach((row, i) => {
      if (!row.some(isBound)) return;
      const text = wordsAt(row, col);
      if (!text) return;
      const numbers = row.filter((c) => !isBound(c) && /^[\d.\s]+$/.test(c.text.trim()) && c.text.trim() && seen.get(norm(c.text)) === 1).map((c) => c.text.trim());
      keyed.push({ i, words: keyWords(text), full: [...numbers, text.trim()].join(" ") });
    });
    if (keyed.length < 2) continue;
    const pairs: { i: number; t: Table; r: TRow; c: TCell; s: number }[] = [];
    for (const { t, r, c, text } of cells)
      for (const { i, words, full } of keyed) {
        let s = 0;
        for (const w of words) s = Math.max(s, keyScore(text, w));
        // Two lines of the same words (1.1 and 6.1 "Specification suitability"): the paper's own numbering tells them apart.
        if (s >= 0.75 && norm(text) === norm(full)) s += 0.01;
        if (s >= 0.75) pairs.push({ i, t, r, c, s });
      }
    pairs.sort((a, b) => b.s - a.s || a.i - b.i);
    const byLine = new Map<number, KeyedLine>();
    const taken = new Set<XmlElement>();
    for (const p of pairs) {
      if (byLine.has(p.i) || taken.has(p.c.tc)) continue;
      byLine.set(p.i, { line: p.i, table: p.t, row: p.r, key: p.c, dcrsCol: col });
      taken.add(p.c.tc);
    }
    if (byLine.size < Math.max(2, Math.ceil(answered * 0.6))) continue;
    if (!best || byLine.size > best.length) best = [...byLine.values()].sort((a, b) => a.line - b.line);
  }
  if (!best) return null;
  for (const k of best) k.rowKeys = best.filter((o) => o.row === k.row).map((o) => o.key.col);
  return best;
}

const keyCols = (k: KeyedLine): number[] => k.rowKeys ?? [];

/**
 * A keyed line's values into its paper row: a choice marked where the paper prints its words (one to a cell, together in one
 * cell, or as the headings of a row above); every other value into the row's next blank cell, else the blank line under the
 * row; a value with no cell of its own on the paper is left out of the file (owner, 22-Oct-2026), listed in report.leftOut.
 */
function writeKeyedLine(body: XmlElement, k: KeyedLine, grid: ModelGrid, controls: Controls, report: FillReport, usedRows: Set<XmlElement>): void {
  const cells = grid.rows[grid.headerRows + k.line] ?? [];
  const heads = headingTexts(grid);
  const keyRPr = firstRunProps(kids(k.key.tc, "p").find((x) => paraText(x).trim()) ?? kids(k.key.tc, "p")[0] ?? el("w:p"));
  const bound = cells.map((c, ci) => ({ c, ci })).filter((x) => isBound(x.c));
  // A row holding several items (F/HR/04's "Diabetes [box] Heart trouble [box]"): each item's cells run to the next item's words.
  const nextKey = Math.min(Infinity, ...keyCols(k).filter((col) => col > k.key.col));
  let free = k.row.cells.filter((c) => c.col > k.key.col && c.col < nextKey && !c.cont && !offPage(body, k.table, c));
  const done = new Set<number>();
  for (const { c, ci } of bound) {
    const words = choiceWords(c);
    if (words.length < 2) continue;
    const label = heads[ci] || undefined;
    const opts = free.filter((x) => words.some((w) => same(w, cellText(x).replace(MARKS_RE, "").trim())));
    if (opts.length >= 2) {
      markChoiceCells(opts, c, controls, label, k.key);
      free = free.filter((x) => !opts.includes(x));
      done.add(ci);
      continue;
    }
    const holder = free.find((x) => wordsIn(cellText(x), words) >= 2);
    if (holder) {
      markChoiceInCell(holder, c, words, controls, label);
      free = free.filter((x) => x !== holder);
      done.add(ci);
      continue;
    }
    const above = optionsAbove(k.table, k.row, words);
    if (above) {
      const chosen = above.find((o) => same(o.text, c.text)) ?? above[0];
      const target = cellAt(k.row, chosen.col);
      if (target && free.includes(target)) {
        writeInto(target, c, controls, label, keyRPr);
        // Every option's cell of the row is the choice's (one of them is ticked on the paper), never another value's place:
        // F/HR/11's rating of "Maintained your interest" had gone under "Excellent".
        const optionCells = above.map((o) => cellAt(k.row, o.col));
        free = free.filter((x) => x !== target && !optionCells.includes(x));
        done.add(ci);
      }
    }
  }
  // Values with words first: a blank cell of the paper is never taken by an empty value while a written one needs it.
  const rest = bound.filter((x) => !done.has(x.ci)).sort((a, b) => Number(!a.c.text.trim()) - Number(!b.c.text.trim()) || a.ci - b.ci);
  for (const { c, ci } of rest) {
    const label = heads[ci] || undefined;
    const blank = free.find(blankCell);
    if (blank) {
      writeInto(blank, c, controls, label, keyRPr);
      free = free.filter((x) => x !== blank);
      continue;
    }
    // The blank line under the row is the line's own only when the row holds this line alone: F/HR/04's question 06 prints
    // four conditions to a row, and the spacer under them is none of theirs.
    const under = keyCols(k).length > 1 ? null : blankRowUnder(k.table, k.row, usedRows);
    if (under) {
      usedRows.add(under.tr);
      writeInto(under.cells[0], c, controls, label, keyRPr);
      continue;
    }
    // No cell of its own on the paper: left out (owner, 22-Oct-2026), never written beside the line's own words.
    report.leftOut.push(`${label ?? "value"} (line ${k.line + 1})`);
  }
}

/** Where each heading-grid line's choice is printed on the paper (a cell "Yes / No", or one cell per word): kept, then marked. */
interface ChoiceSpot {
  kind: "in" | "cells";
  cells: TCell[];
  words: string[];
}

function choiceSpot(row: TRow, col: number, cell: Cell, lastCol: number): ChoiceSpot | null {
  const words = choiceWords(cell);
  if (words.length < 2) return null;
  const target = cellAt(row, col);
  if (!target || target.cont) return null;
  if (wordsIn(cellText(target), words) >= 2) return { kind: "in", cells: [target], words };
  const run: TCell[] = [];
  for (const c of row.cells) {
    if (c.col < target.col || c.col > lastCol) continue;
    if (words.some((w) => same(w, cellText(c).replace(MARKS_RE, "").trim()))) run.push(c);
    else break;
  }
  return run.length >= 2 ? { kind: "cells", cells: run, words } : null;
}

// Re-exported for the tests.
export { paraText, replaceRange };
export type { ExportBinding };
