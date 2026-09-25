import type { LogColumn, LogHeaderField, LogSheetLayout } from "../../types";

// SYSTEM / MANAGEMENT — INTERNAL AUDIT AND CORRECTIVE ACTION (REQUIREMENTS §76).
// The PSTL's six internal-audit formats, built from the pages the company
// supplied on 25-Sep-2026 (source-documents/F-SYS-*.pdf; every page rendered
// unaltered to frontend/public/source/fsys*.jpg, to be shown beside its form):
//
//   sys-audit-schedule  F/SYS/05 (Rev No: 01, Date: 01.03.2023)
//     YEARLY INTERNAL AUDIT SCHEDULE (BRCGS PACKAGING – Issue 06) for the Year
//     — "F-SYS-05-Internal_Audit_Schedule _2024.pdf" and "…_2025.pdf", both filled
//   sys-audit-plan      F/SYS/06 (Rev No: 01, Date: 01.03.2023)
//     INTERNAL AUDIT SCHEDULE & PLAN — "F-SYS-06-Internal Audit Plan (R).pdf",
//     audit 01/2025 of 03/02/2025
//   sys-audit-risk      F/SYS/07 (Rev. no. - 01, Date : 01.03.2023)
//     INTERNAL AUDIT RISK ASSESSMENT - YEAR 2024 — "Copy of F-SYS-07-Internal
//     Audit Risk assessment(R-2024).pdf"
//   sys-audit-findings  F/SYS/08 (Rev No: 01, Date: 01.03.2023)
//     INTERNAL AUDIT FINDINGS / OBSERVATION REPORT — "F-SYS-08 Audit Checklist
//     Compliance Report.pdf", 25 pages, the audit of 17/02/2025
//   sys-audit-nc        F/SYS/10 (Rev No: 01, Date: 01.05.2013 AS PRINTED)
//     BRCGS PACKAGING (ISSUE 06) - INTERNAL AUDIT NC REPORT — "F-SYS-10.pdf",
//     report Feb -25/02
//   sys-nc-car          F/SYS/11 (Rev No: 00, Date: 01.12.2021)
//     NON-CONFORMANCE & CORRECTIVE ACTION REPORT (CAR) — "F-SYS-11-Non
//     Confirmance & Corrective Action Report.pdf", supplied BLANK
//
// The master list of formats (F/SYS/02) numbers no F-SYS-09 — it goes from
// F-SYS-08 to F-SYS-10 — so nothing is missing between them.
//
// VERBATIM MEANS VERBATIM. Every label, heading, printed note and seeded value
// is the page's own wording, spelling, capitals, punctuation and spacing:
// F/SYS/07's double spaces ("Product  safety Plan- HARA", "and  finished
// product", "Sum of  IQA + external audit NCs") and its "Product defense";
// F/SYS/06's "14:30 pm to 17:30 pm" and "PSTL /Manager - Lab"; F/SYS/08's
// "insectoqutor" (4.11.4), "is nots used" (4.8.3), "Training certificates of
// P external pest control service provider’s technicians" (4.11.3),
// "Specification are modified" (3.4.5), "Up-to date" (3.7.4), "Addition
// activity" (4.11.1), "Water do not use in process or machine cleaning."
// (4.3.1), "Snap-off blade knives not be used." (4.9.2.3), "There is elevated
// walkways design prevent contamination" (4.2.6), "Lux Level are maintained"
// (4.2.7), "Technician take the action" (4.11.6), "risk(including
// withdrawals)" (3.6.1), "password- protected" (3.2.2), and "hygiene-
// sensitive" (3.5.5) and "non- production" (4.2.5), whose space after the
// hyphen is in the page's text but falls at the end of a printed line;
// F/SYS/10's "Feb -25/02", "Kapila barad" and "Site standard", its closing
// verification's "Date: -", "Verified By: -" and "Sign.: -" (the dash is
// printed), and the parenthesis its ROOT CAUSE(S) and CORRECTION & CORRECTIVE
// ACTION headings open and never close (F/SYS/11's ROOT CAUSE(S) heading
// too); F/SYS/11's "CPAR" where F/SYS/10 prints "CAR". Curly quotes and dashes
// are as printed (’ ‘ –); the "—" in a label ("Line 1 — Function") is the
// app's own, joining a table's line or block heading to the column it
// labels. Where the page's text layer and its picture disagree, the picture
// wins: F/SYS/08's 4.9.2.3 reads "Compliance." in the text layer, but that
// full stop is printed in white and cannot be seen, so it is "Compliance".
// Trimmed: the space each of these begins with on the page (a slight indent,
// no more) — F/SYS/07 3.1's cell, F/SYS/08 3.3.1's comment, 3.9.1 to 3.9.5's
// "Compliance", 4.4.3's second line and 4.9.2.2's clause, and F/SYS/10's
// "Clause No." — and the spaces at the ends of lines; a line wrapped by its
// cell is joined with one space. F/SYS/08's band headings set their title at
// a tab stop after the number (the text layer has "3.2  Document control"
// with two spaces, "3.1 Product …" with one — the gap looks the same), and
// are written with one space.
//
// WHAT HAD TO BE REPRESENTED DIFFERENTLY FROM THE PAPER, AND WHY:
//   * The grid's Sr. No. is the renderer's own and is never declared: it IS
//     F/SYS/05's SN (1–6) and F/SYS/06's "Sr. No." (1., 2.). F/SYS/07 and
//     F/SYS/08 number their lines their own way, so those numbers are a column
//     named as the paper names it ("Number", "Clause").
//   * F/SYS/05 prints Plan and Actual as two lines under each department and
//     the months across. The strip is turned, as F/MNT/03's is: ONE LINE PER
//     DEPARTMENT, Plan and Actual side by side under each month's heading, so a
//     planned audit and the date it was done are read in one place.
//   * F/SYS/05's 2025 page types a note ACROSS the grid, over March to December
//     of all six departments ("Next IQA schedule to be planned for Issue 7 …").
//     The form has no box for it and a grid cell cannot span, so it is kept in
//     one paragraph box below the grid, "Note (written across the schedule)" —
//     a label of the app's own, since the paper prints none for it.
//   * F/SYS/06 prints the plan table and, below it, the AUDIT SUMMARY table —
//     both one line per audited function, numbered 1., 2. alike. A layout has
//     one grid, so they are ONE grid with the summary's seven columns under an
//     "AUDIT SUMMARY" heading; the plan's "Function" and the summary's "Dept.
//     Name/Clause Name" stay two columns because the page words them
//     differently ("PRODUCT SAFETY & QUALITY MANAGEMENT" / "… SYSTEM"). The
//     auditors' table above the paragraph is two lines of boxes. Where a cell
//     holds two values stacked (No. of Minor NC "4.2.1" over "4.7.6", Status
//     "Closed" over "Closed") they are joined with ", ".
//   * F/SYS/07 prints IQA NC, External NCs, Sum and Audit frequency ONCE PER
//     SECTION, as merged cells. Excel keeps a merged cell's value in its first
//     cell, and so does the record: each section's four figures are on its
//     first data line (1.1, the "2" line, 3.1, 4.1, 5.1, 6.1) and the other
//     lines are blank. Sum and Audit frequency are worked out, never typed —
//     auditRiskCells (engine/auditRisk.ts, re-exported below) gives both, by the
//     criteria the page prints. The section headings ("3 Product Safety and
//     Quality Management System" …) are lines of their own, as printed; section
//     1 prints none. Section 4's heading prints NO Auditee where 3, 5 and 6
//     print "Not applicable": an em dash is written in that cell so it is not
//     taken for a blank to fill (as F/PUR/02's sub-heading, purchaseLayouts.ts).
//     The criteria table and the SECTION / IQA NC / EXTERNAL AUDIT NC (2023)
//     table are reference tables; the two notes beside them, and the title's
//     "(based on review of BRCGS audits & findings of Internal audit etc.)", are
//     instructions. 5.9's cell is too small for its three lines and the page
//     clips them; the full text is the page's own text layer.
//   * F/SYS/08's page 1 plan table is two lines of four boxes ("Line N — …").
//     Its checklist is the grid. Each section heading — the blue band ("3.1
//     Product safety and quality management system") and the statement row
//     under it — is a line of its own: the band's text in the Clause column and
//     the statement in Requirements, prefixed "Fundamental — " where the row's
//     left cell prints "Fundamental" (3.4, 3.5, 3.6, 3.11, 4.8). The top-level
//     "3 …" and "4 …" and the sub-headings 4.9.1, 4.9.2, 4.9.3 print no
//     statement. The compliance column is headed "Sample Audited" instead under
//     3.8, 3.9 and 4.9.1 (and written "Compliance" all the same); one grid cannot
//     head a column two ways, so its heading names both. A cell's paragraphs
//     and "•" bullets are one line each (a paragraph set under a bullet — 3.7.2's
//     "The scope of the certification …" — is a line of its own); lines the page
//     breaks mid-sentence with a paragraph gap are kept broken (3.10.2 "…which
//     clearly" / "define…", 4.4.3 "…any intake" / "pipes…", 4.6.1 "…for the
//     intended" / "purpose…"); a cell split across two pages is joined again.
//     The checklist is a free list — a later audit covers other clauses.
//   * F/SYS/10 and F/SYS/11 are all boxes: no grid. The two check boxes
//     "Non-Conformance" / "Observation" are one choice, labelled with both
//     (F/SYS/10 ticks Non-Conformance). A label printed twice (Auditee’s
//     Sign., Date) carries its block's heading in front, and the "Objective
//     Evidence(s), if any" heading is carried by its boxes. The CAR CLOSING
//     VERIFICATION block is two halves side by side on the paper; as boxes,
//     "Actions Found" and "CAR" / "CPAR" (its right half, printed level with
//     its heading) come before its Date, Verified By and Sign. — top to
//     bottom, the order F/SYS/10 prints them in. (The Insights find the CAR
//     box by its label and its Closed / Not Closed choices,
//     engine/insightRules.ts S3, so the order does not matter to them.)
//     F/SYS/11's note "Note : The following Root Cause Analysis shall be done
//     by the Auditee …" sits between the two halves of the form; it opens the
//     ROOT CAUSE(S) box's label, so it stays where it is printed rather than
//     moving up with the instructions. F/SYS/11's last row, "Sign. & Date of
//     Re-verification & Satisfactory Closure", prints two blank cells; it is
//     one box.
//   * Orange highlighting and bold are not reproduced: F/SYS/08 shades the
//     clause cells of 3.11.2, 3.11.4, 3.11.5 and of section 4 orange (3.11.4,
//     3.11.5 and 4.3.2 half orange, half blue; the page does not say why) and
//     prints NC - 01 (4.2.1) and NC - 02 (4.7.6) in bold; F/SYS/07 prints
//     sections 1 and 2's figures and section 3's "Once / Year" in bold. The
//     black text-cursor bar printed after 4.1.3's and 4.9.2.4's comments is
//     not text.
//   * Each format's own "Format No. … Rev No … Date … Page No." band is the
//     document header the app prints on every record, so it is not a field.
//
// ON THE PAGES, AND LEFT AS THEY ARE:
//   * F/SYS/05: neither page is dated or approved — "Date" and "Approved by
//     (PSTL)" are blank on both. In 2025 January and February are blank for the
//     four departments not audited in February, and nothing is planned after
//     February: the note defers it to Issue 7. 2025's 17.02 is the audit of
//     F/SYS/06 and F/SYS/08.
//   * F/SYS/06: nobody acknowledged the plan (Acknowledge is blank on both
//     lines) and "Verified By:" is blank. Its summary marks 4.2.1 and 4.7.6
//     "Closed", but the NC report for 4.7.6 (F/SYS/10) has an empty closing
//     verification, and no NC report for 4.2.1 was supplied. The "Audit Team
//     Leader:" box names two people, and the second audit's time is written
//     "14:30 pm to 17:30 pm" — 24-hour times with "pm" (text, as written).
//   * F/SYS/07: the section table's totals are right (IQA 0+0+0+3+1+2 = 6,
//     external 0+1+0+4+1+0 = 6), and each section's printed Sum and frequency is
//     what the criteria give (0, 1, 0, 7, 2, 2 — Twice / Year for section 4 only).
//     The title is "YEAR 2024" while the section table is headed "EXTERNAL
//     AUDIT NC (2023)".
//   * F/SYS/08: 3.4.4 is marked "Compliance" beside the comment "Not
//     Applicable, it is completely controlled by customer’s artwork."; 4.10.5's
//     and 4.10.6's comments are the same and stop at "given to concerned";
//     4.11.5's comment ("Trend analysis records verified. Done on monthly basis")
//     speaks of trend analysis where the clause asks for proofing against pests.
//     3.7.1, 3.7.2 and 3.10.1 share one comment, and 4.11.2's and 4.11.3's begin
//     with the same sentence. The report has no signature box.
//   * F/SYS/10: its revision date prints 01.05.2013 where the master list gives
//     rev 1 of F-SYS-10 as 01.03.23. The planned closing date, both reference
//     boxes, every signature and date, the follow-up audit and the whole CAR
//     CLOSING VERIFICATION are blank — neither Satisfactory nor Unsatisfactory,
//     neither Closed nor Not Closed is marked. Only this report, for NC - 02,
//     was supplied.

/** A supplied page, shown unaltered beside the form (REQUIREMENTS §71). */
const page = (file: string, caption: string) => ({ src: `/source/${file}`, caption });

// F/SYS/07's Sum and Audit frequency, worked out by the printed criteria. It
// lives beside the other worked-out cells (engine/computedCells.ts), which is
// what applies it; it is exported here too, with the layout it belongs to.
export { auditRiskCells } from "../../engine/auditRisk";

// ===========================================================================
// F/SYS/05 — YEARLY INTERNAL AUDIT SCHEDULE (BRCGS PACKAGING – Issue 06)
// ===========================================================================

/** The six departments down the side of the schedule, as printed (the longer names wrap over two lines on the paper). */
export const AUDIT_SCHEDULE_DEPARTMENTS = [
  "SENIOR MANAGEMENT COMMITMENT",
  "HAZARD AND RISK MANAGEMENT",
  "PRODUCT SAFETY & QUALITY MANAGEMENT SYSTEM",
  "SITE STANDARDS",
  "PRODUCT & PROCESS CONTROL",
  "PERSONNEL",
];

// The months exactly as the paper heads them.
const SCHEDULE_MONTHS: { key: string; label: string }[] = [
  { key: "jan", label: "JAN" },
  { key: "feb", label: "FEB" },
  { key: "mar", label: "MAR" },
  { key: "apr", label: "APR" },
  { key: "may", label: "MAY" },
  { key: "jun", label: "JUN" },
  { key: "jul", label: "JUL" },
  { key: "aug", label: "AUG" },
  { key: "sep", label: "SEP" },
  { key: "oct", label: "OCT" },
  { key: "nov", label: "NOV" },
  { key: "dec", label: "DEC" },
];

/** The Plan / Actual column key for a month, e.g. febPlan, febActual. */
export const auditScheduleKey = (month: string, which: "Plan" | "Actual") => `${month}${which}`;
export const AUDIT_SCHEDULE_MONTH_KEYS = SCHEDULE_MONTHS.map((m) => m.key);

/**
 * 2024, department by department: an X in the month planned, and the date the
 * audit was done written under it, day.month as on the page. Each part of the
 * standard audited twice, each in the month planned.
 */
export const AUDIT_SCHEDULE_2024: Record<string, string>[] = [
  { junPlan: "X", junActual: "17.06", decPlan: "X", decActual: "16.12" },
  { junPlan: "X", junActual: "17.06", decPlan: "X", decActual: "16.12" },
  { febPlan: "X", febActual: "19.02", augPlan: "X", augActual: "12.08" },
  { febPlan: "X", febActual: "19.02", augPlan: "X", augActual: "12.08" },
  { aprPlan: "X", aprActual: "15.04", octPlan: "X", octActual: "14.10" },
  { aprPlan: "X", aprActual: "15.04", octPlan: "X", octActual: "14.10" },
];

/** 2025: February only, for the two parts audited on 17.02.2025; nothing else is marked. */
export const AUDIT_SCHEDULE_2025: Record<string, string>[] = [
  {},
  {},
  { febPlan: "X", febActual: "17.02" },
  { febPlan: "X", febActual: "17.02" },
  {},
  {},
];

/** Typed across March to December of the 2025 page, over all six departments (wrapped onto two lines there). */
export const AUDIT_SCHEDULE_2025_NOTE =
  "Next IQA schedule to be planned for Issue 7 as per revised risk assessment based on Issue 6 audit completion in Feb 2025";

const AUDIT_SCHEDULE: LogSheetLayout = {
  documentId: "sys-audit-schedule",
  // "… for the Year: 2024" — the year is written into the title line. It is
  // not carried forward: last year's would be wrong on every new schedule.
  headerFields: [{ key: "year", label: "for the Year:", type: "text" }],
  columns: [
    { key: "department", label: "DEPARTMENT", type: "text", fixed: true, width: 230 },
    // The X marks are the plan, which repeats until it is changed; the date an
    // audit was actually done is written afresh every year.
    ...SCHEDULE_MONTHS.flatMap((m): LogColumn[] => [
      { key: auditScheduleKey(m.key, "Plan"), label: "Plan", type: "text", width: 62, group: m.label, autoFill: { carryForward: true } },
      { key: auditScheduleKey(m.key, "Actual"), label: "Actual", type: "text", width: 62, group: m.label, autoFill: { fresh: true } },
    ]),
  ],
  rowMode: { kind: "fixedRows", rows: AUDIT_SCHEDULE_DEPARTMENTS.map((department) => ({ department })) },
  footerFields: [
    { key: "date", label: "Date", type: "date" },
    { key: "approvedBy", label: "Approved by (PSTL)", type: "text", autoFill: { sign: true } },
    // Not printed on the form: the note the 2025 page types across the grid (see the header of this file).
    { key: "scheduleNote", label: "Note (written across the schedule)", type: "paragraph" },
  ],
  // The 2024 page's plan; what was actually done is never a specimen.
  specimenRows: AUDIT_SCHEDULE_2024.map((marks) => Object.fromEntries(Object.entries(marks).filter(([key]) => key.endsWith("Plan")))),
  originalPages: [
    page("fsys05-audit-schedule-2024-p1.jpg", "F/SYS/05 (Rev No: 01, 01.03.2023) — the Yearly Internal Audit Schedule for 2024, as supplied"),
    page("fsys05-audit-schedule-2025-p1.jpg", "F/SYS/05 — the schedule for 2025, February only, with its note typed across March to December, as supplied"),
  ],
  specimenSource:
    "F-SYS-05-Internal_Audit_Schedule _2024.pdf — F/SYS/05 (Rev No: 01, Date: 01.03.2023), the plant's own schedule for 2024; its plan marks are the specimen (the 2025 page is on file as a record too)",
};

// ===========================================================================
// F/SYS/06 — INTERNAL AUDIT SCHEDULE & PLAN
// ===========================================================================

/** The audit team, as the page of audit 01/2025 names it. */
export const AUDIT_PLAN_TEAM: Record<string, string> = {
  auditTeamLeader: "SHASHANK SHETH / KAPILA BARAD",
  auditor1Name: "Mr. Shashank Sheth",
  auditor1Department: "External expert",
  auditor2Name: "Ms. Kapila Barad",
  auditor2Department: "PSTL /Manager - Lab",
};

const AUDIT_SUMMARY = "AUDIT SUMMARY";

/** A cell of the audit summary: what the audit found, written afresh for every audit. */
const summary = (key: string, label: string, width: number): LogColumn => ({ key, label, type: "text", width, group: AUDIT_SUMMARY, autoFill: { fresh: true } });

/**
 * Audit 01/2025, cell for cell: the plan (function, date, time, auditors,
 * auditee, acknowledge — never acknowledged) and the audit summary beside it.
 * The page wraps "10:00 am" / "to 2:00 pm" and "14:30 pm" / "to 17:30" / "pm"
 * in its narrow Audit Time cell.
 */
export const AUDIT_PLAN_2025_01: Record<string, string>[] = [
  {
    function: "PRODUCT SAFETY & QUALITY MANAGEMENT",
    auditDate: "2025-02-17",
    auditTime: "10:00 am to 2:00 pm",
    auditors: "Mr. Shashank Sheth",
    auditee: "Ms. Kapila Barad",
    acknowledge: "",
    summaryName: "PRODUCT SAFETY & QUALITY MANAGEMENT SYSTEM",
    criticalNc: "Nil",
    criticalStatus: "N.A.",
    majorNc: "Nil",
    majorStatus: "N.A.",
    minorNc: "Nil",
    minorStatus: "N.A.",
  },
  {
    function: "SITE STANDARDS",
    auditDate: "2025-02-17",
    auditTime: "14:30 pm to 17:30 pm",
    auditors: "Ms. Kapila Barad",
    auditee: "Mr. Akash",
    acknowledge: "",
    summaryName: "SITE STANDARDS",
    criticalNc: "Nil",
    criticalStatus: "N.A.",
    majorNc: "Nil",
    majorStatus: "N.A.",
    // Two stacked in one cell on the page, 4.2.1 over 4.7.6.
    minorNc: "4.2.1, 4.7.6",
    minorStatus: "Closed, Closed",
  },
];

const AUDIT_PLAN: LogSheetLayout = {
  documentId: "sys-audit-plan",
  instructions: [
    "The Internal Quality Audit for BRCGS - Packaging standards (Issue 06) shall be conducted as per the Audit Plan mentioned below. All concerned personnel are requested to co-operate auditors during the audit. Management Representative communicates any change in Audit Plan to the respective personnel.",
  ],
  headerFields: [
    // A new audit gets a new number: it is never carried forward.
    { key: "auditSrNo", label: "Audit Sr. No.:", type: "text" },
    { key: "date", label: "Date:", type: "date", required: true, autoFill: { dueDate: true } },
    { key: "auditTeamLeader", label: "Audit Team Leader:", type: "text", autoFill: { carryForward: true } },
    // The auditors' table: "Sr. No." / "Auditor’s Name" / "Department", two lines.
    ...[1, 2].flatMap((n): LogHeaderField[] => [
      { key: `auditor${n}Name`, label: `Auditor ${n} — Auditor’s Name`, type: "text", autoFill: { carryForward: true } },
      { key: `auditor${n}Department`, label: `Auditor ${n} — Department`, type: "text", autoFill: { carryForward: true } },
    ]),
  ],
  // The plan table and the AUDIT SUMMARY table as one grid (see the header of
  // this file). What is planned — the function, who audits it, who is audited
  // — repeats; the day, the time, the acknowledgement and everything the audit
  // found are written afresh.
  columns: [
    { key: "function", label: "Function", type: "text", width: 230, autoFill: { carryForward: true } },
    { key: "auditDate", label: "Audit Date", type: "date", width: 140, autoFill: { fresh: true } },
    { key: "auditTime", label: "Audit Time", type: "text", width: 150, autoFill: { fresh: true } },
    { key: "auditors", label: "Auditors", type: "text", width: 170, autoFill: { carryForward: true } },
    { key: "auditee", label: "Auditee", type: "text", width: 160, autoFill: { carryForward: true } },
    { key: "acknowledge", label: "Acknowledge", type: "text", width: 130, autoFill: { fresh: true } },
    summary("summaryName", "Dept. Name/Clause Name", 230),
    summary("criticalNc", "No. of Critical NC", 110),
    summary("criticalStatus", "Status", 90),
    summary("majorNc", "No. of Major NC", 110),
    summary("majorStatus", "Status", 90),
    summary("minorNc", "No. of Minor NC", 120),
    summary("minorStatus", "Status", 110),
  ],
  rowMode: { kind: "free", minRows: 1, typicalRows: 6 },
  footerFields: [{ key: "verifiedBy", label: "Verified By:", type: "text", autoFill: { sign: true } }],
  specimenHeader: AUDIT_PLAN_TEAM,
  specimenRows: AUDIT_PLAN_2025_01.map(({ function: fn, auditors, auditee }) => ({ function: fn, auditors, auditee })),
  originalPages: [page("fsys06-audit-plan-2025-01-p1.jpg", "F/SYS/06 (Rev No: 01, 01.03.2023) — the Internal Audit Schedule & Plan of audit 01/2025, dated 03.02.2025, as supplied")],
  specimenSource:
    "F-SYS-06-Internal Audit Plan (R).pdf — F/SYS/06 (Rev No: 01, Date: 01.03.2023), the plant's own plan of audit 01/2025 (03.02.2025); its team, functions, auditors and auditees are the specimen",
};

// ===========================================================================
// F/SYS/07 — INTERNAL AUDIT RISK ASSESSMENT - YEAR …
// ===========================================================================

/**
 * Every printed line of the clause list, in order: Number | Audit Scope |
 * Auditee. The section headings are lines of their own (section 1 prints
 * none). Wrapped cells are one line here; 5.9's cell breaks after
 * "intermediate" and is clipped on the page.
 */
export const AUDIT_RISK_CLAUSES: [number: string, auditScope: string, auditee: string][] = [
  ["1.1", "Quality & Product Safety Objectives", "PSTL"],
  ["1.2", "Management Review", "PSTL"],
  ["2", "Product  safety Plan- HARA", "PSTL"],
  ["3", "Product Safety and Quality Management System", "Not applicable"],
  ["3.1", "Product safety and Quality Manual", "PSTL"],
  ["3.2", "Document Control", "PSTL"],
  ["3.3", "Record-keeping", "PSTL"],
  ["3.4", "Specification", "Quality"],
  ["3.5", "Internal Audit", "PSTL"],
  ["3.6", "Corrective & Preventive action", "PSTL"],
  ["3.7", "Supplier and raw material approval and performance monitoring", "Purchase"],
  ["3.8", "Product authenticity claims & chain of custody (VACCP)", "PSTL"],
  ["3.9", "Management of subcontracted processes", "Purchase"],
  ["3.10", "Management of suppliers of services", "Purchase"],
  ["3.11", "Traceability", "PSTL"],
  ["3.12", "Complaint Handling", "Quality"],
  ["3.13", "Management of Product withdrawals, incidents & product recalls", "PSTL"],
  // The page prints no Auditee on this heading (3, 5 and 6 print "Not applicable").
  ["4", "Site Standards", "—"],
  ["4.1", "External Standards", "COO"],
  ["4.2", "Building Fabric", "COO"],
  ["4.3", "Utilities", "Maintenance"],
  ["4.4", "Site security & Product defense (TACCP)", "HR & admin"],
  ["4.5", "Layout product Flow and segregation", "PSTL"],
  ["4.6", "Equipment", "Maintenance"],
  ["4.7", "Maintenance", "Maintenance"],
  ["4.8", "Housekeeping and Hygiene", "HR & admin"],
  ["4.9", "Product contamination & control (Glass, brittle plastics, ceramics & similar material control + Sharps & Metal control + Chemical & Biological control)", "PSTL"],
  ["4.10", "Waste and Waste disposal", "Store"],
  ["4.11", "Pest management", "HR & admin"],
  ["5", "Product Control", "Not applicable"],
  ["5.1", "Product Design and development", "Production"],
  ["5.2", "Graphic design & artwork developments", "Production"],
  ["5.3", "Packaging print control", "Production"],
  ["5.4", "Process control", "Production"],
  ["5.5", "Calibration and control of measuring and monitoring devices", "Quality"],
  ["5.6", "Product inspection and laboratory testing", "Quality"],
  ["5.7", "Control of non-conforming product", "Quality"],
  ["5.8", "Incoming goods", "Store"],
  ["5.9", "Storage of all materials and intermediate and  finished product", "Store"],
  ["5.10", "Dispatch and Transport", "Dispatch"],
  ["6", "Personnel", "Not applicable"],
  ["6.1", "Training & competence", "HR & admin"],
  ["6.2", "Personal Hygiene", "HR & admin"],
  ["6.3", "Staff Facilities", "HR & admin"],
  ["6.4", "Medical screening", "HR & admin"],
  ["6.5", "Protective clothing", "HR & admin"],
];

const AUDIT_RISK: LogSheetLayout = {
  documentId: "sys-audit-risk",
  // The rest of the title line, then the two notes printed beside the list.
  instructions: [
    "(based on review of BRCGS audits & findings of Internal audit etc.)",
    "Risks will be reviewed in accordance with audit findings and ratings will be adjusted accordingly",
    "Irrespective of Risk rating criteria, each clause to be audited minimum Twice / Year",
  ],
  // "INTERNAL AUDIT RISK ASSESSMENT - YEAR 2024": not carried forward.
  headerFields: [{ key: "year", label: "YEAR", type: "text" }],
  columns: [
    { key: "number", label: "Number", type: "text", fixed: true, width: 70 },
    { key: "auditScope", label: "Audit Scope", type: "text", fixed: true, width: 330 },
    { key: "auditee", label: "Auditee", type: "text", fixed: true, width: 130 },
    // The NCs the year's audits found — counted afresh for every assessment.
    { key: "iqaNc", label: "IQA NC", type: "number", decimals: 0, width: 90, autoFill: { fresh: true } },
    { key: "externalNc", label: "External NCs", type: "number", decimals: 0, width: 100, autoFill: { fresh: true } },
    // Worked out, never typed (auditRiskCells).
    { key: "sum", label: "Sum", type: "text", computed: true, width: 70 },
    { key: "frequency", label: "Audit frequency", type: "text", computed: true, width: 130 },
  ],
  rowMode: {
    kind: "fixedRows",
    rows: AUDIT_RISK_CLAUSES.map(([number, auditScope, auditee]) => ({ number, auditScope, auditee })),
  },
  referenceTables: [
    {
      title: "Sum of IQA + external audit NCs → Audit Frequency",
      columns: ["Sum of  IQA + external audit NCs", "Audit Frequency"],
      rows: [
        ["< = 4", "Once / Year"],
        ["5 to 15", "Twice / Year"],
        ["> = 16", "3 times / Year"],
      ],
    },
    {
      title: "SECTION / IQA NC / EXTERNAL AUDIT NC (2023)",
      columns: ["SECTION", "IQA NC", "EXTERNAL AUDIT NC (2023)"],
      rows: [
        ["1", "0", "0"],
        ["2", "0", "1"],
        ["3", "0", "0"],
        ["4", "3", "4"],
        ["5", "1", "1"],
        ["6", "2", "0"],
        // The totals line, its SECTION cell blank as printed.
        ["", "6", "6"],
      ],
    },
  ],
  originalPages: [page("fsys07-audit-risk-2024-p1.jpg", "F/SYS/07 (Rev. no. - 01, 01.03.2023) — the Internal Audit Risk Assessment for 2024, as supplied")],
  specimenSource:
    "Copy of F-SYS-07-Internal Audit Risk assessment(R-2024).pdf — F/SYS/07 (Rev. no. - 01, Date : 01.03.2023), the plant's own assessment for 2024; the clause list and auditees are the format's, the NC counts are that year's",
};

// ===========================================================================
// F/SYS/08 — INTERNAL AUDIT FINDINGS / OBSERVATION REPORT
// "BRCGS Packaging Materials – ISSUE 6 / Audit Checklist & Compliance Report"
// ===========================================================================

/**
 * One line of the checklist as printed: Clause | Requirements (its
 * paragraphs and "•" bullets, one entry each) | Compliance/Non compliance |
 * Comments / Outcome (its paragraphs). A section heading is a line of its own,
 * with nothing in the last two cells.
 */
type ChecklistLine = [clause: string, requirements: string[], compliance: string, comments: string[]];

// The audit of 17/02/2025, every line of pages 2 to 25, in order, cell for cell.
const AUDIT_CHECKLIST_LINES: ChecklistLine[] = [
  // Page 2
  ["3 Product safety and quality management", [], "", []],
  ["3.1 Product safety and quality management system", ["The site’s processes and procedures to meet the requirements of this Standard shall be documented to allow consistent application, facilitate training, and support due diligence in the production of a safe and legal product."], "", []],
  ["3.1.1", ["The site’s documented policies, procedures, working methods and practices shall be collated in a navigable and readily accessible system, with consideration being given to translation into appropriate languages.", "Where the site is part of a company governed by a head office, the interaction between the site’s system and that of other sites and the head office should be documented.", "All policies and procedures necessary for the operation of the site being assessed must be available at the site."], "Compliance", ["All procedure, policy & working methods are evident.", "Personal Hygiene & Hand wash instruction (signage) found at change room"]],
  ["3.1.2", ["The system shall be fully implemented, reviewed at appropriate planned intervals and improved where necessary."], "Compliance", ["Yes, as per requirement. Review on yearly basis of all Manuals & changes done only if necessary."]],
  ["3.2 Document control", ["An effective document control system shall ensure that only the correct versions of documents, including recording forms, are available and in use."], "", []],
  ["3.2.1", ["The company shall have a documented procedure to manage documents which form part of the product safety and quality management system. This shall include:", "• a list of all controlled documents indicating the latest version number", "• the method for the identification and authorisation of controlled documents", "• a record of the reason for any changes or amendments to the documents", "• the system for the replacement of existing documents when these are updated."], "Compliance", ["Yes, Procedure for document control is in place"]],
  ["3.2.2", ["Where documents and records are in electronic form these shall be:", "• stored securely (e.g. with authorised access, control of amendments, or password- protected)", "• backed up to prevent loss or malicious intervention."], "Compliance", ["Yes, limited/authorized access and control through password protection. Back up of electronic files are taken at Local system, server & external hard disk."]],
  // Page 3
  ["3.3 Record-keeping", ["The site shall maintain genuine records to demonstrate the effective control of product safety, legality and quality."], "", []],
  ["3.3.1", ["Records shall be legible, appropriately authorised, retained in good condition, and retrievable."], "Compliance", ["System is in place to keep records in good condition"]],
  ["3.3.2", ["Any alterations to records shall be authorised and justification for the alteration shall be recorded."], "Compliance", ["No Alterations Observed"]],
  ["3.3.3", ["The company’s senior management shall ensure that documented procedures are established and implemented for the organisation, review, maintenance, storage and retrieval of all records relating to product safety, legality, regulatory compliance and quality."], "Compliance", ["Yes, verified documented procedure for record control."]],
  ["3.3.4", ["The site shall document its period of retention for records which relate to the usable life of the packaging and the products it is designed to contain, and shall respect any customer requirements."], "Compliance", ["Retention period is defined as in master list of record for each format"]],
  ["3.4 Specifications", ["Fundamental — Appropriate specifications shall exist for raw materials, intermediate and finished products, and for any product or service which could affect the safety, quality or legality of the finished product and customer requirements."], "", []],
  ["3.4.1", ["Specifications shall be suitably detailed, accurate and compliant with relevant product safety and legislative requirements. They may be in the form of a printed or electronic document, or part of an online specification system."], "Compliance", ["Yes, documented as per product safety and legislative requirements & specification is set for all RM & PM in hard copy.", "Finish product specifications are as provided & approved by customer for each order"]],
  ["3.4.2", ["The company shall seek formal agreement of specifications with relevant parties where required by the customer. Where specifications are not formally agreed, then the company shall be able to demonstrate that it has taken steps to put an agreement in place."], "Compliance", ["Yes, done through formal mail evident"]],
  // Page 4
  ["3.4.3", ["Where packaging for food or other hygiene-sensitive products is produced, a statement of compliance shall be maintained which enables users of the packaging to ensure compatibility between the packaging and the product with which it may be in contact.", "The statement of compliance shall be compiled and authorised by a suitably competent person. It shall contain as a minimum:", "• the nature of the materials used in the manufacture of the packaging", "• confirmation that the packaging meets relevant legal requirements", "• the inclusion of any post-consumer recycled materials. The statement shall identify:", "• its date of issue and, where appropriate, its expiry date", "• any limitations of use of the product, and", "• the usable life of the packaging (where relevant).", "The site shall review the statement of compliance at a risk-based frequency."], "Compliance", ["Declaration of compliance is in place as per requirement of standard"]],
  ["3.4.4", ["The presence of a manufacturer’s trademarks or logo on packaging materials shall, where appropriate, be formally agreed between the relevant parties."], "Compliance", ["Not Applicable, it is completely controlled by customer’s artwork."]],
  ["3.4.5", ["A specification review process shall be operated where the product composition or characteristics change or at an appropriate predetermined interval. Reviews and changes shall be documented and communicated to the customer, where required.", "Any changes to existing agreements or contracts shall be agreed, documented and communicated to appropriate departments."], "Compliance", ["Specification are modified when change in material or composition. Review on yearly basis"]],
  ["3.5 Internal audits", ["Fundamental — The company shall be able to demonstrate that it verifies the effective application of the requirements of the Standard and any applicable module through internal audits."], "", []],
  ["3.5.1", ["There shall be a scheduled programme of internal audits.", "The frequency at which each activity is audited shall be established in relation to the risks associated with the activity and previous audit performance. All processes shall be audited at least annually.", "The internal audit programme shall be fully implemented and effective."], "Compliance", ["Internal audit plan was in place & facility is audited against all 6 clauses twice a year."]],
  // Page 5
  ["3.5.2", ["As a minimum, the scope of the internal audit programme shall include the:", "• HARA or product safety and quality plan, including the activities to implement it (e.g. supplier approval, corrective actions and verification)", "• prerequisite programmes (e.g. hygiene, pest control)", "• product defence and product fraud prevention plans", "• procedures implemented to achieve the Standard and modules.", "Each internal audit within the programme shall have a defined scope and consider a specific activity or section of the HARA or product safety plan."], "Compliance", ["Yes, the scope of internal audit covers the HARA, PRPs, Product Defence & Fraud etc."]],
  ["3.5.3", ["Internal audits shall be carried out by appropriately trained and competent auditors. Auditors shall be independent from the process or activity being audited to ensure impartiality (i.e. they must not audit their own work)."], "Compliance", ["Yes, documented and verified. Cross functional audit has been done."]],
  ["3.5.4", ["Internal audit reports shall identify conformity as well as non-conformity.", "Results shall be notified to the personnel responsible for the process/activity audited. Root cause analysis shall be used to determine appropriate corrective actions and a designated manager shall be responsible for the implementation."], "Compliance", ["NCR & their effective closures were evident."]],
  ["3.5.5", ["For sites manufacturing materials intended to be in contact with food or other hygiene- sensitive products, in addition to the internal audit programme, there shall be a separate programme of documented inspections to ensure that the factory environment and processing equipment are maintained in a suitable condition. At a minimum, these inspections shall include:", "• hygiene inspections to assess cleaning and housekeeping performance", "• inspections to identify risks to the product from the building or equipment.", "The frequency of these inspections shall be based on risk."], "Compliance", ["Factory Environment is covered under GMP checking as well as site standard compliance checklists & chemical and microbiological control program is also in place."]],
  ["3.6 Corrective and preventive action", ["Fundamental — The site shall be able to demonstrate that it uses the information from failures in its systems and processes to take any necessary corrective and preventive actions."], "", []],
  // Page 6
  ["3.6.1", ["The site shall have a procedure for the completion of root cause analysis and corrective actions and to determine preventive actions. As a minimum, root cause analysis shall be used to implement ongoing improvements and to prevent recurrence of non-conformities in the event of:", "• an analysis of non-conformities for trends which shows that there has been a significant increase in a type of non-conformity", "• a non-conformity which places the safety, legality, integrity or quality of a product at risk(including withdrawals)", "• the results of internal, second- or third-party audits", "• customer complaints", "• failure of in-line testing equipment", "• any incidents."], "Compliance", ["Procedure for Correction, Corrective action & Preventive Action is in place.", "Verified and found ok."]],
  ["3.6.2", ["The site shall evaluate the effectiveness of root cause analyses, and of any corrective and preventive actions."], "Compliance", ["The effectiveness of root cause analysis and of any corrective and preventive actions is verified during MRM."]],
  ["3.7 Supplier approval and performance monitoring", ["The company shall operate effective procedures for the approval and monitoring of its suppliers."], "", []],
  ["3.7.1", ["The site shall have a documented supplier approval procedure and continual assessment programme in place, based upon risk analysis and defined performance criteria. These shall apply to the suppliers of:", "• materials", "• outsourced (subcontracted) production.", "The procedure shall ensure that the materials and services procured conform to defined requirements where there is a potential impact to product safety, quality or legality."], "Compliance", ["Documented Procedure for supplier Management verified."]],
  ["3.7.2", ["The approval procedure shall be based on risk and include either one or a combination of:", "• a valid certification to the applicable Global Standard or GFSI-benchmarked standard.", "The scope of the certification shall include the raw materials purchased, and the site shall validate any BRCGS certificates using the BRCGS Directory.", "• supplier audits, with a scope to include product safety, traceability, HARA review and good manufacturing practices, undertaken by an experienced and demonstrably competent product safety auditor. Where the supplier audit is completed by a second or third party, the company shall be able to:", "• demonstrate the competency of the auditor", "• confirm that the scope of the audit includes product safety, traceability, HARA review and good manufacturing practices", "• obtain and review a copy of the full audit report", "or", "• where a valid risk-based justification is provided, a satisfactorily completed supplier questionnaire may be used for initial approval. The questionnaire shall have a scope that includes product safety, traceability, HARA review and good manufacturing practices, and it shall have been reviewed and verified by a demonstrably competent person."], "Compliance", ["Documented Procedure for supplier Management verified."]],
  // Page 7
  ["3.7.3", ["There shall be a documented process for ongoing supplier performance review, based on risk and defined performance criteria. The process shall be fully implemented.", "Where approval is based on questionnaires, these shall be reissued at agreed intervals based on risk, and suppliers shall be required to notify the site of any significant changes in the interim, including any change in certification status.", "Records of ongoing supplier assessment and any necessary actions shall be maintained and reviewed."], "Compliance", ["Supplier evaluation is done for material & service provider."]],
  ["3.7.4", ["The site shall have an up-to-date list or database of approved suppliers. This may be on paper (hard copy) or it may be controlled on an electronic system.", "The list or relevant components of the database shall be readily available to the relevant staff."], "Compliance", ["Up-to date master list of approved suppliers is in place.", "Approved Supplier list"]],
  ["3.7.5", ["The company shall ensure that its suppliers of raw materials have an effective traceability system. Where a supplier has been approved based on a questionnaire instead of certification or audit, verification of the supplier’s traceability system shall be carried out on first approval and then at least every 3 years. This may be achieved by a traceability test."], "Compliance", ["Suppliers of raw materials have effective traceability system, verified during the supplier audits and its audit reports."]],
  // Page 8
  ["3.7.6", ["Where raw materials are purchased from companies that are not the manufacturer or packer (e.g. purchased from an agent, broker or wholesaler), the site shall know the identity of the last manufacturer or packer.", "Information to enable the approval of the manufacturer or packer shall be obtained from the agent/broker or directly from the supplier, unless the agent/broker is certificated to the relevant Global Standard (e.g. Global Standard for Agents and Brokers) or a relevant standard benchmarked by GFSI."], "Compliance", ["Every supplied product has complete details of manufacturer like company name, product identification, batch / lot number."]],
  ["3.7.7", ["The procedures shall define how exceptions are handled; for example, the use of products or services where an audit or monitoring has not been undertaken. Assessment (on a batch or delivery basis) may take the form of:", "• certificate of analysis", "• statement of compliance."], "Compliance", ["Yes,", "Exceptions are Documented in Procedure for Supplier Management verified.", "COA and declaration of compliance is evident for inks."]],
  ["3.8 Product authenticity, claims and chain of custody", ["Systems shall be in place to minimise the risk of purchasing fraudulent raw materials for packaging and to ensure that all product descriptions and claims are legal, accurate and verified."], "", []],
  ["3.8.1", ["The company shall have processes in place to access information on historical and developing threats to the supply chain which may present a risk of substitution of raw materials (i.e. fraudulent raw materials). Such information may, for example, come from:", "• trade associations", "• government sources", "• private resource centres."], "Compliance", ["Documented Procedure for raw material vulnerability assessment."]],
  ["3.8.2", ["A documented vulnerability assessment shall be carried out on all raw materials or groups of raw materials to assess the potential risk of substitution. This shall take into account:", "• historical evidence of substitution", "• economic factors which may make substitution more attractive", "• ease of access to raw materials through the supply chain", "• sophistication of routine and upstream testing to identify substitution", "• nature of the raw material.", "The output from this assessment shall be a documented vulnerability assessment plan.", "This plan shall be kept under review to reflect changing economic circumstances and market intelligence which may alter the potential risks. It shall be formally reviewed annually."], "Compliance", ["Covered in Product Defence and Product Fraud Prevention Plan."]],
  // Page 9
  ["3.8.3", ["Where raw materials are identified as being at particular risk of substitution, the vulnerability assessment plan shall include appropriate assurance and/or testing processes to mitigate the identified risk(s)."], "Compliance", ["System is in place for incoming material visual checked and accepted on the basis of COA or DOC."]],
  ["3.9 Management of subcontracted activities and outsourced processes", ["Where any process steps in the manufacture of the packaging material are outsourced to a third party, or the process is wholly subcontracted to another site, this shall be managed to ensure it does not compromise the quality, safety or legality of the product."], "", []],
  ["3.9.1", ["The company shall be able to demonstrate that, where any part of the production is outsourced and undertaken off-site, this has been declared to the customer or brand owner and, where required, approval has been granted."], "Compliance", ["System is in place", "Currently nothing is outsourced."]],
  ["3.9.2", ["Where any processes are subcontracted or outsourced, including artwork or pre-press activity, the risks to the quality and safety of the product shall form part of the hazard and risk analysis and the company’s evaluation of the system shall be held on record."], "Compliance", ["Available"]],
  ["3.9.3", ["Clear specifications shall be agreed for all work outsourced or subcontracted."], "Compliance", ["Available"]],
  ["3.9.4", ["Where any process steps in the manufacture of the packaging materials are subcontracted or outsourced, final release of the product shall remain the responsibility of the site.", "Controls shall be in place for checks on finished work to ensure product safety and quality meets specification prior to dispatch to the final customer."], "Compliance", ["System is in place"]],
  ["3.9.5", ["The company shall ensure that any subcontracted or outsourced processors have an effective traceability system. Where a supplier has been approved based on a questionnaire instead of certification or audit, verification of the supplier’s traceability system shall be carried out on first approval and then at least once every 3 years. This may be achieved by a traceability test."], "Compliance", ["System is in place"]],
  // Page 10
  ["3.10 Management of suppliers of services", ["The company shall be able to demonstrate that, where services are outsourced, any risks presented to product safety, quality or legality have been evaluated to ensure effective controls are in place."], "", []],
  ["3.10.1", ["There shall be a documented procedure for the approval and monitoring of suppliers of services. Such services shall include, but are not limited to:", "• pest control", "• laundry services", "• transport and distribution", "• storage and dispatch", "• sorting or rework", "• laboratory services", "• calibration services", "• waste management", "• product safety and quality consultants to the site.", "Providers of utilities such as water, electricity or gas may be excluded on the basis of risk. This approval and monitoring process shall be risk-based and take into consideration:", "• risk to the safety and quality of products", "• compliance with any specific legal requirements", "• potential risks to the security of the product (i.e. risks identified in the vulnerability and product defence assessments)."], "Compliance", ["Documented Procedure for supplier Management verified."]],
  ["3.10.2", ["Contracts or formal agreements shall exist with the suppliers of services which clearly", "define service expectations and ensure potential risks associated with the service have been addressed."], "Compliance", ["Yes, agreement available for service provider including risk assessment in Procedure for service vendor selection and evaluation"]],
  ["3.11 Traceability", ["Fundamental — The site shall be able to trace and follow all raw materials through processing (including subcontracted processes) to the distribution of the finished product (packaging material) to the customer and vice versa."], "", []],
  ["3.11.1", ["The site shall have a documented traceability procedure and system that can trace and follow all raw materials from the supplier through all stages of processing (including subcontracted processes) and distribution of the finished product, and vice versa.", "Where continuous processes are used, or raw materials are in bulk silos, traceability shall be achieved to the best practical level of accuracy."], "Compliance", ["Yes, Procedure for identification and traceability.", "Verified the record of backward traceability."]],
  // Page 11
  ["3.11.2", ["Identification of raw materials, intermediate products, finished products, non-conforming products and quarantined goods shall be adequate to ensure traceability."], "Compliance", ["Yes, system in place.", "Highlighted in procedure for Identification and traceability."]],
  ["3.11.3", ["For traceability, an appropriate system shall be in place to ensure that the customer can identify a product or production lot number for the product.", "Where coding is applied, this shall be checked for legibility and accuracy against production records."], "Compliance", ["Yes, all materials are provided with SAP generated bar code / batch code as appropriate & verified for Paper rolls"]],
  ["3.11.4", ["The traceability procedure and system shall be tested at a predetermined frequency, at least annually, and the results shall be retained and easily retrieved for inspection.", "Traceability of all materials shall be achievable in a timely manner."], "Compliance", ["Traceability-forward and backward being done once in a year.", "Forward traceability is done and Backward traceability is done, verified the record and found ok."]],
  ["3.11.5", ["Where rework or any reworking operation is performed or outsourced or subcontracted activities are carried out, traceability shall be maintained."], "Compliance", ["Yes, rewinding log sheet is verified."]],
  ["3.11.6", ["Traceability of test data and samples to production lots shall be maintained."], "Compliance", ["Maintained with the traceability records."]],
  ["3.12 Complaint-handling", ["Customer complaints relating to product hygiene, safety or quality shall be handled effectively and the information used to reduce complaint levels."], "", []],
  ["3.12.1", ["All complaints shall be recorded and investigated (including root cause analysis) and the results of the investigation documented.", "Actions appropriate to the seriousness and frequency of the problems identified shall be carried out promptly and effectively by appropriately trained staff."], "Compliance", ["Yes, Customer complaint with RCA & CAPA records verified."]],
  ["3.12.2", ["Complaint data shall be analysed to identify significant trends. Where there has been an increase or repetition of a complaint type, root cause analysis shall be used to implement ongoing improvements to product safety, legality and quality, and to avoid recurrence. This analysis shall be made available to relevant staff."], "Compliance", ["Trend analysis of past customer complaints as well as for current year also evident."]],
  // Page 12
  ["3.13 Management of product withdrawals, incidents and product recalls", ["The site shall have a documented procedure and systems in place to effectively manage any product withdrawals, returns from customers, incidents or product recalls in order to ensure that all potential risks to the hygiene, quality, safety or legality of products and the final consumer are controlled."], "", []],
  ["3.13.1", ["A product withdrawal procedure shall be documented and include as a minimum:", "• identification of the key personnel involved in assessing potential product withdrawals or returns, with their responsibilities clearly defined", "• a communications plan including methods of informing customers", "• root cause analysis and corrective action to implement appropriate improvements as required."], "Compliance", ["Yes, documented Procedure for Product Withdrawals & Recall covers all the requirement."]],
  ["3.13.2", ["The withdrawal procedure shall be capable of being operated at any time and will take into account notification to the supply chain, stock return, logistics for recovery, storage of recovered product, and disposal."], "Compliance", ["Yes, all departments are covered and aware for withdrawal procedure"]],
  ["3.13.3", ["The company shall provide written guidance and training for relevant staff regarding the type of event that would constitute an incident.", "Incidents may include:", "• disruption to normal production processes", "• disruption to key services such as water, energy, transport, refrigeration processes, staff availability and communications", "• events such as fire, flood or natural disaster", "• malicious contamination or sabotage", "• failure of, or attacks against, digital cyber-security.", "Where products which have been released from the site could be affected by an incident, the need to withdraw products and, where appropriate, advise customers to withdraw and/or recall products shall be considered.", "A documented incident reporting procedure shall be in place."], "Compliance", ["Yes, documented in Procedure for Incident Reporting covers types of incidents.", "No Incident recorded till date."]],
  ["3.13.4", ["The company shall determine and document the activity required to effectively manage an incident to prevent release of product where hygiene, safety or quality may have been affected."], "Compliance", ["Yes, Documented procedure is in place."]],
  // Page 13
  ["3.13.5", ["A procedure to manage product recalls initiated by the brand owner or specifier shall be documented and include as a minimum:", "• identification of the key personnel involved in assessing potential recalls, together with clearly defined responsibilities", "• a communications plan that includes methods of informing customers and (where necessary) regulatory bodies in a timely manner."], "Compliance", ["Yes, all Information as per standard requirement mentioned in Withdrawal and recall procedure."]],
  ["3.13.6", ["Where a site’s products are involved in a product recall, the site shall assist with provision of information (such as traceability) as required."], "Compliance", ["Yes, site can assist with the provision of information such as traceability."]],
  ["3.13.7", ["The product withdrawal procedure shall be tested, at least annually, in a way that ensures its effective operation. Results of the test shall be retained and shall include timings of key activities.", "The results of the test, and of any actual withdrawals, shall be used to review the procedure and implement improvements as necessary."], "Compliance", ["Yes, one mock withdrawal exercise record of product withdrawal verified, and complete traceability done."]],
  // Page 14
  ["4 Site standards", [], "", []],
  ["4.1 External standards", ["The site shall be of suitable size and construction, in a suitable location, and maintained to an appropriate standard to reduce the risk of contamination and facilitate the production of safe and legal products."], "", []],
  ["4.1.1", ["Consideration shall be given to local activities and the site environment, which may have an adverse impact on the safety or quality of the finished product or raw materials, and measures shall be taken to prevent contamination. Where measures have been put in place to protect the site, they shall be regularly reviewed to ensure they continue to be effective (e.g. flood controls)."], "Compliance", ["The Plant is Fully covered & no chance of product contamination. PSTL conducting quarterly audit of all PRP (including site standard) for control of internal & external environment."]],
  ["4.1.2", ["The external areas shall be maintained in good order. Any grassed or planted areas surrounding buildings shall be regularly tended and well maintained. External traffic routes under site control shall be suitably surfaced to avoid contamination of the product."], "Compliance", ["Outside area is maintained in good condition & vegetation is maintained away from main plant periphery."]],
  ["4.1.3", ["The building fabric shall be maintained to minimise potential for pest entry, ingress of water and other contaminants. External silos, pipework or other access points for the product and/or raw materials shall be appropriately sealed and secured. Where possible, a cleaned unobstructed area shall be provided along the external walls of the buildings used for production and/or storage."], "Compliance", ["Building fabric found adequately maintained"]],
  ["4.1.4", ["Where natural external drainage is inadequate, additional drainage shall be installed. Drains shall be properly protected to prevent entry of pests."], "Compliance", ["All external drainage is cleaned and covered properly."]],
  ["4.1.5", ["Where external storage of raw materials is necessary, these shall be protected in order to minimise the risk of contamination."], "Compliance", ["No material found stored outside of the plant."]],
  ["4.2 Building fabric and interiors: raw materials handling, preparation, processing, packing and storage areas", ["The internal site, buildings and facilities shall be suitable for the intended purpose and shall be designed, constructed, maintained and monitored to effectively control the risk of product contamination."], "", []],
  // Page 15
  ["4.2.1", ["Walls, floors, ceilings and pipework shall be maintained in good condition and shall facilitate cleaning."], "NC - 01", ["Wall painting peeling and small cracks have been observed near Old plant worker’s entry area"]],
  ["4.2.2", ["Where suspended ceilings exist, they shall be constructed, finished and maintained to prevent the risk of product contamination, and accessible for cleaning and inspection for pests unless the void is fully sealed."], "Compliance", ["No suspended ceilings are there."]],
  ["4.2.3", ["All internal drain openings shall be suitably protected against the entry of pests and designed to minimise odour."], "Compliance", ["Such openings are completely covered and found protected."]],
  ["4.2.4", ["Where they constitute a risk to product, and based on the likelihood and risk of contamination, windows and roof glazing shall be protected against breakage."], "Compliance", ["All such window glasses are found protected as tempered glass were used"]],
  ["4.2.5", ["Where they constitute a risk to product, and based on the likelihood and risk of non- production glass contamination, all bulbs and strip lights, including those on flying-insect control devices, shall be adequately protected."], "Compliance", ["Most of the lightings are LED and all other tube lights are completely covered with cleaned plastic cover."]],
  ["4.2.6", ["Where elevated walkways are adjacent to or pass over production lines, based on risk they shall be:", "• designed to prevent contamination of products and production lines", "• easy to clean", "• correctly maintained."], "Compliance", ["There is elevated walkways design prevent contamination of production lines and easily clean."]],
  ["4.2.7", ["Suitable and sufficient lighting shall be provided to ensure a safe working environment, correct operation of processes, effective inspection of the product and cleaning."], "Compliance", ["Lighting found sufficient and Lux Level are maintained as per standard requirement"]],
  ["4.2.8", ["Suitable and sufficient ventilation shall be provided."], "Compliance", ["Ventilation is provided in each section adequately"]],
  ["4.3 Utilities", ["All utilities to and within the production and storage areas shall be designed, constructed, maintained and monitored to effectively control the risk of product contamination."], "", []],
  ["4.3.1", ["All water used in the processing of the products or equipment cleaning shall be potable or suitably treated to prevent contamination."], "Compliance", ["Water do not use in process or machine cleaning."]],
  // Page 16
  ["4.3.2", ["Based on risk assessment, the microbiological and chemical quality of water, steam, ice, air, compressed air or other gases which come into direct contact with packaging shall be regularly monitored. These shall present no risk to product safety or quality and shall comply with relevant legal regulations."], "Compliance", ["Microbiological test report for Air swab of processing area and Work Zone monitoring being done once in a year.", "Water testing is done as per IS 10500:2012 annually"]],
  ["4.4 Site security and product defence", ["A product defence plan shall be in place to ensure that there are systems to protect products, premises and brands from malicious actions while under the control of the site."], "", []],
  ["4.4.1", ["The company shall undertake a documented risk assessment (threat assessment) of the security arrangements and potential risks to the products from any deliberate attempt to inflict contamination or damage. This threat assessment shall include both internal and external threats.", "The output from this assessment shall be a documented product defence plan.", "Areas shall be assessed according to risk; sensitive or restricted areas shall be defined, clearly marked, monitored and controlled.", "This plan shall be kept under review to reflect changing circumstances and external influences. It shall be formally reviewed at least annually."], "Compliance", ["Product Defence Plan is documented and found ok.", "Site Security Risk assessment is also carried out for the same."]],
  ["4.4.2", ["Measures shall be in place to ensure only authorised personnel have access to production and storage areas, and access to the site by employees, contractors and visitors shall be controlled.", "A visitor reporting system shall be in place. Staff shall be trained in site security procedures and encouraged to report unidentified or unknown visitors."], "Compliance", ["Visitor entry is logged at security."]],
  ["4.4.3", ["External storage tanks, silos and any intake", "pipes with an external opening shall be sufficiently secure to prevent unauthorised access."], "Compliance", ["There are no external storage tanks, silos & any intake pipes in the plant."]],
  // Page 17
  ["4.5 Layout, product flow and segregation", ["The factory layout, flow of processes and movement of personnel shall be sufficient to prevent the risk of product contamination and to comply with all relevant legislation."], "", []],
  ["4.5.1", ["There shall be a current map or plan of the site which defines:", "• access points for personnel", "• travel routes for personnel, raw materials and intermediate or finished products", "• staff facilities", "• routes for the removal of waste", "• production and process flows", "• storage areas."], "Compliance", ["Single Entry/Exit for personnel, verified.", "Plan layout and Section-wise facility floor plan displayed showing all the locations including man-material movement."]],
  ["4.5.2", ["The process flow from intake to dispatch shall be arranged to minimise the risk of contamination or damage to the product."], "Compliance", ["Complied, premises cleaning and compliance with good hygiene practices found effective."]],
  ["4.5.3", ["Premises shall allow sufficient working space and storage capacity to enable all operations to be carried out properly under safe and hygienic conditions."], "Compliance", ["Yes, sufficient working space and storage capacity is provided."]],
  ["4.5.4", ["Sorting or other activities involving the direct handling of the product shall take place in areas that have, as a minimum, the same standards as production areas."], "Compliance", ["Yes, it is having sufficient space for other activities also."]],
  ["4.5.5", ["Activities that could produce a contamination risk, such as the removal of outer packaging, shall be carried out in a designated, segregated area."], "Compliance", ["Such activities are carried out away from processing area and done at designated place in that area."]],
  ["4.5.6", ["If it is necessary to allow access through production areas, designated walkways shall be provided that ensure there is adequate segregation from materials."], "Compliance", ["Yes, it is evident."]],
  ["4.5.7", ["Where possible, all facilities shall be designed and positioned so that movement of personnel is by simple, logical routes."], "Compliance", ["Designed as per requirements, single entry/exit for plant is evident. And as per simple and logical routes."]],
  ["4.6 Equipment", ["Equipment shall be suitably designed for the intended purpose and shall be maintained and used so as to minimise the risk to product safety, legality and quality."], "", []],
  // Page 18
  ["4.6.1", ["Production, storage and warehousing equipment shall be designed for the intended", "purpose and shall minimise the risk of contamination to the product. Lubrication points and application methods of any lubricant shall not be able to contaminate the product.", "Equipment shall be constructed of suitable materials and be designed to ensure it can be effectively cleaned and maintained."], "Compliance", ["Yes, Production, storage and warehousing equipment design is adequate, hygiene is maintained.", "Lubrication points and application method is evident."]],
  ["4.6.2", ["Newly installed equipment shall be properly specified before purchase. New equipment shall be tested and commissioned prior to use and a maintenance and cleaning programme established."], "Compliance", ["New equipment is procured as per the specification considering product safety measures."]],
  ["4.6.3", ["Wooden equipment including desks, chairs, tables, etc. shall be properly sealed to enable effective cleaning. This equipment shall be kept clean, in good condition and free from splinters or other sources of physical contamination."], "Compliance", ["Documented wood control policy. Wood articles identified & monitoring."]],
  ["4.6.4", ["Notices on equipment shall be cleanable and secure."], "Compliance", ["Yes, Notice on Equipment found in clean condition."]],
  ["4.7 Maintenance", ["An effective maintenance programme shall be in operation for plant and equipment to prevent contamination and reduce the potential for breakdowns."], "", []],
  ["4.7.1", ["A documented programme of maintenance shall be operated, covering all items of production equipment and plant critical to product safety, legality and quality, to prevent contamination and reduce the risk of breakdown."], "Compliance", ["A documented PM plan is evident, verified and found ok.", "Checklist for preventive maintenance cum record"]],
  ["4.7.2", ["Maintenance logs shall be maintained for all off-line testing equipment. This shall include, as a minimum:", "• any adjustments", "• the re-calibration date of any interventions."], "Compliance", ["Maintenance log is maintained for instruments; however, instruments are new no as such changes noted till date."]],
  ["4.7.3", ["In addition to any planned maintenance programme, where there is a risk of product contamination by foreign bodies arising from equipment failure or damage, the equipment shall be inspected at predetermined intervals, inspection results documented, and appropriate action taken."], "Compliance", ["Break down maintenance records verified in Machinery Breakdown Register in ERP."]],
  // Page 19
  ["4.7.4", ["Maintenance work shall not place product safety, quality or legality at risk. Maintenance work shall be followed by a documented clearance procedure which records that contamination hazards have been removed and equipment cleared to resume production."], "Compliance", ["Yes, it is documented in procedure. Records of Engineering & Maintenance Hygiene Clearance Record verified."]],
  ["4.7.5", ["Tools and other maintenance equipment shall be cleared away after use and appropriately stored."], "Compliance", ["Tool kit used and cleared after maintenance work. Same is verified in records of preventive & breakdown records."]],
  ["4.7.6", ["Temporary repairs/modifications using tape, cardboard, etc. shall only be permitted in emergencies and where product contamination is not at risk. Such modifications shall be subject to a time limit and shall be recorded and scheduled for correction."], "NC - 02", ["Use of temporary modification using thread and cloth noted in Lamination machine"]],
  ["4.7.7", ["Engineering workshops shall be controlled to prevent transfer of engineering debris to production or storage areas (e.g. by provision of swarf mats)."], "Compliance", ["Engineering workshop is designated separately."]],
  ["4.7.8", ["Contractors involved in maintenance or repair shall be suitably monitored by a staff member who shall be responsible for their activities."], "Compliance", ["Yes, system is in place. One maintenance person accompanies outsourced contractors."]],
  ["4.8 Housekeeping and cleaning", ["Fundamental — Housekeeping and cleaning systems shall be in place which ensure that appropriate standards of hygiene are maintained and that the risk of product contamination is minimised."], "", []],
  ["4.8.1", ["Good standards of housekeeping shall be maintained, which shall include a condition-based cleaning or ‘clean as you go’ policy."], "Compliance", ["Yes, complied as per the requirement."]],
  ["4.8.2", ["Documented cleaning procedures shall be in place and maintained for buildings, equipment and vehicles. Cleaning schedules and procedures shall include the following information:", "• responsibility for cleaning", "• item/area to be cleaned", "• frequency of cleaning", "• method of cleaning", "• cleaning materials to be used", "• cleaning record and responsibility for verification.", "The frequency and methods of cleaning shall be based on risk.", "The procedures shall be implemented to ensure that appropriate standards of cleaning are achieved."], "Compliance", ["Yes, documented procedure for premises cleaning, maintenance and sanitation."]],
  // Page 20
  ["4.8.3", ["Cleaning chemicals shall be fit for purpose, suitably labelled, and used in accordance with manufacturers’ instructions. They shall be stored in a secured, designated location, in closed containers. Chemicals that are strongly scented or could give rise to taint and odour contamination shall not be used.", "Cleaning equipment shall be kept in a suitable designated location."], "Compliance", ["Yes, policy for Chemical Control is in place", "Chemicals that are strongly scented or could give rise to taint and odour contamination is nots used.", "List of chemicals is maintained"]],
  ["4.8.4", ["Materials and equipment used for cleaning toilets shall be differentiated from those used elsewhere, and physically segregated where necessary."], "Compliance", ["Yes, being stored separately away from production area."]],
  ["4.8.5", ["Where appropriate, based on risk, a microbiological environmental monitoring programme shall be in place to ensure that the cleaning operations are effective in minimising the risk of contamination by microorganisms that would be detrimental to the products. The programme shall consider the likelihood of the microorganisms’ survival on packaging materials and their use.", "Where a programme is in place, this shall include:", "• sampling protocol", "• identification of sample locations", "• frequency of tests", "• target organisms (e.g. pathogens, spoilage organisms and/or indicator organisms)", "• test methods", "• recording and evaluation of results.", "The programme and its associated procedures shall be documented."], "Compliance", ["Microbial Testing and Swab Testing Programme is in place"]],
  ["4.9 Product contamination control", ["All practicable steps shall be taken to identify, eliminate, avoid or minimise the risk of foreign-body or chemical contamination."], "", []],
  ["4.9.1 Glass, brittle plastics, ceramics and similar materials control", [], "", []],
  // Page 21
  ["4.9.1.1", ["There shall be no unnecessary non-production glass, ceramics or brittle plastic present, which may pose a foreseeable risk of contamination.", "Where non-production glass, ceramics or brittle plastics are required in production, packing or storage areas, and where there is a risk of product contamination, procedures for their handling shall be in place."], "Compliance", ["Glass & Brittle Plastic Policy is in place.", "Monthly monitoring records verified for glass & brittle materials identified in plant. Procedure for handling is also covered in the same"]],
  ["4.9.1.2", ["Glass or brittle plastics (other than the product) that pose a potential product contamination hazard shall be controlled and recorded on a register that includes, as a minimum:", "• a list of items detailing location, number, type and condition", "• recorded checks of condition of items, carried out at a specified frequency that is based on the level of risk to the product", "• details on cleaning or replacing items to minimize the potential for product contamination.", "Glass or brittle plastics not in the production or storage areas shall be included in the register on the basis of risk."], "Compliance", ["Monthly monitoring records verified for glass & brittle materials identified in plant. All such brittle & glass materials in plant are marked with their unique identification no.", "Tempered glass is used in the plant."]],
  ["4.9.1.3", ["Where non-production glass or brittle plastic breakage occurs, a responsible person shall be placed in charge of the clean-up operation and shall ensure that no other area is allowed to become contaminated due to the breakage. Any product that has become contaminated shall be segregated and disposed of.", "All breakages shall be recorded in an incident report."], "Compliance", ["No incident took place till date for glass and brittle plastic."]],
  ["4.9.2 Sharps and metal control", [], "", []],
  ["4.9.2.1", ["There shall be a documented policy for the controlled use and storage of sharp implements, including knives, needles and wires, to prevent contamination.", "The policy shall include control of these items into and out of the site."], "Compliance", ["Policy for sharp Metal Control is in place."]],
  ["4.9.2.2", ["Production equipment that incorporates blades or sharps shall be monitored. Blades or other sharp implements shall not be allowed to contaminate the product."], "Compliance", ["Loose blades and doctor blade are monitored."]],
  // Page 22
  // The text layer reads "Compliance." here, but its full stop is printed in white and
  // cannot be seen: the page shows "Compliance", and the picture wins.
  ["4.9.2.3", ["Snap-off blade knives shall not be used."], "Compliance", ["Snap-off blade knives not be used."]],
  ["4.9.2.4", ["Where open noticeboards are present in production, packing and storage areas, loose fastenings, such as drawing pins and staples, shall not be used."], "Compliance", ["No Open Noticeboard observed"]],
  ["4.9.3 Chemical and biological control", [], "", []],
  ["4.9.3.1", ["Processes shall be in place to manage the use, storage and handling of non-production chemicals, to prevent chemical contamination. These shall include, as a minimum:", "• a list of approved chemicals for purchase", "• availability of material safety data sheets and specifications", "• avoidance of strongly scented products", "• the labelling and/or identification of containers of chemicals at all times", "• designated storage area with access restricted to authorized personnel", "• use by trained personnel only."], "Compliance", ["Policy for Chemical Control", "MSDS is in place covered all stated requirement", "Stored under lock & key. MSDS available for all chemicals."]],
  ["4.9.3.2", ["Hazard and risk analysis shall be used to identify, control and manage any potential risks from microbiological contamination and any potential allergens."], "Compliance", ["Allergen risk assessment is in place. And also, risk associated from microbiological contamination is assessed in HARA. There is no risk regarding microbiological contamination as all the chemicals are solvents & detergents."]],
  ["4.10 Waste and waste disposal", ["Waste disposal shall be managed in accordance with legal requirements and to prevent accumulation, risk of contamination and the attraction of pests."], "", []],
  ["4.10.1", ["Where licensing is required by law for the removal of waste, it shall be removed by licensed contractors and records of removal shall be maintained and available for audit."], "Compliance", ["Contract agreement is in place for waste management.", "Waste removal record is evident."]],
  ["4.10.2", ["Process waste shall be managed to minimise release to the environment. This shall include, but is not limited to, pellet, flake, powder, dust and offcuts."], "Compliance", ["No as such process waste which can contaminate the product.", "No pellets, flakes, dust and offcuts are produced during any process."]],
  // Page 23
  ["4.10.3", ["Suitable and sufficient refuse and waste containers shall be provided, which shall be emptied at appropriate frequencies and maintained in an adequately clean condition."], "Compliance", ["Yes, Waste bins are provided area wise and being emptied on regular interval."]],
  ["4.10.4", ["Where appropriate, waste shall be categorised according to legislative requirements based on the intended means of disposal (such as recycling), and sorted, segregated and collected in appropriate designated waste containers."], "Compliance", ["Yes, Wastes are being segregated and disposed separately."]],
  ["4.10.5", ["Substandard trademarked materials shall be rendered unusable through a destructive process. All materials disposed of shall be recorded."], "Compliance", ["Such material is shredded & then given to concerned"]],
  ["4.10.6", ["If substandard trademarked materials are transferred to a third party for destruction or disposal, that third party shall be a specialist in appropriate waste disposal and shall provide records of material destruction."], "Compliance", ["Such material is shredded & then given to concerned"]],
  ["4.10.7", ["External storage of refuse shall be in designated areas and designed or maintained to minimise the risk of pest harbourage."], "Compliance", ["Designated place is provided, and cleaning is done routinely."]],
  ["4.11 Pest management", ["In order to minimise the risk of infestation and risk to products, the whole site shall have an effective preventive pest management programme in place and the resources available to respond immediately to any issues which occur."], "", []],
  ["4.11.1", ["A preventive pest management programme shall be maintained, covering all areas of the site under the site’s control.", "The site shall assess the suitability of its pest management programme to address variation in pest activity through different seasons, and consider any additional preventive activity required.", "The site shall document and implement any required additional activity."], "Compliance", ["Pest Management Plan is documented by service provider.", "Daily service is provided by pest management service provider", "Addition activity is documented as call out service"]],
  ["4.11.2", ["The site shall either contract the services of a competent pest management organisation or have appropriately trained staff for the regular inspection and treatment of the site in order to deter and eradicate infestation. The frequency of inspections shall be determined by risk assessment and documented. The risk assessment shall be reviewed whenever:", "• there are changes to the building or production processes which could have an impact on the pest management programme", "• there has been a significant pest issue.", "Where the services of a pest management contractor are employed, the service contract shall be clearly defined and reflect the activities of the site."], "Compliance", ["Contractual agreement is in place with external pest control service provider", "Training record is evident for pest control personnel"]],
  // Page 24
  ["4.11.3", ["Where a site undertakes its own pest management, it shall be able to demonstrate that:", "• pest management operations are undertaken by trained and competent staff with sufficient knowledge to select appropriate pest control chemicals and proofing methods and understand the limitations of use, relevant to the biology of the pests associated with the site", "• staff undertaking pest management activities meet any legal requirements for training or registration", "• sufficient resources are available to respond to any infestation issues", "• there is ready access to specialist technical knowledge when required", "• legislation governing the use of pest control products is understood and complied with", "• dedicated locked facilities are used for the storage of pesticides."], "Compliance", ["Contractual agreement is in place with external pest control service provider", "Training certificates of P external pest control service provider’s technicians evident.", "Medical Fitness Certificates of technicians verified.", "Locked rodents’ boxes are placed.", "No onsite storage of Pesticide and other chemicals at site"]],
  ["4.11.4", ["Equipment such as bait stations, traps or electric fly-killing devices shall be appropriately located and operational."], "Compliance", ["Yes, Bait stations, traps and insectoqutor are installed at identified locations."]],
  ["4.11.5", ["Effective precautions shall be in place to prevent pests entering the premises. The building shall be suitably proofed against the entry of all pests via doors, windows, ducts and cable entry points.", "This shall include measures to prevent birds and flying mammals from entering buildings or roosting above loading or unloading areas."], "Compliance", ["Trend analysis records verified. Done on monthly basis"]],
  ["4.11.6", ["In the event of infestation, immediate action shall be taken to eliminate the hazard. Action shall be taken to identify, evaluate the potential for contamination or damage, and authorise the release of any product potentially affected."], "Compliance", ["External pest control service provider Technician take the action against the cause.", "No incident took place till date"]],
  // Page 25
  ["4.11.7", ["In the event of an infestation, and at appropriate intervals, the site shall request a catch analysis from flying-insect control devices to help identify problem areas.", "In the event of increase in activity, the site shall use risk assessment to determine the activity required to eliminate the hazard."], "Compliance", ["Risk assessment related to pest activity is assessed", "Trend analysis is carried out & overall trend improvement"]],
  ["4.11.8", ["Documented procedures and detailed records of pest activity, pest management inspections and recommendations shall be maintained. These shall include, as a minimum:", "• an up-to-date, signed and authorised site plan identifying numbered pest control devices and their locations", "• identification of the baits and/or monitoring devices on site", "• clearly defined responsibilities for the site management and the contractor", "• details of pest control products used and instructions for their effective use", "• detailed records of inspections, recommendations and of any pest infestation.", "It shall be the responsibility of the site to ensure that all the relevant recommendations made by the contractor or in-house expert are implemented in a timely manner and monitored for efficacy."], "Compliance", ["Yes, updated Bait plan is in place.", "IDENTIFICATION is in place.", "Verified and found ok"]],
  ["4.11.9", ["Employees shall understand the signs of pest activity and be aware of the need to report any evidence to a designated manager."], "Compliance", ["Training imparted to entire workforce on Pest Management from outside agency verified."]],
];

/** The checklist as the grid holds it: a cell's paragraphs and bullets one per line. */
export const AUDIT_CHECKLIST_2025_02: Record<string, string>[] = AUDIT_CHECKLIST_LINES.map(([clause, requirements, compliance, comments]) => ({
  clause,
  requirements: requirements.join("\n"),
  compliance,
  comments: comments.join("\n"),
}));

/** Page 1's table, line by line: Function, Audit Date, Audit Time, Auditors. */
export const AUDIT_FINDINGS_2025_02_PLAN: Record<string, string> = {
  function1: "PRODUCT SAFETY & QUALITY MANAGEMENT",
  auditDate1: "2025-02-17",
  auditTime1: "10:00 am to 2:00 pm",
  auditors1: "Mr. Shashank Sheth",
  function2: "SITE STANDARDS",
  auditDate2: "2025-02-17",
  auditTime2: "14:30 pm to 17:30 pm",
  auditors2: "Ms. Kapila Barad",
};

// Where each page of the report begins and ends.
const AUDIT_FINDINGS_PAGES: [pageNo: number, from: string, to: string][] = [
  [2, "3", "3.2.2"],
  [3, "3.2.2", "3.4.2"],
  [4, "3.4.3", "3.5.1"],
  [5, "3.5.1", "3.6"],
  [6, "3.6.1", "3.7.2"],
  [7, "3.7.2", "3.7.5"],
  [8, "3.7.5", "3.8.2"],
  [9, "3.8.2", "3.9.5"],
  [10, "3.10", "3.11.1"],
  [11, "3.11.1", "3.12.2"],
  [12, "3.12.2", "3.13.4"],
  [13, "3.13.4", "3.13.7"],
  [14, "4", "4.2"],
  [15, "4.2.1", "4.3.1"],
  [16, "4.3.1", "4.4.3"],
  [17, "4.5", "4.6"],
  [18, "4.6.1", "4.7.3"],
  [19, "4.7.3", "4.8.2"],
  [20, "4.8.2", "4.9.1"],
  [21, "4.9.1.1", "4.9.2.2"],
  [22, "4.9.2.3", "4.10.2"],
  [23, "4.10.2", "4.11.2"],
  [24, "4.11.2", "4.11.6"],
  [25, "4.11.6", "4.11.9"],
];

const AUDIT_FINDINGS: LogSheetLayout = {
  documentId: "sys-audit-findings",
  instructions: ["BRCGS Packaging Materials – ISSUE 6", "Audit Checklist & Compliance Report"],
  // Page 1's table: two lines of Function / Audit Date / Audit Time / Auditors
  // (its Sr. No. is the line number). The first line's date is the record's.
  headerFields: [1, 2].flatMap((n): LogHeaderField[] => [
    { key: `function${n}`, label: `Line ${n} — Function`, type: "text", autoFill: { carryForward: true } },
    n === 1
      ? { key: "auditDate1", label: "Line 1 — Audit Date", type: "date", required: true, autoFill: { dueDate: true } }
      : { key: "auditDate2", label: "Line 2 — Audit Date", type: "date" },
    { key: `auditTime${n}`, label: `Line ${n} — Audit Time`, type: "text" },
    { key: `auditors${n}`, label: `Line ${n} — Auditors`, type: "text", autoFill: { carryForward: true } },
  ]),
  // The clause and its requirement are the standard's and repeat; whether it
  // complied and what was seen are this audit's alone, never carried forward.
  columns: [
    { key: "clause", label: "Clause", type: "text", width: 160, autoFill: { carryForward: true } },
    { key: "requirements", label: "Requirements", type: "text", width: 460, multiline: true, autoFill: { carryForward: true } },
    { key: "compliance", label: "Compliance/Non compliance (Sample Audited under 3.8, 3.9 and 4.9.1)", type: "text", width: 170, autoFill: { fresh: true } },
    { key: "comments", label: "Comments / Outcome", type: "text", width: 320, multiline: true, autoFill: { fresh: true } },
  ],
  rowMode: { kind: "free", minRows: 1, typicalRows: 200 },
  specimenHeader: {
    function1: AUDIT_FINDINGS_2025_02_PLAN.function1,
    auditors1: AUDIT_FINDINGS_2025_02_PLAN.auditors1,
    function2: AUDIT_FINDINGS_2025_02_PLAN.function2,
    auditors2: AUDIT_FINDINGS_2025_02_PLAN.auditors2,
  },
  specimenRows: AUDIT_CHECKLIST_2025_02.map(({ clause, requirements }) => ({ clause, requirements })),
  originalPages: [
    page("fsys08-audit-report-2025-02-p1.jpg", "F/SYS/08 (Rev No: 01, 01.03.2023) — the audit of 17.02.2025, page 1 of 25: the functions audited, as supplied"),
    ...AUDIT_FINDINGS_PAGES.map(([n, from, to]) =>
      page(`fsys08-audit-report-2025-02-p${n}.jpg`, `F/SYS/08 — the audit of 17.02.2025, page ${n} of 25 (${from} to ${to}), as supplied`)
    ),
  ],
  specimenSource:
    "F-SYS-08 Audit Checklist Compliance Report.pdf — F/SYS/08 (Rev No: 01, Date: 01.03.2023), the plant's own audit of 17.02.2025 against BRCGS Packaging Materials Issue 6, 25 pages; its clauses and requirements are the specimen",
};

// ===========================================================================
// F/SYS/10 — BRCGS PACKAGING (ISSUE 06) - INTERNAL AUDIT NC REPORT
// F/SYS/11 — NON-CONFORMANCE & CORRECTIVE ACTION REPORT (CAR)
// ===========================================================================

const OBJECTIVE_EVIDENCE = "Objective Evidence(s), if any";
const NC_FINDING = "NC FINDING STATEMENT (Mention details of detected / potential problem)";
const ROOT_CAUSE = "ROOT CAUSE(S) (Carryout a Root Cause Analysis in terms of WHY attributing to as follows,";
const CAR_CLOSING = "CAR CLOSING VERIFICATION";
/** The form's two check boxes, one of which is ticked. */
const NC_OR_OBSERVATION = ["Non-Conformance", "Observation"];

// Everything below the finding — the root cause, the action, the follow-up and
// the closing verification — is written as it happens, so none of it is ever
// pre-filled: a new report carrying "Satisfactory" or "Closed" would say the
// CAR was verified before anybody verified it (purchaseLayouts.ts, F/PUR/02).

const AUDIT_NC: LogSheetLayout = {
  documentId: "sys-audit-nc",
  headerFields: [
    { key: "reportNo", label: "Report No.", type: "text" },
    { key: "reportDate", label: "Report Date", type: "date", required: true, autoFill: { dueDate: true } },
    { key: "auditorName", label: "Auditor’s Name", type: "text", autoFill: { carryForward: true } },
    { key: "deptAreaFunction", label: "Dept. / Area / Function", type: "text" },
    { key: "ncType", label: "Non-Conformance / Observation", type: "select", options: NC_OR_OBSERVATION },
    { key: "ncFindingStatement", label: NC_FINDING, type: "paragraph" },
    { key: "referenceRecords", label: `${OBJECTIVE_EVIDENCE} — Reference Record(s)`, type: "text" },
    { key: "procedureFlowChart", label: `${OBJECTIVE_EVIDENCE} — Procedure / Flow Chart No.`, type: "text" },
    { key: "clauseNo", label: `${OBJECTIVE_EVIDENCE} — Clause No.`, type: "text" },
    { key: "auditorSign", label: "Auditor’s Sign.", type: "text", autoFill: { sign: true } },
    { key: "auditeeSign", label: "Auditee’s Sign.:", type: "text" },
    { key: "plannedClosingDate", label: "Planned Closing Date", type: "date" },
  ],
  columns: [],
  rowMode: { kind: "single" },
  footerFields: [
    { key: "rootCause", label: ROOT_CAUSE, type: "paragraph" },
    { key: "rootCauseAuditeeSign", label: "ROOT CAUSE(S) — Auditee’s Sign.", type: "text" },
    { key: "rootCauseAuditorSign", label: "ROOT CAUSE(S) — Auditor’s Sign for acceptance", type: "text" },
    {
      key: "correctiveAction",
      label:
        "CORRECTION & CORRECTIVE ACTION (Action Taken to Prevent Recurrence) (Mention in detail the actions taken to prevent the recurrence of this detected problem based on the Root Cause Analysis carried out above. Please mention here only those actions which have been taken and found effective after implementing",
      type: "paragraph",
    },
    { key: "correctiveActionAuditeeSign", label: "CORRECTION & CORRECTIVE ACTION — Auditee’s Sign.: -", type: "text" },
    { key: "correctiveActionDate", label: "CORRECTION & CORRECTIVE ACTION — Date:", type: "date" },
    { key: "followUp", label: "Follow–up audit: (Verification and effectiveness of action taken)", type: "paragraph" },
    // Before the Date / Verified By / Sign. of the same block — see the header of this file.
    { key: "actionsFound", label: "Actions Found", type: "select", options: ["Satisfactory", "Unsatisfactory"] },
    { key: "carStatus", label: "CAR", type: "select", options: ["Closed", "Not Closed"] },
    { key: "carClosingDate", label: `${CAR_CLOSING} — Date: -`, type: "date" },
    { key: "carVerifiedBy", label: `${CAR_CLOSING} — Verified By: -`, type: "text" },
    { key: "carSign", label: `${CAR_CLOSING} — Sign.: -`, type: "text" },
  ],
  specimenHeader: { auditorName: "Kapila barad" },
  originalPages: [page("fsys10-audit-nc-feb-25-02-p1.jpg", "F/SYS/10 (Rev No: 01, Date: 01.05.2013 as printed) — NC report Feb -25/02 of 17.02.2025, clause 4.7.6, as supplied")],
  specimenSource:
    "F-SYS-10.pdf — F/SYS/10 (Rev No: 01, Date: 01.05.2013 as printed; the master list gives 01.03.23), the plant's own NC report Feb -25/02 of 17.02.2025; its auditor is the specimen",
};

const NC_CAR_SPECIMEN_NOTE =
  'F-SYS-11-Non Confirmance & Corrective Action Report.pdf — F/SYS/11 (Rev No: 00, Date: 01.12.2021; its "Format No.:" box is empty), the blank format, supplied 25-Sep-2026. Nothing about a real non-conformance came with it, so the specimen is a plainly made-up "Sample observer".';

const NC_CAR: LogSheetLayout = {
  documentId: "sys-nc-car",
  headerFields: [
    { key: "reportNo", label: "Report No.", type: "text" },
    { key: "reportDate", label: "Report Date", type: "date", required: true, autoFill: { dueDate: true } },
    { key: "observerName", label: "Observer’s Name", type: "text", autoFill: { carryForward: true } },
    { key: "deptAreaFunction", label: "Dept. / Area / Function", type: "text" },
    { key: "ncType", label: "Non-Conformance / Observation", type: "select", options: NC_OR_OBSERVATION },
    { key: "ncFindingStatement", label: NC_FINDING, type: "paragraph" },
    // This form prints no Clause No. line.
    { key: "referenceRecords", label: `${OBJECTIVE_EVIDENCE} — Reference Record(s)`, type: "text" },
    { key: "procedureFlowChart", label: `${OBJECTIVE_EVIDENCE} — Procedure / Flow Chart No.`, type: "text" },
    { key: "observerSign", label: "Observer / Auditor’s Sign.", type: "text", autoFill: { sign: true } },
    { key: "auditeeSign", label: "Auditee’s / Consignee Sign.", type: "text" },
    { key: "plannedClosingDate", label: "Planned Closing Date", type: "date" },
  ],
  columns: [],
  rowMode: { kind: "single" },
  footerFields: [
    // The note printed between the two halves of the form, then the box it introduces.
    {
      key: "rootCause",
      label: `Note : The following Root Cause Analysis shall be done by the Auditee for the Detected Non-Conformance only. ${ROOT_CAUSE}`,
      type: "paragraph",
    },
    { key: "correctionDone", label: "CORRECTION DONE (Mention in detail the action taken to correct the detected problem)", type: "paragraph" },
    {
      key: "correctiveAction",
      label:
        "CORRECTIVE ACTION (Action Taken to Prevent Recurrence) (Mention in detail the actions taken to prevent the recurrence of this detected problem based on the Root Cause Analysis carried out above in each applicable ‘M’. Please mention here only those actions which have been taken and found effective after implementing)",
      type: "paragraph",
    },
    { key: "correctiveActionAuditeeSign", label: "CORRECTIVE ACTION — Auditee’s / Consignee Sign.", type: "text" },
    { key: "correctiveActionDate", label: "CORRECTIVE ACTION — Date", type: "date" },
    // As on F/SYS/10: the two choices before the Date / Verified By / Sign. of their block.
    { key: "actionsFound", label: "Actions Found", type: "select", options: ["Satisfactory", "Unsatisfactory"] },
    { key: "cparStatus", label: "CPAR", type: "select", options: ["Closed", "Not Closed"] },
    { key: "carClosingDate", label: `${CAR_CLOSING} — Date`, type: "date" },
    { key: "carVerifiedBy", label: `${CAR_CLOSING} — Verified By`, type: "text" },
    { key: "carSign", label: `${CAR_CLOSING} — Sign.`, type: "text" },
    { key: "plannedFollowUpDate", label: "Planned Follow-up Date in case of Unsatisfactory Actions / Non-Closure", type: "date" },
    { key: "reverificationSign", label: "Sign. & Date of Re-verification & Satisfactory Closure", type: "text" },
  ],
  // What can be known before a non-conformance is found: who observes. Sample data.
  specimenHeader: { observerName: "Sample observer" },
  originalPages: [page("fsys11-nc-car-p1.jpg", "F/SYS/11 (Rev No: 00, 01.12.2021) — the Non-Conformance & Corrective Action Report (CAR), supplied blank")],
  specimenSource: NC_CAR_SPECIMEN_NOTE,
};

export const SYS_INTERNAL_AUDIT_LAYOUTS: Record<string, LogSheetLayout> = {
  [AUDIT_SCHEDULE.documentId]: AUDIT_SCHEDULE,
  [AUDIT_PLAN.documentId]: AUDIT_PLAN,
  [AUDIT_RISK.documentId]: AUDIT_RISK,
  [AUDIT_FINDINGS.documentId]: AUDIT_FINDINGS,
  [AUDIT_NC.documentId]: AUDIT_NC,
  [NC_CAR.documentId]: NC_CAR,
};
