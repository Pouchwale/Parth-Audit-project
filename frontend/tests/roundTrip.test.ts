// UPLOADING AN EDITED WORD OR EXCEL FILE BACK (REQUIREMENTS §81): the files are
// made by the real writers (utils/documentExport.ts) from hand-made blocks that
// carry bindings, edited the way Excel and Word edit and save them — strings
// moved to the shared-strings table, styles renumbered, every part deflated,
// a date typed as a serial, rows inserted, deleted and added, runs split,
// tracked changes, a control emptied to its placeholder — and read back
// (engine/roundTrip/readFile.ts), then planned (engine/roundTrip/plan.ts).
// Whatever was not touched must never come back as a change.
import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { crc32, isoToSerial, unzip, zipStored } from "../src/utils/xlsx";
import { documentFileBytes, workbookFromBlocks, wordDocumentFromBlocks, type Cell, type ExportBlock } from "../src/utils/documentExport";
import { makeEnvelope, type ExportBinding, type ExportTableBinding } from "../src/engine/roundTrip/exportMap";
import { readUploadedFile, READ_MESSAGES, type ReadResult } from "../src/engine/roundTrip/readFile";
import { applyPlanToData, planImport, type ImportPlan, type PlanContext } from "../src/engine/roundTrip/plan";
import type { BindOption, BindType } from "../src/engine/roundTrip/bindPath";

// ---------------------------------------------------------------------------
// the document

const REC = "rec-qc-1";
const DOC = { id: "qc-test-sheet", name: "Test Sheet", formatNo: "F/QC/99", revisionNo: "01" };
const EXPORTED_AT = "2026-09-27T10:00:00.000Z";
const SHIFTS: BindOption[] = [
  { value: "A", label: "Shift A" },
  { value: "B", label: "Shift B" },
  { value: "C", label: "Shift C" },
];

function bind(path: string, type: BindType, text: string, opts: { label?: string; options?: BindOption[]; recordId?: string } = {}): ExportBinding {
  return { path, type, text, label: opts.label, options: opts.options ?? [], recordId: opts.recordId ?? REC };
}
const bound = (b: ExportBinding, extra: Partial<Cell> = {}): Cell => ({ text: b.text, bind: b, parts: [{ text: b.text, bind: b }], ...extra });
const plain = (text: string): Cell => ({ text });

const GRID: ExportTableBinding = {
  recordId: REC,
  listPath: "rows",
  columns: [
    { key: "time", type: "time", options: [], col: 1, label: "Time" },
    { key: "viscosity", type: "number", options: [], col: 2, label: "Viscosity" },
    { key: "ok", type: "yesno", options: [], col: 3, label: "OK" },
    { key: "shift", type: "select", options: SHIFTS, col: 4, label: "Shift" },
    { key: "note", type: "text", options: [], col: 5, label: "Note" },
  ],
};

function sampleData() {
  return {
    header: { date: "2026-10-01", checkedBy: "Ravi Patel", temperature: 12, remarks: "All good\nNo leaks", approved: false, shiftA: "Mehul", shiftB: "Kiran" },
    rows: [
      { id: "r-1", time: "10:30", viscosity: 12.5, ok: "Yes", shift: "A", note: "" },
      { id: "r-2", time: "14:00", viscosity: 13, ok: "No", shift: "B", note: "thin" },
    ],
    greeting: "Ravi",
  };
}

const row = (id: string, sr: string, time: string, visc: string, ok: string, shift: string, note: string): Cell[] => [
  plain(sr),
  bound(bind(`rows/@${id}/time`, "time", time, { label: `Line ${sr} · Time` })),
  bound(bind(`rows/@${id}/viscosity`, "number", visc, { label: `Line ${sr} · Viscosity` })),
  bound(bind(`rows/@${id}/ok`, "yesno", ok, { label: `Line ${sr} · OK` })),
  bound(bind(`rows/@${id}/shift`, "select", shift, { label: `Line ${sr} · Shift`, options: SHIFTS })),
  bound(bind(`rows/@${id}/note`, "text", note, { label: `Line ${sr} · Note` })),
];

function sampleBlocks(): ExportBlock[] {
  const date = bind("header/date", "date", "01-Oct-2026", { label: "Date" });
  const temp: ExportBinding = { ...bind("header/temperature", "number", "12", { label: "Temperature" }), pre: "Temp: ", post: " °C" };
  const shiftA = bind("header/shiftA", "text", "Mehul", { label: "In-charge A" });
  const shiftB = bind("header/shiftB", "text", "Kiran", { label: "In-charge B" });
  const greeting = bind("greeting", "text", "Ravi", { label: "Name" });
  return [
    { kind: "text", text: "GUJARAT PRINT PACK PUBLICATION PVT. LTD.", strong: true, title: true },
    {
      kind: "fields",
      pairs: [
        ["Date", bound(date, { date: "2026-10-01" })],
        ["Checked by", bound(bind("header/checkedBy", "text", "Ravi Patel", { label: "Checked by" }))],
        ["Temperature", { text: "Temp: 12 °C", bind: temp, parts: [{ text: "Temp: " }, { text: "12", bind: temp }, { text: " °C" }] }],
        ["Shift in-charge", { text: "A: Mehul, B: Kiran", parts: [{ text: "A: " }, { text: "Mehul", bind: shiftA }, { text: ", B: " }, { text: "Kiran", bind: shiftB }] }],
        ["Remarks", bound(bind("header/remarks", "paragraph", "All good\nNo leaks", { label: "Remarks" }))],
      ],
    },
    {
      kind: "table",
      headerRows: 1,
      bindTable: GRID,
      rows: [[plain("Sr. No."), plain("Time"), plain("Viscosity"), plain("OK"), plain("Shift"), plain("Note")], row("r-1", "1", "10:30", "12.5", "Yes", "Shift A", ""), row("r-2", "2", "14:00", "13", "No", "Shift B", "thin")],
    },
    { kind: "text", text: "Dear Ravi, thank you for the report.", strong: false, parts: [{ text: "Dear " }, { text: "Ravi", bind: greeting }, { text: ", thank you for the report." }] },
    { kind: "fields", pairs: [["Approved", bound(bind("header/approved", "bool", "☐", { label: "Approved" }))]] },
  ];
}
const ENTRY_COUNT = 18;

// Sheet layout the writer gives these blocks (1-based rows):
//   1 title · 3 Date · 4 Checked by · 5 Temperature · 6 Shift in-charge · 7 Remarks
//   9 grid heading · 10 line r-1 · 11 line r-2 · 13 "Dear Ravi…" · 15 Approved

function ctx(data: unknown, extra: Partial<PlanContext> = {}): PlanContext {
  return {
    today: "2026-10-05",
    getRecord: (id) => (id === REC ? { data, documentId: DOC.id } : null),
    blankItem: (_doc, list) => (list === "rows" ? { id: "", time: "", viscosity: null, ok: "", shift: "", note: "" } : null),
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// zip parts, as a program that re-saves the file sees them

const enc = new TextEncoder();
const dec = new TextDecoder();

async function partsOf(bytes: Uint8Array): Promise<Map<string, string>> {
  const zip = await unzip(bytes.slice().buffer);
  const out = new Map<string, string>();
  for (const [name, get] of zip) out.set(name, dec.decode(await get()));
  return out;
}

/** A zip the way Excel and Word write one: every entry deflated, sizes in data descriptors after the data. */
function zipDeflated(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const packed = new Uint8Array(deflateRawSync(f.data));
    const crc = crc32(f.data);
    const local = new Uint8Array(30 + name.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x0008, true);
    l.setUint16(8, 8, true);
    l.setUint16(26, name.length, true);
    local.set(name, 30);
    const descriptor = new Uint8Array(16);
    const d = new DataView(descriptor.buffer);
    d.setUint32(0, 0x08074b50, true);
    d.setUint32(4, crc, true);
    d.setUint32(8, packed.length, true);
    d.setUint32(12, f.data.length, true);
    const central = new Uint8Array(46 + name.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0008, true);
    c.setUint16(10, 8, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, packed.length, true);
    c.setUint32(24, f.data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local, packed, descriptor);
    centrals.push(central);
    offset += local.length + packed.length + descriptor.length;
  }
  const size = centrals.reduce((n, x) => n + x.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, size, true);
  e.setUint32(16, offset, true);
  const out = new Uint8Array(offset + size + 22);
  let p = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

function zipOf(parts: Map<string, string>, deflate = false): ArrayBuffer {
  const files = Array.from(parts, ([name, text]) => ({ name, data: enc.encode(text) }));
  return (deflate ? zipDeflated(files) : zipStored(files)).slice().buffer;
}

async function read(bytes: ArrayBuffer | Uint8Array, name = "upload.xlsx"): Promise<Extract<ReadResult, { ok: true }>> {
  const result = await readUploadedFile(bytes instanceof Uint8Array ? bytes.slice().buffer : bytes, name);
  if (!result.ok) assert.fail(`the file should read: ${result.reason} — ${result.message}`);
  return result;
}

const xlsxBytes = () => documentFileBytes("xlsx", DOC, sampleBlocks(), [REC], EXPORTED_AT);
const docxBytes = () => documentFileBytes("docx", DOC, sampleBlocks(), [REC], EXPORTED_AT);

// ---------------------------------------------------------------------------
// Excel's ways

const SHEET = "xl/worksheets/sheet1.xml";

/** Sets a cell of the visible sheet (replacing it, or adding it to its row). */
function setCell(parts: Map<string, string>, ref: string, cellXml: string): void {
  let xml = parts.get(SHEET)!;
  const re = new RegExp(`<c r="${ref}"(?: [^>]*?)?(?:/>|>[\\s\\S]*?</c>)`);
  if (re.test(xml)) xml = xml.replace(re, cellXml);
  else {
    const rowNo = /\d+$/.exec(ref)![0];
    const rowRe = new RegExp(`(<row r="${rowNo}"[^>]*>)([\\s\\S]*?)(</row>)`);
    if (rowRe.test(xml)) xml = xml.replace(rowRe, (_, a: string, b: string, c: string) => `${a}${b}${cellXml}${c}`);
    else xml = xml.replace("</sheetData>", `<row r="${rowNo}">${cellXml}</row></sheetData>`);
  }
  parts.set(SHEET, xml);
}
const inline = (ref: string, text: string, s = 3) => `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;

/** What Excel does to strings on a save: every one into the shared-strings table, a few as rich runs, one with a phonetic guide. */
function toSharedStrings(parts: Map<string, string>): void {
  const strings: string[] = [];
  const index = new Map<string, number>();
  for (const [name, xml] of parts) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) continue;
    parts.set(
      name,
      xml.replace(/<c r="([A-Z]+\d+)"((?: s="\d+")?) t="inlineStr"><is><t xml:space="preserve">([\s\S]*?)<\/t><\/is><\/c>/g, (_, ref: string, s: string, text: string) => {
        let i = index.get(text);
        if (i === undefined) {
          i = strings.length;
          strings.push(text);
          index.set(text, i);
        }
        return `<c r="${ref}"${s} t="s"><v>${i}</v></c>`;
      })
    );
  }
  let richDone = 0;
  const items = strings.map((t) => {
    const space = t.indexOf(" ");
    if (space > 0 && richDone < 3) {
      richDone++;
      return `<si><r><rPr><b/><sz val="10"/></rPr><t>${t.slice(0, space)}</t></r><r><t xml:space="preserve">${t.slice(space)}</t></r>${richDone === 1 ? '<rPh sb="0" eb="1"><t>PHONETIC</t></rPh>' : ""}</si>`;
    }
    return `<si><t xml:space="preserve">${t}</t></si>`;
  });
  parts.set("xl/sharedStrings.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${items.join("")}</sst>`);
  parts.set("[Content_Types].xml", parts.get("[Content_Types].xml")!.replace("</Types>", '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>'));
  parts.set(
    "xl/_rels/workbook.xml.rels",
    parts.get("xl/_rels/workbook.xml.rels")!.replace("</Relationships>", '<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>')
  );
}

/** What Excel does to styles on a save: renumbered, and the date format given a new number and code. */
function renumberStyles(parts: Map<string, string>): void {
  const styles = parts.get("xl/styles.xml")!;
  const m = /<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/.exec(styles)!;
  const xfs = m[2].match(/<xf [^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)!;
  const order = xfs.map((_, i) => i).reverse();
  const dummy = '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
  const renumbered = [dummy, dummy, ...order.map((i) => xfs[i])];
  const newIndex = (old: number) => 2 + order.indexOf(old);
  parts.set(
    "xl/styles.xml",
    styles
      .replace(m[0], `<cellXfs count="${renumbered.length}">${renumbered.join("")}</cellXfs>`)
      .replace('<numFmt numFmtId="164" formatCode="[$-409]dd\\-mmm\\-yyyy"/>', '<numFmt numFmtId="170" formatCode="dd/mm/yyyy;@"/>')
      .replace(/numFmtId="164"/g, 'numFmtId="170"')
  );
  for (const [name, xml] of parts) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) continue;
    parts.set(
      name,
      xml.replace(/(<c r="[A-Z]+\d+") s="(\d+)"/g, (_, head: string, s: string) => `${head} s="${newIndex(Number(s))}"`).replace(/<c r="([A-Z]+\d+)"(?=[ >/])(?![^>]* s=")/g, `<c r="$1" s="${newIndex(0)}"`)
    );
  }
}

/** Excel's Insert ▸ Sheet Rows at `at`: the rows below move down, and so do the hidden names on them. */
function insertRow(parts: Map<string, string>, at: number, cells: string): void {
  const shift = (n: number) => (n >= at ? n + 1 : n);
  let xml = parts.get(SHEET)!;
  xml = xml.replace(/<row r="(\d+)"/g, (_, r: string) => `<row r="${shift(Number(r))}"`).replace(/<c r="([A-Z]+)(\d+)"/g, (_, col: string, r: string) => `<c r="${col}${shift(Number(r))}"`);
  const newRow = `<row r="${at}">${cells}</row>`;
  const next = new RegExp(`<row r="(\\d+)"`, "g");
  let placed = false;
  xml = xml.replace(next, (whole, r: string) => {
    if (!placed && Number(r) > at) {
      placed = true;
      return `${newRow}${whole}`;
    }
    return whole;
  });
  if (!placed) xml = xml.replace("</sheetData>", `${newRow}</sheetData>`);
  parts.set(SHEET, xml);
  parts.set(
    "xl/workbook.xml",
    parts.get("xl/workbook.xml")!.replace(/(<definedName [^>]*>)([^<]*)(<\/definedName>)/g, (_, a: string, f: string, c: string) => `${a}${f.replace(/\$([A-Z]+)\$(\d+)/g, (__, col: string, r: string) => `$${col}$${shift(Number(r))}`)}${c}`)
  );
}

/** Excel's Delete ▸ Sheet Rows at `at`: the rows below move up; a name on the deleted row becomes #REF!. */
function deleteRow(parts: Map<string, string>, at: number): void {
  let xml = parts.get(SHEET)!;
  xml = xml.replace(new RegExp(`<row r="${at}"[^>]*>[\\s\\S]*?</row>`), "");
  const shift = (n: number) => (n > at ? n - 1 : n);
  xml = xml.replace(/<row r="(\d+)"/g, (_, r: string) => `<row r="${shift(Number(r))}"`).replace(/<c r="([A-Z]+)(\d+)"/g, (_, col: string, r: string) => `<c r="${col}${shift(Number(r))}"`);
  parts.set(SHEET, xml);
  parts.set(
    "xl/workbook.xml",
    parts.get("xl/workbook.xml")!.replace(/(<definedName [^>]*>)([^<]*)(<\/definedName>)/g, (_, a: string, f: string, c: string) => {
      const rowNo = Number(/\$(\d+)$/.exec(f)?.[1] ?? 0);
      if (rowNo === at) return `${a}${f.replace(/!.*$/, "!#REF!")}${c}`;
      return `${a}${f.replace(/\$([A-Z]+)\$(\d+)/g, (__, col: string, r: string) => `$${col}$${shift(Number(r))}`)}${c}`;
    })
  );
}

/** Excel's Sort on two lines: the cells change places, the hidden names on them do not. */
function swapRows(parts: Map<string, string>, a: number, b: number): void {
  let xml = parts.get(SHEET)!;
  const rowA = new RegExp(`<row r="${a}"[^>]*>[\\s\\S]*?</row>`).exec(xml)![0];
  const rowB = new RegExp(`<row r="${b}"[^>]*>[\\s\\S]*?</row>`).exec(xml)![0];
  const moved = (row: string, to: number) => row.replace(/<row r="\d+"/, `<row r="${to}"`).replace(/<c r="([A-Z]+)\d+"/g, (_, col: string) => `<c r="${col}${to}"`);
  xml = xml.replace(rowA, "\u0000A").replace(rowB, "\u0000B").replace("\u0000A", moved(rowB, a)).replace("\u0000B", moved(rowA, b));
  parts.set(SHEET, xml);
}

const changesBy = (plan: ImportPlan) => Object.fromEntries(plan.changes.map((c) => [c.path, c.value]));

// ---------------------------------------------------------------------------
// Excel

test("the workbook's visible sheet is the same with the map as without it; the map is a very hidden sheet, hidden names and a custom property", async () => {
  const withMap = await partsOf(workbookFromBlocks("F-QC-99", sampleBlocks(), makeEnvelope("xlsx", { documentId: DOC.id }, [REC], EXPORTED_AT)));
  const without = await partsOf(workbookFromBlocks("F-QC-99", sampleBlocks()));
  assert.equal(withMap.get(SHEET), without.get(SHEET), "the sheet a person sees is untouched");
  assert.equal(withMap.get("xl/styles.xml"), without.get("xl/styles.xml"));
  assert.ok(!without.has("xl/worksheets/sheet2.xml") && !without.has("docProps/custom.xml"), "no map without an envelope");
  const wb = withMap.get("xl/workbook.xml")!;
  assert.match(wb, /<sheet name="_dcrs" sheetId="2" state="veryHidden" r:id="rId3"\/>/);
  assert.match(wb, /<definedName name="_dcrs_0" hidden="1">'F-QC-99'!\$B\$3<\/definedName>/);
  assert.match(wb, /<definedName name="_dcrs_t0_h" hidden="1">'F-QC-99'!\$A\$9<\/definedName>/);
  assert.match(wb, /<definedName name="_dcrs_t0_z" hidden="1">'F-QC-99'!\$A\$11<\/definedName>/);
  assert.match(wb, /<definedName name="_dcrs_t0_n" hidden="1">'F-QC-99'!\$A\$13<\/definedName>/);
  assert.match(withMap.get("docProps/custom.xml")!, /name="dcrs.envelope"><vt:lpwstr>\{"v":1,"documentId":"qc-test-sheet","recordId":"rec-qc-1","exportedAt":"2026-09-27T10:00:00.000Z"\}<\/vt:lpwstr>/);
  assert.match(withMap.get("[Content_Types].xml")!, /\/xl\/worksheets\/sheet2\.xml/);
  assert.match(withMap.get("_rels/.rels")!, /custom-properties" Target="docProps\/custom\.xml"/);
  // A bound date shown as words is still a real date in the sheet; a text value next to a number is text.
  assert.match(withMap.get(SHEET)!, new RegExp(`<c r="B3" s="5"><v>${isoToSerial("2026-10-01")}</v></c>`));
});

test("a workbook read back untouched changes nothing", async () => {
  const r = await read(xlsxBytes());
  assert.equal(r.kind, "xlsx");
  assert.equal(r.envelope.documentId, DOC.id);
  assert.deepEqual(r.envelope.recordIds, [REC]);
  assert.equal(r.envelope.formatNo, "F/QC/99");
  assert.equal(r.envelope.revisionNo, "01");
  assert.equal(r.entries.length, ENTRY_COUNT);
  assert.equal(r.missing.length, 0);
  assert.equal(r.appended.length, 0);
  assert.equal(r.tables.length, 1);
  assert.deepEqual(r.tables[0].columns.map((c) => [c.key, c.col, c.label]), [
    ["time", 1, "Time"],
    ["viscosity", 2, "Viscosity"],
    ["ok", 3, "OK"],
    ["shift", 4, "Shift"],
    ["note", 5, "Note"],
  ]);
  const plan = planImport(r, "upload.xlsx", ctx(sampleData()));
  assert.deepEqual(plan.changes, []);
  assert.deepEqual(plan.appends, []);
  assert.deepEqual(plan.rejected, []);
  assert.equal(plan.unchanged, ENTRY_COUNT);
  assert.deepEqual(plan.records, [{ recordId: REC, documentId: DOC.id, found: true }]);
});

test("a workbook Excel saved again untouched — shared strings, rich runs, renumbered styles, deflated with data descriptors — changes nothing", async () => {
  const parts = await partsOf(xlsxBytes());
  toSharedStrings(parts);
  renumberStyles(parts);
  const r = await read(zipOf(parts, true));
  assert.equal(r.values.get(r.entries.find((e) => e.path === "header/date")!.i)?.isDate, true, "the date is known by its style in the new styles part");
  const plan = planImport(r, "upload.xlsx", ctx(sampleData()));
  assert.deepEqual(plan.changes, []);
  assert.deepEqual(plan.rejected, []);
  assert.equal(plan.unchanged, ENTRY_COUNT);
});

test("values changed in Excel are exactly the changes; a value that is not a number is rejected with the reason", async () => {
  const parts = await partsOf(xlsxBytes());
  const serial = isoToSerial("2026-10-06")!;
  setCell(parts, "B3", `<c r="B3" s="5"><v>${serial}</v></c>`); // a date typed in as Excel stores it
  setCell(parts, "B4", inline("B4", "Rajesh Kumar"));
  setCell(parts, "B5", inline("B5", "Temp: 14 °C"));
  setCell(parts, "B6", inline("B6", "A: Mehul, B: Suresh"));
  setCell(parts, "C10", `<c r="C10" s="6"><v>12.600000000000001</v></c>`); // float noise
  setCell(parts, "E10", inline("E10", "shift  b"));
  setCell(parts, "D11", inline("D11", "Y"));
  setCell(parts, "C11", inline("C11", "abc"));
  setCell(parts, "A13", inline("A13", "Dear Ravindra, thank you for the report.", 7));
  setCell(parts, "B15", inline("B15", "☑"));
  toSharedStrings(parts);
  renumberStyles(parts);
  const r = await read(zipOf(parts, true));
  const plan = planImport(r, "upload.xlsx", ctx(sampleData()));
  assert.deepEqual(changesBy(plan), {
    "header/date": "2026-10-06",
    "header/checkedBy": "Rajesh Kumar",
    "header/temperature": 14,
    "header/shiftB": "Suresh",
    "rows/@r-1/viscosity": 12.6,
    "rows/@r-1/shift": "B",
    "rows/@r-2/ok": "Yes",
    greeting: "Ravindra",
    "header/approved": true,
  });
  const byPath = new Map(plan.changes.map((c) => [c.path, c]));
  assert.equal(byPath.get("header/date")!.before, "01-Oct-2026");
  assert.equal(byPath.get("header/date")!.after, "06-Oct-2026");
  assert.equal(byPath.get("rows/@r-1/shift")!.before, "Shift A");
  assert.equal(byPath.get("rows/@r-1/shift")!.after, "Shift B");
  assert.equal(byPath.get("header/approved")!.after, "☑");
  assert.equal(byPath.get("rows/@r-1/shift")!.label, "Line 1 · Shift");
  assert.ok(plan.changes.every((c) => !c.conflict), "nothing was changed in the app since the download");
  assert.equal(plan.rejected.length, 1);
  assert.equal(plan.rejected[0].label, "Line 2 · Viscosity");
  assert.equal(plan.rejected[0].why, "‘abc’ is not a number.");
  assert.equal(plan.unchanged, ENTRY_COUNT - 9 - 1);

  const applied = applyPlanToData(sampleData(), REC, plan);
  assert.equal(applied.applied, 9);
  assert.deepEqual(applied.failed, []);
  const data = applied.data as ReturnType<typeof sampleData>;
  assert.equal(data.header.checkedBy, "Rajesh Kumar");
  assert.equal(data.rows[0].viscosity, 12.6);
  assert.equal(data.rows[1].viscosity, 13, "the rejected value is left as it was");
  assert.equal(data.rows[1].ok, "Yes");
  assert.equal(data.header.shiftA, "Mehul");
});

test("a row inserted above bound rows moves nothing: the hidden names follow the cells", async () => {
  const parts = await partsOf(xlsxBytes());
  insertRow(parts, 3, inline("A3", "A note a person added", 0));
  insertRow(parts, 3, "");
  setCell(parts, "B6", inline("B6", "Rajesh Kumar")); // Checked by, now two rows lower
  const r = await read(zipOf(parts));
  const plan = planImport(r, "upload.xlsx", ctx(sampleData()));
  assert.deepEqual(changesBy(plan), { "header/checkedBy": "Rajesh Kumar" });
  assert.deepEqual(plan.appends, []);
  assert.equal(plan.missing, 0);
});

test("a grid sorted in Excel: each line's values are found by its Sr. No., which moved with it (the names did not)", async () => {
  const untouched = await read(xlsxBytes());
  const anchored = untouched.entries.filter((e) => e.anchor);
  assert.equal(anchored.length, 10, "every value on a grid line is anchored to the line");
  assert.deepEqual(untouched.entries.find((e) => e.path === "rows/@r-2/ok")!.anchor, { col: 0, text: "2", grid: 0 });
  const parts = await partsOf(xlsxBytes());
  swapRows(parts, 10, 11);
  const sorted = planImport(await read(zipOf(parts)), "upload.xlsx", ctx(sampleData()));
  assert.deepEqual(sorted.changes, [], "sorting alone changes nothing");
  assert.equal(sorted.missing, 0);
  assert.deepEqual(sorted.appends, []);
  setCell(parts, "C10", `<c r="C10" s="6"><v>20</v></c>`); // line 2's viscosity, now on the first line of the sheet
  const edited = planImport(await read(zipOf(parts)), "upload.xlsx", ctx(sampleData()));
  assert.deepEqual(changesBy(edited), { "rows/@r-2/viscosity": 20 });
});

test("a line whose Sr. No. was typed over cannot be told apart any more: its values are missing, never applied to another line", async () => {
  const parts = await partsOf(xlsxBytes());
  setCell(parts, "A11", `<c r="A11" s="6"><v>7</v></c>`);
  setCell(parts, "C11", `<c r="C11" s="6"><v>99</v></c>`);
  const plan = planImport(await read(zipOf(parts)), "upload.xlsx", ctx(sampleData()));
  assert.deepEqual(plan.changes, []);
  assert.equal(plan.missing, 5);
});

test("without the hidden names (a program that drops them) the map's cell references are used", async () => {
  const parts = await partsOf(xlsxBytes());
  parts.set("xl/workbook.xml", parts.get("xl/workbook.xml")!.replace(/<definedNames>[\s\S]*<\/definedNames>/, ""));
  setCell(parts, "B4", inline("B4", "Rajesh Kumar"));
  const plan = planImport(await read(zipOf(parts)), "upload.xlsx", ctx(sampleData()));
  assert.deepEqual(changesBy(plan), { "header/checkedBy": "Rajesh Kumar" });
});

test("a deleted row's values are missing, never changed; the grid's end is found from the lines still there", async () => {
  const parts = await partsOf(xlsxBytes());
  deleteRow(parts, 11);
  const r = await read(zipOf(parts));
  assert.equal(r.missing.length, 5);
  const plan = planImport(r, "upload.xlsx", ctx(sampleData()));
  assert.equal(plan.missing, 5);
  assert.deepEqual(plan.changes, []);
  assert.deepEqual(plan.appends, []);
});

test("lines added below a grid in Excel become new items; a bad value in one is rejected and the rest kept", async () => {
  const parts = await partsOf(xlsxBytes());
  insertRow(parts, 12, [inline("A12", "3"), inline("B12", "16:45"), `<c r="C12" s="6"><v>14.2</v></c>`, inline("D12", "N"), inline("E12", "Shift C"), inline("F12", "ok")].join(""));
  insertRow(parts, 13, [inline("B13", "5 pm"), inline("C13", "x1")].join(""));
  toSharedStrings(parts);
  const r = await read(zipOf(parts, true));
  assert.equal(r.appended.length, 2);
  const plan = planImport(r, "upload.xlsx", ctx(sampleData()));
  assert.deepEqual(plan.changes, []);
  assert.equal(plan.appends.length, 2);
  const [first, second] = plan.appends;
  assert.equal(first.listPath, "rows");
  assert.match(String(first.item.id), /^row-/);
  assert.deepEqual({ ...first.item, id: "" }, { id: "", time: "16:45", viscosity: 14.2, ok: "No", shift: "C", note: "ok" });
  assert.deepEqual({ ...second.item, id: "" }, { id: "", time: "17:00", viscosity: null, ok: "", shift: "", note: "" });
  assert.match(first.label, /^New line 1: 16:45 · 14.2 · No · Shift C · ok$/);
  assert.deepEqual(plan.rejected, [{ recordId: REC, label: "New line 2 · Viscosity", text: "x1", why: "‘x1’ is not a number." }]);
  // The words after the grid are not read as lines: the greeting below it is where it was.
  assert.equal(plan.unchanged, ENTRY_COUNT);

  const applied = applyPlanToData(sampleData(), REC, plan);
  const rows = (applied.data as ReturnType<typeof sampleData>).rows;
  assert.equal(rows.length, 4);
  assert.equal(rows[2].time, "16:45");
  assert.equal(applied.applied, 2);
});

test("a line typed into the empty row under the grid is a new line; the next block is not", async () => {
  const parts = await partsOf(xlsxBytes());
  setCell(parts, "B12", inline("B12", "18:00"));
  setCell(parts, "C12", `<c r="C12" s="6"><v>11</v></c>`);
  const plan = planImport(await read(zipOf(parts)), "upload.xlsx", ctx(sampleData()));
  assert.equal(plan.appends.length, 1);
  assert.equal(plan.appends[0].item.time, "18:00");
  assert.equal(plan.appends[0].item.viscosity, 11);
});

test("a line inserted between two lines of the grid is a new line too", async () => {
  const parts = await partsOf(xlsxBytes());
  insertRow(parts, 11, [inline("B11", "12:00"), `<c r="C11" s="6"><v>12.8</v></c>`, inline("D11", "yes")].join(""));
  const plan = planImport(await read(zipOf(parts)), "upload.xlsx", ctx(sampleData()));
  assert.deepEqual(plan.changes, []);
  assert.equal(plan.appends.length, 1);
  assert.deepEqual({ ...plan.appends[0].item, id: "" }, { id: "", time: "12:00", viscosity: 12.8, ok: "Yes", shift: "", note: "" });
});

test("new lines where lines cannot be added are rejected, not dropped silently", async () => {
  const parts = await partsOf(xlsxBytes());
  setCell(parts, "B12", inline("B12", "18:00"));
  const plan = planImport(await read(zipOf(parts)), "upload.xlsx", ctx(sampleData(), { blankItem: () => null }));
  assert.equal(plan.appends.length, 0);
  assert.equal(plan.rejected.length, 1);
  assert.equal(plan.rejected[0].label, "New line 1");
});

test("the sheet renamed and the map sheet merely hidden still read", async () => {
  const parts = await partsOf(xlsxBytes());
  parts.set("xl/workbook.xml", parts.get("xl/workbook.xml")!.replace('name="F-QC-99"', 'name="My copy"').replace(/'F-QC-99'!/g, "'My copy'!").replace('state="veryHidden"', 'state="hidden"'));
  setCell(parts, "B4", inline("B4", "Rajesh Kumar"));
  const plan = planImport(await read(zipOf(parts)), "copy.xlsx", ctx(sampleData()));
  assert.deepEqual(changesBy(plan), { "header/checkedBy": "Rajesh Kumar" });
});

test("TRUE/FALSE, formulas' cached values and t=\"d\" dates are read as what they mean", async () => {
  const parts = await partsOf(xlsxBytes());
  setCell(parts, "B15", `<c r="B15" t="b"><v>1</v></c>`);
  setCell(parts, "B4", `<c r="B4" t="str"><f>UPPER("x")</f><v>Ravi Patel</v></c>`);
  setCell(parts, "B3", `<c r="B3" t="d"><v>2026-10-01T00:00:00</v></c>`);
  setCell(parts, "B10", `<c r="B10" s="5"><f>TIME(10,30,0)</f><v>0.4375</v></c>`);
  const r = await read(zipOf(parts));
  const plan = planImport(r, "upload.xlsx", ctx(sampleData()));
  assert.deepEqual(changesBy(plan), { "header/approved": true }, "only the tick box changed; the rest read as the same values");
});

test("a value changed in the app after the download is flagged when the file changes it too", async () => {
  const parts = await partsOf(xlsxBytes());
  setCell(parts, "B4", inline("B4", "Rajesh Kumar"));
  const data = sampleData();
  data.header.checkedBy = "Someone Else";
  data.header.remarks = "Edited in the app";
  const plan = planImport(await read(zipOf(parts)), "upload.xlsx", ctx(data));
  assert.equal(plan.changes.length, 1, "the remarks edited in the app are not overwritten by the file's old words");
  assert.equal(plan.changes[0].before, "Someone Else");
  assert.equal(plan.changes[0].conflict, true);
});

test("a record the system no longer has is reported, and its values skipped", async () => {
  const parts = await partsOf(xlsxBytes());
  setCell(parts, "B4", inline("B4", "Rajesh Kumar"));
  const plan = planImport(await read(zipOf(parts)), "upload.xlsx", ctx(sampleData(), { getRecord: () => null }));
  assert.deepEqual(plan.records, [{ recordId: REC, documentId: DOC.id, found: false }]);
  assert.deepEqual(plan.changes, []);
  assert.equal(plan.unchanged, 0);
});

test("a line removed in the app since the download: its changed values are rejected, not written somewhere else", async () => {
  const parts = await partsOf(xlsxBytes());
  setCell(parts, "C11", `<c r="C11" s="6"><v>99</v></c>`);
  const data = sampleData();
  data.rows = data.rows.slice(0, 1);
  const plan = planImport(await read(zipOf(parts)), "upload.xlsx", ctx(data));
  assert.deepEqual(plan.changes, []);
  assert.equal(plan.rejected.length, 1);
  assert.match(plan.rejected[0].why, /no longer in the record/);
});

test("the same value shown twice and changed to two different values: the first is used, the second rejected", async () => {
  const blocks = sampleBlocks();
  const twice = bind("header/checkedBy", "text", "Ravi Patel", { label: "Checked by" });
  blocks.push({ kind: "fields", pairs: [["Checked by (again)", bound(twice)]] });
  const parts = await partsOf(documentFileBytes("xlsx", DOC, blocks, [REC], EXPORTED_AT));
  setCell(parts, "B4", inline("B4", "Rajesh"));
  setCell(parts, "B17", inline("B17", "Mohan"));
  const plan = planImport(await read(zipOf(parts)), "upload.xlsx", ctx(sampleData()));
  assert.deepEqual(changesBy(plan), { "header/checkedBy": "Rajesh" });
  assert.equal(plan.rejected.length, 1);
  assert.match(plan.rejected[0].why, /two places/);
});

test("files that cannot be read are answered in plain words", async () => {
  const legacy = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
  const r1 = await readUploadedFile(legacy.buffer, "sheet.xls");
  assert.deepEqual(r1.ok ? null : r1.reason, "legacy-format");
  const r2 = await readUploadedFile(enc.encode("Name,Value\nA,1\n").slice().buffer, "sheet.csv");
  assert.deepEqual(r2.ok ? null : [r2.reason, r2.message], ["not-office", READ_MESSAGES["not-office"]]);
  const r3 = await readUploadedFile(enc.encode("<html></html>").slice().buffer, "old.xls");
  assert.equal(r3.ok ? null : r3.reason, "legacy-format", "an old-format name is told to save as .xlsx");
  const r4 = await readUploadedFile(new Blob([new Uint8Array(15 * 1024 * 1024 + 1)]), "huge.xlsx");
  assert.equal(r4.ok ? null : r4.reason, "too-big");
  const noMapBook = workbookFromBlocks("Sheet", [{ kind: "text", text: "hello", strong: false }]);
  const r5 = await readUploadedFile(noMapBook.slice().buffer, "mine.xlsx");
  assert.deepEqual(r5.ok ? null : [r5.reason, r5.message], ["no-map", "This file was not downloaded from this system — download the document again and edit that copy."]);
  const stripped = await partsOf(xlsxBytes());
  stripped.set("xl/workbook.xml", stripped.get("xl/workbook.xml")!.replace(/<sheet name="_dcrs"[^>]*\/>/, ""));
  stripped.delete("xl/worksheets/sheet2.xml");
  const r6 = await readUploadedFile(zipOf(stripped), "stripped.xlsx");
  assert.deepEqual(r6.ok ? null : [r6.reason, r6.message], ["no-map", READ_MESSAGES["map-stripped"]]);
  const other = zipStored([{ name: "ppt/presentation.xml", data: enc.encode("<p/>") }]);
  const r7 = await readUploadedFile(other.slice().buffer, "deck.pptx");
  assert.equal(r7.ok ? null : r7.reason, "not-office");
  const whole = xlsxBytes();
  const r8 = await readUploadedFile(whole.slice(0, Math.floor(whole.length / 2)).buffer, "cut.xlsx");
  assert.equal(r8.ok ? null : r8.reason, "damaged");
  const broken = await partsOf(xlsxBytes());
  broken.set(SHEET, broken.get(SHEET)!.replace("</sheetData>", "<row></sheetData>"));
  const r9 = await readUploadedFile(zipOf(broken), "broken.xlsx");
  assert.equal(r9.ok ? null : r9.reason, "damaged");
});

// ---------------------------------------------------------------------------
// Word

const DOCUMENT = "word/document.xml";

function sdtOf(xml: string, i: number): string {
  const m = new RegExp(`<w:sdt>(?:(?!<w:sdt>)[\\s\\S])*?<w:tag w:val="dcrs:${i}"/>[\\s\\S]*?</w:sdt>`).exec(xml);
  assert.ok(m, `control dcrs:${i} is in the document`);
  return m![0];
}

function setControl(parts: Map<string, string>, i: number, content: string, prExtra = ""): void {
  const xml = parts.get(DOCUMENT)!;
  const sdt = sdtOf(xml, i);
  const next = sdt.replace(/<w:sdtContent>[\s\S]*<\/w:sdtContent>/, `<w:sdtContent>${content}</w:sdtContent>`).replace("</w:sdtPr>", `${prExtra}</w:sdtPr>`);
  parts.set(DOCUMENT, xml.replace(sdt, next));
}

const entryOf = (r: Extract<ReadResult, { ok: true }>, path: string) => r.entries.find((e) => e.path === path)!.i;

test("the Word file carries a content control per bound value, a caption on the grid and the map as a custom XML part", async () => {
  const parts = await partsOf(docxBytes());
  const xml = parts.get(DOCUMENT)!;
  assert.equal((xml.match(/<w:sdt>/g) ?? []).length, ENTRY_COUNT);
  assert.match(xml, /<w:sdt><w:sdtPr><w:alias w:val="Checked by"\/><w:tag w:val="dcrs:1"\/><w:id w:val="\d+"\/><w:lock w:val="sdtLocked"\/><w:text w:multiLine="1"\/><\/w:sdtPr><w:sdtContent>/);
  assert.match(xml, /<w:tblCaption w:val="dcrs:t0"\/><\/w:tblPr>/);
  assert.match(parts.get("word/_rels/document.xml.rels")!, /relationships\/customXml" Target="\.\.\/customXml\/item1\.xml"/);
  assert.match(parts.get("customXml/item1.xml")!, /^<\?xml[^>]*>\n<dcrsMap xmlns="urn:dcrs:roundtrip:1">\{/);
  assert.match(parts.get("customXml/itemProps1.xml")!, /ds:itemID="\{[0-9A-F-]{36}\}"/);
  assert.match(parts.get("[Content_Types].xml")!, /customXmlProperties\+xml/);
  assert.match(parts.get("docProps/custom.xml")!, /dcrs\.envelope/);
  // An empty value is a control with room to click into.
  assert.match(sdtOf(xml, 10), /<w:t xml:space="preserve">    <\/w:t>/);
  // Without an envelope the document is the same as it always was: no controls, no map.
  const plainDoc = await partsOf(wordDocumentFromBlocks(sampleBlocks()));
  assert.ok(!/<w:sdt>/.test(plainDoc.get(DOCUMENT)!) && !plainDoc.has("customXml/item1.xml"));
});

test("a Word file read back untouched — and saved again by Word, deflated — changes nothing", async () => {
  const r = await read(docxBytes(), "upload.docx");
  assert.equal(r.kind, "docx");
  assert.equal(r.entries.length, ENTRY_COUNT);
  const plan = planImport(r, "upload.docx", ctx(sampleData()));
  assert.deepEqual(plan.changes, []);
  assert.deepEqual(plan.rejected, []);
  assert.deepEqual(plan.appends, []);
  assert.equal(plan.unchanged, ENTRY_COUNT);
  const again = await partsOf(docxBytes());
  const r2 = await read(zipOf(again, true), "upload.docx");
  assert.deepEqual(planImport(r2, "upload.docx", ctx(sampleData())).changes, []);
});

test("Word's edits — runs split, proofing marks and bookmarks, tracked changes, a control cleared to its placeholder, a box ticked — are exactly the changes", async () => {
  const r0 = await read(docxBytes(), "upload.docx");
  const parts = await partsOf(docxBytes());
  setControl(
    parts,
    entryOf(r0, "header/checkedBy"),
    `<w:r w:rsidR="00A1B2C3"><w:rPr><w:b/></w:rPr><w:t>Ra</w:t></w:r><w:proofErr w:type="spellStart"/><w:bookmarkStart w:id="0" w:name="_GoBack"/><w:r><w:t xml:space="preserve">jesh </w:t></w:r><w:bookmarkEnd w:id="0"/><w:proofErr w:type="spellEnd"/><w:r><w:t>Kumar</w:t></w:r>`
  );
  setControl(parts, entryOf(r0, "greeting"), `<w:del w:id="1" w:author="QA"><w:r><w:delText>Ravi</w:delText></w:r></w:del><w:ins w:id="2" w:author="QA"><w:r><w:t>Ravindra</w:t></w:r></w:ins>`);
  setControl(parts, entryOf(r0, "header/remarks"), `<w:r><w:rPr><w:rStyle w:val="PlaceholderText"/></w:rPr><w:t>Click or tap here to enter text.</w:t></w:r>`, '<w:placeholder><w:docPart w:val="DefaultPlaceholder_-1854013440"/></w:placeholder><w:showingPlcHdr/>');
  setControl(parts, entryOf(r0, "header/approved"), `<w:r><w:t>☑</w:t></w:r>`);
  setControl(parts, entryOf(r0, "header/temperature"), `<w:r><w:t>1</w:t></w:r><w:r><w:t>4</w:t></w:r>`);
  setControl(parts, entryOf(r0, "rows/@r-1/shift"), `<w:r><w:t>Shift C</w:t></w:r>`);
  setControl(parts, entryOf(r0, "header/date"), `<w:r><w:t>06/10/2026</w:t></w:r>`);
  setControl(parts, entryOf(r0, "rows/@r-2/note"), `<w:r><w:t>thin</w:t></w:r><w:r><w:tab/><w:t>and</w:t></w:r><w:r><w:br/><w:t>streaky</w:t></w:r>`);
  const r = await read(zipOf(parts, true), "upload.docx");
  const plan = planImport(r, "upload.docx", ctx(sampleData()));
  assert.deepEqual(changesBy(plan), {
    "header/checkedBy": "Rajesh Kumar",
    greeting: "Ravindra",
    "header/remarks": "",
    "header/approved": true,
    "header/temperature": 14,
    "rows/@r-1/shift": "C",
    "header/date": "2026-10-06",
    "rows/@r-2/note": "thin and streaky",
  });
  assert.deepEqual(plan.rejected, []);
});

test("a control deleted in Word is missing, not emptied", async () => {
  const r0 = await read(docxBytes(), "upload.docx");
  const parts = await partsOf(docxBytes());
  const xml = parts.get(DOCUMENT)!;
  parts.set(DOCUMENT, xml.replace(sdtOf(xml, entryOf(r0, "header/checkedBy")), ""));
  const r = await read(zipOf(parts), "upload.docx");
  assert.deepEqual(r.missing, [entryOf(r0, "header/checkedBy")]);
  const plan = planImport(r, "upload.docx", ctx(sampleData()));
  assert.deepEqual(plan.changes, []);
  assert.equal(plan.missing, 1);
});

test("rows added to the captioned grid in Word are new lines — a typed row and a copied row alike", async () => {
  const parts = await partsOf(docxBytes());
  const xml = parts.get(DOCUMENT)!;
  const table = /<w:tbl>(?:(?!<w:tbl>)[\s\S])*?<w:tblCaption w:val="dcrs:t0"\/>[\s\S]*?<\/w:tbl>/.exec(xml)![0];
  const rows = table.match(/<w:tr>[\s\S]*?<\/w:tr>/g)!;
  const cell = (t: string) => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
  const typed = `<w:tr w:rsidR="00FF0011">${["3", "16:45", "14.2", "No", "Shift C", "ok"].map(cell).join("")}</w:tr>`;
  const copied = rows[rows.length - 1].replace(/>14:00</, ">15:15<");
  const spanned = `<w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>5</w:t></w:r></w:p></w:tc>${["13.1", "", "", ""].map(cell).join("")}</w:tr>`;
  parts.set(DOCUMENT, xml.replace(table, table.replace(/<\/w:tbl>$/, `${typed}${copied}${spanned}</w:tbl>`)));
  const r = await read(zipOf(parts), "upload.docx");
  const plan = planImport(r, "upload.docx", ctx(sampleData()));
  assert.deepEqual(plan.changes, [], "the copied row's controls are copies: the original line is unchanged");
  assert.equal(plan.appends.length, 3);
  assert.deepEqual({ ...plan.appends[0].item, id: "" }, { id: "", time: "16:45", viscosity: 14.2, ok: "No", shift: "C", note: "ok" });
  assert.deepEqual({ ...plan.appends[1].item, id: "" }, { id: "", time: "15:15", viscosity: 13, ok: "No", shift: "B", note: "thin" });
  assert.deepEqual({ ...plan.appends[2].item, id: "" }, { id: "", time: "", viscosity: 13.1, ok: "", shift: "", note: "" }, "a cell spanning two columns keeps the next cell in its column");
});

test("a grid with no lines yet: its 'No rows yet.' line is not read as a new one, a line added under it is", async () => {
  const blocks: ExportBlock[] = [
    {
      kind: "table",
      headerRows: 1,
      bindTable: GRID,
      rows: [[plain("Sr. No."), plain("Time"), plain("Viscosity"), plain("OK"), plain("Shift"), plain("Note")], [plain("No rows yet."), plain(""), plain(""), plain(""), plain(""), plain("")]],
    },
  ];
  const empty = { ...sampleData(), rows: [] as ReturnType<typeof sampleData>["rows"] };
  // Word
  const parts = await partsOf(documentFileBytes("docx", DOC, blocks, [REC], EXPORTED_AT));
  const xml = parts.get(DOCUMENT)!;
  const cell = (t: string) => `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
  parts.set(DOCUMENT, xml.replace(/<\/w:tbl>/, `<w:tr>${["1", "09:00", "11", "Yes", "A", ""].map(cell).join("")}</w:tr></w:tbl>`));
  const plan = planImport(await read(zipOf(parts), "upload.docx"), "upload.docx", ctx(empty));
  assert.equal(plan.appends.length, 1);
  assert.deepEqual({ ...plan.appends[0].item, id: "" }, { id: "", time: "09:00", viscosity: 11, ok: "Yes", shift: "A", note: "" });
  // Excel
  const book = await partsOf(documentFileBytes("xlsx", DOC, blocks, [REC], EXPORTED_AT));
  setCell(book, "B3", inline("B3", "09:00"));
  setCell(book, "C3", `<c r="C3" s="6"><v>11</v></c>`);
  const plan2 = planImport(await read(zipOf(book)), "upload.xlsx", ctx(empty));
  assert.equal(plan2.appends.length, 1);
  assert.equal(plan2.appends[0].item.time, "09:00");
  const untouched = await read(documentFileBytes("xlsx", DOC, blocks, [REC], EXPORTED_AT));
  assert.equal(untouched.appended.length, 0);
});

test("a document with nothing bound and no record downloads as before, with no map", async () => {
  const blocks: ExportBlock[] = [{ kind: "text", text: "Just words", strong: false }];
  const parts = await partsOf(documentFileBytes("docx", DOC, blocks, []));
  assert.ok(!parts.has("customXml/item1.xml") && !parts.has("docProps/custom.xml"));
  const book = await partsOf(documentFileBytes("xlsx", DOC, blocks, []));
  assert.ok(!book.has("xl/worksheets/sheet2.xml"));
  const r = await readUploadedFile(documentFileBytes("docx", DOC, blocks, []).slice().buffer, "x.docx");
  assert.equal(r.ok ? null : r.reason, "no-map");
});

test("several records in one file (a register): each value goes to its own record", async () => {
  const blocks: ExportBlock[] = [
    { kind: "fields", pairs: [["Visit 1", bound(bind("count", "number", "3", { recordId: "v-1", label: "Visit 1 count" }))]] },
    { kind: "fields", pairs: [["Visit 2", bound(bind("count", "number", "5", { recordId: "v-2", label: "Visit 2 count" }))]] },
  ];
  const parts = await partsOf(documentFileBytes("xlsx", DOC, blocks, ["v-1", "v-2"], EXPORTED_AT));
  setCell(parts, "B3", `<c r="B3" s="3"><v>7</v></c>`);
  const r = await read(zipOf(parts));
  assert.deepEqual(r.envelope.recordIds, ["v-1", "v-2"]);
  const records: Record<string, { count: number }> = { "v-1": { count: 3 }, "v-2": { count: 5 } };
  const plan = planImport(r, "upload.xlsx", { today: "2026-10-05", getRecord: (id) => (records[id] ? { data: records[id], documentId: DOC.id } : null), blankItem: () => null });
  assert.deepEqual(
    plan.changes.map((c) => [c.recordId, c.path, c.value]),
    [["v-2", "count", 7]]
  );
  assert.equal(applyPlanToData(records["v-1"], "v-1", plan).applied, 0);
  assert.deepEqual(applyPlanToData(records["v-2"], "v-2", plan).data, { count: 7 });
});

test("applyPlanToData writes each change at its path and reports a path that no longer leads anywhere", () => {
  const plan: ImportPlan = {
    envelope: makeEnvelope("xlsx", { documentId: DOC.id }, [REC], EXPORTED_AT),
    fileName: "x.xlsx",
    changes: [
      { recordId: REC, path: "rows/@r-2/note", label: "Note", type: "text", before: "thin", after: "thick", value: "thick" },
      { recordId: REC, path: "rows/@r-9/note", label: "Gone line", type: "text", before: "", after: "x", value: "x" },
      { recordId: "other", path: "greeting", label: "Other record", type: "text", before: "", after: "y", value: "y" },
    ],
    appends: [{ recordId: REC, listPath: "rows", item: { id: "row-new", time: "20:00" }, label: "New line 1" }],
    rejected: [],
    unchanged: 0,
    missing: 0,
    records: [{ recordId: REC, documentId: DOC.id, found: true }],
  };
  const before = sampleData();
  const out = applyPlanToData(before, REC, plan);
  const data = out.data as ReturnType<typeof sampleData>;
  assert.equal(out.applied, 2);
  assert.deepEqual(out.failed, ["Gone line"]);
  assert.equal(data.rows[1].note, "thick");
  assert.equal(data.rows.length, 3);
  assert.equal(data.greeting, "Ravi");
  assert.equal(before.rows[1].note, "thin", "the record's own data is never changed in place");
  assert.equal(before.rows.length, 2);
});
