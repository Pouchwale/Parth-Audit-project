// F/HR/17 ANSWERED ON OPENING (REQUIREMENTS §149, §177): the plant's usual day, nothing found, the round at a time between
// 09:00 and 09:30 in Kapila Barad's name (the owner, 3-Nov-2026); every answer the person's to change; a holiday and a
// day already answered left as they are; no catch ever written by the fill; Submit keeps the checker and the time as
// they stand, and refuses a blank one as it always did.
// Run: npm run test:unit -- dailyPestFill
import test from "node:test";
import assert from "node:assert/strict";
import type { DailyPestMonitoringData } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { createDefaultData } from "../src/engine/recordDefaults";
import { DAILY_PEST_CHECKER, DAILY_PEST_USUAL, dailyPestFillOnOpen, dailyPestRoundTime } from "../src/engine/dailyPestFill";
import { submitRecord } from "../src/engine/recordLifecycle";
import { recordRepository } from "../src/data/repositories/recordRepository";
import type { RecordInstance } from "../src/types";

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

test("the round's time is between 09:00 and 09:30, drawn at random, and the checker is Kapila Barad (REQUIREMENTS §177)", () => {
  assert.equal(DAILY_PEST_CHECKER, "Kapila Barad");
  assert.equal(dailyPestRoundTime(() => 0), "09:00");
  assert.equal(dailyPestRoundTime(() => 0.5), "09:15");
  assert.equal(dailyPestRoundTime(() => 0.9999), "09:30");
  for (let i = 0; i < 200; i++) {
    const t = dailyPestRoundTime();
    assert.match(t, /^09:(?:[0-2]\d|30)$/, t);
  }
  const seen = new Set(Array.from({ length: 200 }, () => dailyPestRoundTime()));
  assert.ok(seen.size > 3, `random, not one minute every day: ${[...seen].join(" ")}`);
  const filled = dailyPestFillOnOpen(blankDay(), DAILY_PEST_CHECKER, dailyPestRoundTime(() => 0.3))!;
  assert.deepEqual([filled.checker, filled.timeOfChecking], ["Kapila Barad", "09:09"]);
});

test("submitted, the checker and the time stay as written; a blank one is refused, never filled in (REQUIREMENTS §177, over §149)", () => {
  const doc = documentRepository.getByIdUnscoped("daily-pest-monitoring")!;
  const now = new Date().toISOString();
  const make = (id: string, data: DailyPestMonitoringData): RecordInstance => ({ id, documentId: doc.id, periodKey: `${doc.id}:2026-11-02`, dueDate: "2026-11-02", status: "In Progress", isDemo: false, data, createdAt: now, updatedAt: now });
  const kept = make("unit-fhr17-submit-kept", dailyPestFillOnOpen(blankDay(), "Kapila Barad", "09:15")!);
  const blanks = make("unit-fhr17-submit-blank", { ...dailyPestFillOnOpen(blankDay(), "Kapila Barad", "09:15")!, checker: "", timeOfChecking: "" });
  recordRepository.upsert(kept);
  recordRepository.upsert(blanks);
  try {
    const a = submitRecord(doc, kept, "Meet Patel");
    assert.ok(a.result.valid, JSON.stringify(a.result));
    const d = a.record.data as DailyPestMonitoringData;
    assert.deepEqual([d.checker, d.timeOfChecking], ["Kapila Barad", "09:15"], "as written: the fill's, or the person's");
    assert.ok(!(d.rodentCatches ?? []).some((c) => c.suggested) && !d.summaryActions.some((x) => x.suggested), "no row is left marked as the system's suggestion once submitted");
    assert.equal(a.record.submittedBy, "Meet Patel", "...while the record still says who submitted it");
    const b = submitRecord(doc, blanks, "Meet Patel");
    assert.equal(b.result.valid, false, "a blank checker or time is refused");
    assert.ok(b.result.errors.includes("Checker name is required.") && b.result.errors.includes("Time of checking is required."), b.result.errors.join(" | "));
    const e = b.record.data as DailyPestMonitoringData;
    assert.deepEqual([e.checker, e.timeOfChecking, b.record.status], ["", "", "In Progress"], "...and nothing is written in for the person");
  } finally {
    recordRepository.remove(kept.id);
    recordRepository.remove(blanks.id);
  }
});
