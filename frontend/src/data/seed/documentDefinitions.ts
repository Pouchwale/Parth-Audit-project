import type { DocumentDefinition } from "../../types";

// Document ids that once shipped in this seed and have since been withdrawn.
// documentRepository / masterRepository / bootstrap use this to clear the
// definition, its reminder-role entry and any records a browser still holds
// for it, so a retired document doesn't linger as an orphan.
//   service-report-lizard — the SOP describes a Lizard Control service, but
//   the uploaded files contain no service-report specimen for it (the April-
//   2026 workbook covers Rodent / General / Fly only); retired 08-Sep-2026
//   when the Pest Control module was reorganised around the three service
//   reports the department actually receives. The lizards trapped in the
//   Roda-boxes are reported on the company's own Lizard Catch Report and
//   Trend Analysis instead (REQUIREMENTS §41).
//   sop-reference — Gurudev Pest Control's Standard Operating Procedure.
//   Retired 13-Sep-2026 on the owner's instruction: it is the service
//   provider's own procedure, not one of the company's controlled formats
//   (it appears nowhere on the Master List of Formats & Records, and its
//   Format No. was never confirmed), so the plant does not hold it as a
//   record. The chemical chart stays — that one IS the company's.
export const RETIRED_DOCUMENT_IDS: string[] = ["service-report-lizard", "sop-reference"];

// THE HUMAN RESOURCES MODULE'S SUB-GROUPS, in display order — see
// DocumentDefinition.section. The module holds two things (REQUIREMENTS §46):
// HR's own sixteen F/HR formats, supplied on 14-Sep-2026, in five groups, and
// the pest control file — F/HR/17, F/HR/18 and what is filed with them, which
// the company's Master List of Formats also puts under HR — in the four groups
// the department reads that file in (its pages are organised by them).
export const HR_SECTIONS = ["Personnel & Competence", "Training", "Induction & Health", "Hygiene & GMP", "Product Safety Culture"] as const;
export const PEST_CONTROL_SECTIONS = ["Daily Report", "Service Reports", "Trend Analysis", "Training & Reference"] as const;
// QUALITY CONTROL'S SUB-GROUPS, in display order (REQUIREMENTS §57). The
// department's own paperwork falls into these seven: what is checked on the
// machine, what is checked on material as it arrives, the clearance before a
// job change, the instruments' calibration, the certificates issued with a
// delivery, the registers kept alongside, and the analyses and meetings.
export const QC_SECTIONS = [
  "In-Process & Inspection",
  "Incoming Material Inspection",
  "Line Clearance",
  "Calibration",
  "Certificates of Analysis",
  "Registers & Records",
  "Analysis & Meetings",
] as const;
// PURCHASE'S SUB-GROUPS, in display order (REQUIREMENTS §68). The department's
// paperwork falls into two: what has to be done before a supplier may be used
// at all — the registration form, the audit report, the list the approved ones
// go onto — and what is reviewed about one afterwards, the two performance
// monitoring registers.
export const PURCHASE_SECTIONS = ["Supplier Approval", "Supplier Monitoring"] as const;
// Dispatch (REQUIREMENTS §70): the agreement a transporter signs, and the check
// made on the container and the vehicle before a load leaves the plant.
export const DISPATCH_SECTIONS = ["Transporter Agreement", "Dispatch Inspection"] as const;
// Store (REQUIREMENTS §71): the check made on a vehicle and its load as the
// material comes IN, and the register of every sharp tool that goes out of the
// store and comes back. The company's Master List of Formats & Records
// (F/SYS/02) lists exactly these two under F/STR.
export const STORE_SECTIONS = ["Incoming Material", "Sharp Tool Control"] as const;
// Maintenance (REQUIREMENTS §74): the equipment itself and what is installed,
// the preventive maintenance planned and done, the machines' daily health and
// breakdowns, and the plant checks of glass and lighting that protect the
// product. The master list of formats (F/SYS/02) lists F/MNT after the
// production formats.
export const MAINTENANCE_SECTIONS = ["Equipment", "Preventive Maintenance", "Equipment Health & Breakdowns", "Glass & Lighting"] as const;
// System / Management (REQUIREMENTS §76): the PSTL's own F/SYS formats, in the
// groups the product safety system itself runs in — the documents and formats
// under control and how one is changed; the management review and the
// objectives it reviews; the internal audit from its schedule to its NC
// reports; the corrective action report used for any other non-conformance;
// the HARA verifications and the site security assessment; and the
// traceability tests and mock product withdrawals.
export const SYS_SECTIONS = [
  "Document Control",
  "Management Review",
  "Internal Audit",
  "Corrective Action",
  "HARA & Site Security",
  "Traceability & Recall",
] as const;
// Marketing (REQUIREMENTS §77): what the customer says of the plant's product —
// the feedback each customer gives and its yearly analysis per product, and
// the customer complaints, their trend over the years and the Pareto of their
// causes. The master list of formats (F/SYS/02) lists F/MKT right after F/SYS.
export const MKT_SECTIONS = ["Customer Feedback", "Customer Complaints"] as const;
export const MODULE_SECTIONS: readonly string[] = [
  ...SYS_SECTIONS,
  ...MKT_SECTIONS,
  ...HR_SECTIONS,
  ...PEST_CONTROL_SECTIONS,
  ...QC_SECTIONS,
  ...MAINTENANCE_SECTIONS,
  ...PURCHASE_SECTIONS,
  ...STORE_SECTIONS,
  ...DISPATCH_SECTIONS,
];

// Every controlled document / form actually identified in the uploaded
// source files. See REQUIREMENTS.md for full source-to-digital traceability.
export const SEED_DOCUMENTS: DocumentDefinition[] = [
  // ---------------------------------------------------------------------
  // Human Resources — the pest control file, organised the way the
  // department reads its paperwork:
  //   Daily Report → Service Reports (Rat / Mice, Ants & Cockroaches, Fly)
  //   → Trend Analysis (Rodent catch, Fly catcher infestation)
  //   → Training & Reference. See src/pages/PestControlPages.tsx.
  // The module's own sixteen F/HR formats follow, after the licence.
  // ---------------------------------------------------------------------
  {
    id: "daily-pest-monitoring",
    kind: "daily-pest-monitoring",
    name: "Daily Pest Control Monitoring Record",
    formatNo: "F/HR/17",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "Production / HR",
    module: "Human Resources",
    section: "Daily Report",
    frequency: "Daily",
    status: "Configured",
    description:
      "The Daily Report: 10 pest / rodent monitoring checkpoints every day (door proofing, gaps, fly catchers, rodent traps — with box, location and number of rodents whenever one is trapped), reported to the Production Supervisor / Pest Control Agency, in the company's F/HR/17 layout — a three-page monthly register: instructions and the ten checkpoints, then one row per date (checkpoints 1-10, time of checking, checker) and the Summary of Actions Taken if Pest Observed. Feeds the Rodent Catch trend.",
    sourceFile: "Daily pest control monitoring record .pdf (F/HR/17, the blank 3-page format) + Kapila mam department reports .pdf pages 2-4 (a filled month)",
    schedule: { type: "daily" },
  },
  {
    id: "service-report-rodent",
    kind: "service-report",
    name: "Pest Control Service Report — Rat / Mice (Rodent Control Service)",
    formatNo: "TO BE CONFIRMED",
    revisionNo: "TO BE CONFIRMED",
    revisionDate: null,
    department: "Pest Control Service Provider (Gurudev Pest Control)",
    module: "Human Resources",
    section: "Service Reports",
    frequency: "Fortnightly",
    status: "Configured",
    description:
      "Gurudev Pest Control's fortnightly Rodent Control Service report (Rat, Mice & Bandicoots): glue boards — bromadiolone cake at Offline punching & QC Inspection — across 16 fixed areas, quantity used, remarks, technician and customer signatures.",
    sourceFile: "Service Report-April 2026.xls (1st & 2nd Service sheets)",
    schedule: { type: "fortnightly", anchorDayOfMonth: 4 },
    variantKey: "Rodent Control Service",
  },
  {
    id: "service-report-general",
    kind: "service-report",
    name: "Pest Control Service Report — Ants & Cockroaches (General Pest Control Services)",
    formatNo: "TO BE CONFIRMED",
    revisionNo: "TO BE CONFIRMED",
    revisionDate: null,
    department: "Pest Control Service Provider (Gurudev Pest Control)",
    module: "Human Resources",
    section: "Service Reports",
    frequency: "Fortnightly",
    status: "Configured",
    description:
      "Gurudev Pest Control's fortnightly General Pest Control Services report (Red & Black Ants, Cockroaches): Deltamethrin 2.5% SC spraying across 9 fixed areas, quantity used, remarks, technician and customer signatures.",
    sourceFile: "Service Report-April 2026.xls (1st & 2nd Service sheets)",
    schedule: { type: "fortnightly", anchorDayOfMonth: 4 },
    variantKey: "General Pest Control Services",
  },
  {
    id: "service-report-fly",
    kind: "service-report",
    name: "Pest Control Service Report — Fly Control Services",
    formatNo: "TO BE CONFIRMED",
    revisionNo: "TO BE CONFIRMED",
    revisionDate: null,
    department: "Pest Control Service Provider (Gurudev Pest Control)",
    module: "Human Resources",
    section: "Service Reports",
    frequency: "Fortnightly",
    status: "Configured",
    description:
      "Gurudev Pest Control's fortnightly Fly Control Services report (House Fly): Beta-Cyfluthrin 2.45% SC spraying across 9 fixed areas, quantity used, remarks, technician and customer signatures.",
    sourceFile: "Service Report-April 2026.xls (1st & 2nd Service sheets)",
    schedule: { type: "fortnightly", anchorDayOfMonth: 4 },
    variantKey: "Fly Control Services",
  },
  {
    id: "fly-catcher",
    kind: "fly-catcher",
    name: "Fortnightly — Fly Catcher Inspection & Cleaning Record",
    formatNo: "F/HR/18",
    revisionNo: "02",
    revisionDate: "2024-12-15",
    department: "Housekeeping",
    module: "Human Resources",
    section: "Trend Analysis",
    frequency: "Fortnightly",
    status: "Configured",
    description:
      "Fortnightly inspection and cleaning of fly catcher units PC-01 through PC-13 — approximate flies caught per unit (the Fly Catcher Infestation trend adds these up per unit and per month), tube light install / due dates, cleaning done by and verified by.",
    sourceFile: "Kapila mam department reports .pdf (pages 5-6, photographed)",
    schedule: { type: "fortnightly", anchorDayOfMonth: 3 },
  },
  {
    id: "gap-inspection",
    kind: "gap-inspection",
    name: "CAPA — Internal: Pest Control Inspection Findings Report",
    formatNo: "TO BE CONFIRMED",
    revisionNo: "TO BE CONFIRMED",
    revisionDate: null,
    department: "Quality / Pest Control Service Provider",
    module: "CAPA (Corrective & Preventive Action)",
    frequency: "As Required",
    status: "Configured",
    description: "Internal side of the CAPA module: findings raised by our own / service-provider pest control inspections (e.g. the Dec-2023 GAP report), each with a corrective action tracked to closure.",
    sourceFile: "GAP Analysis Report Pest control Dec 2023.xlsx",
    schedule: { type: "as-required" },
  },
  {
    id: "capa-customer-complaint",
    kind: "complaint-checklist",
    name: "CAPA — External: Customer Complaint Handling Checklist",
    formatNo: "F/MKT/05",
    revisionNo: "00",
    revisionDate: "2026-07-21",
    department: "Marketing / Quality Assurance",
    module: "CAPA (Corrective & Preventive Action)",
    frequency: "As Required",
    status: "Configured",
    description:
      "External side of the CAPA module: one checklist per customer complaint — 31 activities (Sr. No. 1–32, the form skips 6) across five sections (A Receipt & Registration, B Investigation, C Corrective & Preventive Action, D Customer Communication, E Effectiveness & Closure), each dated and commented, then Prepared-by / Approved-by sign-off. The assistant walks you through A to E and then asks for approval.",
    sourceFile: "Updated Checklist.doc",
    schedule: { type: "as-required" },
  },
  {
    id: "capa-complaint-ack",
    kind: "complaint-ack",
    name: "CAPA — Internal: Complaint Acknowledgement Report",
    formatNo: "QA-CAF-00",
    revisionNo: "TO BE CONFIRMED",
    revisionDate: "2026-03-22",
    department: "Quality Assurance",
    module: "CAPA (Corrective & Preventive Action)",
    frequency: "As Required",
    status: "Configured",
    description:
      "Internal side of the CAPA module: a customer complaint explained to the employee(s) involved — the complaint as received (customer, FG code, date, job, type), the scenario with photographs, root cause, corrective and preventive action, and the employee's signed acknowledgement.",
    sourceFile: "Foram P. - FGSL3877.pdf (format reference — QA-CAF-00 (22.03.26))",
    schedule: { type: "as-required" },
  },
  {
    id: "pest-responsibilities",
    kind: "pest-responsibilities",
    name: "Responsibilities of Pest Control — Site & Service Provider",
    formatNo: "TO BE CONFIRMED",
    revisionNo: "TO BE CONFIRMED",
    revisionDate: "2025-01-01",
    department: "Quality / Purchase",
    module: "Human Resources",
    section: "Training & Reference",
    frequency: "As Required",
    status: "Configured",
    description:
      "What the site is responsible for (fourteen points) and what Gurudev Pest Control is responsible for — equipment and storage, emergency contacts, yearly awareness training, the environmental / health & safety clauses and the service clauses — signed by both parties on 01-Jan-2025.",
    sourceFile: "responsibilities of pest control report .pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "service-agreement",
    kind: "service-agreement",
    name: "Pest Control Service Agreement — Site & Service Provider",
    formatNo: "TO BE CONFIRMED",
    revisionNo: "TO BE CONFIRMED",
    revisionDate: "2026-09-12",
    department: "Quality / Purchase",
    module: "Human Resources",
    section: "Training & Reference",
    frequency: "As Required",
    status: "Configured",
    description:
      "The contract with Gurudev Pest Control, on the provider's own letterhead: the two-year term, the parties, the scope of services and their frequencies (from the SOP), the schedule and reporting, the obligations of both parties, the commercial terms and the two signatures. Renewed every two years — the Service Provider page asks sixty days before it runs out, and the signed copy can be uploaded instead of using this format.",
    sourceFile: "Letter head.pdf (the service provider's letterhead — the format)",
    schedule: { type: "as-required" },
  },
  {
    id: "training-record",
    kind: "training-record",
    name: "Pest Control Training Record",
    formatNo: "TO BE CONFIRMED",
    revisionNo: "TO BE CONFIRMED",
    revisionDate: null,
    department: "HR / Pest Control Service Provider",
    module: "Human Resources",
    section: "Training & Reference",
    frequency: "Yearly",
    status: "Configured",
    description:
      "Annual pest-control awareness training programme for plant staff (conducted by Gurudev Pest Control) plus technician certification records. Cadence: yearly, each December — the source file is titled \"Training - Yrl\" and the last programme was held 24-Dec-2025.",
    sourceFile: "Training - Yrl (1).doc; Tr. Certi.docx",
    schedule: { type: "yearly", month: 11, dayOfMonth: 24 },
  },
  {
    id: "chemical-master",
    kind: "chemical-master",
    name: "Pesticide Application Chart (Chemical Master)",
    formatNo: "TO BE CONFIRMED",
    revisionNo: "TO BE CONFIRMED",
    revisionDate: null,
    department: "Pest Control Service Provider",
    module: "Human Resources",
    section: "Training & Reference",
    frequency: "As Required",
    status: "Configured",
    description: "Reference chart: Service Type -> Pest Covered -> Chemicals -> Dilution Ratio.",
    sourceFile: "Chemical Cahrt new.docx",
    schedule: { type: "as-required" },
    isReferenceOnly: true,
  },
  {
    id: "gurudev-insecticide-licence",
    kind: "licence",
    name: "Insecticide Licence — Gurudev Pesticides (Form III, Govt. of Gujarat)",
    formatNo: "FORM III — MEH/FP1230000675/2023-2024",
    revisionNo: "TO BE CONFIRMED",
    revisionDate: "2023-04-12",
    department: "Pest Control Service Provider (Gurudev Pest Control / Gurudev Pesticides)",
    module: "Human Resources",
    section: "Training & Reference",
    frequency: "As Required",
    status: "Configured",
    description:
      "Government of Gujarat licence (Form III under the Insecticides Act, 1968 / Rules, 1971) to sell, stock or exhibit for sale or distribute insecticides, granted to Gurudev Pesticides — the pest control service provider — under the supervision of Patel Kaushal Jayantibhai (Technical Person, BSc in Chemistry). Registration No FP1230000675, issued 12-Apr-2023, valid as per prevailing norms. Kept exactly as supplied: the scanned pages plus a verbatim transcription.",
    sourceFile: "Service licence GP3 kapila mam.pdf (2 pages, scanned)",
    schedule: { type: "as-required" },
    isReferenceOnly: true,
  },

  // ---------------------------------------------------------------------
  // Human Resources — the department's own formats, sixteen F/HR/… PDFs
  // supplied on 14-Sep-2026 (REQUIREMENTS §46). All are grids rendered
  // through the generic "log-sheet" kind; their layouts are in
  // src/data/seed/hrLayouts.ts and the filled registers among them are
  // seeded as LIVE records in src/data/seed/hrRecords.ts.
  // ---------------------------------------------------------------------
  {
    id: "hr-competence",
    kind: "log-sheet",
    name: "Personal Competence Records (Staff Members Only)",
    formatNo: "F/HR/01",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "HR & Admin",
    module: "Human Resources",
    section: "Personnel & Competence",
    frequency: "Yearly",
    status: "Configured",
    description:
      "One line per staff member: department, designation, the education and experience the position requires against what the person holds, the justification for any gap, and the dates of joining and leaving — reviewed as on a date written at the top. The current review (80 staff, reviewed as on 01.10.2026) is on file.",
    sourceFile: "F-HR-01_Personal Competence record (R-2023).pdf",
    schedule: { type: "yearly", month: 9, dayOfMonth: 1 },
  },
  {
    id: "hr-skill-matrix",
    kind: "log-sheet",
    name: "Skill Matrix - Operator",
    formatNo: "F/HR/03",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "HR & Admin",
    module: "Human Resources",
    section: "Personnel & Competence",
    frequency: "Yearly",
    status: "Configured",
    description:
      "One line per operator, with points under each of fourteen operations — 5 (S) can operate individually, 3 (SS) under supervision, 1 (US) cannot — and the status of skill up-gradation, as on a date. The current matrix (58 operators, status as on 01.09.2026) is on file.",
    sourceFile: "F-HR-03_Operator skill matr3ix-2023.pdf",
    schedule: { type: "yearly", month: 8, dayOfMonth: 1 },
  },
  {
    id: "hr-job-responsibility",
    kind: "log-sheet",
    name: "Job Responsibility & Authority",
    formatNo: "F/HR/07",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "HR & Admin",
    module: "Human Resources",
    section: "Personnel & Competence",
    frequency: "As Required",
    status: "Configured",
    description:
      "One sheet per position: who it reports to, its responsibilities and authorities line by line, the delegation of duties during absence, the minimum qualification (as per the Employees Competence Chart) and the employee's signed acknowledgement. Eight positions are on file, from Executive-Lab to Quality Executive.",
    sourceFile: "F-HR-07_Job responsibility & authorities (two PDFs, nine position sheets)",
    schedule: { type: "as-required" },
  },
  {
    id: "hr-mobile-authorization",
    kind: "log-sheet",
    name: "Authorization for Mobile Usage in Plant Area",
    formatNo: "F/HR/13",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "HR & Admin",
    module: "Human Resources",
    section: "Personnel & Competence",
    frequency: "As Required",
    status: "Configured",
    description:
      "The personnel authorised to carry and use a mobile handset inside the plant — each with department & designation, signature, date of allowance and the PSTL's authorisation — under the printed rule about breakage and the glass policy, with the department-wise / designation-wise table of who may be allowed. The current list (37 people) is on file.",
    sourceFile: "F-HR-13_Authorization for Mobile inside Plant.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "hr-training-needs",
    kind: "log-sheet",
    name: "Employee Wise Training Need Identification Record",
    formatNo: "F/HR/08",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "HR & Admin",
    module: "Human Resources",
    section: "Training",
    frequency: "Yearly",
    status: "Configured",
    description:
      "One line per employee, a tick under each of the seventeen training topics the person needs in the year (BRCGS awareness to testing method & calibration). The 01.04.2026 ~ 31.03.2027 record (154 employees) is on file with its names and designations; the topic ticks are TO BE CONFIRMED from the paper copy.",
    sourceFile: "F-HR-08_Employee wise Training need identification Record(2024-25).pdf",
    schedule: { type: "yearly", month: 3, dayOfMonth: 1 },
  },
  {
    id: "hr-training-calendar",
    kind: "log-sheet",
    name: "Training Plan Calender",
    formatNo: "F/HR/09",
    revisionNo: "00",
    revisionDate: "2022-03-07",
    department: "HR & Admin",
    module: "Human Resources",
    section: "Training",
    frequency: "Yearly",
    status: "Configured",
    description:
      "Nineteen topics, each with its source, method, duration and method of evaluation, planned month by month from April to March with the actual date each training was held. The 01.04.2026 ~ 31.03.2027 calendar is on file, both pages.",
    sourceFile: "F-HR-09_Training Calender(2026-27).pdf",
    schedule: { type: "yearly", month: 3, dayOfMonth: 1 },
  },
  {
    id: "hr-training-effectiveness",
    kind: "log-sheet",
    name: "Training Effectiveness Evaluation Record",
    formatNo: "F/HR/11",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "HR & Admin",
    module: "Human Resources",
    section: "Training",
    frequency: "As Required",
    status: "Configured",
    description:
      "Two pages per trainee: the trainer's evaluation by the trainee — structure, methodology, content, delivery and interaction rated 1 to 10, then the trainer's knowledge, interest and encouragement graded — and, after a period, the trainee's evaluation by the trainer or reporting officer: method of evaluation, whether the trainee benefited and applies it, further training needed, HOD's comments.",
    sourceFile: "F-HR-11_Trainging Evaluation sheet.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "hr-training-feedback",
    kind: "log-sheet",
    name: "Training Feedback & Evaluation Record",
    formatNo: "F/HR/12",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "HR & Admin",
    module: "Human Resources",
    section: "Training",
    frequency: "As Required",
    status: "Configured",
    description:
      "One sheet per training session — date, topic, who imparted it and its duration — then one line per employee: whether the employee grasped and adopted the knowledge or skill (rated 0 to 3 against the printed criteria), whether additional training is needed, and remarks; evaluated and signed.",
    sourceFile: "F-HR-12_Training Feedback & Evaluation Record (1).pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "hr-pre-employment-health",
    kind: "log-sheet",
    name: "Pre-Employment Medical Health Declaration",
    formatNo: "F/HR/04",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "HR & Admin",
    module: "Human Resources",
    section: "Induction & Health",
    frequency: "As Required",
    status: "Configured",
    description:
      "Completed by an applicant before employment: ten questions on infections, food poisoning, skin complaints, chest and other conditions (question 06's twelve tick boxes are one line each), footwear, physical work, specialist referrals and family history — each answered Yes / No with details — signed and dated. Treated as private and confidential.",
    sourceFile: "F-HR-04_Pre Employment Health declaration.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "hr-induction-staff",
    kind: "log-sheet",
    name: "Induction Training Record — New Employee (Staff: Supervisor & Above)",
    formatNo: "F/HR/05",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "HR & Admin",
    module: "Human Resources",
    section: "Induction & Health",
    frequency: "As Required",
    status: "Configured",
    description:
      "One record per new staff member: five induction topics — company profile; GMP, pest control, waste management and personal hygiene; quality and product safety policies; HARA / CCP awareness; fire safety — each with its responsibility, planned date and actual date with initial, signed off by the Manager – HR & Admin and the employee.",
    sourceFile: "F-HR-05_Induction Training  programme-Staff.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "hr-induction-operators",
    kind: "log-sheet",
    name: "Induction Training Record — Operators / Workers",
    formatNo: "F/HR/06",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "HR & Admin",
    module: "Human Resources",
    section: "Induction & Health",
    frequency: "As Required",
    status: "Configured",
    description:
      "The register of operators and workers inducted: one line per person with the joining department & designation, the date of joining and induction, and the signatures of the department HOD, Head HR & Admin and the operator, against the six printed induction topics. The 28 inductions of Jun-2025 to Jan-2026 are on file.",
    sourceFile: "F-HR-06_Induction Training  programme -Operators.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "hr-visitor-health",
    kind: "log-sheet",
    name: "Visitor Health Status Declaration Record",
    formatNo: "F/HR/14",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "HR & Admin",
    module: "Human Resources",
    section: "Induction & Health",
    frequency: "As Required",
    status: "Configured",
    description:
      "Completed by every visitor entering the factory: name, designation, company and purpose; nine health questions — sickness, wounds, fever, breathing, recent travel and COVID-19 contact, and the body temperature as taken by the security guard — answered Yes / No; the hygiene rules for entry to the processing area; and the visitor's and the company representative's signatures.",
    sourceFile: "F-HR-14_Visitor health declaration record.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "hr-gmp-checklist",
    kind: "log-sheet",
    name: "Monthly PRP Check List (GMP Inspection Record)",
    formatNo: "F/HR/19",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "HR & Admin",
    module: "Human Resources",
    section: "Hygiene & GMP",
    frequency: "Monthly",
    status: "Configured",
    description:
      "Fifty-five GMP points walked once a month by the HARA team across twelve locations, outside premises to lunch rooms — each answered Yes / No with the action taken if NC — and the inspection team's names, departments, processes, designations and signatures on the last page.",
    sourceFile: "F-HR-19_Monthly GMP Inspection record.pdf",
    schedule: { type: "monthly", dayOfMonth: 1 },
  },
  {
    id: "hr-hygiene-report",
    kind: "log-sheet",
    name: "Daily Personal Sanitation & Hygiene Inspection Report",
    formatNo: "F/HR/22",
    revisionNo: "00",
    revisionDate: null,
    department: "HR & Admin",
    module: "Human Resources",
    section: "Hygiene & GMP",
    frequency: "Monthly",
    status: "Configured",
    description:
      "One sheet per month, one line per day: the nine personal hygiene checks made at frisking — finger-nails, jewellery, protective clothing and PPE, sickness or wounds, hair and beard, footwear, food and tobacco, nail polish and bindi, strong scent — each Yes / No, with the observation, the corrective action and who checked. Due at the month's end; a day's line is filled on the day.",
    sourceFile: "F-HR-22_Daily Employee Sanitation & Hygiene record.pdf",
    schedule: { type: "monthly", dayOfMonth: 31 },
  },
  {
    id: "hr-psc-survey",
    kind: "log-sheet",
    name: "Product Safety Culture Survey",
    formatNo: "F/HR/20",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "HR & Admin",
    module: "Human Resources",
    section: "Product Safety Culture",
    frequency: "As Required",
    status: "Configured",
    description:
      "One form per employee, issued in English and Gujarati: fifteen statements about product safety and quality culture — speaking up, management commitment, procedures, time pressure, root causes, training, equipment — each answered on the printed seven-point scale from Strongly Agree (7) to Strongly Disagree (1).",
    sourceFile: "F-HR-20_Product safety culture survey (1).pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "hr-psc-survey-analysis",
    kind: "log-sheet",
    name: "Product Safety Culture Survey — Analysis",
    formatNo: "F/HR/21",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "HR & Admin",
    module: "Human Resources",
    section: "Product Safety Culture",
    frequency: "Yearly",
    status: "Configured",
    description:
      "The analysis of one survey round: for each of the fifteen attributes, how many responses fell at each point of the scale, the actual and ideal weighted responses and the percentage achieved, with the overall figure. The January-2026 analysis (63 respondents, 93.99% overall) is on file exactly as printed — nothing recomputed.",
    sourceFile: "F-HR-21_Product Safety Culture Survey analysis record.pdf",
    schedule: { type: "yearly", month: 0, dayOfMonth: 31 },
  },

  // ---------------------------------------------------------------------
  // Lamination — Quality Control (from the photographed specimens in
  // "Audit documents.zip"). All are grid log sheets rendered through the
  // generic "log-sheet" kind + src/data/seed/logSheetLayouts.ts.
  // ---------------------------------------------------------------------
  {
    id: "qc-viscosity",
    kind: "log-sheet",
    name: "Lamination Adhesive Viscosity Record",
    formatNo: "F-QC-30",
    revisionNo: "00",
    revisionDate: "2024-12-15",
    department: "Quality Control",
    module: "Lamination — Quality Control",
    frequency: "Daily",
    status: "Configured",
    description: "Hourly viscosity check of the lamination adhesive mix (specification 20.0 ± 1.0 Sec.), round the clock — 24 readings per day, each signed by the tester.",
    sourceFile: "WhatsApp Image 2026-09-07 at 2.15.18 PM.jpeg (photographed F-QC-30 register)",
    schedule: { type: "daily" },
  },
  {
    id: "qc-adhesive-mixing",
    kind: "log-sheet",
    name: "Adhesive Mixing Ratio Record",
    formatNo: "F-QC-32",
    revisionNo: "00",
    revisionDate: "2024-12-15",
    department: "Quality Control",
    module: "Lamination — Quality Control",
    frequency: "Daily",
    status: "Configured",
    description: "One line per adhesive batch mixed for lamination: time, adhesive / hardener / ethyl acetate quantities (kg), resulting viscosity, remark, checked-by and verified-by.",
    sourceFile: "WhatsApp Image 2026-09-07 at 2.15.17 PM.jpeg (photographed F-QC-32 register)",
    schedule: { type: "daily" },
  },
  {
    id: "qc-temperature",
    kind: "log-sheet",
    name: "Temperature Monitoring Record — Hot Room",
    formatNo: "F-QC-40.C",
    revisionNo: "00",
    revisionDate: "2025-02-28",
    department: "Quality Control",
    module: "Lamination — Quality Control",
    frequency: "Daily",
    status: "Configured",
    description: "Hot room (curing) temperature logged six times a day — 08:30, 12:30, 16:30, 20:30, 00:30 and 04:30 — against the recommended 45 °C ± 2 °C, with sign.",
    sourceFile: "WhatsApp Image 2026-09-07 at 2.15.19 PM (1).jpeg (photographed F-QC-40.C register)",
    schedule: { type: "daily" },
  },

  // ---------------------------------------------------------------------
  // Lamination — Production
  // ---------------------------------------------------------------------
  {
    id: "prd-process-parameter",
    kind: "log-sheet",
    name: "Solvent Base Lamination — Process Parameter Record",
    formatNo: "TO BE CONFIRMED",
    revisionNo: "00",
    revisionDate: "2024-12-15",
    department: "Production",
    module: "Lamination — Production",
    frequency: "Daily",
    status: "Configured",
    description:
      "Per-shift machine settings for each lamination job: nip pressures, unwind / rewind tensions, hood temperatures, line speed, plus adhesive & hardener make / code / batch and the mixing ratio. The Format No. is hidden under the clip in the photograph (revision block reads 00/15.12.2024) — TO BE CONFIRMED.",
    sourceFile: "WhatsApp Image 2026-09-07 at 2.15.19 PM.jpeg (photographed Process Parameter Record)",
    schedule: { type: "daily" },
  },
  {
    id: "prd-alc-production",
    kind: "log-sheet",
    name: "Solvent Base Lamination — ALC & Production Report",
    formatNo: "F-PRD-18",
    revisionNo: "01",
    revisionDate: "2025-06-25",
    department: "Production",
    module: "Lamination — Production",
    frequency: "Daily",
    status: "Configured",
    description:
      "Per-shift line-clearance (ALC) confirmation and production log for the lamination machine: job, both film layers with weights, ALC done Yes/No, operator sign, start/end time, laminated roll weight, OK meters and hot-room in-time.",
    sourceFile: "WhatsApp Image 2026-09-07 at 2.15.20 PM.jpeg (photographed F-PRD-18 register)",
    schedule: { type: "daily" },
  },

  // ---------------------------------------------------------------------
  // Quality Control — Inspection Records (photographed registers, second
  // batch). One inspection per production day per process; the paper
  // "Approved by / QA Manager" box is the app's Verify step.
  // ---------------------------------------------------------------------
  {
    id: "qc-inspection-pouching",
    kind: "log-sheet",
    section: "In-Process & Inspection",
    name: "Inspection Record — Pouching Process",
    formatNo: "F/QC/37",
    revisionNo: "00",
    revisionDate: "2024-12-15",
    department: "Quality Assurance",
    module: "Quality Control — Inspection Records",
    frequency: "Daily",
    status: "Configured",
    description: "Per-job pouch inspection: 11 test parameters (height, width, seal widths, gusset, thickness, zipper position, GSM, pouch weight, pouch type, leak test) against the FG product specification, lot status and QA inspector sign.",
    sourceFile: "Photographed F/QC/37 register (WhatsApp, 07-Sep-2026)",
    schedule: { type: "daily" },
  },
  {
    id: "qc-inspection-slitting",
    kind: "log-sheet",
    section: "In-Process & Inspection",
    name: "Inspection Record — Slitting - Lamination Grade Film",
    formatNo: "F/QC/35",
    revisionNo: "00",
    revisionDate: "2024-12-15",
    department: "Quality Assurance",
    module: "Quality Control — Inspection Records",
    frequency: "Daily",
    status: "Configured",
    description: "Slitting inspection of laminated mother rolls: bond strength, odour test and slitted roll width against the job card, lot status and QA inspector sign.",
    sourceFile: "Photographed F/QC/35 register (WhatsApp, 07-Sep-2026)",
    schedule: { type: "daily" },
  },
  {
    id: "qc-inspection-printed-film",
    kind: "log-sheet",
    section: "In-Process & Inspection",
    name: "Inspection Record — Lamination Grade Printed Film",
    formatNo: "F/QC/34",
    revisionNo: "00",
    revisionDate: "2024-12-15",
    department: "Quality Assurance",
    module: "Quality Control — Inspection Records",
    frequency: "Daily",
    status: "Configured",
    description: "Printed-film inspection off the printing machine: size, film thickness, repeat length, shade, text matter, unwinding direction, tape test and odour test against job card / shade card / artwork, lot status and QA inspector sign.",
    sourceFile: "Photographed F/QC/34 register (WhatsApp, 07-Sep-2026)",
    schedule: { type: "daily" },
  },
  {
    id: "qc-inprocess-printing",
    kind: "log-sheet",
    section: "In-Process & Inspection",
    name: "In Process Quality Control (Printing) — ઇન પ્રોસેસ ક્વોલિટી કંટ્રોલ",
    formatNo: "F/QC/13",
    revisionNo: "TO BE CONFIRMED",
    revisionDate: null,
    department: "Quality Assurance",
    module: "Quality Control — Inspection Records",
    frequency: "Daily",
    status: "Configured",
    description: "Gujarati in-process QC sheet for the printing machine: samples every 6000 m graded A/B/C/F on registration, shade, coating, punching, print pressure and print deformities, with defect counts, remarks and QA sign. Grade chart kept on the form as reference.",
    sourceFile: "Photographed F/QC/13 register, 2 pages (WhatsApp, 07-Sep-2026)",
    schedule: { type: "daily" },
  },

  // ---------------------------------------------------------------------
  // Quality Control — the two internal calibration records supplied on
  // 16-Sep-2026 (REQUIREMENTS §51). Layouts: src/data/seed/qcCalibrationLayouts.ts;
  // the supplied pages are seeded in src/data/seed/qcCalibrationRecords.ts.
  // ---------------------------------------------------------------------
  {
    id: "qc-weight-scale-calibration",
    kind: "log-sheet",
    section: "Calibration",
    name: "Weekly Internal Calibration Records - Weight Scale",
    formatNo: "F/QC/12",
    revisionNo: "01",
    revisionDate: "2022-01-01",
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "Weekly",
    status: "Configured",
    description:
      "Internal calibration of the laboratory weight scale (QC-76, 0.1 gm to 600 gm, acceptable tolerance 0.05%): each week the five test weights are placed and the value the scale shows is written beside each, with the deviation, Pass / Fail, the tester's sign and the next due date. One sheet carries several weeks; the four calibrations of Feb–Mar 2024 are on file as supplied. The deviation is entered as found — it is not calculated yet.",
    sourceFile: "weekly and monthly internal calibration records.pdf (page 1, scanned)",
    schedule: { type: "weekly", weekday: 3 },
  },
  {
    id: "qc-gsm-plate-calibration",
    kind: "log-sheet",
    section: "Calibration",
    name: "Monthly Internal Calibration Records – GSM Cutting Plate",
    formatNo: "F/QC/11",
    revisionNo: "01",
    revisionDate: "2022-01-01",
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "Monthly",
    status: "Configured",
    description:
      "Internal calibration of the four GSM cutting plates (No. 54 20 x 20cm, No. 55 10 x 10cm, No. 56 5 x 5cm, No. 57 2.5 x 2.5cm, Global Eng. Co.): each plate measured four times with the deviation beside every measurement, then Pass / Fail and the tester's sign per plate, against the calibration date and the next due date. The 31.12.2024 calibration is on file as supplied. The deviation is entered as found — it is not calculated yet.",
    sourceFile: "weekly and monthly internal calibration records.pdf (page 2, scanned)",
    schedule: { type: "monthly", dayOfMonth: 1 },
  },

  // ---------------------------------------------------------------------
  // QUALITY CONTROL — the formats supplied on 18-Sep-2026 (REQUIREMENTS §57).
  // Layouts: src/data/seed/qcIncomingLayouts.ts (the thirteen incoming
  // material inspection records), qcLineClearanceLayouts.ts (F/QC/15-A to
  // F/QC/15-G), qcGujaratiLineClearanceLayouts.ts (the two Gujarati clearance
  // checklists), qcRegisterLayouts.ts, qcCoaLayouts.ts and qcReportLayouts.ts.
  // The pages that were supplied filled in are on file as records
  // (qcRegisterRecords.ts, qcCoaRecords.ts, qcReportRecords.ts).
  //
  // Four numbers arrive carried by two formats each — F/QC/19, F/QC/20,
  // F/QC/21 and F/QC/29 — and F/QC/30 is carried by the Minutes of Meetings as
  // well as by the Lamination Adhesive Viscosity Record already on file. Both
  // of each pair are held as supplied, and the clash is on §57's TO BE
  // CONFIRMED list for the MR.
  // ---------------------------------------------------------------------
  {
    id: "qc-bopp-film",
    kind: "log-sheet",
    section: "Incoming Material Inspection",
    name: "Inspection Record - BOPP Film",
    formatNo: "F/QC/01",
    revisionNo: "01",
    revisionDate: "2022-02-16",
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "Incoming BOPP film against the purchase order: size, colour, thickness of film and the corona treatment on both sides, with the lot accepted, rejected, segregated or accepted on deviation and the reason written beside it.",
    sourceFile: "F-QC-01_Inspection record for BOPP Film (2).pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-corrugated-box",
    kind: "log-sheet",
    section: "Incoming Material Inspection",
    name: "Inspection Record - Corrugated Box",
    formatNo: "F/QC/02",
    revisionNo: "01",
    revisionDate: "2022-02-16",
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "Incoming corrugated boxes, three samples per lot: size, number of ply, bursting strength and compression strength against the specification for 3, 5 and 7 ply, with the lot status and the reason for any deviation.",
    sourceFile: "F-QC-02_Inspection record for CORRUGATED BOX (2).pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-label-stock",
    kind: "log-sheet",
    section: "Incoming Material Inspection",
    name: "Inspection Record - Label Stock",
    formatNo: "F/QC/03",
    revisionNo: "01",
    revisionDate: "2022-02-16",
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "Incoming self-adhesive label stock: size, total GSM, face paper, adhesive coating and release liner with their tolerances, the type of adhesive, both thicknesses, the length per reel and the peel adhesion at 180 degrees.",
    sourceFile: "F-QC-03_Inspection record for Label stock (2).pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-paper-core",
    kind: "log-sheet",
    section: "Incoming Material Inspection",
    name: "Inspection Record: Paper Core",
    formatNo: "F/QC/04",
    revisionNo: "01",
    revisionDate: "2022-02-16",
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "Incoming paper cores, three samples per lot: outer and inner diameter, thickness, length, moisture content and the bursting strength against the supplier's COA.",
    sourceFile: "F-QC-04_Inspection record for Paper core (2).pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-pvc-pet-film",
    kind: "log-sheet",
    section: "Incoming Material Inspection",
    name: "Inspection Record - PVC / PET Film",
    formatNo: "F/QC/05",
    revisionNo: "01",
    revisionDate: "2022-02-16",
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "Incoming shrink sleeve film: size, the shrinkage ratio against the specification for PVC blown, PVC cast and PET, thickness and the corona treatment on both sides.",
    sourceFile: "F-QC-05_Inspection record for PVC+PET Film (2).pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-offset-ink",
    kind: "log-sheet",
    section: "Incoming Material Inspection",
    name: "Inspection Record – Offset Ink",
    formatNo: "F/QC/18",
    revisionNo: "01",
    revisionDate: "2022-02-16",
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "Incoming offset ink: code, shade against the master or the Pantone code, the spectrometer shade range, skinning, flow rate, the drying test by thumb impression and on glass, and — where the order asks for them — alkali resistance, soap resistance and light fastness.",
    sourceFile: "F-QC-18_Inspection record for Offset Ink.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-duplex-board",
    kind: "log-sheet",
    section: "Incoming Material Inspection",
    name: "Inspection Record – Duplex Board",
    formatNo: "F/QC/19",
    revisionNo: "01",
    revisionDate: "2022-02-16",
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "Incoming duplex board: size, total GSM and BF as per the order, moisture, the Cobb value on the wire and felt sides, caliper and bulk density.",
    sourceFile: "F-QC-19_Inspection record for Duplex board.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-kraft-paper",
    kind: "log-sheet",
    section: "Incoming Material Inspection",
    name: "Inspection Record – Kraft Paper & White Top Liner",
    formatNo: "F/QC/20",
    revisionNo: "01",
    revisionDate: "2022-02-16",
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "Incoming kraft paper and white top liner: size, total GSM and BF as per the order, moisture, the Cobb value and the bulk density, each with its own band for kraft and for white top liner.",
    sourceFile: "F-QC-20_Inspection record for Kraft Paper.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-flexo-ink",
    kind: "log-sheet",
    section: "Incoming Material Inspection",
    name: "Inspection Record – Flexo Ink",
    formatNo: "F/QC/21",
    revisionNo: "00",
    revisionDate: "2023-04-01",
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "Incoming flexo ink: code, shade against the master or the Pantone code, the L, A and B values and the spectrometer shade range, which must be below 2.0. The form is system generated and carries no signature.",
    sourceFile: "F-QC-21- Flexo INk.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-lamination-adhesive-inspection",
    kind: "log-sheet",
    section: "Incoming Material Inspection",
    name: "Inspection Record – Lamination Film Adhesive",
    formatNo: "F/QC/21",
    revisionNo: "01",
    revisionDate: "2022-02-16",
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "Incoming lamination film adhesive: skinning and foreign particles, viscosity on the B4 Ford cup, solid content, gloss at 60 degrees and the clarity of the film after lamination.",
    sourceFile: "F-QC-21_Inspection record for Lamination film adhesive.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-side-pasting-adhesive",
    kind: "log-sheet",
    section: "Incoming Material Inspection",
    name: "Inspection Record – Side Pasting Adhesive",
    formatNo: "F/QC/22",
    revisionNo: "01",
    revisionDate: "2022-02-16",
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "Incoming side pasting adhesive: skinning and foreign particles, the viscosity of the adhesive mixed with 20% water on the B4 Ford cup, and solid content.",
    sourceFile: "F-QC-22_Inspection record for Side pasting adhesive.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-starch-powder",
    kind: "log-sheet",
    section: "Incoming Material Inspection",
    name: "Inspection Record – Corrugation Starch Powder",
    formatNo: "F/QC/23",
    revisionNo: "01",
    revisionDate: "2022-02-16",
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "Incoming corrugation starch powder: appearance, moisture content, the mixing ratio, viscosity and solid content.",
    sourceFile: "F-QC-23_Inspection record for Corru. starch powder.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-sheet-pasting-powder",
    kind: "log-sheet",
    section: "Incoming Material Inspection",
    name: "Inspection Record – Sheet Pasting Powder",
    formatNo: "F/QC/24",
    revisionNo: "01",
    revisionDate: "2022-02-16",
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "Incoming sheet pasting powder: appearance, moisture content, the mixing ratio, viscosity and solid content.",
    sourceFile: "F-QC-24_Inspection record for Corru.sheet pasting powder.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-line-clearance-printing",
    kind: "log-sheet",
    section: "Line Clearance",
    name: "Area Line Clearance Report - Printing",
    formatNo: "F/QC/15-A",
    revisionNo: "00",
    revisionDate: "2022-02-16",
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "One line per job change on a printing machine: when the previous job finished, its PO and customer, whether the line was cleared — the previous job's rolls, shade card, nylo plates, magnetic die, varnish, screen and inks off the machine and the new job's shade card issued — and when the new job started, signed by the operator and verified by the IPQC executive.",
    sourceFile: "F-QC-15-A-G Line Clearance Printing Printing.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-line-clearance-qc-machine",
    kind: "log-sheet",
    section: "Line Clearance",
    name: "Area Line Clearance Report - QC Machine Inspection",
    formatNo: "F/QC/15-C",
    revisionNo: "00",
    revisionDate: "2022-02-16",
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "One line per job change on a QC inspection machine: the previous job's inspected rolls moved to their place and its waste removed, then the new job's details, the operator's sign and the IPQC executive's verification.",
    sourceFile: "F-QC-15-A-G Line Clearance Quality inspection - Printing.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-line-clearance-qc-manual",
    kind: "log-sheet",
    section: "Line Clearance",
    name: "Area Line Clearance Report - QC Manual Inspection",
    formatNo: "F/QC/15-D",
    revisionNo: "00",
    revisionDate: "2022-02-16",
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "One line per job change at manual QC inspection: the previous job's inspected rolls moved to their place and its waste removed, then the new job's details, the operator's sign and the IPQC executive's verification.",
    sourceFile: "F-QC-15-A-G Line Clearance Quality inspection-2 - Printing.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-line-clearance-slitting",
    kind: "log-sheet",
    section: "Line Clearance",
    name: "Area Line Clearance Report - Slitting",
    formatNo: "F/QC/15-E",
    revisionNo: "00",
    revisionDate: "2022-02-16",
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "One line per job change on a slitting machine: the previous job's slitted rolls moved to their place and its waste removed, then the new job's details, the operator's sign and the IPQC executive's verification.",
    sourceFile: "Copy of F-QC-15-A-G Line Clearance for slitting- Printing.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-line-clearance-sleeve-gluing",
    kind: "log-sheet",
    section: "Line Clearance",
    name: "Area Line Clearance Report - Shrink Sleeve Gluing",
    formatNo: "F/QC/15-F",
    revisionNo: "00",
    revisionDate: "2022-02-16",
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "One line per job change on a shrink sleeve gluing machine: the previous job's printed rolls moved to their place, its waste removed and its leaflet plate taken off, then the new job's details, the operator's sign and the IPQC executive's verification.",
    sourceFile: "Copy of F-QC-15-A-G Line Clearance - Printing.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-line-clearance-sleeve-cutting",
    kind: "log-sheet",
    section: "Line Clearance",
    name: "Area Line Clearance Report - Shrink Sleeve Cutting",
    formatNo: "F/QC/15-G",
    revisionNo: "00",
    revisionDate: "2022-02-16",
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "One line per job change on a shrink sleeve cutting machine: the previous job's packed boxes of cut sleeves moved to their place and its waste removed, then the new job's details, the operator's sign and the IPQC executive's verification.",
    sourceFile: "Copy of F-QC-15-A-G Line Clearance - Printing (2).pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-line-clearance-materials",
    kind: "log-sheet",
    section: "Line Clearance",
    name: "Line Clearance — Materials (લાઈન કિલયરન્સ)",
    formatNo: "TO BE CONFIRMED",
    revisionNo: "TO BE CONFIRMED",
    revisionDate: null,
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "The Gujarati clearance checklist a QA person ticks before a job change: process by process — printing, punching, quality checking and label slitting — every material of the previous job that must be off the line, each line signed by the operator, ticked by QA and signed by QA. No format number is printed on the page.",
    sourceFile: "Photographed Gujarati લાઈન કિલયરન્સ form (supplied 18-Sep-2026)",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-line-clearance-quality",
    kind: "log-sheet",
    section: "Line Clearance",
    name: "Line Clearance — Quality (ક્વોલીટી શહી)",
    formatNo: "TO BE CONFIRMED",
    revisionNo: "TO BE CONFIRMED",
    revisionDate: null,
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "The Gujarati quality checklist printed under the materials one: the parameters of the new job that must be right before production starts — job specs, shade, text, image, varnish or lamination and the approved artwork; the punching dimensions, gap, radius corner and depth; the master registration, shade and spots; and the packing table and slit roll — each ticked and signed. No format number is printed on the page.",
    sourceFile: "Photographed Gujarati ક્વોલીટી શહી form (supplied 18-Sep-2026)",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-calibration-master-list",
    kind: "log-sheet",
    section: "Calibration",
    name: "Master List of Calibration Instruments",
    formatNo: "F/QC/08",
    revisionNo: "01",
    revisionDate: "2021-12-01",
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "Every instrument whose reading affects the process or the product: its id, make, purpose, where it is used, range, least count and acceptable error, whether it is calibrated internally or externally, how often, the initial, current and next due dates, the agency and the report number. Updated whenever an instrument is calibrated, fails calibration, or is bought.",
    sourceFile: "Copy of F-QC-08_Master list of Calibration instruments (2).pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-coa-label",
    kind: "log-sheet",
    section: "Certificates of Analysis",
    name: "Certificate of Analysis [COA] For Label",
    formatNo: "F/QC/06",
    revisionNo: "TO BE CONFIRMED",
    revisionDate: null,
    department: "Quality Assurance",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "The certificate issued with a delivery of labels: the client, the GP3 code and the client's item codes, the size specified and the size tested, the label stock required and found (face material, adhesive, release liner), every colour printed and its shade verification, the coating and the gloss achieved, the finishing, the final inspection and the date the material must be retested. The tolerance block is printed on the certificate.",
    sourceFile: "F-QC-06_Certificate of analysis (COA)-Label (2).pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-coa-sleeve",
    kind: "log-sheet",
    section: "Certificates of Analysis",
    name: "Certificate of Analysis [COA] For Shrink Sleeves",
    formatNo: "F/QC/07",
    revisionNo: "TO BE CONFIRMED",
    revisionDate: null,
    department: "Quality Assurance",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "The certificate issued with a delivery of shrink sleeves: the client and the product, the cut length and open width specified and tested, the film's thickness, shrinkage ratio and type required and found, every colour printed with its shade, text and bar code verification, the coating and gloss, the finishing including the holding glue, and the note that sleeves are heat sensitive and valid only below 30 degrees Celsius.",
    sourceFile: "F-QC-07_Certificate of analysis (COA)-Sleeve.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-coa-corrugated",
    kind: "log-sheet",
    section: "Certificates of Analysis",
    name: "Certificate of Analysis [COA] For Corrugated Boxes",
    formatNo: "F/QC/25",
    revisionNo: "TO BE CONFIRMED",
    revisionDate: null,
    department: "Quality Assurance",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "The corrugated box analysis issued with a delivery: the party and job, the box size, bursting and compression strength and weight, the specified and tested GSM, BF and grade of the top, plain and flute papers, the ply, printing details, box style, style of flute, puncture, ECT and the rub testing report, tested by the QA inspector and signed by the QA manager.",
    sourceFile: "F-QC-25_COA Corrugated.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-obsolete-artwork",
    kind: "log-sheet",
    section: "Registers & Records",
    name: "Register of Obsolete Artwork",
    formatNo: "F/QC/16",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "Every artwork and master shade card taken out of use: the customer, the job, the FG code, the sales person, why it went obsolete, the date, and the QC in-charge who updated the register. The thirteen lines of January and February 2022 are on file as supplied.",
    sourceFile: "Copy of F-QC-16 OBSOLETE ARTWORK & SHADE CARD RECORD.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-printing-aids-destruction",
    kind: "log-sheet",
    section: "Registers & Records",
    name: "Destruction Record — Printing Aids",
    formatNo: "F/QC/20",
    revisionNo: "00",
    revisionDate: "2022-01-01",
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "What printing aids were destroyed and when: the item, how many, who destroyed them and who checked. The 01-Jun-2022 page is on file as supplied. The form is issued from 1st January 2022 and due for review by 31st December 2024.",
    sourceFile: "F-QC-20.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-camera-challenge-test",
    kind: "log-sheet",
    section: "Registers & Records",
    name: "Defect Detection System Camera Challenge Test",
    formatNo: "F: QA/PRO/FL/CCT/01",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "Quality Assurance",
    module: "Quality Control — Inspection Records",
    frequency: "Daily",
    status: "Configured",
    description:
      "Proof that the defect detection cameras are working: at the start of every production cycle — and after any breakdown, stoppage or power failure — the operator marks the loaded roll more than three times, each mark over 0.5 mm, and the test passes only if the system caught every one. Verified by an IPQC executive.",
    sourceFile: "Update - Defect detection system- camera challenge.pdf",
    schedule: { type: "daily" },
  },
  {
    id: "qc-tolerance-card-nivea",
    kind: "log-sheet",
    section: "Registers & Records",
    name: "Tolerance Card for Beiersdorf AG. Germany",
    formatNo: "F-QC-19",
    revisionNo: "TO BE CONFIRMED",
    revisionDate: null,
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "The customer's tolerance card: the panels of accepted and rejected examples — three of misregistration, then other, batch coding area, the Nivea logo and a plain area — each approved and signed. The sample labels mounted on the card are physical; the card's panels and approvals are held here.",
    sourceFile: "F-QC-19_ Tolerance card for Nivea.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-analysis-report",
    kind: "log-sheet",
    section: "Analysis & Meetings",
    name: "Analysis Report",
    formatNo: "F/QC/29",
    revisionNo: "00",
    revisionDate: "2022-01-01",
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "A material analysis written up on the plant's own form: the job, the face paper, release liner and adhesive, the total caliper and GSM and each layer's GSM and micron, tested by the QA executive and approved by the QA manager. The 07-Jan-2022 PSL analysis is on file as supplied.",
    sourceFile: "F-QC-29 _ Analysis report.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-utility-test-report",
    kind: "log-sheet",
    section: "Analysis & Meetings",
    name: "Utility Test Report (Nivea samples)",
    formatNo: "F/QC/29",
    revisionNo: "00",
    revisionDate: "2022-01-01",
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "Labels held for 24 hours in the freezer, the desiccator and the oven, and whether each passed. The nine Nivea samples of 02-Dec-2022 are on file as supplied. The page is printed on the Minutes of Meetings format, which carries the same number.",
    sourceFile: "F-QC-29 Analysis report.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "qc-minutes-of-meetings",
    kind: "log-sheet",
    section: "Analysis & Meetings",
    name: "Minutes of Meetings",
    formatNo: "F/QC/30",
    revisionNo: "01",
    revisionDate: "2022-12-01",
    department: "Quality Control",
    module: "Quality Control — Inspection Records",
    frequency: "As Required",
    status: "Configured",
    description:
      "What was agreed at a meeting about quality: the client, where and when it was held, the subject, who attended, and the points discussed with what the plant will do about each. The 07-Jun-2022 meeting with Gangwal Healthcare is on file as supplied.",
    sourceFile: "MOM F-QC-30.pdf",
    schedule: { type: "as-required" },
  },
  // ---------------------------------------------------------------------
  // Quality — Statements of Compliance (reference documents with a validity
  // period; see src/data/seed/complianceStatements.ts).
  // ---------------------------------------------------------------------
  {
    id: "soc-labels",
    kind: "compliance-statement",
    name: "Statement of Compliance (SOC) — Pressure Labels",
    formatNo: "F/QC-09",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "Quality Assurance",
    module: "Quality — Compliance",
    frequency: "As Required",
    status: "Configured",
    description: "Declaration of Compliance for printed pressure labels (heavy metals per 94/62/EC, CONEG / EN 71-3 inks, no BPA / benzophenones). Signed by the CEO on 01-Apr-2025; valid two years from publication, so due for re-issue by 01-Apr-2027.",
    sourceFile: "F-QC-09_Statement of Compliance (SOC) - Label.docx",
    schedule: { type: "as-required" },
    isReferenceOnly: true,
  },
  {
    id: "soc-flexible-packaging",
    kind: "compliance-statement",
    name: "Statement of Compliance (SOC) — Flexible Packaging (Rolls & Pouches)",
    formatNo: "F/QC-38",
    revisionNo: "00",
    revisionDate: "2025-02-24",
    department: "Quality Assurance",
    module: "Quality — Compliance",
    frequency: "As Required",
    status: "Configured",
    description: "BRC-referenced Declaration of Compliance for flexo-printed, solvent-laminated flexible packaging (EC 1935/2004, EC 10/2011, FSSAI 2018/2020, REACH, FDA 21 CFR 177.1640). Signed by the CEO on 24-Feb-2025; valid two years, so due for re-issue by 24-Feb-2027.",
    sourceFile: "F-QC-38_Statement of Compliance (SOC) - Flexible packaging Pouch & Film.docx",
    schedule: { type: "as-required" },
    isReferenceOnly: true,
  },
  // ---------------------------------------------------------------------
  // Maintenance — the eight formats supplied on 24-Sep-2026 (REQUIREMENTS
  // §74), placed before Purchase as the company's master list of formats
  // places F/MNT after the production formats. F/MNT/05, 07 and 10 are on that
  // list but were not supplied, and nothing stands in for them.
  // ---------------------------------------------------------------------
  {
    id: "mnt-equipment-list",
    kind: "log-sheet",
    name: "List of Equipments & Utilities",
    formatNo: "F/MNT/01",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "Maintenance",
    module: "Maintenance",
    section: "Equipment",
    frequency: "As Required",
    status: "Configured",
    description:
      "The plant's EQUIPMENT MASTER: every machine and utility with its number, section, room, manufacturer, model, description, country of origin, size or capacity, month and year of manufacture and serial number — 43 machines, M-01 to M-85 with gaps. The other maintenance formats fetch a machine from it by its Machine No. One line on the supplied page, M-68, is printed one column out of step on the paper itself (its size reads \"France\" and its serial number \"2023\"); it is kept exactly as printed for the department to confirm.",
    sourceFile: "F-MNT- 01_Master List of Equipments-Flexo & Pouch.pdf (the list as supplied)",
    schedule: { type: "as-required" },
  },
  {
    id: "mnt-new-equipment",
    kind: "log-sheet",
    name: "New Equipment Installation Report",
    formatNo: "F/MNT/08",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "Maintenance",
    module: "Maintenance",
    section: "Equipment",
    frequency: "As Required",
    status: "Configured",
    description:
      "Written up when a new machine is installed and commissioned: the equipment, its manufacturer, supplier, model and serial number, where it goes and what it does; ten requirements each assessed Y or N with a comment and a date of action — production needs, cleaning, maintenance access, food-grade lubricants, food-safety controls, manuals, training, spares, the trial production date and productivity; the benefits and the risks accepted; and the hand-over signed by the Maintenance, Production and QC heads.",
    sourceFile: "F-MNT-08_New Equipment Installation & commissioning record.pdf (the blank format, two pages)",
    schedule: { type: "as-required" },
  },
  {
    id: "mnt-pm-record",
    kind: "log-sheet",
    name: "Preventive Maintenance Schedule & Record",
    formatNo: "F/MNT/02",
    // Two revisions were supplied, both dated 01.12.2021. This is the higher,
    // Rev 01; the Rev 00 "CHECK LIST & RECORD" page is shown beside it as the
    // superseded original. That both carry the same date is for the MR to
    // confirm.
    revisionNo: "01",
    revisionDate: "2021-12-01",
    department: "Maintenance",
    module: "Maintenance",
    section: "Preventive Maintenance",
    frequency: "As Required",
    status: "Configured",
    description:
      "One sheet for each machine, picked from the equipment list: the machine's monthly, 3-monthly, 6-monthly and yearly check points, then every preventive maintenance done on it through the year — twelve monthly, four quarterly, two six-monthly and one yearly — each with its date, who did it and the supervisor, and any abnormal finding and the action taken beside the visit it was found on. The hygiene clearance the format prints applies to every visit.",
    sourceFile: "F-MNT-02_PM schedule & record-1.pdf (Rev 01, two pages); the superseded Rev 00 is F-MNT-02_PM schedule & record.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "mnt-yearly-pm-schedule",
    kind: "log-sheet",
    name: "Yearly Preventive Maintenance Schedule",
    formatNo: "F/MNT/03",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "Maintenance",
    module: "Maintenance",
    section: "Preventive Maintenance",
    frequency: "Yearly",
    status: "Configured",
    description:
      "The year's preventive maintenance plan: for each machine, the monthly, half-yearly and yearly PM, with the date planned and the date actually done in each month. The supplied page names the printing machine and the slitting machine and leaves a third block for another; its only marks are January's — printing planned 10.01 and done 28.01, slitting planned 12.01 — and it prints no year. A PM done well after its plan, or a planned date passed with nothing done, is exactly what this sheet is kept to show.",
    sourceFile: "F-MNT-03_Yearly PM Schedule .pdf (the page as supplied)",
    schedule: { type: "yearly", month: 0, dayOfMonth: 1 },
  },
  {
    id: "mnt-daily-health",
    kind: "log-sheet",
    name: "Daily Equipment Health Status & Cleaning Record",
    formatNo: "F/MNT/04",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "Maintenance",
    module: "Maintenance",
    section: "Equipment Health & Breakdowns",
    frequency: "Daily",
    status: "Configured",
    description:
      "One sheet for each machine for each month, ticked every day in the day shift and the night shift by the operator after checking the seven parameters the form prints in Hindi and Gujarati side by side: clean the machine, check the electrical panels, listen for any unusual sound, check for pipe leakage, test the emergency stop once a week, check the air and water pressures, and clear tools and blades from the floor. Anything wrong goes to the supervisor, and its details to the back of the sheet.",
    sourceFile: "F-MNT-04_Daily Equipment Health Status & Cleaning Record.pdf (the blank format, Hindi and Gujarati)",
    schedule: { type: "as-required" },
  },
  {
    id: "mnt-breakdown-record",
    kind: "log-sheet",
    name: "Equipments Breakdown Maintenance Record",
    formatNo: "F/MNT/06",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "Maintenance",
    module: "Maintenance",
    section: "Equipment Health & Breakdowns",
    frequency: "As Required",
    status: "Configured",
    description:
      "The register of every breakdown: when the failure was reported, which machine, the fault and who attended it, the action taken, the materials used, when it was repaired, the total breakdown minutes — worked out from the two dates and times, never typed — the production minutes lost and the reason. It is the record that shows which machines break down most and how long they stay down.",
    sourceFile: "F-MNT-06_Equipment breakdown record.pdf (the blank format)",
    schedule: { type: "as-required" },
  },
  {
    id: "mnt-glass-breakage",
    kind: "log-sheet",
    // The title as the page prints it — "BREKAGE" is the paper's spelling, and
    // the header of every sheet prints this name. Mitra and Search still find
    // it by "glass breakage".
    name: "List of Glass Articles & Weekly Glass Brekage Monitoring Record",
    formatNo: "F/MNT/09",
    revisionNo: "02",
    revisionDate: "2025-09-01",
    department: "Maintenance",
    module: "Maintenance",
    section: "Glass & Lighting",
    frequency: "Monthly",
    status: "Configured",
    description:
      "The list of every glass and brittle-plastic article in the plant by area — windows and doors, false-ceiling acrylic, tube lights, CCTV cameras, LED lights, monitors and insect killers, 3,980 articles in twelve areas at Rev 02 — with its revision history, and the month's sheet on which each area is checked every week for any crack or breakage, with the breakage answered YES or NO, checked by the maintenance technician and verified by the head of maintenance. A breakage or crack calls for the CA / Incident record with its root cause, correction and corrective action.",
    sourceFile: "F-MNT-09_List of Glass articles & weekly Glass Breakage monitoring record Dt.17-01-2024 (1) (2).pdf (Rev 02, two pages)",
    schedule: { type: "monthly", dayOfMonth: 1 },
  },
  {
    id: "mnt-lux-level",
    kind: "log-sheet",
    name: "Lux Level Measurement Record",
    formatNo: "F/MNT/11",
    revisionNo: "01",
    revisionDate: "2024-12-15",
    department: "Maintenance",
    module: "Maintenance",
    section: "Glass & Lighting",
    frequency: "As Required",
    status: "Configured",
    description:
      "The light level measured in every area of the plant with the Kusam-Meco KM-LUX-99 lux meter (Sr.No. S1135510). Two rounds were supplied: 12.08.2025 on the current Rev 01, one reading in each of 26 areas, and 11.05.2024 on the superseded Rev 00, which measured 19 areas by day and by night — that record keeps its own layout. Comparing the two shows where the light has fallen, which matters most at the colour-matching cabinets.",
    sourceFile: "F-MNT-11_LUX LEVEL MEASUREMENT RECORD.pdf (Rev 01, filled 12.08.2025); the Rev 00 page of 11.05.2024 is F-MNT-11_LUX LEVEL MEASUREMENT RECORD-2.pdf",
    schedule: { type: "as-required" },
  },

  // ---------------------------------------------------------------------
  // Purchase — the five formats supplied on 23-Sep-2026 (REQUIREMENTS §68),
  // in the order the department works through them: a supplier registers, is
  // audited if the assessment calls for it, goes onto the approved list, and is
  // then monitored — materials on one register, services on the other. Their
  // layouts are in src/data/seed/purchaseLayouts.ts and the weighted ratings on
  // the two registers are worked out in src/engine/purchaseRatings.ts.
  //
  // F/PUR/04 WAS NOT SUPPLIED: there is no definition for it and none was
  // invented. The department owns F/PUR/06's service provider monitoring
  // alongside the Pest Control Service Agreement, which is already Purchase's
  // (data/seed/documentDepartments.ts). "F/PUR/xx" resolves to PUR by its
  // prefix, so none of these five needs a line in that file.
  // ---------------------------------------------------------------------
  {
    id: "pur-supplier-registration",
    kind: "log-sheet",
    name: "Supplier Registration Form",
    formatNo: "F/PUR/01",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "Purchase",
    module: "Purchase",
    section: "Supplier Approval",
    frequency: "As Required",
    status: "Configured",
    description:
      "The three-page form a supplier fills before it may be used: general details (type of concern, both addresses, contact person, telephone, e-mail, weekly off and working hours, company activities, number of technical and non-technical employees, year of commencement), then the prose blocks — range of products / services offered, major customers, plant machinery and other infrastructure, details of the quality control department — the ISO 9001 / ISO 22000 / HACCP / FSSC / BRCGS question, the five documents asked for with the form, and who furnished the information. The INTERNAL OFFICE USE ONLY block below it is the office's: the status of the supplier, the type of assessment, what the supplier is approved for, APPROVED or REJECTED, and the authorised person's signature. One form per supplier.",
    sourceFile: "F-PUR-01_Supplier registration form.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "pur-supplier-audit-report",
    kind: "log-sheet",
    name: "Supplier Audit Report",
    formatNo: "F/PUR/02",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "Purchase",
    module: "Purchase",
    section: "Supplier Approval",
    frequency: "As Required",
    status: "Configured",
    description:
      "The nine-page report of a visit to a supplier: the supplier, the contacts, the date and number of the visit, the auditors, the scope and the product supplied, then the eight audit criteria marked Y / N / NA — a criterion may be omitted, and is then marked N/A — and the fifty-one audit points of those eight sections, from specification suitability and HACCP through the premises, personnel hygiene, infestation and foreign body control, raw materials, process control, product analysis (in-house and, if used, the external laboratory) to the storage and distribution of packed product. Then the summary of observations against each of the eight, the observations / NC table with the supplier's response and the date of closure, and the overall status: Approved or Rejected. One report per visit.",
    sourceFile: "F-PUR-02_Supplier audit report.pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "pur-approved-suppliers",
    kind: "log-sheet",
    name: "List of Approved Suppliers (RM, PM, Service Provider)",
    formatNo: "F/PUR/03",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "Purchase",
    module: "Purchase",
    section: "Supplier Approval",
    frequency: "Yearly",
    status: "Configured",
    description:
      "The landscape list of every approved supplier and service provider, updated as on a date written at its head: the supplier's name, the product or service, whether it is a trader, a manufacturer or a service provider, the manufacturer's name where the material is procured from a trader, the contact person and number, the location, the method by which it was approved — monopoly / reputed supplier, registration form, supplier visit / audit, trial lot / sample approval, GFSI scheme certification — and the approval date. The supplied format prints seven rows; the list grows as suppliers are approved.",
    sourceFile: "F-PUR-03_List of Approved suppliers.pdf",
    // The format prints "UPDATION AS ON : XX - XX - XXXX" but no review
    // period; anchored on 1 December, the date the F/PUR formats took effect,
    // for the MR to confirm.
    schedule: { type: "yearly", month: 11, dayOfMonth: 1 },
  },
  {
    id: "pur-supplier-performance",
    kind: "log-sheet",
    name: "Raw Material (Label Stock, Ink, Films etc.) & Packing Materials Supplier (Paper Core, Wooden Pallets etc.) Performance Monitoring Register",
    formatNo: "F/PUR/05",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "Purchase",
    module: "Purchase",
    section: "Supplier Monitoring",
    frequency: "Yearly",
    status: "Configured",
    description:
      "The landscape register that rates each raw material and packing material supplier for a period under review: the material, how many lots were received and how many were rejected, returned or infested, then the three ratings the printed criteria give — product safety (no infestation 100, infestation 0), quality (100% accept 100, accepted on segregation 50, rejected and sent back 00) and delivery (before time or under 7 days 100, 7 to 15 days late 75, over 15 days late 50). The form says of the rest \"Don't enter value in the following cell, its formula based\": the three weightages (50%, 40%, 10%), the Overall Rating and the Grade — A at 90 and above (continue), B below 90 and 80 or above (continue & improve), C below 80 (replace / improve) — are worked out here and cannot be typed. The supplied format prints eight rows.",
    sourceFile: "F-PUR-05_RM & PM Supplier Performance Monitoring.pdf",
    // "Period under review" is written on the sheet; the format prints no
    // period of its own. Anchored as F/PUR/03 is, for the MR to confirm.
    schedule: { type: "yearly", month: 11, dayOfMonth: 1 },
  },
  {
    id: "pur-service-provider-performance",
    kind: "log-sheet",
    name: "Service Provider - Performance Monitoring Register",
    formatNo: "F/PUR/06",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "Purchase",
    module: "Purchase",
    section: "Supplier Monitoring",
    frequency: "Yearly",
    status: "Configured",
    description:
      "The register that rates each service the plant buys in for a rating period: the description of the service, the provider, the delivery parameter rating and the quality & product safety parameter rating — each out of 50 — the Overall Rating, which is the two added and is worked out here rather than typed, and the status or decision the buyer records against it. The supplied format prints thirteen rows.",
    sourceFile: "F-PUR-06_Service provider monitoring.pdf",
    // "Rating Period :" is written on the sheet; the format prints no period of
    // its own. Anchored as F/PUR/03 is, for the MR to confirm.
    schedule: { type: "yearly", month: 11, dayOfMonth: 1 },
  },

  // ---------------------------------------------------------------------
  // Store — the two formats the department keeps (REQUIREMENTS §71), both
  // supplied 23-Sep-2026 and both listed under F/STR on the company's own
  // Master List of Formats & Records (F/SYS/02), issued 01.12.21.
  // ---------------------------------------------------------------------
  {
    id: "str-incoming-material-vehicle",
    kind: "log-sheet",
    // The title the STAMP prints. The master list calls the same format
    // "Incoming Material & Vehicle inspection Record"; the stamp is what the
    // storekeeper actually puts on the paperwork, so the stamp's wording is
    // the one shown and the list's wording is recorded here.
    name: "Incoming Material Vehicle & Condition Monitoring Record",
    formatNo: "F/STR/01",
    // The stamp prints no format number and no revision block — a rubber
    // stamp has no room for one. The NUMBER is the company's own, from the
    // Master List of Formats & Records, which lists F-STR-01 "Incoming
    // Material & Vehicle inspection Record" issued 01.12.21 and holds only
    // two F/STR formats, the other being the sharp tool register below. The
    // REVISION is not written anywhere the plant supplied, so it is left for
    // the MR to confirm rather than assumed to be 00 like its neighbour.
    revisionNo: "TO BE CONFIRMED",
    revisionDate: "2021-12-01",
    department: "Store",
    module: "Store",
    section: "Incoming Material",
    frequency: "As Required",
    status: "Configured",
    description:
      "The check the store makes on a vehicle and its load before incoming material is taken in, stamped onto the receiving paperwork: the date it was received, then seven points answered Yes or No — whether the vehicle was covered, whether there was foreign matter contamination or an objectionable odour, whether the floor and sides were clean, whether there was an oil spot on the floor, whether there was any sign of pest or dropping, and whether the packaging was intact — and who checked it. It was supplied as a photograph of the rubber stamp itself, which is shown beside the form so the two can be compared; the stamp's own spellings are kept exactly as they are cut into it.",
    sourceFile: "F-STR-01_Incoming material vehicle & condition monitoring record (rubber stamp).jpg (the stamp, photographed)",
    schedule: { type: "as-required" },
  },
  {
    id: "str-sharp-metal-objects",
    kind: "log-sheet",
    name: "Sharp Metal Objects Issuance (New) & Return (Old) Record",
    formatNo: "F/STR/02",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "Store",
    module: "Store",
    section: "Sharp Tool Control",
    frequency: "As Required",
    status: "Configured",
    description:
      "The register of every sharp metal object the store issues — razor blade, scissor, cutter blade, surgical blade — and of what comes back against it: the date, the tool, the quantity issued, who it went to and for which department, their signature, the quantity returned, the store keeper's signature and any remark. A new tool is issued against the return of the worn-out one intact, or of the complete assembly of a broken one; the format's own second paragraph allows an issue with nothing returned, to a new employee, a new machine or a new requirement, so the return quantity is the one column that may be left empty. In night shift the departmental supervisor issues the tool and makes the entry himself, and the Store In-charge reconciles issued against returned.",
    sourceFile: "F-STR-02_Sharp metal objects issuance & replacement record.pdf (the blank format)",
    schedule: { type: "as-required" },
  },

  // ---------------------------------------------------------------------
  // Dispatch — the two formats the department supplied on 23-Sep-2026
  // (REQUIREMENTS §70). F/DISP/02 is printed in Gujarati, like the three
  // Quality Control forms of §58, and reads in English from
  // i18n/documentTextEn.ts when English is chosen.
  // ---------------------------------------------------------------------
  {
    id: "disp-safe-transporter-agreement",
    kind: "log-sheet",
    name: "Safe Transporter Agreement",
    formatNo: "F/DISP/01",
    // The paper prints no revision block of its own — only the period it is
    // valid for. The MR confirms the revision; the format number is the
    // company's own, from its file name and the master list of formats.
    revisionNo: "TO BE CONFIRMED",
    revisionDate: "2025-04-01",
    department: "Dispatch",
    module: "Dispatch",
    section: "Transporter Agreement",
    frequency: "Yearly",
    status: "Configured",
    description:
      "The code of practice a contract transporter agrees to before it carries the plant's finished product: the standards for the vehicle and its driver, what may never be carried with the product, how a load is protected and secured, what happens if a vehicle breaks down or a seal is tampered with, and the inspection and rejection rights on arrival. It is signed by both sides — the plant's Purchase Manager and the transporter's own representative — and returned within seven days. The supplied copy runs from 01.04.2025 to 31.03.2026 and carries no commercial values.",
    sourceFile: "F-DISP-01_Safe Transportation agreement (Finish product).pdf (the signed agreement); the company's own original is a .docx",
    schedule: { type: "yearly", month: 3, dayOfMonth: 1 },
  },
  {
    id: "disp-container-stuffing",
    kind: "log-sheet",
    name: "Container Stuffing & Vehicle Inspection Record — કન્ટેનર સ્ટફિંગ અને વાહન નિરીક્ષણ રેકોર્ડ",
    formatNo: "F/DISP/02",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "Dispatch",
    module: "Dispatch",
    section: "Dispatch Inspection",
    frequency: "As Required",
    status: "Configured",
    description:
      "The check made on the container and the vehicle before the plant's product is loaded into it, printed in Gujarati: the seven things to do when the container arrives, the consignment's own details — the customer, the invoice, both purchase order numbers, the driver, the transporter and the vehicle — and the nine-point checklist, each point answered હા or નાં with NA struck out, and any other observation written beside it. It is authorised by the Dispatch In charge for product release and checked and approved by QC. The paper numbers its points 1, 2, 3, 4, 6, 7, 8, 9 — there is no 5.",
    sourceFile: "F-DISP-02_Container stuffing & Vehicle Inspection record.pdf (the blank format, both pages)",
    schedule: { type: "as-required" },
  },
  // ---------------------------------------------------------------------
  // System / Management — the Product Safety Team Leader's own formats,
  // F/SYS/01 to F/SYS/20, supplied on 25-Sep-2026 (REQUIREMENTS §76) and
  // built in data/seed/sys*Layouts.ts. The company's Master List of Formats
  // & Records puts F/SYS first. F/SYS/09 is not on that list; F/SYS/04-A and
  // F/SYS/20 print numbers of their own that the list does not hold yet.
  // ---------------------------------------------------------------------
  {
    id: "sys-document-list",
    kind: "log-sheet",
    name: "Master List of Documents",
    formatNo: "F/SYS/01",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "System / Management",
    module: "System / Management",
    section: "Document Control",
    frequency: "As Required",
    status: "Configured",
    description:
      "The master list of every controlled document the plant holds — the BRCGS Packaging manual and its annexures (the policies), the product safety procedures (PSMS / SOP), the management system procedures (IMS / PRO), the HARA manual's sections, the machine and test work procedures (FLE/PR0/WP, QC/WP), the material specifications (QC/ICM/SPEC), the reference documents (RD) and the department procedures (FLX/SOP, FLX/PRO, POUCH) — each with its document number, its description, how it is controlled (hard copy, SAP or both) and the date of each revision, 0 to 5. It is maintained as updated: a new list starts as a copy of the last one. On file: the list as supplied (R-2025), 173 documents, reviewed and approved by the PSTL.",
    sourceFile: "F-SYS-01-Master List of Documents. (R-2025)..pdf (as supplied, 5 pages); the company's own original is F-SYS-01-Master List of Documents. (R-2025)..xlsx",
    // "Maintain as updated" (F/SYS/02): changed whenever a document is, not on a calendar.
    schedule: { type: "as-required" },
  },
  {
    id: "sys-format-list",
    kind: "log-sheet",
    name: "Master List of Formats & Records",
    formatNo: "F/SYS/02",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "System / Management",
    module: "System / Management",
    section: "Document Control",
    frequency: "As Required",
    status: "Configured",
    description:
      "The master list of every format and record the plant keeps, department by department — F/SYS, F/MKT, F/PUR, F/STR, F/QC, F/QA, F/PRD, F/MNT, F/HR, F/DISP and the camera challenge test — with each format's number and description, the date of each revision (0 to 3), how it is recorded (hard copy or SAP), how long it is retained and how it is disposed of. Nearly every record is kept three years and then shredded; the two master lists are maintained as updated. On file: the company's workbook as last updated, 141 formats to 01.09.2026. The PDF supplied with it is an earlier print of the same list (135 formats) and is shown beside it.",
    sourceFile: "F-SYS-02-Master List of Formats. (R-2025)..xlsx (the company's workbook, as last updated); the print supplied with it is F-SYS-02-Master List of Formats. (R-2025)..pdf",
    schedule: { type: "as-required" },
  },
  {
    id: "sys-document-change",
    kind: "log-sheet",
    name: "Document Change Request & Approval Note",
    // The paper's own "Format No.:" box is empty; the number is the master
    // list's (F-SYS-03) and the file's.
    formatNo: "F/SYS/03",
    revisionNo: "01",
    revisionDate: "2021-12-01",
    department: "System / Management",
    module: "System / Management",
    section: "Document Control",
    frequency: "As Required",
    status: "Configured",
    description:
      "The request that has to be approved before a controlled document is changed, a new one introduced or an existing one removed: which of the three it is, the date, the current document's number, revision and date, the document's title, number, new revision and effective date, what changes and why, and who asks for it. The PSTL verifies the request, adds any comments, approves it or not and records the date of approval and implementation — when the master lists (F/SYS/01, F/SYS/02) take the new revision. The paper prints no format number of its own; the number is the master list's. Supplied blank.",
    sourceFile: "F-SYS-03-Document change request & approval note.pdf (the blank format); the company's own original is F-SYS-03-Document change request & approval note.doc",
    schedule: { type: "as-required" },
  },
  {
    id: "sys-mrm-agenda",
    kind: "log-sheet",
    name: "Agenda for BRCGS Packaging (Issue 7) Management Review Meeting Record",
    formatNo: "F/SYS/04-A",
    revisionNo: "01",
    revisionDate: "2025-04-01",
    department: "System / Management",
    module: "System / Management",
    section: "Management Review",
    frequency: "As Required",
    status: "Configured",
    description:
      "The notice that calls the management review: the date of notification, the planned date of the meeting, where and when it is held, the participants who sign it, and the eleven agenda points the meeting reviews (F/SYS/04 records the meeting itself). On file: the notice of 07.07.2025 for the meeting of 21.07.2025. The master list does not list this format yet.",
    sourceFile: "F-SYS-04A-BRCGS MRM Notification Record_July2025.pdf (as supplied, filled)",
    // Called when the PSTL calls the review — the plant held it for each half-year.
    schedule: { type: "as-required" },
  },
  {
    id: "sys-mrm-record",
    kind: "log-sheet",
    name: "Management Review Meeting Record – BRCGS Packaging (Issue 7)",
    formatNo: "F/SYS/04",
    revisionNo: "01",
    revisionDate: "2025-04-01",
    department: "System / Management",
    module: "System / Management",
    section: "Management Review",
    frequency: "As Required",
    status: "Configured",
    description:
      "The record of the management review of the product safety and quality management system under BRCGS Packaging Issue 7: when it met, its purpose and who attended, then its eleven agenda points — the last meeting's action items; internal, second-party and third-party audits; customer feedback and complaints; the HARA system; legislative and certification scheme changes; product safety incidents and non-conforming product; resources; the quality and product safety objectives, with the table of what was achieved, the revised targets and why; product defence and fraud prevention; the policies; and the use of the BRCGS logo — each with who reports it, what was reviewed, the discussion and its result, and the new action items. On file: the meeting of 21.07.2025, reviewing January to June 2025.",
    sourceFile: "F-SYS-04-Management review meeting agenda & Record_July 2025.pdf (9 pages, filled); the company's own earlier original of the format is F-SYS-04-Management review meeting agenda & Record_R01_09.12.2020.doc",
    schedule: { type: "as-required" },
  },
  {
    id: "sys-objectives",
    kind: "log-sheet",
    name: "Quality & Product Safety Objectives",
    formatNo: "F/SYS/16",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "System / Management",
    module: "System / Management",
    section: "Management Review",
    frequency: "As Required",
    status: "Configured",
    description:
      "The quality and product safety objectives, department by department — Sales (new customers, and customer feedback for labels, sleeves and pouches), Production (labels produced and label wastage), QC (customer complaints on product quality), Maintenance (breakdown minutes), HR & admin (training programmes and GMP non-compliances), Dispatch (transport and pest complaints), Purchase (supplier rating, and receipts infested or in an improper vehicle) and Store (material wasted in storage) — each with its unit, the plan and the actual for each month from January to June, the total and the percentage achieved. The management review (F/SYS/04) reviews them and revises the targets. On file: the sheet for 2026.",
    sourceFile: "F-SYS-16-Quality & Product Safety objectives 2024-25.pdf (the 2026 sheet as supplied); the company's own original is XXXXX_Quality & Product Safety objectives.xls",
    // A sheet per review period, started when the management review sets the
    // targets — the supplied one covers January to June.
    schedule: { type: "as-required" },
  },
  {
    id: "sys-audit-schedule",
    kind: "log-sheet",
    name: "Yearly Internal Audit Schedule (BRCGS Packaging – Issue 06)",
    formatNo: "F/SYS/05",
    revisionNo: "01",
    revisionDate: "2023-03-01",
    department: "System / Management",
    module: "System / Management",
    section: "Internal Audit",
    frequency: "Yearly",
    status: "Configured",
    description:
      "The year's internal audit programme: the six parts of the standard — senior management commitment, hazard and risk management, the product safety and quality management system, site standards, product and process control, and personnel — against the twelve months, with an X where an audit is planned and the date it was actually done, approved by the PSTL. On file: 2024, every part audited twice, and 2025, February only, with the note that the next schedule is to be planned for Issue 7.",
    sourceFile: "F-SYS-05-Internal_Audit_Schedule _2024.pdf and F-SYS-05-Internal_Audit_Schedule _2025.pdf (filled); the company's own original is F-SYS-05-Internal_Audit_Schedule.xlsx",
    // "for the Year:" — one schedule a year, made at its start.
    schedule: { type: "yearly", month: 0, dayOfMonth: 1 },
  },
  {
    id: "sys-audit-plan",
    kind: "log-sheet",
    name: "Internal Audit Schedule & Plan",
    formatNo: "F/SYS/06",
    revisionNo: "01",
    revisionDate: "2023-03-01",
    department: "System / Management",
    module: "System / Management",
    section: "Internal Audit",
    frequency: "As Required",
    status: "Configured",
    description:
      "The plan of one internal audit: its number and date, the audit team leader and the auditors, the functions to be audited with the date, time, auditors and auditee of each (the auditee acknowledges it), and afterwards the audit summary — the critical, major and minor non-conformities found in each function and their status — verified by the PSTL. On file: audit 01/2025 of 17.02.2025, of the product safety and quality management system and of site standards, which found two minor NCs, 4.2.1 and 4.7.6.",
    sourceFile: "F-SYS-06-Internal Audit Plan (R).pdf (filled); the company's own original is F-SYS-06-Internal Audit Plan.doc",
    schedule: { type: "as-required" },
  },
  {
    id: "sys-audit-risk",
    kind: "log-sheet",
    name: "Internal Audit Risk Assessment",
    formatNo: "F/SYS/07",
    revisionNo: "01",
    revisionDate: "2023-03-01",
    department: "System / Management",
    module: "System / Management",
    section: "Internal Audit",
    frequency: "Yearly",
    status: "Configured",
    description:
      "The yearly assessment that sets how often each section of the standard is audited: every clause with its auditee, and for each section the non-conformities the internal audits and the last external audit found, their sum and the audit frequency it gives — up to 4, once a year; 5 to 15, twice; 16 or more, three times — while every clause is still audited at least twice a year whatever the rating. The sum and the frequency are worked out here, never typed. On file: the assessment for 2024 (6 internal and 6 external NCs; site standards audited twice).",
    sourceFile: "Copy of F-SYS-07-Internal Audit Risk assessment(R-2024).pdf (filled); the company's own original is F-SYS-07-Internal Audit Risk assessment.xlsx",
    schedule: { type: "yearly", month: 0, dayOfMonth: 1 },
  },
  {
    id: "sys-audit-findings",
    kind: "log-sheet",
    name: "Internal Audit Findings / Observation Report",
    formatNo: "F/SYS/08",
    revisionNo: "01",
    revisionDate: "2023-03-01",
    department: "System / Management",
    module: "System / Management",
    section: "Internal Audit",
    frequency: "As Required",
    status: "Configured",
    description:
      "The internal auditor's checklist and compliance report against the BRCGS Packaging Materials standard: the functions audited with their date, time and auditors, then each clause audited with its requirement, whether it complies or is a non-conformity (numbered NC - 01, NC - 02 …) and what was seen. On file: the audit of 17.02.2025 against Issue 6 — section 3 (product safety and quality management) and section 4 (site standards), clause by clause, with two NCs: 4.2.1, wall painting peeling near the old plant's worker entry, and 4.7.6, a temporary repair with thread and cloth on the lamination machine.",
    sourceFile: "F-SYS-08 Audit Checklist Compliance Report.pdf (25 pages, filled); the company's own original is F-SYS-08-Internal Audit Findings & observation Report.doc",
    schedule: { type: "as-required" },
  },
  {
    id: "sys-audit-nc",
    kind: "log-sheet",
    name: "BRCGS Packaging (Issue 06) - Internal Audit NC Report",
    formatNo: "F/SYS/10",
    revisionNo: "01",
    // As the paper prints it: "Date: 01.05.2013". The master list gives
    // revision 1 of F-SYS-10 as 01.03.23 — for the MR to confirm.
    revisionDate: "2013-05-01",
    department: "System / Management",
    module: "System / Management",
    section: "Internal Audit",
    frequency: "As Required",
    status: "Configured",
    description:
      "The report raised for each non-conformity an internal audit finds: its number and date, the auditor, the area, the finding and its objective evidence (records, procedure, clause), the planned closing date, the root cause, the correction and corrective action taken, the follow-up audit of its effectiveness, and the closing verification — actions satisfactory or not, the CAR closed or not. On file: Feb -25/02 of 17.02.2025, clause 4.7.6 — a temporary repair with thread and cloth on the lamination machine, removed, with the operators made aware; its closing verification is not filled in.",
    sourceFile: "F-SYS-10.pdf (filled); the company's own original is F-SYS-10-Internal audit NC report.DOC",
    schedule: { type: "as-required" },
  },
  {
    id: "sys-nc-car",
    kind: "log-sheet",
    name: "Non-Conformance & Corrective Action Report (CAR)",
    // The paper's "Format No.:" box is empty; the number is the master list's.
    formatNo: "F/SYS/11",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "System / Management",
    module: "System / Management",
    section: "Corrective Action",
    frequency: "As Required",
    status: "Configured",
    description:
      "The report for a non-conformance or an observation anywhere in the plant — a process, a product, a complaint: its number and date, the observer, the area, the finding and its evidence, the planned closing date, the auditee's root cause analysis, the correction done and the corrective action that prevents it happening again, and the closing verification — actions satisfactory or not, closed or not, and the follow-up date where not. The paper prints no format number of its own; the number is the master list's. Supplied blank.",
    sourceFile: "F-SYS-11-Non Confirmance & Corrective Action Report.pdf (the blank format); the company's own original is F-SYS-11-Non Confirmance & Corrective Action Report.DOC",
    schedule: { type: "as-required" },
  },
  {
    id: "sys-hara-monthly",
    kind: "log-sheet",
    name: "Monthly Review & HARA Verification Meeting Record",
    formatNo: "F/SYS/12",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "System / Management",
    module: "System / Management",
    section: "HARA & Site Security",
    frequency: "Monthly",
    status: "Configured",
    description:
      "The HARA team's monthly check that the product safety plan still holds: twenty-four questions — changes to the policy, the team, the premises, the layout, the equipment, the products, the materials, the process and its control norms; the training of new employees; cleaning and pest control as planned; new hazards; process non-compliance; recalls; suppliers; customer complaints; product safety incidents; injuries; site security; CCP deviations; and regulatory changes — each answered Yes or No against its reference documents, verified C or NC, with the review's comments, and the team who met. On file: the meeting of 22 April 2024.",
    sourceFile: "F-SYS-12-Monthly HARA Verification_April 2024.pdf (3 pages, filled); the company's own original is F-SYS-12-Monthly HARA Verification.doc",
    // The paper prints no day; the April 2024 meeting sat on the 22nd — for the MR to confirm.
    schedule: { type: "monthly", dayOfMonth: 22 },
  },
  {
    id: "sys-hara-annual",
    kind: "log-sheet",
    name: "Annual HARA Review & Verification Record",
    formatNo: "F/SYS/20",
    revisionNo: "00",
    revisionDate: "2025-04-01",
    department: "System / Management",
    module: "System / Management",
    section: "HARA & Site Security",
    frequency: "Yearly",
    status: "Configured",
    description:
      "The HARA team's yearly review of the whole hazard and risk analysis: the site and its products, the date and the team leader; the changes reviewed — raw materials and suppliers, the process, new hazards (product fraud and defence included), equipment, formulation, new products, key staff, site standards, pest control, customer complaints, recalls and regulatory updates; the CCMs and PRPs verified, with any deviation and its correction; the validation and verification summary; recommendations; the conclusion with the next scheduled review; and the team. On file: the first review under BRCGS Packaging Issue 7, of 27 January 2026. The master list does not list this format yet.",
    sourceFile: "F-SYS-20_Annual HARA Verification Record_Jan 2026.pdf (4 pages, filled)",
    // "Next scheduled review: 1st January 2027".
    schedule: { type: "yearly", month: 0, dayOfMonth: 1 },
  },
  {
    id: "sys-site-security",
    kind: "log-sheet",
    name: "Site Security Risk Assessment",
    formatNo: "F/SYS/17",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "System / Management",
    module: "System / Management",
    section: "HARA & Site Security",
    frequency: "Yearly",
    status: "Configured",
    description:
      "The yearly site security (product defence) risk assessment: twenty-six points — the product security committee, awareness, emergency preparedness, the recall system, perimeter protection, securing openings and accesses, access control and the checks at the main gate, lighting, chemicals, hazardous chemicals and pesticides, the laboratory, people, access levels, personal items, vehicles and packages, contractors, suppliers and deliveries, ingredients and packaging, dispatch, finished goods, utilities and the IT systems — each with what the assessment observed, who checked it and when. On file: the assessment of 01.01.2026.",
    sourceFile: "F-SYS-17-Site security risk assessment record(R-2026).pdf (4 pages, filled); the company's own original is XXXXX_Site security risk assessment record.xls",
    schedule: { type: "yearly", month: 0, dayOfMonth: 1 },
  },
  {
    id: "sys-backward-trace",
    kind: "log-sheet",
    name: "Backward Traceability Record (Customer to Supplier)",
    formatNo: "F/SYS/14",
    // The page is on Rev 00; the master list gives revision 1 of 01.04.2025,
    // which was not supplied.
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "System / Management",
    module: "System / Management",
    section: "Traceability & Recall",
    frequency: "As Required",
    status: "Configured",
    description:
      "A traceability test from a dispatched product back to the supplier of its key raw material: the customer, the dispatch and its invoice, then every step back — the customer's order, the FG code, the sales and production orders, the key raw material's receipt (GRN and internal batch) and its supplier, the quantity issued, printed and returned, the QC inspection and what it scrapped, slitting and packing, the boxes, and who verified it. On file: the test of 12.12.2024 on 135,000 NS BP 1L labels dispatched to Aculife Healthcare / Nirma. The master list gives this format a revision 1 of 01.04.2025, which was not supplied; the page is on revision 00.",
    sourceFile: "F-SYS-14-Backward Traceability Record - Label- Aculife - Copy.pdf (2 pages, filled); the company's own original is XXXXX_Backward Traceability Record.docx",
    schedule: { type: "as-required" },
  },
  {
    id: "sys-forward-trace",
    kind: "log-sheet",
    name: "Forward Traceability Check List (Supplier to Customer)",
    formatNo: "F/SYS/15",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "System / Management",
    module: "System / Management",
    section: "Traceability & Recall",
    frequency: "As Required",
    status: "Configured",
    description:
      "A traceability test from a raw material received forward to the customers it went to: the supplier, the material, its invoice, internal batch, date of receipt and quantity, then each issue of it to production — the date, the quantity issued and printed, the slitted roll batch, the customer, the job, the production order, the quantity and date dispatched, the invoice and the balance left — and who verified it. On file: the test of 18.12.2024 on Avery PE Clear top coated VA4216NF, issued to a Nivea India front label. The master list gives this format a revision 1 of 01.04.2025, which was not supplied; the page is on revision 00.",
    sourceFile: "F-SYS-15-Forward Traceability Record - Label.pdf (filled); the company's own original is XXXXX_Forward Traceability Record.docx",
    schedule: { type: "as-required" },
  },
  {
    id: "sys-mock-recall",
    kind: "log-sheet",
    name: "Mock Product Withdrawal Record",
    formatNo: "F/SYS/13",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    department: "System / Management",
    module: "System / Management",
    section: "Traceability & Recall",
    frequency: "As Required",
    status: "Configured",
    description:
      "The test of the product withdrawal procedure, made for each product the plant makes — labels, shrink sleeves and pouches: when it started and ended and how long it took, the customer and the contact person, the product traced (FG code, production and sales orders, job, dispatch date, invoice and quantity) and the scenario considered, the customer's response, the product recall team, the percentage of product traced, whether the mock recall was effective and why. On file: the three withdrawals of 2025 — the label for Yates Steels (10.01.2025), the pouch for V P Bedekar (28.01.2025) and the sleeve for 3 Sisters (05.02.2025), each 100% traced.",
    sourceFile: "F-SYS-13-Mock Product Withdrawal record label.pdf, F-SYS-13-Mock Product Withdrawal record Pouch.pdf and F-SYS-13-Mock Product Withdrawal record label Sleeve.pdf (filled); the company's own original is F-SYS-13-Mock Product Withdrawal record.xlsx",
    // Yearly for each product (the management review of 21.07.2025) — three a
    // year, so each is made when due rather than on one calendar date; the
    // insights watch the twelve months for each product.
    schedule: { type: "as-required" },
  },

  // ---------------------------------------------------------------------
  // Marketing (REQUIREMENTS §77): the customer's own word on the plant's
  // product and service, and what the plant makes of it — one feedback form
  // per customer, one analysis of those forms per product and year, and one
  // trend analysis of the complaints per product and year, with its Pareto of
  // the causes. Layouts in data/seed/mktLayouts.ts, the supplied pages on file
  // in data/seed/mktRecords.ts. F/MKT/03 was not supplied; F/MKT/05 and 06 are
  // the customer complaint checklist and its acknowledgement, in the CAPA
  // module's External side, where the complaints themselves are handled.
  // ---------------------------------------------------------------------
  {
    id: "mkt-customer-feedback",
    kind: "log-sheet",
    name: "Customer Value added Feedback",
    formatNo: "F/MKT/01",
    revisionNo: "01",
    revisionDate: "2021-12-01",
    // The Marketing papers print the company's name in two words, "PRINT PACK", as the paper does.
    companyName: "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED",
    department: "Marketing",
    module: "Marketing",
    section: "Customer Feedback",
    frequency: "As Required",
    status: "Configured",
    description:
      "The feedback a customer gives on the plant's product and service: six attributes each rated from 5 Excellent to - 5 Poor — product quality, the condition of the packaging on receipt, delivery as required, the completeness of the documents (invoice, test certificate, packing list), the response to queries and the technical competency — the customer's comments and suggestions, the overall satisfaction level, whether they would work with the plant again, and their seal and sign. One form per customer, as and when it comes back. On file: Pidilite's feedback of 22.01.2025 on Tenax wraparound labels.",
    sourceFile: "F-MKT-01_Customer Feedback Form- Tenax.pdf (filled, as supplied)",
    schedule: { type: "as-required" },
  },
  {
    id: "mkt-feedback-analysis",
    kind: "log-sheet",
    name: "Customer Feedback analysis",
    formatNo: "F/MKT/02",
    revisionNo: "01",
    revisionDate: "2021-12-01",
    companyName: "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED",
    department: "Marketing",
    module: "Marketing",
    section: "Customer Feedback",
    frequency: "As Required",
    status: "Configured",
    description:
      "The year's customer feedback forms for one product, counted: how many customers gave each attribute each rating, and from those the Average Rating, the Ideal Rating and the Satisfied % of each attribute, the tallies of each rating, the product's % Satisfaction Index and any further action — the figures worked out here, never typed. One analysis per product for each evaluation period. On file: the analyses for 01.01.2025 to 31.12.2025 of LABELS (92%), POUCHES (89%) and SLEEVES (83%).",
    sourceFile:
      "F-MKT-02_Customer Feedback analysis - Labels-2026.pdf (filled, as supplied); the company's own workbooks are F-MKT-02_Customer Feedback analysis - Labels-2026.xlsx, F-MKT-02_Customer Feedback analysis - Pouches -2025.xlsx and F-MKT-02_Customer Feedback analysis - Sleeve-2025.xlsx",
    // One a year for each product, made when the year's forms are in rather
    // than on one calendar date (TBC 30).
    schedule: { type: "as-required" },
  },
  {
    id: "mkt-complaint-trend",
    kind: "log-sheet",
    name: "Customer Complaints Trend Analysis",
    formatNo: "F/MKT/04",
    revisionNo: "00",
    revisionDate: "2021-12-01",
    companyName: "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED",
    department: "Marketing",
    module: "Marketing",
    section: "Customer Complaints",
    frequency: "As Required",
    status: "Configured",
    description:
      "The customer complaints of one product: how many each year since December 2021 and how many each month of the calendar year, with the bar chart of the years, and the Pareto analysis of their causes — each cause's defects, its cumulative percentage against the 80% cut-off, the Vital Few within it and the Useful Many after it — drawn from the figures as the paper draws it. One a year for each product. On file: the 2025 analyses of LABELS, SHRINK SLEEVE and LAMINATED POUCH, with their Paretos of the complaints to January 2026.",
    sourceFile:
      "F-MKT-04_Complaint trend analysis(R-2026)-Label.pdf, F-MKT-04_Complaint trend analysis(R-2026) SHRINK SLEEVE.pdf, F-MKT-04_Complaint trend analysis(R-2026) Pouch.pdf, F-MKT-04_Complaint trend analysis(R-2026) LABELS.pdf, F-MKT-04_Complaint trend analysis(R-2026) Sleeve.pdf and F-MKT-04_Complaint trend analysis(R-2026) POUCHES.pdf (as supplied); the company's own workbook is F-MKT-04_Complaint trend analysis(R-2026).xls",
    // One a year for each product (TBC 30).
    schedule: { type: "as-required" },
  },
];
