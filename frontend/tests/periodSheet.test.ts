// ONE SHEET FOR EACH PERIOD OF THE SCHEDULE (REQUIREMENTS §93; the audit of
// 7-Oct-2026, H-7). Without a browser: the engine and the repositories.
//
// The owner, 7-Oct-2026: "when i click on start record in many document ... no
// record found go back this message is coming". On a system live for some weeks,
// "New record" and "Start this record" on a weekly, monthly or yearly document
// did not open that period's sheet: they made a second sheet dated the day the
// button was pressed, and the sheet the schedule counts stayed pending. Here:
//
//   * the week, the fortnight, the month, the quarter and the year a date falls
//     in, each holding the one date the schedule names (its sheet's key);
//   * New on a monthly, a weekly and a yearly document opens the period's sheet
//     the schedule made — a verified one included — and never starts a second;
//   * a period with no sheet yet gets one under the schedule's own key, dated the
//     day it was started, and the schedule then makes no second sheet beside it;
//   * a fortnightly visit report opens the fortnight's visit;
//   * an as-required document still starts a new sheet every time, a daily one
//     still opens the day's own, and the training record is one per training;
//   * what a document's page shows: the record New opens, not the blank sheet
//     made ahead for the 31st.
// Run: npm run test:unit -- periodSheet
import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureRecordsSeeded, recordRepository } from "../src/data/repositories/recordRepository";
import { settingsRepository } from "../src/data/repositories/settingsRepository";
import { createRecordForDocument, recordCoveringDate } from "../src/engine/recordCrud";
import { ensureRecordsGeneratedForMonth } from "../src/engine/recordGenerator";
import { schedulePeriodOf } from "../src/engine/frequencyEngine";
import { compareISO } from "../src/utils/date";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureRecordsSeeded();
// An established system, as the owner's is: live since 1 September 2026.
settingsRepository.update({ liveStartDate: "2026-09-01" });

const doc = (id: string): DocumentDefinition => {
  const d = documentRepository.getByIdUnscoped(id);
  assert.ok(d, `${id} is in the catalogue`);
  return d!;
};
const recordsOf = (id: string): RecordInstance[] => recordRepository.queryUnscoped({ documentId: id, isDemo: false });
/** The Live records of a document filed for a date between `from` and `to` (by their period key's date). */
const filedBetween = (id: string, from: string, to: string): RecordInstance[] =>
  recordsOf(id).filter((r) => {
    const d = /^(?:[^:]*:)?(\d{4}-\d{2}-\d{2})/.exec(r.periodKey)?.[1] ?? r.dueDate;
    return compareISO(d, from) >= 0 && compareISO(d, to) <= 0;
  });
const generate = (ids: string[], ...months: [number, number][]) => {
  for (const [year, month] of months) ensureRecordsGeneratedForMonth(year, month, { documentIds: ids });
};

test("the week, the fortnight, the month, the quarter and the year a date falls in, each with the one date its schedule names", () => {
  // F/QC/12, weekly on Wednesday: Monday to Sunday.
  const weekly = doc("qc-weight-scale-calibration");
  assert.deepEqual(schedulePeriodOf(weekly, "2026-10-07"), { from: "2026-10-05", to: "2026-10-11", scheduled: "2026-10-07" });
  assert.deepEqual(schedulePeriodOf(weekly, "2026-10-05"), { from: "2026-10-05", to: "2026-10-11", scheduled: "2026-10-07" }, "Monday: this week's Wednesday");
  assert.deepEqual(schedulePeriodOf(weekly, "2026-10-11"), { from: "2026-10-05", to: "2026-10-11", scheduled: "2026-10-07" }, "Sunday: the same week");
  assert.deepEqual(schedulePeriodOf(weekly, "2026-10-12"), { from: "2026-10-12", to: "2026-10-18", scheduled: "2026-10-14" }, "the next Monday: the next week");
  assert.deepEqual(schedulePeriodOf(weekly, "2026-11-01"), { from: "2026-10-26", to: "2026-11-01", scheduled: "2026-10-28" }, "a week across two months");
  // The pest service visits, the 4th and the 18th; the fly catcher, the 3rd and the 17th.
  const visits = doc("service-report-rodent");
  assert.deepEqual(schedulePeriodOf(visits, "2026-10-02"), { from: "2026-10-01", to: "2026-10-17", scheduled: "2026-10-04" });
  assert.deepEqual(schedulePeriodOf(visits, "2026-10-17"), { from: "2026-10-01", to: "2026-10-17", scheduled: "2026-10-04" });
  assert.deepEqual(schedulePeriodOf(visits, "2026-10-18"), { from: "2026-10-18", to: "2026-10-31", scheduled: "2026-10-18" });
  assert.deepEqual(schedulePeriodOf(doc("fly-catcher"), "2026-10-17"), { from: "2026-10-17", to: "2026-10-31", scheduled: "2026-10-17" });
  // Monthly: due on the 1st (F/MNT/09) or the month's last day (F/HR/15, even in February).
  assert.deepEqual(schedulePeriodOf(doc("mnt-glass-breakage"), "2026-10-07"), { from: "2026-10-01", to: "2026-10-31", scheduled: "2026-10-01" });
  assert.deepEqual(schedulePeriodOf(doc("hr-daily-cleaning"), "2027-02-10"), { from: "2027-02-01", to: "2027-02-28", scheduled: "2027-02-28" });
  // Quarterly (no document of the plant is quarterly yet): from the quarter's first month, counted from the anchor.
  const quarterly = { ...doc("mnt-glass-breakage"), schedule: { type: "quarterly" as const, anchorMonth: 1, dayOfMonth: 15 } };
  assert.deepEqual(schedulePeriodOf(quarterly, "2026-01-10"), { from: "2025-11-01", to: "2026-01-31", scheduled: "2025-11-15" });
  assert.deepEqual(schedulePeriodOf(quarterly, "2026-02-01"), { from: "2026-02-01", to: "2026-04-30", scheduled: "2026-02-15" });
  // Yearly: the calendar year.
  assert.deepEqual(schedulePeriodOf(doc("pur-approved-suppliers"), "2026-10-07"), { from: "2026-01-01", to: "2026-12-31", scheduled: "2026-12-01" });
  // A daily and an as-required document: no period wider than the day.
  assert.equal(schedulePeriodOf(doc("qc-viscosity"), "2026-10-07"), null);
  assert.equal(schedulePeriodOf(doc("str-sharp-metal-objects"), "2026-10-07"), null);
});

test("New on a monthly document opens the month's sheet (F/MNT/09), never a second one", () => {
  const glass = doc("mnt-glass-breakage");
  generate([glass.id], [2026, 9], [2026, 10]);
  const october = filedBetween(glass.id, "2026-10-01", "2026-10-31");
  assert.equal(october.length, 1, "the schedule made October's sheet");
  // 1 October 2026 is a Thursday, the weekly off: the sheet is due on the Friday.
  assert.equal(october[0].periodKey, "mnt-glass-breakage:2026-10-01");
  assert.equal(october[0].dueDate, "2026-10-02");
  for (const day of ["2026-10-07", "2026-10-02", "2026-10-31"]) {
    const { record, existed } = createRecordForDocument(glass, { dateISO: day });
    assert.equal(existed, true, `${day}: the month's sheet is on file`);
    assert.equal(record.id, october[0].id, `${day}: New opens October's sheet`);
  }
  assert.equal(filedBetween(glass.id, "2026-10-01", "2026-10-31").length, 1, "still one sheet for October");
  const november = createRecordForDocument(glass, { dateISO: "2026-11-05" });
  assert.notEqual(november.record.id, october[0].id, "the next month is the next sheet");
  assert.equal(november.record.periodKey, "mnt-glass-breakage:2026-11-01");
});

test("New on a weekly document opens the week's sheet (F/QC/12), Monday to Sunday", () => {
  const weekly = doc("qc-weight-scale-calibration");
  generate([weekly.id], [2026, 9]);
  const before = recordsOf(weekly.id).length;
  const wednesday = recordsOf(weekly.id).find((r) => r.periodKey === "qc-weight-scale-calibration:2026-10-07");
  assert.ok(wednesday, "the schedule made the 7 October sheet");
  assert.equal(createRecordForDocument(weekly, { dateISO: "2026-10-05" }).record.id, wednesday!.id, "Monday: this week's sheet");
  assert.equal(createRecordForDocument(weekly, { dateISO: "2026-10-10" }).record.id, wednesday!.id, "Saturday: the same week's sheet");
  const next = createRecordForDocument(weekly, { dateISO: "2026-10-12" });
  assert.equal(next.existed, true);
  assert.equal(next.record.periodKey, "qc-weight-scale-calibration:2026-10-14", "the next Monday: the next week's sheet");
  assert.equal(recordsOf(weekly.id).length, before, "nothing new was made");
});

test("New on a yearly document opens the year's sheet, a verified one included, and a year with none gets its own", () => {
  // F/MNT/03: the 2026 schedule, on file and verified (the plant's sample year).
  const yearlyPm = doc("mnt-yearly-pm-schedule");
  const year2026 = recordsOf(yearlyPm.id).find((r) => r.periodKey === "mnt-yearly-pm-schedule:2026-01-01");
  assert.ok(year2026, "the 2026 schedule is on file");
  const opened = createRecordForDocument(yearlyPm, { dateISO: "2026-10-07" });
  assert.equal(opened.existed, true);
  assert.equal(opened.record.id, year2026!.id, "New opens the year's schedule, which is Verified, rather than starting another");
  assert.equal(opened.record.status, year2026!.status);

  // F/PUR/03, due on 1 December: in October the schedule has not made 2026's sheet yet.
  const approved = doc("pur-approved-suppliers");
  assert.equal(filedBetween(approved.id, "2026-01-01", "2026-12-31").length, 0);
  const started = createRecordForDocument(approved, { dateISO: "2026-10-07" });
  assert.equal(started.existed, false);
  assert.equal(started.record.periodKey, "pur-approved-suppliers:2026-12-01", "filed under the year's own key");
  assert.equal(started.record.dueDate, "2026-10-07", "dated the day it was started");
  assert.equal(createRecordForDocument(approved, { dateISO: "2026-11-15" }).record.id, started.record.id, "November: the same year's sheet");
  generate([approved.id], [2026, 11]);
  assert.equal(filedBetween(approved.id, "2026-01-01", "2026-12-31").length, 1, "December comes, and the schedule makes no second 2026 sheet");
  assert.notEqual(createRecordForDocument(approved, { dateISO: "2027-01-04" }).record.id, started.record.id, "the next year is the next sheet");
});

test("New on a fortnightly visit report opens the fortnight's visit", () => {
  const rodent = doc("service-report-rodent");
  generate([rodent.id], [2026, 9]);
  const fourth = recordsOf(rodent.id).find((r) => r.periodKey === "service-report-rodent:2026-10-04");
  const eighteenth = recordsOf(rodent.id).find((r) => r.periodKey === "service-report-rodent:2026-10-18");
  assert.ok(fourth && eighteenth, "the schedule made both October visits");
  assert.equal(createRecordForDocument(rodent, { dateISO: "2026-10-10" }).record.id, fourth!.id);
  assert.equal(createRecordForDocument(rodent, { dateISO: "2026-10-20" }).record.id, eighteenth!.id);
});

test("an as-required document starts a new sheet every time; a daily one opens the day's; the training record is one per training", () => {
  const sharp = doc("str-sharp-metal-objects");
  const a = createRecordForDocument(sharp, { dateISO: "2026-10-07" });
  const b = createRecordForDocument(sharp, { dateISO: "2026-10-07" });
  assert.equal(a.existed || b.existed, false);
  assert.notEqual(a.record.id, b.record.id, "F/STR/02: two issues on one day are two sheets");

  const viscosity = doc("qc-viscosity");
  generate([viscosity.id], [2026, 9]);
  const day = recordsOf(viscosity.id).find((r) => r.dueDate === "2026-10-07");
  assert.ok(day, "the schedule made the day's sheet");
  assert.equal(createRecordForDocument(viscosity, { dateISO: "2026-10-07" }).record.id, day!.id, "the day's own sheet");
  assert.notEqual(createRecordForDocument(viscosity, { dateISO: "2026-10-09" }).record.id, day!.id, "another day, another sheet");

  const training = doc("training-record");
  const sep5 = createRecordForDocument(training, { dateISO: "2026-09-05" });
  const sep6 = createRecordForDocument(training, { dateISO: "2026-09-06" });
  assert.equal(sep5.existed || sep6.existed, false);
  assert.notEqual(sep5.record.id, sep6.record.id, "a record for each training held, as its own page starts them");
  assert.equal(createRecordForDocument(training, { dateISO: "2026-09-05" }).record.id, sep5.record.id, "the same day's opens again");
});

test("a document's page shows the record New opens, not the blank sheet made ahead for the 31st", () => {
  const viscosity = doc("qc-viscosity");
  generate([viscosity.id], [2026, 9]);
  const newestDated = recordsOf(viscosity.id).slice().sort((x, y) => compareISO(y.dueDate, x.dueDate))[0];
  assert.equal(newestDated.dueDate, "2026-10-31", "the month is made ahead of its days");
  const shown = recordCoveringDate(viscosity, "2026-10-07", false);
  assert.equal(shown?.dueDate, "2026-10-07", "today's sheet is the one shown");
  assert.equal(shown?.id, createRecordForDocument(viscosity, { dateISO: "2026-10-07" }).record.id, "...the one New opens");

  const cleaning = doc("hr-daily-cleaning");
  generate([cleaning.id], [2026, 9]);
  assert.equal(recordCoveringDate(cleaning, "2026-10-07", false)?.periodKey, "hr-daily-cleaning:2026-10-31", "F/HR/15 on the 7th: October's sheet, due on the 31st");
  assert.equal(recordCoveringDate(doc("str-sharp-metal-objects"), "2026-10-07", false), undefined, "an as-required document has no sheet of the day to show first");
});
