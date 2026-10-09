// THE SCORECARD SAYS WHO SHARES A DOCUMENT BY WHO ANSWERS FOR IT (REQUIREMENTS §92, §96; the people review of 9-Oct-2026).
//
// Raghunath Mane's card said "Shares Maintenance with another account", though nobody else answers for F/MNT/02 to 08:
// the sharing was worked out from the accounts kept to each department. Under the owner's table a record counts
// against the people who answer for its document, so a person shares a module only where another person answers for
// the same documents (Vinay Bhojak and Sandeep Parekh, HR 01-14 and 19-22).
// Run: npm run test:unit -- performanceAnswers
import test from "node:test";
import assert from "node:assert/strict";
import type { RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded, masterRepository } from "../src/data/repositories/masterRepository";
import { scoreAnswerRule, setAccessRules, setAccessScope, setDepartmentScope } from "../src/engine/departmentScope";
import type { AccessAccount } from "../src/engine/accessRules";
import { scorecards, type Person } from "../src/engine/performance";
import { createDefaultData } from "../src/engine/recordDefaults";
import { addDays, todayISO } from "../src/utils/date";

ensureDocumentsSeeded();
ensureMasterSeeded();

const BOSS: AccessAccount = { email: "admin@gpp.local", role: "admin", departments: [] };

const byNumber = (formatNo: string) => documentRepository.getAllUnscoped().find((d) => d.formatNo === formatNo)!;

function late(formatNo: string, dueDate: string): RecordInstance {
  const doc = byNumber(formatNo);
  return {
    id: `perf-${doc.id}-${dueDate}`,
    documentId: doc.id,
    periodKey: `${doc.id}:perf:${dueDate}`,
    dueDate,
    status: "Due",
    isDemo: false,
    data: createDefaultData(doc, dueDate, masterRepository.get()),
    createdAt: `${dueDate}T03:00:00.000Z`,
    updatedAt: `${dueDate}T03:00:00.000Z`,
  };
}

test("a person shares a module only where somebody else answers for the same documents", () => {
  const today = todayISO();
  const due = addDays(today, -5);
  // Maintenance as the plant has it: F/MNT/01 is Kapila Barad's, 02 to 08 Raghunath Mane's, 09 and 10 Ajay Zala's.
  const numbers = ["F/MNT/01", "F/MNT/03", "F/MNT/09", "F/HR/01"];
  const docs = numbers.map(byNumber);
  const records = numbers.map((n) => late(n, due));
  const people: Person[] = [
    { id: "r", name: "Raghunath Mane", role: "staff", departments: ["MNT"], email: "raghunath.mane@gpp.local" },
    { id: "k", name: "Kapila Barad", role: "staff", departments: ["QC", "MNT"], email: "kapila.barad@gpp.local" },
    { id: "v", name: "Vinay Bhojak", role: "staff", departments: ["HR"], email: "vinay.bhojak@gpp.local" },
    { id: "s", name: "Sandeep Parekh", role: "staff", departments: ["HR"], email: "sandeep.parekh@gpp.local" },
    { id: "z", name: "Ajay Zala", role: "staff", departments: ["QC", "MNT"], email: "ajay.zala@gpp.local" },
  ];
  setAccessScope(BOSS, null);
  try {
    const cards = scorecards(records, docs, people, { from: addDays(today, -10), to: today }, today, undefined, scoreAnswerRule());
    const card = (id: string) => cards.byPerson.find((p) => p.person.id === id)!;
    assert.equal(card("r").overdue, 1, "F/MNT/03 is Raghunath Mane's");
    assert.deepEqual(card("r").shared, [], "nobody else answers for F/MNT/03, though Kapila Barad and Ajay Zala answer for other Maintenance documents");
    assert.deepEqual(card("v").shared, ["HR"], "Vinay Bhojak and Sandeep Parekh both answer for F/HR/01");
    assert.deepEqual(card("s").shared, ["HR"]);
  } finally {
    setDepartmentScope(null);
    setAccessRules(null);
  }
});
