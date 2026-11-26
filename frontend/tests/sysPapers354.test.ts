// F/SYS/12, 13, 14, 15, 16 AND 20 AS THE OWNER'S OWN PAPERS (REQUIREMENTS §371; the owner, 24-Nov-2026: "same format present in my
// system which is present in google drive ... take a print on A4 size paper, that should be very perfect").
// Run: npm run test:unit -- sysPapers354
import test from "node:test";
import assert from "node:assert/strict";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { objectivesHalfOf, objectivesPaperFor, SYS_PAPERS_354, SYS_PAPER_354_WIDTHS } from "../src/data/seed/sysPapers354";
import { paperTableFits, paperTableFor, paperTablePrint, type PaperCell, type PaperRow, type PaperTable } from "../src/data/seed/qcPaperTables";
import { paperNeedsReading } from "../src/engine/paperReadable";
import { HARA_MONTHLY_2024_04_ROWS, HARA_MONTHLY_ROWS } from "../src/data/seed/sysHaraTraceabilityLayouts";
import { SEED_SYS_HARA_MONTHLY_2024_04 } from "../src/data/seed/sysHaraTraceabilityRecords";
import type { LogSheetData } from "../src/types";

const IDS = ["sys-hara-monthly", "sys-mock-recall", "sys-backward-trace", "sys-forward-trace", "sys-objectives", "sys-hara-annual"];
const rowsOf = (f: PaperTable): PaperRow[] => [...f.head, ...f.body, ...f.foot, ...(f.lines ? [{ h: f.lines.h, cells: f.lines.cells }] : [])];
const cellsOf = (f: PaperTable): PaperCell[] => rowsOf(f).flatMap((r) => r.cells);
const words = (f: PaperTable): string[] => cellsOf(f).flatMap((c) => [c.t ?? "", c.sentence?.before ?? "", c.sentence?.after ?? ""]).filter(Boolean);
const boxes = (f: PaperTable): Set<string> => new Set(cellsOf(f).flatMap((c) => [c.box, c.sentence?.box, ...(c.pick ?? []).map((p) => p.box)].filter((k): k is string => !!k)));
const cols = (f: PaperTable): Set<string> => new Set(cellsOf(f).flatMap((c) => (c.col ? [c.col] : [])));
const paper = (id: string): PaperTable => SYS_PAPERS_354[id];

test("each document is drawn as the owner's paper, every box and column of its format in its place", () => {
  for (const id of IDS) {
    const form = paperTableFor(id);
    assert.equal(form, paper(id), `${id}: its paper`);
    assert.ok(form!.ownWords, `${id}: every printed word is the record's to type over`);
    const layout = getLogSheetLayout(id)!;
    assert.ok(paperTableFits(form!, layout), `${id}: the paper fits its format`);
    const off = new Set(form!.offPaper ?? []);
    for (const f of [...layout.headerFields, ...(layout.footerFields ?? [])]) assert.ok(boxes(form!).has(f.key) || off.has(f.key), `${id}: ${f.key} is written on the paper`);
    for (const c of layout.columns) assert.ok(cols(form!).has(c.key) || off.has(c.key), `${id}: column ${c.key} is written on the paper`);
    // Nothing of DCRS's own style: no SR. NO. column, no FORMAT NO. / REV NO. row, no colour.
    assert.ok(!words(form!).some((w) => /^SR\. NO\.$|FORMAT NO\.|REV NO\./.test(w)), `${id}: no DCRS heading`);
    assert.ok(cellsOf(form!).every((c) => !c.bg && !c.bgIf), `${id}: no shade`);
    // Every row of a paper is its width, so its rules stand in line.
    for (const r of rowsOf(form!)) {
      const w = r.cells.reduce((a, c) => a + c.w, 0);
      assert.ok(Math.abs(w - SYS_PAPER_354_WIDTHS[id]) < 0.06, `${id}: a row of ${w} mm (${r.cells.map((c) => c.t ?? c.col ?? c.box).join(", ")})`);
    }
    // Printed on A4 within the page, no letter under 8 pt (so it is not refitted, §282).
    const print = paperTablePrint(form!, true);
    const [pageW] = form!.page === "portrait" ? [210, 297] : [297, 210];
    const width = rowsOf(form!)[0].cells.reduce((a, c) => a + c.w, 0);
    assert.ok(print.left >= 12 && print.left + width * print.scale <= pageW - 11.9, `${id}: within the page's margins`);
    assert.equal(paperNeedsReading(form!), false, `${id}: every letter prints at 8 pt or more`);
  }
});

test("each paper's company, title and format number, in his words", () => {
  const has = (id: string, ...kept: string[]) => {
    const w = words(paper(id));
    for (const k of kept) assert.ok(w.includes(k), `${id}: ${JSON.stringify(k)}`);
  };
  for (const id of IDS.filter((i) => i !== "sys-hara-annual")) has(id, "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED");
  has("sys-hara-monthly", "MONTHLY HARA VERIFICATION", "Format No.: F/SYS/12", "Rev No: 00", "Date: 01.12.2021", "Page No.: 1 of 2", "Month: -", "Review date: -", "Sr.No.", "Verification attributes", "Status\n(Yes/No)", "Reference documents\n/ records", "Verification\nstatus\n(C / NC)", "Review comments", "HARA Review Team", "Sr.no.", "Name of Product safety team member", "Designation", "Sign");
  has("sys-mock-recall", "Mock Product Withdrawal Record", "F/SYS/13(00/01.12.2021)", "Date", "Start Time", "End time", "Total time", "Customer  Information", "Contact Person ( For Mock Withdrawal )", "Site senior management - Name", "Designation of Site senior management", "Contacted\nby", "e-mail", "Phone", "Fax", "Information of the product", "(Information that we are looking for)", "Response from Customer", "Responsible ( Product recall Team + other concerned members of the Organization as necessary )", "Process / Function", "Name", "Designation", "Signature", "Product Traced % :", "Was the Mock Recall efecctive?", "Why was effective? (add comments).", "Comments");
  has("sys-backward-trace", "BACKWARD TRACEABILITY RECORD (CUSTOMER to SUPPLIER)", "F/SYS/14 (00/01.12.2021)", "B/W Traceability date", "P/O Number", "Description", "Observation", "Packing Quantity", "Verified By");
  has("sys-forward-trace", "FORWARD TRACEABILITY CHECK LIST (SUPPLIER to CUSTOMER)", "F/SYS/15 (00/01.12.2021)", "Date of Forward\nTraceability", "Internal batch number", "1st Issue", "Issue dated", "Balance Qty.", "Verified By");
  has("sys-objectives", "Quality & Product Safety Objectives ( Year", "F/SYS/16 (00/01.12.2021)", "Sr. No.", "Department / Processes", "Parameter / Attribute", "Unit", "Plan / Actual", "January", "June", "Total", "% Achieved", "Plan", "Actual", "Actual - meters");
  has("sys-hara-annual", "ANNUAL HARA REVIEW & VERIFICATION RECORD", "F/SYS/20 (00 / 01.04.2025)", "Page No.: 1 of 4", "SITE NAME", "PRODUCTS", "HARA TEAM LEADER", "1. Review Purpose", "2. Changes Reviewed", "POINTS", "OBSERVATION", "3. CCMs / PRPs Verified", "CCM / CM / PRPs", "Effective?", "4. Validation/Verification Summary", "5. Recommendations/Updates", "6. Conclusion", "Next scheduled review:", "7.HARA Review Team");
  // F/SYS/20's letterhead is the company's logo; F/SYS/14 prints its number at the foot of both its pages.
  assert.ok(cellsOf(paper("sys-hara-annual")).some((c) => c.img?.src === "brand/gpp-paper-logo.png"), "the logo");
  assert.equal(words(paper("sys-backward-trace")).filter((w) => w === "F/SYS/14 (00/01.12.2021)").length, 2, "F/SYS/14's footer on each page");
});

test("the pages: F/SYS/12 and F/SYS/20 run on with their head, F/SYS/14 and F/SYS/16 are drawn page by page", () => {
  // The registers: the head and its column headings again on each page (utils/paperPages.ts), his double border round each.
  assert.equal(paper("sys-hara-monthly").lines?.count, 28);
  assert.deepEqual(paper("sys-hara-monthly").body.map((r) => !!r.head), [true, true, true], "Month / Review date and the headings start every page");
  assert.equal(paper("sys-hara-annual").lines?.count, 12);
  for (const id of ["sys-hara-monthly", "sys-hara-annual"]) assert.equal(paper(id).pageFrame?.double, true, `${id}: the page's double border`);
  const pages = (id: string) => 1 + [...paper(id).head, ...paper(id).body, ...paper(id).foot].filter((r) => r.pb).length;
  assert.equal(pages("sys-backward-trace"), 2);
  assert.equal(pages("sys-forward-trace"), 1);
  assert.equal(pages("sys-mock-recall"), 1);
  assert.equal(pages("sys-objectives"), 4, "five objectives a page, his print titles on each");
  assert.equal(pages("sys-hara-annual"), 2, "the recommendations, conclusion and team start a page of their own");
  // F/SYS/16: every objective on its own lines, objective 8 with its Actual - meters row.
  const objectives = cellsOf(paper("sys-objectives")).filter((c) => c.col === "department").map((c) => c.ln);
  assert.deepEqual(objectives, Array.from({ length: 18 }, (_, i) => i));
  assert.deepEqual(cellsOf(paper("sys-objectives")).filter((c) => c.col === "totalActualMeters").map((c) => c.ln), [7]);
  const mode = getLogSheetLayout("sys-objectives")!.rowMode;
  assert.equal(mode.kind === "free" ? mode.minRows : 0, 18, "a new sheet has the 18 lines to write on");
  // F/SYS/15: the 1st Issue's lines are the record's first line.
  assert.ok(cellsOf(paper("sys-forward-trace")).filter((c) => c.col).every((c) => c.ln === 0));
});

test("F/SYS/12's 28 attributes are his page's: rows 2, 16, 17 and 24 in his words, 25 to 28 added; the April 2024 meeting keeps its own", () => {
  const layout = getLogSheetLayout("sys-hara-monthly")!;
  assert.equal(layout.rowMode.kind, "fixedRows");
  const rows = layout.rowMode.kind === "fixedRows" ? layout.rowMode.rows : [];
  assert.equal(rows.length, 28);
  assert.equal(rows[1].attribute, "Has there been any change in the HARA Team / Product safety team?");
  assert.equal(rows[15].attribute, "Has any actual recall or withdrawal of products been made due to product safety?");
  assert.equal(rows[16].attribute, "Does result of mock recall (if carried out) found satisfactory");
  assert.equal(rows[23].attribute, "Does personal hygiene monitoring indicate any concerns / area of improvement");
  assert.equal(rows[27].attribute, "Any new hazard or risk identified, through review of HARA system or industry sources or reference materials from the website / magazines of packaging industry");
  // The rows that stay keep their places: 1, 3 to 15 and 18 to 23 are the April 2024 page's words.
  for (const i of [0, ...Array.from({ length: 13 }, (_, k) => k + 2), 17, 18, 19, 20, 21, 22]) assert.equal(HARA_MONTHLY_ROWS[i].attribute, HARA_MONTHLY_2024_04_ROWS[i].attribute, `row ${i + 1}`);
  // His Reference column is written by the meeting, not printed; a Month box stands beside the Review date.
  const reference = layout.columns.find((c) => c.key === "reference")!;
  assert.ok(!reference.fixed && reference.autoFill?.fresh, "Reference documents / records is written each month");
  assert.ok(rows.every((r) => !("reference" in r)));
  assert.ok(layout.headerFields.some((f) => f.key === "month"));
  // The meeting of 22 April 2024 was answered on the 24 lines of its day, its references as written.
  const april = SEED_SYS_HARA_MONTHLY_2024_04.data as LogSheetData;
  assert.equal(april.rows.length, 24);
  assert.equal(april.rows[16].attribute, "Any change in Product recall team members?");
  assert.equal(april.rows[16].reference, "PSMS-PRO-04");
  // His team table has six lines; the format's seventh and eighth members are kept, not printed.
  assert.deepEqual(paper("sys-hara-monthly").offPaper, ["team7Name", "team7Designation", "team8Name", "team8Designation"]);
});

test("F/SYS/13 is his blank sheet: the rows the 2025 pages left out are boxes of the format again", () => {
  const layout = getLogSheetLayout("sys-mock-recall")!;
  for (const key of ["siteSeniorName", "siteSeniorDesignation", "contactEmail", "contactPhone", "contactFax"]) {
    const f = layout.headerFields.find((x) => x.key === key);
    assert.ok(f && !f.required, `${key}: an optional box`);
    assert.ok(boxes(paper("sys-mock-recall")).has(key), `${key}: on the paper`);
  }
  // Was the Mock Recall efecctive? Yes / No, his two boxes.
  const picks = cellsOf(paper("sys-mock-recall")).flatMap((c) => c.pick ?? []);
  assert.deepEqual(picks.map((p) => [p.box, p.value]), [["effective", "Yes"], ["effective", "No"]]);
  // The Responsible table: the four printed functions are the format's lines.
  assert.deepEqual(cellsOf(paper("sys-mock-recall")).filter((c) => c.col === "processFunction").map((c) => c.ln), [0, 1, 2, 3]);
});

// §397 (the owner, 26-Nov-2026, F/SYS/16 against his Drive file: "Yes, add July–Dec"): his "2026 - H2" sheet.
test("F/SYS/16: a sheet dated July to December prints July to December, his H2 sheet; the same boxes, the same pages", () => {
  const h1 = objectivesPaperFor("2026-01-01");
  const h2 = objectivesPaperFor("2026-11-26");
  assert.equal(h1, paper("sys-objectives"), "January to June is the format's own paper");
  assert.equal(objectivesPaperFor("2026-06-30"), h1);
  assert.equal(objectivesPaperFor("2026-07-01"), h2);
  assert.equal(objectivesHalfOf("2026-07-01"), "H2");
  assert.equal(objectivesHalfOf("2026-06-30"), "H1");
  const layout = getLogSheetLayout("sys-objectives")!;
  assert.ok(paperTableFits(h2, layout), "the July-December paper fits the format");
  const w2 = words(h2);
  for (const m of ["July", "August", "September", "October", "November", "December"]) assert.equal(w2.filter((w) => w === m).length, 4, `${m} on each of the four pages`);
  for (const m of ["January", "June"]) assert.ok(!w2.includes(m), `${m} is not on the July-December sheet`);
  assert.deepEqual([...cols(h2)].sort(), [...cols(h1)].sort(), "the same boxes: the half's first to sixth month");
  assert.equal(rowsOf(h2).length, rowsOf(h1).length);
});
