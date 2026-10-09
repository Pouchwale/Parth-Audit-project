// THE BELL NAMES WHO ANSWERS FOR A DOCUMENT BY THE OWNER'S TABLE (REQUIREMENTS §96; the people review of 9-Oct-2026).
//
// Each reminder in the bell said "Assigned: Roshni" or "Pooja P, S.V.M.": the roles of Master Data, never the person who
// answers for the document by the owner's table, to whom the notifications go. engine/departmentScope.ts answerersOf
// names them (those the table or the super admin names who may fill it); components/common/ReminderList.tsx shows them,
// and falls back on Master Data's roles only where nobody is held to levels.
// Run: npm run test:unit -- bellAnswerers
import test from "node:test";
import assert from "node:assert/strict";
import { ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { answerersOf, setAccessRules, setAccessScope, setDepartmentScope } from "../src/engine/departmentScope";
import type { AccessAccount } from "../src/engine/accessRules";

ensureDocumentsSeeded();
ensureMasterSeeded();

const VINAY: AccessAccount = { email: "vinay.bhojak@gpp.local", role: "staff", departments: ["HR"] };
const BOSS: AccessAccount = { email: "admin@gpp.local", role: "admin", departments: [] };

function as<T>(who: AccessAccount, rules: unknown, run: () => T): T {
  setAccessScope(who, rules);
  try {
    return run();
  } finally {
    setDepartmentScope(null);
    setAccessRules(null);
  }
}

test("F/HR/17 is Kapila Barad's and F/HR/01 Vinay Bhojak's and Sandeep Parekh's, whoever is looking", () => {
  assert.deepEqual(as(VINAY, null, () => answerersOf("daily-pest-monitoring")), ["Kapila Barad"]);
  assert.deepEqual(as(VINAY, null, () => answerersOf("hr-competence"))?.slice().sort(), ["Sandeep Parekh", "Vinay Bhojak"]);
  assert.deepEqual(as(BOSS, null, () => answerersOf("prd-alc-production"))?.slice().sort(), ["Ajay Sinh Vaghela", "Vishnu Jadhav"]);
});

test("the super admin's own choice is named, and an account the twelve do not name is called by its address", () => {
  const rules = { version: 1, people: { "new.person@gpp.local": { modules: { HR: "write" } } }, responsibility: { "daily-pest-monitoring": ["kapila.barad@gpp.local", "new.person@gpp.local"] } };
  assert.deepEqual(as(BOSS, rules, () => answerersOf("daily-pest-monitoring")), ["Kapila Barad", "New Person"]);
});

test("nobody held to levels (signed out, the engine host): null, so the bell keeps Master Data's roles", () => {
  setDepartmentScope(null);
  assert.equal(answerersOf("daily-pest-monitoring"), null);
});
