// HOW A FORMAT'S WORDS AND BOXES LOOK, SET IN EDIT FORMAT (the owner, 24-Nov-2026, REQUIREMENTS §318: "in edit format
// section we can able to control full things perfectly from space to bold text center text justify text all things
// whichever is possible"). The super admin, or anyone at Edit, picks a part of the sheet in the designer
// (components/documents/SheetDesigner.tsx) - the title, a heading, a column's values, a box's label or its value, a printed
// line - and sets its text style (bold, italic, underline, size, font), its alignment (left, centre, right, justify), its
// spacing (before, after, line spacing, the room inside the box, the line's height) and its edge (none, thin, thick); and
// for the grid, a column's width. The whole sheet has its own font and size, and its page way round.
//
// STORED IN THE FORMAT'S LAYOUT (LogSheetLayout.styles, LogSheetLayout.paper, LogColumn.printWidth), so a style is saved
// the one way a format change is saved (engine/formatOps.ts commitFormatChange): a new revision, dated, with who and why,
// named in its change list, restored with the issued format. A format nobody styled has no `styles` and is drawn exactly
// as before.
//
// DRAWN BY A STYLE SHEET OF ITS OWN (formatStyleCss), laid over the sheet that carries data-format-styles: the designer's
// sheet and every record's (LogSheetRecordView). Print is the same page, and the Word file and the workbook read the words'
// look from it (utils/documentExport.ts, for a styled sheet only), so the screen, the paper and the downloads agree.

import type { LogSheetLayout, PartStyle } from "../types";

export type { PartStyle } from "../types";

/** The fonts offered: what Word and Excel have on every Windows PC, each with the face the browser falls back to. */
export const STYLE_FONTS: { name: string; css: string }[] = [
  { name: "Arial", css: 'Arial, "Liberation Sans", Helvetica, sans-serif' },
  { name: "Calibri", css: 'Calibri, Carlito, "Segoe UI", Arial, sans-serif' },
  { name: "Cambria", css: 'Cambria, Caladea, Georgia, serif' },
  { name: "Times New Roman", css: '"Times New Roman", "Liberation Serif", Times, serif' },
  { name: "Verdana", css: "Verdana, Geneva, sans-serif" },
  { name: "Tahoma", css: "Tahoma, Verdana, sans-serif" },
  { name: "Segoe UI", css: '"Segoe UI", Arial, sans-serif' },
  { name: "Book Antiqua", css: '"Book Antiqua", Palatino, "Palatino Linotype", serif' },
];
export const STYLE_SIZES = [7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24];
export const STYLE_LINE_SPACINGS = [1, 1.15, 1.5, 2];
export const ALIGN_NAMES: Record<NonNullable<PartStyle["align"]>, string> = { left: "left", center: "centre", right: "right", justify: "justified" };

/**
 * The parts of a sheet a style is set on, by key:
 *   sheet                 the whole sheet (its font and size, what every other part starts from)
 *   title, company        the header block's format name and company name
 *   instructions          every printed line above the grid;   instruction:<n>  one of them (0 = the first)
 *   headings              every heading of the grid;           heading:<key>    one column's heading
 *   group:<name>          a heading drawn over a run of columns
 *   values                every value written in the grid;     column:<key>     one column's values
 *   labels                every box's label;                   label:<key>      one box's label
 *   boxes                 every box's value;                   box:<key>        one box's value
 */
export type StyleKey = string;

/** What a part is called in a change list and on the style panel. */
export function styleKeyName(key: StyleKey, layout?: LogSheetLayout): string {
  const [kind, ...rest] = key.split(":");
  const id = rest.join(":");
  const column = () => layout?.columns.find((c) => c.key === id)?.label ?? id;
  const box = () => [...(layout?.headerFields ?? []), ...(layout?.footerFields ?? [])].find((f) => f.key === id)?.label ?? id;
  switch (kind) {
    case "sheet":
      return "the whole sheet";
    case "title":
      return "the format's title";
    case "company":
      return "the company name";
    case "instructions":
      return "the printed lines";
    case "instruction":
      return `printed line ${Number(id) + 1}`;
    case "headings":
      return "every column heading";
    case "heading":
      return `the heading “${column()}”`;
    case "group":
      return `the heading “${id}” over its columns`;
    case "values":
      return "every value in the grid";
    case "column":
      return `the values of “${column()}”`;
    case "labels":
      return "every box's label";
    case "label":
      return `the label “${box()}”`;
    case "boxes":
      return "every box's value";
    case "box":
      return `the value of “${box()}”`;
    default:
      return key;
  }
}

const fontCss = (name: string): string => STYLE_FONTS.find((f) => f.name === name)?.css ?? `"${name.replace(/["\\]/g, "")}", sans-serif`;
const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v * 100) / 100 : undefined);

/** A style tidied: nothing that says nothing, every figure in its range. What is stored and compared. */
export function cleanStyle(s: PartStyle | undefined): PartStyle {
  const out: PartStyle = {};
  if (!s) return out;
  if (s.bold !== undefined) out.bold = !!s.bold;
  if (s.italic) out.italic = true;
  if (s.underline) out.underline = true;
  const size = num(s.size, 5, 48);
  if (size !== undefined) out.size = size;
  if (typeof s.font === "string" && s.font.trim()) out.font = s.font.trim();
  if (s.align && s.align in ALIGN_NAMES) out.align = s.align;
  const before = num(s.spaceBefore, 0, 50);
  if (before !== undefined) out.spaceBefore = before;
  const after = num(s.spaceAfter, 0, 50);
  if (after !== undefined) out.spaceAfter = after;
  const line = num(s.lineSpacing, 0.8, 3);
  if (line !== undefined) out.lineSpacing = line;
  const pad = num(s.padding, 0, 20);
  if (pad !== undefined) out.padding = pad;
  const height = num(s.rowHeight, 3, 100);
  if (height !== undefined) out.rowHeight = height;
  if (s.border === "none" || s.border === "thin" || s.border === "thick") out.border = s.border;
  return out;
}

export const isEmptyStyle = (s: PartStyle | undefined): boolean => Object.keys(cleanStyle(s)).length === 0;

/** The layout with one part's style set (an empty style takes it off). Pure, like every format operation. */
export function setPartStyle(layout: LogSheetLayout, key: StyleKey, style: PartStyle | undefined): LogSheetLayout {
  const styles = { ...(layout.styles ?? {}) };
  const clean = cleanStyle(style);
  if (Object.keys(clean).length) styles[key] = clean;
  else delete styles[key];
  const next: LogSheetLayout = { ...layout, styles };
  if (!Object.keys(styles).length) delete next.styles;
  return next;
}

/** One style in words: "bold, centre, 11 pt Arial, 2 mm before". */
export function describeStyle(s: PartStyle | undefined): string {
  const c = cleanStyle(s);
  const parts: string[] = [];
  if (c.bold === true) parts.push("bold");
  if (c.bold === false) parts.push("not bold");
  if (c.italic) parts.push("italic");
  if (c.underline) parts.push("underlined");
  if (c.size !== undefined || c.font) parts.push([c.size !== undefined ? `${c.size} pt` : "", c.font ?? ""].filter(Boolean).join(" "));
  if (c.align) parts.push(ALIGN_NAMES[c.align]);
  if (c.spaceBefore !== undefined) parts.push(`${c.spaceBefore} mm before`);
  if (c.spaceAfter !== undefined) parts.push(`${c.spaceAfter} mm after`);
  if (c.lineSpacing !== undefined) parts.push(`line spacing ${c.lineSpacing}`);
  if (c.padding !== undefined) parts.push(`${c.padding} mm inside`);
  if (c.rowHeight !== undefined) parts.push(`${c.rowHeight} mm high`);
  if (c.border) parts.push(c.border === "none" ? "no edge" : `${c.border} edge`);
  return parts.join(", ") || "as issued";
}

/** Each part whose style changed, in words, for the save's change list (engine/formatOps.ts describeFormatChange). */
export function describeStyleChanges(before: LogSheetLayout, after: LogSheetLayout): string[] {
  const out: string[] = [];
  const a = before.styles ?? {};
  const b = after.styles ?? {};
  for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    const was = describeStyle(a[key]);
    const now = describeStyle(b[key]);
    if (was !== now) out.push(`styled ${styleKeyName(key, after)}: ${now}${was !== "as issued" ? ` (was ${was})` : ""}`);
  }
  if ((before.paper ?? "") !== (after.paper ?? "")) out.push(`set the page ${after.paper ?? "as issued"}`);
  for (const c of after.columns) {
    const old = before.columns.find((x) => x.key === c.key);
    if (old && (old.printWidth ?? 0) !== (c.printWidth ?? 0)) out.push(c.printWidth ? `set the width of “${c.label}” to ${pxToMm(c.printWidth)} mm` : `let the width of “${c.label}” follow its words`);
  }
  return out;
}

/** A column's printed width is kept in the sheet's pixels (96 to the inch); the panel speaks millimetres. */
export const mmToPx = (mm: number): number => Math.round((mm * 96) / 25.4);
export const pxToMm = (px: number): number => Math.round((px * 25.4) / 96);

/** The styles each scope on the screen draws (useFormatStyleSheet registers them), for the downloads to read. */
const registered = new Map<string, Record<StyleKey, PartStyle>>();
export function registerFormatStyles(scope: string, styles: Record<StyleKey, PartStyle> | undefined): void {
  if (styles) registered.set(scope, styles);
}

/** The words' look a download carries over (utils/documentExport.ts): what the format's style sets, nothing else. */
export interface WordsLook {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** Points. */
  size?: number;
  font?: string;
  align?: "left" | "center" | "right" | "justify";
}

/**
 * The look the format's styles give the words of `el` - a grid cell, a box's label or value, a printed line, the title -
 * the broad parts first and the part's own over them; undefined where the sheet is not styled or nothing styles it. So a
 * format nobody styled downloads exactly as before.
 */
export function wordsLookOf(el: Element | null | undefined): WordsLook | undefined {
  const root = el?.closest("[data-format-styles]");
  const scope = root?.getAttribute("data-format-styles");
  const styles = scope ? registered.get(scope) : undefined;
  if (!el || !styles) return undefined;
  const S = `[data-format-styles="${CSS_ESCAPE(scope!)}"]`;
  const rank = (k: string) => (k === "sheet" ? 0 : ["instructions", "headings", "values", "labels", "boxes"].includes(k) ? 1 : 2);
  const look: WordsLook = {};
  for (const key of Object.keys(styles).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))) {
    const sels = selectorsOf(key);
    if (!sels) continue;
    const hit = sels.some((x) => {
      if (!x) return true;
      try {
        return el.matches(`${S} ${x}`) || !!el.closest(`${S} ${x}`);
      } catch {
        return false;
      }
    });
    if (!hit) continue;
    const s = cleanStyle(styles[key]);
    if (s.bold !== undefined) look.bold = s.bold;
    if (s.italic) look.italic = true;
    if (s.underline) look.underline = true;
    if (s.size !== undefined) look.size = s.size;
    if (s.font) look.font = s.font;
    if (s.align) look.align = s.align;
  }
  return Object.keys(look).length ? look : undefined;
}

/** The value the scope attribute carries: the same styles, the same style sheet. */
export function styleScope(documentId: string, layout: Pick<LogSheetLayout, "styles"> | undefined): string | undefined {
  const styles = layout?.styles;
  if (!styles || !Object.keys(styles).length) return undefined;
  const text = JSON.stringify(styles);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${documentId}-${(h >>> 0).toString(36)}`;
}

const WORDS_INSIDE = ":is(input, select, textarea, button.designer-label, .cell-text, .print-box-text, .print-box-words, .print-box-words *)";

/** The elements a key styles, within the sheet's scope. */
function selectorsOf(key: StyleKey): string[] | null {
  const [kind, ...rest] = key.split(":");
  const id = CSS_ESCAPE(rest.join(":"));
  switch (kind) {
    case "sheet":
      return [""];
    case "title":
      return [".doc-header .doc-title"];
    case "company":
      return [".doc-header .company-name"];
    case "instructions":
      return ["[data-style-line]"];
    case "instruction":
      return [`[data-style-line="${id}"]`];
    case "headings":
      return ["table.log-sheet > thead th"];
    case "heading":
      return [`table.log-sheet > thead th[data-style-col="${id}"]`];
    case "group":
      return [`table.log-sheet > thead th[data-style-group="${id}"]`];
    case "values":
      return ["table.log-sheet > tbody td"];
    case "column":
      return [`table.log-sheet > tbody td[data-style-col="${id}"]`];
    // (a record draws a box's label as <label>; the designer, as its heading with the box's menu)
    case "labels":
      return ["[data-style-box] > :is(label, .designer-heading)"];
    case "label":
      return [`[data-style-box="${id}"] > :is(label, .designer-heading)`];
    case "boxes":
      return ["[data-style-box] > :not(label, .designer-heading)"];
    case "box":
      return [`[data-style-box="${id}"] > :not(label, .designer-heading)`];
    default:
      return null;
  }
}

function CSS_ESCAPE(s: string): string {
  return s.replace(/["\\\n]/g, (c) => (c === "\n" ? "\\a " : `\\${c}`));
}

/**
 * The style sheet that draws a format's styles, scoped to `[data-format-styles="<scope>"]`. Broad parts (the whole
 * sheet, every heading) come first and one part's own after, so the narrower wins. Each rule is marked important: the
 * owner's choice stands over how the app draws a sheet by default (and over the print's own sizing of a long value).
 */
export function formatStyleCss(scope: string, styles: Record<StyleKey, PartStyle> | undefined): string {
  if (!styles) return "";
  const S = `[data-format-styles="${CSS_ESCAPE(scope)}"]`;
  const rank = (k: string) => (k === "sheet" ? 0 : ["instructions", "headings", "values", "labels", "boxes"].includes(k) ? 1 : 2);
  const rules: string[] = [];
  for (const key of Object.keys(styles).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))) {
    const sels = selectorsOf(key);
    const s = cleanStyle(styles[key]);
    if (!sels || !Object.keys(s).length) continue;
    const words: string[] = [];
    if (s.bold !== undefined) words.push(`font-weight: ${s.bold ? 700 : 400}`);
    if (s.italic) words.push("font-style: italic");
    if (s.underline) words.push("text-decoration: underline");
    if (s.size !== undefined) words.push(`font-size: ${s.size}pt`);
    if (s.font) words.push(`font-family: ${fontCss(s.font)}`);
    if (s.align) words.push(`text-align: ${s.align}`, `text-align-last: ${s.align === "justify" ? "left" : s.align}`);
    if (s.lineSpacing !== undefined) words.push(`line-height: ${s.lineSpacing}`);
    const box: string[] = [];
    if (s.spaceBefore !== undefined) box.push(`margin-top: ${s.spaceBefore}mm`);
    if (s.spaceAfter !== undefined) box.push(`margin-bottom: ${s.spaceAfter}mm`);
    if (s.padding !== undefined) box.push(`padding: ${s.padding}mm`);
    if (s.rowHeight !== undefined) box.push(key === "box" || key === "boxes" ? `min-height: ${s.rowHeight}mm` : `height: ${s.rowHeight}mm`);
    if (s.border) box.push(`border: ${s.border === "none" ? "0 none" : `${s.border === "thick" ? 2 : 1}px solid #000`}`);
    const own = sels.map((x) => (x ? `${S} ${x}` : S)).join(", ");
    // (the whole sheet's words reach every printed word of it - each part's own style, more particular, still wins - but
    // never the screen's own controls)
    const inner = sels.map((x) => (x ? `${S} ${x} ${WORDS_INSIDE}` : `${S} *:not(.no-print, .no-print *, svg, svg *)`)).join(", ");
    if (words.length || box.length) rules.push(`${own} { ${[...words, ...box].map((d) => `${d} !important`).join("; ")}; }`);
    if (words.length) rules.push(`${inner} { ${words.map((d) => `${d} !important`).join("; ")}; }`);
  }
  return rules.join("\n");
}
