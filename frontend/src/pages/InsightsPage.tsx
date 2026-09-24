import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../store/AppStore";
import { useRouter } from "../store/router";
import { documentRepository } from "../data/repositories/documentRepository";
import { insightCounts, isHumanRecord, startInsights, type Insight, type InsightSeverity } from "../engine/insights";
import { CAPA_DOC_ID, canRaiseCapa, raiseCapaFromInsight, raisedInsightKeys, type RaisedCapa } from "../engine/raiseCapa";
import { currentInsightInput } from "../engine/insightsInput";
import { routeForRecord } from "../engine/reminders";
import { departmentScopeLabel } from "../engine/departmentScope";
import { ReadingChart } from "../components/charts/ReadingChart";
import { useProgressiveCount } from "../utils/useProgressive";
import { pressable } from "../utils/pressable";
import { formatDisplayDate, todayISO } from "../utils/date";
import { useT } from "../i18n";
import type { DocumentDefinition } from "../types";

// INSIGHTS — /insights (REQUIREMENTS §75).
//
// What the plant's own records show when they are read together: readings
// drifting out of their printed band, the same deviation or finding coming back,
// CAPA that did not hold or is past its date, a record that contradicts itself
// (a lot Accepted beside a failed test, a reason's figure the record does not
// read), an expired calibration, a supplier graded C, and Maintenance's lux,
// breakdowns, glass breakage, missed daily checks and slipping PM. Every
// insight is worked out by code
// (engine/insights.ts, engine/insightRules.ts) from records people wrote, and
// lists the records it was read from, each one a link.
//
// SPEED (REQUIREMENTS §56). Nothing is worked out while the page is drawing:
// the page paints its heading first and the insights are worked out after it,
// in slices of about 8 ms with the browser free between them
// (engine/insights.ts startInsights), so even the first run over a year of
// records on a slow laptop never freezes the screen. After a save anywhere (the
// store's version) they are worked out again two seconds later, and a hidden
// tab waits until it is looked at. The engine remembers what it read from each
// record, so a second run re-reads only what changed. The list is progressive —
// the first cards at once, the rest a batch at a time — and it is remounted
// when the filters change, so a longer list is never drawn in one go.
//
// SCOPE (REQUIREMENTS §40). The records are the scoped recordRepository.query
// and the documents the scoped getAll, so a department account sees insights
// about its own documents only. "Raise CAPA" is offered only to someone who may
// see the internal CAPA report (engine/raiseCapa.ts), and it only ever runs on
// that person's click.

const RECOMPUTE_AFTER_MS = 2000;
const NONE: Insight[] = [];
const SEVERITIES: InsightSeverity[] = ["high", "medium", "low"];

const SEVERITY_WORD: Record<InsightSeverity, string> = { high: "High", medium: "Medium", low: "Low" };
const SEVERITY_COLOUR: Record<InsightSeverity, { fg: string; bg: string }> = {
  high: { fg: "var(--color-danger)", bg: "var(--color-danger-bg)" },
  medium: { fg: "var(--color-warning)", bg: "var(--color-warning-bg)" },
  low: { fg: "var(--color-neutral)", bg: "var(--color-neutral-bg)" },
};

interface Computed {
  isDemo: boolean;
  insights: Insight[];
  raised: Map<string, RaisedCapa>;
  /** Records a person wrote, of those this account may see — what the insights were read from. */
  humanRecords: number;
  /** Wall time from the first slice to the last, for a performance check to read (data-compute-ms). */
  ms: number;
}

/**
 * The page's words: the translated string once i18n/strings.ts has the key,
 * the English here until then (an unknown key comes back as its last segment).
 */
function useSay() {
  const t = useT();
  return useCallback(
    (key: string, english: string): string => {
      const s = t(key);
      return s === key.split(".").pop() ? english : s;
    },
    [t]
  );
}

export function InsightsPage() {
  const { mode, version, currentUser, bump } = useAppStore();
  const { navigate } = useRouter();
  const say = useSay();
  const isDemo = mode === "demo";
  const [computed, setComputed] = useState<Computed | null>(null);
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<InsightSeverity | "all">("all");
  const lastRun = useRef<{ isDemo: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let onVisible: (() => void) | null = null;
    let timer = 0;
    const run = () => {
      if (cancelled) return;
      // A hidden tab asks for nothing (REQUIREMENTS §65.5): wait to be looked at.
      if (typeof document !== "undefined" && document.hidden) {
        onVisible = () => {
          if (document.hidden) return;
          document.removeEventListener("visibilitychange", onVisible as () => void);
          onVisible = null;
          run();
        };
        document.addEventListener("visibilitychange", onVisible);
        return;
      }
      const started = performance.now();
      const input = currentInsightInput(isDemo);
      const { records, liveStartDate } = input;
      const engine = startInsights(input);
      const slice = () => {
        if (cancelled) return;
        const insights = engine.step(8);
        if (!insights) {
          timer = window.setTimeout(slice, 0);
          return;
        }
        const raised = raisedInsightKeys(records.filter((r) => r.documentId === CAPA_DOC_ID));
        let humanRecords = 0;
        for (const r of records) if (isHumanRecord(r, liveStartDate)) humanRecords += 1;
        lastRun.current = { isDemo };
        setComputed({ isDemo, insights, raised, humanRecords, ms: performance.now() - started });
      };
      slice();
    };
    // First visit, or the other mode: straight after this paint. A save while
    // the page is open: once things have settled.
    const delay = lastRun.current && lastRun.current.isDemo === isDemo ? RECOMPUTE_AFTER_MS : 0;
    timer = window.setTimeout(run, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (onVisible) document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isDemo, version]);

  const docs = useMemo(() => {
    const map = new Map<string, DocumentDefinition>();
    for (const d of documentRepository.getAll()) map.set(d.id, d);
    return map;
    // The document list changes only with a save of the formats (a version bump).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const current = computed && computed.isDemo === isDemo ? computed : null;
  const all = current?.insights ?? NONE;
  const modules = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of all) counts.set(i.module, (counts.get(i.module) ?? 0) + 1);
    return [...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  }, [all]);
  const moduleIsShown = moduleFilter === "all" || modules.some(([m]) => m === moduleFilter);
  const shownModule = moduleIsShown ? moduleFilter : "all";
  const byModule = useMemo(() => (shownModule === "all" ? all : all.filter((i) => i.module === shownModule)), [all, shownModule]);
  const filtered = useMemo(() => (severityFilter === "all" ? byModule : byModule.filter((i) => i.severity === severityFilter)), [byModule, severityFilter]);
  const counts = useMemo(() => insightCounts(all), [all]);
  const moduleCounts = useMemo(() => insightCounts(byModule), [byModule]);

  const capaAllowed = useMemo(() => canRaiseCapa(), [version]); // eslint-disable-line react-hooks/exhaustive-deps

  const raise = useCallback(
    (insight: Insight) => {
      const result = raiseCapaFromInsight(insight, currentUser, isDemo);
      if (!result) return;
      bump();
      navigate(result.route);
    },
    [currentUser, isDemo, bump, navigate]
  );

  return (
    <div data-page="insights">
      <div className="mb-4">
        <h1 className="text-2xl mb-1">{say("insights.title", "Insights")}</h1>
        <p className="text-muted">
          {say(
            "insights.subtitle",
            "What the plant's own records show when they are read together — worked out by fixed rules from the records on this computer, each with the records it was read from. Nothing here is estimated or invented."
          )}
        </p>
      </div>

      {!current ? (
        <div className="card empty-state" data-section="insights-loading">
          {say("insights.loading", "Reading the records…")}
        </div>
      ) : (
        <>
          <section
            className="flex gap-3 wrap mb-3"
            data-section="insights-summary"
            data-total={all.length}
            data-high={counts.high}
            data-medium={counts.medium}
            data-low={counts.low}
          >
            {SEVERITIES.map((s) => (
              <div key={s} className="stat-tile" data-severity={s} style={{ borderLeft: `4px solid ${SEVERITY_COLOUR[s].fg}` }}>
                <div className="stat-value">{counts[s]}</div>
                <div className="stat-label">{say(`insights.${s}`, SEVERITY_WORD[s])}</div>
              </div>
            ))}
          </section>
          <p className="text-sm text-muted mb-4" data-section="insights-basis" data-records={current.humanRecords} data-compute-ms={Math.round(current.ms)}>
            Read from {current.humanRecords.toLocaleString("en-IN")} record{current.humanRecords === 1 ? "" : "s"} people have written — submitted, verified, sent back or
            edited — in {departmentScopeLabel()}
            {isDemo ? " (Demo Mode)" : ""}, as of {formatDisplayDate(todayISO())}. Blank sheets and drafts only the assistant has filled are not read.
          </p>

          {all.length === 0 ? (
            <div className="card empty-state" data-section="insights-empty">
              {say(
                "insights.empty",
                "Nothing unusual was found in the records on this computer that you can see. Insights appear here as people submit and verify records — a reading outside its band, the same deviation again, a CAPA past its date, a machine breaking down repeatedly."
              )}
            </div>
          ) : (
            <>
              <div className="flex gap-3 wrap mb-4 items-center">
                <div className="pill-tabs" style={{ flexWrap: "wrap" }} data-filter="module">
                  <div className={`pill-tab ${shownModule === "all" ? "active" : ""}`} data-module="all" {...pressable(() => setModuleFilter("all"), shownModule === "all")}>
                    {say("insights.allModules", "All modules")} ({all.length})
                  </div>
                  {modules.map(([m, n]) => (
                    <div key={m} className={`pill-tab ${shownModule === m ? "active" : ""}`} data-module={m} {...pressable(() => setModuleFilter(m), shownModule === m)}>
                      {m} ({n})
                    </div>
                  ))}
                </div>
                <div className="pill-tabs" data-filter="severity">
                  <div className={`pill-tab ${severityFilter === "all" ? "active" : ""}`} data-severity-filter="all" {...pressable(() => setSeverityFilter("all"), severityFilter === "all")}>
                    {say("insights.allSeverities", "Every severity")}
                  </div>
                  {SEVERITIES.map((s) => (
                    <div
                      key={s}
                      className={`pill-tab ${severityFilter === s ? "active" : ""}`}
                      data-severity-filter={s}
                      {...pressable(() => setSeverityFilter(s), severityFilter === s)}
                    >
                      {say(`insights.${s}`, SEVERITY_WORD[s])} ({moduleCounts[s]})
                    </div>
                  ))}
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="card empty-state" data-section="insights-none-match">
                  {say("insights.noneMatch", "No insights match these filters.")}
                </div>
              ) : (
                <InsightList
                  key={`${shownModule}|${severityFilter}|${isDemo}`}
                  items={filtered}
                  raised={current.raised}
                  capaAllowed={capaAllowed}
                  docs={docs}
                  onRaise={raise}
                  onOpen={navigate}
                  say={say}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

interface ListProps {
  items: Insight[];
  raised: Map<string, RaisedCapa>;
  capaAllowed: boolean;
  docs: Map<string, DocumentDefinition>;
  onRaise: (insight: Insight) => void;
  onOpen: (route: string) => void;
  say: (key: string, english: string) => string;
}

// Remounted whenever the filters change (the parent's key), because the
// progressive count latches once complete (utils/useProgressive.ts).
function InsightList({ items, raised, capaAllowed, docs, onRaise, onOpen, say }: ListProps) {
  const shown = useProgressiveCount(items.length, 12, 20);
  return (
    <div className="flex flex-col gap-3" data-section="insights-list" data-count={items.length}>
      {items.slice(0, shown).map((insight) => (
        <InsightCard
          key={insight.id}
          insight={insight}
          raised={raised.get(insight.id)}
          capaAllowed={capaAllowed}
          docs={docs}
          onRaise={onRaise}
          onOpen={onOpen}
          say={say}
        />
      ))}
    </div>
  );
}

interface CardProps {
  insight: Insight;
  raised: RaisedCapa | undefined;
  capaAllowed: boolean;
  docs: Map<string, DocumentDefinition>;
  onRaise: (insight: Insight) => void;
  onOpen: (route: string) => void;
  say: (key: string, english: string) => string;
}

const InsightCard = memo(function InsightCard({ insight, raised, capaAllowed, docs, onRaise, onOpen, say }: CardProps) {
  const colour = SEVERITY_COLOUR[insight.severity];
  const doc = insight.documentId ? docs.get(insight.documentId) : undefined;
  const more = (insight.evidenceTotal ?? 0) - new Set(insight.evidence.map((e) => e.recordId)).size;
  const open = (route: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    onOpen(route);
  };
  const capaDoc = docs.get(CAPA_DOC_ID);

  return (
    <article
      className="card card-pad"
      style={{ borderLeft: `4px solid ${colour.fg}` }}
      data-insight={insight.id}
      data-rule={insight.rule}
      data-severity={insight.severity}
      data-module={insight.module}
    >
      <div className="flex items-start justify-between gap-3">
        <div style={{ minWidth: 0 }}>
          <div className="flex items-center gap-2 wrap text-xs text-muted">
            <span className="badge" style={{ background: colour.bg, color: colour.fg }}>
              {say(`insights.${insight.severity}`, SEVERITY_WORD[insight.severity])}
            </span>
            <span>{insight.module}</span>
            {doc ? <span>· {doc.formatNo && !doc.formatNo.startsWith("TO BE") ? doc.formatNo : doc.name}</span> : null}
            <span className="text-faint">· rule {insight.rule}</span>
          </div>
          <h3 className="mt-1" style={{ fontSize: 15, lineHeight: 1.35 }} data-field="insight-title">
            {insight.title}
          </h3>
        </div>
        {insight.metric ? (
          <div className="text-center" style={{ flex: "none", minWidth: 96 }} data-field="insight-metric">
            <div className="font-bold" style={{ fontSize: 18, lineHeight: 1.2 }}>
              {insight.metric.value}
            </div>
            <div className="text-xs text-muted">{insight.metric.label}</div>
          </div>
        ) : null}
      </div>

      <p className="mt-2 text-sm" data-field="insight-detail">
        {insight.detail}
      </p>

      {insight.chart ? <ReadingChart series={insight.chart} /> : null}

      {insight.evidence.length > 0 ? (
        <div className="mt-3 text-sm" data-section="insight-evidence">
          <span className="text-muted">{say("insights.readFrom", "Read from")}: </span>
          {insight.evidence.map((e, n) => {
            const edoc = docs.get(e.documentId);
            const route = routeForRecord(edoc, e.recordId);
            const label = `${edoc && !edoc.formatNo.startsWith("TO BE") ? edoc.formatNo : edoc?.name ?? e.documentId} · ${formatDisplayDate(e.dueDate)}${e.value ? ` · ${e.value}` : ""}`;
            return (
              <React.Fragment key={`${e.recordId}|${e.field ?? ""}|${n}`}>
                {n > 0 ? <span className="text-faint"> · </span> : null}
                <a href={`#${route}`} onClick={open(route)} data-evidence={e.recordId}>
                  {label}
                </a>
              </React.Fragment>
            );
          })}
          {more > 0 ? <span className="text-muted"> — and {more} more record{more === 1 ? "" : "s"}</span> : null}
        </div>
      ) : null}

      {insight.suggestedCapa && !raised && capaAllowed ? (
        <details className="mt-2 text-sm" data-section="insight-suggested-capa">
          <summary className="text-muted" style={{ cursor: "pointer" }}>
            {say("insights.whatCapaSays", "What the CAPA finding will say")}
          </summary>
          <div className="mt-1">
            <div>
              <strong>Finding:</strong> {insight.suggestedCapa.finding}
            </div>
            <div className="mt-1">
              <strong>Comments:</strong> {insight.suggestedCapa.comment}
            </div>
            <div className="mt-1">
              <strong>Corrective action:</strong> {insight.suggestedCapa.action}
            </div>
            <div className="mt-1 text-muted">Target date: 15 days from today. You can change any of it on the CAPA report before submitting.</div>
          </div>
        </details>
      ) : null}

      <div className="flex gap-2 wrap mt-3 items-center">
        {insight.route ? (
          <button type="button" className="btn btn-secondary btn-sm" data-action="open-insight" onClick={() => onOpen(insight.route as string)}>
            {say("insights.whereToLook", "Where to look")}
          </button>
        ) : null}
        {raised ? (
          <>
            <span className="badge badge-InProgress" data-state="capa-raised">
              {say("insights.capaRaised", "CAPA raised")}
              {raised.targetDate ? ` · target ${formatDisplayDate(raised.targetDate)}` : ""}
            </span>
            {capaDoc ? (
              <button type="button" className="btn btn-ghost btn-sm" data-action="open-capa" onClick={() => onOpen(routeForRecord(capaDoc, raised.recordId))}>
                {say("insights.openCapa", "Open the CAPA")}
              </button>
            ) : null}
          </>
        ) : insight.suggestedCapa && capaAllowed ? (
          <button type="button" className="btn btn-primary btn-sm" data-action="raise-capa" onClick={() => onRaise(insight)}>
            {say("insights.raiseCapa", "Raise CAPA")}
          </button>
        ) : null}
      </div>
    </article>
  );
});
