// EVERY QC FORMAT EXACTLY AS THE PAPER, THE REST OF THEM (REQUIREMENTS §111, 13-Oct-2026).
//
// qcPaperFormats.test.ts holds the layout abilities and the four documents the owner named. This file holds
// the other Quality Control formats, each against its original in source-documents/qc-originals-2026-10-13/ (or
// the older paper its layout's specimenSource names): the paper's columns in order, its headings, the text it
// prints and where, and nothing of DCRS's own printed on it. And what Demo Mode and Mitra's sample fill write
// on them looks like a real day's paper (rule 3 of the brief), never a Live record's.
import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import type { DocumentDefinition, LogSheetData, LogSheetLayout, MasterData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrMasterSeeded } from "../src/data/repositories/hrMasterRepository";
import { getIssuedLogSheetLayout, getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { dropFormatEdit, saveFormatEdit } from "../src/data/formatEdits";
import { createDefaultData } from "../src/engine/recordDefaults";
import { autoFillRecord } from "../src/engine/autoFill";
import { prepareKnownParts } from "../src/engine/knownParts";
import { validateForSubmit } from "../src/engine/validation";
import { clockFace } from "../src/engine/lineClearanceSample";
import { documentTextIn } from "../src/i18n/documentText";
import { SEED_HISTORICAL_RECORDS } from "../src/data/seed/historicalRecords";
import { findDocuments } from "../src/engine/documentFinder";
import { matchDocuments } from "../src/engine/assistantLocal";

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

function recordOf(documentId: string, data: LogSheetData): RecordInstance<LogSheetData> {
  return {
    id: `paper-${documentId}`,
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
/** The words printed above the grid, in the card that holds the paper's printed lines and its boxes. */
const printedAbove = (layout: LogSheetLayout) => layout.instructions ?? [];

// ---------------------------------------------------------------------------
// 1. F/QC/15-A to F/QC/15-G, the area line clearance reports

const CLEARANCES: Record<string, { area: string; machineBox: string; checklist: string }> = {
  "qc-line-clearance-printing": {
    area: "PRINTING",
    machineBox: "PRINTING MACHINE NAME : - ____________________",
    checklist:
      "(1) Unprinted Rolls, Master Shade card, Nylo Plates, Magnetic die, Special Varnish, Screen & Inks of Previous Job removed ? (2) Ink of Current Job changed ? (3) Master shade card of new Job issued ? (4) Nylo Plates of New job changed & verified as per Master shade card  ? (5) Job change waste removed ? (7) Finished printed Rolls of Previous Production order shifted to designated place ?",
  },
  "qc-line-clearance-punching": {
    area: "PUNCHING",
    machineBox: "PUNCHING MACHINE NAME : - ____________________",
    checklist:
      "(1) Die of Previous Job removed ? (2) Die of Current / New Job changed ? (3) Matrix Roll (Wastage) of previous job removed ? (4) Finished Punching Rolls of Previous Production order shifted to designated place ?",
  },
  "qc-line-clearance-qc-machine": {
    area: "QC MACHINE INSPECTION",
    machineBox: "QC INSPECTION MACHINE NAME : - ____________________",
    checklist: "(1) Finished QC Inspected Rolls of Previous Production order shifted to designated place ? (2) Wastage of previous job removed ?",
  },
  "qc-line-clearance-qc-manual": {
    area: "QC MANUAL INSPECTION",
    machineBox: "QC MACHINE NAME : - ____________________",
    checklist: "(1) Finished QC Inspected Rolls of Previous Production order shifted to designated place ? (2) Wastage of previous job removed ?",
  },
  "qc-line-clearance-slitting": {
    area: "SLITTING",
    machineBox: "SLITTING MACHINE NAME : - ____________________",
    checklist: "(1) Finished Slitted Rolls of Previous Production order shifted to designated place ? (2) Wastage of previous job removed ?",
  },
  "qc-line-clearance-sleeve-gluing": {
    area: "SHRINK SLEEVE GLUING",
    machineBox: "SHRINK SLEEVE GLUING  MACHINE NAME : - ____________",
    checklist:
      "(1) Finished Printed Rolls of Previous Production order shifted to designated place ? (2) Wastage of previous job removed ? (3) Leaflet plate of previous Job removed",
  },
  "qc-line-clearance-sleeve-cutting": {
    area: "SHRINK SLEEVE CUTTING",
    machineBox: "SHRINK SLEEVE CUTTING MACHINE NAME : - ____________",
    checklist: "(1) Cut Shrink sleeve packed boxes of Previous Production order shifted to designated place ? (2) Wastage of previous job removed ?",
  },
};
const CLEARANCE_NOTE =
  "Line Clearance * :  Activity to make sure a production line & its processing area are completely cleared of any material from the previous process";
const CLEARANCE_HEADINGS = [
  "Completion Date", "Completion Time", "PO No. of previous Job", "Previous PO Customer name", "Line Clearance* (Done/Not Done)", "Verified by IPQC executive",
  "Starting Date", "Starting Time", "PO No. of New Job", "New PO Customer name", "Operator sign", "Verified by IPQC executive",
];

test("F/QC/15-A to G: the paper's twelve columns with no Sr. No., its note and the area's checklist above the grid, the title once", async () => {
  for (const [id, paper] of Object.entries(CLEARANCES)) {
    const layout = layoutOf(id);
    assert.deepEqual(printedAbove(layout), [CLEARANCE_NOTE, paper.checklist], `${id}: what the paper prints above its grid, and only that`);
    assert.ok(!printedAbove(layout).some((l) => l.startsWith("AREA LINE CLEARANCE REPORT")), `${id}: the title is the header's, not printed twice`);
    assert.deepEqual(layout.headerFields.map((f) => f.label), [paper.machineBox], id);
    assert.equal(layout.ownLineNumbers, true, `${id}: the paper has no Sr. No. column`);
    assert.deepEqual(layout.columns.map((c) => c.label), CLEARANCE_HEADINGS, id);
    assert.equal(docOf(id).name.toUpperCase(), `AREA LINE CLEARANCE REPORT - ${paper.area}`, `${id}: the header prints the paper's title`);
  }
  const html = await sheet("qc-line-clearance-punching", createDefaultData(docOf("qc-line-clearance-punching"), DAY, master) as LogSheetData);
  assert.deepEqual(headings(html), CLEARANCE_HEADINGS, "the sheet draws the twelve, and no Sr. No. of its own");
  assert.equal(text(html).split("AREA LINE CLEARANCE REPORT - PUNCHING").length - 1, 1, "the title is printed once");
});

test("F/QC/15-A to G: a sample day is the area's own job changes, written the paper's way — never the template's 2022 example lines", () => {
  for (const id of Object.keys(CLEARANCES)) {
    const doc = docOf(id);
    const filled = autoFillRecord(doc, DAY, master, undefined)!;
    const rows = (filled.data as LogSheetData).rows;
    assert.ok(rows.length >= 2 && rows.length <= 4, `${id}: ${rows.length} changes`);
    for (const [i, r] of rows.entries()) {
      assert.equal(r.completionDate, DAY, `${id} line ${i + 1}: the day's own date`);
      assert.equal(r.startingDate, DAY);
      assert.match(String(r.completionTime), /^(1[0-2]|[1-9])\.[0-5]\d (AM|PM)$/, "a clock-face time, as the paper writes it");
      assert.match(String(r.startingTime), /^(1[0-2]|[1-9])\.[0-5]\d (AM|PM)$/);
      assert.match(String(r.previousJobPoNo), /^\d{5}$/);
      assert.match(String(r.newJobPoNo), /^\d{5}$/);
      assert.notEqual(r.previousJobPoNo, "36633", "not the template's filler PO");
      assert.ok(String(r.previousPoCustomerName).length > 3 && r.previousPoCustomerName !== "xyz");
      assert.equal(r.lineClearance, "Done");
      for (const k of ["verifiedByIpqcClearance", "operatorSign", "verifiedByIpqcNewJob"]) assert.ok(String(r[k]).trim().length > 0, `${id} line ${i + 1}: ${k} signed`);
      if (i > 0) {
        assert.equal(r.previousJobPoNo, rows[i - 1].newJobPoNo, "the job a line closes is the one the line before opened");
        assert.equal(r.previousPoCustomerName, rows[i - 1].newPoCustomerName);
      }
    }
    assert.deepEqual(validateForSubmit(doc, recordOf(id, filled.data as LogSheetData)).errors, [], `${id}: the sample submits`);
    // The morning prepare of a Live record writes no line of a register.
    const known = prepareKnownParts(doc, DAY, master, undefined);
    const knownRows = ((known?.data as LogSheetData | undefined)?.rows ?? []).filter((r) => String(r.previousJobPoNo ?? "") !== "" || String(r.operatorSign ?? "") !== "");
    assert.deepEqual(knownRows, [], `${id}: nothing observed in a Live record`);
  }
  // The clock face the paper writes.
  assert.deepEqual([clockFace(9 * 60 + 5), clockFace(12 * 60 + 15), clockFace(14 * 60 + 40), clockFace(0)], ["9.05 AM", "12.15 PM", "2.40 PM", "12.00 AM"]);
});

test("a line clearance edited before §111 loses the title DCRS printed above its grid", () => {
  const id = "qc-line-clearance-slitting";
  const issued = getIssuedLogSheetLayout(id)!;
  const { ownLineNumbers: _own, ...rest } = issued;
  const old: LogSheetLayout = { ...rest, instructions: ["AREA LINE CLEARANCE REPORT -  SLITTING", ...printedAbove(issued)] };
  try {
    saveFormatEdit(id, { revisionNo: "01", revisionDate: "2026-10-01", layout: old, revisions: [] });
    assert.deepEqual(getLogSheetLayout(id)!.instructions, printedAbove(issued));
  } finally {
    dropFormatEdit(id);
  }
});

// ---------------------------------------------------------------------------
// 2. The two Gujarati checklists, "F-QC-15 Line Clearance format (2).jpg" (both on one page)

test("the Gujarati line clearance checklists: the paper's words alone, no English beside them, no Sr. No., nothing of DCRS's", async () => {
  const materials = layoutOf("qc-line-clearance-materials");
  assert.deepEqual(materials.headerFields.map((f) => f.label), ["આઈટમ નં.", "પ્રો.નં.", "મશીનનું નામઃ–", "તા."]);
  assert.deepEqual(materials.columns.map((c) => c.label), ["પ્રોસેસ", "મટીરીયલ્સ", "ઓપરેટર ની શહી", "Q.A એ ચેકીંગ", "Q.A ની શહી"]);
  assert.equal(printedAbove(materials).length, 1, "the procedure alone");
  assert.ok(printedAbove(materials)[0].startsWith("પ્રોસેસઃ– નીચે લખેલા દરેક પોઈન્ટ"));
  const quality = layoutOf("qc-line-clearance-quality");
  assert.deepEqual(quality.headerFields.map((f) => f.label), ["આઈટમ નં.", "પ્રોડકશન નં."]);
  assert.deepEqual(quality.columns.map((c) => c.label), ["પ્રોસેસ", "પેરામિટર", "ઓપરેટર ની શહી", "Q.A ચેકીંગ", "Q.A ની શહી"]);
  assert.equal(printedAbove(quality).length, 1);
  assert.ok(printedAbove(quality)[0].startsWith("પ્રોસીઝરઃ– ઓપરેટર ખાતરી કરવી"));
  for (const layout of [materials, quality]) {
    assert.equal(layout.ownLineNumbers, true, "the paper has no Sr. No.");
    for (const label of [...layout.headerFields.map((f) => f.label), ...layout.columns.map((c) => c.label)]) {
      assert.ok(!/\(|[A-Za-z]{3,}/.test(label.replace(/^Q\.A /, "")), `"${label}" is the paper's Gujarati alone`);
      assert.notEqual(documentTextIn(label, "en"), label, `"${label}" still reads in English when English is chosen`);
    }
  }
  const html = await sheet("qc-line-clearance-quality", createDefaultData(docOf("qc-line-clearance-quality"), DAY, master) as LogSheetData);
  assert.ok(!headings(html).includes("Sr. No."));
  assert.ok(!text(html).includes("એક જ પાના પર"), "DCRS's own line that the two share a page is gone");
  assert.deepEqual([materials.paperTitle, quality.paperTitle], ["લાઈન કિલયરન્સ", "ક્વોલીટી શહી"], "each headed with the words at the head of its form");
  assert.ok(text(html).includes("QUALITY SIGN"), "read in English with English chosen");
});

// ---------------------------------------------------------------------------
// 3. F/QC/13, In Process Quality Control, "F-QC-13 IPQC format (2).jpg"

test("F/QC/13: the procedure, the grade criteria printed in full, eight boxes three to a line, સ.નં | પેરામીટર | ટેસ્ટ ક્રાઈટ | ગ્રેડ | પાસ?, the five boxes below in English", async () => {
  const id = "qc-inprocess-printing";
  const layout = layoutOf(id);
  assert.equal(printedAbove(layout).length, 1, "the procedure alone: the grading rules and the ups line are not on this paper");
  assert.ok(printedAbove(layout)[0].startsWith("પ્રોસીઝરઃ– ઉત્પાદન ની પ્રક્રિયા દરમિયાન Q.A. વ્યકિત ખાતરી કરશે કે ૩ પૂર્ણ સીટ્સ ના જોબના દર ૬૦૦૦ મીટરે"));
  assert.ok(printedAbove(layout)[0].endsWith("તો Q.A. મેનેઝર તેમજ સુપરવાઈઝર ની શહી કરાવવી આવશ્યક છે."));
  const chart = layout.referenceTables?.[0];
  assert.ok(chart?.printed, "the grade criteria are printed on the page, not shown on request");
  assert.deepEqual(chart!.columns, ["સ.નં", "પેરામીટર", "ગ્રેડ ક્રાઈટ"]);
  assert.deepEqual(chart!.rows.map((r) => r[1]), ["રજિસ્ટ્રેશન", "શેડ", "કોટીંગ", "પંચીંગ", "પ્રીન્ટ પ્રેસર", "પ્રીન્ટ ડીફોરમીટસ"]);
  for (const row of chart!.rows) assert.deepEqual(row[2].split("\n").map((l) => l.slice(0, 2)), ["A–", "B–", "C–", "F–"], row[1]);
  assert.equal(layout.headerColumns, 3);
  assert.deepEqual(layout.headerFields.map((f) => [f.key, f.label]), [
    ["itemCode", "આઈટમ કોડ"], ["poNumber", "પ્રો. નંબર"], ["date", "તારીખ"],
    ["machine", "મશીન"], ["operator", "ઓપરેટર"], ["qaPerson", "QA પર્સન"],
    ["orderLength", "ઓર્ડર લેન્થ ઈન મીટર"], ["sampleQty", "સેમ્પલ કોલીટી"],
  ]);
  assert.deepEqual(layout.columns.map((c) => c.label), ["સ.નં", "પેરામીટર", "ટેસ્ટ ક્રાઈટ", "ગ્રેડ", "પાસ?"]);
  assert.equal(layout.ownLineNumbers, true);
  assert.equal(layout.rowMode.kind, "fixedRows");
  if (layout.rowMode.kind === "fixedRows") {
    assert.deepEqual(layout.rowMode.rows.map((r) => r.srNo), ["૧", "૨", "૩", "૪", "૫", "૬"]);
    assert.deepEqual(layout.rowMode.rows.map((r) => r.parameter), ["રજિસ્ટ્રેશન", "શેડ", "કોટીંગ", "પંચીંગ", "પ્રીન્ટ પ્રેસર", "પ્રીન્ટ ડીફોર્મીટસ"]);
  }
  assert.deepEqual(layout.footerFields?.map((f) => f.label), ["Description of NC (If applicable):", "Sign Off Reason (If Applicable)", "Sign Off By: (If Applicable)", "REMARKS:", "QA Sign:"]);
  // Every word of it reads in English when English is chosen.
  const gujarati = /[઀-૿]/;
  const words = [
    ...printedAbove(layout), ...chart!.columns, ...chart!.rows.flat(),
    ...layout.headerFields.map((f) => f.label), ...layout.columns.map((c) => c.label),
    ...(layout.rowMode.kind === "fixedRows" ? layout.rowMode.rows.flatMap((r) => [r.srNo, r.parameter, r.testChart].map(String)) : []),
  ];
  assert.deepEqual(words.filter((w) => gujarati.test(documentTextIn(w, "en"))), [], "a line with no English");
  // The sheet: the criteria open and printed, the paper's own numbers and no Sr. No. of the sheet's.
  const filled = autoFillRecord(docOf(id), DAY, master, undefined)!.data as LogSheetData;
  const html = await sheet(id, filled);
  assert.match(html, /data-reference-table="printed"/);
  assert.equal(layout.paperTitle, "In Process Quality Control");
  assert.ok(text(html).includes("IN PROCESS QUALITY CONTROL") && !text(html).includes("(PRINTING)"), "headed with the paper's own title");
  // English is chosen in the harness, so the Gujarati form reads in English (REQUIREMENTS §58).
  assert.ok(!/>\s*Show /.test(html), "no Show button of DCRS's");
  assert.ok(text(html).includes("A – All registers are perfectly in order. No print has been judged spoiled."), "the criteria are on the sheet");
  const grid = between(html, 'class="compact log-sheet', "</table>");
  assert.deepEqual(headings(grid), ["Sr. No.", "Parameter", "Test criteria", "Grade", "Pass?"], "the paper's five columns, its own સ.નં the first");
  // A sample fill grades each parameter and writes no defect count, which the paper has no column for.
  assert.equal(filled.rows.length, 6);
  assert.ok(filled.rows.every((r) => ["A", "B", "C", "F", "-"].includes(String(r.grade)) && !("defectCount" in r)), JSON.stringify(filled.rows));
  assert.equal(filled.header.date, DAY);
  assert.deepEqual(validateForSubmit(docOf(id), recordOf(id, filled)).errors, []);
  // A record written before the paper's own સ.નં was a column reads the paper's number on each line.
  const older = { ...filled, rows: filled.rows.map(({ srNo: _n, ...r }) => r) } as LogSheetData;
  assert.match(text(between(await sheet(id, older), 'class="compact log-sheet', "</table>")), / 6 Print deformities /);
});

// ---------------------------------------------------------------------------
// 4. The registers and the reports: F/QC/08, F/QC/16, F/QC/20, F/QC/29 (both), F/QC/30, and F-QC-40.C

test("F/QC/08 master list of calibration instruments: its Note above the grid and its sixteen columns; a sample names DCRS's own instruments", () => {
  const id = "qc-calibration-master-list";
  const layout = layoutOf(id);
  assert.equal(printedAbove(layout).length, 1);
  assert.ok(printedAbove(layout)[0].startsWith("Note : List of calibration instruments are those which impact the process conformity"));
  assert.deepEqual(layout.columns.map((c) => c.label), [
    "Name of Instrument", "Instrument ID No.", "Make", "Purpose of Instrument", "Location of use", "Instrument - Range", "Least count", "Accuracy / Acceptable Error",
    "Method of Calibration - Internal / External", "Frequency of Calibration", "Date of Initial Calibration", "Current Calibration date", "Next due date of calibration",
    "Calibration agency", "Calibration report number", "Remarks",
  ]);
  const filled = autoFillRecord(docOf(id), DAY, master, undefined)!.data as LogSheetData;
  assert.equal(filled.rows.length, 11, "the paper's eleven lines");
  assert.deepEqual(filled.rows.slice(0, 5).map((r) => [r.instrumentName, r.instrumentIdNo, r.make]), [
    ["Weighing Balance", "QC-76", "Force Strain Sensors"],
    ["GSM Cutting Plate 20 x 20cm", "54", "Global Eng. Co. (GEC)"],
    ["GSM Cutting Plate 10 x 10cm", "55", "Global Eng. Co. (GEC)"],
    ["GSM Cutting Plate 5 x 5cm", "56", "Global Eng. Co. (GEC)"],
    ["GSM Cutting Plate 2.5 x 2.5cm", "57", "Global Eng. Co. (GEC)"],
  ]);
  assert.ok(filled.rows.every((r) => r.currentCalibrationDate === "" && r.nextDueDate === ""), "the calibration dates are the person's");
  // A Live record's list starts blank.
  assert.ok((createDefaultData(docOf(id), DAY, master) as LogSheetData).rows.every((r) => r.instrumentName === ""));
});

test("F/QC/16 register of obsolete artwork: its nine columns, nothing above; a sample day withdraws two artworks that day", () => {
  const id = "qc-obsolete-artwork";
  const layout = layoutOf(id);
  assert.deepEqual(printedAbove(layout), []);
  assert.deepEqual(layout.columns.map((c) => c.label), [
    "Customer name", "Job name", "Artwork number / Master Shade card number (FG Code)", "Sales Person", "Reason for artwork obsolete", "Date of obsolete", "Updated by - QC In-charge", "Remarks",
  ]);
  const filled = autoFillRecord(docOf(id), DAY, master, undefined)!.data as LogSheetData;
  assert.equal(filled.rows.length, 2);
  assert.ok(filled.rows.every((r) => r.dateOfObsolete === DAY && String(r.updatedBy).trim() !== "" && r.reasonObsolete === "A/W Change"), JSON.stringify(filled.rows));
});

test("F/QC/20 destruction record: titled DESTRUCTION RECORD, PRINTING AIDS DESTRUCTION RECORD above, Date:, its four columns, the issue and review dates at its foot", async () => {
  const id = "qc-printing-aids-destruction";
  const layout = layoutOf(id);
  assert.equal(layout.paperTitle, "DESTRUCTION RECORD");
  assert.deepEqual(printedAbove(layout), ["PRINTING AIDS DESTRUCTION RECORD"]);
  assert.deepEqual(layout.headerFields.map((f) => f.label), ["Date:"]);
  assert.deepEqual(layout.columns.map((c) => c.label), ["Item Description", "Actual Qty.", "Destroyed By", "Checked By"]);
  assert.deepEqual(layout.notesBelow, ["Current Issue date 1st January 2022", "Next Review date 31st December 2024"]);
  const html = await sheet(id, createDefaultData(docOf(id), DAY, master) as LogSheetData);
  assert.ok(!text(html).includes("The form's footer prints"), "DCRS's own line is gone");
  assert.ok(text(html).includes("DESTRUCTION RECORD") && text(html).includes("Next Review date 31st December 2024"));
});

test("F/QC/29 analysis report and utility test, and F/QC/30 minutes: the paper's words, nothing of DCRS's above the grid", async () => {
  const analysis = layoutOf("qc-analysis-report");
  assert.deepEqual(printedAbove(analysis), [], "the two lines DCRS printed above the grid are gone");
  assert.deepEqual(analysis.headerFields.map((f) => f.label), ["Date :", "Report"]);
  assert.deepEqual(analysis.columns.map((c) => c.label), ["Description", "Observation"]);
  assert.deepEqual(analysis.footerFields?.map((f) => f.label), ["Testing By (QA Executive)", "Approved By (QA Manager)"]);

  const utility = layoutOf("qc-utility-test-report");
  assert.equal(utility.paperTitle, "MINUTES OF MEETINGS", "printed on the minutes of meetings format, and headed so");
  assert.deepEqual(printedAbove(utility), ["NIVEA SAMPLES -  UTILITY TEST  REPORT"]);
  assert.deepEqual(utility.headerFields.map((f) => f.label), ["DATE:"]);
  assert.deepEqual(utility.columns.map((c) => [c.group ?? "", c.label]), [
    ["Description", "Job Name"], ["", "Observation (24Hrs.) Freeze"], ["", "Observation (24Hrs.) Desiccator"], ["", "Observation (24Hrs.) Oven"],
  ]);
  const html = await sheet("qc-utility-test-report", createDefaultData(docOf("qc-utility-test-report"), DAY, master) as LogSheetData);
  assert.ok(text(html).includes("MINUTES OF MEETINGS") && !text(html).includes("for the MR to confirm"));

  const minutes = layoutOf("qc-minutes-of-meetings");
  assert.deepEqual(printedAbove(minutes), [], "the headings are the labels of what they head, not lines above the boxes");
  assert.deepEqual(minutes.headerFields.map((f) => f.label), ["Client Name :", "Location :", "Date :", "Subject:", "Participants :"]);
  assert.deepEqual(minutes.columns.map((c) => c.label), ["Key points Discussed:"]);
  assert.equal(minutes.headerColumns, 1, "each box a line of its own, as the paper");
});

test("F-QC-40.C hot room: TEMPERATURE MONITORING RECORD, the recommended temperature above, DATE and the six TEMP. + SIGN readings, no Sign column of DCRS's", async () => {
  const id = "qc-temperature";
  const layout = layoutOf(id);
  assert.equal(layout.paperTitle, "TEMPERATURE MONITORING RECORD");
  assert.deepEqual(printedAbove(layout), ["RECOMMENDED TEMPERATURE : HOT ROOM 45°C ± 2°C"]);
  assert.deepEqual(layout.columns.map((c) => c.label), [
    "DATE", "08:30 HRS TEMP. + SIGN", "12:30 HRS TEMP. + SIGN", "16:30 HRS TEMP. + SIGN", "20:30 HRS TEMP. + SIGN", "12:30am HRS TEMP. + SIGN", "04:30 HRS TEMP. + SIGN",
  ]);
  for (const c of layout.columns.slice(1)) assert.deepEqual([c.min, c.max], [43, 47], "45 ± 2 °C, the band a reading is highlighted outside");
  const filled = autoFillRecord(docOf(id), DAY, master, undefined)!;
  const row = (filled.data as LogSheetData).rows[0];
  assert.equal(row.date, DAY);
  assert.deepEqual(validateForSubmit(docOf(id), recordOf(id, filled.data as LogSheetData)).errors, []);
  const html = await sheet(id, filled.data as LogSheetData);
  assert.ok(text(html).includes("TEMPERATURE MONITORING RECORD") && !text(html).includes("— HOT ROOM"), "headed as the paper");
});

// ---------------------------------------------------------------------------
// 5. F-QC-14, the internal test reliability record: the workbook's two sheets, Label and Sleeve

const RELIABILITY = {
  "qc-test-reliability-label": {
    headings: [
      "GSM - Total\nSpecification : 70 ± 5%",
      "Dimension (Length & Width)\nSpecification : Length :50mm & Width :40mm",
      "GSM - Adhesive\nSpecification :  16.0 ± 2",
      "Scuff Test\nSpecification :  2lbs/100rounds",
      "Thickness\nSpecs :  110 micron",
      "Coloue shade: Should be OK",
      "Peel Strength\nSpecs :  More than 1000 gms",
      "Gloss Testing\nSpecification : Minimum Gloss Required at 60˚",
    ],
    names: ["GSM - Total", "Dimension (Length & Width)", "GSM - Adhesive", "Scuff Test", "Thickness", "Coloue shade", "Peel Strength", "Gloss Testing"],
    seeded: "qc-test-reliability-label-2022-02",
  },
  "qc-test-reliability-sleeve": {
    headings: [
      "Thickness: 40 micron",
      "Dimension (Length & Width)\nSpecification : Length :203.20mm & Width :178mm",
      "Shrinkage Ratio : TD 60 ± 2 %, MD 0 ~ 6%",
      "Coloue shade: Should be OK",
      "Corona Treatment - Both side Min. 36 dynes",
    ],
    names: ["Thickness", "Dimension (Length & Width)", "Shrinkage Ratio", "Coloue shade", "Corona Treatment"],
    seeded: "qc-test-reliability-sleeve-2022-02",
  },
} as const;

test("F-QC-14: both sheets are F-QC-14, headed INTERNAL TEST RELIABILITY RECORD, the four inspectors' columns, each check's three lines as headed, no Sr. No., a Conclusion for each check", async () => {
  for (const [id, paper] of Object.entries(RELIABILITY)) {
    const doc = docOf(id);
    const layout = layoutOf(id);
    assert.equal(doc.formatNo, "F-QC-14", id);
    assert.equal(layout.paperTitle, "INTERNAL TEST RELIABILITY RECORD", id);
    assert.deepEqual(printedAbove(layout), [], `${id}: nothing of DCRS's above the grid`);
    assert.equal(layout.ownLineNumbers, true, `${id}: the paper numbers no line`);
    assert.deepEqual(layout.headerFields.map((f) => f.label), ["Date :", "Inspector - 1", "Inspector - 2", "Inspector - 3", "Inspector - 4", "FG Code"], id);
    assert.deepEqual(layout.columns.map((c) => c.label), ["Test", "Paper Reel SAP batch no. / Roll no. / sample no.", "Inspector - 1", "Inspector - 2", "Inspector - 3", "Inspector - 4"], id);
    assert.ok(layout.rowMode.kind === "fixedRows");
    const lines = layout.rowMode.kind === "fixedRows" ? layout.rowMode.rows.map((r) => r.parameter) : [];
    assert.deepEqual(lines, paper.headings.flatMap((heading) => [heading, heading, heading]), `${id}: each check's three lines, headed as the workbook heads it`);
    assert.deepEqual(
      layout.footerFields?.map((f) => f.label),
      paper.names.map((name) => `Conclusion (${name})`),
      `${id}: one Conclusion per check, in order`
    );
    assert.ok(layout.footerFields?.every((f) => f.type === "paragraph"), `${id}: each Conclusion a sentence across the page`);
    const html = await sheet(id, createDefaultData(doc, DAY, master) as LogSheetData);
    assert.equal(headings(html).filter((t) => t === "Sr. No.").length, 0, `${id}: no Sr. No. of the sheet's`);
    assert.ok(text(html).includes("Specification : 70 ± 5%") || id.endsWith("sleeve"), id);
  }
});

test("F-QC-14: the workbook of 12.02.2022 is on file, cell for cell, as two Verified Live records", () => {
  const label = SEED_HISTORICAL_RECORDS.find((r) => r.id === RELIABILITY["qc-test-reliability-label"].seeded)!;
  const sleeve = SEED_HISTORICAL_RECORDS.find((r) => r.id === RELIABILITY["qc-test-reliability-sleeve"].seeded)!;
  assert.ok(label && sleeve);
  for (const r of [label, sleeve]) assert.ok(r.status === "Verified" && r.isDemo === false && r.dueDate === "2022-02-12", r.id);
  const l = label.data as LogSheetData;
  assert.deepEqual([l.header.inspector1, l.header.inspector2, l.header.inspector3, l.header.inspector4, l.header.fgCode], ["Kapila", "Kirti Patel", "Anil Raval", "Karan Prajapati", "FGLA 11430"]);
  assert.equal(l.rows.length, 24);
  assert.deepEqual([l.rows[0].sampleNo, l.rows[0].reading1, l.rows[0].reading2, l.rows[0].reading3, l.rows[0].reading4], ["9460/5234/15", "72", "71", "70", "71"]);
  assert.deepEqual([l.rows[18].sampleNo, l.rows[18].reading2], ["9460/5234/15", "1220"], "Peel Strength, the first roll");
  assert.deepEqual([l.rows[23].sampleNo, l.rows[23].reading1], ["3", "82"], "Gloss Testing, the third sample");
  const s = sleeve.data as LogSheetData;
  assert.equal(s.header.fgCode, "FGSL1241");
  assert.equal(s.rows.length, 15);
  assert.deepEqual([s.rows[6].sampleNo, s.rows[6].reading1, s.rows[6].reading2], ["9396/5146/1", "TD-61 MD-3", "TD-60,MD-3"], "the shrinkage cells as written");
  assert.ok(Object.keys(l.header).filter((k) => k.startsWith("conclusion")).every((k) => l.header[k] === "Variation are within specification limit, hence test reliability accepted"));
});

test("F-QC-14 in Demo Mode and the sample fill: a real exercise of that day, every reading inside its specification; a Live record gets only its date", () => {
  for (const id of Object.keys(RELIABILITY)) {
    const filled = autoFillRecord(docOf(id), DAY, master, undefined)!.data as LogSheetData;
    const header = filled.header;
    assert.ok(String(header.inspector1).trim() !== "", `${id}: Inspector - 1 named`);
    assert.ok(header.inspector1 !== "Kapila" || header.inspector2 !== "Kirti Patel", `${id}: QA's people of that day, not the workbook's names copied`);
    assert.ok(!filled.rows.some((r) => String(r.sampleNo).startsWith("9460/5234")), `${id}: not the 2022 reel`);
    assert.ok(/^FG(LA |SL)\d+$/.test(String(header.fgCode)), `${id}: ${header.fgCode}`);
    assert.deepEqual(validateForSubmit(docOf(id), recordOf(id, filled)).errors, [], id);
    const byHeading = (start: string) => filled.rows.filter((r) => String(r.parameter).startsWith(start));
    const values = (start: string) => byHeading(start).flatMap((r) => [r.reading1, r.reading2, r.reading3, r.reading4].map(String));
    if (id.endsWith("label")) {
      assert.ok(values("GSM - Total").every((v) => Number(v) >= 66.5 && Number(v) <= 73.5), values("GSM - Total").join());
      assert.ok(values("GSM - Adhesive").every((v) => Number(v) >= 14 && Number(v) <= 18), values("GSM - Adhesive").join());
      assert.ok(values("Peel Strength").every((v) => Number(v) > 1000), values("Peel Strength").join());
      assert.ok(byHeading("Dimension").every((r, i) => r.sampleNo === String(i + 1)), "the finished label's samples 1, 2, 3");
      assert.ok(byHeading("GSM - Total").every((r) => /^\d+\/\d+\/\d+$/.test(String(r.sampleNo))), "the reel's batch and roll");
    } else {
      assert.ok(values("Shrinkage Ratio").every((v) => /^TD-(5[89]|6[0-2]),MD-[0-6]$/.test(v)), values("Shrinkage Ratio").join());
      assert.ok(values("Thickness").every((v) => Math.abs(Number(v) - 40) <= 1), values("Thickness").join());
    }
    // The morning prepare of a Live record: the date and the printed lines, no reading, no name, no conclusion.
    const known = prepareKnownParts(docOf(id), DAY, master, undefined)!.data as LogSheetData;
    assert.equal(known.header.date, DAY);
    for (const [k, v] of Object.entries(known.header)) if (k !== "date") assert.ok(!String(v ?? "").trim(), `${id}: ${k} left for the person`);
    assert.ok(known.rows.every((r) => !r.sampleNo && !r.reading1 && !r.reading4), `${id}: no reading written`);
  }
});

test("F-QC-14 is found by its number in any spelling, both sheets, and by the words people use", () => {
  for (const q of ["F-QC-14", "F QC 14", "fqc14", "f/qc/14"]) {
    const found = findDocuments(q).flatMap((f) => (f.kind === "master" ? [] : [f.doc.id])).sort();
    assert.deepEqual(found, ["qc-test-reliability-label", "qc-test-reliability-sleeve"], q);
    assert.ok(!findDocuments(q).some((f) => f.kind === "master"), `${q}: no longer "not in DCRS yet"`);
  }
  assert.deepEqual(matchDocuments("open the test reliability record").sort(), ["qc-test-reliability-label", "qc-test-reliability-sleeve"], "both, and Mitra asks which");
  assert.deepEqual(matchDocuments("open the sleeve test reliability"), ["qc-test-reliability-sleeve"]);
});
