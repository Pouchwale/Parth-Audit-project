// A BLANK SHEET FROM BEFORE THE SYSTEM WENT LIVE (REQUIREMENTS §115).
//
// Before recordGenerator.ts had its launch-date floor, browsing the calendar
// back through old months made a blank sheet for every period of every
// document — thousands of them, for dates nobody was ever going to fill. This
// is the one rule that says which records those are, written here with no
// imports so the browser (engine/backlogCleanup.ts, data/serverSync.ts) and the
// server (backend/recordsArchive.ts, which moves them to the archive) read the
// very same criteria. They are deliberately narrow — nothing a person touched
// is ever one of them:
//   - a Live record (isDemo false) whose dueDate is before the go-live day;
//   - with status "Scheduled" or "Due" (an untouched blank shell), or
//     "In Progress" with a `prepared` stamp, never submitted, and an updatedAt
//     within two minutes of the preparation — written by the assistant's own
//     batch and never saved by a person since (a human save mints a fresh
//     timestamp minutes or days later; installs prepared before the fix that
//     made the two stamps exactly equal have a gap of milliseconds to seconds,
//     which is why this is a window and not an equality).
// Anything Submitted, Pending Verification, Verified or Rejected — or edited
// after being prepared — is left alone no matter how old its due date is. The
// seeded historical specimens are excluded by their callers (SEED_HISTORICAL_RECORDS).
export const UNTOUCHED_WINDOW_MS = 2 * 60 * 1000;

/** The fields the rule reads; a RecordInstance has them all. */
export interface NoiseCandidate {
  isDemo?: boolean;
  dueDate?: string;
  status?: string;
  prepared?: { at?: string } | null;
  submittedAt?: string | null;
  updatedAt?: string;
}

/** ISO dates compare as text. */
const before = (a: string, b: string): boolean => a < b;

export function isPreLaunchNoise(r: NoiseCandidate, liveStartDate: string | null | undefined): boolean {
  if (!liveStartDate || r.isDemo) return false;
  if (typeof r.dueDate !== "string" || !before(r.dueDate, liveStartDate)) return false;
  if (r.status === "Due" || r.status === "Scheduled") return true;
  if (r.status === "In Progress" && r.prepared && typeof r.prepared.at === "string" && !r.submittedAt) {
    const gap = Date.parse(r.updatedAt ?? "") - Date.parse(r.prepared.at);
    return gap >= 0 && gap < UNTOUCHED_WINDOW_MS;
  }
  return false;
}
