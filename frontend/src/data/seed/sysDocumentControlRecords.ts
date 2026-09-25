import type { LogSheetData, RecordInstance } from "../../types";
import { DOCUMENT_LIST_ROWS, FORMAT_LIST_ROWS } from "./sysDocumentControlLayouts";

// THE TWO MASTER LISTS, ON FILE AS SUPPLIED (REQUIREMENTS §76), as LIVE records
// (isDemo: false) the way the Maintenance pages are (maintenanceRecords.ts), so
// the lists open with the plant's own entries and a new list is drafted from
// them. Read cell for cell, nothing invented (sysDocumentControlLayouts.ts):
//   F/SYS/01  Master List of Documents — the 173 documents of the company's
//             workbook, which its PDF print matches cell for cell.
//             "Reviewed & approved by : PSTL".
//   F/SYS/02  Master List of Formats & Records — the 141 formats of the
//             company's workbook, the list as last updated. The PDF supplied
//             with it is an earlier print (135 formats); every difference
//             between the two is listed, line by line, over FORMAT_LINES in
//             sysDocumentControlLayouts.ts.
//             "Reviewed & approved by : PSTL / M.R.".
// Neither list carries a date of its own, so each is filed under the day it was
// supplied, 25.09.2026. The latest date written on F/SYS/01 is 15.07.2026
// (FLX/PRO/MKT/03's revision 2); on F/SYS/02 it is 01.09.2026 (F-PRD-06, 07, 27
// and 28).
//
// F/SYS/03, the Document Change Request & Approval Note, was supplied blank, so
// it has no record here.

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

export const SEED_SYS_DOCUMENT_LIST = seeded("seed-sys-document-list", "sys-document-list", "2026-09-25", {
  header: { reviewedBy: "PSTL" },
  rows: DOCUMENT_LIST_ROWS.map((document, i) => ({ id: `r${i + 1}`, ...document })),
});

export const SEED_SYS_FORMAT_LIST = seeded("seed-sys-format-list", "sys-format-list", "2026-09-25", {
  header: { reviewedBy: "PSTL / M.R." },
  rows: FORMAT_LIST_ROWS.map((format, i) => ({ id: `r${i + 1}`, ...format })),
});

export const SEED_SYS_DOCUMENT_CONTROL_RECORDS: RecordInstance<LogSheetData>[] = [SEED_SYS_DOCUMENT_LIST, SEED_SYS_FORMAT_LIST];
