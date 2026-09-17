// DEMO MODE synthetic data generator (sections 13/14/38). Every record this
// produces is stamped isDemo:true and is clearly rendered with a
// DEMO / SYNTHETIC watermark everywhere in the UI — it must never be
// mistaken for a real completed company record.
import type {
  DailyPestMonitoringData,
  DocumentDefinition,
  FlyCatcherData,
  GapFinding,
  GapInspectionData,
  RecordInstance,
  RecordStatus,
  ServiceReportData,
} from "../types";
import { documentRepository } from "./repositories/documentRepository";
import { masterRepository } from "./repositories/masterRepository";
import { recordRepository } from "./repositories/recordRepository";
import { effectiveDueDatesInMonth } from "../engine/holidays";
import { periodKeyFor } from "../engine/recordGenerator";
import { fixedMaterialForServiceArea, normalizeServiceLines } from "../engine/serviceMaterials";
import { autoFillRecord } from "../engine/autoFill";
import { createDefaultData } from "../engine/recordDefaults";
import { describeRodentEvent, rodentEventFor } from "../engine/rodentPattern";
import { flyCatchFor, tubeLightCycle } from "../engine/flyPattern";
import {
  checkpointFindingsFor,
  findingScheduleFor,
  lifecycleFor,
  serviceRemarkFor,
  stampAt,
  type LifecycleOutcome,
} from "../engine/plantSimulation";
import { generateId } from "../utils/id";
import { makeRng } from "../utils/random";
import { addDays, compareISO, todayISO } from "../utils/date";

const DEMO_CHECKERS = ["Roshni", "Vijay", "Yogesh Rathod", "Priya Solanki"];
const DEMO_VERIFIER = "Kapila Barad";

// Demo data is deterministic per (record, date), exactly like the Live
// assistant's pre-fill. It used to be drawn from Math.random(), which meant
// the same day showed different values on two machines and changed again
// whenever the month was regenerated — an auditor who came back to a record
// found a different record. Everything below draws from a seeded stream whose
// seed names what it decides.
function rngFor(...parts: string[]) {
  return makeRng(`demo|${parts.join("|")}`);
}

// A demo record made as an empty shell because its day was still ahead when
// it was generated, and not touched by anyone since.
function isUnfilledPastShell(r: RecordInstance, today: string): boolean {
  return r.status === "Due" && compareISO(r.dueDate, today) <= 0 && r.updatedAt === r.createdAt;
}

function buildDailyData(dueDate: string, isHoliday: boolean): DailyPestMonitoringData {
  if (isHoliday) {
    return { isHoliday: true, checkpoints: {}, timeOfChecking: "", checker: "", summaryActions: [], rodentCatches: [] };
  }
  const checkpoints: DailyPestMonitoringData["checkpoints"] = {};
  const master = masterRepository.get();
  const summaryActions: DailyPestMonitoringData["summaryActions"] = [];
  for (const cp of master.checkpoints) {
    if (cp.responseType === "number") {
      checkpoints[cp.no] = { value: 100 };
    } else {
      checkpoints[cp.no] = { value: cp.flagWhen === "Yes" ? "No" : "Yes" };
    }
  }
  // The housekeeping findings come from the same model the Live assistant
  // uses (engine/plantSimulation.ts), worded from this plant's own Dec-2023
  // GAP report, each with its Summary of Actions row.
  for (const finding of checkpointFindingsFor(dueDate)) {
    const cp = master.checkpoints.find((c) => c.no === finding.no);
    if (!cp?.flagWhen) continue;
    checkpoints[finding.no] = { value: cp.flagWhen };
    summaryActions.push({
      id: generateId("act"),
      dateOfObservation: dueDate,
      descriptionOfObservation: finding.description,
      actionTaken: finding.action,
      remarks: finding.remarks,
    });
  }
  // Rodent checkpoints 7/8/9 follow the same seasonal catch pattern the
  // Live assistant uses (engine/rodentPattern.ts), so a demo year shows a
  // believable trend — quiet months, a few catches in the monsoon.
  const ev = rodentEventFor(dueDate);
  if (ev.catches.length > 0) {
    checkpoints[7] = { value: "Yes" };
    summaryActions.push({
      id: generateId("act"),
      dateOfObservation: dueDate,
      descriptionOfObservation: describeRodentEvent(ev),
      actionTaken: "Rodent removed and disposed; glue board replaced in the box; Gurudev Pest Control informed.",
      remarks: "Box re-checked next day.",
    });
  }
  if (ev.deadRodentLocation) checkpoints[8] = { value: "Yes", note: ev.deadRodentLocation };
  if (ev.cakeBitingBoxNo) checkpoints[9] = { value: "Yes", note: ev.cakeBitingBoxNo };

  const rng = rngFor("daily", dueDate);
  return {
    isHoliday: false,
    checkpoints,
    timeOfChecking: `${String(rng.int(8, 9)).padStart(2, "0")}:${String(rng.int(0, 59)).padStart(2, "0")}`,
    checker: rng.chance(0.8) ? DEMO_CHECKERS[0] : rng.pick(DEMO_CHECKERS),
    summaryActions,
    rodentCatches: ev.catches,
  };
}

const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function buildFlyCatcherData(dueDate: string): FlyCatcherData {
  const master = masterRepository.get();
  const year = Number(dueDate.slice(0, 4));
  const month = Number(dueDate.slice(5, 7)) - 1;
  return {
    // Same "August-26" style as the paper register's Month & Year box.
    monthYear: `${MONTH_LONG[month]}-${String(year).slice(2)}`,
    entries: master.pcLocations.map((pc) => {
      // The register's own two fixed dates, as the department states them: every
      // unit's tubes installed together on 24-11-2025 and falling due together
      // on 23-11-2026 (engine/flyPattern.ts, REQUIREMENTS §44). Cleaning by
      // Vijay and verification by Roshni on every line, as on the specimen.
      const tubes = tubeLightCycle();
      return {
        pcId: pc.id,
        // The same seasonal per-unit pattern the Live assistant uses, so the
        // demo year's Fly Catcher Infestation trend has a believable shape.
        catchCountApprox: flyCatchFor(pc.id, dueDate),
        tubeLightInstallDate: tubes.installed,
        tubeLightDueDate: tubes.due,
        cleaningDoneBy: "Vijay",
        verifiedBy: DEMO_CHECKERS[0],
      };
    }),
  };
}

// Realistic quantity range/unit per fixed material, matching the ranges
// actually observed in the source specimens (REQUIREMENTS.md §5) rather than
// one generic "ml" range for every material (glue boards are counted in
// pieces, not millilitres).
function randomQtyFor(materialName: string, rng: ReturnType<typeof makeRng>): string {
  if (materialName === "Glue Board") return `${rng.int(2, 5)}`;
  if (materialName === "Bromadiolone Cake") return `${rng.int(30, 40)} grams`;
  return `${rng.int(100, 150)} ml`;
}

export interface ServiceObservation {
  areaName: string;
  finding: string;
  correctiveAction: string;
}

function serviceAreasFor(doc: DocumentDefinition): { name: string }[] {
  const areas = masterRepository.get().areas.filter((a) => a.context === `service-report:${doc.variantKey}`);
  return areas.length ? areas : [{ name: "General area (demo)" }];
}

// What the technician flagged on a visit already on file — the same
// deterministic remarks buildServiceReportData wrote into its report.
function serviceObservationsFor(doc: DocumentDefinition, dueDate: string): ServiceObservation[] {
  const out: ServiceObservation[] = [];
  for (const a of serviceAreasFor(doc)) {
    const finding = serviceRemarkFor(doc.variantKey, a.name, dueDate).finding;
    if (finding) out.push({ areaName: a.name, ...finding });
  }
  return out;
}

function buildServiceReportData(doc: DocumentDefinition, dueDate: string, observed: ServiceObservation[]): ServiceReportData {
  const rng = rngFor("service", doc.id, dueDate);
  return {
    serviceName: doc.variantKey ?? doc.name,
    // One quantity per material: every area treated with it carries the first
    // line's (engine/serviceMaterials.ts). The generator still draws one per
    // line, so the rest of the visit's story comes out as it always has.
    lines: normalizeServiceLines(
      doc.variantKey,
      serviceAreasFor(doc).map((a, i) => {
        const fixed = fixedMaterialForServiceArea(doc.variantKey, a.name);
        // What the technician actually noted at this area on this visit — and
        // where that is something the plant has to act on, it is collected so
        // a CAPA finding can be raised against it below.
        const observation = serviceRemarkFor(doc.variantKey, a.name, dueDate);
        if (observation.finding) observed.push({ areaName: a.name, ...observation.finding });
        return {
          slNo: i + 1,
          areaName: a.name,
          materialName: fixed.materialName,
          qtyUsed: randomQtyFor(fixed.materialName, rng),
          methodOfApplication: fixed.methodOfApplication,
          remarks: observation.remark,
        };
      })
    ),
    technicianSign: "Yogesh Rathod",
    // The customer's countersignature is genuinely missed now and then, and
    // that is exactly what blocks verification (engine/validation.ts).
    customerSign: rng.chance(0.85) ? DEMO_VERIFIER : "",
  };
}

// ---------------------------------------------------------------------------
// From what was observed to what was done about it.

const MONTH_END = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);

/**
 * The month's internal CAPA record: every finding the registers raised that
 * month, each with the target date it was given and the date it was actually
 * closed on (engine/plantSimulation.ts). Some are closed on time, some late,
 * some still open — which is what the Dashboard's "Open Corrective Actions"
 * tile and the CAPA report are counting.
 */
function buildMonthlyCapaRecord(
  year: number,
  month: number,
  monthRecords: RecordInstance[],
  serviceObservations: ServiceObservation[],
  existing: Set<string>,
  today: string
): RecordInstance[] {
  const doc = documentRepository.getByIdUnscoped("gap-inspection");
  if (!doc) return [];
  const inspectionDate = MONTH_END(year, month);
  if (compareISO(inspectionDate, today) > 0) return [];
  const periodKey = `${doc.id}:${inspectionDate}`;
  if (existing.has(`${doc.id}|${periodKey}`)) return [];

  const findings: GapFinding[] = [];
  // The same issue seen twice in a month is one corrective action, not two —
  // a CAPA log listing the identical finding on two lines is what a review
  // meeting would have merged before it was written down.
  const seen = new Set<string>();
  const add = (observedOn: string, description: string, comment: string, action: string, source: GapFinding["source"]) => {
    if (seen.has(description)) return;
    seen.add(description);
    const schedule = findingScheduleFor(`${periodKey}|${findings.length}`, observedOn, today);
    findings.push({
      id: generateId("finding"),
      sNo: findings.length + 1,
      findingOfInspection: description,
      commentsOnFindings: comment,
      correctiveActionContractor: source === "External" ? action : "NA",
      correctiveActionClient: source === "External" ? "NA" : action,
      targetDate: schedule.targetDate,
      actualDateOfAction: schedule.actualDateOfAction,
      verifiedByServiceProvider: schedule.status === "Closed" ? "Yogesh Rathod" : "",
      status: schedule.status,
      source,
    });
  };

  // What the daily register itself flagged during the month.
  for (const rec of monthRecords) {
    if (rec.documentId !== "daily-pest-monitoring") continue;
    const data = rec.data as DailyPestMonitoringData;
    for (const act of data.summaryActions ?? []) {
      // Rodent catches are routine pest activity handled on the day, not a
      // system failure to raise a corrective action against.
      if (/rodent (trapped|removed)/i.test(act.actionTaken)) continue;
      add(act.dateOfObservation, act.descriptionOfObservation, "Raised from the Daily Pest Control Monitoring Record (F/HR/17).", act.actionTaken, "Internal");
    }
  }
  // ...and what the pest control contractor noticed on their visits.
  for (const obs of serviceObservations) {
    add(inspectionDate, `${obs.finding} (${obs.areaName})`, "Raised by the service technician during the fortnightly visit.", obs.correctiveAction, "External");
  }

  if (findings.length === 0) return [];

  const now = new Date().toISOString();
  const rng = rngFor("capa", inspectionDate);
  const allClosed = findings.every((f) => f.status === "Closed");
  // Verification is blocked while a finding is still open (validation.ts), so
  // a month with something outstanding sits at Pending Verification — which
  // is exactly the state an auditor expects to find it in.
  const status: RecordStatus = allClosed ? (rng.chance(0.8) ? "Verified" : "Pending Verification") : "Pending Verification";
  return [
    {
      id: generateId("demo"),
      documentId: doc.id,
      periodKey,
      dueDate: inspectionDate,
      status,
      isDemo: true,
      data: {
        inspectionDate,
        premisesName: "Gujarat Print Pack Publications Pvt. Ltd.",
        premisesAddress: "Dediyasan GIDC, Mehsana",
        contactPerson: "Ms. Kapila Barad",
        findings,
        generalComments: [],
      } satisfies GapInspectionData,
      createdAt: now,
      updatedAt: now,
      submittedBy: DEMO_CHECKERS[0],
      submittedAt: stampAt(inspectionDate, 16, rng.int(0, 59)),
      verifiedBy: status === "Verified" ? DEMO_VERIFIER : undefined,
      verifiedAt: status === "Verified" ? stampAt(addDays(inspectionDate, 1), 11, 0) : undefined,
    },
  ];
}

export function generateDemoRecordsForMonth(year: number, month: number): number {
  // Unscoped: Demo Mode generates a whole synthetic year for the plant.
  const docs = documentRepository.getRecordableUnscoped();
  const today = todayISO();
  const created: RecordInstance[] = [];
  const now = new Date().toISOString();

  const master = masterRepository.get();
  // Every demo record already stored, by document and period.
  const stored = new Map<string, RecordInstance>();
  for (const r of recordRepository.query({ isDemo: true })) stored.set(`${r.documentId}|${r.periodKey}`, r);
  // Findings the fortnightly service visits raised this month, collected as
  // the reports are built so they can be carried into a CAPA record below.
  const observedThisMonth: ServiceObservation[] = [];

  for (const doc of docs) {
    // The most recent demo record before this month, so the assistant's
    // carry-forward logic has something to chain from for log sheets.
    let previous: RecordInstance | undefined = recordRepository
      .query({ documentId: doc.id, isDemo: true })
      // (never an empty future shell — there is nothing in it to carry forward)
      .filter((r) => r.status !== "Due" && compareISO(r.dueDate, `${year}-${String(month + 1).padStart(2, "0")}-01`) < 0)
      .sort((a, b) => compareISO(b.dueDate, a.dueDate))[0];

    // Same holiday-aware dates as the Live generator (engine/holidays.ts):
    // Thursday weekly off, festival holidays, adjustment days; fortnightly
    // visits that land on a closed day move to the next working day.
    for (const { scheduled, due: dueDate, holiday } of effectiveDueDatesInMonth(doc, year, month, master)) {
      const periodKey = periodKeyFor(doc, scheduled);
      // A period already on file is left alone — except a blank shell made
      // for a day that was still ahead when it was generated, untouched
      // since. That day has happened now, so it is filled in like any other;
      // skipped, it sat blank and overdue in the demo for good.
      const prior = stored.get(`${doc.id}|${periodKey}`);
      if (prior && !isUnfilledPastShell(prior, today)) {
        if (prior.status !== "Due") previous = prior;
        continue;
      }
      if (holiday && doc.kind !== "daily-pest-monitoring") continue;

      // The Daily Monitoring register's "H O L I D A Y" rows are the real
      // closed days — the weekly off and the leave calendar — not random.
      const isHoliday = doc.kind === "daily-pest-monitoring" && holiday;
      const inFuture = compareISO(dueDate, today) > 0;
      let data: unknown;
      // A record for a day that hasn't happened yet is an empty shell. It
      // used to be generated complete — 24 hourly readings already written
      // down for next Tuesday — which is the single most obvious tell that a
      // dataset was manufactured, and would be a serious finding in a real
      // register.
      if (inFuture) data = createDefaultData(doc, dueDate, master);
      else if (doc.kind === "daily-pest-monitoring") data = buildDailyData(dueDate, isHoliday);
      else if (doc.kind === "fly-catcher") data = buildFlyCatcherData(dueDate);
      else if (doc.kind === "service-report") data = buildServiceReportData(doc, dueDate, observedThisMonth);
      else if (doc.kind === "log-sheet" || doc.kind === "training-record") {
        // Same engine the Live assistant uses, so demo log sheets look
        // exactly like the prepared real ones (still isDemo:true below).
        const filled = autoFillRecord(doc, dueDate, master, previous);
        if (!filled) continue;
        data = filled.data;
      } else continue;

      // How this record was signed off: who submitted it and when, whether
      // the verifier got to it the same day or a week later, whether it was
      // sent back (engine/plantSimulation.ts). Every record submitted at
      // 10:00 and verified at 15:00 was the clearest tell in the old data.
      const submitter = rngFor("submitter", doc.id, dueDate).chance(0.75) ? DEMO_CHECKERS[0] : rngFor("submitter2", doc.id, dueDate).pick(DEMO_CHECKERS);
      const life: LifecycleOutcome | { status: RecordStatus } = inFuture
        ? { status: "Due" as RecordStatus }
        : lifecycleFor(doc, dueDate, submitter, DEMO_VERIFIER, today);

      const rec: RecordInstance = {
        id: prior?.id ?? generateId("demo"),
        documentId: doc.id,
        periodKey,
        dueDate,
        isDemo: true,
        data,
        createdAt: prior?.createdAt ?? now,
        updatedAt: now,
        ...life,
      };
      created.push(rec);
      previous = rec;
    }
  }

  // Everything the month's own records observed — the check points answered
  // the finding way, the areas a technician flagged — becomes the month's
  // internal CAPA record, with target dates and closures. This is the chain
  // an auditor actually follows: an observation in a register, an action
  // raised against it, and a date it was closed on. Before this, a demo year
  // contained no CAPA activity at all.
  // Built from the whole month on file, not only this run's records: a month
  // first generated before it ended gets its CAPA record on the first run
  // after it ends, from everything its registers observed.
  const createdIds = new Set(created.map((r) => r.id));
  const earlier = recordRepository
    .query({ isDemo: true, fromDate: `${year}-${String(month + 1).padStart(2, "0")}-01`, toDate: MONTH_END(year, month) })
    .filter((r) => !createdIds.has(r.id) && r.status !== "Due");
  for (const r of earlier) {
    const d = docs.find((x) => x.id === r.documentId);
    if (d?.kind === "service-report") observedThisMonth.push(...serviceObservationsFor(d, r.dueDate));
  }
  created.push(...buildMonthlyCapaRecord(year, month, [...earlier, ...created], observedThisMonth, new Set(stored.keys()), today));

  recordRepository.upsertMany(created);
  return created.length;
}

export function clearAllDemoData(): number {
  return recordRepository.clearDemoData();
}

// Generates demo data for the year so far (January through next month) in
// one call — idempotent (generateDemoRecordsForMonth skips any period that
// already has a demo record), so calling it every time Dashboard mounts
// while in Demo Mode is cheap after the first time. Only ever touches
// isDemo:true records; never called for Live data. Lets someone switch into
// Demo Mode and immediately browse the months that have history without
// visiting the Demo Mode page first. Months further ahead would only be
// blank "Due" shells (nothing to demo) and, with five daily lamination log
// sheets of 24 rows each, would roughly double localStorage usage for no
// benefit — they can still be generated explicitly from the Demo Mode page.
export function ensureDemoRecordsGeneratedForYear(year: number): number {
  const now = new Date();
  const lastMonth = year < now.getFullYear() ? 11 : year > now.getFullYear() ? -1 : Math.min(11, now.getMonth() + 1);
  if (lastMonth < 0) return 0;
  // Asked on every visit to the Files and the reports: one look over what is
  // already stored decides which months lack anything, and only those are
  // generated — not a full pass over every record for each of twelve months.
  const docs = documentRepository.getRecordableUnscoped();
  const master = masterRepository.get();
  const today = todayISO();
  const stored = new Map<string, RecordInstance>();
  for (const r of recordRepository.query({ isDemo: true })) stored.set(`${r.documentId}|${r.periodKey}`, r);
  let total = 0;
  for (let month = 0; month <= lastMonth; month++) {
    const lacking = docs.some((doc) =>
      effectiveDueDatesInMonth(doc, year, month, master).some(({ scheduled, holiday }) => {
        if (holiday && doc.kind !== "daily-pest-monitoring") return false;
        const prior = stored.get(`${doc.id}|${periodKeyFor(doc, scheduled)}`);
        return !prior || isUnfilledPastShell(prior, today);
      })
    );
    if (lacking) total += generateDemoRecordsForMonth(year, month);
  }
  return total;
}
