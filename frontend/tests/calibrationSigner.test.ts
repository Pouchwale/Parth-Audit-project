// THE NAME IN THE SIGN COLUMNS OF F/QC/11, F/QC/12 AND F/QC/17 (REQUIREMENTS §278; the owner, 22-Nov-2026): the person who
// fills or verifies the sheet, automatically, and editable: a name typed by hand is never replaced.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData, LogSheetRow, RecordInstance } from "../src/types";
import { signedOnSubmit, signedOnVerify, typedNameMark } from "../src/engine/calibrationSigner";
import { NOMINAL_FILL_NOTE } from "../src/engine/nominalFill";
import { calibrationGeometryFor } from "../src/data/seed/qcCalibrationGeometry";

const GSM = "qc-gsm-plate-calibration";
const SCALE = "qc-weight-scale-calibration";
const RULER = "qc-ruler-verification";

const sheet = (documentId: string, rows: LogSheetRow[], opener?: string, extra: Partial<LogSheetData> = {}): RecordInstance =>
  ({
    id: "r",
    documentId,
    dueDate: "2026-11-17",
    status: "In Progress",
    data: { header: {}, rows, ...extra },
    history: opener ? [{ id: "h", at: "2026-11-17T09:00:00.000Z", by: opener, action: "edited", note: NOMINAL_FILL_NOTE }] : [],
  }) as unknown as RecordInstance;
const rowsOf = (r: RecordInstance) => (r.data as LogSheetData).rows;
const gsmSign = (name: string): LogSheetRow => ({ id: "s", parameter: "Sign.", p54: name, p55: name, p56: name, p57: name }) as LogSheetRow;

test("F/QC/11: the submitter's name replaces the opener's, and the verifier's replaces it", () => {
  const submitted = signedOnSubmit(sheet(GSM, [gsmSign("Super Admin")], "Super Admin"), "Roshni Senam");
  assert.equal(rowsOf(submitted)[0].p57, "Roshni Senam");
  const inReview = { ...submitted, submittedBy: "Roshni Senam" };
  assert.equal(rowsOf(signedOnVerify(inReview, "Kapila Barad"))[0].p54, "Kapila Barad");
});

test("the same person filling and verifying keeps their name, and a blank box takes it", () => {
  const same = sheet(GSM, [gsmSign("Super Admin")], "Super Admin");
  assert.equal(signedOnSubmit(same, "Super Admin"), same, "nothing to change");
  assert.equal(rowsOf(signedOnVerify(sheet(GSM, [gsmSign("")]), "Meet"))[0].p55, "Meet");
});

test("a name typed by hand stays through Submit and Verify; emptied, the box is DCRS's again", () => {
  const data: LogSheetData = { header: {}, rows: [gsmSign("Harsh")] };
  const mark = typedNameMark(GSM, data, "s", "p54", "Harsh");
  assert.deepEqual(mark, { typedNames: ["s:p54"] });
  const typed = sheet(GSM, [gsmSign("Harsh")], "Harsh", mark);
  const verified = signedOnVerify({ ...typed, submittedBy: "Harsh" }, "Kapila Barad");
  assert.equal(rowsOf(verified)[0].p54, "Harsh", "typed: kept");
  assert.equal(rowsOf(verified)[0].p55, "Kapila Barad", "not typed: the verifier's");
  assert.deepEqual(typedNameMark(GSM, { ...data, ...mark }, "s", "p54", ""), { typedNames: [] });
});

test("F/QC/12: Sign is the verifier's, Tested By stays the tester's, and a week not read has no name", () => {
  const read: LogSheetRow = { id: "a", date: "2026-11-03", passFail: "Pass", testedBy: "Roshni Senam", sign: "Roshni Senam" } as LogSheetRow;
  const later: LogSheetRow = { id: "b", date: "2026-11-24", passFail: "", testedBy: "", sign: "" } as LogSheetRow;
  const [line, week] = rowsOf(signedOnVerify({ ...sheet(SCALE, [read, later]), submittedBy: "Roshni Senam" }, "Kapila Barad"));
  assert.equal(line.testedBy, "Roshni Senam");
  assert.equal(line.sign, "Kapila Barad");
  assert.equal(week.sign, "");
  assert.equal(week.testedBy, "");
});

test("F/QC/17: Calibration performed by says who did it: the verifier's name goes there only on a blank box", () => {
  const done = { ...sheet(RULER, [{ id: "l", performedBy: "Roshni Senam" } as LogSheetRow]), submittedBy: "Roshni Senam" };
  assert.equal(rowsOf(signedOnVerify(done, "Kapila Barad"))[0].performedBy, "Roshni Senam");
  assert.equal(rowsOf(signedOnVerify(sheet(RULER, [{ id: "l", performedBy: "" } as LogSheetRow]), "Kapila Barad"))[0].performedBy, "Kapila Barad");
});

test("no other document's boxes are touched", () => {
  const other = sheet("qc-viscosity", [{ id: "x", sign: "Jeni" } as LogSheetRow], "Jeni");
  assert.equal(signedOnVerify(other, "Kapila Barad"), other);
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
