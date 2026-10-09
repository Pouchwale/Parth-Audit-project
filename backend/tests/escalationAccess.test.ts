// WHOM A LATE OR MISSED RECORD COUNTS AGAINST, ON THE SERVER (REQUIREMENTS §75, §96), backend/escalation.ts: the
// daily escalation follows who answers for each document by the access rules (the owner's table, and what the super
// admin changed), not the department an account is kept to. Pure: the plant comes in as an argument.
// Run: npm run test:unit -- escalationAccess
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { answerersOf, findEscalations, type Plant } from "../escalation.ts";

const TODAY = "2026-10-09"; // a Friday
const daily = (id: string, formatNo: string, name: string) => ({ id, formatNo, name, module: "Quality Control", kind: "log-sheet", schedule: { type: "daily" } });
const DOCS = [
  daily("qc-viscosity", "F-QC-30", "Lamination Adhesive Viscosity Record"), // Ankur Raval answers for it
  daily("qc-inspection-pouching", "F/QC/37", "Inspection Record - Pouching Process"), // Kapila Barad
  daily("hr-hygiene-report", "F/HR/22", "Daily Personal Sanitation & Hygiene Inspection Report"), // Vinay Bhojak and Sandeep Parekh
];
const missed = (documentId: string, dueDate: string) => ({ id: `${documentId}-${dueDate}`, documentId, dueDate, status: "Due" });
// Monday to Wednesday of this week, never done (Thursday is the weekly off).
const DAYS = ["2026-10-05", "2026-10-06", "2026-10-07"];
const account = (id: string, name: string, email: string, departments: string[], role = "staff") => ({ id, name, email, role, departments, active: true });

function plant(access?: unknown): Plant {
  return {
    records: DAYS.flatMap((d) => [missed("qc-viscosity", d), missed("hr-hygiene-report", d)]),
    documents: DOCS,
    master: null,
    liveStart: null,
    accounts: [
      account("u-admin", "Super Admin", "admin@gpp.local", [], "admin"),
      account("u-kapila", "Kapila Barad", "kapila.barad@gpp.local", ["QC"]),
      account("u-ankur", "Ankur Raval", "ankur.raval@gpp.local", ["QC"]),
      account("u-vinay", "Vinay Bhojak", "vinay.bhojak@gpp.local", ["HR"]),
      account("u-sandeep", "Sandeep Parekh", "sandeep.parekh@gpp.local", ["HR"]),
    ],
    ...(access === undefined ? {} : { access }),
  };
}

describe("the escalation counts a record against the people who answer for its document", () => {
  it("F-QC-30 never done is Ankur Raval's by name, not Quality Control's (two accounts are kept to QC)", () => {
    const { subjects } = findEscalations(plant(), TODAY);
    const ankur = subjects.find((s) => s.key === "u-ankur");
    assert.ok(ankur, JSON.stringify(subjects.map((s) => [s.kind, s.key, s.name])));
    assert.equal(ankur.kind, "person");
    assert.equal(ankur.neverDone, 3);
    assert.equal(ankur.department, "QC");
    assert.equal(subjects.some((s) => s.key === "u-kapila" || s.key === "dept:QC"), false, "Kapila Barad does not answer for F-QC-30");
  });

  it("a document two answer for is escalated as its module, named with them", () => {
    const { subjects } = findEscalations(plant(), TODAY);
    const hr = subjects.find((s) => s.key === "dept:HR");
    assert.equal(hr?.kind, "department");
    assert.equal(hr?.neverDone, 3);
    assert.equal(hr?.name, "Human Resources (Vinay Bhojak, Sandeep Parekh)");
  });

  it("follows what the super admin changed: F-QC-30 given to Kapila Barad is hers", () => {
    const { subjects } = findEscalations(plant({ version: 1, people: {}, responsibility: { "qc-viscosity": ["kapila.barad@gpp.local"] } }), TODAY);
    assert.equal(subjects.find((s) => s.key === "u-kapila")?.neverDone, 3);
    assert.equal(subjects.some((s) => s.key === "u-ankur"), false);
  });

  it("an account the rules never name answers for its department's documents, as before", () => {
    const p = plant();
    p.accounts = [account("u-admin", "Super Admin", "admin@gpp.local", [], "admin"), account("u-clerk", "QC Clerk", "qc.clerk@example.com", ["QC"])];
    const who = answerersOf(p);
    assert.deepEqual(who(DOCS[0]).map((a) => a.id), ["u-clerk"]);
    assert.equal(findEscalations(p, TODAY).subjects.find((s) => s.key === "u-clerk")?.neverDone, 3);
  });

  it("the super admin answers for nothing of their own", () => {
    const who = answerersOf(plant());
    for (const d of DOCS) assert.equal(who(d).some((a) => a.id === "u-admin"), false);
  });
});
