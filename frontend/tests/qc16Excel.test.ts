// F/QC/16'S EXCEL DOWNLOAD AS ITS PAGE (the owner, 31-10-2026: "this is not the actual format ... the second photo shows the
// exact format"): utils/paperTableExport.ts lays the register as the page draws it - the heavy frame, the company across,
// the underlined title beside the shaded number box, the headings, then the record's own lines - its Word as before.
import test from "node:test";
import assert from "node:assert/strict";
import { paperTableSheet, paperTableWord } from "../src/utils/paperTableExport";
import { documentFileKind, documentFileKinds, type Cell, type ExportBlock } from "../src/utils/documentExport";
import { HAND_DRAWN } from "../src/utils/originalFill";
import { documentRepository, ensureSeeded } from "../src/data/repositories/documentRepository";

ensureSeeded();

const t = (text: string): Cell => ({ text });
const pad = (n: number) => Array.from({ length: n }, () => t(""));
const lines: string[][] = [
  ["1", "Nivea India Pvt Ltd", "Soft 50ml Side label", "FGLA11067", "Savan Sathwara", "A/W Change", "03-01-2022", "", ""],
  ["2", "Nivea India Pvt Ltd", "Nivea Gel body lotion Aloevera Front 200ml label", "FGLA10900", "Keyur Sathwara", "A/W Change", "05-01-2022", "", ""],
  ["3", "Dabur India Ltd. Kolkata", "SA Label Ashokarishta 680 ml Kolkata", "FGLA9871", "Keyur Sathwara", "A/W Change", "08-01-2022", "", ""],
  ["4", "Aculife Healthcare Pvt. Ltd./ Nirma", "RL 500ml label", "FGLA8665", "Savan Sathwara", "A/W Change", "21-01-2022", "", ""],
  ["5", "Purity Polytubes Private Limited", "Clarifying Mud Mask 75ml _ Russia Label ( Change Cylinder", "FGLA9462", "Keyur Sathwara", "A/W Change", "25-01-2022", "", ""],
];
const blocks: ExportBlock[] = [
  { kind: "table", headerRows: 0, rows: [[t("GUJARAT PRINT PACK PUBLICATIONS PVT LTD"), ...pad(8)], [t("REGISTER OF OBSOLETE ARTWORK"), ...pad(5), t("F/QC/16 (00/01.12.2021)"), ...pad(2)]] },
  { kind: "table", headerRows: 1, rows: [["Sr. No.", "Customer name", "Job name", "Artwork number / Master Shade card number (FG Code)", "Sales Person", "Reason for artwork obsolete", "Date of obsolete", "Updated by - QC In-charge", "Remarks"].map(t), ...lines.map((l) => l.map(t))] },
];

test("F/QC/16 downloads as Excel or Word drawn as its page, never through the owner's workbook", () => {
  const d = documentRepository.getByIdUnscoped("qc-obsolete-artwork");
  assert.ok(HAND_DRAWN.has("qc-obsolete-artwork"));
  assert.deepEqual(documentFileKinds(d), ["xlsx", "docx"], "Excel, and Word beside it (31-10-2026)");
});

test("the sheet is the page: company across, title beside the shaded number box, the headings, the record's lines in a heavy frame", () => {
  const out = paperTableSheet("qc-obsolete-artwork", blocks, "F-QC-16");
  assert.ok(out && out[0].kind === "sheet");
  const s = out![0] as Extract<ExportBlock, { kind: "sheet" }>;
  const at = (r: number, c: number) => s.cells.find((x) => x.row === r && x.col === c)!;
  assert.equal(s.widths.length, 9);
  assert.equal(s.rowCount, 3 + lines.length, "the header's two rows, the headings and the record's lines, no blank ones");
  assert.deepEqual([at(0, 0).text, at(0, 0).colSpan, at(0, 0).style.bold], ["GUJARAT PRINT PACK PUBLICATIONS PVT LTD", 9, true]);
  assert.deepEqual([at(1, 0).text, at(1, 0).colSpan, at(1, 0).style.underline], ["REGISTER OF OBSOLETE ARTWORK", 6, true]);
  assert.deepEqual([at(1, 6).text, at(1, 6).colSpan, at(1, 6).style.fill], ["F/QC/16 (00/01.12.2021)", 3, "#f2f2f2"]);
  assert.equal(at(2, 3).text, "Artwork number / Master Shade card number (FG Code)");
  assert.deepEqual([at(3, 0).text, at(3, 1).text, at(3, 6).text], ["1", "Nivea India Pvt Ltd", "03-01-2022"]);
  assert.deepEqual([at(0, 0).style.borders[2], at(3 + lines.length - 1, 0).style.borders[3], at(3, 8).style.borders[1]], [2, 2, 2], "the frame heavy");
  assert.ok(s.heights[7]! > s.heights[3]!, "a line whose job wraps to three lines is taller");
});

test("the Word page is the same register: its nine columns, the number box shaded, the record's lines", () => {
  const out = paperTableWord("qc-obsolete-artwork", blocks);
  assert.ok(out && out[0].kind === "paper");
  const p = out![0] as Extract<ExportBlock, { kind: "paper" }>;
  assert.equal(p.rows.length, 3 + lines.length);
  assert.equal(p.rows[0].cells[0].text, "GUJARAT PRINT PACK PUBLICATIONS PVT LTD");
  assert.equal(p.rows[1].cells[1].fill, "#f2f2f2");
  assert.deepEqual(p.rows[3].cells.map((c) => c.text).slice(0, 3), ["1", "Nivea India Pvt Ltd", "Soft 50ml Side label"]);
  assert.ok(p.widths.reduce((a, b) => a + b, 0) < 841.9 - 66, "inside the landscape page");
});
