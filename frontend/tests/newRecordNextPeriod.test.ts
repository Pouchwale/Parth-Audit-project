// NEW RECORD: THIS PERIOD'S FIRST, THEN THE NEXT (REQUIREMENTS §211; the owner, 15-Nov-2026: "if user will click on new
// record then it should be open but it will tell user that this year record is not filled then only he can fill next
// year record"; asked, "Start next year's record"). A yearly document, pressed on 15-11-2026.
// Run: npm run test:unit -- newRecordNextPeriod
import test from "node:test";
import assert from "node:assert/strict";
import type { RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded, masterRepository } from "../src/data/repositories/masterRepository";
import { isRulerVerification } from "../src/data/seed/qcRulerVerificationLayouts";
import { schedulePeriodOf } from "../src/engine/frequencyEngine";
import { nextWorkingDay } from "../src/engine/holidays";
import { addDays, formatDisplayDate } from "../src/utils/date";
import { ensureSeeded as ensureRecordsSeeded, recordRepository } from "../src/data/repositories/recordRepository";
import { newRecordFromButton, noteOnOpen, peekNoteOnOpen, forgetNoteOnOpen } from "../src/engine/newRecord";
import { waitsUntil } from "../src/engine/notBeforeDay";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureRecordsSeeded();

const TODAY = "2026-11-15";

function clear(documentId: string): void {
  recordRepository.removeIds(recordRepository.queryUnscoped({ documentId, isDemo: false }).map((r) => r.id));
}

test("a yearly document: this year's record until it is filled, then next year's, which waits for its time", () => {
  // (F/QC/17 holds twenty records a year since §220: a yearly document of one record a year shows the rule.)
  const doc = documentRepository.getRecordableUnscoped().find((d) => d.schedule.type === "yearly" && d.kind === "log-sheet" && !d.isReferenceOnly && !isRulerVerification(d.id))!;
  assert.ok(doc, "a yearly document of one record a year");
  clear(doc.id);
  const master = masterRepository.get();
  const thisYear = schedulePeriodOf(doc, TODAY)!;
  const nextYear = schedulePeriodOf(doc, addDays(thisYear.to, 1))!;
  const thisDue = nextWorkingDay(thisYear.scheduled, master);
  const nextDue = nextWorkingDay(nextYear.scheduled, master);

  const first = newRecordFromButton(doc, false, TODAY);
  assert.equal(first.existed, false);
  assert.equal(first.record.dueDate, thisDue, "dated by its frequency");
  assert.equal(first.notice, undefined, "a record just started has nothing to say");

  const again = newRecordFromButton(doc, false, TODAY);
  assert.equal(again.record.id, first.record.id, "this year's record, opened again");
  assert.equal(String(again.notice), `This year's record (dated ${formatDisplayDate(thisDue)}) is not filled yet. Fill it and submit it first: next year's record can be started only after that.`);

  recordRepository.upsert({ ...(recordRepository.getById(first.record.id) as RecordInstance), status: "Submitted", submittedBy: "Kapila Barad", submittedAt: "2026-11-15T06:00:00.000Z" });
  const next = newRecordFromButton(doc, false, TODAY);
  assert.notEqual(next.record.id, first.record.id, "a new record");
  assert.equal(next.record.periodKey, `${doc.id}:${nextYear.scheduled}`, "next year's");
  assert.equal(next.record.dueDate, nextDue);
  assert.match(String(next.notice), new RegExp(`is filled, so this is next year's record, dated ${formatDisplayDate(nextDue)}\. Next year's record is started\.`));
  assert.ok(waitsUntil(doc, next.record, TODAY), "not filled before its time comes (§201)");

  const nextAgain = newRecordFromButton(doc, false, TODAY);
  assert.equal(nextAgain.record.id, next.record.id, "next year's, opened again: no third");
  assert.doesNotMatch(String(nextAgain.notice), /is started/);

  // Reopened for correction: this year's is not filled again.
  recordRepository.upsert({
    ...(recordRepository.getById(first.record.id) as RecordInstance),
    status: "In Progress",
    correction: { reason: "typo", by: "Kapila Barad", at: "2026-11-15T07:00:00.000Z", fromStatus: "Submitted", dataBefore: {}, headerBlockBefore: null },
  } as RecordInstance);
  const corrected = newRecordFromButton(doc, false, TODAY);
  assert.equal(corrected.record.id, first.record.id);
  assert.match(String(corrected.notice), /not filled yet/);
  clear(doc.id);
});

test("a monthly document says month; an as-required one starts a record every time", () => {
  const monthly = documentRepository.getAll().find((d) => d.schedule.type === "monthly")!;
  clear(monthly.id);
  const a = newRecordFromButton(monthly, false, TODAY);
  const b = newRecordFromButton(monthly, false, TODAY);
  assert.equal(b.record.id, a.record.id);
  assert.match(String(b.notice), /^This month's record .* next month's record can be started only after that\.$/);
  clear(monthly.id);

  const asRequired = documentRepository.getAll().find((d) => d.schedule.type === "as-required" && d.kind === "log-sheet" && !d.isReferenceOnly)!;
  const x = newRecordFromButton(asRequired, false, TODAY);
  const y = newRecordFromButton(asRequired, false, TODAY);
  assert.notEqual(x.record.id, y.record.id);
  assert.equal(y.notice, undefined);
  recordRepository.removeIds([x.record.id, y.record.id]);
});

test("the words reach the record page once, and are read twice safely", () => {
  noteOnOpen("rec-a", "hello");
  assert.equal(peekNoteOnOpen("rec-a"), "hello");
  assert.equal(peekNoteOnOpen("rec-a"), "hello", "React's strict mode reads twice");
  forgetNoteOnOpen("rec-a");
  assert.equal(peekNoteOnOpen("rec-a"), null);
  noteOnOpen("rec-b", undefined);
  assert.equal(peekNoteOnOpen("rec-b"), null);
});
