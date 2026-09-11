import type { FlyCatcherData, RecordInstance } from "../types";
import { documentRepository } from "../data/repositories/documentRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { effectiveDueDatesInMonth } from "./holidays";
import { createDefaultData } from "./recordDefaults";
import { periodKeyFor } from "./recordGenerator";
import { appendHistory, makeEntry, withEditHistory } from "./recordHistory";
import { MONTH_NAMES, compareISO, daysInMonth, formatDisplayDate, pad2 } from "../utils/date";
import { generateId } from "../utils/id";

// THE F/HR/18 REGISTER, MONTH BY MONTH. The register for a Month & Year is the
// fly catcher visits dated in it (components/records/FlyCatcherRegisterSheet
// .tsx). The frequency engine creates the scheduled visits (the 3rd and the
// 17th) from the day the system went live; a visit it didn't create — one from
// before go-live copied in from the paper register, or an extra inspection —
// is added here, for the date it was carried out, and then filled in on the
// register itself.

export const FLY_DOC_ID = "fly-catcher";

const monthPrefix = (year: number, month: number) => `${year}-${pad2(month + 1)}-`;

/** The month's visits (Live or Demo), in date order. */
export function visitsInMonth(year: number, month: number, isDemo: boolean): RecordInstance<FlyCatcherData>[] {
  const prefix = monthPrefix(year, month);
  return (recordRepository.query({ documentId: FLY_DOC_ID, isDemo, fromDate: `${prefix}01`, toDate: `${prefix}${pad2(daysInMonth(year, month))}` }) as RecordInstance<FlyCatcherData>[])
    .slice()
    .sort((a, b) => compareISO(a.dueDate, b.dueDate));
}

/**
 * The date "Add visit" offers first: the month's earliest scheduled visit that
 * isn't in the register yet (never a day still to come); otherwise today, when
 * today is in this month and has no visit; otherwise nothing — the person picks.
 */
export function suggestedVisitDate(year: number, month: number, isDemo: boolean, today: string): string {
  const doc = documentRepository.getById(FLY_DOC_ID);
  if (!doc) return "";
  const prefix = monthPrefix(year, month);
  const taken = new Set(visitsInMonth(year, month, isDemo).map((r) => r.dueDate));
  const scheduled = effectiveDueDatesInMonth(doc, year, month, masterRepository.get())
    .map((s) => s.due)
    .find((d) => d.startsWith(prefix) && !taken.has(d) && compareISO(d, today) <= 0);
  if (scheduled) return scheduled;
  return today.startsWith(prefix) && !taken.has(today) ? today : "";
}

/** Why a visit can't be added to this Month & Year's register on `dateISO`, or null when it can. */
export function newVisitProblem(dateISO: string, year: number, month: number, isDemo: boolean, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return "Choose the date of service.";
  if (!dateISO.startsWith(monthPrefix(year, month))) return `The date has to be in ${MONTH_NAMES[month]} ${year} — the month of the register being filled in.`;
  if (compareISO(dateISO, today) > 0) return "A visit can't be recorded for a date that hasn't come yet.";
  if (visitsInMonth(year, month, isDemo).some((r) => r.dueDate === dateISO)) {
    return `There's already a visit on ${formatDisplayDate(dateISO)} in this register — change it with Edit register.`;
  }
  return null;
}

/**
 * Adds the visit of `dateISO` to its month's register as a draft ("In
 * Progress") for a person to fill in. It is never prepared by the assistant,
 * which only fills the scheduled shells (engine/assistantPrepare.ts), and a
 * person's draft is left where it is by the calendar and pre-launch clean-ups.
 * The tube-light dates and the two names are carried forward from the visit
 * before it, as the paper register dittoes them; the counts are left for the
 * person with the paper in front of them. Recorded in the visit's history.
 */
export function addFlyCatcherVisit(dateISO: string, isDemo: boolean, by: string): RecordInstance<FlyCatcherData> {
  const doc = documentRepository.getById(FLY_DOC_ID);
  if (!doc) throw new Error("The fly catcher document (F/HR/18) is missing.");
  const master = masterRepository.get();
  const year = Number(dateISO.slice(0, 4));
  const month = Number(dateISO.slice(5, 7)) - 1;
  // A visit added on the day a scheduled one is due IS that visit: it carries
  // the schedule's key, so the generator never makes a second one for it.
  const slot = effectiveDueDatesInMonth(doc, year, month, master).find((s) => s.due === dateISO);
  const blank = createDefaultData(doc, dateISO, master) as FlyCatcherData;
  const previous = (recordRepository.query({ documentId: FLY_DOC_ID, isDemo }) as RecordInstance<FlyCatcherData>[])
    .filter((r) => compareISO(r.dueDate, dateISO) < 0)
    .sort((a, b) => compareISO(b.dueDate, a.dueDate))[0];
  const filled: FlyCatcherData = {
    ...blank,
    entries: blank.entries.map((e) => {
      const p = previous?.data.entries.find((x) => x.pcId === e.pcId);
      if (!p) return e;
      return { ...e, tubeLightInstallDate: p.tubeLightInstallDate, tubeLightDueDate: p.tubeLightDueDate, cleaningDoneBy: p.cleaningDoneBy ?? "", verifiedBy: p.verifiedBy ?? "" };
    }),
  };
  const now = new Date().toISOString();
  const shell: RecordInstance<FlyCatcherData> = {
    id: generateId("rec"),
    documentId: FLY_DOC_ID,
    periodKey: periodKeyFor(doc, slot?.scheduled ?? dateISO),
    dueDate: dateISO,
    status: "In Progress",
    isDemo,
    data: blank,
    createdAt: now,
    updatedAt: now,
  };
  const register = `${MONTH_NAMES[month]} ${year}`;
  const note = previous
    ? `Visit added to the ${register} F/HR/18 register. Tube-light dates and names carried forward from the ${formatDisplayDate(previous.dueDate)} visit; the counts are to be entered.`
    : `Visit added to the ${register} F/HR/18 register; every column is to be entered.`;
  let record = withEditHistory(shell, filled, by, { note });
  if (!record.history?.length) record = appendHistory(record, makeEntry("edited", by, { note }));
  return recordRepository.upsert(record as RecordInstance) as RecordInstance<FlyCatcherData>;
}
