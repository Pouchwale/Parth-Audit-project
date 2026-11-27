// F/SYS/12, 13, 14, 15, 16 AND 20 DRAWN AS THE OWNER'S OWN PAPERS (REQUIREMENTS §371; the owner, 24-Nov-2026: "same format present in
// my system which is present in google drive ... whenever user download any document of any module or take a print on A4 size paper,
// that should be very perfect"). Each is measured in mm off the owner's own file and its printout, every printed word his, typed over
// on a record (ownWords, §275), no colour (§282). Every place a person writes is bound to the format's own box or column, so every
// record already written reads on as it was.
//
//   F/SYS/12  his blank "F-SYS-12-Monthly HARA Verification" (Word; source-documents/originals-pdf/sys-hara-monthly.pdf): MONTHLY HARA
//             VERIFICATION, Format No.: | Rev No: 00 | Date: 01.12.2021 | Page No.: 1 of 2, the double page border, Month: - / Review
//             date: -, the 28 verification attributes (rows 2, 16, 17 and 24 in his words, 25 to 28 his own), the Reference column left
//             to be written, the HARA Review Team table of 6 lines. The attributes are the register's lines: a page that runs out
//             starts again with the head, Month / Review date and the column headings, as his Word file repeats them.
//   F/SYS/13  his blank "F-SYS-13-Mock Product Withdrawal record" (Excel, Sheet1): the sheet's columns and rows, the frame round the
//             page, Customer Information with Site senior management, Contact Person with Contacted by e-mail / Phone / Fax, the
//             Information of the product box (the record's facts written in it as the plant writes them), Response from Customer,
//             the Responsible table, Product Traced %, Yes / No, Comments. The bands are not shaded (§282).
//   F/SYS/14  his "F-SYS-14-Backward Traceability Record - Label" (Word; source-documents/...Label- Aculife - Copy.pdf): the two-line
//             head on each page, the lot's table, Description / Observation, page 2 with Box number, Reel number and Verified By,
//             "F/SYS/14 (00/01.12.2021)" at the foot of each page.
//   F/SYS/15  his "F-SYS-15-Forward Traceability Record - Label" (Word; source-documents/...Label.pdf): the material's table, the
//             1st Issue's Description / Observation lines (the record's first line), Verified By, "F/SYS/15 (00/01.12.2021)".
//   F/SYS/16  his "Quality & Product Safety Objectives ( Year 2026 )" sheet (Excel, "2026 - H1", Drive: BRCGS 25-26), landscape:
//             Sr. No. | Department / Processes | Parameter / Attribute | Unit | Plan / Actual | January ... June | Total | % Achieved,
//             each objective a Plan and an Actual row (objective 8 an Actual - meters row too), the cells his sheet merges across the
//             six months merged; his print titles (rows 1 to 4) again on each of the four pages, five objectives a page.
//   F/SYS/20  his "F-SYS-20_Annual HARA Verification Record_Jan 2026" (Word; source-documents/...Jan 2026.pdf): the logo, the title,
//             F/SYS/20 (00 / 01.04.2025) | Page No.: 1 of 4 on every page, the double page border, the site's table, 1. Review
//             Purpose, 2. Changes Reviewed (the twelve points, the register's lines), 3. CCMs / PRPs Verified, then a page of its
//             own for 4. Validation/Verification Summary, 5. Recommendations/Updates, 6. Conclusion, Next scheduled review and
//             7.HARA Review Team.

import type { PaperCell, PaperPick, PaperRow, PaperTable } from "./qcPaperTables";

const LOGO = "brand/gpp-paper-logo.png";
const COMPANY = "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED";

/** A strip of the paper with no rules (a margin beside a table, the space between two tables). */
const strip = (w: number): PaperCell => ({ w, t: "", edges: "" });
const gap = (w: number, h: number): PaperRow => ({ h, cells: [strip(w)] });

// ====================================================================================================================
// F/SYS/12 MONTHLY HARA VERIFICATION
// ====================================================================================================================

/** The paper's width: 12.4 mm to 194.3 mm on his page (the Month / headings table, the widest). */
const W12 = 181.9;
/** The head stands 16.8 mm to 192.5 mm. */
const head12 = (cells: PaperCell[], h: number): PaperRow => ({ h, cells: [strip(4.4), ...cells, strip(1.8)] });

const HARA_MONTHLY_PAPER: PaperTable = {
  page: "portrait",
  left: 12.4,
  top: 13.0,
  font: "calibri",
  pt: 10,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  flows: true,
  // The double border round each page: 8.5 mm to 201.6 mm across, 8.7 mm to 288.2 mm down.
  pageFrame: { l: 3.9, t: 4.3, w: 193.1, h: 279.5, double: true },
  head: [
    head12([{ w: 175.7, t: COMPANY, b: true, u: true, a: "c", pt: 12, y: 4.1 }], 11.6),
    head12([{ w: 175.7, t: "MONTHLY HARA VERIFICATION", b: true, u: true, a: "c", pt: 12, y: 4.1 }], 11.6),
    head12(
      [
        { w: 52.1, t: "Format No.: F/SYS/12", pt: 12, x: 1.4, y: 2.0 },
        { w: 39.8, t: "Rev No: 00", a: "c", pt: 12, y: 2.0 },
        { w: 41.2, t: "Date: 01.12.2021", a: "c", pt: 12, y: 2.0 },
        { w: 42.6, t: "Page No.: 1 of 2", pt: 12, x: 1.6, y: 2.0 },
      ],
      7.7
    ),
    gap(W12, 5.3),
  ],
  // Month / Review date and the column headings: his page's header, so every page starts with them.
  body: [
    {
      h: 6.9,
      head: true,
      cells: [
        { w: 87.0, b: true, pt: 11, x: 1.8, y: 1.5, sentence: { before: "Month: -", box: "month", after: "", boxWidth: 50, pw: true } },
        { w: 94.9, b: true, pt: 11, x: 1.9, y: 1.5, sentence: { before: "Review date: -", box: "meetingDate", after: "", boxWidth: 40, pw: true } },
      ],
    },
    {
      h: 15.1,
      head: true,
      cells: [
        { w: 12.8, t: "Sr.No.", b: true, a: "c", vm: true },
        { w: 57.2, t: "Verification attributes", b: true, a: "c", vm: true },
        { w: 17.0, t: "Status\n(Yes/No)", b: true, a: "c", vm: true, lh: 4.9 },
        { w: 37.8, t: "Reference documents\n/ records", b: true, a: "c", vm: true, lh: 4.9 },
        { w: 22.6, t: "Verification\nstatus\n(C / NC)", b: true, a: "c", vm: true, lh: 4.95 },
        { w: 34.5, t: "Review comments", b: true, a: "c", vm: true },
      ],
    },
    { ...gap(W12, 5.1), head: true },
  ],
  // The 28 attributes, a line each (12.4 mm to 192.2 mm); a line grows to what is written in it.
  lines: {
    h: 5.1,
    count: 28,
    cells: [
      { w: 12.8, num: "all", a: "c", vm: true },
      { w: 57.2, col: "attribute", x: 1.9, y: 0.9, lh: 4.3, lines: true, grow: true },
      { w: 17.9, col: "status", a: "c", vm: true },
      { w: 36.9, col: "reference", x: 1.9, y: 0.9, lh: 4.3, lines: true, grow: true },
      { w: 22.6, col: "verification", a: "c", vm: true },
      { w: 32.5, col: "comments", x: 1.9, y: 0.9, lh: 4.3, lines: true, grow: true },
      strip(2.0),
    ],
  },
  foot: [
    gap(W12, 4.9),
    { h: 5.6, cells: [{ w: W12, t: "HARA Review Team", b: true, u: true, pt: 12, x: 1.8, y: 1.0, edges: "" }] },
    gap(W12, 6.4),
    {
      h: 6.9,
      cells: [
        { w: 14.5, t: "Sr.no.", b: true, a: "c", vm: true },
        { w: 69.0, t: "Name of Product safety team member", b: true, a: "c", vm: true },
        { w: 63.2, t: "Designation", b: true, a: "c", vm: true },
        { w: 32.9, t: "Sign", b: true, a: "c", vm: true },
        strip(2.3),
      ],
    },
    ...[1, 2, 3, 4, 5, 6].map(
      (n): PaperRow => ({
        h: 7.0,
        cells: [
          { w: 14.5, t: String(n), a: "c", vm: true },
          { w: 69.0, box: `team${n}Name`, x: 1.9, vm: true },
          { w: 63.2, box: `team${n}Designation`, x: 1.9, vm: true },
          { w: 32.9, t: "" },
          strip(2.3),
        ],
      })
    ),
  ],
  // His team table has six lines; the format keeps eight members' boxes (the April 2024 page listed seven).
  offPaper: ["team7Name", "team7Designation", "team8Name", "team8Designation"],
};

// ====================================================================================================================
// F/SYS/13 MOCK PRODUCT WITHDRAWAL RECORD
// ====================================================================================================================

/** His sheet's columns A to K (mm). */
const C13 = [2.38, 52.39, 16.14, 16.14, 16.14, 16.14, 16.14, 16.14, 16.14, 16.14, 16.14];
const W13 = Math.round(C13.reduce((a, w) => a + w, 0) * 100) / 100;
/** Columns `from` to `to` (A = 0) as one cell's width. */
const cw = (from: number, to: number): number => Math.round(C13.slice(from, to + 1).reduce((a, w) => a + w, 0) * 100) / 100;
/** A row inside the frame: column A ruled at its left, the rest given, the last cell ruled at its right where it says nothing. */
const framed = (h: number, cells: PaperCell[]): PaperRow => ({ h, cells: [{ w: C13[0], t: "", edges: "l" }, ...cells] });
const blank13 = (h: number): PaperRow => framed(h, [{ w: cw(1, 9), t: "", edges: "" }, { w: C13[10], t: "", edges: "r" }]);
/** A grey band of his sheet, its words bold and centred (not shaded: §282). */
const band13 = (t: string): PaperRow => framed(4.87, [{ w: cw(1, 10), t, b: true, a: "c", vm: true }]);
/** A fact the plant writes inside the Information of the product box: its words, then the record's box. */
const fact = (before: string, box: string, edges = "lr", h = 4.87): PaperRow =>
  framed(h, [{ w: cw(1, 10), x: 0.7, y: 0.7, edges, sentence: { before, box, after: "", boxWidth: 120, pw: true } }]);

const yesNo = (value: string): PaperPick[] => [{ box: "effective", value, word: value, mark: "ring" }];

const MOCK_RECALL_PAPER: PaperTable = {
  page: "portrait",
  left: 5.0,
  top: 5.0,
  font: "calibri",
  pt: 10,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  clearFoot: true,
  // (one page: fitted to the page's width and height, as his file prints it)
  head: [
    // §402 (owner, 27-Nov-2026): the company's name and the title are one closed box - the name's row ruled round, the
    // title ruled round beside the number (his sheet's 2.12 mm gap under the name goes into the name's row).
    { h: 9.53, cells: [{ w: C13[0], t: "", edges: "lt" }, { w: cw(1, 10), t: COMPANY, b: true, a: "c", pt: 16, vm: true }] },
    // (his blank sheet prints no number; his sheet in use since 2025 prints it in the title row's right cell, I3:K3)
    framed(7.41, [
      { w: cw(1, 7), b: true, u: true, a: "c", pt: 16, vm: true, sentence: { before: "Mock Product Withdrawal Record", box: "product", after: "", boxWidth: 30, pw: true } },
      { w: cw(8, 10), t: "F/SYS/13(00/01.12.2021)", b: true, a: "c", pt: 12, vm: true },
    ]),
  ],
  body: [
    blank13(3.97),
    blank13(3.97),
    framed(4.87, [
      { w: C13[1], t: "Date", b: true, x: 0.7, vm: true, edges: "" },
      { w: cw(2, 3), box: "date", a: "c", vm: true },
      { w: C13[4], t: "", edges: "" },
      { w: C13[5], t: "Start Time", b: true, x: 0.7, vm: true, edges: "" },
      { w: C13[6], box: "startTime", a: "c", vm: true },
      { w: C13[7], t: "End time", b: true, x: 0.7, vm: true, edges: "" },
      { w: C13[8], box: "endTime", a: "c", vm: true },
      { w: C13[9], t: "Total time", b: true, x: 0.7, vm: true, edges: "" },
      { w: C13[10], box: "totalTime", a: "c", vm: true },
    ]),
    blank13(4.87),
    framed(6.88, [
      { w: cw(1, 4), t: "Customer  Information", b: true, a: "c", vm: true },
      { w: cw(5, 6), t: "", edges: "" },
      { w: cw(7, 10), t: "Contact Person ( For Mock Withdrawal )", b: true, a: "c", vm: true },
    ]),
    framed(6.88, [
      { w: C13[1], t: "Name", x: 0.7, vm: true },
      { w: cw(2, 4), box: "customerName", x: 0.7, vm: true },
      { w: cw(5, 6), t: "", edges: "" },
      { w: C13[7], t: "Name", x: 0.7, vm: true },
      { w: cw(8, 10), box: "contactName", a: "c", vm: true },
    ]),
    framed(6.88, [
      { w: C13[1], t: "Location", x: 0.7, vm: true },
      { w: cw(2, 4), box: "customerLocation", x: 0.7, vm: true },
      { w: cw(5, 6), t: "", edges: "" },
      { w: C13[7], t: "Position", x: 0.7, vm: true },
      { w: cw(8, 10), box: "contactPosition", a: "c", vm: true },
    ]),
    framed(6.88, [
      { w: C13[1], t: "Site senior management - Name", x: 0.7, vm: true },
      { w: cw(2, 4), box: "siteSeniorName", x: 0.7, vm: true },
      { w: cw(5, 6), t: "", edges: "" },
      { w: C13[7], t: "Contacted\nby", x: 0.7, vm: true, lh: 4.2, rs: 3 },
      { w: C13[8], t: "e-mail", x: 0.7, vm: true },
      { w: cw(9, 10), box: "contactEmail", x: 0.7, vm: true },
    ]),
    framed(6.88, [
      { w: C13[1], t: "Designation of Site senior management", x: 0.7, vm: true },
      { w: cw(2, 4), box: "siteSeniorDesignation", x: 0.7, vm: true },
      { w: cw(5, 6), t: "", edges: "" },
      { w: C13[7], t: "", skip: true },
      { w: C13[8], t: "Phone", x: 0.7, vm: true },
      { w: cw(9, 10), box: "contactPhone", x: 0.7, vm: true },
    ]),
    framed(6.88, [
      { w: cw(1, 6), t: "", edges: "" },
      { w: C13[7], t: "", skip: true },
      { w: C13[8], t: "Fax", x: 0.7, vm: true },
      { w: cw(9, 10), box: "contactFax", x: 0.7, vm: true },
    ]),
    blank13(4.87),
    band13("Information of the product"),
    // (his 8 pt note set at 9.5 pt: the sheet prints at under 90 %, and nothing on a paper prints under 8 pt, §282)
    framed(4.87, [{ w: cw(1, 10), t: "(Information that we are looking for)", pt: 9.5, x: 0.7, y: 0.5, edges: "ltr" }]),
    fact("FG code : -", "fgCode"),
    fact("Production order number : -", "productionOrderNumber"),
    fact("Sales order number : -", "salesOrderNumber"),
    fact("Job name : -", "jobName"),
    fact("Dispatch Date : -", "dispatchDate"),
    fact("Invoice number : -", "invoiceNumber"),
    fact("Dispatched Quantity : -", "dispatchedQuantity"),
    fact("Mock Recall scenario considered was", "scenario"),
    framed(9.74, [{ w: cw(1, 10), box: "telephonicConversation", x: 0.7, y: 0.7, lh: 4.2, lines: true, grow: true, edges: "lrb" }]),
    blank13(4.87),
    band13("Response from Customer"),
    framed(48.7, [{ w: cw(1, 10), box: "responseFromCustomer", x: 0.7, y: 0.7, lh: 4.2, lines: true, grow: true }]),
    blank13(4.87),
    blank13(4.87),
    band13("Responsible ( Product recall Team + other concerned members of the Organization as necessary )"),
    framed(4.87, [{ w: cw(1, 10), t: "", edges: "ltr" }]),
    framed(4.87, [
      { w: C13[1], t: "Process / Function", b: true, x: 0.7, vm: true },
      { w: cw(2, 4), t: "Name", b: true, a: "c", vm: true },
      { w: cw(5, 7), t: "Designation", b: true, a: "c", vm: true },
      { w: cw(8, 10), t: "Signature", b: true, a: "c", vm: true },
    ]),
    ...[7.14, 7.41, 7.41, 7.41].map(
      (h, ln): PaperRow =>
        framed(h, [
          { w: C13[1], col: "processFunction", ln, x: 0.7, vm: true },
          { w: cw(2, 4), col: "name", ln, a: "c", vm: true },
          { w: cw(5, 7), col: "designation", ln, a: "c", vm: true },
          { w: cw(8, 10), col: "signature", ln, a: "c", vm: true },
        ])
    ),
    framed(2.33, [{ w: cw(1, 10), t: "", edges: "lrb" }]),
    blank13(2.12),
    blank13(4.87),
    framed(4.87, [
      { w: C13[1], t: "Product Traced % :", b: true, x: 0.7, vm: true, edges: "" },
      { w: C13[2], t: "", edges: "" },
      { w: C13[3], box: "productTraced", a: "c", vm: true, edges: "b" },
      { w: cw(4, 9), t: "", edges: "" },
      { w: C13[10], t: "", edges: "r" },
    ]),
    blank13(2.12),
    framed(4.87, [
      { w: C13[1], t: "Was the Mock Recall efecctive?", b: true, x: 0.7, vm: true, edges: "" },
      { w: cw(2, 5), t: "", edges: "" },
      { w: C13[6], b: true, a: "c", vm: true, pick: yesNo("Yes") },
      { w: C13[7], t: "", edges: "" },
      { w: C13[8], b: true, a: "c", vm: true, pick: yesNo("No") },
      { w: C13[9], t: "", edges: "" },
      { w: C13[10], t: "", edges: "r" },
    ]),
    framed(4.87, [
      { w: cw(1, 5), t: "Why was effective? (add comments).", b: true, x: 0.7, vm: true, edges: "" },
      { w: cw(6, 9), t: "", edges: "" },
      { w: C13[10], t: "", edges: "r" },
    ]),
    band13("Comments"),
  ],
  foot: [{ h: 24.56, cells: [{ w: C13[0], t: "", edges: "lb" }, { w: cw(1, 10), box: "comments", x: 0.7, y: 0.7, lh: 4.2, lines: true, grow: true, edges: "lrb" }] }],
};

// ====================================================================================================================
// F/SYS/14 BACKWARD TRACEABILITY RECORD (CUSTOMER to SUPPLIER) and F/SYS/15 FORWARD TRACEABILITY CHECK LIST
// ====================================================================================================================

/** The tables' width: 23.6 mm to 186.5 mm on his page. */
const WT = 162.9;
/** His page's two-line head, in his Word file's header, so on every page. */
const traceHead = (title: string, copy: boolean): PaperRow[] => [
  { h: 5.3, cells: [{ w: WT, t: COMPANY, b: true, a: "c", pt: 12, y: 0.9, ...(copy ? { pl: "0:0" } : {}) }], ...(copy ? { pb: true as const } : {}) },
  { h: 5.4, cells: [{ w: WT, t: title, b: true, a: "c", pt: 12, y: 0.9, ...(copy ? { pl: "1:0" } : {}) }] },
];
/**
 * His page's footer, the format's number, centred at the page's foot (each page is drawn to the same height, so it stands there).
 * Every page's footer is the same words, typed over once (one place).
 */
const traceFoot = (t: string): PaperRow => ({ h: 5.9, cells: [{ w: WT, t, a: "c", pt: 11, y: 0.9, edges: "", pl: "footer:0" }] });
/** A label and its box across the table: the lot's table (40.7 | 122.2) or Description / Observation (61.8 | 101.1). */
const pair = (label: string, box: string, split: number, h = 7.3, more: Partial<PaperCell> = {}): PaperRow => ({
  h,
  cells: [
    { w: split, t: label, x: 1.8, y: 0.8, lh: 7.2 },
    { w: WT - split, box, x: 2.0, y: 0.8, ...more },
  ],
});
/** Two labels and their boxes on one line: "Invoice No. | … | Date of Dispatch | …". */
const quad = (a: string, boxA: string, b: string, boxB: string, h = 7.3): PaperRow => ({
  h,
  cells: [
    { w: 40.7, t: a, x: 1.8, y: 0.8 },
    { w: 40.7, box: boxA, x: 1.9, y: 0.8 },
    { w: 40.8, t: b, x: 1.9, y: 0.8 },
    { w: 40.7, box: boxB, x: 1.9, y: 0.8 },
  ],
});
/** A line of a table whose answer is the record's first line (F/SYS/15's 1st Issue). */
const issue = (label: string, col: string): PaperRow => ({
  h: 7.3,
  cells: [
    { w: 61.8, t: label, x: 1.8, y: 0.8 },
    { w: WT - 61.8, col, ln: 0, x: 2.0, y: 0.8 },
  ],
});
const PARA: Partial<PaperCell> = { lines: true, grow: true, lh: 4.7 };

const BACKWARD_TITLE = "BACKWARD TRACEABILITY RECORD (CUSTOMER to SUPPLIER)";
const BACKWARD_FOOT = "F/SYS/14 (00/01.12.2021)";
const BACKWARD_TRACE_PAPER: PaperTable = {
  page: "portrait",
  left: 23.6,
  top: 12.6,
  font: "calibri",
  pt: 11,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  clearFoot: true,
  flows: true,
  head: traceHead(BACKWARD_TITLE, false),
  body: [
    gap(WT, 4.9),
    pair("B/W Traceability date", "traceabilityDate", 40.7),
    pair("CUSTOMER Name", "customerName", 40.7),
    pair("Location of Dispatch", "locationOfDispatch", 40.7),
    pair("Product Description", "productDescription", 40.7),
    quad("Invoice No.", "invoiceNo", "Date of Dispatch", "dateOfDispatch"),
    quad("P/O Number", "poNumber", "Quantity", "quantity"),
    { h: 7.3, cells: [{ w: 61.8, t: "Description", b: true, x: 1.8, y: 0.8 }, { w: WT - 61.8, t: "Observation", b: true, x: 2.0, y: 0.8 }] },
    pair("Customer order number & date", "customerOrderNumberDate", 61.8),
    pair("Customer order quantity", "customerOrderQuantity", 61.8),
    pair("FGLA code", "fglaCode", 61.8),
    pair("Sales order number & date", "salesOrderNumberDate", 61.8),
    pair("Production order number & date", "productionOrderNumberDate", 61.8),
    pair("Key RM (Paper Label) inward date", "keyRmInwardDate", 61.8, 9.6, PARA),
    pair("Paper label supplier", "paperLabelSupplier", 61.8),
    pair("Issued Quantity", "issuedQuantity", 61.8),
    pair("Printing production date", "printingProductionDate", 61.8),
    pair("Print Quantity", "printQuantity", 61.8),
    pair("Balance returned", "balanceReturned", 61.8),
    pair("QC Inspection dated", "qcInspectionDated", 61.8),
    pair("QC Inspected OK meter", "qcInspectedOkMeter", 61.8),
    pair("Balance scrapped", "balanceScrapped", 61.8),
    pair("Slitting & packing date", "slittingPackingDate", 61.8),
    pair("Slitting OK meter", "slittingOkMeter", 61.8),
    pair("Packing Quantity", "packingQuantity", 61.8, 67.0, { ...PARA, lh: 7.2 }),
    // (6 mm less than page 2: page 1's 31 ruled lines print a little taller than drawn)
    gap(WT, 14.3),
    traceFoot(BACKWARD_FOOT),
    // Page 2: the head again, the last three lines, the footer at the same place.
    ...traceHead(BACKWARD_TITLE, true),
    gap(WT, 4.9),
    pair("Box number", "boxNumber", 61.8),
    pair("Reel number", "reelNumber", 61.8),
    pair("Verified By", "verifiedBy", 61.8),
    gap(WT, 235.6),
  ],
  foot: [traceFoot(BACKWARD_FOOT)],
};

const FORWARD_TRACE_PAPER: PaperTable = {
  page: "portrait",
  left: 23.6,
  top: 12.6,
  font: "calibri",
  pt: 11,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  clearFoot: true,
  // (one page: fitted to the page's width and height, as his file prints it)
  head: traceHead("FORWARD TRACEABILITY CHECK LIST (SUPPLIER to CUSTOMER)", false),
  body: [
    gap(WT, 4.9),
    pair("Date of Forward\nTraceability", "dateOfForwardTraceability", 40.7, 14.4),
    pair("Supplier Name", "supplierName", 40.7, 7.2),
    pair("Material Description", "materialDescription", 40.7),
    quad("Invoice No.", "invoiceNo", "Internal batch number", "internalBatchNumber", 7.9),
    quad("Date of receipt at store", "dateOfReceiptAtStore", "Quantity", "quantity", 7.9),
    gap(WT, 7.3),
    { h: 7.3, cells: [{ w: 61.8, t: "Description", x: 1.8, y: 0.8 }, { w: WT - 61.8, t: "Observation", x: 2.0, y: 0.8 }] },
    { h: 7.3, cells: [{ w: WT, t: "1st Issue", b: true, x: 1.8, y: 0.8 }] },
    issue("Issue dated", "issueDated"),
    issue("Issued Qty.", "issuedQty"),
    issue("Print Qty.", "printQty"),
    issue("Slitted Roll Batch number", "slittedRollBatchNumber"),
    issue("Customer name", "customerName"),
    issue("Job name", "jobName"),
    issue("Production order number", "productionOrderNumber"),
    issue("Dispatched Qty.", "dispatchedQty"),
    issue("Dispatch dated", "dispatchDated"),
    issue("Invoice number", "invoiceNumber"),
    issue("Balance Qty.", "balanceQty"),
    gap(WT, 30.4),
    { h: 7.3, cells: [{ w: 62.1, t: "Verified By", x: 1.8, y: 0.8 }, { w: WT - 62.1, box: "verifiedBy", x: 1.9, y: 0.8 }] },
    gap(WT, 74.7),
  ],
  foot: [traceFoot("F/SYS/15 (00/01.12.2021)")],
};

// ====================================================================================================================
// F/SYS/16 QUALITY & PRODUCT SAFETY OBJECTIVES ( Year … )
// ====================================================================================================================

/** His sheet's columns A to M (mm): Sr. No., Department, Parameter, Unit, Plan / Actual, January (narrower) ... June, Total, % Achieved. */
const C16 = [9.26, 33.07, 30.96, 20.37, 23.28, 21.17, 23.28, 23.28, 23.28, 23.28, 23.28, 23.28, 23.28];
const W16 = Math.round(C16.reduce((a, w) => a + w, 0) * 100) / 100;
const cw16 = (from: number, to: number): number => Math.round(C16.slice(from, to + 1).reduce((a, w) => a + w, 0) * 100) / 100;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun"];
const ROW16 = 14.02;

/**
 * The six months a sheet prints: his "2026 - H1" sheet January to June, his "2026 - H2" sheet July to December (§397). A record
 * keeps its six months in the same boxes (janPlan ... junActual: the half's first to sixth month), so the plans carry from one
 * half to the next.
 */
const HALF_MONTHS = {
  H1: ["January", "February", "March", "April", "May", "June"],
  H2: ["July", "August", "September", "October", "November", "December"],
} as const;
export type ObjectivesHalf = keyof typeof HALF_MONTHS;

/** His print titles: the company, the title with the year and the format's number, the column headings (rows 1 to 4). */
function objectivesHead(first: boolean, half: ObjectivesHalf = "H1"): PaperRow[] {
  // (a page after the first prints the same words: typed over once, on page 1)
  const pl = (p: string): Partial<PaperCell> => (first ? {} : { pl: p });
  const headings: [string, boolean, Partial<PaperCell>][] = [
    ["Sr. No.", true, { a: "c" }],
    ["Department / Processes", true, { x: 0.7 }],
    ["Parameter / Attribute", true, { a: "c" }],
    ["Unit", true, { a: "c" }],
    ["Plan / Actual", true, { a: "c" }],
    ...HALF_MONTHS[half].map((m): [string, boolean, Partial<PaperCell>] => [m, false, { a: "c" }]),
    ["Total", false, { a: "c" }],
    ["% Achieved", false, { a: "c" }],
  ];
  return [
    { h: 17.73, ...(first ? {} : { pb: true as const }), cells: [{ w: W16, t: COMPANY, b: true, u: true, a: "c", pt: 20, vm: true, ...pl("0:0") }] },
    {
      h: 12.44,
      cells: [
        {
          w: cw16(0, 9),
          b: true,
          a: "c",
          pt: 12,
          vm: true,
          ...pl("1:0"),
          sentence: { before: "Quality & Product Safety Objectives ( Year", box: "year", after: ")", boxWidth: 16, pw: true, ...(first ? {} : { copy: true as const }) },
        },
        { w: cw16(10, 12), t: "F/SYS/16 (00/01.12.2021)", b: true, a: "c", pt: 12, vm: true, ...pl("1:1") },
      ],
    },
    { h: 14.55, cells: headings.map(([t, b, more], i): PaperCell => ({ w: C16[i], t, ...(b ? { b: true as const } : {}), vm: true, rs: 2, lh: 4.3, ...more, ...pl(`2:${i}`) })) },
    { h: 14.55, cells: C16.map((w): PaperCell => ({ w, t: "", skip: true })) },
  ];
}

/**
 * One objective, the record's line `ln`: its number, department, parameter and unit down the left, then a Plan row and an Actual row
 * (objective 8 an Actual - meters row as well); `merged` the rows his sheet writes once across January to June (held in January).
 */
function objective(ln: number, merged: { plan?: true; actual?: true } = {}, meters = false): PaperRow[] {
  const down = meters ? 3 : 2;
  const months = (which: "Plan" | "Actual" | "ActualMeters", once: boolean): PaperCell[] =>
    once ? [{ w: cw16(5, 10), col: `jan${which}`, ln, a: "c", vm: true }] : MONTHS.map((m, i): PaperCell => ({ w: C16[5 + i], col: `${m}${which}`, ln, a: "c", vm: true }));
  const rows: PaperRow[] = [
    {
      h: ROW16,
      cells: [
        { w: C16[0], t: String(ln + 1), a: "c", vm: true, pt: 11, rs: down },
        { w: C16[1], col: "department", ln, x: 0.7, vm: true, pt: 11, lh: 4.3, lines: true, rs: down },
        { w: C16[2], col: "parameter", ln, x: 0.7, vm: true, pt: 11, lh: 4.3, lines: true, rs: down },
        { w: C16[3], col: "unit", ln, a: "c", vm: true, pt: 11, lh: 4.3, lines: true, rs: down },
        { w: C16[4], t: "Plan", a: "c", vm: true, pt: 11 },
        ...months("Plan", !!merged.plan),
        { w: C16[11], col: "totalPlan", ln, a: "c", vm: true },
        { w: C16[12], col: "achieved", ln, a: "c", vm: true, rs: 2 },
      ],
    },
    {
      h: ROW16,
      cells: [
        ...C16.slice(0, 4).map((w): PaperCell => ({ w, t: "", skip: true })),
        { w: C16[4], t: "Actual", a: "c", vm: true, pt: 11 },
        ...months("Actual", !!merged.actual),
        { w: C16[11], col: "totalActual", ln, a: "c", vm: true },
        { w: C16[12], t: "", skip: true },
      ],
    },
  ];
  if (meters)
    rows.push({
      h: ROW16,
      cells: [
        ...C16.slice(0, 4).map((w): PaperCell => ({ w, t: "", skip: true })),
        { w: C16[4], t: "Actual - meters", a: "c", vm: true, pt: 11, lh: 4.3 },
        ...months("ActualMeters", false),
        { w: C16[11], col: "totalActualMeters", ln, a: "c", vm: true },
        { w: C16[12], t: "" },
      ],
    });
  return rows;
}

/** The 2026 sheet's eighteen objectives, the months it writes once (merged) as it merges them. */
const OBJECTIVE_ROWS: PaperRow[][] = [
  objective(0),
  objective(1),
  objective(2),
  objective(3, { plan: true, actual: true }),
  objective(4, { plan: true, actual: true }),
  // (his sheet rules no line between its six months here either: one cell to the eye)
  objective(5, { plan: true, actual: true }),
  objective(6),
  objective(7, {}, true),
  objective(8, { plan: true }),
  objective(9, { plan: true }),
  objective(10, { plan: true }),
  objective(11),
  objective(12, { plan: true }),
  objective(13, { plan: true }),
  objective(14),
  objective(15, { plan: true, actual: true }),
  objective(16),
  objective(17),
];

const objectivesPaper = (half: ObjectivesHalf): PaperTable => ({
  page: "landscape",
  left: 5.0,
  top: 5.0,
  font: "calibri",
  pt: 10,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  clearFoot: true,
  flows: true,
  head: objectivesHead(true, half).slice(0, 2),
  body: [
    ...objectivesHead(true, half).slice(2),
    ...OBJECTIVE_ROWS.slice(0, 5).flat(),
    ...objectivesHead(false, half),
    ...OBJECTIVE_ROWS.slice(5, 10).flat(),
    ...objectivesHead(false, half),
    ...OBJECTIVE_ROWS.slice(10, 15).flat(),
    ...objectivesHead(false, half),
    ...OBJECTIVE_ROWS.slice(15).flat(),
  ],
  foot: [],
});

const OBJECTIVES_PAPER: PaperTable = objectivesPaper("H1");
const OBJECTIVES_PAPER_H2: PaperTable = objectivesPaper("H2");

/** The half a sheet is for, from its date: dated July to December, his "H2" sheet (§397). */
export const objectivesHalfOf = (dueDate: string | undefined): ObjectivesHalf => (Number((dueDate ?? "").slice(5, 7)) >= 7 ? "H2" : "H1");

/** F/SYS/16 for a sheet dated `dueDate`: January to June, or July to December (§397). */
export const objectivesPaperFor = (dueDate: string | undefined): PaperTable => (objectivesHalfOf(dueDate) === "H2" ? OBJECTIVES_PAPER_H2 : OBJECTIVES_PAPER);

// ====================================================================================================================
// F/SYS/20 ANNUAL HARA REVIEW & VERIFICATION RECORD
// ====================================================================================================================

/** The paper's width: 14.2 mm (his text's margin) to 198.7 mm (the CCMs table's right edge). */
const W20 = 184.5;
/** One of his headings or lines across the page, outside the tables. */
const words20 = (t: string, h: number, more: Partial<PaperCell> = {}): PaperRow => ({ h, cells: [{ w: W20, t, x: 2.5, y: 0.8, lh: 7.1, edges: "", ...more }] });

function haraAnnualHead(first: boolean): PaperRow[] {
  const pl = (p: string): Partial<PaperCell> => (first ? {} : { pl: p });
  return [
    {
      h: 18.1,
      ...(first ? {} : { pb: true as const }),
      cells: [strip(2.6), { w: 175.7, t: "", img: { src: LOGO, x: 61.3, y: 0.15, w: 53.1, h: 17.8, alt: "Gujarat Print Pack Publications Pvt. Ltd." } }, strip(6.2)],
    },
    { h: 11.6, cells: [strip(2.6), { w: 175.7, t: "ANNUAL HARA REVIEW & VERIFICATION RECORD", b: true, u: true, a: "c", pt: 12, y: 4.1, ...pl("1:1") }, strip(6.2)] },
    {
      h: 7.7,
      cells: [strip(2.6), { w: 133.1, t: "F/SYS/20 (00 / 01.04.2025)", a: "c", pt: 12, y: 2.0, ...pl("2:1") }, { w: 42.6, t: "Page No.: 1 of 4", pt: 12, x: 1.7, y: 2.0, ...pl("2:2") }, strip(6.2)],
    },
    gap(W20, 5.3),
  ];
}

/** A line of the site's table: the label (42.4) and its box (133.1). */
const site = (label: string, box: string, h: number, more: Partial<PaperCell> = {}, bold = true): PaperRow => ({
  h,
  cells: [strip(4.6), { w: 42.4, t: label, ...(bold ? { b: true as const } : { pt: 12 }), x: 2.5, y: 0.8 }, { w: 133.1, box, x: 2.7, y: 0.8, ...more }, strip(4.4)],
});
const SITE_PARA: Partial<PaperCell> = { lines: true, grow: true, lh: 7.3 };

const HARA_ANNUAL_PAPER: PaperTable = {
  page: "portrait",
  left: 14.2,
  top: 13.0,
  font: "calibri",
  pt: 11,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  flows: true,
  // The double border round each page, as on F/SYS/12: 8.5 mm to 201.6 mm across, 8.7 mm to 288.2 mm down.
  pageFrame: { l: 5.7, t: 4.3, w: 193.1, h: 279.5, double: true },
  head: haraAnnualHead(true),
  body: [
    site("SITE NAME", "siteName", 7.9),
    site("SITE ADDRESS", "siteAddress", 8.0, SITE_PARA),
    site("PRODUCTS", "products", 29.3, { ...SITE_PARA, y: 3.0 }, false),
    site("DATE OF REVIEW", "dateOfReview", 7.7),
    site("HARA TEAM LEADER", "haraTeamLeader", 7.3),
    words20("1. Review Purpose", 7.1, { b: true }),
    words20(
      "To assess the effectiveness and continued applicability of the HARA Plan in relation to current operations, raw materials, processes, customer complaints, and regulatory updates.",
      14.2,
      { ww: 176 }
    ),
    words20("2. Changes Reviewed", 7.3, { b: true }),
    {
      h: 7.2,
      head: true,
      cells: [strip(4.6), { w: 32.4, t: "POINTS", b: true, x: 4.3, y: 0.8 }, { w: 143.7, t: "OBSERVATION", b: true, x: 4.4, y: 0.8 }, strip(3.8)],
    },
  ],
  // The twelve points, a line each; a line grows to the point's words and to what is observed.
  lines: {
    h: 7.2,
    count: 12,
    cells: [
      strip(4.6),
      { w: 32.4, col: "point", x: 4.3, y: 0.9, lh: 7.1, ww: 28, lines: true, grow: true },
      { w: 143.7, col: "observation", x: 4.4, y: 0.9, lh: 7.1, lines: true, grow: true },
      strip(3.8),
    ],
  },
  foot: [
    words20("3. CCMs / PRPs Verified", 7.3, { b: true }),
    {
      h: 7.3,
      cells: [
        strip(4.6),
        { w: 40.8, t: "CCM / CM / PRPs", b: true, x: 4.3, y: 0.9 },
        { w: 71.7, t: "Deviation(s)", b: true, x: 4.4, y: 0.9 },
        { w: 45.0, t: "Corrective Action(s)", b: true, x: 4.4, y: 0.9 },
        { w: 22.4, t: "Effective?", b: true, x: 4.4, y: 0.9 },
      ],
    },
    ...[1, 2, 3].map(
      (n): PaperRow => ({
        h: 14.3,
        cells: [
          strip(4.6),
          { w: 40.8, box: `ccm${n}`, x: 4.3, y: 0.9, lh: 7.1, lines: true, grow: true },
          { w: 71.7, box: `deviation${n}`, x: 4.4, y: 0.9, lh: 7.1, lines: true, grow: true },
          { w: 45.0, box: `correctiveAction${n}`, x: 4.4, y: 0.9, lh: 7.1, lines: true, grow: true },
          { w: 22.4, box: `effective${n}`, x: 4.4, y: 0.9 },
        ],
      })
    ),
    // His page 4: the head again, then the summary, the recommendations, the conclusion and the review team. (His page 3 starts the
    // summary under the CCMs; a box is not split across two pages, and under the last point and the CCMs it would not fit.)
    ...haraAnnualHead(false),
    words20("4. Validation/Verification Summary", 7.3, { b: true }),
    { h: 28.4, cells: [{ w: W20, box: "validationSummary", x: 2.5, y: 0.9, lh: 7.1, lines: true, grow: true, edges: "" }] },
    words20("5. Recommendations/Updates", 7.3, { b: true }),
    { h: 14.2, cells: [{ w: W20, box: "recommendations", x: 2.5, y: 0.9, lh: 7.1, lines: true, grow: true, edges: "" }] },
    words20("6. Conclusion", 7.3, { b: true }),
    { h: 21.3, cells: [{ w: W20, box: "conclusion", x: 2.5, y: 0.9, lh: 7.1, lines: true, grow: true, edges: "" }] },
    { h: 7.3, cells: [{ w: W20, b: true, x: 2.5, y: 0.9, edges: "", sentence: { before: "Next scheduled review:", box: "nextReview", after: "", boxWidth: 40, pw: true } }] },
    words20("7.HARA Review Team", 7.3, { b: true }),
    {
      h: 7.5,
      cells: [
        { w: 14.6, t: "Sr.no.", b: true, a: "c", vm: true },
        { w: 69.0, t: "Name of Product safety team member", b: true, a: "c", vm: true },
        { w: 63.3, t: "Designation", b: true, a: "c", vm: true },
        { w: 32.9, t: "Sign", b: true, a: "c", vm: true },
        strip(4.7),
      ],
    },
    ...[1, 2, 3, 4, 5, 6].map(
      (n): PaperRow => ({
        h: 7.5,
        cells: [
          { w: 14.6, t: `${n}.`, a: "c", vm: true },
          { w: 69.0, box: `team${n}Name`, x: 1.9, vm: true },
          { w: 63.3, box: `team${n}Designation`, x: 1.9, vm: true, lines: true },
          { w: 32.9, t: "" },
          strip(4.7),
        ],
      })
    ),
  ],
  // His team table has six lines; the format keeps eight members' boxes.
  offPaper: ["team7Name", "team7Designation", "team8Name", "team8Designation"],
};

export const SYS_PAPERS_354: Record<string, PaperTable> = {
  "sys-hara-monthly": HARA_MONTHLY_PAPER,
  "sys-mock-recall": MOCK_RECALL_PAPER,
  "sys-backward-trace": BACKWARD_TRACE_PAPER,
  "sys-forward-trace": FORWARD_TRACE_PAPER,
  "sys-objectives": OBJECTIVES_PAPER,
  "sys-hara-annual": HARA_ANNUAL_PAPER,
};

/** The paper's width, every row the same (the test holds each paper to it). */
export const SYS_PAPER_354_WIDTHS: Record<string, number> = {
  "sys-hara-monthly": W12,
  "sys-mock-recall": W13,
  "sys-backward-trace": WT,
  "sys-forward-trace": WT,
  "sys-objectives": W16,
  "sys-hara-annual": W20,
};
