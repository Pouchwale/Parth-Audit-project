import type { LogSheetData, RecordInstance } from "../../types";
import { GSM_HEADER, GSM_SPECIMEN_ROWS, WEIGHT_SCALE_HEADER, WEIGHT_SCALE_SPECIMEN_LINES } from "./qcCalibrationLayouts";

// THE TWO CALIBRATION PAGES AS SUPPLIED (REQUIREMENTS §51) — the sheets in
// "weekly and monthly internal calibration records.pdf" (16-Sep-2026), on file
// as LIVE records (isDemo: false) the way the Dec-2023 GAP report and the HR
// registers are, so the formats open with the plant's own figures in them.
//
// Read from the scan, cell for cell, and nothing else invented:
//   F/QC/12  four weekly calibrations of weight scale QC-76 — 25.02.2024,
//            08.03.2024, 20.03.2024 and 27.03.2024, the first two by Rashmi and
//            the last two by Anjali, every tested value equal to its weight and
//            every deviation 0%, all Pass. The last line's Next Due Date is not
//            legible on the copy and is left blank (§51's TO BE CONFIRMED list).
//   F/QC/11  the 31.12.2024 calibration of the four GSM cutting plates, each
//            measured four times at its own size with 0% deviation, all Pass,
//            signed Rashmi. The Serial No reads as a scribble and the Due Date
//            beside the calibration date is not legible; both are marked.
//
// The signature columns are left blank: a signature on a scan is a mark, not a
// name, and the tester's name is already in Tested By.

const SEEDED_AT = "2026-09-16T00:00:00.000Z";
const ON_FILE = "Quality Control (sheet as supplied, 16-Sep-2026)";

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

export const SEED_WEIGHT_SCALE_CALIBRATION: RecordInstance<LogSheetData> = seeded(
  "qc-weight-scale-calibration-2024-03",
  "qc-weight-scale-calibration",
  // The page carries four weeks; it is filed under the last calibration on it.
  "2024-03-27",
  {
    header: { ...WEIGHT_SCALE_HEADER },
    rows: WEIGHT_SCALE_SPECIMEN_LINES.map((line, i) => ({ id: `qcw-${i + 1}`, ...line })),
  }
);

export const SEED_GSM_PLATE_CALIBRATION: RecordInstance<LogSheetData> = seeded("qc-gsm-plate-calibration-2024-12", "qc-gsm-plate-calibration", "2024-12-31", {
  header: { ...GSM_HEADER },
  rows: GSM_SPECIMEN_ROWS.map((row, i) => ({ id: `qcg-${i + 1}`, ...row })),
});

export const SEED_QC_CALIBRATION_RECORDS: RecordInstance[] = [
  SEED_WEIGHT_SCALE_CALIBRATION as RecordInstance,
  SEED_GSM_PLATE_CALIBRATION as RecordInstance,
];
