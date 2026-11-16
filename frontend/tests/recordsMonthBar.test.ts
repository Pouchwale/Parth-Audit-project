// A MONTH TO SWITCH TO ON EVERY DOCUMENT'S RECORDS (REQUIREMENTS §227; the owner, 16-Nov-2026: "add button of month in all
// modules in which user can easily switch month whenever they want to see old or new or current record").
// Run: npm run test:unit -- recordsMonthBar
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { inPeriod } from "../src/components/common/MonthBar";

const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
const page = readFileSync(path.join(root, "frontend", "src", "pages", "DocumentRecordsPage.tsx"), "utf8").replace(/\r\n/g, "\n");

test("a record is listed in its own month, every record under All months", () => {
  assert.ok(inPeriod("2026-11-03", { year: 2026, month: 10 }));
  assert.ok(!inPeriod("2026-10-31", { year: 2026, month: 10 }));
  assert.ok(!inPeriod("2025-11-03", { year: 2026, month: 10 }), "the same month of another year is another month");
  assert.ok(inPeriod("2024-12-31", { year: 2026, month: "all" }));
});

test("the document page lists the chosen month (this month to start, every month for a yearly or rarer document)", () => {
  assert.match(page, /<MonthBar value=\{period\} onChange=\{setPeriod\}/);
  assert.match(page, /const listed = records\.filter\(\(r\) => inPeriod\(r\.dueDate, period\)\);/);
  assert.match(page, /records=\{listed\}/);
  assert.match(page, /kind === "yearly" \|\| kind === "half-yearly" \|\| kind === "quarterly" \? "all"/);
  // Every module's document page is this page: the HR formats' too.
  assert.match(readFileSync(path.join(root, "frontend", "src", "pages", "HrPages.tsx"), "utf8"), /<DocumentRecordsPage docId=\{page\.docId\} \/>/);
});
