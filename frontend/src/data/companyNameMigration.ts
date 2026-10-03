import type { RecordInstance } from "../types";
import { COMPANY } from "./seed/masterData";
import { FORMAT_EDITS_KEY, formatEdits, type FormatEdit, type FormatEditStore } from "./formatEdits";
import { masterRepository } from "./repositories/masterRepository";
import { recordRepository } from "./repositories/recordRepository";
import type { ReferenceEdit } from "./repositories/referenceRepository";
import { readJSON, writeJSON } from "./storageAdapter";
import { appendHistory, diffRecordData, historyOf, makeEntry } from "../engine/recordHistory";

// THE COMPANY'S NAME, BROUGHT IN LINE IN WHAT IS ALREADY STORED. The owner,
// 02-Oct-2026: the company is "Gujarat Print Pack Publications Pvt Ltd", kept
// everywhere — every document of every module, the opening, the screens. The
// code says so from that day (data/seed/masterData.ts COMPANY: the capitals
// form on a printed company line, the running-text form everywhere else). But
// what a plant has already stored was written with the spellings that came
// before — GUJARAT PRINTPACK PUBLICATION PRIVATE LIMITED, Gujarat Print Pack
// Publication Pvt. Ltd., the F/QC/25 certificate's own abbreviation, and the
// rest — and would go on printing them. So, at every start (data/bootstrap.ts;
// idempotent: a second run finds nothing to do):
//
//   formatEdits     a company name the plant typed over a header that is only a
//                   spelling of the name, old or new, is dropped, so the header
//                   prints the owner's; where more was typed ("…, MEHSANA") the
//                   name inside it is brought in line and the rest kept. In a
//                   format's stored layout, every printed word (instructions,
//                   labels, defaults, the specimen) — never a key.
//   referenceEdits  a corrected Statement of Compliance.
//   master          the employee lines — the client contact's department.
//   records         every string of every record's data, drafts and signed-off
//                   alike, with ONE line in the record's history saying why.
//                   Its status, signatures, due date and period stay as they
//                   were, and so does updatedAt (upsertMany), as with every
//                   start-up clean-up.
//
// Capitals become the capitals form and any other casing the running-text form.
// Only this company's name is ever matched — "Gujarat Print Pack Pub…" in any of
// its spellings — so a customer's or a machine maker's "Pvt. Ltd." is never
// touched, and neither is the "Gujarat Print Pack Leave Calendar 2026".

/** What each changed record's history says. */
export const COMPANY_NAME_NOTE = "Company name brought in line: Gujarat Print Pack Publications Pvt Ltd (owner's decision, 2-Oct-2026)";

// Every spelling of the name: Gujarat or Gujrat; Print Pack, Printpack or
// Print-Pack; Pub., Publication or Publications; then Pvt Ltd, Pvt. Ltd.,
// Private Limited, Limited, Ltd. or nothing — in any case, spaced any way.
const SPELLING = String.raw`\bGUJA?RAT\s+PRINT\s*-?\s*PACK\s+(?:PUBLICATIONS?\b|PUB\b\.?)(?:\s*(?:PRIVATE\s+LIMITED\b|PRIVATE\s+LTD\b\.?|PVT\b\.?\s*LTD\b\.?|PVT\b\.?\s*LIMITED\b|LIMITED\b|LTD\b\.?))?`;
const EVERY_SPELLING = new RegExp(SPELLING, "gi");
const A_SPELLING = new RegExp(SPELLING, "i");
const ONLY_A_SPELLING = new RegExp(String.raw`^\s*${SPELLING}\.?\s*$`, "i");
/** "GUJRAT PRINTPACK PUB", the shortest a spelling can be: anything shorter is not looked at. */
const SHORTEST = 20;

/** The name written as the owner gave it in either form, exactly. */
const isTheName = (text: string): boolean => text === COMPANY.name || text === COMPANY.shortName;

/** True when `text` is the company's name and nothing else, in any spelling — the old ones and the owner's alike. */
export function isCompanyNameSpelling(text: string): boolean {
  return ONLY_A_SPELLING.test(text);
}

/** `text` with every earlier spelling of the company's name replaced by the owner's; the very same string when it holds none. */
export function withCompanyName(text: string): string {
  if (text.length < SHORTEST || !A_SPELLING.test(text)) return text;
  return text.replace(EVERY_SPELLING, (match: string, offset: number, whole: string) => {
    const dotted = match.endsWith(".");
    // The owner's name already: a full stop after it is the sentence's own.
    if (isTheName(match) || (dotted && isTheName(match.slice(0, -1)))) return match;
    const capitals = !/[a-z]/.test(match);
    const name = capitals ? COMPANY.name : COMPANY.shortName;
    if (!dotted) return name;
    // "Pvt. Ltd." lose their full stops — but where that last one plainly ended
    // a sentence as well, the sentence keeps it: the name closing a sentence
    // ("… manufactured by Gujarat Print Pack Publications Pvt. Ltd."), or a new
    // one starting after it in running text.
    const before = whole.slice(0, offset);
    const after = whole.slice(offset + match.length);
    const endsSentence = (after === "" && /[A-Za-z]\s+$/.test(before)) || (!capitals && /^\s+[A-Z]/.test(after));
    return endsSentence ? `${name}.` : name;
  });
}

// Values that are identifiers, never words, by the name they are kept under.
/** A record's data, a stored statement, the master data: the ids of their lines. */
const IDS = new Set(["id", "documentId"]);
/** A format's layout (types/logSheet.ts): its keys, kinds and references to other things. */
const LAYOUT_IDS = new Set([
  "id",
  "documentId",
  "key",
  "kind",
  "type",
  "slotKey",
  "list",
  "linkedFrom",
  "labelKey",
  "valueKey",
  "labelColumn",
  "valueColumn",
  "titleKey",
  "cutoffKey",
  "src",
]);

/**
 * `value` with the company's name brought in line in every string it holds,
 * except under the names in `skip`. Never changes anything in place: what holds
 * no old spelling is returned as the very same object, so "nothing changed" is
 * an identity check, and a year of records is walked without being copied.
 */
export function withCompanyNameIn<T>(value: T, skip: ReadonlySet<string> = IDS): T {
  if (typeof value === "string") return withCompanyName(value) as T;
  if (value === null || typeof value !== "object") return value;
  // Every value of every record is looked at on every start, so the short
  // strings, numbers and blanks that are most of them are passed over here,
  // without a call of their own.
  if (Array.isArray(value)) {
    let out: unknown[] | null = null;
    for (let i = 0; i < value.length; i++) {
      const v: unknown = value[i];
      if (v === null || (typeof v !== "object" && (typeof v !== "string" || v.length < SHORTEST))) continue;
      const next = withCompanyNameIn(v, skip);
      if (next !== v) (out ??= value.slice())[i] = next;
    }
    return (out ?? value) as T;
  }
  const obj = value as Record<string, unknown>;
  let out: Record<string, unknown> | null = null;
  // Object.keys, not for…in: it took half the time over nine months of records.
  const keys = Object.keys(obj);
  for (let j = 0; j < keys.length; j++) {
    const k = keys[j];
    const v = obj[k];
    if (v === null || (typeof v !== "object" && (typeof v !== "string" || v.length < SHORTEST)) || skip.has(k)) continue;
    const next = withCompanyNameIn(v, skip);
    if (next !== v) (out ??= { ...obj })[k] = next;
  }
  return (out ?? value) as T;
}

/** One format's stored change, brought in line (the same object when nothing needed it). */
function alignedFormatEdit(edit: FormatEdit): FormatEdit {
  let out = edit;
  if (typeof edit.companyName === "string") {
    if (isCompanyNameSpelling(edit.companyName)) {
      // The header then prints COMPANY.name, as every header without a change of its own does.
      const { companyName: _spelling, ...rest } = edit;
      out = rest;
    } else {
      const companyName = withCompanyName(edit.companyName);
      if (companyName !== edit.companyName) out = { ...out, companyName };
    }
  }
  if (typeof edit.name === "string") {
    const name = withCompanyName(edit.name);
    if (name !== edit.name) out = { ...out, name };
  }
  if (edit.layout) {
    const layout = withCompanyNameIn(edit.layout, LAYOUT_IDS);
    if (layout !== edit.layout) out = { ...out, layout };
  }
  return out;
}

function alignFormatEdits(): number {
  const store = formatEdits();
  let next: FormatEditStore | null = null;
  let changed = 0;
  for (const [documentId, edit] of Object.entries(store)) {
    if (!edit || typeof edit !== "object") continue;
    const aligned = alignedFormatEdit(edit);
    if (aligned === edit) continue;
    (next ??= { ...store })[documentId] = aligned;
    changed += 1;
  }
  if (next) writeJSON(FORMAT_EDITS_KEY, next);
  return changed;
}

/** Where data/repositories/referenceRepository.ts keeps the corrected reference documents. */
const REFERENCE_EDITS_KEY = "referenceEdits";

function alignReferenceEdits(): number {
  const store = readJSON<Record<string, ReferenceEdit<unknown>>>(REFERENCE_EDITS_KEY, {});
  let next: Record<string, ReferenceEdit<unknown>> | null = null;
  let changed = 0;
  for (const [documentId, edit] of Object.entries(store)) {
    if (!edit || typeof edit !== "object") continue;
    const data = withCompanyNameIn(edit.data);
    if (data === edit.data) continue;
    // Who corrected the statement, and when, stay as they were: the name is all that moves.
    (next ??= { ...store })[documentId] = { ...edit, data };
    changed += 1;
  }
  if (next) writeJSON(REFERENCE_EDITS_KEY, next);
  return changed;
}

function alignMaster(): boolean {
  const master = masterRepository.get();
  const next = withCompanyNameIn(master);
  if (next === master) return false;
  masterRepository.update(next);
  return true;
}

function alignRecords(): number {
  const updates: RecordInstance[] = [];
  // Unscoped on purpose, as every start-up clean-up: the whole register, not
  // only the departments the person signed in may see.
  for (const r of recordRepository.snapshot()) {
    const data = withCompanyNameIn(r.data);
    // A record reopened for correction keeps what it said when it was reopened,
    // for "Cancel edit" to put back — brought in line too, or cancelling would
    // bring the old name back.
    const dataBefore = r.correction && r.correction.dataBefore !== undefined ? withCompanyNameIn(r.correction.dataBefore) : undefined;
    const correctionChanged = r.correction !== undefined && dataBefore !== r.correction.dataBefore;
    if (data === r.data && !correctionChanged) continue;
    let next: RecordInstance = correctionChanged ? { ...r, correction: { ...r.correction!, dataBefore } } : r;
    if (data !== r.data) {
      // appendHistory's own entry — its list of changes capped as every entry's is —
      // but a line of its own, never folded into a change another start-up
      // clean-up made to this record a moment before.
      const entry = appendHistory({ ...r, history: [] }, makeEntry("edited", "System", { changes: diffRecordData(r.data, data), note: COMPANY_NAME_NOTE })).history![0];
      next = { ...next, data, history: [...historyOf(r), entry] };
    }
    updates.push(next);
  }
  if (updates.length) recordRepository.upsertMany(updates);
  return updates.length;
}

export interface CompanyNameAlignment {
  /** Formats whose stored change still named the company the old way. */
  formats: number;
  /** Corrected Statements of Compliance that did. */
  statements: number;
  /** Whether the master data did (an employee line's department). */
  master: boolean;
  /** Records that did — each now with a line in its history. */
  records: number;
}

export function alignCompanyName(): CompanyNameAlignment {
  return {
    formats: alignFormatEdits(),
    statements: alignReferenceEdits(),
    master: alignMaster(),
    records: alignRecords(),
  };
}
