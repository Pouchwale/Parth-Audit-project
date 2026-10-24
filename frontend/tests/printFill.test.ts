// FILLING THE A4 PAGE (REQUIREMENTS §123; the owner, 24-Oct-2026: "they are not able to cover whole A4 size paper ...
// it not cover whole page and font size on that paper will be very small"). utils/print.ts draws a short one-page sheet
// of DCRS's own make bigger and rules a register with blank lines to its page's foot; the layout half is proved in a
// browser (tests/e2e_print_fill.py) - here, the rules that keep it safe, read from the source.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8").replace(/\r\n/g, "\n");
const print = read("frontend", "src", "utils", "print.ts");
const sheet = read("frontend", "src", "components", "records", "LogSheetRecordView.tsx");

test("the fill's limits: 1.3x at most, a form to 94% of the page, a register's lines to 86%, 8 mm a line", () => {
  assert.match(print, /const FILL_SCALE = 1\.3;/, "10 pt -> 13 pt at most");
  assert.match(print, /const FILL_TO = 0\.94;/);
  assert.match(print, /const LINES_TO = 0\.86;/, "a register's lines stop sooner: a row is never split, and its head prints again on a page it runs onto");
  assert.match(print, /const BLANK_LINE_MM = 8;/, "a line a pen can write on");
});

test("only a sheet of DCRS's own make is filled: never a paper form, a framed paper, a named paper or one at its own margin", () => {
  assert.match(print, /function ownMake\(doc: HTMLElement\): boolean \{\n {2}return !doc\.matches\(PAPER_FORM\) && !doc\.querySelector\(PAPER_FORM\) && !doc\.matches\("\[data-paper\]"\) && !doc\.querySelector\("\[data-paper\]"\);/);
  assert.match(print, /if \(own === null && !isFramed\(doc\)\) zoom = fillPage\(doc, zoom, width, room, landscape\);/);
  assert.match(print, /const service = doc\.querySelector\("\.svc-paper"\) !== null;/, "the contractor's service report, drawn narrower than its sheet, is the one paper copy made bigger");
  assert.match(print, /if \(ownLeftMargin\(doc\) !== null \|\| isFramed\(doc\) \|\| !ownMake\(doc\) \|\| !doc\.querySelector\("table\[data-free-lines\]"\)\) continue;/);
});

test("the height is measured as it prints: the print's own rules laid on for the moment, against the whole A4 page", () => {
  assert.match(print, /function withPrintRules<T>\(measure: \(\) => T\): T \{/);
  assert.match(print, /walk\(rule\.cssRules, inPrint \|\| \(\/\\bprint\\b\/\.test\(media\) && !\/\\bscreen\\b\/\.test\(media\)\)\);/);
  assert.match(print, /style\.remove\(\);/, "taken off again before anything is painted");
  assert.match(print, /const pageH = \(landscape \? 210 : 297\) \* PX_PER_MM;/, "the whole page: the document keeps its 12 mm margin itself");
  assert.match(print, /if \(now <= 0 \|\| now >= FILL_TO\) return zoom;/, "a sheet already a page long (or more) is left as it is");
});

test("a register's blank lines are ruled LAST, after a long value became words, and leave with the print", () => {
  const words = print.indexOf("active.written.push(...writeLongBoxesAsWords(docs));");
  const lines = print.indexOf("  ruleRegisters(docs);\n");
  assert.ok(words > 0 && lines > words, "the words' wrapping is in the height the lines are measured against");
  assert.match(print, /for \(const body of blankBodies\) body\.remove\(\);/, "unfit takes them away when printing ends");
  assert.match(print, /body\.setAttribute\(BLANK_ATTR, ""\);\n {2}grid\.appendChild\(body\);/, "a body of their own, never inside the one React draws");
  assert.match(sheet, /data-free-lines=\{freeRows \? "" : undefined\}/, "the register's grid says it takes free lines");
});
