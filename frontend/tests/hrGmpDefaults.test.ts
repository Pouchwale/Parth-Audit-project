// F/HR/19 STARTS AT YES ON EVERY POINT (the owner, 2-Nov-2026, twice: "in HR 19 by default the answer is Yes, and make
// sure it is editable"): a new monthly GMP inspection record has Yes on all fifty-five points - the handful asked the
// other way round too, since 2-Nov-2026's second word (REQUIREMENTS §165, over §162); the Compliance box stays the
// team's to change.
// Run: npm run test:unit -- hrGmpDefaults
import test from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { GMP_ITEMS } from "../src/data/seed/hrLayouts";
import { createDefaultData } from "../src/engine/recordDefaults";
import { logRowsRule, printedLineOf } from "../src/engine/recordLines";
import { effectiveColumn } from "../src/engine/roundTrip/bindingsFor";
import { todayISO } from "../src/utils/date";
import type { RecordInstance } from "../src/types";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { periodKeyFor } from "../src/engine/recordGenerator";
import { gmpYesOnOpenSheets, GMP_YES_NOTE, withEveryPointYes } from "../src/data/gmpYesMigration";

ensureDocumentsSeeded();
ensureMasterSeeded();

test("a new F/HR/19 record answers every point Yes, the questions asked the other way round too (§165)", () => {
  const doc = documentRepository.getById("hr-gmp-checklist")!;
  const data = createDefaultData(doc, todayISO(), masterRepository.get()) as unknown as LogSheetData;
  assert.equal(data.rows.length, GMP_ITEMS.length);
  data.rows.forEach((row, i) => assert.equal(row.compliance, GMP_ITEMS[i][1], `point ${i + 1}: ${GMP_ITEMS[i][0]}`));
  assert.ok(GMP_ITEMS.every(([, answer]) => answer === "Yes"), "every point starts at Yes");
  assert.equal(data.rows.find((r) => String(r.parameter).startsWith("Whether any person found with illness"))?.compliance, "Yes");
  assert.ok(data.rows.every((r) => String(r.actionIfNc ?? "") === ""), "the action box starts blank");
});

test("the Compliance box is the team's to change: not printed, not computed, and written like any cell", () => {
  const layout = getLogSheetLayout("hr-gmp-checklist")!;
  const compliance = layout.columns.find((c) => c.key === "compliance")!;
  assert.equal(compliance.type, "yesno");
  assert.ok(!compliance.fixed && !compliance.computed && !compliance.locked);
  assert.ok(logRowsRule(layout).writable.includes("compliance"), "clear-the-line and Mitra may write it");
  const doc = documentRepository.getById("hr-gmp-checklist")!;
  const data = createDefaultData(doc, todayISO(), masterRepository.get()) as unknown as LogSheetData;
  // Changing an answer to No does not unprint the point's words, and the point is still known by its words.
  const changed = { ...data.rows[0], compliance: "No" };
  const printed = printedLineOf(layout, changed, 0)!;
  assert.equal(printed.parameter, GMP_ITEMS[0][0]);
  assert.equal(effectiveColumn(layout.columns[0], printed).fixed, true, "the point's words stay printed");
  assert.equal(effectiveColumn(compliance, printed).fixed, undefined, "the answer is written");
});

test("the sheets already made open at Yes too (§170): an untouched shell or prepared sheet is answered Yes on every point with a line in its history; one a person wrote on, handed in or verified is left", () => {
  const doc = documentRepository.getById("hr-gmp-checklist")!;
  const master = masterRepository.get();
  const old = (data: LogSheetData): LogSheetData => ({ ...data, rows: data.rows.map((r, i) => ({ ...r, compliance: i % 7 === 0 ? "No" : i % 5 === 0 ? "" : "Yes" })) });
  const at = (iso: string) => new Date(iso).toISOString();
  const make = (id: string, due: string, status: RecordInstance["status"], data: LogSheetData, more: Partial<RecordInstance> = {}): RecordInstance => {
    const r: RecordInstance = { id, documentId: doc.id, periodKey: periodKeyFor(doc, due), dueDate: due, status, isDemo: false, data, createdAt: at("2026-11-01T08:00:00Z"), updatedAt: at("2026-11-01T08:00:00Z"), ...more };
    // upsertMany keeps the stamps as given (a single upsert re-stamps updatedAt): the sheet reads as made and never touched.
    recordRepository.upsertMany([r]);
    return r;
  };
  recordRepository.queryUnscoped({ documentId: doc.id, isDemo: false }).forEach((r) => recordRepository.remove(r.id));
  const blank = createDefaultData(doc, "2026-11-30", master) as unknown as LogSheetData;
  make("gmp-shell", "2026-11-30", "Due", old(blank));
  make("gmp-prepared", "2026-12-31", "In Progress", old(blank), { prepared: { at: at("2026-11-01T08:00:00Z"), by: "assistant", notes: [], basedOn: "", knownPartsOnly: true } });
  const written = make("gmp-written", "2027-01-31", "In Progress", old(blank), { prepared: { at: at("2026-11-01T08:00:00Z"), by: "assistant", notes: [], basedOn: "", knownPartsOnly: true }, updatedAt: at("2026-11-02T10:00:00Z") });
  const verified = make("gmp-verified", "2026-10-31", "Verified", old(blank), { submittedAt: at("2026-10-31T10:00:00Z"), verifiedAt: at("2026-10-31T11:00:00Z") });
  assert.equal(gmpYesOnOpenSheets(), 2, "the shell and the prepared sheet");
  for (const id of ["gmp-shell", "gmp-prepared"]) {
    const r = recordRepository.getById(id)!;
    assert.ok((r.data as LogSheetData).rows.every((row) => row.compliance === "Yes"), `${id}: every point Yes`);
    assert.equal(r.status, id === "gmp-shell" ? "Due" : "In Progress", "the status is as it was");
    assert.equal(r.history?.[r.history.length - 1]?.note, GMP_YES_NOTE, `${id}: a line in its history`);
  }
  assert.deepEqual(recordRepository.getById("gmp-written")!.data, written.data, "a sheet a person wrote on is theirs");
  assert.deepEqual(recordRepository.getById("gmp-verified")!.data, verified.data, "a verified sheet is left");
  assert.equal(gmpYesOnOpenSheets(), 0, "run again: nothing to do");
  assert.strictEqual(withEveryPointYes(blank.rows), blank.rows, "lines already at Yes are the same lines");
  recordRepository.queryUnscoped({ documentId: doc.id, isDemo: false }).forEach((r) => recordRepository.remove(r.id));
});
