// THE ACCESS RULES IN THE APP (REQUIREMENTS §96): what each person is shown, offered and counted for.
//
// engine/accessRules.ts decides who answers for each document and what Read, Write and Edit allow
// (frontend/tests/accessRules.test.ts holds it to the owner's table). These tests hold the APP to it, through the
// one rule every screen reads (engine/departmentScope.ts, set by store/AuthContext.tsx setAccessScope):
//   * the two repositories show a person only the documents at Read or more; the super admin sees all;
//   * mayDo answers each step by the level, and the refusal says in English, Gujarati and Hindi which level it needs;
//   * the reminders, the briefing and the daily nudge count what the person answers for, and what they may verify;
//   * what the browser writes by itself (the month's blank sheets, the prepare) is kept to what the person may fill;
//   * the scorecard counts a record against the people who answer for its document;
//   * the super admin's stored settings win, a stale account keeps what it had, and with nobody signed in (the engine
//     host, every other test) nothing changes.
// Run: npm run test:unit -- accessScope
import test from "node:test";
import assert from "node:assert/strict";
import type { RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded, masterRepository } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { departmentOfDocument } from "../src/data/seed/departments";
import {
  answersForIds,
  departmentScope,
  documentLevel,
  isBossSignedIn,
  isDocumentIdVisible,
  isMine,
  mayDo,
  mayWriteRecordsOf,
  scoreAnswerRule,
  seesEveryDepartment,
  setAccessRules,
  setAccessScope,
  setDepartmentScope,
} from "../src/engine/departmentScope";
import { LEVEL_WORDS, type AccessAccount } from "../src/engine/accessRules";
import { LEVEL_NAMES, languageOfWords, refusalSentence } from "../src/engine/accessWords";
import { refusalFor } from "../src/engine/accessRefusal";
import { computeReminders } from "../src/engine/reminders";
import { computeBriefing } from "../src/engine/assistantBriefing";
import { ensureRecordsGeneratedForMonth } from "../src/engine/recordGenerator";
import { createDefaultData } from "../src/engine/recordDefaults";
import { scorecards, type Person } from "../src/engine/performance";
import { addDays, todayISO } from "../src/utils/date";
import { isCompanyHoliday } from "../src/engine/holidays";

ensureDocumentsSeeded();
ensureMasterSeeded();

const KAPILA: AccessAccount = { email: "kapila.barad@gpp.local", role: "staff", departments: ["QC"] };
const VINAY: AccessAccount = { email: "vinay.bhojak@gpp.local", role: "staff", departments: ["HR"] };
const ANKUR: AccessAccount = { email: "ankur.raval@gpp.local", role: "staff", departments: [] };
const ZALA: AccessAccount = { email: "ajay.zala@gpp.local", role: "staff", departments: [] };
const BOSS: AccessAccount = { email: "admin@gpp.local", role: "admin", departments: [] };

function as<T>(who: AccessAccount | null, rules: unknown, run: () => T): T {
  setAccessScope(who, rules);
  try {
    return run();
  } finally {
    setDepartmentScope(null);
    setAccessRules(null);
  }
}

const moduleOf = (id: string): string | null => departmentOf(id);
const departmentOf = (id: string): string | null => {
  const d = documentRepository.getAllUnscoped().find((x) => x.id === id);
  return d ? departmentOfDocument(d.id, d.formatNo) : null;
};

test("with nobody signed in (the engine host, the other tests) nothing is held back", () => {
  setDepartmentScope(null);
  assert.equal(departmentScope(), null);
  assert.ok(seesEveryDepartment());
  assert.equal(documentRepository.getAll().length, documentRepository.getAllUnscoped().length);
  assert.ok(mayDo("qc-viscosity", "delete"));
  assert.ok(mayWriteRecordsOf("qc-viscosity"));
  assert.equal(answersForIds(), null);
  // The old department scope still works the old way, for the engine host.
  setDepartmentScope(["MNT"]);
  try {
    assert.ok(documentRepository.getAll().every((d) => departmentOfDocument(d.id, d.formatNo) === "MNT" || departmentOfDocument(d.id, d.formatNo) === null));
    assert.ok(mayWriteRecordsOf("hr-competence"), "the engine host's own writes are not kept to a department");
  } finally {
    setDepartmentScope(null);
  }
});

test("Vinay Bhojak sees Human Resources only: Edit on what Vinay answers for, Read on Kapila Barad's HR documents", () => {
  as(VINAY, null, () => {
    const shown = documentRepository.getAll();
    assert.ok(shown.length > 0);
    assert.deepEqual(Array.from(new Set(shown.map((d) => departmentOfDocument(d.id, d.formatNo)))), ["HR"]);
    assert.deepEqual(departmentScope(), ["HR"]);
    assert.equal(documentLevel("hr-competence"), "edit");
    assert.equal(documentLevel("hr-daily-cleaning"), "read");
    assert.equal(documentLevel("qc-viscosity"), "none");
    assert.equal(isDocumentIdVisible("qc-viscosity"), false);
    assert.equal(documentRepository.getById("qc-viscosity"), undefined);
    assert.ok(mayDo("hr-competence", "submit"));
    assert.ok(!mayDo("hr-daily-cleaning", "start"));
    assert.ok(mayDo("hr-daily-cleaning", "view"));
    assert.ok(isMine("hr-competence"));
    assert.ok(!isMine("hr-daily-cleaning"), "Kapila Barad answers for F/HR/15");
    assert.ok(answersForIds()?.has("hr-competence"));
    assert.ok(!mayWriteRecordsOf("hr-daily-cleaning"), "the browser never writes what Vinay may only read");
  });
});

test("Kapila Barad sees every module, with Edit in Quality Control and SYS and Read elsewhere", () => {
  as(KAPILA, null, () => {
    assert.equal(departmentScope(), null, "Kapila Barad sees all ten modules");
    assert.equal(documentRepository.getAll().length, documentRepository.getAllUnscoped().length);
    assert.equal(documentLevel("qc-inprocess-printing"), "edit", "QC is hers to edit, even Ajay Zala's F/QC/13");
    assert.equal(documentLevel("prd-alc-production"), "read");
    assert.ok(!mayDo("prd-alc-production", "start"));
    assert.ok(!isMine("qc-inprocess-printing"), "Ajay Zala answers for F/QC/13");
    assert.ok(isMine("daily-pest-monitoring"));
  });
});

test("the super admin sees and does everything, and every record is the boss's to see", () => {
  as(BOSS, null, () => {
    assert.ok(isBossSignedIn());
    assert.equal(departmentScope(), null);
    assert.ok(mayDo("prd-alc-production", "delete"));
    assert.ok(mayDo("qc-viscosity", "format"));
    assert.ok(isMine("prd-alc-production"));
    assert.equal(answersForIds(), null);
  });
});

test("what the super admin stored wins: a module at Edit, a document taken away", () => {
  const rules = { version: 1, people: { "ankur.raval@gpp.local": { modules: { PRD: "edit" }, documents: { "qc-viscosity": "read" } } }, responsibility: {} };
  as(ANKUR, rules, () => {
    assert.ok(mayDo("prd-alc-production", "start"));
    assert.ok(mayDo("prd-alc-production", "delete"));
    assert.equal(documentLevel("qc-viscosity"), "read");
    assert.ok(!mayDo("qc-viscosity", "submit"));
    assert.ok(!isMine("qc-viscosity"), "a person needs Write to answer for a document");
  });
  // The same person with nothing stored: the owner's table.
  as(ANKUR, null, () => {
    assert.equal(documentLevel("prd-alc-production"), "none");
    assert.equal(documentLevel("qc-viscosity"), "edit");
  });
});

test("an account nobody has described keeps what it had: its departments, at Edit", () => {
  const stranger: AccessAccount = { email: "operator.one@gpp.local", role: "staff", departments: ["MNT"] };
  as(stranger, null, () => {
    assert.deepEqual(departmentScope(), ["MNT"]);
    assert.equal(documentLevel("mnt-pm-record"), "edit");
    assert.equal(documentLevel("hr-competence"), "none");
    assert.ok(isMine("mnt-pm-record"), "it answers for nothing by name, so its work is what it may fill");
    assert.equal(answersForIds(), null);
  });
});

test("a refusal names the level the step needs, in English, Gujarati and Hindi, with no pronoun for the person", () => {
  as(VINAY, null, () => {
    const en = refusalFor("hr-daily-cleaning", "start", "en")!;
    assert.match(en, /Read only for you/);
    assert.match(en, /Write access/);
    assert.match(en, /super admin/);
    assert.doesNotMatch(en, /\b(he|she|his|her|him)\b/i);
    const gu = refusalFor("hr-daily-cleaning", "start", "gu")!;
    assert.match(gu, /[઀-૿]/);
    assert.match(gu, /Write/);
    const hi = refusalFor("hr-daily-cleaning", "submit", "hi")!;
    assert.match(hi, /[ऀ-ॿ]/);
    assert.match(hi, /Write/);
    assert.equal(refusalFor("hr-competence", "submit", "en"), null, "nothing to say when the step is allowed");
    assert.match(refusalFor("qc-viscosity", "view", "en")!, /do not have access/);
  });
  // Write, where the step needs Edit.
  as(ZALA, null, () => {
    const words = refusalSentence("en", "F/QC/13 In-Process", "write", "edit", "delete");
    assert.match(words, /You have Write access to F\/QC\/13/);
    assert.match(words, /Deleting a record needs Edit access/);
  });
  for (const level of ["none", "read", "write", "edit"] as const) assert.equal(LEVEL_NAMES.en[level], LEVEL_WORDS[level].name, `the English name of ${level} is accessRules.ts's`);
  assert.equal(languageOfWords("मेरा रिकॉर्ड जमा करो", "en"), "hi");
  assert.equal(languageOfWords("રેકોર્ડ જમા કરો", "en"), "gu");
  assert.equal(languageOfWords("submit it", "gu"), "gu");
});

test("what the browser makes by itself is kept to what the person may fill", () => {
  const now = new Date();
  // A month nobody has generated: two years ahead.
  const year = now.getFullYear() + 2;
  const made = as(VINAY, null, () => ensureRecordsGeneratedForMonth(year, 0, {}));
  assert.ok(made.length > 0, "Vinay's own sheets are made");
  as(VINAY, null, () => {
    for (const r of made) assert.ok(mayDo(r.documentId, "fill"), `${r.documentId} was made from Vinay's browser but is not Vinay's to fill`);
  });
  assert.ok(made.every((r) => moduleOf(r.documentId) === "HR"));
  // The super admin's browser makes the rest of the month.
  const rest = as(BOSS, null, () => ensureRecordsGeneratedForMonth(year, 0, {}));
  assert.ok(rest.some((r) => moduleOf(r.documentId) !== "HR"), "the boss's browser makes the plant's other sheets");
});

function shell(documentId: string, dueDate: string, status: RecordInstance["status"], extra: Partial<RecordInstance> = {}): RecordInstance {
  const doc = documentRepository.getAllUnscoped().find((d) => d.id === documentId)!;
  return {
    id: `acc-${documentId}-${dueDate}-${status}`.replace(/\s+/g, ""),
    documentId,
    periodKey: `${documentId}:acc:${dueDate}:${status}`,
    dueDate,
    status,
    isDemo: false,
    data: createDefaultData(doc, dueDate, masterRepository.get()),
    createdAt: `${dueDate}T03:00:00.000Z`,
    updatedAt: `${dueDate}T03:00:00.000Z`,
    ...extra,
  };
}

test("the reminders and the briefing count what the person answers for, and what they may verify", () => {
  // On the real clock: the next working day from today (never a Thursday off or a festival holiday), so the reminder fires.
  const today = todayISO();
  let working = today;
  for (let i = 0; i < 10 && isCompanyHoliday(working, masterRepository.get()); i++) working = addDays(working, 1);
  recordRepository.upsertMany([
    shell("hr-competence", working, "Due"),
    shell("hr-daily-cleaning", working, "Due"),
    shell("hr-competence", today, "Pending Verification", { submittedAt: `${today}T05:00:00.000Z`, submittedBy: "Sandeep Parekh" }),
    shell("hr-daily-cleaning", today, "Pending Verification", { submittedAt: `${today}T05:00:00.000Z`, submittedBy: "Kapila Barad" }),
  ]);
  as(VINAY, null, () => {
    const reminders = computeReminders(false);
    assert.ok(reminders.some((r) => r.documentId === "hr-competence"));
    assert.ok(!reminders.some((r) => r.documentId === "hr-daily-cleaning"), "Kapila Barad's F/HR/15 is not Vinay's to be reminded of");
    assert.ok(reminders.every((r) => isMine(r.documentId)));
    const b = computeBriefing("Vinay Bhojak");
    assert.ok(b.awaitingVerification.some((i) => i.documentId === "hr-competence"));
    assert.ok(!b.awaitingVerification.some((i) => i.documentId === "hr-daily-cleaning"), "Read only: not Vinay's to verify");
    assert.ok(!b.overdue.some((i) => i.documentId === "hr-daily-cleaning"));
  });
  as(KAPILA, null, () => {
    const reminders = computeReminders(false);
    assert.ok(reminders.some((r) => r.documentId === "hr-daily-cleaning"));
    assert.ok(!reminders.some((r) => r.documentId === "hr-competence"));
  });
  as(BOSS, null, () => {
    const reminders = computeReminders(false);
    assert.ok(reminders.some((r) => r.documentId === "hr-competence") && reminders.some((r) => r.documentId === "hr-daily-cleaning"));
  });
});

test("the scorecard counts a record against the people who answer for its document", () => {
  const today = todayISO();
  const due = addDays(today, -3);
  const docs = documentRepository.getAllUnscoped().filter((d) => ["qc-inprocess-printing", "qc-bopp-film"].includes(d.id));
  const records = [shell("qc-inprocess-printing", due, "Due"), shell("qc-bopp-film", due, "Due")];
  const people: Person[] = [
    { id: "k", name: "Kapila Barad", role: "staff", departments: ["QC"] },
    { id: "z", name: "Ajay Zala", role: "staff", departments: [] },
    { id: "a", name: "Super Admin", role: "admin", departments: [] },
  ];
  const range = { from: addDays(today, -10), to: today };
  // By the rules: F/QC/13 is Ajay Zala's, F/QC/01 Kapila Barad's.
  const byRules = as(BOSS, null, () => scorecards(records, docs, people, range, today, undefined, scoreAnswerRule()));
  const card = (id: string) => byRules.byPerson.find((p) => p.person.id === id)!;
  assert.equal(card("z").overdue, 1, "Ajay Zala answers for F/QC/13");
  assert.deepEqual(card("z").departments, ["QC"]);
  assert.equal(card("k").overdue, 1, "Kapila Barad answers for F/QC/01 only");
  assert.equal(card("a").answers, false, "the super admin answers for none");
  // With nobody signed in, the department rule, as before: both QC records count against Kapila Barad's account.
  const byDepartment = scorecards(records, docs, people, range, today, undefined, null);
  assert.equal(byDepartment.byPerson.find((p) => p.person.id === "k")!.overdue, 2);
  assert.equal(byDepartment.byPerson.find((p) => p.person.id === "z")!.answers, false);
});
