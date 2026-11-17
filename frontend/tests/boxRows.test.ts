// F/QC/17'S TWO TABLES OF BOXES, THEIR ROWS THE RECORD'S OWN (REQUIREMENTS §246; the owner, 17-Nov-2026: "so this for both
// 300mm and 600mm so in that user can edit both left and right side and add and delete any row he want").
// Run: npm run test:unit -- boxRows
import test from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData } from "../src/types";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { paperTableFor } from "../src/data/seed/qcPaperTables";
import { RULER_300_ID, RULER_600_ID } from "../src/data/seed/qcRulerVerificationLayouts";
import { carriedBoxRows, hiddenBoxes, isExtraBox, listTables, rowWords, shownRows, withRecordBoxRows, withRowAdded, withRowRemoved } from "../src/engine/boxRows";
import { carriedFrom } from "../src/engine/carryForward";

const data = (over: Partial<LogSheetData> = {}): LogSheetData => ({ header: {}, rows: [], ...over });

test("both scales' two tables are lists of rows: the master's and the ruler's, seven rows each", () => {
  for (const id of [RULER_600_ID, RULER_300_ID]) {
    const tables = listTables(getLogSheetLayout(id)!);
    assert.deepEqual(tables.map((t) => [t.first, t.keys.length]), [["masterMake", 7], ["make", 7]], id);
    assert.deepEqual(tables[0].words.slice(0, 2), ["Make", "Serial number"]);
  }
});

test("a row put in under any row, its words and box the person's; any row taken off; the words typed over", () => {
  const layout = getLogSheetLayout(RULER_600_ID)!;
  const [master, ruler] = listTables(layout);
  let d = withRowAdded(data(), ruler, "serialNo", "extra-1");
  assert.deepEqual(shownRows(d, ruler).slice(0, 3), ["make", "serialNo", "extra-1"], "under Serial number");
  assert.equal(d.header["extra-1"], "");
  d = { ...d, header: { ...d.header, "extra-1": "SR-600-X" }, words: { ...d.words, headings: { ...d.words?.headings, "label:extra-1": "Model", "label:masterMake": "Brand" } } };
  assert.equal(rowWords(d, ruler, "extra-1"), "Model");
  assert.equal(rowWords(d, master, "masterMake"), "Brand", "the format's row's words typed over");
  assert.equal(rowWords(d, master, "masterRange"), "Range");
  d = withRowRemoved(d, master, "masterCalibrationReportNo");
  assert.ok(!shownRows(d, master).includes("masterCalibrationReportNo"));
  assert.deepEqual([...hiddenBoxes(layout, d)], ["masterCalibrationReportNo"], "the format's row taken off: hidden");
  const gone = withRowRemoved(d, ruler, "extra-1");
  assert.ok(!("extra-1" in gone.header) && !("label:extra-1" in (gone.words?.headings ?? {})), "an added row's box and words go with it");
  assert.ok(isExtraBox("extra-1") && !isExtraBox("make"));
});

test("the paper drawn with the record's rows: each row its words and its box; the rest of the paper as it was", () => {
  const layout = getLogSheetLayout(RULER_600_ID)!;
  const form = paperTableFor(RULER_600_ID)!;
  const [master, ruler] = listTables(layout);
  const d = withRowRemoved(withRowAdded(data(), ruler, "serialNo", "extra-1"), master, "masterCalibrationReportNo");
  const drawn = withRecordBoxRows(form, layout, d);
  assert.equal(drawn.body.length, form.body.length, "one row more, one row less");
  const boxes = drawn.body.flatMap((r) => r.cells.map((c) => c.box).filter(Boolean));
  assert.ok(boxes.includes("extra-1") && !boxes.includes("masterCalibrationReportNo"));
  const labelled = drawn.body.flatMap((r) => r.cells.filter((c) => c.rowKey)).map((c) => c.rowKey);
  assert.equal(labelled.length, 14);
  assert.deepEqual(withRecordBoxRows(form, layout, data()).body.map((r) => r.cells.map((c) => c.box ?? c.col ?? "")), form.body.map((r) => r.cells.map((c) => c.box ?? c.col ?? "")), "untouched: the paper's own rows");
});

test("a new sheet carries the last one's rows, their words and its added boxes", () => {
  const layout = getLogSheetLayout(RULER_300_ID)!;
  const [, ruler] = listTables(layout);
  const last: LogSheetData = { ...withRowAdded(data(), ruler, "serialNo", "extra-9"), rows: [] };
  last.header["extra-9"] = "SR-300";
  last.words = { headings: { "label:extra-9": "Model" } };
  const into = carriedBoxRows(layout, last, data());
  assert.deepEqual(into.boxRows, last.boxRows);
  assert.equal(into.header["extra-9"], "SR-300");
  assert.equal(into.words?.headings?.["label:extra-9"], "Model");
  const blank = data({ rows: [] });
  assert.ok(carriedFrom(layout, last, blank, "2026-12-01").boxRows, "carriedFrom carries them");
});
