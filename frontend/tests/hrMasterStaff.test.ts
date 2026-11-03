// THE PLANT'S STAFF SHEET ON HR MASTER DATA (REQUIREMENTS §169; the owner, 3-Nov-2026, with "Master Data Staff.xlsx":
// "I am sharing the master data with you, so add accordingly").
//   * the seed: every person of the staff sheet, in its eight columns (the two new ones, Sub Department and
//     Machine / Process Name, among them), under a stable id from the GP3 No.; the registers' people after them;
//   * a person both the sheet and the registers hold is one line, under the REGISTER line's id, with the register's
//     spellings as aliases and both sources noted; nobody is on the seed twice;
//   * a sheet already kept: a stored line's blank boxes take the staff sheet's word, by id or by name; nothing HR wrote
//     changes; a name already on the sheet is never added again; a line HR deleted stays deleted;
//   * the upload reads the staff sheet's own headings; F/HR/03 takes an operator's process from Sub Department; the
//     sheet's positions - Helper, Guard, Driver - count as workers.
// Run: npm run test:unit -- hrMasterStaff
import test from "node:test";
import assert from "node:assert/strict";
import type { HrMasterPerson } from "../src/types";
import { HR_MASTER_STAFF } from "../src/data/seed/hrMasterStaff";
import { hrMasterSeed, HR_MASTER_STAFF_BY, HR_MASTER_SEEDED_BY, staffId } from "../src/data/seed/hrMasterSeed";
import { ensureSeeded, hrMasterRepository } from "../src/data/repositories/hrMasterRepository";
import { blankHrMasterValues, headerColumns, HR_MASTER_COLUMNS, hrMasterLinkFor, nameKey } from "../src/engine/hrMaster";
import { categoryFor } from "../src/engine/hrJoiner";
import { roleOf } from "../src/engine/hrMasterFiling";
import { readJSON, storage, writeJSON } from "../src/data/storageAdapter";

// The sheet's store, through the app's own adapter (it namespaces its keys).
const KEY = "hrMasterData";

test("the staff sheet: 445 people in eight columns, every GP3 No. once, dates as YYYY-MM-DD, two birthdays the sheet could not write left blank with a note", () => {
  assert.equal(HR_MASTER_STAFF.length, 445);
  const numbers = HR_MASTER_STAFF.map((s) => s[0]);
  assert.equal(new Set(numbers).size, 445, "every GP3 No. once");
  assert.ok(numbers.every((n) => /^GP3\.\d+$/.test(n)), "GP3.001 ... as the sheet writes them");
  assert.ok(HR_MASTER_STAFF.every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s[1]) && s[2] && s[3] && s[6]), "a joining date, a name, a department and a position on every line");
  assert.equal(HR_MASTER_STAFF.filter((s) => s[7] === "").length, 3, "three birthdays unknown: one blank on the sheet, two not dates");
  assert.equal(HR_MASTER_STAFF.filter((s) => s[8]).length, 2, "...the two not dates noted for HR");
  assert.deepEqual(HR_MASTER_STAFF[0], ["GP3.001", "2008-05-13", "Karan Kalusinh Bariya", "Label", "Die Cutting", "Harmonium", "Operator", "1974-01-06", ""]);
  assert.deepEqual(HR_MASTER_COLUMNS.map((c) => c.key), ["gp3No", "joiningDate", "fullName", "department", "subDepartment", "machine", "designation", "dateOfBirth"]);
  assert.deepEqual(Object.keys(blankHrMasterValues()), ["gp3No", "joiningDate", "fullName", "department", "subDepartment", "machine", "designation", "dateOfBirth"]);
});

test("the seed: the staff first, each under a stable id, the registers' people after; a person on both is one line under the register's id, with aliases and both sources", () => {
  const seed = hrMasterSeed();
  assert.ok(seed.length >= 445, `${seed.length} people`);
  const keys = seed.map((p) => nameKey(p.fullName));
  assert.equal(new Set(keys).size, keys.length, "nobody on the seed twice");
  const karan = seed.find((p) => p.gp3No === "GP3.001")!;
  assert.ok(karan.id.startsWith("hrm-") && !karan.id.startsWith("hrm-staff-"), `Karan is on F/HR/03 too: the register line's id (${karan.id})`);
  assert.deepEqual([karan.fullName, karan.department, karan.subDepartment, karan.machine, karan.designation, karan.joiningDate, karan.dateOfBirth], ["Karan Kalusinh Bariya", "Label", "Die Cutting", "Harmonium", "Operator", "2008-05-13", "1974-01-06"]);
  assert.ok(karan.sources!.some((s) => s.startsWith("Master Data Staff.xlsx line 2")) && karan.sources!.some((s) => s.startsWith("F/HR/03")), karan.sources!.join(" | "));
  assert.equal(karan.updatedBy, HR_MASTER_STAFF_BY);
  const onlyStaff = seed.filter((p) => p.id.startsWith("hrm-staff-"));
  assert.ok(onlyStaff.length > 200, `${onlyStaff.length} people the registers never named, under ids from their GP3 No.`);
  assert.equal(staffId("GP3.001"), "hrm-staff-gp3-001");
  const fromRegistersOnly = seed.filter((p) => p.updatedBy === HR_MASTER_SEEDED_BY);
  assert.ok(fromRegistersOnly.every((p) => !p.gp3No && p.subDepartment === "" && p.machine === ""), "the registers' people not on the sheet, as before, their new columns blank");
  const noted = seed.find((p) => p.gp3No === "GP3.192")!;
  assert.match(noted.notes![0], /25\/02\/19993/);
});

test("a sheet already kept takes the staff sheet's word into its blank boxes, never doubles a name, and keeps what HR wrote and deleted", () => {
  const seed = hrMasterSeed();
  const karan = seed.find((p) => p.gp3No === "GP3.001")!;
  const newcomer = seed.find((p) => p.id.startsWith("hrm-staff-"))!;
  const deleted = seed.find((p) => p.id.startsWith("hrm-staff-") && p.id !== newcomer.id)!;
  // A plant computer's sheet from before: Karan as the registers put him (no GP3 No., no birthday), his department corrected by HR;
  // a second register person nobody touched since (the registers' word, "Printing" where a designation would go); a newcomer HR
  // added by hand; a seeded person HR deleted.
  const untouched = seed.find((p) => p.gp3No && p.sources!.some((s) => s.startsWith("F/HR/")) && p.id !== karan.id)!;
  const stored: HrMasterPerson[] = [
    { ...karan, gp3No: "", dateOfBirth: "", subDepartment: "", machine: "", department: "Label (HR's own word)", updatedBy: "HR" },
    { ...untouched, gp3No: "", dateOfBirth: "", subDepartment: "", machine: "", designation: "Printing", sources: ["F/HR/03 line 9"], updatedBy: HR_MASTER_SEEDED_BY },
    { id: "hrm-byhand", ...blankHrMasterValues(), fullName: newcomer.fullName, designation: "Helper", updatedAt: "", updatedBy: "HR" },
  ];
  writeJSON(KEY, { people: stored, removedSeedIds: [deleted.id], removedIds: [deleted.id] });
  ensureSeeded();
  const after = hrMasterRepository.all();
  assert.deepEqual(readJSON<{ people: HrMasterPerson[] } | null>(KEY, null)?.people.length, after.length, "what the page reads is what was saved");
  const k = after.find((p) => p.id === karan.id)!;
  assert.deepEqual([k.gp3No, k.dateOfBirth, k.subDepartment, k.machine, k.department], ["GP3.001", "1974-01-06", "Die Cutting", "Harmonium", "Label (HR's own word)"], "blanks filled, HR's word kept");
  const u = after.find((p) => p.id === untouched.id)!;
  assert.deepEqual([u.designation, u.gp3No, u.subDepartment, u.updatedBy, u.sources![0].startsWith("Master Data Staff.xlsx")], [untouched.designation, untouched.gp3No, untouched.subDepartment, HR_MASTER_STAFF_BY, true], "a register line nobody touched is the staff sheet's person now, under its old id");
  const n = after.find((p) => p.id === "hrm-byhand")!;
  assert.equal(n.gp3No, newcomer.gp3No, "the person HR added by hand takes the GP3 No. by name");
  assert.equal(after.filter((p) => nameKey(p.fullName) === nameKey(newcomer.fullName)).length, 1, "...and is not added a second time");
  assert.ok(!after.some((p) => p.id === deleted.id), "a deleted seeded line stays deleted");
  // Karan was stored, the newcomer is on the sheet by name, the deleted one stays deleted: everybody else of the seed added once.
  assert.equal(after.length, stored.length + seed.length - 4, "everybody else added once");
  storage.removeItem(KEY);
});

test("the upload reads the staff sheet's own headings; F/HR/03 takes the process from Sub Department; the sheet's positions count as workers", () => {
  const found = headerColumns(["GP3 No", "Joining Date", "Full Name", "Department", "Sub Department", "Machine / Process Name", "Position", "Date of Birth"]);
  assert.deepEqual(found, { gp3No: 0, joiningDate: 1, fullName: 2, department: 3, subDepartment: 4, machine: 5, designation: 6, dateOfBirth: 7 });
  const link = hrMasterLinkFor("hr-skill-matrix")!;
  assert.deepEqual(link.fields.find((f) => f.key === "designation"), { key: "designation", from: "subDepartmentThenDesignation" });
  for (const position of ["Helper", "Operator", "Guard", "Driver", "Sweeper", "Peon", "Electrician"]) assert.equal(categoryFor(position), "operator", position);
  for (const position of ["Executive", "Manager", "Coordinator", "HOD", "Designer", "Director", "Sr.Accountant", "Receptionist", "Team Leader", "Process Engineer"]) assert.equal(categoryFor(position), "staff", position);
  assert.equal(roleOf({ designation: "Helper" }), "operator");
  assert.equal(roleOf({ designation: "Executive" }), "staff");
});
