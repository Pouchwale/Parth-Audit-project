// HOW A FORMAT LOOKS, SET IN EDIT FORMAT (REQUIREMENTS §318): a part's style is kept tidy, laid over the sheet by its own
// style sheet, named in the revision's change list, and written into the Word file; a format nobody styled is untouched.
import test from "node:test";
import assert from "node:assert/strict";
import { getLogSheetLayout } from "../src/data/seed/logSheetLayouts";
import { SEED_DOCUMENTS } from "../src/data/seed/documentDefinitions";
import { LOG_SHEET_LAYOUTS } from "../src/data/seed/logSheetLayouts";
import { cleanStyle, describeStyle, describeStyleChanges, formatStyleCss, isEmptyStyle, mmToPx, pxToMm, setPartStyle, styleScope } from "../src/engine/formatStyles";
import { describeFormatChange, draftOf } from "../src/engine/formatOps";
import { buildDocx } from "../src/utils/docx";

const DOC = "pur-approved-suppliers";

test("a style is kept tidy: nothing that says nothing, every figure in range", () => {
  assert.deepEqual(cleanStyle({ bold: true, italic: false, size: 400, align: "middle" as never, spaceBefore: 2, border: "dotted" as never }), { bold: true, spaceBefore: 2 });
  assert.equal(cleanStyle({ bold: false }).bold, false, "not bold is a choice (a heading drawn bold, made plain)");
  assert.ok(isEmptyStyle({ italic: false }));
  assert.equal(describeStyle({ bold: true, size: 11, font: "Arial", align: "center", spaceAfter: 1.5 }), "bold, 11 pt Arial, centre, 1.5 mm after");
  assert.equal(describeStyle(undefined), "as issued");
  assert.equal(pxToMm(mmToPx(40)), 40);
});

test("setting a style, and taking it off, leaves an unstyled layout as it was", () => {
  const layout = getLogSheetLayout(DOC)!;
  assert.equal(layout.styles, undefined, "no issued format carries styles");
  const styled = setPartStyle(layout, "heading:supplierName", { italic: true, align: "center" });
  assert.deepEqual(styled.styles, { "heading:supplierName": { italic: true, align: "center" } });
  assert.equal(layout.styles, undefined, "pure: the layout given is not changed");
  const back = setPartStyle(styled, "heading:supplierName", {});
  assert.equal("styles" in back, false);
});

test("the style sheet is scoped to the format and its styles, a part's own over the broad ones", () => {
  const layout = setPartStyle(setPartStyle(getLogSheetLayout(DOC)!, "headings", { bold: false }), "heading:supplierName", { bold: true, size: 12, font: "Times New Roman" });
  const scope = styleScope(DOC, layout)!;
  assert.match(scope, new RegExp(`^${DOC}-`));
  assert.equal(styleScope(DOC, getLogSheetLayout(DOC)), undefined, "an unstyled format has no scope");
  assert.notEqual(styleScope(DOC, setPartStyle(layout, "values", { italic: true })), scope, "other styles, another scope");
  const css = formatStyleCss(scope, layout.styles);
  const broad = css.indexOf("thead th {");
  const own = css.indexOf('th[data-style-col="supplierName"]');
  assert.ok(broad >= 0 && own > broad, css);
  assert.match(css, /font-size: 12pt !important/);
  assert.match(css, /font-family: "Times New Roman"/);
  assert.ok(css.split("\n").every((line) => line.startsWith(`[data-format-styles="${scope}"]`)), "every rule inside the format's scope");
});

test("each style change is named in the save's change list", () => {
  const doc = SEED_DOCUMENTS.find((d) => d.id === DOC)!;
  const before = draftOf(doc);
  let layout = setPartStyle(before.layout!, "column:supplierName", { bold: true, align: "right" });
  layout = { ...layout, paper: "portrait", columns: layout.columns.map((c) => (c.key === "vendorCode" ? { ...c, printWidth: mmToPx(25) } : c)) };
  const changes = describeFormatChange(before, { ...before, layout });
  assert.ok(changes.includes("styled the values of “SUPPLIER NAME”: bold, right"), changes.join(" | "));
  assert.ok(changes.includes("set the page portrait"), changes.join(" | "));
  assert.ok(changes.includes("set the width of “Vendor Code” to 25 mm"), changes.join(" | "));
  assert.deepEqual(describeStyleChanges(before.layout!, before.layout!), []);
});

test("no layout of any format carries a style of its own: every format is drawn as before until it is styled", () => {
  for (const [id, layout] of Object.entries(LOG_SHEET_LAYOUTS)) assert.equal(layout.styles, undefined, id);
});

test("the Word file carries a styled cell's look, and an unstyled one exactly as before", () => {
  const plain = { type: "table" as const, rows: [["HEAD"], ["value"]], headerRows: 1 };
  const styled = { ...plain, looks: { "0:0": { italic: true, size: 12, font: "Times New Roman", align: "center" as const }, "1:0": { bold: true, align: "justify" as const } } };
  // (the document's body only: the package's other parts name fonts of their own)
  const xml = (blocks: Parameters<typeof buildDocx>[0]) => {
    const all = new TextDecoder().decode(buildDocx(blocks, {}));
    return all.slice(all.indexOf("<w:body>"), all.indexOf("</w:body>"));
  };
  const a = xml([plain]);
  const b = xml([styled]);
  assert.ok(!a.includes("<w:i/>") && !a.includes("w:rFonts") && !a.includes('w:val="both"'), "unstyled: nothing added");
  assert.match(b, /<w:rFonts w:ascii="Times New Roman"[^>]*\/><w:b\/><w:i\/><w:sz w:val="24"\/>/, "the heading: Times, bold (a heading), italic, 12 pt");
  assert.match(b, /<w:jc w:val="center"\/><\/w:pPr><w:r><w:rPr><w:rFonts/, "centred");
  assert.match(b, /<w:jc w:val="both"\/>/, "justified");
  assert.equal(a.replace(/\s/g, "").length > 0, true);
  // A paragraph in a look of its own, and one without: as before.
  const p1 = xml([{ type: "paragraph", text: "Line", bold: true }]);
  const p2 = xml([{ type: "paragraph", text: "Line", bold: true, look: { underline: true, align: "right" } }]);
  assert.ok(p1.includes("<w:b/>") && !p1.includes("<w:u "));
  assert.match(p2, /<w:jc w:val="right"\/>/);
  assert.match(p2, /<w:b\/><w:u w:val="single"\/>/);
});
