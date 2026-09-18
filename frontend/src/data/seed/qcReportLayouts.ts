import type { LogColumn, LogHeaderField, LogSheetLayout } from "../../types";

// THE THREE QUALITY CONTROL ANALYSES AND MINUTES (REQUIREMENTS §57) — the last
// of the Quality Control formats supplied on 18-Sep-2026, reproduced as
// log-sheet layouts (types/logSheet.ts). These three are not inspection
// records: two are write-ups of a test done in the laboratory, the third is
// what was agreed at a meeting with a customer.
//
//   qc-analysis-report      F/QC/29 (00 / 01.01.2022)  ANALYSIS REPORT
//     — "F-QC-29 _ Analysis report.pdf"
//   qc-utility-test-report  F/QC/29 (00 / 01.01.2022)  NIVEA SAMPLES - UTILITY TEST REPORT
//     — "F-QC-29 Analysis report.pdf" (printed on the MINUTES OF MEETINGS format)
//   qc-minutes-of-meetings  F/QC/30 (01 / 01.12.2022)  MINUTES OF MEETINGS
//     — "F-QC-30 MOM.pdf" (the 07.06.2022 meeting, minuted on revision
//       00 / 01.01.2022) and "MOM F-QC-30.pdf" (the blank current revision,
//       01 / 01.12.2022)
//
// ALL THREE WERE SUPPLIED FILLED IN and are on file as real records. Their
// values live in this file, where they are also the formats' specimens, and are
// seeded as records in qcReportRecords.ts, so each page is transcribed in one
// place only.
//
// Every label, heading and printed value below is the paper's own wording,
// spelling, punctuation and spacing included. Where the paper is odd it is kept
// as printed and flagged where it appears: the analysis report's "Type of
// Adhesive" with its double space, the utility test report's "100ml Turmeric
// Front Label" without the dash its eight neighbours carry, its date typed
// "02/12/20222", and the minutes' own numbering and double spaces.
//
// WHAT HAD TO BE REPRESENTED DIFFERENTLY FROM THE PAPER, and why:
//   * F/QC/29's ANALYSIS REPORT prints its own heading over the table — the
//     supplied page reads "PSL Analysis Report". A layout has no field for a
//     heading and another analysis would be headed differently, so the heading
//     is a carried-forward header field labelled "Report" rather than a printed
//     default nobody could change.
//   * The scan of that page carries a photograph of the label roll beneath the
//     table. A record here holds figures, not photographs, so the figures are
//     reproduced and the photograph is not; the layout says so in print.
//   * F/QC/30 prints a numbered list of who attended under "Participants :".
//     One text box per participant would fix how many may attend, so the
//     meeting's participants are held in a single Participants field, listed as
//     the page lists them and separated by "; ".
//   * The grid's Sr. No. column is the renderer's own and is never declared.
//
// F/QC/29 IS CARRIED BY TWO FORMATS. The Analysis Report and the Nivea utility
// test report — which is printed on the MINUTES OF MEETINGS format — were both
// supplied on 18-Sep-2026 numbered F/QC/29. Both are reproduced as supplied; it
// is for the MR to confirm which format should carry the number.

const sign = (key: string, label: string): LogHeaderField => ({ key, label, type: "text", width: 200, autoFill: { sign: true } });

// ---------------------------------------------------------------------------
// F/QC/29 — ANALYSIS REPORT
//
// A date, the report's own heading, then eleven printed Description lines with
// an Observation written against each.

/** The eleven Description lines the form prints, in the printed order. */
export const ANALYSIS_REPORT_DESCRIPTIONS: string[] = [
  "Job Name",
  "Type of Face Paper",
  "Type of Release Liner",
  // The paper's own double space between "of" and "Adhesive".
  "Type of  Adhesive",
  "Total Caliper (micron)",
  "Total GSM",
  "Face Paper GSM",
  "Release Liner GSM",
  "Adhesive GSM",
  "Face Paper (micron)",
  "Release Liner (micron)",
];

// The supplied page of 07.01.2022: the plain label analysed against all eleven
// lines. Each line carries the printed Description as well as the observation —
// a stored record renders from what is in it, and a line with only a reading in
// it would show that reading against an empty Description.
const ANALYSIS_OBSERVATIONS: string[] = ["Plain Label", "Chromo Paper", "Glassine Paper", "Acrylic", "130", "160", "64", "64", "32", "60", "60"];

export const ANALYSIS_REPORT_LINES: Record<string, string>[] = ANALYSIS_REPORT_DESCRIPTIONS.map((description, i) => ({
  description,
  observation: ANALYSIS_OBSERVATIONS[i],
}));

export const ANALYSIS_REPORT_HEADER: Record<string, string> = {
  // Written on the page as 07.01.2022 and stored as the ISO date a date field holds.
  date: "2022-01-07",
  // The heading the supplied page prints over its table.
  report: "PSL Analysis Report",
  testingBy: "Karan",
  approvedBy: "Kapila",
};

// ---------------------------------------------------------------------------
// F/QC/29 — NIVEA SAMPLES - UTILITY TEST REPORT
//
// The supplied page is headed MINUTES OF MEETINGS and numbered F/QC/29, and
// what is typed on it is a utility test report: a date, then nine label samples
// each held for 24 hours in the freezer, the desiccator and the oven.

const observation = (key: string, place: string): LogColumn => ({
  key,
  label: `Observation (24Hrs.) ${place}`,
  type: "select",
  options: ["Pass", "Fail"],
  width: 190,
});

/** The nine Job Names the page prints, in the printed order. */
export const UTILITY_TEST_JOB_NAMES: string[] = [
  "50ml – Honey F & B Label",
  "50ml – Saffron F & B Label",
  "50ml – Besan F & B Label",
  "50ml – Turmeric Back label",
  "100ml – Saffron F & B Label",
  "100ml – Rose F & B Label",
  // The paper's own: this one line carries no dash after "100ml", unlike its eight neighbours.
  "100ml Turmeric Front Label",
  "100ml – Honey Front Label",
  "100ml – Besan Front Label",
];

// The supplied page: every one of the nine lines reads Pass / Pass / Pass,
// against the Job Name the page prints on that line (as above, a stored record
// renders from what is in it).
export const UTILITY_TEST_LINES: Record<string, string>[] = UTILITY_TEST_JOB_NAMES.map((jobName) => ({
  jobName,
  freeze: "Pass",
  desiccator: "Pass",
  oven: "Pass",
}));

export const UTILITY_TEST_HEADER: Record<string, string> = {
  // The page's date is typed "02/12/20222" — five digits, plainly a typo for
  // 02/12/2022. It is stored as 2022-12-02 and the typo is recorded here.
  date: "2022-12-02",
  // Testing By and Approved By are blank on the page and stay blank.
  testingBy: "",
  approvedBy: "",
};

// ---------------------------------------------------------------------------
// F/QC/30 — MINUTES OF MEETINGS
//
// The client, where and when the meeting was held, its subject, who attended,
// and the points discussed — one line per point, as many as the meeting needed.

/** The 07.06.2022 meeting with Gangwal Healthcare, each point exactly as written. */
export const MINUTES_GANGWAL_POINTS: Record<string, string>[] = [
  { keyPointsDiscussed: "1.Anilox line issue in  TSS Avocado restorative Body Butter 200g Side label – We will take precaution during printing so that same issue does not occur in future." },
  { keyPointsDiscussed: "2. Printing issue in Vitamin C+ 60 Tablets Label – Will take extra care while QC inspection." },
  { keyPointsDiscussed: "3.  Foil line issue – Will change foil specification (will order foil as per required size only)." },
  { keyPointsDiscussed: "4. Foil Registration issue – Will take precaution during printing in future supply." },
  { keyPointsDiscussed: "5. Shade variation issue in TBS deep cleansing beard wash-250ml Label: To avoid shade variation issue will do proofing in 3 options. 1) Gloss UV,  2) Matt UV,  3) Soft Touch. (Shade as per 1st job approval- 2019) As per discussion will do only in standard (LSD not required) and will send the 5 extra sheets for their reference along with shade cards." },
  { keyPointsDiscussed: "6. Misalignment on two sides of labels:  To avoid the misalignment issue will take trial with new punching die on plain labels and send it for trial." },
  { keyPointsDiscussed: "7. In future, in case any deviation is there in any job first we will intimate to customer and then will proceed." },
];

export const MINUTES_GANGWAL_HEADER: Record<string, string> = {
  clientName: "M/s. Gangwal Healthcare Pvt. Ltd.",
  location: "Gujarat Print Pack Publication Pvt. Ltd.",
  // Written on the page as 07.06.2022 and stored as the ISO date a date field holds.
  date: "2022-06-07",
  subject: "Discussion about Quality Issues",
  // The five who attended, as the page's numbered list names them, separated by "; ".
  participants: "1. Gangwal team; 2. Shail Patel; 3. Virat Rajgor; 4. Mehul Prajapati; 5. Kapila Barad",
};

// ---------------------------------------------------------------------------

export const QC_REPORT_LAYOUTS: Record<string, LogSheetLayout> = {
  // ---- F/QC/29 (00 / 01.01.2022) — ANALYSIS REPORT ----
  "qc-analysis-report": {
    documentId: "qc-analysis-report",
    instructions: [
      "ANALYSIS REPORT. The material analysed against the form's eleven printed descriptions: the job, its face paper, release liner and adhesive, the total caliper and GSM, and each layer's GSM and micron.",
      "The scan of the supplied page carries a photograph of the label roll beneath the table. A record here holds the figures, not the photograph: the figures are reproduced, the photograph is not.",
    ],
    headerFields: [
      { key: "date", label: "Date", type: "date", required: true, width: 150, autoFill: { dueDate: true } },
      // The page prints its own heading over the table; the supplied page reads
      // "PSL Analysis Report", and another analysis is headed differently.
      { key: "report", label: "Report", type: "text", width: 260, autoFill: { carryForward: true } },
    ],
    columns: [
      { key: "description", label: "Description", type: "text", fixed: true, width: 260 },
      { key: "observation", label: "Observation", type: "text", width: 240 },
    ],
    rowMode: { kind: "fixedRows", rows: ANALYSIS_REPORT_DESCRIPTIONS.map((description) => ({ description })) },
    footerFields: [sign("testingBy", "Testing By (QA Executive)"), sign("approvedBy", "Approved By (QA Manager)")],
    specimenHeader: ANALYSIS_REPORT_HEADER,
    specimenRows: ANALYSIS_REPORT_LINES,
    specimenSource:
      "F-QC-29 _ Analysis report.pdf — F/QC/29 (00/01.01.2022), the supplied PSL Analysis Report of 07.01.2022 (on file as a record, qcReportRecords.ts)",
  } satisfies LogSheetLayout,

  // ---- F/QC/29 (00 / 01.01.2022) — NIVEA SAMPLES - UTILITY TEST REPORT ----
  "qc-utility-test-report": {
    documentId: "qc-utility-test-report",
    instructions: [
      "NIVEA SAMPLES - UTILITY TEST REPORT. Nine label samples, each held for 24 hours in the freezer, in the desiccator and in the oven, and whether each one passed.",
      "The supplied page is printed on the MINUTES OF MEETINGS format, numbered F/QC/29, while what is typed on it is a utility test report. The number F/QC/29 is also carried by the Analysis Report supplied the same day — for the MR to confirm which format should carry it.",
    ],
    headerFields: [{ key: "date", label: "DATE", type: "date", required: true, width: 150, autoFill: { dueDate: true } }],
    columns: [
      { key: "jobName", label: "Job Name", type: "text", fixed: true, width: 260 },
      observation("freeze", "Freeze"),
      observation("desiccator", "Desiccator"),
      observation("oven", "Oven"),
    ],
    rowMode: { kind: "fixedRows", rows: UTILITY_TEST_JOB_NAMES.map((jobName) => ({ jobName })) },
    footerFields: [sign("testingBy", "Testing By (QA Inspector)"), sign("approvedBy", "Approved By (QA Manager)")],
    specimenHeader: UTILITY_TEST_HEADER,
    specimenRows: UTILITY_TEST_LINES,
    specimenSource:
      'F-QC-29 Analysis report.pdf — F/QC/29 (00/01.01.2022) on the Minutes of Meetings format, the supplied page dated "02/12/20222" (02.12.2022), nine samples all Pass (on file as a record, qcReportRecords.ts)',
  } satisfies LogSheetLayout,

  // ---- F/QC/30 (01 / 01.12.2022) — MINUTES OF MEETINGS ----
  "qc-minutes-of-meetings": {
    documentId: "qc-minutes-of-meetings",
    // The two headings the form prints above its blocks.
    instructions: ["Participants :", "Key points Discussed:"],
    headerFields: [
      { key: "clientName", label: "Client Name :", type: "text", width: 300, autoFill: { carryForward: true } },
      { key: "location", label: "Location :", type: "text", width: 300, autoFill: { default: "Gujarat Print Pack Publication Pvt. Ltd." } },
      { key: "date", label: "Date :", type: "date", required: true, width: 150, autoFill: { dueDate: true } },
      { key: "subject", label: "Subject", type: "text", width: 300, autoFill: { carryForward: true } },
      // The form prints a numbered list of who attended. One text box per
      // participant would fix how many may attend, so the meeting's
      // participants are listed in this one field as the page lists them,
      // separated by "; ".
      { key: "participants", label: "Participants", type: "text", width: 700 },
    ],
    columns: [{ key: "keyPointsDiscussed", label: "Key points Discussed", type: "text", width: 700 }],
    rowMode: { kind: "free", minRows: 1, typicalRows: 7 },
    specimenHeader: MINUTES_GANGWAL_HEADER,
    specimenRows: MINUTES_GANGWAL_POINTS,
    // The meeting was minuted on revision 00 (01.01.2022) of the format; the
    // current revision, supplied blank the same day, is 01 / 01.12.2022.
    specimenSource:
      "F-QC-30 MOM.pdf — the 07.06.2022 meeting with M/s. Gangwal Healthcare Pvt. Ltd., minuted on F/QC/30 revision 00 (01.01.2022); the current revision 01 (01.12.2022) was supplied blank as MOM F-QC-30.pdf (the meeting is on file as a record, qcReportRecords.ts)",
  } satisfies LogSheetLayout,
};
