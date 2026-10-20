// WHAT THE DOWNLOAD READS OFF THE PAGE, AND WHETHER IT CAN BE READ BACK
// (REQUIREMENTS §81): documentBlocks (utils/documentExport.ts) walks a record
// view and turns it into the blocks the workbook and the Word file are made
// from, each bound value with the words around it. Node has no DOM, so this
// stands up the little of one the walk uses — elements with attributes,
// classes and children, text nodes, inputs, the few selectors it asks for and
// a computed style per element — builds the record views in question, and
// takes the file they give through an edit and back.
import test from "node:test";
import assert from "node:assert/strict";
import { documentBlocks, documentFileBytes, type ExportBlock } from "../src/utils/documentExport";
import { readUploadedFile, type ReadResult } from "../src/engine/roundTrip/readFile";
import { planImport, type ImportPlan, type PlanContext } from "../src/engine/roundTrip/plan";
import { unzip, zipStored } from "../src/utils/xlsx";
import { bindAttrs } from "../src/engine/roundTrip/bindPath";

// ---------------------------------------------------------------------------
// a DOM just big enough for the walk

interface Style {
  display: string;
  visibility: string;
  whiteSpace: string;
  fontWeight: string;
}

const BLOCK_TAGS = new Set(["DIV", "P", "SECTION", "FORM", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL"]);
const DISPLAY: Record<string, string> = { TABLE: "table", THEAD: "table-header-group", TBODY: "table-row-group", TR: "table-row", TD: "table-cell", TH: "table-cell", LI: "list-item", INPUT: "inline-block", SELECT: "inline-block", TEXTAREA: "inline-block" };

class FakeNode {
  parentNode: FakeElement | null = null;
  constructor(readonly nodeType: number) {}
  get parentElement(): FakeElement | null {
    return this.parentNode;
  }
  get textContent(): string {
    return "";
  }
}

class FakeText extends FakeNode {
  constructor(readonly data: string) {
    super(3);
  }
  get textContent(): string {
    return this.data;
  }
}

type Simple = { tag?: string; classes: string[]; attrs: { name: string; value?: string }[] };

function parseSimple(selector: string): Simple {
  const m = /^([a-zA-Z][\w-]*)?((?:\.[\w-]+|\[[^\]]+\])*)$/.exec(selector.trim());
  if (!m) throw new Error(`The fake DOM does not know the selector "${selector}"`);
  const out: Simple = { tag: m[1]?.toUpperCase(), classes: [], attrs: [] };
  for (const part of m[2].match(/\.[\w-]+|\[[^\]]+\]/g) ?? []) {
    if (part.startsWith(".")) out.classes.push(part.slice(1));
    else {
      const a = /^\[([\w-]+)(?:=['"]?([^'"]*)['"]?)?\]$/.exec(part)!;
      out.attrs.push({ name: a[1], value: a[2] });
    }
  }
  return out;
}

class FakeElement extends FakeNode {
  readonly tagName: string;
  readonly attrs = new Map<string, string>();
  readonly childNodes: FakeNode[] = [];
  style: Partial<Style> = {};
  constructor(tag: string) {
    super(1);
    this.tagName = tag.toUpperCase();
  }
  get children(): FakeElement[] {
    return this.childNodes.filter((n): n is FakeElement => n instanceof FakeElement);
  }
  get textContent(): string {
    return this.childNodes.map((n) => n.textContent).join("");
  }
  get classList() {
    const list = (this.attrs.get("class") ?? "").split(/\s+/).filter(Boolean);
    return { contains: (c: string) => list.includes(c) };
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }
  append(...nodes: (FakeNode | string)[]): void {
    for (const n of nodes) {
      const node = typeof n === "string" ? new FakeText(n) : n;
      node.parentNode = this;
      this.childNodes.push(node);
    }
  }
  private is(s: Simple): boolean {
    if (s.tag && s.tag !== this.tagName) return false;
    if (!s.classes.every((c) => this.classList.contains(c))) return false;
    return s.attrs.every((a) => this.attrs.has(a.name) && (a.value === undefined || this.attrs.get(a.name) === a.value));
  }
  matches(selector: string): boolean {
    return selector.split(",").some((s) => this.is(parseSimple(s)));
  }
  closest(selector: string): FakeElement | null {
    for (let el: FakeElement | null = this; el; el = el.parentNode) if (el.matches(selector)) return el;
    return null;
  }
  querySelectorAll(selector: string): FakeElement[] {
    const direct = /^:scope\s*>\s*(.+)$/.exec(selector.trim());
    if (direct) return this.children.filter((c) => c.matches(direct[1]));
    const out: FakeElement[] = [];
    const walk = (el: FakeElement) => {
      for (const c of el.children) {
        if (c.matches(selector)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  computed(): Style {
    const inherited = this.parentNode?.computed();
    return {
      display: this.style.display ?? DISPLAY[this.tagName] ?? (BLOCK_TAGS.has(this.tagName) ? "block" : "inline"),
      visibility: this.style.visibility ?? inherited?.visibility ?? "visible",
      whiteSpace: this.style.whiteSpace ?? inherited?.whiteSpace ?? "normal",
      fontWeight: this.style.fontWeight ?? "400",
    };
  }
}

class FakeInput extends FakeElement {
  value = "";
  checked = false;
  get type(): string {
    return this.attrs.get("type") ?? "text";
  }
}
class FakeSelect extends FakeElement {}
class FakeTextArea extends FakeElement {
  value = "";
}
class FakeImage extends FakeElement {
  alt = "";
}
class FakeCell extends FakeElement {
  colSpan = 1;
  rowSpan = 1;
}
class FakeRow extends FakeElement {
  get cells(): FakeCell[] {
    return this.children.filter((c): c is FakeCell => c instanceof FakeCell);
  }
}
class FakeTable extends FakeElement {
  get rows(): FakeRow[] {
    return this.querySelectorAll("tr").filter((r): r is FakeRow => r instanceof FakeRow);
  }
}

const define = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
define("Node", { ELEMENT_NODE: 1, TEXT_NODE: 3 });
define("HTMLInputElement", FakeInput);
define("HTMLSelectElement", FakeSelect);
define("HTMLTextAreaElement", FakeTextArea);
define("HTMLImageElement", FakeImage);
define("HTMLTableElement", FakeTable);
define("getComputedStyle", (el: FakeElement) => el.computed());

const CLASSES: Record<string, new (tag: string) => FakeElement> = { INPUT: FakeInput, SELECT: FakeSelect, TEXTAREA: FakeTextArea, IMG: FakeImage, TABLE: FakeTable, TR: FakeRow, TD: FakeCell, TH: FakeCell };

/** An element: its attributes, an optional style, and its children (strings are text nodes). */
function h(tag: string, props: Record<string, string> = {}, style: Partial<Style> = {}, ...children: (FakeNode | string)[]): FakeElement {
  const Kind = CLASSES[tag.toUpperCase()] ?? FakeElement;
  const el = new Kind(tag);
  for (const [k, v] of Object.entries(props)) el.attrs.set(k, v);
  el.style = style;
  el.append(...children);
  return el;
}

/** The attributes bindProps puts on a box or on the words shown in its place. */
const bound = (path: string, type: string, label?: string): Record<string, string> => ({ "data-bind": path, "data-bind-type": type, ...(label ? { "data-bind-label": label } : {}) });

function input(value: string, props: Record<string, string>): FakeInput {
  const el = h("input", { class: "input input-sm", ...props }) as FakeInput;
  el.value = value;
  return el;
}

// ---------------------------------------------------------------------------
// the round trip

const REC = "rec-export-1";
const DOC = { id: "gap-test", name: "Findings Report", formatNo: "", revisionNo: "01" };
const EXPORTED_AT = "2026-09-27T10:00:00.000Z";
const SHEET = "xl/worksheets/sheet1.xml";
const enc = new TextEncoder();
const dec = new TextDecoder();

const ctx = (data: unknown): PlanContext => ({ today: "2026-10-05", getRecord: (id) => (id === REC ? { data, documentId: DOC.id } : null), blankItem: () => null });
const changesBy = (plan: ImportPlan) => Object.fromEntries(plan.changes.map((c) => [c.path, c.value]));

async function partsOf(bytes: Uint8Array): Promise<Map<string, string>> {
  const zip = await unzip(bytes.slice().buffer);
  const out = new Map<string, string>();
  for (const [name, get] of zip) out.set(name, dec.decode(await get()));
  return out;
}
const zipOf = (parts: Map<string, string>) => zipStored(Array.from(parts, ([name, text]) => ({ name, data: enc.encode(text) }))).slice().buffer;

async function read(bytes: ArrayBuffer | Uint8Array, name = "upload.xlsx"): Promise<Extract<ReadResult, { ok: true }>> {
  const result = await readUploadedFile(bytes instanceof Uint8Array ? bytes.slice().buffer : bytes, name);
  if (!result.ok) assert.fail(`the file should read: ${result.reason} — ${result.message}`);
  return result;
}

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A cell of the visible sheet replaced by a string, the way Excel writes one typed in (line breaks kept). */
function setText(parts: Map<string, string>, ref: string, text: string): void {
  const xml = parts.get(SHEET)!;
  const re = new RegExp(`<c r="${ref}"(?: [^>]*?)?(?:/>|>[\\s\\S]*?</c>)`);
  assert.match(xml, re, `the sheet has a cell ${ref}`);
  parts.set(SHEET, xml.replace(re, `<c r="${ref}" s="3" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`));
}

const boundTexts = (blocks: ExportBlock[]) =>
  blocks.flatMap((b) => (b.kind === "text" ? (b.parts ?? []) : b.kind === "fields" ? b.pairs.flatMap(([, c]) => c.parts ?? []) : b.kind === "sheet" ? b.cells.flatMap((c) => c.parts ?? []) : b.kind === "paper" ? b.rows.flatMap((r) => r.cells.flatMap((c) => c.parts ?? [])) : b.rows.flatMap((r) => r.flatMap((c) => c.parts ?? [])))).filter((p) => p.bind).map((p) => [p.bind!.path, p.bind!.text]);

// ---------------------------------------------------------------------------
// the GAP report's header block (pages/GapPage.tsx): one box holds two values

const PREMISES = "Name & Address of Premises Inspected";

function gapHeader(name: string, address: string): FakeElement {
  const k = (text: string) => h("span", { class: "k" }, { display: "block" }, text);
  return h(
    "div",
    { "data-print-doc": "", "data-bind-record": REC },
    {},
    h(
      "div",
      { class: "doc-header" },
      {},
      h("div", { class: "company-name" }, {}, "CAPA — Internal: Pest Control Inspection Findings Report"),
      h(
        "div",
        { class: "meta-row" },
        { display: "flex" },
        h("div", { class: "meta-cell" }, {}, k("Date of Inspection"), input("2026-10-01", { type: "date", ...bound("inspectionDate", "date") })),
        // The two inputs stand side by side with nothing between them, as React renders the JSX.
        h("div", { class: "meta-cell" }, {}, k(PREMISES), input(name, bound("premisesName", "text")), input(address, bound("premisesAddress", "text"))),
        h("div", { class: "meta-cell" }, {}, k("Contact Person"), input("Ravi Patel", bound("contactPerson", "text")))
      )
    )
  );
}
const gapData = (name: string, address: string) => ({ inspectionDate: "2026-10-01", premisesName: name, premisesAddress: address, contactPerson: "Ravi Patel" });

test("GAP report: the premises name and address, two values in one box, are kept apart in the file and read back one by one", async () => {
  const blocks = documentBlocks([gapHeader("Gujarat Printpack", "Plot 12, GIDC")] as unknown as Element[]);
  const meta = blocks.find((b): b is Extract<ExportBlock, { kind: "table" }> => b.kind === "table")!;
  const box = meta.rows[0].find((c) => c.parts && c.text.startsWith(PREMISES))!; // the value box, not its heading
  assert.equal(box.text, `${PREMISES}\nGujarat Printpack\nPlot 12, GIDC`, "each value on a line of its own, not run together");
  const bytes = documentFileBytes("xlsx", DOC, blocks, [REC], EXPORTED_AT);

  const untouched = await read(bytes);
  assert.deepEqual(untouched.missing, [], "both values are found in the file");
  const plan0 = planImport(untouched, "upload.xlsx", ctx(gapData("Gujarat Printpack", "Plot 12, GIDC")));
  assert.deepEqual(plan0.changes, []);
  assert.equal(plan0.missing, 0);

  const ref = untouched.entries.find((e) => e.path === "premisesAddress")!.ref!;
  assert.equal(untouched.entries.find((e) => e.path === "premisesName")!.ref, ref, "one cell holds both");
  const parts = await partsOf(bytes);
  setText(parts, ref, `${PREMISES}\nGujarat Printpack\nPlot 14, GIDC Naroda`);
  const plan = planImport(await read(zipOf(parts)), "upload.xlsx", ctx(gapData("Gujarat Printpack", "Plot 12, GIDC")));
  assert.deepEqual(changesBy(plan), { premisesAddress: "Plot 14, GIDC Naroda" }, "the address edited in Excel is the one change");
  assert.equal(plan.missing, 0);

  setText(parts, ref, `${PREMISES}\nGujarat Printpack Pvt. Ltd.\nPlot 12, GIDC`);
  const plan2 = planImport(await read(zipOf(parts)), "upload.xlsx", ctx(gapData("Gujarat Printpack", "Plot 12, GIDC")));
  assert.deepEqual(changesBy(plan2), { premisesName: "Gujarat Printpack Pvt. Ltd." });
});

test("GAP report: with the premises name left empty the file reads back untouched, and an edited address is still its own change", async () => {
  const blocks = documentBlocks([gapHeader("", "Plot 12, GIDC")] as unknown as Element[]);
  const bytes = documentFileBytes("xlsx", DOC, blocks, [REC], EXPORTED_AT);
  const untouched = await read(bytes);
  const plan0 = planImport(untouched, "upload.xlsx", ctx(gapData("", "Plot 12, GIDC")));
  assert.deepEqual(plan0.changes, []);
  assert.equal(plan0.missing, 0);
  const ref = untouched.entries.find((e) => e.path === "premisesAddress")!.ref!;
  const parts = await partsOf(bytes);
  setText(parts, ref, `${PREMISES}\nPlot 14, GIDC`);
  const plan = planImport(await read(zipOf(parts)), "upload.xlsx", ctx(gapData("", "Plot 12, GIDC")));
  assert.deepEqual(changesBy(plan), { premisesAddress: "Plot 14, GIDC" });
  assert.equal(plan.missing, 0);
});

test("two values side by side with words between them are written exactly as before (no line break added)", () => {
  const cell = h("div", { "data-bind-record": REC }, {}, h("div", {}, {}, "A: ", h("span", bound("shiftA", "text"), {}, "Mehul"), ", B: ", h("span", bound("shiftB", "text"), {}, "Kiran")));
  const blocks = documentBlocks([cell] as unknown as Element[]);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].kind === "text" ? blocks[0].text : "", "A: Mehul, B: Kiran");
});

// ---------------------------------------------------------------------------
// a signed-off record shows its prose as text (white-space: pre-wrap / pre-line)

function signedOff(): FakeElement {
  return h(
    "div",
    { "data-print-doc": "", "data-bind-record": REC },
    {},
    // FormField kind="long", read-only (components/records/FormField.tsx)
    h("div", { class: "field" }, {}, h("label", {}, {}, "Remarks"), h("div", { class: "caf-value long notranslate", ...bound("remarks", "paragraph", "Remarks") }, { display: "block", whiteSpace: "pre-wrap" }, "All good\nNo leaks")),
    // ParagraphInput, read-only (components/records/LogSheetRecordView.tsx)
    h("p", { class: "paragraph-text notranslate", ...bound("summary", "paragraph", "Summary") }, { whiteSpace: "pre-wrap" }, "Line one\r\nLine two  with   spaces\n\nLine four"),
    // CellInput, read-only: a cell of a locked sheet
    h(
      "table",
      {},
      {},
      h("thead", {}, {}, h("tr", {}, {}, h("th", {}, {}, "Sr. No."), h("th", {}, {}, "Observation"))),
      h("tbody", {}, {}, h("tr", {}, {}, h("td", {}, {}, "1"), h("td", {}, {}, h("span", { class: "cell-text", ...bound("rows/@r-1/observation", "paragraph") }, { display: "block", whiteSpace: "pre-line" }, "Seal weak\nRe-sealed"))))
    ),
    // Words that are not a bound value are read as they always were: breaks collapsed.
    h("p", {}, { whiteSpace: "pre-line" }, "Printed\nwords")
  );
}
const signedOffData = () => ({ remarks: "All good\nNo leaks", summary: "Line one\nLine two  with   spaces\n\nLine four", rows: [{ id: "r-1", observation: "Seal weak\nRe-sealed" }] });

test("a signed-off record's multi-line values are written with their line breaks, and a word edited in Excel keeps them", async () => {
  const blocks = documentBlocks([signedOff()] as unknown as Element[]);
  assert.deepEqual(boundTexts(blocks), [
    ["remarks", "All good\nNo leaks"],
    ["summary", "Line one\nLine two with spaces\nLine four"],
    ["rows/@r-1/observation", "Seal weak\nRe-sealed"],
  ]);
  const printed = blocks.find((b) => b.kind === "text" && b.text.startsWith("Printed"));
  assert.equal(printed?.kind === "text" ? printed.text : "", "Printed words", "the page's own words read as before");

  const bytes = documentFileBytes("xlsx", DOC, blocks, [REC], EXPORTED_AT);
  const untouched = await read(bytes);
  assert.deepEqual(planImport(untouched, "upload.xlsx", ctx(signedOffData())).changes, []);
  const refOf = (path: string) => untouched.entries.find((e) => e.path === path)!.ref!;
  const parts = await partsOf(bytes);
  setText(parts, refOf("remarks"), "All good\nNo leaks at all");
  setText(parts, refOf("rows/@r-1/observation"), "Seal weak\nRe-sealed twice");
  const plan = planImport(await read(zipOf(parts)), "upload.xlsx", ctx(signedOffData()));
  assert.deepEqual(changesBy(plan), { remarks: "All good\nNo leaks at all", "rows/@r-1/observation": "Seal weak\nRe-sealed twice" }, "the line breaks are kept");
  assert.ok(plan.changes.every((c) => !c.conflict), "nothing was changed in the app since the download");
});

test("a signed-off record's multi-line value is a multi-line value in the Word file too", async () => {
  const blocks = documentBlocks([signedOff()] as unknown as Element[]);
  const bytes = documentFileBytes("docx", DOC, blocks, [REC], EXPORTED_AT);
  const r = await read(bytes, "upload.docx");
  const remarks = r.entries.find((e) => e.path === "remarks")!;
  assert.equal(remarks.text, "All good\nNo leaks");
  assert.equal(r.values.get(remarks.i)?.text, "All good\nNo leaks", "written with a line break, read back with one");
  assert.deepEqual(planImport(r, "upload.docx", ctx(signedOffData())).changes, []);
});

// ---------------------------------------------------------------------------
// the paper's own marks print, and stay out of the downloaded file (REQUIREMENTS §111, part 4)

const LOT = ["ACCEPTED", "REJECT & SEND BACK TO SUPPLIER / SCRAP", "SEGREGATION", "ACCEPTED ON DEVIATION"];

/** An incoming record's boxes signed off, as components/records/LogSheetRecordView.tsx draws them since part 4. */
function incomingSignedOff(status: string): FakeElement {
  const choice = h("select", { class: "input input-sm", ...bindAttrs("header/lotStatus", "select", { label: "LOT STATUS", options: LOT }), disabled: "" }) as FakeSelect;
  Object.assign(choice, { value: status, selectedOptions: status ? [{ textContent: status }] : [] });
  const hidden = { "aria-hidden": "true" };
  return h(
    "div",
    { "data-print-doc": "", "data-bind-record": REC },
    {},
    // LOT STATUS: its bound choice box kept off the screen but in the page, the paper's four words across beside it.
    h(
      "div",
      { class: "field field-choices-across" },
      { display: "flex" },
      h("label", {}, {}, "LOT STATUS"),
      choice,
      h("span", { class: "choices-across", ...hidden, "data-choices-across": "lotStatus" }, { display: "flex" }, ...LOT.map((w) => h("span", { class: w === status ? "choice-across is-chosen" : "choice-across" }, {}, w)))
    ),
    // INSPECTED BY over its box, QA INSPECTOR printed under it.
    h(
      "div",
      { class: "field field-printed-below" },
      { display: "flex" },
      h("label", {}, {}, "INSPECTED BY"),
      input("Patel Poojan Vishnubhai", { ...bindAttrs("header/inspectedBy", "text", { label: "INSPECTED BY (QA INSPECTOR)" }), disabled: "" }),
      h("span", { class: "box-printed-below", ...hidden }, {}, "QA INSPECTOR")
    ),
    // The retest date inside its sentence.
    h(
      "div",
      { class: "field field-in-sentence" },
      { display: "flex" },
      h("label", {}, {}, "This material should be retested on"),
      input("2022-07-03", { type: "date", ...bindAttrs("header/retestOn", "date", { label: "This material should be retested on" }), disabled: "" }),
      h("span", { class: "field-sentence-after", ...hidden }, {}, "before usage.")
    ),
    // A box that must be written: the screen's "*" in its label, kept off the paper.
    h("div", { class: "field" }, { display: "flex" }, h("label", {}, {}, "Date of Inspection", h("span", { class: "no-print" }, {}, " *")), input("2026-10-14", { type: "date", ...bindAttrs("header/dateOfInspection", "date", { label: "Date of Inspection" }), disabled: "" }))
  );
}
const incomingData = (status: string) => ({ header: { lotStatus: status, inspectedBy: "Patel Poojan Vishnubhai", retestOn: "2022-07-03", dateOfInspection: "2026-10-14" }, rows: [] });

test("the paper's own marks stay out of the downloaded file: LOT STATUS reads the status, the signature its name, the retest its date, no '*'", async () => {
  const blocks = documentBlocks([incomingSignedOff("SEGREGATION")] as unknown as Element[]);
  const fields = blocks.filter((b): b is Extract<ExportBlock, { kind: "fields" }> => b.kind === "fields").flatMap((b) => b.pairs.map(([name, cell]) => [name, cell.text]));
  assert.deepEqual(fields, [
    ["LOT STATUS", "SEGREGATION"],
    ["INSPECTED BY", "Patel Poojan Vishnubhai"],
    ["This material should be retested on", "03-Jul-2022"],
    ["Date of Inspection", "14-Oct-2026"],
  ]);
  // The words the file shows (not the bindings, which carry the choice box's options as they always did).
  const shown = blocks
    .flatMap((b) => (b.kind === "text" ? [b.text] : b.kind === "fields" ? b.pairs.flatMap(([name, cell]) => [name, cell.text]) : b.kind === "sheet" ? b.cells.map((c) => c.text) : b.kind === "paper" ? b.rows.flatMap((r) => r.cells.map((c) => c.text)) : b.rows.flatMap((r) => r.map((c) => c.text))))
    .join("\n");
  for (const words of ["ACCEPTED ON DEVIATION", "QA INSPECTOR", "before usage.", "*"]) assert.ok(!shown.includes(words), `${words} is the paper's, not the file's`);

  for (const kind of ["xlsx", "docx"] as const) {
    const bytes = documentFileBytes(kind, DOC, blocks, [REC], EXPORTED_AT);
    const untouched = await read(bytes, `upload.${kind}`);
    assert.deepEqual(untouched.missing, [], `${kind}: every box is found in the file`);
    assert.deepEqual(planImport(untouched, `upload.${kind}`, ctx(incomingData("SEGREGATION"))).changes, [], `${kind}: read back untouched, nothing changes`);
  }
  // The status changed in Excel is read back as the status.
  const bytes = documentFileBytes("xlsx", DOC, blocks, [REC], EXPORTED_AT);
  const untouched = await read(bytes);
  const parts = await partsOf(bytes);
  setText(parts, untouched.entries.find((e) => e.path === "header/lotStatus")!.ref!, "ACCEPTED");
  assert.deepEqual(changesBy(planImport(await read(zipOf(parts)), "upload.xlsx", ctx(incomingData("SEGREGATION")))), { "header/lotStatus": "ACCEPTED" });
});

// ---------------------------------------------------------------------------
// the header block's own lines (REQUIREMENTS §111 part 6): the paper's lines under the company's name go into the file

test("a downloaded file carries the lines the paper prints under the company's name, between the name and the title", () => {
  const head = h(
    "div",
    { "data-print-doc": "", "data-bind-record": REC },
    {},
    h(
      "div",
      { class: "doc-header" },
      {},
      h("div", { class: "company-name has-lines" }, {}, "GUJARAT PRINT PACK PUBLICATIONS PVT LTD"),
      h("div", { class: "company-lines" }, {}, h("div", {}, {}, "Manufacturers of Printed Cartons, Self Adhesive Labels, Shrink sleeves, Corrugated Boxes")),
      h("div", { class: "doc-title" }, {}, "WEEKLY INTERNAL CALIBRATION RECORDS - WEIGHT SCALE")
    )
  );
  const texts = documentBlocks([head] as unknown as Element[]).flatMap((b) => (b.kind === "text" ? [[b.text, b.strong]] : []));
  assert.deepEqual(texts, [
    ["GUJARAT PRINT PACK PUBLICATIONS PVT LTD", true],
    ["Manufacturers of Printed Cartons, Self Adhesive Labels, Shrink sleeves, Corrugated Boxes", false],
    ["WEEKLY INTERNAL CALIBRATION RECORDS - WEIGHT SCALE", true],
  ]);
});
