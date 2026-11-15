import type { RecordInstance, RecordRemark } from "../types";
import { recordRepository } from "../data/repositories/recordRepository";
import { appendHistory, makeEntry } from "./recordHistory";
import { generateId } from "../utils/id";

// REMARKS ON A RECORD (REQUIREMENTS §212; the owner, 15-Nov-2026: "add remark button ... for F-QC-17 do this and make
// sure it will not print when user click on print original-style record"). Both F/QC/17 sheets - the 600 mm and the
// 300 mm scale - take remarks: a line of words, with who wrote it and when, kept beside the record's data (never in it,
// so the form, its checks, its downloads and its print are untouched), shown on the record page only, under the form,
// outside what prints. Each remark added or taken away is a line of the record's history.

export const REMARK_DOCUMENTS: ReadonlySet<string> = new Set(["qc-ruler-verification", "qc-ruler-verification-300"]);

export const takesRemarks = (documentId: string | undefined): boolean => !!documentId && REMARK_DOCUMENTS.has(documentId);

const MAX = 1000;

/** The record with a remark added (nothing changed for an empty one). */
export function addRemark(record: RecordInstance, text: string, by: string): RecordInstance {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX);
  if (!clean) return record;
  const remark: RecordRemark = { id: generateId("rmk"), text: clean, by, at: new Date().toISOString() };
  const next = appendHistory({ ...record, remarks: [...(record.remarks ?? []), remark] }, makeEntry("edited", by, { note: `Remark added: "${clean}"` }));
  return recordRepository.upsert(next);
}

/** The record with one remark taken away. */
export function removeRemark(record: RecordInstance, remarkId: string, by: string): RecordInstance {
  const gone = (record.remarks ?? []).find((r) => r.id === remarkId);
  if (!gone) return record;
  const left = (record.remarks ?? []).filter((r) => r.id !== remarkId);
  const next = appendHistory({ ...record, remarks: left }, makeEntry("edited", by, { note: `Remark removed: "${gone.text}" (written by ${gone.by})` }));
  return recordRepository.upsert(next);
}
