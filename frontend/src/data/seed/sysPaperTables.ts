// F/SYS/04 AND F/SYS/04-A DRAWN AS THE COMPANY'S OWN PAPERS (REQUIREMENTS §325; the owner, 24-Nov-2026: "i want this format
// perfectly in system", the July 2025 Word file in his Google Drive). Measured in mm off the PDF of that file
// (source-documents/F-SYS-04-Management review meeting agenda & Record_July 2025.pdf, 9 pages; F-SYS-04A-..._July2025.pdf,
// 1 page): the three-line head on every page, the meeting and its attendance, the eleven agenda items each in its numbered
// block, item 1's follow-up table, item 8's objectives table, the New Action Item Detail table. Every printed word is the
// record's to type over (ownWords, as the HR papers, §275); the meeting's own words are the record's boxes, the same boxes
// as before (data/seed/sysManagementReviewLayouts.ts), so the meeting of 21.07.2025 reads on as it was written.
//
// The owner's choices (24-Nov-2026, "Yes, as proposed"): the paper's own wording kept exactly as written; the Sign column
// left empty for a hand signature; each Discussion Results a tick box with the three results the pages print; item 1 takes
// the last meeting's New Action Items (autoFill.fromPrevious); the yellow of item 8 not reproduced.

import type { PaperCell, PaperPick, PaperRow, PaperTable } from "./qcPaperTables";

/** The table's width: 7.9 mm to 206.3 mm on the paper's page. */
const W = 198.4;
/** The item number's column, and the item's own column beside it. */
const N = 7.9;
const C = W - N;
/** One line of the body's 11 pt Calibri, as Word spaces them on the paper. */
const L = 7.1;

// --------------------------------------------------------------------------------------------------------------------
// THE HEAD: company and period, title and meeting date, the format line. Every page prints it; page 1's boxes are the
// record's, the later pages print their words again (sentence.copy) and share page 1's printed words (pl).
// --------------------------------------------------------------------------------------------------------------------

function pageHead(title: string, formatNo: string, opts: { period?: boolean; date?: boolean; first: boolean; pages: number }): PaperRow[] {
  const copy = opts.first ? {} : { copy: true as const };
  const pl = (p: string) => (opts.first ? {} : { pl: p });
  const company: PaperCell = opts.period
    ? { w: W, a: "c", b: true, u: true, pt: 12, y: 4.8, ...pl("0:0"), sentence: { before: "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED", box: "reviewPeriod", after: "", boxWidth: 44, pw: true, ...copy } }
    : { w: W, a: "c", b: true, u: true, pt: 12, y: 4.8, t: "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED", ...pl("0:0") };
  const heading: PaperCell = opts.date
    ? { w: W, a: "c", b: true, u: true, pt: 12, y: 4.8, ...pl("1:0"), sentence: { before: title, box: "meetingDate", after: "", boxWidth: 24, pw: true, copy: true } }
    : { w: W, a: "c", b: true, u: true, pt: 12, y: 4.8, t: title, ...pl("1:0") };
  return [
    { h: 12.4, cells: [company], ...(opts.first ? {} : { pb: true as const }) },
    { h: 12.4, cells: [heading] },
    {
      h: 7.4,
      cells: [
        { w: 47.4, t: `Format No.: ${formatNo}`, pt: 10, x: 2.6, y: 2.4, ...pl("2:0") },
        { w: 55.3, t: "Rev No: 01", a: "c", pt: 10, y: 2.4, ...pl("2:1") },
        { w: 50.5, t: "Date: 01.04.2025", a: "c", pt: 10, y: 2.1, ...pl("2:2") },
        { w: 45.2, t: `Page No.: 1 Of ${opts.pages}`, a: "c", pt: 10, y: 2.1, ...pl("2:3") },
      ],
    },
  ];
}

/** A strip with no rules between the head and the page's first table. */
const gap = (h: number): PaperRow => ({ h, cells: [{ w: W, t: "", edges: "" }] });

// --------------------------------------------------------------------------------------------------------------------
// AN AGENDA ITEM: its number down the left column, its heading (part of it bold, as printed), who reports it, what it
// reviews, its discussion and its result, one block with no rules inside it.
// --------------------------------------------------------------------------------------------------------------------

const RESULTS = ["No action required", "Action required", "Effective – No action required"];
const picks = (box: string): PaperPick[] => RESULTS.map((value) => ({ box, value, word: value, mark: "check" as const }));

interface Item {
  no: number;
  /** The heading: its plain start, its bold words, its plain end ("(Internal, External, ...)"). */
  heading: [string, string, string];
  headingLines: number;
  responsibility?: string;
  reviewed: string;
  reviewedLines?: number;
  /** Items 10 and 11 print "□ Discussion Results:" over their points, and again before the result. */
  discussionLabel?: string;
  /** The discussion's height on the paper (mm); none: item 1, whose follow-up table stands there. */
  discussion?: number;
  result: string;
  /** Rows of the item's own between what it reviews and its result (item 1's follow-up table). */
  middle?: PaperRow[];
  /** Item 8: the result is not drawn here; it follows the objectives table. */
  noResult?: true;
}

/** The room left on the item's line after its bold label (11 pt Calibri bold, about 1.95 mm a letter). */
const after = (label: string): number => Math.round((C - 6 - label.length * 1.95) * 10) / 10;

/** The left column's cell on the item's row: the number on the first, open between. */
const numCell = (no: number, first: boolean, last: boolean): PaperCell => ({
  w: N,
  ...(first ? { t: String(no), b: true as const, x: 1.9, y: 1.0 } : { t: "" }),
  edges: `l${first ? "t" : ""}r${last ? "b" : ""}`,
});

/** The item's column on one row: ruled at its sides, at its top on the item's first row and at its foot on its last. */
const side = (first: boolean, last: boolean): string => `l${first ? "t" : ""}r${last ? "b" : ""}`;

function itemRows(it: Item): PaperRow[] {
  type Part = { h: number; cells: (edges: string) => PaperCell[]; rowKey?: string } | PaperRow;
  const parts: Part[] = [];
  const [pre, bold, post] = it.heading;
  parts.push({
    h: L * it.headingLines,
    cells: (e) => [{ w: C, t: `${pre}${bold}${post}`, bs: [pre.length, pre.length + bold.length], lh: L, x: 2.0, y: 1.0, edges: e }],
  });
  if (it.responsibility)
    parts.push({
      h: L,
      cells: (e) => [{ w: C, b: true, x: 2.0, y: 1.0, edges: e, sentence: { before: it.responsibility!, box: `item${it.no}Responsibility`, after: "", boxWidth: after(it.responsibility!), pw: true } }],
    });
  parts.push({
    h: L * (it.reviewedLines ?? 1),
    cells: (e) => [{ w: C, b: true, x: 2.0, y: 1.0, lh: L, edges: e, sentence: { before: it.reviewed, box: `item${it.no}Reviewed`, after: "", boxWidth: after(it.reviewed), pw: true } }],
  });
  if (it.discussionLabel) parts.push({ h: L, cells: (e) => [{ w: C, t: it.discussionLabel!, bs: [2, it.discussionLabel!.length], x: 2.0, y: 1.0, edges: e }] });
  if (it.discussion !== undefined) parts.push({ h: it.discussion, cells: (e) => [{ w: C, box: `item${it.no}Discussion`, lines: true, grow: true, x: 2.0, lh: L, edges: e }] });
  const rows: PaperRow[] = [];
  const all: Part[] = [...parts, ...(it.middle ?? [])];
  if (!it.noResult)
    all.push({
      h: 7.6,
      cells: (e) => [
        { w: 38, t: it.result, bs: [it.result.startsWith("□") ? 2 : 0, it.result.length], x: 2.0, y: 1.2, edges: e.replace("r", "") },
        { w: C - 38, pick: picks(`item${it.no}Result`), x: 1.0, y: 1.2, edges: e.replace("l", "") },
      ],
    });
  all.forEach((p, i) => {
    const first = i === 0;
    const last = i === all.length - 1;
    if ("cells" in p && typeof p.cells === "function") {
      rows.push({ h: p.h, cells: [numCell(it.no, first, last), ...p.cells(side(first, last))], ...(p.rowKey ? { rowKey: p.rowKey } : {}) });
    } else {
      // A row of the item's own table: the left column carries on beside it.
      const row = p as PaperRow;
      rows.push({ ...row, cells: [numCell(it.no, first, last), ...row.cells] });
    }
  });
  return rows;
}

/**
 * Every row a person may add a row under or delete (the owner's HR rule, §276, kept here): each its own key, unless it is
 * the head printed again on a page, a heading, a blank strip, or the second row of a unit held by a cell running down.
 */
function keyed(rows: PaperRow[], prefix: string): PaperRow[] {
  return rows.map((r, i) => {
    const repeatedHead = r.pb || r.cells.some((c) => c.pl);
    const strip = r.cells.length === 1 && r.cells[0].t === "" && r.cells[0].edges === "";
    const continued = r.cells.some((c) => c.skip);
    return r.rowKey || r.head || repeatedHead || strip || continued ? r : { ...r, rowKey: `${prefix}${i}` };
  });
}

// --------------------------------------------------------------------------------------------------------------------
// F/SYS/04
// --------------------------------------------------------------------------------------------------------------------

const MRM_TITLE = "MANAGEMENT REVIEW MEETING RECORD – BRCGS PACKAGING (ISSUE 7) –";
const MRM_PAGES = 9;
const mrmHead = (first: boolean) => pageHead(MRM_TITLE, "F/SYS/04", { period: true, date: true, first, pages: MRM_PAGES });

/** The meeting, its purpose and who must attend: one table under the head on page 1. */
const meetingRows: PaperRow[] = [
  {
    h: 8.4,
    cells: [
      { w: 50, b: true, x: 1.9, y: 4.0, edges: "ltb", sentence: { before: "Meeting Date:", box: "meetingDate", after: "", boxWidth: 24 } },
      { w: 37.4, x: 0, y: 4.0, b: true, edges: "trb", box: "meetingTime" },
      { w: W - 87.4, b: true, x: 1.9, y: 4.0, edges: "ltrb", sentence: { before: "Meeting Title:", box: "meetingTitle", after: "", boxWidth: 82, pw: true } },
    ],
  },
  {
    h: 12.1,
    cells: [
      { w: 17, t: "Purpose:", b: true, pt: 11, x: 1.9, y: 1.1, edges: "lb" },
      { w: W - 17, box: "purpose", lines: true, grow: true, pt: 11, x: 0.5, lh: 4.8, edges: "rb" },
    ],
  },
  {
    h: 9.5,
    cells: [
      { w: 38, t: "Required Attendance:", b: true, pt: 10, x: 1.9, y: 3.4, edges: "lb" },
      { w: W - 38, box: "requiredAttendance", lines: true, grow: true, pt: 10, x: 0.5, y: 3.4, edges: "rb" },
    ],
  },
];

/** The attendance table: Name, Designation and Sign twice across, four people down each half. */
const ATT = [42.8, 33.1, 21.0, 39.0, 37.5, 25.0];
const attendanceRows: PaperRow[] = [
  {
    h: 7.0,
    // (not marked a heading: a register's later page repeats its own headings, never this table's)
    cells: ["Name", "Designation", "Sign", "Name", "Designation", "Sign"].map((t, i): PaperCell => ({ w: ATT[i], t, b: true, a: "c", pt: 10, y: 2.2 })),
  },
  ...[1, 2, 3, 4].map((n): PaperRow => ({
    h: n > 2 ? 8.8 : 7.0,
    rowKey: `attendance${n}`,
    cells: [
      { w: ATT[0], box: `attendance${n}Name`, b: true, pt: 10, x: 1.0, vm: true },
      { w: ATT[1], box: `attendance${n}Designation`, b: true, pt: 10, x: 1.0, vm: true, lines: true },
      { w: ATT[2], t: "" },
      { w: ATT[3], box: `attendance${n + 4}Name`, b: true, pt: 10, x: 1.0, vm: true },
      { w: ATT[4], box: `attendance${n + 4}Designation`, b: true, pt: 10, x: 1.0, vm: true, lines: true },
      { w: ATT[5], t: "" },
    ],
  })),
];

/** Item 1's table: the last meeting's action items, each with its status, when and who (two lines of the paper each). */
const FU = [20.5, 112.5, C - 133];
const followUpRows: PaperRow[] = [1, 2].flatMap((n): PaperRow[] => [
  {
    h: L,
    rowKey: `item1Line${n}`,
    cells: [
      { w: FU[0], t: String(n), a: "c", y: 1.0, rs: 3, edges: "ltrb" },
      { w: FU[1], x: 2.0, y: 1.0, lh: L, rs: 2, edges: "ltr", sentence: { before: "Action item:", box: `item1Line${n}Action`, after: "", boxWidth: 88, pw: true } },
      { w: FU[2], x: 2.0, y: 1.0, edges: "ltr", sentence: { before: "When:", box: `item1Line${n}When`, after: "", boxWidth: 30, pw: true } },
    ],
  },
  {
    h: L,
    cells: [
      { w: FU[0], t: "", skip: true },
      { w: FU[1], t: "", skip: true },
      { w: FU[2], x: 2.0, y: 1.0, lh: L, rs: 2, edges: "lrb", sentence: { before: "Who:", box: `item1Line${n}Who`, after: "", boxWidth: 44, pw: true } },
    ],
  },
  {
    h: 7.3,
    cells: [
      { w: FU[0], t: "", skip: true },
      { w: FU[1], b: true, x: 2.0, y: 0.5, edges: "lrb", sentence: { before: "Status :", box: `item1Line${n}Status`, after: "", boxWidth: 60, pw: true } },
      { w: FU[2], t: "", skip: true },
    ],
  },
]);

const RESP = "Reporting Responsibility / Process Owner:";
const RESULT = "Discussion Results:";

const MRM_ITEMS: Item[] = [
  { no: 1, heading: ["□ ", "Follow up action items from previous management review meeting", ""], headingLines: 1, responsibility: RESP, reviewed: "Items/records to be reviewed:", result: RESULT, middle: followUpRows },
  {
    no: 2,
    heading: ["□ ", "Results of Internal, second – Party & Third – party Audits performed during the time period ", "(Internal, External, Customer, Compliance etc.)"],
    headingLines: 2,
    responsibility: RESP,
    reviewed: "Items/records to be reviewed:",
    discussion: 107.4,
    result: RESULT,
  },
  {
    no: 3,
    heading: ["□ ", "Customer performance indicator, complaints & feedback ", "(surveys, concerns, complaints, positives, customer visits)"],
    headingLines: 1,
    responsibility: RESP,
    reviewed: "Items/records reviewed:",
    discussion: 37.0,
    result: RESULT,
  },
  {
    no: 4,
    heading: ["", "Review of Hazard & Risk management (HARA) system (", "Review of HACCP Plan, CCP monitoring, CCP deviation, Pre-requisite status)"],
    headingLines: 2,
    responsibility: RESP,
    reviewed: "Items/records reviewed:",
    reviewedLines: 2,
    discussion: 87.0,
    result: RESULT,
  },
  { no: 5, heading: ["□ ", "Impact of any applicable legislative & certification scheme changes", ""], headingLines: 1, responsibility: RESP, reviewed: "Items/records reviewed:", discussion: 65.8, result: RESULT },
  {
    no: 6,
    heading: [
      "",
      "Incidents, corrective actions, out of specification results & non-conforming products (",
      "Review of Product safety incidents, corrective actions for process non-conformity, OOS & NC products identified as Incoming inspection stage & In-process stage, Product recall, Product Withdrawal, effectiveness of Mock recall etc.)",
    ],
    headingLines: 3,
    responsibility: RESP,
    reviewed: "Items/records reviewed:",
    discussion: 101.6,
    result: RESULT,
  },
  { no: 7, heading: ["", "Resources requirements ", "(Resource such as – manpower, CEO (Shail Patel)"], headingLines: 1, reviewed: "Items/records reviewed:", discussion: 3.0, result: RESULT },
  {
    no: 8,
    heading: ["", "Site’s performance against the standard & objectives set (", "Review of Quality & Product safety objectives and targets)"],
    headingLines: 1,
    responsibility: RESP,
    reviewed: "Items/records reviewed:",
    discussion: 66.4,
    result: RESULT,
    noResult: true,
  },
  {
    no: 9,
    heading: ["", "Effectiveness of Product defense (TACCP), Product fraud prevention plans (VACCP), Product safety and Quality culture plans", ""],
    headingLines: 2,
    responsibility: RESP,
    reviewed: "Items/records reviewed:",
    discussion: 65.7,
    result: RESULT,
  },
  {
    no: 10,
    heading: ["□ ", "Adequacy and awareness of Various Policies (Quality & Product Safety Policy, PRP Polices etc.), Product safety culture", ""],
    headingLines: 2,
    responsibility: "□ Reporting Responsibility:",
    reviewed: "□ Documented information reviewed:",
    discussionLabel: "□ Discussion Results:",
    discussion: 37.0,
    result: "□ Discussion Results:",
  },
  {
    no: 11,
    heading: ["□ ", "Usage & compliance of BRCGS Logo (V-card, Website, Letterhead, Email signature, Product packaging etc.)", ""],
    headingLines: 1,
    responsibility: "□ Reporting Responsibility:",
    reviewed: "□ Documented information reviewed:",
    discussionLabel: "□ Discussion Results:",
    discussion: 22.5,
    result: "□ Discussion Results:",
  },
];
const mrmItem = (no: number): Item => MRM_ITEMS[no - 1];

/** Item 8's objectives table, inside the item's column: a strip, Sr. no., the four columns, a strip. */
const OBJ = [2.0, 15.6, 80.4, 25.3, 25.7, C - 2.0 - 15.6 - 80.4 - 25.3 - 25.7 - 2.1, 2.1];
const objectivesHeading: PaperRow = {
  h: 35.5,
  head: true,
  cells: [
    numCell(8, false, false),
    { w: OBJ[0], t: "", edges: "" },
    { w: OBJ[1], t: "Sr. no.", x: 1.0, y: 1.0 },
    { w: OBJ[2], t: "Objective description", x: 1.0, y: 1.0 },
    { w: OBJ[3], t: "Achieved for\ncurrent\nreview\nperiod\n(Jan to June)", x: 1.0, y: 1.0, lh: L },
    { w: OBJ[4], t: "Revised\ntarget for\nnext period\nof review\n(June ~ Dec)", x: 1.0, y: 1.0, lh: L },
    { w: OBJ[5], t: "Justification for\nrevision of Target\nvalue of objective", x: 1.0, y: 1.0, lh: L },
    { w: OBJ[6], t: "", edges: "" },
  ],
};

/** The New Action Item Detail table at the foot of the last page. */
const NA = [15.9, 112.7, W - 15.9 - 112.7];
const newActionRows: PaperRow[] = [
  {
    h: 11.8,
    head: true,
    cells: [
      { w: NA[0], t: "Agenda\nItem\nRef.#", b: true, a: "c", pt: 9, lh: 3.8, y: 0.6 },
      { w: NA[1] + NA[2], t: "New Action Item Detail", b: true, a: "c", pt: 9, y: 4.4 },
    ],
  },
  ...[1, 2].flatMap((n): PaperRow[] => [
    {
      h: 7.2,
      rowKey: `newAction${n}`,
      cells: [
        { w: NA[0], x: 1.0, y: 1.0, rs: 2, sentence: { before: `${n}.`, box: `newAction${n}Ref`, after: "", boxWidth: 9 } },
        { w: NA[1], x: 2.0, y: 1.0, rs: 2, lh: L, sentence: { before: "Action item:", box: `newAction${n}Item`, after: "", boxWidth: 88, pw: true } },
        { w: NA[2], x: 2.0, y: 1.0, edges: "ltr", sentence: { before: "When:", box: `newAction${n}When`, after: "", boxWidth: 30, pw: true } },
      ],
    },
    {
      h: 7.2,
      cells: [
        { w: NA[0], t: "", skip: true },
        { w: NA[1], t: "", skip: true },
        { w: NA[2], x: 2.0, y: 0.5, edges: "lrb", sentence: { before: "Who:", box: `newAction${n}Who`, after: "", boxWidth: 44, pw: true } },
      ],
    },
  ]),
];

/** Item 8's result, after its table: the foot of the item's block. */
const item8Result: PaperRow = {
  h: 7.6,
  cells: [
    numCell(8, false, true),
    { w: 38, t: RESULT, bs: [0, RESULT.length], x: 2.0, y: 1.2, edges: "lb" },
    { w: C - 38, pick: picks("item8Result"), x: 1.0, y: 1.2, edges: "rb" },
  ],
};

const MRM_PAPER: PaperTable = {
  page: "portrait",
  left: 7.9,
  top: 7.6,
  font: "calibri",
  pt: 11,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  flows: true,
  head: mrmHead(true),
  body: keyed([
    gap(8.6),
    ...meetingRows,
    gap(4.2),
    ...attendanceRows,
    gap(4.5),
    ...itemRows(mrmItem(1)),
    ...mrmHead(false),
    gap(4.5),
    ...itemRows(mrmItem(2)),
    ...itemRows(mrmItem(3)),
    ...mrmHead(false),
    gap(4.5),
    ...itemRows(mrmItem(4)),
    ...mrmHead(false),
    gap(4.5),
    ...itemRows(mrmItem(5)),
    ...mrmHead(false),
    gap(4.5),
    ...itemRows(mrmItem(6)),
    ...itemRows(mrmItem(7)),
    ...mrmHead(false),
    gap(4.5),
    ...itemRows(mrmItem(8)),
    objectivesHeading,
  ], "b"),
  // The objectives, one line each; the record may add or take off a line.
  lines: {
    h: 7.3,
    count: 19,
    cells: [
      { w: N, t: "", edges: "lr" },
      { w: OBJ[0], t: "", edges: "" },
      { w: OBJ[1], num: "all", numFmt: "dot", a: "c", x: 1.0, y: 1.0 },
      { w: OBJ[2], col: "objective", x: 1.0, y: 1.0, lh: 4.6, lines: true, grow: true },
      { w: OBJ[3], col: "achieved", x: 1.0, y: 1.0, lh: 4.6, lines: true, grow: true },
      { w: OBJ[4], col: "revisedTarget", x: 1.0, y: 1.0, lh: 4.6, lines: true, grow: true },
      { w: OBJ[5], col: "justification", x: 1.0, y: 1.0, lh: 4.6, lines: true, grow: true },
      { w: OBJ[6], t: "", edges: "" },
    ],
  },
  foot: keyed([
    item8Result,
    ...mrmHead(false),
    gap(4.5),
    ...itemRows(mrmItem(9)),
    ...itemRows(mrmItem(10)),
    ...mrmHead(false),
    gap(4.5),
    ...itemRows(mrmItem(11)),
    gap(14.3),
    ...newActionRows,
  ], "f"),
};

// --------------------------------------------------------------------------------------------------------------------
// F/SYS/04-A: the notice that calls the meeting, one page.
// --------------------------------------------------------------------------------------------------------------------

const AG = [20.0, 56.9, 73.2, W - 20.0 - 56.9 - 73.2];

/** The eleven agenda points as printed: the number, the bold heading, its plain bracket. */
const AGENDA_POINTS: [string, string, number][] = [
  ["Follow up action items from previous management review meeting", "", 1],
  ["Results of Audits performed during the time period ", "(Internal, 2nd Party (Customers) & 3rd Party (Certification body)", 1],
  ["Customer performance Indicators (", "Formal customer feedback results, complaints, informal/formal feedback if any)", 1],
  ["Effectiveness of HARA system (", "HARA Review summary, On-site verification of PFC, Review of HACCP Plan, CCP monitoring, CCP deviation, Pre-requisite status)", 2],
  ["Impact of any applicable legislative and certification scheme changes ", "(BRCGS Participate review, Legal requirement updates & its implication for implementation)", 2],
  [
    "any product safety incidents, corrective actions, out-of-specification results and non-conforming materials ",
    "(Any incidents of glass breakage or sharp implements contamination or product contamination, OOS results where investigation done to determine the error in testing method or test results, NC products at Incoming/WIP & FG stage)",
    3,
  ],
  ["Resource requirements ", "(Manpower, Machinery, Test equipments, Infrastructure modifications, Financial etc.)", 1],
  ["Status of monitoring of Quality & Product safety objectives ", "(if not met, reasons, action plan & need for revision)", 1],
  ["Effectiveness of Product defense (TACCP) and product fraud prevention plans (VACCP), Review of Product safety culture Plan", "", 2],
  ["Adequacy and awareness of Various Policies (Quality & Product Safety Policy, PRP Polices etc.)", "", 1],
  ["Usage & compliance of BRCGS Logo (V-card, Website, Letterhead, Email signature, Product packaging etc.)", "", 1],
];

const AGENDA_PAPER: PaperTable = {
  page: "portrait",
  left: 7.9,
  top: 7.6,
  font: "calibri",
  pt: 11,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  flows: true,
  head: pageHead("AGENDA FOR BRCGS PACKAGING (ISSUE 7) MANAGEMENT REVIEW MEETING RECORD", "F/SYS/04-A", { first: true, pages: 1 }),
  body: [
    gap(4.5),
    { h: L, cells: [{ w: W, b: true, x: 1.0, y: 1.0, edges: "", sentence: { before: "Date of Notification : -", box: "dateOfNotification", after: "", boxWidth: 30 } }] },
    { h: L, cells: [{ w: W, b: true, x: 1.0, y: 1.0, edges: "", sentence: { before: "Planned date of Management review meeting:", box: "plannedDate", after: "", boxWidth: 30 } }] },
    { h: L, cells: [{ w: W, b: true, x: 1.0, y: 1.0, edges: "", sentence: { before: "Location & Timing –", box: "locationTiming", after: "", boxWidth: 120, pw: true } }] },
    {
      h: 7.2,
      head: true,
      cells: [
        { w: AG[0], t: "Sr.No.", b: true, a: "c", y: 1.3 },
        { w: AG[1], t: "Name of Participants", b: true, x: 2.0, y: 1.3 },
        { w: AG[2], t: "Designation", b: true, x: 2.0, y: 1.3 },
        { w: AG[3], t: "Signature", b: true, a: "c", y: 1.3 },
      ],
    },
  ],
  lines: {
    h: 8.35,
    count: 8,
    cells: [
      { w: AG[0], num: "all", numFmt: "pad2", b: true, a: "c", vm: true },
      { w: AG[1], col: "name", b: true, x: 2.0, vm: true },
      { w: AG[2], col: "designation", b: true, x: 2.0, vm: true },
      { w: AG[3], col: "signature", x: 2.0, vm: true },
    ],
  },
  foot: keyed([
    { h: 8.0, cells: [{ w: W, t: "Agenda Points for MRM meeting", b: true, x: 0, y: 2.7, edges: "" }] },
    ...AGENDA_POINTS.map(([bold, plain, lines], i): PaperRow => ({
      h: L * lines,
      cells: [
        { w: 8.0, t: `${i + 1}.`, b: true, x: 0.1, y: 1.0, lh: L, edges: "" },
        { w: W - 8.0, t: `${bold}${plain}`, bs: [0, bold.length], x: 0, y: 1.0, lh: L, edges: "" },
      ],
    })),
  ], "f"),
};

export const SYS_PAPER_TABLES: Record<string, PaperTable> = {
  "sys-mrm-record": MRM_PAPER,
  "sys-mrm-agenda": AGENDA_PAPER,
};
