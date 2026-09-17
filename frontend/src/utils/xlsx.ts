// A REAL EXCEL WORKBOOK, WITHOUT A LIBRARY (REQUIREMENTS §53).
//
// Writing: an .xlsx is a zip of a handful of XML parts. Every entry is STORED
// (not compressed), so no compressor is needed — only a CRC-32. The sheet has a
// bold header row, frozen, with a filter; date columns hold real Excel dates
// (serial numbers shown dd-mmm-yyyy, which reads the same on any regional
// setting) and text columns are text-formatted, so a GP3 No. of 0101 keeps its
// zero. Opens in Excel without a repair prompt.
//
// Reading: the zip is walked through its central directory (so files written
// with data descriptors read too), deflated entries are inflated by the
// browser's own DecompressionStream, and the first worksheet is read cell by
// cell from each cell's reference — Excel leaves empty cells out altogether —
// with shared strings, inline strings and dates (by the cell's number format,
// either date system) all handled.

const encoder = new TextEncoder();

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A zip with every entry stored uncompressed — enough for an .xlsx or a .docx. */
export function zipStored(files: { name: string; data: Uint8Array }[], when = new Date()): Uint8Array<ArrayBuffer> {
  const dosTime = (when.getHours() << 11) | (when.getMinutes() << 5) | Math.floor(when.getSeconds() / 2);
  const dosDate = ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = encoder.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;
    const local = new Uint8Array(30 + name.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(8, 0, true);
    l.setUint16(10, dosTime, true);
    l.setUint16(12, dosDate, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, size, true);
    l.setUint32(22, size, true);
    l.setUint16(26, name.length, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, dosTime, true);
    c.setUint16(14, dosDate, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, size, true);
    c.setUint32(24, size, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local, f.data);
    centrals.push(central);
    offset += local.length + size;
  }
  const directorySize = centrals.reduce((n, x) => n + x.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, directorySize, true);
  e.setUint32(16, offset, true);
  const out = new Uint8Array(offset + directorySize + 22);
  let p = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

// XML 1.0 forbids most control characters even when escaped — Excel calls a
// file carrying one corrupt — so they are dropped from cell text.
export const xmlText = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const columnName = (index: number) => {
  let s = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

const columnIndex = (ref: string): number => {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? "";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

// Excel counts days from 30-Dec-1899, in UTC arithmetic (local-time arithmetic
// picks up historical time-zone offsets around 1900 and slips a day). Serials
// below 61 fall before Excel's fictitious 29-Feb-1900 and are not used.
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

export function isoToSerial(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const serial = Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - EXCEL_EPOCH) / 86400000);
  return serial >= 61 ? serial : null;
}

export function serialToIso(serial: number, date1904 = false): string | null {
  if (!Number.isFinite(serial)) return null;
  const whole = Math.floor(serial + 1e-7) + (date1904 ? 1462 : 0);
  if (whole < 61 || whole > 2958465) return null;
  const d = new Date(EXCEL_EPOCH + whole * 86400000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

export interface SheetColumn {
  header: string;
  kind: "text" | "date";
  /** Excel's column width, in characters. */
  width: number;
}

/** A one-sheet workbook: `rows` hold text, and ISO dates in the date columns. */
export function buildXlsx(sheetName: string, columns: SheetColumn[], rows: string[][]): Uint8Array<ArrayBuffer> {
  const S_HEADER = 1;
  const S_DATE = 2;
  const S_TEXT = 3;
  const lastColumn = columnName(columns.length - 1);
  const lastRow = rows.length + 1;
  const cell = (ref: string, value: string, kind: "text" | "date" | "header"): string => {
    if (kind === "date") {
      const serial = isoToSerial(value);
      if (serial !== null) return `<c r="${ref}" s="${S_DATE}"><v>${serial}</v></c>`;
      if (!value) return `<c r="${ref}" s="${S_DATE}"/>`;
    }
    if (!value) return kind === "header" ? "" : `<c r="${ref}" s="${S_TEXT}"/>`;
    const space = /^\s|\s$/.test(value) ? ' xml:space="preserve"' : "";
    return `<c r="${ref}" s="${kind === "header" ? S_HEADER : S_TEXT}" t="inlineStr"><is><t${space}>${xmlText(value)}</t></is></c>`;
  };
  const headerRow = `<row r="1">${columns.map((c, i) => cell(`${columnName(i)}1`, c.header, "header")).join("")}</row>`;
  const body = rows.map((r, ri) => `<row r="${ri + 2}">${columns.map((c, ci) => cell(`${columnName(ci)}${ri + 2}`, r[ci] ?? "", c.kind)).join("")}</row>`).join("");
  const safeSheetName = sheetName.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
  const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const PACKAGE_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
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
    [
      "xl/workbook.xml",
      `<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="${xmlText(safeSheetName).replace(/"/g, "&quot;")}" sheetId="1" r:id="rId1"/></sheets>` +
        `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xmlText(safeSheetName).replace(/'/g, "''")}'!$A$1:$${lastColumn}$${lastRow}</definedName></definedNames></workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `<Relationships xmlns="${PACKAGE_REL}"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
    ],
    [
      "xl/styles.xml",
      `<styleSheet xmlns="${MAIN}">` +
        `<numFmts count="1"><numFmt numFmtId="164" formatCode="[$-409]dd\\-mmm\\-yyyy"/></numFmts>` +
        `<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>` +
        `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
        `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="4">` +
        `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
        `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
        `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
        `<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
        `</cellXfs>` +
        `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
        `</styleSheet>`,
    ],
    [
      "xl/worksheets/sheet1.xml",
      `<worksheet xmlns="${MAIN}" xmlns:r="${REL}">` +
        `<dimension ref="A1:${lastColumn}${lastRow}"/>` +
        `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
        `<sheetFormatPr defaultRowHeight="15"/>` +
        `<cols>${columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" style="${c.kind === "date" ? S_DATE : S_TEXT}" customWidth="1"/>`).join("")}</cols>` +
        `<sheetData>${headerRow}${body}</sheetData>` +
        `<autoFilter ref="A1:${lastColumn}${lastRow}"/>` +
        `<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>` +
        `</worksheet>`,
    ],
  ];
  return zipStored(parts.map(([name, xml]) => ({ name, data: encoder.encode(declaration + xml) })));
}

// ---------------------------------------------------------------------------
// reading

export class SpreadsheetReadError extends Error {}

const MAX_INFLATED_BYTES = 20 * 1024 * 1024;

async function inflateRaw(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof DecompressionStream === "undefined") throw new SpreadsheetReadError("This browser cannot open compressed Excel files — save the sheet as CSV UTF-8 and upload that instead.");
  const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_INFLATED_BYTES) {
      await reader.cancel();
      throw new SpreadsheetReadError("The workbook is too large to read.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let p = 0;
  for (const chunk of chunks) {
    out.set(chunk, p);
    p += chunk.length;
  }
  return out;
}

async function unzip(buffer: ArrayBuffer): Promise<Map<string, () => Promise<Uint8Array<ArrayBuffer>>>> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let end = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new SpreadsheetReadError("The file is not an Excel workbook.");
  const entries = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const out = new Map<string, () => Promise<Uint8Array<ArrayBuffer>>>();
  const decoder = new TextDecoder();
  for (let n = 0; n < entries; n++) {
    if (p + 46 > buffer.byteLength || view.getUint32(p, true) !== 0x02014b50) throw new SpreadsheetReadError("The workbook is damaged.");
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    out.set(name, async () => {
      if (view.getUint32(localOffset, true) !== 0x04034b50) throw new SpreadsheetReadError("The workbook is damaged.");
      const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
      const data = bytes.slice(start, start + compressedSize);
      if (method === 0) return data;
      if (method === 8) return inflateRaw(data);
      throw new SpreadsheetReadError("The workbook uses a compression this app cannot read — save it again from Excel as .xlsx.");
    });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
const isDateFormatCode = (code: string) => /[dmy]/i.test(code.replace(/"[^"]*"/g, "").replace(/\\./g, "").replace(/\[[^\]]*\]/g, ""));

const elements = (el: Element | Document, local: string) => Array.from(el.getElementsByTagNameNS("*", local));
const textOf = (el: Element) =>
  elements(el, "t")
    .filter((t) => t.parentElement?.localName !== "rPh")
    .map((t) => t.textContent ?? "")
    .join("");

/** The first worksheet as a grid of text: date cells as YYYY-MM-DD, empty cells as "". */
export async function readFirstSheet(buffer: ArrayBuffer): Promise<{ sheetName: string; rows: string[][] }> {
  const zip = await unzip(buffer);
  const parse = async (name: string): Promise<Document | null> => {
    const get = zip.get(name);
    if (!get) return null;
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(await get()), "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new SpreadsheetReadError("The workbook is damaged.");
    return doc;
  };
  const workbook = await parse("xl/workbook.xml");
  if (!workbook) throw new SpreadsheetReadError("The file is not an Excel workbook.");
  const date1904 = elements(workbook, "workbookPr").some((e) => /^(1|true)$/i.test(e.getAttribute("date1904") ?? ""));
  const sheet = elements(workbook, "sheet")[0];
  if (!sheet) throw new SpreadsheetReadError("The workbook has no sheet.");
  const relationId = sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || sheet.getAttribute("r:id");
  const relations = await parse("xl/_rels/workbook.xml.rels");
  const relation = relations ? elements(relations, "Relationship").find((r) => r.getAttribute("Id") === relationId) : undefined;
  let target = relation?.getAttribute("Target") ?? "worksheets/sheet1.xml";
  target = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  const sharedStrings = await parse("xl/sharedStrings.xml");
  const shared = sharedStrings ? elements(sharedStrings, "si").map(textOf) : [];
  const styles = await parse("xl/styles.xml");
  const customFormats = new Map<number, string>();
  if (styles) for (const f of elements(styles, "numFmt")) customFormats.set(Number(f.getAttribute("numFmtId")), f.getAttribute("formatCode") ?? "");
  const cellFormats = styles ? elements(styles, "cellXfs")[0] : undefined;
  const dateStyled = cellFormats
    ? Array.from(cellFormats.children).map((xf) => {
        const id = Number(xf.getAttribute("numFmtId") ?? 0);
        return BUILTIN_DATE_FORMATS.has(id) || (customFormats.has(id) && isDateFormatCode(customFormats.get(id) ?? ""));
      })
    : [];
  const worksheet = await parse(target);
  if (!worksheet) throw new SpreadsheetReadError("The workbook's first sheet could not be found.");
  const grid: string[][] = [];
  for (const row of elements(worksheet, "row")) {
    const rowNumber = Number(row.getAttribute("r") ?? grid.length + 1) - 1;
    const cells: string[] = [];
    let next = 0;
    for (const c of Array.from(row.children).filter((e) => e.localName === "c")) {
      const ref = c.getAttribute("r");
      const col = ref ? columnIndex(ref) : next;
      next = col + 1;
      const type = c.getAttribute("t") ?? "n";
      const raw = elements(c, "v")[0]?.textContent ?? "";
      let value = raw;
      if (type === "s") value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr") value = elements(c, "is")[0] ? textOf(elements(c, "is")[0]) : "";
      else if (type === "e") value = "";
      else if (type === "b") value = raw === "1" ? "TRUE" : "FALSE";
      else if (type === "n" && raw !== "" && dateStyled[Number(c.getAttribute("s") ?? 0)]) value = serialToIso(Number(raw), date1904) ?? raw;
      cells[col] = value.trim();
    }
    grid[rowNumber >= 0 ? rowNumber : grid.length] = Array.from(cells, (v) => v ?? "");
  }
  return { sheetName: sheet.getAttribute("name") ?? "", rows: Array.from(grid, (r) => r ?? []) };
}

/** What kind of file the bytes are. Old .xls files and password-protected workbooks share one signature. */
export function sniffSpreadsheet(buffer: ArrayBuffer): "xlsx" | "xls" | "text" {
  const b = new Uint8Array(buffer.slice(0, 4));
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return "xlsx";
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return "xls";
  return "text";
}
