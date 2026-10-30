import { TBC, type DocumentDefinition } from "../types";
import { buildDocx, type DocxBlock, type DocxCell, type DocxRun } from "./docx";
import { columnName, isoToSerial, xmlText, zipStored, customPropertiesXml, CUSTOM_PROPERTIES_PART, CUSTOM_PROPERTIES_REL, CUSTOM_PROPERTIES_TYPE } from "./xlsx";
import { downloadBlob } from "./csv";
import { displayDateToISO, formatDisplayDate, todayISO } from "./date";
import { PRINT_PREPARE_EVENT, paperOf } from "./print";
import { paperMarginsOf, paperPageOf, paperSheetBlocks, paperWordBlocks } from "./paperSheets";
import { originalFileBytes, originalFileOf } from "./originalFill";
import {
  BIND_APPEND_ATTR,
  BIND_ATTR,
  BIND_COL_ATTR,
  BIND_OPTIONS_ATTR,
  BIND_RECORD_ATTR,
  BIND_SECOND_LINE_ATTR,
  BIND_TABLE_ATTR,
  BIND_TYPE_ATTR,
  BIND_TYPES,
  decodeOptions,
  parseBindPath,
  readBinding,
  type BindType,
} from "../engine/roundTrip/bindPath";
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
  // document. The F/MNT registers and schedules are grids and stay spreadsheets.
  "mnt-new-equipment",
  // The two F/MNT/05 slips (REQUIREMENTS §82) are one breakdown's memo each —
  // labelled boxes, four (or three) tall boxes and the hygiene clearance — so
  // they read as documents too.
  "mnt-breakdown-memo",
  "mnt-breakdown-clearance",
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
  // The owner's own file, where he supplied one as Word or Excel (REQUIREMENTS §119): the download is that kind of file.
  const original = originalFileOf(doc.id);
  if (original) return original.kind;
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

/**
 * How a cell of a paper sheet is drawn (data-paper-sheet, REQUIREMENTS §118): the size and weight of its words, where they
 * sit in the cell, whether they wrap, and the four edges as the paper rules them (0 none, 1 thin, 2 medium): left, right, top, bottom.
 */
export interface SheetStyle {
  size: number;
  bold: boolean;
  align: "left" | "center" | "right";
  valign: "top" | "center" | "bottom";
  wrap: boolean;
  borders: [number, number, number, number];
  /** The words underlined (the company's name and the title on F/HR/15's workbook). */
  underline?: boolean;
}

/** A cell of a paper sheet: its place on the sheet's grid (0-based), the cells it merges over, and how it is drawn. */
export interface SheetCell extends Cell {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  style: SheetStyle;
}

/** A cell of a table drawn as the company's own Word page (utils/paperSheets.ts, utils/docx.ts "paper"): its words, set in the paper's face and edged as the paper edges it. */
export interface PaperCellSpec extends Cell {
  colSpan?: number;
  vMerge?: "restart" | "continue";
  /** Half-points. */
  size: number;
  bold: boolean;
  align: "left" | "center" | "right";
  valign: "top" | "center";
  underline?: boolean;
  font?: string;
  /** left, right, top, bottom, in eighths of a point. */
  borders: [number, number, number, number];
}

export type ExportBlock =
  | { kind: "text"; text: string; strong: boolean; title?: boolean; parts?: ExportSegment[] }
  /** A table laid in points as the company's Word original draws it: widths (pt), rows with heights (pt) and merged cells. For a Word file only. */
  | { kind: "paper"; widths: number[]; rows: { height?: number; cells: PaperCellSpec[] }[]; indent?: number; pageBreakBefore?: boolean; spaceAfter?: number }
  /**
   * A sheet drawn as the company's own Excel paper: merged cells, the paper's column widths (Excel characters) and row
   * heights (points), fonts, borders. Read from a table marked data-paper-sheet (utils/documentExport.ts sheetBlock).
   */
  | { kind: "sheet"; name: string; widths: number[]; heights: (number | undefined)[]; rowCount: number; cells: SheetCell[] }
  /** Boxes with their labels; `perLine`, how many the paper puts on one line (LogSheetLayout.headerColumns, REQUIREMENTS §117). */
  | { kind: "fields"; pairs: [string, Cell][]; perLine?: number }
  | { kind: "table"; rows: Cell[][]; headerRows: number; bindTable?: ExportTableBinding; band?: true };

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
      // The bound element's text taken whole: a tick box ☑/☐, a select's label, a date as dd-mm-yy —
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

/** "01-10-26" → "2026-10-01"; anything else → undefined. */
function isoOfDisplayDate(text: string): string | undefined {
  const iso = displayDateToISO(text);
  return iso && formatDisplayDate(iso) === text ? iso : undefined;
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
  // A grid whose entries take two lines says what the second is headed (REQUIREMENTS §111).
  const secondLine = (table.getAttribute(BIND_SECOND_LINE_ATTR) ?? "").trim();
  return columns.length ? { recordId, listPath, columns: columns.sort((a, b) => a.col - b.col), ...(secondLine ? { secondLine } : {}) } : undefined;
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
    if (skipped(tr) || tr.closest("[aria-hidden='true']")) return;
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

// A TABLE DRAWN AS THE COMPANY'S EXCEL PAPER (REQUIREMENTS §118). A table marked data-paper-sheet is read as the sheet
// it is: its cells at their place with the cells they merge over (colSpan, rowSpan), the words' size, weight and
// alignment and the four edges of each cell as the page draws them, the column widths the <col>s name in Excel characters
// (data-xl-w) and each row's height. The sheet's own measure of a point is the table's data-xl-pt-per-px (the page draws the
// paper at its print size, so one pixel is one point of the original; 0.75 where it says nothing).
const edge = (width: string, style: string): number => {
  const w = parseFloat(width);
  if (!(w > 0) || style === "none" || style === "hidden") return 0;
  return w > 1.5 ? 2 : 1;
};

function sheetBlock(table: HTMLTableElement): ExportBlock | null {
  const pt = Number(table.getAttribute("data-xl-pt-per-px")) || 0.75;
  const widths = Array.from(table.querySelectorAll(":scope > colgroup > col")).map((c) => Number(c.getAttribute("data-xl-w")) || 8.43);
  const cells: SheetCell[] = [];
  const heights: (number | undefined)[] = [];
  const held = new Map<number, Set<number>>();
  const rows = Array.from(table.rows);
  rows.forEach((tr, ri) => {
    const taken = held.get(ri);
    held.delete(ri);
    let col = 0;
    for (const cell of Array.from(tr.cells)) {
      while (taken?.has(col)) col++;
      const across = Math.max(1, cell.colSpan);
      const down = Math.max(1, cell.rowSpan);
      const hidden = skipped(cell);
      const read = hidden ? { text: "" } : cellOf(cell);
      const cs = getComputedStyle(cell);
      const align = cs.textAlign === "center" ? "center" : cs.textAlign === "right" || cs.textAlign === "end" ? "right" : "left";
      const valign = cs.verticalAlign === "top" ? "top" : cs.verticalAlign === "bottom" ? "bottom" : "center";
      cells.push({
        ...read,
        row: ri,
        col,
        rowSpan: down,
        colSpan: across,
        style: {
          size: Math.round(parseFloat(cs.fontSize) * pt * 4) / 4 || 11,
          bold: /^(bold|[6-9]00)$/.test(cs.fontWeight),
          align,
          valign,
          wrap: true,
          borders: [edge(cs.borderLeftWidth, cs.borderLeftStyle), edge(cs.borderRightWidth, cs.borderRightStyle), edge(cs.borderTopWidth, cs.borderTopStyle), edge(cs.borderBottomWidth, cs.borderBottomStyle)],
        },
      });
      for (let d = 1; d < down; d++) {
        const below = held.get(ri + d) ?? new Set<number>();
        for (let c = col; c < col + across; c++) below.add(c);
        held.set(ri + d, below);
      }
      col += across;
    }
    heights[ri] = Math.round(tr.getBoundingClientRect().height * pt * 4) / 4 || undefined;
  });
  if (cells.length === 0) return null;
  const columns = Math.max(widths.length, ...cells.map((c) => c.col + c.colSpan));
  while (widths.length < columns) widths.push(8.43);
  return { kind: "sheet", name: table.getAttribute("data-xl-sheet") ?? "", widths, heights, rowCount: rows.length, cells };
}

function structural(el: Element): boolean {
  return el.tagName === "TABLE" || el.classList.contains("field") || el.classList.contains("doc-header") || !!el.querySelector("table, .field, .doc-header") || blockish(el);
}

function walk(el: Element, out: ExportBlock[]): void {
  if (skipped(el)) return;
  if (el instanceof HTMLTableElement) {
    const block = el.hasAttribute("data-paper-sheet") ? sheetBlock(el) : tableBlock(el);
    if (block) out.push(block);
    return;
  }
  if (el.classList.contains("doc-header")) {
    // The paper's letterhead table (F/QC/25) and its lines under the company's name (REQUIREMENTS §111 part 6) go
    // into the file as the header block prints them, in their order.
    for (const part of Array.from(el.querySelectorAll(".doc-letterhead, .company-name, .company-lines, .doc-title"))) {
      if (part.classList.contains("doc-letterhead")) {
        const table = part.querySelector("table");
        const block = table instanceof HTMLTableElement ? tableBlock(table) : null;
        if (block) out.push(block);
      } else if (part.classList.contains("company-lines")) {
        for (const line of Array.from(part.children)) {
          const text = clean(textOf(line));
          if (text) out.push({ kind: "text", text, strong: false });
        }
      } else {
        const text = clean(textOf(part));
        if (text) out.push({ kind: "text", text, strong: true, title: true });
      }
    }
    const meta = Array.from(el.querySelectorAll(".meta-cell")).flatMap((c) => [{ text: clean(textOf(c.querySelector(".k") ?? c)) }, cellFrom([c.querySelector(".v") ?? c])]);
    // The Format No. / Rev No. / Date / Page row is a band across the page, not a grid: however many cells the paper
    // prints in it, it never turns the page (utils/docx.ts).
    if (meta.length > 0) out.push({ kind: "table", rows: [meta], headerRows: 0, band: true });
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
    if (last?.kind === "fields" && !closedFields.has(last)) {
      // A box in its column of the line (paperColumn: F/QC/11's Due Date, an incoming record's Date of Inspection, at the right) leaves the columns before it empty.
      const column = Number(el.getAttribute("data-paper-column")) || 0;
      if (last.perLine && column > 1 && column <= last.perLine) while (last.pairs.length % last.perLine !== column - 1) last.pairs.push(["", { text: "" }]);
      last.pairs.push([name, cell]);
    } else out.push({ kind: "fields", pairs: [[name, cell]] });
    return;
  }
  // THE BOXES AS MANY TO A LINE AS THE PAPER DRAWS THEM (REQUIREMENTS §117): a sheet's boxes above the grid stand three
  // to a line on F/QC/12 and F/QC/11 (LogSheetLayout.headerColumns, drawn as .sheet-boxes-paper); the file lays them so.
  const perLine = el.classList.contains("sheet-boxes-paper") ? Number((el as HTMLElement).style.getPropertyValue("--paper-box-columns")) || 0 : 0;
  const lineBlock: ExportBlock | null = perLine > 1 ? { kind: "fields", pairs: [], perLine } : null;
  if (lineBlock) out.push(lineBlock);
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
  if (lineBlock) {
    closedFields.add(lineBlock);
    if (lineBlock.pairs.length === 0) out.splice(out.indexOf(lineBlock), 1);
  }
}

/** The blocks of boxes whose line is complete: a box after them starts a block of its own. */
const closedFields = new WeakSet<ExportBlock>();

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
export function workbookFromBlocks(sheetName: string, blocks: ExportBlock[], envelope?: RoundTripEnvelope, paper?: "portrait" | "landscape"): Uint8Array<ArrayBuffer> {
  type Anchor = { col: number; text: string; grid: number };
  type XCell = { text: string; style: number; date?: string; number?: boolean; pieces?: { bind: ExportBinding; pre: string; post: string }[]; anchor?: Anchor };
  const rows: XCell[][] = [];
  const widths: number[] = [];
  // A paper sheet's own measures: merged ranges, row heights (points), and the cell formats it needs beyond the eight below.
  const merges: string[] = [];
  const heightsAt = new Map<number, number>();
  const fixedWidths: number[] = [];
  const paperFonts: { size: number; bold: boolean; underline: boolean }[] = [];
  const paperBorders: string[] = [];
  const paperXfs: string[] = [];
  const paperXfAt = new Map<string, number>();
  let sheetTitle = "";
  const BASE_XFS = 8;
  const BASE_FONTS = 3;
  const BASE_BORDERS = 2;
  const ink = '<color rgb="FF000000"/>';
  const edgeXml = (tag: string, level: number) => (level === 0 ? `<${tag}/>` : `<${tag} style="${level === 1 ? "thin" : "medium"}">${ink}</${tag}>`);
  const paperXf = (st: SheetStyle, edges: [number, number, number, number], numberCell: boolean): number => {
    const key = JSON.stringify([st.size, st.bold, !!st.underline, st.align, st.valign, st.wrap, edges, numberCell]);
    const known = paperXfAt.get(key);
    if (known !== undefined) return known;
    let font = paperFonts.findIndex((f) => f.size === st.size && f.bold === st.bold && f.underline === !!st.underline);
    if (font < 0) font = paperFonts.push({ size: st.size, bold: st.bold, underline: !!st.underline }) - 1;
    const borderXml = `<border>${edgeXml("left", edges[0])}${edgeXml("right", edges[1])}${edgeXml("top", edges[2])}${edgeXml("bottom", edges[3])}<diagonal/></border>`;
    let border = paperBorders.indexOf(borderXml);
    if (border < 0) border = paperBorders.push(borderXml) - 1;
    const alignment = `<alignment horizontal="${st.align}" vertical="${st.valign === "center" ? "center" : st.valign}"${st.wrap ? ' wrapText="1"' : ""}/>`;
    // A number a person wrote stays a number (the Sl.No, "3 glue boards"); everything else is text, so a code like 0101 keeps its zero.
    const xf = `<xf numFmtId="${numberCell ? 0 : 49}" fontId="${BASE_FONTS + font}" fillId="0" borderId="${BASE_BORDERS + border}" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1">${alignment}</xf>`;
    paperXfs.push(xf);
    paperXfAt.set(key, BASE_XFS + paperXfs.length - 1);
    return BASE_XFS + paperXfs.length - 1;
  };
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
    } else if (block.kind === "paper") {
      continue;
    } else if (block.kind === "sheet") {
      gap();
      const base = rows.length;
      if (block.name) sheetTitle = block.name;
      for (let r = 0; r < block.rowCount; r++) rows.push([]);
      block.widths.forEach((w, ci) => (fixedWidths[ci] = w));
      block.heights.forEach((h, ri) => h !== undefined && heightsAt.set(base + ri, h));
      for (const c of block.cells) {
        const lastRow = c.row + c.rowSpan - 1;
        const lastCol = c.col + c.colSpan - 1;
        if (c.rowSpan > 1 || c.colSpan > 1) merges.push(`${columnName(c.col)}${base + c.row + 1}:${columnName(lastCol)}${base + lastRow + 1}`);
        // A merged cell draws its edges on the cells around the range, as Excel does.
        for (let r = c.row; r <= lastRow; r++) {
          for (let k = c.col; k <= lastCol; k++) {
            const edges: [number, number, number, number] = [k === c.col ? c.style.borders[0] : 0, k === lastCol ? c.style.borders[1] : 0, r === c.row ? c.style.borders[2] : 0, r === lastRow ? c.style.borders[3] : 0];
            const origin = r === c.row && k === c.col;
            const isNumber = origin && !c.date && NUMBER_RE.test(c.text);
            rows[base + r][k] = origin
              ? { text: c.text, style: paperXf(c.style, edges, isNumber), date: undefined, number: isNumber, pieces: piecesFor(c.parts) }
              : { text: "", style: paperXf(c.style, edges, false) };
          }
        }
      }
      for (let r = 0; r < block.rowCount; r++) for (let k = 0; k < block.widths.length; k++) if (!rows[base + r][k]) rows[base + r][k] = { text: "", style: 0 };
    } else if (block.kind === "fields") {
      gap();
      // As many boxes to a line as the paper draws them (REQUIREMENTS §117), a label and its box a pair of cells each.
      const perLine = block.perLine && block.perLine > 1 ? block.perLine : 1;
      for (let at = 0; at < block.pairs.length; at += perLine) {
        const line: XCell[] = [];
        block.pairs.slice(at, at + perLine).forEach(([label, cell], i) => {
          measure(i * 2, label);
          measure(i * 2 + 1, cell.text);
          line.push({ text: label, style: 1 }, { text: cell.text, style: cell.date ? 5 : 3, date: cell.date, pieces: piecesFor(cell.parts) });
        });
        rows.push(line);
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
  const sheetData = rows
    .map((r, ri) => {
      const h = heightsAt.get(ri);
      return `<row r="${ri + 1}"${h ? ` ht="${h}" customHeight="1"` : ""}>${r.map((c, ci) => cellXml(c, `${columnName(ci)}${ri + 1}`)).join("")}</row>`;
    })
    .join("");
  const safeName = ((sheetTitle || sheetName).replace(/[\\/?*[\]:]/g, "-").slice(0, 31) || "Document").replace(/'/g, "");
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
        `<numFmts count="1"><numFmt numFmtId="164" formatCode="[$-409]dd\\-mm\\-yy"/></numFmts>` +
        `<fonts count="${BASE_FONTS + paperFonts.length}"><font><sz val="10"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="10"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="12"/><name val="Calibri"/><family val="2"/></font>` +
        paperFonts.map((f) => `<font>${f.bold ? "<b/>" : ""}${f.underline ? "<u/>" : ""}<sz val="${f.size}"/><name val="Calibri"/><family val="2"/></font>`).join("") +
        `</fonts>` +
        `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7E9EE"/><bgColor indexed="64"/></patternFill></fill></fills>` +
        `<borders count="${BASE_BORDERS + paperBorders.length}"><border><left/><right/><top/><bottom/><diagonal/></border><border>${thin}</border>${paperBorders.join("")}</borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="${BASE_XFS + paperXfs.length}">` +
        `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
        `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
        `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
        `<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
        `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>` +
        `<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>` +
        `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>` +
        `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf>` +
        paperXfs.join("") +
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
        `<cols>${Array.from({ length: columns }, (_, i) => `<col min="${i + 1}" max="${i + 1}" width="${fixedWidths[i] ?? widths[i] ?? 10}" customWidth="1"/>`).join("")}</cols>` +
        `<sheetData>${sheetData}</sheetData>` +
        (merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "") +
        `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>` +
        // Printed from Excel: one page wide, as many pages down as it takes.
        // ...on the paper's own page where the layout names it (REQUIREMENTS §117), else as its width needs.
        `<pageSetup paperSize="9" orientation="${paper ?? (columns > 6 ? "landscape" : "portrait")}" fitToWidth="1" fitToHeight="0"/>` +
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
    if (b.kind === "fields") {
      const perLine = b.perLine && b.perLine > 1 ? b.perLine : 1;
      if (perLine === 1) return { type: "table", rows: b.pairs.map(([label, cell]) => [label, cellOfWord(cell, label)]), boldFirstColumn: true };
      // As many boxes to a line as the paper draws them (REQUIREMENTS §117): each line a row of label, box, label, box ...
      const rows: DocxCell[][] = [];
      for (let at = 0; at < b.pairs.length; at += perLine) rows.push(b.pairs.slice(at, at + perLine).flatMap(([label, cell]) => [label, cellOfWord(cell, label)]));
      return { type: "table", rows, labelColumns: true };
    }
    if (b.kind === "paper") {
      return {
        type: "paper",
        widths: b.widths,
        rows: b.rows.map((r) => ({ height: r.height, cells: r.cells.map((c) => ({ ...c, text: cellOfWord(c) })) })),
        indent: b.indent,
        pageBreakBefore: b.pageBreakBefore,
        spaceAfter: b.spaceAfter,
      };
    }
    if (b.kind === "sheet") {
      // A sheet in a Word file: its rows of cells in their columns, the words of each merged cell in its first cell.
      const grid: DocxCell[][] = Array.from({ length: b.rowCount }, () => Array.from({ length: b.widths.length }, () => "" as DocxCell));
      for (const c of b.cells) grid[c.row][c.col] = cellOfWord(c);
      return { type: "table", rows: grid.filter((r) => r.some((x) => (typeof x === "string" ? x : "x") !== "")), headerRows: 0 };
    }
    const rows = b.rows.map((r) => r.map((c) => cellOfWord(c)));
    const block: DocxBlock = { type: "table", rows, headerRows: b.headerRows, ...(b.band ? { band: true as const } : {}) };
    if (builder && b.bindTable) {
      const fixed = b.rows.filter((r, ri) => ri < b.headerRows || !r.some(isBound)).map((r) => rowSignature(r.map((c) => c.text)));
      const table = builder.addTable(b.bindTable, { headerRows: b.headerRows, ...(fixed.length ? { fixedRows: fixed } : {}) });
      block.caption = `dcrs:t${table.t}`;
    }
    return block;
  });
}

/** The blocks as a Word document; given an envelope, with the map of its bound values. */
export function wordDocumentFromBlocks(blocks: ExportBlock[], envelope?: RoundTripEnvelope, paper?: "portrait" | "landscape", margins?: { top: number; right: number; bottom: number; left: number }): Uint8Array<ArrayBuffer> {
  if (!envelope) return buildDocx(wordBlocksFrom(blocks), { ...(paper ? { paper } : {}), ...(margins ? { margins } : {}) });
  const builder = new ExportMapBuilder();
  const docxBlocks = wordBlocksFrom(blocks, builder);
  const json = mapJson(envelope, builder.entries, builder.tables);
  return buildDocx(docxBlocks, {
    customXml: { xml: `<dcrsMap xmlns="${MAP_XML_NAMESPACE}">${xmlText(json)}</dcrsMap>`, schema: MAP_XML_NAMESPACE },
    customProperties: [[ENVELOPE_PROPERTY, envelopePropertyValue(envelope)]],
    ...(paper ? { paper } : {}),
    ...(margins ? { margins } : {}),
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

/** The envelope of a file holding these blocks: every record given, and any a bound value belongs to; undefined when none. */
export function envelopeFor(
  kind: "xlsx" | "docx",
  doc: Pick<DocumentDefinition, "id" | "formatNo" | "revisionNo">,
  blocks: ExportBlock[],
  recordIds: string[],
  exportedAt?: string
): RoundTripEnvelope | undefined {
  const ids = [...recordIds];
  const note = (parts: ExportSegment[] | undefined) => {
    for (const p of parts ?? []) if (p.bind?.recordId) ids.push(p.bind.recordId);
  };
  for (const b of blocks) {
    if (b.kind === "text") note(b.parts);
    else if (b.kind === "fields") for (const [, c] of b.pairs) note(c.parts);
    else if (b.kind === "sheet") for (const c of b.cells) note(c.parts);
    else if (b.kind === "paper") for (const r of b.rows) for (const c of r.cells) note(c.parts);
    else {
      for (const r of b.rows) for (const c of r) note(c.parts);
      if (b.bindTable) ids.push(b.bindTable.recordId);
    }
  }
  const unique = Array.from(new Set(ids.filter(Boolean)));
  return unique.length ? makeEnvelope(kind, { documentId: doc.id, formatNo: doc.formatNo, revisionNo: doc.revisionNo }, unique, exportedAt) : undefined;
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
  exportedAt?: string,
  /** The paper's own orientation (LogSheetLayout.paper, REQUIREMENTS §117), where the layout names it. */
  paper?: "portrait" | "landscape"
): Uint8Array<ArrayBuffer> {
  // Every record the file holds: those given, and any a bound value belongs to.
  const ids = [...recordIds];
  const note = (parts: ExportSegment[] | undefined) => {
    for (const p of parts ?? []) if (p.bind?.recordId) ids.push(p.bind.recordId);
  };
  for (const b of blocks) {
    if (b.kind === "text") note(b.parts);
    else if (b.kind === "fields") for (const [, c] of b.pairs) note(c.parts);
    else if (b.kind === "sheet") for (const c of b.cells) note(c.parts);
    else if (b.kind === "paper") for (const r of b.rows) for (const c of r.cells) note(c.parts);
    else {
      for (const r of b.rows) for (const c of r) note(c.parts);
      if (b.bindTable) ids.push(b.bindTable.recordId);
    }
  }
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const envelope = unique.length ? makeEnvelope(kind, { documentId: doc.id, formatNo: doc.formatNo, revisionNo: doc.revisionNo }, unique, exportedAt) : undefined;
  if (kind === "xlsx") return workbookFromBlocks(knownFormatNo(doc as DocumentDefinition) || doc.name, blocks, envelope, paper);
  // A page drawn as the company's Word original names its own margins (the "paper" blocks, utils/paperSheets.ts).
  return wordDocumentFromBlocks(blocks, envelope, paper, blocks.some((b) => b.kind === "paper") ? paperMarginsOf(doc.id) : undefined);
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
    const read = documentBlocks(live.length ? live : roots);
    // A document supplied as a workbook downloads on its original's own grid (utils/paperSheets.ts, REQUIREMENTS §118).
    const blocks = (kind === "xlsx" ? paperSheetBlocks(doc.id, read) : paperWordBlocks(doc.id, read)) ?? read;
    const name = documentFileName(doc, dateISO);
    // THE OWNER'S OWN FILE (REQUIREMENTS §119): where he supplied the document as Word or Excel, the download is his file
    // filled with what the page shows. Anything it cannot do falls back to the file made from the page below.
    try {
      const own = await originalFileBytes(doc.id, read, envelopeFor(kind, doc, read, recordIdsIn(live.length ? live : roots)));
      if (own && own.kind === kind) {
        downloadBlob(`${name}.${kind}`, new Blob([own.bytes], { type: kind === "xlsx" ? XLSX_TYPE : DOCX_TYPE }));
        return kind;
      }
    } catch {
      /* the generic download below */
    }
    // The paper's own page (§117), where the sheet names it.
    const paper = paperPageOf(doc.id) ?? (live.length ? live : roots).map(paperOf).find((p) => p !== null) ?? undefined;
    const bytes = documentFileBytes(kind, doc, blocks, recordIdsIn(live.length ? live : roots), undefined, paper);
    downloadBlob(`${name}.${kind}`, new Blob([bytes], { type: kind === "xlsx" ? XLSX_TYPE : DOCX_TYPE }));
    return kind;
  } catch {
    // A download that cannot be made must never be a page error (REQUIREMENTS §81 rules).
    return "pdf";
  }
}
