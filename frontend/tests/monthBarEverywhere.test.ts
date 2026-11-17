// THE MONTH BAR ON EVERY LIST OF RECORDS OF EVERY MODULE (REQUIREMENTS §240; the owner, 16-Nov-2026, with the bar of the
// documents' pages - Month, Previous, All months, the year, Next, This month: "in all pest control service record i want
// like this ... for each and every document of all modules"). Run: npm run test:unit -- monthBarEverywhere
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import { MonthBar, inPeriod, periodOf, periodWords, yearsOf } from "../src/components/common/MonthBar";

const ROOT = process.env.DCRS_REPO_ROOT ?? process.cwd();
const src = (f: string) => readFileSync(path.join(ROOT, "frontend", "src", ...f.split("/")), "utf8");

test("the bar: a month, or every month where a list may show them all; a register a month at a time has no All months", () => {
  const withAll = renderToStaticMarkup(h(MonthBar, { value: { year: 2026, month: 10 }, onChange: () => undefined, years: [2025], today: "2026-11-17" }));
  assert.match(withAll, /<option value="all">All months<\/option>/);
  assert.match(withAll, /data-action="month-previous"/);
  assert.match(withAll, /data-action="month-next"/);
  const register = renderToStaticMarkup(h(MonthBar, { value: { year: 2026, month: 10 }, onChange: () => undefined, years: [], today: "2026-11-17", allowAll: false }));
  assert.ok(!/All months/.test(register));
  assert.deepEqual(periodOf("2026-11-17"), { year: 2026, month: 10 });
  assert.deepEqual(periodOf("2026-11-17", "all"), { year: 2026, month: "all" });
  assert.deepEqual(yearsOf(["2025-03-01", "2026-11-02", "", "2026-01-01"]).sort(), [2025, 2026]);
  assert.equal(periodWords({ year: 2026, month: 11 }), "December 2026");
  assert.equal(periodWords({ year: 2026, month: "all" }), "any month");
  assert.ok(inPeriod("2026-12-05", { year: 2026, month: 11 }) && !inPeriod("2026-11-21", { year: 2026, month: 11 }));
});

test("every list of records has it: the documents' pages, the service reports, F/HR/17, F/HR/18, complaints, CAPA and acknowledgements, training", () => {
  assert.match(src("pages/DocumentRecordsPage.tsx"), /<MonthBar value=\{period\}/);
  const pest = src("pages/PestControlPages.tsx");
  assert.match(pest, /<MonthBar\s+value=\{period\}\s+onChange=\{setPeriod\}\s+years=\{\[\.\.\.yearRange\([^\n]*yearsOf\(allVisits\.map/, "the three service reports (any year, §251)");
  assert.equal((pest.match(/allowAll=\{false\}/g) ?? []).length, 2, "F/HR/17 and F/HR/18, a month at a time");
  assert.match(pest, /visits are on the 1st and 3rd Saturday of each month/, "the service visits' days as they are (§221)");
  assert.ok(!/<YearSelect value=\{year\} onChange=\{setYear\} \/>\s*<MonthSelect/.test(pest.slice(pest.indexOf("export function DailyMonitoringListPage"), pest.indexOf("export function ServiceReportListPage"))));
  assert.match(src("pages/CapaPage.tsx"), /<MonthBar value=\{period\}/, "customer complaints");
  assert.match(src("pages/GapPage.tsx"), /const monthBar = <MonthBar value=\{period\}/, "CAPA records and acknowledgements");
  assert.match(src("pages/TrainingPage.tsx"), /<MonthBar value=\{period\}/, "training records");
});
