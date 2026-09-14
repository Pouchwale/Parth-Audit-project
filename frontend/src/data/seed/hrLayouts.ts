import type { LogColumn, LogSheetLayout } from "../../types";

// THE HUMAN RESOURCES FORMATS — sixteen of the company's F/HR/… formats,
// supplied as PDFs on 14-Sep-2026 and reproduced here as log-sheet layouts
// (types/logSheet.ts): the header fields printed above the grid, the grid's
// columns with their types, how rows come about (a fixed printed list, or
// lines added as people are entered), the reference material printed on the
// form, and — for the assistant — what a typical filled line looks like.
//
// Every label is the paper's own wording, spelling included ("Insection",
// "callibration", "Gramms"-style spellings are the company's and are kept).
// Nothing is added to a controlled format; where the paper prints a table the
// system never fills (the mobile-usage designation matrix, the evaluation
// criteria, the induction topics), it is carried as a reference table.
//
// Where the digital form differs from the paper, it says so beside the layout.
// REQUIREMENTS §46.

const FORMAT_DATE = "01.12.2021";

// A roster register (competence, skill matrix, inductions, TNI, mobile
// authorisations) is carried forward whole into its next issue — every
// line of the previous register, not the two or three "typical" lines a
// daily log sheet starts from (engine/autoFill.ts slices to typicalRows).
const ROSTER = 500;

const yesNo = (key: string, label: string, width = 70): LogColumn => ({ key, label, type: "yesno", width });
const text = (key: string, label: string, width?: number, required = false): LogColumn => ({ key, label, type: "text", width, required });
const fixedText = (key: string, label: string, width?: number): LogColumn => ({ key, label, type: "text", fixed: true, width });

/** A fixed-row list where the printed item text sits in the `parameter` column. */
const items = (list: string[]): Record<string, string | number | null>[] => list.map((parameter) => ({ parameter }));

// ---------------------------------------------------------------------------
// F/HR/01 — PERSONAL COMPETENCE RECORDS (STAFF MEMBERS ONLY)

const competence: LogSheetLayout = {
  documentId: "hr-competence",
  instructions: [
    "PERSONAL COMPETENCE RECORDS (STAFF MEMBERS ONLY) — one line per staff member: the education and experience the position requires against what the person holds, with the justification for any gap.",
    "Dates are written as on the register (dd.mm.yyyy or m/d/yyyy as entered); a Date of Leaving is filled in only when the person has left.",
  ],
  headerFields: [{ key: "reviewedOn", label: "Reviewed as on", type: "text", width: 160, autoFill: { carryForward: true } }],
  columns: [
    text("name", "Name of person", 180, true),
    text("department", "Department", 150),
    text("designation", "Designation", 160),
    text("eduRequired", "Education — Required", 110),
    text("eduAvailable", "Education — Available", 130),
    text("expRequired", "Experience (in year) — Required", 100),
    text("expAvailable", "Experience (in year) — Available", 100),
    text("gapJustification", "Justification for gaps if any", 110),
    text("dateOfJoining", "Date of Joining", 110),
    text("dateOfLeaving", "Date of Leaving", 110),
  ],
  rowMode: { kind: "free", minRows: 1, typicalRows: ROSTER },
  specimenHeader: { reviewedOn: "01.10.2026" },
  specimenRows: [
    { name: "Shail Patel", department: "Top management", designation: "CEO", eduRequired: "Graduate", eduAvailable: "BE", expRequired: "NA", expAvailable: "7 Years", gapJustification: "NA", dateOfJoining: "01.04.2014", dateOfLeaving: "" },
    { name: "Swarup Rajgor", department: "Sales & Marketing", designation: "Director", eduRequired: "Graduate", eduAvailable: "B.A.", expRequired: "5 Years", expAvailable: "5 Years", gapJustification: "NA", dateOfJoining: "04.03.2017", dateOfLeaving: "" },
  ],
  specimenSource: "F-HR-01_Personal Competence record (R-2023).pdf — F/HR/01 (00/01.12.2021), reviewed as on 01.10.2026",
};

// ---------------------------------------------------------------------------
// F/HR/03 — SKILL MATRIX - OPERATOR

export const SKILL_OPERATIONS: { key: string; label: string }[] = [
  { key: "printing", label: "Printing" },
  { key: "pasting", label: "Pasting" },
  { key: "bundling", label: "Bundling" },
  { key: "sheetCutting", label: "Sheet Cutting" },
  { key: "lamination", label: "Lamination" },
  { key: "punching", label: "Punching" },
  { key: "pouchingMachine", label: "Pouching Machine" },
  { key: "qcMachine", label: "QC Inspection machine" },
  { key: "qcManual", label: "QC inspection - Manual" },
  { key: "slitting", label: "Slitting / Trimming" },
  { key: "sleeveCutting", label: "Shrink Sleeve - Cutting" },
  { key: "sleeveGluing", label: "Shrink Sleeve - Gluing" },
  { key: "offlinePunching", label: "Off-line Punching" },
  { key: "ipqc", label: "IPQC Testing" },
];

const skillMatrix: LogSheetLayout = {
  documentId: "hr-skill-matrix",
  instructions: [
    "SKILL MATRIX - OPERATOR. One line per operator; the points under each operation are the operator's skill status for it, graded as printed on the form (5 = S, 3 = SS, 1 = US).",
  ],
  headerFields: [{ key: "statusAsOn", label: "Status as on", type: "text", width: 160, autoFill: { carryForward: true } }],
  columns: [
    text("name", "Name", 200, true),
    text("designation", "Designation (Operator)", 190),
    text("dateOfJoining", "Date of Joining", 110),
    ...SKILL_OPERATIONS.map(({ key, label }): LogColumn => ({ key, label, type: "select", options: ["5", "3", "1"], width: 78 })),
    text("remarks", "Remarks / Status of Skill up-gradation or change", 170),
  ],
  rowMode: { kind: "free", minRows: 1, typicalRows: ROSTER },
  referenceTables: [
    {
      title: "Points / Grade / Skill Status",
      columns: ["Points", "Grade", "Skill Status"],
      rows: [
        ["5", "S", "Can operate individually"],
        ["3", "SS", "Can operate under supervision"],
        ["1", "US", "Can not operate"],
      ],
    },
  ],
  specimenHeader: { statusAsOn: "01.09.2026" },
  specimenRows: [
    { name: "Karan Kalusinh Bariya", designation: "Printing", dateOfJoining: "5/13/2008", printing: "5", remarks: "" },
    { name: "Gita Jayntibhai Nayi", designation: "QC", dateOfJoining: "6/6/2014", qcManual: "5", remarks: "" },
  ],
  specimenSource: "F-HR-03_Operator skill matr3ix-2023.pdf — F/HR/03 (00/01.12.2021), status as on 01.09.2026",
};

// ---------------------------------------------------------------------------
// F/HR/04 — PRE – EMPLOYMENT MEDICAL HEALTH DECLARATION

const PRE_EMPLOYMENT_QUESTIONS = [
  "01. Have you suffered from any of the following – Typhoid fever, paratyphoid fever? If yes, please give details:",
  "02. Have you suffered recently or repeatedly from infections of the hands, fingers, ears, mouth, throat? If yes, please give details",
  "03. Have you sought medical advice for any of the following in the last 12 months – Persistent Diarrhea, Vomiting or Enteritis? If yes, please give details:",
  "04. Have you ever had food poisoning or gastroenteritis? If yes, please give details:",
  "05. Do you suffer from any skin complaint, e.g. Eczema, Psoriasis, Acne? If yes, please give details:",
  "06. Have you ever had any of the following? — Chest trouble e.g. Bronchitis, T.B. Asthma, Shortness of breath",
  "06. — Diabetes",
  "06. — Back/ neck trouble (slipped disc, sciatica)",
  "06. — Hepatitis/ jaundice",
  "06. — Recurring migraines/headaches epilepsy",
  "06. — Heart trouble",
  "06. — Rupture/hernia",
  "06. — Kidney or bladder trouble",
  "06. — High blood pressure",
  "06. — Tetanus immunization",
  "06. — Painful joints e.g. shoulders elbows, wrists, hands, knees, elbow",
  "06. — COVID19 infection",
  "07. Do you suffer from any foot condition preventing the wearing of protective footwear? If yes, please give details:",
  "08. Do you have any problems standing, climbing stairs, working at heights, lifting or carrying? If yes, please give details:",
  "09. Have you been referred to a specialist within the last 5 years, or been admitted into hospital? If yes, please give details:",
  "10. Is there a family history of Diabetes, heart, lung or any hereditary disease etc? If yes, please give details:",
];

const preEmployment: LogSheetLayout = {
  documentId: "hr-pre-employment-health",
  instructions: [
    "Only to be completed by applicants prior to employment.",
    "MEDICAL INFORMATION SUPPLIED WILL BE TREATED AS PRIVATE AND CONFIDENTIAL AND WILL NOT BE DISCLOSED TO THIRD PARTIES.",
    "I declare that I have had no other disorder, mental or physical, not already mentioned. I understand that is any of the information is incorrect or there is any other omission that I may become liable to dismissal.",
    "Question 06 is a set of tick boxes on the paper; each condition is one line here, ticked Yes where it applies.",
  ],
  headerFields: [
    // The sample fill names the person who handles the form (the HR & Admin
    // manager, via documentRoleKeywords) rather than inventing an applicant.
    { key: "name", label: "Name", type: "text", required: true, autoFill: { sign: true } },
    { key: "deptDesignation", label: "Department & Designation", type: "text", autoFill: { carryForward: true } },
    { key: "sex", label: "Sex", type: "select", options: ["Male", "Female"], autoFill: { carryForward: true } },
    { key: "dateOfBirth", label: "Date of Birth", type: "date" },
  ],
  columns: [fixedText("parameter", "Question", 420), yesNo("answer", "YES / NO", 90), text("details", "Details (if yes)", 220)],
  rowMode: { kind: "fixedRows", rows: items(PRE_EMPLOYMENT_QUESTIONS) },
  footerFields: [
    { key: "signature", label: "Signature", type: "text" },
    { key: "signDate", label: "Date", type: "date" },
  ],
  specimenHeader: { name: "", deptDesignation: "HR & Admin – Manager", sex: "Male", dateOfBirth: "" },
  specimenRows: PRE_EMPLOYMENT_QUESTIONS.map(() => ({ answer: "No", details: "" })),
  specimenSource: "F-HR-04_Pre Employment Health declaration.pdf — F/HR/04 (00/01.12.2021), blank format",
};

// ---------------------------------------------------------------------------
// F/HR/05 — INDUCTION TRAINING RECORD (NEW EMPLOYEE – STAFF CATEGORY: SUPERVISOR & ABOVE)

const inductionStaff: LogSheetLayout = {
  documentId: "hr-induction-staff",
  instructions: ["Induction programme for a new employee in the staff category (Supervisor & above). One record per person."],
  headerFields: [
    { key: "name", label: "Name", type: "text", required: true, autoFill: { sign: true } },
    { key: "deptProcess", label: "Department / Process", type: "text", autoFill: { carryForward: true } },
    { key: "designation", label: "Designation", type: "text", autoFill: { carryForward: true } },
    { key: "dateOfJoining", label: "Date of Joining", type: "date", autoFill: { carryForward: true } },
  ],
  columns: [
    fixedText("parameter", "Training Topics", 300),
    fixedText("responsibility", "Responsibility", 150),
    { key: "plannedDate", label: "Planned Date", type: "date", width: 130 },
    text("actualDate", "Actual date & Initial sign", 170),
  ],
  rowMode: {
    kind: "fixedRows",
    rows: [
      { parameter: "1. Briefing on Company profile – Plant, Products, Production process etc.", responsibility: "Manager - QC" },
      { parameter: "2. Good Manufacturing Practice - Pest Control - Waste Management - Personal hygiene", responsibility: "Manager - QC" },
      { parameter: "3. Quality & Product safety related all policies", responsibility: "PSTL" },
      { parameter: "4. Basic HARA Principal awareness (Self-study) & CCP monitoring – if HACCP team members", responsibility: "PSTL" },
      { parameter: "5. Fire safety precautions", responsibility: "Manager – HR & admin" },
    ],
  },
  footerFields: [
    { key: "hrManagerSign", label: "Manager – HR and Admin", type: "text" },
    { key: "employeeSign", label: "Employee Sign", type: "text" },
  ],
  // The Manager – HR & Admin (F/HR/01: HR & Admin, Manager, joined 05.07.2024) is
  // who the sample fill names, so the specimen header is his line.
  specimenHeader: { name: "", deptProcess: "HR & Admin", designation: "Manager", dateOfJoining: "2024-07-05" },
  specimenSource: "F-HR-05_Induction Training  programme-Staff.pdf — F/HR/05 (00/01.12.2021), blank format",
};

// ---------------------------------------------------------------------------
// F/HR/06 — INDUCTION TRAINING RECORD (operators / workers)

export const INDUCTION_TOPICS: string[][] = [
  ["Brief about Organization", "Head – HR& Admin"],
  ["Brief about functional responsibility (Product / Manufacturing process / CCP if applicable)", "Department - HOD"],
  ["GMP Practices, Product safety Incident scenario, Site security & Usage of PPEs", "Head – HR & Admin"],
  ["Quality & Product safety policy including PRP Policies", "Head – HR & Admin"],
  ["Fire safety precautions", "Head – HR & Admin"],
  ["COVID19 Protocol & Precautions", "Head – HR & Admin"],
];

const inductionOperators: LogSheetLayout = {
  documentId: "hr-induction-operators",
  instructions: ["INDUCTION TRAINING RECORD — the register of operators and workers inducted, one line per person, against the training topics printed on the form."],
  headerFields: [],
  columns: [
    text("name", "Name of the Operator / EMP", 190, true),
    text("joining", "Joining department & designation", 190),
    text("dateOfJoiningInduction", "Date of Joining & Induction Training", 150),
    text("signHod", "Sign – Department HOD", 130),
    text("signHeadHr", "Sign – Head HR & Admin", 130),
    text("signOperator", "Sign Operator / Worker / manager", 150),
  ],
  rowMode: { kind: "free", minRows: 1, typicalRows: ROSTER },
  referenceTables: [{ title: "Training Topics / Responsibility", columns: ["Training Topics", "Responsibility"], rows: INDUCTION_TOPICS }],
  specimenRows: [
    { name: "Azaz Bharach", joining: "POUCH-Manager", dateOfJoiningInduction: "01/06/2025", signHod: "", signHeadHr: "", signOperator: "" },
    { name: "Azad Popatlal Patel", joining: "OPERATOR- POUCH", dateOfJoiningInduction: "01/07/2025", signHod: "", signHeadHr: "", signOperator: "" },
  ],
  specimenSource: "F-HR-06_Induction Training  programme -Operators.pdf — F/HR/06 (00/01.12.2021), 28 inductions Jun-2025 to Jan-2026",
};

// ---------------------------------------------------------------------------
// F/HR/07 — JOB RESPONSIBILITY & AUTHORITY

const jobResponsibility: LogSheetLayout = {
  documentId: "hr-job-responsibility",
  instructions: [
    "JOB RESPONSIBILITY & AUTHORITY — one record per position. Each line of the grid is one responsibility or authority, in the order printed.",
    "Acknowledgement: I Acknowledge Receipt of This Job Description and I Understand My Position Responsibility and Authorities.",
  ],
  headerFields: [
    { key: "position", label: "Position", type: "text", required: true, autoFill: { carryForward: true } },
    { key: "reportsTo", label: "Reports to", type: "text", required: true, autoFill: { carryForward: true } },
  ],
  columns: [text("responsibility", "Responsibility / Authority", 700, true)],
  rowMode: { kind: "free", minRows: 1, typicalRows: 20 },
  footerFields: [
    { key: "delegationAuthorities", label: "Delegation of Duties During Absence — Authorities", type: "text", autoFill: { carryForward: true } },
    { key: "delegationResponsibilities", label: "Delegation of Duties During Absence — Responsibilities", type: "text", autoFill: { carryForward: true } },
    { key: "minQualification", label: "Minimum Qualification and Experience Requirements", type: "text", autoFill: { default: "As Per Employees Competence Chart" } },
    { key: "employeeSignature", label: "Signature of Employee", type: "text" },
    { key: "signDate", label: "Date", type: "date" },
  ],
  specimenHeader: { position: "Executive-Lab", reportsTo: "Manager-QA", delegationAuthorities: "Manager QA", delegationResponsibilities: "Quality Supervisior", minQualification: "As Per Employees Competence Chart" },
  specimenRows: [
    { responsibility: "Responsible for carrying out inspection & testing of (RM, PM & Finish products) as per Quality Plan" },
    { responsibility: "Responsible for identification & calibration of inspection, measuring & testing equipment's." },
    { responsibility: "Retention of lot samples for all lots dispatched as per defined period" },
    { responsibility: "Preparation of Shade card" },
  ],
  specimenSource: "F-HR-07_Job responsibility & authorities (two PDFs, nine position sheets) — F/HR/07 (00/01.12.2021)",
};

// ---------------------------------------------------------------------------
// F/HR/08 — EMPLOYEE WISE TRAINING NEED IDENTIFICATION RECORD

export const TRAINING_TOPICS: { key: string; label: string }[] = [
  { key: "t01", label: "BRCGS - Packaging (Issue 07) Awareness" },
  { key: "t02", label: "Product safety Incidents" },
  { key: "t03", label: "Site Security" },
  { key: "t04", label: "HARA Principles" },
  { key: "t05", label: "GMP Principles" },
  { key: "t06", label: "Awareness on process monitoring & process control" },
  { key: "t07", label: "Allergen Policy & Whistle Blower Policy awareness" },
  { key: "t08", label: "Product safety Culture" },
  { key: "t09", label: "Handling & Storage of materials" },
  { key: "t10", label: "Housekeeping & Handling of cleaning chemicals" },
  { key: "t11", label: "Pest control monitoring" },
  { key: "t12", label: "CCP monitoring" },
  { key: "t13", label: "Quality & Product safety Policy + PRP Policies including Laundry Policy" },
  { key: "t14", label: "TACCP" },
  { key: "t15", label: "VACCP" },
  { key: "t16", label: "Print Packaging" },
  { key: "t17", label: "Testing method & callibration of intruments" },
];

const trainingNeeds: LogSheetLayout = {
  documentId: "hr-training-needs",
  instructions: [
    "EMPLOYEE WISE TRAINING NEED IDENTIFICATION RECORD — one line per employee; Yes under a topic is the X on the paper.",
  ],
  headerFields: [{ key: "period", label: "Period", type: "text", autoFill: { default: "01.04.2026 ~ 31.03.2027" }, width: 220 }],
  columns: [text("name", "Employee Name", 200, true), text("designation", "Designation", 190), ...TRAINING_TOPICS.map(({ key, label }) => yesNo(key, label, 90))],
  rowMode: { kind: "free", minRows: 1, typicalRows: ROSTER },
  specimenHeader: { period: "01.04.2026 ~ 31.03.2027" },
  specimenRows: [
    { name: "Shail Patel", designation: "CEO" },
    { name: "Vinay Bhojak", designation: "Manager - HR" },
  ],
  specimenSource: "F-HR-08_Employee wise Training need identification Record(2024-25).pdf — F/HR/08 (00/01.12.2021), period 01.04.2026 ~ 31.03.2027, 154 employees",
};

// ---------------------------------------------------------------------------
// F/HR/09 — Training Plan Calender

export const CALENDAR_MONTHS = ["Apr-26", "May-26", "Jun-26", "Jul-26", "Aug-26", "Sep-26", "Oct-26", "Nov-26", "Dec-26", "Jan-27", "Feb-27", "Mar-27"];

const calendarColumns: LogColumn[] = [
  fixedText("parameter", "Topics", 230),
  fixedText("source", "Source of Training", 150),
  fixedText("method", "Method of Training", 110),
  fixedText("duration", "Training duration", 90),
  fixedText("evaluation", "Method of Evaluation", 140),
];
for (let i = 0; i < CALENDAR_MONTHS.length; i++) {
  calendarColumns.push(yesNo(`m${i}Plan`, `${CALENDAR_MONTHS[i]} — Plan`, 80));
  calendarColumns.push(text(`m${i}Actual`, `${CALENDAR_MONTHS[i]} — Actual`, 95));
}

export interface CalendarTopic {
  topic: string;
  source: string;
  method: string;
  duration: string;
  evaluation: string;
  /** month index (Apr-26 = 0) -> actual date as written, or "" for a planned month not yet held */
  plan: Record<number, string>;
}

// Transcribed from the two pages of the calendar; a month is Planned where the
// paper prints X and Actual is the date written under it, as written.
export const CALENDAR_TOPICS: CalendarTopic[] = [
  { topic: "BRCGS - Packaging (Issue 07)Awareness", source: "External (Shashank Sheth)", method: "Class room", duration: "16 hours", evaluation: "Written Test", plan: { 3: "7/22/2026", 10: "2/4/2027" } },
  { topic: "Product safety Incidents", source: "External (Shashank Sheth)", method: "Class room", duration: "2 hour", evaluation: "Discussion", plan: { 1: "5/25/2026", 9: "1/8/2027" } },
  { topic: "Site Security", source: "External (Shashank Sheth)", method: "Class room", duration: "1 hour", evaluation: "Discussion", plan: { 3: "7/21/2026", 9: "1/8/2027" } },
  { topic: "HARA Principles", source: "External (Shashank Sheth)", method: "Class room", duration: "16 hours", evaluation: "Written Test", plan: { 5: "9/18/2026" } },
  { topic: "GMP Principles", source: "Kapila Barad(PSTL)", method: "Class room", duration: "1 hour", evaluation: "Written Test", plan: { 0: "4/9/2026", 5: "9/19/2026", 10: "2/5/2027" } },
  { topic: "Housekeeping & Handling of cleaning chemicals", source: "Kapila Barad(PSTL & In charge - Housekeeping)", method: "On the Job", duration: "2 hours", evaluation: "On the Job observation", plan: { 5: "9/19/2026" } },
  { topic: "Awareness on process monitoring & process control parameters for Flexo printing", source: "Ajay Vaghela (Flexo Manager)", method: "On the Job", duration: "3 hours", evaluation: "On the Job observation", plan: { 3: "7/24/2026", 9: "1/27/2027" } },
  { topic: "Pest control monitoring", source: "External (Rohit Patel)", method: "On the Job + Class room", duration: "2 hours", evaluation: "On the Job observation", plan: { 6: "10/3/2026", 9: "1/10/2027" } },
  { topic: "CCP monitoring", source: "Ajay Vaghela (Flexo Manager)", method: "On the Job", duration: "1 hour", evaluation: "On the Job observation", plan: { 1: "5/25/2026", 4: "", 7: "11/30/2026", 9: "1/10/2027" } },
  { topic: "Quality & Product safety Policy + PRP Policies", source: "Kapila Barad(PSTL)", method: "Class room", duration: "TO BE CONFIRMED", evaluation: "Discussion", plan: { 3: "7/21/2026", 9: "1/10/2027" } },
  { topic: "Awareness of Laundry policy (Laundry procedure)", source: "Kapila Barad(PSTL)", method: "Class room", duration: "1 hour", evaluation: "Discussion", plan: { 3: "7/21/2026", 9: "1/10/2027" } },
  { topic: "TACCP Awareness", source: "External (Shashank Sheth)", method: "Class room", duration: "4 hours", evaluation: "Discussion", plan: { 3: "7/18/2026", 9: "1/12/2027" } },
  { topic: "VACCP Awareness", source: "External (Shashank Sheth)", method: "Class room", duration: "4 hours", evaluation: "Discussion", plan: { 3: "7/18/2026", 9: "1/12/2027" } },
  { topic: "Product Safety Culture", source: "External (Shashank Sheth)", method: "Class room", duration: "2 hours", evaluation: "Discussion", plan: { 0: "4/18/2026", 9: "1/12/2027" } },
  { topic: "Handling & Storage of materials", source: "External (Shashank Sheth)", method: "On the Job", duration: "2 hours", evaluation: "On the Job observation", plan: { 4: "8/19/2026" } },
  { topic: "Allergen Policy & Whistle Blower Policy awareness", source: "External (Shashank Sheth)", method: "On the Job", duration: "2 hours", evaluation: "On the Job observation", plan: { 4: "8/19/2026", 9: "1/12/2027" } },
  { topic: "Print Packaging", source: "Ajay Vaghela (Flexo Manager)", method: "On the Job", duration: "2 hours", evaluation: "Discussion", plan: { 10: "2/5/2027" } },
  { topic: "Print Packaging", source: "Vishnu Jadhav (Pouching Head)", method: "On the Job", duration: "2 hours", evaluation: "Discussion", plan: { 10: "2/5/2027" } },
  { topic: "Testing Method & callibration of Instruments", source: "Kapila Barad(PSTL)", method: "On the Job", duration: "2 hours", evaluation: "Discussion", plan: { 10: "2/13/2027" } },
];

/** One calendar row, fixed columns plus the Plan / Actual cells of every month. */
export function calendarRow(t: CalendarTopic): Record<string, string | number | null> {
  const row: Record<string, string | number | null> = { parameter: t.topic, source: t.source, method: t.method, duration: t.duration, evaluation: t.evaluation };
  for (let i = 0; i < CALENDAR_MONTHS.length; i++) {
    const planned = i in t.plan;
    row[`m${i}Plan`] = planned ? "Yes" : "";
    row[`m${i}Actual`] = planned ? t.plan[i] : "";
  }
  return row;
}

const trainingCalendar: LogSheetLayout = {
  documentId: "hr-training-calendar",
  instructions: [
    "Training Plan Calender (01.04.2026 ~ 31.03.2027) (Rev. 00 / 07.03.2022). For every topic and month: Plan — Yes where the paper prints X; Actual — the date the training was held, as written.",
    "The training duration of topic 10 is not legible on the supplied copy and is marked TO BE CONFIRMED.",
  ],
  headerFields: [{ key: "period", label: "Training Plan Calender", type: "text", autoFill: { default: "01.04.2026 ~ 31.03.2027" }, width: 260 }],
  columns: calendarColumns,
  rowMode: {
    kind: "fixedRows",
    rows: CALENDAR_TOPICS.map((t) => ({ parameter: t.topic, source: t.source, method: t.method, duration: t.duration, evaluation: t.evaluation })),
  },
  specimenHeader: { period: "01.04.2026 ~ 31.03.2027" },
  specimenRows: CALENDAR_TOPICS.map(calendarRow),
  specimenSource: "F-HR-09_Training Calender(2026-27).pdf — F/HR/09 (00/01.12.2021), two pages, nineteen topics",
};

// ---------------------------------------------------------------------------
// F/HR/11 — TRAINING EFFECTIVENESS EVALUATION RECORD

const GRADES = ["Excellent", "Very Good", "Good", "Average", "Poor"];
const BENEFIT = ["Yes, very much", "Partly", "No, not at all"];

const trainingEffectiveness: LogSheetLayout = {
  documentId: "hr-training-effectiveness",
  instructions: [
    "TRAINER'S EVALUATION BY TRAINEE — on a scale of 1 to 10 (1 being the worst, 10 being the best), how you would rate this workshop; then the general evaluation of the trainer.",
    "Page 2, TRAINEE'S EVALUATION BY – TRAINER / REPORTING OFFICER, is below the grid: this evaluation may be done after a specified period of time, when the knowledge / skill acquired by the trainee after this training program could be assessed by his Superior as getting utilized beneficially for his/her day to day activity or specialized work in his/her department / function.",
  ],
  headerFields: [
    // Sample fill: the Training Coordinator as trainee, at the external BRCGS
    // awareness session the 2026-27 calendar holds on 22-Jul-2026.
    { key: "traineeName", label: "Trainee's Name", type: "text", required: true, autoFill: { sign: true } },
    { key: "department", label: "Department", type: "text", autoFill: { carryForward: true } },
    { key: "designation", label: "Designation", type: "text", autoFill: { carryForward: true } },
    { key: "trainingDate", label: "Date of Training", type: "date", autoFill: { carryForward: true } },
    { key: "trainingTopic", label: "Training Topic", type: "text", autoFill: { carryForward: true } },
    { key: "trainerName", label: "Trainer's name", type: "text", autoFill: { carryForward: true } },
  ],
  columns: [
    fixedText("parameter", "Evaluation", 320),
    { key: "rating", label: "Rating (1 to 10)", type: "select", options: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"], width: 110 },
    { key: "grade", label: "General evaluation of Trainer", type: "select", options: GRADES, width: 150 },
  ],
  rowMode: {
    kind: "fixedRows",
    rows: items(["a  Structure", "b  Methodology used", "c  Content", "d  Delivery", "e  Interaction among participants", "Knew the subject", "Maintained your interest", "Encouraged you to talk and ask questions"]),
  },
  footerFields: [
    { key: "evalDate", label: "Date of Evaluation", type: "date" },
    { key: "evalMethod", label: "Method of evaluation (Attached exam sheet for Written test)", type: "select", options: ["Interview", "On the Job observation", "Written test"] },
    { key: "evalOfficer", label: "Evaluation officer name", type: "text" },
    { key: "benefited", label: "Has the trainee been benefited in terms of his knowledge / skill acquired by this training program?", type: "select", options: BENEFIT },
    { key: "utilized", label: "If yes, has the trainee been able to beneficially utilize his/her knowledge / skill acquired on the subject gained in his/her day to day/ specialized work well?", type: "select", options: BENEFIT },
    { key: "furtherTraining", label: "If no, do you feel the trainee needs any further training on any aspect to fully understand the subject / utilize his/her knowledge / skill acquired?", type: "select", options: BENEFIT },
    { key: "furtherTrainingDetail", label: "If yes, then what further training do you identify, please mention below", type: "text" },
    { key: "hodComments", label: "HOD's comments if any", type: "text" },
  ],
  specimenHeader: { traineeName: "", department: "QC", designation: "Manager - QA", trainingDate: "2026-07-22", trainingTopic: "BRCGS - Packaging (Issue 07) Awareness", trainerName: "Shashank Sheth (External)" },
  specimenRows: [
    { rating: "9", grade: "" },
    { rating: "8", grade: "" },
    { rating: "9", grade: "" },
    { rating: "9", grade: "" },
    { rating: "8", grade: "" },
    { rating: "", grade: "Excellent" },
    { rating: "", grade: "Very Good" },
    { rating: "", grade: "Excellent" },
  ],
  specimenSource: "F-HR-11_Trainging Evaluation sheet.pdf — F/HR/11 (00/01.12.2021), blank two-page format",
};

// ---------------------------------------------------------------------------
// F/HR/12 — TRAINING FEEDBACK & EVALUATION RECORD

const trainingFeedback: LogSheetLayout = {
  documentId: "hr-training-feedback",
  instructions: ["TRAINING FEEDBACK & EVALUATION RECORD — one line per employee who attended: has the employee grasped & adopted knowledge/skill of the topic? (rated 0 to 3), and does the employee need additional training on the subject?"],
  headerFields: [
    { key: "trainingDate", label: "Date of the Training", type: "date", autoFill: { carryForward: true } },
    { key: "topic", label: "Topic of the Training", type: "text", autoFill: { carryForward: true } },
    { key: "impartedBy", label: "Training Imparted by", type: "text", autoFill: { carryForward: true } },
    { key: "duration", label: "Duration of The training", type: "text", autoFill: { carryForward: true } },
  ],
  columns: [
    text("name", "Name of the Employee", 200, true),
    { key: "rating", label: "Has the employee grasped & adopted knowledge/skill of the topic? (Please rate from 0 to 3)", type: "select", options: ["0", "1", "2", "3"], width: 110 },
    yesNo("additionalTraining", "Does the employee need additional training on the subject?", 110),
    text("remarks", "Remarks", 200),
  ],
  rowMode: { kind: "free", minRows: 1, typicalRows: 5 },
  referenceTables: [
    {
      title: "Evaluation criteria",
      columns: ["Evaluation criteria", "Rating", "Re-training required"],
      rows: [
        ["Found not useful", "0", "Yes"],
        ["Helped to create some awareness", "1", "Yes"],
        ["Participation improved in day to day working", "2", "No"],
        ["Performance improved to satisfactory level", "3", "No"],
      ],
    },
  ],
  footerFields: [
    { key: "evaluatedBy", label: "Evaluated By", type: "text" },
    { key: "evalDate", label: "Date", type: "date" },
  ],
  // Sample fill: the external BRCGS awareness session of the 2026-27 calendar
  // (22-Jul-2026, Shashank Sheth, 16 hours) with staff from the TNI list.
  specimenHeader: { trainingDate: "2026-07-22", topic: "BRCGS - Packaging (Issue 07) Awareness", impartedBy: "External (Shashank Sheth)", duration: "16 hours" },
  specimenRows: [
    { name: "Kapila Barad", rating: "3", additionalTraining: "No", remarks: "" },
    { name: "Ajay Vaghela", rating: "3", additionalTraining: "No", remarks: "" },
    { name: "Vinay Bhojak", rating: "2", additionalTraining: "No", remarks: "" },
    { name: "Roshni Senma", rating: "3", additionalTraining: "No", remarks: "" },
    { name: "Mukesh Patel", rating: "2", additionalTraining: "No", remarks: "" },
  ],
  specimenSource: "F-HR-12_Training Feedback & Evaluation Record (1).pdf — F/HR/12 (00/01.12.2021), blank format",
};

// ---------------------------------------------------------------------------
// F/HR/13 — Authorization for Mobile usage in Plant area

const MOBILE_DEPARTMENTS = ["CEO", "HR & ADMIN", "FLEXO – PROD.", "STORE", "PURCHASE", "SALES & MKTG.", "DISPATCH", "QC", "MAINT", "PPC/MIS", "Pouch & Laminates"];

const mobileAuthorization: LogSheetLayout = {
  documentId: "hr-mobile-authorization",
  instructions: [
    "Following personnel are authorized to carry & use mobile handset inside the plant area due to nature of the process (Continuous processing) & product & its criticality. However, it's each individual responsibility to ensure the integrity of mobile handset for any breakage or missed out. If any breakage or crack found, Pl follow Glass policy & report immediately to PSTL / Deputy PSTL or Plant head for further action.",
  ],
  headerFields: [],
  columns: [
    text("name", "Employee Name", 200, true),
    text("deptDesignation", "Department & Designation", 220),
    text("signature", "Signature of employee", 140),
    text("dateOfAllowance", "Date of allowance", 120),
    text("authorizedBy", "Authorized by PSTL", 140),
  ],
  rowMode: { kind: "free", minRows: 1, typicalRows: ROSTER },
  referenceTables: [
    {
      title: "List of Department wise & Designation wise Personnel allowed for Mobile usage inside plant",
      columns: ["Designation", ...MOBILE_DEPARTMENTS],
      rows: [
        ["CEO", "X", "", "", "", "", "", "", "", "", "", ""],
        ["DIRECTOR", "", "", "", "", "", "X", "", "", "", "", ""],
        ["MANAGER", "", "X", "X", "X", "X", "X", "X", "X", "X", "X", "X"],
        ["INK INCHARGE", "", "", "X", "", "", "", "", "", "", "", ""],
        ["SUPERVISOR", "", "", "X", "", "", "", "", "", "X", "", ""],
        ["COORDINATOR", "", "", "", "", "", "X", "", "", "", "", ""],
        ["LAB EXECUTIVE", "", "", "", "", "", "", "", "X", "", "", ""],
        ["DESIGNER", "", "", "", "", "", "", "", "", "", "X", ""],
      ],
    },
  ],
  specimenRows: [
    { name: "Shail Patel", deptDesignation: "CEO", signature: "", dateOfAllowance: "01/12/2021", authorizedBy: "" },
    { name: "Virat Rajgor", deptDesignation: "Director - Operation", signature: "", dateOfAllowance: "01/12/2021", authorizedBy: "" },
  ],
  specimenSource: "F-HR-13_Authorization for Mobile inside Plant.pdf — F/HR/13 (00/01.12.2021), 37 authorisations",
};

// ---------------------------------------------------------------------------
// F/HR/14 — Visitor Health Status Declaration Record

const VISITOR_QUESTIONS = [
  "Sickness such as – Diarrhoea, vomiting, Ear, nose or throat, Typhoid, Jaundice, Parasitic infection infections",
  "Any cut or wound or body injury",
  "Do you suffer from Fever, Cold, Cough, throat infections",
  "Do you have difficulty in breathing",
  "Have you travelled in last 15 days to containment area / location",
  "Have you come in contact with the people having COVID19",
  "Have you been infected with COVID19 in past",
  "Have you been staying with the people having COVID19",
  "Body temperature (To be mentioned as actual by Security guard)",
];

const visitorHealth: LogSheetLayout = {
  documentId: "hr-visitor-health",
  instructions: [
    "To be completed by all visitors entering the factory irrespective of the area intend to visit.",
    "IF VISITOR/CONTRACTOR ANSWERS YES TO ANY OF THE QUESTIONS ABOVE, ENTRY TO PROCESSING AREA AS WELL AS WAREHOUSE MAY NOT BE PERMITTED. ENTRY TO PROCESSING AREA IS SUBJECT TO THE VISITOR/CONTRACTOR COMPLYING WITH THE FOLLOWING HYGIENE RULES.",
    "1. Wear company issued PPEs in order of – Hair net (to cover your hair), mask (to cover the facial hair), apron (to avoid contamination from your clothes) & disposable shoe cover (to avoid contamination from your shoes. 2. Wear Snoods for beards and moustaches if objectionable & probability of product contamination. 3. Remove all Jewellery, Mobile phone and watches except plain rings in the pouches given, which should be placed in the visitor's locker or deposit with company representative. 4. Put up company issued gloves / wrist band or masking tape if you have jewellery or any other item that you cannot be remove from the hand. 5. Drinking of water, chewing & smoking is not allowed beyond change room area. 6. Sanitize your hands with antibacterial hand sanitizer prior to entry in processing area.",
    "The information I have given is correct and I have read and understand the above hygiene rules.",
  ],
  headerFields: [
    // Sample fill: the plant's most regular visitor, the pest control technician.
    { key: "name", label: "NAME", type: "text", required: true, autoFill: { carryForward: true } },
    { key: "designation", label: "DESIGNATION", type: "text", autoFill: { carryForward: true } },
    { key: "company", label: "COMPANY / ORGANIZATION", type: "text", autoFill: { carryForward: true } },
    { key: "purpose", label: "PURPOSE OF VISIT", type: "text", autoFill: { carryForward: true } },
  ],
  columns: [fixedText("parameter", "ARE YOU SUFFERING FROM ANY OF THE FOLLOWING CONDITIONS?", 420), yesNo("answer", "YES / NO", 90), text("value", "Reading / detail", 150)],
  rowMode: { kind: "fixedRows", rows: items(VISITOR_QUESTIONS) },
  footerFields: [
    { key: "signed", label: "Signed", type: "text" },
    { key: "signDate", label: "Date", type: "date" },
    { key: "verifiedBy", label: "Verified by (Company representative)", type: "text" },
  ],
  specimenHeader: { name: "Yogesh Rathod", designation: "Technician", company: "Gurudev Pest Control", purpose: "Fortnightly pest control service" },
  specimenRows: VISITOR_QUESTIONS.map((q) => (q.startsWith("Body temperature") ? { answer: "", value: "98.4 °F" } : { answer: "No", value: "" })),
  specimenSource: "F-HR-14_Visitor health declaration record.pdf — F/HR/14 (00/01.12.2021), blank format",
};

// ---------------------------------------------------------------------------
// F/HR/19 — MONTHLY PRP CHECK LIST (GMP INSPECTION RECORD)

export const GMP_LOCATIONS = [
  "Outside Premises", "Raw Material Store", "Ink & Varnish Store", "Packing Area", "Receiving / Dispatch Area", "Plant – Ground floor",
  "QC Laboratory", "Utility", "FG Storage Area", "Plant – First Floor", "Change Rooms", "Lunch Rooms",
];

// [item text, the answer that means compliant]. Most questions ask whether a
// good thing is so (Yes is compliant); a handful ask whether a bad thing exists
// (No is compliant) — the assistant's pre-fill uses this, a person answers what
// they found.
export const GMP_ITEMS: [string, "Yes" | "No"][] = [
  ["Whether outside land is free of debris and refuse?", "Yes"],
  ["Whether any source of pollution exists in nearby vicinity affecting the premises and the manufacturing area? (e.g. no objectionable odors, smoke, dust or other contaminants)", "No"],
  ["Whether premises roadways are properly graded, compacted and dust proof and drained?", "Yes"],
  ["Whether premises dispatch and receiving areas provide or permit good drainage? (e.g. no seepage, foot-borne filth and no breeding place for pests)", "Yes"],
  ["Whether premise has proper litter storage facilities?", "Yes"],
  ["Whether waste and liter has been removed to ensure prevention of harborage of pests and rodents?", "Yes"],
  ["Whether weeds and grass have been cut within the vicinity of the plant building or structures to ensure prevention of harborage of pests and rodents?", "Yes"],
  ["Whether there is any water logging in the plant as a breeding place for pests and rodents?", "No"],
  ["Whether there are some unattended cracks and crevices in any part of the plant building or structures which may harbor pests and rodents?", "No"],
  ["Whether the plant building & structures are clean from outside as well as inside? (e.g. absence of dust, debris, refuse or cobwebs, etc.)", "Yes"],
  ["Whether all windows and doors are close fitting in the plant building not allowing any pests and rodents? (e.g. any damages in the doors & windows)", "Yes"],
  ["Whether there is any plaster chipping or paint surface peeling off inside the plant premises?", "No"],
  ["Whether any floor or wall tiles or flooring broken allowing harborage of pest, rodents or accumulation of dust or any contaminants?", "No"],
  ["Whether joints between walls, floors and ceilings are proper in all areas?", "Yes"],
  ["Whether the plant production and packing areas are well lit and all the lighting fixtures are in working condition? (e.g. no broken lighting fixtures)", "Yes"],
  ["Whether all the lighting fixtures over exposed food or packing materials at all stages of production are covered with shatter proof material (e.g. acrylic glass covers)", "Yes"],
  ["Whether waste containers are clearly identified and are leak proof?", "Yes"],
  ["Whether wash rooms, lunch rooms and change rooms are correctly maintained and ventilated?", "Yes"],
  ["Whether all hand-washing facilities are equipped with potable running water at sufficient temperature (wherever required) and adequately maintained?", "Yes"],
  ["Whether all hand-washing facilities are equipped with liquid soap?", "Yes"],
  ["Whether all hand-washing facilities have sanitary hand drying devices / paper towels / hand-driers?", "Yes"],
  ["Whether hand-wash signage is provided at all hand washing facilities?", "Yes"],
  ["Whether temporary structures are designed, located and constructed to avoid pest harbourage and potential contamination of product?", "Yes"],
  ["Whether facility used to store ingredients, packaging and products is having proper protection from dust, condensation, drains, waste and other source of contamination?", "Yes"],
  ["Whether storage area is arranges to allow segregation of raw materials, work in progress and finish product?", "Yes"],
  ["Whether all materials and products are stored off the floor and with sufficient space between the materials and walls?", "Yes"],
  ["Whether a separate, secure (locked or otherwise access controlled) storage area is provided for cleaning materials, chemicals and other hazardous substances?", "Yes"],
  ["Whether the supply of potable water is sufficient to meet the needs of production process?", "Yes"],
  ["Whether water for cleaning or application where there is risk of indirect product contact (e.g. jacketed vessels, heat exchange, etc.) is meeting the specified quality and microbiological requirement relevant to the application?", "Yes"],
  ["Whether provision is made for the segregation, storage and removal of waste?", "Yes"],
  ["Whether labeled materials, products or printed packaging designated as waste is disfigured or destroyed to ensure that the trade mark is not reused?", "Yes"],
  ["Whether waste removal and destruction are carried out by approved disposal contractor?", "Yes"],
  ["Whether food contact equipment is designed and constructed to facilitate cleaning, disinfection and maintenance?", "Yes"],
  ["Whether food contact surface is suitable for the product and cleaning system?", "Yes"],
  ["Whether equipment can meet established principle of hygienic design, including; 1) Smooth, accessible, cleanable surface, self-draining in wet process area 2) Use of materials compatible with intended products and cleaning or flushing agent 3) Framework not penetrated by holes or nuts and bolts", "Yes"],
  ["Whether cleaning program specify what is to be cleaned, the responsibility, the method of cleaning, the use of dedicated tools, removal or disassembly requirements and methods for verify the effectiveness of cleaning?", "Yes"],
  ["Whether brittle materials, such as glass and hard plastic component in equipment, should be avoided where possible?", "Yes"],
  ["Whether cleaning and sanitizing agents and chemical is clearly identified, food grade, stored separately and used only in accordance with the manufacturer's instruction?", "Yes"],
  ["Whether equipment and tools are of hygienic design and maintained in condition which does not present a potential source of extraneous matter?", "Yes"],
  ["Where outside space is used for storage, stored item is protected from weather or pest damage (e.g. bird dropping)?", "Yes"],
  ["Whether establishment provide adequate number of toilets of appropriate design, each with hand washing, drying and, where required, sanitizing facilities?", "Yes"],
  ["Whether establishments have hygiene facilities that do not open directly on to production, packaging or storage area?", "Yes"],
  ["Whether an adequate changing facility for personnel is available?", "Yes"],
  ["Whether employees' own food is stored and consumed in designated area only?", "Yes"],
  ["Whether work clothing is fit for purpose, clean and in good condition (e.g. free from rips, tears or fraying material).", "Yes"],
  ["Whether work wear is laundered to standards and at intervals suitable for the intended use of the garments?", "Yes"],
  ["Whether hair, beard, and moustaches are protected (e.g. completely enclosed) by restraints unless hazard analysis indicates otherwise", "Yes"],
  ["Whether footwear for use in processing area is separate from personal footwear?", "Yes"],
  ["Whether any person found with illness or injury?", "No"],
  ["Whether rework is clearly identified, segregated and/or labeled for traceability?", "Yes"],
  ["Whether waste materials and chemicals (cleaning product, lubricants, and pesticides) are stored separately?", "Yes"],
  ["Whether vehicles, conveyances, and containers are maintained in good state of repair, cleanliness, and condition consistent with requirements given in relevant specification/", "Yes"],
  ["Whether potential sensitive areas within the establishments are identified, mapped and subjected to access control?", "Yes"],
  ["Whether FIFO is followed", "Yes"],
  ["Whether any materials (Ink, Varnish) found with expired shelf life?", "No"],
];

const gmpChecklist: LogSheetLayout = {
  documentId: "hr-gmp-checklist",
  instructions: [
    "MONTHLY PRP CHECK LIST (GMP INSPECTION RECORD) — fifty-five points walked by the HARA team once a month, each answered Yes / No with the action taken if NC.",
    `Location Guide (tick the areas covered): ${GMP_LOCATIONS.join(" · ")}.`,
    "Page 5 of the format is the inspection team's sign-off: Name / Department / Process / Designation / Sign — entered below the grid, one team member per line.",
  ],
  headerFields: [
    { key: "responsibility", label: "Responsibility", type: "text", autoFill: { default: "HARA TEAM" } },
    { key: "inspectionDate", label: "Date", type: "date" },
    { key: "locations", label: "Location Guide — areas covered", type: "text", autoFill: { carryForward: true } },
  ],
  columns: [fixedText("parameter", "Checklist", 520), yesNo("compliance", "Compliance", 90), text("actionIfNc", "Action taken if NC", 220)],
  rowMode: { kind: "fixedRows", rows: GMP_ITEMS.map(([parameter], i) => ({ parameter: `${i + 1}. ${parameter}` })) },
  footerFields: [{ key: "team", label: "Inspection team — Name / Department / Process / Designation (one per line)", type: "text" }],
  specimenHeader: { responsibility: "HARA TEAM", inspectionDate: "", locations: GMP_LOCATIONS.join(", ") },
  specimenRows: GMP_ITEMS.map(([, compliant]) => ({ compliance: compliant, actionIfNc: "" })),
  specimenSource: "F-HR-19_Monthly GMP Inspection record.pdf — F/HR/19 (00/01.12.2021), five-page blank format",
};

// ---------------------------------------------------------------------------
// F/HR/20 — PRODUCT SAFETY CULTURE SURVEY, and F/HR/21 — its analysis

export const PSC_ATTRIBUTES = [
  "I can freely speak up if I see something that may negatively affect Product safety or quality",
  "Product safety and quality is important to the Senior Management of our company",
  "Our Product safety policies and procedures give detailed guidance for how to properly handle our products to ensure a safe and quality product",
  "Everyone in our facility has a responsibility to ensure that we produce safe, quality products",
  "My coworkers are always supportive of each other regarding following Product safety and quality procedures",
  "How well I follow Product safety and quality procedues is part of my annual work performance evaluation",
  "I always have enough time to follow safe Product handling procedures, even during 'rush' hours.",
  "When there is pressure to finish production, managers sometimes tell us to work faster by taking shortcuts with Product safety and quality",
  "Management always determines the root cause of an issue when we have a Product safety or quality problem",
  "Producing safe quality products is important to my coworkers.",
  "Producing safe quality products is important to me",
  "Management regularly reviews monitoring records to ensure our facility is producing safe quality products",
  "Written Product safety and quality procedures are only a way to cover-up in case there is a problem with a product",
  "Management provides adequate training to improve workers' Product safety and quality practices.",
  "Equipment in our facility allows us to produce safe quality products",
];

const PSC_SCALE = ["7 — Strongly Agree", "6 — Moderately Agree", "5 — Agree", "4 — Neutral", "3 — Disagree", "2 — Moderately Disagree", "1 — Strongly Disagree"];

const pscSurvey: LogSheetLayout = {
  documentId: "hr-psc-survey",
  instructions: ["PRODUCT SAFETY CULTURE SURVEY — one form per employee. For each attribute, the response on the printed scale: 7 Strongly Agree · 6 Moderately Agree · 5 Agree · 4 Neutral · 3 Disagree · 2 Moderately Disagree · 1 Strongly Disagree. The form is also issued in Gujarati."],
  headerFields: [
    { key: "surveyDate", label: "Date", type: "date" },
    // Sample fill: the PSTL, who runs the survey (documentRoleKeywords).
    { key: "employeeName", label: "Employee name", type: "text", required: true, autoFill: { sign: true } },
    { key: "department", label: "Department", type: "text", autoFill: { carryForward: true } },
    { key: "designation", label: "Designation", type: "text", autoFill: { carryForward: true } },
  ],
  columns: [fixedText("parameter", "Attribute", 520), { key: "response", label: "Response", type: "select", options: PSC_SCALE, width: 200 }],
  rowMode: { kind: "fixedRows", rows: PSC_ATTRIBUTES.map((a, i) => ({ parameter: `${i + 1}. ${a}` })) },
  specimenHeader: { surveyDate: "", employeeName: "", department: "QC", designation: "Manager - QA" },
  // The way the January-2026 round answered (F/HR/21): agreement throughout,
  // and Strongly Disagree to attribute 8, the one about taking shortcuts.
  specimenRows: PSC_ATTRIBUTES.map((_, i) => ({ response: i === 7 ? PSC_SCALE[6] : i % 3 === 2 ? PSC_SCALE[1] : PSC_SCALE[0] })),
  specimenSource: "F-HR-20_Product safety culture survey (1).pdf — F/HR/20 (00/01.12.2021), blank format (English and Gujarati)",
};

const num = (key: string, label: string, width = 70): LogColumn => ({ key, label, type: "number", width, decimals: 0 });

const pscAnalysis: LogSheetLayout = {
  documentId: "hr-psc-survey-analysis",
  instructions: [
    "PRODUCT SAFETY CULTURE SURVEY — the analysis of one survey round: how many responses each attribute drew at each point of the scale, the actual and ideal weighted responses, and the percentage achieved.",
    "The figures are as printed on the company's own analysis sheet; nothing is recomputed.",
  ],
  headerFields: [{ key: "surveyPeriod", label: "Survey", type: "text", width: 220 }],
  columns: [
    fixedText("parameter", "Attribute", 420),
    num("sa7", "Strongly Agree (7)"),
    num("ma6", "Moderately Agree (6)"),
    num("a5", "Agree (5)"),
    num("n4", "Neutral (4)"),
    num("d3", "Disagree (3)"),
    num("md2", "Moderately Disagree (2)"),
    num("sd1", "Strongly Disagree (1)"),
    num("actual", "Actual Responses", 90),
    num("ideal", "Ideal response", 90),
    text("achieved", "Achieved", 90),
  ],
  rowMode: { kind: "fixedRows", rows: PSC_ATTRIBUTES.map((a, i) => ({ parameter: `${i + 1}. ${a}` })) },
  footerFields: [{ key: "overallAchieved", label: "Overall achieved", type: "text" }],
  specimenHeader: { surveyPeriod: "JANUARY 2026", overallAchieved: "93.99%" },
  specimenSource: "F-HR-21_Product Safety Culture Survey analysis record.pdf — F/HR/21 (00/01.12.2021), January 2026",
};

// ---------------------------------------------------------------------------
// F/HR/22 — Daily Personal Sanitation & Hygiene Inspection Report

export const HYGIENE_CHECKS: { key: string; label: string }[] = [
  { key: "nails", label: "Finger-nails - short and trimmed" },
  { key: "jewelry", label: "Jewelry, Ring, Wrist Watch are worn on exposed body parts" },
  { key: "ppe", label: "Protective clothing clean & wearing all PPEs" },
  { key: "sickness", label: "Sickness, Injury & wound on exposed body parts" },
  { key: "hair", label: "Hairs short, covered, Moustache trimmed & beared if covered (Male employee)" },
  { key: "footwear", label: "Footwear are clean & company issued" },
  { key: "foodItems", label: "Food items, tobacco, cigarrate, personal medicines found while frisking" },
  { key: "nailPolish", label: "Nail polish, Flase nails, used, Bindi, Kajal applied ? (Female employee)" },
  { key: "scented", label: "Strongly scented - perfume or after shave obsereved ?" },
];

const hygieneReport: LogSheetLayout = {
  documentId: "hr-hygiene-report",
  instructions: [
    "Daily Personal Sanitation & Hygiene Inspection Report — one sheet per month, one line per day of the month, each of the nine checks answered Yes / No as found at frisking, with the observation, the corrective action and who checked.",
    "A day's line is filled on the day; the sheet is not pre-filled for days that have not happened.",
  ],
  headerFields: [{ key: "monthYear", label: "Month & Year", type: "text", width: 160 }],
  columns: [fixedText("parameter", "Date", 50), ...HYGIENE_CHECKS.map(({ key, label }) => yesNo(key, label, 84)), text("observation", "Observation", 160), text("correctiveAction", "Corrective Action(s)", 160), text("checkedBy", "Checked by", 120)],
  rowMode: { kind: "fixedRows", rows: Array.from({ length: 31 }, (_, i) => ({ parameter: String(i + 1) })) },
  referenceTables: [
    {
      title: "Form-22 Daily Personal Hygiene Report — problems found per month (as supplied with F/HR/20)",
      columns: ["Month", "Problems"],
      rows: [
        ["Jan-25", "1"], ["Feb-25", "2"], ["Mar-25", "1"], ["Apr-25", "4"], ["May-25", "3"], ["Jun-25", "1"], ["Jul-25", "2"],
        ["Aug-25", "1"], ["Sep-25", "2"], ["Oct-25", "4"], ["Nov-25", "5"], ["Dec-25", "1"], ["Jan-26", "2"], ["Feb-26", "1"],
      ],
    },
  ],
  specimenHeader: { monthYear: "" },
  specimenSource: "F-HR-22_Daily Employee Sanitation & Hygiene record.pdf — F / HR / 22 Rev. 00, blank month sheet",
};

export const HR_LAYOUTS: Record<string, LogSheetLayout> = {
  "hr-competence": competence,
  "hr-skill-matrix": skillMatrix,
  "hr-pre-employment-health": preEmployment,
  "hr-induction-staff": inductionStaff,
  "hr-induction-operators": inductionOperators,
  "hr-job-responsibility": jobResponsibility,
  "hr-training-needs": trainingNeeds,
  "hr-training-calendar": trainingCalendar,
  "hr-training-effectiveness": trainingEffectiveness,
  "hr-training-feedback": trainingFeedback,
  "hr-mobile-authorization": mobileAuthorization,
  "hr-visitor-health": visitorHealth,
  "hr-gmp-checklist": gmpChecklist,
  "hr-psc-survey": pscSurvey,
  "hr-psc-survey-analysis": pscAnalysis,
  "hr-hygiene-report": hygieneReport,
};

export const HR_FORMAT_DATE = FORMAT_DATE;
