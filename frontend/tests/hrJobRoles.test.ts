// F/HR/07: A ROLE CHOSEN FILLS ITS SHEET, FOR EVERY ROLE AND DESIGNATION (REQUIREMENTS §307). Run: npm run test:unit -- hrJobRoles
import test from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData } from "../src/types";
import { ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureHrMasterSeeded, hrMasterRepository } from "../src/data/repositories/hrMasterRepository";
import { DRAFT_JOB_ROLES } from "../src/data/seed/hrJobRoles";
import { SEED_HR_JOB_RESPONSIBILITIES } from "../src/data/seed/hrRecords";
import { JOB_ROLES, WRITTEN_JOB_ROLES, isDraftJobRole, jobRoleNamed, jobRoleOfPerson, jobSheetOfRole, sameJobRole, withJobRole } from "../src/engine/jobRoles";

ensureDocumentsSeeded();
ensureHrMasterSeeded();

const blank = (position = ""): LogSheetData => ({ header: { position, reportsTo: "", delegationAuthorities: "", delegationResponsibilities: "", minQualification: "" }, rows: [{ id: "r1", responsibility: "" }] });
const dutiesOf = (d: LogSheetData) => d.rows.map((r) => r.responsibility);

test("the eight positions of the company's files are used word for word, and are not drafts", () => {
  assert.equal(WRITTEN_JOB_ROLES.length, 8);
  for (const sheet of SEED_HR_JOB_RESPONSIBILITIES) {
    const d = sheet.data as LogSheetData;
    const role = jobRoleNamed(d.header.position)!;
    assert.deepEqual(role.duties, d.rows.map((r) => r.responsibility));
    assert.equal(role.reportsTo, d.header.reportsTo);
    assert.ok(!role.draft);
  }
});

test("every person on HR Master Data, of every designation, has a role with a description", () => {
  const people = hrMasterRepository.all();
  assert.ok(people.length > 400);
  const none = people.filter((p) => !jobRoleOfPerson(p)).map((p) => `${p.designation} / ${p.department}`);
  assert.deepEqual([...new Set(none)], []);
  assert.equal(jobRoleOfPerson({ designation: "Executive", department: "Lab" })?.title, "Executive-Lab");
  assert.equal(jobRoleOfPerson({ designation: "Coordinator", department: "Sales & Marketing" })?.title, "Sales Coordination");
  assert.equal(jobRoleOfPerson({ designation: "Manager", department: "Dispatch / Loading" })?.title, "Manager Dispatch & Logistics");
  assert.equal(jobRoleOfPerson({ designation: "Manager", department: "Pouching" })?.title, "Pouching Manager");
  assert.equal(jobRoleOfPerson({ designation: "Supervisor", department: "Label" })?.title, "Supervisor-Production");
  assert.equal(jobRoleOfPerson({ designation: "Helper", department: "Corrugation" })?.title, "Helper");
});

test("every role is whole: a title of its own, who it reports to, its delegation and its lines; and the roles it names exist", () => {
  const titles = JOB_ROLES.map((r) => r.title.toLowerCase());
  assert.equal(new Set(titles).size, titles.length);
  assert.equal(new Set(JOB_ROLES.map((r) => r.key)).size, JOB_ROLES.length);
  for (const r of DRAFT_JOB_ROLES) {
    assert.ok(r.draft && r.reportsTo && r.authorities && r.responsibilities, r.title);
    assert.ok(r.duties.length >= 4 && r.duties.length <= 10, r.title);
    assert.equal(new Set(r.duties).size, r.duties.length, r.title);
    if (r.reportsTo !== "Board of Directors") assert.ok(jobRoleNamed(r.reportsTo), `${r.title} reports to ${r.reportsTo}`);
    assert.ok(jobRoleNamed(r.authorities), `${r.title}: ${r.authorities}`);
    assert.ok(jobRoleNamed(r.responsibilities), `${r.title}: ${r.responsibilities}`);
  }
});

test("choosing a position fills the sheet; choosing another moves it on; what a person wrote stays", () => {
  const filled = withJobRole(blank(), blank("Executive-Hr"));
  assert.equal(filled.header.reportsTo, "Manager-Hr");
  assert.equal(filled.header.delegationAuthorities, "Manager-HR");
  assert.equal(filled.header.minQualification, "As Per Employees Competence Chart");
  assert.equal(filled.rows.length, 8);
  const moved = withJobRole(filled, { ...filled, header: { ...filled.header, position: "Supervisor-Stores" } });
  assert.equal(moved.header.reportsTo, "Manager-Stores & Purchase");
  assert.deepEqual(dutiesOf(moved), jobRoleNamed("Supervisor-Stores")!.duties);
  const own: LogSheetData = { ...filled, header: { ...filled.header, reportsTo: "Plant Head" }, rows: [{ id: "x", responsibility: "HR's own line" }] };
  const kept = withJobRole(own, { ...own, header: { ...own.header, position: "Operator" } });
  assert.equal(kept.header.reportsTo, "Plant Head");
  assert.deepEqual(dutiesOf(kept), ["HR's own line"]);
  const unknown = blank("Some New Role");
  assert.equal(withJobRole(blank(), unknown), unknown);
});

test("a role's new sheet holds its whole description, leaves the signature to the person, and a draft is known as one", () => {
  const role = jobRoleNamed("Supervisor-Stores")!;
  const carried: LogSheetData = { header: { position: "Executive-Lab", reportsTo: "Someone", employeeSignature: "A Person", signDate: "2026-01-01" }, rows: [{ id: "r1", responsibility: "" }] };
  const sheet = jobSheetOfRole(role, carried);
  assert.equal(sheet.header.position, "Supervisor-Stores");
  assert.equal(sheet.header.reportsTo, role.reportsTo);
  assert.equal(sheet.header.delegationAuthorities, role.authorities);
  assert.equal(sheet.header.minQualification, "As Per Employees Competence Chart");
  assert.equal(sheet.header.employeeSignature, "");
  assert.equal(sheet.header.signDate, "");
  assert.deepEqual(dutiesOf(sheet), role.duties);
  assert.equal(sheet.rows[0].id, "r1");
  assert.ok(isDraftJobRole("Supervisor-Stores"));
  assert.ok(!isDraftJobRole("Executive-Lab"));
  assert.ok(sameJobRole("Manager - Hr", "Manager-HR"));
  assert.ok(!sameJobRole("", ""));
});
