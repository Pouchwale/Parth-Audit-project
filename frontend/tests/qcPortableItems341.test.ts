// F/QC/42 LIST OF PORTABLE ITEMS & ITS MONITORING RECORD (REQUIREMENTS §341): added from the owner's Drive, drawn as his page.
// Run: npm run test:unit -- qcPortableItems341
import test from "node:test";
import assert from "node:assert/strict";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { paperTableFits, paperTableFor, type PaperCell, type PaperRow } from "../src/data/seed/qcPaperTables";
import { QC_GROUPS } from "../src/data/seed/qcModule";

ensureDocumentsSeeded();
ensureMasterSeeded();

const ID = "qc-portable-items";
const rowsOf = (): PaperRow[] => {
  const p = paperTableFor(ID)!;
  return [...p.head, ...p.body, ...p.foot];
};
const words = (): string => rowsOf().flatMap((r) => r.cells).map((c: PaperCell) => c.t ?? "").join(" | ");

test("F/QC/42 is a QC register with its paper's number and revision, on the QC overview", () => {
  const d = documentRepository.getById(ID);
  assert.ok(d);
  assert.equal(d!.formatNo, "F/QC/42");
  assert.equal(d!.revisionNo, "00");
  assert.equal(d!.revisionDate, "2025-04-01");
  assert.equal(d!.module, "Quality Control — Inspection Records");
  assert.equal(d!.section, "Registers & Records");
  assert.ok(QC_GROUPS.some((g) => g.documentIds.includes(ID)), "listed on QC Records");
});

test("it prints as his page: the letterhead, the title with its number, the items by location, each item's months, his note", () => {
  const p = paperTableFor(ID);
  assert.ok(p);
  assert.equal(p!.ownWords, true);
  const w = words();
  for (const s of [
    "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED",
    "LIST OF PORTABLE ITEMS & ITS MONITORING RECORD (F/QC/42 – 00/01.04.2025)",
    "NOS. & TYPE OF ITEMS",
    "STOP WATCH",
    "VISCOSITY CUP",
    "SPECTROPHOTO METER",
    "DIAL GAUGE",
    "EYE GLASS",
    "APRIL’25",
    "MARCH’26",
    "INTIGRITY CHECK",
    "CHECKED BY – QC SUPERVISOR",
    "VERIFIED BY- MANAGER - QC",
    "handled as per procedure of Product safety incident",
  ]) assert.ok(w.includes(s), s);
  assert.ok(paperTableFits(p!, getLogSheetLayout(ID)!), "every month of every line has its box on the paper");
  // Two landscape pages, as his page counts them: page 2 begins with the dial gauge.
  const breaks = rowsOf().filter((r) => r.pb);
  assert.equal(breaks.length, 1);
  assert.equal(breaks[0].cells[0].t, "DIAL GAUGE");
});

test("the record's 26 lines are the five items' checks, twelve months each", () => {
  const l = getLogSheetLayout(ID)!;
  assert.equal(l.rowMode.kind, "fixedRows");
  const rows = l.rowMode.kind === "fixedRows" ? l.rowMode.rows : [];
  assert.equal(rows.length, 26);
  assert.equal(l.columns.length, 13, "the line's name and the twelve months");
  const lns = new Set(rowsOf().flatMap((r) => r.cells).filter((c) => c.col).map((c) => `${c.col}:${c.ln}`));
  assert.equal(lns.size, 26 * 12);
});
