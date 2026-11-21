// WHAT THE OWNER SUPPLIED FOR THE HR MODULE ON 21-NOV-2026 (REQUIREMENTS §273): F/HR/02 as a format of its own, the 38 filled
// F/HR/12 sheets In Progress for HR to sign, the three directors' GP3 Nos.
// Run: npm run test:unit -- hrSuppliedOnFile
import test from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrSeeded, hrMasterRepository } from "../src/data/repositories/hrMasterRepository";
import { ensureSeeded as ensureRecordsSeeded, recordRepository } from "../src/data/repositories/recordRepository";
import { settingsRepository } from "../src/data/repositories/settingsRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { HR_COMPETENCE_CRITERIA } from "../src/data/seed/hrCompetenceCriteria";
import { HR_FEEDBACK_ON_FILE } from "../src/data/seed/hrFeedbackOnFile";
import { HR_RECORD_PAGES } from "../src/data/seed/hrModule";
import { ORIGINAL_FILES } from "../src/data/seed/originalFiles";
import { departmentOfDocument } from "../src/data/seed/departments";
import { feedbackRecordId, hrDirectorNumbers, hrFeedbackSheetsOnFile, HR_FEEDBACK_DOC } from "../src/data/hrSuppliedOnFile";
import { createDefaultData } from "../src/engine/recordDefaults";
import { masterRepository } from "../src/data/repositories/masterRepository";
import { computeReminders } from "../src/engine/reminders";
import { deleteRecordWithTrail } from "../src/engine/recordCrud";
import { nameKey } from "../src/engine/hrMaster";
import { isOverdue } from "../src/engine/recordLifecycle";
import { judge } from "../src/engine/latenessCore";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrSeeded();
ensureRecordsSeeded();

const sheets = (): RecordInstance[] => recordRepository.queryUnscoped({ documentId: HR_FEEDBACK_DOC, isDemo: false }).filter((r) => r.id.startsWith("hr-feedback-file-"));
const data = (r: RecordInstance) => r.data as LogSheetData;

test("F/HR/02 is a document of the HR module: its page, its department, its Word original, its 26 designations on file", () => {
  const doc = documentRepository.getByIdUnscoped("hr-competence-criteria")!;
  assert.equal(doc.formatNo, "F/HR/02");
  assert.equal(doc.schedule.type, "as-required");
  assert.equal(departmentOfDocument(doc.id, doc.formatNo), "HR");
  assert.ok(HR_RECORD_PAGES.some((p) => p.docId === doc.id && p.slug === "competence-criteria"));
  assert.equal(ORIGINAL_FILES[doc.id].kind, "docx");
  assert.equal(HR_COMPETENCE_CRITERIA.length, 26);
  const onFile = recordRepository.queryUnscoped({ documentId: doc.id, isDemo: false });
  assert.equal(onFile.length, 1);
  assert.equal(data(onFile[0]).header?.updatedAsOn, "01.09.2026");
  assert.equal(data(onFile[0]).rows.length, 26);
  assert.equal(data(onFile[0]).rows[0].qualification, "Graduate in any discipline");
  assert.ok(String(data(onFile[0]).rows[3].requirements).includes("\n"), "a cell's separate requirements stay on their own lines");
  assert.equal(data(onFile[0]).rows[25].parameter, "Supervisor (Corrugation)");
  assert.ok(getLogSheetLayout(doc.id));
  // A new revision starts from the company's lines.
  const fresh = createDefaultData(doc, "2026-12-01", masterRepository.get()) as LogSheetData;
  assert.equal(fresh.rows.length, 26);
  assert.equal(fresh.rows[14].parameter, "Machine Helper");
  assert.equal(fresh.rows[14].qualification, "NA");
});

test("the 38 F/HR/12 sheets: added once, In Progress, Evaluated By empty, every line as the paper has it", () => {
  assert.equal(HR_FEEDBACK_ON_FILE.length, 38);
  assert.equal(hrFeedbackSheetsOnFile().length, 38);
  assert.equal(hrFeedbackSheetsOnFile().length, 0, "run again it adds nothing");
  const all = sheets();
  assert.equal(all.length, 38);
  assert.equal(all.reduce((n, r) => n + data(r).rows.length, 0), 2012);
  for (const r of all) {
    assert.equal(r.status, "In Progress");
    assert.ok(!r.submittedAt && !r.verifiedAt, "nobody's signature is invented");
    assert.equal(data(r).header?.evaluatedBy, "");
    assert.equal(data(r).header?.trainingDate, r.dueDate);
    assert.match(r.dueDate, /^20(24|25|26)-\d\d-\d\d$/);
    assert.ok(data(r).rows.every((l) => ["0", "1", "2", "3"].includes(String(l.rating))));
    assert.equal(r.history?.[0].action, "imported");
  }
  assert.equal(new Set(all.map((r) => r.periodKey)).size, 38);
});

test("the two corrections on the owner's word, each named in its sheet's history", () => {
  const house = sheets().find((r) => String(data(r).header?.topic).startsWith("Housekeeping"))!;
  assert.equal(house.dueDate, "2024-09-24");
  assert.match(String(house.history?.[0].note), /34\/09\/2024 entered as 24-09-2024/);
  const calibration = sheets().find((r) => String(data(r).header?.topic).startsWith("Testing Method"))!;
  assert.equal(data(calibration).rows.find((l) => l.name === "Gitaben Nyayi")?.rating, "3");
  assert.match(String(calibration.history?.[0].note), /rating 32 entered as 3/);
});

test("sheets dated before the plant went live raise no reminder", () => {
  settingsRepository.update({ liveStartDate: "2026-10-14" });
  const ids = new Set(sheets().map((r) => r.id));
  assert.ok(!computeReminders(false).some((x) => ids.has(x.recordId)));
});

test("an old sheet is never Overdue, and signing it years after its date makes nobody late", () => {
  const r = sheets()[0];
  assert.equal(r.filedFromPaper, true);
  assert.equal(isOverdue(r, "2026-11-21"), false);
  const doc = documentRepository.getByIdUnscoped(HR_FEEDBACK_DOC)!;
  assert.equal(judge({ ...r, status: "In Progress" }, doc, "2026-11-21").outcome, "notCounted");
  assert.equal(judge({ ...r, status: "Submitted", submittedAt: "2026-11-21T08:00:00.000Z", submittedBy: "HR" }, doc, "2026-11-21").outcome, "notCounted");
  // ...and any other open record past its date still is.
  assert.equal(isOverdue({ ...r, filedFromPaper: undefined }, "2026-11-21"), true);
});

test("a sheet somebody deleted is not put back", () => {
  const id = feedbackRecordId(HR_FEEDBACK_ON_FILE[0].key);
  deleteRecordWithTrail(recordRepository.getById(id)!, "Test", "entered twice");
  assert.equal(hrFeedbackSheetsOnFile().length, 0);
  assert.ok(!recordRepository.getById(id));
});

test("the three directors take their GP3 Nos. once; a number already written is left", () => {
  const person = (name: string) => hrMasterRepository.all().find((p) => nameKey(p.fullName) === nameKey(name))!;
  assert.equal(person("Shail Patel").gp3No, "");
  hrMasterRepository.update(person("Virat Rajgor").id, "gp3No", "X.9", "Test");
  assert.equal(hrDirectorNumbers(), 2);
  assert.equal(person("Shail Patel").gp3No, "DIR.001");
  assert.equal(person("Swarup Rajgor").gp3No, "DIR.002");
  assert.equal(person("Virat Rajgor").gp3No, "X.9", "a number somebody wrote stays");
  assert.equal(hrDirectorNumbers(), 0);
});
