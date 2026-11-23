// EVERY BOX ON AN HR PAPER IS TALL ENOUGH TO READ WHILE IT IS FILLED IN (REQUIREMENTS §298; the owner, 23-Nov-2026, with F/HR/04's Name).
// Run: npm run test:unit -- hrBoxesReadable
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "frontend", "src", "styles.css"), "utf-8").replace(/\s+/g, " ");
const block = css.slice(css.indexOf("EVERY BOX ON AN HR PAPER IS TALL ENOUGH"), css.indexOf("A paper fitted to be read: a written value"));

test("on the screen a box on an HR paper is at least a line and a half high, on its centre and inside its cell", () => {
  assert.ok(block.includes("--pt-obh: max(calc(var(--oh) * var(--u)), 1.6em);"));
  assert.ok(block.includes("top: clamp(0px, calc((var(--oy) + var(--oh) / 2) * var(--u) - var(--pt-obh) / 2), calc(100% - var(--pt-obh)));"));
  assert.ok(block.includes("height: max(100%, 1.5em);"));
});

test("it is the HR papers' screen only: never the print, its measuring, or another module's paper", () => {
  assert.ok(block.includes("@media screen {"));
  const rules = block.slice(block.indexOf("@media screen")).split(",").filter((r) => r.includes(".pt-table"));
  assert.ok(rules.length >= 3);
  for (const r of rules) assert.ok(r.includes("html:not(.print-measure) .paper-sheet[data-paper-own]"), r.slice(0, 90));
});
