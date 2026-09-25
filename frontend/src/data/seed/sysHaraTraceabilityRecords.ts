import type { LogSheetData, LogSheetRow, RecordInstance } from "../../types";
import {
  HARA_ANNUAL_2026_01_DESCRIBING,
  HARA_ANNUAL_2026_01_TEAM,
  HARA_ANNUAL_POINTS,
  HARA_MONTHLY_2024_04_TEAM,
  HARA_MONTHLY_ROWS,
  MOCK_RECALL_2025_02_TEAM,
  MOCK_RECALL_FUNCTIONS,
  SITE_SECURITY_POINTS,
  SYS_HARA_TRACEABILITY_LAYOUTS,
  haraTeamValues,
} from "./sysHaraTraceabilityLayouts";

// THE HARA, SITE SECURITY, MOCK WITHDRAWAL AND TRACEABILITY PAGES SUPPLIED
// FILLED IN (REQUIREMENTS §76), on file as LIVE records (isDemo: false) the way
// the Maintenance pages are (maintenanceRecords.ts), so each format opens with
// the plant's own entries. Read from the pages cell for cell — the layouts
// file says how each paper table became boxes or a grid — and nothing added:
//
//   seed-sys-hara-monthly-2024-04        F/SYS/12, 22 April 2024 — the 24 answers and the 7 team members
//   seed-sys-site-security-2026          F/SYS/17, filed 01.01.2026 (the date every point was checked) — 26 points
//   seed-sys-hara-annual-2026            F/SYS/20, filed under 01.01.2026, the yearly review's period; its
//                                        DATE OF REVIEW box holds the day it was held, 27th January 2026 — 12 points
//   seed-sys-mock-recall-label-2025-01   F/SYS/13, LABEL, 10.01.2025 — 4 lines of the recall team
//   seed-sys-mock-recall-pouch-2025-01   F/SYS/13, Pouch, 28.01.2025 — 4 lines
//   seed-sys-mock-recall-sleeve-2025-02  F/SYS/13, SHRINK SLEEVE, 05.02.2025 — 4 lines
//   seed-sys-backward-trace-2024-12      F/SYS/14, 12.12.2024 — all boxes, and one empty line (below)
//   seed-sys-forward-trace-2024-12       F/SYS/15, 18.12.2024 — one issue
//
// Kept exactly as the pages have them, and flagged rather than put right:
//   * F/SYS/13: "Was the Mock Recall efecctive?" is marked neither Yes nor No on
//     any of the three pages, so it is blank on all three records. The Pouch
//     page's Response speaks of "missing print on the EAN code" on "sleeves" —
//     the Sleeve page's wording — though its own scenario is "smudged printing
//     on the product name". The Signature column is empty on all three pages.
//   * F/SYS/14: "Printing production date" is 21.07.2027 on the page and is
//     stored as 2027-07-21; the Sales order is dated 12.07.2023, a year before
//     the customer order it answers. The arithmetic on the page is right.
//   * F/SYS/20: "Next scheduled review: 1st January 2027" is written inside the
//     Conclusion; it is the Next scheduled review box here, and the Conclusion
//     holds the two sentences before it.
//   * F/SYS/12 and F/SYS/20: the team's Sign column is empty on the page.
//
// F/SYS/14 IS A FORM OF BOXES ALONE, and its record holds ONE EMPTY LINE, not
// none: every box-only record the app makes has that one line
// (engine/recordDefaults.ts emptyLogRows), and Submit refuses a log sheet with
// no lines at all (engine/validation.ts). Seeded with none, this record could
// not be put right with Edit and handed in again.

const ON_FILE = "System / Management (sheet as supplied, 25-Sep-2026)";
const SEEDED_AT = "2026-09-25T00:00:00.000Z";

function seeded(id: string, documentId: string, dueDate: string, data: LogSheetData, formatRevision?: string): RecordInstance<LogSheetData> {
  return {
    id,
    documentId,
    periodKey: `${documentId}:${dueDate}`,
    dueDate,
    status: "Verified",
    isDemo: false,
    data,
    ...(formatRevision ? { formatRevision } : {}),
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    submittedBy: ON_FILE,
    submittedAt: SEEDED_AT,
    verifiedBy: ON_FILE,
    verifiedAt: SEEDED_AT,
  };
}

/** Every box of the format, blank where the page leaves it blank — as a record the app makes holds them all. */
function boxes(documentId: string, values: Record<string, string>): Record<string, string> {
  const layout = SYS_HARA_TRACEABILITY_LAYOUTS[documentId];
  const blank = Object.fromEntries([...layout.headerFields, ...(layout.footerFields ?? [])].map((f) => [f.key, ""]));
  return { ...blank, ...values };
}

/** One line of the grid with every column, blank where the page leaves it blank. */
function line(documentId: string, id: string, values: Record<string, string | number | null>): LogSheetRow {
  const layout = SYS_HARA_TRACEABILITY_LAYOUTS[documentId];
  const blank = Object.fromEntries(layout.columns.map((c) => [c.key, c.type === "number" ? null : ""]));
  return { ...blank, ...values, id };
}

// ---------------------------------------------------------------------------
// F/SYS/12 — the meeting of 22 April 2024

/** Status (Yes/No), Verification status (C / NC) and Review comments, attribute by attribute. */
const HARA_MONTHLY_2024_04_ANSWERS: [status: string, verification: string, comments: string][] = [
  ["No", "C", "No action required"],
  ["No", "C", "No action required"],
  ["No", "C", "No action required"],
  ["No", "C", "No action required"],
  ["No", "C", "No action required"],
  ["Yes", "C", "No action required"],
  ["No", "C", "No action required"],
  ["No", "C", "No action required"],
  ["No", "C", "No action required"],
  ["No", "C", "No action required"],
  ["No", "C", "No action required"],
  ["Yes", "C", "Induction training provided to all employees upon joining."],
  ["Yes", "C", "No action required"],
  ["No", "C", "No action required"],
  ["No", "C", "No action required"],
  ["No", "C", "Not actual recall or mock recall carried out"],
  ["No", "C", "No action required"],
  ["No", "C", "No action required"],
  ["Yes", "C", "1 complaint received in Sleeve segment in this month & has been actioned as per CAR form"],
  ["No", "C", "No action required"],
  ["No", "C", "No action required"],
  ["No", "C", "No action required"],
  ["No", "C", "No action required"],
  // Printed indented by one space on the page.
  ["No", "C", "No action required"],
];

export const SEED_SYS_HARA_MONTHLY_2024_04 = seeded("seed-sys-hara-monthly-2024-04", "sys-hara-monthly", "2024-04-22", {
  header: boxes("sys-hara-monthly", { meetingDate: "2024-04-22", ...haraTeamValues(HARA_MONTHLY_2024_04_TEAM) }),
  rows: HARA_MONTHLY_ROWS.map((printed, i) => {
    const [status, verification, comments] = HARA_MONTHLY_2024_04_ANSWERS[i];
    return line("sys-hara-monthly", `r${i + 1}`, { ...printed, status, verification, comments });
  }),
});

// ---------------------------------------------------------------------------
// F/SYS/17 — the 2026 assessment, every point checked 01.01.2026

const SITE_SECURITY_2026_OBSERVATIONS: string[] = [
  "Yes. Its in place",
  "Yes. Training being conducted",
  "Yes. In place",
  "Yes & complied",
  "Yes & complied",
  "Yes & complied",
  "Yes & complied",
  "Yes & complied",
  "Yes & complied",
  "Yes & complied",
  "Yes & complied",
  "Yes & complied",
  "Yes & complied. Pesticides not stored at site",
  "Yes & complied",
  "Yes & complied",
  "Yes & complied",
  "Yes & complied",
  "Yes & complied",
  "Yes & complied",
  "Yes & complied",
  "Yes & complied",
  "Yes & complied",
  "Yes & complied",
  "Yes. Water storage tanks are sealed",
  "Yes. All systems are password protected",
  "In Place",
];

export const SEED_SYS_SITE_SECURITY_2026 = seeded("seed-sys-site-security-2026", "sys-site-security", "2026-01-01", {
  header: boxes("sys-site-security", {}),
  rows: SITE_SECURITY_POINTS.map(({ discussionPoint, byWhom }, i) =>
    line("sys-site-security", `r${i + 1}`, { discussionPoint, observations: SITE_SECURITY_2026_OBSERVATIONS[i], byWhom, checkedDate: "2026-01-01" })
  ),
});

// ---------------------------------------------------------------------------
// F/SYS/20 — the review of 27th January 2026

/** OBSERVATION, point by point: a bullet is a "• " line, and lines the page writes separately stay separate. */
const HARA_ANNUAL_2026_01_OBSERVATIONS: string[] = [
  [
    "• This is 1st formal HARA Review as per requirements of BRCGS – Packaging, Issue 7 version, implemented from 01.04.2025",
    "• No new type of RM or consumable or packaging materials introduced in last 9 months from the current date of review",
    "• 17 new supplier has been approved",
    "• No changes in RM which requires review of hazard analysis.",
  ].join("\n"),
  "No changes in manufacturing process or processing sequence or technology introduced. No changes in process flow diagram",
  [
    "• No known hazards identified",
    "• No known product fraud types identified. VACCP review indicates controls effective as majority of the materials purchased directly from OEM and full truck load",
    "• No issues of site security or product defense noted. TACCP review as well as Product defense plan indicates controls effective",
  ].join("\n"),
  [
    "• No new machine installed related to manufacturing process",
    "• Existing machines maintained in adequate condition and all product contact surface noted to free from potential contamination",
  ].join("\n"),
  "No Changes in product formulation",
  "No new products has been introduced",
  [
    "HARA team members following changes.",
    "Ajay Vaghela – Representing Production process & appointed as deputy PSTL",
    "Vinay Bhojak – Team member representing HR process",
    "Chirag Parmar – Team member representing Purchase process",
    "Bharat Ahir – Team member representing Store process",
    "Vishnu Jadav – New Joinee appointed as Plant Head",
    "Ajaz - New Joinee appointed as Pouching In charge",
  ].join("\n"),
  "Daily Plant sanitation as well as Monthly GMP inspection record indicated no major issues impacting product safety, quality or legality",
  "Pest control measures found effective. Trend analysis indicates no major infestation of pests as well as stable or declining catch count for Flies, Lizards, Rodents etc.",
  "2 customer complaints for Laminates, 2 customer complaints for Labels & 1 customer complaints for Sleeve received in last 9 months from the current date of review. All Complaint has been closed effectively",
  "No incident of Product recall / withdrawal since implementation of BRCGS packaging system till date.",
  [
    "• COMMISSION REGULATION (EU) 2024/3190 of 19 December 2024 on the use of bisphenol A (BPA), effective from 31.12.2024 : Although not currently applicable to site as site is not exporting to EU countries but meeting the requirements based on declaration of compliance from PP, LDPE, LLDPE resins manufacturers. If export begin to EU countries, formal testing shall be carried out.",
    "• Commission Regulation (EU) 2025/351 of 21 February 2025 : Although not currently applicable to site as site is not exporting to EU countries but meeting the requirements based on declaration of compliance from PP, LDPE, LLDPE resins manufacturers. If export begin to EU countries, formal testing shall be carried out.",
    // The bracket opened after "2018" is never closed on the page.
    "• Food Safety and Standards (Packaging) Regulations, 2018 (permitting the use of recycled polyethylene terephthalate (PET) in food packaging, published on 02.04.2025: Not applicable to site as PET is not used as ingridents / RM",
  ].join("\n"),
];

export const SEED_SYS_HARA_ANNUAL_2026 = seeded("seed-sys-hara-annual-2026", "sys-hara-annual", "2026-01-01", {
  header: boxes("sys-hara-annual", {
    ...HARA_ANNUAL_2026_01_DESCRIBING,
    dateOfReview: "2026-01-27",
    deviation1: "No deviation recorded. No customer complaints received. This step is specifically designed for ensuring adequate printing / lamination surface",
    correctiveAction1: "Not required",
    effective1: "Yes",
    deviation2:
      "No deviation recorded. No customer complaints received. This step is specifically designed for ensuring no delamination issues of laminates due to improper mixing ratio",
    correctiveAction2: "Not required",
    effective2: "Yes",
    deviation3: "PRPs & SSOPs (SOPs) identified in hazard analysis found effective to reduce & control likelihood of hazards",
    correctiveAction3: "Not required",
    effective3: "Yes",
    // The page's square bullets, one per line. The first bullet's second line
    // is the writer's own break: "5" would have fitted after "March 2025.".
    validationSummary: [
      "▪ Internal audits: Last audit conducted as per BRCGS – Pkg (Issue 6) conducted in Feb 2025 & March 2025.",
      "5 non-conformities & all closed",
      "▪ Internal audit as per new version of BRCGS – Pkg (Issue 7) conducted in July, Oct & December 2025. Total 9 non-conformities & all closed",
      "▪ Microbiological testing: Results within acceptable limits. Last carried out in February 2025 as per yearly frequency",
      "▪ CCM monitoring records: Complete and compliant.",
      "▪ Staff training: All relevant personnel re-trained as per Training calender.",
      "▪ All validation procedures remain appropriate.",
    ].join("\n"),
    recommendations: "- No changes to critical limits or CCMs required at this time.\n- No other recommendations",
    // Written on as "Next scheduled review: 1st January 2027" in bold — the date is nextReview.
    conclusion:
      "The HARA system remains effective and appropriate for the current production environment. Action items noted are minor and already being addressed.",
    nextReview: "2027-01-01",
    ...haraTeamValues(HARA_ANNUAL_2026_01_TEAM),
  }),
  rows: HARA_ANNUAL_POINTS.map((point, i) => line("sys-hara-annual", `r${i + 1}`, { point, observation: HARA_ANNUAL_2026_01_OBSERVATIONS[i] })),
});

// ---------------------------------------------------------------------------
// F/SYS/13 — three withdrawals, one per product

/** All three pages end with the same comment, spelling and all. */
const MOCK_RECALL_COMMENTS = "Mock recall was found satisafactory & customer was able to approach & response immediately";

function mockRecall(id: string, dueDate: string, values: Record<string, string>, team: [name: string, designation: string][]): RecordInstance<LogSheetData> {
  return seeded(id, "sys-mock-recall", dueDate, {
    header: boxes("sys-mock-recall", { ...values, comments: MOCK_RECALL_COMMENTS }),
    rows: MOCK_RECALL_FUNCTIONS.map((processFunction, i) =>
      line("sys-mock-recall", `r${i + 1}`, { processFunction, name: team[i][0], designation: team[i][1], signature: "" })
    ),
  });
}

export const SEED_SYS_MOCK_RECALL_LABEL_2025_01 = mockRecall(
  "seed-sys-mock-recall-label-2025-01",
  "2025-01-10",
  {
    product: "LABEL",
    date: "2025-01-10",
    startTime: "14:09",
    endTime: "15:11",
    totalTime: "1.02 hours",
    customerName: "Yates Steels Pvt. Ltd.",
    customerLocation: "SK, Gujarat",
    contactName: "Ronak Patel",
    contactPosition: "Purchase Manager",
    // Written "FG Code: FGLA 13270" on this page.
    fgCode: "FGLA 13270",
    productionOrderNumber: "64547",
    salesOrderNumber: "25676",
    jobName: "Jerry Can Shop 20L Label",
    dispatchDate: "2025-01-07",
    invoiceNumber: "5111",
    dispatchedQuantity: "12000 Labels",
    scenario: "was misregistration on the product name.",
    telephonicConversation:
      "Ms. Kapila Barad (Manager - QA) had Telephonic conversation with Sales coordinator - Ms. Nikki, regarding the status of the products (Consumed & in Stocks )",
    responseFromCustomer:
      "Ms. Kapila Barad (Manager - QA) had Telephonic conversation with Sales coordinator - Ms. Nikki, regarding the status of the products (Consumed & in Stocks ) on 10.01.2025 at 2.09 PM to know the status of the stock availability. It was further communicated that, there might be an possibility of misregistration on the product name in some of the Labels at customer end. Sales coordinator - Mss. Nikki talked to customer & customer informed that,  there are no issues in the production run of the labels. Internal traceability was carried out, which was completed around 3.11 PM (1.02 hours). It was further informed to customer that there were actually no quality issues of misregistration on the product name & it was carried out as part of Mock recall exercise.",
    productTraced: "100",
  },
  [
    ["Kapila Barad", "Manager - QA"],
    ["Parth Chauhan", "Manager - Dispatch"],
    ["Ajay Vaghela", "Manager - Production"],
    ["Nikki", "Sales Executive"],
  ]
);

export const SEED_SYS_MOCK_RECALL_POUCH_2025_01 = mockRecall(
  "seed-sys-mock-recall-pouch-2025-01",
  "2025-01-28",
  {
    product: "Pouch",
    date: "2025-01-28",
    startTime: "17:26",
    endTime: "17:38",
    totalTime: "12Minutes",
    customerName: "V P Bedekar",
    customerLocation: "Mumbai",
    contactName: "Vishal Wagh",
    contactPosition: "Operational Offier",
    fgCode: "FGPO2582",
    productionOrderNumber: "64699",
    salesOrderNumber: "25721",
    jobName: "SATWIK UPVAS BHUJANI 200GMS- ROLL FORM - rev2",
    dispatchDate: "2025-01-21",
    invoiceNumber: "5252",
    dispatchedQuantity: "25948",
    scenario: "was related to  smudged printing on the product name",
    telephonicConversation:
      "Ms. Kapila Barad (Manager - QA) had Telephonic conversation with Sales coordinator - Ms. Vaishali , regarding the status of the products (Consumed & in Stocks )",
    // Speaks of the EAN code and of sleeves, though this exercise's scenario is
    // smudged printing on a pouch job — kept as the page has it.
    responseFromCustomer:
      "Ms. Kapila Barad (Manager - QA) had Telephonic conversation with Sales team member - Ms.Vaishali, regarding the status of the products (Consumed & in Stocks ) on 28.01.2025 at 5.26 PM to know the status of the stock availability. It was further communicated that, there might be an possibility of missing print on the EAN code  in some of the sleeves at customer end. Sales Sales team member - Ms.Vaishali talked to customer & customer informed that, they have consumed part quantity of  sleeves  & remaining sleeves were in their stock. Customer further informed that, they have not observed any issues with the packing materials. Internal traceability was carried out, which was completed around 5.38 PM (12 minutes). It was further informed to customer that there were actually no quality issues of missing print on the EAN code  & it was carried out as part of Mock recall exercise.",
    productTraced: "100",
  },
  [
    ["Kapila Barad", "Manager - QA"],
    ["Parth Chauhan", "Manager - Dispatch"],
    ["Akash Patel", "Manager - Production"],
    ["Vaishali", "Sales Executive"],
  ]
);

export const SEED_SYS_MOCK_RECALL_SLEEVE_2025_02 = mockRecall(
  "seed-sys-mock-recall-sleeve-2025-02",
  "2025-02-05",
  {
    product: "SHRINK SLEEVE",
    date: "2025-02-05",
    startTime: "14:21",
    endTime: "15:33",
    totalTime: "1 hour 12Minuts",
    customerName: "3 Sisters",
    customerLocation: "Mumbai",
    contactName: "Manish Kanunga",
    contactPosition: "Purchase Manager",
    fgCode: "FGSL2967",
    productionOrderNumber: "65127",
    salesOrderNumber: "25845",
    jobName: "ZINDA NATIVE NIMBU 250ML SLEEVES",
    dispatchDate: "2025-01-27",
    invoiceNumber: "5359",
    dispatchedQuantity: "10000 Sleeve",
    scenario: "was related to  missing print on the EAN code.",
    telephonicConversation:
      "Ms. Kapila Barad (Manager - QA) had Telephonic conversation with Sales coordinator - Ms. Vaishali , regarding the status of the products (Consumed & in Stocks )",
    responseFromCustomer:
      "Ms. Kapila Barad (Manager - QA) had Telephonic conversation with Sales team member - Ms.Vaishali, regarding the status of the products (Consumed & in Stocks ) on 05.02.2025 at 2.21 PM to know the status of the stock availability. It was further communicated that, there might be an possibility of missing print on the EAN code  in some of the sleeves at customer end. Sales Sales team member - Ms.Vaishali talked to customer & customer informed that, they have consumed part quantity of  sleeves  & remaining sleeves were in their stock. Customer further informed that, they have not observed any issues with the packing materials. Internal traceability was carried out, which was completed around 3.33 PM (1.12 hours). It was further informed to customer that there were actually no quality issues of missing print on the EAN code  & it was carried out as part of Mock recall exercise.",
    productTraced: "100",
  },
  MOCK_RECALL_2025_02_TEAM
);

// ---------------------------------------------------------------------------
// F/SYS/14 — the backward trace of 12.12.2024

export const SEED_SYS_BACKWARD_TRACE_2024_12 = seeded("seed-sys-backward-trace-2024-12", "sys-backward-trace", "2024-12-12", {
  header: boxes("sys-backward-trace", {
    traceabilityDate: "2024-12-12",
    customerName: "Aculife Healthcare Pvt. Ltd./ Nirma",
    locationOfDispatch: "Viramgam,Ahmedabad",
    productDescription: "NS BP 1L FFS PFC Philippines R1 Label",
    invoiceNo: "2140",
    dateOfDispatch: "2024-07-23",
    poNumber: "58610",
    quantity: "135000 Pieces",
    // No customer order number is written, only its date.
    customerOrderNumberDate: "- dated  11.07.2024",
    customerOrderQuantity: "135000 nos",
    fglaCode: "13928",
    // 2023 on the page — a year before the order it answers.
    salesOrderNumberDate: "23557 dated 12.07.2023",
    productionOrderNumberDate: "58610 dated 12.07.2024",
    keyRmInwardDate: "GRN no. 16741 dated 03.07.2024 & Internal Batch number – 16741/12760/1,3,6,7,8,10 - 20000meter",
    paperLabelSupplier: "Avery Dennison",
    issuedQuantity: "12000meter",
    // 21.07.2027 on the page, three years after the QC inspection that follows it.
    printingProductionDate: "2027-07-21",
    printQuantity: "11100 meter",
    balanceReturned: "12000 - 11100 = 900 meter",
    qcInspectionDated: "2024-07-21",
    qcInspectedOkMeter: "10330 meter",
    balanceScrapped: "11100-10330 = 770 meter",
    slittingPackingDate: "2024-07-22",
    slittingOkMeter: "10330 meter",
    // 11 boxes of 10500, one of 7000 + 3000, one of 6800 + 2700: 135000 in 13 boxes.
    packingQuantity: [
      "11 Boxes ↓",
      "3  x 3500 = 10500 nos .",
      "1 Box  ↓",
      "2 x 3500 = 7000 nos.",
      "1 x 3000 = 3000 nos.",
      "1 Box↓",
      "2 x 3400 = 6800 nos.",
      "1 x 2700 = 2700 nos.",
      "Total = 135000nos",
    ].join("\n"),
    boxNumber: "13",
    reelNumber: "-",
    verifiedBy: "Kapila Barad",
  }),
  rows: [{ id: "r1" }],
});

// ---------------------------------------------------------------------------
// F/SYS/15 — the forward trace of 18.12.2024

export const SEED_SYS_FORWARD_TRACE_2024_12 = seeded("seed-sys-forward-trace-2024-12", "sys-forward-trace", "2024-12-18", {
  header: boxes("sys-forward-trace", {
    dateOfForwardTraceability: "2024-12-18",
    supplierName: "Avery Dennison",
    materialDescription: "Avery PE Clear top coated VA4216NF",
    invoiceNo: "PD235323",
    internalBatchNumber: "17229/13128/1 & 2",
    dateOfReceiptAtStore: "2024-08-17",
    quantity: "3910 Mtr",
    verifiedBy: "Kapila Barad",
  }),
  // The "1st Issue": 1970 issued − 986 printed = 984 balance, as written.
  rows: [
    line("sys-forward-trace", "r1", {
      issueDated: "2024-12-14",
      issuedQty: "1970 Mtr",
      printQty: "986 Mtr",
      slittedRollBatchNumber: "17229/13128/2",
      customerName: "Nivea India Pvt Ltd",
      jobName: "Nivea Shower Gel Waterlily 125ml Front Label Rev-1",
      productionOrderNumber: "63723",
      dispatchedQty: "23500Nos.",
      dispatchDated: "2024-12-16",
      invoiceNumber: "4726",
      balanceQty: "984 Mtr",
    }),
  ],
});

export const SEED_SYS_HARA_TRACEABILITY_RECORDS: RecordInstance<LogSheetData>[] = [
  SEED_SYS_HARA_MONTHLY_2024_04,
  SEED_SYS_SITE_SECURITY_2026,
  SEED_SYS_HARA_ANNUAL_2026,
  SEED_SYS_MOCK_RECALL_LABEL_2025_01,
  SEED_SYS_MOCK_RECALL_POUCH_2025_01,
  SEED_SYS_MOCK_RECALL_SLEEVE_2025_02,
  SEED_SYS_BACKWARD_TRACE_2024_12,
  SEED_SYS_FORWARD_TRACE_2024_12,
];
