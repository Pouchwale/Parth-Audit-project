import React from "react";

// Dependency-free bar chart (no charting library available offline — see
// docs/DEPLOYMENT.md). Good enough for month-over-month trend reports.
// Bars in the theme's first chart colour unless told otherwise; the label and the
// figure under each bar are sized by styles.css (.mini-bar-label, .mini-bar-value):
// 11 px on screen, and on paper the sizes they always printed at (REQUIREMENTS §90).
export function MiniBarChart({ labels, values, color = "var(--chart-1)" }: { labels: string[]; values: number[]; color?: string }) {
  const max = Math.max(1, ...values);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 140, padding: "8px 4px" }}>
      {labels.map((label, i) => {
        const v = values[i] ?? 0;
        const heightPct = (v / max) * 100;
        return (
          <div key={label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%" }}>
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
              <div
                title={`${label}: ${v}`}
                style={{
                  width: "100%",
                  height: `${Math.max(heightPct, v > 0 ? 3 : 0)}%`,
                  background: color,
                  borderRadius: "3px 3px 0 0",
                  minHeight: v > 0 ? 3 : 0,
                }}
              />
            </div>
            <div className="mini-bar-label">{label}</div>
            <div className="mini-bar-value">{v}</div>
          </div>
        );
      })}
    </div>
  );
}
