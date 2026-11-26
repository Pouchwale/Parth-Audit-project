// A PAPER'S LOGO IN ITS WORD FILE AND ITS WORKBOOK (REQUIREMENTS §387, utils/docx.ts, utils/documentExport.ts).
//
// The owner, 26-Nov-2026, F/MNT/11: the Word and Excel downloads were "ruined" - no line of the table, and the logo written
// as its words ("Gujarat Print Pack Publications Pvt. Ltd."). A cell's picture now travels into both files as the picture.
// Run: npm run test:unit -- paperPicture
import test from "node:test";
import assert from "node:assert/strict";
import { buildDocx } from "../src/utils/docx";
import { workbookFromBlocks, wordBlocksFrom, type ExportBlock } from "../src/utils/documentExport";
import { unzip } from "../src/utils/xlsx";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const picture = { src: "brand/logo.jpg", alt: "Logo", x: 9, y: 3, w: 115, h: 39, bytes: { data: JPEG, type: "jpeg" as const } };
const text = async (zip: Map<string, () => Promise<Uint8Array>>, name: string) => new TextDecoder().decode(await zip.get(name)!());

test("a paper cell's picture is in the Word file: the image part, its relationship and an inline drawing at its size", async () => {
  const blocks: ExportBlock[] = [
    { kind: "paper", widths: [130, 170], rows: [{ height: 45, cells: [{ text: "", size: 16, bold: false, align: "left", valign: "center", borders: [12, 12, 12, 6], picture }, { text: "TITLE", size: 28, bold: true, align: "center", valign: "center", borders: [0, 12, 12, 6] }] }] },
  ];
  const zip = await unzip(buildDocx(wordBlocksFrom(blocks)).slice().buffer);
  assert.deepEqual(Array.from(await zip.get("word/media/image1.jpeg")!()), Array.from(JPEG));
  assert.match(await text(zip, "word/_rels/document.xml.rels"), /Id="rIdPic1"[^>]*Target="media\/image1\.jpeg"/);
  assert.match(await text(zip, "[Content_Types].xml"), /Extension="jpeg"/);
  const doc = await text(zip, "word/document.xml");
  assert.match(doc, /<wp:extent cx="1460500" cy="495300"\/>/);
  assert.match(doc, /r:embed="rIdPic1"/);
  assert.ok(!doc.includes(">Logo<"), "the picture's words are not written in its place");
});

test("a sheet cell's picture is in the workbook, anchored at its cell; a centred paper prints in the middle of the page", async () => {
  const blocks: ExportBlock[] = [
    {
      kind: "sheet",
      name: "F-MNT-11",
      widths: [20, 20],
      heights: [45],
      rowCount: 1,
      centred: true,
      cells: [{ text: "", row: 0, col: 0, rowSpan: 1, colSpan: 1, picture, style: { size: 10, bold: false, align: "left", valign: "center", wrap: true, borders: [2, 2, 2, 2] } }],
    },
  ];
  const zip = await unzip(workbookFromBlocks("F-MNT-11", blocks).slice().buffer);
  assert.ok(zip.has("xl/media/image1.jpeg"));
  const sheet = await text(zip, "xl/worksheets/sheet1.xml");
  assert.match(sheet, /<drawing r:id="rId1"\/><\/worksheet>/);
  assert.match(sheet, /<printOptions horizontalCentered="1"\/>/);
  const drawing = await text(zip, "xl/drawings/drawing1.xml");
  assert.match(drawing, /<xdr:col>0<\/xdr:col><xdr:colOff>114300<\/xdr:colOff><xdr:row>0<\/xdr:row><xdr:rowOff>38100<\/xdr:rowOff>/);
  assert.match(await text(zip, "xl/worksheets/_rels/sheet1.xml.rels"), /Target="\.\.\/drawings\/drawing1\.xml"/);
  assert.match(await text(zip, "[Content_Types].xml"), /drawing1\.xml/);
});

test("a workbook with no picture has no drawing", async () => {
  const blocks: ExportBlock[] = [{ kind: "sheet", name: "S", widths: [10], heights: [15], rowCount: 1, cells: [{ text: "a", row: 0, col: 0, rowSpan: 1, colSpan: 1, style: { size: 10, bold: false, align: "left", valign: "center", wrap: true, borders: [1, 1, 1, 1] } }] }];
  const zip = await unzip(workbookFromBlocks("S", blocks).slice().buffer);
  assert.ok(!zip.has("xl/drawings/drawing1.xml"));
  assert.ok(!(await text(zip, "xl/worksheets/sheet1.xml")).includes("<drawing"));
});
