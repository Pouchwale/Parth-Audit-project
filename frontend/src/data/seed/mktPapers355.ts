// F/MKT/02 AND F/MKT/04 DRAWN AS THE OWNER'S OWN PAPERS (REQUIREMENTS §372; F/MKT/01 is §322's, mktPaperTables.ts).
//
//   F/MKT/02 Customer Feedback analysis: his Excel sheet as it prints (F-MKT-02_Customer Feedback analysis - Labels-2026),
//     measured off its printout: the company, the underlined title beside "F/MKT/02 (01/01.12.2021)", Product and Evaluation
//     Period, the grid of the six attributes under "Experience with Our Products & Services" with his three unheaded cells
//     outside the frame on each line (the Average Rating, the Ideal Rating and the Satisfied % of the line), the Average Rating
//     and Ideal Rating rows under the ratings, the totals and the % Satisfaction Index, the second table "Analysis with respect
//     to average rating achieved against each attribute" (Satisfied % average, Further action / analysis) and the Conclusion.
//     His letters print at 7.4 pt on his page; here no letter prints under 8 pt (the owner's rule, §282).
//   F/MKT/04 Customer Complaints Trend Analysis: page 1 his trend sheet (F-MKT-04_Complaint trend analysis(R-2026).xls), in one
//     frame: the company, the title with the product, "F/MKT/04 (00/01.12.2021)", the "Nos. of Customer complaints" table with
//     its six periods as his 2026 sheets have them (DEC 2021 ... CY 2026), the Total row, "Calender Year :" and the months, and
//     the "Customer complaint Trend" chart on the right. Page 2 his Pareto sheet of the same workbook: "Pareto Analysis", the
//     chart titled "Customer Complaints - ...", the sentence under it, "Cumulative Percentage Cutoff:", the table "# | Causes |
//     Defects | Cumulative%" and "Insert new rows above this line". Both charts are drawn from the record's own figures.
//
// Every printed word is his and is typed over on a record (ownWords, §275); every box is the layout's (mktLayouts.ts). The
// figures worked out (marketingCalc.ts) print where his sheet prints them. No colours (§282).

import type { PaperCell, PaperRow, PaperTable } from "./qcPaperTables";
import { COMPLAINT_MONTHS, FEEDBACK_ATTRIBUTES } from "./mktLayouts";
import { FEEDBACK_RATINGS } from "../../engine/marketingCalc";

const blank = (w: number, more: Partial<PaperCell> = {}): PaperCell => ({ w, t: "", edges: "", ...more });

// ===========================================================================
// F/MKT/02 — Customer Feedback analysis (portrait, one page)
// ===========================================================================

/** His frame, 5.5 to 164.0 mm, and the three cells outside it on each attribute's line, to 210.1 mm. */
const F_ATTR = 81.7;
const F_RATE = [15.3, 15.4, 15.4, 15.4, 15.3];
const F_GRID = F_RATE.reduce((a, b) => a + b, 0);
const F_FRAME = F_ATTR + F_GRID;
const F_OUT = [13.2, 16.4, 16.5];
const F_OUTSIDE = F_OUT.reduce((a, b) => a + b, 0);
/** The smallest letters: his 7.44 pt, printed at least 8 pt on A4 (the sheet is drawn 0.909 times its size there, §282). */
const F_SMALL = 8.9;
const F_RATE_HEADS = ["5\nExcellent", "4\nVery Good", "3\nGood", "2\nAverage", "- 5\nPoor"];
const F_LINE_H = [8.6, 8.6, 8.7, 8.6, 8.7, 8.6];

const label = (w: number, t: string, more: Partial<PaperCell> = {}): PaperCell => ({ w, t, b: true, x: 0.5, vm: true, pt: F_SMALL, ...more });
const figure = (w: number, more: Partial<PaperCell>): PaperCell => ({ w, a: "c", vm: true, pt: F_SMALL, ...more });

const FEEDBACK_ANALYSIS_PAPER: PaperTable = {
  page: "portrait",
  left: 5.5,
  top: 12.9,
  font: "calibri",
  pt: F_SMALL,
  rules: "cells",
  ownWords: true,
  head: [
    { h: 8.4, cells: [{ w: F_FRAME, t: "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED", b: true, a: "c", pt: 11.88, vm: true }, blank(F_OUTSIDE)] },
    {
      h: 7.4,
      cells: [
        { w: 112.4, t: "Customer Feedback analysis", b: true, u: true, a: "c", pt: 17.76, vm: true },
        { w: F_FRAME - 112.4, t: "F/MKT/02 (01/01.12.2021)", b: true, u: true, a: "c", pt: 8.88, vm: true },
        blank(F_OUTSIDE),
      ],
    },
  ],
  body: [
    // The product, and the period its two dates set.
    {
      h: 7.2,
      cells: [
        { w: F_ATTR, b: true, u: true, pt: 11.88, x: 0.7, vm: true, sentence: { before: "Product : -", box: "product", after: "", boxWidth: 30, pw: true } },
        // (one line, "Evaluation Period : 01-11-2026 to 18-11-2026 )", on the rating columns' own edges: its narrow cells of
        //  their own broke the words and the dates over two lines and cut the workbook into slivers - the owner, 26-Nov-2026)
        { w: F_RATE[0] + F_RATE[1] + F_RATE[2], b: true, u: true, pt: 9.6, a: "r", vm: true, edges: "ltb", sentence: { before: "Evaluation Period :", box: "periodFrom", after: "", boxWidth: 17 } },
        { w: F_RATE[3] + F_RATE[4], b: true, u: true, pt: 9.6, x: 0.6, vm: true, edges: "rtb", sentence: { before: "to", box: "periodTo", after: ")", boxWidth: 17 } },
        blank(F_OUTSIDE),
      ],
    },
    {
      h: 8.6,
      head: true,
      cells: [
        { w: F_ATTR, t: "Attributes↓ / Rating→", b: true, a: "c", vm: true, rs: 2 },
        { w: F_GRID, t: "Experience with Our Products & Services", b: true, a: "c", vm: true, pt: 8.88 },
        blank(F_OUTSIDE),
      ],
    },
    {
      h: 8.7,
      head: true,
      cells: [{ w: F_ATTR, skip: true }, ...F_RATE.map((w, i): PaperCell => ({ w, t: F_RATE_HEADS[i], b: true, a: "c", vm: true, lh: 3.5 })), blank(F_OUTSIDE)],
    },
    // The attributes: the counts under each rating; outside the frame, his Average Rating, Ideal Rating and Satisfied % of the line.
    ...FEEDBACK_ATTRIBUTES.map(
      (_, ln): PaperRow => ({
        h: F_LINE_H[ln],
        line: ln,
        cells: [
          label(F_ATTR, "", { t: undefined, col: "attribute", ln }),
          ...F_RATE.map((w, i) => figure(w, { col: FEEDBACK_RATINGS[i].key, ln })),
          figure(F_OUT[0], { col: "averageRating", ln }),
          figure(F_OUT[1], { col: "idealRating", ln }),
          figure(F_OUT[2], { col: "satisfiedPct", ln }),
        ],
      })
    ),
    { h: 8.6, cells: [label(F_ATTR, "Average Rating", { pt: 8.88, x: 0.6 }), ...F_RATE.map((w, i) => figure(w, { box: `tally${FEEDBACK_RATINGS[i].box}` })), blank(F_OUTSIDE)] },
    { h: 8.7, cells: [label(F_ATTR, "Ideal Rating", { pt: 8.88, x: 0.6 }), ...F_RATE.map((w, i) => figure(w, { box: `weighted${FEEDBACK_RATINGS[i].box}` })), blank(F_OUTSIDE)] },
    { h: 8.6, cells: [label(F_ATTR, "Average Rating"), figure(F_GRID, { box: "averageRatingTotal" }), blank(F_OUTSIDE)] },
    { h: 8.6, cells: [label(F_ATTR, "Ideal Rating"), figure(F_GRID, { box: "idealRatingTotal" }), blank(F_OUTSIDE)] },
    { h: 8.7, cells: [label(F_ATTR, "% Satisfaction Index", { pt: 10.32, x: 0.6 }), figure(F_GRID, { box: "satisfactionIndex", b: true, pt: 10.32 }), blank(F_OUTSIDE)] },
    // His second table: each attribute again, its Satisfied % average and the further action.
    {
      h: 7.9,
      cells: [
        { w: F_ATTR, t: "Analysis with respect to average rating achieved against each \nattribute", b: true, x: 0.6, y: 0.8, lh: 3.8 },
        { w: 30.7, t: "Satisfied % average", b: true, a: "c", vm: true },
        { w: F_GRID - 30.7, t: "Further action / analysis", b: true, x: 0.6, vm: true },
        blank(F_OUTSIDE),
      ],
    },
    ...FEEDBACK_ATTRIBUTES.map(
      (attribute, ln): PaperRow => ({
        h: 8.63,
        cells: [label(F_ATTR, attribute), figure(30.7, { col: "satisfiedPct", ln }), { w: F_GRID - 30.7, col: "furtherAction", ln, x: 0.6, vm: true, pt: 8.88 }, blank(F_OUTSIDE)],
      })
    ),
    {
      h: 9.9,
      cells: [
        { w: 18.8, t: "Conclusion :", b: true, u: true, x: 1.3, vm: true, pt: 8.88 },
        { w: F_FRAME - 18.8, box: "conclusion", lines: true, x: 0.6, y: 1.2, lh: 4.1, pt: 8.88 },
        blank(F_OUTSIDE),
      ],
    },
  ],
  foot: [],
};

// ===========================================================================
// F/MKT/04 — Customer Complaints Trend Analysis (landscape, two pages)
// ===========================================================================

/** The trend sheet's columns: Sr. no. and his six periods (DEC 2021 ... CY 2026), then the chart, 144 mm. */
const T_COLS = [21.1, 19.1, 21.1, 19.0, 19.1, 21.1, 19.1];
const T_LEFT = T_COLS.reduce((a, b) => a + b, 0);
const T_CHART = 144.0;
const T_W = T_LEFT + T_CHART;
const T_PT = 8.76;
/** The calendar year's table: Month | Complaint Nos. | Month | Complaint Nos. */
const T_CAL = [T_COLS[0], T_COLS[1] + T_COLS[2], T_COLS[3], T_COLS[4] + T_COLS[5] + T_COLS[6]];
const T_MONTH_H = [6.9, 6.9, 7.0, 6.9, 7.0, 6.9];

const bold = (w: number, t: string, more: Partial<PaperCell> = {}): PaperCell => ({ w, t, b: true, a: "c", vm: true, ...more });
const slot = (w: number, box: string): PaperCell => ({ w, box, b: true, a: "c", vm: true });
/** The chart's place, which the rows beside it leave to it. */
const beside: PaperCell = { w: T_CHART, skip: true };

/** His Pareto sheet's table: # | Causes | Defects | Cumulative%, 142.4 mm, centred as his page centres it. */
const P_TABLE = [9.3, 80.8, 21.1, 31.2];
const P_CONTENT = 178.5;
const P_SIDE = (T_W - P_CONTENT) / 2;
const P_LEFT = P_SIDE + 16.9;
const P_RIGHT = T_W - P_LEFT - P_TABLE.reduce((a, b) => a + b, 0);
const P_PT = 11;

const COMPLAINT_TREND_PAPER: PaperTable = {
  page: "landscape",
  left: 7.3,
  top: 12.9,
  font: "calibri",
  pt: T_PT,
  rules: "cells",
  ownWords: true,
  flows: true,
  // (the Pareto's Vital Few / Useful Many are his chart's two series: the bars' shades, not a column of his table)
  offPaper: ["classification"],
  head: [
    { h: 10.9, cells: [{ w: T_W, t: "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED", b: true, a: "c", pt: 17.4, vm: true }] },
    {
      h: 8.9,
      cells: [
        {
          w: T_W - 72.0,
          b: true,
          u: true,
          a: "c",
          pt: 11.04,
          vm: true,
          sentence: { before: "CUSTOMER COMPLAINTS TREND ANALYSIS -", box: "product", after: "", boxWidth: 34, pw: true },
        },
        { w: 72.0, t: "F/MKT/04 (00/01.12.2021)", b: true, u: true, a: "c", pt: 9.48, vm: true },
      ],
    },
  ],
  body: [
    // ---- page 1: the trend sheet
    {
      h: 6.9,
      cells: [
        { w: T_COLS[0] + T_COLS[1], t: "Nos. of Customer complaints", b: true, x: 0.6, vm: true },
        ...T_COLS.slice(2).map((w): PaperCell => ({ w, t: "" })),
        // His "Customer complaint Trend", from the periods and their complaints.
        { w: T_CHART, rs: 13, edges: "trb", chart: { n: 0, x: 4.0, y: 2.3, w: 136.0, h: 69.0 } },
      ],
    },
    { h: 6.9, cells: [bold(T_COLS[0], "Sr. no.", { a: undefined, x: 0.6 }), ...T_COLS.slice(1).map((w, i) => slot(w, `period${i + 1}`)), beside] },
    { h: 7.0, cells: [{ w: T_COLS[0], box: "seriesName", b: true, x: 0.6, vm: true }, ...T_COLS.slice(1).map((w, i) => slot(w, `complaints${i + 1}`)), beside] },
    { h: 6.9, cells: [bold(T_COLS[0], "Total", { a: undefined, x: 0.6 }), ...T_COLS.slice(1).map((w, i) => slot(w, `total${i + 1}`)), beside] },
    { h: 7.0, cells: [{ w: T_LEFT, t: "", edges: "l" }, beside] },
    {
      h: 6.9,
      cells: [{ w: T_LEFT, b: true, a: "c", vm: true, sentence: { before: "Calender Year :", box: "calendarYear", after: "", boxWidth: 14, pw: true } }, beside],
    },
    { h: 7.0, cells: [bold(T_CAL[0], "Month"), bold(T_CAL[1], "Complaint Nos."), bold(T_CAL[2], "Month"), bold(T_CAL[3], "Complaint Nos."), beside] },
    ...T_MONTH_H.map(
      (h, i): PaperRow => ({
        h,
        cells: [
          bold(T_CAL[0], COMPLAINT_MONTHS[i].label),
          slot(T_CAL[1], COMPLAINT_MONTHS[i].key),
          bold(T_CAL[2], COMPLAINT_MONTHS[i + 6].label),
          slot(T_CAL[3], COMPLAINT_MONTHS[i + 6].key),
          beside,
        ],
      })
    ),
    // ---- page 2: his Pareto sheet of the same workbook
    { h: 9.3, pb: true, cells: [blank(P_SIDE), { w: P_CONTENT, t: "Pareto Analysis", b: true, a: "c", vm: true, pt: 16, edges: "" }, blank(P_SIDE)] },
    { h: 12.0, cells: [blank(T_W)] },
    {
      h: 7.0,
      cells: [
        blank(P_SIDE),
        { w: P_CONTENT, b: true, a: "c", vm: true, pt: 12, edges: "", sentence: { before: "Customer Complaints -", box: "paretoTitle", after: "", boxWidth: 70, pw: true } },
        blank(P_SIDE),
      ],
    },
    { h: 84.0, cells: [blank(P_SIDE), { w: P_CONTENT, edges: "", chart: { n: 1, x: 0, y: 0, w: P_CONTENT, h: 84.0, title: false } }, blank(P_SIDE)] },
    { h: 8.0, cells: [blank(P_SIDE + 3.5), { w: P_CONTENT - 3.5, box: "paretoSummary", b: true, vm: true, pt: 12, edges: "" }, blank(P_SIDE)] },
    { h: 8.0, cells: [blank(T_W)] },
    {
      h: 5.1,
      cells: [
        blank(P_LEFT),
        { w: P_TABLE[0] + P_TABLE[1] + P_TABLE[2], t: "Cumulative Percentage Cutoff:", a: "r", vm: true, pt: P_PT, edges: "" },
        { w: P_TABLE[3], a: "c", vm: true, pt: P_PT, sentence: { before: "", box: "cutoff", after: "%", boxWidth: 10, space: 0, pw: true } },
        blank(P_RIGHT),
      ],
    },
    {
      h: 5.1,
      head: true,
      cells: [
        blank(P_LEFT),
        bold(P_TABLE[0], "#", { pt: P_PT }),
        bold(P_TABLE[1], "Causes", { a: undefined, x: 0.6, pt: P_PT }),
        bold(P_TABLE[2], "Defects", { pt: P_PT }),
        bold(P_TABLE[3], "Cumulative%", { pt: P_PT }),
        blank(P_RIGHT),
      ],
    },
  ],
  // The causes, one to a ruled line, numbered as his template numbers them.
  lines: {
    h: 5.1,
    count: 8,
    cells: [
      blank(P_LEFT),
      { w: P_TABLE[0], num: "all", a: "c", vm: true, pt: P_PT },
      { w: P_TABLE[1], col: "cause", x: 0.6, vm: true, pt: P_PT },
      { w: P_TABLE[2], col: "defects", a: "c", vm: true, pt: P_PT },
      { w: P_TABLE[3], col: "cumulativePct", a: "c", vm: true, pt: P_PT },
      blank(P_RIGHT),
    ],
  },
  foot: [
    {
      h: 5.1,
      cells: [
        blank(P_LEFT),
        { w: P_TABLE[0] + P_TABLE[1], t: "Insert new rows above this line", x: 0.6, vm: true, pt: P_PT },
        { w: P_TABLE[2], t: "" },
        { w: P_TABLE[3], t: "" },
        blank(P_RIGHT),
      ],
    },
  ],
};

export const MKT_PAPERS_355: Record<string, PaperTable> = {
  "mkt-feedback-analysis": FEEDBACK_ANALYSIS_PAPER,
  "mkt-complaint-trend": COMPLAINT_TREND_PAPER,
};
