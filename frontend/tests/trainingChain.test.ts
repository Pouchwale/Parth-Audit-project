// THE TRAINING CHAIN MAKES AND FILLS ITS OWN RECORDS (REQUIREMENTS §337; the owner, 25-Nov-2026: "hr-09 is connected with
// hr-10 and hr-10 is connected with hr-11 and hr-11 is connected with hr-12 ... all the name inside there and other fields
// should be fill out automatically when any one is filled and in hr-09 data will come from master data"):
//   * F/HR/09's Source of Training: a person on HR Master Data is written with their post;
//   * F/HR/09 -> F/HR/10: a training held since 25-Nov-2026 has its record, with everybody F/HR/08 marks for its topic;
//   * F/HR/10 -> F/HR/11 and F/HR/12 once a person has had F/HR/10 open: one evaluation each, one feedback record, score 3;
//   * a name added later follows; a record or line HR deletes is not made again; nothing a person wrote is changed.
// Run: npm run test:unit -- trainingChain
import test from "node:test";
import assert from "node:assert/strict";
import type { HrMasterPerson, LogSheetData, RecordInstance } from "../src/types";
import { ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrSeeded, hrMasterRepository } from "../src/data/repositories/hrMasterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { SEED_HR_TRAINING_CALENDAR } from "../src/data/seed/hrRecords";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { saveDraft } from "../src/engine/recordLifecycle";
import { EFFECTIVENESS_ID, FEEDBACK_ID, IMPARTED_ID, trainingFill, trainingsFor } from "../src/engine/trainingLinks";
import { TRAINING_CALENDAR_ID } from "../src/engine/trainingCalendar";
import {
  needsColumnFor,
  peopleNeeding,
  syncTrainingChain,
  trainerWithPost,
  TRAINING_NEEDS_ID,
  withPeopleNeeding,
} from "../src/engine/trainingChain";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrSeeded();

const DAY = "2026-11-30"; // CCP monitoring, November 2026, on the calendar on file
const live = (id: string): RecordInstance<LogSheetData>[] => recordRepository.queryUnscoped({ documentId: id, isDemo: false }) as RecordInstance<LogSheetData>[];
const clear = (...ids: string[]) => ids.forEach((id) => live(id).forEach((r) => recordRepository.remove(r.id)));
const put = (id: string, documentId: string, dueDate: string, data: LogSheetData, extra: Partial<RecordInstance> = {}): RecordInstance<LogSheetData> => {
  const now = new Date().toISOString();
  const r = { id, documentId, periodKey: `${documentId}:${dueDate}:${id}`, dueDate, status: "In Progress", isDemo: false, data, createdAt: now, updatedAt: now, ...extra } as RecordInstance<LogSheetData>;
  recordRepository.upsert(r as RecordInstance);
  return r;
};

// Three people on HR Master Data, each the only one of their name, with a post and a department.
const people = hrMasterRepository.all();
const unique = people.filter((p) => p.designation.trim() && p.department.trim() && p.fullName.trim().split(/\s+/).length >= 2 && people.filter((q) => q.fullName.trim().toLowerCase() === p.fullName.trim().toLowerCase()).length === 1);
const [A, B, C, D] = unique as [HrMasterPerson, HrMasterPerson, HrMasterPerson, HrMasterPerson];
const personNamedOnce = (name: string) => people.filter((p) => p.fullName.trim().toLowerCase() === name.trim().toLowerCase() || (p.aliases ?? []).some((x) => x.trim().toLowerCase() === name.trim().toLowerCase())).length === 1;

function setUp(): void {
  clear(IMPARTED_ID, EFFECTIVENESS_ID, FEEDBACK_ID, TRAINING_CALENDAR_ID, TRAINING_NEEDS_ID);
  recordRepository.upsert({ ...SEED_HR_TRAINING_CALENDAR, isDemo: false } as RecordInstance);
  const ccp = needsColumnFor("CCP monitoring", getLogSheetLayout(TRAINING_NEEDS_ID)!.columns.filter((c) => /^t\d+$/.test(c.key)))!;
  put("tni-2026", TRAINING_NEEDS_ID, "2026-04-01", {
    header: { period: "01-04-2026 ~ 31-03-2027" },
    rows: [
      { id: "n1", name: A.fullName, designation: "", [ccp]: "X" },
      { id: "n2", name: B.fullName, designation: "As F/HR/08 writes it", [ccp]: "X" },
      { id: "n3", name: C.fullName, designation: "", [ccp]: "" },
    ],
  });
}

test("F/HR/09's trainer from HR Master Data: a person's name is written with their post; anything else stays as typed", () => {
  assert.equal(trainerWithPost(A.fullName), `${A.fullName} (${A.designation})`);
  assert.equal(trainerWithPost(`  ${A.fullName.toUpperCase()}  `), `${A.fullName.toUpperCase()} (${A.designation})`, "the name as typed, the post from the sheet");
  const alias = hrMasterRepository.all().find((p) => p.designation.trim() && (p.aliases ?? []).some((x) => x.trim() && !/[()]/.test(x)) && personNamedOnce(p.aliases![0]));
  if (alias) assert.equal(trainerWithPost(alias.aliases![0]), `${alias.aliases![0].trim().replace(/\s+/g, " ")} (${alias.designation.trim()})`, "another spelling the sheet knows: kept as written");
  assert.equal(trainerWithPost("Kapila Barad(PSTL)"), "Kapila Barad(PSTL)", "a bracket: written by the person");
  assert.equal(trainerWithPost("External (Shashank Sheth)"), "External (Shashank Sheth)");
  assert.equal(trainerWithPost("Somebody Not On The Sheet"), "Somebody Not On The Sheet");
  assert.equal(trainerWithPost(""), "");
});

test("each calendar topic finds its F/HR/08 column by its words; a topic F/HR/08 does not hold finds none", () => {
  const cols = getLogSheetLayout(TRAINING_NEEDS_ID)!.columns.filter((c) => /^t\d+$/.test(c.key));
  const label = (topic: string) => cols.find((c) => c.key === needsColumnFor(topic, cols))?.label ?? null;
  assert.equal(label("TACCP Awareness"), "TACCP");
  assert.equal(label("Product safety Incidents"), "Product safety Incidents", "not Product safety Culture");
  assert.equal(label("Product Safety Culture"), "Product safety Culture");
  assert.equal(label("Testing Method & callibration of Instruments"), "Testing method & callibration of intruments");
  assert.equal(label("BRCGS - Packaging (Issue 07)Awareness"), "BRCGS - Packaging (Issue 07) Awareness");
  assert.equal(label("Awareness on process monitoring & process control parameters for Flexo printing"), "Awareness on process monitoring & process control");
  assert.equal(label("Pest control monitoring"), "Pest control monitoring");
  assert.equal(label("CCP monitoring"), "CCP monitoring");
  assert.equal(label("Awareness of Laundry policy (Laundry procedure)"), null);
});

test("F/HR/09 -> F/HR/10: the training held has its record, filled from the calendar, with F/HR/08's people and their posts", () => {
  setUp();
  assert.deepEqual(peopleNeeding("CCP monitoring", DAY, false).map((p) => p.name), [A.fullName, B.fullName]);
  // The day before: nothing is held yet (the Actual date is the 30th).
  syncTrainingChain({ today: "2026-11-29" });
  assert.equal(live(IMPARTED_ID).length, 0);
  const out = syncTrainingChain({ today: DAY });
  assert.equal(out.imparted.length, 1, "only CCP monitoring of 30-11-2026: the trainings before 25-Nov-2026 are left as they are");
  const [f10] = live(IMPARTED_ID);
  const h = f10.data.header;
  assert.deepEqual([h.trainingDate, h.topic, h.impartedBy, h.duration, h.method, h.evaluationMethod], [DAY, "CCP monitoring", "Ajay Vaghela (Flexo Manager)", "1 hour", "On the Job", "On the Job observation"]);
  const rows = f10.data.rows.filter((r) => String(r.name ?? "").trim());
  assert.deepEqual(rows.map((r) => [r.name, r.designation, r.department]), [
    [A.fullName, A.designation, A.department],
    [B.fullName, "As F/HR/08 writes it", B.department],
  ]);
  // Not checked by a person yet: no evaluation, no feedback.
  assert.equal(live(EFFECTIVENESS_ID).length, 0);
  assert.equal(live(FEEDBACK_ID).length, 0);
  // Again, and with the record deleted: never a second one.
  syncTrainingChain({ today: DAY });
  assert.equal(live(IMPARTED_ID).length, 1);
  recordRepository.remove(f10.id);
  syncTrainingChain({ today: "2026-12-01" });
  assert.equal(live(IMPARTED_ID).length, 0, "a record HR deleted is not made again");
});

test("F/HR/10 -> F/HR/11 and F/HR/12 once HR has had it open; a name added later follows; deletions stay deleted", () => {
  setUp();
  syncTrainingChain({ today: DAY });
  let [f10] = live(IMPARTED_ID);
  // HR opens it, strikes out nobody, and leaves.
  syncTrainingChain({ today: DAY, left: f10.id });
  const evaluations = live(EFFECTIVENESS_ID);
  assert.deepEqual(evaluations.map((r) => r.data.header.traineeName).sort(), [A.fullName, B.fullName].sort());
  const ofA = evaluations.find((r) => r.data.header.traineeName === A.fullName)!;
  assert.deepEqual([ofA.data.header.department, ofA.data.header.designation, ofA.data.header.trainingDate, ofA.data.header.trainingTopic, ofA.data.header.trainerName], [A.department, A.designation, DAY, "CCP monitoring", "Ajay Vaghela (Flexo Manager)"]);
  const [f12] = live(FEEDBACK_ID);
  assert.ok(f12, "the feedback record is made");
  assert.deepEqual([f12.data.header.trainingDate, f12.data.header.topic, f12.data.header.impartedBy, f12.data.header.duration], [DAY, "CCP monitoring", "Ajay Vaghela (Flexo Manager)", "1 hour"]);
  assert.deepEqual(f12.data.rows.filter((r) => r.name).map((r) => [r.name, r.rating]), [[A.fullName, "3"], [B.fullName, "3"]]);

  // Idempotent.
  const again = syncTrainingChain({ today: DAY });
  assert.deepEqual([again.imparted.length, again.evaluations.length, again.feedback.length, again.updated.length], [0, 0, 0, 0]);

  // A name added on F/HR/10: their own F/HR/11 and a line on F/HR/12.
  f10 = live(IMPARTED_ID)[0];
  saveDraft(f10, { ...f10.data, rows: [...f10.data.rows, { id: "late", name: D.fullName, department: "", designation: "", signature: "" }] }, "HR");
  syncTrainingChain({ today: DAY, left: f10.id });
  assert.ok(live(EFFECTIVENESS_ID).some((r) => r.data.header.traineeName === D.fullName && r.data.header.designation === D.designation));
  assert.ok(live(FEEDBACK_ID)[0].data.rows.some((r) => r.name === D.fullName && r.rating === "3"));

  // F/HR/11's answer on further training: F/HR/12's line says so, where it was blank.
  const ofB = live(EFFECTIVENESS_ID).find((r) => r.data.header.traineeName === B.fullName)!;
  saveDraft(ofB, { ...ofB.data, header: { ...ofB.data.header, furtherTraining: "Partly" } }, "HR");
  syncTrainingChain({ today: DAY });
  assert.equal(live(FEEDBACK_ID)[0].data.rows.find((r) => r.name === B.fullName)?.additionalTraining, "Yes");

  // Deleted by HR: an evaluation, a line on F/HR/12, the feedback record - none comes back.
  recordRepository.remove(live(EFFECTIVENESS_ID).find((r) => r.data.header.traineeName === A.fullName)!.id);
  const fb = live(FEEDBACK_ID)[0];
  saveDraft(fb, { ...fb.data, rows: fb.data.rows.filter((r) => r.name !== D.fullName) }, "HR");
  syncTrainingChain({ today: DAY });
  assert.ok(!live(EFFECTIVENESS_ID).some((r) => r.data.header.traineeName === A.fullName));
  assert.ok(!live(FEEDBACK_ID)[0].data.rows.some((r) => r.name === D.fullName));
  recordRepository.remove(live(FEEDBACK_ID)[0].id);
  syncTrainingChain({ today: DAY });
  assert.equal(live(FEEDBACK_ID).length, 0);

  // Nothing a person wrote is changed: a typed trainer on F/HR/11 stays.
  const ofD = live(EFFECTIVENESS_ID).find((r) => r.data.header.traineeName === D.fullName)!;
  saveDraft(ofD, { ...ofD.data, header: { ...ofD.data.header, trainerName: "Typed by HR" } }, "HR");
  syncTrainingChain({ today: DAY });
  assert.equal((recordRepository.getById(ofD.id) as RecordInstance<LogSheetData>).data.header.trainerName, "Typed by HR");
});

test("a submitted F/HR/12 is not touched; a sheet filed from paper, and an F/HR/10 from before 25-Nov-2026, feed nothing", () => {
  setUp();
  put("old", IMPARTED_ID, "2026-09-19", { header: { trainingDate: "2026-09-19", topic: "GMP Principles", chainChecked: "yes" }, rows: [{ id: "o1", name: A.fullName }] }, { createdAt: "2026-11-21T10:00:00.000Z" });
  put("paper", IMPARTED_ID, "2026-11-26", { header: { trainingDate: "2026-11-26", topic: "GMP Principles", chainChecked: "yes" }, rows: [{ id: "p1", name: A.fullName }] }, { filedFromPaper: true });
  syncTrainingChain({ today: DAY });
  assert.equal(live(EFFECTIVENESS_ID).length, 0);
  assert.equal(live(FEEDBACK_ID).length, 0);

  const f10 = live(IMPARTED_ID).find((r) => r.data.header.topic === "CCP monitoring")!;
  syncTrainingChain({ today: DAY, left: f10.id });
  const f12 = live(FEEDBACK_ID)[0];
  recordRepository.upsert({ ...f12, status: "Submitted" } as RecordInstance);
  const now = live(IMPARTED_ID).find((r) => r.id === f10.id)!;
  saveDraft(now, { ...now.data, rows: [...now.data.rows, { id: "late", name: C.fullName }] }, "HR");
  syncTrainingChain({ today: DAY });
  assert.ok(!live(FEEDBACK_ID)[0].data.rows.some((r) => r.name === C.fullName), "a submitted record is not changed");
  assert.ok(live(EFFECTIVENESS_ID).some((r) => r.data.header.traineeName === C.fullName), "the newcomer still has their evaluation");
});

test("F/HR/10 made by HR: choosing the training brings F/HR/08's people when it names nobody yet", () => {
  setUp();
  const filled = withPeopleNeeding({ header: { topic: "CCP monitoring", trainingDate: DAY }, rows: [{ id: "r1", name: "", designation: "" }] }, false);
  assert.deepEqual(filled.rows.map((r) => r.name), [A.fullName, B.fullName]);
  assert.equal(filled.rows[0].department, A.department);
  const named = { header: { topic: "CCP monitoring", trainingDate: DAY }, rows: [{ id: "r1", name: "Already Here" }] };
  assert.equal(withPeopleNeeding(named, false), named, "a sheet naming somebody is left as it is");
});

test("a sheet filed from the company's paper is never written on by the chain; choosing a training fills its method of evaluation", () => {
  setUp();
  syncTrainingChain({ today: DAY });
  const f10 = live(IMPARTED_ID)[0];
  const paper = put("paper-f12", FEEDBACK_ID, DAY, { header: { trainingDate: DAY, topic: "CCP monitoring" }, rows: [{ id: "pp", name: "As On The Paper", rating: "2" }] }, { filedFromPaper: true });
  syncTrainingChain({ today: DAY, left: f10.id });
  assert.equal(live(FEEDBACK_ID).length, 1, "no second F/HR/12 beside the paper's");
  assert.deepEqual((recordRepository.getById(paper.id) as RecordInstance<LogSheetData>).data.rows.map((r) => r.name), ["As On The Paper"]);

  const chosen = trainingFill(IMPARTED_ID, { header: { topic: "GMP Principles — 19-09-2026", evaluationMethod: "On the Job observation / Written test / Discussion & Interaction" }, rows: [] }, trainingsFor(IMPARTED_ID, false, DAY), false, DAY);
  assert.deepEqual([chosen?.data.header.trainingDate, chosen?.data.header.impartedBy, chosen?.data.header.duration, chosen?.data.header.method, chosen?.data.header.evaluationMethod], ["2026-09-19", "Kapila Barad(PSTL)", "1 hour", "Class room", "Written Test"]);
});
