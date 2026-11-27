// F/SYS/03, 05, 07, 08, 10 AND 11 AS THE OWNER'S OWN PAPERS (REQUIREMENTS §352; the owner, 24-Nov-2026: "same format present in
// my system which is present in google drive ... whenever user ... take a print on A4 size paper, that should be very perfect").
// Run: npm run test:unit -- sysPapers352
import test from "node:test";
import assert from "node:assert/strict";
import type { LogSheetData } from "../src/types";
import { ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { recordRepository, ensureSeeded as ensureRecordsSeeded } from "../src/data/repositories/recordRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { lineRow, paperTableFits, paperTableFor, type PaperCell, type PaperRow, type PaperTable } from "../src/data/seed/qcPaperTables";
import { SYS_PAPERS_352 } from "../src/data/seed/sysPapers352";
import { paperNeedsReading, readablePaper } from "../src/engine/paperReadable";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureRecordsSeeded();

const IDS = ["sys-document-change", "sys-audit-schedule", "sys-audit-risk", "sys-audit-findings", "sys-audit-nc", "sys-nc-car"];
const COMPANY = "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED";
const rowsOf = (p: PaperTable): PaperRow[] => [...p.head, ...p.body, ...p.foot];
const cellsOf = (p: PaperTable): PaperCell[] => rowsOf(p).flatMap((r) => r.cells).concat(p.lines?.cells ?? []);
const words = (p: PaperTable): string[] => cellsOf(p).flatMap((c) => [c.t ?? "", c.sentence?.before ?? "", c.sentence?.after ?? "", ...(c.at ?? []).map((l) => l.t)]).filter(Boolean);
/** Every key a cell writes in: its box, its grid cell, a box inside its words, a tick box or a word to ring. */
const keysOf = (p: PaperTable): Set<string> =>
  new Set(
    cellsOf(p)
      .flatMap((c) => [c.box, c.sentence?.box, c.col, ...(c.pick ?? []).map((x) => x.box ?? x.col), ...(c.over ?? []).flatMap((o) => [o.box, o.col, ...(o.pick ?? []).map((x) => x.box ?? x.col)])])
      .filter((k): k is string => !!k)
  );

test("each of the six is drawn as the owner's paper, every box and column of its format in its place", () => {
  for (const id of IDS) {
    const paper = paperTableFor(id);
    assert.equal(paper, SYS_PAPERS_352[id], `${id} is drawn as its own paper`);
    assert.ok(paper!.ownWords, `${id}: every printed word is the record's to type over`);
    const layout = getLogSheetLayout(id)!;
    assert.ok(paperTableFits(paper!, layout), `${id}: the paper fits its layout`);
    // Never a key renamed or dropped: every box and column the format has is written somewhere on the paper.
    const keys = keysOf(paper!);
    for (const k of [...layout.headerFields, ...(layout.footerFields ?? [])].map((f) => f.key).concat(layout.columns.map((c) => c.key)))
      assert.ok(keys.has(k) || (paper!.offPaper ?? []).includes(k), `${id}: ${k} has its place on the paper`);
    assert.ok(!cellsOf(paper!).some((c) => c.bg || c.bgIf), `${id}: no colour (§282)`);
    // Every row is the paper's width: its columns stand one under the other.
    const rows = [...rowsOf(paper!), ...(paper!.lines ? [{ h: paper!.lines.h, cells: lineRow(paper!, 0) }] : [])];
    const width = rows[0].cells.reduce((a, c) => a + c.w, 0);
    for (const r of rows) assert.ok(Math.abs(r.cells.reduce((a, c) => a + c.w, 0) - width) < 0.05, `${id}: a row of ${r.cells.map((c) => c.t ?? c.col ?? c.box).join(", ")}`);
  }
});

test("the company as the papers spell it, each title, and the format number in its place", () => {
  const expect: Record<string, string[]> = {
    "sys-document-change": ["DOCUMENT CHANGE REQUEST & APPROVAL NOTE", "Format No.: F/SYS/03", "Rev No: 01", "Date: 01.12.2021", "Page No. : 1 Of 1", "DOCUMENT CHANGE / INTRODUCTION / REMOVAL REQUEST NOTE"],
    "sys-audit-schedule": ["YEARLY INTERNAL AUDIT SCHEDULE (BRCGS PACKAGING – Issue 07) for the Year:", "Format No.: F/SYS/05", "Rev No: 01", "Date: 01.03.2023", "Page No.: 1 Of 1", "SN", "DEPARTMENT", "Plan", "Actual", "Date", "Approved by (PSTL)"],
    "sys-audit-risk": ["INTERNAL AUDIT RISK ASSESSMENT - YEAR", "(based on review of BRCGS audits & findings of Internal audit etc.)", "F/SYS/07", "Rev. no. - 01", "Date : 01.03.2023", "Sum of  IQA + external audit NCs", "EXTERNAL AUDIT NC (2023)", "Irrespective of Risk rating criteria, each clause to be audited minimum Twice / Year"],
    "sys-audit-findings": ["INTERNAL AUDIT FINDINGS / OBSERVATION REPORT", "Format No.: F/SYS/08", "Rev No: 01", "Date: 01.03.2023", "BRCGS Packaging Materials – ISSUE 6", "Audit Checklist & Compliance Report", "Clause", "Requirements", "Compliance/Non\ncompliance", "Comments / Outcome"],
    "sys-audit-nc": ["INTERNAL AUDIT NC REPORT", "Format No.: F/SYS/10", "Rev No: 01", "Date: 01.12.2021", "NC FINDING STATEMENT", "Objective Evidence(s), if any", "CORRECTION ACTION", "CORRECTIVE ACTION", "Follow–up audit:", "CAR CLOSING VERIFICATION"],
    "sys-nc-car": ["NON-CONFORMANCE & CORRECTIVE ACTION REPORT", "(CAR)", "Format No.: F/SYS/11", "Rev No: 00", "Date: 01.12.2021", "CORRECTION DONE", "(Action Taken to Prevent Recurrence)", "CAR CLOSING VERIFICATION", "Sign. & Date of Re-verification & Satisfactory Closure"],
  };
  for (const id of IDS) {
    const w = words(SYS_PAPERS_352[id]);
    assert.ok(w.includes(COMPANY), `${id}: ${COMPANY}`);
    for (const kept of expect[id]) assert.ok(w.includes(kept), `${id}: the paper's own words ${JSON.stringify(kept)}`);
    // No "SR. NO." the paper does not print, and none of DCRS's own header words.
    assert.ok(!w.some((x) => /^SR\. NO\.$|PUBLICATIONS PVT LTD|^REV DATE/.test(x)), `${id}: DCRS's own header words are not on the paper`);
  }
});

test("F/SYS/03: the three requests as his tick boxes, Yes / No to ring, the dotted rule between the two halves, one A4 page", () => {
  const p = SYS_PAPERS_352["sys-document-change"];
  const picks = cellsOf(p).flatMap((c) => [...(c.pick ?? []), ...(c.over ?? []).flatMap((o) => o.pick ?? [])]);
  assert.deepEqual(picks.filter((x) => x.box === "requestType").map((x) => [x.value, x.mark]), [["Existing Document Change", "check"], ["New Document Introduction", "check"], ["Existing Document Removal", "check"]]);
  assert.deepEqual(picks.filter((x) => x.box === "requestApproved").map((x) => [x.value, x.mark]), [["Yes", "ring"], ["No", "ring"]]);
  assert.equal(cellsOf(p).filter((c) => /o/.test(c.edges ?? "")).length, 1, "the dotted rule");
  assert.equal(p.pageFrame?.double, true, "the page's double border");
  assert.ok(!p.flows && !rowsOf(p).some((r) => r.pb), "one page");
});

test("F/SYS/05: landscape, the six departments each on a Plan and an Actual line, the twelve months under each", () => {
  const p = SYS_PAPERS_352["sys-audit-schedule"];
  assert.equal(p.page, "landscape");
  for (const which of ["Plan", "Actual"]) {
    for (const m of ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]) {
      const lines = cellsOf(p).filter((c) => c.col === `${m}${which}`).map((c) => c.ln);
      assert.deepEqual(lines, [0, 1, 2, 3, 4, 5], `${m}${which} on every department's line`);
    }
  }
  assert.equal(words(p).filter((w) => w === "Plan").length, 6);
  assert.equal(words(p).filter((w) => w === "Actual").length, 6);
  // The note typed across the 2025 schedule prints under it.
  assert.ok(keysOf(p).has("scheduleNote"));
});

test("F/SYS/07: each section's figures one cell down its clauses, the key beside them, on two readable pages", () => {
  const p = SYS_PAPERS_352["sys-audit-risk"];
  const merged = cellsOf(p).filter((c) => c.col === "iqaNc" && (c.rs ?? 1) > 1).map((c) => [c.ln, c.rs]);
  assert.deepEqual(merged, [[0, 2], [4, 13], [18, 11], [30, 10], [41, 5]], "1.1-1.2, 3.1-3.13, 4.1-4.11, 5.1-5.10, 6.1-6.5");
  assert.equal(rowsOf(p).filter((r) => r.pb).length, 1, "page 2 from section 5, its head printed again");
  // His sheet prints on one page at 5 pt: the page is made readable (§282), at 8 pt or more, on two pages.
  assert.ok(paperNeedsReading(p));
  const rec = recordRepository.query({ isDemo: false }).find((r) => r.id === "seed-sys-audit-risk-2024");
  assert.ok(rec, "the 2024 assessment is on file");
  const read = readablePaper(p, rec!.data as LogSheetData, "sysPapers352-test");
  assert.equal(read.page, "portrait");
  const least = Math.min(...rowsOf(read).flatMap((r) => r.cells).filter((c) => !c.skip && (c.t || c.col || c.sentence)).map((c) => c.pt ?? read.pt));
  assert.ok(least >= 8, `letters of ${least} pt`);
  // The foot line on both pages, page 2's words page 1's.
  const feet = rowsOf(p).filter((r) => r.cells.some((c) => c.t === "F/SYS/07"));
  assert.equal(feet.length, 2);
});

test("F/SYS/08: page 1 the functions audited, then the checklist on its own pages, the head on each", () => {
  const p = SYS_PAPERS_352["sys-audit-findings"];
  for (const n of [1, 2]) for (const k of ["function", "auditDate", "auditTime", "auditors"]) assert.ok(keysOf(p).has(`${k}${n}`), `${k}${n}`);
  assert.deepEqual(p.lines!.cells.filter((c) => c.col).map((c) => c.col), ["clause", "requirements", "compliance", "comments"]);
  assert.ok(p.lines!.cells.filter((c) => c.col).every((c) => c.grow), "a line grows to its requirement's words");
  assert.ok(p.flows, "the checklist runs on over its pages");
  assert.equal(p.body.filter((r) => r.pb).length, 1, "the checklist starts on page 2");
  assert.equal(p.body.filter((r) => r.head).length, 1, "the checklist's headings, printed again on each of its pages");
  assert.equal(words(p).filter((w) => w === COMPANY).length, 2, "the company at the foot of page 1 and of the last page");
});

test("F/SYS/10 and 11: every box ruled as printed, the Notes in italics, F/SYS/11's four dashed cut lines", () => {
  const nc = SYS_PAPERS_352["sys-audit-nc"];
  const car = SYS_PAPERS_352["sys-nc-car"];
  const ticks = (p: PaperTable) => cellsOf(p).flatMap((c) => (c.over ?? []).flatMap((o) => o.pick ?? [])).filter((x) => x.mark === "check").map((x) => x.value);
  assert.deepEqual(ticks(nc), ["Non-Conformance"], "his F/SYS/10 ticks Non-Conformance alone");
  assert.deepEqual(ticks(car), ["Non-Conformance", "Observation"]);
  assert.ok(keysOf(nc).has("correctionAction") && keysOf(nc).has("correctiveAction"), "CORRECTION ACTION and CORRECTIVE ACTION, two boxes");
  for (const p of [nc, car]) {
    assert.ok(cellsOf(p).some((c) => c.t === "Note" && c.u && /i/.test(c.edges ?? "")), "the Note, underlined, in italics");
    const rings = cellsOf(p).flatMap((c) => (c.over ?? []).flatMap((o) => o.pick ?? [])).filter((x) => x.mark === "ring").map((x) => x.value);
    assert.deepEqual(rings, ["Satisfactory", "Unsatisfactory", "Closed", "Not Closed"]);
  }
  assert.equal(cellsOf(car).filter((c) => /d/.test(c.edges ?? "")).length, 4, "four cut lines");
  assert.equal(cellsOf(nc).filter((c) => /d/.test(c.edges ?? "")).length, 0);
});

test("the records on file read on, box for box, on the new papers", () => {
  for (const [recordId, id] of [
    ["seed-sys-audit-nc-feb-25-02", "sys-audit-nc"],
    ["seed-sys-audit-schedule-2025", "sys-audit-schedule"],
    ["seed-sys-audit-findings-2025-02", "sys-audit-findings"],
    ["seed-sys-audit-risk-2024", "sys-audit-risk"],
  ]) {
    const rec = recordRepository.query({ isDemo: false }).find((r) => r.id === recordId);
    assert.ok(rec, recordId);
    const keys = keysOf(SYS_PAPERS_352[id]);
    const data = rec!.data as LogSheetData;
    for (const [k, v] of Object.entries(data.header ?? {})) if (String(v ?? "").trim()) assert.ok(keys.has(k), `${recordId}: ${k} has its place`);
    for (const row of data.rows) for (const [k, v] of Object.entries(row)) if (k !== "id" && String(v ?? "").trim()) assert.ok(keys.has(k), `${recordId}: column ${k} has its place`);
  }
});
