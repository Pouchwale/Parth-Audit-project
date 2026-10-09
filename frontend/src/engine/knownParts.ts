import type {
  DailyPestMonitoringData,
  DocumentDefinition,
  FlyCatcherData,
  LogSheetData,
  LogSheetRow,
  MasterData,
  RecordInstance,
  ServiceReportData,
  TrainingRecordData,
} from "../types";
import { getLogSheetLayout } from "../data/seed/logSheetLayouts";
import { SEED_AWARENESS_TRAINING_RECORD } from "../data/seed/historicalRecords";
import { createDefaultData } from "./recordDefaults";
import { dayInfo } from "./holidays";
import { withComputedCells } from "./computedCells";
import { supersededRevisionOf, validateForSubmit } from "./validation";
import { boxKind, CARRIED_FIGURES, columnKind, LIST_COLUMNS } from "./observations";
import { compareISO, formatDisplayDate } from "../utils/date";
import { generateId } from "../utils/id";

// THE ONE RULE FOR PREPARING A LIVE RECORD (REQUIREMENTS §98, decided 8-Oct-2026).
//
// On 8-Oct-2026 the owner asked for the system to generate pest, cleaning and other monitoring data
// that looks manually entered, so that auditors believe it. That would be falsifying food-safety and
// hygiene records, and it is not built. A Live record is prepared with what is KNOWN and nothing else:
//
//   * the record itself and its date;
//   * the fixed rows the form prints (the check points, the fly catcher units, the service areas,
//     the time slots, a machine's PM lines, a checklist's questions);
//   * the plant's standing values (the machine, the instrument, the chemicals in use, the material
//     and method fixed for each pest-control area, the contractor, the standing team);
//   * what truly carries forward unchanged from the last record a person confirmed: a tube light's
//     install and due dates, a yearly list's people or suppliers, a stock ledger's opening stock
//     (yesterday's closing stock), the standing values above.
//
// Every observation is left empty for the person: readings, counts, pass or fail, OK or not OK,
// findings, the time of a round, quantities used, the job or lot in front of them, signatures and
// the names of whoever checked (engine/observations.ts says which is which, box by box). The record
// is then "needs input", and the briefing and the notifications say how many entries wait.
//
// ONE rule, run in three places that must agree: the browser at start-up (data/bootstrap.ts through
// engine/assistantPrepare.ts prepareDueRecords), the engine host on the server, and the server's
// morning job (backend/notificationJobs.ts "morning-prepare", through the engine host's "prepare").
// The simulation that writes plausible readings (engine/autoFill.ts with engine/plantSimulation.ts
// and the pest patterns) is Demo Mode's, and never reaches a Live record.

/** The line the record's history carries for the assistant's preparation. */
export const PREPARED_NOTE = "Prepared by the assistant: the known parts; the readings are the person's";

export interface KnownPartsResult {
  data: unknown;
  /** Plain words on what was filled, where it came from, and what is left for the person. */
  notes: string[];
  basedOn: string;
  /** How many entries the submit checks still ask for (engine/validation.ts): what the person has to write. */
  waiting: number;
}

const CONFIRMED = new Set(["Submitted", "Pending Verification", "Verified"]);

/**
 * The known parts of a Live record of `doc` due on `dueDate`. `previous` is the last record of the same
 * document a person confirmed (engine/assistantPrepare.ts latestConfirmedRecord); anything else (a
 * draft, a demo record, a sheet on a revision the format has replaced) carries nothing forward.
 * Null for the documents nothing routine is known about: the CAPA findings, the complaint papers,
 * the agreements.
 */
export function prepareKnownParts(doc: DocumentDefinition, dueDate: string, master: MasterData, previous: RecordInstance | undefined): KnownPartsResult | null {
  const prior =
    previous && !previous.isDemo && previous.documentId === doc.id && CONFIRMED.has(previous.status) && compareISO(previous.dueDate, dueDate) < 0 && !supersededRevisionOf(previous)
      ? previous
      : undefined;
  let made: Omit<KnownPartsResult, "waiting"> | null;
  switch (doc.kind) {
    case "daily-pest-monitoring":
      made = dailyMonitoring(doc, dueDate, master);
      break;
    case "fly-catcher":
      made = flyCatcher(doc, dueDate, master, prior as RecordInstance<FlyCatcherData> | undefined);
      break;
    case "service-report":
      made = serviceReport(doc, dueDate, master);
      break;
    case "training-record":
      made = training(doc, dueDate, prior as RecordInstance<TrainingRecordData> | undefined);
      break;
    case "log-sheet":
      made = logSheet(doc, dueDate, master, prior as RecordInstance<LogSheetData> | undefined);
      break;
    default:
      made = null;
  }
  if (!made) return null;
  const waiting = validateForSubmit(doc, {
    id: "known-parts",
    documentId: doc.id,
    periodKey: dueDate,
    dueDate,
    status: "In Progress",
    isDemo: false,
    data: made.data,
    createdAt: "",
    updatedAt: "",
  }).errors.length;
  const left =
    waiting === 0
      ? "Nothing is left to enter. Check it, then submit it."
      : `Left for you: ${waiting} ${waiting === 1 ? "reading" : "readings"} to enter before it can be submitted. Nothing you observe was filled in for you.`;
  return { ...made, notes: [...made.notes, left], waiting };
}

// ---------------------------------------------------------------------------
// the four registers with a form of their own

function dailyMonitoring(doc: DocumentDefinition, dueDate: string, master: MasterData): Omit<KnownPartsResult, "waiting"> {
  // Only the calendar's own fact is written: a closed day arrives marked as a holiday.
  const data = createDefaultData(doc, dueDate, master) as DailyPestMonitoringData;
  if (data.isHoliday) {
    const day = dayInfo(dueDate, master);
    return {
      data,
      notes: [day.kind === "weekly-off" ? `Marked as a holiday: ${day.weekday} is the weekly off, so no check point is answered today.` : `Marked as a holiday (${day.name ?? "a holiday"}): no check point is answered today.`],
      basedOn: "the plant's calendar (Master Data, Holidays)",
    };
  }
  return {
    data,
    notes: [`The ${master.checkpoints.length} check points are listed for ${formatDisplayDate(dueDate)}. Every answer, the time of the round and the checker's name are written by whoever walks the round.`],
    basedOn: "the register's printed check points (Master Data)",
  };
}

function flyCatcher(doc: DocumentDefinition, dueDate: string, master: MasterData, prior: RecordInstance<FlyCatcherData> | undefined): Omit<KnownPartsResult, "waiting"> {
  const base = createDefaultData(doc, dueDate, master) as FlyCatcherData;
  const expiring: string[] = [];
  // The tube light dates are facts about each unit: carried from the last visit a person confirmed,
  // or the register's own two dates. The catch counts and who cleaned and verified are the visit's.
  const entries = base.entries.map((e) => {
    const p = prior?.data.entries.find((x) => x.pcId === e.pcId);
    const install = p?.tubeLightInstallDate || e.tubeLightInstallDate;
    const due = p?.tubeLightDueDate || e.tubeLightDueDate;
    if (due && compareISO(due, dueDate) <= 0) expiring.push(e.pcId);
    return { ...e, tubeLightInstallDate: install, tubeLightDueDate: due };
  });
  const notes = [
    `The ${entries.length} fly catcher units are listed, each with its tube light dates ${prior ? `from the visit of ${formatDisplayDate(prior.dueDate)}` : "from the register"}. The catch counts and who cleaned and verified each unit are written at the visit.`,
  ];
  if (expiring.length > 0) {
    notes.unshift(`Check this first: the tube light validity of ${expiring.join(", ")} has run out. Replace the tube, write the new install date here, and answer check point 10 on the day's F/HR/17.`);
  }
  return { data: { ...base, entries }, notes, basedOn: prior ? `the tube light dates of ${formatDisplayDate(prior.dueDate)}` : "the register's fly catcher units and tube light dates" };
}

function serviceReport(doc: DocumentDefinition, dueDate: string, master: MasterData): Omit<KnownPartsResult, "waiting"> {
  // The areas, and the material and method fixed for each (engine/serviceMaterials.ts), are the
  // service's standing values. The quantity used, the technician's remarks and both signatures are the visit's.
  const data = createDefaultData(doc, dueDate, master) as ServiceReportData;
  return {
    data,
    notes: [
      data.lines.length
        ? `The ${data.lines.length} areas are listed with the material and method fixed for each. The quantity used, the technician's remarks and both signatures are written at the visit.`
        : "No fixed area list exists for this service yet: add the areas treated at the visit.",
    ],
    basedOn: "the service's fixed areas and materials (Master Data)",
  };
}

function training(doc: DocumentDefinition, dueDate: string, prior: RecordInstance<TrainingRecordData> | undefined): Omit<KnownPartsResult, "waiting"> {
  // The programme (its type, the contractor who runs it, its topics) is the standing part. Who came is
  // not known until the day: last year's names are never copied onto this year's attendance sheet.
  const source = prior?.data ?? SEED_AWARENESS_TRAINING_RECORD.data;
  const data: TrainingRecordData = {
    trainingDate: dueDate,
    trainingType: source.trainingType || "Pest Control Awareness Training Program (annual)",
    trainerProvider: source.trainerProvider || "Gurudev Pest Control",
    topics: [...source.topics],
    attendees: [],
    certificateRef: "",
    remarks: "",
  };
  return {
    data,
    notes: [`The programme and its ${data.topics.length} topics are those of ${formatDisplayDate(source.trainingDate)}. The attendance sheet is empty: write in who came, and the certificate or attendance sheet reference.`],
    basedOn: prior ? `the training of ${formatDisplayDate(prior.dueDate)}` : `the ${formatDisplayDate(source.trainingDate)} awareness training`,
  };
}

// ---------------------------------------------------------------------------
// the log sheets (114 layouts)

function logSheet(doc: DocumentDefinition, dueDate: string, master: MasterData, prior: RecordInstance<LogSheetData> | undefined): Omit<KnownPartsResult, "waiting"> | null {
  const layout = getLogSheetLayout(doc.id);
  if (!layout) return null;
  const shell = createDefaultData(doc, dueDate, master) as LogSheetData;
  // An As Required document is started for one occasion: the last one was another occasion (another
  // lot, another visitor, another position), so nothing of it is carried, not even a "standing" box.
  const scheduled = doc.schedule.type !== "as-required";

  const header: Record<string, string> = {};
  const carried: string[] = [];
  for (const f of [...layout.headerFields, ...(layout.footerFields ?? [])]) {
    const kind = boxKind(f, layout);
    if (kind === "date") {
      header[f.key] = dueDate;
    } else if (kind === "standing") {
      const fromPrior = scheduled ? String(prior?.data.header?.[f.key] ?? "").trim() : "";
      const fromFormat = f.autoFill?.default !== undefined ? String(f.autoFill.default) : "";
      const fromSpecimen = scheduled ? String(layout.specimenHeader?.[f.key] ?? "").trim() : "";
      header[f.key] = fromPrior || fromFormat || fromSpecimen;
      if (header[f.key]) carried.push(shortLabel(f.label));
    } else {
      // An observation, or a box worked out from the sheet (written by the computed-cells pass below).
      header[f.key] = "";
    }
  }

  const blankRow = (): LogSheetRow => {
    const row: LogSheetRow = { id: generateId("row") };
    for (const c of layout.columns) row[c.key] = c.type === "number" ? null : "";
    return row;
  };

  // THE LINES. Printed lines (time slots, a single line, fixed rows) come from the blank form with their
  // printed words; a yearly list's lines from the last list a person confirmed, with who or what each
  // is about; any other register's lines are the day's events, so it gets the blank lines the form asks
  // for at least, and the person writes the events.
  const list = LIST_COLUMNS[doc.id];
  const listed = layout.rowMode.kind === "free" && scheduled && list && prior?.data.rows?.length ? prior.data.rows : null;
  let rows: LogSheetRow[];
  if (listed) {
    rows = listed.map((p) => {
      const row = blankRow();
      for (const key of list!) {
        const value = p[key];
        if (value !== undefined && value !== null && String(value).trim() !== "") row[key] = value;
      }
      return row;
    });
  } else {
    rows = shell.rows.map((r) => {
      const row = blankRow();
      for (const c of layout.columns) if (columnKind(c) === "fixed" && r[c.key] !== undefined) row[c.key] = r[c.key];
      if (layout.rowMode.kind === "timeSlots") row[layout.rowMode.slotKey] = r[layout.rowMode.slotKey] ?? "";
      return row;
    });
  }
  const dateColumns = layout.columns.filter((c) => columnKind(c) === "date");
  for (const row of rows) for (const c of dateColumns) row[c.key] = dueDate;

  // A figure another real record gives: the opening stock is the last sheet's closing stock.
  const figures: string[] = [];
  const priorRows = scheduled ? (prior?.data.rows ?? []) : [];
  for (const { to, from } of CARRIED_FIGURES[doc.id] ?? []) {
    const last = [...priorRows].reverse().find((r) => typeof r[from] === "number");
    if (!last || !rows[0]) continue;
    rows[0][to] = last[from] as number;
    const toCol = layout.columns.find((c) => c.key === to);
    const fromCol = layout.columns.find((c) => c.key === from);
    figures.push(`${toCol?.label ?? to} ${last[from]}: the ${fromCol?.label.toLowerCase() ?? from} of ${formatDisplayDate(prior!.dueDate)}.`);
  }

  const data: LogSheetData = withComputedCells(doc.id, { header, rows });

  const notes: string[] = [];
  const mode = layout.rowMode;
  if (listed) {
    notes.push(`The ${rows.length} lines of the list confirmed on ${formatDisplayDate(prior!.dueDate)} are carried forward with who or what each line is about. Every assessment on them is made afresh.`);
  } else if (mode.kind === "timeSlots") {
    notes.push(`The ${mode.slots.length} time slots are on the sheet; each reading and its signature are written when it is taken.`);
  } else if (mode.kind === "fixedRows") {
    notes.push(`The ${mode.rows.length} printed lines are on the sheet; every answer on them is the person's.`);
  } else if (mode.kind === "single") {
    notes.push("The day's line is on the sheet; every reading on it is the person's.");
  } else {
    notes.push(`${rows.length === 1 ? "One blank line is" : `${rows.length} blank lines are`} on the sheet for the day's entries; add a line for each one.`);
  }
  if (dateColumns.length > 0 || [...layout.headerFields, ...(layout.footerFields ?? [])].some((f) => boxKind(f, layout) === "date")) {
    notes.push(`The record's date, ${formatDisplayDate(dueDate)}, is written in.`);
  }
  if (carried.length > 0) {
    const shown = carried.slice(0, 4).join(", ") + (carried.length > 4 ? ` and ${carried.length - 4} more` : "");
    notes.push(`Standing values ${prior && scheduled ? `as on ${formatDisplayDate(prior.dueDate)}` : "as the plant's own form gives them"}: ${shown}. Change any that has changed.`);
  }
  notes.push(...figures);
  // A Calibration Expiry is a fact about the instrument: carried as it was written, never moved on.
  // When it has already run out by this sheet's day, that is said first (REQUIREMENTS §75).
  const expiry = header.calibrationExpiry;
  if (typeof expiry === "string" && /^\d{4}-\d{2}-\d{2}$/.test(expiry) && compareISO(expiry, dueDate) < 0) {
    notes.unshift(`Check this first: the Calibration Expiry, ${formatDisplayDate(expiry)}, is before this sheet's date, so the instrument is out of calibration. Write the new expiry if it has been calibrated since; if not, report it to the QA manager.`);
  }
  return {
    data,
    notes,
    basedOn: prior && scheduled ? `the standing values of the ${doc.name} of ${formatDisplayDate(prior.dueDate)}` : "the format's printed lines and the plant's standing values",
  };
}

/** "MACHINE NAME :" → "Machine name"; a long printed label cut at its first dash. */
function shortLabel(label: string): string {
  const cut = label.split(/\s[—–-]\s|\(/)[0].replace(/[:\s]+$/, "").trim();
  const words = cut.length > 40 ? cut.slice(0, 40).trim() + "…" : cut;
  return words === words.toUpperCase() ? words.charAt(0) + words.slice(1).toLowerCase() : words;
}
