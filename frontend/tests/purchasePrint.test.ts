// THE PURCHASE MODULE ON PAPER, IN EXCEL AND IN WORD (REQUIREMENTS §189; the owner, 6-Nov-2026, with Purchase Master Data's
// heading row: "Make this part also editable ... make sure this whole purchase module prints perfectly in excel and word and
// even if we take out print on physical A4 size paper than it should be print perfectly on it"):
//   * every heading of Purchase Master Data is typed over in place (EditableWords: asked first, as every printed word is),
//     the sort its own small button that never prints;
//   * the list downloads as Excel set up for A4 and as Word, and prints as the list and then the rating, every cell in ink;
//   * a sheet whose every value prints as words (the list, F/PUR/03) is fitted to the page by those words once they are
//     written - fitted by its typing boxes, the list printed 1,090 px of grid on a 1,032 px page - its words whole, at
//     their own size;
//   * a register's "remove the line" column never prints as an empty column.
// Measured on the printout by tests/check_all_documents.py (every document) and the browser. Run: npm run test:unit -- purchasePrint
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.env.DCRS_REPO_ROOT ?? process.cwd();
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8").replace(/\r\n/g, "\n");
const page = () => read("frontend", "src", "pages", "PurchaseMasterDataPage.tsx");
const print = () => read("frontend", "src", "utils", "print.ts");
const css = () => read("frontend", "src", "styles.css");

test("every heading of Purchase Master Data is typed over in place; the sort is a button of its own that never prints", () => {
  const src = page();
  for (const key of ['"srNo"', '"listGroup"', '"ratingGroup"']) assert.ok(src.includes(`{headingWords(${key})}`), `the heading ${key}`);
  assert.match(src, /const heading = \(key: SupplierKey \| WorkedKey[^]*?\{headingWords\(key\)\}[^]*?className="btn btn-ghost btn-sm no-print"[^]*?data-sort=\{key\}/);
  assert.match(src, /<EditableWords shown=\{head\(key\)\} editable=\{canEdit\} onChange=\{\(w\) => editHeading\(key, w\)\}/);
  assert.match(src, /purchaseMasterRepository\.setHeading\(key, words\);\s+logActivity\("Purchase Master Data: heading changed"/);
  // The downloads and the import read the headings as typed.
  assert.ok(src.includes("supplierSheet(suppliers, headings)"));
  assert.ok(src.includes("planSupplierImport(await gridOf(file), purchaseMasterRepository.all(), headings)"));
});

test("the list downloads as Excel set up for A4 and as Word; it prints as the list and then the rating", () => {
  const src = page();
  assert.match(src, /buildXlsx\(PURCHASE_MASTER_SHEET_NAME, columns, rows, merges, \{\s+landscape: true,\s+fitToWidth: true,\s+repeatHeading: true,/);
  assert.match(src, /printColumns: columns\.length - 1,\s+wrap: true,/);
  assert.match(src, /data-action="purchase-master-export-word" onClick=\{exportWord\}/);
  assert.match(src, /wordDocumentFromBlocks\(documentBlocks\(\[sheetRef\.current\]\), undefined, "landscape"/);
  assert.match(src, /<div ref=\{sheetRef\} data-print-doc data-print-flow="" data-print-words="all" data-page-part="purchase-master-print">/);
  assert.match(src, /className="print-only" data-section="purchase-master-rating-print"/);
  // The category prints as its words, not as a choice box shrunk to its box.
  assert.match(src, /<span className="print-only">\{s\.category\}<\/span>\s+<select\s+className="input input-sm no-print"\s+data-field="category"/);
  const styles = css();
  assert.ok(styles.includes('[data-page-part="purchase-master-print"] .doc-table table :is(th, td) { border: 1px solid #000; }'), "every cell in ink");
  assert.ok(styles.includes('[data-page-part="purchase-master-print"] table :is(th, td) { padding: 2px 5px; line-height: 1.2; vertical-align: top; }'));
  // The typing widths hold on the screen only (--col-min, as a record sheet's), and the flagged cells are shaded there only:
  // neither prints, with no !important added (theme.test.ts).
  assert.match(src, /style=\{\{ "--col-min": `\$\{width\}px`, fontWeight: 600 \} as React\.CSSProperties\}/);
  assert.doesNotMatch(src, /minWidth: width/);
  assert.match(src, /return issue \? \{ className: "pm-flag", title: issue\.message \} : undefined;/);
  assert.match(styles, /@media screen \{\n {2}\.doc-table table\[data-table="purchase-master"\] tbody tr td\.pm-flag \{ background: var\(--color-warning-bg\); \}/);
  assert.match(styles, /@media screen \{\n {2}\.doc-table table th\[style\*="--col-min"\] \{ min-width: var\(--col-min\); \}/);
  // ...and measured so (html.print-measure), not at the screen's typing widths.
  assert.ok(styles.includes('html.print-measure [data-page-part="purchase-master-print"] .doc-table table th[style*="--col-min"] { min-width: 0; }'));
  assert.ok(styles.includes('html.print-measure [data-page-part="purchase-master-print"] table :is(th, td) { padding: 2px 5px; line-height: 1.2; }'));
  assert.ok(styles.includes('html.print-scoped [data-page-part="purchase-master-print"] .doc-table table :is(th, td) { border: 1px solid #000; }'));
});

test("a sheet whose every value prints as words is fitted again by its words, whole and at their own size", () => {
  const src = print();
  // Fitted again after the words are written, before a short page's lines are drawn taller.
  assert.match(src, /active\.written\.push\(\.\.\.writeLongBoxesAsWords\(docs\)\);\s+\/\/[^\n]*\n\s+refitToWords\(docs\);\s+\/\/[^\n]*\n\s+stretchToPages\(docs\);/);
  const refit = src.slice(src.indexOf("function refitToWords("), src.indexOf("function refitToWords(") + 1600);
  assert.ok(refit.includes("if (!(doc.matches(EVERY_VALUE_AS_WORDS) || doc.querySelector(EVERY_VALUE_AS_WORDS))) continue;"), "only such a sheet");
  assert.ok(refit.includes("withPrintRules("), "measured with the print's rules on");
  assert.ok(refit.includes("Math.min(1, Math.max(SMALLEST_SCALE,"), "never above its own size");
  assert.ok(src.includes("size: box.closest(EVERY_VALUE_AS_WORDS) ? own : now"), "at the box's own size, not shrunk");
  assert.ok(src.includes('const wrap = box.closest(EVERY_VALUE_AS_WORDS) ? "break-word" : "anywhere";'), "a word broken only where longer than its column");
  // F/PUR/03 is such a sheet.
  assert.match(read("frontend", "src", "data", "seed", "purchaseLayouts.ts"), /printWordsAll: true,/);
});

test("a register's remove-the-line column never prints, nor counts while the page is measured", () => {
  const styles = css();
  assert.match(styles, /@media print \{\s+\/\*[^]*?\*\/\s+\.pf-remove \{ display: none; \}\s+\}\nhtml\.print-measure \.pf-remove \{ display: none; \}/);
  assert.match(read("frontend", "src", "components", "records", "LogSheetRecordView.tsx"), /<td className="pf-remove" rowSpan=\{lineSpan\}>/);
});
