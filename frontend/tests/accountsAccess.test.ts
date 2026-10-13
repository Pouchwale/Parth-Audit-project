// THE ACCESS RULES WITH ACCOUNTS RENAMED AND REMOVED (REQUIREMENTS §110), engine/accessRules.ts and
// engine/accessEditing.ts, without a browser.
//
// The owner, 12-Oct-2026: "change username kapilabarad01@gmail.com change to kapila barad only and also remove all
// others except kapila, superadmin, admin, vinay, sandeep and bharat, chirag, ankur, dharmik". Held here:
//   * the removed accounts' sign-ins kept in the rules ("removed"), once each, in small letters, sorted; absent when none,
//     so rules from before read exactly as they did;
//   * a removed person answers for nothing: out of the owner's table's own lists and the super admin's, a document only
//     they filled has nobody (the super admin answers for it), and they have no access anywhere; everybody else is as
//     they were;
//   * a rename moves what the super admin set and who fills what to the new sign-in, the owner's table's own lists too,
//     and nothing stays under the old one; what the table gives a sign-in itself stays with it: an account renamed to
//     kapila.barad@gpp.local gets Kapila Barad's rights from the table (the owner's case);
//   * Users & Access's changes keep the removed list as it was read; its defaults are worked out with it; a removed,
//     given-up or renamed-away account is never "missing"; a removed super admin is not one who can sign in; nor is a
//     removed account "nobody has described".
// Run: npm run test:unit -- accountsAccess
import test from "node:test";
import assert from "node:assert/strict";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { accessDocOf } from "../src/engine/departmentScope";
import { ACCESS_MODULES, DEFAULT_PEOPLE, buildAccess, defaultResponsible, moveAccount, normalizeAccessRules, type AccessRules } from "../src/engine/accessRules";
import { applyAccessChange, lastSuperAdmin, missingPeople, moduleDefaults, undescribedAccounts } from "../src/engine/accessEditing";
import { FORMER_SEPARATOR, releasedSignIn } from "../src/engine/accountNames";

ensureDocumentsSeeded();
const docs = documentRepository.getAllUnscoped().map(accessDocOf);
const EMPTY: AccessRules = normalizeAccessRules(null);

const KAPILA = "kapila.barad@gpp.local";
const KAPILA_GMAIL = "kapilabarad01@gmail.com";
const VINAY = "vinay.bhojak@gpp.local";
const SANDEEP = "sandeep.parekh@gpp.local";
const RAGHUNATH = "raghunath.mane@gpp.local";
const staff = (email: string, departments: string[] = []) => ({ email, role: "staff", departments });
const mntDocs = docs.filter((d) => defaultResponsible(d).includes(RAGHUNATH)).map((d) => d.id);

test("the removed sign-ins are kept once each, in small letters, sorted; absent when there are none", () => {
  const r = normalizeAccessRules({ version: 1, people: {}, responsibility: {}, removed: ["Raghunath.Mane@GPP.local", "anil.ravad@gpp.local", RAGHUNATH, "not an email", 7] });
  assert.deepEqual(r.removed, ["anil.ravad@gpp.local", RAGHUNATH]);
  assert.deepEqual(normalizeAccessRules({ version: 1, people: {}, responsibility: {}, removed: [] }), EMPTY);
  assert.equal("removed" in EMPTY, false, "rules from before read exactly as they did");
});

test("a removed person answers for nothing and has no access; a document only they filled has nobody; everybody else is as they were", () => {
  assert.ok(mntDocs.length >= 5, "Raghunath Mane fills F/MNT/02 to F/MNT/08 by the owner's table");
  const before = buildAccess(docs, EMPTY);
  const rules = normalizeAccessRules({ version: 1, people: { [RAGHUNATH]: { modules: { MNT: "edit" } } }, responsibility: { "hr-competence": [VINAY, RAGHUNATH] }, removed: [RAGHUNATH] });
  const after = buildAccess(docs, rules);
  for (const id of mntDocs) {
    assert.deepEqual(after.responsible(id), [], `${id}: Nobody fills this`);
    assert.equal(after.level(staff(RAGHUNATH, ["MNT"]), id), "none");
  }
  assert.deepEqual(after.responsible("hr-competence"), [VINAY], "out of the super admin's own list too");
  assert.deepEqual(after.answersFor(staff(RAGHUNATH)), []);
  assert.deepEqual(after.modules(staff(RAGHUNATH)), []);
  assert.equal(after.moduleLevel(staff(RAGHUNATH), "MNT"), "none", "even with a module setting stored");
  // Everybody else: unchanged.
  for (const p of DEFAULT_PEOPLE.filter((x) => x.email !== RAGHUNATH)) {
    for (const d of docs) {
      if (d.id === "hr-competence") continue;
      assert.equal(after.level(staff(p.email), d.id), before.level(staff(p.email), d.id), `${p.name} on ${d.id}`);
    }
  }
  // Sandeep Parekh removed from F/HR/01: Vinay Bhojak still fills it.
  const sandeepGone = buildAccess(docs, normalizeAccessRules({ version: 1, people: {}, responsibility: {}, removed: [SANDEEP] }));
  assert.deepEqual(sandeepGone.responsible("hr-competence"), [VINAY]);
});

test("a rename moves what the super admin set and who fills what; nothing stays under the old sign-in", () => {
  const rules = normalizeAccessRules({
    version: 1,
    people: { [RAGHUNATH]: { documents: { "qc-bopp-film": "read" } }, "raghu@gpp.local": { modules: { HR: "read" } } },
    responsibility: { "hr-competence": [VINAY, RAGHUNATH] },
  });
  const moved = moveAccount(rules, docs, RAGHUNATH, "Raghu@GPP.local");
  const to = "raghu@gpp.local";
  assert.deepEqual(moved.people[to], { modules: { HR: "read" }, documents: { "qc-bopp-film": "read" } }, "his own settings over what was stored for the new sign-in");
  assert.equal(moved.people[RAGHUNATH], undefined);
  assert.deepEqual(moved.responsibility["hr-competence"], [VINAY, to], "in the same place");
  for (const id of mntDocs) assert.deepEqual(moved.responsibility[id], [to], `${id}: the owner's table's list, under the new sign-in`);
  const access = buildAccess(docs, moved);
  for (const id of mntDocs) assert.equal(access.level(staff(to), id), "edit");
  assert.deepEqual(access.answersFor(staff(RAGHUNATH)), [], "the old sign-in answers for nothing");
  // Back again: the table's own lists are the table's, so nothing of them stays stored.
  const back = moveAccount(moved, docs, to, RAGHUNATH);
  for (const id of mntDocs) assert.equal(back.responsibility[id], undefined, `${id}: the owner's table again`);
  assert.deepEqual(rules.responsibility["hr-competence"], [VINAY, RAGHUNATH], "nothing handed in is changed");
});

test("THE OWNER'S CASE: kapilabarad01@gmail.com renamed to kapila.barad@gpp.local gets Kapila Barad's rights from the owner's table", () => {
  // Before: an account nobody described, kept to Quality Control (as she was made), Edit there and nothing else.
  const before = buildAccess(docs, EMPTY);
  assert.equal(before.level(staff(KAPILA_GMAIL, ["QC"]), "qc-inprocess-printing"), "edit");
  assert.equal(before.level(staff(KAPILA_GMAIL, ["QC"]), "hr-competence"), "none");
  const rules = moveAccount(EMPTY, docs, KAPILA_GMAIL, KAPILA);
  assert.deepEqual(rules, EMPTY, "nothing was set for her: nothing to move");
  const after = buildAccess(docs, rules);
  const her = staff(KAPILA, ["QC"]);
  assert.deepEqual(
    after.modules(her).map((m) => m.module),
    ACCESS_MODULES.slice(),
    "every module"
  );
  assert.equal(after.level(her, "qc-inprocess-printing"), "edit", "QC to fill");
  assert.equal(after.level(her, "sys-format-list"), "edit", "SYS to fill");
  assert.equal(after.level(her, "hr-competence"), "read", "every other module to read");
  assert.ok(after.answersFor(her).includes("daily-pest-monitoring"), "she answers for F/HR/17 by the owner's table");
});

test("a rename takes both sign-ins off the removed list; the removed list moves with nothing else", () => {
  const rules = normalizeAccessRules({ version: 1, people: {}, responsibility: {}, removed: [KAPILA, "anil.ravad@gpp.local"] });
  const moved = moveAccount(rules, docs, KAPILA_GMAIL, KAPILA);
  assert.deepEqual(moved.removed, ["anil.ravad@gpp.local"]);
});

test("Users & Access's changes keep the removed list as it was read, and work their defaults out with it", () => {
  const rules = normalizeAccessRules({ version: 1, people: {}, responsibility: {}, removed: [RAGHUNATH] });
  const changed = applyAccessChange(rules, { kind: "module", email: VINAY, module: "QC", level: "read" }, docs);
  assert.deepEqual(changed.removed, [RAGHUNATH]);
  const answered = applyAccessChange(rules, { kind: "answers", email: VINAY, documentId: "mnt-pm-record", answers: true }, docs);
  assert.deepEqual(answered.removed, [RAGHUNATH]);
  assert.deepEqual(buildAccess(docs, answered).responsible("mnt-pm-record"), [VINAY], "Vinay Bhojak picked: he fills it now");
  assert.equal(moduleDefaults(rules, docs, staff(RAGHUNATH)).MNT, "none");
});

test("a removed, given-up or renamed-away account is never missing; a removed super admin is not one; nor is a removed account undescribed", () => {
  const onFile = [
    { email: RAGHUNATH },
    { email: releasedSignIn(KAPILA, "u-kseed") },
    { email: "vinay@gpp.local", formerSignIns: [VINAY] },
  ];
  const missing = missingPeople(onFile).map((p) => p.email);
  for (const has of [RAGHUNATH, KAPILA, VINAY]) assert.ok(!missing.includes(has), has);
  assert.ok(missing.includes(SANDEEP));
  assert.equal(FORMER_SEPARATOR, "\n");
  const people = [
    { id: "a", name: "Super Admin", email: "admin@gpp.local", role: "admin", departments: [] as string[], active: true },
    { id: "b", name: "Removed Boss", email: "boss@gpp.local", role: "admin", departments: [] as string[], active: true, removedAt: "2026-10-12" },
    { id: "c", name: "Temp", email: "temp@example.com", role: "staff", departments: [] as string[], active: true, removedAt: "2026-10-12" },
    { id: "d", name: "Other", email: "other@example.com", role: "staff", departments: [] as string[], active: true },
  ];
  assert.equal(lastSuperAdmin(people, "a"), true, "the removed super admin does not count");
  assert.deepEqual(
    undescribedAccounts(people, EMPTY, docs).map((p) => p.id),
    ["d"]
  );
});
