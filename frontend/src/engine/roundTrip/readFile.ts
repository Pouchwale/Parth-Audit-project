// READING AN EDITED WORKBOOK OR WORD FILE BACK (REQUIREMENTS §81).
//
// A file downloaded from a record carries a map (engine/roundTrip/exportMap.ts):
// which value of which record each bound cell or content control holds. This
// reads the file a person uploads — after Excel, LibreOffice or Word has saved
// it again — and returns the value now standing in each bound place, the places
// that are gone, and the lines added to a grid that takes new lines. It never
// throws: a file it cannot read is answered with a reason and plain words.
//
// What a save by Office changes, and how it is read regardless:
//   Excel      strings moved to the shared-strings table (sometimes as rich
//              runs), styles renumbered (dates are recognised by the NEW
//              styles.xml's number formats), numbers with float noise, a date
//              typed in as a serial, TRUE/FALSE, formulas with cached values,
//              rows inserted above a bound cell (the hidden defined name moves
//              with the cell, so it is preferred to the map's A1 reference; a
//              deleted row leaves #REF! and the value is "missing"), the sheet
//              renamed (sheets are found by their relationship, and the map
//              sheet by its first cell, never by a name), veryHidden turned into
//              hidden.
//   Word       text split over many runs, proofing marks and bookmarks between
//              them, tracked changes (deleted text is left out, inserted text
//              read), a cleared control showing its placeholder (empty), rows
//              added to a grid (read as new lines).

import { formatDisplayDate } from "../../utils/date";
import { BUILTIN_DATE_FORMATS, columnIndex, columnName, isoToSerial, serialToIso, unzip } from "../../utils/xlsx";
import {
  ENTRY_NAME_PREFIX,
  ENVELOPE_PROPERTY,
  MAP_SIGNATURE,
  entryName,
  parseEnvelopeProperty,
  parseMapJson,
  parseMapSheetRows,
  rowSignature,
  tableName,
  type MapEntry,
  type MapTable,
  type RoundTripEnvelope,
} from "./exportMap";
import { attr, childElements, decodeXmlBytes, descendants, firstChild, parseXml, textContent, type XmlElement } from "./xml";

/** A value read from the file: its text as the file shows it, and what a spreadsheet cell says it is. */
export interface UploadedValue {
  text: string;
  /** A numeric cell's number (a date or time cell's too). */
  number?: number;
  /** A date cell's Excel serial (1900 date system). */
  serial?: number;
  /** The cell is formatted as a date (or written as one, t="d"). */
  isDate?: boolean;
  /** A TRUE/FALSE cell. */
  bool?: boolean;
}

export interface AppendedRow {
  /** MapTable.t */
  table: number;
  recordId: string;
  listPath: string;
  /** By the column's item key. */
  cells: Record<string, UploadedValue>;
}

export type ReadResult =
  | {
      ok: true;
      kind: "xlsx" | "docx";
      envelope: RoundTripEnvelope;
      entries: MapEntry[];
      tables: MapTable[];
      /** By MapEntry.i. */
      values: Map<number, UploadedValue>;
      /** Entries whose cell/control is gone from the file (rows deleted …). */
      missing: number[];
      appended: AppendedRow[];
      /**
       * xlsx: entries read from another line of their grid than the one their
       * hidden name points at — the grid was sorted in Excel and the line's own
       * words (its Sr. No.) moved with it. A preview marks them for a check.
       */
      relocated?: number[];
      /**
       * xlsx: entries read where their hidden name points although their line no
       * longer shows its own words there (renumbered after a line was deleted or
       * inserted, or typed over). Not moved — a preview marks them for a check.
       */
      unconfirmed?: number[];
    }
  | { ok: false; reason: "not-office" | "legacy-format" | "no-map" | "damaged" | "too-big"; message: string };

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
/**
 * How much the parts of one upload may inflate to, all together. Each part is
 * held to 20 MB (utils/xlsx.ts inflateRaw); a workbook or a Word file made
 * here, however long, is a fraction of this. A crafted zip — many parts, or
 * many entries pointing at one — is refused as damaged, never read on until
 * the tab runs out of memory.
 */
const MAX_PACKAGE_BYTES = 64 * 1024 * 1024;
/** How many lines below a grid are read as new lines at most. */
const MAX_APPENDED_ROWS = 500;
/** Excel's own limits: 1,048,576 rows and 16,384 columns (A…XFD). A cell said to be past them is not read. */
const MAX_SHEET_ROWS = 1_048_576;
const MAX_SHEET_COLUMNS = 16_384;
/** The map sheet's rows hold 13 columns; anything further right is not the map's. */
const MAP_SHEET_COLUMNS = 64;
/** Word's own limit: a table has at most 63 columns. */
const MAX_WORD_COLUMNS = 63;

export const READ_MESSAGES = {
  "too-big": "The file is larger than 15 MB — this cannot be a document downloaded from here. Choose the file you downloaded and edited.",
  "legacy-format":
    "This file is in the old Excel/Word format (.xls or .doc), or it has a password. Open it, save it as an Excel Workbook (.xlsx) or a Word Document (.docx) without a password, and upload that copy.",
  "not-office": "This is not an Excel (.xlsx) or Word (.docx) file. Upload the document you downloaded from here and edited.",
  "no-map": "This file was not downloaded from this system — download the document again and edit that copy.",
  "map-stripped":
    "This file was downloaded from this system, but the hidden part that says where each value belongs was removed when it was saved (Google Sheets and some other programs remove it) — download the document again, edit that copy in Excel or Word, and upload it.",
  damaged: "The file could not be read — it may be damaged. Open it in Excel or Word, save it again, and upload that copy.",
} as const;

type Fail = Extract<ReadResult, { ok: false }>;
const fail = (reason: Fail["reason"], message: string = READ_MESSAGES[reason]): Fail => ({ ok: false, reason, message });

type Zip = Map<string, () => Promise<Uint8Array<ArrayBuffer>>>;

/** Reads an uploaded file. Never throws. */
export async function readUploadedFile(data: Blob | ArrayBuffer, fileName: string): Promise<ReadResult> {
  try {
    const size = data instanceof ArrayBuffer ? data.byteLength : ArrayBuffer.isView(data) ? (data as ArrayBufferView).byteLength : (data as Blob).size;
    if (size > MAX_UPLOAD_BYTES) return fail("too-big");
    const buffer: ArrayBuffer =
      data instanceof ArrayBuffer
        ? data
        : ArrayBuffer.isView(data)
          ? new Uint8Array((data as ArrayBufferView).buffer, (data as ArrayBufferView).byteOffset, (data as ArrayBufferView).byteLength).slice().buffer
          : await (data as Blob).arrayBuffer();
    const head = new Uint8Array(buffer.slice(0, 4));
    const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
    const isOle = head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0;
    if (isOle) return fail("legacy-format");
    if (!isZip) return /\.(xls|doc)$/i.test(fileName.trim()) ? fail("legacy-format") : fail("not-office");
    let zip: Zip;
    try {
      zip = await unzip(buffer);
    } catch {
      return fail("damaged");
    }
    const names = new Map<string, string>();
    for (const name of zip.keys()) names.set(name.replace(/\\/g, "/").replace(/^\//, "").toLowerCase(), name);
    const pkg = new Package(zip, names);
    const result = await readPackage(pkg);
    // Parts that inflate past any real document: whatever was made of the rest, the file is refused.
    return pkg.overflowed ? fail("damaged") : result;
  } catch {
    return fail("damaged");
  }
}

async function readPackage(pkg: Package): Promise<ReadResult> {
  const main = await pkg.mainPart();
  if (main && /(^|\/)workbook\d*\.xml$/i.test(main)) return await readXlsx(pkg, main);
  if (main && /(^|\/)document\d*\.xml$/i.test(main)) return await readDocx(pkg, main);
  if (pkg.has("xl/workbook.xml")) return await readXlsx(pkg, "xl/workbook.xml");
  if (pkg.has("word/document.xml")) return await readDocx(pkg, "word/document.xml");
  return fail("not-office");
}

// ---------------------------------------------------------------------------
// the package

class Package {
  private cache = new Map<string, XmlElement | null>();
  /** Bytes of the parts read so far, inflated. */
  private total = 0;
  /** The parts read inflated past MAX_PACKAGE_BYTES: nothing more is read, and the file is refused. */
  overflowed = false;
  constructor(
    private zip: Zip,
    private names: Map<string, string>
  ) {}

  has(path: string): boolean {
    return this.names.has(path.toLowerCase());
  }

  /** Every part name, as written in the zip. */
  parts(): string[] {
    return Array.from(this.zip.keys());
  }

  async bytes(path: string): Promise<Uint8Array | null> {
    if (this.overflowed) throw new Error("The parts of this file inflate past any document's.");
    const real = this.names.get(path.replace(/^\//, "").toLowerCase());
    const get = real ? this.zip.get(real) : undefined;
    if (!get) return null;
    const data = await get();
    this.total += data.length;
    if (this.total > MAX_PACKAGE_BYTES) {
      this.overflowed = true;
      throw new Error("The parts of this file inflate past any document's.");
    }
    return data;
  }

  /** A part parsed; null when the package has no such part. Throws on a part that is not XML. */
  async xml(path: string): Promise<XmlElement | null> {
    const key = path.replace(/^\//, "").toLowerCase();
    if (this.cache.has(key)) return this.cache.get(key) ?? null;
    const bytes = await this.bytes(key);
    const doc = bytes ? parseXml(decodeXmlBytes(bytes)) : null;
    this.cache.set(key, doc);
    return doc;
  }

  /** The relationships of a part: id → { type, target part path }. */
  async rels(partPath: string): Promise<Map<string, { type: string; target: string; external: boolean }>> {
    const slash = partPath.lastIndexOf("/");
    const dir = slash === -1 ? "" : partPath.slice(0, slash + 1);
    const base = slash === -1 ? partPath : partPath.slice(slash + 1);
    const relsPath = partPath === "" ? "_rels/.rels" : `${dir}_rels/${base}.rels`;
    const out = new Map<string, { type: string; target: string; external: boolean }>();
    let doc: XmlElement | null = null;
    try {
      doc = await this.xml(relsPath);
    } catch {
      doc = null;
    }
    if (!doc) return out;
    for (const r of descendants(doc, "Relationship")) {
      const id = attr(r, "Id") ?? "";
      const target = attr(r, "Target") ?? "";
      const external = (attr(r, "TargetMode") ?? "") === "External";
      out.set(id, { type: attr(r, "Type") ?? "", target: external ? target : resolvePart(dir, target), external });
    }
    return out;
  }

  /** The package's main part (the workbook or the Word document). */
  async mainPart(): Promise<string | null> {
    const rels = await this.rels("");
    for (const r of rels.values()) if (/\/officeDocument$/.test(r.type) && !r.external) return r.target;
    return null;
  }
}

function resolvePart(dir: string, target: string): string {
  const t = target.replace(/\\/g, "/");
  const joined = t.startsWith("/") ? t.slice(1) : dir + t;
  const out: string[] = [];
  for (const seg of joined.split("/")) {
    if (seg === "..") out.pop();
    else if (seg !== "." && seg !== "") out.push(seg);
  }
  return out.join("/");
}

async function customEnvelope(pkg: Package): Promise<{ documentId: string } | null> {
  try {
    const doc = await pkg.xml("docProps/custom.xml");
    if (!doc) return null;
    for (const p of descendants(doc, "property")) {
      if (attr(p, "name") !== ENVELOPE_PROPERTY) continue;
      const found = parseEnvelopeProperty(textContent(p).trim());
      if (found) return found;
    }
  } catch {
    /* no envelope */
  }
  return null;
}

async function noMap(pkg: Package): Promise<Fail> {
  return (await customEnvelope(pkg)) ? fail("no-map", READ_MESSAGES["map-stripped"]) : fail("no-map");
}

// ---------------------------------------------------------------------------
// Excel

type StyleKind = "date" | "time" | "datetime" | null;

/** What a number format shows: a date, a time of day, both, or neither. */
export function numberFormatKind(id: number, code: string | undefined): StyleKind {
  if (code === undefined) {
    if (id === 22) return "datetime";
    if ((id >= 18 && id <= 21) || (id >= 45 && id <= 47)) return "time";
    return BUILTIN_DATE_FORMATS.has(id) ? "date" : null;
  }
  if (/\[(h+|m+|s+)\]/i.test(code)) return "time";
  const bare = code
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/_./g, "")
    .replace(/\*./g, "")
    .replace(/AM\/PM|A\/P/gi, "h")
    .split(";")[0];
  if (/general|@/i.test(bare) && !/[dy]/i.test(bare.replace(/general/gi, ""))) return null;
  const date = /[dy]/i.test(bare);
  const time = /[hs]/i.test(bare);
  if (date && time) return "datetime";
  if (date) return "date";
  if (time) return "time";
  return /m/i.test(bare) ? "date" : null;
}

const numberText = (n: number) => String(Number(n.toPrecision(15)));

const pad2 = (n: number) => String(n).padStart(2, "0");

/** A day fraction as HH:MM (rounded to the minute). */
export function fractionToTime(n: number): string {
  const frac = n - Math.floor(n);
  let minutes = Math.round(frac * 1440);
  if (minutes >= 1440) minutes = 0;
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

/** Excel's escaped characters in strings: _x000D_ is a carriage return, _x005F_ an underscore. */
const unescapeX = (s: string) => (s.indexOf("_x") === -1 ? s : s.replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))));

/** The text of a shared string item or an inline string: plain or rich runs, phonetic guides left out. */
function stringItemText(si: XmlElement): string {
  let s = "";
  for (const c of si.children) {
    if (typeof c === "string") continue;
    if (c.local === "t") s += textContent(c);
    else if (c.local === "r") for (const t of childElements(c, "t")) s += textContent(t);
  }
  return unescapeX(s).replace(/\r\n?/g, "\n");
}

interface Sheet {
  name: string;
  state: string;
  path: string;
}

interface SheetCells {
  /** By 1-based row, then 0-based column. */
  rows: Map<number, Map<number, UploadedValue>>;
}

const REF_RE = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/;

/** An A1 reference — null when it is not one, or names a cell past Excel's last row or column. */
function parseRef(ref: string): { col: number; row: number } | null {
  const m = REF_RE.exec(ref.trim());
  if (!m) return null;
  const at = { col: columnIndex(m[1]), row: Number(m[2]) };
  return at.row >= 1 && at.row <= MAX_SHEET_ROWS && at.col >= 0 && at.col < MAX_SHEET_COLUMNS ? at : null;
}

/** A defined name's formula: "'My Sheet'!$C$12" → { sheet, col, row }; "#REF!" or a range → null. */
export function parseDefinedRef(formula: string): { sheet: string | null; col: number; row: number } | null {
  const f = formula.trim().replace(/^=/, "");
  if (!f || /#REF!/i.test(f)) return null;
  let sheet: string | null = null;
  let rest = f;
  if (f.startsWith("'")) {
    let i = 1;
    let name = "";
    for (; i < f.length; i++) {
      if (f[i] === "'") {
        if (f[i + 1] === "'") {
          name += "'";
          i++;
          continue;
        }
        break;
      }
      name += f[i];
    }
    if (f[i + 1] !== "!") return null;
    sheet = name;
    rest = f.slice(i + 2);
  } else {
    const bang = f.lastIndexOf("!");
    if (bang !== -1) {
      sheet = f.slice(0, bang);
      rest = f.slice(bang + 1);
    }
  }
  // A single cell, or the first cell of a one-cell range ($C$12:$C$12).
  const first = rest.split(":")[0];
  const at = parseRef(first);
  return at ? { sheet, ...at } : null;
}

async function readXlsx(pkg: Package, workbookPath: string): Promise<ReadResult> {
  const workbook = await pkg.xml(workbookPath);
  if (!workbook) return fail("damaged");
  const rels = await pkg.rels(workbookPath);
  const date1904 = descendants(workbook, "workbookPr").some((e) => /^(1|true)$/i.test(attr(e, "date1904") ?? ""));
  const sheets: Sheet[] = [];
  for (const s of descendants(workbook, "sheet")) {
    const rid = attr(s, "id") ?? "";
    const rel = rels.get(rid);
    if (!rel || rel.external) continue;
    sheets.push({ name: attr(s, "name") ?? "", state: attr(s, "state") ?? "visible", path: rel.target });
  }
  if (sheets.length === 0) return fail("damaged");
  const relOf = (suffix: string) => Array.from(rels.values()).find((r) => r.type.endsWith(suffix) && !r.external)?.target;

  // Shared strings and styles, from wherever this save put them.
  const sstPath = relOf("/sharedStrings") ?? (pkg.has("xl/sharedStrings.xml") ? "xl/sharedStrings.xml" : undefined);
  const sst = sstPath ? await pkg.xml(sstPath) : null;
  const shared = sst ? childElements(sst, "si").map(stringItemText) : [];
  const stylesPath = relOf("/styles") ?? (pkg.has("xl/styles.xml") ? "xl/styles.xml" : undefined);
  const styles = stylesPath ? await pkg.xml(stylesPath) : null;
  const custom = new Map<number, string>();
  const styleKinds: StyleKind[] = [];
  if (styles) {
    for (const f of descendants(styles, "numFmt")) custom.set(Number(attr(f, "numFmtId")), attr(f, "formatCode") ?? "");
    const xfs = descendants(styles, "cellXfs")[0];
    if (xfs) {
      for (const xf of childElements(xfs, "xf")) {
        const id = Number(attr(xf, "numFmtId") ?? 0);
        styleKinds.push(numberFormatKind(id, custom.get(id)));
      }
    }
  }

  const cellValue = (c: XmlElement): UploadedValue => {
    const t = attr(c, "t") ?? "n";
    const vEl = firstChild(c, "v");
    const v = vEl ? textContent(vEl) : undefined;
    switch (t) {
      case "s":
        return { text: v === undefined ? "" : (shared[Number(v)] ?? "") };
      case "inlineStr": {
        const is = firstChild(c, "is");
        return { text: is ? stringItemText(is) : unescapeX(v ?? "") };
      }
      case "str":
        return { text: unescapeX(v ?? "").replace(/\r\n?/g, "\n") };
      case "b": {
        const bool = v === "1" || /^true$/i.test(v ?? "");
        return { text: bool ? "TRUE" : "FALSE", bool };
      }
      case "e":
        return { text: v ?? "" };
      case "d": {
        const raw = (v ?? "").trim();
        const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/.exec(raw);
        if (!m) return { text: raw };
        const serial = isoToSerial(m[1]);
        const time = m[2] && (m[2] !== "00" || m[3] !== "00") ? ` ${m[2]}:${m[3]}` : "";
        return { text: formatDisplayDate(m[1]) + time, isDate: true, ...(serial !== null ? { serial, number: serial } : {}) };
      }
      default: {
        if (v === undefined || v.trim() === "") return { text: "" };
        const number = Number(v);
        if (!Number.isFinite(number)) return { text: v };
        const kind = styleKinds[Number(attr(c, "s") ?? 0)] ?? null;
        if (kind === "time" || (kind === "datetime" && number < 1)) return { text: fractionToTime(number), number };
        if (kind === "date" || kind === "datetime") {
          const serial = number + (date1904 ? 1462 : 0);
          const iso = serialToIso(serial);
          if (!iso) return { text: numberText(number), number };
          const frac = serial - Math.floor(serial);
          const time = kind === "datetime" && Math.round(frac * 1440) % 1440 !== 0 ? ` ${fractionToTime(serial)}` : "";
          return { text: formatDisplayDate(iso) + time, number: serial, serial, isDate: true };
        }
        return { text: numberText(number), number };
      }
    }
  };

  const sheetCache = new Map<string, SheetCells | null>();
  const readSheet = async (sheet: Sheet): Promise<SheetCells | null> => {
    if (sheetCache.has(sheet.path)) return sheetCache.get(sheet.path) ?? null;
    const doc = await pkg.xml(sheet.path);
    let out: SheetCells | null = null;
    if (doc) {
      const rows = new Map<number, Map<number, UploadedValue>>();
      const data = descendants(doc, "sheetData")[0];
      let rowNo = 0;
      for (const row of data ? childElements(data, "row") : []) {
        const r = Number(attr(row, "r") ?? NaN);
        rowNo = Number.isInteger(r) && r > 0 ? r : rowNo + 1;
        // A row Excel cannot have (a crafted file) is not read.
        if (rowNo > MAX_SHEET_ROWS) continue;
        const cells = rows.get(rowNo) ?? new Map<number, UploadedValue>();
        let next = 0;
        for (const c of childElements(row, "c")) {
          const ref = attr(c, "r");
          const at = ref ? parseRef(ref) : null;
          // A cell whose reference is past the last column is not read, nor put in another column.
          if (ref && !at && REF_RE.test(ref.trim())) continue;
          const col = at ? at.col : next;
          next = col + 1;
          if (col >= MAX_SHEET_COLUMNS) continue;
          cells.set(col, cellValue(c));
        }
        rows.set(rowNo, cells);
      }
      out = { rows };
    }
    sheetCache.set(sheet.path, out);
    return out;
  };
  // The map sheet's rows in order, as text — only the rows that are there and the
  // columns the map uses (a crafted row numbered a hundred million is one row
  // here, not a hundred million empty ones).
  const mapRowsText = (cells: SheetCells): string[][] =>
    Array.from(cells.rows.keys())
      .sort((a, b) => a - b)
      .map((r) => {
        const line: string[] = [];
        for (const [c, v] of cells.rows.get(r)!) if (c < MAP_SHEET_COLUMNS) line[c] = v.text;
        return Array.from(line, (x) => x ?? "");
      })
      .filter((line) => line.some(Boolean));

  // The map: on the sheet whose first cell says so — a hidden one first.
  let map: ReturnType<typeof parseMapSheetRows> = null;
  let mapSheet: Sheet | null = null;
  const ordered = [...sheets.filter((s) => s.state !== "visible"), ...sheets.filter((s) => s.state === "visible")];
  for (const sheet of ordered) {
    const cells = await readSheet(sheet);
    if (!cells) continue;
    const a1 = cells.rows.get(1)?.get(0)?.text.trim();
    if (a1 !== MAP_SIGNATURE) continue;
    map = parseMapSheetRows(mapRowsText(cells));
    if (map) {
      mapSheet = sheet;
      break;
    }
  }
  if (!map || !mapSheet) return await noMap(pkg);
  const envelope: RoundTripEnvelope = { ...map.envelope, kind: "xlsx" };

  // The hidden names on the bound cells, which Excel keeps on the cell when rows move.
  const defined = new Map<string, string>();
  for (const d of descendants(workbook, "definedName")) {
    const name = (attr(d, "name") ?? "").toLowerCase();
    if (name.startsWith(ENTRY_NAME_PREFIX)) defined.set(name, textContent(d));
  }
  const byName = new Map(sheets.map((s) => [s.name, s]));
  // The sheet the document is on: the one its names point at, else the first that is not the map.
  let mainSheet: Sheet | undefined;
  for (const formula of defined.values()) {
    const at = parseDefinedRef(formula);
    const s = at?.sheet !== null && at?.sheet !== undefined ? byName.get(at.sheet) : undefined;
    if (s && s !== mapSheet) {
      mainSheet = s;
      break;
    }
  }
  mainSheet ??= sheets.find((s) => s !== mapSheet && s.state === "visible") ?? sheets.find((s) => s !== mapSheet);
  if (!mainSheet) return fail("damaged");
  const main = mainSheet;

  /** Where a defined name points now: undefined when there is no such name, null when it points nowhere (#REF!). */
  const whereNamed = (name: string): { sheet: Sheet; col: number; row: number } | null | undefined => {
    const formula = defined.get(name.toLowerCase());
    if (formula === undefined) return undefined;
    const at = parseDefinedRef(formula);
    if (!at) return null;
    const sheet = at.sheet === null ? main : byName.get(at.sheet);
    return sheet ? { sheet, col: at.col, row: at.row } : null;
  };

  const values = new Map<number, UploadedValue>();
  const missing: number[] = [];
  // Entries by the cell they are in now, in map order (a cell may hold several).
  const groups = new Map<string, { sheet: Sheet; col: number; row: number; entries: MapEntry[] }>();
  const occupied = new Map<Sheet, Set<number>>();
  // Where each value is now: by its hidden name, else by the map's reference.
  type Placed = { e: MapEntry; at: { sheet: Sheet; col: number; row: number }; byName: boolean };
  const placed: Placed[] = [];
  for (const e of map.entries) {
    let at = whereNamed(entryName(e.i));
    const byName = at !== undefined;
    if (at === undefined) {
      const ref = e.ref ? parseRef(e.ref) : null;
      at = ref ? { sheet: main, ...ref } : null;
    }
    if (!at) missing.push(e.i);
    else placed.push({ e, at, byName });
  }
  // A grid sorted in Excel: the names stayed where they were while the lines
  // moved, and each line's own fixed words (its Sr. No.) moved with it. Only a
  // PURE reordering is undone — every line of the grid still named (none
  // #REF!), each on a row of its own, and the words now on those rows exactly
  // the lines' own words, each once. Then a value whose line no longer has its
  // words beside it is read from the grid's row that has them, and reported as
  // moved. Anything else cannot be told from a sort by the words alone: a line
  // deleted or inserted and the lines below renumbered, a Sr. No. typed over.
  // There the names are trusted and nothing is moved (a renumbered line keeps
  // its own values; a value is never put on another line's), and the values
  // whose line no longer shows its words are reported as unconfirmed.
  //   A grid whose names a program dropped has only the map's references —
  // where the lines were WRITTEN, which a deleted or inserted row shifts — so
  // there each such line is looked for by its own words among the grid's
  // lines: found on exactly one it is read there (reported as moved), else
  // its values are missing.
  const relocated: number[] = [];
  const unconfirmed: number[] = [];
  const anchoredInMap = new Map<number, number>();
  for (const e of map.entries) if (e.anchor) anchoredInMap.set(e.anchor.grid, (anchoredInMap.get(e.anchor.grid) ?? 0) + 1);
  const byGrid = new Map<number, { p: Placed; anchor: NonNullable<MapEntry["anchor"]>; own: string }[]>();
  for (const p of placed) {
    const anchor = p.e.anchor;
    if (!anchor) continue;
    const list = byGrid.get(anchor.grid) ?? [];
    list.push({ p, anchor, own: rowSignature([anchor.text]) });
    byGrid.set(anchor.grid, list);
  }
  const shownAt = async (sheet: Sheet, row: number, col: number) => rowSignature([(await readSheet(sheet))?.rows.get(row)?.get(col)?.text ?? ""]);
  for (const [grid, items] of byGrid) {
    const off: typeof items = [];
    for (const item of items) if ((await shownAt(item.p.at.sheet, item.p.at.row, item.anchor.col)) !== item.own) off.push(item);
    if (off.length === 0) continue;
    if (!items.every((item) => item.p.byName)) {
      const gridRows = Array.from(new Set(items.map((item) => item.p.at.row)));
      // By sheet and column: the words each of the grid's rows shows there → those rows.
      const index = new Map<string, Map<string, number[]>>();
      for (const { p, anchor, own } of off) {
        const key = `${p.at.sheet.path}!${anchor.col}`;
        let words = index.get(key);
        if (!words) {
          words = new Map<string, number[]>();
          for (const r of gridRows) {
            const shown = await shownAt(p.at.sheet, r, anchor.col);
            const list = words.get(shown);
            if (list) list.push(r);
            else words.set(shown, [r]);
          }
          index.set(key, words);
        }
        const rows = words.get(own) ?? [];
        p.at = { ...p.at, row: rows.length === 1 ? rows[0] : -1 };
        if (rows.length === 1) relocated.push(p.e.i);
      }
      continue;
    }
    // Each line, by its own words: the one place its names point at now.
    const lines = new Map<string, { sheet: Sheet; row: number; col: number }>();
    let pure = items.length === anchoredInMap.get(grid);
    for (const { p, anchor, own } of items) {
      const line = lines.get(own);
      if (!line) lines.set(own, { sheet: p.at.sheet, row: p.at.row, col: anchor.col });
      else if (line.sheet !== p.at.sheet || line.row !== p.at.row || line.col !== anchor.col) pure = false;
    }
    // The row each line's words stand on now: among the lines' own rows, each row showing one line's words.
    const rowOf = new Map<string, number>();
    const rowsSeen = new Set<number>();
    const sheet = items[0].p.at.sheet;
    for (const line of pure ? lines.values() : []) {
      const shown = await shownAt(line.sheet, line.row, line.col);
      if (line.sheet !== sheet || rowsSeen.has(line.row) || !lines.has(shown) || rowOf.has(shown)) {
        pure = false;
        break;
      }
      rowsSeen.add(line.row);
      rowOf.set(shown, line.row);
    }
    for (const { p, own } of off) {
      const row = pure ? rowOf.get(own) : undefined;
      if (row !== undefined) {
        p.at = { ...p.at, row };
        relocated.push(p.e.i);
      } else unconfirmed.push(p.e.i);
    }
  }
  for (const { e, at } of placed) {
    if (at.row < 1) {
      missing.push(e.i);
      continue;
    }
    const key = `${at.sheet.path}!${at.row}:${at.col}`;
    const group = groups.get(key) ?? { ...at, entries: [] };
    group.entries.push(e);
    groups.set(key, group);
    const rows = occupied.get(at.sheet) ?? new Set<number>();
    rows.add(at.row);
    occupied.set(at.sheet, rows);
  }
  for (const g of groups.values()) {
    const cells = await readSheet(g.sheet);
    const cell = cells?.rows.get(g.row)?.get(g.col) ?? { text: "" };
    const plain = g.entries.length === 1 && !g.entries[0].pre && !g.entries[0].post;
    if (plain) {
      values.set(g.entries[0].i, cell);
      continue;
    }
    const cut = cutSegments(cell.text, g.entries);
    g.entries.forEach((e, k) => {
      const text = cut[k];
      if (text !== null) values.set(e.i, { text });
      else if (g.entries.length === 1) values.set(e.i, { text: cell.text.trim() });
      else missing.push(e.i);
    });
  }

  // Lines added to a grid that takes new lines.
  const appended: AppendedRow[] = [];
  const mainCells = await readSheet(main);
  if (mainCells) {
    // A row's texts left to right, the empty cells left out (a line's signature leaves them out too).
    const rowTexts = (r: number): string[] => {
      const row = mainCells.rows.get(r);
      if (!row) return [];
      return Array.from(row)
        .sort((a, b) => a[0] - b[0])
        .map(([, v]) => v.text);
    };
    const isEmpty = (r: number) => rowTexts(r).every((t) => !t.trim());
    // The last row the sheet holds: past it every row is empty, so no grid is read further.
    let lastSheetRow = 0;
    for (const r of mainCells.rows.keys()) if (r > lastSheetRow) lastSheetRow = r;
    const taken = occupied.get(main) ?? new Set<number>();
    const namedRow = (name: string, stored: number | undefined): number | undefined => {
      const at = whereNamed(name);
      if (at === undefined) return stored;
      return at && at.sheet === main ? at.row : undefined;
    };
    for (const table of map.tables) {
      if (table.columns.length === 0) continue;
      const headerRow = namedRow(tableName(table.t, "h"), table.headerRow);
      let lastRow = namedRow(tableName(table.t, "z"), table.lastRow);
      const nextRow = namedRow(tableName(table.t, "n"), table.nextRow);
      const firstRow = headerRow !== undefined ? headerRow + 1 : table.firstRow;
      if (firstRow === undefined) continue;
      if (lastRow === undefined) {
        // The grid's last line was deleted: its last bound line still standing ends it.
        const mine = map.entries.filter((e) => e.recordId === table.recordId && e.path.startsWith(`${table.listPath}/`));
        let best = firstRow - 1;
        for (const e of mine) {
          const at = whereNamed(entryName(e.i));
          if (at && at.sheet === main) best = Math.max(best, at.row);
        }
        lastRow = best;
      }
      const fixed = new Set(table.fixedRows ?? []);
      // Rows past the sheet's last are empty: within the grid they are skipped, after it they end it.
      const limit = Math.min(lastRow + MAX_APPENDED_ROWS, lastSheetRow);
      for (let r = Math.max(1, firstRow); r <= limit; r++) {
        if (nextRow !== undefined && r >= nextRow) break;
        const after = r > lastRow;
        if (after && isEmpty(r)) break;
        if (taken.has(r)) {
          if (after) break;
          continue;
        }
        const texts = rowTexts(r);
        if (!after && texts.every((t) => !t.trim())) continue;
        if (fixed.has(rowSignature(texts))) continue;
        const cells: Record<string, UploadedValue> = {};
        let any = false;
        for (const col of table.columns) {
          const v = mainCells.rows.get(r)?.get(col.col) ?? { text: "" };
          cells[col.key] = v;
          if (v.text.trim()) any = true;
        }
        if (any) appended.push({ table: table.t, recordId: table.recordId, listPath: table.listPath, cells });
      }
    }
  }

  return { ok: true, kind: "xlsx", envelope, entries: map.entries, tables: map.tables, values, missing, appended, relocated, unconfirmed };
}

type Piece = Pick<MapEntry, "pre" | "post"> & { text?: string };

/**
 * The values cut out of a cell holding fixed words around them: statics are
 * entries[0].pre, then each entry's post (and each entry's text, as the
 * download wrote it). null for a value that cannot be told apart any more (the
 * words around it were changed, or two values touch).
 */
export function cutSegments(cellText: string, entries: readonly Piece[]): (string | null)[] {
  // The cell as it was written: every value is what was written, however it would be cut.
  if (entries.length > 0 && entries.every((e) => typeof e.text === "string")) {
    const shown = (s: string) => cellLines(s).filter(Boolean).join("\n");
    if (shown(writtenWith(entries, (e) => e.text!)) === shown(cellText)) return entries.map((e) => e.text!);
  }
  // Two values with only a line break between them (the GAP report's premises
  // name and address, one box on the page): each is the line it is on.
  if (entries.some((e, k) => k < entries.length - 1 && isLineBreak(e.post))) return cutByLines(cellText, entries) ?? entries.map(() => null);
  return cutLine(cellText.replace(/\r\n?/g, "\n").trim(), entries);
}

const isLineBreak = (words: string | undefined) => !!words && !words.trim() && words.includes("\n");

/** A cell's text as the lines a person reads: line ends unified, spaces collapsed, blank lines at either end left out (those between kept). */
function cellLines(text: string): string[] {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim());
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines;
}

/** The cell's text with each value given by `value`, the fixed words around them as written. */
const writtenWith = (entries: readonly Piece[], value: (e: Piece) => string) => (entries[0]?.pre ?? "") + entries.map((e) => value(e) + (e.post ?? "")).join("");

// Stands for a value while a cell's lines are laid against the lines it was
// written with (the cell's own lines are only compared, never split by it).
const SLOT = "\u0000";

/**
 * Values told apart by the line each is on, when each was written as one line:
 * the cell's lines are laid against the lines it was written with, one for one,
 * and each value cut out of its own line. A value written empty was a line the
 * download left out, so the cell is also tried without those lines (the value
 * still empty). null when the lines no longer match one for one (a line break
 * typed into a value, two lines joined, the heading's words changed).
 */
function cutByLines(cellText: string, entries: readonly Piece[]): (string | null)[] | null {
  if (!entries.every((e) => typeof e.text === "string" && !e.text.includes("\n"))) return null;
  const actual = cellLines(cellText);
  const empty = (k: number) => !entries[k].text!.trim();
  const written = cellLines(writtenWith(entries, () => SLOT));
  for (const leaveOutEmpty of [false, true]) {
    if (leaveOutEmpty && !entries.some((_, k) => empty(k))) break;
    const out: (string | null)[] = entries.map(() => null);
    const lines: { text: string; slots: number[] }[] = [];
    let next = 0;
    for (const text of written) {
      const slots: number[] = [];
      for (let at = text.indexOf(SLOT); at !== -1; at = text.indexOf(SLOT, at + 1)) slots.push(next++);
      // A line that was only an empty value: the download did not write it.
      if (leaveOutEmpty && text === SLOT && empty(slots[0])) out[slots[0]] = "";
      else lines.push({ text, slots });
    }
    if (lines.length !== actual.length) continue;
    for (let i = 0; i < lines.length; i++) {
      const { text, slots } = lines[i];
      if (slots.length === 0) {
        if (text !== actual[i]) return null;
        continue;
      }
      const words = text.split(SLOT);
      const cut = cutLine(
        actual[i],
        slots.map((_, j) => ({ pre: j === 0 ? words[0] : undefined, post: words[j + 1] }))
      );
      slots.forEach((k, j) => (out[k] = cut[j]));
    }
    return out;
  }
  return null;
}

/** Values cut out of one run of text by the fixed words between them. */
function cutLine(text: string, entries: readonly Pick<MapEntry, "pre" | "post">[]): (string | null)[] {
  const out: (string | null)[] = [];
  let rest = text;
  const first = (entries[0]?.pre ?? "").trim();
  if (first) {
    if (!rest.startsWith(first)) return entries.map(() => null);
    rest = rest.slice(first.length);
  }
  for (let k = 0; k < entries.length; k++) {
    const after = (entries[k].post ?? "").trim();
    const last = k === entries.length - 1;
    if (last) {
      const tail = rest.trimEnd();
      if (!after) out.push(tail.trim());
      else out.push(tail.endsWith(after) ? tail.slice(0, tail.length - after.length).trim() : null);
      break;
    }
    if (!after) {
      while (out.length < entries.length) out.push(null);
      break;
    }
    const at = rest.indexOf(after);
    if (at === -1) {
      while (out.length < entries.length) out.push(null);
      break;
    }
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at + after.length);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Word

const TAG_RE = /^dcrs:(\d+)$/;
const CAPTION_RE = /^dcrs:t(\d+)$/;

// Symbols a person may pick from Insert ▸ Symbol for a tick or a box.
const SYMBOLS: Record<string, Record<string, string>> = {
  wingdings: { fc: "✓", fb: "✗", fe: "☑", fd: "☒", a8: "☐", "6f": "☐", "78": "☒" },
  "wingdings 2": { "50": "✓", "51": "✗", "52": "☑", "54": "☒", a3: "☐", "4f": "✗", "53": "☒" },
};

function symbolChar(el: XmlElement): string {
  const font = (attr(el, "font") ?? "").toLowerCase();
  const raw = (attr(el, "char") ?? "").toLowerCase();
  const code = raw.length === 4 && raw.startsWith("f0") ? raw.slice(2) : raw;
  const known = SYMBOLS[font]?.[code];
  if (known) return known;
  const n = parseInt(raw, 16);
  return Number.isFinite(n) && n >= 0x20 && (n < 0xf000 || n > 0xf0ff) ? String.fromCodePoint(n) : "";
}

const SKIP_WORD = new Set(["pPr", "rPr", "sdtPr", "sdtEndPr", "del", "delText", "delInstrText", "instrText", "moveFrom", "drawing", "pict", "object", "tblPr", "trPr", "tcPr", "tblGrid", "footnoteReference", "endnoteReference", "commentReference", "fldChar"]);

/** The text of a piece of a Word document as a person reads it: runs joined, tabs and breaks kept, paragraphs on their own lines, deleted text left out. */
export function wordText(el: XmlElement): string {
  const paras: string[] = [];
  let cur = "";
  let sawPara = false;
  const walk = (x: XmlElement) => {
    for (const c of x.children) {
      if (typeof c === "string") continue;
      const local = c.local;
      if (SKIP_WORD.has(local)) continue;
      if (local === "t") cur += textContent(c);
      else if (local === "tab" || local === "ptab") cur += "\t";
      else if (local === "br" || local === "cr") cur += "\n";
      else if (local === "noBreakHyphen") cur += "-";
      else if (local === "softHyphen") continue;
      else if (local === "sym") cur += symbolChar(c);
      else if (local === "AlternateContent") {
        const choice = firstChild(c, "Choice") ?? firstChild(c, "Fallback");
        if (choice) walk(choice);
      } else if (local === "p") {
        if (sawPara || cur) paras.push(cur);
        cur = "";
        walk(c);
        paras.push(cur);
        cur = "";
        sawPara = true;
      } else walk(c);
    }
  };
  walk(el);
  if (!sawPara || cur) paras.push(cur);
  return paras.join("\n");
}

function sdtTag(sdt: XmlElement): number | null {
  const pr = firstChild(sdt, "sdtPr");
  const tag = pr ? firstChild(pr, "tag") : null;
  const m = tag ? TAG_RE.exec((attr(tag, "val") ?? "").trim()) : null;
  return m ? Number(m[1]) : null;
}

function sdtValue(sdt: XmlElement): string {
  const pr = firstChild(sdt, "sdtPr");
  if (pr && firstChild(pr, "showingPlcHdr")) {
    const flag = attr(firstChild(pr, "showingPlcHdr")!, "val");
    if (flag === null || !/^(0|false|off)$/i.test(flag)) return "";
  }
  const content = firstChild(sdt, "sdtContent");
  return content ? wordText(content) : "";
}

/** A table's rows and a row's cells, looking through row- and cell-level controls and custom XML wrappers. */
function unwrap(el: XmlElement, local: "tr" | "tc"): XmlElement[] {
  const out: XmlElement[] = [];
  for (const c of childElements(el)) {
    if (c.local === local) out.push(c);
    else if (c.local === "sdt") {
      const content = firstChild(c, "sdtContent");
      if (content) out.push(...unwrap(content, local));
    } else if (c.local === "customXml" || c.local === "smartTag") out.push(...unwrap(c, local));
  }
  return out;
}

async function readDocx(pkg: Package, documentPath: string): Promise<ReadResult> {
  // The map: a custom XML part related from the document (or any customXml item in the package).
  const rels = await pkg.rels(documentPath);
  const candidates = [
    ...Array.from(rels.values())
      .filter((r) => /\/customXml$/.test(r.type) && !r.external)
      .map((r) => r.target),
    ...pkg.parts().filter((p) => /^customXml\/item\d+\.xml$/i.test(p)),
  ];
  let map: ReturnType<typeof parseMapJson> = null;
  for (const path of Array.from(new Set(candidates))) {
    try {
      const doc = await pkg.xml(path);
      if (!doc) continue;
      map = parseMapJson(textContent(doc).trim());
      if (map) break;
    } catch {
      /* another item */
    }
  }
  if (!map) return await noMap(pkg);
  const envelope: RoundTripEnvelope = { ...map.envelope, kind: "docx" };
  const doc = await pkg.xml(documentPath);
  if (!doc) return fail("damaged");

  // The first control carrying each tag holds its value; a later one is a copy (a row copied and pasted).
  const first = new Map<number, XmlElement>();
  for (const sdt of descendants(doc, "sdt")) {
    const i = sdtTag(sdt);
    if (i !== null && !first.has(i)) first.set(i, sdt);
  }
  const values = new Map<number, UploadedValue>();
  const missing: number[] = [];
  for (const e of map.entries) {
    const sdt = first.get(e.i);
    if (!sdt) missing.push(e.i);
    else values.set(e.i, { text: sdtValue(sdt) });
  }

  // Rows added to a captioned grid.
  const appended: AppendedRow[] = [];
  const tables = new Map(map.tables.map((t) => [t.t, t]));
  for (const tbl of descendants(doc, "tbl")) {
    const pr = firstChild(tbl, "tblPr");
    const caption = pr ? firstChild(pr, "tblCaption") : null;
    const m = caption ? CAPTION_RE.exec((attr(caption, "val") ?? "").trim()) : null;
    const table = m ? tables.get(Number(m[1])) : undefined;
    if (!table || table.columns.length === 0) continue;
    const fixed = new Set(table.fixedRows ?? []);
    // The table's own columns (Word's grid), never more than Word allows: a cell a
    // crafted row pushes past them is not read (nor a row of millions built for it).
    const tblGrid = firstChild(tbl, "tblGrid");
    const lastCol = Math.max(MAX_WORD_COLUMNS, tblGrid ? childElements(tblGrid, "gridCol").length : 0) - 1;
    unwrap(tbl, "tr").forEach((tr, index) => {
      const trPr = firstChild(tr, "trPr");
      if ((trPr && firstChild(trPr, "tblHeader")) || index < (table.headerRows ?? 0)) return;
      const own = descendants(tr, "sdt").some((sdt) => {
        const i = sdtTag(sdt);
        return i !== null && first.get(i) === sdt;
      });
      if (own) return;
      const texts: string[] = [];
      const gridBefore = trPr ? firstChild(trPr, "gridBefore") : null;
      let col = gridBefore ? Math.max(0, Math.floor(Number(attr(gridBefore, "val") ?? 0)) || 0) : 0;
      for (const tc of unwrap(tr, "tc")) {
        if (col > lastCol) break;
        const tcPr = firstChild(tc, "tcPr");
        const gridSpan = tcPr ? firstChild(tcPr, "gridSpan") : null;
        const span = gridSpan ? Math.floor(Number(attr(gridSpan, "val") ?? 1)) || 1 : 1;
        texts[col] = wordText(tc);
        col += Math.max(1, span);
      }
      const row = Array.from(texts, (t) => t ?? "");
      if (row.every((t) => !t.trim())) return;
      if (fixed.has(rowSignature(row))) return;
      const cells: Record<string, UploadedValue> = {};
      let any = false;
      for (const c of table.columns) {
        const text = row[c.col] ?? "";
        cells[c.key] = { text };
        if (text.trim()) any = true;
      }
      if (any) appended.push({ table: table.t, recordId: table.recordId, listPath: table.listPath, cells });
    });
  }

  return { ok: true, kind: "docx", envelope, entries: map.entries, tables: map.tables, values, missing, appended };
}

// For tests and tools: the A1 name of a 0-based column.
export { columnName };
