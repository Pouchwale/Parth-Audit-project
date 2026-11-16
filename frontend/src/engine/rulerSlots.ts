import type { DocumentDefinition, LogSheetData, RecordInstance } from "../types";
import { documentRepository } from "../data/repositories/documentRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { RULER_VERIFICATION_IDS, isRulerVerification } from "../data/seed/qcRulerVerificationLayouts";
import { createDefaultData } from "./recordDefaults";
import { carriedFrom, previousWrittenRecord } from "./carryForward";
import { withComputedCells } from "./computedCells";
import { getLogSheetLayout } from "../data/seed/logSheetLayouts";
import { schedulePeriodOf, type SchedulePeriod } from "./frequencyEngine";
import { workingDueDate } from "./holidays";
import { mayDo, mayWriteRecordsOf } from "./departmentScope";
import { appendHistory, makeEntry } from "./recordHistory";
import { generateId } from "../utils/id";
import { compareISO, todayISO } from "../utils/date";

// F/QC/17: TWENTY RULERS A YEAR, EACH ITS OWN RECORD (REQUIREMENTS §220; the owner, 15-Nov-2026: "every year it the
// system should automatically generate atleast 20 for each both 300 mm and 600 mm ... 20 for 300mm and 20 for 600 mm
// and next year also same"; asked: Serial number prefilled 01 to 20; New adds a 21st once all are filled; the rulers
// filed under later years moved into 2026 and the empty 2029 record deleted).
//
// Each scale's year (24 September to 23 September) holds twenty records, 01 to 20, keyed "<doc>:<the year's date>#NN",
// each with its Serial number written as NN (the person's to change), all dated by the frequency. They are made for the
// year today falls in at every start (whoever may fill F/QC/17), and the generator makes each year's as its September
// comes (engine/recordGenerator.ts). New record opens the first of the year's not yet filled, and once all are filled
// adds the next number, 21, 22 ... A record of the time before - one sheet a year, keyed without a number - is filed as
// the number its Serial number says, else the first free one; one made ahead under a later year by New and dated back
// into this one is filed in this one; one made ahead, still for a later year and with nothing written, is deleted.

export const RULER_SLOTS = 20;

const FILLED = new Set(["Submitted", "Pending Verification", "Verified"]);
const isFilled = (r: RecordInstance): boolean => FILLED.has(r.status) && !r.correction;

/** "qc-ruler-verification:2026-09-24#07" for the year's date and the number. */
export const slotKey = (documentId: string, scheduled: string, n: number): string => `${documentId}:${scheduled}#${String(n).padStart(2, "0")}`;

/** The number of a record's place in its year, or null for a record keyed without one. */
export function slotOf(r: Pick<RecordInstance, "periodKey">): number | null {
  const m = /#(\d+)$/.exec(r.periodKey ?? "");
  return m ? Number(m[1]) : null;
}

const yearDateOf = (r: Pick<RecordInstance, "periodKey">): string | null => /^[^:]*:(\d{4}-\d{2}-\d{2})(?:#\d+)?$/.exec(r.periodKey ?? "")?.[1] ?? null;

/** The year's records of a scale, by number. */
function yearRecords(doc: DocumentDefinition, period: SchedulePeriod, isDemo: boolean): RecordInstance[] {
  return recordRepository
    .queryUnscoped({ documentId: doc.id, isDemo })
    .filter((r) => slotOf(r) !== null && yearDateOf(r) === period.scheduled)
    .sort((a, b) => (slotOf(a) ?? 0) - (slotOf(b) ?? 0));
}

/** A record for place `n` of the year: the blank sheet, its Serial number NN, dated by the frequency. */
function slotRecord(doc: DocumentDefinition, period: SchedulePeriod, n: number, isDemo: boolean, status: RecordInstance["status"]): RecordInstance {
  const master = masterRepository.get();
  const due = workingDueDate(period.scheduled, master);
  // Written as the last written sheet was, as every new F/QC/17 is (engine/recordCrud.ts startingData, §117): the master's
  // boxes and the lines carried, the ruler's own boxes (Make, Serial number) the person's - here its number.
  const blank = createDefaultData(doc, due, master) as LogSheetData;
  const layout = getLogSheetLayout(doc.id);
  const previous = layout?.carryForwardAll ? previousWrittenRecord(doc.id, due, isDemo, layout, blank) : undefined;
  const data = (previous ? withComputedCells(doc.id, carriedFrom(layout!, previous.data, blank, due)) : blank) as LogSheetData;
  const now = new Date().toISOString();
  return {
    id: generateId("rec"),
    documentId: doc.id,
    periodKey: slotKey(doc.id, period.scheduled, n),
    dueDate: due,
    status,
    isDemo,
    data: { ...data, header: { ...(data.header ?? {}), serialNo: String(n).padStart(2, "0") } },
    createdAt: now,
    updatedAt: now,
  };
}

/** The twenty records of the year a period names, those missing made (the generator's call, a September as it comes). */
export function rulerSlotsFor(doc: DocumentDefinition, period: SchedulePeriod, isDemo: boolean): RecordInstance[] {
  const taken = new Set(yearRecords(doc, period, isDemo).map((r) => slotOf(r)));
  const made: RecordInstance[] = [];
  for (let n = 1; n <= RULER_SLOTS; n++) if (!taken.has(n)) made.push(slotRecord(doc, period, n, isDemo, "Due"));
  return made;
}

/** Records of the time before (one a year, no number) put in their places; returns what was changed and what deleted. */
function refileOldRecords(doc: DocumentDefinition, today: string): { moved: RecordInstance[]; removed: RecordInstance[] } {
  const moved: RecordInstance[] = [];
  const removed: RecordInstance[] = [];
  const old = recordRepository.queryUnscoped({ documentId: doc.id, isDemo: false }).filter((r) => /^[^:]*:\d{4}-\d{2}-\d{2}$/.test(r.periodKey ?? ""));
  for (const r of old.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))) {
    const keyed = yearDateOf(r)!;
    const keyPeriod = schedulePeriodOf(doc, keyed);
    const duePeriod = schedulePeriodOf(doc, r.dueDate);
    const madePeriod = schedulePeriodOf(doc, String(r.createdAt).slice(0, 10));
    if (!keyPeriod) continue;
    const header = (r.data as LogSheetData | undefined)?.header ?? {};
    const written = String(header.serialNo ?? "").trim() !== "" || String(header.make ?? "").trim() !== "";
    // Made ahead by New for a year still to come, nothing written on it: deleted (the owner's word of 15-Nov-2026).
    if (compareISO(keyPeriod.from, today) > 0 && duePeriod?.scheduled === keyPeriod.scheduled && !written && !isFilled(r)) {
      if (mayDo(doc.id, "delete")) removed.push(r);
      continue;
    }
    // Made ahead under a later year and dated back into the year it was made in: that year's.
    const target = duePeriod && madePeriod && duePeriod.scheduled !== keyPeriod.scheduled && duePeriod.scheduled === madePeriod.scheduled ? duePeriod : keyPeriod;
    const taken = new Set([...yearRecords(doc, target, false), ...moved.filter((m) => yearDateOf(m) === target.scheduled)].map((x) => slotOf(x)));
    const serial = /^\d{1,3}$/.test(String(header.serialNo ?? "").trim()) ? Number(String(header.serialNo).trim()) : NaN;
    let n = Number.isInteger(serial) && serial >= 1 && !taken.has(serial) ? serial : 1;
    while (taken.has(n)) n++;
    const note =
      target.scheduled === keyPeriod.scheduled
        ? `Filed as record ${String(n).padStart(2, "0")} of its year (F/QC/17 holds twenty records a year, REQUIREMENTS §220).`
        : `Filed as record ${String(n).padStart(2, "0")} of the year of ${target.scheduled.slice(0, 4)}, the year it was checked in (it had been put under ${keyed.slice(0, 4)}; REQUIREMENTS §220).`;
    moved.push(appendHistory({ ...r, periodKey: slotKey(doc.id, target.scheduled, n) }, makeEntry("edited", "System", { note })));
  }
  return { moved, removed };
}

/**
 * At every start (data/bootstrap.ts, engine/reminders.ts ensureNearTermRecordsGenerated): the records of the time before
 * filed, and the twenty of the year today falls in made for each scale - for whoever may fill F/QC/17. Returns how many
 * records were made. `deleteOld` deletes, with its line in the deletion log, a record made ahead with nothing on it.
 */
export function ensureRulerSlots(today: string = todayISO(), deleteOld?: (r: RecordInstance) => void): number {
  let made = 0;
  for (const id of RULER_VERIFICATION_IDS) {
    const doc = documentRepository.getByIdUnscoped(id);
    if (!doc || doc.schedule.type === "as-required" || !mayWriteRecordsOf(id)) continue;
    const { moved, removed } = refileOldRecords(doc, today);
    for (const r of moved) recordRepository.upsert(r);
    for (const r of removed) (deleteOld ?? ((x: RecordInstance) => recordRepository.removeIds([x.id])))(r);
    const period = schedulePeriodOf(doc, today);
    if (!period) continue;
    const slots = rulerSlotsFor(doc, period, false);
    if (slots.length) recordRepository.upsertMany(slots);
    made += slots.length;
  }
  return made;
}

/** The record F/QC/17's New opens on `dateISO`: the first of its year not filled, else the next number, made now. */
export function nextRulerRecord(doc: DocumentDefinition, dateISO: string, isDemo: boolean): { record: RecordInstance; existed: boolean } | null {
  if (!isRulerVerification(doc.id) || doc.schedule.type === "as-required") return null;
  const period = schedulePeriodOf(doc, dateISO);
  if (!period) return null;
  const year = yearRecords(doc, period, isDemo);
  const open = year.find((r) => !isFilled(r));
  if (open) return { record: open, existed: true };
  const n = Math.max(0, ...year.map((r) => slotOf(r) ?? 0)) + 1;
  return { record: recordRepository.upsert(slotRecord(doc, period, n, isDemo, "In Progress")), existed: false };
}

/** The record of a scale's year shown first (read only): the first not filled, else the last. */
export function rulerRecordShown(doc: DocumentDefinition, dateISO: string, isDemo: boolean): RecordInstance | undefined {
  const period = schedulePeriodOf(doc, dateISO);
  if (!period) return undefined;
  const year = yearRecords(doc, period, isDemo);
  return year.find((r) => !isFilled(r)) ?? year[year.length - 1];
}
