import type { RecordInstance } from "../types";
import { documentRepository } from "../data/repositories/documentRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { settingsRepository } from "../data/repositories/settingsRepository";
import { autoFillRecord } from "./autoFill";
import { ensureNearTermRecordsGenerated } from "./reminders";
import { supersededRevisionOf } from "./validation";
import { compareISO, todayISO } from "../utils/date";

// Statuses in which a record is still an untouched shell the assistant may
// fill. "In Progress" is deliberately excluded: that means a person has
// started editing, and their partial work must never be overwritten.
const BLANK_STATUSES = ["Scheduled", "Due"] as const;
const CONFIRMED_STATUSES = ["Submitted", "Pending Verification", "Verified"] as const;

// The most recent record a real person confirmed for this document before
// the given date — the carry-forward source for the assistant. A record filled
// on a revision the format has since replaced (F/MNT/11's 2024 page, on Rev 00)
// is passed over: its boxes and columns are not this revision's, so there is
// nothing in it to carry into a sheet of the current one (REQUIREMENTS §74).
export function latestConfirmedRecord(documentId: string, beforeISO: string, isDemo: boolean): RecordInstance | undefined {
  return recordRepository
    // Unscoped: what to carry forward is a property of the register, not of
    // who is looking at it (engine/departmentScope.ts).
    .queryUnscoped({ documentId, isDemo })
    .filter(
      (r) =>
        CONFIRMED_STATUSES.includes(r.status as (typeof CONFIRMED_STATUSES)[number]) &&
        compareISO(r.dueDate, beforeISO) < 0 &&
        !supersededRevisionOf(r)
    )
    .sort((a, b) => compareISO(b.dueDate, a.dueDate))[0];
}

// "PREPARE MY RECORDS." Runs on app start and whenever the user comes back
// to the app: every Live record that is due today or earlier and still a
// blank shell gets filled in by the assistant and moved to In Progress,
// stamped with what was filled and why. Idempotent — a record is prepared
// at most once (the `prepared` stamp + status check), and a fresh shell for
// a future date is left blank until its day comes, so the calendar never
// shows "data" for a day that hasn't happened yet.
export function prepareDueRecords(referenceISO = todayISO()): RecordInstance[] {
  ensureNearTermRecordsGenerated(false);
  const master = masterRepository.get();
  // Unscoped: the assistant prepares the plant's due records whoever opened
  // the app — a department's paperwork must not go unprepared because nobody
  // from that department logged in today (engine/departmentScope.ts). The
  // briefing that SHOWS them is scoped, so each person still only sees their
  // own (engine/assistantBriefing.ts).
  const docs = documentRepository.getRecordableUnscoped();
  const now = new Date().toISOString();
  const prepared: RecordInstance[] = [];
  // Same launch-date floor as the generator (ensureNearTermRecordsGenerated,
  // above, already called ensureRecordsGeneratedForMonth at least once, so
  // this is guaranteed set by now). A blank shell from before this browser's
  // launch date is backlog noise, not something actually due — it must NOT
  // get silently promoted to "In Progress" / surfaced as "ready for your OK"
  // on the very next load, before the Dashboard's cleanup banner is even
  // seen (see engine/backlogCleanup.ts, which only targets still-"Due"
  // records for exactly this reason).
  const { liveStartDate } = settingsRepository.get();

  for (const doc of docs) {
    const records = recordRepository
      .queryUnscoped({ documentId: doc.id, isDemo: false })
      .filter(
        (r) =>
          BLANK_STATUSES.includes(r.status as (typeof BLANK_STATUSES)[number]) &&
          !r.prepared &&
          compareISO(r.dueDate, referenceISO) <= 0 &&
          (!liveStartDate || compareISO(r.dueDate, liveStartDate) >= 0)
      )
      .sort((a, b) => compareISO(a.dueDate, b.dueDate));

    for (const record of records) {
      const previous = latestConfirmedRecord(doc.id, record.dueDate, false);
      const result = autoFillRecord(doc, record.dueDate, master, previous);
      if (!result) continue;
      prepared.push({
        ...record,
        data: result.data,
        status: "In Progress",
        // updatedAt is stamped here (matching prepared.at exactly) rather
        // than left for upsertMany to fill in — upsertMany no longer
        // re-stamps it (see recordRepository.ts), specifically so this
        // equality is real and not two independent clock reads that happen
        // to be close together. findPreLaunchNoise() depends on it holding
        // for a genuinely untouched, just-prepared record.
        updatedAt: now,
        prepared: { at: now, by: "assistant", notes: result.notes, basedOn: result.basedOn },
      });
    }
  }

  if (prepared.length > 0) recordRepository.upsertMany(prepared);
  return prepared;
}

// Lets the user ask the assistant to redo one record from scratch (e.g.
// after they cleared it). Only valid while the record is still a draft.
export function reprepareRecord(recordId: string): RecordInstance | undefined {
  const record = recordRepository.getById(recordId);
  if (!record || !["Scheduled", "Due", "In Progress", "Rejected"].includes(record.status)) return undefined;
  const doc = documentRepository.getByIdUnscoped(record.documentId);
  if (!doc) return undefined;
  const result = autoFillRecord(doc, record.dueDate, masterRepository.get(), latestConfirmedRecord(doc.id, record.dueDate, record.isDemo));
  if (!result) return undefined;
  return recordRepository.upsert({
    ...record,
    data: result.data,
    status: "In Progress",
    prepared: { at: new Date().toISOString(), by: "assistant", notes: result.notes, basedOn: result.basedOn },
  });
}
