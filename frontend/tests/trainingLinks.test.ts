// THE TRAINING FORMATS FOLLOW ONE ANOTHER (REQUIREMENTS §165; the owner, 2-Nov-2026: "HR 10 is connected with HR 11
// and HR 11 is connected with HR 12, and the score is 3 by default but editable, and in HR 19 by default the answer is
// Yes"). engine/trainingLinks.ts on the calendar on file:
//   * the trainings the calendar holds, latest first, each with its topic, trainer, duration and day;
//   * a training named by its label or by its topic alone (the latest held);
//   * F/HR/11: the training chosen fills the Date of Training and the Trainer's name, a typed topic only the blanks;
//   * F/HR/12: the training chosen fills the date, who imparted it and the duration, and lists the employees whose
//     F/HR/11 evaluation is on file for it, scored 3, marked for additional training as their evaluation said;
//   * every F/HR/12 line starts at 3 (a new record's, Add line's); the box and the line stay editable.
// Run: npm run test:unit -- trainingLinks
import test from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { SEED_HR_TRAINING_CALENDAR } from "../src/data/seed/hrRecords";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { blankLogRow, createDefaultData } from "../src/engine/recordDefaults";
import { columnKind } from "../src/engine/observations";
import {
  additionalTrainingFrom,
  EFFECTIVENESS_ID,
  evaluationsFor,
  FEEDBACK_ID,
  IMPARTED_ID,
  trainingBoxOf,
  trainingFill,
  trainingLabel,
  trainingNamed,
  trainingsFor,
  trainingsImparted,
  trainingsOnCalendar,
  TRAININGS_LIST,
} from "../src/engine/trainingLinks";

ensureDocumentsSeeded();
ensureMasterSeeded();
const master = masterRepository.get();
const TODAY = "2026-11-02";

const live = (id: string): RecordInstance[] => recordRepository.queryUnscoped({ documentId: id, isDemo: false });
const clear = (...ids: string[]) => ids.forEach((id) => live(id).forEach((r) => recordRepository.remove(r.id)));
const record = (id: string, documentId: string, dueDate: string, data: LogSheetData, status = "In Progress"): RecordInstance => {
  const now = new Date().toISOString();
  const r = { id, documentId, periodKey: `${documentId}:${dueDate}`, dueDate, status, isDemo: false, data, createdAt: now, updatedAt: now } as RecordInstance;
  recordRepository.upsert(r);
  return r;
};
const blank = (documentId: string, dueDate = TODAY): LogSheetData => createDefaultData(documentRepository.getByIdUnscoped(documentId)!, dueDate, master) as LogSheetData;

clear(EFFECTIVENESS_ID, FEEDBACK_ID, IMPARTED_ID, "hr-training-calendar");
recordRepository.upsert({ ...SEED_HR_TRAINING_CALENDAR, isDemo: false } as RecordInstance);

test("the calendar's trainings, latest first, each with its topic, trainer, duration and day; the two formats offer them on their topic box", () => {
  const all = trainingsOnCalendar(false, TODAY);
  assert.ok(all.length >= 30, `${all.length} trainings`);
  assert.ok(all.every((t, i) => i === 0 || all[i - 1].date >= t.date), "latest first");
  const gmp = all.filter((t) => t.topic === "GMP Principles");
  assert.deepEqual(gmp.map((t) => [t.date, t.held, t.trainer, t.duration]), [["2027-02-05", false, "Kapila Barad(PSTL)", "1 hour"], ["2026-09-19", true, "Kapila Barad(PSTL)", "1 hour"], ["2026-04-09", true, "Kapila Barad(PSTL)", "1 hour"]]);
  assert.equal(trainingLabel(gmp[1]), "GMP Principles — 19-09-2026");
  assert.equal(trainingBoxOf(EFFECTIVENESS_ID), "trainingTopic");
  assert.equal(trainingBoxOf(FEEDBACK_ID), "topic");
  assert.equal(trainingBoxOf("hr-competence"), null);
  assert.equal(getLogSheetLayout(EFFECTIVENESS_ID)!.headerFields.find((f) => f.key === "trainingTopic")!.list, TRAININGS_LIST);
  assert.equal(getLogSheetLayout(FEEDBACK_ID)!.headerFields.find((f) => f.key === "topic")!.list, TRAININGS_LIST);
});

test("a training named: by its label, or by its topic alone - the latest one held, else the next planned", () => {
  const all = trainingsOnCalendar(false, TODAY);
  assert.deepEqual(trainingNamed("GMP Principles — 09-04-2026", all, TODAY)?.training.date, "2026-04-09");
  assert.equal(trainingNamed("GMP Principles — 09-04-2026", all, TODAY)?.chosen, true);
  assert.deepEqual([trainingNamed("gmp principles", all, TODAY)?.training.date, trainingNamed("gmp principles", all, TODAY)?.chosen], ["2026-09-19", false]);
  assert.equal(trainingNamed("HARA Principles", all, "2026-05-01")?.training.date, "2026-09-18", "none held yet: the next planned");
  assert.equal(trainingNamed("Something else", all, TODAY), null);
  assert.equal(trainingNamed("", all, TODAY), null);
});

test("F/HR/11: the training chosen fills the Date of Training and the Trainer's name; a typed topic fills only the blanks", () => {
  const all = trainingsOnCalendar(false, TODAY);
  const data = blank(EFFECTIVENESS_ID);
  data.header.trainingTopic = "GMP Principles — 19-09-2026";
  const fill = trainingFill(EFFECTIVENESS_ID, data, all, false, TODAY)!;
  assert.ok(fill);
  assert.equal(fill.data.header.trainingTopic, "GMP Principles", "the box keeps the topic, as the paper words it");
  assert.equal(fill.data.header.trainingDate, "2026-09-19");
  assert.equal(fill.data.header.trainerName, "Kapila Barad(PSTL)");
  assert.deepEqual(fill.filled.sort(), ["trainerName", "trainingDate"]);
  // Typed: what is written stays; the blanks are filled from the latest held training of that topic.
  const typed = blank(EFFECTIVENESS_ID);
  typed.header.trainingTopic = "GMP Principles";
  typed.header.trainerName = "Ms. K. Barad";
  const t = trainingFill(EFFECTIVENESS_ID, typed, all, false, TODAY)!;
  assert.equal(t.data.header.trainingDate, "2026-09-19");
  assert.equal(t.data.header.trainerName, "Ms. K. Barad", "a trainer already written is kept");
  // A topic the calendar does not hold: nothing happens.
  const other = blank(EFFECTIVENESS_ID);
  other.header.trainingTopic = "Forklift safety";
  assert.equal(trainingFill(EFFECTIVENESS_ID, other, all, false, TODAY), null);
});

test("F/HR/12: the training chosen fills the date, who imparted it and the duration, and lists the employees evaluated on F/HR/11 for it, each scored 3", () => {
  const all = trainingsOnCalendar(false, TODAY);
  const evaluation = (id: string, name: string, further: string, date = "2026-09-19", topic = "GMP Principles") => {
    const d = blank(EFFECTIVENESS_ID);
    d.header = { ...d.header, traineeName: name, department: "QC", designation: "Chemist", trainingDate: date, trainingTopic: topic, trainerName: "Kapila Barad(PSTL)", furtherTraining: further };
    return record(id, EFFECTIVENESS_ID, date, d, "Verified");
  };
  evaluation("ev-1", "Roshni Senma", "No, not at all");
  evaluation("ev-2", "Ajay Vaghela", "Partly");
  evaluation("ev-3", "Mukesh Patel", "");
  evaluation("ev-4", "Vinay Bhojak", "No, not at all", "2026-04-09");
  assert.deepEqual(evaluationsFor({ topic: "gmp principles", date: "2026-09-19" }, false).map((r) => r.data.header.traineeName), ["Roshni Senma", "Ajay Vaghela", "Mukesh Patel"]);
  assert.deepEqual(["No, not at all", "Partly", "Yes, very much", ""].map(additionalTrainingFrom), ["No", "Yes", "Yes", ""]);

  const data = blank(FEEDBACK_ID);
  assert.equal(data.rows.length, 1);
  assert.equal(data.rows[0].rating, "3", "a new record's line starts at 3");
  data.header.topic = "GMP Principles — 19-09-2026";
  const fill = trainingFill(FEEDBACK_ID, data, all, false, TODAY, (() => { let n = 0; return () => `row-${++n}`; })())!;
  assert.ok(fill);
  assert.equal(fill.data.header.topic, "GMP Principles");
  assert.equal(fill.data.header.trainingDate, "2026-09-19");
  assert.equal(fill.data.header.impartedBy, "Kapila Barad(PSTL)");
  assert.equal(fill.data.header.duration, "1 hour");
  assert.deepEqual(fill.listed, ["Roshni Senma", "Ajay Vaghela", "Mukesh Patel"]);
  assert.deepEqual(fill.data.rows.map((r) => [r.name, r.rating, r.additionalTraining, r.remarks]), [["Roshni Senma", "3", "No", ""], ["Ajay Vaghela", "3", "Yes", ""], ["Mukesh Patel", "3", "", ""]]);
  assert.equal(fill.data.rows[0].id, data.rows[0].id, "the sheet's blank first line is the first employee's");
  assert.ok(fill.data.rows.slice(1).every((r) => typeof r.id === "string" && r.id.startsWith("row-")));
  // Named again: nobody is listed twice, nothing changes.
  assert.equal(trainingFill(FEEDBACK_ID, fill.data, all, false, TODAY), null);
  // A line the person wrote (a score of 1) is kept as written when the training is named again later.
  const edited = { ...fill.data, rows: fill.data.rows.map((r, i) => (i === 1 ? { ...r, rating: "1" } : r)) };
  evaluation("ev-5", "Jyoti Bind", "Partly");
  const again = trainingFill(FEEDBACK_ID, { ...edited, header: { ...edited.header, topic: "GMP Principles — 19-09-2026" } }, all, false, TODAY)!;
  assert.deepEqual(again.listed, ["Jyoti Bind"]);
  assert.equal(again.data.rows[1].rating, "1");
  assert.equal(again.data.rows.length, 4);
  clear(EFFECTIVENESS_ID);
});

test("every F/HR/12 line starts at 3 and the score stays the person's: a standard, not fixed, written like any cell", () => {
  const layout = getLogSheetLayout(FEEDBACK_ID)!;
  const rating = layout.columns.find((c) => c.key === "rating")!;
  assert.equal(rating.standard, "3");
  assert.deepEqual(rating.options, ["0", "1", "2", "3"]);
  assert.ok(!rating.fixed && !rating.computed && !rating.locked);
  assert.equal(columnKind(rating), "fixed", "a standard: not a reading the prepare must leave blank");
  assert.equal(blankLogRow(layout).rating, "3", "Add line starts at 3 too");
  assert.equal(blankLogRow(layout).name, "");
});

test("F/HR/10, the Training Imparted Record (§168): the calendar fills it; it then feeds F/HR/11 and F/HR/12 with its training and its people", () => {
  const calendar = trainingsOnCalendar(false, TODAY);
  // The format is DCRS's own, under Training, offering the calendar's trainings on its topic box.
  const doc = documentRepository.getByIdUnscoped(IMPARTED_ID)!;
  assert.equal(doc.formatNo, "F/HR/10");
  assert.equal(doc.section, "Training");
  assert.equal(trainingBoxOf(IMPARTED_ID), "topic");
  assert.equal(getLogSheetLayout(IMPARTED_ID)!.headerFields.find((f) => f.key === "topic")!.list, TRAININGS_LIST);
  assert.deepEqual(trainingsFor(IMPARTED_ID, false, TODAY).map((t) => t.source).slice(0, 3), ["calendar", "calendar", "calendar"]);
  // F/HR/09 -> F/HR/10: the calendar's training chosen fills the trainer, the duration, the method and the date.
  const imparted = blank(IMPARTED_ID);
  imparted.header.topic = "GMP Principles — 19-09-2026";
  const fill10 = trainingFill(IMPARTED_ID, imparted, calendar, false, TODAY)!;
  assert.ok(fill10);
  assert.equal(fill10.data.header.topic, "GMP Principles");
  assert.equal(fill10.data.header.trainingDate, "2026-09-19");
  assert.equal(fill10.data.header.impartedBy, "Kapila Barad(PSTL)");
  assert.equal(fill10.data.header.duration, "1 hour");
  assert.equal(fill10.data.header.method, "Class room");
  // The record of the training held, with who attended.
  const held = { ...fill10.data, rows: [{ id: "a1", name: "Roshni Senma", department: "Lab", designation: "Lab Executive", signature: "RS" }, { id: "a2", name: "Dharmik Mistry", department: "Production", designation: "Operator", signature: "" }, { id: "a3", name: "", department: "", designation: "", signature: "" }] };
  record("imp-1", IMPARTED_ID, "2026-09-19", held);
  const given = trainingsImparted(false);
  assert.equal(given.length, 1);
  assert.deepEqual([given[0].source, given[0].topic, given[0].date, given[0].trainer, given[0].attendees.map((a) => a.name)], ["imparted", "GMP Principles", "2026-09-19", "Kapila Barad(PSTL)", ["Roshni Senma", "Dharmik Mistry"]]);
  // F/HR/11 and F/HR/12 offer it first, and the calendar's other trainings behind it (the same training once).
  const offered = trainingsFor(FEEDBACK_ID, false, TODAY);
  assert.equal(offered.filter((t) => t.topic === "GMP Principles" && t.date === "2026-09-19").length, 1);
  assert.equal(offered.find((t) => t.topic === "GMP Principles" && t.date === "2026-09-19")!.source, "imparted");
  assert.ok(offered.length >= calendar.length);
  // F/HR/10 -> F/HR/11: the trainee who attended takes the attendance line's department and designation.
  const ev = blank(EFFECTIVENESS_ID);
  ev.header.traineeName = "Dharmik Mistry";
  ev.header.trainingTopic = "GMP Principles — 19-09-2026";
  const fill11 = trainingFill(EFFECTIVENESS_ID, ev, offered, false, TODAY)!;
  assert.deepEqual([fill11.data.header.trainingDate, fill11.data.header.trainerName, fill11.data.header.department, fill11.data.header.designation], ["2026-09-19", "Kapila Barad(PSTL)", "Production", "Operator"]);
  record("ev-10", EFFECTIVENESS_ID, "2026-09-19", { ...fill11.data, header: { ...fill11.data.header, furtherTraining: "Partly" } }, "Verified");
  // F/HR/10 and F/HR/11 -> F/HR/12: everybody who attended, and the evaluated, each at 3; Dharmik's further training from his evaluation.
  const fb = blank(FEEDBACK_ID);
  fb.header.topic = "GMP Principles — 19-09-2026";
  const fill12 = trainingFill(FEEDBACK_ID, fb, offered, false, TODAY, (() => { let n = 0; return () => `row-${++n}`; })())!;
  assert.deepEqual([fill12.data.header.trainingDate, fill12.data.header.impartedBy, fill12.data.header.duration], ["2026-09-19", "Kapila Barad(PSTL)", "1 hour"]);
  assert.deepEqual(fill12.listed, ["Roshni Senma", "Dharmik Mistry"]);
  assert.deepEqual(fill12.data.rows.map((r) => [r.name, r.rating, r.additionalTraining]), [["Roshni Senma", "3", ""], ["Dharmik Mistry", "3", "Yes"]]);
  clear(EFFECTIVENESS_ID, IMPARTED_ID);
});
