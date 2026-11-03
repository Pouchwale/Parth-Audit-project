// F/QC/11'S WORD DOWNLOAD AS ITS PAGE IS DRAWN (the owner, 30-10-2026: "when i download the word of qc 11 the exact format of
// the document should come like the second screenshot"): utils/calibrationWord.ts lays the page's blocks as one table on the
// page's own columns - the header box, the band, the six boxes, the grid with Pass/Fail and Sign. one cell a plate - and the
// PROCEDURE under it; never the owner's filled Word file, which printed each box's words twice.
import test from "node:test";
import assert from "node:assert/strict";
import { paperWordBlocks, paperPageOf, paperMarginsOf } from "../src/utils/paperSheets";
import { HAND_DRAWN } from "../src/utils/originalFill";
import type { Cell, ExportBlock } from "../src/utils/documentExport";

const t = (text: string): Cell => ({ text });
const plates = ["20 x 20cm", "10 x 10cm", "5 x 5cm", "2.5 x 2.5cm"];
const blocks: ExportBlock[] = [
  { kind: "text", text: "GUJARAT PRINT PACK PUBLICATIONS PVT LTD", strong: true, title: true },
  { kind: "text", text: "Manufacturers of Printed Cartons, Self Adhesive Labels, Shrink sleeves, Corrugated Boxes", strong: false },
  { kind: "text", text: "WEEKLY INTERNAL CALIBRATION RECORDS – GSM CUTTING PLATE", strong: true, title: true },
  { kind: "table", band: true, headerRows: 0, rows: [[t("FORMAT NO."), t("F/QC/11"), t("REV NO."), t("01"), t("REV DATE"), t("01-01-2022"), t("PAGE NO."), t("1 of 1")]] },
  {
    kind: "fields",
    perLine: 3,
    pairs: [
      ["Device ID No:", t("1-54, 2-55, 3-56, 4-57")],
      ["Location:", t("LAB")],
      ["Department:", t("LAB")],
      ["Manufacturer:", t("Global Eng. Co. (GEC)")],
      ["Serial No:", t("")],
      ["Calibration Expiry:", { text: "20-09-2027", date: "2027-09-20" }],
    ],
  },
  {
    kind: "table",
    headerRows: 2,
    rows: [
      [t("Index"), t("No. 54"), t(""), t("No. 55"), t(""), t("No. 56"), t(""), t("No. 57"), t("")],
      [t(""), ...plates.flatMap((p) => [t(p), t("Deviation")])],
      ...["Tasted-1", "2", "3", "4"].map((n) => [t(n), ...plates.flatMap((p) => [t(p), t("0%")])]),
      [t("Pass/Fail"), ...plates.flatMap(() => [t("Pass"), t("")])],
      [t("Sign."), ...plates.flatMap(() => [t("Super Admin"), t("")])],
    ],
  },
  { kind: "text", text: "PROCEDURE: Calibration to be done by qualified QA person as per calibration work procedure. If any deviation is found during internal calibration, it must be reported to the QA manager. Calibration records of all weights used must be available and valid.", strong: false },
];


test("F/QC/11 downloads as Word drawn as its page, not through the owner's filled file", () => {
  const id = "qc-gsm-plate-calibration";
  assert.ok(HAND_DRAWN.has(id));
  assert.equal(paperPageOf(id), "landscape");
  assert.ok(paperMarginsOf(id));
  const word = paperWordBlocks(id, blocks);
  assert.ok(word && word[0].kind === "paper");
  const table = word![0] as Extract<ExportBlock, { kind: "paper" }>;
  const words = table.rows.map((r) => r.cells.map((c) => c.text));
  assert.equal(words[0][0], "GUJARAT PRINT PACK PUBLICATIONS PVT LTD");
  assert.equal(table.rows[0].cells[0].underline, true);
  assert.deepEqual(words[3], ["FORMAT NO.\nF/QC/11", "REV NO.\n01", "REV DATE\n01-01-2022", "PAGE NO.\n1 of 1"], "the band");
  assert.deepEqual(words[4], ["Device ID No:\n1-54, 2-55, 3-56, 4-57", "Location:\nLAB", "Department:\nLAB"], "each box's words once, over its value");
  assert.deepEqual(words[5], ["Manufacturer:\nGlobal Eng. Co. (GEC)", "Serial No:\n", "Calibration Expiry:\n20-09-2027"]);
  assert.deepEqual(words[6], ["Index", "No. 54", "No. 55", "No. 56", "No. 57"]);
  assert.deepEqual([table.rows[6].cells[0].vMerge, table.rows[7].cells[0].vMerge], ["restart", "continue"], "Index down its two heading rows");
  assert.equal(words[8].length, 9, "a test line: Index and eight cells");
  assert.deepEqual(words[12], ["Pass/Fail", "Pass", "Pass", "Pass", "Pass"], "one cell a plate");
  assert.deepEqual(words[13], ["Sign.", "Super Admin", "Super Admin", "Super Admin", "Super Admin"]);
  assert.ok(!words.flat().some((w) => /Calibration Date:-|Due Date:-/.test(String(w))), "no Calibration Date / Due Date line");
  const proc = word![1] as Extract<ExportBlock, { kind: "paper" }>;
  assert.equal(proc.rows[0].cells[0].boldLead, "PROCEDURE:");
  // Every row spans the whole table.
  const across = table.widths.length;
  for (const r of table.rows) assert.equal(r.cells.reduce((a, c) => a + (c.colSpan ?? 1), 0), across);
});

test("a page that does not read as F/QC/11's keeps the generic download", () => {
  assert.equal(paperWordBlocks("qc-gsm-plate-calibration", blocks.filter((b) => b.kind !== "fields")), null);
});
