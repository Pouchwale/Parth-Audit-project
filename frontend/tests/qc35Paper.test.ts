// F/QC/35 as the paper the owner sent on 24-Nov-2026 (REQUIREMENTS §313).
import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition, LogSheetData, RecordInstance } from "../src/types";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { SEED_DOCUMENTS } from "../src/data/seed/documentDefinitions";
import { SEED_MASTER_DATA } from "../src/data/seed/masterData";
import { autoFillRecord } from "../src/engine/autoFill";
import { choiceWords } from "../src/engine/paperLayout";
import { inPaperWords } from "../src/data/qc35WordsMigration";

const ID = "qc-inspection-slitting";
const layout = getLogSheetLayout(ID)!;
const doc = (SEED_DOCUMENTS as DocumentDefinition[]).find((d) => d.id === ID)!;

test("the paper's boxes, lines, statuses and signatures, in its words", () => {
  assert.equal(doc.formatNo, "F/QC/35");
  assert.equal(doc.name, "Inspection Record – Slitting - Lamination Grade Film");
  assert.equal(layout.headerColumns, 2);
  assert.ok(layout.srNoFullStop);
  assert.deepEqual(layout.headerFields.map((f) => f.label), ["JOB CODE (FG CODE)", "PO NUMBER", "Date / SHIFT", "Laminated – Mother Roll number", "SUBSTRATE DETAILS"]);
  assert.deepEqual(layout.columns.map((c) => c.label), ["TEST PARAMETERS", "SPECIFICATION", "OBSERVATION"]);
  assert.ok(layout.rowMode.kind === "fixedRows");
  assert.deepEqual(layout.rowMode.rows.map((r) => [r.parameter, r.specification]), [
    ["BOND STRENGTH", "FG Product Specification"],
    ["ODOUR TEST", "No abnormal odour"],
    ["SLITTED ROLL WIDTH (mm)", "As per Job card"],
  ]);
  const foot = layout.footerFields!;
  assert.deepEqual(foot.find((f) => f.key === "lotStatus")!.choicesAcross, ["ACCEPTED", "REJECT / SCRAP", "SEGREGATION", "ACCEPTED ON DEVIATION"]);
  assert.deepEqual(foot.filter((f) => f.printedBelow).map((f) => [f.printedLabel, f.printedBelow]), [["INSPECTED BY", "QA INSPECTOR"], ["APPROVED BY", "QA MANAGER"]]);
  assert.deepEqual(layout.notesAtFoot, ["308/9, GIDC, DEDIYASAN, MEHSANA, GUAJRAT, INDIA - 384002"]);
});

test("filled: the date and shift in one box, as the paper writes them", () => {
  const filled = autoFillRecord(doc, "2026-11-24", SEED_MASTER_DATA, undefined)!.data as LogSheetData;
  assert.equal(filled.header.shift, "24-11-2026 / 1st");
});

test("an open sheet made before takes the paper's words; a status written before is still ticked", () => {
  const old = {
    id: "r", documentId: ID, dueDate: "2026-11-25", status: "Due", isDemo: false,
    data: { header: { lotStatus: "Accepted" }, rows: [{ id: "a", parameter: "Bond Strength", specification: "FG Product Specification", observation: "L1 = 0.3 kg" }, { id: "b", parameter: "Odour Test" }, { id: "c", parameter: "Slitted Roll Width (mm)" }] },
  } as unknown as RecordInstance;
  const next = inPaperWords(old)!;
  assert.deepEqual(next.rows.map((r) => r.parameter), ["BOND STRENGTH", "ODOUR TEST", "SLITTED ROLL WIDTH (mm)"]);
  assert.equal(next.rows[0].observation, "L1 = 0.3 kg");
  assert.equal(next.header.lotStatus, "ACCEPTED");
  assert.equal(inPaperWords({ ...old, data: next } as RecordInstance), null, "run again: nothing");
  const lot = layout.footerFields!.find((f) => f.key === "lotStatus")!;
  assert.deepEqual(choiceWords(lot, "Accepted")!.filter((w) => w.chosen).map((w) => w.word), ["ACCEPTED"]);
});
