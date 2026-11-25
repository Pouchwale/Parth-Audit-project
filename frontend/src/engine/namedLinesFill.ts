import type { LogSheetData, RecordInstance } from "../types";
import { documentRepository } from "../data/repositories/documentRepository";
import { hrMasterRepository } from "../data/repositories/hrMasterRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { fillBlanksFromMaster, hrMasterLinkFor } from "./hrMaster";
import { isEditableStatus, saveDraft } from "./recordLifecycle";
import { fieldLabels } from "./recordPatch";

// A NAME ON F/HR/10, HOWEVER IT GOT THERE, BRINGS THE PERSON'S OTHER DETAILS (REQUIREMENTS §331; the owner, 25-Nov-2026:
// "if user manually enter or even system should fill it then other details about that name should come in document in
// other fields also"). A name typed on the paper fills its line when the box is left (components/records/LogSheetRecordView.tsx);
// a name put in any other way - by Mitra, an import, the system - has its line's BLANK boxes filled from HR Master Data
// when the record is opened. Nothing written is changed, a short name is still only offered (§291), and a submitted or
// verified record is never touched.

export const NAMED_LINES_DOCS: ReadonlySet<string> = new Set(["hr-training-imparted"]);

export function fillNamedLinesFromMaster(recordId: string): void {
  const record = recordRepository.getById(recordId) as RecordInstance<LogSheetData> | undefined;
  if (!record || record.isDemo || !NAMED_LINES_DOCS.has(record.documentId) || !isEditableStatus(record.status)) return;
  const link = hrMasterLinkFor(record.documentId);
  const doc = documentRepository.getByIdUnscoped(record.documentId);
  if (!link || !doc || !Array.isArray(record.data?.rows)) return;
  const { data, filled } = fillBlanksFromMaster(link, record.data, hrMasterRepository.all());
  if (filled.length === 0) return;
  saveDraft(record, data, "DCRS", { action: "edited", note: "Filled from HR Master Data", labels: fieldLabels(doc.kind, doc.id) });
}
