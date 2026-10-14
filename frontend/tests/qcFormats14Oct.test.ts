// THE OWNER'S FORMATS OF 14-OCT-2026 (REQUIREMENTS §111, part 8): F-QC-40.A, F-QC-40.B and F/QC/17, each against its
// original in source-documents/qc-originals-2026-10-13/ — the words, the boxes and their places, the columns, the printed
// lines and tolerances — as the sheet draws it; Demo Mode's and a sample day's data inside the paper's bands with
// today's dates and people of HR Master Data; and a Live record prepared with nothing but what is known.
import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import type { DocumentDefinition, LogSheetData, LogSheetLayout, MasterData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { hrMasterRepository, ensureSeeded as ensureHrMasterSeeded } from "../src/data/repositories/hrMasterRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { createDefaultData } from "../src/engine/recordDefaults";
import { autoFillRecord } from "../src/engine/autoFill";
import { prepareKnownParts } from "../src/engine/knownParts";
import { validateForSubmit } from "../src/engine/validation";
import { withComputedCells } from "../src/engine/computedCells";
import { outOfBandCount } from "../src/engine/printedBands";
import { matchDocuments } from "../src/engine/assistantLocal";
import { findDocument } from "../src/engine/mitraTools";
import { defaultResponsible } from "../src/engine/accessRules";
import { QC_GROUPS } from "../src/data/seed/qcModule";
import { COMPLIANCE_STATEMENTS, complianceValidUntil } from "../src/data/seed/complianceStatements";
import { COMPANY } from "../src/data/seed/masterData";

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
function recordOf(documentId: string, data: LogSheetData): RecordInstance<LogSheetData> {
  return {
    id: `fmt14-${documentId}`,
    documentId,
    periodKey: `${documentId}:${DAY}`,
    dueDate: DAY,
    status: "In Progress",
    isDemo: false,
    data,
    createdAt: `${DAY}T03:00:00.000Z`,
    updatedAt: `${DAY}T03:00:00.000Z`,
  } as RecordInstance<LogSheetData>;
}
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
const grid = (html: string) => between(html, 'class="compact log-sheet', "</table>");
const headings = (html: string) => Array.from(between(html, "<thead", "</thead>").matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g), (m) => text(m[1]).trim());
const sample = (id: string, day = DAY) => autoFillRecord(docOf(id), day, master, undefined)!.data as LogSheetData;
const live = (id: string) => prepareKnownParts(docOf(id), DAY, master, undefined)!.data as LogSheetData;
const hrNames = () => new Set(hrMasterRepository.all().map((p) => p.fullName));
const qcGroupOf = (id: string) => QC_GROUPS.find((g) => g.documentIds.includes(id))?.title;
const SLOTS_B = ["t0830", "t1230", "t1630", "t2030", "t0030", "t0430"];
const SLOTS_A = ["t0830", "t1230", "t1630"];

// ---------------------------------------------------------------------------
// F-QC-40.B — the sleeve division

test("F-QC-40.B: the sleeve division's TEMPERATURE MONITORING RECORD as its paper — its number, its line, its six readings with their signs", async () => {
  const id = "qc-temperature-sleeve";
  const doc = docOf(id);
  assert.deepEqual([doc.formatNo, doc.revisionNo, doc.revisionDate, doc.frequency, doc.schedule.type], ["F-QC-40.B", "00", "2025-02-28", "Daily", "daily"]);
  assert.equal(qcGroupOf(id), "Registers & Records");
  assert.deepEqual(defaultResponsible({ id, formatNo: doc.formatNo, department: "QC" }), ["ajay.zala@gpp.local"], "the owner's table: QC-40 A and B are Ajay Zala's");
  const layout = layoutOf(id);
  assert.equal(layout.paperTitle, "TEMPERATURE MONITORING RECORD");
  assert.deepEqual(layout.instructions, ["RECOMMENDED TEMPERATURE : SLEEVE DIVISION 28°C ± 2°C"]);
  for (const key of SLOTS_B) {
    const col = layout.columns.find((c) => c.key === key)!;
    assert.deepEqual([col.min, col.max, col.nominal, col.required], [26, 30, 28, true], `${key}: 28°C ± 2°C`);
    assert.equal(layout.columns.find((c) => c.beneath === key)?.key, `${key}Sign`, `${key}: its sign under it`);
  }
  const html = await sheet(id, createDefaultData(doc, DAY, master) as LogSheetData);
  assert.deepEqual(headings(html), ["SR NO", "DATE", "08:30 HRS TEMP. + SIGN", "12:30 HRS TEMP. + SIGN", "16:30 HRS TEMP. + SIGN", "20:30 HRS TEMP. + SIGN", "12:30am HRS TEMP. + SIGN", "04:30 HRS TEMP. + SIGN"]);
  assert.ok(text(html).includes("TEMPERATURE MONITORING RECORD") && text(html).includes("RECOMMENDED TEMPERATURE : SLEEVE DIVISION 28°C ± 2°C"));
  assert.ok(!text(html).includes("Sr. No."), "no Sr. No. of the sheet's");
});

test("F-QC-40.B: a sample day reads inside 26–30 °C, signed by the lab executives on shift; a Live day holds its date alone", async () => {
  const id = "qc-temperature-sleeve";
  const filled = sample(id);
  assert.equal(filled.rows.length, 1);
  const row = filled.rows[0];
  assert.equal(row.date, DAY);
  for (const key of SLOTS_B) assert.ok(typeof row[key] === "number" && (row[key] as number) >= 24 && (row[key] as number) <= 32, `${key}: ${row[key]}`);
  const signs = SLOTS_B.map((k) => String(row[`${k}Sign`]));
  assert.ok(signs.every((s) => hrNames().has(s)), signs.join(", "));
  assert.equal(new Set(signs.slice(0, 3)).size, 1, "the day's three, one tester");
  assert.equal(new Set(signs.slice(3)).size, 1, "the night's three, one tester");
  assert.notEqual(signs[0], signs[3], "the day's and the night's are two people");
  assert.deepEqual(validateForSubmit(docOf(id), recordOf(id, filled)).errors, []);
  // Live: the date and nothing observed.
  const known = live(id).rows[0];
  assert.equal(known.date, DAY);
  for (const key of SLOTS_B) {
    assert.ok(known[key] === null || known[key] === "", `${key} is the person's`);
    assert.equal(known[`${key}Sign`], "", `${key}'s sign is the person's`);
  }
  // A reading outside the paper's band is highlighted.
  const hot = { ...filled, rows: [{ ...row, t1230: 31 }] };
  assert.equal(outOfBandCount(layoutOf(id), hot), 1);
  assert.match(grid(await sheet(id, hot)), /class="cell-out-of-band"/);
});

// ---------------------------------------------------------------------------
// F-QC-40.A — the printing area, the ink kitchen and the ware house

test("F-QC-40.A: TEMPERATURE & HUMIDITY MONITORING RECORD as its paper — the recommended line, AREA and M/C NO., the table's own heading, three times", async () => {
  const id = "qc-temperature-humidity";
  const doc = docOf(id);
  assert.deepEqual([doc.formatNo, doc.revisionNo, doc.revisionDate, doc.frequency], ["F-QC-40.A", "02", "2026-07-01", "Daily"]);
  assert.deepEqual(defaultResponsible({ id, formatNo: doc.formatNo, department: "QC" }), ["ajay.zala@gpp.local"]);
  const layout = layoutOf(id);
  assert.equal(layout.paperTitle, "TEMPERATURE & HUMIDITY MONITORING RECORD");
  const area = layout.headerFields.find((f) => f.key === "area")!;
  assert.deepEqual(area.printedAbove, ["RECOMMENDED TEMPERATURE & HUMIDITY : 25°C ± 2°C / 45 ± 5%"]);
  assert.equal(area.label, "AREA:");
  assert.deepEqual(area.choicesAcross, ["PRINTING/", "INK KITCHEN/", "WARE HOUSE"]);
  assert.equal(layout.headerFields.find((f) => f.key === "machineNo")?.label, "M/C NO. :");
  assert.deepEqual(layout.instructions, ["MONITORING RECORD - TIME & SIGN."]);
  for (const key of SLOTS_A) {
    const t = layout.columns.find((c) => c.key === key)!;
    const hum = layout.columns.find((c) => c.key === `${key}Humidity`)!;
    assert.deepEqual([t.min, t.max, t.unit], [23, 27, "°C"], `${key}: 25°C ± 2°C`);
    assert.deepEqual([hum.min, hum.max, hum.unit], [40, 50, "%"], `${key}: 45 ± 5%`);
    assert.equal(t.group, hum.group);
    assert.equal(layout.columns.find((c) => c.beneath === key)?.key, `${key}Sign`);
  }
  // The sheet signed off: the paper's order — the recommended line, AREA with the area marked, M/C NO., then the
  // table's heading line, then the grid headed SR NO | DATE | 08:30 HRS | 12:30 HRS | 16:30 HRS on ONE heading row.
  const filled = sample(id);
  const html = await sheet(id, filled);
  const words = text(html);
  const at = (w: string) => {
    const i = words.indexOf(w);
    assert.ok(i >= 0, `the sheet says ${w}`);
    return i;
  };
  assert.ok(at("RECOMMENDED TEMPERATURE & HUMIDITY : 25°C ± 2°C / 45 ± 5%") < at("AREA:"));
  assert.ok(at("AREA:") < at("M/C NO. :") && at("M/C NO. :") < at("MONITORING RECORD - TIME & SIGN."));
  assert.ok(at("MONITORING RECORD - TIME & SIGN.") < at("08:30 HRS"));
  assert.match(html, /data-chosen=""[^>]*>PRINTING\//, "the printing area marked on the AREA line");
  const head = between(html, '<table class="compact log-sheet', "</thead>");
  assert.deepEqual(headings(head), ["SR NO", "DATE", "08:30 HRS", "12:30 HRS", "16:30 HRS"]);
  assert.equal((head.match(/<tr/g) ?? []).length, 1, "one heading row: the paper prints no heading under the time");
  assert.equal((head.match(/data-group-alone=""/g) ?? []).length, 3);
});

test("F-QC-40.A: a sample day is the printing area's at one of its presses, inside the bands and signed; Live leaves area, machine and readings to the person", async () => {
  const id = "qc-temperature-humidity";
  const filled = sample(id);
  assert.equal(filled.header.area, "PRINTING");
  assert.ok(["M-01", "M-47", "M-83"].includes(filled.header.machineNo), filled.header.machineNo);
  const row = filled.rows[0];
  assert.equal(row.date, DAY);
  for (const key of SLOTS_A) {
    assert.ok(typeof row[key] === "number" && (row[key] as number) >= 21 && (row[key] as number) <= 29, `${key}: ${row[key]}`);
    assert.ok(typeof row[`${key}Humidity`] === "number" && (row[`${key}Humidity`] as number) >= 36 && (row[`${key}Humidity`] as number) <= 54, `${key} humidity: ${row[`${key}Humidity`]}`);
    assert.ok(hrNames().has(String(row[`${key}Sign`])), `${key}: signed by ${row[`${key}Sign`]}`);
  }
  assert.deepEqual(validateForSubmit(docOf(id), recordOf(id, filled)).errors, []);
  const known = live(id);
  assert.deepEqual([known.header.area, known.header.machineNo], ["", ""]);
  assert.equal(known.rows[0].date, DAY);
  for (const key of SLOTS_A) assert.ok(known.rows[0][key] === null || known.rows[0][key] === "", key);
  // A humidity outside 45 ± 5% is highlighted, as a temperature outside 25 ± 2 °C is.
  const damp = { ...filled, rows: [{ ...row, t1230Humidity: 53, t1630: 28 }] };
  assert.equal(outOfBandCount(layoutOf(id), damp), 2);
  // The area is asked for: a sheet must say whose it is.
  const unmarked = { ...filled, header: { ...filled.header, area: "" } };
  assert.ok(validateForSubmit(docOf(id), recordOf(id, unmarked)).errors.some((e) => e.includes("AREA")));
});

// ---------------------------------------------------------------------------
// F/QC/17 — the measuring scale (ruler)

test("F/QC/17: the Measuring Scale (Ruler) Internal Verification Record as its paper — the two tables of details, the printed tolerance, the six points", async () => {
  const id = "qc-ruler-verification";
  const doc = docOf(id);
  assert.deepEqual([doc.formatNo, doc.revisionNo, doc.revisionDate, doc.schedule.type], ["F/QC/17", "00", "2021-12-01", "as-required"]);
  assert.equal(qcGroupOf(id), "Calibration");
  assert.deepEqual(defaultResponsible({ id, formatNo: doc.formatNo, department: "QC" }), ["kapila.barad@gpp.local"]);
  const layout = layoutOf(id);
  const tables = layout.headerFields.filter((f) => f.boxTable).map((f) => f.boxTable!);
  assert.deepEqual(
    tables.map((t) => [t.corner, t.rows]),
    [
      ["Master Measuring Scale (Ruler) Details", ["Make", "Serial number", "Range", "Least count", "Calibration date", "Calibration due date", "Calibration report number"]],
      ["Measuring Scale (Ruler) under calibration details", ["Make", "Serial number", "Range", "Least count", "Calibration date", "Calibration due date", "Accetable tolerance"]],
    ]
  );
  assert.equal(layout.headerFields.find((f) => f.key === "acceptableTolerance")?.printed, "+ / - 1 mm");
  assert.ok(layout.rowMode.kind === "fixedRows");
  assert.deepEqual(layout.rowMode.kind === "fixedRows" && layout.rowMode.rows.map((r) => r.masterReading), ["50 mm", "100 mm", "150 mm", "200 mm", "250 mm", "290 mm"]);
  const filled = sample(id);
  const html = await sheet(id, filled);
  const words = text(html);
  assert.ok(words.includes("Measuring Scale (Ruler) Internal Verification Record"), "the title in its own letters");
  assert.ok(words.indexOf("Master Measuring Scale (Ruler) Details") < words.indexOf("Measuring Scale (Ruler) under calibration details"));
  assert.match(html, /paper-box-table-across" colSpan="2">Master Measuring Scale \(Ruler\) Details/i);
  assert.ok(words.includes("+ / - 1 mm"));
  const g = grid(html);
  assert.deepEqual(headings(g), ["#", "Master calibrator reading", "Observed reading (mm)", "Difference", "Status (Pass/Fail)", "Calibration performed by"]);
  assert.equal((g.match(/rowSpan="6"/gi) ?? []).length, 2, "the Status and the name, one cell each down the six lines");
});

test("F/QC/17: the Difference is worked out and judged by the printed ± 1 mm, and the Status follows it", () => {
  const id = "qc-ruler-verification";
  const blank = createDefaultData(docOf(id), DAY, master) as LogSheetData;
  const read = (observed: number[]) => withComputedCells(id, { ...blank, rows: blank.rows.map((r, i) => ({ ...r, observed: observed[i] ?? null })) }) as LogSheetData;
  const exact = read([50, 100, 150, 200, 250, 290]);
  assert.deepEqual(exact.rows.map((r) => r.difference), ["0.0", "0.0", "0.0", "0.0", "0.0", "0.0"]);
  assert.equal(exact.rows[0].status, "Pass");
  const oneOff = read([50, 101, 150, 199, 250, 290]);
  assert.deepEqual(oneOff.rows.map((r) => r.difference), ["0.0", "1.0", "0.0", "-1.0", "0.0", "0.0"]);
  assert.equal(oneOff.rows[0].status, "Pass", "a millimetre is inside + / - 1 mm");
  assert.equal(outOfBandCount(layoutOf(id), oneOff), 0);
  const worn = read([50, 100, 152]);
  assert.equal(worn.rows[2].difference, "2.0");
  assert.equal(worn.rows[0].status, "Fail", "a point outside the tolerance fails the ruler, before the rest are read");
  assert.equal(outOfBandCount(layoutOf(id), worn), 1);
  const half = read([50, 100]);
  assert.equal(half.rows[0].status ?? "", "", "no verdict while points are still to read");
});

test("F/QC/17: a sample verification is today's, never the page of 2024; a Live record holds the master's identity, the date and the printed tolerance alone", () => {
  const id = "qc-ruler-verification";
  const filled = sample(id);
  const hd = filled.header;
  assert.deepEqual([hd.masterMake, hd.masterSerialNo, hd.masterRange, hd.masterLeastCount], ["Kristeen", "QC-44", "0 - 600 mm", "1 mm"]);
  assert.deepEqual([hd.masterCalibrationDate, hd.masterCalibrationDueDate, hd.masterCalibrationReportNo], ["2026-09-23", "2027-09-22", "CAL/LPI/GP-23/25"]);
  assert.deepEqual([hd.make, hd.serialNo, hd.calibrationDate, hd.calibrationDueDate, hd.acceptableTolerance], ["Ajanta", "GP-3/MS/04", DAY, "2027-10-13", "+ / - 1 mm"]);
  assert.ok(!JSON.stringify(filled).includes("2024") && !JSON.stringify(filled).includes("2025-09"), "no date of the supplied page");
  assert.equal(filled.rows.length, 6);
  assert.ok(filled.rows.every((r, i) => Math.abs((r.observed as number) - [50, 100, 150, 200, 250, 290][i]) <= 1));
  assert.equal(filled.rows[0].status, "Pass");
  assert.ok(hrNames().has(String(filled.rows[0].performedBy)), String(filled.rows[0].performedBy));
  assert.ok(filled.rows.slice(1).every((r) => r.status === "" && r.performedBy === ""), "one Status, one name: the first line's");
  assert.deepEqual(validateForSubmit(docOf(id), recordOf(id, filled)).errors, []);
  // A day before the master's September calibration takes the year before's certificate.
  const spring = sample(id, "2026-04-06").header;
  assert.deepEqual([spring.masterCalibrationDate, spring.masterCalibrationDueDate], ["2025-09-23", "2026-09-22"]);
  // Live.
  const known = live(id);
  assert.deepEqual(
    Object.fromEntries(Object.entries(known.header).filter(([, v]) => String(v ?? "") !== "")),
    { masterMake: "Kristeen", masterSerialNo: "QC-44", masterRange: "0 - 600 mm", masterLeastCount: "1 mm", calibrationDate: DAY, acceptableTolerance: "+ / - 1 mm" }
  );
  assert.ok(known.rows.every((r) => (r.observed === null || r.observed === "") && r.status === "" && r.performedBy === "" && r.difference === ""));
});

// ---------------------------------------------------------------------------
// F/QC-10 — the shrink sleeves' Statement of Compliance

test("F/QC-10: the Statement of Compliance for shrink sleeves as the document prints it, read like the other two", () => {
  const id = "soc-shrink-sleeves";
  const doc = docOf(id);
  assert.deepEqual([doc.kind, doc.formatNo, doc.revisionNo, doc.revisionDate, doc.isReferenceOnly], ["compliance-statement", "F/QC-10", "00", "2021-12-01", true]);
  assert.equal(qcGroupOf(id), "Quality — Compliance");
  const s = COMPLIANCE_STATEMENTS[id];
  assert.equal(s.headerTitle, "STATEMENT OF COMPLIANCE – SHRINK SLEEVES");
  assert.equal(s.footerRef, "F/QC-10 (Rev – 00 / 01.12.2021)");
  assert.equal(s.referenceSource, "BRC Global Standard for Packaging and Packaging Materials");
  assert.deepEqual(
    s.sections.map((x) => x.label),
    ["Manufacturer:", "Address:", "Product:", "Raw materials used", "Manufacturing process", "Subcontracted / Outsource manufacturing", "Function or known uses:", "Specification for use:", "Usable life", "Storage condition", "Regulatory requirements", "Country of Sale", "Post-consumer recycling"]
  );
  const lines = (label: string) => s.sections.find((x) => x.label === label)!.lines;
  assert.deepEqual(lines("Manufacturer:"), [COMPANY.name]);
  assert.deepEqual(lines("Raw materials used"), ["• PVC Cast Film, PVC Blown film, PET Film", "• Ink", "• Solvent", "• Cold Foil", "• Coil Foil adhesive", "• Glue", "• UV Varnish"]);
  assert.equal(lines("Specification for use:").filter((l) => l.startsWith("✓ ")).length, 4);
  assert.ok(lines("Specification for use:").includes("Usable for packers of products max up to 30 Deg C."));
  assert.deepEqual(lines("Usable life"), ["6 months from the date of manufacturing if stored at ambient temperature & maximum up to 30 Deg C"]);
  assert.equal(s.declarations.length, 7);
  assert.ok(s.declarations[0].startsWith(`${COMPANY.name}, hereby declares`) && s.declarations[3].startsWith("Shrink Sleeves have to be kept"));
  assert.deepEqual([s.signedBy, s.signedTitle, s.signedOn, complianceValidUntil(s)], ["Shail Patel", "CEO", "2025-04-01", "2027-04-01"]);
  for (const q of ["F QC 10", "FQC10", "F/QC/10", "f-qc-10", "F/QC-10"]) {
    assert.deepEqual(matchDocuments(q.toLowerCase()), [id], q);
    assert.equal(findDocument(q)?.id, id, q);
  }
  assert.deepEqual(matchDocuments("open the soc for sleeves"), [id]);
  assert.deepEqual(matchDocuments("show me the pouch soc"), ["soc-flexible-packaging"], "never the sleeves' for the pouches'");
});

// ---------------------------------------------------------------------------
// Mitra and Search find each by its number and its words

test("Mitra finds the three by their numbers and words; the number without its letter and 'temperature monitoring' name the three of F-QC-40", () => {
  for (const q of ["F QC 17", "FQC17", "F/QC/17", "f-qc-17", "qc 17"]) assert.equal(findDocument(q)?.id, "qc-ruler-verification", q);
  for (const q of ["F-QC-40.A", "F QC 40 A", "fqc40a", "F/QC/40A"]) assert.equal(findDocument(q)?.id, "qc-temperature-humidity", q);
  for (const q of ["F-QC-40.B", "F QC 40 B", "fqc40b"]) assert.equal(findDocument(q)?.id, "qc-temperature-sleeve", q);
  assert.equal(findDocument("F-QC-40.C")?.id, "qc-temperature");
  const three = ["qc-temperature", "qc-temperature-humidity", "qc-temperature-sleeve"];
  assert.deepEqual(matchDocuments("open f-qc-40").sort(), three);
  assert.deepEqual(matchDocuments("open the temperature monitoring record").sort(), three);
  assert.deepEqual(matchDocuments("fill the sleeve division temperature"), ["qc-temperature-sleeve"]);
  assert.deepEqual(matchDocuments("open hot room temperature monitoring"), ["qc-temperature"]);
  assert.deepEqual(matchDocuments("temperature and humidity monitoring for the ink kitchen"), ["qc-temperature-humidity"]);
  assert.deepEqual(matchDocuments("open the ruler verification record"), ["qc-ruler-verification"]);
  assert.deepEqual(matchDocuments("weighing scale calibration"), ["qc-weight-scale-calibration"], "F/QC/12's scale is not the ruler");
});
