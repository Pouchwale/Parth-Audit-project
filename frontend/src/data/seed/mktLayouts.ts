import type { LogColumn, LogHeaderField, LogSheetLayout } from "../../types";
import { COMPLAINT_PERIODS, FEEDBACK_RATINGS } from "../../engine/marketingCalc";

// MARKETING — CUSTOMER FEEDBACK AND COMPLAINT TRENDS (REQUIREMENTS §77).
// Marketing's three formats, built from what the company supplied on
// 26-Sep-2026 (source-documents/F-MKT-*; every printed page rendered unaltered
// to frontend/public/source/fmkt*.jpg, to be shown beside its form):
//
//   mkt-customer-feedback  F/MKT/01 (01/01.12.2021)
//     Customer Value added Feedback — "F-MKT-01_Customer Feedback Form-
//     Tenax.pdf": the form as Pidilite returned it on 22.01.2025 for its Tenax
//     wraparound labels (the file is named "Feedback Form"; the format's title
//     is "Customer Value added Feedback")
//   mkt-feedback-analysis  F/MKT/02 (01/01.12.2021)
//     Customer Feedback analysis — "F-MKT-02_Customer Feedback analysis -
//     Labels-2026.pdf" (and its .xlsx), LABELS, 01.01.2025 to 31.12.2025. The
//     POUCHES and SLEEVES analyses of the same period came as the company's
//     own workbooks only ("… - Pouches -2025.xlsx", "… - Sleeve-2025.xlsx"),
//     never printed — no page exists for them.
//   mkt-complaint-trend    F/MKT/04 (00/01.12.2021)
//     Customer Complaints Trend Analysis — "F-MKT-04_Complaint trend
//     analysis(R-2026).xls", nine worksheets: a trend sheet per product for
//     calendar year 2025 (LABELS, SHRINK SLEEVE, LAMINATED POUCH) printed to
//     three PDFs, a Pareto of causes per product printed to three more, and
//     the trend sheets of 2026, the year in progress (see the end of this
//     comment). The Pareto sheets are Vertex42's Pareto Chart template: the
//     "[42]", the grey "Pareto Analysis" banner, "Insert new rows above this
//     line", "Cumulative Percentage Cutoff:" and the legend Vital Few / Useful
//     Many / Cumulative% / Cut Off % are the template's own.
//
// F/MKT/03 was not among the pages supplied. The pages print the company as
// "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED" — PRINT PACK, two words.
//
// VERBATIM MEANS VERBATIM. Every label, heading, printed note and seeded value
// is the page's own wording, spelling, capitals, punctuation and spacing:
// F/MKT/01's "deliverbales" and the spaces before its full stops ("services
// deliverbales .", "Products & Services ."), "Customer Value added Feedback",
// "Attributes↓ / Rating→", "Email ID :"; F/MKT/02's "Customer Feedback
// analysis", "Product : -" and "Evaluation Period : 01.01.2025 to 31.12.2025)"
// with its stray ")"; F/MKT/04's "Calender Year :", "Sr. no.", "Nos. of
// Customer complaints", "Complaint Nos.", "Customer complaint Trend",
// "LAMINATES", and its causes as typed — "Prinint issue", "Label not release
// from liner", "Found short qty.", "Hotmelt not done in sleeve", "Gluing &
// size issue", "Shade Variation (Print defects)". The "—" in a label ("Nos.
// of Customer complaints — Period 1", "Average Rating — 5 Excellent") is the
// app's own, joining a table's heading to the cell it labels. Where the page's
// text layer and its picture disagree, the picture wins: F/MKT/01's third
// satisfaction line prints a triangle ("Needs Improvement △") that the text
// layer lacks, and the SLEEVE Pareto's title reads "Customer Complaints -SLEEVE
// -UP TO 31.01.2026" in the text layer but "Customer Complaints - SLEEVE - UP TO
// 31.01.2026" on the page. Trimmed: the trailing spaces of "Product Quality "
// (both feedback forms), of the titles "Customer Feedback analysis " and
// "CUSTOMER COMPLAINTS TREND ANALYSIS - LABELS ", of "Conclusion : ", of the
// chart title "Customer complaint Trend  " and of the cause "Prinint issue ".
// The rating headings are two lines each ("5" over "Excellent", "- 5" over
// "Poor") and are written with one space: "5 Excellent", "- 5 Poor". F/MKT/01
// prints its date "22-01-2025"; the date box holds it as a date.
//
// WHAT HAD TO BE REPRESENTED DIFFERENTLY FROM THE PAPER, AND WHY:
//   * F/MKT/01 prints the five ratings as columns, "Yes □" in every cell, and
//     the customer answers a line by leaving "Yes □" only in the column that
//     applies (Pidilite's page: nothing is ticked inside any □ — the column the
//     "Yes □" sits in is the answer). Here each line is ONE CHOICE among the
//     five ratings. Overall Satisfaction Level prints three lines, each with a
//     face or a triangle and a "Yes □", the chosen one highlighted yellow: one
//     choice among the three. "Would you like to be associated with us in
//     future :" prints "Yes □" over "No □": a Yes / No box.
//   * F/MKT/02 prints its three worked-out columns — 44, 45, 97.78% — OUTSIDE
//     the form's right border, with no heading over them; they are named from
//     the rows and the lower table that carry the same figures ("Average
//     Rating", "Ideal Rating", "Satisfied % average"). Below the grid the page
//     prints a second table, "Analysis with respect to average rating achieved
//     against each attribute", repeating the six attributes with their
//     Satisfied % average and a "Further action / analysis": here it is the
//     same grid, the further action beside each line and the percentage
//     written once. The two tally rows ("Average Rating" 35 17 2, "Ideal
//     Rating" 175 68 6) and the two totals under them (again "Average Rating"
//     249, "Ideal Rating" 270) are boxes below the grid; the tally boxes carry
//     the rating heading in their label so that two boxes are not both
//     "Average Rating". Every one of these is worked out from the counts
//     (engine/marketingCalc.ts) and never typed. The evaluation period is two
//     date boxes. One format, three products, the same period: the three
//     records are filed on 1, 2 and 3 January 2026 (the day after the period
//     and the two days after) so that their period keys differ
//     (mktRecords.ts).
//   * F/MKT/04's trend sheet is two tables and a chart: the grid is the
//     Pareto's table of causes, the two tables are boxes. The "Nos. of Customer
//     complaints" table is read column by column — per period its heading
//     ("DEC 2021", "CY 2022" …), the series' count and the "Total" — so a
//     period's three figures are read in one place; six period slots, where
//     the page prints five (the 2026 sheets add a CY 2026 column). The "Total"
//     row is worked out: it adds each period's complaints over the sheet's
//     series, and the company keeps ONE series per sheet (LABELS, SHRINK SLEEVE
//     or LAMINATES), so on every page it repeats the series row (1 7 6 4 2
//     twice); a period with nothing written totals nothing. "Calender Year :"
//     sits between the two tables as printed, then the twelve months as boxes.
//     The Pareto's "#" is the renderer's own Sr. No.; its Vital Few and Useful
//     Many are two chart series on the template and one worked-out column
//     here; the chart title's second half ("LABELS (Jan 2021 to JANUARY 2026)")
//     is a box after the printed "Customer Complaints -"; the template's
//     "Cumulative Percentage Cutoff:" box holds a whole number of per cent
//     ("80" for the printed "80%"), and its sentence under the chart ("The
//     first N Causes cover X% of the Total Defects") is worked out. Both charts
//     are drawn from the boxes and lines (`charts`), not pasted in. The three
//     records for 2025 are filed on 31, 30 and 29 January 2026 (the Pareto
//     runs "UP TO 31.01.2026") so that their period keys differ.
//   * The template's classification is not consistent with its own cutoff
//     (below), so this system applies one rule to every line: Vital Few while
//     the cumulative share is within the cutoff, Useful Many after, lines in
//     the order written.
//   * Highlighting and bold are not reproduced: F/MKT/01's yellow on the
//     chosen satisfaction line and on "Yes □"; F/MKT/02's bold "% Satisfaction
//     Index"; the template's orange table headings.
//   * Each format's "F/MKT/0n (rev/date)" band is the document header the app
//     prints on every record, so it is not a field.
//
// ON THE PAGES, AND LEFT AS THEY ARE (each a TBC for the company):
//   * F/MKT/01: the Designation box is too narrow and prints "Manager Proc";
//     the page's text holds "Manager Procurement", which is what is kept.
//     "Company Seal & Sign :" is blank — the feedback came back unsigned and
//     unsealed.
//   * F/MKT/02: in the workbook each line's Average Rating (K) and Ideal Rating
//     (L) are TYPED numbers, only M = K/L is a formula; F12:H12 are SUMs and
//     F13 = F12*5, G13 = G12*4, H13 = H12*3 — nothing under 2 Average or - 5
//     Poor; the total Average Rating is F13+G13+H13+I13 in the LABELS and
//     POUCHES workbooks (I13 empty, J13 never added) and F13+G13+H13 in
//     SLEEVES; the total Ideal Rating is typed as customers × attributes × 5
//     ("=9*6*5", "=4*5*6", "=3*5*6"). Every printed figure is what the
//     engine's arithmetic gives, so nothing turns on the difference. The
//     POUCHES and SLEEVES workbooks label their tally rows "Total attributes"
//     and "Average Rating for each attributes" where the printed LABELS page
//     says "Average Rating" and "Ideal Rating"; the POUCHES workbook shows its
//     lower table's percentages whole ("90%") where the other two show two
//     decimals. The layout follows the printed page.
//   * F/MKT/04, trend pages: the yearly totals plus January 2026 equal each
//     Pareto's defects (LABELS 1+7+6+4+2 = 20, +1 = 21; SHRINK SLEEVE 2+3+4+3+1
//     = 13, +1 = 14; LAMINATED POUCH 0+2 = 2, +0 = 2). The LABELS Pareto is
//     titled "Jan 2021 to JANUARY 2026" while its trend begins at "DEC 2021".
//     The pouch product is named three ways — "LAMINATED POUCH" in the title,
//     "LAMINATES" in the table and "LAMINATED POUCHES" on its Pareto — and its
//     trend page prints five period columns with the last three blank.
//   * F/MKT/04, Pareto pages: the LABELS and LAMINATED POUCHES pages print the
//     chart alone — no table, no sentence; only the SLEEVE page prints the
//     table and "The first 3 Causes cover 64.29% of the Total Defects". The
//     LABELS worksheet's "#" column reads 1, 2, 3, 3, 5, 4, 7, 5, 9, 10 … 15 —
//     its lines were re-sorted by hand — and its chart draws no bar for Label
//     not release from liner, Print defects, Goods Damaged, Job mixing, Loose
//     winding, Misregistration or Short Quantity Dispatch (their Vital Few /
//     Useful Many cells are empty), draws Found short qty. at 2 where its
//     Defects is 1 (its Vital Few cell holds 2), and colours Unwanted UV
//     Coating Vital Few at 81.0%. The SLEEVE page's sentence counts three
//     Vital Few marks and quotes the third line's 64.29%, although four causes
//     are within the 80% cutoff (78.6%); its chart skips the bars of Size
//     variation against specification and Packing related, colours Hotmelt
//     not done in sleeve Vital Few at 85.7%, and its 8th line "Packing
//     related" has no count — the template's blank line repeating cause 4; it
//     is left out. The LAMINATED POUCHES chart draws no bar for Size
//     variation, and its worksheet keeps zeros in the Vital Few / Useful Many
//     cells of lines with no cause (the leftovers of a longer list).
//   * The 2026 trend sheets — LABELS and SHRINK SLEEVE with one complaint each
//     in January 2026 (a CY 2026 column of 1), LAMINATED POUCH with none (CY
//     2026 = 0, its sheet still headed "Calender Year : 2025") — are the year
//     in progress and are not seeded.

/** A supplied page, shown unaltered beside the form (REQUIREMENTS §71). */
const page = (file: string, caption: string) => ({ src: `/source/${file}`, caption });

// ===========================================================================
// What F/MKT/01 and F/MKT/02 share
// ===========================================================================

/** The six attributes down the side of both feedback forms, as printed ("Product Quality " loses its trailing space). */
export const FEEDBACK_ATTRIBUTES = [
  "Product Quality",
  "Condition of packaging on receipt",
  "Product Delivery - as per your requirements",
  "Completeness of documents - Invoice, Test certificate, Packing list",
  "Response time & approach to your query",
  "Technical knowledge & competency",
];

/** The five ratings across the top of both forms, each heading's two lines joined with a space ("5" over "Excellent"). */
export const FEEDBACK_RATING_OPTIONS = ["5 Excellent", "4 Very Good", "3 Good", "2 Average", "- 5 Poor"];

const ATTRIBUTES_HEADING = "Attributes↓ / Rating→";

// ===========================================================================
// F/MKT/01 — Customer Value added Feedback
// ===========================================================================

/** The instruction under the title — "deliverbales" and the spaces before the full stops are the page's. */
const FEEDBACK_INSTRUCTION =
  "We are committed to provide Safe Quality Products and exceeding services deliverbales . Your Comments / suggestions will be used to help improve the Quality of our Products & Services . Thank you for taking the time to complete this form concerning your experience.";

/** The three lines of Overall Satisfaction Level, each with the face (or the triangle) it prints. */
export const SATISFACTION_LEVELS = ["Extremely Happy ☺", "Satisfactory ☻", "Needs Improvement △"];

/** Pidilite's boxes on the form of 22.01.2025 (the designation the page clips at "Manager Proc"). */
export const FEEDBACK_PIDILITE_2025_01: Record<string, string> = {
  organization: "Pidilite",
  contactPerson: "Harshit Hurkat",
  designation: "Manager Procurement",
  emailId: "harshit.hurkat@pidilite.com",
  mobile: "9702118211",
  products: "Tenax wraparound labels",
};

/** Pidilite's rating on each of the six lines — the column its "Yes □" sits in. */
export const FEEDBACK_PIDILITE_2025_01_RATINGS = ["3 Good", "5 Excellent", "2 Average", "5 Excellent", "4 Very Good", "3 Good"];

const CUSTOMER_FEEDBACK: LogSheetLayout = {
  documentId: "mkt-customer-feedback",
  instructions: [FEEDBACK_INSTRUCTION],
  // A customer's boxes: none names one of the plant's people, so none offers
  // the employee list (list: "" where the label would otherwise be taken for
  // a person), and none is carried forward — the next form is another
  // customer's.
  headerFields: [
    { key: "date", label: "Date :", type: "date", required: true, autoFill: { dueDate: true } },
    // The customer's own block: not required and never carried forward, as
    // F/SYS/13's customer boxes are — the next form is another customer's.
    { key: "organization", label: "Organization :", type: "text", list: "" },
    { key: "contactPerson", label: "Contact Person :", type: "text", list: "" },
    { key: "designation", label: "Designation :", type: "text" },
    { key: "emailId", label: "Email ID :", type: "text" },
    { key: "mobile", label: "Mobile :", type: "text" },
    { key: "products", label: "Products :", type: "text" },
  ],
  columns: [
    { key: "attribute", label: ATTRIBUTES_HEADING, type: "text", fixed: true, width: 380 },
    // The customer's judgement, never copied from the last form.
    { key: "rating", label: "Rating", type: "select", options: FEEDBACK_RATING_OPTIONS, width: 170, autoFill: { fresh: true } },
  ],
  rowMode: { kind: "fixedRows", rows: FEEDBACK_ATTRIBUTES.map((attribute) => ({ attribute })) },
  footerFields: [
    { key: "comments", label: "Your valuable comments / suggestions:", type: "paragraph" },
    { key: "overallSatisfaction", label: "Overall Satisfaction Level :", type: "select", options: SATISFACTION_LEVELS },
    { key: "associateInFuture", label: "Would you like to be associated with us in future :", type: "yesno" },
    { key: "companySealSign", label: "Company Seal & Sign :", type: "text", list: "" },
  ],
  // Pidilite's page: its boxes and, line by line, its ratings (the rating
  // column is fresh, so the assistant never copies them).
  specimenHeader: FEEDBACK_PIDILITE_2025_01,
  specimenRows: FEEDBACK_ATTRIBUTES.map((attribute, i) => ({ attribute, rating: FEEDBACK_PIDILITE_2025_01_RATINGS[i] })),
  originalPages: [page("fmkt01-feedback-pidilite-2025-01-p1.jpg", "F/MKT/01 (01/01.12.2021) — Customer Value added Feedback from Pidilite (Tenax wraparound labels), 22.01.2025, as supplied")],
  specimenSource:
    "F-MKT-01_Customer Feedback Form- Tenax.pdf — F/MKT/01 (01/01.12.2021), the Customer Value added Feedback Pidilite returned on 22.01.2025 for its Tenax wraparound labels; its boxes and ratings are the specimen, the customer's own",
};

// ===========================================================================
// F/MKT/02 — Customer Feedback analysis
// ===========================================================================

/** The products the company analyses separately, as its three workbooks name them. */
export const FEEDBACK_ANALYSIS_PRODUCTS = ["LABELS", "POUCHES", "SLEEVES"];

const EXPERIENCE = "Experience with Our Products & Services";

/** A rating column: how many customers gave that rating — counted afresh for every period. */
const ratingCount = (key: string, label: string): LogColumn => ({ key, label, type: "number", decimals: 0, width: 90, group: EXPERIENCE, autoFill: { fresh: true } });

/** A box worked out from the counts (engine/marketingCalc.ts), never typed. */
const computedBox = (key: string, label: string): LogHeaderField => ({ key, label, type: "text", computed: true });

const FEEDBACK_ANALYSIS: LogSheetLayout = {
  documentId: "mkt-feedback-analysis",
  headerFields: [
    { key: "product", label: "Product : -", type: "select", options: FEEDBACK_ANALYSIS_PRODUCTS, required: true, autoFill: { carryForward: true } },
    // The period is carried from the last analysis (the specimen's, 2025, on
    // the first), to be changed for the year in hand — so a sheet the
    // assistant fills is complete, while a blank period still stops a submit.
    { key: "periodFrom", label: "Evaluation Period : — from", type: "date", required: true, autoFill: { carryForward: true } },
    { key: "periodTo", label: "Evaluation Period : — to", type: "date", required: true, autoFill: { carryForward: true } },
  ],
  columns: [
    { key: "attribute", label: ATTRIBUTES_HEADING, type: "text", fixed: true, width: 340 },
    ...FEEDBACK_RATINGS.map((r, i) => ratingCount(r.key, FEEDBACK_RATING_OPTIONS[i])),
    // Worked out, never typed (feedbackRowCells).
    { key: "averageRating", label: "Average Rating", type: "text", computed: true, width: 100 },
    { key: "idealRating", label: "Ideal Rating", type: "text", computed: true, width: 90 },
    { key: "satisfiedPct", label: "Satisfied % average", type: "text", computed: true, width: 110 },
    { key: "furtherAction", label: "Further action / analysis", type: "text", width: 220, autoFill: { fresh: true } },
  ],
  rowMode: { kind: "fixedRows", rows: FEEDBACK_ATTRIBUTES.map((attribute) => ({ attribute })) },
  // The tally rows, the totals and the index, all worked out (feedbackTotals);
  // then the conclusion.
  footerFields: [
    ...FEEDBACK_RATINGS.map((r, i) => computedBox(`tally${r.box}`, `Average Rating — ${FEEDBACK_RATING_OPTIONS[i]}`)),
    ...FEEDBACK_RATINGS.map((r, i) => computedBox(`weighted${r.box}`, `Ideal Rating — ${FEEDBACK_RATING_OPTIONS[i]}`)),
    computedBox("averageRatingTotal", "Average Rating"),
    computedBox("idealRatingTotal", "Ideal Rating"),
    computedBox("satisfactionIndex", "% Satisfaction Index"),
    { key: "conclusion", label: "Conclusion :", type: "paragraph" },
  ],
  specimenHeader: { product: "LABELS", periodFrom: "2025-01-01", periodTo: "2025-12-31" },
  // The attributes only: the counts are a period's own.
  specimenRows: FEEDBACK_ATTRIBUTES.map((attribute) => ({ attribute })),
  originalPages: [page("fmkt02-feedback-analysis-labels-2025-p1.jpg", "F/MKT/02 (01/01.12.2021) — Customer Feedback analysis, LABELS, 01.01.2025 to 31.12.2025, as supplied")],
  specimenSource:
    "F-MKT-02_Customer Feedback analysis - Labels-2026.pdf and .xlsx — F/MKT/02 (01/01.12.2021), the company's own analysis of the LABELS feedback of 01.01.2025 to 31.12.2025; the attributes are the specimen, the counts are that period's. The POUCHES and SLEEVES analyses of the same period are workbooks only (source-documents/F-MKT-02_… - Pouches -2025.xlsx, … - Sleeve-2025.xlsx)",
};

// ===========================================================================
// F/MKT/04 — Customer Complaints Trend Analysis
// ===========================================================================

/** The products, as the three trend titles name them ("CUSTOMER COMPLAINTS TREND ANALYSIS - LABELS"). */
export const COMPLAINT_TREND_PRODUCTS = ["LABELS", "SHRINK SLEEVE", "LAMINATED POUCH"];

/** The twelve months of the calendar-year table, as printed. */
export const COMPLAINT_MONTHS: { key: string; label: string }[] = [
  { key: "jan", label: "Jan" },
  { key: "feb", label: "Feb" },
  { key: "mar", label: "Mar" },
  { key: "apr", label: "Apr" },
  { key: "may", label: "May" },
  { key: "jun", label: "Jun" },
  { key: "jul", label: "Jul" },
  { key: "aug", label: "Aug" },
  { key: "sep", label: "Sep" },
  { key: "oct", label: "Oct" },
  { key: "nov", label: "Nov" },
  { key: "dec", label: "Dec" },
];

/** 1 … 6: the period slots of the trend table. */
export const COMPLAINT_PERIOD_SLOTS = Array.from({ length: COMPLAINT_PERIODS }, (_, i) => i + 1);

/** F/MKT/04's Pareto of LABELS complaints, Jan 2021 to January 2026: [cause, defects] in the worksheet's order (21 defects). */
export const LABELS_CAUSES_2026: [cause: string, defects: number][] = [
  ["Winding direction is in reverse", 3],
  ["Label not release from liner", 2],
  ["Logo shifted due to punching out", 2],
  ["Print defects", 2],
  ["Goods Damaged", 2],
  ["Deep Punching Issue", 2],
  ["Face Material Deformities", 1],
  ["Found short qty.", 1],
  ["Scuff test fail", 1],
  ["Unwanted UV Coating", 1],
  ["Job mixing", 1],
  ["Loose winding", 1],
  ["Misregistration", 1],
  ["Short Quantity Dispatch", 1],
];

/** The SLEEVE Pareto up to 31.01.2026 (14 defects); the template's 8th line, "Packing related" with no count, is left out. */
export const SLEEVE_CAUSES_2026: [cause: string, defects: number][] = [
  ["Prinint issue", 4],
  ["Size variation against specification", 3],
  ["Gluing & size issue", 2],
  ["Packing related", 2],
  ["Hotmelt not done in sleeve", 1],
  ["Small ink spot", 1],
  ["Wrong material dispatch", 1],
];

/** The LAMINATED POUCHES Pareto, Jan 2024 to January 2026 (2 defects). */
export const LAMINATED_POUCH_CAUSES_2026: [cause: string, defects: number][] = [
  ["Shade Variation (Print defects)", 1],
  ["Size variation", 1],
];

const COMPLAINTS_TABLE = "Nos. of Customer complaints";

const COMPLAINT_TREND: LogSheetLayout = {
  documentId: "mkt-complaint-trend",
  // The title's product, then the trend table column by column, the calendar
  // year and its months — top to bottom as the page prints them.
  headerFields: [
    { key: "product", label: "CUSTOMER COMPLAINTS TREND ANALYSIS -", type: "select", options: COMPLAINT_TREND_PRODUCTS, required: true, autoFill: { carryForward: true } },
    // The series row's label under "Sr. no.": LABELS, SHRINK SLEEVE or LAMINATES.
    { key: "seriesName", label: "Sr. no.", type: "text", autoFill: { carryForward: true } },
    ...COMPLAINT_PERIOD_SLOTS.flatMap((n): LogHeaderField[] => [
      { key: `period${n}`, label: `${COMPLAINTS_TABLE} — Period ${n}`, type: "text", autoFill: { carryForward: true } },
      { key: `complaints${n}`, label: `${COMPLAINTS_TABLE} — Complaints ${n}`, type: "number" },
      // The Total row, worked out (complaintTotals).
      { key: `total${n}`, label: `Total — Period ${n}`, type: "text", computed: true },
    ]),
    // Carried from the last analysis (the specimen's, 2025, on the first) and
    // changed for the year in hand — see F/MKT/02's period.
    { key: "calendarYear", label: "Calender Year :", type: "text", required: true, autoFill: { carryForward: true } },
    ...COMPLAINT_MONTHS.map((m): LogHeaderField => ({ key: m.key, label: `Complaint Nos. — ${m.label}`, type: "number" })),
  ],
  // The Pareto's table: the causes and their counts are this product's own
  // and persist from one year's analysis to the next; the rest is worked out
  // (paretoCells).
  columns: [
    { key: "cause", label: "Causes", type: "text", width: 320, autoFill: { carryForward: true } },
    { key: "defects", label: "Defects", type: "number", decimals: 0, width: 90, autoFill: { carryForward: true } },
    { key: "cumulativePct", label: "Cumulative%", type: "text", computed: true, width: 110 },
    { key: "classification", label: "Vital Few / Useful Many", type: "text", computed: true, width: 150 },
  ],
  rowMode: { kind: "free", minRows: 1, typicalRows: 8 },
  footerFields: [
    // The chart title's second half: "LABELS (Jan 2021 to JANUARY 2026)".
    { key: "paretoTitle", label: "Customer Complaints -", type: "text" },
    { key: "cutoff", label: "Cumulative Percentage Cutoff:", type: "number", autoFill: { default: "80" } },
    // The template's sentence under the chart, worked out.
    { key: "paretoSummary", label: "Pareto Analysis", type: "text", computed: true },
  ],
  charts: [
    {
      kind: "bars",
      title: "Customer complaint Trend",
      bars: COMPLAINT_PERIOD_SLOTS.map((n) => ({ labelKey: `period${n}`, valueKey: `complaints${n}` })),
      yAxisLabel: "Complaint Nos.",
    },
    {
      kind: "pareto",
      title: "Customer Complaints -",
      titleKey: "paretoTitle",
      labelColumn: "cause",
      valueColumn: "defects",
      cutoffKey: "cutoff",
      yAxisLabel: "Defects",
      xAxisLabel: "Causes",
    },
  ],
  // The causes are each product's own, so no line is a specimen.
  specimenHeader: { product: "LABELS", seriesName: "LABELS", calendarYear: "2025", cutoff: "80" },
  specimenRows: [],
  originalPages: [
    page("fmkt04-trend-labels-2025-p1.jpg", "F/MKT/04 (00/01.12.2021) — Customer Complaints Trend Analysis, LABELS, calendar year 2025, as supplied"),
    page("fmkt04-trend-shrink-sleeve-2025-p1.jpg", "F/MKT/04 (00/01.12.2021) — Customer Complaints Trend Analysis, SHRINK SLEEVE, calendar year 2025, as supplied"),
    page("fmkt04-trend-pouch-2025-p1.jpg", "F/MKT/04 (00/01.12.2021) — Customer Complaints Trend Analysis, LAMINATED POUCH, calendar year 2025, as supplied"),
    page("fmkt04-pareto-labels-2026-p1.jpg", "F/MKT/04 — Pareto analysis of customer complaints, LABELS, Jan 2021 to January 2026, as supplied"),
    page("fmkt04-pareto-sleeve-2026-p1.jpg", "F/MKT/04 — Pareto analysis of customer complaints, SLEEVE, up to 31.01.2026, as supplied"),
    page("fmkt04-pareto-pouches-2026-p1.jpg", "F/MKT/04 — Pareto analysis of customer complaints, LAMINATED POUCHES, Jan 2024 to January 2026, as supplied"),
  ],
  specimenSource:
    "F-MKT-04_Complaint trend analysis(R-2026).xls — F/MKT/04 (00/01.12.2021), the company's own trend and Pareto worksheets for LABELS, SHRINK SLEEVE and LAMINATED POUCH, printed to the six PDFs of the same name; the product, its series name and the 80% cutoff are the specimen, the causes are each product's own",
};

export const MKT_LAYOUTS: Record<string, LogSheetLayout> = {
  [CUSTOMER_FEEDBACK.documentId]: CUSTOMER_FEEDBACK,
  [FEEDBACK_ANALYSIS.documentId]: FEEDBACK_ANALYSIS,
  [COMPLAINT_TREND.documentId]: COMPLAINT_TREND,
};
