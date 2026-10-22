// THE QC PAPERS DRAWN AS THEIR OWN WORD TABLE (REQUIREMENTS §117, round 2 of 20-Oct-2026).
//
// The owner: "make sure each and every part should be editable and same". F/QC/06 and F/QC/07 are one Word table from
// the letterhead to the corporate office strip, drawn row by row in the paper's millimetres (data/seed/qcPaperTables.ts,
// components/records/PaperTableSheet.tsx). Pinned here: every box of the record has its cell on the paper and every
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

test("the certificates are drawn as their own Word table; no other document is", () => {
  assert.deepEqual(Object.keys(QC_PAPER_TABLES).sort(), ["qc-coa-label", "qc-coa-sleeve"]);
  assert.equal(paperTableFor("qc-bopp-film"), undefined, "every other document is drawn as it was");
  for (const id of Object.keys(QC_PAPER_TABLES)) assert.equal(QC_PAPER_TABLES[id].page, "portrait", `${id}: one portrait page, as its paper`);
});

test("every box of the record has its cell on the paper, once, and every cell's box is the record's", () => {
  for (const id of Object.keys(QC_PAPER_TABLES)) {
    const layout = layoutOf(id);
    const keys = [...layout.headerFields, ...(layout.footerFields ?? [])].map((f) => f.key);
    const drawn = cellsOf(id).flatMap((c) => (c.box ? [c.box] : c.sentence ? [c.sentence.box] : []));
    assert.deepEqual([...drawn].sort(), [...keys].sort(), `${id}: the paper's cells are the record's boxes, each once`);
    // The grid's lines: every colour's two written cells, under its printed number.
    const grid = cellsOf(id).filter((c) => c.col !== undefined);
    for (const col of layout.columns) {
      const lines = grid.filter((c) => c.col === col.key).map((c) => c.ln);
      assert.deepEqual(lines, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], `${id}: ${col.key} on each of the ten colour lines`);
    }
  }
});

test("every row is the paper's width, and the rows fit its one A4 page where the paper's do", () => {
  for (const [id, form] of Object.entries(QC_PAPER_TABLES)) {
    const rows = [...form.head, ...form.body, ...form.foot];
    for (const [i, row] of rows.entries()) {
      const w = row.cells.reduce((a, c) => a + c.w, 0);
      assert.ok(Math.abs(w - 193.4) < 0.05, `${id} row ${i}: ${w} mm`);
    }
    const height = rows.reduce((a, r) => a + r.h, 0);
    assert.ok(form.top + height <= 297 - 4, `${id}: ${form.top + height} mm of the page's 297`);
    assert.ok(form.left + 193.4 <= 210 - 2, `${id}: inside the page's width`);
  }
});

test("the sheet is drawn in its three parts, its boxes bound as every sheet's, the paper's place on the page on it", async () => {
  for (const id of Object.keys(QC_PAPER_TABLES)) {
    const html = await sheet(id);
    assert.match(html, /<div class="paper-sheet headings-as-printed paper-table-sheet" data-bind-record="pt-[^"]+" data-paper="portrait" data-paper-left="10.58" data-sheet="[^"]+" data-paper-form="table"/, id);
    for (const part of ["head", "body", "foot"]) assert.match(html, new RegExp(`<table class="pt-table pt-${part}"[^>]*data-paper-part="${part}"`), `${id} ${part}`);
    // The header block of the print suites (the head's doc-header), the body's table, the foot.
    assert.ok(html.indexOf('<div class="paper-head"><div class="doc-header doc-header-paper">') >= 0 && html.indexOf('<div class="paper-foot">') > html.indexOf('<div class="paper-body">'));
    const boxes = Array.from(html.matchAll(/<(input|textarea|select)\b[^>]*>/g), (m) => m[0]);
    assert.ok(boxes.length > 40, `${id}: ${boxes.length} boxes`);
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
