import type { LogSheetData, RecordInstance } from "../../types";
import {
  TEST_RELIABILITY_LABEL_HEADER,
  TEST_RELIABILITY_LABEL_LINES,
  TEST_RELIABILITY_SLEEVE_HEADER,
  TEST_RELIABILITY_SLEEVE_LINES,
} from "./qcTestReliabilityLayouts";

// F-QC-14 AS SUPPLIED (REQUIREMENTS §111) — the owner's workbook "F-QC-14 TEST RELIABILITY RECORD.xlsx" of 13-Oct-2026,
// filled in on 12.02.2022, on file as LIVE records (isDemo: false) as the other Quality Control pages supplied filled in
// are (qcReportRecords.ts): its "Label" sheet and its "Sleeve" sheet, each a record of its own document.
//
// Read from the workbook cell for cell, and nothing else invented: four inspectors (Kapila, Kirti Patel, Anil Raval,
// Karan Prajapati), three samples a check, every check concluded "Variation are within specification limit, hence test
// reliability accepted". The values live in qcTestReliabilityLayouts.ts, where they are also the formats' specimens, so
// each sheet is transcribed in one place only.

const SEEDED_AT = "2026-10-13T00:00:00.000Z";
const ON_FILE = "Quality Control (sheet as supplied, 13-Oct-2026)";

function seeded(id: string, documentId: string, header: Record<string, string>, lines: Record<string, string>[]): RecordInstance<LogSheetData> {
  return {
    id,
    documentId,
    periodKey: `${documentId}:2022-02-12`,
    dueDate: "2022-02-12",
    status: "Verified",
    isDemo: false,
    data: { header: { ...header }, rows: lines.map((line, i) => ({ id: `r${i + 1}`, ...line })) },
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    submittedBy: ON_FILE,
    submittedAt: SEEDED_AT,
    verifiedBy: ON_FILE,
    verifiedAt: SEEDED_AT,
  };
}

export const SEED_QC_TEST_RELIABILITY_RECORDS: RecordInstance[] = [
  seeded("qc-test-reliability-label-2022-02", "qc-test-reliability-label", TEST_RELIABILITY_LABEL_HEADER, TEST_RELIABILITY_LABEL_LINES) as RecordInstance,
  seeded("qc-test-reliability-sleeve-2022-02", "qc-test-reliability-sleeve", TEST_RELIABILITY_SLEEVE_HEADER, TEST_RELIABILITY_SLEEVE_LINES) as RecordInstance,
];
