import type { LogSheetData, RecordInstance } from "../types";
import { recordRepository } from "./repositories/recordRepository";
import { appendHistory, diffRecordData, historyOf, makeEntry } from "../engine/recordHistory";
import { mayWriteRecordsOf } from "../engine/departmentScope";
import { namesDcrsWrote, signKeys } from "../engine/calibrationSigner";

// THE NAMES DCRS WROTE ON THE F/QC/11, 12 AND 17 SHEETS STILL OPEN COME OFF (REQUIREMENTS §288). Once per sheet, at the start: a sign box
// on an open sheet holding the name of the person DCRS wrote it for on opening, and not marked as typed. A name anybody typed, and
// every submitted or verified sheet, stays exactly as it is. Each sheet changed has a line in its history.

export const QC_SIGNS_NOTE = "Sign boxes emptied: the names DCRS wrote on opening are taken off, for the person to write (REQUIREMENTS §288)";
const DOCS = ["qc-gsm-plate-calibration", "qc-weight-scale-calibration", "qc-ruler-verification", "qc-ruler-verification-300"];
const OPEN: ReadonlySet<string> = new Set(["Scheduled", "Due", "In Progress"]);

/** The sheet with the names DCRS wrote taken off; the same data where there are none. */
export function withDcrsNamesOff(r: RecordInstance): LogSheetData | null {
  const d = r.data as LogSheetData | undefined;
  if (!d || !Array.isArray(d.rows)) return null;
  const dcrs = namesDcrsWrote(r);
  const typed = new Set(d.typedNames ?? []);
  let changed = false;
  const rows = d.rows.map((row) => {
    let next = row;
    for (const k of signKeys(r.documentId, row)) {
      if (typed.has(`${row.id}:${k}`) || !dcrs.has(String(row[k] ?? "").trim())) continue;
      next = { ...next, [k]: "" };
      changed = true;
    }
    return next;
  });
  return changed ? { ...d, rows } : null;
}

/** Every open sheet of the three formats, once; returns how many changed. */
export function qcSignsClearedOnOpenSheets(): number {
  const updates: RecordInstance[] = [];
  for (const r of recordRepository.snapshot()) {
    if (!DOCS.includes(r.documentId) || r.isDemo || r.correction || !OPEN.has(r.status) || !mayWriteRecordsOf(r.documentId)) continue;
    if (historyOf(r).some((h) => h.note?.startsWith("Sign boxes emptied"))) continue;
    const data = withDcrsNamesOff(r);
    if (!data) continue;
    const entry = appendHistory({ ...r, history: [] }, makeEntry("edited", "System", { changes: diffRecordData(r.data, data), note: QC_SIGNS_NOTE })).history![0];
    updates.push({ ...r, data, history: [...historyOf(r), entry] });
  }
  if (updates.length) recordRepository.upsertMany(updates);
  return updates.length;
}
