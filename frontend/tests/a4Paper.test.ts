// THE QC AND HR DOCUMENTS ON A4, AS THEIR PAPERS (REQUIREMENTS §117, the owner, 16-Oct-2026): "Download formatting
// reqd.", "After download setting not ok", every QC and HR document printed on A4 complete, "portrait or landscape as the
// paper is", the header block and the paper's foot lines on every printed page, and the same sheet in the preview and in
// every download. What this file holds:
//
//   * each paper's orientation named on its layout (F/QC/11, F/QC/12, F/HR/15 and F/HR/16 landscape; F/QC/17 portrait)
//     and carried on the sheet as data-paper, for the print (utils/print.ts) and the files (utils/documentExport.ts);
//   * the sheet drawn in three parts — head, body, foot — in that order, the header block in the head, the grid in the
//     body, the PROCEDURE and the boxes below the grid in the foot (components/records/LogSheetRecordView.tsx);
//   * the print rules (styles.css): the parts a table's header, body and footer groups, every grid cell boxed in ink,
//     the parts kept whole on a page;
//   * a Word file set up on the paper's page whatever its grid's width, and a workbook likewise (utils/docx.ts,
//     utils/documentExport.ts);
//   * the boxes above the grid laid as many to a line as the paper draws them, in Word and in Excel.
//
// Run: npm run test:unit -- a4Paper
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import type { DocumentDefinition, LogSheetData, MasterData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrMasterSeeded } from "../src/data/repositories/hrMasterRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { createDefaultData } from "../src/engine/recordDefaults";
import { buildDocx, type DocxBlock } from "../src/utils/docx";
import { wordBlocksFrom, workbookFromBlocks, type ExportBlock } from "../src/utils/documentExport";
import { unzip } from "../src/utils/xlsx";

if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "#/dashboard", hostname: "localhost" }, configurable: true, writable: true });
}

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrMasterSeeded();
const master: MasterData = masterRepository.get();
const DAY = "2026-10-16";

const docOf = (id: string): DocumentDefinition => {
  const doc = documentRepository.getById(id);
  assert.ok(doc, id);
  return doc!;
};

async function sheet(documentId: string, data: LogSheetData): Promise<string> {
  const [view, auth, store, router] = await Promise.all([
    import("../src/components/records/LogSheetRecordView"),
    import("../src/store/AuthContext"),
    import("../src/store/AppStore"),
    import("../src/store/router"),
  ]);
  const record = {
    id: `a4-${documentId}`,
    documentId,
    periodKey: `${documentId}:${DAY}`,
    dueDate: DAY,
    status: "In Progress",
    isDemo: false,
    data,
    createdAt: `${DAY}T03:00:00.000Z`,
    updatedAt: `${DAY}T03:00:00.000Z`,
  } as RecordInstance<LogSheetData>;
  return renderToStaticMarkup(
    h(auth.AuthProvider, null, h(store.AppStoreProvider, null, h(router.RouterProvider, null, h(view.LogSheetRecordView, { doc: docOf(documentId), record, editable: false, onChange: () => undefined }))))
  );
}

const blankSheet = (id: string) => sheet(id, createDefaultData(docOf(id), DAY, master) as LogSheetData);

async function partOf(bytes: Uint8Array<ArrayBuffer>, name: string): Promise<string> {
  const zip = await unzip(bytes.slice().buffer);
  const part = zip.get(name);
  return part ? new TextDecoder().decode(await part()) : "";
}
const cells = (n: number): string[] => Array.from({ length: n }, (_, i) => `c${i + 1}`);
const LANDSCAPE = 'w:orient="landscape"';

// ---------------------------------------------------------------------------

test("each paper's orientation is named on its layout: F/QC/11, F/QC/12, F/HR/15 and F/HR/16 landscape, F/QC/17 portrait, the rest by their width", () => {
  const paper = (id: string) => getLogSheetLayout(id)?.paper;
  assert.equal(paper("qc-gsm-plate-calibration"), "landscape");
  assert.equal(paper("qc-weight-scale-calibration"), "landscape");
  assert.equal(paper("hr-daily-cleaning"), "landscape");
  assert.equal(paper("hr-monthly-cleaning"), "landscape");
  assert.equal(paper("qc-ruler-verification"), "portrait");
  assert.equal(paper("qc-viscosity"), undefined, "F-QC-30 says nothing: its width decides, as before");
});

test("a sheet is drawn in three parts, head, body and foot, the paper's orientation on it: F/QC/12", async () => {
  const html = await blankSheet("qc-weight-scale-calibration");
  assert.match(html, /<div class="paper-sheet[^"]*"[^>]*data-paper="landscape"/, "the root carries the paper");
  const head = html.indexOf('class="paper-head"');
  const body = html.indexOf('class="paper-body"');
  const foot = html.indexOf('class="paper-foot"');
  assert.ok(head >= 0 && body > head && foot > body, `head ${head}, body ${body}, foot ${foot}`);
  assert.ok(html.indexOf('class="doc-header"') > head && html.indexOf('class="doc-header"') < body, "the header block is the head");
  assert.ok(html.indexOf("log-sheet") > body && html.indexOf("log-sheet") < foot, "the grid is in the body");
  assert.ok(html.indexOf('data-section="notes-below"') > foot, "the PROCEDURE is a foot line");
  assert.ok(html.indexOf("Calibration to be done by qualified QA person") > foot);
});

test("F/QC/17 is a portrait page; F/QC/11's foot holds its PROCEDURE; a sheet whose layout names no paper carries none", async () => {
  assert.match(await blankSheet("qc-ruler-verification"), /class="paper-sheet[^"]*"[^>]*data-paper="portrait"/);
  const gsm = await blankSheet("qc-gsm-plate-calibration");
  assert.match(gsm, /data-paper="landscape"/);
  assert.ok(gsm.indexOf('data-section="notes-below"') > gsm.indexOf('class="paper-foot"'));
  const viscosity = await blankSheet("qc-viscosity");
  assert.ok(!viscosity.includes("data-paper="), "nothing named, nothing carried");
  assert.ok(viscosity.includes('class="paper-head"') && viscosity.includes('class="paper-foot"'), "the three parts on every sheet");
});

test("the print rules: the parts are a table's header, body and footer groups, every grid cell is boxed in ink, and the parts stay whole", () => {
  const css = readFileSync(path.join(process.cwd(), "frontend", "src", "styles.css"), "utf8");
  const print = css.slice(css.indexOf("@media print {\n  .app-sidebar"));
  const block = print.slice(0, print.indexOf("\n}\n") + 3);
  assert.ok(block.length > 1000, "the main print block is found");
  for (const rule of [
    ".paper-sheet { display: table; width: 100%;",
    ".paper-head { display: table-header-group; }",
    ".paper-body { display: table-row-group; }",
    ".paper-foot { display: table-footer-group; }",
    ".paper-sheet .doc-table table th, .paper-sheet .doc-table table td { border: 1px solid #000; }",
    '.paper-sheet .doc-table table.log-sheet tbody tr[data-line="first"] td { border-bottom-style: dotted; }',
    ".doc-header { break-after: avoid; }",
    'thead { display: table-header-group; }',
    "tr, img { break-inside: avoid; }",
  ]) {
    assert.ok(block.includes(rule), `the print block holds: ${rule}`);
  }
  assert.match(block, /\.paper-head, \.paper-foot, \[data-section="sheet-boxes"\][^{]*\{ break-inside: avoid; \}/, "the parts and the boxes stay whole");
  assert.ok(!css.slice(0, css.indexOf("@media print")).includes(".paper-head {"), "on screen the parts are plain blocks (no screen rule)");
  assert.ok(css.includes("html.print-scoped .paper-sheet .doc-table table th, html.print-scoped .paper-sheet .doc-table table td { border: 1px solid #000; }"), "the borders are on while the sheet is measured for the page");
});

test("a Word file is set up on the paper's page whatever its grid's width; without a paper named, the width decides as before", async () => {
  const narrow: DocxBlock = { type: "table", rows: [cells(2), cells(2)], headerRows: 1 };
  const wide: DocxBlock = { type: "table", rows: [cells(9), cells(9)], headerRows: 1 };
  assert.ok((await partOf(buildDocx([narrow], { paper: "landscape" }), "word/document.xml")).includes(LANDSCAPE), "F/QC/11's two-column boxes still print landscape");
  assert.ok(!(await partOf(buildDocx([wide], { paper: "portrait" }), "word/document.xml")).includes(LANDSCAPE), "a portrait paper stays portrait");
  assert.ok((await partOf(buildDocx([wide]), "word/document.xml")).includes(LANDSCAPE), "nine columns turn the page when nothing is said");
  assert.ok(!(await partOf(buildDocx([narrow]), "word/document.xml")).includes(LANDSCAPE));
});

test("a workbook is set up on the paper's page likewise", async () => {
  const grid = (n: number): ExportBlock => ({ kind: "table", rows: [cells(n).map((text) => ({ text })), cells(n).map((text) => ({ text }))], headerRows: 1 });
  const setup = async (blocks: ExportBlock[], paper?: "portrait" | "landscape") => (await partOf(workbookFromBlocks("S", blocks, undefined, paper), "xl/worksheets/sheet1.xml")).match(/orientation="(\w+)"/)?.[1];
  assert.equal(await setup([grid(9)], "portrait"), "portrait");
  assert.equal(await setup([grid(2)], "landscape"), "landscape");
  assert.equal(await setup([grid(9)]), "landscape", "as before where nothing is said");
  assert.equal(await setup([grid(2)]), "portrait");
});

test("the boxes above the grid lie as many to a line as the paper draws them, in Word and in Excel", async () => {
  const pairs: [string, { text: string }][] = Array.from({ length: 7 }, (_, i) => [`Box ${i + 1}:`, { text: `v${i + 1}` }]);
  const threeALine: ExportBlock = { kind: "fields", pairs, perLine: 3 };
  const oneALine: ExportBlock = { kind: "fields", pairs };
  const [word] = wordBlocksFrom([threeALine]);
  assert.equal(word.type, "table");
  if (word.type === "table") {
    assert.deepEqual(word.rows.map((r) => r.length), [6, 6, 2], "three label-and-box pairs a row, the last row the rest");
    assert.deepEqual(word.rows[0], ["Box 1:", "v1", "Box 2:", "v2", "Box 3:", "v3"]);
    assert.equal(word.labelColumns, true);
    assert.equal(word.headerRows, undefined, "no heading row: it never turns the page");
  }
  const xml = await partOf(buildDocx([word]), "word/document.xml");
  assert.ok(!xml.includes(LANDSCAPE), "six cells of boxes are not a grid");
  const [plain] = wordBlocksFrom([oneALine]);
  assert.ok(plain.type === "table" && plain.rows.every((r) => r.length === 2) && plain.boldFirstColumn === true, "as before without a line");
  const sheetXml = await partOf(workbookFromBlocks("S", [threeALine]), "xl/worksheets/sheet1.xml");
  const firstRow = sheetXml.match(/<row r="1"[^>]*>([\s\S]*?)<\/row>/)?.[1] ?? "";
  assert.equal((firstRow.match(/<c /g) ?? []).length, 6, "the first line of the workbook holds three boxes");
  assert.ok(firstRow.includes("Box 3:") && firstRow.includes("v3"));
  const lastRow = sheetXml.match(/<row r="3"[^>]*>([\s\S]*?)<\/row>/)?.[1] ?? "";
  assert.equal((lastRow.match(/<c /g) ?? []).length, 2);
});
