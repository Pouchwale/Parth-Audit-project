import type { LogSheetData, RecordInstance } from "../types";
import { recordRepository } from "./repositories/recordRepository";
import { appendHistory, diffRecordData, historyOf, makeEntry } from "../engine/recordHistory";
import { mayWriteRecordsOf } from "../engine/departmentScope";
import { TRAINING_TOPICS } from "./seed/hrLayouts";

// F/HR/08'S TOPICS ARE MARKED X, AS ON THE PAPER (REQUIREMENTS §330). The owner, 25-Nov-2026: "there should come X instead of Yes or
// no". A topic answered before reads "Yes" or "No": "Yes" becomes the X, "No" a blank cell (the paper marks only the training
// needed). The meaning is the same, so every sheet takes it, each with a line in its history; run again it changes nothing.

export const TNI_X_NOTE = "The topics marked X as on the paper: Yes became X, No a blank cell (REQUIREMENTS §330)";
const DOC = "hr-training-needs";
const KEYS = TRAINING_TOPICS.map((t) => t.key);

/** The sheet with its topics marked X; null where it already is. */
export function topicsMarkedX(r: RecordInstance): LogSheetData | null {
  const d = r.data as LogSheetData | undefined;
  if (r.documentId !== DOC || !d || !Array.isArray(d.rows)) return null;
  let changed = false;
  const rows = d.rows.map((row) => {
    let next = row;
    for (const k of KEYS) {
      const v = String(row[k] ?? "").trim().toLowerCase();
      const to = v === "yes" ? "X" : v === "no" ? "" : null;
      if (to === null) continue;
      next = { ...next, [k]: to };
      changed = true;
    }
    return next;
  });
  return changed ? { ...d, rows } : null;
}

/** Every F/HR/08 sheet, once; returns how many changed. */
export function hrTniTopicsMarkedX(): number {
  if (!mayWriteRecordsOf(DOC)) return 0;
  const updates: RecordInstance[] = [];
  for (const r of recordRepository.snapshot()) {
    const data = topicsMarkedX(r);
    if (!data) continue;
    const entry = appendHistory({ ...r, history: [] }, makeEntry("edited", "System", { changes: diffRecordData(r.data, data), note: TNI_X_NOTE })).history![0];
    updates.push({ ...r, data, history: [...historyOf(r), entry] });
  }
  if (updates.length) recordRepository.upsertMany(updates);
  return updates.length;
}
