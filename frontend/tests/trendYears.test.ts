// THE TREND CHARTS: EVERY YEAR SIDE BY SIDE, MONTH BY MONTH, A TREND LINE ACROSS (REQUIREMENTS §239; the owner, 16-Nov-2026,
// with the company's 2024 / 2025 charts: "it will show with all year which are present in that like it will show bars in
// each month"). Run: npm run test:unit -- trendYears
import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import { CatchTrendChart, CatchTrendSheet, type TrendRow } from "../src/components/reports/CatchTrendSheet";

const row = (year: number, months: (number | null)[]): TrendRow => ({ source: "Collected in EFKs", unit: "Gramms", targetPest: "Flies", year, months, fromRegister: Array(12).fill(false) });
const FLIES_2024 = row(2024, [30, 22, 22, 16, 15, 17, 15, 13, 22, 24, 22, 17]);
const FLIES_2025 = row(2025, [25, 23, 21, 30, 23, 23, 26, 23, 23, 29, null, null]);
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

test("every year with figures has its bar in each month it was reported, its figure over it; a month not reported has none", () => {
  const html = renderToStaticMarkup(h(CatchTrendChart, { rows: [FLIES_2025, FLIES_2024, row(2026, Array(12).fill(null))], yAxisLabel: "Number or Quantity Trapped", unitWord: "gramms" }));
  assert.match(html, /data-chart-years="2024,2025"/, "both years, oldest first; a year with nothing reported is left out");
  assert.equal(count(html, /class="mark series-0"/g), 12 + 1, "2024's twelve bars (and its legend swatch)");
  assert.equal(count(html, /class="mark series-1"/g), 10 + 1, "2025's ten reported months (and its swatch)");
  assert.match(html, /fill:#9999FF/, "the earlier year blue");
  assert.match(html, /fill:#C0504D/, "the later year red");
  assert.equal(count(html, /class="value"/g), 22, "a figure over every bar");
  assert.ok(!/>Total</.test(html), "the months only: the Total stays in the table");
});

test("no trend line on any of the three charts, nor its word in the key (§249)", () => {
  const html = renderToStaticMarkup(h(CatchTrendChart, { rows: [FLIES_2024, FLIES_2025], yAxisLabel: "y", unitWord: "gramms" }));
  assert.ok(!/trend-line/.test(html), "no line");
  assert.ok(!/Trend 20/.test(html), "no 'Trend 2024' in the key");
  assert.match(html, />2024</);
  assert.match(html, />2025</, "the key names the years");
});

test("the sheet draws every year's bars", () => {
  const html = renderToStaticMarkup(h(CatchTrendSheet, { companyName: "GUJARAT PRINT PACK PUBLICATIONS PVT LTD", title: "FLIES CATCH REPORT AND TREND ANALYSIS", rows: [FLIES_2024, FLIES_2025], chartYear: 2025, yAxisLabel: "Number or Quantity Trapped", unitWord: "gramms", registerName: "F/HR/18" }));
  assert.match(html, /data-chart-years="2024,2025"/);
  assert.ok(!/data-trend-year/.test(html), "no trend line on the sheet either (§249)");
});

test("printed, the chart has a height of its own, so the trend page fits one A4 page with its signature (§241)", async () => {
  const { readFileSync } = await import("node:fs");
  const path = await import("node:path");
  const css = readFileSync(path.join(process.env.DCRS_REPO_ROOT ?? process.cwd(), "frontend", "src", "styles.css"), "utf8");
  assert.match(css, /\.trend-sheet \.trend-chart svg \{ width: 100%; height: 92mm; \}/);
  assert.match(css, /\.trend-sheet \.trend-signature \{ break-inside: avoid; break-before: avoid; \}/);
});
