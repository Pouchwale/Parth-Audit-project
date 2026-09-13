import React from "react";
import { RODENT_REPORT_MONTHS } from "../../data/seed/pestPattern";
import { TREND_PREPARED_BY } from "../../data/seed/trendReports";

// THE COMPANY'S TREND REPORT FORMAT, reproduced. All three of the company's
// pest trend reports are laid out on this one page format — RODENT CATCH,
// LIZARD CATCH and FLIES CATCH REPORT AND TREND ANALYSIS ("GP-3 Trend
// Analysis - 2025.pdf", pages 1 to 3; also "trend analysis .pdf" and page 1 of
// "Kapila mam department reports .pdf"):
//   * a two-line header box — company name, report title (this report has no
//     Format No. row, so none is added);
//   * one table row per year: Source | Unit | Target Pest | YEAR | JAN..DEC |
//     Total, a month left blank until it has happened. Source, Unit and Target
//     Pest are printed per ROW, which is what lets the flies report carry its
//     reported "Gramms" years and a board-counted "Number" year on one page;
//   * below it, a bar chart of one year — JAN..DEC and Total, y axis "Number or
//     Quantity Trapped", x axis "Months";
//   * a "Report prepared by" signature line at the foot, blank to be signed,
//     as on every page of the company's file.
//
// What is added, screen-only (never printed): a light tint on the cells that
// were added up from the digital register rather than copied from the paper
// report, with a one-line key — so an auditor can always tell which figures the
// system computed and which it transcribed.

export interface TrendRow {
  source: string;
  unit: string;
  targetPest: string;
  year: number;
  /** Jan..Dec; null = blank on the sheet (not yet happened / not reported). */
  months: (number | null)[];
  /** Jan..Dec; true where the figure was added up from the digital register. */
  fromRegister: boolean[];
}

// The company prints the Total only once the year is complete: every 2024 row
// on its trend pages carries one, every part-reported 2025 row leaves it blank.
// So a year still being reported shows no total here either (REQUIREMENTS §41).
// The running figure for the current year is not lost — it is in the text beside
// the sheet on each report page.
export function rowTotal(months: (number | null)[]): number | null {
  if (months.some((m) => m === null)) return null;
  return (months as number[]).reduce((s, n) => s + n, 0);
}

// Axis steps that read naturally: the specimen's own 0-5 in halves for small
// counts, then 1 / 2 / 5 / 10 ... as the numbers grow (fly counts run to the
// hundreds a month).
const STEPS = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

function axisFor(max: number): { top: number; step: number } {
  if (max <= 5) return { top: 5, step: 0.5 };
  const step = STEPS.find((s) => max / s <= 10) ?? 1000;
  return { top: Math.ceil(max / step) * step, step };
}

const fmtTick = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function CatchTrendChart({
  row,
  yAxisLabel,
  xAxisLabel = "Months",
  unitWord,
}: {
  row: TrendRow;
  yAxisLabel: string;
  xAxisLabel?: string;
  unitWord: string;
}) {
  const total = rowTotal(row.months);
  // A row reported by weight says grams in its tooltip, not the report's
  // default word — the flies report carries both kinds of year.
  const word = row.unit && /gram/i.test(row.unit) ? "gramms" : unitWord;
  const bars = [
    ...RODENT_REPORT_MONTHS.map((label, i) => ({ label, value: row.months[i] })),
    { label: "Total", value: total },
  ];
  const max = Math.max(0, ...bars.map((b) => b.value ?? 0));
  const { top, step } = axisFor(max);

  // Geometry (SVG user units; the SVG scales to its container).
  const W = 820;
  const H = 300;
  const left = 66;
  const right = 16;
  const topPad = 22;
  const bottom = 58;
  const plotW = W - left - right;
  const plotH = H - topPad - bottom;
  const slot = plotW / bars.length;
  const barW = Math.min(30, slot * 0.46);
  const y = (v: number) => topPad + plotH - (v / top) * plotH;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);

  return (
    <div className="trend-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${yAxisLabel} by month, ${row.year}${total !== null ? `, total ${total}` : ""}`}>
        {/* y axis + ticks */}
        <line x1={left} y1={topPad} x2={left} y2={topPad + plotH} className="axis" />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left - 4} y1={y(t)} x2={left} y2={y(t)} className="axis" />
            <text x={left - 8} y={y(t) + 4} className="tick" textAnchor="end">
              {fmtTick(t)}
            </text>
          </g>
        ))}
        {/* baseline */}
        <line x1={left} y1={topPad + plotH} x2={W - right} y2={topPad + plotH} className="axis" />
        {bars.map((b, i) => {
          const cx = left + slot * i + slot / 2;
          const has = b.value !== null;
          const v = b.value ?? 0;
          const h = Math.max(0, topPad + plotH - y(v));
          const r = Math.min(3, h / 2);
          const x0 = cx - barW / 2;
          const yTop = topPad + plotH - h;
          // Rounded top, square foot on the baseline.
          const path =
            h > 0
              ? `M${x0},${topPad + plotH} L${x0},${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} L${x0 + barW - r},${yTop} Q${x0 + barW},${yTop} ${x0 + barW},${yTop + r} L${x0 + barW},${topPad + plotH} Z`
              : "";
          return (
            <g key={b.label} className={`bar${b.label === "Total" ? " total" : ""}`}>
              {/* generous, invisible hit target for the tooltip */}
              <rect x={cx - slot / 2} y={topPad} width={slot} height={plotH} className="hit">
                <title>{has ? `${b.label} ${row.year}: ${v} ${word}` : `${b.label} ${row.year}: not yet recorded`}</title>
              </rect>
              {path && <path d={path} className="mark" />}
              {has && (
                <text x={cx} y={yTop - 6} className="value" textAnchor="middle">
                  {v}
                </text>
              )}
              <text x={cx} y={topPad + plotH + 18} className="cat" textAnchor="middle">
                {b.label}
              </text>
            </g>
          );
        })}
        <text x={left + plotW / 2} y={H - 10} className="axis-title" textAnchor="middle">
          {xAxisLabel}
        </text>
        <text transform={`translate(16 ${topPad + plotH / 2}) rotate(-90)`} className="axis-title" textAnchor="middle">
          {yAxisLabel}
        </text>
      </svg>
    </div>
  );
}

export function CatchTrendSheet({
  companyName,
  title,
  rows,
  chartYear,
  yAxisLabel,
  unitWord,
  registerName,
  footnote,
}: {
  companyName: string;
  title: string;
  rows: TrendRow[];
  chartYear: number;
  yAxisLabel: string;
  unitWord: string;
  /** What the tinted cells were added up from, for the screen-only key. */
  registerName: string;
  footnote?: string;
}) {
  // The year asked for, else the most recent year there are figures for. A year
  // with no row at all — and, since 13-Sep-2026, a row whose twelve cells are
  // all still empty — used to draw a chart of bare axes and caption it with
  // that year (REQUIREMENTS §39). The footnote names the year actually drawn,
  // so the chart and the caption can never disagree.
  const hasFigures = (r: TrendRow) => r.months.some((m) => m !== null);
  const chartRow =
    rows.find((r) => r.year === chartYear && hasFigures(r)) ??
    rows.filter(hasFigures).slice(-1)[0] ??
    rows.find((r) => r.year === chartYear) ??
    rows[rows.length - 1] ??
    ({ source: "", unit: "", targetPest: "", year: chartYear, months: Array(12).fill(null), fromRegister: Array(12).fill(false) } satisfies TrendRow);
  const drawnYear = chartRow.year;
  const anyFromRegister = rows.some((r) => r.fromRegister.some(Boolean));
  const anyTranscribed = rows.some((r) => r.months.some((m, i) => m !== null && !r.fromRegister[i]));

  return (
    // data-chart-year: which row the chart is drawing — on the sheet so the
    // caption and the bars can never disagree, and so a test can prove the
    // bars follow the data rather than a picture.
    <div className="register-sheet trend-sheet notranslate" translate="no" data-print-doc data-chart-year={drawnYear}>
      <section className="register-page">
        <div className="trend-head">
          <div className="company-name">{companyName}</div>
          <div className="doc-title">{title}</div>
        </div>
        <div className="doc-table register-grid-wrap">
          <table className="register-grid trend-table">
            <thead>
              <tr>
                <th className="src-head">Source</th>
                <th>Unit</th>
                <th>Target Pest</th>
                <th>YEAR</th>
                {RODENT_REPORT_MONTHS.map((m) => (
                  <th key={m}>{m}</th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const total = rowTotal(r.months);
                return (
                  <tr key={r.year} data-year={r.year}>
                    <td className="src-cell">{r.source}</td>
                    <td>{r.unit}</td>
                    <td>{r.targetPest}</td>
                    <td className="year-cell">{r.year}</td>
                    {r.months.map((m, i) => (
                      <td key={i} data-month={i} className={r.fromRegister[i] ? "from-register" : ""}>
                        {m ?? ""}
                      </td>
                    ))}
                    <td className="total-cell">{total ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <CatchTrendChart row={chartRow} yAxisLabel={yAxisLabel} unitWord={unitWord} />
        {/* The signature line every page of the company's file carries. Left
            blank on purpose: the system does not sign a report for anybody
            (REQUIREMENTS §41). */}
        <div className="trend-signature">
          <span className="sig-line" />
          <span className="sig-label">{TREND_PREPARED_BY}</span>
        </div>
      </section>
      <div className="text-xs text-faint mt-2 no-print">
        {anyFromRegister && (
          <>
            <span className="trend-key from-register" /> Tinted figures are added up from the {registerName}
            {anyTranscribed ? "; the others are as reported on the company's paper report" : ""}.{" "}
          </>
        )}
        A month stays blank until it has happened, as on the paper report. The chart shows {drawnYear}
        {drawnYear !== chartYear ? ` (there are no figures for ${chartYear} yet)` : ""}.{footnote ? ` ${footnote}` : ""} The tint does not print.
      </div>
    </div>
  );
}
