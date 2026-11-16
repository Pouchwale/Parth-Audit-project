// F/QC/11'S LINES PUT IN AND TAKEN OFF ANYWHERE; F/QC/11'S AND F/QC/12'S RECORDS NUMBERED 1, 2, 3 IN THE LIST AND IN THE
// SHEET'S SERIAL NO BOX (REQUIREMENTS §233; the owner, 16-Nov-2026: "in qc-11 add add row button like user can add new
// row or delete also in between anywhere and in second image serial number should also able to come and in qc-12 remove
// details from third image and add serial number"; asked: the test lines numbered again with Pass/Fail and Sign. at the
// foot; the Serial No box the record's running number; F/QC/12's list 1, 2, 3 as F/QC/11's).
// Run: npm run test:unit -- gsmRowsAndSerials
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { LogSheetData, LogSheetRow, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { gsmLineInserted, gsmLinesInOrder, isGsmTestLine } from "../src/engine/gsmLines";
import { logRowsRule, missingPrintedLines, printedLineOf } from "../src/engine/recordLines";
import { nominalFill } from "../src/engine/nominalFill";
import { runningNumbers } from "../src/engine/runningNumbers";
import { createDefaultData } from "../src/engine/recordDefaults";
import { createRecordForDocument } from "../src/engine/recordCrud";
import { serialNumbersOnSheets, SERIAL_NUMBER_NOTE, withSerialNumber } from "../src/data/serialNumbersMigration";

ensureDocumentsSeeded();
ensureMasterSeeded();

const GSM = "qc-gsm-plate-calibration";
const SCALE = "qc-weight-scale-calibration";
const ROOT = process.env.DCRS_REPO_ROOT ?? process.cwd();
const names = (rows: LogSheetRow[]) => rows.map((r) => String(r.parameter));
const sheet = (): LogSheetRow[] => (createDefaultData(documentRepository.getByIdUnscoped(GSM)!, "2026-11-17", masterRepository.get()) as LogSheetData).rows;
const clear = (id: string) => recordRepository.query({ documentId: id }).forEach((r) => recordRepository.remove(r.id));

test("F/QC/11's lines are open: a line put in under any test line, the test lines numbered again, Pass/Fail and Sign. at the foot", () => {
  const layout = getLogSheetLayout(GSM)!;
  const rule = logRowsRule(layout);
  assert.ok(rule.canAdd && rule.canRemove, "Add Row and the bin");
  const rows = sheet();
  assert.deepEqual(names(rows), ["Tasted-1", "2", "3", "4", "Pass/Fail", "Sign."]);
  const line = { id: "new-1" } as LogSheetRow;
  const under2 = gsmLineInserted(rows, line, rows[1].id);
  assert.deepEqual(names(under2), ["Tasted-1", "2", "3", "4", "5", "Pass/Fail", "Sign."]);
  assert.equal(under2[2].id, "new-1", "in its place: under the line it was asked under");
  assert.deepEqual([under2[2].p54, under2[2].p55, under2[2].p56, under2[2].p57], ["20 x 20cm", "10 x 10cm", "5 x 5cm", "2.5 x 2.5cm"], "the plates' sizes written in it");
  assert.equal(under2[3].id, rows[2].id, "the line that was 3 is now 4");
  const underSign = gsmLineInserted(rows, { id: "new-2" } as LogSheetRow, rows[5].id);
  assert.deepEqual(names(underSign), ["Tasted-1", "2", "3", "4", "5", "Pass/Fail", "Sign."]);
  assert.equal(underSign[4].id, "new-2", "under Sign.: put under the last test line, the foot stays the foot");
  assert.deepEqual(names(gsmLineInserted(rows, { id: "new-3" } as LogSheetRow)), ["Tasted-1", "2", "3", "4", "5", "Pass/Fail", "Sign."], "Add Row: under the last test line");
  // Taken off in between: the others numbered again.
  const off = gsmLinesInOrder(under2.filter((r) => r.id !== rows[0].id));
  assert.deepEqual(names(off), ["Tasted-1", "2", "3", "4", "Pass/Fail", "Sign."]);
  assert.deepEqual([off[0].id, off[1].id], [rows[1].id, "new-1"], "the line that was 2 is now Tasted-1");
  assert.ok(isGsmTestLine("Tasted-1") && isGsmTestLine("12") && !isGsmTestLine("Pass/Fail"));
});

test("Pass/Fail and Sign. stay one cell a plate wherever lines put in have moved them; an added line is measured as the others", () => {
  const layout = getLogSheetLayout(GSM)!;
  const rows = gsmLineInserted(sheet(), { id: "new" } as LogSheetRow, sheet()[0].id);
  const mode = layout.rowMode as Extract<typeof layout.rowMode, { kind: "fixedRows" }>;
  const printedAt = rows.map((r, i) => {
    const p = printedLineOf(layout, r, i);
    return p ? mode.rows.indexOf(p) : -1;
  });
  const foot = rows.map((r, i) => (layout.groupCellLines ?? []).includes(printedAt[i]));
  assert.deepEqual(foot, [false, false, false, false, false, true, true], "Pass/Fail and Sign., now lines 6 and 7");
  assert.deepEqual(missingPrintedLines(layout, rows), [], "no printed line counted as removed");
  const filled = nominalFill(GSM, { header: {}, rows: [{ id: "x", parameter: "5" } as LogSheetRow] }, "Kapila Barad")!;
  assert.equal(filled.rows[0].p54, "20 x 20cm", "Tasted-5 takes the plates' sizes on opening, as 1 to 4 do");
  const view = readFileSync(path.join(ROOT, "frontend", "src", "components", "records", "LogSheetRecordView.tsx"), "utf8");
  assert.match(view, /groupCells=\{groupCells\?\.includes\(printedAt\(row, i\)\)\}/);
  assert.match(view, /data-action="insert-row"/);
  assert.match(view, /const canInsertRows = canAddRows && doc\.id === GSM_DOC;/);
  // The line over Index / No. 54 as thin as the others: the heading's top rule not drawn under the date row's (§234).
  const css = readFileSync(path.join(ROOT, "frontend", "src", "styles.css"), "utf8");
  assert.match(css, /\.paper-sheet\[data-sheet="qc-gsm-plate-calibration"\] \.paper-body > \.card \+ \.doc-table table\.log-sheet > thead > tr:first-child > th \{ border-top-width: 0; \}/);
});

test("F/QC/11's and F/QC/12's records numbered 1, 2, 3 oldest first; the list says Serial number", () => {
  const recs = [
    { id: "b", dueDate: "2026-11-10", createdAt: "2026-11-01" },
    { id: "a", dueDate: "2026-11-03", createdAt: "2026-11-05" },
    { id: "c", dueDate: "2026-11-10", createdAt: "2026-11-02" },
    { id: "d", dueDate: "2026-12-01", createdAt: "2026-11-02" },
    { id: "e", dueDate: "2027-01-05", createdAt: "2026-11-02" },
  ];
  // Two figures, the count starting again each month (F/QC/11, a sheet a week) or each year (F/QC/12, a sheet a month) (§234).
  assert.deepEqual([...runningNumbers(GSM, recs)!.entries()], [["a", "01"], ["b", "02"], ["c", "03"], ["d", "01"], ["e", "01"]], "F/QC/11: 01 to 04 in each month");
  assert.deepEqual([...runningNumbers(SCALE, recs)!.entries()], [["a", "01"], ["b", "02"], ["c", "03"], ["d", "04"], ["e", "01"]], "F/QC/12: 01 to 12 in each year");
  assert.equal(runningNumbers("qc-viscosity", recs), null);
  const page = readFileSync(path.join(ROOT, "frontend", "src", "pages", "DocumentRecordsPage.tsx"), "utf8");
  assert.match(page, /const detailsTitle = isRulerVerification\(doc\.id\) \|\| numbers \? "Serial number" : hr\?\.labelTitle \?\? "Details";/);
  assert.match(page, /if \(serialNumbersOnSheets\(docId\) > 0\) bump\(\);/);
});

test("the Serial No box holds the record's running number: an empty box takes it, DCRS's own follows the list, a person's stays, a new sheet never carries the last one's", () => {
  for (const id of [GSM, SCALE]) {
    clear(id);
    const d = documentRepository.getByIdUnscoped(id)!;
    const now = new Date().toISOString();
    const made = (rid: string, due: string, status: RecordInstance["status"], serial = ""): RecordInstance => {
      const blank = createDefaultData(d, due, masterRepository.get()) as LogSheetData;
      const r: RecordInstance = { id: rid, documentId: id, periodKey: `${id}:${rid}`, dueDate: due, status, isDemo: false, data: { ...blank, header: { ...blank.header, serialNo: serial } }, createdAt: now, updatedAt: now };
      recordRepository.upsert(r);
      return r;
    };
    made(`${id}-1`, "2026-11-03", "Verified");
    made(`${id}-2`, "2026-11-10", "In Progress");
    made(`${id}-3`, "2026-11-17", "In Progress", "GPP-SC-9");
    assert.equal(serialNumbersOnSheets(id), 2, `${id}: the two empty boxes`);
    const h = (rid: string) => (recordRepository.getById(rid)!.data as LogSheetData).header.serialNo;
    assert.deepEqual([h(`${id}-1`), h(`${id}-2`), h(`${id}-3`)], ["01", "02", "GPP-SC-9"], `${id}: a number a person wrote stays`);
    assert.ok(recordRepository.getById(`${id}-1`)!.history?.some((e) => e.note === SERIAL_NUMBER_NOTE));
    assert.equal(serialNumbersOnSheets(id), 0, "nothing to do the next time");
    // A record dated earlier comes in: DCRS's numbers follow the list on every sheet, the verified one's too (§234); October
    // is F/QC/11's month of its own, the same year for F/QC/12.
    made(`${id}-0`, "2026-10-27", "In Progress");
    const gsm = id === GSM;
    assert.equal(serialNumbersOnSheets(id), gsm ? 1 : 3);
    assert.deepEqual([h(`${id}-0`), h(`${id}-1`), h(`${id}-2`), h(`${id}-3`)], gsm ? ["01", "01", "02", "GPP-SC-9"] : ["01", "02", "03", "GPP-SC-9"], `${id}: renumbered in its period`);
    // The 1, 2 written before §234 (DCRS's own) become 01, 02.
    const old = recordRepository.getById(`${id}-2`)!;
    const od = old.data as LogSheetData;
    recordRepository.upsert({ ...old, data: { ...od, header: { ...od.header, serialNo: "2" }, autoSerialNo: "2" } });
    assert.equal(serialNumbersOnSheets(id), 1);
    assert.equal(h(`${id}-2`), gsm ? "02" : "03");
    // A new sheet: its box empty (never the last one's), the number written on opening.
    const next = createRecordForDocument(d, { dateISO: "2026-12-01" }).record;
    assert.equal(next.dueDate.slice(0, 7), "2026-12", `${id}: a new sheet, not one already there`);
    const nd = next.data as LogSheetData;
    assert.equal(nd.header.serialNo, "", `${id}: a new sheet does not carry the last one's Serial No`);
    assert.equal(withSerialNumber(next)?.header.serialNo, gsm ? "01" : "05", `${id}: opened, it takes its number - December's first week, or the year's fifth sheet`);
    clear(id);
  }
});
