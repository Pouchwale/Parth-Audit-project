// THE PRINTED PAGE OF A DOWNLOAD (REQUIREMENTS §329): the owner's Excel files keep nothing in a printer's unprintable edge, his
// notes beside the paper stay off it, a paper running onto a second page has its headings again, a highlight he marked his
// example with goes with the example; a Word table runs no further than the paper; F-QC-40.C's fifty lines end above the print's foot.
//
// Run: npm run test:unit -- printedPage
import test from "node:test";
import assert from "node:assert/strict";
import { fillXlsx } from "../src/utils/originalFill/xlsxFill";
import { makeEnvelope, type ExportBinding } from "../src/engine/roundTrip/exportMap";
import { unzip, zipStored } from "../src/utils/xlsx";
import { COMPANY } from "../src/data/seed/masterData";
import type { Cell, ExportBlock } from "../src/utils/documentExport";
import { QC_PAPER_TABLES } from "../src/data/seed/qcPaperTables";
import { tablesOnThePaper } from "../src/utils/originalFill/docxFill";
import { all, parse } from "../src/utils/originalFill/xml";

const RID = "rec-test-1";
const enc = new TextEncoder();
const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const bound = (path: string, text: string, label: string, type: ExportBinding["type"] = "text"): Cell => {
  const bind: ExportBinding = { path, type, label, options: [], recordId: RID, text };
  return { text, parts: [{ text, bind }], bind };
};
const plain = (text: string): Cell => ({ text });
const cell = (ref: string, text: string, s = 0) => `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;

/** A register as the owner keeps it: margins of 0, a set scale, no print area, his example line marked red, his note beside it. */
function ownersWorkbook(): ArrayBuffer {
  const rows = [
    `<row r="1">${cell("A1", "GUJARAT PRINT PACK PUBLICATIONS PVT LTD")}</row>`,
    `<row r="2">${cell("A2", "TEST REGISTER")}${cell("D2", "F/QC/99 (00/01.12.2021)")}</row>`,
    `<row r="3">${cell("A3", "Sr. No.", 1)}${cell("B3", "Item", 1)}${cell("C3", "Qty", 1)}</row>`,
    `<row r="4">${cell("A4", "1", 1)}${cell("B4", "Glue", 2)}${cell("C4", "5", 1)}</row>`,
    `<row r="5">${cell("A5", "2", 1)}${cell("B5", "Bait", 1)}${cell("C5", "7", 1)}${cell("F5", "Bait added")}</row>`,
    `<row r="6">${cell("A6", "Checked by :")}</row>`,
  ].join("");
  const files: [string, string][] = [
    [
      "[Content_Types].xml",
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ],
    ["_rels/.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="Register" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`],
    [
      "xl/styles.xml",
      `<styleSheet xmlns="${MAIN}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFF0000"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1"/></cellXfs></styleSheet>`,
    ],
    [
      "xl/worksheets/sheet1.xml",
      `<worksheet xmlns="${MAIN}" xmlns:r="${REL}"><dimension ref="A1:F6"/><sheetData>${rows}</sheetData><pageMargins left="0" right="0" top="0.25" bottom="0" header="0" footer="0"/><pageSetup paperSize="9" scale="80" orientation="portrait"/></worksheet>`,
    ],
  ];
  return zipStored(files.map(([name, xml]) => ({ name, data: enc.encode(xml) }))).slice().buffer;
}

function blocks(): ExportBlock[] {
  const rows: Cell[][] = [[plain("Sr. No."), plain("Item"), plain("Qty")]];
  rows.push([plain("1"), bound("rows/@r0/item", "", "Item"), bound("rows/@r0/qty", "", "Qty", "number")]);
  rows.push([plain("2"), bound("rows/@r1/item", "Hook", "Item"), bound("rows/@r1/qty", "3", "Qty", "number")]);
  return [
    { kind: "text", text: COMPANY.name, strong: true, title: true },
    { kind: "text", text: "TEST REGISTER", strong: true, title: true },
    {
      kind: "table",
      rows,
      headerRows: 1,
      bindTable: { recordId: RID, listPath: "rows", columns: [{ key: "item", type: "text", options: [], col: 1, label: "Item" }, { key: "qty", type: "number", options: [], col: 2, label: "Qty" }] },
    },
  ];
}

async function part(bytes: Uint8Array, name: string): Promise<string> {
  const get = (await unzip(bytes.slice().buffer)).get(name);
  assert.ok(get, name);
  return new TextDecoder().decode(await get!());
}

test("the owner's workbook prints within the printable page, his notes and his highlight off it, its headings on every page", async () => {
  const env = makeEnvelope("xlsx", { documentId: "test-doc", formatNo: "F/QC/99", revisionNo: "00" }, [RID], "2026-11-24T10:00:00.000Z");
  const { bytes } = await fillXlsx(ownersWorkbook(), blocks(), { envelope: env, company: COMPANY.name });
  const [sheet, book, styles] = await Promise.all([part(bytes, "xl/worksheets/sheet1.xml"), part(bytes, "xl/workbook.xml"), part(bytes, "xl/styles.xml")]);
  // Margins of at least 5 mm, the set scale smaller by as much as the page lost (its pages stay as they were).
  assert.match(sheet, /<pageMargins left="0.2" right="0.2" top="0.25" bottom="0.2"/);
  const scale = Number(/scale="(\d+)"/.exec(sheet)![1]);
  assert.ok(scale < 80 && scale >= 74, `scale ${scale}`);
  // The note in F5 beside the register is not printed; the paper to its last column (D, the format number) is.
  assert.match(book, /<definedName name="_xlnm.Print_Area" localSheetId="0">'Register'!\$A\$1:\$D\$6<\/definedName>/);
  assert.match(book, /<definedName name="_xlnm.Print_Titles" localSheetId="0">'Register'!\$1:\$3<\/definedName>/);
  // The red marking the owner's example "Glue" goes with it: B4, emptied, has a style with no fill.
  const b4 = /<c r="B4" s="(\d+)"/.exec(sheet);
  assert.ok(b4, "B4 is on the sheet");
  const xfs = /<cellXfs[^>]*>(.*)<\/cellXfs>/.exec(styles)![1].match(/<xf [^>]*?(?:\/>|>.*?<\/xf>)/g)!;
  assert.match(xfs[Number(b4![1])], /fillId="0"/, "no red on the emptied cell");
  assert.match(xfs[Number(b4![1])], /borderId="1"/, "its ruling kept");
  assert.ok(!sheet.includes("Glue"), "the example gone");
});

test("F-QC-40.C's fifty lines end above the 9 mm the print keeps at the foot of a page", () => {
  const t = QC_PAPER_TABLES["qc-temperature"]!;
  const head = t.head.reduce((s, r) => s + r.h, 0) + t.body.reduce((s, r) => s + r.h, 0);
  const lines = t.lines!.h * t.lines!.count;
  // The sheet stands 12 mm from the top in print (the page's own head, §277), and its rules add about 3 mm (measured: 4.8 mm lines
  // ended at 288.2 mm, line 50 on page 2).
  assert.ok(12 + head + lines + 3 <= 297 - 9 - 1, `ends at about ${(12 + head + lines + 3).toFixed(1)} mm`);
});

test("a Word table wider than the paper is narrowed onto it, 6 mm from its edge; a table on the paper is untouched", () => {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const table = (cells: number[], ind = 0) =>
    `<w:tbl><w:tblPr><w:tblW w:w="${cells.reduce((a, b) => a + b, 0)}" w:type="dxa"/>${ind ? `<w:tblInd w:w="${ind}" w:type="dxa"/>` : ""}</w:tblPr>` +
    `<w:tblGrid>${cells.map((c) => `<w:gridCol w:w="${c}"/>`).join("")}</w:tblGrid>` +
    `<w:tr>${cells.map((c) => `<w:tc><w:tcPr><w:tcW w:w="${c}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`).join("")}</w:tr></w:tbl>`;
  // F/HR/11's: 393 mm of cells on A4 portrait (11909 twips), its left margin 806, indented -67.
  const doc = parse(`<w:document ${W}><w:body>${table([11000, 11278], -67)}${table([4000, 4000])}<w:sectPr><w:pgSz w:w="11909" w:h="16834"/><w:pgMar w:top="720" w:right="850" w:bottom="490" w:left="806"/></w:sectPr></w:body></w:document>`);
  const body = all(doc, "body")[0];
  tablesOnThePaper(body);
  const [wide, fine] = all(body, "tbl");
  const sum = (t: typeof wide, local: string) => all(t, local).reduce((s, e) => s + Number(e.attrs["w:w"]), 0);
  const ends = 806 - 67 + sum(wide, "tcW");
  assert.ok(ends <= 11909 - 340 && ends > 11909 - 340 - 10, `ends at ${ends}`);
  assert.ok(Math.abs(sum(wide, "gridCol") - sum(wide, "tcW")) <= 2, "its grid narrowed with its cells");
  assert.equal(sum(fine, "tcW"), 8000);
});
