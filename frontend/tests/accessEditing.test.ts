// USERS & ACCESS, WITHOUT A BROWSER (REQUIREMENTS §96, engine/accessEditing.ts).
//
// The owner, 8-Oct-2026: only the super admin gives Read, Write or Edit, from the dashboard. What one change on the
// page does to the stored rules, how it is asked before it is saved, and which accounts are flagged:
//   * a module or a document setting is stored, and put back to the table it is removed again; nothing it was given changes;
//   * "answers for it" is stored only where it differs from the owner's table;
//   * the question names the person and the level, and says in plain words what the level allows ("They will be able to");
//   * an account nobody has described is flagged (never the owner's twelve, the super admin or a switched-off account);
//   * the owner's people with no account yet are listed for "Create the missing accounts";
//   * the last super admin cannot be made staff.
// Run: npm run test:unit -- accessEditing
import test from "node:test";
import assert from "node:assert/strict";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { accessDocOf } from "../src/engine/departmentScope";
import { DEFAULT_PEOPLE, buildAccess, normalizeAccessRules, type AccessRules } from "../src/engine/accessRules";
import {
  STALE_RULES_WORDS,
  applyAccessChange,
  changeQuestion,
  changeSaved,
  documentDefaults,
  keepsWhatItHad,
  lastSuperAdmin,
  missingPeople,
  moduleDefaults,
  undescribedAccounts,
  type AccessPerson,
} from "../src/engine/accessEditing";

ensureDocumentsSeeded();
const docs = documentRepository.getAllUnscoped().map(accessDocOf);
const EMPTY: AccessRules = normalizeAccessRules(null);
const ANKUR = "ankur.raval@gpp.local";

test("a module setting is stored, and put back to the table it is gone; what was given is never changed", () => {
  const given = normalizeAccessRules(null);
  const once = applyAccessChange(given, { kind: "module", email: "Ankur.Raval@gpp.local", module: "qc", level: "edit" }, docs);
  assert.deepEqual(once.people[ANKUR]?.modules, { QC: "edit" });
  assert.deepEqual(given, EMPTY, "the rules handed in are left as they were");
  const back = applyAccessChange(once, { kind: "module", email: ANKUR, module: "QC", level: null }, docs);
  assert.equal(back.people[ANKUR]?.modules, undefined);
  const doc = applyAccessChange(once, { kind: "document", email: ANKUR, documentId: "qc-viscosity", level: "read" }, docs);
  assert.deepEqual(doc.people[ANKUR], { modules: { QC: "edit" }, documents: { "qc-viscosity": "read" } });
  // And the rules then say so.
  const access = buildAccess(docs, doc);
  assert.equal(access.level({ email: ANKUR, role: "staff" }, "qc-viscosity"), "read");
  assert.equal(access.level({ email: ANKUR, role: "staff" }, "qc-bopp-film"), "edit");
});

test("who answers for a document is stored only where it differs from the owner's table", () => {
  const added = applyAccessChange(EMPTY, { kind: "answers", email: ANKUR, documentId: "qc-bopp-film", answers: true }, docs);
  assert.deepEqual(added.responsibility["qc-bopp-film"], ["kapila.barad@gpp.local", ANKUR]);
  const removed = applyAccessChange(added, { kind: "answers", email: ANKUR, documentId: "qc-bopp-film", answers: false }, docs);
  assert.equal(removed.responsibility["qc-bopp-film"], undefined, "back to the table: nothing stored");
  const nobody = applyAccessChange(EMPTY, { kind: "answers", email: "kapila.barad@gpp.local", documentId: "qc-bopp-film", answers: false }, docs);
  assert.deepEqual(nobody.responsibility["qc-bopp-film"], [], "nobody named: the super admin answers");
  assert.deepEqual(buildAccess(docs, nobody).responsible("qc-bopp-film"), []);
});

test("every change is asked in plain words naming the person and the level, with no pronoun but They", () => {
  const q = changeQuestion({ kind: "module", email: ANKUR, module: "QC", level: "edit" }, "Ankur Raval", "Quality Control", "read");
  assert.equal(q.title, "Give Ankur Raval Edit in Quality Control?");
  assert.match(q.body, /^They will be able to see its documents and their records/);
  assert.match(q.body, /correct records that are already signed off, delete records/);
  assert.doesNotMatch(`${q.title} ${q.body}`, /\b(he|she|his|her|him)\b/i);
  const none = changeQuestion({ kind: "module", email: ANKUR, module: "PRD", level: "none" }, "Ankur Raval", "Production", "none");
  assert.equal(none.title, "Take away Ankur Raval's access in Production?");
  assert.match(none.body, /will not see Production at all/);
  const read = changeQuestion({ kind: "document", email: ANKUR, documentId: "qc-viscosity", level: "read" }, "Ankur Raval", "F-QC-30 Viscosity", "edit");
  assert.equal(read.title, "Give Ankur Raval Read on F-QC-30 Viscosity?");
  assert.match(read.body, /nothing more: no starting, filling, submitting or verifying/);
  const back = changeQuestion({ kind: "module", email: ANKUR, module: "QC", level: null }, "Ankur Raval", "Quality Control", "read");
  assert.match(back.body, /The owner's table gives Ankur Raval Read in Quality Control/);
  const answers = changeQuestion({ kind: "answers", email: ANKUR, documentId: "qc-bopp-film", answers: true }, "Ankur Raval", "F/QC/01", "edit");
  assert.equal(answers.title, "Make Ankur Raval answer for F/QC/01?");
  assert.match(changeSaved({ kind: "module", email: ANKUR, module: "QC", level: "write" }, "Ankur Raval", "Quality Control", "read"), /Saved\. Ankur Raval now has Write in Quality Control/);
  assert.match(STALE_RULES_WORDS, /Reload/);
});

const person = (over: Partial<AccessPerson>): AccessPerson => ({ id: over.email ?? "x", name: "X", email: "x@gpp.local", role: "staff", departments: [], active: true, ...over });

test("an account nobody has described is flagged; the twelve, the super admin and a switched-off account are not", () => {
  const people = [
    person({ email: "kapila.barad@gpp.local", name: "Kapila Barad" }),
    person({ email: "operator.one@gpp.local", name: "Operator One", departments: ["MNT"] }),
    person({ email: "admin@gpp.local", name: "Super Admin", role: "admin" }),
    person({ email: "gone@gpp.local", name: "Gone", active: false }),
  ];
  assert.deepEqual(undescribedAccounts(people, EMPTY, docs).map((p) => p.email), ["operator.one@gpp.local"]);
  // Once the super admin sets anything for it, it is described.
  const set = applyAccessChange(EMPTY, { kind: "module", email: "operator.one@gpp.local", module: "MNT", level: "write" }, docs);
  assert.deepEqual(undescribedAccounts(people, set, docs), []);
  assert.equal(keepsWhatItHad({ departments: ["MNT"] }, (c) => (c === "MNT" ? "Maintenance" : c)), "Edit in Maintenance, as before");
  assert.equal(keepsWhatItHad({ departments: [] }, (c) => c), "Edit in every module, as before");
});

test("the owner's people with no account yet are listed; the last super admin cannot be made staff", () => {
  const have = [person({ email: "Kapila.Barad@gpp.local" }), person({ email: "vinay.bhojak@gpp.local" })];
  const missing = missingPeople(have);
  assert.equal(missing.length, DEFAULT_PEOPLE.length - 2);
  assert.ok(!missing.some((m) => m.email === "kapila.barad@gpp.local"));
  const people = [person({ id: "a", role: "admin" }), person({ id: "b", role: "staff" })];
  assert.equal(lastSuperAdmin(people, "a"), true);
  assert.equal(lastSuperAdmin([...people, person({ id: "c", role: "admin" })], "a"), false);
  assert.equal(lastSuperAdmin([...people, person({ id: "c", role: "admin", active: false })], "a"), true, "a switched-off super admin cannot sign in");
});

test("the grid's 'as the table' is the person's level without their own setting", () => {
  const vinay = { email: "vinay.bhojak@gpp.local", role: "staff", departments: ["HR"] };
  const rules = applyAccessChange(EMPTY, { kind: "module", email: vinay.email, module: "HR", level: "none" }, docs);
  assert.equal(moduleDefaults(rules, docs, vinay).HR, "read", "the table gives Vinay Bhojak Read in HR (Edit on what Vinay answers for)");
  assert.equal(moduleDefaults(rules, docs, vinay).QC, "none");
  const withDoc = applyAccessChange(EMPTY, { kind: "document", email: vinay.email, documentId: "hr-competence", level: "read" }, docs);
  assert.equal(documentDefaults(withDoc, docs, vinay).level(vinay, "hr-competence"), "edit", "without the document's own setting: Edit, as Vinay answers for it");
});
