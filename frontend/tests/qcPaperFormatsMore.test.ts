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
});
