import type { LogSheetData, RecordInstance } from "../types";
import { recordRepository } from "./repositories/recordRepository";
import { appendHistory, diffRecordData, historyOf, makeEntry } from "../engine/recordHistory";
import { mayWriteRecordsOf } from "../engine/departmentScope";
import { RUNNING_NUMBER_BOX, RUNNING_NUMBER_DOCS, runningNumbers } from "../engine/runningNumbers";

/** What each sheet's history says when DCRS writes its Serial No. */
export const SERIAL_NUMBER_NOTE = "Serial No written as the record's number, 01, 02 … as the list numbers it (the owner, 16-Nov-2026, REQUIREMENTS §233, §234)";


/**
 * The number the sheet's Serial No box should take now, or null where it stays as it is. An empty box takes the
 * record's number (engine/runningNumbers.ts: 01, 02 … in its month or year), on any sheet; a number DCRS wrote
 * (data.autoSerialNo) - or one carried over from another sheet - follows the list on any sheet, as the list's number is
 * DCRS's, never the signer's (REQUIREMENTS §234: the 1, 2 of 16-Nov-2026 became 01, 02). A number a person wrote stays. `records`: the document's records of the same kind (Live or Demo), this one among them.
 */
function wanted(r: RecordInstance, records: RecordInstance[], numbers: Map<string, string>): string | null {
  const d = r.data as LogSheetData | undefined;
  if (!d?.header) return null;
  const want = numbers.get(r.id) ?? "";
  const have = String(d.header[RUNNING_NUMBER_BOX] ?? "").trim();
  if (!want || have === want) return null;
  if (have === "") return want;
  // A number DCRS wrote on another sheet, in this one's box: carried over from the last sheet (a format the plant edited
  // may still carry the box), not written by a person.
  const carried = !d.autoSerialNo && records.some((o) => o.id !== r.id && String((o.data as LogSheetData | undefined)?.autoSerialNo ?? "") === have);
  const ours = have === String(d.autoSerialNo ?? "") || carried;
  return ours ? want : null;
}

/** The sheet's data with its Serial No the running number, when the box should take it (a sheet being opened); else null. */
export function withSerialNumber(record: RecordInstance, data: LogSheetData | undefined = record.data as LogSheetData | undefined): LogSheetData | null {
  if (!RUNNING_NUMBER_DOCS.has(record.documentId) || !data?.header) return null;
  const records = recordRepository.snapshot().filter((r) => r.documentId === record.documentId && !!r.isDemo === !!record.isDemo);
  if (!records.some((r) => r.id === record.id)) records.push(record);
  const numbers = runningNumbers(record.documentId, records);
  const want = numbers ? wanted({ ...record, data }, records, numbers) : null;
  return want ? { ...data, header: { ...data.header, [RUNNING_NUMBER_BOX]: want }, autoSerialNo: want } : null;
}

/**
 * THE SERIAL NO BOX HOLDS THE RECORD'S RUNNING NUMBER (REQUIREMENTS §233; the owner, 16-Nov-2026, of F/QC/11's "Serial
 * No:" box: "serial number should also able to come"; asked: the record's running number, editable - and F/QC/12's the
 * same). Every sheet of the document as `wanted` says, each with a line in its history. Live and Demo are numbered each
 * on their own. Run at every start and when the list changes: nothing to do, nothing written. Returns how many it wrote.
 */
export function serialNumbersOnSheets(documentId?: string): number {
  const docs = documentId ? (RUNNING_NUMBER_DOCS.has(documentId) ? [documentId] : []) : [...RUNNING_NUMBER_DOCS];
  const updates: RecordInstance[] = [];
  for (const doc of docs) {
    if (!mayWriteRecordsOf(doc)) continue;
    const all = recordRepository.snapshot().filter((r) => r.documentId === doc);
    for (const isDemo of [false, true]) {
      const records = all.filter((r) => !!r.isDemo === isDemo);
      const numbers = runningNumbers(doc, records);
      if (!numbers) continue;
      for (const r of records) {
        const want = wanted(r, records, numbers);
        if (!want) continue;
        const d = r.data as LogSheetData;
        const data: LogSheetData = { ...d, header: { ...d.header, [RUNNING_NUMBER_BOX]: want }, autoSerialNo: want };
        const entry = appendHistory({ ...r, history: [] }, makeEntry("edited", "System", { changes: diffRecordData(r.data, data), note: SERIAL_NUMBER_NOTE })).history![0];
        updates.push({ ...r, data, history: [...historyOf(r), entry] });
      }
    }
  }
  if (updates.length) recordRepository.upsertMany(updates);
  return updates.length;
}
