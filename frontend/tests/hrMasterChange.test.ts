// A detail typed over on an HR record is asked of HR Master Data (REQUIREMENTS §334).
import test from "node:test";
import assert from "node:assert/strict";
import type { HrMasterPerson } from "../src/types";
import { hrMasterLinkFor } from "../src/engine/hrMaster";
import { askedOfMaster, masterChanges, personOfBox } from "../src/engine/hrMasterChange";

const asha = {
  id: "p1", gp3No: "101", fullName: "Asha Patel", joiningDate: "2020-04-01", department: "QC", subDepartment: "", machine: "",
  designation: "Executive", dateOfBirth: "1990-05-12", updatedAt: "", updatedBy: "",
} as unknown as HrMasterPerson;

test("only a person's own details are asked: not the name, sex, induction or signature date", () => {
  const f04 = hrMasterLinkFor("hr-pre-employment-health")!;
  assert.equal(askedOfMaster(f04, "name"), undefined);
  assert.equal(askedOfMaster(f04, "sex"), undefined);
  assert.equal(askedOfMaster(f04, "signDate"), undefined);
  assert.ok(askedOfMaster(f04, "dateOfBirth"));
  assert.equal(askedOfMaster(hrMasterLinkFor("hr-induction-operators")!, "dateOfJoiningInduction"), undefined);
});

test("a designation, a date in the register's style and a combined box each say what differs", () => {
  const f01 = hrMasterLinkFor("hr-competence")!;
  assert.equal(personOfBox(f01, { name: "Asha Patel" }, [asha])?.id, "p1");
  assert.deepEqual(masterChanges(askedOfMaster(f01, "designation")!, "Sr. Executive", asha).map((c) => [c.key, c.from, c.to]), [["designation", "Executive", "Sr. Executive"]]);
  assert.deepEqual(masterChanges(askedOfMaster(f01, "designation")!, "executive", asha), [], "same words: nothing");
  // F/HR/01 writes 01.04.2020 for 1-Apr-2020
  assert.deepEqual(masterChanges(askedOfMaster(f01, "dateOfJoining")!, "01.04.2020", asha), []);
  assert.deepEqual(masterChanges(askedOfMaster(f01, "dateOfJoining")!, "02.04.2020", asha).map((c) => c.to), ["2020-04-02"]);
  assert.deepEqual(masterChanges(askedOfMaster(f01, "dateOfJoining")!, "04.0", asha), [], "half typed: nothing");
  const f04 = hrMasterLinkFor("hr-pre-employment-health")!;
  assert.deepEqual(masterChanges(askedOfMaster(f04, "deptDesignation")!, "QC – Manager", asha).map((c) => [c.key, c.to]), [["designation", "Manager"]]);
  assert.deepEqual(masterChanges(askedOfMaster(f04, "dateOfBirth")!, "1991-05-12", asha).map((c) => [c.label, c.from]), [["Date of Birth", "1990-05-12"]]);
  assert.deepEqual(masterChanges(askedOfMaster(f01, "department")!, "", asha), [], "a box emptied: nothing");
});
