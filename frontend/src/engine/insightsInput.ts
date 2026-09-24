import { documentRepository } from "../data/repositories/documentRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { settingsRepository } from "../data/repositories/settingsRepository";
import { todayISO } from "../utils/date";
import { closedDays } from "./performance";
import type { InsightInput } from "./insights";

/**
 * WHAT THE INSIGHTS ARE READ FROM, NOW (REQUIREMENTS §75) — the one place the
 * Insights page, the Dashboard's card and Mitra build it, so the three can
 * never disagree about what they read: the records and documents this account
 * may see (both repositories are scoped), today, the go-live date and the
 * plant's closed days. engine/insights.ts stays free of the repositories; this
 * is the bridge.
 */
export function currentInsightInput(isDemo: boolean): InsightInput {
  return {
    records: recordRepository.query({ isDemo }),
    documents: documentRepository.getAll(),
    today: todayISO(),
    isDemo,
    liveStartDate: settingsRepository.get().liveStartDate,
    isClosedDay: closedDays(masterRepository.get()),
  };
}
