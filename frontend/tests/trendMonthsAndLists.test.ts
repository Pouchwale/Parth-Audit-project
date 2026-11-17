// A TREND'S MONTH OPENS ITS REGISTER; EVERY LIST OF RECORDS CENTRED; F/HR/17'S FIRST PAGE A RULED FORM (REQUIREMENTS §242,
// §243). Run: npm run test:unit -- trendMonthsAndLists
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import { CatchTrendSheet, type TrendRow } from "../src/components/reports/CatchTrendSheet";

const ROOT = process.env.DCRS_REPO_ROOT ?? process.cwd();
const src = (f: string) => readFileSync(path.join(ROOT, "frontend", "src", ...f.split("/")), "utf8");
const row = (year: number, months: (number | null)[]): TrendRow => ({ source: "s", unit: "Number", targetPest: "Flies", year, months, fromRegister: Array(12).fill(false) });

test("a trend's month - its cell or its bars - opens the register it is counted from, that month of that year", () => {
  const html = renderToStaticMarkup(
    h(CatchTrendSheet, { companyName: "C", title: "T", rows: [row(2025, Array(12).fill(1)), row(2026, [...Array(10).fill(null), 84, 29])], chartYear: 2026, yAxisLabel: "y", unitWord: "flies", registerName: "F/HR/18", openMonth: () => undefined })
  );
  assert.equal((html.match(/class="open-month"/g) ?? []).length + (html.match(/class="from-register open-month"/g) ?? []).length, 24, "every month of every year's row");
  assert.match(html, /title="Open NOV 2026 in the F\/HR\/18"/);
  assert.match(html, /class="bar open-month"/, "the bars too");
  const plain = renderToStaticMarkup(h(CatchTrendSheet, { companyName: "C", title: "T", rows: [row(2025, Array(12).fill(1))], chartYear: 2025, yAxisLabel: "y", unitWord: "flies", registerName: "F/HR/18" }));
  assert.ok(!/open-month/.test(plain), "only where a register is to open");
  const reports = src("pages/ReportsPage.tsx");
  assert.equal((reports.match(/openMonth=\{\(y, m\) => navigate\(`\/pest\/daily\/\$\{y\}\/\$\{m\}`\)\}/g) ?? []).length, 2, "Rodent and Lizard: F/HR/17");
  assert.match(reports, /openMonth=\{\(y, m\) => navigate\(`\/pest\/fly-catcher\/\$\{y\}\/\$\{m\}`\)\}/, "Flies: F/HR/18");
  assert.match(src("App.tsx"), /<FlyCatcherRegisterPage key=\{rest\.join\("\/"\)\} year=\{yearParam\(rest\[1\]\)\} month=\{month0Param\(rest\[2\]\)\} \/>/);
  assert.match(src("store/router.tsx"), /area === "fly-catcher"\) return rest\.length === 1 \|\| \(rest\.length === 2 && YEAR_RE\.test\(slug\)\) \|\| \(rest\.length === 3/);
});

test("every list of records centred, Open at the right", () => {
  const css = src("styles.css");
  assert.match(css, /\.doc-table table\.records-list th, \.doc-table table\.records-list td, table\.records-list th, table\.records-list td \{ text-align: center; \}/);
  for (const f of ["pages/DocumentRecordsPage.tsx", "pages/CapaPage.tsx", "pages/TrainingPage.tsx"]) assert.match(src(f), /className="(compact )?records-list"/, f);
  assert.equal((src("pages/PestControlPages.tsx").match(/className="records-list"/g) ?? []).length, 3, "F/HR/17's list, the service visits, F/HR/18's visits");
  assert.equal((src("pages/GapPage.tsx").match(/className="records-list"/g) ?? []).length, 2, "CAPA records and acknowledgements");
});

test("F/HR/17's first page a ruled form: the instructions boxed, the ten check points a table", () => {
  const sheet = src("components/records/DailyRegisterSheet.tsx");
  assert.match(sheet, /<div className="register-instruction-box">/);
  assert.match(sheet, /<table className="register-grid register-checkpoints">/);
  assert.match(sheet, /<th className="cp-no">Sr\. No\.<\/th>/);
  assert.match(src("styles.css"), /\.register-instruction-box \{ border: 1\.5px solid #2c3e50;/);
});

test("F/HR/17's register has the month's own days, not a line more: page 3 the 20th to the month's last (§244)", () => {
  const sheet = src("components/records/DailyRegisterSheet.tsx");
  assert.match(sheet, /\{grid\(1, 19\)\}/);
  assert.match(sheet, /\{grid\(20, dim\)\}/);
  assert.ok(!/grid\(20, 31\)/.test(sheet), "never a 31st line in a month of thirty days");
});
