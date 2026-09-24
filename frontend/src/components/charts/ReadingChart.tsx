import React, { useId, useMemo, useState } from "react";

// A READING AGAINST ITS BAND, DRAWN (REQUIREMENTS §75).
//
// The Insights page shows a day's readings — F-QC-30's 24 hourly viscosities,
// F-QC-40.C's six hot-room temperatures — beside the insight that was read from
// them, so a shift or an excursion can be SEEN rather than taken on trust. The
// Reports page's MiniBarChart draws bars from zero, which flattens a 20 ± 1
// band into nothing; this is a line on the band's own scale.
//
// What is drawn, and why:
//   - the printed band: Max and Min as solid danger-coloured lines, Nominal as
//     a faint line between them, each named at the right-hand end with its value;
//   - nominal ± 2σ as a pale wash, when the early-warning rule used a σ — the
//     zone a reading must leave, twice in three, to raise that warning;
//   - the readings as a 2px line with a dot per reading; a reading outside the
//     band is a larger dot in the same warning colours a sheet uses to
//     highlight that cell (.cell-out-of-band: --color-warning, --color-warning-bg),
//     so the chart and the sheet say "out of band" the same way.
// One series, so no legend box: the title says what it is. Every dot carries its
// value as a tooltip, and "Show the readings" lists them as a table for anyone
// who cannot read the picture.
//
// No chart library (none is available offline) and no work while drawing
// beyond a few dozen coordinates, memoised on the points.

export interface ReadingSeries {
  title: string;
  unit?: string;
  nominal?: number;
  min?: number;
  max?: number;
  sigma?: number;
  points: { x: string; y: number }[];
}

const W = 640;
const H = 210;
const PAD = { left: 12, right: 104, top: 14, bottom: 30 };

const fmt = (n: number) => String(Math.round(n * 100) / 100);

export function ReadingChart({ series, height = H }: { series: ReadingSeries; height?: number }) {
  const titleId = useId();
  const [showTable, setShowTable] = useState(false);
  const { points, unit, nominal, min, max, sigma } = series;

  const geo = useMemo(() => {
    const ys = points.map((p) => p.y);
    const refs = [min, max, nominal, nominal !== undefined && sigma ? nominal + 2 * sigma : undefined, nominal !== undefined && sigma ? nominal - 2 * sigma : undefined].filter(
      (v): v is number => typeof v === "number"
    );
    let lo = Math.min(...ys, ...refs);
    let hi = Math.max(...ys, ...refs);
    if (!(hi > lo)) {
      hi += 1;
      lo -= 1;
    }
    const margin = (hi - lo) * 0.08;
    lo -= margin;
    hi += margin;
    const plotW = W - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * plotH;
    const isOut = (v: number) => (min !== undefined && v < min) || (max !== undefined && v > max);
    // At most about eight labels along the bottom, always the first and last.
    const every = Math.max(1, Math.ceil(points.length / 8));
    const xLabels = points.map((p, i) => ({ i, label: p.x })).filter(({ i }) => i % every === 0 || i === points.length - 1);
    return { x, y, isOut, xLabels, plotW, right: W - PAD.right };
  }, [points, min, max, nominal, sigma, height]);

  if (points.length === 0) return null;
  const { x, y, isOut, xLabels, right } = geo;
  const outCount = points.filter((p) => isOut(p.y)).length;
  const u = unit ? ` ${unit}` : "";
  const summary = `${points.length} readings${min !== undefined && max !== undefined ? `, band ${min}–${max}${u}` : ""}${outCount ? `, ${outCount} outside it` : ", all inside the band"}.`;
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ");

  // Reference lines named at the right-hand end. Kept apart so two close
  // values (a narrow band) never print on top of each other.
  // The +2σ edge of the wash is named too, but draws no line of its own.
  type Ref = { v: number; label: string; strong: boolean; line: boolean };
  const refs: Ref[] = [];
  if (max !== undefined) refs.push({ v: max, label: `Max ${fmt(max)}`, strong: true, line: true });
  if (nominal !== undefined && sigma) refs.push({ v: nominal + 2 * sigma, label: `+2σ ${fmt(nominal + 2 * sigma)}`, strong: false, line: false });
  if (nominal !== undefined) refs.push({ v: nominal, label: `Nominal ${fmt(nominal)}`, strong: false, line: true });
  if (min !== undefined) refs.push({ v: min, label: `Min ${fmt(min)}`, strong: true, line: true });
  const placed: (Ref & { at: number })[] = [];
  for (const r of [...refs].sort((a, b) => y(a.v) - y(b.v))) {
    const prev = placed[placed.length - 1];
    const at = prev && y(r.v) + 4 - prev.at < 12 ? prev.at + 12 : y(r.v) + 4;
    placed.push({ ...r, at });
  }

  return (
    <figure className="reading-chart" style={{ margin: "12px 0 0" }} data-chart="readings">
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-labelledby={titleId} style={{ display: "block", maxWidth: W, height: "auto", overflow: "visible" }}>
        <title id={titleId}>{`${series.title}: ${summary}`}</title>

        {nominal !== undefined && sigma ? (
          <rect
            x={PAD.left}
            width={right - PAD.left}
            y={y(nominal + 2 * sigma)}
            height={Math.max(0, y(nominal - 2 * sigma) - y(nominal + 2 * sigma))}
            style={{ fill: "var(--color-info)", opacity: 0.09 }}
          />
        ) : null}

        {placed.map((r) => (
          <g key={r.label}>
            {r.line ? (
              <line
                x1={PAD.left}
                x2={right}
                y1={y(r.v)}
                y2={y(r.v)}
                style={{ stroke: r.strong ? "var(--color-danger)" : "var(--color-text-faint)", strokeWidth: 1, opacity: r.strong ? 0.75 : 1 }}
              />
            ) : null}
            <text x={right + 10} y={r.at} style={{ fill: r.line ? "var(--color-text-muted)" : "var(--color-text-faint)", fontSize: r.line ? 11 : 10 }}>
              {r.label}
            </text>
          </g>
        ))}

        <line x1={PAD.left} x2={right} y1={height - PAD.bottom} y2={height - PAD.bottom} style={{ stroke: "var(--color-border)", strokeWidth: 1 }} />
        {xLabels.map(({ i, label }) => (
          <text key={i} x={x(i)} y={height - PAD.bottom + 16} textAnchor="middle" style={{ fill: "var(--color-text-muted)", fontSize: 10 }}>
            {label}
          </text>
        ))}

        {points.length > 1 ? (
          <polyline points={line} style={{ fill: "none", stroke: "var(--color-primary)", strokeWidth: 2, strokeLinejoin: "round", strokeLinecap: "round" }} />
        ) : null}

        {points.map((p, i) => {
          const out = isOut(p.y);
          return (
            <g key={i} data-out-of-band={out ? "true" : undefined}>
              {out ? <circle cx={x(i)} cy={y(p.y)} r={9} style={{ fill: "var(--color-warning-bg)" }} /> : null}
              <circle
                cx={x(i)}
                cy={y(p.y)}
                r={out ? 5 : 4}
                style={{ fill: out ? "var(--color-warning)" : "var(--color-primary)", stroke: "var(--color-surface)", strokeWidth: 2 }}
              >
                <title>{`${p.x}: ${fmt(p.y)}${u}${out ? (max !== undefined && p.y > max ? ` — above Max ${fmt(max)}` : ` — below Min ${fmt(min as number)}`) : ""}`}</title>
              </circle>
            </g>
          );
        })}
      </svg>
      <figcaption className="text-xs text-muted mt-1 flex items-center gap-2 wrap">
        <span>
          {series.title} — {summary}
          {sigma ? ` Shaded: nominal ± 2σ (σ ≈ ${fmt(sigma)}${u}).` : ""}
        </span>
        <button type="button" className="btn btn-ghost btn-sm" data-action="toggle-readings" onClick={() => setShowTable((v) => !v)}>
          {showTable ? "Hide the readings" : "Show the readings"}
        </button>
      </figcaption>
      {showTable ? (
        <table className="text-sm mt-1" style={{ maxWidth: 360 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>At</th>
              <th style={{ textAlign: "right" }}>Reading{u}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={i} className={isOut(p.y) ? "cell-out-of-band" : ""}>
                <td>{p.x}</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(p.y)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </figure>
  );
}
