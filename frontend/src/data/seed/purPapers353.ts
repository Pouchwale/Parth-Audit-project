// THE PURCHASE MODULE'S FORMATS DRAWN AS THE OWNER'S OWN PAPERS (REQUIREMENTS §353; the owner, 24-Nov-2026: "same format present
// in my system which is present in google drive ... whenever user download any document of any module or take a print on A4
// size paper, that should be very perfect").
//
// Each is read rule by rule and word by word off the print of his own file (source-documents/originals-pdf/<id>.pdf, the same
// files as his Drive's "BRCGS 25-26/Formats/3 Purchase"): every rule, word, face and size in millimetres and points.
//   F/PUR/01 Supplier Registration Form - his Word form, three pages, each with the logo / title / Document no. table, the
//            page's double border, the bulleted general details, the printed choices with their tick boxes, the writing
//            spaces under the underlined headings, INTERNAL OFFICE USE ONLY.
//   F/PUR/02 Supplier Audit Report - nine pages, the logo and the underlined title on each, page 1's ruled boxes and the
//            eight criteria with "Y / N / NA", a table of its own per section with the section's name as its first heading,
//            the shaded "EXTERNAL LABORATORY - IF USED" band, SUMMARY OF OBSERVATIONS, the observation table's four lines,
//            "Overall Status" and "Sign", the footer "Format no. ... Page n of 9" on every page.
//   F/PUR/03 List of Approved Suppliers - his 2021 sheet's letterhead (the company, the title with "F/PUR/03 (00/01.12.2021)"
//            beside it, "UPDATION AS ON :") over the plant's list's own columns, which the owner chose on 6-Nov-2026 (§188)
//            and whose print he settled on 24-Nov-2026 (§309: a service provider's SERVICE AGREEMENT one centred cell across
//            the six document columns, a supplier's name on one line, fixed columns).
//   F/PUR/05 RM & PM supplier performance register - his sheet: the letterhead, the four rating tables above the register,
//            the two-row headings, the "Enter value ..." / "Don't enter value ..." band inside the table, the eight ruled
//            lines; and the "Delayed" column the plant's 2025 register prints (§188), where that register prints it.
//   F/PUR/06 Service provider performance register - his sheet: the letterhead, "Rating Period :" in its ruled row, Sr. No.
//            1 to 13 and the thirteen ruled lines.
// Every printed word is the record's to type over where it stands (ownWords, §275); every box and column is the layout's
// (data/seed/purchaseLayouts.ts), so records, the fetch from Purchase Master Data, auto-fill and the downloads read them as
// before. No colour (§282); the paper's grey bands stay grey.

import type { PaperCell, PaperPick, PaperRow, PaperTable } from "./qcPaperTables";

const LOGO = "brand/gpp-paper-logo.png";
const LOGO_ALT = "Gujarat Print Pack Publications Pvt. Ltd.";
const COMPANY = "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED";
const GREY = "#dfdfdf";

/** A cell the paper leaves blank, with no rule of its own. */
const gapCell = (w: number, more: Partial<PaperCell> = {}): PaperCell => ({ w, t: "", edges: "", ...more });
/** A blank strip across the paper. */
const gapRow = (w: number, h: number, more: Partial<PaperCell> = {}): PaperRow => ({ h, cells: [gapCell(w, more)] });
/** A tick box beside its words ("□ Trading"): one answer of a choice. */
const tick = (box: string, value: string, word: string): PaperPick => ({ box, value, word, mark: "check" });
/** A printed answer ringed when chosen ("Proprietary / Partnership / ..."). */
const ring = (box: string, value: string, word: string = value): PaperPick => ({ box, value, word, mark: "ring" });

// ===========================================================================
// F/PUR/01 — SUPPLIER REGISTRATION FORM (00 / 01.12.2021), three pages. The header table 11.05 mm to 196.89 mm across the page,
// 12.78 mm down; the page's double border 8.72 mm to 201.38 mm across, 8.72 mm to 287.61 mm down. Calibri 12 pt.

const R_W = 185.84;
/** The header table's columns: the logo, the title, the labels, the values. */
const R_HEAD = [63.52, 66.68, 28.58, 27.06];
/** Where the paper's words stand: its bullets, its labels, its colons (mm in from the header table's left). */
const R_BULLET = 9.75;
const R_LABEL = 56.94;
const R_COLON = 2.8;
const R_VALUE = R_W - R_BULLET - R_LABEL - R_COLON;
/** A line of words: as tall as the paper's 12 pt line, its words on the middle of it. */
const R_LINE = 6.2;

/** The table at the head of every page: the logo, SUPPLIER REGISTRATION FORM, Document no. / Rev. no. / Effective date / Page no. */
const registrationHead = (page: number): PaperRow[] => {
  const pair = (label: string, value: string, h: number, first: boolean): PaperRow => ({
    h,
    ...(first && page > 1 ? { pb: true as const } : {}),
    cells: [
      first
        ? { w: R_HEAD[0], t: "", edges: "ltrb", rs: 4, img: { src: LOGO, x: 2.44, y: 2.57, w: 58.92, h: 21.59, alt: LOGO_ALT } }
        : { w: R_HEAD[0], edges: "ltrb", skip: true },
      first ? { w: R_HEAD[1], t: "SUPPLIER\nREGISTRATION FORM", edges: "ltrb", rs: 4, b: true, a: "c", pt: 18, y: 9.43, lh: 7.21 } : { w: R_HEAD[1], edges: "ltrb", skip: true },
      { w: R_HEAD[2], t: label, edges: "ltrb", x: 1.9, vm: true },
      { w: R_HEAD[3], t: value, edges: "ltrb", x: 1.91, vm: true },
    ],
  });
  return [
    pair("Document no.", "F/PUR/01", 7.92, true),
    pair("Rev. no.", "00", 7.97, false),
    pair("Effective date", "01.12.2021", 7.91, false),
    pair("Page no.", `${page} Of 3`, 7.92, false),
  ];
};

/** A bulleted general detail: ❑, the label, the colon, and what is written after it (the record's box, or the paper's words). */
const detail = (label: string, rest: PaperCell[], h = R_LINE): PaperRow => {
  // (a detail with room under it to write - an address - stands at the top of its room, as the paper sets it)
  const at: Partial<PaperCell> = h > R_LINE ? { y: 1.0 } : { vm: true };
  return {
    h,
    cells: [{ w: R_BULLET, t: "❑", edges: "", x: 3.17, pt: 9, ...(h > R_LINE ? { y: 1.6 } : { vm: true }) }, { w: R_LABEL, t: label, edges: "", ...at }, ...rest],
  };
};
const colon = (more: Partial<PaperCell> = {}): PaperCell => ({ w: R_COLON, t: ":", edges: "", vm: true, ...more });
const valueBox = (box: string, w = R_VALUE, more: Partial<PaperCell> = {}): PaperCell => ({ w, box, edges: "", x: 0.6, vm: true, ...more });
/** A box of several lines written from the top of its room down (an address, a list): its row grows only for more than the room holds. */
const roomBox = (box: string, w: number, more: Partial<PaperCell> = {}): PaperCell => ({ w, box, edges: "", x: 0.6, y: 1.0, lines: true, grow: true, ...more });
/** A heading the paper underlines over a writing space, 3.17 mm in. */
const underlined = (t: string): PaperRow => ({ h: R_LINE, cells: [gapCell(3.17), { w: R_W - 3.17, t, edges: "", u: true, vm: true }] });
const note = (t: string, h = R_LINE): PaperRow => ({ h, cells: [gapCell(3.17), { w: R_W - 3.17, t, edges: "", vm: true }] });
/** The writing space under a heading: the record's block of several lines, written from the top down. */
const space = (box: string, h: number): PaperRow => ({ h, cells: [gapCell(3.17), roomBox(box, R_W - 3.17 - 1.5, { x: 0.4, y: 0.6 }), gapCell(1.5)] });
/** One of the documents asked for: "1." and its words, as the paper's numbered list sets them. */
const listed = (n: string, t: string, h = 5.16): PaperRow => ({ h, cells: [{ w: 11.14, t: n, edges: "", x: 1.57, vm: true }, { w: R_W - 11.14, t, edges: "", vm: true }] });
/** Words and tick boxes at the paper's own places along a line, the rest of the line blank (`width`: the line's, or after a label's). */
const along = (cells: PaperCell[], width = R_W): PaperCell[] => {
  const used = cells.reduce((a, c) => a + c.w, 0);
  return used < width - 0.01 ? [...cells, gapCell(Math.round((width - used) * 100) / 100)] : cells;
};
const tickCell = (w: number, pick: PaperPick): PaperCell => ({ w, t: "", edges: "", pick: [pick] });

const REGISTRATION: PaperTable = {
  page: "portrait",
  left: 11.05,
  top: 12.78,
  font: "calibri",
  pt: 12,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  flows: true,
  pageFrame: { l: 2.33, t: 4.06, w: 192.66, h: 278.89, double: true },
  // The supplier's service agreement and the date it runs out (§192) are kept on the record; the paper has no place for them.
  offPaper: ["agreementValidUpto"],
  head: registrationHead(1),
  body: [
    // ---- page 1: GENERAL DETAILS
    gapRow(R_W, 5.0),
    { h: 7.5, cells: [{ w: R_W, t: "GENERAL DETAILS – TO BE FILLED UP BY SUPPLIER", edges: "", b: true, a: "c", cx: 1.24, pt: 14.04, vm: true }] },
    gapRow(R_W, 3.6),
    detail("SUPPLIER’S NAME", [colon(), valueBox("supplierName")]),
    gapRow(R_W, 4.13),
    detail("TYPE OF CONCERN", [colon(), { w: R_VALUE, t: "", edges: "", x: 1.2, vm: true, pick: ["Proprietary", "Partnership", "Private Limited", "Limited"].map((v) => ring("typeOfConcern", v)) }]),
    gapRow(R_W, 4.14),
    detail("ADDRESS (OFFICE)", [colon({ vm: undefined, y: 1.0 }), roomBox("addressOffice", R_VALUE)], 25.87),
    detail("ADDRESS (WORKS)", [colon({ vm: undefined, y: 1.0 }), roomBox("addressWorks", R_VALUE)], 25.83),
    detail("CONTACT PERSON", [colon(), valueBox("contactPerson", 48.01), { w: 27.5, t: "DESIGNATION :", edges: "", vm: true }, valueBox("contactDesignation", R_VALUE - 48.01 - 27.5)]),
    gapRow(R_W, 4.13),
    detail("TELEPHONE NOS", [colon(), valueBox("telephoneNos")]),
    gapRow(R_W, 4.13),
    detail("E-MAIL ADDRESS", [colon(), valueBox("emailAddress")]),
    gapRow(R_W, 4.17),
    // (the paper writes this label's colon right after its words, not in the colon's column)
    { h: R_LINE, cells: [{ w: R_BULLET, t: "❑", edges: "", x: 3.17, pt: 9, vm: true }, { w: R_LABEL + R_COLON, t: "WEEKLY OFF / WORKING HOURS :", edges: "", vm: true }, valueBox("weeklyOffWorkingHours")] },
    gapRow(R_W, 4.34),
    detail(
      "COMPANY ACTIVITIES",
      along(
        [
          { w: 1.8, t: ":", edges: "", vm: true },
          tickCell(20.1, tick("companyActivities", "Trading", "Trading")),
          gapCell(15.71),
          tickCell(30.7, tick("companyActivities", "Manufacturing", "Manufacturing")),
          gapCell(20.1),
          tickCell(19.9, tick("companyActivities", "Services", "Services")),
        ],
        R_VALUE + R_COLON,
      ),
    ),
    gapRow(R_W, 4.13),
    detail(
      "NO. OF EMPLOYEES",
      along(
        [
          { w: 21.16, t: ": Technical", edges: "", vm: true },
          { w: 23.4, box: "employeesTechnical", edges: "ltrb", a: "c", vm: true },
          gapCell(5.5),
          { w: 25.9, t: "Non-Technical", edges: "", a: "r", vm: true },
          gapCell(0.8),
          { w: 23.2, box: "employeesNonTechnical", edges: "ltrb", a: "c", vm: true },
        ],
        R_VALUE + R_COLON,
      ),
    ),
    gapRow(R_W, 4.14),
    detail("YEAR OF COMMENCEMENT", [colon(), valueBox("yearOfCommencement")]),
    gapRow(R_W, 4.13),
    underlined("RANGE OF PRODUCTS / SERVICES OFFERED"),
    space("rangeOfProducts", 30.23),
    note("(Please attach a separate sheet if required)"),
    // ---- page 2
    ...registrationHead(2),
    gapRow(R_W, 10.1),
    underlined("LIST OF MAJOR CUSTOMERS"),
    space("majorCustomers", 50.6),
    note("(Attach separate sheet if required)"),
    gapRow(R_W, 4.2),
    underlined("PARTICULARS OF PLANT MACHINERY & OTHER INFRASTRUCTURE (NOT APPLICABLE FOR TRADERS)"),
    space("plantMachinery", 61.0),
    note("(Attach separate sheet if required)", 5.15),
    underlined("DETAILS OF QUALITY CONTROL DEPARTMENT (PROVIDE DETAILS OF TESTING FACILITY, TEST METHODS)"),
    space("qualityControlDept", 29.95),
    note("(Please attach a separate sheet if required)"),
    gapRow(R_W, 3.26),
    {
      h: R_LINE,
      cells: along([
        gapCell(3.17),
        { w: 136.4, t: "DO YOU HOLD ISO 9001 / ISO 22000 / HACCP / FSSC / BRCGS CERTIFICATION:", edges: "", vm: true },
        tickCell(13.9, tick("holdsCertification", "Yes", "YES")),
        gapCell(2.6),
        tickCell(13.3, tick("holdsCertification", "No", "NO")),
      ]),
    },
    gapRow(R_W, 5.26),
    note("Please provide following documents along with this form.", 5.16),
    listed("1.", "Technical data sheet / Specification sheet"),
    listed("2.", "MSDS"),
    listed("3.", "Food grade declaration or compatible to food contact packaging"),
    listed("4.", "Traceability protocol or yours internal Traceability record for one of the lots supplied to us"),
    // ---- page 3
    ...registrationHead(3),
    gapRow(R_W, 4.3),
    listed("5.", "Copy of management system certification (e.g. ISO 9001 / FSSC 22000 / BRCGS as applicable)", 6.8),
    // the rule over the supplier's signing block
    { h: 4.9, cells: [gapCell(2.67), { w: 181.9, t: "", edges: "b", heavy: "b" }, gapCell(R_W - 2.67 - 181.9)] },
    { h: R_LINE, cells: [gapCell(3.17), { w: R_LABEL + R_BULLET - 3.17, t: "INFORMATION FURNISHED BY", edges: "", vm: true }, colon(), gapCell(R_VALUE)] },
    gapRow(R_W, 4.27),
    ...(
      [
        ["NAME", "furnishedName"],
        ["DESIGNATION", "furnishedDesignation"],
        ["DATE", "furnishedDate"],
        ["PLACE", "furnishedPlace"],
      ] as const
    ).map(([label, box]): PaperRow => ({ h: 5.17, cells: [gapCell(3.17), { w: R_LABEL + R_BULLET - 3.17, t: label, edges: "", vm: true }, colon(), valueBox(box)] })),
    // the supplier's signature and seal, over the words that ask for it
    { h: 5.16, cells: [gapCell(94.47), { w: 88.0, box: "signatureWithSeal", edges: "", x: 0.4, vm: true }, gapCell(R_W - 94.47 - 88.0)] },
    { h: 5.19, cells: [gapCell(94.47), { w: R_W - 94.47, t: "SIGNATURE WITH COMPANY’S SEAL", edges: "", vm: true }] },
    // the line drawn across under it, which ends the supplier's part
    { h: 4.6, cells: [gapCell(5.04), { w: 178.08, t: "", edges: "b" }, gapCell(R_W - 5.04 - 178.08)] },
    { h: 7.4, cells: [{ w: R_W, t: "INTERNAL OFFICE USE ONLY", edges: "", b: true, a: "c", cx: -9.7, pt: 14.04, vm: true }] },
    gapRow(R_W, 4.57),
    {
      h: R_LINE,
      cells: along([
        gapCell(3.17),
        { w: R_LABEL + R_BULLET - 3.17, t: "Status of Supplier", edges: "", vm: true },
        colon(),
        gapCell(9.2),
        tickCell(13.9, tick("statusOfSupplier", "New", "New")),
        gapCell(10.7),
        tickCell(25.9, tick("statusOfSupplier", "Established", "Established")),
      ]),
    },
    gapRow(R_W, 4.23),
    // The five assessment types down the page at 128.55 mm, beside the question and its "(Please attach status report)".
    ...["By Visit / Supplier audit", "By Registration Form Details", "By Placing Trial Orders", "By GFSI scheme certification", "By Exception (Market Reputation)"].map(
      (option, i): PaperRow => {
        const width = [46.5, 55.1, 44.9, 56.0, 64.6][i];
        const words = i === 0 ? "If new supplier/new product, type of Assessment Status:" : i === 1 ? "(Please attach status report)" : "";
        return {
          h: 5.4,
          cells: along([gapCell(3.17), { w: 114.33, t: words, edges: "", vm: true }, tickCell(width, tick("assessmentType", option, option))]),
        };
      },
    ),
    gapRow(R_W, 4.78),
    { h: R_LINE, cells: [gapCell(3.17), { w: 92.6, t: "Products / Services for which Supplier is approved :", edges: "", y: 1.0 }, roomBox("approvedProductsServices", R_W - 3.17 - 92.6)] },
    gapRow(R_W, 4.35),
    {
      h: R_LINE,
      cells: along([
        gapCell(3.17),
        { w: 88.92, t: "ASSESSMENT STATUS", edges: "", vm: true },
        { w: 2.8, t: ":", edges: "", vm: true },
        gapCell(9.3),
        tickCell(27.4, tick("assessmentStatus", "APPROVED", "APPROVED")),
        gapCell(10.7),
        tickCell(23.2, tick("assessmentStatus", "REJECTED", "REJECTED")),
      ]),
    },
    gapRow(R_W, 9.33),
    // SIGNATURE & AUTHORISED PERSON, the heavy rule under it closing the office's block
    {
      h: R_LINE,
      cells: [
        gapCell(2.67),
        { w: 89.42, t: "SIGNATURE & AUTHORISED PERSON", edges: "b", x: 0.5, vm: true, heavy: "b" },
        { w: 2.8, t: ":", edges: "b", vm: true, heavy: "b" },
        { w: 181.9 - 89.42 - 2.8, box: "authorisedPerson", edges: "b", x: 0.6, vm: true, heavy: "b" },
        gapCell(R_W - 2.67 - 181.9),
      ],
    },
  ],
  foot: [],
};

// ===========================================================================
// F/PUR/02 — SUPPLIER AUDIT REPORT (00 / 01.12.2021), nine pages. The tables 6.86 mm to 194.52 mm across the page; the logo
// 4.09 mm down; the footer 275.4 mm down. Calibri 11 pt; the footer Tahoma 10 pt (drawn in Arial, the nearest face here).

const A_W = 187.66;
/** A section's table: the point (its number and its words), AUDITED YES/NO, C/NC/NA or RATING, COMMENTS. */
const A_NO = 12.71;
const A_POINT = 66.68;
const A_COLS = [A_NO + A_POINT, 22.24, 19.05, 66.98];
/** Page 1's tables stand 2.66 mm further in. */
const A_IN = 2.66;
const A_BOX_W = 184.96;

/** The logo and the underlined title at the head of every page. */
const auditHead = (page: number): PaperRow[] => [
  {
    h: 22.5,
    ...(page > 1 ? { pb: true as const } : {}),
    cells: [{ w: A_W, t: "", edges: "", img: { src: LOGO, x: 59.55, y: 0.09, w: 58.91, h: 21.59, alt: LOGO_ALT } }],
  },
  { h: 12.0, cells: [{ w: A_W, t: "SUPPLIER AUDIT REPORT", edges: "", b: true, u: true, a: "c", cx: -1.83, pt: 20.04, y: 1.99 }] },
];
/** "Format no. – F/PUR/02   Rev. – 00   Effective Date – 01.12.2021   Page n of 9" at the foot of every page. */
const auditFoot = (page: number, above: number): PaperRow[] => [
  gapRow(A_W, above),
  {
    h: 5.5,
    cells: [
      {
        w: A_W,
        t: "",
        edges: "",
        at: [
          { t: "Format no. – F/PUR/02", y: 0.6, x: 14.02, pt: 9.96, f: "arial" },
          { t: "Rev. – 00", y: 0.6, x: 62.8, pt: 9.96, f: "arial" },
          { t: "Effective Date – 01.12.2021", y: 0.6, x: 95.6, pt: 9.96, f: "arial" },
          { t: `Page ${page} of 9`, y: 0.6, x: 150.0, pt: 9.96, f: "arial" },
        ],
      },
    ],
  },
];

/** The heading row of a section's table: the section's name (the record's own words for it), and the three headings. */
const sectionHeading = (ln: number, h: number, answer: "C/NC/NA" | "RATING", comments: "COMMENTS / ACTIONS" | "COMMENTS"): PaperRow => ({
  h,
  cells: [
    { w: A_COLS[0], col: "section", ln, edges: "ltrb", b: true, x: 1.91, vm: true, bg: GREY },
    { w: A_COLS[1], t: "AUDITED\nYES/NO", edges: "ltrb", b: true, a: "c", y: 0.81, lh: 4.74, bg: GREY },
    { w: A_COLS[2], t: answer, edges: "ltrb", b: true, a: "c", y: 3.18, bg: GREY },
    { w: A_COLS[3], t: comments, edges: "ltrb", b: true, a: "c", y: 3.18, bg: GREY },
  ],
});
/** One audit point: its number and its words (the record's printed cells), and the three answers written beside it. */
const point = (ln: number, h: number): PaperRow => ({
  h,
  cells: [
    { w: A_NO, col: "itemNo", ln, edges: "ltb", x: 1.91, y: 0.8 },
    { w: A_POINT, col: "auditPoint", ln, edges: "trb", x: 1.0, y: 0.8, lh: 4.74 },
    { w: A_COLS[1], col: "audited", ln, edges: "ltrb", a: "c", vm: true },
    { w: A_COLS[2], col: "rating", ln, edges: "ltrb", a: "c", vm: true },
    { w: A_COLS[3], col: "comments", ln, edges: "ltrb", x: 1.0, y: 0.8, lh: 4.74, lines: true, grow: true },
  ],
});

/** The eight audit criteria page 1 prints, each followed by Y / N / NA (the one in scope ringed). */
const CRITERIA = [
  "1. HACCP/Quality system",
  "2. Factory premises/location",
  "3. Hygiene of personnel",
  "4. Infestation/foreign body control",
  "5. Raw materials control",
  "6. Production & process control",
  "7. Product analysis & quality assurance",
  "8. Product storage and distribution",
];
const SUMMARY = [
  "1. HACCP/Quality system –",
  "2. Factory premises/location      -",
  "3. Hygiene of personnel -",
  "4. Infestation/foreign body control -",
  "5. Raw materials control –",
  "6. Production & process control -.",
  "7. Product analysis & quality assurance –",
  "8. Product storage and distribution -",
];
/** The observation table: Section | Details of observations / NC | Response evidence ... | Date of closure (6.9 to 189.1 mm). */
const NC = [19.31, 62.54, 70.04, 30.31];
const NC_REST = A_W - NC.reduce((a, b) => a + b, 0);
const ncLine = (n: number | null, h: number): PaperRow => {
  const boxes: PaperCell[] =
    n === null
      ? NC.map((w): PaperCell => ({ w, t: "", edges: "ltrb" }))
      : [
          { w: NC[0], box: `nc${n}Section`, edges: "ltrb", x: 1.0, vm: true },
          { w: NC[1], box: `nc${n}Details`, edges: "ltrb", x: 1.0, y: 0.8, lines: true, grow: true },
          { w: NC[2], box: `nc${n}Response`, edges: "ltrb", x: 1.0, y: 0.8, lines: true, grow: true },
          { w: NC[3], box: `nc${n}Closure`, edges: "ltrb", a: "c", vm: true },
        ];
  return { h, cells: [...boxes, gapCell(NC_REST)] };
};

const AUDIT_REPORT: PaperTable = {
  page: "portrait",
  left: 6.86,
  top: 4.0,
  font: "calibri",
  pt: 11.04,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  flows: true,
  head: auditHead(1),
  body: [
    // ---- page 1: the visit, the scope, the criteria, the comments
    gapRow(A_W, 3.54),
    {
      h: 19.39,
      cells: [
        gapCell(A_IN),
        { w: 94.9, t: "SUPPLIER:", edges: "ltrb", x: 1.91, y: 0.81, over: [{ box: "supplier", x: 1.91, y: 6.2, w: 91.0, h: 6.0 }] },
        { w: 90.06, t: "CONTACTS:", edges: "ltrb", x: 1.9, y: 0.81, over: [{ box: "contacts", x: 1.9, y: 6.2, w: 87.0, h: 6.0 }] },
        gapCell(A_W - A_IN - A_BOX_W),
      ],
    },
    {
      h: 4.83,
      cells: [
        gapCell(A_IN),
        { w: 28.0, t: "DATE OF VISIT:", edges: "ltb", x: 1.91, vm: true },
        { w: 66.9, box: "dateOfVisit", edges: "trb", x: 0.5, vm: true },
        { w: 19.8, t: "VISIT NO:", edges: "ltb", x: 1.9, vm: true },
        { w: 70.26, box: "visitNo", edges: "trb", x: 0.5, vm: true },
        gapCell(A_W - A_IN - A_BOX_W),
      ],
    },
    {
      h: 9.57,
      cells: [
        gapCell(A_IN),
        { w: 25.6, t: "AUDITOR (S):", edges: "ltb", x: 1.91, y: 0.8 },
        { w: A_BOX_W - 25.6, box: "auditors", edges: "trb", x: 0.5, y: 0.8, lines: true, grow: true },
        gapCell(A_W - A_IN - A_BOX_W),
      ],
    },
    gapRow(A_W, 1.82),
    {
      h: 11.94,
      cells: [
        gapCell(A_IN),
        { w: 63.27, t: "SCOPE OF AUDIT", edges: "ltrb", b: true, x: 1.91, vm: true, bg: GREY },
        { w: A_BOX_W - 63.27, box: "scopeOfAudit", edges: "ltrb", x: 1.0, y: 0.8, lines: true, grow: true, bg: GREY },
        gapCell(A_W - A_IN - A_BOX_W),
      ],
    },
    {
      h: 11.05,
      cells: [
        gapCell(A_IN),
        { w: 63.27, t: "PRODUCT SUPPLIED", edges: "ltrb", b: true, x: 1.91, vm: true },
        { w: A_BOX_W - 63.27, box: "productSupplied", edges: "ltrb", x: 1.0, y: 0.8, lines: true, grow: true },
        gapCell(A_W - A_IN - A_BOX_W),
      ],
    },
    gapRow(A_W, 1.82),
    {
      h: 9.15,
      cells: [
        gapCell(A_IN),
        {
          w: A_BOX_W,
          t: "",
          edges: "ltrb",
          at: [
            { t: "AUDIT CRITERIA:", y: 0.81, x: 1.91, pt: 11.04, b: true },
            { t: "DEPENDING ON THE TYPE OF SUPPLY CRITERIA MAY BE OMITTED - IF OMITTED PLEASE MARK N/A", y: 5.54, x: 1.91, pt: 9.96, b: true },
          ],
        },
        gapCell(A_W - A_IN - A_BOX_W),
      ],
    },
    { h: 4.6, cells: [gapCell(A_IN), { w: A_BOX_W, t: "", edges: "lr" }, gapCell(A_W - A_IN - A_BOX_W)] },
    ...CRITERIA.map(
      (words, i): PaperRow => ({
        h: 9.47,
        cells: [
          gapCell(A_IN),
          { w: 88.92, t: words, edges: "l", x: 1.91, y: 1.38 },
          { w: 31.0, t: "", edges: "", b: true, y: 1.38, pick: [ring(`criterion${i + 1}`, "Y"), ring(`criterion${i + 1}`, "N"), ring(`criterion${i + 1}`, "NA")] },
          { w: A_BOX_W - 88.92 - 31.0, t: "", edges: "r" },
          gapCell(A_W - A_IN - A_BOX_W),
        ],
      }),
    ),
    { h: 1.11, cells: [gapCell(A_IN), { w: A_BOX_W, t: "", edges: "lrb" }, gapCell(A_W - A_IN - A_BOX_W)] },
    // COMMENTS: at the head of its box, the auditor's words written under it
    { h: 10.0, cells: [gapCell(A_IN), { w: A_BOX_W, t: "COMMENTS:", edges: "ltr", x: 1.91, y: 5.54 }, gapCell(A_W - A_IN - A_BOX_W)] },
    { h: 56.93, cells: [gapCell(A_IN), { w: A_BOX_W, box: "auditComments", edges: "lrb", x: 1.91, y: 0.6, lines: true, grow: true }, gapCell(A_W - A_IN - A_BOX_W)] },
    ...auditFoot(1, 14.99),
    // ---- page 2: 1. QUALITY SYSTEMS/HACCP
    ...auditHead(2),
    gapRow(A_W, 17.3),
    sectionHeading(0, 11.94, "C/NC/NA", "COMMENTS / ACTIONS"),
    ...[0, 1, 2, 3, 4, 5, 6].map((ln) => point(ln, 22.27)),
    ...auditFoot(2, 51.7),
    // ---- page 3: 2. FACTORY PREMISES/LOCATION
    ...auditHead(3),
    gapRow(A_W, 22.47),
    sectionHeading(7, 11.94, "RATING", "COMMENTS"),
    ...[7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((ln) => point(ln, 16.23)),
    ...auditFoot(3, 40.14),
    // ---- page 4: 3. HYGIENE OF PERSONNEL, 3.1 to 3.9
    ...auditHead(4),
    gapRow(A_W, 30.26),
    sectionHeading(17, 12.02, "RATING", "COMMENTS"),
    ...[17, 18, 19, 20, 21, 22, 23, 24, 25].map((ln) => point(ln, 20.67)),
    ...auditFoot(4, 8.55),
    // ---- page 5: 3.10, then 4. INFESTATION/FOREIGN BODY CONTROL
    ...auditHead(5),
    gapRow(A_W, 1.85),
    point(26, 20.62),
    gapRow(A_W, 15.66),
    sectionHeading(27, 16.65, "RATING", "COMMENTS"),
    ...[27, 28, 29, 30, 31, 32].map((ln) => point(ln, 21.7)),
    ...auditFoot(5, 51.91),
    // ---- page 6: 5. RAW MATERIALS CONTROL, 6. PRODUCTION AND PROCESS CONTROL 6.1
    ...auditHead(6),
    gapRow(A_W, 48.34),
    sectionHeading(33, 11.94, "RATING", "COMMENTS"),
    point(33, 22.52),
    point(34, 20.67),
    point(35, 22.22),
    point(36, 23.79),
    point(37, 25.42),
    gapRow(A_W, 5.24),
    sectionHeading(38, 11.94, "RATING", "COMMENTS"),
    point(38, 23.72),
    ...auditFoot(6, 21.08),
    // ---- page 7: 6.2, 6.5, 7. PRODUCT ANALYSIS AND QUALITY ASSURANCE, 8. PACKED PRODUCT STORAGE AND DISTRIBUTION 8.1
    ...auditHead(7),
    gapRow(A_W, 1.81),
    point(39, 23.75),
    point(40, 23.76),
    gapRow(A_W, 23.75),
    sectionHeading(41, 16.68, "RATING", "COMMENTS"),
    point(41, 17.66),
    // the shaded band across the section: the record's own line for it
    { h: 7.28, cells: [{ w: A_W, col: "auditPoint", ln: 42, edges: "ltrb", b: true, x: 1.95, vm: true, bg: GREY }] },
    point(43, 21.42),
    point(44, 17.44),
    point(45, 15.88),
    point(46, 17.49),
    gapRow(A_W, 5.25),
    sectionHeading(47, 16.68, "RATING", "COMMENTS"),
    point(47, 23.33),
    ...auditFoot(7, 4.7),
    // ---- page 8: 8.2 to 8.5, SUMMARY OF OBSERVATIONS, the observation table's first three lines
    ...auditHead(8),
    gapRow(A_W, 1.81),
    point(48, 20.66),
    point(49, 23.8),
    point(50, 20.66),
    point(51, 20.61),
    gapRow(A_W, 5.47),
    { h: 5.5, cells: [gapCell(A_IN), { w: A_W - A_IN, t: "SUMMARY OF OBSERVATIONS", edges: "", b: true, u: true, x: 0, vm: true }] },
    gapRow(A_W, 4.73),
    ...SUMMARY.map(
      (words, i): PaperRow => ({
        h: 10.9,
        cells: [gapCell(A_IN), { w: 67.6, t: words, edges: "", x: 0, y: 0.6 }, { w: A_W - A_IN - 67.6, box: `summary${i + 1}`, edges: "", x: 0.6, y: 0.6, lines: true, grow: true }],
      }),
    ),
    {
      h: 15.7,
      cells: [
        { w: NC[0], t: "Section", edges: "ltrb", b: true, x: 1.91, y: 0.97, pt: 12 },
        { w: NC[1], t: "Details of observations / NC", edges: "ltrb", b: true, x: 1.91, y: 0.97, pt: 12 },
        { w: NC[2], t: "Response evidence received from\nsupplier / on-site verification", edges: "ltrb", b: true, x: 1.9, y: 0.97, lh: 7.75, pt: 12 },
        { w: NC[3], t: "Date of\nclosure", edges: "ltrb", b: true, x: 1.9, y: 0.97, lh: 7.75, pt: 12 },
        gapCell(NC_REST),
      ],
    },
    ncLine(1, 7.93),
    ncLine(2, 7.91),
    ncLine(3, 7.96),
    ...auditFoot(8, 6.5),
    // ---- page 9: the table's fourth line, Overall Status, Sign
    ...auditHead(9),
    gapRow(A_W, 1.85),
    ncLine(null, 7.92),
    gapRow(A_W, 15.4),
    {
      h: 5.6,
      cells: [
        gapCell(5.16),
        { w: 29.6, t: "Overall Status -", edges: "", pt: 12, vm: true },
        { w: A_W - 5.16 - 29.6, t: "", edges: "", pt: 12, vm: true, pick: [ring("overallStatus", "Approved"), ring("overallStatus", "Rejected")] },
      ],
    },
    gapRow(A_W, 4.73),
    { h: 5.6, cells: [gapCell(5.16), { w: A_W - 5.16, t: "Sign: -", edges: "", pt: 12, vm: true, over: [{ box: "sign", x: 12.4, y: 0.3, w: 44.0, h: 5.0, rule: 43.4 }] }] },
    ...auditFoot(9, 190.4),
  ],
  foot: [],
};

// ===========================================================================
// F/PUR/03 — LIST OF APPROVED SUPPLIERS (RM, PM, SERVICE PROVIDER), landscape. The 2021 sheet's letterhead (0.51 mm to 278.93 mm
// across, 13.17 mm down); the plant's list's columns in their own words, their shares read off "LIST OF APPROVED SUPPLIERS.pdf".

// (each column as wide as its longest heading word at the list's 6 pt - the plant's own list breaks "MANUFACTUR / ER" and
// "DECLARATIO / N" where its columns are narrower - and SUPPLIER NAME as wide as the longest name on one line, §309)
const L_COLS: [string, string, number, "c" | undefined][] = [
  ["vendorCode", "Vendor Code", 10.6, "c"],
  ["supplierName", "SUPPLIER NAME", 37.6, undefined],
  ["productService", "PRODUCT / SERVICE", 16.6, undefined],
  ["applicableProduct", "APPLICABLE PRODUCT (MONO CARTON / CORRUGATED BOX / PRESSURE LABEL / SHRINK SLEEVE)", 18.6, undefined],
  ["category", "CATEGORY (TRADER / MANUFACTURER / SERVICE PROVIDER)", 17.8, undefined],
  ["manufacturerName", "MANUFACTURER NAME (IF MATERIALS PROCURED FROM TRADERS)", 18.4, undefined],
  ["srf", "SRF", 6.8, "c"],
  ["tdsSpecs", "TDS/SPECS", 12.4, "c"],
  ["msds", "MSDS", 6.8, "c"],
  ["foodGradeDeclaration", "FOOD GRADE DECLARATION", 15.6, "c"],
  ["traceability", "TRACEABILITY", 15.8, "c"],
  ["isoCertificate", "ISO CERTIFICATE", 14.4, "c"],
  ["contactPerson", "CONTACT PERSON", 14.8, "c"],
  ["contactNumber", "CONTACT NUMBER", 15.2, "c"],
  ["location", "LOCATION", 12.6, "c"],
  ["approvalDate", "APPROVAL DATE", 13.0, "c"],
  ["reapprovalDueDate", "Re-approval Due date", 12.2, "c"],
  ["fileNo", "File No", 8.12, "c"],
];
const L_SR = 7.8;
const L_W = L_SR + L_COLS.reduce((a, [, , w]) => a + w, 0);
/** The title cell ends where LOCATION does, as the sheet's title cell ends over its last columns. */
const L_TITLE = L_SR + L_COLS.slice(0, 15).reduce((a, [, , w]) => a + w, 0);

const APPROVED_LIST: PaperTable = {
  page: "landscape",
  left: 0.51,
  top: 13.17,
  font: "calibri",
  pt: 6,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  // (the list runs on over as many pages as it has suppliers, each with the letterhead and the headings)
  flows: true,
  // Printed at the list's own size with its columns fixed, as the owner settled it (§309): nineteen columns of words and names
  // kept whole have no room on A4 at the 8 pt a refitted paper takes (§282), so the list is not refitted.
  fixedColumns: true,
  // ...its columns measured from what the list holds (each as wide as its longest heading word, SUPPLIER NAME as its longest
  // name): so a value is never written smaller than the list's size - a long one wraps in its cell - and no word is cut in two.
  readFit: true,
  head: [
    { h: 6.22, cells: [{ w: L_W, t: COMPANY, edges: "ltrb", b: true, a: "c", pt: 11.04, vm: true, heavy: "rb" }] },
    {
      h: 6.95,
      cells: [
        { w: L_TITLE, t: "LIST OF APPROVED SUPPLIERS (RM, PM, SERVICE PROVIDER)", edges: "ltrb", b: true, u: true, a: "c", pt: 8.04, vm: true, heavy: "rb" },
        { w: L_W - L_TITLE, t: "F/PUR/03 (00/01.12.2021)", edges: "ltrb", b: true, a: "c", pt: 8.04, vm: true, heavy: "rb" },
      ],
    },
  ],
  body: [
    {
      h: 5.33,
      cells: [
        { w: 24.6, t: "UPDATION AS ON :", edges: "ltb", b: true, u: true, x: 0.5, vm: true, pt: 6.96 },
        { w: L_W - 24.6, box: "updationAsOn", edges: "trb", b: true, x: 0.3, vm: true, pt: 6.96 },
      ],
    },
    {
      h: 14.14,
      head: true,
      cells: [
        { w: L_SR, t: "SR. NO.", edges: "ltrb", b: true, a: "c", vm: true },
        ...L_COLS.map(([, words, w]): PaperCell => ({ w, t: words, edges: "ltrb", b: true, a: "c", vm: true, lh: 2.75 })),
      ],
    },
  ],
  // Seven ruled lines, as the sheet prints; the list grows as suppliers are approved (65 on Purchase Master Data).
  lines: {
    h: 6.1,
    count: 7,
    cells: [
      { w: L_SR, num: "all", edges: "ltrb", a: "c", vm: true },
      ...L_COLS.map(
        ([col, , w, a]): PaperCell => ({ w, col, edges: "ltrb", vm: true, ...(a ? { a } : { x: 0.6 }) }),
      ),
    ],
  },
  foot: [],
};

// ===========================================================================
// F/PUR/05 — RAW MATERIAL (LABEL STOCK, INK, FILMS etc.) & PACKING MATERIALS SUPPLIER (PAPER CORE, WOODEN PALLETS etc.)
// PERFORMANCE MONITORING REGISTER (00/01.12.2021), landscape. The frame 2.41 mm to 277.03 mm across, 19.22 mm down. The sheet's
// thirteen columns, and "Delayed" where the plant's 2025 register prints it (between the lots rejected and the ratings), its
// width taken from the others in their shares; the four rating tables above it on the register's first nine columns, as that
// register sets them.

const P_COLS: [string, number][] = [
  ["supplierName", 19.75],
  ["period", 20.22],
  ["material", 26.41],
  ["lotsReceived", 20.22],
  ["lotsRejected", 22.94],
  ["delayed", 15.0],
  ["productSafetyRating", 21.37],
  ["qualityRating", 15.58],
  ["deliveryRating", 22.29],
  ["productSafetyWeightage", 24.1],
  ["qualityWeightage", 20.61],
  ["deliveryWeightage", 18.45],
  ["overallRating", 13.53],
  ["grade", 14.15],
];
const PW = P_COLS.map(([, w]) => w);
const P_W = PW.reduce((a, b) => a + b, 0);
const sumOf = (from: number, to: number): number => Math.round(PW.slice(from, to).reduce((a, b) => a + b, 0) * 100) / 100;
/** The rating tables stand on the first nine columns; the rest of their rows is the frame's blank. */
const P_KEY = sumOf(0, 9);

/** A row of the rating tables: nine cells on the first nine columns, the frame's blank after them. */
const keyRow = (h: number, words: (string | [string, true])[], more: Partial<PaperCell> = {}): PaperRow => ({
  h,
  cells: [
    ...words.map((w, i): PaperCell => {
      const [t, bold] = Array.isArray(w) ? w : [w, false];
      return { w: PW[i], t, edges: "ltrb", a: "c", vm: true, pt: 5.64, ...(bold ? { b: true as const } : {}), ...more };
    }),
    // (the frame's right rule down the blank beside the rating tables)
    { w: P_W - P_KEY, t: "", edges: "r" },
  ],
});

const PERFORMANCE_REGISTER: PaperTable = {
  page: "landscape",
  left: 2.41,
  top: 19.22,
  font: "calibri",
  pt: 6.36,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  // (a register of every material supplier runs on over pages, each with the letterhead and the headings)
  flows: true,
  head: [
    { h: 6.99, cells: [{ w: P_W, t: COMPANY, edges: "ltrb", b: true, u: true, a: "c", pt: 10.08, vm: true, heavy: "rb" }] },
    {
      h: 3.85,
      cells: [
        {
          w: sumOf(0, 11),
          t: "RAW MATERIAL (LABEL STOCK, INK, FILMS etc.) & PACKING MATERIALS SUPPLIER (PAPER CORE, WOODEN PALLETS etc.) PERFORMANCE MONITORING REGISTER",
          edges: "ltrb",
          b: true,
          u: true,
          a: "c",
          pt: 8.76,
          vm: true,
          heavy: "rb",
        },
        { w: sumOf(11, 14), t: "F/PUR/05 (00/01.12.2021)", edges: "ltrb", b: true, a: "c", pt: 8.76, vm: true, heavy: "rb" },
      ],
    },
  ],
  body: [
    gapRow(P_W, 1.25, { edges: "lr" }),
    // the rating tables' titles: Product Safety Rating, Quality Rating, Delivery Rating, Overall Rating (over its three columns)
    {
      h: 2.63,
      cells: [
        { w: PW[0], t: "Product Safety Rating", edges: "ltrb", b: true, u: true, a: "c", vm: true, pt: 5.64 },
        { w: PW[1], t: "", edges: "ltrb" },
        { w: PW[2], t: "Quality Rating", edges: "ltrb", b: true, u: true, a: "c", vm: true, pt: 5.64 },
        { w: PW[3], t: "", edges: "ltrb" },
        { w: PW[4], t: "Delivery Rating", edges: "ltrb", b: true, u: true, a: "c", vm: true, pt: 5.64 },
        { w: PW[5], t: "", edges: "ltrb" },
        { w: sumOf(6, 9), t: "Overall Rating", edges: "ltrb", b: true, u: true, a: "c", vm: true, pt: 5.64 },
        { w: P_W - P_KEY, t: "", edges: "r" },
      ],
    },
    keyRow(2.83, [["% Acceptance", true], ["Marks", true], ["% Acceptance", true], ["Marks", true], ["Delivery Time", true], ["Marks", true], ["Marks", true], ["Grade", true], ["Action", true]], { pt: 6.36 }),
    keyRow(2.76, ["No infestation", "100 Marks", "100% accept.", "100 Marks", "Before Time / < 7 Days PO", "100 Marks", "If ≥ 90", ['"A" Grade', true], ["Continue", true]]),
    keyRow(2.75, ["Infestation", "0 Marks", "Accepted on Segregation", "50 Marks", "> 7 Days & < 15 days delay", "75 Marks", "If < 90 & ≥ 80", ['"B" Grade', true], ["Continue & improve", true]]),
    keyRow(2.62, ["", "", "Rejected & send back to Supplier", "00 Marks", ">  15  days delay", "50 Marks", "If < 80", ['"C" Grade', true], ["Replace / improve", true]]),
    gapRow(P_W, 2.63, { edges: "lr" }),
    // the register's headings, over two rows: the ratings' letters and the weightages' shares under their names
    {
      h: 4.23,
      head: true,
      cells: [
        { w: PW[0], t: "Supplier / Service\nprovider Name", edges: "ltrb", b: true, a: "c", vm: true, rs: 2, lh: 2.92 },
        { w: PW[1], t: "Period under review", edges: "ltrb", b: true, a: "c", vm: true, rs: 2 },
        { w: PW[2], t: "Material Description", edges: "ltrb", b: true, a: "c", vm: true, rs: 2 },
        { w: PW[3], t: "Nos. of Lots received", edges: "ltrb", b: true, a: "c", vm: true, rs: 2 },
        { w: PW[4], t: "Nos. of Lots rejected /\nreturned / infested", edges: "ltrb", b: true, a: "c", vm: true, rs: 2, lh: 2.92 },
        { w: PW[5], t: "Delayed", edges: "ltrb", b: true, a: "c", vm: true, rs: 2 },
        { w: PW[6], t: "Product Safety Rating", edges: "ltrb", b: true, a: "c", vm: true },
        { w: PW[7], t: "Quality Rating", edges: "ltrb", b: true, a: "c", vm: true },
        { w: PW[8], t: "Delivery Rating", edges: "ltrb", b: true, a: "c", vm: true },
        { w: PW[9], t: "Product safety Weightage", edges: "ltrb", b: true, a: "c", vm: true },
        { w: PW[10], t: "Quality Weightage", edges: "ltrb", b: true, a: "c", vm: true },
        { w: PW[11], t: "Delivery Weightage", edges: "ltrb", b: true, a: "c", vm: true },
        { w: PW[12], t: "Overall Rating", edges: "ltrb", b: true, a: "c", vm: true },
        { w: PW[13], t: "Grade", edges: "ltrb", b: true, a: "c", vm: true, rs: 2 },
      ],
    },
    {
      h: 6.69,
      head: true,
      cells: [
        ...PW.slice(0, 6).map((w): PaperCell => ({ w, edges: "ltrb", skip: true })),
        ...["(X)", "(Y)", "(Z)", "50%", "40%", "10%", ""].map((t, k): PaperCell => ({ w: PW[6 + k], t, edges: "ltrb", b: true, a: "c", vm: true })),
        { w: PW[13], edges: "ltrb", skip: true },
      ],
    },
    // the band inside the table: what is written, and what is worked out
    {
      h: 3.22,
      cells: [
        { w: sumOf(0, 9), t: "Enter value based on above criteria in the following cells", edges: "ltrb", b: true, a: "c", vm: true, pt: 7.56 },
        { w: sumOf(9, 14), t: "Don’t enter value in the following cell, its formula based", edges: "ltrb", b: true, a: "c", vm: true, pt: 7.56 },
      ],
    },
  ],
  // Eight ruled lines; the weightages, the Overall Rating and the Grade are worked out on each (0.00 on a line not yet rated).
  lines: {
    h: 8.26,
    count: 8,
    cells: P_COLS.map(([col, w], k): PaperCell => ({ w, col, edges: "ltrb", vm: true, ...(k < 3 ? { x: 0.6 } : { a: "c" as const }) })),
  },
  foot: [],
};

// ===========================================================================
// F/PUR/06 — SERVICE PROVIDER - PERFORMANCE MONITORING REGISTER (00/01.12.2021). The frame 5.46 mm to 210.1 mm across, 10.16 mm
// down; Calibri 9.36 pt.

const SP = [10.08, 33.87, 29.05, 35.02, 40.47, 27.91, 28.24];
const SP_W = SP.reduce((a, b) => a + b, 0);
const SP_COLS = ["serviceDescription", "supplierName", "deliveryRating", "qualityRating", "overallRating", "status"];
/** The columns of words, whose line grows to them; the ratings are figures, one line. */
const WORDY = new Set(["serviceDescription", "supplierName", "status"]);
/** A line of words in them: the sheet's Calibri 9.36 pt, set close as his cells set two lines. */
const SP_LH = 3.9;
const SP_HEADS = ["Sr. No.", "Description of Service", "Supplier Name", "Delivery Parameter\nrating (Max 50)", "Quality & Product Safety\nParameter rating (Max 50)", "Overall Rating", "Status / Decision"];

const SERVICE_REGISTER: PaperTable = {
  page: "portrait",
  left: 5.46,
  top: 10.16,
  font: "calibri",
  pt: 9.36,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  head: [
    { h: 11.3, cells: [{ w: SP_W, t: COMPANY, edges: "ltrb", b: true, a: "c", pt: 15.6, vm: true, heavy: "rb" }] },
    {
      h: 7.16,
      cells: [
        { w: 148.49, t: "SERVICE PROVIDER - PERFORMANCE MONITORING REGISTER", edges: "ltrb", b: true, a: "c", pt: 14.04, vm: true, heavy: "rb" },
        { w: SP_W - 148.49, t: "F/PUR/06 (00/01.12.2021)", edges: "ltrb", b: true, a: "c", pt: 10.92, vm: true, heavy: "rb" },
      ],
    },
    // the double rule under the title
    gapRow(SP_W, 1.49, { edges: "lrb", heavy: "rb" }),
  ],
  body: [
    {
      h: 7.49,
      cells: [
        { w: 22.4, t: "Rating Period :", edges: "ltb", b: true, x: 0.59, vm: true, heavy: "b" },
        { w: SP_W - 22.4, box: "ratingPeriod", edges: "trb", x: 0.4, vm: true, heavy: "rb" },
      ],
    },
    gapRow(SP_W, 1.31, { edges: "lr", heavy: "r" }),
    { h: 8.43, head: true, cells: SP_HEADS.map((t, k): PaperCell => ({ w: SP[k], t, edges: "ltrb", b: true, a: "c", vm: true, lh: 4.28, ...(k === SP.length - 1 ? { heavy: "r" as const } : {}) })) },
  ],
  // Thirteen ruled lines, numbered 1 to 13 as the sheet prints them. A line is the sheet's 7.28 mm and grows to its words where a
  // service or a supplier's name runs to two or three lines in his narrow columns ("QUALITY & PRODUCT SAFETY MANAGEMENT
  // CONSULTANT", "Hindustan Security Services", as Purchase Master Data writes them): on the screen a box of several lines, in
  // print the words, never over the line under them (the owner, 25-Nov-2026, REQUIREMENTS §382).
  lines: {
    h: 7.28,
    count: 13,
    cells: [
      { w: SP[0], num: "all", edges: "ltrb", a: "c", vm: true },
      ...SP_COLS.map((col, k): PaperCell => ({
        w: SP[k + 1],
        col,
        edges: "ltrb",
        vm: true,
        ...(WORDY.has(col) ? { x: 0.8, lh: SP_LH, lines: true as const, grow: true as const } : { a: "c" as const }),
        ...(k === SP_COLS.length - 1 ? { heavy: "r" as const } : {}),
      })),
    ],
  },
  foot: [],
};

export const PUR_PAPERS_353: Record<string, PaperTable> = {
  "pur-supplier-registration": REGISTRATION,
  "pur-supplier-audit-report": AUDIT_REPORT,
  "pur-approved-suppliers": APPROVED_LIST,
  "pur-supplier-performance": PERFORMANCE_REGISTER,
  "pur-service-provider-performance": SERVICE_REGISTER,
};
