// A PERSON ON HR MASTER DATA, FILED ON THE FORMATS THEIR ROLE CALLS FOR (REQUIREMENTS §53, 2-Nov-2026;
// engine/hrMasterFiling.ts). The role from the Designation/Position; the formats for it; each line and record written
// through the one fetch map, in the register's own date style, with the sheet's mark on it; nobody filed twice; two
// people of one name told apart by the mark and never guessed; a submitted register reopened with the reason; everyone
// on the sheet counted before and after.
// Run: npm run test:unit -- hrMasterFiling
import test from "node:test";
import assert from "node:assert/strict";
import type { HrMasterPerson, LogSheetData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { hrMasterRepository } from "../src/data/repositories/hrMasterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { createRecordForDocument } from "../src/engine/recordCrud";
import { isEditableStatus } from "../src/engine/recordLifecycle";
import { registerOnFile } from "../src/engine/hrJoiner";
import { HR_MASTER_TAG } from "../src/engine/hrMaster";
import { lineWords, logRowsRule } from "../src/engine/recordLines";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import {
  audienceOf,
  defaultChoice,
  fileEveryone,
  filePerson,
  formatsForRole,
  placementsFor,
  planEveryone,
  roleMismatch,
  roleMismatchWords,
  roleOf,
} from "../src/engine/hrMasterFiling";

ensureDocumentsSeeded();
ensureMasterSeeded();
// The sheet as set up from the registers holds 115 people (an Anil Raval among them); these tests want a sheet of their own.
for (const p of hrMasterRepository.all()) hrMasterRepository.remove(p.id);

const ACTOR = "Vinay Bhojak";
const opts = { actorName: ACTOR, isDemo: false };

type Values = Partial<Pick<HrMasterPerson, "gp3No" | "joiningDate" | "fullName" | "department" | "designation" | "dateOfBirth">>;
const add = (values: Values): HrMasterPerson => hrMasterRepository.add(values, ACTOR);
const fresh = (id: string): HrMasterPerson => hrMasterRepository.get(id)!;

const records = (docId: string) => recordRepository.query({ documentId: docId, isDemo: false }) as RecordInstance<LogSheetData>[];
const rowsOf = (docId: string) => records(docId).flatMap((r) => r.data?.rows ?? []);
const named = (docId: string, name: string) => rowsOf(docId).filter((r) => String(r.name ?? "").trim() === name);
const recordOf = (docId: string, name: string) => records(docId).find((r) => r.data?.header?.name === name);

test("the role comes from the designation, and each format's audience from its own title", () => {
  assert.equal(roleOf({ designation: "Manager" }), "staff");
  assert.equal(roleOf({ designation: "OPERATOR" }), "operator");
  assert.equal(roleOf({ designation: "Helper" }), "operator");
  assert.equal(roleOf({ designation: "" }), "staff", "no designation written: staff, and the dialog says so");
  // F/HR/03 writes each operator's PROCESS where a designation would go; a position word wins over a process word.
  for (const process of ["Printing", "Slitting", "Punching", "Pouching", "Lamination", "Sheet Cutting", "Reel to Sheet", "Post Press", "Sleeve Gluing", "Corrugation", "Pasting"]) {
    assert.equal(roleOf({ designation: process }), "operator", process);
  }
  for (const position of ["Manager-Pouch", "Lab Executive", "Supervisor", "HOD", "Plant Head", "Assi", "ASSI.", "EXUCUTIVE", "Executive Assistance", "Sales Coordinator", "TELE CALLER", "Production Planning", "Manager - Dispatch", "Graphic Designer"]) {
    assert.equal(roleOf({ designation: position }), "staff", position);
  }
  // A line set up from the operators' registers alone, with a word that says nothing ("QC"): an operator's.
  assert.equal(roleOf({ designation: "QC", sources: ["F/HR/03 line 7"] }), "operator");
  assert.equal(roleOf({ designation: "QC", sources: ["F/HR/01 line 3", "F/HR/03 line 7"] }), "staff");
  assert.equal(roleOf({ designation: "QC" }), "staff");
  assert.deepEqual(formatsForRole("staff"), ["hr-competence", "hr-induction-staff", "hr-training-needs", "hr-pre-employment-health"]);
  assert.deepEqual(formatsForRole("operator"), ["hr-skill-matrix", "hr-induction-operators", "hr-training-needs"], "no health declaration for a worker or helper");
  assert.equal(audienceOf("hr-skill-matrix"), "operator");
  assert.equal(audienceOf("hr-pre-employment-health"), "staff", "F/HR/04 is the staff's: supervisors, HODs, executives, assistants, managers");
  assert.equal(audienceOf("hr-training-needs"), undefined, "F/HR/08 takes everyone");
  assert.equal(roleMismatch("hr-skill-matrix", { designation: "Manager" }), true);
  assert.equal(roleMismatch("hr-skill-matrix", { designation: "Operator" }), false);
  assert.equal(roleMismatch("hr-training-needs", { designation: "Manager" }), false);
  const sandeep = add({ fullName: "Sandeep Parekh", designation: "Manager", department: "HR & Admin" });
  assert.equal(roleMismatchWords("hr-skill-matrix", "F/HR/03", sandeep), "Sandeep Parekh is a Manager (staff); F/HR/03 is kept for operator / worker.");
  assert.equal(roleMismatchWords("hr-competence", "F/HR/01", sandeep), "");
  assert.equal(roleMismatchWords("hr-pre-employment-health", "F/HR/04", { ...sandeep, fullName: "Sunny Mahesh Singh", designation: "OPERATOR" }), "Sunny Mahesh Singh is an OPERATOR (operator / worker); F/HR/04 is kept for staff.");
  hrMasterRepository.remove(sandeep.id);
});

test("a staff member is filed on F/HR/01, 05, 08 and 04 — each line and record from the sheet, in the register's own date style — and never twice", () => {
  const person = add({ gp3No: "0101", joiningDate: "2024-07-05", fullName: "Sandeep Parekh", department: "HR & Admin", designation: "Manager", dateOfBirth: "1990-01-15" });
  const before = placementsFor(person, hrMasterRepository.all(), false);
  assert.deepEqual(
    before.map((p) => [p.target.docId, p.byRole, p.mismatch, p.standing.kind]),
    [
      ["hr-competence", true, false, "add"],
      ["hr-skill-matrix", false, true, "add"],
      ["hr-training-needs", true, false, "add"],
      ["hr-induction-operators", false, true, "add"],
      ["hr-mobile-authorization", false, false, "add"],
      ["hr-induction-staff", true, false, "start"],
      ["hr-pre-employment-health", true, false, "start"],
    ]
  );
  assert.deepEqual(defaultChoice(before), ["hr-competence", "hr-training-needs", "hr-induction-staff", "hr-pre-employment-health"]);

  const outcomes = filePerson(person, defaultChoice(before), opts);
  assert.deepEqual(
    outcomes.map((o) => [o.docId, o.result, o.reopened]),
    [
      ["hr-competence", "added", false],
      ["hr-training-needs", "added", false],
      ["hr-induction-staff", "started", false],
      ["hr-pre-employment-health", "started", false],
    ]
  );
  const competence = named("hr-competence", "Sandeep Parekh");
  assert.equal(competence.length, 1);
  assert.equal(competence[0].department, "HR & Admin");
  assert.equal(competence[0].designation, "Manager");
  assert.equal(competence[0].dateOfJoining, "05-07-2024", "F/HR/01 takes the date as the app writes one, dd-mm-yyyy (REQUIREMENTS §171)");
  assert.equal(competence[0].eduRequired, "", "what the sheet does not have stays blank for HR");
  assert.equal(competence[0][HR_MASTER_TAG], "0101", "the sheet's mark on the line");
  const tni = named("hr-training-needs", "Sandeep Parekh");
  assert.equal(tni.length, 1);
  assert.equal(tni[0].designation, "Manager");
  const induction = recordOf("hr-induction-staff", "Sandeep Parekh");
  assert.ok(induction, "a record of their own on F/HR/05");
  assert.equal(induction!.data.header.deptProcess, "HR & Admin");
  assert.equal(induction!.data.header.designation, "Manager");
  assert.equal(induction!.data.header.dateOfJoining, "2024-07-05");
  assert.equal(induction!.data.header[HR_MASTER_TAG], "0101");
  assert.ok(isEditableStatus(induction!.status), "started as a draft, for HR to finish");
  const health = recordOf("hr-pre-employment-health", "Sandeep Parekh");
  assert.ok(health, "a record of their own on F/HR/04");
  assert.equal(health!.data.header.deptDesignation, "HR & Admin - Manager", "department first, as F/HR/04's specimen reads");
  assert.equal(health!.data.header.sex, "Male", "from the name (2-Nov-2026)");
  assert.equal(health!.data.header.dateOfBirth, "1990-01-15");
  assert.equal(health!.data.header.signDate, "2024-07-05", "the Date beside the signature: the joining date");
  assert.ok(health!.data.rows.every((r) => r.answer === "No"), "every question starts at No");
  assert.equal(named("hr-skill-matrix", "Sandeep Parekh").length, 0, "not on the operators' matrix");
  // The mark is not a box: the history's words of the line leave it out.
  assert.ok(!lineWords(logRowsRule(getLogSheetLayout("hr-competence")!), competence[0]).includes("0101"), lineWords(logRowsRule(getLogSheetLayout("hr-competence")!), competence[0]));

  // Filed again: already there, everywhere, and nothing written twice.
  const again = filePerson(person, defaultChoice(before), opts);
  assert.deepEqual(
    again.map((o) => [o.docId, o.result, o.line ?? null]),
    [
      ["hr-competence", "already", 1],
      ["hr-training-needs", "already", 1],
      ["hr-induction-staff", "already", null],
      ["hr-pre-employment-health", "already", null],
    ]
  );
  assert.equal(named("hr-competence", "Sandeep Parekh").length, 1);
  assert.equal(records("hr-induction-staff").filter((r) => r.data?.header?.name === "Sandeep Parekh").length, 1);
  const after = placementsFor(person, hrMasterRepository.all(), false);
  assert.deepEqual(defaultChoice(after), [], "nothing left to tick");
  assert.equal(after.find((p) => p.target.docId === "hr-competence")!.standing.kind, "already");
});

test("an operator is filed on F/HR/03, 06, 08 and 04, with the matrix's month-first and the induction's day-first dates", () => {
  const person = add({ gp3No: "0202", joiningDate: "2025-06-01", fullName: "Azaz Bharach", department: "POUCH", designation: "OPERATOR", dateOfBirth: "" });
  const placements = placementsFor(person, hrMasterRepository.all(), false);
  assert.deepEqual(defaultChoice(placements), ["hr-skill-matrix", "hr-training-needs", "hr-induction-operators"], "in the order the formats are offered; no F/HR/04 for an operator");
  assert.equal(placements.find((p) => p.target.docId === "hr-competence")!.mismatch, true, "F/HR/01 is the staff register");
  assert.equal(placements.find((p) => p.target.docId === "hr-pre-employment-health")!.mismatch, true, "F/HR/04 is the staff's declaration");
  const outcomes = filePerson(person, defaultChoice(placements), opts);
  assert.deepEqual(outcomes.map((o) => o.result), ["added", "added", "added"]);
  const matrix = named("hr-skill-matrix", "Azaz Bharach");
  assert.equal(matrix.length, 1);
  assert.equal(matrix[0].designation, "OPERATOR");
  assert.equal(matrix[0].dateOfJoining, "01-06-2025", "F/HR/03 too (its paper's m/d/yyyy before §171)");
  const induction = named("hr-induction-operators", "Azaz Bharach");
  assert.equal(induction.length, 1);
  assert.equal(induction[0].joining, "OPERATOR - POUCH", "designation first, as F/HR/06's lines read");
  assert.equal(induction[0].dateOfJoiningInduction, "01-06-2025", "F/HR/06 too (its paper's dd/mm/yyyy before §171)");
  assert.equal(recordOf("hr-pre-employment-health", "Azaz Bharach"), undefined, "a worker is not given the staff's health declaration");
  // Asked for all the same, it is written as the sheet has it, the date of birth blank where the sheet has none.
  const [asked] = filePerson(person, ["hr-pre-employment-health"], opts);
  assert.equal(asked.result, "started");
  const health = recordOf("hr-pre-employment-health", "Azaz Bharach");
  assert.equal(health!.data.header.deptDesignation, "POUCH - OPERATOR");
  assert.equal(String(health!.data.header.dateOfBirth ?? ""), "", "no date of birth on the sheet: the box stays blank");
  assert.equal(health!.data.header.signDate, "2025-06-01");
});

test("a person already on a register by a GP3 No. in the name box is found and left alone", () => {
  const person = add({ gp3No: "0303", joiningDate: "2023-01-10", fullName: "Sunny Mahesh Singh", department: "Printing", designation: "Supervisor" });
  const first = filePerson(person, ["hr-competence"], opts);
  assert.equal(first[0].result, "added");
  // A line written by hand with the number where the name goes, and no mark: still theirs.
  const register = records("hr-competence")[0];
  const rows = register.data.rows.map((r) => (r.name === "Sunny Mahesh Singh" ? { ...r, name: "0303", [HR_MASTER_TAG]: "" } : r));
  recordRepository.upsert({ ...register, data: { ...register.data, rows } });
  const byNumber = filePerson(person, ["hr-competence"], opts);
  assert.equal(byNumber[0].result, "already", "a GP3 No. in the name box is theirs");
  assert.equal(rowsOf("hr-competence").filter((r) => r.name === "0303" || r.name === "Sunny Mahesh Singh").length, 1);
});

test("two people of one name: no GP3 No. files neither; with GP3 Nos. each gets a line of his own, told apart by the mark; a line of that name written by hand stops both", () => {
  const a = add({ fullName: "Anil Raval", department: "Store", designation: "Assistant" });
  const b = add({ fullName: "Anil Raval", department: "Dispatch", designation: "Helper" });
  for (const p of placementsFor(a, hrMasterRepository.all(), false)) {
    assert.equal(p.standing.kind, "unclear", p.target.docId);
    assert.match(p.standing.kind === "unclear" ? p.standing.why : "", /2 people on the sheet are named Anil Raval, and this line has no GP3 No/);
  }
  assert.ok(filePerson(a, ["hr-competence", "hr-training-needs", "hr-induction-staff"], opts).every((o) => o.result === "unclear"));
  assert.equal(named("hr-competence", "Anil Raval").length, 0);
  assert.equal(named("hr-training-needs", "Anil Raval").length, 0);

  hrMasterRepository.update(a.id, "gp3No", "0401", ACTOR);
  hrMasterRepository.update(b.id, "gp3No", "0402", ACTOR);
  assert.equal(filePerson(fresh(a.id), ["hr-training-needs"], opts)[0].result, "added");
  assert.equal(filePerson(fresh(b.id), ["hr-training-needs"], opts)[0].result, "added", "the mark tells the first Anil's line from his");
  assert.equal(named("hr-training-needs", "Anil Raval").length, 2);
  assert.deepEqual(named("hr-training-needs", "Anil Raval").map((r) => r[HR_MASTER_TAG]), ["0401", "0402"]);
  // Lines 3 and 4: Sandeep and Azaz are lines 1 and 2 of F/HR/08.
  assert.deepEqual([filePerson(fresh(a.id), ["hr-training-needs"], opts)[0], filePerson(fresh(b.id), ["hr-training-needs"], opts)[0]].map((o) => [o.result, o.line]), [["already", 3], ["already", 4]]);
  assert.equal(named("hr-training-needs", "Anil Raval").length, 2, "still one line each");

  // A line of that name written by hand (no mark) on the skill matrix on file: nothing is guessed for either Anil.
  const matrix = registerOnFile("hr-skill-matrix", false)!;
  recordRepository.upsert({ ...matrix, data: { header: matrix.data.header, rows: [...matrix.data.rows, { id: "m-hand", name: "Anil Raval", designation: "Helper", dateOfJoining: "1/2/2024" }] } });
  const [stopped] = filePerson(fresh(b.id), ["hr-skill-matrix"], opts);
  assert.equal(stopped.result, "unclear");
  assert.match(stopped.why ?? "", /Line 2 of F\/HR\/03 is named Anil Raval, and 2 people on the sheet have that name/);
  assert.equal(named("hr-skill-matrix", "Anil Raval").length, 1);
});

test("a submitted register is reopened for correction with the reason, the line added, and the note in its history", () => {
  const doc = documentRepository.getById("hr-mobile-authorization")!;
  const started = createRecordForDocument(doc, { dateISO: "2026-11-02", isDemo: false }).record as RecordInstance<LogSheetData>;
  recordRepository.upsert({
    ...started,
    status: "Submitted",
    data: { header: started.data.header, rows: [{ id: "r1", name: "Prakash Modi", deptDesignation: "Manager - Printing", signature: "", dateOfAllowance: "01/10/2026", authorizedBy: "" }] },
  });
  const person = add({ gp3No: "0505", fullName: "Keyur Sathavara", department: "Design", designation: "Designer", joiningDate: "2020-02-28" });
  const [placement] = placementsFor(person, hrMasterRepository.all(), false).filter((p) => p.target.docId === "hr-mobile-authorization");
  assert.equal(placement.byRole, false, "a mobile is the PSTL's decision: never ticked by itself");
  assert.deepEqual(placement.standing, { kind: "add", willReopen: true, recordStatus: "Submitted" });
  const [outcome] = filePerson(person, ["hr-mobile-authorization"], opts);
  assert.equal(outcome.result, "added");
  assert.equal(outcome.reopened, true);
  assert.equal(outcome.line, 2);
  const register = recordRepository.getById(outcome.recordId!) as RecordInstance<LogSheetData>;
  assert.ok(isEditableStatus(register.status), "reopened, to be submitted and verified again");
  assert.equal(register.data.rows.length, 2);
  assert.equal(register.data.rows[1].deptDesignation, "Designer - Design");
  assert.ok((register.history ?? []).some((h) => /Filed from HR Master Data: Keyur Sathavara/.test(String(h.note ?? ""))), JSON.stringify(register.history));
});

test("everyone on the sheet: counted per format before, written once, and the sheet settled after", () => {
  // On the sheet now: Sandeep (staff, filed), Azaz (operator, filed), Sunny (staff, on F/HR/01 only), the two Anils
  // (staff and operator, on F/HR/08; the hand-written matrix line stops Anil the Helper there), Keyur (staff, F/HR/13 only).
  const people = hrMasterRepository.all();
  const plan = planEveryone(people, false);
  assert.equal(plan.people, 6);
  assert.deepEqual(plan.unclear, [], "every line has a name, and every Anil a GP3 No.");
  const byDoc = Object.fromEntries(plan.lines.map((l) => [l.docId, l]));
  assert.deepEqual([byDoc["hr-competence"].toAdd, byDoc["hr-competence"].already], [2, 2], "Anil (Store) and Keyur to add; Sandeep and Sunny there");
  assert.deepEqual([byDoc["hr-skill-matrix"].toAdd, byDoc["hr-skill-matrix"].already, byDoc["hr-skill-matrix"].unclear], [0, 1, 1], "Azaz there; Anil the Helper stopped by the hand-written line");
  assert.deepEqual([byDoc["hr-training-needs"].toAdd, byDoc["hr-training-needs"].already], [2, 4], "Sunny and Keyur to add");
  assert.deepEqual([byDoc["hr-induction-staff"].toAdd, byDoc["hr-induction-staff"].already], [3, 1]);
  assert.deepEqual([byDoc["hr-induction-operators"].toAdd, byDoc["hr-induction-operators"].already], [1, 1]);
  assert.deepEqual([byDoc["hr-pre-employment-health"].toAdd, byDoc["hr-pre-employment-health"].already], [3, 1], "the staff only: Sunny, Anil (Store) and Keyur to add; Sandeep there");
  assert.equal(plan.settled, 2, "Sandeep and Azaz");

  const outcome = fileEveryone(people, opts);
  assert.equal(outcome.filed.length, 6);
  const written = Object.fromEntries(outcome.written.map((l) => [l.docId, l]));
  for (const docId of Object.keys(byDoc)) assert.equal(written[docId].toAdd, byDoc[docId].toAdd, `${docId}: written what was counted`);
  // Nobody has a second line anywhere.
  for (const docId of ["hr-competence", "hr-skill-matrix", "hr-training-needs", "hr-induction-operators"]) {
    const counts = new Map<string, number>();
    for (const n of rowsOf(docId).map((r) => String(r.name ?? "")).filter(Boolean)) counts.set(n, (counts.get(n) ?? 0) + 1);
    for (const [n, c] of counts) assert.equal(c, n === "Anil Raval" && docId === "hr-training-needs" ? 2 : 1, `${n} on ${docId}`);
  }
  const settled = planEveryone(hrMasterRepository.all(), false);
  assert.equal(settled.lines.reduce((n, l) => n + l.toAdd, 0), 0, "nothing left to write");
  assert.equal(settled.settled, 5, "everyone but Anil the Helper, whose matrix line waits for HR");
});
