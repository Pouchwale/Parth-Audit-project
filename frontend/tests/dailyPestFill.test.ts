// F/HR/17 ANSWERED ON OPENING (REQUIREMENTS §149): the plant's usual day, nothing found, in the opener's name; every
// answer the person's to change; a holiday and a day already answered left as they are; no catch ever written.
// Run: npm run test:unit -- dailyPestFill
import test from "node:test";
import assert from "node:assert/strict";
import type { DailyPestMonitoringData } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { createDefaultData } from "../src/engine/recordDefaults";
import { DAILY_PEST_USUAL, catchActionId, checkpointActionId, dailyPestFillOnOpen, withCatchFollowUps, withCheckpointFollowUps } from "../src/engine/dailyPestFill";
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

test("submitted, the day is signed by whoever submits it: the checker and the time of checking are theirs (REQUIREMENTS §149)", () => {
  const doc = documentRepository.getByIdUnscoped("daily-pest-monitoring")!;
  const data = dailyPestFillOnOpen(blankDay(), "Kapila Barad", "09:15")!;
  const now = new Date().toISOString();
  const rec: RecordInstance = { id: "unit-fhr17-submit", documentId: doc.id, periodKey: `${doc.id}:2026-11-02`, dueDate: "2026-11-02", status: "In Progress", isDemo: false, data, createdAt: now, updatedAt: now };
  recordRepository.upsert(rec);
  try {
    const { record, result } = submitRecord(doc, rec, "Meet Patel");
    assert.ok(result.valid, JSON.stringify(result));
    const d = record.data as DailyPestMonitoringData;
    assert.equal(d.checker, "Meet Patel", "the submitter is the checker");
    assert.match(d.timeOfChecking, /^\d{2}:\d{2}$/);
    assert.notEqual(d.timeOfChecking, "09:15", "the time of submitting, not of opening");
    assert.equal(record.submittedBy, "Meet Patel");
  } finally {
    recordRepository.remove(rec.id);
  }
});

test("a catch a person enters: a Master Data station gives its place, a count gives its 'Caught and disposed' line (REQUIREMENTS §151)", () => {
  const day = dailyPestFillOnOpen(blankDay(), "Kapila Barad", "09:15")!;
  const stations = [{ id: "RBS-07", location: "First floor - Ink Kitchen", type: "Bait Tray" as const, status: "Active" as const }];
  const opened = { ...day, rodentCatches: [{ id: "c1", trapBoxNo: "", location: "", count: 0 }] };
  const boxed = withCatchFollowUps({ ...opened, rodentCatches: [{ id: "c1", trapBoxNo: "rbs-07", location: "", count: 0 }] }, opened, stations, "2026-11-02");
  assert.equal(boxed.rodentCatches![0].location, "First floor - Ink Kitchen", "the station's place");
  assert.equal(boxed.summaryActions.length, 0, "no count yet: no line");
  const counted = withCatchFollowUps({ ...boxed, rodentCatches: [{ ...boxed.rodentCatches![0], count: 1 }] }, boxed, stations, "2026-11-02");
  const line = counted.summaryActions.find((a) => a.id === catchActionId("c1"))!;
  assert.deepEqual([line.actionTaken, line.dateOfObservation, line.descriptionOfObservation], ["Caught and disposed", "2026-11-02", "1 caught in trap box rbs-07 (First floor - Ink Kitchen)"]);
  const two = withCatchFollowUps({ ...counted, rodentCatches: [{ ...counted.rodentCatches![0], count: 2 }] }, counted, stations, "2026-11-02");
  assert.match(two.summaryActions[0].descriptionOfObservation, /^2 caught/, "the line follows the count");
  const own = { ...two, summaryActions: [{ ...two.summaryActions[0], descriptionOfObservation: "Two rats near the ink drums" }] };
  const three = withCatchFollowUps({ ...own, rodentCatches: [{ ...own.rodentCatches![0], count: 3 }] }, own, stations, "2026-11-02");
  assert.equal(three.summaryActions[0].descriptionOfObservation, "Two rats near the ink drums", "words a person wrote are kept");
  assert.equal(three.summaryActions.length, 1);
  assert.equal(withCatchFollowUps(day, day, stations, "2026-11-02").summaryActions.length, 0, "no catch, no line: nothing is made up");
});

test("check point 8 or 9 answered Yes by a person: its note from the day's catch, its Summary of Actions line; No again takes the line off (REQUIREMENTS §152)", () => {
  const day = { ...dailyPestFillOnOpen(blankDay(), "Kapila Barad", "09:15")!, rodentCatches: [{ id: "c1", trapBoxNo: "RBS-07", location: "Canteen", count: 1 }] };
  const yes8 = withCheckpointFollowUps({ ...day, checkpoints: { ...day.checkpoints, 8: { value: "Yes" } } }, day, "2026-11-02");
  assert.equal(yes8.checkpoints[8].note, "Canteen", "the location from the catch");
  const l8 = yes8.summaryActions.find((a) => a.id === checkpointActionId(8))!;
  assert.deepEqual([l8.descriptionOfObservation, l8.actionTaken], ["Dead rodent observed at Canteen", "Caught and disposed"]);
  const yes9 = withCheckpointFollowUps({ ...yes8, checkpoints: { ...yes8.checkpoints, 9: { value: "Yes" } } }, yes8, "2026-11-02");
  assert.equal(yes9.checkpoints[9].note, "RBS-07", "the box from the catch");
  assert.equal(yes9.summaryActions.find((a) => a.id === checkpointActionId(9))!.actionTaken, "Bait cake replaced, box checked");
  const noteTyped = withCheckpointFollowUps({ ...yes9, checkpoints: { ...yes9.checkpoints, 8: { value: "Yes", note: "Store room" } } }, yes9, "2026-11-02");
  assert.equal(noteTyped.summaryActions.find((a) => a.id === checkpointActionId(8))!.descriptionOfObservation, "Dead rodent observed at Store room", "the line follows the note");
  const no8 = withCheckpointFollowUps({ ...noteTyped, checkpoints: { ...noteTyped.checkpoints, 8: { value: "No", note: "Store room" } } }, noteTyped, "2026-11-02");
  assert.ok(!no8.summaryActions.some((a) => a.id === checkpointActionId(8)), "No again: the line goes");
  const plain = dailyPestFillOnOpen(blankDay(), "x", "09:00")!;
  assert.equal(withCheckpointFollowUps(plain, plain, "2026-11-02").summaryActions.length, 0, "the usual day (8 and 9 No) gets no line");
  void catchActionId;
});
