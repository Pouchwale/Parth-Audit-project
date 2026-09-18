import type { LogSheetData, RecordInstance } from "../../types";
import {
  ANALYSIS_REPORT_HEADER,
  ANALYSIS_REPORT_LINES,
  MINUTES_GANGWAL_HEADER,
  MINUTES_GANGWAL_POINTS,
  UTILITY_TEST_HEADER,
  UTILITY_TEST_LINES,
} from "./qcReportLayouts";

// THE THREE ANALYSIS AND MINUTES PAGES AS SUPPLIED (REQUIREMENTS §57) — the
// three 18-Sep-2026 Quality Control formats that were supplied FILLED IN, on
// file as LIVE records (isDemo: false) the way the calibration pages of
// 16-Sep-2026 are (qcCalibrationRecords.ts), so the formats open with the
// plant's own entries in them.
//
// Read from the supplied pages, cell for cell, and nothing else invented:
//   F/QC/29  ANALYSIS REPORT — the PSL Analysis Report of 07.01.2022: a plain
//            label on chromo paper over a glassine release liner with acrylic
//            adhesive, 130 micron and 160 GSM in total. Tested by Karan,
//            approved by Kapila.
//   F/QC/29  NIVEA SAMPLES - UTILITY TEST REPORT, on the Minutes of Meetings
//            format — nine label samples, every one of them Pass after 24
//            hours in the freezer, the desiccator and the oven. The page's
//            date is typed "02/12/20222" — five digits, plainly a typo for
//            02/12/2022 — and is filed under 02.12.2022. Testing By and
//            Approved By are blank on the page and stay blank.
//   F/QC/30  MINUTES OF MEETINGS — the 07.06.2022 meeting with M/s. Gangwal
//            Healthcare Pvt. Ltd. about quality issues: five attendees and
//            seven points, each with what the plant will do about it. The
//            meeting was minuted on revision 00 (01.01.2022) of the format;
//            the current revision, supplied blank the same day, is 01 /
//            01.12.2022.
//
// The values themselves live in qcReportLayouts.ts, where they are also the
// three formats' specimens, so each page is transcribed in one place only. The
// dates are written on the pages as dd.mm.yyyy or dd/mm/yyyy and stored as the
// ISO dates a date field holds.

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

export const SEED_QC_ANALYSIS_REPORT: RecordInstance<LogSheetData> = seeded("qc-analysis-report-2022-01", "qc-analysis-report", "2022-01-07", {
  header: { ...ANALYSIS_REPORT_HEADER },
  rows: ANALYSIS_REPORT_LINES.map((line, i) => ({ id: `r${i + 1}`, ...line })),
});

export const SEED_QC_UTILITY_TEST_REPORT: RecordInstance<LogSheetData> = seeded(
  "qc-utility-test-report-2022-12",
  "qc-utility-test-report",
  // The page's typed date reads "02/12/20222"; filed under 02.12.2022.
  "2022-12-02",
  {
    header: { ...UTILITY_TEST_HEADER },
    rows: UTILITY_TEST_LINES.map((line, i) => ({ id: `r${i + 1}`, ...line })),
  }
);

export const SEED_QC_MINUTES_GANGWAL: RecordInstance<LogSheetData> = seeded("qc-minutes-of-meetings-2022-06", "qc-minutes-of-meetings", "2022-06-07", {
  header: { ...MINUTES_GANGWAL_HEADER },
  rows: MINUTES_GANGWAL_POINTS.map((point, i) => ({ id: `r${i + 1}`, ...point })),
});

export const SEED_QC_REPORT_RECORDS: RecordInstance[] = [
  SEED_QC_ANALYSIS_REPORT as RecordInstance,
  SEED_QC_UTILITY_TEST_REPORT as RecordInstance,
  SEED_QC_MINUTES_GANGWAL as RecordInstance,
];
