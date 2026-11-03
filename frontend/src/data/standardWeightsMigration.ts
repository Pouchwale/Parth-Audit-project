import type { LogSheetData, RecordInstance } from "../types";
import { recordRepository } from "./repositories/recordRepository";
import { appendHistory, diffRecordData, historyOf, makeEntry } from "../engine/recordHistory";
import { mayWriteRecordsOf } from "../engine/departmentScope";
import { withComputedCells } from "../engine/computedCells";
import { onStandardWeights } from "../engine/nominalFill";

// F/QC/12'S WEIGHTS ARE FIXED ON EVERY LINE (the owner, 30-Oct-2026, REQUIREMENTS §146: "weight 1 is 0.050 mg, weight 2 is
// 50.000 gm and weight 3 is 100.000 gm, weight 4 is 200.000 gm, and weight 5 is 400.000 gm so first fix this in all four
// rows"). A sheet started on an earlier build kept the former weights (50 .. 600 gm) on lines that had a name on them, and a
// reading typed against the right weight then read as a deviation of tens of per cent. Every OPEN sheet's lines are put
// onto the fixed weights (engine/nominalFill.ts onStandardWeights), the deviations worked out again, a line in its
// history. A sheet handed in, verified or under correction is left as it was handed in. Runs at every start; nothing to
// do, nothing written.

/** What each changed sheet's history says. */
export const STANDARD_WEIGHTS_NOTE =
  "The laboratory's fixed weights (0.050mg, 50.000gm, 100.000gm, 200.000gm, 400.000gm) written on every line, as the owner set them on 30-Oct-2026 (REQUIREMENTS §146)";

const SCALE = "qc-weight-scale-calibration";
const OPEN: ReadonlySet<string> = new Set(["Scheduled", "Due", "In Progress", "Rejected"]);

/** Every open F/QC/12 sheet's lines on the fixed weights; returns how many sheets changed. */
export function standardWeightsOnOpenSheets(): number {
  if (!mayWriteRecordsOf(SCALE)) return 0;
  const updates: RecordInstance[] = [];
  for (const r of recordRepository.snapshot()) {
    if (r.documentId !== SCALE || r.correction || !OPEN.has(r.status)) continue;
    const d = r.data as LogSheetData | undefined;
    if (!d || !Array.isArray(d.rows)) continue;
    const rows = d.rows.map(onStandardWeights);
    if (JSON.stringify(rows) === JSON.stringify(d.rows)) continue;
    const data = withComputedCells(SCALE, { ...d, rows });
    const entry = appendHistory({ ...r, history: [] }, makeEntry("edited", "System", { changes: diffRecordData(r.data, data), note: STANDARD_WEIGHTS_NOTE })).history![0];
    updates.push({ ...r, data, history: [...historyOf(r), entry] });
  }
  if (updates.length) recordRepository.upsertMany(updates);
  return updates.length;
}
