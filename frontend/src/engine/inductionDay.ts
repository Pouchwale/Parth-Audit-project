import type { HrMasterPerson, LogSheetData, RecordInstance } from "../types";
import { hrMasterRepository } from "../data/repositories/hrMasterRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { nextWorkingDay } from "./holidays";
import { isIsoDate, namesakesOf, namesPerson, taggedFor, taggedForAnother } from "./hrMaster";

// THE DAY OF A PERSON'S INDUCTION (REQUIREMENTS §303; the owner, 23-Nov-2026: "planned date is 1st day of joining and make
// sure it should not be any kind of holiday. and in hr-06 planned date of hr-05 should come according to name and role").
// The first working day on or after the Date of Joining, unless their own F/HR/05 plans another day: F/HR/06 shows that one.

export const INDUCTION_STAFF_ID = "hr-induction-staff";

/** The first day on or after this one that the plant is open (weekly off, festival holidays and adjustment days counted). */
export const firstWorkingDay = (iso: string): string => (isIsoDate(iso) ? nextWorkingDay(iso, masterRepository.get()) : "");

/** The earliest Planned Date on a form: the day its induction starts. */
function plannedOnForm(form: RecordInstance<LogSheetData>): string {
  const days = (form.data?.rows ?? []).map((row) => String(row.plannedDate ?? "").trim()).filter(isIsoDate);
  return days.length > 0 ? days.reduce((a, b) => (b < a ? b : a)) : "";
}

/** This person's own F/HR/05: by the sheet's mark on it, or by name when nobody else on the sheet has that name. */
export function inductionFormOf(person: HrMasterPerson): RecordInstance<LogSheetData> | undefined {
  const forms = recordRepository.queryUnscoped({ documentId: INDUCTION_STAFF_ID, isDemo: false }) as RecordInstance<LogSheetData>[];
  const marked = forms.find((r) => taggedFor(r.data?.header ?? {}, person));
  if (marked) return marked;
  const named = forms.filter((r) => !taggedForAnother(r.data?.header ?? {}, person) && namesPerson(r.data?.header?.name, person));
  return named.length > 0 && namesakesOf(person, hrMasterRepository.all()).length === 0 ? named[0] : undefined;
}

/** The date F/HR/06 writes for this person: their F/HR/05 Planned Date, else the first working day of their joining. */
export function inductionDayOf(person: HrMasterPerson): string {
  const form = inductionFormOf(person);
  return (form && plannedOnForm(form)) || firstWorkingDay(person.joiningDate);
}
