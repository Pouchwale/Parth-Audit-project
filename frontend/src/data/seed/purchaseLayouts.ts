import type { LogColumn, LogHeaderField, LogSheetLayout, ReferenceTable } from "../../types";
import { supplierRatingCells, serviceRatingCells, type RatingCells } from "../../engine/purchaseRatings";

// THE PURCHASE MODULE'S FIVE FORMATS (REQUIREMENTS §68) — the formats the
// company supplied on 23-Sep-2026, as PDFs, reproduced as log-sheet layouts
// (types/logSheet.ts). Purchase's paperwork falls into two: what is done before
// a supplier may be used at all, and what is reviewed about one afterwards.
//
//   pur-supplier-registration           F/PUR/01 (00 / 01.12.2021)  SUPPLIER REGISTRATION FORM
//     — "F-PUR-01_Supplier registration form.pdf" (3 pages)
//   pur-supplier-audit-report           F/PUR/02 (00 / 01.12.2021)  SUPPLIER AUDIT REPORT
//     — "F-PUR-02_Supplier audit report.pdf" (9 pages)
//   pur-approved-suppliers              F/PUR/03 (00/01.12.2021)    LIST OF APPROVED SUPPLIERS (RM, PM, SERVICE PROVIDER)
//     — "F-PUR-03_List of Approved suppliers.pdf" (landscape, 7 printed rows)
//   pur-supplier-performance            F/PUR/05 (00/01.12.2021)    RAW MATERIAL … & PACKING MATERIALS SUPPLIER … PERFORMANCE MONITORING REGISTER
//     — "F-PUR-05_RM & PM Supplier Performance Monitoring.pdf" (landscape, 8 printed rows)
//   pur-service-provider-performance    F/PUR/06 (00/01.12.2021)    SERVICE PROVIDER - PERFORMANCE MONITORING REGISTER
//     — "F-PUR-06_Service provider monitoring.pdf" (13 printed rows)
//
// F/PUR/04 WAS NOT SUPPLIED and is not invented here.
//
// ALL FIVE WERE SUPPLIED BLANK. Nothing the company holds about a real supplier
// came with them, so no real supplier, contact person or telephone number
// appears anywhere below: the specimens each register needs — so that a sheet
// can be filled and read before the department has typed one — are plainly
// made-up "Sample Supplier A" lines, and each specimenSource says the blank
// format is all that was supplied.
//
// Every label, heading, column, note, criteria cell and numbering below is the
// paper's own wording, spelling, punctuation and spacing included. Where the
// paper is odd it is kept as printed: F/PUR/02's own gaps in its numbering
// (4.5 jumps to 4.10, 6.2 to 6.5), its trailing dashes on the SUMMARY OF
// OBSERVATIONS prompts — including the full stop on "6. Production & process
// control -." — F/PUR/05's double space in "> 15  days delay", its "Nos." and
// its lower-case "safety" in "Product safety Weightage 50%", and the two
// different attach-a-sheet notes on F/PUR/01 ("Please attach a separate sheet
// if required" under two blocks, "Attach separate sheet if required" under the
// other two).
//
// WHAT HAD TO BE REPRESENTED DIFFERENTLY FROM THE PAPER, and why:
//   * The grid's Sr. No. column is the renderer's own and is never declared —
//     so F/PUR/03's printed "SR. NO." and F/PUR/06's "Sr. No." are the numbers
//     the grid already prints down its side. Both registers are `free` rather
//     than `fixedRows` for the same reason the paper prints more pages of them:
//     an approved-supplier list and a performance register GROW. The printed
//     row counts (7 and 13) are their `typicalRows`, so a new sheet opens with
//     as many lines as the paper has.
//   * F/PUR/01 IS ALL BOXES — labelled lines and prose blocks from the top of
//     page 1 to the bottom of page 3 — so it declares no columns at all, and
//     the record view draws no grid for it.
//   * F/PUR/01's page-3 block prints "INFORMATION FURNISHED BY :" as a heading
//     over NAME / DESIGNATION / DATE / PLACE. The boxes above the grid are
//     drawn as one flat row, which loses the block, and "DESIGNATION :" is
//     printed twice on the form — so the four boxes of that block carry the
//     block's own heading in front of their printed label.
//   * F/PUR/01's four prose blocks each print their attach-a-sheet note beneath
//     the block. The note belongs to its block rather than to the page, so each
//     one is carried in its own box's label, verbatim.
//   * F/PUR/02 answers section 1 under the headings "AUDITED YES/NO",
//     "C/NC/NA", "COMMENTS / ACTIONS" and sections 2 to 8 under "AUDITED
//     YES/NO", "RATING", "COMMENTS". One grid cannot head one column two ways,
//     so the answer column's heading names both, and it offers the only values
//     the format prints anywhere: C, NC, NA. The supplied pages print no rating
//     scale for sections 2 to 8 — that is for the MR to confirm.
//   * F/PUR/02 prints each section title as a shaded band across the grid. A
//     layout has no banner row, so the section is a `fixed` column and its
//     title repeats down its own rows.
//   * F/PUR/02's shaded sub-heading "EXTERNAL LABORATORY - IF USED" is a row of
//     the grid with the heading in the audit-point column. The paper prints no
//     number against it; an em dash is written in the No. cell so the cell is
//     not taken for a blank to fill, and the shading is not reproduced.
//   * F/PUR/02's observations / NC table below the grid is three lines of four
//     boxes. A layout has one grid, so those twelve boxes are footer boxes,
//     each carrying the table's own printed column heading behind the line
//     number. The paper prints a fourth line of the same table on page 9.
//   * F/PUR/05's four printed criteria tables are `referenceTables` — the form
//     prints them across the top and nobody writes in them.
//   * Every format's own footer ("Format no. – F/PUR/02   Rev. – 00   Effective
//     Date – 01.12.2021   Page N of 9") is the document header the app prints
//     on every record, so it is not repeated as a field.

const SPECIMEN_NOTE = (file: string) => `${file} — the blank format, supplied 23-Sep-2026. Nothing about a real supplier came with it, so the specimen lines are plainly made-up "Sample Supplier" entries.`;

// ---------------------------------------------------------------------------
// F/PUR/01 — SUPPLIER REGISTRATION FORM (00 / 01.12.2021), 3 pages
//
// Page 1 is the supplier's general details, page 2 its products, customers,
// plant and quality control department and the certification question, page 3
// the documents asked for, who furnished the information, and the office's own
// block. The division the paper draws — the supplier above, INTERNAL OFFICE
// USE ONLY below the rule — is the division between the boxes above the grid
// and the boxes below it.

// A prose block. It takes autoFill only where the block DESCRIBES the supplier
// — an address, a range of products, the scope of a visit — because that is
// what repeats. A block that records a JUDGEMENT about this audit (COMMENTS,
// the SUMMARY OF OBSERVATIONS, an NC and its closure) never carries one: the
// assistant would otherwise write the last audit's findings into a visit that
// has not happened, which is the one thing it must never do (engine/autoFill.ts).
const paragraph = (key: string, label: string, autoFill?: LogHeaderField["autoFill"]): LogHeaderField => ({ key, label, type: "paragraph", autoFill });
const describing = { carryForward: true } as const;

const SUPPLIER_REGISTRATION_FIELDS: LogHeaderField[] = [
  { key: "supplierName", label: "SUPPLIER’S NAME :", type: "text", required: true, autoFill: { carryForward: true } },
  { key: "typeOfConcern", label: "TYPE OF CONCERN :", type: "select", options: ["Proprietary", "Partnership", "Private Limited", "Limited"], autoFill: { carryForward: true } },
  paragraph("addressOffice", "ADDRESS (OFFICE) :", describing),
  paragraph("addressWorks", "ADDRESS (WORKS) :", describing),
  { key: "contactPerson", label: "CONTACT PERSON :", type: "text", autoFill: { carryForward: true } },
  { key: "contactDesignation", label: "DESIGNATION :", type: "text", autoFill: { carryForward: true } },
  { key: "telephoneNos", label: "TELEPHONE NOS :", type: "text" },
  { key: "emailAddress", label: "E-MAIL ADDRESS :", type: "text" },
  { key: "weeklyOffWorkingHours", label: "WEEKLY OFF / WORKING HOURS :", type: "text", autoFill: { carryForward: true } },
  { key: "companyActivities", label: "COMPANY ACTIVITIES :", type: "select", options: ["Trading", "Manufacturing", "Services"], autoFill: { carryForward: true } },
  { key: "employeesTechnical", label: "NO. OF EMPLOYEES : Technical", type: "number", autoFill: { carryForward: true } },
  { key: "employeesNonTechnical", label: "NO. OF EMPLOYEES : Non-Technical", type: "number", autoFill: { carryForward: true } },
  { key: "yearOfCommencement", label: "YEAR OF COMMENCEMENT :", type: "text", autoFill: { carryForward: true } },
  // The four prose blocks, each with the note the paper prints beneath it.
  paragraph("rangeOfProducts", "RANGE OF PRODUCTS / SERVICES OFFERED (Please attach a separate sheet if required)", describing),
  paragraph("majorCustomers", "LIST OF MAJOR CUSTOMERS (Attach separate sheet if required)", describing),
  paragraph("plantMachinery", "PARTICULARS OF PLANT MACHINERY & OTHER INFRASTRUCTURE (NOT APPLICABLE FOR TRADERS) (Attach separate sheet if required)", describing),
  paragraph("qualityControlDept", "DETAILS OF QUALITY CONTROL DEPARTMENT (PROVIDE DETAILS OF TESTING FACILITY, TEST METHODS) (Please attach a separate sheet if required)", describing),
  { key: "holdsCertification", label: "DO YOU HOLD ISO 9001 / ISO 22000 / HACCP / FSSC / BRCGS CERTIFICATION:", type: "yesno", autoFill: { carryForward: true } },
  // Page 3: who furnished the information. The block's own heading goes in
  // front of each printed label, because the form prints "DESIGNATION :" twice.
  { key: "furnishedName", label: "INFORMATION FURNISHED BY — NAME :", type: "text", autoFill: { carryForward: true } },
  { key: "furnishedDesignation", label: "INFORMATION FURNISHED BY — DESIGNATION :", type: "text", autoFill: { carryForward: true } },
  { key: "furnishedDate", label: "INFORMATION FURNISHED BY — DATE :", type: "date", autoFill: { dueDate: true } },
  { key: "furnishedPlace", label: "INFORMATION FURNISHED BY — PLACE :", type: "text", autoFill: { carryForward: true } },
  { key: "signatureWithSeal", label: "SIGNATURE WITH COMPANY’S SEAL", type: "text" },
];

const SUPPLIER_REGISTRATION_OFFICE_FIELDS: LogHeaderField[] = [
  { key: "statusOfSupplier", label: "Status of Supplier :", type: "select", options: ["New", "Established"], autoFill: { default: "New" } },
  {
    key: "assessmentType",
    label: "If new supplier/new product, type of Assessment Status: (Please attach status report)",
    type: "select",
    options: ["By Visit / Supplier audit", "By Registration Form Details", "By Placing Trial Orders", "By GFSI scheme certification", "By Exception (Market Reputation)"],
    autoFill: { default: "By Registration Form Details" },
  },
  paragraph("approvedProductsServices", "Products / Services for which Supplier is approved :", describing),
  // The office's own decision, so a blank form is never pre-answered with one:
  // it is written by the person who signs beneath it.
  { key: "assessmentStatus", label: "ASSESSMENT STATUS :", type: "select", options: ["APPROVED", "REJECTED"] },
  { key: "authorisedPerson", label: "SIGNATURE & AUTHORISED PERSON :", type: "text", autoFill: { sign: true } },
];

const supplierRegistration: LogSheetLayout = {
  documentId: "pur-supplier-registration",
  instructions: [
    "GENERAL DETAILS – TO BE FILLED UP BY SUPPLIER",
    "Please provide following documents along with this form.",
    "1. Technical data sheet / Specification sheet",
    "2. MSDS",
    "3. Food grade declaration or compatible to food contact packaging",
    "4. Traceability protocol or yours internal Traceability record for one of the lots supplied to us",
    "5. Copy of management system certification (e.g. ISO 9001 / FSSC 22000 / BRCGS as applicable)",
  ],
  // DCRS's own word on keeping the sheet: on the screen only, never on the paper or in a download (REQUIREMENTS §183).
  screenNotes: [
    "INTERNAL OFFICE USE ONLY — the five boxes BELOW are the office's, as on page 3 of the form: the status of the supplier, the type of assessment, what the supplier is approved for, the assessment status and the authorised person's signature. Everything above them is the supplier's to fill.",
  ],
  // The office's five boxes stand once, at the end, as on page 3 of the paper (REQUIREMENTS §183).
  footOnce: true,
  headerFields: SUPPLIER_REGISTRATION_FIELDS,
  // The form has no grid: it is labelled lines and prose blocks throughout.
  columns: [],
  rowMode: { kind: "single" },
  footerFields: SUPPLIER_REGISTRATION_OFFICE_FIELDS,
  specimenHeader: {
    supplierName: "Sample Supplier A",
    typeOfConcern: "Private Limited",
    addressOffice: "Sample office address, line 1\nSample office address, line 2",
    addressWorks: "Sample works address, line 1\nSample works address, line 2",
    contactPerson: "Sample contact person",
    contactDesignation: "Manager – Sales",
    telephoneNos: "",
    emailAddress: "",
    weeklyOffWorkingHours: "Sunday / 09:00 to 18:00",
    companyActivities: "Manufacturing",
    employeesTechnical: "25",
    employeesNonTechnical: "40",
    yearOfCommencement: "2005",
    rangeOfProducts: "Label stock — chromo paper and glassine release liner, in reels.",
    majorCustomers: "Sample Customer 1, Sample Customer 2, Sample Customer 3.",
    plantMachinery: "Coating line, slitting and rewinding machines, reel handling.",
    qualityControlDept: "In-house laboratory: GSM balance, caliper gauge, peel tester. Test methods as per the supplier's own procedures.",
    holdsCertification: "Yes",
    furnishedName: "Sample contact person",
    furnishedDesignation: "Manager – Sales",
    furnishedPlace: "Mehsana",
    signatureWithSeal: "",
    statusOfSupplier: "New",
    assessmentType: "By Registration Form Details",
    approvedProductsServices: "Label stock (chromo paper with glassine release liner).",
    authorisedPerson: "",
  },
  specimenSource: SPECIMEN_NOTE("F-PUR-01_Supplier registration form.pdf — F/PUR/01 (Rev. 00, Effective 01.12.2021)"),
};

// ---------------------------------------------------------------------------
// F/PUR/02 — SUPPLIER AUDIT REPORT (00 / 01.12.2021), 9 pages
//
// Page 1 is the visit and the eight audit criteria answered Y / N / NA, pages 2
// to 8 the eight sections' audit points, page 8 the SUMMARY OF OBSERVATIONS and
// the observations / NC table, page 9 the overall status and the signature.

/** One section's audit points: the printed number and the printed wording. */
type AuditPoint = [string, string];

const auditRows = (section: string, points: AuditPoint[]): Record<string, string>[] =>
  points.map(([itemNo, auditPoint]) => ({ section, itemNo, auditPoint }));

const AUDIT_POINT_ROWS: Record<string, string>[] = [
  ...auditRows("1. QUALITY SYSTEMS/HACCP", [
    ["1.1", "Specification suitability"],
    ["1.2", "Implementation of HACCP"],
    ["1.3", "Internal hygiene status"],
    ["1.4", "Documented work instructions"],
    ["1.5", "Complaint handling"],
    ["1.6", "Non-conforming product segregation and disposal"],
    ["1.7", "Corrective action procedures"],
  ]),
  ...auditRows("2. FACTORY PREMISES/LOCATION", [
    ["2.1", "Description of location"],
    ["2.2", "Condition of perimeter/yard"],
    ["2.3", "General condition of buildings"],
    ["2.4", "Condition of floors"],
    ["2.5", "Condition of walls"],
    ["2.6", "Condition of ceilings"],
    ["2.7", "Condition of doors"],
    ["2.8", "Condition of windows"],
    ["2.9", "General cleanliness/house keeping"],
    ["2.10", "Condition and cleanliness of overheads"],
  ]),
  ...auditRows("3. HYGIENE OF PERSONNEL", [
    ["3.1", "Changing areas"],
    ["3.2", "Condition of cloakroom/toilets"],
    ["3.3", "Wearing of protective clothing including hats, hairnets and snoods"],
    ["3.4", "Cleaning and control of protective clothing"],
    ["3.5", "Control of jewellery, watches and nail varnish"],
    ["3.6", "Hand washing facilities"],
    ["3.7", "Use of hand washing facilities"],
    ["3.8", "Restrictions on smoking"],
    ["3.9", "Control of food and drink in production area"],
    ["3.10", "Hygiene training"],
  ]),
  // The form's own numbering: 4.5 is followed by 4.10.
  ...auditRows("4. INFESTATION/FOREIGN BODY CONTROL", [
    ["4.1", "Proofing of doors / Windows"],
    ["4.2", "Insect control/evidence"],
    ["4.3", "Rodent control/evidence"],
    ["4.4", "Glass risk/control"],
    ["4.5", "Foreign matter risk and elimination"],
    ["4.10", "Risk from maintenance staff/equipment including grease/oil risks"],
  ]),
  ...auditRows("5. RAW MATERIALS CONTROL", [
    ["5.1", "Raw materials specifications (list specification details seen)"],
    ["5.2", "Supplier quality assurance"],
    ["5.3", "Inspection of raw materials/QC records"],
    ["5.4", "Storage of raw materials"],
    ["5.5", "Traceability of materials"],
  ]),
  // And again: 6.2 is followed by 6.5.
  ...auditRows("6. PRODUCTION AND PROCESS CONTROL", [
    ["6.1", "Specification suitability"],
    ["6.2", "Implementation of HACCP"],
    ["6.5", "Quality manual/system implementation"],
  ]),
  ...auditRows("7. PRODUCT ANALYSIS AND QUALITY ASSURANCE", [
    ["7.1", "Laboratory facilities (In-house)"],
    // The shaded sub-heading the form prints across the section, part way down.
    ["—", "EXTERNAL LABORATORY - IF USED"],
    ["7.2", "External laboratory approval/accreditation"],
    ["7.3", "Testing schedule/records"],
    ["7.4", "Microbiological testing/records"],
    ["7.5", "Migration testing/records"],
  ]),
  ...auditRows("8. PACKED PRODUCT STORAGE AND DISTRIBUTION", [
    ["8.1", "Hygiene/housekeeping of warehouse"],
    ["8.2", "Stacking of packed product"],
    ["8.3", "Condition/control of pallets or other transport systems"],
    ["8.4", "Stock rotation control"],
    ["8.5", "Transport"],
  ]),
];

/** The eight criteria page 1 prints, each answered Y / N / NA. */
const AUDIT_CRITERIA: [string, string][] = [
  ["criterion1", "1. HACCP/Quality system"],
  ["criterion2", "2. Factory premises/location"],
  ["criterion3", "3. Hygiene of personnel"],
  ["criterion4", "4. Infestation/foreign body control"],
  ["criterion5", "5. Raw materials control"],
  ["criterion6", "6. Production & process control"],
  ["criterion7", "7. Product analysis & quality assurance"],
  ["criterion8", "8. Product storage and distribution"],
];

/** The eight SUMMARY OF OBSERVATIONS prompts, with the form's own trailing dashes. */
const SUMMARY_PROMPTS: [string, string][] = [
  ["summary1", "1. HACCP/Quality system –"],
  ["summary2", "2. Factory premises/location    -"],
  ["summary3", "3. Hygiene of personnel -"],
  ["summary4", "4. Infestation/foreign body control -"],
  ["summary5", "5. Raw materials control –"],
  ["summary6", "6. Production & process control -."],
  ["summary7", "7. Product analysis & quality assurance –"],
  ["summary8", "8. Product storage and distribution -"],
];

/** The observations / NC table's four printed column headings, per printed line. */
const NC_TABLE_FIELDS: LogHeaderField[] = [1, 2, 3].flatMap((line) => [
  { key: `nc${line}Section`, label: `NC ${line} — Section`, type: "text" as const, width: 120 },
  paragraph(`nc${line}Details`, `NC ${line} — Details of observations / NC`),
  paragraph(`nc${line}Response`, `NC ${line} — Response evidence received from supplier / on-site verification`),
  { key: `nc${line}Closure`, label: `NC ${line} — Date of closure`, type: "date" as const, width: 150 },
]);

const supplierAuditReport: LogSheetLayout = {
  documentId: "pur-supplier-audit-report",
  // The summary of observations, the NC table and the overall status stand once, after the audit points, as on pages 8 and 9
  // of the paper (REQUIREMENTS §183): taller than a page, they ran to its very foot as the sheet's foot.
  footOnce: true,
  // The paper numbers its audit points 1.1 to 8.x in a "No." column of its own (REQUIREMENTS §102).
  ownLineNumbers: true,
  instructions: [
    "AUDIT CRITERIA:",
    "DEPENDING ON THE TYPE OF SUPPLY CRITERIA MAY BE OMITTED - IF OMITTED PLEASE MARK N/A",
  ],
  // DCRS's own word on keeping the sheet: on the screen only, never on the paper or in a download (REQUIREMENTS §183).
  screenNotes: [
    "The eight criteria above are answered Y / N / NA in the boxes below; the eight sections' audit points are the grid. Section 1 is answered under the form's headings \"C/NC/NA\" and \"COMMENTS / ACTIONS\", sections 2 to 8 under \"RATING\" and \"COMMENTS\" — one grid heads each of those columns both ways, and the answer column offers the only values the format prints: C, NC, NA.",
    "SUMMARY OF OBSERVATIONS, the observations / NC table and \"Overall Status - Approved / Rejected\" are the boxes BELOW the grid, as on pages 8 and 9 of the form.",
  ],
  headerFields: [
    { key: "supplier", label: "SUPPLIER:", type: "text", required: true, autoFill: { carryForward: true } },
    { key: "contacts", label: "CONTACTS:", type: "text", autoFill: { carryForward: true } },
    { key: "dateOfVisit", label: "DATE OF VISIT:", type: "date", autoFill: { dueDate: true } },
    { key: "visitNo", label: "VISIT NO:", type: "text", autoFill: { carryForward: true } },
    { key: "auditors", label: "AUDITOR (S):", type: "text", required: true, autoFill: { sign: true } },
    paragraph("scopeOfAudit", "SCOPE OF AUDIT", describing),
    paragraph("productSupplied", "PRODUCT SUPPLIED", describing),
    // Y / N / NA here is what was IN SCOPE, not a verdict: the form's own note
    // says a criterion may be omitted and then marked N/A.
    ...AUDIT_CRITERIA.map(([key, label]): LogHeaderField => ({ key, label, type: "select", options: ["Y", "N", "NA"], autoFill: { carryForward: true } })),
    // The auditor's own words about this visit — never inherited.
    paragraph("auditComments", "COMMENTS:"),
  ],
  columns: [
    { key: "section", label: "Section", type: "text", fixed: true, width: 230 },
    { key: "itemNo", label: "No.", type: "text", fixed: true, width: 52 },
    { key: "auditPoint", label: "Audit point", type: "text", fixed: true, width: 330 },
    { key: "audited", label: "AUDITED YES/NO", type: "yesno", width: 110 },
    { key: "rating", label: "C/NC/NA (Section 1) / RATING (Sections 2 to 8)", type: "select", options: ["C", "NC", "NA"], width: 130 },
    { key: "comments", label: "COMMENTS / ACTIONS (Section 1) / COMMENTS (Sections 2 to 8)", type: "text", width: 260 },
  ],
  rowMode: { kind: "fixedRows", rows: AUDIT_POINT_ROWS },
  footerFields: [
    ...SUMMARY_PROMPTS.map(([key, label]) => paragraph(key, label)),
    ...NC_TABLE_FIELDS,
    { key: "overallStatus", label: "Overall Status - Approved / Rejected", type: "select", options: ["Approved", "Rejected"] },
    { key: "sign", label: "Sign: -", type: "text", autoFill: { sign: true } },
  ],
  // What the specimen carries is what CAN be known before the visit: who is
  // being audited, what they supply, which criteria are in scope, and — in the
  // grid — that each point in those criteria was gone through. The rating, the
  // comments, the summary, the NC table and the overall status are the
  // auditor's judgement and are left for the auditor to write.
  specimenHeader: {
    supplier: "Sample Supplier A",
    contacts: "Sample contact person",
    visitNo: "1",
    auditors: "Sample auditor",
    scopeOfAudit: "Manufacture and supply of label stock — chromo paper with glassine release liner.",
    productSupplied: "Label stock, in reels.",
    criterion1: "Y",
    criterion2: "Y",
    criterion3: "Y",
    criterion4: "Y",
    criterion5: "Y",
    criterion6: "Y",
    criterion7: "Y",
    criterion8: "Y",
  },
  specimenRows: AUDIT_POINT_ROWS.map((row) =>
    // The shaded sub-heading is a heading, not a point: nothing is written against it.
    row.auditPoint === "EXTERNAL LABORATORY - IF USED" ? { audited: "", rating: "", comments: "" } : { audited: "Yes", rating: "", comments: "" }
  ),
  specimenSource: SPECIMEN_NOTE("F-PUR-02_Supplier audit report.pdf — F/PUR/02 (Rev. 00, Effective 01.12.2021)"),
};

// ---------------------------------------------------------------------------
// F/PUR/03 — LIST OF APPROVED SUPPLIERS (RM, PM, SERVICE PROVIDER) (00/01.12.2021)
//
// A landscape list, seven printed rows, with four tick columns and the GFSI
// certification column drawn beneath one spanning "METHOD OF APPROVAL" heading.

// THE LIST AS THE PLANT KEEPS IT (the owner, 6-Nov-2026, of "LIST OF APPROVED SUPPLIERS.pdf": "in that header is fix as it
// is do that also and i want same document in system which i have given to you", REQUIREMENTS §188). The 2021 blank
// format's columns (the five METHOD OF APPROVAL ticks) gave way to the list's own: Vendor Code, the applicable product, the
// six documents (SRF, TDS/SPECS, MSDS, FOOD GRADE DECLARATION, TRACEABILITY, ISO CERTIFICATE), the re-approval due date
// and the file number - every heading in its wording. A service provider's six document cells are ONE cell, as the list
// draws them ("SERVICE AGREEMENT", "ISO 17025 ACCREDITATION"): lineMerges. The two dates are written as the list writes
// them, a date or its words ("Approved Prior to 01.1.2021"). The lines come from Purchase Master Data (§186, §187).
const approvedSuppliers: LogSheetLayout = {
  documentId: "pur-approved-suppliers",
  instructions: [
    "LIST OF APPROVED SUPPLIERS (RM, PM, SERVICE PROVIDER)",
  ],
  // DCRS's own word on keeping the sheet: on the screen only, never on the paper or in a download (REQUIREMENTS §183).
  screenNotes: [
    "The list as the plant keeps it: Fetch from Purchase Master Data above writes a supplier's line, or every supplier at once. A service provider's six document columns are one cell, as the list draws them.",
  ],
  headerFields: [{ key: "updationAsOn", label: "UPDATION AS ON :", type: "date", autoFill: { dueDate: true } }],
  columns: [
    { key: "vendorCode", label: "Vendor Code", type: "text", width: 100 },
    { key: "supplierName", label: "SUPPLIER NAME", type: "text", required: true, width: 220 },
    { key: "productService", label: "PRODUCT / SERVICE", type: "text", width: 170 },
    { key: "applicableProduct", label: "APPLICABLE PRODUCT (MONO CARTON / CORRUGATED BOX / PRESSURE LABEL / SHRINK SLEEVE)", type: "text", width: 180 },
    { key: "category", label: "CATEGORY (TRADER / MANUFACTURER / SERVICE PROVIDER)", type: "select", options: ["TRADER", "MANUFACTURER", "SERVICE PROVIDER"], width: 180 },
    { key: "manufacturerName", label: "MANUFACTURER NAME (IF MATERIALS PROCURED FROM TRADERS)", type: "text", width: 200 },
    { key: "srf", label: "SRF", type: "text", width: 80 },
    { key: "tdsSpecs", label: "TDS/SPECS", type: "text", width: 90 },
    { key: "msds", label: "MSDS", type: "text", width: 80 },
    { key: "foodGradeDeclaration", label: "FOOD GRADE DECLARATION", type: "text", width: 110 },
    { key: "traceability", label: "TRACEABILITY", type: "text", width: 110 },
    { key: "isoCertificate", label: "ISO CERTIFICATE", type: "text", width: 100 },
    { key: "contactPerson", label: "CONTACT PERSON", type: "text", width: 160 },
    { key: "contactNumber", label: "CONTACT NUMBER", type: "text", width: 140 },
    { key: "location", label: "LOCATION", type: "text", width: 130 },
    { key: "approvalDate", label: "APPROVAL DATE", type: "text", width: 150 },
    { key: "reapprovalDueDate", label: "Re-approval Due date", type: "text", width: 140 },
    { key: "fileNo", label: "File No", type: "text", width: 110 },
  ],
  // A service provider's line: its six document cells are one, as the list draws them.
  lineMerges: [{ whenKey: "category", whenValue: "SERVICE PROVIDER", from: "srf", to: "isoCertificate" }],
  // Its eighteen columns are narrow on A4 (the print turns the page to landscape for them): every name wraps in its cell,
  // never cut (§189).
  printWordsAll: true,
  // Seven rows on a new sheet; the list grows as suppliers are approved (65 on Purchase Master Data).
  rowMode: { kind: "free", minRows: 1, typicalRows: 7 },
  // The list's own first lines (Sr. No. 32 to 38 of the pages supplied), as specimen.
  specimenRows: [
    { vendorCode: "S0137", supplierName: "K S Inctech Pvt.Ltd.", productService: "Printing Ink", applicableProduct: "PRESSURE LABEL", category: "MANUFACTURER", manufacturerName: "NA", srf: "YES", tdsSpecs: "YES", msds: "YES", foodGradeDeclaration: "YES", traceability: "YES", isoCertificate: "YES", contactPerson: "Rajnarayan", contactNumber: "8754013955", location: "Banglore", approvalDate: "17-01-2025", reapprovalDueDate: "16-01-2028", fileNo: "1" },
    { vendorCode: "S0086", supplierName: "Fujifilm Sericol India Private Limited", productService: "Printing Ink", applicableProduct: "PRESSURE LABEL", category: "MANUFACTURER", manufacturerName: "NA", srf: "YES", tdsSpecs: "YES", msds: "YES", foodGradeDeclaration: "YES", traceability: "YES", isoCertificate: "YES", contactPerson: "Vaibhavbhai", contactNumber: "9725145260", location: "Mumbai", approvalDate: "27-01-2025", reapprovalDueDate: "26-01-2028", fileNo: "1" },
    { vendorCode: "S1105", supplierName: "Hubergroup India Pvt.Ltd", productService: "Printing Ink", applicableProduct: "PRESSURE LABEL", category: "MANUFACTURER", manufacturerName: "NA", srf: "YES", tdsSpecs: "YES", msds: "YES", foodGradeDeclaration: "YES", traceability: "??", isoCertificate: "NA", contactPerson: "Umangbhai", contactNumber: "9824750056", location: "Ahmedabad", approvalDate: "12-01-2025", reapprovalDueDate: "11-01-2028", fileNo: "1" },
    { vendorCode: "S0584", supplierName: "San Printech Pvt.Ltd.", productService: "Flexo Printing Ink", applicableProduct: "PRESSURE LABEL", category: "MANUFACTURER", manufacturerName: "NA", srf: "YES", tdsSpecs: "YES", msds: "YES", foodGradeDeclaration: "NA", traceability: "YES", isoCertificate: "NA", contactPerson: "Niyatibhai", contactNumber: "9892061360", location: "Mumbai", approvalDate: "20-01-2024", reapprovalDueDate: "19-01-2027", fileNo: "1" },
    { vendorCode: "S0191", supplierName: "Poojan Industries", productService: "Printing Ink", applicableProduct: "PRESSURE LABEL", category: "TRADER", manufacturerName: "TOYO Ink", srf: "YES", tdsSpecs: "YES", msds: "YES", foodGradeDeclaration: "NA", traceability: "NA", isoCertificate: "NA", contactPerson: "Bhavneshbhai", contactNumber: "9825503831", location: "Ahmedabad", approvalDate: "28-01-2025", reapprovalDueDate: "27-01-2028", fileNo: "1" },
    { vendorCode: "S0529", supplierName: "Gurudev Pest Control", productService: "PEST CONTROL", applicableProduct: "NA", category: "SERVICE PROVIDER", manufacturerName: "NA", srf: "SERVICE AGREEMENT", tdsSpecs: "", msds: "", foodGradeDeclaration: "", traceability: "", isoCertificate: "", contactPerson: "Rohit patel", contactNumber: "", location: "Mahesana", approvalDate: "01-04-2025", reapprovalDueDate: "31-03-2026", fileNo: "Service File" },
    { vendorCode: "S0223", supplierName: "Sakhidas Papers", productService: "Duplex", applicableProduct: "Mono Carton", category: "TRADER", manufacturerName: "Aditya", srf: "YES", tdsSpecs: "NA", msds: "NA", foodGradeDeclaration: "NA", traceability: "NA", isoCertificate: "NA", contactPerson: "Ashitbhai", contactNumber: "9825607434", location: "Ahmedabad", approvalDate: "03-01-2026", reapprovalDueDate: "02-01-2029", fileNo: "6" },
  ],
  specimenSource: "LIST OF APPROVED SUPPLIERS.pdf — the plant's list as supplied by the owner on 5-Nov-2026 (Sr. No. 32 to 72), F/PUR/03",
};

// ---------------------------------------------------------------------------
// F/PUR/05 — RAW MATERIAL (LABEL STOCK, INK, FILMS etc.) & PACKING MATERIALS
// SUPPLIER (PAPER CORE, WOODEN PALLETS etc.) PERFORMANCE MONITORING REGISTER
// (00/01.12.2021)
//
// Four criteria tables are printed across the top of the form; the register
// itself carries the three ratings they give, the three weighted figures, the
// Overall Rating and the Grade. The last five are worked out, never typed
// (engine/purchaseRatings.ts).

const PERFORMANCE_CRITERIA: ReferenceTable[] = [
  {
    title: "Product Safety Rating",
    columns: ["% Acceptance", "Marks"],
    rows: [
      ["No infestation", "100 Marks"],
      ["Infestation", "0 Marks"],
    ],
  },
  {
    title: "Quality Rating",
    columns: ["% Acceptance", "Marks"],
    rows: [
      ["100% accept.", "100 Marks"],
      ["Accepted on Segregation", "50 Marks"],
      ["Rejected & send back to Supplier", "00 Marks"],
    ],
  },
  {
    title: "Delivery Rating",
    columns: ["Delivery Time", "Marks"],
    rows: [
      ["Before Time / < 7 Days PO", "100 Marks"],
      ["> 7 Days & < 15 days delay", "75 Marks"],
      // The form's own double space between "15" and "days".
      ["> 15  days delay", "50 Marks"],
    ],
  },
  {
    title: "Overall Rating",
    columns: ["Marks", "Grade", "Action"],
    rows: [
      ["If ≥ 90", '"A" Grade', "Continue"],
      ["If < 90 & ≥ 80", '"B" Grade', "Continue & improve"],
      ["If < 80", '"C" Grade', "Replace / improve"],
    ],
  },
];

/** A weighted column: worked out from the rating beside it, so it is never typed. */
// Worked out, and typed over when a person needs to (the owner, 6-Nov-2026: "completely editable", REQUIREMENTS §188).
const weightage = (key: string, label: string): LogColumn => ({ key, label, type: "text", computed: true, typable: true, width: 150 });

const SUPPLIER_PERFORMANCE_LINES: RatingCells[] = [
  { supplierName: "Sample Supplier A", period: "01.04.2026 to 30.09.2026", material: "Label stock — chromo paper", lotsReceived: 12, lotsRejected: 0, productSafetyRating: 100, qualityRating: 100, deliveryRating: 100 },
  { supplierName: "Sample Supplier B", period: "01.04.2026 to 30.09.2026", material: "Offset ink", lotsReceived: 6, lotsRejected: 1, productSafetyRating: 100, qualityRating: 50, deliveryRating: 100 },
  { supplierName: "Sample Supplier C", period: "01.04.2026 to 30.09.2026", material: "BOPP film", lotsReceived: 9, lotsRejected: 0, productSafetyRating: 100, qualityRating: 100, deliveryRating: 75 },
  { supplierName: "Sample Supplier E", period: "01.04.2026 to 30.09.2026", material: "Paper cores", lotsReceived: 4, lotsRejected: 0, productSafetyRating: 100, qualityRating: 100, deliveryRating: 100 },
  { supplierName: "Sample Supplier F", period: "01.04.2026 to 30.09.2026", material: "Wooden pallets", lotsReceived: 3, lotsRejected: 1, productSafetyRating: 100, qualityRating: 50, deliveryRating: 50 },
  { supplierName: "Sample Supplier I", period: "01.04.2026 to 30.09.2026", material: "Duplex board", lotsReceived: 5, lotsRejected: 0, productSafetyRating: 100, qualityRating: 100, deliveryRating: 75 },
  { supplierName: "Sample Supplier J", period: "01.04.2026 to 30.09.2026", material: "Starch powder", lotsReceived: 2, lotsRejected: 0, productSafetyRating: 100, qualityRating: 100, deliveryRating: 100 },
  { supplierName: "Sample Supplier K", period: "01.04.2026 to 30.09.2026", material: "Shrink sleeve film", lotsReceived: 7, lotsRejected: 1, productSafetyRating: 100, qualityRating: 50, deliveryRating: 75 },
];

const supplierPerformance: LogSheetLayout = {
  documentId: "pur-supplier-performance",
  instructions: [
    "Enter value based on above criteria in the following cells",
    "Don’t enter value in the following cell, its formula based",
  ],
  // DCRS's own word on keeping the sheet: on the screen only, never on the paper or in a download (REQUIREMENTS §183).
  screenNotes: [
    "Both lines above are printed across the grid itself: the first over the Product Safety, Quality and Delivery Rating columns, the second over the three Weightage columns, the Overall Rating and the Grade — which are worked out here from the three ratings; any of them may be typed over, and the typed figure stands, marked, until its cell is emptied. The criteria the first line refers to are the four tables the form prints across its top, shown below.",
  ],
  headerFields: [],
  columns: [
    { key: "supplierName", label: "Supplier / Service provider Name", type: "text", required: true, width: 200 },
    { key: "period", label: "Period under review", type: "text", width: 170 },
    { key: "material", label: "Material Description", type: "text", width: 190 },
    { key: "lotsReceived", label: "Nos. of Lots received", type: "number", decimals: 0, width: 130 },
    { key: "lotsRejected", label: "Nos. of Lots rejected / returned / infested", type: "number", decimals: 0, width: 160 },
    // Printed on the register as the plant fills it (the owner's 2025 register, REQUIREMENTS §188): the lots delivered late.
    { key: "delayed", label: "Delayed", type: "number", decimals: 0, width: 100 },
    { key: "productSafetyRating", label: "Product Safety Rating (X)", type: "number", decimals: 0, min: 0, max: 100, width: 140 },
    { key: "qualityRating", label: "Quality Rating (Y)", type: "number", decimals: 0, min: 0, max: 100, width: 130 },
    { key: "deliveryRating", label: "Delivery Rating (Z)", type: "number", decimals: 0, min: 0, max: 100, width: 130 },
    weightage("productSafetyWeightage", "Product safety Weightage 50%"),
    weightage("qualityWeightage", "Quality Weightage 40%"),
    weightage("deliveryWeightage", "Delivery Weightage 10%"),
    weightage("overallRating", "Overall Rating"),
    { key: "grade", label: "Grade", type: "text", computed: true, typable: true, width: 80 },
  ],
  // Eight rows are printed; a review adds a line per supplier and material.
  rowMode: { kind: "free", minRows: 1, typicalRows: 8 },
  referenceTables: PERFORMANCE_CRITERIA,
  // The specimen's formula cells come from the same functions the register
  // uses, so the printed example can never disagree with the arithmetic.
  specimenRows: SUPPLIER_PERFORMANCE_LINES.map((line) => ({ ...line, ...supplierRatingCells(line) })),
  specimenSource: SPECIMEN_NOTE("F-PUR-05_RM & PM Supplier Performance Monitoring.pdf — F/PUR/05 (00/01.12.2021)"),
};

// ---------------------------------------------------------------------------
// F/PUR/06 — SERVICE PROVIDER - PERFORMANCE MONITORING REGISTER (00/01.12.2021)
//
// Thirteen printed rows. Both parameter ratings are out of 50, the Overall
// Rating is the two added — printed 0 on the blank form, so it is worked out
// here — and the Status / Decision is the buyer's own, written in.

const SERVICE_PERFORMANCE_LINES: RatingCells[] = [
  { serviceDescription: "Pest control service", supplierName: "Sample Service Provider G", deliveryRating: 45, qualityRating: 48, status: "Continue" },
  { serviceDescription: "Instrument calibration service", supplierName: "Sample Service Provider H", deliveryRating: 50, qualityRating: 50, status: "Continue" },
  { serviceDescription: "Housekeeping service", supplierName: "Sample Service Provider I", deliveryRating: 40, qualityRating: 42, status: "Continue" },
  { serviceDescription: "Transporter — outward dispatch", supplierName: "Sample Service Provider J", deliveryRating: 35, qualityRating: 45, status: "Continue; delivery to improve" },
  { serviceDescription: "Waste disposal", supplierName: "Sample Service Provider K", deliveryRating: 45, qualityRating: 45, status: "Continue" },
  { serviceDescription: "Water testing laboratory", supplierName: "Sample Service Provider L", deliveryRating: 48, qualityRating: 50, status: "Continue" },
  { serviceDescription: "Microbiological testing laboratory", supplierName: "Sample Service Provider M", deliveryRating: 42, qualityRating: 46, status: "Continue" },
  { serviceDescription: "Printing machine maintenance", supplierName: "Sample Service Provider N", deliveryRating: 38, qualityRating: 40, status: "Reviewed with the provider" },
  { serviceDescription: "Electrical maintenance", supplierName: "Sample Service Provider O", deliveryRating: 44, qualityRating: 46, status: "Continue" },
  { serviceDescription: "Air compressor servicing", supplierName: "Sample Service Provider P", deliveryRating: 46, qualityRating: 48, status: "Continue" },
  { serviceDescription: "Fire extinguisher refilling", supplierName: "Sample Service Provider Q", deliveryRating: 50, qualityRating: 48, status: "Continue" },
  { serviceDescription: "Security service", supplierName: "Sample Service Provider R", deliveryRating: 40, qualityRating: 44, status: "Continue" },
  { serviceDescription: "Courier service", supplierName: "Sample Service Provider S", deliveryRating: 36, qualityRating: 42, status: "Under review" },
];

const serviceProviderPerformance: LogSheetLayout = {
  documentId: "pur-service-provider-performance",
  instructions: [
    "SERVICE PROVIDER - PERFORMANCE MONITORING REGISTER",
  ],
  // DCRS's own word on keeping the sheet: on the screen only, never on the paper or in a download (REQUIREMENTS §183).
  screenNotes: [
    "Both parameter ratings are out of 50, so the Overall Rating is 100 at most. It is the two added and is worked out here — the blank form prints 0 in every one of its cells — and may be typed over; the typed figure stands, marked, until its cell is emptied. The Status / Decision is written in.",
  ],
  headerFields: [{ key: "ratingPeriod", label: "Rating Period :", type: "text", autoFill: { carryForward: true } }],
  columns: [
    { key: "serviceDescription", label: "Description of Service", type: "text", required: true, width: 240 },
    { key: "supplierName", label: "Supplier Name", type: "text", width: 220 },
    { key: "deliveryRating", label: "Delivery Parameter rating (Max 50)", type: "number", decimals: 0, min: 0, max: 50, width: 160 },
    { key: "qualityRating", label: "Quality & Product Safety Parameter rating (Max 50)", type: "number", decimals: 0, min: 0, max: 50, width: 190 },
    { key: "overallRating", label: "Overall Rating", type: "text", computed: true, typable: true, width: 120 },
    { key: "status", label: "Status / Decision", type: "text", width: 200 },
  ],
  // Thirteen rows are printed; a rating period adds a line per service.
  rowMode: { kind: "free", minRows: 1, typicalRows: 13 },
  specimenHeader: { ratingPeriod: "01.04.2026 to 31.03.2027" },
  specimenRows: SERVICE_PERFORMANCE_LINES.map((line) => ({ ...line, ...serviceRatingCells(line) })),
  specimenSource: SPECIMEN_NOTE("F-PUR-06_Service provider monitoring.pdf — F/PUR/06 (00/01.12.2021)"),
};

export const PURCHASE_LAYOUTS: Record<string, LogSheetLayout> = {
  "pur-supplier-registration": supplierRegistration,
  "pur-supplier-audit-report": supplierAuditReport,
  "pur-approved-suppliers": approvedSuppliers,
  "pur-supplier-performance": supplierPerformance,
  "pur-service-provider-performance": serviceProviderPerformance,
};
