// A SENTENCE IS NEVER CUT, ON THE SCREEN OR ON PAPER (the owner, 22-Oct-2026: "make sure i don't want any mistake any where";
// "print on A4 size paper so print should be print accordingly no mistake over there").
//
// The screen's own forms write a sentence in a box that wraps (a log sheet's multiline cell, a paragraph box, the GAP and
// complaint checklists' wrap-text boxes); the print writes a value too long for its box as words that wrap
// (utils/print.ts writeLongBoxesAsWords). What the screen tool and the printed PDF of every document found cut on 22-Oct-2026
// is held here: the layouts that wrap, the boxes that are textareas, and the print rules that keep a box of several lines
// whole on paper.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { LogColumn } from "../src/types";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { logCellBind, logHeaderBind } from "../src/engine/roundTrip/bindingsFor";

const repoRoot = process.env.DCRS_REPO_ROOT ?? process.cwd();
const read = (...p: string[]) => readFileSync(path.join(repoRoot, ...p), "utf8").replace(/\r\n/g, "\n");

const column = (documentId: string, key: string): LogColumn => {
  const col = getLogSheetLayout(documentId)?.columns.find((c) => c.key === key);
  assert.ok(col, `${documentId} has its ${key} column`);
  return col;
};

test("the log sheets' sentences wrap in their columns: F/SYS/08's clauses, F/SYS/16's objectives, F/QC/30's key points", () => {
  for (const [doc, key] of [
    ["sys-audit-findings", "clause"],
    ["sys-audit-findings", "requirements"],
    ["sys-objectives", "parameter"],
    ["qc-minutes-of-meetings", "keyPointsDiscussed"],
  ] as const) {
    const col = column(doc, key);
    assert.equal(col.type, "text", `${doc} ${key} is still a text column (its label and values unchanged)`);
    assert.equal(col.multiline, true, `${doc} ${key} is written in a box that wraps`);
    // A wrapping cell keeps its line breaks when a downloaded file comes back (a paragraph), as the requirement beside it does.
    assert.equal(logCellBind({ id: "r1" }, 0, col)?.type, "paragraph", `${doc} ${key} is bound as words of several lines`);
  }
});

test("F/HR/19's fifteen areas are a block across the row, not a one-line box", () => {
  const field = getLogSheetLayout("hr-gmp-checklist")?.headerFields.find((f) => f.key === "locations");
  assert.ok(field);
  assert.equal(field.label, "Location Guide — areas covered", "the label is the same");
  assert.equal(field.type, "paragraph");
  assert.equal(logHeaderBind(field)?.type, "paragraph");
});

test("the complaint checklist's comments and the training record's programme and reference are boxes that wrap", () => {
  const capa = read("frontend", "src", "pages", "CapaPage.tsx");
  assert.match(capa, /<textarea\s+className="input input-sm input-cell-multiline wrap-text"\s+rows=\{1\}\s+\{\.\.\.bindProps\(checklistBind\.item\(s, it, "comment"\)\)\}/, "each activity's Comments");
  const training = read("frontend", "src", "pages", "TrainingPage.tsx");
  for (const key of ["trainingType", "certificateRef"]) {
    assert.match(training, new RegExp(`<textarea className="input input-cell-multiline wrap-text" rows=\\{1\\} \\{\\.\\.\\.bindProps\\(trainingBind\\.field\\("${key}"\\)\\)\\}`), key);
  }
});

test("on paper a box of several lines prints whole: no resize grip, never held to the screen's 320 px", () => {
  const css = read("frontend", "src", "styles.css");
  assert.match(css, /textarea\.input\.input-cell-multiline:is\(\.gap-text, \.wrap-text\) \{ min-width: 140px; min-height: 30px; \}/);
  assert.match(css, /@media print \{\n {2}\[data-print-doc\] textarea, \[data-print-doc\] textarea\.input\.input-cell-multiline \{ resize: none; max-height: none; \}\n\}/);
});

test("print writes a value too long for its box as words that wrap, and puts the box back after", () => {
  const print = read("frontend", "src", "utils", "print.ts");
  // After the words are made smaller (fitAll), and only then.
  assert.match(print, /fitAll\(docs\);\n(?: {2}\/\/[^\n]*\n)* {2}active\.written\.push\(\.\.\.writeLongBoxesAsWords\(docs\)\);/);
  // The words wrap whatever a date's rule says (inline), and the box comes back with its own display when printing ends.
  assert.match(print, /whiteSpace: "pre-wrap", overflowWrap: "anywhere", height: "auto", maxHeight: "none", overflow: "visible"/);
  assert.match(print, /if \(display !== undefined\) \(box as HTMLElement\)\.style\.display = display;/);
  // Print still measures the page without the screen's zoom (72e8ea9).
  assert.match(print, /removeProperty\("--screen-zoom"\)/);
});
