// A WORD FORM MADE INTO A DCRS FORMAT, DRAWN AS ITS OWN PAPER (the owner, 24-Nov-2026, REQUIREMENTS §324). What
// engine/wordForm/readDocx.ts read - the page, the paragraphs and the tables, every cell's width, merge, edges and words -
// becomes the two things a DCRS format is drawn from:
//
//   the PAPER (data/seed/qcPaperTables.ts PaperTable, the same kind the owner's HR papers are drawn as): one row per
//   paragraph and per table row, each cell at its Word width in mm, its words in their size, weight, underline and
//   alignment, its edges and shading, cells merged across (by width) and down (rs / skip) as Word merges them; and
//   the LAYOUT (LogSheetLayout): the boxes a person fills in and the register's columns, which the paper's cells write.
//
// THE FILL-IN BOXES ARE FOUND, THEN REVIEWED (the owner's choice: "Auto-detect, I review"). A box is
//   - an empty cell beside words ("Date :" | [ ]) or under a heading - named by those words;
//   - a blank written with underscores or dots in a line of words ("Name: ________") - the words around it stay;
// and a REGISTER is a table whose first row is all headings and whose next rows are blank lines (a number down the first
// column allowed): its headings are the grid's columns, its blank lines the paper's ruled lines, and a record may add more.
// Everything else is the paper's own printed words. The review screen (components/documents/WordFormImport.tsx) shows each
// box found, to keep or drop, rename or retype, before anything is saved.

import type { LogColumn, LogFieldType, LogHeaderField, LogSheetLayout } from "../../types";
import type { PaperCell, PaperRow, PaperTable } from "../../data/seed/qcPaperTables";
import type { WordBlock, WordCell, WordForm, WordPara, WordTable } from "./readDocx";

const PT_MM = 25.4 / 72;
/** Word's own room inside a cell, left and right (0.19 cm). */
const CELL_PAD = 1.9;

export interface FoundBox {
  key: string;
  label: string;
  type: LogFieldType;
  /** Where it was found, in words, for the review: "beside “Date :”", "in “Name: ____”". */
  where: string;
}

export interface FoundColumn {
  key: string;
  label: string;
  type: LogFieldType;
}

export interface WordFormat {
  paper: PaperTable;
  layout: LogSheetLayout;
  boxes: FoundBox[];
  columns: FoundColumn[];
  /** Ruled lines the register's paper prints (a record may add more). */
  registerLines: number;
  notes: string[];
}

const clean = (s: string): string => s.replace(/\s+/g, " ").trim();
const labelOf = (s: string): string => clean(s).replace(/[\s:：\-–—.]+$/, "").trim();
const BLANK_RUN = /_{3,}|\.{5,}|…{2,}/;

function typeFor(label: string): LogFieldType {
  if (/\bdate\b|dated|dt\./i.test(label)) return "date";
  if (/\btime\b/i.test(label)) return "time";
  return "text";
}

/** A key from words, unique among those given. */
function keyFor(label: string, taken: Set<string>): string {
  const words = label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).slice(0, 5);
  const base = words.length ? words[0] + words.slice(1).map((w) => w[0].toUpperCase() + w.slice(1)).join("") : "box";
  const safe = /^[a-z]/.test(base) ? base : `f${base}`;
  let key = safe;
  for (let n = 2; taken.has(key); n++) key = `${safe}${n}`;
  taken.add(key);
  return key;
}

const FACE = (font: string): PaperTable["font"] => (/arial|helvetica|liberation sans/i.test(font) ? "arial" : /times|cambria|georgia|book antiqua|serif/i.test(font) ? "times" : /gothic|century/i.test(font) ? "gothic" : "calibri");

/** The words' look a cell takes from its paragraphs: bold / underlined where all its words are, its largest size. */
function wordsLook(paras: WordPara[]): { b?: true; u?: true; pt: number; a?: PaperCell["a"]; face: string } {
  const runs = paras.flatMap((p) => p.runs.filter((r) => r.text.trim()));
  const pt = Math.max(...runs.map((r) => r.size), ...paras.map((p) => p.markSize), 6);
  const align = paras.find((p) => p.text.trim())?.align ?? paras[0]?.align ?? "left";
  const face = runs[0]?.font ?? "";
  return {
    ...(runs.length && runs.every((r) => r.bold) ? { b: true as const } : {}),
    ...(runs.length && runs.every((r) => r.underline) ? { u: true as const } : {}),
    pt: Math.round(pt * 10) / 10,
    ...(align === "center" ? { a: "c" as const } : align === "right" ? { a: "r" as const } : align === "justify" ? { a: "j" as const } : {}),
    face,
  };
}

/** How tall a cell's words stand at a width (mm): each paragraph's lines at its size and spacing, and the room around them. */
function wordsHeight(paras: WordPara[], width: number): number {
  let h = 0;
  for (const p of paras) {
    const size = Math.max(p.markSize, ...p.runs.map((r) => r.size));
    const line = size * PT_MM * 1.2 * (p.lineSpacing ?? 1);
    const perLine = Math.max(1, Math.floor((Math.max(4, width - 2 * CELL_PAD) / (size * PT_MM * 0.5))));
    const lines = p.text.split("\n").reduce((n, part) => n + Math.max(1, Math.ceil(Math.max(1, part.length) / perLine)), 0);
    h += p.spaceBefore + lines * line + p.spaceAfter;
  }
  return Math.max(h + 1.2, 4);
}

const edgesOf = (c: Pick<WordCell, "edges">): string => (c.edges.left ? "l" : "") + (c.edges.top ? "t" : "") + (c.edges.right ? "r" : "") + (c.edges.bottom ? "b" : "");

/** Whether a table is a register: a first row of headings, then blank lines (a number down the first column allowed). */
function registerOf(t: WordTable): { headRows: number; first: number; count: number; numbered: boolean } | null {
  if (t.rows.length < 3) return null;
  const isNumber = (s: string) => /^\s*\(?[0-9ivx]{1,3}[.)]?\s*$/i.test(s);
  const blankLine = (r: WordTable["rows"][number], numbered: boolean) =>
    r.cells.length >= 2 && r.cells.every((c, i) => c.vMerge === "continue" || !c.text || (numbered && i === 0 && isNumber(c.text)));
  // The heading rows: every cell holding words (one or two rows: a spanning heading over its columns).
  let head = 0;
  while (head < Math.min(2, t.rows.length - 2) && t.rows[head].cells.every((c) => c.text || c.vMerge === "continue")) head++;
  if (head === 0) return null;
  const numbered = t.rows.slice(head).some((r) => isNumber(r.cells[0]?.text ?? ""));
  let n = 0;
  while (head + n < t.rows.length && blankLine(t.rows[head + n], numbered)) n++;
  return n >= 2 ? { headRows: head, first: head, count: n, numbered } : null;
}

/** Makes a Word form into a DCRS format: its paper, its boxes and its register. `documentId` names the layout. */
export function wordFormToFormat(form: WordForm, documentId: string, fileName: string): WordFormat {
  const taken = new Set<string>();
  const boxes: FoundBox[] = [];
  const columns: FoundColumn[] = [];
  const notes = [...form.notes];
  const contentWidth = Math.max(20, form.page.width - form.page.margins.left - form.page.margins.right);
  const blocks: WordBlock[] = [...form.header, ...form.body, ...form.footer];
  const tables = blocks.flatMap((b) => (b.kind === "table" ? [b.table] : []));
  // The paper's columns run from the leftmost table edge (a table may stand out into the margin) to the rightmost.
  const left = Math.min(0, ...tables.map((t) => t.indent));
  const right = Math.max(contentWidth, ...tables.map((t) => t.indent + t.widths.reduce((a, b) => a + b, 0)));
  const width = Math.round((right - left) * 100) / 100;
  const faces = new Map<string, number>();
  const sizes = new Map<number, number>();
  for (const b of blocks) {
    const paras = b.kind === "para" ? [b.para] : b.kind === "table" ? b.table.rows.flatMap((r) => r.cells.flatMap((c) => c.paras)) : [];
    for (const p of paras) for (const r of p.runs) {
      faces.set(r.font, (faces.get(r.font) ?? 0) + r.text.length);
      sizes.set(r.size, (sizes.get(r.size) ?? 0) + r.text.length);
    }
  }
  const mostOf = <T,>(m: Map<T, number>, d: T): T => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? d;
  const bodyFace = FACE(mostOf(faces, form.font));
  const bodyPt = mostOf(sizes, form.size);

  const look = (paras: WordPara[]): Partial<PaperCell> => {
    const l = wordsLook(paras);
    const f = FACE(l.face || form.font);
    return { ...(l.b ? { b: true } : {}), ...(l.u ? { u: true } : {}), ...(l.a ? { a: l.a } : {}), ...(l.pt !== bodyPt ? { pt: l.pt } : {}), ...(f !== bodyFace && f !== "calibri" ? { f } : {}) };
  };

  /** A line of words with a blank in it ("Name: ______") becomes the words with a box in their place. */
  const sentenceCell = (text: string, w: number, near: string): Partial<PaperCell> | null => {
    const m = BLANK_RUN.exec(text);
    if (!m) return null;
    const before = text.slice(0, m.index);
    const after = text.slice(m.index + m[0].length);
    const label = labelOf(before) || labelOf(near) || `Box ${boxes.length + 1}`;
    const key = keyFor(label, taken);
    boxes.push({ key, label, type: typeFor(label), where: `in “${clean(text).slice(0, 60)}”` });
    const boxWidth = Math.max(15, Math.min(w - 4, m[0].length * 1.9));
    return { sentence: { before: before.replace(/\s+$/, " "), box: key, after: after.replace(/^\s+/, " "), boxWidth } };
  };

  const paraRow = (p: WordPara): PaperRow => {
    const h = Math.round(wordsHeight([p], width) * 100) / 100;
    const base: PaperCell = { w: width, edges: "", x: CELL_PAD, y: Math.round((p.spaceBefore + 0.6) * 100) / 100, ...look([p]) };
    // A line with several blanks ("Checked By: ____   Verified By: ____") is cut after each blank: a box each, side by side,
    // each part as wide as its share of the line's words.
    const parts: string[] = [];
    let rest = p.text;
    for (let m = BLANK_RUN.exec(rest); m && parts.length < 6; m = BLANK_RUN.exec(rest)) {
      parts.push(rest.slice(0, m.index + m[0].length));
      rest = rest.slice(m.index + m[0].length);
    }
    if (parts.length > 1) {
      if (rest.trim()) parts[parts.length - 1] += rest;
      const total = parts.reduce((n, x) => n + x.length, 0);
      let used = 0;
      const cells = parts.map((part, i) => {
        const w = i === parts.length - 1 ? Math.round((width - used) * 100) / 100 : Math.round(((width * part.length) / total) * 100) / 100;
        used += w;
        return { ...base, w, ...sentenceCell(part, w, "") } as PaperCell;
      });
      return { h, cells };
    }
    const cell: PaperCell = { ...base };
    const s = p.text.trim() ? sentenceCell(p.text, width, "") : null;
    if (s) Object.assign(cell, s);
    else if (p.text.trim()) cell.t = p.text.replace(/\s+$/, "");
    return { h, cells: [cell] };
  };

  const rows: PaperRow[] = [];
  let registerAt = -1;
  let lines: PaperTable["lines"] | undefined;

  const tableRows = (t: WordTable): PaperRow[] => {
    const out: PaperRow[] = [];
    const reg = !lines ? registerOf(t) : null;
    const pad = (w: number): PaperCell | null => (w > 0.2 ? { w: Math.round(w * 100) / 100, edges: "" } : null);
    const leftPad = t.indent - left;
    const tableWidth = t.widths.reduce((a, b) => a + b, 0);
    const rightPad = width - leftPad - tableWidth;
    // Merged down: how many rows each restarting cell spans (by its grid column).
    const colOf = (r: number, ci: number) => t.rows[r].cells.slice(0, ci).reduce((n, c) => n + c.span, 0);
    const spanDown = (r: number, ci: number): number => {
      const col = colOf(r, ci);
      let n = 1;
      for (let k = r + 1; k < t.rows.length; k++) {
        const below = t.rows[k].cells.findIndex((_, j) => colOf(k, j) === col);
        if (below < 0 || t.rows[k].cells[below].vMerge !== "continue") break;
        n++;
      }
      return n;
    };
    const headingAbove = (r: number, ci: number): string => {
      const col = colOf(r, ci);
      for (let k = r - 1; k >= 0; k--) {
        const j = t.rows[k].cells.findIndex((c, jj) => colOf(k, jj) <= col && col < colOf(k, jj) + c.span);
        const text = j >= 0 ? t.rows[k].cells[j].text : "";
        if (text) return text;
      }
      return "";
    };
    t.rows.forEach((row, r) => {
      const inRegister = reg && r >= reg.first && r < reg.first + reg.count;
      const cells: PaperCell[] = [];
      const lp = pad(leftPad);
      if (lp) cells.push(lp);
      let height = 0;
      row.cells.forEach((c, ci) => {
        const col = colOf(r, ci);
        const w = Math.round(t.widths.slice(col, col + c.span).reduce((a, b) => a + b, 0) * 100) / 100;
        const cell: PaperCell = { w, x: CELL_PAD, y: Math.round(((c.paras[0]?.spaceBefore ?? 0) + 0.6) * 100) / 100 };
        const edges = edgesOf(c);
        if (edges !== "ltrb") cell.edges = edges;
        if (c.shade) cell.bg = c.shade;
        if (c.vAlign !== "top") cell.vm = true;
        // (covered by the cell above, which spans down over it)
        if (c.vMerge === "continue") {
          cells.push({ w, skip: true });
          return;
        }
        if (c.vMerge === "restart") {
          const n = spanDown(r, ci);
          if (n > 1) cell.rs = n;
        }
        Object.assign(cell, look(c.paras));
        height = Math.max(height, cell.rs ? 0 : wordsHeight(c.paras, w));
        if (inRegister) {
          // A register's blank line: its cells write the grid's columns (the number column numbers the line).
          const key = `__col${col}`;
          if (reg!.numbered && ci === 0) cell.num = "all";
          else cell.col = key;
          cells.push(cell);
          return;
        }
        if (c.text) {
          const s = sentenceCell(c.text, w, "");
          if (s) Object.assign(cell, s);
          else cell.t = c.text;
          cells.push(cell);
          return;
        }
        // An empty cell: a box, named by the words beside it, else by the heading above it.
        const beside = ci > 0 ? row.cells[ci - 1].text : "";
        const label = labelOf(beside) || labelOf(headingAbove(r, ci));
        if (!label || w < 6) {
          cells.push(cell);
          return;
        }
        const key = keyFor(label, taken);
        boxes.push({ key, label, type: typeFor(label), where: beside ? `beside “${clean(beside).slice(0, 50)}”` : `under “${clean(headingAbove(r, ci)).slice(0, 50)}”` });
        cell.box = key;
        delete cell.y;
        cell.vm = true;
        cells.push(cell);
      });
      const rp = pad(rightPad);
      if (rp) cells.push(rp);
      const h = Math.round(Math.max(row.exact ? 0 : height, row.height ?? 0, 4) * 100) / 100;
      const drawn: PaperRow = { h: row.exact && row.height ? row.height : h, cells };
      if (row.header || (reg && r < reg.first)) drawn.head = true;
      if (inRegister) {
        if (r === reg!.first) {
          // The register's columns, named by their headings; its ruled line, drawn as many times as the paper has.
          const named = cells.map((cell) => {
            if (!cell.col) return cell;
            const ci = Number(cell.col.slice(5));
            const ri = row.cells.findIndex((_, j) => colOf(r, j) === ci);
            const heading = labelOf(headingAbove(r, ri)) || `Column ${columns.length + 1}`;
            const key = keyFor(heading, taken);
            columns.push({ key, label: heading, type: typeFor(heading) });
            return { ...cell, col: key };
          });
          lines = { h: drawn.h, count: reg!.count, cells: named };
          registerAt = rows.length + out.length;
        }
        return;
      }
      out.push(drawn);
    });
    if (reg) notes.push(`a register of ${reg.count} ruled lines: ${columns.map((c) => c.label).join(", ")}`);
    return out;
  };

  let pageBreak = false;
  for (const b of blocks) {
    if (b.kind === "pageBreak") {
      pageBreak = true;
      continue;
    }
    const made = b.kind === "para" ? [paraRow(b.para)] : tableRows(b.table);
    if (pageBreak && made[0]) {
      made[0] = { ...made[0], pb: true };
      pageBreak = false;
    }
    rows.push(...made);
  }
  // The paper's parts: its rows up to the register (with its heading) are the body, the rows after it the foot.
  const body = registerAt >= 0 ? rows.slice(0, registerAt) : rows;
  const foot = registerAt >= 0 ? rows.slice(registerAt) : [];
  // An empty paragraph at the very end prints nothing a person needs.
  while (foot.length && !foot[foot.length - 1].cells.some((c) => c.t || c.box || c.sentence)) foot.pop();
  while (!foot.length && body.length && !body[body.length - 1].cells.some((c) => c.t || c.box || c.sentence)) body.pop();

  const paper: PaperTable = {
    page: form.page.landscape ? "landscape" : "portrait",
    left: Math.round((form.page.margins.left + left) * 100) / 100,
    top: Math.round(form.page.margins.top * 100) / 100,
    font: bodyFace,
    pt: bodyPt,
    head: [],
    body,
    foot,
    rules: "cells",
    ownWords: true,
    flows: true,
    ...(lines ? { lines } : {}),
  };
  const headerFields: LogHeaderField[] = boxes.map((b) => ({ key: b.key, label: b.label, type: b.type }));
  const gridColumns: LogColumn[] = columns.map((c) => ({ key: c.key, label: c.label, type: c.type }));
  const layout: LogSheetLayout = {
    documentId,
    headerFields,
    columns: gridColumns,
    rowMode: lines ? { kind: "free", minRows: 1, typicalRows: lines.count } : { kind: "single" },
    specimenSource: `Made from the Word file ${fileName} (REQUIREMENTS §324).`,
  };
  return { paper, layout, boxes, columns, registerLines: lines?.count ?? 0, notes };
}

/**
 * The paper's own header words follow the format (data/seed/qcPaperTables.ts PaperCell.t placeholders): where the file
 * prints its format number, its revision or its title, the paper prints the format's - so a number given at the upload, or
 * changed later in Edit format, is the one on every record.
 */
export function withHeaderWords(f: WordFormat, said: { formatNo?: string; revisionNo?: string; title?: string }): WordFormat {
  const squash = (s: string) => s.replace(/\s+/g, "").toUpperCase();
  const swap = (c: PaperCell): PaperCell => {
    if (!c.t) return c;
    const t = c.t.trim();
    if (said.title && squash(t) === squash(said.title)) return { ...c, t: "{title}" };
    if (said.revisionNo && squash(t) === squash(said.revisionNo)) return { ...c, t: "{revisionNo}" };
    if (said.formatNo && squash(t).includes(squash(said.formatNo))) {
      const at = c.t.replace(/\s+/g, " ").toUpperCase().indexOf(said.formatNo.toUpperCase());
      if (at >= 0) return { ...c, t: `${c.t.replace(/\s+/g, " ").slice(0, at)}{formatNo}${c.t.replace(/\s+/g, " ").slice(at + said.formatNo.length)}` };
      return squash(t) === squash(said.formatNo) ? { ...c, t: "{formatNo}" } : c;
    }
    return c;
  };
  const rowsOf = (rows: PaperRow[]) => rows.map((r) => ({ ...r, cells: r.cells.map(swap) }));
  return { ...f, paper: { ...f.paper, body: rowsOf(f.paper.body), foot: rowsOf(f.paper.foot) } };
}

/** The format with one found box no longer a box: its cell keeps its place, blank, as printed paper. */
export function withoutBox(f: WordFormat, key: string): WordFormat {
  const strip = (c: PaperCell): PaperCell => {
    if (c.box === key) {
      const { box: _box, ...rest } = c;
      void _box;
      return rest;
    }
    if (c.sentence?.box === key) {
      const { sentence, ...rest } = c;
      return { ...rest, t: `${sentence.before}${"_".repeat(Math.max(3, Math.round(sentence.boxWidth / 1.9)))}${sentence.after}` };
    }
    return c;
  };
  const rowsOf = (rows: PaperRow[]) => rows.map((r) => ({ ...r, cells: r.cells.map(strip) }));
  return {
    ...f,
    paper: { ...f.paper, body: rowsOf(f.paper.body), foot: rowsOf(f.paper.foot) },
    layout: { ...f.layout, headerFields: f.layout.headerFields.filter((h) => h.key !== key) },
    boxes: f.boxes.filter((b) => b.key !== key),
  };
}

/** A found box or column renamed or retyped (its key stays: it is what the record keeps the value under). */
export function withField(f: WordFormat, key: string, change: { label?: string; type?: LogFieldType }): WordFormat {
  const label = change.label !== undefined ? clean(change.label) : undefined;
  const patch = <T extends { key: string; label: string; type: LogFieldType }>(x: T): T => (x.key === key ? { ...x, ...(label ? { label } : {}), ...(change.type ? { type: change.type } : {}) } : x);
  return {
    ...f,
    boxes: f.boxes.map(patch),
    columns: f.columns.map(patch),
    layout: { ...f.layout, headerFields: f.layout.headerFields.map(patch), columns: f.layout.columns.map(patch) },
  };
}
