import type { DocumentDefinition, RecordInstance } from "../types";
import { recordRepository } from "../data/repositories/recordRepository";
import { documentRepository } from "../data/repositories/documentRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { createDefaultData } from "./recordDefaults";
import { periodKeyFor } from "./recordGenerator";
import { historyOf } from "./recordHistory";
import { readJSON, writeJSON } from "../data/storageAdapter";
import { generateId } from "../utils/id";
import { todayISO } from "../utils/date";

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

/** Starts a record for this document and date — or returns the one already covering it. */
export function createRecordForDocument(
  doc: DocumentDefinition,
  opts: { dateISO?: string; isDemo?: boolean } = {}
): { record: RecordInstance; existed: boolean } {
  const dueDate = opts.dateISO ?? todayISO();
  const isDemo = !!opts.isDemo;
  const periodKey = periodKeyFor(doc, dueDate);
  const already = (recordRepository.query({ documentId: doc.id, isDemo }) as RecordInstance[]).find(
    (r) => r.periodKey === periodKey || r.dueDate === dueDate
  );
  if (already) return { record: already, existed: true };
  const now = new Date().toISOString();
  const record: RecordInstance = {
    id: generateId("rec"),
    documentId: doc.id,
    // As-required documents can have any number of records, so each gets a
    // period of its own; scheduled ones keep the generator's period key, which
    // is what stops a second sheet for the same day.
    periodKey: doc.schedule.type === "as-required" ? `${doc.id}:${dueDate}:${generateId("p")}` : periodKey,
    dueDate,
    status: "In Progress",
    isDemo,
    data: createDefaultData(doc, dueDate, masterRepository.get()),
    createdAt: now,
    updatedAt: now,
  };
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
  return entry;
}

/**
 * Deleting a signed-off record takes a reason: it has been through
 * verification, so somebody has to say why it is going.
 */
export function deletionNeedsReason(status: string): boolean {
  return ["Submitted", "Pending Verification", "Verified"].includes(status);
}
