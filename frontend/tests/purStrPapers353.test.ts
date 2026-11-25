// THE PURCHASE AND STORE FORMATS DRAWN AS THE OWNER'S OWN PAPERS (REQUIREMENTS §353): F/PUR/01, 02, 03, 05, 06, F/STR/01 and 02,
// as his files print them.
// Run: npm run test:unit -- purStrPapers353
import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import type { DocumentDefinition, LogSheetData, MasterData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { paperTableFits, paperTableFor, type PaperCell, type PaperRow, type PaperTable } from "../src/data/seed/qcPaperTables";
import { PUR_PAPERS_353 } from "../src/data/seed/purPapers353";
import { STR_PAPERS_353 } from "../src/data/seed/strPapers353";
import { isColour, paperNeedsReading } from "../src/engine/paperReadable";
import { createDefaultData } from "../src/engine/recordDefaults";

// store/router.tsx reads window.location the moment it loads; the harness stands up none.
if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "#/dashboard", hostname: "localhost" }, configurable: true, writable: true });
}

ensureDocumentsSeeded();
ensureMasterSeeded();
const master: MasterData = masterRepository.get();
const DAY = "2026-11-25";

const PAPERS: Record<string, PaperTable> = { ...PUR_PAPERS_353, ...STR_PAPERS_353 };
const rowsOf = (p: PaperTable): PaperRow[] => [...p.head, ...p.body, ...p.foot];
const cellsOf = (p: PaperTable): PaperCell[] => rowsOf(p).flatMap((r) => r.cells).concat(p.lines?.cells ?? []);
const wordsOf = (p: PaperTable): string => cellsOf(p).map((c) => [c.t ?? "", ...(c.at ?? []).map((a) => a.t), ...(c.pick ?? []).map((k) => k.word)].join(" ")).join(" | ");
const width = (r: { cells: PaperCell[] }): number => Math.round(r.cells.reduce((a, c) => a + c.w, 0) * 100) / 100;

test("the seven are drawn as the owner's papers: every printed word the record's, every box and column of the format in its place", () => {
  assert.deepEqual(Object.keys(PAPERS).sort(), [
    "pur-approved-suppliers",
    "pur-service-provider-performance",
    "pur-supplier-audit-report",
    "pur-supplier-performance",
    "pur-supplier-registration",
    "str-incoming-material-vehicle",
    "str-sharp-metal-objects",
  ]);
  for (const [id, paper] of Object.entries(PAPERS)) {
    assert.equal(paperTableFor(id), paper, id);
    assert.ok(paper.ownWords, `${id}: the owner's own words`);
    const layout = getLogSheetLayout(id)!;
    assert.ok(paperTableFits(paper, layout), `${id}: every box and column has its place`);
    // every row as wide as the paper's table
    const widths = new Set([...rowsOf(paper), ...(paper.lines ? [{ cells: paper.lines.cells }] : [])].map(width));
    assert.equal(widths.size, 1, `${id}: rows of ${[...widths].join(", ")} mm`);
    // no colour on a company paper (§282): the paper's grey bands only
    assert.ok(cellsOf(paper).every((c) => !isColour(c.bg)), `${id}: no colour`);
  }
  // only the service agreement's date (§192), which F/PUR/01's paper has no place for, is kept off the paper
  assert.deepEqual(PUR_PAPERS_353["pur-supplier-registration"].offPaper, ["agreementValidUpto"]);
  assert.ok(Object.entries(PAPERS).every(([id, p]) => id === "pur-supplier-registration" || !p.offPaper?.length));
});

test("the company, the title and the format number as each paper prints them", () => {
  const COMPANY = "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED";
  const expect: Record<string, string[]> = {
    "pur-supplier-registration": ["SUPPLIER\nREGISTRATION FORM", "Document no.", "F/PUR/01", "Rev. no.", "Effective date", "01.12.2021", "1 Of 3", "2 Of 3", "3 Of 3", "GENERAL DETAILS – TO BE FILLED UP BY SUPPLIER", "INTERNAL OFFICE USE ONLY", "SIGNATURE WITH COMPANY’S SEAL"],
    "pur-supplier-audit-report": ["SUPPLIER AUDIT REPORT", "Format no. – F/PUR/02", "Rev. – 00", "Effective Date – 01.12.2021", ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `Page ${n} of 9`), "SUMMARY OF OBSERVATIONS", "Overall Status -", "Sign: -"],
    "pur-approved-suppliers": [COMPANY, "LIST OF APPROVED SUPPLIERS (RM, PM, SERVICE PROVIDER)", "F/PUR/03 (00/01.12.2021)", "UPDATION AS ON :", "SR. NO.", "Vendor Code", "SUPPLIER NAME", "Re-approval Due date", "File No"],
    "pur-supplier-performance": [
      COMPANY,
      "RAW MATERIAL (LABEL STOCK, INK, FILMS etc.) & PACKING MATERIALS SUPPLIER (PAPER CORE, WOODEN PALLETS etc.) PERFORMANCE MONITORING REGISTER",
      "F/PUR/05 (00/01.12.2021)",
      "Product Safety Rating",
      "No infestation",
      "Rejected & send back to Supplier",
      "Replace / improve",
      "Delayed",
      "Enter value based on above criteria in the following cells",
      "Don’t enter value in the following cell, its formula based",
    ],
    "pur-service-provider-performance": [COMPANY, "SERVICE PROVIDER - PERFORMANCE MONITORING REGISTER", "F/PUR/06 (00/01.12.2021)", "Rating Period :", "Sr. No.", "Quality & Product Safety\nParameter rating (Max 50)"],
    "str-incoming-material-vehicle": ["INCOMING MATERIAL VEHICLE & CONDITION\nMONITORING RECORD", "Received date", "Foreign matter contaminaiton", "Oil Sport on Floor", "Checked by"],
    "str-sharp-metal-objects": [COMPANY, "SHARP METAL OBJECTS (Razor Blade, Scissor, Cutter blade, Surgical Blade) ISSUANCE (NEW) & RETURN (OLD) RECORD", "F/STR/02 (00/01.12.2021)", "SHARP TOOL\nDESCRIPTION", "RECEIVERS\nSIGNATURE", "STORE KEEPER\nSIGN"],
  };
  for (const [id, words] of Object.entries(expect)) {
    const all = wordsOf(PAPERS[id]);
    for (const w of words) assert.ok(all.includes(w), `${id}: ${JSON.stringify(w)}`);
  }
  // F/PUR/01 and F/PUR/02 print the company's logo, not its name; the stamp prints neither, nor a number
  for (const id of ["pur-supplier-registration", "pur-supplier-audit-report"]) assert.ok(cellsOf(PAPERS[id]).some((c) => c.img?.src === "brand/gpp-paper-logo.png"), id);
  assert.ok(PAPERS["str-incoming-material-vehicle"].numberOffPaper);
  assert.ok(!wordsOf(PAPERS["str-incoming-material-vehicle"]).includes("GUJARAT"));
  // F/STR/02's number is its footer, under the grid
  assert.ok(PAPERS["str-sharp-metal-objects"].foot.some((r) => r.cells.some((c) => c.t === "F/STR/02 (00/01.12.2021)")));
  // the papers' own letters: "FILMS etc.)", not "ETC."
  assert.ok(!wordsOf(PAPERS["pur-supplier-performance"]).includes("ETC.)"));
});

test("the registers: their ruled lines as many as the paper rules, a SR. NO. only where the paper prints one", () => {
  const lines = (id: string) => PAPERS[id].lines!;
  assert.equal(lines("str-sharp-metal-objects").count, 10);
  assert.equal(lines("pur-service-provider-performance").count, 13);
  assert.equal(lines("pur-supplier-performance").count, 8);
  assert.equal(lines("pur-approved-suppliers").count, 7);
  // F/STR/02 and F/PUR/05 number no line; F/PUR/03 and F/PUR/06 number every ruled line
  assert.ok(!lines("str-sharp-metal-objects").cells.some((c) => c.num) && !wordsOf(PAPERS["str-sharp-metal-objects"]).includes("SR. NO."));
  assert.ok(!lines("pur-supplier-performance").cells.some((c) => c.num));
  assert.equal(lines("pur-service-provider-performance").cells[0].num, "all");
  assert.equal(lines("pur-approved-suppliers").cells[0].num, "all");
  // F/STR/02's nine columns in the paper's order, starting with DATE
  assert.deepEqual(lines("str-sharp-metal-objects").cells.map((c) => c.col), ["date", "sharpToolDescription", "qtyIssued", "issuedTo", "department", "receiversSignature", "returnQty", "storeKeeperSign", "remarks"]);
  // F/PUR/05: the plant's Delayed column where its 2025 register prints it, between the lots rejected and the ratings
  const p05 = lines("pur-supplier-performance").cells.map((c) => c.col);
  assert.equal(p05.indexOf("delayed"), p05.indexOf("lotsRejected") + 1);
  assert.equal(p05.indexOf("productSafetyRating"), p05.indexOf("delayed") + 1);
  // F/PUR/03: the plant's list's columns in the layout's order (§188), every one on the line
  assert.deepEqual(lines("pur-approved-suppliers").cells.slice(1).map((c) => c.col), getLogSheetLayout("pur-approved-suppliers")!.columns.map((c) => c.key));
  // the registers run on over pages, the letterhead and the headings on each (§277)
  for (const id of ["pur-approved-suppliers", "pur-supplier-performance"]) assert.ok(PAPERS[id].flows, id);
  for (const id of ["str-sharp-metal-objects", "pur-supplier-performance", "pur-service-provider-performance", "pur-approved-suppliers"]) assert.ok(PAPERS[id].body.some((r) => r.head), `${id}: its headings repeat`);
});

test("letters anyone can read: the papers at 8 pt or more as printed, F/PUR/05 refitted, F/PUR/03's columns fixed as the owner settled them", () => {
  for (const id of ["pur-supplier-registration", "pur-supplier-audit-report", "pur-service-provider-performance", "str-incoming-material-vehicle", "str-sharp-metal-objects"]) assert.equal(paperNeedsReading(PAPERS[id]), false, id);
  assert.equal(paperNeedsReading(PAPERS["pur-supplier-performance"]), true, "its 6 pt sheet is refitted to be read (§282)");
  assert.ok(PAPERS["pur-approved-suppliers"].fixedColumns);
  assert.equal(paperNeedsReading(PAPERS["pur-approved-suppliers"]), false, "F/PUR/03 keeps its settled columns (§309)");
});

test("the printed choices are the format's own answers: ringed or ticked on the paper, kept in the record's box", () => {
  const picksOf = (id: string) => cellsOf(PAPERS[id]).flatMap((c) => c.pick ?? []);
  const optionsOf = (id: string, key: string): string[] => {
    const layout = getLogSheetLayout(id)!;
    const f = [...layout.headerFields, ...(layout.footerFields ?? [])].find((x) => x.key === key)!;
    return f.type === "yesno" ? ["Yes", "No"] : (f.options ?? []);
  };
  for (const id of ["pur-supplier-registration", "pur-supplier-audit-report", "str-incoming-material-vehicle"]) {
    const byBox = new Map<string, string[]>();
    for (const p of picksOf(id)) byBox.set(p.box!, [...(byBox.get(p.box!) ?? []), p.value]);
    assert.ok(byBox.size > 0, id);
    for (const [box, values] of byBox) assert.deepEqual([...values].sort(), [...optionsOf(id, box)].sort(), `${id}: ${box}`);
  }
  // F/PUR/01's TYPE OF CONCERN, COMPANY ACTIVITIES, certification, status, assessment type and status; F/PUR/02's eight criteria and its overall status
  assert.equal(new Set(picksOf("pur-supplier-registration").map((p) => p.box)).size, 6);
  assert.equal(new Set(picksOf("pur-supplier-audit-report").map((p) => p.box)).size, 9);
  assert.equal(new Set(picksOf("str-incoming-material-vehicle").map((p) => p.box)).size, 7);
});

test("F/PUR/02: nine pages as the paper's, every audit point on its own line, each section a table of its own", () => {
  const p = PAPERS["pur-supplier-audit-report"];
  assert.equal(p.body.filter((r) => r.pb).length, 8, "pages 2 to 9");
  const rows = getLogSheetLayout("pur-supplier-audit-report")!.rowMode;
  assert.equal(rows.kind, "fixedRows");
  const lines = rows.kind === "fixedRows" ? rows.rows : [];
  const points = new Set(cellsOf(p).filter((c) => c.col === "auditPoint").map((c) => c.ln));
  assert.deepEqual([...points].sort((a, b) => a! - b!), lines.map((_, i) => i));
  // the eight section headings are the record's own section words, at each section's first line
  const sections = cellsOf(p).filter((c) => c.col === "section").map((c) => c.ln!);
  assert.equal(sections.length, 8);
  for (const ln of sections) assert.notEqual(lines[ln].section, ln > 0 ? lines[ln - 1].section : "");
  // the band EXTERNAL LABORATORY - IF USED is its own shaded line across the table
  const band = lines.findIndex((r) => r.auditPoint === "EXTERNAL LABORATORY - IF USED");
  const bandCell = cellsOf(p).find((c) => c.col === "auditPoint" && c.ln === band)!;
  assert.ok(bandCell.bg && bandCell.b);
});

async function shown(documentId: string, data: LogSheetData): Promise<string> {
  const [view, auth, store, router] = await Promise.all([
    import("../src/components/records/LogSheetRecordView"),
    import("../src/store/AuthContext"),
    import("../src/store/AppStore"),
    import("../src/store/router"),
  ]);
  const doc = documentRepository.getById(documentId) as DocumentDefinition;
  const record = { id: `p353-${documentId}`, documentId, periodKey: `${documentId}:${DAY}`, dueDate: DAY, status: "In Progress", isDemo: false, data, createdAt: `${DAY}T03:00:00.000Z`, updatedAt: `${DAY}T03:00:00.000Z` } as RecordInstance<LogSheetData>;
  return renderToStaticMarkup(h(auth.AuthProvider, null, h(store.AppStoreProvider, null, h(router.RouterProvider, null, h(view.LogSheetRecordView, { doc, record, editable: true, onChange: () => undefined })))));
}

test("F/PUR/03 on its paper: a service provider's SERVICE AGREEMENT is one cell across the six document columns, in its middle (§309)", async () => {
  const doc = documentRepository.getById("pur-approved-suppliers") as DocumentDefinition;
  const data = createDefaultData(doc, DAY, master) as LogSheetData;
  data.rows = [
    { id: "a", vendorCode: "S0529", supplierName: "Gurudev Pest Control", productService: "PEST CONTROL", category: "SERVICE PROVIDER", srf: "SERVICE AGREEMENT" },
    { id: "b", vendorCode: "S0137", supplierName: "K S Inctech Pvt.Ltd.", category: "MANUFACTURER", srf: "YES", tdsSpecs: "YES" },
  ] as LogSheetData["rows"];
  const html = await shown("pur-approved-suppliers", data);
  assert.match(html, /data-paper-form="table"/, "drawn as the paper");
  const merged = html.match(/<td[^>]*data-line-merge=""[^>]*>/g) ?? [];
  assert.equal(merged.length, 1, "one merged run: the service provider's line only");
  assert.match(merged[0], /colspan="6"/i);
  assert.match(merged[0], /pt-ac/);
  assert.match(merged[0], /data-pt-col="srf"/);
  // the manufacturer's line keeps its six document cells
  assert.ok((html.match(/data-pt-ln="1" data-pt-col="(srf|tdsSpecs|msds|foodGradeDeclaration|traceability|isoCertificate)"/g) ?? []).length === 6);
});

test("a Purchase paper keeps the fetch from Purchase Master Data above it, never printed (§187, §353)", async () => {
  const doc = documentRepository.getById("pur-service-provider-performance") as DocumentDefinition;
  const html = await shown("pur-service-provider-performance", createDefaultData(doc, DAY, master) as LogSheetData);
  assert.match(html, /data-paper-form="table"/);
  // (the bar shows for an account that holds the list; the tools stand in a block of their own outside the paper)
  const tools = html.indexOf("data-no-mark");
  assert.ok(tools >= 0, "the supplier tools' block");
  assert.ok(tools < html.indexOf("paper-head"), "above the paper");
  assert.match(html.slice(tools - 60, tools), /no-print/);
});
