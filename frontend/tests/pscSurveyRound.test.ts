// F/HR/20 EVERY JANUARY, ABOUT 200 PEOPLE FROM HR MASTER DATA; AND NAMES LOOKED UP FAST (REQUIREMENTS §266; the owner,
// 20-Nov-2026: "in HR-20 consider 200 people which include director, HOD, operator, Assistant operator, executive, helper
// 3 to 4 ... fetch it from master data ... must process fast ... hr-20 is every year system will fill record in january").
//   * F/HR/20 is yearly, due 31 January; the year's round is 200 forms: every director and HOD, the staff and operators by
//     rank, three or four helpers (a different few each year), a guard / driver / sweeper / peon only to make up the 200,
//     nobody who joins later;
//   * each form is its person's - name, department, designation as HR Master Data has them, the date, the GP3 mark - with
//     every answer left for the person; made once (a second January, a deleted form, never make it again); Live only;
//   * New on F/HR/20 starts a form for one more person each time; the round is one reminder, not two hundred;
//   * the name index answers as the old full search did, for every person, alias and GP3 No., and a 200-line register
//     is looked up in a few milliseconds.
// Run: npm run test:unit -- pscSurveyRound
import test from "node:test";
import assert from "node:assert/strict";
import type { HrMasterPerson, LogSheetData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrSeeded, hrMasterRepository } from "../src/data/repositories/hrMasterRepository";
import { ensureSeeded as ensureRecordsSeeded, recordRepository } from "../src/data/repositories/recordRepository";
import { ensureRecordsGeneratedForMonth } from "../src/engine/recordGenerator";
import { newRecordFromButton } from "../src/engine/newRecord";
import { deleteRecordWithTrail } from "../src/engine/recordCrud";
import { PSC_ROUND_SIZE, PSC_SURVEY_DOC, isRoundForm, roundDateOf, surveyPeople, surveyRank } from "../src/engine/pscSurveyRound";
import { fillBlanksFromMaster, gp3Key, hrMasterLinkFor, nameKey, namesPerson, personNamed, sameGp3, searchPeople } from "../src/engine/hrMaster";
import { registerFills } from "../src/engine/hrMasterRegisters";
import { prepareDueRecords } from "../src/engine/assistantPrepare";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrSeeded();
ensureRecordsSeeded();

const people = hrMasterRepository.all();
const header = (r: RecordInstance): Record<string, unknown> => (r.data as LogSheetData).header ?? {};
const round = (scheduled: string): RecordInstance[] =>
  recordRepository
    .queryUnscoped({ documentId: PSC_SURVEY_DOC, isDemo: false })
    .filter((r) => roundDateOf(r) === scheduled)
    .sort((a, b) => a.periodKey.localeCompare(b.periodKey));

test("F/HR/20 is a yearly document, due on 31 January", () => {
  const doc = documentRepository.getByIdUnscoped(PSC_SURVEY_DOC)!;
  assert.deepEqual(doc.schedule, { type: "yearly", month: 0, dayOfMonth: 31 });
  assert.equal(doc.frequency, "Yearly");
});

test("the round: 200 people - every director and HOD, staff and operators, three or four helpers, a guard or driver only to make up the 200", () => {
  const chosen = surveyPeople(people, "2027-01-30");
  assert.equal(chosen.length, PSC_ROUND_SIZE);
  assert.equal(new Set(chosen.map((p) => p.id)).size, chosen.length, "nobody twice");
  const ranks = chosen.map((p) => surveyRank(p.designation));
  const helpers = ranks.filter((r) => r === "helper").length;
  assert.ok(helpers >= 3 && helpers <= 4, `three or four helpers, got ${helpers}`);
  // Guards, drivers, sweepers, peons only to make up the 200.
  const core = people.filter((p) => typeof surveyRank(p.designation) === "number").length;
  assert.equal(ranks.filter((r) => r === "out").length, Math.max(0, PSC_ROUND_SIZE - core - helpers), "guards, drivers ... only to make up the 200");
  for (const role of ["director", "hod"]) {
    const all = people.filter((p) => new RegExp(`\\b${role}\\b`).test(nameKey(p.designation)));
    assert.ok(all.length > 0, role);
    assert.ok(all.every((p) => chosen.includes(p)), `every ${role}`);
  }
  for (const role of ["executive", "operator", "assistant", "manager"]) assert.ok(chosen.some((p) => nameKey(p.designation).includes(role)), role);
  // Nobody who joins after the survey.
  const late: HrMasterPerson = { ...people.find((p) => nameKey(p.designation) === "director")!, id: "late", fullName: "Late Joiner", gp3No: "GP3.999", joiningDate: "2027-03-01" };
  assert.ok(!surveyPeople([late, ...people], "2027-01-30").some((p) => p.id === "late"));
  // A different few helpers each year; the same few every time for one year.
  const helpersOf = (date: string) => surveyPeople(people, date).filter((p) => surveyRank(p.designation) === "helper").map((p) => p.id).join();
  assert.equal(helpersOf("2027-01-30"), helpersOf("2027-01-30"));
  assert.notEqual(helpersOf("2027-01-30"), helpersOf("2028-01-31"));
});

test("January's generation makes the year's 200 forms, each its person's from HR Master Data, the answers left blank; once", () => {
  const made = ensureRecordsGeneratedForMonth(2027, 0, { documentIds: [PSC_SURVEY_DOC] });
  const forms = made.filter(isRoundForm);
  assert.equal(forms.length, PSC_ROUND_SIZE);
  const scheduled = roundDateOf(forms[0])!;
  assert.equal(scheduled, "2027-01-31");
  assert.equal(round(scheduled).length, PSC_ROUND_SIZE, "stored");
  for (const r of forms) {
    const h = header(r);
    const person = personNamed(h.employeeName, people)!;
    assert.ok(person, `${String(h.employeeName)} is on HR Master Data`);
    assert.equal(h.department, person.department);
    assert.equal(h.designation, person.designation);
    assert.equal(h.surveyDate, r.dueDate);
    assert.ok(r.dueDate.startsWith("2027-01"), "dated in January");
    assert.equal(r.status, "Due");
    const rows = (r.data as LogSheetData).rows;
    assert.equal(rows.length, 15, "the fifteen attributes");
    assert.ok(rows.every((row) => !String(row.response ?? "").trim()), "every answer is the person's");
  }
  // Prepared already: the morning's preparation leaves them as they are.
  const before = JSON.stringify(round(scheduled).map((r) => r.data));
  prepareDueRecords("2027-01-31");
  assert.equal(JSON.stringify(round(scheduled).map((r) => r.data)), before);
  // Made once: a second generation, and one after a form is deleted, make nothing.
  assert.equal(ensureRecordsGeneratedForMonth(2027, 0, { documentIds: [PSC_SURVEY_DOC] }).length, 0);
  deleteRecordWithTrail(round(scheduled)[5], "Test", "left the company");
  assert.equal(ensureRecordsGeneratedForMonth(2027, 0, { documentIds: [PSC_SURVEY_DOC] }).length, 0);
  assert.equal(round(scheduled).length, PSC_ROUND_SIZE - 1);
  // Other months make none; Demo Mode makes none.
  assert.equal(ensureRecordsGeneratedForMonth(2027, 1, { documentIds: [PSC_SURVEY_DOC] }).length, 0);
  assert.equal(ensureRecordsGeneratedForMonth(2027, 0, { documentIds: [PSC_SURVEY_DOC], isDemo: true }).length, 0);
});

test("New on F/HR/20 starts a form for one more person every time", () => {
  const doc = documentRepository.getByIdUnscoped(PSC_SURVEY_DOC)!;
  const a = newRecordFromButton(doc, false, "2027-02-10");
  const b = newRecordFromButton(doc, false, "2027-02-10");
  assert.equal(a.existed, false);
  assert.equal(b.existed, false);
  assert.notEqual(a.record.id, b.record.id);
  assert.ok(!isRoundForm(a.record));
});

test("the name index finds exactly who the full search found - every name, other spelling and GP3 No.", () => {
  const brute = (value: unknown): HrMasterPerson | null => {
    const byName = people.filter((p) => namesPerson(value, p));
    if (byName.length === 1) return byName[0];
    if (byName.length > 1) return null;
    const byNumber = people.filter((p) => sameGp3(p.gp3No, value));
    return byNumber.length === 1 ? byNumber[0] : null;
  };
  const asked = [
    ...people.map((p) => p.fullName),
    ...people.flatMap((p) => p.aliases ?? []),
    ...people.map((p) => p.gp3No),
    ...people.map((p) => gp3Key(p.gp3No)),
    ...people.map((p) => `Mr. ${p.fullName.toUpperCase()}`),
    "Nobody Atall",
    "",
    "1",
    "0001",
  ];
  for (const q of asked) assert.equal(personNamed(q, people)?.id ?? null, brute(q)?.id ?? null, q);
  // The start of a name still finds them.
  const first = people.find((p) => p.fullName.split(" ").length >= 2)!;
  const [w1, w2] = nameKey(first.fullName).split(" ");
  assert.ok(searchPeople(`${w1.slice(0, 3)} ${w2.slice(0, 2)}`, people).candidates.some((p) => p.id === first.id));
});

test("a 200-line register is looked up in milliseconds, keystroke after keystroke", () => {
  const link = hrMasterLinkFor("hr-skill-matrix")!;
  const rows = people.slice(0, 200).map((p, i) => ({ id: `r${i}`, [link.nameField]: p.fullName }));
  const data = { header: {}, rows } as unknown as LogSheetData;
  const t = performance.now();
  for (let i = 0; i < 20; i++) {
    registerFills(link, data, hrMasterRepository.all());
    fillBlanksFromMaster(link, data, hrMasterRepository.all());
  }
  const each = (performance.now() - t) / 20;
  assert.ok(each < 25, `${each.toFixed(1)} ms a keystroke`);
});
