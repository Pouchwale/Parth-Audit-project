// THE PAPERS ON FILE AS THEIR PAPERS PRINT THEM (REQUIREMENTS §111, the review of 13-Oct-2026).
//
// Two of the plant's own records on file were seeded before the review found how their papers write them:
//   * F/QC/16, the register of obsolete artwork of 2022: its paper numbers its own lines in a Sr. No. column of its
//     own, and numbers two of them out of order (7, 9, 8, 10). The sheet drew its own 1 to 13 beside them. The Sr. No.
//     is now the paper's column, and its seed holds the paper's numbers (data/seed/qcRegisterLayouts.ts).
//   * F/QC/30, the minutes of the 07.06.2022 meeting with Gangwal Healthcare: its paper lists who attended one to a
//     line. The seed joined them on one line with "; "; it now holds them a line each (data/seed/qcReportLayouts.ts).
// A copy stored before takes what its seed now holds — only a line with no Sr. No. of its own takes the seed's, and the
// participants only where they still read exactly as they were seeded — with ONE line in the record's history saying
// why; its status, signatures and updatedAt stay as they were (upsertMany), as with every start-up clean-up, and a
// record reopened for correction is left alone. Run on every start by data/bootstrap.ts: nothing to do, nothing written.
import type { LogSheetData, RecordInstance } from "../types";
import { SEED_QC_OBSOLETE_ARTWORK } from "./seed/qcRegisterRecords";
import { SEED_QC_MINUTES_GANGWAL } from "./seed/qcReportRecords";
import { recordRepository } from "./repositories/recordRepository";
import { appendHistory, diffRecordData, historyOf, makeEntry } from "../engine/recordHistory";

/** What each changed record's history says. */
export const PAPER_ON_FILE_NOTE = "As its paper writes it: the paper's own Sr. No. on each line, the participants one to a line (REQUIREMENTS §111)";

/** The participants as the minutes were first seeded, joined on one line. */
export const PARTICIPANTS_AS_FIRST_SEEDED = "1. Gangwal team; 2. Shail Patel; 3. Virat Rajgor; 4. Mehul Prajapati; 5. Kapila Barad";

function aligned(r: RecordInstance): LogSheetData | null {
  const data = r.data as LogSheetData | undefined;
  if (!data || typeof data !== "object" || !Array.isArray(data.rows)) return null;
  if (r.id === SEED_QC_OBSOLETE_ARTWORK.id) {
    const seedRows = SEED_QC_OBSOLETE_ARTWORK.data.rows;
    let changed = false;
    const rows = data.rows.map((row) => {
      if (row.srNo !== undefined && row.srNo !== null && row.srNo !== "") return row;
      const seed = seedRows.find((s) => s.id === row.id);
      if (!seed || typeof seed.srNo !== "string") return row;
      changed = true;
      return { ...row, srNo: seed.srNo };
    });
    return changed ? { ...data, rows } : null;
  }
  if (r.id === SEED_QC_MINUTES_GANGWAL.id) {
    if (data.header?.participants !== PARTICIPANTS_AS_FIRST_SEEDED) return null;
    return { ...data, header: { ...data.header, participants: SEED_QC_MINUTES_GANGWAL.data.header.participants } };
  }
  return null;
}

/** Brings the two seeded records in step with how their papers write them; returns how many records changed. */
export function alignPapersOnFile(): number {
  const updates: RecordInstance[] = [];
  for (const r of recordRepository.snapshot()) {
    if (r.correction) continue;
    const data = aligned(r);
    if (!data) continue;
    // A line of its own, never folded into a change another start-up clean-up made a moment before.
    const entry = appendHistory({ ...r, history: [] }, makeEntry("edited", "System", { changes: diffRecordData(r.data, data), note: PAPER_ON_FILE_NOTE })).history![0];
    updates.push({ ...r, data, history: [...historyOf(r), entry] });
  }
  if (updates.length) recordRepository.upsertMany(updates);
  return updates.length;
}
