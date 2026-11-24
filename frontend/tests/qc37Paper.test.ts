// F/QC/37 as the paper the owner sent on 24-Nov-2026 (REQUIREMENTS §319).
import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition, LogSheetData, RecordInstance } from "../src/types";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { SEED_DOCUMENTS } from "../src/data/seed/documentDefinitions";
import { SEED_MASTER_DATA } from "../src/data/seed/masterData";
import { autoFillRecord } from "../src/engine/autoFill";
import { choiceWords } from "../src/engine/paperLayout";
import { inPaperWords } from "../src/data/qc35WordsMigration";
import { pageFrameFor } from "../src/data/seed/qcPageFrames";
import { incomingGeometryFor } from "../src/data/seed/qcIncomingGeometry";

const ID = "qc-inspection-pouching";
const layout = getLogSheetLayout(ID)!;
const doc = (SEED_DOCUMENTS as DocumentDefinition[]).find((d) => d.id === ID)!;

test("the paper's boxes, lines, statuses and signatures, in its words", () => {
  assert.equal(doc.formatNo, "F/QC/37");
  assert.equal(doc.name, "Inspection Record – Pouching Process");
  assert.equal(layout.headerColumns, 2);
  assert.ok(layout.srNoFullStop);
  assert.deepEqual(layout.headerFields.map((f) => f.label), ["JOB CODE (FG CODE)", "PO NUMBER", "CUSTOMER NAME", "JOB NAME", "DATE/ SHIFT", "SUBSTRATE DETAILS"]);
  assert.deepEqual(layout.columns.map((c) => c.label), ["TEST PARAMETERS", "SPECIFICATION", "OBSERVATION"]);
  assert.ok(layout.rowMode.kind === "fixedRows");
  assert.deepEqual(layout.rowMode.rows.map((r) => r.parameter), [
    "POUCH HEIGHT (mm)", "POUCH WIDTH (mm)", "CENTRE SEAL WIDTH (mm)", "SIDE SEAL WIDTH (mm)", "GUSSET WIDTH (mm) (SIDE/BOTTOM)",
    "TOTAL POUCH THICKNESS (micron)", "ZIPPER POSITION FROM TOP (Only if customer requirement)", "TOTAL GSM", "Wt. OF POUCH", "TYPE OF POUCH", "LEAK TEST",
  ]);
  assert.deepEqual(layout.rowMode.rows.map((r) => r.specification), [...Array(10).fill("FG Product specification"), "NO LEAK"]);
  const foot = layout.footerFields!;
  assert.deepEqual(foot.find((f) => f.key === "lotStatus")!.choicesAcross, ["ACCEPTED", "REJECT / SCRAP", "SEGREGATION", "ACCEPTED ON DEVIATION"]);
  assert.deepEqual(foot.filter((f) => f.printedBelow).map((f) => [f.printedLabel, f.printedBelow]), [["INSPECTED BY", "QA INSPECTOR"], ["APPROVED BY", "QA MANAGER"]]);
  assert.deepEqual(layout.notesAtFoot, ["308/9, GIDC, DEDIYASAN, MEHSANA, GUAJRAT, INDIA - 384002"]);
  // Drawn on its framed page with the paper's measures: three lines of boxes, a heading and eleven lines.
  assert.ok(pageFrameFor(ID));
  const g = incomingGeometryFor(ID)!;
  assert.equal(g.head.rows.length, 3);
  assert.equal(g.grid.rows.length, 12);
});

test("filled: the date and shift in one box, the lot accepted in the paper's word", () => {
  const filled = autoFillRecord(doc, "2026-11-24", SEED_MASTER_DATA, undefined)!.data as LogSheetData;
  assert.equal(filled.header.shift, "24-11-2026 / 1st");
  assert.equal(filled.rows.length, 11);
});

test("an open sheet made before takes the paper's words; what was written stays", () => {
  const old = {
    id: "r", documentId: ID, dueDate: "2026-11-25", status: "In Progress", isDemo: false,
    data: { header: { lotStatus: "Accepted", shift: "1st" }, rows: [{ id: "a", parameter: "Pouch Height (mm)", specification: "FG Product specification", observation: "181" }, { id: "b", parameter: "Leak Test", observation: "PASS" }] },
  } as unknown as RecordInstance;
  const next = inPaperWords(old)!;
  assert.deepEqual(next.rows.map((r) => r.parameter), ["POUCH HEIGHT (mm)", "LEAK TEST"]);
  assert.deepEqual(next.rows.map((r) => r.observation), ["181", "PASS"]);
  assert.equal(next.header.lotStatus, "ACCEPTED");
  assert.equal(next.header.shift, "1st");
  assert.equal(inPaperWords({ ...old, data: next } as RecordInstance), null, "run again: nothing");
  const lot = layout.footerFields!.find((f) => f.key === "lotStatus")!;
  assert.deepEqual(choiceWords(lot, "Accepted on Deviation")!.filter((w) => w.chosen).map((w) => w.word), ["ACCEPTED ON DEVIATION"]);
});
