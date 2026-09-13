import type { RecordInstance } from "../types";
import { recordRepository } from "../data/repositories/recordRepository";
import { settingsRepository } from "../data/repositories/settingsRepository";
import { SEED_HISTORICAL_RECORDS } from "../data/seed/historicalRecords";
import { compareISO } from "../utils/date";

const SEED_IDS = new Set(SEED_HISTORICAL_RECORDS.map((r) => r.id));

// Finds Live records that are pure generator noise from before
// recordGenerator.ts's launch-date floor existed (see settingsRepository's
// liveStartDate): shells the frequency engine created for a date before the
// system went live, that nobody has ever actually looked at. The criteria
// are deliberately narrow — this must never remove anything a person
// touched:
//   - isDemo: false (Live only; Demo is separate and disposable already)
//   - dueDate before the launch floor
//   - status "Scheduled"/"Due" (an untouched blank shell), or "In Progress"
//     with a `prepared` stamp and an updatedAt within two minutes of it —
//     i.e. written by the assistant's own batch and never saved by a person
//     since (a human save goes through upsert(), which mints a fresh
//     timestamp minutes or days later; installs prepared before the fix
//     that made the two stamps exactly equal have a gap of milliseconds
//     to seconds, which is why this is a window and not an equality)
//   - never one of the real, seeded historical specimens (SEED_HISTORICAL_RECORDS)
// Anything Submitted, Pending Verification, Verified or Rejected — or edited
// after being prepared — is left alone no matter how old its due date is.
const UNTOUCHED_WINDOW_MS = 2 * 60 * 1000;

export function findPreLaunchNoise(): RecordInstance[] {
  const { liveStartDate } = settingsRepository.get();
  if (!liveStartDate) return [];
  // Unscoped: pre-launch noise is cleaned up for the whole plant, not only
  // for the department of whoever happens to be looking.
  return recordRepository.queryUnscoped({ isDemo: false }).filter((r) => {
    if (SEED_IDS.has(r.id)) return false;
    if (compareISO(r.dueDate, liveStartDate) >= 0) return false;
    if (r.status === "Due" || r.status === "Scheduled") return true;
    if (r.status === "In Progress" && r.prepared && !r.submittedAt) {
      const gap = Date.parse(r.updatedAt) - Date.parse(r.prepared.at);
      return gap >= 0 && gap < UNTOUCHED_WINDOW_MS;
    }
    return false;
  });
}

// Removes exactly what findPreLaunchNoise() finds and returns how many were
// removed. Triggered only by an explicit user action (see the Dashboard
// banner / Master Data) — never run automatically, since even a
// narrowly-scoped bulk delete deserves a person's go-ahead.
export function purgePreLaunchNoise(): number {
  return recordRepository.removeIds(findPreLaunchNoise().map((r) => r.id));
}
