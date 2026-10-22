// EVERY DOWNLOAD IS THE OWNER'S OWN FILE (REQUIREMENTS §119): the filler (utils/originalFill) places what a page shows into
// the owner's Word or Excel file, clears his example entries first, keeps the header's DATE cell out, adds rows where a grid
// has more lines than his paper, and writes the round-trip map so the upload reads the file back unchanged (§81).
//
// Small made-up templates prove each rule; three of the owner's real templates (a QC Word form, a QC workbook, a System Word
// note) prove them on his own files.
//
// Run: npm run test:unit -- originalFill
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fillTemplate } from "../src/utils/originalFill";
import { fillXlsx } from "../src/utils/originalFill/xlsxFill";
import { fillDocx } from "../src/utils/originalFill/docxFill";
import { readUploadedFile } from "../src/engine/roundTrip/readFile";
import { makeEnvelope, type ExportBinding } from "../src/engine/roundTrip/exportMap";
import { unzip, zipStored } from "../src/utils/xlsx";
import { COMPANY } from "../src/data/seed/masterData";
import { documentFileKind, type Cell, type ExportBlock } from "../src/utils/documentExport";
import { SEED_DOCUMENTS } from "../src/data/seed/documentDefinitions";
import { ORIGINAL_FILES } from "../src/data/seed/originalFiles";

const RID = "rec-test-1";
const enc = new TextEncoder();

const bound = (path: string, text: string, label: string, type: ExportBinding["type"] = "text", options: { value: string; label: string }[] = []): Cell => {
  const bind: ExportBinding = { path, type, label, options, recordId: RID, text };
  return { text, parts: [{ text, bind }], bind };
};
const plain = (text: string): Cell => ({ text });

async function partText(bytes: Uint8Array, name: string): Promise<string> {
  const zip = await unzip(bytes.slice().buffer);
  const get = zip.get(name);
  assert.ok(get, `${name} is in the file`);
  return new TextDecoder().decode(await get!());
}

// ---------------------------------------------------------------------------------------------------------------------
// a made-up workbook: the company misspelt, a band with a DATE cell, a box written "Label : ____", a grid of two specimen
// lines and a foot under it

function sheetCell(ref: string, text: string, s = 0): string {
  return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
}

function tinyWorkbook(): ArrayBuffer {
  const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const rows = [
    `<row r="1">${sheetCell("A1", "GUJARAT PRINTPACK PUBLICATION PVT. LTD.")}</row>`,
    `<row r="2">${sheetCell("A2", "TEST REGISTER")}${sheetCell("D2", "F/QC/99 (00/01.12.2021)")}</row>`,
    `<row r="3">${sheetCell("A3", "Date :")}${sheetCell("B3", "12.03.2024")}</row>`,
    `<row r="4">${sheetCell("A4", "Machine Name : ____")}</row>`,
    `<row r="5">${sheetCell("A5", "Sr. No.", 1)}${sheetCell("B5", "Item", 1)}${sheetCell("C5", "Qty", 1)}</row>`,
    `<row r="6">${sheetCell("A6", "1", 1)}${sheetCell("B6", "Glue", 1)}${sheetCell("C6", "5", 1)}</row>`,
    `<row r="7">${sheetCell("A7", "2", 1)}${sheetCell("B7", "Bait", 1)}${sheetCell("C7", "7", 1)}</row>`,
    `<row r="8">${sheetCell("A8", "Checked by :")}</row>`,
  ].join("");
  const files: [string, string][] = [
    [
      "[Content_Types].xml",
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ],
    ["_rels/.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="Register" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">Register!$A$1:$C$8</definedName></definedNames></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`],
    [
      "xl/styles.xml",
      `<styleSheet xmlns="${MAIN}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/></cellXfs></styleSheet>`,
    ],
    ["xl/worksheets/sheet1.xml", `<worksheet xmlns="${MAIN}" xmlns:r="${REL}"><dimension ref="A1:D8"/><sheetData>${rows}</sheetData><mergeCells count="1"><mergeCell ref="A1:D1"/></mergeCells></worksheet>`],
  ];
  return zipStored(files.map(([name, xml]) => ({ name, data: enc.encode(xml) }))).slice().buffer;
}

function registerBlocks(lines: number): ExportBlock[] {
  const rows: Cell[][] = [[plain("Sr. No."), plain("Item"), plain("Qty")]];
  for (let i = 0; i < lines; i++) rows.push([plain(String(i + 1)), bound(`rows/@r${i}/item`, `Item ${i + 1}`, "Item"), bound(`rows/@r${i}/qty`, String(10 + i), "Qty", "number")]);
  return [
    { kind: "text", text: COMPANY.name, strong: true, title: true },
    { kind: "text", text: "TEST REGISTER", strong: true, title: true },
    { kind: "table", rows: [[plain("Format No."), plain("F/QC/99"), plain("Rev No."), plain("01"), plain("Rev Date"), plain("05-Jan-2026"), plain("Page No."), plain("1 of 1")]], headerRows: 0, band: true },
    { kind: "fields", pairs: [["Machine Name", bound("header/machine", "M-7", "Machine Name")]] },
    {
      kind: "table",
      rows,
      headerRows: 1,
      bindTable: {
        recordId: RID,
        listPath: "rows",
        columns: [
          { key: "item", type: "text", options: [], col: 1, label: "Item" },
          { key: "qty", type: "number", options: [], col: 2, label: "Qty" },
        ],
      },
    },
  ];
}

const envelope = (kind: "xlsx" | "docx") => makeEnvelope(kind, { documentId: "test-doc", formatNo: "F/QC/99", revisionNo: "01" }, [RID], "2026-10-20T10:00:00.000Z");

async function sheetXml(bytes: Uint8Array): Promise<string> {
  return partText(bytes, "xl/worksheets/sheet1.xml");
}

test("a workbook: the company's one name, the format's revision, the DATE cell blanked, the box after its label", async () => {
  const { bytes, report } = await fillXlsx(tinyWorkbook(), registerBlocks(2), { envelope: envelope("xlsx"), company: COMPANY.name });
  const xml = await sheetXml(bytes);
  assert.match(xml, new RegExp(`<c r="A1"[^>]*><is><t xml:space="preserve">${COMPANY.name}</t>`), "the company's name is DCRS's one spelling");
  assert.match(xml, /<c r="D2"[^>]*><is><t xml:space="preserve">F\/QC\/99 \(01\/05\.01\.2026\)<\/t>/, "the revision and its date are DCRS's, written the paper's way");
  assert.match(xml, /<c r="A3"[^>]*\/>/, "the header's DATE label is blanked (REQUIREMENTS §117)");
  assert.match(xml, /<c r="B3"[^>]*\/>/, "and its value");
  assert.equal(report.dateCellsBlanked, 1);
  assert.match(xml, /<c r="A4"[^>]*><is><t xml:space="preserve">Machine Name : M-7<\/t>/, "the value after its label, in the label's cell");
});

test("a workbook: the owner's example lines never reach the download, DCRS's lines fill his rows", async () => {
  const { bytes, report } = await fillXlsx(tinyWorkbook(), registerBlocks(2), { envelope: envelope("xlsx"), company: COMPANY.name });
  const xml = await sheetXml(bytes);
  assert.ok(!xml.includes("Glue") && !xml.includes("Bait"), "the specimen entries are cleared (REQUIREMENTS §98)");
  assert.match(xml, /Item 1/);
  assert.match(xml, /Item 2/);
  assert.equal(report.notPlaced.length, 0);
  assert.ok(report.cleared >= 4, `the specimen cells were cleared (${report.cleared})`);
  assert.match(xml, /<c r="A8"[^>]*><is><t xml:space="preserve">Checked by :<\/t>/, "the foot stays where it was");
});

test("a workbook: more lines than the paper has rows - the last row copied, the foot and the print area moved down", async () => {
  const { bytes, report } = await fillXlsx(tinyWorkbook(), registerBlocks(4), { envelope: envelope("xlsx"), company: COMPANY.name });
  const xml = await sheetXml(bytes);
  assert.deepEqual(report.grids[0], { rows: 4, paperRows: 2, added: 2, where: "A5" });
  assert.match(xml, /<c r="B9"[^>]*><is><t xml:space="preserve">Item 4<\/t>/, "the fourth line is on the second added row");
  assert.match(xml, /<c r="A10"[^>]*><is><t xml:space="preserve">Checked by :<\/t>/, "the foot moved down by two rows");
  const wb = await partText(bytes, "xl/workbook.xml");
  assert.match(wb, /Register!\$A\$1:\$C\$10/, "the print area grew with the rows");
});

test("a workbook: the map reads back unchanged, and a blank record gives a blank paper", async () => {
  const { bytes } = await fillXlsx(tinyWorkbook(), registerBlocks(3), { envelope: envelope("xlsx"), company: COMPANY.name });
  const read = await readUploadedFile(bytes.slice().buffer, "register.xlsx");
  assert.ok(read.ok, "the file reads back");
  if (!read.ok) return;
  assert.equal(read.missing.length, 0);
  assert.equal(read.appended.length, 0, "no row of the paper's own is taken for a new line");
  for (const e of read.entries) assert.equal(read.values.get(e.i)?.text.replace(/\.0+$/, ""), e.text, `${e.label} reads back as written`);
  const blank = await fillXlsx(tinyWorkbook(), registerBlocks(0), { envelope: envelope("xlsx"), company: COMPANY.name });
  const xml = await sheetXml(blank.bytes);
  assert.ok(!/Glue|Bait|>5<|>7</.test(xml), "nothing of the example is left on a blank record's paper");
});

// ---------------------------------------------------------------------------------------------------------------------
// a made-up Word file: a label-and-box table, a "Label : ____" paragraph, a choice across a row, a grid with two example
// lines

function tinyDocx(): ArrayBuffer {
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const p = (t: string) => `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
  const tc = (t: string) => `<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr>${p(t)}</w:tc>`;
  const tr = (...cells: string[]) => `<w:tr>${cells.map(tc).join("")}</w:tr>`;
  const body =
    p("GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED") +
    p("Format number: - F/QC/99 (00 / 01.12.2021)") +
    `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>${tr("Supplier Name", "ACME Specimen Ltd")}</w:tbl>` +
    p("Date of test: ________") +
    `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>${tr("LOT STATUS", "ACCEPTED", "REJECTED")}</w:tbl>` +
    `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>${tr("Sr. No.", "Item", "Qty")}${tr("1", "Glue", "5")}${tr("2", "Bait", "7")}</w:tbl>` +
    p("Checked by:");
  const files: [string, string][] = [
    [
      "[Content_Types].xml",
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    ],
    ["_rels/.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`],
    ["word/document.xml", `<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}<w:sectPr/></w:body></w:document>`],
  ];
  return zipStored(files.map(([name, xml]) => ({ name, data: enc.encode(xml) }))).slice().buffer;
}

function formBlocks(lines: number, status: string): ExportBlock[] {
  const rows: Cell[][] = [[plain("Sr. No."), plain("Item"), plain("Qty")]];
  for (let i = 0; i < lines; i++) rows.push([plain(String(i + 1)), bound(`rows/@r${i}/item`, `Item ${i + 1}`, "Item"), bound(`rows/@r${i}/qty`, String(10 + i), "Qty", "number")]);
  return [
    { kind: "text", text: COMPANY.name, strong: true, title: true },
    { kind: "text", text: "TEST FORM", strong: true, title: true },
    { kind: "table", rows: [[plain("Format No."), plain("F/QC/99"), plain("Rev No."), plain("02"), plain("Rev Date"), plain("05-Jan-2026"), plain("Page No."), plain("1 of 1")]], headerRows: 0, band: true },
    { kind: "fields", pairs: [["Supplier Name", bound("header/supplier", "Test Supplier QA", "Supplier Name")], ["Date of test", bound("header/date", "20-Oct-2026", "Date of test", "date")]] },
    { kind: "fields", pairs: [["LOT STATUS", bound("header/lot", status, "LOT STATUS", "select", [{ value: "ACCEPTED", label: "ACCEPTED" }, { value: "REJECTED", label: "REJECTED" }])]] },
    { kind: "table", rows, headerRows: 1, bindTable: { recordId: RID, listPath: "rows", columns: [{ key: "item", type: "text", options: [], col: 1, label: "Item" }, { key: "qty", type: "number", options: [], col: 2, label: "Qty" }] } },
  ];
}

test("a Word file: boxes, a paragraph's blank, a choice marked, the example lines cleared and a row added; the map reads back", async () => {
  const { bytes, report } = await fillDocx(tinyDocx(), formBlocks(3, "ACCEPTED"), { envelope: envelope("docx"), company: COMPANY.name });
  const xml = await partText(bytes, "word/document.xml");
  assert.ok(xml.includes(COMPANY.name), "the company's one name");
  assert.ok(xml.includes("F/QC/99 (02 / 05.01.2026)"), "the revision is DCRS's");
  assert.ok(!/ACME Specimen|Glue|Bait/.test(xml), "the owner's example entries are gone");
  assert.ok(xml.includes("Test Supplier QA") && xml.includes("20-Oct-2026"), "the boxes' values are in");
  assert.ok(!xml.includes("________"), "the value takes the blank's place after its label");
  assert.ok(xml.includes(String.fromCharCode(0x2611)) && xml.includes(String.fromCharCode(0x2610)), "the chosen status is ticked, the other boxed");
  assert.equal(report.grids[0].added, 1, "one row added for the third line");
  assert.equal((xml.match(/<w:tr>/g) ?? []).length + (xml.match(/<w:tr /g) ?? []).length, 1 + 1 + 4, "the grid has its heading and three lines");
  const read = await readUploadedFile(bytes.slice().buffer, "form.docx");
  assert.ok(read.ok);
  if (!read.ok) return;
  assert.equal(read.missing.length, 0);
  assert.equal(read.appended.length, 0);
  for (const e of read.entries) assert.equal((read.values.get(e.i)?.text ?? "").replace(/ /g, " ").trim(), e.text.trim(), `${e.label} reads back as written`);
});

// ---------------------------------------------------------------------------------------------------------------------
// the owner's real templates (frontend/public/originals) with what their pages showed (frontend/tests/fixtures/originalFill)

const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
const realTemplate = (id: string, kind: string) => {
  const buf = readFileSync(path.join(root, "frontend", "public", "originals", `${id}.${kind}`));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
};
const realBlocks = (id: string): { blocks: ExportBlock[]; recordIds: string[] } => JSON.parse(readFileSync(path.join(root, "frontend", "tests", "fixtures", "originalFill", `${id}.blocks.json`), "utf8"));

for (const [id, kind] of [
  ["qc-bopp-film", "docx"],
  ["qc-obsolete-artwork", "xlsx"],
  ["sys-document-change", "docx"],
] as const) {
  test(`the owner's own ${id}.${kind}: filled, nothing of his example left, read back unchanged`, async () => {
    const shown = realBlocks(id);
    const env = makeEnvelope(kind, { documentId: id, formatNo: "", revisionNo: "" }, shown.recordIds, "2026-10-20T10:00:00.000Z");
    const { bytes, report } = await fillTemplate({ kind }, realTemplate(id, kind), shown.blocks, env, id);
    assert.equal(report.notPlaced.length, 0, `every value found its place (${report.notPlaced.join(", ")})`);
    const read = await readUploadedFile(bytes.slice().buffer, `${id}.${kind}`);
    assert.ok(read.ok);
    if (!read.ok) return;
    assert.equal(read.missing.length, 0);
    assert.equal(read.appended.length, 0);
    assert.ok(read.entries.length > 0, "the map holds the record's values");
    if (id === "qc-obsolete-artwork") {
      const xml = await partText(bytes, "xl/worksheets/sheet1.xml");
      const ss = await partText(realTemplateBytes(id, kind), "xl/sharedStrings.xml");
      // The thirteen example lines of the owner's register (customer names, FG codes) are in his file's strings, not on the sheet.
      assert.ok(ss.includes("FGLA11067"), "the template carries the owner's example");
      assert.ok(!xml.includes("FGLA11067"), "the download's sheet does not");
      const shared = (await partText(bytes, "xl/sharedStrings.xml")).match(/<si>.*?<\/si>/g) ?? [];
      const used = new Set(Array.from(xml.matchAll(/<c [^>]*t="s"[^>]*><v>(\d+)<\/v>/g), (m) => Number(m[1])));
      assert.ok(!Array.from(used).some((i) => /FGLA|FGSL|Nivea/.test(shared[i] ?? "")), "no cell points at an example string");
    }
    if (id === "qc-bopp-film") {
      const footer = (await partText(bytes, "word/footer2.xml")).replace(/<[^>]+>/g, "");
      assert.ok(footer.includes("F/QC/01"), "the paper's foot keeps its format number");
      assert.ok(footer.includes("16.02.2022"), "and its revision's date, as the paper writes it");
    }
  });
}

const realTemplateBytes = (id: string, kind: string) => new Uint8Array(realTemplate(id, kind));

// ---------------------------------------------------------------------------------------------------------------------
// round 2 (REQUIREMENTS §119): a paper with no heading row over its questions, a box the paper has no place for, boxes DCRS
// numbers in groups, a period in the title's brackets

function docxOf(body: string): ArrayBuffer {
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const files: [string, string][] = [
    [
      "[Content_Types].xml",
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    ],
    ["_rels/.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`],
    ["word/document.xml", `<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}<w:sectPr/></w:body></w:document>`],
  ];
  return zipStored(files.map(([name, xml]) => ({ name, data: enc.encode(xml) }))).slice().buffer;
}
const wp = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
const wtr = (...cells: string[]) => `<w:tr>${cells.map((t) => `<w:tc>${wp(t)}</w:tc>`).join("")}</w:tr>`;
const wtbl = (...rows: string[]) => `<w:tbl><w:tblPr/>${rows.join("")}</w:tbl>`;
const head = (title: string): ExportBlock[] => [
  { kind: "text", text: COMPANY.name, strong: true, title: true },
  { kind: "text", text: title, strong: true, title: true },
];

test("round 2: a paper with no heading row over its questions - each line found by its own words, YES / NO struck as on paper, the reading in its blank cell", async () => {
  const template = docxOf(wp("HEALTH DECLARATION") + wtbl(wtr("Do you have a cold or a cough?", "YES / NO"), wtr("Any cut or wound?", "YES / NO"), wtr("Body temperature", "")));
  const yn = (path: string, text: string) => bound(path, text, "Yes / No", "yesno");
  const rows: Cell[][] = [
    [plain("Sr. No."), plain("Question"), plain("YES / NO"), plain("Reading")],
    [plain("1"), plain("Do you have a cold or a cough?"), yn("q/0/yn", "No"), bound("q/0/r", "", "Reading")],
    [plain("2"), plain("Any cut or wound?"), yn("q/1/yn", "Yes"), bound("q/1/r", "", "Reading")],
    [plain("3"), plain("Body temperature"), yn("q/2/yn", ""), bound("q/2/r", "98.4 F", "Reading")],
  ];
  const { bytes, report } = await fillDocx(template, [...head("HEALTH DECLARATION"), { kind: "table", rows, headerRows: 1 }], { envelope: envelope("docx"), company: COMPANY.name });
  assert.equal(report.notPlaced.length, 0, report.notPlaced.join(", "));
  assert.equal(report.grids[0].where, "by the lines' own words");
  const xml = await partText(bytes, "word/document.xml");
  assert.equal((xml.match(/<w:strike\/>/g) ?? []).length, 2, "the answer not given is struck through on each answered line");
  assert.ok(xml.indexOf("98.4 F") > xml.indexOf("Body temperature"), "the reading goes into the blank cell of its own row");
  const read = await readUploadedFile(bytes.slice().buffer, "health.docx");
  assert.ok(read.ok);
  if (!read.ok) return;
  assert.equal(read.missing.length, 0);
  for (const e of read.entries) assert.equal((read.values.get(e.i)?.text ?? "").replace(/ /g, " ").trim(), e.text.trim(), `${e.label} reads back as written`);
});

test("a box the paper has no place for is left out of the file: the owner's format stays as it is (22-Oct-2026)", async () => {
  const template = docxOf(wp("VEHICLE RECORD") + wtbl(wtr("Driver", "")) + wp("Checked by: ____"));
  const blocks: ExportBlock[] = [...head("VEHICLE RECORD"), { kind: "fields", pairs: [["Driver", bound("h/driver", "R. Patel", "Driver")], ["Contract valid to", bound("h/to", "31-Mar-2027", "Contract valid to", "date")]] }];
  const { bytes, report } = await fillDocx(template, blocks, { envelope: envelope("docx"), company: COMPANY.name });
  assert.equal(report.notPlaced.length, 0);
  assert.equal(report.outside.length, 0, "nothing written outside the paper's boxes");
  assert.deepEqual(report.leftOut, ["Contract valid to"], "the value with no box is left out, and listed");
  const xml = await partText(bytes, "word/document.xml");
  assert.ok(xml.includes("R. Patel") && !xml.includes("Contract valid to") && !xml.includes("31-Mar-2027"), "his paper, filled where it has boxes, nothing added");
  const read = await readUploadedFile(bytes.slice().buffer, "vehicle.docx");
  assert.ok(read.ok && read.missing.length === 0, "the file still reads back whole");
});

test("a person's name goes where the paper prints the group's own words ('Prepared By'), each group's words staying a label", async () => {
  const template = docxOf(wp("COMPLAINT CHECKLIST") + wtbl(wtr("Prepared By", "Approved By"), wtr("Designation", "Designation")));
  const pairs: [string, Cell][] = [
    ["Name", bound("prep/name", "PREP-NAME", "Prepared by · Name")],
    ["Designation", bound("prep/des", "PREP-DES", "Prepared by · Designation")],
    ["Name", bound("appr/name", "APPR-NAME", "Approved by · Name")],
    ["Designation", bound("appr/des", "APPR-DES", "Approved by · Designation")],
  ];
  const { bytes, report } = await fillDocx(template, [...head("COMPLAINT CHECKLIST"), { kind: "fields", pairs }], { envelope: envelope("docx"), company: COMPANY.name });
  assert.equal(report.notPlaced.length, 0);
  assert.deepEqual(report.leftOut, [], "the names have the paper's own boxes");
  const xml = await partText(bytes, "word/document.xml");
  for (const words of ["Prepared By", "Approved By"]) assert.ok(xml.includes(words), `the paper's "${words}" stays`);
  assert.ok(xml.indexOf("Prepared By") < xml.indexOf("PREP-NAME") && xml.indexOf("PREP-NAME") < xml.indexOf("Approved By"), "the preparer's name in the Prepared By cell");
  assert.ok(xml.indexOf("Approved By") < xml.indexOf("APPR-NAME") && xml.indexOf("APPR-NAME") < xml.indexOf("Designation"), "the approver's name in the Approved By cell, never over its words");
  const read = await readUploadedFile(bytes.slice().buffer, "checklist.docx");
  assert.ok(read.ok && read.missing.length === 0 && read.entries.length === 4, "every name and designation reads back");
});

test("a row of the paper holding several lines' words: the spacer under it is none of theirs, a detail with no cell is left out", async () => {
  const template = docxOf(wp("HEALTH DECLARATION") + wtbl(wtr("Do you have a cold or a cough?", "YES / NO"), wtr("", ""), wtr("Diabetes", "", "Heart trouble", ""), wtr("", "", "", "")));
  const yn = (path: string, text: string) => bound(path, text, "YES / NO", "yesno");
  const rows: Cell[][] = [
    [plain("Question"), plain("YES / NO"), plain("Details (if yes)")],
    [plain("Do you have a cold or a cough?"), yn("q/0/yn", "Yes"), bound("q/0/d", "DETAIL-ONE", "Details (if yes)")],
    [plain("Diabetes"), yn("q/1/yn", "Yes"), bound("q/1/d", "DETAIL-TWO", "Details (if yes)")],
    [plain("Heart trouble"), yn("q/2/yn", "No"), bound("q/2/d", "", "Details (if yes)")],
  ];
  const { bytes, report } = await fillDocx(template, [...head("HEALTH DECLARATION"), { kind: "table", rows, headerRows: 1 }], { envelope: envelope("docx"), company: COMPANY.name });
  assert.equal(report.notPlaced.length, 0, report.notPlaced.join(", "));
  assert.deepEqual(report.leftOut, ["Details (if yes) (line 2)", "Details (if yes) (line 3)"], "only the details with no cell of their own");
  const xml = await partText(bytes, "word/document.xml");
  assert.ok(xml.includes("DETAIL-ONE"), "the first question's detail on the blank line under it");
  assert.ok(!xml.includes("DETAIL-TWO"), "never on the spacer under a row of several conditions");
  const read = await readUploadedFile(bytes.slice().buffer, "health.docx");
  assert.ok(read.ok && read.missing.length === 0, "the file reads back whole");
});

test("a grid the paper prints again on each page under its heading: the lines run on in the next tables, every example of his cleared", async () => {
  const people = (a: string, b: string) => wtbl(wtr("Name of the Operator / Worker", "Designation"), wtr(a, b), wtr("", ""));
  const template = docxOf(wp("INDUCTION RECORD") + people("Old One", "Clerk") + wtbl(wtr("Training Topics", "Responsibility")) + people("Old Two", "Helper"));
  const rows: Cell[][] = [[plain("Name of the Operator / Worker"), plain("Designation")]];
  for (const i of [1, 2, 3]) rows.push([bound(`p/${i}/n`, `NEW-${i}`, "Name of the Operator / Worker"), bound(`p/${i}/d`, `ROLE-${i}`, "Designation")]);
  const { bytes, report } = await fillDocx(template, [...head("INDUCTION RECORD"), { kind: "table", rows, headerRows: 1 }], { envelope: envelope("docx"), company: COMPANY.name });
  assert.equal(report.notPlaced.length, 0);
  assert.deepEqual(report.grids[0], { rows: 3, paperRows: 4, added: 0, where: "table 1" }, "the two tables' four rows hold the three lines, no row added");
  const xml = await partText(bytes, "word/document.xml");
  assert.ok(!xml.includes("Old One") && !xml.includes("Old Two"), "his example people cleared on every page");
  assert.ok(xml.indexOf("NEW-2") < xml.indexOf("Training Topics") && xml.indexOf("NEW-3") > xml.indexOf("Training Topics"), "the third line on the next page's table");
  const read = await readUploadedFile(bytes.slice().buffer, "induction.docx");
  assert.ok(read.ok && read.missing.length === 0 && read.appended.length === 0, "the file reads back whole, no line of the paper's read as new");
});

test("a grid the paper prints as a card per line: each line's values on its own card, a line past the last card left out", async () => {
  const card = wtbl(wtr("APPROVED BY:", ""), wtr("SIGN. :", ""));
  const template = docxOf(wp("TOLERANCE CARD") + wtbl(wtr("ERROR : ONE")) + wtbl(wtr("ERROR : TWO")) + wtbl(wtr("ERROR : THREE")) + card + card);
  const rows: Cell[][] = [[plain(""), plain("APPROVED BY:"), plain("SIGN. :")]];
  for (const [i, e] of ["ONE", "TWO", "THREE"].entries()) rows.push([plain(`ERROR : ${e}`), bound(`c/${i}/a`, `APPROVER-${i + 1}`, "APPROVED BY:"), bound(`c/${i}/s`, `SIGN-${i + 1}`, "SIGN. :")]);
  const { bytes, report } = await fillDocx(template, [...head("TOLERANCE CARD"), { kind: "table", rows, headerRows: 1 }], { envelope: envelope("docx"), company: COMPANY.name });
  assert.equal(report.notPlaced.length, 0);
  assert.deepEqual(report.grids[0], { rows: 3, paperRows: 2, added: 0, where: "a card per line" });
  assert.deepEqual(report.leftOut, ["APPROVED BY: (line 3)", "SIGN. : (line 3)"], "the third line has no card on his paper");
  const xml = await partText(bytes, "word/document.xml");
  const tables = xml.split("<w:tbl>").slice(1);
  assert.equal(tables.length, 5, "no table and no row added");
  assert.ok(tables[3].includes("APPROVER-1") && tables[3].includes("SIGN-1") && tables[4].includes("APPROVER-2") && tables[4].includes("SIGN-2"), "line k on card k");
  const read = await readUploadedFile(bytes.slice().buffer, "cards.docx");
  assert.ok(read.ok && read.missing.length === 0, "the file reads back whole");
});

test("the empty lines after the last table take no room: a longer record never prints a page with nothing on it", async () => {
  const template = docxOf(wp("RECORD") + wtbl(wtr("Supplier", "")) + `<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="1800"/></w:tabs><w:spacing w:before="100" w:beforeAutospacing="1" w:after="100" w:afterAutospacing="1"/></w:pPr></w:p>` + wp(""));
  const { bytes } = await fillDocx(template, [...head("RECORD"), { kind: "fields", pairs: [["Supplier", bound("h/s", "Acme", "Supplier")]] }], { envelope: envelope("docx"), company: COMPANY.name });
  const xml = await partText(bytes, "word/document.xml");
  const tail = xml.slice(xml.lastIndexOf("</w:tbl>"));
  assert.equal((tail.match(/w:line="20" w:lineRule="exact"/g) ?? []).length, 2, "both empty lines one point high, the tab stop no obstacle");
  assert.ok(!/w:beforeAutospacing="1"/.test(tail), "no automatic space before them");
  assert.ok(xml.includes("Acme"), "the record's value where it was");
});

test("a signature block printed as lines: each name under its label, in place of his example; or on the blank line, where its role is", async () => {
  const sign = (names: string) => wp("\tTesting By\tApproved By") + wp("") + (names ? wp(names) + wp("") : "") + wp("\t(QA Executive)\t(QA Manager)");
  const blocks: ExportBlock[] = [...head("ANALYSIS REPORT"), { kind: "fields", pairs: [["Testing By (QA Executive)", bound("h/t", "TESTER-ONE", "Testing By (QA Executive)")], ["Approved By (QA Manager)", bound("h/a", "APPROVER-TWO", "Approved By (QA Manager)")]] }];
  for (const names of ["   Karan          Kapila", ""]) {
    const { bytes, report } = await fillDocx(docxOf(wp("ANALYSIS REPORT") + sign(names)), blocks, { envelope: envelope("docx"), company: COMPANY.name });
    assert.equal(report.notPlaced.length, 0);
    assert.deepEqual(report.leftOut, [], names ? "both names under their labels" : "both names on the blank line");
    const xml = await partText(bytes, "word/document.xml");
    assert.ok(!xml.includes("Karan") && !/>Kapila</.test(xml), "his example names gone");
    // The words as printed (the controls' own names left aside).
    const words = Array.from(xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g), (m) => m[1]).join("");
    const at = (w: string) => words.indexOf(w);
    assert.ok(at("Approved By") < at("TESTER-ONE") && at("TESTER-ONE") < at("APPROVER-TWO") && at("APPROVER-TWO") < at("(QA Executive)"), "the names between the labels and the roles, in order");
    if (!names) assert.equal((words.match(/\(QA Manager\)/g) ?? []).length, 1, "the roles printed once, the blank line holding the names alone");
    const read = await readUploadedFile(bytes.slice().buffer, "report.docx");
    assert.ok(read.ok && read.missing.length === 0 && read.entries.length === 2, "both names read back");
  }
});

test("a page's table of no heading whose values find no place is never a download of the owner's words alone", async () => {
  const template = docxOf(wp("CERTIFICATE") + wp("Production Order No. 33858"));
  const rows: Cell[][] = [[plain("Production Order No."), bound("h/po", "89665", "Production Order No.")]];
  const { report } = await fillDocx(template, [...head("CERTIFICATE"), { kind: "table", rows, headerRows: 0 }], { envelope: envelope("docx"), company: COMPANY.name });
  assert.deepEqual(report.notPlaced, ["Production Order No."], "the value with no place is said, so the generic download is made");
});

test("a two-column table headed by a group's name: its lines are the group's boxes, found under the group on the paper", async () => {
  const group = (name: string, rows: string[][]) => [{ kind: "table", headerRows: 1, rows: [[plain(name), plain("")], ...rows.map(([l, v], i) => [plain(l), bound(`${name}/${i}`, v, l)])] }] as ExportBlock[];
  const template = docxOf(wp("RULER RECORD") + wtbl(wtr("Master scale details", ""), wtr("Make", ""), wtr("Serial number", "")) + wtbl(wtr("Scale under calibration", ""), wtr("Make", ""), wtr("Serial number", "")));
  const blocks: ExportBlock[] = [...head("RULER RECORD"), ...group("Master scale details", [["Make", "MAKE-M"], ["Serial number", "SN-M"]]), ...group("Scale under calibration", [["Make", "MAKE-S"], ["Serial number", "SN-S"]])];
  const { bytes, report } = await fillDocx(template, blocks, { envelope: envelope("docx"), company: COMPANY.name });
  assert.equal(report.notPlaced.length, 0, report.notPlaced.join(", "));
  const xml = await partText(bytes, "word/document.xml");
  const [first, second] = xml.split("<w:tbl>").slice(1);
  assert.ok(first.includes("MAKE-M") && first.includes("SN-M") && second.includes("MAKE-S") && second.includes("SN-S"), "each group's values in its own table");
});

test("round 2: boxes DCRS numbers in groups fill the paper's table of them, a row a number", async () => {
  const template = docxOf(wp("MEETING RECORD") + wtbl(wtr("Name", "Designation", "Sign"), wtr("", "", ""), wtr("", "", "")));
  const pairs: [string, Cell][] = [];
  for (const n of [1, 2, 3]) {
    pairs.push([`Attendance ${n} — Name`, bound(`a/${n}/name`, `Person ${n}`, `Attendance ${n} — Name`)]);
    pairs.push([`Attendance ${n} — Designation`, bound(`a/${n}/des`, `Role ${n}`, `Attendance ${n} — Designation`)]);
  }
  const { bytes, report } = await fillDocx(template, [...head("MEETING RECORD"), { kind: "fields", pairs }], { envelope: envelope("docx"), company: COMPANY.name });
  assert.equal(report.notPlaced.length, 0);
  assert.equal(report.outside.length, 0, "nothing outside: the paper has the table");
  assert.deepEqual(report.grids[0], { rows: 3, paperRows: 2, added: 1, where: "table 1" }, "two of the paper's rows and one added");
  const read = await readUploadedFile(bytes.slice().buffer, "meeting.docx");
  assert.ok(read.ok && read.missing.length === 0 && read.entries.length === 6);
});

test("round 2: a workbook's period written in the title's own brackets; merged cells of the example split for DCRS's lines", async () => {
  const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const rows = [
    `<row r="1">${sheetCell("A1", "TRAINING NEED RECORD ( 01.04.2024 ~ 31.03.2025 )")}</row>`,
    `<row r="2">${sheetCell("A2", "Sr. No.", 1)}${sheetCell("B2", "Name", 1)}${sheetCell("C2", "Designation", 1)}</row>`,
    `<row r="3">${sheetCell("A3", "1", 1)}${sheetCell("B3", "Old A", 1)}${sheetCell("C3", "Clerk", 1)}</row>`,
    `<row r="4">${sheetCell("A4", "2", 1)}${sheetCell("B4", "Old B", 1)}${sheetCell("C4", "", 1)}</row>`,
  ].join("");
  const base = await unzip(tinyWorkbook());
  const parts = await Promise.all(
    Array.from(base.keys()).map(async (name) => ({
      name,
      data: name === "xl/worksheets/sheet1.xml" ? enc.encode(`<worksheet xmlns="${MAIN}" xmlns:r="${REL}"><sheetData>${rows}</sheetData><mergeCells count="1"><mergeCell ref="C3:C4"/></mergeCells></worksheet>`) : await base.get(name)!(),
    }))
  );
  const lines: Cell[][] = [[plain("Sr. No."), plain("Name"), plain("Designation")]];
  for (const i of [0, 1]) lines.push([plain(String(i + 1)), bound(`r/${i}/n`, `New ${i}`, "Name"), bound(`r/${i}/d`, `Role ${i}`, "Designation")]);
  const blocks: ExportBlock[] = [...head("TRAINING NEED RECORD"), { kind: "fields", pairs: [["Period", bound("h/p", "01.04.2026 ~ 31.03.2027", "Period")]] }, { kind: "table", rows: lines, headerRows: 1 }];
  const { bytes, report } = await fillXlsx(zipStored(parts).slice().buffer, blocks, { envelope: envelope("xlsx"), company: COMPANY.name });
  assert.equal(report.notPlaced.length, 0);
  const xml = await sheetXml(bytes);
  assert.match(xml, /TRAINING NEED RECORD \( 01\.04\.2026 ~ 31\.03\.2027 \)/, "the period in the title's own brackets");
  assert.ok(!xml.includes('ref="C3:C4"'), "the example's merged Designation split: each line has its own");
  const read = await readUploadedFile(bytes.slice().buffer, "needs.xlsx");
  assert.ok(read.ok);
  if (!read.ok) return;
  assert.equal(read.missing.length, 0);
  for (const e of read.entries) assert.equal(read.values.get(e.i)?.text, e.text, `${e.label} reads back as written`);
});

test("a document with the owner's Word or Excel file downloads as that kind of file", () => {
  for (const id of ["qc-bopp-film", "qc-weight-scale-calibration", "hr-gmp-checklist", "hr-psc-survey", "disp-container-stuffing"]) {
    const doc = SEED_DOCUMENTS.find((d) => d.id === id)!;
    assert.equal(documentFileKind(doc), ORIGINAL_FILES[id].kind, id);
  }
});

test("a Word 2003-mode file marks its grid with a hidden bookmark; a line added under it in Word is read as one new line", async () => {
  const { bytes } = await fillDocx(tinyDocx(), formBlocks(1, "ACCEPTED"), { envelope: envelope("docx"), company: COMPANY.name });
  const zip = await unzip(bytes.slice().buffer);
  const names = Array.from(zip.keys());
  const doc = new TextDecoder().decode(await zip.get("word/document.xml")!());
  assert.ok(doc.includes('w:name="_dcrs_t0"') && !doc.includes("tblCaption"), "a bookmark, not a caption, in a file with no Word 2010 compatibility");
  // A person adds a line in Word: a plain row after the grid's last row, its own words in the Item column.
  const lastRow = doc.lastIndexOf("<w:tr>");
  const end = doc.indexOf("</w:tr>", lastRow) + "</w:tr>".length;
  const cell = (t: string) => `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
  const edited = doc.slice(0, end) + `<w:tr>${cell("2")}${cell("Added in Word")}${cell("33")}</w:tr>` + doc.slice(end);
  const parts = await Promise.all(names.map(async (n) => ({ name: n, data: n === "word/document.xml" ? new TextEncoder().encode(edited) : await zip.get(n)!() })));
  const read = await readUploadedFile(zipStored(parts).slice().buffer, "form.docx");
  assert.ok(read.ok);
  if (!read.ok) return;
  assert.equal(read.appended.length, 1, "the added line is one new line of the grid");
  assert.equal(read.appended[0].cells.item?.text, "Added in Word");
});
