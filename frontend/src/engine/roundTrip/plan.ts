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
import { ROUNDTRIP_STRINGS } from "../../i18n/strings.roundtrip";
import { getAtPath, pathExists, setAtPath, type BindOption, type BindType } from "./bindPath";
import type { BindRule } from "./bindingsFor";
import type { MapEntry, MapTable, RoundTripEnvelope } from "./exportMap";
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
  /**
   * The reader could not be sure which line this value belongs to: the grid's
   * lines were sorted, renumbered or lost their hidden names in the file
   * (readFile.ts relocated / unconfirmed). Shown for a check before applying.
   */
  moved?: boolean;
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
  /** The reason as a key of i18n/strings.roundtrip.ts, when there is one — the preview says it in the reader's language. */
  whyKey?: string;
  whyParams?: Record<string, string | number>;
}

/** A change the record's own page would not make (a checklist answered out of turn): every change at `path` or under it is refused. */
export interface Refusal {
  path: string;
  why: string;
  whyKey?: string;
  whyParams?: Record<string, string | number>;
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
  /**
   * What the record's page holds NOW about a bound value (engine/roundTrip/bindingsFor.ts):
   * it must not be left empty, or the app stamps it itself. Looked up from the
   * record's current bindings, not the file, so a file downloaded before a rule
   * existed is held to it too.
   */
  ruleFor?: (recordId: string, path: string) => BindRule | null;
  /**
   * What the record's page itself would refuse of these changes taken together
   * (a checklist answered one activity at a time): given the record's data
   * before and after them, the places it would put back.
   */
  review?: (recordId: string, documentId: string, before: unknown, after: unknown) => Refusal[];
}

/** An upload rule's reason in English (the plan's `why`), from its key in i18n/strings.roundtrip.ts. */
export function ruleWhy(key: string, params: Record<string, string | number> = {}): string {
  const text = (ROUNDTRIP_STRINGS.en as Record<string, string>)[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** A path is at `at` or under it. */
export const isUnder = (path: string, at: string): boolean => path === at || path.startsWith(`${at}/`);

const isBlankValue = (v: unknown): boolean => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/**
 * Whether a line the file adds is one the list already holds — the same file
 * uploaded again after one more box was fixed. Every column the file's grid
 * writes must match: a box the file left empty against the blank line's own
 * value (what the first upload wrote there), a filled one as its kind of value.
 */
function sameLine(existing: unknown, item: Record<string, unknown>, columns: MapTable["columns"]): boolean {
  if (!existing || typeof existing !== "object") return false;
  for (const col of columns) {
    const at = (x: unknown) => (col.key.includes("/") ? getAtPath(x, col.key) : (x as Record<string, unknown>)[col.key]);
    const a = at(existing);
    const b = at(item);
    if (isBlankValue(a) && isBlankValue(b)) continue;
    if (!sameStored(a, b, col.type) && String(a ?? "").trim() !== String(b ?? "").trim()) return false;
  }
  return true;
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
//
// Beyond "is it a change": a value the record's page holds a rule about NOW
// (PlanContext.ruleFor — a date never left empty, a stamp only the app writes)
// is refused with the rule's reason; the changes to one record taken together
// are shown to its page's own rules (PlanContext.review — a checklist answered
// in turn); and a line the file adds that the record already holds (the same
// file uploaded again) is not added twice.

const keyOf =(recordId: string, path: string) => `${recordId}\u0000${path}`;

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

  const ruleOf = (recordId: string, path: string): BindRule | null => {
    if (!ctx.ruleFor) return null;
    try {
      return ctx.ruleFor(recordId, path);
    } catch {
      return null;
    }
  };

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
    // What the page holds about this value now: a stamp the app writes, or a value never left empty.
    const rule = ruleOf(entry.recordId, entry.path);
    const refusedBy = rule?.readOnly ?? (rule?.required && isBlankValue(parsed.value) ? rule.required : undefined);
    if (refusedBy) {
      rejected.push({ recordId: entry.recordId, label: entry.label, text: (up.text ?? "").trim(), why: ruleWhy(refusedBy), whyKey: refusedBy });
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
    if (read.relocated?.includes(entry.i) || read.unconfirmed?.includes(entry.i)) change.moved = true;
    planned.set(key, change);
    changes.push(change);
  }

  const lineNo = new Map<string, number>();
  const nextLine = (listKey: string): number => {
    const n = (lineNo.get(listKey) ?? 0) + 1;
    lineNo.set(listKey, n);
    return n;
  };
  // The lines of each list a line of the file has already been found to be (so two alike lines in the file need two alike in the record).
  const matched = new Map<string, Set<number>>();
  for (const row of read.appended) {
    const rec = found.get(row.recordId);
    if (!rec) continue;
    const table = read.tables.find((t) => t.t === row.table);
    if (!table) continue;
    const texts = table.columns.map((c) => (row.cells[c.key]?.text ?? "").trim());
    if (texts.every((t) => !t)) continue;
    const listKey = keyOf(row.recordId, row.listPath);
    const summary = texts.filter(Boolean).slice(0, 5).join(" · ");
    let blank: Record<string, unknown> | null = null;
    try {
      blank = ctx.blankItem(rec.documentId, row.listPath);
    } catch {
      blank = null;
    }
    const list = getAtPath(rec.data, row.listPath);
    if (!blank || !Array.isArray(list)) {
      rejected.push({ recordId: row.recordId, label: `New line ${nextLine(listKey)}`, text: summary, why: "New lines cannot be added to this table from a file — add them in the record itself." });
      continue;
    }
    let item: Record<string, unknown> = { ...blank };
    const shown: string[] = [];
    const bad: { col: string; text: string; why: string }[] = [];
    for (const col of table.columns) {
      const up = row.cells[col.key];
      if (!up || !(up.text ?? "").trim()) continue;
      const parsed = parseValue(up, col.type, col.options, ctx.today);
      if (!parsed.ok) {
        bad.push({ col: col.label || col.key, text: (up.text ?? "").trim(), why: parsed.why });
        continue;
      }
      if (col.key.includes("/")) {
        const set = setAtPath(item, col.key, parsed.value);
        if (set.ok) item = set.data;
      } else item[col.key] = parsed.value;
      if (parsed.display) shown.push(parsed.display);
    }
    // The file's grid keeps the lines it added: uploaded again (one more box
    // fixed), they are read as new once more. A line the record already holds
    // is not added twice.
    if (shown.length > 0) {
      const used = matched.get(listKey) ?? new Set<number>();
      const at = list.findIndex((existing, i) => !used.has(i) && sameLine(existing, item, table.columns));
      if (at >= 0) {
        used.add(at);
        matched.set(listKey, used);
        unchanged++;
        continue;
      }
    }
    const n = nextLine(listKey);
    for (const b of bad) rejected.push({ recordId: row.recordId, label: `New line ${n} · ${b.col}`, text: b.text, why: b.why });
    if (shown.length === 0) continue;
    item.id = generateId("row");
    appends.push({ recordId: row.recordId, listPath: row.listPath, item, label: `New line ${n}: ${shown.slice(0, 5).join(" · ")}` });
  }

  // What each record's page would refuse of its changes taken together (a
  // checklist answered out of turn) is refused here too, so the preview never
  // promises a change Apply would not make.
  if (ctx.review) {
    for (const [recordId, rec] of found) {
      if (!rec) continue;
      const mine = changes.filter((c) => c.recordId === recordId);
      if (mine.length === 0) continue;
      let refusals: Refusal[] = [];
      try {
        const after = writeInto(rec.data, mine, []).data;
        refusals = ctx.review(recordId, rec.documentId, rec.data, after) ?? [];
      } catch {
        refusals = [];
      }
      for (const r of refusals) {
        for (const c of mine) {
          if (!isUnder(c.path, r.path)) continue;
          const at = changes.indexOf(c);
          if (at < 0) continue;
          changes.splice(at, 1);
          rejected.push({ recordId, label: c.label, text: c.after, why: r.why, ...(r.whyKey ? { whyKey: r.whyKey } : {}), ...(r.whyParams ? { whyParams: r.whyParams } : {}) });
        }
      }
    }
  }

  const missing = read.missing.filter((i) => {
    const e = byI.get(i);
    return !!e && !!found.get(e.recordId);
  }).length;

  return { envelope: read.envelope, fileName, changes, appends, rejected, unchanged, missing, records };
}

/** The record's data with the plan's changes for it written and its new lines added. Pure: returns a copy. */
export function applyPlanToData(data: unknown, recordId: string, plan: ImportPlan): { data: unknown; applied: number; failed: string[] } {
  return writeInto(
    data,
    plan.changes.filter((c) => c.recordId === recordId),
    plan.appends.filter((a) => a.recordId === recordId)
  );
}

/** `data` with these changes written and these lines added. Pure: returns a copy. */
function writeInto(data: unknown, changes: readonly PlannedChange[], appends: readonly PlannedAppend[]): { data: unknown; applied: number; failed: string[] } {
  let next = data;
  let applied = 0;
  const failed: string[] = [];
  for (const c of changes) {
    const set = setAtPath(next, c.path, c.value);
    if (set.ok) {
      next = set.data;
      applied++;
    } else failed.push(c.label);
  }
  for (const a of appends) {
    const list = getAtPath(next, a.listPath);
    const set = Array.isArray(list) ? setAtPath(next, a.listPath, [...list, { ...a.item }]) : ({ ok: false } as const);
    if (set.ok) {
      next = set.data;
      applied++;
    } else failed.push(a.label);
  }
  return { data: next, applied, failed };
}
