// A COLUMN THE PLANT ADDS TO A QC PAPER HAS A WIDTH (engine/paperGridWidths.ts, 25-Oct-2026). The QC papers are drawn on
// their measured grids, one width per column their issued layout draws, in a table of fixed layout as wide as the paper;
// a column Edit format added had no width there and was drawn 0 mm wide (F/QC/01, found by tests/e2e_portal_controls.py).
// What this file holds:
//
//   * every measured paper grid has one width per column its issued layout draws, so the widths can follow the keys;
//   * a grid as issued keeps the paper's own widths, the very same array;
//   * an added column takes a share - an average column of the paper's, or as wide as its typing width reads - and the
//     grid stays the paper's width, the paper's own columns in their proportions;
//   * a column taken out gives its width to the others; a moved one takes its width along;
//   * the sheet itself: F/QC/01 with a column added draws five columns, none of them 0 mm, the paper's width in all, and
//     F/QC/23's Arial cells stay on its parameter and specification when a column is put in front of them.
//
// Run: npm run test:unit -- paperGridWidths
import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import type { DocumentDefinition, LogSheetData, LogSheetLayout, MasterData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrMasterSeeded } from "../src/data/repositories/hrMasterRepository";
import { SEED_DOCUMENTS } from "../src/data/seed/documentDefinitions";
import { getIssuedLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { incomingGeometryFor } from "../src/data/seed/qcIncomingGeometry";
import { lineClearanceGeometryFor } from "../src/data/seed/qcLineClearanceGeometry";
import { calibrationGeometryFor } from "../src/data/seed/qcCalibrationGeometry";
import { reportGeometryFor } from "../src/data/seed/qcReportGeometry";
import { dropFormatEdit, saveFormatEdit } from "../src/data/formatEdits";
import { addColumn } from "../src/engine/formatOps";
import { gridLines } from "../src/engine/paperLayout";
import { numbersOwnLines } from "../src/engine/formLineNumbers";
import { createDefaultData } from "../src/engine/recordDefaults";
import { drawnColumnOf, paperGridWidths } from "../src/engine/paperGridWidths";

// store/router.tsx reads window.location the moment it loads; the harness stands up none.
if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "#/dashboard", hostname: "localhost" }, configurable: true, writable: true });
}

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrMasterSeeded();
const master: MasterData = masterRepository.get();
const DAY = "2026-10-25";

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const near = (a: number, b: number, within = 0.05) => Math.abs(a - b) <= within;
const issuedOf = (id: string): LogSheetLayout => {
  const layout = getIssuedLogSheetLayout(id);
  assert.ok(layout, id);
  return layout!;
};
const firstLine = (id: string) => gridLines(issuedOf(id)).first;
const NUMBERED = { paper: true, drawn: true };

// F/QC/01's paper: Sr. No. 23.1, TEST PARAMETERS 60.6, SPECIFICATION 45.1, OBSERVATION 56.8 (mm).
const F_QC_01 = incomingGeometryFor("qc-bopp-film")!.grid.cols;
const F_QC_01_LINE = firstLine("qc-bopp-film");

// ---------------------------------------------------------------------------
// 1. Every measured paper grid is one width per issued column

test("every QC paper drawn on its measured grid has one width per column its issued layout draws, the Sr. No. first where the sheet numbers its lines", () => {
  const checked: string[] = [];
  for (const d of SEED_DOCUMENTS) {
    if (d.kind !== "log-sheet") continue;
    const cols = incomingGeometryFor(d.id)?.grid.cols ?? lineClearanceGeometryFor(d.id)?.cols ?? calibrationGeometryFor(d.id)?.grid.cols ?? reportGeometryFor(d.id)?.grid.cols;
    if (!cols) continue;
    const layout = issuedOf(d.id);
    const drawn = (numbersOwnLines(layout) ? 0 : 1) + gridLines(layout).first.length;
    assert.equal(cols.length, drawn, `${d.formatNo} (${d.id}): ${cols.length} widths for ${drawn} columns`);
    checked.push(d.id);
  }
  // 15 incoming records, 7 line clearances, F/QC/11 and F/QC/12, F/QC/20's destruction record and F/QC/29's two reports.
  assert.ok(checked.length >= 27, `${checked.length} measured grids`);
});

// ---------------------------------------------------------------------------
// 2. The widths of a grid the plant has changed

test("a grid as issued is drawn on the paper's own widths, untouched", () => {
  assert.equal(paperGridWidths(F_QC_01, F_QC_01_LINE, F_QC_01_LINE, NUMBERED), F_QC_01);
  // A renamed column is the same column: its key is kept.
  const renamed = F_QC_01_LINE.map((c) => (c.key === "observation" ? { ...c, label: "OBSERVATION / RESULT" } : c));
  assert.equal(paperGridWidths(F_QC_01, F_QC_01_LINE, renamed, NUMBERED), F_QC_01);
});

test("an added column takes a share of the paper's width: an average column of the paper's, the paper's own columns narrowed together", () => {
  const w = paperGridWidths(F_QC_01, F_QC_01_LINE, [...F_QC_01_LINE, { key: "batchNo" }], NUMBERED);
  assert.equal(w.length, 5);
  assert.ok(near(sum(w), sum(F_QC_01)), `the grid stays the paper's width: ${sum(w)} mm`);
  assert.ok(w.every((x) => x > 10), `no column drawn narrow: ${w.join(", ")}`);
  for (let i = 1; i < 4; i++) assert.ok(near(w[i] / w[0], F_QC_01[i] / F_QC_01[0], 0.002), `the paper's proportions: ${w.join(", ")}`);
  const average = sum(F_QC_01.slice(1)) / 3;
  assert.ok(near(w[4] / w[0], average / F_QC_01[0], 0.002), `the new one an average column: ${w[4]} mm`);
});

test("a column with a typing width of its own (a copy, say) comes in as wide as that width reads beside the paper's columns", () => {
  const w = paperGridWidths(F_QC_01, F_QC_01_LINE, [...F_QC_01_LINE, { key: "copy", width: 100 }], NUMBERED);
  const mmPerPx = (60.6 + 45.1 + 56.8) / sum(F_QC_01_LINE.map((c) => c.width ?? 0));
  assert.ok(near(w[4] / w[0], (100 * mmPerPx) / F_QC_01[0], 0.002), `${w.join(", ")}`);
  assert.ok(near(sum(w), sum(F_QC_01)));
});

test("a column taken out gives its width to the others; a moved one takes its width along", () => {
  const without = paperGridWidths(F_QC_01, F_QC_01_LINE, F_QC_01_LINE.filter((c) => c.key !== "specification"), NUMBERED);
  assert.equal(without.length, 3);
  assert.ok(near(sum(without), sum(F_QC_01)));
  assert.ok(near(without[2] / without[1], 56.8 / 60.6, 0.002), `${without.join(", ")}`);
  const [parameter, specification, observation] = F_QC_01_LINE;
  assert.deepEqual(paperGridWidths(F_QC_01, F_QC_01_LINE, [observation, parameter, specification], NUMBERED), [23.1, 56.8, 60.6, 45.1]);
});

test("a sheet that numbers its own lines (the line clearances) has no Sr. No. of the sheet's: its columns alone are laid out", () => {
  const id = "qc-line-clearance-printing";
  const paper = lineClearanceGeometryFor(id)!.cols;
  const line = firstLine(id);
  const plain = { paper: false, drawn: false };
  assert.equal(paperGridWidths(paper, line, line, plain), paper);
  const w = paperGridWidths(paper, line, [...line, { key: "lotNo" }], plain);
  assert.equal(w.length, paper.length + 1);
  assert.ok(near(sum(w), sum(paper)) && w.every((x) => x > 0), `${w.join(", ")}`);
});

test("a paper measured some other way than one width a column is drawn as it is", () => {
  const odd = [10, 20, 30];
  assert.equal(paperGridWidths(odd, [{ key: "a" }], [{ key: "a" }, { key: "b" }], NUMBERED), odd);
});

test("the paper's column is found by its key wherever the plant has put it", () => {
  const issued = [{ key: "parameter" }, { key: "specification" }, { key: "observation" }];
  const drawn = [{ key: "lot" }, { key: "parameter" }, { key: "observation" }];
  assert.equal(drawnColumnOf(0, issued, drawn), 1);
  assert.equal(drawnColumnOf(1, issued, drawn), -1, "taken out");
  assert.equal(drawnColumnOf(2, issued, drawn), 2);
});

// ---------------------------------------------------------------------------
// 3. The sheet as the record page draws it

const docOf = (id: string): DocumentDefinition => {
  const doc = documentRepository.getById(id);
  assert.ok(doc, id);
  return doc!;
};

/** The sheet as the record page draws it (components/records/LogSheetRecordView.tsx), as markup. */
async function sheet(documentId: string): Promise<string> {
  const [view, auth, store, router] = await Promise.all([
    import("../src/components/records/LogSheetRecordView"),
    import("../src/store/AuthContext"),
    import("../src/store/AppStore"),
    import("../src/store/router"),
  ]);
  const record = {
    id: `widths-${documentId}`,
    documentId,
    periodKey: `${documentId}:${DAY}`,
    dueDate: DAY,
    status: "In Progress",
    isDemo: false,
    data: createDefaultData(docOf(documentId), DAY, master) as LogSheetData,
    createdAt: `${DAY}T03:00:00.000Z`,
    updatedAt: `${DAY}T03:00:00.000Z`,
  } as RecordInstance<LogSheetData>;
  return renderToStaticMarkup(
    h(auth.AuthProvider, null, h(store.AppStoreProvider, null, h(router.RouterProvider, null, h(view.LogSheetRecordView, { doc: docOf(documentId), record, editable: true, onChange: () => undefined }))))
  );
}

/** The grid's column widths, in millimetres, as the sheet's <col>s carry them. */
const colWidths = (html: string) => [...html.matchAll(/--pf-col:\s*calc\(([\d.]+) \* var\(--u\)\)/g)].map((m) => Number(m[1]));

/** The cells of the grid's first line, each its opening tag and its words. */
function firstLineCells(html: string): string[] {
  const grid = html.slice(html.indexOf("compact log-sheet"));
  const body = grid.slice(grid.indexOf("<tbody"));
  const line = body.slice(body.indexOf("<tr"), body.indexOf("</tr>"));
  return line.split("<td").slice(1);
}

test("F/QC/01 with a column added draws five columns on its paper, none of them 0 mm, the paper's width in all", async () => {
  assert.deepEqual(colWidths(await sheet("qc-bopp-film")), [...F_QC_01], "as issued: the paper's own widths");
  const { layout } = addColumn(issuedOf("qc-bopp-film"), "Batch No.");
  try {
    saveFormatEdit("qc-bopp-film", { revisionNo: "02", revisionDate: DAY, layout, revisions: [] });
    const html = await sheet("qc-bopp-film");
    const w = colWidths(html);
    assert.equal(w.length, 5, `${w.join(", ")}`);
    assert.ok(w.every((x) => x > 10), `every column has a width: ${w.join(", ")}`);
    assert.ok(near(sum(w), sum(F_QC_01)), `the paper's width: ${sum(w)} mm`);
    assert.match(html, /<th[^>]*>Batch No\.<\/th>/, "the new column's heading");
    const cells = firstLineCells(html);
    assert.equal(cells.length, 5);
    assert.match(cells[4], /<input[^>]*data-bind="rows\/@[^"]+\/batchNo/, "a box to write in on the first line, in the new column");
  } finally {
    dropFormatEdit("qc-bopp-film");
  }
});

test("F/QC/23's Arial cells stay on its parameter and specification when a column is put in front of them", async () => {
  const arialAt = (html: string) => firstLineCells(html).flatMap((c, i) => (/^[^>]*data-pf-arial=""/.test(c) ? [i] : []));
  // Its first line: Sr. No., APPERANCE., Milky White, the observation; the paper sets the second and third in Arial.
  assert.deepEqual(arialAt(await sheet("qc-starch-powder")), [1, 2]);
  const { layout } = addColumn(issuedOf("qc-starch-powder"), "Lot", { beforeKey: "parameter" });
  try {
    saveFormatEdit("qc-starch-powder", { revisionNo: "02", revisionDate: DAY, layout, revisions: [] });
    const html = await sheet("qc-starch-powder");
    assert.deepEqual(arialAt(html), [2, 3], "after the new first column: still the parameter and the specification");
    assert.equal(colWidths(html).length, 5);
  } finally {
    dropFormatEdit("qc-starch-powder");
  }
});
