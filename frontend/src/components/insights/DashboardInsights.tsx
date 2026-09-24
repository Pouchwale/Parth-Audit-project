import React, { useEffect, useState } from "react";
import { FiArrowRight, FiTrendingUp } from "react-icons/fi";
import { useAppStore } from "../../store/AppStore";
import { useRouter } from "../../store/router";
import { insightCounts, startInsights, type Insight, type InsightSeverity } from "../../engine/insights";
import { currentInsightInput } from "../../engine/insightsInput";
import { useT } from "../../i18n";

// THE DASHBOARD'S LOOK AT THE INSIGHTS (REQUIREMENTS §75): the three that
// matter most — high first, then medium — and how many there are, with a link
// to the Insights page, where each one lists the records it was read from and
// can be raised as a CAPA. Low insights (a summary, a missing location) are
// counted but never put on the Dashboard, and when there is nothing high or
// medium the card is not drawn at all: the Dashboard is for what needs doing.
//
// SPEED (REQUIREMENTS §56): nothing is worked out while the Dashboard draws. The
// insights are worked out after it has painted, in slices of about 8 ms with the
// browser free between them, and again two seconds after a save; a hidden tab
// waits until it is looked at. It is its own component so its result redraws
// this card only, never the Dashboard around it.

const FIRST_RUN_AFTER_MS = 300;
const RECOMPUTE_AFTER_MS = 2000;
const SHOWN = 3;

const BADGE: Record<InsightSeverity, { fg: string; bg: string; word: string }> = {
  high: { fg: "var(--color-danger)", bg: "var(--color-danger-bg)", word: "High" },
  medium: { fg: "var(--color-warning)", bg: "var(--color-warning-bg)", word: "Medium" },
  low: { fg: "var(--color-neutral)", bg: "var(--color-neutral-bg)", word: "Low" },
};

interface Shown {
  isDemo: boolean;
  top: Insight[];
  counts: Record<InsightSeverity, number>;
}

export function DashboardInsights() {
  const { mode, version } = useAppStore();
  const { navigate } = useRouter();
  const t = useT();
  const isDemo = mode === "demo";
  const [shown, setShown] = useState<Shown | null>(null);
  const [ranOnce, setRanOnce] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let onVisible: (() => void) | null = null;
    const run = () => {
      if (cancelled) return;
      if (document.hidden) {
        onVisible = () => {
          if (document.hidden) return;
          document.removeEventListener("visibilitychange", onVisible as () => void);
          onVisible = null;
          run();
        };
        document.addEventListener("visibilitychange", onVisible);
        return;
      }
      const engine = startInsights(currentInsightInput(isDemo));
      const slice = () => {
        if (cancelled) return;
        const insights = engine.step(8);
        if (!insights) {
          timer = window.setTimeout(slice, 0);
          return;
        }
        setRanOnce(true);
        setShown({ isDemo, top: insights.filter((i) => i.severity !== "low").slice(0, SHOWN), counts: insightCounts(insights) });
      };
      slice();
    };
    timer = window.setTimeout(run, ranOnce ? RECOMPUTE_AFTER_MS : FIRST_RUN_AFTER_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (onVisible) document.removeEventListener("visibilitychange", onVisible);
    };
    // ranOnce only chooses the delay; it must not start a run of its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo, version]);

  const current = shown && shown.isDemo === isDemo ? shown : null;
  if (!current || current.top.length === 0) return null;
  const { counts } = current;
  const say = (key: string, english: string) => {
    const s = t(key);
    return s === key.split(".").pop() ? english : s;
  };
  const tally = (["high", "medium", "low"] as InsightSeverity[])
    .filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${say(`insights.${s}`, BADGE[s].word).toLowerCase()}`)
    .join(" · ");

  return (
    <div
      className="card mb-6"
      data-section="dashboard-insights"
      data-high={counts.high}
      data-medium={counts.medium}
      data-low={counts.low}
      style={{ borderLeft: `4px solid ${BADGE[current.top[0].severity].fg}` }}
    >
      <div className="card-pad">
        <div className="flex items-center justify-between gap-3 wrap mb-2">
          <div className="flex items-center gap-2">
            <FiTrendingUp size={16} style={{ color: "var(--color-primary)" }} />
            <span className="font-semibold">{say("insights.dashboardTitle", "What the records show")}</span>
            <span className="text-sm text-muted">{tally}</span>
          </div>
          <button className="btn btn-secondary btn-sm" data-action="open-insights" onClick={() => navigate("/insights")}>
            {say("insights.seeAll", "See all insights")} <FiArrowRight size={12} />
          </button>
        </div>
        {current.top.map((insight) => {
          const badge = BADGE[insight.severity];
          return (
            <div key={insight.id} className="flex items-center gap-2 text-sm" style={{ padding: "4px 0" }} data-insight={insight.id}>
              <span
                className="badge"
                style={{ color: badge.fg, background: badge.bg, flexShrink: 0, minWidth: 58, textAlign: "center" }}
              >
                {say(`insights.${insight.severity}`, badge.word)}
              </span>
              <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{insight.title}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
