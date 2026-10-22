// THE REVIEW OF 13-OCT-2026, GROUP B (REQUIREMENTS §111): each finding against its paper, as the sheet draws it and
// as Demo Mode and the sample fill write it. qcPaperFormatsMore.test.ts holds the papers as they were built; this file
// holds what the review found still unlike them — F01 to F34, OPS-2 and OPS-3 — and nothing passes here that did not
// fail before the fix.
import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import type { DocumentDefinition, LogSheetData, LogSheetLayout, MasterData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { hrMasterRepository, ensureSeeded as ensureHrMasterSeeded } from "../src/data/repositories/hrMasterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { createDefaultData } from "../src/engine/recordDefaults";
import { autoFillRecord } from "../src/engine/autoFill";
import { prepareKnownParts } from "../src/engine/knownParts";
import { validateForSubmit } from "../src/engine/validation";
import { applyAssistantPatch } from "../src/engine/recordPatch";
import { SEED_HISTORICAL_RECORDS } from "../src/data/seed/historicalRecords";
import { COMPLIANCE_STATEMENTS } from "../src/data/seed/complianceStatements";
import { UTILITY_TEST_JOB_NAMES } from "../src/data/seed/qcReportLayouts";
import { alignPapersOnFile, PARTICIPANTS_AS_FIRST_SEEDED, PAPER_ON_FILE_NOTE } from "../src/data/paperOnFileMigration";
import { historyOf } from "../src/engine/recordHistory";
import { qcShiftSigner } from "../src/engine/qcPaperSamples";

// store/router.tsx reads window.location the moment it loads; the harness stands up none.
if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "#/dashboard", hostname: "localhost" }, configurable: true, writable: true });
}

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrMasterSeeded();
const master: MasterData = masterRepository.get();
const DAY = "2026-10-14";

const docOf = (id: string): DocumentDefinition => {
  const doc = documentRepository.getById(id);
  assert.ok(doc, id);
  return doc!;
};
const layoutOf = (id: string): LogSheetLayout => {
  const layout = getLogSheetLayout(id);
  assert.ok(layout, id);
  return layout!;
};

function recordOf(documentId: string, data: LogSheetData, status: RecordInstance["status"] = "In Progress"): RecordInstance<LogSheetData> {
  return {
    id: `review-${documentId}`,
    documentId,
    periodKey: `${documentId}:${DAY}`,
    dueDate: DAY,
    status,
    isDemo: false,
    data,
    createdAt: `${DAY}T03:00:00.000Z`,
    updatedAt: `${DAY}T03:00:00.000Z`,
  } as RecordInstance<LogSheetData>;
}

/** The sheet as the record page draws it (components/records/LogSheetRecordView.tsx), as markup. */
async function sheet(documentId: string, data: LogSheetData, editable = false): Promise<string> {
  const [view, auth, store, router] = await Promise.all([
    import("../src/components/records/LogSheetRecordView"),
    import("../src/store/AuthContext"),
    import("../src/store/AppStore"),
    import("../src/store/router"),
  ]);
  return renderToStaticMarkup(
    h(auth.AuthProvider, null, h(store.AppStoreProvider, null, h(router.RouterProvider, null, h(view.LogSheetRecordView, { doc: docOf(documentId), record: recordOf(documentId, data), editable, onChange: () => undefined }))))
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/\s+/g, " ");
const between = (html: string, from: string, to: string) => {
  const a = html.indexOf(from);
  assert.ok(a >= 0, `the markup holds ${from}`);
  const b = html.indexOf(to, a);
  return html.slice(a, b < 0 ? undefined : b);
};
const headings = (html: string) => Array.from(between(html, "<thead", "</thead>").matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g), (m) => text(m[1]).trim());
const blank = (id: string) => createDefaultData(docOf(id), DAY, master) as LogSheetData;
const sample = (id: string) => autoFillRecord(docOf(id), DAY, master, undefined)!.data as LogSheetData;
const seeded = (id: string) => SEED_HISTORICAL_RECORDS.find((r) => r.id === id)! as RecordInstance<LogSheetData>;
const hrNames = () => new Set(hrMasterRepository.all().map((p) => p.fullName));

// ---------------------------------------------------------------------------
// F01, F33: F-QC-40.C — each reading with its sign in the same cell, "SR NO"

test("F01: F-QC-40.C — each reading has its tester's sign under it, in its own cell; a record cannot go without them", async () => {
  const id = "qc-temperature";
  const layout = layoutOf(id);
  const readings = ["t0830", "t1230", "t1630", "t2030", "t0030", "t0430"];
  for (const key of readings) {
    const sign = layout.columns.find((c) => c.beneath === key);
    assert.ok(sign, `${key}: a sign drawn under the reading`);
    assert.equal(sign!.required, true, `${key}: the paper asks for the sign`);
  }
  assert.deepEqual(layout.secondLine, { label: "" }, "the sign's line is headed with nothing: it is the reading's own cell");
  // A sample day: the day's tester signs the day's three readings, the night's the night's three — QC's lab
  // executives of HR Master Data on those shifts (§111 part 6), two people.
  const filled = sample(id);
  const row = filled.rows[0];
  const day = qcShiftSigner(DAY, "08:30", "Jeni");
  const night = qcShiftSigner(DAY, "20:30", "Singh");
  assert.notEqual(day, night);
  assert.ok(hrNames().has(day) && hrNames().has(night), `${day} / ${night} on HR Master Data`);
  assert.deepEqual(readings.map((k) => row[`${k}Sign`]), [day, day, day, night, night, night]);
  assert.deepEqual(validateForSubmit(docOf(id), recordOf(id, filled)).errors, []);
  // A record with a reading and no sign under it is not submitted.
  const unsigned = { ...filled, rows: [{ ...row, t2030Sign: "" }] };
  assert.ok(validateForSubmit(docOf(id), recordOf(id, unsigned)).errors.some((e) => e.includes("20:30 HRS SIGN")), "the 20:30 sign is asked for");
  // The sheet, its paper's own table since §117 round 2 (22-Oct-2026): the paper's six headings, no Sign heading of DCRS's;
  // each reading's ruled cell holds the reading and its sign, no rule between them, on the day's line.
  const html = await sheet(id, filled);
  const body = between(html, 'data-paper-part="body"', "</table>");
  const head = between(body, "data-pt-heading", "</tr>");
  assert.deepEqual(Array.from(head.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g), (m) => text(m[1]).trim()), ["SR NO", "DATE", "08:30 HRS TEMP. + SIGN", "12:30 HRS TEMP. + SIGN", "16:30 HRS TEMP. + SIGN", "20:30 HRS TEMP. + SIGN", "12:30am HRS TEMP. + SIGN", "04:30 HRS TEMP. + SIGN"]);
  const line = between(body, 'data-pt-line="1"', "</tr>");
  assert.equal((line.match(/data-bind="rows\/[^"]+\/t\d{4}Sign"/g) ?? []).length, 6, "six signs, each beside its reading");
  assert.equal((line.match(/class="pt-c[^"]*pt-or[^"]*"/g) ?? []).length, 6, "each reading's cell open to its sign: one ruled cell");
});

test("F33: F-QC-40.C heads its numbers SR NO, as printed; the paper's 12:30am stays lower-case", async () => {
  const layout = layoutOf("qc-temperature");
  assert.equal(layout.srNoLabel, "SR NO");
  assert.equal(layout.headingsAsPrinted, true);
  const html = await sheet("qc-temperature", blank("qc-temperature"));
  assert.ok(!text(html).includes("Sr. No."), "no Sr. No. of the sheet's");
  assert.match(html, /headings-as-printed/);
});

// ---------------------------------------------------------------------------
// F05: group B's headings in the paper's own letters

test("F05: group B's grids print their headings as the papers write them, not in capitals", async () => {
  const ids = [
    "qc-calibration-master-list", "qc-obsolete-artwork", "qc-printing-aids-destruction", "qc-analysis-report", "qc-utility-test-report", "qc-minutes-of-meetings",
    "qc-test-reliability-label", "qc-test-reliability-sleeve", "qc-line-clearance-printing", "qc-line-clearance-punching", "qc-line-clearance-qc-machine",
    "qc-line-clearance-qc-manual", "qc-line-clearance-slitting", "qc-line-clearance-sleeve-gluing", "qc-line-clearance-sleeve-cutting", "qc-temperature",
  ];
  for (const id of ids) {
    assert.equal(layoutOf(id).headingsAsPrinted, true, id);
    assert.match(await sheet(id, blank(id)), /class="[^"]*headings-as-printed/, `${id}: the sheet says so`);
  }
});

// ---------------------------------------------------------------------------
// F07, F08: the numbers the papers print

test("F07: the Gujarati checklists print no number, never TO BE CONFIRMED; F/QC/13 is revision 00 of 01.12.2021, as F/SYS/02 lists it", async () => {
  for (const id of ["qc-line-clearance-materials", "qc-line-clearance-quality"]) {
    const html = await sheet(id, blank(id));
    assert.ok(!between(html, 'class="doc-header"', 'class="card').includes("TO BE CONFIRMED"), `${id}: the header prints no TO BE CONFIRMED`);
    assert.equal(docOf(id).formatNo, "TO BE CONFIRMED", `${id}: still filed as DCRS lists it`);
  }
  const fqc13 = docOf("qc-inprocess-printing");
  assert.deepEqual([fqc13.revisionNo, fqc13.revisionDate], ["00", "2021-12-01"]);
  assert.ok(!text(await sheet("qc-inprocess-printing", blank("qc-inprocess-printing"))).includes("TO BE CONFIRMED"));
});

test("F08: F/QC/30 is revision 00 of 01.01.2022, as the owner's original prints it, and so is the 2022 meeting on file", async () => {
  const doc = docOf("qc-minutes-of-meetings");
  assert.deepEqual([doc.revisionNo, doc.revisionDate, doc.sourceFile], ["00", "2022-01-01", "F-QC-30 MOM.pdf"]);
  const html = await sheet("qc-minutes-of-meetings", seeded("qc-minutes-of-meetings-2022-06").data);
  // The framed paper prints its number and revision in the foot line of the page: "Format number: - F/QC/30 (00 / 01.01.2022)".
  assert.match(text(between(html, 'data-section="page-foot"', 'data-section="notes-at-foot"')), /Format number: - F\/QC\/30 \(\s*00 \/ 01\.01\.2022\s*\)/);
});

// ---------------------------------------------------------------------------
// F11: F-QC-14 as the workbook's small tables

test("F11: F-QC-14 prints the workbook's eight small tables, each with its own heading, inspectors' names and Conclusion — no words of DCRS's", async () => {
  const label = seeded("qc-test-reliability-label-2022-02");
  const html = await sheet("qc-test-reliability-label", label.data);
  const tables = html.match(/class="compact log-sheet paper-panel/g) ?? [];
  assert.equal(tables.length, 8, "eight tables");
  const words = text(html);
  for (const absent of ["Paper Reel SAP batch no. / Roll no. / sample no.", "FG Code", "Conclusion (GSM - Total)", "Conclusion (Gloss Testing)"]) {
    assert.ok(!words.includes(absent), `"${absent}" is not on the paper`);
  }
  assert.ok(!Array.from(html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g), (m) => text(m[1]).trim()).includes("Test"), "no heading \"Test\" of DCRS's");
  assert.equal(words.split("Paper Reel SAP batch no.").length - 1, 1, "the first table's first heading");
  assert.equal(words.split("Roll no.").length - 1, 3, "the other rolls' tables");
  assert.equal(words.split("FGLA 11430 sample no.").length - 1, 4, "the finished label's four tables, its FG code written in");
  assert.equal(words.split("Conclusion").length - 1, 8, "a Conclusion under each table");
  assert.equal((words.match(/Inspector - 1 \( ?Kapila ?\)/g) ?? []).length, 8, "Inspector - 1's name under his heading in every table");
  assert.ok(words.includes("GSM - Total") && words.includes("Specification : 70 ± 5%"));
  // The check's heading is printed once, over its table, not on every line.
  assert.equal(words.split("Specification : 70 ± 5%").length - 1, 1);
  // Open for writing: the names and the FG code are typed in the first table that prints them, once each.
  const open = await sheet("qc-test-reliability-label", label.data, true);
  assert.equal((open.match(/<input[^>]*data-heading-box="inspector1"/g) ?? []).length, 1);
  assert.equal((open.match(/<input[^>]*data-heading-box="fgCode"/g) ?? []).length, 1);
  // The sleeve sheet: five tables.
  assert.equal((await sheet("qc-test-reliability-sleeve", seeded("qc-test-reliability-sleeve-2022-02").data)).match(/class="compact log-sheet paper-panel/g)?.length, 5);
});

// ---------------------------------------------------------------------------
// F12: the Gujarati papers as issued in every language

test("F12: with English chosen, F/QC/13 and the two Gujarati checklists still print the paper's Gujarati", async () => {
  const materials = text(await sheet("qc-line-clearance-materials", blank("qc-line-clearance-materials")));
  for (const w of ["લાઈન કિલયરન્સ", "આઈટમ નં.", "પ્રોસેસ", "મટીરીયલ્સ", "ઓપરેટર ની શહી", "Q.A એ ચેકીંગ", "Q.A ની શહી", "રો–મટીરીયલ્સ સ્ટોક"]) assert.ok(materials.includes(w), w);
  for (const w of ["LINE CLEARANCE", "Operator's sign", "Raw materials stock"]) assert.ok(!materials.includes(w), `no English "${w}"`);
  const quality = text(await sheet("qc-line-clearance-quality", blank("qc-line-clearance-quality")));
  assert.ok(quality.includes("ક્વોલીટી શહી") && !quality.includes("QUALITY SIGN"));
  const fqc13 = text(await sheet("qc-inprocess-printing", blank("qc-inprocess-printing")));
  for (const w of ["સ.નં", "પેરામીટર", "ટેસ્ટ ક્રાઈટ", "ગ્રેડ", "પાસ?"]) assert.ok(fqc13.includes(w), w);
  assert.ok(!fqc13.includes("Test criteria") && !fqc13.includes("Pass?"));
});

// ---------------------------------------------------------------------------
// F13: F/QC/29's heading and photograph

test("F13: F/QC/29's analysis report prints its heading centred with no 'Report' label, and has a place for its photograph", async () => {
  const data = seeded("qc-analysis-report-2022-01").data;
  const html = await sheet("qc-analysis-report", data);
  assert.match(html, /field-as-heading/);
  assert.match(html, /<label class="sr-only">Report<\/label>/, "the label is the box's name, not printed");
  const open = await sheet("qc-analysis-report", data, true);
  assert.match(open, /data-action="add-sheet-photo"/, "a photograph can be added where the paper prints one");
  const withPhoto = await sheet("qc-analysis-report", { ...data, photos: [{ id: "p1", name: "roll.jpg", dataUrl: "data:image/jpeg;base64,AAAA" }] });
  const at = withPhoto.indexOf('data-section="sheet-photos"');
  assert.ok(at > withPhoto.indexOf("</table>") && at < withPhoto.indexOf("Testing By"), "printed under the table, above the signatures");
  assert.match(withPhoto, /<img src="data:image\/jpeg;base64,AAAA"/);
});

// ---------------------------------------------------------------------------
// F25: the boxes above the paper's paragraph

test("F25: F/QC/15-A to G and the Gujarati checklists print their boxes above their paragraph, the machine box without its rule", async () => {
  const paragraph: Record<string, string> = {
    "qc-line-clearance-printing": "Activity to make sure a production line",
    "qc-line-clearance-sleeve-gluing": "Activity to make sure a production line",
    "qc-line-clearance-materials": "નીચે લખેલા દરેક પોઈન્ટ",
    "qc-line-clearance-quality": "ઓપરેટર ખાતરી કરવી",
  };
  for (const [id, words] of Object.entries(paragraph)) {
    assert.equal(layoutOf(id).boxesAboveInstructions, true, id);
    const html = await sheet(id, blank(id));
    // F/QC/15-A to G (REQUIREMENTS §117): the machine's name is written in the header's title row, above the paragraph; the
    // Gujarati checklists keep their boxes in a line of their own above it.
    const boxes = id.startsWith("qc-line-clearance-materials") || id.startsWith("qc-line-clearance-quality") ? html.indexOf('data-section="sheet-boxes"') : html.indexOf('data-bind="header/machineName"');
    assert.ok(boxes >= 0 && html.indexOf(words) > boxes, `${id}: the boxes before the paragraph`);
  }
  assert.deepEqual(layoutOf("qc-line-clearance-printing").headerFields.map((f) => f.label), ["PRINTING MACHINE NAME : -"]);
  assert.deepEqual(layoutOf("qc-line-clearance-sleeve-gluing").headerFields.map((f) => f.label), ["SHRINK SLEEVE GLUING  MACHINE NAME : -"]);
  assert.ok(!text(await sheet("qc-line-clearance-printing", blank("qc-line-clearance-printing"))).includes("____"), "no printed rule beside the box");
});

// ---------------------------------------------------------------------------
// F26, F27: one cell down a run of lines

test("F26: the Gujarati checklist signs once per process, its process printed once, a blank line between processes", async () => {
  const id = "qc-line-clearance-materials";
  const filled = sample(id);
  // Every line keeps the process its paper prints beside it: only the drawing is one cell.
  assert.deepEqual(filled.rows.map((r) => r.process).slice(0, 7), ["પ્રિન્ટીંગ", "પ્રિન્ટીંગ", "પ્રિન્ટીંગ", "પ્રિન્ટીંગ", "પ્રિન્ટીંગ", "પ્રિન્ટીંગ", "પંચીંગ"]);
  // The signatures are written on each process's first line only.
  const firsts = [0, 6, 8, 10];
  filled.rows.forEach((r, i) => {
    const first = firsts.includes(i);
    assert.equal(String(r.operatorSign ?? "").trim() !== "", first, `line ${i + 1}: the operator's sign ${first ? "written" : "not again"}`);
    assert.equal(String(r.qaSign ?? "").trim() !== "", first, `line ${i + 1}: QA's sign`);
  });
  assert.deepEqual(validateForSubmit(docOf(id), recordOf(id, filled)).errors, []);
  const html = await sheet(id, filled);
  const grid = between(html, "<tbody", "</tbody>");
  assert.deepEqual((grid.match(/data-merged="(\d+)"/g) ?? []).map((m) => m.replace(/\D/g, "")), ["6", "6", "6", "2", "2", "2", "2", "2", "2", "2", "2", "2"], "process, operator's sign and QA's sign, each one cell down its process");
  assert.equal((grid.match(/data-gap-line=""/g) ?? []).length, 3, "a blank line between the four processes");
  assert.equal(text(grid).split("પ્રિન્ટીંગ").length - 1, 1, "the process printed once");
});

test("F27: F/QC/13's boxes as printed — સેમ્પલ કોલીટી at the right, the five below one, two, two — and one પાસ? down the six lines", async () => {
  const id = "qc-inprocess-printing";
  const layout = layoutOf(id);
  assert.equal(layout.headerFields.find((f) => f.key === "sampleQty")?.paperColumn, 3);
  assert.deepEqual(layout.footerFields?.map((f) => f.boxesPerLine), [1, 2, undefined, undefined, undefined]);
  assert.deepEqual(layout.columns.find((c) => c.key === "pass")?.merged, {});
  const filled = sample(id);
  assert.ok(["Yes", "No"].includes(String(filled.rows[0].pass)), "the sheet's one answer, on the first line");
  assert.ok(filled.rows.slice(1).every((r) => r.pass === ""), "nothing on the other five");
  const html = await sheet(id, filled);
  assert.match(html, /data-paper-column="3"/);
  assert.match(between(html, 'class="compact log-sheet', "</table>"), /data-merged="6"/);
});

// ---------------------------------------------------------------------------
// F28: the Date at the right; F/QC/20's issue and review dates with its number

test("F28: the Date stands at the right on F/QC/20 and both F/QC/29 papers; F/QC/20's issue and review dates print with its format number", async () => {
  for (const id of ["qc-printing-aids-destruction", "qc-analysis-report", "qc-utility-test-report"]) {
    const date = layoutOf(id).headerFields.find((f) => f.key === "date");
    assert.equal(date?.paperColumn, 3, id);
    assert.match(await sheet(id, blank(id)), /data-paper-column="3"/, id);
  }
  const layout = layoutOf("qc-printing-aids-destruction");
  assert.equal(layout.notesBelow, undefined, "not under the grid");
  const html = await sheet("qc-printing-aids-destruction", blank("qc-printing-aids-destruction"));
  // On the paper they stand in the foot of the page, under its format number (ordinals set small: "1<sup>st</sup>").
  const head = text(between(html, 'data-section="page-foot"', 'data-section="notes-at-foot"')).replace(/(\d) (st|nd|rd|th) /g, "$1$2 ");
  assert.ok(head.includes("Current Issue date 1st January 2022") && head.includes("Next Review date 31st December 2024"), head);
});

// ---------------------------------------------------------------------------
// F29, F30: the utility test's headings and the minutes' numbered lists

test("F29: the utility test prints 'Observation (24Hrs.)' over each of Freeze, Desiccator and Oven, a cell each", async () => {
  const html = await sheet("qc-utility-test-report", seeded("qc-utility-test-report-2022-12").data);
  assert.deepEqual(headings(html), ["Sr. No.", "Description", "Observation (24Hrs.)", "Observation (24Hrs.)", "Observation (24Hrs.)", "Job Name", "Freeze", "Desiccator", "Oven"]);
});

test("F30: the minutes number their key points '1.' under no Sr. No. heading, and list who attended one to a line", async () => {
  const data = seeded("qc-minutes-of-meetings-2022-06").data;
  const html = await sheet("qc-minutes-of-meetings", data);
  assert.deepEqual(headings(html), ["", "Key points Discussed:"]);
  assert.match(between(html, "<tbody", "</tbody>"), /data-sr-no="">1\.</);
  assert.equal(layoutOf("qc-minutes-of-meetings").headerFields.find((f) => f.key === "participants")?.type, "paragraph");
  assert.equal(data.header.participants.split("\n").length, 5, "five lines");
  assert.ok(!data.header.participants.includes("; "));
});

// ---------------------------------------------------------------------------
// F31: F/QC/16's own Sr. No.

test("F31: F/QC/16 keeps its paper's own Sr. No. — 7, 9, 8, 10 on the 2022 page — and a new line is numbered after the last", async () => {
  const layout = layoutOf("qc-obsolete-artwork");
  assert.equal(layout.columns[0].key, "srNo");
  assert.equal(layout.ownLineNumbers, true);
  const page = seeded("qc-obsolete-artwork-2022-02").data;
  assert.deepEqual(page.rows.map((r) => r.srNo), ["1", "2", "3", "4", "5", "6", "7", "9", "8", "10", "11", "12", "13"]);
  const html = await sheet("qc-obsolete-artwork", page);
  // Drawn as its paper's own table since §117 round 2 (22-Oct-2026): the heading row is the body's first row, the lines after it.
  const body = between(html, 'data-paper-part="body"', "</table>");
  const heads = Array.from(body.slice(body.indexOf("<tr"), body.indexOf("</tr>")).matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g), (m) => text(m[1]).trim());
  assert.equal(heads.filter((h) => h === "Sr. No.").length, 1, "one Sr. No., the paper's");
  assert.match(text(body), / 9 Neilmed Pharmaceuticals Inc Wound Wash 177mL Sleeve /);
  assert.deepEqual(sample("qc-obsolete-artwork").rows.map((r) => r.srNo), ["1", "2"], "a sample day's two lines");
  // A Live record's blank line, and a line Mitra adds, are numbered too: a line's place, nothing observed.
  const live = prepareKnownParts(docOf("qc-obsolete-artwork"), DAY, master, undefined)!.data as LogSheetData;
  assert.deepEqual(live.rows.map((r) => r.srNo), ["1"]);
  assert.ok(live.rows.every((r) => !r.customerName && !r.jobName), "nothing else written");
  assert.deepEqual(blank("qc-obsolete-artwork").rows.map((r) => r.srNo), ["1"]);
  const added = applyAssistantPatch("log-sheet", "qc-obsolete-artwork", live, { rows: [...live.rows, { customerName: "Nivea India Pvt Ltd" }] });
  assert.deepEqual((added.data as LogSheetData).rows.map((r) => r.srNo), ["1", "2"]);
});

test("F30, F31: a copy of the 2022 pages stored before is brought in step once, with a line in its history", () => {
  const artwork = seeded("qc-obsolete-artwork-2022-02");
  const minutes = seeded("qc-minutes-of-meetings-2022-06");
  const oldArtwork = { ...artwork, data: { ...artwork.data, rows: artwork.data.rows.map(({ srNo: _s, ...r }) => r) } } as RecordInstance<LogSheetData>;
  const oldMinutes = { ...minutes, data: { ...minutes.data, header: { ...minutes.data.header, participants: PARTICIPANTS_AS_FIRST_SEEDED } } } as RecordInstance<LogSheetData>;
  recordRepository.upsertMany([oldArtwork, oldMinutes]);
  assert.equal(alignPapersOnFile(), 2);
  const a = recordRepository.getById(artwork.id) as RecordInstance<LogSheetData>;
  assert.deepEqual(a.data.rows.map((r) => r.srNo).slice(6, 10), ["7", "9", "8", "10"]);
  assert.ok(historyOf(a).some((e) => e.note === PAPER_ON_FILE_NOTE));
  assert.equal((recordRepository.getById(minutes.id) as RecordInstance<LogSheetData>).data.header.participants, minutes.data.header.participants);
  assert.equal(alignPapersOnFile(), 0, "nothing to do the second time");
});

// ---------------------------------------------------------------------------
// F32: the statements of compliance as the documents print them

test("F32: F/QC-09 and F/QC-38 as their documents: the footer as printed, F/QC-38's list after the table as one list, a line per bullet", () => {
  assert.equal(COMPLIANCE_STATEMENTS["soc-labels"].footerRef, "F/QC-09 (Rev – 00 / 01.12.2021)");
  const s = COMPLIANCE_STATEMENTS["soc-flexible-packaging"];
  assert.equal(s.footerRef, "F/QC-38 (Rev – 00 / 24.02.2025)");
  const labels = s.sections.map((x) => x.label);
  for (const absent of ["Applicable regulations", "Intended Food Contact packaging", "REACH"]) assert.ok(!labels.includes(absent), `no table row "${absent}"`);
  assert.ok(s.declarations.includes("Please refer below for Intended Food Contact packaging: ‐"), "the document's own words");
  assert.equal(s.declarations.filter((d) => d.startsWith("Commission Regulation (EC) No. 282/2008")).length, 2, "printed again after the food categories");
  assert.ok(s.declarations.includes("⇨ Dry Food") && s.declarations.includes("⇨ Producers of Solvents"), "a line per bullet");
  assert.ok(!s.declarations.some((d) => d.includes("; Producers of") || d.includes("Dry Food;")), "no list joined with '; '");
  assert.deepEqual(s.headings, ["REACH"]);
  const reach = s.declarations.indexOf("REACH");
  assert.ok(reach > s.declarations.indexOf("⇨ Dry Food") && reach < s.declarations.findIndex((d) => d.startsWith("We declare that all raw materials")));
});

// ---------------------------------------------------------------------------
// F34: "Approved by (QA Manager) is the Verify step" only under a paper that prints it

test("F34: the screen's line that the paper's approval is the Verify step shows only under a paper that prints one", async () => {
  const note = "is the Verify step here";
  for (const id of ["qc-test-reliability-label", "qc-inprocess-printing", "qc-line-clearance-materials"]) {
    assert.ok(!text(await sheet(id, blank(id))).includes(note), `${id}: its paper prints no approval`);
  }
  for (const id of ["qc-inspection-printed-film", "qc-inspection-slitting", "qc-inspection-pouching"]) {
    assert.ok(text(await sheet(id, blank(id))).includes(note), `${id}: its paper prints "Approved by / QA Manager"`);
  }
});

// ---------------------------------------------------------------------------
// OPS-2, OPS-3: Demo Mode and the sample fill; a Live record

test("OPS-2: a new F/QC/29 utility test holds no 2022 sample; the job names are written, a line each, and a sample day tests that day's", () => {
  const id = "qc-utility-test-report";
  const layout = layoutOf(id);
  assert.equal(layout.rowMode.kind, "free");
  assert.ok(!layout.columns.find((c) => c.key === "jobName")?.fixed, "Job Name is written");
  for (const live of [blank(id), (prepareKnownParts(docOf(id), DAY, master, undefined)?.data as LogSheetData | undefined) ?? blank(id)]) {
    assert.ok(!live.rows.some((r) => UTILITY_TEST_JOB_NAMES.includes(String(r.jobName ?? ""))), "nothing of 02-Dec-2022 in a Live record");
  }
  const filled = sample(id);
  assert.ok(filled.rows.length >= 5 && filled.rows.length <= 9);
  assert.ok(filled.rows.every((r) => UTILITY_TEST_JOB_NAMES.includes(String(r.jobName)) && r.freeze === "Pass"));
  assert.notDeepEqual(filled.rows.map((r) => r.jobName), UTILITY_TEST_JOB_NAMES, "not the 2022 page copied");
  assert.deepEqual(validateForSubmit(docOf(id), recordOf(id, filled)).errors, []);
});

test("OPS-3: Demo Mode's signatures on group B's reports are two people of HR Master Data, never one name in both boxes", () => {
  const names = hrNames();
  const pairs: [string, (d: LogSheetData) => [string, string]][] = [
    ["qc-analysis-report", (d) => [d.header.testingBy, d.header.approvedBy]],
    ["qc-utility-test-report", (d) => [d.header.testingBy, d.header.approvedBy]],
    ["qc-printing-aids-destruction", (d) => [String(d.rows[0].destroyedBy), String(d.rows[0].checkedBy)]],
  ];
  for (const [id, signers] of pairs) {
    const [a, b] = signers(sample(id));
    assert.ok(a && b && a !== b, `${id}: ${a} / ${b}`);
    assert.ok(names.has(a) && names.has(b), `${id}: both on HR Master Data (${a}, ${b})`);
  }
  const artwork = sample("qc-obsolete-artwork");
  assert.ok(artwork.rows.every((r) => names.has(String(r.updatedBy))), "F/QC/16's QC In-charge on HR Master Data");
  // F/QC/20's printing aids are those of an artwork withdrawn (F/QC/16's own lines), not the 2022 line every day.
  const withdrawn = new Set(seeded("qc-obsolete-artwork-2022-02").data.rows.map((r) => String(r.jobName)));
  const aids = sample("qc-printing-aids-destruction").rows;
  assert.ok(aids.length >= 1 && aids.every((r) => withdrawn.has(String(r.itemDescription)) && /^[1-4]$/.test(String(r.actualQty))), JSON.stringify(aids));
});
