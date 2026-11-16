// F/QC/12: A LINE FOR EACH WEEK OF THE MONTH, FOUR OR FIVE, THE MONTH STARTING ON THE LAST ONE'S NEXT DUE DATE (REQUIREMENTS
// §235; the owner, 16-Nov-2026, with November's page 01-11 … 22-11, Next Due Date 29-11: "when december month will start
// then it should start with 29-11-2026"; asked: a week is the month's that holds most of its seven days).
// Run: npm run test:unit -- scaleWeeks
import test from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData, LogSheetRow, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { createDefaultData } from "../src/engine/recordDefaults";
import { scaleWeeksIn, weekMonth, withScaleWeeks } from "../src/engine/scaleWeeks";
import { scaleSheetFitted, scaleWeeksOnOpenSheets } from "../src/data/scaleWeeksMigration";
import { writableFrom, waitsUntil } from "../src/engine/notBeforeDay";

ensureDocumentsSeeded();
ensureMasterSeeded();
const SCALE = "qc-weight-scale-calibration";

test("the weeks of a month: those whose middle day is in it, a week apart from the first", () => {
  assert.deepEqual(scaleWeeksIn("2026-11", "2026-11-01"), ["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22"], "November: four, 29-11's week is December's");
  assert.deepEqual(scaleWeeksIn("2026-12", "2026-11-29"), ["2026-11-29", "2026-12-06", "2026-12-13", "2026-12-20", "2026-12-27"], "December: five, from 29-11");
  assert.deepEqual(scaleWeeksIn("2027-01", "2027-01-03"), ["2027-01-03", "2027-01-10", "2027-01-17", "2027-01-24"]);
  assert.deepEqual(scaleWeeksIn("2027-02", "2027-01-31"), ["2027-01-31", "2027-02-07", "2027-02-14", "2027-02-21"]);
  assert.deepEqual(scaleWeeksIn("2027-03", "2027-02-28"), ["2027-02-28", "2027-03-07", "2027-03-14", "2027-03-21", "2027-03-28"]);
  assert.equal(weekMonth("2026-11-29"), "2026-12");
  assert.deepEqual(scaleWeeksIn("2026-12", ""), []);
  assert.deepEqual(scaleWeeksIn("2026-11", "2026-11-29"), [], "a first week that is not the month's: the lines left as they are");
  assert.deepEqual(scaleWeeksIn("2026-11", "2024-04-03"), [], "a first date from a sheet of long ago: the same");
});

test("a sheet's lines fitted: added for a fifth week, a blank fifth taken off, a written one never", () => {
  const line = (date: string, read = false): LogSheetRow => ({ id: `r-${date || Math.random()}`, date, testedValue3: read ? "100.004gm" : "" }) as LogSheetRow;
  const four: LogSheetData = { header: {}, rows: ["2026-11-29", "", "", ""].map((d) => line(d)) };
  let n = 0;
  const added = withScaleWeeks(four, "2026-12", null, () => ({ id: `new-${++n}` }) as LogSheetRow)!;
  assert.equal(added.rows.length, 5);
  const five: LogSheetData = { header: {}, rows: ["2026-11-01", "", "", "", ""].map((d) => line(d)) };
  assert.equal(withScaleWeeks(five, "2026-11", null, () => ({ id: "x" }) as LogSheetRow)!.rows.length, 4, "November's blank fifth line off");
  const written: LogSheetData = { header: {}, rows: [line("2026-11-01"), line(""), line(""), line(""), line("", true)] };
  assert.equal(withScaleWeeks(written, "2026-11", null, () => ({ id: "x" }) as LogSheetRow), null, "a line with a reading stays");
  assert.equal(withScaleWeeks({ header: {}, rows: [line(""), line(""), line(""), line("")] }, "2026-12", "2026-11-29", () => ({ id: `n${++n}` }) as LogSheetRow)!.rows.length, 5, "no date yet: counted from the last sheet's Next Due Date");
});

test("December's sheet after November's: five lines, 29-11 to 27-12, Next Due Date 03-01; it opens on 29-11", () => {
  recordRepository.query({ documentId: SCALE }).forEach((r) => recordRepository.remove(r.id));
  const d = documentRepository.getByIdUnscoped(SCALE)!;
  const now = new Date().toISOString();
  const blank = (due: string) => createDefaultData(d, due, masterRepository.get()) as LogSheetData;
  const nov = blank("2026-11-01");
  const novRows = nov.rows.map((r, i) => ({ ...r, date: ["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22"][i], nextDueDate: ["2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29"][i] }));
  recordRepository.upsert({ id: "nov", documentId: SCALE, periodKey: `${SCALE}:2026-11`, dueDate: "2026-11-01", status: "In Progress", isDemo: false, data: { ...nov, rows: novRows }, createdAt: now, updatedAt: now });
  const dec: RecordInstance = { id: "dec", documentId: SCALE, periodKey: `${SCALE}:2026-12`, dueDate: "2026-12-01", status: "Scheduled", isDemo: false, data: blank("2026-12-01"), createdAt: now, updatedAt: now };
  recordRepository.upsert(dec);
  assert.equal(scaleSheetFitted(recordRepository.getById("nov")!), null, "November keeps its four");
  // Opened: the first date from November's last Next Due Date (engine/calibrationWeeks.ts), then the lines fitted.
  const opened = { ...(dec.data as LogSheetData), rows: (dec.data as LogSheetData).rows.map((r, i) => (i === 0 ? { ...r, date: "2026-11-29" } : r)) };
  const fitted = scaleSheetFitted(dec, opened)!;
  assert.deepEqual(fitted.rows.map((r) => r.date), ["2026-11-29", "2026-12-06", "2026-12-13", "2026-12-20", "2026-12-27"]);
  assert.equal(fitted.rows[4].nextDueDate, "2027-01-03");
  assert.equal(fitted.rows[4].weight3, "100.000gm", "the added line on the fixed weights");
  // At start, before anyone opens it: the fifth line is there already.
  assert.equal(scaleWeeksOnOpenSheets(), 1);
  assert.equal((recordRepository.getById("dec")!.data as LogSheetData).rows.length, 5);
  assert.equal(scaleWeeksOnOpenSheets(), 0, "nothing to do the next time");
  assert.equal(writableFrom({ ...d, id: SCALE }, dec), "2026-11-28", "it opens three days before the 1st: with its first week");
  assert.equal(waitsUntil(d, dec, "2026-11-29"), null, "on 29-11 December's sheet is written");
  assert.equal(waitsUntil(d, dec, "2026-11-27"), "2026-11-28");
  // A December sheet opened before November had its last week, dated 13-12 with nothing read on it: dated again from 29-11.
  const early = recordRepository.getById("dec")!;
  const ed = early.data as LogSheetData;
  recordRepository.upsert({ ...early, data: { ...ed, rows: ed.rows.slice(0, 3).map((r, i) => ({ ...r, date: ["2026-12-13", "2026-12-20", "2026-12-27"][i], nextDueDate: ["2026-12-20", "2026-12-27", "2027-01-03"][i] })) } });
  assert.equal(scaleWeeksOnOpenSheets(), 1);
  const again = recordRepository.getById("dec")!.data as LogSheetData;
  assert.deepEqual(again.rows.map((r) => [r.date, r.nextDueDate]), [["2026-11-29", "2026-12-06"], ["2026-12-06", "2026-12-13"], ["2026-12-13", "2026-12-20"], ["2026-12-20", "2026-12-27"], ["2026-12-27", "2027-01-03"]]);
  // ...but a sheet with a reading on it keeps its dates.
  recordRepository.upsert({ ...early, data: { ...ed, rows: ed.rows.slice(0, 3).map((r, i) => ({ ...r, date: ["2026-12-13", "2026-12-20", "2026-12-27"][i], nextDueDate: "", testedValue3: i === 0 ? "100.002gm" : "" })) } });
  scaleWeeksOnOpenSheets();
  assert.equal((recordRepository.getById("dec")!.data as LogSheetData).rows[0].date, "2026-12-13", "a sheet with a reading keeps its dates");
  recordRepository.query({ documentId: SCALE }).forEach((r) => recordRepository.remove(r.id));
});
