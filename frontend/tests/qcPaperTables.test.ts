// THE QC PAPERS DRAWN AS THEIR OWN WORD TABLE (REQUIREMENTS §117, round 2 of 20-Oct-2026).
//
// The owner: "make sure each and every part should be editable and same". F/QC/06 and F/QC/07 are one Word table from
// the letterhead to the corporate office strip, drawn row by row in the paper's millimetres (data/seed/qcPaperTables.ts,
// components/records/PaperTableSheet.tsx); F/QC/25 (22-Oct-2026) is its letterhead, its grid and its signatures, each
// cell ruling its own edges, on its own US Letter measures drawn on A4. Pinned here: every box of the record has its cell on the paper and every
// cell's box is the record's (nothing typed is lost, nothing printed is a box nobody can fill); the rows are the paper's
// width and fit its one page; the sheet is drawn in its three parts, bound as every sheet is; the stylesheet's rules.
import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { DocumentDefinition, LogSheetData, LogSheetLayout, MasterData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { QC_PAPER_TABLES, lineRow, paperTableFits, paperTableFor, type PaperCell } from "../src/data/seed/qcPaperTables";
import { createDefaultData } from "../src/engine/recordDefaults";

// store/router.tsx reads window.location the moment it loads; the harness stands up none.
if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "#/dashboard", hostname: "localhost" }, configurable: true, writable: true });
}

ensureDocumentsSeeded();
ensureMasterSeeded();
const master: MasterData = masterRepository.get();
const DAY = "2026-10-14";
const css = readFileSync(path.join(process.cwd(), "frontend", "src", "styles.css"), "utf8");

const docOf = (id: string): DocumentDefinition => {
  const doc = documentRepository.getById(id);
  assert.ok(doc, id);
  return doc!;
};
const layoutOf = (id: string): LogSheetLayout => {
  const layout = getLogSheetLayout(id);
  assert.ok(layout, id);
  return layout!;
};

async function sheet(documentId: string, editable = true): Promise<string> {
  const [view, auth, store, router] = await Promise.all([
    import("../src/components/records/LogSheetRecordView"),
    import("../src/store/AuthContext"),
    import("../src/store/AppStore"),
    import("../src/store/router"),
  ]);
  const record = {
    id: `pt-${documentId}`,
    documentId,
    periodKey: `${documentId}:${DAY}`,
    dueDate: DAY,
    status: editable ? "In Progress" : "Verified",
    isDemo: false,
    data: createDefaultData(docOf(documentId), DAY, master) as LogSheetData,
    createdAt: `${DAY}T03:00:00.000Z`,
    updatedAt: `${DAY}T03:00:00.000Z`,
  } as RecordInstance<LogSheetData>;
  return renderToStaticMarkup(
    h(auth.AuthProvider, null, h(store.AppStoreProvider, null, h(router.RouterProvider, null, h(view.LogSheetRecordView, { doc: docOf(documentId), record, editable, onChange: () => undefined }))))
  );
}

const cellsOf = (id: string): PaperCell[] => {
  const form = QC_PAPER_TABLES[id];
  return [...form.head, ...form.body, ...form.foot].flatMap((r) => r.cells);
};

/**
 * What each paper drawn as its own table is: its page, the width of its rows (mm), and where the record's grid is
 * written on it — a certificate's written columns on the lines the paper writes them on, or a register's ruled lines
 * (its count of lines, each with every column of the record once).
 */
const PAPERS: Record<string, { page: "portrait" | "landscape"; width: number; written?: Record<string, number[]>; lines?: number }> = {
  "qc-coa-label": { page: "portrait", width: 193.4, written: { givenByClient: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], colorShadeVerified: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] } },
  "qc-coa-sleeve": { page: "portrait", width: 193.4, written: { givenByClient: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], colorShadeVerified: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] } },
  // F/QC/25: one answer across on every line but 7 (its headings) and 7.1 to 7.3 (written in the four columns).
  "qc-coa-corrugated": {
    page: "portrait",
    width: 190.5,
    written: { observation: [0, 1, 2, 3, 4, 5, 10, 11, 12, 13, 14, 15, 16], specifiedGsm: [7, 8, 9], testedGsm: [7, 8, 9], bf: [7, 8, 9], gradeOfPaper: [7, 8, 9] },
  },
  // F/QC/08: its eleven numbered lines.
  "qc-calibration-master-list": { page: "landscape", width: 274.24, lines: 11 },
  // F/QC/16: its fifteen ruled lines (the supplied page's thirteen and two blank).
  "qc-obsolete-artwork": { page: "landscape", width: 264.24, lines: 15 },
  // F/QC/17, both scales: the six readings; Status and the name once, on the first line, down the six.
  "qc-ruler-verification": { page: "portrait", width: 158.23, written: { masterReading: [0, 1, 2, 3, 4, 5], observed: [0, 1, 2, 3, 4, 5], difference: [0, 1, 2, 3, 4, 5], status: [0], performedBy: [0] } },
  "qc-ruler-verification-300": { page: "portrait", width: 158.23, written: { masterReading: [0, 1, 2, 3, 4, 5], observed: [0, 1, 2, 3, 4, 5], difference: [0, 1, 2, 3, 4, 5], status: [0], performedBy: [0] } },
  // F-QC-40.A and B: a month's 31 lines, a day's record its line.
  "qc-temperature-humidity": { page: "portrait", width: 148.45, lines: 31 },
  "qc-temperature-sleeve": { page: "portrait", width: 184.23, lines: 31 },
  // The three papers the owner sent as photographs: F-QC-40.C's fifty lines, F-QC-30's two tables of 34, F-QC-32's 33.
  "qc-temperature": { page: "portrait", width: 184.23, lines: 50 },
  "qc-viscosity": { page: "portrait", width: 190, lines: 34 },
  "qc-adhesive-mixing": { page: "portrait", width: 190, lines: 33 },
  // F-QC-14's two sheets: every line of every check written; each check's heading (its lines' printed parameter) once,
  // over its table.
  "qc-test-reliability-label": { page: "portrait", width: 190.04, written: reliabilityLines(8) },
  "qc-test-reliability-sleeve": { page: "portrait", width: 190.04, written: reliabilityLines(5) },
};

/** F-QC-14's checks' lines: three a check, the sample and the four readings on each, the heading on the first. */
function reliabilityLines(checks: number): Record<string, number[]> {
  const all = Array.from({ length: 3 * checks }, (_, i) => i);
  return {
    sampleNo: all,
    reading1: all,
    reading2: all,
    reading3: all,
    reading4: all,
    parameter: Array.from({ length: checks }, (_, i) => 3 * i),
  };
}

test("the papers drawn as their own table are these; no other document is", () => {
  assert.deepEqual(Object.keys(QC_PAPER_TABLES).sort(), Object.keys(PAPERS).sort());
  assert.equal(paperTableFor("qc-bopp-film"), undefined, "every other document is drawn as it was");
  for (const id of Object.keys(QC_PAPER_TABLES)) assert.equal(QC_PAPER_TABLES[id].page, PAPERS[id].page, `${id}: one ${PAPERS[id].page} page, as its paper`);
});

test("every box of the record has its cell on the paper, once, and every cell's box is the record's", () => {
  for (const id of Object.keys(QC_PAPER_TABLES)) {
    const layout = layoutOf(id);
    const form = QC_PAPER_TABLES[id];
    const keys = [...layout.headerFields, ...(layout.footerFields ?? [])].map((f) => f.key);
    // (a box's words written again where the paper prints them again, F-QC-14's names, are no box of their own)
    const drawn = cellsOf(id).flatMap((c) => (c.box ? [c.box] : c.sentence && !c.sentence.copy ? [c.sentence.box] : []));
    assert.deepEqual([...drawn].sort(), [...keys].sort(), `${id}: the paper's cells are the record's boxes, each once`);
    if (PAPERS[id].lines !== undefined) {
      // A register: every column of the record once on each ruled line, as many lines as the paper rules.
      assert.equal(form.lines?.count, PAPERS[id].lines, `${id}: the paper's count of ruled lines`);
      const cols = (form.lines?.cells ?? []).flatMap((c) => (c.col ? [c.col] : []));
      assert.deepEqual([...cols].sort(), layout.columns.map((c) => c.key).sort(), `${id}: each column of the record on every line, once`);
      continue;
    }
    // A certificate's lines: every written column on the lines the paper writes it on, each once; a printed column's
    // words (F/QC/25's numbers and descriptions) on every line.
    const grid = cellsOf(id).filter((c) => c.col !== undefined);
    for (const col of layout.columns) {
      const lines = grid
        .filter((c) => c.col === col.key)
        .map((c) => c.ln ?? -1)
        .sort((a, b) => a - b);
      // (a printed column the paper prints once over each of its tables, F-QC-14's check headings, is listed with its lines)
      if (col.fixed && !PAPERS[id].written?.[col.key]) {
        const count = layout.rowMode.kind === "fixedRows" ? layout.rowMode.rows.length : 0;
        assert.deepEqual(lines, Array.from({ length: count }, (_, i) => i), `${id}: ${col.key} printed on every line`);
      } else assert.deepEqual(lines, PAPERS[id].written?.[col.key], `${id}: ${col.key} on the paper's lines`);
    }
  }
});

test("every row is the paper's width, and the rows fit its one A4 page where the paper's do, nothing at an edge", () => {
  for (const [id, form] of Object.entries(QC_PAPER_TABLES)) {
    const width = PAPERS[id].width;
    const rows = [...form.head, ...form.body, ...(form.lines ? [{ h: form.lines.h, cells: lineRow(form, 0) }] : []), ...form.foot];
    for (const [i, row] of rows.entries()) {
      const w = row.cells.reduce((a, c) => a + c.w, 0);
      assert.ok(Math.abs(w - width) < 0.05, `${id} row ${i}: ${w} mm`);
    }
    const height = [...form.head, ...form.body, ...form.foot].reduce((a, r) => a + r.h, 0) + (form.lines ? form.lines.h * form.lines.count : 0);
    const [pageW, pageH] = form.page === "portrait" ? [210, 297] : [297, 210];
    // Nothing cut at any edge of the A4 page: 4 mm kept clear at its foot, and at least 5 mm at either side.
    assert.ok(form.top + height <= pageH - 4, `${id}: ${form.top + height} mm of the page's ${pageH}`);
    assert.ok(form.left >= 5 && form.left + width <= pageW - 2, `${id}: inside the page's width (${form.left} + ${width} of ${pageW})`);
  }
});

test("the sheet is drawn in its three parts, its boxes bound as every sheet's, the paper's place on the page on it", async () => {
  for (const id of Object.keys(QC_PAPER_TABLES)) {
    const html = await sheet(id);
    const form = QC_PAPER_TABLES[id];
    assert.ok(
      html.includes(`<div class="paper-sheet headings-as-printed paper-table-sheet" data-bind-record="pt-${id}" data-paper="${form.page}" data-paper-left="${form.left}" data-sheet="${id}" data-paper-form="table"`),
      id
    );
    for (const part of ["head", "body"]) assert.match(html, new RegExp(`<table class="pt-table pt-${part} pt-font-[a-z]+( pt-frame)?"[^>]*data-paper-part="${part}"`), `${id} ${part}`);
    if (form.foot.length > 0) assert.match(html, /<table class="pt-table pt-foot pt-font-[a-z]+( pt-frame)?"[^>]*data-paper-part="foot"/, `${id} foot`);
    // The header block of the print suites (the head's doc-header), the body's table, the foot.
    assert.ok(html.indexOf('<div class="paper-head"><div class="doc-header doc-header-paper">') >= 0 && html.indexOf('<div class="paper-foot">') > html.indexOf('<div class="paper-body">'));
    const boxes = Array.from(html.matchAll(/<(input|textarea|select)\b[^>]*>/g), (m) => m[0]);
    // A register: a box for each column on each line the record holds (a new record holds the paper's count or one line).
    const held = (createDefaultData(docOf(id), DAY, master) as LogSheetData).rows.length;
    const written = (c: PaperCell) => !!c.col && !layoutOf(id).columns.find((k) => k.key === c.col)?.fixed;
    const least = id === "qc-coa-corrugated" || id.startsWith("qc-ruler-verification") ? 25 : form.lines ? held * form.lines.cells.filter(written).length : 40;
    assert.ok(boxes.length >= least, `${id}: ${boxes.length} boxes`);
    assert.ok(boxes.every((b) => /data-bind="(header|rows)\//.test(b)), `${id}: every box bound where the record keeps it`);
    assert.ok(boxes.every((b) => !/ disabled=""/.test(b)), `${id}: open for writing, none locked`);
    // A signed-off record shows the same cells, none to type into.
    const locked = await sheet(id, false);
    assert.ok(Array.from(locked.matchAll(/<(input|textarea)\b[^>]*>/g)).every((m) => / disabled=""/.test(m[0])), `${id}: signed off, nothing typed into`);
  }
});

test("a format the plant has edited since is drawn as every grid is: the paper only while it fits the format", () => {
  for (const id of Object.keys(QC_PAPER_TABLES)) assert.ok(paperTableFits(QC_PAPER_TABLES[id], layoutOf(id)), `${id}: the paper fits its issued format`);
  const layout = layoutOf("qc-obsolete-artwork");
  const form = QC_PAPER_TABLES["qc-obsolete-artwork"];
  assert.equal(paperTableFits(form, { ...layout, columns: [...layout.columns, { key: "batchNo", label: "Batch No.", type: "text" as const }] }), false, "a column added");
  assert.equal(paperTableFits(form, { ...layout, columns: layout.columns.filter((c) => c.key !== "remarks") }), false, "a column taken off");
  // F-QC-14: a check's line taken off its format (or one added) and the paper's checks no longer stand where it draws them.
  const label = layoutOf("qc-test-reliability-label");
  const rows = label.rowMode.kind === "fixedRows" ? label.rowMode.rows : [];
  assert.equal(paperTableFits(QC_PAPER_TABLES["qc-test-reliability-label"], { ...label, rowMode: { kind: "fixedRows", rows: rows.slice(1) } }), false, "a printed line taken off");
  assert.equal(paperTableFits(QC_PAPER_TABLES["qc-test-reliability-label"], { ...label, rowMode: { kind: "fixedRows", rows: [...rows, { parameter: "Extra" }] } }), false, "a printed line added");
  const ruler = layoutOf("qc-ruler-verification");
  assert.equal(paperTableFits(QC_PAPER_TABLES["qc-ruler-verification"], { ...ruler, headerFields: [...ruler.headerFields, { key: "remark", label: "Remark", type: "text" as const }] }), false, "a box added");
});

test("F-QC-14 is the workbook's one framed table: each check's own small table, its specification underlined, the names typed once and written in every table", () => {
  for (const [id, checks, numbered] of [
    ["qc-test-reliability-label", 8, true],
    ["qc-test-reliability-sleeve", 5, false],
  ] as const) {
    const form = QC_PAPER_TABLES[id];
    const cells = cellsOf(id);
    assert.equal(form.frame, "heavy", `${id}: the heavy frame`);
    assert.equal(form.numberOffPaper, true, `${id}: the revision's date and the page on the screen's strip alone`);
    // The Label prints "F-QC-14/00" at the title's left; the Sleeve prints no number.
    assert.equal(cells.some((c) => c.t === "{formatNo}/{revisionNo}"), numbered, `${id}: its number as printed`);
    // Each check's heading over its table, once; its specification underlined where the workbook underlines it.
    const headings = cells.filter((c) => c.col === "parameter");
    assert.equal(headings.length, checks, `${id}: a heading for each check`);
    // The names: typed in the first table, written again in each of the others; the FG code in the finished job's tables.
    const typed = cells.filter((c) => c.sentence && !c.sentence.copy).map((c) => c.sentence!.box);
    const again = cells.filter((c) => c.sentence?.copy).map((c) => c.sentence!.box);
    assert.deepEqual(typed.sort(), ["date", "fgCode", "inspector1", "inspector2", "inspector3", "inspector4"], `${id}: each box typed once`);
    for (let i = 1; i <= 4; i++) assert.equal(again.filter((k) => k === `inspector${i}`).length, checks - 1, `${id}: inspector ${i}'s name in every other table`);
    assert.equal(again.filter((k) => k === "fgCode").length, Math.floor(checks / 2) - 1, `${id}: the FG code in the finished job's other tables`);
    // The Conclusions: each check's box beside its "Conclusion", printed as its words.
    const conclusions = cells.filter((c) => c.box?.startsWith("conclusion"));
    assert.equal(conclusions.length, checks);
    assert.ok(conclusions.every((c) => c.pw && c.ov), `${id}: a Conclusion prints as its words, on its cell's middle`);
    assert.equal(cells.filter((c) => c.t === "Conclusion").length, checks);
  }
  const label = cellsOf("qc-test-reliability-label").filter((c) => c.col === "parameter");
  // "Coloue shade: Should be OK" is one line, not underlined; every other specification is the heading's second line.
  assert.deepEqual(label.map((c) => c.ul), [[1], [1], [1], [1], [1], [], [1], [1]]);
  // The Sleeve: "Thickness: 40 micron" underlined whole, Dimension's specification, the other three not at all.
  assert.deepEqual(cellsOf("qc-test-reliability-sleeve").filter((c) => c.col === "parameter").map((c) => c.ul), [[0], [1], [], [], []]);
});

test("F-QC-14 drawn: the words of the workbook, the boxes the record's, the names written again in each table", async () => {
  const html = await sheet("qc-test-reliability-label");
  const words = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.equal(words.split("Conclusion").length - 1, 8, "a Conclusion under each table");
  assert.equal(words.split("Inspector - 1").length - 1, 8, "Inspector - 1 over his name in every table");
  assert.equal((html.match(/data-box="inspector1"/g) ?? []).length, 1, "his name typed in the first table");
  assert.equal((html.match(/data-copies="inspector1"/g) ?? []).length, 7, "and written again in the seven others");
  assert.equal((html.match(/<span class="pt-ul">/g) ?? []).length, 7, "each specification underlined, as the format's heading has it");
  for (const absent of ["FG Code", "Conclusion (GSM - Total)", "Paper Reel SAP batch no. / Roll no. / sample no."]) assert.ok(!words.includes(absent), `"${absent}" is not on the paper`);
  // Every line of every check is the record's: the sample and the four readings, typed where the paper writes them.
  assert.equal((html.match(/data-pt-col="sampleNo"/g) ?? []).length, 24);
  assert.equal((html.match(/<td[^>]*data-pt-blank=""/g) ?? []).length, 5, "the blank rows between the four bands (light under the left table after the second and third)");
});

test("the stylesheet: the paper table's rules before the reduced-motion block, no !important of its own, the paper's margin in print", () => {
  const begin = css.indexOf("/* QC-PAPER-TABLES begin */");
  const end = css.indexOf("/* QC-PAPER-TABLES end */");
  assert.ok(begin > 0 && end > begin);
  const block = css.slice(begin, end);
  assert.ok(!block.includes("!important"));
  assert.ok(end < css.lastIndexOf("@media (prefers-reduced-motion: reduce)"), "the reduced-motion block stays the stylesheet's last word");
  assert.match(block, /\[data-print-doc\]:has\(\.paper-sheet\[data-paper-form="table"\]\) \{ padding: 0; \}/);
  assert.match(block, /padding: calc\(var\(--pt-top\) \* var\(--u\)\) 0 0 calc\(var\(--pt-left\) \* var\(--u\)\)/, "the paper's own place on the page, as padding (a margin pushed a blank second page)");
});
