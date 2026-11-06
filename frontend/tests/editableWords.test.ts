// EVERY PRINTED WORD OF AN HR OR QC SHEET IS THE PERSON'S TO TYPE OVER ON THE RECORD (REQUIREMENTS §135; the owner,
// 28-Oct-2026: "each and every document of HR and QC in that each and every single part make sure it is always editable
// every single part of it"). A line's printed words and the paper's paragraphs are drawn as before - the same markup on a
// record that cannot be written on, so the printout does not change - and typed over in place on one that can; worked-out
// cells stay worked out. The typing itself is proved in a browser (tests/e2e_editing.py).
// Run: npm run test:unit -- editableWords
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import { EditableWords } from "../src/components/records/EditableWords";
import { NotesBelow } from "../src/components/records/NotesBelow";

const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8").replace(/\r\n/g, "\n");
const html = (el: React.ReactElement) => renderToStaticMarkup(el);

test("on a record that cannot be written on, the words are drawn exactly as before", () => {
  assert.equal(html(React.createElement(EditableWords, { shown: "Thickness", editable: false, onChange: () => {}, children: "Thickness" })), "Thickness", "the words alone, where they stood");
  assert.equal(
    html(React.createElement(EditableWords, { shown: "Thickness", editable: false, onChange: () => {}, className: "pf-text", children: "Thickness" })),
    '<span class="pf-text">Thickness</span>',
    "their own span, where they had one"
  );
  assert.equal(
    html(React.createElement(NotesBelow, { lines: ["PROCEDURE: weigh it."] })),
    '<div class="mt-3 sheet-notes-below" data-section="notes-below"><p class="text-sm" style="white-space:pre-wrap"><strong>PROCEDURE:</strong> weigh it.</p></div>'
  );
});

test("on a record that can be written on, the same words take the caret, drawn the same", () => {
  const out = html(React.createElement(EditableWords, { shown: "Thickness", editable: true, onChange: () => {}, className: "pf-text", label: "Parameter", children: "Thickness" }));
  assert.match(out, /^<span class="pf-text editable-words" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Parameter \(the printed words, yours to change on this record\)" spellcheck="false" data-editable-words="">Thickness<\/span>$/i);
  const notes = html(React.createElement(NotesBelow, { lines: ["PROCEDURE: weigh it."], editable: true, onLine: () => {} }));
  assert.match(notes, /<p class="text-sm" style="white-space:pre-wrap"><span class="editable-words" contenteditable="true"[^>]*><strong>PROCEDURE:<\/strong> weigh it\.<\/span><\/p>/i);
});

test("every heading and label of a record is typed over in place: the columns, the Sr. No., a group's heading, every box's label (§189)", () => {
  const sheet = read("frontend", "src", "components", "records", "LogSheetRecordView.tsx");
  // Kept as the record's own words, the format's until typed over.
  assert.match(sheet, /const headingWords = \(key: string, own: string\): string => data\.words\?\.headings\?\.\[key\] \?\? own;/);
  assert.match(sheet, /const setHeadingWords = \(key: string, words: string\) => save\(\{ \.\.\.data, words: \{ \.\.\.data\.words, headings: \{ \.\.\.data\.words\?\.headings, \[key\]: words \} \} \}\);/);
  assert.match(read("frontend", "src", "types", "record.ts"), /headings\?: Record<string, string>;/);
  // The column headings on both heading rows, the Sr. No. heading and a group's heading.
  assert.equal((sheet.match(/shown=\{headingWords\(c\.key, columnHeading\(c\)\)\} editable=\{editable\} onWords=\{\(w\) => setHeadingWords\(c\.key, w\)\}/g) ?? []).length, 2);
  assert.match(sheet, /<EditableWords shown=\{headingWords\("srNo", layout\.srNoLabel \?\? "Sr\. No\."\)\} editable=\{editable\} onChange=\{\(w\) => setHeadingWords\("srNo", w\)\}/);
  assert.match(sheet, /<EditableWords shown=\{headingWords\(`group:\$\{run\.group\}`, run\.group\)\} editable=\{editable\} onChange=\{\(w\) => setHeadingWords\(`group:\$\{run\.group\}`, w\)\}/);
  // A column's heading takes the caret only where the sheet hands it the record's words; drawn as before otherwise.
  assert.match(sheet, /\{onWords \? \(\n\s+<EditableWords shown=\{shown \?\? own\} editable=\{editable\} onChange=\{onWords\} label=\{`The heading \$\{own\}`\}>/);
  // Every box above and below the grid: its label, through the same stable handler (the boxes are drawn again only when they change).
  assert.equal((sheet.match(/labelShown=\{headingWords\(`label:\$\{f\.key\}`, f\.printedLabel \?\? f\.label\)\}\n\s+onLabel=\{onLabel\}/g) ?? []).length, 2, "the header boxes and the footer boxes");
  assert.match(sheet, /const onLabel = React\.useCallback\(\(key: string, words: string\) => handlers\.current\?\.setHeadingWords\(`label:\$\{key\}`, words\), \[\]\);/);
  assert.equal((sheet.match(/<label>\{labelWords\(ownLabel\)\}<\/label>/g) ?? []).length, 2, "a printed box's label and a worked-out box's");
  assert.match(sheet, /\{field\.inSentence \? field\.inSentence\.before : labelWords\(ordinals \? withOrdinals\(ownLabel\) : ownLabel\)\}/);
  // A label nobody typed over is drawn exactly as before on a record that cannot be written on (EditableWords returns its words).
  assert.match(sheet, /const typedLabel = labelShown !== undefined && labelShown !== ownLabel \? labelShown : null;/);
});

test("every place a sheet prints words: a line's printed cell on either grid, the instructions, the text below the grid and at its foot", () => {
  const sheet = read("frontend", "src", "components", "records", "LogSheetRecordView.tsx");
  assert.doesNotMatch(sheet, /editable=\{editable && !(c|col|under)\.fixed/, "a printed cell is no longer locked by being printed");
  // A worked-out cell stays worked out in all six places a cell is drawn, unless its format lets it be typed over (§188).
  assert.equal((sheet.match(/editable=\{editable && writable\((c|col|under)\)\}/g) ?? []).length, 6, "a worked-out cell stays worked out, in all six places a cell is drawn");
  assert.match(sheet, /const writable = \(c: \{ computed\?: boolean; typable\?: boolean \}\): boolean => !c\.computed \|\| !!c\.typable;/);
  assert.match(sheet, /<EditableWords className="pt-words" shown=\{String\(words \?\? ""\)\} editable=\{editable\} onChange=\{\(w\) => onCell\(row\.id, key, w\)\}/, "the paper's own table");
  assert.match(sheet, /<EditableWords className="pf-text" shown=\{String\(value \?\? ""\)\} editable=\{editable\}/, "a paper form's cell");
  assert.match(sheet, /setWords\("instructions", layout\.instructions \?\? \[\], i, w\)/);
  assert.match(sheet, /onLine=\{\(i, w\) => setWords\("notesBelow", layout\.notesBelow!, i, w\)\}/);
  assert.match(sheet, /onLine=\{\(i, w\) => setWords\("notesAtFoot", layout\.notesAtFoot!, i, w\)\}/);
  const types = read("frontend", "src", "types", "record.ts");
  assert.match(types, /words\?: SheetWords;/);
  const css = read("frontend", "src", "styles.css");
  assert.match(css, /@media screen \{\n {2}\[data-editable-words\] \{ cursor: text;/, "the dashed line and the ring on the screen only");
});
