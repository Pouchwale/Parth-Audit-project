import { TBC, type DocumentDefinition } from "../types";
import { buildDocx, type DocxBlock } from "./docx";
import { isoToSerial, xmlText, zipStored } from "./xlsx";
import { downloadBlob } from "./csv";
import { formatDisplayDate, todayISO } from "./date";

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

export type DocumentFileKind = "xlsx" | "docx" | "pdf";

// Log sheets that are a form about one person or one position, not a grid.
// A certificate, a report or a card reads as a document, not as a spreadsheet:
// the three Certificates of Analysis, the analysis report, the minutes of a
// meeting and the customer's tolerance card download as Word (REQUIREMENTS §57).
const WORD_FORMS = new Set([
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

interface Cell {
  text: string;
  /** YYYY-MM-DD when the cell is only a date. */
  date?: string;
}

export type ExportBlock =
  | { kind: "text"; text: string; strong: boolean; title?: boolean }
  | { kind: "fields"; pairs: [string, Cell][] }
  | { kind: "table"; rows: Cell[][]; headerRows: number };

const SKIP = "button, .btn, .no-print, datalist, script, style, svg, template, noscript, [hidden], [aria-hidden='true'], input[type='file'], input[type='hidden']";

function skipped(el: Element): boolean {
  if (el.matches(SKIP)) return true;
  if (el.classList.contains("print-only")) return false;
  const style = getComputedStyle(el);
  return style.display === "none" || style.visibility === "hidden";
}

const blockish = (el: Element): boolean => {
  const display = getComputedStyle(el).display;
  return !display.startsWith("inline") && display !== "contents" && el.tagName !== "LABEL";
};

function textOf(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").replace(/\s+/g, " ");
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as Element;
  if (skipped(el)) return "";
  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox" || el.type === "radio") return el.checked ? " ☑ " : " ☐ ";
    if (el.type === "date") return el.value ? formatDisplayDate(el.value) : "";
    return el.value;
  }
  if (el instanceof HTMLSelectElement) return el.value ? (el.selectedOptions[0]?.textContent ?? el.value) : "";
  if (el instanceof HTMLTextAreaElement) return el.value;
  if (el.tagName === "BR") return "\n";
  if (el instanceof HTMLImageElement) return el.alt ?? "";
  const display = getComputedStyle(el).display;
  const between = display.includes("flex") || display.includes("grid") ? " " : "";
  const inner = Array.from(el.childNodes).map(textOf).join(between);
  return blockish(el) ? `\n${inner}\n` : inner;
}

const clean = (s: string) =>
  s
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

function cellOf(el: Element): Cell {
  const text = clean(textOf(el));
  const dates = Array.from(el.querySelectorAll("input[type='date']")) as HTMLInputElement[];
  if (dates.length === 1 && dates[0].value && text === formatDisplayDate(dates[0].value)) return { text, date: dates[0].value };
  return { text };
}

function tableBlock(table: HTMLTableElement): ExportBlock | null {
  const rows: Cell[][] = [];
  let headerRows = 0;
  for (const tr of Array.from(table.rows)) {
    if (skipped(tr)) continue;
    const cells: Cell[] = [];
    for (const cell of Array.from(tr.cells)) {
      if (skipped(cell)) continue;
      cells.push(cellOf(cell));
      for (let i = 1; i < cell.colSpan; i++) cells.push({ text: "" });
    }
    if (cells.length === 0) continue;
    rows.push(cells);
    if (tr.parentElement?.tagName === "THEAD") headerRows++;
  }
  return rows.length > 0 ? { kind: "table", rows, headerRows } : null;
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
    const meta = Array.from(el.querySelectorAll(".meta-cell")).flatMap((c) => [
      { text: clean(textOf(c.querySelector(".k") ?? c)) },
      { text: clean(textOf(c.querySelector(".v") ?? c)) },
    ]);
    if (meta.length > 0) out.push({ kind: "table", rows: [meta], headerRows: 0 });
    return;
  }
  const label = el.classList.contains("field") ? el.querySelector(":scope > label") : null;
  if (label) {
    const name = clean(textOf(label)).replace(/\s*\*$/, "");
    const value = Array.from(el.childNodes)
      .filter((n) => n !== label)
      .map(textOf)
      .join(" ");
    const dateInput = el.querySelector("input[type='date']") as HTMLInputElement | null;
    const cell: Cell = dateInput?.value ? { text: formatDisplayDate(dateInput.value), date: dateInput.value } : { text: clean(value) };
    const last = out[out.length - 1];
    if (last?.kind === "fields") last.pairs.push([name, cell]);
    else out.push({ kind: "fields", pairs: [[name, cell]] });
    return;
  }
  const children = Array.from(el.children).filter((c) => !skipped(c));
  if (!children.some(structural)) {
    const text = clean(textOf(el));
    if (text) out.push({ kind: "text", text, strong: /^H[1-6]$/.test(el.tagName) || /^(bold|[6-9]00)$/.test(getComputedStyle(el).fontWeight) });
    return;
  }
  let inline = "";
  const flush = () => {
    const text = clean(inline);
    if (text) out.push({ kind: "text", text, strong: false });
    inline = "";
  };
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as Element;
      if (skipped(child)) continue;
      if (structural(child)) {
        flush();
        walk(child, out);
      } else inline += textOf(child);
    } else inline += textOf(node);
  }
  flush();
}

/** The documents given, read as blocks, in order. */
export function documentBlocks(roots: Element[]): ExportBlock[] {
  const out: ExportBlock[] = [];
  for (const root of roots) walk(root, out);
  return out;
}

// ---------------------------------------------------------------------------
// the blocks as a workbook

const NUMBER_RE = /^-?(?:0|[1-9]\d{0,14})(?:\.\d+)?$/;

const columnName = (index: number) => {
  let s = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

// Styles: 0 plain · 1 bold · 2 title · 3 grid cell · 4 grid heading · 5 grid date · 6 grid number · 7 wrapped text
export function workbookFromBlocks(sheetName: string, blocks: ExportBlock[]): Uint8Array<ArrayBuffer> {
  type XCell = { text: string; style: number; date?: string; number?: boolean };
  const rows: XCell[][] = [];
  const widths: number[] = [];
  const measure = (ci: number, text: string) => {
    const longest = Math.max(0, ...text.split("\n").map((l) => l.length));
    widths[ci] = Math.min(48, Math.max(widths[ci] ?? 8, longest + 2));
  };
  const gap = () => {
    if (rows.length > 0 && rows[rows.length - 1].length > 0) rows.push([]);
  };
  let previous: ExportBlock["kind"] | null = null;
  for (const block of blocks) {
    if (block.kind === "text") {
      if (previous && previous !== "text") gap();
      rows.push([{ text: block.text, style: block.title ? 2 : block.strong ? 1 : 7 }]);
    } else if (block.kind === "fields") {
      gap();
      for (const [label, cell] of block.pairs) {
        measure(0, label);
        measure(1, cell.text);
        rows.push([
          { text: label, style: 1 },
          { text: cell.text, style: cell.date ? 5 : 3, date: cell.date },
        ]);
      }
    } else {
      gap();
      block.rows.forEach((row, ri) => {
        const header = ri < block.headerRows;
        rows.push(
          row.map((cell, ci) => {
            measure(ci, header ? cell.text.split("\n")[0] : cell.text);
            if (header) return { text: cell.text, style: 4 };
            if (cell.date) return { text: cell.text, style: 5, date: cell.date };
            if (NUMBER_RE.test(cell.text)) return { text: cell.text, style: 6, number: true };
            return { text: cell.text, style: 3 };
          })
        );
      });
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
  const parts: [string, string][] = [
    [
      "[Content_Types].xml",
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        `</Types>`,
    ],
    ["_rels/.rels", `<Relationships xmlns="${PACKAGE_REL}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="${xmlText(safeName).replace(/"/g, "&quot;")}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    [
      "xl/_rels/workbook.xml.rels",
      `<Relationships xmlns="${PACKAGE_REL}"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
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
  return zipStored(parts.map(([name, xml]) => ({ name, data: new TextEncoder().encode(declaration + xml) })));
}

// ---------------------------------------------------------------------------
// the blocks as a Word document

export function wordBlocksFrom(blocks: ExportBlock[]): DocxBlock[] {
  return blocks.map((b): DocxBlock => {
    if (b.kind === "text") return { type: "paragraph", text: b.text, bold: b.strong, size: b.title ? 24 : undefined, center: b.title };
    if (b.kind === "fields") return { type: "table", rows: b.pairs.map(([label, cell]) => [label, cell.text]), boldFirstColumn: true };
    return { type: "table", rows: b.rows.map((r) => r.map((c) => c.text)), headerRows: b.headerRows };
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

/** Downloads the documents on screen as the document's own kind of file. Returns the kind made ("pdf" means nothing was: print it). */
export function downloadDocumentFile(doc: DocumentDefinition, roots: Element[], dateISO?: string): DocumentFileKind {
  const kind = documentFileKind(doc);
  if (kind === "pdf" || roots.length === 0) return "pdf";
  const blocks = documentBlocks(roots);
  const name = documentFileName(doc, dateISO);
  if (kind === "xlsx") downloadBlob(`${name}.xlsx`, new Blob([workbookFromBlocks(knownFormatNo(doc) || doc.name, blocks)], { type: XLSX_TYPE }));
  else downloadBlob(`${name}.docx`, new Blob([buildDocx(wordBlocksFrom(blocks))], { type: DOCX_TYPE }));
  return kind;
}
