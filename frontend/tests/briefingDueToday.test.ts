// TODAY'S WORK IS NOT "STILL OPEN FROM EARLIER" (REQUIREMENTS §293). Since §289 nothing is filled until a person opens it,
// so on a working morning every record of the day was listed in the briefing's red section as if it were late.
// Run: npm run test:unit -- briefingDueToday
import test from "node:test";
import assert from "node:assert/strict";
import type { RecordInstance, RecordStatus } from "../src/types";
import { ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrMasterSeeded } from "../src/data/repositories/hrMasterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { briefingHeadline, computeBriefing, pendingCount } from "../src/engine/assistantBriefing";
import { briefingLine } from "../src/utils/voice";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrMasterSeeded();

// A Monday the plant works, and the Saturday before it: the test does not depend on the day it is run.
const MONDAY = new Date(2026, 10, 23, 10, 0, 0);
const TODAY = "2026-11-23";
const EARLIER = "2026-11-21";
const DOC = "qc-camera-challenge-test";

function record(id: string, dueDate: string, status: RecordStatus, extra: Partial<RecordInstance> = {}): RecordInstance {
  return { id, documentId: DOC, periodKey: `${DOC}:${id}`, dueDate, status, isDemo: false, data: { header: {}, rows: [] }, createdAt: `${dueDate}T03:00:00.000Z`, updatedAt: `${dueDate}T03:00:00.000Z`, ...extra };
}

test("a record due today and not opened is 'due today'; one from an earlier day is 'still open from earlier'", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: MONDAY });
  const made = [record("brief-today", TODAY, "Due"), record("brief-earlier", EARLIER, "Due"), record("brief-rejected", TODAY, "Rejected", { rejectionReason: "Wrong batch" })];
  for (const r of made) recordRepository.upsert(r);
  try {
    const b = computeBriefing("Ajay Sinh Vaghela");
    const has = (list: { recordId: string }[], id: string) => list.some((i) => i.recordId === id);
    assert.ok(has(b.dueToday, "brief-today"), "today's record is due today");
    assert.ok(!has(b.overdue, "brief-today"), "today's record is not late");
    assert.ok(has(b.overdue, "brief-earlier"), "an earlier day's record stays late");
    assert.ok(!has(b.dueToday, "brief-earlier"));
    const rejected = b.dueToday.find((i) => i.recordId === "brief-rejected");
    assert.deepEqual(rejected?.errors, ["Rejected: Wrong batch"], "a record sent back today keeps its reason");
    assert.ok(b.dueToday.every((i) => i.dueDate === TODAY) && b.overdue.every((i) => i.dueDate < TODAY));
    assert.equal(pendingCount(b), b.ready.length + b.needsInput.length + b.overdue.length + b.dueToday.length, "the evening briefing still counts today's work");
    const line = briefingHeadline(b);
    assert.match(line, new RegExp(`${b.dueToday.length} due today`));
    assert.match(line, new RegExp(`${b.overdue.length} still open from earlier`));
  } finally {
    for (const r of made) recordRepository.remove(r.id);
  }
});

test("the spoken briefing says it the same way, in English and Gujarati", () => {
  const facts = { firstName: "Heena", slot: "morning" as const, hour: 9, ready: 0, needsInput: 0, overdue: 0, dueToday: 4, awaiting: 0, top: ["Adhesive Mixing Record"], seed: "d" };
  const en = briefingLine(facts, "en");
  assert.match(en, /You have 4 due today\./);
  assert.doesNotMatch(en, /from earlier/);
  assert.match(briefingLine(facts, "gu"), /4 આજે ભરવાના/);
});
