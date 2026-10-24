// EVERY QC FORMAT EXACTLY AS THE PAPER (REQUIREMENTS §111, 13-Oct-2026).
//
// The owner sent the paper originals of F-QC-11, F-QC-12 and F-QC-32 and his marked picture of DCRS's F-QC-30
// ("make sure format would not be change any how"). Four things the paper does that a layout could not say
// before are layout abilities now, each honoured wherever a layout is read:
//   * a box the paper fills in print (LogHeaderField.printed) — F/QC/11's Device ID No, Location, Department,
//     Manufacturer;
//   * the day in the Sr. No. column (LogSheetLayout.srNoShowsDate) — set on no issued format since 14-Oct-2026 (the
//     owner: the Sr. No. column numbers the lines, the date is the header's); the ability stays for a designer;
//   * an entry of two lines (LogColumn.beneath with the layout's secondLine) — F/QC/12's "Deviation %" line;
//   * the paper's text below the grid (LogSheetLayout.notesBelow) — the PROCEDURE of F/QC/11 and F/QC/12;
// and an empty box prints empty. Then the four documents themselves, held to their originals
// (source-documents/qc-originals-2026-10-13/, and the WhatsApp picture of F-QC-30).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import type { DocumentDefinition, LogSheetData, LogSheetLayout, MasterData, RecordInstance } from "../src/types";
import { documentRepository, ensureSeeded as ensureDocumentsSeeded } from "../src/data/repositories/documentRepository";
import { masterRepository, ensureSeeded as ensureMasterSeeded } from "../src/data/repositories/masterRepository";
import { ensureSeeded as ensureHrMasterSeeded } from "../src/data/repositories/hrMasterRepository";
import { getIssuedLogSheetLayout, getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { CALIBRATION_PROCEDURE } from "../src/data/seed/qcCalibrationLayouts";
import { dropFormatEdit, saveFormatEdit } from "../src/data/formatEdits";
import { gridLines, printedBoxes, srNoText, withPrintedBoxes } from "../src/engine/paperLayout";
import { withComputedCells } from "../src/engine/computedCells";
import { createDefaultData } from "../src/engine/recordDefaults";
import { autoFillRecord } from "../src/engine/autoFill";
import { prepareKnownParts } from "../src/engine/knownParts";
import { applyAssistantPatch } from "../src/engine/recordPatch";
import { interviewPlan } from "../src/engine/guidedRecord";
import { validateForSubmit } from "../src/engine/validation";
import { logHeaderBind, logSheetBindings } from "../src/engine/roundTrip/bindingsFor";
import { documentFileBytes, type Cell, type ExportBlock } from "../src/utils/documentExport";
import { makeEnvelope, mapJson, mapSheetRows, parseMapJson, parseMapSheetRows, type ExportBinding, type ExportTableBinding } from "../src/engine/roundTrip/exportMap";
import { readUploadedFile, type ReadResult } from "../src/engine/roundTrip/readFile";
import { unzip, zipStored } from "../src/utils/xlsx";

// store/router.tsx reads window.location the moment it loads; the harness stands up none.
if (typeof (globalThis as { location?: unknown }).location === "undefined") {
  Object.defineProperty(globalThis, "location", { value: { hash: "#/dashboard", hostname: "localhost" }, configurable: true, writable: true });
}

ensureDocumentsSeeded();
ensureMasterSeeded();
ensureHrMasterSeeded();
const master: MasterData = masterRepository.get();

const VISCOSITY = "qc-viscosity"; // F-QC-30
const MIXING = "qc-adhesive-mixing"; // F-QC-32
const GSM = "qc-gsm-plate-calibration"; // F/QC/11
const SCALE = "qc-weight-scale-calibration"; // F/QC/12
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

function recordOf(documentId: string, data: LogSheetData, extra: Partial<RecordInstance> = {}): RecordInstance<LogSheetData> {
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
    ...extra,
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
  const record = recordOf(documentId, data);
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
// A sheet's grid headings and lines: its log-sheet table's, or (a paper drawn as its own table since §117 round 2 of
// 22-Oct-2026: F-QC-30, F-QC-32) the row it marks as its heading row, up to a blank between two blocks, and its record's
// lines (data-pt-line, not the paper's blank ones).
const isPaperTable = (html: string) => !html.includes("<thead") && html.includes("data-pt-heading");
const headings = (html: string) => {
  if (!isPaperTable(html)) return Array.from(between(html, "<thead", "</thead>").matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g), (m) => text(m[1]).trim());
  const cells = Array.from(between(html, "data-pt-heading", "</tr>").matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g), (m) => text(m[1]).trim());
  const gap = cells.indexOf("");
  return gap < 0 ? cells : cells.slice(0, gap);
};
const bodyRows = (html: string) =>
  isPaperTable(html)
    ? Array.from(between(html, 'data-paper-part="body"', "</table>").matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/g), (m) => ({ attrs: m[1], cells: Array.from(m[2].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g), (c) => ({ attrs: c[1], html: c[2], text: text(c[2]).trim() })) })).filter((r) => r.attrs.includes("data-pt-line") && !r.attrs.includes("pt-pad"))
    : Array.from(between(html, "<tbody", "</tbody>").matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/g), (m) => ({ attrs: m[1], cells: Array.from(m[2].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g), (c) => ({ attrs: c[1], html: c[2], text: text(c[2]).trim() })) }));

// ---------------------------------------------------------------------------
// 1. A box the paper prints (LogHeaderField.printed)

const GSM_PRINTED: Record<string, string> = { deviceIdNo: "1-54, 2-55, 3-56, 4-57", location: "LAB", department: "LAB", manufacturer: "Global Eng. Co. (GEC)" };

/**
 * The printed-box machinery is kept for a designer who chooses it; since REQUIREMENTS §117 no issued format prints a
 * read-only box (F/QC/11's four are editable, the paper's words their start). So the machinery is tested on a layout of
 * its own: F/QC/11 as §111 had it, with its four boxes printed, held as a format edit for the length of the test.
 */
function withGsmBoxesPrinted<T>(body: () => T): T {
  const issued = getIssuedLogSheetLayout(GSM)!;
  const printed: LogSheetLayout = {
    ...issued,
    headerFields: issued.headerFields.map((f) => (f.key in GSM_PRINTED ? { ...f, autoFill: undefined, printed: GSM_PRINTED[f.key] } : f)),
  };
  saveFormatEdit(GSM, { revisionNo: "01", revisionDate: "2026-10-01", layout: printed, revisions: [] });
  const done = (out: T): T => {
    dropFormatEdit(GSM);
    return out;
  };
  try {
    const out = body();
    return out instanceof Promise ? (out.then(done, (e) => { dropFormatEdit(GSM); throw e; }) as unknown as T) : done(out);
  } catch (e) {
    dropFormatEdit(GSM);
    throw e;
  }
}

test("a box the paper prints: written into every new record, and every record reads it whatever was typed there before", () => withGsmBoxesPrinted(() => {
  const layout = layoutOf(GSM);
  assert.deepEqual(Object.fromEntries(printedBoxes(layout).map((f) => [f.key, f.printed])), GSM_PRINTED);
  // A new record, the morning's known parts and Demo Mode's fill hold the paper's words.
  const blank = createDefaultData(docOf(GSM), DAY, master) as LogSheetData;
  for (const [k, v] of Object.entries(GSM_PRINTED)) assert.equal(blank.header[k], v, `a new record's ${k}`);
  const known = prepareKnownParts(docOf(GSM), DAY, master, undefined)!;
  for (const [k, v] of Object.entries(GSM_PRINTED)) assert.equal((known.data as LogSheetData).header[k], v, `the prepare's ${k}`);
  assert.ok(!known.notes.join(" ").includes("Device ID No"), "a printed box is not a standing value the person is told to check");
  const demo = autoFillRecord(docOf(GSM), DAY, master, undefined)!;
  for (const [k, v] of Object.entries(GSM_PRINTED)) assert.equal((demo.data as LogSheetData).header[k], v, `Demo Mode's ${k}`);

  // The owner's print of 12-Oct-2026 read "WS-2026-10 / QC Lab / Quality Control / ScaleCo": every record now reads the paper.
  const typed: LogSheetData = { header: { deviceIdNo: "WS-2026-10", location: "QC Lab", department: "Quality Control", manufacturer: "ScaleCo", serialNo: "SC123456" }, rows: [] };
  const shown = withComputedCells(GSM, typed);
  assert.deepEqual({ ...shown.header }, { ...GSM_PRINTED, serialNo: "SC123456" }, "the paper's words, and the serial number as typed");
  assert.equal(withPrintedBoxes(GSM, shown), shown, "the same object once it holds them");
  const other: LogSheetData = { header: { deviceIdNo: "QC-76" }, rows: [] };
  assert.equal(withPrintedBoxes(SCALE, other), other, "a form that prints no value in a box is left as it is");
  assert.equal(withPrintedBoxes("daily-pest-monitoring", other), other);
}));

test("a box the paper prints is never typed, uploaded, asked for or written by Mitra", () => withGsmBoxesPrinted(async () => {
  const layout = layoutOf(GSM);
  const device = layout.headerFields.find((f) => f.key === "deviceIdNo")!;
  assert.equal(logHeaderBind(device), null, "a downloaded file carries no place to change it");
  const data = createDefaultData(docOf(GSM), DAY, master) as LogSheetData;
  assert.ok(!logSheetBindings(layout, data).some((b) => Object.keys(GSM_PRINTED).some((k) => b.path === `header/${k}`)));
  assert.ok(logSheetBindings(layout, data).some((b) => b.path === "header/serialNo"), "the Serial No, which the paper leaves blank, is still written");

  const patched = applyAssistantPatch("log-sheet", GSM, data, { header: { deviceIdNo: "WS-2026-10", serialNo: "SC-9" } });
  assert.equal((patched.data as LogSheetData).header.deviceIdNo, GSM_PRINTED.deviceIdNo, "Mitra's patch leaves the printed value");
  assert.equal((patched.data as LogSheetData).header.serialNo, "SC-9", "...and writes the box beside it");
  assert.ok(patched.problems.some((p) => /Device ID No is printed on the form/.test(p)), patched.problems.join(" | "));
  const same = applyAssistantPatch("log-sheet", GSM, data, { header: { location: "LAB" } });
  assert.deepEqual(same.problems, [], "sending the printed value itself is no problem");

  const plan = interviewPlan(docOf(GSM), recordOf(GSM, data), data, master, DAY)!;
  const asked = plan.questions.map((q) => q.id);
  for (const k of Object.keys(GSM_PRINTED)) assert.ok(!asked.includes(`h-${k}`), `nothing is asked for ${k}`);
  assert.ok(asked.includes("h-serialNo"));
  const blankBoxes = recordOf(GSM, { header: {}, rows: data.rows });
  assert.ok(!validateForSubmit(docOf(GSM), blankBoxes).errors.some((e) => /Device ID No|Location|Manufacturer/.test(e)));

  const html = await sheet(GSM, { header: { deviceIdNo: "WS-2026-10" }, rows: data.rows }, true);
  for (const [k, v] of Object.entries(GSM_PRINTED)) assert.match(html, new RegExp(`data-printed="${k}"[^>]*>${v.replace(/[()]/g, "\\$&")}<`), `${k} reads as printed`);
  assert.ok(!html.includes("WS-2026-10"), "what was typed there before is not shown");
  assert.ok(!/data-bind="header\/deviceIdNo"/.test(html), "and there is no box to type into");
}));

test("F/QC/11's four boxes are editable since §117: the paper's words start every new sheet, and whatever is written stays", async () => {
  const layout = layoutOf(GSM);
  assert.deepEqual(printedBoxes(layout), [], "no issued format prints a read-only box");
  assert.deepEqual(Object.fromEntries(layout.headerFields.filter((f) => f.key in GSM_PRINTED).map((f) => [f.key, f.autoFill?.default])), GSM_PRINTED, "the paper's words are the start");
  const blank = createDefaultData(docOf(GSM), DAY, master) as LogSheetData;
  for (const [k, v] of Object.entries(GSM_PRINTED)) assert.equal(blank.header[k], v, `a new record's ${k}`);
  const known = prepareKnownParts(docOf(GSM), DAY, master, undefined)!;
  for (const [k, v] of Object.entries(GSM_PRINTED)) assert.equal((known.data as LogSheetData).header[k], v, `the prepare's ${k}`);
  // "Location: LAB" circled on the owner's print of 16-Oct-2026: the person writes another, and it stays.
  const typed: LogSheetData = { header: { ...blank.header, location: "QC Lab" }, rows: blank.rows };
  assert.equal((withComputedCells(GSM, typed) as LogSheetData).header.location, "QC Lab", "nothing writes the paper's word back over it");
  const patched = applyAssistantPatch("log-sheet", GSM, blank, { header: { location: "QC Lab" } });
  assert.deepEqual(patched.problems, []);
  assert.equal((patched.data as LogSheetData).header.location, "QC Lab", "Mitra may write it");
  assert.ok(logSheetBindings(layout, blank).some((b) => b.path === "header/location"), "a downloaded file carries a place to change it");
  const html = await sheet(GSM, typed, true);
  assert.match(html, /data-bind="header\/deviceIdNo"/, "a box to type into");
  assert.ok(!/data-printed=/.test(html), "no box drawn as printed words");
  assert.ok(html.includes("QC Lab"));
});

// ---------------------------------------------------------------------------
// 2. The Sr. No. column numbers the lines (srNoShowsDate on no issued format, the owner, 14-Oct-2026)

test("F-QC-30's Sr. No. numbers its lines; the date is the header's, never the column's", async () => {
  const layout = layoutOf(VISCOSITY);
  assert.equal(layout.srNoShowsDate, undefined);
  assert.equal(srNoText(layout, 0, "14-10-26"), "1");
  assert.equal(srNoText(layout, 1, "14-10-26"), "2");
  // The ability itself still reads as designed, for a designer who chooses it.
  assert.equal(srNoText({ ...layout, srNoShowsDate: true }, 0, "14-10-26"), "14-10-26");
  assert.equal(srNoText({ ...layout, srNoShowsDate: true }, 1, "14-10-26"), "");
  assert.equal(srNoText(layout, 22, "14-10-26"), "23");
  assert.equal(srNoText(layoutOf(MIXING), 2, "14-10-26"), "3", "every other sheet numbers its lines");
  const data = createDefaultData(docOf(VISCOSITY), DAY, master) as LogSheetData;
  const rows = bodyRows(await sheet(VISCOSITY, data));
  // 9:00 to 07:00, as the page is written: no 08:00 line (§111 part 6).
  assert.equal(rows.length, 23);
  assert.deepEqual(rows.map((r) => r.cells[0].text), rows.map((_, i) => String(i + 1)), "the Sr. No. numbers every line; the date is the header's");
  assert.deepEqual(
    rows.map((r) => r.cells[1].text),
    ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00", "00:00", "01:00", "02:00", "03:00", "04:00", "05:00", "06:00", "07:00"],
    "the hours under Date/Time"
  );
});

// ---------------------------------------------------------------------------
// 3. An entry of two lines (LogColumn.beneath, secondLine)

test("an entry of two lines: the columns beneath are drawn on the second line under the column each names, and the data stays one line", async () => {
  const layout = layoutOf(SCALE);
  const lines = gridLines(layout);
  assert.deepEqual(
    lines.first.map((c) => c.label),
    ["Date", "Tested By", "Weight 1", "Tested Value 1", "Weight 2", "Tested Value 2", "Weight 3", "Tested Value 3", "Weight 4", "Tested Value 4", "Weight 5", "Tested Value 5", "Pass / Fail", "Sign", "Next Due Date"]
  );
  assert.equal(lines.second?.label, "Deviation %");
  assert.deepEqual(
    lines.second!.under.map((c) => c?.key ?? null),
    [null, null, null, "deviation1", null, "deviation2", null, "deviation3", null, "deviation4", null, "deviation5", null, null, null],
    "each Deviation % under its Tested Value"
  );
  assert.equal(gridLines(layout), lines, "worked out once per layout");
  // A layout without a second line, or a column beneath the first column or beneath nothing, is drawn on one line.
  const plain: LogSheetLayout = { ...layout, secondLine: undefined };
  assert.equal(gridLines(plain).first.length, layout.columns.length);
  assert.equal(gridLines(plain).second, undefined);
  const odd: LogSheetLayout = { ...layout, columns: layout.columns.map((c) => (c.key === "deviation1" ? { ...c, beneath: "date" } : c.key === "deviation2" ? { ...c, beneath: "nothing" } : c)) };
  assert.deepEqual(gridLines(odd).first.filter((c) => c.beneath).map((c) => c.key), ["deviation1", "deviation2"]);

  // Drawn: no Deviation % heading, two lines per entry, the second headed "Deviation %".
  const filled = autoFillRecord(docOf(SCALE), DAY, master, undefined)!.data as LogSheetData;
  filled.rows[0].testedValue4 = "200.04 gm";
  const data = withComputedCells(SCALE, filled);
  assert.equal(data.rows[0].deviation4, "0.02%");
  const html = await sheet(SCALE, data, true);
  assert.deepEqual(headings(html), lines.first.map((c) => c.label), "the paper's headings, and no Sr. No.");
  // The paper's other three entries (§117 round 2: the paper prints four) are blank ruled lines of the page, never the record's:
  // drawn hidden from a reader and the downloads (aria-hidden), each second line headed Deviation % as printed.
  const all = bodyRows(html);
  const rows = all.filter((r) => !/pf-pad/.test(r.attrs));
  const pads = all.filter((r) => /pf-pad/.test(r.attrs));
  assert.equal(pads.length, (4 - data.rows.length) * 2, "the paper's four entries");
  assert.ok(pads.every((r) => /aria-hidden="true"/.test(r.attrs) && !/data-bind=/.test(r.cells.map((c) => c.html).join(""))));
  assert.equal(rows.length, data.rows.length * 2);
  assert.match(rows[0].attrs, /data-line="first"/);
  assert.match(rows[1].attrs, /data-line="second"/);
  assert.equal(rows[1].cells[0].text, "Deviation %");
  // No Sr. No. on this sheet: the first line's cells are the headings', and the second line's sit under them.
  assert.equal(rows[1].cells[9].text, "0.02%", "Deviation % 4 under Tested Value 4");
  assert.match(rows[1].cells[9].attrs, /data-beneath="deviation4"/);
  assert.deepEqual(rows[1].cells.map((c) => (/data-beneath/.test(c.attrs) ? "dev" : c.text)), ["Deviation %", "", "", "dev", "", "dev", "", "dev", "", "dev", "", "dev", "", "", ""]);
  assert.match(rows[0].cells[9].html, /data-bind="rows\/@[^"]+\/testedValue4"/, "Tested Value 4 is the first line's box");
  // A new week is a new record (§117) that starts with its one calibration; since the owner's 22-Oct-2026 a second one
  // the same week is a line added (Add Row), so the grid is an appendable table of two-line entries.
  assert.match(html, /data-bind-append/, "a line may be added to the week's sheet");
  assert.match(html, /data-bind-second-line="Deviation %"/);
  assert.equal(layout.rowMode.kind, "free", "the week's calibration, a line added when needed");
});

// ---------------------------------------------------------------------------
// 4. The paper's text below the grid (notesBelow), and empty boxes print empty

test("the PROCEDURE is printed below the grid, word for word, and DCRS's explanations are gone from above it", async () => {
  for (const id of [GSM, SCALE]) {
    const layout = layoutOf(id);
    assert.equal(layout.instructions, undefined, `${id}: nothing printed above the grid`);
    const html = await sheet(id, createDefaultData(docOf(id), DAY, master) as LogSheetData);
    const table = html.indexOf("</table>");
    const notes = html.indexOf('data-section="notes-below"');
    assert.ok(table > 0 && notes > table, `${id}: the notes come after the grid`);
    assert.ok(text(html.slice(notes)).includes(CALIBRATION_PROCEDURE), `${id}: the procedure word for word`);
    assert.ok(!text(html.slice(0, table)).includes("PROCEDURE"), `${id}: not above the grid`);
    assert.ok(!/worked out|One line per weekly calibration|The four plates/.test(text(html)), `${id}: no explanation of DCRS's own`);
    assert.match(html.slice(notes), /<strong>PROCEDURE:<\/strong>/);
  }
});

test("an empty date, time or choice box is marked, and the print rules print it empty (no dd-mm-yyyy)", async () => {
  const data = autoFillRecord(docOf(SCALE), DAY, master, undefined)!.data as LogSheetData;
  data.rows[0].nextDueDate = "";
  // With no Acceptable Tolerance written, Pass / Fail is left as the tester set it: here, not yet.
  data.header.acceptableTolerance = "";
  data.rows[0].passFail = "";
  const html = await sheet(SCALE, data, true);
  assert.match(html, /<input type="date"[^>]*data-bind="rows\/@[^"]+\/nextDueDate"[^>]*data-empty=""|<input type="date"[^>]*data-empty=""[^>]*data-bind="rows\/@[^"]+\/nextDueDate"/, "the empty Next Due Date is marked");
  assert.match(html, /<select[^>]*data-empty=""/, "the empty Pass / Fail is marked");
  assert.ok(!/<input type="date"[^>]*data-bind="rows\/@[^"]+\/date"[^>]*data-empty/.test(html), "a written date is not");
  const css = readFileSync(path.join(process.cwd(), "frontend", "src", "styles.css"), "utf8");
  const print = css.slice(css.indexOf("An empty field prints empty"));
  assert.match(print, /input\[data-empty\]::-webkit-datetime-edit \{ visibility: hidden; \}/);
  assert.match(print, /select\[data-empty\] \{ -webkit-text-fill-color: transparent; \}/);
  assert.match(print, /input::placeholder, textarea::placeholder \{ color: transparent !important; \}/);
});

// ---------------------------------------------------------------------------
// 5. A downloaded file's second line is never read as a new entry

const REC = "rec-paper-1";
const DOC = { id: SCALE, name: "Weekly Internal Calibration Records - Weight Scale", formatNo: "F/QC/12", revisionNo: "01" };
const EXPORTED_AT = "2026-10-13T10:00:00.000Z";
const SHEET = "xl/worksheets/sheet1.xml";
const GRID: ExportTableBinding = {
  recordId: REC,
  listPath: "rows",
  secondLine: "Deviation %",
  columns: [
    { key: "date", type: "date", options: [], col: 0, label: "Date" },
    { key: "weight1", type: "text", options: [], col: 1, label: "Weight 1" },
    { key: "testedValue1", type: "text", options: [], col: 2, label: "Tested Value 1" },
  ],
};
const bind = (p: string, type: ExportBinding["type"], t: string): ExportBinding => ({ path: p, type, text: t, label: p, options: [], recordId: REC });
const bound = (b: ExportBinding): Cell => ({ text: b.text, bind: b, parts: [{ text: b.text, bind: b }] });
const plainCell = (t: string): Cell => ({ text: t });
function twoLineBlocks(): ExportBlock[] {
  return [
    {
      kind: "table",
      headerRows: 1,
      bindTable: GRID,
      rows: [
        [plainCell("Date"), plainCell("Weight 1"), plainCell("Tested Value 1")],
        [bound(bind("rows/@r-1/date", "date", "14-10-26")), bound(bind("rows/@r-1/weight1", "text", "50.000gm")), bound(bind("rows/@r-1/testedValue1", "text", "50.000gm"))],
        [plainCell("Deviation %"), plainCell(""), plainCell("0%")],
      ],
    },
  ];
}
const enc = new TextEncoder();
const dec = new TextDecoder();
async function partsOf(bytes: Uint8Array): Promise<Map<string, string>> {
  const zip = await unzip(bytes.slice().buffer);
  const out = new Map<string, string>();
  for (const [name, get] of zip) out.set(name, dec.decode(await get()));
  return out;
}
const zipOf = (parts: Map<string, string>) => zipStored(Array.from(parts, ([name, t]) => ({ name, data: enc.encode(t) }))).slice().buffer;
async function read(bytes: ArrayBuffer, name: string): Promise<Extract<ReadResult, { ok: true }>> {
  const result = await readUploadedFile(bytes, name);
  if (!result.ok) assert.fail(`the file should read: ${result.reason} — ${result.message}`);
  return result;
}
const cellXml = (ref: string, t: string) => `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${t}</t></is></c>`;

test("a downloaded F/QC/12 keeps its second lines: one added in Excel or Word with its Deviation % line is one new entry", async () => {
  // The map carries the second line's heading, in the workbook's hidden sheet and in the Word file's part.
  const envelope = makeEnvelope("xlsx", { documentId: SCALE }, [REC], EXPORTED_AT);
  const table = { t: 0, recordId: REC, listPath: "rows", columns: GRID.columns, secondLine: "Deviation %" };
  assert.equal(parseMapSheetRows(mapSheetRows(envelope, [], [table]))?.tables[0].secondLine, "Deviation %");
  assert.equal(parseMapJson(mapJson(envelope, [], [table]))?.tables[0].secondLine, "Deviation %");

  const xlsx = documentFileBytes("xlsx", DOC, twoLineBlocks(), [REC], EXPORTED_AT);
  const untouched = await read(xlsx.slice().buffer, "upload.xlsx");
  assert.deepEqual(untouched.appended, [], "the file as downloaded adds nothing");
  const parts = await partsOf(xlsx);
  const xml = parts.get(SHEET)!;
  const last = Math.max(...Array.from(xml.matchAll(/<row r="(\d+)"/g), (m) => Number(m[1])));
  // An entry and its Deviation % line written below the grid, the way the paper has them.
  const added = `<row r="${last + 1}">${cellXml(`A${last + 1}`, "21-10-26")}${cellXml(`B${last + 1}`, "50.000gm")}${cellXml(`C${last + 1}`, "50.01gm")}</row><row r="${last + 2}">${cellXml(`A${last + 2}`, "Deviation %")}${cellXml(`C${last + 2}`, "0.02%")}</row>`;
  parts.set(SHEET, xml.replace("</sheetData>", `${added}</sheetData>`));
  // The edited second line of the entry already there is still that entry's, not a new one.
  const r = await read(zipOf(parts), "upload.xlsx");
  assert.equal(r.appended.length, 1, JSON.stringify(r.appended));
  assert.equal(r.appended[0].cells.testedValue1.text, "50.01gm");

  const docx = documentFileBytes("docx", DOC, twoLineBlocks(), [REC], EXPORTED_AT);
  const wordParts = await partsOf(docx);
  const body = wordParts.get("word/document.xml")!;
  const tc = (t: string) => `<w:tc><w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p></w:tc>`;
  const extra = `<w:tr>${tc("21-10-26")}${tc("50.000gm")}${tc("50.01gm")}</w:tr><w:tr>${tc("Deviation %")}${tc("")}${tc("0.02%")}</w:tr>`;
  const at = body.lastIndexOf("</w:tbl>");
  wordParts.set("word/document.xml", body.slice(0, at) + extra + body.slice(at));
  const w = await read(zipOf(wordParts), "upload.docx");
  assert.equal(w.appended.length, 1, JSON.stringify(w.appended));
  assert.equal(w.appended[0].cells.testedValue1.text, "50.01gm");
});

// ---------------------------------------------------------------------------
// 6. A format the plant edited before §111

test("a format edited before §111 takes the paper's shape from the issued one, and loses DCRS's explanations", () => {
  const issued = getIssuedLogSheetLayout(VISCOSITY)!;
  const old: LogSheetLayout = {
    ...issued,
    srNoShowsDate: undefined,
    instructions: ["Viscosity specification: 20.0 ± 1.0 Sec. One reading every hour, round the clock (09:00 to 08:00 next day).", "Keep the cup clean."],
  };
  delete (old as { srNoShowsDate?: true }).srNoShowsDate;
  // Nor did it print its headings in the paper's letters (§111 part 6): a mark of the paper the edit could not hold then.
  delete (old as { headingsAsPrinted?: true }).headingsAsPrinted;
  try {
    saveFormatEdit(VISCOSITY, { revisionNo: "01", revisionDate: "2026-10-01", layout: old, revisions: [] });
    const now = getLogSheetLayout(VISCOSITY)!;
    assert.equal(now.srNoShowsDate, undefined);
    assert.deepEqual(now.instructions, ["Keep the cup clean."], "the plant's own line stays, DCRS's explanation goes");
    assert.equal(getLogSheetLayout(VISCOSITY), now, "the same object each time");

    const gsmIssued = getIssuedLogSheetLayout(GSM)!;
    const gsmOld: LogSheetLayout = {
      ...gsmIssued,
      notesBelow: undefined,
      headerColumns: undefined,
      instructions: [`PROCEDURE: ${CALIBRATION_PROCEDURE}`],
      headerFields: gsmIssued.headerFields.map(({ printed: _p, paperColumn: _c, printedLabel: _l, ...f }) => f),
    };
    delete (gsmOld as Partial<LogSheetLayout>).notesBelow;
    delete (gsmOld as Partial<LogSheetLayout>).headerColumns;
    delete (gsmOld as Partial<LogSheetLayout>).headingsAsPrinted;
    delete (gsmOld as Partial<LogSheetLayout>).groupCellLines;
    saveFormatEdit(GSM, { revisionNo: "02", revisionDate: "2026-10-01", layout: gsmOld, revisions: [] });
    const gsmNow = getLogSheetLayout(GSM)!;
    assert.deepEqual(printedBoxes(gsmNow), [], "no box is read-only (§117)");
    assert.deepEqual(Object.fromEntries(gsmNow.headerFields.filter((f) => f.key in GSM_PRINTED).map((f) => [f.key, f.autoFill?.default])), GSM_PRINTED, "the paper's words start its four boxes");
    assert.equal(gsmNow.instructions, undefined, "the procedure is printed below the grid, not twice");
    assert.deepEqual(gsmNow.notesBelow, [`PROCEDURE: ${CALIBRATION_PROCEDURE}`]);
    // And part 6's: the paper's letters, its box words and Due Date:- at the right, Pass/Fail and Sign. one cell a plate.
    assert.equal(gsmNow.headingsAsPrinted, true);
    assert.deepEqual(gsmNow.groupCellLines, [4, 5]);
    assert.deepEqual(gsmNow.headerFields.find((f) => f.key === "dueDate"), gsmIssued.headerFields.find((f) => f.key === "dueDate"));

    // A format edited since says what it says.
    saveFormatEdit(VISCOSITY, { revisionNo: "02", revisionDate: "2026-10-14", layout: { ...issued, instructions: ["Keep the cup clean."], notesBelow: [] }, revisions: [] });
    assert.equal(getLogSheetLayout(VISCOSITY)!.srNoShowsDate, undefined);
    assert.deepEqual(getLogSheetLayout(VISCOSITY)!.notesBelow, []);
  } finally {
    dropFormatEdit(VISCOSITY);
    dropFormatEdit(GSM);
  }
});

// ---------------------------------------------------------------------------
// 7. The four documents the owner named, against their originals

test("F-QC-30 Lamination Adhesive Viscosity Record: Sr. No. | Date/Time | Viscosity (20.0 ± 1.0 Sec.) | Tested By, nothing above the grid", async () => {
  const doc = docOf(VISCOSITY);
  assert.deepEqual([doc.name, doc.formatNo, doc.revisionNo, doc.revisionDate], ["Lamination Adhesive Viscosity Record", "F-QC-30", "00", "2024-12-15"]);
  const layout = layoutOf(VISCOSITY);
  assert.equal(layout.instructions, undefined, "the line the owner crossed out is gone");
  assert.deepEqual(layout.headerFields, []);
  assert.deepEqual(layout.columns.map((c) => c.label), ["Date/Time", "Viscosity (20.0 ± 1.0 Sec.)", "Tested By"]);
  const viscosity = layout.columns[1];
  assert.deepEqual([viscosity.nominal, viscosity.min, viscosity.max], [20, 19, 21], "the printed specification sets the band a reading is highlighted outside");
  const html = await sheet(VISCOSITY, createDefaultData(doc, DAY, master) as LogSheetData);
  assert.deepEqual(headings(html), ["Sr. No.", "Date/Time", "Viscosity (20.0 ± 1.0 Sec.)", "Tested By"]);
  assert.ok(!text(html).includes("Viscosity specification"), "nothing printed above the grid");
});

test("F-QC-32 Adhesive Mixing Ratio Record: the paper's ten columns with the Date, and nothing above the grid", async () => {
  const doc = docOf(MIXING);
  const layout = layoutOf(MIXING);
  assert.equal(layout.instructions, undefined, "the 'One row per adhesive batch mixed' line is gone");
  assert.deepEqual(layout.columns.map((c) => c.label), ["Date", "Time", "Adhesive (kg)", "Hardener (kg)", "Ethyl (kg)", "Viscosity (Sec.)", "Remark", "Checked by", "Verified by"]);
  assert.deepEqual(layout.columns[0].autoFill, { dueDate: true });
  const html = await sheet(MIXING, createDefaultData(doc, DAY, master) as LogSheetData);
  assert.deepEqual(headings(html), ["Sr. No.", "Date", "Time", "Adhesive (kg)", "Hardener (kg)", "Ethyl (kg)", "Viscosity (Sec.)", "Remark", "Checked by", "Verified by"]);
  assert.ok(!text(html).includes("One row per adhesive batch"));
  // The line's Date is the record's: on the morning's known parts and on Demo Mode's lines alike.
  const known = prepareKnownParts(doc, DAY, master, undefined)!.data as LogSheetData;
  assert.ok(known.rows.length >= 1 && known.rows.every((r) => r.date === DAY), JSON.stringify(known.rows));
  assert.ok(known.rows.every((r) => r.viscosity === null && r.checkedBy === ""), "and nothing observed is written");
  const demo = autoFillRecord(doc, DAY, master, undefined)!.data as LogSheetData;
  assert.ok(demo.rows.length >= 1 && demo.rows.every((r) => r.date === DAY), JSON.stringify(demo.rows.map((r) => r.date)));
});

test("F/QC/11 GSM cutting plate: the paper's boxes and the words that start them, I. Calibration Date and Due Date, No. 54 to 57 over size and Deviation, PROCEDURE below", async () => {
  const layout = layoutOf(GSM);
  assert.equal(layout.instructions, undefined);
  assert.equal(layout.headerColumns, 3);
  assert.deepEqual(
    layout.headerFields.map((f) => [f.printedLabel ?? f.label, f.autoFill?.default ?? null]),
    [
      // The paper's own words, its colons and ":-" included (§111 part 6); the first four start with what the paper
      // prints and are the person's to change (§117).
      ["Device ID No:", "1-54, 2-55, 3-56, 4-57"],
      ["Location:", "LAB"],
      ["Department:", "LAB"],
      ["Manufacturer:", "Global Eng. Co. (GEC)"],
      ["Serial No:", null],
      ["Calibration Expiry:", null],
      ["I. Calibration Date:-", null],
      ["Due Date:-", null],
    ]
  );
  assert.deepEqual(
    layout.columns.map((c) => [c.group ?? "", c.label]),
    [["", "Index"], ["No. 54", "20 x 20cm"], ["No. 54", "Deviation"], ["No. 55", "10 x 10cm"], ["No. 55", "Deviation"], ["No. 56", "5 x 5cm"], ["No. 56", "Deviation"], ["No. 57", "2.5 x 2.5cm"], ["No. 57", "Deviation"]]
  );
  assert.equal(layout.rowMode.kind, "fixedRows");
  if (layout.rowMode.kind === "fixedRows") assert.deepEqual(layout.rowMode.rows.map((r) => r.parameter), ["Tasted-1", "2", "3", "4", "Pass/Fail", "Sign."], "'Tasted-1' as printed");
  assert.deepEqual(layout.notesBelow, [`PROCEDURE: ${CALIBRATION_PROCEDURE}`]);
  const html = await sheet(GSM, createDefaultData(docOf(GSM), DAY, master) as LogSheetData);
  assert.deepEqual(headings(html), ["Index", "No. 54", "No. 55", "No. 56", "No. 57", "20 x 20cm", "Deviation", "10 x 10cm", "Deviation", "5 x 5cm", "Deviation", "2.5 x 2.5cm", "Deviation"]);
  assert.ok(text(html).includes("I. Calibration Date"));
  assert.match(html, /class="grid sheet-boxes-paper"/, "three boxes to a line, as the paper");
});

test("F/QC/12 weighing balance: nine boxes three to a line, no Sr. No., each entry two lines with Deviation % below, one calibration a week, PROCEDURE below", async () => {
  const layout = layoutOf(SCALE);
  assert.equal(layout.instructions, undefined);
  assert.equal(layout.headerColumns, 3);
  assert.deepEqual(layout.headerFields.map((f) => f.label), [
    "Device ID No", "Location", "Department",
    "Manufacturer", "Serial No", "Calibration Expiry",
    "Minimum Reading Capacity", "Maximum Reading Capacity", "Acceptable Tolerance",
  ]);
  assert.equal(layout.ownLineNumbers, true, "no Sr. No. column");
  assert.deepEqual(layout.secondLine, { label: "Deviation %" });
  assert.deepEqual(layout.notesBelow, ["PROCEDURE:", CALIBRATION_PROCEDURE]);
  assert.deepEqual(layout.columns.filter((c) => c.beneath).map((c) => [c.key, c.beneath, !!c.computed]), [1, 2, 3, 4, 5].map((i) => [`deviation${i}`, `testedValue${i}`, true]));
  // One sheet a week holds that week's calibration: one line, dated the record's day — never four on one day.
  const demo = autoFillRecord(docOf(SCALE), DAY, master, undefined)!.data as LogSheetData;
  assert.equal(demo.rows.length, 1);
  assert.equal(demo.rows[0].date, DAY);
  const known = prepareKnownParts(docOf(SCALE), DAY, master, undefined)!.data as LogSheetData;
  assert.equal(known.rows.length, 1);
  assert.equal(known.rows[0].date, DAY);
  const html = await sheet(SCALE, demo);
  assert.ok(!headings(html).includes("Sr. No."));
  assert.ok(!headings(html).includes("Deviation %"));
  const entry = bodyRows(html).filter((r) => !/pf-pad/.test(r.attrs));
  assert.deepEqual(entry.map((r) => r.cells[0].text), ["14-10-26", "Deviation %"], "the entry's Date, and its second line headed Deviation %");
  // ...and the paper's three other entries as its blank ruled lines, printed (§117 round 2), never in the record.
  assert.deepEqual(bodyRows(html).filter((r) => /pf-pad/.test(r.attrs)).map((r) => r.cells[0].text), ["", "Deviation %", "", "Deviation %", "", "Deviation %"]);
});
