// F/HR/17's monthly register downloaded as Word and Excel as its three pages are drawn (utils/dailyPestRegister.ts):
// a header box on every page, the ten check points numbered, the grid's headings merged and shaded, a closed day
// H O L I D A Y across the ten, the Summary on page 3; a single day's record is not the register.
import test from "node:test";
import assert from "node:assert/strict";
import type { ExportBlock } from "../src/utils/documentExport";
import { dailyPestRegister } from "../src/utils/dailyPestRegister";
import { paperAsSheet } from "../src/utils/paperSheets";

const band = (page: number): ExportBlock => ({
  kind: "table",
  band: true,
  headerRows: 0,
  rows: [[{ text: "Format No." }, { text: "F/HR/17" }, { text: "Rev No." }, { text: "00" }, { text: "Rev Date" }, { text: "01-12-2021" }, { text: "Page No." }, { text: `${page} Of 3` }]],
});
const head = (page: number): ExportBlock[] => [
  { kind: "text", text: "GUJARAT PRINT PACK PUBLICATIONS PVT LTD", strong: true, title: true },
  { kind: "text", text: "DAILY PEST CONTROL MONITORING RECORD — October 2026", strong: true, title: true },
  band(page),
];
const gridOf = (days: number[]): ExportBlock => ({
  kind: "table",
  headerRows: 2,
  rows: [
    [{ text: "Date" }, { text: "Check points numbers as per above guidelines" }, ...Array.from({ length: 9 }, () => ({ text: "" })), { text: "Time of checking" }, { text: "Checker" }],
    [{ text: "" }, ...Array.from({ length: 10 }, (_, k) => ({ text: String(k + 1) })), { text: "" }, { text: "" }],
    ...days.map((d) =>
      d === 19
        ? [{ text: `${d}.` }, { text: "HOLIDAY" }, ...Array.from({ length: 9 }, () => ({ text: "" })), { text: "" }, { text: "" }]
        : [{ text: `${d}.` }, ...Array.from({ length: 10 }, () => ({ text: "Yes" })), { text: "09:18" }, { text: "Meet" }]
    ),
  ],
});
const register: ExportBlock[] = [
  ...head(1),
  { kind: "text", text: "Please check the following points on a Daily basis ...", strong: false },
  { kind: "text", text: "Please mention the status as Yes / No against each check point except point no. 7", strong: true },
  ...Array.from({ length: 10 }, (_, k): ExportBlock => ({ kind: "text", text: `Check point ${k + 1}`, strong: false })),
  ...head(2),
  gridOf([18, 19]),
  ...head(3),
  gridOf([20]),
  { kind: "text", text: "* Notes (check points 8 / 9): 16. — no. 8: post press", strong: false },
  { kind: "text", text: "SUMMARY OF ACTIONS TAKEN IF PEST OBSERVED", strong: true },
  { kind: "table", headerRows: 1, rows: [[{ text: "Date of observation" }, { text: "Description of Observation" }, { text: "Action Taken" }, { text: "Remarks" }], [{ text: "16-10-2026", date: "2026-10-16" }, { text: "TEST" }, { text: "" }, { text: "" }]] },
];

type Paper = Extract<ExportBlock, { kind: "paper" }>;

test("F/HR/17's register is laid as its three pages: a header box each, the points numbered, the grid merged and shaded", () => {
  const out = dailyPestRegister(register) as Paper[];
  assert.ok(out && out.every((b) => b.kind === "paper"));
  // Three header boxes, the second and third starting a page.
  const heads = out.filter((b) => b.rows[0]?.cells[0]?.text === "GUJARAT PRINT PACK PUBLICATIONS PVT LTD");
  assert.equal(heads.length, 3);
  assert.deepEqual(heads.map((h) => !!h.pageBreakBefore), [false, true, true]);
  assert.equal(heads[0].rows[2].cells[0].text, "FORMAT NO.\nF/HR/17");
  // The ten check points numbered.
  const words = out.flatMap((b) => b.rows.flatMap((r) => r.cells.map((c) => c.text)));
  assert.ok(words.includes("1.  Check point 1") && words.includes("10.  Check point 10"));
  // The grid: DATE / TIME / CHECKER down both heading rows, CHECK POINTS across the ten, shaded.
  const grid = out.find((b) => b.widths.length === 13)!;
  const top = grid.rows[0].cells;
  assert.deepEqual(top.map((c) => c.vMerge ?? ""), ["restart", "", "restart", "restart"]);
  assert.equal(top[1].colSpan, 10);
  assert.ok(top.every((c) => c.fill));
  // A closed day: H O L I D A Y across the ten.
  const holiday = grid.rows.find((r) => r.cells[0].text === "19.")!;
  assert.equal(holiday.cells[1].text, "H O L I D A Y");
  assert.equal(holiday.cells[1].colSpan, 10);
  assert.equal(holiday.cells.length, 4);
  // The Summary on page 3, its heading shaded, its date kept.
  assert.ok(out.some((b) => b.rows[0]?.cells[0]?.text === "SUMMARY OF ACTIONS TAKEN IF PEST OBSERVED" && b.rows[0].cells[0].fill));
  assert.ok(out.some((b) => b.rows.some((r) => r.cells[0]?.date === "2026-10-16")));
  // As Excel: one portrait sheet, a new page before pages 2 and 3, the shaded headings filled.
  const sheet = paperAsSheet(out, "F-HR-17", "portrait");
  assert.equal(sheet.page, "portrait");
  assert.equal(sheet.breaks?.length, 2);
  assert.ok(sheet.cells.some((c) => c.text === "H O L I D A Y" && c.colSpan >= 10));
  assert.ok(sheet.cells.some((c) => c.style.fill));
});

test("a single day's F/HR/17 record is not the register: it downloads as before", () => {
  const day: ExportBlock[] = [
    ...head(1),
    { kind: "table", headerRows: 1, rows: [[{ text: "No." }, { text: "Check Point" }, { text: "Response" }], [{ text: "1" }, { text: "Pest proofing" }, { text: "Yes" }]] },
  ];
  assert.equal(dailyPestRegister(day), null);
});
