// THE MASTER LIST OF WHO DOES WHAT, WITHOUT A BROWSER (REQUIREMENTS §110, engine/masterList.ts; the page is
// pages/MasterListPage.tsx).
//
// The owner, 12-Oct-2026: "make sure give me options like separate master list format only for superadmin in which in
// every document present in that master list format so in that super will select user according to documents
// superadmin can select and also give options like read, write, and view". Held here:
//   * every document of the catalogue once, in F/SYS/02's order and columns: its module sections as the list runs them,
//     the list's Sr. No. (F/SYS/02 itself is 2, F/QC/13 is 43), the format number and name, the frequency and the
//     list's method of recording; a document the list does not name at the end of its module;
//   * a cell is the very level Users & Access gives (engine/accessRules.ts), plain from the owner's table, bold ("set")
//     where the super admin set it on the document or for its whole module; "back to the table" is the drawer's own
//     "as the module";
//   * the columns: the active staff by name; the super admins named apart; nobody switched off or removed;
//   * the filters: a module, a person (what they fill or see, or every document), "Nobody fills this", words;
//   * the changes: a level on many documents at once, who fills a document (the main person first, nothing stored when
//     it is the owner's table again, nobody), one person made the one who fills many, or added to who fills them; a
//     removed person never fills anything;
//   * fast: every cell of 129 documents by a dozen people worked out well inside a frame budget.
// Run: npm run test:unit -- masterList
import test from "node:test";
import assert from "node:assert/strict";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { FORMAT_LIST_ROWS } from "../src/data/seed/sysDocumentControlLayouts";
import { accessDocOf } from "../src/engine/departmentScope";
import { buildAccess, normalizeAccessRules, type AccessRules } from "../src/engine/accessRules";
import { documentDefaults } from "../src/engine/accessEditing";
import {
  MASTER_SECTION_ORDER,
  NO_FILTER,
  cellOf,
  fillMany,
  filterRows,
  levelWithoutOwn,
  masterAccess,
  masterBosses,
  masterColumns,
  masterSections,
  setFillers,
  setLevels,
  type MasterPerson,
} from "../src/engine/masterList";

ensureDocumentsSeeded();
const all = documentRepository.getAllUnscoped();
const docs = all.map(accessDocOf);
const sections = masterSections(all);
const rows = sections.flatMap((s) => s.rows);
const rowOf = (id: string) => rows.find((r) => r.id === id)!;
const EMPTY: AccessRules = normalizeAccessRules(null);

const VINAY = "vinay.bhojak@gpp.local";
const SANDEEP = "sandeep.parekh@gpp.local";
const KAPILA = "kapila.barad@gpp.local";
const RAGHUNATH = "raghunath.mane@gpp.local";
const ANKUR = "ankur.raval@gpp.local";

const person = (id: string, name: string, email: string, extra: Partial<MasterPerson> = {}): MasterPerson => ({ id, name, email, role: "staff", departments: [], active: true, removedAt: null, ...extra });
const PEOPLE: MasterPerson[] = [
  person("a", "Super Admin", "admin@gpp.local", { role: "admin" }),
  person("k", "Kapila Barad", KAPILA, { departments: ["QC"] }),
  person("v", "Vinay Bhojak", VINAY, { departments: ["HR"] }),
  person("s", "Sandeep Parekh", SANDEEP, { departments: ["HR"] }),
  person("r", "Raghunath Mane", RAGHUNATH, { departments: ["MNT"] }),
  person("n", "Ankur Raval", ANKUR, { departments: ["QC"] }),
  person("o", "Gone Off", "gone.off@gpp.local", { active: false }),
  person("x", "Removed One", "removed.one@gpp.local", { active: false, removedAt: "2026-10-12T06:00:00.000Z" }),
];

test("every document once, in the order and the columns of F/SYS/02", () => {
  assert.equal(rows.length, all.length, "every document of the catalogue");
  assert.equal(new Set(rows.map((r) => r.id)).size, all.length, "each once");
  // The module sections as the list runs them: SYS first, then Marketing, Purchase, Store, QC, QA, Production, ...
  assert.deepEqual(MASTER_SECTION_ORDER.slice(0, 7), ["SYS", "MKT", "PUR", "STR", "QC", "QA", "PRD"]);
  const order = sections.map((s) => s.module);
  assert.deepEqual(
    order,
    MASTER_SECTION_ORDER.filter((m) => order.includes(m)),
    "the sections in the list's order"
  );
  // The list's own Sr. No. and its method of recording.
  assert.equal(FORMAT_LIST_ROWS.length, 141);
  assert.equal(rowOf("sys-format-list").srNo, 2, "F/SYS/02 is the second line of itself");
  assert.equal(rowOf("qc-inprocess-printing").srNo, 43, "F-QC-13");
  assert.equal(rowOf("qc-bopp-film").srNo, 31, "F-QC-01");
  assert.equal(rowOf("qc-bopp-film").recording, "SAP", "F-QC-01's method of recording");
  assert.equal(rowOf("mnt-pm-record").srNo, 107, "F-MNT-02");
  assert.equal(rowOf("daily-pest-monitoring").srNo, 133, "F-HR-17");
  assert.equal(rowOf("qc-viscosity").srNo, rowOf("qc-minutes-of-meetings").srNo, "F-QC-30 and F/QC/30 are one line of the list");
  assert.equal(rowOf("capa-complaint-ack")?.srNo, FORMAT_LIST_ROWS.findIndex((r) => r.formatNumber === "F-MKT-06") + 1, "the acknowledgement is F-MKT-06 on the list");
  assert.equal(rowOf("qc-inprocess-printing").frequency, "Daily");
  // Within a section: by Sr. No., the documents the list does not name after them by name.
  for (const s of sections) {
    const listed = s.rows.filter((r) => r.srNo !== null).map((r) => r.srNo!);
    assert.deepEqual(listed, listed.slice().sort((a, b) => a - b), `${s.module} by Sr. No.`);
    const firstUnlisted = s.rows.findIndex((r) => r.srNo === null);
    if (firstUnlisted >= 0) assert.ok(s.rows.slice(firstUnlisted).every((r) => r.srNo === null), `${s.module}: the unlisted last`);
  }
  assert.equal(rowOf("service-report-rodent").srNo, null, "a pest control paper with no number is on no line");
  assert.equal(rowOf("service-report-rodent").formatNo, "", "and shows no number");
  assert.ok(rowOf("chemical-master").reference, "the chemical chart is kept as issued");
});

test("a cell is the level Users & Access gives, plain from the owner's table and bold where the super admin set it", () => {
  const rules = normalizeAccessRules({
    version: 1,
    people: { [VINAY]: { modules: { QC: "read" }, documents: { "qc-viscosity": "write" } } },
    responsibility: {},
  });
  const access = masterAccess(sections, rules);
  const usersAndAccess = buildAccess(docs, rules);
  const vinay = PEOPLE[2];
  for (const r of rows) {
    for (const p of masterColumns(PEOPLE)) {
      assert.equal(cellOf(rules, access, p, r).level, usersAndAccess.level({ email: p.email, role: p.role, departments: p.departments }, r.id), `${p.name} on ${r.id}`);
    }
  }
  assert.deepEqual(cellOf(rules, access, vinay, rowOf("qc-viscosity")), { level: "write", set: "document" });
  assert.deepEqual(cellOf(rules, access, vinay, rowOf("qc-bopp-film")), { level: "read", set: "module" });
  assert.deepEqual(cellOf(rules, access, vinay, rowOf("hr-competence")), { level: "edit", set: null }, "the owner's table: he fills F/HR/01");
  assert.deepEqual(cellOf(rules, access, vinay, rowOf("mnt-pm-record")), { level: "none", set: null });
  // "Back to the table": what the drawer of Users & Access calls "as the module".
  assert.equal(levelWithoutOwn(rules, docs, vinay, "qc-viscosity"), "read");
  assert.equal(levelWithoutOwn(rules, docs, vinay, "qc-viscosity"), documentDefaults(rules, docs, vinay).level({ email: VINAY, role: "staff", departments: ["HR"] }, "qc-viscosity"));
});

test("the columns: the active staff by name; the super admins apart; nobody switched off or removed", () => {
  assert.deepEqual(
    masterColumns(PEOPLE).map((p) => p.name),
    ["Ankur Raval", "Kapila Barad", "Raghunath Mane", "Sandeep Parekh", "Vinay Bhojak"]
  );
  assert.deepEqual(
    masterBosses(PEOPLE).map((p) => p.name),
    ["Super Admin"]
  );
});

test("the filters: a module, a person, nobody fills it, words", () => {
  const access = masterAccess(sections, EMPTY);
  const qc = filterRows(sections, { ...NO_FILTER, module: "QC" }, access, PEOPLE);
  assert.deepEqual(
    qc.map((s) => s.module),
    ["QC"]
  );
  assert.ok(qc[0].rows.some((r) => r.id === "qc-inprocess-printing"));
  // A person: what they fill or see; with "every document", all of them.
  const vinay = filterRows(sections, { ...NO_FILTER, person: VINAY }, access, PEOPLE).flatMap((s) => s.rows.map((r) => r.id));
  assert.ok(vinay.includes("hr-competence"));
  assert.ok(!vinay.includes("qc-inprocess-printing"), "Vinay Bhojak does not see Quality Control by the owner's table");
  const every = filterRows(sections, { ...NO_FILTER, person: VINAY, every: true }, access, PEOPLE).flatMap((s) => s.rows);
  assert.equal(every.length, rows.length);
  // Words: a format number however it is written, or a word of the name.
  const found = filterRows(sections, { ...NO_FILTER, find: "f-qc-13" }, access, PEOPLE).flatMap((s) => s.rows.map((r) => r.id));
  assert.ok(found.includes("qc-inprocess-printing"), JSON.stringify(found));
  assert.ok(
    filterRows(sections, { ...NO_FILTER, find: "viscosity" }, access, PEOPLE)
      .flatMap((s) => s.rows)
      .some((r) => r.id === "qc-viscosity")
  );
  // Nobody fills this: with the owner's table as it is, only the documents it names nobody for (never one kept as issued).
  const nobodyNow = filterRows(sections, { ...NO_FILTER, nobody: true }, access, PEOPLE).flatMap((s) => s.rows);
  assert.ok(nobodyNow.every((r) => !r.reference && access.responsible(r.id).length === 0));
  // Raghunath Mane removed: F/MNT/02 to F/MNT/08 have nobody.
  const removed = masterAccess(sections, normalizeAccessRules({ version: 1, people: {}, responsibility: {}, removed: [RAGHUNATH] }));
  const nobody = filterRows(sections, { ...NO_FILTER, nobody: true }, removed, PEOPLE).flatMap((s) => s.rows.map((r) => r.id));
  assert.ok(nobody.includes("mnt-pm-record"), "F/MNT/02's only answerer removed: Nobody fills this");
  assert.ok(!nobody.includes("hr-competence"));
});

test("a level on many documents at once, and back to the table", () => {
  const ids = ["qc-inprocess-printing", "qc-bopp-film", "qc-viscosity"];
  const given = setLevels(EMPTY, docs, VINAY, ids, "write");
  assert.deepEqual(given.people[VINAY]?.documents, { "qc-inprocess-printing": "write", "qc-bopp-film": "write", "qc-viscosity": "write" });
  const access = masterAccess(sections, given);
  for (const id of ids) assert.deepEqual(cellOf(given, access, PEOPLE[2], rowOf(id)), { level: "write", set: "document" });
  const back = setLevels(given, docs, VINAY, ids, null);
  assert.equal(back.people[VINAY]?.documents, undefined);
  assert.deepEqual(EMPTY, normalizeAccessRules(null), "nothing handed in is changed");
});

test("who fills a document: the main person first, the table's own list stored as nothing, nobody", () => {
  // F/QC/01, Kapila Barad's by the owner's table.
  const two = setFillers(EMPTY, docs, "qc-bopp-film", [ANKUR, KAPILA]);
  assert.deepEqual(two.responsibility["qc-bopp-film"], [ANKUR, KAPILA]);
  assert.deepEqual(buildAccess(docs, two).responsible("qc-bopp-film"), [ANKUR, KAPILA], "Ankur Raval the main person");
  assert.equal(buildAccess(docs, two).level({ email: ANKUR, role: "staff" }, "qc-bopp-film"), "edit", "who fills it has Edit on it");
  const table = setFillers(two, docs, "qc-bopp-film", [KAPILA]);
  assert.equal(table.responsibility["qc-bopp-film"], undefined, "the owner's table again: nothing stored");
  const nobody = setFillers(EMPTY, docs, "qc-bopp-film", []);
  assert.deepEqual(nobody.responsibility["qc-bopp-film"], []);
  assert.deepEqual(buildAccess(docs, nobody).responsible("qc-bopp-film"), []);
});

test("one person made the one who fills many documents, or added to who fills them; never a document kept as issued", () => {
  const ids = ["hr-competence", "hr-skill-matrix", "chemical-master"];
  const only = fillMany(EMPTY, docs, KAPILA, ids, "only");
  assert.deepEqual(only.responsibility["hr-competence"], [KAPILA]);
  assert.deepEqual(only.responsibility["hr-skill-matrix"], [KAPILA]);
  assert.equal(only.responsibility["chemical-master"], undefined);
  const add = fillMany(EMPTY, docs, KAPILA, ids, "add");
  assert.deepEqual(add.responsibility["hr-competence"], [VINAY, SANDEEP, KAPILA], "after those already named");
  const again = fillMany(add, docs, KAPILA, ids, "add");
  assert.deepEqual(again.responsibility["hr-competence"], [VINAY, SANDEEP, KAPILA], "once");
});

test("fast: every cell of the catalogue by a dozen people", () => {
  const many: MasterPerson[] = Array.from({ length: 12 }, (_, i) => person(`p${i}`, `Person ${i}`, `person.${i}@gpp.local`));
  const rules = setLevels(EMPTY, docs, "person.3@gpp.local", rows.slice(0, 40).map((r) => r.id), "read");
  const started = performance.now();
  const access = masterAccess(sections, rules);
  let n = 0;
  for (const r of rows) for (const p of many) if (cellOf(rules, access, p, r).level) n += 1;
  const took = performance.now() - started;
  assert.equal(n, rows.length * 12);
  assert.ok(took < 400, `${n} cells in ${took.toFixed(1)} ms`);
});
