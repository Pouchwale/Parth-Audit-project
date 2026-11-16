// F/PUR/02: EVERY AUDIT POINT AUDITED YES; THE NC TABLE FILLED FROM THE POINTS RATED NC; DRAWN AS THE PAPER'S TABLE
// (REQUIREMENTS §229; the owner, 16-Nov-2026).
// Run: npm run test:unit -- purchaseAuditNc
import test from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData, LogSheetRow } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded, masterRepository } from "../src/data/repositories/masterRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { createDefaultData } from "../src/engine/recordDefaults";
import { withComputedCells } from "../src/engine/computedCells";
import { AUDIT_DOC, NC_AUTO } from "../src/engine/purchaseAuditNc";
import { diffRecordData } from "../src/engine/recordHistory";

ensureDocumentsSeeded();
ensureMasterSeeded();
const blank = () => createDefaultData(documentRepository.getByIdUnscoped(AUDIT_DOC)!, "2026-11-16", masterRepository.get()) as LogSheetData;
const rate = (d: LogSheetData, itemNo: string, rating: string, comments = ""): LogSheetData => ({
  ...d,
  rows: d.rows.map((r: LogSheetRow) => (r.itemNo === itemNo ? { ...r, rating, comments } : r)),
});

test("a new sheet: every audit point AUDITED Yes, the shaded sub-heading blank", () => {
  const d = blank();
  const sub = d.rows.find((r) => r.auditPoint === "EXTERNAL LABORATORY - IF USED")!;
  assert.equal(sub.audited, "");
  assert.ok(d.rows.filter((r) => r !== sub).every((r) => r.audited === "Yes"), "every point Yes");
});

test("NC on a point fills the next NC line's Section, Details and Response; the comments follow; NC taken off empties it; a person's words stay", () => {
  let d = withComputedCells(AUDIT_DOC, rate(blank(), "1.2", "NC"));
  assert.deepEqual([d.header.nc1Section, d.header.nc1Details, d.header.nc1Response], ["1.2", "Implementation of HACCP", ""]);
  d = withComputedCells(AUDIT_DOC, rate(d, "1.2", "NC", "HACCP plan not reviewed"));
  assert.equal(d.header.nc1Response, "HACCP plan not reviewed", "the comments typed follow");
  d = withComputedCells(AUDIT_DOC, rate(rate(d, "2.2", "NC", "Yard not clean"), "3.1", "NC"));
  assert.deepEqual([d.header.nc2Section, d.header.nc2Response, d.header.nc3Section], ["2.2", "Yard not clean", "3.1"], "NC 2 and NC 3 in the points' order");
  d = withComputedCells(AUDIT_DOC, { ...d, header: { ...d.header, nc2Response: "Photos of the cleaned yard received" } });
  d = withComputedCells(AUDIT_DOC, rate(d, "2.2", "NC", "Yard still not clean"));
  assert.equal(d.header.nc2Response, "Photos of the cleaned yard received", "a person's own words are never written over");
  d = withComputedCells(AUDIT_DOC, rate(d, "3.1", "C"));
  assert.deepEqual([d.header.nc3Section, d.header.nc3Details], ["", ""], "NC taken off: the table's own boxes empty again");
  assert.ok(!diffRecordData(blank(), d).some((c) => c.field.includes(NC_AUTO)), "its bookkeeping is no line of the history");
});

test("the NC table is the paper's table: one line per NC, its four boxes across; Overall Status a line of its own", () => {
  const layout = getLogSheetLayout(AUDIT_DOC)!;
  const nc1 = layout.footerFields!.find((f) => f.key === "nc1Section")!;
  assert.deepEqual(nc1.boxTable?.rows, ["NC 1", "NC 2", "NC 3"]);
  assert.equal(nc1.boxTable?.columns.length, 4);
  assert.equal(layout.footerFields!.find((f) => f.key === "overallStatus")?.boxesPerLine, 2);
});
