// F/HR/05 for Supervisor and above on the day assigned, its Planned Date never a holiday, and F/HR/06 taking that date (REQUIREMENTS §303).
// Run: npm run test:unit -- inductionRound
import test from "node:test";
import assert from "node:assert/strict";
import type { HrMasterPerson, LogSheetData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded, masterRepository } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrSeeded, hrMasterRepository } from "../src/data/repositories/hrMasterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { isCompanyHoliday } from "../src/engine/holidays";
import { hrMasterLinkFor, linkedValue, writeDate } from "../src/engine/hrMaster";
import { firstWorkingDay, inductionDayOf, inductionFormOf } from "../src/engine/inductionDay";
import { INDUCTION_MARK, inductionFillDay, inductionStanding, runInductionRound, syncInductionDates, takesInductionForm } from "../src/engine/inductionRound";
import { createRecordForDocument, deleteRecordWithTrail } from "../src/engine/recordCrud";
import { saveDraft } from "../src/engine/recordLifecycle";
import { addDays, todayISO } from "../src/utils/date";

const FORM = "hr-induction-staff";
const REGISTER = "hr-induction-operators";
const forms = () => recordRepository.queryUnscoped({ documentId: FORM, isDemo: false }) as RecordInstance<LogSheetData>[];

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrSeeded();

test("Supervisor and above, and nobody below", () => {
  for (const designation of ["Supervisor", "Team Leader", "Executive", "EXUCUTIVE", "Sr.Accountant", "Sr.Designer", "Process Engineer", "Manager", "Manager-Pouch", "Regional Manager", "HOD", "Director", "CEO"]) {
    assert.ok(takesInductionForm({ designation }), designation);
  }
  for (const designation of ["Assistant", "Coordinator", "Designer", "Cashier", "Receptionist", "TELE CALLER", "Electrician", "Operator", "OPERATOR", "Helper", "Driver", "Guard", "Peon", "Sweeper", "Pouching", "Slitting"]) {
    assert.ok(!takesInductionForm({ designation }), designation);
  }
});

test("nothing is made until a day is assigned, and then one form each with a working Planned Date", () => {
  const master = masterRepository.get();
  masterRepository.update({ inductionFillDate: "" });
  assert.equal(runInductionRound(), 0);
  assert.equal(forms().length, 0);

  const later = addDays(todayISO(), 30);
  masterRepository.update({ inductionFillDate: later });
  assert.equal(runInductionRound(), 0, "not before the day");

  // A weekly off assigned moves to the next working day.
  let off = todayISO();
  while (!isCompanyHoliday(off, master)) off = addDays(off, 1);
  masterRepository.update({ inductionFillDate: off });
  const day = inductionFillDay();
  assert.ok(day > off && !isCompanyHoliday(day, master));
  assert.equal(runInductionRound(addDays(day, -1)), 0);

  const expected = inductionStanding(day).toMake;
  assert.ok(expected.length > 0);
  assert.equal(runInductionRound(day), expected.length);
  for (const form of forms()) {
    const { header, rows } = form.data;
    assert.equal(form.status, "In Progress");
    assert.ok(String(header.name).trim());
    assert.ok(rows.every((r) => r.plannedDate === firstWorkingDay(String(header.dateOfJoining))), String(header.name));
    assert.ok(rows.every((r) => !isCompanyHoliday(String(r.plannedDate), master)));
    assert.ok(rows.every((r) => !String(r.actualDate ?? "").trim()), "the Actual Date is left for the day it is held");
  }
  assert.equal(runInductionRound(day), 0, "no second form");

  const gone = forms()[0];
  deleteRecordWithTrail(gone, "test", "not needed");
  assert.equal(runInductionRound(day), 0, "a deleted form stays deleted");
  assert.equal(inductionStanding(day).deleted, 1);
});

test("F/HR/06 takes the F/HR/05 Planned Date by person, follows it, and leaves a typed date and a signed sheet alone", () => {
  const person = hrMasterRepository.all().find((p: HrMasterPerson) => !!inductionFormOf(p))!;
  const form = inductionFormOf(person)!;
  const moved = addDays(String(form.data.rows[0].plannedDate), 1);
  const field = hrMasterLinkFor(REGISTER)!.fields.find((f) => f.induction)!;

  const planned = String(form.data.rows[0].plannedDate);
  assert.equal(linkedValue(person, field), writeDate(planned, "dayFirst"));

  const doc = documentRepository.getByIdUnscoped(REGISTER)!;
  const made = createRecordForDocument(doc, { dateISO: todayISO(), isDemo: false }).record as RecordInstance<LogSheetData>;
  const blank = made.data.rows[0];
  const line = { ...blank, id: "a", name: person.fullName, dateOfJoiningInduction: "" };
  const typed = { ...blank, id: "b", name: person.fullName, dateOfJoiningInduction: "15-01-2020" };
  const register = saveDraft(made, { ...made.data, rows: [line, typed] }, "test");

  syncInductionDates(register.id);
  const first = recordRepository.getById(register.id) as RecordInstance<LogSheetData>;
  assert.equal(first.data.rows[0].dateOfJoiningInduction, writeDate(inductionDayOf(person), "dayFirst"));
  assert.equal(first.data.rows[1].dateOfJoiningInduction, "15-01-2020", "a date typed by a person stays");

  saveDraft(form, { ...form.data, rows: form.data.rows.map((r) => ({ ...r, plannedDate: moved })) }, "test");
  syncInductionDates(register.id);
  const second = recordRepository.getById(register.id) as RecordInstance<LogSheetData>;
  assert.equal(second.data.rows[0].dateOfJoiningInduction, writeDate(moved, "dayFirst"));
  assert.equal(second.data.rows[0][INDUCTION_MARK], writeDate(moved, "dayFirst"));

  const verified = recordRepository.upsert({ ...second, status: "Verified" }) as RecordInstance<LogSheetData>;
  saveDraft(inductionFormOf(person)!, { ...form.data, rows: form.data.rows.map((r) => ({ ...r, plannedDate: planned })) }, "test");
  syncInductionDates(verified.id);
  assert.equal((recordRepository.getById(verified.id) as RecordInstance<LogSheetData>).data.rows[0].dateOfJoiningInduction, writeDate(moved, "dayFirst"), "a verified sheet does not change");
});
