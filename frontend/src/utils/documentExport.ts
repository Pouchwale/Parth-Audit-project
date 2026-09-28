import { TBC, type DocumentDefinition } from "../types";
import { buildDocx, type DocxBlock, type DocxCell, type DocxRun } from "./docx";
import { columnName, isoToSerial, xmlText, zipStored, customPropertiesXml, CUSTOM_PROPERTIES_PART, CUSTOM_PROPERTIES_REL, CUSTOM_PROPERTIES_TYPE } from "./xlsx";
import { downloadBlob } from "./csv";
import { formatDisplayDate, todayISO } from "./date";
import { PRINT_PREPARE_EVENT } from "./print";
import { BIND_APPEND_ATTR, BIND_ATTR, BIND_COL_ATTR, BIND_OPTIONS_ATTR, BIND_RECORD_ATTR, BIND_TABLE_ATTR, BIND_TYPE_ATTR, BIND_TYPES, decodeOptions, parseBindPath, readBinding, type BindType } from "../engine/roundTrip/bindPath";
import {
  ENVELOPE_PROPERTY,
  ExportMapBuilder,
  MAP_SHEET_NAME,
  MAP_XML_NAMESPACE,
  entryName,
  envelopePropertyValue,
  makeEnvelope,
  mapJson,
  mapSheetRows,
  rowSignature,
  tableName,
  type ExportBinding,
  type ExportSegment,
  type ExportTableBinding,
  type RoundTripEnvelope,
} from "../engine/roundTrip/exportMap";

// DOWNLOAD A DOCUMENT IN ITS OWN KIND OF FILE (REQUIREMENTS §54).
//
// Printing gives a PDF, which suits a scanned letter but not a register kept
// in Excel or a form kept in Word. So every document can also be downloaded as
// the kind of file it is:
//
//   Excel (.xlsx)  what came as a workbook — the GAP report, the service
//                  reports — and every register or log sheet (the HR registers,
//                  the QC and production sheets, the daily pest control
//                  register, the fly catcher register)
//   Word (.docx)   what came as a Word file — the complaint checklist, the
//                  statements of compliance, the chemical chart, the training
//                  record — and the forms and letters: the one-person HR forms,
//                  the complaint acknowledgement, the service agreement, the
//                  responsibilities
//   PDF            the service licence, which is held as the provider's own
//                  scanned PDF — printed, as before
//
// The file is made from the document as it is on screen — its header block,
// its boxes, its grids, what has been written in them — so it is the same
// document the Print button prints, filled in the same way.
//
// AND IT CAN COME BACK (REQUIREMENTS §81). Every value a record view shows
// carries a binding (engine/roundTrip/bindPath.ts); the blocks keep it, and the
// file carries a map of them (engine/roundTrip/exportMap.ts): in the workbook a
// very hidden sheet and a hidden name on each bound cell, in the Word file a
// content control around each bound value and the map as a custom XML part. An
// edited copy uploaded again is read against that map (engine/roundTrip/
// readFile.ts, plan.ts). The visible sheet and page are exactly what they were.

export type DocumentFileKind = "xlsx" | "docx" | "pdf";

// Log sheets that are a form about one person or one position, not a grid.
// A certificate, a report or a card reads as a document, not as a spreadsheet:
// the three Certificates of Analysis, the analysis report, the minutes of a
// meeting and the customer's tolerance card download as Word (REQUIREMENTS §57).
const WORD_FORMS = new Set([
  // The customer's feedback form (F/MKT/01) is a form of boxes and one small grid, a Word document on the paper (REQUIREMENTS §77).
  "mkt-customer-feedback",
  "hr-pre-employment-health",
  "hr-induction-staff",
  "hr-job-responsibility",
  "hr-training-effectiveness",
  "hr-visitor-health",
  "hr-psc-survey",
  "qc-coa-label",
  "qc-coa-sleeve",
  "qc-coa-corrugated",
  "qc-analysis-report",
  "qc-minutes-of-meetings",
  "qc-tolerance-card-nivea",
  // Purchase (REQUIREMENTS §68): the registration form is one supplier's
  // details and prose blocks with no grid at all, and the audit report is a
  // nine-page report. Both read as documents. The three F/PUR registers are
  // grids and stay spreadsheets — F/PUR/05 prints its own formulas, which is
  // what a workbook is for.
  "pur-supplier-registration",
  "pur-supplier-audit-report",
  // Store (REQUIREMENTS §71): the incoming material check is a stamp — a
  // date, seven Yes/No answers and a signature, with no grid at all — so it
  // reads as a document. The sharp tool register beside it is a grid and
  // stays a spreadsheet, which is what a register of issues and returns is.
  "str-incoming-material-vehicle",
  // Maintenance (REQUIREMENTS §74): the New Equipment Installation Report is a
  // two-page report of boxes, a Y/N checklist and a hand-over, so it reads as a
  // document. The other seven F/MNT formats are grids and stay spreadsheets.
  "mnt-new-equipment",
  // System / Management (REQUIREMENTS §76): the two F/SYS formats supplied
  // with no original of their own to say what they are — the management
  // review's notice and the annual HARA review — are a notice and a report,
  // so they read as documents. The rest follow the company's own originals
  // (sourceFile): the .doc reports and notes as Word, the .xls/.xlsx lists,
  // schedules and registers as spreadsheets.
  "sys-mrm-agenda",
  "sys-hara-annual",
]);
const EXCEL_KINDS = new Set(["log-sheet", "daily-pest-monitoring", "fly-catcher", "service-report", "gap-inspection"]);
const WORD_KINDS = new Set(["complaint-checklist", "complaint-ack", "training-record", "compliance-statement", "chemical-master", "service-agreement", "pest-responsibilities"]);

export function documentFileKind(doc: DocumentDefinition | null | undefined): DocumentFileKind {
  if (!doc) return "pdf";
  const source = doc.sourceFile ?? "";
  if (/\.xlsx?\b/i.test(source)) return "xlsx";
  if (/\.docx?\b/i.test(source)) return "docx";
  if (WORD_FORMS.has(doc.id)) return "docx";
  if (EXCEL_KINDS.has(doc.kind)) return "xlsx";
  if (WORD_KINDS.has(doc.kind)) return "docx";
  return "pdf";
}

// ---------------------------------------------------------------------------
// the document on screen, as blocks

export interface Cell {
  text: string;
  /** YYYY-MM-DD when the cell is only a date. */
  date?: string;
  /** The binding, when the cell holds exactly one bound value (with the words around it, if any, as pre/post). */
  bind?: ExportBinding;
  /** The cell's text in pieces — fixed words and bound values — when it holds any bound value. */
  parts?: ExportSegment[];
}

export type ExportBlock =
  | { kind: "text"; text: string; strong: boolean; title?: boolean; parts?: ExportSegment[] }
  | { kind: "fields"; pairs: [string, Cell][] }
  | { kind: "table"; rows: Cell[][]; headerRows: number; bindTable?: ExportTableBinding };

const SKIP = "button, .btn, .no-print, datalist, script, style, svg, template, noscript, [hidden], [aria-hidden='true'], input[type='file'], input[type='hidden']";

/**
 * The element's computed style when it is in the file (undefined for a
 * print-only part, whose style is not read to decide), null when it is left out.
 */
function shownStyle(el: Element): CSSStyleDeclaration | null | undefined {
  if (el.matches(SKIP)) return null;
  if (el.classList.contains("print-only")) return undefined;
  const style = getComputedStyle(el);
  // A line of a long register that is only not drawn while it is off the
  // screen (tr.is-far, components/records/LogSheetRecordView.tsx) is a line of
  // the record all the same, and is downloaded with the rest (REQUIREMENTS §76).
  return style.display === "none" || (style.visibility === "hidden" && !el.closest("tr.is-far")) ? null : style;
}

const skipped = (el: Element): boolean => shownStyle(el) === null;

const blockish = (el: Element): boolean => {
  const display = getComputedStyle(el).display;
  return !display.startsWith("inline") && display !== "contents" && el.tagName !== "LABEL";
};

// A bound value met while reading a piece of the document: the text is written
// with a token in its place, so the words around it can be told apart from it.
const TOKEN = /\u0001(\d+)\u0002/g;
const token = (k: number) => `\u0001${k}\u0002`;

interface Marks {
  found: { bind: ExportBinding; raw: string }[];
}

/**
 * Whether an element shows the line breaks written in its text (white-space:
 * pre, pre-wrap, pre-line, break-spaces) — a signed-off record's remarks shown
 * as words (FormField "long", LogSheetRecordView's paragraph and cell text).
 */
function keepsBreaks(style: CSSStyleDeclaration): boolean {
  const collapse = (style as { whiteSpaceCollapse?: string }).whiteSpaceCollapse ?? "";
  return /^(pre|break-spaces)/.test(style.whiteSpace ?? "") || /^(preserve|break-spaces)/.test(collapse);
}

/**
 * A node's text as the file shows it. `breaks`: inside a bound value that
 * shows its line breaks, where they are kept (spaces are still collapsed) — so
 * a multi-line value is written, and read back, as the lines it is.
 */
function textOf(node: Node, marks?: Marks, breaks = false): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const raw = node.textContent ?? "";
    return breaks ? raw.replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ") : raw.replace(/\s+/g, " ");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as Element;
  const style = shownStyle(el);
  if (style === null) return "";
  if (marks && el.hasAttribute(BIND_ATTR)) {
    const binding = readBinding(el);
    if (binding?.recordId) {
      // The bound element's text taken whole: a tick box ☑/☐, a select's label, a date as dd-Mmm-yyyy —
      // and a value shown as words with its line breaks, where the page shows them.
      const own = ownText(el, style, undefined, keepsBreaks(style ?? getComputedStyle(el)));
      const k = marks.found.length;
      marks.found.push({ bind: { ...binding, recordId: binding.recordId, text: clean(own.text) }, raw: own.text });
      return own.block ? `\n${token(k)}\n` : token(k);
    }
  }
  const own = ownText(el, style, marks, breaks && (style === undefined || keepsBreaks(style)));
  return own.block ? `\n${own.text}\n` : own.text;
}

/** An element's own text, and whether it is a block (its text on lines of its own). Its style is read once. */
function ownText(el: Element, style: CSSStyleDeclaration | undefined, marks?: Marks, breaks = false): { text: string; block: boolean } {
  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox" || el.type === "radio") return { text: el.checked ? " ☑ " : " ☐ ", block: false };
    if (el.type === "date") return { text: el.value ? formatDisplayDate(el.value) : "", block: false };
    return { text: el.value, block: false };
  }
  if (el instanceof HTMLSelectElement) return { text: el.value ? (el.selectedOptions[0]?.textContent ?? el.value) : "", block: false };
  if (el instanceof HTMLTextAreaElement) return { text: el.value, block: false };
  if (el.tagName === "BR") return { text: "\n", block: false };
  if (el instanceof HTMLImageElement) return { text: el.alt ?? "", block: false };
  const display = (style ?? getComputedStyle(el)).display;
  const between = display.includes("flex") || display.includes("grid") ? " " : "";
  const text = Array.from(el.childNodes)
    .map((n) => textOf(n, marks, breaks))
    .join(between);
  return { text, block: !display.startsWith("inline") && display !== "contents" && el.tagName !== "LABEL" };
}

const clean = (s: string) =>
  s
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

/**
 * Text read with its bound values marked, as the plain text the file shows
 * (what it was before bindings existed, but for two bound values that touched,
 * now each on a line of its own) and — when anything in it is bound — the same
 * text in pieces.
 */
function piecesOf(read: string, marks: Marks): { text: string; parts?: ExportSegment[] } {
  if (marks.found.length === 0) return { text: clean(read) };
  // Two bound values with nothing at all between them (the GAP report's premises
  // name and address: two boxes in one header box) are put on lines of their
  // own. Run together, the file showed "NameAddress", and neither could be cut
  // out of the cell again when it came back (engine/roundTrip/readFile.ts).
  const marked = read.replace(/\u0002(?=\u0001)/g, "\u0002\n");
  const text = clean(marked.replace(TOKEN, (_, k: string) => marks.found[Number(k)]?.raw ?? ""));
  const parts: ExportSegment[] = [];
  const tidy = clean(marked);
  let at = 0;
  for (const m of tidy.matchAll(TOKEN)) {
    const before = tidy.slice(at, m.index);
    if (before) parts.push({ text: before });
    const found = marks.found[Number(m[1])];
    if (found) parts.push({ text: found.bind.text, bind: found.bind });
    at = (m.index ?? 0) + m[0].length;
  }
  const after = tidy.slice(at);
  if (after) parts.push({ text: after });
  return { text, parts };
}

/** The one binding of a piece of text holding exactly one bound value, with the words before and after it. */
function singleBind(parts: ExportSegment[] | undefined): ExportBinding | undefined {
  if (!parts) return undefined;
  const bound = parts.filter((p) => p.bind);
  if (bound.length !== 1) return undefined;
  const at = parts.indexOf(bound[0]);
  const pre = parts
    .slice(0, at)
    .map((p) => p.text)
    .join("");
  const post = parts
    .slice(at + 1)
    .map((p) => p.text)
    .join("");
  const bind: ExportBinding = { ...bound[0].bind! };
  if (pre) bind.pre = pre;
  if (post) bind.post = post;
  return bind;
}

const DISPLAY_DATE = /^(\d{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{4})$/;
const MONTHS3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "01-Oct-2026" → "2026-10-01"; anything else → undefined. */
function isoOfDisplayDate(text: string): string | undefined {
  const m = DISPLAY_DATE.exec(text);
  if (!m) return undefined;
  const iso = `${m[3]}-${String(MONTHS3.indexOf(m[2]) + 1).padStart(2, "0")}-${m[1]}`;
  return formatDisplayDate(iso) === text ? iso : undefined;
}

/** A cell (or a field's value) from its nodes: its text, and its bound values. */
function cellFrom(nodes: Node[], joiner = ""): Cell {
  const marks: Marks = { found: [] };
  const marked = nodes.map((n) => textOf(n, marks)).join(joiner);
  const { text, parts } = piecesOf(marked, marks);
  const cell: Cell = { text };
  if (parts) {
    cell.parts = parts;
    const bind = singleBind(parts);
    if (bind) {
      cell.bind = bind;
      // A bound date shown as words (a signed-off record) is still a date in the workbook.
      if (bind.type === "date" && !bind.pre && !bind.post && bind.text === text) {
        const iso = isoOfDisplayDate(text);
        if (iso) cell.date = iso;
      }
    }
  }
  return cell;
}

function cellOf(el: Element): Cell {
  const cell = cellFrom([el]);
  const dates = Array.from(el.querySelectorAll("input[type='date']")) as HTMLInputElement[];
  if (dates.length === 1 && dates[0].value && cell.text === formatDisplayDate(dates[0].value)) cell.date = dates[0].value;
  return cell;
}

const isBindType = (s: string | null): s is BindType => !!s && (BIND_TYPES as readonly string[]).includes(s);

/** The grid a person may add lines to (data-bind-table + data-bind-append="1"), with the column each field is in. */
function appendableGrid(table: HTMLTableElement, columnsAt: Map<Element, number>): ExportTableBinding | undefined {
  if (table.getAttribute(BIND_APPEND_ATTR) !== "1") return undefined;
  const listPath = table.getAttribute(BIND_TABLE_ATTR) ?? "";
  const recordId = table.closest(`[${BIND_RECORD_ATTR}]`)?.getAttribute(BIND_RECORD_ATTR) ?? "";
  if (!listPath || !recordId || !parseBindPath(listPath)) return undefined;
  const columns: ExportTableBinding["columns"] = [];
  for (const [cell, col] of columnsAt) {
    const key = cell.getAttribute(BIND_COL_ATTR);
    const type = cell.getAttribute(BIND_TYPE_ATTR);
    if (!key || !isBindType(type)) continue;
    const label = clean(textOf(cell));
    columns.push({ key, type, options: decodeOptions(cell.getAttribute(BIND_OPTIONS_ATTR)), col, ...(label ? { label } : {}) });
  }
  return columns.length ? { recordId, listPath, columns: columns.sort((a, b) => a.col - b.col) } : undefined;
}

// A grid read into rows of cells the way the screen lays it out. A heading that
// spans columns (colSpan) keeps its place by blank cells after it; a heading
// that spans ROWS (rowSpan) keeps its column on the rows below it too — the
// "Sr. No." and every ungrouped heading beside a run of grouped ones span both
// heading rows, and without holding their columns the second row's headings
// shifted left under them in the workbook and the Word table (F/PUR/03's
// METHOD OF APPROVAL; F/MNT/06's three grouped headings, REQUIREMENTS §74). So
// each row starts from the columns still held by a cell above it.
function tableBlock(table: HTMLTableElement): ExportBlock | null {
  const rows: Cell[][] = [];
  let headerRows = 0;
  // Columns held by a cell above, by the index of the table row they reach into.
  const held = new Map<number, Set<number>>();
  // The grid column of each heading that names an item's field (an appendable grid's columns).
  const columnsAt = new Map<Element, number>();
  Array.from(table.rows).forEach((tr, ri) => {
    const taken = held.get(ri);
    held.delete(ri);
    if (skipped(tr)) return;
    const cells: Cell[] = [];
    const skipHeld = () => {
      while (taken?.has(cells.length)) cells.push({ text: "" });
    };
    let own = 0;
    for (const cell of Array.from(tr.cells)) {
      if (skipped(cell)) continue;
      skipHeld();
      const at = cells.length;
      const across = Math.max(1, cell.colSpan);
      if (cell.hasAttribute(BIND_COL_ATTR)) columnsAt.set(cell, at);
      cells.push(cellOf(cell));
      own++;
      for (let i = 1; i < across; i++) cells.push({ text: "" });
      for (let down = 1; down < cell.rowSpan; down++) {
        const below = held.get(ri + down) ?? new Set<number>();
        for (let c = at; c < at + across; c++) below.add(c);
        held.set(ri + down, below);
      }
    }
    if (own === 0) return;
    skipHeld(); // a held column at the end of the row (the spare column after the last heading)
    rows.push(cells);
    if (tr.parentElement?.tagName === "THEAD") headerRows++;
  });
  if (rows.length === 0) return null;
  // A value the view gave no label is named by its column's heading and its line.
  const headings = (ci: number) => {
    for (let r = headerRows - 1; r >= 0; r--) {
      const t = rows[r]?.[ci]?.text;
      if (t) return t.split("\n")[0];
    }
    return "";
  };
  rows.forEach((row, ri) => {
    if (ri < headerRows) return;
    row.forEach((cell, ci) => {
      for (const p of cell.parts ?? []) {
        if (!p.bind || p.bind.label) continue;
        const heading = headings(ci);
        if (heading) p.bind.label = headerRows > 0 ? `${heading} (line ${ri - headerRows + 1})` : heading;
      }
      if (cell.bind && !cell.bind.label) cell.bind.label = cell.parts?.find((p) => p.bind)?.bind?.label;
    });
  });
  const bindTable = appendableGrid(table, columnsAt);
  return bindTable ? { kind: "table", rows, headerRows, bindTable } : { kind: "table", rows, headerRows };
}

function structural(el: Element): boolean {
  return el.tagName === "TABLE" || el.classList.contains("field") || el.classList.contains("doc-header") || !!el.querySelector("table, .field, .doc-header") || blockish(el);
}

function walk(el: Element, out: ExportBlock[]): void {
  if (skipped(el)) return;
  if (el instanceof HTMLTableElement) {
    const block = tableBlock(el);
    if (block) out.push(block);
    return;
  }
  if (el.classList.contains("doc-header")) {
    for (const part of Array.from(el.querySelectorAll(".company-name, .doc-title"))) {
      const text = clean(textOf(part));
      if (text) out.push({ kind: "text", text, strong: true, title: true });
    }
    const meta = Array.from(el.querySelectorAll(".meta-cell")).flatMap((c) => [{ text: clean(textOf(c.querySelector(".k") ?? c)) }, cellFrom([c.querySelector(".v") ?? c])]);
    if (meta.length > 0) out.push({ kind: "table", rows: [meta], headerRows: 0 });
    return;
  }
  const label = el.classList.contains("field") ? el.querySelector(":scope > label") : null;
  if (label) {
    const name = clean(textOf(label)).replace(/\s*\*$/, "");
    const dateInput = el.querySelector("input[type='date']") as HTMLInputElement | null;
    const value = cellFrom(
      Array.from(el.childNodes).filter((n) => n !== label),
      " "
    );
    const cell: Cell = dateInput?.value ? { ...value, text: formatDisplayDate(dateInput.value), date: dateInput.value } : value;
    // A field's bound value that the view gave no label is named by the field.
    for (const p of cell.parts ?? []) if (p.bind && !p.bind.label && name) p.bind.label = name;
    if (cell.bind && !cell.bind.label && name) cell.bind.label = name;
    const last = out[out.length - 1];
    if (last?.kind === "fields") last.pairs.push([name, cell]);
    else out.push({ kind: "fields", pairs: [[name, cell]] });
    return;
  }
  const children = Array.from(el.children).filter((c) => !skipped(c));
  if (!children.some(structural)) {
    const marks: Marks = { found: [] };
    const { text, parts } = piecesOf(textOf(el, marks), marks);
    if (text || parts) {
      const block: ExportBlock = { kind: "text", text, strong: /^H[1-6]$/.test(el.tagName) || /^(bold|[6-9]00)$/.test(getComputedStyle(el).fontWeight) };
      if (parts) block.parts = parts;
      out.push(block);
    }
    return;
  }
  let inline = "";
  let marks: Marks = { found: [] };
  const flush = () => {
    const { text, parts } = piecesOf(inline, marks);
    if (text || parts) out.push(parts ? { kind: "text", text, strong: false, parts } : { kind: "text", text, strong: false });
    inline = "";
    marks = { found: [] };
  };
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as Element;
      if (skipped(child)) continue;
      if (structural(child)) {
        flush();
        walk(child, out);
      } else inline += textOf(child, marks);
    } else inline += textOf(node, marks);
  }
  flush();
}

/** The documents given, read as blocks, in order. */
export function documentBlocks(roots: Element[]): ExportBlock[] {
  const out: ExportBlock[] = [];
  for (const root of roots) walk(root, out);
  return out;
}

/** The records whose documents are given (every [data-bind-record] around, on or in them), in order. */
export function recordIdsIn(roots: Element[]): string[] {
  const ids: string[] = [];
  for (const root of roots) {
    const own = root.closest(`[${BIND_RECORD_ATTR}]`)?.getAttribute(BIND_RECORD_ATTR);
    if (own) ids.push(own);
    for (const el of Array.from(root.querySelectorAll(`[${BIND_RECORD_ATTR}]`))) {
      const id = el.getAttribute(BIND_RECORD_ATTR);
      if (id) ids.push(id);
    }
  }
  return Array.from(new Set(ids));
}

// ---------------------------------------------------------------------------
// bound values in a piece of text

/** Each bound value of a cell or a paragraph with the fixed words before it (since the last value) and after it (to the next). */
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

// A value longer than a spreadsheet cell holds is not mapped: Excel would cut it
// short, and the cut would read back as a change.
const MAX_MAPPED_TEXT = 30000;
const mappable = (b: ExportBinding) => b.text.length <= MAX_MAPPED_TEXT && (b.label ?? "").length <= MAX_MAPPED_TEXT;

const isBound = (cell: Cell) => !!cell.parts?.some((p) => p.bind);

// ---------------------------------------------------------------------------
// the blocks as a workbook

const NUMBER_RE = /^-?(?:0|[1-9]\d{0,14})(?:\.\d+)?$/;

// Styles: 0 plain · 1 bold · 2 title · 3 grid cell · 4 grid heading · 5 grid date · 6 grid number · 7 wrapped text
/**
 * The blocks as a one-sheet workbook. Given an envelope, the workbook also
 * carries the map of its bound values (a very hidden "_dcrs" sheet, a hidden
 * name on each bound cell, the envelope in the custom properties) — the
 * visible sheet is the same either way.
 */
export function workbookFromBlocks(sheetName: string, blocks: ExportBlock[], envelope?: RoundTripEnvelope): Uint8Array<ArrayBuffer> {
  type Anchor = { col: number; text: string; grid: number };
  type XCell = { text: string; style: number; date?: string; number?: boolean; pieces?: { bind: ExportBinding; pre: string; post: string }[]; anchor?: Anchor };
  const rows: XCell[][] = [];
  const widths: number[] = [];
  const measure = (ci: number, text: string) => {
    const longest = Math.max(0, ...text.split("\n").map((l) => l.length));
    widths[ci] = Math.min(48, Math.max(widths[ci] ?? 8, longest + 2));
  };
  const gap = () => {
    if (rows.length > 0 && rows[rows.length - 1].length > 0) rows.push([]);
  };
  const mapping = !!envelope;
  const piecesFor = (parts: ExportSegment[] | undefined) => {
    if (!mapping) return undefined;
    const pieces = boundPieces(parts).filter((p) => mappable(p.bind));
    return pieces.length ? pieces : undefined;
  };
  // Appendable grids: where each landed on the sheet (0-based rows), filled in once the sheet is laid out.
  const grids: { bind: ExportTableBinding; first: number; header: number | null; last: number; fixed: string[] }[] = [];
  let previous: ExportBlock["kind"] | null = null;
  let gridNo = 0;
  for (const block of blocks) {
    if (block.kind === "text") {
      if (previous && previous !== "text") gap();
      rows.push([{ text: block.text, style: block.title ? 2 : block.strong ? 1 : 7, pieces: piecesFor(block.parts) }]);
    } else if (block.kind === "fields") {
      gap();
      for (const [label, cell] of block.pairs) {
        measure(0, label);
        measure(1, cell.text);
        rows.push([
          { text: label, style: 1 },
          { text: cell.text, style: cell.date ? 5 : 3, date: cell.date, pieces: piecesFor(cell.parts) },
        ]);
      }
    } else {
      gap();
      const first = rows.length;
      const fixed: string[] = [];
      // Each line's own fixed words — its first filled cell holding no bound value (the Sr. No., the
      // parameter) — when no other line of the grid has the same: found again after a sort.
      const grid = gridNo++;
      const anchors = block.rows.map((row, ri): Anchor | null => {
        if (ri < block.headerRows || !row.some(isBound)) return null;
        const col = row.findIndex((c) => !isBound(c) && c.text.trim() !== "");
        return col === -1 ? null : { col, text: row[col].text, grid };
      });
      const seen = new Map<string, number>();
      for (const a of anchors) if (a) seen.set(rowSignature([a.text]), (seen.get(rowSignature([a.text])) ?? 0) + 1);
      block.rows.forEach((row, ri) => {
        const header = ri < block.headerRows;
        if (block.bindTable && (header || !row.some(isBound))) fixed.push(rowSignature(row.map((c) => c.text)));
        rows.push(
          row.map((cell, ci) => {
            measure(ci, header ? cell.text.split("\n")[0] : cell.text);
            if (header) return { text: cell.text, style: 4 };
            const pieces = piecesFor(cell.parts);
            const a = anchors[ri];
            const anchor = pieces && a && seen.get(rowSignature([a.text])) === 1 ? a : undefined;
            if (cell.date) return { text: cell.text, style: 5, date: cell.date, pieces, anchor };
            if (NUMBER_RE.test(cell.text)) return { text: cell.text, style: 6, number: true, pieces, anchor };
            return { text: cell.text, style: 3, pieces, anchor };
          })
        );
      });
      if (mapping && block.bindTable) grids.push({ bind: block.bindTable, first, header: block.headerRows > 0 ? first + block.headerRows - 1 : null, last: rows.length - 1, fixed });
    }
    previous = block.kind;
  }
  const columns = Math.max(1, ...rows.map((r) => r.length));
  const cellXml = (c: XCell, ref: string) => {
    if (c.date) {
      const serial = isoToSerial(c.date);
      if (serial !== null) return `<c r="${ref}" s="${c.style}"><v>${serial}</v></c>`;
    }
    if (c.number) return `<c r="${ref}" s="${c.style}"><v>${c.text}</v></c>`;
    if (!c.text) return `<c r="${ref}" s="${c.style}"/>`;
    return `<c r="${ref}" s="${c.style}" t="inlineStr"><is><t xml:space="preserve">${xmlText(c.text)}</t></is></c>`;
  };
  const sheetData = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => cellXml(c, `${columnName(ci)}${ri + 1}`)).join("")}</row>`).join("");
  const safeName = (sheetName.replace(/[\\/?*[\]:]/g, "-").slice(0, 31) || "Document").replace(/'/g, "");
  const lastRef = `${columnName(columns - 1)}${Math.max(1, rows.length)}`;
  const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const PACKAGE_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
  const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const thin = '<left style="thin"><color rgb="FF9AA0A6"/></left><right style="thin"><color rgb="FF9AA0A6"/></right><top style="thin"><color rgb="FF9AA0A6"/></top><bottom style="thin"><color rgb="FF9AA0A6"/></bottom><diagonal/>';

  // The map: every bound cell by its place on the sheet, and a hidden name that follows the cell.
  let mapSheet = "";
  let definedNames = "";
  if (envelope) {
    const builder = new ExportMapBuilder();
    const quoted = `'${xmlText(safeName)}'`;
    const names: string[] = [];
    const nameCell = (name: string, col: number, row0: number) => names.push(`<definedName name="${name}" hidden="1">${quoted}!$${columnName(col)}$${row0 + 1}</definedName>`);
    rows.forEach((r, ri) =>
      r.forEach((c, ci) => {
        if (!c.pieces) return;
        const ref = `${columnName(ci)}${ri + 1}`;
        const plain = c.pieces.length === 1 && !c.pieces[0].pre.trim() && !c.pieces[0].post.trim();
        for (const p of c.pieces) {
          const entry = builder.add(p.bind, { ref, ...(plain ? {} : { pre: p.pre, post: p.post }), ...(c.anchor ? { anchor: c.anchor } : {}) });
          nameCell(entryName(entry.i), ci, ri);
        }
      })
    );
    for (const g of grids) {
      let next: number | undefined;
      for (let r = g.last + 1; r < rows.length; r++) {
        if (rows[r].length > 0) {
          next = r;
          break;
        }
      }
      const table = builder.addTable(g.bind, {
        firstRow: g.first + 1,
        ...(g.header !== null ? { headerRow: g.header + 1 } : {}),
        lastRow: g.last + 1,
        ...(next !== undefined ? { nextRow: next + 1 } : {}),
        ...(g.fixed.length ? { fixedRows: g.fixed } : {}),
      });
      if (g.header !== null) nameCell(tableName(table.t, "h"), 0, g.header);
      nameCell(tableName(table.t, "z"), 0, g.last);
      if (next !== undefined) nameCell(tableName(table.t, "n"), 0, next);
    }
    definedNames = names.length ? `<definedNames>${names.join("")}</definedNames>` : "";
    const mapRows = mapSheetRows(envelope, builder.entries, builder.tables);
    const mapCell = (text: string, ref: string) => (text ? `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlText(text)}</t></is></c>` : "");
    mapSheet =
      `<worksheet xmlns="${MAIN}" xmlns:r="${REL}"><sheetData>` +
      mapRows.map((r, ri) => `<row r="${ri + 1}">${r.map((text, ci) => mapCell(text, `${columnName(ci)}${ri + 1}`)).join("")}</row>`).join("") +
      `</sheetData></worksheet>`;
  }

  const parts: [string, string][] = [
    [
      "[Content_Types].xml",
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        (envelope ? `<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` : "") +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        (envelope ? `<Override PartName="/${CUSTOM_PROPERTIES_PART}" ContentType="${CUSTOM_PROPERTIES_TYPE}"/>` : "") +
        `</Types>`,
    ],
    [
      "_rels/.rels",
      `<Relationships xmlns="${PACKAGE_REL}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/>` +
        (envelope ? `<Relationship Id="rId2" Type="${CUSTOM_PROPERTIES_REL}" Target="${CUSTOM_PROPERTIES_PART}"/>` : "") +
        `</Relationships>`,
    ],
    [
      "xl/workbook.xml",
      `<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="${xmlText(safeName).replace(/"/g, "&quot;")}" sheetId="1" r:id="rId1"/>` +
        (envelope ? `<sheet name="${MAP_SHEET_NAME}" sheetId="2" state="veryHidden" r:id="rId3"/>` : "") +
        `</sheets>${definedNames}</workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `<Relationships xmlns="${PACKAGE_REL}"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/>` +
        (envelope ? `<Relationship Id="rId3" Type="${REL}/worksheet" Target="worksheets/sheet2.xml"/>` : "") +
        `</Relationships>`,
    ],
    [
      "xl/styles.xml",
      `<styleSheet xmlns="${MAIN}">` +
        `<numFmts count="1"><numFmt numFmtId="164" formatCode="[$-409]dd\\-mmm\\-yyyy"/></numFmts>` +
        `<fonts count="3"><font><sz val="10"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="10"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="12"/><name val="Calibri"/><family val="2"/></font></fonts>` +
        `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7E9EE"/><bgColor indexed="64"/></patternFill></fill></fills>` +
        `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>${thin}</border></borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="8">` +
        `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
        `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
        `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
        `<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
        `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>` +
        `<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>` +
        `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>` +
        `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf>` +
        `</cellXfs>` +
        `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
        `</styleSheet>`,
    ],
    [
      "xl/worksheets/sheet1.xml",
      `<worksheet xmlns="${MAIN}" xmlns:r="${REL}">` +
        `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
        `<dimension ref="A1:${lastRef}"/>` +
        `<sheetViews><sheetView workbookViewId="0"/></sheetViews>` +
        `<sheetFormatPr defaultRowHeight="14"/>` +
        `<cols>${Array.from({ length: columns }, (_, i) => `<col min="${i + 1}" max="${i + 1}" width="${widths[i] ?? 10}" customWidth="1"/>`).join("")}</cols>` +
        `<sheetData>${sheetData}</sheetData>` +
        `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>` +
        // Printed from Excel: one page wide, as many pages down as it takes.
        `<pageSetup paperSize="9" orientation="${columns > 6 ? "landscape" : "portrait"}" fitToWidth="1" fitToHeight="0"/>` +
        `</worksheet>`,
    ],
  ];
  if (envelope) {
    parts.push(["xl/worksheets/sheet2.xml", mapSheet]);
    parts.push([CUSTOM_PROPERTIES_PART, customPropertiesXml([[ENVELOPE_PROPERTY, envelopePropertyValue(envelope)]])]);
  }
  return zipStored(parts.map(([name, xml]) => ({ name, data: new TextEncoder().encode(declaration + xml) })));
}

// ---------------------------------------------------------------------------
// the blocks as a Word document

/**
 * The blocks as Word blocks. Given a map builder, every bound value becomes a
 * content control tagged "dcrs:<i>" (its number in the map) and every grid a
 * person may add lines to is captioned "dcrs:t<t>".
 */
export function wordBlocksFrom(blocks: ExportBlock[], builder?: ExportMapBuilder): DocxBlock[] {
  const runsOf = (parts: ExportSegment[] | undefined, fallback?: string): DocxRun[] | undefined => {
    if (!builder || !parts || !parts.some((p) => p.bind && mappable(p.bind))) return undefined;
    return parts.map((p): DocxRun => {
      if (!p.bind || !mappable(p.bind)) return { text: p.text };
      const entry = builder.add(p.bind, { fallbackLabel: fallback });
      return { text: p.bind.text, tag: { tag: `dcrs:${entry.i}`, alias: entry.label } };
    });
  };
  const cellOfWord = (cell: Cell, fallback?: string): DocxCell => runsOf(cell.parts, fallback) ?? cell.text;
  return blocks.map((b): DocxBlock => {
    if (b.kind === "text") {
      const parts = runsOf(b.parts);
      const block: DocxBlock = { type: "paragraph", text: b.text, bold: b.strong, size: b.title ? 24 : undefined, center: b.title };
      if (parts) block.parts = parts;
      return block;
    }
    if (b.kind === "fields") return { type: "table", rows: b.pairs.map(([label, cell]) => [label, cellOfWord(cell, label)]), boldFirstColumn: true };
    const rows = b.rows.map((r) => r.map((c) => cellOfWord(c)));
    const block: DocxBlock = { type: "table", rows, headerRows: b.headerRows };
    if (builder && b.bindTable) {
      const fixed = b.rows.filter((r, ri) => ri < b.headerRows || !r.some(isBound)).map((r) => rowSignature(r.map((c) => c.text)));
      const table = builder.addTable(b.bindTable, { headerRows: b.headerRows, ...(fixed.length ? { fixedRows: fixed } : {}) });
      block.caption = `dcrs:t${table.t}`;
    }
    return block;
  });
}

/** The blocks as a Word document; given an envelope, with the map of its bound values. */
export function wordDocumentFromBlocks(blocks: ExportBlock[], envelope?: RoundTripEnvelope): Uint8Array<ArrayBuffer> {
  if (!envelope) return buildDocx(wordBlocksFrom(blocks));
  const builder = new ExportMapBuilder();
  const docxBlocks = wordBlocksFrom(blocks, builder);
  const json = mapJson(envelope, builder.entries, builder.tables);
  return buildDocx(docxBlocks, {
    customXml: { xml: `<dcrsMap xmlns="${MAP_XML_NAMESPACE}">${xmlText(json)}</dcrsMap>`, schema: MAP_XML_NAMESPACE },
    customProperties: [[ENVELOPE_PROPERTY, envelopePropertyValue(envelope)]],
  });
}

// ---------------------------------------------------------------------------
// the download

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// A format number still TO BE CONFIRMED (the GAP report's) names nothing.
const knownFormatNo = (doc: DocumentDefinition) => (doc.formatNo && doc.formatNo !== TBC ? doc.formatNo : "");

/** "F-HR-01 Personal Competence Records (Staff Members Only) 01-Oct-2026" — safe on Windows. */
export function documentFileName(doc: DocumentDefinition, dateISO?: string): string {
  const when = dateISO && /^\d{4}-\d{2}-\d{2}$/.test(dateISO) ? formatDisplayDate(dateISO) : formatDisplayDate(todayISO());
  return [knownFormatNo(doc), doc.name, when]
    .filter(Boolean)
    .join(" ")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
}

/**
 * The file's bytes for these blocks: the workbook or the Word document, with
 * the map of the bound values when any record is in it.
 */
export function documentFileBytes(
  kind: "xlsx" | "docx",
  doc: Pick<DocumentDefinition, "id" | "name" | "formatNo" | "revisionNo">,
  blocks: ExportBlock[],
  recordIds: string[],
  exportedAt?: string
): Uint8Array<ArrayBuffer> {
  // Every record the file holds: those given, and any a bound value belongs to.
  const ids = [...recordIds];
  const note = (parts: ExportSegment[] | undefined) => {
    for (const p of parts ?? []) if (p.bind?.recordId) ids.push(p.bind.recordId);
  };
  for (const b of blocks) {
    if (b.kind === "text") note(b.parts);
    else if (b.kind === "fields") for (const [, c] of b.pairs) note(c.parts);
    else {
      for (const r of b.rows) for (const c of r) note(c.parts);
      if (b.bindTable) ids.push(b.bindTable.recordId);
    }
  }
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const envelope = unique.length ? makeEnvelope(kind, { documentId: doc.id, formatNo: doc.formatNo, revisionNo: doc.revisionNo }, unique, exportedAt) : undefined;
  if (kind === "xlsx") return workbookFromBlocks(knownFormatNo(doc as DocumentDefinition) || doc.name, blocks, envelope);
  return wordDocumentFromBlocks(blocks, envelope);
}

/** Puts every line of a long list on screen (utils/useProgressive.ts) and lets the page draw once. */
async function everyLineDrawn(): Promise<void> {
  try {
    window.dispatchEvent(new Event(PRINT_PREPARE_EVENT));
  } catch {
    /* a list that cannot be completed is downloaded as it stands */
  }
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    try {
      requestAnimationFrame(() => finish());
    } catch {
      finish();
    }
    // A hidden tab draws no frames: never wait on one for long.
    setTimeout(finish, 150);
  });
}

/**
 * Downloads the documents on screen as the document's own kind of file.
 * Resolves to the kind made ("pdf" means nothing was: print it). Never rejects.
 */
export async function downloadDocumentFile(doc: DocumentDefinition, roots: Element[], dateISO?: string): Promise<DocumentFileKind> {
  const kind = documentFileKind(doc);
  if (kind === "pdf" || roots.length === 0) return "pdf";
  try {
    await everyLineDrawn();
    const live = roots.filter((r) => r.isConnected);
    const blocks = documentBlocks(live.length ? live : roots);
    const name = documentFileName(doc, dateISO);
    const bytes = documentFileBytes(kind, doc, blocks, recordIdsIn(live.length ? live : roots));
    downloadBlob(`${name}.${kind}`, new Blob([bytes], { type: kind === "xlsx" ? XLSX_TYPE : DOCX_TYPE }));
    return kind;
  } catch {
    // A download that cannot be made must never be a page error (REQUIREMENTS §81 rules).
    return "pdf";
  }
}
