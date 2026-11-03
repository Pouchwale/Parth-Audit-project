// F/QC/12 — THE WEEKLY WEIGHING BALANCE CHECK (the owner, 30-Oct-2026): the Deviation % never written with a minus; a
// Tested Value typed as the bare figure takes its weight's unit; outside ± the Acceptable Tolerance the line Fails and
// Insights tells the QA manager (C4); the first line's date is the previous week's Next Due Date and the dates below
// follow; the Acceptable Tolerance new sheets start with and the days between checks are the index's (indexing/).
// Never a made-up reading: the figures are the person's.
import test from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { withComputedCells } from "../src/engine/computedCells";
import { POSITIVE_DEVIATION_SINCE, unitized } from "../src/engine/calibration";
import { firstWeekDate } from "../src/engine/calibrationWeeks";
import { nominalFill } from "../src/engine/nominalFill";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { computeInsights } from "../src/engine/insights";
import { emptySnapshot, writeIndexState } from "../../indexing/indexState";

ensureDocumentsSeeded();
ensureMasterSeeded();
const ID = "qc-weight-scale-calibration";

const line = (id: string, extra: Record<string, string> = {}) => ({
  id,
  date: "",
  weight1: "0.050mg",
  testedValue1: "0.050mg",
  weight2: "50.000gm",
  testedValue2: "50.000gm",
  weight3: "100.000gm",
  testedValue3: "",
  weight4: "200.000gm",
  testedValue4: "",
  weight5: "400.000gm",
  testedValue5: "",
  nextDueDate: "",
  ...extra,
});
const sheet = (rows: ReturnType<typeof line>[], tolerance = "0.05 %"): LogSheetData => ({ header: { acceptableTolerance: tolerance }, rows }) as unknown as LogSheetData;

test("the Deviation % is never written with a minus (from 30-Oct-2026); a sheet signed before keeps its figure", () => {
  const data = sheet([line("r1", { testedValue3: "99.990gm", testedValue4: "200.010gm", testedValue5: "400.000gm" })]);
  const now = withComputedCells(ID, data).rows[0];
  assert.equal(now.deviation3, "0.01%", "99.990 against 100.000: 0.01%, no minus");
  assert.equal(now.deviation4, "0.005%");
  assert.equal(now.passFail, "Pass");
  const before = withComputedCells(ID, data, undefined, "2026-10-01T00:00:00.000Z").rows[0];
  assert.equal(before.deviation3, "-0.01%", "a sheet submitted before keeps the figure it was signed with");
  assert.ok(POSITIVE_DEVIATION_SINCE.startsWith("2026-10-30"));
});

test("outside ± the Acceptable Tolerance the line Fails, and Insights tells the QA manager (C4)", () => {
  const data = withComputedCells(ID, sheet([line("r1", { date: "2026-10-30", testedValue3: "100.002gm", testedValue4: "199.990gm", testedValue5: "400.300gm" })]));
  assert.equal(data.rows[0].deviation5, "0.075%");
  assert.equal(data.rows[0].passFail, "Fail");
  const rec = {
    id: "qc12-fail",
    documentId: ID,
    periodKey: `${ID}:2026-10`,
    dueDate: "2026-10-30",
    status: "Submitted",
    isDemo: false,
    data: { ...data, header: { ...data.header, deviceIdNo: "QC-76" } },
    createdAt: "2026-10-30T05:00:00.000Z",
    updatedAt: "2026-10-30T06:00:00.000Z",
    submittedAt: "2026-10-30T06:00:00.000Z",
    submittedBy: "Kapila Barad",
    history: [{ id: "h", at: "2026-10-30T06:00:00.000Z", by: "Kapila Barad", action: "edited" }],
  } as unknown as RecordInstance;
  const found = computeInsights({ records: [rec], documents: documentRepository.getAllUnscoped(), today: "2026-10-30", isDemo: false }).filter((i) => i.rule === "C4");
  assert.equal(found.length, 1);
  assert.match(found[0].title, /QC-76.*failed its check on 30-10-2026/);
  assert.match(found[0].detail, /QA manager/);
});

test("a Tested Value typed as the bare figure takes its weight's unit and places", () => {
  assert.equal(unitized("100.002", "100.000gm"), "100.002gm");
  assert.equal(unitized("100", "100.000gm"), "100.000gm");
  assert.equal(unitized("399.9", "400.000gm"), "399.900gm");
  assert.equal(unitized("100.002gm", "100.000gm"), null, "a figure with its own unit is kept");
  assert.equal(unitized("OK", "100.000gm"), null);
  const layout = getLogSheetLayout(ID)!;
  for (const i of [3, 4, 5]) assert.equal(layout.columns.find((c) => c.key === `testedValue${i}`)?.unitFrom, `weight${i}`);
  assert.equal(layout.columns.find((c) => c.key === "testedValue1")?.unitFrom, undefined, "the fixed Tested Values are not typed");
});

test("the first line's date is the previous week's Next Due Date; the Next Due Dates and the lines below follow", () => {
  const prev = {
    id: "qc12-sep",
    documentId: ID,
    periodKey: `${ID}:2026-09`,
    dueDate: "2026-10-01",
    status: "Verified",
    isDemo: false,
    data: sheet([line("p1", { date: "2026-10-16", nextDueDate: "2026-10-23" }), line("p2", { date: "2026-10-23", nextDueDate: "2026-10-30" })]),
    createdAt: "2026-10-01T05:00:00.000Z",
    updatedAt: "2026-10-23T06:00:00.000Z",
  } as unknown as RecordInstance;
  recordRepository.upsert(prev);
  const fresh = { id: "qc12-oct", dueDate: "2026-10-30", isDemo: false };
  assert.equal(firstWeekDate(ID, fresh), "2026-10-30", "last week's Next Due Date");
  const filled = nominalFill(ID, sheet([line("n1"), line("n2"), line("n3")]), "Kapila Barad", firstWeekDate(ID, fresh))!;
  const rows = withComputedCells(ID, filled).rows;
  assert.deepEqual(
    rows.map((r) => [r.date, r.nextDueDate]),
    [
      ["2026-10-30", "2026-11-06"],
      ["2026-11-06", "2026-11-13"],
      ["2026-11-13", "2026-11-20"],
    ]
  );
  assert.equal(rows[0].testedBy, "Kapila Barad");
  // The week's readings filled with the standard weights, Pass, to be confirmed by the person (the owner, 30-Oct-2026).
  [rows[0].testedValue3, rows[0].testedValue4, rows[0].testedValue5].forEach((v, i) => {
    const std = [100, 200, 400][i];
    assert.match(String(v), /^\d+\.\d{3}gm$/);
    assert.ok(Math.abs(parseFloat(String(v)) - std) / std * 100 <= 0.05 + 1e-9, "within the 0.05 % tolerance");
  });
  assert.equal(rows[0].passFail, "Pass");
  assert.equal(rows[0].readingsToConfirm, "yes");
  assert.equal(rows[1].testedValue3, "", "next week's line waits for its own week");
  recordRepository.remove(prev.id);
});

test("the index sets the Acceptable Tolerance new sheets start with and the days between checks", () => {
  const since = "2026-10-29T00:00:00.000Z";
  writeIndexState({
    schema: 1,
    current: { ...emptySnapshot(), ranges: { "value:qc12.tolerance": { value: 0.1 }, "value:qc12.days": { value: 14 } } },
    versions: [],
    formulas: {},
    ranges: {
      "value:qc12.tolerance": [{ value: { value: 0.1 }, since, by: "Super Admin", version: 1 }],
      "value:qc12.days": [{ value: { value: 14 }, since, by: "Super Admin", version: 1 }],
    },
  });
  const layout = getLogSheetLayout(ID)!;
  assert.equal(layout.headerFields.find((f) => f.key === "acceptableTolerance")?.autoFill?.default, "0.1 %");
  assert.equal(layout.nextDueChain?.days, 14);
  const rows = withComputedCells(ID, sheet([line("a", { date: "2026-10-30" })])).rows;
  assert.equal(rows[0].nextDueDate, "2026-11-13");
  writeIndexState({ schema: 1, current: emptySnapshot(), versions: [], formulas: {}, ranges: {} });
  assert.equal(getLogSheetLayout(ID)!.nextDueChain?.days, 7, "back to the default");
});

test("filled readings must be confirmed before the sheet is submitted", async () => {
  const { validateForSubmit } = await import("../src/engine/validation");
  const doc = documentRepository.getByIdUnscoped(ID)!;
  const filled = nominalFill(ID, sheet([line("c1", { date: "2026-10-30" })]), "Kapila Barad")!;
  const base = { id: "qc12-confirm", documentId: ID, periodKey: `${ID}:2026-10`, dueDate: "2026-10-30", status: "In Progress", isDemo: false, createdAt: "", updatedAt: "" };
  const pending = validateForSubmit(doc, { ...base, data: withComputedCells(ID, filled) } as unknown as RecordInstance);
  assert.ok(!pending.valid && pending.errors.some((e) => /confirm the Tested Values/.test(e)));
  const confirmed = { ...filled, rows: filled.rows.map(({ readingsToConfirm, ...r }) => r) } as LogSheetData;
  const ok = validateForSubmit(doc, { ...base, data: withComputedCells(ID, confirmed) } as unknown as RecordInstance);
  assert.ok(!(ok.errors ?? []).some((e) => /confirm the Tested Values/.test(e)));
});
