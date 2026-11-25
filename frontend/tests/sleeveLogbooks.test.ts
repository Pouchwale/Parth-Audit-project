// THE SLEEVE SECTION'S FOUR LOGBOOKS (REQUIREMENTS §327): F-PRD-06 Seaming, F-PRD-07 Cutting, F-PRD-27 Rewinding and F-PRD-28
// Slitting, drawn as the owner's Sleeve - LOGBOOK.xlsx prints them.
// Run: npm run test:unit -- sleeveLogbooks
import test from "node:test";
import assert from "node:assert/strict";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { paperTableFits, paperTableFor, type PaperCell, type PaperTable } from "../src/data/seed/qcPaperTables";
import { PRD_SLEEVE_PAPERS } from "../src/data/seed/prdSleevePapers";

ensureDocumentsSeeded();
ensureMasterSeeded();

const LOGBOOKS: [string, string, string, string][] = [
  ["prd-seaming-logbook", "F-PRD-06", "01", "SEAMING LOGBOOK"],
  ["prd-cutting-logbook", "F-PRD-07", "01", "CUTTING LOGBOOK"],
  ["prd-rewinding-logbook", "F-PRD-27", "00", "REWINDING LOGBOOK"],
  ["prd-sleeve-slitting-logbook", "F-PRD-28", "00", "SLITTING LOGBOOK"],
];
const cells = (p: PaperTable): PaperCell[] => [...p.head, ...p.body, ...p.foot].flatMap((r) => r.cells);
const words = (p: PaperTable): string => cells(p).map((c) => [c.t ?? "", ...(c.at ?? []).map((a) => a.t)].join(" ")).join(" ");

test("the four logbooks are Production formats with the sheets' own numbers and revisions, started when a job is run", () => {
  for (const [id, formatNo, rev] of LOGBOOKS) {
    const doc = documentRepository.getById(id);
    assert.ok(doc, id);
    assert.equal(doc!.formatNo, formatNo, id);
    assert.equal(doc!.revisionNo, rev, id);
    assert.equal(doc!.module, "Production", id);
    assert.equal(doc!.frequency, "As Required", id);
  }
});

test("each is drawn as its sheet: the company, the title and the number as the sheet prints them, every printed word its own", () => {
  for (const [id, formatNo, rev, title] of LOGBOOKS) {
    const paper = paperTableFor(id);
    assert.ok(paper, id);
    assert.equal(paper, PRD_SLEEVE_PAPERS[id]);
    assert.ok(paper!.ownWords, `${id}: the owner's own words`);
    assert.equal(paper!.page, "landscape", id);
    const all = words(paper!);
    assert.match(all, /GUJARAT PRINT PACK PUBLICATIONS PRIVATE LIMITED/, id);
    assert.ok(all.includes(title), `${id}: ${title}`);
    assert.ok(all.includes(`${formatNo}(${rev}/01.09.2026)`), `${id}: ${formatNo}(${rev}/01.09.2026)`);
    assert.ok(all.includes("LINE CLEARANCE REPORT") && all.includes("OUTPUT") && all.includes("OBSERVATION"), id);
  }
});

test("the paper fits its layout: every box and column drawn, the OUTPUT grid's four lines the record's lines 1 to 4", () => {
  for (const [id] of LOGBOOKS) {
    const paper = paperTableFor(id)!;
    const layout = getLogSheetLayout(id)!;
    assert.ok(layout, id);
    assert.ok(paperTableFits(paper, layout), `${id}: the paper fits its layout`);
    const lines = new Set(cells(paper).filter((c) => c.col).map((c) => c.ln));
    assert.deepEqual([...lines].sort(), [0, 1, 2, 3], id);
    assert.equal(layout.rowMode?.kind, "fixedRows", id);
    // a person may add a line under any of the four (§276)
    assert.equal(paper.body.filter((r) => r.rowKey?.startsWith("line")).length, 4, id);
    // every row's cells add up to the sheet's width
    const widths = [...paper.head, ...paper.body].map((r) => Math.round(r.cells.reduce((a, c) => a + c.w, 0)));
    assert.ok(widths.every((w) => Math.abs(w - widths[0]) <= 1), `${id}: ${[...new Set(widths)].join(", ")}`);
  }
});

test("the line clearance report: YES / NO tick boxes on its five checks, two boxes either side of each '/', and its signs", () => {
  for (const [id] of LOGBOOKS) {
    const paper = paperTableFor(id)!;
    const ticks = cells(paper).flatMap((c) => c.pick ?? []).filter((p) => p.word === "YES" || p.word === "NO");
    assert.equal(ticks.length, 10, `${id}: five YES / NO checks`);
    assert.ok(ticks.every((p) => p.mark === "check"), id);
    const slashes = cells(paper).filter((c) => c.t === "/" && (c.over ?? []).length === 2);
    assert.equal(slashes.length, 2, `${id}: FG code / PO and item no. / PO`);
    const fields = getLogSheetLayout(id)!.headerFields.map((f) => f.key);
    for (const k of ["operatorSign", "inchargeSign", "remarks", "lcClearanceBy", "lcVerifiedBy", "lcDate", "lcTime"]) assert.ok(fields.includes(k), `${id}: ${k}`);
  }
});
