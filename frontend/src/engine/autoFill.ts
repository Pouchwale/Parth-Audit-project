import type {
  DailyPestMonitoringData,
  DocumentDefinition,
  FlyCatcherData,
  LogColumn,
  LogSheetData,
  LogSheetLayout,
  LogSheetRow,
  MasterData,
  RecordInstance,
  ServiceReportData,
  TrainingRecordData,
} from "../types";
import { getLogSheetLayout } from "../data/seed/logSheetLayouts";
import { SEED_AWARENESS_TRAINING_RECORD } from "../data/seed/historicalRecords";
import { createDefaultData } from "./recordDefaults";
import { resolveResponsibleEmployees } from "./documentInfo";
import { fixedMaterialForServiceArea, isQuantityLine, normalizeServiceLines } from "./serviceMaterials";
import { describeRodentEvent, rodentEventFor, totalRodents } from "./rodentPattern";
import { flyCatchFor, flySeasonLabel, tubeLightCycle } from "./flyPattern";
import {
  checkpointFindingsFor,
  excursionRemarkFor,
  jobsFor,
  lotOutcomeFor,
  qcSignerFor,
  readingFor,
  rosterPick,
  serviceRemarkFor,
  type LotOutcome,
} from "./plantSimulation";
import { dayInfo } from "./holidays";
import { isLotAccepted, isOutOfBand, supersededRevisionOf } from "./validation";
import { withComputedCells } from "./computedCells";
import { addDays, compareISO, formatDisplayDate } from "../utils/date";
import { generateId } from "../utils/id";
import { makeRng, type Rng } from "../utils/random";
import { GRADE_ACTIONS, GRADE_DEFECTS, GRADE_MIX, LOT_REASONS, MEASUREMENT_VARIATION } from "../data/seed/plantPattern";

// THE ASSISTANT'S AUTO-FILL. Given a document and a due date, produce the
// complete data the record would most plausibly contain, plus a short
// plain-language list of what was filled in and where the values came from.
//
// Ground rules (these are what keep the pre-filled records honest):
//  * Prefer carrying forward the user's most recent real (submitted/verified)
//    record of the same document. Operators, machines, batch numbers, tube
//    light dates, trap counts — all of that repeats day to day. What must NOT
//    be carried forward verbatim is anything a person observes afresh each
//    time: the clock time of a round, a reading, an inspection's observation,
//    a grade, a lot decision.
//  * When there is no previous record, fall back to the filled specimen
//    from the uploaded source document (never a made-up shape).
//  * Readings follow the plant's own behaviour model
//    (engine/plantSimulation.ts, calibrated in tools/plant_pattern.py against
//    the company's filled specimens): mostly in control, with the occasional
//    drift episode that takes a reading outside the printed band. An earlier
//    version clamped every generated value inside the band, which sounds
//    cautious but is the opposite: it made the assistant quietly attest
//    conformity on every record, and left the QC report's out-of-band column
//    permanently reading zero. What the assistant must never do is quietly
//    PASS something — so when the model says a reading went out, the note
//    says so in the first line and asks the user to confirm it.
//  * Values are deterministic per (document, date) via a seeded RNG, so a
//    page reload can't quietly change a number the user already looked at.
//  * The result is a DRAFT, and it is labelled as one on the record. Nothing
//    here submits or verifies anything; a person still reviews and signs.

export interface AutoFillResult {
  data: unknown;
  notes: string[];
  basedOn: string;
}

export function autoFillRecord(
  doc: DocumentDefinition,
  dueDateISO: string,
  master: MasterData,
  previous: RecordInstance | undefined
): AutoFillResult | null {
  const rng = makeRng(`${doc.id}|${dueDateISO}`);
  switch (doc.kind) {
    case "daily-pest-monitoring":
      return fillDailyMonitoring(doc, dueDateISO, master, previous as RecordInstance<DailyPestMonitoringData> | undefined, rng);
    case "fly-catcher":
      return fillFlyCatcher(doc, dueDateISO, master, previous as RecordInstance<FlyCatcherData> | undefined, rng);
    case "service-report":
      return fillServiceReport(doc, dueDateISO, master, previous as RecordInstance<ServiceReportData> | undefined, rng);
    case "training-record":
      return fillTraining(doc, dueDateISO, master, previous as RecordInstance<TrainingRecordData> | undefined);
    case "log-sheet":
      return fillLogSheet(doc, dueDateISO, master, previous as RecordInstance<LogSheetData> | undefined, rng);
    default:
      // CAPA findings and reference documents are never auto-filled: there
      // is nothing routine about a finding.
      return null;
  }
}

// ---------------------------------------------------------------------------
// helpers

function responsibleName(doc: DocumentDefinition, master: MasterData, fallback: string): string {
  const who = resolveResponsibleEmployees(doc, master);
  return who[0]?.name ?? fallback;
}

function basedOnLabel(doc: DocumentDefinition, previous: RecordInstance | undefined, specimen: string): string {
  return previous ? `your ${doc.name} of ${formatDisplayDate(previous.dueDate)}` : `the filled specimen in ${specimen}`;
}

function timeAround(rng: Rng, hour: number, minuteSpread = 25): string {
  const m = rng.int(0, minuteSpread);
  return `${String(hour).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function isNightHour(time: string): boolean {
  const h = Number(time.split(":")[0]);
  return h >= 18 || h < 8;
}

// ---------------------------------------------------------------------------
// 1. Daily Pest Control Monitoring Record (F/HR/17)

function fillDailyMonitoring(
  doc: DocumentDefinition,
  dueDate: string,
  master: MasterData,
  previous: RecordInstance<DailyPestMonitoringData> | undefined,
  rng: Rng
): AutoFillResult {
  const base = createDefaultData(doc, dueDate, master) as DailyPestMonitoringData;
  const day = dayInfo(dueDate, master);
  if (base.isHoliday && day.isHoliday) {
    return {
      data: base,
      notes: [
        day.kind === "weekly-off"
          ? `Marked as a holiday — ${day.weekday} is the weekly off, so no checkpoint entry is needed today.`
          : `Marked as a holiday (${day.name}) — no checkpoint entry is needed today.`,
      ],
      basedOn: "the Gujarat Print Pack Leave Calendar 2026 (Master Data → Holidays)",
    };
  }
  const prevData = previous?.data;
  const checkpoints: DailyPestMonitoringData["checkpoints"] = {};
  for (const cp of master.checkpoints) {
    if (cp.responseType === "number") {
      const prevVal = prevData?.checkpoints[cp.no]?.value;
      // 100 = the value written on the filled F/HR/17 specimen.
      checkpoints[cp.no] = { value: typeof prevVal === "number" ? prevVal : 100 };
    } else {
      const normal = cp.flagWhen === "Yes" ? "No" : "Yes";
      checkpoints[cp.no] = { value: normal };
    }
  }

  const summaryActions: DailyPestMonitoringData["summaryActions"] = [];

  // The housekeeping check points (1, 2, 3, 5, 6 — 10 is never flagged here,
  // because the tube-light validity it asks about is the fixed pair printed on
  // F/HR/18 beside it, see tools/plant_pattern.py). A register that
  // answered all ten the clean way every day for a year is a register nobody
  // is really walking round with — and this plant's own Dec-2023 GAP report
  // lists five things the contractor found, in the wording used here
  // (engine/plantSimulation.ts). Each one recorded gets its own Summary of
  // Actions row, because the printed form asks for exactly that.
  const findings = checkpointFindingsFor(dueDate);
  for (const finding of findings) {
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

  // The rodent checkpoints (7, 8, 9) follow the day's slot in the generated
  // catch pattern (engine/rodentPattern.ts) — mostly quiet, the occasional
  // catch with box, location and count, so the month reads like a real
  // register and the Rodent Trend report has something true to add up.
  const ev = rodentEventFor(dueDate);
  const rodentCatches = ev.catches;
  if (rodentCatches.length > 0) {
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

  // Who walked the round, and when. Carrying these forward verbatim wrote the
  // identical minute of the identical person into every record for a year;
  // the round is done in the first hour of the shift, by the person
  // responsible, with somebody else covering now and then.
  const responsible = responsibleName(doc, master, "Roshni");
  const checker = makeRng(`checker|${dueDate}`).chance(0.85) ? responsible : rosterPick("pestChecker", dueDate, responsible);
  const timeOfChecking = timeAround(makeRng(`round|${dueDate}`), 9, 45);
  const data: DailyPestMonitoringData = { ...base, checkpoints, timeOfChecking, checker, summaryActions, rodentCatches };
  const traps = checkpoints[4]?.value;
  const rodentNote = rodentCatches.length > 0
    ? `Checkpoint 7 = Yes: ${describeRodentEvent(ev)} Logged under Summary of Actions.`
    : ev.cakeBitingBoxNo
      ? `No rodent trapped; checkpoint 9 = Yes — bait-cake biting seen in ${ev.cakeBitingBoxNo}.`
      : findings.length === 0
        ? "All 10 checkpoints answered as normal — no rodent activity, no findings flagged."
        : "No rodent activity today.";
  const notes = [
    rodentNote,
    `Rodent traps provided: ${traps}${previous ? " (carried forward)" : " (as on the source register)"}.`,
    `Time of checking ${timeOfChecking}, checker ${checker}.`,
  ];
  if (findings.length > 0) {
    notes.unshift(
      `Check this before you submit: ${findings.length === 1 ? "check point" : "check points"} ${findings.map((f) => f.no).join(", ")} ${findings.length === 1 ? "is" : "are"} recorded as a finding — ${findings
        .map((f) => f.description)
        .join(" ")} The action taken is written into the Summary of Actions; confirm it is what actually happened.`
    );
  }
  return {
    data,
    notes,
    basedOn: basedOnLabel(doc, previous, "Kapila mam department reports.pdf (F/HR/17)") + (rodentCatches.length ? `; rodent activity per the seasonal catch pattern (${totalRodents(rodentCatches)} today)` : ""),
  };
}

// ---------------------------------------------------------------------------
// 2. Fortnightly Fly Catcher Inspection & Cleaning Record (F/HR/18)

function fillFlyCatcher(
  doc: DocumentDefinition,
  dueDate: string,
  master: MasterData,
  previous: RecordInstance<FlyCatcherData> | undefined,
  _rng: Rng
): AutoFillResult {
  const base = createDefaultData(doc, dueDate, master) as FlyCatcherData;
  const cleaner = master.employees.find((e) => e.id === "emp-vijay")?.name ?? "Vijay";
  const verifier = master.employees.find((e) => e.id === "emp-checker-1")?.name ?? "Roshni";
  let missingDates = 0;
  const expiring: string[] = [];
  const cycle = tubeLightCycle();
  // Catch counts follow the seasonal fly pattern per unit (engine/flyPattern.ts,
  // calibrated to the August-26 specimen) so the Fly Catcher Infestation
  // trend has a real shape — not a uniform random number per box.
  const entries = base.entries.map((e) => {
    const prev = previous?.data.entries.find((p) => p.pcId === e.pcId);
    // Carried forward from the last visit; with no history, the register's own
    // two fixed dates — every one of the thirteen units installed 24-11-2025
    // and due 23-11-2026, the tubes being changed together
    // (engine/flyPattern.ts, REQUIREMENTS §44).
    const install = prev?.tubeLightInstallDate ?? cycle.installed;
    const due = prev?.tubeLightDueDate ?? cycle.due;
    if (!prev?.tubeLightInstallDate || !prev?.tubeLightDueDate) missingDates += 1;
    // Tubes carried forward past their due date haven't been changed yet —
    // which is exactly what check point 10 on F/HR/17 asks about.
    if (due && compareISO(due, dueDate) <= 0) expiring.push(e.pcId);
    return {
      ...e,
      catchCountApprox: flyCatchFor(e.pcId, dueDate),
      tubeLightInstallDate: install,
      tubeLightDueDate: due,
      cleaningDoneBy: prev?.cleaningDoneBy?.trim() || cleaner,
      verifiedBy: prev?.verifiedBy?.trim() || verifier,
    };
  });
  const counts = entries.map((e) => e.catchCountApprox ?? 0);
  const total = counts.reduce((s, n) => s + n, 0);
  const month = Number(dueDate.slice(5, 7)) - 1;
  const notes = [
    `Filled all ${entries.length} fly catcher units (PC-01 to PC-${String(entries.length).padStart(2, "0")}) with approximate catch counts ${Math.min(...counts)}–${Math.max(...counts)} (${total} flies in total — ${flySeasonLabel(month)}).`,
    `Cleaning done by ${cleaner}, verified by ${verifier}.`,
  ];
  if (missingDates > 0) {
    notes.push(
      `Tube light dates for ${missingDates === entries.length ? "all units" : `${missingDates} unit(s)`} taken from the F/HR/18 register itself — installed ${formatDisplayDate(cycle.installed)}, replacement due ${formatDisplayDate(cycle.due)}, the same on every unit. Correct them if a tube has been changed since.`
    );
  } else {
    notes.push("Tube light install / due dates carried forward from your last record.");
  }
  if (expiring.length > 0) {
    notes.unshift(
      `Check this before you submit: the tube light validity of ${expiring.join(", ")} has run out. Replace the tube(s), update the install date here, and answer check point 10 on today's F/HR/17 accordingly.`
    );
  }
  return { data: { ...base, entries }, notes, basedOn: basedOnLabel(doc, previous, "Kapila mam department reports.pdf (F/HR/18)") };
}

// ---------------------------------------------------------------------------
// 3. Pest Control Service Report (Rat / Mice, Ants & Cockroaches, Fly)

function typicalQty(materialName: string, rng: Rng): string {
  if (materialName === "Glue Board") return `${rng.int(3, 4)}`;
  if (materialName === "Bromadiolone Cake") return `${rng.int(30, 40)} grams`;
  if (materialName.startsWith("Deltamethrin")) return "150 ml";
  if (materialName.startsWith("Beta-Cyfluthrin")) return `${rng.pick([100, 125, 150])} ml`;
  return "";
}

function fillServiceReport(
  doc: DocumentDefinition,
  dueDate: string,
  master: MasterData,
  previous: RecordInstance<ServiceReportData> | undefined,
  rng: Rng
): AutoFillResult {
  const base = createDefaultData(doc, dueDate, master) as ServiceReportData;
  const technician = previous?.data.technicianSign?.trim() || responsibleName(doc, master, "Yogesh Rathod");
  const customer =
    previous?.data.customerSign?.trim() || master.employees.find((e) => e.id === "emp-kapila")?.name.replace(/^Ms\.\s*/, "") || "Kapila Barad";
  // What the technician wrote against each area. Every area reading "No
  // Rodent Trapped" / "-" on every visit all year is not what a service
  // report looks like: the remark column is where a technician notes the
  // bait that was taken, the box that had moved, the gap they want closed.
  const observed: { area: string; finding: string; correctiveAction: string }[] = [];
  // The quantity is written once per material and holds for every area
  // treated with it (engine/serviceMaterials.ts): the first line of each
  // material carries the last visit's quantity, or the specimen's usual amount.
  const lines = normalizeServiceLines(
    doc.variantKey,
    base.lines.map((l) => {
      const prev = previous?.data.lines.find((p) => p.areaName === l.areaName);
      const fixed = fixedMaterialForServiceArea(doc.variantKey, l.areaName);
      const observation = serviceRemarkFor(doc.variantKey, l.areaName, dueDate);
      if (observation.finding) observed.push({ area: l.areaName, ...observation.finding });
      return {
        ...l,
        materialName: fixed.materialName,
        methodOfApplication: fixed.methodOfApplication,
        qtyUsed: prev?.qtyUsed?.trim() || typicalQty(fixed.materialName, rng),
        remarks: observation.remark,
      };
    })
  );
  const notes: string[] = [];
  if (lines.length === 0) {
    notes.push("No fixed area list exists for this service yet (TO BE CONFIRMED) — add the areas treated.");
  } else {
    const quantities = lines
      .filter((_, i) => isQuantityLine(lines, i))
      .map((l) => `${l.materialName}: ${l.qtyUsed || "—"}`)
      .join("; ");
    notes.push(
      `Filled the remarks for all ${lines.length} areas, and the quantity once per material (${quantities}) — the same on every area treated with it, as on the April-2026 service reports.`
    );
  }
  if (observed.length > 0) {
    notes.unshift(
      `Check this before you submit: the technician noted something at ${observed.length} area(s) — ${observed
        .map((o) => `${o.area}: ${o.finding}`)
        .join(" ")} Raise a CAPA finding if it isn't already covered.`
    );
  }
  notes.push(`Technician ${technician}; customer's representative pre-filled as ${customer} — confirm the countersignature before verifying.`);
  return {
    data: { ...base, lines, technicianSign: technician, customerSign: customer },
    notes,
    basedOn: basedOnLabel(doc, previous, "Service Report-April 2026.xls"),
  };
}

// ---------------------------------------------------------------------------
// 4. Training Record (yearly awareness programme)

function fillTraining(
  doc: DocumentDefinition,
  dueDate: string,
  master: MasterData,
  previous: RecordInstance<TrainingRecordData> | undefined
): AutoFillResult {
  const source = previous?.data ?? SEED_AWARENESS_TRAINING_RECORD.data;
  // Last year's names are carried forward as a starting point for the sheet,
  // not as an assertion that those people were there: the note below says so,
  // and a person strikes out whoever did not come and adds whoever did. A
  // training record showing the same full attendance every year is the kind of
  // thing an auditor asks to see the signed attendance sheet for.
  const data: TrainingRecordData = {
    trainingDate: dueDate,
    trainingType: source.trainingType || "Pest Control Awareness Training Program (annual)",
    trainerProvider: source.trainerProvider || "Gurudev Pest Control",
    topics: [...source.topics],
    attendees: source.attendees.map((a) => ({ ...a, id: generateId("att") })),
    certificateRef: "",
    remarks: "",
  };
  return {
    data,
    notes: [
      `Copied the ${data.topics.length} topics and the ${data.attendees.length} names from the ${formatDisplayDate(source.trainingDate)} programme.`,
      "The attendance sheet is last year's list — take off anyone who did not attend, add anyone new, and put in the certificate / attendance sheet reference.",
    ],
    basedOn: previous ? basedOnLabel(doc, previous, "") : "the 24-Dec-2025 awareness training (Training - Yrl (1).doc)",
  };
}

// ---------------------------------------------------------------------------
// 5. Generic log sheets (lamination QC / production)

function signFor(col: LogColumn, time: string | undefined, doc: DocumentDefinition, master: MasterData, dueDate: string): string {
  const shift = col.autoFill?.byShift;
  if (shift && time) return isNightHour(time) ? shift.night : shift.day;
  if (shift) return shift.day;
  // A QC sheet with one sign box (the hot-room record) is signed by whoever
  // was on that shift, not by the first name the role lookup happens to
  // return — which used to put "Jeni" on every temperature sheet ever filed.
  if (doc.id.startsWith("qc-") && !col.autoFill?.byShift) {
    return qcSignerFor(makeRng(`shift|${doc.id}|${dueDate}`).chance(0.5) ? "09:00" : "21:00");
  }
  return responsibleName(doc, master, "");
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Whole days from one ISO date to another, counted in UTC so no clock change moves it. */
function daysFrom(fromISO: string, toISO: string): number {
  return Math.round((Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / 86400000);
}

function jittered(value: number, fraction: number, decimals: number, rng: Rng): number {
  const f = Math.pow(10, decimals);
  return Math.round(value * (1 + (rng.next() - 0.5) * 2 * fraction) * f) / f;
}

// Every reading the assistant proposed that landed outside the printed band,
// so the caller can say so in the notes and write the operator's explanation
// into the Remark column where the paper form has one.
export interface RowFillContext {
  outOfBand: { column: LogColumn; value: number; rowIndex: number; time?: string }[];
}

function fillRow(
  layout: LogSheetLayout,
  template: Record<string, string | number | null> | undefined,
  rng: Rng,
  doc: DocumentDefinition,
  master: MasterData,
  dueDate: string,
  rowIndex: number,
  rowCount: number,
  ctx: RowFillContext,
  fixedTime?: string
): LogSheetRow {
  const row: LogSheetRow = { id: generateId("row") };
  const timeForSign =
    fixedTime ?? (typeof template?.time === "string" ? (template.time as string) : typeof template?.startTime === "string" ? (template.startTime as string) : undefined);
  // The line's own date, where the form has one that is the record's day
  // (autoFill.dueDate), and how far the template line's date is moved to get
  // there — see the other dates on the line, below.
  const ownDate = layout.columns.find((c) => c.type === "date" && !c.fixed && c.autoFill?.dueDate);
  const templateDate = ownDate ? template?.[ownDate.key] : undefined;
  const moved = typeof templateDate === "string" && ISO_DATE.test(templateDate) ? daysFrom(templateDate, dueDate) : null;
  for (const col of layout.columns) {
    const t = template?.[col.key];
    if (col.fixed && fixedTime !== undefined && layout.rowMode.kind === "timeSlots" && col.key === layout.rowMode.slotKey) {
      row[col.key] = fixedTime;
      continue;
    }
    if (col.fixed && t !== undefined && t !== null) {
      row[col.key] = t;
      continue;
    }
    // A judgement made afresh each time (REQUIREMENTS §76) — an audit's
    // compliance, a verification's C / NC, a month's actual — is never copied
    // from the last sheet or the specimen: it is the person's to write.
    if (!col.fixed && col.autoFill?.fresh) {
      row[col.key] = col.type === "number" ? null : "";
      continue;
    }
    // "Date of Measurement" on a round walked in one day: the date the record
    // is for, on every line, never the date the last sheet was for
    // (REQUIREMENTS §74).
    if (!col.fixed && col.autoFill?.dueDate) {
      row[col.key] = dueDate;
      continue;
    }
    // Any other date on such a line is written relative to the line's own
    // date — F/QC/12's Next Due Date after the calibration it follows — so it
    // moves with it and keeps the template's own interval (REQUIREMENTS §75).
    // Copied as it stood, every weekly sheet of a demo year gave the
    // specimen's 2024 due dates beside this year's calibrations. A date with
    // no line date to count from cannot be placed, so it is left to the person.
    if (ownDate && col.type === "date" && !col.fixed && !col.autoFill?.carryForward) {
      row[col.key] = typeof t === "string" && ISO_DATE.test(t) && moved !== null ? addDays(t, moved) : "";
      continue;
    }
    if (col.autoFill?.sign) {
      row[col.key] = signFor(col, timeForSign, doc, master, dueDate);
      continue;
    }
    if (col.type === "number") {
      const af = col.autoFill;
      // A reading somebody TAKES (it has a printed nominal — viscosity, hot
      // room temperature) follows the plant's behaviour model, drift episodes
      // and all. A machine set-point or a weighed quantity is not a
      // measurement: the specimen shows the same 3.00 / 2.00 / 45 and the
      // same 15 / 1.65 / 19.5 repeated row after row, so those are copied,
      // and what makes them differ between records is the job that ran
      // (jobsFor), not noise. Jittering them was also a random walk — each
      // day centred on yesterday's jittered value — which wandered into the
      // band edges within a few weeks.
      if (col.nominal !== undefined && col.min !== undefined && col.max !== undefined) {
        const reading = readingFor(doc.id, dueDate, col, rowIndex, rowCount);
        row[col.key] = reading.value;
        if (reading.outOfBand) ctx.outOfBand.push({ column: col, value: reading.value, rowIndex, time: timeForSign });
      } else if (typeof t === "number" && af?.jitter) row[col.key] = jittered(t, af.jitter, col.decimals ?? 2, rng);
      else if (typeof t === "number") row[col.key] = t;
      else if (af?.default !== undefined) row[col.key] = Number(af.default);
      else row[col.key] = null;
      continue;
    }
    // A remark is written about the batch in front of the operator, so it
    // must never be inherited: carrying one forward wrote yesterday's
    // "fresh drum opened" onto every sheet from then on.
    if (isRemarkColumn(col)) {
      row[col.key] = "";
      continue;
    }
    if (t !== undefined && t !== null && t !== "") {
      row[col.key] = t;
      continue;
    }
    row[col.key] = col.autoFill?.default !== undefined ? String(col.autoFill.default) : "";
  }
  return row;
}

// By the issued key, by the key a plant-added column gets ("remarks_mfk2p9c0" —
// engine/formatOps.ts newKey), or by the heading itself.
const isRemarkColumn = (col: LogColumn): boolean => col.type === "text" && (/^remarks?(?:_|$)/i.test(col.key) || /^remarks?$/i.test(col.label.trim()));

// An out-of-band number with nothing written beside it is the first thing an
// auditor asks about, so where the printed form HAS a remark column, the
// explanation goes in it. (F-QC-30 has no such column on paper — the format
// is controlled, so nothing is added to it; the flag lives in the assistant's
// notes instead, which is where the operator is asked to explain it.)
function explainExcursions(layout: LogSheetLayout, rows: LogSheetRow[], doc: DocumentDefinition, dueDate: string, ctx: RowFillContext): void {
  if (ctx.outOfBand.length === 0) return;
  const remarkCol = layout.columns.find(isRemarkColumn);
  if (!remarkCol) return;
  for (const hit of ctx.outOfBand) {
    const row = rows[hit.rowIndex];
    if (!row || String(row[remarkCol.key] ?? "").trim() !== "") continue;
    const note = excursionRemarkFor(doc.id, dueDate, hit.column.key);
    if (note) row[remarkCol.key] = note.remark;
  }
}

// ---- the observations on the inspection formats -----------------------------
// An observation is a measurement of the lot in front of the inspector, so it
// is never inherited from the last inspection (REQUIREMENTS §75). Carried
// forward, the first value ever entered became permanent — F/QC/37's Leak Test
// read "PASS" on every record the system would ever hold — and once a lot
// failed, the FAIL was copied onto every inspection after it: in a demo year
// 127 pouching and 192 slitting records read FAIL beside a lot marked
// Accepted. The same carry-forward runs in Live, from the last confirmed
// record (engine/assistantPrepare.ts), so each observation is worked out
// afresh for every record:
//  * a pass/fail test reads the specimen's passing word, and its failing word
//    only when TODAY's lot was rejected, segregated or taken on deviation for
//    that very test (plantSimulation.ts lotOutcomeFor, the same decision the
//    Lot Status box is filled from);
//  * a measured figure is the job's own figure (the filled specimen's) with
//    the scatter of one lot's measurement around it — never the last record's
//    figure moved again, which compounded into a random walk (Pouch Height 181
//    → 218 mm, Repeat Length 203.2 → 258.5 mm over the year);
//  * where the lot's reason states the figure ("Pouch height 178 mm against
//    181 mm specified"), the observation beside it reads that figure.

const PASS_WORDS = /^(pass|passed|ok|no ?leak)$/i;
const FAIL_WORDS = /^(fail|failed|not ok|leak|leaking)$/i;

// Same casing as the word it answers: "PASS" / "FAIL", "Pass" / "Fail".
const casedLike = (model: string, word: string): string =>
  model === model.toUpperCase() ? word.toUpperCase() : model[0] === model[0].toUpperCase() ? word[0].toUpperCase() + word.slice(1) : word.toLowerCase();

/** The word this test reads when it passes — given either the word it passes with or the one it failed with. */
function passingWord(text: string): string | null {
  const t = text.trim();
  if (PASS_WORDS.test(t)) return t;
  if (!FAIL_WORDS.test(t)) return null;
  if (/^not ok$/i.test(t)) return casedLike(t, "ok");
  if (/^leak/i.test(t)) return casedLike(t, "no leak");
  return casedLike(t, "pass");
}

function failingWord(pass: string): string {
  if (/^ok$/i.test(pass)) return casedLike(pass, "not ok");
  if (/^no ?leak$/i.test(pass)) return casedLike(pass, "leak");
  return casedLike(pass, "fail");
}

// Words in a printed parameter that say nothing about WHICH test it is: "Leak
// Test" is about a leak, not about "test" — a reason that says "re-tested"
// must not fail every test on the sheet.
const GENERIC_PARAMETER_WORDS = new Set(["test", "tests", "total", "type", "pouch", "roll", "film", "width", "only", "form", "customer", "requirement", "from", "given", "reference", "card", "specification", "product"]);

/** Does the lot's stated reason concern this printed test parameter? */
function reasonConcerns(reason: string, parameter: string): boolean {
  const words = (parameter.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !GENERIC_PARAMETER_WORDS.has(w));
  const r = reason.toLowerCase();
  return words.some((w) => new RegExp(`\\b${w}`).test(r));
}

interface StatedFigure {
  /** The figure the lot measured, as the reason writes it ("178", "0.240"). */
  text?: string;
  value?: number;
  /** What it was measured against ("against 181 mm specified"). */
  against?: number;
  /** A spread rather than a reading ("variation of 0.3 mm on the repeat"). */
  variation?: number;
}

/** The figure a lot reason states for this printed parameter, if it states one. */
function statedFigure(reason: string, parameter: string): StatedFigure | null {
  const name = parameter.replace(/\s*\(.*$/, "").trim().toLowerCase();
  const r = reason.toLowerCase();
  const at = name ? r.indexOf(name) : -1;
  if (at >= 0) {
    const m = r.slice(at + name.length).match(/^\s+(\d+(?:\.\d+)?)\s*[a-zµ]*\s+against\s+(\d+(?:\.\d+)?)/);
    if (m) return { text: m[1], value: Number(m[1]), against: Number(m[2]) };
  }
  const v = r.match(/variation of (\d+(?:\.\d+)?)\s*[a-zµ]*\s+on the ([a-z]+)/);
  if (v && reasonConcerns(v[2], parameter)) return { variation: Number(v[1]) };
  return null;
}

/**
 * The smallest departure from the job's figure that this format's own lot
 * reasons call a deviation (a pouch 3 mm short, a slit roll 2 mm narrow, a
 * 0.3 mm variation on the repeat). An Accepted lot's figure stays well inside
 * it, or an Accepted lot would read the very figure another day's lot was
 * taken on deviation for.
 */
function deviationLimit(documentId: string, parameter: string): number | null {
  let limit: number | null = null;
  for (const reasons of Object.values(LOT_REASONS[documentId] ?? {})) {
    for (const reason of reasons) {
      const s = statedFigure(reason, parameter);
      const gap = s?.variation ?? (s?.value !== undefined && s.against !== undefined ? Math.abs(s.value - s.against) : undefined);
      if (gap !== undefined && gap > 0) limit = limit === null ? gap : Math.min(limit, gap);
    }
  }
  return limit;
}

/** "181", "97.0", "260 mm", "25 mic" — a figure, with the unit the inspector wrote after it. */
function measurementOf(text: string): { value: number; decimals: number; suffix: string } | null {
  const m = text.trim().match(/^(\d+(?:\.(\d+))?)(\s*[a-zµ]+)?$/i);
  if (!m) return null;
  return { value: Number(m[1]), decimals: (m[2] ?? "").length, suffix: m[3] ?? "" };
}

/** In "L1 = 0.306 kg (BRK); L2 = 0.435 kg (BRK)", the lot's stated 0.240 takes the place of the figure nearest what it was measured against. */
function withStatedFigure(text: string, stated: StatedFigure): string {
  const figures = Array.from(text.matchAll(/\d+(?:\.\d+)?/g));
  if (figures.length === 0 || stated.against === undefined || stated.text === undefined) return stated.text ?? text;
  const nearest = figures.reduce((best, f) => (Math.abs(Number(f[0]) - stated.against!) < Math.abs(Number(best[0]) - stated.against!) ? f : best));
  const at = nearest.index ?? 0;
  return text.slice(0, at) + stated.text + text.slice(at + nearest[0].length);
}

interface ObservationContext {
  /** The day's lot decision, on a format with a Lot Status box. */
  lot: LotOutcome | null;
  /** The sheet is for the specimen's own job (or names no job), so the specimen's figures are this job's figures. */
  specimenJob: boolean;
}

function observeRow(doc: DocumentDefinition, layout: LogSheetLayout, row: LogSheetRow, dueDate: string, index: number, ctx: ObservationContext): LogSheetRow {
  if (doc.id === "qc-inprocess-printing") return varyGrade(layout, row, dueDate, index);
  const carried = row.observation;
  if (typeof carried !== "string") return row;
  const own = layout.specimenRows?.[index]?.observation;
  // Another job's figures are not this job's: on a sheet for a job the
  // specimen was not filled for, the person's own last figures stand in.
  const specimen = ctx.specimenJob && typeof own === "string" ? own.trim() : undefined;
  const parameter = String(row.parameter ?? "");
  const reason = ctx.lot && !isLotAccepted(ctx.lot.status) ? ctx.lot.reason : "";

  // A pass/fail test: its passing word, unless today's lot was held for it.
  const pass = specimen !== undefined ? passingWord(specimen) : passingWord(carried);
  if (pass) {
    row.observation = reason && reasonConcerns(reason, parameter) ? failingWord(pass) : pass;
    return row;
  }

  // What the row reads before today's lot has its say. On a Lot Status format
  // every observation is of the lot, so the job's own words are the base
  // (the "8" a deviation wrote into Centre Seal Width yesterday is not today's).
  const base = specimen !== undefined && (ctx.lot !== null || measurementOf(specimen)) ? specimen : carried.trim();
  const figure = measurementOf(base);
  // The lot reasons are written against the specimen's job ("against 181 mm
  // specified"), so their figures are only ever written onto that job's sheet;
  // on another job's they would be the wrong job's figure, and would then be
  // carried forward as if the person had measured it.
  const stated = reason && ctx.specimenJob ? statedFigure(reason, parameter) : null;
  if (stated?.text !== undefined) {
    row.observation = figure || base === "" || base === "-" ? stated.text + (figure?.suffix ?? "") : withStatedFigure(base, stated);
  } else if (stated?.variation !== undefined && figure) {
    const rng = makeRng(`observation|${doc.id}|${dueDate}|${index}`);
    row.observation = (figure.value + (rng.chance(0.5) ? 1 : -1) * stated.variation).toFixed(figure.decimals) + figure.suffix;
  } else if (figure && base === specimen) {
    // One lot's measurement around the job's figure: two draws make the
    // scatter bunch near it, as repeated measurements of one set-up do.
    const rng = makeRng(`observation|${doc.id}|${dueDate}|${index}`);
    const limit = deviationLimit(doc.id, parameter);
    const spread = Math.min(Math.abs(figure.value) * MEASUREMENT_VARIATION, limit !== null ? limit / 2 : Infinity);
    row.observation = (figure.value + (rng.next() + rng.next() - 1) * spread).toFixed(figure.decimals) + figure.suffix;
  } else {
    row.observation = base;
  }
  return row;
}

/** F/QC/13: the grade against one printing parameter, its defect count, and Pass?. */
function varyGrade(layout: LogSheetLayout, row: LogSheetRow, dueDate: string, index: number): LogSheetRow {
  // Pass? follows the day's grade, never the last sheet's: a "No" written
  // under an F grade once must not follow every sheet after it.
  const ownPass = layout.specimenRows?.[index]?.pass;
  // "-" on the specimen means the parameter doesn't apply to this product
  // (punching, on a job with no labels to punch) — leave those alone.
  if (String(row.grade ?? "").trim() === "-") {
    if (ownPass !== undefined) row.pass = ownPass;
    return row;
  }
  const rng = makeRng(`grade|${dueDate}|${index}`);
  const grade = weightedPick(rng, GRADE_MIX);
  row.grade = grade;
  row.defectCount = rng.pick(GRADE_DEFECTS[grade] ?? ["-"]);
  // An F grade stops printing (the form's own rule), so it never passes.
  row.pass = grade === "F" ? "No" : (ownPass ?? (row.pass === "No" ? "Yes" : row.pass));
  return row;
}

/** The printed grading rule's consequence, if today's grades triggered it. */
function gradeRuleAction(doc: DocumentDefinition, rows: LogSheetRow[]): string | null {
  if (doc.id !== "qc-inprocess-printing") return null;
  const grades = rows.map((r) => String(r.grade ?? ""));
  if (grades.includes("F")) return GRADE_ACTIONS.F;
  if (grades.filter((g) => g === "C").length > 1) return GRADE_ACTIONS.C;
  return null;
}

function weightedPick<T>(rng: Rng, options: { value: T; weight: number }[]): T {
  const total = options.reduce((s, o) => s + o.weight, 0);
  let r = rng.next() * total;
  for (const o of options) {
    r -= o.weight;
    if (r <= 0) return o.value;
  }
  return options[options.length - 1].value;
}

function describeExcursions(ctx: RowFillContext): string | null {
  if (ctx.outOfBand.length === 0) return null;
  const first = ctx.outOfBand[0];
  const where = first.time ? ` at ${first.time}` : ctx.outOfBand.length === 1 ? "" : "";
  const rest = ctx.outOfBand.length > 1 ? ` (${ctx.outOfBand.length} readings outside the band in all)` : "";
  return `Check this before you submit: ${first.column.label} ${first.value}${first.column.unit ? " " + first.column.unit : ""}${where} is outside the printed limit of ${first.column.min}–${first.column.max}${rest}. Confirm the actual reading and record what was done about it.`;
}

function fillLogSheet(
  doc: DocumentDefinition,
  dueDate: string,
  master: MasterData,
  given: RecordInstance<LogSheetData> | undefined,
  rng: Rng
): AutoFillResult | null {
  const layout = getLogSheetLayout(doc.id);
  if (!layout) return null;
  // A page filled on a revision the format has since replaced holds that
  // revision's boxes and columns, not these (REQUIREMENTS §74): F/MNT/11's 2024
  // Day/Night readings would carry nothing into Rev 01's single Lux Level
  // column, or worse, carry row 7 of one area list onto row 7 of another. It is
  // never the sheet a new one is carried forward from — the specimen is.
  const previous = given && supersededRevisionOf(given) ? undefined : given;

  // Header + footer fields: carry forward (job, operator, machine,
  // batches...), sign fields resolve to the responsible employee, else the
  // fixed default, else the specimen.
  const header: Record<string, string> = {};
  for (const f of [...layout.headerFields, ...(layout.footerFields ?? [])]) {
    const prev = previous?.data.header?.[f.key];
    if (f.autoFill?.sign) header[f.key] = prev?.trim() || responsibleName(doc, master, layout.specimenHeader?.[f.key] ?? "");
    // "Date of Inspection", "Date :" — the day the record is for, not the day the last one was.
    else if (f.autoFill?.dueDate) header[f.key] = dueDate;
    else if (f.autoFill?.carryForward && prev) header[f.key] = prev;
    else if (f.autoFill?.default !== undefined) header[f.key] = f.autoFill.default;
    else header[f.key] = f.autoFill?.carryForward ? (layout.specimenHeader?.[f.key] ?? "") : "";
  }

  // How the lot was dispositioned, on the inspection formats that print a Lot
  // Status box — decided before the observations, which have to agree with it.
  const lotStatusField = layout.footerFields?.find((f) => f.key === "lotStatus");
  const lot = lotStatusField ? lotOutcomeFor(doc.id, dueDate) : null;

  let rows: LogSheetRow[] = [];
  const ctx: RowFillContext = { outOfBand: [] };
  const mode = layout.rowMode;
  if (mode.kind === "timeSlots") {
    rows = mode.slots.map((slot, i) => fillRow(layout, undefined, rng, doc, master, dueDate, i, mode.slots.length, ctx, slot));
  } else if (mode.kind === "single") {
    rows = [fillRow(layout, layout.specimenRows?.[0], rng, doc, master, dueDate, 0, 1, ctx)];
  } else if (mode.kind === "fixedRows") {
    // The printed parameter list never changes. Observations are the day's
    // own measurements of the day's lot, worked out afresh (observeRow) rather
    // than copied from the last record — which froze "Leak Test: PASS" into
    // every inspection, and later froze a FAIL the same way.
    const specimenJob = String(layout.specimenHeader?.fgCode ?? "").trim();
    const job = String(header.fgCode ?? "").trim();
    const observing: ObservationContext = { lot, specimenJob: !specimenJob || !job || job === specimenJob };
    rows = mode.rows.map((fixed, i) => {
      const source = previous?.data.rows?.[i] ?? layout.specimenRows?.[i] ?? {};
      const { id: _ignored, ...prevValues } = source as Record<string, string | number | null>;
      void _ignored;
      const row = fillRow(layout, { ...prevValues, ...fixed }, rng, doc, master, dueDate, i, mode.rows.length, ctx);
      return observeRow(doc, layout, row, dueDate, i, observing);
    });
  } else if (isLaminationSheet(doc.id)) {
    // The jobs that actually ran today (engine/plantSimulation.ts) instead of
    // yesterday's job list copied forward with the same PO numbers for ever.
    const jobs = jobsFor(dueDate);
    const template = (previous?.data.rows?.[0] ?? layout.specimenRows?.[0] ?? {}) as Record<string, string | number | null>;
    rows = jobs.map((job, i) => {
      const { id: _ignored, ...base } = template;
      void _ignored;
      const row = fillRow(layout, { ...base, ...jobRowValues(doc.id, job) }, rng, doc, master, dueDate, i, jobs.length, ctx);
      return row;
    });
  } else {
    const source = previous?.data.rows?.length ? previous.data.rows : (layout.specimenRows ?? []);
    const wanted = mode.typicalRows ?? Math.max(mode.minRows ?? 1, 1);
    // A register supplied blank has nothing to copy from — no sheet before it
    // and no filled specimen. It still gets the lines the form prints a minimum
    // of, each filled by its own columns' rules (the date, a signature), rather
    // than no lines at all: a record with no lines cannot be submitted.
    const templates = source.length
      ? source.slice(0, Math.max(wanted, mode.minRows ?? 1))
      : Array.from({ length: Math.max(mode.minRows ?? 1, 1) }, () => ({}) as Record<string, string | number | null>);
    if (doc.id === "qc-adhesive-mixing") {
      // Batches are mixed a few times a day at irregular hours; spread them
      // out rather than copying yesterday's clock times verbatim.
      const hours = [rng.int(7, 10), rng.int(13, 16), rng.int(20, 23)].slice(0, wanted);
      rows = hours.map((h, i) =>
        fillRow(layout, { ...(templates[i] ?? templates[0] ?? {}), time: timeAround(rng, h, 59) }, rng, doc, master, dueDate, i, hours.length, ctx)
      );
    } else {
      rows = templates.map((t, i) => fillRow(layout, t, rng, doc, master, dueDate, i, templates.length, ctx));
    }
  }

  explainExcursions(layout, rows, doc, dueDate, ctx);
  // The lot's disposition, in the Lot Status box. Every one of them used to
  // read "Accepted" for ever.
  if (lotStatusField && lot) {
    // In the form's own words: the incoming material records print their
    // statuses in capitals ("ACCEPTED"), the lamination ones in title case.
    header.lotStatus = lotStatusField.options?.find((o) => o.trim().toLowerCase() === lot.status.trim().toLowerCase()) ?? lot.status;
    header.deviationReason = lot.reason;
  }

  // F/QC/13 prints its own rule: an F grade stops printing, and more than one
  // C sends the decision to the QA Manager. If the grades say that happened,
  // the Remarks box has to say what was done — otherwise the register records
  // a stoppage nobody acted on.
  const gradeAction = gradeRuleAction(doc, rows);
  if (gradeAction) header.remarks = gradeAction;

  // Every worked-out cell worked out on what was filled (engine/computedCells.ts,
  // REQUIREMENTS §74): a prepared, sample, guided or demo record stores the
  // right figure, not the one the specimen or the last sheet happened to hold.
  const data: LogSheetData = withComputedCells(doc.id, { header, rows });
  const notes = describeLogSheet(doc, layout, data, previous);
  const excursion = describeExcursions(ctx);
  if (excursion) notes.unshift(excursion);
  if (gradeAction) notes.unshift(`Check this before you submit: ${gradeAction}`);
  if (header.lotStatus && !isLotAccepted(header.lotStatus)) {
    notes.unshift(`Check this before you submit: this lot is marked ${header.lotStatus} — ${header.deviationReason} Confirm the disposition with QA.`);
  }
  // A Calibration Expiry is a fact about the instrument, so it is carried as
  // it was written, never moved on to make a sheet look current. When it has
  // already run out by this sheet's day, the note says so first (REQUIREMENTS
  // §75): Pass lines on an instrument out of calibration are exactly the quiet
  // pass the assistant must never give.
  const expiry = header.calibrationExpiry;
  if (typeof expiry === "string" && ISO_DATE.test(expiry) && compareISO(expiry, dueDate) < 0) {
    notes.unshift(
      `Check this before you submit: the Calibration Expiry carried forward, ${formatDisplayDate(expiry)}, is before this sheet's date — the instrument is out of calibration. Write the new expiry if it has been calibrated since; if not, report it to the QA manager.`
    );
  }
  return { data, notes, basedOn: basedOnLabel(doc, previous, layout.specimenSource) };
}

const isLaminationSheet = (documentId: string): boolean => documentId === "prd-process-parameter" || documentId === "prd-alc-production";

// Map one scheduled job onto whichever of the two lamination sheets is being
// filled — the two formats record the same run in different columns.
function jobRowValues(documentId: string, job: ReturnType<typeof jobsFor>[number]): Record<string, string | number | null> {
  const common = { poNo: job.poNo, fgCode: job.fgCode, jobName: job.jobName };
  if (documentId === "prd-process-parameter") {
    return { ...common, lineSpeed: job.lineSpeed, laminationNipTemp: job.nipTemp };
  }
  return {
    ...common,
    layer1Type: job.layer1Type,
    layer2Type: job.layer2Type,
    layer1Kg: job.layer1Kg,
    layer2Kg: job.layer2Kg,
    rollWeight: job.rollWeight,
    okMeters: job.okMeters,
    startTime: job.startTime,
    endTime: job.endTime,
    inTimeHotroom: job.inTimeHotroom,
  };
}

function rangeOf(rows: LogSheetRow[], key: string): { min: number; max: number } | null {
  const vals = rows.map((r) => r[key]).filter((v): v is number => typeof v === "number");
  if (vals.length === 0) return null;
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

function describeLogSheet(doc: DocumentDefinition, layout: LogSheetLayout, data: LogSheetData, previous: RecordInstance | undefined): string[] {
  const rows = data.rows;
  const h = data.header;
  switch (doc.id) {
    case "qc-viscosity": {
      const r = rangeOf(rows, "viscosity");
      const testers = Array.from(new Set(rows.map((x) => x.testedBy).filter(Boolean)));
      // The readings drift out of band now and then (engine/plantSimulation.ts),
      // so "all within" is only said when it's true — beside an out-of-band
      // reading it was exactly the false pass this note must never give.
      const col = layout.columns.find((c) => c.key === "viscosity");
      const outside = col ? rows.filter((x) => isOutOfBand(col, x.viscosity)).length : 0;
      return [
        `Filled all ${rows.length} hourly readings: ${r?.min.toFixed(2)}–${r?.max.toFixed(2)} Sec., ${outside === 0 ? "all within 20.0 ± 1.0" : `${outside} outside 20.0 ± 1.0`}.`,
        `Tested by ${testers.join(" (day) / ")}${testers.length > 1 ? " (night)" : ""}.`,
      ];
    }
    case "qc-temperature": {
      const keys = layout.columns.filter((c) => c.type === "number").map((c) => c.key);
      const vals = keys.map((k) => rows[0]?.[k]).filter((v): v is number => typeof v === "number");
      return [
        `Logged all 6 hot-room readings: ${Math.min(...vals)}–${Math.max(...vals)} °C (recommended 45 ± 2 °C).`,
        `Signed ${rows[0]?.sign || "—"}.`,
      ];
    }
    case "qc-adhesive-mixing": {
      const r = rangeOf(rows, "viscosity");
      return [
        `Prepared ${rows.length} batch rows at the standard 15 kg adhesive / 1.65 kg hardener / 19.5 kg ethyl mix.`,
        `Mix viscosity ${r?.min.toFixed(2)}–${r?.max.toFixed(2)} Sec.; checked by ${Array.from(new Set(rows.map((x) => x.checkedBy).filter(Boolean))).join(", ")}. Add or remove rows to match today's batches.`,
      ];
    }
    case "prd-process-parameter":
      return [
        `${previous ? "Carried forward" : "Loaded"} ${rows.length} job(s) on ${h.machineName} (operator ${h.operatorName}, shift ${h.shift}) with the same machine settings as ${previous ? "last time" : "the specimen sheet"} — change the job list if today's jobs differ.`,
        `Adhesive ${h.adhesiveMake} ${h.adhesiveCode} batch ${h.adhesiveBatch}; hardener ${h.hardenerMake} ${h.hardenerCode} batch ${h.hardenerBatch}; mixing ratio ${h.mixingRatio}. Update the batch numbers if a new drum was opened.`,
      ];
    case "prd-alc-production":
      return [
        `${previous ? "Carried forward" : "Loaded"} ${rows.length} job(s) for ${h.machineName}, operator ${h.operatorName}, shift ${h.shift} — ALC marked Yes for each.`,
        "Check start / end times, roll weights and OK meters against today's actual production before submitting.",
      ];
    case "qc-inspection-pouching":
    case "qc-inspection-slitting":
    case "qc-inspection-printed-film": {
      const job = [h.fgCode && `FG ${h.fgCode}`, h.poNumber && `PO ${h.poNumber}`, h.jobName].filter(Boolean).join(" · ");
      // Not "carried forward": the observations are worked out for today's lot
      // (observeRow), and the person writes in what was actually measured.
      return [
        `Filled all ${rows.length} test-parameter observations for ${job || "the current job"} (shift ${h.shift}) with this job's usual figures, and every pass / fail test set by today's lot (${h.lotStatus}) rather than copied from the last inspection. Write in what was actually measured.`,
        `Inspected by ${h.inspectedBy}. Update the job / PO if a different lot is being inspected today; "Approved by (QA Manager)" is the Verify step.`,
      ];
    }
    case "qc-inprocess-printing": {
      const grades = rows.map((r) => `${String(r.parameter).split(" (")[1]?.replace(")", "") ?? r.parameter}: ${r.grade}`).join(", ");
      return [
        `${previous ? "Carried forward" : "Loaded"} grades for item ${h.itemCode} (PO ${h.poNumber}) on ${h.machine}, operator ${h.operator} — ${grades}.`,
        `QA person ${h.qaPerson}. Change any grade that differs on today's sample sheets; an F grade means printing must stop.`,
      ];
    }
    default:
      return [`Filled ${rows.length} row(s) with typical values.`];
  }
}
