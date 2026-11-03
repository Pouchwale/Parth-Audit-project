// F/HR/03 STARTS EVERY OPERATOR AT 5 (the owner, 3-Nov-2026: "in HR 03 every operator has by default score 5, but make sure
// it is editable, as I have already told you: in the HR module every single thing the user must be able to edit"): a new
// skill matrix line - a new record's, Add line's, a person fetched from HR Master Data's - has 5 (S, can operate
// individually) under every operation; the box stays a 5 / 3 / 1 choice the person changes; the matrix on file keeps its
// own points (REQUIREMENTS §167). And nothing on an HR sheet is locked: every box is the person's (§135).
// Run: npm run test:unit -- hrSkillDefaults
import test from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { SKILL_OPERATIONS } from "../src/data/seed/hrLayouts";
import { HR_RECORD_PAGES } from "../src/data/seed/hrModule";
import { SEED_HR_SKILL_MATRIX } from "../src/data/seed/hrRecords";
import { blankLogRow, createDefaultData } from "../src/engine/recordDefaults";
import { columnKind } from "../src/engine/observations";
import { logRowsRule } from "../src/engine/recordLines";
import { todayISO } from "../src/utils/date";

ensureDocumentsSeeded();
ensureMasterSeeded();

test("a new F/HR/03 line has 5 under every operation, on a new record and on a line added; the box is a 5 / 3 / 1 choice, never locked", () => {
  const doc = documentRepository.getById("hr-skill-matrix")!;
  const layout = getLogSheetLayout("hr-skill-matrix")!;
  assert.ok(SKILL_OPERATIONS.length >= 10, `${SKILL_OPERATIONS.length} operations`);
  const data = createDefaultData(doc, todayISO(), masterRepository.get()) as unknown as LogSheetData;
  assert.ok(data.rows.length >= 1);
  for (const row of data.rows) for (const { key } of SKILL_OPERATIONS) assert.equal(row[key], "5", `${key} on a new record's line`);
  assert.equal(data.rows[0].name, "", "the operator's name is the person's");
  const added = blankLogRow(layout);
  for (const { key } of SKILL_OPERATIONS) assert.equal(added[key], "5", `${key} on a line added`);
  for (const { key } of SKILL_OPERATIONS) {
    const col = layout.columns.find((c) => c.key === key)!;
    assert.equal(col.type, "select");
    assert.deepEqual(col.options, ["5", "3", "1"]);
    assert.equal(col.standard, "5");
    assert.ok(!col.fixed && !col.computed && !col.locked, `${key} is the person's to change`);
    assert.equal(columnKind(col), "fixed", "a standard: not a reading the prepare must leave blank");
    assert.ok(logRowsRule(layout).writable.includes(key), `${key}: Mitra and clear-the-line may write it`);
  }
});

test("the matrix on file (status as on 01.09.2026) keeps its own points: nothing is rewritten to 5", () => {
  const rows = (SEED_HR_SKILL_MATRIX.data as LogSheetData).rows;
  assert.equal(rows.length, 58);
  const points = rows.flatMap((r) => SKILL_OPERATIONS.map(({ key }) => String(r[key] ?? "")));
  assert.ok(points.some((p) => p === "") || points.some((p) => p === "3" || p === "1"), "the paper's own grading, blanks and all, as transcribed");
});

test("nothing on an HR sheet is locked or worked out for the person: every column is theirs, the printed words typed over in place (§135)", () => {
  for (const page of HR_RECORD_PAGES) {
    const layout = getLogSheetLayout(page.docId);
    if (!layout) continue;
    for (const c of layout.columns) assert.ok(!c.locked, `${page.docId} ${c.key} is not locked`);
    for (const c of layout.columns) assert.ok(!c.computed || page.docId === "hr-psc-survey-analysis", `${page.docId} ${c.key} is not worked out for the person`);
    for (const f of [...layout.headerFields, ...(layout.footerFields ?? [])]) assert.ok(!f.computed, `${page.docId} box ${f.key} is the person's`);
  }
});
