// A sheet before its day is shown blank, and what it holds is kept for its day (REQUIREMENTS §299).
import { test } from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition, LogSheetData, MasterData, RecordInstance } from "../src/types";
import { shownOnItsDay } from "../src/engine/beforeItsDay";
import { SEED_DOCUMENTS } from "../src/data/seed/documentDefinitions";
import { SEED_MASTER_DATA } from "../src/data/seed/masterData";

const doc = (SEED_DOCUMENTS as DocumentDefinition[]).find((d) => d.id === "qc-gsm-plate-calibration")!;
const master: MasterData = SEED_MASTER_DATA;
const filled = (isDemo = false) =>
  ({ id: "r", documentId: doc.id, dueDate: "2026-11-24", status: "In Progress", isDemo, data: { header: { serialNo: "04" }, rows: [{ id: "a", parameter: "Tasted-1", p54: "20 x 20cm" }] } }) as unknown as RecordInstance;

test("before its day the sheet shows no reading, and the stored record is not changed", () => {
  const r = filled();
  const shown = shownOnItsDay(doc, r, master, "2026-11-23");
  assert.ok((shown.data as LogSheetData).rows.every((x) => !x.p54));
  assert.equal((r.data as LogSheetData).rows[0].p54, "20 x 20cm");
});

test("on its day, and for a demo record, it shows what it holds", () => {
  const r = filled();
  assert.equal(shownOnItsDay(doc, r, master, "2026-11-24"), r);
  const demo = filled(true);
  assert.equal(shownOnItsDay(doc, demo, master, "2026-11-23"), demo);
});
