// F/SYS/06 INTERNAL AUDIT SCHEDULE & PLAN DRAWN AS THE COMPANY'S OWN PAPER (REQUIREMENTS §326; the owner, 24-Nov-2026:
// "check the current format and drive format and make format like drive ... make it perfect format"). The page is the
// plan of audit 01/2025 in his Google Drive ("F-SYS-06-Internal Audit Plan (R).doc", the same page as
// source-documents/F-SYS-06-Internal Audit Plan (R).pdf), measured in mm off that PDF: the double page border, the
// three-line head, the Audit Sr. No. / Date / Audit Team Leader table, the auditors' table, the paragraph, the plan table,
// AUDIT SUMMARY and its table, "Verified By:". Calibri 10 pt, the head 13 pt.
//
// DCRS used to draw this format as one 13-column grid (the plan's columns and the summary's side by side). The paper keeps
// the record's boxes and grid exactly (data/seed/sysInternalAuditLayouts.ts): the plan table writes the grid's function,
// auditDate, auditTime, auditors, auditee and acknowledge; the summary table writes the same lines' summaryName, criticalNc
// ... minorStatus; so audit 01/2025 reads on as it was written. Every printed word is the record's to type over
// (ownWords, as the HR papers, §275), and any row of the three tables may be added or taken off (§276).
//
// As the page, and left as it is: two lines in each table (a row put in adds one); the Minor NC cells of the summary's
// second line are split in two on the page (4.2.1 over 4.7.6) — one cell here holds both ("4.2.1, 4.7.6"); the dotted
// rules between the auditors' lines are drawn solid.

import type { PaperCell, PaperRow, PaperTable } from "./qcPaperTables";

/** The tables' width: 12.2 mm to 196.9 mm on the page. */
const W = 184.7;
/** The pitch of two lines in one cell, as Word spaces Calibri 10 pt on the page. */
const L = 6.45;

const gap = (h: number): PaperRow => ({ h, cells: [{ w: W, t: "", edges: "" }] });

// The head: 16.3 mm to 192.5 mm, narrower than the tables under it.
const HEAD_IN = 4.1;
const HEAD_W = 176.2;
const HEAD_OUT = W - HEAD_IN - HEAD_W;
const headRow = (h: number, cells: PaperCell[]): PaperRow => ({
  h,
  cells: [{ w: HEAD_IN, t: "", edges: "" }, ...cells, { w: HEAD_OUT, t: "", edges: "" }],
});

const HEAD: PaperRow[] = [
  headRow(11.8, [{ w: HEAD_W, t: "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED", b: true, a: "c", pt: 13, y: 4.3 }]),
  headRow(11.8, [{ w: HEAD_W, t: "INTERNAL AUDIT SCHEDULE & PLAN", a: "c", pt: 13, y: 4.3 }]),
  headRow(7.0, [
    { w: 52.5, t: "Format No.: F/SYS/06", x: 1.9, y: 2.2 },
    { w: 39.7, t: "Rev No: 01", a: "c", y: 2.2 },
    { w: 41.3, t: "Date: 01.03.2023", a: "c", y: 2.1 },
    { w: 42.7, t: "Page No.: 1 Of 1", x: 1.7, y: 2.1 },
  ]),
];

/** Audit Sr. No. and Date, the Audit Team Leader under them across the table. */
const auditRows: PaperRow[] = [
  {
    h: 6.7,
    cells: [
      { w: 88.8, b: true, x: 2.0, y: 1.0, sentence: { before: "Audit Sr. No.:", box: "auditSrNo", after: "", boxWidth: 40, pw: true } },
      { w: W - 88.8, b: true, x: 2.0, y: 1.0, sentence: { before: "Date:", box: "date", after: "", boxWidth: 30, pw: true } },
    ],
  },
  {
    h: 6.6,
    cells: [{ w: W, b: true, x: 2.0, y: 0.9, sentence: { before: "Audit Team Leader:", box: "auditTeamLeader", after: "", boxWidth: 120, pw: true } }],
  },
];

/** The auditors: Sr. No. | Auditor’s Name | Department. */
const AU = [12.1, 95.4, W - 12.1 - 95.4];
const auditorRows: PaperRow[] = [
  {
    h: 13.0,
    head: true,
    cells: [
      { w: AU[0], t: "Sr.\nNo.", b: true, a: "c", y: 0.8, lh: L },
      { w: AU[1], t: "Auditor’s Name", b: true, x: 2.0, y: 2.9 },
      { w: AU[2], t: "Department", b: true, x: 1.9, y: 2.9 },
    ],
  },
  ...[1, 2].map((n): PaperRow => ({
    h: 8.0,
    cells: [
      { w: AU[0], t: `${n}.`, x: 8.4, y: 0.9 },
      { w: AU[1], box: `auditor${n}Name`, x: 2.0, y: 1.6, lines: true, grow: true },
      { w: AU[2], box: `auditor${n}Department`, x: 1.9, y: 1.6, lines: true, grow: true },
    ],
  })),
];

const PARAGRAPH =
  "The Internal Quality Audit for BRCGS - Packaging standards (Issue 06) shall be conducted as per the Audit Plan mentioned below. All concerned personnel are requested to co-operate auditors during the audit. Management Representative communicates any change in Audit Plan to the respective personnel.";

/** The plan: Sr. No. | Function | Audit Date | Audit Time | Auditors | Auditee | Acknowledge. */
const PL = [15.1, 44.6, 20.8, 20.4, 28.9, 29.5, W - 15.1 - 44.6 - 20.8 - 20.4 - 28.9 - 29.5];
const PLAN_COLS = ["function", "auditDate", "auditTime", "auditors", "auditee", "acknowledge"];
const planRows: PaperRow[] = [
  {
    h: 13.1,
    head: true,
    cells: [
      { w: PL[0], t: "Sr.\nNo.", b: true, a: "c", y: 1.0, lh: L },
      ...["Function", "Audit\nDate", "Audit Time", "Auditors", "Auditee", "Acknowledge"].map((t, i): PaperCell => ({ w: PL[i + 1], t, b: true, x: 1.9, y: 1.0, lh: L })),
    ],
  },
  ...[14.8, 26.0].map((h, ln): PaperRow => ({
    h,
    cells: [
      { w: PL[0], t: `${ln + 1}.`, b: true, x: 4.4, y: 1.0 },
      // (the Audit Date is one line, and prints as the sheet writes dates: it does not grow its row)
      // (one Audit Date for the whole plan, the first line's, in one box down both lines - the owner, 26-Nov-2026, §392/§393:
      //  "the date should be one for the whole, dont give the option to enter 2 dates")
      ...PLAN_COLS.map((col, i): PaperCell =>
        col === "auditDate"
          ? ln === 0
            ? { w: PL[i + 1], col, ln, a: "c", y: 1.0, rs: 2, once: true } // (at the top, level with line 1's words, §394)
            : { w: PL[i + 1], skip: true }
          : { w: PL[i + 1], col, ln, x: 1.9, y: 1.0, lh: L, lines: true, grow: true }
      ),
    ],
  })),
];

/** The summary: Sr. No. | Dept. Name/Clause Name | No. of Critical NC | Status | No. of Major NC | Status | No. of Minor NC | Status. */
const SU = [10.8, 44.4, 22.8, 19.8, 22.8, 21.3, 22.8, W - 10.8 - 44.4 - 22.8 - 19.8 - 22.8 - 21.3 - 22.8];
const SUMMARY_COLS = ["criticalNc", "criticalStatus", "majorNc", "majorStatus", "minorNc", "minorStatus"];
const summaryRows: PaperRow[] = [
  {
    h: 13.1,
    head: true,
    cells: [
      { w: SU[0], t: "Sr.\nNo.", b: true, a: "c", vm: true, lh: L },
      { w: SU[1], t: "Dept. Name/Clause Name", b: true, a: "c", vm: true },
      ...["No. of\nCritical NC", "Status", "No. of Major\nNC", "Status", "No. of Minor\nNC", "Status"].map((t, i): PaperCell => ({ w: SU[i + 2], t, b: true, a: "c", vm: true, lh: L })),
    ],
  },
  ...[19.5, 13.3].map((h, ln): PaperRow => ({
    h,
    cells: [
      { w: SU[0], t: `${ln + 1}.`, b: true, x: 2.4, vm: true },
      { w: SU[1], col: "summaryName", ln, x: 2.0, vm: true, lh: L, lines: true, grow: true },
      ...SUMMARY_COLS.map((col, i): PaperCell => ({ w: SU[i + 2], col, ln, a: "c", vm: true, lh: L, lines: true, grow: true })),
    ],
  })),
];

export const AUDIT_PLAN_PAPER: PaperTable = {
  page: "portrait",
  left: 12.2,
  top: 12.7,
  font: "calibri",
  pt: 10,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  flows: true,
  // The page's double border: 8.5 mm to 201.1 mm across, 8.5 mm to 288.0 mm down.
  pageFrame: { l: 3.7, t: 4.2, w: 192.6, h: 279.5, double: true },
  head: HEAD,
  body: [
    gap(4.5),
    ...auditRows,
    gap(6.7),
    ...auditorRows,
    { h: 19.4, cells: [{ w: W, t: PARAGRAPH, a: "j", x: 2.0, y: 0.8, lh: L, ww: 181.7, edges: "" }] },
    ...planRows,
    { h: 19.6, cells: [{ w: W, t: "AUDIT SUMMARY", b: true, a: "c", y: 7.4, edges: "" }] },
    ...summaryRows,
  ],
  // (his "Verified By: ____" under the summary is taken off the paper - the owner, 26-Nov-2026, §392; the record keeps its box)
  offPaper: ["verifiedBy"],
  foot: [],
};
