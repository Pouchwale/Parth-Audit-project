import type { LogColumn, LogHeaderField, LogSheetLayout } from "../../types";

// SYSTEM / MANAGEMENT — HARA, SITE SECURITY, MOCK WITHDRAWAL AND TRACEABILITY
// (REQUIREMENTS §76). Six of the Product Safety Team Leader's formats, all six
// supplied FILLED on 25-Sep-2026 as PDFs (source-documents/F-SYS-*.pdf,
// rendered unaltered to frontend/public/source/fsys*.jpg so each page can be
// shown beside its form). The filled pages are stored as records of their own
// in sysHaraTraceabilityRecords.ts.
//
//   sys-hara-monthly    F/SYS/12 (Rev No: 00, Date: 01.12.2021)  MONTHLY REVIEW & HARA VERIFICATION MEETING RECORD – …
//     — "F-SYS-12-Monthly HARA Verification_April 2024.pdf", 3 pages, the meeting of 22 April 2024
//   sys-site-security   F/SYS/17 (00/01.12.2021)  SITE SECURITY RISK ASSESSMENT
//     — "F-SYS-17-Site security risk assessment record(R-2026).pdf", 4 pages, every point checked 01.01.2026
//   sys-hara-annual     F/SYS/20 (00 / 01.04.2025)  ANNUAL HARA REVIEW & VERIFICATION RECORD
//     — "F-SYS-20_Annual HARA Verification Record_Jan 2026.pdf", 4 pages, the review of 27th January 2026
//   sys-mock-recall     F/SYS/13 (00/01.12.2021)  Mock Product Withdrawal Record - …
//     — three files of one page each, one per product: "…record label.pdf" (LABEL, 10.01.2025),
//       "…record Pouch.pdf" (Pouch, 28.01.2025), "…record label Sleeve.pdf" (SHRINK SLEEVE, 05.02.2025)
//   sys-backward-trace  F/SYS/14 (00/01.12.2021)  BACKWARD TRACEABILITY RECORD (CUSTOMER to SUPPLIER)
//     — "F-SYS-14-Backward Traceability Record - Label- Aculife - Copy.pdf", 2 pages, 12.12.2024
//   sys-forward-trace   F/SYS/15 (00/01.12.2021)  FORWARD TRACEABILITY CHECK LIST (SUPPLIER to CUSTOMER)
//     — "F-SYS-15-Forward Traceability Record - Label.pdf", 1 page, 18.12.2024
//
// VERBATIM MEANS VERBATIM. Every label, printed line and fixed row below is the
// page's own wording, spelling, capitals, dashes and spacing — "efecctive",
// "satisafactory", "Offier", "12Minuts", "Mss. Nikki", "Sales Sales team
// member", "GUAJRAT", "Hardner", "ingridents", "calender", "an possibility",
// "Its in place", "Used in accordance to", the en dash of "Manager – QA" beside
// the hyphen of "Manager - HR", and the double spaces the pages really hold
// ("Customer  Information", "Roll &  Pouch", "EA Viscosity  - Laminates",
// "3  x 3500"). Where the text layer and the picture disagree the picture was
// followed; where the picture cuts text off (below) the text layer supplied the
// rest. Only spaces a reader cannot see at the start or end of a cell are gone.
//
// WHAT HAD TO BE REPRESENTED DIFFERENTLY FROM THE PAPER, AND WHY
//   * The grid draws its own Sr. No. down the side, so no layout declares one:
//     F/SYS/12's 1–24, F/SYS/17's 1–26 and F/SYS/20's twelve POINTS are the
//     grid's own numbers, and F/SYS/15's "1st Issue" is its line 1.
//   * A cell the paper wraps is joined back into one line; a cell the paper
//     writes as separate lines keeps them, joined with "\n" (F/SYS/12's
//     "F/HR/15 / F/HR/16 / RD/04", F/SYS/17's sub-points, F/SYS/20's bullets).
//     A wrap was told from a line the writer broke by whether the next word
//     would have fitted on the line above: F/SYS/20's first Summary bullet
//     starts "5 non-conformities & all closed" on a line of its own although
//     "5" would have fitted after "March 2025.", so that break is the page's
//     own and is kept. F/SYS/17 indents the sub-lines of points 1 to 3 under
//     their heading (a cell indent, not characters); the indent is not
//     reproduced. Its point 19 types each line as "•" and four spaces, and
//     they are kept so.
//   * A layout has ONE grid, so every other table on these pages is boxes, each
//     box's label carrying the table's heading, its line number and its column
//     heading: F/SYS/12's and F/SYS/20's HARA Review Team, F/SYS/20's CCMs /
//     PRPs table, F/SYS/13's Customer Information and Contact Person tables.
//   * THE HARA REVIEW TEAM IS EIGHT LINES OF BOXES on both HARA formats. The
//     paper prints 7 lines on F/SYS/12 and 6 on F/SYS/20 — as many as that
//     day's team, the table being typed in Word — and a line cannot be added to
//     a controlled form's boxes the way Word adds a row, so eight are given; the
//     lines a page does not fill stay blank. The team's Sign column is a
//     handwritten signature and is empty on both pages, so it is not a box: the
//     record's own signature is its Submit and Verify.
//   * BOXES THAT HOLD A SENTENCE ARE PARAGRAPHS (the text box shows one line and
//     cuts the rest off on a record that is read, not written): F/SYS/20's SITE
//     ADDRESS and, on each CCMs / PRPs line, the CCM, Deviation(s) and
//     Corrective Action(s); F/SYS/13's scenario, the telephonic conversation
//     and the Response; F/SYS/14's Key RM line and Packing Quantity.
//   * A layout's printed headings and lines (its `instructions`) are drawn above
//     ALL its boxes. So F/SYS/13's band "Information of the product" and the
//     "(Information that we are looking for)" under it stand at the top of the
//     form rather than over the boxes they head ("FG code" to "Telephonic
//     conversation"), and F/SYS/20's "1. Review Purpose" and "2. Changes
//     Reviewed" stand above the SITE NAME … HARA TEAM LEADER boxes they follow
//     on the paper; "2. Changes Reviewed" is the heading of the grid. The words
//     are the paper's; nothing is added to them to say so.
//   * F/SYS/12 and F/SYS/13 carry their date — and F/SYS/13 its product — in the
//     title ("… MEETING RECORD – 22 April 2024", "Mock Product Withdrawal Record
//     - LABEL"). The title's words are the box's label; what follows it is the
//     box.
//   * F/SYS/13 is ONE format printed three times with a different product in
//     the title, so it is one layout whose first box offers the three products
//     as the titles print them ("LABEL", "SHRINK SLEEVE", "Pouch"). Its "Start
//     Time" label is cut to "Start Tim" on all three pages, and "Total time" to
//     "Total tim" on the LABEL page, by the value box printed over the label's
//     last letter — the text layer holds the whole word, which is the label.
//     Its times are written "2.09 PM" and are kept as 24-hour "14:09"; Total
//     time is words and figures ("1.02 hours", "12Minutes", "1 hour 12Minuts")
//     and is kept as written. Under "Information of the product" the page
//     writes one line per fact ("Production order number : - 64547"); each is
//     a box labelled with the line's words, and the " : - " between is not
//     stored. The sentence written under those lines ("Ms. Kapila Barad
//     (Manager - QA) had Telephonic conversation with …") has no label on the
//     paper; its box is named with the sentence's own words, "Telephonic
//     conversation". The Responsible table is the grid, and its band heading is
//     the heading drawn over the grid's four columns.
//   * F/SYS/14 IS ALL LABEL–VALUE PAIRS — the lot's six boxes, then a
//     Description / Observation table in which each Description is a box
//     labelled with it — so it declares no columns (see the records file for
//     the one empty line its record holds). Bare dates are dates; everything
//     else is text as written. The small frames the page draws round each
//     box's contents under Packing Quantity are not reproduced; the lines are.
//   * F/SYS/15's "1st Issue" block is a list of Description / Observation pairs
//     for ONE issue of the material. Issues are what grow — a roll issued twice
//     is a "2nd Issue" block — so the pairs are TURNED into the grid's columns
//     (each Description the heading of its column, in the page's order) and
//     each issue is a line; the line number is the issue's.
//   * F/SYS/20 writes "Next scheduled review: 1st January 2027" in bold as the
//     last sentence of its Conclusion. It is a date with a box of its own
//     ("Next scheduled review"), so the Conclusion box holds the sentences
//     before it and the date sits in that box, not in both.
//   * Every page's own footer or format line ("F/SYS/14 (00/01.12.2021)", "Page
//     No.: 2 of 3", "1 of 4") is the document header the app prints on every
//     record, so it is not repeated as a field.
//
// WHAT THE PAGES SAY THAT DOES NOT ADD UP (each kept exactly as written)
//   F/SYS/12  The HARA Review Team prints 7 lines and no signatures. Point 14
//             ("Has any new Hazards been identified?") is split across pages 1
//             and 2. Point 24's review comment is printed indented by one space;
//             the space is not kept. Page 3 repeats the verification table's heading row above the
//             HARA Review Team, with no row under it; it is not reproduced.
//   F/SYS/17  Point 8's cell is too short for its text: its third and fifth
//             lines ("Monthly verify register copy for Vehicle/ Driver/visitor",
//             "Tobacco, gutkha, Lighter, Cigarette, Product)") are cut off on
//             the page and are taken whole from the PDF's text layer. Point 8's
//             "(Driver/ Visitor." opens a bracket it never closes. Pages 2 to 4
//             carry a hidden copy of point 1's line in the text layer (a print
//             title row); it is not on the pages and is ignored. Point 23's By
//             Whom names two posts, "Manager - Production & Manager - Dispatch".
//             Point 25's "Controlled access to sensitive information" could be
//             a wrap of the line above as much as a line of its own (its first
//             word would not have fitted there); it is kept as a sub-point of
//             its own, as the other points' lines are. Every point was checked
//             the same day, 01.01.2026.
//   F/SYS/20  The Conclusion says "Action items noted are minor and already
//             being addressed" but the record notes no action item: every
//             Corrective Action(s) is "Not required" and the Recommendations say
//             "No other recommendations". Key Staff changes names Vishnu Jadav
//             (Plant Head) and Ajaz (Pouching In charge) as new joinees; neither
//             is on the 7.HARA Review Team list. The third Regulatory bullet
//             opens "(permitting the use of …" and never closes it. The review
//             team prints 6 lines and no signatures. SITE NAME prints
//             "PUBLICATIONS" where the other formats' headers print
//             "PUBLICATION".
//   F/SYS/13  "Was the Mock Recall efecctive?" — neither Yes nor No is marked on
//             any of the three pages, so it is left blank on all three. The
//             Pouch page's scenario is "smudged printing on the product name"
//             but its Response describes "missing print on the EAN code in some
//             of the sleeves" and "part quantity of  sleeves" — the Sleeve
//             page's words — for a pouch job in roll form. The Pouch and Sleeve
//             Responses write "Sales Sales team member", and call Ms. Vaishali
//             a "Sales team member" where the sentence above calls her "Sales
//             coordinator", and the Responsible table calls her, and Nikki,
//             "Sales Executive"; the LABEL Response writes "Mss. Nikki". The
//             Pouch page writes "Production order number : 64699" and "Sales
//             order number : 25721" without the " - " the other two put after
//             the colon. The times: LABEL 14:09 → 15:11 is 62 minutes, written
//             "1.02 hours" (hours and minutes, not decimal hours); Pouch 17:26
//             → 17:38 is 12 minutes, written "12Minutes"; SHRINK SLEEVE 14:21 →
//             15:33 is 72 minutes, written "1 hour 12Minuts" in the box and
//             "(1.12 hours)" in the Response. Flexo - Production is Ajay
//             Vaghela on the LABEL and SHRINK SLEEVE pages and Akash Patel on
//             the Pouch page, each "Manager - Production". The LABEL page
//             writes "FG Code:" and a space inside its code ("FGLA 13270"); the
//             others "FG code:".
//   F/SYS/14  "Printing production date" is 21.07.2027 — three years after the
//             QC inspection (21.07.2024) that follows it and after the dispatch
//             of 23.07.2024; kept as 2027 and not corrected. The Sales order is
//             dated 12.07.2023, a year before the customer order (11.07.2024) it
//             answers. The customer order number is not written ("-"), nor is a
//             reel number. The P/O Number, 58610, is the production order's
//             number. The third box's line is printed " 1 Box↓", indented by one
//             space; the space is not kept. The arithmetic holds:
//             12000 − 11100 = 900; 11100 − 10330 = 770; the 10330 inspected is
//             the 10330 slit; and 11 boxes × 10500 + (7000 + 3000) + (6800 +
//             2700) = 135000 — the order quantity and the Quantity — in 13
//             boxes, the Box number on page 2.
//   F/SYS/15  1970 issued − 986 printed = 984 balance, as written. The balance
//             is of the issue, not of the lot: 3910 Mtr were received as
//             internal batch "17229/13128/1 & 2", and only this one issue of
//             1970 Mtr (slitted roll batch 17229/13128/2) is traced. The
//             Customer name and Job name are typed smaller than the page's
//             other entries.

/** A supplied page, shown unaltered beside the form (REQUIREMENTS §71). */
const page = (file: string, caption: string) => ({ src: `/source/${file}`, caption });

// A box that names a person offers the plant's employees on its own (the
// renderer reads the label). These say who, but not one of the plant's people,
// so they offer nothing: a customer, a customer's contact, a supplier, the site.
// Nor does a Designation box or column: the renderer reads the "sign" in
// "Designation" as a signature, and would offer people's names for a post.
const NOT_EMPLOYEES = "";
// The datalist of employee names every log sheet draws: for a box or column
// that IS one of the plant's people but whose label does not say "name".
const EMPLOYEES = "log-sheet-employees";

// ===========================================================================
// THE HARA REVIEW TEAM — F/SYS/12 and F/SYS/20
// ===========================================================================

const TEAM_LINES = 8;

/** Eight lines of the team table, the table's heading and the line number in front of each column heading. */
const haraTeamFields = (heading: string): LogHeaderField[] =>
  Array.from({ length: TEAM_LINES }, (_, i) => i + 1).flatMap((n): LogHeaderField[] => [
    { key: `team${n}Name`, label: `${heading} ${n} — Name of Product safety team member`, type: "text", autoFill: { carryForward: true } },
    { key: `team${n}Designation`, label: `${heading} ${n} — Designation`, type: "text", autoFill: { carryForward: true }, list: NOT_EMPLOYEES },
  ]);

/** The team as a page lists it, as the eight lines' box values (blank beyond the page's last line). */
export function haraTeamValues(team: [name: string, designation: string][]): Record<string, string> {
  const values: Record<string, string> = {};
  for (let n = 1; n <= TEAM_LINES; n++) {
    values[`team${n}Name`] = team[n - 1]?.[0] ?? "";
    values[`team${n}Designation`] = team[n - 1]?.[1] ?? "";
  }
  return values;
}

// ===========================================================================
// F/SYS/12 — MONTHLY REVIEW & HARA VERIFICATION MEETING RECORD
// ===========================================================================

/**
 * The 24 verification attributes and the reference documents printed beside
 * each, in the page's order. Both are the format's: the meeting answers Status,
 * Verification status and Review comments against them.
 */
export const HARA_MONTHLY_ROWS: { attribute: string; reference: string }[] = (
  [
    ["Is there any change in Product Safety Policy?", "Annexure – A, (BRCGS Manual – PSMS/M/01)"],
    ["Has there been any change in the HARA Team?", "Appendix A (HARA Manual – PSMS/M/02)"],
    ["Have any changes been made in existing premises?", "PSMS/M/02"],
    ["Is there any change in plant layout?", "RD/07"],
    ["Have any new equipment been installed?", "F/MNT/01"],
    ["Is cleaning & sanitation being carried out as per plan?", "F/HR/15\nF/HR/16\nRD/04"],
    ["Has any new product been introduced?", "Production order"],
    ["Has any new Raw Material been introduced?", "Incoming material specification"],
    ["Has any new packing material been introduced?", "Incoming material specification"],
    ["Is there any change in process sequence?", "PSMS/M/02"],
    ["Are there any changes in Process Control Norms?", "Production log sheets"],
    ["Has training been provided to new employees?", "F/HR/05\nF/HR/06"],
    ["Is pest control being carried out as per planned frequency?", "F/HR/17\nF/HR/18\nPest control record\nPest control agreement"],
    // Split across the foot of page 1 and the top of page 2 on the paper.
    ["Has any new Hazards been identified?", "PSMS/M/02"],
    ["Process noncompliance", "Internal rejection record"],
    ["Has any recall of products been made due to product safety?", "F/SYS/13"],
    ["Any change in Product recall team members?", "PSMS-PRO-04"],
    ["Any new supplier / service provider added?", "F/PUR/03"],
    ["Any customer complaints received?", "F/SA/03"],
    ["Any Product safety incident reported?", "F/SYS/11"],
    ["Any employee found with cut or injury?", "F/HR/22"],
    ["Any site security violation reported?", "F/SYS/17"],
    ["Deviation in CCP", "CCP monitoring record"],
    [
      "Is there any changes or updates in regulations pertaining to product safety or legality in country of origin (FSSAI) or country of export (EC or USFDA regulations)",
      "List of Regulations",
    ],
  ] as const
).map(([attribute, reference]) => ({ attribute, reference }));

/** The HARA Review Team of 22 April 2024, page 3 — seven lines. */
export const HARA_MONTHLY_2024_04_TEAM: [name: string, designation: string][] = [
  ["Kapila Barad", "Manager – QA / PSTL"],
  ["Akash Patel", "Manager – Production / Deputy PSTL"],
  ["Ajay Vaghela", "Production Supervisor"],
  ["Mukesh Patel", "Manager – Maintenance"],
  ["Dipak Parmar", "Manager – Purchase"],
  ["Nalin Darji", "Manager – Store"],
  ["Vinay Bhojak", "Manager - HR"],
];

const HARA_MONTHLY: LogSheetLayout = {
  documentId: "sys-hara-monthly",
  // The title carries the meeting's date: "… MEETING RECORD – 22 April 2024".
  headerFields: [
    { key: "meetingDate", label: "MONTHLY REVIEW & HARA VERIFICATION MEETING RECORD –", type: "date", required: true, autoFill: { dueDate: true } },
  ],
  // The attribute and its references are printed; the three answers are this
  // month's meeting's, never last month's.
  columns: [
    { key: "attribute", label: "Verification attributes", type: "text", fixed: true, width: 320 },
    { key: "status", label: "Status (Yes/No)", type: "yesno", width: 100, autoFill: { fresh: true } },
    { key: "reference", label: "Reference documents / records", type: "text", fixed: true, width: 200 },
    { key: "verification", label: "Verification status (C / NC)", type: "select", options: ["C", "NC"], width: 120, autoFill: { fresh: true } },
    // A comment runs to a sentence ("1 complaint received in Sleeve segment in
    // this month & has been actioned as per CAR form"), so it is written in a box
    // that shows all of it.
    { key: "comments", label: "Review comments", type: "text", width: 260, multiline: true, autoFill: { fresh: true } },
  ],
  rowMode: { kind: "fixedRows", rows: HARA_MONTHLY_ROWS.map((r) => ({ ...r })) },
  footerFields: haraTeamFields("HARA Review Team"),
  // The page's descriptive part: who sits on the team.
  specimenHeader: haraTeamValues(HARA_MONTHLY_2024_04_TEAM),
  originalPages: [
    page("fsys12-hara-monthly-2024-04-p1.jpg", "F/SYS/12 (Rev No: 00, Date: 01.12.2021) — the meeting of 22 April 2024, page 1 of 3 (attributes 1 to 14), as supplied"),
    page("fsys12-hara-monthly-2024-04-p2.jpg", "F/SYS/12 — the meeting of 22 April 2024, page 2 of 3 (attributes 14 to 24), as supplied"),
    page("fsys12-hara-monthly-2024-04-p3.jpg", "F/SYS/12 — the meeting of 22 April 2024, page 3 of 3 (the HARA Review Team), as supplied"),
  ],
  specimenSource:
    "F-SYS-12-Monthly HARA Verification_April 2024.pdf — F/SYS/12 (Rev No: 00, Date: 01.12.2021), the meeting of 22 April 2024, the plant's own entries; the specimen is its HARA Review Team — the meeting's answers are its own and are never carried to another",
};

// ===========================================================================
// F/SYS/17 — SITE SECURITY RISK ASSESSMENT
// ===========================================================================

/**
 * The 26 discussion points, each with its sub-lines, and who checks it. A point
 * is printed as a heading and its sub-points on lines of their own (joined with
 * "\n"); a line the cell wraps is one line here. Point 8's cell cuts its third
 * and fifth lines off on the page — they are taken whole from the text layer.
 */
export const SITE_SECURITY_POINTS: { discussionPoint: string; byWhom: string }[] = (
  [
    ["Product Security Committee\nEstablished\nAppointed\nCommunicated to all levels\nTrained on PS procedures", "Product Safety Team Leader"],
    ["Product security awareness\nCommunicated\nInformation displayed\nReporting structure in place", "Product Safety Team Leader"],
    [
      "Emergency preparedness and response\nPlan in place\nCommunicated\nRelevant info displayed\nRoutinely inspected and verified\nReporting structure in place",
      "Product Safety Team Leader",
    ],
    [
      "Recall system\nRecall procedure in place\nCommunicated\nRecall team in place\nRelevant info displayed\nRoutinely verified\nReporting structure in place",
      "Product Safety Team Leader",
    ],
    ["Perimeter protection\nIn place\nInspection/monitor frequency\nReporting structure in place in case of risk identified", "Manager - HR & admin"],
    [
      "Securing and monitoring of all product, entrances and accesses when not in use\nIncluding openings, hatches, vents, door ventilations, utilities, vehicles, storage vessels etc.",
      "Manager - HR & admin",
    ],
    ["Access control\nRestricted access\nMinimised entrances\nAccount for all keys", "Manager - HR & admin"],
    [
      "Access control Verification Method at Main gate for (Driver/ Visitor.\nMonthly verify register copy for Vehicle/ Driver/visitor Entry check points. (Comply Basic Checkpoints Tobacco, gutkha, Lighter, Cigarette, Product)",
      "Manager - HR & admin",
    ],
    ["Identification and control of areas for possible harbouring of people and contaminants", "Manager - HR & admin"],
    ["Adequate lighting\n(interior and exterior)", "Manager - Maintenance"],
    ["Chemicals\nControlled access\nAdequate storage\nRestricted access to storage area\nMSDS in place", "Manager - Production"],
    ["Hazardous chemicals\nIdentification / isolation\nControlled access\nMethod of disposal in place", "Manager - Production"],
    ["Pesticides\nControlled access\nUsed in accordance to Product regulations", "Product Safety Team Leader"],
    [
      "Laboratory area\nSecured area\nRestricted access\nAccount for all keys\nAdequate storage of chemicals\nRoutinely inspected for Product safety risks",
      "Manager - QA",
    ],
    [
      "System in place for\nScreening\nIdentification & Location on site\nIdentification and recognition in plant\nMonitoring of unusual health conditions\nMonitoring of unusual behaviour\nAdequate Product Security training",
      "Manager - HR & admin",
    ],
    [
      "Restricted access\nIdentification of employees with unlimited access\nReassessment of access levels periodically\nLimited physical access to operational areas\nAll lost or mislaid combinations, locks, keys and passwords will be changed",
      "Manager - HR & admin",
    ],
    [
      "Personal items\nRestricted in facility\nControl and labelling of medication in facility\nRegular inspections of personal lockers, bags etc.",
      "Manager - HR & admin",
    ],
    ["Random inspections of vehicles and packages for inappropriate items", "Manager - QA"],
    // Typed as a bullet and four spaces before each line, as the cell holds them.
    ["•    Valid reasons for entry\n•    Restricted access\n•    Verification by Departmental managers for entry by contractors", "Manager - HR & admin"],
    ["Suppliers approved\nDeliveries scheduled and un-scheduled investigated\nDocumentation in place", "Manager - Purchase"],
    [
      "Ingredients & packaging\nIdentifiable/ labelled\nVerified against delivery\nVehicle inspected and sealed\nOff-loading activities supervised\nInspection conducted on RM integrity\nSystem in place handling non-conforming RM\nSystem in place to track RM movement and discrepancies investigated",
      "Manager - Store",
    ],
    ["Operations conducted in accordance with PS measures\nScheduled delivery system is established", "Manager - Dispatch"],
    [
      "Finished goods\nStorage areas inspected\nProduct inspected for integrity\nVehicle inspected and sealed after loading\nTracking & traceability system in place\nStock discrepancies investigated",
      "Manager - Production & Manager - Dispatch",
    ],
    ["Limited access to Air, water, electricity and refrigeration systems", "IT Head"],
    ["Restricted access to all persons, critical data systems\nControlled access to sensitive information", "IT Head"],
    ["Virus Protection and Back-up systems in place", "IT Head"],
  ] as const
).map(([discussionPoint, byWhom]) => ({ discussionPoint, byWhom }));

const SITE_SECURITY: LogSheetLayout = {
  documentId: "sys-site-security",
  // The page has no box above its table: the date is written on every line.
  headerFields: [],
  columns: [
    { key: "discussionPoint", label: "Discussion Point", type: "text", fixed: true, width: 380 },
    // What the assessment found this time — never last year's. One short line a
    // point ("Yes & complied"), so a plain box, wide enough for the longest.
    { key: "observations", label: "Assessment Observations", type: "text", width: 300, autoFill: { fresh: true } },
    // Who checks a point stays with the point.
    { key: "byWhom", label: "By Whom", type: "text", width: 200, autoFill: { carryForward: true } },
    { key: "checkedDate", label: "Checked Date", type: "date", width: 150, autoFill: { dueDate: true } },
  ],
  rowMode: { kind: "fixedRows", rows: SITE_SECURITY_POINTS.map(({ discussionPoint }) => ({ discussionPoint })) },
  specimenRows: SITE_SECURITY_POINTS.map(({ byWhom }) => ({ byWhom })),
  originalPages: [
    page("fsys17-site-security-2026-p1.jpg", "F/SYS/17 (00/01.12.2021) — Site Security Risk Assessment 2026, page 1 of 4 (points 1 to 6), as supplied"),
    page("fsys17-site-security-2026-p2.jpg", "F/SYS/17 — Site Security Risk Assessment 2026, page 2 of 4 (points 7 to 13; point 8's text is cut off by its cell), as supplied"),
    page("fsys17-site-security-2026-p3.jpg", "F/SYS/17 — Site Security Risk Assessment 2026, page 3 of 4 (points 14 to 20), as supplied"),
    page("fsys17-site-security-2026-p4.jpg", "F/SYS/17 — Site Security Risk Assessment 2026, page 4 of 4 (points 21 to 26), as supplied"),
  ],
  specimenSource:
    "F-SYS-17-Site security risk assessment record(R-2026).pdf — F/SYS/17 (00/01.12.2021), the 2026 assessment (every point checked 01.01.2026), the plant's own entries; the specimen is who checks each point — the observations are that assessment's own",
};

// ===========================================================================
// F/SYS/20 — ANNUAL HARA REVIEW & VERIFICATION RECORD
// ===========================================================================

/** The twelve POINTS of "2. Changes Reviewed", each cell's wrapped lines joined into its words. */
export const HARA_ANNUAL_POINTS: string[] = [
  "Raw materials, Consumables, Packing materials including suppliers",
  "Process changes / Manufacturing flow diagram changes",
  "Any new hazards introduced based on scientific development or market intelligence including product fraud, product defense",
  "Equipment",
  "Product formulation",
  "New Product introduction",
  "Key Staff changes / HARA team members",
  "Site standard",
  "Pest control",
  "Customer complaints – Quality, Product safety, Legality",
  "Product recall / withdrawal",
  "Regulatory updates",
];

/** The three lines of "3. CCMs / PRPs Verified", by their line number. */
const CCM_LINES = [1, 2, 3];
const CCM_HEADING = "3. CCMs / PRPs Verified";

/** The review of 27th January 2026: the parts that describe the site and its plan, which a new review starts from. */
export const HARA_ANNUAL_2026_01_DESCRIBING: Record<string, string> = {
  siteName: "GUJARAT PRINT PACK PUBLICATIONS PRIVATE LIMITED",
  siteAddress: "308/9, GIDC, DEDIYASAN, MEHSANA, GUAJRAT, INDIA - 384002",
  products:
    "(1) Self-adhesive Pressure Sensitive Labels – Roll & Cut form\n(2) Shrink sleeve – Roll & Cut form\n(3) Printed & Laminated Flexible Packaging materials in Roll &  Pouch form",
  haraTeamLeader: "Kapila Barad",
  ccm1: "Printing defects – critical to consumer safety – Labels",
  ccm2: "Adhesive, Hardner & EA Viscosity  - Laminates",
  ccm3: "PRPs",
};

/** "7.HARA Review Team" of 27th January 2026, page 4 — six lines. */
export const HARA_ANNUAL_2026_01_TEAM: [name: string, designation: string][] = [
  ["Kapila Barad", "Manager – QA / PSTL"],
  ["Ajay Vaghela", "Manager – Production / Deputy PSTL"],
  ["Mukesh Patel", "Manager – Maintenance"],
  ["Chirag Parmar", "Manager – Purchase"],
  ["Bharat Ahir", "Manager – Store"],
  ["Vinay Bhojak", "Manager - HR"],
];

const HARA_ANNUAL: LogSheetLayout = {
  documentId: "sys-hara-annual",
  // Printed between the site's table and "2. Changes Reviewed"; the second
  // heading is the one over the POINTS / OBSERVATION grid.
  instructions: [
    "1. Review Purpose",
    "To assess the effectiveness and continued applicability of the HARA Plan in relation to current operations, raw materials, processes, customer complaints, and regulatory updates.",
    "2. Changes Reviewed",
  ],
  headerFields: [
    { key: "siteName", label: "SITE NAME", type: "text", autoFill: { carryForward: true }, list: NOT_EMPLOYEES },
    { key: "siteAddress", label: "SITE ADDRESS", type: "paragraph", autoFill: { carryForward: true } },
    { key: "products", label: "PRODUCTS", type: "paragraph", autoFill: { carryForward: true } },
    { key: "dateOfReview", label: "DATE OF REVIEW", type: "date", required: true, autoFill: { dueDate: true } },
    { key: "haraTeamLeader", label: "HARA TEAM LEADER", type: "text", autoFill: { carryForward: true }, list: EMPLOYEES },
  ],
  // The point is the format's; the observation is this year's review's own.
  columns: [
    { key: "point", label: "POINTS", type: "text", fixed: true, width: 240 },
    { key: "observation", label: "OBSERVATION", type: "text", width: 640, multiline: true, autoFill: { fresh: true } },
  ],
  rowMode: { kind: "fixedRows", rows: HARA_ANNUAL_POINTS.map((point) => ({ point })) },
  footerFields: [
    // The CCMs / PRPs are the HARA plan's and carry to the next review; what
    // was found about them is this review's.
    ...CCM_LINES.flatMap((n): LogHeaderField[] => [
      { key: `ccm${n}`, label: `${CCM_HEADING} ${n} — CCM / CM / PRPs`, type: "paragraph", autoFill: { carryForward: true } },
      { key: `deviation${n}`, label: `${CCM_HEADING} ${n} — Deviation(s)`, type: "paragraph" },
      { key: `correctiveAction${n}`, label: `${CCM_HEADING} ${n} — Corrective Action(s)`, type: "paragraph" },
      { key: `effective${n}`, label: `${CCM_HEADING} ${n} — Effective?`, type: "yesno" },
    ]),
    { key: "validationSummary", label: "4. Validation/Verification Summary", type: "paragraph" },
    { key: "recommendations", label: "5. Recommendations/Updates", type: "paragraph" },
    { key: "conclusion", label: "6. Conclusion", type: "paragraph" },
    { key: "nextReview", label: "Next scheduled review", type: "date" },
    ...haraTeamFields("7.HARA Review Team"),
  ],
  specimenHeader: { ...HARA_ANNUAL_2026_01_DESCRIBING, ...haraTeamValues(HARA_ANNUAL_2026_01_TEAM) },
  originalPages: [
    page("fsys20-hara-annual-2026-01-p1.jpg", "F/SYS/20 (00 / 01.04.2025) — the Annual HARA Review of 27th January 2026, page 1 of 4, as supplied"),
    page("fsys20-hara-annual-2026-01-p2.jpg", "F/SYS/20 — the Annual HARA Review of 27th January 2026, page 2 of 4, as supplied"),
    page("fsys20-hara-annual-2026-01-p3.jpg", "F/SYS/20 — the Annual HARA Review of 27th January 2026, page 3 of 4 (CCMs / PRPs and the summary), as supplied"),
    page("fsys20-hara-annual-2026-01-p4.jpg", "F/SYS/20 — the Annual HARA Review of 27th January 2026, page 4 of 4 (conclusion and review team), as supplied"),
  ],
  specimenSource:
    "F-SYS-20_Annual HARA Verification Record_Jan 2026.pdf — F/SYS/20 (00 / 01.04.2025), the review of 27th January 2026, the plant's own entries; the specimen is the site, its products, the HARA team leader, the three CCMs / PRPs and the review team — the observations and findings are that review's own",
};

// ===========================================================================
// F/SYS/13 — MOCK PRODUCT WITHDRAWAL RECORD
// ===========================================================================

/** The product in each page's title, spelt as that title prints it. */
export const MOCK_RECALL_PRODUCTS = ["LABEL", "SHRINK SLEEVE", "Pouch"];

/** The four printed lines of the Responsible table's Process / Function column. */
export const MOCK_RECALL_FUNCTIONS = ["Quality", "Dispatch", "Flexo - Production", "Sales & Marketing"];

/** The Responsible table of the latest withdrawal, SHRINK SLEEVE of 05.02.2025 — the recall team a new exercise starts from. */
export const MOCK_RECALL_2025_02_TEAM: [name: string, designation: string][] = [
  ["Kapila Barad", "Manager - QA"],
  ["Parth Chauhan", "Manager - Dispatch"],
  ["Ajay Vaghela", "Manager - Production"],
  ["Vaishali", "Sales Executive"],
];

const CUSTOMER = "Customer  Information";
const CONTACT = "Contact Person ( For Mock Withdrawal )";
const RESPONSIBLE = "Responsible ( Product recall Team + other concerned members of the Organization as necessary )";

const MOCK_RECALL: LogSheetLayout = {
  documentId: "sys-mock-recall",
  // The band heading and the line printed under it; the boxes they head are
  // "FG code" to "Telephonic conversation".
  instructions: ["Information of the product", "(Information that we are looking for)"],
  // Every box is about THIS exercise — its product, its customer, its lot —
  // so none is carried from the last one.
  headerFields: [
    { key: "product", label: "Mock Product Withdrawal Record -", type: "select", options: MOCK_RECALL_PRODUCTS },
    { key: "date", label: "Date", type: "date", required: true, autoFill: { dueDate: true } },
    { key: "startTime", label: "Start Time", type: "time" },
    { key: "endTime", label: "End time", type: "time" },
    { key: "totalTime", label: "Total time", type: "text" },
    { key: "customerName", label: `${CUSTOMER} — Name`, type: "text", list: NOT_EMPLOYEES },
    { key: "customerLocation", label: `${CUSTOMER} — Location`, type: "text" },
    { key: "contactName", label: `${CONTACT} — Name`, type: "text", list: NOT_EMPLOYEES },
    { key: "contactPosition", label: `${CONTACT} — Position`, type: "text", list: NOT_EMPLOYEES },
    { key: "fgCode", label: "FG code", type: "text" },
    { key: "productionOrderNumber", label: "Production order number", type: "text" },
    { key: "salesOrderNumber", label: "Sales order number", type: "text" },
    { key: "jobName", label: "Job name", type: "text" },
    { key: "dispatchDate", label: "Dispatch Date", type: "date" },
    { key: "invoiceNumber", label: "Invoice number", type: "text" },
    { key: "dispatchedQuantity", label: "Dispatched Quantity", type: "text" },
    // The page writes "Mock Recall scenario considered was …": the box holds
    // what follows the label's words.
    { key: "scenario", label: "Mock Recall scenario considered", type: "paragraph" },
    { key: "telephonicConversation", label: "Telephonic conversation", type: "paragraph" },
    { key: "responseFromCustomer", label: "Response from Customer", type: "paragraph" },
  ],
  columns: [
    { key: "processFunction", label: "Process / Function", type: "text", fixed: true, width: 170, group: RESPONSIBLE },
    // The recall team repeats from one exercise to the next; each signs afresh.
    { key: "name", label: "Name", type: "text", width: 190, group: RESPONSIBLE, autoFill: { carryForward: true }, list: EMPLOYEES },
    { key: "designation", label: "Designation", type: "text", width: 200, group: RESPONSIBLE, autoFill: { carryForward: true }, list: NOT_EMPLOYEES },
    { key: "signature", label: "Signature", type: "text", width: 180, group: RESPONSIBLE, autoFill: { fresh: true } },
  ],
  rowMode: { kind: "fixedRows", rows: MOCK_RECALL_FUNCTIONS.map((processFunction) => ({ processFunction })) },
  footerFields: [
    { key: "productTraced", label: "Product Traced %", type: "number" },
    // Neither box is marked on any of the three pages supplied.
    { key: "effective", label: "Was the Mock Recall efecctive?", type: "yesno" },
    { key: "comments", label: "Why was effective? (add comments). — Comments", type: "paragraph" },
  ],
  specimenRows: MOCK_RECALL_2025_02_TEAM.map(([name, designation]) => ({ name, designation })),
  originalPages: [
    page("fsys13-mock-recall-label-2025-01-p1.jpg", "F/SYS/13 (00/01.12.2021) — the LABEL withdrawal of 10.01.2025, as supplied"),
    page("fsys13-mock-recall-pouch-2025-01-p1.jpg", "F/SYS/13 — the Pouch withdrawal of 28.01.2025, as supplied"),
    page("fsys13-mock-recall-sleeve-2025-02-p1.jpg", "F/SYS/13 — the SHRINK SLEEVE withdrawal of 05.02.2025, as supplied"),
  ],
  specimenSource:
    "F-SYS-13-Mock Product Withdrawal record label.pdf, …record Pouch.pdf and …record label Sleeve.pdf — F/SYS/13 (00/01.12.2021), the withdrawals of 10.01.2025, 28.01.2025 and 05.02.2025, the plant's own entries; the specimen is the recall team of the latest (SHRINK SLEEVE, 05.02.2025) — every other box is that exercise's own",
};

// ===========================================================================
// F/SYS/14 — BACKWARD TRACEABILITY RECORD (CUSTOMER to SUPPLIER)
// ===========================================================================

const BACKWARD_TRACE: LogSheetLayout = {
  documentId: "sys-backward-trace",
  // The lot being traced, as the table at the top of page 1 lays it out.
  headerFields: [
    { key: "traceabilityDate", label: "B/W Traceability date", type: "date", required: true, autoFill: { dueDate: true } },
    { key: "customerName", label: "CUSTOMER Name", type: "text" },
    { key: "locationOfDispatch", label: "Location of Dispatch", type: "text" },
    { key: "productDescription", label: "Product Description", type: "text" },
    { key: "invoiceNo", label: "Invoice No.", type: "text" },
    { key: "dateOfDispatch", label: "Date of Dispatch", type: "date" },
    { key: "poNumber", label: "P/O Number", type: "text" },
    { key: "quantity", label: "Quantity", type: "text" },
  ],
  columns: [],
  rowMode: { kind: "single" },
  // The Description / Observation table, line by line: each Description is the
  // label of its box. Page 2 carries the last three lines.
  footerFields: [
    { key: "customerOrderNumberDate", label: "Customer order number & date", type: "text" },
    { key: "customerOrderQuantity", label: "Customer order quantity", type: "text" },
    { key: "fglaCode", label: "FGLA code", type: "text" },
    { key: "salesOrderNumberDate", label: "Sales order number & date", type: "text" },
    { key: "productionOrderNumberDate", label: "Production order number & date", type: "text" },
    // GRN, date, batch numbers and quantity in one line — a paragraph, so the
    // batch numbers at its end are not cut off when the record is read.
    { key: "keyRmInwardDate", label: "Key RM (Paper Label) inward date", type: "paragraph" },
    { key: "paperLabelSupplier", label: "Paper label supplier", type: "text" },
    { key: "issuedQuantity", label: "Issued Quantity", type: "text" },
    { key: "printingProductionDate", label: "Printing production date", type: "date" },
    { key: "printQuantity", label: "Print Quantity", type: "text" },
    { key: "balanceReturned", label: "Balance returned", type: "text" },
    { key: "qcInspectionDated", label: "QC Inspection dated", type: "date" },
    { key: "qcInspectedOkMeter", label: "QC Inspected OK meter", type: "text" },
    { key: "balanceScrapped", label: "Balance scrapped", type: "text" },
    { key: "slittingPackingDate", label: "Slitting & packing date", type: "date" },
    { key: "slittingOkMeter", label: "Slitting OK meter", type: "text" },
    // The boxes packed, a line each, as the page lists them.
    { key: "packingQuantity", label: "Packing Quantity", type: "paragraph" },
    { key: "boxNumber", label: "Box number", type: "text" },
    { key: "reelNumber", label: "Reel number", type: "text" },
    { key: "verifiedBy", label: "Verified By", type: "text", autoFill: { sign: true }, list: EMPLOYEES },
  ],
  originalPages: [
    page("fsys14-backward-traceability-2024-12-p1.jpg", "F/SYS/14 (00/01.12.2021) — the backward trace of 12.12.2024 (Aculife Healthcare Pvt. Ltd./ Nirma), page 1 of 2, as supplied"),
    page("fsys14-backward-traceability-2024-12-p2.jpg", "F/SYS/14 — the backward trace of 12.12.2024, page 2 of 2 (box, reel, verified by), as supplied"),
  ],
  specimenSource:
    "F-SYS-14-Backward Traceability Record - Label- Aculife - Copy.pdf — F/SYS/14 (00/01.12.2021), the trace of 12.12.2024 for Aculife Healthcare Pvt. Ltd./ Nirma, the plant's own entries; every box is that lot's own, so none is carried to a new trace",
};

// ===========================================================================
// F/SYS/15 — FORWARD TRACEABILITY CHECK LIST (SUPPLIER to CUSTOMER)
// ===========================================================================

/** One issue's column: what an issue records is that issue's own, never the last trace's. */
const issue = (key: string, label: string, width: number, type: LogColumn["type"] = "text"): LogColumn => ({ key, label, type, width, autoFill: { fresh: true } });

const FORWARD_TRACE: LogSheetLayout = {
  documentId: "sys-forward-trace",
  // The material being traced, as the table at the top of the page lays it out.
  headerFields: [
    { key: "dateOfForwardTraceability", label: "Date of Forward Traceability", type: "date", required: true, autoFill: { dueDate: true } },
    { key: "supplierName", label: "Supplier Name", type: "text", list: NOT_EMPLOYEES },
    { key: "materialDescription", label: "Material Description", type: "text" },
    { key: "invoiceNo", label: "Invoice No.", type: "text" },
    { key: "internalBatchNumber", label: "Internal batch number", type: "text" },
    { key: "dateOfReceiptAtStore", label: "Date of receipt at store", type: "date" },
    { key: "quantity", label: "Quantity", type: "text" },
  ],
  columns: [
    issue("issueDated", "Issue dated", 150, "date"),
    issue("issuedQty", "Issued Qty.", 110),
    issue("printQty", "Print Qty.", 110),
    issue("slittedRollBatchNumber", "Slitted Roll Batch number", 170),
    issue("customerName", "Customer name", 190),
    issue("jobName", "Job name", 320),
    issue("productionOrderNumber", "Production order number", 140),
    issue("dispatchedQty", "Dispatched Qty.", 120),
    issue("dispatchDated", "Dispatch dated", 150, "date"),
    issue("invoiceNumber", "Invoice number", 120),
    issue("balanceQty", "Balance Qty.", 110),
  ],
  rowMode: { kind: "free", minRows: 1, typicalRows: 1 },
  footerFields: [{ key: "verifiedBy", label: "Verified By", type: "text", autoFill: { sign: true }, list: EMPLOYEES }],
  originalPages: [
    page(
      "fsys15-forward-traceability-2024-12-p1.jpg",
      "F/SYS/15 (00/01.12.2021) — the forward trace of 18.12.2024 (Avery Dennison, Avery PE Clear top coated VA4216NF), as supplied"
    ),
  ],
  specimenSource:
    "F-SYS-15-Forward Traceability Record - Label.pdf — F/SYS/15 (00/01.12.2021), the trace of 18.12.2024 (Avery Dennison, Avery PE Clear top coated VA4216NF), the plant's own entries; every box is that material's own, so none is carried to a new trace",
};

export const SYS_HARA_TRACEABILITY_LAYOUTS: Record<string, LogSheetLayout> = {
  [HARA_MONTHLY.documentId]: HARA_MONTHLY,
  [SITE_SECURITY.documentId]: SITE_SECURITY,
  [HARA_ANNUAL.documentId]: HARA_ANNUAL,
  [MOCK_RECALL.documentId]: MOCK_RECALL,
  [BACKWARD_TRACE.documentId]: BACKWARD_TRACE,
  [FORWARD_TRACE.documentId]: FORWARD_TRACE,
};
