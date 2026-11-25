// THE PRODUCTION SHEETS AND F-QC-32 DRAWN AS THE OWNER'S OWN PAPERS (REQUIREMENTS §350): F-PRD-18, F-PRD-19, F-PRD-20,
// F/PRD/21 and F-PRD-26 as his workbooks print them (data/seed/prdPapers350.ts), and F-QC-32 as his Google Drive sheet
// (data/seed/laminationQcPapers350.ts).
// Run: npm run test:unit -- productionPapers350
import test from "node:test";
import assert from "node:assert/strict";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { lineRow, paperTableFits, paperTableFor, paperTablePrint, QC_PAPER_TABLES, type PaperCell, type PaperTable } from "../src/data/seed/qcPaperTables";
import { PRD_PAPERS_350 } from "../src/data/seed/prdPapers350";
import { LAMINATION_QC_PAPERS_350 } from "../src/data/seed/laminationQcPapers350";
import { paperNeedsReading, isColour } from "../src/engine/paperReadable";
import { originalFileOf } from "../src/data/seed/originalFiles";

interface Sheet {
  id: string;
  company: string;
  title: string;
  number: string;
  page: "portrait" | "landscape";
  width: number;
  lines: number;
  headings: string[];
}

const SHEETS: Sheet[] = [
  {
    id: "prd-alc-production",
    company: "GUJARAT PRINTPACK PUBLICATIONS PRIVATE LIMITED",
    title: "SOLVENT BASE LAMINATION - ALC & PRODUCTION REPORT",
    number: "F-PRD-18 (01/25.06.2025)",
    page: "landscape",
    width: 272.9,
    lines: 12,
    headings: ["FG CODE", "INTERNAL PO No.", "JOB NAME", "LAYER 1 TYPE", "LAYER 1 - Kgs.", "LAYER 2 TYPE", "LAYER 2 - Kgs.", "ALC DONE AS PER ABOVE (YES/NO)", "OPERATOR SIGN", "START TIME", "END TIME", "LAMINATED ROLL WEIGHT -  Kgs.", "OK METERs", "IN TIME (HOTROOM)"],
  },
  {
    id: "prd-process-parameter",
    company: "GUJARAT PRINTPACK PUBLICATIONS PRIVATE LIMITED",
    title: "SOLVENT BASE LAMINATION - PROCESS PARAMETER RECORD",
    number: "F-PRD-19 (00/15.12.2024)",
    page: "landscape",
    width: 272.9,
    lines: 16,
    headings: ["INTERNAL PO No.", "FG CODE", "JOB NAME", "COATING NIP PRESSURE", "DOCTOR BLADE PRESSURE", "PRIMARY U/W TENSION", "LAY ON ROLL PRESSURE", "HOOD A TEMP.", "HOOD B TEMP.", "LINE SPEET", "REWINDER TENSION", "SECONDARY U/W TENSION", "TAPPER TENSION", "LAMINATOR NIP PRESSUTE", "LAMINATION NIP TEMP."],
  },
  {
    id: "prd-slitting-alc",
    company: "GUJARAT PRINTPACK PUBLICATIONS PRIVATE LIMITED",
    title: "SLITTING - ALC & PRODUCTION REPORT",
    number: "F-PRD-20 (01/25.06.2025)",
    page: "landscape",
    width: 272.9,
    lines: 11,
    headings: ["FG CODE", "INTERNAL PO No.", "JOB NAME", "OUT TIME (HOTROOM)", "FILM LAYER", "INPUT ROLL (Kgs.)", "INPUT ROLL WIDTH (mm)", "ALC DONE AS PER ABOVE (YES/NO)", "OPERATOR SIGN", "START TIME", "END TIME", "OUTPUT ROLL (Kgs.)", "OUT PUT ROLL WIDTH (mm)", "WASTAGE (Kgs)", "OK METERs"],
  },
  {
    id: "prd-pouching-line-clearance",
    company: "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED",
    title: "AREA LINE CLEARANCE REPORT -  POUCHING ( MACHINE NO. :                                                          )",
    number: "Format no. - F/PRD/21 (00-15.12.2024)",
    page: "landscape",
    width: 272.9,
    lines: 9,
    headings: [
      "Date \n(Old Job Production complete)",
      "Time \n(Old Job Production complete)",
      "WORK ORDER  No. of previous Product",
      "Previous Product Job Name",
      "Operator sign",
      "Line Clearance*  (Done/Not Done)",
      "Date (New Job Production Start)",
      "Time (New Job Production start)",
      "WORK ORDER No. of New Product",
      "New Product Name",
      "Operator sign",
      "Verified by Shift supervisor",
    ],
  },
  {
    id: "prd-doctoring-alc",
    company: "GUJARAT PRINTPACK PUBLICATIONS PRIVATE LIMITED",
    title: "DOCTORING - ALC & PRODUCTION REPORT",
    number: "F-PRD-26 (01/23.07.2025)",
    page: "landscape",
    width: 272.9,
    lines: 11,
    headings: ["INTERNAL PO No.", "FG CODE", "JOB NAME", "INPUT ROLL Kgs.", "Job bag Require KG", "ALC DONE AS PER ABOVE (YES/NO)", "OPERATOR SIGN", "START TIME", "END TIME", "OUTPUT ROLL Kgs.", "WASTAGE (Kgs)", "OK Running Mtr"],
  },
  {
    id: "qc-adhesive-mixing",
    company: "",
    title: "Adhesive Mixing Ratio Record",
    number: "Format No.: F-QC-32\nRev. 00\nDate : 15.12.2024",
    page: "portrait",
    width: 185.9,
    lines: 31,
    headings: ["Sr. No.", "Date", "Time", "Adhesive (kg)", "Hardener (kg)", "Ethyl (kg)", "Viscosity (Sec.)", "Remark", "Checked by", "Verified by"],
  },
];

const cellsOf = (p: PaperTable): PaperCell[] => [...p.head, ...p.body, ...p.foot].flatMap((r) => r.cells).concat(p.lines?.cells ?? []);
const words = (p: PaperTable): string[] => cellsOf(p).flatMap((c) => [c.t ?? "", c.sentence?.before ?? ""]).filter(Boolean);

test("the six are drawn as the owner's papers, every printed word the record's to type over, no colour", () => {
  for (const s of SHEETS) {
    const p = paperTableFor(s.id);
    assert.ok(p, s.id);
    assert.equal(p, PRD_PAPERS_350[s.id] ?? LAMINATION_QC_PAPERS_350[s.id], `${s.id}: the §350 paper`);
    assert.ok(p!.ownWords && p!.rules === "cells", `${s.id}: his words, every rule the cells' own`);
    assert.equal(p!.page, s.page, s.id);
    const all = words(p!);
    if (s.company) assert.ok(all.includes(s.company), `${s.id}: his company line, as he spells it on this sheet`);
    assert.ok(all.includes(s.title), `${s.id}: ${s.title}`);
    assert.ok(all.includes(s.number), `${s.id}: ${s.number}`);
    // No SR. NO. where the paper has none (F-QC-32's "Sr. No." is his own), and nothing of DCRS's own header (FORMAT NO. /
    // REV NO. / PAGE NO.).
    if (!s.headings.includes("Sr. No.")) assert.ok(!all.some((w) => /^SR\. ?NO\.?$/i.test(w.trim())), `${s.id}: no SR. NO. of DCRS's own`);
    assert.ok(!all.some((w) => /^FORMAT NO\.$|^REV NO\.$|^PAGE NO\.$/i.test(w.trim())), `${s.id}: no header of DCRS's own`);
    assert.ok(cellsOf(p!).every((c) => !isColour(c.bg) && !isColour(c.bgIf)), `${s.id}: no colour (§282)`);
  }
});

test("each fits its layout: every box and column the record keeps has its place, bound by its own key; the lines his sheet rules", () => {
  for (const s of SHEETS) {
    const p = paperTableFor(s.id)!;
    const layout = getLogSheetLayout(s.id)!;
    assert.ok(paperTableFits(p, layout), `${s.id}: the paper fits the format`);
    assert.equal(p.offPaper, undefined, `${s.id}: nothing of the format is left off the paper`);
    const boxes = cellsOf(p).flatMap((c) => [...(c.box ? [c.box] : []), ...(c.sentence ? [c.sentence.box] : []), ...(c.over ?? []).flatMap((o) => (o.box ? [o.box] : []))]);
    assert.deepEqual([...boxes].sort(), layout.headerFields.map((f) => f.key).sort(), `${s.id}: each box once`);
    assert.deepEqual((p.lines?.cells ?? []).flatMap((c) => (c.col ? [c.col] : [])), layout.columns.map((c) => c.key), `${s.id}: the columns in the layout's order`);
    assert.equal(p.lines?.count, s.lines, `${s.id}: ${s.lines} ruled lines, as his sheet`);
    // The headings in his words and letters, in his order (F-QC-32 numbers its lines under Sr. No.).
    const heading = [...p.head, ...p.body].find((r) => r.head)!;
    assert.deepEqual(heading.cells.map((c) => c.t), s.headings, `${s.id}: his headings`);
  }
});

test("each prints on one A4 page at its own size: no letter under 8 pt, nothing within 12 mm of an edge, his workbook still the download", () => {
  for (const s of SHEETS) {
    const p = paperTableFor(s.id)!;
    const rows = [...p.head, ...p.body, ...(p.lines ? [{ h: p.lines.h, cells: lineRow(p, 0) }] : []), ...p.foot];
    for (const [i, r] of rows.entries()) assert.ok(Math.abs(r.cells.reduce((a, c) => a + c.w, 0) - s.width) < 0.05, `${s.id} row ${i}`);
    const height = [...p.head, ...p.body, ...p.foot].reduce((a, r) => a + r.h, 0) + (p.lines ? p.lines.h * p.lines.count : 0);
    const [pageW, pageH] = s.page === "portrait" ? [210, 297] : [297, 210];
    const print = paperTablePrint(p, true);
    assert.equal(print.scale, 1, `${s.id}: printed at its own size`);
    assert.ok(print.left >= 12 && print.left + s.width <= pageW - 12 + 0.05, `${s.id}: ${print.left} + ${s.width} of ${pageW}`);
    // (the long register's page break is worked out against the page less 12 mm at its head and 10.5 at its foot)
    assert.ok(print.top + height <= pageH - 10.5 - 1, `${s.id}: ${print.top + height} mm of ${pageH}`);
    const sizes = cellsOf(p).map((c) => c.pt ?? p.pt);
    assert.ok(Math.min(...sizes) >= 8, `${s.id}: smallest letters ${Math.min(...sizes)} pt`);
    assert.equal(paperNeedsReading(p), false, `${s.id}: never refitted to be read (§282)`);
  }
  // The five production sheets download as his own workbooks, filled (REQUIREMENTS §119).
  for (const id of ["prd-alc-production", "prd-process-parameter", "prd-slitting-alc", "prd-pouching-line-clearance", "prd-doctoring-alc"]) assert.equal(originalFileOf(id)?.kind, "xlsx", id);
});

test("the boxes stand where his sheet writes them: after OPERATOR NAME :, in F/PRD/21's title blank; F-PRD-26's middle cell blank", () => {
  const alc = PRD_PAPERS_350["prd-alc-production"];
  const sentences = cellsOf(alc).filter((c) => c.sentence).map((c) => [c.sentence!.before, c.sentence!.box]);
  assert.deepEqual(sentences, [["OPERATOR NAME :", "operatorName"], ["MACHINE NAME :", "machineName"], ["DATE & SHIFT :", "shift"]]);
  // F-PRD-19's two rows of boxes, in his order (ADHESIVE (MAKE) : begins the second, as his).
  const pp = cellsOf(PRD_PAPERS_350["prd-process-parameter"]).filter((c) => c.sentence).map((c) => c.sentence!.box);
  assert.deepEqual(pp, ["operatorName", "machineName", "shift", "mixingRatio", "adhesiveMake", "adhesiveCode", "adhesiveBatch", "hardenerMake", "hardenerCode", "hardenerBatch"]);
  // F/PRD/21: the machine's number in the underlined blank of the title (its words stand 129.1 to 189.6 mm into the cell).
  const title = cellsOf(PRD_PAPERS_350["prd-pouching-line-clearance"]).find((c) => c.t?.startsWith("AREA LINE CLEARANCE REPORT"))!;
  assert.ok(title.u && title.over?.length === 1 && title.over[0].box === "machineNo");
  const o = title.over![0];
  assert.ok(o.x >= 129.1 && o.x + o.w <= 189.6, `the box ${o.x} to ${o.x + o.w} mm, inside the blank`);
  // F-PRD-26: the cell where its sister reports print MACHINE NAME is blank on his sheet.
  const doc26 = PRD_PAPERS_350["prd-doctoring-alc"].head[2].cells;
  assert.deepEqual(doc26.map((c) => c.sentence?.box ?? c.t), ["operatorName", "", "dateShift"]);
});

test("F-QC-32 is his Drive sheet now, not the page judged from a photograph: his logo, his number box, 31 lines numbered by the record", () => {
  assert.equal(QC_PAPER_TABLES["qc-adhesive-mixing"], undefined, "the photograph's paper is gone");
  const p = LAMINATION_QC_PAPERS_350["qc-adhesive-mixing"];
  assert.equal(p.head[0].cells[0].img?.src, "brand/gpp-logo-fqc32.png");
  assert.equal(p.lines?.cells[0].num, "rows", "the record's own lines numbered under Sr. No.");
  // The band under the title is blank inside the frame.
  assert.deepEqual(p.head[1].cells.map((c) => [c.t, c.edges]), [["", "lr"]]);
});
