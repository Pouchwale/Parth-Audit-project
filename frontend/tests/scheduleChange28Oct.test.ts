// THE SCHEDULES THE OWNER GAVE ON 28-OCT-2026, AND THE CERTIFICATE'S DATES IN THE SHEETS ALREADY OPEN:
//   "QC - 11 GSM Cutting blade 20-10-26 and 27-10-26 every tuesday due date and qc-12 weekly internal record weight scale
//    25-10-26 and 1-11-26 every sunday and F-HR-18 Fly catcher twice per month 5-10-26 and 19-10-26 monday wise ...
//    Also you have not added date in format which i have given you in previous task ... in those document where you
//    have not added till now"
// held to it:
//   * F/QC/11 every Tuesday, F/QC/12 every Sunday, F/HR/18 the 1st and 3rd Monday of the month - the owner's dates among
//     them - each from 28-Oct-2026: no Live sheet for a date before it, so the change leaves nothing overdue behind;
//   * the old schedule's untouched sheets from today on are taken away; a sheet a person wrote on, and a past one, stay;
//   * the sheets still open take the calibration certificate's dates (§129) where they held earlier ones, with a line in
//     their history; a later date written, a sheet handed in or verified, and Demo Mode's are left as they are.
// Run: npm run test:unit -- scheduleChange28Oct
import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition, LogSheetData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { settingsRepository } from "../src/data/repositories/settingsRepository";
import { dueDatesInMonth, scheduleLabel } from "../src/engine/frequencyEngine";
import { ensureRecordsGeneratedForMonth, periodKeyFor } from "../src/engine/recordGenerator";
import { removeOffScheduleShells } from "../src/engine/calendarMigration";
import { alignCertificateDates, CERTIFICATE_NOTE } from "../src/data/certificateDatesMigration";
import { createDefaultData } from "../src/engine/recordDefaults";
import { suggestedVisitDate } from "../src/engine/flyRegister";

ensureDocumentsSeeded();
ensureMasterSeeded();
// An established system, as the owner's is: live since 1 September 2026.
settingsRepository.update({ liveStartDate: "2026-09-01" });

const GSM = "qc-gsm-plate-calibration";
const SCALE = "qc-weight-scale-calibration";
const FLY = "fly-catcher";
const master = masterRepository.get();
const doc = (id: string): DocumentDefinition => documentRepository.getByIdUnscoped(id)!;
const live = (id: string): RecordInstance[] => recordRepository.queryUnscoped({ documentId: id, isDemo: false });
const clear = (...ids: string[]) => ids.forEach((id) => live(id).forEach((r) => recordRepository.remove(r.id)));
const shell = (id: string, due: string, over: Partial<RecordInstance> = {}): RecordInstance => {
  const now = new Date().toISOString();
  const r: RecordInstance = { id: `rec-${id}-${due}`, documentId: id, periodKey: periodKeyFor(doc(id), due), dueDate: due, status: "Due", isDemo: false, data: createDefaultData(doc(id), due, master), createdAt: now, updatedAt: now, ...over };
  recordRepository.upsert(r);
  return r;
};

test("the schedules: F/QC/11 every Tuesday, F/QC/12 a sheet a month (every Sunday until 29-Oct-2026's change), F/HR/18 the 1st and 3rd Monday - the owner's dates among them", () => {
  assert.deepEqual(doc(GSM).schedule, { type: "weekly", weekday: 2 });
  assert.equal(doc(GSM).frequency, "Weekly");
  assert.deepEqual(dueDatesInMonth(doc(GSM), 2026, 9), ["2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27"], "20-10-26 and 27-10-26, Tuesdays");
  assert.deepEqual(doc(SCALE).schedule, { type: "monthly", dayOfMonth: 1 }, "a sheet a month, a line a week on it (the owner, 29-Oct-2026, §145)");
  assert.deepEqual(dueDatesInMonth(doc(SCALE), 2026, 10), ["2026-11-01"], "November's sheet: the 1st - the Sunday sheet already begun for 1-11-26 is it");
  assert.deepEqual(doc(FLY).schedule, { type: "fortnightly", weekday: 1 });
  assert.deepEqual(dueDatesInMonth(doc(FLY), 2026, 9), ["2026-10-05", "2026-10-19"], "5-10-26 and 19-10-26, the 1st and 3rd Monday");
  assert.deepEqual(dueDatesInMonth(doc(FLY), 2026, 10), ["2026-11-02", "2026-11-16"]);
  assert.deepEqual(dueDatesInMonth(doc(FLY), 2026, 11), ["2026-12-07", "2026-12-21"]);
  assert.deepEqual(dueDatesInMonth(doc(FLY), 2027, 1), ["2027-02-01", "2027-02-15"], "a month that starts on a Monday");
  assert.equal(scheduleLabel(doc(FLY)), "1st & 3rd Monday of each month");
  assert.equal(scheduleLabel(doc(GSM)), "Every Tue");
  assert.equal(scheduleLabel(doc(SCALE)), "Day 1 of each month");
  // Another fortnightly document keeps its days of the month.
  assert.equal(scheduleLabel(doc("service-report-rodent")), "Day 4 & 18 of each month");
  for (const id of [GSM, FLY]) assert.equal(doc(id).scheduleSince, "2026-10-28", id);
  assert.equal(doc(SCALE).scheduleSince, "2026-11-01", "the monthly sheet from November 2026");
});

test("from 28-Oct-2026: no Live sheet of the new schedule before it, the new dates after it", () => {
  clear(GSM, SCALE, FLY);
  ensureRecordsGeneratedForMonth(2026, 9, { documentIds: [GSM, SCALE, FLY] });
  for (const id of [GSM, SCALE, FLY]) assert.deepEqual(live(id).map((r) => r.dueDate), [], `${id}: nothing overdue made for October's past dates`);
  ensureRecordsGeneratedForMonth(2026, 10, { documentIds: [GSM, SCALE, FLY] });
  assert.deepEqual(live(SCALE).map((r) => r.dueDate).sort(), ["2026-11-01"], "November's one sheet (§145)");
  // Tuesday 10-Nov-2026 is in the Diwali holidays (9 to 13 November): that week's is due the next working day, the 14th.
  assert.deepEqual(live(GSM).map((r) => r.dueDate).sort(), ["2026-11-03", "2026-11-14", "2026-11-17", "2026-11-24"]);
  assert.ok(live(GSM).some((r) => r.periodKey === `${GSM}:2026-11-10` && r.dueDate === "2026-11-14"), "still the 10th's sheet");
  assert.deepEqual(live(FLY).map((r) => r.dueDate).sort(), ["2026-11-02", "2026-11-16"]);
  // Demo Mode's year follows the new schedule throughout: it has no date the change took effect.
  clear(GSM, SCALE, FLY);
});

test("the old schedule's untouched sheets from today on go; a sheet a person wrote on, and a past one, stay", () => {
  clear(SCALE, FLY);
  const today = "2026-10-28";
  shell(SCALE, "2026-10-28"); // the old Wednesday's, today, nobody wrote on it
  shell(SCALE, "2026-11-04"); // a later old Wednesday
  shell(SCALE, "2026-11-01"); // the new Sunday
  shell(SCALE, "2026-10-21"); // a past Wednesday
  shell(SCALE, "2026-11-11", { status: "In Progress", updatedAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() }); // a draft somebody began
  shell(FLY, "2026-11-03"); // the old 3rd
  shell(FLY, "2026-11-02"); // the new 1st Monday
  assert.equal(removeOffScheduleShells(today), 3);
  assert.deepEqual(live(SCALE).map((r) => r.dueDate).sort(), ["2026-10-21", "2026-11-01", "2026-11-11"]);
  assert.deepEqual(live(FLY).map((r) => r.dueDate), ["2026-11-02"]);
  assert.equal(removeOffScheduleShells(today), 0, "nothing to do the next time");
  // A document whose schedule did not change is never looked at.
  const other = shell("service-report-rodent", "2026-11-05");
  assert.equal(removeOffScheduleShells(today), 0);
  recordRepository.remove(other.id);
  clear(SCALE, FLY);
});

test("the sheets still open take the certificate's dates where they held earlier ones, a line in their history; the rest are left", () => {
  clear(SCALE, GSM);
  const old = (id: string, due: string, status: RecordInstance["status"], header: Record<string, string>, isDemo = false) => {
    const r = shell(id, due, { status, isDemo });
    recordRepository.upsert({ ...r, data: { ...(r.data as LogSheetData), header: { ...(r.data as LogSheetData).header, ...header } } });
    return r.id;
  };
  const due = old(SCALE, "2026-11-01", "Due", { calibrationExpiry: "2024-08-27", deviceIdNo: "QC-76" });
  const draft = old(GSM, "2026-11-03", "In Progress", { calibrationExpiry: "2025-09-22", calibrationDate: "2026-10-31", dueDate: "" });
  const later = old(SCALE, "2026-11-08", "In Progress", { calibrationExpiry: "2028-09-19" });
  const handedIn = old(SCALE, "2026-11-15", "Pending Verification", { calibrationExpiry: "2024-08-27" });
  const verified = old(GSM, "2026-11-10", "Verified", { calibrationExpiry: "2025-09-22" });
  const header = (id: string) => (recordRepository.getById(id)!.data as LogSheetData).header;
  assert.equal(alignCertificateDates(), 2);
  assert.equal(header(due).calibrationExpiry, "2027-09-20");
  assert.equal(header(due).deviceIdNo, "QC-76", "nothing else changed");
  assert.equal(header(draft).calibrationExpiry, "2027-09-20", "the later of what it held and the certificate's");
  // F/QC/11's I. Calibration Date / Due Date row, back since 30-Oct-2026 (§147): the later of what it held and the
  // certificate's - its 31-10-26 kept, its blank Due Date the certificate's 20-09-27.
  assert.deepEqual([header(draft).calibrationDate, header(draft).dueDate], ["2026-10-31", "2027-09-20"]);
  assert.ok(recordRepository.getById(due)!.history?.some((e) => e.note === CERTIFICATE_NOTE), "a line in its history");
  assert.equal(header(later).calibrationExpiry, "2028-09-19", "a later date written is kept");
  assert.equal(header(handedIn).calibrationExpiry, "2024-08-27", "a sheet handed in is the person's as handed in");
  assert.equal(header(verified).calibrationExpiry, "2025-09-22", "a verified sheet is left as verified");
  assert.equal(alignCertificateDates(), 0, "nothing to do the next time");
  clear(SCALE, GSM);
});

test("Add visit on F/HR/18 offers the month's first scheduled Monday", () => {
  clear(FLY);
  assert.equal(suggestedVisitDate(2026, 10, false, "2026-11-20"), "2026-11-02");
  clear(FLY);
});
