// NEW RECORD: THIS PERIOD'S FIRST, THEN THE NEXT (REQUIREMENTS §211; the owner, 15-Nov-2026: "if user will click on new
// record then it should be open but it will tell user that this year record is not filled then only he can fill next
// year record"; asked, "Start next year's record"). F/QC/17, every 24 September, pressed on 15-11-2026.
// Run: npm run test:unit -- newRecordNextPeriod
import test from "node:test";
import assert from "node:assert/strict";
import type { RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
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

test("F/QC/17: this year's record until it is filled, then next year's, which waits for its day", () => {
  const doc = documentRepository.getById("qc-ruler-verification")!;
  clear(doc.id);

  const first = newRecordFromButton(doc, false, TODAY);
  assert.equal(first.existed, false);
  assert.equal(first.record.dueDate, "2026-09-25", "24-09-2026 is a Thursday, the weekly off");
  assert.equal(first.notice, undefined, "a record just started has nothing to say");

  const again = newRecordFromButton(doc, false, TODAY);
  assert.equal(again.record.id, first.record.id, "this year's record, opened again");
  assert.match(String(again.notice), /^This year's record \(dated 25-09-2026\) is not filled yet\. Fill it and submit it first: next year's record can be started only after that\.$/);

  recordRepository.upsert({ ...(recordRepository.getById(first.record.id) as RecordInstance), status: "Submitted", submittedBy: "Kapila Barad", submittedAt: "2026-11-15T06:00:00.000Z" });
  const next = newRecordFromButton(doc, false, TODAY);
  assert.notEqual(next.record.id, first.record.id, "a new record");
  assert.equal(next.record.periodKey, "qc-ruler-verification:2027-09-24", "next year's");
  assert.equal(next.record.dueDate, "2027-09-24");
  assert.match(String(next.notice), /This year's record \(dated 25-09-2026\) is filled, so this is next year's record, dated 24-09-2027\. Next year's record is started\./);
  assert.equal(waitsUntil(doc, next.record, TODAY), "2027-09-01", "not filled before its time comes (§201: a yearly sheet from its month)");

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
