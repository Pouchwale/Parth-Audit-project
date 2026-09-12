import type {
  ComplaintAckData,
  ComplaintChecklistData,
  DailyPestMonitoringData,
  DocumentDefinition,
  FlyCatcherData,
  GapInspectionData,
  LogColumn,
  LogSheetData,
  PestResponsibilitiesData,
  RecordInstance,
  ServiceAgreementData,
  ServiceReportData,
  TrainingRecordData,
} from "../types";
import { masterRepository } from "../data/repositories/masterRepository";
import { getLogSheetLayout } from "../data/seed/logSheetLayouts";
import { codeRulesFor } from "./documentFormats";

// A numeric log-sheet cell outside its printed acceptance band. Not a
// submit blocker (the paper form has no such gate — the reading is what it
// is, and a remark is expected) but surfaced in the UI and in reports.
export function isOutOfBand(col: LogColumn, value: unknown): boolean {
  if (col.type !== "number" || typeof value !== "number") return false;
  if (col.min !== undefined && value < col.min) return true;
  if (col.max !== undefined && value > col.max) return true;
  return false;
}

export function logSheetOutOfBandCount(documentId: string, data: LogSheetData): number {
  const layout = getLogSheetLayout(documentId);
  if (!layout) return 0;
  let n = 0;
  for (const row of data.rows) for (const col of layout.columns) if (isOutOfBand(col, row[col.key])) n += 1;
  return n;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function ok(): ValidationResult {
  return { valid: true, errors: [] };
}
function fail(errors: string[]): ValidationResult {
  return { valid: false, errors };
}

// The plant's own codes on a document — an FG code, a PO number, a complaint
// number — have to read the way the department writes them
// (engine/documentFormats.ts) before it can be submitted.
function codeProblems(kind: string, data: unknown): string[] {
  const values = (data ?? {}) as Record<string, unknown>;
  return Object.entries(codeRulesFor(kind))
    .map(([key, rule]) => rule.problem(String(values[key] ?? "")))
    .filter((p): p is string => !!p);
}

export function validateForSubmit(doc: DocumentDefinition, record: RecordInstance): ValidationResult {
  const errors: string[] = [];

  switch (doc.kind) {
    case "daily-pest-monitoring": {
      const d = record.data as DailyPestMonitoringData;
      if (d.isHoliday) break;
      const checkpoints = masterRepository.get().checkpoints;
      if (!d.checker.trim()) errors.push("Checker name is required.");
      if (!d.timeOfChecking.trim()) errors.push("Time of checking is required.");
      for (const cp of checkpoints) {
        const ans = d.checkpoints[cp.no];
        if (!ans || ans.value === null || ans.value === "") {
          errors.push(`Checkpoint ${cp.no} has not been answered.`);
        }
        if (cp.responseType === "yesno-note" && ans && ans.value === "Yes" && !ans.note?.trim()) {
          errors.push(`Checkpoint ${cp.no}: ${cp.notePrompt ?? "a note"} is required when the answer is Yes.`);
        }
      }
      // A rodent in a trap box is a count, not a tick: box, location and
      // how many — that's what the Rodent Catch Report adds up.
      if (d.checkpoints[7]?.value === "Yes") {
        const catches = d.rodentCatches ?? [];
        if (catches.length === 0) errors.push("Checkpoint 7 is Yes — add the rodent catch details (trap box, location, number of rodents).");
        catches.forEach((c, i) => {
          if (!c.location.trim()) errors.push(`Rodent catch #${i + 1}: location is required.`);
          if (!(Number(c.count) >= 1)) errors.push(`Rodent catch #${i + 1}: number of rodents must be at least 1.`);
        });
      }
      break;
    }
    case "fly-catcher": {
      const d = record.data as FlyCatcherData;
      d.entries.forEach((e) => {
        if (e.catchCountApprox === null) errors.push(`${e.pcId}: Flies catch count is required.`);
        if (!e.cleaningDoneBy.trim()) errors.push(`${e.pcId}: "Cleaning Done By" is required.`);
      });
      break;
    }
    case "service-report": {
      const d = record.data as ServiceReportData;
      if (!d.technicianSign.trim()) errors.push("Technician signature (name) is required.");
      break;
    }
    case "gap-inspection": {
      const d = record.data as GapInspectionData;
      if (!d.inspectionDate) errors.push("Inspection date is required.");
      if (d.findings.length === 0) errors.push("At least one finding is required.");
      d.findings.forEach((f) => {
        if (!f.findingOfInspection.trim()) errors.push(`Finding #${f.sNo}: description is required.`);
      });
      break;
    }
    case "training-record": {
      const d = record.data as TrainingRecordData;
      if (!d.trainerProvider.trim()) errors.push("Trainer / provider is required.");
      if (d.attendees.length === 0 || !d.attendees.some((a) => a.attended)) {
        errors.push("At least one attendee must be marked as attended.");
      }
      break;
    }
    case "complaint-checklist": {
      const d = record.data as ComplaintChecklistData;
      if (!d.customerName.trim()) errors.push("Customer Name is required.");
      if (!d.complaintNo.trim()) errors.push("Complaint No. is required.");
      errors.push(...codeProblems("complaint-checklist", d));
      if (!d.complaintReceivedDate) errors.push("Complaint Received Date is required.");
      if (!d.preparedBy.name.trim()) errors.push("Prepared By (name) is required.");
      // Every section is mandatory, activity by activity (the department's
      // rule for External CAPA, 12-Sep-2026): each one is done, done on a date,
      // or marked not required — nothing is left blank. The walk-through works
      // the same way, so this is the same rule from either end.
      for (const s of d.sections) {
        const blank = s.items.filter((it) => !it.done && !it.notRequired && !it.comment.trim());
        if (blank.length === 0) continue;
        const which = blank.map((it) => `${s.key}${it.srNo}`).join(", ");
        errors.push(
          `Section ${s.key} — ${s.title} is not finished: ${blank.length} activit${blank.length === 1 ? "y" : "ies"} still blank (${which}). Mark each one done, done on a date, or not required.`
        );
      }
      break;
    }
    case "complaint-ack": {
      const d = record.data as ComplaintAckData;
      if (!d.reportDate) errors.push("Date is required.");
      if (!d.toName.trim()) errors.push('"To" — the person the complaint is explained to — is required.');
      if (!d.customerName.trim()) errors.push("Customer Name is required.");
      if (!d.complaintReceivedOn) errors.push("Complaint received on is required.");
      if (!d.jobName.trim()) errors.push("Job name is required.");
      if (!d.scenario.trim()) errors.push("Scenario is required.");
      if (!d.rootCause.trim()) errors.push("Root Cause is required.");
      if (!d.correctiveAction.trim()) errors.push("Corrective Action is required.");
      if (!d.preventiveAction.trim()) errors.push("Preventive Action is required.");
      if (!d.employeeName.trim()) errors.push("The employee's name (the acknowledgement) is required.");
      errors.push(...codeProblems("complaint-ack", d));
      break;
    }
    case "pest-responsibilities": {
      const d = record.data as PestResponsibilitiesData;
      if (d.siteResponsibilities.length === 0) errors.push("The site responsibilities are empty — add at least one point.");
      if (!d.client.name.trim()) errors.push("The client representative's name is required.");
      if (!d.provider.name.trim()) errors.push("The pest control agency representative's name is required.");
      break;
    }
    case "service-agreement": {
      const d = record.data as ServiceAgreementData;
      if (!d.effectiveFrom) errors.push("The date the agreement starts is required.");
      if (!d.effectiveTo) errors.push("The date the agreement runs to is required.");
      if (d.effectiveFrom && d.effectiveTo && d.effectiveTo <= d.effectiveFrom) errors.push("The agreement must run to a date after it starts.");
      // Either the signed copy is on file, or this format carries both names.
      if (d.scans.length === 0) {
        if (!d.clientSignatory.name.trim()) errors.push("Who signs for the client is required (or upload the signed agreement).");
        if (!d.providerSignatory.name.trim()) errors.push("Who signs for the service provider is required (or upload the signed agreement).");
      }
      break;
    }
    case "log-sheet": {
      const d = record.data as LogSheetData;
      const layout = getLogSheetLayout(doc.id);
      if (!layout) break;
      for (const f of [...layout.headerFields, ...(layout.footerFields ?? [])]) {
        if (f.required && !(d.header?.[f.key] ?? "").toString().trim()) errors.push(`${f.label} is required.`);
      }
      if (layout.footerFields?.some((f) => f.key === "lotStatus") && d.header?.lotStatus && d.header.lotStatus !== "Accepted" && !(d.header.deviationReason ?? "").trim()) {
        errors.push("Reason for Deviation / Rejection / Segregation is required when the lot is not Accepted.");
      }
      if (!d.rows || d.rows.length === 0) errors.push("At least one row is required.");
      const mode = layout.rowMode;
      (d.rows ?? []).forEach((row, i) => {
        const label = mode.kind === "timeSlots" ? `${row[mode.slotKey]}` : mode.kind === "fixedRows" && row.parameter ? `${row.parameter}` : `Row ${i + 1}`;
        for (const col of layout.columns) {
          if (!col.required) continue;
          const v = row[col.key];
          if (v === null || v === undefined || `${v}`.trim() === "") errors.push(`${label}: ${col.label} is required.`);
        }
      });
      break;
    }
    default:
      break;
  }

  return errors.length ? fail(errors) : ok();
}

export function validateForVerify(doc: DocumentDefinition, record: RecordInstance): ValidationResult {
  const errors: string[] = [];
  if (record.status !== "Submitted" && record.status !== "Pending Verification") {
    errors.push("Only submitted records can be verified.");
  }

  switch (doc.kind) {
    case "service-report": {
      const d = record.data as ServiceReportData;
      if (!d.customerSign.trim()) errors.push("Customer's representative signature is required to verify.");
      break;
    }
    case "gap-inspection": {
      const d = record.data as GapInspectionData;
      const unverified = d.findings.filter((f) => f.status !== "Closed" && f.status !== "Verified");
      if (unverified.length > 0) {
        errors.push(`${unverified.length} finding(s) are not yet closed/verified.`);
      }
      break;
    }
    case "complaint-checklist": {
      const d = record.data as ComplaintChecklistData;
      if (!d.approvedBy.name.trim()) errors.push("Approved By (name) is required — the approver's name is stamped when you approve.");
      break;
    }
    default:
      break;
  }

  return errors.length ? fail(errors) : ok();
}
