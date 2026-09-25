import type { LogSheetData, LogSheetRow, RecordInstance } from "../../types";
import {
  AUDIT_CHECKLIST_2025_02,
  AUDIT_FINDINGS_2025_02_PLAN,
  AUDIT_PLAN_2025_01,
  AUDIT_PLAN_TEAM,
  AUDIT_RISK_CLAUSES,
  AUDIT_SCHEDULE_2024,
  AUDIT_SCHEDULE_2025,
  AUDIT_SCHEDULE_2025_NOTE,
  AUDIT_SCHEDULE_DEPARTMENTS,
  AUDIT_SCHEDULE_MONTH_KEYS,
  auditScheduleKey,
} from "./sysInternalAuditLayouts";

// THE INTERNAL AUDIT PAGES SUPPLIED FILLED IN (REQUIREMENTS §76), on file as
// LIVE records (isDemo: false) the way Maintenance's are (maintenanceRecords.ts),
// so the formats open with the plant's own entries. Read from the pages, cell
// for cell (sysInternalAuditLayouts.ts says how each page is laid out and what
// is odd on it), and nothing else invented — a box the page leaves blank is
// blank here:
//   F/SYS/05  the Yearly Internal Audit Schedule for 2024 and for 2025, filed
//             under the year they are for (1 January). Neither is dated or
//             approved on the page. 2025's note typed across the grid is in its
//             note box.
//   F/SYS/06  the plan of audit 01/2025, dated 03.02.2025, with its audit
//             summary: two lines, the second holding both minor NCs.
//   F/SYS/07  the risk assessment for 2024, filed under 1 January 2024: each
//             section's four figures on its first line, as the merged cells
//             keep them. Every printed Sum and Audit frequency is the one
//             auditRiskCells gives.
//   F/SYS/08  the audit of 17.02.2025: all 148 lines of pages 2 to 25 — 119
//             clauses, 3.1.1 to 4.11.9, and 29 section headings — with every
//             compliance and comment as the page shows it, NC - 01 at 4.2.1 and
//             NC - 02 at 4.7.6 (4.9.2.3 "Compliance": the full stop after it in
//             the text layer is printed in white and cannot be seen).
//   F/SYS/10  NC report Feb -25/02 of 17.02.2025, clause 4.7.6. Its closing
//             verification, planned closing date and every signature are blank.
// F/SYS/11 was supplied blank and has no record.

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

/** Short, stable row ids: r1, r2 … */
const rowId = (i: number) => `r${i + 1}`;

// ---------------------------------------------------------------------------
// F/SYS/05 — every month's Plan and Actual on each department's line, blank
// where the page is blank.

function scheduleRows(marks: Record<string, string>[]): LogSheetRow[] {
  const blankMonths = Object.fromEntries(
    AUDIT_SCHEDULE_MONTH_KEYS.flatMap((m) => [
      [auditScheduleKey(m, "Plan"), ""],
      [auditScheduleKey(m, "Actual"), ""],
    ])
  );
  return AUDIT_SCHEDULE_DEPARTMENTS.map((department, i) => ({ id: rowId(i), department, ...blankMonths, ...marks[i] }));
}

export const SEED_SYS_AUDIT_SCHEDULE_2024 = seeded("seed-sys-audit-schedule-2024", "sys-audit-schedule", "2024-01-01", {
  header: { year: "2024", date: "", approvedBy: "", scheduleNote: "" },
  rows: scheduleRows(AUDIT_SCHEDULE_2024),
});

export const SEED_SYS_AUDIT_SCHEDULE_2025 = seeded("seed-sys-audit-schedule-2025", "sys-audit-schedule", "2025-01-01", {
  header: { year: "2025", date: "", approvedBy: "", scheduleNote: AUDIT_SCHEDULE_2025_NOTE },
  rows: scheduleRows(AUDIT_SCHEDULE_2025),
});

// ---------------------------------------------------------------------------
// F/SYS/06 — audit 01/2025. "Verified By:" is blank on the page.

export const SEED_SYS_AUDIT_PLAN_2025_01 = seeded("seed-sys-audit-plan-2025-01", "sys-audit-plan", "2025-02-03", {
  header: { auditSrNo: "01/2025", date: "2025-02-03", ...AUDIT_PLAN_TEAM, verifiedBy: "" },
  rows: AUDIT_PLAN_2025_01.map((line, i) => ({ id: rowId(i), ...line })),
});

// ---------------------------------------------------------------------------
// F/SYS/07 — 2024. The page's figures, section by section, on the section's
// first line: [Number, IQA NC, External NCs, Sum, Audit frequency].

const AUDIT_RISK_2024_FIGURES: [number: string, iqaNc: number, externalNc: number, sum: string, frequency: string][] = [
  ["1.1", 0, 0, "0", "Once / Year"],
  ["2", 0, 1, "1", "Once / Year"],
  ["3.1", 0, 0, "0", "Once / Year"],
  ["4.1", 3, 4, "7", "Twice / Year"],
  ["5.1", 1, 1, "2", "Once / Year"],
  ["6.1", 2, 0, "2", "Once / Year"],
];

export const SEED_SYS_AUDIT_RISK_2024 = seeded("seed-sys-audit-risk-2024", "sys-audit-risk", "2024-01-01", {
  header: { year: "2024" },
  rows: AUDIT_RISK_CLAUSES.map(([number, auditScope, auditee], i) => {
    const figures = AUDIT_RISK_2024_FIGURES.find(([first]) => first === number);
    return {
      id: rowId(i),
      number,
      auditScope,
      auditee,
      iqaNc: figures ? figures[1] : null,
      externalNc: figures ? figures[2] : null,
      sum: figures ? figures[3] : "",
      frequency: figures ? figures[4] : "",
    };
  }),
});

// ---------------------------------------------------------------------------
// F/SYS/08 — the audit of 17.02.2025, page 1's table and the checklist.

export const SEED_SYS_AUDIT_FINDINGS_2025_02 = seeded("seed-sys-audit-findings-2025-02", "sys-audit-findings", "2025-02-17", {
  header: { ...AUDIT_FINDINGS_2025_02_PLAN },
  rows: AUDIT_CHECKLIST_2025_02.map((line, i) => ({ id: rowId(i), ...line })),
});

// ---------------------------------------------------------------------------
// F/SYS/10 — Feb -25/02. Non-Conformance is the box ticked; the objective
// evidence gives only the clause. The root cause and the corrective action
// are each one paragraph on the page (the action's first line is typed in
// another font).

export const SEED_SYS_AUDIT_NC_FEB_25_02 = seeded("seed-sys-audit-nc-feb-25-02", "sys-audit-nc", "2025-02-17", {
  header: {
    reportNo: "Feb -25/02",
    reportDate: "2025-02-17",
    auditorName: "Kapila barad",
    deptAreaFunction: "Site standard",
    ncType: "Non-Conformance",
    ncFindingStatement: "Use of temporary modification using thread and cloth noted in Lamination machine",
    referenceRecords: "",
    procedureFlowChart: "",
    clauseNo: "4.7.6",
    auditorSign: "",
    auditeeSign: "",
    plannedClosingDate: "",
    rootCause:
      "Temporary repairs being carried out were not formally recorded. Machine operators were lacking awareness on the practices to be followed for temporary repairs",
    rootCauseAuditeeSign: "",
    rootCauseAuditorSign: "",
    correctiveAction:
      "Temporary repairs using thread and cloth noted on Lamination machine has been permanently removed. Machine operators, supervisors & HOD of all processing equipment has been made aware of criteria & methodology for temporary engineering requirements.",
    correctiveActionAuditeeSign: "",
    correctiveActionDate: "",
    followUp: "",
    actionsFound: "",
    carStatus: "",
    carClosingDate: "",
    carVerifiedBy: "",
    carSign: "",
  },
  // A form of boxes alone still keeps the one empty line every such record has
  // (engine/recordDefaults.ts): submit refuses a log sheet with no line, and
  // this record must be handed in again after it is reopened with Edit.
  rows: [{ id: "r1" }],
});

export const SEED_SYS_INTERNAL_AUDIT_RECORDS: RecordInstance<LogSheetData>[] = [
  SEED_SYS_AUDIT_SCHEDULE_2024,
  SEED_SYS_AUDIT_SCHEDULE_2025,
  SEED_SYS_AUDIT_PLAN_2025_01,
  SEED_SYS_AUDIT_RISK_2024,
  SEED_SYS_AUDIT_FINDINGS_2025_02,
  SEED_SYS_AUDIT_NC_FEB_25_02,
];
