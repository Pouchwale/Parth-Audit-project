import type { LogSheetData, RecordInstance } from "../../types";
import {
  MRM_2025_07_OBJECTIVES,
  MRM_2025_07_VALUES,
  MRM_AGENDA_2025_07_PARTICIPANTS,
  MRM_AGENDA_2025_07_VALUES,
  OBJECTIVES_2026_ROWS,
  OBJECTIVES_2026_VALUES,
} from "./sysManagementReviewLayouts";

// THE MANAGEMENT REVIEW PAGES SUPPLIED FILLED IN (REQUIREMENTS §76), on file as
// LIVE records (isDemo: false) the way the Maintenance pages are
// (maintenanceRecords.ts), so the formats open with the plant's own entries.
// Read from the supplied pages, cell for cell, and nothing else invented
// (the transcriptions, and every oddity on the pages, are in
// sysManagementReviewLayouts.ts):
//
//   F/SYS/04    The management review of 21.07.2025, reviewing Jan 2025 to
//               June 2025 — the meeting, its eight attendees, the eleven
//               agenda items box by box, and item 8's table of 19 objectives as
//               the record's lines. Item 1's result, item 6's and item 11's
//               "reviewed" lines, item 7's discussion, objective 16's
//               Justification and the whole New Action Item Detail are blank on
//               the pages and blank here.
//   F/SYS/04-A  The notice of 07.07.2025 calling that meeting: its three boxes
//               and its eight participants — line 08 with its two cells
//               swapped, as printed. Nobody has signed it.
//   F/SYS/16    The quality & product safety objectives for 2026: 18 lines,
//               filed under the first day of the year the sheet is for. The
//               only monthly actuals are January's 0 and 1 (objectives 1 and
//               2), Wastage - Labels' "#DIV/0!" in every month and Supplier
//               rating's merged "To be collected in December 2024" (held in
//               January); the Totals that do not add up are kept as printed.

const ON_FILE = "System / Management (sheet as supplied, 25-Sep-2026)";
const SEEDED_AT = "2026-09-25T00:00:00.000Z";

function seeded(id: string, documentId: string, dueDate: string, data: LogSheetData, formatRevision?: string): RecordInstance<LogSheetData> {
  return {
    id,
    documentId,
    periodKey: `${documentId}:${dueDate}`,
    dueDate,
    status: "Verified",
    isDemo: false,
    data,
    ...(formatRevision ? { formatRevision } : {}),
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    submittedBy: ON_FILE,
    submittedAt: SEEDED_AT,
    verifiedBy: ON_FILE,
    verifiedAt: SEEDED_AT,
  };
}

export const SEED_SYS_MRM_2025_07 = seeded("seed-sys-mrm-2025-07", "sys-mrm-record", "2025-07-21", {
  header: { ...MRM_2025_07_VALUES },
  rows: MRM_2025_07_OBJECTIVES.map(([objective, achieved, revisedTarget, justification], i) => ({ id: `r${i + 1}`, objective, achieved, revisedTarget, justification })),
});

export const SEED_SYS_MRM_AGENDA_2025_07 = seeded("seed-sys-mrm-agenda-2025-07", "sys-mrm-agenda", "2025-07-07", {
  header: { ...MRM_AGENDA_2025_07_VALUES },
  rows: MRM_AGENDA_2025_07_PARTICIPANTS.map(([name, designation], i) => ({ id: `r${i + 1}`, name, designation, signature: "" })),
});

export const SEED_SYS_OBJECTIVES_2026 = seeded("seed-sys-objectives-2026", "sys-objectives", "2026-01-01", {
  header: { ...OBJECTIVES_2026_VALUES },
  rows: OBJECTIVES_2026_ROWS.map((line, i) => ({ id: `r${i + 1}`, ...line })),
});

export const SEED_SYS_MANAGEMENT_REVIEW_RECORDS: RecordInstance<LogSheetData>[] = [SEED_SYS_MRM_2025_07, SEED_SYS_MRM_AGENDA_2025_07, SEED_SYS_OBJECTIVES_2026];
