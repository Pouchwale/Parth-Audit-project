// ANY YEAR, ANY TIME ON THE PEST CONTROL PAGES; THE CHEMICAL MASTER HEADED BY ITS TITLE ALONE; NO LETTERHEAD ON THE PEST
// CONTROL TRAINING RECORD (REQUIREMENTS §251; the owner, 17-Nov-2026). Run: npm run test:unit -- yearsAndHeaders
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import { MonthBar, yearRange } from "../src/components/common/MonthBar";

const ROOT = process.env.DCRS_REPO_ROOT ?? process.cwd();
const src = (f: string) => readFileSync(path.join(ROOT, "frontend", "src", ...f.split("/")), "utf8");

test("the year can be changed at any time: offered with All months on, every year from five back to next year", () => {
  assert.deepEqual(yearRange(2021, 2027), [2021, 2022, 2023, 2024, 2025, 2026, 2027]);
  const html = renderToStaticMarkup(h(MonthBar, { value: { year: 2026, month: "all" }, onChange: () => undefined, years: yearRange(2021, 2027), today: "2026-11-17", allInYear: true }));
  assert.ok(!/data-field="records-year"[^>]*disabled/.test(html), "not greyed out with All months");
  for (const y of [2021, 2024, 2025, 2027]) assert.match(html, new RegExp(`<option value="${y}">${y}</option>`));
  const elsewhere = renderToStaticMarkup(h(MonthBar, { value: { year: 2026, month: "all" }, onChange: () => undefined, years: [], today: "2026-11-17" }));
  assert.match(elsewhere, /disabled=""/, "other lists keep All months as every year");
  const pest = src("pages/PestControlPages.tsx");
  const service = pest.slice(pest.indexOf("export function ServiceReportListPage"), pest.indexOf("export function RodentTrendPage"));
  assert.match(service, /years=\{\[\.\.\.yearRange\(now\.getFullYear\(\) - 5, now\.getFullYear\(\) \+ 1\), \.\.\.yearsOf\(/);
  assert.match(service, /allInYear/);
  assert.match(service, /r\.dueDate\.startsWith\(`\$\{period\.year\}-`\)/, "All months: that year's visits");
  assert.match(pest, /const years = yearRange\(Math\.min\(thisYear - 5, value\), thisYear\);/, "the trend reports: any of the last five years");
});

test("the Chemical Master is headed by its title alone; the training record has no letterhead", () => {
  const chem = src("pages/ChemicalMasterPage.tsx");
  assert.ok(!/<DocumentHeader/.test(chem), "no company name, no Format No. / Rev No.");
  assert.match(chem, /export const CHEMICAL_TITLE = "Pesticide Application Chart \(Chemical Master\)";/);
  assert.match(chem, /<div className="doc-header title-only notranslate" translate="no" data-section="chemical-title">\s*<div className="doc-title">\{CHEMICAL_TITLE\}<\/div>/);
  const training = src("pages/TrainingPage.tsx");
  assert.ok(!/ProviderLetterhead/.test(training), "Gurudev Pest Control's letterhead is off the record");
  assert.match(src("styles.css"), /\.doc-header\.title-only \{ border: none; background: transparent; \}/);
});
