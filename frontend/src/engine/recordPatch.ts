import type { LogColumn, LogHeaderField, LogSheetLayout, ServiceReportAreaLine } from "../types";
import { getLogSheetLayout } from "../data/seed/logSheetLayouts";
import { documentRepository } from "../data/repositories/documentRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { normalizeServiceLines } from "./serviceMaterials";
import { addDays, pad2, todayISO } from "../utils/date";
import { generateId } from "../utils/id";

// EVERY CHANGE THE ASSISTANT MAKES IS CHECKED HERE FIRST.
//
// The assistant's model proposes a change as JSON; nothing guarantees that
// JSON names a field the form has, puts a number where a number goes, or uses
// one of the options a select list allows. Merged blindly (which is what used
// to happen), "OK" would land in a Yes/No check point and quietly defeat every
// rule that tests for "Yes", and a whole-array reply could drop rows. So:
//
//   * unknown fields are left out, and the user is told;
//   * values are normalised to what the form stores (Yes/No, numbers, 24-hour
//     times, ISO dates, the exact select option) — or refused with a reason;
//   * printed columns (a time slot, a test parameter) can never be changed,
//     and a form with a fixed set of rows never gains or loses one;
//   * a change to one row or item ("itemEdits") is applied to exactly the row
//     it names — and refused if it matches none, or more than one.
//
// The same module also understands simple edit instructions typed or spoken
// in plain words ("14:00 viscosity is 20.4", "check point 3 is no", "PC-05
// count is 2", "customer sign is Kapila Barad") without any network call —
// instant, free, and the same whether or not the AI service is reachable.

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

export interface ItemEdit {
  collection: string;
  match?: Obj;
  set: Obj;
  /** Apply to every matching item (only when the instruction really means all). */
  all?: boolean;
}

export interface PatchOutcome<T> {
  data: T;
  /** Plain-language notes on anything that was left out or refused. */
  problems: string[];
}

// ---------------------------------------------------------------------------
// value normalisers

const YES = new Set(["yes", "y", "yeah", "yep", "ok", "okay", "done", "true", "haa", "ha", "han", "હા", "હાં", "present", "attended"]);
const NO = new Set(["no", "n", "nope", "not ok", "notok", "false", "nahi", "nai", "ના", "absent", "not attended"]);

export function normYesNo(v: unknown): "Yes" | "No" | null {
  if (v === true) return "Yes";
  if (v === false) return "No";
  const s = String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/, "");
  if (YES.has(s)) return "Yes";
  if (NO.has(s)) return "No";
  return null;
}

export function normNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = String(v ?? "")
    .replace(/,/g, "")
    .match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** "9:15", "9.15", "9:15 am", "2 pm", "11 o'clock", "14:00" -> "HH:MM". */
export function normTime(v: unknown): string | null {
  const s = String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  let h: number;
  let min = 0;
  let m = s.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (m) {
    h = Number(m[1]);
    min = Number(m[2] ?? 0);
    const ap = m[3]?.replace(/\./g, "");
    if (!m[2] && !ap) return null; // a bare "9" is too ambiguous to be a time
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
  } else {
    m = s.match(/^(\d{1,2})\s*o'?\s*clock$/);
    if (!m) return null;
    h = Number(m[1]);
  }
  if (h > 23 || min > 59) return null;
  return `${pad2(h)}:${pad2(min)}`;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function isoOf(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null;
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

/** ISO, "15/09/2026", "15-9-26", "15 Sept 2026", "3rd sep", "today", "yesterday" -> "YYYY-MM-DD" (day first, as written in India). */
export function normDate(v: unknown, today = todayISO()): string | null {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isoOf(Number(s.slice(0, 4)), Number(s.slice(5, 7)), Number(s.slice(8, 10)));
  if (s === "today") return today;
  if (s === "yesterday") return addDays(today, -1);
  if (s === "tomorrow") return addDays(today, 1);
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return isoOf(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), Number(m[2]), Number(m[1]));
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?,?\s*(\d{2,4})?$/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3));
    if (mi < 0) return null;
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : Number(today.slice(0, 4));
    return isoOf(y, mi + 1, Number(m[1]));
  }
  return null;
}

/** The exact option from a select list, matched loosely ("accepted" -> "Accepted"). */
export function normOption(v: unknown, options: string[]): string | null {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (!s) return null;
  const exact = options.find((o) => o.toLowerCase() === s);
  if (exact) return exact;
  const starts = options.filter((o) => o.toLowerCase().startsWith(s));
  if (starts.length === 1) return starts[0];
  const within = options.filter((o) => o.toLowerCase().includes(s) || s.includes(o.toLowerCase()));
  if (within.length === 1) return within[0];
  return null;
}

// ---------------------------------------------------------------------------
// field typing

const INVALID = Symbol("invalid");
type Normalised = unknown;

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const quote = (v: unknown) => (typeof v === "string" ? `"${v}"` : String(v));

export function humanKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

// Plain fields whose value is a number even while it is still blank (null).
const NUMERIC_KEYS = new Set(["catchCountApprox", "count"]);
// Plain fields with a fixed set of values.
const FIELD_OPTIONS: Record<string, string[]> = {
  status: ["Open", "Closed"],
  source: ["Internal", "External"],
};
// Text a record carries from the printed form — never rewritten by an edit.
const PROTECTED_KEYS = new Set(["activity", "srNo", "key", "title", "parameter", "specification", "testChart"]);

type TypedField = { key: string; label: string; type: string; options?: string[] };

function normTyped(field: TypedField, value: unknown, problems: string[]): Normalised {
  const label = field.label.split(" (")[0];
  if (isBlank(value)) return field.type === "number" ? null : "";
  switch (field.type) {
    case "number": {
      const n = normNumber(value);
      if (n === null) {
        problems.push(`${label} needs a number — ${quote(value)} wasn't used.`);
        return INVALID;
      }
      return n;
    }
    case "yesno": {
      const yn = normYesNo(value);
      if (!yn) {
        problems.push(`${label} can only be Yes or No — ${quote(value)} wasn't used.`);
        return INVALID;
      }
      return yn;
    }
    case "select": {
      const o = normOption(value, field.options ?? []);
      if (!o) {
        problems.push(`${label} must be one of: ${(field.options ?? []).join(", ")} — ${quote(value)} wasn't used.`);
        return INVALID;
      }
      return o;
    }
    case "time": {
      const tm = normTime(value);
      if (!tm) {
        problems.push(`${label} needs a time like 14:30 — ${quote(value)} wasn't used.`);
        return INVALID;
      }
      return tm;
    }
    case "date": {
      const d = normDate(value);
      if (!d) {
        problems.push(`${label} needs a date — ${quote(value)} wasn't used.`);
        return INVALID;
      }
      return d;
    }
    default:
      return String(value).trim();
  }
}

/** A plain field, typed by what it holds today (or, while blank, by its name). */
function normPlain(key: string, value: unknown, current: unknown, problems: string[]): Normalised {
  const label = humanKey(key);
  if (isObj(value) || Array.isArray(value)) {
    problems.push(`${label} takes a single value, so I left it unchanged.`);
    return INVALID;
  }
  if (typeof current === "boolean") {
    if (typeof value === "boolean") return value;
    const yn = normYesNo(value);
    if (!yn) {
      problems.push(`${label} can only be Yes or No — ${quote(value)} wasn't used.`);
      return INVALID;
    }
    return yn === "Yes";
  }
  if (typeof current === "number" || (current == null && NUMERIC_KEYS.has(key))) {
    if (isBlank(value)) return null;
    const n = normNumber(value);
    if (n === null) {
      problems.push(`${label} needs a number — ${quote(value)} wasn't used.`);
      return INVALID;
    }
    return n;
  }
  if (FIELD_OPTIONS[key]) {
    const o = normOption(value, FIELD_OPTIONS[key]);
    if (!o) {
      problems.push(`${label} must be one of: ${FIELD_OPTIONS[key].join(", ")} — ${quote(value)} wasn't used.`);
      return INVALID;
    }
    return o;
  }
  if (/date/i.test(key)) {
    if (isBlank(value)) return current === null ? null : "";
    const d = normDate(value);
    if (!d) {
      problems.push(`${label} needs a date — ${quote(value)} wasn't used.`);
      return INVALID;
    }
    return d;
  }
  if (/^time|Time/.test(key)) {
    if (isBlank(value)) return "";
    const tm = normTime(value);
    if (!tm) {
      problems.push(`${label} needs a time like 09:15 — ${quote(value)} wasn't used.`);
      return INVALID;
    }
    return tm;
  }
  return String(value ?? "").trim();
}

function blankLike(template: Obj): Obj {
  const out: Obj = {};
  for (const [k, v] of Object.entries(template)) {
    if (k === "id") continue;
    if (Array.isArray(v)) out[k] = [];
    else if (isObj(v)) out[k] = blankLike(v);
    else if (typeof v === "boolean") out[k] = false;
    else if (typeof v === "number" || v === null) out[k] = null;
    else out[k] = "";
  }
  return out;
}

function normObjectSet(base: Obj, set: Obj, problems: string[], template: Obj = base): Obj {
  const next: Obj = { ...base };
  for (const [k, v] of Object.entries(set)) {
    if (k === "id") continue;
    if (!(k in base) && !(k in template)) {
      problems.push(`"${k}" isn't a field on this form, so I left it out.`);
      continue;
    }
    const cur = k in base ? base[k] : template[k];
    if (PROTECTED_KEYS.has(k)) {
      if (String(v ?? "") !== String(cur ?? "")) problems.push(`${humanKey(k)} is printed on the form and can't be changed.`);
      continue;
    }
    if (Array.isArray(cur)) {
      if (Array.isArray(v)) next[k] = normArray(k, cur, v, problems);
      else problems.push(`${humanKey(k)} is a list, so I left it unchanged.`);
      continue;
    }
    if (isObj(cur)) {
      if (isObj(v)) next[k] = normObjectSet(cur, v, problems);
      else problems.push(`${humanKey(k)} has several parts, so I left it unchanged.`);
      continue;
    }
    const n = normPlain(k, v, cur, problems);
    if (n !== INVALID) next[k] = n;
  }
  return next;
}

function normArray(key: string, cur: unknown[], value: unknown[], problems: string[]): unknown[] {
  const scalarList = cur.length > 0 ? !isObj(cur[0]) : value.every((v) => !isObj(v));
  if (scalarList) return value.filter((v) => !isObj(v) && !Array.isArray(v)).map((v) => String(v ?? "").trim());
  const template = (cur.find(isObj) ?? {}) as Obj;
  const hasId = "id" in template;
  return value.filter(isObj).map((raw) => {
    const existing = hasId && typeof raw.id === "string" ? (cur.find((c) => isObj(c) && c.id === raw.id) as Obj | undefined) : undefined;
    if (existing) return normObjectSet(existing, raw, problems, template);
    const fresh: Obj = { ...blankLike(template) };
    if (hasId) fresh.id = generateId(key);
    // A new line may set the printed text (a new activity has none to protect).
    for (const k of PROTECTED_KEYS) if (k in raw && k in fresh) fresh[k] = raw[k];
    const { id: _ignore, ...rest } = raw;
    void _ignore;
    const withoutProtected = Object.fromEntries(Object.entries(rest).filter(([k]) => !PROTECTED_KEYS.has(k)));
    return normObjectSet(fresh, withoutProtected, problems, template);
  });
}

// ---- daily monitoring check points ------------------------------------------

const OK_WORDS = new Set(["ok", "okay", "all ok", "fine"]);
const NOT_OK_WORDS = new Set(["not ok", "notok", "not okay"]);

// A check point's Yes / No. "OK" says the point is fine — but on the points
// that ask about a problem ("any gap…?", "any pest trapped…?") fine is "No",
// so it can't simply mean Yes: "check point 2 is ok" used to record a gap.
function checkpointAnswer(no: number, raw: unknown): "Yes" | "No" | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/, "");
  const flagWhen = masterRepository.get().checkpoints.find((c) => Number(c.no) === no)?.flagWhen;
  if (flagWhen === "Yes" || flagWhen === "No") {
    if (OK_WORDS.has(s)) return flagWhen === "Yes" ? "No" : "Yes";
    if (NOT_OK_WORDS.has(s)) return flagWhen;
  }
  return normYesNo(raw);
}

function normCheckpoints(cur: Obj, value: unknown, problems: string[]): Obj {
  const next: Obj = { ...cur };
  if (!isObj(value)) {
    problems.push("Check points have to be given by their number.");
    return next;
  }
  for (const [k, v] of Object.entries(value)) {
    const no = Number(k);
    if (!Number.isInteger(no) || no < 1 || no > 10) {
      problems.push(`There is no check point ${k} — the form has 1 to 10.`);
      continue;
    }
    const prev = isObj(cur[k]) ? (cur[k] as Obj) : {};
    const raw = isObj(v) ? v.value : v;
    const note = isObj(v) && typeof v.note === "string" ? v.note.trim() : undefined;
    if (raw === undefined) {
      if (note !== undefined) next[k] = { ...prev, note };
      continue;
    }
    if (no === 4) {
      const n = normNumber(raw);
      if (n === null) {
        problems.push(`Check point 4 is a count of traps — ${quote(raw)} wasn't used.`);
        continue;
      }
      next[k] = { ...prev, value: n, ...(note !== undefined ? { note } : {}) };
      continue;
    }
    const yn = checkpointAnswer(no, raw);
    if (!yn) {
      problems.push(`Check point ${no} can only be Yes or No — ${quote(raw)} wasn't used.`);
      continue;
    }
    next[k] = { ...prev, value: yn, ...(note !== undefined ? { note } : {}) };
  }
  return next;
}

// ---- log sheets ---------------------------------------------------------------

function layoutFields(layout: LogSheetLayout): LogHeaderField[] {
  return [...layout.headerFields, ...(layout.footerFields ?? [])];
}

function normHeader(layout: LogSheetLayout, cur: Obj, value: unknown, problems: string[]): Obj {
  const next: Obj = { ...cur };
  if (!isObj(value)) {
    problems.push("The form's header fields have to be given one by one.");
    return next;
  }
  const fields = layoutFields(layout);
  for (const [k, v] of Object.entries(value)) {
    const f = fields.find((x) => x.key === k);
    if (!f) {
      problems.push(`"${k}" isn't a field on this form, so I left it out.`);
      continue;
    }
    const n = normTyped(f, v, problems);
    if (n !== INVALID) next[k] = n;
  }
  return next;
}

function normRow(layout: LogSheetLayout, row: Obj, set: Obj, problems: string[]): Obj {
  const next: Obj = { ...row };
  for (const [k, v] of Object.entries(set)) {
    if (k === "id") continue;
    const col = layout.columns.find((c) => c.key === k);
    if (!col) {
      problems.push(`"${k}" isn't a column on this form, so I left it out.`);
      continue;
    }
    if (col.fixed) {
      if (String(v ?? "") !== String(row[k] ?? "")) problems.push(`${col.label.split(" (")[0]} is printed on the form and can't be changed.`);
      continue;
    }
    const n = normTyped(col, v, problems);
    if (n !== INVALID) next[k] = n;
  }
  return next;
}

function normRows(layout: LogSheetLayout, cur: Obj[], value: unknown[], problems: string[]): Obj[] {
  const free = layout.rowMode.kind === "free";
  const byId = new Map(cur.map((r, i) => [String(r.id), i]));
  // `out` is indexed by existing row; new rows are kept apart. Pushed onto
  // `out`, a new row listed before the existing ones took slot 0 and was then
  // overwritten by existing row 0 — silently lost.
  const out: Obj[] = [];
  const added: Obj[] = [];
  const used = new Set<number>();
  value.forEach((raw, i) => {
    if (!isObj(raw)) return;
    let idx = typeof raw.id === "string" && byId.has(raw.id) ? byId.get(raw.id)! : -1;
    if (idx < 0 && !free && i < cur.length && !used.has(i)) idx = i;
    if (idx >= 0 && !used.has(idx)) {
      used.add(idx);
      out[idx] = normRow(layout, cur[idx], raw, problems);
      return;
    }
    if (free) added.push(normRow(layout, { id: generateId("row") }, raw, problems));
  });
  if (!free) {
    if (value.length !== cur.length) problems.push("This form has a fixed set of rows, so none were added or removed — only values in the existing rows changed.");
    return cur.map((r, i) => out[i] ?? r);
  }
  // Free rows: kept rows first in their original order, then any new ones.
  const kept = cur.map((_, i) => out[i]).filter(Boolean) as Obj[];
  return [...kept, ...added];
}

// ---- matching one item in a list ------------------------------------------------

function itemMatches(item: unknown, index: number, match: Obj): boolean {
  if (!isObj(item)) return false;
  return Object.entries(match).every(([k, want]) => {
    if (k === "__row" || k === "row") return Number(want) === index + 1;
    const have = item[k];
    if (have === undefined || have === null) return false;
    const tw = normTime(want);
    const th = normTime(have);
    if (tw && th) return tw === th;
    if (typeof have === "number" || typeof want === "number") return normNumber(have) === normNumber(want);
    const a = String(have).trim().toLowerCase();
    const b = String(want).trim().toLowerCase();
    if (!b) return false;
    return a === b || (b.length >= 3 && a.includes(b)) || (a.length >= 3 && b.includes(a));
  });
}

function describeMatch(match: Obj): string {
  const parts = Object.entries(match).map(([k, v]) => `${k === "__row" || k === "row" ? "row" : humanKey(k).toLowerCase()} ${v}`);
  return parts.length ? parts.join(" and ") : "that line";
}

function applyItemEdit(layout: LogSheetLayout | undefined, next: Obj, edit: unknown, problems: string[]): void {
  if (!isObj(edit) || typeof edit.collection !== "string" || !isObj(edit.set)) {
    problems.push("One change didn't say which line to change and what to put in it, so I skipped it.");
    return;
  }
  const coll = next[edit.collection];
  if (!Array.isArray(coll)) {
    problems.push(`There's no list called "${edit.collection}" on this form.`);
    return;
  }
  const match = isObj(edit.match) ? edit.match : {};
  const hits =
    Object.keys(match).length === 0
      ? coll.length === 1
        ? [0]
        : []
      : coll.map((_, i) => i).filter((i) => itemMatches(coll[i], i, match));
  if (hits.length === 0) {
    problems.push(
      Object.keys(match).length === 0 ? "Tell me which line you mean, so I don't change the wrong one." : `I couldn't find ${describeMatch(match)} on this form, so nothing was changed there.`
    );
    return;
  }
  if (hits.length > 1 && edit.all !== true) {
    problems.push(`More than one line matches ${describeMatch(match)} — tell me which one, so I don't change the wrong line.`);
    return;
  }
  const updated = coll.slice();
  for (const i of hits) {
    updated[i] = layout && edit.collection === "rows" ? normRow(layout, updated[i] as Obj, edit.set, problems) : normObjectSet(updated[i] as Obj, edit.set, problems);
  }
  next[edit.collection] = updated;
}

// ---------------------------------------------------------------------------
// the entry point

// Fields a record may not carry yet but which the form does have.
const OPTIONAL_KEYS: Record<string, string[]> = {
  "daily-pest-monitoring": ["rodentCatches"],
};

/**
 * Applies a proposed change (from the assistant, or from a plain-words edit)
 * to a copy of the record's data, checking and normalising every value.
 * Never mutates `current`.
 */
export function applyAssistantPatch<T>(kind: string, documentId: string, current: T, patch: Obj): PatchOutcome<T> {
  const problems: string[] = [];
  const next = (clone(current) ?? {}) as unknown as Obj;
  const layout = kind === "log-sheet" ? getLogSheetLayout(documentId) : undefined;
  const { itemEdits, _layout, ...fields } = isObj(patch) ? patch : ({} as Obj);
  void _layout;

  for (const [key, value] of Object.entries(fields)) {
    if (!(key in next) && !(OPTIONAL_KEYS[kind] ?? []).includes(key)) {
      problems.push(`"${key}" isn't a field on this form, so I left it out.`);
      continue;
    }
    const cur = next[key];
    if (kind === "daily-pest-monitoring" && key === "checkpoints") {
      next[key] = normCheckpoints(isObj(cur) ? cur : {}, value, problems);
      continue;
    }
    if (layout && key === "header") {
      next[key] = normHeader(layout, isObj(cur) ? cur : {}, value, problems);
      continue;
    }
    if (layout && key === "rows") {
      if (!Array.isArray(value)) {
        problems.push("Rows have to be given as a list, so I left them unchanged.");
        continue;
      }
      next[key] = normRows(layout, Array.isArray(cur) ? (cur as Obj[]) : [], value, problems);
      continue;
    }
    if (isObj(cur)) {
      if (isObj(value)) next[key] = normObjectSet(cur, value, problems);
      else problems.push(`${humanKey(key)} has several parts, so I left it unchanged.`);
      continue;
    }
    if (Array.isArray(cur) || (cur === undefined && Array.isArray(value))) {
      if (Array.isArray(value)) next[key] = normArray(key, (cur as unknown[]) ?? [], value, problems);
      else problems.push(`${humanKey(key)} is a list, so I left it unchanged.`);
      continue;
    }
    const n = normPlain(key, value, cur, problems);
    if (n !== INVALID) next[key] = n;
  }

  if (Array.isArray(itemEdits)) for (const edit of itemEdits) applyItemEdit(layout, next, edit, problems);
  if (kind === "service-report" && isObj(current)) next.lines = serviceLinesAfterPatch(documentId, current.lines, next.lines, problems);
  return { data: next as unknown as T, problems };
}

// A service report's material and method are fixed for each area, and its
// quantity is entered once per material (engine/serviceMaterials.ts). So a
// proposed change to a material or a method is refused, and a quantity given
// for any line becomes the quantity of every line with that material.
function serviceLinesAfterPatch(documentId: string, before: unknown, after: unknown, problems: string[]): unknown {
  if (!Array.isArray(after)) return after;
  const was = new Map((Array.isArray(before) ? before : []).filter(isObj).map((l) => [Number(l.slNo), l] as const));
  let refused = false;
  const lines: Obj[] = after.filter(isObj).map((l) => {
    const out: Obj = { ...l };
    const prev = was.get(Number(l.slNo));
    if (!prev) return out;
    for (const k of ["materialName", "methodOfApplication"]) {
      if (String(out[k] ?? "") === String(prev[k] ?? "")) continue;
      out[k] = prev[k];
      refused = true;
    }
    return out;
  });
  if (refused) problems.push("Material name and method of application are fixed for this service (they follow the SOP / Chemical Master), so they weren't changed.");
  for (const l of lines) {
    const prev = was.get(Number(l.slNo));
    if (!prev || String(l.qtyUsed ?? "") === String(prev.qtyUsed ?? "")) continue;
    const first = lines.find((x) => x.materialName === l.materialName);
    if (first && first !== l) first.qtyUsed = l.qtyUsed;
  }
  return normalizeServiceLines(documentRepository.getById(documentId)?.variantKey, lines as unknown as ServiceReportAreaLine[]);
}

/** The labels printed on a log sheet, for readable change history. */
export function fieldLabels(kind: string, documentId: string): Record<string, string> {
  if (kind !== "log-sheet") return {};
  const layout = getLogSheetLayout(documentId);
  if (!layout) return {};
  const out: Record<string, string> = {};
  for (const f of layoutFields(layout)) out[f.key] = f.label;
  for (const c of layout.columns) out[c.key] = c.label;
  return out;
}

// ---------------------------------------------------------------------------
// plain-words edits, understood locally

/** Does this read as an instruction to change something (rather than a question)? */
export function looksLikeEdit(text: string): boolean {
  return /\b(set|change|make|update|correct|fix|put|enter|mark|replace|should be|instead of|wrong|galat)\b/i.test(text);
}

const LEAD = /^(?:(?:please|pls|kindly|can you|could you|would you)\s+)*(?:set|change|make|update|correct|fix|put|enter|mark|record|write|fill(?:\s+in)?)?\s*(?:the\s+)?/i;

/** "change 14:00 viscosity to 20.4" -> { target: "14:00 viscosity", value: "20.4" }. */
export function splitInstruction(text: string): { target: string; value: string } | null {
  const s = text.trim().replace(/[.!]+$/, "").replace(LEAD, "").trim();
  const m = s.match(/^(.+?)(?:\s+(?:to|is|was|as|should be|becomes)\s+|\s*=\s*|\s+:\s+)(.+)$/i);
  if (!m) return null;
  const target = m[1].trim();
  const value = m[2].trim().replace(/^["']|["']$/g, "");
  return target && value ? { target, value } : null;
}

const STOP = new Set(["the", "of", "a", "an", "for", "at", "in", "on", "by", "to", "is", "was", "no", "number", "hrs", "hr", "sec", "mm"]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/[^a-z0-9઀-૿]+/g, " ")
    .split(" ")
    .filter((w) => w && !STOP.has(w));
}

/** Share of the target's words found in a candidate's name (1 = every word matched). */
function precision(target: string[], candidate: string[]): number {
  if (target.length === 0 || candidate.length === 0) return 0;
  return target.filter((w) => candidate.includes(w)).length / target.length;
}
/** Share of the candidate's name words the target mentions. */
function recall(target: string[], candidate: string[]): number {
  if (candidate.length === 0) return 0;
  return candidate.filter((w) => target.includes(w)).length / candidate.length;
}

/** The single best candidate, or null when nothing fits or two fit equally well. */
function best<T>(items: T[], score: (t: T) => number, floor: number): T | null {
  let top: T | null = null;
  let topScore = floor;
  let tie = false;
  for (const it of items) {
    const s = score(it);
    if (s > topScore + 1e-9) {
      top = it;
      topScore = s;
      tie = false;
    } else if (top && Math.abs(s - topScore) < 1e-9) tie = true;
  }
  return tie ? null : top;
}

function extractTime(target: string): { time: string; rest: string } | null {
  const m = target.match(/\b(\d{1,2}[:.]\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm)|\d{1,2}\s*o'?\s*clock)\b/i);
  if (!m) return null;
  const time = normTime(m[1]);
  return time ? { time, rest: target.replace(m[0], " ") } : null;
}

const SYNONYMS: Record<string, string[]> = {
  customerSign: ["customer", "customer sign", "customer signature", "customer representative"],
  technicianSign: ["technician", "technician sign", "gpc technician"],
  timeOfChecking: ["time of checking", "checking time", "time"],
  checker: ["checker", "checked by"],
  trainerProvider: ["trainer", "provider"],
  certificateRef: ["certificate", "certificate reference", "reference"],
  complaintNo: ["complaint no", "complaint number"],
  poNo: ["po", "po no", "po number"],
  monthYear: ["month year", "month"],
  isHoliday: ["holiday"],
  contactPerson: ["contact", "contact person"],
  premisesName: ["premises", "premises name"],
  premisesAddress: ["address", "premises address"],
  complaintReceivedDate: ["received date", "complaint received date", "complaint date"],
};

function scalarFieldEdit(tt: string[], value: string, data: Obj): Obj | null {
  const keys = Object.keys(data).filter((k) => k !== "id" && !isObj(data[k]) && !Array.isArray(data[k]));
  const scoreOf = (k: string) =>
    Math.max(...[humanKey(k), ...(SYNONYMS[k] ?? [])].map((n) => (precision(tt, tokens(n)) >= 0.999 ? 1 + recall(tt, tokens(n)) : 0)));
  const k = best(keys, scoreOf, 1);
  return k ? { [k]: value } : null;
}

function flyEdit(target: string, value: string, data: Obj): Obj | null {
  const m = target.match(/\bpc\s*-?\s*(\d{1,2})\b/i);
  if (!m) return null;
  const pcId = `PC-${m[1].padStart(2, "0")}`;
  const entries = Array.isArray(data.entries) ? data.entries : [];
  if (!entries.some((e) => isObj(e) && e.pcId === pcId)) return null;
  const rest = tokens(target.replace(m[0], " "));
  let key: string | null = null;
  if (rest.length === 0 || rest.some((w) => ["count", "flies", "fly", "catch", "caught"].includes(w))) key = "catchCountApprox";
  if (rest.some((w) => w.startsWith("clean"))) key = "cleaningDoneBy";
  if (rest.some((w) => w.startsWith("verif"))) key = "verifiedBy";
  if (rest.some((w) => w.startsWith("install"))) key = "tubeLightInstallDate";
  if (rest.includes("due") || rest.some((w) => w.startsWith("replace"))) key = "tubeLightDueDate";
  return key ? { itemEdits: [{ collection: "entries", match: { pcId }, set: { [key]: value } }] } : null;
}

function logSheetEdit(layout: LogSheetLayout, target: string, tt: string[], value: string, data: Obj): Obj | null {
  const rows = Array.isArray(data.rows) ? (data.rows as Obj[]) : [];
  const editableCols = layout.columns.filter((c) => !c.fixed);
  const columnFor = (words: string[]): LogColumn | null =>
    best(editableCols, (c) => {
      const p = Math.max(precision(words, tokens(c.label)), precision(words, tokens(humanKey(c.key))));
      return p >= 0.999 ? 1 + recall(words, tokens(c.label)) : 0;
    }, 1);
  const mode = layout.rowMode;

  // One reading at one time of day ("viscosity at 14:00", "11 o'clock").
  if (mode.kind === "timeSlots") {
    const t = extractTime(target);
    if (t && rows.some((r) => normTime(r[mode.slotKey]) === t.time)) {
      const words = tokens(t.rest);
      const col = words.length ? columnFor(words) : editableCols.find((c) => c.type === "number") ?? null;
      if (col) return { itemEdits: [{ collection: "rows", match: { [mode.slotKey]: t.time }, set: { [col.key]: value } }] };
    }
  }

  // "row 2 line speed is 90" on a form with free rows.
  const rowRef = target.match(/\b(?:row|line)\s*(\d{1,3})\b/i);
  if (rowRef) {
    const n = Number(rowRef[1]);
    const col = columnFor(tokens(target.replace(rowRef[0], " ")));
    if (col && n >= 1 && n <= rows.length) return { itemEdits: [{ collection: "rows", match: { __row: n }, set: { [col.key]: value } }] };
  }

  // Header / footer fields by their printed label ("operator name", "lot status").
  const headerHit = best(
    layoutFields(layout),
    (f) => (precision(tt, tokens(f.label)) >= 0.999 ? 1 + recall(tt, tokens(f.label)) : 0),
    1
  );

  // A printed test parameter ("leak test is fail", "registration grade is B").
  let paramEdit: Obj | null = null;
  let paramScore = 0;
  if (mode.kind === "fixedRows") {
    const paramKey = layout.columns.find((c) => c.fixed && c.key === "parameter") ? "parameter" : null;
    if (paramKey) {
      const scored = rows.map((r, i) => ({ i, s: recall(tt, tokens(String(r[paramKey] ?? ""))) }));
      const top = best(scored, (x) => x.s, 0.5);
      if (top) {
        const leftover = tt.filter((w) => !tokens(String(rows[top.i][paramKey] ?? "")).includes(w));
        const col = (leftover.length ? columnFor(leftover) : null) ?? editableCols[0] ?? null;
        if (col) {
          paramEdit = { itemEdits: [{ collection: "rows", match: { __row: top.i + 1 }, set: { [col.key]: value } }] };
          paramScore = 1 + top.s;
        }
      }
    }
  }

  // A single-row form (the hot-room temperature record): its columns directly.
  let singleEdit: Obj | null = null;
  if (mode.kind === "single") {
    const col = columnFor(tt);
    if (col) singleEdit = { itemEdits: [{ collection: "rows", match: {}, set: { [col.key]: value } }] };
  }

  const headerScore = headerHit ? 1 + recall(tt, tokens(headerHit.label)) : 0;
  if (paramEdit && paramScore > headerScore) return paramEdit;
  if (headerHit) return { header: { [headerHit.key]: value } };
  return paramEdit ?? singleEdit;
}

const SERVICE_FIELDS: [string, string[]][] = [
  ["qtyUsed", ["qty", "quantity", "used"]],
  ["remarks", ["remark", "remarks", "note"]],
  ["materialName", ["material", "chemical"]],
  ["methodOfApplication", ["method", "application"]],
];

function serviceEdit(tt: string[], value: string, data: Obj): Obj | null {
  const lines = Array.isArray(data.lines) ? (data.lines as Obj[]) : [];
  const field = SERVICE_FIELDS.find(([, words]) => tt.some((w) => words.includes(w)));
  if (!field) return null;
  const areaWords = tt.filter((w) => !field[1].includes(w) && w !== "area" && w !== "line");
  const lineNo = tt.find((w) => /^\d+$/.test(w));
  let line: Obj | null = null;
  if (areaWords.length && !(areaWords.length === 1 && lineNo)) {
    line = best(lines, (l) => (precision(areaWords, tokens(String(l.areaName ?? ""))) >= 0.999 ? 1 + recall(areaWords, tokens(String(l.areaName ?? ""))) : 0), 1);
  } else if (lineNo) {
    line = lines.find((l) => Number(l.slNo) === Number(lineNo)) ?? null;
  } else if (field[0] === "qtyUsed") {
    // "quantity is 4": the quantity is entered once, on the first line, and
    // holds for every line with that material (engine/serviceMaterials.ts).
    line = lines[0] ?? null;
  }
  return line ? { itemEdits: [{ collection: "lines", match: { slNo: line.slNo }, set: { [field[0]]: value } }] } : null;
}

const FINDING_FIELDS: [string, string[]][] = [
  ["correctiveActionContractor", ["contractor"]],
  ["targetDate", ["target"]],
  ["actualDateOfAction", ["actual", "completed", "done"]],
  ["correctiveActionClient", ["action", "corrective"]],
  ["commentsOnFindings", ["comment", "comments"]],
  ["verifiedByServiceProvider", ["verified"]],
  ["source", ["source"]],
  ["status", ["status"]],
  ["findingOfInspection", ["text", "description", "finding"]],
];

function findingEdit(target: string, value: string, data: Obj): Obj | null {
  const m = target.match(/\bfinding\s*(?:no\.?\s*)?(\d{1,3})\b/i);
  if (!m) return null;
  const sNo = Number(m[1]);
  const findings = Array.isArray(data.findings) ? (data.findings as Obj[]) : [];
  if (!findings.some((f) => Number(f.sNo) === sNo)) return null;
  const rest = tokens(target.replace(m[0], " "));
  const key = (FINDING_FIELDS.find(([, words]) => rest.some((w) => words.includes(w))) ?? ["findingOfInspection"])[0];
  return { itemEdits: [{ collection: "findings", match: { sNo }, set: { [key]: value } }] };
}

function attendanceEdit(text: string, data: Obj): Obj | null {
  const m = text.match(/^(.+?)\s+(?:was\s+|is\s+)?(attended|present|absent|did not attend|didn'?t attend|not attended)$/i);
  if (!m) return null;
  const who = tokens(m[1]);
  const attendees = Array.isArray(data.attendees) ? (data.attendees as Obj[]) : [];
  const hit = best(attendees, (a) => (precision(who, tokens(String(a.employeeName ?? ""))) >= 0.999 ? 1 : 0), 0.5);
  if (!hit) return null;
  const attended = /^(attended|present)$/i.test(m[2]);
  return { itemEdits: [{ collection: "attendees", match: { employeeName: hit.employeeName }, set: { attended } }] };
}

/**
 * Turns a plain-words instruction into a proposed change for the open record,
 * or null when it isn't confident — in which case the AI model is asked. The
 * result still goes through applyAssistantPatch like any other change.
 */
export function parseLocalEdit(kind: string, documentId: string, data: unknown, text: string): Obj | null {
  if (!isObj(data)) return null;
  const clean = text.trim().replace(/[.!]+$/, "");

  if (kind === "daily-pest-monitoring") {
    // Any answer is taken here — applyAssistantPatch then keeps a Yes/No and
    // refuses anything else with the reason, without needing the AI service.
    const cp = clean.match(/\b(?:check\s*-?\s*points?|cp)\s*(?:no\.?\s*)?(\d{1,2})\s*(?:(?:to|is|was|as|=|:)\s*)?([^\s].*?)\s*$/i);
    if (cp && Number(cp[1]) >= 1 && Number(cp[1]) <= 10) return { checkpoints: { [cp[1]]: cp[2] } };
  }
  if (kind === "training") {
    const att = attendanceEdit(clean, data);
    if (att) return att;
  }

  const split = splitInstruction(clean);
  if (!split) return null;
  const { target, value } = split;
  const tt = tokens(target);
  if (tt.length === 0) return null;

  if (kind === "fly-catcher") {
    const r = flyEdit(target, value, data);
    if (r) return r;
  }
  if (kind === "log-sheet") {
    const layout = getLogSheetLayout(documentId);
    if (layout) {
      const r = logSheetEdit(layout, target, tt, value, data);
      if (r) return r;
    }
  }
  if (kind === "service-report") {
    const r = serviceEdit(tt, value, data);
    if (r) return r;
  }
  if (kind === "gap") {
    const r = findingEdit(target, value, data);
    if (r) return r;
  }
  return scalarFieldEdit(tt, value, data);
}
