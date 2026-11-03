// THE INDEXING MODULE: the formula language, a changed formula reaching the real cells (and never a signed record), a
// save becoming a version that changes the format, and a restore putting everything back.
// Run: node --no-warnings=ExperimentalWarning indexing/tests/run.ts
import test from "node:test";
import assert from "node:assert/strict";
import { compileFormula } from "../formulaLanguage";
import { withComputedCells } from "../../frontend/src/engine/computedCells";
import { documentRepository, ensureSeeded } from "../../frontend/src/data/repositories/documentRepository";
import { masterRepository } from "../../frontend/src/data/repositories/masterRepository";
import { formatEditFor } from "../../frontend/src/data/formatEdits";
import { readIndexState, writeIndexState, emptySnapshot } from "../indexState";
import { formulaTimeOf } from "../formulaRuntime";
import { buildDocumentLines, buildFormatLines } from "../indexRows";
import { emptyDraft, formulaProblem, restoreVersion, saveIndexDraft } from "../indexActions";
import { FORMULA_SLOTS } from "../formulas";
import type { LogSheetData } from "../../frontend/src/types";

const run = (src: string, vars: Record<string, number> = {}, allowed = Object.keys(vars)) => {
  const c = compileFormula(src, allowed);
  if (!c.ok) throw new Error(c.error);
  return c.run(vars);
};

test("the formula language reads Excel-like formulas and nothing else", () => {
  assert.equal(run("(T - W) / W * 100", { T: 200040, W: 200000 }), 0.02);
  assert.equal(run('IF(SUM >= 16, "3 times / Year", IF(SUM >= 5, "Twice / Year", "Once / Year"))', { SUM: 5 }), "Twice / Year");
  assert.equal(run("SUM >= 16 ? 'A' : 'B'", { SUM: 20 }), "A");
  assert.equal(run("ABS(D) <= TOL", { D: -0.5, TOL: 1 }), true);
  assert.equal(run("ROUND(2.345, 2) + MAX(1, 4, 2)", {}), 6.35);
  assert.equal(run("AND(A > 1, OR(B = 2, B <> 2))", { A: 2, B: 3 }), true);
  const bad = compileFormula("W + X", ["W"]);
  assert.equal(bad.ok, false);
  assert.match(bad.ok ? "" : bad.error, /X/);
  assert.equal(compileFormula("alert(1)", []).ok, false, "no function outside the list");
  assert.equal(compileFormula("constructor", []).ok, false);
  assert.equal(compileFormula("(1 + 2", []).ok, false);
});

test("every default formula reads, and works out on its sample", () => {
  for (const slot of FORMULA_SLOTS) assert.equal(formulaProblem(slot.id, slot.defaultExpr), null, slot.id);
});

const riskSheet = (iqa: string, external: string): LogSheetData => ({ header: {}, rows: [{ id: "r1", iqaNc: iqa, externalNc: external }] }) as unknown as LogSheetData;

test("a changed formula is used from when it was saved; a record signed before keeps the old one", () => {
  writeIndexState({ schema: 1, current: emptySnapshot(), versions: [], formulas: {}, ranges: {} });
  const before = withComputedCells("sys-audit-risk", riskSheet("3", "2"));
  assert.equal(before.rows[0].sum, "5");
  assert.equal(before.rows[0].frequency, "Twice / Year");

  const since = "2026-10-15T00:00:00.000Z";
  writeIndexState({
    schema: 1,
    current: { ...emptySnapshot(), formulas: { "sys07.frequency": 'IF(SUM >= 4, "Quarterly", "Once / Year")' } },
    versions: [],
    formulas: { "sys07.frequency": [{ expr: 'IF(SUM >= 4, "Quarterly", "Once / Year")', since, by: "Super Admin", version: 1 }] },
    ranges: {},
  });
  // Open record (no asOf): the new formula.
  assert.equal(withComputedCells("sys-audit-risk", riskSheet("3", "2")).rows[0].frequency, "Quarterly");
  // A record submitted before the change: the formula then in force (the default).
  const signed = { status: "Verified", submittedAt: "2026-10-01T09:00:00.000Z" };
  assert.equal(withComputedCells("sys-audit-risk", riskSheet("3", "2"), undefined, formulaTimeOf(signed)).rows[0].frequency, "Twice / Year");
  // A record submitted after it: the new one.
  assert.equal(withComputedCells("sys-audit-risk", riskSheet("3", "2"), undefined, formulaTimeOf({ status: "Submitted", submittedAt: "2026-10-20T09:00:00.000Z" })).rows[0].frequency, "Quarterly");
  // An open record whatever its dates: now.
  assert.equal(formulaTimeOf({ status: "In Progress", submittedAt: "2026-10-01T09:00:00.000Z" }), undefined);
  writeIndexState({ schema: 1, current: emptySnapshot(), versions: [], formulas: {}, ranges: {} });
});

test("the index lists every F/SYS/02 line and every DCRS format, and every F/SYS/01 document", () => {
  ensureSeeded();
  const formats = buildFormatLines();
  const docs = documentRepository.getAllUnscoped();
  for (const d of docs) assert.ok(formats.some((l) => l.doc?.id === d.id), `${d.id} is in the index`);
  assert.ok(formats.filter((l) => l.onMasterList).length >= 130, "the Master List's lines are in it");
  assert.ok(formats.some((l) => !l.doc && l.automation.mode === "Not in DCRS"), "a format not in DCRS yet is a line too");
  assert.ok(buildDocumentLines().length >= 170, "F/SYS/01's documents");
  const pur05 = formats.find((l) => l.doc?.id === "pur-supplier-performance")!;
  assert.equal(pur05.automation.formulas.length, 5);
  assert.equal(pur05.changed.size, 0, "nothing differs from its default before anybody changes anything");
});

test("saving changes a format and a formula as a version; restoring v0 puts everything back", () => {
  ensureSeeded();
  writeIndexState({ schema: 1, current: emptySnapshot(), versions: [], formulas: {}, ranges: {} });
  const line = buildFormatLines().find((l) => l.doc?.id === "sys-audit-risk")!;
  const issuedName = line.values.name;

  const draft = emptyDraft();
  draft.formats[line.key] = { name: "Internal Audit Risk Assessment (revised)", revisionNo: "02", retentionPeriod: "5 years", fileLocation: "QA office, rack 2" };
  draft.formulas["sys07.sum"] = "IQA + 2 * EXT";
  assert.equal(saveIndexDraft(draft, "", "Super Admin").ok, false, "a reason is needed");
  const saved = saveIndexDraft(draft, "Revised after the BRCGS audit", "Super Admin");
  assert.ok(saved.ok, saved.ok ? "" : saved.error);

  // The format itself changed.
  const doc = documentRepository.getByIdUnscoped("sys-audit-risk")!;
  assert.equal(doc.name, "Internal Audit Risk Assessment (revised)");
  assert.equal(doc.revisionNo, "02");
  assert.match(formatEditFor("sys-audit-risk")!.revisions[0].reason, /Indexing v1/);
  // The index's own details and the formula.
  const after = buildFormatLines().find((l) => l.key === line.key)!;
  assert.equal(after.values.retentionPeriod, "5 years");
  assert.equal(after.values.fileLocation, "QA office, rack 2");
  assert.equal(withComputedCells("sys-audit-risk", riskSheet("3", "2")).rows[0].sum, "7");
  const state = readIndexState();
  assert.equal(state.versions[0].no, 1);
  assert.equal(state.formulas["sys07.sum"].length, 1);

  // Back to the defaults, as version 2.
  const reset = restoreVersion(0, "Back to the issued index", "Super Admin");
  assert.ok(reset.ok, reset.ok ? "" : reset.error);
  assert.equal(documentRepository.getByIdUnscoped("sys-audit-risk")!.name, issuedName);
  assert.equal(withComputedCells("sys-audit-risk", riskSheet("3", "2")).rows[0].sum, "5");
  const back = buildFormatLines().find((l) => l.key === line.key)!;
  assert.equal(back.values.fileLocation, "");
  const s2 = readIndexState();
  assert.equal(s2.versions[0].no, 2);
  assert.equal(s2.formulas["sys07.sum"].length, 2, "the old formula stays in its history");

  // Restoring v1 brings the change back, as version 3.
  const again = restoreVersion(1, "Re-apply the revision", "Super Admin");
  assert.ok(again.ok, again.ok ? "" : again.error);
  assert.equal(documentRepository.getByIdUnscoped("sys-audit-risk")!.revisionNo, "02");
  assert.equal(withComputedCells("sys-audit-risk", riskSheet("3", "2")).rows[0].sum, "7");
  assert.equal(readIndexState().versions[0].no, 3);
  void masterRepository;
});

// ---------------------------------------------------------------------------------------------------------------------
// ranges & limits

import { bandLines, bandsOfFormula, formulaOfBands, rangeDefinitions } from "../ranges";
import { getLogSheetLayout, getLogSheetLayoutForRecord } from "../../frontend/src/data/seed/logSheetLayouts";
import { paretoCutoff } from "../../frontend/src/engine/marketingCalc";
import { describeDraft } from "../indexActions";

test("every range of the formats is listed with its default from the paper", () => {
  const defs = rangeDefinitions();
  const viscosity = defs.find((d) => d.documentId === "qc-viscosity" && d.kind === "band");
  assert.ok(viscosity && viscosity.kind === "band");
  assert.deepEqual(viscosity.defaults, { min: 19, max: 21 });
  const hotRoom = defs.filter((d) => d.formatNo.includes("40.C") && d.kind === "band");
  assert.equal(hotRoom.length, 1, "the six timed hot-room readings share one range");
  assert.equal(hotRoom[0].kind === "band" && hotRoom[0].columns.length, 6);
  assert.ok(defs.some((d) => d.kind === "within" && d.documentId === "qc-coa-label"), "the COA's tolerances");
  assert.ok(defs.some((d) => d.kind === "scoreBands" && d.documentId === "sys-audit-risk"));
  assert.ok(defs.some((d) => d.kind === "typed" && d.formatNo === "F/QC/01"), "the specification written on each line is shown");
});

test("score bands read as ranges, and are written back as the same formula", () => {
  const sys07 = 'IF(SUM >= 16, "3 times / Year", IF(SUM >= 5, "Twice / Year", "Once / Year"))';
  const bands = bandsOfFormula(sys07, "SUM")!;
  assert.deepEqual(
    bandLines(bands, true).map((l) => `${l.range} → ${l.result}`),
    ["0 – 4 → Once / Year", "5 – 15 → Twice / Year", "16 and above → 3 times / Year"]
  );
  assert.equal(formulaOfBands(bands, "SUM"), sys07);
  const grade = bandsOfFormula('IF(OVERALL >= 90, "A", IF(OVERALL >= 80, "B", "C"))', "OVERALL")!;
  assert.deepEqual(bandLines(grade, false).map((l) => l.range), ["below 80", "80 to below 90", "90 and above"]);
  assert.equal(bandsOfFormula("IQA + EXT", "SUM"), null, "a formula that is not bands");
});

test("a changed range changes the form's limits and printed heading; a signed record keeps the old one", () => {
  ensureSeeded();
  writeIndexState({ schema: 1, current: emptySnapshot(), versions: [], formulas: {}, ranges: {} });
  const issued = getLogSheetLayout("qc-viscosity")!;
  const col = issued.columns.find((c) => c.key === "viscosity")!;
  assert.equal(col.label, "Viscosity (20.0 ± 1.0 Sec.)");
  assert.equal(getLogSheetLayout("qc-viscosity"), issued, "the same layout while nothing is changed");

  const viscosity = rangeDefinitions().find((d) => d.documentId === "qc-viscosity" && d.kind === "band")!;
  const hotRoom = rangeDefinitions().find((d) => d.formatNo.includes("40.C") && d.kind === "band")!;
  const signedBefore = { status: "Verified", submittedAt: "2026-01-01T00:00:00.000Z" };
  const draft = emptyDraft();
  draft.ranges[viscosity.id] = { min: 18, max: 22 };
  draft.ranges[hotRoom.id] = { min: 42, max: 48 };
  draft.ranges["value:mkt04.cutoff"] = { value: 70 };
  assert.equal(describeDraft(draft).filter((c) => c.area === "range").length, 3);
  const saved = saveIndexDraft(draft, "New adhesive supplier's range", "Super Admin");
  assert.ok(saved.ok, saved.ok ? "" : saved.error);

  const now = getLogSheetLayout("qc-viscosity")!.columns.find((c) => c.key === "viscosity")!;
  assert.equal(now.min, 18);
  assert.equal(now.max, 22);
  assert.equal(now.label, "Viscosity (20.0 ± 2.0 Sec.)");
  const open = getLogSheetLayoutForRecord("qc-viscosity", { status: "In Progress" })!.columns.find((c) => c.key === "viscosity")!;
  assert.equal(open.max, 22, "an open record: the range now");
  const signed = getLogSheetLayoutForRecord("qc-viscosity", signedBefore)!.columns.find((c) => c.key === "viscosity")!;
  assert.equal(signed.max, 21, "a record signed before the change: the range it was signed with");
  assert.equal(signed.label, "Viscosity (20.0 ± 1.0 Sec.)");
  const hot = getLogSheetLayout("qc-temperature")!.columns.filter((c) => c.min !== undefined);
  assert.equal(hot.length, 6);
  assert.ok(hot.every((c) => c.min === 42 && c.max === 48), "every timed reading of the hot room");
  assert.equal(paretoCutoff(""), 70);
  assert.equal(paretoCutoff("85"), 85, "a cutoff written on the sheet still wins");

  const reset = restoreVersion(0, "Back to the paper", "Super Admin");
  assert.ok(reset.ok, reset.ok ? "" : reset.error);
  assert.equal(getLogSheetLayout("qc-viscosity")!.columns.find((c) => c.key === "viscosity")!.max, 21);
  assert.equal(paretoCutoff(""), 80);
  assert.equal(readIndexState().ranges[viscosity.id].length, 2, "the changed range stays in its history");
});
