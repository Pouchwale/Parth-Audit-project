// WHAT AN UPLOADED FILE WOULD CHANGE, BEFORE ANYTHING IS CHANGED (REQUIREMENTS §81).
//
// The file has been read (engine/roundTrip/readFile.ts): a value per bound place,
// the places that are gone, the lines added to a grid. This works out, against
// the record as it is NOW, exactly what applying it would do — shown to the
// person as a preview (components/common/UploadChanges.tsx) and applied only when
// they confirm (engine/roundTrip/applyImport.ts, through applyPlanToData here).
//
// The rule that keeps an upload safe: a value is CHANGED only when what the
// file holds now differs from what the download wrote there (MapEntry.text),
// compared the way the kind of value reads — spaces collapsed, numbers within
// a millionth, dates as dates, Yes/No and ticks as what they mean. A value the
// file merely shows differently (Excel turned "1.50" into 1.5, a date became a
// serial) is not a change, and neither is one the record already holds. So an
// untouched value is never overwritten, not even with its own re-rendering —
// and a value someone changed in the app after the download is left alone
// unless the file changes it too (then it is flagged as a conflict).

import { generateId } from "../../utils/id";
import { getAtPath, pathExists, setAtPath, type BindOption, type BindType } from "./bindPath";
import type { MapEntry, RoundTripEnvelope } from "./exportMap";
import type { ReadResult, UploadedValue } from "./readFile";
import { displayValue, parseUploadedValue as parseValue, readDate, readNumber, readTick, readTime, sameStored } from "./values";

export interface PlannedChange {
  recordId: string;
  path: string;
  label: string;
  type: BindType;
  /** The record's value now, as the view shows it. */
  before: string;
  /** The value from the file, as the view will show it. */
  after: string;
  /** What is written at `path`. */
  value: unknown;
  /** The record's value was changed in the app after the file was downloaded (it no longer matches what the file was made with). */
  conflict?: boolean;
}

export interface PlannedAppend {
  recordId: string;
  listPath: string;
  item: Record<string, unknown>;
  label: string;
}

export interface RejectedValue {
  recordId: string;
  label: string;
  text: string;
  why: string;
}

export interface ImportPlan {
  envelope: RoundTripEnvelope;
  fileName: string;
  changes: PlannedChange[];
  appends: PlannedAppend[];
  rejected: RejectedValue[];
  unchanged: number;
  missing: number;
  records: { recordId: string; documentId: string; found: boolean }[];
}

export interface PlanContext {
  today: string;
  getRecord: (recordId: string) => { data: unknown; documentId: string } | null;
  /** A blank item for a list (a new line of a free-row log sheet), or null when lines cannot be added there. */
  blankItem: (documentId: string, listPath: string) => Record<string, unknown> | null;
}

/** A value read from a file, turned into the value the record stores (engine/roundTrip/values.ts). */
export function parseUploadedValue(
  v: UploadedValue,
  type: BindType,
  options: BindOption[],
  today: string
): { ok: true; value: unknown; display: string } | { ok: false; why: string } {
  return parseValue(v, type, options, today);
}

// ---------------------------------------------------------------------------
// is it a change at all?

const normLine = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    .replace(/\s+/g, " ")
    .trim();

/** Lines trimmed, spaces collapsed, blank lines dropped — the way the download wrote a paragraph. */
const normParagraph = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t  ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

const NUMERIC_TEXT = /^[+-]?(?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d+)?$/;

function sameParsed(a: UploadedValue, b: UploadedValue, type: BindType, options: BindOption[], today: string): boolean {
  const x = parseValue(a, type, options, today);
  const y = parseValue(b, type, options, today);
  return x.ok && y.ok && sameStored(x.value, y.value, type);
}

/**
 * Whether the value the file holds now is the value the download wrote there,
 * however the program that saved it has re-rendered it.
 */
export function unchangedInFile(up: UploadedValue, written: string, type: BindType, options: BindOption[], today: string): boolean {
  const paragraph = type === "paragraph";
  const a = paragraph ? normParagraph(up.text ?? "") : normLine(up.text ?? "");
  const b = paragraph ? normParagraph(written ?? "") : normLine(written ?? "");
  if (a === b && up.bool === undefined) return true;
  const w: UploadedValue = { text: written ?? "" };
  switch (type) {
    case "number": {
      const x = readNumber(up);
      const y = readNumber(w);
      if (x === undefined || y === undefined) return false;
      return x === null || y === null ? x === y : Math.abs(x - y) <= 1e-6;
    }
    case "date": {
      const x = readDate(up, today);
      return x !== null && x === readDate(w, today);
    }
    case "time": {
      const x = readTime(up);
      return x !== null && x === readTime(w);
    }
    case "bool": {
      const x = readTick(up);
      return x !== undefined && x === readTick(w);
    }
    case "yesno":
    case "select":
      return sameParsed(up, w, type, options, today);
    default: {
      // A text value Excel re-typed: "1.50" saved as 1.5, "01-Oct-2026" turned into a date.
      if (a === b) return true;
      if (typeof up.number === "number" && !up.isDate && NUMERIC_TEXT.test(b)) {
        const y = readNumber(w);
        return typeof y === "number" && Math.abs(up.number - y) <= 1e-6;
      }
      if (NUMERIC_TEXT.test(a) && NUMERIC_TEXT.test(b)) {
        const x = readNumber({ text: a });
        const y = readNumber(w);
        return typeof x === "number" && typeof y === "number" && Math.abs(x - y) <= 1e-6;
      }
      if (up.isDate) {
        const x = readDate(up, today);
        return x !== null && x !== "" && x === readDate(w, today);
      }
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// the plan

const keyOf = (recordId: string, path: string) => `${recordId}\u0000${path}`;

/** Works out what the file would change in each record it holds. Pure: nothing is written. */
export function planImport(read: Extract<ReadResult, { ok: true }>, fileName: string, ctx: PlanContext): ImportPlan {
  const records: ImportPlan["records"] = [];
  const found = new Map<string, { data: unknown; documentId: string } | null>();
  const ids = [...read.envelope.recordIds, ...read.entries.map((e) => e.recordId), ...read.appended.map((a) => a.recordId)];
  for (const id of ids) {
    if (!id || found.has(id)) continue;
    let rec: { data: unknown; documentId: string } | null = null;
    try {
      rec = ctx.getRecord(id);
    } catch {
      rec = null;
    }
    found.set(id, rec);
    records.push({ recordId: id, documentId: rec?.documentId ?? read.envelope.documentId, found: !!rec });
  }

  const changes: PlannedChange[] = [];
  const appends: PlannedAppend[] = [];
  const rejected: RejectedValue[] = [];
  let unchanged = 0;
  const planned = new Map<string, PlannedChange>();
  const gone = new Set(read.missing);

  const byI = new Map<number, MapEntry>();
  for (const entry of read.entries) byI.set(entry.i, entry);

  for (const entry of read.entries) {
    const rec = found.get(entry.recordId);
    if (!rec || gone.has(entry.i)) continue;
    const up = read.values.get(entry.i);
    if (!up) continue;
    if (unchangedInFile(up, entry.text, entry.type, entry.options, ctx.today)) {
      unchanged++;
      continue;
    }
    const parsed = parseValue(up, entry.type, entry.options, ctx.today);
    if (!parsed.ok) {
      rejected.push({ recordId: entry.recordId, label: entry.label, text: (up.text ?? "").trim(), why: parsed.why });
      continue;
    }
    if (!pathExists(rec.data, entry.path)) {
      rejected.push({ recordId: entry.recordId, label: entry.label, text: (up.text ?? "").trim(), why: "That line is no longer in the record — it was removed after this file was downloaded." });
      continue;
    }
    const current = getAtPath(rec.data, entry.path);
    if (sameStored(current, parsed.value, entry.type)) {
      unchanged++;
      continue;
    }
    const key = keyOf(entry.recordId, entry.path);
    const prior = planned.get(key);
    if (prior) {
      if (sameStored(prior.value, parsed.value, entry.type)) continue;
      rejected.push({
        recordId: entry.recordId,
        label: entry.label,
        text: (up.text ?? "").trim(),
        why: `It was changed in two places in the file, to ${prior.after ? `“${prior.after}”` : "nothing"} and to ${parsed.display ? `“${parsed.display}”` : "nothing"} — only the first is used.`,
      });
      continue;
    }
    const before = displayValue(current, entry.type, entry.options);
    const change: PlannedChange = { recordId: entry.recordId, path: entry.path, label: entry.label, type: entry.type, before, after: parsed.display, value: parsed.value };
    if (!unchangedInFile({ text: before }, entry.text, entry.type, entry.options, ctx.today)) change.conflict = true;
    planned.set(key, change);
    changes.push(change);
  }

  const lineNo = new Map<string, number>();
  for (const row of read.appended) {
    const rec = found.get(row.recordId);
    if (!rec) continue;
    const table = read.tables.find((t) => t.t === row.table);
    if (!table) continue;
    const texts = table.columns.map((c) => (row.cells[c.key]?.text ?? "").trim());
    if (texts.every((t) => !t)) continue;
    const listKey = keyOf(row.recordId, row.listPath);
    const n = (lineNo.get(listKey) ?? 0) + 1;
    lineNo.set(listKey, n);
    const summary = texts.filter(Boolean).slice(0, 5).join(" · ");
    let blank: Record<string, unknown> | null = null;
    try {
      blank = ctx.blankItem(rec.documentId, row.listPath);
    } catch {
      blank = null;
    }
    if (!blank || !Array.isArray(getAtPath(rec.data, row.listPath))) {
      rejected.push({ recordId: row.recordId, label: `New line ${n}`, text: summary, why: "New lines cannot be added to this table from a file — add them in the record itself." });
      continue;
    }
    let item: Record<string, unknown> = { ...blank };
    const shown: string[] = [];
    for (const col of table.columns) {
      const up = row.cells[col.key];
      if (!up || !(up.text ?? "").trim()) continue;
      const parsed = parseValue(up, col.type, col.options, ctx.today);
      const colLabel = col.label || col.key;
      if (!parsed.ok) {
        rejected.push({ recordId: row.recordId, label: `New line ${n} · ${colLabel}`, text: (up.text ?? "").trim(), why: parsed.why });
        continue;
      }
      if (col.key.includes("/")) {
        const set = setAtPath(item, col.key, parsed.value);
        if (set.ok) item = set.data;
      } else item[col.key] = parsed.value;
      if (parsed.display) shown.push(parsed.display);
    }
    if (shown.length === 0) continue;
    item.id = generateId("row");
    appends.push({ recordId: row.recordId, listPath: row.listPath, item, label: `New line ${n}: ${shown.slice(0, 5).join(" · ")}` });
  }

  const missing = read.missing.filter((i) => {
    const e = byI.get(i);
    return !!e && !!found.get(e.recordId);
  }).length;

  return { envelope: read.envelope, fileName, changes, appends, rejected, unchanged, missing, records };
}

/** The record's data with the plan's changes for it written and its new lines added. Pure: returns a copy. */
export function applyPlanToData(data: unknown, recordId: string, plan: ImportPlan): { data: unknown; applied: number; failed: string[] } {
  let next = data;
  let applied = 0;
  const failed: string[] = [];
  for (const c of plan.changes) {
    if (c.recordId !== recordId) continue;
    const set = setAtPath(next, c.path, c.value);
    if (set.ok) {
      next = set.data;
      applied++;
    } else failed.push(c.label);
  }
  for (const a of plan.appends) {
    if (a.recordId !== recordId) continue;
    const list = getAtPath(next, a.listPath);
    const set = Array.isArray(list) ? setAtPath(next, a.listPath, [...list, { ...a.item }]) : ({ ok: false } as const);
    if (set.ok) {
      next = set.data;
      applied++;
    } else failed.push(a.label);
  }
  return { data: next, applied, failed };
}
