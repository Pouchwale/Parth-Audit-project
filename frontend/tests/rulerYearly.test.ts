// F/QC/17 ONCE A YEAR (the owner, 30-10-2026: "the frequence of it is 1 year. once in a year on any random date but make
// sure that date remains the same every year and only when there is a holiday or something like that in that case only
// the date might shift. and on that date every year the document should be filled and the notification should be seen
// that fill the remaining 2 boxes manually that we left to be filled and submit that document").
import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition, LogSheetData } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { RULER_300_ID, RULER_600_ID, RULER_YEARLY_NOTE } from "../src/data/seed/qcRulerVerificationLayouts";
import { effectiveDueDatesInMonth } from "../src/engine/holidays";
import { prepareKnownParts } from "../src/engine/knownParts";
import { createRecordForDocument } from "../src/engine/recordCrud";
import { reminderNoteFor } from "../src/engine/reminders";

ensureDocumentsSeeded();
ensureMasterSeeded();
const master = masterRepository.get();
const doc = (id: string): DocumentDefinition => documentRepository.getByIdUnscoped(id)!;
const clear = (id: string) => recordRepository.query({ documentId: id }).forEach((r) => recordRepository.remove(r.id));

test("both F/QC/17 documents are yearly, on 24 September, from 30-10-2026", () => {
  for (const id of [RULER_600_ID, RULER_300_ID]) {
    const d = doc(id);
    assert.deepEqual([d.frequency, d.schedule, d.scheduleSince], ["Yearly", { type: "yearly", month: 8, dayOfMonth: 24 }, "2026-10-30"], id);
    assert.deepEqual(effectiveDueDatesInMonth(d, 2027, 8, master).map((e) => e.due), ["2027-09-24"], `${id}: the same date`);
    assert.deepEqual(effectiveDueDatesInMonth(d, 2028, 8, master).map((e) => e.due), ["2028-09-24"]);
    // 24-09-2037 is a Thursday, the plant's weekly off: the sheet moves to the next working day.
    const shifted = effectiveDueDatesInMonth(d, 2037, 8, master)[0];
    assert.ok(shifted.shifted && shifted.due > "2037-09-24", `${id}: a closed day moves it (${shifted.due})`);
  }
});

test("on its day the sheet is written as last year's: only Make and Serial number are left, and the reminder says so", () => {
  const d = doc(RULER_300_ID);
  clear(d.id);
  const last = createRecordForDocument(d, { dateISO: "2026-09-24" }).record;
  const data = last.data as LogSheetData;
  recordRepository.upsert({
    ...last,
    status: "Verified",
    data: {
      header: { ...data.header, make: "Ajanta", serialNo: "GP-3/MS/42" },
      rows: data.rows.map((r, i) => ({ ...r, observed: [50, 100, 150, 200, 250, 290][i], status: i === 0 ? "Pass" : "", performedBy: i === 0 ? "Kapila Barad" : "" })),
    },
  });
  const prepared = prepareKnownParts(d, "2027-09-24", master, undefined)!;
  const h = (prepared.data as LogSheetData).header;
  assert.deepEqual([h.make, h.serialNo], ["", ""], "the two boxes left for the person");
  assert.deepEqual([h.range, h.leastCount, h.masterMake, h.masterCalibrationReportNo], ["0-300 mm", "1 mm", "Kristeel", "CAL/LPI/GP-26/27"]);
  // Make and Serial number - and the tester, whose name goes on by itself when they open it (the owner, 31-Oct-2026).
  assert.equal(prepared.waiting, 3, "three entries wait: Make, Serial number and this year's tester");
  for (const id of [RULER_600_ID, RULER_300_ID]) assert.equal(reminderNoteFor(id), RULER_YEARLY_NOTE);
  assert.match(RULER_YEARLY_NOTE, /remaining 2 boxes .*Make and Serial number.*submit/i);
  assert.equal(reminderNoteFor("qc-gsm-plate-calibration"), undefined, "every other document's reminder as before");
  clear(d.id);
});
