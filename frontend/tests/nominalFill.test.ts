// ONE PRESS FILLS A CALIBRATION SHEET AS THE PLANT'S PAGES ARE FILLED (REQUIREMENTS §136, the owner, 28-Oct-2026): F/QC/17
// read as the master's at every point, F/QC/11 every plate at its size - in the presser's name, every box still theirs -
// and nothing of it written by DCRS itself onto a sheet nobody has looked at (§98). Run: npm run test:unit -- nominalFill
import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition, LogSheetData } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { RULER_300_ID, RULER_600_ID } from "../src/data/seed/qcRulerVerificationLayouts";
import { createDefaultData } from "../src/engine/recordDefaults";
import { withComputedCells } from "../src/engine/computedCells";
import { nominalFill, nominalFillLabel, nominalFillOnOpen, nominalFillWaits } from "../src/engine/nominalFill";
import { prepareKnownParts } from "../src/engine/knownParts";

ensureDocumentsSeeded();
ensureMasterSeeded();
const master = masterRepository.get();
const doc = (id: string): DocumentDefinition => documentRepository.getByIdUnscoped(id)!;
const GSM = "qc-gsm-plate-calibration";

test("F/QC/17, both scales: every point read as the master's, the Difference 0.0 and the Status Pass worked out, the presser's name", () => {
  for (const [id, points] of [
    [RULER_600_ID, [100, 200, 300, 400, 500, 490]],
    [RULER_300_ID, [50, 100, 150, 200, 250, 290]],
  ] as const) {
    const blank = createDefaultData(doc(id), "2026-10-28", master) as LogSheetData;
    const filled = withComputedCells(id, nominalFill(id, blank, "Kapila Barad")!);
    assert.deepEqual(filled.rows.map((r) => r.observed), [...points], id);
    assert.ok(filled.rows.every((r) => r.difference === "0.0"), id);
    assert.equal(filled.rows[0].status, "Pass", id);
    assert.equal(filled.rows[0].performedBy, "Kapila Barad", `${id}: the name of whoever pressed it, once, down the lines`);
    assert.ok(filled.rows.slice(1).every((r) => r.status === "" && r.performedBy === ""), id);
    assert.deepEqual(filled.rows.map((r) => r.masterReading), blank.rows.map((r) => r.masterReading), "the printed points as they were");
  }
});

test("F/QC/11: every plate at its size on its four lines, 0% worked out, Pass and the presser's name below", () => {
  const blank = createDefaultData(doc(GSM), "2026-11-03", master) as LogSheetData;
  const filled = withComputedCells(GSM, nominalFill(GSM, blank, "Kapila Barad")!);
  for (const line of filled.rows.slice(0, 4)) {
    assert.deepEqual([line.p54, line.p55, line.p56, line.p57], ["20 x 20cm", "10 x 10cm", "5 x 5cm", "2.5 x 2.5cm"], String(line.parameter));
    assert.deepEqual([line.p54dev, line.p55dev, line.p56dev, line.p57dev], ["0%", "0%", "0%", "0%"]);
  }
  const [pass, sign] = filled.rows.slice(4);
  assert.deepEqual([pass.p54, pass.p55, pass.p56, pass.p57], ["Pass", "Pass", "Pass", "Pass"]);
  assert.deepEqual([sign.p54, sign.p55, sign.p56, sign.p57], ["Kapila Barad", "Kapila Barad", "Kapila Barad", "Kapila Barad"]);
  assert.deepEqual(filled.rows.map((r) => r.parameter), ["Tasted-1", "2", "3", "4", "Pass/Fail", "Sign."], "the paper's lines as they were");
});

test("F/QC/12: each Tested Value the exact weight placed, 0% and Pass worked out, Tested By and Sign the opener's name, the Next Due Date theirs", () => {
  const SCALE = "qc-weight-scale-calibration";
  // (the tolerance the page on file carries onto every new sheet, 0.05 %, which Pass / Fail is judged by)
  const fresh = createDefaultData(doc(SCALE), "2026-11-01", master) as LogSheetData;
  const blank: LogSheetData = { ...fresh, header: { ...fresh.header, acceptableTolerance: "0.05 %" } };
  const filled = withComputedCells(SCALE, nominalFillOnOpen(SCALE, blank, "Kapila Barad")!);
  const line = filled.rows[0];
  assert.deepEqual([line.testedValue1, line.testedValue2, line.testedValue3, line.testedValue4, line.testedValue5], [line.weight1, line.weight2, line.weight3, line.weight4, line.weight5]);
  assert.equal(line.weight1, "50 gm", "the standard weights as written on every new line (§117)");
  assert.deepEqual([line.deviation1, line.deviation2, line.deviation3, line.deviation4, line.deviation5], ["0%", "0%", "0%", "0%", "0%"]);
  assert.equal(line.passFail, "Pass");
  assert.deepEqual([line.testedBy, line.sign], ["Kapila Barad", "Kapila Barad"]);
  assert.ok(!line.nextDueDate, "the Next Due Date is the person's");
  assert.equal(nominalFillOnOpen(SCALE, filled, "x"), null, "written on: left as it is");
  const typed = { ...blank, rows: blank.rows.map((r) => ({ ...r, testedValue4: "500.010" })) };
  assert.equal(nominalFillOnOpen(SCALE, typed, "x"), null, "a value the scale showed, typed: left as it is");
});

test("only these four documents are filled on opening; a new Live sheet still comes with nothing observed on it", () => {
  assert.equal(nominalFillLabel(RULER_600_ID), "ruler");
  assert.equal(nominalFillLabel(RULER_300_ID), "ruler");
  assert.equal(nominalFillLabel(GSM), "gsm");
  assert.equal(nominalFillLabel("qc-weight-scale-calibration"), "scale");
  assert.equal(nominalFillLabel("qc-calibration-master-list"), null);
  assert.equal(nominalFill("qc-viscosity", { header: {}, rows: [] }, "x"), null);
  const known = prepareKnownParts(doc(RULER_600_ID), "2026-10-28", master, undefined)!.data as LogSheetData;
  assert.ok(known.rows.every((r) => (r.observed === null || r.observed === "") && r.status === "" && r.performedBy === ""), "DCRS writes no reading by itself (§98)");
});

test("on opening: a sheet nothing is observed on is filled in the opener's name; one written on - a reading, or carried as the last one was - is left", () => {
  const blank = createDefaultData(doc(RULER_600_ID), "2026-10-28", master) as LogSheetData;
  assert.equal(nominalFillWaits(RULER_600_ID, blank), true);
  const opened = nominalFillOnOpen(RULER_600_ID, blank, "Kapila Barad")!;
  assert.deepEqual(opened.rows.map((r) => r.observed), [100, 200, 300, 400, 500, 490]);
  assert.equal(opened.rows[0].performedBy, "Kapila Barad");
  assert.equal(nominalFillOnOpen(RULER_600_ID, opened, "Somebody Else"), null, "written on: left as it is");
  const oneReading = { ...blank, rows: blank.rows.map((r, i) => (i === 2 ? { ...r, observed: 301 } : r)) };
  assert.equal(nominalFillOnOpen(RULER_600_ID, oneReading, "x"), null, "a reading a person wrote: left as it is");
  const gsm = createDefaultData(doc(GSM), "2026-11-03", master) as LogSheetData;
  assert.equal(nominalFillWaits(GSM, gsm), true);
  const measured = { ...gsm, rows: gsm.rows.map((r, i) => (i === 0 ? { ...r, p55: "10.1 x 10cm" } : r)) };
  assert.equal(nominalFillOnOpen(GSM, measured, "x"), null, "a plate measured: left as it is");
  assert.equal(nominalFillOnOpen("qc-calibration-master-list", blank, "x"), null);
  assert.equal(nominalFillOnOpen(RULER_600_ID, undefined, "x"), null);
});
