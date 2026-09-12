import type { DocumentDefinition, FieldChange, RecordInstance, RecordStatus } from "../types";
import { recordRepository } from "../data/repositories/recordRepository";
import { validateForSubmit, validateForVerify, ValidationResult } from "./validation";
import { appendHistory, diffRecordData, makeEntry, withEditHistory } from "./recordHistory";

// Scheduled -> Due -> In Progress -> Submitted -> Pending Verification -> Verified
//                                        \-> Rejected -> (edit) -> Pending Verification
// Any Submitted / Pending Verification / Verified / Rejected record can be
// REOPENED FOR CORRECTION (with a reason) -> In Progress -> Submit -> verify
// again. See DATA_MODEL.md for the full state diagram. A record can never
// reach "Verified" without passing validateForVerify (section 16
// requirement), and every transition and every edit is appended to the
// record's history (engine/recordHistory.ts) — nothing is overwritten
// without a trace.

/** Statuses in which the record's own data can be edited directly. */
export const EDITABLE_STATUSES: RecordStatus[] = ["Scheduled", "Due", "In Progress"];
/** Statuses from which a record can be reopened to correct a mistake. */
export const CORRECTABLE_STATUSES: RecordStatus[] = ["Submitted", "Pending Verification", "Verified", "Rejected"];

export const isEditableStatus = (s: RecordStatus): boolean => EDITABLE_STATUSES.includes(s);
export const isCorrectableStatus = (s: RecordStatus): boolean => CORRECTABLE_STATUSES.includes(s);

export function saveDraft<T>(
  record: RecordInstance<T>,
  newData: T,
  actorName = "User",
  opts: { action?: "edited" | "assistant-edit"; note?: string; labels?: Record<string, string> } = {}
): RecordInstance<T> {
  const nextStatus = record.status === "Due" || record.status === "Scheduled" ? "In Progress" : record.status;
  const withHistory = withEditHistory(record, newData, actorName, opts);
  const updated: RecordInstance<T> = { ...withHistory, status: nextStatus };
  return recordRepository.upsert(updated as RecordInstance) as RecordInstance<T>;
}

export function submitRecord(
  doc: DocumentDefinition,
  record: RecordInstance,
  actorName: string
): { record: RecordInstance; result: ValidationResult } {
  const result = validateForSubmit(doc, record);
  if (!result.valid) return { record, result };
  const now = new Date().toISOString();
  const wasCorrection = record.correction;
  const updated: RecordInstance = appendHistory(
    {
      ...record,
      status: "Pending Verification",
      submittedBy: actorName,
      submittedAt: now,
      // The rejection / earlier verification stamps describe a version that
      // no longer exists; the history keeps them.
      rejectedBy: undefined,
      rejectedAt: undefined,
      rejectionReason: undefined,
      verifiedBy: undefined,
      verifiedAt: undefined,
      correction: undefined,
    },
    makeEntry("submitted", actorName, { note: wasCorrection ? `Resubmitted after correction: ${wasCorrection.reason}` : undefined, fromStatus: record.status })
  );
  return { record: recordRepository.upsert(updated), result };
}

export function verifyRecord(
  doc: DocumentDefinition,
  record: RecordInstance,
  actorName: string
): { record: RecordInstance; result: ValidationResult } {
  const result = validateForVerify(doc, record);
  if (!result.valid) return { record, result };
  const now = new Date().toISOString();
  const updated: RecordInstance = appendHistory(
    { ...record, status: "Verified", verifiedBy: actorName, verifiedAt: now },
    makeEntry("verified", actorName, { fromStatus: record.status })
  );
  return { record: recordRepository.upsert(updated), result };
}

export function rejectRecord(record: RecordInstance, actorName: string, reason: string): RecordInstance {
  const now = new Date().toISOString();
  const updated: RecordInstance = appendHistory(
    { ...record, status: "Rejected", rejectedBy: actorName, rejectedAt: now, rejectionReason: reason },
    makeEntry("rejected", actorName, { note: reason, fromStatus: record.status })
  );
  return recordRepository.upsert(updated);
}

export function resumeAfterRejection(record: RecordInstance, actorName = "User"): RecordInstance {
  const updated: RecordInstance = appendHistory({ ...record, status: "In Progress" }, makeEntry("resumed", actorName, { fromStatus: record.status }));
  return recordRepository.upsert(updated);
}

/**
 * Reopens a submitted, verified or rejected record so a mistake can be put
 * right. A reason is required and recorded; the record goes back to In
 * Progress, so it has to be submitted and verified again — a correction to a
 * verified record is never quietly accepted. What the record said before
 * stays in its history, field by field, as each edit is saved.
 */
export function reopenForCorrection(record: RecordInstance, actorName: string, reason: string): RecordInstance {
  const why = reason.trim();
  if (!why) throw new Error("A reason is required to correct a record.");
  if (!isCorrectableStatus(record.status)) return record;
  const now = new Date().toISOString();
  const updated: RecordInstance = appendHistory(
    {
      ...record,
      status: "In Progress",
      // What it says right now is kept, so Cancel can put it back untouched.
      correction: { reason: why, by: actorName, at: now, fromStatus: record.status, dataBefore: record.data },
    },
    makeEntry("reopened", actorName, { note: why, fromStatus: record.status })
  );
  return recordRepository.upsert(updated);
}

/** What has been changed since Edit reopened the record — nothing, usually. */
export function correctionChanges(record: RecordInstance, labels: Record<string, string> = {}): FieldChange[] {
  const before = record.correction?.dataBefore;
  return before === undefined ? [] : diffRecordData(before, record.data, labels);
}

/**
 * CANCEL EDIT. Someone pressed Edit, then found there was nothing to put right
 * (or changed their mind). The record goes back to the status it was reopened
 * from and back to exactly what it said then — no half-corrected record left
 * behind, and no need to submit and verify it all over again. The cancellation
 * itself is written into the history, with whatever it put back, because the
 * reopening is in there too and the trail has to make sense to an auditor.
 */
export function cancelCorrection<T>(record: RecordInstance<T>, actorName: string, labels: Record<string, string> = {}): RecordInstance<T> {
  const correction = record.correction;
  if (!correction) return record;
  const restored = (correction.dataBefore === undefined ? record.data : correction.dataBefore) as T;
  const undone = diffRecordData(record.data, restored, labels);
  const note =
    undone.length === 0
      ? `Edit cancelled — nothing had been changed. Back to ${correction.fromStatus}.`
      : `Edit cancelled — ${undone.length} change${undone.length === 1 ? "" : "s"} put back. Back to ${correction.fromStatus}.`;
  const updated: RecordInstance<T> = appendHistory(
    { ...record, data: restored, status: correction.fromStatus, correction: undefined },
    makeEntry("correction-cancelled", actorName, { note, changes: undone.length ? undone : undefined, fromStatus: record.status })
  );
  return recordRepository.upsert(updated as RecordInstance) as RecordInstance<T>;
}

export function isOverdue(record: RecordInstance, todayISO: string): boolean {
  return (
    record.dueDate < todayISO &&
    ["Scheduled", "Due", "In Progress"].includes(record.status)
  );
}
