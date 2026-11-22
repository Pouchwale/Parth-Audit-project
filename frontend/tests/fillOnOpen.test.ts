// NO DOCUMENT FILLS UNTIL A PERSON OPENS IT, EXCEPT F/QC/12 (REQUIREMENTS §289; the owner, 22-Nov-2026: "no document should fill before due
// date until user come on screen and open it on then only it should fills automatically except qc-12").
// Run: npm run test:unit -- fillOnOpen
import test from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded, masterRepository } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrSeeded } from "../src/data/repositories/hrMasterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { settingsRepository } from "../src/data/repositories/settingsRepository";
import { createDefaultData } from "../src/engine/recordDefaults";
import { prepareRecordOnOpen, prepareUnattended } from "../src/engine/assistantPrepare";
import { todayISO, addDays } from "../src/utils/date";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrSeeded();
settingsRepository.update({ liveStartDate: "2026-01-01" });

const today = todayISO();
const shell = (id: string, documentId: string, dueDate: string): RecordInstance => {
  const doc = documentRepository.getByIdUnscoped(documentId)!;
  return recordRepository.upsert({
    id,
    documentId,
    periodKey: `${documentId}:${dueDate}:${id}`,
    dueDate,
    status: "Due",
    isDemo: false,
    data: createDefaultData(doc, dueDate, masterRepository.get()),
    createdAt: `${today}T01:00:00.000Z`,
    updatedAt: `${today}T01:00:00.000Z`,
  } as RecordInstance);
};
const dailyDoc = () => documentRepository.getRecordableUnscoped().find((d) => d.kind === "log-sheet" && d.schedule.type === "daily")!;

test("with nobody at the screen a document's sheet stays as it was made, whatever its date", () => {
  const doc = dailyDoc();
  const before = shell("open-1", doc.id, today);
  prepareUnattended(today);
  const after = recordRepository.getById("open-1")!;
  assert.equal(after.status, "Due");
  assert.equal(after.prepared, undefined);
  assert.deepEqual(after.data, before.data);
});

test("opened on its day it is filled, once; opened before its day it is not", () => {
  const doc = dailyDoc();
  shell("open-2", doc.id, today);
  const opened = prepareRecordOnOpen("open-2", today)!;
  assert.equal(opened.status, "In Progress");
  assert.ok(opened.prepared, "prepared as it is opened");
  assert.equal(prepareRecordOnOpen("open-2", today)!.updatedAt, opened.updatedAt, "opened again: nothing more");
  const later = addDays(today, 3);
  shell("open-3", doc.id, later);
  const early = prepareRecordOnOpen("open-3", today)!;
  assert.equal(early.status, "Due", "before its day: not filled");
  assert.equal(early.prepared, undefined);
});

test("opening one record fills that record alone", () => {
  const doc = dailyDoc();
  shell("open-4", doc.id, today);
  shell("open-5", doc.id, addDays(today, -1));
  prepareRecordOnOpen("open-4", today);
  assert.equal(recordRepository.getById("open-5")!.status, "Due");
});

test("F/QC/12 is the one document prepared with nobody at the screen", () => {
  const scale = "qc-weight-scale-calibration";
  shell("open-6", scale, today);
  prepareUnattended(today);
  const after = recordRepository.getById("open-6")!;
  assert.equal(after.status, "In Progress");
  const rows = (after.data as LogSheetData).rows;
  assert.ok(rows.every((r) => !String(r.testedBy ?? "").trim() && !String(r.sign ?? "").trim()), "and its sign boxes stay empty (§288)");
});

test("an F/HR/20 form opened keeps its answers for the employee", () => {
  shell("open-7", "hr-psc-survey", "2026-01-31");
  const opened = prepareRecordOnOpen("open-7", "2026-01-15")!;
  assert.ok((opened.data as LogSheetData).rows.every((r) => !String(r.response ?? "").trim()));
});
