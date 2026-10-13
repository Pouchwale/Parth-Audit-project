// THE INCOMING MATERIAL RECORDS, THE CERTIFICATES OF ANALYSIS AND THE TOLERANCE CARD EXACTLY AS THE PAPER
// (REQUIREMENTS §111, 13-Oct-2026).
//
// The owner sent the originals again (source-documents/qc-originals-2026-10-13/): F-QC-01 to F-QC-05, F-QC-18 to
// F-QC-24 and F-QC-33 (the incoming material inspection records), F-QC-36 (solvent base lamination film), F-QC-06,
// F-QC-07 and F-QC-25 (the certificates of analysis) and the Nivea tolerance card (F-QC-19). Each is pinned here to
// its original: the title's words, the header boxes in the paper's reading order and how many stand to a line, the
// columns and their headings, the lines the paper prints down its side with their specifications, the boxes below
// the grid and their groups, the printed words in their places — and nothing of DCRS's own.
//
// Three layout abilities place them (engine/paperLayout.ts): boxes in the paper's groups under the lines and the
// table printed above them (LogHeaderField printedAbove, tableAbove, boxesPerLine), the text at the foot of the sheet
// (LogSheetLayout.notesAtFoot), and a heading the paper leaves out (LogColumn.printedLabel).
import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import type { DocumentDefinition, LogSheetData, LogSheetLayout, MasterData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrMasterSeeded } from "../src/data/repositories/hrMasterRepository";
import { getIssuedLogSheetLayout, getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { COA_LETTERHEAD, CORPORATE_OFFICE, GRADE_SCALE_NOTE, HEAT_SENSITIVE_NOTE, SUPPLIER_COA_NOTE, SYSTEM_GENERATED_NOTE } from "../src/data/seed/qcCoaLayouts";
import { FLEXO_INK_SYSTEM_NOTE } from "../src/data/seed/qcIncomingLayouts";
import { dropFormatEdit, saveFormatEdit } from "../src/data/formatEdits";
import { boxGroups, columnHeading, placedTables } from "../src/engine/paperLayout";
import { createDefaultData } from "../src/engine/recordDefaults";
import { numbersOwnLines } from "../src/engine/formLineNumbers";

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

/** The sheet as the record page draws it (components/records/LogSheetRecordView.tsx), as markup — the same the print and the downloads are made from. */
async function sheet(documentId: string, data?: LogSheetData, editable = true): Promise<string> {
  const [view, auth, store, router] = await Promise.all([
    import("../src/components/records/LogSheetRecordView"),
    import("../src/store/AuthContext"),
    import("../src/store/AppStore"),
    import("../src/store/router"),
  ]);
  const record = recordOf(documentId, data ?? (createDefaultData(docOf(documentId), DAY, master) as LogSheetData));
  return renderToStaticMarkup(
    h(auth.AuthProvider, null, h(store.AppStoreProvider, null, h(router.RouterProvider, null, h(view.LogSheetRecordView, { doc: docOf(documentId), record, editable, onChange: () => undefined }))))
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const between = (html: string, from: string, to: string) => {
  const a = html.indexOf(from);
  assert.ok(a >= 0, `the markup holds ${from}`);
  const b = html.indexOf(to, a);
  return html.slice(a, b < 0 ? undefined : b);
};
const headings = (html: string) => Array.from(between(html, "<thead", "</thead>").matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g), (m) => text(m[1]).trim());
const boxLabels = (html: string) => Array.from(html.matchAll(/<div class="field[^"]*"><label>([\s\S]*?)<\/label>/g), (m) => text(m[1]).replace(/\s*\*\s*$/, "").trim());
/** Where each of these words first stands in the sheet's text, so their order can be compared with the paper's. */
const order = (html: string, words: string[]) => {
  const t = text(html);
  return words.map((w) => {
    const at = t.indexOf(w.replace(/\s+/g, " "));
    assert.ok(at >= 0, `the sheet prints "${w}"`);
    return at;
  });
};
const ascending = (xs: number[]) => xs.every((x, i) => i === 0 || xs[i - 1] < x);

/** Words of DCRS's own that once stood above these grids, and must stand nowhere on them now (REQUIREMENTS §111). */
const DCRS_WORDS = [/A grid reads down the page/, /is the last box below the grid/, /the PRINTING block's colours are the grid/, /are printed on the form, 7 breaking/, /this reproduces the card's panels/, /Sample mounted/];

// ---------------------------------------------------------------------------
// 1. The three abilities

test("boxes in the paper's groups: F/MNT/08's hand-over is drawn as before, under its two lines, two to a line", async () => {
  const groups = boxGroups(layoutOf("mnt-new-equipment"), "footer");
  assert.deepEqual(
    groups.map((g) => [g.lead, g.boxes.map((b) => b.field.key), g.lines.length, g.perLine ?? null]),
    [
      [true, ["benefits", "risks"], 0, null],
      [false, ["maintenanceHead", "maintenanceHeadDate", "productionHead", "productionHeadDate", "qcHead", "qcHeadDate"], 2, 2],
    ]
  );
  assert.equal(boxGroups(layoutOf("mnt-new-equipment"), "footer"), groups, "worked out once per layout");
  const html = await sheet("mnt-new-equipment");
  assert.equal(html.split('data-section="printed-group"').length - 1, 1, "one printed group, as F/MNT/08's page 2 has");
  // A sheet whose boxes start no group draws them as it always did.
  const plain = boxGroups(layoutOf("qc-viscosity"), "header");
  assert.deepEqual(plain, []);
  const scale = boxGroups(layoutOf("qc-weight-scale-calibration"), "header");
  assert.equal(scale.length, 1);
  assert.equal(scale[0].perLine, 3, "the lead group above the grid stands as many to a line as headerColumns says");
});

test("a table printed among the boxes is drawn open in its place, and the text at the foot comes after every box", async () => {
  const layout = layoutOf("qc-coa-label");
  assert.deepEqual([...placedTables(layout)], ["TOLERANCE"]);
  const html = await sheet("qc-coa-label");
  assert.ok(!/>(Show|Hide) TOLERANCE</.test(html), "not behind Show above the sheet");
  const table = html.indexOf('data-section="printed-table" data-table="TOLERANCE"');
  const finishing = html.indexOf("Over All Quality Remarks");
  const retest = html.indexOf("This material should be retested on … before usage.");
  const foot = html.indexOf('data-section="notes-at-foot"');
  assert.ok(finishing > 0 && table > finishing && retest > table && foot > retest, JSON.stringify({ finishing, table, retest, foot }));
  assert.ok(text(html.slice(table)).includes("Field Length Width Face Material Adhesive Release Liner + 2 mm 2 mm 10 % 2 GSM 5 % - 2 mm 2 mm 10 % 2 GSM 5 %"));
  // The foot is drawn after the last box below the grid.
  const lastBox = html.lastIndexOf('<div class="field');
  assert.ok(foot > lastBox);
  assert.match(html.slice(foot), /<strong>THIS IS A SYSTEM GENERATED DOCUMENT\. {4}IT DOES NOT REQUIRE A SIGNATURE\.<\/strong>/, "printed in capitals, bold, its own spacing kept");
});

test("a heading the paper leaves out is drawn empty, and the column keeps its name for Mitra and the history", async () => {
  const layout = layoutOf("qc-coa-corrugated");
  const description = layout.columns.find((c) => c.key === "description")!;
  assert.equal(description.label, "Description");
  assert.equal(columnHeading(description), "");
  assert.equal(columnHeading(layout.columns[0]), "Sr.No.");
  const html = await sheet("qc-coa-corrugated");
  // (The markup's text is read with its spaces run together; the paper's "Specified  GSM" keeps its two in the layout.)
  assert.deepEqual(headings(html), ["Sr.No.", "", "", "GSM", "BF", "Grade of Paper", "Specified GSM", "Tested GSM"]);
  assert.ok(html.includes(">Specified  GSM<"));
});

// ---------------------------------------------------------------------------
// 2. The fourteen incoming material inspection records

const INCOMING_HEADER = ["Supplier Name", "Report number", "Product Description", "SAP Batch number", "GRN Qty.", "GRN number", "Date of Inspection"];
const INCOMING_FOOTER = ["LOT STATUS", "REASON FOR DEVIATION / REJECTION / SEGREGATION", "INSPECTED BY (QA INSPECTOR)", "APPROVED BY (QA MANAGER)"];
const OBSERVATION = ["TEST PARAMETERS", "SPECIFICATION", "OBSERVATION"];
const SAMPLES = ["TEST PARAMETERS", "SPECIFICATION", "SAMPLE – 1", "SAMPLE – 2", "SAMPLE - 3"];

/** Each original's title, columns and printed lines [TEST PARAMETERS, SPECIFICATION], as printed. */
const INCOMING: Record<string, { title: string; formatNo: string; columns: string[]; rows: [string, string][]; batch?: string }> = {
  "qc-bopp-film": {
    title: "Inspection Record - BOPP Film",
    formatNo: "F/QC/01",
    columns: OBSERVATION,
    rows: [
      ["SIZE (mm)", "Should be as per P.O.  (+ 2/- 0.0)"],
      ["COLOUR", "Transparent"],
      ["THICKNESS OF FILM (µm)", "As per P.O. (Max.± 1 micron)"],
      ["CORONA TREATMENT (Dynes)", "Both side Minimum 36 dynes"],
    ],
  },
  "qc-corrugated-box": {
    title: "Inspection Record - Corrugated Box",
    formatNo: "F/QC/02",
    columns: SAMPLES,
    rows: [
      ["SIZE (L x W x H) mm", "AS PER P.O. (±5)"],
      ["NOS OF PLY", "AS PER P.O."],
      ["BURSTING STRENGTH(KG/CM2)", "3PLY: 9 ± 1\n5PLY: 12 ± 1\n7PLY: 15 ± 1"],
      ["COMPRESSION STRENGTH(KGS)", "3PLY: 200 ± 35\n5PLY: 250 ± 50\n7PLY: 350 ± 75"],
    ],
  },
  "qc-label-stock": {
    title: "Inspection Record - Label Stock",
    formatNo: "F/QC/03",
    columns: OBSERVATION,
    rows: [
      ["SIZE (mm)", "Should be as per P.O."],
      ["TOTAL GSM (GSM)", "Should be as per P.O."],
      ["FACE PAPER (GSM)", "Should be as per P.O.\nTolerance: ± 5 G.S.M / micron"],
      ["ADHESIVE COATING (GSM)", "Should be as per P.O.\nTolerance: ± 2 G.S.M"],
      ["RELEASE LINER (GSM)", "Should be as per P.O.\nTolerance: ± 5 G.S.M"],
      ["TYPE OF ADHESIVE", "Should be as per P.O."],
      ["FACE PAPER THICKNESS (µm)", "Should be as per P.O./ TDS\nTolerance: ± 5 micron"],
      ["RELEAE LINER THICKNES (µm)", "Should be as per P.O./ TDS\nTolerance: ± 5 micron"],
      ["MIN. LENGTH PER REEL (meters)", "MIN: 1800 meters\nMax: 2400 meters."],
      ["PEEL ADHESION @ 180 DEGREE", "Should  be as per specification"],
    ],
  },
  "qc-paper-core": {
    title: "Inspection Record: Paper Core",
    formatNo: "F/QC/04",
    columns: SAMPLES,
    rows: [
      ["OUTER DIA (mm)", "90 (+2.0 / -1.0)"],
      ["INNER DIA (mm)", "76 (+2.0 / -0.0)"],
      ["THICKNESS (mm)", "7 (± 0.50)"],
      ["LENGTH (mm)", "As per PO ((± 5)"],
      ["MOISTURE CONTENT (%)", "Max 15%"],
      ["BRUSTING STRENGTH (kg/cm²)", "As per supplier COA"],
    ],
  },
  "qc-pvc-pet-film": {
    title: "Inspection Record - PVC / PET Film",
    formatNo: "F/QC/05",
    columns: OBSERVATION,
    rows: [
      ["SIZE (mm)", "Should be as per P.O. (±2)"],
      ["SHRINKAGE RATIO (%))", "Should be as per Specification & P.O.\nPVC BLOWN:\nTD: 50 ± 2 %   MD: 0 TO 6 %\nPVC CAST:\nTD: 60 ± 2 % MD: 0 TO 6 %\nPET:\nTD: 75 ± 2 %   MD: 0 TO 6 %"],
      ["THICKNESS (µm)", "As per P.O Tolerance ± 5%"],
      ["CORONA TREATMENT (Dynes)", "Both side Min. 36 dynes"],
    ],
  },
  "qc-offset-ink": {
    title: "Inspection Record – Offset Ink",
    formatNo: "F/QC/18",
    columns: OBSERVATION,
    rows: [
      ["CODE NO.", "As per PO"],
      ["SHADE", "Should match to the master or the specimen Or To Pantone Code No"],
      ["SPECTROMETER SHADE RANGE (dE)", "Delta Value DE should be below 3.0"],
      ["SKINNING", "Very thick top layer skinning & solid particles not acceptable"],
      ["FLOW RATE", "Max. 120 mm (Except Silver  & Gold ink)"],
      [
        "DRYING TEST",
        "By Thumb Impression : No Inking of the thumb after rubbing the roll up of one big & one small drop of ink dried for 24 hrs.\nOn Glass surface : For Solid Print Immediately drying (with in 1 hrs) For small drops of ink dried for 24hrs",
      ],
      ["ALKALI RESISTANCE (AR TEST)", "If Specified in P.O. then No fading of ink roll up in 2% NaOH Solution for 24hrs"],
      ["SOAP RESISTANCE (SR TEST)", "If Specified in P.O. then No staining of ink roll up to 20 % soap jelly kept for 24hrs"],
      ["LIGHT FASTNESS TEST", "No fading of the ink roll up when exposed to direct sun for 80hrs."],
    ],
  },
  "qc-duplex-board": {
    title: "Inspection Record – Duplex Board",
    formatNo: "F/QC/19",
    columns: OBSERVATION,
    rows: [
      ["Size (mm)", "As per PO"],
      ["Total GSM (gm/sq.m)", "As per PO"],
      ["BF", "As per PO"],
      ["Moisture (%)", "5.5% – 8.5%"],
      ["Cobb Value (gm/sq.m)", "Wire Side: 30–50 GSM\nFelt Side: 30-60 GSM"],
      ["Caliper (microns)", "N.A."],
      ["Bulk Density (gm/ccm)", "N.A."],
    ],
  },
  "qc-kraft-paper": {
    title: "Inspection Record – Kraft Paper & White Top Liner",
    formatNo: "F/QC/20",
    columns: OBSERVATION,
    rows: [
      ["Size (mm)", "As per PO"],
      ["Total GSM (gm/sq.m)", "As per PO"],
      ["BF", "As per PO"],
      ["Moisture (%)", "5.5% – 8.5%"],
      ["Cobb Value (gm/sq.m)", "For Kraft Paper: 30-50\nFor White Top Liner: 25-40"],
      ["Caliper (microns)", "N.A."],
      ["Bulk Density (gm/ccm)", "For Kraft Paper: 1.3+….\nFor White Top Liner: 1.1 +…."],
    ],
  },
  "qc-flexo-ink": {
    title: "Inspection Record – Flexo Ink",
    formatNo: "F/QC/21",
    columns: OBSERVATION,
    batch: "Batch number",
    rows: [
      ["Code no", "As per purchase order"],
      ["Shade", "Should match to the master or the specimen Or To Pantone Code No"],
      ["L Value", "-"],
      ["A Value", "-"],
      ["B Value", "-"],
      ["SPECTROMETER SHADE RANGE (dE)", "Delta Value DE should be below 2.0"],
    ],
  },
  "qc-lamination-adhesive-inspection": {
    title: "Inspection Record – Lamination Film Adhesive",
    formatNo: "F/QC/21",
    columns: OBSERVATION,
    rows: [
      ["SKINNING AND FOREIGN PARTICLES", "skinning of the top layer and foreign particles mixed in the adhesive is not acceptable"],
      ["VISCOSITY (sec)", "Viscosity is 15 to 20 secs, when measured with B4 Ford cup"],
      ["SOLID CONTENT (%)", "Min 40%"],
      ["GLOSS (%)", "Above 85% measured with 60˚ angle with Gloss meter"],
      ["FILM CLARITY", "Clear film After lamination"],
    ],
  },
  "qc-side-pasting-adhesive": {
    title: "Inspection Record – Side Pasting Adhesive",
    formatNo: "F/QC/22",
    columns: OBSERVATION,
    rows: [
      ["SKINNING AND FOREIGN PARTICLES", "skinning of the top layer and foreign particles mixed in the adhesive is not acceptable"],
      ["VISCOSITY (sec)", "Mixed of adhesive with 20% water, viscosity is 30 to 40 secs, when measured with B4 Ford cup"],
      ["SOLID CONTENT (%)", "Min 50"],
    ],
  },
  "qc-starch-powder": {
    title: "Inspection Record – Corrugation Starch Powder",
    formatNo: "F/QC/23",
    columns: OBSERVATION,
    rows: [
      ["APPERANCE.", "Milky White"],
      ["MOISTURE CONTAINT (%)", "Below 14"],
      ["RATIO", "1:2,1:3,1:4"],
      ["VISCOSITY.(SEC)", "30 ± 10"],
      ["SOLID CONTAINT (%)", "16 to 25"],
    ],
  },
  "qc-sheet-pasting-powder": {
    title: "Inspection Record – Sheet Pasting Powder",
    formatNo: "F/QC/24",
    columns: OBSERVATION,
    rows: [
      ["APPERANCE.", "Cremes to Brown Color"],
      ["MOISTURE CONTAINT (%)", "Below 14"],
      ["RATIO", "1:2,1:3,1:4,1:5,1:6"],
      ["VISCOSITY.(SEC)", "25 ± 60"],
      ["SOLID CONTAINT (%)", "16 to 30"],
    ],
  },
  "qc-incoming-lamination-film": {
    title: "Inspection Record – Incoming Lamination Grade Film",
    formatNo: "F/QC/33",
    columns: OBSERVATION,
    rows: [
      ["SIZE (mm)", "Should be as per P.O.  (+ 2/- 0.0)"],
      ["THICKNESS OF FILM (µm)", "As per P.O. (Max.± 1 micron)"],
      ["CORONA TREATMENT (Dynes)", "As per Films specification"],
      ["COF", "As per Films specification"],
      ["DART IMPACT", "As per Films specification"],
      ["ODOUR TEST", "No abnormal odour"],
    ],
  },
};

for (const [id, paper] of Object.entries(INCOMING)) {
  test(`${paper.formatNo} ${paper.title}: the paper's boxes two to a line, its columns, its ${paper.rows.length} printed lines and its footer, nothing of DCRS's`, async () => {
    const doc = docOf(id);
    assert.deepEqual([doc.name, doc.formatNo], [paper.title, paper.formatNo]);
    const layout = layoutOf(id);
    const header = paper.batch ? INCOMING_HEADER.map((l) => (l === "SAP Batch number" ? paper.batch! : l)) : INCOMING_HEADER;
    assert.deepEqual(layout.headerFields.map((f) => f.label), header, "read across, as the paper's two-column box reads");
    assert.equal(layout.headerColumns, 2);
    assert.deepEqual(layout.columns.map((c) => c.label), paper.columns);
    assert.ok(layout.rowMode.kind === "fixedRows");
    if (layout.rowMode.kind === "fixedRows") assert.deepEqual(layout.rowMode.rows.map((r) => [r.parameter, r.specification]), paper.rows);
    assert.deepEqual(layout.footerFields?.map((f) => f.label), INCOMING_FOOTER);
    assert.deepEqual(layout.footerFields?.find((f) => f.key === "lotStatus")?.options, ["ACCEPTED", "REJECT & SEND BACK TO SUPPLIER / SCRAP", "SEGREGATION", "ACCEPTED ON DEVIATION"]);
    // Below the grid: LOT STATUS and REASON a line each, the two signatures side by side.
    assert.deepEqual(
      boxGroups(layout, "footer").map((g) => [g.boxes.map((b) => b.field.key), g.perLine ?? null]),
      [
        [["lotStatus", "deviationReason"], 1],
        [["inspectedBy", "approvedBy"], 2],
      ]
    );
    assert.equal(layout.instructions, undefined, "nothing printed above the grid");
    assert.equal(layout.notesBelow, undefined);
    assert.deepEqual(layout.notesAtFoot, id === "qc-flexo-ink" ? [FLEXO_INK_SYSTEM_NOTE] : undefined);

    const html = await sheet(id);
    assert.deepEqual(headings(html), ["Sr. No.", ...paper.columns], "the paper's SR. NO., printed in capitals as every heading is");
    assert.deepEqual(boxLabels(html), [...header, ...INCOMING_FOOTER]);
    assert.match(html, /class="grid sheet-boxes-paper"[^>]*data-section="sheet-boxes"[^>]*style="--paper-box-columns:2/);
    const t = text(html);
    for (const [parameter] of paper.rows) assert.ok(t.includes(parameter.replace(/\s+/g, " ")), parameter);
    for (const w of DCRS_WORDS) assert.ok(!w.test(t), `${id}: ${w}`);
    if (id === "qc-flexo-ink") {
      const foot = html.indexOf('data-section="notes-at-foot"');
      assert.ok(foot > html.indexOf("APPROVED BY (QA MANAGER)"), "the system note at the foot, under the signatures");
      assert.ok(text(html.slice(foot)).includes(FLEXO_INK_SYSTEM_NOTE));
      assert.ok(!text(html.slice(0, html.indexOf("<table"))).includes("system generated"), "not above the grid any more");
    }
  });
}

test("F/QC/36 Inspection Record – Solvent Base Lamination Film: its seven boxes two to a line, three printed lines, both signatures", async () => {
  const id = "qc-inspection-sb-lamination";
  assert.deepEqual([docOf(id).name, docOf(id).formatNo], ["Inspection Record – Solvent Base Lamination Film", "F/QC/36"]);
  const layout = layoutOf(id);
  assert.deepEqual(layout.headerFields.map((f) => f.label), [
    "JOB CODE (FG CODE)", "PO NUMBER",
    "Date / SHIFT", "Laminated Roll number",
    "1st SUBSTRATE DETAILS", "2nd  SUBSTRATE DETAILS",
    "1st Pass / 2nd Pass / 3rd Pass",
  ]);
  assert.equal(layout.headerColumns, 2);
  assert.deepEqual(layout.columns.map((c) => c.label), OBSERVATION);
  assert.ok(layout.rowMode.kind === "fixedRows");
  if (layout.rowMode.kind === "fixedRows") {
    assert.deepEqual(layout.rowMode.rows.map((r) => [r.parameter, r.specification]), [
      ["COMPOSITE GSM (*)NA (IF JOB INVOLVES 2nd Pass / 3rd Pass Lamination process)", "FG Product Specification"],
      ["GREEN BOND STRENGTH (*) – ONLY FOR INDICATIVE PURPOSE", "NA"],
      ["ODOUR TEST", "No abnormal odour"],
    ]);
  }
  assert.deepEqual(layout.footerFields?.map((f) => f.label), ["LOT STATUS", "REASON FOR DEVIATION / REJECTION / SEGREGATION", "INSPECTED BY (QA INSPECTOR)", "APPROVED BY (QA MANAGER)"]);
  assert.deepEqual(layout.footerFields?.find((f) => f.key === "lotStatus")?.options, ["ACCEPTED", "REJECT / SCRAP", "SEGREGATION", "ACCEPTED ON DEVIATION"]);
  assert.ok(!layout.footerFields?.find((f) => f.key === "approvedBy")?.required, "the QA Manager's box is never asked of the inspector");
  assert.deepEqual(boxGroups(layout, "footer").map((g) => [g.boxes.length, g.perLine ?? null]), [[2, 1], [2, 2]]);
  assert.equal(layout.instructions, undefined);
  const html = await sheet(id);
  assert.deepEqual(headings(html), ["Sr. No.", ...OBSERVATION]);
  assert.ok(!html.includes("is the <strong>Verify</strong> step here"), "the form has its own APPROVED BY box, so the screen does not say it is the Verify step");
});

// ---------------------------------------------------------------------------
// 3. The certificates of analysis

test("F/QC/06 Certificate of Analysis [COA] For Label: every block under its own heading, in the paper's order, and nothing of DCRS's", async () => {
  const layout = layoutOf("qc-coa-label");
  assert.deepEqual(layout.instructions, COA_LETTERHEAD, "the letterhead's three lines under the company's name");
  assert.deepEqual(
    boxGroups(layout, "header").map((g) => [g.lines, g.perLine ?? null, g.boxes.map((b) => b.field.label)]),
    [
      [[], 3, ["Production Order No.", "Delivery No.", "COA Date :"]],
      [[], 1, ["Client Name"]],
      [[], 3, ["GP3 Code", "Client Item Code 1", "Client Item Code 2"]],
      [[], 1, ["Product Name"]],
      [["Specified Size"], 2, ["Client's Specified Size Length(mm)", "Client's Specified Size Width(mm)", "Tested Size Length(mm)", "Tested Size Width(mm)"]],
      [
        ["LABEL STOCK"],
        3,
        [
          "Face Material — Required", "Adhesive — Required", "Release Liner — Required",
          "Face Material — Tested", "Adhesive — Tested", "Release Liner — Tested",
          "Face Material — Type Required", "Adhesive — Type Required", "Release Liner — Type Required",
          "Face Material — Observed", "Adhesive — Observed", "Release Liner — Observed",
        ],
      ],
    ]
  );
  assert.deepEqual(layout.columns.map((c) => [c.group, c.label]), [["PRINTING", "No. of Colors"], ["PRINTING", "Given By Client"], ["PRINTING", "Color Shade Verified"]]);
  assert.ok(layout.rowMode.kind === "fixedRows" && layout.rowMode.rows.map((r) => r.colorNo).join(",") === "1,2,3,4,5,6,7,8,9,10");
  assert.ok(numbersOwnLines(layout), "the paper's own 1 to 10, no Sr. No. beside them");
  assert.deepEqual(
    boxGroups(layout, "footer").map((g) => [g.lines, g.table?.title ?? null, g.perLine ?? null, g.boxes.map((b) => b.field.printedLabel ?? b.field.label)]),
    [
      [[], null, 2, ["Shade Match Grade", "Remarks For Shade :", "Text  Matter Verification With Specified Art Work", "Remarks For Text Verification", "Bar Code Grade", "Bar Code Remarks"]],
      [["COATING"], null, 3, ["Coating Done :", "Minimum Gloss Required at 60° — Aqueous", "Minimum Gloss Required at 60° — U.V", "Minimum Gloss Required at 60° — Lamination", "Achieved Gloss", "Scuff Test"]],
      [["FINISHING"], null, 2, ["Finishing Quality Grade", "Die Cutting Type", "Die Cutting", "Rewinding Quality", "Emboss", "Packing Quality", "Foil Stamping", "Slitting Quality"]],
      [[], null, 1, ["Remarks For Finishing Quality", "Final Inspection", "Over All Quality Remarks"]],
      [[`● ${GRADE_SCALE_NOTE}`, `● ${SUPPLIER_COA_NOTE}`], "TOLERANCE", 1, ["This material should be retested on … before usage."]],
    ]
  );
  assert.deepEqual(layout.notesAtFoot, [SYSTEM_GENERATED_NOTE, ...CORPORATE_OFFICE]);

  // The seeded certificate of 04/01/2022, drawn signed off: every block in the paper's order.
  const html = await sheet("qc-coa-label", undefined, false);
  assert.deepEqual(headings(html), ["PRINTING", "No. of Colors", "Given By Client", "Color Shade Verified"]);
  assert.ok(
    ascending(order(html, [COA_LETTERHEAD[2], "Production Order No.", "Product Name", "Specified Size", "LABEL STOCK", "Release Liner — Observed", "PRINTING", "Shade Match Grade", "Bar Code Remarks", "COATING", "Scuff Test", "FINISHING", "Over All Quality Remarks", "TOLERANCE", GRADE_SCALE_NOTE, SUPPLIER_COA_NOTE, "This material should be retested on", "THIS IS A SYSTEM GENERATED DOCUMENT.", "Corporate Office :"]))
  );
  const t = text(html);
  for (const w of DCRS_WORDS) assert.ok(!w.test(t), String(w));
});

test("F/QC/07 Certificate of Analysis [COA] For Shrink Sleeves: SLEEVE FILM three to a line, its own FINISHING, the heat sentence above the retest sentence", async () => {
  const layout = layoutOf("qc-coa-sleeve");
  assert.deepEqual(layout.instructions, COA_LETTERHEAD);
  const header = boxGroups(layout, "header");
  assert.deepEqual(header[4].lines, ["Specified Size"]);
  assert.deepEqual(header[4].boxes.map((b) => b.field.label), ["Client's Specified Size Cut Length(mm)", "Client's Specified Size Open Width(mm)", "Tested Size Cut Length(mm)", "Tested Size Open Width(mm)"]);
  assert.deepEqual([header[5].lines, header[5].perLine, header[5].boxes.map((b) => b.field.label)], [
    ["SLEEVE FILM"],
    3,
    ["Thickness(Microns) Required", "Shrinkage Ratio (%) Required", "Type Required", "Thickness(Microns) Tested", "Shrinkage Ratio (%) Tested", "Type Tested"],
  ]);
  const footer = boxGroups(layout, "footer");
  assert.deepEqual(
    footer.map((g) => [g.lines[0] ?? null, g.perLine ?? null, g.boxes.map((b) => b.field.key)]),
    [
      [null, 2, ["shadeMatchGrade", "remarksForShade", "textMatterVerification", "remarksForTextVerification", "barCodeGrade", "barCodeRemarks"]],
      ["COATING", 3, ["coatingDone", "aqueous", "uv", "lamination", "achievedGloss", "scuffTest"]],
      ["FINISHING", 1, ["finishingQualityGrade"]],
      [null, 2, ["perforationQuality", "rewindingQuality", "holdingGlueQuality", "packingQuality", "whiteOpacity", "slittingQuality"]],
      [null, 1, ["remarksForFinishingQuality", "finalInspection", "overAllQualityRemarks"]],
      [`● ${GRADE_SCALE_NOTE}`, 1, ["retestOn"]],
    ]
  );
  assert.deepEqual(footer[5].lines, [`● ${GRADE_SCALE_NOTE}`, `● ${SUPPLIER_COA_NOTE}`, HEAT_SENSITIVE_NOTE]);
  assert.equal(footer[5].table?.title, "TOLERANCE");
  assert.deepEqual(footer[5].table?.columns, ["Field", "Cut Length", "Open Width", "Shrinkage Ration", "Microns"], "'Shrinkage Ration' as printed");
  assert.deepEqual(
    layout.footerFields?.filter((f) => ["aqueous", "uv", "lamination"].includes(f.key)).map((f) => f.label),
    ["Minimum Gloss Required at 60° — Aqueous", "Minimum Gloss Required at 60° — U.V", "Minimum Gloss Required at 60° — Lamination"],
    "the words the paper prints in front of the three"
  );
  const html = await sheet("qc-coa-sleeve", undefined, false);
  assert.ok(ascending(order(html, ["SLEEVE FILM", "PRINTING", "COATING", "FINISHING", "TOLERANCE", HEAT_SENSITIVE_NOTE, "This material should be retested on", "THIS IS A SYSTEM GENERATED DOCUMENT."])));
  const t = text(html);
  for (const w of DCRS_WORDS) assert.ok(!w.test(t), String(w));
});

test("F/QC/25 Certificate of Analysis [COA] For CORRUGATED BOXES: its heading block, Date:, its fourteen lines under Sr.No. and GSM, the two signatures", async () => {
  const layout = layoutOf("qc-coa-corrugated");
  assert.equal(layout.instructions?.length, 2);
  assert.match(layout.instructions![0], /308\/9, GIDC DEDIASAN MEHSANA\. GUJARAT\. — DEPT:QUALITY ASSURENCE \(2009 EDITION\) — DOC\.NO\. QA-IP-TRFCBA-011-00-01-09-18 — FG\(CO\) =FINISH GOODS \(CORRUGATION\)$/);
  assert.equal(layout.instructions![1], "CBA: CORRUGATED BOX ANALYSIS");
  assert.deepEqual(layout.headerFields.map((f) => f.label), ["Date:", "OID :-", "Job Code:"]);
  assert.deepEqual(layout.columns.map((c) => [c.group ?? "", columnHeading(c)]), [["", "Sr.No."], ["", ""], ["", ""], ["GSM", "Specified  GSM"], ["GSM", "Tested GSM"], ["", "BF"], ["", "Grade of Paper"]]);
  assert.ok(layout.rowMode.kind === "fixedRows");
  if (layout.rowMode.kind === "fixedRows") {
    assert.deepEqual(
      layout.rowMode.rows.map((r) => `${r.srNo} ${r.description}`),
      ["1 PARTY NAME", "2 JOB  NAME", "3 BOX SIZE", "4 BOX B.S.", "5 BOX C.S.", "6 BOX W.T.", "7 Material Specification", "7.1 TOP PAPER", "7.2 PLAIN PAPER", "7.3 FLUTE PAPER", "8 BOX PLY", "9 PRINTING  Details", "10 BOX STYLE", "11 STYLE OF FLUTE", "12 PUNCTURE", "13 ECT", "14 Rub Testing Report"]
    );
  }
  assert.deepEqual(boxGroups(layout, "footer").map((g) => [g.perLine ?? null, g.boxes.map((b) => b.field.label)]), [[2, ["Testing By (QA Inspector)", "Sign By (QA Manager)"]]]);
  const html = await sheet("qc-coa-corrugated");
  const t = text(html);
  for (const w of DCRS_WORDS) assert.ok(!w.test(t), String(w));
  assert.ok(!/>Description</.test(html) && !/>Observation</.test(html), "no heading the paper does not print");
});

// ---------------------------------------------------------------------------
// 4. The Nivea tolerance card

test("F-QC-19 Tolerance card for Beiersdorf AG. Germany: seven panels, each with its own APPROVED BY: and SIGN. :, no Sr. No., nothing of DCRS's", async () => {
  const id = "qc-tolerance-card-nivea";
  assert.deepEqual([docOf(id).name, docOf(id).formatNo], ["Tolerance Card for Beiersdorf AG. Germany", "F-QC-19"]);
  const layout = layoutOf(id);
  assert.equal(layout.instructions, undefined);
  assert.equal(layout.footerFields, undefined, "the approval is each panel's, not one for the card");
  assert.deepEqual(layout.columns.map((c) => [c.key, columnHeading(c)]), [["errorCategory", ""], ["approvedBy", "APPROVED BY:"], ["sign", "SIGN. :"]]);
  assert.ok(numbersOwnLines(layout));
  assert.ok(layout.rowMode.kind === "fixedRows");
  if (layout.rowMode.kind === "fixedRows") {
    assert.deepEqual(layout.rowMode.rows.map((r) => r.errorCategory), [
      "ERROR : MISREGISTRATION",
      "ERROR : MISREGISTRATION",
      "ERROR : MISREGISTRATION",
      "ERROR : OTHER",
      "ERROR : IN BATCH COADING AREA",
      "ERROR : IN NIVEA LOGO",
      "ERROR : IN PLAIN AREA",
    ]);
  }
  const html = await sheet(id);
  assert.deepEqual(headings(html), ["", "APPROVED BY:", "SIGN. :"]);
  const t = text(html);
  for (const w of DCRS_WORDS) assert.ok(!w.test(t), String(w));
  assert.ok(!t.includes("Sr. No."));
});

// ---------------------------------------------------------------------------
// 5. A format the plant edited before §111

test("a certificate edited before §111 loses DCRS's lines, keeps the paper's notes once, and takes the paper's groups and foot", () => {
  const issued = getIssuedLogSheetLayout("qc-coa-label")!;
  const strip = <T extends object>(o: T, keys: string[]): T => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k))) as T;
  const old: LogSheetLayout = {
    ...strip(issued, ["notesAtFoot", "headerColumns"]),
    instructions: [
      "Certificate of Analysis [COA] For Label. The certificate's own boxes and the LABEL STOCK block are above the grid; the PRINTING block's colours are the grid; the rest of PRINTING, the COATING block, the FINISHING block and the retest date are below it.",
      GRADE_SCALE_NOTE,
      SYSTEM_GENERATED_NOTE,
      "Our own line about the job.",
    ],
    headerFields: issued.headerFields.map((f) => strip(f, ["boxesPerLine", "printedAbove"])),
    footerFields: issued.footerFields!.map((f) => strip(f, ["boxesPerLine", "printedAbove", "tableAbove", "printedLabel"])),
  } as LogSheetLayout;
  try {
    saveFormatEdit("qc-coa-label", { revisionNo: "01", revisionDate: "2026-10-01", layout: old, revisions: [] });
    const now = getLogSheetLayout("qc-coa-label")!;
    assert.deepEqual(now.instructions, ["Our own line about the job."], "the plant's own line stays; DCRS's and the notes printed elsewhere now go");
    assert.deepEqual(now.notesAtFoot, [SYSTEM_GENERATED_NOTE, ...CORPORATE_OFFICE]);
    assert.deepEqual(boxGroups(now, "footer").map((g) => g.lines[0] ?? g.table?.title ?? null), [null, "COATING", "FINISHING", null, `● ${GRADE_SCALE_NOTE}`]);
    assert.equal(now.footerFields?.find((f) => f.key === "retestOn")?.tableAbove, "TOLERANCE");
  } finally {
    dropFormatEdit("qc-coa-label");
  }
});
