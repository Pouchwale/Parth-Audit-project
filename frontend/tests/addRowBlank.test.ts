// ADD ROW PRE-FILLS NOTHING (REQUIREMENTS §98, voice-and-edits brief §2.3).
//
// A log sheet's Add Row — and Mitra's "add a row" (engine/recordRowCommands.ts)
// — used to write a column's autoFill.default into the new line: "ALC DONE:
// Yes", "Line Clearance: Done", "Cleaning: Dry", decided for the person who
// had said nothing. A new line starts blank in every box that is not printed,
// numbers null and text "", exactly as emptyLogRows builds the sheet's first
// lines (engine/recordDefaults.ts).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { blankLogRow, emptyLogRows } from "../src/engine/recordDefaults";
import { blankRow } from "../src/engine/recordRowCommands";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";

// The vehicle cleaning record: "Type of cleaning (Dry / Wet)" carries autoFill.default "Dry" for Demo Mode.
const VEHICLE = "disp-vehicle-cleaning";

describe("a new line of a log sheet", () => {
  it("starts blank in every box, whatever autoFill.default says", () => {
    const layout = getLogSheetLayout(VEHICLE);
    assert.ok(layout, "the vehicle cleaning layout exists");
    const defaulted = layout.columns.find((c) => c.autoFill?.default !== undefined);
    assert.ok(defaulted, "the layout has a column with a Demo Mode default, so the check means something");
    const row = blankLogRow(layout, "row_1");
    assert.equal(row.id, "row_1");
    assert.equal(row[defaulted.key], "", `${defaulted.label} is not decided for the person`);
    for (const c of layout.columns) assert.equal(row[c.key], c.type === "number" ? null : "", `${c.label} starts blank`);
  });

  it("is the same line whether the sheet's Add Row, Mitra's add-a-row or the empty sheet builds it", () => {
    const layout = getLogSheetLayout(VEHICLE);
    assert.ok(layout);
    const { id: _a, ...fromCommand } = blankRow(layout, "x");
    const { id: _b, ...fromAddRow } = blankLogRow(layout, "y");
    const { id: _c, ...fromSheet } = emptyLogRows(VEHICLE)[0];
    void _a;
    void _b;
    void _c;
    assert.deepEqual(fromCommand, fromAddRow);
    assert.deepEqual(fromSheet, fromAddRow);
  });

  it("gives every line its own id when none is passed", () => {
    const layout = getLogSheetLayout(VEHICLE);
    assert.ok(layout);
    const a = blankLogRow(layout);
    const b = blankLogRow(layout);
    assert.ok(a.id && b.id && a.id !== b.id);
  });
});
