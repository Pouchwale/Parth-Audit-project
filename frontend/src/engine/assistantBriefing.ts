import type { DocumentDefinition, RecordInstance } from "../types";
import { documentRepository } from "../data/repositories/documentRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { settingsRepository } from "../data/repositories/settingsRepository";
import { complianceValidUntil } from "../data/seed/complianceStatements";
import { allComplianceStatements } from "../data/repositories/referenceRepository";
import { findPreLaunchNoise } from "./backlogCleanup";
import { isCompanyHoliday } from "./holidays";
import { computeReminders, routeForRecord } from "./reminders";
import { submitRecord } from "./recordLifecycle";
import { validateForSubmit } from "./validation";
import { addDays, compareISO, formatDisplayDate, todayISO } from "../utils/date";
import { t } from "../i18n";

// THE LOGIN BRIEFING. Everything the assistant tells the user when they
// arrive: what it prepared for them, what still needs a human, what's
// waiting for a verifier, and what's coming up — computed from the
// repositories, so it is always current.

export interface BriefingItem {
  recordId: string;
  documentId: string;
  documentName: string;
  formatNo: string;
  dueDate: string;
  route: string;
  notes: string[];
  basedOn?: string;
  errors: string[]; // validation errors blocking a one-click submit
}

export interface ComplianceRenewal {
  documentId: string;
  documentName: string;
  validUntil: string;
  daysLeft: number;
}

export interface Briefing {
  greeting: string;
  ready: BriefingItem[]; // prepared by the assistant and passes validation — one click to submit
  needsInput: BriefingItem[]; // prepared, but something only a person can add
  overdue: BriefingItem[]; // pending and past due that the assistant couldn't prepare (e.g. CAPA)
  awaitingVerification: BriefingItem[];
  upcoming: BriefingItem[];
  renewals: ComplianceRenewal[];
  // Generator leftovers from before this browser's launch date (see
  // engine/backlogCleanup.ts) — counted, never listed, offered for cleanup.
  noiseCount: number;
  liveStartDate: string | null;
}

function toItem(doc: DocumentDefinition, r: RecordInstance, errors: string[] = []): BriefingItem {
  return {
    recordId: r.id,
    documentId: doc.id,
    documentName: doc.name,
    formatNo: doc.formatNo,
    dueDate: r.dueDate,
    route: routeForRecord(doc, r.id),
    notes: r.prepared?.notes ?? [],
    basedOn: r.prepared?.basedOn,
    errors,
  };
}

export function greetingFor(name: string | undefined, now = new Date()): string {
  const h = now.getHours();
  const part = t(h < 12 ? "brief.morning" : h < 17 ? "brief.afternoon" : "brief.evening");
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}!` : `${part}!`;
}

export function computeBriefing(userName: string | undefined): Briefing {
  const today = todayISO();
  const docs = documentRepository.getRecordable();
  const master = masterRepository.get();
  const { liveStartDate } = settingsRepository.get();
  const ready: BriefingItem[] = [];
  const needsInput: BriefingItem[] = [];
  const overdue: BriefingItem[] = [];
  const awaitingVerification: BriefingItem[] = [];

  for (const doc of docs) {
    const records = recordRepository.query({ documentId: doc.id, isDemo: false });
    for (const r of records) {
      if (compareISO(r.dueDate, today) > 0) continue;
      // Pre-launch generator noise is not "work" — it's reported once, as a
      // count with a cleanup button, instead of thousands of rows.
      if (liveStartDate && compareISO(r.dueDate, liveStartDate) < 0 && !["Submitted", "Pending Verification", "Verified"].includes(r.status)) continue;
      if (r.status === "Pending Verification" || r.status === "Submitted") {
        awaitingVerification.push(toItem(doc, r));
        continue;
      }
      if (r.status === "In Progress" && r.prepared) {
        const v = validateForSubmit(doc, r);
        (v.valid ? ready : needsInput).push(toItem(doc, r, v.errors));
        continue;
      }
      // A closed day (weekly off / festival holiday) is never "overdue work".
      if (["Scheduled", "Due", "In Progress", "Rejected"].includes(r.status) && !isCompanyHoliday(r.dueDate, master)) {
        overdue.push(toItem(doc, r, r.status === "Rejected" && r.rejectionReason ? [`Rejected: ${r.rejectionReason}`] : []));
      }
    }
  }

  const byDate = (a: BriefingItem, b: BriefingItem) => compareISO(a.dueDate, b.dueDate) || a.documentName.localeCompare(b.documentName);
  ready.sort(byDate);
  needsInput.sort(byDate);
  overdue.sort(byDate);
  awaitingVerification.sort(byDate);

  const upcoming = computeReminders(false)
    .filter((rem) => rem.urgency === "upcoming")
    .map((rem) => {
      const doc = documentRepository.getById(rem.documentId)!;
      return toItem(doc, recordRepository.getById(rem.recordId)!);
    })
    .sort(byDate);

  const renewals: ComplianceRenewal[] = allComplianceStatements()
    .map((s) => {
      const doc = documentRepository.getById(s.documentId);
      const validUntil = complianceValidUntil(s);
      const daysLeft = Math.round((Date.parse(validUntil) - Date.parse(today)) / 86400000);
      return { documentId: s.documentId, documentName: doc?.name ?? s.headerTitle, validUntil, daysLeft };
    })
    .filter((r) => r.daysLeft <= 90)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  return {
    greeting: greetingFor(userName),
    ready,
    needsInput,
    overdue,
    awaitingVerification,
    upcoming,
    renewals,
    noiseCount: findPreLaunchNoise().length,
    liveStartDate,
  };
}

// Anything a person still has to act on today — what the end-of-day
// briefing checks before deciding whether it's worth interrupting.
export function pendingCount(b: Briefing): number {
  return b.ready.length + b.needsInput.length + b.overdue.length;
}

// One-click "Submit everything you prepared". Each record is re-validated
// right before submission; anything that fails stays a draft and is
// reported back so nothing slips through half-filled.
export function submitPreparedRecords(items: BriefingItem[], actorName: string): { submitted: number; failed: { item: BriefingItem; errors: string[] }[] } {
  let submitted = 0;
  const failed: { item: BriefingItem; errors: string[] }[] = [];
  for (const item of items) {
    const record = recordRepository.getById(item.recordId);
    const doc = documentRepository.getById(item.documentId);
    if (!record || !doc || !["Scheduled", "Due", "In Progress", "Rejected"].includes(record.status)) continue;
    const { result } = submitRecord(doc, record, actorName);
    if (result.valid) submitted += 1;
    else failed.push({ item, errors: result.errors });
  }
  return { submitted, failed };
}

// Short, human sentence summarising the briefing — reused by the popup, the
// dashboard card and the assistant widget so they never disagree.
export function briefingHeadline(b: Briefing): string {
  const parts: string[] = [];
  if (b.ready.length) parts.push(t("brief.ready", { n: b.ready.length }));
  if (b.needsInput.length) parts.push(t("brief.needsInput", { n: b.needsInput.length }));
  if (b.overdue.length) parts.push(t("brief.overdue", { n: b.overdue.length }));
  if (b.awaitingVerification.length) parts.push(t("brief.awaiting", { n: b.awaitingVerification.length }));
  if (parts.length === 0) return t("brief.allClear");
  return parts.join(", ") + ".";
}

export function upcomingLabel(item: BriefingItem): string {
  const today = todayISO();
  if (item.dueDate === addDays(today, 1)) return "tomorrow";
  return formatDisplayDate(item.dueDate);
}
