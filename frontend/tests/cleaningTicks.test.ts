// F/HR/15 and F/HR/16: a tick in an area's box; F/HR/15 drawn with its month's days (REQUIREMENTS §378).
import test from "node:test";
import assert from "node:assert/strict";
import type { RecordInstance } from "../src/types";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { fhr15PaperFor, FHR15_WIDTH } from "../src/data/seed/hrPapers357";
import { paperTableFits } from "../src/data/seed/qcPaperTables";
import { daysOfSheet, monthNamed, tickCell } from "../src/engine/cleaningMonth";
import { cleaningTicked } from "../src/data/cleaningTicksMigration";

const width = (cells: { w: number }[]) => cells.reduce((a, c) => a + c.w, 0);

test("the days of the sheet's month: its Month & Year, else its own month", () => {
  assert.equal(daysOfSheet("November 2026", "2026-11-30"), 30);
  assert.equal(daysOfSheet("", "2026-11-30"), 30);
  assert.equal(daysOfSheet("", "2027-02-28"), 28);
  assert.equal(daysOfSheet("Feb-2028", "2027-02-28"), 29, "a leap year's February, by the box");
  assert.equal(daysOfSheet("12/2026", "2026-11-30"), 31);
  assert.deepEqual(monthNamed("2026-09"), { year: 2026, month: 9 });
  assert.equal(monthNamed("anything"), null);
  assert.equal(daysOfSheet("anything", undefined), 31);
});

test("F/HR/15 drawn with 28, 29, 30 or 31 days, the sheet as wide as the page every time, and fitting the format", () => {
  const layout = getLogSheetLayout("hr-daily-cleaning")!;
  for (const n of [28, 29, 30, 31]) {
    const p = fhr15PaperFor(n);
    const heading = p.body.find((r) => r.head)!;
    assert.deepEqual(heading.cells.slice(3).map((c) => c.t), Array.from({ length: n }, (_, i) => String(i + 1)));
    for (const row of [...p.head, ...p.body]) assert.ok(Math.abs(width(row.cells) - FHR15_WIDTH) < 0.01, `row ${width(row.cells)} at ${n}`);
    assert.ok(p.body.every((r) => !r.cells.some((c) => c.col === `d${n + 1}`)), `no day ${n + 1}`);
    assert.ok(paperTableFits(p, layout), `fits at ${n}`);
  }
});

test("an area's box ticks; the signature and date lines stay written", () => {
  const f15 = getLogSheetLayout("hr-daily-cleaning")!;
  const f16 = getLogSheetLayout("hr-monthly-cleaning")!;
  const d1 = f15.columns.find((c) => c.key === "d1")!;
  const jan = f16.columns.find((c) => c.key === "jan")!;
  assert.equal(tickCell(d1, { no: "1", parameter: "Canteen" }), true);
  assert.equal(tickCell(d1, { no: "", parameter: "Cleaning done by" }), false);
  assert.equal(tickCell(jan, { no: "", parameter: "Date" }), false);
  assert.equal(tickCell(jan, { no: "3", parameter: "RM Warehouse - New" }), true);
  assert.equal(tickCell(f15.columns.find((c) => c.key === "parameter")!, { no: "1" }), false);
});

test("an open sheet's done words read as the tick; names and the signature lines stay", () => {
  const r = {
    id: "r", documentId: "hr-daily-cleaning", dueDate: "2026-11-30", status: "In Progress", isDemo: false,
    data: { header: {}, rows: [{ id: "a", no: "1", parameter: "Canteen", d1: "ok", d2: "Ramesh", d3: "✓" }, { id: "b", no: "", parameter: "Cleaning done by", d1: "ok" }] },
  } as unknown as RecordInstance;
  const next = cleaningTicked(r)!;
  assert.deepEqual([next.rows[0].d1, next.rows[0].d2, next.rows[0].d3, next.rows[1].d1], ["✓", "Ramesh", "✓", "ok"]);
  assert.equal(cleaningTicked({ ...r, data: next } as RecordInstance), null, "run again: nothing");
});
