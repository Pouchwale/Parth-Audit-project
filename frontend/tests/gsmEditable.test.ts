// F/QC/11: EVERY CELL OF THE GRID EDITABLE, ITS DEVIATION TOO (REQUIREMENTS §224; the owner, 16-Nov-2026: "this data is
// already filled in format by default by make sure everything in editable also"). The Deviation is worked out from the
// size written beside it and the person's to type over: the typed figure stands until the cell is emptied.
// Run: npm run test:unit -- gsmEditable
import test from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData } from "../src/types";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { withComputedCells } from "../src/engine/computedCells";
import { typedOver } from "../src/engine/typedCells";

const GSM = "qc-gsm-plate-calibration";

test("every plate's size and Deviation is the person's to write; a Deviation typed over stands, emptied it is worked out again", () => {
  const layout = getLogSheetLayout(GSM)!;
  for (const c of layout.columns.filter((col) => col.key !== "parameter")) assert.ok(!c.computed || c.typable, `${c.group} ${c.label} is editable`);
  const line = { id: "l2", parameter: "2", p54: "20 x 21cm", p54dev: "" };
  const worked = withComputedCells(GSM, { header: {}, rows: [line] } as unknown as LogSheetData);
  assert.equal(worked.rows[0].p54dev, "5%", "worked out from 20 x 21cm");
  const typed = withComputedCells(GSM, { header: {}, rows: [typedOver(worked.rows[0], "p54dev", "7%")] } as unknown as LogSheetData);
  assert.equal(typed.rows[0].p54dev, "7%", "the person's figure stands");
  const emptied = withComputedCells(GSM, { header: {}, rows: [typedOver(typed.rows[0], "p54dev", "")] } as unknown as LogSheetData);
  assert.equal(emptied.rows[0].p54dev, "5%", "emptied, worked out again");
});
