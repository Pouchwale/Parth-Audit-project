// THE CALIBRATION CERTIFICATES' DATES ON EVERY NEW SHEET, AND F/QC/17'S 600 MM PAGE AS UPDATED (the owner, 27-Oct-2026):
//   "in qc 12 and 11 calibration date, calibration due date and is fix which is 21-9-26 and due date is 20-9-27 and in
//    below measuring scale (ruler) under calibration details are two date called calibration date and calibration due
//    date which is 23-9-26 and calibration due date is 22-9-27 ... make sure it is editable"
// and on 28-Oct-2026: "you need to add calibration expiry date is 20-9-27 in qc-11 and 12 and in Measuring Scale (Ruler)
// ... there is calibration date in upper portion" (the master scale's: "Calibration 21-9-26, due date 20-9-27"), F/QC/11's
// I. Calibration Date / Due Date row "remove whole that row", and the 600 mm page's last point "490 mm, exactly as printed";
// held to it:
//   * a new F/QC/12 and a new F/QC/11 start with Calibration Expiry 20-09-27 (F/QC/11's I. Calibration Date / Due Date
//     row is taken away); a new F/QC/17 of either scale with the master's Calibration date 21-09-26 and due date
//     20-09-27 and the ruler's 23-09-26 and 22-09-27 - every one an editable date box, nothing observed;
//   * a sheet keeps the later of the last sheet's date and these: the pages of 2024 on file never bring theirs back, a
//     later certificate written carries on, an earlier one written is not carried over the certificate's;
//   * the 600 mm page reads GP-3/MS/36, 0-600mm, 100 to 500 mm and 490 mm; a sheet written on a former page's 50 to
//     290 mm or 100 to 590 mm carries its boxes but not its lines; master readings a person wrote over the points still
//     carry (§117); an open sheet still on a former page's lines with nothing written on them takes the page's own (§132);
//   * Demo Mode keeps its own simulated calibration, dated by its sheets.
//   * a sheet the schedule made blank ahead of its day, opened by New record before its morning prepare (found on
//     Tuesday 27-Oct-2026: F/QC/12's Wednesday sheet), is written as the last one was then (§117).
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
import { MASTER_CERTIFICATE, RULER_300_ID, RULER_600_ID, RULER_CERTIFICATE, rulerScaleOf } from "../src/data/seed/qcRulerVerificationLayouts";
import { alignCertificateDates, PAGE_LINES_NOTE } from "../src/data/certificateDatesMigration";
import { createDefaultData } from "../src/engine/recordDefaults";
import { createRecordForDocument, startingData } from "../src/engine/recordCrud";
import { prepareKnownParts } from "../src/engine/knownParts";
import { boxKind } from "../src/engine/observations";
import { autoFillRecord } from "../src/engine/autoFill";
import { periodKeyFor } from "../src/engine/recordGenerator";

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
    [RULER_600_ID, "masterCalibrationDate", "2026-09-21"],
    [RULER_600_ID, "masterCalibrationDueDate", "2027-09-20"],
    [RULER_300_ID, "masterCalibrationDate", "2026-09-21"],
    [RULER_300_ID, "masterCalibrationDueDate", "2027-09-20"],
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
  assert.deepEqual(MASTER_CERTIFICATE, { date: "2026-09-21", due: "2027-09-20" }, "F/QC/17's master scale: 21-09-26, due 20-09-27 (28-Oct-2026)");
  for (const id of [RULER_600_ID, RULER_300_ID]) assert.equal(box(id, "masterCalibrationReportNo").autoFill, undefined, `${id}: the report number stays the person's to write`);
  // F/QC/11's I. Calibration Date:- / Due Date:- row is taken away (the owner, 28-Oct-2026): its Calibration Expiry holds the due date.
  assert.deepEqual(layoutOf(GSM).headerFields.filter((f) => f.key === "calibrationDate" || f.key === "dueDate"), []);
});

test("a new sheet with nothing before it starts with them: F/QC/12, F/QC/11 and both F/QC/17 pages", () => {
  for (const id of [SCALE, GSM, RULER_600_ID, RULER_300_ID]) clear(id);
  const scale = data(createRecordForDocument(doc(SCALE), { dateISO: "2026-10-28" }).record);
  assert.equal(scale.header.calibrationExpiry, "2027-09-20");
  const gsm = data(createRecordForDocument(doc(GSM), { dateISO: "2026-11-01" }).record);
  assert.equal(gsm.header.calibrationExpiry, "2027-09-20");
  assert.ok(!("calibrationDate" in gsm.header) && !("dueDate" in gsm.header), "no row of its own for them any more");
  for (const id of [RULER_600_ID, RULER_300_ID]) {
    const ruler = data(createRecordForDocument(doc(id), { dateISO: "2026-10-28" }).record);
    assert.deepEqual([ruler.header.calibrationDate, ruler.header.calibrationDueDate], ["2026-09-23", "2027-09-22"], id);
    assert.deepEqual([ruler.header.masterCalibrationDate, ruler.header.masterCalibrationDueDate], ["2026-09-21", "2027-09-20"], `${id}: the master scale's certificate`);
    assert.equal(ruler.header.masterCalibrationReportNo, "", `${id}: its report number stays the person's`);
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
  assert.equal(gsm.header.calibrationExpiry, "2027-09-20", "not the page's 22.09.2025");
  assert.ok(!("calibrationDate" in gsm.header) && !("dueDate" in gsm.header), "nor its 31.12.2024: the row is taken away");
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

test("the 600 mm page as updated: GP-3/MS/36, 0-600mm, 100 to 500 mm and 490 mm as printed, its picture and its PDF cited", () => {
  const scale = rulerScaleOf(RULER_600_ID)!;
  assert.deepEqual([scale.serialNo, scale.range, [...scale.points]], ["GP-3/MS/36", "0-600mm", [100, 200, 300, 400, 500, 490]], "the last as the page prints it (28-Oct-2026)");
  const blank = createDefaultData(doc(RULER_600_ID), "2026-10-28", master) as LogSheetData;
  assert.deepEqual(blank.rows.map((r) => r.masterReading), ["100 mm", "200 mm", "300 mm", "400 mm", "500 mm", "490 mm"]);
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
  assert.deepEqual(afterOld.rows.map((r) => r.masterReading), ["100 mm", "200 mm", "300 mm", "400 mm", "500 mm", "490 mm"], "the updated page's points");
  assert.ok(afterOld.rows.every((r) => (r.observed === null || r.observed === "") && r.status === "" && r.performedBy === ""), "no reading of the old page's points on the new lines");
  clear(d.id);
  // The page of 27-Oct-2026, its last point read as 590: a former page too.
  fill("2026-10-20", ["100 mm", "200 mm", "300 mm", "400 mm", "500 mm", "590 mm"], [100, 200, 300, 400, 500, 590]);
  const afterMid = data(createRecordForDocument(d, { dateISO: "2026-10-28" }).record);
  assert.deepEqual(afterMid.rows.map((r) => r.masterReading), ["100 mm", "200 mm", "300 mm", "400 mm", "500 mm", "490 mm"], "490 mm as printed");
  assert.ok(afterMid.rows.every((r) => r.observed === null || r.observed === ""), "no reading of the 590 mm line on the 490 mm one");
  assert.equal(afterMid.header.make, "Ajanta", "the boxes carried");
  clear(d.id);
  fill("2026-10-20", null, [100, 200, 300, 400, 500, 490]);
  const afterNew = data(createRecordForDocument(d, { dateISO: "2026-10-28" }).record);
  assert.deepEqual(afterNew.rows.map((r) => r.observed), [100, 200, 300, 400, 500, 490], "the last sheet's own readings, carried for the person to change (§117)");
  clear(d.id);
  fill("2026-10-20", ["100 mm", "200 mm", "300 mm", "400 mm", "500 mm", "600 mm"], [100, 200, 300, 400, 500, 600]);
  const afterOwn = data(createRecordForDocument(d, { dateISO: "2026-10-28" }).record);
  assert.deepEqual(afterOwn.rows.map((r) => r.masterReading), ["100 mm", "200 mm", "300 mm", "400 mm", "500 mm", "600 mm"], "the master's own readings a person wrote, carried");
  clear(d.id);
});

test("Demo Mode keeps its own simulated calibration, dated by its sheets", () => {
  const gsm = autoFillRecord(doc(GSM), "2026-03-02", master, undefined)!.data as LogSheetData;
  assert.ok(!("calibrationDate" in gsm.header), "F/QC/11's row is taken away in Demo Mode too");
  assert.ok(String(gsm.header.calibrationExpiry) > "2026-03-02");
  for (const id of [RULER_600_ID, RULER_300_ID]) {
    const ruler = autoFillRecord(doc(id), "2026-03-02", master, undefined)!.data as LogSheetData;
    assert.equal(ruler.header.calibrationDate, "2026-03-02", id);
    assert.equal(ruler.header.masterCalibrationDate, "2025-09-23", `${id}: the master's simulated calibration before that day`);
  }
});

test("an open 600 mm sheet still on a former page's lines, nothing written on them, takes the page's own (§132); one with a reading, or handed in, is left", () => {
  clear(RULER_600_ID);
  const now = new Date().toISOString();
  const sheet = (id: string, status: RecordInstance["status"], points: number[], observed: (number | null)[]): string => {
    const blank = createDefaultData(doc(RULER_600_ID), "2026-10-28", master) as LogSheetData;
    const rows = blank.rows.map((r, i) => ({ ...r, masterReading: `${points[i]} mm`, observed: observed[i] }));
    recordRepository.upsert({ id, documentId: RULER_600_ID, periodKey: `${RULER_600_ID}:${id}`, dueDate: "2026-10-28", status, isDemo: false, data: { ...blank, rows }, createdAt: now, updatedAt: now });
    return id;
  };
  const OLD = [50, 100, 150, 200, 250, 290];
  const MID = [100, 200, 300, 400, 500, 590];
  const NONE = [null, null, null, null, null, null];
  const fresh = sheet("ruler-fresh", "Due", MID, NONE);
  const older = sheet("ruler-older", "In Progress", OLD, NONE);
  const read = sheet("ruler-read", "In Progress", MID, MID);
  const handedIn = sheet("ruler-handed-in", "Pending Verification", MID, NONE);
  const lines = (id: string) => data(recordRepository.getById(id)!).rows.map((r) => r.masterReading);
  alignCertificateDates();
  for (const id of [fresh, older]) {
    assert.deepEqual(lines(id), ["100 mm", "200 mm", "300 mm", "400 mm", "500 mm", "490 mm"], id);
    assert.ok(recordRepository.getById(id)!.history?.some((e) => e.note?.includes(PAGE_LINES_NOTE)), `${id}: a line in its history`);
    assert.deepEqual(data(recordRepository.getById(id)!).rows.map((r) => r.observed), NONE, `${id}: nothing written for anybody`);
  }
  assert.deepEqual(lines(read), ["100 mm", "200 mm", "300 mm", "400 mm", "500 mm", "590 mm"], "a reading written: the person's lines, left");
  assert.deepEqual(lines(handedIn), ["100 mm", "200 mm", "300 mm", "400 mm", "500 mm", "590 mm"], "a sheet handed in is left as handed in");
  assert.equal(alignCertificateDates(), 0, "nothing to do the next time");
  clear(RULER_600_ID);
});

test("a sheet the schedule made blank ahead of its day is written as the last one was when New record opens it; one written on, or prepared, is left as it is", () => {
  const d = doc(SCALE);
  clear(SCALE);
  if (!recordRepository.getById(SEED_WEIGHT_SCALE_CALIBRATION.id)) recordRepository.upsert(SEED_WEIGHT_SCALE_CALIBRATION);
  const shell = (due: string, over: Partial<RecordInstance> = {}): RecordInstance => {
    const now = new Date().toISOString();
    const r = { id: `rec-shell-${due}`, documentId: SCALE, periodKey: periodKeyFor(d, due), dueDate: due, status: "Due" as const, isDemo: false, data: createDefaultData(d, due, master), createdAt: now, updatedAt: now, ...over };
    recordRepository.upsert(r);
    return r;
  };
  shell("2026-10-28");
  const opened = createRecordForDocument(d, { dateISO: "2026-10-28" });
  assert.equal(opened.existed, true, "the schedule's own sheet, not a second one");
  assert.equal(opened.record.id, "rec-shell-2026-10-28");
  const h = data(opened.record).header;
  assert.deepEqual([h.deviceIdNo, h.acceptableTolerance, h.calibrationExpiry], ["QC-76", "0.05 %", "2027-09-20"], "the page on file's boxes, the certificate's expiry");
  assert.equal(data(opened.record).rows[0].date, "2026-10-28", "the line dated its own day");
  assert.equal(data(recordRepository.getById("rec-shell-2026-10-28")!).header.deviceIdNo, "QC-76", "and kept so");
  clear(SCALE);
  // Somebody wrote on it already: left as written.
  const written = shell("2026-10-28");
  recordRepository.upsert({ ...written, data: { ...data(written), header: { ...data(written).header, deviceIdNo: "QC-99" } } });
  if (!recordRepository.getById(SEED_WEIGHT_SCALE_CALIBRATION.id)) recordRepository.upsert(SEED_WEIGHT_SCALE_CALIBRATION);
  assert.equal(data(createRecordForDocument(d, { dateISO: "2026-10-28" }).record).header.deviceIdNo, "QC-99");
  clear(SCALE);
  // Prepared already (the morning prepare's own): left as prepared.
  shell("2026-10-28", { prepared: { at: new Date().toISOString(), waiting: 1, notes: [] } as unknown as RecordInstance["prepared"] });
  if (!recordRepository.getById(SEED_WEIGHT_SCALE_CALIBRATION.id)) recordRepository.upsert(SEED_WEIGHT_SCALE_CALIBRATION);
  assert.equal(data(createRecordForDocument(d, { dateISO: "2026-10-28" }).record).header.deviceIdNo, "");
  clear(SCALE);
});
