import type { GapFinding, GapInspectionData, RecordInstance } from "../types";
import type { Insight } from "./insights";
import { documentRepository } from "../data/repositories/documentRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { createRecordForDocument } from "./recordCrud";
import { saveDraft } from "./recordLifecycle";
import { recordLabel } from "./recordHistory";
import { routeForRecord } from "./reminders";
import { logActivity } from "../utils/activityLog";
import { addDays, compareISO, todayISO } from "../utils/date";
import { generateId } from "../utils/id";

// RAISE A CAPA FROM AN INSIGHT (REQUIREMENTS §75) — ONLY WHEN A PERSON ASKS.
//
// An insight that suggests a corrective action (engine/insightRules.ts) can be
// turned into a finding on the internal CAPA report with one press of "Raise
// CAPA" on the Insights page. Nothing here runs by itself: an automatic CAPA
// would change the Dashboard's "Open Corrective Actions" without anybody having
// decided it, and the plant's CAPA log must hold what people decided.
//
// What the press does, and nothing more:
//   1. Only for someone who may see the internal CAPA report (gap-inspection is
//      QA's, REQUIREMENTS §40) — otherwise the button is never offered, and a
//      QC account could not start a record it cannot then open.
//   2. The finding goes onto the internal CAPA report already being written
//      this month (In Progress), or onto a new one started the ordinary way
//      (createRecordForDocument), so a month's findings stay on one report.
//   3. It is written as the insight worded it — finding, the evidence as the
//      comment, the suggested action — with a target date 15 days out (the
//      plant's usual target) and status Open, and it remembers the insight it
//      came from (insightKey) and EVERY record it was read from
//      (sourceRecordIds — all of them, not only those its card lists). That
//      is what marks the insight "CAPA raised" and what tells A4 an excursion
//      now has an action.
//   4. It is saved as a draft with the history entry "Record edited through
//      Mitra" (action "assistant-edit"): the words were the system's, the
//      decision was the person's, and the history says both. The person then
//      reviews, edits and submits the report as they would any other.
//   5. The same insight is never raised twice while its finding is open.

export const CAPA_DOC_ID = "gap-inspection";
/** Days from today to the target date of a finding raised from an insight. */
export const CAPA_TARGET_DAYS = 15;

/** A CAPA finding with the link back to the insight it was raised from (types/record.ts GapFinding, REQUIREMENTS §75). */
export type LinkedFinding = GapFinding & { insightKey?: string; sourceRecordIds?: string[] };

export interface RaisedCapa {
  recordId: string;
  sNo: number;
  status: GapFinding["status"];
  targetDate: string | null;
}

/** May this person raise a CAPA at all? Only when the internal CAPA report is one of their documents. */
export function canRaiseCapa(): boolean {
  return !!documentRepository.getById(CAPA_DOC_ID);
}

/**
 * The insights that already have an OPEN CAPA finding (Open or Overdue), by
 * insight id, read from the CAPA reports handed in (the scoped
 * recordRepository.query of gap-inspection). A finding that was closed does not
 * count: if the insight is still found afterwards, it may be raised again.
 */
export function raisedInsightKeys(capaRecords: readonly RecordInstance[]): Map<string, RaisedCapa> {
  const out = new Map<string, RaisedCapa>();
  for (const record of capaRecords) {
    if (record.documentId !== CAPA_DOC_ID) continue;
    for (const f of ((record.data as GapInspectionData | undefined)?.findings ?? []) as LinkedFinding[]) {
      if (!f.insightKey || (f.status !== "Open" && f.status !== "Overdue")) continue;
      if (!out.has(f.insightKey)) out.set(f.insightKey, { recordId: record.id, sNo: f.sNo, status: f.status, targetDate: f.targetDate });
    }
  }
  return out;
}

/** The open CAPA finding raised from this insight, if there is one. */
export function openCapaForInsight(capaRecords: readonly RecordInstance[], insightId: string): RaisedCapa | undefined {
  return raisedInsightKeys(capaRecords).get(insightId);
}

export interface RaiseCapaResult {
  record: RecordInstance<GapInspectionData>;
  /** Where the report opens (engine/reminders.ts routeForRecord) — the caller navigates there. */
  route: string;
  /** True when a new internal CAPA report was started for it. */
  created: boolean;
  /** True when the insight already had an open finding, which is returned instead of a second one. */
  alreadyRaised: boolean;
}

const sameMonth = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7);

/**
 * Adds the insight's suggested CAPA as a finding on this month's internal CAPA
 * report and returns that report. Null when the person may not see the CAPA
 * report or the insight suggests no CAPA. Call it only from a person's click.
 */
export function raiseCapaFromInsight(insight: Insight, actor: string, isDemo: boolean): RaiseCapaResult | null {
  const suggestion = insight.suggestedCapa;
  const doc = documentRepository.getById(CAPA_DOC_ID);
  if (!doc || !suggestion) return null;
  const today = todayISO();
  const reports = recordRepository.query({ documentId: CAPA_DOC_ID, isDemo }) as RecordInstance<GapInspectionData>[];

  const already = raisedInsightKeys(reports).get(insight.id);
  if (already) {
    const record = reports.find((r) => r.id === already.recordId);
    if (record) return { record, route: routeForRecord(doc, record.id), created: false, alreadyRaised: true };
  }

  // This month's report still being written, the most recently touched first.
  let record = reports
    .filter((r) => r.status === "In Progress" && (sameMonth(r.dueDate, today) || sameMonth(r.data?.inspectionDate ?? "", today)))
    .sort((a, b) => compareISO(b.updatedAt, a.updatedAt))[0];
  let created = false;
  if (!record) {
    record = createRecordForDocument(doc, { dateISO: today, isDemo }).record as RecordInstance<GapInspectionData>;
    created = true;
  }

  const findings = (record.data?.findings ?? []) as LinkedFinding[];
  // Every record the insight was read from, not only the twelve its card lists
  // (Insight.sourceRecordIds is taken before the evidence is capped). Read from
  // the capped list, an A4 over twenty verified sheets linked twelve of them,
  // and came straight back for the other eight after its CAPA was raised.
  const sourceRecordIds = insight.sourceRecordIds?.length ? [...new Set(insight.sourceRecordIds)] : [...new Set(insight.evidence.map((e) => e.recordId))];
  const finding: LinkedFinding = {
    id: generateId("finding"),
    sNo: findings.reduce((max, f) => Math.max(max, f.sNo || 0), 0) + 1,
    findingOfInspection: suggestion.finding,
    commentsOnFindings: `${suggestion.comment} Raised from the Insights page (rule ${insight.rule}).`,
    correctiveActionContractor: "NA",
    correctiveActionClient: suggestion.action,
    targetDate: addDays(today, CAPA_TARGET_DAYS),
    actualDateOfAction: null,
    verifiedByServiceProvider: "",
    status: "Open",
    source: "Internal",
    insightKey: insight.id,
    sourceRecordIds,
  };
  const data: GapInspectionData = { ...record.data, findings: [...findings, finding] };
  const saved = saveDraft(record, data, actor, { action: "assistant-edit", note: `CAPA finding raised from an insight: ${insight.title}` });
  if (!isDemo) logActivity("CAPA raised from an insight", recordLabel(saved), insight.title, CAPA_DOC_ID);
  return { record: saved, route: routeForRecord(doc, saved.id), created, alreadyRaised: false };
}
