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
import { nominalFill, nominalFillAdded, nominalFillLabel, nominalFillOnOpen, nominalFillWaits } from "../src/engine/nominalFill";
import { newRow } from "../src/engine/recordLines";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
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

test("F/QC/12 (§142): the five weights and the fixed Tested Values 1 and 2 (0%) on the line, the opener's name on opening; 3 to 5 the person's, Pass / Fail once all are in", () => {
  const SCALE = "qc-weight-scale-calibration";
  // (the tolerance the page on file carries onto every new sheet, 0.05 %, which Pass / Fail is judged by)
  const fresh = createDefaultData(doc(SCALE), "2026-11-01", master) as LogSheetData;
  const blank: LogSheetData = { ...fresh, header: { ...fresh.header, acceptableTolerance: "0.05 %" } };
  const filled = withComputedCells(SCALE, nominalFillOnOpen(SCALE, blank, "Kapila Barad")!);
  const line = filled.rows[0];
  assert.deepEqual([1, 2, 3, 4, 5].map((i) => line[`weight${i}`]), ["0.050mg", "50.000gm", "100.000gm", "200.000gm", "400.000gm"]);
  assert.deepEqual([1, 2, 3, 4, 5].map((i) => line[`testedValue${i}`]), ["0.050mg", "50.000gm", "", "", ""]);
  assert.deepEqual([1, 2, 3, 4, 5].map((i) => line[`deviation${i}`]), ["0%", "0%", "", "", ""]);
  assert.ok(!line.passFail, "no Pass before the person's three readings");
  assert.deepEqual([line.testedBy, line.sign], ["Kapila Barad", "Kapila Barad"]);
  assert.ok(!line.nextDueDate, "the Next Due Date is the person's");
  assert.equal(nominalFillOnOpen(SCALE, filled, "x"), null, "a name on it: left as it is");
  // The person's readings, as the laboratory's page has them: the deviations follow, and Pass; one off by 0.1 %, Fail.
  const read: LogSheetData = withComputedCells(SCALE, { ...filled, rows: [{ ...line, testedValue3: "100.000gm", testedValue4: "200.020gm", testedValue5: "400.040gm" }] } as LogSheetData);
  assert.deepEqual([3, 4, 5].map((i) => read.rows[0][`deviation${i}`]), ["0%", "0.01%", "0.01%"]);
  assert.equal(read.rows[0].passFail, "Pass");
  const off: LogSheetData = withComputedCells(SCALE, { ...read, rows: [{ ...read.rows[0], testedValue5: "400.400gm" }] } as LogSheetData);
  assert.deepEqual([off.rows[0].deviation5, off.rows[0].passFail], ["0.1%", "Fail"]);
});

test("F/QC/12: a line added with Add Row is the same standard line, in the adder's name; the lines above are left as they are", () => {
  const SCALE = "qc-weight-scale-calibration";
  const fresh = createDefaultData(doc(SCALE), "2026-11-01", master) as LogSheetData;
  // (the sheet's Acceptable Tolerance, carried from the last sheet on a real one: Pass / Fail is judged by it)
  const blank: LogSheetData = { ...fresh, header: { ...fresh.header, acceptableTolerance: "0.05 %" } };
  const typed: LogSheetData = { ...blank, rows: blank.rows.map((r) => ({ ...r, testedValue4: "500.010", testedBy: "Parth" })) };
  const line = nominalFillAdded(SCALE, typed, newRow(getLogSheetLayout(SCALE)!, typed.rows, "row-added"), "Kapila Barad");
  const sheet = withComputedCells(SCALE, { ...typed, rows: [...typed.rows, line] });
  const added = sheet.rows[sheet.rows.length - 1];
  assert.deepEqual([1, 2, 3, 4, 5].map((i) => added[`weight${i}`]), ["0.050mg", "50.000gm", "100.000gm", "200.000gm", "400.000gm"], "the standard weights, as on every new line");
  assert.deepEqual([1, 2, 3, 4, 5].map((i) => added[`testedValue${i}`]), ["0.050mg", "50.000gm", "", "", ""]);
  assert.deepEqual([1, 2, 3, 4, 5].map((i) => added[`deviation${i}`]), ["0%", "0%", "", "", ""]);
  assert.ok(!added.passFail, "no Pass before the readings");
  assert.deepEqual([added.testedBy, added.sign, added.id], ["Kapila Barad", "Kapila Barad", "row-added"]);
  assert.ok(!added.nextDueDate, "the Next Due Date is the person's");
  assert.equal(sheet.rows[0].testedValue4, "500.010", "a value typed above is left as it is");
  assert.equal(sheet.rows[0].testedBy, "Parth");
  // Any other sheet's added line starts blank (§98).
  const other = { id: "row-x", parameter: "" };
  for (const id of ["qc-gsm-plate-calibration", RULER_600_ID, "qc-calibration-master-list"]) assert.equal(nominalFillAdded(id, blank, other, "Kapila Barad"), other, id);
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
