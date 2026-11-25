// F/SYS/06 INTERNAL AUDIT SCHEDULE & PLAN AS THE COMPANY'S OWN PAPER (REQUIREMENTS §326; the owner, 24-Nov-2026: "check
// the current format and drive format and make format like drive").
// Run: npm run test:unit -- sysAuditPlanPaper
import test from "node:test";
import assert from "node:assert/strict";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { AUDIT_PLAN_PAPER } from "../src/data/seed/sysAuditPlanPaper";
import { paperTableFits, paperTableFor, type PaperCell, type PaperTable } from "../src/data/seed/qcPaperTables";

const cellsOf = (f: PaperTable): PaperCell[] => [...f.head, ...f.body, ...f.foot].flatMap((r) => r.cells);
const words = (f: PaperTable): string[] => cellsOf(f).flatMap((c) => [c.t ?? "", c.sentence?.before ?? ""]).filter(Boolean);

test("F/SYS/06 is drawn as the Drive page, every box and column of the format in its place", () => {
  const form = paperTableFor("sys-audit-plan");
  assert.equal(form, AUDIT_PLAN_PAPER);
  assert.ok(form!.ownWords, "every printed word is the record's to type over");
  assert.ok(paperTableFits(form!, getLogSheetLayout("sys-audit-plan")!), "every box and column has its place on the paper");
  assert.equal(form!.pageFrame?.double, true, "the page's double border");
});

test("the page's three tables and its words, as printed", () => {
  const w = words(AUDIT_PLAN_PAPER);
  for (const kept of [
    "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED",
    "INTERNAL AUDIT SCHEDULE & PLAN",
    "Format No.: F/SYS/06",
    "Rev No: 01",
    "Date: 01.03.2023",
    "Page No.: 1 Of 1",
    "Audit Sr. No.:",
    "Audit Team Leader:",
    "Auditor’s Name",
    "Department",
    "Function",
    "Audit\nDate",
    "Audit Time",
    "Acknowledge",
    "AUDIT SUMMARY",
    "Dept. Name/Clause Name",
    "No. of\nCritical NC",
    "No. of Major\nNC",
    "No. of Minor\nNC",
    "Verified By:",
  ])
    assert.ok(w.includes(kept), `the page's own words: ${JSON.stringify(kept)}`);
  // The plan and the summary are two tables, each on the record's own two lines (the summary no longer beside the plan).
  const plan = cellsOf(AUDIT_PLAN_PAPER).filter((c) => c.col === "function").map((c) => c.ln);
  const summary = cellsOf(AUDIT_PLAN_PAPER).filter((c) => c.col === "summaryName").map((c) => c.ln);
  assert.deepEqual(plan, [0, 1]);
  assert.deepEqual(summary, [0, 1]);
  // Every row is the table's width: 184.7 mm.
  for (const r of [...AUDIT_PLAN_PAPER.head, ...AUDIT_PLAN_PAPER.body, ...AUDIT_PLAN_PAPER.foot])
    assert.ok(Math.abs(r.cells.reduce((a, c) => a + c.w, 0) - 184.7) < 0.05, `a row of ${r.cells.map((c) => c.t ?? c.col ?? c.box).join(", ")}`);
});

test("a record keeps the two lines the page prints, so both rows of each table can be typed in", () => {
  const mode = getLogSheetLayout("sys-audit-plan")!.rowMode;
  assert.equal(mode.kind, "free");
  assert.equal(mode.kind === "free" ? mode.minRows : 0, 2);
});
