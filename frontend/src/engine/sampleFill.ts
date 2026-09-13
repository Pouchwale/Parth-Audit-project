import type {
  ChecklistItem,
  ComplaintAckData,
  ComplaintChecklistData,
  DocumentDefinition,
  GapFinding,
  GapInspectionData,
  MasterData,
  PestResponsibilitiesData,
  RecordInstance,
  ServiceAgreementData,
  TrainingRecordData,
} from "../types";
import { TBC } from "../types";
import { documentRepository } from "../data/repositories/documentRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { newComplaintChecklistData, COMPLAINT_DOC_ID } from "../data/seed/complaintChecklist";
import { COMPANY } from "../data/seed/masterData";
import { autoFillRecord } from "./autoFill";
import { latestConfirmedRecord } from "./assistantPrepare";
import { nextComplaintNo } from "./documentFormats";
import { fieldLabels } from "./recordPatch";
import { saveDraft } from "./recordLifecycle";
import { addDays, compareISO, formatDisplayDate, todayISO } from "../utils/date";
import { generateId } from "../utils/id";
import { makeRng, type Rng } from "../utils/random";

// SAMPLE DATA FOR EVERY DOCUMENT — what "fill it with sample data" / "generate
// an external CAPA for me" produces (the department's request, 13-Sep-2026:
// the assistant should be able to fill any document on its own, and what it
// writes should read like a real one).
//
// Two rules keep this honest:
//  * The values are REALISTIC BUT MADE UP, and the chat says so every time.
//    Names are the plant's own people and areas (Master Data), customers and
//    jobs are the ones on the plant's own specimens plus plausible ones, the
//    codes follow the department's formats (engine/documentFormats.ts), and
//    every date is a real working date near the record's own. Nothing that
//    identifies a real outside company beyond what the source documents
//    already carry is invented.
//  * It is a DRAFT like any other assistant fill: saved with a history line,
//    listed back, undoable, and never submitted by the assistant itself.
//
// The routine registers (daily monitoring, fly catcher, service reports, the
// lamination / QC log sheets) reuse the calibrated auto-fill
// (engine/autoFill.ts), which already produces a plausible day; this module
// adds the documents that auto-fill deliberately never touches — the CAPA
// paperwork, training, the agreements — because there is nothing routine
// about a finding, so they are only ever filled when somebody asks.

export const SAMPLE_FILL_NOTE = "Filled with sample data by the assistant, on request — realistic, but made up";

export interface SampleFillResult {
  data: unknown;
  /** Plain-language lines on what was filled and where the values came from. */
  summary: string[];
}

/** Complete data for this record, filled with sample values. */
export function sampleFillRecord(doc: DocumentDefinition, record: RecordInstance, master: MasterData, userName: string): SampleFillResult | null {
  const rng = makeRng(`sample|${doc.id}|${record.id}`);
  const today = todayISO();
  switch (doc.kind) {
    case "daily-pest-monitoring":
    case "fly-catcher":
    case "service-report":
    case "log-sheet": {
      const previous = latestConfirmedRecord(doc.id, record.dueDate, record.isDemo);
      const filled = autoFillRecord(doc, record.dueDate, master, previous);
      if (!filled) return null;
      return { data: filled.data, summary: [...filled.notes, `Based on ${filled.basedOn}.`] };
    }
    case "training-record":
      return fillTraining(doc, record, master, rng, today);
    case "gap-inspection":
      return fillInspection(record.data as GapInspectionData, rng, today);
    case "complaint-checklist":
      return fillComplaintChecklist(record, userName, rng, today);
    case "complaint-ack":
      return fillComplaintAck(record.data as ComplaintAckData, master, rng, today);
    case "pest-responsibilities":
      return fillResponsibilities(record.data as PestResponsibilitiesData, today);
    case "service-agreement":
      return fillAgreement(record.data as ServiceAgreementData, rng, today);
    default:
      return null;
  }
}

/**
 * Fills a stored record in place (for the full-page assistant, where no record
 * page is open to commit through) and returns it with the history line added.
 */
export function sampleFillStoredRecord(recordId: string, actorName: string): { record: RecordInstance; summary: string[] } | undefined {
  const record = recordRepository.getById(recordId);
  if (!record) return undefined;
  const doc = documentRepository.getById(record.documentId);
  if (!doc) return undefined;
  const result = sampleFillRecord(doc, record, masterRepository.get(), actorName);
  if (!result) return undefined;
  const saved = saveDraft(record, result.data, actorName, { action: "assistant-edit", note: SAMPLE_FILL_NOTE, labels: fieldLabels(doc.kind, doc.id) });
  return { record: saved, summary: result.summary };
}

// ---------------------------------------------------------------------------
// the pools — this plant's own people, areas and customers, and the kind of
// thing that actually gets written on its paperwork

/** Customers and jobs: the ones on the plant's own filled specimens first. */
const CUSTOMERS: { name: string; jobs: string[]; jobType: string }[] = [
  { name: "Gulab Oil And Foods Pvt. Ltd.", jobs: ["Gulab Oil Pouch Film", "California Almonds and Whole Cashews"], jobType: "PO" },
  { name: "VP Bedekar & Sons Pvt. Ltd.", jobs: ["VP Bedekar Fenugreek Powder", "VP Bedekar Cumin Powder", "VP Bedekar Dry Ginger Powder"], jobType: "PO" },
  { name: "Sweet Karam Coffee", jobs: ["Sweet Karam Gusset"], jobType: "PO" },
  { name: "Shreeji Spices Pvt. Ltd.", jobs: ["Shreeji Garam Masala 100 g Pouch", "Shreeji Turmeric 200 g Laminate"], jobType: "PO" },
  { name: "Navkar Foods & Beverages", jobs: ["Navkar Jeera Soda 250 ml Shrink Sleeve", "Navkar Lemon 600 ml Sleeve"], jobType: "SL" },
  { name: "Mehsana Dairy Products", jobs: ["Dahi 400 g Cup Label", "Chaas 200 ml Sleeve"], jobType: "LA" },
  { name: "Radhe Namkeen Udhyog", jobs: ["Radhe Chana Jor 45 g Pouch", "Radhe Sev Mamra 200 g Laminate"], jobType: "PO" },
  { name: "Siddhi Agro Foods", jobs: ["Siddhi Groundnut Oil 1 L Label", "Siddhi Cottonseed Oil 5 L Label"], jobType: "LA" },
];

interface ComplaintCase {
  type: string;
  subType: string;
  scenario: string;
  rootCause: string;
  corrective: string;
  preventive: string;
  /** Employee training was part of the CAPA. */
  training: boolean;
  /** Complaint samples were needed for the investigation. */
  samples: boolean;
}

const COMPLAINTS: ComplaintCase[] = [
  {
    type: "Process related",
    subType: "Deviation from specification",
    scenario:
      "Shade variation noticed between roll 2 and roll 3 of the same job — the front panel red printed darker on roll 3. Reported by the customer's incoming QC with photographs of both rolls side by side.",
    rootCause: "Ink viscosity on the red station drifted during the run; one hourly viscosity check was missed and make-up solvent was added late.",
    corrective: "Affected roll quarantined at the customer and replaced; balance stock of the lot inspected 100% against the approved shade card.",
    preventive: "Hourly ink viscosity check reinforced with the operator's sign on F/QC/13; the approved shade card kept at the machine for every run.",
    training: true,
    samples: true,
  },
  {
    type: "Process related",
    subType: "Seal failure",
    scenario: "Pouches opening at the bottom gusset seal during filling on the customer's line; about 3% of the lot affected.",
    rootCause: "Sealing jaw temperature on the pouching machine found 10 °C below the set-point after a heater element failed part-way through the shift.",
    corrective: "Lot segregated and 100% leak tested; failed pouches scrapped and the quantity replaced free of cost.",
    preventive: "Heater elements checked at every shift start; a seal-strength sample test added on F/QC/37 for every new roll.",
    training: true,
    samples: true,
  },
  {
    type: "Process related",
    subType: "Missing HM strip",
    scenario: "Shrink sleeves not holding on the container — the hot-melt (HM) strip missing on part of the lot.",
    rootCause: "The job card for the repeat order did not carry the HM strip instruction, so the operator ran it as a plain sleeve.",
    corrective: "Balance stock re-run with the HM strip applied; the affected quantity replaced.",
    preventive: "Job card format revised to carry a mandatory HM strip Yes / No field, checked by QA before the run starts.",
    training: true,
    samples: true,
  },
  {
    type: "Process related",
    subType: "Registration shift",
    scenario: "Text on the back panel shifted by about 1 mm to the left over the last 800 metres of the roll.",
    rootCause: "Register sensor lens dusty after a long run; the auto-register corrected late.",
    corrective: "Affected length identified and cut out; roll re-wound and re-inspected before dispatch.",
    preventive: "Register sensor cleaning added to the shift-start checklist of the printing machine.",
    training: false,
    samples: false,
  },
  {
    type: "Packing related",
    subType: "Short length",
    scenario: "Roll length received found about 4% short against the metres declared on the roll label.",
    rootCause: "The meter counter on the slitting machine was not re-zeroed after a roll change.",
    corrective: "Shortfall quantity supplied with the next dispatch; credit note issued for the difference.",
    preventive: "Meter counter reset made a step of the roll change on F/QC/35; one roll per lot length-audited at random.",
    training: false,
    samples: false,
  },
  {
    type: "Process related",
    subType: "Foreign particle",
    scenario: "Ink specks visible inside the printed area on some pouches of the lot.",
    rootCause: "Dried ink flakes from the doctor blade holder falling onto the web during the run.",
    corrective: "Lot 100% inspected on the inspection machine; defective pouches removed.",
    preventive: "Doctor blade holder cleaning frequency increased to every two hours during a run.",
    training: true,
    samples: true,
  },
];

/** Findings in the wording this plant's own inspections use (the Dec-2023 GAP report, the technicians' remarks). */
const INSPECTION_FINDINGS: { finding: string; comments: string; client: string; contractor: string }[] = [
  {
    finding: "Gap of about 15 mm below the RM inward shutter — daylight visible from inside.",
    comments: "Rodent entry point; the shutter does not meet the floor.",
    client: "Fit a rubber floor seal / brush strip to the bottom of the shutter.",
    contractor: "NA",
  },
  {
    finding: "Fly killer unit PC-04 (Pouching area) found switched off at the time of inspection.",
    comments: "Unit ineffective while off; flies observed near the pouching machine.",
    client: "Keep every fly killer unit energised round the clock; shift in-charge to check at shift start.",
    contractor: "Tube light checked and the unit re-energised during the visit.",
  },
  {
    finding: "Rodent bait station numbering missing at three locations on the first floor.",
    comments: "Stations cannot be traced against the pest control layout.",
    client: "Number the stations on the wall as per the layout (RB-27, RB-28, RB-29).",
    contractor: "Copy of the layout handed over to the site.",
  },
  {
    finding: "Raw material stored against the wall in the paper storage area.",
    comments: "Provides hiding and breeding space for pests; the wall cannot be inspected.",
    client: "Maintain a clear gap of 1 to 2 feet between the pallets and the wall.",
    contractor: "NA",
  },
  {
    finding: "PVC strip curtain at the dispatch gate torn — three strips missing.",
    comments: "Flying insect entry during dispatch.",
    client: "Replace the damaged strips; check every curtain weekly.",
    contractor: "NA",
  },
  {
    finding: "Open drain point near the canteen wash area without a cover.",
    comments: "Cockroach harbourage; drain smell noted.",
    client: "Fit a drain cover / trap; keep the wash area dry after use.",
    contractor: "Gel treatment done around the drain.",
  },
  {
    finding: "Food waste bin in the canteen without a lid.",
    comments: "Attracts flies and rodents.",
    client: "Provide lidded, foot-operated bins; empty and wash them daily.",
    contractor: "NA",
  },
  {
    finding: "Cable entry hole in the utility area wall left open after the new cable was laid.",
    comments: "Rodent entry point of about 40 mm.",
    client: "Seal the opening with cement / metal mesh.",
    contractor: "NA",
  },
  {
    finding: "Glue board in RB-12 (Ink store) found dusty and no longer sticky.",
    comments: "Board saturated with dust; ineffective.",
    client: "Replace glue boards fortnightly, or sooner when soiled.",
    contractor: "Glue board replaced during the visit.",
  },
];

const GENERAL_COMMENTS = [
  "Make sure plastic waste is regularly removed from the site by a licensed disposal company.",
  "When storing raw material and finished product, allow a distance of 1 to 2 feet between the pallets and the wall.",
  "Keep all external doors closed when not in use; self-closers to be checked weekly.",
  "Housekeeping in the canteen and the wash areas to be completed before the night shift leaves.",
];

const OPERATOR_DESIGNATIONS = ["Machine Operator (Lombardi)", "Lamination Operator", "Pouching Machine Operator", "Slitting Operator", "Shift In-charge — Printing"];
const CLIENT_CONTACTS = ["Ms. Kapila Barad", "Chirag Parmar"];

/** The plant's people by department, for the "to" and "employee" lines. */
function shopFloorNames(master: MasterData, rng: Rng): string[] {
  const names = master.employees
    .filter((e) => e.active && /production|quality/i.test(e.department ?? "") && !/TO BE CONFIRMED|initials/i.test(e.role) && e.name.length > 3)
    .map((e) => e.name.replace(/^(Mr|Ms|Mrs)\.\s*/, ""));
  const fallback = ["Gaurav Singh", "Pankajbhai", "Akash Patel", "Harsh Parmar", "Mukesh Patel"];
  const pool = names.length >= 3 ? names : [...names, ...fallback];
  return pool.slice().sort(() => rng.next() - 0.5);
}

function fgCode(jobType: string, rng: Rng): string {
  return `FG${jobType}${String(rng.int(1000, 9999))}`;
}

function poNumber(rng: Rng): string {
  return String(10000000 + rng.int(1000, 99999));
}

/** A working date `daysBack` before `today` — never in the future. */
function daysAgo(today: string, daysBack: number): string {
  return addDays(today, -Math.max(0, daysBack));
}

function capToday(dateISO: string, today: string): string {
  return compareISO(dateISO, today) > 0 ? today : dateISO;
}

// ---------------------------------------------------------------------------
// Training

function fillTraining(doc: DocumentDefinition, record: RecordInstance, master: MasterData, rng: Rng, today: string): SampleFillResult | null {
  const previous = latestConfirmedRecord(doc.id, record.dueDate, record.isDemo);
  const filled = autoFillRecord(doc, record.dueDate, master, previous);
  if (!filled) return null;
  const base = filled.data as TrainingRecordData;
  // Attendance is what auto-fill refuses to assume; a sample record marks most
  // people present, one or two absent, as an attendance sheet usually reads.
  let attendees = base.attendees.map((a) => ({ ...a, attended: rng.chance(0.85) }));
  if (!attendees.some((a) => a.attended) && attendees.length > 0) attendees = attendees.map((a, i) => ({ ...a, attended: i === 0 ? true : a.attended }));
  const year = (base.trainingDate || today).slice(0, 4);
  const data: TrainingRecordData = {
    ...base,
    trainingDate: capToday(base.trainingDate || record.dueDate, today),
    certificateRef: base.certificateRef || `Attendance sheet & certificate — GPC/TRN/${year}/${String(rng.int(1, 12)).padStart(2, "0")}`,
    remarks: base.remarks || `Conducted at ${COMPANY.address.split(",").slice(0, 3).join(",")} by ${base.trainerProvider}; signed Rohit Patel. Absentees to attend the next session.`,
    attendees,
  };
  const present = attendees.filter((a) => a.attended).length;
  return {
    data,
    summary: [
      `${data.trainingType} on ${formatDisplayDate(data.trainingDate)} by ${data.trainerProvider}, with the ${data.topics.length} standard topics.`,
      `${present} of ${attendees.length} invitees marked present, certificate reference and remarks written.`,
    ],
  };
}

// ---------------------------------------------------------------------------
// CAPA — Internal: the inspection findings report

function fillInspection(current: GapInspectionData, rng: Rng, today: string): SampleFillResult {
  const inspectionDate = capToday(current.inspectionDate || today, today);
  const wanted = rng.int(3, 5);
  const pool = INSPECTION_FINDINGS.slice().sort(() => rng.next() - 0.5).slice(0, wanted);
  const existing = current.findings.filter((f) => f.findingOfInspection.trim());
  const findings: GapFinding[] = [...existing];
  pool.forEach((p, i) => {
    if (findings.length >= wanted) return;
    const targetDays = rng.pick([7, 15, 15, 21, 30]);
    const targetDate = addDays(inspectionDate, targetDays);
    // A finding or two is already closed, the way a report reads a fortnight on.
    const closed = rng.chance(0.3) && compareISO(addDays(inspectionDate, 3), today) <= 0;
    findings.push({
      id: generateId("finding"),
      sNo: findings.length + 1,
      findingOfInspection: p.finding,
      commentsOnFindings: p.comments,
      correctiveActionContractor: p.contractor,
      correctiveActionClient: p.client,
      targetDate,
      actualDateOfAction: closed ? capToday(addDays(inspectionDate, rng.int(2, Math.max(2, Math.min(targetDays, 10)))), today) : null,
      verifiedByServiceProvider: closed ? "Yogesh Rathod" : "",
      status: closed ? "Closed" : "Open",
      source: i === 0 && rng.chance(0.4) ? "External" : "Internal",
    });
  });
  const comments = current.generalComments.filter((c) => c.trim());
  const generalComments = comments.length ? comments : GENERAL_COMMENTS.slice().sort(() => rng.next() - 0.5).slice(0, 2);
  const data: GapInspectionData = {
    inspectionDate,
    premisesName: current.premisesName || COMPANY.name,
    premisesAddress: current.premisesAddress || COMPANY.address,
    contactPerson: current.contactPerson || rng.pick(CLIENT_CONTACTS),
    findings,
    generalComments,
  };
  const open = findings.filter((f) => f.status === "Open").length;
  return {
    data,
    summary: [
      `Inspection of ${formatDisplayDate(inspectionDate)} at ${data.premisesName}, contact ${data.contactPerson}.`,
      `${findings.length} findings in the plant's own wording, each with comments, the corrective action and a target date — ${open} open, ${findings.length - open} already closed.`,
      `${generalComments.length} general comments.`,
    ],
  };
}

// ---------------------------------------------------------------------------
// CAPA — External: the customer complaint handling checklist (F/MKT/05)

/** What gets written against each printed activity, given the case. */
function checklistComment(srNo: number, c: ComplaintCase, customer: string): string {
  switch (srNo) {
    case 1:
      return "Details received with the complaint — not required.";
    case 2:
      return `Complaint mail with photographs received from ${customer}.`;
    case 3:
      return "Registered in the complaint register.";
    case 4:
      return `${c.type} — ${c.subType}.`;
    case 5:
      return c.samples ? "Major — affects use of the product at the customer." : "Minor — cosmetic, product usable.";
    case 7:
      return "Retained samples of the lot checked in the QC lab.";
    case 8:
      return "Production register and job card of the lot checked.";
    case 9:
      return "In-process QC and final inspection records of the lot checked.";
    case 10:
      return c.samples ? "Defective samples received from the customer by courier." : "Photographs sufficient — samples not required.";
    case 11:
      return c.scenario.split(" — ")[0].replace(/\.$/, "") + ".";
    case 12:
      return "Meeting with Production, QC and Marketing.";
    case 13:
      return "Attendance recorded on the meeting minutes.";
    case 14:
      return c.rootCause;
    case 15:
      return "Operator and shift in-charge interviewed; statements on file.";
    case 16:
    case 17:
      return c.corrective;
    case 18:
    case 19:
      return c.preventive;
    case 20:
      return c.training ? "Toolbox talk held for the shift concerned." : "Not required — no operator error involved.";
    case 21:
      return "Not required — no supplier material involved.";
    case 22:
      return "Not required — resolved by mail and telephone.";
    case 23:
      return "Interim mail sent to the customer with the initial findings.";
    case 24:
      return "Findings shared with the Marketing / Coordination team.";
    case 25:
      return "Photographs, QC records and the corrected job card attached.";
    case 26:
      return "CAPA report prepared on the QA-CAF format.";
    case 27:
      return "Reviewed and approved by the QA Head.";
    case 28:
      return "Final response mailed to the customer.";
    case 29:
      return "Next lot inspected against the same points — no recurrence.";
    case 30:
      return `${customer} accepted the corrective action and the replacement.`;
    case 31:
      return "Closure approved by the QA Head.";
    case 32:
      return "Closed in the complaint register.";
    default:
      return "";
  }
}

/** The day on which each section's activities were done, counted from receipt. */
function sectionDay(key: string, srNo: number, rng: Rng): number {
  switch (key) {
    case "A":
      return srNo <= 2 ? 0 : 1;
    case "B":
      return rng.int(1, 5);
    case "C":
      return rng.int(5, 9);
    case "D":
      return rng.int(7, 11);
    default:
      return rng.int(11, 15);
  }
}

function fillComplaintChecklist(record: RecordInstance, userName: string, rng: Rng, today: string): SampleFillResult {
  const current = record.data as ComplaintChecklistData;
  const customer = rng.pick(CUSTOMERS);
  const c = rng.pick(COMPLAINTS);
  // Received a fortnight or more ago, so the whole checklist — through closure
  // — can honestly carry dates that have already happened.
  const received = current.complaintReceivedDate ?? daysAgo(today, rng.int(16, 24));
  const existingNumbers = (recordRepository.query({ documentId: COMPLAINT_DOC_ID, isDemo: record.isDemo }) as RecordInstance<ComplaintChecklistData>[])
    .filter((r) => r.id !== record.id)
    .map((r) => r.data.complaintNo);
  const base = current.sections?.length ? current : newComplaintChecklistData(nextComplaintNo(existingNumbers));
  const customerName = current.customerName || customer.name;
  const sections = base.sections.map((s) => ({
    ...s,
    items: s.items.map((it): ChecklistItem => {
      if (it.done || it.notRequired || it.comment.trim()) return it;
      const comment = checklistComment(it.srNo, c, customerName);
      // A1 asks for details only "if not received" — they were; B10 wants
      // samples only "if required".
      const notRequired = /^not required/i.test(comment) || it.srNo === 1 || (it.srNo === 10 && !c.samples);
      const date = capToday(addDays(received, sectionDay(s.key, it.srNo, rng)), today);
      return notRequired ? { ...it, done: false, notRequired: true, date: null, comment } : { ...it, done: true, notRequired: false, date, comment };
    }),
  }));
  const data: ComplaintChecklistData = {
    ...base,
    customerName,
    complaintNo: current.complaintNo || base.complaintNo || nextComplaintNo(existingNumbers),
    jobName: current.jobName || rng.pick(customer.jobs),
    jobCode: current.jobCode || fgCode(customer.jobType, rng),
    poNo: current.poNo || poNumber(rng),
    complaintReceivedDate: received,
    sections,
    preparedBy: {
      name: current.preparedBy.name || userName,
      designation: current.preparedBy.designation || "QA Executive",
      date: current.preparedBy.date ?? today,
    },
    approvedBy: current.approvedBy,
  };
  const items = sections.flatMap((s) => s.items);
  const done = items.filter((it) => it.done).length;
  const nr = items.filter((it) => it.notRequired).length;
  return {
    data,
    summary: [
      `Complaint ${data.complaintNo} from ${data.customerName} — ${data.jobName} (${data.jobCode}, PO ${data.poNo}), received ${formatDisplayDate(received)}: ${c.subType.toLowerCase()}.`,
      `All ${items.length} activities answered — ${done} done on dates from receipt to closure, ${nr} not required — with a comment against each.`,
      `Prepared by ${data.preparedBy.name} (${data.preparedBy.designation}); approval is left for the QA Head.`,
    ],
  };
}

// ---------------------------------------------------------------------------
// CAPA — Internal: the complaint acknowledgement report (QA-CAF-00)

function fillComplaintAck(current: ComplaintAckData, master: MasterData, rng: Rng, today: string): SampleFillResult {
  const customer = rng.pick(CUSTOMERS);
  const c = rng.pick(COMPLAINTS);
  const names = shopFloorNames(master, rng);
  const toName = current.toName || names[0];
  const received = current.complaintReceivedOn || daysAgo(today, rng.int(3, 9));
  const data: ComplaintAckData = {
    ...current,
    reportDate: capToday(current.reportDate || today, today),
    toName,
    toDesignation: current.toDesignation || rng.pick(OPERATOR_DESIGNATIONS),
    customerName: current.customerName || customer.name,
    fgCode: current.fgCode || fgCode(customer.jobType, rng),
    complaintReceivedOn: received,
    jobName: current.jobName || rng.pick(customer.jobs),
    // The form's own suggestions ("Process related" / "Deviation from
    // specification") are among the cases; the others read the same way.
    complaintType: current.complaintType || c.type,
    complaintSubType: current.complaintSubType || c.subType,
    scenario: current.scenario || c.scenario,
    rootCause: current.rootCause || c.rootCause,
    correctiveAction: current.correctiveAction || c.corrective,
    preventiveAction: current.preventiveAction || c.preventive,
    employeeName: current.employeeName || toName,
    employeeSignDate: current.employeeSignDate || capToday(addDays(received, rng.int(1, 3)), today),
  };
  return {
    data,
    summary: [
      `Complaint from ${data.customerName} on ${data.jobName} (${data.fgCode}), received ${formatDisplayDate(received)} — ${c.subType.toLowerCase()}.`,
      `Explained to ${data.toName} (${data.toDesignation}): the scenario, root cause, corrective and preventive action written; acknowledged and signed ${formatDisplayDate(data.employeeSignDate)}.`,
      "No photographs were added — attach the real ones on the form.",
    ],
  };
}

// ---------------------------------------------------------------------------
// Responsibilities of Pest Control — the two signatures

function fillResponsibilities(current: PestResponsibilitiesData, today: string): SampleFillResult {
  const data: PestResponsibilitiesData = {
    ...current,
    emergencyCalls: current.emergencyCalls.map((c) =>
      c.issue === "Critical Hazards issues" && !c.name.trim() ? { ...c, name: "Security Office (plant)", phone: "02762 224214" } : c
    ),
    client: {
      ...current.client,
      name: current.client.name || "Chirag Parmar",
      designation: current.client.designation || "Manager",
      department: current.client.department || "Purchase",
      dated: current.client.dated || today,
    },
    provider: {
      ...current.provider,
      name: current.provider.name || "Rohit Patel",
      designation: current.provider.designation || "Owner",
      department: current.provider.department || "NA",
      dated: current.provider.dated || today,
    },
  };
  return {
    data,
    summary: [
      "The printed responsibilities are kept word for word; only what the paper leaves for the two parties is filled.",
      `Signed for the site by ${data.client.name} (${data.client.designation}, ${data.client.department}) and for the provider by ${data.provider.name} (${data.provider.designation}), dated ${formatDisplayDate(data.client.dated)}; the critical-hazards contact set to the plant's security office.`,
    ],
  };
}

// ---------------------------------------------------------------------------
// The service agreement — what the format leaves TO BE CONFIRMED

function fillAgreement(current: ServiceAgreementData, rng: Rng, today: string): SampleFillResult {
  const isTbc = (s: string) => !s.trim() || s.includes(TBC);
  const year = (current.effectiveFrom || today).slice(0, 4);
  const perMonth = rng.pick([8500, 9000, 9500, 11000, 12000]);
  const commercial = [
    `Service charges for the term: ₹ ${(perMonth * 12).toLocaleString("en-IN")} per year (₹ ${perMonth.toLocaleString("en-IN")} per month), inclusive of all materials and the visits scheduled in the SOP.`,
    "Payment terms: monthly invoice raised by the 7th of the following month, payable within 30 days by bank transfer.",
    "Taxes (GST) and the provider's GSTIN: GST at 18% extra as applicable, charged on every invoice against the provider's GSTIN.",
    "What is included and what is charged as an additional visit: all scheduled visits, materials, trend analysis and the yearly awareness training are included; an emergency call-out outside the schedule is charged at ₹ 1,500 per visit plus material.",
  ];
  const commercialTerms = current.commercialTerms.map((line, i) => (isTbc(line) ? commercial[i] ?? line : line));
  const generalTerms = current.generalTerms.map((line) =>
    line.includes(TBC)
      ? line.replace(/the notice period is TO BE CONFIRMED/, "the notice period is thirty days").replace(/the extent is TO BE CONFIRMED/, "the extent is limited to one year's service charges")
      : line
  );
  const data: ServiceAgreementData = {
    ...current,
    agreementNo: isTbc(current.agreementNo) ? `GPC/AG/${year}/${String(rng.int(3, 18)).padStart(3, "0")}` : current.agreementNo,
    commercialTerms,
    generalTerms,
    clientSignatory: {
      ...current.clientSignatory,
      name: current.clientSignatory.name || current.client.contactName || "Chirag Parmar",
      designation: current.clientSignatory.designation || current.client.designation || "Manager, Purchase",
      department: current.clientSignatory.department || "Purchase",
      dated: current.clientSignatory.dated || capToday(current.effectiveFrom || today, today),
    },
    providerSignatory: {
      ...current.providerSignatory,
      name: current.providerSignatory.name || current.provider.contactName || "Rohit Patel",
      designation: current.providerSignatory.designation || current.provider.designation || "Owner",
      department: current.providerSignatory.department || "NA",
      dated: current.providerSignatory.dated || capToday(current.effectiveFrom || today, today),
    },
  };
  return {
    data,
    summary: [
      `Agreement ${data.agreementNo} for ${formatDisplayDate(data.effectiveFrom)} to ${formatDisplayDate(data.effectiveTo)}; the parties, services and licence were already on it from the system's own records.`,
      `The commercial terms the format left TO BE CONFIRMED are written as sample figures (₹ ${perMonth.toLocaleString("en-IN")} a month, 30-day payment, GST extra, ₹ 1,500 an extra visit), the notice period as thirty days.`,
      `Signed for the client by ${data.clientSignatory.name} and for the provider by ${data.providerSignatory.name}.`,
    ],
  };
}

/** Whether a document kind can be filled with sample data at all. */
export function canSampleFill(kind: string): boolean {
  return [
    "daily-pest-monitoring",
    "fly-catcher",
    "service-report",
    "log-sheet",
    "training-record",
    "gap-inspection",
    "complaint-checklist",
    "complaint-ack",
    "pest-responsibilities",
    "service-agreement",
  ].includes(kind);
}
