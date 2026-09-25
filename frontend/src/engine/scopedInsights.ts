import type { DocumentDefinition, MasterData, RecordInstance } from "../types";
import { recordRepository } from "../data/repositories/recordRepository";
import { documentRepository } from "../data/repositories/documentRepository";
import { settingsRepository } from "../data/repositories/settingsRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { departmentScope } from "./departmentScope";
import { insightsHeadline, startInsights, type Insight } from "./insights";
import { currentInsightInput } from "./insightsInput";
import { todayISO } from "../utils/date";

// THE INSIGHTS MITRA READS, WORKED OUT ONCE PER CHANGE (REQUIREMENTS §75).
//
// Mitra's live facts carry one line of what stands out (insightsHeadline), and
// a question about history carries the insights for its topic in its evidence
// pack (engine/historyDigest.ts). Both are the SAME insights the Insights page
// and the Dashboard's card show — the same engine, fed by the same bridge
// (engine/insightsInput.ts currentInsightInput), so Mitra can never tell the
// plant something the Insights page does not say.
//
// SPEED (REQUIREMENTS §56). The run is never made while a screen is drawing:
// only when a message is SENT. prepareScopedInsights takes it in slices of about
// 8 ms with the browser free between them (the house pattern, as
// pages/InsightsPage.tsx does it), and the answer is kept until the records,
// the documents, the day, the account's departments or the go-live date change
// — the store's own snapshot is the version (recordRepository.snapshot() is a
// new array whenever a record changes). The engine keeps what it read from each
// record in its own memo, so after the Dashboard or the Insights page has run,
// Mitra's run only adds up (about 5 ms on a desktop rather than 40).
//
// THE PLANT'S CALENDAR IS PART OF THE VERSION. The insights are worked out on
// the closed days of the master data — holidays, the weekly off, adjustment
// days (engine/insightsInput.ts closedDays) — so the master data is kept with
// the answer and compared like the records: masterRepository.get() hands back
// the same object until what is stored changes. Without it, a holiday added on
// the Master Data screen left Mitra's insights (and every evidence pack built
// on them, engine/historyDigest.ts) as they were before it, until a record
// happened to change.

interface Kept {
  records: readonly RecordInstance[];
  documents: readonly DocumentDefinition[];
  master: MasterData;
  key: string;
  insights: Insight[];
}

let kept: { demo: Kept | null; live: Kept | null } = { demo: null, live: null };

/** Everything apart from the records and the documents that changes the answer. */
function keyOf(isDemo: boolean): string {
  const scope = departmentScope();
  return `${todayISO()}|${isDemo}|${scope ? scope.join(",") : "*"}|${settingsRepository.get().liveStartDate ?? ""}`;
}

/** The kept answer, when nothing it was worked out from has changed since. */
export function cachedScopedInsights(isDemo: boolean): Insight[] | null {
  const k = isDemo ? kept.demo : kept.live;
  if (!k) return null;
  if (k.records !== recordRepository.snapshot() || k.documents !== documentRepository.getAllUnscoped() || k.master !== masterRepository.get() || k.key !== keyOf(isDemo)) return null;
  return k.insights;
}

function keep(isDemo: boolean, records: readonly RecordInstance[], documents: readonly DocumentDefinition[], master: MasterData, key: string, insights: Insight[]): Insight[] {
  const k: Kept = { records, documents, master, key, insights };
  kept = isDemo ? { ...kept, demo: k } : { ...kept, live: k };
  return insights;
}

/**
 * The insights for this account now, in one go when they are not kept already.
 * For callers already off the drawing path that cannot wait (the unit tests,
 * and buildAssistantContext when nothing prepared them first).
 */
export function scopedInsights(isDemo: boolean): Insight[] {
  const hit = cachedScopedInsights(isDemo);
  if (hit) return hit;
  const records = recordRepository.snapshot();
  const documents = documentRepository.getAllUnscoped();
  const master = masterRepository.get();
  const key = keyOf(isDemo);
  const run = startInsights(currentInsightInput(isDemo));
  let insights = run.step(Number.POSITIVE_INFINITY);
  while (!insights) insights = run.step(Number.POSITIVE_INFINITY);
  return keep(isDemo, records, documents, master, key, insights);
}

const nextTick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * The same, taken a slice at a time so a slow laptop never freezes while Mitra
 * thinks (REQUIREMENTS §56): about `sliceMs` of work, then the browser is let
 * go before the next slice. Resolves at once when the answer is kept.
 */
export async function prepareScopedInsights(isDemo: boolean, sliceMs = 8): Promise<Insight[]> {
  const hit = cachedScopedInsights(isDemo);
  if (hit) return hit;
  const records = recordRepository.snapshot();
  const documents = documentRepository.getAllUnscoped();
  const master = masterRepository.get();
  const key = keyOf(isDemo);
  const run = startInsights(currentInsightInput(isDemo));
  let insights = run.step(sliceMs);
  while (!insights) {
    await nextTick();
    insights = run.step(sliceMs);
  }
  return keep(isDemo, records, documents, master, key, insights);
}

/**
 * One line of at most `maxChars` for Mitra's live facts (REQUIREMENTS §75): the
 * counts and the most severe titles, from engine/insights.ts insightsHeadline.
 */
export function scopedInsightsHeadline(isDemo: boolean, maxChars = 400): string {
  return insightsHeadline(scopedInsights(isDemo), maxChars);
}
