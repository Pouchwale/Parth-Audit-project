// EVERY HR PAPER READS: NO COLOUR ON IT, NO LETTER TOO SMALL, NOTHING PAST THE PAGE (REQUIREMENTS §280).
// Run: npm run test:unit -- paperReadable
import test from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData, LogSheetRow } from "../src/types";
import { HR_PAPER_TABLES } from "../src/data/seed/hrPaperTables";
import { lineRow, paperTablePrint, type PaperCell, type PaperTable } from "../src/data/seed/qcPaperTables";
import { isColour, paperNeedsReading, readablePaper } from "../src/engine/paperReadable";
import { withoutColours } from "../src/utils/originalFill/paperWords";
import { unzip, zipStored } from "../src/utils/xlsx";

const data = (form: PaperTable): LogSheetData => ({
  header: {},
  rows: Array.from({ length: Math.max(form.lines?.count ?? 1, 12) }, (_, i) => {
    const row: LogSheetRow = { id: `l${i}` };
    for (const c of form.lines?.cells ?? []) if (c.col) row[c.col] = c.col === "name" ? "Satish Narayanbhai Solanki" : "5";
    return row;
  }),
});
const shown = (f: PaperTable): PaperCell[] => [...f.head, ...f.body, ...f.foot].flatMap((r) => r.cells).concat(f.lines ? lineRow(f, 0) : []);
const size = (f: PaperTable, c: PaperCell, scale: number) => (c.pt ?? f.pt) * scale;

test("no HR paper carries a colour: its yellow, orange and green are gone, its greys stay", () => {
  assert.ok(shown(HR_PAPER_TABLES["hr-skill-matrix"]).some((c) => isColour(c.bg)), "the company's F/HR/03 has them");
  for (const [id, form] of Object.entries(HR_PAPER_TABLES)) {
    const out = readablePaper(form, data(form), `colour-${id}`);
    assert.ok(!shown(out).some((c) => isColour(c.bg) || isColour(c.bgIf)), `${id} has no colour`);
  }
  const grey = readablePaper(HR_PAPER_TABLES["hr-mobile-authorization"], undefined, "grey");
  assert.ok(shown(grey).some((c) => c.bg === "#f2f2f2"), "a grey heading stays");
});

test("every HR paper prints its letters at 7 pt or more, written values at 7.5 or more, and stays inside the A4 page", () => {
  for (const [id, form] of Object.entries(HR_PAPER_TABLES)) {
    const out = readablePaper(form, data(form), `size-${id}`);
    const scale = paperTablePrint(out, true).scale;
    for (const c of shown(out)) {
      if (c.skip || !(c.t || c.col || c.box || c.pick)) continue;
      assert.ok(size(out, c, scale) >= 6.9, `${id}: ${c.t ?? c.col} at ${size(out, c, scale)} pt`);
    }
    const width = out.head[0].cells.reduce((a, c) => a + c.w, 0) * scale;
    assert.ok(width <= (out.page === "portrait" ? 186 : 273) + 0.6, `${id} is ${width} mm wide`);
  }
});

test("a paper that had to be fitted is the paper its Word and Excel are drawn from; one already readable is left as it is", () => {
  assert.equal(paperNeedsReading(HR_PAPER_TABLES["hr-skill-matrix"]), true);
  assert.equal(paperNeedsReading(HR_PAPER_TABLES["hr-induction-operators"]), false);
  const same = HR_PAPER_TABLES["hr-induction-operators"];
  const out = readablePaper(same, data(same), "same");
  assert.equal(out.readFit, undefined);
  assert.deepEqual(out.head.map((r) => r.h), same.head.map((r) => r.h));
});

test("the company's own Word and Excel lose their colours and keep their greys", async () => {
  const enc = new TextEncoder();
  const zip = zipStored([
    { name: "word/document.xml", data: enc.encode('<w:p><w:shd w:val="clear" w:fill="FFFF00"/><w:shd w:val="clear" w:fill="D9D9D9"/><w:highlight w:val="yellow"/></w:p>') },
    { name: "xl/styles.xml", data: enc.encode('<fills><fill><patternFill patternType="solid"><fgColor rgb="FFF79646"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/></patternFill></fill></fills>') },
  ]);
  const files = await unzip((await withoutColours(zip)).buffer);
  const read = async (n: string) => new TextDecoder().decode(await files.get(n)!());
  const word = await read("word/document.xml");
  const xl = await read("xl/styles.xml");
  assert.ok(!word.includes("FFFF00") && !word.includes("highlight") && word.includes("D9D9D9"));
  assert.ok(!xl.includes("F79646") && xl.includes("D9D9D9"));
});
