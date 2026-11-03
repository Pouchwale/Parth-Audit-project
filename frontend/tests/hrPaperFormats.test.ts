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
  assert.deepEqual(cells(page, "th"), [...HEADINGS, ...HEADINGS], "the visit's two printed pages, each headed as the paper, nothing more");
  // The register's two pages each carry the header block and the legend, as the paper's do; a visit's two pages too.
  for (const [markup, pages] of [
    [register, 2],
    [page, 2],
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
  // Thirteen units, two lines each as the paper prints them: this visit's line, then the month's other visit's,
  // blank here (no other visit on file) with the tube-light dates dittoed.
  assert.equal(count(page, 'class="fhr18-unit"'), 13);
  assert.equal(count(page.toLowerCase(), 'rowspan="2"'), 13, "each unit's number merged down its two lines");
  assert.equal(cells(page, "td", "pc-cell").join(" "), LEGEND.map(([id]) => id).sort().join(" "), "PC-01 to PC-13 in order");
  assert.deepEqual(cells(page, "td", "date-cell"), Array(13).fill(["03-08-2026", ""]).flat(), "the visit's date on its line, as the app writes a date (REQUIREMENTS §171); the other line blank");
  for (const field of ["count", "installed", "due", "cleaning", "verified"]) {
    assert.equal(count(page, `data-field="${field}"`), 13, `a ${field} box on this visit's line of every unit`);
  }
  assert.equal(count(page, "data-empty-line"), 13, "the blank second line stays off the printout");
  assert.equal(count(page, "data-bind="), 1 + 13 * 5, "every box bound, nothing else");
  assert.equal(count(page, "disabled"), 0, "every box open");
  // Nothing the paper does not print.
  assert.ok(!cells(page, "th").includes("Location"), "no Location column");
  assert.ok(!page.includes("master data"), "no note above the grid");
  assert.ok(!page.includes("Tube Light Installed"), "no heading in other words");
});

test("F/HR/18: a signed-off visit shows the same sheet with every box closed", async () => {
  const { render, FlyCatcherRecordView } = await loadPages();
  const record = { ...visit(), status: "Verified" as const };
  const page = render(h(FlyCatcherRecordView, { doc: doc("fly-catcher"), record, editable: false, onChange: () => {} }));
  assert.deepEqual(cells(page, "th"), [...HEADINGS, ...HEADINGS]);
  assert.equal(count(page, 'class="fhr18-unit"'), 13);
  assert.equal(count(page, 'disabled=""'), 1 + 13 * 5, "the Month & Year and the five boxes of every line, closed");
  assert.ok(!page.includes('id="fhr18-record-people"'), "no list of names offered on a closed sheet");
});

test("F/HR/18: a visit's page shows the month's other visit on each unit's second line, read only", async () => {
  const { render, FlyCatcherRecordView } = await loadPages();
  const { recordRepository } = await import("../src/data/repositories/recordRepository");
  const record = visit();
  const later: RecordInstance<FlyCatcherData> = {
    ...visit(),
    id: "unit-fhr18-visit-later",
    periodKey: "fly-catcher:2026-08-17",
    dueDate: "2026-08-17",
    status: "Verified",
    data: { ...record.data, entries: record.data.entries.map((e) => ({ ...e, catchCountApprox: 4, cleaningDoneBy: "Vijay", verifiedBy: "Roshni" })) },
  };
  recordRepository.upsertMany([later]);
  try {
    const page = render(h(FlyCatcherRecordView, { doc: doc("fly-catcher"), record, editable: true, onChange: () => {} }));
    const unit = page.match(/<tbody class="fhr18-unit" data-pc="PC-01">([\s\S]*?)<\/tbody>/)?.[1] ?? "";
    const rows = Array.from(unit.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g), (m) => m[1]);
    assert.equal(rows.length, 2, "two lines for the unit");
    assert.ok(rows[0].includes('data-field="count"'), "this visit (3-Aug) first, in date order, open for writing");
    assert.deepEqual(cells(rows[1], "td").map((c) => c.replace(/&quot;/g, '"')), ["17-08-2026", "04", '"', '"', "Vijay", "Roshni"], "the 17-Aug visit, its date as the app writes one");
    assert.ok(!rows[1].includes("<input"), "the other visit is not typed in here");
    assert.equal(count(page, "data-bind="), 1 + 13 * 5, "only this visit's boxes are bound");
    assert.equal(count(page, "data-empty-line"), 0, "both lines written, both print");
  } finally {
    recordRepository.removeIds([later.id]);
  }
});

test("F/HR/18: the month's other visit, still a draft, is typed in on its own line here (not bound to this visit)", async () => {
  const { render, FlyCatcherRecordView } = await loadPages();
  const { recordRepository } = await import("../src/data/repositories/recordRepository");
  const record = visit();
  const later: RecordInstance<FlyCatcherData> = { ...visit(), id: "unit-fhr18-visit-draft", periodKey: "fly-catcher:2026-08-17", dueDate: "2026-08-17", status: "Due" };
  recordRepository.upsertMany([later]);
  try {
    const page = render(h(FlyCatcherRecordView, { doc: doc("fly-catcher"), record, editable: true, onChange: () => {} }));
    const unit = page.match(/<tbody class="fhr18-unit" data-pc="PC-01">([\s\S]*?)<\/tbody>/)?.[1] ?? "";
    const rows = Array.from(unit.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g), (m) => m[1]);
    assert.equal(rows.length, 2, "two lines for the unit");
    assert.equal(cells(rows[1], "td", "date-cell")[0], "17-08-2026", "the other visit's date on its line");
    for (const field of ["count", "installed", "due", "cleaning", "verified"]) {
      assert.equal(count(page, `data-field="${field}"`), 26, `a ${field} box on both lines of every unit`);
    }
    assert.equal(count(page, 'data-line="other"'), 13, "the second line of every unit is the other visit's");
    assert.equal(count(page, "data-bind="), 1 + 13 * 5, "only this visit's boxes are bound");
    assert.equal(count(page, "data-empty-line"), 0, "an open line is not hidden from the printout");
  } finally {
    recordRepository.removeIds([later.id]);
  }
});

test("F/HR/18: a count filled in automatically is 0 to 2, 2 to 4 in June-August, the same each time; a July visit carries the reminder", async () => {
  const { render, FlyCatcherRecordView } = await loadPages();
  const view = await import("../src/components/records/FlyCatcherRecordView");
  const ranges: [string, number, number][] = [
    ["2026-05-31", 0, 2],
    ["2026-06-01", 2, 4],
    ["2026-07-06", 2, 4],
    ["2026-08-31", 2, 4],
    ["2026-09-01", 0, 2],
    ["2026-11-02", 0, 2],
    ["2027-01-04", 0, 2],
  ];
  for (const [day, low, high] of ranges) {
    const seen = new Set<number>();
    for (const pc of LEGEND.map(([id]) => id)) {
      const n = view.autoFlyCount(pc, day);
      assert.ok(Number.isInteger(n) && n >= low && n <= high, `${pc} ${day}: ${n} not in ${low}-${high}`);
      assert.equal(view.autoFlyCount(pc, day), n, "the same count for the same unit and date");
      seen.add(n);
    }
    assert.ok(seen.size > 1, `${day}: not the same number on every line`);
  }
  assert.ok(view.isJulyVisit("2026-07-06") && !view.isJulyVisit("2026-08-03") && !view.isJulyVisit("2026-06-30"));
  const july = { ...visit(), dueDate: "2026-07-06", periodKey: "fly-catcher:2026-07-06" };
  assert.ok(render(h(FlyCatcherRecordView, { doc: doc("fly-catcher"), record: july, editable: true, onChange: () => {} })).includes('data-section="fhr18-july-reminder"'), "July: the reminder");
  assert.ok(!render(h(FlyCatcherRecordView, { doc: doc("fly-catcher"), record: visit(), editable: true, onChange: () => {} })).includes("fhr18-july-reminder"), "August: none");
});

test("F/HR/18: a fly catcher added in Master Data joins a draft visit's page; a signed-off visit keeps its own units", async () => {
  const { render, FlyCatcherRecordView } = await loadPages();
  const view = await import("../src/components/records/FlyCatcherRecordView");
  const stored = masterRepository.get();
  // The visit was started with the thirteen; PC-14 came after.
  const record = visit();
  masterRepository.update({ pcLocations: [...stored.pcLocations, { id: "PC-14", location: "New dispatch gate", floor: "GF" }] });
  try {
    assert.ok(!record.data.entries.some((e) => e.pcId === "PC-14"));
    const page = render(h(FlyCatcherRecordView, { doc: doc("fly-catcher"), record, editable: true, onChange: () => {} }));
    assert.equal(count(page, 'class="fhr18-unit"'), 14, "fourteen units on the draft");
    const unit = page.match(/<tbody class="fhr18-unit" data-pc="PC-14">([\s\S]*?)<\/tbody>/)?.[1] ?? "";
    assert.ok(unit.includes('data-field="count"'), "PC-14's line is open for writing");
    assert.ok(unit.includes('data-empty-line'), "with its second line, as every unit has");
    const added = view.withMasterUnits(record.data, masterRepository.get().pcLocations)!;
    assert.deepEqual(added.entries.at(-1), { pcId: "PC-14", catchCountApprox: null, tubeLightInstallDate: null, tubeLightDueDate: null, cleaningDoneBy: "", verifiedBy: "" }, "a new unit's installation date is typed by hand");
    assert.equal(view.withMasterUnits(added, masterRepository.get().pcLocations), null, "nothing missing, nothing added");
    const signed = render(h(FlyCatcherRecordView, { doc: doc("fly-catcher"), record: { ...record, status: "Verified" as const }, editable: false, onChange: () => {} }));
    assert.equal(count(signed, 'class="fhr18-unit"'), 13, "a verified visit keeps the units it was signed with");
  } finally {
    masterRepository.update({ pcLocations: stored.pcLocations });
  }
});

test("F/HR/18: the due date for tube light replacement follows the installation date typed - a year less a day", async () => {
  const view = await import("../src/components/records/FlyCatcherRecordView");
  assert.equal(view.tubeLightDueFor("2025-11-24"), "2026-11-23", "the register's own pair");
  assert.equal(view.tubeLightDueFor("2026-01-01"), "2026-12-31");
  assert.equal(view.tubeLightDueFor("2026-03-01"), "2027-02-28");
  assert.equal(view.tubeLightDueFor("2024-02-29"), "2025-02-28");
  assert.equal(view.tubeLightDueFor(""), null);
  assert.equal(view.tubeLightDueFor(null), null);
  assert.equal(view.tubeLightDueFor("24-11-2025"), null);
});

test("F/HR/18: a tube-light date written on a unit's first line is carried to the line below, never over one written", async () => {
  const view = await import("../src/components/records/FlyCatcherRecordView");
  const entry = (pcId: string, install: string | null, due: string | null): FlyCatcherData["entries"][number] => ({ pcId, catchCountApprox: 1, tubeLightInstallDate: install, tubeLightDueDate: due, cleaningDoneBy: "", verifiedBy: "" });
  const first = { ...visit().data, entries: [entry("PC-13", "2025-11-24", "2026-11-23"), entry("PC-14", "2026-07-10", "2027-07-09"), entry("PC-15", "2026-02-01", null)] };
  const second = { ...visit().data, entries: [entry("PC-13", "2025-11-24", "2026-11-23"), entry("PC-14", null, null), entry("PC-15", null, null)] };
  const carried = view.carryDatesDown(second, [first]);
  assert.deepEqual(carried.entries.find((e) => e.pcId === "PC-14"), entry("PC-14", "2026-07-10", "2027-07-09"), "PC-14's dates reach its second line");
  assert.deepEqual(carried.entries.find((e) => e.pcId === "PC-15"), entry("PC-15", "2026-02-01", "2027-01-31"), "with the due date following where the line above has none");
  assert.equal(carried.entries[0], second.entries[0], "a line with its own dates keeps them");
  const written = { ...second, entries: [entry("PC-14", "2026-08-01", "2027-07-31")] };
  assert.equal(view.carryDatesDown(written, [first]), written, "nothing written over, the same object back");
});

test("F/HR/18: a count filled in automatically follows the line's tube-light installation month - 2 to 4 for June-August", async () => {
  const view = await import("../src/components/records/FlyCatcherRecordView");
  const pcs = LEGEND.map(([id]) => id);
  for (const [install, low, high] of [["2026-06-15", 2, 4], ["2026-07-10", 2, 4], ["2026-08-31", 2, 4], ["2025-11-24", 0, 2], ["2026-09-01", 0, 2]] as const) {
    for (const pc of pcs) {
      const n = view.autoFlyCount(pc, "2026-11-16", install);
      assert.ok(n >= low && n <= high, `${pc}, installed ${install}: ${n} not in ${low}-${high}`);
    }
  }
  // No installation date yet: the visit's own month decides.
  assert.deepEqual(view.autoFlyRange("2026-07-06", null), [2, 4]);
  assert.deepEqual(view.autoFlyRange("2026-11-16", ""), [0, 2]);
  // An empty count on each line, by that line's installation date; a written count is kept.
  const entry = (pcId: string, count: number | null, install: string | null) => ({ pcId, catchCountApprox: count, tubeLightInstallDate: install, tubeLightDueDate: null, cleaningDoneBy: "", verifiedBy: "" });
  const data = { ...visit().data, entries: [entry("PC-13", null, "2025-11-24"), entry("PC-14", null, "2026-07-10"), entry("PC-12", 9, "2026-07-10")] };
  const filled = view.withAutoCounts(data, "2026-11-16")!;
  const [p13, p14, p12] = filled.entries.map((e) => e.catchCountApprox!);
  assert.ok(p13 >= 0 && p13 <= 2, `PC-13 ${p13}`);
  assert.ok(p14 >= 2 && p14 <= 4, `PC-14 ${p14}`);
  assert.equal(p12, 9, "a count already written is kept");
});

test("F/HR/18: a fly catcher deleted from Master Data leaves a draft visit's page; a signed-off visit keeps it", async () => {
  const { render, FlyCatcherRecordView } = await loadPages();
  const view = await import("../src/components/records/FlyCatcherRecordView");
  const stored = masterRepository.get();
  // The visit was started with the thirteen; PC-13 is deleted after.
  const record = visit();
  masterRepository.update({ pcLocations: stored.pcLocations.filter((pc) => pc.id !== "PC-13") });
  try {
    const page = render(h(FlyCatcherRecordView, { doc: doc("fly-catcher"), record, editable: true, onChange: () => {} }));
    assert.equal(count(page, 'class="fhr18-unit"'), 12, "twelve units on the draft");
    assert.ok(!page.includes('data-pc="PC-13"'), "PC-13's lines are gone");
    const synced = view.withMasterUnits(record.data, masterRepository.get().pcLocations)!;
    assert.deepEqual(synced.entries.map((e) => e.pcId), record.data.entries.map((e) => e.pcId).filter((id) => id !== "PC-13"), "the others kept, in order");
    assert.equal(view.withMasterUnits(synced, masterRepository.get().pcLocations), null, "nothing more to change");
    assert.equal(view.withMasterUnits(record.data, []), null, "no units in Master Data at all: nothing is taken off");
    const signed = render(h(FlyCatcherRecordView, { doc: doc("fly-catcher"), record: { ...record, status: "Verified" as const }, editable: false, onChange: () => {} }));
    assert.equal(count(signed, 'class="fhr18-unit"'), 13, "a verified visit keeps the units it was signed with");
  } finally {
    masterRepository.update({ pcLocations: stored.pcLocations });
  }
});

test("F/HR/18: no tube-light installation date, no flies count; the first line's dates lead the line below", async () => {
  const { render, FlyCatcherRecordView } = await loadPages();
  const view = await import("../src/components/records/FlyCatcherRecordView");
  const entry = (pcId: string, count: number | null, install: string | null, due: string | null = null) => ({ pcId, catchCountApprox: count, tubeLightInstallDate: install, tubeLightDueDate: due, cleaningDoneBy: "", verifiedBy: "" });
  // A count with no date is taken off; a date with no count gets one in its range.
  const data = { ...visit().data, entries: [entry("PC-14", 2, null), entry("PC-15", null, "2026-07-25", "2027-07-24"), entry("PC-13", 1, "2025-11-24", "2026-11-23")] };
  const counted = view.withAutoCounts(data, "2026-11-16")!;
  assert.equal(counted.entries[0].catchCountApprox, null, "PC-14: no date, no count");
  assert.ok(counted.entries[1].catchCountApprox! >= 2 && counted.entries[1].catchCountApprox! <= 4, "PC-15: a July date, 2 to 4");
  assert.equal(counted.entries[2].catchCountApprox, 1, "PC-13: a count written with its date is kept");
  // A different date, a count drawn afresh (random by the date entered), still in the date's range.
  const draws = new Set(["2026-06-01", "2026-06-15", "2026-07-01", "2026-07-25", "2026-08-10", "2026-08-31"].map((d) => view.autoFlyCount("PC-15", "2026-11-16", d)));
  assert.ok(draws.size > 1 && [...draws].every((n) => n >= 2 && n <= 4), [...draws].join(","));
  // The first line has no date for PC-14: the line below has none either; PC-13's dates stand.
  const first = { ...visit().data, entries: [entry("PC-14", null, null), entry("PC-13", 1, "2025-11-24", "2026-11-23")] };
  const below = { ...visit().data, entries: [entry("PC-14", null, "2026-07-25", "2027-07-24"), entry("PC-13", 0, "2025-11-24", "2026-11-23")] };
  const led = view.clearDatesUnderBlankFirst(below, first);
  assert.deepEqual(led.entries[0], entry("PC-14", null, null, null));
  assert.equal(led.entries[1], below.entries[1]);
  assert.equal(view.clearDatesUnderBlankFirst(led, first), led, "nothing more to clear");
  // On the page, a line with no installation date has its count box closed until the date is entered.
  const record = { ...visit(), data: { ...visit().data, entries: visit().data.entries.map((e) => (e.pcId === "PC-01" ? { ...e, tubeLightInstallDate: null, tubeLightDueDate: null, catchCountApprox: null } : e)) } };
  const page = render(h(FlyCatcherRecordView, { doc: doc("fly-catcher"), record, editable: true, onChange: () => {} }));
  const unit = page.match(/<tbody class="fhr18-unit" data-pc="PC-01">([\s\S]*?)<\/tbody>/)?.[1] ?? "";
  const countBox = unit.match(/<input[^>]*data-field="count"[^>]*>/)?.[0] ?? "";
  assert.ok(countBox.includes("disabled"), countBox);
  assert.ok(countBox.includes("Enter the date of tube light installation first"), countBox);
});

test("F/HR/18: a visit prints as the register does - every page with the whole header block, PC-01..08 then PC-09 on", async () => {
  const { render, FlyCatcherRecordView } = await loadPages();
  const page = render(h(FlyCatcherRecordView, { doc: doc("fly-catcher"), record: visit(), editable: true, onChange: () => {} }));
  const sections = Array.from(page.matchAll(/<section class="register-page"[^>]*>([\s\S]*?)<\/section>/g), (m) => m[1]);
  assert.equal(sections.length, 2, "two pages");
  const pcsOf = (html: string) => Array.from(html.matchAll(/class="fhr18-unit" data-pc="(PC-\d+)"/g), (m) => m[1]);
  assert.deepEqual(pcsOf(sections[0]), ["PC-01", "PC-02", "PC-03", "PC-04", "PC-05", "PC-06", "PC-07", "PC-08"]);
  assert.deepEqual(pcsOf(sections[1]), ["PC-09", "PC-10", "PC-11", "PC-12", "PC-13"]);
  for (const [i, html] of sections.entries()) {
    assert.ok(html.includes(TITLE.replace("&", "&amp;")), `page ${i + 1}: the title band`);
    assert.ok(html.includes("F/HR/18"), `page ${i + 1}: the format number`);
    assert.ok(html.includes(`${i + 1} of 2`), `page ${i + 1}: its page number`);
    assert.ok(html.includes("fhr18-month") && html.includes("Aug-26"), `page ${i + 1}: Month & Year`);
    assert.equal(count(html, 'class="register-grid fhr18-legend"'), 1, `page ${i + 1}: the legend`);
    assert.equal(cells(html, "th").length, 7, `page ${i + 1}: the headings`);
  }
  assert.ok(!sections[1].slice(0, sections[1].indexOf("fhr18-grid")).includes("<input"), "the second page's header is read as it stands, not typed in again");
  assert.equal(count(page, 'id="fhr18-month-year"'), 1, "one Month & Year box");
  assert.equal(count(page, "data-bind="), 1 + 13 * 5, "every box bound once");
});
