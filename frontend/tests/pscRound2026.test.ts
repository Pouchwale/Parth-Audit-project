// F/HR/20: the year's round of 200 made and answered by the system; the plant's January 2026 round made now and F/HR/21
// January 2026 worked out from it (REQUIREMENTS §356). Run: npm run test:unit -- pscRound2026
import test from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData, RecordInstance } from "../src/types";
import { ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrSeeded, hrMasterRepository } from "../src/data/repositories/hrMasterRepository";
import { ensureSeeded as ensureRecordsSeeded, recordRepository } from "../src/data/repositories/recordRepository";
import { settingsRepository } from "../src/data/repositories/settingsRepository";
import { prepareUnattended } from "../src/engine/assistantPrepare";
import { ensureSurveyRound, PSC_ROUND_SIZE, PSC_SURVEY_DOC, roundDateOf, surveyRank } from "../src/engine/pscSurveyRound";
import { fillPscSurveyDue, PSC_ANALYSIS_DOC, PSC_ANALYSIS_REWORK_NOTE } from "../src/engine/pscFill";
import { PSC_FLOOR } from "../src/engine/pscScores";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrSeeded();
ensureRecordsSeeded();
// The plant went live after January 2026.
settingsRepository.ensureLiveStartDate("2026-09-19");

const round = (): RecordInstance[] =>
  recordRepository
    .queryUnscoped({ documentId: PSC_SURVEY_DOC, isDemo: false })
    .filter((r) => roundDateOf(r) === "2026-01-31")
    .sort((a, b) => a.periodKey.localeCompare(b.periodKey));
const jan26 = (): RecordInstance => recordRepository.queryUnscoped({ documentId: PSC_ANALYSIS_DOC, isDemo: false }).find((r) => r.dueDate.startsWith("2026"))!;
const rowsOf = (r: RecordInstance) => (r.data as LogSheetData).rows;
const pct = (s: unknown) => Number(String(s).replace("%", ""));

test("the January 2026 round: 200 people on HR Master Data by then, every role, helpers making up the 200 - made once", () => {
  const made = ensureSurveyRound("2026-11-25");
  assert.equal(made.length, PSC_ROUND_SIZE);
  assert.equal(made[0].id, "rec-psc-2026-01-31-001");
  assert.equal(made[199].id, "rec-psc-2026-01-31-200");
  const people = hrMasterRepository.all();
  const designations = made.map((r) => String((r.data as LogSheetData).header?.designation ?? ""));
  const names = made.map((r) => String((r.data as LogSheetData).header?.employeeName ?? ""));
  assert.equal(new Set(names).size, 200, "200 different people");
  assert.ok(names.every((n) => people.some((p) => p.fullName === n)), "every one from HR Master Data");
  const ranks = designations.map(surveyRank);
  // 153 staff and operators and 17 guards, drivers, sweepers and peons had joined by January 2026: 30 helpers make the 200.
  assert.equal(ranks.filter((r) => r === "helper").length, 30);
  assert.equal(ranks.filter((r) => r === "out").length, 17);
  const joinedBy = (n: string) => people.find((p) => p.fullName === n)!.joiningDate;
  assert.ok(names.every((n) => !/^\d{4}-/.test(joinedBy(n)) || joinedBy(n) <= "2026-01-31"), "nobody who joined after the survey");
  for (const [rank, role] of [[0, "director"], [1, "HOD"], [3, "executive"], [4, "operator"], [5, "assistant"]] as const)
    assert.ok(ranks.includes(rank), `a ${role} is asked`);
  // Made once: again, nothing; two computers making it at once make the same 200 ids.
  assert.equal(ensureSurveyRound("2026-11-26").length, 0);
  assert.equal(round().length, PSC_ROUND_SIZE);
});

test("with nobody at the screen every form is answered 7 / 6 (1 / 2 to attribute 8), and F/HR/21 January 2026 is worked out from the 200", () => {
  prepareUnattended("2026-11-25");
  for (const r of round()) rowsOf(r).forEach((row, i) => assert.match(String(row.response), i === 7 ? /^[12] — / : /^[76] — /));
  const a = jan26();
  const header = (a.data as LogSheetData).header!;
  assert.equal(header.surveyPeriod, "JANUARY 2026");
  assert.ok(pct(header.overallAchieved) >= 91, String(header.overallAchieved));
  for (const row of rowsOf(a)) {
    assert.ok(pct(row.achieved) >= PSC_FLOOR, String(row.achieved));
    assert.equal(Number(row.sa7 ?? 0) + Number(row.ma6 ?? 0) + Number(row.md2 ?? 0) + Number(row.sd1 ?? 0), PSC_ROUND_SIZE, "all 200 counted");
  }
  assert.ok((a.history ?? []).some((h) => h.note === PSC_ANALYSIS_REWORK_NOTE), "the history says why");
  // Run again: nothing changes.
  assert.equal(fillPscSurveyDue("2026-11-26").length, 0);
});

test("a person's change on a 2026 form is kept, and F/HR/21 January 2026 follows it", () => {
  const form = round()[0];
  const rows = rowsOf(form).map((row, i) => (i === 0 ? { ...row, response: "5 — Agree" } : row));
  recordRepository.upsertMany([{ ...form, data: { ...(form.data as LogSheetData), rows }, updatedAt: new Date(Date.now() + 600_000).toISOString() }]);
  fillPscSurveyDue("2026-11-27");
  assert.equal(rowsOf(round()[0])[0].response, "5 — Agree");
  assert.equal(rowsOf(jan26())[0].a5, 1);
});
