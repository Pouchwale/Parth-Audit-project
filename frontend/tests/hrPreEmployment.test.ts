// F/HR/04 PRE-EMPLOYMENT MEDICAL HEALTH DECLARATION AS THE OWNER ASKED FOR IT (2-Nov-2026): every answer starts at
// "No"; the Name, Department & Designation and Date of Birth come from HR Master Data; the Sex box takes Male or
// Female from the name — only when the name says so for sure — whether the person is fetched from the sheet, filed
// from it, or typed by hand (engine/sexFromName.ts, engine/hrMaster.ts, data/seed/hrLayouts.ts).
// Run: npm run test:unit -- hrPreEmployment
import test from "node:test";
import assert from "node:assert/strict";
import type { HrMasterPerson, LogSheetData } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { createDefaultData } from "../src/engine/recordDefaults";
import { hrMasterLinkFor, lineForPerson, linkedFieldLabel, personFill } from "../src/engine/hrMaster";
import { sexFromName } from "../src/engine/sexFromName";

ensureDocumentsSeeded();
ensureMasterSeeded();

const person = (fullName: string, more: Partial<HrMasterPerson> = {}): HrMasterPerson => ({
  id: `p-${fullName}`,
  gp3No: "0101",
  joiningDate: "2024-07-05",
  fullName,
  department: "HR & Admin",
  subDepartment: "",
  machine: "",
  designation: "Manager",
  dateOfBirth: "1990-01-15",
  updatedAt: "",
  updatedBy: "",
  ...more,
});

test("the name says Male or Female when it is sure — the plant's own roster, titles and Gujarati suffixes — and nothing otherwise", () => {
  const male = ["Sandeep Parekh", "Vinay Bhojak", "Keyur Sathavara", "Azaz Bharach", "Anil Raval", "Sunny Mahesh Singh", "Vishnu Jadhav", "Ajay Sinh Vaghela", "Ankur Raval", "Bharat Ahir", "Dharmik Mistry", "Raghunath Mane", "Prakash Modi", "Shail Patel", "Swarup Rajgor", "Virat Rajgor", "Navin Prajapati", "Chandrakant Barot", "Bhavesh Nagarkar", "Samir Mansuri", "Chirag Parmar", "Parth Chauhan", "Akash Patel", "Nalin Darji", "Nikul Parmar", "Hasmukhbhai Raval", "Dinesh Patel", "Neelkumar Patel", "Mr. K. Shah", "Shri Jethalal Gada", "Rameshbhai", "Ajaysinh Zala"];
  const female = ["Kapila Barad", "Pooja Prajapati", "Jyoti Bind", "Niki Patel", "Fena Modi", "Diya Chawla", "Hansaben Patel", "Mrs. Shah", "Ms Priya", "Smt. Rekha Devi", "Kapilaben Barad", "Nehaben"];
  for (const name of male) assert.equal(sexFromName(name), "Male", name);
  for (const name of female) assert.equal(sexFromName(name), "Female", name);
  // Not sure: left for HR.
  for (const name of ["Kiran Patel", "Harsha Mehta", "Dr. Patel", "X", "", "0101", "Krishna", "Vishwa Shah"]) assert.equal(sexFromName(name), "", name || "(blank)");
});

test("a new F/HR/04 record starts with No against every question, the details blank, and only on that format", () => {
  const doc = documentRepository.getById("hr-pre-employment-health")!;
  const data = createDefaultData(doc, "2026-11-02", masterRepository.get()) as LogSheetData;
  assert.equal(data.rows.length, 21, "the ten questions, question 06 over twelve lines");
  for (const row of data.rows) {
    assert.equal(row.answer, "No", String(row.parameter));
    assert.equal(row.details ?? "", "");
  }
  // The visitor's declaration, F/HR/14, is still blank: nothing is decided for a visitor (REQUIREMENTS §98).
  const visitor = createDefaultData(documentRepository.getById("hr-visitor-health")!, "2026-11-02", masterRepository.get()) as LogSheetData;
  assert.ok(visitor.rows.every((row) => !row.answer), "F/HR/14 blank");
  const layout = getLogSheetLayout("hr-pre-employment-health")!;
  assert.ok(layout.rowMode.kind === "fixedRows" && layout.rowMode.rows.every((r) => r.answer === "No"));
});

test("fetching a person from the sheet onto F/HR/04 fills Name, Department & Designation, Sex from the name and Date of Birth", () => {
  const link = hrMasterLinkFor("hr-pre-employment-health")!;
  assert.deepEqual(
    link.fields.map((f) => linkedFieldLabel(link.docId, f)),
    ["Name ← Full Name", "Department & Designation ← Department - Designation", "Sex ← from the Full Name", "Date of Birth", "Date ← Joining Date"]
  );
  const { fills, conflicts } = personFill(link, person("Kapila Barad", { department: "Quality Control", designation: "Executive", dateOfBirth: "1992-03-09" }), {});
  assert.deepEqual(
    fills.map((f) => [f.key, f.after]),
    [
      ["name", "Kapila Barad"],
      ["deptDesignation", "Quality Control - Executive"],
      ["sex", "Female"],
      ["dateOfBirth", "1992-03-09"],
      ["signDate", "2024-07-05"],
    ],
    "the Date beside the signature is the day they joined"
  );
  assert.deepEqual(conflicts, []);
  // A name that does not say: the Sex box is not touched, and the rest still comes.
  const unsure = personFill(link, person("Kiran Patel"), {});
  assert.deepEqual(
    unsure.fills.map((f) => f.key),
    ["name", "deptDesignation", "dateOfBirth", "signDate"]
  );
  // A Sex already written by HR is never replaced without asking.
  const written = personFill(link, person("Sandeep Parekh"), { name: "Sandeep Parekh", sex: "Female" });
  assert.deepEqual(written.conflicts.map((c) => [c.key, c.before, c.after]), [["sex", "Female", "Male"]]);
  assert.ok(!written.fills.some((f) => f.key === "sex"));
  // The sheet's line for a register is unchanged by it: F/HR/01 has no Sex box.
  const competence = hrMasterLinkFor("hr-competence")!;
  const layout = getLogSheetLayout("hr-competence")!;
  const line = lineForPerson(competence, person("Kapila Barad"), { id: "r1", ...Object.fromEntries(layout.columns.map((c) => [c.key, ""])) });
  assert.equal("sex" in line, false);
});
