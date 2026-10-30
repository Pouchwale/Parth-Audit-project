// THE HR PAPERS, WORD FOR WORD. F/HR/18 as the company's own Word original
// (REQUIREMENTS §111 part 9): the owner's file of 16-Oct-2026, F-HR-18_Fly
// Catcher Inspection & Cleaning Record.doc, read story by story. Its page
// header holds the header block, the "Month & Year" line, the legend of the
// thirteen units and the seven headings; its body the thirteen units, two lines
// each, PC-01..08 on page 1 and PC-09..13 on page 2. A "SIPCO GROUP" text box
// and a "QR/PMT/02" table are a 2007 template's leftovers in a header story the
// section never prints; the August-2026 register scanned from the plant shows
// neither. Without a browser: the catalogue line and the original on file, the
// master data's thirteen places, and both pages — the monthly register and a
// visit's own — rendered to markup, open for writing and signed off.
// Run: npm run test:unit -- hrPaper
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { createElement as h, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import type { DocumentDefinition, FlyCatcherData, RecordInstance } from "../src/types";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { SEED_DOCUMENTS } from "../src/data/seed/documentDefinitions";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrMasterSeeded } from "../src/data/repositories/hrMasterRepository";
import { createDefaultData } from "../src/engine/recordDefaults";
import { documentFileKind } from "../src/utils/documentExport";

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrMasterSeeded();

const ROOT = process.env.DCRS_REPO_ROOT ?? process.cwd();
const ORIGINAL = "F-HR-18_Fly Catcher Inspection & Cleaning Record.doc";

// What the paper prints, read from the file.
const TITLE = "FORTNIGHTLY – FLY CATCHER INSPECTION & CLEANING RECORD";
const HEADINGS = [
  "PC ID NO.",
  "DATE OF SERVICE",
  "FLIES CATCH COUNT APPROX.",
  "DATE OF TUBE LIGHT INSTALLATION",
  "DUE DATE FOR TUBE LIGHT REPLACEMENT",
  "CLEANING DONE BY",
  "VERIFIED BY",
];
const LEGEND: [string, string][] = [
  ["PC-01", "Near Wash room (GF)"],
  ["PC-05", "Pouching area (GF)"],
  ["PC-02", "Near Ink room (GF)"],
  ["PC-06", "Pouching area (GF)"],
  ["PC-03", "Gallus machine room (GF)"],
  ["PC-07", "Near Lombardi m/c (FF)"],
  ["PC-04", "Pouching area (GF)"],
  ["PC-08", "Ink Kitchen (FF)"],
  ["PC-09", "Warehouse entrance (GF)"],
  ["PC-10", "Warehouse office wall"],
  ["PC-11", "Change room (GF)"],
  ["PC-12", "Dispatch gate (GF)"],
  ["PC-13", "Dispatch gate entrance (GF)"],
];
const LEFTOVERS = ["SIPCO", "QR/PMT/02", "Effective Date"];

const doc = (id: string): DocumentDefinition => {
  const d = SEED_DOCUMENTS.find((x) => x.id === id);
  assert.ok(d, `${id} is in the catalogue`);
  return d!;
};
const sourceFiles = (d: DocumentDefinition): string[] => Array.from(d.sourceFile.matchAll(/F-[A-Z]+-\d+_[^;()]*?\.(?:pdf|docx?|xlsx?)/g), (m) => m[0]);

// The router reads the address the moment it loads, and there is none in a
// test: one is given first, and the pages are loaded after it.
const scopeGlobals = globalThis as unknown as Record<string, unknown>;
if (!scopeGlobals.location) scopeGlobals.location = { hash: "", href: "http://localhost/", pathname: "/", search: "", origin: "http://localhost" };
if (!scopeGlobals.history) scopeGlobals.history = { state: null, replaceState() {}, pushState() {}, go() {}, back() {} };

async function loadPages() {
  const [auth, store, router, assistant, sheet, view] = await Promise.all([
    import("../src/store/AuthContext"),
    import("../src/store/AppStore"),
    import("../src/store/router"),
    import("../src/store/AssistantContext"),
    import("../src/components/records/FlyCatcherRegisterSheet"),
    import("../src/components/records/FlyCatcherRecordView"),
  ]);
  const render = (el: ReactElement): string =>
    renderToStaticMarkup(h(auth.AuthProvider, null, h(store.AppStoreProvider, null, h(router.RouterProvider, null, h(assistant.AssistantProvider, null, el)))));
  return { render, sheet, FlyCatcherRecordView: view.FlyCatcherRecordView };
}

const strip = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();
const cells = (markup: string, tag: string, className?: string): string[] => {
  const open = className ? `<${tag} class="${className}[^"]*"[^>]*>` : `<${tag}(?: [^>]*)?>`;
  return Array.from(markup.matchAll(new RegExp(`${open}([\\s\\S]*?)</${tag}>`, "g")), (m) => strip(m[1]));
};
const count = (markup: string, needle: string) => markup.split(needle).length - 1;

/** A visit of 3-Aug-2026, as the record page starts one. */
function visit(): RecordInstance<FlyCatcherData> {
  const d = documentRepository.getById("fly-catcher")!;
  const day = "2026-08-03";
  const at = `${day}T03:00:00.000Z`;
  return {
    id: "unit-fhr18-visit",
    documentId: d.id,
    periodKey: `fly-catcher:${day}`,
    dueDate: day,
    status: "In Progress",
    isDemo: false,
    data: createDefaultData(d, day, masterRepository.get()) as FlyCatcherData,
    createdAt: at,
    updatedAt: at,
  };
}

test("F/HR/18: the catalogue line as the paper's header prints it, the Word original on file, and the file it downloads as", () => {
  const fly = doc("fly-catcher");
  assert.equal(fly.formatNo, "F/HR/18");
  assert.equal(fly.revisionNo, "02");
  assert.equal(fly.revisionDate, "2024-12-15", "the paper's header: Date: 15.12.2024");
  assert.equal(fly.module, "Human Resources");
  const files = sourceFiles(fly);
  assert.ok(files.includes(ORIGINAL), `the company's own Word original is named: ${fly.sourceFile}`);
  assert.ok(existsSync(path.join(ROOT, "source-documents", ORIGINAL)), `${ORIGINAL} is in source-documents`);
  assert.equal(documentFileKind(fly), "docx", "it downloads as Word, as the company's original is (§93)");
});

test("F/HR/18: the thirteen units and where they hang, paired as the paper's legend pairs them", async () => {
  const { sheet } = await loadPages();
  assert.equal(sheet.FHR18_TITLE, TITLE);
  assert.equal(sheet.FHR18_DATE, "15.12.2024");
  const places = masterRepository.get().pcLocations;
  const byId = new Map(places.map((pc) => [pc.id, pc]));
  const rows = sheet.fhr18LegendRows(places);
  assert.deepEqual(rows, [
    ["PC-01", "PC-05"],
    ["PC-02", "PC-06"],
    ["PC-03", "PC-07"],
    ["PC-04", "PC-08"],
    ["PC-09", "PC-10"],
    ["PC-11", "PC-12"],
    ["PC-13", null],
  ]);
  const printed = rows.flat().filter((id): id is string => !!id).map((id) => [id, sheet.locationLabel(byId.get(id)!)]);
  assert.deepEqual(printed, LEGEND, "each unit's place, word for word, PC-10 with no floor");
});

test("F/HR/18: the seven headings, in the paper's order and words, on the monthly register and on a visit's own page", async () => {
  const { render, sheet, FlyCatcherRecordView } = await loadPages();
  assert.deepEqual([...sheet.FHR18_HEADINGS], HEADINGS);
  const register = render(h(sheet.FlyCatcherRegisterSheet, { year: 2026, month: 7, isDemo: false }));
  const registerHeads = cells(register, "th");
  assert.equal(registerHeads.length, 14, "two pages, each headed");
  assert.deepEqual(registerHeads.slice(0, 7), HEADINGS);
  assert.deepEqual(registerHeads.slice(7), HEADINGS);
  assert.equal(count(register, 'class="register-page"'), 2, "PC-01..08 on page 1, PC-09..13 on page 2");
  assert.equal(count(register, 'class="fhr18-unit"'), 13);
  const page = render(h(FlyCatcherRecordView, { doc: doc("fly-catcher"), record: visit(), editable: true, onChange: () => {} }));
  assert.deepEqual(cells(page, "th"), HEADINGS, "the visit's page is headed as the paper, nothing more");
  // The register's two pages each carry the header block and the legend, as the paper's do; a visit's page once.
  for (const [markup, pages] of [
    [register, 2],
    [page, 1],
  ] as const) {
    assert.equal(count(markup, TITLE.replace("&", "&amp;")), pages, "the title as the paper prints it, on every page");
    assert.ok(markup.includes("F/HR/18"));
    const places = LEGEND.map(([, place]) => place);
    assert.deepEqual(cells(markup, "td", "pc-loc").filter(Boolean), Array(pages).fill(places).flat(), "the legend's places in the paper's reading order");
    for (const word of LEFTOVERS) assert.ok(!markup.includes(word), `the template's leftover "${word}" is not on the sheet`);
  }
});

test("F/HR/18: a visit's own page is the paper, every box the person fills a box", async () => {
  const { render, FlyCatcherRecordView } = await loadPages();
  const record = visit();
  const page = render(h(FlyCatcherRecordView, { doc: doc("fly-catcher"), record, editable: true, onChange: () => {} }));
  // The Month & Year: the underlined blank, bound to the record.
  const month = page.match(/<input[^>]*id="fhr18-month-year"[^>]*>/)?.[0] ?? "";
  assert.ok(month, "the Month & Year box");
  assert.ok(month.includes('data-bind="monthYear"'), month);
  assert.ok(month.includes('value="Aug-26"'), "written as the record writes it");
  assert.ok(!month.includes("disabled"), "open for writing");
  // Thirteen units, the paper's two lines each (the owner, 30-Oct-2026, §147): this visit's line with its date of service,
  // and the month's other fortnight's line.
  assert.equal(count(page, 'class="fhr18-unit"'), 13);
  assert.equal(cells(page, "td", "pc-cell").join(" "), LEGEND.map(([id]) => id).sort().join(" "), "PC-01 to PC-13 in order");
  assert.equal(count(page, 'class="register-row'), 26, "two lines a unit, as the paper");
  assert.equal(cells(page, "td", "date-cell").filter((d) => d === "3/08/26").length, 13, "the visit's date on its own line of every unit");
  for (const field of ["count", "installed", "due", "cleaning", "verified"]) {
    assert.equal(count(page, `data-field="${field}"`), 13, `a ${field} box on every line`);
  }
  assert.equal(count(page, "data-bind="), 1 + 13 * 5, "every box bound, nothing else");
  assert.equal(count(page, "disabled"), 0, "every box open");
  // Nothing the paper does not print.
  assert.ok(!cells(page, "th").includes("Location"), "no Location column");
  assert.ok(!page.includes("master data"), "no note above the grid");
  assert.ok(!page.includes("Tube Light Installed"), "no heading in other words");
});

test("F/HR/18 (§147): every line of the paper is filled in on a visit's page - the month's other open visit's line bound to it, a blank line's date of service starting it", async () => {
  const { render, FlyCatcherRecordView } = await loadPages();
  const record = visit();
  // No other visit in the month: each unit's second line offers its date of service, nothing else to type yet.
  const alone = render(h(FlyCatcherRecordView, { doc: doc("fly-catcher"), record, editable: true, onChange: () => {} }));
  assert.equal(count(alone, 'data-field="fhr18-add-date"'), 13, "a date of service on every unit's blank line");
  assert.equal(count(alone, 'data-field="count"'), 13, "the count boxes are this visit's");
  // The month's other visit, open for writing: its line on every unit is boxes bound to it.
  const d = documentRepository.getById("fly-catcher")!;
  const other: RecordInstance<FlyCatcherData> = { ...record, id: "unit-fhr18-other", periodKey: "fly-catcher:2026-08-17", dueDate: "2026-08-17", data: createDefaultData(d, "2026-08-17", masterRepository.get()) as FlyCatcherData };
  recordRepository.upsert(other as RecordInstance);
  try {
    const both = render(h(FlyCatcherRecordView, { doc: doc("fly-catcher"), record, editable: true, onChange: () => {} }));
    assert.equal(count(both, 'data-field="count"'), 26, "a count box on both lines of every unit");
    assert.equal(count(both, 'data-bind-record="unit-fhr18-other"'), 13, "the other visit's lines bound to that visit");
    assert.equal(count(both, 'data-field="fhr18-add-date"'), 0, "no blank line left");
    assert.equal(cells(both, "td", "date-cell").filter((x) => x === "17/08/26").length, 13, "its date of service on its own line");
    // Signed off, it is read as written: words, no box.
    recordRepository.upsert({ ...other, status: "Verified" } as RecordInstance);
    const signed = render(h(FlyCatcherRecordView, { doc: doc("fly-catcher"), record, editable: true, onChange: () => {} }));
    assert.equal(count(signed, 'data-field="count"'), 13);
    assert.equal(count(signed, 'data-bind-record="unit-fhr18-other"'), 0);
  } finally {
    recordRepository.remove(other.id);
  }
});

test("F/HR/18: a signed-off visit shows the same sheet with every box closed", async () => {
  const { render, FlyCatcherRecordView } = await loadPages();
  const record = { ...visit(), status: "Verified" as const };
  const page = render(h(FlyCatcherRecordView, { doc: doc("fly-catcher"), record, editable: false, onChange: () => {} }));
  assert.deepEqual(cells(page, "th"), HEADINGS);
  assert.equal(count(page, 'class="fhr18-unit"'), 13);
  assert.equal(count(page, 'disabled=""'), 1 + 13 * 5, "the Month & Year and the five boxes of every line, closed");
  assert.ok(!page.includes('id="fhr18-record-people"'), "no list of names offered on a closed sheet");
});
