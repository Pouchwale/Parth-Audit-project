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
import { readJSON } from "../data/storageAdapter";
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
//
// AS MANY AS THE PERSON WANTS, ANY OF THEM DELETED (REQUIREMENTS §245; the owner, 17-Nov-2026: "in qc-17 user can create or
// delete any records in same and there is no limit of creating record for both 300mm and 600mm user can able to create
// 50, 100 or whatever records he wants in same year"). New record makes the year's next number every time it is
// pressed - 21, 22 … 50, 100 - whatever of the twenty are still to fill; any record is deleted as any record is (Edit
// access, a reason in the deletion log), and a numbered place deleted is never made again: the twenty are made once a
// year, never put back.

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

/** A record for place `n` of the year: the blank sheet, its Serial number NN, dated by the frequency - or `on`, the day
 * New made it (§248). */
function slotRecord(doc: DocumentDefinition, period: SchedulePeriod, n: number, isDemo: boolean, status: RecordInstance["status"], on?: string): RecordInstance {
  const master = masterRepository.get();
  const due = on ?? workingDueDate(period.scheduled, master);
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

/** The numbered places of a year somebody deleted (the deletion log, engine/recordCrud.ts): never made again (§245). */
function deletedSlots(doc: DocumentDefinition, period: SchedulePeriod, isDemo: boolean): Set<number> {
  const log = readJSON<{ documentId?: string; periodKey?: string; isDemo?: boolean }[]>("deletions", []);
  const out = new Set<number>();
  for (const d of log) {
    if (d.documentId !== doc.id || !!d.isDemo !== isDemo || !d.periodKey || yearDateOf({ periodKey: d.periodKey }) !== period.scheduled) continue;
    const n = slotOf({ periodKey: d.periodKey });
    if (n !== null) out.add(n);
  }
  return out;
}

/** The twenty records of the year a period names, those missing made (the generator's call, a September as it comes) - but
 * never one somebody deleted (§245). */
export function rulerSlotsFor(doc: DocumentDefinition, period: SchedulePeriod, isDemo: boolean): RecordInstance[] {
  const taken = new Set(yearRecords(doc, period, isDemo).map((r) => slotOf(r)));
  const deleted = deletedSlots(doc, period, isDemo);
  const made: RecordInstance[] = [];
  for (let n = 1; n <= RULER_SLOTS; n++) if (!taken.has(n) && !deleted.has(n)) made.push(slotRecord(doc, period, n, isDemo, "Due"));
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
    // A record New added before §248, dated as the twenty are with nothing written on it: dated the day it was made.
    for (const r of yearRecords(doc, period, false)) {
      const n = slotOf(r) ?? 0;
      const made = String(r.createdAt).slice(0, 10);
      if (n <= RULER_SLOTS || r.dueDate !== workingDueDate(period.scheduled, masterRepository.get()) || made === r.dueDate) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(made) || compareISO(made, period.from) < 0 || compareISO(made, period.to) > 0) continue;
      recordRepository.upsert(appendHistory({ ...r, dueDate: made }, makeEntry("edited", "System", { note: `Dated ${made.split("-").reverse().join("-")}, the day it was added (REQUIREMENTS §248).` })));
    }
    const slots = rulerSlotsFor(doc, period, false);
    if (slots.length) recordRepository.upsertMany(slots);
    made += slots.length;
  }
  return made;
}

/** The record F/QC/17's New makes on `dateISO`: the year's next number, every time it is pressed - no limit (§245). */
export function nextRulerRecord(doc: DocumentDefinition, dateISO: string, isDemo: boolean): { record: RecordInstance; existed: boolean } | null {
  if (!isRulerVerification(doc.id) || doc.schedule.type === "as-required") return null;
  const period = schedulePeriodOf(doc, dateISO);
  if (!period) return null;
  const year = yearRecords(doc, period, isDemo);
  // (after the year's last number, and after any deleted one: a number is never given twice)
  const n = Math.max(0, ...year.map((r) => slotOf(r) ?? 0), ...deletedSlots(doc, period, isDemo)) + 1;
  // DATED THE DAY NEW MADE IT (REQUIREMENTS §248; the owner, 17-Nov-2026: "qc-17 is also not generating"): a record added
  // on 17-11-2026 was dated as the year's twenty are, 24-09-2026, and November's list did not show it. Dated `dateISO`,
  // the day it is made, it is in the month it was made in; its number is still its year's.
  return { record: recordRepository.upsert(slotRecord(doc, period, n, isDemo, "In Progress", dateISO)), existed: false };
}

/** The record of a scale's year shown first (read only): the first not filled, else the last. */
export function rulerRecordShown(doc: DocumentDefinition, dateISO: string, isDemo: boolean): RecordInstance | undefined {
  const period = schedulePeriodOf(doc, dateISO);
  if (!period) return undefined;
  const year = yearRecords(doc, period, isDemo);
  return year.find((r) => !isFilled(r)) ?? year[year.length - 1];
}
