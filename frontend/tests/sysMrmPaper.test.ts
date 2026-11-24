// F/SYS/04 AND F/SYS/04-A AS THE COMPANY'S OWN PAPERS (REQUIREMENTS §325; the owner, 24-Nov-2026: "i want this format
// perfectly in system", then "Yes, as proposed").
// Run: npm run test:unit -- sysMrmPaper
import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentDefinition, LogSheetData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrMasterSeeded } from "../src/data/repositories/hrMasterRepository";
import { recordRepository, ensureSeeded as ensureRecordsSeeded } from "../src/data/repositories/recordRepository";
import { autoFillRecord } from "../src/engine/autoFill";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { SYS_PAPER_TABLES } from "../src/data/seed/sysPaperTables";
import { paperTableFits, paperTableFor, type PaperCell, type PaperTable } from "../src/data/seed/qcPaperTables";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrMasterSeeded();
ensureRecordsSeeded();

const cellsOf = (f: PaperTable): PaperCell[] => [...f.head, ...f.body, ...f.foot].flatMap((r) => r.cells).concat(f.lines?.cells ?? []);
const words = (f: PaperTable): string => cellsOf(f).map((c) => `${c.t ?? ""} ${c.sentence?.before ?? ""}`).join(" ");

test("F/SYS/04 and F/SYS/04-A are drawn as their papers, every box of the format in its place", () => {
  for (const id of ["sys-mrm-record", "sys-mrm-agenda"]) {
    const form = paperTableFor(id);
    assert.equal(form, SYS_PAPER_TABLES[id], `${id} is drawn as its own paper`);
    assert.ok(form!.ownWords, `${id}: every printed word is the record's to type over`);
    assert.ok(paperTableFits(form!, getLogSheetLayout(id)!), `${id}: every box and column has its place on the paper`);
  }
});

test("F/SYS/04 prints its head on all nine pages, its eleven items and the paper's own words as written", () => {
  const form = SYS_PAPER_TABLES["sys-mrm-record"];
  const pages = 1 + [...form.body, ...form.foot].filter((r) => r.pb).length;
  assert.equal(pages, 8, "eight pages it starts itself; the objectives run over to the ninth");
  const w = words(form);
  for (const kept of ["Format No.: F/SYS/04", "Rev No: 01", "Date: 01.04.2025", "Reporting Responsibility / Process Owner:", "□ Documented information reviewed:", "Agenda\nItem\nRef.#"])
    assert.ok(w.includes(kept) || cellsOf(form).some((c) => c.t === kept), `the paper's own words: ${kept}`);
  const numbers = cellsOf(form).filter((c) => c.b && /^\d+$/.test(c.t ?? "") && c.w === 7.9).map((c) => Number(c.t));
  assert.deepEqual([...new Set(numbers)], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], "the eleven items, numbered down the left");
  // Every Discussion Results is a tick box of the three results the pages print.
  const results = cellsOf(form).flatMap((c) => c.pick ?? []);
  assert.equal(results.length, 11 * 3);
  assert.ok(results.every((p) => p.mark === "check"));
  assert.ok(!cellsOf(form).some((c) => c.bg), "no colour: the yellow of item 8 is not drawn");
  assert.equal(form.lines?.count, 19, "the 19 objectives");
});

test("the Sign column is left for a hand signature, and any row of the paper may be added under or deleted", () => {
  const form = SYS_PAPER_TABLES["sys-mrm-record"];
  const attendance = form.body.filter((r) => r.rowKey?.startsWith("attendance"));
  assert.equal(attendance.length, 4);
  for (const r of attendance) assert.deepEqual([r.cells[2].t, r.cells[5].t], ["", ""]);
  assert.ok(form.body.filter((r) => r.rowKey).length > 30, "the items' rows each have their + and ×");
});

test("the meeting of 21.07.2025 reads on, box for box, on the new paper", () => {
  const rec = recordRepository.query({ isDemo: false }).find((r) => r.documentId === "sys-mrm-record");
  assert.ok(rec, "the meeting of 21.07.2025 is on file");
  const data = rec!.data as LogSheetData;
  assert.equal(data.header.item2Result, "No action required");
  assert.equal(data.rows.length, 19);
  const boxes = new Set(cellsOf(SYS_PAPER_TABLES["sys-mrm-record"]).flatMap((c) => [c.box, c.sentence?.box, ...(c.pick ?? []).map((p) => p.box)]).filter(Boolean));
  for (const key of Object.keys(data.header)) assert.ok(boxes.has(key), `${key} has its place on the paper`);
});

test("a new meeting's item 1 starts from the last meeting's New Action Items; their status is the new meeting's own", () => {
  const doc = documentRepository.getAll().find((d) => d.id === "sys-mrm-record") as DocumentDefinition;
  const last = recordRepository.query({ isDemo: false }).find((r) => r.documentId === "sys-mrm-record") as RecordInstance<LogSheetData>;
  const header = { ...last.data.header, newAction1Item: "Recruit two QC inspectors", newAction1When: "2026-02-15", newAction1Who: "Shail Patel", newAction2Item: "" };
  const filled = autoFillRecord(doc, "2026-01-20", masterRepository.get(), { ...last, data: { ...last.data, header } });
  const h = (filled!.data as LogSheetData).header;
  assert.equal(h.item1Line1Action, "Recruit two QC inspectors");
  assert.equal(h.item1Line1When, "2026-02-15");
  assert.equal(h.item1Line1Who, "Shail Patel");
  assert.equal(h.item1Line1Status, "");
  assert.equal(h.item1Line2Action, "");
  assert.equal(h.item2Discussion, "", "the discussions are this meeting's own");
});
