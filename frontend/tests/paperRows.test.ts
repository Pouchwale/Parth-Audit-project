// ANY ROW OF AN HR PAPER PUT IN OR TAKEN OFF, AND THE COMPANY'S OWN F/HR/10 WITH ITS 17 FILLED SHEETS (REQUIREMENTS §276).
// Run: npm run test:unit -- paperRows
import test from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData, LogSheetRow, RecordInstance } from "../src/types";
import { ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrSeeded, hrMasterRepository } from "../src/data/repositories/hrMasterRepository";
import { ensureSeeded as ensureRecordsSeeded, recordRepository } from "../src/data/repositories/recordRepository";
import { HR_PAPER_TABLES } from "../src/data/seed/hrPaperTables";
import { paperTableFits } from "../src/data/seed/qcPaperTables";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { HR_IMPARTED_ON_FILE } from "../src/data/seed/hrImpartedOnFile";
import { hrDirectorDetails, hrImpartedSheetsOnFile, HR_IMPARTED_DOC, impartedRecord, impartedRecordId } from "../src/data/hrSuppliedOnFile";
import { paperRowAdded, paperRowRemoved, paperRowsBack, paperWithRows } from "../src/engine/paperRows";
import { nameKey } from "../src/engine/hrMaster";
import { isOverdue } from "../src/engine/recordLifecycle";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrSeeded();
ensureRecordsSeeded();

const gmp = HR_PAPER_TABLES["hr-gmp-checklist"];
const blank = (n: number): LogSheetData => ({ header: {}, rows: Array.from({ length: n }, (_, i) => ({ id: `l${i}`, compliance: "Yes", actionIfNc: "" }) as LogSheetRow) });
const keysOf = (d: LogSheetData) => [...paperWithRows(gmp, d.words?.paperRows).body].filter((r) => r.rowKey).map((r) => r.rowKey as string);
const answered = (key: string) => paperWithRows(gmp, undefined).body.find((r) => r.rowKey === key && r.cells.some((c) => c.pick?.some((p) => p.col === "compliance")));

test("every HR paper offers its rows to add under and take off, and never its letterhead", () => {
  for (const [id, form] of Object.entries(HR_PAPER_TABLES)) {
    const shown = paperWithRows(form, undefined);
    const rows = [...shown.head, ...shown.body, ...shown.foot].filter((r) => r.rowKey);
    assert.ok(rows.length > 0 || !!form.lines, `${id} has rows to change`);
    for (const r of rows) assert.ok(!r.cells.some((c) => /GUJARAT PRINT PACK|Format No/i.test(c.t ?? "")), `${id}: the letterhead stays`);
  }
});

test("a row put in has the row's own answers on a line of its own, and the numbers count on", () => {
  const key = keysOf(blank(55)).find((k) => answered(k))!;
  const d = paperRowAdded(gmp, blank(55), key, "x1", () => ({ id: "new", compliance: "", actionIfNc: "" }) as LogSheetRow);
  assert.equal(d.rows.length, 56);
  const body = paperWithRows(gmp, d.words?.paperRows).body;
  const at = body.findIndex((r) => r.rowKey === "add:x1");
  assert.ok(at > 0);
  assert.ok(body[at].cells.some((c) => c.pick?.every((p) => p.ln === 55)), "its Yes / No is on the new line");
  const numbers = body.flatMap((r) => r.cells.filter((c) => /^\d+\.$/.test(c.t ?? "")).slice(0, 1).map((c) => parseInt(c.t as string, 10)));
  assert.deepEqual(numbers, numbers.map((_, i) => i + 1), "the Sr. No. runs on without a gap");
});

test("a row taken off keeps its words by place, no longer counts, and comes back as it was", () => {
  const start = blank(55);
  const key = keysOf(start).find((k) => answered(k))!;
  const line = answered(key)!.cells.flatMap((c) => c.pick ?? []).find((p) => p.col === "compliance")!.ln as number;
  const off = paperRowRemoved(gmp, start, key);
  assert.ok(!keysOf(off).includes(key));
  assert.equal(off.rows[line].compliance, "");
  const back = paperRowsBack(off);
  assert.ok(keysOf(back).includes(key));
  assert.equal(back.rows[line].compliance, "Yes");
  assert.equal(back.words?.paperRows, undefined, "nothing left over on the record");
});

test("F/HR/10 is the company's own paper, its method of evaluation in its own words", () => {
  const form = HR_PAPER_TABLES[HR_IMPARTED_DOC];
  assert.ok(form?.ownWords);
  assert.ok(paperTableFits(form, getLogSheetLayout(HR_IMPARTED_DOC)!));
  assert.equal(getLogSheetLayout(HR_IMPARTED_DOC)!.headerFields.find((f) => f.key === "evaluationMethod")?.autoFill?.default, "On the Job observation / Written test / Discussion & Interaction");
});

test("the 17 filled F/HR/10 sheets are on file In Progress, every name as typed, none Overdue, added once", () => {
  hrImpartedSheetsOnFile();
  assert.equal(HR_IMPARTED_ON_FILE.length, 17);
  for (const s of HR_IMPARTED_ON_FILE) {
    const r = recordRepository.getById(impartedRecordId(s.key)) as RecordInstance<LogSheetData> | undefined;
    const made = r ?? impartedRecord(s);
    assert.equal(made.status, "In Progress");
    assert.equal(made.filedFromPaper, true);
    assert.equal(isOverdue(made), false);
    assert.equal(made.data.header.topic, s.topic);
    assert.deepEqual(made.data.rows.filter((x) => x.name).map((x) => x.name), s.lines.filter((l) => l[0]).map((l) => l[0]));
  }
  assert.equal(hrImpartedSheetsOnFile().length, 0);
});

test("the directors' details from Master Data.xlsx fill only empty boxes", () => {
  const shail = () => hrMasterRepository.all().find((p) => nameKey(p.fullName) === nameKey("Shail Patel"))!;
  const before = shail().designation;
  hrDirectorDetails();
  assert.equal(shail().dateOfBirth, "1988-10-21");
  assert.equal(shail().designation, before || "CEO");
});

test("F/SYS/06: one Audit Date for the whole plan, running down over every plan line put in (§393)", async () => {
  const { AUDIT_PLAN_PAPER } = await import("../src/data/seed/sysAuditPlanPaper");
  const plan = (d: LogSheetData) => paperWithRows(AUDIT_PLAN_PAPER, d.words?.paperRows).body;
  const dateCells = (rows: ReturnType<typeof plan>) => rows.flatMap((r) => r.cells.filter((c) => c.col === "auditDate" && !c.skip));
  const two: LogSheetData = { header: {}, rows: [{ id: "a" } as LogSheetRow, { id: "b" } as LogSheetRow] };
  assert.deepEqual(dateCells(plan(two)).map((c) => [c.ln, c.rs]), [[0, 2]], "one Audit Date box, the first line's, over both lines");
  const key = plan(two).find((r) => r.rowKey && r.cells.some((c) => c.col === "auditDate"))!.rowKey!;
  const more = paperRowAdded(AUDIT_PLAN_PAPER, two, key, "p1", () => ({ id: "n" }) as LogSheetRow);
  assert.deepEqual(dateCells(plan(more)).map((c) => [c.ln, c.rs]), [[0, 4]], "a plan line put in takes no date box: the one box runs down over it");
  const gone = paperRowRemoved(AUDIT_PLAN_PAPER, more, key);
  const rows = plan(gone);
  assert.equal(dateCells(rows).length, 0, "with the first lines taken off no date box is left");
  assert.ok(rows.every((r) => r.cells.reduce((w, c) => w + c.w, 0) > 184), "every row still spans the table");
});

test("F/SYS/05: a department put in is the next SN with Plan and Actual, and Date / Approved by stay where they were (§396)", async () => {
  const { SYS_PAPERS_352 } = await import("../src/data/seed/sysPapers352");
  const form = SYS_PAPERS_352["sys-audit-schedule"];
  const six: LogSheetData = { header: {}, rows: Array.from({ length: 6 }, (_, i) => ({ id: `d${i}` }) as LogSheetRow) };
  const shown = (d: LogSheetData) => paperWithRows(form, d.words?.paperRows).body;
  const height = (rows: ReturnType<typeof shown>) => rows.reduce((h, r) => h + r.h, 0);
  const key = shown(six).filter((r) => r.rowKey && r.cells.some((c) => c.col === "department")).pop()!.rowKey!;
  const more = paperRowAdded(form, six, key, "d7", () => ({ id: "n" }) as LogSheetRow);
  const rows = shown(more);
  const words = rows.map((r) => r.cells.map((c) => c.t ?? "").join("|"));
  assert.ok(words.some((w) => w.startsWith("7|") && w.includes("Plan")), "SN 7 with Plan");
  assert.ok(words.filter((w) => w.includes("Actual")).length === 7, "seven Actual lines");
  assert.equal(more.rows.length, 7, "the new department is a line of its own");
  assert.equal(Math.round(height(rows) * 100), Math.round(height(shown(six)) * 100), "the page below keeps its place");
});

test("F/SYS/05: the heading, the note and Date / Approved by have no + or x, and a strip put in under the note before is gone (§399)", async () => {
  const { SYS_PAPERS_352 } = await import("../src/data/seed/sysPapers352");
  const form = SYS_PAPERS_352["sys-audit-schedule"];
  const keyed = (p: ReturnType<typeof paperWithRows>) => [...p.body, ...p.foot].filter((r) => r.rowKey);
  const plain = paperWithRows(form, undefined);
  assert.ok(keyed(plain).every((r) => r.cells.some((c) => c.col === "department")), "only a department has + and x");
  const note = String(form.head.length + form.body.findIndex((r) => r.cells.some((c) => c.box === "scheduleNote")));
  const old = paperWithRows(form, { added: [{ id: "x", after: note, from: note }] });
  assert.equal(old.body.length, plain.body.length, "the empty strip under the note is not drawn");
});