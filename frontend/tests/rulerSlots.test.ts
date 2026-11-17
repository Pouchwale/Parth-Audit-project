// F/QC/17: TWENTY RULERS A YEAR FOR EACH SCALE (REQUIREMENTS §220; the owner, 15-Nov-2026: "every year it the system
// should automatically generate atleast 20 for each both 300 mm and 600 mm"; asked: Serial number 01 to 20 written in,
// New adds a 21st once all are filled, the rulers filed under later years moved into this one and the empty later
// record deleted). The plant's own case: rulers 02, 03 (filed under next year) and 04 (the year after), an empty record
// three years on. Built from the year today falls in, so it holds whatever the date.
// Run: npm run test:unit -- rulerSlots
import test from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded, masterRepository } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureRecordsSeeded, recordRepository } from "../src/data/repositories/recordRepository";
import { RULER_300_ID, RULER_600_ID } from "../src/data/seed/qcRulerVerificationLayouts";
import { ensureRulerSlots, RULER_SLOTS, slotOf } from "../src/engine/rulerSlots";
import { newRecordFromButton } from "../src/engine/newRecord";
import { deleteRecordWithTrail } from "../src/engine/recordCrud";
import { ensureRecordsGeneratedForMonth } from "../src/engine/recordGenerator";
import { schedulePeriodOf } from "../src/engine/frequencyEngine";
import { nextWorkingDay } from "../src/engine/holidays";
import { createDefaultData } from "../src/engine/recordDefaults";
import { addDays, todayISO } from "../src/utils/date";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureRecordsSeeded();

const today = todayISO();
const clear = (id: string): void => void recordRepository.removeIds(recordRepository.queryUnscoped({ documentId: id }).map((r) => r.id));
const header = (r: RecordInstance): Record<string, unknown> => (r.data as LogSheetData).header ?? {};
const yearOf = (id: string, scheduled: string): RecordInstance[] =>
  recordRepository
    .queryUnscoped({ documentId: id, isDemo: false })
    .filter((r) => r.periodKey.startsWith(`${id}:${scheduled}#`))
    .sort((a, b) => (slotOf(a) ?? 0) - (slotOf(b) ?? 0));

function oldRecord(id: string, keyDate: string, due: string, serial: string, status: RecordInstance["status"]): RecordInstance {
  const doc = documentRepository.getByIdUnscoped(id)!;
  const data = createDefaultData(doc, due, masterRepository.get()) as LogSheetData;
  return recordRepository.upsert({
    id: `rec-old-${keyDate}`,
    documentId: id,
    periodKey: `${id}:${keyDate}`,
    dueDate: due,
    status,
    isDemo: false,
    data: { ...data, header: { ...data.header, serialNo: serial, make: serial ? "Ajanta" : "" } },
    createdAt: `${today}T07:00:00.000Z`,
    updatedAt: `${today}T07:00:00.000Z`,
  } as RecordInstance);
}

test("each scale's year holds twenty records, Serial number 01 to 20, dated by the frequency; the plant's rulers filed in it", () => {
  for (const id of [RULER_600_ID, RULER_300_ID]) clear(id);
  const doc = documentRepository.getByIdUnscoped(RULER_600_ID)!;
  const year = schedulePeriodOf(doc, today)!;
  const y = Number(year.scheduled.slice(0, 4));
  const at = (n: number) => `${y + n}${year.scheduled.slice(4)}`;
  // The plant's case: 02 under this year, 03 under next year and 04 the year after (both checked this year, dated back
  // into it), and an empty record three years on.
  oldRecord(RULER_600_ID, at(0), addDays(year.scheduled, 1), "02", "Verified");
  oldRecord(RULER_600_ID, at(1), addDays(year.scheduled, 1), "03", "Verified");
  oldRecord(RULER_600_ID, at(2), year.scheduled, "04", "Verified");
  oldRecord(RULER_600_ID, at(3), at(3), "", "In Progress");
  const deleted: string[] = [];

  ensureRulerSlots(today, (r) => {
    deleted.push(r.periodKey);
    recordRepository.removeIds([r.id]);
  });

  assert.deepEqual(deleted, [`${RULER_600_ID}:${at(3)}`], "the empty record made ahead, deleted");
  for (const id of [RULER_600_ID, RULER_300_ID]) {
    const recs = yearOf(id, year.scheduled);
    assert.equal(recs.length, RULER_SLOTS, `${id}: twenty this year`);
    assert.deepEqual(recs.map((r) => slotOf(r)), Array.from({ length: 20 }, (_, i) => i + 1));
    assert.deepEqual(recs.map((r) => header(r).serialNo), Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, "0")), "Serial number 01 to 20");
  }
  const six = yearOf(RULER_600_ID, year.scheduled);
  assert.deepEqual([2, 3, 4].map((n) => six[n - 1].id), [`rec-old-${at(0)}`, `rec-old-${at(1)}`, `rec-old-${at(2)}`], "rulers 02, 03 and 04 are records 02, 03 and 04 of this year");
  assert.equal(six[2].status, "Verified", "as signed");
  assert.match(String(six[2].history?.at(-1)?.note), /the year it was checked in/);
  const fresh = six.filter((r) => !r.id.startsWith("rec-old-"));
  assert.ok(fresh.every((r) => r.dueDate === nextWorkingDay(year.scheduled, masterRepository.get()) && r.status === "Due"), "dated by the frequency");

  assert.equal(ensureRulerSlots(today), 0, "nothing to do a second time");
});

test("New record adds the year's next number every time - 21, 22, 23 ... as many as wanted, whatever is still to fill (§245)", () => {
  const doc = documentRepository.getByIdUnscoped(RULER_300_ID)!;
  const year = schedulePeriodOf(doc, today)!;
  const first = newRecordFromButton(doc, false, today);
  assert.equal(slotOf(first.record), 21, "the twenty are still to fill: a new record all the same");
  assert.equal(header(first.record).serialNo, "21");
  assert.match(String(first.notice), /Record 21 added to this year's records/);
  const more = Array.from({ length: 30 }, () => newRecordFromButton(doc, false, today).record);
  assert.deepEqual(more.map((r) => slotOf(r)), Array.from({ length: 30 }, (_, i) => 22 + i), "no limit: 22 to 51");
  assert.equal(yearOf(RULER_300_ID, year.scheduled).length, 51);
});

test("a record deleted is never made again: the start does not put a deleted place back, and its number is not given twice (§245)", () => {
  const doc = documentRepository.getByIdUnscoped(RULER_300_ID)!;
  const year = schedulePeriodOf(doc, today)!;
  const r07 = yearOf(RULER_300_ID, year.scheduled).find((r) => slotOf(r) === 7)!;
  deleteRecordWithTrail(r07, "Kapila Barad", "made by mistake");
  assert.ok(!yearOf(RULER_300_ID, year.scheduled).some((r) => slotOf(r) === 7));
  ensureRulerSlots(today);
  assert.ok(!yearOf(RULER_300_ID, year.scheduled).some((r) => slotOf(r) === 7), "07 not made again at the start");
  const last = yearOf(RULER_300_ID, year.scheduled).sort((a, b) => (slotOf(b) ?? 0) - (slotOf(a) ?? 0))[0];
  deleteRecordWithTrail(last, "Kapila Barad", "one too many");
  const next = newRecordFromButton(doc, false, today).record;
  assert.equal(slotOf(next), (slotOf(last) ?? 0) + 1, "the deleted last number is not given again");
});

test("next year's twenty are made as its September comes", () => {
  const doc = documentRepository.getByIdUnscoped(RULER_600_ID)!;
  const year = schedulePeriodOf(doc, today)!;
  const next = schedulePeriodOf(doc, addDays(year.to, 1))!;
  ensureRecordsGeneratedForMonth(Number(next.scheduled.slice(0, 4)), Number(next.scheduled.slice(5, 7)) - 1, { documentIds: [RULER_600_ID, RULER_300_ID] });
  for (const id of [RULER_600_ID, RULER_300_ID]) assert.equal(yearOf(id, next.scheduled).length, RULER_SLOTS, `${id}: twenty next year too`);
  for (const id of [RULER_600_ID, RULER_300_ID]) clear(id);
});

test("a record New adds is dated the day it is made, and stays so; one added before is dated the day it was added (§248)", () => {
  const doc = documentRepository.getByIdUnscoped(RULER_600_ID)!;
  const year = schedulePeriodOf(doc, today)!;
  ensureRulerSlots(today);
  const added = newRecordFromButton(doc, false, today).record;
  assert.equal(added.dueDate, today, "dated today: in this month's list");
  assert.ok((slotOf(added) ?? 0) > RULER_SLOTS);
  // One added before §248, dated as the twenty: put on the day it was made at the start.
  const old = recordRepository.upsert({ ...added, id: "old-added", periodKey: added.periodKey.replace(/#\d+$/, "#99"), dueDate: nextWorkingDay(year.scheduled, masterRepository.get()), createdAt: `${today}T05:00:00.000Z` });
  ensureRulerSlots(today);
  assert.equal(recordRepository.getById(old.id)!.dueDate, today);
  assert.equal(recordRepository.getById(added.id)!.dueDate, today, "and kept: the frequency does not date it back");
  for (const id of [RULER_600_ID, RULER_300_ID]) clear(id);
});
