// Responsible (Who) is whom Users & Access gives the document; a removed account is gone from it (REQUIREMENTS §333).
// Run: npm run test:unit -- responsibleWho
import test from "node:test";
import assert from "node:assert/strict";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded, masterRepository } from "../src/data/repositories/masterRepository";
import { answerersOf, setAccessRules, setAccessScope, setAccountDirectory } from "../src/engine/departmentScope";
import { getDocumentInfo } from "../src/engine/documentInfo";

ensureDocumentsSeeded();
ensureMasterSeeded();

const RIYA = "riya.test@gmail.com";
const ACCOUNTS = [
  { email: "admin@gpp.local", name: "Super Admin" },
  { email: "vinay.bhojak@gpp.local", name: "Vinay Bhojak" },
  { email: "ankur.raval@gpp.local", name: "Ankur Raval" },
  { email: RIYA, name: "Riya Shah" },
];
const who = (id: string): string => getDocumentInfo(documentRepository.getByIdUnscoped(id)!, masterRepository.get()).whoLabel;

test("names the accounts Users & Access gives the document, and no one removed or never made", () => {
  setAccessScope({ email: "admin@gpp.local", role: "admin", departments: [] }, null);
  setAccountDirectory(ACCOUNTS);
  // The owner's table names Vinay Bhojak and Sandeep Parekh for F/HR/10; Sandeep has no account here.
  assert.equal(who("hr-training-imparted"), "Vinay Bhojak");

  // Given Write on F/HR/10, and ticked as answering for F/QC viscosity.
  setAccessRules({ version: 1, people: { [RIYA]: { documents: { "hr-training-imparted": "write" } } }, responsibility: { "qc-viscosity": ["ankur.raval@gpp.local", RIYA] } });
  assert.equal(who("hr-training-imparted"), "Vinay Bhojak, Riya Shah");
  assert.equal(who("qc-viscosity"), "Ankur Raval, Riya Shah");
  assert.deepEqual(answerersOf("hr-induction-staff"), ["Vinay Bhojak"], "nothing given there");

  // Read only is not responsibility.
  setAccessRules({ version: 1, people: { [RIYA]: { modules: { HR: "read" } } }, responsibility: {} });
  assert.equal(who("hr-training-imparted"), "Vinay Bhojak");

  // Write on the whole module names her on every document of it.
  setAccessRules({ version: 1, people: { [RIYA]: { modules: { HR: "write" } } }, responsibility: {} });
  assert.equal(who("hr-induction-staff"), "Vinay Bhojak, Riya Shah");

  // Removed by the super admin: gone from the list of accounts and from the rules.
  setAccessRules({ version: 1, people: { [RIYA]: { modules: { HR: "write" } } }, responsibility: {}, removed: [RIYA] });
  setAccountDirectory(ACCOUNTS.filter((a) => a.email !== RIYA));
  assert.equal(who("hr-induction-staff"), "Vinay Bhojak");

  // Nobody left: the super admin answers.
  setAccountDirectory([{ email: "admin@gpp.local", name: "Super Admin" }]);
  assert.match(who("hr-induction-staff"), /^Super admin/);

  // Nobody signed in (the engine host): Master Data's roles, as before.
  setAccessScope(null, null);
  setAccountDirectory(null);
  assert.equal(answerersOf("hr-induction-staff"), null);
});
