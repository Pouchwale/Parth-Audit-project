// THE PRINT DOES NOT DEPEND ON THE BROWSER'S DIALOG (REQUIREMENTS §297; the owner, 23-Nov-2026, with Chrome's print dialog: Pages All, 1 per
// sheet, Margins Default, Background graphics on). A web page cannot read or set that dialog, so the sheet itself carries what it can:
// every background printed with the box ticked or not, the A4 page, and no page margin of the browser's.
// Run: npm run test:unit -- printSettings
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.join(process.cwd(), "frontend", "src", "styles.css"), "utf8");

test("every element prints its background whether Background graphics is ticked or not", () => {
  assert.match(css, /@media print \{\s*\*, \*::before, \*::after \{ -webkit-print-color-adjust: exact; print-color-adjust: exact; \}/);
});

test("the page is A4 with no margin of the browser's", () => {
  assert.match(css, /@page \{\s*size: A4;[\s\S]*?margin: 0;\s*\}/);
});
