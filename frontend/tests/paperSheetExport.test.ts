// A PAPER SHEET DOWNLOADS AS THE COMPANY'S OWN EXCEL SHEET (REQUIREMENTS §118; the owner, 17-Oct-2026: "whenever user download
// the Excel file or Word file, it should be real, which I have supplied to you"). A table marked data-paper-sheet is read
// as a sheet block (merged cells, the paper's column widths in Excel characters, row heights in points, fonts, the four
// edges of each cell), and the workbook is written with them: <mergeCells>, <cols>, row heights, Calibri in the paper's
// sizes, thin and medium borders, A4 fitted one page wide. This file proves the writer on the contractor's service report,
// laid out as the March-2026 sheet and the April-2026 workbook it is built from (the same six columns and merges).
//
// Run: npm run test:unit -- paperSheetExport
import test from "node:test";
import assert from "node:assert/strict";
import { workbookFromBlocks, type ExportBlock, type SheetCell, type SheetStyle } from "../src/utils/documentExport";
import { unzip } from "../src/utils/xlsx";

async function part(book: Uint8Array<ArrayBuffer>, name: string): Promise<string> {
  const zip = await unzip(book.slice().buffer);
  const entry = zip.get(name);
  assert.ok(entry, `${name} is in the workbook`);
  return new TextDecoder().decode(await entry!());
}

const st = (size: number, bold: boolean, align: SheetStyle["align"], borders: SheetStyle["borders"], valign: SheetStyle["valign"] = "center"): SheetStyle => ({ size, bold, align, valign, wrap: true, borders });
const cell = (row: number, col: number, textValue: string, style: SheetStyle, rowSpan = 1, colSpan = 1): SheetCell => ({ text: textValue, row, col, rowSpan, colSpan, style });

/** The March-2026 sheet in the grid the April-2026 workbook has: 6 columns, title, band, unit line, heading, 16 areas in two merged blocks. */
function marchSheet(): ExportBlock {
  const cells: SheetCell[] = [];
  cells.push(cell(0, 0, "Pest control Service Report", st(24, true, "left", [2, 2, 2, 1]), 1, 6));
  cells.push(cell(1, 0, "GURUDEV PEST CONTROL", st(11, true, "left", [2, 0, 1, 1]), 1, 3), cell(1, 3, "Service Name", st(11, true, "left", [1, 0, 1, 1]), 1, 2), cell(1, 5, "Date", st(11, true, "left", [2, 2, 2, 2])));
  cells.push(cell(2, 0, "Unit: GUJARAT PRINTPACK PUBLICATION PRIVATE LIMITED", st(11, true, "left", [2, 0, 1, 1]), 1, 3), cell(2, 3, "Rodent Control Service\n(Rat,Mice,Bandicoots)", st(11, true, "left", [1, 0, 1, 1]), 1, 2), cell(2, 5, "07.03.2026", st(11, true, "left", [1, 2, 0, 1])));
  ["Sl.No", "Area of Pesticide Applied", "Material Name", "Qty used\nNos/Grams", "Method of\nApplication", "Remarks"].forEach((h, i) => cells.push(cell(3, i, h, st(11, true, i === 1 || i === 5 ? "left" : "center", [i === 0 ? 2 : 1, i === 5 ? 2 : 1, 1, 2]))));
  for (let i = 0; i < 16; i++) {
    cells.push(cell(4 + i, 0, String(i + 1), st(11, false, "center", [2, 1, 0, i === 15 ? 2 : 1])), cell(4 + i, 1, `Area ${i + 1}`, st(12, false, "left", [1, 1, 0, i === 15 ? 2 : 1])));
  }
  cells.push(cell(4, 2, "Glue Board", st(11, false, "center", [1, 1, 1, 1]), 8), cell(4, 3, "3", st(11, false, "center", [1, 1, 1, 1]), 8), cell(4, 4, "Trouble gum placement", st(11, false, "center", [1, 1, 1, 1]), 8));
  cells.push(cell(12, 2, "Bromadiolone Cake", st(11, false, "center", [1, 1, 1, 2]), 8), cell(12, 3, "50 gramms", st(11, false, "center", [1, 1, 1, 2]), 8), cell(12, 4, "Baiting", st(11, false, "center", [1, 1, 1, 2]), 8));
  cells.push(cell(4, 5, "No Rodent Trapped", st(11, false, "center", [1, 2, 1, 2]), 16));
  cells.push(cell(20, 1, "", st(12, false, "center", [0, 0, 0, 0], "bottom")), cell(20, 2, "", st(12, false, "center", [0, 0, 0, 0], "bottom"), 1, 3));
  cells.push(cell(21, 1, "GPC Technician Sign", st(12, false, "center", [0, 0, 1, 2])), cell(21, 2, "Customer's representative sign", st(12, false, "center", [0, 0, 1, 2]), 1, 3));
  const heights: (number | undefined)[] = [32.25, 20.25, 31.5, 30.75, ...Array.from({ length: 16 }, (_, i) => (i % 5 === 1 ? 31.5 : 15.75)), 36, 18.6];
  return { kind: "sheet", name: "Service Report", widths: [9.29, 32.86, 18.29, 12.86, 15, 15.86], heights, rowCount: 22, cells };
}

test("the sheet's merged cells are the contractor's: the title, the band, the unit line, two blocks of eight, one remarks cell", async () => {
  const sheet = await part(workbookFromBlocks("S", [marchSheet()]), "xl/worksheets/sheet1.xml");
  const refs = Array.from(sheet.matchAll(/<mergeCell ref="([A-Z]+\d+:[A-Z]+\d+)"/g), (m) => m[1]);
  // The April-2026 workbook (source-documents/Service Report-April 2026.xls, sheet 1): the same cells and blocks.
  for (const want of ["A1:F1", "A2:C2", "D2:E2", "A3:C3", "D3:E3", "C5:C12", "D5:D12", "E5:E12", "C13:C20", "D13:D20", "E13:E20", "F5:F20"]) {
    assert.ok(refs.includes(want), `${want} is merged (${refs.join(" ")})`);
  }
  assert.match(sheet, /<mergeCells count="\d+">/);
});

test("the column widths are the workbook's Excel characters and the row heights its points", async () => {
  const sheet = await part(workbookFromBlocks("S", [marchSheet()]), "xl/worksheets/sheet1.xml");
  const widths = Array.from(sheet.matchAll(/<col min="(\d+)" max="\d+" width="([\d.]+)" customWidth="1"\/>/g), (m) => Number(m[2]));
  assert.deepEqual(widths, [9.29, 32.86, 18.29, 12.86, 15, 15.86]);
  const rows = Array.from(sheet.matchAll(/<row r="(\d+)" ht="([\d.]+)" customHeight="1">/g), (m) => [Number(m[1]), Number(m[2])]);
  assert.deepEqual(rows.slice(0, 4), [[1, 32.25], [2, 20.25], [3, 31.5], [4, 30.75]]);
});

test("the sheet is Calibri in the paper's sizes (24 bold title, 11, 12 for the areas), with thin and medium rules", async () => {
  const book = workbookFromBlocks("S", [marchSheet()]);
  const styles = await part(book, "xl/styles.xml");
  assert.ok(/<font><b\/><sz val="24"\/><name val="Calibri"\/>/.test(styles), "the 24 pt bold title");
  assert.ok(/<font><sz val="12"\/><name val="Calibri"\/>/.test(styles), "the 12 pt areas");
  assert.ok(/<font><b\/><sz val="11"\/><name val="Calibri"\/>/.test(styles), "the 11 pt bold band");
  assert.ok(styles.includes('style="medium"') && styles.includes('style="thin"'), "the frame is medium, the cell rules thin");
  const sheet = await part(book, "xl/worksheets/sheet1.xml");
  assert.match(sheet, /orientation="portrait"/);
  assert.match(sheet, /paperSize="9"/);
  assert.match(sheet, /fitToWidth="1"/);
  assert.match(sheet, /<pageSetUpPr fitToPage="1"\/>/);
});

test("the words sit in the top-left cell of each merged block; the cells it covers are empty and carry its edges", async () => {
  const sheet = await part(workbookFromBlocks("S", [marchSheet()]), "xl/worksheets/sheet1.xml");
  assert.match(sheet, /<c r="A1" s="\d+" t="inlineStr"><is><t xml:space="preserve">Pest control Service Report<\/t><\/is><\/c>/);
  assert.match(sheet, /<c r="C5" s="\d+" t="inlineStr"><is><t xml:space="preserve">Glue Board<\/t>/);
  assert.match(sheet, /<c r="C13" s="\d+" t="inlineStr"><is><t xml:space="preserve">Bromadiolone Cake<\/t>/);
  assert.match(sheet, /<c r="F5" s="\d+" t="inlineStr"><is><t xml:space="preserve">No Rodent Trapped<\/t>/);
  assert.match(sheet, /<c r="D5" s="\d+"><v>3<\/v><\/c>/, "a plain number a person wrote stays a number");
  assert.match(sheet, /<c r="C6" s="\d+"\/>/, "a cell under a merged block is empty");
  assert.match(sheet, /<c r="A5" s="\d+"><v>1<\/v><\/c>/, "the Sl.No is a number");
});

test("the workbook's sheet name is the sheet's own", async () => {
  const wb = await part(workbookFromBlocks("F-HR-99 a very long name that Excel would cut", [marchSheet()]), "xl/workbook.xml");
  assert.match(wb, /<sheet name="Service Report"/);
});

// ---------------------------------------------------------------------------
// The Word original's page (F/HR/18): a table laid in points, merged cells, the paper's faces and edges, A4 portrait.

import { wordDocumentFromBlocks, type PaperCellSpec } from "../src/utils/documentExport";
import { paperMarginsOf, paperPageOf } from "../src/utils/paperSheets";

const pcell = (words: string, o: Partial<PaperCellSpec> = {}): PaperCellSpec => ({ text: words, size: 20, bold: false, align: "left", valign: "top", borders: [4, 4, 4, 4], ...o });

test("a paper table is written in points: fixed widths, row heights, spanned and vertically merged cells, the paper's sizes", async () => {
  const blocks: ExportBlock[] = [
    {
      kind: "paper",
      widths: [160, 121, 126, 131],
      spaceAfter: 12.5,
      rows: [
        { height: 34.2, cells: [pcell("GUJARAT PRINT PACK PUBLICATIONS PVT LTD", { colSpan: 4, size: 40, bold: true, align: "center", borders: [12, 12, 12, 4] })] },
        { height: 20.8, cells: ["Format No.: F/HR/18", "Rev No: 02", "Date: 15.12.2024", "Page No.: 1 of 2"].map((w) => pcell(w, { size: 24, align: "center", valign: "center" })) },
      ],
    },
    {
      kind: "paper",
      widths: [63.7, 71.9],
      indent: 7.9,
      pageBreakBefore: true,
      rows: [
        { height: 28.9, cells: [pcell("PC-01", { bold: true, vMerge: "restart" }), pcell("")] },
        { height: 28.9, cells: [pcell("", { vMerge: "continue" }), pcell("")] },
      ],
    },
  ];
  const xml = new TextDecoder().decode(await (await unzip(wordDocumentFromBlocks(blocks, undefined, "portrait", { top: 18, right: 27.4, bottom: 18, left: 28.7 }).slice().buffer)).get("word/document.xml")!());
  assert.ok(xml.includes('<w:pgSz w:w="11906" w:h="16838"/>'), "A4 portrait");
  assert.ok(xml.includes('<w:pgMar w:top="360" w:right="548" w:bottom="360" w:left="574"'), "the paper's margins in twentieths of a point");
  assert.ok(xml.includes('<w:gridCol w:w="3200"/><w:gridCol w:w="2420"/><w:gridCol w:w="2520"/><w:gridCol w:w="2620"/>'), "the band's four columns at the paper's widths");
  assert.ok(xml.includes('<w:gridSpan w:val="4"/>'), "the company's name spans the four cells");
  assert.ok(xml.includes('<w:trHeight w:val="684" w:hRule="atLeast"/>'), "a row 34.2 pt tall");
  assert.ok(xml.includes('<w:sz w:val="40"/>'), "the name at 20 pt");
  assert.ok(xml.includes('<w:vMerge w:val="restart"/>') && xml.includes("<w:vMerge/>"), "the unit's number merged down its two lines");
  assert.ok(xml.includes('<w:tblInd w:w="158" w:type="dxa"/>'), "the grid 7.9 pt in from the margin");
  assert.ok(xml.includes('<w:br w:type="page"/>'), "the second page starts a page");
  assert.ok(xml.includes('<w:top w:val="single" w:sz="12"'), "the frame is a point and a half");
});

test("F/HR/18 and the service reports name their own page: A4 portrait with the paper's margins; other documents name none", () => {
  assert.equal(paperPageOf("fly-catcher"), "portrait");
  assert.deepEqual(paperMarginsOf("fly-catcher"), { top: 18, right: 27.4, bottom: 18, left: 28.7 });
  // The contractor's 576 pt sheet on the A4 page (REQUIREMENTS s154 item 8).
  assert.equal(paperPageOf("service-report-rodent"), "portrait");
  assert.deepEqual(paperMarginsOf("service-report-fly"), { top: 20, right: 9.5, bottom: 20, left: 9.8 });
  assert.equal(paperPageOf("hr-daily-cleaning"), undefined);
  assert.equal(paperMarginsOf("hr-daily-cleaning"), undefined);
});
