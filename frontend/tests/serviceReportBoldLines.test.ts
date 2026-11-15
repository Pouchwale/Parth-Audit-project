// EVERY LINE OF THE PEST CONTROL SERVICE REPORT BOLD (REQUIREMENTS §214; the owner, 15-Nov-2026, with the rodent report's
// thin area lines beside its bold frame: "make sure whole format is line are bold and fix the others format line also").
// The rodent, general and fly reports are one sheet (components/records/ServiceReportRecordView.tsx, table.svc-paper):
// every rule it draws is 2px, so the print is all bold and the Excel download all medium (utils/documentExport.ts edge).
// Run: npm run test:unit -- serviceReportBoldLines
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
const css = readFileSync(path.join(root, "frontend", "src", "styles.css"), "utf8").replace(/\r\n/g, "\n");

test("no thin rule is left on the service report's sheet", () => {
  const rules = css.split("\n").filter((l) => /^\s*(?:@media[^{]*\{\s*)?(?:html[^ ]* )?(?:table)?\.svc-paper\b/.test(l) && !/input|textarea/.test(l));
  assert.ok(rules.length > 30, "the sheet's rules were found");
  for (const l of rules) {
    assert.doesNotMatch(l, /1px solid #000/, l);
    assert.doesNotMatch(l, /border-width:[^;]*\b1px/, l);
    assert.doesNotMatch(l, /border-(?:left|right|top|bottom)-width:\s*1px/, l);
  }
  assert.match(css, /\.svc-paper td \{ border: 2px solid #000;/, "every cell drawn bold");
});
