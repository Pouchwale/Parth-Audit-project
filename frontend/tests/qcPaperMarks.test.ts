// THE PAPER'S OWN MARKS ON THE INCOMING RECORDS AND THE CERTIFICATES (REQUIREMENTS §111, part 4, 13-Oct-2026).
//
// A third look at the originals in source-documents/qc-originals-2026-10-13/, this time at DCRS's own print beside
// each: the words and the boxes were the papers' already, but six things on the print were not.
//
//   - The incoming records and F/QC/36 print their LOT STATUS line as the four statuses across, for the inspector
//     to mark one ("LOT STATUS ⇒ ACCEPTED | REJECT & SEND BACK TO SUPPLIER / SCRAP | SEGREGATION | ACCEPTED ON
//     DEVIATION"); DCRS printed the chosen word alone (LogHeaderField.choicesAcross, engine/paperLayout.ts choiceWords).
//   - They head the signature boxes INSPECTED BY and APPROVED BY and print QA INSPECTOR and QA MANAGER under the space
//     each is signed in; F/QC/25 prints "(QA Inspector)" under "Testing By". DCRS printed "INSPECTED BY (QA INSPECTOR)"
//     (LogHeaderField.printedBelow with printedLabel; the names stay).
//   - Thirteen of the incoming records and F/QC/36 number their lines "1.", "2."; F/QC/21 Flexo Ink "1", "2"
//     (LogSheetLayout.srNoFullStop).
//   - DCRS printed its own "*" after a box that must be written ("Date of Inspection *").
//   - The certificates' headings are printed in the paper's letters ("Length(mm)"); the sheet's capitals made them
//     "LENGTH(MM)" (LogSheetLayout.headingsAsPrinted). Their retest date is written inside its sentence ("This
//     material should be retested on 03/07/2022 before usage."), not under it (LogHeaderField.inSentence), and
//     "Coating Done :" stands beside its value in its table's corner.
//   - F/QC/25's letterhead is three cells side by side; DCRS joined them into one line with dashes of its own
//     (ReferenceTable.untitled, drawn open above "Date:").
import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { DocumentDefinition, LogHeaderField, LogSheetData, LogSheetLayout, MasterData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { getIssuedLogSheetLayout, getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { dropFormatEdit, saveFormatEdit } from "../src/data/formatEdits";
import { COA_LABEL_SPECIMEN_HEADER, COA_LABEL_SPECIMEN_ROWS } from "../src/data/seed/qcCoaLayouts";
import { createDefaultData } from "../src/engine/recordDefaults";
import { boxGroups, choiceWords, srNoText } from "../src/engine/paperLayout";
import { logHeaderBind } from "../src/engine/roundTrip/bindingsFor";

// store/router.tsx reads window.location the moment it loads; the harness stands up none.
if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "#/dashboard", hostname: "localhost" }, configurable: true, writable: true });
}

ensureDocumentsSeeded();
ensureMasterSeeded();
const master: MasterData = masterRepository.get();
const DAY = "2026-10-14";
const root = process.cwd();
const css = readFileSync(path.join(root, "frontend", "src", "styles.css"), "utf8");

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
const footerBox = (id: string, key: string): LogHeaderField => {
  const f = layoutOf(id).footerFields?.find((x) => x.key === key);
  assert.ok(f, `${id} ${key}`);
  return f!;
};

/** The sheet as the record page draws it (components/records/LogSheetRecordView.tsx), as markup: what the print and the downloads are made from. */
async function sheet(documentId: string, data?: LogSheetData, editable = true): Promise<string> {
  const [view, auth, store, router] = await Promise.all([
    import("../src/components/records/LogSheetRecordView"),
    import("../src/store/AuthContext"),
    import("../src/store/AppStore"),
    import("../src/store/router"),
  ]);
  const record = {
    id: `marks-${documentId}`,
    documentId,
    periodKey: `${documentId}:${DAY}`,
    dueDate: DAY,
    status: editable ? "In Progress" : "Verified",
    isDemo: false,
    data: data ?? (createDefaultData(docOf(documentId), DAY, master) as LogSheetData),
    createdAt: `${DAY}T03:00:00.000Z`,
    updatedAt: `${DAY}T03:00:00.000Z`,
  } as RecordInstance<LogSheetData>;
  return renderToStaticMarkup(
    h(auth.AuthProvider, null, h(store.AppStoreProvider, null, h(router.RouterProvider, null, h(view.LogSheetRecordView, { doc: docOf(documentId), record, editable, onChange: () => undefined }))))
  );
}
/** A record of the document with these header boxes written. */
const withHeader = (id: string, header: Record<string, string>): LogSheetData => {
  const data = createDefaultData(docOf(id), DAY, master) as LogSheetData;
  return { ...data, header: { ...data.header, ...header } };
};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
/** The markup of the box whose box carries `marker`, from its opening <div class="field…"> to the next box. */
function boxMarkup(html: string, marker: string): string {
  const at = html.indexOf(marker);
  assert.ok(at >= 0, `the sheet holds ${marker}`);
  const start = html.lastIndexOf('<div class="field', at);
  const next = html.indexOf('<div class="field', at);
  return html.slice(start, next < 0 ? undefined : next);
}
/** The CSS inside every @media print block, as one text. */
const printCss = Array.from(css.matchAll(/@media print \{([\s\S]*?)\n\}/g), (m) => m[1]).join("\n");

/** The fourteen incoming material records (data/seed/qcIncomingLayouts.ts), and F/QC/36 beside them. */
const INCOMING = [
  "qc-bopp-film",
  "qc-corrugated-box",
  "qc-label-stock",
  "qc-paper-core",
  "qc-pvc-pet-film",
  "qc-offset-ink",
  "qc-duplex-board",
  "qc-kraft-paper",
  "qc-flexo-ink",
  "qc-lamination-adhesive-inspection",
  "qc-side-pasting-adhesive",
  "qc-starch-powder",
  "qc-sheet-pasting-powder",
  "qc-incoming-lamination-film",
];
const SB = "qc-inspection-sb-lamination";
const LOT = ["ACCEPTED", "REJECT & SEND BACK TO SUPPLIER / SCRAP", "SEGREGATION", "ACCEPTED ON DEVIATION"];

// ---------------------------------------------------------------------------
// 1. The LOT STATUS line: the four statuses printed across, the one that holds marked

test("the paper's words for a box's choices, the one the record holds marked; none for a box not printed so", () => {
  const lot = footerBox("qc-bopp-film", "lotStatus");
  assert.deepEqual(
    choiceWords(lot, "SEGREGATION"),
    LOT.map((option) => ({ option, word: option, chosen: option === "SEGREGATION" }))
  );
  assert.ok(choiceWords(lot, "")!.every((w) => !w.chosen), "nothing chosen on a blank record");
  assert.equal(choiceWords({ type: "select", options: ["A", "B"] }, "A"), null, "a box the paper does not print across");
  assert.equal(choiceWords({ type: "select", options: ["A", "B"], choicesAcross: ["A"] }, "A"), null, "words that do not match the options one for one");
  assert.equal(choiceWords({ type: "text", choicesAcross: ["A"] }, "A"), null, "only a choice box");
  assert.deepEqual(
    choiceWords({ type: "yesno", choicesAcross: ["YES", "NO"] }, "No")?.map((w) => [w.word, w.chosen]),
    [["YES", false], ["NO", true]]
  );
});

test("all fourteen incoming records and F/QC/36 print the LOT STATUS line across; Flexo Ink's first word is its own 'Accepted'", () => {
  for (const id of INCOMING) {
    const lot = footerBox(id, "lotStatus");
    assert.deepEqual(lot.options, LOT, `${id}: the record keeps the options as they were`);
    assert.deepEqual(lot.choicesAcross, id === "qc-flexo-ink" ? ["Accepted", ...LOT.slice(1)] : LOT, id);
  }
  const sb = footerBox(SB, "lotStatus");
  assert.deepEqual(sb.choicesAcross, ["ACCEPTED", "REJECT / SCRAP", "SEGREGATION", "ACCEPTED ON DEVIATION"]);
  assert.deepEqual(sb.choicesAcross, sb.options);
});

test("signed off, the LOT STATUS line shows the four words with the chosen one marked, and keeps its bound choice box for the downloads", async () => {
  const html = await sheet("qc-bopp-film", withHeader("qc-bopp-film", { lotStatus: "SEGREGATION" }), false);
  const box = boxMarkup(html, 'data-choices-across="lotStatus"');
  assert.match(box, /^<div class="field field-choices-across"><label>LOT STATUS<\/label>/, "beside its label, no longer a box to choose in");
  assert.match(box, /<select[^>]*data-bind="header\/lotStatus"[^>]*disabled=""/, "the record's bound box is still there (a screen reader, a downloaded file)");
  assert.match(box, /<span class="choices-across" aria-hidden="true" data-choices-across="lotStatus">/, "the printed words are words: out of a download");
  const words = Array.from(box.matchAll(/<span class="(choice-across(?: is-chosen)?)"( data-chosen="")?>([^<]*)<\/span>/g), (m) => [m[3].replace(/&amp;/g, "&"), m[1] === "choice-across is-chosen"]);
  assert.deepEqual(words, LOT.map((w) => [w, w === "SEGREGATION"]));
  // Flexo Ink prints "Accepted", and marks it when the record holds ACCEPTED.
  const flexo = boxMarkup(await sheet("qc-flexo-ink", withHeader("qc-flexo-ink", { lotStatus: "ACCEPTED" }), false), 'data-choices-across="lotStatus"');
  assert.match(flexo, /<span class="choice-across is-chosen" data-chosen="">Accepted<\/span>/);
});

test("open for writing, the LOT STATUS line is the choice box it was, and its words are what prints", async () => {
  const html = await sheet("qc-bopp-film");
  const box = boxMarkup(html, 'data-choices-across="lotStatus"');
  assert.match(box, /^<div class="field field-choices-across is-editable"><label>LOT STATUS<\/label><select class="input input-sm" data-bind="header\/lotStatus"/);
  assert.ok(!box.includes("disabled"), "it can be chosen in");
  assert.ok(!box.includes("is-chosen"), "nothing chosen yet");
  // On screen the words wait for the print; in print the choice box gives way to them; signed off, the box is kept off the screen but not out of the page.
  assert.match(css, /\.field-choices-across\.is-editable \.choices-across \{ display: none; \}/);
  assert.match(printCss, /\.field-choices-across\.is-editable \.choices-across \{ display: flex; \}/);
  assert.match(printCss, /\.field-choices-across select \{ display: none; \}/);
  assert.match(css, /\.field-choices-across:not\(\.is-editable\) select \{ position: absolute; width: 1px; height: 1px;/);
  assert.match(css, /\.field-choices-across \.choice-across\.is-chosen \{ border-color: currentColor; \}/, "the chosen one ringed, as a pen rings it");
});

// ---------------------------------------------------------------------------
// 2. The words under the signature boxes

test("each signature box is headed as the paper heads it, with its role printed under it; its name is unchanged", async () => {
  const expected: [string, string, [string, string, string][]][] = [
    ...INCOMING.map((id): [string, string, [string, string, string][]] => [id, "INSPECTED BY", [["inspectedBy", "INSPECTED BY (QA INSPECTOR)", "QA INSPECTOR"], ["approvedBy", "APPROVED BY (QA MANAGER)", "QA MANAGER"]]]),
    [SB, "INSPECTED BY", [["inspectedBy", "INSPECTED BY (QA INSPECTOR)", "QA INSPECTOR"], ["approvedBy", "APPROVED BY (QA MANAGER)", "QA MANAGER"]]],
    ["qc-coa-corrugated", "Testing By", [["testingBy", "Testing By (QA Inspector)", "(QA Inspector)"], ["signBy", "Sign By (QA Manager)", "(QA Manager)"]]],
  ];
  for (const [id, , boxes] of expected) {
    for (const [key, name, below] of boxes) {
      const f = footerBox(id, key);
      assert.equal(f.label, name, `${id} ${key}: the name Mitra, the checks and the history go by`);
      assert.equal(f.printedBelow, below, `${id} ${key}`);
      assert.equal(`${f.printedLabel} (${below.replace(/[()]/g, "")})`, name, `${id} ${key}: heading and role together are its name`);
      assert.equal(logHeaderBind(f)?.label, name, "a downloaded file names the box as before");
    }
  }
  // F/QC/36's inspector still signs; its QA Manager's box is never asked of the inspector.
  assert.equal(footerBox(SB, "inspectedBy").required, true);
  assert.ok(!footerBox(SB, "approvedBy").required);
  const html = await sheet("qc-bopp-film");
  assert.match(
    boxMarkup(html, 'data-printed-below="inspectedBy"'),
    /^<div class="field field-printed-below"><label>INSPECTED BY<\/label><input[^>]*data-bind="header\/inspectedBy"[^>]*\/><span class="box-printed-below" aria-hidden="true" data-printed-below="inspectedBy">QA INSPECTOR<\/span><\/div>/
  );
  assert.match(boxMarkup(html, 'data-printed-below="approvedBy"'), /<label>APPROVED BY<\/label>[\s\S]*>QA MANAGER<\/span>/);
  const coa = await sheet("qc-coa-corrugated");
  assert.match(boxMarkup(coa, 'data-printed-below="testingBy"'), /<label>Testing By<\/label>[\s\S]*>\(QA Inspector\)<\/span>/);
  assert.match(boxMarkup(coa, 'data-printed-below="signBy"'), /<label>Sign By<\/label>[\s\S]*>\(QA Manager\)<\/span>/);
  assert.ok(!text(html).includes("INSPECTED BY (QA INSPECTOR)"), "not the name with its role in brackets any more");
  // Below the grid the two still stand side by side.
  assert.deepEqual(boxGroups(layoutOf("qc-bopp-film"), "footer").map((g) => [g.boxes.map((b) => b.field.key), g.perLine ?? null]), [[["lotStatus", "deviationReason"], 1], [["inspectedBy", "approvedBy"], 2]]);
});

// ---------------------------------------------------------------------------
// 3. The Sr. No. with its full stop, and the screen's "*" off the paper

test("the incoming records and F/QC/36 number their lines '1.', as printed; Flexo Ink '1', as it prints", async () => {
  for (const id of [...INCOMING, SB]) {
    const layout = layoutOf(id);
    const want = id === "qc-flexo-ink" ? ["1", "2", "3"] : ["1.", "2.", "3."];
    assert.deepEqual([0, 1, 2].map((i) => srNoText(layout, i, "14-Oct-2026")), want, id);
  }
  assert.equal(srNoText(layoutOf("qc-viscosity"), 0, "14-Oct-2026"), "14-Oct-2026", "F-QC-30's date in its Sr. No. as before");
  assert.equal(srNoText(layoutOf("qc-adhesive-mixing"), 1, "14-Oct-2026"), "2", "every other sheet as before");
  const bopp = await sheet("qc-bopp-film");
  assert.deepEqual(Array.from(bopp.matchAll(/data-sr-no="">([^<]*)</g), (m) => m[1]), ["1.", "2.", "3.", "4."]);
  const flexo = await sheet("qc-flexo-ink");
  assert.deepEqual(Array.from(flexo.matchAll(/data-sr-no="">([^<]*)</g), (m) => m[1]), ["1", "2", "3", "4", "5", "6"]);
  // The format's designer numbers them the same way.
  const designer = readFileSync(path.join(root, "frontend", "src", "components", "documents", "SheetDesigner.tsx"), "utf8");
  assert.match(designer, /fullStop=\{!!layout\?\.srNoFullStop\}/);
});

test("the '*' of a box that must be written is the screen's mark and does not print", async () => {
  const html = await sheet("qc-bopp-film");
  assert.match(html, /<label>Date of Inspection<span class="no-print"> \*<\/span><\/label>/);
  assert.match(css, /\.no-print \{ display: none !important; \}|\.no-print \{ display: none !important/);
  const designer = readFileSync(path.join(root, "frontend", "src", "components", "documents", "SheetDesigner.tsx"), "utf8");
  assert.equal((designer.match(/required \? <span className="no-print"> \*<\/span> : ""/g) ?? []).length, 2, "nor on the format's designer");
});

// ---------------------------------------------------------------------------
// 4. The certificates: headings in the paper's letters, the retest date inside its sentence, Coating Done : beside its value

test("the certificates print their headings in the paper's letters — 'Length(mm)', not 'LENGTH(MM)' — and the incoming records as before", async () => {
  for (const id of ["qc-coa-label", "qc-coa-sleeve", "qc-coa-corrugated"]) {
    assert.equal(layoutOf(id).headingsAsPrinted, true, id);
    assert.match(await sheet(id), /<div class="headings-as-printed" data-bind-record="marks-/, id);
  }
  for (const id of INCOMING) assert.equal(layoutOf(id).headingsAsPrinted, undefined, `${id}: its paper prints its headings in capitals`);
  assert.match(css, /\.headings-as-printed \.doc-table th \{ text-transform: none; letter-spacing: 0; \}/);
  const designer = readFileSync(path.join(root, "frontend", "src", "components", "documents", "SheetDesigner.tsx"), "utf8");
  assert.match(designer, /className=\{layout\?\.headingsAsPrinted \? "headings-as-printed" : undefined\}/, "the format's designer shows them so too");
});

test("the retest date is written inside its sentence, on one line, and a download holds the date alone", async () => {
  for (const id of ["qc-coa-label", "qc-coa-sleeve"]) {
    assert.deepEqual(footerBox(id, "retestOn").inSentence, { before: "This material should be retested on", after: "before usage." }, id);
    assert.equal(footerBox(id, "retestOn").label, "This material should be retested on", `${id}: its name as before`);
  }
  const html = await sheet("qc-coa-label", { header: { ...COA_LABEL_SPECIMEN_HEADER }, rows: COA_LABEL_SPECIMEN_ROWS.map((r, i) => ({ id: `c-${i}`, ...r })) } as LogSheetData, false);
  assert.match(
    boxMarkup(html, 'class="field field-in-sentence"'),
    /^<div class="field field-in-sentence"><label>This material should be retested on<\/label><input class="input input-sm" data-bind="header\/retestOn"[^>]*type="date"[^>]*value="2022-07-03"\/><span class="field-sentence-after" aria-hidden="true">before usage\.<\/span><\/div>/
  );
  assert.ok(!text(html).includes("retested on … before usage"), "no longer the sentence with a gap and the date under it");
  assert.match(css, /\.field-in-sentence \{ flex-direction: row; flex-wrap: wrap; align-items: baseline; justify-content: center;/);
});

test("'Coating Done :' stands beside its value in the corner of the COATING table", async () => {
  const html = await sheet("qc-coa-label", { header: { ...COA_LABEL_SPECIMEN_HEADER }, rows: COA_LABEL_SPECIMEN_ROWS.map((r, i) => ({ id: `c-${i}`, ...r })) } as LogSheetData, false);
  assert.match(html, /<th class="paper-box-table-corner"><div class="field"><label>Coating Done :<\/label><input[^>]*data-bind="header\/coatingDone"[^>]*value="Gloss UV"/);
  assert.match(css, /\.doc-table table\.paper-box-table th\.paper-box-table-corner > \.field \{ flex-direction: row; align-items: baseline; gap: 8px; \}/);
});

// ---------------------------------------------------------------------------
// 5. F/QC/25's letterhead, as the paper's three cells

test("F/QC/25's letterhead is the paper's three cells side by side above Date:, not one line joined by dashes", async () => {
  const html = await sheet("qc-coa-corrugated");
  const at = html.indexOf('data-section="printed-table" data-table="Letterhead"');
  assert.ok(at > 0, "drawn open in its place");
  const table = html.slice(at, html.indexOf("</table>", at));
  assert.ok(!table.includes("<thead"), "no heading row");
  assert.ok(!table.includes(">Letterhead<"), "no title over it");
  const cells = Array.from(table.matchAll(/<td[^>]*style="[^"]*white-space:pre-line[^"]*"[^>]*>([\s\S]*?)<\/td>/g), (m) => m[1].replace(/&amp;/g, "&"));
  assert.equal(cells.length, 3, "three cells, their lines kept as the paper breaks them");
  assert.match(cells[0], /^GUJARAT PRINT PACK PUBLICATIONS PVT LTD\n308\/9, GIDC DEDIASAN\nMEHSANA\. GUJARAT\.$/);
  assert.equal(cells[1], "DEPT:QUALITY\nASSURENCE\n(2009 EDITION)");
  assert.equal(cells[2], "DOC.NO.\nQA-IP-TRFCBA-011-00-01-09-18\nFG(CO) =FINISH GOODS\n(CORRUGATION)");
  const t = text(html);
  assert.ok(!t.includes("GUJARAT. — DEPT") && !t.includes("EDITION) — DOC"), "no dashes of DCRS's own between them");
  const cba = html.indexOf("CBA: CORRUGATED BOX ANALYSIS");
  const date = html.indexOf("<label>Date:</label>");
  assert.ok(at < cba && cba < date, "the letterhead, the line under it, then Date:");
  // A table without a title or headings is the letterhead alone: the TOLERANCE is drawn as before.
  const coa = await sheet("qc-coa-label");
  assert.match(coa, /data-table="TOLERANCE"><p class="text-sm font-semibold mb-1">TOLERANCE<\/p>[\s\S]*?<thead>/);
});

// ---------------------------------------------------------------------------
// 6. The phone, the English of a Gujarati form and a format edited before §111 are told the marks too

test("an incoming record's format edited before §111 takes the marks from the issued layout; one that offers other statuses keeps its own words", () => {
  const issued = getIssuedLogSheetLayout("qc-bopp-film")!;
  const strip = <T extends object>(o: T, keys: string[]): T => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k))) as T;
  const marks = ["choicesAcross", "printedBelow", "printedLabel", "boxesPerLine", "paperColumn"];
  const old = {
    ...strip(issued, ["srNoFullStop", "headerColumns"]),
    headerFields: issued.headerFields.map((f) => strip(f, marks)),
    footerFields: issued.footerFields!.map((f) => strip(f, marks)),
  } as LogSheetLayout;
  try {
    saveFormatEdit("qc-bopp-film", { revisionNo: "02", revisionDate: "2026-10-01", layout: old, revisions: [] });
    const now = getLogSheetLayout("qc-bopp-film")!;
    assert.equal(now.srNoFullStop, true);
    assert.deepEqual(now.footerFields?.find((f) => f.key === "lotStatus")?.choicesAcross, LOT);
    assert.deepEqual(
      now.footerFields?.filter((f) => f.printedBelow).map((f) => [f.key, f.printedLabel, f.printedBelow]),
      [["inspectedBy", "INSPECTED BY", "QA INSPECTOR"], ["approvedBy", "APPROVED BY", "QA MANAGER"]]
    );
    // A plant that changed the statuses on offer: the paper's four words would print other statuses, so none are taken.
    const otherStatuses = { ...old, footerFields: old.footerFields!.map((f) => (f.key === "lotStatus" ? { ...f, options: ["OK", "NOT OK"] } : f)) } as LogSheetLayout;
    saveFormatEdit("qc-bopp-film", { revisionNo: "03", revisionDate: "2026-10-02", layout: otherStatuses, revisions: [] });
    assert.equal(getLogSheetLayout("qc-bopp-film")!.footerFields?.find((f) => f.key === "lotStatus")?.choicesAcross, undefined);
  } finally {
    dropFormatEdit("qc-bopp-film");
  }
});

test("the phone's layout and the English reading of a form carry the marks", () => {
  const entry = readFileSync(path.join(root, "frontend", "src", "engineHost", "entry.ts"), "utf8");
  for (const mark of ["choicesAcross", "printedBelow", "inSentence", "srNoFullStop"]) assert.ok(entry.includes(`{ ${mark}:`), `engineHost/entry.ts tells the phone ${mark}`);
  const words = readFileSync(path.join(root, "frontend", "src", "i18n", "documentText.ts"), "utf8");
  for (const mark of ["choicesAcross: f.choicesAcross.map(en)", "printedBelow: en(f.printedBelow)", "inSentence: { before: en(f.inSentence.before), after: en(f.inSentence.after) }"]) {
    assert.ok(words.includes(mark), mark);
  }
});
