// AN OPERATOR ADDED TO HR MASTER DATA COMES ON F/HR/03 BY THEMSELVES, 5 UNDER THEIR OWN OPERATION (REQUIREMENTS §290).
// Run: npm run test:unit -- hrSkillByDepartment
import test from "node:test";
import assert from "node:assert/strict";
import type { HrMasterPerson, LogSheetData, LogSheetRow } from "../src/types";
import { ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { hrMasterRepository } from "../src/data/repositories/hrMasterRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { SKILL_OPERATIONS } from "../src/data/seed/hrLayouts";
import { SEED_HR_SKILL_MATRIX } from "../src/data/seed/hrRecords";
import { registerOnFile } from "../src/engine/hrJoiner";
import { fileNewOperators, roleOf } from "../src/engine/hrMasterFiling";
import { sameRegisterName } from "../src/engine/hrMasterRegisters";
import { skillOperationFor, skillPointsFor } from "../src/engine/skillOperation";

ensureDocumentsSeeded();
ensureMasterSeeded();

const opts = { actorName: "Test HR", isDemo: false };
const facts = (subDepartment: string, machine = "", department = "", designation = "Operator") => ({ subDepartment, machine, department, designation });
const rows = (): LogSheetRow[] => (registerOnFile("hr-skill-matrix", false)?.data as LogSheetData | undefined)?.rows ?? [];
const lineOf = (name: string) => rows().find((r) => r.name === name);
const scored = (row: LogSheetRow | undefined) => SKILL_OPERATIONS.filter(({ key }) => String(row?.[key] ?? "") !== "").map(({ key }) => `${key}=${row?.[key]}`);

function addPerson(values: Partial<HrMasterPerson>): HrMasterPerson {
  const person = hrMasterRepository.add({}, opts.actorName);
  for (const [key, value] of Object.entries(values)) hrMasterRepository.update(person.id, key as "fullName", String(value), opts.actorName);
  return hrMasterRepository.get(person.id)!;
}

test("each department or machine names its own column of the matrix", () => {
  const cases: [ReturnType<typeof facts>, string | undefined][] = [
    [facts("Printing", "Gallus"), "printing"],
    [facts("Pouching", "Zhoutai"), "pouchingMachine"],
    [facts("Lamination", "C Trivedi"), "lamination"],
    [facts("Slitting", "Slitting"), "slitting"],
    [facts("Sleeve Gluing", "Sliting"), "sleeveGluing"],
    [facts("Sleeve Cutting", "XL"), "sleeveCutting"],
    [facts("Reel to Sheet", "Paper Cutting"), "sheetCutting"],
    [facts("Quality Control", "IPQC"), "ipqc"],
    [facts("Quality Control", "QC / Sorting"), "qcManual"],
    [facts("Post Press", "Brison inspection"), "qcMachine"],
    [facts("Corrugation", "Auto Punching"), "punching"],
    [facts("Corrugation", "Finger Ress"), "pasting"],
    [facts("Packing / Bundling", "Striping"), "bundling"],
    [facts("", "", "POUCH"), "pouchingMachine"],
  ];
  for (const [person, want] of cases) assert.equal(skillOperationFor(person), want, JSON.stringify(person));
});

test("nobody is scored on a machine their work has no column for", () => {
  for (const person of [facts("Security", "Guard"), facts("Store", "Store"), facts("Dispatch / Loading", "Driver"), facts("Housekeeping", "Sweeper"), facts("Machinery", "Electrician"), facts("Corrugation", "For Clip"), facts("", "")]) {
    assert.equal(skillOperationFor(person), undefined, JSON.stringify(person));
    assert.ok(Object.values(skillPointsFor(person)).every((v) => v === ""));
  }
});

test("the rule agrees with the company's own matrix for most of the people on both", () => {
  const people = hrMasterRepository.all();
  let same = 0;
  let compared = 0;
  for (const row of (SEED_HR_SKILL_MATRIX.data as LogSheetData).rows) {
    const person = people.find((p) => sameRegisterName(row.name, p.fullName));
    const own = person && skillOperationFor(person);
    if (!own) continue;
    compared++;
    if (String(row[own] ?? "") !== "") same++;
  }
  assert.ok(compared >= 30, `${compared} compared`);
  assert.ok(same / compared >= 0.75, `${same} of ${compared}`);
});

test("a new operator comes on F/HR/03 once, with 5 under their process and the box still theirs to change", () => {
  const before = rows().length;
  const person = addPerson({ gp3No: "GP3.9901", fullName: "Testa Newoperator", department: "Label", subDepartment: "Printing", machine: "Gallus" });
  assert.equal(fileNewOperators(opts).filed.length, 0, "the sheet does not yet say they are an operator");
  hrMasterRepository.update(person.id, "designation", "Operator", opts.actorName);
  const first = fileNewOperators(opts);
  assert.equal(first.filed.length, 1);
  assert.equal(first.filed[0].operation, "Printing");
  assert.equal(rows().length, before + 1);
  assert.deepEqual(scored(lineOf("Testa Newoperator")), ["printing=5"]);
  assert.equal(hrMasterRepository.get(person.id)?.newForSkillMatrix, undefined, "settled");
  assert.equal(fileNewOperators(opts).filed.length, 0, "never a second line");
  assert.equal(rows().length, before + 1);
  const box = getLogSheetLayout("hr-skill-matrix")!.columns.find((c) => c.key === "printing")!;
  assert.deepEqual(box.options, ["5", "3", "1"]);
  assert.ok(!box.locked && !box.computed);
});

test("the people already on the sheet are not filed, and work with no column waits and is said", () => {
  const existing = hrMasterRepository.all().filter((p) => !p.newForSkillMatrix && roleOf(p) === "operator");
  assert.ok(existing.length > 100);
  const count = rows().length;
  const guard = addPerson({ gp3No: "GP3.9902", fullName: "Testa Guard", department: "Security", subDepartment: "Security", machine: "Guard", designation: "Guard" });
  const out = fileNewOperators(opts);
  assert.equal(rows().length, count, "nobody else was added");
  assert.ok(out.noColumn.some((p) => p.id === guard.id));
  assert.equal(lineOf("Testa Guard"), undefined);
  assert.equal(hrMasterRepository.get(guard.id)?.newForSkillMatrix, true);
});
