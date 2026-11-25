// THE FORMATS ADDED FROM THE OWNER'S GOOGLE DRIVE (REQUIREMENTS §332): F/STR/02A, 02B, 02C, F/PRD/11 and F/PRD/30 drawn as his
// papers, F-PRD-17 as a register of his workbook's headings.
// Run: npm run test:unit -- drivePapers332
import test from "node:test";
import assert from "node:assert/strict";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { paperTableFits, paperTableFor, type PaperCell, type PaperTable } from "../src/data/seed/qcPaperTables";
import { DRIVE_PAPERS_332 } from "../src/data/seed/drivePapers332";
import { ORIGINAL_FILES } from "../src/data/seed/originalFiles";
import { STORE_LAYOUTS } from "../src/data/seed/storeLayouts";

ensureDocumentsSeeded();
ensureMasterSeeded();

/** id, number, revision, module, the paper's title, the number line it prints. */
const PAPERS: [string, string, string, string, string, string][] = [
  ["str-scissor-issuance", "F/STR/02A", "00", "Store", "SCISSOR BLADE ISSUANCE (NEW) & RETURN (OLD) RECORD", "F/STR/02A (00/01.01.2026)"],
  ["str-tio2-blade-issuance", "F/STR/02B", "00", "Store", "TiO2 COATED BLADE ISSUANCE (NEW) & RETURN (OLD) RECORD", "F/STR/02B (00/01.01.2026)"],
  ["str-safety-cutter-issuance", "F/STR/02C", "00", "Store", "SAFETY CUTTER & BLADE ISSUANCE (NEW) & RETURN (OLD) RECORD", "F/STR/02C (00/01.01.2026)"],
  ["prd-surgical-blade", "F/PRD/11", "00", "Production", "SURGICAL BLADE ( USED ON SLITTING MACHINE BLADE HOLDER) MONITORING RECORD", "F/PRD/11 (00/01.12.21)"],
  ["prd-ss-adhesive-mixing", "F/PRD/30", "00", "Production", "SHRINK SLEEVE ADHESIVE MIXING RATIO RECORD", "F/PRD/30 (00/17.08.2026)"],
];
const cells = (p: PaperTable): PaperCell[] => [...p.head, ...p.body, ...p.foot].flatMap((r) => r.cells);
/** The paper on its A4 page: drawn to the page's width less 10 mm a side where it fills A4, else at its own size from its corner. */
const onA4 = (p: PaperTable): boolean => {
  const [pw, ph] = p.page === "landscape" ? [297, 210] : [210, 297];
  const w = Math.max(...[...p.head, ...p.body, ...p.foot].map((r) => r.cells.reduce((a, c) => a + c.w, 0)), (p.lines?.cells ?? []).reduce((a, c) => a + c.w, 0));
  const h = [...p.head, ...p.body, ...p.foot].reduce((a, r) => a + r.h, 0) + (p.lines ? p.lines.h * p.lines.count : 0);
  if (p.fillA4) return h * ((pw - 20) / w) <= ph - 20;
  return p.left >= 5 && p.left + w <= pw - 5 && p.top >= 5 && p.top + h <= ph - 5;
};
const words = (p: PaperTable): string => cells(p).map((c) => [c.t ?? "", ...(c.at ?? []).map((a) => a.t)].join(" ")).join(" ");

test("each is in the catalogue with its paper's number and revision, in its module, As Required, its file cited", () => {
  for (const [id, formatNo, rev, module] of PAPERS) {
    const doc = documentRepository.getById(id);
    assert.ok(doc, id);
    assert.equal(doc!.formatNo, formatNo, id);
    assert.equal(doc!.revisionNo, rev, id);
    assert.equal(doc!.module, module, id);
    assert.equal(doc!.schedule.type, "as-required", id);
    assert.match(doc!.sourceFile, /Google Drive/, id);
  }
  const ink = documentRepository.getById("prd-ink-formulation");
  assert.ok(ink);
  assert.equal(ink!.formatNo, "F-PRD-17");
  assert.equal(ink!.section, "Ink");
  assert.deepEqual(
    getLogSheetLayout("prd-ink-formulation")!.columns.map((c) => c.label),
    ["BUCKET NO", "PANTONE", "FORMULA", "GRAMS", "PARTY NAME", "FGLA CODE", "BATCH", "DATE"],
    "the workbook's headings (its SR NO is the register's own line number)"
  );
});

test("each prints as the owner's paper: his company, his title, his number line, every word his own", () => {
  for (const [id, , , , title, numberLine] of PAPERS) {
    const p = paperTableFor(id);
    assert.ok(p, `${id} is drawn as a paper`);
    assert.equal(p, DRIVE_PAPERS_332[id]);
    assert.equal(p!.ownWords, true, id);
    const w = words(p!);
    assert.ok(w.includes("GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED"), `${id}: the company as his paper writes it`);
    assert.ok(w.includes(title), `${id}: ${title}`);
    assert.ok(w.includes(numberLine), `${id}: ${numberLine}`);
    assert.ok(!w.includes("F/PRD/31"), `${id}: the Master List's number, not the workbook's F/PRD/31`);
    assert.ok(paperTableFits(p!, getLogSheetLayout(id)!), `${id}: every box and column of the record has its place on the paper`);
    assert.ok(onA4(p!), `${id} fits its A4 page, 5 mm clear of every edge`);
    assert.ok(!cells(p!).some((c) => c.bg), `${id}: no colour on the owner's paper (§282)`);
  }
});

test("the ruled lines are the record's lines: every column of the layout has its place on them", () => {
  for (const [id] of PAPERS) {
    const p = paperTableFor(id)!;
    const l = getLogSheetLayout(id)!;
    assert.ok(p.lines, `${id}: ruled lines`);
    const bound = p.lines!.cells.map((c) => c.col).filter(Boolean);
    assert.deepEqual([...bound].sort(), l.columns.map((c) => c.key).sort(), id);
    assert.ok(!cells(p).some((c) => c.box), `${id}: no stray box from the drawing`);
  }
  assert.equal(paperTableFor("str-tio2-blade-issuance")!.lines!.count, 10, "the Store registers rule ten lines");
  assert.equal(paperTableFor("prd-surgical-blade")!.lines!.count, 20, "F/PRD/11 numbers twenty");
  assert.equal(paperTableFor("prd-surgical-blade")!.lines!.cells[0].num, "all", "Sr. no. 1 to 20 printed as the paper prints them");
  assert.equal(paperTableFor("prd-ss-adhesive-mixing")!.lines!.count, 38);
});

test("F/STR/02A, 02B and 02C keep F/STR/02's columns and rules; each downloads as the owner's own file", () => {
  const sharp = STORE_LAYOUTS["str-sharp-metal-objects"];
  for (const id of ["str-scissor-issuance", "str-tio2-blade-issuance", "str-safety-cutter-issuance"]) {
    const l = getLogSheetLayout(id)!;
    assert.deepEqual(l.columns, sharp.columns, id);
    assert.deepEqual(l.instructions, sharp.instructions, id);
  }
  for (const [id] of PAPERS) {
    const o = ORIGINAL_FILES[id];
    assert.ok(o, `${id} downloads as the owner's file`);
    assert.equal(o.file, `originals/${id}.${o.kind}`);
  }
  assert.equal(ORIGINAL_FILES["prd-ink-formulation"], undefined, "the ink formulas' workbook is a list of entries, not a form to fill");
});
