// THE PLANT'S NAMED ACCOUNTS (REQUIREMENTS §62, §96), backend/seedAccounts.ts: the super admin and the twelve people the
// owner named on 7-Oct-2026, at name.surname@gpp.local, each kept to the modules they see by his table.
// Run: npm run test:unit -- seedAccounts
import assert from "node:assert/strict";
import { it } from "node:test";
import { SEED_ACCOUNTS } from "../seedAccounts.ts";
import { DEFAULT_PEOPLE } from "../../frontend/src/engine/accessRules.ts";

it("seeds the super admin and every one of the owner's twelve people, and nobody else", () => {
  assert.equal(SEED_ACCOUNTS.length, 13);
  assert.deepEqual(SEED_ACCOUNTS[0], { name: "Super Admin", email: "admin@gpp.local", role: "admin", departments: "" });
  assert.deepEqual(
    SEED_ACCOUNTS.slice(1).map((a) => [a.name, a.email, a.role]),
    DEFAULT_PEOPLE.map((p) => [p.name, p.email, "staff"])
  );
  for (const a of SEED_ACCOUNTS) assert.match(a.email, /^[a-z]+\.?[a-z]+@gpp\.local$/);
});

it("keeps the first three as they were made, and each other person to the modules of what they fill", () => {
  const departments = Object.fromEntries(SEED_ACCOUNTS.map((a) => [a.email, a.departments]));
  assert.equal(departments["kapila.barad@gpp.local"], "QC");
  assert.equal(departments["vinay.bhojak@gpp.local"], "HR");
  assert.equal(departments["sandeep.parekh@gpp.local"], "HR");
  assert.equal(departments["chirag.parmar@gpp.local"], "PUR");
  assert.equal(departments["bharat.ahir@gpp.local"], "STR");
  assert.equal(departments["ajaysinh.vaghela@gpp.local"], "PRD,QC", "Production, and the camera challenge test, a QC document");
  assert.equal(departments["ajay.zala@gpp.local"], "QC,MNT");
  assert.equal(departments["ankur.raval@gpp.local"], "QC");
  for (const email of ["dharmik.mistry@gpp.local", "anil.ravad@gpp.local", "vishnu.jadhav@gpp.local"]) assert.equal(departments[email], "PRD");
  assert.equal(departments["raghunath.mane@gpp.local"], "MNT");
});
