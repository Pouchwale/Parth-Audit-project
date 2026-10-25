// FILLING THE A4 PAGE (REQUIREMENTS §123; the owner, 24-Oct-2026: "they are not able to cover whole A4 size paper ...
// it not cover whole page and font size on that paper will be very small"). utils/print.ts draws a short one-page sheet
// of DCRS's own make bigger, and a printout holds the lines written and no others (§126, 25-Oct-2026); the layout half
// is proved in a browser (tests/e2e_print_fill.py) - here, the rules that keep it safe, read from the source.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8").replace(/\r\n/g, "\n");
const print = read("frontend", "src", "utils", "print.ts");
const sheet = read("frontend", "src", "components", "records", "LogSheetRecordView.tsx");
const css = read("frontend", "src", "styles.css");

test("the fill's limits: 1.3x at most, a form to 94% of the page", () => {
  assert.match(print, /const FILL_SCALE = 1\.3;/, "10 pt -> 13 pt at most");
  assert.match(print, /const FILL_TO = 0\.94;/);
});

test("only a sheet of DCRS's own make is filled: never a paper form, a framed paper, a named paper, one at its own margin or one drawn to its paper", () => {
  assert.match(print, /function ownMake\(doc: HTMLElement\): boolean \{\n {2}return !\[PAPER_FORM, "\[data-paper\]", DRAWN_TO_PAPER\]\.some\(\(s\) => doc\.matches\(s\) \|\| doc\.querySelector\(s\) !== null\);/);
  assert.match(print, /const DRAWN_TO_PAPER = "\.svc-paper, \.fhr18-sheet, \.fhr18-record";/, "the contractor's service report is the March sheet to 1.5 pt and F/HR/18 its Word page (§118): drawn as they are");
  assert.match(print, /if \(own === null && !isFramed\(doc\)\) zoom = fillPage\(doc, zoom, width, room, landscape\);/);
  assert.match(print, /function fillPage\([^)]*\): number \{\n {2}if \(!ownMake\(doc\)\) return zoom;/);
});

test("the height is measured as it prints: the print's own rules laid on for the moment, against the whole A4 page", () => {
  assert.match(print, /function withPrintRules<T>\(measure: \(\) => T\): T \{/);
  assert.match(print, /walk\(rule\.cssRules, inPrint \|\| \(\/\\bprint\\b\/\.test\(media\) && !\/\\bscreen\\b\/\.test\(media\)\)\);/);
  assert.match(print, /style\.remove\(\);/, "taken off again before anything is painted");
  assert.match(print, /const pageH = \(landscape \? 210 : 297\) \* PX_PER_MM;/, "the whole page: the document keeps its 12 mm margin itself");
  assert.match(print, /if \(now <= 0 \|\| now >= FILL_TO\) return zoom;/, "a sheet already a page long (or more) is left as it is");
});

test("a printout holds the lines written and no others (the owner, 25-Oct-2026): no blank line ruled, no unwritten line printed", () => {
  assert.doesNotMatch(print, /ruleRegisters|ruleBlankLines|data-print-blank|LINES_TO|BLANK_LINE_MM/, "no blank line is ruled under a register any more");
  assert.equal((sheet.match(/data-empty-line=\{unwritten \? "" : undefined\}/g) ?? []).length, 2, "both lines of an entry are marked");
  assert.match(sheet, /unwritten=\{someWritten && !writtenIn\(row\)\}/, "only while another line is written: a sheet with nothing written prints its lines");
  assert.match(sheet, /layout\.columns\.some\(\(c\) => !c\.fixed && !c\.computed &&/, "a fixed or worked-out column does not make a line written");
  assert.match(css, /tr\.pf-pad, tr\[data-empty-line\] \{ display: none; \}/, "F/QC/12's other entries, the paper's blank lines and an unwritten line leave the printout");
  assert.doesNotMatch(css, /tr\.pt-pad \{ display: table-row; \}/, "a QC paper's own ruled lines no longer print");
  assert.doesNotMatch(sheet, /data-free-lines/);
});

test("the other sheets that draw blank lines print only the lines written too: the pest register's summary, F/HR/18", () => {
  const pest = read("frontend", "src", "components", "records", "DailyRegisterSheet.tsx");
  assert.match(pest, /data-empty-line=\{!a && actions\.length > 0 \? "" : undefined\}/, "the Summary of Actions' three lines: the written ones, once one is");
  const fly = read("frontend", "src", "components", "records", "FlyCatcherRegisterSheet.tsx");
  assert.match(fly, /const someWritten = rows\.some\(\(row\) => !!row\.entry\);/);
  assert.match(fly, /data-empty-line=\{i > 0 && !e && someWritten \? "" : undefined\}/, "a unit's first line, which carries its name, always prints");
});
