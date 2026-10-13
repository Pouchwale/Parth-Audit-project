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
// Six layout abilities place them (engine/paperLayout.ts): boxes in the paper's groups under the lines and the
// table printed above them (LogHeaderField printedAbove, tableAbove, boxesPerLine), the text at the foot of the sheet
// (LogSheetLayout.notesAtFoot), a heading the paper leaves out (LogColumn.printedLabel); and, from the second look at
// the originals the same day, a box in its column of the line (LogHeaderField.paperColumn: Date of Inspection at the
// right), boxes as the paper's table (LogHeaderField.boxTable: the certificates' Specified Size, LABEL STOCK, SLEEVE
// FILM and COATING) and the grid printed across (LogSheetLayout.gridAcross: their PRINTING, colours 1 to 10 across).
//
// And Demo Mode's records of them read as real ones (engine/qcPaperSamples.ts, rule 3 of the brief), while a Live
// record is prepared with none of it (REQUIREMENTS §98).
import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import type { DocumentDefinition, LogSheetData, LogSheetLayout, MasterData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { hrMasterRepository, ensureSeeded as ensureHrMasterSeeded } from "../src/data/repositories/hrMasterRepository";
import { getIssuedLogSheetLayout, getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import {
  COA_LABEL_SPECIMEN_HEADER,
  COA_LABEL_SPECIMEN_ROWS,
  COA_LETTERHEAD,
  COA_SLEEVE_SPECIMEN_HEADER,
  COA_SLEEVE_SPECIMEN_ROWS,
  CORPORATE_OFFICE,
  GRADE_SCALE_NOTE,
  HEAT_SENSITIVE_NOTE,
  SUPPLIER_COA_NOTE,
  SYSTEM_GENERATED_NOTE,
} from "../src/data/seed/qcCoaLayouts";
import { FLEXO_INK_SYSTEM_NOTE } from "../src/data/seed/qcIncomingLayouts";
import { dropFormatEdit, saveFormatEdit } from "../src/data/formatEdits";
import { boxGroups, boxTableRows, columnHeading, inBoxTable, paperColumnProps, placedTables } from "../src/engine/paperLayout";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createDefaultData } from "../src/engine/recordDefaults";
import { numbersOwnLines } from "../src/engine/formLineNumbers";
import { autoFillRecord } from "../src/engine/autoFill";
import { prepareKnownParts } from "../src/engine/knownParts";
import { validateForSubmit } from "../src/engine/validation";
import { jobsFor } from "../src/engine/plantSimulation";
import { QC_PAPER_SAMPLE_DOCUMENTS } from "../src/engine/qcPaperSamples";

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
const boxLabels = (html: string) => Array.from(html.matchAll(/<div class="field[^"]*"[^>]*><label>([\s\S]*?)<\/label>/g), (m) => text(m[1]).replace(/\s*\*\s*$/, "").trim());
const decoded = (s: string) => s.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');
/** A cell's words as the page shows them: its text, then what each box in it holds (value="..."). */
const cellWords = (cell: string) =>
  [text(cell).trim(), ...Array.from(cell.matchAll(/<input[^>]*value="([^"]*)"/g), (m) => decoded(m[1]))].filter((w) => w !== "").join(" ");
/** Every table whose opening tag carries `marker`, as rows of cell words, in the order they stand on the sheet. */
const tablesWith = (html: string, marker: string): string[][][] =>
  Array.from(html.matchAll(new RegExp(`<table[^>]*${marker}[^>]*>([\\s\\S]*?)</table>`, "g")), (m) =>
    Array.from(m[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g), (r) => Array.from(r[1].matchAll(/<t([hd])[^>]*>([\s\S]*?)<\/t\1>/g), (c) => cellWords(c[2])))
  );
/** A supplied certificate as a record holds it: its header, and its colour lines each with an id. */
const certificate = (header: Record<string, string>, rows: Record<string, string>[]): LogSheetData =>
  ({ header: { ...header }, rows: rows.map((r, i) => ({ id: `colour-${i + 1}`, ...r })) }) as LogSheetData;
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

test("a box in its column of the line: Date of Inspection stands at the right, the cell before it empty; a phone takes it under the others", async () => {
  assert.deepEqual(paperColumnProps({ paperColumn: 2 }), { "data-paper-column": "2" });
  assert.deepEqual(paperColumnProps({}), {}, "every other box as it was");
  assert.deepEqual(paperColumnProps({ paperColumn: 1 }), {}, "the first column is where a box stands anyway");
  const html = await sheet("qc-bopp-film");
  assert.match(html, /<div class="field" data-paper-column="2"><label>Date of Inspection/);
  assert.equal(html.split("data-paper-column").length - 1, 1, "only the one box the paper puts there");
  const css = readFileSync(path.join(process.cwd(), "frontend", "src", "styles.css"), "utf8");
  assert.match(css, /\.sheet-boxes-paper > \[data-paper-column="2"\] \{ grid-column-start: 2; \}/);
  const phone = css.slice(css.indexOf('[data-paper-column="4"]'));
  assert.match(phone, /@media screen and \(max-width: 600px\) \{\s*\.sheet-boxes-paper \{ grid-template-columns: minmax\(0, 1fr\); \}\s*\.sheet-boxes-paper > \[data-paper-column\] \{ grid-column-start: auto; \}/);
});

test("boxes as the paper's table: a row of boxes at a time under its headings, each the record's own box, named for a screen reader", async () => {
  const table = { corner: "Material", columns: ["A", "B", "C"], rows: ["Required", "Tested"] };
  assert.deepEqual(boxTableRows(table, [1, 2, 3, 4, 5]), [[1, 2, 3], [4, 5, undefined]], "a row's spare cell is left empty");
  const coating = boxGroups(layoutOf("qc-coa-label"), "footer").find((g) => g.lines[0] === "COATING")!;
  assert.deepEqual([inBoxTable(coating, 0), inBoxTable(coating, 1), inBoxTable(coating, 5)], [false, true, true], "the corner box keeps its own label");
  const plain = boxGroups(layoutOf("qc-coa-label"), "footer")[0];
  assert.equal(inBoxTable(plain, 0), false);
  // The sheet open for writing: each cell is the box itself, bound where the record keeps it, with no label of its own.
  const html = await sheet("qc-coa-label");
  const stock = between(html, "LABEL STOCK", "</table>");
  assert.match(stock, /data-section="box-table"/);
  assert.equal((stock.match(/<label>/g) ?? []).length, 0, "the table's words head the boxes");
  for (const key of ["faceMaterialRequired", "adhesiveTested", "releaseLinerObserved"]) assert.match(stock, new RegExp(`data-bind="header/${key}"`), key);
  assert.match(stock, /aria-label="Face Material — Required"/);
  // The corner box: "Coating Done :" over its box, on the table's first line, a line like any other (not a heading a file keeps as words).
  const coatingTable = between(html, ">COATING<", "</table>");
  assert.ok(!coatingTable.includes("<thead"), "no heading row: the corner holds a box");
  assert.match(coatingTable, /<th class="paper-box-table-corner"><div class="field"><label>Coating Done :<\/label><input[^>]*data-bind="header\/coatingDone"/);
});

test("the grid printed across: each line a column, each column a line, the record's cells bound as on any grid, no Sr. No.", async () => {
  const layout = layoutOf("qc-coa-label");
  assert.equal(layout.gridAcross, true);
  const html = await sheet("qc-coa-label");
  const [printing] = tablesWith(html, "data-across");
  assert.deepEqual(printing[0], ["PRINTING"]);
  assert.deepEqual(printing[1], ["No. of Colors", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
  assert.deepEqual(printing.slice(2).map((r) => [r[0], r.length]), [["Given By Client", 11], ["Color Shade Verified", 11]]);
  const across = between(html, "data-across", "</table>");
  assert.equal((across.match(/data-bind="rows\/@[^"]+\/givenByClient"/g) ?? []).length, 10, "a box per colour, bound to its own line");
  assert.equal((across.match(/data-bind="rows\/@[^"]+\/colorShadeVerified"/g) ?? []).length, 10);
  assert.ok(!/data-bind="rows\/@[^"]+\/colorNo"/.test(across), "the printed numbers are printed, not boxes");
  assert.ok(!text(html).includes("Sr. No."), "the certificate's own 1 to 10, no Sr. No. of the sheet's");
  assert.ok(!/<table class="compact log-sheet( is-editing)?"/.test(html), "and no grid drawn down the page besides");
  // The format's designer says so where it designs the lines (components/documents/SheetDesigner.tsx).
  const designer = readFileSync(path.join(process.cwd(), "frontend", "src", "components", "documents", "SheetDesigner.tsx"), "utf8");
  assert.match(designer, /data-section="designer-across-note"/);
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
    assert.deepEqual(
      layout.headerFields.filter((f) => f.paperColumn !== undefined).map((f) => [f.key, f.paperColumn]),
      [["dateOfInspection", 2]],
      "Date of Inspection in the right-hand column of the fourth line, as printed"
    );
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
    assert.match(html, /<div class="field" data-paper-column="2"><label>Date of Inspection/);
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

test("F/QC/36 Inspection Record – Solvent Base Lamination Film: its boxes two to a line and the pass alone on the last, three printed lines, both signatures", async () => {
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
  assert.deepEqual(
    boxGroups(layout, "header").map((g) => [g.boxes.length, g.perLine ?? null]),
    [[6, 2], [1, 1]],
    "the header box's last line is the pass alone, its answer the width of the sheet"
  );
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

/** A group as the paper draws it: the lines over it, its table's headings or how many boxes stand to a line, its boxes. */
const groupShape = (g: ReturnType<typeof boxGroups>[number]) => [
  g.lines,
  g.boxTable ? { corner: g.boxTable.corner ?? null, cornerBox: !!g.boxTable.cornerBox, columns: g.boxTable.columns, rows: g.boxTable.rows } : (g.perLine ?? null),
  g.boxes.map((b) => b.field.printedLabel ?? b.field.label),
];

test("F/QC/06 Certificate of Analysis [COA] For Label: every block under its own heading, its tables as the paper's, in the paper's order, and nothing of DCRS's", async () => {
  const layout = layoutOf("qc-coa-label");
  assert.deepEqual(layout.instructions, COA_LETTERHEAD, "the letterhead's three lines under the company's name");
  assert.deepEqual(boxGroups(layout, "header").map(groupShape), [
    [[], 3, ["Production Order No.", "Delivery No.", "COA Date :"]],
    [[], 1, ["Client Name"]],
    [[], 3, ["GP3 Code", "Client Item Code 1", "Client Item Code 2"]],
    [[], 1, ["Product Name"]],
    [
      [],
      { corner: "Specified Size", cornerBox: false, columns: ["Length(mm)", "Width(mm)"], rows: ["Client's Specified Size", "Tested Size"] },
      ["Client's Specified Size Length(mm)", "Client's Specified Size Width(mm)", "Tested Size Length(mm)", "Tested Size Width(mm)"],
    ],
    [
      ["LABEL STOCK"],
      { corner: "Material", cornerBox: false, columns: ["Face Material", "Adhesive", "Release Liner"], rows: ["Required", "Tested", "Type Required", "Observed"] },
      [
        "Face Material — Required", "Adhesive — Required", "Release Liner — Required",
        "Face Material — Tested", "Adhesive — Tested", "Release Liner — Tested",
        "Face Material — Type Required", "Adhesive — Type Required", "Release Liner — Type Required",
        "Face Material — Observed", "Adhesive — Observed", "Release Liner — Observed",
      ],
    ],
  ]);
  assert.deepEqual(layout.columns.map((c) => [c.group, c.label]), [["PRINTING", "No. of Colors"], ["PRINTING", "Given By Client"], ["PRINTING", "Color Shade Verified"]]);
  assert.ok(layout.rowMode.kind === "fixedRows" && layout.rowMode.rows.map((r) => r.colorNo).join(",") === "1,2,3,4,5,6,7,8,9,10");
  assert.ok(numbersOwnLines(layout), "the paper's own 1 to 10, no Sr. No. beside them");
  assert.equal(layout.gridAcross, true, "printed across, as the paper prints it");
  const minGloss = { corner: null, cornerBox: true, columns: ["Aqueous", "U.V", "Lamination", "Achieved Gloss", "Scuff Test"], rows: ["Minimum Gloss Required at 60°"] };
  assert.deepEqual(
    boxGroups(layout, "footer").map((g) => [...groupShape(g), g.table?.title ?? null]),
    [
      [[], 2, ["Shade Match Grade", "Remarks For Shade :", "Text  Matter Verification With Specified Art Work", "Remarks For Text Verification", "Bar Code Grade", "Bar Code Remarks"], null],
      [["COATING"], minGloss, ["Coating Done :", "Minimum Gloss Required at 60° — Aqueous", "Minimum Gloss Required at 60° — U.V", "Minimum Gloss Required at 60° — Lamination", "Achieved Gloss", "Scuff Test"], null],
      [["FINISHING"], 2, ["Finishing Quality Grade", "Die Cutting Type", "Die Cutting", "Rewinding Quality", "Emboss", "Packing Quality", "Foil Stamping", "Slitting Quality"], null],
      [[], 1, ["Remarks For Finishing Quality", "Final Inspection", "Over All Quality Remarks"], null],
      [[`● ${GRADE_SCALE_NOTE}`, `● ${SUPPLIER_COA_NOTE}`], 1, ["This material should be retested on … before usage."], "TOLERANCE"],
    ]
  );
  assert.deepEqual(layout.notesAtFoot, [SYSTEM_GENERATED_NOTE, ...CORPORATE_OFFICE]);

  // The supplied certificate of 04/01/2022, drawn signed off: its tables read as the paper's, every block in the paper's order.
  const html = await sheet("qc-coa-label", certificate(COA_LABEL_SPECIMEN_HEADER, COA_LABEL_SPECIMEN_ROWS), false);
  assert.deepEqual(tablesWith(html, 'data-section="box-table"'), [
    [
      ["Specified Size", "Length(mm)", "Width(mm)"],
      ["Client's Specified Size", "70", "115"],
      ["Tested Size", "70", "115"],
    ],
    [
      ["Material", "Face Material", "Adhesive", "Release Liner"],
      ["Required", "80 GSM /Microns", "27 GSM", "60 GSM"],
      ["Tested", "80 GSM/Microns", "26 GSM", "59 GSM"],
      ["Type Required", "Chromo", "HotMelt", "Glassine"],
      ["Observed", "Chromo", "Rubber Based (Hot Melt)", "Glassine Paper"],
    ],
    [
      ["Coating Done : Gloss UV", "Aqueous", "U.V", "Lamination", "Achieved Gloss", "Scuff Test"],
      ["Minimum Gloss Required at 60°", "35%", "72%", "75%", "84.00%", "2 lbs, 100 rounds Okay"],
    ],
  ]);
  assert.deepEqual(tablesWith(html, "data-across"), [
    [
      ["PRINTING"],
      ["No. of Colors", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
      ["Given By Client", "Cyan", "Magenta", "Yellow", "Black", "Blue", "P.151C", "", "", "", ""],
      ["Color Shade Verified", "OK", "OK", "OK", "OK", "OK", "OK", "", "", "", ""],
    ],
  ]);
  assert.ok(
    ascending(order(html, [COA_LETTERHEAD[2], "Production Order No.", "Product Name", "Specified Size", "LABEL STOCK", "Observed", "PRINTING", "Shade Match Grade", "Bar Code Remarks", "COATING", "Scuff Test", "FINISHING", "Over All Quality Remarks", "TOLERANCE", GRADE_SCALE_NOTE, SUPPLIER_COA_NOTE, "This material should be retested on", "THIS IS A SYSTEM GENERATED DOCUMENT.", "Corporate Office :"]))
  );
  const t = text(html);
  for (const w of DCRS_WORDS) assert.ok(!w.test(t), String(w));
});

test("F/QC/07 Certificate of Analysis [COA] For Shrink Sleeves: its Specified Size and SLEEVE FILM tables, its own FINISHING, the heat sentence above the retest sentence", async () => {
  const layout = layoutOf("qc-coa-sleeve");
  assert.deepEqual(layout.instructions, COA_LETTERHEAD);
  assert.equal(layout.gridAcross, true);
  const header = boxGroups(layout, "header");
  assert.deepEqual(groupShape(header[4]), [
    [],
    { corner: "Specified Size", cornerBox: false, columns: ["Cut Length(mm)", "Open Width(mm)"], rows: ["Client's Specified Size", "Tested Size"] },
    ["Client's Specified Size Cut Length(mm)", "Client's Specified Size Open Width(mm)", "Tested Size Cut Length(mm)", "Tested Size Open Width(mm)"],
  ]);
  assert.deepEqual(groupShape(header[5]), [
    ["SLEEVE FILM"],
    { corner: "Material", cornerBox: false, columns: ["Thickness(Microns)", "Shrinkage Ratio (%)", "Type"], rows: ["Required", "Tested"] },
    ["Thickness(Microns) Required", "Shrinkage Ratio (%) Required", "Type Required", "Thickness(Microns) Tested", "Shrinkage Ratio (%) Tested", "Type Tested"],
  ]);
  const footer = boxGroups(layout, "footer");
  assert.deepEqual(
    footer.map((g) => [g.lines[0] ?? null, g.boxTable ? "table" : (g.perLine ?? null), g.boxes.map((b) => b.field.key)]),
    [
      [null, 2, ["shadeMatchGrade", "remarksForShade", "textMatterVerification", "remarksForTextVerification", "barCodeGrade", "barCodeRemarks"]],
      ["COATING", "table", ["coatingDone", "aqueous", "uv", "lamination", "achievedGloss", "scuffTest"]],
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
  const html = await sheet("qc-coa-sleeve", certificate(COA_SLEEVE_SPECIMEN_HEADER, COA_SLEEVE_SPECIMEN_ROWS), false);
  assert.deepEqual(tablesWith(html, 'data-section="box-table"'), [
    [
      ["Specified Size", "Cut Length(mm)", "Open Width(mm)"],
      ["Client's Specified Size", "152.40", "168.00"],
      ["Tested Size", "152", "168"],
    ],
    [
      ["Material", "Thickness(Microns)", "Shrinkage Ratio (%)", "Type"],
      ["Required", "40", "50", "Centroiid Plastopack PVC Blown 40 mic 200 mm"],
      ["Tested", "40", "49", "PVC Blown"],
    ],
    [
      ["Coating Done : Matt UV", "Aqueous", "U.V", "Lamination", "Achieved Gloss", "Scuff Test"],
      ["Minimum Gloss Required at 60°", "35%", "72%", "75%", "50%", "2 lbs, 100 rounds Okay"],
    ],
  ]);
  assert.deepEqual(tablesWith(html, "data-across")[0].slice(1), [
    ["No. of Colors", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
    ["Given By Client", "Cyan", "Magenta", "Yellow", "Black", "Gold", "", "", "", "", ""],
    ["Color Shade Verified", "OK", "OK", "OK", "OK", "OK", "", "", "", "", ""],
  ]);
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
  // "Date:" alone at the right above the grid, then OID :- and Job Code: side by side.
  assert.equal(layout.headerColumns, 2);
  assert.deepEqual(layout.headerFields.map((f) => f.paperColumn ?? null), [2, null, null]);
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
  assert.match(html, /style="--paper-box-columns:2[^"]*"><div class="field" data-paper-column="2"><label>Date:<\/label>/);
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

test("a sheet with nothing printed above its grid draws nothing there — not even a stray 0", async () => {
  // The tolerance card and F-QC-30 have no boxes, no lines and no table above the grid. A count of
  // nothing written into the page as "0" between the header block and the grid was the first draw of §111's groups.
  for (const id of ["qc-tolerance-card-nivea", "qc-viscosity"]) {
    const html = await sheet(id);
    const before = text(html.slice(0, html.lastIndexOf("<", html.indexOf('class="doc-table'))));
    assert.ok(!/\s0\s*$/.test(before), `${id}: ${before.slice(-60)}`);
  }
});

// ---------------------------------------------------------------------------
// 5. A format the plant edited before §111

test("a certificate edited before §111 loses DCRS's lines, keeps the paper's notes once, and takes the paper's groups and foot", () => {
  const issued = getIssuedLogSheetLayout("qc-coa-label")!;
  const strip = <T extends object>(o: T, keys: string[]): T => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k))) as T;
  const old: LogSheetLayout = {
    ...strip(issued, ["notesAtFoot", "headerColumns", "gridAcross"]),
    instructions: [
      "Certificate of Analysis [COA] For Label. The certificate's own boxes and the LABEL STOCK block are above the grid; the PRINTING block's colours are the grid; the rest of PRINTING, the COATING block, the FINISHING block and the retest date are below it.",
      GRADE_SCALE_NOTE,
      SYSTEM_GENERATED_NOTE,
      "Our own line about the job.",
    ],
    headerFields: issued.headerFields.map((f) => strip(f, ["boxesPerLine", "printedAbove", "boxTable"])),
    footerFields: issued.footerFields!.map((f) => strip(f, ["boxesPerLine", "printedAbove", "tableAbove", "printedLabel", "boxTable"])),
  } as LogSheetLayout;
  try {
    saveFormatEdit("qc-coa-label", { revisionNo: "01", revisionDate: "2026-10-01", layout: old, revisions: [] });
    const now = getLogSheetLayout("qc-coa-label")!;
    assert.deepEqual(now.instructions, ["Our own line about the job."], "the plant's own line stays; DCRS's and the notes printed elsewhere now go");
    assert.deepEqual(now.notesAtFoot, [SYSTEM_GENERATED_NOTE, ...CORPORATE_OFFICE]);
    assert.deepEqual(boxGroups(now, "footer").map((g) => g.lines[0] ?? g.table?.title ?? null), [null, "COATING", "FINISHING", null, `● ${GRADE_SCALE_NOTE}`]);
    assert.equal(now.footerFields?.find((f) => f.key === "retestOn")?.tableAbove, "TOLERANCE");
    // The paper's tables and its colours across (the second look at the originals, 13-Oct-2026).
    assert.equal(now.gridAcross, true);
    assert.deepEqual(now.headerFields.find((f) => f.key === "faceMaterialRequired")?.boxTable?.rows, ["Required", "Tested", "Type Required", "Observed"]);
    assert.equal(now.footerFields?.find((f) => f.key === "coatingDone")?.boxTable?.cornerBox, true);
  } finally {
    dropFormatEdit("qc-coa-label");
  }
});

// ---------------------------------------------------------------------------
// 6. Demo Mode's records look real; a Live record holds nothing invented

const demoOf = (id: string, day = DAY): LogSheetData => {
  const filled = autoFillRecord(docOf(id), day, master, undefined);
  assert.ok(filled, id);
  return filled!.data as LogSheetData;
};
const hrNames = () => new Set(hrMasterRepository.all().map((p) => p.fullName));
const between2 = (v: unknown, lo: number, hi: number) => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) && n >= lo && n <= hi;
};
const INCOMING_IDS = Object.keys(INCOMING);

test("Demo Mode's incoming inspection is a lot: supplier, product, GRN, report and batch, every line read, inspected and approved by two people of HR Master Data", () => {
  const names = hrNames();
  const grns = new Set<string>();
  const reports = new Set<string>();
  for (const id of INCOMING_IDS) {
    const data = demoOf(id);
    const h = data.header;
    for (const k of ["supplierName", "productDescription", "grnQty", "reportNumber", "batchNumber", "grnNumber"]) assert.ok(String(h[k] ?? "").trim(), `${id}: ${k} is written`);
    assert.equal(h.dateOfInspection, DAY, `${id}: inspected on the record's day`);
    assert.equal(h.lotStatus, "ACCEPTED");
    assert.ok(names.has(h.inspectedBy) && names.has(h.approvedBy), `${id}: ${h.inspectedBy} / ${h.approvedBy} are on HR Master Data`);
    assert.notEqual(h.inspectedBy, h.approvedBy, `${id}: the QA inspector and the QA Manager are two people`);
    assert.equal(h.approvedBy, "Kapila Barad", "the QA Manager approves");
    assert.match(h.grnNumber, /^\d{5}$/);
    assert.ok(h.batchNumber.startsWith(`${h.grnNumber}/`), `${id}: the batch written GRN/batch, as the plant's own records write it`);
    assert.match(h.reportNumber, /^IR\/26-27\/\d{4}$/);
    grns.add(h.grnNumber);
    reports.add(h.reportNumber);
    const samples = data.rows.flatMap((r) => ("observation" in r ? [r.observation] : [r.sample1, r.sample2, r.sample3]));
    assert.ok(samples.every((v) => String(v ?? "").trim() !== ""), `${id}: every printed line is read`);
  }
  assert.ok(grns.size >= 10, "the day's lots each have a GRN of their own");
  assert.equal(reports.size, grns.size, "and a report number of their own");
});

test("Demo Mode's readings sit inside the specification the paper prints beside them", () => {
  const obs = (id: string, day: string) => demoOf(id, day).rows.map((r) => r.observation);
  const samplesOf = (id: string, day: string) => demoOf(id, day).rows.map((r) => [r.sample1, r.sample2, r.sample3]);
  for (const day of ["2026-06-03", "2026-08-21", DAY, "2027-01-12"]) {
    const bopp = demoOf("qc-bopp-film", day);
    const mic = Number(/(\d+) mic/.exec(bopp.header.productDescription)![1]);
    assert.ok(between2(bopp.rows[2].observation, mic - 1, mic + 1), `BOPP thickness ${bopp.rows[2].observation} inside ${mic} ± 1`);
    assert.ok(Number(/(\d+) dynes/.exec(String(bopp.rows[3].observation))![1]) >= 36, "corona at least 36 dynes");
    const box = samplesOf("qc-corrugated-box", day);
    assert.ok(box[2].every((v) => between2(v, 11, 13)) && box[3].every((v) => between2(v, 200, 300)), "5 ply: bursting 12 ± 1, compression 250 ± 50");
    const core = samplesOf("qc-paper-core", day);
    assert.ok(core[0].every((v) => between2(v, 89, 92)) && core[1].every((v) => between2(v, 76, 78)) && core[2].every((v) => between2(v, 6.5, 7.5)) && core[4].every((v) => between2(v, 0, 15)));
    const label = obs("qc-label-stock", day);
    assert.ok(between2(label[2], 75, 85) && between2(label[3], 25, 29) && between2(label[4], 55, 65) && between2(label[8], 1800, 2400));
    assert.equal(Number(label[1]), Number(label[2]) + Number(label[3]) + Number(label[4]), "the total GSM adds up");
    const ink = obs("qc-offset-ink", day);
    assert.ok(between2(ink[2], 0, 2.99) && between2(ink[4], 0, 120), "dE below 3.0, flow at most 120 mm");
    assert.ok(between2(obs("qc-flexo-ink", day)[5], 0, 1.99), "flexo dE below 2.0");
    const adhesive = obs("qc-lamination-adhesive-inspection", day);
    assert.ok(between2(adhesive[1], 15, 20) && between2(adhesive[2], 40, 100) && between2(adhesive[3], 85.01, 100));
    const side = obs("qc-side-pasting-adhesive", day);
    assert.ok(between2(side[1], 30, 40) && between2(side[2], 50, 100));
    const starch = obs("qc-starch-powder", day);
    assert.ok(between2(starch[1], 0, 13.99) && between2(starch[3], 20, 40) && between2(starch[4], 16, 25));
    const duplex = obs("qc-duplex-board", day);
    assert.ok(between2(duplex[3], 5.5, 8.5));
    const kraft = obs("qc-kraft-paper", day);
    assert.ok(between2(kraft[3], 5.5, 8.5) && between2(kraft[4], 30, 50) && between2(kraft[6], 1.3, 2));
    const film = demoOf("qc-incoming-lamination-film", day);
    const filmMic = Number(/(\d+) mic/.exec(film.header.productDescription)![1]);
    assert.ok(between2(film.rows[1].observation, filmMic - 1, filmMic + 1));
  }
});

test("Demo Mode's inspector had joined by the inspection's day", () => {
  const joined = new Map(hrMasterRepository.all().map((p) => [p.fullName, p.joiningDate]));
  for (const day of ["2025-11-04", "2026-01-20", "2026-02-27"]) {
    for (const id of INCOMING_IDS) {
      const who = demoOf(id, day).header.inspectedBy;
      const since = joined.get(who) ?? "";
      assert.ok(since === "" || since <= day, `${id} on ${day}: ${who} joined ${since}`);
    }
  }
});

test("Demo Mode's certificates: today's production order and date, tested figures inside the printed TOLERANCE, retest six months on", () => {
  const label = demoOf("qc-coa-label").header;
  assert.equal(label.coaDate, DAY);
  assert.match(label.productionOrderNo, /^\d{5}$/);
  assert.notEqual(label.productionOrderNo, "33858", "not the specimen's order");
  assert.ok(between2(label.testedLength, 68, 72) && between2(label.testedWidth, 113, 117), "length and width ± 2 mm");
  assert.ok(between2(label.faceMaterialTested, 72, 88) && between2(label.adhesiveTested, 25, 29) && between2(label.releaseLinerTested, 57, 63), "face ± 10 %, adhesive ± 2 GSM, liner ± 5 %");
  assert.equal(label.retestOn, "2027-04-13", "14-10-2026 → 13-04-2027, as 04/01/2022 → 03/07/2022");
  assert.equal(label.finalInspection, "Passed");
  const sleeve = demoOf("qc-coa-sleeve").header;
  assert.equal(sleeve.coaDate, DAY);
  assert.ok(between2(sleeve.testedCutLength, 150.4, 154.4) && between2(sleeve.testedOpenWidth, 166, 170) && between2(sleeve.thicknessTested, 36, 44) && between2(sleeve.shrinkageRatioTested, 47.5, 52.5));
  const box = demoOf("qc-coa-corrugated");
  assert.equal(box.header.date, DAY);
  assert.ok(box.header.oid && /^FGCO\d{4}$/.test(box.header.jobCode));
  assert.notEqual(box.header.testingBy, box.header.signBy);
  for (const row of box.rows) {
    if (["7.1", "7.2", "7.3"].includes(String(row.srNo))) assert.ok(row.specifiedGsm && row.testedGsm && row.bf && row.gradeOfPaper && !row.observation, `line ${row.srNo}: the four paper columns`);
    else if (row.srNo !== "7") assert.ok(row.observation && !row.testedGsm, `line ${row.srNo}: its observation`);
  }
  assert.ok(between2(box.rows[3].observation, 11, 13) && between2(box.rows[4].observation, 200, 300), "the box's B.S. and C.S. inside F/QC/02's 5 ply specification");
  const card = demoOf("qc-tolerance-card-nivea");
  assert.ok(card.rows.length === 7 && card.rows.every((r) => r.approvedBy === "Kapila Barad" && r.sign === "Kapila Barad"));
});

test("Demo Mode's F/QC/36 is the day's first laminated job, with its own films and composite GSM, and both signatures", () => {
  for (const day of ["2026-09-08", DAY]) {
    const data = demoOf("qc-inspection-sb-lamination", day);
    const job = jobsFor(day)[0];
    assert.equal(data.header.fgCode, job.fgCode);
    assert.equal(data.header.poNumber, job.poNo, "the same job and PO as the day's lamination sheets");
    assert.match(data.header.dateShift, new RegExp(`^${day.slice(8, 10)}\\.${day.slice(5, 7)}\\.${day.slice(0, 4)} / (1st|2nd)$`));
    assert.ok(data.header.substrate1 && data.header.substrate2 && data.header.inspectedBy && data.header.approvedBy);
    assert.notEqual(data.header.inspectedBy, data.header.approvedBy);
    assert.ok(between2(data.rows[0].observation, 30, 110), `composite GSM ${data.rows[0].observation}`);
  }
});

test("every Demo record of these papers can be submitted as it stands, and a Live record is prepared with none of it", () => {
  for (const id of QC_PAPER_SAMPLE_DOCUMENTS) {
    const demo = demoOf(id);
    const errors = validateForSubmit(docOf(id), { ...recordOf(id, demo), isDemo: true } as RecordInstance).errors;
    assert.deepEqual(errors, [], `${id}: ${errors.join(" | ")}`);
    const live = prepareKnownParts(docOf(id), DAY, master, undefined);
    if (!live) continue;
    const data = live.data as LogSheetData;
    const written = Object.entries(data.header).filter(([k, v]) => String(v ?? "").trim() !== "" && !/date/i.test(k));
    assert.deepEqual(written, [], `${id}: nothing but the date is written in a Live record's boxes`);
    const observed = data.rows.flatMap((r) => ["observation", "sample1", "sample2", "sample3", "approvedBy", "sign", "givenByClient", "testedGsm"].map((k) => r[k])).filter((v) => v !== undefined && v !== null && String(v).trim() !== "");
    assert.deepEqual(observed, [], `${id}: and nothing observed on its lines`);
  }
});
