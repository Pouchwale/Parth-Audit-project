// A READING OUT OF ITS BAND SAYS WHY, IN DEMO MODE (engine/autoFill.ts explainExcursions, engine/plantSimulation.ts).
// The browser suite e2e_realism.py checks the same over the months Demo Mode keeps daily sheets for, which move with
// the real clock: in October 2026 none of them held an excursion on F/QC/32 (its only one, 1-Oct, is the weekly off),
// and the check had nothing to judge. Here the rule is proved on a date the plant model is known to drift on.
// Run: npm run test:unit -- excursionRemarks
import test from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData } from "../src/types";
import { ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrMasterSeeded } from "../src/data/repositories/hrMasterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { generateDemoRecordsForMonth } from "../src/data/demoGenerator";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { readingFor } from "../src/engine/plantSimulation";

const DOC = "qc-adhesive-mixing";
const DRIFT_DAY = "2026-07-21"; // a Tuesday; the plant model takes the third batch's viscosity out of 19-21 Sec. that day

test("F/QC/32: the plant model's drift on 21-Jul-2026 is out of band, so the day is a fair test", () => {
  const col = getLogSheetLayout(DOC)!.columns.find((c) => c.key === "viscosity")!;
  const third = readingFor(DOC, DRIFT_DAY, col, 2, 3);
  assert.equal(third.outOfBand, true, `viscosity ${third.value}`);
});

test("F/QC/32 in a Demo Mode month: every viscosity outside its band has a remark beside it, and the drift day has one", () => {
  ensureMasterSeeded();
  ensureHrMasterSeeded();
  ensureDocumentsSeeded();
  generateDemoRecordsForMonth(2026, 6, (doc) => doc.id === DOC);
  const layout = getLogSheetLayout(DOC)!;
  const col = layout.columns.find((c) => c.key === "viscosity")!;
  const records = recordRepository.queryUnscoped({ isDemo: true }).filter((r) => r.documentId === DOC);
  assert.ok(records.length >= 20, `a month of F/QC/32 (${records.length})`);
  let out = 0;
  for (const r of records) {
    for (const row of (r.data as LogSheetData).rows ?? []) {
      const v = row.viscosity;
      if (typeof v !== "number" || (v >= col.min! && v <= col.max!)) continue;
      out++;
      assert.ok(String(row.remark ?? "").trim(), `${r.dueDate}: viscosity ${v} with no remark`);
    }
  }
  const drift = records.find((r) => r.dueDate === DRIFT_DAY);
  assert.ok(drift, "the drift day has its sheet");
  assert.ok(out >= 1, "at least the drift day's reading is out of band");
});
