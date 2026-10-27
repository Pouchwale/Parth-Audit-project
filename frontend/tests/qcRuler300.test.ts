// F/QC/17'S SECOND PAGE, THE 300 MM SCALE'S (REQUIREMENTS §117, the owner, 17-Oct-2026, with a new PDF: "this PDF is for
// QC17 for 300mm. So add this also."). The plant verifies two scales against the master scale and each has its own page of
// the one format: the 600 mm scale's (supplied 14-Oct-2026, qc-ruler-verification) and the 300 mm scale's
// (qc-ruler-verification-300). The two pages are the same in every line but the scale's Serial number (GP-3/MS/04,
// GP-3/MS/42) and Range (0-600 mm, 0-300 mm). This file holds:
//   * both documents are the same format, told apart by their names, and wired alike (department, who answers, group,
//     download kind, the owner's PDF and its picture on disk);
//   * both layouts come from ONE definition (data/seed/qcRulerVerificationLayouts.ts) and differ in nothing but the
//     starting Serial number and Range and the page each is shown against; the 600 mm document is exactly what it was;
//   * the paper's words and boxes on the sheet, editable, on a portrait A4 page, the title the paper's;
//   * a new record starts as its paper's blank with its standards, and is written as the last record OF ITS OWN document;
//   * the Difference and the Status work the same; a sample day is its own scale's; Mitra names each by its length.
// Run: npm run test:unit -- qcRuler300
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import type { DocumentDefinition, LogSheetData, LogSheetLayout, MasterData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrMasterSeeded } from "../src/data/repositories/hrMasterRepository";
import { recordRepository } from "../src/data/repositories/recordRepository";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import {
  QC_RULER_VERIFICATION_LAYOUTS,
  RULER_300_ID,
  RULER_600_ID,
  RULER_PAPER_TITLE,
  RULER_SCALES,
  RULER_VERIFICATION_IDS,
  isRulerVerification,
  rulerScaleOf,
  rulerVerificationLayout,
} from "../src/data/seed/qcRulerVerificationLayouts";
import { departmentOfDocument } from "../src/data/seed/documentDepartments";
import { QC_GROUPS } from "../src/data/seed/qcModule";
import { createDefaultData } from "../src/engine/recordDefaults";
import { createRecordForDocument } from "../src/engine/recordCrud";
import { autoFillRecord } from "../src/engine/autoFill";
import { prepareKnownParts } from "../src/engine/knownParts";
import { validateForSubmit } from "../src/engine/validation";
import { withComputedCells } from "../src/engine/computedCells";
import { outOfBandCount } from "../src/engine/printedBands";
import { matchDocuments } from "../src/engine/assistantLocal";
import { findDocument } from "../src/engine/mitraTools";
import { defaultResponsible } from "../src/engine/accessRules";
import { documentFileKind } from "../src/utils/documentExport";

// store/router.tsx reads window.location the moment it loads; the harness stands up none.
if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "#/dashboard", hostname: "localhost" }, configurable: true, writable: true });
}

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrMasterSeeded();
const master: MasterData = masterRepository.get();
const DAY = "2026-10-17";
const ROOT = process.cwd();
const BOTH = [RULER_600_ID, RULER_300_ID];

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
const pageSrc = (page: string | { src: string }): string => (typeof page === "string" ? page : page.src);
const data = (r: RecordInstance): LogSheetData => r.data as LogSheetData;
const clear = () => BOTH.forEach((id) => recordRepository.query({ documentId: id }).forEach((r) => recordRepository.remove(r.id)));

function recordOf(documentId: string, d: LogSheetData): RecordInstance<LogSheetData> {
  return {
    id: `r300-${documentId}`,
    documentId,
    periodKey: `${documentId}:${DAY}`,
    dueDate: DAY,
    status: "In Progress",
    isDemo: false,
    data: d,
    createdAt: `${DAY}T03:00:00.000Z`,
    updatedAt: `${DAY}T03:00:00.000Z`,
  } as RecordInstance<LogSheetData>;
}
async function sheet(documentId: string, d: LogSheetData, editable = false): Promise<string> {
  const [view, auth, store, router] = await Promise.all([
    import("../src/components/records/LogSheetRecordView"),
    import("../src/store/AuthContext"),
    import("../src/store/AppStore"),
    import("../src/store/router"),
  ]);
  return renderToStaticMarkup(
    h(auth.AuthProvider, null, h(store.AppStoreProvider, null, h(router.RouterProvider, null, h(view.LogSheetRecordView, { doc: docOf(documentId), record: recordOf(documentId, d), editable, onChange: () => undefined }))))
  );
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/\s+/g, " ");
const titleOf = (html: string) => {
  // The page's title: the header block's, or (F/QC/17 drawn as its paper's own table since §117 round 2 of 22-Oct-2026)
  // the head's underlined row.
  const m = /class="doc-title"[^>]*>([\s\S]*?)<\/div>/.exec(html) ?? /<td class="pt-c[^"]* pt-u"[^>]*>([\s\S]*?)<\/td>/.exec(html);
  assert.ok(m, "the sheet has its title");
  return text(m![1]).trim();
};
// A box's value is an input's value on the sheet; a printed line's words are its text.
const shows = (html: string, value: string) => html.includes(`value="${value}"`) || text(html).includes(value);
const blank = (id: string) => createDefaultData(docOf(id), DAY, master) as LogSheetData;
const live = (id: string) => prepareKnownParts(docOf(id), DAY, master, undefined)!.data as LogSheetData;
const sample = (id: string, day = DAY) => autoFillRecord(docOf(id), day, master, undefined)!;

// ---------------------------------------------------------------------------

test("F/QC/17 is two documents, the 600 mm scale's and the 300 mm scale's: one format, two names, wired alike", () => {
  const a = docOf(RULER_600_ID);
  const b = docOf(RULER_300_ID);
  assert.deepEqual(RULER_VERIFICATION_IDS, BOTH);
  assert.ok(BOTH.every(isRulerVerification) && !isRulerVerification("qc-weight-scale-calibration") && !isRulerVerification(undefined));
  // The same format in every printed number: the header of both pages is F/QC/17 (00/01.12.2021).
  for (const d of [a, b]) assert.deepEqual([d.formatNo, d.revisionNo, d.revisionDate, d.frequency, d.schedule.type, d.kind, d.section, d.module, d.status], ["F/QC/17", "00", "2021-12-01", "As Required", "as-required", "log-sheet", "Calibration", "Quality Control — Inspection Records", "Configured"]);
  // Told apart in the library, the assistant and the master list by the scale.
  assert.equal(a.name, "Measuring Scale (Ruler) Internal Verification Record — 600 mm");
  assert.equal(b.name, "Measuring Scale (Ruler) Internal Verification Record — 300 mm");
  // The same department, group, person and role, and the same download.
  for (const d of [a, b]) {
    assert.equal(departmentOfDocument(d.id, d.formatNo), "QC", d.id);
    assert.equal(QC_GROUPS.find((g) => g.documentIds.includes(d.id))?.title, "Calibration", d.id);
    assert.deepEqual(defaultResponsible({ id: d.id, formatNo: d.formatNo, department: "QC" }), ["kapila.barad@gpp.local"], d.id);
    assert.equal(master.documentRoleKeywords[d.id], "Internal Calibration", d.id);
    assert.equal(documentFileKind(d), "xlsx", `${d.id}: downloads as a workbook, as F/QC/17 always has`);
  }
  // The owner's PDF of the 300 mm scale is on file, cited, and its picture is the one the sheet's "Show original" opens.
  assert.match(b.sourceFile ?? "", /F-QC-17-Updated Scale \(Ruler\) internal verification record-300\.pdf/);
  assert.ok(existsSync(path.join(ROOT, "source-documents", "Copy of F-QC-17-Updated Scale (Ruler) internal verification record-300.pdf")), "the PDF is in source-documents");
  for (const id of BOTH) {
    const pages = layoutOf(id).originalPages ?? [];
    assert.equal(pages.length, 1, id);
    assert.ok(existsSync(path.join(ROOT, "frontend", "public", pageSrc(pages[0]))), `${id}: ${pageSrc(pages[0])} is on disk`);
  }
  assert.notEqual(pageSrc(layoutOf(RULER_600_ID).originalPages![0]), pageSrc(layoutOf(RULER_300_ID).originalPages![0]), "each is shown its own page");
});

test("both layouts come from one definition and differ only in the two starting values, the six points and the page each is shown against", () => {
  for (const scale of RULER_SCALES) {
    assert.deepEqual(QC_RULER_VERIFICATION_LAYOUTS[scale.documentId], rulerVerificationLayout(scale), `${scale.documentId} is what the one function builds`);
    assert.deepEqual(getLogSheetLayout(scale.documentId), rulerVerificationLayout(scale), `${scale.documentId} is registered as built`);
  }
  assert.equal(rulerScaleOf(RULER_300_ID)?.serialNo, "GP-3/MS/42");
  assert.equal(rulerScaleOf(RULER_300_ID)?.range, "0-300 mm");
  assert.equal(rulerScaleOf("qc-gsm-plate-calibration"), undefined);
  // Equal but for the document id, the two starting values and the page: every box, column, line, width and rule.
  const neutral = (l: LogSheetLayout) => {
    const copy = JSON.parse(JSON.stringify(l)) as LogSheetLayout;
    copy.documentId = "";
    copy.specimenSource = "";
    copy.originalPages = [];
    for (const f of copy.headerFields) if (f.key === "serialNo" || f.key === "range") delete f.autoFill;
    // Each scale's own six points (the 600 mm page's updated on 27-Oct-2026), and the 600 mm page's former ones.
    if (copy.rowMode.kind === "fixedRows") copy.rowMode = { ...copy.rowMode, rows: [] };
    delete copy.formerRows;
    return copy;
  };
  assert.deepEqual(neutral(layoutOf(RULER_300_ID)), neutral(layoutOf(RULER_600_ID)));
  // The two values.
  const box = (id: string, key: string) => layoutOf(id).headerFields.find((f) => f.key === key)!;
  assert.equal(box(RULER_300_ID, "serialNo").autoFill?.default, "GP-3/MS/42");
  assert.equal(box(RULER_300_ID, "range").autoFill?.default, "0-300 mm");
  assert.equal(box(RULER_600_ID, "serialNo").autoFill?.default, "GP-3/MS/36", "the 600 mm document starts with its own scale's serial, as its updated page prints it (the owner, 27-Oct-2026)");
  assert.equal(box(RULER_600_ID, "range").autoFill?.default, "0-600mm");
  assert.deepEqual(rulerScaleOf(RULER_600_ID)?.points, [100, 200, 300, 400, 500, 590]);
  assert.deepEqual(rulerScaleOf(RULER_300_ID)?.points, [50, 100, 150, 200, 250, 290]);
  assert.deepEqual(layoutOf(RULER_600_ID).formerRows, [[50, 100, 150, 200, 250, 290].map((mm) => ({ masterReading: `${mm} mm` }))], "the page of 14-Oct-2026's points");
  assert.equal(layoutOf(RULER_300_ID).formerRows, undefined);
  // The same print settings, editable boxes, carry-forward and no Date cell of the sheet's own.
  for (const id of BOTH) {
    const l = layoutOf(id);
    assert.equal(l.paper, "portrait", id);
    assert.equal(l.titleAsPrinted, true);
    assert.equal(l.paperTitle, RULER_PAPER_TITLE);
    assert.equal(l.carryForwardAll, true);
    assert.ok(l.headerFields.every((f) => f.printed === undefined && !f.computed), `${id}: every box is the person's to write over`);
    assert.ok(l.columns.filter((c) => c.key !== "difference").every((c) => !c.fixed && !c.computed), `${id}: every cell but the worked-out Difference is editable`);
    assert.equal(l.headerFields.find((f) => f.key === "acceptableTolerance")?.autoFill?.default, "+ / - 1 mm");
    // The ruler's certificate dates the owner gave (27-Oct-2026): 23-09-26 and 22-09-27, editable, the later date kept.
    assert.deepEqual(l.headerFields.find((f) => f.key === "calibrationDate")?.autoFill, { default: "2026-09-23", newest: true }, id);
    assert.deepEqual(l.headerFields.find((f) => f.key === "calibrationDueDate")?.autoFill, { default: "2027-09-22", newest: true }, id);
  }
});

test("the 300 mm sheet is the paper: its title in its own letters, the two tables, the six points, GP-3/MS/42 and 0-300 mm — and the 600 mm sheet its updated page", async () => {
  const wide = await sheet(RULER_600_ID, blank(RULER_600_ID));
  const narrow = await sheet(RULER_300_ID, blank(RULER_300_ID));
  // The printed title stays the paper's on both; the name's scale is not printed on the sheet.
  assert.equal(titleOf(wide), RULER_PAPER_TITLE);
  assert.equal(titleOf(narrow), RULER_PAPER_TITLE);
  for (const [html, id] of [[wide, RULER_600_ID], [narrow, RULER_300_ID]] as const) {
    assert.match(html, /class="paper-sheet[^"]*"[^>]*data-paper="portrait"/);
    const words = text(html);
    for (const w of ["Master Measuring Scale (Ruler) Details", "Measuring Scale (Ruler) under calibration details", "Accetable tolerance", "Calibration report number", "Master calibrator reading", "Observed reading (mm)", "Status (Pass/Fail)", "Calibration performed by", "F/QC/17"]) {
      assert.ok(words.includes(w), w);
    }
    for (const mm of rulerScaleOf(id)!.points) assert.ok(shows(html, `${mm} mm`), `${id}: ${mm} mm`);
    assert.ok(shows(html, "+ / - 1 mm"), "the paper's tolerance starts its box");
    assert.ok(shows(html, "Kristeen") && shows(html, "QC-44") && shows(html, "0 - 600 mm") && shows(html, "1 mm"), "the master scale's identity");
  }
  assert.ok(shows(narrow, "GP-3/MS/42") && shows(narrow, "0-300 mm"), "the 300 mm paper's two values start its boxes");
  assert.ok(!shows(narrow, "GP-3/MS/36") && !shows(narrow, "0-600mm"), "and none of the other page's");
  assert.ok(shows(wide, "GP-3/MS/36") && shows(wide, "0-600mm") && !shows(wide, "GP-3/MS/42") && !shows(wide, "0-300 mm"), "the 600 mm document starts those two boxes with its updated page's values, and none of the other page's");
  // (Its specimen note names the old page's "50 to 290 mm", so the lines themselves are read.)
  assert.ok(!blank(RULER_600_ID).rows.some((r) => r.masterReading === "290 mm") && shows(wide, "590 mm"), "the 600 mm page's own last point");
  // The boxes are editable inputs holding the paper's words as their start.
  const editable = await sheet(RULER_300_ID, blank(RULER_300_ID), true);
  assert.ok(editable.includes('<input') && editable.includes('value="GP-3/MS/42"'), "an input, not words");
  assert.ok(shows(editable, "GP-3/MS/42") && shows(editable, "0-300 mm") && shows(editable, "+ / - 1 mm") && shows(editable, "Kristeen"), "editable boxes start with the paper's words");
});

test("a new record starts as its paper's blank with its standards: the master's identity, the day, the tolerance, and for the 300 mm paper its two values", () => {
  clear();
  // The ruler's certificate dates the owner gave (27-Oct-2026) are standing values: on the blank as on the started record.
  const standard = { masterMake: "Kristeen", masterSerialNo: "QC-44", masterRange: "0 - 600 mm", masterLeastCount: "1 mm", calibrationDate: "2026-09-23", calibrationDueDate: "2027-09-22", acceptableTolerance: "+ / - 1 mm" };
  const written = (d: LogSheetData) => Object.fromEntries(Object.entries(d.header).filter(([, v]) => String(v ?? "") !== ""));
  assert.deepEqual(written(live(RULER_600_ID)), { ...standard, serialNo: "GP-3/MS/36", range: "0-600mm" }, "the 600 mm document: its own scale's two values start the boxes, as the 300 mm one's do");
  assert.deepEqual(written(live(RULER_300_ID)), { ...standard, serialNo: "GP-3/MS/42", range: "0-300 mm" });
  assert.deepEqual(written(blank(RULER_300_ID)), { ...standard, serialNo: "GP-3/MS/42", range: "0-300 mm" }, "the paper's blank holds the same: nothing of the day is in the ruler's boxes any more");
  for (const id of BOTH) {
    const rows = live(id).rows;
    assert.deepEqual(rows.map((r) => r.masterReading), rulerScaleOf(id)!.points.map((mm) => `${mm} mm`), id);
    assert.ok(rows.every((r) => (r.observed === null || r.observed === "") && r.status === "" && r.performedBy === "" && r.difference === ""), `${id}: nothing observed is written`);
  }
});

test("a new record is written as the last record OF ITS OWN document: the two never carry into each other", () => {
  clear();
  const d600 = docOf(RULER_600_ID);
  const d300 = docOf(RULER_300_ID);
  const fill = (record: RecordInstance, over: Record<string, string>, readings: number[], who: string) => {
    const d = data(record);
    recordRepository.upsert({
      ...record,
      status: "In Progress",
      data: { header: { ...d.header, ...over }, rows: d.rows.map((r, i) => ({ ...r, observed: readings[i], status: i === 0 ? "Pass" : "", performedBy: i === 0 ? who : "" })) },
    });
  };
  const first600 = createRecordForDocument(d600, { dateISO: "2026-09-23" }).record;
  fill(first600, { make: "Ajanta", serialNo: "GP-3/MS/36", range: "0-600mm", masterCalibrationReportNo: "CAL/600" }, [100, 200, 300, 400, 500, 590], "Roshni");
  // The 300 mm document has no record of its own yet: it does NOT take the 600 mm document's.
  const first300 = createRecordForDocument(d300, { dateISO: "2026-09-24" }).record;
  assert.equal(data(first300).header.make, "", "nothing of the other document's");
  assert.equal(data(first300).header.masterCalibrationReportNo, "");
  assert.equal(data(first300).header.serialNo, "GP-3/MS/42", "the paper's own starting value");
  assert.equal(data(first300).rows[0].performedBy, "");
  fill(first300, { make: "Ajanta", serialNo: "GP-3/MS/42", range: "0-300 mm", masterCalibrationReportNo: "CAL/300" }, [50, 101, 150, 200, 250, 290], "Kapila Barad");
  // The next of each is the last of its own, dated the new day.
  const next300 = createRecordForDocument(d300, { dateISO: "2026-10-17" }).record;
  assert.equal(data(next300).header.masterCalibrationReportNo, "CAL/300");
  assert.equal(data(next300).header.serialNo, "GP-3/MS/42");
  assert.equal(data(next300).header.calibrationDate, "2026-09-23", "the ruler's certificate date (27-Oct-2026), not the day");
  assert.deepEqual(data(next300).rows.map((r) => r.observed), [50, 101, 150, 200, 250, 290], "the 300 mm record's own readings");
  assert.equal(data(next300).rows[1].difference, "1.0", "worked out again");
  assert.equal(data(next300).rows[0].performedBy, "Kapila Barad");
  assert.equal(data(next300).header.acceptableTolerance, "+ / - 1 mm");
  const next600 = createRecordForDocument(d600, { dateISO: "2026-10-17" }).record;
  assert.equal(data(next600).header.masterCalibrationReportNo, "CAL/600");
  assert.equal(data(next600).header.serialNo, "GP-3/MS/36", "the 600 mm scale's own record carries its own writing");
  assert.deepEqual(data(next600).rows.map((r) => r.observed), [100, 200, 300, 400, 500, 590]);
  assert.equal(data(next600).rows[0].performedBy, "Roshni");
  assert.ok(data(next300).rows.every((r, i) => r.id !== data(first300).rows[i].id), "its own lines");
  // The morning prepare of each says the same.
  const p300 = prepareKnownParts(d300, "2026-11-17", master, undefined);
  assert.ok(p300);
  assert.equal((p300!.data as LogSheetData).header.masterCalibrationReportNo, "CAL/300");
  assert.match(p300!.notes[0], /Written as the sheet of 17-10-26 was/);
  clear();
});

test("the Difference is worked out and judged by the printed ± 1 mm on the 300 mm paper as on the 600 mm one, and the Status follows it", () => {
  for (const id of BOTH) {
    const read = (observed: number[]) => withComputedCells(id, { ...blank(id), rows: blank(id).rows.map((r, i) => ({ ...r, observed: observed[i] ?? null })) }) as LogSheetData;
    const pts = [...rulerScaleOf(id)!.points];
    const exact = read(pts);
    assert.deepEqual(exact.rows.map((r) => r.difference), ["0.0", "0.0", "0.0", "0.0", "0.0", "0.0"], id);
    assert.equal(exact.rows[0].status, "Pass", id);
    const oneOff = read(pts.map((p, i) => (i === 1 ? p + 1 : i === 3 ? p - 1 : p)));
    assert.deepEqual(oneOff.rows.map((r) => r.difference), ["0.0", "1.0", "0.0", "-1.0", "0.0", "0.0"], id);
    assert.equal(oneOff.rows[0].status, "Pass", `${id}: a millimetre is inside + / - 1 mm`);
    assert.equal(outOfBandCount(layoutOf(id), oneOff), 0);
    const worn = read([pts[0], pts[1], pts[2] + 2]);
    assert.equal(worn.rows[2].difference, "2.0", id);
    assert.equal(worn.rows[0].status, "Fail", id);
    assert.equal(outOfBandCount(layoutOf(id), worn), 1);
    // The person may write the master's own readings over the printed points; the Difference follows what is written.
    const own = withComputedCells(id, { ...blank(id), rows: blank(id).rows.map((r, i) => (i === 0 ? { ...r, masterReading: `${pts[0] - 2} mm`, observed: pts[0] } : r)) }) as LogSheetData;
    assert.equal(own.rows[0].difference, "2.0", id);
  }
});

test("a sample verification of each is its own scale's and today's, never the page of 2024; the 600 mm sample its updated page's", () => {
  const wide = sample(RULER_600_ID);
  const narrow = sample(RULER_300_ID);
  const w = (wide.data as LogSheetData).header;
  const n = (narrow.data as LogSheetData).header;
  assert.deepEqual([w.make, w.serialNo, w.range, w.leastCount], ["Ajanta", "GP-3/MS/36", "0-600mm", "1 mm"], "the 600 mm sample: its updated page's scale (27-Oct-2026)");
  assert.deepEqual([n.make, n.serialNo, n.range, n.leastCount], ["Ajanta", "GP-3/MS/42", "0-300 mm", "1 mm"]);
  for (const h2 of [w, n]) {
    assert.deepEqual([h2.masterMake, h2.masterSerialNo, h2.masterRange, h2.masterLeastCount], ["Kristeen", "QC-44", "0 - 600 mm", "1 mm"]);
    assert.deepEqual([h2.masterCalibrationDate, h2.masterCalibrationDueDate, h2.masterCalibrationReportNo], ["2026-09-23", "2027-09-22", "CAL/LPI/GP-23/25"]);
    assert.deepEqual([h2.calibrationDate, h2.calibrationDueDate, h2.acceptableTolerance], [DAY, "2027-10-16", "+ / - 1 mm"]);
  }
  for (const [result, id] of [[wide, RULER_600_ID], [narrow, RULER_300_ID]] as const) {
    const d = result.data as LogSheetData;
    assert.ok(!JSON.stringify(d).includes("2024") && !JSON.stringify(d).includes("2025-09"), `${id}: no date of the supplied page`);
    assert.equal(d.rows.length, 6);
    assert.ok(d.rows.every((r, i) => Math.abs((r.observed as number) - rulerScaleOf(id)!.points[i]) <= 1), id);
    assert.equal(d.rows[0].status, "Pass", id);
    assert.deepEqual(validateForSubmit(docOf(id), recordOf(id, d)).errors, [], id);
    assert.ok(result.notes.some((line) => line.includes("Verified Ajanta") && line.includes(id === RULER_300_ID ? "GP-3/MS/42" : "GP-3/MS/36")), `${id}: the summary names its own scale`);
  }
});

test("Mitra finds each by its scale's length and the two by the words both answer to; a number names both and never one", () => {
  const both = [...BOTH].sort();
  for (const q of ["open the ruler verification record", "ruler calibration", "the measuring scale", "F/QC/17", "f qc 17", "qc 17"]) {
    assert.deepEqual(matchDocuments(q.toLowerCase()).sort(), both, q);
    assert.equal(findDocument(q), undefined, `${q}: two documents, so Mitra asks which`);
  }
  for (const q of ["open the 300 mm ruler verification record", "300mm ruler", "ruler verification 300 mm", "the 300 mm measuring scale", "ruler 300 mm"]) {
    assert.deepEqual(matchDocuments(q.toLowerCase()), [RULER_300_ID], q);
    assert.equal(findDocument(q)?.id, RULER_300_ID, q);
  }
  for (const q of ["open the 600 mm ruler verification record", "600mm ruler", "ruler verification 600 mm", "the 600 mm measuring scale", "ruler 600 mm"]) {
    assert.deepEqual(matchDocuments(q.toLowerCase()), [RULER_600_ID], q);
    assert.equal(findDocument(q)?.id, RULER_600_ID, q);
  }
  assert.equal(findDocument(RULER_300_ID)?.id, RULER_300_ID, "by its id");
  assert.equal(findDocument("Measuring Scale (Ruler) Internal Verification Record — 300 mm")?.id, RULER_300_ID, "by its name");
  assert.deepEqual(matchDocuments("weighing scale calibration"), ["qc-weight-scale-calibration"], "F/QC/12's scale is not the ruler");
});
