// ONE EMPLOYEE FILED FROM HR MASTER DATA ONTO THE HR FORMATS (REQUIREMENTS
// §160): the sheet's line read once, a one-person form started in their name, a
// register given their line in its own date style, nothing written twice,
// nothing the sheet lacks made up, a verified register reopened for correction
// with the reason. Without a browser, against the seeded documents.
// Run: npm run test:unit -- hrMasterFile
import test from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureHrMasterSeeded, hrMasterRepository } from "../src/data/repositories/hrMasterRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { fileFromMaster, fileTargetStates } from "../src/engine/hrMasterFile";
import { registerOnFile } from "../src/engine/hrJoiner";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrMasterSeeded();

const OPTS = { actorName: "HR Test", isDemo: false };

const person = hrMasterRepository.add(
  { gp3No: "9901", joiningDate: "2026-02-16", fullName: "Filed Fromsheet", department: "Stores", designation: "Assistant", dateOfBirth: "" },
  "HR Test"
);

const headerOf = (id: string) => (recordRepository.getById(id) as RecordInstance<LogSheetData>).data.header ?? {};
const rowsOf = (id: string) => (recordRepository.getById(id) as RecordInstance<LogSheetData>).data.rows ?? [];

test("before anything is filed, every linked format is offered and none has the person", () => {
  const states = fileTargetStates(person, false);
  assert.equal(states.length, 10);
  for (const s of states) {
    assert.ok(documentRepository.getById(s.link.docId), s.link.formatNo);
    assert.equal(s.alreadyThere, false, `${s.link.formatNo} already has them`);
    assert.equal(s.severalLines, false);
  }
});

test("a one-person form is started in their name with the boxes it prints; a register gets their line in its own style; the GP3 No. is nowhere", () => {
  const outcomes = fileFromMaster(person, ["hr-induction-staff", "hr-mobile-authorization", "hr-pre-employment-health"], OPTS);
  assert.deepEqual(
    outcomes.map((o) => [o.formatNo, o.result]),
    [
      ["F/HR/04", "started"],
      ["F/HR/05", "started"],
      ["F/HR/13", "added"],
    ],
    "filed in the map's order, whatever order they were ticked in"
  );
  const [healthOut, staffOut, mobileOut] = outcomes;
  const staff = headerOf(staffOut.recordId!);
  assert.equal(staff.name, "Filed Fromsheet");
  assert.equal(staff.deptProcess, "Stores");
  assert.equal(staff.designation, "Assistant");
  assert.equal(staff.dateOfJoining, "2026-02-16");
  assert.deepEqual(staffOut.written, ["Name", "Department / Process", "Designation", "Date of Joining"]);

  const line = rowsOf(mobileOut.recordId!).find((r) => r.name === "Filed Fromsheet");
  assert.ok(line, "F/HR/13 has no line for them");
  assert.equal(line.deptDesignation, "Assistant - Stores");
  assert.equal(rowsOf(mobileOut.recordId!).filter((r) => r.name === "Filed Fromsheet").length, 1);

  const health = headerOf(healthOut.recordId!);
  assert.equal(health.deptDesignation, "Stores - Assistant");
  assert.equal(health.dateOfBirth ?? "", "", "no date of birth on the sheet, so none on the form");
  assert.ok(!JSON.stringify([staff, line, health]).includes("9901"), "the GP3 No. is how a person is found, never a box");
  for (const o of outcomes) {
    const record = recordRepository.getById(o.recordId!)!;
    assert.ok(record.history.some((h) => (h.note ?? "").includes("Filed from HR Master Data: Filed Fromsheet")), `${o.formatNo}: no history line`);
  }
});

test("filed again, nothing is written twice; a box rubbed out is filled back as a blank, and only that box", () => {
  const again = fileFromMaster(person, ["hr-induction-staff", "hr-mobile-authorization"], OPTS);
  assert.deepEqual(
    again.map((o) => o.result),
    ["already-there", "already-there"]
  );
  const states = fileTargetStates(person, false);
  assert.equal(states.find((s) => s.link.docId === "hr-induction-staff")?.alreadyThere, true);
  assert.equal(states.find((s) => s.link.docId === "hr-mobile-authorization")?.blanks, 0);

  const register = registerOnFile("hr-mobile-authorization", false)!;
  const rows = register.data.rows.map((r) => (r.name === "Filed Fromsheet" ? { ...r, deptDesignation: "", signature: "their mark" } : r));
  recordRepository.upsert({ ...register, data: { ...register.data, rows } } as RecordInstance);
  const [filled] = fileFromMaster(person, ["hr-mobile-authorization"], OPTS);
  assert.equal(filled.result, "filled");
  assert.deepEqual(filled.written, ["Department & Designation"]);
  const line = rowsOf(filled.recordId!).find((r) => r.name === "Filed Fromsheet")!;
  assert.equal(line.deptDesignation, "Assistant - Stores");
  assert.equal(line.signature, "their mark", "what is written stays");
});

test("a verified register is reopened for correction with the reason, then takes the line", () => {
  let register = registerOnFile("hr-training-needs", false);
  if (!register) {
    fileFromMaster({ ...person, id: "hrm-other", fullName: "Someone Else", gp3No: "" }, ["hr-training-needs"], OPTS);
    register = registerOnFile("hr-training-needs", false)!;
  }
  // Verified as it stands: what is tested is the reopening, not the register's own checks.
  recordRepository.upsert({ ...register, status: "Verified" } as RecordInstance);
  const state = fileTargetStates(person, false).find((s) => s.link.docId === "hr-training-needs")!;
  assert.equal(state.willReopen, true);
  assert.equal(state.alreadyThere, false);
  const [outcome] = fileFromMaster(person, ["hr-training-needs"], OPTS);
  assert.equal(outcome.result, "added");
  assert.equal(outcome.reopened, true);
  const record = recordRepository.getById(outcome.recordId!)!;
  assert.ok(rowsOf(record.id).some((r) => r.name === "Filed Fromsheet" && r.designation === "Assistant"));
  assert.ok(record.history.some((h) => (h.note ?? "").includes("line added; submit and verify it again")), JSON.stringify(record.history.slice(-3)));
});
