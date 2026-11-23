// EVERY VALUE ON AN HR FORMAT STANDS IN THE MIDDLE OF ITS CELL'S HEIGHT, PRINTED AND IN WORD (REQUIREMENTS §294; the owner,
// 23-Nov-2026, with F/HR/05's Date of Joining at the top of its box: "this applicable to all fields").
// Run: npm run test:unit -- hrValuesCentred
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDocx } from "../src/utils/docx";
import { printedBoxText } from "../src/utils/print";
import { unzip } from "../src/utils/xlsx";

test("a written box of several lines prints its words without the blank lines that pushed them down its cell", () => {
  assert.equal(printedBoxText("textarea", "\n\nGraduate in any discipline\n"), "Graduate in any discipline");
  assert.equal(printedBoxText("textarea", "Line one\nLine two"), "Line one\nLine two");
  assert.equal(printedBoxText("date", "2026-08-10"), "10-08-2026");
});

test("the print sets a date's and a written box's words in the middle of an HR paper's cell, and hides the box behind them", () => {
  const css = readFileSync(join(process.cwd(), "frontend", "src", "styles.css"), "utf-8").replace(/\s+/g, " ");
  assert.ok(css.includes(".paper-sheet[data-paper-own]:not([data-paper-read]) .pt-table td.pt-c > :is(.field-in-table, .pt-box):has(> .print-box-text) { display: flex; flex-direction: column; justify-content: safe center; padding-top: 0; padding-bottom: 0; }"));
  assert.ok(css.includes(".paper-sheet[data-paper-own] .pt-table td.pt-c > .field-in-table.pt-lines > textarea.input.print-as-text { display: none; }"));
});

test("F/HR/15 and F/HR/16's Word tables (their set columns) stand each value in the middle of its cell", async () => {
  const bytes = buildDocx([{ type: "table", rows: [["Name", "Value"]] }], { columnsMm: [40, 60] });
  const zip = await unzip(bytes.slice().buffer);
  const xml = new TextDecoder().decode(await zip.get("word/document.xml")!());
  assert.equal((xml.match(/<w:vAlign w:val="center"\/>/g) ?? []).length, 2);
  assert.ok(/<w:tcPr>(?:(?!<\/w:tcPr>).)*<w:vAlign w:val="center"\/><\/w:tcPr>/.test(xml), "the last of the cell's properties, where Word reads it");
});
