// AN HR PAPER ANYONE CAN READ (REQUIREMENTS §282; the owner, 22-Nov-2026, with F/HR/03 on the screen: "it hard to see anything ... no font
// is too small on print so any one can read easily ... remove colour from record like yellow, orange"). The company's papers keep
// their rows, words and rules. A paper whose letters would print under READ_PT has its columns measured from what they really
// hold: each is given the room its longest word needs, taken from columns with room to spare, and the page turned where that
// prints larger. The same paper is then drawn on the screen, printed, and written to Word and Excel. No colour stays on a record.

import { lineRow, paperTablePrint, type PaperCell, type PaperPick, type PaperRow, type PaperTable } from "../data/seed/qcPaperTables";
import type { LogSheetData } from "../types/record";

const MM = 25.4 / 72;
/** Letters on paper are never meant to be smaller than this. */
export const READ_PT = 8;
const SIZES = [9.5, 9, 8.5, 8, 7.5, 7];
/** The room inside a cell, left and right, mm. */
const PAD = 1.4;
const MARGIN = 12;
/** Room at a page's head and foot (styles.css, §277). */
const HEAD_FOOT = 22;
const MOST_LINES = 3;
/** A heading over a narrow column may be this much smaller than the sheet's words, and never under HEAD_PT. */
const HEAD_LESS = 1.5;
const HEAD_PT = 7;

/** A colour, as against white, black or a grey. */
export function isColour(hex: string | undefined): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return false;
  const v = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  return Math.max(...v) - Math.min(...v) > 14;
}

const NARROW = new Set("iljtfrI.,:;'!|()[]-/");
const WIDE = new Set("mwMW@%&");

function emOf(s: string, bold: boolean, face: PaperTable["font"]): number {
  let em = 0;
  for (const ch of s) {
    if (ch === " ") em += 0.23;
    else if (NARROW.has(ch)) em += 0.32;
    else if (WIDE.has(ch)) em += 0.86;
    else if (ch >= "0" && ch <= "9") em += 0.51;
    else if (ch >= "A" && ch <= "Z") em += 0.63;
    else em += 0.5;
  }
  return em * (bold ? 1.06 : 1) * (face === "calibri" ? 1 : 1.13);
}
const mmOf = (s: string, pt: number, bold: boolean, face: PaperTable["font"]) => emOf(s, bold, face) * pt * MM;

interface Entry {
  from: number;
  to: number;
  texts: string[];
  pt: number;
  bold: boolean;
  face: PaperTable["font"];
  /** Over a register's column. */
  heading: boolean;
  /** Two tick-box answers side by side (§286): the room they need on one line, at this size. */
  least?: (pt: number) => number;
}

/** A tick box and the space after it, and the space between two answers, mm (styles.css .pt-pick-check). */
const CHECK_BOX = 3.9;
const CHECK_GAP = 3.6;
/** How far the middle of a line of letters stands below the "top of the letters" a cell's y measures, per mm of type. */
const LETTER_MIDDLE = 0.41;

function edgesOf(rows: PaperRow[]): number[] {
  const xs = new Set<number>([0]);
  for (const row of rows) {
    let x = 0;
    for (const c of row.cells) {
      x = Math.round((x + c.w) * 100) / 100;
      xs.add(x);
    }
  }
  const out: number[] = [];
  for (const x of Array.from(xs).sort((a, b) => a - b)) if (out.length === 0 || x - out[out.length - 1] > 0.35) out.push(x);
  return out;
}

function nearest(edges: number[], x: number): number {
  let best = 0;
  for (let i = 1; i < edges.length; i++) if (Math.abs(edges[i] - x) < Math.abs(edges[best] - x)) best = i;
  return best;
}

const shownWords = (s: string | undefined): string => (s && !s.startsWith("@") ? s.replace(/\{fy:\d+\}/g, "Apr-26") : "");
const pickWords = (p: PaperPick[] | undefined): string => (p ?? []).map((x) => x.word).filter(Boolean).join(" / ");

/** What a cell shows on this record. */
function textsOf(c: PaperCell, data: LogSheetData | undefined, line: number | undefined): string[] {
  const row = line !== undefined ? data?.rows[line] : undefined;
  const out: string[] = [];
  if (c.at) out.push(...c.at.map((l) => shownWords(l.t)));
  if (c.t) out.push(c.ul ? shownWords(c.t) : shownWords(c.t).replace(/\s*\n\s*/g, " "));
  if (c.lab) out.push(shownWords(c.lab));
  if (c.sentence) out.push(`${shownWords(c.sentence.before)} ${data?.header?.[c.sentence.box] ?? ""} ${shownWords(c.sentence.after)}`);
  if (c.box) out.push(String(data?.header?.[c.box] ?? ""));
  // (a value's line breaks were its narrow column's on the paper: the words wrap in the column it has now, §285)
  if (c.col && row) out.push(/^\d{4}-\d{2}-\d{2}$/.test(String(row[c.col] ?? "")) ? "00-00-0000" : String(row[c.col] ?? "").replace(/\s*\n\s*/g, " "));
  if (c.pick) out.push(pickWords(c.pick));
  if (c.calc) out.push("0000");
  if (c.num) out.push(String((line ?? 0) + 1));
  return out.filter((s) => s.trim() !== "");
}

function linesAt(text: string, width: number, pt: number, bold: boolean, face: PaperTable["font"]): number {
  let lines = 0;
  for (const part of text.split("\n")) {
    let used = 0;
    let n = 1;
    for (const word of part.split(/\s+/).filter(Boolean)) {
      const w = mmOf(word, pt, bold, face);
      const gap = used > 0 ? mmOf(" ", pt, bold, face) : 0;
      if (used > 0 && used + gap + w > width) {
        n += 1;
        used = w;
      } else used += gap + w;
    }
    lines += n;
  }
  return lines;
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

/** The columns at this size on this width, or null where their longest words do not fit. */
function columnsFor(entries: Entry[], own: number[], W: number, F: number, H: number, whole_only = false): number[] | null {
  const n = own.length;
  const total = sum(own);
  const need = new Array<number>(n).fill(0);
  const want = new Array<number>(n).fill(0);
  const size = (e: Entry) => Math.max(e.pt, e.heading ? H : F);
  const longest = (e: Entry) => Math.max(e.least?.(size(e)) ?? 0, Math.max(0, ...e.texts.flatMap((t) => t.split(/\s+/)).map((w) => mmOf(w, size(e), e.bold, e.face))) + PAD);
  const whole = (e: Entry) => Math.max(e.least?.(size(e)) ?? 0, Math.max(0, ...e.texts.flatMap((t) => t.split("\n")).map((l) => mmOf(l, size(e), e.bold, e.face))) + PAD);
  for (const e of entries) {
    if (e.to - e.from !== 1) continue;
    need[e.from] = Math.max(need[e.from], longest(e));
    want[e.from] = Math.max(want[e.from], e.heading ? longest(e) : whole(e));
  }
  // (words over several columns: those columns together have room for them)
  for (let round = 0; round < 3; round++) {
    for (const e of entries) {
      if (e.to - e.from === 1) continue;
      const have = sum(need.slice(e.from, e.to));
      const lack = longest(e) - have;
      if (lack <= 0) continue;
      const base = sum(own.slice(e.from, e.to)) || 1;
      for (let j = e.from; j < e.to; j++) need[j] += (lack * own[j]) / base;
    }
  }
  if (sum(need) > W) return null;
  for (const e of entries) {
    if (e.to - e.from === 1 || e.heading) continue;
    const lack = whole(e) - sum(want.slice(e.from, e.to));
    if (lack <= 0) continue;
    const base = sum(own.slice(e.from, e.to)) || 1;
    for (let j = e.from; j < e.to; j++) want[j] += (lack * own[j]) / base;
  }
  // Each column keeps its share of the page, or what its longest word needs where that is more...
  const w = own.map((o, j) => Math.max((o * W) / total, need[j]));
  const over = sum(w) - W;
  if (over > 0) {
    const spare = w.map((x, j) => x - need[j]);
    const all = sum(spare) || 1;
    for (let j = 0; j < n; j++) w[j] -= (over * spare[j]) / all;
  }
  // ...and a column whose words would wrap takes what the others do not use, so that they stay on one line.
  const short = w.map((x, j) => Math.max(0, Math.max(want[j], need[j]) - x));
  const free = w.map((x, j) => Math.max(0, x - Math.max(want[j], need[j])));
  const lacking = sum(short);
  const room = sum(free);
  if (whole_only && lacking > room + 0.01) return null;
  if (lacking > 0 && room > 0) {
    const moved = Math.min(lacking, room);
    for (let j = 0; j < n; j++) w[j] += (moved * short[j]) / lacking - (moved * free[j]) / room;
  }
  return w;
}

/** The paper's letters as they print now, smallest first. */
function smallestPrinted(form: PaperTable): number {
  const scale = paperTablePrint(form, true).scale;
  const cells = [...form.head, ...form.body, ...form.foot].flatMap((r) => r.cells).concat(form.lines?.cells ?? []);
  let least = Infinity;
  for (const c of cells) {
    if (c.skip) continue;
    if (c.at) for (const l of c.at) least = Math.min(least, (l.pt ?? c.pt ?? form.pt) * scale);
    if (c.t || c.lab || c.box || c.col || c.pick || c.sentence) least = Math.min(least, (c.pt ?? form.pt) * scale);
  }
  return least;
}

/** Whether this company paper needs its columns measured so anyone can read it. Such a paper's Word and Excel are drawn from it. */
export function paperNeedsReading(form: PaperTable | undefined): boolean {
  return !!form?.ownWords && smallestPrinted(form) < READ_PT;
}

/** Company files that, once filled, run past the page their paper is on: downloaded as the paper is drawn (§282). */
const FILES_DRAWN = new Set(["hr-visitor-health"]);
export const fileIsDrawn = (documentId: string, form: PaperTable | undefined): boolean => FILES_DRAWN.has(documentId) || paperNeedsReading(form);

const noColour = (c: PaperCell): PaperCell => {
  if (!isColour(c.bg) && !isColour(c.bgIf)) return c;
  const out = { ...c };
  if (isColour(out.bg)) delete out.bg;
  if (isColour(out.bgIf)) delete out.bgIf;
  return out;
};

function colourless(form: PaperTable): PaperTable {
  const row = (r: PaperRow): PaperRow => ({ ...r, cells: r.cells.map(noColour) });
  return { ...form, head: form.head.map(row), body: form.body.map(row), foot: form.foot.map(row), ...(form.lines ? { lines: { ...form.lines, cells: form.lines.cells.map(noColour) } } : {}) };
}

function build(form: PaperTable, data: LogSheetData | undefined): PaperTable {
  const old = paperTablePrint(form, true).scale;
  const lineCount = Math.max(1, data?.rows.length ?? 1);
  const template = form.lines ? { h: form.lines.h, cells: lineRow(form, 0) } : null;
  const every = [...form.head, ...form.body, ...(template ? [template] : []), ...form.foot];
  const edges = edgesOf(every);
  const own = edges.slice(1).map((e, i) => e - edges[i]);
  const place = (row: PaperRow) => {
    let x = 0;
    return row.cells.map((c) => {
      const from = nearest(edges, x);
      x = Math.round((x + c.w) * 100) / 100;
      return { c, from, to: Math.max(from + 1, nearest(edges, x)) };
    });
  };
  const entries: Entry[] = [];
  const headingRows = new Set<PaperRow>(form.lines ? form.body.filter((r, i) => r.head || i === form.body.length - 1) : []);
  const note = (c: PaperCell, from: number, to: number, texts: string[], heading = false) => {
    // (a tick box with no words of its own keeps the room for its box, clear of the column's lines)
    if (!c.skip && texts.length === 0 && c.pick?.length === 1 && c.pick[0].mark === "check") {
      entries.push({ from, to, texts: [], pt: (c.pt ?? form.pt) * old, bold: false, face: c.f ?? form.font, heading, least: () => CHECK_BOX });
      return;
    }
    if (c.skip || texts.length === 0) return;
    const pair = c.pick?.length === 2 && c.pick.every((p) => p.mark === "check" && p.word) ? c.pick : null;
    const least = pair ? (pt: number) => sum(pair.map((p) => mmOf(p.word, pt, !!c.b, c.f ?? form.font) + CHECK_BOX)) + CHECK_GAP + PAD : undefined;
    entries.push({ from, to, texts, pt: (c.pt ?? c.at?.[0]?.pt ?? form.pt) * old, bold: !!c.b || !!c.at?.some((l) => l.b), face: c.f ?? form.font, heading, ...(least ? { least } : {}) });
  };
  for (const r of [...form.head, ...form.body, ...form.foot]) for (const { c, from, to } of place(r)) note(c, from, to, textsOf(c, data, c.ln ?? r.line), headingRows.has(r));
  if (template) {
    for (const { c, from, to } of place(template)) {
      const texts: string[] = [];
      for (let n = 0; n < lineCount; n++) texts.push(...textsOf(c, data, n));
      note(c, from, to, Array.from(new Set(texts)));
    }
  }
  const tall = (widths: number[], F: number, H: number, squeeze: number) => {
    const at = [0];
    for (const w of widths) at.push(at[at.length - 1] + w);
    const rowH = (r: PaperRow, line?: number) => {
      let need = 0;
      for (const { c, from, to } of place(r)) {
        if (c.skip || (c.rs ?? 1) > 1) continue;
        const texts = textsOf(c, data, line ?? c.ln ?? r.line);
        const pt = Math.max((c.pt ?? form.pt) * old, headingRows.has(r) ? H : F);
        const count = Math.max(1, ...texts.map((t) => linesAt(t, at[to] - at[from] - PAD, pt, !!c.b, c.f ?? form.font)));
        const lines = line !== undefined ? Math.min(MOST_LINES, count) : count;
        need = Math.max(need, lines * pt * MM * 1.2 + 1);
      }
      return Math.max(r.h * old * squeeze, need);
    };
    // (a line of a register is one line of writing tall; one whose words wrap grows by itself, on the screen as on the page)
    const lineH = template ? Math.max(template.h * old * squeeze, F * MM * 1.2 + 1.4) : 0;
    return { rowH, lineH };
  };
  const heightOf = (widths: number[], F: number, H: number, squeeze: number) => {
    const { rowH, lineH } = tall(widths, F, H, squeeze);
    return sum([...form.head, ...form.body, ...form.foot].map((r) => rowH(r))) + lineH * (form.lines ? Math.max(form.lines.count, lineCount) : 0);
  };
  // A PAPER OF FIXED ROWS WITH ROOM ON ITS PAGES TAKES LARGER LETTERS (REQUIREMENTS §285; the owner, 22-Nov-2026, with F/HR/09: its
  // page 40% empty at 8 pt). Its longer words wrap inside their own rows, as long as every page it draws still holds. Not a paper
  // whose boxes stand inside its words (F/HR/04): those are placed against the words' own size.
  const fixedRows = !form.lines && [...form.head, ...form.body, ...form.foot].flatMap((r) => r.cells).filter((c) => c.over?.length).length <= 1;
  const pagesHold = (widths: number[], F: number, H: number, roomH: number) => {
    const { rowH } = tall(widths, F, H, 1);
    const at = [0];
    for (const w of widths) at.push(at[at.length - 1] + w);
    const rows = [...form.head, ...form.body, ...form.foot];
    const heights = rows.map((r) => rowH(r));
    rows.forEach((r, i) => {
      for (const { c, from, to } of place(r)) {
        const span = c.rs ?? 1;
        if (c.skip || span <= 1) continue;
        const pt = Math.max((c.pt ?? form.pt) * old, F);
        const count = Math.max(1, ...textsOf(c, data, c.ln ?? r.line).map((t) => linesAt(t, at[to] - at[from] - PAD, pt, !!c.b, c.f ?? form.font)));
        const short = count * pt * MM * 1.2 + 1 - sum(heights.slice(i, i + span));
        if (short > 0) for (let k = i; k < Math.min(i + span, heights.length); k++) heights[k] += short / span;
      }
    });
    let used = 0;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].pb) used = 0;
      used += heights[i];
      if (used > roomH) return false;
    }
    return true;
  };
  const choose = (page: PaperTable["page"]) => {
    const W = (page === "portrait" ? 210 : 297) - 2 * MARGIN;
    const roomH = (page === "portrait" ? 297 : 210) - HEAD_FOOT;
    if (fixedRows && page === form.page) {
      for (const F of SIZES.filter((s) => s > READ_PT)) {
        for (let H = F; H >= Math.max(READ_PT, F - 1) - 0.001; H -= 0.5) {
          const widths = columnsFor(entries, own, W, F, H);
          if (widths && pagesHold(widths, F, H, roomH)) return { page, F, H, squeeze: 1, widths };
        }
      }
    }
    // First the largest size at which every written value stays on one line; then, from the reading size down, words may wrap.
    for (const whole of [true, false]) {
      for (const F of whole ? SIZES.filter((s) => s >= READ_PT) : SIZES.filter((s) => s <= READ_PT)) {
        for (let H = F; H >= Math.max(HEAD_PT, F - HEAD_LESS) - 0.001; H -= 0.5) {
          const widths = columnsFor(entries, own, W, F, H, whole);
          if (!widths) continue;
          // (a one-page paper stays on one page: its rows give up their spare height before its letters get smaller)
          for (const squeeze of form.flows ? [1] : [1, 0.94, 0.88, 0.82, 0.76]) if (form.flows || heightOf(widths, F, H, squeeze) <= roomH) return { page, F, H, squeeze, widths };
        }
      }
    }
    return null;
  };
  const here = choose(form.page);
  const other = choose(form.page === "portrait" ? "landscape" : "portrait");
  const best = here && (here.F >= READ_PT || !other || other.F <= here.F) ? here : (other ?? here);
  if (!best) return form;
  // (a strip of a column stays a column: the page's grid is cut from these edges)
  const widths = best.widths.map((w) => Math.max(0.45, w));
  const at = [0];
  for (const w of widths) at.push(Math.round((at[at.length - 1] + w) * 100) / 100);
  const { rowH, lineH } = tall(widths, best.F, best.H, best.squeeze);
  const rewrite = (c: PaperCell, from: number, to: number, h: number, oldH: number, floor = best.F): PaperCell => {
    const w = Math.round((at[to] - at[from]) * 100) / 100;
    const across = c.w > 0 ? w / c.w : 1;
    const down = oldH > 0 ? h / oldH : 1;
    const pt = Math.round(Math.max((c.pt ?? form.pt) * old, floor) * 100) / 100;
    const out: PaperCell = { ...c, w, pt };
    delete out.y;
    delete out.ww;
    delete out.cx;
    delete out.pad;
    out.lh = Math.round(pt * MM * 1.2 * 100) / 100;
    if (out.x !== undefined) out.x = Math.min(Math.round(out.x * old * 100) / 100, 1.2);
    if (c.at) {
      out.at = c.at.map((l) => {
        const line = { ...l, pt: Math.round(Math.max((l.pt ?? c.pt ?? form.pt) * old, best.F) * 100) / 100, y: Math.round(l.y * old * down * 100) / 100 };
        if (l.x !== undefined) line.x = Math.round(l.x * across * 100) / 100;
        return line;
      });
    } else if (!c.over?.length && !c.top) out.vm = true;
    if (c.over) out.over = c.over.map((o) => ({ ...o, x: o.x * across, w: o.w * across, y: o.y * old * down, h: o.h * old * down }));
    // A label and the box written beside it stand on one line, in the middle of their row (§286). A question of two lines: its
    // box on the second line, beside the words it follows.
    if (out.over?.length && c.t && !c.at && (c.rs ?? 1) === 1) {
      const lines = c.t.split("\n").length;
      const lh = out.lh ?? pt * MM * 1.2;
      const firstMiddle = (h - (lines - 1) * lh) / 2;
      const boxMiddle = firstMiddle + (lines - 1) * lh;
      out.y = Math.round((firstMiddle - LETTER_MIDDLE * pt * MM) * 100) / 100;
      out.over = out.over.map((o) => {
        const boxH = Math.min(o.h, lh + 0.6, h - 0.5);
        return { ...o, h: boxH, y: Math.max(0.1, Math.min(boxMiddle - boxH / 2, h - boxH - 0.25)) };
      });
    }
    if (c.sentence) out.sentence = { ...c.sentence, boxWidth: c.sentence.boxWidth * old };
    return out;
  };
  const rows = (list: PaperRow[]) =>
    list.map((r) => {
      const h = Math.round(rowH(r) * 100) / 100;
      return { ...r, h, cells: place(r).map(({ c, from, to }) => rewrite(c, from, to, h, r.h * old, headingRows.has(r) ? best.H : best.F)) };
    });
  const lines = form.lines && template ? { ...form.lines, h: Math.round(lineH * 100) / 100, cells: place({ h: template.h, cells: form.lines.cells }).map(({ c, from, to }) => rewrite(c, from, to, lineH, template.h * old)) } : undefined;
  return { ...form, page: best.page, left: MARGIN, top: MARGIN, head: rows(form.head), body: rows(form.body), foot: rows(form.foot), ...(lines ? { lines } : {}), readFit: true };
}

/** The paper's words wrap in the column they have now, not at the line breaks of its old narrow column (F/HR/21, §285). */
function flatWords(form: PaperTable): PaperTable {
  // (a question with its answer box inside it keeps its line break: the box stands on that second line, §286)
  const cell = (c: PaperCell): PaperCell => (c.t?.includes("\n") && !c.ul && !c.over?.length ? { ...c, t: c.t.replace(/\s*\n\s*/g, " ") } : c);
  const row = (r: PaperRow): PaperRow => ({ ...r, cells: r.cells.map(cell) });
  return { ...form, head: form.head.map(row), body: form.body.map(row), foot: form.foot.map(row) };
}

/**
 * A last page holding nothing but the paper's letterhead (F/HR/19's fifth: a Word page break after its table) is not drawn or
 * printed, so no blank sheet comes out of the printer (REQUIREMENTS §285).
 */
function withoutEmptyLastPage(form: PaperTable): PaperTable {
  if (form.foot.length > 0 || form.lines) return form;
  const last = form.body.map((r) => !!r.pb).lastIndexOf(true);
  if (last < 0) return form;
  const wordsOf = (c: PaperCell) => (c.at ? c.at.map((l) => l.t).join(" ") : (c.t ?? "")).replace(/\d+/g, "").replace(/\s+/g, " ").trim();
  const heading = new Set(form.head.flatMap((r) => r.cells.map(wordsOf)));
  const holdsMore = form.body.slice(last).some((r) => r.cells.some((c) => c.col !== undefined || !!c.box || !!c.pick || !!c.sentence || !!c.over?.length || !heading.has(wordsOf(c))));
  return holdsMore ? form : { ...form, body: form.body.slice(0, last) };
}

const made = new Map<string, PaperTable>();

/**
 * The company's paper as this record draws it: no colour on it, and, where its letters would print too small, its columns fitted.
 * Worked out once for a record's lines (`key`), so that a column does not move under the person's hands while they type.
 */
export function readablePaper(form: PaperTable, data: LogSheetData | undefined, key: string): PaperTable {
  if (!form.ownWords) return form;
  const known = made.get(key);
  if (known) return known;
  const clean = withoutEmptyLastPage(colourless(form));
  const out = paperNeedsReading(clean) ? flatWords(build(clean, data)) : clean;
  if (made.size > 12) made.clear();
  made.set(key, out);
  return out;
}
