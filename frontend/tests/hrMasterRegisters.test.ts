// THE REGISTERS FEED HR MASTER DATA (engine/hrMasterRegisters.ts; the owner, 2-Nov-2026): the date of joining on
// F/HR/01 reaches the sheet by name, a blank on the sheet takes what a register says and a written value never
// changes, a name on the plant's lists that is nobody on the sheet is offered as a newcomer, and the fetch the
// formats do then finds the date on the sheet.
// Run: npm run test:unit -- hrMasterRegisters
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { HrMasterPerson, LogSheetData, RecordInstance } from "../src/types";
import { hrMasterLinkFor, personFill } from "../src/engine/hrMaster";
import { registerFills, registerLinkFor, takeFromRegisters, takeWords, valuesSaid } from "../src/engine/hrMasterRegisters";
import { hrMasterRepository } from "../src/data/repositories/hrMasterRepository";

const person = (fullName: string, more: Partial<HrMasterPerson> = {}): HrMasterPerson => ({
  id: `p-${fullName.replace(/\s+/g, "-").toLowerCase()}`,
  gp3No: "",
  joiningDate: "",
  fullName,
  department: "",
  subDepartment: "",
  machine: "",
  designation: "",
  dateOfBirth: "",
  updatedAt: "",
  updatedBy: "",
  ...more,
});

const record = (documentId: string, data: LogSheetData, dueDate = "2026-10-01"): RecordInstance =>
  ({ id: `r-${documentId}-${dueDate}`, documentId, periodKey: dueDate, dueDate, status: "In Progress", isDemo: false, data, createdAt: dueDate, updatedAt: dueDate }) as RecordInstance;

const competence = registerLinkFor("hr-competence")!;
const f01 = (rows: Record<string, string>[], dueDate?: string) => record("hr-competence", { header: { reviewedOn: "01.10.2026" }, rows: rows.map((r, i) => ({ id: `row-${i}`, ...r })) }, dueDate);

describe("the registers feed HR Master Data (REQUIREMENTS §161)", () => {
  it("an F/HR/01 line says the person's department, designation and date of joining in the sheet's own terms", () => {
    assert.deepEqual(valuesSaid(competence, { name: "Vinay Bhojak", department: "HR & Admin", designation: "Manager", dateOfJoining: "05.07.2024" }), {
      department: "HR & Admin",
      designation: "Manager",
      joiningDate: "2024-07-05",
    });
    assert.deepEqual(valuesSaid(competence, { name: "X", dateOfJoining: "7/5/2024" }), { joiningDate: "2024-07-05" }, "a slash date on F/HR/01 is month first, as the register writes it");
    assert.deepEqual(valuesSaid(competence, { name: "X", dateOfJoining: "not a date" }), {}, "words that are not a date fill nothing");
    const induction = registerLinkFor("hr-induction-operators")!;
    assert.deepEqual(valuesSaid(induction, { name: "Azad Patel", joining: "OPERATOR- POUCH", dateOfJoiningInduction: "01/07/2025" }), { department: "POUCH", designation: "OPERATOR", joiningDate: "2025-07-01" });
  });

  it("a blank on the sheet takes the date of joining from F/HR/01 by name; a date HR wrote on the sheet stays", () => {
    const people = [person("Vinay Bhojak"), person("Kapila Barad", { joiningDate: "2023-01-09", department: "QC" })];
    const fills = registerFills(
      competence,
      f01([
        { name: "Vinay Bhojak", department: "HR & Admin", designation: "Manager", dateOfJoining: "05.07.2024" },
        { name: "Kapila Barad", department: "Quality", designation: "Executive", dateOfJoining: "01.02.2022" },
        { name: "", department: "Nobody", designation: "", dateOfJoining: "01.01.2020" },
      ]).data as LogSheetData,
      people
    );
    assert.deepEqual(
      fills.map((f) => [f.fullName, f.key, f.after, f.source]),
      [
        ["Vinay Bhojak", "joiningDate", "2024-07-05", "F/HR/01 line 1"],
        ["Vinay Bhojak", "department", "HR & Admin", "F/HR/01 line 1"],
        ["Vinay Bhojak", "designation", "Manager", "F/HR/01 line 1"],
        ["Kapila Barad", "designation", "Executive", "F/HR/01 line 2"],
      ],
      "Kapila's own joining date and department stay; only her blank designation is filled"
    );
  });

  it("the newest register speaks first, and a person is filled once; a name on F/HR/01 that is nobody on the sheet is a newcomer", () => {
    const people = [person("Vinay Bhojak")];
    const older = f01([{ name: "Vinay Bhojak", dateOfJoining: "05.07.2023" }, { name: "Nilesh Rana", department: "Printing", designation: "Supervisor", dateOfJoining: "10.01.2021" }], "2025-10-01");
    const newer = f01([{ name: "Vinay Bhojak", dateOfJoining: "05.07.2024" }, { name: "Nilesh M. Rana", department: "Printing", designation: "Supervisor" }], "2026-10-01");
    const take = takeFromRegisters(people, [older, newer]);
    assert.deepEqual(
      take.fills.map((f) => [f.key, f.after, f.source]),
      [["joiningDate", "2024-07-05", "F/HR/01 line 1"]]
    );
    assert.equal(take.newcomers.length, 1, "the two spellings of Nilesh are one newcomer");
    const [n] = take.newcomers;
    assert.equal(n.fullName, "Nilesh M. Rana");
    assert.deepEqual(n.aliases, ["Nilesh Rana"]);
    assert.deepEqual(n.values, { department: "Printing", designation: "Supervisor", joiningDate: "2021-01-10" });
    assert.deepEqual(n.sources, ["F/HR/01 line 2", "F/HR/01 line 2"]);
  });

  it("a header format (F/HR/05) fills too, but puts nobody new on the sheet", () => {
    const people = [person("Kapila Barad")];
    const induction = record("hr-induction-staff", { header: { name: "Kapila Barad", deptProcess: "QC", designation: "Executive", dateOfJoining: "2026-11-05" }, rows: [] });
    const stranger = record("hr-induction-staff", { header: { name: "Somebody New", deptProcess: "QC", designation: "Helper", dateOfJoining: "2026-11-05" }, rows: [] }, "2026-10-02");
    const take = takeFromRegisters(people, [induction, stranger]);
    assert.deepEqual(
      take.fills.map((f) => [f.key, f.after, f.source]),
      [
        ["joiningDate", "2026-11-05", "F/HR/05"],
        ["department", "QC", "F/HR/05"],
        ["designation", "Executive", "F/HR/05"],
      ]
    );
    assert.deepEqual(take.newcomers, []);
  });

  it("the sheet takes the registers' word, and the formats then fetch the date of joining from it", () => {
    const added = hrMasterRepository.add({ fullName: "Register Test Person", department: "QC" }, "test");
    try {
      const take = takeFromRegisters(hrMasterRepository.all(), [
        f01([
          { name: "Register Test Person", department: "Quality", designation: "Executive", dateOfJoining: "05.07.2024" },
          { name: "Register Newcomer", department: "Printing", designation: "Operator", dateOfJoining: "01.02.2025" },
        ]),
      ]);
      const outcome = hrMasterRepository.takeFromRegisters(take, "test");
      assert.deepEqual(outcome, { filled: 2, added: 1 });
      const saved = hrMasterRepository.get(added.id)!;
      assert.equal(saved.joiningDate, "2024-07-05");
      assert.equal(saved.designation, "Executive");
      assert.equal(saved.department, "QC", "HR's own word on the department stays");
      const newcomer = hrMasterRepository.all().find((p) => p.fullName === "Register Newcomer")!;
      assert.ok(newcomer, "the newcomer is on the sheet");
      assert.equal(newcomer.joiningDate, "2025-02-01");
      assert.deepEqual(newcomer.sources, ["F/HR/01 line 2"]);
      // F/HR/05's header now fetches the date of joining the register gave.
      const link = hrMasterLinkFor("hr-induction-staff")!;
      const { fills } = personFill(link, saved, { name: "Register Test Person" });
      assert.ok(fills.some((f) => f.key === "dateOfJoining" && f.after === "2024-07-05"), JSON.stringify(fills));
      assert.equal(takeWords(2, 1), "2 blank boxes filled from the registers; 1 person added from the registers.");
      assert.equal(takeWords(0, 0), "The sheet already holds everything the registers give.");
      hrMasterRepository.remove(newcomer.id);
    } finally {
      hrMasterRepository.remove(added.id);
    }
  });
});
