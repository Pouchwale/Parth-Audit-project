import type { RecordInstance } from "../types";
import { recordRepository } from "../data/repositories/recordRepository";
import { settingsRepository } from "../data/repositories/settingsRepository";
import { SEED_HISTORICAL_RECORDS } from "../data/seed/historicalRecords";
import { accessAccount, mayDo } from "./departmentScope";
import { isPreLaunchNoise } from "./preLaunchNoise";

const SEED_IDS = new Set(SEED_HISTORICAL_RECORDS.map((r) => r.id));

// Finds Live records that are pure generator noise from before
// recordGenerator.ts's launch-date floor existed (see settingsRepository's
// liveStartDate): shells the frequency engine created for a date before the
// system went live, that nobody has ever actually looked at. The rule itself
// is engine/preLaunchNoise.ts, shared with the server; this adds what only
// the browser knows: never one of the real, seeded historical specimens
// (SEED_HISTORICAL_RECORDS), and only the documents the signed-in person may
// delete (REQUIREMENTS §96).
//
// NOTHING HERE DELETES ANY MORE (REQUIREMENTS §115). The sheets this finds are
// moved by the server itself, at its start, into the archive table of the
// database (backend/recordsArchive.ts) — copied first, then taken out of the
// records — and the super admin brings them back from Master Data. The count
// is still read here, for the storage breakdown (engine/storageRoom.ts) and
// the briefing, which leaves them out of the day's lists.
export function findPreLaunchNoise(): RecordInstance[] {
  const { liveStartDate } = settingsRepository.get();
  if (!liveStartDate) return [];
  // Unscoped: pre-launch noise is counted for the whole plant, not only
  // for the department of whoever happens to be looking.
  return recordRepository.queryUnscoped({ isDemo: false }).filter((r) => {
    if (SEED_IDS.has(r.id)) return false;
    if (accessAccount() && !mayDo(r.documentId, "delete")) return false;
    return isPreLaunchNoise(r, liveStartDate);
  });
}
