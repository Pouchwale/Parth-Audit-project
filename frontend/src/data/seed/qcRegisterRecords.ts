import type { LogSheetData, RecordInstance } from "../../types";
import { OBSOLETE_ARTWORK_LINES, PRINTING_AIDS_DESTRUCTION_HEADER, PRINTING_AIDS_DESTRUCTION_LINES } from "./qcRegisterLayouts";

// THE TWO QC REGISTER PAGES AS SUPPLIED (REQUIREMENTS §57) — the two of the
// 18-Sep-2026 Quality Control formats that were supplied FILLED IN, on file as
// LIVE records (isDemo: false) the way the calibration pages of 16-Sep-2026 are
// (qcCalibrationRecords.ts), so the formats open with the plant's own entries
// in them.
//
// Read from the supplied pages, cell for cell, and nothing else invented:
//   F/QC/16  REGISTER OF OBSOLETE ARTWORK — thirteen lines, 03.01.2022 to
//            18.02.2022, every one of them obsolete for "A/W Change". The
//            lines are kept in the printed order; the page's own Sr. No.
//            column reads 1, 2, 3, 4, 5, 6, 7, 9, 8, 10, 11, 12, 13, so the
//            eighth and ninth lines down are numbered out of order on the
//            paper. Updated by - QC In-charge and Remarks are blank on every
//            line of the page and stay blank. Filed under the last date on the
//            page, 18.02.2022.
//   F/QC/20  PRINTING AIDS DESTRUCTION RECORD — the page of 01.06.2022, one
//            line: two Nivea back labels destroyed. Destroyed By and Checked By
//            are both blank on the page and stay blank.
//
// The values themselves live in qcRegisterLayouts.ts, where they are also the
// two formats' specimens, so each page is transcribed in one place only. The
// dates are written on the pages as dd.mm.yyyy and stored as the ISO dates a
// date field holds.

const SEEDED_AT = "2026-09-18T00:00:00.000Z";
const ON_FILE = "Quality Control (sheet as supplied, 18-Sep-2026)";

function seeded(id: string, documentId: string, dueDate: string, data: LogSheetData): RecordInstance<LogSheetData> {
  return {
    id,
    documentId,
    periodKey: `${documentId}:${dueDate}`,
    dueDate,
    status: "Verified",
    isDemo: false,
    data,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    submittedBy: ON_FILE,
    submittedAt: SEEDED_AT,
    verifiedBy: ON_FILE,
    verifiedAt: SEEDED_AT,
  };
}

export const SEED_QC_OBSOLETE_ARTWORK: RecordInstance<LogSheetData> = seeded(
  "qc-obsolete-artwork-2022-02",
  "qc-obsolete-artwork",
  // The page carries Jan and Feb 2022; it is filed under the last date on it.
  "2022-02-18",
  {
    // The form prints no boxes above the grid.
    header: {},
    rows: OBSOLETE_ARTWORK_LINES.map((line, i) => ({ id: `r${i + 1}`, ...line })),
  }
);

export const SEED_QC_PRINTING_AIDS_DESTRUCTION: RecordInstance<LogSheetData> = seeded(
  "qc-printing-aids-destruction-2022-06",
  "qc-printing-aids-destruction",
  "2022-06-01",
  {
    header: { ...PRINTING_AIDS_DESTRUCTION_HEADER },
    rows: PRINTING_AIDS_DESTRUCTION_LINES.map((line, i) => ({ id: `r${i + 1}`, ...line })),
  }
);

export const SEED_QC_REGISTER_RECORDS: RecordInstance<LogSheetData>[] = [SEED_QC_OBSOLETE_ARTWORK, SEED_QC_PRINTING_AIDS_DESTRUCTION];
