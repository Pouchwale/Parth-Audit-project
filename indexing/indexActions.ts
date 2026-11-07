// SAVING THE INDEX: every save is a new version, and what changed reaches the formats.
//
//   * The format's own values (number, name, company name, revision and its date, frequency, responsible person) are
//     written where the app keeps them — the format edits (data/formatEdits.ts, with a line in the format's own change
//     history), the frequencies the super admin sets (Master Data's scheduleOverrides) and the responsible role keywords
//     (Master Data's documentRoleKeywords) — so every screen, the calendar, the reminders and the printed form follow.
//   * The index's own values (retention, disposal, method of recording, file location, status, remarks, the F/SYS/01
//     lines, added lines) are kept in the index.
//   * A changed formula is in force from the moment it is saved; the old one stays in the formula's timeline, and the
//     open records of its formats are worked out again at once (signed records keep theirs: indexing/formulaRuntime.ts).
//
// Restoring a version, or the defaults, is a save like any other: a new version, nothing lost.

import type { DocumentDefinition, Frequency, RecordInstance, ScheduleConfig, ScheduleOverride } from "../frontend/src/types";
import { SEED_DOCUMENTS } from "../frontend/src/data/seed/documentDefinitions";
import { COMPANY } from "../frontend/src/data/seed/masterData";
import { documentRepository } from "../frontend/src/data/repositories/documentRepository";
import { masterRepository } from "../frontend/src/data/repositories/masterRepository";
import { recordRepository } from "../frontend/src/data/repositories/recordRepository";
import { formatEditFor, saveFormatEdit, type FormatRevision } from "../frontend/src/data/formatEdits";
import { removeOffScheduleShells } from "../frontend/src/engine/calendarMigration";
import { withComputedCells } from "../frontend/src/engine/computedCells";
import { diffRecordData, makeEntry } from "../frontend/src/engine/recordHistory";
import { fieldLabels } from "../frontend/src/engine/recordPatch";
import { logActivity } from "../frontend/src/utils/activityLog";
import { todayISO } from "../frontend/src/utils/date";
import { compileFormula } from "./formulaLanguage";
import { FORMULA_SLOTS, formulaSlot } from "./formulas";
import { rangeDefault, rangeDefinition, rangeDefinitions, rangeProblem, rangeText, sameRange, type RangeValue } from "./ranges";
import { buildDocumentLines, buildFormatLines, type DocumentLine, type FormatLine } from "./indexRows";
import { cleanEdits, diffEdits, sameEdits, textEditsFor, type TextEdit } from "./textLayout";
import {
  PUSHED_FORMAT_FIELDS,
  currentVersionNo,
  emptySnapshot,
  readIndexState,
  writeIndexState,
  type AddedRow,
  type DocumentField,
  type FormatField,
  type IndexChange,
  type IndexSnapshot,
  type IndexState,
} from "./indexState";

/** What the super admin has changed on the screen and not saved yet. */
export interface IndexDraft {
  formats: Record<string, Partial<Record<FormatField, string>>>;
  documents: Record<string, Partial<Record<DocumentField, string>>>;
  /** A formula's new expression; null = back to its default. */
  formulas: Record<string, string | null>;
  /** A range's new value; null = back to its default (indexing/ranges.ts). */
  ranges: Record<string, RangeValue | null>;
  /** A format's printed words, as they should now stand (indexing/textLayout.ts); null = back to the issued ones. */
  texts?: Record<string, TextEdit[] | null>;
  addedFormats: AddedRow[];
  addedDocuments: AddedRow[];
}

export const emptyDraft = (): IndexDraft => ({ formats: {}, documents: {}, formulas: {}, ranges: {}, texts: {}, addedFormats: [], addedDocuments: [] });

export const draftIsEmpty = (d: IndexDraft): boolean =>
  Object.keys(d.formats).length === 0 &&
  Object.keys(d.documents).length === 0 &&
  Object.keys(d.formulas).length === 0 &&
  Object.keys(d.ranges ?? {}).length === 0 &&
  Object.keys(d.texts ?? {}).length === 0 &&
  d.addedFormats.length === 0 &&
  d.addedDocuments.length === 0;

/** The range in force now: the changed one, or the default. */
export function currentRange(id: string, state: IndexState = readIndexState()): RangeValue {
  const def = rangeDefinition(id);
  return state.current.ranges?.[id] ?? (def ? rangeDefault(def) : {});
}

export const FORMAT_FIELD_LABELS: Record<FormatField, string> = {
  formatNo: "Format No.",
  name: "Format name",
  companyName: "Company name (header)",
  revisionNo: "Revision No.",
  revisionDate: "Revision date",
  frequency: "Frequency",
  responsibleRole: "Responsible role",
  department: "Department",
  listRevision: "Revision on Master List",
  methodOfRecording: "Method of recording",
  retentionPeriod: "Retention period",
  methodOfDisposition: "Method of disposal",
  fileLocation: "File location (hard copy)",
  status: "Status",
  remarks: "Remarks",
};

export const DOCUMENT_FIELD_LABELS: Record<DocumentField, string> = {
  documentNumber: "Document No.",
  description: "Description",
  documentControl: "Document control",
  latestRevision: "Latest revision",
  retentionPeriod: "Retention period",
  fileLocation: "File location",
  status: "Status",
  remarks: "Remarks",
};

/** The formula in force now for a slot: the changed one, or the default. */
export function currentFormula(slotId: string, state: IndexState = readIndexState()): string {
  const slot = formulaSlot(slotId);
  return state.current.formulas[slotId] ?? slot?.defaultExpr ?? "";
}

/** Why a formula cannot be saved, or null when it can (it reads, it uses only its own figures, it works out on the sample). */
export function formulaProblem(slotId: string, expr: string): string | null {
  const slot = formulaSlot(slotId);
  if (!slot) return "Unknown formula.";
  if (!expr.trim()) return "The formula is empty.";
  const compiled = compileFormula(expr, slot.variables.map((v) => v.name));
  if (!compiled.ok) return compiled.error;
  const sample: Record<string, number> = {};
  for (const v of slot.variables) sample[v.name] = v.sample;
  try {
    compiled.run(sample);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  return null;
}

const lineLabel = (l: FormatLine): string => `${l.values.formatNo ? `${l.values.formatNo} ` : ""}${l.values.name}`.trim();

/** Every change the draft makes, before → after, as the confirmation and the version list show it. */
export function describeDraft(draft: IndexDraft, formatLines: FormatLine[] = buildFormatLines(), documentLines: DocumentLine[] = buildDocumentLines()): IndexChange[] {
  const out: IndexChange[] = [];
  const byKey = new Map(formatLines.map((l) => [l.key, l]));
  for (const [key, fields] of Object.entries(draft.formats)) {
    const line = byKey.get(key);
    if (!line) continue;
    for (const [f, after] of Object.entries(fields) as [FormatField, string][]) {
      const before = line.values[f] ?? "";
      if (after === undefined || after === before) continue;
      out.push({ area: "format", key, label: lineLabel(line), field: FORMAT_FIELD_LABELS[f], before, after });
    }
  }
  const docByKey = new Map(documentLines.map((l) => [l.key, l]));
  for (const [key, fields] of Object.entries(draft.documents)) {
    const line = docByKey.get(key);
    if (!line) continue;
    for (const [f, after] of Object.entries(fields) as [DocumentField, string][]) {
      const before = line.values[f] ?? "";
      if (after === undefined || after === before) continue;
      out.push({ area: "document", key, label: `${line.values.documentNumber} ${line.values.description}`.trim(), field: DOCUMENT_FIELD_LABELS[f], before, after });
    }
  }
  for (const [slotId, expr] of Object.entries(draft.formulas)) {
    const slot = formulaSlot(slotId);
    if (!slot) continue;
    const before = currentFormula(slotId);
    const after = expr ?? slot.defaultExpr;
    if (after.trim() === before.trim()) continue;
    out.push({ area: "formula", key: slotId, label: `${slot.formats.split(" ")[0]} ${slot.cell}`, field: "Formula", before, after: expr === null ? `${after} (default)` : after });
  }
  for (const [id, value] of Object.entries(draft.ranges ?? {})) {
    const def = rangeDefinition(id);
    if (!def) continue;
    const before = currentRange(id);
    const after = value ?? rangeDefault(def);
    if (sameRange(before, after)) continue;
    out.push({ area: "range", key: id, label: `${def.formatNo} ${def.what}`, field: "Range", before: rangeText(def, before), after: `${rangeText(def, after)}${value === null ? " (default)" : ""}` });
  }
  for (const [docId, edits] of Object.entries(draft.texts ?? {})) {
    const doc = SEED_DOCUMENTS.find((d) => d.id === docId);
    const label = doc ? `${doc.formatNo} ${doc.name}` : docId;
    for (const d of diffEdits(textEditsFor(docId), edits ?? [])) out.push({ area: "text", key: docId, label, field: `Text ${d.words}`, before: d.before, after: d.after });
  }
  for (const a of draft.addedFormats) out.push({ area: "added-format", key: a.key, label: `${a.values.formatNo ?? ""} ${a.values.name ?? ""}`.trim(), field: "New format line", before: "", after: "added" });
  for (const a of draft.addedDocuments) out.push({ area: "added-document", key: a.key, label: `${a.values.documentNumber ?? ""} ${a.values.description ?? ""}`.trim(), field: "New document line", before: "", after: "added" });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// writing the format's own values where the app keeps them

const KIND_OF: Record<Frequency, ScheduleConfig["type"]> = {
  Daily: "daily",
  Weekly: "weekly",
  Fortnightly: "fortnightly",
  Monthly: "monthly",
  Quarterly: "quarterly",
  "Half-yearly": "half-yearly",
  Yearly: "yearly",
  "As Required": "as-required",
  // A frequency of the person's own (REQUIREMENTS §202).
  Custom: "custom",
};

/** The schedule of a frequency, keeping what the format's current schedule shares with it (as Master Data's picker does). */
function scheduleFor(frequency: Frequency, now: ScheduleConfig): ScheduleConfig {
  const weekday = "weekday" in now && typeof now.weekday === "number" ? now.weekday : 1;
  const day = "dayOfMonth" in now && typeof now.dayOfMonth === "number" ? now.dayOfMonth : 1;
  const month = now.type === "yearly" ? now.month : now.type === "quarterly" || now.type === "half-yearly" ? now.anchorMonth : 0;
  switch (KIND_OF[frequency]) {
    case "daily":
      return { type: "daily" };
    case "weekly":
      return { type: "weekly", weekday };
    case "fortnightly":
      return { type: "fortnightly", weekday };
    case "monthly":
      return { type: "monthly", dayOfMonth: day };
    case "quarterly":
      return { type: "quarterly", anchorMonth: month % 3, dayOfMonth: day };
    case "half-yearly":
      return { type: "half-yearly", anchorMonth: month % 6, dayOfMonth: day };
    case "custom":
      // The word alone cannot say the days: a custom frequency is set on the Frequency panel (REQUIREMENTS §202); one already set stands.
      return now;
    case "yearly":
      return { type: "yearly", month, dayOfMonth: day };
    default:
      return { type: "as-required" };
  }
}

function pushFormatValues(doc: DocumentDefinition, target: Partial<Record<FormatField, string>>, actor: string, reason: string, versionNo: number): string[] {
  const done: string[] = [];
  const issued = SEED_DOCUMENTS.find((d) => d.id === doc.id);
  const headerFields: FormatField[] = ["formatNo", "name", "companyName", "revisionNo", "revisionDate"];
  const header = headerFields.filter((f) => target[f] !== undefined);
  if (header.length) {
    const existing = formatEditFor(doc.id);
    const now = {
      formatNo: doc.formatNo,
      name: doc.name,
      companyName: doc.companyName ?? COMPANY.name,
      revisionNo: doc.revisionNo,
      revisionDate: doc.revisionDate ?? "",
    };
    const next = { ...now, ...Object.fromEntries(header.map((f) => [f, String(target[f]).trim()])) } as typeof now;
    const summary = header.filter((f) => String(next[f as keyof typeof next]) !== String(now[f as keyof typeof now])).map((f) => `${FORMAT_FIELD_LABELS[f]} "${now[f as keyof typeof now]}" → "${next[f as keyof typeof next]}"`);
    if (summary.length) {
      const at = new Date().toISOString();
      const revision: FormatRevision = {
        id: `${at}|${actor}|${next.revisionNo}`,
        revisionNo: next.revisionNo,
        revisionDate: next.revisionDate,
        by: actor,
        at,
        reason: `Indexing v${versionNo}: ${reason}`,
        summary: summary.join("; "),
      };
      saveFormatEdit(doc.id, {
        revisionNo: next.revisionNo,
        revisionDate: next.revisionDate,
        name: next.name !== (issued?.name ?? doc.name) ? next.name : undefined,
        companyName: next.companyName !== (issued?.companyName ?? COMPANY.name) ? next.companyName : undefined,
        formatNo: next.formatNo !== (issued?.formatNo ?? doc.formatNo) ? next.formatNo : undefined,
        layout: existing?.layout,
        revisions: [revision, ...(existing?.revisions ?? [])],
      });
      done.push(...summary);
    }
  }
  if (target.frequency !== undefined && target.frequency !== doc.frequency && !doc.isReferenceOnly) {
    const master = masterRepository.get();
    const overrides: Record<string, ScheduleOverride> = { ...(master.scheduleOverrides ?? {}) };
    const frequency = target.frequency as Frequency;
    if (issued && frequency === issued.frequency) delete overrides[doc.id];
    else overrides[doc.id] = { schedule: scheduleFor(frequency, doc.schedule), frequency, since: todayISO(), by: actor };
    masterRepository.update({ scheduleOverrides: overrides });
    removeOffScheduleShells();
    done.push(`Frequency "${doc.frequency}" → "${frequency}"`);
  }
  if (target.responsibleRole !== undefined) {
    const master = masterRepository.get();
    const before = master.documentRoleKeywords?.[doc.id] ?? "";
    if (before !== target.responsibleRole) {
      masterRepository.update({ documentRoleKeywords: { ...(master.documentRoleKeywords ?? {}), [doc.id]: target.responsibleRole } });
      done.push(`Responsible role "${before}" → "${target.responsibleRole}"`);
    }
  }
  return done;
}

/** The format's own values that differ from the issued ones, as a version keeps them (so a restore can put them back). */
function pushedSnapshot(): Record<string, Partial<Record<FormatField, string>>> {
  const out: Record<string, Partial<Record<FormatField, string>>> = {};
  for (const line of buildFormatLines()) {
    if (!line.doc) continue;
    const own: Partial<Record<FormatField, string>> = {};
    for (const f of PUSHED_FORMAT_FIELDS) if (line.values[f] !== line.defaults[f]) own[f] = line.values[f];
    if (Object.keys(own).length) out[line.doc.id] = own;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// re-working the open records of a format whose formula changed

const OPEN = new Set(["Scheduled", "Due", "In Progress", "Rejected"]);

function reworkOpenRecords(documentIds: string[], versionNo: number, actor: string): number {
  const changed: RecordInstance[] = [];
  const now = new Date().toISOString();
  for (const id of documentIds) {
    const doc = documentRepository.getByIdUnscoped(id);
    if (!doc) continue;
    for (const r of recordRepository.queryUnscoped({ documentId: id })) {
      if (!OPEN.has(r.status) || !r.data) continue;
      const next = withComputedCells(id, r.data);
      if (next === r.data || JSON.stringify(next) === JSON.stringify(r.data)) continue;
      const changes = diffRecordData(r.data, next, fieldLabels(doc.kind, doc.id));
      const entry = makeEntry("edited", actor, { note: `Worked out again with the formula changed in Indexing v${versionNo}`, changes });
      changed.push({ ...r, data: next, updatedAt: now, history: [...(r.history ?? []), entry] });
    }
  }
  if (changed.length) recordRepository.upsertMany(changed);
  return changed.length;
}

/**
 * THE OPEN RECORDS A SAVE WOULD WORK OUT AGAIN (the owner, 31-Oct-2026: said before the save, so the super admin knows
 * what a formula change reaches): per format whose formula the draft changes, how many of its open records there are.
 */
export function openRecordsUnderFormulas(draft: IndexDraft, state: IndexState = readIndexState()): { documentId: string; label: string; count: number }[] {
  const docs = new Set<string>();
  for (const [slotId, expr] of Object.entries(draft.formulas)) {
    const slot = formulaSlot(slotId);
    if (!slot) continue;
    const after = expr === null || expr.trim() === slot.defaultExpr ? null : expr.trim();
    if ((after ?? slot.defaultExpr) === currentFormula(slotId, state)) continue;
    slot.documentIds.forEach((d) => docs.add(d));
  }
  const out: { documentId: string; label: string; count: number }[] = [];
  for (const id of docs) {
    const doc = documentRepository.getByIdUnscoped(id);
    if (!doc) continue;
    const count = recordRepository.queryUnscoped({ documentId: id }).filter((r) => OPEN.has(r.status) && !!r.data).length;
    if (count > 0) out.push({ documentId: id, label: `${doc.formatNo} ${doc.name}`, count });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// saving

export type SaveResult = { ok: true; versionNo: number; changes: IndexChange[]; reworked: number } | { ok: false; error: string };

/** Saves the draft as the next version. `kind` says what kind of save it was ("edit", "reset to default", "restore of v3"). */
export function saveIndexDraft(draft: IndexDraft, reason: string, actor: string, kind = "edit"): SaveResult {
  if (!reason.trim()) return { ok: false, error: "Say why the index is changing — it is kept with the version." };
  const formatLines = buildFormatLines();
  const documentLines = buildDocumentLines();
  const changes = describeDraft(draft, formatLines, documentLines);
  if (changes.length === 0) return { ok: false, error: "Nothing has been changed yet." };
  for (const [slotId, expr] of Object.entries(draft.formulas)) {
    if (expr === null) continue;
    const problem = formulaProblem(slotId, expr);
    if (problem) return { ok: false, error: `${formulaSlot(slotId)?.cell ?? slotId}: ${problem}` };
  }
  for (const [id, value] of Object.entries(draft.ranges ?? {})) {
    const def = rangeDefinition(id);
    if (!def || value === null) continue;
    const problem = rangeProblem(def, value);
    if (problem) return { ok: false, error: `${def.formatNo} ${def.what}: ${problem}` };
  }

  const state = readIndexState();
  const versionNo = currentVersionNo(state) + 1;
  const at = new Date().toISOString();
  const byKey = new Map(formatLines.map((l) => [l.key, l]));

  // 1. The index's own values: kept only where they differ from the default.
  const formats: IndexSnapshot["formats"] = {};
  for (const [k, v] of Object.entries(state.current.formats)) formats[k] = { ...v };
  for (const [key, fields] of Object.entries(draft.formats)) {
    const line = byKey.get(key);
    if (!line) continue;
    const own = { ...(formats[key] ?? {}) };
    for (const [f, value] of Object.entries(fields) as [FormatField, string][]) {
      if (line.doc && PUSHED_FORMAT_FIELDS.includes(f)) continue;
      if (value === line.defaults[f]) delete own[f];
      else own[f] = value;
    }
    if (Object.keys(own).length) formats[key] = own;
    else delete formats[key];
  }
  const documents: IndexSnapshot["documents"] = {};
  for (const [k, v] of Object.entries(state.current.documents)) documents[k] = { ...v };
  const docByKey = new Map(documentLines.map((l) => [l.key, l]));
  for (const [key, fields] of Object.entries(draft.documents)) {
    const line = docByKey.get(key);
    if (!line) continue;
    const own = { ...(documents[key] ?? {}) };
    for (const [f, value] of Object.entries(fields) as [DocumentField, string][]) {
      if (value === line.defaults[f]) delete own[f];
      else own[f] = value;
    }
    if (Object.keys(own).length) documents[key] = own;
    else delete documents[key];
  }

  // 2. The formats' own values, written where the app keeps them.
  const pushedDocs = new Set<string>();
  for (const [key, fields] of Object.entries(draft.formats)) {
    const line = byKey.get(key);
    if (!line?.doc) continue;
    const target: Partial<Record<FormatField, string>> = {};
    for (const f of PUSHED_FORMAT_FIELDS) if (fields[f] !== undefined && fields[f] !== line.values[f]) target[f] = fields[f];
    if (Object.keys(target).length === 0) continue;
    const doc = documentRepository.getByIdUnscoped(line.doc.id);
    if (!doc) continue;
    const done = pushFormatValues(doc, target, actor, reason.trim(), versionNo);
    if (done.length) {
      pushedDocs.add(doc.id);
      logActivity("Format changed from Indexing", lineLabel(line), `Indexing v${versionNo}: ${done.join("; ")}. Reason: ${reason.trim()}`, doc.id);
    }
  }

  // 3. The formulas: the new one in force from now, the old one kept in the timeline.
  const formulas = { ...state.current.formulas };
  const timelines: IndexState["formulas"] = {};
  for (const [k, v] of Object.entries(state.formulas)) timelines[k] = [...v];
  const reworkDocs = new Set<string>();
  for (const [slotId, expr] of Object.entries(draft.formulas)) {
    const slot = formulaSlot(slotId);
    if (!slot) continue;
    const before = currentFormula(slotId, state);
    const after = expr === null || expr.trim() === slot.defaultExpr ? null : expr.trim();
    if ((after ?? slot.defaultExpr) === before) continue;
    if (after === null) delete formulas[slotId];
    else formulas[slotId] = after;
    timelines[slotId] = [...(timelines[slotId] ?? []), { expr: after, since: at, by: actor, version: versionNo }];
    slot.documentIds.forEach((d) => reworkDocs.add(d));
  }

  // 4. The ranges: the new one in force from now (signed records keep theirs), the old one kept in the timeline.
  const ranges: Record<string, RangeValue> = { ...(state.current.ranges ?? {}) };
  const rangeTimelines: IndexState["ranges"] = {};
  for (const [k, v] of Object.entries(state.ranges ?? {})) rangeTimelines[k] = [...v];
  for (const [id, value] of Object.entries(draft.ranges ?? {})) {
    const def = rangeDefinition(id);
    if (!def) continue;
    const before = currentRange(id, state);
    const target = value === null || sameRange(value, rangeDefault(def)) ? null : value;
    if (sameRange(target ?? rangeDefault(def), before)) continue;
    if (target === null) delete ranges[id];
    else ranges[id] = target;
    rangeTimelines[id] = [...(rangeTimelines[id] ?? []), { value: target, since: at, by: actor, version: versionNo }];
  }

  // 5. The printed words: the new ones from now (signed records keep theirs), the old ones kept in the timeline.
  const texts: Record<string, TextEdit[]> = { ...(state.current.texts ?? {}) };
  const textTimelines: NonNullable<IndexState["texts"]> = {};
  for (const [k, v] of Object.entries(state.texts ?? {})) textTimelines[k] = [...v];
  for (const [docId, edits] of Object.entries(draft.texts ?? {})) {
    const target = edits ? cleanEdits(edits) : [];
    if (sameEdits(target, textEditsFor(docId, at, state))) continue;
    if (target.length === 0) delete texts[docId];
    else texts[docId] = target;
    textTimelines[docId] = [...(textTimelines[docId] ?? []), { edits: target.length ? target : null, since: at, by: actor, version: versionNo }];
  }

  const current: IndexSnapshot = {
    formats,
    documents,
    ranges,
    texts,
    addedFormats: [...state.current.addedFormats, ...draft.addedFormats],
    addedDocuments: [...state.current.addedDocuments, ...draft.addedDocuments],
    formulas,
  };
  const next: IndexState = {
    schema: 1,
    current,
    formulas: timelines,
    ranges: rangeTimelines,
    texts: textTimelines,
    // The version keeps the formats' own values as they now stand (already written above), so restoring it can put them back.
    versions: [{ no: versionNo, at, by: actor, reason: reason.trim(), kind, changes, snapshot: { ...current, pushed: pushedSnapshot() } }, ...state.versions],
  };
  if (!writeIndexState(next)) return { ok: false, error: "The index could not be stored." };

  const reworked = reworkDocs.size ? reworkOpenRecords([...reworkDocs], versionNo, actor) : 0;
  logActivity("Index saved", `Indexing v${versionNo}`, `${changes.length} change${changes.length === 1 ? "" : "s"} (${kind}). Reason: ${reason.trim()}${reworked ? `. ${reworked} open record${reworked === 1 ? "" : "s"} worked out again with the new formula.` : ""}`);
  return { ok: true, versionNo, changes, reworked };
}

/** The draft that brings the index back to `snapshot` (an old version's, or the defaults' when it is empty). */
export function draftToSnapshot(snapshot: IndexSnapshot): IndexDraft {
  const draft = emptyDraft();
  const formatLines = buildFormatLines();
  for (const line of formatLines) {
    if (line.addedInIndex) continue;
    const fields: Partial<Record<FormatField, string>> = {};
    for (const f of Object.keys(line.values) as FormatField[]) {
      const pushed = !!line.doc && PUSHED_FORMAT_FIELDS.includes(f);
      const target = pushed ? (snapshot.pushed?.[line.doc!.id]?.[f] ?? line.defaults[f]) : (snapshot.formats[line.key]?.[f] ?? line.defaults[f]);
      if (target !== line.values[f]) fields[f] = target;
    }
    if (Object.keys(fields).length) draft.formats[line.key] = fields;
  }
  for (const line of buildDocumentLines()) {
    if (line.addedInIndex) continue;
    const fields: Partial<Record<DocumentField, string>> = {};
    for (const f of Object.keys(line.values) as DocumentField[]) {
      const target = snapshot.documents[line.key]?.[f] ?? line.defaults[f];
      if (target !== line.values[f]) fields[f] = target;
    }
    if (Object.keys(fields).length) draft.documents[line.key] = fields;
  }
  for (const slot of FORMULA_SLOTS) {
    const target = snapshot.formulas[slot.id] ?? null;
    const now = readIndexState().current.formulas[slot.id] ?? null;
    if (target !== now) draft.formulas[slot.id] = target;
  }
  for (const def of rangeDefinitions()) {
    if (def.kind === "typed" || def.kind === "scoreBands") continue;
    const target = snapshot.ranges?.[def.id] ?? null;
    const now = readIndexState().current.ranges?.[def.id] ?? null;
    if (!sameRange(target ?? rangeDefault(def), now ?? rangeDefault(def))) draft.ranges[def.id] = target;
  }
  const textsNow = readIndexState().current.texts ?? {};
  for (const docId of new Set([...Object.keys(snapshot.texts ?? {}), ...Object.keys(textsNow)])) {
    const target = snapshot.texts?.[docId] ?? null;
    if (!sameEdits(target, textsNow[docId])) draft.texts![docId] = target;
  }
  return draft;
}

/** Restores version `no` (0 = the defaults) as a new version. Lines added after it are kept out of the index again. */
export function restoreVersion(no: number, reason: string, actor: string): SaveResult {
  if (!reason.trim()) return { ok: false, error: "Say why the index is changing — it is kept with the version." };
  const state = readIndexState();
  const version = no === 0 ? null : state.versions.find((v) => v.no === no);
  if (no !== 0 && !version) return { ok: false, error: `There is no version ${no}.` };
  const snapshot = version ? version.snapshot : emptySnapshot();
  const draft = draftToSnapshot(snapshot);
  const addedNow = state.current.addedFormats.length + state.current.addedDocuments.length;
  const addedThen = snapshot.addedFormats.length + snapshot.addedDocuments.length;
  if (draftIsEmpty(draft) && addedNow === addedThen) return { ok: false, error: no === 0 ? "The index is already as issued." : `The index is already as it was in version ${no}.` };
  const result = saveIndexDraft(draft, reason, actor, no === 0 ? "reset to default" : `restore of v${no}`);
  if (!result.ok && addedNow === addedThen) return result;
  // The added lines come back as they were then.
  const after = readIndexState();
  const fixed: IndexState = {
    ...after,
    current: { ...after.current, addedFormats: [...snapshot.addedFormats], addedDocuments: [...snapshot.addedDocuments] },
  };
  if (!result.ok) {
    // Only the added lines differ: save that alone as the version.
    const versionNo = currentVersionNo(after) + 1;
    const at = new Date().toISOString();
    fixed.versions = [{ no: versionNo, at, by: actor, reason: reason.trim(), kind: no === 0 ? "reset to default" : `restore of v${no}`, changes: [{ area: "added-format", key: "*", label: "Lines added in the index", field: "Added lines", before: String(addedNow), after: String(addedThen) }], snapshot: { ...fixed.current, pushed: pushedSnapshot() } }, ...after.versions];
    writeIndexState(fixed);
    return { ok: true, versionNo, changes: fixed.versions[0].changes, reworked: 0 };
  }
  fixed.versions = [{ ...after.versions[0], snapshot: { ...fixed.current, pushed: after.versions[0].snapshot.pushed ?? {} } }, ...after.versions.slice(1)];
  writeIndexState(fixed);
  return result;
}

/** Each difference between two versions' snapshots (0 = the defaults), for the compare screen. */
export function compareSnapshots(a: IndexSnapshot, b: IndexSnapshot): { what: string; field: string; a: string; b: string }[] {
  const out: { what: string; field: string; a: string; b: string }[] = [];
  const lines = buildFormatLines(emptySnapshot());
  const labelOf = new Map(lines.map((l) => [l.key, lineLabel(l)]));
  const docLabel = new Map(lines.filter((l) => l.doc).map((l) => [l.doc!.id, lineLabel(l)]));
  const defaultsOf = new Map(lines.map((l) => [l.key, l.defaults]));
  const keys = new Set([...Object.keys(a.formats), ...Object.keys(b.formats)]);
  for (const key of keys) {
    const fa = a.formats[key] ?? {};
    const fb = b.formats[key] ?? {};
    const defaults = defaultsOf.get(key);
    for (const f of new Set([...Object.keys(fa), ...Object.keys(fb)]) as Set<FormatField>) {
      const va = fa[f] ?? defaults?.[f] ?? "";
      const vb = fb[f] ?? defaults?.[f] ?? "";
      if (va !== vb) out.push({ what: labelOf.get(key) ?? key, field: FORMAT_FIELD_LABELS[f], a: va, b: vb });
    }
  }
  const docIds = new Set([...Object.keys(a.pushed ?? {}), ...Object.keys(b.pushed ?? {})]);
  for (const id of docIds) {
    const pa = a.pushed?.[id] ?? {};
    const pb = b.pushed?.[id] ?? {};
    const defaults = defaultsOf.get(`doc:${id}`);
    for (const f of new Set([...Object.keys(pa), ...Object.keys(pb)]) as Set<FormatField>) {
      const va = pa[f] ?? defaults?.[f] ?? "";
      const vb = pb[f] ?? defaults?.[f] ?? "";
      if (va !== vb) out.push({ what: docLabel.get(id) ?? id, field: FORMAT_FIELD_LABELS[f], a: va, b: vb });
    }
  }
  const docs = new Set([...Object.keys(a.documents), ...Object.keys(b.documents)]);
  const docLines = new Map(buildDocumentLines(emptySnapshot()).map((l) => [l.key, l]));
  for (const key of docs) {
    const fa = a.documents[key] ?? {};
    const fb = b.documents[key] ?? {};
    const line = docLines.get(key);
    for (const f of new Set([...Object.keys(fa), ...Object.keys(fb)]) as Set<DocumentField>) {
      const va = fa[f] ?? line?.defaults[f] ?? "";
      const vb = fb[f] ?? line?.defaults[f] ?? "";
      if (va !== vb) out.push({ what: line ? `${line.defaults.documentNumber} ${line.defaults.description}` : key, field: DOCUMENT_FIELD_LABELS[f], a: va, b: vb });
    }
  }
  for (const slot of FORMULA_SLOTS) {
    const va = a.formulas[slot.id] ?? slot.defaultExpr;
    const vb = b.formulas[slot.id] ?? slot.defaultExpr;
    if (va !== vb) out.push({ what: `${slot.formats.split(" ")[0]} ${slot.cell}`, field: "Formula", a: va, b: vb });
  }
  for (const def of rangeDefinitions()) {
    if (def.kind === "typed" || def.kind === "scoreBands") continue;
    const va = a.ranges?.[def.id] ?? rangeDefault(def);
    const vb = b.ranges?.[def.id] ?? rangeDefault(def);
    if (!sameRange(va, vb)) out.push({ what: `${def.formatNo} ${def.what}`, field: "Range", a: rangeText(def, va), b: rangeText(def, vb) });
  }
  for (const docId of new Set([...Object.keys(a.texts ?? {}), ...Object.keys(b.texts ?? {})])) {
    const doc = SEED_DOCUMENTS.find((d) => d.id === docId);
    for (const d of diffEdits(a.texts?.[docId] ?? [], b.texts?.[docId] ?? [])) out.push({ what: doc ? `${doc.formatNo} ${doc.name}` : docId, field: `Text ${d.words}`, a: d.before, b: d.after });
  }
  const added = (s: IndexSnapshot) => s.addedFormats.length + s.addedDocuments.length;
  if (added(a) !== added(b)) out.push({ what: "Lines added in the index", field: "Count", a: String(added(a)), b: String(added(b)) });
  return out;
}

/** A new line's key: unique, never reused. */
export const newLineKey = (prefix: "added-format" | "added-document"): string => `${prefix}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
