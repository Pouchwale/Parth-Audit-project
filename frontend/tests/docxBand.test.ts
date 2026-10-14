// THE FORMAT NO. / REV NO. ROW NEVER TURNS THE PAGE (utils/docx.ts, utils/documentExport.ts).
//
// Since REQUIREMENTS §111 a paper's header band can print more cells than before
// (F/HR/05's came to ten), and a Word download of a five-column form turned
// landscape: the page-turning rule counted the band as a table of more than
// eight columns. The band is marked, and only the grids decide the page.
// Run: npm run test:unit -- docxBand
import test from "node:test";
import assert from "node:assert/strict";
import { buildDocx, type DocxBlock } from "../src/utils/docx";
import { wordBlocksFrom, type ExportBlock } from "../src/utils/documentExport";
import { unzip } from "../src/utils/xlsx";

async function xmlOf(blocks: DocxBlock[]): Promise<string> {
  const zip = await unzip(buildDocx(blocks).slice().buffer);
  const part = zip.get("word/document.xml");
  return part ? new TextDecoder().decode(await part()) : "";
}
const cells = (n: number): string[] => Array.from({ length: n }, (_, i) => `c${i + 1}`);
const grid: DocxBlock = { type: "table", rows: [cells(5), cells(5)], headerRows: 1 };
const LANDSCAPE = 'w:orient="landscape"';

test("a ten-cell band with a five-column grid stays portrait; the same ten cells as a plain table still turn the page", async () => {
  assert.ok(!(await xmlOf([{ type: "table", rows: [cells(10)], headerRows: 0, band: true }, grid])).includes(LANDSCAPE), "the band is not a grid");
  assert.ok((await xmlOf([{ type: "table", rows: [cells(10)], headerRows: 0 }, grid])).includes(LANDSCAPE), "a wide table still turns the page");
  assert.ok((await xmlOf([{ type: "table", rows: [cells(7), cells(7)], headerRows: 1 }])).includes(LANDSCAPE), "a grid of seven columns turns the page");
});

test("the export's header-row block carries the band mark into the Word blocks", async () => {
  const blocks: ExportBlock[] = [
    { kind: "table", rows: [cells(10).map((text) => ({ text }))], headerRows: 0, band: true },
    { kind: "table", rows: [cells(5).map((text) => ({ text })), cells(5).map((text) => ({ text }))], headerRows: 1 },
  ];
  const word = wordBlocksFrom(blocks);
  assert.equal(word[0]!.type === "table" && word[0]!.band, true);
  assert.equal(word[1]!.type === "table" && word[1]!.band, undefined);
  assert.ok(!(await xmlOf(word)).includes(LANDSCAPE));
});
