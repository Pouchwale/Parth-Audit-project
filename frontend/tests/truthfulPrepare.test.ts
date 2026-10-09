// RECORDS THAT SAY ONLY WHAT HAPPENED (REQUIREMENTS §98, 8-Oct-2026).
//
// On 8-Oct-2026 the owner asked for the system to generate pest, cleaning and other monitoring data that
// looks manually entered, so that auditors believe it. That is falsifying food-safety and hygiene records,
// and it is not built. The morning prepare of a Live record (the browser at start-up, the engine host and
// the server's job all run engine/assistantPrepare.ts prepareDueRecords, which runs engine/knownParts.ts)
// writes only what is known: the record and its date, the fixed rows, the plant's standing values and what
// truly carries forward. These tests walk EVERY document that holds records, with the last record of each
// confirmed and full of values to tempt a carry-forward, and fail on any observation a Live prepare writes:
// a reading, a count, a pass or fail, an answer, a finding, a time, a quantity, a lot's identity, a
// signature or the name of whoever checked.
//
// What counts as an observation is decided HERE, by the words and types of each box and column, not by the
// module under test (engine/observations.ts): a box that module calls "standing" still fails here if its
// label names a person, a lot, a time or a result.
//
// The audit of 7-Oct-2026's H-9 (Line Clearance and ALC started answered), H-10 (blade and sharp-object
// counts copied from yesterday) and H-12 (an invented driver carried forward) are checked by name below;
// H-11 by frontend/tests/production.test.ts (every signature column).
//
// Run: npm run test:unit -- truthfulPrepare
import test from "node:test";
import assert from "node:assert/strict";
import type {
  DailyPestMonitoringData,
  DocumentDefinition,
  FlyCatcherData,
  LogHeaderField,
  LogSheetData,
  LogSheetLayout,
  MasterData,
  RecordInstance,
  ServiceReportData,
  TrainingRecordData,
} from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrMasterSeeded } from "../src/data/repositories/hrMasterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { createDefaultData } from "../src/engine/recordDefaults";
import { prepareKnownParts, PREPARED_NOTE } from "../src/engine/knownParts";
import { latestConfirmedRecord, prepareDueRecords } from "../src/engine/assistantPrepare";
import { sampleFillRecord } from "../src/engine/sampleFill";
import { isCompanyHoliday, nextWorkingDay } from "../src/engine/holidays";
import { fixedMaterialForServiceArea } from "../src/engine/serviceMaterials";
import { validateForSubmit } from "../src/engine/validation";
import { addDays, todayISO } from "../src/utils/date";
import { noProblems } from "./support/catalogue";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrMasterSeeded();

const master: MasterData = masterRepository.get();
const recordable = documentRepository.getRecordable();
const today = todayISO();
const workDay = nextWorkingDay(today, master);

/** The kinds nothing routine is known about: a finding, a complaint, an agreement. Never prepared at all. */
const NEVER_PREPARED = new Set(["gap-inspection", "complaint-checklist", "complaint-ack", "pest-responsibilities", "service-agreement"]);

const blank = (v: unknown): boolean => v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

// ---------------------------------------------------------------------------
// what an observation is, by the words on the paper

/** A box or column whose printed words say it holds what somebody saw, decided, signed or was. ("Designation" is not a sign; a scale's "Reading Capacity" is not a reading.) */
const OBSERVATION_WORDS =
  /\bsign(ed|ature)?\b|operator|inspect|checked|verif|approv|tested|\bby\b|shift|\bpo\b|p\.o|\bfg\b|job|batch|\blot\b|roll|customer|supplier|invoice|vehicle|driver|reading(?! capacity)|observ|result|pass|fail|status|count|qty|quantit|weight|\btime\b|remark|comment|finding|deviation|action|reason|problem|spares|carried out|trainee|employee|visitor|attend|auditor|observer|furnished|survey|achieved|compliance|clean|done|temp|viscosity|ok\b|સહી|ઓપરેટર|ગ્રાહક|ડ્રાઈવર|વાહન|ઇન્વોઇસ|પીઓ|નંબર/i;
/** A person's name. Not the machine's, the site's, the transporter's or the standing team member's. */
const PERSON_NAME = /\bname\b|નામ/i;
const NOT_A_PERSON = /machine|equipment|site name|team member|transporter|product name|મશીન/i;
/** The printed list of the CCMs and PRPs the annual HARA review covers: its label says "Verified", but it is the form's own list. */
const PRINTED_LISTS = /^ccm\d+$/;
/** The equipment sheets, where "Department" is the instrument's. */
const EQUIPMENT_BOXES = ["deviceIdNo", "machineIdNo", "equipmentName"];

function boxMayHold(f: LogHeaderField, layout: LogSheetLayout): string | null {
  if (f.autoFill?.sign) return "a signature box";
  if (f.type === "select" || f.type === "yesno" || f.type === "time") return `a ${f.type} answer`;
  if (f.type === "number" && !/cutoff/i.test(f.label)) return "a figure";
  if (PRINTED_LISTS.test(f.key)) return null;
  if (f.key === "department") return [...layout.headerFields, ...(layout.footerFields ?? [])].some((b) => EQUIPMENT_BOXES.includes(b.key)) ? null : "a person's department";
  if (OBSERVATION_WORDS.test(f.label)) return "an observation by its printed words";
  if (PERSON_NAME.test(f.label) && !NOT_A_PERSON.test(f.label)) return "a person's name";
  return null;
}

/** A yearly list carries who or what each line is about; never its assessment. */
const LIST_ASSESSMENT = /remark|rating|grade|status|decision|justification|period|experience.*available|lots|weightage|overall/i;

/** Every observation a prepared Live record holds, in words; empty when it holds none. */
function observationsIn(doc: DocumentDefinition, data: unknown, dueDate: string, prior: RecordInstance | undefined): string[] {
  const found: string[] = [];
  const say = (what: string) => found.push(`${doc.id} (${doc.formatNo}) on ${dueDate}: ${what}`);
  switch (doc.kind) {
    case "daily-pest-monitoring": {
      const d = data as DailyPestMonitoringData;
      if (d.isHoliday !== isCompanyHoliday(dueDate, master)) say(`isHoliday ${d.isHoliday} is not the calendar's`);
      for (const [no, cp] of Object.entries(d.checkpoints ?? {})) if (!blank(cp?.value) || !blank(cp?.note)) say(`check point ${no} answered "${cp?.value}"`);
      if (!blank(d.timeOfChecking)) say(`time of checking "${d.timeOfChecking}"`);
      if (!blank(d.checker)) say(`checker "${d.checker}"`);
      if (!blank(d.summaryActions)) say(`${d.summaryActions.length} summary action(s)`);
      if (!blank(d.rodentCatches)) say(`${d.rodentCatches?.length} rodent catch(es)`);
      return found;
    }
    case "fly-catcher": {
      const d = data as FlyCatcherData;
      for (const e of d.entries) {
        if (e.catchCountApprox !== null && e.catchCountApprox !== undefined) say(`${e.pcId} catch count ${e.catchCountApprox}`);
        if (!blank(e.cleaningDoneBy)) say(`${e.pcId} cleaning done by "${e.cleaningDoneBy}"`);
        if (!blank(e.verifiedBy)) say(`${e.pcId} verified by "${e.verifiedBy}"`);
      }
      return found;
    }
    case "service-report": {
      const d = data as ServiceReportData;
      for (const l of d.lines) {
        if (!blank(l.qtyUsed)) say(`${l.areaName}: quantity used "${l.qtyUsed}"`);
        if (!blank(l.remarks)) say(`${l.areaName}: remark "${l.remarks}"`);
        const fixed = fixedMaterialForServiceArea(doc.variantKey, l.areaName);
        if (l.materialName !== fixed.materialName || l.methodOfApplication !== fixed.methodOfApplication) say(`${l.areaName}: material or method is not the area's fixed one`);
      }
      if (!blank(d.technicianSign)) say(`technician's sign "${d.technicianSign}"`);
      if (!blank(d.customerSign)) say(`customer's sign "${d.customerSign}"`);
      return found;
    }
    case "training-record": {
      const d = data as TrainingRecordData;
      if (!blank(d.attendees)) say(`${d.attendees.length} attendee(s) written in`);
      if (!blank(d.certificateRef)) say(`certificate reference "${d.certificateRef}"`);
      if (!blank(d.remarks)) say(`remarks "${d.remarks}"`);
      if (d.trainingDate !== dueDate) say(`training date ${d.trainingDate} is not the record's`);
      return found;
    }
    case "log-sheet":
      logSheetObservations(doc, data as LogSheetData, dueDate, prior as RecordInstance<LogSheetData> | undefined, say);
      return found;
    default:
      say(`kind ${doc.kind} was prepared at all`);
      return found;
  }
}

function logSheetObservations(doc: DocumentDefinition, d: LogSheetData, dueDate: string, prior: RecordInstance<LogSheetData> | undefined, say: (w: string) => void): void {
  const layout = getLogSheetLayout(doc.id)!;
  const scheduled = doc.schedule.type !== "as-required";
  for (const f of [...layout.headerFields, ...(layout.footerFields ?? [])]) {
    const v = d.header?.[f.key];
    if (blank(v) || f.computed) continue;
    if (f.autoFill?.dueDate) {
      if (v !== dueDate) say(`"${f.label}" holds ${v}, not the record's date`);
      continue;
    }
    const why = boxMayHold(f, layout);
    if (why) {
      say(`"${f.label}" (${why}) holds "${v}"`);
      continue;
    }
    // A standing value of an As Required document can only be the format's own words: the last record was another occasion.
    if (!scheduled && v !== String(f.autoFill?.default ?? "")) say(`"${f.label}" holds "${v}", carried from another occasion`);
  }
  const mode = layout.rowMode;
  const listed = mode.kind === "free" && doc.schedule.type === "yearly";
  for (const [i, row] of d.rows.entries()) {
    for (const c of layout.columns) {
      const v = row[c.key];
      if (blank(v) || c.computed || c.linkedFrom) continue;
      if (c.fixed) {
        const printed = mode.kind === "fixedRows" ? mode.rows[i]?.[c.key] : mode.kind === "timeSlots" && c.key === mode.slotKey ? mode.slots[i] : undefined;
        if (v !== printed) say(`line ${i + 1} "${c.label}" holds "${v}", not the printed "${printed}"`);
        continue;
      }
      if (c.autoFill?.dueDate) {
        if (v !== dueDate) say(`line ${i + 1} "${c.label}" holds ${v}, not the record's date`);
        continue;
      }
      // H-10: a running stock ledger opens with the last sheet's closing stock, and only that.
      if (c.key === "openingStock" && (doc.id === "prd-pouching-blade" || doc.id === "prd-slitting-blade")) {
        const closing = [...(prior?.data.rows ?? [])].reverse().find((r) => typeof r.closingOkStock === "number")?.closingOkStock;
        if (i !== 0 || v !== closing) say(`line ${i + 1} opening stock ${v} is not the last sheet's closing stock (${closing})`);
        continue;
      }
      if (listed && (c.type === "text" || c.type === "date") && !c.autoFill?.sign && !c.autoFill?.fresh && !LIST_ASSESSMENT.test(c.label) && prior?.data.rows?.[i]?.[c.key] === v) continue;
      say(`line ${i + 1} "${c.label}" holds "${v}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// the last record of each document, confirmed and full of values

function shellOf(doc: DocumentDefinition, dueDate: string, id: string, status: RecordInstance["status"] = "In Progress"): RecordInstance {
  return {
    id,
    documentId: doc.id,
    periodKey: `${doc.id}:${dueDate}`,
    dueDate,
    status,
    isDemo: false,
    data: createDefaultData(doc, dueDate, master),
    createdAt: `${dueDate}T09:00:00.000Z`,
    updatedAt: `${dueDate}T09:00:00.000Z`,
  };
}

/** A record a person confirmed a week before, every box filled (the sample fill), to tempt a carry-forward. */
function confirmedBefore(doc: DocumentDefinition, dueDate: string): RecordInstance | undefined {
  const at = addDays(dueDate, -7);
  const shell = shellOf(doc, at, `unit-prior-${doc.id}-${at}`);
  const filled = sampleFillRecord(doc, shell, master, "Unit QA");
  return filled ? { ...shell, data: filled.data, status: "Verified", submittedBy: "Unit QA", verifiedBy: "Unit QA" } : undefined;
}

// ---------------------------------------------------------------------------

test("the walk covers the whole catalogue", () => {
  assert.ok(recordable.length >= 125, `${recordable.length} recordable documents`);
  console.log(`  ${recordable.length} recordable documents, prepared for ${today} and ${workDay}`);
});

test("a Live prepare writes no observation into any of the documents, with or without a confirmed record before it", () => {
  const problems: string[] = [];
  for (const doc of recordable) {
    for (const dueDate of Array.from(new Set([today, workDay]))) {
      const prior = confirmedBefore(doc, dueDate);
      for (const previous of [undefined, prior]) {
        let result;
        try {
          result = prepareKnownParts(doc, dueDate, master, previous);
        } catch (err) {
          problems.push(`${doc.id}: the prepare threw ${err instanceof Error ? err.stack : String(err)}`);
          continue;
        }
        if (NEVER_PREPARED.has(doc.kind)) {
          if (result) problems.push(`${doc.id}: a ${doc.kind} was prepared; nothing routine is known about it`);
          continue;
        }
        if (!result) {
          problems.push(`${doc.id}: nothing was prepared`);
          continue;
        }
        problems.push(...observationsIn(doc, result.data, dueDate, previous));
        // What waits is what the submit checks still ask for, and the notes say so.
        const errors = validateForSubmit(doc, { ...shellOf(doc, dueDate, "unit-now"), data: result.data }).errors.length;
        if (result.waiting !== errors) problems.push(`${doc.id}: says ${result.waiting} wait, the submit checks ask for ${errors}`);
        if (!result.notes.some((n) => /Left for you|Nothing is left/.test(n))) problems.push(`${doc.id}: the notes do not say what is left for the person`);
      }
    }
  }
  noProblems("Observations a Live prepare wrote", problems);
});

test("the Daily Pest Control Monitoring Record waits for 12 readings on a working day: ten check points, the time and the checker", () => {
  const doc = recordable.find((d) => d.id === "daily-pest-monitoring")!;
  const result = prepareKnownParts(doc, workDay, master, confirmedBefore(doc, workDay))!;
  assert.equal(result.waiting, 12, result.notes.join(" | "));
  assert.deepEqual((result.data as DailyPestMonitoringData).checkpoints, {});
});

test("what is known IS written: the date, the fixed rows, the standing values carried from the last confirmed sheet", () => {
  const byId = (id: string) => recordable.find((d) => d.id === id)!;
  // An instrument's identity, from the last calibration a person confirmed.
  const scale = byId("qc-weight-scale-calibration");
  const prior = confirmedBefore(scale, workDay) as RecordInstance<LogSheetData>;
  const cal = prepareKnownParts(scale, workDay, master, prior)!.data as LogSheetData;
  for (const key of ["deviceIdNo", "manufacturer", "serialNo", "calibrationExpiry", "acceptableTolerance"]) assert.equal(cal.header[key], prior.data.header[key], key);
  assert.ok(cal.rows.every((r) => r.date === workDay), "each line dated the record's day");
  assert.ok(cal.rows.every((r) => r.testedValue1 === "" && r.passFail === "" && r.testedBy === ""), "no reading, result or tester");
  // The chemicals in use and the machine; never the operator, the batch or the shift.
  const pp = byId("prd-process-parameter");
  const ppPrior = confirmedBefore(pp, workDay) as RecordInstance<LogSheetData>;
  const params = prepareKnownParts(pp, workDay, master, ppPrior)!.data as LogSheetData;
  for (const key of ["machineName", "mixingRatio", "adhesiveMake", "adhesiveCode", "hardenerMake", "hardenerCode"]) assert.equal(params.header[key], ppPrior.data.header[key], key);
  for (const key of ["operatorName", "shift", "adhesiveBatch", "hardenerBatch"]) assert.equal(params.header[key], "", key);
  // The printed fixed rows, every answer empty.
  const gmp = byId("hr-gmp-checklist");
  const checklist = prepareKnownParts(gmp, workDay, master, confirmedBefore(gmp, workDay))!.data as LogSheetData;
  const printed = getLogSheetLayout("hr-gmp-checklist")!.rowMode;
  assert.equal(checklist.rows.length, printed.kind === "fixedRows" ? printed.rows.length : -1);
  assert.ok(checklist.rows.every((r) => r.compliance === "" && r.actionIfNc === ""));
  // The fly catcher units with their tube light dates from the last visit.
  const fly = byId("fly-catcher");
  const flyPrior = confirmedBefore(fly, workDay) as RecordInstance<FlyCatcherData>;
  const units = prepareKnownParts(fly, workDay, master, flyPrior)!.data as FlyCatcherData;
  assert.equal(units.entries.length, master.pcLocations.length);
  for (const e of units.entries) assert.equal(e.tubeLightDueDate, flyPrior.data.entries.find((p) => p.pcId === e.pcId)?.tubeLightDueDate);
  // A yearly list: the people, never their assessment.
  const skills = byId("hr-skill-matrix");
  const skillsPrior = confirmedBefore(skills, workDay) as RecordInstance<LogSheetData>;
  const matrix = prepareKnownParts(skills, workDay, master, skillsPrior)!.data as LogSheetData;
  assert.equal(matrix.rows.length, skillsPrior.data.rows.length);
  assert.ok(matrix.rows.every((r, i) => r.name === skillsPrior.data.rows[i].name && r.printing === ""));
});

test("H-9: a blank form never arrives answered: Line Clearance, ALC, the cleaning type, the compliance, the shift and the operator start empty", () => {
  const byId = (id: string) => recordable.find((d) => d.id === id)!;
  const rows = (id: string) => (createDefaultData(byId(id), workDay, master) as LogSheetData).rows;
  const header = (id: string) => (createDefaultData(byId(id), workDay, master) as LogSheetData).header;
  assert.ok(rows("prd-pouching-line-clearance").every((r) => r.lineClearance === ""), "Line Clearance");
  for (const id of ["prd-alc-production", "prd-slitting-alc", "prd-doctoring-alc"]) assert.ok(rows(id).every((r) => r.alcDone === ""), `${id} ALC`);
  assert.ok(rows("disp-vehicle-cleaning").every((r) => r.cleaningType === ""), "type of cleaning");
  assert.ok(rows("disp-container-stuffing").every((r) => r.compliance === ""), "container compliance");
  assert.equal(header("qc-inspection-pouching").shift, "");
  assert.equal(header("qc-inspection-sb-lamination").pass, "");
  assert.equal(header("prd-alc-production").operatorName, "");
  assert.equal(header("qc-inprocess-printing").operator, "");
  // The plant's standing values still arrive: the machine.
  assert.equal(header("prd-alc-production").machineName, "Lamination-1");
});

test("H-10: the blade ledgers open with the last closing stock; the sharp-object counts and anything broken are never copied", () => {
  const byId = (id: string) => recordable.find((d) => d.id === id)!;
  for (const id of ["prd-pouching-blade", "prd-slitting-blade"]) {
    const prior = confirmedBefore(byId(id), workDay) as RecordInstance<LogSheetData>;
    prior.data.rows[prior.data.rows.length - 1].closingOkStock = 9;
    const line = (prepareKnownParts(byId(id), workDay, master, prior)!.data as LogSheetData).rows[0];
    assert.equal(line.openingStock, 9, `${id}: opening stock is the last closing stock`);
    for (const key of ["newIssuedFromStore", "totalStock", "replacedNos", "closingOkStock", "closingDiscarded", "discardedReturned"]) assert.equal(line[key], null, `${id}: ${key}`);
    assert.equal(line.replacedShift, "");
  }
  for (const id of ["prd-sharp-object-issue", "prd-pouching-cutter-issue"]) {
    const line = (prepareKnownParts(byId(id), workDay, master, confirmedBefore(byId(id), workDay))!.data as LogSheetData).rows[0];
    const layout = getLogSheetLayout(id)!;
    for (const c of layout.columns) if (!c.autoFill?.dueDate) assert.ok(blank(line[c.key]), `${id}: ${c.label} is "${line[c.key]}"`);
  }
});

test("H-12: F/DISP/04's driver signs the line; no driver is invented or carried forward", () => {
  const layout = getLogSheetLayout("disp-vehicle-cleaning")!;
  const driver = layout.columns.find((c) => c.key === "driverSign")!;
  assert.ok(!driver.autoFill?.carryForward && !driver.autoFill?.sign, "never carried forward or filled");
  assert.ok(!(layout.specimenRows ?? []).some((r) => !blank(r.driverSign)), "no invented driver on the specimen");
});

test("prepareDueRecords: every record due today is prepared by the rule, with a line in its history, and never with a reading", () => {
  // The last confirmed record of every document, a week back, so each could be copied from.
  for (const doc of recordable) {
    const prior = confirmedBefore(doc, today);
    if (prior) recordRepository.upsert(prior);
  }
  const prepared = prepareDueRecords(today);
  const problems: string[] = [];
  for (const r of prepared) {
    const doc = documentRepository.getByIdUnscoped(r.documentId)!;
    if (r.status !== "In Progress") problems.push(`${doc.id}: status ${r.status}`);
    if (!r.prepared?.knownPartsOnly) problems.push(`${doc.id}: not stamped as prepared by the rule`);
    const entry = r.history?.at(-1);
    if (!entry || entry.action !== "prepared" || entry.by !== "Assistant" || entry.note !== PREPARED_NOTE) problems.push(`${doc.id}: the history has no preparation line (${JSON.stringify(entry)})`);
    problems.push(...observationsIn(doc, r.data, r.dueDate, latestConfirmedRecord(doc.id, r.dueDate, false)));
  }
  noProblems("Records prepareDueRecords prepared with an observation in them", problems);
  console.log(`  ${prepared.length} record(s) due by ${today} prepared`);
});
