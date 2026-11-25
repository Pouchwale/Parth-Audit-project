// QUALITY CONTROL - INSPECTION RECORDS DRAWN AND PRINTED AS THE OWNER'S PAPERS (REQUIREMENTS §370): the seven area line clearance
// reports F/QC/15-A to G (their framed paper), F/QC/08 and F/QC/16 (their papers, now his words), F-QC-19's tolerance card (his
// four pages of labels) and F/QC/29's utility test (its framed page).
// Run: npm run test:unit -- qcPapers370
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import type { DocumentDefinition, LogSheetData, MasterData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { QC_PAPER_TABLES, paperTableFits, paperTableFor, paperTablePrint, type PaperCell, type PaperRow, type PaperTable } from "../src/data/seed/qcPaperTables";
import { QC_PAPERS_370 } from "../src/data/seed/qcPapers370";
import { LINE_CLEARANCE_COMPANY } from "../src/data/seed/qcLineClearanceGeometry";
import { paperNeedsReading, readablePaper } from "../src/engine/paperReadable";
import { createDefaultData } from "../src/engine/recordDefaults";

// store/router.tsx reads window.location the moment it loads; the harness stands up none.
if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "#/dashboard", hostname: "localhost" }, configurable: true, writable: true });
}

ensureDocumentsSeeded();
ensureMasterSeeded();
const master: MasterData = masterRepository.get();
const DAY = "2026-11-25";
const css = readFileSync(path.join(process.cwd(), "frontend", "src", "styles.css"), "utf8");
const COMPANY = "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED";

const docOf = (id: string): DocumentDefinition => {
  const doc = documentRepository.getById(id);
  assert.ok(doc, id);
  return doc!;
};
const rowsOf = (p: PaperTable): PaperRow[] => [...p.head, ...p.body, ...p.foot];
const cellsOf = (p: PaperTable): PaperCell[] => [...rowsOf(p).flatMap((r) => r.cells), ...(p.lines?.cells ?? [])];
const words = (p: PaperTable): string[] => cellsOf(p).map((c) => c.t ?? "").filter(Boolean);
const rowWidth = (r: PaperRow) => Math.round(r.cells.reduce((a, c) => a + c.w, 0) * 100) / 100;

/** Every box and column of the record has its place on the paper (or is said to have none), and nothing else is bound. */
function boundAsTheLayout(id: string, p: PaperTable): void {
  const layout = getLogSheetLayout(id)!;
  assert.ok(paperTableFits(p, layout), `${id}: the paper fits its format`);
  const off = new Set(p.offPaper ?? []);
  const boxes = new Set(cellsOf(p).flatMap((c) => (c.box ? [c.box] : c.sentence ? [c.sentence.box] : [])));
  const cols = new Set(cellsOf(p).flatMap((c) => (c.col ? [c.col] : [])));
  for (const f of [...layout.headerFields, ...(layout.footerFields ?? [])]) assert.ok(boxes.has(f.key) || off.has(f.key), `${id}: box ${f.key} on the paper`);
  for (const c of layout.columns) assert.ok(cols.has(c.key) || off.has(c.key), `${id}: column ${c.key} on the paper`);
}

async function sheet(documentId: string): Promise<string> {
  const [view, auth, store, router] = await Promise.all([
    import("../src/components/records/LogSheetRecordView"),
    import("../src/store/AuthContext"),
    import("../src/store/AppStore"),
    import("../src/store/router"),
  ]);
  const record = {
    id: `p356-${documentId}`,
    documentId,
    periodKey: `${documentId}:${DAY}`,
    dueDate: DAY,
    status: "In Progress",
    isDemo: false,
    data: createDefaultData(docOf(documentId), DAY, master) as LogSheetData,
    createdAt: `${DAY}T03:00:00.000Z`,
    updatedAt: `${DAY}T03:00:00.000Z`,
  } as RecordInstance<LogSheetData>;
  return renderToStaticMarkup(
    h(auth.AuthProvider, null, h(store.AppStoreProvider, null, h(router.RouterProvider, null, h(view.LogSheetRecordView, { doc: docOf(documentId), record, editable: true, onChange: () => undefined }))))
  );
}

// ---------------------------------------------------------------------------
// F-QC-19

test("F-QC-19 is the card's four pages of labels: nine ERROR labels, ten banners, ten DOC NO. labels, seven approval tables", () => {
  const id = "qc-tolerance-card-nivea";
  const p = paperTableFor(id)!;
  assert.equal(p, QC_PAPERS_370[id]);
  assert.equal(p.ownWords, true, "every printed word the record's to type over");
  assert.equal(p.page, "portrait");
  boundAsTheLayout(id, p);
  // Four pages: the paper turns the page three times.
  assert.equal(rowsOf(p).filter((r) => r.pb).length, 3);
  const w = words(p);
  assert.equal(w.filter((t) => t === "TOLERANCE CARD FOR BEIERSDORF AG. GERMANY").length, 10);
  assert.equal(w.filter((t) => t === "DOC NO. : F-QC-19").length, 10);
  assert.equal(w.filter((t) => t === "APPROVED BY:").length, 7);
  assert.equal(w.filter((t) => t === "SIGN. :").length, 7);
  assert.ok(!w.some((t) => /GUJARAT|FORMAT NO|PAGE NO/i.test(t)), "nothing the card does not print: no company line, no number band");
  // The nine ERROR labels are the record's nine printed lines, in order, at the card's 24 pt; the banners 22 pt, the numbers 16 pt.
  const errors = cellsOf(p).filter((c) => c.col === "errorCategory");
  assert.deepEqual(errors.map((c) => c.ln), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(errors.every((c) => c.pt === 24 && c.b));
  assert.ok(cellsOf(p).filter((c) => c.t?.startsWith("TOLERANCE")).every((c) => c.pt === 22 && c.a === "c"));
  assert.ok(cellsOf(p).filter((c) => c.t?.startsWith("DOC NO.")).every((c) => c.pt === 16));
  // The seven approval tables hold lines 1 to 7's APPROVED BY and SIGN.
  assert.deepEqual(cellsOf(p).filter((c) => c.col === "approvedBy").map((c) => c.ln), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(cellsOf(p).filter((c) => c.col === "sign").map((c) => c.ln), [0, 1, 2, 3, 4, 5, 6]);
  // Every row is the print's 186 mm; the boxes 8.53 mm in from it (20.53 mm from the page's edge).
  for (const r of rowsOf(p)) assert.equal(rowWidth(r), 186, JSON.stringify(r.cells.map((c) => c.t ?? c.col)));
  for (const r of rowsOf(p)) if (r.cells.length > 1) assert.equal(r.cells[0].w, 8.53);
});

test("F-QC-19 prints at the card's own size and place: 12 mm in, each page inside the A4 sheet with its 12 mm head and 9 mm foot", () => {
  const p = QC_PAPERS_370["qc-tolerance-card-nivea"];
  assert.deepEqual(paperTablePrint(p, true), { left: 12, top: 12, scale: 1 });
  const pages: number[] = [0];
  for (const r of rowsOf(p)) {
    if (r.pb) pages.push(0);
    pages[pages.length - 1] += r.h;
  }
  assert.equal(pages.length, 4);
  for (const [i, hgt] of pages.entries()) assert.ok(12 + hgt + 9 <= 297, `page ${i + 1}: ${12 + hgt} mm`);
  // The first ERROR label's top rule 40.9 mm down page 1, the first banner of page 3 at 25.48 mm, as the card.
  assert.ok(Math.abs(12 + p.head[0].h - 40.9) < 0.01);
  const third = p.body.findIndex((r, i) => r.pb && p.body.slice(0, i).filter((x) => x.pb).length === 1);
  assert.ok(Math.abs(12 + p.body[third].h - 25.48) < 0.01);
  assert.equal(paperNeedsReading(p), false, "its letters are 12 pt and larger: printed as they are");
});

// ---------------------------------------------------------------------------
// F/QC/08 and F/QC/16

test("F/QC/08 and F/QC/16 are the owner's papers in his words: the company as he spells it, his title and number line", () => {
  for (const [id, title, number] of [
    ["qc-calibration-master-list", "MASTER LIST OF CALIBRATION INSTRUMENTS", "F/QC/08 (01 / 01.12.2021)"],
    ["qc-obsolete-artwork", "REGISTER OF OBSOLETE ARTWORK", "F/QC/16 (00/01.12.2021)"],
  ] as const) {
    const p = QC_PAPER_TABLES[id];
    assert.equal(paperTableFor(id), p);
    assert.equal(p.ownWords, true, id);
    const w = words(p);
    for (const kept of [COMPANY, title, number]) assert.ok(w.includes(kept), `${id}: ${kept}`);
    assert.ok(!w.some((t) => t.includes("{")), `${id}: no header word left to the sheet's own name`);
    assert.ok(!w.some((t) => /PUBLICATIONS PVT LTD/i.test(t)), id);
    boundAsTheLayout(id, p);
  }
  // F/QC/08's sixteen headings in his sheet's words (and its Note in full); F/QC/16's broken where his page breaks them.
  const f08 = words(QC_PAPER_TABLES["qc-calibration-master-list"]);
  for (const t of ["Sr. No.", "Frequency of Calibration", "Date of Initial Calibration", "Next due date of calibration", "Calibration report number"]) assert.ok(f08.includes(t), t);
  assert.ok(f08.some((t) => t.startsWith("Note : List of calibration instruments")));
  const f16 = words(QC_PAPER_TABLES["qc-obsolete-artwork"]);
  for (const t of ["Updated by -\nQC In-\ncharge", "Artwork number /\nMaster Shade card\nnumber (FG Code)", "Reason for artwork\nobsolete", "Date of\nobsolete"]) assert.ok(f16.includes(t), JSON.stringify(t));
});

test("F/QC/08 prints for reading: its 6 pt sheet is measured again, its letters 8 pt and more, its headings 7 pt and more, one landscape page", () => {
  const p = QC_PAPER_TABLES["qc-calibration-master-list"];
  assert.equal(paperNeedsReading(p), true, "the owner's sheet prints at 5.9 to 7.4 pt");
  const data = createDefaultData(docOf("qc-calibration-master-list"), DAY, master) as LogSheetData;
  const read = readablePaper(p, data, "qcPapers370-f08");
  assert.equal(read.page, "landscape");
  assert.equal(read.readFit, true);
  const sizes = cellsOf(read).filter((c) => c.t || c.col).map((c) => c.pt ?? read.pt);
  assert.ok(Math.min(...sizes) >= 7, `smallest ${Math.min(...sizes)} pt`);
  const notHeadings = [...read.head, ...(read.lines ? [{ h: 0, cells: read.lines.cells }] : [])].flatMap((r) => r.cells).filter((c) => c.t || c.col);
  assert.ok(notHeadings.every((c) => (c.pt ?? read.pt) >= 8), "the company, title, number, Note and the lines at 8 pt or more");
  const height = rowsOf(read).reduce((a, r) => a + r.h, 0) + (read.lines ? read.lines.h * Math.max(read.lines.count, data.rows.length) : 0);
  const print = paperTablePrint(read, true);
  assert.ok(print.top + height * print.scale + 9 <= 210, `${print.top + height * print.scale} mm of 210`);
});

test("F/QC/16 prints its fifteen lines on its one A4 page, clear of the page's 9 mm foot", () => {
  const p = QC_PAPER_TABLES["qc-obsolete-artwork"];
  assert.equal(paperNeedsReading(p), false, "11 pt: printed at its own sizes");
  assert.equal(p.lines?.count, 15);
  const height = rowsOf(p).reduce((a, r) => a + r.h, 0) + p.lines!.h * p.lines!.count;
  const print = paperTablePrint(p, true);
  assert.ok(print.top + height * print.scale + 9 <= 210, `${print.top + height * print.scale} mm of 210`);
  assert.ok(print.left >= 12 && print.left + 264.24 * print.scale <= 297 - 12 + 0.05, `left ${print.left}`);
});

// ---------------------------------------------------------------------------
// F/QC/15-A to G

const CLEARANCES = [
  "qc-line-clearance-printing",
  "qc-line-clearance-punching",
  "qc-line-clearance-qc-machine",
  "qc-line-clearance-qc-manual",
  "qc-line-clearance-slitting",
  "qc-line-clearance-sleeve-gluing",
  "qc-line-clearance-sleeve-cutting",
];

test("F/QC/15-A to G: the company as the workbook spells it, the IPQC headings broken as printed, the keys as they were", async () => {
  assert.equal(LINE_CLEARANCE_COMPANY, COMPANY);
  for (const id of CLEARANCES) {
    const cols = getLogSheetLayout(id)!.columns;
    assert.deepEqual(
      cols.map((c) => c.key),
      ["completionDate", "completionTime", "previousJobPoNo", "previousPoCustomerName", "lineClearance", "verifiedByIpqcClearance", "startingDate", "startingTime", "newJobPoNo", "newPoCustomerName", "operatorSign", "verifiedByIpqcNewJob"],
      id
    );
    assert.equal(cols[5].printedLabel, "Verified by\nIPQC\nexecutive", id);
    assert.equal(cols[11].printedLabel, "Verified by\nIPQC executive", `${id}: "Verified by / IPQC executive"`);
    assert.equal(cols[11].label, "Verified by IPQC executive", `${id}: the column's name is unchanged`);
  }
  const html = await sheet("qc-line-clearance-punching");
  assert.ok(html.includes('data-paper-form="lineclear"'));
  assert.ok(html.includes(`>${COMPANY}<`), "the head prints the company as the paper spells it");
  assert.ok(!html.includes("PUBLICATIONS PVT LTD"));
  assert.ok(html.includes("Verified by\nIPQC executive"), "the last heading's words, broken after \"by\"");
});

test("F/QC/15-A to G ruled as the paper: the machine's box ruled off from the title, the grey heading row, heavy rules only on the frame and left of Starting Date at the top", () => {
  const block = css.slice(css.indexOf("THE AREA LINE CLEARANCE REPORTS, F/QC/15-A to 15-G"), css.indexOf("/* HR-DOCS begin */"));
  assert.match(block, /\.doc-header-lc \.lc-machine \{[^}]*border-left: var\(--pf-hv\);/);
  assert.doesNotMatch(block, /\.lc-machine \{[^}]*border-top/, "no second rule of its own over the box");
  assert.match(block, /table\.log-sheet th \{[^}]*white-space: pre-line; background: #f2f2f2;/);
  assert.doesNotMatch(block, /:nth-child\(4\)|:nth-child\(10\)/, "no heavy rule left of Line Clearance* or Operator sign");
  assert.match(block, /:is\(thead th, tbody > tr:nth-child\(-n\+2\) > td\):nth-child\(6\)::after/, "left of Starting Date: the heading and the first two lines");
  assert.match(block, /:is\(th, td\):nth-child\(12\)::after/, "the frame's right");
});

// ---------------------------------------------------------------------------
// F/QC/29 (utility test)

test("F/QC/29's utility test prints its nine ruled lines, DATE: bold, the signatures apart and its thick-and-thin page border", () => {
  assert.match(css, /\[data-print-fill="page"\] \.paper-sheet\[data-sheet="qc-utility-test-report"\] tr\.pf-pad \{ display: table-row; \}/);
  assert.match(css, /\.paper-sheet\[data-sheet="qc-utility-test-report"\] \[data-section="sheet-boxes"\] > \.field > label:not\(\.input\) \{ font-weight: 700; \}/);
  assert.match(css, /\.paper-sheet\[data-frame\]\[data-sheet="qc-utility-test-report"\]::before \{ content: none; \}/);
  assert.equal(paperTableFor("qc-utility-test-report"), undefined, "drawn on its framed page, as the other framed QC papers");
});
