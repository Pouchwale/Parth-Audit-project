// A CHECK POINT CLEARED THROUGH MITRA'S PATCH (the owner, 13-Oct-2026: Mitra adds,
// changes and clears anything in any record, on both applications).
//
// On F/HR/17 an answer once given could not be taken back through the patch:
// "" went to the Yes / No check and was refused ("can only be Yes or No").
// Now an empty value — "", null, or {value: null} — takes the stored answer
// out, its note with it, so the box is blank again (engine/recordPatch.ts
// normCheckpoints).
// Run: npm run test:unit -- checkpointClear
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyAssistantPatch } from "../src/engine/recordPatch";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import type { DailyPestMonitoringData } from "../src/types";

ensureMasterSeeded();
ensureDocumentsSeeded();
void documentRepository;

const answered = (): DailyPestMonitoringData => ({
  isHoliday: false,
  checkpoints: { "3": { value: "Yes", note: "gap under the store door" }, "4": { value: 12 } },
  timeOfChecking: "09:30",
  checker: "Kapila",
  summaryActions: [],
  rodentCatches: [],
});

describe("a check point cleared through Mitra's patch", () => {
  for (const [how, value] of [
    ['""', ""],
    ["null", null],
    ["{value: null}", { value: null }],
  ] as const) {
    it(`${how} takes the answer and its note out, with no problem`, () => {
      const out = applyAssistantPatch("daily-pest-monitoring", "daily-pest-monitoring", answered(), { checkpoints: { 3: value } });
      assert.deepEqual(out.problems, []);
      assert.equal(out.data.checkpoints["3"], undefined, "check point 3 is blank again");
      assert.deepEqual(out.data.checkpoints["4"], { value: 12 }, "the other check points stay");
    });
  }

  it("the count of check point 4 is cleared the same way", () => {
    const out = applyAssistantPatch("daily-pest-monitoring", "daily-pest-monitoring", answered(), { checkpoints: { 4: "" } });
    assert.deepEqual(out.problems, []);
    assert.equal(out.data.checkpoints["4"], undefined);
    assert.deepEqual(out.data.checkpoints["3"], { value: "Yes", note: "gap under the store door" });
  });

  it("a wrong word is still refused, and the answer kept", () => {
    const out = applyAssistantPatch("daily-pest-monitoring", "daily-pest-monitoring", answered(), { checkpoints: { 3: "maybe" } });
    assert.equal(out.problems.length, 1);
    assert.match(out.problems[0]!, /Yes or No/);
    assert.deepEqual(out.data.checkpoints["3"], { value: "Yes", note: "gap under the store door" });
  });
});
