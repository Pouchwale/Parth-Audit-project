// Mitra's attachment reader (backend/attachments.ts) and the shared file
// primitives under it (backend/zip.ts), with fixtures built here: a CSV, a
// text with a BOM, a UTF-16 export, a .docx and an .xlsx written by a
// hand-rolled zip writer, a one-page PDF, a PNG header, an old .doc header,
// random bytes. OCR is switched off (MITRA_OCR=0), so the picture path must
// answer with a note and never throw. Run: npm run test:unit -- attachments
process.env.MITRA_OCR = "0";

import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { crc32, deflateRawSync } from "node:zlib";
import { MAX_ATTACHMENT_TEXT, detectAttachmentKind, readAttachment, stopOcrWorker } from "../attachments.ts";
import { docxText, listZipEntries, looksLikeText, readZipEntry, sniffFileKind, zipHasEntry } from "../zip.ts";

// ---------------------------------------------------------------------------
// a zip writer: stored or deflated members, the central directory, the EOCD

function zipOf(entries: { name: string; data: string | Buffer; deflate?: boolean }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const raw = typeof e.data === "string" ? Buffer.from(e.data, "utf8") : e.data;
    const stored = e.deflate ? deflateRawSync(raw) : raw;
    const name = Buffer.from(e.name, "utf8");
    const method = e.deflate ? 8 : 0;
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, stored);
    centrals.push(central, name);
    offset += local.length + name.length + stored.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, cd, eocd]);
}

const DOCX = zipOf([
  { name: "[Content_Types].xml", data: '<?xml version="1.0"?><Types/>' },
  {
    name: "word/document.xml",
    data:
      '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      "<w:p><w:r><w:t>Supplier audit &amp; report</w:t></w:r></w:p>" +
      "<w:p><w:r><w:t xml:space=\"preserve\">Viscosity </w:t></w:r><w:r><w:t>18.5 sec</w:t></w:r></w:p>" +
      "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Item</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Qty</w:t></w:r></w:p></w:tc></w:tr></w:tbl>" +
      "</w:body></w:document>",
    deflate: true,
  },
]);

const XLSX = zipOf([
  {
    name: "xl/workbook.xml",
    data:
      '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="Stock" sheetId="1" r:id="rId2"/><sheet name="Issues &amp; Returns" sheetId="2" r:id="rId1"/></sheets></workbook>',
    deflate: true,
  },
  {
    name: "xl/_rels/workbook.xml.rels",
    data:
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>' +
      "</Relationships>",
  },
  {
    name: "xl/sharedStrings.xml",
    data:
      '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="4" uniqueCount="4">' +
      "<si><t>Item</t></si><si><t>Qty</t></si><si><r><t>Ink </t></r><r><t>(black)</t></r></si><si><t>ગુંદર</t></si></sst>",
    deflate: true,
  },
  {
    name: "xl/worksheets/sheet1.xml",
    data:
      '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>5</v></c></row>' +
      '<row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3" s="1"/><c r="C3" t="inlineStr"><is><t>note</t></is></c></row>' +
      '<row r="4"/>' +
      '<row r="5"><c r="A5" t="b"><v>1</v></c><c r="B5"><f>SUM(B2)</f><v>5</v></c></row>' +
      "</sheetData></worksheet>",
    deflate: true,
  },
  {
    name: "xl/worksheets/sheet2.xml",
    data:
      '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
      '<row r="1"><c r="A1" t="inlineStr"><is><t>Returned</t></is></c></row></sheetData></worksheet>',
  },
]);

function pdfOf(text: string): Buffer {
  const content = `BT /F1 24 Tf 20 60 Td (${text}) Tj ET`;
  return Buffer.from(
    [
      "%PDF-1.4",
      "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
      "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
      "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
      `4 0 obj << /Length ${Buffer.byteLength(content)} >> stream`,
      content,
      "endstream endobj",
      "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
      "trailer << /Root 1 0 R >>",
      "%%EOF",
    ].join("\n"),
    "latin1"
  );
}

const PNG_HEADER = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);
const OLD_DOC = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64)]);
const BINARY = Buffer.from(Array.from({ length: 256 }, (_, i) => (i * 37) % 256));

// ---------------------------------------------------------------------------

describe("zip.ts — the file primitives", () => {
  it("names a file by its first bytes", () => {
    assert.equal(sniffFileKind(Buffer.from("%PDF-1.7\n")), "pdf");
    assert.equal(sniffFileKind(DOCX), "zip");
    assert.equal(sniffFileKind(OLD_DOC), "doc");
    assert.equal(sniffFileKind(PNG_HEADER), "png");
    assert.equal(sniffFileKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), "jpeg");
    assert.equal(sniffFileKind(Buffer.from("GIF89a\0\0")), "gif");
    assert.equal(sniffFileKind(Buffer.from("RIFF\0\0\0\0WEBPVP8 ")), "webp");
    assert.equal(sniffFileKind(Buffer.from("II*\0\0\0\0\0")), "tiff");
    assert.equal(sniffFileKind(Buffer.from("BMW sales, a plain text line that starts with BM")), null);
    assert.equal(sniffFileKind(Buffer.from("hello")), null);
    assert.equal(sniffFileKind(Buffer.alloc(0)), null);
  });

  it("reads stored and deflated members, and says which members a zip has", () => {
    assert.deepEqual(listZipEntries(DOCX), ["[Content_Types].xml", "word/document.xml"]);
    assert.equal(zipHasEntry(DOCX, "word/document.xml"), true);
    assert.equal(zipHasEntry(DOCX, "xl/workbook.xml"), false);
    assert.equal(readZipEntry(DOCX, "[Content_Types].xml")?.toString("utf8"), '<?xml version="1.0"?><Types/>');
    assert.match(readZipEntry(DOCX, "word/document.xml")?.toString("utf8") ?? "", /Supplier audit &amp; report/);
    assert.equal(readZipEntry(DOCX, "missing.xml"), null);
    assert.equal(readZipEntry(Buffer.from("not a zip at all"), "x"), null);
    assert.deepEqual(listZipEntries(Buffer.from("PK\x03\x04 but nothing else")), []);
  });

  it("turns Word's XML into lines and cells", () => {
    const text = docxText(readZipEntry(DOCX, "word/document.xml")!.toString("utf8"));
    assert.match(text, /^Supplier audit & report\n/);
    assert.match(text, /Viscosity 18\.5 sec\n/);
    assert.match(text, /Item\n\tQty\n\t/);
  });

  it("knows text from binary", () => {
    assert.equal(looksLikeText(Buffer.from("a,b,c\n1,2,3\n")), true);
    assert.equal(looksLikeText(BINARY), false);
    assert.equal(looksLikeText(Buffer.alloc(0)), false);
  });
});

describe("attachments.ts — what a file is", () => {
  it("decides by bytes first, then by name and mime", () => {
    assert.equal(detectAttachmentKind(DOCX, "anything.bin"), "docx");
    assert.equal(detectAttachmentKind(XLSX, "anything.bin"), "xlsx");
    assert.equal(detectAttachmentKind(zipOf([{ name: "a.txt", data: "x" }]), "bundle.zip"), "zip");
    assert.equal(detectAttachmentKind(pdfOf("x"), "scan"), "pdf");
    assert.equal(detectAttachmentKind(PNG_HEADER, "photo.dat"), "image");
    assert.equal(detectAttachmentKind(Buffer.from("plain"), "photo.heic"), "image");
    assert.equal(detectAttachmentKind(Buffer.from("plain"), "blob", "image/webp"), "image");
    assert.equal(detectAttachmentKind(OLD_DOC, "old.doc"), "doc");
    assert.equal(detectAttachmentKind(Buffer.from("a,b\n1,2"), "stock.csv"), "csv");
    assert.equal(detectAttachmentKind(Buffer.from("a\tb\n1\t2"), "stock", "text/tab-separated-values"), "csv");
    assert.equal(detectAttachmentKind(Buffer.from("# Notes"), "notes.md"), "text");
    assert.equal(detectAttachmentKind(Buffer.from('{"a":1}'), "data", "application/json"), "text");
    assert.equal(detectAttachmentKind(Buffer.from("hello"), "readme", "text/plain"), "text");
    // Text-looking bytes with no text name and no text mime are not guessed at.
    assert.equal(detectAttachmentKind(Buffer.from("hello"), "readme"), "unknown");
    assert.equal(detectAttachmentKind(BINARY, "thing.bin"), "unknown");
    assert.equal(detectAttachmentKind(BINARY, "thing.txt"), "unknown");
  });
});

describe("attachments.ts — readAttachment", () => {
  after(() => stopOcrWorker());

  it("reads a CSV as it is", async () => {
    const r = await readAttachment(Buffer.from("Item,Qty\r\nInk,5\r\n"), "stock.csv", "text/csv");
    assert.equal(r.kind, "csv");
    assert.equal(r.text, "Item,Qty\nInk,5");
    assert.equal(r.characters, r.text.length);
    assert.equal(r.truncated, false);
    assert.equal(r.readBy, "text");
    assert.equal(r.note, undefined);
    assert.equal(r.name, "stock.csv");
  });

  it("strips a BOM and reads UTF-16 by its BOM", async () => {
    const bom = await readAttachment(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("Hello Mitra\r\n\r\n\r\n\r\nline 2", "utf8")]), "note.txt");
    assert.equal(bom.kind, "text");
    assert.equal(bom.text, "Hello Mitra\n\nline 2");
    const utf16 = await readAttachment(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("ગુજરાત 5", "utf16le")]), "export.txt");
    assert.equal(utf16.text, "ગુજરાત 5");
  });

  it("reads a Word file's paragraphs and table cells", async () => {
    const r = await readAttachment(DOCX, "audit.docx");
    assert.equal(r.kind, "docx");
    assert.equal(r.text, "Supplier audit & report\nViscosity 18.5 sec\nItem\tQty");
    assert.equal(r.note, undefined);
  });

  it("reads a workbook sheet by sheet, cells tab-separated, shared and inline strings resolved", async () => {
    const r = await readAttachment(XLSX, "stock.xlsx");
    assert.equal(r.kind, "xlsx");
    assert.deepEqual(r.sheets, ["Stock", "Issues & Returns"]);
    const lines = r.text.split("\n");
    assert.deepEqual(lines.slice(0, 5), ["## Stock", "Item\tQty", "Ink (black)\t5", "ગુંદર\t\tnote", "TRUE\t5"]);
    assert.ok(r.text.includes("## Issues & Returns\nReturned"));
    assert.equal(r.note, undefined);
  });

  it("stops at 300 rows a sheet", async () => {
    const rows = Array.from({ length: 350 }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>${i + 1}</v></c></row>`).join("");
    const book = zipOf([
      { name: "xl/workbook.xml", data: '<workbook><sheets><sheet name="Long" sheetId="1" r:id="rId1"/></sheets></workbook>' },
      { name: "xl/worksheets/sheet1.xml", data: `<worksheet><sheetData>${rows}</sheetData></worksheet>`, deflate: true },
    ]);
    const r = await readAttachment(book, "long.xlsx");
    const lines = r.text.split("\n");
    assert.equal(lines[0], "## Long");
    assert.equal(lines.length, 301);
    assert.equal(lines[300], "300");
  });

  it("reads a PDF's text and counts its pages", async () => {
    const r = await readAttachment(pdfOf("Hello Mitra"), "note.pdf", "application/pdf");
    assert.equal(r.kind, "pdf");
    assert.equal(r.pages, 1);
    assert.match(r.text, /Hello Mitra/);
    assert.equal(r.note, undefined);
  });

  it("says when a PDF cannot be opened, without throwing", async () => {
    const r = await readAttachment(Buffer.from("%PDF-1.4\nnothing that is a PDF\n"), "broken.pdf");
    assert.equal(r.kind, "pdf");
    assert.equal(r.text, "");
    assert.ok(r.note && r.note.length > 0, "a note in plain words");
  });

  it("answers a picture with a note when OCR is off — never throws", async () => {
    const r = await readAttachment(PNG_HEADER, "register.png", "image/png");
    assert.equal(r.kind, "image");
    assert.equal(r.readBy, "ocr");
    assert.equal(r.text, "");
    assert.match(r.note ?? "", /OCR/);
  });

  it("names what it cannot read", async () => {
    const old = await readAttachment(OLD_DOC, "cv.doc");
    assert.equal(old.kind, "unknown");
    assert.match(old.note ?? "", /\.docx/);
    const zip = await readAttachment(zipOf([{ name: "a.txt", data: "x" }]), "bundle.zip");
    assert.equal(zip.kind, "unknown");
    assert.match(zip.note ?? "", /zip/);
    const binary = await readAttachment(BINARY, "thing.bin", "application/octet-stream");
    assert.equal(binary.kind, "unknown");
    assert.equal(binary.text, "");
    assert.ok(binary.note);
    const empty = await readAttachment(Buffer.alloc(0), "empty.txt");
    assert.equal(empty.text, "");
    assert.match(empty.note ?? "", /empty/);
    const blank = await readAttachment(Buffer.from("   \n\n  "), "blank.txt");
    assert.equal(blank.text, "");
    assert.ok(blank.note);
  });

  it("caps the text at 60,000 characters and says so", async () => {
    const long = Array.from({ length: 3000 }, (_, i) => `line ${i} of a long log with some words in it`).join("\n");
    assert.ok(long.length > MAX_ATTACHMENT_TEXT);
    const r = await readAttachment(Buffer.from(long), "server.log");
    assert.equal(r.kind, "text");
    assert.equal(r.truncated, true);
    assert.ok(r.characters <= MAX_ATTACHMENT_TEXT);
    assert.equal(r.characters, r.text.length);
    assert.ok(r.text.endsWith("words in it"), "cut at a line break");
  });

  it("keeps the file name to 200 characters", async () => {
    const r = await readAttachment(Buffer.from("a,b"), `${"n".repeat(300)}.csv`);
    assert.equal(r.name.length, 200);
  });
});
