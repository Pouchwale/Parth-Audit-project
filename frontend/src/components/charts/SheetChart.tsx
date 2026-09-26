import React, { useMemo } from "react";
import type { LogSheetChart, LogSheetData } from "../../types";

// THE CHARTS A FORM PRINTS FROM ITS OWN FIGURES (REQUIREMENTS §77).
//
// The Customer Complaints Trend Analysis (F/MKT/04) prints a bar chart of the
// complaints of each year beside the table of them, and a Pareto chart of the
// causes — bars in the order written, the cumulative percentage over them and
// the 80% cut-off line, the "Vital Few" causes within it drawn darker than
// the "Useful Many" after it. Both are drawn here from the record's own boxes
// and lines, so they say exactly what the figures say and print with the
// sheet; nothing is pasted in and nothing is stored.
//
// Drawn as the rodent trend sheet draws its chart (components/reports/
// CatchTrendSheet.tsx): plain SVG, the same .trend-chart classes, no library,
// a few dozen coordinates memoised on the figures. Every bar carries its value
// as a tooltip and the figures themselves are on the sheet above the chart.

const W = 820;

/** A whole-number axis top and step that the figures fit under: 0..5 by 1, 0..20 by 5, 0..100 by 20. */
function axisFor(max: number): { top: number; step: number } {
  if (!(max > 0)) return { top: 1, step: 1 };
  const raw = max / 5;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  return { top: Math.max(step, Math.ceil(max / step) * step), step };
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const roundedBar = (x0: number, yTop: number, w: number, base: number): string => {
  const h = base - yTop;
  if (!(h > 0)) return "";
  const r = Math.min(3, h / 2);
  return `M${x0},${base} L${x0},${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} L${x0 + w - r},${yTop} Q${x0 + w},${yTop} ${x0 + w},${yTop + r} L${x0 + w},${base} Z`;
};

export function SheetChart({ chart, data }: { chart: LogSheetChart; data: LogSheetData }) {
  return chart.kind === "bars" ? <BarsChart chart={chart} data={data} /> : <ParetoChart chart={chart} data={data} />;
}

function BarsChart({ chart, data }: { chart: Extract<LogSheetChart, { kind: "bars" }>; data: LogSheetData }) {
  const header = data.header ?? {};
  const bars = useMemo(
    () =>
      chart.bars
        .map((b) => ({ label: String(header[b.labelKey] ?? "").trim(), value: num(header[b.valueKey]) }))
        .filter((b) => b.label !== "" && b.value !== null) as { label: string; value: number }[],
    [chart.bars, header]
  );
  if (bars.length === 0) return null;
  const max = Math.max(0, ...bars.map((b) => b.value));
  const { top, step } = axisFor(max);
  const H = 300;
  const left = 66;
  const right = 16;
  const topPad = 40;
  const bottom = 58;
  const plotW = W - left - right;
  const plotH = H - topPad - bottom;
  const slot = plotW / bars.length;
  const barW = Math.min(46, slot * 0.46);
  const base = topPad + plotH;
  const y = (v: number) => base - (v / top) * plotH;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  const summary = bars.map((b) => `${b.label} ${b.value}`).join(", ");
  return (
    <figure className="trend-chart" data-chart="bars" style={{ margin: "14px 0 0" }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${chart.title}: ${summary}`}>
        <text x={left + plotW / 2} y={20} className="chart-title" textAnchor="middle">
          {chart.title}
        </text>
        <line x1={left} y1={topPad} x2={left} y2={base} className="axis" />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left - 4} y1={y(t)} x2={left} y2={y(t)} className="axis" />
            <text x={left - 8} y={y(t) + 4} className="tick" textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        <line x1={left} y1={base} x2={W - right} y2={base} className="axis" />
        {bars.map((b, i) => {
          const cx = left + slot * i + slot / 2;
          const yTop = y(b.value);
          const path = roundedBar(cx - barW / 2, yTop, barW, base);
          return (
            <g key={`${b.label}-${i}`} className="bar">
              <rect x={cx - slot / 2} y={topPad} width={slot} height={plotH} className="hit">
                <title>{`${b.label}: ${b.value}`}</title>
              </rect>
              {path && <path d={path} className="mark" />}
              <text x={cx} y={yTop - 6} className="value" textAnchor="middle">
                {b.value}
              </text>
              <text x={cx} y={base + 18} className="cat" textAnchor="middle">
                {b.label}
              </text>
            </g>
          );
        })}
        {chart.xAxisLabel && (
          <text x={left + plotW / 2} y={H - 10} className="axis-title" textAnchor="middle">
            {chart.xAxisLabel}
          </text>
        )}
        {chart.yAxisLabel && (
          <text transform={`translate(16 ${topPad + plotH / 2}) rotate(-90)`} className="axis-title" textAnchor="middle">
            {chart.yAxisLabel}
          </text>
        )}
      </svg>
      <figcaption className="text-xs text-muted mt-1">
        {chart.title} — {summary}.
      </figcaption>
    </figure>
  );
}

/** The cumulative share of each cause, in the order written, and whether it is within the cut-off (engine/marketingCalc.ts applies the same rule to the sheet). */
export function paretoSeries(rows: { label: string; value: number }[], cutoffPct: number): { label: string; value: number; cumulative: number; vital: boolean }[] {
  const total = rows.reduce((n, r) => n + r.value, 0);
  let running = 0;
  return rows.map((r) => {
    running += r.value;
    const cumulative = total > 0 ? (running / total) * 100 : 0;
    return { ...r, cumulative, vital: cumulative <= cutoffPct + 1e-9 };
  });
}

function ParetoChart({ chart, data }: { chart: Extract<LogSheetChart, { kind: "pareto" }>; data: LogSheetData }) {
  const header = data.header ?? {};
  const cutoff = (chart.cutoffKey && num(header[chart.cutoffKey])) || 80;
  const series = useMemo(() => {
    const rows = (data.rows ?? [])
      .map((r) => ({ label: String(r[chart.labelColumn] ?? "").trim(), value: num(r[chart.valueColumn]) }))
      .filter((r) => r.label !== "" && r.value !== null && (r.value as number) > 0) as { label: string; value: number }[];
    return paretoSeries(rows, cutoff);
  }, [data.rows, chart.labelColumn, chart.valueColumn, cutoff]);
  if (series.length === 0) return null;
  const title = `${chart.title}${chart.titleKey ? ` ${String(header[chart.titleKey] ?? "").trim()}` : ""}`.trim();
  const max = Math.max(0, ...series.map((s) => s.value));
  const { top, step } = axisFor(max);
  const H = 360;
  const left = 66;
  const right = 70;
  const topPad = 40;
  const bottom = 64;
  const plotW = W - left - right;
  const plotH = H - topPad - bottom;
  const slot = plotW / series.length;
  const barW = Math.min(54, slot * 0.6);
  const base = topPad + plotH;
  const y = (v: number) => base - (v / top) * plotH;
  const yPct = (p: number) => base - (p / 100) * plotH;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  const line = series.map((s, i) => `${(left + slot * i + slot / 2).toFixed(1)},${yPct(s.cumulative).toFixed(1)}`).join(" ");
  const vital = series.filter((s) => s.vital).length;
  const total = series.reduce((n, s) => n + s.value, 0);
  const summary = `${series.length} causes, ${total} defects; the first ${vital} within the ${cutoff}% cut-off`;
  return (
    <figure className="trend-chart" data-chart="pareto" style={{ margin: "14px 0 0" }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${summary}`}>
        <text x={left + plotW / 2} y={20} className="chart-title" textAnchor="middle">
          {title}
        </text>
        <line x1={left} y1={topPad} x2={left} y2={base} className="axis" />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left - 4} y1={y(t)} x2={left} y2={y(t)} className="axis" />
            <text x={left - 8} y={y(t) + 4} className="tick" textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {/* The cumulative axis, on the right: 0% to 100%. */}
        <line x1={W - right} y1={topPad} x2={W - right} y2={base} className="axis" />
        {[0, 20, 40, 60, 80, 100].map((p) => (
          <g key={p}>
            <line x1={W - right} y1={yPct(p)} x2={W - right + 4} y2={yPct(p)} className="axis" />
            <text x={W - right + 8} y={yPct(p) + 4} className="tick">
              {p}%
            </text>
          </g>
        ))}
        <line x1={left} y1={base} x2={W - right} y2={base} className="axis" />
        <line x1={left} y1={yPct(cutoff)} x2={W - right} y2={yPct(cutoff)} className="cutoff" data-cutoff={cutoff} />
        {series.map((s, i) => {
          const cx = left + slot * i + slot / 2;
          const yTop = y(s.value);
          const path = roundedBar(cx - barW / 2, yTop, barW, base);
          const label = s.label.length > 34 ? `${s.label.slice(0, 33)}…` : s.label;
          return (
            <g key={`${s.label}-${i}`} className={`bar ${s.vital ? "vital" : "useful"}`} data-vital={s.vital ? "true" : "false"}>
              <rect x={cx - slot / 2} y={topPad} width={slot} height={plotH} className="hit">
                <title>{`${s.label}: ${s.value} (${s.cumulative.toFixed(1)}% cumulative — ${s.vital ? "Vital Few" : "Useful Many"})`}</title>
              </rect>
              {path && <path d={path} className="mark" />}
              <text x={cx} y={yTop - 6} className="value" textAnchor="middle">
                {s.value}
              </text>
              {/* The cause's name, written up the bar as the paper writes it. */}
              <text transform={`translate(${cx + 4} ${base - 6}) rotate(-90)`} className="cat rotated" textAnchor="start">
                {label}
              </text>
            </g>
          );
        })}
        <polyline points={line} className="cumulative" />
        {series.map((s, i) => (
          <circle key={i} cx={left + slot * i + slot / 2} cy={yPct(s.cumulative)} r={3.5} className="cumulative-dot">
            <title>{`${s.label}: ${s.cumulative.toFixed(1)}% cumulative`}</title>
          </circle>
        ))}
        {/* The legend the paper prints under its chart. */}
        <g transform={`translate(${left} ${H - 22})`} className="legend">
          <rect x={0} y={-8} width={22} height={9} className="mark" />
          <text x={28} y={0}>
            Vital Few
          </text>
          <rect x={110} y={-8} width={22} height={9} className="mark useful-swatch" />
          <text x={138} y={0}>
            Useful Many
          </text>
          <line x1={240} y1={-4} x2={262} y2={-4} className="cumulative" />
          <text x={268} y={0}>
            Cumulative%
          </text>
          <line x1={370} y1={-4} x2={392} y2={-4} className="cutoff" />
          <text x={398} y={0}>
            Cut Off %
          </text>
        </g>
        {chart.xAxisLabel && (
          <text x={left + plotW / 2} y={H - 4} className="axis-title" textAnchor="middle">
            {chart.xAxisLabel}
          </text>
        )}
        {chart.yAxisLabel && (
          <text transform={`translate(16 ${topPad + plotH / 2}) rotate(-90)`} className="axis-title" textAnchor="middle">
            {chart.yAxisLabel}
          </text>
        )}
        <text transform={`translate(${W - 10} ${topPad + plotH / 2}) rotate(90)`} className="axis-title" textAnchor="middle">
          Cumulative %
        </text>
      </svg>
      <figcaption className="text-xs text-muted mt-1">
        {title} — {summary}.
      </figcaption>
    </figure>
  );
}
