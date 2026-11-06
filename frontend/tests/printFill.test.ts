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
import { PAGE_FILL_MODULES, printFillOf } from "../src/engine/printFill";

test("the fill's limits: 1.3x at most, a form to 94% of the page", () => {
  assert.match(print, /const FILL_SCALE = 1\.3;/, "10 pt -> 13 pt at most");
  assert.match(print, /const FILL_TO = 0\.94;/);
});

test("only a sheet of DCRS's own make is filled: never a paper form, a framed paper, a named paper, one at its own margin or one drawn to its paper", () => {
  assert.match(print, /function ownMake\(doc: HTMLElement\): boolean \{\n {2}return !\[PAPER_FORM, "\[data-paper\]", DRAWN_TO_PAPER\]\.some\(\(s\) => doc\.matches\(s\) \|\| doc\.querySelector\(s\) !== null\);/);
  assert.match(print, /const DRAWN_TO_PAPER = "\.svc-paper, \.fhr18-sheet, \.fhr18-record";/, "the contractor's service report is the March sheet to 1.5 pt and F/HR/18 its Word page (§118): drawn as they are");
  assert.match(print, /if \(own === null && !isFramed\(doc\)\) \{\n {6}const sections = grows\(doc\) \? pageSections\(doc\) : \[\];/);
  assert.match(print, /else zoom = fillPage\(doc, zoom, width, room, landscape\);/);
  // ...and the contractor's service report, enlarged evenly to the A4 page's width (the owner, 31-Oct-2026, REQUIREMENTS §154).
  assert.match(print, /function fillPage\([^)]*\): number \{\n(?: {2}\/\/[^\n]*\n)* {2}if \(!grows\(doc\) && !doc\.querySelector\("\.svc-paper"\)\) return zoom;/);
  // (grows: a sheet of DCRS's own make - or, in a module that fills its page (§194), a sheet that names its paper and is not drawn in its millimetres)
  assert.match(print, /function grows\(doc: HTMLElement\): boolean \{\n {2}return ownMake\(doc\) \|\| \(fillsPage\(doc\) && !\[PAPER_FORM, DRAWN_TO_PAPER\]\.some\(\(s\) => doc\.matches\(s\) \|\| doc\.querySelector\(s\) !== null\)\);\n\}/);
});

test("the height is measured as it prints: the print's own rules laid on for the moment, against the whole A4 page", () => {
  assert.match(print, /function withPrintRules<T>\(measure: \(\) => T\): T \{/);
  assert.match(print, /walk\(rule\.cssRules, inPrint \|\| \(\/\\bprint\\b\/\.test\(media\) && !\/\\bscreen\\b\/\.test\(media\)\)\);/);
  assert.match(print, /style\.remove\(\);/, "taken off again before anything is painted");
  assert.match(print, /const pageH = \(landscape \? 210 : 297\) \* PX_PER_MM;/, "the whole page: the document keeps its 12 mm margin itself");
  assert.match(print, /if \(now <= 0 \|\| now >= FILL_TO\) return zoom;/, "a sheet already a page long (or more) is left as it is");
  // ...with the 12 mm margin it prints with: the screen's 20 x 24 px rule is more specific than the print's and held while
  // measuring, so F/MKT/01 and F/HR/11, drawn bigger, measured 277 mm and printed 299 mm, on two pages (28-Oct-2026).
  assert.match(css, /html\.print-measure \[data-print-doc\]:not\(\[data-print-doc="ui"\]\) \{ padding: 12mm; \}/);
  assert.match(css, /html\.print-measure \[data-print-doc\]:not\(\[data-print-doc="ui"\]\):has\(\.register-page, \.caf-page\) \{ padding: 0; \}/);
});

test("a printout holds the lines written and no others (the owner, 25-Oct-2026): no blank line ruled, no unwritten line printed", () => {
  assert.doesNotMatch(print, /ruleRegisters|ruleBlankLines|data-print-blank|LINES_TO|BLANK_LINE_MM/, "no blank line is ruled under a register any more");
  assert.equal((sheet.match(/data-empty-line=\{unwritten \? "" : undefined\}/g) ?? []).length, 2, "both lines of an entry are marked");
  assert.match(sheet, /unwritten=\{someWritten && !writtenIn\(row\)\}/, "only while another line is written: a sheet with nothing written prints its lines");
  assert.match(sheet, /layout\.columns\.some\(\(c\) => !c\.fixed && !c\.computed &&/, "a fixed or worked-out column does not make a line written");
  assert.match(css, /tr\.pf-pad, tr\[data-empty-line\] \{ display: none; \}/, "F/QC/12's other entries, the paper's blank lines and an unwritten line leave the printout");
  // (a QC paper's own ruled lines print again only on a document that fills its page: §194, below)
  assert.doesNotMatch(css, /\n {2}\.pt-table tr\.pt-pad \{ display: table-row; \}/, "a QC paper's own ruled lines no longer print of themselves");
  assert.doesNotMatch(sheet, /data-free-lines/);
});

test("the other sheets that draw blank lines print only the lines written too: the pest register's summary, F/HR/18", () => {
  const pest = read("frontend", "src", "components", "records", "DailyRegisterSheet.tsx");
  assert.match(pest, /data-empty-line=\{!a && actions\.length > 0 \? "" : undefined\}/, "the Summary of Actions' three lines: the written ones, once one is");
  const fly = read("frontend", "src", "components", "records", "FlyCatcherRegisterSheet.tsx");
  assert.match(fly, /const someWritten = rows\.some\(\(row\) => !!row\.entry\);/);
  assert.match(fly, /data-empty-line=\{i > 0 && !e && someWritten \? "" : undefined\}/, "a unit's first line, which carries its name, always prints");
});

// EACH PAGE FILLED (the owner, 28-Oct-2026, with F/HR/17's first page: "make sure this page will print complete on A4 size
// paper like fonts should be good which cover the whole page"): each page of a sheet printed as pages of its own drawn
// bigger, then the lines of a page still short of its foot drawn taller - proved in a browser by tests/e2e_print_fill.py.
test("each page filled: a sheet's own pages drawn bigger one by one, then a short page's lines taller, a ruled line's height at most, never onto a second page", () => {
  assert.match(print, /const PAGE_SECTIONS = "section\.register-page";/, "F/HR/17's register: each page as its paper");
  assert.match(print, /const STRETCH_TO = 0\.92;/);
  assert.match(print, /const ROW_MAX_MM = 11;/, "a table's lines no taller than a ruled paper's");
  assert.match(print, /const ITEM_MAX_MM = 14;/);
  assert.match(print, /if \(sections\.length > 1\) fillSections\(doc, sections, zoom, room, landscape\);/, "a sheet of pages: each page drawn bigger");
  assert.match(print, /const grown = fillMeasured\(doc, zoom, narrowestWidth\(sec\), across, landscape, sec\);/, "each page by its own height and its own tables' width");
  // (a sheet whose every value prints as words fitted again by them first - §189 refitToWords - so its pages are measured as drawn)
  assert.match(print, /active\.written\.push\(\.\.\.writeLongBoxesAsWords\(docs\)\);\n {2}\/\/ [^\n]*\n {2}refitToWords\(docs\);\n {2}\/\/ [^\n]*\n {2}stretchToPages\(docs\);\n\}/, "last of all, after every box is written for the print");
  assert.match(print, /if \(!grows\(doc\) \|\| ownLeftMargin\(doc\) !== null \|\| isFramed\(doc\)\) continue;/, "a sheet drawn to its paper is drawn as its paper");
  assert.match(print, /if \(stretched\.length > from && share\(\) > FILL_TO\) \{/, "a page that would run onto a second one is put back as it was");
  assert.match(print, /for \(const s of stretched\.reverse\(\)\) s\.el\.style\[s\.prop\] = s\.was;/, "and after printing, the screen is as it was");
});

// A DOCUMENT OF THE QC, HR OR PURCHASE MODULE FILLS ITS A4 PAGE (REQUIREMENTS §194; the owner, 6-Nov-2026: "when user click
// on print original copy then format is not covering whole A4 size page ... do this for only three module which is QC, HR
// and Purchase"). The module decides (engine/printFill.ts), the record's pages mark the document, and the print draws it to
// the page: its words bigger, a register ruled to the foot, a form's boxes set apart, a block of boxes free to break, the
// QC papers' own ruled lines printed again. Measured in a browser on every QC, HR and Purchase document by the scratch run
// of 6-Nov-2026 (F/HR/13 44% -> 83% of the page, F/HR/06 35% -> 82%, F/QC/15-A 35% -> 81%, F/QC/16 30% -> 96%,
// F-QC-40.A 18% -> 70% at its paper's 31 lines, F/PUR/01's first page 30% -> 95%).
test("§194: only a QC, HR or Purchase document fills its page - the module decides, and every page that prints a record marks it", () => {
  assert.deepEqual([...PAGE_FILL_MODULES], ["Quality Control — Inspection Records", "Lamination — Quality Control", "Human Resources", "Purchase"]);
  assert.equal(printFillOf({ module: "Human Resources" }), "page");
  assert.equal(printFillOf({ module: "Purchase" }), "page");
  assert.equal(printFillOf({ module: "Quality Control — Inspection Records" }), "page");
  assert.equal(printFillOf({ module: "Lamination — Quality Control" }), "page");
  for (const other of ["Production", "Maintenance", "Marketing", "Store", "Dispatch", "System / Management", "Quality — Compliance", "CAPA (Corrective & Preventive Action)", ""]) {
    assert.equal(printFillOf({ module: other }), undefined, other || "(no module)");
  }
  assert.equal(printFillOf(undefined), undefined);
  assert.equal(printFillOf(null), undefined);
  const engine = read("frontend", "src", "engine", "printFill.ts");
  assert.doesNotMatch(engine, /^import /m, "import-free");
  // The record's page, the document page's preview, the training record, the chemical master, the pest-control lists.
  for (const [file, times] of [
    ["RecordPage.tsx", 1],
    ["DocumentRecordsPage.tsx", 1],
    ["TrainingPage.tsx", 1],
    ["ChemicalMasterPage.tsx", 1],
    ["PestControlPages.tsx", 3],
  ] as const) {
    const page = read("frontend", "src", "pages", file);
    assert.equal((page.match(/data-print-doc data-print-fill=\{printFillOf\(doc\)\}/g) ?? []).length, times, file);
    assert.match(page, /import \{ printFillOf \} from "\.\.\/engine\/printFill";/, file);
  }
  assert.match(print, /const FILLS_PAGE = "\[data-print-fill='page'\]";/);
});

test("§194: the words bigger, to 1.4x; a sheet that names its paper too, never one drawn in its paper's millimetres or points", () => {
  assert.match(print, /const PAGE_FILL_SCALE = 1\.4;/);
  assert.match(print, /const fillScale = \(doc: HTMLElement\): number => \(fillsPage\(doc\) \? PAGE_FILL_SCALE : FILL_SCALE\);/);
  assert.match(print, /const byWidth = width > 0 \? Math\.floor\(\(\(across \* 0\.98\) \/ width\) \* 1000\) \/ 1000 : fillScale\(doc\);/);
  assert.match(print, /const grown = Math\.min\(fillScale\(doc\), byWidth, byHeight\);/);
  // ...and every other module keeps its 1.3x, its own sheets only (ownMake unchanged).
  assert.match(print, /const FILL_SCALE = 1\.3;/);
});

test("§194: a register is ruled with blank lines to the foot of its page - after its written lines, never past the page - and the QC papers' own lines print again", () => {
  assert.match(sheet, /data-lines=\{mode\.kind === "free" && linesRule\.canAdd \? "free" : undefined\}/, "the grid says whether its lines are free (a free register, by the registry's rule of §113; a form with open printed lines is spread)");
  assert.match(print, /const FREE_LINES = "table\.log-sheet\[data-lines='free'\]";/);
  assert.match(print, /export const RULED_LINE = "print-ruled-line";/);
  assert.match(print, /const RULED_MIN_MM = 7;/, "a ruled line no shorter than the paper's");
  assert.match(print, /if \(fills && ruleToFoot\(part, zoom, share\)\) return;/, "a register ruled, its lines as they are - not stretched");
  assert.match(print, /while \(added\.length < RULED_MOST && share\(\) < FILL_TO\) added\.push\(rule\(\)\);/, "to the fill's limit");
  assert.match(print, /while \(added\.length > 0 && share\(\) > FILL_TO\) \{/, "and never past it");
  assert.match(print, /for \(const attr of \["data-empty-line", "data-continues", "data-bind-row", "data-row"\]\) line\.removeAttribute\(attr\);/, "a ruled line is nobody's line: not hidden as an unwritten one, bound to nothing");
  assert.match(print, /cell\.replaceChildren\(\);/, "emptied");
  assert.match(print, /for \(const line of ruled\) line\.remove\(\);\n {2}ruled = \[\];/, "and gone when printing ends");
  // The owner's rule of 25-Oct-2026 (§126) holds for what is written: a line nobody wrote between written ones stays hidden.
  assert.match(css, /tr\.pf-pad, tr\[data-empty-line\] \{ display: none; \}/);
  // The line clearance papers' ten lines and a QC paper's own ruled lines (PaperTable.lines) print again on such a document.
  assert.match(css, /\[data-print-fill="page"\] \.paper-sheet\[data-paper-form="lineclear"\] tr\.pf-pad \{ display: table-row; \}/);
  assert.match(css, /\[data-print-fill="page"\] \.pt-table tr\.pt-pad \{ display: table-row; \}/);
  // ...and such a paper is printed to fill the A4 page, as F/QC/17 is (the owner, 30-Oct-2026).
  assert.match(sheet, /const ptFill = !!pt\.fillA4 \|\| printFillOf\(doc\) === "page";/);
  assert.match(sheet, /const ptPrint = paperTablePrint\(pt, ptFill\);/);
});

test("§194: a form's lines taller, its boxes, paragraphs and blocks set further apart to fill the page, round by round, never past it; a block of boxes taller than half the page may break", () => {
  assert.match(print, /const PAGE_ROW_MAX_MM = 14;/);
  assert.match(print, /const PAGE_BOX_MAX_MM = 12;/);
  assert.match(print, /const PAGE_PARA_MAX_MM = 6;/);
  assert.match(print, /const PAGE_BLOCK_MAX_MM = 10;/);
  assert.match(print, /const most = \(\(fills \? PAGE_ROW_MAX_MM : ROW_MAX_MM\) \* PX_PER_MM\) \/ zoom;/);
  assert.match(print, /if \(fills\) spreadToPage\(part, zoom, share, pageH\);/);
  assert.match(print, /take\("\.field", "paddingBottom", PAGE_BOX_MAX_MM, \(el\) => !el\.parentElement\?\.closest\("\.field"\)\);/);
  assert.match(print, /take\("p", "paddingBottom", PAGE_PARA_MAX_MM, \(el\) => !el\.closest\("\.field, li"\)\);/);
  assert.match(print, /take\("\.paper-body > \.card, \.paper-foot > \.card", "paddingTop", PAGE_BLOCK_MAX_MM\);/);
  assert.match(print, /const free = \(el: Element\): boolean => isShown\(el\) && !el\.closest\("table, \.doc-header, \[data-pf\]"\);/, "never a table's cell, the header block or a paper's own table");
  assert.match(print, /for \(let round = 0; round < SPREAD_ROUNDS; round\+\+\) \{\n {4}const now = share\(\);\n {4}if \(now >= STRETCH_TO - 0\.005\) break;/);
  assert.match(print, /if \(share\(\) > FILL_TO\) \{\n {6}for \(const s of stretched\.splice\(from\)\.reverse\(\)\) s\.el\.style\[s\.prop\] = s\.was;\n {6}break;/, "a round past the page undone");
  assert.match(print, /const BREAKS_OVER = 0\.5;/);
  assert.match(print, /if \(fillsPage\(doc\)\) letBlocksBreak\(doc, zoom, landscape\);/);
  assert.match(print, /stretch\(el, "breakInside", "auto"\);/);
  // The measure leaves out the 12 mm the measuring rules put under the document, which the print does not (§183).
  assert.match(print, /const under = fills && part === doc \? parseFloat\(getComputedStyle\(doc\)\.paddingBottom\) \|\| 0 : 0;/);
});
