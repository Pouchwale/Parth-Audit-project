// HR MASTER DATA → THE HR FORMATS (REQUIREMENTS §53, §159). The six columns of
// the employee master sheet reach ten F/HR formats through one map,
// HR_MASTER_LINKS. If a box of that map is not a box of the format, the fetch
// silently writes nothing — so every key is proved here against the format's
// own layout, without a browser. And what the sheet does NOT have for a person
// is named to HR, never made up: a blank Date of Birth stays blank on F/HR/04
// and the message says so.
// Run: npm run test:unit -- hrMasterLinks
import test from "node:test";
import assert from "node:assert/strict";
import type { HrMasterPerson } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureHrMasterSeeded, hrMasterRepository } from "../src/data/repositories/hrMasterRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { HR_MASTER_COLUMNS, HR_MASTER_LINKS, hrMasterLinkFor, linkedValue, missingColumns, missingText, personFill } from "../src/engine/hrMaster";
import { proposeMasterFill } from "../src/engine/hrMasterAssistant";

ensureDocumentsSeeded();
ensureHrMasterSeeded();

const person = (over: Partial<HrMasterPerson>): HrMasterPerson => ({
  id: "hrm-test",
  gp3No: "1024",
  joiningDate: "2014-04-01",
  fullName: "Sandeep Parekh",
  department: "HR & Admin",
  designation: "Manager",
  dateOfBirth: "1985-03-12",
  updatedAt: "",
  updatedBy: "test",
  ...over,
});

test("the sheet has exactly the six columns HR keeps, in HR's order", () => {
  assert.deepEqual(
    HR_MASTER_COLUMNS.map((c) => c.label),
    ["GP3 No.", "Joining Date", "Full Name", "Department", "Designation/Position", "Date of Birth"]
  );
});

test("every HR format in the map is a seeded document whose layout has every box the map writes to", () => {
  assert.equal(HR_MASTER_LINKS.length, 10);
  for (const link of HR_MASTER_LINKS) {
    const doc = documentRepository.getById(link.docId);
    assert.ok(doc, `${link.formatNo}: ${link.docId} is not a document`);
    assert.equal(doc.formatNo, link.formatNo, `${link.docId} is ${doc.formatNo}, the map says ${link.formatNo}`);
    const layout = getLogSheetLayout(link.docId);
    assert.ok(layout, `${link.formatNo} has no log-sheet layout`);
    const boxes = link.where === "header" ? [...layout.headerFields, ...(layout.footerFields ?? [])] : layout.columns;
    const keys = new Set(boxes.map((b) => b.key));
    for (const f of link.fields) assert.ok(keys.has(f.key), `${link.formatNo} has no box "${f.key}" among its ${link.where === "header" ? "header fields" : "columns"}`);
    assert.ok(
      link.fields.some((f) => f.key === link.nameField && f.from === "fullName"),
      `${link.formatNo}: the name box ${link.nameField} must be filled from Full Name`
    );
    // A date written in a register's own style (01.04.2014) goes into a text box; an ISO date into a date box.
    for (const f of link.fields) {
      if (f.from !== "joiningDate" && f.from !== "dateOfBirth") continue;
      const box = boxes.find((b) => b.key === f.key);
      assert.ok(box);
      const style = f.style ?? "iso";
      if (style === "iso") assert.equal(box.type, "date", `${link.formatNo} ${f.key}: an ISO date needs a date box`);
      else assert.equal(box.type, "text", `${link.formatNo} ${f.key}: a ${style} date needs a text box`);
    }
  }
});

test("each format takes only the columns it prints, in its own style", () => {
  const p = person({});
  const byFormat = Object.fromEntries(HR_MASTER_LINKS.map((l) => [l.formatNo, Object.fromEntries(l.fields.map((f) => [f.key, linkedValue(p, f)]))]));
  assert.deepEqual(byFormat["F/HR/01"], { name: "Sandeep Parekh", department: "HR & Admin", designation: "Manager", dateOfJoining: "01.04.2014" });
  assert.deepEqual(byFormat["F/HR/03"], { name: "Sandeep Parekh", designation: "Manager", dateOfJoining: "4/1/2014" });
  assert.deepEqual(byFormat["F/HR/04"], { name: "Sandeep Parekh", deptDesignation: "HR & Admin - Manager", dateOfBirth: "1985-03-12" });
  assert.deepEqual(byFormat["F/HR/05"], { name: "Sandeep Parekh", deptProcess: "HR & Admin", designation: "Manager", dateOfJoining: "2014-04-01" });
  assert.deepEqual(byFormat["F/HR/06"], { name: "Sandeep Parekh", joining: "Manager - HR & Admin", dateOfJoiningInduction: "01/04/2014" });
  assert.deepEqual(byFormat["F/HR/08"], { name: "Sandeep Parekh", designation: "Manager" });
  assert.deepEqual(byFormat["F/HR/11"], { traineeName: "Sandeep Parekh", department: "HR & Admin", designation: "Manager" });
  assert.deepEqual(byFormat["F/HR/12"], { name: "Sandeep Parekh" });
  assert.deepEqual(byFormat["F/HR/13"], { name: "Sandeep Parekh", deptDesignation: "Manager - HR & Admin" });
  assert.deepEqual(byFormat["F/HR/20"], { employeeName: "Sandeep Parekh", department: "HR & Admin", designation: "Manager" });
  // No format prints the GP3 No.: it is how a person is looked up, not a box.
  for (const link of HR_MASTER_LINKS) assert.ok(!link.fields.some((f) => f.from === "gp3No"), `${link.formatNo} writes the GP3 No.`);
});

test("a column blank on the sheet is named per format and left blank on the form — never made up (§159)", () => {
  const noDob = person({ dateOfBirth: "" });
  const health = hrMasterLinkFor("hr-pre-employment-health")!;
  const staff = hrMasterLinkFor("hr-induction-staff")!;
  assert.deepEqual(missingColumns(health, noDob), ["dateOfBirth"]);
  assert.deepEqual(missingColumns(staff, noDob), [], "F/HR/05 prints no Date of Birth, so none is missing there");
  const fill = personFill(health, noDob, {});
  assert.deepEqual(fill.fills.map((f) => f.key), ["name", "deptDesignation"]);
  assert.deepEqual(fill.missing, ["dateOfBirth"]);
  assert.equal(missingText(noDob, fill.missing), " HR Master Data has no Date of Birth for Sandeep Parekh — add it on the sheet.");
  assert.equal(missingText(noDob, []), "");

  // A combined box names whichever half is blank; a line with nothing but a name names every column the format asks for.
  const noDept = person({ department: "" });
  assert.deepEqual(missingColumns(health, noDept), ["department"]);
  assert.equal(linkedValue(noDept, health.fields.find((f) => f.key === "deptDesignation")!), "Manager");
  const bare = person({ joiningDate: "", department: "", designation: "", dateOfBirth: "" });
  assert.deepEqual(missingColumns(hrMasterLinkFor("hr-competence")!, bare), ["department", "designation", "joiningDate"]);
  assert.equal(missingText(bare, missingColumns(staff, bare)), " HR Master Data has no Department, Designation/Position or Joining Date for Sandeep Parekh — add them on the sheet.");
});

test("Mitra's proposal carries what is missing, so she says it before asking 'Fill these in?'", () => {
  const health = hrMasterLinkFor("hr-pre-employment-health")!;
  const layout = getLogSheetLayout("hr-pre-employment-health")!;
  // Every seeded line has a blank Date of Birth: no supplied document has them (§53).
  const seeded = hrMasterRepository.all().find((p) => !p.dateOfBirth && p.fullName === "Shail Patel");
  assert.ok(seeded);
  const found = proposeMasterFill(health, layout, { header: {}, rows: [] }, "Shail Patel");
  assert.equal(found.kind, "proposal");
  if (found.kind !== "proposal") return;
  assert.deepEqual(found.proposal.missing, ["dateOfBirth"]);
  assert.equal(found.proposal.next.header?.dateOfBirth ?? "", "", "no date of birth is invented");
  assert.equal(found.proposal.next.header?.name, "Shail Patel");
});
