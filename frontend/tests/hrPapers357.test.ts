// THE HR MODULE'S HOUSEKEEPING AND PEST-CONTROL PAPERS AS THE OWNER'S OWN (REQUIREMENTS §373): F/HR/15 and F/HR/16 drawn as his
// sheets; F/HR/17's three pages under his header, a day's record printed on them; F/HR/18 named and headed as his Word page; the
// service report's plant addressed in the contractor's words; the training record as Gurudev Pest Control's letter; the
// Pesticide Application Chart ruled as the company's chart.
// Run: npm run test:unit -- hrPapers357
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement as h, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { paperTableFits, paperTableFor, paperTablePrint, type PaperCell, type PaperTable } from "../src/data/seed/qcPaperTables";
import { paperNeedsReading } from "../src/engine/paperReadable";
import {
  CHEMICAL_COLUMNS,
  CHEMICAL_HEADINGS,
  FHR15_PAPER,
  FHR16_PAPER,
  FHR17_PAPER_CELLS,
  FHR18_GRID_LABELS,
  FHR18_LEGEND_LABELS,
  HR_PAPER_COMPANY,
  SERVICE_PAPER_UNIT_LINE,
  TRAINING_LETTER,
} from "../src/data/seed/hrPapers357";
import { NOT_YET } from "../src/utils/originalFill";
import { ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import type { DailyPestMonitoringData, RecordInstance } from "../src/types";

ensureDocumentsSeeded();
ensureMasterSeeded();

const ROOT = process.env.DCRS_REPO_ROOT ?? process.cwd();
const src = (...p: string[]) => readFileSync(path.join(ROOT, "frontend", "src", ...p), "utf8");
const rows = (f: PaperTable) => [...f.head, ...f.body, ...f.foot];
const cellsOf = (f: PaperTable): PaperCell[] => rows(f).flatMap((r) => r.cells);
const words = (f: PaperTable): string[] => cellsOf(f).flatMap((c) => [c.t ?? "", c.lab ?? "", c.sentence?.before ?? "", ...(c.at ?? []).map((l) => l.t)]).filter(Boolean);
const width = (r: { cells: PaperCell[] }) => Math.round(r.cells.reduce((a, c) => a + c.w, 0) * 100) / 100;

for (const [id, form, number, title] of [
  ["hr-daily-cleaning", FHR15_PAPER, "F/HR/15 (01/15.12.2024)", "DAILY CLEANING RECORD"],
  ["hr-monthly-cleaning", FHR16_PAPER, "F/HR/16 (01/15.12.2024)", "MONTHLY CLEANING RECORD ( YEAR :"],
] as const) {
  test(`${id}: drawn as the owner's sheet, every box and column of the record in its place`, () => {
    const layout = getLogSheetLayout(id)!;
    assert.equal(paperTableFor(id), form);
    assert.ok(form.ownWords, "every printed word is the record's to type over (§275)");
    assert.equal(form.page, "landscape", "his landscape page");
    assert.ok(paperTableFits(form, layout), "every box and column has its place on the paper, or is kept off it by name");
    const w = words(form);
    for (const kept of [HR_PAPER_COMPANY, title, number]) assert.ok(w.includes(kept), `his words: ${kept}`);
    assert.ok(cellsOf(form).some((c) => c.lab === "@instructions:0"), "the NOTE inside the frame, the layout's own words");
    // Every row the table's width; the lines the record keeps, in order.
    const widths = new Set(rows(form).map(width));
    assert.equal(widths.size, 1, `one width: ${[...widths].join(", ")}`);
    const lines = layout.rowMode.kind === "fixedRows" ? layout.rowMode.rows.length : 0;
    const lns = new Set(cellsOf(form).filter((c) => c.col && c.ln !== undefined).map((c) => c.ln));
    assert.deepEqual([...lns].sort((a, b) => a! - b!), Array.from({ length: lines }, (_, i) => i), "each of the record's lines drawn");
    for (const col of layout.columns.map((c) => c.key)) {
      const bound = cellsOf(form).some((c) => c.col === col);
      assert.ok(bound || form.offPaper?.includes(col), `${col} is drawn or kept off the paper by name`);
    }
  });

  test(`${id}: one A4 landscape page, every letter 8 pt or more, no colour`, () => {
    assert.equal(paperNeedsReading(form), false, "no letter under 8 pt, so the sheet is drawn as his (§282)");
    const print = paperTablePrint(form, true);
    const height = rows(form).reduce((a, r) => a + r.h, 0);
    assert.ok(print.scale >= 1, `printed at its size or larger (${print.scale})`);
    assert.ok(print.top + height * print.scale <= 210 - 10, "inside the page, 10 mm clear at the foot");
    assert.ok(print.left >= 12 && print.left + width(form.head[0]) * print.scale <= 297 - 12 + 0.01, "12 mm clear at the sides");
    for (const c of cellsOf(form)) if (!c.skip && (c.t || c.lab || c.col || c.box || c.sentence)) assert.ok((c.pt ?? form.pt) * print.scale >= 8, `${c.t ?? c.lab ?? c.col ?? c.box} at ${(c.pt ?? form.pt) * print.scale} pt`);
    assert.ok(!cellsOf(form).some((c) => c.bg || c.bgIf), "no shade on his sheet");
    assert.equal(form.frame, "heavy", "his frame's medium rules");
  });
}

test("F/HR/15: the area columns with no heading, the days 1 to 31, the two signature lines across the area columns", () => {
  const heading = FHR15_PAPER.body.find((r) => r.head)!;
  assert.deepEqual(heading.cells.map((c) => c.t), ["#", "", "", ...Array.from({ length: 31 }, (_, i) => String(i + 1))]);
  const signs = FHR15_PAPER.body.filter((r) => r.cells[0].col === "parameter" && r.cells[0].a === "r");
  assert.deepEqual(signs.map((r) => r.cells[0].ln), [17, 18], "Cleaning done by, Cleaning verified by: right-aligned in one cell");
  assert.ok(FHR15_PAPER.head[1].cells[0].over?.some((o) => o.box === "monthYear"), "the Month & Year written after its words in the title row");
});

test("F/HR/16: Area over the three area columns, the Date line and his arrow, his two cleaning cells on every area", () => {
  const heading = FHR16_PAPER.body.find((r) => r.head)!;
  assert.deepEqual(heading.cells.map((c) => c.t), ["#", "Area", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
  assert.equal(heading.cells[0].rs, 2, "# merged down over the Date line");
  const date = FHR16_PAPER.body[1];
  assert.deepEqual(date.cells[1].at?.map((l) => l.t), ["Date", "———————————→"]);
  const areas = FHR16_PAPER.body.filter((r) => r.cells.some((c) => c.t === "Walls & Ceiling + Glass doors"));
  assert.equal(areas.length, 18);
  for (const r of areas) assert.equal(r.cells.find((c) => c.t === "Cleaning by")?.t, "Cleaning by", "his two cells side by side");
  assert.deepEqual(FHR16_PAPER.offPaper, ["cleaning"], "the record's one Cleaning cell is kept, not drawn");
  assert.ok(FHR16_PAPER.head[1].cells[0].sentence?.box === "year", "the YEAR written in the title's blank");
});

// ---------------------------------------------------------------------------
// The pages, rendered (as frontend/tests/hrPaperFormats.test.ts does).

const scopeGlobals = globalThis as unknown as Record<string, unknown>;
if (!scopeGlobals.location) scopeGlobals.location = { hash: "", href: "http://localhost/", pathname: "/", search: "", origin: "http://localhost" };
if (!scopeGlobals.history) scopeGlobals.history = { state: null, replaceState() {}, pushState() {}, go() {}, back() {} };

async function loadPages() {
  const [auth, store, router, assistant, daily] = await Promise.all([
    import("../src/store/AuthContext"),
    import("../src/store/AppStore"),
    import("../src/store/router"),
    import("../src/store/AssistantContext"),
    import("../src/components/records/DailyRegisterSheet"),
  ]);
  const render = (el: ReactElement): string =>
    renderToStaticMarkup(h(auth.AuthProvider, null, h(store.AppStoreProvider, null, h(router.RouterProvider, null, h(assistant.AssistantProvider, null, el)))));
  return { render, DailyRegisterSheet: daily.DailyRegisterSheet };
}

test("F/HR/17: a day's record prints on the three pages under his header, its answers on its date's line alone", async () => {
  const { render, DailyRegisterSheet } = await loadPages();
  const checkpoints = masterRepository.get().checkpoints;
  const day: RecordInstance<DailyPestMonitoringData> = {
    id: "unit-fhr17-day",
    documentId: "daily-pest-monitoring",
    periodKey: "daily-pest-monitoring:2026-11-25",
    dueDate: "2026-11-25",
    status: "In Progress",
    isDemo: false,
    data: {
      isHoliday: false,
      checkpoints: Object.fromEntries(checkpoints.map((cp) => [cp.no, { value: cp.no === 4 ? 100 : cp.no === 2 || cp.no >= 7 ? "No" : "Yes" }])) as DailyPestMonitoringData["checkpoints"],
      timeOfChecking: "09:15",
      checker: "Kapila Barad",
      summaryActions: [],
    } as unknown as DailyPestMonitoringData,
    createdAt: "2026-11-25T03:00:00.000Z",
    updatedAt: "2026-11-25T03:00:00.000Z",
  };
  const page = render(h(DailyRegisterSheet, { year: 2026, month: 10, isDemo: false, only: day }));
  assert.equal(page.split('class="register-page"').length - 1, 3, "three pages");
  assert.equal(page.split(HR_PAPER_COMPANY).length - 1, 3, "his company's name on every page");
  for (const label of Object.values(FHR17_PAPER_CELLS)) assert.equal(page.split(`>${label}<`).length - 1, 3, `his "${label}" on every page`);
  assert.ok(page.includes("01.12.2021"), "his date as his band writes it");
  assert.ok(!page.includes("data-print-doc"), "the record's own page is the printed document");
  const lines = Array.from(page.matchAll(/<tr data-day="(\d+)"[^>]*data-bind-record="unit-fhr17-day"/g), (m) => m[1]);
  assert.deepEqual(lines, ["25"], "the day's answers on its own line, no other");
  assert.ok(page.includes("Kapila Barad") && page.includes("09:15"), "its checker and its time");
  const sheet = src("components", "records", "DailyRegisterSheet.tsx");
  assert.match(sheet, /<p className="font-semibold">\{FHR17_INSTRUCTION_1\}<\/p>/, "both instructions bold, as his page");
  const view = src("components", "records", "DailyPestMonitoringRecordView.tsx");
  assert.match(view, /<div className="print-only fhr17-day-paper" aria-hidden="true">\s*<DailyRegisterSheet year=\{due\.getFullYear\(\)\} month=\{due\.getMonth\(\)\} isDemo=\{record\.isDemo\} only=\{record\} \/>/);
  assert.match(view, /<div className="fhr17-day-form">/, "the day's form is the screen's");
  const css = src("styles.css");
  assert.match(css, /\.fhr17-day-form \{ display: none; \}/, "printed, the paper alone");
});

test("F/HR/18: his company's name and his units' names, the paper's second line printed on a visit", () => {
  assert.equal(FHR18_LEGEND_LABELS["PC-01"], "PC – 01");
  assert.equal(FHR18_LEGEND_LABELS["PC-12"], "PC - 12");
  assert.equal(FHR18_GRID_LABELS["PC-10"], "PC - 10");
  assert.equal(FHR18_GRID_LABELS["PC-11"], "PC – 11");
  for (const pc of masterRepository.get().pcLocations.slice(0, 13)) assert.ok(FHR18_GRID_LABELS[pc.id] && FHR18_LEGEND_LABELS[pc.id], pc.id);
  for (const file of ["FlyCatcherRecordView.tsx", "FlyCatcherRegisterSheet.tsx"]) assert.match(src("components", "records", file), /companyName=\{HR_PAPER_COMPANY\}/, file);
  const view = src("components", "records", "FlyCatcherRecordView.tsx");
  assert.doesNotMatch(view, /data-empty-line=\{i > 0 && !o/, "a visit's blank second line is no longer kept off the printout");
});

test("the service report addresses the plant in the contractor's words", () => {
  assert.equal(SERVICE_PAPER_UNIT_LINE, "Unit: GUJARAT PRINTPACK PUBLICATION PRIVATE LIMITED, 308/9, GIDC, DEDIYASAN, MEHSANA, GUAJRAT, INDIA - 384002");
  assert.match(src("components", "records", "ServiceReportRecordView.tsx"), /\{at\("unit", SERVICE_PAPER_UNIT_LINE\)\}/);
});

test("the training record is Gurudev Pest Control's letter, with no letterhead, downloaded as the page draws it", () => {
  const page = src("pages", "TrainingPage.tsx");
  for (const part of ["tp-date", "tp-to", "tp-subject", "tp-topics-head", "tp-topics", "tp-people", "tp-sign"]) assert.ok(page.includes(`className="${part}`) || page.includes(`"${part}"`) || page.includes(` ${part}"`), part);
  assert.equal(TRAINING_LETTER.subject, "Subject: Pest control awareness Training Program");
  assert.equal(TRAINING_LETTER.topicsHeading, "Training Topics covered");
  assert.deepEqual(TRAINING_LETTER.to, ["GUJARAT PRINTPACK PUBLICATION PRIVATE LIMITED", "308/9, GIDC, DEDIYASAN, MEHSANA, GUAJRAT, INDIA - 384002"]);
  assert.ok(NOT_YET.has("training-record"), "his 2025 file filled would keep his example names on a record that has none");
  assert.match(page, /data-section="training-off-paper"/, "what the letter has no place for, kept on the record, on the screen");
});

test("the Pesticide Application Chart: his headings in his words, his column widths, the title in his ruled box", () => {
  assert.deepEqual([...CHEMICAL_HEADINGS], ["Sr. No", "Services Name", "Pest Covered", "Chemicals to be use", "Dilution Ratio"]);
  assert.ok(Math.abs(CHEMICAL_COLUMNS.reduce((a, b) => a + b, 0) - 100) < 0.01, "the columns share the chart's width");
  const chart = src("pages", "ChemicalMasterPage.tsx");
  assert.match(chart, /<div className="chem-title-box">/);
  assert.match(chart, /<table className="chem-paper">/);
  assert.doesNotMatch(chart, /<ul style=/, "a chemical to a line, no bullets");
});
