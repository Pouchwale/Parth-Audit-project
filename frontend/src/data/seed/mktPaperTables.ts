// F/MKT/01 DRAWN AS THE COMPANY'S OWN PAPER (REQUIREMENTS §322; the owner, 24-Nov-2026: "replace the mkt 1 document ...
// keep everything that is to be filled ... blank. but the format should be exactly the same as i have attached").
//
// Read off "F-MKT-01_Customer Feedback Form- Tenax.pdf" rule by rule (scratchpad geo.py, pymupdf: every rule and every word
// in mm): the company band, the underlined title beside the grey number box, the instruction, the customer's boxes standing
// inside the page's frame, the attributes grid with "Yes □" under each rating, the comments, Overall Satisfaction Level
// with its three "Yes □", Yes □ / No □, and Company Seal & Sign. Every place the customer writes is a blank box of the
// record; nothing is filled for them. The printed words are the paper's and are typed over in place (ownWords).

import type { PaperCell, PaperPick, PaperRow, PaperTable } from "./qcPaperTables";
import { FEEDBACK_ATTRIBUTES, FEEDBACK_RATING_OPTIONS, SATISFACTION_LEVELS } from "./mktLayouts";

/** The frame's width: 6.07 mm to 203.94 mm on the page. */
const W = 197.87;
/** The paper's text stands 0.58 mm in from a cell's left rule. */
const X = 0.58;
/** The five rating columns, 107.82 / 127.05 / 146.27 / 165.5 / 184.72 / 203.94 mm. */
const RATING_W = [19.23, 19.22, 19.23, 19.22, 19.22];
const ATTR_W = W - RATING_W.reduce((a, b) => a + b, 0);
const RATING_HEADS = ["5\nExcellent", "4\nVery Good", "3\nGood", "2\nAverage", "- 5\nPoor"];

const label = (w: number, t: string, edges: string, more: Partial<PaperCell> = {}): PaperCell => ({ w, t, edges, b: true, x: X, vm: true, ...more });
const box = (w: number, key: string): PaperCell => ({ w, box: key, edges: "ltrb", a: "c", vm: true });
/** The gap between two of the customer's boxes: the frame's sides only. */
const gap = (h: number): PaperRow => ({ h, cells: [{ w: W, t: "", edges: "lr" }] });
/** "Yes □": the words first, the box after them, at the cell's left as printed. */
const yes = (p: Omit<PaperPick, "mark" | "after">): PaperPick => ({ ...p, mark: "check", after: true });
const picks = (w: number, edges: string, pick: PaperPick[], more: Partial<PaperCell> = {}): PaperCell => ({ w, t: "", edges, x: X, pick, ...more });

const SATISFACTION_WORDS = ["Extremely Happy", "Satisfactory", "Needs Improvement"];
const SATISFACTION_MARKS = ["☺ : Yes", "☻ : Yes", "△ : Yes"];
const SATISFACTION_H = [6.43, 6.43, 6.44];
const ATTRIBUTE_H = [9.62, 9.61, 9.61, 9.61, 9.61, 9.62];

const CUSTOMER_FEEDBACK_PAPER: PaperTable = {
  page: "portrait",
  left: 6.07,
  top: 5.27,
  font: "calibri",
  pt: 9.24,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  // The attributes are the paper's printed words down the grid's side.
  offPaper: ["attribute"],
  head: [
    { h: 11.05, cells: [{ w: W, t: "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED", edges: "ltrb", b: true, a: "c", pt: 18.36, vm: true, heavy: "rb" }] },
    {
      h: 9.36,
      cells: [
        { w: 140.2, t: "Customer Value added Feedback", edges: "ltrb", b: true, u: true, a: "c", pt: 20.28, vm: true, heavy: "b" },
        { w: W - 140.2, t: "F/MKT/01 (01/01.12.2021)", edges: "ltrb", b: true, a: "c", pt: 11.04, vm: true, bg: "#f2f2f2", heavy: "rb" },
      ],
    },
  ],
  body: [
    {
      h: 19.3,
      cells: [
        label(
          W,
          "We are committed to provide Safe Quality Products and exceeding services deliverbales . Your Comments / suggestions will be used to help\nimprove the Quality of our Products & Services . Thank you for taking the time to complete this form concerning your experience.",
          "ltrb",
          { lh: 4.23, heavy: "rb" }
        ),
      ],
    },
    gap(1.69),
    { h: 6.02, cells: [label(23.29, "Date :", "l"), box(32.86, "date"), { w: 141.72, t: "", edges: "r" }] },
    gap(1.91),
    { h: 6.43, cells: [label(23.29, "Organization :", "l"), box(174.58, "organization")] },
    gap(2.63),
    // (Designation and Mobile close with their own end line, as Date does, 2 mm inside the frame: the owner, 26-Nov-2026,
    // "the designation and mobile boxes should be completed, put the end line as we have in date" - their right edge was the
    // frame's alone, §389)
    { h: 6.43, cells: [label(39.72, "Contact Person :", "l"), box(81.26, "contactPerson"), label(38.45, "Designation :", ""), box(36.44, "designation"), { w: 2, t: "", edges: "r" }] },
    gap(2.62),
    { h: 6.44, cells: [label(23.29, "Email ID :", "l"), box(97.69, "emailId"), label(19.22, "Mobile :", ""), box(55.67, "mobile"), { w: 2, t: "", edges: "r" }] },
    gap(2.62),
    { h: 6.44, cells: [label(23.29, "Products :", "l"), box(174.58, "products")] },
    gap(2.63),
    {
      h: 8.63,
      head: true,
      cells: [label(ATTR_W, "Attributes↓ / Rating→", "ltrb"), ...RATING_W.map((w, i): PaperCell => ({ w, t: RATING_HEADS[i], edges: "ltrb", b: true, a: "c", vm: true, lh: 4.23 }))],
    },
    ...FEEDBACK_ATTRIBUTES.map(
      (attribute, ln): PaperRow => ({
        h: ATTRIBUTE_H[ln],
        line: ln,
        cells: [
          label(ATTR_W, attribute, "ltrb"),
          ...RATING_W.map((w, i) => picks(w, "ltrb", [yes({ col: "rating", ln, value: FEEDBACK_RATING_OPTIONS[i], word: "Yes" })])),
        ],
      })
    ),
    {
      h: 19.3,
      cells: [
        {
          w: W,
          t: "Your valuable comments / suggestions:",
          edges: "ltrb",
          b: true,
          u: true,
          x: X,
          y: 1.2,
          heavy: "rb",
          over: [{ box: "comments", x: X, y: 4.6, w: W - 2 * X, h: 14.2, lines: true }],
        },
      ],
    },
    ...SATISFACTION_LEVELS.map((value, i): PaperRow => {
      const last = i === SATISFACTION_LEVELS.length - 1;
      return {
        h: SATISFACTION_H[i],
        cells: [
          i === 0 ? label(56.15, "Overall Satisfaction Level :", "l") : { w: 56.15, t: "", edges: last ? "lb" : "l", ...(last ? { heavy: "b" as const } : {}) },
          { w: 45.6, t: SATISFACTION_WORDS[i], edges: last ? "b" : "", x: X, vm: true, ...(last ? { heavy: "b" as const } : {}) },
          picks(96.12, last ? "rb" : "r", [yes({ box: "overallSatisfaction", value, word: SATISFACTION_MARKS[i] })], { heavy: last ? "rb" : "r" }),
        ],
      };
    }),
    {
      h: 6.44,
      cells: [
        label(ATTR_W, "Would you like to be associated with us in future :", "l", { u: true }),
        picks(W - ATTR_W, "r", [yes({ box: "associateInFuture", value: "Yes", word: "Yes" })], { heavy: "r" }),
      ],
    },
    {
      h: 6.44,
      cells: [
        { w: ATTR_W, t: "", edges: "lb", heavy: "b" },
        picks(W - ATTR_W, "rb", [yes({ box: "associateInFuture", value: "No", word: "No" })], { heavy: "rb" }),
      ],
    },
    {
      h: 19.31,
      cells: [
        {
          w: W,
          t: "Company Seal & Sign :",
          edges: "ltrb",
          b: true,
          x: X,
          y: 1.2,
          heavy: "rb",
          over: [{ box: "companySealSign", x: X, y: 4.6, w: W - 2 * X, h: 14.2, lines: true }],
        },
      ],
    },
  ],
  foot: [],
};

export const MKT_PAPER_TABLES: Record<string, PaperTable> = {
  "mkt-customer-feedback": CUSTOMER_FEEDBACK_PAPER,
};
