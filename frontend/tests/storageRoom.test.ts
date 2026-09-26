// WHAT IS TAKING THE ROOM (REQUIREMENTS §79), added up without a browser: demo
// records, blank shells from before go-live, and the plant's own records are
// told apart and sized, and a size reads the way people say it.
import test from "node:test";
import assert from "node:assert/strict";
import type { RecordInstance } from "../src/types";
import { ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository, ensureSeeded as ensureRecordsSeeded } from "../src/data/repositories/recordRepository";
import { settingsRepository } from "../src/data/repositories/settingsRepository";
import { roomLabel, storageBreakdown } from "../src/engine/storageRoom";
import { NEARLY_FULL_CHARS, measureWorkingCopy, workingCopyChars } from "../src/data/storageAdapter";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureRecordsSeeded();

const shell = (id: string, dueDate: string, isDemo: boolean, status: RecordInstance["status"] = "Due"): RecordInstance =>
  ({
    id,
    documentId: "daily-pest-monitoring",
    periodKey: `daily-pest-monitoring:${dueDate}`,
    dueDate,
    status,
    isDemo,
    data: { checkpoints: {}, summaryActions: [], rodentCatches: [] },
    createdAt: "2026-09-26T00:00:00.000Z",
    updatedAt: "2026-09-26T00:00:00.000Z",
  }) as unknown as RecordInstance;

test("the working copy is told apart: demo data, blank sheets from before go-live, the plant's own records", () => {
  const base = storageBreakdown();
  assert.equal(base.demo.records, 0, "the seeds are live");
  assert.ok(base.written.records > 50 && base.written.chars > 300_000, `the seeded records: ${base.written.records}, ${base.written.chars}`);
  assert.equal(base.all.records, base.written.records + base.leftovers.records);

  // Go-live is today; a blank shell dated before it is a leftover, a demo record is demo, a written record is the plant's.
  settingsRepository.ensureLiveStartDate("2026-09-26");
  recordRepository.upsertMany([shell("room-demo-1", "2026-09-01", true), shell("room-demo-2", "2026-09-02", true), shell("room-leftover", "2026-08-01", false), shell("room-written", "2026-08-02", false, "Verified")]);
  const now = storageBreakdown();
  assert.equal(now.demo.records, 2);
  assert.equal(now.leftovers.records, 1, "a blank Due shell before go-live");
  assert.equal(now.written.records, base.written.records + 1, "a verified record is the plant's, whatever its date");
  assert.ok(now.demo.chars > 0 && now.leftovers.chars > 0);
  assert.equal(now.all.chars, now.demo.chars + now.leftovers.chars + now.written.chars);
  recordRepository.removeIds(["room-demo-1", "room-demo-2", "room-leftover", "room-written"]);
});

test("a size the way people say it, and the marks the banner and Demo Mode work to", () => {
  assert.equal(roomLabel(4_912_345), "4.9 MB");
  assert.equal(roomLabel(5_000_000), "5.0 MB");
  assert.equal(roomLabel(344_277), "344 KB");
  assert.equal(roomLabel(512), "512 bytes");
  assert.equal(NEARLY_FULL_CHARS, 4_000_000);
  const chars = measureWorkingCopy();
  assert.equal(workingCopyChars(), chars, "the last measurement is kept for the banner");
  assert.ok(chars > 300_000 && chars < NEARLY_FULL_CHARS, `a fresh working copy is well under the mark: ${chars}`);
});
