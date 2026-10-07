// THE PLAN BEFORE THE WRITE (REQUIREMENTS §94).
//
// A fill is planned on a COPY of the record first: the values the person said
// (read by DCRS's rules, engine/fillRequest.ts, or by one small model call)
// are checked against their words, put into DCRS's own patch, applied by
// DCRS's own checker (engine/recordPatch.ts applyAssistantPatch) and compared
// with the record as it stands (engine/recordHistory.ts diffRecordData). The
// result is a list of lines, "label: before → after", each marked when it
// records a finding or a reading out of the form's limits — and nothing has
// been opened, started or written. Only when that list holds at least one
// change does anything happen to a record; so a model call that fails, an
// allowance that is spent, or a person who says No never leaves a record
// opened and unfilled.
//
// THE RULES THAT KEEP IT TO WHAT THE PERSON SAID:
//   * a number must be in their words (digits in any script);
//   * a name in a name or sign box must be in their words, word by word, in
//     any script, and a signature is never written otherwise;
//   * a select option must be said by a word of its own (ECHO, dry);
//   * a time must be said ("2 pm" is 14:00), a date said or the day's own;
//   * when the rules read "all fine" (F/HR/17), the model's "not ok" for a
//     check point the person did not name is dropped ("left as fine");
//   * "ok" on check point 4 (a count of traps) is dropped silently.
//
// The same functions run in the browser (components/mitra/useMitraFill.ts) and
// in DCRS's engine on the server for the phone (engineHost/entry.ts, the
// /api/v1/fill routes), so both apps plan and write the same fill.
import type { DocumentDefinition, LogColumn, LogHeaderField, LogSheetData, LogSheetLayout, RecordInstance } from "../types";
import type { AssistantTarget } from "../store/AssistantContext";
import { documentRepository } from "../data/repositories/documentRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { getLogSheetLayoutForRecord } from "../data/seed/logSheetLayouts";
import { applyAssistantPatch, fieldLabels, normDate, normTime } from "./recordPatch";
import { diffRecordData } from "./recordHistory";
import { createDefaultData } from "./recordDefaults";
import { createRecordForDocument } from "./recordCrud";
import { isEditableStatus, saveDraft, submitRecord } from "./recordLifecycle";
import { withComputedCells } from "./computedCells";
import { sampleFillRecord, SAMPLE_FILL_NOTE, fillBlanks, canSampleFill } from "./sampleFill";
import { latestConfirmedRecord } from "./assistantPrepare";
import { bindingsForRecord } from "./roundTrip/bindingsFor";
import { getAtPath } from "./roundTrip/bindPath";
import { isSignField, formatAndName } from "./fillCard";
import { canon, datesSaid, identityField, numbersSaid, timesSaid, wordsOf, dayRecordOf, type FillValues, type RulesReading } from "./fillRequest";
import { boxesSay, fillSay, type FillLanguage } from "../i18n/fillPhrases";
import { formatDisplayDate, todayISO } from "../utils/date";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));
const blank = (v: unknown): boolean => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

export type FillFlag = "finding" | "limits" | "estimate";

export interface FillLine {
  label: string;
  before: string;
  after: string;
  flag?: FillFlag;
}

export interface FillPlan {
  doc: DocumentDefinition;
  /** The record the values go on; null when one is started for them. */
  record: RecordInstance | null;
  dateISO: string;
  willStart: boolean;
  identity: { key: string; label: string; value: string } | null;
  mode: "values" | "sample" | "copy";
  /** What DCRS's checker is given: positional, so it applies the same to a record started later. */
  patch: Obj;
  lines: FillLine[];
  /** More lines than are listed. */
  moreLines: number;
  /** Plain words: what was left out, and why. */
  refused: string[];
  /** Required boxes still blank on what was touched. */
  missing: string[];
  /** The record holds the app's estimates (engine/assistantPrepare.ts). */
  prepared: { at: string; time: string; basedOn: string } | null;
  /** How many lines are findings or out of limits — asked before they are written. */
  flagged: number;
  submitAsked: boolean;
  /** "Copy from …": the record copied from. */
  copiedFrom?: { recordId: string; dateISO: string };
}

/** What the record's lines are called, kept short. */
export const MAX_PLAN_LINES = 60;

// ---------------------------------------------------------------------------
// which record

export interface RecordChoice {
  recordId: string;
  label: string;
}

export type ResolvedRecord =
  | { kind: "record"; record: RecordInstance | null }
  | { kind: "choose"; choices: RecordChoice[] }
  | { kind: "locked"; record: RecordInstance };

/** "ECHO" from "GJ02ZZ6403 – ECHO": the vehicle as people say it. */
export function shortIdentity(value: string): string {
  const v = value.trim();
  const parts = v.split(/\s+[–-]\s+/);
  return parts.length > 1 ? parts.slice(1).join(" ") : v;
}

const identityOf = (record: RecordInstance, key: string): string => {
  const header = isObj(record.data) && isObj((record.data as Obj).header) ? ((record.data as Obj).header as Obj) : {};
  return String(header[key] ?? "").trim();
};

/**
 * THE RECORD A FILL GOES ON. A record named or open is that one. A document
 * that keeps one record per thing (F/DISP/04, a vehicle) is looked up by the
 * thing: the day's record of THAT vehicle, else a blank one of that day not
 * yet given a vehicle, else none (a new one is started) — a different vehicle
 * never goes onto another vehicle's record. Without the thing said, two
 * records that day are a question naming each by its vehicle and date. Any
 * other document: the record of that day (its period). A record that is not
 * open for writing is refused here, before any card or write.
 */
export function resolveFillRecord(
  doc: DocumentDefinition,
  dateISO: string,
  identity: { key: string; value: string } | null,
  opts: { isDemo: boolean; recordId?: string | null }
): ResolvedRecord {
  const locked = (r: RecordInstance | null): ResolvedRecord => (r && !isEditableStatus(r.status) ? { kind: "locked", record: r } : { kind: "record", record: r });
  if (opts.recordId) {
    const r = recordRepository.getById(opts.recordId);
    if (r && r.documentId === doc.id) {
      const idField = identityField(doc);
      // A different vehicle said on an open record: never written over it.
      if (!(idField && identity && identityOf(r, idField.key) && identityOf(r, idField.key) !== identity.value)) return locked(r);
    }
  }
  const idField = identityField(doc);
  if (!idField) return locked(dayRecordOf(doc, dateISO, opts.isDemo));
  const day = recordRepository
    .query({ documentId: doc.id, isDemo: opts.isDemo })
    .filter((r) => r.dueDate === dateISO)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  if (identity) {
    const same = day.filter((r) => identityOf(r, idField.key) === identity.value);
    const open = same.find((r) => isEditableStatus(r.status));
    if (open) return { kind: "record", record: open };
    if (same.length) return { kind: "locked", record: same[0] };
    const unnamed = day.find((r) => !identityOf(r, idField.key) && isEditableStatus(r.status));
    return { kind: "record", record: unnamed ?? null };
  }
  if (day.length === 0) return { kind: "record", record: null };
  if (day.length === 1) return locked(day[0]);
  return {
    kind: "choose",
    choices: day.slice(0, 6).map((r) => ({ recordId: r.id, label: `${shortIdentity(identityOf(r, idField.key)) || "-"} · ${formatDisplayDate(r.dueDate)} · ${r.status}` })),
  };
}

// ---------------------------------------------------------------------------
// merging the rules' reading with the model's

/**
 * The rules' values and the model's, as one: on a check point the rules win
 * (they read "all fine" right in three languages; the model, in the live probe,
 * read "બધું બરાબર છે" as nine problems); elsewhere the rules win where both
 * gave a box, and the model adds what the rules left.
 */
export function mergeValues(rules: FillValues | null | undefined, model: FillValues | null | undefined): FillValues {
  const r = rules ?? {};
  const m = model ?? {};
  const out: FillValues = {};
  const mergeObj = (a?: Obj, b?: Obj): Obj | undefined => (a || b ? { ...(b ?? {}), ...(a ?? {}) } : undefined);
  out.header = mergeObj(r.header, m.header);
  out.fields = mergeObj(r.fields, m.fields);
  out.checks = mergeObj(r.checks as Obj | undefined, m.checks as Obj | undefined);
  if (r.slots || m.slots) {
    out.slots = {};
    for (const [t, v] of Object.entries(m.slots ?? {})) out.slots[t] = { ...v };
    for (const [t, v] of Object.entries(r.slots ?? {})) out.slots[t] = { ...(out.slots[t] ?? {}), ...v };
  }
  out.rows = r.rows?.length ? r.rows.map((row, i) => ({ ...(m.rows?.[i] ?? {}), ...row })) : m.rows;
  if (r.itemEdits?.length) out.itemEdits = r.itemEdits;
  out.submit = !!(r.submit || m.submit);
  if (m.unclear) out.unclear = m.unclear;
  for (const k of Object.keys(out) as (keyof FillValues)[]) if (out[k] === undefined) delete out[k];
  return out;
}

// ---------------------------------------------------------------------------
// grounding: only what the person said

interface Ground {
  words: string;
  wordSet: Set<string>;
  canonSet: Set<string>;
  numbers: number[];
  times: string[];
  dates: string[];
  dateISO: string;
  dateSaid: boolean;
  lang: FillLanguage;
  refused: string[];
}

function groundOf(words: string, dateISO: string, dateSaid: boolean, lang: FillLanguage, today: string): Ground {
  const ws = wordsOf(words);
  return {
    words,
    wordSet: new Set(ws),
    canonSet: new Set(ws.map(canon)),
    numbers: numbersSaid(words),
    times: timesSaid(words),
    dates: datesSaid(words, today),
    dateISO,
    dateSaid,
    lang,
    refused: [],
  };
}

type FieldLike = { key: string; label: string; type: string; options?: string[]; autoFill?: { sign?: boolean }; min?: number; max?: number };

const labelOf = (f: Pick<FieldLike, "label" | "key">): string => f.label.split(" (")[0] || f.key;

/** Whether a value is in the person's words, by its type (see the header). */
function said(value: unknown, f: FieldLike | null, g: Ground): boolean {
  if (value === null || value === undefined || value === "") return true;
  const text = String(value).trim();
  const type = f?.type ?? (typeof value === "number" ? "number" : "text");
  if (type === "number" || typeof value === "number") {
    const nums = numbersSaid(text);
    return nums.length > 0 && nums.every((n) => g.numbers.some((x) => Math.abs(x - n) < 1e-9));
  }
  if (type === "time") {
    const t = normTime(text);
    return !!t && (g.times.includes(t) || g.words.includes(text));
  }
  if (type === "date") {
    const d = normDate(text, g.dateISO);
    return !!d && (g.dates.includes(d) || (g.dateSaid && d === g.dateISO));
  }
  if (type === "select") {
    const opts = f?.options ?? [];
    const opt = opts.find((o) => o.toLowerCase() === text.toLowerCase()) ?? opts.find((o) => o.toLowerCase().includes(text.toLowerCase())) ?? text;
    const toks = wordsOf(opt).map(canon).filter((t) => t.length >= 2);
    return toks.some((t) => g.canonSet.has(t) || g.wordSet.has(t));
  }
  if (type === "yesno") {
    return /holiday|छुट्टी|રજા|chutti|raja/i.test(g.words) || g.wordSet.has(text.toLowerCase());
  }
  // Text: every word of it in the words, in any script.
  const toks = wordsOf(text).filter((t) => t.length >= 2 || /\d/.test(t));
  if (toks.length === 0) return true;
  return toks.every((t) => g.wordSet.has(t) || g.canonSet.has(canon(t)));
}

function groundField(value: unknown, f: FieldLike | null, label: string, g: Ground): boolean {
  if (said(value, f, g)) return true;
  g.refused.push(fillSay(g.lang, "leftOutUnsaid", { label }));
  return false;
}

// ---------------------------------------------------------------------------
// the fixed shape onto DCRS's patch

/** The kind DCRS's checker is told the record is (what each page registers, store/AssistantContext.tsx). */
export function patchKindOf(doc: DocumentDefinition): string {
  return doc.kind === "gap-inspection" ? "gap" : doc.kind === "training-record" ? "training" : doc.kind;
}

const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

function findField<T extends { key: string; label: string }>(list: readonly T[], key: string): T | undefined {
  const k = norm(key);
  return list.find((f) => norm(f.key) === k) ?? list.find((f) => norm(f.label.split(" (")[0]) === k) ?? list.find((f) => norm(f.label) === k);
}

const writableCol = (c: LogColumn): boolean => !c.fixed && !c.computed && !c.linkedFrom;

/**
 * The fixed shape (FillValues) as DCRS's patch, each value checked against the
 * person's words on the way (grounding, see the header). Values that are not
 * on the form, or not said, are left out with the reason in `refused`.
 */
export function valuesToPatch(
  doc: DocumentDefinition,
  record: RecordInstance | null,
  values: FillValues,
  opts: { words: string; dateISO: string; dateSaid: boolean; lang: FillLanguage; rules?: RulesReading | null; model?: FillValues | null; today?: string }
): { patch: Obj; refused: string[] } {
  const g = groundOf(opts.words, opts.dateISO, opts.dateSaid, opts.lang, opts.today ?? todayISO());
  const patch: Obj = {};
  const rv = opts.rules?.values;
  const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b) || String(a ?? "") === String(b ?? "");
  // A value the RULES read from the words is the person's own; anything else is checked against them.
  const ruled = (part: Obj | undefined, key: string, v: unknown): boolean => !!part && key in part && same(part[key], v);

  if (doc.kind === "log-sheet") {
    const layout = getLogSheetLayoutForRecord(doc.id, record);
    if (!layout) return { patch, refused: [] };
    const boxes = [...layout.headerFields, ...(layout.footerFields ?? [])].filter((f) => !f.computed);
    const cols = layout.columns.filter(writableCol);
    const header: Obj = {};
    const putBox = (k: string, v: unknown) => {
      const f = findField(boxes, k);
      if (!f) {
        if (!blank(v)) g.refused.push(fillSay(g.lang, "leftOutUnsaid", { label: k }));
        return;
      }
      if (ruled(rv?.header, f.key, v) || ruled(rv?.header, k, v) || ruled(rv?.fields, k, v)) {
        header[f.key] = v;
        return;
      }
      // A signature only when its name was said.
      if (isSignField(f) && !said(v, { ...f, type: "text" }, g)) {
        g.refused.push(fillSay(g.lang, "leftOutUnsaid", { label: labelOf(f) }));
        return;
      }
      if (groundField(v, f, labelOf(f), g)) header[f.key] = v;
    };
    for (const [k, v] of Object.entries(values.header ?? {})) putBox(k, v);
    for (const [k, v] of Object.entries(values.fields ?? {})) putBox(k, v);
    if (Object.keys(header).length) patch.header = header;

    const mapRow = (row: Obj, label: string, rulePart: Obj | undefined): Obj => {
      const set: Obj = {};
      for (const [k, v] of Object.entries(row)) {
        const c = findField(cols, k);
        if (!c || blank(v)) continue;
        if (ruled(rulePart, c.key, v) || ruled(rulePart, k, v)) {
          set[c.key] = v;
          continue;
        }
        if (isSignField(c) && !said(v, { ...c, type: "text" }, g)) {
          g.refused.push(fillSay(g.lang, "leftOutUnsaid", { label: `${label}${labelOf(c)}` }));
          continue;
        }
        if (groundField(v, c, `${label}${labelOf(c)}`, g)) set[c.key] = v;
      }
      return set;
    };
    const itemEdits: Obj[] = [];
    const mode = layout.rowMode;
    for (const [time, setRaw] of Object.entries(values.slots ?? {})) {
      if (!isObj(setRaw) || Object.keys(setRaw).length === 0) continue; // the probe's empty {"14:00": {}}: nothing said
      if (mode.kind !== "timeSlots") {
        g.refused.push(fillSay(g.lang, "leftOutUnsaid", { label: time }));
        continue;
      }
      const t = normTime(time) ?? time;
      const rulePart = rv?.slots?.[t] as Obj | undefined;
      if (!rulePart && !g.times.includes(t)) {
        g.refused.push(fillSay(g.lang, "leftOutUnsaid", { label: t }));
        continue;
      }
      const set = mapRow(setRaw, `${t} · `, rulePart);
      if (Object.keys(set).length) itemEdits.push({ collection: "rows", match: { [mode.slotKey]: t }, set });
    }
    const addRows: Obj[] = [];
    (values.rows ?? []).forEach((row, i) => {
      if (!isObj(row)) return;
      const rulePart = rv?.rows?.[i] as Obj | undefined;
      if (mode.kind === "timeSlots") {
        const slotVal = row[mode.slotKey] ?? row.time;
        const t = slotVal ? normTime(slotVal) : null;
        if (!t || !g.times.includes(t)) return;
        const { [mode.slotKey]: _s, time: _t, ...rest } = row;
        void _s;
        void _t;
        const set = mapRow(rest, `${t} · `, rulePart);
        if (Object.keys(set).length) itemEdits.push({ collection: "rows", match: { [mode.slotKey]: t }, set });
        return;
      }
      if (mode.kind === "fixedRows") {
        const n = Number(row.row ?? row.no);
        if (!Number.isInteger(n) || n < 1) return;
        const { row: _r, no: _n, ...rest } = row;
        void _r;
        void _n;
        const set = mapRow(rest, `${n} · `, rulePart);
        if (Object.keys(set).length) itemEdits.push({ collection: "rows", match: { row: n }, set });
        return;
      }
      const set = mapRow(row, "", rulePart);
      if (Object.keys(set).length === 0) return;
      if (mode.kind === "single") itemEdits.push({ collection: "rows", match: {}, set });
      else addRows.push(set);
    });
    for (const e of values.itemEdits ?? []) itemEdits.push(e as unknown as Obj);
    if (itemEdits.length) patch.itemEdits = itemEdits;
    if (addRows.length) patch.addRows = addRows;
    return { patch, refused: g.refused };
  }

  if (doc.kind === "daily-pest-monitoring") {
    const master = masterRepository.get();
    const checks: Obj = {};
    const allFine = !!opts.rules?.allFine;
    const named = new Set(opts.rules?.namedPoints ?? []);
    const ruleChecks = (rv?.checks ?? {}) as Obj;
    const isProblem = (n: number, raw: unknown): boolean => {
      const s = String(raw ?? "").trim().toLowerCase();
      const cp = master.checkpoints.find((c) => Number(c.no) === n);
      return s === "not ok" || s === "notok" || s === "not okay" || (!!cp?.flagWhen && s === cp.flagWhen.toLowerCase());
    };
    // The model's "not ok" the rules overruled ("all fine" said, the point not named): said so.
    if (allFine && opts.model?.checks) {
      for (const [k, raw] of Object.entries(opts.model.checks)) {
        const n = Number(k);
        if (k in ruleChecks && !named.has(n) && isProblem(n, raw) && !isProblem(n, ruleChecks[k])) g.refused.push(fillSay(g.lang, "leftAsFine", { label: checkpointLabel(n) }));
      }
    }
    for (const [k, raw] of Object.entries(values.checks ?? {})) {
      const n = Number(k);
      const cp = master.checkpoints.find((c) => Number(c.no) === n);
      if (!cp) continue;
      const fromRule = ruled(ruleChecks, k, raw);
      if (cp.responseType === "number") {
        // A count only from a count; "ok" on check point 4 is dropped without a word.
        if (typeof raw === "number" || /^\s*\d+\s*$/.test(String(raw))) {
          if (fromRule || groundField(raw, { key: k, label: `Check point ${n}`, type: "number" }, `Check point ${n}`, g)) checks[k] = raw;
        }
        continue;
      }
      if (!fromRule && allFine && !named.has(n) && isProblem(n, raw)) {
        g.refused.push(fillSay(g.lang, "leftAsFine", { label: checkpointLabel(n) }));
        continue;
      }
      checks[k] = raw;
    }
    if (Object.keys(checks).length) patch.checkpoints = checks;
    const fields = { ...(values.header ?? {}), ...(values.fields ?? {}) };
    const known: Record<string, FieldLike> = {
      checker: { key: "checker", label: "Checker", type: "text", autoFill: { sign: true } },
      timeofchecking: { key: "timeOfChecking", label: "Time of checking", type: "time" },
      isholiday: { key: "isHoliday", label: "Holiday", type: "yesno" },
    };
    for (const [k, v] of Object.entries(fields)) {
      const f = known[norm(k)] ?? known[norm(k).replace(/time$/, "timeofchecking")];
      if (!f || blank(v)) continue;
      if (ruled(rv?.fields, f.key, v) || groundField(v, f, f.label, g)) patch[f.key] = v;
    }
    if (values.itemEdits?.length) patch.itemEdits = values.itemEdits;
    return { patch, refused: g.refused };
  }

  // Any other form: its own fields, top level.
  const data = record?.data ?? createDefaultData(doc, opts.dateISO, masterRepository.get());
  const keys = isObj(data) ? Object.keys(data) : [];
  for (const [k, v] of Object.entries({ ...(values.header ?? {}), ...(values.fields ?? {}) })) {
    const key = keys.find((x) => norm(x) === norm(k));
    if (!key || blank(v)) continue;
    const f: FieldLike = { key, label: key, type: /date/i.test(key) ? "date" : typeof (data as Obj)[key] === "number" ? "number" : "text" };
    if (ruled(rv?.fields, key, v) || groundField(v, f, key, g)) patch[key] = v;
  }
  if (values.itemEdits?.length) patch.itemEdits = values.itemEdits;
  return { patch, refused: g.refused };
}

// ---------------------------------------------------------------------------
// the dry run

function preparedOf(record: RecordInstance | null): FillPlan["prepared"] {
  if (!record?.prepared || !isEditableStatus(record.status)) return null;
  const at = record.prepared.at;
  const d = new Date(at);
  const time = Number.isNaN(d.getTime()) ? "" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { at, time, basedOn: record.prepared.basedOn };
}

/** Whether a record still holds the app's estimates untouched: its only history is the "prepared" entry. */
export function preparedUntouched(record: RecordInstance | null | undefined): boolean {
  if (!record?.prepared || !isEditableStatus(record.status)) return false;
  return (record.history ?? []).every((h) => h.action === "prepared");
}

/** A short form of F/HR/17's question, for a line's label. */
function checkpointLabel(n: number): string {
  const cp = masterRepository.get().checkpoints.find((c) => Number(c.no) === n);
  if (!cp) return `Check point ${n}`;
  const q = cp.text.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
  return `Check point ${n} (${q.length > 46 ? `${q.slice(0, 45)}…` : q})`;
}

const rowIdOf = (field: string): string | null => /^rows\[#([^\]]+)\]/.exec(field)?.[1] ?? null;

/** The lines of a change, with a new row's cells listed one by one, flags and readable labels. */
function linesOf(doc: DocumentDefinition, record: RecordInstance | null, before: unknown, after: unknown): FillLine[] {
  const labels = fieldLabels(doc.kind, doc.id, record ?? undefined);
  const changes = diffRecordData(before, after, labels);
  const layout: LogSheetLayout | undefined = doc.kind === "log-sheet" ? getLogSheetLayoutForRecord(doc.id, record) : undefined;
  const master = masterRepository.get();
  const out: FillLine[] = [];
  for (const c of changes) {
    if (c.after === "(row added)" && layout) {
      const id = rowIdOf(c.field);
      const row = id ? ((after as LogSheetData).rows ?? []).find((r) => r.id === id) : undefined;
      if (row) {
        for (const col of layout.columns.filter(writableCol)) {
          const v = row[col.key];
          if (blank(v)) continue;
          out.push({ label: `${c.label} · ${labelOf(col)}`, before: "", after: String(v), ...(flagOfCell(col, v) ? { flag: flagOfCell(col, v)! } : {}) });
        }
        continue;
      }
    }
    let label = c.label;
    let flag: FillFlag | undefined;
    const cp = /^checkpoints\.(\d+)\.value$/.exec(c.field);
    if (cp) {
      const n = Number(cp[1]);
      label = checkpointLabel(n);
      const def = master.checkpoints.find((x) => Number(x.no) === n);
      if (def?.flagWhen && c.after === def.flagWhen) flag = "finding";
    }
    if (layout) {
      const key = c.field.split(".").pop() ?? "";
      const col = layout.columns.find((x) => x.key === key);
      if (col && rowIdOf(c.field)) flag = flagOfCell(col, c.after) ?? flag;
    }
    out.push({ label, before: c.before === "—" ? "" : c.before, after: c.after, ...(flag ? { flag } : {}) });
  }
  return out;
}

function flagOfCell(col: LogColumn, value: unknown): FillFlag | null {
  if (col.type !== "number" || blank(value)) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if ((typeof col.min === "number" && n < col.min) || (typeof col.max === "number" && n > col.max)) return "limits";
  return null;
}

/** Required boxes still blank: the header's, and those of the lines the change touched. */
function missingOf(doc: DocumentDefinition, record: RecordInstance | null, before: unknown, after: unknown): string[] {
  if (doc.kind !== "log-sheet") return [];
  const layout = getLogSheetLayoutForRecord(doc.id, record);
  if (!layout || !isObj(after)) return [];
  const out: string[] = [];
  const header = isObj(after.header) ? (after.header as Obj) : {};
  for (const f of [...layout.headerFields, ...(layout.footerFields ?? [])]) if (f.required && !f.computed && blank(header[f.key])) out.push(labelOf(f));
  const rowsBefore = isObj(before) && Array.isArray(before.rows) ? (before.rows as Obj[]) : [];
  const rows = Array.isArray(after.rows) ? (after.rows as Obj[]) : [];
  rows.forEach((row, i) => {
    const was = rowsBefore.find((r) => r.id === row.id);
    if (was && JSON.stringify(was) === JSON.stringify(row)) return;
    for (const c of layout.columns.filter((x) => writableCol(x) && x.required)) if (blank(row[c.key])) out.push(`Row ${i + 1} · ${labelOf(c)}`);
  });
  return out.slice(0, 6);
}

/**
 * THE DRY RUN: the patch applied to a copy of the record (or of the form as a
 * new one starts), what changes, flagged; nothing written.
 */
export function planFill(
  doc: DocumentDefinition,
  record: RecordInstance | null,
  patch: Obj,
  opts: { dateISO: string; isDemo: boolean; identity?: FillPlan["identity"]; refused?: string[]; submitAsked?: boolean }
): FillPlan {
  const base = clone(record?.data ?? createDefaultData(doc, opts.dateISO, masterRepository.get()));
  const { data: next, problems } = applyAssistantPatch(patchKindOf(doc), doc.id, base, patch, record ?? undefined);
  const all = linesOf(doc, record, base, next);
  return {
    doc,
    record,
    dateISO: record?.dueDate ?? opts.dateISO,
    willStart: !record,
    identity: opts.identity ?? null,
    mode: "values",
    patch,
    lines: all.slice(0, MAX_PLAN_LINES),
    moreLines: Math.max(0, all.length - MAX_PLAN_LINES),
    refused: [...(opts.refused ?? []), ...problems],
    missing: missingOf(doc, record, base, next),
    prepared: preparedOf(record),
    flagged: all.filter((l) => l.flag === "finding" || l.flag === "limits").length,
    submitAsked: !!opts.submitAsked,
  };
}

/** Values (the rules', the model's, or both merged) → grounded patch → dry run. */
export function planFromValues(
  doc: DocumentDefinition,
  record: RecordInstance | null,
  values: FillValues,
  opts: { words: string; dateISO: string; dateSaid: boolean; lang: FillLanguage; isDemo: boolean; rules?: RulesReading | null; model?: FillValues | null; identity?: FillPlan["identity"]; submitAsked?: boolean; today?: string }
): FillPlan {
  const { patch, refused } = valuesToPatch(doc, record, values, opts);
  return planFill(doc, record, patch, { dateISO: opts.dateISO, isDemo: opts.isDemo, identity: opts.identity, refused, submitAsked: opts.submitAsked || !!values.submit });
}

/** A record not started yet, as the sample fill needs one to work on. */
function standIn(doc: DocumentDefinition, dateISO: string, isDemo: boolean): RecordInstance {
  const now = new Date().toISOString();
  return { id: `rec-new-${doc.id}-${dateISO}`, documentId: doc.id, periodKey: `${doc.id}:${dateISO}`, dueDate: dateISO, status: "In Progress", isDemo, data: createDefaultData(doc, dateISO, masterRepository.get()), createdAt: now, updatedAt: now };
}

/** The sample fill, planned: realistic made-up values on the blank boxes only (engine/sampleFill.ts). Null when the form has none. */
export function planSample(doc: DocumentDefinition, record: RecordInstance | null, dateISO: string, userName: string, isDemo: boolean): FillPlan | null {
  if (!canSampleFill(doc.kind)) return null;
  const on = record ?? standIn(doc, dateISO, isDemo);
  const result = sampleFillRecord(doc, on, masterRepository.get(), userName);
  if (!result) return null;
  const all = linesOf(doc, record, on.data, result.data);
  return {
    doc,
    record,
    dateISO: on.dueDate,
    willStart: !record,
    identity: null,
    mode: "sample",
    patch: {},
    lines: all.slice(0, MAX_PLAN_LINES),
    moreLines: Math.max(0, all.length - MAX_PLAN_LINES),
    refused: [],
    missing: [],
    prepared: preparedOf(record),
    flagged: 0,
    submitAsked: false,
  };
}

/** The data a copy of an earlier record puts on this one: its values on the blank boxes, the line dates made this record's own. */
function copiedData(doc: DocumentDefinition, current: unknown, source: RecordInstance, dateISO: string): unknown {
  const src = clone(source.data) as Obj;
  if (doc.kind === "log-sheet" && isObj(src) && Array.isArray(src.rows)) {
    const layout = getLogSheetLayoutForRecord(doc.id, null);
    const dateCols = layout?.columns.filter((c) => c.type === "date" && writableCol(c)).map((c) => c.key) ?? [];
    src.rows = (src.rows as Obj[]).map((r) => {
      const { id: _id, ...rest } = r;
      void _id;
      for (const k of dateCols) if (!blank(rest[k])) rest[k] = dateISO;
      return rest;
    });
  }
  return fillBlanks(current, src, doc);
}

/** "Copy from <the last confirmed date>", planned. Null when there is nothing confirmed to copy. */
export function planCopy(doc: DocumentDefinition, record: RecordInstance | null, dateISO: string, isDemo: boolean): FillPlan | null {
  const source = latestConfirmedRecord(doc.id, record?.dueDate ?? dateISO, isDemo);
  if (!source) return null;
  const on = record ?? standIn(doc, dateISO, isDemo);
  const next = copiedData(doc, on.data, source, on.dueDate);
  const all = linesOf(doc, record, on.data, next);
  return {
    doc,
    record,
    dateISO: on.dueDate,
    willStart: !record,
    identity: null,
    mode: "copy",
    patch: {},
    lines: all.slice(0, MAX_PLAN_LINES),
    moreLines: Math.max(0, all.length - MAX_PLAN_LINES),
    refused: [],
    missing: [],
    prepared: preparedOf(record),
    flagged: 0,
    submitAsked: false,
    copiedFrom: { recordId: source.id, dateISO: source.dueDate },
  };
}

/** The last confirmed record a copy would come from, for the offer's chip. */
export function copySourceOf(doc: DocumentDefinition, dateISO: string, isDemo: boolean): RecordInstance | undefined {
  return canSampleFill(doc.kind) ? latestConfirmedRecord(doc.id, dateISO, isDemo) : undefined;
}

// ---------------------------------------------------------------------------
// the write (the browser; the engine host writes through its own page handlers)

export interface CommitOutcome {
  record: RecordInstance;
  started: boolean;
  changed: number;
  /** The record page's binding paths of the boxes that changed, to glow on screen. */
  paths: string[];
  submitted?: { ok: boolean; errors: string[] };
}

/** The note a fill leaves in the record's history. */
export function fillNote(plan: FillPlan, words: string, assistantName = "Mitra"): string {
  if (plan.mode === "sample") return SAMPLE_FILL_NOTE;
  if (plan.mode === "copy" && plan.copiedFrom) return `Copied from the record of ${formatDisplayDate(plan.copiedFrom.dateISO)} on request (${assistantName})`;
  const said = words.trim();
  return `Asked of ${assistantName}: ${said.length > 200 ? `${said.slice(0, 199)}…` : said || "(spoken)"}`;
}

/** The data the plan puts on this record, worked out again on the record as it stands now. */
export function dataAfter(plan: FillPlan, record: RecordInstance, userName: string): unknown {
  if (plan.mode === "sample") return sampleFillRecord(plan.doc, record, masterRepository.get(), userName)?.data ?? record.data;
  if (plan.mode === "copy" && plan.copiedFrom) {
    const source = recordRepository.getById(plan.copiedFrom.recordId);
    return source ? copiedData(plan.doc, record.data, source, record.dueDate) : record.data;
  }
  return applyAssistantPatch(patchKindOf(plan.doc), plan.doc.id, clone(record.data), plan.patch, record).data;
}

/** The record page's binding paths whose value differs between two versions of the data. */
export function changedPaths(doc: DocumentDefinition, record: RecordInstance, before: unknown, after: unknown): string[] {
  const layout = doc.kind === "log-sheet" ? getLogSheetLayoutForRecord(doc.id, record) : undefined;
  const bound = bindingsForRecord(doc.kind, after, { layout, checkpoints: masterRepository.get().checkpoints }) ?? [];
  return bound.filter((b) => JSON.stringify(getAtPath(before, b.path) ?? null) !== JSON.stringify(getAtPath(after, b.path) ?? null)).map((b) => b.path);
}

/**
 * THE WRITE, IN THE BROWSER: the record started when the plan says so, the
 * plan worked out again on it as it stands, saved through the record page's
 * own commit when it is on screen, else as a draft (engine/recordLifecycle.ts
 * saveDraft, as sampleFillStoredRecord does). Never submits — unless the
 * person's words asked for it (`plan.submitAsked`), and never with sample data.
 */
export function commitFill(
  plan: FillPlan,
  io: { userName: string; isDemo: boolean; words: string; onScreen: (recordId: string) => AssistantTarget | null; assistantName?: string }
): CommitOutcome | { refusedLocked: RecordInstance } {
  let record = plan.record ? (recordRepository.getById(plan.record.id) ?? plan.record) : null;
  let started = false;
  if (!record) {
    const made = createRecordForDocument(plan.doc, { dateISO: plan.dateISO, isDemo: io.isDemo });
    record = made.record;
    started = !made.existed;
  }
  if (!isEditableStatus(record.status)) return { refusedLocked: record };
  const before = record.data;
  const next = dataAfter(plan, record, io.userName);
  const labels = fieldLabels(plan.doc.kind, plan.doc.id, record);
  const changes = diffRecordData(before, next, labels);
  const paths = changedPaths(plan.doc, record, before, next);
  if (changes.length === 0) return { record, started, changed: 0, paths: [] };
  const note = fillNote(plan, io.words, io.assistantName);
  const target = io.onScreen(record.id);
  if (target && target.editable && target.recordId === record.id) target.commit(next, note);
  else saveDraft(record, plan.doc.kind === "log-sheet" ? withComputedCells(plan.doc.id, next) : next, io.userName, { action: "assistant-edit", note, labels });
  record = recordRepository.getById(record.id) ?? record;
  let submitted: CommitOutcome["submitted"];
  if (plan.submitAsked && plan.mode === "values") {
    const { result } = submitRecord(plan.doc, record, io.userName);
    submitted = { ok: result.valid, errors: result.errors.slice(0, 3) };
    record = recordRepository.getById(record.id) ?? record;
  }
  return { record, started, changed: changes.length, paths, ...(submitted ? { submitted } : {}) };
}

/** "F-QC-30 Lamination Adhesive Viscosity Record" and "07-Oct-2026", as the replies name them. */
export function planNames(plan: Pick<FillPlan, "doc" | "dateISO" | "identity">): { doc: string; date: string } {
  const name = formatAndName(plan.doc);
  return { doc: plan.identity ? `${name} (${shortIdentity(plan.identity.value)})` : name, date: formatDisplayDate(plan.dateISO) };
}

/**
 * THE PATCH CHECKED AGAIN AT THE WRITE (the phone's /api/v1/fill/apply): every
 * value in it must be in the person's words — a number by its digits, a name
 * word by word, an option by a word of its own ("GJ02ZZ6403 – ECHO" by ECHO), a
 * time or a date as said or the record's own day. Check point answers (ok, not
 * ok, Yes, No) are the form's words, not the person's, and pass. Returns what
 * was not said (empty when all of it was).
 */
export function unsaidInPatch(patch: Obj, words: string, dateISO: string, today = todayISO()): string[] {
  const g = groundOf(words, dateISO, true, "en", today);
  const out: string[] = [];
  const check = (label: string, v: unknown) => {
    if (v === null || v === undefined || v === "" || typeof v === "boolean") return;
    if (typeof v === "number") {
      if (!g.numbers.some((x) => Math.abs(x - v) < 1e-9)) out.push(label);
      return;
    }
    if (isObj(v)) {
      if ("value" in v) check(label, v.value);
      if (typeof v.note === "string") check(`${label} note`, v.note);
      return;
    }
    const text = String(v).trim();
    if (/^(?:ok|not ok|yes|no|na|n\/a)$/i.test(text)) return;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      if (text !== dateISO && !g.dates.includes(text)) out.push(label);
      return;
    }
    if (/^\d{1,2}:\d{2}$/.test(text)) {
      const t = normTime(text);
      if (!t || !g.times.includes(t)) out.push(label);
      return;
    }
    if (/^-?\d+(?:\.\d+)?$/.test(text)) {
      check(label, Number(text));
      return;
    }
    const inWords = (part: string) => {
      const toks = wordsOf(part).filter((t) => t.length >= 2 || /\d/.test(t));
      return toks.length > 0 && toks.every((t) => g.wordSet.has(t) || g.canonSet.has(canon(t)));
    };
    // An option said by a word of its own: "GJ02AT4947 – BOLERO PICK UP" by BOLERO.
    const afterDash = text.split(/\s+[–-]\s+/).slice(1).join(" ");
    const anyInWords = (part: string) => wordsOf(part).some((t) => t.length >= 3 && (g.wordSet.has(t) || g.canonSet.has(canon(t))));
    if (!inWords(text) && !(afterDash && anyInWords(afterDash))) out.push(label);
  };
  for (const [k, v] of Object.entries(patch)) {
    if (k === "header" && isObj(v)) for (const [hk, hv] of Object.entries(v)) check(hk, hv);
    else if (k === "checkpoints" && isObj(v)) for (const [n, cv] of Object.entries(v)) check(`Check point ${n}`, cv);
    else if (k === "itemEdits" && Array.isArray(v)) {
      for (const e of v) if (isObj(e) && isObj(e.set)) for (const [ek, ev] of Object.entries(e.set)) check(ek, ev);
    } else if (k === "addRows" && Array.isArray(v)) {
      for (const r of v) if (isObj(r)) for (const [rk, rv] of Object.entries(r)) check(rk, rv);
    } else if (!isObj(v) && !Array.isArray(v)) check(k, v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// the words, the same on the website and the phone (i18n/fillPhrases.ts)

/** One line of a plan: "• Row 2 (10:00) · Viscosity: 20.5 → 18 [out of limits]". */
export function lineText(l: FillLine, lang: FillLanguage): string {
  const flag = l.flag === "finding" ? fillSay(lang, "finding") : l.flag === "limits" ? fillSay(lang, "outOfLimits") : l.flag === "estimate" ? fillSay(lang, "estimate") : "";
  return `• ${l.label}: ${l.before ? `${l.before} → ` : ""}${l.after}${flag ? ` [${flag}]` : ""}`;
}

const LISTED = 14;

/** The words after a write: what was written, box by box, and what was not. */
export function fillDoneWords(plan: FillPlan, changed: number, started: boolean, lang: FillLanguage, submitted?: { ok: boolean; errors: string[] }): string {
  const names = planNames(plan);
  const parts: string[] = [];
  if (started) parts.push(fillSay(lang, "started", names));
  if (plan.mode === "sample") parts.push(fillSay(lang, "sampleDone", { ...names, n: boxesSay(lang, changed) }));
  else if (plan.mode === "copy" && plan.copiedFrom) parts.push(fillSay(lang, "copied", { ...names, n: boxesSay(lang, changed), from: formatDisplayDate(plan.copiedFrom.dateISO) }));
  else parts.push(fillSay(lang, "wrote", { ...names, n: boxesSay(lang, changed) }));
  const lines = plan.lines.slice(0, LISTED).map((l) => lineText(l, lang));
  const more = plan.lines.length - LISTED + plan.moreLines;
  if (more > 0) lines.push(`• … +${more}`);
  let text = `${parts.join(" ")}\n${lines.join("\n")}`;
  if (plan.refused.length) text += `\n${fillSay(lang, "notWritten")}\n${plan.refused.slice(0, 6).map((r) => `• ${r}`).join("\n")}`;
  if (plan.missing.length && plan.mode === "values") text += `\n${fillSay(lang, "stillBlank", { list: plan.missing.join(", ") })}`;
  if (plan.prepared && plan.mode === "values") text += `\n${fillSay(lang, "estimatesLeft", { time: plan.prepared.time })}`;
  if (submitted) text += `\n${submitted.ok ? fillSay(lang, "submitted") : fillSay(lang, "submitBlocked", { why: submitted.errors.join(" ") })}`;
  return text;
}

/** The question before a write (the phone's one card): "Shall I write these 3 boxes on … of …?", with what else is worth knowing. */
export function fillConfirmWords(plan: FillPlan, lang: FillLanguage): string {
  const names = planNames(plan);
  const parts = [fillSay(lang, "confirmWrite", { ...names, n: boxesSay(lang, plan.lines.length + plan.moreLines) })];
  if (plan.willStart) parts.push(fillSay(lang, "noRecordYet", names));
  if (plan.prepared && plan.mode === "values") parts.push(fillSay(lang, "estimatesLeft", { time: plan.prepared.time }));
  let text = parts.join(" ");
  if (plan.refused.length) text += `\n${fillSay(lang, "notWritten")}\n${plan.refused.slice(0, 6).map((r) => `• ${r}`).join("\n")}`;
  return text;
}

/** A document by id, for callers holding only the id. */
export const documentOf = (id: string): DocumentDefinition | undefined => documentRepository.getById(id);
