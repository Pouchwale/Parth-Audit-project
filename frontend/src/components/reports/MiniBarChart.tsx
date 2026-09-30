import React from "react";

// Dependency-free bar chart (no charting library available offline — see
// docs/DEPLOYMENT.md). Good enough for month-over-month trend reports.
export function MiniBarChart({ labels, values, color = "var(--color-primary)" }: { labels: string[]; values: number[]; color?: string }) {
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
            <div style={{ fontSize: 9.5, color: "var(--color-text-faint)", fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: 10, fontWeight: 700 }}>{v}</div>
          </div>
        );
      })}
    </div>
  );
}
