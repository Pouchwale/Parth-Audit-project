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
//   * below it, a bar chart of every year in the table side by side, JAN..DEC, a
//     no trend line (§249), y axis "Number or Quantity Trapped", x axis "Months";
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

/**
 * THE YEAR AND THE TWO BEFORE IT (REQUIREMENTS §250; the owner, 17-Nov-2026: "in trend analysis after year change for example
 * this 2026 year so after two months it will 2027 so trend analysis will come like current year and previous two year"):
 * a trend report's rows for `year` and the two years before it, oldest first - 2024, 2025, 2026 this year; 2025, 2026,
 * 2027 when 2027 comes. A year of the three with no row yet has one, blank, worded as the nearest year's.
 */
export function threeYears(rows: readonly TrendRow[], year: number): TrendRow[] {
  const out: TrendRow[] = [];
  for (let y = year - 2; y <= year; y++) {
    const own = rows.find((r) => r.year === y);
    if (own) {
      out.push(own);
      continue;
    }
    const near = rows.slice().sort((a, b) => Math.abs(a.year - y) - Math.abs(b.year - y))[0];
    out.push({ source: near?.source ?? "", unit: near?.unit ?? "", targetPest: near?.targetPest ?? "", year: y, months: Array(12).fill(null), fromRegister: Array(12).fill(false) });
  }
  return out;
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

/**
 * THE YEARS SIDE BY SIDE, MONTH BY MONTH (REQUIREMENTS §239; the owner, 16-Nov-2026, with the company's own trend charts -
 * 2024 in blue beside 2025 in red under JAN to DEC, each bar's figure over it, a trend line across: "in trend analysis do
 * make sure it will show with all year which are present in that like it will show bars in each month"). Every year of
 * the table above with a figure in it has its bar in every month it was reported (a 0 too, its figure on the baseline);
 * a month not yet reported has none. No trend line (the owner, 17-Nov-2026, REQUIREMENTS §249: "in trend analaysis remove
 * line from all three reports"): the bars alone, and the key of the years.
 */
const SERIES_FILL = ["#9999FF", "#C0504D", "#9BBB59", "#F79646", "#4BACC6", "#8064A2"];

export function CatchTrendChart({
  rows,
  yAxisLabel,
  xAxisLabel = "Months",
  unitWord,
  openMonth,
}: {
  /** A bar clicked opens its month's register (§242). */
  openMonth?: (year: number, month: number) => void;
  rows: TrendRow[];
  yAxisLabel: string;
  xAxisLabel?: string;
  unitWord: string;
}) {
  const series = rows
    .filter((r) => r.months.some((m) => m !== null))
    .slice()
    .sort((a, b) => a.year - b.year);
  const max = Math.max(0, ...series.flatMap((r) => r.months.map((m) => m ?? 0)));
  const { top, step } = axisFor(max);

  // Geometry (SVG user units; the SVG scales to its container).
  const W = 820;
  const H = 320;
  const left = 66;
  const right = 16;
  const topPad = 26;
  const bottom = 64;
  const plotW = W - left - right;
  const plotH = H - topPad - bottom;
  const slot = plotW / RODENT_REPORT_MONTHS.length;
  const n = Math.max(1, series.length);
  const barW = Math.min(30, (slot * 0.72) / n);
  const y = (v: number) => topPad + plotH - (v / top) * plotH;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  const centre = (i: number) => left + slot * i + slot / 2;

  const word = (r: TrendRow) => (r.unit && /gram/i.test(r.unit) ? "gramms" : unitWord);

  return (
    <div className="trend-chart" data-chart-years={series.map((r) => r.year).join(",")}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${yAxisLabel} by month, ${series.map((r) => r.year).join(" and ") || "no year reported yet"}`}>
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
        {RODENT_REPORT_MONTHS.map((label, i) => (
          <g key={label} className="month" data-month={i}>
            {series.map((r, k) => {
              const v = r.months[i];
              const x0 = centre(i) - (n * barW) / 2 + k * barW;
              const has = v !== null && v !== undefined;
              const h = has ? Math.max(0, topPad + plotH - y(v)) : 0;
              const yTop = topPad + plotH - h;
              return (
                <g key={r.year} className={`bar${openMonth ? " open-month" : ""}`} data-year={r.year} data-series={k} onClick={openMonth ? () => openMonth(r.year, i) : undefined}>
                  <rect x={x0} y={topPad} width={barW} height={plotH} className="hit">
                    <title>{has ? `${label} ${r.year}: ${v} ${word(r)}` : `${label} ${r.year}: not yet reported`}</title>
                  </rect>
                  {has && h > 0 && <rect x={x0} y={yTop} width={barW} height={h} className={`mark series-${k}`} style={{ fill: SERIES_FILL[k % SERIES_FILL.length] }} />}
                  {has && (
                    <text x={x0 + barW / 2} y={yTop - 5} className="value" textAnchor="middle">
                      {v}
                    </text>
                  )}
                </g>
              );
            })}
            <text x={centre(i)} y={topPad + plotH + 18} className="cat" textAnchor="middle">
              {label}
            </text>
          </g>
        ))}
        <text x={left + plotW / 2} y={H - 26} className="axis-title" textAnchor="middle">
          {xAxisLabel}
        </text>
        <text transform={`translate(16 ${topPad + plotH / 2}) rotate(-90)`} className="axis-title" textAnchor="middle">
          {yAxisLabel}
        </text>
        {/* Which colour is which year, under the months. */}
        <g className="legend">
          {series.map((r, k) => {
            const lx = left + plotW / 2 - (series.length * 70) / 2 + k * 70;
            return (
              <g key={r.year}>
                <rect x={lx} y={H - 14} width={11} height={11} className={`mark series-${k}`} style={{ fill: SERIES_FILL[k % SERIES_FILL.length] }} />
                <text x={lx + 16} y={H - 5} className="tick">
                  {r.year}
                </text>
              </g>
            );
          })}
        </g>
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
  openMonth,
}: {
  companyName: string;
  title: string;
  rows: TrendRow[];
  chartYear: number;
  yAxisLabel: string;
  unitWord: string;
  /** What the tinted cells were added up from, for the screen-only key. */
  registerName: string;
  /** A month clicked - its cell, or its bars - opens the register it is counted from, that month of that year (§242). */
  openMonth?: (year: number, month: number) => void;
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
    <div className="register-sheet trend-sheet" data-print-doc data-chart-year={drawnYear}>
      <section className="register-page">
        <div className="trend-head">
          {/* The company's registered name reads as issued in either language (REQUIREMENTS §58). */}
          <div className="company-name notranslate" translate="no">
            {companyName}
          </div>
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
                    {/* Transcribed from the provider's own report, so read as transcribed (REQUIREMENTS §58). */}
                    <td className="src-cell notranslate" translate="no">
                      {r.source}
                    </td>
                    <td className="notranslate" translate="no">
                      {r.unit}
                    </td>
                    <td className="notranslate" translate="no">
                      {r.targetPest}
                    </td>
                    <td className="year-cell">{r.year}</td>
                    {r.months.map((m, i) => (
                      <td
                        key={i}
                        data-month={i}
                        className={`${r.fromRegister[i] ? "from-register" : ""}${openMonth ? " open-month" : ""}`.trim()}
                        {...(openMonth
                          ? {
                              role: "button",
                              tabIndex: 0,
                              title: `Open ${RODENT_REPORT_MONTHS[i]} ${r.year} in the ${registerName}`,
                              onClick: () => openMonth(r.year, i),
                              onKeyDown: (e: React.KeyboardEvent) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  openMonth(r.year, i);
                                }
                              },
                            }
                          : {})}
                      >
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
        <CatchTrendChart openMonth={openMonth} rows={rows} yAxisLabel={yAxisLabel} unitWord={unitWord} />
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
