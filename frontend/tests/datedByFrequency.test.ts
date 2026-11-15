// A SHEET DATED BY ITS FREQUENCY (REQUIREMENTS §208): the plant's own case of 15-Nov-2026 - F/QC/17's 2026 sheet, started
// with New on 31-10-2026 (dated that day), submitted and verified by Kapila Barad, then reopened for correction - is dated
// by its frequency (every 24 September; the 24th a Thursday off, so the 25th); a signed sheet keeps its date; a sheet
// from the document's "as required" days is left as it is.
// Run: npm run test:unit -- datedByFrequency
import test from "node:test";
import assert from "node:assert/strict";
import type { RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureRecordsSeeded, recordRepository } from "../src/data/repositories/recordRepository";
import { datedByFrequency } from "../src/engine/calendarMigration";
import { schedulePeriodOf } from "../src/engine/frequencyEngine";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureRecordsSeeded();

const ID = "qc-ruler-verification";

function sheet(id: string, over: Partial<RecordInstance>): RecordInstance {
  return {
    id,
    documentId: ID,
    periodKey: `${ID}:2026-09-24`,
    dueDate: "2026-10-31",
    status: "In Progress",
    isDemo: false,
    data: { header: {}, rows: [] },
    createdAt: "2026-10-31T05:00:00.000Z",
    updatedAt: "2026-10-31T05:00:00.000Z",
    ...over,
  } as RecordInstance;
}

test("the plant's F/QC/17 2026 sheet, reopened for correction, is dated by its frequency; a signed one and an as-required one keep their dates", () => {
  const doc = documentRepository.getById(ID)!;
  assert.equal(schedulePeriodOf(doc, "2026-09-24")?.scheduled, "2026-09-24", "every 24 September");
  recordRepository.upsert(
    sheet("rec-reopened", {
      submittedBy: "Kapila Barad",
      submittedAt: "2026-10-31T06:00:00.000Z",
      verifiedBy: "Kapila Barad",
      verifiedAt: "2026-10-31T07:00:00.000Z",
      correction: { reason: "typo", by: "Kapila Barad", at: "2026-11-01T05:00:00.000Z", fromStatus: "Verified", dataBefore: { header: {}, rows: [] }, headerBlockBefore: null },
    } as Partial<RecordInstance>)
  );
  recordRepository.upsert(sheet("rec-signed", { periodKey: `${ID}:2025-09-24`, dueDate: "2025-10-31", status: "Verified", verifiedBy: "Kapila Barad", verifiedAt: "2025-10-31T07:00:00.000Z" }));
  recordRepository.upsert(sheet("rec-as-required", { periodKey: `${ID}:2026-10-17:p-abc`, dueDate: "2026-10-17" }));
  datedByFrequency();
  const reopened = recordRepository.getById("rec-reopened")!;
  assert.equal(reopened.dueDate, "2026-09-25", "24-09-2026 is a Thursday, the weekly off: the 25th");
  assert.match(String(reopened.history?.at(-1)?.note), /Dated 25-09-2026 by its frequency \(was 31-10-2026\)/);
  assert.equal(recordRepository.getById("rec-signed")!.dueDate, "2025-10-31", "a signed sheet keeps its date");
  assert.equal(recordRepository.getById("rec-as-required")!.dueDate, "2026-10-17", "a sheet from its as-required days is its own");
  assert.equal(datedByFrequency(), 0, "nothing to do a second time");
});
