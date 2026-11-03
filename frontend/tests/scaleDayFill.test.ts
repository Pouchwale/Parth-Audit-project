// F/QC/12'S WEEKS FILL ON THEIR DAY, AND THE PERSON IS REMINDED EVERY DAY UNTIL THEY CONFIRM (the owner, 30-Oct-2026).
// Run: npm run test:unit -- scaleDayFill
import test from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData, RecordInstance } from "../src/types";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { createDefaultData } from "../src/engine/recordDefaults";
import { fillScaleWeeksDue } from "../src/engine/assistantPrepare";
import { fillScaleLinesDue, READINGS_TO_CONFIRM } from "../src/engine/nominalFill";
import { planNotifications, type PlanPerson, type PlanRecord } from "../src/engine/notificationPlan";

ensureDocumentsSeeded();
ensureMasterSeeded();
const ID = "qc-weight-scale-calibration";
const blank = (): LogSheetData => {
  const fresh = createDefaultData(documentRepository.getByIdUnscoped(ID)!, "2026-11-01", masterRepository.get()) as LogSheetData;
  return { ...fresh, header: { ...fresh.header, acceptableTolerance: "0.05 %" } };
};
const dated = (first: string): LogSheetData => {
  const d = blank();
  return { ...d, rows: d.rows.map((r, i) => ({ ...r, date: ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"][i] })) };
};

test("a line is filled only when its date is today or earlier; a later line stays blank", () => {
  const out = fillScaleLinesDue(dated("2026-11-02"), "2026-11-09")!;
  assert.ok(out.rows[0][READINGS_TO_CONFIRM] && out.rows[1][READINGS_TO_CONFIRM], "weeks 1 and 2 have come");
  for (const i of [2, 3]) {
    assert.ok(!out.rows[i][READINGS_TO_CONFIRM]);
    assert.equal(out.rows[i].testedValue3, "", "a line dated later stays blank");
  }
  for (const i of [0, 1]) for (const k of [3, 4, 5]) assert.match(String(out.rows[i][`testedValue${k}`]), /^\d+\.\d{3}gm$/);
  assert.equal(out.rows[0].testedBy, "", "nobody's name until a person confirms");
  assert.equal(fillScaleLinesDue(out, "2026-11-09"), null, "run again it fills nothing");
  assert.equal(fillScaleLinesDue(dated("2026-11-02"), "2026-11-01"), null, "no line has come yet");
});

test("a line a person has read, or one already waiting to be confirmed, is left", () => {
  const sheet = dated("2026-11-02");
  sheet.rows[0] = { ...sheet.rows[0], testedValue3: "100.002gm" };
  const out = fillScaleLinesDue(sheet, "2026-11-02")!;
  assert.equal(out.rows[0].testedValue3, "100.002gm", "the person's reading stands");
  assert.deepEqual([out.rows[0].testedValue1, out.rows[0].testedValue2], ["0.050mg", "50.000gm"], "the fixed ones come with the day");
  assert.ok(!out.rows[0][READINGS_TO_CONFIRM], "nothing of the person's is put back to confirm");
});

test("the morning prepare fills the weeks whose day has come on a stored sheet, by itself, once", () => {
  recordRepository.query({ documentId: ID }).forEach((r) => recordRepository.remove(r.id));
  const now = new Date().toISOString();
  const rec: RecordInstance = { id: "scale-day", documentId: ID, periodKey: `${ID}:2026-11`, dueDate: "2026-11-01", status: "In Progress", isDemo: false, data: dated("2026-11-02"), createdAt: now, updatedAt: now };
  recordRepository.upsert(rec);
  const first = fillScaleWeeksDue("2026-11-09");
  assert.equal(first.length, 1);
  const rows = (recordRepository.getById("scale-day")!.data as LogSheetData).rows;
  assert.deepEqual(rows.map((r) => Boolean(r[READINGS_TO_CONFIRM])), [true, true, false, false]);
  assert.equal(recordRepository.getById("scale-day")!.history?.at(-1)?.by, "Assistant");
  assert.equal(fillScaleWeeksDue("2026-11-09").length, 0, "nothing more the same day");
  assert.equal(fillScaleWeeksDue("2026-11-16").length, 1, "the next week's day: the next line");
  recordRepository.remove("scale-day");
});

const person: PlanPerson = { id: "u1", name: "Kapila", boss: false, answersFor: new Set([ID]), mayVerify: () => false };
const doc = { id: ID, formatNo: "F/QC/12", name: "Weighing balance", module: "QC", schedule: { type: "monthly" as const, dayOfMonth: 1 } };
const record = (over: Partial<PlanRecord> = {}): PlanRecord => ({ id: "r1", documentId: ID, dueDate: "2026-11-01", status: "In Progress", stored: true, prepared: true, problems: 0, ...over });
const plan = (today: string, rec: PlanRecord) => planNotifications({ today, time: "09:00", documents: [doc], records: [rec], people: [person], isClosedDay: () => false });

test("the responsible person is reminded of each line to confirm, every day, until it is confirmed; two weeks left over give two", () => {
  const one = plan("2026-11-09", record({ toConfirm: ["2026-11-09"] })).filter((i) => i.userId === "u1");
  assert.equal(one.length, 1);
  assert.deepEqual([one[0].kind, one[0].data.confirm, one[0].data.dueDate], ["needs_input", true, "2026-11-09"]);
  const next = plan("2026-11-10", record({ toConfirm: ["2026-11-09"] }));
  assert.notEqual(next[0].key, one[0].key, "a new reminder the next day");
  const both = plan("2026-11-16", record({ toConfirm: ["2026-11-09", "2026-11-16"] }));
  assert.equal(both.length, 2, "kept both");
  assert.equal(plan("2026-11-16", record({ toConfirm: [] })).filter((i) => i.data.confirm).length, 0, "confirmed: no reminder");
  assert.equal(plan("2026-11-09", record({ toConfirm: ["2026-11-16"] })).length, 0, "a later week is not reminded yet");
});

test("a date changed settles the sheet: a week moved to the future loses its readings; one moved to today or earlier is filled, Tested Values 1 and 2 with it", async () => {
  const { settleScaleLines } = await import("../src/engine/nominalFill");
  const { withComputedCells } = await import("../src/engine/computedCells");
  const filled = fillScaleLinesDue(dated("2026-11-02"), "2026-11-23")!;
  assert.deepEqual([1, 2, 3, 4, 5].map((i) => Boolean(filled.rows[3][`testedValue${i}`])), [true, true, true, true, true], "every week filled once its day has come");
  // The last week's date moved to a day that has not come (today is 30-Oct-2026 on the plant's clock here).
  const moved = { ...filled, rows: filled.rows.map((r, i) => (i === 3 ? { ...r, date: "2026-12-30", testedBy: "Kapila", sign: "Kapila", passFail: "Pass" } : r)) };
  const cleared = withComputedCells(ID, settleScaleLines(moved, "2026-11-23"));
  const line = cleared.rows[3];
  for (let i = 1; i <= 5; i++) assert.deepEqual([line[`testedValue${i}`], line[`deviation${i}`]], ["", ""], `Tested Value ${i} and its deviation are out`);
  assert.deepEqual([line.passFail, line.testedBy, line.sign, line[READINGS_TO_CONFIRM] ?? ""], ["", "", "", ""]);
  assert.ok(cleared.rows[0][READINGS_TO_CONFIRM], "weeks that have come are left");
  // Moved back to a day that has come: filled again, with Tested Values 1 and 2.
  const back = settleScaleLines({ ...cleared, rows: cleared.rows.map((r, i) => (i === 3 ? { ...r, date: "2026-11-20" } : r)) }, "2026-11-23");
  assert.deepEqual([back.rows[3].testedValue1, back.rows[3].testedValue2], ["0.050mg", "50.000gm"]);
  assert.ok(back.rows[3][READINGS_TO_CONFIRM] && String(back.rows[3].testedValue3).endsWith("gm"));
  assert.equal(settleScaleLines(back, "2026-11-23"), back, "settled: nothing more to do");
});
