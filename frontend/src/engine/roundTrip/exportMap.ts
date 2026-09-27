// THE MAP A DOWNLOADED FILE CARRIES, SO AN EDITED COPY CAN BE READ BACK
// (REQUIREMENTS §81).
//
// A download (utils/documentExport.ts) writes each value the record view shows
// with its BINDING (engine/roundTrip/bindPath.ts): which record, which path in
// its data, what kind of value, the choices of a select, a label a person
// reads — and the text as it was written into the file. That list is the MAP:
//
//   in Excel   a very hidden sheet "_dcrs" (the envelope as key/value rows, one
//              row per entry, one row per column of an appendable grid) and a
//              hidden defined name "_dcrs_<i>" on each bound cell, which Excel
//              moves when rows are inserted or deleted above it
//   in Word    a content control per bound value, tagged "dcrs:<i>", and the
//              map as a custom XML part (JSON), with each appendable table
//              captioned "dcrs:t<t>"
//   in both    docProps/custom.xml holding a small envelope — which document,
//              which record, when — so a file whose map was stripped (Google
//              Sheets does) can at least be recognised.
//
// Upload compares every value read back with the text the map says was
// written; only a value that was CHANGED is applied (engine/roundTrip/plan.ts),
// so a value the file shows differently from the screen is never overwritten
// by its own re-rendering.
//
// Everything here is pure: the writers call the builder, the readers call the
// parsers, and the unit tests call both.

import { BIND_TYPES, decodeOptions, encodeOptions, parseBindPath, type BindOption, type BindType, type Binding } from "./bindPath";

export const ROUNDTRIP_VERSION = 1;

/** Which file, which document, which records, when. */
export interface RoundTripEnvelope {
  v: 1;
  app: "dcrs";
  kind: "xlsx" | "docx";
  documentId: string;
  formatNo: string;
  revisionNo: string;
  /** Every [data-bind-record] exported (a register may hold several). */
  recordIds: string[];
  /** ISO timestamp. */
  exportedAt: string;
}

/** One bound value written into the file. */
export interface MapEntry {
  i: number;
  recordId: string;
  path: string;
  type: BindType;
  label: string;
  options: BindOption[];
  /** The value as written in the file (display form). */
  text: string;
  /** xlsx: A1 cell on the visible sheet. */
  ref?: string;
  /**
   * xlsx only, when the cell holds more than this value (a unit after a number,
   * a label before it, two values in one cell): the fixed words before and after
   * it in the cell, so the value can be cut out of the cell's text again.
   */
  pre?: string;
  post?: string;
  /**
   * xlsx, a value on a line of a grid: the line's own fixed words (its Sr. No.,
   * the parameter it is for) and the column they are in. Excel's hidden name
   * follows a cell when rows are inserted or deleted but not when the grid is
   * SORTED; the line's words move with it, so a line whose words are no longer
   * beside the named cell is found again by them, among the lines of the same
   * grid (`grid` numbers the grids of the sheet).
   */
  anchor?: { col: number; text: string; grid: number };
}

/** An appendable grid (data-bind-table + data-bind-append="1"): lines added in the file become new items of the list. */
export interface MapTable {
  t: number;
  recordId: string;
  listPath: string;
  /** col = 0-based grid column; label = the column's heading, when it has one. */
  columns: { key: string; type: BindType; options: BindOption[]; col: number; label?: string }[];
  /** xlsx: 1-based sheet row of the (last) header row. */
  headerRow?: number;
  /** xlsx: 1-based sheet row of the last data row (the header row when the grid has none). */
  lastRow?: number;
  /** xlsx: 1-based sheet row of the grid's first row (its first header row). */
  firstRow?: number;
  /** xlsx: 1-based sheet row of the first row written after the grid — reading new lines stops there. */
  nextRow?: number;
  /** docx: how many heading rows the table starts with. */
  headerRows?: number;
  /** Both: the text of each line of the grid that holds no bound value ("No rows yet."), so it is not read as a new line. */
  fixedRows?: string[];
}

// ---------------------------------------------------------------------------
// what documentBlocks hands the writers

/** A value on screen bound to the record, as utils/documentExport.ts reads it: the binding and the value's own text. */
export interface ExportBinding extends Binding {
  recordId: string;
  /** The bound element's text, taken whole (a tick box ☑/☐, a select's option label, a date as dd-Mmm-yyyy). */
  text: string;
  /** In a cell or a field holding exactly one bound value among other words: the words before and after it. */
  pre?: string;
  post?: string;
}

/** A piece of a cell's, a field's or a paragraph's text: fixed words, or a bound value. */
export interface ExportSegment {
  text: string;
  bind?: ExportBinding;
}

/** A grid the person may add lines to: its list, and which grid column holds which field of an item. */
export interface ExportTableBinding {
  recordId: string;
  listPath: string;
  columns: { key: string; type: BindType; options: BindOption[]; col: number; label?: string }[];
}

// ---------------------------------------------------------------------------
// building the map while a file is written

/** A label a person reads, when the view gave none: the column's heading, the field's name, else the path. */
export function entryLabel(bind: Pick<ExportBinding, "label" | "path">, fallback?: string): string {
  const own = (bind.label ?? "").trim();
  if (own) return own;
  const alt = (fallback ?? "").replace(/\s+/g, " ").trim();
  return alt || bind.path;
}

/** Collects the entries and grids of one file in the order they are written; each gets the next number. */
export class ExportMapBuilder {
  readonly entries: MapEntry[] = [];
  readonly tables: MapTable[] = [];

  add(bind: ExportBinding, opts: { ref?: string; pre?: string; post?: string; fallbackLabel?: string; anchor?: { col: number; text: string; grid: number } } = {}): MapEntry {
    const entry: MapEntry = {
      i: this.entries.length,
      recordId: bind.recordId,
      path: bind.path,
      type: bind.type,
      label: entryLabel(bind, opts.fallbackLabel),
      options: bind.options ?? [],
      text: bind.text,
    };
    if (opts.ref) entry.ref = opts.ref;
    if (opts.pre) entry.pre = opts.pre;
    if (opts.post) entry.post = opts.post;
    if (opts.anchor) entry.anchor = { ...opts.anchor };
    this.entries.push(entry);
    return entry;
  }

  addTable(table: ExportTableBinding, extra: Omit<MapTable, "t" | "recordId" | "listPath" | "columns"> = {}): MapTable {
    const out: MapTable = { t: this.tables.length, recordId: table.recordId, listPath: table.listPath, columns: table.columns.map((c) => ({ ...c, options: c.options ?? [] })), ...extra };
    this.tables.push(out);
    return out;
  }

  get empty(): boolean {
    return this.entries.length === 0 && this.tables.length === 0;
  }
}

export function makeEnvelope(kind: "xlsx" | "docx", doc: { documentId: string; formatNo?: string; revisionNo?: string }, recordIds: string[], exportedAt = new Date().toISOString()): RoundTripEnvelope {
  return {
    v: ROUNDTRIP_VERSION,
    app: "dcrs",
    kind,
    documentId: doc.documentId,
    formatNo: doc.formatNo ?? "",
    revisionNo: doc.revisionNo ?? "",
    recordIds: Array.from(new Set(recordIds.filter(Boolean))),
    exportedAt,
  };
}

const PLAIN_NUMBER = /^-?(?:\d+)(?:\.\d+)?$/;

/** The same words however a file's cells happen to space them (and a number however Excel rewrote it): used to recognise a grid's fixed lines. */
export function rowSignature(texts: readonly string[]): string {
  return texts
    .map((t) => {
      const s = (t ?? "").replace(/\s+/g, " ").trim();
      return PLAIN_NUMBER.test(s) ? String(Number(Number(s).toPrecision(15))) : s;
    })
    .filter(Boolean)
    .join(" | ");
}

// ---------------------------------------------------------------------------
// the map as the hidden sheet's rows (xlsx)

export const MAP_SHEET_NAME = "_dcrs";
export const MAP_SIGNATURE = "dcrs-map";
export const ENTRY_NAME_PREFIX = "_dcrs_";
export const entryName = (i: number) => `${ENTRY_NAME_PREFIX}${i}`;
/** The defined names that follow a grid when rows are inserted: its last header row, its last data row, the first row after it. */
export const tableName = (t: number, which: "h" | "z" | "n") => `${ENTRY_NAME_PREFIX}t${t}_${which}`;

const ENTRY_COLUMNS = ["i", "ref", "recordId", "path", "type", "options", "label", "text", "pre", "post", "anchorCol", "anchorText", "anchorGrid"] as const;
const TABLE_COLUMNS = ["t", "recordId", "listPath", "headerRow", "lastRow", "firstRow", "nextRow", "key", "type", "options", "col", "fixedRows", "label"] as const;
const ENVELOPE_KEYS = ["v", "app", "kind", "documentId", "formatNo", "revisionNo", "recordIds", "exportedAt"] as const;

const numText = (n: number | undefined) => (typeof n === "number" && Number.isFinite(n) ? String(n) : "");

/** The rows of the hidden "_dcrs" sheet: a signature, the envelope as key/value rows, one row per entry, one row per grid column. */
export function mapSheetRows(envelope: RoundTripEnvelope, entries: readonly MapEntry[], tables: readonly MapTable[]): string[][] {
  const rows: string[][] = [[MAP_SIGNATURE, String(ROUNDTRIP_VERSION), "This hidden sheet lets the Digital Controlled Record System read your changes back. Please leave it as it is."]];
  for (const key of ENVELOPE_KEYS) {
    const value = envelope[key];
    rows.push([key, Array.isArray(value) ? JSON.stringify(value) : String(value)]);
  }
  rows.push(["#entries", String(entries.length)]);
  rows.push([...ENTRY_COLUMNS]);
  for (const e of entries) {
    rows.push([String(e.i), e.ref ?? "", e.recordId, e.path, e.type, e.options.length ? encodeOptions(e.options) : "", e.label, e.text, e.pre ?? "", e.post ?? "", e.anchor ? String(e.anchor.col) : "", e.anchor?.text ?? "", e.anchor ? String(e.anchor.grid) : ""]);
  }
  rows.push(["#tables", String(tables.length)]);
  rows.push([...TABLE_COLUMNS]);
  for (const t of tables) {
    t.columns.forEach((c, ci) => {
      rows.push([
        String(t.t),
        t.recordId,
        t.listPath,
        numText(t.headerRow),
        numText(t.lastRow),
        numText(t.firstRow),
        numText(t.nextRow),
        c.key,
        c.type,
        c.options.length ? encodeOptions(c.options) : "",
        String(c.col),
        ci === 0 && t.fixedRows?.length ? JSON.stringify(t.fixedRows) : "",
        c.label ?? "",
      ]);
    });
  }
  return rows;
}

const isBindType = (s: string): s is BindType => (BIND_TYPES as readonly string[]).includes(s);

const intOf = (s: string | undefined): number | undefined => {
  if (s === undefined || s.trim() === "") return undefined;
  const n = Number(s.trim());
  return Number.isInteger(n) ? n : undefined;
};

function jsonStrings(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

function envelopeFrom(pairs: Map<string, string>): RoundTripEnvelope | null {
  if (pairs.get("app") !== "dcrs") return null;
  const kind = pairs.get("kind");
  const documentId = pairs.get("documentId") ?? "";
  if (!documentId) return null;
  return {
    v: 1,
    app: "dcrs",
    kind: kind === "docx" ? "docx" : "xlsx",
    documentId,
    formatNo: pairs.get("formatNo") ?? "",
    revisionNo: pairs.get("revisionNo") ?? "",
    recordIds: jsonStrings(pairs.get("recordIds")),
    exportedAt: pairs.get("exportedAt") ?? "",
  };
}

function validEntry(e: MapEntry): boolean {
  return Number.isInteger(e.i) && e.i >= 0 && !!e.recordId && !!parseBindPath(e.path) && isBindType(e.type);
}

/** The map read back from the hidden sheet's rows (cells as text), or null when they are not one. */
export function parseMapSheetRows(rows: readonly (readonly string[])[]): { envelope: RoundTripEnvelope; entries: MapEntry[]; tables: MapTable[] } | null {
  const start = rows.findIndex((r) => (r?.[0] ?? "").trim() === MAP_SIGNATURE);
  if (start === -1) return null;
  const pairs = new Map<string, string>();
  let r = start + 1;
  for (; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const key = (row[0] ?? "").trim();
    if (key === "#entries" || key === "#tables") break;
    if (key) pairs.set(key, row[1] ?? "");
  }
  const envelope = envelopeFrom(pairs);
  if (!envelope) return null;
  const entries: MapEntry[] = [];
  const tables = new Map<number, MapTable>();
  let section: "entries" | "tables" | null = null;
  let header: string[] = [];
  for (; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const first = (row[0] ?? "").trim();
    if (first === "#entries" || first === "#tables") {
      section = first === "#entries" ? "entries" : "tables";
      header = (rows[r + 1] ?? []).map((h) => (h ?? "").trim());
      r++;
      continue;
    }
    if (!section || row.every((c) => !c)) continue;
    const get = (name: string) => {
      const at = header.indexOf(name);
      return at === -1 ? "" : (row[at] ?? "");
    };
    if (section === "entries") {
      const type = get("type").trim();
      const e: MapEntry = {
        i: intOf(get("i")) ?? -1,
        recordId: get("recordId"),
        path: get("path"),
        type: (isBindType(type) ? type : "text") as BindType,
        label: get("label"),
        options: decodeOptions(get("options")),
        text: get("text"),
      };
      if (!isBindType(type)) continue;
      const ref = get("ref").trim();
      if (ref) e.ref = ref.replace(/\$/g, "").toUpperCase();
      const pre = get("pre");
      const post = get("post");
      if (pre) e.pre = pre;
      if (post) e.post = post;
      const anchorCol = intOf(get("anchorCol"));
      const anchorGrid = intOf(get("anchorGrid"));
      if (anchorCol !== undefined && anchorGrid !== undefined && get("anchorText")) e.anchor = { col: anchorCol, text: get("anchorText"), grid: anchorGrid };
      if (validEntry(e)) entries.push(e);
    } else {
      const t = intOf(get("t"));
      const type = get("type").trim();
      const col = intOf(get("col"));
      if (t === undefined || col === undefined || !isBindType(type) || !get("key")) continue;
      let table = tables.get(t);
      if (!table) {
        table = { t, recordId: get("recordId"), listPath: get("listPath"), columns: [] };
        const headerRow = intOf(get("headerRow"));
        const lastRow = intOf(get("lastRow"));
        const firstRow = intOf(get("firstRow"));
        const nextRow = intOf(get("nextRow"));
        if (headerRow !== undefined) table.headerRow = headerRow;
        if (lastRow !== undefined) table.lastRow = lastRow;
        if (firstRow !== undefined) table.firstRow = firstRow;
        if (nextRow !== undefined) table.nextRow = nextRow;
        tables.set(t, table);
      }
      const fixed = jsonStrings(get("fixedRows"));
      if (fixed.length) table.fixedRows = fixed;
      const column: MapTable["columns"][number] = { key: get("key"), type, options: decodeOptions(get("options")), col };
      if (get("label")) column.label = get("label");
      table.columns.push(column);
    }
  }
  return { envelope, entries, tables: Array.from(tables.values()).filter((t) => t.recordId && parseBindPath(t.listPath)) };
}

// ---------------------------------------------------------------------------
// the map as JSON (the Word file's custom XML part)

export const MAP_XML_NAMESPACE = "urn:dcrs:roundtrip:1";

/** The whole map as one JSON text. */
export function mapJson(envelope: RoundTripEnvelope, entries: readonly MapEntry[], tables: readonly MapTable[]): string {
  return JSON.stringify({ dcrs: MAP_SIGNATURE, v: ROUNDTRIP_VERSION, envelope, entries, tables });
}

const str = (v: unknown) => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v));
const optInt = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : undefined);

function optionsOf(v: unknown): BindOption[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((o): BindOption | null => (o && typeof o === "object" && "value" in o ? { value: str((o as BindOption).value), label: str((o as BindOption).label ?? (o as BindOption).value) } : typeof o === "string" ? { value: o, label: o } : null))
    .filter((o): o is BindOption => !!o);
}

/** The map read back from its JSON, or null when the text is not one. */
export function parseMapJson(text: string): { envelope: RoundTripEnvelope; entries: MapEntry[]; tables: MapTable[] } | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.dcrs !== MAP_SIGNATURE) return null;
  const env = (o.envelope ?? {}) as Record<string, unknown>;
  const pairs = new Map<string, string>();
  for (const key of ENVELOPE_KEYS) {
    const v = env[key];
    pairs.set(key, Array.isArray(v) ? JSON.stringify(v) : str(v));
  }
  const envelope = envelopeFrom(pairs);
  if (!envelope) return null;
  const entries: MapEntry[] = [];
  for (const item of Array.isArray(o.entries) ? o.entries : []) {
    if (!item || typeof item !== "object") continue;
    const x = item as Record<string, unknown>;
    const type = str(x.type);
    if (!isBindType(type)) continue;
    const e: MapEntry = { i: optInt(x.i) ?? -1, recordId: str(x.recordId), path: str(x.path), type, label: str(x.label), options: optionsOf(x.options), text: str(x.text) };
    if (x.ref) e.ref = str(x.ref);
    if (x.pre) e.pre = str(x.pre);
    if (x.post) e.post = str(x.post);
    const anchor = (x.anchor ?? null) as { col?: unknown; text?: unknown; grid?: unknown } | null;
    if (anchor && optInt(anchor.col) !== undefined && optInt(anchor.grid) !== undefined && str(anchor.text)) e.anchor = { col: optInt(anchor.col)!, text: str(anchor.text), grid: optInt(anchor.grid)! };
    if (validEntry(e)) entries.push(e);
  }
  const tables: MapTable[] = [];
  for (const item of Array.isArray(o.tables) ? o.tables : []) {
    if (!item || typeof item !== "object") continue;
    const x = item as Record<string, unknown>;
    const t = optInt(x.t);
    if (t === undefined || !str(x.recordId) || !parseBindPath(str(x.listPath))) continue;
    const columns = (Array.isArray(x.columns) ? x.columns : [])
      .map((c) => {
        const y = (c ?? {}) as Record<string, unknown>;
        const type = str(y.type);
        const col = optInt(y.col);
        if (!isBindType(type) || col === undefined || !str(y.key)) return null;
        const column: MapTable["columns"][number] = { key: str(y.key), type, options: optionsOf(y.options), col };
        if (str(y.label)) column.label = str(y.label);
        return column;
      })
      .filter((c): c is MapTable["columns"][number] => !!c);
    const table: MapTable = { t, recordId: str(x.recordId), listPath: str(x.listPath), columns };
    for (const k of ["headerRow", "lastRow", "firstRow", "nextRow", "headerRows"] as const) {
      const v = optInt(x[k]);
      if (v !== undefined) table[k] = v;
    }
    if (Array.isArray(x.fixedRows)) table.fixedRows = x.fixedRows.map(str);
    tables.push(table);
  }
  return { envelope, entries, tables };
}

// ---------------------------------------------------------------------------
// the small envelope in docProps/custom.xml

export const ENVELOPE_PROPERTY = "dcrs.envelope";

/** The envelope as a custom property's value: at most 255 characters (Office's limit for a text property). */
export function envelopePropertyValue(envelope: RoundTripEnvelope): string {
  const full = { v: envelope.v, documentId: envelope.documentId, recordId: envelope.recordIds[0] ?? "", exportedAt: envelope.exportedAt };
  let text = JSON.stringify(full);
  if (text.length <= 255) return text;
  text = JSON.stringify({ v: full.v, documentId: full.documentId.slice(0, 100), recordId: full.recordId.slice(0, 100) });
  return text.length <= 255 ? text : JSON.stringify({ v: full.v, documentId: full.documentId.slice(0, 200) });
}

export function parseEnvelopeProperty(text: string): { documentId: string; recordId?: string; exportedAt?: string } | null {
  try {
    const v = JSON.parse(text) as Record<string, unknown>;
    if (!v || typeof v !== "object" || typeof v.documentId !== "string" || !v.documentId) return null;
    return { documentId: v.documentId, recordId: typeof v.recordId === "string" && v.recordId ? v.recordId : undefined, exportedAt: typeof v.exportedAt === "string" ? v.exportedAt : undefined };
  } catch {
    return null;
  }
}
