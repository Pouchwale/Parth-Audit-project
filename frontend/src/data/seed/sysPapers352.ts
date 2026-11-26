// F/SYS/03, 05, 07, 08, 10 AND 11 DRAWN AS THE COMPANY'S OWN PAPERS (REQUIREMENTS §352; the owner, 24-Nov-2026: "same format
// present in my system which is present in google drive ... whenever user download any document of any module or take a
// print on A4 size paper, that should be very perfect"). Each is measured in mm off the PDF of the owner's own file (scratchpad
// geo.py, pymupdf: every rule and every word), and keeps the record's boxes and grid exactly as they were, so every record on
// file reads on unchanged. Every printed word is the record's to type over (ownWords, as the HR papers, §275); no colour (§282).
//
//   F/SYS/03  Document Change Request & Approval Note: the Word format in his Drive ("BRCGS 25-26/Formats", the same file as
//             source-documents/originals-pdf/sys-document-change.pdf): double page border, the three-line head, the three tick
//             boxes, the ruled boxes, the dotted rule between the requester's half and the PSTL's.
//   F/SYS/05  Yearly Internal Audit Schedule: the plant's Rev 01 page (01.03.2023), F-SYS-05-Internal_Audit_Schedule _2024.pdf
//             (his Drive: BRC-25/SYS/iqascheduleriskassessmentprint, the 2024 and 2025 schedules) - the revision DCRS keeps. The
//             Drive's "Formats" folder still holds the Rev 00 sheet ("Internal Audit Schedule ( YEAR - XXXX )", 15 activities);
//             that is the owner's to choose (REQUIREMENTS §352).
//   F/SYS/07  Internal Audit Risk Assessment: the Rev 01 sheet of 2024, "Copy of F-SYS-07-Internal Audit Risk assessment(R-2024)
//             .pdf" (his Drive: the same zip, F-SYS-07-...(R-2024).xlsx): the clause list with each section's figures in one
//             merged cell, the criteria, the SECTION table and "Irrespective of ..." beside it, the number line at the foot. His
//             sheet prints on one page at 5 pt: here on two, page 2 from section 5 under the head again, its letters made
//             readable by engine/paperReadable.ts (§282).
//   F/SYS/08  Internal Audit Findings / Observation Report: the Rev 01 report of the audit of 17.02.2025 (his Drive: BRC-25/SYS/
//             New folder/feb2025/F-SYS-08 Audit Checklist Compliance Report.docx): page 1 with the functions audited, then the
//             checklist, the head on every page, the company at the page's foot.
//   F/SYS/10  Internal Audit NC Report and
//   F/SYS/11  Non-Conformance & Corrective Action Report (CAR): the Word formats in his Drive's "Formats" folder (the files of
//             source-documents/originals-pdf/sys-audit-nc.pdf and sys-nc-car.pdf), every box ruled as printed; F/SYS/11's four
//             dashed cut lines across the page.
//
// His Word formats of F/SYS/03, 10 and 11 leave "Format No.:" empty (F/SYS/08's report writes "F / SYS / 08"): each prints the
// master list's number there, as his filled reports do. What the paper model had no way to say, kept to these papers alone
// (styles.css, the §352 block): a cell whose edges carry "o" rules its foot dotted and "d" dashed, one whose edges carry "i"
// prints its words in italics (the Notes, "(Action Taken to Prevent Recurrence)"), and a box growing to its words keeps Word's
// cell margin at its right. The double lines Word draws round F/SYS/10's and 11's boxes are drawn single, the grey shading and
// F/SYS/08's blue bands not at all.

import type { PaperCell, PaperPick, PaperRow, PaperTable } from "./qcPaperTables";
import { AUDIT_RISK_CLAUSES, AUDIT_SCHEDULE_DEPARTMENTS, AUDIT_SCHEDULE_MONTH_KEYS, auditScheduleKey } from "./sysInternalAuditLayouts";

const COMPANY = "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED";

/** A strip with no rules, `h` mm tall, across the paper. */
const gap = (h: number, w: number): PaperRow => ({ h, cells: [{ w, t: "", edges: "" }] });
/** A blank with no rules beside the paper's tables. */
const pad = (w: number): PaperCell => ({ w, t: "", edges: "" });
/** A cell the row above runs down over (its rs). */
const under = (w: number): PaperCell => ({ w, t: "", skip: true });
/** A tick box with the paper's words after it. */
const tick = (box: string, value: string): PaperPick => ({ box, value, word: value, mark: "check" });
/** One of the words the paper prints to ring (Yes / No, Satisfactory / Unsatisfactory). */
const ring = (box: string, value: string): PaperPick => ({ box, value, word: value, mark: "ring" });

// --------------------------------------------------------------------------------------------------------------------
// F/SYS/03 DOCUMENT CHANGE REQUEST & APPROVAL NOTE: 12.32 mm to 197.02 mm across, the head 12.95 mm down; one A4 page.
// --------------------------------------------------------------------------------------------------------------------

const DC_W = 184.7;
/** The head stands 4.23 mm in from the tables under it, each side. */
const DC_IN = 4.23;
const DC_HEAD = 176.24;
const dcHead = (h: number, cells: PaperCell[]): PaperRow => ({ h, cells: [pad(DC_IN), ...cells, pad(DC_W - DC_IN - DC_HEAD)] });
/** The tables ruled 191.81 mm wide leave 5.21 mm of the paper blank at their right. */
const DC_BOX = 179.49;

/** A box with its heading over it ("Description of change"): the heading's row, then the box. */
const headedBox = (heading: string, headH: number, box: string, boxH: number): PaperRow[] => [
  { h: headH, cells: [{ w: DC_BOX, t: heading, b: true, u: true, x: 1.9, y: 1.26, edges: "ltr" }, pad(DC_W - DC_BOX)] },
  { h: boxH, cells: [{ w: DC_BOX, box, x: 1.9, y: 0.6, lines: true, grow: true, edges: "lrb" }, pad(DC_W - DC_BOX)] },
];

const DOCUMENT_CHANGE_PAPER: PaperTable = {
  page: "portrait",
  left: 12.32,
  top: 12.95,
  font: "calibri",
  pt: 11.04,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  // The page's double border: 8.47 mm to 201.63 mm across, 8.47 mm to 288.50 mm down.
  pageFrame: { l: 3.85, t: 4.48, w: 193.16, h: 280.03, double: true },
  head: [
    dcHead(11.69, [{ w: DC_HEAD, t: COMPANY, a: "c", pt: 12.96, y: 4.55 }]),
    dcHead(11.52, [{ w: DC_HEAD, t: "DOCUMENT CHANGE REQUEST & APPROVAL NOTE", a: "c", pt: 12.96, y: 4.38 }]),
    // (his Word format leaves its Format No. blank: the number written in is the master list's, as on his filled reports)
    dcHead(7.11, [
      { w: 52.39, t: "Format No.: F/SYS/03", pt: 9.96, x: 1.61, y: 2.48 },
      { w: 39.71, t: "Rev No: 01", a: "c", pt: 9.96, y: 2.48 },
      { w: 41.29, t: "Date: 01.12.2021", a: "c", pt: 9.96, y: 2.31 },
      { w: 42.85, t: "Page No. : 1 Of 1", pt: 9.96, x: 1.61, y: 2.31 },
    ]),
  ],
  body: [
    gap(2.73, DC_W),
    { h: 7.0, cells: [{ w: DC_W, t: "DOCUMENT CHANGE / INTRODUCTION / REMOVAL REQUEST NOTE", b: true, u: true, a: "c", pt: 9.96, y: 2.71, edges: "" }] },
    // "This is a request for" and its three tick boxes, one under the other (the request is one of the three).
    {
      h: 18.0,
      cells: [
        {
          w: DC_W,
          t: "This is a request for",
          x: 1.9,
          y: 4.4,
          edges: "",
          over: ["Existing Document Change", "New Document Introduction", "Existing Document Removal"].map((v, i) => ({ x: 40.39, y: 3.61 + 4.7 * i, w: 62, h: 3.93, pick: [tick("requestType", v)] })),
        },
      ],
    },
    { h: 7.0, cells: [{ w: DC_W, t: "Date of Change request:", b: true, x: 1.9, y: 2.7, edges: "", over: [{ box: "dateOfChangeRequest", x: 42.5, y: 1.2, w: 54.3, h: 4.6, rule: 54.3 }] }] },
    gap(1.47, DC_W),
    // The current document: "Current document no." bold, "(Not Applicable for New Document Introduction)" small and italic under it.
    {
      h: 6.13,
      cells: [
        { w: 40.6, t: "Current document no. (", bs: [0, 20], x: 1.9, y: 3.38, edges: "lt" },
        { w: 6.1, t: "Not", pt: 9, x: 0, y: 3.85, edges: "tri" },
        { w: 35.44, box: "currentDocumentNo", rs: 2, x: 1.9, vm: true },
        { w: 24.18, t: "Current\nRevision no.", b: true, x: 1.9, y: 3.38, lh: 4.74, rs: 2 },
        { w: 19.86, box: "currentRevisionNo", rs: 2, x: 1.9, vm: true },
        { w: 25.79, t: "Current Date", b: true, x: 1.9, y: 3.38, rs: 2 },
        { w: 30.02, box: "currentDate", rs: 2, x: 1.9, vm: true },
        { ...pad(2.71), rs: 2 },
      ],
    },
    {
      h: 10.81,
      cells: [{ w: 46.7, t: "Applicable for New Document\nIntroduction)", pt: 9, x: 1.9, y: 1.82, lh: 3.9, edges: "lrbi" }, under(35.44), under(24.18), under(19.86), under(25.79), under(30.02), under(2.71)],
    },
    gap(4.19, DC_W),
    { h: 7.28, cells: [{ w: 41.92, t: "Document Title", b: true, x: 1.9, y: 1.26 }, { w: 137.57, box: "documentTitle", x: 1.9 }, pad(DC_W - DC_BOX)] },
    {
      h: 7.33,
      cells: [
        { w: 29.89, t: "Document no.", x: 1.9, y: 1.3 },
        { w: 29.94, box: "documentNo", x: 1.9 },
        { w: 29.89, t: "Revision no.", x: 1.91, y: 1.3 },
        { w: 29.94, box: "revisionNo", x: 1.9 },
        { w: 29.9, t: "Effective date", x: 1.9, y: 1.3 },
        { w: 29.93, box: "effectiveDate", x: 1.9 },
        pad(DC_W - DC_BOX),
      ],
    },
    gap(4.19, DC_W),
    ...headedBox("Description of change", 5.5, "descriptionOfChange", 34.98),
    gap(4.23, DC_W),
    ...headedBox("Reason for the Change / Introduction / Removal of Document", 5.49, "reasonForChange", 23.09),
    gap(4.24, DC_W),
    {
      h: 9.65,
      cells: [
        { w: 37.01, t: "Change requested\nby", b: true, x: 1.9, y: 1.26, lh: 4.74 },
        { w: 13.43, t: "Name", x: 1.9, y: 1.26 },
        { w: 32.08, box: "requestedByName", x: 1.9 },
        { w: 24.69, t: "Designation", x: 1.91, y: 1.26 },
        { w: 25.83, box: "requestedByDesignation", x: 1.9 },
        { w: 25.83, t: "Sign", x: 1.91, y: 1.26 },
        { w: 25.83, box: "requestedBySign", x: 1.9 },
      ],
    },
    // The dotted rule across the page between the requester's half and the PSTL's (12.86 mm to 187.48 mm).
    { h: 7.91, cells: [pad(0.54), { w: 174.62, t: "", edges: "bo" }, pad(9.54)] },
    {
      h: 8.85,
      cells: [
        { w: 103.53, t: "Change request verified by (Sign.)", b: true, x: 1.9, y: 2.83, edges: "", over: [{ box: "verifiedBy", x: 65.42, y: 1.29, w: 38.11, h: 4.6, rule: 38.11 }] },
        { w: 81.17, t: "(PSTL)", x: 0, y: 2.83, edges: "" },
      ],
    },
    ...headedBox("Product safety team leader’s comments if any", 5.46, "pstlComments", 18.42),
    {
      h: 6.28,
      cells: [
        { w: 103.53, t: "Change / Introduction / Removal request approved", x: 1.9, y: 1.27, edges: "" },
        { w: 81.17, x: 0, y: 1.27, edges: "", pick: [ring("requestApproved", "Yes"), ring("requestApproved", "No")] },
      ],
    },
    gap(4.1, DC_W),
    { h: 7.4, cells: [{ w: DC_W, t: "Date of approval & implementation:", b: true, x: 1.9, y: 2.7, edges: "", over: [{ box: "dateOfApproval", x: 65.42, y: 1.16, w: 38.11, h: 4.6, rule: 38.11 }] }] },
  ],
  foot: [],
};

// --------------------------------------------------------------------------------------------------------------------
// F/SYS/05 YEARLY INTERNAL AUDIT SCHEDULE, Rev 01: landscape, 11.51 mm to 282.24 mm across, the head 12.95 mm down.
// --------------------------------------------------------------------------------------------------------------------

const AS_W = 270.73;
/** The head stands 2.12 mm in from the schedule's left (13.63 mm), to the paper's right edge. */
const AS_IN = 2.12;
const AS_HEAD = AS_W - AS_IN;
/** The tables end at 281.43 mm, 0.81 mm short of the head's right edge. */
const AS_OUT = 0.81;
/** The heading table's columns: SN | DEPARTMENT | (Plan / Actual) | JAN ... DEC (11.51, 21.04, 68.67 ... 281.43 mm). */
const AS_HEADING = [9.53, 47.63, 19.06, 16.13, 16.13, 16.13, 16.18, 16.59, 15.67, 16.14, 16.17, 13.75, 18.51, 16.13, 16.17];
/** The schedule's own table (its month columns stand a little apart from the heading's: Word's two tables). */
const AS_BODY = [9.66, 47.5, 19.06, 16.13, 17.32, 17.49, 13.63, 16.59, 15.67, 19.14, 13.17, 13.75, 18.51, 16.13, 16.17];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
/** Each department's two lines, Plan and Actual (64.07 mm to 124.19 mm down). */
const AS_LINES = [4.99, 5.04, 5.0, 4.99, 5.04, 4.99, 5.0, 5.04, 5.0, 5.0, 5.03, 5.0];

const scheduleRows: PaperRow[] = AUDIT_SCHEDULE_DEPARTMENTS.flatMap((_, ln): PaperRow[] => {
  const months = (which: "Plan" | "Actual"): PaperCell[] =>
    AUDIT_SCHEDULE_MONTH_KEYS.map((m, i): PaperCell => ({ w: AS_BODY[i + 3], col: auditScheduleKey(m, which), ln, a: "c", y: which === "Plan" ? 1.16 : 1.17, pt: 9.96 }));
  return [
    {
      h: AS_LINES[2 * ln],
      cells: [
        { w: AS_BODY[0], t: String(ln + 1), a: "c", y: 1.16, pt: 9.96, rs: 2 },
        { w: AS_BODY[1], col: "department", ln, x: 1.9, y: 1.21, lh: 4.27, pt: 9.96, ww: AS_BODY[1] - 3.8, rs: 2 },
        { w: AS_BODY[2], t: "Plan", a: "c", y: 1.16, pt: 9.96, keep: true },
        ...months("Plan"),
        { ...pad(AS_OUT), rs: 2 },
      ],
    },
    {
      h: AS_LINES[2 * ln + 1],
      cells: [under(AS_BODY[0]), under(AS_BODY[1]), { w: AS_BODY[2], t: "Actual", a: "c", y: 1.17, pt: 9.96, keep: true }, ...months("Actual"), under(AS_OUT)],
    },
  ];
});

const AUDIT_SCHEDULE_PAPER: PaperTable = {
  page: "landscape",
  left: 11.51,
  top: 12.95,
  font: "calibri",
  pt: 9.96,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  // The page's double border: 8.47 mm to 288.50 mm across, 8.47 mm to 201.63 mm down.
  pageFrame: { l: 3.04, t: 4.48, w: 280.03, h: 193.16, double: true },
  head: [
    { h: 12.41, cells: [pad(AS_IN), { w: AS_HEAD, t: COMPANY, b: true, a: "c", pt: 12.96, y: 4.86 }] },
    {
      h: 12.28,
      cells: [
        pad(AS_IN),
        {
          w: AS_HEAD,
          b: true,
          a: "c",
          pt: 12.96,
          y: 4.85,
          sentence: { before: "YEARLY INTERNAL AUDIT SCHEDULE (BRCGS PACKAGING – Issue 06) for the Year:", box: "year", after: "", boxWidth: 12, pw: true },
        },
      ],
    },
    {
      h: 7.45,
      cells: [
        pad(AS_IN),
        { w: 117.54, t: "Format No.: F/SYS/05", x: 1.65, y: 2.65 },
        { w: 48.56, t: "Rev No: 01", a: "c", y: 2.65 },
        { w: 50.51, t: "Date: 01.03.2023", a: "c", y: 2.31 },
        { w: AS_HEAD - 117.54 - 48.56 - 50.51, t: "Page No.: 1 Of 1", a: "c", y: 2.31 },
      ],
    },
  ],
  body: [
    gap(4.4, AS_W),
    {
      h: 10.63,
      // (the heading, the note and the foot are the paper's: a department is put in only by the + of a department, the next
      // SN with Plan and Actual - the owner, 26-Nov-2026, the + under the table gave an empty box, §399)
      stays: true,
      cells: [
        { w: AS_HEADING[0], t: "SN", b: true, a: "c", y: 2.1 },
        { w: AS_HEADING[1], t: "DEPARTMENT", b: true, x: 1.9, y: 2.1 },
        { w: AS_HEADING[2], t: "" },
        ...MONTHS.map((m, i): PaperCell => ({ w: AS_HEADING[i + 3], t: m, b: true, a: "c", y: 2.1 })),
        pad(AS_OUT),
      ],
    },
    gap(3.95, AS_W),
    ...scheduleRows,
    // The 2025 schedule's note, typed across its months (the page has no place of its own for it): under the schedule, at the
    // months' place; nothing prints here while it is blank.
    { h: 12.0, stays: true, cells: [pad(AS_BODY.slice(0, 5).reduce((a, b) => a + b, 0)), { w: AS_BODY.slice(5).reduce((a, b) => a + b, 0), box: "scheduleNote", a: "c", y: 1.16, lines: true, edges: "" }, pad(AS_OUT)] },
    // (gives up the height of every department put in above, so Date and Approved by stay inside the frame - the owner, 26-Nov-2026, §396)
    { ...gap(49.73, AS_W), give: true },
  ],
  foot: [
    {
      h: 9.62,
      stays: true,
      cells: [
        { w: 53.99, t: "Date", b: true, pt: 11.04, x: 1.91, y: 3.64 },
        { w: 68.54, box: "date", x: 1.9, vm: true },
        { w: 75.04, t: "Approved by (PSTL)", b: true, pt: 11.04, x: 1.91, y: 3.64 },
        { w: 72.35, box: "approvedBy", x: 1.9, vm: true },
        pad(AS_OUT),
      ],
    },
  ],
};

// --------------------------------------------------------------------------------------------------------------------
// F/SYS/07 INTERNAL AUDIT RISK ASSESSMENT, Rev 01 (the 2024 sheet): 19.24 mm to 196.74 mm across on its PDF, printed there
// at 5 pt; every row as the sheet rules it, each section's figures in one cell down its clauses.
// --------------------------------------------------------------------------------------------------------------------

/** Number | Audit Scope | Auditee | IQA NC | External NCs | Sum | Audit frequency, then the key beside them (three columns). */
const RA = [10.04, 30.65, 30.66, 10.03, 12.37, 10.03, 11.6];
const RA_KEY = [10.04, 23.21, 28.87];
const RA_KEY_W = RA_KEY[0] + RA_KEY[1] + RA_KEY[2];
const RA_W = RA.reduce((a, b) => a + b, 0) + RA_KEY_W;
const RA_PT = 5.16;
/** The section headings' size and the key's note's. */
const RA_BOLD_PT = 6.0;
const RA_NOTE_PT = 7.8;
/** Each clause's row height on the sheet: 5.29 mm, "2" 8.22 and 4.9 10.75. */
const raHeight = (n: string): number => (n === "2" ? 8.22 : n === "4.9" ? 10.75 : 5.29);
/** The first line of each section's figures and the lines it runs down (1.1-1.2, 2, 3.1-3.13, 4.1-4.11, 5.1-5.10, 6.1-6.5). */
const raGroups = (): Map<number, number> => {
  const out = new Map<number, number>();
  let start = -1;
  AUDIT_RISK_CLAUSES.forEach(([n], i) => {
    const heading = !n.includes(".");
    if (heading && n !== "2") {
      start = -1;
      return;
    }
    if (n === "2") {
      out.set(i, 1);
      start = -1;
      return;
    }
    if (start < 0) {
      start = i;
      out.set(i, 0);
    }
    out.set(start, (out.get(start) ?? 0) + 1);
  });
  return out;
};
const RA_FIGURES = ["iqaNc", "externalNc", "sum", "frequency"];

/** Page 2 starts at section 5 (his sheet is one page at 5 pt; readable, it is two). */
const RA_PAGE2 = AUDIT_RISK_CLAUSES.findIndex(([n]) => n === "5");

/** The key beside the clause list, row by row from the column headings' row. */
function raKey(row: number): PaperCell[] {
  // (row 0 is the column headings' row; row 1 + i is clause line i)
  const line = row - 1;
  const c = (w: number, t: string, more: Partial<PaperCell> = {}): PaperCell => ({ w, t, a: "c", vm: true, pt: RA_PT, ...more });
  if (row === 0) return [{ w: RA_KEY_W, t: "", rs: 8, edges: "ltrb" }];
  if (line >= 0 && line <= 6) return [under(RA_KEY_W)];
  if (line === 7) return [c(RA_KEY[0] + RA_KEY[1], "Sum of  IQA + external audit NCs", { b: true }), c(RA_KEY[2], "Audit Frequency", { b: true })];
  const criteria: Record<number, [string, string]> = { 8: ["< = 4", "Once / Year"], 9: ["5 to 15", "Twice / Year"], 10: ["> = 16", "3 times / Year"] };
  if (criteria[line]) return [c(RA_KEY[0] + RA_KEY[1], criteria[line][0]), c(RA_KEY[2], criteria[line][1])];
  if (line === 11) return [{ w: RA_KEY_W, t: "Risks will be reviewed in accordance with audit findings and ratings will be adjusted accordingly", pt: RA_PT, x: 0.4, y: 0.8, lh: 2.38 }];
  if (line === 12) return [c(RA_KEY[0], "SECTION", { b: true }), c(RA_KEY[1], "IQA NC", { b: true }), c(RA_KEY[2], "EXTERNAL AUDIT NC (2023)", { b: true })];
  const sections: [string, string, string][] = [
    ["1", "0", "0"],
    ["2", "0", "1"],
    ["3", "0", "0"],
    ["4", "3", "4"],
    ["5", "1", "1"],
    ["6", "2", "0"],
  ];
  if (line >= 13 && line <= 18) {
    const [sec, iqa, ext] = sections[line - 13];
    return [c(RA_KEY[0], sec, { b: true }), c(RA_KEY[1], iqa), c(RA_KEY[2], ext)];
  }
  if (line === 19) return [c(RA_KEY[0], ""), c(RA_KEY[1], "6", { b: true }), c(RA_KEY[2], "6", { b: true })];
  if (line === 20) return [{ w: RA_KEY_W, t: "Irrespective of Risk rating criteria, each clause to be audited minimum Twice / Year", pt: RA_NOTE_PT, x: 0.5, vm: true, rs: 3 }];
  if (line === 21 || line === 22) return [under(RA_KEY_W)];
  // The blank under it to the foot of each page.
  if (line === 23) return [{ w: RA_KEY_W, t: "", rs: RA_PAGE2 - 23, edges: "lrb" }];
  if (line === RA_PAGE2) return [{ w: RA_KEY_W, t: "", rs: AUDIT_RISK_CLAUSES.length - RA_PAGE2, edges: "lrb" }];
  return [under(RA_KEY_W)];
}

/** The clause lines from..to (not to): each section's figures one cell down its clauses. */
function riskRows(from: number, to: number): PaperRow[] {
  const groups = raGroups();
  let runningUntil = -1;
  return AUDIT_RISK_CLAUSES.slice(0, to).flatMap(([n], ln): PaperRow[] => {
    const heading = !n.includes(".");
    const bold = heading ? { b: true as const, pt: RA_BOLD_PT } : {};
    const span = groups.get(ln);
    let figures: PaperCell[];
    if (span !== undefined) {
      runningUntil = ln + span - 1;
      // (the figures of sections 1 and 2, and section 3's frequency, bold as the 2024 sheet prints them)
      const strong = ln <= 2;
      figures = RA_FIGURES.map((col, i): PaperCell => ({ w: RA[i + 3], col, ln, a: "c", vm: true, ...(span > 1 ? { rs: span } : {}), ...(strong || (ln === 4 && col === "frequency") ? { b: true as const } : {}), ...(strong ? { pt: RA_BOLD_PT } : {}) }));
    } else if (ln <= runningUntil) {
      figures = RA_FIGURES.map((_, i) => under(RA[i + 3]));
    } else {
      figures = RA_FIGURES.map((col, i): PaperCell => ({ w: RA[i + 3], col, ln, a: "c", vm: true }));
    }
    if (ln < from) return [];
    return [
      {
        h: raHeight(n),
        cells: [
          { w: RA[0], col: "number", ln, a: "c", vm: true, ...bold },
          { w: RA[1], col: "auditScope", ln, x: 0.4, vm: true, ...bold },
          // (the "4 Site Standards" line prints no Auditee: the cell is the paper's blank)
          n === "4" ? { w: RA[2], t: "", x: 0.4 } : { w: RA[2], col: "auditee", ln, x: 0.4, vm: true, ...(heading && n !== "2" ? bold : {}) },
          ...figures,
          ...raKey(ln + 1),
        ],
      },
    ];
  });
}

/** The company and the title (with the year), the column headings: page 1's, and printed again at the top of page 2. */
function riskHead(first: boolean): PaperRow[] {
  const pl = (p: string) => (first ? {} : { pl: p });
  return [
    { h: 5.46, cells: [{ w: RA_W, t: COMPANY, b: true, a: "c", pt: RA_NOTE_PT, vm: true, ...pl("0:0") }], ...(first ? {} : { pb: true as const }) },
    {
      h: 5.46,
      cells: [
        {
          w: RA_W,
          b: true,
          a: "c",
          pt: RA_NOTE_PT,
          vm: true,
          ...pl("1:0"),
          sentence: { before: "INTERNAL AUDIT RISK ASSESSMENT - YEAR", box: "year", after: "(based on review of BRCGS audits & findings of Internal audit etc.)", boxWidth: 6, pw: true, ...(first ? {} : { copy: true as const }) },
        },
      ],
    },
  ];
}

function riskHeadings(first: boolean): PaperRow {
  const pl = (i: number) => (first ? {} : { pl: `2:${i}` });
  return {
    h: 5.46,
    head: true,
    cells: [
      { w: RA[0], t: "Number", b: true, a: "c", vm: true, ...pl(0) },
      { w: RA[1], t: "Audit Scope", b: true, a: "c", vm: true, ...pl(1) },
      { w: RA[2], t: "Auditee", b: true, x: 0.4, vm: true, ...pl(2) },
      { w: RA[3], t: "IQA NC", b: true, a: "c", vm: true, ...pl(3) },
      { w: RA[4], t: "External NCs", b: true, a: "c", vm: true, ...pl(4) },
      { w: RA[5], t: "Sum", b: true, a: "c", vm: true, ...pl(5) },
      { w: RA[6], t: "Audit\nfrequency", b: true, x: 0.41, y: 1.05, lh: 2.37, ...pl(6) },
      ...(first ? raKey(0) : [{ w: RA_KEY_W, t: "", edges: "ltrb" }]),
    ],
  };
}

/** The sheet's own number, revision and date under it, at the foot of each page. */
function riskFoot(pl?: number): PaperRow {
  const at = (i: number) => (pl === undefined ? {} : { pl: `${pl}:${i}` });
  return {
    h: 5.0,
    cells: [
      { w: 60, t: "F/SYS/07", x: 0.15, y: 2.7, edges: "", ...at(0) },
      { w: RA_W - 120, t: "Rev. no. - 01", a: "c", y: 2.7, edges: "", ...at(1) },
      { w: 60, t: "Date : 01.03.2023", a: "r", y: 2.7, edges: "", ...at(2) },
    ],
  };
}

const riskPage1 = [riskHeadings(true), ...riskRows(0, RA_PAGE2)];
/** Where page 1's foot line stands among the paper's rows (its words are page 2's too). */
const RA_FOOT1 = 2 + riskPage1.length;

const AUDIT_RISK_PAPER: PaperTable = {
  page: "portrait",
  left: 19.24,
  top: 6.16,
  font: "calibri",
  pt: RA_PT,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  flows: true,
  head: riskHead(true),
  body: [...riskPage1, riskFoot(), ...riskHead(false), riskHeadings(false), ...riskRows(RA_PAGE2, AUDIT_RISK_CLAUSES.length)],
  foot: [riskFoot(RA_FOOT1)],
};

// --------------------------------------------------------------------------------------------------------------------
// F/SYS/08 INTERNAL AUDIT FINDINGS / OBSERVATION REPORT, Rev 01: 17.02 mm to 193.25 mm across, the head 8.25 mm down; page 1
// the functions audited, then the checklist, its head on every page.
// --------------------------------------------------------------------------------------------------------------------

const AF_W = 176.23;
/** The tables stand 1.06 mm in from the head each side (18.08 mm to 192.19 mm). */
const AF_IN = 1.06;
/** Sr. No. | Function | Audit Date | Audit Time | Auditors. */
const AF_FN = [19.86, 59.87, 28.83, 26.81, 38.74];
/** Clause | Requirements | Compliance/Non compliance | Comments / Outcome. */
const AF_CL = [27.14, 73.34, 31.12, 42.51];

function findingsHead(first: boolean): PaperRow[] {
  const pl = (p: string) => (first ? {} : { pl: p });
  return [
    { h: 11.69, cells: [{ w: AF_W, t: "INTERNAL AUDIT FINDINGS / OBSERVATION REPORT", a: "c", pt: 12.96, y: 4.55, ...pl("0:0") }], ...(first ? {} : { pb: true as const }) },
    {
      h: 7.28,
      cells: [
        { w: 52.38, t: "Format No.: F/SYS/08", x: 1.65, y: 2.36, ...pl("1:0") },
        { w: 39.72, t: "Rev No: 01", x: 1.7, y: 2.36, ...pl("1:1") },
        { w: 41.28, t: "Date: 01.03.2023", x: 1.65, y: 2.36, ...pl("1:2") },
        { w: 42.85, t: "Page No.: 1 Of 1", x: 1.65, y: 2.36, ...pl("1:3") },
      ],
    },
    // (the strip under the head is the head's: a page the checklist runs on to prints it under its head too)
    { h: 5.78, cells: [{ w: AF_W, t: "", edges: "", ...pl("2:0") }] },
  ];
}

const companyFoot = (h: number, y: number): PaperRow => ({ h, cells: [{ w: AF_W, t: COMPANY, b: true, a: "c", pt: 12.96, y, edges: "" }] });

const functionRow = (n: number, h: number, more: { y: number; vm?: true }): PaperRow => ({
  h,
  cells: [
    pad(AF_IN),
    { w: AF_FN[0], t: `${n}.`, b: true, x: 6.74, vm: true },
    { w: AF_FN[1], box: `function${n}`, x: 1.95, lh: 4.31, lines: true, ...(more.vm ? { vm: true as const } : { y: more.y }) },
    { w: AF_FN[2], box: `auditDate${n}`, a: "c", pt: 11.04, y: 2.34 },
    { w: AF_FN[3], box: `auditTime${n}`, x: 1.91, pt: 11.04, y: 2.32, lh: n === 1 ? 4.74 : 7.11, lines: true },
    { w: AF_FN[4], box: `auditors${n}`, a: "c", pt: 11.04, y: 2.34, lines: true },
    pad(AF_IN),
  ],
});

const AUDIT_FINDINGS_PAPER: PaperTable = {
  page: "portrait",
  left: 17.02,
  top: 8.25,
  font: "calibri",
  pt: 9.96,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  flows: true,
  head: findingsHead(true),
  body: [
    gap(11.0, AF_W),
    { h: 5.3, cells: [{ w: 174.36, t: "BRCGS Packaging Materials – ISSUE 6", b: true, a: "r", y: 1.83, edges: "" }, pad(AF_W - 174.36)] },
    { h: 6.58, cells: [{ w: 174.36, t: "Audit Checklist & Compliance Report", a: "r", y: 1.87, edges: "" }, pad(AF_W - 174.36)] },
    // The rule under them (19.48 mm to 190.80 mm; blue on his page).
    { h: 0.9, cells: [pad(2.46), { w: 171.32, t: "", edges: "b" }, pad(AF_W - 2.46 - 171.32)] },
    gap(6.73, AF_W),
    {
      h: 11.94,
      cells: [
        pad(AF_IN),
        { w: AF_FN[0], t: "Sr.\nNo.", b: true, a: "c", y: 2.26, lh: 5.38 },
        { w: AF_FN[1], t: "Function", b: true, x: 1.95, y: 5.27 },
        { w: AF_FN[2], t: "Audit\nDate", b: true, a: "c", y: 2.26, lh: 5.38 },
        { w: AF_FN[3], t: "Audit Time", b: true, x: 1.91, y: 4.93 },
        { w: AF_FN[4], t: "Auditors", b: true, a: "c", y: 4.93 },
        pad(AF_IN),
      ],
    },
    functionRow(1, 11.77, { y: 2.69 }),
    functionRow(2, 24.05, { y: 0, vm: true }),
    // The company at the foot of page 1, as every page of the report prints it.
    gap(148.5, AF_W),
    companyFoot(8.5, 2.2),
    // Page 2 on: the checklist.
    ...findingsHead(false),
    {
      h: 9.86,
      head: true,
      cells: [
        pad(AF_IN),
        { w: AF_CL[0], t: "Clause", b: true, x: 1.91, y: 2.27 },
        { w: AF_CL[1], t: "Requirements", b: true, x: 1.9, y: 2.27 },
        { w: AF_CL[2], t: "Compliance/Non\ncompliance", b: true, x: 1.95, y: 1.21, lh: 4.32 },
        { w: AF_CL[3], t: "Comments / Outcome", b: true, x: 1.91, y: 2.27 },
        pad(AF_IN),
      ],
    },
  ],
  // The checklist's lines: clause by clause, each growing to its requirement's words.
  lines: {
    h: 9.29,
    count: 22,
    cells: [
      pad(AF_IN),
      { w: AF_CL[0], col: "clause", x: 1.91, y: 2.27, lh: 4.32, lines: true, grow: true },
      { w: AF_CL[1], col: "requirements", x: 1.9, y: 2.23, lh: 4.32, lines: true, grow: true },
      { w: AF_CL[2], col: "compliance", a: "c", y: 2.27, lh: 4.32, lines: true, grow: true },
      { w: AF_CL[3], col: "comments", x: 1.91, y: 2.27, lh: 4.32, lines: true, grow: true },
      pad(AF_IN),
    ],
  },
  foot: [gap(4.0, AF_W), companyFoot(8.5, 2.2)],
};

// --------------------------------------------------------------------------------------------------------------------
// F/SYS/10 INTERNAL AUDIT NC REPORT and F/SYS/11 NON-CONFORMANCE & CORRECTIVE ACTION REPORT (CAR): the head 24.43 mm to
// 200.66 mm across, 7.66 mm down; one A4 page each. F/SYS/11's dashed cut lines run 5 mm past the tables each side.
// --------------------------------------------------------------------------------------------------------------------

const NC_W = 176.23;
/** The finding's half and the objective evidence's (137.57 mm), the evidence's labels and boxes (165.09 mm). */
const NC_LEFT = 113.14;
const EV_LABEL = 27.52;
const EV_BOX = NC_W - NC_LEFT - EV_LABEL;
/** The heading's bold words and the words after them, each a cell, so each can be typed over. */
const headed = (bold: string, boldW: number, rest: string, more: Partial<PaperCell> = {}): PaperCell[] => [
  { w: boldW, t: bold, b: true, u: true, x: 2.5, y: 1.38, edges: "lt" },
  { w: NC_W - boldW, t: rest, x: 0.4, y: 1.38, edges: "tr", ...more },
];
/** A sign's label with the sign written after it on the same line. */
const signCell = (w: number, label: string, box: string, x: number, boxW: number, more: Partial<PaperCell> = {}): PaperCell => ({
  w,
  t: label,
  b: true,
  x: 2.5,
  y: 1.95,
  over: [{ box, x, y: 0.55, w: boxW, h: 4.9 }],
  ...more,
});

/** The head of both reports: the company and the title underlined, the number line. */
function ncHead(title: PaperCell[], formatNo: string, rev: string, centred: boolean): PaperRow[] {
  const at = (w: number, t: string, y: number): PaperCell => (centred && t.startsWith("Rev") ? { w, t, a: "c", pt: 9.96, y } : centred && t.startsWith("Date") ? { w, t, a: "c", pt: 9.96, y } : { w, t, pt: 9.96, x: 1.65, y });
  return [
    { h: 11.69, cells: [{ w: NC_W, t: COMPANY, b: true, u: true, a: "c", pt: 12, y: 4.64 }] },
    { h: 11.52, cells: title },
    { h: 7.11, cells: [at(52.38, `Format No.: ${formatNo}`, 2.48), at(39.72, rev, 2.48), at(41.28, "Date: 01.12.2021", 2.31), at(42.85, "Page No.: 1 Of 1", 2.31)] },
  ];
}

/** Report No. | Report Date | Auditor's / Observer's Name, then Dept. / Area / Function and its tick box(es). */
function ncTop(name: string, nameBox: string, picks: PaperCell[]): PaperRow[] {
  return [
    {
      h: 5.89,
      cells: [
        { w: 23.12, t: "Report No.", b: true, x: 2.5, y: 1.89 },
        { w: 19.99, box: "reportNo", x: 1.0, vm: true },
        { w: 22.52, t: "Report Date", b: true, x: 1.9, y: 1.89 },
        { w: 27.48, box: "reportDate", x: 1.0, vm: true },
        { w: 30.03, t: name, b: true, x: 1.91, y: 1.89 },
        { w: 53.09, box: nameBox, x: 1.9, vm: true },
      ],
    },
    { h: 5.92, cells: [{ w: 43.11, t: "Dept. / Area / Function", b: true, x: 2.5, y: 1.93 }, { w: 62.53, box: "deptAreaFunction", x: 1.9, vm: true }, ...picks] },
  ];
}

/** The finding and its objective evidence: the heading, then the box beside Reference Record(s), Procedure / Flow Chart No. ... */
function ncFinding(evidence: { label: string; box: string; h: number; y: number; lh?: number }[]): PaperRow[] {
  const rows: PaperRow[] = [
    {
      h: 4.66,
      cells: [
        { w: 39.17, t: "NC FINDING STATEMENT", b: true, u: true, x: 2.5, y: 1.38, edges: "lt" },
        { w: NC_LEFT - 39.17, t: "(Mention details of detected / potential problem)", x: 0.43, y: 1.38, edges: "t" },
        // (the dotted rules under the evidence's heading and under Reference Record(s) are the paper's)
        { w: NC_W - NC_LEFT, t: "Objective Evidence(s), if any", b: true, u: true, a: "c", pt: 9, y: 1.47, edges: "ltrbo" },
      ],
    },
  ];
  evidence.forEach((e, i) => {
    const dotted = i === 0 ? "lrbo" : "lrb";
    rows.push({
      h: e.h,
      cells: [
        i === 0 ? { w: NC_LEFT, box: "ncFindingStatement", rs: evidence.length, x: 2.5, y: 0.8, lh: 4.3, lines: true, edges: "lrb" } : under(NC_LEFT),
        { w: EV_LABEL, t: e.label, x: 1.9, y: e.y, ...(e.lh ? { lh: e.lh } : {}), edges: dotted },
        { w: EV_BOX, box: e.box, x: 1.0, vm: true, edges: dotted },
      ],
    });
  });
  return rows;
}

/** "Note: The following Root Cause Analysis ..." in italics, "Note" underlined: "Note" at noteX, the rest from restAt. */
const ncNote = (h: number, noteX: number, restAt: number, rest: string, restX: number, y: number, width: number): PaperRow => ({
  h,
  cells: [
    { w: restAt, t: "Note", u: true, x: noteX, y, edges: "i" },
    { w: width - restAt, t: rest, x: restX, y, edges: "i" },
  ],
});

const ROOT_CAUSE_WORDS = "(Carryout a Root Cause Analysis in terms of WHY attributing to as follows,";
const rootCauseHead = (): PaperCell[] =>
  headed("ROOT CAUSE(S)", 25.77, ROOT_CAUSE_WORDS, { pt: 9, y: 1.59, x: 0.35, bs: [ROOT_CAUSE_WORDS.indexOf("WHY"), ROOT_CAUSE_WORDS.indexOf("WHY") + 3] });

const AUDIT_NC_PAPER: PaperTable = {
  page: "portrait",
  left: 24.43,
  top: 7.66,
  font: "calibri",
  pt: 9.96,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  head: ncHead([{ w: NC_W, t: "INTERNAL AUDIT NC REPORT", b: true, u: true, a: "c", pt: 12, y: 4.47 }], "F/SYS/10", "Rev No: 01", true),
  body: [
    gap(4.4, NC_W),
    // (his format ticks Non-Conformance alone; F/SYS/11 prints Observation beside it)
    ...ncTop("Auditor’s Name", "auditorName", [{ w: 70.59, t: "", b: true, pt: 9, over: [{ x: 2.29, y: 1.39, w: 42, h: 3.09, pick: [tick("ncType", "Non-Conformance")] }] }]),
    gap(1.19, NC_W),
    ...ncFinding([
      { label: "Reference\nRecord(s)", box: "referenceRecords", h: 8.8, y: 1.2, lh: 4.32 },
      { label: "Procedure /\nFlow Chart No.", box: "procedureFlowChart", h: 17.5, y: 5.53, lh: 4.27 },
      { label: "Clause No.", box: "clauseNo", h: 5.16, y: 1.54 },
    ]),
    {
      h: 6.17,
      cells: [
        signCell(53.1, "Auditor’s Sign.", "auditorSign", 26.0, 26.5),
        signCell(60.04, "Auditee’s Sign.", "auditeeSign", 25.0, 34.5, { x: 1.9 }),
        { w: 37.51, t: "Planned Closing Date", b: true, x: 1.9, y: 1.95 },
        { w: 25.58, box: "plannedClosingDate", x: 1.0, vm: true },
      ],
    },
    ncNote(5.73, 0.6, 7.58, ": The following Root Cause Analysis shall be done by the Auditee for the Detected Non-Conformance only.", 0, 2.28, NC_W),
    { h: 5.37, cells: rootCauseHead() },
    { h: 15.88, cells: [{ w: NC_W, box: "rootCause", x: 2.5, y: 0.6, lh: 4.3, lines: true, grow: true, edges: "lrb" }] },
    // (its foot is the paper's dotted rule)
    {
      h: 8.12,
      cells: [
        { w: 33.11, t: "Auditee’s Sign.", b: true, x: 2.5, y: 3.07, edges: "lrbo" },
        { w: 40.01, box: "rootCauseAuditeeSign", x: 1.0, vm: true, edges: "lrbo" },
        { w: 58.78, t: "Auditor’s Sign for acceptance", b: true, a: "c", y: 3.07, edges: "lrbo" },
        { w: 44.33, box: "rootCauseAuditorSign", x: 1.0, vm: true, edges: "lrbo" },
      ],
    },
    gap(2.08, NC_W),
    { h: 5.15, cells: [{ w: NC_W, t: "CORRECTION ACTION", b: true, u: true, x: 2.5, y: 1.38, edges: "ltr" }] },
    { h: 12.51, cells: [{ w: NC_W, box: "correctionAction", x: 2.5, y: 0.4, lh: 4.3, lines: true, grow: true, edges: "lrb" }] },
    { h: 5.15, cells: [{ w: NC_W, t: "CORRECTIVE ACTION", b: true, u: true, x: 2.5, y: 1.29, edges: "ltr" }] },
    { h: 18.89, cells: [{ w: NC_W, box: "correctiveAction", x: 2.5, y: 0.4, lh: 4.3, lines: true, grow: true, edges: "lrb" }] },
    { h: 6.06, cells: [signCell(123.14, "Auditee’s Sign.", "correctiveActionAuditeeSign", 26.0, 95.0), signCell(53.09, "Date", "correctiveActionDate", 10.0, 41.0, { x: 1.9 })] },
    gap(2.24, NC_W),
    { h: 5.65, cells: headed("Follow–up audit:", 27.87, "(Verification and effectiveness of action taken)", { y: 1.55, x: 0.5 }) },
    { h: 23.95, cells: [{ w: NC_W, box: "followUp", x: 2.5, y: 0.4, lh: 4.3, lines: true, grow: true, edges: "lrb" }] },
    {
      h: 30.52,
      cells: [
        {
          w: 95.65,
          edges: "ltrb",
          at: [
            { t: "CAR CLOSING VERIFICATION", b: true, u: true, x: 2.5, y: 2.4 },
            { t: "Date", x: 2.5, y: 8.79 },
            { t: "Verified by", x: 2.5, y: 15.22 },
            { t: "Sign.", x: 2.5, y: 21.66 },
          ],
          over: [
            { box: "carClosingDate", x: 10.5, y: 7.05, w: 28.2, h: 4.6, rule: 28.2 },
            { box: "carVerifiedBy", x: 18.9, y: 13.49, w: 37.4, h: 4.6, rule: 37.4 },
            { box: "carSign", x: 11.0, y: 19.92, w: 27.6, h: 4.6, rule: 27.6 },
          ],
        },
        {
          w: 80.58,
          edges: "ltrb",
          at: [
            { t: "Actions Found    -", b: true, x: 1.86, y: 2.4 },
            { t: "CAR                   -", b: true, x: 1.86, y: 17.43 },
          ],
          over: [
            { x: 1.86, y: 9.56, w: 60, h: 4.2, pick: [ring("actionsFound", "Satisfactory"), ring("actionsFound", "Unsatisfactory")] },
            { x: 1.86, y: 24.6, w: 60, h: 4.2, pick: [ring("carStatus", "Closed"), ring("carStatus", "Not Closed")] },
          ],
        },
      ],
    },
  ],
  foot: [],
};

const CORRECTIVE_WORDS =
  "recurrence of this detected problem based on the Root Cause Analysis carried out above in each applicable ‘M’.\nPlease mention here only those actions which have been taken and found effective after implementing)";

// F/SYS/11: the paper is 19.53 mm to 204.63 mm across, its cut lines' length; the tables 4.90 mm in from its left.
const CAR_W = 185.1;
const CAR_IN = 4.9;
const CAR_OUT = CAR_W - CAR_IN - NC_W;
const inCar = (rows: PaperRow[]): PaperRow[] => rows.map((r) => ({ ...r, cells: [pad(CAR_IN), ...r.cells, pad(CAR_OUT)] }));
/** A dashed cut line across the page, `h` mm under what is above it. */
const cut = (h: number): PaperRow => ({ h, cells: [{ w: CAR_W, t: "", edges: "bd" }] });

const NC_CAR_PAPER: PaperTable = {
  page: "portrait",
  left: 19.53,
  top: 7.66,
  font: "calibri",
  pt: 9.96,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  head: inCar(
    ncHead(
      [
        { w: 130.77, t: "NON-CONFORMANCE & CORRECTIVE ACTION REPORT", b: true, u: true, pt: 12, x: 35.35, y: 4.47, edges: "ltb" },
        { w: NC_W - 130.77, t: "(CAR)", b: true, pt: 12, x: 0.4, y: 4.47, edges: "trb" },
      ],
      "F/SYS/11",
      "Rev No: 00",
      false
    )
  ),
  body: [
    gap(4.4, CAR_W),
    ...inCar(
      ncTop("Observer’s Name", "observerName", [
        { w: 35.02, t: "", b: true, pt: 9, over: [{ x: 2.29, y: 1.39, w: 32, h: 3.09, pick: [tick("ncType", "Non-Conformance")] }] },
        { w: 35.57, t: "", b: true, pt: 9, over: [{ x: 2.25, y: 1.39, w: 32, h: 3.09, pick: [tick("ncType", "Observation")] }] },
      ])
    ),
    gap(1.19, CAR_W),
    ...inCar([
      ...ncFinding([
        { label: "Reference\nRecord(s)", box: "referenceRecords", h: 8.8, y: 1.2, lh: 4.32 },
        { label: "Procedure /\nFlow Chart No.", box: "procedureFlowChart", h: 8.89, y: 1.21, lh: 4.32 },
      ]),
      {
        h: 6.18,
        cells: [
          signCell(53.1, "Observer / Auditor’s Sign.", "observerSign", 41.4, 11.4),
          signCell(60.04, "Auditee’s / Consignee Sign.", "auditeeSign", 42.8, 16.9, { x: 1.9 }),
          { w: 37.51, t: "Planned Closing Date", b: true, x: 1.9, y: 1.95 },
          { w: 25.58, box: "plannedClosingDate", x: 1.0, vm: true },
        ],
      },
    ]),
    cut(0.86),
    ncNote(4.87, 5.5, 12.48, ": The following Root Cause Analysis shall be done by the Auditee for the Detected Non-Conformance only.", 0.9, 1.42, CAR_W),
    ...inCar([
      { h: 5.37, cells: rootCauseHead() },
      { h: 27.39, cells: [{ w: NC_W, box: "rootCause", x: 2.5, y: 0.6, lh: 4.3, lines: true, grow: true, edges: "lrbo" }] },
    ]),
    cut(0.54),
    gap(0.69, CAR_W),
    ...inCar([
      { h: 5.37, cells: headed("CORRECTION DONE", 31.57, "(Mention in detail the action taken to correct the detected problem)", { x: 0.4 }) },
      { h: 21.01, cells: [{ w: NC_W, box: "correctionDone", x: 2.5, y: 0.6, lh: 4.3, lines: true, grow: true, edges: "lrb" }] },
    ]),
    cut(0.54),
    gap(0.82, CAR_W),
    ...inCar([
      {
        h: 4.6,
        cells: [
          { w: 33.57, t: "CORRECTIVE ACTION", b: true, u: true, x: 2.5, y: 1.42, edges: "lt" },
          { w: 54.6, t: "(Action Taken to Prevent Recurrence)", b: true, x: 0.22, y: 1.42, edges: "ti" },
          { w: NC_W - 33.57 - 54.6, t: "(Mention in detail the actions taken to prevent the", x: 0.9, y: 1.42, edges: "tr" },
        ],
      },
      {
        h: 8.77,
        cells: [
          {
            w: NC_W,
            t: CORRECTIVE_WORDS,
            bs: [CORRECTIVE_WORDS.indexOf("‘M’"), CORRECTIVE_WORDS.indexOf("‘M’") + 3],
            x: 2.5,
            y: 1.09,
            lh: 4.32,
            edges: "lrb",
          },
        ],
      },
      { h: 45.78, cells: [{ w: NC_W, box: "correctiveAction", x: 2.5, y: 0.6, lh: 4.3, lines: true, grow: true, edges: "lrb" }] },
      { h: 6.05, cells: [signCell(123.14, "Auditee’s / Consignee Sign.", "correctiveActionAuditeeSign", 43.0, 78.0), signCell(53.09, "Date", "correctiveActionDate", 10.0, 41.0, { x: 1.9 })] },
    ]),
    cut(1.01),
    gap(4.66, CAR_W),
    ...inCar([
      {
        h: 14.47,
        cells: [
          {
            w: 44.07,
            edges: "ltb",
            at: [
              { t: "CAR CLOSING VERIFICATION", b: true, u: true, x: 2.5, y: 2.44 },
              { t: "Verified By", x: 2.5, y: 8.87 },
            ],
            over: [{ box: "carVerifiedBy", x: 18.9, y: 7.14, w: 36.8, h: 4.6, rule: 36.8 }],
          },
          {
            w: 51.58,
            edges: "trb",
            at: [
              { t: "Date", x: 0.8, y: 2.44 },
              { t: "Sign.", x: 12.5, y: 8.87 },
            ],
            over: [
              { box: "carClosingDate", x: 8.1, y: 0.7, w: 34.6, h: 4.6, rule: 28.5 },
              { box: "carSign", x: 21.0, y: 7.14, w: 27.0, h: 4.6, rule: 27.0 },
            ],
          },
          {
            w: 80.58,
            edges: "ltrb",
            at: [
              { t: "Actions Found    -", b: true, x: 1.86, y: 2.44 },
              { t: "CPAR                   -", b: true, x: 1.86, y: 8.92 },
            ],
            over: [
              { x: 29.1, y: 2.1, w: 50, h: 4.2, pick: [ring("actionsFound", "Satisfactory"), ring("actionsFound", "Unsatisfactory")] },
              { x: 28.42, y: 8.58, w: 50, h: 4.2, pick: [ring("cparStatus", "Closed"), ring("cparStatus", "Not Closed")] },
            ],
          },
        ],
      },
    ]),
    gap(1.41, CAR_W),
    ...inCar([
      { h: 6.18, cells: [{ w: 138.17, t: "Planned Follow-up Date in case of Unsatisfactory Actions / Non-Closure", b: true, x: 2.5, y: 2.1 }, { w: 38.06, box: "plannedFollowUpDate", x: 1.0, vm: true }] },
      {
        h: 6.14,
        cells: [{ w: 85.62, t: "Sign. & Date of Re-verification & Satisfactory Closure", b: true, x: 2.5, y: 1.98 }, { w: 52.55, box: "reverificationSign", x: 1.0, vm: true }, { w: 38.06, t: "" }],
      },
    ]),
  ],
  foot: [],
};

export const SYS_PAPERS_352: Record<string, PaperTable> = {
  "sys-document-change": DOCUMENT_CHANGE_PAPER,
  "sys-audit-schedule": AUDIT_SCHEDULE_PAPER,
  "sys-audit-risk": AUDIT_RISK_PAPER,
  "sys-audit-findings": AUDIT_FINDINGS_PAPER,
  "sys-audit-nc": AUDIT_NC_PAPER,
  "sys-nc-car": NC_CAR_PAPER,
};
