// F/QC/17'S DOWNLOADS AS THE PAPER IS DRAWN (the owner, 30-10-2026: "when i download the excel it is all ruin, it should be in
// the perfect format and way just like the document. and also give me the option to download word also"). The page's two
// tables (the header block and the body) are read as every download reads them; utils/paperTableExport.ts lays them on the
// paper's own columns and rows: merged cells, Century Gothic, the paper's thin and heavy rules, at its A4 size, in Excel
// and in Word.
import test from "node:test";
import assert from "node:assert/strict";
import type { Cell, ExportBlock } from "../src/utils/documentExport";
import { documentFileKind, documentFileKinds } from "../src/utils/documentExport";
import { paperTableSheet, paperTableWord, PAPER_TABLE_EXPORTS } from "../src/utils/paperTableExport";
import { HAND_DRAWN } from "../src/utils/originalFill";
import { documentRepository, ensureSeeded } from "../src/data/repositories/documentRepository";

ensureSeeded();

/** A row as the page's table reads: each cell's words in its first column, the columns it spans after it empty. */
const row = (...cells: [string, number][]): Cell[] => cells.flatMap(([text, span]) => [{ text }, ...Array.from({ length: span - 1 }, () => ({ text: "" }))]);

function pageBlocks(): ExportBlock[] {
  const head = [row(["GUJARAT PRINT PACK PUBLICATIONS PVT LTD", 5], ["F/QC/17\n(00/01.12.2021)", 1]), row(["Measuring Scale (Ruler) Internal Verification Record", 6]), row(["", 6])];
  const pairs = (list: [string, string][]) => list.map(([a, b]) => row([a, 2], [b, 4]));
  const body = [
    row(["Master Measuring Scale (Ruler) Details", 6]),
    ...pairs([["Make", "Kristeen"], ["Serial number", "QC-44"], ["Range", "0 - 600 mm"], ["Least count", "1 mm"], ["Calibration date", "21-09-2026"], ["Calibration due date", "20-09-2027"], ["Calibration report number", "CAL/LPI/GP-23/23"]]),
    row(["", 6]),
    row(["Measuring Scale (Ruler) under calibration details", 6]),
    ...pairs([["Make", ""], ["Serial number", ""], ["Range", ""], ["Least count", ""], ["Calibration date", "23-09-2026"], ["Calibration due date", "22-09-2027"], ["Accetable tolerance", "+ / - 1 mm"]]),
    row(["", 6]),
    ["#", "Master calibrator reading", "Observed reading (mm)", "Difference", "Status (Pass/Fail)", "Calibration performed by"].map((text) => ({ text })),
    ...[50, 100, 150, 200, 250, 290].map((mm, i) => [{ text: String(i + 1) }, { text: `${mm} mm` }, { text: String(mm) }, { text: "0.0" }, ...(i === 0 ? [{ text: "Pass" }, { text: "Super Admin" }] : [{ text: "" }, { text: "" }])]),
  ];
  return [
    { kind: "table", rows: head, headerRows: 0 },
    { kind: "table", rows: body, headerRows: 0 },
  ];
}

test("both F/QC/17 documents download as Excel or Word, never through the owner's workbook's fill", () => {
  for (const id of ["qc-ruler-verification", "qc-ruler-verification-300"]) {
    assert.ok(PAPER_TABLE_EXPORTS.has(id) && HAND_DRAWN.has(id), id);
    assert.deepEqual(documentFileKinds(documentRepository.getByIdUnscoped(id)), ["xlsx", "docx"], id);
  }
  // Every document offers both now, its own kind first (the owner, 31-Oct-2026).
  const other = documentRepository.getByIdUnscoped("qc-weight-scale-calibration");
  assert.deepEqual(documentFileKinds(other), [documentFileKind(other), documentFileKind(other) === "xlsx" ? "docx" : "xlsx"], "its own kind first, the other beside it");
});

test("the Excel sheet is the paper: merged cells, Century Gothic, the heavy frame, the underlined title, Status and name down the six lines", () => {
  const sheet = paperTableSheet("qc-ruler-verification-300", pageBlocks(), "F-QC-17");
  assert.ok(sheet && sheet[0].kind === "sheet");
  const s = sheet![0] as Extract<ExportBlock, { kind: "sheet" }>;
  assert.equal(s.rowCount, 28);
  assert.equal(s.widths.length, 6);
  const at = (r: number, c: number) => s.cells.find((x) => x.row === r && x.col === c)!;
  assert.deepEqual([at(0, 0).text, at(0, 0).colSpan, at(0, 0).style.bold, at(0, 0).style.font], ["GUJARAT PRINT PACK PUBLICATIONS PVT LTD", 5, true, "Century Gothic"]);
  assert.deepEqual([at(1, 0).colSpan, at(1, 0).style.underline], [6, true], "the title across, underlined");
  assert.deepEqual([at(4, 0).text, at(4, 0).colSpan, at(4, 2).text, at(4, 2).colSpan], ["Make", 2, "Kristeen", 4]);
  assert.deepEqual([at(22, 4).text, at(22, 4).rowSpan, at(22, 5).text, at(22, 5).rowSpan], ["Pass", 6, "Super Admin", 6]);
  assert.equal(at(22, 3).style.keepText, true, "0.0 stays 0.0");
  assert.deepEqual([at(0, 0).style.borders[0], at(0, 0).style.borders[2], at(27, 0).style.borders[3]], [2, 2, 2], "the frame heavy");
  assert.equal(at(5, 0).style.borders[3], 1, "a thin rule between the lines");
  assert.ok(s.cells.every((c) => c.style.size > 10 && c.style.size < 15), "at its A4 size");
});

test("the Word page is the same table: its columns in points, Status and name merged down, the paper's faces", () => {
  const word = paperTableWord("qc-ruler-verification", pageBlocks());
  assert.ok(word && word[0].kind === "paper");
  const p = word![0] as Extract<ExportBlock, { kind: "paper" }>;
  assert.equal(p.rows.length, 28);
  assert.ok(Math.abs(p.widths.reduce((a, b) => a + b, 0) - 527) < 2, "the page's width less 12 mm each side");
  assert.deepEqual(p.rows[22].cells.map((c) => c.vMerge ?? ""), ["", "", "", "", "restart", "restart"]);
  assert.deepEqual(p.rows[23].cells.map((c) => c.vMerge ?? ""), ["", "", "", "", "continue", "continue"]);
  assert.ok(p.rows.every((r) => r.cells.every((c) => c.font === "Century Gothic")));
  assert.equal(p.rows[0].cells[0].text, "GUJARAT PRINT PACK PUBLICATIONS PVT LTD");
});

test("a page that does not read as the paper keeps the generic download", () => {
  assert.equal(paperTableSheet("qc-ruler-verification", pageBlocks().slice(1)), null);
  assert.equal(paperTableWord("qc-weight-scale-calibration", pageBlocks()), null);
});
