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
import { el, kid, kids, all, clone, insertAfter, removeChild, type XmlElement, type XmlNode } from "./xml";
import { modelOf, bandValue, labelsOf, type DcrsModel, type ModelField, type ModelGrid } from "./model";
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

  /** The cell's pieces as runs: the fixed words as words, each bound value in a control tagged "dcrs:<i>". */
  runs(cell: Cell, rPr: XmlElement | null, fallbackLabel?: string): XmlElement[] {
    const parts: ExportSegment[] = cell.parts?.length ? cell.parts : cell.text ? [{ text: cell.text }] : [];
    const out: XmlElement[] = [];
    for (const p of parts) {
      if (!p.bind || !this.builder || p.bind.text.length > 30000) {
        if (p.text) out.push(runOf(p.text, rPr));
        continue;
      }
      const entry = this.builder.add(p.bind, { fallbackLabel });
      this.report.placed++;
      out.push(this.control(entry.i, entry.label, p.bind.text, valueProps(rPr)));
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
  const model = modelOf(blocks);
  const labels = labelsOf(model);
  const hints = opts.hints ?? {};
  const builder = opts.envelope ? new ExportMapBuilder() : null;
  const controls = new Controls(builder, report);

  // The body's tables (every one, nested ones too) and its paragraphs outside tables.
  const tables = all(body, "tbl").map((t, i) => tableOf(t, i));
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
    for (const p of all(part, "p")) fixWords(p, band);
  }

  // ---- grids
  const gridPlaces: GridPlaceW[] = [];
  model.grids.forEach((grid, gridNo) => {
    if (hints.skipGrids?.includes(gridNo)) return;
    const place = placeGridW(tables, grid, gridNo, labels, model, hints.table?.[gridNo]);
    if (!place && grid.rows.length > grid.headerRows && grid.headerRows > 0) report.gridsMissed.push(grid.rows[0]?.map((c) => c.text).filter(Boolean).slice(0, 3).join(" | ") ?? "");
    if (place) {
      gridPlaces.push(place);
      for (const r of place.headRows) for (const c of r.cells) usedCells.add(c.tc);
      for (const r of place.body) for (const c of r.cells) usedCells.add(c.tc);
    }
  });

  // ---- boxes
  type FieldAt =
    | { field: ModelField; kind: "cell"; cell: TCell }
    | { kind: "after"; field: ModelField; p: XmlElement; at: number; to?: number }
    | { kind: "under"; field: ModelField; cell: TCell; p: XmlElement }
    | { kind: "choiceCells"; field: ModelField; label: TCell; options: { cell: TCell; text: string }[] }
    | { kind: "choiceText"; field: ModelField; p: XmlElement; at: number; occurrences: { p: XmlElement; from: number; to: number; text: string }[] };
  const fieldAts: FieldAt[] = [];
  // Each paragraph's neighbours (the body's own, or a cell's): where a choice's words written on the next lines are found.
  paraSiblings = new Map<XmlElement, XmlElement[]>();
  lineSpans = new Map<XmlElement, { from: number; to: number }[]>();
  for (const p of paragraphs) paraSiblings.set(p, paragraphs);
  for (const t of tables)
    for (const row of t.rows)
      for (const c of row.cells) {
        const ps = kids(c.tc, "p");
        for (const p of ps) paraSiblings.set(p, ps);
      }
  for (const field of model.fields) {
    if (!isBound(field.cell)) continue;
    if (hints.notOnPaper?.some((l) => same(l, field.label))) {
      report.leftOut.push(field.label);
      continue;
    }
    const at = placeFieldW(field, tables, paragraphs, usedCells, usedParas, labels);
    if (!at) {
      report.notPlaced.push(field.label || field.cell.text);
      continue;
    }
    fieldAts.push(at as FieldAt);
  }

  // ---- the band, the company's name, the title and fixed lines in the body (outside the grids and the boxes)
  const firstGridTable = gridPlaces.length ? Math.min(...gridPlaces.map((g) => g.table.index)) : Infinity;
  for (const t of tables) {
    for (const row of t.rows)
      for (const c of row.cells) {
        if (usedCells.has(c.tc)) continue;
        for (const p of kids(c.tc, "p")) if (!usedParas.has(p)) fixWords(p, t.index < firstGridTable && isBandRow(row));
      }
  }
  for (const p of paragraphs) if (!usedParas.has(p)) fixWords(p, false);
  if (model.title) {
    let best: { p: XmlElement; s: number } | null = null;
    const candidates = [...headerParts.flatMap((n) => all(pkg.xml(n)!, "p")), ...paragraphs, ...tables.filter((t) => t.index < firstGridTable).flatMap((t) => all(t.tbl, "p"))];
    for (const p of candidates) {
      if (usedParas.has(p)) continue;
      const s = similarity(paraText(p), model.title);
      if (s > 0.6 && (!best || s > best.s)) best = { p, s };
    }
    if (best && !same(paraText(best.p), model.title)) {
      report.replaced.push(`title -> ${model.title.slice(0, 40)}`);
      setParagraphText(best.p, model.title);
    }
  }

  // ---- rows added where a grid has more lines than the paper's table has rows
  for (const place of gridPlaces) {
    if (place.extra.length === 0) continue;
    const last = place.body[place.body.length - 1] ?? place.headRows[place.headRows.length - 1];
    let after = last.tr;
    for (const line of place.extra) {
      const copy = clone(last.tr);
      insertAfter(place.table.tbl, after, copy);
      after = copy;
      const row = tableOf(el("w:tbl", {}, [copy]), -1).rows[0];
      // vMerge restarts copied as continuations would join the rows: the copy starts its own.
      for (const c of row.cells) clearCell(c);
      place.rowOf.set(line, row);
      place.body.push(row);
    }
  }

  // ---- clear the owner's example entries (REQUIREMENTS §98), then write
  for (const place of gridPlaces) {
    const boundCols = new Set<number>();
    place.grid.rows.slice(place.grid.headerRows).forEach((row) => row.forEach((cell, ci) => isBound(cell) && place.colOf.has(ci) && boundCols.add(place.colOf.get(ci)!)));
    const placedRows = new Set(Array.from(place.rowOf.values()));
    const printed = printedWords(place.grid);
    for (const row of place.body) {
      for (const c of row.cells) {
        if (c.cont) continue;
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

  for (const f of fieldAts) {
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
      if (middle) {
        if (/[^_.\s]/.test(middle)) report.cleared++;
        replaceRange(p, f.at + lead, to - tail, "");
      }
      const rPr = firstRunProps(p);
      insertAt(p, f.at, [runOf(" ", valueProps(rPr)), ...controls.runs(f.field.cell, rPr, f.field.label)]);
    }
  }
  const tableBinds: { place: GridPlaceW; bind: ExportTableBinding }[] = [];
  for (const place of gridPlaces) {
    const lines = place.grid.rows.slice(place.grid.headerRows);
    lines.forEach((row, i) => {
      const r = place.rowOf.get(i);
      if (!r) {
        for (const cell of row) for (const p of cell.parts ?? []) if (p.bind) report.notPlaced.push(p.bind.label ?? p.bind.path);
        return;
      }
      row.forEach((cell, ci) => {
        const col = place.colOf.get(ci);
        const target = col === undefined ? undefined : cellAt(r, col);
        if (!target || target.cont) {
          for (const p of cell.parts ?? []) if (p.bind) report.notPlaced.push(p.bind.label ?? p.bind.path);
          return;
        }
        if (isBound(cell)) writeCell(target, cell, controls);
        else if (/^\d+\.?$/.test(cell.text.trim()) && numbered(target)) return;
        else if (cell.text.trim() && !same(cellText(target), cell.text)) writeCell(target, cell, controls);
      });
    });
    report.grids.push({ rows: lines.length, paperRows: place.body.length - place.extra.length, added: place.extra.length, where: `table ${place.table.index + 1}` });
    if (place.grid.bindTable) {
      const columns = place.grid.bindTable.columns.filter((c) => place.colOf.has(c.col)).map((c) => ({ ...c, col: place.colOf.get(c.col)! }));
      tableBinds.push({ place, bind: { ...place.grid.bindTable, columns } });
    }
  }

  // ---- the map (REQUIREMENTS §81)
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

/** A paragraph's words set to `text`, in its first run's font (pictures and fields kept where they were). */
function setParagraphText(p: XmlElement, text: string): void {
  const total = paraText(p).length;
  replaceRange(p, 0, total, text);
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

function placeGridW(tables: Table[], grid: ModelGrid, gridNo: number, labels: Set<string>, model: DcrsModel, tableHint?: number): GridPlaceW | null {
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
            if (used.has(c.tc) || c.cont) continue;
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
  const own = new Set(heads.map(norm));
  const body: TRow[] = [];
  for (const row of table.rows.slice(ri + 1)) {
    const words = row.cells.map(cellText);
    const stop = words.some((t) => {
      const n = norm(t);
      return (n.length > 2 && stopWords.has(n) && !own.has(n)) || (FOOT_RE.test(t.trim()) && !own.has(n));
    });
    if (stop) break;
    body.push(row);
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
  return { grid, gridNo, table, headRows, colOf, body, rowOf, extra, fixedGrid: fixedLines > 0 };
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
/** The labels found on each line so far: a second box on the same line is looked for outside them. */
let lineSpans = new Map<XmlElement, { from: number; to: number }[]>();

function placeFieldW(field: ModelField, tables: Table[], paragraphs: XmlElement[], usedCells: Set<XmlElement>, usedParas: Set<XmlElement>, labels: Set<string>): unknown {
  const label = field.label;
  if (!norm(label)) return null;
  const isLabel = (t: string) => {
    const s = t.replace(/[\s:\-–_.=]+$/, "");
    const n = norm(s);
    return n.length > 0 && (labels.has(n) || bandWordOf(s) !== null);
  };
  const { group, sub } = headingParts(label);
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
          hit = row.cells.slice(0, ci).some((g) => same(cellText(g), group) || afterLabel(cellText(g), group) !== null);
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
        }
        const right = row.cells[ci + 1];
        if (right && !usedCells.has(right.tc) && !right.cont && !isLabel(cellText(right))) {
          usedCells.add(right.tc);
          return { kind: "cell", field, cell: right };
        }
        const below = t.rows[ri + 1] ? cellAt(t.rows[ri + 1], c.col) : undefined;
        if (below && !usedCells.has(below.tc) && !below.cont && !isLabel(cellText(below))) {
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
    if (text[at] === " " && /[:\-\u2013=]/.test(text[at + 1] ?? "")) {
      at++;
      while (at < text.length && /[:\-\u2013\u2014=]/.test(text[at])) at++;
    }
    spans.push({ from: hit.from, to: at });
    lineSpans.set(p, spans);
    // A choice written on the label's line and the lines after it ("This is a request for  Existing Document Change" ...).
    const words = choiceWords(field.cell);
    if (words.length >= 2) {
      const container = paraSiblings.get(p) ?? [p];
      const from = container.indexOf(p);
      const occurrences: { p: XmlElement; from: number; to: number; text: string }[] = [];
      for (const q of container.slice(Math.max(0, from), from + 4)) {
        const qt = paraText(q);
        const before = occurrences.length;
        for (const w of words) {
          const idx = findWords(qt, w, q === p ? at : 0);
          if (idx) occurrences.push({ p: q, ...idx, text: w });
        }
        if (q !== p && occurrences.length === before) break;
      }
      if (occurrences.length >= 2) {
        for (const o of occurrences) usedParas.add(o.p);
        occurrences.sort((a, b) => (a.p === b.p ? a.from - b.from : container.indexOf(a.p) - container.indexOf(b.p)));
        return { kind: "choiceText", field, p, at, occurrences };
      }
    }
    // The words after the label up to the line's next label are a blank or the owner's example: the value takes their place.
    let to = text.length;
    for (const other of labels) {
      if (!other || other === norm(label)) continue;
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

// Re-exported for the tests.
export { paraText, replaceRange };
export type { ExportBinding };
