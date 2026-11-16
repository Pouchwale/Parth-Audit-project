import type { LogSheetData, RecordInstance } from "../types";
import { recordRepository } from "./repositories/recordRepository";
import { mayWriteRecordsOf } from "../engine/departmentScope";
import { appendHistory, diffRecordData, historyOf, makeEntry } from "../engine/recordHistory";
import { AUDIT_DOC, withAuditNcTable, withAuditedYes } from "../engine/purchaseAuditNc";

/** What each changed sheet's history says. */
export const AUDITED_YES_NOTE = "Every audit point AUDITED Yes, and the observations / NC table filled from the points rated NC (the owner, 16-Nov-2026, REQUIREMENTS §229)";

const OPEN: ReadonlySet<string> = new Set(["Scheduled", "Due", "In Progress", "Rejected"]);

/**
 * F/PUR/02'S SHEETS STILL OPEN, ANSWERED AS A NEW ONE IS (REQUIREMENTS §229): an audit point whose AUDITED box is blank takes
 * Yes, and the NC table takes the points rated NC (engine/purchaseAuditNc.ts) - a box a person wrote in stays as written.
 * A sheet handed in or signed off is left as it is; one reopened for correction is open, its blank boxes filled. Run at every start (data/bootstrap.ts): nothing to do, nothing written.
 */
export function auditedYesOnOpenSheets(): number {
  if (!mayWriteRecordsOf(AUDIT_DOC)) return 0;
  const updates: RecordInstance[] = [];
  for (const r of recordRepository.queryUnscoped({ documentId: AUDIT_DOC, isDemo: false })) {
    // (a sheet reopened for correction is open too: only its blank boxes are filled, nothing written is changed)
    if (!OPEN.has(r.status)) continue;
    const d = r.data as LogSheetData | undefined;
    if (!d || !Array.isArray(d.rows)) continue;
    const rows = withAuditedYes(d.rows);
    const next = withAuditNcTable(AUDIT_DOC, { ...d, rows });
    const changes = diffRecordData(d, next);
    if (changes.length === 0) continue;
    const entry = appendHistory({ ...r, history: [] }, makeEntry("edited", "System", { changes, note: AUDITED_YES_NOTE })).history![0];
    updates.push({ ...r, data: next, history: [...historyOf(r), entry] });
  }
  if (updates.length) recordRepository.upsertMany(updates);
  return updates.length;
}
