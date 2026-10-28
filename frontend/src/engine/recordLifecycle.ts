import type { DocumentDefinition, FieldChange, RecordHeaderBlock, RecordInstance, RecordStatus } from "../types";
import { recordRepository } from "../data/repositories/recordRepository";
import { validateForSubmit, validateForVerify, ValidationResult } from "./validation";
import { appendHistory, diffRecordData, makeEntry, recordLabel, withEditHistory } from "./recordHistory";
import { REACTION_EVENT, type ReactionEvent } from "./reactions";
import { computeReminders } from "./reminders";
import { compareISO, formatDisplayDate, todayISO } from "../utils/date";
import { documentRepository } from "../data/repositories/documentRepository";

// Scheduled -> Due -> In Progress -> Submitted -> Pending Verification -> Verified
//                                        \-> Rejected -> (edit) -> Pending Verification
// Any Submitted / Pending Verification / Verified / Rejected record can be
// REOPENED FOR CORRECTION (with a reason) -> In Progress -> Submit -> verify
// again. See docs/DATA_MODEL.md for the full state diagram. A record can never
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

// MITRA REACTS TO WORK DONE ON TIME OR LATE (REQUIREMENTS §64, engine/reactions.ts).
// A submit, a verify or a send-back that a PERSON made is announced to whoever
// is listening — the toast (components/common/MitraReaction.tsx) and Mitra's
// chat. Never for a demo record, and never for what the system or the
// assistant's own preparation does, which nobody did. (The generators do not
// come through here at all: engine/plantSimulation.ts writes a demo year's
// stamps itself. The one caller that submits several at once is Today's
// Briefing's Submit — a person's click — and the toast says those as one.)
function announce(record: RecordInstance, by: string, event: () => ReactionEvent): void {
  if (typeof window === "undefined" || record.isDemo || by === "System" || by === "Assistant") return;
  // By now the record IS submitted and stored. A reaction that cannot be worked
  // out (what is left due is read from every repository) must not make the page
  // believe it is not.
  try {
    window.dispatchEvent(new CustomEvent<ReactionEvent>(REACTION_EVENT, { detail: event() }));
  } catch (err) {
    console.error("Mitra's reaction could not be announced", err);
  }
}

/** Nothing of the person's visible documents is still due today or overdue. Read AFTER the submit is stored, and only for a record that was itself due. */
function nothingLeftDue(record: RecordInstance): boolean {
  if (compareISO(record.dueDate, todayISO()) > 0) return false;
  return !computeReminders(false).some((r) => r.urgency !== "upcoming");
}

export function saveDraft<T>(
  record: RecordInstance<T>,
  newData: T,
  actorName = "User",
  opts: { action?: "edited" | "assistant-edit" | "imported"; note?: string; labels?: Record<string, string> } = {}
): RecordInstance<T> {
  const nextStatus = record.status === "Due" || record.status === "Scheduled" ? "In Progress" : record.status;
  const withHistory = withEditHistory(record, newData, actorName, opts);
  const updated: RecordInstance<T> = { ...withHistory, status: nextStatus };
  return recordRepository.upsert(updated as RecordInstance) as RecordInstance<T>;
}

// ---------------------------------------------------------------------------
// THE RECORD'S OWN HEADER (REQUIREMENTS §86)

/** What the record's header block prints where nobody has typed over it: its due date, and the page its view prints. */
export interface HeaderDefaults {
  /** ISO date — the record's due date, on most views. */
  date: string;
  /** "1 of 1", or whatever the view prints. */
  page: string;
}

const HEADER_LABELS: Record<keyof RecordHeaderBlock, string> = { date: "Header · Date", page: "Header · Page No." };
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A header block as stored: a real date, a page written as something, and nothing that only repeats what the header prints anyway. */
export function cleanHeaderBlock(block: RecordHeaderBlock | null | undefined, defaults?: HeaderDefaults): RecordHeaderBlock | undefined {
  const date = (block?.date ?? "").trim();
  const page = (block?.page ?? "").trim();
  const keepDate = ISO_DAY.test(date) && date !== defaults?.date ? date : undefined;
  const keepPage = page && page !== defaults?.page ? page : undefined;
  return keepDate || keepPage ? { ...(keepDate ? { date: keepDate } : {}), ...(keepPage ? { page: keepPage } : {}) } : undefined;
}

/** The header block's lines that differ between two blocks, as the history names them. */
function headerChanges(before: RecordHeaderBlock | null | undefined, after: RecordHeaderBlock | null | undefined, defaults: HeaderDefaults): FieldChange[] {
  const shown = (k: keyof RecordHeaderBlock, b: RecordHeaderBlock | null | undefined): string =>
    k === "date" ? formatDisplayDate(b?.date ?? defaults.date) : (b?.page ?? defaults.page);
  return (["date", "page"] as const)
    .filter((k) => (before?.[k] ?? "") !== (after?.[k] ?? ""))
    .map((k) => ({ field: `headerBlock.${k}`, label: HEADER_LABELS[k], before: shown(k, before), after: shown(k, after) }));
}

/**
 * THE DATE AND THE PAGE NO. OF ONE RECORD, TYPED OVER ON ITS HEADER (REQUIREMENTS
 * §86). Only while the record can be written on — the same as its boxes — and
 * saved at once with a history line that names what the header said before and
 * after, as any edit's does. A value typed back to what the header prints anyway
 * drops the record's own, so the header follows the record again.
 */
export function saveHeaderBlock(record: RecordInstance, next: RecordHeaderBlock, actorName: string, defaults: HeaderDefaults): RecordInstance {
  if (!isEditableStatus(record.status)) return record;
  const clean = cleanHeaderBlock(next, defaults);
  const changes = headerChanges(record.headerBlock, clean, defaults);
  if (changes.length === 0) return record;
  const nextStatus = record.status === "Due" || record.status === "Scheduled" ? "In Progress" : record.status;
  const updated = appendHistory({ ...record, headerBlock: clean, status: nextStatus }, makeEntry("edited", actorName, { changes }));
  return recordRepository.upsert(updated);
}

/**
 * THE RECORD'S OWN DATE, CHANGED ON THE RECORD (REQUIREMENTS §136; the owner, 28-Oct-2026: "each and every document
 * when i click then that date is also editable"): the day the sheet is for, typed over beside its status while it can be
 * written on. The record moves to that day (its due date; its place in the schedule too, where the document is filled as
 * required rather than by a schedule), with a line in its history; the printed header's date follows unless one was typed
 * over on the header (§86). Another record of the document already on that day: nothing is changed, and the answer says so.
 */
export function changeRecordDate(record: RecordInstance, dateISO: string, periodKey: string, actorName: string): { record: RecordInstance; refused?: string } {
  if (!isEditableStatus(record.status) || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO) || dateISO === record.dueDate) return { record };
  const taken = recordRepository
    .queryUnscoped({ documentId: record.documentId, isDemo: !!record.isDemo })
    .find((r) => r.id !== record.id && (r.dueDate === dateISO || (r.periodKey !== undefined && r.periodKey === periodKey)));
  if (taken) return { record, refused: `There is already a record of this document dated ${formatDisplayDate(dateISO)}: open that one, or choose another day.` };
  const changes: FieldChange[] = [{ field: "dueDate", label: "Dated", before: formatDisplayDate(record.dueDate), after: formatDisplayDate(dateISO) }];
  const nextStatus = record.status === "Due" || record.status === "Scheduled" ? "In Progress" : record.status;
  const updated = appendHistory({ ...record, dueDate: dateISO, periodKey, status: nextStatus }, makeEntry("edited", actorName, { changes }));
  return { record: recordRepository.upsert(updated) };
}

/**
 * What a record's header prints where nothing was typed over (REQUIREMENTS §86): the record's own date, and
 * "1 of 1". One rule for the views and for the history of a correction, so both say what the header prints.
 * The Page No. holds a page number only (REQUIREMENTS §117, the owner, 16-Oct-2026, with "row 16 of the
 * October register" crossed out on F/HR/17): never words of DCRS's own; "(digital)" was one (§111 part 6).
 */
export function recordHeaderDefaults(record: Pick<RecordInstance, "documentId" | "dueDate">): HeaderDefaults {
  return { date: record.dueDate, page: "1 of 1" };
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
  const stored = recordRepository.upsert(updated);
  // Handed in before and put right since: the scorecard judges a record by when it was
  // FIRST submitted (engine/performance.ts), so this submit is not the one to call late.
  const again = !!record.history?.some((h) => h.action === "submitted");
  announce(stored, actorName, () => ({
    kind: "submitted",
    what: recordLabel(stored),
    dueDate: stored.dueDate,
    on: todayISO(),
    asRequired: doc.schedule.type === "as-required",
    again,
    lastOneDue: nothingLeftDue(stored),
    documentId: stored.documentId,
    recordId: stored.id,
    submittedAt: now,
  }));
  return { record: stored, result };
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
  const stored = recordRepository.upsert(updated);
  announce(stored, actorName, () => ({ kind: "verified", what: recordLabel(stored), documentId: stored.documentId, recordId: stored.id }));
  return { record: stored, result };
}

export function rejectRecord(record: RecordInstance, actorName: string, reason: string): RecordInstance {
  const now = new Date().toISOString();
  const updated: RecordInstance = appendHistory(
    { ...record, status: "Rejected", rejectedBy: actorName, rejectedAt: now, rejectionReason: reason },
    makeEntry("rejected", actorName, { note: reason, fromStatus: record.status })
  );
  const stored = recordRepository.upsert(updated);
  announce(stored, actorName, () => ({ kind: "rejected", what: recordLabel(stored), reason, documentId: stored.documentId, recordId: stored.id }));
  return stored;
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
      // What it says right now is kept, so Cancel can put it back untouched — its own header included (§86).
      correction: { reason: why, by: actorName, at: now, fromStatus: record.status, dataBefore: record.data, headerBlockBefore: record.headerBlock ?? null },
    },
    makeEntry("reopened", actorName, { note: why, fromStatus: record.status })
  );
  return recordRepository.upsert(updated);
}

/** What has been changed since Edit reopened the record — nothing, usually. */
export function correctionChanges(record: RecordInstance, labels: Record<string, string> = {}): FieldChange[] {
  const before = record.correction?.dataBefore;
  const header = record.correction?.headerBlockBefore;
  const headerLines = header === undefined ? [] : headerChanges(header, record.headerBlock, recordHeaderDefaults(record));
  return before === undefined ? headerLines : [...diffRecordData(before, record.data, labels), ...headerLines];
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
  // The record's own header goes back too (REQUIREMENTS §86) — where the reopening kept it.
  const headerBack = correction.headerBlockBefore === undefined ? record.headerBlock : (correction.headerBlockBefore ?? undefined);
  const undone = [...diffRecordData(record.data, restored, labels), ...headerChanges(record.headerBlock, headerBack, recordHeaderDefaults(record as RecordInstance))];
  const note =
    undone.length === 0
      ? `Edit cancelled — nothing had been changed. Back to ${correction.fromStatus}.`
      : `Edit cancelled — ${undone.length} change${undone.length === 1 ? "" : "s"} put back. Back to ${correction.fromStatus}.`;
  const updated: RecordInstance<T> = appendHistory(
    { ...record, data: restored, headerBlock: headerBack, status: correction.fromStatus, correction: undefined },
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
