// APPLYING WHAT AN UPLOADED WORD/EXCEL FILE CHANGED (REQUIREMENTS §81).
//
// "Add options for the user in each and every document of every module so he
// can upload the Word or Excel with whatever changes the user has done in that
// document." The file has been read (engine/roundTrip/readFile.ts) and the
// changes worked out against the record as it stands (engine/roundTrip/plan.ts);
// the person has seen them and pressed Apply (components/common/UploadChanges.tsx).
// This writes them — and only them — the way every other change to a record is
// written:
//
//   the record open on screen   through the page's own AssistantTarget.commit,
//                               recorded as "imported" — the page saves it, draws
//                               it and keeps its autosave in step, exactly as when
//                               Mitra changes it
//   any other record            through saveDraft in the repository, the same
//                               history entry, and the AppStore bumped so every
//                               page showing it redraws
//
// A record that has been submitted or verified is reopened for correction FIRST,
// with the reason recorded ("Changes uploaded from <file>"), so it has to be
// submitted and verified again — an upload never slips past verification, just
// as Mitra's changes never do. A record that cannot be reopened (a sheet kept
// on a format revision since replaced, a page that offers no correction) is
// left exactly as it is, and the result says so.
//
// Nothing here throws: every record is tried on its own, and one that cannot
// be changed is reported, not fatal.

import type { AssistantTarget } from "../../store/AssistantContext";
import type { RecordInstance, RecordStatus } from "../../types";
import { recordRepository } from "../../data/repositories/recordRepository";
import { documentRepository } from "../../data/repositories/documentRepository";
import { getLogSheetLayout } from "../../data/seed/logSheetLayouts";
import { logActivity } from "../../utils/activityLog";
import { generateId } from "../../utils/id";
import { withComputedCells } from "../computedCells";
import { isDocumentIdVisible } from "../departmentScope";
import { emitCue } from "../engageBus";
import { isCorrectableStatus, isEditableStatus, reopenForCorrection, saveDraft } from "../recordLifecycle";
import { fieldLabels } from "../recordPatch";
import { blankRow } from "../recordRowCommands";
import { supersededRevisionOf } from "../validation";
import { applyPlanToData, type ImportPlan, type PlanContext } from "./plan";

/** What of the open page's AssistantTarget an upload uses. */
export type UploadTarget = Pick<AssistantTarget, "recordId" | "documentId" | "status" | "editable" | "getData" | "commit" | "reopen">;

/** The note on the record's history entry: `Changes uploaded from "<file>" (<N> boxes)`. */
export function importNote(fileName: string, boxes: number): string {
  return `Changes uploaded from "${fileName}" (${boxes} ${boxes === 1 ? "box" : "boxes"})`;
}

/** Why a signed-off record was reopened, as recorded on it. */
export function reopenReason(fileName: string): string {
  return `Changes uploaded from ${fileName}`;
}

/** The record ids the plan changes or adds lines to, in the order the file names them. */
export function recordsWithWork(plan: ImportPlan): string[] {
  const ids = new Set<string>();
  for (const r of plan.records) if (plan.changes.some((c) => c.recordId === r.recordId) || plan.appends.some((a) => a.recordId === r.recordId)) ids.add(r.recordId);
  for (const c of plan.changes) ids.add(c.recordId);
  for (const a of plan.appends) ids.add(a.recordId);
  return Array.from(ids);
}

/** How many boxes and new lines the plan holds for one record. */
export function workFor(plan: ImportPlan, recordId: string): number {
  return plan.changes.filter((c) => c.recordId === recordId).length + plan.appends.filter((a) => a.recordId === recordId).length;
}

/** fn(), or `fallback` when it throws. */
function computeOr<T, F>(fn: () => T, fallback: F): T | F {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

const safeTarget = (getTarget: () => UploadTarget | null): UploadTarget | null => computeOr(getTarget, null);

/** A stored record the viewer may see, or undefined. */
function storedRecord(recordId: string): RecordInstance | undefined {
  const r = recordRepository.getById(recordId);
  return r && isDocumentIdVisible(r.documentId) ? r : undefined;
}

/**
 * What planImport reads the records through: the open page's live data for the
 * record on screen (what is typed there counts, even before the autosave), the
 * repository for any other; and a blank line for a free-row log sheet's grid,
 * built exactly as its own Add Row builds one.
 */
export function uploadPlanContext(getTarget: () => UploadTarget | null, today: string): PlanContext {
  return {
    today,
    getRecord: (recordId) => {
      const t = safeTarget(getTarget);
      if (t && t.recordId === recordId) return { data: t.getData(), documentId: t.documentId };
      const r = storedRecord(recordId);
      return r ? { data: r.data, documentId: r.documentId } : null;
    },
    blankItem: (documentId, listPath) => {
      if (listPath !== "rows") return null;
      const layout = getLogSheetLayout(documentId);
      if (!layout || layout.rowMode.kind !== "free") return null;
      return { ...blankRow(layout, generateId("row")) };
    },
  };
}

/** How a record in the file can be changed. */
export type RecordWay =
  | { way: "edit"; via: "page" | "store"; status: RecordStatus }
  | { way: "reopen"; via: "page" | "store"; status: RecordStatus }
  | { way: "locked"; via: "page" | "store"; status: RecordStatus; why: "superseded" | "status" | "page" }
  | { way: "gone" };

export function howToChange(recordId: string, getTarget: () => UploadTarget | null): RecordWay {
  const t = safeTarget(getTarget);
  if (t && t.recordId === recordId) {
    if (t.editable) return { way: "edit", via: "page", status: t.status };
    if (t.reopen) return { way: "reopen", via: "page", status: t.status };
    return { way: "locked", via: "page", status: t.status, why: supersededOf(recordId) ? "superseded" : "page" };
  }
  const r = storedRecord(recordId);
  if (!r) return { way: "gone" };
  if (isEditableStatus(r.status)) return { way: "edit", via: "store", status: r.status };
  if (isCorrectableStatus(r.status) && !supersededRevisionOf(r)) return { way: "reopen", via: "store", status: r.status };
  return { way: "locked", via: "store", status: r.status, why: supersededRevisionOf(r) ? "superseded" : "status" };
}

function supersededOf(recordId: string): boolean {
  const r = recordRepository.getById(recordId);
  return !!r && !!supersededRevisionOf(r);
}

/** Does the file belong on this screen? The same record, another record of the same document, or another document altogether. */
export function fileAgainstScreen(
  envelope: { documentId: string; recordIds: string[] },
  screen: { documentId: string; recordIds: string[] }
): "same" | "other-record" | "other-document" {
  if (envelope.documentId !== screen.documentId) return "other-document";
  if (screen.recordIds.length === 0) return "same";
  const onScreen = new Set(screen.recordIds);
  return envelope.recordIds.every((id) => onScreen.has(id)) ? "same" : "other-record";
}

// ---------------------------------------------------------------------------
// applying

export interface AppliedRecord {
  recordId: string;
  via: "page" | "store";
  /** Boxes changed and lines added. */
  applied: number;
  /** Labels of the changes that could not be written (a line no longer in the record …). */
  failed: string[];
  reopened: boolean;
  /** Why nothing was applied to it. */
  skipped?: "gone" | "locked" | "not-reopened" | "not-saved";
}

export interface ApplyResult {
  applied: number;
  failed: string[];
  records: AppliedRecord[];
}

export interface ApplyOptions {
  /** Who is uploading — the name on the history entries. */
  actor: string;
  /** The uploaded file's name (the plan's when not given). */
  fileName?: string;
  /** The open page's target, read fresh at every step. */
  getTarget: () => UploadTarget | null;
  /** Called once when a record was written through the repository (bump the AppStore). */
  onStored?: () => void;
  /** How long to wait for a reopened page to become editable, ms. */
  waitMs?: number;
}

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    try {
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => finish());
    } catch {
      /* no frames: the timer below */
    }
    // A hidden tab draws no frames — never wait on one alone.
    setTimeout(finish, 50);
  });

async function until(ok: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  for (;;) {
    if (computeOr(ok, false)) return true;
    if (Date.now() >= end) return false;
    await nextFrame();
  }
}

function logUpload(plan: ImportPlan, recordId: string, applied: number, fileName: string): void {
  try {
    const r = recordRepository.getById(recordId);
    const documentId = r?.documentId ?? plan.envelope.documentId;
    const doc = documentRepository.getById(documentId);
    const number = doc && doc.formatNo && !doc.formatNo.startsWith("TO BE") ? `${doc.formatNo} ` : plan.envelope.formatNo && !plan.envelope.formatNo.startsWith("TO BE") ? `${plan.envelope.formatNo} ` : "";
    const what = `${number}${doc?.name ?? documentId}${r?.dueDate ? ` — ${r.dueDate}` : ""}`;
    logActivity(
      plan.envelope.kind === "docx" ? "Document changes uploaded from Word" : "Document changes uploaded from Excel",
      what,
      `${applied} ${applied === 1 ? "change" : "changes"} from "${fileName}"`,
      documentId
    );
  } catch {
    /* the log line is never worth failing the upload over */
  }
}

/** Did the record's history take this upload's entry? (Records the repository does not hold — the reference documents — are taken on trust.) */
function saved(recordId: string, note: string, since: string): boolean {
  const r = recordRepository.getById(recordId);
  if (!r) return true;
  return !!r.history?.some((h) => h.action === "imported" && h.note === note && h.at >= since);
}

async function throughPage(plan: ImportPlan, recordId: string, opts: ApplyOptions, fileName: string): Promise<AppliedRecord> {
  const out: AppliedRecord = { recordId, via: "page", applied: 0, failed: [], reopened: false };
  let t = safeTarget(opts.getTarget);
  if (!t || t.recordId !== recordId) return { ...out, skipped: "gone" };
  // A dry run first: nothing is reopened for changes that could not be written anyway.
  const dry = computeOr(() => applyPlanToData(t!.getData(), recordId, plan), null);
  if (!dry || dry.applied === 0) return { ...out, failed: dry?.failed ?? [], skipped: dry ? undefined : "not-saved" };
  if (!t.editable) {
    if (!t.reopen) return { ...out, skipped: "locked" };
    try {
      t.reopen(reopenReason(fileName));
    } catch {
      return { ...out, skipped: "not-reopened" };
    }
    const open = await until(() => {
      const x = opts.getTarget();
      return !!x && x.recordId === recordId && x.editable;
    }, opts.waitMs ?? 3000);
    if (!open) return { ...out, skipped: "not-reopened" };
    out.reopened = true;
    t = safeTarget(opts.getTarget);
    if (!t) return { ...out, skipped: "not-reopened" };
  }
  const since = new Date(Date.now() - 1).toISOString();
  const next = computeOr(() => applyPlanToData(t!.getData(), recordId, plan), null);
  if (!next) return { ...out, skipped: "not-saved" };
  out.failed = next.failed;
  if (next.applied === 0) return out;
  const note = importNote(fileName, next.applied);
  try {
    t.commit(next.data, note, "imported");
  } catch {
    return { ...out, skipped: "not-saved" };
  }
  if (!saved(recordId, note, since)) return { ...out, skipped: "not-saved" };
  out.applied = next.applied;
  return out;
}

function throughStore(plan: ImportPlan, recordId: string, opts: ApplyOptions, fileName: string): AppliedRecord {
  const out: AppliedRecord = { recordId, via: "store", applied: 0, failed: [], reopened: false };
  let record = storedRecord(recordId);
  if (!record) return { ...out, skipped: "gone" };
  const next = computeOr(() => applyPlanToData(record!.data, recordId, plan), null);
  if (!next) return { ...out, skipped: "not-saved" };
  out.failed = next.failed;
  if (next.applied === 0) return out;
  if (!isEditableStatus(record.status)) {
    if (!isCorrectableStatus(record.status) || supersededRevisionOf(record)) return { ...out, skipped: "locked" };
    try {
      record = reopenForCorrection(record, opts.actor, reopenReason(fileName));
    } catch {
      return { ...out, skipped: "not-reopened" };
    }
    if (!isEditableStatus(record.status)) return { ...out, skipped: "not-reopened" };
    out.reopened = true;
  }
  const note = importNote(fileName, next.applied);
  try {
    const doc = documentRepository.getById(record.documentId);
    const labels = doc ? fieldLabels(doc.kind, doc.id, record) : undefined;
    saveDraft(record, withComputedCells(record.documentId, next.data), opts.actor, { action: "imported", note, labels });
  } catch {
    return { ...out, skipped: "not-saved" };
  }
  out.applied = next.applied;
  return out;
}

/**
 * Writes the plan's changes into each record it names, reopening a signed-off
 * one for correction first. Resolves with what was done to each; never rejects.
 */
export async function applyImport(plan: ImportPlan, opts: ApplyOptions): Promise<ApplyResult> {
  const fileName = opts.fileName ?? plan.fileName;
  const records: AppliedRecord[] = [];
  let stored = false;
  for (const recordId of recordsWithWork(plan)) {
    let result: AppliedRecord;
    try {
      const t = safeTarget(opts.getTarget);
      result = t && t.recordId === recordId ? await throughPage(plan, recordId, opts, fileName) : throughStore(plan, recordId, opts, fileName);
    } catch {
      result = { recordId, via: "store", applied: 0, failed: [], reopened: false, skipped: "not-saved" };
    }
    if (result.via === "store" && (result.applied > 0 || result.reopened)) stored = true;
    if (result.applied > 0) logUpload(plan, recordId, result.applied, fileName);
    records.push(result);
  }
  if (stored) {
    try {
      opts.onStored?.();
    } catch {
      /* the page redraws on its next bump anyway */
    }
  }
  const applied = records.reduce((n, r) => n + r.applied, 0);
  if (applied > 0) emitCue("success");
  return { applied, failed: records.flatMap((r) => r.failed), records };
}
