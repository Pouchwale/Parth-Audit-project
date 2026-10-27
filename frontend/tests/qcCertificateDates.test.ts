// THE CALIBRATION CERTIFICATES' DATES ON EVERY NEW SHEET, AND F/QC/17'S 600 MM PAGE AS UPDATED (the owner, 27-Oct-2026):
//   "in qc 12 and 11 calibration date, calibration due date and is fix which is 21-9-26 and due date is 20-9-27 and in
//    below measuring scale (ruler) under calibration details are two date called calibration date and calibration due
//    date which is 23-9-26 and calibration due date is 22-9-27 ... make sure it is editable"
// held to it:
//   * a new F/QC/12 starts with Calibration Expiry 20-09-27; a new F/QC/11 with Calibration Expiry and Due Date 20-09-27
//     and I. Calibration Date 21-09-26; a new F/QC/17 of either scale with the ruler's Calibration date 23-09-26 and
//     Calibration due date 22-09-27 - every one an editable date box, nothing observed;
//   * a sheet keeps the later of the last sheet's date and these: the pages of 2024 on file never bring theirs back, a
//     later certificate written carries on, an earlier one written is not carried over the certificate's;
//   * the 600 mm page reads GP-3/MS/36, 0-600mm, 100 to 590 mm; a sheet written on the old page's 50 to 290 mm carries
//     its boxes but not its lines; master readings a person wrote over the points still carry (§117);
//   * Demo Mode keeps its own simulated calibration, dated by its sheets.
// Run: npm run test:unit -- qcCertificateDates
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import type { DocumentDefinition, LogSheetData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { CALIBRATION_CERTIFICATE } from "../src/data/seed/qcCalibrationLayouts";
import { SEED_GSM_PLATE_CALIBRATION, SEED_WEIGHT_SCALE_CALIBRATION } from "../src/data/seed/qcCalibrationRecords";
import { RULER_300_ID, RULER_600_ID, RULER_CERTIFICATE, rulerScaleOf } from "../src/data/seed/qcRulerVerificationLayouts";
import { createDefaultData } from "../src/engine/recordDefaults";
import { createRecordForDocument, startingData } from "../src/engine/recordCrud";
import { prepareKnownParts } from "../src/engine/knownParts";
import { boxKind } from "../src/engine/observations";
import { autoFillRecord } from "../src/engine/autoFill";

ensureDocumentsSeeded();
ensureMasterSeeded();

const ROOT = process.env.DCRS_REPO_ROOT ?? process.cwd();
const SCALE = "qc-weight-scale-calibration";
const GSM = "qc-gsm-plate-calibration";
const master = masterRepository.get();
const doc = (id: string): DocumentDefinition => documentRepository.getByIdUnscoped(id)!;
const layoutOf = (id: string) => getLogSheetLayout(id)!;
const data = (r: RecordInstance): LogSheetData => r.data as LogSheetData;
const clear = (id: string) => recordRepository.query({ documentId: id }).forEach((r) => recordRepository.remove(r.id));
const box = (id: string, key: string) => layoutOf(id).headerFields.find((f) => f.key === key)!;

test("the dates the owner gave, as the formats hold them", () => {
  assert.deepEqual(CALIBRATION_CERTIFICATE, { date: "2026-09-21", due: "2027-09-20" }, "F/QC/11 and F/QC/12: 21-09-26, due 20-09-27");
  assert.deepEqual(RULER_CERTIFICATE, { date: "2026-09-23", due: "2027-09-22" }, "F/QC/17's ruler: 23-09-26, due 22-09-27");
  const boxes: [string, string, string][] = [
    [SCALE, "calibrationExpiry", "2027-09-20"],
    [GSM, "calibrationExpiry", "2027-09-20"],
    [GSM, "calibrationDate", "2026-09-21"],
    [GSM, "dueDate", "2027-09-20"],
    [RULER_600_ID, "calibrationDate", "2026-09-23"],
    [RULER_600_ID, "calibrationDueDate", "2027-09-22"],
    [RULER_300_ID, "calibrationDate", "2026-09-23"],
    [RULER_300_ID, "calibrationDueDate", "2027-09-22"],
  ];
  for (const [id, key, date] of boxes) {
    const f = box(id, key);
    assert.equal(f.autoFill?.default, date, `${id} ${key}`);
    assert.equal(f.autoFill?.newest, true, `${id} ${key}: the later date is kept`);
    // Editable: a date box the person writes over - never printed, never worked out, never the record's own day.
    assert.equal(f.type, "date", `${id} ${key}`);
    assert.ok(f.printed === undefined && !f.computed && !f.autoFill?.dueDate, `${id} ${key}: editable`);
    assert.equal(boxKind(f, layoutOf(id)), "standing", `${id} ${key}: the instrument's, not something observed`);
  }
  // The master scale's own certificate is the person's to write, as before (not given by the owner).
  assert.equal(box(RULER_600_ID, "masterCalibrationDate").autoFill, undefined);
});

test("a new sheet with nothing before it starts with them: F/QC/12, F/QC/11 and both F/QC/17 pages", () => {
  for (const id of [SCALE, GSM, RULER_600_ID, RULER_300_ID]) clear(id);
  const scale = data(createRecordForDocument(doc(SCALE), { dateISO: "2026-10-28" }).record);
  assert.equal(scale.header.calibrationExpiry, "2027-09-20");
  const gsm = data(createRecordForDocument(doc(GSM), { dateISO: "2026-11-01" }).record);
  assert.deepEqual([gsm.header.calibrationExpiry, gsm.header.calibrationDate, gsm.header.dueDate], ["2027-09-20", "2026-09-21", "2027-09-20"]);
  for (const id of [RULER_600_ID, RULER_300_ID]) {
    const ruler = data(createRecordForDocument(doc(id), { dateISO: "2026-10-28" }).record);
    assert.deepEqual([ruler.header.calibrationDate, ruler.header.calibrationDueDate], ["2026-09-23", "2027-09-22"], id);
    assert.equal(ruler.header.masterCalibrationDate, "", `${id}: the master's own certificate stays the person's`);
  }
  // The morning prepare of a scheduled sheet says the same.
  const prepared = prepareKnownParts(doc(SCALE), "2026-11-04", master, undefined)!.data as LogSheetData;
  assert.equal(prepared.header.calibrationExpiry, "2027-09-20");
  for (const id of [SCALE, GSM, RULER_600_ID, RULER_300_ID]) clear(id);
});

test("from the pages of 2024 on file, the certificate's dates and not the pages'; a later date written carries on, an earlier one does not", () => {
  for (const page of [SEED_WEIGHT_SCALE_CALIBRATION, SEED_GSM_PLATE_CALIBRATION]) if (!recordRepository.getById(page.id)) recordRepository.upsert(page);
  const scale = startingData(doc(SCALE), "2026-10-28", false) as LogSheetData;
  assert.equal(scale.header.calibrationExpiry, "2027-09-20", "not the page's 27.08.2024");
  assert.equal(scale.header.deviceIdNo, "QC-76", "the rest of the page carried as before (§117)");
  const gsm = startingData(doc(GSM), "2026-11-01", false) as LogSheetData;
  assert.deepEqual([gsm.header.calibrationExpiry, gsm.header.calibrationDate, gsm.header.dueDate], ["2027-09-20", "2026-09-21", "2027-09-20"], "not the page's 22.09.2025 and 31.12.2024");
  clear(SCALE);
  // The next certificate, written on a sheet: a new sheet carries it, the later date.
  const week = createRecordForDocument(doc(SCALE), { dateISO: "2027-09-22" }).record;
  recordRepository.upsert({ ...week, status: "In Progress", data: { ...data(week), header: { ...data(week).header, calibrationExpiry: "2028-09-19" } } });
  assert.equal(data(createRecordForDocument(doc(SCALE), { dateISO: "2027-09-29" }).record).header.calibrationExpiry, "2028-09-19", "the next certificate carries");
  clear(SCALE);
  // An earlier date written on a sheet (an old certificate typed by mistake) does not come back over the certificate's.
  const early = createRecordForDocument(doc(SCALE), { dateISO: "2026-10-28" }).record;
  recordRepository.upsert({ ...early, status: "In Progress", data: { ...data(early), header: { ...data(early).header, calibrationExpiry: "2025-01-01", deviceIdNo: "QC-76" } } });
  const after = data(createRecordForDocument(doc(SCALE), { dateISO: "2026-11-04" }).record);
  assert.equal(after.header.calibrationExpiry, "2027-09-20");
  assert.equal(after.header.deviceIdNo, "QC-76", "what was written elsewhere still carries");
  clear(SCALE);
});

test("the 600 mm page as updated: GP-3/MS/36, 0-600mm, 100 to 590 mm, its picture and its PDF cited", () => {
  const scale = rulerScaleOf(RULER_600_ID)!;
  assert.deepEqual([scale.serialNo, scale.range, [...scale.points]], ["GP-3/MS/36", "0-600mm", [100, 200, 300, 400, 500, 590]]);
  const blank = createDefaultData(doc(RULER_600_ID), "2026-10-28", master) as LogSheetData;
  assert.deepEqual(blank.rows.map((r) => r.masterReading), ["100 mm", "200 mm", "300 mm", "400 mm", "500 mm", "590 mm"]);
  assert.deepEqual([blank.header.serialNo, blank.header.range], ["GP-3/MS/36", "0-600mm"]);
  const page = layoutOf(RULER_600_ID).originalPages![0];
  const src = typeof page === "string" ? page : page.src;
  assert.equal(src, "/source/fqc17-600-ruler-internal-verification.jpg");
  assert.ok(existsSync(path.join(ROOT, "frontend", "public", src.replace(/^\//, ""))), src);
  assert.match(doc(RULER_600_ID).sourceFile ?? "", /600 mm- Copy\.pdf \(the 600 mm scale's page as updated, supplied 27-Oct-2026/);
  assert.ok(existsSync(path.join(ROOT, "source-documents", "Copy of F-QC-17-Updated Scale (Ruler) internal verification record 600 mm- Copy.pdf")));
  // The 300 mm page is unchanged.
  assert.deepEqual([...rulerScaleOf(RULER_300_ID)!.points], [50, 100, 150, 200, 250, 290]);
});

test("a 600 mm sheet written on the old page's points carries its boxes, not its lines; one on the new points, or with the person's own master readings, carries its lines", () => {
  const d = doc(RULER_600_ID);
  const fill = (dateISO: string, points: string[] | null, observed: number[]) => {
    const r = createRecordForDocument(d, { dateISO }).record;
    const rows = data(r).rows.map((row, i) => ({ ...row, ...(points ? { masterReading: points[i] } : {}), observed: observed[i], status: i === 0 ? "Pass" : "", performedBy: i === 0 ? "Kapila Barad" : "" }));
    recordRepository.upsert({ ...r, status: "In Progress", data: { header: { ...data(r).header, make: "Ajanta", masterCalibrationReportNo: "CAL/LPI/GP-23/25" }, rows } });
  };
  clear(d.id);
  fill("2026-10-20", ["50 mm", "100 mm", "150 mm", "200 mm", "250 mm", "290 mm"], [50, 100, 150, 200, 250, 290]);
  const afterOld = data(createRecordForDocument(d, { dateISO: "2026-10-28" }).record);
  assert.equal(afterOld.header.make, "Ajanta", "the boxes carried");
  assert.equal(afterOld.header.masterCalibrationReportNo, "CAL/LPI/GP-23/25");
  assert.deepEqual(afterOld.rows.map((r) => r.masterReading), ["100 mm", "200 mm", "300 mm", "400 mm", "500 mm", "590 mm"], "the updated page's points");
  assert.ok(afterOld.rows.every((r) => (r.observed === null || r.observed === "") && r.status === "" && r.performedBy === ""), "no reading of the old page's points on the new lines");
  clear(d.id);
  fill("2026-10-20", null, [100, 200, 300, 400, 500, 590]);
  const afterNew = data(createRecordForDocument(d, { dateISO: "2026-10-28" }).record);
  assert.deepEqual(afterNew.rows.map((r) => r.observed), [100, 200, 300, 400, 500, 590], "the last sheet's own readings, carried for the person to change (§117)");
  clear(d.id);
  fill("2026-10-20", ["100 mm", "200 mm", "300 mm", "400 mm", "500 mm", "600 mm"], [100, 200, 300, 400, 500, 600]);
  const afterOwn = data(createRecordForDocument(d, { dateISO: "2026-10-28" }).record);
  assert.deepEqual(afterOwn.rows.map((r) => r.masterReading), ["100 mm", "200 mm", "300 mm", "400 mm", "500 mm", "600 mm"], "the master's own readings a person wrote, carried");
  clear(d.id);
});

test("Demo Mode keeps its own simulated calibration, dated by its sheets", () => {
  const gsm = autoFillRecord(doc(GSM), "2026-03-02", master, undefined)!.data as LogSheetData;
  assert.equal(gsm.header.calibrationDate, "2026-03-02", "a demo month's calibration is that month's");
  assert.ok(String(gsm.header.calibrationExpiry) > "2026-03-02");
  for (const id of [RULER_600_ID, RULER_300_ID]) {
    const ruler = autoFillRecord(doc(id), "2026-03-02", master, undefined)!.data as LogSheetData;
    assert.equal(ruler.header.calibrationDate, "2026-03-02", id);
  }
});
