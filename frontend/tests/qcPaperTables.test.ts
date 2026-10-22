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
import { QC_PAPER_TABLES, paperTableFor, type PaperCell } from "../src/data/seed/qcPaperTables";
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
};

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
    const drawn = cellsOf(id).flatMap((c) => (c.box ? [c.box] : c.sentence ? [c.sentence.box] : []));
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
      const lines = grid.filter((c) => c.col === col.key).map((c) => c.ln);
      if (col.fixed) {
        const count = layout.rowMode.kind === "fixedRows" ? layout.rowMode.rows.length : 0;
        assert.deepEqual(lines, Array.from({ length: count }, (_, i) => i), `${id}: ${col.key} printed on every line`);
      } else assert.deepEqual(lines, PAPERS[id].written?.[col.key], `${id}: ${col.key} on the paper's lines`);
    }
  }
});

test("every row is the paper's width, and the rows fit its one A4 page where the paper's do, nothing at an edge", () => {
  for (const [id, form] of Object.entries(QC_PAPER_TABLES)) {
    const width = PAPERS[id].width;
    const rows = [...form.head, ...form.body, ...(form.lines ? [{ h: form.lines.h, cells: form.lines.cells }] : []), ...form.foot];
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
    const least = id === "qc-coa-corrugated" ? 25 : form.lines ? held * form.lines.cells.filter((c) => c.col).length : 40;
    assert.ok(boxes.length >= least, `${id}: ${boxes.length} boxes`);
    assert.ok(boxes.every((b) => /data-bind="(header|rows)\//.test(b)), `${id}: every box bound where the record keeps it`);
    assert.ok(boxes.every((b) => !/ disabled=""/.test(b)), `${id}: open for writing, none locked`);
    // A signed-off record shows the same cells, none to type into.
    const locked = await sheet(id, false);
    assert.ok(Array.from(locked.matchAll(/<(input|textarea)\b[^>]*>/g)).every((m) => / disabled=""/.test(m[0])), `${id}: signed off, nothing typed into`);
  }
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
