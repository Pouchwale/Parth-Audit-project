import type {
  ComplaintAckData,
  ComplaintChecklistData,
  DailyPestMonitoringData,
  DocumentDefinition,
  FlyCatcherData,
  GapInspectionData,
  LogColumn,
  LogSheetData,
  LogSheetLayout,
  PestResponsibilitiesData,
  RecordInstance,
  ServiceAgreementData,
  ServiceReportData,
  TrainingRecordData,
} from "../types";
import { masterRepository } from "../data/repositories/masterRepository";
import { getLogSheetLayout, getLogSheetLayoutForRecord } from "../data/seed/logSheetLayouts";
import { withoutLineNumber } from "./lineNumbers";
import { numbersOwnLines } from "./formLineNumbers";
import { mergedRuns } from "./paperLayout";
import { codeRulesFor } from "./documentFormats";
import { outOfBandCount } from "./printedBands";

// "Was the lot accepted as it is?" — the one status that needs no reason
// beside it. Each form prints the words its own way (the incoming material
// records in capitals, the lamination ones in title case), so the word is
// read, not matched character for character.
export const isLotAccepted = (status: string | undefined | null): boolean => String(status ?? "").trim().toLowerCase() === "accepted";

// A numeric log-sheet cell outside its printed acceptance band. Not a
// submit blocker (the paper form has no such gate — the reading is what it
// is, and a remark is expected) but surfaced in the UI and in reports.
export function isOutOfBand(col: LogColumn, value: unknown): boolean {
  if (col.type !== "number" || typeof value !== "number") return false;
  if (col.min !== undefined && value < col.min) return true;
  if (col.max !== undefined && value > col.max) return true;
  return false;
}

export function logSheetOutOfBandCount(documentId: string, data: LogSheetData, record?: { formatRevision?: string } | null): number {
  const layout = getLogSheetLayoutForRecord(documentId, record);
  if (!layout) return 0;
  // A column's band, a tolerance box's, a line's printed specification and a box against its tolerance (REQUIREMENTS §111 rule 2).
  return outOfBandCount(layout, data);
}

/** A revision of a format that a record was filled on and the format has since replaced. */
export interface SupersededRevisionInfo {
  revisionNo: string;
  revisionDate: string;
  note?: string;
  layout: LogSheetLayout;
}

/**
 * The superseded revision this record was filled on (REQUIREMENTS §74), or
 * undefined for every record that reads with the format as it now stands —
 * which is every record that names no revision, or names one the current
 * layout does not list as superseded. Such a record is a page of the past:
 * drawn and checked with its own layout, headed with its own revision, never a
 * source to carry forward from and never reopened for correction.
 */
export function supersededRevisionOf(record: { documentId: string; formatRevision?: string } | null | undefined): SupersededRevisionInfo | undefined {
  const revisionNo = record?.formatRevision;
  if (!revisionNo) return undefined;
  const revisions = getLogSheetLayout(record.documentId)?.supersededRevisions;
  if (!revisions || !Object.prototype.hasOwnProperty.call(revisions, revisionNo)) return undefined;
  const found = revisions[revisionNo];
  return found?.layout ? { revisionNo, revisionDate: found.revisionDate, note: found.note, layout: found.layout } : undefined;
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

// EVERY BOX IS READ DEFENSIVELY (REQUIREMENTS §113): a line stored without a
// box — an older record, a change that lost it — is a problem to report in
// words, never a TypeError thrown at the person pressing Submit. `text` reads
// any value as trimmed words, `list` any value as a list, `part` any value as
// an object.
const text = (v: unknown): string => (v === null || v === undefined ? "" : String(v)).trim();
const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const part = <T extends object>(v: unknown): Partial<T> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Partial<T>) : {});

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
      if (!text(d.checker)) errors.push("Checker name is required.");
      if (!text(d.timeOfChecking)) errors.push("Time of checking is required.");
      for (const cp of checkpoints) {
        const ans = part<DailyPestMonitoringData["checkpoints"]>(d.checkpoints)[cp.no];
        if (!ans || ans.value === null || ans.value === "") {
          errors.push(`Checkpoint ${cp.no} has not been answered.`);
        }
        if (cp.responseType === "yesno-note" && ans && ans.value === "Yes" && !ans.note?.trim()) {
          errors.push(`Checkpoint ${cp.no}: ${cp.notePrompt ?? "a note"} is required when the answer is Yes.`);
        }
      }
      // A rodent in a trap box is a count, not a tick: box, location and
      // how many — that's what the Rodent Catch Report adds up.
      if (part<DailyPestMonitoringData["checkpoints"]>(d.checkpoints)[7]?.value === "Yes") {
        const catches = list<NonNullable<DailyPestMonitoringData["rodentCatches"]>[number]>(d.rodentCatches);
        if (catches.length === 0) errors.push("Checkpoint 7 is Yes — add the rodent catch details (trap box, location, number of rodents).");
        catches.forEach((c, i) => {
          // Read defensively: a line stored without the box (an older record,
          // or a change that lost it) is a problem to report, not a crash.
          if (!text(c?.location)) errors.push(`Rodent catch #${i + 1}: location is required.`);
          if (!(Number(c?.count) >= 1)) errors.push(`Rodent catch #${i + 1}: number of rodents must be at least 1.`);
        });
      }
      break;
    }
    case "fly-catcher": {
      const d = record.data as FlyCatcherData;
      list<FlyCatcherData["entries"][number]>(d.entries).forEach((e, i) => {
        const unit = text(e?.pcId) || `Unit ${i + 1}`;
        if (e?.catchCountApprox === null || e?.catchCountApprox === undefined) errors.push(`${unit}: Flies catch count is required.`);
        if (!text(e?.cleaningDoneBy)) errors.push(`${unit}: "Cleaning Done By" is required.`);
      });
      break;
    }
    case "service-report": {
      const d = record.data as ServiceReportData;
      if (!text(d.technicianSign)) errors.push("Technician signature (name) is required.");
      break;
    }
    case "gap-inspection": {
      const d = record.data as GapInspectionData;
      if (!d.inspectionDate) errors.push("Inspection date is required.");
      const findings = list<GapInspectionData["findings"][number]>(d.findings);
      if (findings.length === 0) errors.push("At least one finding is required.");
      findings.forEach((f, i) => {
        if (!text(f?.findingOfInspection)) errors.push(`Finding #${f?.sNo ?? i + 1}: description is required.`);
      });
      break;
    }
    case "training-record": {
      const d = record.data as TrainingRecordData;
      if (!text(d.trainerProvider)) errors.push("Trainer / provider is required.");
      if (list(d.attendees).length === 0) {
        errors.push("The attendance sheet needs at least one name.");
      }
      break;
    }
    case "complaint-checklist": {
      const d = record.data as ComplaintChecklistData;
      if (!text(d.customerName)) errors.push("Customer Name is required.");
      if (!text(d.complaintNo)) errors.push("Complaint No. is required.");
      errors.push(...codeProblems("complaint-checklist", d));
      if (!d.complaintReceivedDate) errors.push("Complaint Received Date is required.");
      if (!text(part<ComplaintChecklistData["preparedBy"]>(d.preparedBy).name)) errors.push("Prepared By (name) is required.");
      // Every section is mandatory, activity by activity (the department's
      // rule for External CAPA, 12-Sep-2026): each one is done, done on a date,
      // or marked not required — nothing is left blank. The walk-through works
      // the same way, so this is the same rule from either end.
      for (const s of list<ComplaintChecklistData["sections"][number]>(d.sections)) {
        const blank = list<ComplaintChecklistData["sections"][number]["items"][number]>(s?.items).filter((it) => !it?.done && !it?.notRequired && !text(it?.comment));
        if (blank.length === 0) continue;
        const which = blank.map((it) => `${s.key}${it?.srNo ?? ""}`).join(", ");
        errors.push(
          `Section ${s.key} — ${s.title} is not finished: ${blank.length} activit${blank.length === 1 ? "y" : "ies"} still blank (${which}). Mark each one done, done on a date, or not required.`
        );
      }
      break;
    }
    case "complaint-ack": {
      const d = record.data as ComplaintAckData;
      if (!d.reportDate) errors.push("Date is required.");
      if (!text(d.toName)) errors.push('"To" — the person the complaint is explained to — is required.');
      if (!text(d.customerName)) errors.push("Customer Name is required.");
      if (!d.complaintReceivedOn) errors.push("Complaint received on is required.");
      if (!text(d.jobName)) errors.push("Job name is required.");
      if (!text(d.scenario)) errors.push("Scenario is required.");
      if (!text(d.rootCause)) errors.push("Root Cause is required.");
      if (!text(d.correctiveAction)) errors.push("Corrective Action is required.");
      if (!text(d.preventiveAction)) errors.push("Preventive Action is required.");
      if (!text(d.employeeName)) errors.push("The employee's name (the acknowledgement) is required.");
      errors.push(...codeProblems("complaint-ack", d));
      break;
    }
    case "pest-responsibilities": {
      const d = record.data as PestResponsibilitiesData;
      if (list(d.siteResponsibilities).length === 0) errors.push("The site responsibilities are empty — add at least one point.");
      if (!text(part<PestResponsibilitiesData["client"]>(d.client).name)) errors.push("The client representative's name is required.");
      if (!text(part<PestResponsibilitiesData["provider"]>(d.provider).name)) errors.push("The pest control agency representative's name is required.");
      break;
    }
    case "service-agreement": {
      const d = record.data as ServiceAgreementData;
      if (!d.effectiveFrom) errors.push("The date the agreement starts is required.");
      if (!d.effectiveTo) errors.push("The date the agreement runs to is required.");
      if (d.effectiveFrom && d.effectiveTo && d.effectiveTo <= d.effectiveFrom) errors.push("The agreement must run to a date after it starts.");
      // Either the signed copy is on file, or this format carries both names.
      if (list(d.scans).length === 0) {
        if (!text(part<ServiceAgreementData["clientSignatory"]>(d.clientSignatory).name)) errors.push("Who signs for the client is required (or upload the signed agreement).");
        if (!text(part<ServiceAgreementData["providerSignatory"]>(d.providerSignatory).name)) errors.push("Who signs for the service provider is required (or upload the signed agreement).");
      }
      break;
    }
    case "log-sheet": {
      const d = record.data as LogSheetData;
      // Checked against the layout the record was filled on (REQUIREMENTS §74).
      const layout = getLogSheetLayoutForRecord(doc.id, record);
      if (!layout) break;
      for (const f of [...layout.headerFields, ...(layout.footerFields ?? [])]) {
        // A box the paper prints its value in is never asked for (REQUIREMENTS §111): nobody writes it.
        if (typeof f.printed === "string") continue;
        if (f.required && !(d.header?.[f.key] ?? "").toString().trim()) errors.push(`${f.label} is required.`);
      }
      if (layout.footerFields?.some((f) => f.key === "lotStatus") && d.header?.lotStatus && !isLotAccepted(d.header.lotStatus) && !(d.header.deviationReason ?? "").trim()) {
        errors.push("Reason for Deviation / Rejection / Segregation is required when the lot is not Accepted.");
      }
      if (!d.rows || d.rows.length === 0) errors.push("At least one row is required.");
      const mode = layout.rowMode;
      // A printed line's words as the sheet shows them: its own number is the Sr. No.'s (REQUIREMENTS §102).
      const ownNumbers = numbersOwnLines(layout);
      // A cell the paper merges down a run of lines is asked for once, on the run's first line (REQUIREMENTS §111).
      const merged = mergedRuns(layout, d.rows ?? []);
      (d.rows ?? []).forEach((row, i) => {
        const label =
          mode.kind === "timeSlots"
            ? `${row[mode.slotKey]}`
            : mode.kind === "fixedRows" && row.parameter
              ? `${ownNumbers ? row.parameter : withoutLineNumber(row.parameter, i + 1)}`
              : `Row ${i + 1}`;
        for (const col of layout.columns) {
          // A worked-out cell is never asked for: it is blank only while the
          // cells it comes from are, and those carry their own requirement
          // (engine/computedCells.ts, REQUIREMENTS §74).
          if (!col.required || col.computed) continue;
          if (merged.get(col.key)?.[i] === 0) continue;
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
      if (!text(d.customerSign)) errors.push("Customer's representative signature is required to verify.");
      break;
    }
    case "gap-inspection": {
      const d = record.data as GapInspectionData;
      const unverified = list<GapInspectionData["findings"][number]>(d.findings).filter((f) => f?.status !== "Closed" && f?.status !== "Verified");
      if (unverified.length > 0) {
        errors.push(`${unverified.length} finding(s) are not yet closed/verified.`);
      }
      break;
    }
    case "complaint-checklist": {
      const d = record.data as ComplaintChecklistData;
      if (!text(part<ComplaintChecklistData["approvedBy"]>(d.approvedBy).name)) errors.push("Approved By (name) is required — the approver's name is stamped when you approve.");
      break;
    }
    default:
      break;
  }

  return errors.length ? fail(errors) : ok();
}
