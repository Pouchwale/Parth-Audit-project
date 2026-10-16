// THE OWNER'S PHOTOS OF 16-OCT-2026 ON F/QC/12, F/QC/17 AND F/QC/11 (REQUIREMENTS §117): every week of the weight
// scale a new record of one line with the standard weights written in; the ruler record's master calibrator readings
// editable; a new calibration or verification record written as the last one was, every box editable.
// Run: npm run test:unit -- qcCarryForward
import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition, LogSheetData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { STANDARD_WEIGHTS } from "../src/data/seed/qcCalibrationLayouts";
import { SEED_GSM_PLATE_CALIBRATION, SEED_WEIGHT_SCALE_CALIBRATION } from "../src/data/seed/qcCalibrationRecords";
import { blankLogRow, createDefaultData } from "../src/engine/recordDefaults";
import { createRecordForDocument, startingData } from "../src/engine/recordCrud";
import { entriesWaiting, prepareKnownParts } from "../src/engine/knownParts";
import { withCalibration } from "../src/engine/calibration";
import { logRowsRule } from "../src/engine/recordLines";
import { columnKind } from "../src/engine/observations";
import { carriedFrom, hasWriting, previousWrittenRecord } from "../src/engine/carryForward";

ensureDocumentsSeeded();
ensureMasterSeeded();

const doc = (id: string): DocumentDefinition => {
  const d = documentRepository.getByIdUnscoped(id);
  assert.ok(d, `${id} is in the catalogue`);
  return d!;
};
const layoutOf = (id: string) => {
  const l = getLogSheetLayout(id);
  assert.ok(l, `${id} has a layout`);
  return l!;
};
const data = (r: RecordInstance): LogSheetData => r.data as LogSheetData;

test("F/QC/12: one sheet a week holds the week's one line, no line added, the five standard weights written in and editable", () => {
  const layout = layoutOf("qc-weight-scale-calibration");
  assert.equal(layout.rowMode.kind, "single", "the week's one calibration: a new week is a new record");
  assert.equal(logRowsRule(layout).canAdd, false, "no Add line on the sheet");
  assert.equal(doc("qc-weight-scale-calibration").schedule.type, "weekly");
  assert.deepEqual(STANDARD_WEIGHTS, ["50 gm", "100 gm", "200 gm", "500 gm", "600 gm"]);
  const blank = createDefaultData(doc("qc-weight-scale-calibration"), "2026-10-14", masterRepository.get()) as LogSheetData;
  assert.equal(blank.rows.length, 1);
  assert.deepEqual([1, 2, 3, 4, 5].map((i) => blank.rows[0][`weight${i}`]), STANDARD_WEIGHTS, "the paper's standard weights on the new line");
  assert.deepEqual([1, 2, 3, 4, 5].map((i) => blank.rows[0][`testedValue${i}`]), ["", "", "", "", ""], "the readings are the person's");
  assert.equal(blankLogRow(layout).weight3, "200 gm", "Add line and Mitra's new line carry them too");
  for (let i = 1; i <= 5; i++) {
    const col = layout.columns.find((c) => c.key === `weight${i}`)!;
    assert.equal(col.fixed, undefined, "editable: the person may write another weight");
    assert.equal(columnKind(col), "fixed", "but a printed part of the line, not a reading, for the count of what waits");
  }
  assert.equal(layout.headerFields[0].key, "deviceIdNo", "the device id is the first box, as on the paper");
  // A new Live sheet with nothing but its weights still waits for the readings: the weights are not "something observed".
  const shell: RecordInstance = { id: "x", documentId: "qc-weight-scale-calibration", periodKey: "p", dueDate: "2026-10-14", status: "In Progress", isDemo: false, data: blank, createdAt: "", updatedAt: "" };
  const waiting = entriesWaiting(doc("qc-weight-scale-calibration"), shell);
  assert.ok(waiting.length > 0 && waiting.some((w) => /Tested Value 1/.test(w)), JSON.stringify(waiting));
  assert.ok(!waiting.some((w) => /Weight 1/.test(w)), "the weight is written already");
});

test("F/QC/17: the master calibrator readings are the person's to write; the Difference follows what is written", () => {
  const layout = layoutOf("qc-ruler-verification");
  const master = layout.columns.find((c) => c.key === "masterReading")!;
  assert.equal(master.fixed, undefined, "no longer printed read-only: a 600 mm master's own readings");
  assert.equal(layout.carryForwardAll, true);
  const blank = createDefaultData(doc("qc-ruler-verification"), "2026-10-16", masterRepository.get()) as LogSheetData;
  assert.deepEqual(blank.rows.map((r) => r.masterReading), ["50 mm", "100 mm", "150 mm", "200 mm", "250 mm", "290 mm"], "the six printed points start every new sheet");
  const rows = blank.rows.map((r, i) => (i === 0 ? { ...r, masterReading: "48 mm", observed: 50 } : r));
  const worked = withCalibration("qc-ruler-verification", { ...blank, rows });
  assert.equal(worked.rows[0].difference, "2.0", "the observed reading less the master reading as written, not the printed point");
  // The morning prepare keeps the six points on a fresh sheet (no previous record): they are the form's own lines.
  recordRepository.query({ documentId: "qc-ruler-verification" }).forEach((r) => recordRepository.remove(r.id));
  const prepared = prepareKnownParts(doc("qc-ruler-verification"), "2026-10-16", masterRepository.get(), undefined);
  assert.ok(prepared);
  assert.deepEqual((prepared!.data as LogSheetData).rows.map((r) => r.masterReading), ["50 mm", "100 mm", "150 mm", "200 mm", "250 mm", "290 mm"]);
});

test("a new F/QC/17 is written as the previous one was: every box and line carried, the date the new day, every box editable", () => {
  const d = doc("qc-ruler-verification");
  const master = masterRepository.get();
  recordRepository.query({ documentId: d.id }).forEach((r) => recordRepository.remove(r.id));
  const first = createRecordForDocument(d, { dateISO: "2026-09-23" }).record;
  assert.equal(hasWriting(layoutOf(d.id), data(first), createDefaultData(d, "2026-09-23", master) as LogSheetData), false, "a sheet nobody wrote on carries nothing");
  const filled: LogSheetData = {
    header: {
      ...data(first).header,
      masterMake: "Kristeen",
      masterSerialNo: "QC-44",
      masterRange: "0 - 600 mm",
      masterLeastCount: "1 mm",
      masterCalibrationDate: "2026-09-23",
      masterCalibrationDueDate: "2027-09-22",
      masterCalibrationReportNo: "CAL/LPI/GP-25/23",
      make: "Ajanta",
      serialNo: "001",
      range: "1 to 300",
      leastCount: "0.001",
      calibrationDate: "2026-09-23",
      calibrationDueDate: "2027-09-22",
    },
    rows: data(first).rows.map((r, i) => ({ ...r, masterReading: `${[100, 200, 300, 400, 500, 600][i]} mm`, observed: [100, 200, 300, 400, 500, 600][i], status: i === 0 ? "Pass" : "", performedBy: i === 0 ? "Roshni" : "" })),
  };
  recordRepository.upsert({ ...first, data: filled, status: "In Progress" });
  // Started by hand (or by Mitra, or from the phone) for the next time: the same sheet, dated the new day.
  const next = createRecordForDocument(d, { dateISO: "2026-10-16" }).record;
  assert.equal(next.id === first.id, false, "a record of its own");
  const h = data(next).header;
  assert.equal(h.masterCalibrationReportNo, "CAL/LPI/GP-25/23");
  assert.equal(h.make, "Ajanta");
  assert.equal(h.calibrationDate, "2026-10-16", "the ruler's calibration date is the record's day, not the last one's");
  assert.equal(h.calibrationDueDate, "2027-09-22", "carried, for the person to change");
  assert.equal(h.acceptableTolerance, "+ / - 1 mm", "the paper's printed box stays the paper's");
  assert.deepEqual(data(next).rows.map((r) => r.masterReading), ["100 mm", "200 mm", "300 mm", "400 mm", "500 mm", "600 mm"], "the 600 mm master's own readings, carried");
  assert.deepEqual(data(next).rows.map((r) => r.observed), [100, 200, 300, 400, 500, 600]);
  assert.equal(data(next).rows[0].difference, "0.0", "worked out again");
  assert.equal(data(next).rows[0].performedBy, "Roshni");
  assert.ok(data(next).rows.every((r, i) => r.id !== data(first).rows[i].id), "its own lines");
  // The morning prepare of the scheduled sheet says the same.
  const prepared = prepareKnownParts(d, "2026-11-16", master, undefined);
  assert.ok(prepared);
  assert.equal((prepared!.data as LogSheetData).header.make, "Ajanta");
  assert.equal((prepared!.data as LogSheetData).rows[3].masterReading, "400 mm");
  assert.match(prepared!.notes[0], /Written as the sheet of 16-Oct-2026 was/);
  assert.match(prepared!.basedOn, /16-Oct-2026/);
  assert.equal(previousWrittenRecord(d.id, "2026-11-16", false, layoutOf(d.id), createDefaultData(d, "2026-11-16", master) as LogSheetData)?.id, next.id, "the latest sheet a person wrote on, confirmed or not");
  recordRepository.query({ documentId: d.id }).forEach((r) => recordRepository.remove(r.id));
});

test("the page on file is a previous sheet: a new F/QC/12 starts as the last week of the 2024 page, dated the new day; a new F/QC/11 as the page of 31.12.2024", () => {
  const master = masterRepository.get();
  const weight = doc("qc-weight-scale-calibration");
  // The pages on file, as the app seeds them at start-up (data/bootstrap.ts).
  for (const page of [SEED_WEIGHT_SCALE_CALIBRATION, SEED_GSM_PLATE_CALIBRATION]) if (!recordRepository.getById(page.id)) recordRepository.upsert(page);
  const onFile = previousWrittenRecord(weight.id, "2026-10-14", false, layoutOf(weight.id), createDefaultData(weight, "2026-10-14", master) as LogSheetData);
  assert.ok(onFile, "the page on file is found");
  assert.match(onFile!.submittedBy ?? "", /as supplied/i, "the plant's own page, transcribed from the owner's paper");
  assert.equal(onFile!.data.header.deviceIdNo, "QC-76");
  const start = startingData(weight, "2026-10-14", false) as LogSheetData;
  assert.equal(start.header.deviceIdNo, "QC-76", "the device carried");
  assert.equal(start.header.acceptableTolerance, "0.05 %", "its tolerance carried");
  assert.equal(start.rows.length, 1, "the week's one line");
  const lastWeek = onFile!.data.rows[onFile!.data.rows.length - 1];
  assert.equal(start.rows[0].date, "2026-10-14", "dated the new day");
  assert.equal(start.rows[0].testedBy, lastWeek.testedBy, "the last week's line, carried");
  assert.equal(start.rows[0].weight4, lastWeek.weight4, "the page's weights, not the standard");
  assert.equal(start.rows[0].testedValue4, lastWeek.testedValue4);
  const gsm = doc("qc-gsm-plate-calibration");
  const gsmStart = startingData(gsm, "2026-10-31", false) as LogSheetData;
  assert.equal(gsmStart.header.calibrationExpiry, "2025-09-22", "F/QC/11's page of 31.12.2024 carried");
  assert.equal(gsmStart.header.calibrationDate, "2026-10-31", "the month's calibration date is the record's day");
  assert.equal(gsmStart.rows.find((r) => r.parameter === "Sign.")?.p54, "Rashmi");
});

test("F/QC/12 and F/QC/11 carry the same way; F/QC/11's four boxes carry what was written over the paper's words; without a previous record the sheet is the paper's blank", () => {
  const master = masterRepository.get();
  const weight = doc("qc-weight-scale-calibration");
  recordRepository.query({ documentId: weight.id }).forEach((r) => recordRepository.remove(r.id));
  assert.equal(previousWrittenRecord(weight.id, "2026-10-14", false, layoutOf(weight.id), createDefaultData(weight, "2026-10-14", master) as LogSheetData), undefined);
  const blankStart = startingData(weight, "2026-10-14", false) as LogSheetData;
  assert.equal(blankStart.header.deviceIdNo, "", "nothing to carry: the paper's blank, its weights written");
  assert.equal(blankStart.rows[0].weight1, "50 gm");
  const week1 = createRecordForDocument(weight, { dateISO: "2026-10-14" }).record;
  const filled: LogSheetData = {
    header: { ...data(week1).header, deviceIdNo: "QC-76", location: "Laboratory", department: "LAB", manufacturer: "Force Strain Sensors", serialNo: "06", calibrationExpiry: "2027-09-20", minReadingCapacity: "0.1 gm", maxReadingCapacity: "600 gm", acceptableTolerance: "0.05 %" },
    rows: [{ ...data(week1).rows[0], testedBy: "Roshni", weight2: "100 gm", testedValue1: "50.004", testedValue2: "100.004", testedValue3: "200.007", testedValue4: "500.010", testedValue5: "600.015", sign: "Kapila Barad", nextDueDate: "2026-10-21" }],
  };
  recordRepository.upsert({ ...week1, data: filled });
  const week2 = createRecordForDocument(weight, { dateISO: "2026-10-21" }).record;
  assert.equal(week2.id === week1.id, false, "the next week is a new record");
  assert.equal(data(week2).header.deviceIdNo, "QC-76");
  assert.equal(data(week2).rows.length, 1);
  assert.equal(data(week2).rows[0].date, "2026-10-21", "dated the new week");
  assert.equal(data(week2).rows[0].testedValue4, "500.010", "carried for the person to change");
  assert.equal(data(week2).rows[0].deviation4, "0.002%", "worked out again");
  assert.equal(data(week2).rows[0].passFail, "Pass");
  recordRepository.query({ documentId: weight.id }).forEach((r) => recordRepository.remove(r.id));

  const gsm = doc("qc-gsm-plate-calibration");
  recordRepository.query({ documentId: gsm.id }).forEach((r) => recordRepository.remove(r.id));
  const sep = createRecordForDocument(gsm, { dateISO: "2026-09-30" }).record;
  const rows = data(sep).rows.map((r) => (r.parameter === "Sign." ? { ...r, p54: "Rashmi" } : r.parameter === "Pass/Fail" ? { ...r, p54: "Pass" } : { ...r, p54: "20 x 20cm" }));
  recordRepository.upsert({ ...sep, data: { header: { ...data(sep).header, deviceIdNo: "typed over", serialNo: "50", calibrationExpiry: "2027-09-20", dueDate: "2026-10-31" }, rows } });
  const carried = carriedFrom(layoutOf(gsm.id), data(recordRepository.getById(sep.id)!), createDefaultData(gsm, "2026-10-31", master) as LogSheetData, "2026-10-31");
  assert.equal(carried.header.deviceIdNo, "typed over", "the person's own words, carried for the person to change (§117)");
  assert.equal(carried.header.location, "LAB", "a box nobody changed keeps the paper's words");
  assert.equal(carried.header.serialNo, "50");
  assert.equal(carried.header.calibrationDate, "2026-10-31", "the month's calibration date is the record's day");
  assert.equal(carried.rows.find((r) => r.parameter === "Sign.")?.p54, "Rashmi");
  assert.deepEqual(carried.rows.map((r) => r.parameter), ["Tasted-1", "2", "3", "4", "Pass/Fail", "Sign."], "the paper's own lines");
  recordRepository.query({ documentId: gsm.id }).forEach((r) => recordRepository.remove(r.id));
});
