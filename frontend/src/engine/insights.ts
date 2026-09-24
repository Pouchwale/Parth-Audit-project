import type { DocumentDefinition, GapInspectionData, LogSheetLayout, RecordInstance } from "../types";
import { TBC } from "../types";
import { getLogSheetLayoutForRecord } from "../data/seed/logSheetLayouts";
import { departmentScope, isDocumentIdVisible } from "./departmentScope";
import { documentOpenRoute } from "./documentRoutes";
import { compareISO } from "../utils/date";
import { INSIGHT_RULES, warmRecord } from "./insightRules";

// INSIGHTS — WHAT THE PLANT'S OWN RECORDS SAY WHEN THEY ARE READ TOGETHER
// (REQUIREMENTS §75).
//
// A person filling one sheet sees one day. Read across days, the same sheets
// say more: a viscosity that has shifted before any reading left its band, the
// same lot deviation written on seven lots, a CAPA closed in February and the
// finding back in March, a lamp in a colour-matching cabinet giving half the
// light it gave last year, one machine on the breakdown register three times in
// a quarter. This engine finds those, by arithmetic on the records, and says
// each one in plain English with the records it was read from.
//
// THREE PROMISES, because people will act on what this says:
//   1. NOTHING IS INVENTED. Every insight is worked out by a fixed rule from
//      records on this computer, and names every record it was read from
//      (`evidence`). No limit is made up: a band is the one the form prints
//      (LogColumn nominal / min / max), a grade is the form's own grade table,
//      and where the form prints no limit — lux — the insight compares the
//      plant's own measurements with each other and says that it does.
//   2. ONLY WHAT PEOPLE WROTE. Blank Due / Scheduled shells, and drafts that
//      only the assistant has touched, hold synthetic values (engine/autoFill.ts
//      fills readings inside the band), so reading them would both invent
//      findings and hide real drift. See isHumanRecord below.
//   3. NOTHING IS DONE BY ITSELF. The engine only reads. A CAPA is raised from
//      an insight only when a person presses the button (engine/raiseCapa.ts),
//      and never automatically — that would change the Dashboard's open
//      corrective actions without anybody deciding it.
//
// DEPARTMENT SCOPE (REQUIREMENTS §40). The caller hands in records already read
// through the SCOPED recordRepository.query and the scoped document list; every
// document is checked again here with isDocumentIdVisible, so an insight can
// never be built from — or point to — a record the person may not open.
//
// SPEED (REQUIREMENTS §56). The engine is pure: records in, insights out, no
// storage read, never called while a page is drawing. What each rule reads out
// of a record is remembered per record by its id, updatedAt and status (and the
// layout it was read with), so a second run after one save re-reads one record.
// The id+updatedAt key survives the re-parse after a server pull, where a
// WeakMap keyed on the record object would not (a pull gives every record a new
// identity). The rules then add up those features in one pass per document. A
// page takes the run in slices of a few milliseconds (startInsights): first the
// records are read into that memo, then each rule in turn — measured on a
// year's volume (3,200 records, 6,400 hourly readings) at about 40 ms in all
// the first time and 5 ms after one save, on a desktop; six times that on a
// slow laptop, which is why it is sliced.
// Nothing here formats with Intl or compares with localeCompare: the first
// call of either loads locale data, which alone cost more than every rule.

export type InsightSeverity = "high" | "medium" | "low";

/** One record an insight was read from, and where in it. */
export interface InsightEvidence {
  recordId: string;
  documentId: string;
  dueDate: string;
  /** The column / field the value is in, e.g. "viscosity" or "deviationReason". */
  field?: string;
  /** What that field says, shortened, e.g. "21.4 at 13:00". */
  value?: string;
}

/** A series of readings to draw beside an insight (components/charts/ReadingChart.tsx). */
export interface InsightChart {
  title: string;
  unit?: string;
  nominal?: number;
  min?: number;
  max?: number;
  /** The standard deviation the early-warning rule used; the chart shades nominal ± 2σ. */
  sigma?: number;
  points: { x: string; y: number }[];
}

/** What a CAPA raised from an insight will say (engine/raiseCapa.ts). */
export interface SuggestedCapa {
  /** Finding of inspection. */
  finding: string;
  /** Comments on the finding: the evidence, record by record. */
  comment: string;
  /** Corrective action suggested for the plant to review. */
  action: string;
}

export interface Insight {
  /** Stable across runs, e.g. "a1|qc-viscosity|viscosity|2026-08-14" — a raised CAPA remembers it (GapFinding.insightKey). */
  id: string;
  /** Which rule found it: A1, A2, A4, B1…B5, C3, SUP, M1…M7. */
  rule: string;
  severity: InsightSeverity;
  /** The module of the document it is about, as the Document Library names it. */
  module: string;
  documentId?: string;
  /** One line, plain English, with the numbers. */
  title: string;
  /** Two to four sentences: what, the evidence, why it matters, what to do. */
  detail: string;
  /** Newest first; capped (see evidenceTotal). */
  evidence: InsightEvidence[];
  /** How many records the insight was read from, when that is more than `evidence` lists. */
  evidenceTotal?: number;
  /** Where to look: the document's page, or the one record. */
  route?: string;
  suggestedCapa?: SuggestedCapa;
  metric?: { label: string; value: string };
  chart?: InsightChart;
}

export interface InsightInput {
  /** Records ALREADY SCOPED to the person's departments (recordRepository.query). */
  records: readonly RecordInstance[];
  /** Document definitions the person may see (documentRepository.getAll). */
  documents: readonly DocumentDefinition[];
  /** ISO date the insights are worked out for. */
  today: string;
  /** Demo Mode reads the demo records, Live the live ones — never both. */
  isDemo: boolean;
  /** Go-live date: drafts dated before it are pre-launch noise (REQUIREMENTS §65.5). */
  liveStartDate?: string | null;
  /** Holidays and the weekly off (engine/performance.ts closedDays), so a closed day is never reported as a missed check. */
  isClosedDay?: (dateISO: string) => boolean;
}

/** What every rule is handed: today, and the human records of each visible document. */
export interface RuleContext {
  today: string;
  isDemo: boolean;
  isClosedDay?: (dateISO: string) => boolean;
  /** Documents that have human records here, in a fixed order. */
  documentIds(): string[];
  /** The human records of one visible document, oldest first by due date. Empty for a document the person may not see. */
  records(documentId: string): RecordInstance[];
  /** May the person see this document? (REQUIREMENTS §40) */
  visible(documentId: string): boolean;
  doc(documentId: string): DocumentDefinition | undefined;
  /** "F-QC-30", or the name where the format number is not known. */
  formatNo(documentId: string): string;
  docName(documentId: string): string;
  moduleOf(documentId: string): string;
  /** Where the document opens (engine/documentRoutes.ts). */
  documentRoute(documentId: string): string;
  /** Where one record opens — the same answer as engine/reminders.ts routeForRecord. */
  recordRoute(record: RecordInstance): string;
  /** The layout this record is read with — its own revision's (REQUIREMENTS §74). */
  layout(record: RecordInstance): LogSheetLayout | undefined;
  /** What a rule reads out of one record, remembered until the record changes. */
  memo<T>(kind: string, record: RecordInstance, compute: (layout: LogSheetLayout | undefined) => T): T;
}

export type InsightRule = (ctx: RuleContext) => Insight[];

// ---------------------------------------------------------------------------
// only what people wrote

/** Handed in, looked at, sent back or signed: a person stands behind every value. */
const HUMAN_STATUSES = new Set<RecordInstance["status"]>(["Submitted", "Pending Verification", "Verified", "Rejected"]);

/**
 * Is this record something a PERSON wrote? Submitted, awaiting verification,
 * verified or sent back — yes. In Progress only when its history holds an entry
 * that is not the assistant's own preparation: somebody has typed into it, or
 * asked Mitra to change it. A Due or Scheduled shell never — its cells are the
 * form's fixed text and nothing else. A draft dated before go-live that nobody
 * handed in is left out as the Briefing leaves it out (engine/assistantBriefing.ts).
 *
 * The one exception is the internal CAPA report: its findings are only ever
 * written by a person (or raised by one from an insight), so an In Progress
 * report with findings on it counts even when it was saved before record
 * histories existed.
 */
export function isHumanRecord(record: RecordInstance, liveStartDate?: string | null): boolean {
  if (HUMAN_STATUSES.has(record.status)) return true;
  if (record.status !== "In Progress") return false;
  if (record.documentId === "gap-inspection") {
    const findings = (record.data as GapInspectionData | undefined)?.findings;
    if (Array.isArray(findings) && findings.length > 0) return true;
  }
  if (liveStartDate && compareISO(record.dueDate, liveStartDate) < 0) return false;
  return !!record.history?.some((h) => h.action !== "prepared");
}

// ---------------------------------------------------------------------------
// remembered per record

interface CachedFeature {
  stamp: string;
  layout: LogSheetLayout | undefined;
  value: unknown;
}

// Module-level on purpose: it outlives a page, so going back to the Insights
// page, or the Dashboard card asking after the page did, costs almost nothing.
// Bounded by (rules × records); cleared when it grows past that by far (a
// Demo Mode year cleared and generated again leaves the old ids behind).
const featureCache = new Map<string, Map<string, CachedFeature>>(); // kind → record id → feature
const MAX_CACHED_FEATURES = 60000;
let cachedFeatures = 0;

const stampOf = (r: RecordInstance) => `${r.updatedAt}|${r.status}|${r.formatRevision ?? ""}`;

/** What a rule read out of this record, from the memo while the record and its layout are unchanged, else read now. */
function remember<T>(kind: string, record: RecordInstance, layout: LogSheetLayout | undefined, compute: (layout: LogSheetLayout | undefined) => T): T {
  let byId = featureCache.get(kind);
  if (!byId) featureCache.set(kind, (byId = new Map()));
  const stamp = stampOf(record);
  const hit = byId.get(record.id);
  if (hit && hit.stamp === stamp && hit.layout === layout) return hit.value as T;
  const value = compute(layout);
  if (!hit) cachedFeatures += 1;
  byId.set(record.id, { stamp, layout, value });
  return value;
}

/** Everything that changes the answer apart from the records themselves. */
const runKeyOf = (input: InsightInput): string => {
  const scope = departmentScope();
  return `${input.today}|${input.isDemo}|${input.liveStartDate ?? ""}|${scope ? scope.join(",") : "*"}|${input.isClosedDay ? 1 : 0}`;
};

// Where a record opens. The same four answers as routeForRecord
// (engine/reminders.ts), repeated here so this pure engine does not pull in the
// reminder engine and its record generator.
function routeOfRecord(doc: DocumentDefinition | undefined, recordId: string): string {
  switch (doc?.kind) {
    case "gap-inspection":
      return `/gap/${recordId}`;
    case "complaint-checklist":
      return `/gap/complaint/${recordId}`;
    case "training-record":
      return `/training/${recordId}`;
    default:
      return `/record/${recordId}`;
  }
}

// The Maintenance formats name their module even before their definitions
// reach an older browser, so an insight about them is never filed under "Other".
const MODULE_BY_PREFIX: [prefix: string, module: string][] = [["mnt-", "Maintenance"]];

// ---------------------------------------------------------------------------
// the whole run

const SEVERITY_RANK: Record<InsightSeverity, number> = { high: 0, medium: 1, low: 2 };

/** Newest evidence first; an insight with none sorts last within its severity. */
const newestEvidence = (i: Insight): string => i.evidence.reduce((best, e) => (e.dueDate > best ? e.dueDate : best), "");

let lastRun: { records: readonly RecordInstance[]; documents: readonly DocumentDefinition[]; key: string; insights: Insight[] } | null = null;

/** The records grouped by document and the context every rule reads through — one pass over the records. */
function buildContext(input: InsightInput): { ctx: RuleContext; visible: (documentId: string) => boolean } {
  const docs = new Map<string, DocumentDefinition>();
  for (const d of input.documents) docs.set(d.id, d);

  const visibleMemo = new Map<string, boolean>();
  const visible = (documentId: string): boolean => {
    let v = visibleMemo.get(documentId);
    if (v === undefined) {
      v = isDocumentIdVisible(documentId, docs.get(documentId)?.formatNo);
      visibleMemo.set(documentId, v);
    }
    return v;
  };

  // One pass: the human records of the side asked for, by document.
  const byDoc = new Map<string, RecordInstance[]>();
  for (const r of input.records) {
    if (r.isDemo !== input.isDemo) continue;
    if (!visible(r.documentId)) continue;
    if (!isHumanRecord(r, input.liveStartDate)) continue;
    let list = byDoc.get(r.documentId);
    if (!list) byDoc.set(r.documentId, (list = []));
    list.push(r);
  }
  for (const list of byDoc.values()) list.sort((a, b) => compareISO(a.dueDate, b.dueDate) || compareISO(a.updatedAt, b.updatedAt));
  const documentIds = [...byDoc.keys()].sort();

  // A layout is looked up once per document and revision in a run, not once per
  // record (getLogSheetLayout reads the plant's format edits each time).
  const layouts = new Map<string, LogSheetLayout | undefined>();
  const layout = (record: RecordInstance): LogSheetLayout | undefined => {
    const k = `${record.documentId}|${record.formatRevision ?? ""}`;
    if (!layouts.has(k)) layouts.set(k, getLogSheetLayoutForRecord(record.documentId, record));
    return layouts.get(k);
  };

  if (cachedFeatures > MAX_CACHED_FEATURES) {
    featureCache.clear();
    cachedFeatures = 0;
  }

  const ctx: RuleContext = {
    today: input.today,
    isDemo: input.isDemo,
    isClosedDay: input.isClosedDay,
    documentIds: () => documentIds,
    records: (documentId) => (visible(documentId) ? byDoc.get(documentId) ?? [] : []),
    visible,
    doc: (documentId) => docs.get(documentId),
    formatNo: (documentId) => {
      const d = docs.get(documentId);
      if (!d) return documentId;
      return d.formatNo && d.formatNo !== TBC ? d.formatNo : d.name;
    },
    docName: (documentId) => docs.get(documentId)?.name ?? documentId,
    moduleOf: (documentId) => docs.get(documentId)?.module ?? MODULE_BY_PREFIX.find(([p]) => documentId.startsWith(p))?.[1] ?? "Other",
    documentRoute: (documentId) => {
      const d = docs.get(documentId);
      return d ? documentOpenRoute(d) : `/document/${documentId}`;
    },
    recordRoute: (record) => routeOfRecord(docs.get(record.documentId), record.id),
    layout,
    memo: <T>(kind: string, record: RecordInstance, compute: (layout: LogSheetLayout | undefined) => T): T => remember(kind, record, layout(record), compute),
  };
  return { ctx, visible };
}

/** A run of the engine that can be taken a slice at a time. */
export interface InsightRun {
  /**
   * Does at most about `budgetMs` of work and returns the insights once they
   * are all worked out, null until then. Call it again (after yielding to the
   * browser) until it returns the list.
   */
  step(budgetMs?: number): Insight[] | null;
}

/**
 * Starts working out the insights for this input, to be taken a slice at a
 * time (REQUIREMENTS §56: no long task on a slow laptop). The work is, in
 * order: reading every human record into the per-record memo (warmInsights), one
 * pass grouping the records, each rule in turn, and the sort. A page calls
 * step() in a timer until it returns the list; computeInsights is the same run
 * taken in one go.
 */
export function startInsights(input: InsightInput): InsightRun {
  const key = runKeyOf(input);
  let result: Insight[] | null =
    // The very same arrays asked about again (a re-render handing in the
    // repository's snapshot): the answer cannot have changed.
    lastRun && lastRun.records === input.records && lastRun.documents === input.documents && lastRun.key === key ? lastRun.insights : null;
  let warmed = false;
  let built: ReturnType<typeof buildContext> | null = null;
  let ruleIndex = 0;
  const insights: Insight[] = [];
  const seen = new Set<string>();

  return {
    step(budgetMs = 8): Insight[] | null {
      if (result) return result;
      const deadline = performance.now() + budgetMs;
      if (!warmed) {
        if (!warmInsights(input, budgetMs)) return null;
        warmed = true;
        if (performance.now() > deadline) return null;
      }
      if (!built) {
        built = buildContext(input);
        if (performance.now() > deadline) return null;
      }
      const { ctx, visible } = built;
      while (ruleIndex < INSIGHT_RULES.length) {
        const rule = INSIGHT_RULES[ruleIndex++];
        let found: Insight[] = [];
        try {
          found = rule(ctx);
        } catch (err) {
          // One rule meeting a record it cannot read must not take the others
          // down with it; the page still shows everything else that was found.
          console.error("An insight rule failed", err);
        }
        for (const insight of found) {
          // Belt and braces for §40: an insight about a document the person may
          // not see, or naming a record of one, is dropped whole.
          if (insight.documentId && !visible(insight.documentId)) continue;
          if (insight.evidence.some((e) => !visible(e.documentId))) continue;
          if (seen.has(insight.id)) continue;
          seen.add(insight.id);
          insights.push(insight);
        }
        if (ruleIndex < INSIGHT_RULES.length && performance.now() > deadline) return null;
      }
      insights.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || compareISO(newestEvidence(b), newestEvidence(a)) || compareISO(a.id, b.id));
      lastRun = { records: input.records, documents: input.documents, key, insights };
      result = insights;
      return result;
    },
  };
}

/**
 * Every insight the records support, most severe first and, within a severity,
 * newest evidence first — in one go. Pure apart from the per-record memo. Never
 * call it while drawing; a page should take startInsights a slice at a time
 * (pages/InsightsPage.tsx), and this is for callers that already run off the
 * drawing path (Mitra's context, a report being built).
 */
export function computeInsights(input: InsightInput): Insight[] {
  const run = startInsights(input);
  let result = run.step(Number.POSITIVE_INFINITY);
  while (!result) result = run.step(Number.POSITIVE_INFINITY);
  return result;
}

// ---------------------------------------------------------------------------
// the first read of each record, in slices

let warm: { records: readonly RecordInstance[]; key: string; index: number; layouts: Map<string, LogSheetLayout | undefined>; visible: Map<string, boolean> } | null = null;

/**
 * Reads the records into the per-record memo for at most `budgetMs`, and says
 * whether every record has been read. The first read of a year of records is
 * the costly part of a first run, so startInsights does it in slices before
 * anything is added up. Hand in the SAME input object on each call; a different
 * records array starts again from the beginning.
 */
export function warmInsights(input: InsightInput, budgetMs = 8): boolean {
  const key = runKeyOf(input);
  if (!warm || warm.records !== input.records || warm.key !== key) warm = { records: input.records, key, index: 0, layouts: new Map(), visible: new Map() };
  const state = warm;
  const layout = (record: RecordInstance): LogSheetLayout | undefined => {
    const k = `${record.documentId}|${record.formatRevision ?? ""}`;
    if (!state.layouts.has(k)) state.layouts.set(k, getLogSheetLayoutForRecord(record.documentId, record));
    return state.layouts.get(k);
  };
  const visible = (documentId: string): boolean => {
    let v = state.visible.get(documentId);
    if (v === undefined) state.visible.set(documentId, (v = isDocumentIdVisible(documentId)));
    return v;
  };
  const ctx = { layout, memo: <T>(kind: string, record: RecordInstance, compute: (layout: LogSheetLayout | undefined) => T): T => remember(kind, record, layout(record), compute) };
  const records = input.records;
  const deadline = performance.now() + budgetMs;
  while (state.index < records.length) {
    const r = records[state.index++];
    if (r.isDemo === input.isDemo && visible(r.documentId) && isHumanRecord(r, input.liveStartDate)) warmRecord(ctx, r);
    if ((state.index & 15) === 0 && performance.now() > deadline) break;
  }
  return state.index >= records.length;
}

/** How many of each severity — the summary line, the Dashboard card and Mitra's headline read this. */
export function insightCounts(insights: readonly Insight[]): Record<InsightSeverity, number> {
  const counts: Record<InsightSeverity, number> = { high: 0, medium: 0, low: 0 };
  for (const i of insights) counts[i.severity] += 1;
  return counts;
}

/**
 * One line of at most `maxChars` for Mitra's context (REQUIREMENTS §72/§75):
 * the counts and the most severe titles, so a general question knows what
 * stands out without a whole evidence pack. Deterministic text, no record ids.
 */
export function insightsHeadline(insights: readonly Insight[], maxChars = 400): string {
  if (insights.length === 0) return "Insights: nothing unusual found in the records this user can see.";
  const c = insightCounts(insights);
  let line = `Insights (${c.high} high, ${c.medium} medium, ${c.low} low):`;
  for (const i of insights.slice(0, 3)) {
    const next = `${line} [${i.severity}] ${i.title};`;
    if (next.length > maxChars) break;
    line = next;
  }
  return line.slice(0, maxChars);
}
