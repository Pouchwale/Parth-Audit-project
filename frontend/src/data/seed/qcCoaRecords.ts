import type { LogSheetData, RecordInstance } from "../../types";
import { COA_LABEL_SPECIMEN_HEADER, COA_LABEL_SPECIMEN_ROWS, COA_SLEEVE_SPECIMEN_HEADER, COA_SLEEVE_SPECIMEN_ROWS } from "./qcCoaLayouts";

// THE TWO CERTIFICATES OF ANALYSIS AS SUPPLIED (REQUIREMENTS §57) — the filled
// pages in "F-QC-06_Certificate of analysis (COA)-Label (2).pdf" and
// "F-QC-07_Certificate of analysis (COA)-Sleeve.pdf" (18-Sep-2026), on file as
// LIVE records (isDemo: false) the way the two internal calibration pages are,
// so the two formats open with the plant's own certificates in them. The third
// certificate of the upload, F/QC/25 for corrugated boxes, was supplied blank
// and has no record here.
//
// Read from the scans, box for box, and nothing else invented:
//   F/QC/06  the certificate of 04/01/2022 for production order 33858 — Dr.
//            fixit 301 URP pidicrete 1kg F & B Label Rev3 for Weener Empire
//            Plastic P Ltd.[Masat], 70 x 115 specified and 70 x 115 tested, six
//            colours (Cyan, Magenta, Yellow, Black, Blue, P.151C) all OK, Gloss
//            UV with 84.00% achieved, everything passed, retest 03/07/2022. The
//            Delivery No., the Bar Code Grade and the Bar Code Remarks are
//            blank as issued and are left blank.
//   F/QC/07  the certificate for production order 33814 — Narogi Churana 100g
//            Sleeve Rev-1 for The Unjha Pharmacy, 152.40 x 168.00 specified and
//            152 x 168 tested, five colours (Cyan, Magenta, Yellow, Black,
//            Gold) all OK, Matt UV with 50% achieved, everything passed. The
//            Delivery No. and both Client Item Codes are blank as issued.
//
// TWO THINGS ABOUT THE SLEEVE SCAN, for whoever checks this against the paper:
//   · The certificate carries NO COA Date and NO retest date — both boxes are
//     blank as issued, so both stay blank here. Because it has no date of its
//     own it is filed under the month of its production order, 2022-01: the
//     label certificate of the same batch of uploads is dated 04/01/2022.
//   · The word "White" appears loose beside the fifth colour in the extracted
//     text of the scan, while the printed colour table shows five colours. Only
//     those five printed colours are seeded; the loose "White" is left for the
//     MR to confirm against the controlled copy.
//
// Neither certificate is signed — both print "THIS IS A SYSTEM GENERATED
// DOCUMENT.    IT DOES NOT REQUIRE A SIGNATURE." — so there is no signature to
// carry across, and neither layout has a signature field.

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

export const SEED_QC_COA_LABEL: RecordInstance<LogSheetData> = seeded(
  "qc-coa-label-2022-01",
  "qc-coa-label",
  // The certificate's own COA Date.
  "2022-01-04",
  {
    header: { ...COA_LABEL_SPECIMEN_HEADER },
    rows: COA_LABEL_SPECIMEN_ROWS.map((row, i) => ({ id: `r${i + 1}`, ...row })),
  }
);

export const SEED_QC_COA_SLEEVE: RecordInstance<LogSheetData> = seeded(
  "qc-coa-sleeve-2022-01",
  "qc-coa-sleeve",
  // The certificate carries no date at all, so it is filed under the month of
  // its production order (the label COA of the same batch of uploads is dated
  // 04/01/2022). The COA Date box itself stays blank, as issued.
  "2022-01-01",
  {
    header: { ...COA_SLEEVE_SPECIMEN_HEADER },
    rows: COA_SLEEVE_SPECIMEN_ROWS.map((row, i) => ({ id: `r${i + 1}`, ...row })),
  }
);

export const SEED_QC_COA_RECORDS: RecordInstance[] = [SEED_QC_COA_LABEL as RecordInstance, SEED_QC_COA_SLEEVE as RecordInstance];
