// THE HR FORMS' PRINTED LINES ARE OPEN (REQUIREMENTS §158; the owner, 2-Nov-2026):
// "give option for adding and removing anything from this column and this
// applies to the HR module documents" — the Training Topics of the induction
// record (F/HR/05) and the lines every other HR form prints. A line is added
// or taken off THIS record on the sheet, the format keeps its printed list,
// and a line is known by its words, not its place, so taking one off never
// shifts the words of the lines under it.
// Run: npm run test:unit -- openLines
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { logRowsRule, newRow, printedLineOf } from "../src/engine/recordLines";
import { applyAssistantPatch } from "../src/engine/recordPatch";
import { createDefaultData } from "../src/engine/recordDefaults";
import { effectiveColumn } from "../src/engine/roundTrip/bindingsFor";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { HR_LAYOUTS } from "../src/data/seed/hrLayouts";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { todayISO } from "../src/utils/date";
import type { LogSheetData, LogSheetRow } from "../src/types";

ensureMasterSeeded();
ensureDocumentsSeeded();

const master = masterRepository.get();
const induction = getLogSheetLayout("hr-induction-staff")!;
const topic = induction.columns.find((c) => c.key === "parameter")!;
const fresh = (): LogSheetData => createDefaultData(documentRepository.getById("hr-induction-staff")!, todayISO(), master) as unknown as LogSheetData;

describe("the HR forms' printed lines are open (REQUIREMENTS §158)", () => {
  it("every HR form that prints its lines lets a person add and take off a line, except the day-numbered hygiene report", () => {
    for (const [id, layout] of Object.entries(HR_LAYOUTS)) {
      if (layout.rowMode.kind !== "fixedRows") continue;
      const rule = logRowsRule(layout);
      if (id === "hr-hygiene-report") {
        assert.equal(rule.canAdd, false, `${id} prints one line a day of the month`);
        continue;
      }
      assert.ok(layout.rowMode.openLines, `${id} opens its lines`);
      assert.equal(rule.canAdd, true, `${id} adds a line`);
      assert.equal(rule.canRemove, true, `${id} takes a line off`);
      assert.equal(rule.minLines, 1, `${id} keeps one line`);
      assert.equal(rule.whyFixed, undefined);
      // "Clear the line" blanks what a person writes, never a printed topic: the printed columns stay out of writable.
      for (const c of layout.columns) if (c.fixed) assert.ok(!rule.writable.includes(c.key), `${id}: the printed column ${c.key} is not cleared with the line`);
    }
    // A QC inspection record still prints its parameters as the format's own.
    assert.equal(logRowsRule(getLogSheetLayout("qc-inspection-pouching")!).canAdd, false);
  });

  it("a fresh induction record carries the five topics and the form's two spare lines, each knowing its printed line", () => {
    const data = fresh();
    assert.equal(data.rows.length, 7);
    assert.equal(data.rows[4].parameter, "Fire safety precautions");
    data.rows.forEach((row, i) => assert.deepEqual(printedLineOf(induction, row, i), induction.rowMode.kind === "fixedRows" ? induction.rowMode.rows[i] : undefined));
    // A printed topic is printed, not written; a spare line is written in.
    assert.equal(effectiveColumn(topic, printedLineOf(induction, data.rows[0], 0)).fixed, true);
    assert.equal(effectiveColumn(topic, printedLineOf(induction, data.rows[5], 5)).fixed, false);
  });

  it("taking a topic off the record leaves every other topic's words where they were", () => {
    const data = fresh();
    const without = { ...data, rows: data.rows.filter((_, i) => i !== 1) };
    assert.equal(without.rows.length, 6);
    assert.equal(without.rows[1].parameter, "Quality & Product safety related all policies");
    // By its place it would now be told it is topic 2 (GMP); by its words it is still topic 3.
    const line = printedLineOf(induction, without.rows[1], 1)!;
    assert.equal(line.parameter, "Quality & Product safety related all policies");
    assert.equal(line.responsibility, "PSTL");
    assert.equal(effectiveColumn(topic, line).fixed, true, "a printed topic stays printed after the line above it goes");
    // The spare lines, now at places 4 and 5, are still the form's blank lines: written in.
    assert.equal(effectiveColumn(topic, printedLineOf(induction, without.rows[4], 4)).fixed, false);
    assert.equal(effectiveColumn(topic, printedLineOf(induction, without.rows[5], 5)).fixed, false);
  });

  it("a line the person adds is their own: its topic and responsibility are written in, and the sheet's Add Row builds it blank", () => {
    const data = fresh();
    const added: LogSheetRow = newRow(induction, data.rows);
    assert.equal(added.parameter, "");
    assert.equal(added.responsibility, "");
    const rows = [...data.rows, added];
    // Blank, it reads as one of the form's blank lines; either way nothing is printed on it.
    const own = printedLineOf(induction, rows[7], 7)!;
    assert.equal(String(own.parameter ?? ""), "", "nothing is printed on a line of one's own");
    assert.equal(effectiveColumn(topic, own).fixed, false);
    assert.deepEqual(printedLineOf(induction, { ...added, parameter: "Allergen awareness" }, 7), {}, "a line with words of its own matches no printed line");
    // Once its topic is typed it is still the person's line, still written in.
    const typed = { ...added, parameter: "Allergen awareness", responsibility: "PSTL" };
    assert.equal(effectiveColumn(topic, printedLineOf(induction, typed, 7)).fixed, false);
  });

  it("Mitra's patch adds and removes a topic too, and the record keeps at least one line", () => {
    const doc = documentRepository.getById("hr-induction-staff")!;
    const data = fresh();
    const added = applyAssistantPatch("log-sheet", doc.id, data, { addItems: { rows: [{ parameter: "Allergen awareness", responsibility: "PSTL" }] } });
    assert.deepEqual(added.problems, []);
    assert.equal(added.data.rows.length, 8);
    assert.equal(added.data.rows[7].parameter, "Allergen awareness");
    const removed = applyAssistantPatch("log-sheet", doc.id, added.data, { removeItems: { rows: [2] } });
    assert.deepEqual(removed.problems, []);
    assert.equal(removed.data.rows.length, 7);
    assert.equal(removed.data.rows[1].parameter, "Quality & Product safety related all policies");
  });
});
