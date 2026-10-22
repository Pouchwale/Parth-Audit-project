// THE FINDINGS ON §111, FIXED (REQUIREMENTS §111 part 6, 13-Oct-2026).
//
// A review of the QC formats as built held each print against its original once more, and ran the sheets the way
// the plant and Mitra do: the morning prepare, the sample fill, Demo Mode, the print. What it found is pinned here,
// each test failing on the code before this part:
//   * F/QC/11's Serial No printed DCRS's own "TO BE CONFIRMED", on the page on file and on every new sheet;
//   * the sample sheets of both calibration records carried a 2024 or 2025 Calibration Expiry, all Pass; F/QC/11's
//     Due Date was blank and its Sign. line "Rashmi", who is not on HR Master Data;
//   * the boxes dropped the paper's colons, F/QC/11's Due Date stood in the middle, its Pass/Fail and Sign. lines
//     were two cells a plate, and the four documents the owner named printed their headings in capitals;
//   * a tolerance or specification the paper prints drove no highlight: F/QC/12's Acceptable Tolerance, an incoming
//     record's SPECIFICATION, a certificate's TOLERANCE table;
//   * Demo Mode's QC records were signed by names HR Master Data does not hold;
//   * F-QC-32's specimen put its signatures under Checked by.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import type { DocumentDefinition, LogSheetData, LogSheetLayout, MasterData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { hrMasterRepository, ensureSeeded as ensureHrMasterSeeded } from "../src/data/repositories/hrMasterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { GSM_HEADER } from "../src/data/seed/qcCalibrationLayouts";
import { SEED_GSM_PLATE_CALIBRATION } from "../src/data/seed/qcCalibrationRecords";
import { alignSeededPlaceholders, PLACEHOLDER_NOTE } from "../src/data/seededPlaceholderMigration";
import { createDefaultData } from "../src/engine/recordDefaults";
import { autoFillRecord } from "../src/engine/autoFill";
import { prepareKnownParts } from "../src/engine/knownParts";
import { withComputedCells } from "../src/engine/computedCells";
import { boxOutOfBand, cellJudge, outOfBandCount, readingFigure, specBand } from "../src/engine/printedBands";
import { logSheetOutOfBandCount } from "../src/engine/validation";
import { qcShiftSigner } from "../src/engine/qcPaperSamples";

// store/router.tsx reads window.location the moment it loads; the harness stands up none.
if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "#/dashboard", hostname: "localhost" }, configurable: true, writable: true });
}

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrMasterSeeded();
const master: MasterData = masterRepository.get();
const css = readFileSync(path.join(process.cwd(), "frontend", "src", "styles.css"), "utf8");

const GSM = "qc-gsm-plate-calibration"; // F/QC/11
const SCALE = "qc-weight-scale-calibration"; // F/QC/12
const VISCOSITY = "qc-viscosity"; // F-QC-30
const MIXING = "qc-adhesive-mixing"; // F-QC-32
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
const record = (documentId: string, data: LogSheetData, extra: Partial<RecordInstance> = {}): RecordInstance<LogSheetData> =>
  ({
    id: `findings-${documentId}`,
    documentId,
    periodKey: `${documentId}:${DAY}`,
    dueDate: DAY,
    status: "Verified",
    isDemo: false,
    data,
    createdAt: `${DAY}T03:00:00.000Z`,
    updatedAt: `${DAY}T03:00:00.000Z`,
    ...extra,
  }) as RecordInstance<LogSheetData>;

/** The sheet as the record page draws it (components/records/LogSheetRecordView.tsx), as markup. */
async function sheet(documentId: string, data: LogSheetData, editable = false): Promise<string> {
  const [view, auth, store, router] = await Promise.all([
    import("../src/components/records/LogSheetRecordView"),
    import("../src/store/AuthContext"),
    import("../src/store/AppStore"),
    import("../src/store/router"),
  ]);
  return renderToStaticMarkup(
    h(auth.AuthProvider, null, h(store.AppStoreProvider, null, h(router.RouterProvider, null, h(view.LogSheetRecordView, { doc: docOf(documentId), record: record(documentId, data), editable, onChange: () => undefined }))))
  );
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const bodyRows = (html: string) => {
  const a = html.indexOf("<tbody");
  const b = html.indexOf("</tbody>", a);
  return Array.from(html.slice(a, b).matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/g), (m) => Array.from(m[2].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g), (c) => ({ attrs: c[1], html: c[2] })));
};
const hrNames = () => new Set(hrMasterRepository.all().map((p) => p.fullName));

// ---------------------------------------------------------------------------
// 1. F/QC/11's Serial No: the paper's blank box, never DCRS's "TO BE CONFIRMED"

test("F/QC/11's Serial No is the paper's blank box on the page on file, and no new sheet, Live or sample, is given DCRS's TO BE CONFIRMED", () => {
  assert.equal(GSM_HEADER.serialNo, "", "the scan's scribble is left blank, as the paper's box is");
  assert.equal(SEED_GSM_PLATE_CALIBRATION.data.header.serialNo, "");
  assert.equal(layoutOf(GSM).specimenHeader?.serialNo, "");
  // The morning prepare and the sample fill, with no sheet before them and after the page on file as it was stored.
  const stored = record(GSM, { ...SEED_GSM_PLATE_CALIBRATION.data, header: { ...SEED_GSM_PLATE_CALIBRATION.data.header, serialNo: "TO BE CONFIRMED" } }, { dueDate: "2024-12-31" });
  for (const prior of [undefined, stored]) {
    const known = prepareKnownParts(docOf(GSM), DAY, master, prior)!.data as LogSheetData;
    assert.equal(known.header.serialNo, "", `prepared ${prior ? "after the page on file" : "from the form"}`);
    const sample = autoFillRecord(docOf(GSM), DAY, master, prior)!.data as LogSheetData;
    assert.equal(sample.header.serialNo, "", `sample ${prior ? "after the page on file" : "from the form"}`);
  }
  // A real serial number written on the last sheet is still carried: it is the plates' own.
  const written = record(GSM, { ...stored.data, header: { ...stored.data.header, serialNo: "GEC-0457" } }, { dueDate: "2026-09-14" });
  assert.equal((prepareKnownParts(docOf(GSM), DAY, master, written)!.data as LogSheetData).header.serialNo, "GEC-0457");
});

test("the page on file stored with DCRS's TO BE CONFIRMED takes the paper's blank Serial No at start-up, once, with a line in its history", () => {
  const before = recordRepository.getAll();
  try {
    const old = { ...SEED_GSM_PLATE_CALIBRATION, data: { ...SEED_GSM_PLATE_CALIBRATION.data, header: { ...SEED_GSM_PLATE_CALIBRATION.data.header, serialNo: "TO BE CONFIRMED" } } };
    recordRepository.upsertMany([old as RecordInstance]);
    assert.equal(alignSeededPlaceholders(), 1);
    const now = recordRepository.getById(SEED_GSM_PLATE_CALIBRATION.id)!;
    assert.equal((now.data as LogSheetData).header.serialNo, "");
    assert.equal(now.status, "Verified", "its status and signatures are kept");
    assert.equal(now.verifiedBy, SEED_GSM_PLATE_CALIBRATION.verifiedBy);
    assert.ok(now.history?.some((e) => e.note === PLACEHOLDER_NOTE));
    assert.equal(alignSeededPlaceholders(), 0, "nothing to do the next time");
  } finally {
    recordRepository.upsertMany(before.filter((r) => r.id === SEED_GSM_PLATE_CALIBRATION.id));
  }
});

// ---------------------------------------------------------------------------
// 2. The calibration sheets of Demo Mode and sample data read as a real week's or month's

test("a sample F/QC/11 or F/QC/12 sheet of 2026 carries an instrument still in calibration, F/QC/11 its Due Date and a signer of HR Master Data", () => {
  for (const id of [GSM, SCALE]) {
    const filled = autoFillRecord(docOf(id), DAY, master, undefined)!;
    const header = (filled.data as LogSheetData).header;
    assert.match(String(header.calibrationExpiry), /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(String(header.calibrationExpiry) > DAY, `${id}: expiry ${header.calibrationExpiry} after the sheet's day`);
    assert.ok(!filled.notes.some((n) => /out of calibration/.test(n)), `${id}: no instrument out of calibration on a sample sheet`);
  }
  const gsm = autoFillRecord(docOf(GSM), DAY, master, undefined)!.data as LogSheetData;
  assert.equal(gsm.header.calibrationExpiry, "2027-09-22", "the plates' yearly date, its next anniversary");
  assert.equal(gsm.header.calibrationDate, DAY);
  assert.equal(gsm.header.dueDate, "2026-11-14", "the next month's calibration");
  const sign = gsm.rows.find((r) => r.parameter === "Sign.")!;
  const names = hrNames();
  for (const plate of ["p54", "p55", "p56", "p57"]) assert.ok(names.has(String(sign[plate])), `Sign. under ${plate}: ${sign[plate]}`);
  assert.equal((autoFillRecord(docOf(SCALE), DAY, master, undefined)!.data as LogSheetData).header.calibrationExpiry, "2027-08-27");
  // The Live prepare still carries the expiry as written and says first that it has run out.
  const known = prepareKnownParts(docOf(SCALE), DAY, master, undefined)!;
  assert.equal((known.data as LogSheetData).header.calibrationExpiry, "2024-08-27");
  assert.match(known.notes[0], /^Check this first: the Calibration Expiry/);
});

// ---------------------------------------------------------------------------
// 3. The boxes and the grid as the papers draw them

test("both calibration records carry the paper's own box words, F/QC/11's Due Date:- at the right, and its Pass/Fail and Sign. one cell a plate", async () => {
  assert.deepEqual(
    layoutOf(SCALE).headerFields.map((f) => f.printedLabel),
    ["Device ID No:", "Location:", "Department:", "Manufacturer:", "Serial No:", "Calibration Expiry:", "Minimum Reading Capacity:", "Maximum Reading Capacity:", "Acceptable Tolerance:"]
  );
  const due = layoutOf(GSM).headerFields.find((f) => f.key === "dueDate")!;
  assert.equal(due.printedLabel, "Due Date:-");
  assert.equal(due.paperColumn, 3);
  const html = await sheet(GSM, withComputedCells(GSM, autoFillRecord(docOf(GSM), DAY, master, undefined)!.data as LogSheetData));
  assert.match(html, /<div class="field" data-paper-column="3"><label>Due Date:-<\/label>/);
  assert.ok(text(html).includes("I. Calibration Date:-"));
  const rows = bodyRows(html);
  assert.equal(rows.length, 6);
  // Tasted-1 to 4: Index and the eight cells; Pass/Fail and Sign.: Index and one cell under each plate.
  for (const i of [0, 1, 2, 3]) assert.equal(rows[i].length, 9, `line ${i + 1}`);
  for (const i of [4, 5]) {
    assert.equal(rows[i].length, 5, `line ${i + 1} is one cell a plate`);
    assert.ok(rows[i].slice(1).every((c) => /colSpan="2"/i.test(c.attrs)), rows[i].map((c) => c.attrs).join(" | "));
  }
  assert.match(rows[4][1].html, /data-bind="rows\/[^"]+\/p54"[^>]*>Pass</, "the plate's Pass, bound to its first column");
});

test("the four documents the owner named print their headings in the paper's own letters, not the sheet's capitals", async () => {
  for (const id of [VISCOSITY, MIXING, GSM, SCALE]) {
    assert.equal(layoutOf(id).headingsAsPrinted, true, id);
    const html = await sheet(id, createDefaultData(docOf(id), DAY, master) as LogSheetData);
    assert.match(html, /^<div class="[^"]*headings-as-printed/, `${id} is drawn with its headings as printed`);
  }
  assert.match(css, /\.headings-as-printed \.doc-table th \{ text-transform: none; letter-spacing: 0; \}/);
});

test("F-QC-32's page is signed under Verified by, Checked by left blank, as written; a sample sheet signs it so, by HR Master Data's people", () => {
  const specimen = layoutOf(MIXING).specimenRows!;
  assert.deepEqual(
    specimen.map((r) => [r.checkedBy, r.verifiedBy]),
    [["", "Jeni"], ["", "Singh"], ["", "Singh"], ["", "Singh"], ["", "Jeni"]]
  );
  assert.equal(specimen[4].date, "2026-09-07", "its fifth line is of the next morning");
  const sample = autoFillRecord(docOf(MIXING), DAY, master, undefined)!.data as LogSheetData;
  const names = hrNames();
  assert.ok(sample.rows.every((r) => r.checkedBy === "" && names.has(String(r.verifiedBy))), JSON.stringify(sample.rows.map((r) => [r.checkedBy, r.verifiedBy])));
});

// ---------------------------------------------------------------------------
// 4. A tolerance or specification the paper prints drives the highlight

test("a Deviation % outside F/QC/12's Acceptable Tolerance is highlighted and counted; inside it, or with no tolerance written, nothing is", async () => {
  const layout = layoutOf(SCALE);
  const line = { id: "w1", date: DAY, testedBy: "Anil Raval", weight1: "50.000gm", testedValue1: "50.040gm", weight2: "100.000gm", testedValue2: "100.010gm", passFail: "", sign: "", nextDueDate: "" };
  const data = withComputedCells(SCALE, { header: { acceptableTolerance: "0.05 %" }, rows: [line] } as LogSheetData);
  assert.equal(data.rows[0].deviation1, "0.08%");
  assert.equal(data.rows[0].deviation2, "0.01%");
  const judge = cellJudge(layout, data.header);
  const col = (key: string) => layout.columns.find((c) => c.key === key)!;
  assert.equal(judge(data.rows[0], col("deviation1")), true, "0.08% is outside ± 0.05");
  assert.equal(judge(data.rows[0], col("deviation2")), false, "0.01% is inside");
  assert.equal(logSheetOutOfBandCount(SCALE, data), 1);
  assert.equal(data.rows[0].passFail, "Fail");
  const html = await sheet(SCALE, data);
  assert.match(html, /<td class="cell-out-of-band" data-beneath="deviation1">/);
  assert.ok(!/class="cell-out-of-band" data-beneath="deviation2"/.test(html));
  assert.match(html, /outside the printed acceptance band/);
  const none = withComputedCells(SCALE, { header: { acceptableTolerance: "" }, rows: [line] } as LogSheetData);
  assert.equal(logSheetOutOfBandCount(SCALE, none), 0, "no tolerance written, nothing judged");
});

test("the specification an incoming record prints on each line is read as a band where it is a plain figure, and only there", () => {
  const cases: [string, ReturnType<typeof specBand>][] = [
    ["90 (+2.0 / -1.0)", { min: 89, max: 92 }],
    ["76 (+2.0 / -0.0)", { min: 76, max: 78 }],
    ["7 (± 0.50)", { min: 6.5, max: 7.5 }],
    ["Max 15%", { max: 15 }],
    ["Both side Minimum 36 dynes", { min: 36 }],
    ["Both side Min. 36 dynes", { min: 36 }],
    ["Delta Value DE should be below 3.0", { max: 3 }],
    ["5.5% – 8.5%", { min: 5.5, max: 8.5 }],
    ["Viscosity is 15 to 20 secs, when measured with B4 Ford cup", { min: 15, max: 20 }],
    ["Mixed of adhesive with 20% water, viscosity is 30 to 40 secs, when measured with B4 Ford cup", { min: 30, max: 40 }],
    ["Min 40%", { min: 40 }],
    ["Above 85% measured with 60˚ angle with Gloss meter", { min: 85 }],
    ["Below 14", { max: 14 }],
    ["30 ± 10", { min: 20, max: 40 }],
    ["16 to 25", { min: 16, max: 25 }],
    ["MIN: 1800 meters\nMax: 2400 meters.", { min: 1800, max: 2400 }],
    // The inspector's to judge: relative to the order, one band a ply or a side, an exception, no figure.
    ["Should be as per P.O.  (+ 2/- 0.0)", null],
    ["AS PER P.O. (±5)", null],
    ["3PLY: 9 ± 1\n5PLY: 12 ± 1\n7PLY: 15 ± 1", null],
    ["Wire Side: 30–50 GSM\nFelt Side: 30-60 GSM", null],
    ["For Kraft Paper: 30-50\nFor White Top Liner: 25-40", null],
    ["Max. 120 mm (Except Silver  & Gold ink)", null],
    ["1:2,1:3,1:4", null],
    ["Transparent", null],
    ["N.A.", null],
    ["-", null],
    ["If Specified in P.O. then No fading of ink roll up in 2% NaOH Solution for 24hrs", null],
  ];
  for (const [spec, band] of cases) assert.deepEqual(specBand(spec), band, spec);
  assert.equal(readingFigure("91.2"), 91.2);
  assert.equal(readingFigure("Both side 38 dynes"), 38);
  assert.equal(readingFigure("-0.02%"), -0.02);
  for (const words of ["OK", "Transparent", "1:3", "20 x 20cm", "455 x 305 x 260", ""]) assert.equal(readingFigure(words), null, words);
});

test("an incoming record's reading outside the specification printed on its line is highlighted; a sample lot of every incoming record reads inside", async () => {
  const id = "qc-paper-core"; // F/QC/04
  const layout = layoutOf(id);
  assert.deepEqual(layout.specBand, { spec: "specification", readings: ["sample1", "sample2", "sample3"] });
  const data = createDefaultData(docOf(id), DAY, master) as LogSheetData;
  const outer = data.rows.findIndex((r) => r.parameter === "OUTER DIA (mm)");
  const rows = data.rows.map((r, i) => (i === outer ? { ...r, sample1: "90.4", sample2: "92.6", sample3: "OK" } : r));
  const judged = { ...data, rows };
  assert.equal(outOfBandCount(layout, judged), 1, "92.6 is outside 90 (+2.0 / -1.0); 90.4 inside; OK not a figure");
  const html = await sheet(id, judged, true);
  assert.equal((html.match(/class="cell-out-of-band"/g) ?? []).length, 1);
  // Demo Mode's and a test server's lots: every reading inside the specification printed beside it.
  const incoming = Object.values(Object.fromEntries(documentRepository.getAll().map((d) => [d.id, d]))).filter((d) => getLogSheetLayout(d.id)?.specBand);
  assert.ok(incoming.length >= 15, `${incoming.length} records judged by their printed specification`);
  for (const doc of incoming) {
    for (const day of ["2026-08-03", "2026-09-15", DAY, "2026-11-20", "2027-01-05"]) {
      const filled = autoFillRecord(doc, day, master, undefined)!.data as LogSheetData;
      const l = layoutOf(doc.id);
      const judge = cellJudge(l, filled.header);
      const out = filled.rows.flatMap((r) => l.specBand!.readings.filter((k) => judge(r, l.columns.find((c) => c.key === k)!)).map((k) => `${r.parameter}: ${r[k]} against ${r.specification}`));
      assert.deepEqual(out, [], `${doc.id} on ${day}`);
    }
  }
});

test("a certificate's tested size outside its client's size by more than the TOLERANCE table's figures is highlighted", async () => {
  const layout = layoutOf("qc-coa-label");
  const tested = layout.headerFields.find((f) => f.key === "testedLength")!;
  assert.deepEqual(tested.within, { of: "specifiedLength", plus: 2, minus: 2 });
  assert.equal(boxOutOfBand(tested, { specifiedLength: "60", testedLength: "61.5" }), false);
  assert.equal(boxOutOfBand(tested, { specifiedLength: "60", testedLength: "62.5" }), true);
  assert.equal(boxOutOfBand(tested, { specifiedLength: "", testedLength: "62.5" }), false, "nothing to judge against");
  const face = layout.headerFields.find((f) => f.key === "faceMaterialTested")!;
  assert.deepEqual(face.within, { of: "faceMaterialRequired", plus: 10, minus: 10, percent: true });
  assert.equal(boxOutOfBand(face, { faceMaterialRequired: "80 GSM", faceMaterialTested: "89 GSM" }), true, "89 is beyond 80 + 10 %");
  assert.equal(boxOutOfBand(face, { faceMaterialRequired: "80 GSM", faceMaterialTested: "86 GSM" }), false);
  const data = createDefaultData(docOf("qc-coa-label"), DAY, master) as LogSheetData;
  const html = await sheet("qc-coa-label", { ...data, header: { ...data.header, specifiedLength: "60", testedLength: "64" } }, true);
  assert.match(html, /class="field field-out-of-band field-in-table" data-box="testedLength"/);
  assert.match(css, /\.field-out-of-band \.input \{ border-color: var\(--color-warning\); background: var\(--color-warning-bg\); \}/);
  // The supplied certificates and a sample one read inside their tolerance.
  for (const id of ["qc-coa-label", "qc-coa-sleeve"]) {
    const sample = autoFillRecord(docOf(id), DAY, master, undefined)!.data as LogSheetData;
    assert.equal(outOfBandCount(layoutOf(id), sample), 0, id);
  }
});

// ---------------------------------------------------------------------------
// 5. Demo Mode's QC records are signed by people of HR Master Data

test("Demo Mode's and sample QC sheets are signed by QC's people on HR Master Data, the day's and the night's testers two of them", () => {
  const names = hrNames();
  assert.ok(names.size > 0);
  const day = qcShiftSigner(DAY, "09:00", "Jeni");
  const night = qcShiftSigner(DAY, "21:00", "Singh");
  assert.ok(names.has(day) && names.has(night) && day !== night, `${day} / ${night}`);
  const viscosity = autoFillRecord(docOf(VISCOSITY), DAY, master, undefined)!.data as LogSheetData;
  assert.ok(viscosity.rows.every((r) => names.has(String(r.testedBy))), JSON.stringify([...new Set(viscosity.rows.map((r) => r.testedBy))]));
  assert.deepEqual([...new Set(viscosity.rows.map((r) => r.testedBy))].sort(), [day, night].sort());
  for (const id of ["qc-temperature", "qc-inspection-pouching", "qc-inspection-slitting", "qc-inspection-printed-film", "qc-inspection-sb-lamination"]) {
    const doc = documentRepository.getById(id);
    if (!doc) continue;
    const filled = autoFillRecord(doc, DAY, master, undefined)!.data as LogSheetData;
    const layout = layoutOf(id);
    const signed = [
      ...[...layout.headerFields, ...(layout.footerFields ?? [])].filter((f) => f.autoFill?.sign).map((f) => [f.label, filled.header[f.key]]),
      ...layout.columns.filter((c) => c.autoFill?.sign).flatMap((c) => filled.rows.map((r) => [c.label, r[c.key]])),
    ].filter(([, v]) => String(v ?? "").trim() !== "");
    for (const [label, name] of signed) assert.ok(names.has(String(name)), `${id} ${label}: ${name} is not on HR Master Data`);
  }
});

// ---------------------------------------------------------------------------
// 6. The header block and the foot as the papers print them

test("the header block prints the paper's lines under the company's name and its title in its own letters; F/QC/25 its letterhead in place of the company's line", async () => {
  const label = await sheet("qc-coa-label", createDefaultData(docOf("qc-coa-label"), DAY, master) as LogSheetData);
  // Since §117 round 2 the certificate's letterhead is its own table's first row (components/records/PaperTableSheet.tsx):
  // the logo at the left; the company's name in the paper's letters (the owner's name for it) with its three lines under
  // it, each where the paper prints it; then the title, in its own letters, in a row of its own.
  const head = label.slice(label.indexOf('data-paper-part="head"'), label.indexOf("</table>", label.indexOf('data-paper-part="head"')));
  assert.match(head, /<img class="pt-img" src="brand\/gpp-paper-logo\.png"/);
  assert.match(head, /<span class="pt-at pt-b pt-f-arial"[^>]*><span translate="no">Gujarat Print Pack Publications Pvt Ltd<\/span><\/span><span class="pt-at"[^>]*>308,309,232 A &amp; B,G\.I\.D\.C\. Estate,At Dediyasan,Mehsana - 384002 Gujarat India<\/span><span class="pt-at"[^>]*>Contact Number :  , Email : info@gujprintpack\.com<\/span><span class="pt-at"[^>]*>GSTIN :  24AAACG7781P1Z1, IEC CODE : 0894007882, PAN : AAACG7781P<\/span>/);
  assert.match(head, /<span class="pt-words"><span translate="no">Certificate of Analysis \[COA\] For Label<\/span><\/span>/, "the title in the paper's letters, under the lines");
  assert.ok(!text(label).includes("CERTIFICATE OF ANALYSIS"));
  const gsm = await sheet(GSM, createDefaultData(docOf(GSM), DAY, master) as LogSheetData);
  assert.match(gsm, /data-section="under-company"><div>Manufacturers of Printed Cartons, Self Adhesive Labels, Shrink sleeves, Corrugated Boxes<\/div><\/div>/);
  assert.match(gsm, /<div class="doc-title"><span>MONTHLY INTERNAL CALIBRATION RECORDS – GSM CUTTING PLATE<\/span>/, "a title printed in capitals stays so");
  const scale = await sheet(SCALE, createDefaultData(docOf(SCALE), DAY, master) as LogSheetData);
  assert.match(scale, /data-section="under-company"><div>Manufacturers of Printed Cartons/);
  // F/QC/25 (its own table since §117 round 2 of 22-Oct-2026): its letterhead's three cells head the page, the company's
  // name in the first, printed once (in the paper's capitals, the owner's name as COMPANY.name prints it); then the CBA line; then its title in
  // its own letters; then Date:.
  const cba = await sheet("qc-coa-corrugated", createDefaultData(docOf("qc-coa-corrugated"), DAY, master) as LogSheetData);
  const cbaHead = cba.slice(cba.indexOf('data-paper-part="head"'), cba.indexOf("</table>", cba.indexOf('data-paper-part="head"')));
  assert.ok(!cba.includes('class="company-name'), "no company line besides the letterhead's");
  const order = ["DEPT:QUALITY", "CBA: CORRUGATED BOX ANALYSIS", "Certificate of Analysis [COA] For CORRUGATED BOXES", "Date:"].map((w) => cbaHead.indexOf(w));
  assert.ok(order.every((at, i) => at >= 0 && (i === 0 || order[i - 1] < at)), JSON.stringify(order));
  assert.equal(text(cba).split("GUJARAT PRINT PACK PUBLICATIONS PVT LTD").length - 1, 1, "the company's name printed once");
  assert.match(cbaHead, /<span class="pt-at pt-b pt-wrap pt-caps"[^>]*><span translate="no">GUJARAT PRINT PACK PUBLICATIONS PVT LTD<\/span><\/span>/);
  // F/QC/13 in its own letters.
  assert.equal(layoutOf("qc-inprocess-printing").titleAsPrinted, true);
});

test("the header's Rev No. prints the Master List's revision for the certificates, and nothing where none is given; the page is 1 of 1, beside the format's Rev Date, and no Date cell (§117)", async () => {
  assert.deepEqual([docOf("qc-coa-label").revisionNo, docOf("qc-coa-label").revisionDate], ["00", "2021-12-01"]);
  assert.deepEqual([docOf("qc-coa-sleeve").revisionNo, docOf("qc-coa-sleeve").revisionDate], ["00", "2021-12-01"]);
  const label = await sheet("qc-coa-label", createDefaultData(docOf("qc-coa-label"), DAY, master) as LogSheetData);
  const meta = (html: string, row = '<div class="meta-row">') =>
    Array.from(html.slice(html.indexOf(row)).matchAll(/<div class="meta-cell"[^>]*><span class="k">([^<]+)<\/span>([\s\S]*?)<\/div>/g), (m) => [m[1], text(m[2]).trim()]).slice(0, 5);
  // The certificate prints no number, revision or page (its paper has none, §117 round 2): they stand on the screen only,
  // under its letterhead, to be typed over there, and are never printed.
  assert.ok(label.includes('<div class="meta-row pt-number-strip no-print" data-section="number-off-paper">'));
  assert.deepEqual(meta(label, '<div class="meta-row pt-number-strip no-print"'), [
    ["Format No.", "F/QC/06"],
    ["Rev No.", "00"],
    ["Rev Date", "01-Dec-2021"],
    ["Page No.", "1 of 1"],
  ]);
  assert.ok(!/<span class="k">Date<\/span>/.test(label), "the DATE cell DCRS added is gone (the owner, 16-Oct-2026)");
  assert.ok(!label.includes("(digital)"));
  // F/QC/25's revision is not given anywhere: the screen's strip says so; its paper prints no number, so nothing prints it.
  assert.equal(docOf("qc-coa-corrugated").revisionNo, "TO BE CONFIRMED");
  const cba = await sheet("qc-coa-corrugated", createDefaultData(docOf("qc-coa-corrugated"), DAY, master) as LogSheetData);
  assert.deepEqual(meta(cba, '<div class="meta-row pt-number-strip no-print"').slice(0, 3), [
    ["Format No.", "F/QC/25"],
    ["Rev No.", "TO BE CONFIRMED"],
    ["Page No.", "1 of 1"],
  ]);
  const strip = cba.slice(cba.indexOf('<div class="meta-row pt-number-strip no-print"'));
  assert.ok(!/Rev Date/.test(strip.slice(0, strip.indexOf('<div class="paper-body">'))), "no revision date to show");
  assert.ok(!cba.includes('<div class="meta-row">'), "no number row of DCRS's on the page");
});

test("the incoming records and F/QC/36 print the address at their foot, word for word; Flexo Ink its own, above its system line", async () => {
  for (const id of ["qc-bopp-film", "qc-paper-core", "qc-offset-ink", "qc-incoming-lamination-film", "qc-inspection-sb-lamination"]) {
    assert.deepEqual(layoutOf(id).notesAtFoot, ["308/9, GIDC, DEDIYASAN, MEHSANA, GUAJRAT, INDIA - 384002"], id);
  }
  assert.deepEqual(layoutOf("qc-flexo-ink").notesAtFoot, [
    "308/9 GIDC, DEDIYASAN, MEHSANA - 384002, GUJARAT, INDIA",
    "This is a system generated document with regulated access. It does not require a signature",
  ]);
  const html = await sheet("qc-paper-core", createDefaultData(docOf("qc-paper-core"), DAY, master) as LogSheetData);
  assert.match(html, /data-section="notes-at-foot"><p class="text-sm" style="white-space:pre-wrap"><strong>308\/9, GIDC, DEDIYASAN, MEHSANA, GUAJRAT, INDIA - 384002<\/strong><\/p><\/div>/);
});

test("a written date or time box prints its words: the date as the sheet writes dates, the time as written, the box itself not printed", async () => {
  const { printedBoxText, PRINTED_AS_TEXT, PRINT_BOX_TEXT } = await import("../src/utils/print");
  assert.equal(printedBoxText("date", "2026-10-14"), "14-Oct-2026");
  assert.equal(printedBoxText("time", "10:17"), "10:17");
  assert.equal(printedBoxText("date", ""), "");
  assert.equal(PRINTED_AS_TEXT, "print-as-text");
  assert.equal(PRINT_BOX_TEXT, "print-box-text");
  const printCss = Array.from(css.matchAll(/@media print \{([\s\S]*?)\n\}/g), (m) => m[1]).join("\n");
  assert.match(printCss, /input\.print-as-text \{ display: none; \}/);
});

test("F/QC/18's DRYING TEST stands over its two printed lines, the second unnumbered with its own OBSERVATION box; the lines after count on", async () => {
  const id = "qc-offset-ink";
  const layout = layoutOf(id);
  assert.deepEqual(layout.continuationLines, [6]);
  const data = createDefaultData(docOf(id), DAY, master) as LogSheetData;
  assert.equal(data.rows.length, 10);
  const html = await sheet(id, data, true);
  const rows = bodyRows(html);
  const at = rows.findIndex((r) => r.some((c) => text(c.html).includes("DRYING TEST")));
  assert.equal(at, 5);
  // The DRYING TEST line: its number and its parameter stand in the line, as the paper's table rules it (REQUIREMENTS §117: the
  // owner's PDF of F/QC/18 rules the second paragraph off under empty number and parameter cells).
  assert.doesNotMatch(rows[at][0].attrs, /rowSpan/i);
  assert.equal(text(rows[at][0].html).trim(), "6.");
  assert.doesNotMatch(rows[at][1].attrs, /rowSpan/i);
  // The "On Glass surface" line: the empty number and parameter cells, then its specification and its own observation box.
  assert.equal(rows[at + 1].length, 4);
  assert.equal(text(rows[at + 1][0].html).trim(), "");
  assert.equal(text(rows[at + 1][1].html).trim(), "");
  assert.ok(text(rows[at + 1][2].html).includes("On Glass surface"));
  assert.match(rows[at + 1][3].html, /data-bind="rows\/[^"]+\/observation"/);
  // ALKALI RESISTANCE is "7.", as printed.
  assert.equal(text(rows[at + 2][0].html).trim(), "7.");
  // A sample lot writes both observations.
  const sample = autoFillRecord(docOf(id), DAY, master, undefined)!.data as LogSheetData;
  assert.ok(String(sample.rows[5].observation).includes("thumb") && String(sample.rows[6].observation).includes("Solid dried"), JSON.stringify(sample.rows.slice(5, 7)));
});
