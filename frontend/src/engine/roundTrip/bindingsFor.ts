// WHICH VALUE OF A RECORD EACH BOX ON ITS PAGE SHOWS (REQUIREMENTS §81).
//
// A downloaded Word or Excel file can be read back only if every value in it
// says where in the record it came from (engine/roundTrip/bindPath.ts). The
// record views put that on each box — the input while the record is a draft,
// and the words shown in its place once it is submitted or verified — and they
// take it from HERE, one small builder per kind of value. The unit test
// (tests/roundTripBindings.test.ts) walks the same builders over sample-filled
// records of every document and checks that each path leads to the value, so
// what a page binds and what the test checks cannot drift apart.
//
// Pure: no repositories, no React, nothing read from storage. Everything a
// builder needs (a layout, the master checkpoint list) is handed in.
//
// NOT BOUND, on purpose: a cell worked out from others (a log sheet's computed
// column or box, the daily register's rodent count at check point 7, a
// statement's "valid until"), the form's own printed text (a fixed column), a
// Sr. No., the service report's name, material and method (they follow the
// document and the area), a finding's status (Open / Overdue are worked out
// from its dates, Closed is set by its Close button), the checklist's "not
// required" (a toggle button, shown as a badge inside the activity's cell), the
// record's date as the header prints it, photographs and scans, and a list
// edited as one box of lines (a Statement of Compliance section while Edit is
// on, the chemicals of a chart row, an address of several lines while it is
// being edited) — no binding type holds a list, and one line of text written
// over a list would break the record.
//
// The page-level test renders every record page, open and signed off, and
// fails on any box inside the printed document that carries no binding — so a
// box added to a view later without one is caught.

import type { BindType } from "./bindPath";
import { bindAttrs, bindPath } from "./bindPath";
import type {
  ChecklistItem,
  ChecklistSection,
  ComplaintAckData,
  ComplaintChecklistData,
  DailyCheckpointDef,
  DailyPestMonitoringData,
  FlyCatcherData,
  FlyCatcherEntry,
  GapFinding,
  GapInspectionData,
  LogColumn,
  LogFieldType,
  LogHeaderField,
  LogSheetData,
  LogSheetLayout,
  LogSheetRow,
  PestResponsibilitiesData,
  ResponsibilityContact,
  RodentCatch,
  ServiceAgreementData,
  ServiceAgreementParty,
  ServiceReportAreaLine,
  ServiceReportData,
  ServiceTypeChemical,
  SummaryAction,
  TrainingAttendee,
  TrainingRecordData,
} from "../../types";
import type { ComplianceStatement } from "../../data/seed/complianceStatements";
import { isQuantityLine } from "../serviceMaterials";

/** One bound value: where it lives in the record's data, what kind of value it is, what a person calls it. */
export interface Bound {
  path: string;
  type: BindType;
  label: string;
  /** The choices of a select. */
  options?: readonly string[];
  /**
   * The value itself may be missing from the data (a note nobody wrote) while
   * the place for it is there — the path's parent exists, so it can be set.
   */
  optional?: boolean;
}

const NO_ATTRS: Record<string, string> = {};

/** The attributes to spread on the element that shows a bound value; none for null. */
export function bindProps(b: Bound | null | undefined): Record<string, string> {
  return b ? bindAttrs(b.path, b.type, { label: b.label, options: b.options }) : NO_ATTRS;
}

/**
 * One property name as a path segment. The grammar reads a segment of digits
 * as a POSITION in a list, so an object keyed by numbers — the daily register's
 * checkpoints, { 7: { value: "Yes" } } — has its key written escaped ("%37"),
 * which reads back as the NAME "7". Every other name is written as bindPath
 * writes it.
 */
export function propSeg(key: string | number): string {
  const k = String(key);
  return /^\d+$/.test(k) ? `%${k.charCodeAt(0).toString(16).toUpperCase()}${k.slice(1)}` : bindPath(k);
}

/** A list item's segment: by its own key where it has one (so a line added above cannot shift it), else by position. */
function itemSeg(item: unknown, index: number, key = "id"): string {
  const v = item && typeof item === "object" ? (item as Record<string, unknown>)[key] : undefined;
  if (typeof v === "number" || (typeof v === "string" && v !== "")) return key === "id" ? bindPath({ id: v }) : bindPath({ key, value: v });
  return String(index);
}

const join = (...segs: string[]) => segs.join("/");

/** What a letter-style box (components/records/FormField.tsx) holds, by how it is drawn. */
export function formFieldType(kind: "text" | "date" | "long" | undefined): BindType {
  return kind === "date" ? "date" : kind === "long" ? "paragraph" : "text";
}

// ---------------------------------------------------------------------------
// Log sheets (every grid-shaped register — components/records/LogSheetRecordView.tsx)

/** A log sheet's field or column type as a binding type. */
export function logFieldType(type: LogFieldType, multiline?: boolean): BindType {
  switch (type) {
    case "number":
      return "number";
    case "date":
      return "date";
    case "time":
      return "time";
    case "yesno":
      return "yesno";
    case "select":
      return "select";
    case "paragraph":
      return "paragraph";
    default:
      return multiline ? "paragraph" : "text";
  }
}

/**
 * A box above or below the grid — both live in data.header. A box the sheet
 * works out is not bound. A "number" box is written in a text box and held as
 * words (HeaderFieldInput), so it is bound as text: a number put back into the
 * header would not be what the page itself writes there.
 */
export function logHeaderBind(field: LogHeaderField): Bound | null {
  if (field.computed) return null;
  const type = field.type === "number" ? "text" : logFieldType(field.type);
  return { path: join("header", propSeg(field.key)), type, label: field.label, options: type === "select" ? field.options : undefined };
}

/**
 * The column as a given line draws it: a line the form prints blank in a
 * printed column (F/HR/05's two spare topic lines) is written in like any cell.
 */
export function effectiveColumn(col: LogColumn, fixedRow: Record<string, string | number | null> | undefined): LogColumn {
  const printedBlank = col.fixed && fixedRow !== undefined && String(fixedRow[col.key] ?? "") === "";
  return printedBlank ? { ...col, fixed: false } : col;
}

/** What a line is called when a person reads it: the time slot, parameter or unit the form prints on it. */
export function logRowName(row: LogSheetRow, columns: readonly LogColumn[]): string | undefined {
  for (const c of columns) {
    if (!c.fixed) continue;
    const v = row[c.key];
    if (v === null || v === undefined) continue;
    const text = String(v).trim().split("\n")[0].trim();
    if (text) return text.length > 40 ? `${text.slice(0, 39)}…` : text;
  }
  return undefined;
}

/** One cell of the grid; none for a printed (fixed) or worked-out (computed) cell. */
export function logCellBind(row: LogSheetRow, index: number, col: LogColumn, rowName?: string): Bound | null {
  if (col.fixed || col.computed) return null;
  const type = logFieldType(col.type, col.multiline);
  return {
    path: join("rows", bindPath({ id: row.id }), propSeg(col.key)),
    type,
    label: `Row ${index + 1}${rowName ? ` (${rowName})` : ""} · ${col.label}`,
    options: type === "select" ? col.options : undefined,
    // A column added to the format after this line was written has no value on it yet.
    optional: true,
  };
}

/** A grid column new lines are written in (a free-row sheet's heading cell), or null for a printed or worked-out one. */
export function logColumnBind(col: LogColumn): { key: string; type: BindType; options?: readonly string[] } | null {
  if (col.fixed || col.computed) return null;
  const type = logFieldType(col.type, col.multiline);
  return { key: col.key, type, options: type === "select" ? col.options : undefined };
}

export function logSheetBindings(layout: LogSheetLayout, data: LogSheetData): Bound[] {
  const out: Bound[] = [];
  for (const f of [...layout.headerFields, ...(layout.footerFields ?? [])]) {
    const b = logHeaderBind(f);
    if (b) out.push(b);
  }
  if (layout.columns.length === 0) return out;
  const mode = layout.rowMode;
  data.rows.forEach((row, i) => {
    const fixedRow = mode.kind === "fixedRows" ? mode.rows[i] : undefined;
    const name = logRowName(row, layout.columns);
    for (const c of layout.columns) {
      const b = logCellBind(row, i, effectiveColumn(c, fixedRow), name);
      if (b) out.push(b);
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// F/HR/17 — the daily pest monitoring record

export const dailyPestBind = {
  holiday: (): Bound => ({ path: "isHoliday", type: "bool", label: "Holiday / non-working day" }),
  checkpoint: (cp: DailyCheckpointDef): Bound => ({
    path: join("checkpoints", propSeg(cp.no), "value"),
    type: cp.responseType === "number" ? "number" : "yesno",
    label: `Check point ${cp.no}`,
  }),
  checkpointNote: (cp: DailyCheckpointDef): Bound => ({
    path: join("checkpoints", propSeg(cp.no), "note"),
    type: "text",
    label: `Check point ${cp.no} note`,
    optional: true,
  }),
  rodentCatch: (c: RodentCatch, i: number, field: "trapBoxNo" | "location" | "count"): Bound => ({
    path: join("rodentCatches", itemSeg(c, i), field),
    type: field === "count" ? "number" : "text",
    label: `Catch ${i + 1} · ${field === "trapBoxNo" ? "Trap box no." : field === "location" ? "Location" : "No. of rodents"}`,
  }),
  timeOfChecking: (): Bound => ({ path: "timeOfChecking", type: "time", label: "Time of checking" }),
  checker: (): Bound => ({ path: "checker", type: "text", label: "Checker" }),
  action: (a: SummaryAction, i: number, field: "dateOfObservation" | "descriptionOfObservation" | "actionTaken" | "remarks"): Bound => ({
    path: join("summaryActions", itemSeg(a, i), field),
    type: field === "dateOfObservation" ? "date" : "text",
    label: `Action ${i + 1} · ${
      field === "dateOfObservation" ? "Date of observation" : field === "descriptionOfObservation" ? "Description of observation" : field === "actionTaken" ? "Action taken" : "Remarks"
    }`,
  }),
};

/** As the page draws it: a holiday shows the tick and the actions only; the catch table only when checkpoint 7 is Yes. */
export function dailyPestBindings(data: DailyPestMonitoringData, checkpoints: readonly DailyCheckpointDef[]): Bound[] {
  const out: Bound[] = [dailyPestBind.holiday()];
  if (!data.isHoliday) {
    for (const cp of checkpoints) {
      out.push(dailyPestBind.checkpoint(cp));
      if (cp.responseType === "yesno-note") out.push(dailyPestBind.checkpointNote(cp));
    }
    if (data.checkpoints[7]?.value === "Yes") {
      (data.rodentCatches ?? []).forEach((c, i) => {
        for (const f of ["trapBoxNo", "location", "count"] as const) out.push(dailyPestBind.rodentCatch(c, i, f));
      });
    }
    out.push(dailyPestBind.timeOfChecking(), dailyPestBind.checker());
  }
  data.summaryActions.forEach((a, i) => {
    for (const f of ["dateOfObservation", "descriptionOfObservation", "actionTaken", "remarks"] as const) out.push(dailyPestBind.action(a, i, f));
  });
  return out;
}

// ---------------------------------------------------------------------------
// F/HR/18 — a fly catcher visit (its own page, and its line on the monthly register)

export type FlyEntryField = "catchCountApprox" | "tubeLightInstallDate" | "tubeLightDueDate" | "cleaningDoneBy" | "verifiedBy";

const FLY_LABELS: Record<FlyEntryField, string> = {
  catchCountApprox: "Flies catch count",
  tubeLightInstallDate: "Tube light installed",
  tubeLightDueDate: "Tube light due",
  cleaningDoneBy: "Cleaning done by",
  verifiedBy: "Verified by",
};

export const FLY_ENTRY_FIELDS: readonly FlyEntryField[] = ["catchCountApprox", "tubeLightInstallDate", "tubeLightDueDate", "cleaningDoneBy", "verifiedBy"];

export const flyCatcherBind = {
  monthYear: (): Bound => ({ path: "monthYear", type: "text", label: "Month & Year" }),
  entry: (pcId: string, field: FlyEntryField): Bound => ({
    path: join("entries", bindPath({ key: "pcId", value: pcId }), field),
    type: field === "catchCountApprox" ? "number" : field === "tubeLightInstallDate" || field === "tubeLightDueDate" ? "date" : "text",
    label: `${pcId} · ${FLY_LABELS[field]}`,
  }),
};

export function flyCatcherBindings(data: FlyCatcherData): Bound[] {
  const out: Bound[] = [flyCatcherBind.monthYear()];
  for (const e of data.entries) for (const f of FLY_ENTRY_FIELDS) out.push(flyCatcherBind.entry(e.pcId, f));
  return out;
}

/** A visit's line of one unit on the monthly register — bound only where the visit holds that unit's entry. */
export function flyRegisterBindings(data: FlyCatcherData, pcIds: readonly string[]): Bound[] {
  const held = new Set(data.entries.map((e: FlyCatcherEntry) => e.pcId));
  return pcIds.filter((id) => held.has(id)).flatMap((id) => FLY_ENTRY_FIELDS.map((f) => flyCatcherBind.entry(id, f)));
}

// ---------------------------------------------------------------------------
// Pest control service reports

export const serviceReportBind = {
  line: (l: ServiceReportAreaLine, field: "areaName" | "qtyUsed" | "remarks"): Bound => ({
    path: join("lines", bindPath({ key: "slNo", value: l.slNo }), field),
    type: "text",
    label: `Line ${l.slNo}${l.areaName ? ` (${l.areaName})` : ""} · ${field === "areaName" ? "Area" : field === "qtyUsed" ? "Qty used" : "Remarks"}`,
  }),
  /** The quantity is written once, on the first line of its material; the other lines only mirror it. */
  qty: (lines: readonly ServiceReportAreaLine[], index: number): Bound | null =>
    isQuantityLine(lines as ServiceReportAreaLine[], index) ? serviceReportBind.line(lines[index], "qtyUsed") : null,
  technicianSign: (): Bound => ({ path: "technicianSign", type: "text", label: "GPC technician sign" }),
  customerSign: (): Bound => ({ path: "customerSign", type: "text", label: "Customer's representative sign" }),
};

export function serviceReportBindings(data: ServiceReportData): Bound[] {
  const out: Bound[] = [];
  data.lines.forEach((l, i) => {
    out.push(serviceReportBind.line(l, "areaName"));
    const q = serviceReportBind.qty(data.lines, i);
    if (q) out.push(q);
    out.push(serviceReportBind.line(l, "remarks"));
  });
  out.push(serviceReportBind.technicianSign(), serviceReportBind.customerSign());
  return out;
}

// ---------------------------------------------------------------------------
// QA-CAF-00 — the complaint acknowledgement report (a letter of FormFields)

type AckKey = Exclude<keyof ComplaintAckData, "photos">;

const ACK_FIELDS: Record<AckKey, { label: string; kind?: "text" | "date" | "long" }> = {
  reportDate: { label: "Date", kind: "date" },
  toName: { label: "To — name" },
  toDesignation: { label: "To — designation" },
  subject: { label: "Subject" },
  intro: { label: "Introduction", kind: "long" },
  customerName: { label: "Customer name", kind: "long" },
  fgCode: { label: "FG code" },
  complaintReceivedOn: { label: "Complaint received on", kind: "date" },
  jobName: { label: "Job name", kind: "long" },
  complaintType: { label: "Complaint type" },
  complaintSubType: { label: "Complaint sub type" },
  scenario: { label: "Scenario", kind: "long" },
  rootCause: { label: "Root cause", kind: "long" },
  correctiveAction: { label: "Corrective action", kind: "long" },
  preventiveAction: { label: "Preventive action", kind: "long" },
  acknowledgement: { label: "Acknowledgement", kind: "long" },
  employeeName: { label: "Employee name" },
  employeeSignDate: { label: "Employee's date", kind: "date" },
};

export function complaintAckBind(key: AckKey): Bound {
  const f = ACK_FIELDS[key];
  return { path: propSeg(key), type: formFieldType(f.kind), label: f.label };
}

export function complaintAckBindings(_data: ComplaintAckData): Bound[] {
  return (Object.keys(ACK_FIELDS) as AckKey[]).map(complaintAckBind);
}

// ---------------------------------------------------------------------------
// The pest control service agreement, and the responsibilities document

/** One line of a numbered list of clauses (a FormField of kind "long"). */
export function clauseBind(listPath: string, index: number, label: string): Bound {
  return { path: join(propSeg(listPath), String(index)), type: "paragraph", label };
}

type SignatoryField = "organisation" | "name" | "designation" | "department" | "dated";

export function signatoryBind(who: string, whoLabel: string, field: SignatoryField): Bound {
  return {
    path: join(propSeg(who), field),
    type: field === "dated" ? "date" : field === "organisation" ? "paragraph" : "text",
    label: `${whoLabel} · ${field === "dated" ? "Dated" : field.charAt(0).toUpperCase() + field.slice(1)}`,
  };
}

type PartyField = "organisation" | "contactName" | "designation" | "phone" | "email";

export function partyBind(who: string, whoLabel: string, field: PartyField): Bound {
  return {
    path: join(propSeg(who), field),
    type: field === "organisation" ? "paragraph" : "text",
    label: `${whoLabel} · ${field === "contactName" ? "Contact" : field.charAt(0).toUpperCase() + field.slice(1)}`,
  };
}

/**
 * A party's address, held as lines and shown joined by ", ". One line is one
 * value, bound as it is. Several are bound line by line where they are shown
 * as words; the box that edits them joined is not bound (a line of text
 * written over the list would break it) until an edit makes it one line.
 */
export function partyAddressBinds(who: string, whoLabel: string, party: ServiceAgreementParty): { whole: Bound | null; parts: Bound[] | null } {
  const lines = party.addressLines ?? [];
  const at = (i: number): Bound => ({ path: join(propSeg(who), "addressLines", String(i)), type: "paragraph", label: `${whoLabel} · Address${lines.length > 1 ? ` line ${i + 1}` : ""}` });
  if (lines.length === 1) return { whole: at(0), parts: null };
  if (lines.length > 1) return { whole: null, parts: lines.map((_, i) => at(i)) };
  return { whole: null, parts: null };
}

export const agreementBind = {
  field: (key: "agreementNo" | "effectiveFrom" | "effectiveTo" | "providerLicenceNo"): Bound => ({
    path: key,
    type: key === "effectiveFrom" || key === "effectiveTo" ? "date" : "text",
    label: key === "agreementNo" ? "Agreement No." : key === "effectiveFrom" ? "Term from" : key === "effectiveTo" ? "Term to" : "Provider's insecticide licence",
  }),
};

/** The agreement's numbered lists, with how the paper numbers and names each. */
const AGREEMENT_LISTS: [keyof ServiceAgreementData, number, string][] = [
  ["scopeOfServices", 1, "Scope of services"],
  ["serviceSchedule", 2, "Schedule and reporting"],
  ["obligations", 3, "Obligations"],
  ["commercialTerms", 4, "Commercial terms"],
  ["generalTerms", 5, "General"],
];

export function agreementClauseLabel(listPath: string, index: number): string {
  const found = AGREEMENT_LISTS.find(([k]) => k === listPath);
  return found ? `${found[2]} ${found[1]}.${index + 1}` : `${listPath} ${index + 1}`;
}

export function serviceAgreementBindings(data: ServiceAgreementData): Bound[] {
  const out: Bound[] = (["agreementNo", "effectiveFrom", "effectiveTo", "providerLicenceNo"] as const).map(agreementBind.field);
  for (const [who, whoLabel] of [
    ["client", "Client"],
    ["provider", "Service provider"],
  ] as const) {
    const party = data[who];
    out.push(partyBind(who, whoLabel, "organisation"));
    const address = partyAddressBinds(who, whoLabel, party);
    if (address.whole) out.push(address.whole);
    if (address.parts) out.push(...address.parts);
    for (const f of ["contactName", "designation", "phone", "email"] as const) out.push(partyBind(who, whoLabel, f));
  }
  for (const [key] of AGREEMENT_LISTS) {
    (data[key] as string[]).forEach((_, i) => out.push(clauseBind(key, i, agreementClauseLabel(key, i))));
  }
  for (const [who, whoLabel] of [
    ["clientSignatory", "For the client"],
    ["providerSignatory", "For the service provider"],
  ] as const) {
    for (const f of ["organisation", "name", "designation", "dated"] as const) out.push(signatoryBind(who, whoLabel, f));
  }
  return out;
}

export function emergencyCallBind(index: number, field: keyof ResponsibilityContact): Bound {
  return {
    path: join("emergencyCalls", String(index), field),
    type: "text",
    label: `Emergency contact ${index + 1} · ${field === "issue" ? "Issue" : field === "name" ? "Name" : "Phone"}`,
  };
}

export function trainingNoteBind(): Bound {
  return { path: "trainingNote", type: "paragraph", label: "Training note" };
}

/** The lists of the responsibilities document, with how the paper numbers each line. */
export const RESPONSIBILITY_LISTS: [keyof PestResponsibilitiesData, (i: number) => string][] = [
  ["siteResponsibilities", (i) => `Site ${i + 1}`],
  ["equipmentStorage", (i) => `Equipment & storage ${i + 1}`],
  ["ehsClauses", (i) => `EHS ${String.fromCharCode(97 + (i % 26))})`],
  ["serviceClauses", (i) => `Clause ${String.fromCharCode(104 + (i % 22))}.`],
];

export function responsibilityListLabel(listPath: string, index: number): string {
  const found = RESPONSIBILITY_LISTS.find(([k]) => k === listPath);
  return found ? found[1](index) : `${listPath} ${index + 1}`;
}

export function pestResponsibilitiesBindings(data: PestResponsibilitiesData): Bound[] {
  const out: Bound[] = [];
  for (const [key] of RESPONSIBILITY_LISTS) (data[key] as string[]).forEach((_, i) => out.push(clauseBind(key, i, responsibilityListLabel(key, i))));
  data.emergencyCalls.forEach((_, i) => {
    for (const f of ["issue", "name", "phone"] as const) out.push(emergencyCallBind(i, f));
  });
  out.push(trainingNoteBind());
  for (const [who, whoLabel] of [
    ["client", "Client representative"],
    ["provider", "Pest control agency representative"],
  ] as const) {
    for (const f of ["organisation", "name", "designation", "department", "dated"] as const) out.push(signatoryBind(who, whoLabel, f));
  }
  return out;
}

// ---------------------------------------------------------------------------
// F/MKT/05 — the customer complaint handling checklist (CapaPage)

export type ChecklistHeaderKey = "customerName" | "complaintNo" | "jobName" | "jobCode" | "complaintReceivedDate" | "poNo";

const CHECKLIST_HEADER: Record<ChecklistHeaderKey, string> = {
  customerName: "Customer Name",
  complaintNo: "Complaint No.",
  jobName: "Job Name",
  jobCode: "Job Code",
  complaintReceivedDate: "Complaint Received Date",
  poNo: "PO No.",
};

export const checklistBind = {
  header: (key: ChecklistHeaderKey): Bound => ({ path: key, type: key === "complaintReceivedDate" ? "date" : "text", label: CHECKLIST_HEADER[key] }),
  /**
   * An activity's Done tick, its date and its comment. "Not required" is not
   * bound: on the page it is a toggle button and a badge inside the activity's
   * own cell, and binding the badge would make the whole activity cell read as
   * that one value.
   */
  item: (section: Pick<ChecklistSection, "key">, item: Pick<ChecklistItem, "srNo">, field: "done" | "date" | "comment"): Bound => ({
    path: join("sections", bindPath({ key: "key", value: section.key }), "items", bindPath({ key: "srNo", value: item.srNo }), field),
    type: field === "done" ? "bool" : field === "date" ? "date" : "text",
    label: `${section.key}${item.srNo} · ${field === "done" ? "Done" : field === "date" ? "Date" : "Comments"}`,
  }),
  signoff: (who: "preparedBy" | "approvedBy", field: "name" | "designation" | "date"): Bound => ({
    path: join(who, field),
    type: field === "date" ? "date" : "text",
    label: `${who === "preparedBy" ? "Prepared by" : "Approved by"} · ${field === "name" ? "Name" : field === "designation" ? "Designation" : "Sign & date"}`,
  }),
};

export function complaintChecklistBindings(data: ComplaintChecklistData): Bound[] {
  const out: Bound[] = (Object.keys(CHECKLIST_HEADER) as ChecklistHeaderKey[]).map(checklistBind.header);
  for (const s of data.sections) for (const it of s.items) for (const f of ["done", "date", "comment"] as const) out.push(checklistBind.item(s, it, f));
  for (const who of ["preparedBy", "approvedBy"] as const) for (const f of ["name", "designation", "date"] as const) out.push(checklistBind.signoff(who, f));
  return out;
}

// ---------------------------------------------------------------------------
// CAPA — Internal: the inspection findings report (GapPage)

export type FindingField =
  | "findingOfInspection"
  | "commentsOnFindings"
  | "correctiveActionClient"
  | "correctiveActionContractor"
  | "source"
  | "targetDate"
  | "actualDateOfAction"
  | "verifiedByServiceProvider";

const FINDING_LABELS: Record<FindingField, string> = {
  findingOfInspection: "Finding",
  commentsOnFindings: "Comments",
  correctiveActionClient: "Corrective action (client)",
  correctiveActionContractor: "Corrective action (contractor)",
  source: "Source",
  targetDate: "Target date",
  actualDateOfAction: "Actual date",
  verifiedByServiceProvider: "Verified by service provider",
};

export const FINDING_FIELDS = Object.keys(FINDING_LABELS) as FindingField[];

export const FINDING_SOURCES: readonly string[] = ["Internal", "External"];

export const gapBind = {
  meta: (key: "inspectionDate" | "premisesName" | "premisesAddress" | "contactPerson"): Bound => ({
    path: key,
    type: key === "inspectionDate" ? "date" : "text",
    label: key === "inspectionDate" ? "Date of inspection" : key === "premisesName" ? "Premises inspected" : key === "premisesAddress" ? "Premises address" : "Contact person",
  }),
  /**
   * One box of a finding, found by its id (or its S.No where it has none). Its
   * status is not bound: Open and Overdue are worked out from the dates, and
   * Closed is set by the Close button, which dates the action too.
   */
  finding: (f: Pick<GapFinding, "id" | "sNo">, field: FindingField): Bound => ({
    path: join("findings", f.id ? bindPath({ id: f.id }) : bindPath({ key: "sNo", value: f.sNo }), field),
    type: field === "source" ? "select" : field === "targetDate" || field === "actualDateOfAction" ? "date" : "text",
    label: `Finding ${f.sNo} · ${FINDING_LABELS[field]}`,
    options: field === "source" ? FINDING_SOURCES : undefined,
  }),
  comment: (index: number): Bound => ({ path: join("generalComments", String(index)), type: "text", label: `General comment ${index + 1}` }),
};

export function gapInspectionBindings(data: GapInspectionData): Bound[] {
  const out: Bound[] = (["inspectionDate", "premisesName", "premisesAddress", "contactPerson"] as const).map(gapBind.meta);
  for (const f of data.findings) for (const field of FINDING_FIELDS) out.push(gapBind.finding(f, field));
  data.generalComments.forEach((_, i) => out.push(gapBind.comment(i)));
  return out;
}

// ---------------------------------------------------------------------------
// The training record (TrainingPage)

export const trainingBind = {
  field: (key: "trainingDate" | "trainingType" | "trainerProvider" | "certificateRef" | "remarks"): Bound => ({
    path: key,
    type: key === "trainingDate" ? "date" : key === "remarks" ? "paragraph" : "text",
    label:
      key === "trainingDate" ? "Training date" : key === "trainingType" ? "Training type" : key === "trainerProvider" ? "Trainer / provider" : key === "certificateRef" ? "Certificate / reference" : "Remarks",
  }),
  topic: (index: number): Bound => ({ path: join("topics", String(index)), type: "text", label: `Topic ${index + 1}` }),
  attendee: (a: TrainingAttendee, index: number, field: "employeeName" | "department"): Bound => ({
    path: join("attendees", itemSeg(a, index), field),
    type: "text",
    label: `Attendee ${index + 1} · ${field === "employeeName" ? "Employee" : "Department"}`,
  }),
};

export function trainingBindings(data: TrainingRecordData): Bound[] {
  const out: Bound[] = (["trainingDate", "trainingType", "trainerProvider", "certificateRef"] as const).map(trainingBind.field);
  data.topics.forEach((_, i) => out.push(trainingBind.topic(i)));
  data.attendees.forEach((a, i) => {
    out.push(trainingBind.attendee(a, i, "employeeName"), trainingBind.attendee(a, i, "department"));
  });
  out.push(trainingBind.field("remarks"));
  return out;
}

// ---------------------------------------------------------------------------
// Reference documents: a Statement of Compliance, the Pesticide Application Chart

export const complianceBind = {
  field: (key: "headerTitle" | "footerRef" | "signedOn" | "referenceSource" | "signedBy" | "signedTitle"): Bound => ({
    path: key,
    type: key === "signedOn" ? "date" : "text",
    // Shown (as a box) while Edit is on even when the statement has none yet.
    optional: key === "referenceSource" || undefined,
    label:
      key === "headerTitle"
        ? "Title"
        : key === "footerRef"
          ? "Format / Rev"
          : key === "signedOn"
            ? "Date of publication"
            : key === "referenceSource"
              ? "Reference source"
              : key === "signedBy"
                ? "Signed by"
                : "Title of signatory",
  }),
  sectionLabel: (index: number): Bound => ({ path: join("sections", String(index), "label"), type: "text", label: `Section ${index + 1} · Heading` }),
  /** One line of a section, where the lines are shown one by one (not while Edit holds them in one box). */
  sectionLine: (index: number, line: number): Bound => ({
    path: join("sections", String(index), "lines", String(line)),
    type: "text",
    label: `Section ${index + 1} · Line ${line + 1}`,
  }),
  declaration: (index: number): Bound => ({ path: join("declarations", String(index)), type: "paragraph", label: `Declaration ${index + 1}` }),
};

export function complianceBindings(s: ComplianceStatement, editing: boolean): Bound[] {
  const out: Bound[] = [complianceBind.field("headerTitle"), complianceBind.field("footerRef"), complianceBind.field("signedOn")];
  if (s.referenceSource || editing) out.push(complianceBind.field("referenceSource"));
  s.sections.forEach((sec, i) => {
    out.push(complianceBind.sectionLabel(i));
    if (!editing) sec.lines.forEach((_, li) => out.push(complianceBind.sectionLine(i, li)));
  });
  s.declarations.forEach((_, i) => out.push(complianceBind.declaration(i)));
  out.push(complianceBind.field("signedBy"), complianceBind.field("signedTitle"));
  return out;
}

export const chemicalBind = {
  field: (r: ServiceTypeChemical, index: number, field: "serviceName" | "pestCovered" | "dilutionRatio"): Bound => ({
    path: join("rows", itemSeg(r, index), field),
    type: field === "pestCovered" ? "paragraph" : "text",
    label: `Row ${index + 1}${r.serviceName ? ` (${r.serviceName})` : ""} · ${field === "serviceName" ? "Services name" : field === "pestCovered" ? "Pest covered" : "Dilution ratio"}`,
  }),
  /** One chemical, where the chemicals are shown one by one (not while Edit holds them in one box). */
  chemical: (r: ServiceTypeChemical, index: number, chemical: number): Bound => ({
    path: join("rows", itemSeg(r, index), "chemicals", String(chemical)),
    type: "text",
    label: `Row ${index + 1}${r.serviceName ? ` (${r.serviceName})` : ""} · Chemical ${chemical + 1}`,
  }),
};

/** The chart's data as its page hands it to the assistant (and to an upload): { rows }. */
export function chemicalMasterBindings(rows: readonly ServiceTypeChemical[], editing: boolean): Bound[] {
  const out: Bound[] = [];
  rows.forEach((r, i) => {
    out.push(chemicalBind.field(r, i, "serviceName"), chemicalBind.field(r, i, "pestCovered"));
    if (!editing) r.chemicals.forEach((_, ci) => out.push(chemicalBind.chemical(r, i, ci)));
    out.push(chemicalBind.field(r, i, "dilutionRatio"));
  });
  return out;
}

// ---------------------------------------------------------------------------
// every kind at once — what the test walks

export interface BindingContext {
  /** log-sheet: the layout the record is drawn with (getLogSheetLayoutForRecord). */
  layout?: LogSheetLayout;
  /** daily-pest-monitoring: the master checkpoint list. */
  checkpoints?: readonly DailyCheckpointDef[];
  /** Reference documents: whether Edit is on (a list edited as one box is not bound then). */
  editing?: boolean;
}

/** Every value the page for this kind of document binds, for this data; null for a kind no page binds. */
export function bindingsForRecord(kind: string, data: unknown, ctx: BindingContext = {}): Bound[] | null {
  switch (kind) {
    case "log-sheet":
      return ctx.layout ? logSheetBindings(ctx.layout, data as LogSheetData) : [];
    case "daily-pest-monitoring":
      return dailyPestBindings(data as DailyPestMonitoringData, ctx.checkpoints ?? []);
    case "fly-catcher":
      return flyCatcherBindings(data as FlyCatcherData);
    case "service-report":
      return serviceReportBindings(data as ServiceReportData);
    case "complaint-ack":
      return complaintAckBindings(data as ComplaintAckData);
    case "service-agreement":
      return serviceAgreementBindings(data as ServiceAgreementData);
    case "pest-responsibilities":
      return pestResponsibilitiesBindings(data as PestResponsibilitiesData);
    case "complaint-checklist":
      return complaintChecklistBindings(data as ComplaintChecklistData);
    case "gap-inspection":
      return gapInspectionBindings(data as GapInspectionData);
    case "training-record":
      return trainingBindings(data as TrainingRecordData);
    case "compliance-statement":
      return complianceBindings(data as ComplianceStatement, !!ctx.editing);
    case "chemical-master":
      return chemicalMasterBindings((data as { rows: ServiceTypeChemical[] }).rows ?? [], !!ctx.editing);
    default:
      return null;
  }
}
