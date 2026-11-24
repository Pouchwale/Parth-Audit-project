// A BLANK WORD FORM, READ AS THE PAGE IT DRAWS (the owner, 24-Nov-2026, REQUIREMENTS §324: "for new format if i upload the
// word file then same format with same spacing and all things should be come and editable in system perfectly").
//
// What a form is made of in Word: its page (size, way round, margins), the words of its header and footer, and its body
// - paragraphs and tables, in order. A table has its columns' widths (the grid), each row's height (at least, or exactly)
// and its cells: how many columns a cell covers (gridSpan), whether it carries on a cell above (vMerge), its edges, its
// shading, where its words stand up and down, and the paragraphs in it. A paragraph has its alignment, the room before and
// after it and its line spacing, and runs of words each with its own bold, italic, underline, size and font. Every one of
// those is read as Word lays it: the run's own setting, else its paragraph style's (and the style that style is based on),
// else the document's defaults.
//
// READ IN THE BROWSER with the app's own unzip and XML reader (utils/xlsx.ts unzip, engine/roundTrip/xml.ts): nothing is
// sent anywhere, and no library is needed. engine/wordForm/toPaper.ts turns what is read into the paper DCRS draws.
//
// Units: millimetres for lengths, points for type. Word keeps twentieths of a point (twips) for most lengths, half-points
// for type, eighths of a point for edges.

import { attr, childElements, decodeXmlBytes, firstChild, parseXml, type XmlElement } from "../roundTrip/xml";

export interface WordRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** Points. */
  size: number;
  font: string;
}

export type WordAlign = "left" | "center" | "right" | "justify";

export interface WordPara {
  runs: WordRun[];
  align: WordAlign;
  /** mm. */
  spaceBefore: number;
  spaceAfter: number;
  /** A multiple of the line (1, 1.15, 1.5...), when the spacing is "auto". */
  lineSpacing?: number;
  /** The paragraph's own words, every run's text together. */
  text: string;
  /** The size of the paragraph's mark (points): an empty paragraph's line is this tall. */
  markSize: number;
}

export interface WordEdges {
  /** Points; 0 = no edge. */
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface WordCell {
  /** Grid columns covered. */
  span: number;
  /** "restart" begins a run of cells merged down; "continue" is covered by the one above. */
  vMerge?: "restart" | "continue";
  edges: WordEdges;
  /** "#rrggbb" or undefined. */
  shade?: string;
  vAlign: "top" | "center" | "bottom";
  paras: WordPara[];
  text: string;
}

export interface WordRow {
  /** mm; undefined = as tall as its words. */
  height?: number;
  exact: boolean;
  /** Repeats at the top of every page. */
  header: boolean;
  cells: WordCell[];
}

export interface WordTable {
  /** mm, each grid column. */
  widths: number[];
  /** mm from the left margin. */
  indent: number;
  rows: WordRow[];
}

export type WordBlock = { kind: "para"; para: WordPara } | { kind: "table"; table: WordTable } | { kind: "pageBreak" };

export interface WordPage {
  /** mm. */
  width: number;
  height: number;
  landscape: boolean;
  margins: { top: number; right: number; bottom: number; left: number };
}

export interface WordForm {
  page: WordPage;
  /** The document's own font and size, when a run says none. */
  font: string;
  size: number;
  header: WordBlock[];
  body: WordBlock[];
  footer: WordBlock[];
  /** What was not read as drawn (an image, a text box, a field), said in words for the review screen. */
  notes: string[];
}

const TWIP_MM = 25.4 / 1440;
const twipMm = (v: string | null | undefined): number | undefined => {
  const n = Number(v);
  return v != null && Number.isFinite(n) ? Math.round(n * TWIP_MM * 100) / 100 : undefined;
};
const on = (el: XmlElement | null): boolean | undefined => {
  if (!el) return undefined;
  const v = attr(el, "val");
  return v === null || !/^(0|false|off|none)$/i.test(v);
};

/** Run and paragraph settings as one layer of Word's cascade (defaults, a style, the run's own). */
interface Layer {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  size?: number;
  font?: string;
  align?: WordAlign;
  spaceBefore?: number;
  spaceAfter?: number;
  lineSpacing?: number;
}

function runLayer(rPr: XmlElement | null): Layer {
  if (!rPr) return {};
  const out: Layer = {};
  const b = on(firstChild(rPr, "b"));
  if (b !== undefined) out.bold = b;
  const i = on(firstChild(rPr, "i"));
  if (i !== undefined) out.italic = i;
  const u = firstChild(rPr, "u");
  if (u) out.underline = (attr(u, "val") ?? "single") !== "none";
  const sz = firstChild(rPr, "sz");
  if (sz && Number(attr(sz, "val"))) out.size = Number(attr(sz, "val")) / 2;
  const fonts = firstChild(rPr, "rFonts");
  const face = fonts && (attr(fonts, "ascii") ?? attr(fonts, "hAnsi") ?? attr(fonts, "cs"));
  if (face) out.font = face;
  return out;
}

const ALIGN: Record<string, WordAlign> = { left: "left", start: "left", center: "center", right: "right", end: "right", both: "justify", distribute: "justify" };

function paraLayer(pPr: XmlElement | null): Layer {
  if (!pPr) return {};
  const out: Layer = {};
  const jc = firstChild(pPr, "jc");
  const a = jc ? ALIGN[attr(jc, "val") ?? ""] : undefined;
  if (a) out.align = a;
  const sp = firstChild(pPr, "spacing");
  if (sp) {
    const before = twipMm(attr(sp, "before"));
    const after = twipMm(attr(sp, "after"));
    if (before !== undefined) out.spaceBefore = before;
    if (after !== undefined) out.spaceAfter = after;
    const line = Number(attr(sp, "line"));
    const rule = attr(sp, "lineRule") ?? "auto";
    if (line && rule === "auto") out.lineSpacing = Math.round((line / 240) * 100) / 100;
  }
  return out;
}

const over = (...layers: Layer[]): Layer => Object.assign({}, ...layers.map((l) => Object.fromEntries(Object.entries(l).filter(([, v]) => v !== undefined))));

/** Word's lists: each list's levels (its number format and how the number is written), and the counters as the body runs. */
interface Numbering {
  levels: Map<string, Map<number, { fmt: string; text: string; start: number }>>;
  counters: Map<string, number[]>;
}

function readNumbering(xml: XmlElement | null): Numbering {
  const out: Numbering = { levels: new Map(), counters: new Map() };
  if (!xml) return out;
  const abstract = new Map<string, Map<number, { fmt: string; text: string; start: number }>>();
  for (const a of childElements(xml, "abstractNum")) {
    const lv = new Map<number, { fmt: string; text: string; start: number }>();
    for (const l of childElements(a, "lvl")) {
      const fmt = firstChild(l, "numFmt");
      const text = firstChild(l, "lvlText");
      const start = firstChild(l, "start");
      lv.set(Number(attr(l, "ilvl")) || 0, { fmt: (fmt && attr(fmt, "val")) || "decimal", text: (text && attr(text, "val")) ?? "%1.", start: Number(start && attr(start, "val")) || 1 });
    }
    abstract.set(attr(a, "abstractNumId") ?? "", lv);
  }
  for (const n of childElements(xml, "num")) {
    const ref = firstChild(n, "abstractNumId");
    const lv = abstract.get((ref && attr(ref, "val")) ?? "");
    if (lv) out.levels.set(attr(n, "numId") ?? "", lv);
  }
  return out;
}

const ROMAN = (n: number): string => {
  const t: [number, string][] = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let s = "";
  for (const [v, r] of t) while (n >= v) (s += r), (n -= v);
  return s;
};

/** The number (or bullet) Word writes before a list paragraph: "1.", "a)", "•". */
function listMark(num: Numbering, numId: string, ilvl: number): string {
  const levels = num.levels.get(numId);
  const lvl = levels?.get(ilvl);
  if (!levels || !lvl || numId === "0") return "";
  const counts = num.counters.get(numId) ?? [];
  counts[ilvl] = (counts[ilvl] ?? (lvl.start - 1)) + 1;
  for (let i = ilvl + 1; i < counts.length; i++) counts[i] = undefined as unknown as number;
  num.counters.set(numId, counts);
  if (lvl.fmt === "bullet") return "•";
  if (lvl.fmt === "none") return "";
  return lvl.text.replace(/%(\d)/g, (_, d) => {
    const at = Number(d) - 1;
    const n = counts[at] ?? levels.get(at)?.start ?? 1;
    const f = levels.get(at)?.fmt ?? "decimal";
    return f === "lowerLetter" ? String.fromCharCode(96 + n) : f === "upperLetter" ? String.fromCharCode(64 + n) : f === "lowerRoman" ? ROMAN(n) : f === "upperRoman" ? ROMAN(n).toUpperCase() : String(n);
  });
}

interface Styles {
  numbering?: Numbering;
  defaults: Layer;
  para: Map<string, { layer: Layer; basedOn?: string }>;
  tableDefault?: string;
}

function readStyles(xml: XmlElement | null): Styles {
  const out: Styles = { defaults: {}, para: new Map() };
  if (!xml) return out;
  const docDefaults = firstChild(xml, "docDefaults");
  if (docDefaults) {
    const r = firstChild(firstChild(docDefaults, "rPrDefault") ?? docDefaults, "rPr");
    const p = firstChild(firstChild(docDefaults, "pPrDefault") ?? docDefaults, "pPr");
    out.defaults = over(paraLayer(p), runLayer(r));
  }
  for (const s of childElements(xml, "style")) {
    const id = attr(s, "styleId");
    if (!id) continue;
    const basedOn = firstChild(s, "basedOn");
    const layer = over(paraLayer(firstChild(s, "pPr")), runLayer(firstChild(s, "rPr")));
    out.para.set(id, { layer, basedOn: basedOn ? (attr(basedOn, "val") ?? undefined) : undefined });
    // (the document's default paragraph style - "Normal" - dresses every paragraph that names no style)
    if (attr(s, "type") === "paragraph" && attr(s, "default") === "1") out.para.set("__default", { layer: {}, basedOn: id });
  }
  return out;
}

function styleLayer(styles: Styles, id: string | undefined, depth = 0): Layer {
  if (!id || depth > 8) return {};
  const s = styles.para.get(id);
  if (!s) return {};
  return over(styleLayer(styles, s.basedOn, depth + 1), s.layer);
}

/** The text a run holds: its words, tabs as a space, breaks as a new line. */
function runText(r: XmlElement): string {
  let s = "";
  for (const c of r.children) {
    if (typeof c === "string") continue;
    if (c.local === "t") s += c.children.filter((x): x is string => typeof x === "string").join("");
    else if (c.local === "tab") s += " ";
    else if (c.local === "br" || c.local === "cr") s += "\n";
    else if (c.local === "noBreakHyphen") s += "-";
    else if (c.local === "sym") s += String.fromCharCode(parseInt(attr(c, "char") ?? "20", 16) || 32);
  }
  return s;
}

const FALLBACK_FONT = "Calibri";

function readPara(p: XmlElement, styles: Styles, notes: Set<string>): WordPara {
  const pPr = firstChild(p, "pPr");
  const pStyle = pPr ? firstChild(pPr, "pStyle") : null;
  const styleId = (pStyle && attr(pStyle, "val")) ?? undefined;
  const base = over(styles.defaults, styleLayer(styles, "__default"), styleLayer(styles, styleId), paraLayer(pPr));
  // A paragraph mark's own run settings (pPr > rPr) dress an empty paragraph's line.
  const markLayer = pPr ? runLayer(firstChild(pPr, "rPr")) : {};
  const runs: WordRun[] = [];
  const walk = (el: XmlElement) => {
    for (const c of el.children) {
      if (typeof c === "string") continue;
      if (c.local === "r") {
        const rPr = firstChild(c, "rPr");
        const rStyle = rPr ? firstChild(rPr, "rStyle") : null;
        const l = over(base, styleLayer(styles, (rStyle && attr(rStyle, "val")) ?? undefined), runLayer(rPr));
        if (firstChild(c, "drawing") || firstChild(c, "pict") || firstChild(c, "object")) notes.add("a picture or drawing (shown as a blank space)");
        const text = runText(c);
        if (text) runs.push({ text, bold: !!l.bold, italic: !!l.italic, underline: !!l.underline, size: l.size ?? 11, font: l.font ?? FALLBACK_FONT });
      } else if (c.local === "hyperlink" || c.local === "smartTag" || c.local === "ins" || c.local === "customXml" || c.local === "fldSimple") walk(c);
      else if (c.local === "sdt") {
        const content = firstChild(c, "sdtContent");
        if (content) walk(content);
      }
    }
  };
  walk(p);
  // A list paragraph's number or bullet, written as Word writes it before the words (a register's Sr. No. 1., 2., 3.).
  const numPr = pPr ? firstChild(pPr, "numPr") : null;
  if (numPr && styles.numbering) {
    const numId = firstChild(numPr, "numId");
    const ilvl = firstChild(numPr, "ilvl");
    const mark = listMark(styles.numbering, (numId && attr(numId, "val")) ?? "", Number(ilvl && attr(ilvl, "val")) || 0);
    if (mark) {
      const l = over(base, markLayer);
      runs.unshift({ text: runs.length ? `${mark} ` : mark, bold: !!l.bold, italic: false, underline: false, size: l.size ?? 11, font: l.font ?? FALLBACK_FONT });
    }
  }
  const text = runs.map((r) => r.text).join("");
  // An empty paragraph keeps its line's size (its mark's), which is the room it takes on the page.
  const mark = over(base, markLayer);
  return {
    markSize: mark.size ?? 11,
    runs,
    text,
    align: base.align ?? "left",
    spaceBefore: base.spaceBefore ?? 0,
    spaceAfter: base.spaceAfter ?? 0,
    ...(base.lineSpacing ? { lineSpacing: base.lineSpacing } : {}),
  };
}

const EDGE_SIDES = ["top", "right", "bottom", "left"] as const;
function edgesOf(borders: XmlElement | null, into: WordEdges): WordEdges {
  const out = { ...into };
  if (!borders) return out;
  for (const side of EDGE_SIDES) {
    const el = firstChild(borders, side) ?? firstChild(borders, side === "left" ? "start" : side === "right" ? "end" : side);
    if (!el) continue;
    const val = attr(el, "val") ?? "single";
    out[side] = val === "nil" || val === "none" ? 0 : Math.max(0.25, (Number(attr(el, "sz")) || 4) / 8);
  }
  return out;
}

function readTable(tbl: XmlElement, styles: Styles, notes: Set<string>): WordTable {
  const tblPr = firstChild(tbl, "tblPr");
  const grid = firstChild(tbl, "tblGrid");
  const widths = grid ? childElements(grid, "gridCol").map((g) => twipMm(attr(g, "w")) ?? 0) : [];
  const ind = tblPr ? firstChild(tblPr, "tblInd") : null;
  const tblBorders = tblPr ? firstChild(tblPr, "tblBorders") : null;
  // The table's own edges: its outside ones, and the lines it draws between rows (insideH) and columns (insideV).
  const outer = edgesOf(tblBorders, { top: 0, right: 0, bottom: 0, left: 0 });
  const insideH = tblBorders && firstChild(tblBorders, "insideH");
  const insideV = tblBorders && firstChild(tblBorders, "insideV");
  const lineOf = (el: XmlElement | null) => (!el ? 0 : /^(nil|none)$/.test(attr(el, "val") ?? "") ? 0 : Math.max(0.25, (Number(attr(el, "sz")) || 4) / 8));
  const h = lineOf(insideH);
  const v = lineOf(insideV);
  const rows: WordRow[] = [];
  const trs = childElements(tbl, "tr");
  trs.forEach((tr, ri) => {
    const trPr = firstChild(tr, "trPr");
    const trHeight = trPr ? firstChild(trPr, "trHeight") : null;
    const height = trHeight ? twipMm(attr(trHeight, "val")) : undefined;
    const cells: WordCell[] = [];
    const tcs = childElements(tr, "tc").concat(...childElements(tr, "sdt").map((s) => childElements(firstChild(s, "sdtContent") ?? s, "tc")));
    let col = 0;
    const gridBefore = trPr ? firstChild(trPr, "gridBefore") : null;
    if (gridBefore) col += Number(attr(gridBefore, "val")) || 0;
    tcs.forEach((tc, ci) => {
      const tcPr = firstChild(tc, "tcPr");
      const gridSpan = tcPr ? firstChild(tcPr, "gridSpan") : null;
      const span = Math.max(1, Number(gridSpan && attr(gridSpan, "val")) || 1);
      const vm = tcPr ? firstChild(tcPr, "vMerge") : null;
      const vMerge = vm ? ((attr(vm, "val") ?? "continue") === "restart" ? "restart" : "continue") : undefined;
      // A cell's edges: the table's (outside at the table's edge, inside lines between), then the cell's own.
      const base: WordEdges = {
        top: ri === 0 ? outer.top : h,
        bottom: ri === trs.length - 1 ? outer.bottom : h,
        left: col === 0 ? outer.left : v,
        right: col + span >= widths.length ? outer.right : v,
      };
      const edges = edgesOf(tcPr ? firstChild(tcPr, "tcBorders") : null, base);
      const shd = tcPr ? firstChild(tcPr, "shd") : null;
      const fill = shd ? attr(shd, "fill") : null;
      const vAlignEl = tcPr ? firstChild(tcPr, "vAlign") : null;
      const va = attr(vAlignEl ?? tc, "val");
      const paras = childElements(tc, "p").map((p) => readPara(p, styles, notes));
      if (childElements(tc, "tbl").length) notes.add("a table inside a table cell (its words are kept, its lines are not)");
      for (const inner of childElements(tc, "tbl")) for (const r of childElements(inner, "tr")) for (const c of childElements(r, "tc")) for (const p of childElements(c, "p")) paras.push(readPara(p, styles, notes));
      cells.push({
        span,
        ...(vMerge ? { vMerge } : {}),
        edges,
        ...(fill && /^[0-9a-f]{6}$/i.test(fill) && fill.toLowerCase() !== "ffffff" ? { shade: `#${fill.toLowerCase()}` } : {}),
        vAlign: va === "center" ? "center" : va === "bottom" ? "bottom" : "top",
        paras,
        text: paras.map((p) => p.text).join("\n").trim(),
      });
      col += span;
      void ci;
    });
    rows.push({
      ...(height ? { height } : {}),
      exact: !!trHeight && attr(trHeight, "hRule") === "exact",
      header: !!(trPr && on(firstChild(trPr, "tblHeader"))),
      cells,
    });
  });
  return { widths, indent: twipMm(ind && attr(ind, "w")) ?? 0, rows };
}

function readBlocks(container: XmlElement, styles: Styles, notes: Set<string>): WordBlock[] {
  const out: WordBlock[] = [];
  for (const c of childElements(container)) {
    if (c.local === "p") {
      const breaks = childElements(c, "r").some((r) => childElements(r, "br").some((b) => attr(b, "type") === "page"));
      const pPr = firstChild(c, "pPr");
      if (pPr && on(firstChild(pPr, "pageBreakBefore"))) out.push({ kind: "pageBreak" });
      out.push({ kind: "para", para: readPara(c, styles, notes) });
      if (breaks) out.push({ kind: "pageBreak" });
    } else if (c.local === "tbl") out.push({ kind: "table", table: readTable(c, styles, notes) });
    else if (c.local === "sdt") {
      const content = firstChild(c, "sdtContent");
      if (content) out.push(...readBlocks(content, styles, notes));
    }
  }
  return out;
}

function readPage(body: XmlElement): WordPage {
  const sect = firstChild(body, "sectPr");
  const pgSz = sect ? firstChild(sect, "pgSz") : null;
  const pgMar = sect ? firstChild(sect, "pgMar") : null;
  const width = twipMm(pgSz && attr(pgSz, "w")) ?? 210;
  const height = twipMm(pgSz && attr(pgSz, "h")) ?? 297;
  const m = (side: string, d: number) => twipMm(pgMar && attr(pgMar, side)) ?? d;
  return {
    width,
    height,
    landscape: (pgSz && attr(pgSz, "orient")) === "landscape" || width > height,
    margins: { top: m("top", 25.4), right: m("right", 25.4), bottom: m("bottom", 25.4), left: m("left", 25.4) },
  };
}

/** The XML parts of a .docx by their path in the package. */
export type DocxParts = Map<string, string>;

/** Reads a Word form from its parts (word/document.xml, word/styles.xml, its header and footer). */
export function readWordForm(parts: DocxParts): WordForm {
  const docXml = parts.get("word/document.xml");
  if (!docXml) throw new Error("This is not a Word document (.docx): it has no word/document.xml.");
  const doc = parseXml(docXml);
  const body = firstChild(doc, "body");
  if (!body) throw new Error("This Word document has no body.");
  const styles = readStyles(parts.has("word/styles.xml") ? parseXml(parts.get("word/styles.xml")!) : null);
  if (parts.has("word/numbering.xml")) styles.numbering = readNumbering(parseXml(parts.get("word/numbering.xml")!));
  const notes = new Set<string>();
  // The header and footer the body's section names (its default ones), found through the document's relationships.
  const rels = parts.get("word/_rels/document.xml.rels");
  const targets = new Map<string, string>();
  if (rels) for (const r of childElements(parseXml(rels), "Relationship")) targets.set(attr(r, "Id") ?? "", `word/${(attr(r, "Target") ?? "").replace(/^\/?word\//, "")}`);
  const sect = firstChild(body, "sectPr");
  const part = (kind: "headerReference" | "footerReference"): WordBlock[] => {
    const refs = sect ? childElements(sect, kind) : [];
    const ref = refs.find((r) => (attr(r, "type") ?? "default") === "default") ?? refs[0];
    const path = ref ? targets.get(attr(ref, "id") ?? "") : undefined;
    const xml = path ? parts.get(path) : undefined;
    return xml ? readBlocks(parseXml(xml), styles, notes) : [];
  };
  const defaults = over(styles.defaults, styleLayer(styles, "__default"));
  return {
    page: readPage(body),
    font: defaults.font ?? FALLBACK_FONT,
    size: defaults.size ?? 11,
    header: part("headerReference"),
    body: readBlocks(body, styles, notes),
    footer: part("footerReference"),
    notes: [...notes],
  };
}

/** Reads an uploaded .docx file. */
export async function readDocxFile(buffer: ArrayBuffer): Promise<WordForm> {
  const { unzip } = await import("../../utils/xlsx");
  const entries = await unzip(buffer);
  const parts: DocxParts = new Map();
  for (const [name, load] of entries) {
    if (/^word\/(document|styles|numbering|header\d*|footer\d*)\.xml$/.test(name) || name === "word/_rels/document.xml.rels") parts.set(name, decodeXmlBytes(await load()));
  }
  return readWordForm(parts);
}
