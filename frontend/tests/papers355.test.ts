// DISPATCH, MARKETING AND CAPA DRAWN AS THE OWNER'S OWN PAPERS (REQUIREMENTS §372): F/DISP/01, F/DISP/02, F/DISP/04, F/MKT/02,
// F/MKT/04, F/MKT/05 and the Pest control GAP analysis report.
// Run: npm run test:unit -- papers355
import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import type { DocumentDefinition, LogSheetData, MasterData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { paperTableFits, paperTableFor, paperTablePrint, type PaperCell, type PaperRow, type PaperTable } from "../src/data/seed/qcPaperTables";
import { DISP_PAPERS_355 } from "../src/data/seed/dispPapers355";
import { MKT_PAPERS_355 } from "../src/data/seed/mktPapers355";
import { complaintChecklistPaper, gapInspectionPaper } from "../src/data/seed/capaPapers355";
import { newComplaintChecklistData } from "../src/data/seed/complaintChecklist";
import { paperNeedsReading } from "../src/engine/paperReadable";
import { sheetAsIssued } from "../src/i18n/documentText";
import { createDefaultData } from "../src/engine/recordDefaults";
import { ORIGINAL_FILES } from "../src/data/seed/originalFiles";

// store/router.tsx reads window.location the moment it loads; the harness stands up none.
if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "#/dashboard", hostname: "localhost" }, configurable: true, writable: true });
}

ensureDocumentsSeeded();
ensureMasterSeeded();

const rowsOf = (p: PaperTable): PaperRow[] => [...p.head, ...p.body, ...p.foot];
const cellsOf = (p: PaperTable): PaperCell[] => rowsOf(p).flatMap((r) => r.cells).concat(p.lines?.cells ?? []);
const wordsOf = (p: PaperTable): string => cellsOf(p).map((c) => [c.t ?? "", c.sentence?.before ?? "", c.sentence?.after ?? ""].join(" ")).join(" | ");
const widthOf = (r: { cells: PaperCell[] }): number => Math.round(r.cells.reduce((a, c) => a + c.w, 0) * 100) / 100;
/** The pages the paper draws for itself (a row that starts a page), each one's height in mm (a register's ruled lines run on to the pages they need). */
const pagesOf = (p: PaperTable): number[] => {
  const pages = [0];
  for (const r of rowsOf(p)) {
    if (r.pb) pages.push(0);
    pages[pages.length - 1] += r.h;
  }
  return pages;
};
/** Printed on A4: each page inside the page's 12 mm margin and 10 mm foot (with a register's first line), never within 5 mm of an edge. */
const onA4 = (p: PaperTable): boolean => {
  const [pw, ph] = p.page === "landscape" ? [297, 210] : [210, 297];
  const { left, top, scale } = paperTablePrint(p, true);
  const w = widthOf(p.head[0] ?? p.body[0]);
  const first = p.lines?.h ?? 0;
  return left >= 5 && left + w * scale <= pw - 5 && pagesOf(p).every((h) => top + (h + first) * scale <= ph - 10);
};

/** id, number, the paper's title words, the number line it prints ("" where his file prints none), pages. */
const LOG_PAPERS: [string, string, string, string, number][] = [
  ["disp-safe-transporter-agreement", "F/DISP/01", "SAFE TRANSPORTER AGREEMENT", "", 3],
  ["disp-container-stuffing", "F/DISP/02", "CONTAINER STUFFING & VEHICLE INSPECTION RECORD", "Format No.: F/DISP/02", 2],
  ["disp-vehicle-cleaning", "F/DISP/04", "VEHICLE (COMPANY OWNED) CLEANING PROTOCOL & RECORD [ Vehicle number:", "Format No.: F / DISP / 04", 1],
  ["mkt-feedback-analysis", "F/MKT/02", "Customer Feedback analysis", "F/MKT/02 (01/01.12.2021)", 1],
  ["mkt-complaint-trend", "F/MKT/04", "CUSTOMER COMPLAINTS TREND ANALYSIS -", "F/MKT/04 (00/01.12.2021)", 2],
];

test("each log sheet prints as the owner's paper: his company, his title, his number line, every box and column of the record in its place", () => {
  for (const [id, formatNo, title, numberLine, pages] of LOG_PAPERS) {
    const p = paperTableFor(id);
    assert.ok(p, `${id} is drawn as a paper`);
    assert.equal(p, DISP_PAPERS_355[id] ?? MKT_PAPERS_355[id], id);
    assert.equal(documentRepository.getById(id)?.formatNo, formatNo, id);
    assert.equal(p!.ownWords, true, `${id}: every printed word the record's to type over`);
    const w = wordsOf(p!);
    if (id !== "disp-safe-transporter-agreement") assert.ok(w.includes("GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED"), `${id}: the company as his paper writes it`);
    assert.ok(w.includes(title), `${id}: ${title}`);
    if (numberLine) assert.ok(w.includes(numberLine), `${id}: ${numberLine}`);
    const layout = getLogSheetLayout(id)!;
    assert.ok(paperTableFits(p!, layout), `${id}: every box and column of the record has its place on the paper`);
    // Every key of the layout is bound on the paper, or kept off it by name.
    const bound = new Set(cellsOf(p!).flatMap((c) => [c.box, c.sentence?.box, c.col, ...(c.pick ?? []).map((x) => x.col ?? x.box)].filter(Boolean) as string[]));
    const off = new Set(p!.offPaper ?? []);
    for (const k of [...layout.headerFields, ...(layout.footerFields ?? []), ...layout.columns].map((f) => f.key)) assert.ok(bound.has(k) || off.has(k), `${id}: ${k} has its place`);
    // Every row is the paper's width; the paper fits its A4 pages; no colour; no letter under 8 pt.
    const width = widthOf(p!.head[0]);
    for (const r of rowsOf(p!)) assert.ok(Math.abs(widthOf(r) - width) < 0.05, `${id}: a row of ${widthOf(r)} mm, the paper is ${width} mm`);
    if (p!.lines) assert.ok(Math.abs(widthOf({ cells: p!.lines.cells }) * (p!.lines.blocks ?? 1) + (p!.lines.gap ?? 0) * ((p!.lines.blocks ?? 1) - 1) - width) < 0.05, `${id}: the ruled lines are the paper's width`);
    assert.ok(onA4(p!), `${id} fits its A4 pages, 5 mm clear of every edge`);
    assert.ok(!cellsOf(p!).some((c) => c.bg || c.bgIf), `${id}: no colour on the owner's paper (§282)`);
    assert.equal(paperNeedsReading(p), false, `${id}: no letter prints under 8 pt, so the paper is never reflowed and its downloads stay his files`);
    assert.equal(pagesOf(p!).length, pages, `${id}: the pages his file prints`);
    assert.ok(ORIGINAL_FILES[id], `${id} downloads as his own file`);
  }
});

test("F/DISP/01 prints no number, as his file; the agreement's period and the transporter are the record's boxes in his words", () => {
  const p = DISP_PAPERS_355["disp-safe-transporter-agreement"];
  assert.equal(p.numberOffPaper, true, "the number shown on the screen only (§329)");
  assert.ok(!wordsOf(p).includes("F/DISP/01"));
  const clause = p.body.find((r) => r.cells.some((c) => c.box === "validFrom"))!;
  assert.deepEqual(
    clause.cells.map((c) => c.t ?? c.box),
    ["•", "This contract is valid for the period of", "validFrom", "to", "validTo", ", unless any major changes in technical"]
  );
  assert.ok(clause.cells.filter((c) => c.box).every((c) => c.b), "the dates bold, as his clause prints them");
  assert.ok(cellsOf(p).some((c) => c.sentence?.box === "transporterName" && c.sentence.before === "For Transporter - M/s"));
  const bolded = cellsOf(p).find((c) => c.bs)!;
  assert.equal(bolded.t!.slice(bolded.bs![0], bolded.bs![1]), "GUJARAT PRINT PACK PUBLICATIONS PRIVATE LIMITED", "his name in clause 3, bold");
  for (const heading of ["Damage / Contamination", "Loading / Protection", "Load Acceptance", "Product Security & Integrity", "Vehicle breaks down in transit"])
    assert.ok(cellsOf(p).some((c) => c.t === heading && c.b && c.u), `${heading}: bold and underlined`);
  // His Word header on all three pages: the title again, typed over once.
  assert.equal(cellsOf(p).filter((c) => c.t === "SAFE TRANSPORTER AGREEMENT").length, 3);
});

test("F/DISP/02 is his Gujarati page in every language: હા / નાં printed in two cells on every check, his letterhead on both pages", () => {
  const p = DISP_PAPERS_355["disp-container-stuffing"];
  assert.equal(sheetAsIssued("disp-container-stuffing"), true, "printed as issued, whatever language is chosen");
  const picks = cellsOf(p).flatMap((c) => c.pick ?? []);
  assert.deepEqual([...new Set(picks.map((x) => x.ln))], [0, 1, 2, 3, 4, 5, 6, 7], "the eight checks (1 to 4, 6 to 9)");
  assert.ok(picks.every((x) => x.col === "compliance" && ["હા", "નાં"].includes(x.value) && x.mark === "ring"));
  assert.deepEqual(
    cellsOf(p).filter((c) => /Page No\./.test(c.t ?? "")).map((c) => c.t),
    ["Page No.: 1 Of 2", "Page No.: 2 Of 2"]
  );
  assert.ok(wordsOf(p).includes("પરિવહન વાહન નિરીક્ષણ અહેવાલ"), "the sub-heading over the checklist");
  assert.ok(wordsOf(p).includes("1. તેના આગમન પર કન્ટેનર ખોલો."), "the instructions in his Gujarati");
});

test("F/DISP/04: two sets of four columns on each of his sixteen lines, the heading and first line at the foot of page 1", () => {
  const p = DISP_PAPERS_355["disp-vehicle-cleaning"];
  assert.equal(p.page, "landscape");
  assert.equal(p.lines!.count, 16);
  assert.equal(p.lines!.blocks, 2, "the record's lines fill the first set, then the second");
  assert.deepEqual(p.lines!.cells.map((c) => c.col), ["date", "cleaningType", "driverSign", "dispatchInCharge"]);
  assert.ok(cellsOf(p).some((c) => c.sentence?.box === "vehicleNumber"), "the vehicle in the title's blank");
  for (const v of ["GJ02ZZ6403 – ECHO", "GJ02AT4947 – BOLERO PICK UP", "GJ02AT2070 – EICHER TRUCK", "GJ02AT5340 – EICHER TRUCK"]) assert.ok(cellsOf(p).some((c) => c.t === v), v);
  // The grid's heading at the foot of page 1, the room above it his empty lines: the page's room is 210 mm less its 12 mm top and
  // 10.5 mm foot (utils/paperPages.ts), so the first line stands on page 1 and the second starts page 2, as his file prints them.
  const { scale } = paperTablePrint(p, true);
  const above = [...p.head, ...p.body].reduce((a, r) => a + r.h, 0);
  const room = 210 - 12 - 10.5;
  assert.ok((above + p.lines!.h) * scale <= room - 2, "the heading and the first line on page 1");
  assert.ok((above + 2 * p.lines!.h) * scale > room + 2, "the second line on page 2");
});

test("F/MKT/02: his three cells outside the frame on each attribute, his second table and Conclusion", () => {
  const p = MKT_PAPERS_355["mkt-feedback-analysis"];
  for (const col of ["averageRating", "idealRating", "satisfiedPct"]) assert.equal(cellsOf(p).filter((c) => c.col === col).length, col === "satisfiedPct" ? 12 : 6, col);
  assert.equal(cellsOf(p).filter((c) => c.col === "furtherAction").length, 6);
  assert.ok(wordsOf(p).includes("Analysis with respect to average rating achieved against each \nattribute"));
  assert.ok(cellsOf(p).some((c) => c.box === "conclusion" && c.lines));
  assert.ok(!wordsOf(p).includes("SR. NO."), "no Sr. No. his paper does not have");
});

test("F/MKT/04: his trend sheet with its chart, then his Pareto sheet; the six periods his 2026 sheets have", () => {
  const p = MKT_PAPERS_355["mkt-complaint-trend"];
  const boxes = new Set(cellsOf(p).map((c) => c.box ?? c.sentence?.box).filter(Boolean));
  for (let n = 1; n <= 6; n++) for (const k of [`period${n}`, `complaints${n}`, `total${n}`]) assert.ok(boxes.has(k), k);
  const charts = cellsOf(p).filter((c) => c.chart).map((c) => c.chart!);
  assert.deepEqual(
    charts.map((c) => [c.n, c.title !== false]),
    [
      [0, true],
      [1, false],
    ],
    "the trend's chart with its own title; the Pareto's titled by its row"
  );
  assert.deepEqual(p.offPaper, ["classification"], "Vital Few / Useful Many are his chart's shades, not a column of his table");
  assert.ok(wordsOf(p).includes("Pareto Analysis") && wordsOf(p).includes("Insert new rows above this line"));
});

test("F/MKT/04's charts are drawn in their cells from the record's figures, without the screen's caption", async () => {
  const [view, auth, store, router] = await Promise.all([
    import("../src/components/records/LogSheetRecordView"),
    import("../src/store/AuthContext"),
    import("../src/store/AppStore"),
    import("../src/store/router"),
  ]);
  const doc = documentRepository.getById("mkt-complaint-trend") as DocumentDefinition;
  const master: MasterData = masterRepository.get();
  const data = createDefaultData(doc, "2026-01-31", master) as LogSheetData;
  data.header = { ...data.header, product: "LABELS", period1: "DEC 2021", complaints1: "1", period2: "CY 2022", complaints2: "7", cutoff: "80", paretoTitle: "LABELS" };
  data.rows = [{ id: "r1", cause: "Winding direction is in reverse", defects: 3 }, { id: "r2", cause: "Print defects", defects: 2 }] as LogSheetData["rows"];
  const record = { id: "rec-mkt04", documentId: doc.id, periodKey: "p", dueDate: "2026-01-31", status: "In Progress", isDemo: false, data, createdAt: "2026-01-31T03:00:00Z", updatedAt: "2026-01-31T03:00:00Z" } as RecordInstance<LogSheetData>;
  const html = renderToStaticMarkup(h(auth.AuthProvider, null, h(store.AppStoreProvider, null, h(router.RouterProvider, null, h(view.LogSheetRecordView, { doc, record, editable: true, onChange: () => undefined })))));
  assert.ok(html.includes('data-paper-form="table"'), "drawn as the paper");
  assert.equal((html.match(/class="pt-chart"/g) ?? []).length, 2, "both charts in their cells");
  assert.ok(html.includes('data-chart="bars"') && html.includes('data-chart="pareto"'));
  assert.ok(!html.includes("<figcaption"), "no screen caption on the paper");
  assert.ok(html.includes(">Customer complaint Trend<"), "the trend chart's own title");
});

test("F/MKT/05: his three pages, his header and footer on each, every activity's Date and Comments and every box the record's", () => {
  const p = complaintChecklistPaper(newComplaintChecklistData("26-27/001").sections);
  assert.equal(p.ownWords, true);
  assert.equal(p.pageFrame?.double, true, "his double page border");
  const pages = pagesOf(p);
  assert.equal(pages.length, 3);
  // Each page's foot at the same place: the head at 13.0 mm, the foot's box at 265.2 mm, the address under it.
  for (const h of pages) assert.ok(Math.abs(h - (265.2 - 13.0 + 9.0 + 7.4)) < 0.05, `a page of ${h} mm`);
  assert.ok(onA4(p), "fits its A4 pages");
  assert.deepEqual(
    cellsOf(p).filter((c) => /^Page \d of 3$/.test(c.t ?? "")).map((c) => c.t),
    ["Page 1 of 3", "Page 2 of 3", "Page 3 of 3"]
  );
  assert.equal(cellsOf(p).filter((c) => c.t === "Format number: - F/MKT/05 (00 / 21.07.2026)").length, 3);
  assert.equal(cellsOf(p).filter((c) => c.img?.src === "brand/gpp-logo-fmkt05.png").length, 3, "his logo at the head of each page");
  for (const col of ["srNo", "date", "comment"]) assert.deepEqual(cellsOf(p).filter((c) => c.col === col).map((c) => c.ln), Array.from({ length: 31 }, (_, i) => i), col);
  assert.deepEqual(
    cellsOf(p).filter((c) => c.box).map((c) => c.box).sort(),
    ["approvedBy.date", "approvedBy.designation", "approvedBy.name", "complaintNo", "complaintReceivedDate", "customerName", "jobCode", "jobName", "poNo", "preparedBy.date", "preparedBy.designation", "preparedBy.name"]
  );
  assert.ok(!wordsOf(p).includes("Done"), "no Done column his paper does not have");
  for (const s of ["A. COMPLAINT RECEIPT & REGISTRATION", "B. INVESTIGATION", "C. CORRECTIVE & PREVENTIVE ACTION (CAPA)", "D. CUSTOMER COMMUNICATION", "E. EFFECTIVENESS & CLOSURE", "APPROVAL"])
    assert.ok(cellsOf(p).some((c) => c.t === s), s);
  assert.equal(paperNeedsReading(p), false);
});

test("the Pest control GAP analysis report: his title, his three ruled rows above the findings, five findings' rows and two comment lines at least", () => {
  const p = gapInspectionPaper(0, 0);
  assert.equal(p.page, "landscape");
  assert.ok(wordsOf(p).includes("Pest contol service - Gaps Analysis report"));
  for (const w of ["Date Of Inspection", "Name and Address of Premises Inspected", "Contact Person", "Corrective Action to be Taken", "By Pest contol contractor", "By Client", "Target Date by\nGP-3", "Actual date of action\ntaken", "Verified by Service provider", "GENERAL COMMENT "])
    assert.ok(wordsOf(p).includes(w), w);
  assert.ok(!/SOURCE|STATUS/i.test(wordsOf(p)), "no Source or Status column his sheet does not have");
  assert.equal(p.body.filter((r) => r.line !== undefined).length, 5);
  assert.equal(cellsOf(p).filter((c) => c.col === "generalComment").length, 2);
  const more = gapInspectionPaper(7, 3);
  assert.equal(more.body.filter((r) => r.line !== undefined).length, 7, "a row for every finding past his five");
  assert.equal(cellsOf(more).filter((c) => c.col === "generalComment").length, 3);
  assert.deepEqual(
    cellsOf(p).filter((c) => c.box).map((c) => c.box),
    ["inspectionDate", "premisesName", "premisesAddress", "contactPerson"]
  );
  for (const r of rowsOf(p)) assert.ok(Math.abs(widthOf(r) - 260.2) < 0.05, `a row of ${widthOf(r)} mm`);
  assert.ok(onA4(p));
  assert.equal(paperNeedsReading(p), false);
  assert.equal(documentRepository.getById("gap-inspection")?.formatNo, "TO BE CONFIRMED", "his file gives it no number");
});
