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
import { nominalFill, nominalFillLabel } from "../src/engine/nominalFill";
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

test("only these three documents have the press; a new Live sheet still comes with nothing observed on it", () => {
  assert.equal(nominalFillLabel(RULER_600_ID), "ruler");
  assert.equal(nominalFillLabel(RULER_300_ID), "ruler");
  assert.equal(nominalFillLabel(GSM), "gsm");
  assert.equal(nominalFillLabel("qc-weight-scale-calibration"), null);
  assert.equal(nominalFill("qc-viscosity", { header: {}, rows: [] }, "x"), null);
  const known = prepareKnownParts(doc(RULER_600_ID), "2026-10-28", master, undefined)!.data as LogSheetData;
  assert.ok(known.rows.every((r) => (r.observed === null || r.observed === "") && r.status === "" && r.performedBy === ""), "DCRS writes no reading by itself (§98)");
});
