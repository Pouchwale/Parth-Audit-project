import type { RecordInstance, ServiceAgreementData } from "../types";
import { recordRepository } from "../data/repositories/recordRepository";
import { settingsRepository } from "../data/repositories/settingsRepository";
import { SA_DOC_ID, SA_REMIND_BEFORE_DAYS, SA_TERM_YEARS, newServiceAgreementData } from "../data/seed/serviceAgreement";
import { addDays, compareISO, fromISODate, toISODate, todayISO } from "../utils/date";
import { generateId } from "../utils/id";

// THE TWO-YEARLY SERVICE PROVIDER AGREEMENT. The department asked for the
// system to ask for it: "in service provider there should be pop up for every
// two year for service provider agreement … keep upload option or the system
// will automatically generate the same format or user can upload it"
// (12-Sep-2026).
//
// The agreement's own term is what drives it — no separate schedule to keep in
// step. The Service Provider page asks sixty days before the term ends, and
// keeps asking once it has run out; "Remind me later" quietens it for a week,
// never for good. Nothing is ever generated behind the user's back: the pop-up
// offers to draft it on the provider's format or to take the signed copy they
// already have, and both are the user's choice.

export type AgreementState = "none" | "due" | "expired" | "current";

export interface AgreementStatus {
  state: AgreementState;
  record?: RecordInstance<ServiceAgreementData>;
  /** Days until the term ends — negative once it has run out. */
  daysLeft: number | null;
  effectiveTo: string | null;
  /** Whether the Service Provider page should put the reminder on screen. */
  remind: boolean;
}

/** The same day of the month, n years on ("2026-09-12" + 2 = "2028-09-12"). */
export function addYears(iso: string, n: number): string {
  const d = fromISODate(iso);
  d.setFullYear(d.getFullYear() + n);
  return toISODate(d);
}

/** The day before the next term would start — the last day this one covers. */
export function termEnd(fromISO: string, years = SA_TERM_YEARS): string {
  return addDays(addYears(fromISO, years), -1);
}

function daysBetweenISO(from: string, to: string): number {
  return Math.round((fromISODate(to).getTime() - fromISODate(from).getTime()) / 86400000);
}

export function agreementsOf(isDemo: boolean): RecordInstance<ServiceAgreementData>[] {
  return (recordRepository.query({ documentId: SA_DOC_ID, isDemo }) as RecordInstance<ServiceAgreementData>[])
    .slice()
    .sort((a, b) => compareISO(a.data.effectiveFrom || a.dueDate, b.data.effectiveFrom || b.dueDate));
}

/** The agreement in force (or the most recent one), and whether to ask about it. */
export function agreementStatus(isDemo: boolean, today = todayISO()): AgreementStatus {
  const all = agreementsOf(isDemo);
  const latest = all[all.length - 1];
  if (!latest) return { state: "none", daysLeft: null, effectiveTo: null, remind: !isDemo && !snoozed(today) };
  const effectiveTo = latest.data.effectiveTo || termEnd(latest.data.effectiveFrom || latest.dueDate);
  const daysLeft = daysBetweenISO(today, effectiveTo);
  const state: AgreementState = daysLeft < 0 ? "expired" : daysLeft <= SA_REMIND_BEFORE_DAYS ? "due" : "current";
  return { state, record: latest, daysLeft, effectiveTo, remind: state !== "current" && !isDemo && !snoozed(today) };
}

function snoozed(today: string): boolean {
  const until = settingsRepository.get().agreementReminderSnoozedUntil;
  return !!until && compareISO(today, until) < 0;
}

/** "Remind me later" — a week, never for good. */
export function snoozeAgreementReminder(days = 7, today = todayISO()): void {
  settingsRepository.update({ agreementReminderSnoozedUntil: addDays(today, days) });
}

/**
 * Starts the next agreement — drafted on the provider's format, or as the
 * shell that holds the signed copy about to be uploaded. It is a draft like
 * any other record: it is edited, submitted and verified by people, never by
 * the assistant.
 */
export function createAgreement(
  isDemo: boolean,
  opts: { from?: string; origin?: ServiceAgreementData["origin"] } = {}
): RecordInstance<ServiceAgreementData> {
  const today = todayISO();
  const previous = agreementsOf(isDemo).slice(-1)[0];
  // A renewal picks up the day after the last term ended, unless that is in
  // the past — then it starts today, which is what a late renewal really does.
  const suggested = previous?.data.effectiveTo ? addDays(previous.data.effectiveTo, 1) : today;
  const from = opts.from ?? (compareISO(suggested, today) > 0 ? suggested : today);
  const now = new Date().toISOString();
  const record: RecordInstance<ServiceAgreementData> = {
    id: generateId("agreement"),
    documentId: SA_DOC_ID,
    periodKey: from,
    dueDate: from,
    status: "In Progress",
    isDemo,
    data: newServiceAgreementData(from, termEnd(from), opts.origin ?? "generated"),
    createdAt: now,
    updatedAt: now,
  };
  return recordRepository.upsert(record as RecordInstance) as RecordInstance<ServiceAgreementData>;
}
