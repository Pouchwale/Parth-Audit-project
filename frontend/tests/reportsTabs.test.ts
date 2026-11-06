// A TREND IS READ IN TREND ANALYSIS AND NOWHERE ELSE (REQUIREMENTS §195; the owner, 6-Nov-2026, with a picture of the
// Rat / Mice service page and the Rodent Catch Report and Trend Analysis under its visit register: "i just want trend
// anlysis of rodent, lizards and ants and cockroaches-General pest in Trend anlysis only not anywhere else"). The service
// report pages carry no trend, the Reports page offers no trend tab, the router knows none, the assistant offers none;
// the three trend pages of the Trend Analysis menu stay. Read from the source.
// Run: npm run test:unit -- reportsTabs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8").replace(/\r\n/g, "\n");

test("the service report pages carry no trend: the Rodent Catch Report and Trend Analysis is gone from under the Rat / Mice visit register", () => {
  const pest = read("frontend", "src", "pages", "PestControlPages.tsx");
  assert.doesNotMatch(pest, /data-section="rodent-trend"/);
  assert.doesNotMatch(pest, /slug === "rodent" && \(\s*<div[^>]*>\s*<RodentTrendReport/);
  // The trend pages of the Trend Analysis menu still draw the sheets, one each.
  assert.equal((pest.match(/<RodentTrendReport isDemo=\{isDemo\} year=\{year\} \/>/g) ?? []).length, 1, "the Rodent Catch Trend page alone");
  assert.equal((pest.match(/<LizardTrendReport isDemo=\{isDemo\} year=\{year\} \/>/g) ?? []).length, 1, "the Lizard Catch Trend page alone");
  assert.equal((pest.match(/<FlyCatcherTrendReport /g) ?? []).length, 1, "the Fly Catcher Infestation page alone");
  assert.match(pest, /"\/pest\/trend\/rodent"/);
  assert.match(pest, /"\/pest\/trend\/lizard"/);
  assert.match(pest, /"\/pest\/trend\/fly-catcher"/);
});

test("the Reports page offers no trend tab, and its route and the assistant know none", () => {
  const reports = read("frontend", "src", "pages", "ReportsPage.tsx");
  assert.match(reports, /const TAB_KEYS: Tab\[\] = \["monthly", "summary", "daily", "chemical", "gap", "training", "lamination"\];/);
  assert.match(reports, /type Tab = "monthly" \| "summary" \| "daily" \| "chemical" \| "gap" \| "training" \| "lamination";/);
  assert.doesNotMatch(reports, /tab === "rodent"|tab === "lizard"|tab === "flycatcher"/);
  // The sheets themselves stay here, for the trend pages.
  for (const name of ["RodentTrendReport", "LizardTrendReport", "FlyCatcherTrendReport"]) assert.match(reports, new RegExp(`export function ${name}\\(`), name);
  const router = read("frontend", "src", "store", "router.tsx");
  assert.match(router, /const REPORT_TABS = new Set\(\["monthly", "summary", "daily", "chemical", "gap", "training", "lamination"\]\);/);
  assert.match(router, /const PEST_TREND_SLUGS = new Set\(\["rodent", "lizard", "fly-catcher"\]\);/, "the three trend pages stay");
  const persona = read("frontend", "src", "engine", "assistantPersona.ts");
  assert.match(persona, /const tabs = \["monthly", "summary", "daily", "training", "lamination"\];/);
});
