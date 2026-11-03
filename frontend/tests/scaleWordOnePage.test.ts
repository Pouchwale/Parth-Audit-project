// F/QC/12's Word download is ONE page (the owner, 30-Oct-2026: "do font less ... in single page"): the owner's own file filled, the
// words of its wide grid written at 8 pt at most and smaller where a value would not fit its column on one line.
// (Checked in Word itself: the filled file was two pages without this and one with it.) Run: npm run test:unit -- scaleWordOnePage
import test from "node:test";
import assert from "node:assert/strict";
import { unzip } from "../src/utils/xlsx";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fillDocx } from "../src/utils/originalFill/docxFill";
import { hintsOf } from "../src/utils/originalFill/hints";
import { COMPANY } from "../src/data/seed/masterData";
import type { Cell, ExportBlock } from "../src/utils/documentExport";
import type { ExportBinding } from "../src/engine/roundTrip/exportMap";
const plain = (text: string): Cell => ({ text });
let n = 0;
const b = (text: string, label: string): Cell => {
  const bind: ExportBinding = { path: `p/${n++}`, type: "text", label, options: [], recordId: "r1", text };
  return { text, parts: [{ text, bind }], bind };
};
test("F/QC/12 filled Word file: the grid's words are at most 8 pt, only when the paper is one page", async () => {
  const tpl = readFileSync(path.join(process.cwd(), "frontend/public/originals/qc-weight-scale-calibration.docx"));
  const heads = ["Date", "Tested By", "Weight 1", "Tested Value 1", "Weight 2", "Tested Value 2", "Weight 3", "Tested Value 3", "Weight 4", "Tested Value 4", "Weight 5", "Tested Value 5", "Pass / Fail", "Sign", "Next Due Date"];
  const rows: Cell[][] = [heads.map(plain)];
  const dates = ["15-10-2026", "22-10-2026", "29-10-2026", "05-11-2026"];
  dates.forEach((d, i) => {
    rows.push([d, "Ms. Kapila Barad", "0.050mg", "0.050mg", "50.000gm", "50.000gm", "100.000gm", "100.006gm", "200.000gm", "200.015gm", "400.000gm", "400.034gm", "Pass", "Ms. Kapila Barad", dates[i + 1] ?? "12-11-2026"].map((t, c) => b(t, heads[c])));
    rows.push(["Deviation %", "", "", "0%", "", "0%", "", "0.006%", "", "0.008%", "", "0.009%", "", "", ""].map((t, c) => (c === 0 || !t ? plain(t) : b(t, "Deviation % " + c))));
  });
  const blocks: ExportBlock[] = [
    { kind: "text", text: COMPANY.name, strong: true, title: true },
    { kind: "text", text: "INTERNAL CALIBRATION RECORDS - WEIGHT SCALE", strong: true, title: true },
    { kind: "fields", perLine: 3, pairs: [["Device ID No", b("QC-76", "Device ID No")], ["Location", b("Laboratory", "Location")], ["Department", b("LAB", "Department")], ["Manufacturer", b("Force Strain Sensors", "Manufacturer")], ["Serial No", b("06", "Serial No")], ["Calibration Expiry", b("2027-09-20", "Calibration Expiry")], ["Minimum Reading Capacity", b("0.1 gm", "Minimum Reading Capacity")], ["Maximum Reading Capacity", b("600 gm", "Maximum Reading Capacity")], ["Acceptable Tolerance", b("0.05 %", "Acceptable Tolerance")]] },
    { kind: "table", rows, headerRows: 1 },
  ];
  for (const one of [false, true]) {
    const hints = { ...(hintsOf("qc-weight-scale-calibration") ?? {}), onePage: one };
    const out = await fillDocx(tpl.buffer.slice(tpl.byteOffset, tpl.byteOffset + tpl.byteLength) as ArrayBuffer, blocks, { hints, company: COMPANY.name });
    const zip = await unzip(out.bytes.slice().buffer);
    const xml = new TextDecoder().decode(await zip.get("word/document.xml")!());
    const grid = xml.match(/<w:tbl>(?:(?!<w:tbl>).)*?w:gridCol w:w="1185"[\s\S]*?<\/w:tbl>/)![0];
    const sizes = Array.from(grid.matchAll(/<w:sz w:val="(\d+)"/g), (m) => Number(m[1]));
    if (one) {
      assert.ok(sizes.length > 0 && Math.max(...sizes) <= 16 && Math.min(...sizes) >= 10, `grid sizes ${Math.min(...sizes)}..${Math.max(...sizes)}`);
    }
  }
});
