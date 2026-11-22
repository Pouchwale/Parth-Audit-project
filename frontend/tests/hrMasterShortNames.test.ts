// A SHORT NAME ON AN HR REGISTER AND HR MASTER DATA (REQUIREMENTS §291): offered for a person to confirm, never filled on a guess.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { HrMasterPerson, LogSheetData, LogSheetRow } from "../src/types";
import { fillBlanksFromMaster, HR_MASTER_TAG, hrMasterLinkFor, isShortNameOf, lineAgrees, lineOfPerson, likelyPeople, personNamed, withConfirmedPerson, withPersonNamed } from "../src/engine/hrMaster";
import { asAppDate } from "../src/engine/registerDates";

const person = (gp3No: string, fullName: string, department: string, designation: string, joiningDate = "2020-03-03"): HrMasterPerson => ({
  id: gp3No,
  gp3No,
  fullName,
  department,
  subDepartment: "",
  machine: "",
  designation,
  joiningDate,
  dateOfBirth: "",
  updatedAt: "",
  updatedBy: "",
});
const people = [
  person("GP3.1", "Meet Shaileshbhai Patel", "QC", "Lab Executive"),
  person("GP3.2", "Harsh J. Parmar", "QC", "Lab Executive"),
  person("GP3.3", "Harsh Rameshbhai Parmar", "Flexo", "Operator"),
  person("GP3.4", "Azaz Bharach", "Pouch", "Manager"),
  person("GP3.5", "Siddhrajsinh Vijaysinh Zala", "Store", "Helper"),
  person("GP3.6", "Vijay Bhemaji Raval", "Stores", "Supervisor"),
];
const needs = hrMasterLinkFor("hr-training-needs")!;
const sheet = (rows: Partial<LogSheetRow>[]): LogSheetData => ({ header: {}, rows: rows.map((r, i) => ({ id: `r${i}`, ...r })) as LogSheetRow[] });

test("a short name is recognised, with -bhai and the usual spellings, but a father's name in the middle is not a first name", () => {
  assert.deepEqual(likelyPeople("Meet Patel", people).map((p) => p.gp3No), ["GP3.1"]);
  assert.deepEqual(likelyPeople("Azazbhai Bharach", people).map((p) => p.gp3No), ["GP3.4"]);
  assert.deepEqual(likelyPeople("Vijay Rawal", people).map((p) => p.gp3No), ["GP3.6"]);
  assert.deepEqual(likelyPeople("Vijaysinh Zala", people), [], "his father's name, not his own");
  assert.deepEqual(likelyPeople("Harsh Parmar", people).map((p) => p.gp3No), ["GP3.2", "GP3.3"], "two people: both offered");
  assert.equal(personNamed("Meet Patel", people), null, "the exact look-up that feeds the sheet stays exact");
});

test("Fill blanks never writes a short name's details: it asks; an exact name still fills by itself", () => {
  const data = sheet([{ name: "Meet Patel", designation: "" }, { name: "Azaz Bharach", designation: "" }, { name: "Nobody Known", designation: "" }]);
  const out = fillBlanksFromMaster(needs, data, people);
  assert.equal(out.data.rows[0].designation, "", "not filled on a guess");
  assert.equal(out.data.rows[1].designation, "Manager");
  assert.deepEqual(out.toConfirm.map((c) => [c.index, c.name]), [[0, "Meet Patel"]]);
  assert.deepEqual(out.notOnSheet, ["Nobody Known"]);
});

test("confirmed: blank boxes filled, the name as written, the mark on it, and leaving the box does not undo it", () => {
  const row = { id: "r0", name: "Meet Patel", designation: "" } as LogSheetRow;
  const done = withConfirmedPerson(needs, people[0], row);
  assert.equal(done.name, "Meet Patel");
  assert.equal(done.designation, "Lab Executive");
  assert.equal(done[HR_MASTER_TAG], "GP3.1");
  assert.equal(withPersonNamed(needs, done, "Meet Patel", people), null, "the same name left in its box changes nothing");
  assert.equal(fillBlanksFromMaster(needs, sheet([done]), people).toConfirm.length, 0, "not asked again");
  const written = withConfirmedPerson(needs, people[0], { id: "r1", name: "Meet Patel", designation: "QC Lead" } as LogSheetRow);
  assert.equal(written.designation, "QC Lead", "what is written is never replaced");
});

test("a line whose role differs says so, and a picked person takes the short-named line instead of a second one", () => {
  assert.equal(lineAgrees(needs, people[5], { designation: "Operator - Store" }), "agrees");
  assert.equal(lineAgrees(needs, people[0], { designation: "Printing Machine Operator" }), "differs");
  assert.equal(lineAgrees(needs, people[0], { designation: "" }), "unknown");
  const rows = sheet([{ name: "Meet Patel" }]).rows;
  assert.deepEqual(lineOfPerson(needs, rows, people[0], people, true), { kind: "line", index: 0 });
  assert.deepEqual(lineOfPerson(needs, rows, people[0], people), { kind: "none" }, "automatic filing stays exact");
  assert.ok(isShortNameOf("Meet Patel", people[0]));
});

test("a date a spreadsheet kept as a day number is written as a date", () => {
  assert.equal(asAppDate("43893", "mdy"), "03-03-2020");
  assert.equal(asAppDate("45439", "mdy"), "27-05-2024");
  assert.equal(asAppDate("12345", "mdy"), "12345", "not a date of these years");
});
