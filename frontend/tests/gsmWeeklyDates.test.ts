// F/QC/11 EVERY TUESDAY, EACH SHEET DATED BY ITS WEEK (REQUIREMENTS §223; the owner, 16-Nov-2026: "weekly frequency ... will
// repeat Tuesday ... it will come of whole month ... date will come according not this"; asked: Tuesday, the Calibration
// Date the week's and the Due Date the next week's, all of a month's Tuesdays, five when the month has five).
// Run: npm run test:unit -- gsmWeeklyDates
import test from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureRecordsSeeded, recordRepository } from "../src/data/repositories/recordRepository";
import { ensureRecordsGeneratedForMonth } from "../src/engine/recordGenerator";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureRecordsSeeded();

const GSM = "qc-gsm-plate-calibration";
const clear = () => recordRepository.removeIds(recordRepository.queryUnscoped({ documentId: GSM }).map((r) => r.id));

test("a month's Tuesdays are all on the screen, each with its Calibration Date and the next week's Due Date", () => {
  assert.deepEqual(documentRepository.getByIdUnscoped(GSM)!.schedule, { type: "weekly", weekday: 2 }, "every Tuesday");
  for (const [month, want] of [
    [11, ["2026-12-01", "2026-12-08", "2026-12-15", "2026-12-22", "2026-12-29"]],
    [0, ["2027-01-05", "2027-01-12", "2027-01-19", "2027-01-26"]],
  ] as const) {
    clear();
    const year = month === 11 ? 2026 : 2027;
    ensureRecordsGeneratedForMonth(year, month, { documentIds: [GSM] });
    const sheets = recordRepository.queryUnscoped({ documentId: GSM, isDemo: false }).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
    assert.deepEqual(sheets.map((r) => r.dueDate), [...want], `${month + 1}/${year}: every Tuesday`);
    for (const r of sheets) {
      const h = (r.data as LogSheetData).header;
      const next = new Date(`${r.dueDate}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 7);
      assert.deepEqual([h.calibrationDate, h.dueDate], [r.dueDate, next.toISOString().slice(0, 10)], r.dueDate);
    }
  }
  clear();
});
