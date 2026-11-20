// F/HR/20's round answered and F/HR/21 worked out from it by the morning's preparation (REQUIREMENTS §267).
// Run: npm run test:unit -- pscFill
import test from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData, RecordInstance } from "../src/types";
import { ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrSeeded } from "../src/data/repositories/hrMasterRepository";
import { ensureSeeded as ensureRecordsSeeded, recordRepository } from "../src/data/repositories/recordRepository";
import { ensureRecordsGeneratedForMonth } from "../src/engine/recordGenerator";
import { prepareDueRecords } from "../src/engine/assistantPrepare";
import { PSC_ROUND_SIZE, PSC_SURVEY_DOC, roundDateOf } from "../src/engine/pscSurveyRound";
import { fillPscSurveyDue, PSC_ANALYSIS_DOC } from "../src/engine/pscFill";
import { pscAnalysis, PSC_FLOOR } from "../src/engine/pscScores";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrSeeded();
ensureRecordsSeeded();

const forms = (): RecordInstance[] =>
  recordRepository
    .queryUnscoped({ documentId: PSC_SURVEY_DOC, isDemo: false })
    .filter((r) => roundDateOf(r)?.startsWith("2027"))
    .sort((a, b) => a.periodKey.localeCompare(b.periodKey));
const analysis = (): RecordInstance => recordRepository.queryUnscoped({ documentId: PSC_ANALYSIS_DOC, isDemo: false }).find((r) => r.dueDate.startsWith("2027"))!;
const rowsOf = (r: RecordInstance) => (r.data as LogSheetData).rows;
const pct = (s: unknown) => Number(String(s).replace("%", ""));

test("nothing is answered before 1 January (§201)", () => {
  ensureRecordsGeneratedForMonth(2027, 0, { documentIds: [PSC_SURVEY_DOC, PSC_ANALYSIS_DOC] });
  assert.equal(forms().length, PSC_ROUND_SIZE);
  assert.ok(analysis(), "the 2027 analysis is made");
  assert.equal(fillPscSurveyDue("2026-12-31").length, 0);
  assert.ok(forms().every((r) => rowsOf(r).every((row) => !String(row.response ?? "").trim())));
});

test("from 1 January: every form answered 7 / 6 (1 / 2 to attribute 8), and F/HR/21 worked out over 90%", () => {
  prepareDueRecords("2027-01-02");
  for (const r of forms()) {
    assert.equal(r.status, "In Progress");
    rowsOf(r).forEach((row, i) => assert.match(String(row.response), i === 7 ? /^[12] — / : /^[76] — /));
  }
  const a = analysis();
  const header = (a.data as LogSheetData).header!;
  assert.equal(header.surveyPeriod, "JANUARY 2027");
  assert.ok(pct(header.overallAchieved) >= 91 && pct(header.overallAchieved) <= 97.6, String(header.overallAchieved));
  for (const row of rowsOf(a)) {
    assert.ok(pct(row.achieved) >= PSC_FLOOR, String(row.achieved));
    assert.equal(Number(row.sa7 ?? 0) + Number(row.ma6 ?? 0) + Number(row.md2 ?? 0) + Number(row.sd1 ?? 0), PSC_ROUND_SIZE, "every form counted");
  }
  assert.ok(String(rowsOf(a)[0].parameter).startsWith("I can freely speak up"), "the attributes kept");
  // Run again: nothing changes.
  assert.equal(fillPscSurveyDue("2027-01-03").length, 0);
});

test("a person's change on a form is kept, and the analysis follows it; once a person writes on the analysis it is theirs", () => {
  const form = forms()[0];
  const rows = rowsOf(form).map((row, i) => (i === 0 ? { ...row, response: "5 — Agree" } : row));
  recordRepository.upsertMany([{ ...form, data: { ...(form.data as LogSheetData), rows }, updatedAt: new Date(Date.now() + 600_000).toISOString() }]);
  const changed = fillPscSurveyDue("2027-01-04");
  assert.deepEqual(changed.map((r) => r.documentId), [PSC_ANALYSIS_DOC], "only the analysis is worked out again");
  assert.equal(rowsOf(forms()[0])[0].response, "5 — Agree", "the person's answer stays");
  assert.equal(rowsOf(analysis())[0].a5, 1);
  const expected = pscAnalysis(forms().map((f) => rowsOf(f).map((row) => row.response)));
  assert.equal((analysis().data as LogSheetData).header!.overallAchieved, expected.overall);
  // A person writes on the analysis: it is theirs from then on.
  const a = analysis();
  recordRepository.upsertMany([{ ...a, data: { ...(a.data as LogSheetData), header: { ...(a.data as LogSheetData).header, overallAchieved: "95.00%" } }, updatedAt: new Date(Date.now() + 1_200_000).toISOString() }]);
  assert.equal(fillPscSurveyDue("2027-01-05").length, 0);
  assert.equal((analysis().data as LogSheetData).header!.overallAchieved, "95.00%");
});

test("the January-2026 analysis on file stays exactly as printed", () => {
  const jan26 = recordRepository.queryUnscoped({ documentId: PSC_ANALYSIS_DOC, isDemo: false }).find((r) => r.dueDate.startsWith("2026"))!;
  assert.equal((jan26.data as LogSheetData).header!.overallAchieved, "93.99%");
  assert.equal(rowsOf(jan26)[1].achieved, "95.02%");
});
