import type { DocumentDefinition, RecordInstance } from "../types";
import { recordRepository } from "../data/repositories/recordRepository";
import { documentRepository } from "../data/repositories/documentRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { createDefaultData } from "./recordDefaults";
import { schedulePeriodOf, type SchedulePeriod } from "./frequencyEngine";
import { periodKeyFor } from "./recordGenerator";
import { historyOf } from "./recordHistory";
import { readJSON, writeJSON } from "../data/storageAdapter";
import { generateId } from "../utils/id";
import { compareISO, todayISO } from "../utils/date";
import { logActivity } from "../utils/activityLog";
import { recordLabel } from "./recordHistory";

// CREATE and DELETE for every document, by hand or by asking the assistant —
// the two ends of the record's life that the app used to leave to the schedule
// (the department's request, 12-Sep-2026: "make all documents this CRUD
// operation ... and whatever user can do manually that can do with ai
// assistant also"). Read and Update already run through the record pages and
// engine/recordPatch.ts.
//
// CREATE: a record for any document, on any date, with the same starting data
// the generator would have given it — so a one-off F/HR/17 for a date the
// schedule never produced reads exactly like a scheduled one. A record already
// covering that period is returned instead of a duplicate: two sheets for one
// day is precisely what a controlled register must not have.
//
// DELETE: a record can now be deleted whatever its status — but a deletion is
// itself recorded. A verified record is part of the audit trail, so removing it
// silently would leave a hole an auditor cannot explain; instead the id, the
// document, the period, the status it was in, who removed it, when, and the
// reason they gave are kept in a deletions log that survives the record
// (Document Library → "Records deleted"). Nothing else about it is kept.

export interface DeletionEntry {
  id: string;
  recordId: string;
  documentId: string;
  documentName: string;
  dueDate: string;
  status: string;
  isDemo: boolean;
  deletedBy: string;
  deletedAt: string;
  reason: string;
  /** How many history entries the record carried when it was removed. */
  historyEntries: number;
}

const DELETIONS_KEY = "deletions";
const MAX_DELETIONS_KEPT = 200;

export function deletionLog(isDemo?: boolean): DeletionEntry[] {
  const all = readJSON<DeletionEntry[]>(DELETIONS_KEY, []);
  return isDemo === undefined ? all : all.filter((d) => d.isDemo === isDemo);
}

// ONE SHEET FOR EACH PERIOD OF THE SCHEDULE (REQUIREMENTS §93; the audit of
// 7-Oct-2026, H-7). A weekly, fortnightly, monthly, quarterly or yearly
// document has one sheet for its week, fortnight, month, quarter or year
// (engine/frequencyEngine.ts schedulePeriodOf). "New record", "Start this
// record", the Library's New, Search's New, Mitra and the phone all start a
// record through createRecordForDocument below, and each opens the sheet of the
// period the day falls in when there is one: never a second sheet for a period
// that already has one, which is what used to happen on every day of the month
// but the sheet's own due date.
//
// THE TRAINING RECORD IS ONE PER TRAINING HELD. It is scheduled yearly (the
// annual programme in December), but its own page starts a record for every
// training and technician certificate (pages/TrainingPage.tsx), so New treats
// it the way that page does: a record for the day asked, as before.
const ONE_PER_OCCURRENCE = new Set(["training-record"]);

/** The period of the schedule a record is filed under, for the documents that have one. */
function periodFor(doc: DocumentDefinition, dateISO: string): SchedulePeriod | null {
  return ONE_PER_OCCURRENCE.has(doc.kind) ? null : schedulePeriodOf(doc, dateISO);
}

/**
 * The date a record was filed for: the date its period key names — the
 * schedule's own date, kept when a closed day moved the record's due date —
 * else its due date.
 */
function filedFor(record: RecordInstance): string {
  const named = /^(?:[^:]*:)?(\d{4}-\d{2}-\d{2})/.exec(record.periodKey ?? "");
  return named ? named[1] : record.dueDate;
}

/**
 * The record already covering `dateISO` for this document, the one New opens
 * instead of starting another: for a daily document the day's own sheet; for a
 * weekly, fortnightly, monthly, quarterly or yearly one the sheet of the period
 * the day falls in (the schedule's own sheet first, else the one worked on
 * last); for an as-required one none, since those are started as often as
 * things happen.
 */
export function recordCoveringDate(doc: DocumentDefinition, dateISO: string, isDemo: boolean): RecordInstance | undefined {
  if (doc.schedule.type === "as-required") return undefined;
  const records = recordRepository.query({ documentId: doc.id, isDemo }) as RecordInstance[];
  const period = periodFor(doc, dateISO);
  if (!period) {
    const periodKey = periodKeyFor(doc, dateISO);
    return records.find((r) => r.periodKey === periodKey || r.dueDate === dateISO);
  }
  const ownKey = periodKeyFor(doc, period.scheduled);
  const inPeriod = records.filter((r) => {
    const filed = filedFor(r);
    return compareISO(filed, period.from) >= 0 && compareISO(filed, period.to) <= 0;
  });
  return inPeriod.find((r) => r.periodKey === ownKey) ?? inPeriod.slice().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))[0];
}

/** Starts a record for this document and date — or returns the one already covering it. */
export function createRecordForDocument(
  doc: DocumentDefinition,
  opts: { dateISO?: string; isDemo?: boolean } = {}
): { record: RecordInstance; existed: boolean } {
  const dueDate = opts.dateISO ?? todayISO();
  const isDemo = !!opts.isDemo;
  // Only a SCHEDULED document has one sheet per period. An as-required one —
  // a complaint, an inspection report, an acknowledgement — can be started as
  // often as things happen, two on one day included; returning the morning's
  // complaint for the afternoon's would file the second under the first.
  const asRequired = doc.schedule.type === "as-required";
  const already = recordCoveringDate(doc, dueDate, isDemo);
  if (already) return { record: already, existed: true };
  // A period with no sheet yet (its date came before the system went live, or
  // its month has not been made yet): the sheet started now is the period's
  // own, under the schedule's key, so the schedule never makes a second one
  // beside it. It is dated the day it was started, as a hand-made record always was.
  const period = asRequired ? null : periodFor(doc, dueDate);
  const periodKey = periodKeyFor(doc, period ? period.scheduled : dueDate);
  const now = new Date().toISOString();
  const record: RecordInstance = {
    id: generateId("rec"),
    documentId: doc.id,
    // As-required documents can have any number of records, so each gets a
    // period of its own; scheduled ones keep the generator's period key, which
    // is what stops a second sheet for the same day or period.
    periodKey: asRequired ? `${doc.id}:${dueDate}:${generateId("p")}` : periodKey,
    dueDate,
    status: "In Progress",
    isDemo,
    data: createDefaultData(doc, dueDate, masterRepository.get()),
    createdAt: now,
    updatedAt: now,
  };
  if (!isDemo) logActivity("Record started", recordLabel(record), "", doc.id);
  return { record: recordRepository.upsert(record), existed: false };
}

/** Deletes a record for good, and records that it happened. */
export function deleteRecordWithTrail(record: RecordInstance, actorName: string, reason: string): DeletionEntry {
  const doc = documentRepository.getById(record.documentId);
  const entry: DeletionEntry = {
    id: generateId("del"),
    recordId: record.id,
    documentId: record.documentId,
    documentName: doc?.name ?? record.documentId,
    dueDate: record.dueDate,
    status: record.status,
    isDemo: !!record.isDemo,
    deletedBy: actorName,
    deletedAt: new Date().toISOString(),
    reason: reason.trim(),
    historyEntries: historyOf(record).length,
  };
  const log = [entry, ...readJSON<DeletionEntry[]>(DELETIONS_KEY, [])].slice(0, MAX_DELETIONS_KEPT);
  writeJSON(DELETIONS_KEY, log);
  recordRepository.remove(record.id);
  if (!record.isDemo) logActivity("Record deleted", recordLabel(record), `It was ${record.status}. Reason: ${reason.trim() || "none given"}`, record.documentId);
  return entry;
}

/**
 * Deleting a signed-off record takes a reason: it has been through
 * verification, so somebody has to say why it is going.
 */
export function deletionNeedsReason(status: string): boolean {
  return ["Submitted", "Pending Verification", "Verified"].includes(status);
}
