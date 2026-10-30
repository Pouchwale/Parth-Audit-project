// ONE PRESS FILLS A CALIBRATION SHEET AS THE PLANT'S PAGES ARE FILLED (REQUIREMENTS §136, the owner, 28-Oct-2026): F/QC/17
// read as the master's at every point, F/QC/11 every plate at its size - in the presser's name, every box still theirs -
// and nothing of it written by DCRS itself onto a sheet nobody has looked at (§98). Run: npm run test:unit -- nominalFill
import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition, LogSheetData, RecordInstance } from "../src/types";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { applyAssistantPatch } from "../src/engine/recordPatch";
import { STANDARD_WEIGHTS_NOTE, standardWeightsOnOpenSheets } from "../src/data/standardWeightsMigration";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { RULER_300_ID, RULER_600_ID } from "../src/data/seed/qcRulerVerificationLayouts";
import { createDefaultData } from "../src/engine/recordDefaults";
import { withComputedCells } from "../src/engine/computedCells";
import { nominalFill, nominalFillAdded, nominalFillLabel, nominalFillOnOpen, nominalFillWaits, onStandardWeights } from "../src/engine/nominalFill";
import { logRowsRule, newRow } from "../src/engine/recordLines";
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

const SCALE = "qc-weight-scale-calibration";
const STD = ["0.050mg", "50.000gm", "100.000gm", "200.000gm", "400.000gm"];
const five = (line: Record<string, unknown>, key: string) => [1, 2, 3, 4, 5].map((i) => line[`${key}${i}`]);
// (the tolerance the page on file carries onto every new sheet, 0.05 %, which Pass / Fail is judged by)
const scaleSheet = (dueDate: string): LogSheetData => {
  const fresh = createDefaultData(doc(SCALE), dueDate, master) as LogSheetData;
  return { ...fresh, header: { ...fresh.header, acceptableTolerance: "0.05 %" } };
};

test("F/QC/12 (§142, §145): a month's sheet of four weekly lines - the weights and Tested Values 1 and 2 (0%) on each, no date written; the opener's name on the week's own line only; Pass / Fail once the person's readings are in", () => {
  const blank = scaleSheet("2026-11-01");
  assert.equal(blank.rows.length, 4, "a line a week (the owner, 29-Oct-2026)");
  const filled = withComputedCells(SCALE, nominalFillOnOpen(SCALE, blank, "Kapila Barad")!);
  for (const line of filled.rows) {
    assert.deepEqual(five(line, "weight"), STD);
    assert.deepEqual(five(line, "testedValue"), ["0.050mg", "50.000gm", "", "", ""]);
    assert.deepEqual(five(line, "deviation"), ["0%", "0%", "", "", ""]);
    assert.ok(!line.passFail, "no Pass before the person's three readings");
    assert.deepEqual([line.date, line.nextDueDate], ["", ""], "the date is the person's, not the system's (the owner, 29-Oct-2026)");
  }
  assert.deepEqual(filled.rows.map((r) => r.testedBy), ["Kapila Barad", "", "", ""], "the week's own line; the weeks below wait for their testers");
  assert.deepEqual(filled.rows.map((r) => r.sign), ["Kapila Barad", "", "", ""]);
  assert.equal(nominalFillOnOpen(SCALE, filled, "x"), null, "the week's line has its name: left as it is");
  // The person's date and readings for week 1: the deviations follow, and Pass; one off by 0.1 %, Fail.
  const read = withComputedCells(SCALE, { ...filled, rows: [{ ...filled.rows[0], date: "2026-11-02", testedValue3: "100.000gm", testedValue4: "200.020gm", testedValue5: "400.040gm" }, ...filled.rows.slice(1)] }, filled);
  assert.deepEqual([3, 4, 5].map((i) => read.rows[0][`deviation${i}`]), ["0%", "0.01%", "0.01%"]);
  assert.equal(read.rows[0].passFail, "Pass");
  // Week 2, opened by somebody else: their name on the second line, the first left as it is.
  const week2 = nominalFillOnOpen(SCALE, read, "Meet Patel")!;
  assert.deepEqual(week2.rows.map((r) => r.testedBy), ["Kapila Barad", "Meet Patel", "", ""]);
  const off = withComputedCells(SCALE, { ...read, rows: [{ ...read.rows[0], testedValue5: "400.400gm" }, ...read.rows.slice(1)] }, read);
  assert.deepEqual([off.rows[0].deviation5, off.rows[0].passFail], ["0.1%", "Fail"]);
});

test("F/QC/12 (§145): the person writes the first date; each Next Due Date is a week on and the next line starts on it; a date changed moves what the chain wrote; a date a person typed is kept", () => {
  const sheet = scaleSheet("2026-11-01");
  const dated = (d: LogSheetData) => d.rows.map((r) => [r.date, r.nextDueDate]);
  const at = (d: LogSheetData, i: number, over: Record<string, string>) => withComputedCells(SCALE, { ...d, rows: d.rows.map((r, n) => (n === i ? { ...r, ...over } : r)) }, d);
  const typed = at(sheet, 0, { date: "2026-11-02" });
  assert.deepEqual(dated(typed), [["2026-11-02", "2026-11-09"], ["2026-11-09", "2026-11-16"], ["2026-11-16", "2026-11-23"], ["2026-11-23", "2026-11-30"]], "a week on, and the next line starts on it");
  const moved = at(typed, 0, { date: "2026-11-03" });
  assert.deepEqual(dated(moved), [["2026-11-03", "2026-11-10"], ["2026-11-10", "2026-11-17"], ["2026-11-17", "2026-11-24"], ["2026-11-24", "2026-12-01"]], "the first date changed: the chain moves with it");
  const late = at(moved, 2, { date: "2026-11-18" });
  assert.deepEqual(dated(late).slice(1), [["2026-11-10", "2026-11-17"], ["2026-11-18", "2026-11-25"], ["2026-11-25", "2026-12-02"]], "a week done a day late: the lines above left, the ones below follow");
  const due = at(late, 0, { nextDueDate: "2026-11-11" });
  assert.deepEqual(dated(due), [["2026-11-03", "2026-11-11"], ["2026-11-11", "2026-11-18"], ["2026-11-18", "2026-11-25"], ["2026-11-25", "2026-12-02"]], "a Next Due Date a person wrote is kept, the next line starts on it, a date typed below is kept");
  // Without the sheet as it stood (a path that has none), only what is blank is filled; another document has no chain.
  assert.deepEqual(dated(withComputedCells(SCALE, { ...sheet, rows: sheet.rows.map((r, n) => (n === 0 ? { ...r, date: "2026-11-02" } : r)) }))[3], ["2026-11-23", "2026-11-30"]);
  const gsm = createDefaultData(doc(GSM), "2026-11-01", master) as LogSheetData;
  assert.deepEqual(withComputedCells(GSM, gsm).rows, withComputedCells(GSM, gsm).rows);
});

test("F/QC/12: an older open sheet (the former 50 .. 600 gm weights, nothing read) opened takes the laboratory's weights; a weight or a reading a person wrote is kept", () => {
  const base = scaleSheet("2026-10-20");
  const former = (over: Record<string, string> = {}) => ({ ...base.rows[0], weight1: "50 gm", weight2: "100 gm", weight3: "200 gm", weight4: "500 gm", weight5: "600 gm", testedValue1: "50 gm", testedValue2: "100 gm", testedValue3: "200 gm", testedValue4: "500 gm", testedValue5: "600 gm", testedBy: "", sign: "", ...over });
  const old = withComputedCells(SCALE, nominalFillOnOpen(SCALE, { ...base, rows: [former()] }, "Kapila Barad")!);
  assert.deepEqual(five(old.rows[0], "weight"), STD);
  assert.deepEqual(five(old.rows[0], "testedValue"), ["0.050mg", "50.000gm", "", "", ""], "the former nominal readings are no readings: rubbed out, 3 to 5 the person's");
  assert.ok(!old.rows[0].passFail, "the Pass that stood with no reading was never a verdict: cleared, it waits for the readings");
  // A reading a person wrote against the former weights is a reading: the line is left as it is.
  assert.equal(nominalFillOnOpen(SCALE, { ...base, rows: [former({ testedValue4: "500.010" })] }, "Kapila Barad"), null);
});

test("F/QC/12 (§146): the five weights are fixed on every line - never a box a person or Mitra writes; a line of the former weights is put onto them, a reading typed on it kept", () => {
  const layout = getLogSheetLayout(SCALE)!;
  for (let i = 1; i <= 5; i++) assert.equal(layout.columns.find((c) => c.key === `weight${i}`)!.locked, true, `Weight ${i} fixed (the owner, 30-Oct-2026)`);
  assert.ok(!logRowsRule(layout).writable.includes("weight3"), "not a box the person writes");
  const sheet = scaleSheet("2026-11-01");
  const formerLine = { ...sheet.rows[0], weight1: "50 gm", weight2: "100 gm", weight3: "200 gm", weight4: "500 gm", weight5: "600 gm", testedValue1: "50 gm", testedValue2: "100 gm", testedValue3: "200 gm", testedValue4: "500 gm", testedValue5: "600 gm", passFail: "Pass", testedBy: "Kapila Barad" };
  const fixed = onStandardWeights(formerLine);
  assert.deepEqual(five(fixed, "weight"), STD, "the laboratory's weights");
  assert.deepEqual(five(fixed, "testedValue"), ["0.050mg", "50.000gm", "", "", ""], "the old fill's nominal figures were no readings");
  assert.equal(fixed.passFail, "", "a Pass on no reading was never a verdict");
  assert.equal(fixed.testedBy, "Kapila Barad", "the name is left");
  // A reading typed on such a line (against the weight really placed) is kept, and its deviation is right at last.
  const typed: LogSheetData = withComputedCells(SCALE, { ...sheet, rows: [onStandardWeights({ ...formerLine, testedValue3: "100.004gm" })] } as LogSheetData);
  assert.deepEqual([typed.rows[0].testedValue3, typed.rows[0].deviation3], ["100.004gm", "0.004%"]);
  assert.equal(onStandardWeights({ ...sheet.rows[0], weight3: "150 gm" }).weight3, "100.000gm", "a weight typed over: the fixed one again");
  assert.equal(onStandardWeights(sheet.rows[0]), sheet.rows[0], "a line already right: left as it is");
  // Mitra is refused a weight; the reading beside it is written.
  const { data: patched, problems } = applyAssistantPatch("log-sheet", SCALE, sheet, { itemEdits: [{ collection: "rows", match: { id: sheet.rows[0].id }, set: { weight3: "150 gm", testedValue3: "100.002gm" } }] });
  assert.deepEqual([patched.rows[0].weight3, patched.rows[0].testedValue3], ["100.000gm", "100.002gm"]);
  assert.match(problems.join(" "), /Weight 3 is fixed on the form/);
});

test("F/QC/12 (§146): at start every open sheet's lines go onto the fixed weights, with a line in its history; a sheet handed in or verified is left; nothing to do the next time", () => {
  recordRepository.query({ documentId: SCALE }).forEach((r) => recordRepository.remove(r.id));
  const sheet = scaleSheet("2026-11-01");
  const former = { ...sheet.rows[1], weight1: "50 gm", weight2: "100 gm", weight3: "200 gm", weight4: "500 gm", weight5: "600 gm", testedValue1: "50 gm", testedValue2: "100 gm", testedValue3: "200 gm", testedValue4: "500 gm", testedValue5: "600 gm" };
  const now = new Date().toISOString();
  const rec = (id: string, status: RecordInstance["status"], rows: LogSheetData["rows"]): RecordInstance => ({ id, documentId: SCALE, periodKey: `${SCALE}:${id}`, dueDate: "2026-11-01", status, isDemo: false, data: { ...sheet, rows }, createdAt: now, updatedAt: now });
  recordRepository.upsert(rec("wt-open", "In Progress", [sheet.rows[0], former, { ...sheet.rows[2], weight3: "150 gm" }, sheet.rows[3]]));
  recordRepository.upsert(rec("wt-verified", "Verified", [former]));
  assert.equal(standardWeightsOnOpenSheets(), 1, "the open one");
  const open = recordRepository.getById("wt-open")!;
  for (const row of (open.data as LogSheetData).rows) assert.deepEqual(five(row, "weight"), STD, "every line on the fixed weights");
  assert.ok(open.history?.some((e) => e.note === STANDARD_WEIGHTS_NOTE), "a line in its history");
  assert.equal((recordRepository.getById("wt-verified")!.data as LogSheetData).rows[0].weight4, "500 gm", "a verified sheet is left as it was verified");
  assert.equal(standardWeightsOnOpenSheets(), 0, "nothing to do the next time");
  recordRepository.query({ documentId: SCALE }).forEach((r) => recordRepository.remove(r.id));
});

test("F/QC/12: a line added with Add Row is the same standard line, in the adder's name, starting on the Next Due Date above it; the lines above are left as they are", () => {
  const blank = scaleSheet("2026-11-01");
  const typed: LogSheetData = withComputedCells(SCALE, { ...blank, rows: blank.rows.map((r, i) => ({ ...r, testedValue4: "200.010", testedBy: "Parth", ...(i === 0 ? { date: "2026-11-02" } : {}) })) } as LogSheetData, blank);
  const line = nominalFillAdded(SCALE, typed, newRow(getLogSheetLayout(SCALE)!, typed.rows, "row-added"), "Kapila Barad");
  const sheet = withComputedCells(SCALE, { ...typed, rows: [...typed.rows, line] }, typed);
  const added = sheet.rows[sheet.rows.length - 1];
  assert.deepEqual(five(added, "weight"), STD, "the standard weights, as on every new line");
  assert.deepEqual(five(added, "testedValue"), ["0.050mg", "50.000gm", "", "", ""]);
  assert.deepEqual(five(added, "deviation"), ["0%", "0%", "", "", ""]);
  assert.ok(!added.passFail, "no Pass before the readings");
  assert.deepEqual([added.testedBy, added.sign, added.id], ["Kapila Barad", "Kapila Barad", "row-added"]);
  assert.deepEqual([added.date, added.nextDueDate], ["2026-11-30", "2026-12-07"], "a fifth week, on the Next Due Date above it");
  assert.equal(sheet.rows[0].testedValue4, "200.010", "a value typed above is left as it is");
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
