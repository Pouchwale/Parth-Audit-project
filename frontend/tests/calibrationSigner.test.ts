// THE SIGN BOXES OF F/QC/11, F/QC/12 AND F/QC/17 ARE THE PERSON'S (REQUIREMENTS §288; the owner, 22-Nov-2026: "always sign part remain
// empty so user will manually add name specially only for qc-11, 12, 17"). DCRS writes no name there: not on opening, not from the last
// sheet, not on Submit or Verify. The names it wrote on sheets still open come off once; a typed name and a signed sheet stay.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData, LogSheetRow, RecordInstance } from "../src/types";
import { signKeys, typedNameMark, withoutSignNames } from "../src/engine/calibrationSigner";
import { NOMINAL_FILL_NOTE, nominalFill, nominalFillAdded, nominalFillOnOpen } from "../src/engine/nominalFill";
import { withDcrsNamesOff } from "../src/data/qcSignsMigration";
import { calibrationGeometryFor } from "../src/data/seed/qcCalibrationGeometry";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { carriedFrom } from "../src/engine/carryForward";

const GSM = "qc-gsm-plate-calibration";
const SCALE = "qc-weight-scale-calibration";
const RULER = "qc-ruler-verification";

const sheet = (documentId: string, rows: LogSheetRow[], opener?: string, extra: Partial<LogSheetData> = {}, status = "In Progress"): RecordInstance =>
  ({
    id: "r",
    documentId,
    dueDate: "2026-11-17",
    status,
    data: { header: {}, rows, ...extra },
    history: opener ? [{ id: "h", at: "2026-11-17T09:00:00.000Z", by: opener, action: "edited", note: NOMINAL_FILL_NOTE }] : [],
  }) as unknown as RecordInstance;
const gsmSign = (name: string): LogSheetRow => ({ id: "s", parameter: "Sign.", p54: name, p55: name, p56: name, p57: name }) as LogSheetRow;
const gsmRows = (name = ""): LogSheetRow[] => [{ id: "a", parameter: "Tasted-1" } as LogSheetRow, { id: "p", parameter: "Pass/Fail" } as LogSheetRow, gsmSign(name)];

test("opening a sheet fills its readings and writes no name in a sign box", () => {
  const gsm = nominalFillOnOpen(GSM, { header: {}, rows: gsmRows() }, "Kapila Barad")!;
  assert.equal(gsm.rows[1].p54, "Pass", "the plant's usual readings are filled");
  assert.equal(gsm.rows[2].p54, "", "F/QC/11's Sign. line stays empty");
  const ruler = nominalFill(RULER, { header: {}, rows: [{ id: "a", masterReading: "50 mm", performedBy: "" } as LogSheetRow] }, "Kapila Barad")!;
  assert.equal(ruler.rows[0].performedBy, "", "F/QC/17's performer stays empty");
  const scale = nominalFill(SCALE, { header: {}, rows: [{ id: "a", date: "2026-11-03", testedBy: "", sign: "" } as LogSheetRow] }, "Kapila Barad")!;
  assert.deepEqual([scale.rows[0].testedBy, scale.rows[0].sign], ["", ""], "F/QC/12's Tested By and Sign stay empty");
  const added = nominalFillAdded(SCALE, { header: {}, rows: [] }, { id: "n", testedBy: "", sign: "" } as LogSheetRow, "Kapila Barad");
  assert.deepEqual([added.testedBy, added.sign], ["", ""], "a line added too");
});

test("opening again writes nothing more", () => {
  const once = nominalFillOnOpen(GSM, { header: {}, rows: gsmRows() }, "A")!;
  assert.equal(nominalFillOnOpen(GSM, once, "B"), null);
});

test("a new sheet written as the last one was carries no name", () => {
  const layout = getLogSheetLayout(GSM)!;
  const previous: LogSheetData = { header: {}, rows: layout.rowMode.kind === "fixedRows" ? layout.rowMode.rows.map((r, i) => ({ id: `p${i}`, ...r, ...(r.parameter === "Sign." ? { p54: "Rashmi", p55: "Rashmi", p56: "Rashmi", p57: "Rashmi" } : {}) }) as LogSheetRow) : [] };
  const blank: LogSheetData = { header: {}, rows: previous.rows.map((r) => ({ id: r.id, parameter: r.parameter }) as LogSheetRow) };
  const next = carriedFrom(layout, previous, blank, "2026-12-01");
  const sign = next.rows.find((r) => r.parameter === "Sign.")!;
  assert.ok(signKeys(GSM, sign).every((k) => !String(sign[k] ?? "").trim()));
});

test("withoutSignNames takes only the sign boxes, on these formats only", () => {
  const data: LogSheetData = { header: {}, rows: [{ id: "a", testedBy: "X", sign: "Y", passFail: "Pass" } as LogSheetRow] };
  const out = withoutSignNames(SCALE, data);
  assert.deepEqual([out.rows[0].testedBy, out.rows[0].sign, out.rows[0].passFail], ["", "", "Pass"]);
  assert.equal(withoutSignNames("qc-viscosity", data), data);
});

test("a name typed by hand is marked as the person's", () => {
  const data: LogSheetData = { header: {}, rows: [gsmSign("Harsh")] };
  const mark = typedNameMark(GSM, data, "s", "p54", "Harsh");
  assert.deepEqual(mark, { typedNames: ["s:p54"] });
  assert.deepEqual(typedNameMark(GSM, { ...data, ...mark }, "s", "p54", ""), { typedNames: [] });
});

test("sheets still open: the name DCRS wrote comes off; a typed name and any other name stay", () => {
  const off = withDcrsNamesOff(sheet(GSM, [gsmSign("Kapila Barad")], "Kapila Barad"))!;
  assert.equal(off.rows[0].p54, "");
  const typed = withDcrsNamesOff(sheet(GSM, [gsmSign("Kapila Barad")], "Kapila Barad", { typedNames: ["s:p54"] }))!;
  assert.equal(typed.rows[0].p54, "Kapila Barad", "typed: kept");
  assert.equal(typed.rows[0].p55, "", "not typed: off");
  const older = { ...sheet(GSM, [gsmSign("Kapila Barad")]), history: [{ id: "o", at: "2026-11-03T09:00:00.000Z", by: "Kapila Barad", action: "edited", note: "Filled as the plant's pages are filled, on opening: an earlier wording" }] } as unknown as RecordInstance;
  assert.equal(withDcrsNamesOff(older)!.rows[0].p54, "", "the opening note's earlier wording counts too");
  assert.equal(withDcrsNamesOff(sheet(SCALE, [{ id: "a", testedBy: "Ms. Kapila Barad", sign: "Ms. Kapila Barad" } as LogSheetRow], "Kapila Barad")), null, "a name DCRS did not write stays");
});

test("F/QC/11 and F/QC/12 stand 10 mm clear of the A4 page's left and right edges, their grids across the width", () => {
  for (const id of [GSM, SCALE]) {
    const g = calibrationGeometryFor(id)!;
    assert.equal(g.left, 10);
    assert.equal(297 - g.left - g.width, 10);
    assert.ok(g.top >= 10);
    assert.ok(Math.abs(g.grid.cols.reduce((a, b) => a + b, 0) - g.gridWidth) < 0.1, id);
  }
});
