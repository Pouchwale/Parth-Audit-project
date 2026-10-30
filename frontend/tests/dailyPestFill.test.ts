// F/HR/17 ANSWERED ON OPENING (REQUIREMENTS §149): the plant's usual day, nothing found, in the opener's name; every
// answer the person's to change; a holiday and a day already answered left as they are; no catch ever written.
// Run: npm run test:unit -- dailyPestFill
import test from "node:test";
import assert from "node:assert/strict";
import type { DailyPestMonitoringData } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { createDefaultData } from "../src/engine/recordDefaults";
import { DAILY_PEST_USUAL, dailyPestFillOnOpen } from "../src/engine/dailyPestFill";

ensureDocumentsSeeded();
ensureMasterSeeded();

const blankDay = (): DailyPestMonitoringData => createDefaultData(documentRepository.getByIdUnscoped("daily-pest-monitoring")!, "2026-11-02", masterRepository.get()) as DailyPestMonitoringData;

test("a day opened with nothing answered takes the plant's usual answers, nothing found, the opener and the time", () => {
  const day = blankDay();
  const filled = dailyPestFillOnOpen(day, "Kapila Barad", "09:15")!;
  assert.ok(filled);
  assert.deepEqual(Object.fromEntries(Object.entries(filled.checkpoints).map(([k, a]) => [k, a.value])), Object.fromEntries(Object.entries(DAILY_PEST_USUAL).map(([k, v]) => [k, v])));
  assert.deepEqual([filled.checkpoints[7].value, filled.checkpoints[8].value, filled.checkpoints[9].value], ["No", "No", "No"], "nothing found");
  assert.deepEqual(filled.rodentCatches ?? [], [], "no catch is ever written");
  assert.deepEqual([filled.checker, filled.timeOfChecking], ["Kapila Barad", "09:15"]);
});

test("a day already answered, or a holiday, is left as it is", () => {
  const day = blankDay();
  const answered = { ...day, checkpoints: { ...day.checkpoints, 7: { value: "Yes" } } };
  assert.equal(dailyPestFillOnOpen(answered, "x", "09:00"), null);
  assert.equal(dailyPestFillOnOpen({ ...day, isHoliday: true }, "x", "09:00"), null);
  assert.equal(dailyPestFillOnOpen(undefined, "x", "09:00"), null);
});
