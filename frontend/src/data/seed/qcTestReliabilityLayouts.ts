import type { LogColumn, LogHeaderField, LogSheetLayout } from "../../types";

// F-QC-14 — INTERNAL TEST RELIABILITY RECORD (REQUIREMENTS §111). Supplied by the owner on 13-Oct-2026 among his 41
// QC originals as the workbook "F-QC-14 TEST RELIABILITY RECORD.xlsx" (source-documents/qc-originals-2026-10-13/),
// filled in on 12.02.2022. Until then it was on the Master List of Formats only (F/SYS/02: "F-QC-14, TEST RELIABILITY
// RECORD, 01.12.21") and listed as not in DCRS yet.
//
// WHAT THE PAPER IS. How far QC's inspectors agree: four inspectors, each named under his own heading ("Inspector - 1
// (Kapila)"), test the same three samples for each check, and each check is concluded ("Variation are within
// specification limit, hence test reliability accepted"). The workbook holds two sheets, one per product:
//
//   qc-test-reliability-label   sheet "Label": headed "F-QC-14/00", eight checks — GSM - Total, GSM - Adhesive,
//                               Thickness and Peel Strength on the paper reel's rolls; Dimension, Scuff Test, Coloue
//                               shade and Gloss Testing on three samples of a finished label (FGLA 11430)
//   qc-test-reliability-sleeve  sheet "Sleeve": no number printed, five checks — Thickness, Shrinkage Ratio and Corona
//                               Treatment on the film's rolls; Dimension and Coloue shade on a finished sleeve (FGSL1241)
//
// Both are F-QC-14, as the F/QC/29 pair are F/QC/29 (frontend/tests/formats.test.ts SHARED_BY_THE_COMPANY): the one
// format, one sheet for each product.
//
// Every word is the workbook's own: "Coloue shade", the double spaces after "Specification :" and "Specs :", "60˚".
//
// WHAT A GRID DRAWS DIFFERENTLY, and why. The paper is eight small tables, two to a row, each headed with its check and
// its specification, its first column headed with what was sampled ("Paper Reel SAP batch no.", "Roll no.", "FGLA 11430
// sample no."), then the four inspectors, three lines and a Conclusion line under them. A sheet here is one grid:
//   * each check is three lines of it, the check's heading printed on every one of its lines (as the Gujarati line
//     clearance prints its process on every line, where the paper merges the cell), in the order the sheet is read,
//     row by row: the left table, then the one beside it;
//   * the first column is headed with the three words the paper uses for what was sampled, and holds the reel's batch
//     and roll, or the sample's number, as written;
//   * the inspectors' names, written under their headings on the paper, are the four boxes above the grid headed as
//     the columns are; the finished job's FG code, written in its tables' first heading, is the FG Code box;
//   * each check's Conclusion is a box below the grid, named with its check;
//   * the paper numbers no line, so neither does the sheet (ownLineNumbers).
// A reading outside the specification is not highlighted: each line holds another check, and a column has one band.

/** One check as the paper heads it, and what its three lines sample. */
export interface ReliabilityCheck {
  /** The heading as printed, its lines kept ("GSM - Total\nSpecification : 70 ± 5%"). */
  heading: string;
  /** The check's name, for its Conclusion box ("GSM - Total"). */
  name: string;
  /** What the paper samples for it: the reel or film's rolls, or a finished job's numbered samples. */
  sampled: "roll" | "sample";
}

/** The "Label" sheet's eight checks, read row by row. */
export const LABEL_CHECKS: ReliabilityCheck[] = [
  { heading: "GSM - Total\nSpecification : 70 ± 5%", name: "GSM - Total", sampled: "roll" },
  { heading: "Dimension (Length & Width)\nSpecification : Length :50mm & Width :40mm", name: "Dimension (Length & Width)", sampled: "sample" },
  // The paper's two spaces after the colon.
  { heading: "GSM - Adhesive\nSpecification :  16.0 ± 2", name: "GSM - Adhesive", sampled: "roll" },
  { heading: "Scuff Test\nSpecification :  2lbs/100rounds", name: "Scuff Test", sampled: "sample" },
  { heading: "Thickness\nSpecs :  110 micron", name: "Thickness", sampled: "roll" },
  // "Coloue" is the paper's own spelling.
  { heading: "Coloue shade: Should be OK", name: "Coloue shade", sampled: "sample" },
  { heading: "Peel Strength\nSpecs :  More than 1000 gms", name: "Peel Strength", sampled: "roll" },
  { heading: "Gloss Testing\nSpecification : Minimum Gloss Required at 60˚", name: "Gloss Testing", sampled: "sample" },
];

/** The "Sleeve" sheet's five checks, read row by row. */
export const SLEEVE_CHECKS: ReliabilityCheck[] = [
  { heading: "Thickness: 40 micron", name: "Thickness", sampled: "roll" },
  { heading: "Dimension (Length & Width)\nSpecification : Length :203.20mm & Width :178mm", name: "Dimension (Length & Width)", sampled: "sample" },
  { heading: "Shrinkage Ratio : TD 60 ± 2 %, MD 0 ~ 6%", name: "Shrinkage Ratio", sampled: "roll" },
  { heading: "Coloue shade: Should be OK", name: "Coloue shade", sampled: "sample" },
  { heading: "Corona Treatment - Both side Min. 36 dynes", name: "Corona Treatment", sampled: "roll" },
];

/** The three lines each check takes. */
export const SAMPLES_PER_CHECK = 3;

/** The four inspectors, as the paper heads their columns. */
export const INSPECTORS = ["Inspector - 1", "Inspector - 2", "Inspector - 3", "Inspector - 4"] as const;

/** The paper's words under every check it accepts. */
export const RELIABILITY_ACCEPTED = "Variation are within specification limit, hence test reliability accepted";

const conclusionKey = (i: number) => `conclusion${i + 1}`;

const header = (): LogHeaderField[] => [
  { key: "date", label: "Date :", type: "date", required: true, width: 150, autoFill: { dueDate: true } },
  // The four names written under the inspectors' headings: who did this exercise, never carried to the next one.
  ...INSPECTORS.map((label, i): LogHeaderField => ({ key: `inspector${i + 1}`, label, type: "text", width: 190 })),
  // The finished job sampled: "FGLA 11430" in the heading "FGLA 11430 sample no.".
  { key: "fgCode", label: "FG Code", type: "text", width: 150 },
];

const columns = (): LogColumn[] => [
  { key: "parameter", label: "Test", type: "text", fixed: true, multiline: true, width: 250 },
  { key: "sampleNo", label: "Paper Reel SAP batch no. / Roll no. / sample no.", type: "text", width: 170 },
  ...INSPECTORS.map((label, i): LogColumn => ({ key: `reading${i + 1}`, label, type: "text", width: 120 })),
];

const footer = (checks: ReliabilityCheck[]): LogHeaderField[] =>
  // The paper writes each Conclusion across its table's four columns: a sentence, so a box the width of the page.
  checks.map((check, i) => ({ key: conclusionKey(i), label: `Conclusion (${check.name})`, type: "paragraph" }));

const lines = (checks: ReliabilityCheck[]) => checks.flatMap((check) => Array.from({ length: SAMPLES_PER_CHECK }, () => ({ parameter: check.heading })));

// ---------------------------------------------------------------------------
// The workbook as filled in on 12.02.2022: each line's sample and the four readings, in the order of the checks above.

type Line = [sample: string, readings: [string, string, string, string]];
const same = (v: string): [string, string, string, string] => [v, v, v, v];

const LABEL_LINES: Line[] = [
  ["9460/5234/15", ["72", "71", "70", "71"]],
  ["9460/5234/14", ["70", "71", "72", "71"]],
  ["9460/5234/16", ["71", "72", "72", "71"]],
  ["1", same("L:50 & W:40")],
  ["2", same("L:50 & W:40")],
  ["3", same("L:50 & W:40")],
  ["9460/5234/15", ["14", "15", "15", "15"]],
  ["9460/5234/14", ["15", "14", "16", "14"]],
  ["9460/5234/16", ["15", "15", "14", "15"]],
  ["1", same("Pass")],
  ["2", same("Pass")],
  ["3", same("Pass")],
  ["9460/5234/15", same("110")],
  ["9460/5234/14", same("110")],
  ["9460/5234/16", same("110")],
  ["1", same("OK")],
  ["2", same("OK")],
  ["3", same("OK")],
  ["9460/5234/15", ["1176", "1220", "1160", "1190"]],
  ["9460/5234/14", ["1147", "1178", "1192", "1184"]],
  ["9460/5234/16", ["1190", "1185", "1187", "1177"]],
  ["1", ["83", "81", "81", "82"]],
  ["2", ["81", "82", "80", "81"]],
  ["3", ["82", "80", "81", "81"]],
];

const SLEEVE_LINES: Line[] = [
  // The sleeve sheet's thickness lines carry the label sheet's reel numbers, as written.
  ["9460/5234/15", same("40")],
  ["9460/5234/14", same("40")],
  ["9460/5234/16", same("40")],
  ["1", same("L:203 & W:178")],
  ["2", same("L:203 & W:178")],
  ["3", same("L:203 & W:178")],
  // As written, the spacing and commas of each cell its own.
  ["9396/5146/1", ["TD-61 MD-3", "TD-60,MD-3", "TD-62,MD-3", "TD-61,MD-3"]],
  ["9396/5146/5", ["TD60,MD-4", "TD60,MD-4", "TD61,MD-4", "TD60,MD-4"]],
  ["9396/5146/8", ["TD-61,MD-3", "TD-61,MD-3", "TD-60,MD-3", "TD-62,MD-3"]],
  ["1", same("OK")],
  ["2", same("OK")],
  ["3", same("OK")],
  ["9396/5146/1", same("Pass")],
  ["9396/5146/5", same("Pass")],
  ["9396/5146/8", same("Pass")],
];

const rowsOf = (checks: ReliabilityCheck[], written: Line[]): Record<string, string>[] =>
  lines(checks).map((line, i) => {
    const [sampleNo, readings] = written[i];
    return { ...line, sampleNo, reading1: readings[0], reading2: readings[1], reading3: readings[2], reading4: readings[3] };
  });

const headerOf = (checks: ReliabilityCheck[], fgCode: string): Record<string, string> => ({
  // Written "Date :  12.02.2022" on both sheets.
  date: "2022-02-12",
  inspector1: "Kapila",
  inspector2: "Kirti Patel",
  inspector3: "Anil Raval",
  inspector4: "Karan Prajapati",
  fgCode,
  ...Object.fromEntries(checks.map((_, i) => [conclusionKey(i), RELIABILITY_ACCEPTED])),
});

export const TEST_RELIABILITY_LABEL_HEADER = headerOf(LABEL_CHECKS, "FGLA 11430");
export const TEST_RELIABILITY_LABEL_LINES = rowsOf(LABEL_CHECKS, LABEL_LINES);
export const TEST_RELIABILITY_SLEEVE_HEADER = headerOf(SLEEVE_CHECKS, "FGSL1241");
export const TEST_RELIABILITY_SLEEVE_LINES = rowsOf(SLEEVE_CHECKS, SLEEVE_LINES);

/** The two sheets' checks, by document. */
export const RELIABILITY_CHECKS: Record<string, ReliabilityCheck[]> = {
  "qc-test-reliability-label": LABEL_CHECKS,
  "qc-test-reliability-sleeve": SLEEVE_CHECKS,
};

const SOURCE = "F-QC-14 TEST RELIABILITY RECORD.xlsx";

export const QC_TEST_RELIABILITY_LAYOUTS: Record<string, LogSheetLayout> = {
  // ---- F-QC-14/00 — INTERNAL TEST RELIABILITY RECORD, the "Label" sheet ----
  "qc-test-reliability-label": {
    documentId: "qc-test-reliability-label",
    paperTitle: "INTERNAL TEST RELIABILITY RECORD",
    headerFields: header(),
    headerColumns: 3,
    columns: columns(),
    ownLineNumbers: true,
    rowMode: { kind: "fixedRows", rows: lines(LABEL_CHECKS) },
    footerFields: footer(LABEL_CHECKS),
    specimenHeader: TEST_RELIABILITY_LABEL_HEADER,
    specimenRows: TEST_RELIABILITY_LABEL_LINES,
    specimenSource: `${SOURCE}, sheet "Label" — F-QC-14/00, filled in on 12.02.2022 (on file as a record, qcTestReliabilityRecords.ts)`,
  } satisfies LogSheetLayout,

  // ---- F-QC-14 — INTERNAL TEST RELIABILITY RECORD, the "Sleeve" sheet ----
  "qc-test-reliability-sleeve": {
    documentId: "qc-test-reliability-sleeve",
    paperTitle: "INTERNAL TEST RELIABILITY RECORD",
    headerFields: header(),
    headerColumns: 3,
    columns: columns(),
    ownLineNumbers: true,
    rowMode: { kind: "fixedRows", rows: lines(SLEEVE_CHECKS) },
    footerFields: footer(SLEEVE_CHECKS),
    specimenHeader: TEST_RELIABILITY_SLEEVE_HEADER,
    specimenRows: TEST_RELIABILITY_SLEEVE_LINES,
    specimenSource: `${SOURCE}, sheet "Sleeve" — F-QC-14, filled in on 12.02.2022 (on file as a record, qcTestReliabilityRecords.ts)`,
  } satisfies LogSheetLayout,
};
