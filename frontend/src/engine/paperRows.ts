// A ROW PUT IN, OR TAKEN OFF, ON AN HR PAPER (REQUIREMENTS §276; the owner, 21-Nov-2026: "make sure that user can add delete any
// row or add row"). The format keeps its rows: a record keeps which of them it took off and which it put in
// (data.words.paperRows). A row put in has the cells of the row it follows, blank, on lines of its own where the paper's row
// is answered on the record's lines; a row taken off keeps what it held, so it can be brought back as it was.

import type { PaperCell, PaperRow, PaperTable } from "../data/seed/qcPaperTables";
import type { LogSheetData, LogSheetRow, PaperRowsKept } from "../types/record";

const HEAD_WORDS = /GUJARAT PRINT PACK|Format No|Rev No|Page No|F\/HR\/\d+/i;
const NUMBER = /^\d+\.?$/;

const wordsOf = (c: PaperCell): string => [c.t, c.lab, c.sentence?.before, ...(c.at ?? []).map((l) => l.t)].filter(Boolean).join(" ");

/** Rows held together by a cell running down them: one row of the paper to add after or take off. */
function units(rows: PaperRow[]): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  for (let from = 0; from < rows.length; ) {
    let to = from;
    for (let i = from; i <= to; i++) for (const c of rows[i].cells) if (!c.skip && (c.rs ?? 1) > 1) to = Math.min(rows.length - 1, Math.max(to, i + (c.rs as number) - 1));
    out.push({ from, to });
    from = to + 1;
  }
  return out;
}

interface Part {
  rows: PaperRow[];
  row0: number;
  /** How many of its first rows are the letterhead, which stays. */
  fixed: number;
}

function partsOf(form: PaperTable): { head: Part; body: Part; foot: Part } {
  const lastBand = form.head.reduce((at, r, i) => (r.cells.some((c) => HEAD_WORDS.test(wordsOf(c))) ? i : at), -1);
  return {
    head: { rows: form.head, row0: 0, fixed: lastBand >= 0 ? lastBand + 1 : form.head.length },
    body: { rows: form.body, row0: form.head.length, fixed: 0 },
    foot: { rows: form.foot, row0: form.head.length + form.body.length + (form.lines?.count ?? 0), fixed: 0 },
  };
}

/** A row that may be added after or taken off: never the letterhead, a page's repeated head, a heading or a hair-thin strip. */
function canChange(rows: PaperRow[]): boolean {
  if (rows.reduce((a, r) => a + r.h, 0) < 3 || rows.some((r) => r.stays)) return false;
  const holds = (c: PaperCell) => !!(c.t || c.lab || c.box || c.col || c.pick?.length || c.sentence || c.at?.length || c.over?.length || c.calc || c.num);
  if (!rows.some((r) => r.cells.some((c) => !c.skip && (holds(c) || (c.edges ?? "ltrb") !== "")))) return false;
  return !rows.some((r) => r.pb || r.head || r.cells.some((c) => HEAD_WORDS.test(wordsOf(c)) || /^Sr\.?\s*no/i.test(wordsOf(c).trim()) || (!!c.pl && wordsOf(c).trim() !== "")));
}

/** The record's lines a row of the paper is answered on. */
function linesOf(rows: PaperRow[]): number[] {
  const seen = new Set<number>();
  const note = (n: number | undefined) => {
    if (n !== undefined) seen.add(n);
  };
  for (const r of rows) {
    for (const c of r.cells) {
      if (c.skip) continue;
      if (c.col !== undefined || c.calc) note(c.ln);
      for (const p of c.pick ?? []) if (p.col) note(p.ln ?? c.ln);
      for (const o of c.over ?? []) {
        if (o.col) note(o.ln ?? c.ln);
        for (const p of o.pick ?? []) if (p.col) note(p.ln ?? o.ln ?? c.ln);
      }
    }
  }
  return Array.from(seen).sort((a, b) => a - b);
}

/** The record's columns a row of the paper writes in. */
function columnsOf(rows: PaperRow[]): string[] {
  const keys = new Set<string>();
  for (const r of rows) {
    for (const c of r.cells) {
      if (c.col) keys.add(c.col);
      for (const p of c.pick ?? []) if (p.col) keys.add(p.col);
      for (const o of c.over ?? []) {
        if (o.col) keys.add(o.col);
        for (const p of o.pick ?? []) if (p.col) keys.add(p.col);
      }
    }
  }
  return Array.from(keys);
}

const LOOK = ["w", "edges", "a", "pt", "f", "x", "y", "lh", "b", "bg", "open", "heavy", "vm", "skip", "rs", "u", "fromTop"] as const;

/** A cell of a row put in: the look of the cell it copies, blank, written on the row's own lines where it has them. */
function blankCell(c: PaperCell, place: string, line: (n: number | undefined) => number | undefined): PaperCell {
  const look = {} as Record<string, unknown>;
  for (const k of LOOK) if (c[k] !== undefined) look[k] = c[k];
  const out = look as unknown as PaperCell;
  if (c.skip) return out;
  // (one box for the whole table: the row put in leaves its place to the box above, which runs down over it - spanOnce)
  if (c.once) return { ...out, skip: true, once: true };
  const own = line(c.ln);
  if (c.col !== undefined && own !== undefined) return { ...out, col: c.col, ln: own, ...(c.lines ? { lines: true as const } : {}) };
  if (c.calc && own !== undefined) return { ...out, calc: c.calc, ln: own };
  if (c.pick?.length && c.pick.every((p) => p.col && line(p.ln ?? c.ln) !== undefined)) {
    return { ...out, pick: c.pick.map((p) => ({ ...p, ln: line(p.ln ?? c.ln) })), ...(own !== undefined ? { ln: own } : {}) };
  }
  const over = (c.over ?? []).flatMap((o) => {
    const n = line(o.ln ?? c.ln);
    if (n === undefined) return [];
    if (o.col) return [{ ...o, ln: n }];
    if (o.pick?.length && o.pick.every((p) => p.col && line(p.ln ?? o.ln ?? c.ln) !== undefined)) return [{ ...o, ln: n, pick: o.pick.map((p) => ({ ...p, ln: line(p.ln ?? o.ln ?? c.ln) })) }];
    return [];
  });
  return { ...out, t: NUMBER.test((c.t ?? "").trim()) || c.keep ? c.t : "", pl: place, ...(c.keep ? { keep: true as const } : {}), ...(over.length ? { over } : {}) };
}

/** The paper's own numbers of its lines, counted again where rows went in or came off; each list of numbers counts by itself. */
function renumbered(rows: PaperRow[], put: Set<PaperRow>): PaperRow[] {
  let last = 0;
  let own = -1;
  return rows.map((r) => {
    const ci = r.cells.findIndex((c) => !c.skip && wordsOf(c).trim() !== "");
    const c = r.cells[ci];
    if (!c || !NUMBER.test((c.t ?? "").trim())) return r;
    const was = parseInt(c.t as string, 10);
    if (!put.has(r)) {
      if (was <= own) last = was - 1;
      own = was;
    }
    last += 1;
    const t = `${last}${(c.t as string).trim().endsWith(".") ? "." : ""}`;
    return t === c.t ? r : { ...r, cells: r.cells.map((x, i) => (i === ci ? { ...x, t } : x)) };
  });
}

/**
 * A cell that is one box for the whole table (PaperCell.once) runs down over the rows put in straight under it; a row put in
 * whose box has no such cell above it (that row was taken off) has the cell blank, as the paper draws it.
 */
function spanOnce(out: PaperRow[], put: Set<PaperRow>): PaperRow[] {
  if (!out.some((r) => r.cells.some((c) => c.once))) return out;
  const res = [...out];
  const covered = new Set<string>();
  out.forEach((r, i) =>
    r.cells.forEach((c, ci) => {
      if (!c.once || c.skip) return;
      const own = c.rs ?? 1;
      let end = i + own;
      while (end < out.length && put.has(out[end]) && out[end].cells[ci]?.skip) covered.add(`${end}:${ci}`), end++;
      if (end - i !== own) res[i] = { ...res[i], cells: res[i].cells.map((x, k) => (k === ci ? { ...x, rs: end - i } : x)) };
    })
  );
  return res.map((r, i) => {
    if (!put.has(out[i]) || !r.cells.some((c, ci) => c.once && c.skip && !covered.has(`${i}:${ci}`))) return r;
    const row = { ...r, cells: r.cells.map((c, ci) => (c.once && c.skip && !covered.has(`${i}:${ci}`) ? { ...c, skip: undefined, t: "" } : c)) };
    put.add(row);
    return row;
  });
}

/**
 * An empty strip that gives way (PaperRow.give) loses the height of the rows put in above it, down to 2 mm, and gets back
 * the height of the rows taken off, so the rows under it stay where the page's frame has them.
 */
function given(rows: PaperRow[], less: number): PaperRow[] {
  const at = rows.findIndex((r) => r.give);
  if (at < 0 || !less) return rows;
  return rows.map((r, i) => (i === at ? { ...r, h: Math.max(2, Math.round((r.h - less) * 100) / 100) } : r));
}

/** The paper as this record keeps its rows; each row that can change says its key (PaperRow.rowKey). */
export function paperWithRows(form: PaperTable, kept: PaperRowsKept | undefined): PaperTable {
  if (!form.ownWords) return form;
  const removed = new Set(kept?.removed ?? []);
  const added = kept?.added ?? [];
  const changed = removed.size > 0 || added.length > 0;
  const { head, body, foot } = partsOf(form);
  const all = [head, body, foot];
  const unitOf = new Map<string, PaperRow[]>();
  for (const p of all) for (const u of units(p.rows)) unitOf.set(String(p.row0 + u.from), p.rows.slice(u.from, u.to + 1));
  const build = (p: Part): PaperRow[] => {
    const out: PaperRow[] = [];
    const put = new Set<PaperRow>();
    const follow = (key: string) => {
      for (const a of added.filter((x) => x.after === key)) {
        const source = unitOf.get(a.from);
        // (a copy of a row that stays, put in before it did, is not drawn: F/SYS/05's empty strips under the note, §399)
        if (source?.some((r) => r.stays)) continue;
        if (source) {
          const from = linesOf(source);
          const line = (n: number | undefined) => {
            const at = n === undefined ? -1 : from.indexOf(n);
            return at >= 0 ? a.lines?.[at] : undefined;
          };
          source.forEach((r, ri) => {
            const row: PaperRow = { h: r.h, cells: r.cells.map((c, ci) => blankCell(c, `add:${a.id}:${ri}:${ci}`, line)), ...(ri === 0 ? { rowKey: `add:${a.id}` } : {}) };
            put.add(row);
            out.push(row);
          });
        }
        follow(`add:${a.id}`);
      }
    };
    // (the height the rows put in add above a strip that gives way, less what the rows taken off there gave up)
    let less = 0;
    let gave = false;
    for (const u of units(p.rows)) {
      const key = String(p.row0 + u.from);
      const rows = p.rows.slice(u.from, u.to + 1);
      const may = u.from >= p.fixed && canChange(rows);
      if (rows.some((r) => r.give)) gave = true;
      if (!gave && may && removed.has(key)) less -= rows.reduce((h, r) => h + r.h, 0);
      if (!(may && removed.has(key))) {
        rows.forEach((r, ri) => {
          // (a row keeps its words by its place on the format, wherever it now stands)
          const stamped = changed ? { ...r, cells: r.cells.map((c, ci) => (c.pl ? c : { ...c, pl: `${p.row0 + u.from + ri}:${ci}` })) } : r;
          out.push(ri === 0 && may ? { ...stamped, rowKey: key } : stamped);
        });
      }
      const before = out.length;
      if (!rows.some((r) => r.stays)) follow(key);
      if (!gave) less += out.slice(before).reduce((h, r) => h + r.h, 0);
    }
    return changed ? given(renumbered(spanOnce(out, put), put), less) : out;
  };
  return { ...form, head: build(head), body: build(body), foot: build(foot) };
}

const unitAt = (form: PaperTable, key: string): PaperRow[] | undefined => {
  for (const p of Object.values(partsOf(form))) {
    for (const u of units(p.rows)) if (String(p.row0 + u.from) === key) return p.rows.slice(u.from, u.to + 1);
  }
  return undefined;
};

const withKept = (data: LogSheetData, kept: PaperRowsKept): LogSheetData => {
  const clean: PaperRowsKept = {};
  if (kept.added?.length) clean.added = kept.added;
  if (kept.removed?.length) clean.removed = kept.removed;
  if (kept.held && Object.keys(kept.held).length) clean.held = kept.held;
  const words = { ...data.words };
  if (Object.keys(clean).length) words.paperRows = clean;
  else delete words.paperRows;
  return { ...data, words };
};

/**
 * A row put in under the row `after`. `line` makes one of the record's lines, where the sheet's lines may grow; where they may
 * not (`line` undefined) the new row's cells are words of its own.
 */
export function paperRowAdded(form: PaperTable, data: LogSheetData, after: string, id: string, line?: () => LogSheetRow): LogSheetData {
  const kept = data.words?.paperRows ?? {};
  const from = after.startsWith("add:") ? kept.added?.find((a) => `add:${a.id}` === after)?.from : after;
  const source = from ? unitAt(form, from) : undefined;
  if (!from || !source) return data;
  const wanted = line ? linesOf(source).length : 0;
  const rows = [...data.rows];
  const lines: number[] = [];
  for (let i = 0; i < wanted; i++) {
    lines.push(rows.length);
    rows.push(line!());
  }
  return withKept({ ...data, rows }, { ...kept, added: [...(kept.added ?? []), { id, after, from, ...(lines.length ? { lines } : {}) }] });
}

/** A row taken off: what its lines held is kept for "bring back", and no longer counts on the record. */
export function paperRowRemoved(form: PaperTable, data: LogSheetData, key: string): LogSheetData {
  const kept = data.words?.paperRows ?? {};
  const blank = (rows: LogSheetRow[], at: number[], cols: string[]) => rows.map((r, i) => (at.includes(i) ? ({ ...r, ...Object.fromEntries(cols.map((c) => [c, ""])) } as LogSheetRow) : r));
  if (key.startsWith("add:")) {
    const a = kept.added?.find((x) => `add:${x.id}` === key);
    if (!a) return data;
    const source = unitAt(form, a.from) ?? [];
    const added = (kept.added ?? []).filter((x) => x !== a).map((x) => (x.after === key ? { ...x, after: a.after } : x));
    return withKept({ ...data, rows: blank(data.rows, a.lines ?? [], columnsOf(source)) }, { ...kept, added });
  }
  const rows = unitAt(form, key);
  if (!rows || kept.removed?.includes(key)) return data;
  const at = linesOf(rows);
  const cols = columnsOf(rows);
  const held: Record<string, Record<string, string | number | null>> = {};
  for (const n of at) {
    const line = data.rows[n];
    if (line) held[String(n)] = Object.fromEntries(cols.map((c) => [c, line[c] ?? ""]));
  }
  return withKept({ ...data, rows: blank(data.rows, at, cols) }, { ...kept, removed: [...(kept.removed ?? []), key], held: { ...kept.held, [key]: held } });
}

/** The rows this record took off, back in their places with what they held. Rows it put in stay. */
export function paperRowsBack(data: LogSheetData): LogSheetData {
  const kept = data.words?.paperRows;
  if (!kept?.removed?.length) return data;
  const rows = data.rows.map((r) => ({ ...r }));
  for (const lines of Object.values(kept.held ?? {})) {
    for (const [n, values] of Object.entries(lines)) {
      const line = rows[Number(n)];
      if (!line) continue;
      for (const [k, v] of Object.entries(values)) if (String(line[k] ?? "").trim() === "") line[k] = v;
    }
  }
  return withKept({ ...data, rows }, { added: kept.added });
}
