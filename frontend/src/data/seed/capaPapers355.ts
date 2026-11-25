// THE CAPA MODULE'S TWO FORMATS DRAWN AS THE OWNER'S OWN PAPERS (REQUIREMENTS §372). Their records are not log sheets: their
// pages (pages/CapaPage.tsx, pages/GapPage.tsx) draw these papers with components/records/OwnPaperSheet.tsx and hand each
// place a person writes in its own box.
//
//   F/MKT/05 Customer Complaint Handling Checklist ("Updated Checklist.doc", printed to source-documents/originals-pdf):
//     three portrait pages, each in its double page border with his logo beside "CUSTOMER COMPLAINT HANDLING CHECKLIST" at
//     the head and, at the foot, "Format number: - F/MKT/05 (00 / 21.07.2026) | Page n of 3" over the address. Page 1 the
//     customer's table and sections A and B, page 2 sections C, D and E, page 3 the APPROVAL table and the closing sentence.
//     Each section's table is his: Sr. No. | Activity | Date | Comments, ruled.
//   Pest contol service - Gaps Analysis report ("GAP Analysis Report -Pest control Dec 2023.xlsx"): one landscape page, the
//     title in the table, Date Of Inspection, Name and Address of Premises Inspected (two lines), Contact Person, the findings
//     table with "Corrective Action to be Taken" over By Pest contol contractor | By Client, five ruled rows, and GENERAL
//     COMMENT with its numbered lines. His file gives it no format number: DCRS keeps "TO BE CONFIRMED".
//
// Measured off his printouts with pymupdf (every rule and line of words in mm). No colours (§282): his orange title and
// blue section headings print black.

import type { PaperCell, PaperRow, PaperTable } from "./qcPaperTables";
import { COMPLAINT_FOOTER_NOTE } from "./complaintChecklist";

const blank = (w: number, more: Partial<PaperCell> = {}): PaperCell => ({ w, t: "", edges: "", ...more });

// ===========================================================================
// F/MKT/05 — CUSTOMER COMPLAINT HANDLING CHECKLIST (portrait, three pages)
// ===========================================================================

/** The page from 11.0 mm (his heading box) to 199.1 mm; his tables stand from 17.7 to 192.1 mm. */
const K_W = 188.1;
const K_IN = 6.7;
const K_TABLE = 174.4;
const K_OUT = K_W - K_IN - K_TABLE;
const K_PT = 11.04;

/** His Word header: the logo beside the title, on every page (its words typed over once for all three). */
const checklistHead = (page: number): PaperRow[] => [
  {
    h: 25.4,
    ...(page > 1 ? { pb: true as const } : {}),
    cells: [
      { w: 56.8, t: "", img: { src: "brand/gpp-logo-fmkt05.png", x: 1.14, y: 3.72, w: 54.33, h: 18.33, alt: "Gujarat Print Pack Publications Pvt. Ltd." } },
      { w: K_W - 56.8, t: "CUSTOMER COMPLAINT HANDLING\nCHECKLIST", b: true, a: "c", pt: 20.04, lh: 9.3, vm: true, pl: "head:title" },
    ],
  },
];

/** His Word footer: the format's number and the page in a ruled box, the address under it. */
const checklistFoot = (page: number): PaperRow[] => [
  {
    h: 9.0,
    cells: [
      blank(2.0),
      { w: 139.7, t: "Format number: - F/MKT/05 (00 / 21.07.2026)", a: "c", vm: true, pt: 12, heavy: "b", pl: "foot:format" },
      { w: 44.9, t: `Page ${page} of 3`, x: 1.9, vm: true, pt: 12, heavy: "b" },
      blank(K_W - 2.0 - 139.7 - 44.9),
    ],
  },
  { h: 7.4, cells: [{ w: K_W, t: "308/9, GIDC, DEDIYASAN, MEHSANA, GUAJRAT, INDIA - 384002", b: true, a: "c", pt: 14.04, y: 1.7, edges: "", pl: "foot:address" }] },
];

const gap = (h: number): PaperRow => ({ h, cells: [blank(K_W)] });
/** A section's heading, as his Word heading prints it (Calibri Light, 16 pt). */
const sectionTitle = (h: number, t: string): PaperRow => ({ h, cells: [blank(K_IN), { w: K_TABLE, t, x: 1.9, y: 0.9, pt: 15.96, edges: "" }, blank(K_OUT)] });

export interface ChecklistActivity {
  /** The activity's place among the record's activities, from 0 (the line its Date and Comments are). */
  ln: number;
  srNo: number;
  activity: string;
}

/** A section's table: Sr. No. | Activity | Date | Comments, in his widths, each activity's line in his height. */
function sectionTable(widths: [number, number, number, number], headH: number, items: (ChecklistActivity & { h: number })[]): PaperRow[] {
  const [no, act, date, comments] = widths;
  return [
    {
      h: headH,
      cells: [
        blank(K_IN),
        { w: no, t: "Sr. No.", x: 1.9, y: 0.9 },
        { w: act, t: "Activity", a: "c", y: 0.9 },
        { w: date, t: "Date", a: "c", y: 0.9 },
        { w: comments, t: "Comments", a: "c", y: 0.9 },
        blank(K_OUT),
      ],
    },
    ...items.map(
      (it): PaperRow => ({
        h: it.h,
        cells: [
          blank(K_IN),
          { w: no, col: "srNo", ln: it.ln, a: "c", y: 0.9 },
          { w: act, t: it.activity, x: 1.9, y: 0.9, lh: 5.1 },
          { w: date, col: "date", ln: it.ln, a: "c", vm: true },
          { w: comments, col: "comment", ln: it.ln, x: 1.2, y: 0.9, lh: 5.1, lines: true },
          blank(K_OUT),
        ],
      })
    ),
  ];
}

/** His activities and the height of each one's line (a line that wraps is 13.2 mm). */
const ACTIVITY_H: Record<number, number> = { 1: 13.3, 2: 8.0, 3: 8.2, 4: 8.1, 5: 8.1, 7: 8.1, 8: 8.1, 9: 8.1, 10: 13.2, 11: 8.1, 12: 13.3, 13: 8.1, 14: 8.1, 15: 13.2, 16: 8.2, 17: 8.1, 18: 8.1, 19: 8.1, 20: 8.1, 21: 8.1, 22: 8.2, 23: 8.2, 24: 13.2, 25: 8.1, 26: 8.1, 27: 8.1, 28: 8.1, 29: 8.0, 30: 8.2, 31: 8.7, 32: 8.2 };
/** Where his activity's words break onto a second line. */
const ACTIVITY_WORDS: Record<number, string> = {
  1: "Complaint details requested from customer\n(If not received)",
  8: " Production records verified",
  10: "Complaint samples received from customer\n(If required)",
  12: "Cross-functional investigation meeting\nconducted",
  15: "Responsible persons interviewed and\nstatements recorded",
  24: "Findings shared with\nMarketing/Coordination Team",
};

/** The checklist's paper, for the record's sections (A to E: their activities in the order the record keeps them). */
export function complaintChecklistPaper(sections: { key: string; title: string; items: { srNo: number; activity: string }[] }[]): PaperTable {
  let ln = 0;
  const lined = sections.map((s) => ({
    key: s.key,
    title: `${s.key}. ${s.title}`,
    items: s.items.map((it) => ({ ln: ln++, srNo: it.srNo, activity: ACTIVITY_WORDS[it.srNo] ?? it.activity, h: ACTIVITY_H[it.srNo] ?? 8.1 })),
  }));
  const section = (key: string) => lined.find((s) => s.key === key) ?? { key, title: key, items: [] };
  const [a, b, c, d, e] = ["A", "B", "C", "D", "E"].map(section);
  // His three tables' columns: A, B and C alike; D and E each their own.
  const ABC: [number, number, number, number] = [14.4, 75.0, 32.5, 52.5];
  const D: [number, number, number, number] = [14.4, 75.0, 44.0, 41.0];
  const E: [number, number, number, number] = [14.4, 76.9, 41.0, 42.1];
  const customer = (h: number, left: string, leftBox: string, right: string, rightBox: string): PaperRow => ({
    h,
    cells: [
      blank(K_IN),
      { w: 38.1, t: left, x: 1.9, y: 0.8, lh: 5.1 },
      { w: 58.8, box: leftBox, x: 1.5, vm: true },
      { w: 37.5, t: right, x: 1.9, y: 0.8 },
      { w: 40.0, box: rightBox, x: 1.5, vm: true },
      blank(K_OUT),
    ],
  });
  const approval = (label: string, left: string, right: string): PaperRow => ({
    h: 8.1,
    cells: [
      blank(K_IN),
      { w: 22.5, t: label, x: 1.9, y: 0.8, edges: "ltb" },
      { w: 61.9, box: left, x: 0.5, vm: true, edges: "rtb" },
      { w: 23.9, t: label === "Prepared By" ? "Approved By" : label, x: 1.9, y: 0.8, edges: "ltb" },
      { w: 58.6, box: right, x: 0.5, vm: true, edges: "rtb" },
      blank(K_W - K_IN - 22.5 - 61.9 - 23.9 - 58.6),
    ],
  });
  const heightOf = (rows: PaperRow[]) => rows.reduce((n, r) => n + r.h, 0);
  /** A page's rows down to its foot: the room left between them is his empty space above the foot (265.2 mm down). */
  const page = (n: number, rows: PaperRow[]): PaperRow[] => {
    const head = checklistHead(n);
    const above = 265.2 - 13.0 - heightOf(head) - heightOf(rows);
    return [...head, ...rows, gap(Math.max(1, Math.round(above * 100) / 100)), ...checklistFoot(n)];
  };
  const [first, ...rest] = page(1, [
    gap(8.3),
    customer(8.1, "Customer Name", "customerName", "Complaint No.", "complaintNo"),
    customer(8.1, "Job Name", "jobName", "Job Code", "jobCode"),
    customer(13.2, "Complaint Received\nDate", "complaintReceivedDate", "PO No.", "poNo"),
    gap(8.5),
    sectionTitle(6.5, a.title),
    ...sectionTable(ABC, 8.1, a.items),
    gap(9.1),
    sectionTitle(6.3, b.title),
    ...sectionTable(ABC, 8.1, b.items),
  ]);
  return {
    page: "portrait",
    left: 11.0,
    top: 13.0,
    font: "calibri",
    pt: K_PT,
    rules: "cells",
    ownWords: true,
    flows: true,
    fillA4: true,
    // His page border, a double line round every page: 8.5 to 201.4 mm across, 8.7 to 288.5 mm down.
    pageFrame: { l: 2.5, t: 4.3, w: 192.9, h: 279.8, double: true },
    head: [first],
    body: [
      ...rest,
      ...page(2, [
        gap(8.5),
        sectionTitle(6.7, c.title),
        ...sectionTable(ABC, 8.0, c.items),
        gap(8.8),
        sectionTitle(6.5, d.title),
        ...sectionTable(D, 8.1, d.items),
        gap(8.9),
        sectionTitle(6.5, e.title),
        ...sectionTable(E, 8.6, e.items),
      ]),
      ...page(3, [
        gap(8.7),
        sectionTitle(6.5, "APPROVAL"),
        gap(7.9),
        approval("Prepared By", "preparedBy.name", "approvedBy.name"),
        approval("Designation", "preparedBy.designation", "approvedBy.designation"),
        approval("Sign & Date", "preparedBy.date", "approvedBy.date"),
        gap(5.1),
        {
          h: 10.2,
          cells: [
            blank(K_IN),
            { w: K_W - K_IN, t: COMPLAINT_FOOTER_NOTE.replace("and timely closure", "and timely\nclosure"), x: 1.9, y: 0.9, lh: 5.1, edges: "" },
          ],
        },
      ]),
    ],
    foot: [],
  };
}

// ===========================================================================
// PEST CONTOL SERVICE - GAPS ANALYSIS REPORT (landscape, one page)
// ===========================================================================

/** His sheet's columns, 9.5 to 269.7 mm: S.No | Findings | Comments | By contractor | By Client | Target Date | Actual date | Verified. */
const G_COLS = [6.5, 45.2, 33.6, 46.9, 41.4, 22.6, 29.8, 34.2];
const G_W = G_COLS.reduce((a, b) => a + b, 0);
const G_LABEL = G_COLS[0] + G_COLS[1];
const G_VALUE = G_W - G_LABEL;
const G_PT = 7.8;
/** His five findings' rows: each as tall as he made it (the words of a finding wrap in it). */
const G_LINE_H = [16.9, 15.4, 18.6, 24.5, 21.5];

/** The report's paper, with as many findings' rows and general comments' lines as the record holds (his five rows and two lines at least). */
export function gapInspectionPaper(findings: number, comments: number): PaperTable {
  const commentLines = Math.max(2, comments);
  const word = (w: number, t: string, more: Partial<PaperCell> = {}): PaperCell => ({ w, t, b: true, x: 0.5, vm: true, ...more });
  return {
    page: "landscape",
    left: 9.5,
    top: 17.6,
    font: "calibri",
    pt: G_PT,
    rules: "cells",
    ownWords: true,
    fillA4: true,
    flows: true,
    head: [
      { h: 7.6, cells: [{ w: G_W, t: "Pest contol service - Gaps Analysis report", b: true, u: true, a: "c", vm: true }] },
      { h: 6.4, cells: [word(G_LABEL, "Date Of Inspection"), { w: G_VALUE, box: "inspectionDate", x: 0.5, vm: true }] },
      // The premises' name and address on his two lines.
      { h: 6.3, cells: [word(G_LABEL, "Name and Address of Premises Inspected", { rs: 2 }), { w: G_VALUE, box: "premisesName", b: true, x: 0.5, vm: true }] },
      { h: 5.7, cells: [{ w: G_LABEL, skip: true }, { w: G_VALUE, box: "premisesAddress", b: true, x: 0.5, vm: true }] },
      { h: 6.3, cells: [word(G_LABEL, "Contact Person"), { w: G_VALUE, box: "contactPerson", b: true, x: 0.5, vm: true }] },
    ],
    body: [
      {
        h: 3.5,
        head: true,
        cells: [
          { w: G_COLS[0], t: "S.No\n.", x: 0.7, y: 0.4, lh: 3.6, rs: 2 },
          word(G_COLS[1], "Findings of Inspection", { rs: 2 }),
          word(G_COLS[2], "Comments on Findings", { rs: 2 }),
          { w: G_COLS[3] + G_COLS[4], t: "Corrective Action to be Taken", b: true, a: "c", vm: true },
          { w: G_COLS[5], t: "Target Date by\nGP-3", b: true, a: "c", vm: true, lh: 3.6, rs: 2 },
          { w: G_COLS[6], t: "Actual date of action\ntaken", b: true, a: "c", vm: true, lh: 3.6, rs: 2 },
          { w: G_COLS[7], t: "Verified by Service provider", b: true, a: "c", vm: true, rs: 2 },
        ],
      },
      {
        h: 3.3,
        head: true,
        cells: [
          { w: G_COLS[0], skip: true },
          { w: G_COLS[1], skip: true },
          { w: G_COLS[2], skip: true },
          { w: G_COLS[3], t: "By Pest contol contractor", b: true, a: "c", vm: true },
          { w: G_COLS[4], t: "By Client", b: true, a: "c", vm: true },
          { w: G_COLS[5], skip: true },
          { w: G_COLS[6], skip: true },
          { w: G_COLS[7], skip: true },
        ],
      },
      // The findings: his five ruled rows, and one more for each finding past them.
      ...Array.from({ length: Math.max(5, findings) }, (_, ln): PaperRow => ({
        h: G_LINE_H[ln] ?? 16.9,
        line: ln,
        cells: [
          { w: G_COLS[0], col: "sNo", ln, a: "c", vm: true },
          { w: G_COLS[1], col: "findingOfInspection", ln, x: 0.5, vm: true, lines: true, lh: 3.55 },
          { w: G_COLS[2], col: "commentsOnFindings", ln, x: 0.5, vm: true, lines: true, lh: 3.55 },
          { w: G_COLS[3], col: "correctiveActionContractor", ln, a: "c", vm: true, lines: true, lh: 3.55 },
          { w: G_COLS[4], col: "correctiveActionClient", ln, x: 0.5, vm: true, lines: true, lh: 3.55 },
          { w: G_COLS[5], col: "targetDate", ln, a: "c", vm: true },
          { w: G_COLS[6], col: "actualDateOfAction", ln, a: "c", vm: true },
          { w: G_COLS[7], col: "verifiedByServiceProvider", ln, a: "c", vm: true },
        ],
      })),
      { h: 5.9, cells: [word(G_W, "GENERAL COMMENT ")] },
      ...Array.from({ length: commentLines }, (_, i): PaperRow => ({
        h: i === 0 ? 5.3 : 4.7,
        cells: [
          { w: G_COLS[0], t: String(i + 1), a: "c", vm: true, edges: i === 0 ? "ltrb" : "lrb" },
          { w: G_W - G_COLS[0], col: "generalComment", ln: i, x: 0.5, vm: true },
        ],
      })),
    ],
    foot: [],
  };
}
