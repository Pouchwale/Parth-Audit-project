import type { LogHeaderField, LogSheetData, LogSheetLayout } from "../types";
import type { PaperCell, PaperRow, PaperTable } from "../data/seed/qcPaperTables";

// A TABLE OF BOXES, ITS ROWS THE RECORD'S OWN (REQUIREMENTS §246; the owner, 17-Nov-2026, with F/QC/17's two tables - Make,
// Serial number, Range ... under "Master Measuring Scale (Ruler) Details" and "Measuring Scale (Ruler) under calibration
// details": "so this for both 300mm and 600mm so in that user can edit both left and right side and add and delete any row
// he want"). A table the paper heads across its two columns, its words on the left and a box on the right
// (LogHeaderField.boxTable with no columns of its own), is drawn from the record's own list of its rows (data.boxRows,
// by the table's first box): a row put in under any row - its words and its box the person's ("extra-…") - and any row
// taken off, the format's too; each row's words typed over (data.words.headings "label:<key>", as every box's label).
// A row taken off is not asked for on Submit. A new sheet carries the last one's rows, words and added boxes.

/** An added row's box: "extra-" and its id. */
export const EXTRA_BOX = "extra-";
export const isExtraBox = (key: string): boolean => key.startsWith(EXTRA_BOX);

export interface ListTable {
  /** The table's first box: its key names the table in data.boxRows. */
  first: string;
  /** The format's boxes of the table, in its order. */
  keys: string[];
  /** The format's words for each row. */
  words: string[];
}

/** The tables of boxes headed across, a box to a row (F/QC/17's two). */
export function listTables(layout: Pick<LogSheetLayout, "headerFields">): ListTable[] {
  const out: ListTable[] = [];
  const fields = layout.headerFields;
  fields.forEach((f: LogHeaderField, i: number) => {
    const t = f.boxTable;
    if (!t || t.columns.length > 0 || t.cornerBox || t.rows.length === 0) return;
    const keys = fields.slice(i, i + t.rows.length).map((x) => x.key);
    out.push({ first: f.key, keys, words: t.rows.slice(0, keys.length) });
  });
  return out;
}

/** The rows a record's table shows, in its order. */
export const shownRows = (data: Pick<LogSheetData, "boxRows"> | undefined, t: ListTable): string[] => data?.boxRows?.[t.first] ?? t.keys;

/** The words a row's left-hand cell shows: the record's own, else the format's. */
export function rowWords(data: Pick<LogSheetData, "words"> | undefined, t: ListTable, key: string): string {
  const own = data?.words?.headings?.[`label:${key}`];
  if (own !== undefined) return own;
  const i = t.keys.indexOf(key);
  return i >= 0 ? t.words[i] : "";
}

/** The format's boxes a record has taken off its tables: not drawn, not asked for. */
export function hiddenBoxes(layout: Pick<LogSheetLayout, "headerFields">, data: Pick<LogSheetData, "boxRows"> | undefined): Set<string> {
  const out = new Set<string>();
  for (const t of listTables(layout)) {
    const shown = new Set(shownRows(data, t));
    for (const k of t.keys) if (!shown.has(k)) out.add(k);
  }
  return out;
}

/** The record with a new row under `after` in table `t`: its box `key`, blank, its words blank. */
export function withRowAdded(data: LogSheetData, t: ListTable, after: string, key: string): LogSheetData {
  const rows = shownRows(data, t).slice();
  const at = rows.indexOf(after);
  rows.splice(at < 0 ? rows.length : at + 1, 0, key);
  return { ...data, boxRows: { ...data.boxRows, [t.first]: rows }, header: { ...data.header, [key]: "" }, words: { ...data.words, headings: { ...data.words?.headings, [`label:${key}`]: "" } } };
}

/** The record with row `key` taken off table `t`; an added row's box and words go with it. */
export function withRowRemoved(data: LogSheetData, t: ListTable, key: string): LogSheetData {
  const rows = shownRows(data, t).filter((k) => k !== key);
  if (!isExtraBox(key)) return { ...data, boxRows: { ...data.boxRows, [t.first]: rows } };
  const header = { ...data.header };
  delete header[key];
  const headings = { ...data.words?.headings };
  delete headings[`label:${key}`];
  return { ...data, boxRows: { ...data.boxRows, [t.first]: rows }, header, words: { ...data.words, headings } };
}

/** What a new sheet takes of the last one's tables: their rows, the rows' words, the added boxes' words. */
export function carriedBoxRows(layout: Pick<LogSheetLayout, "headerFields">, previous: LogSheetData, into: LogSheetData): LogSheetData {
  if (!previous.boxRows || listTables(layout).length === 0) return into;
  const header = { ...into.header };
  const headings = { ...into.words?.headings };
  for (const t of listTables(layout)) {
    for (const k of shownRows(previous, t)) {
      const w = previous.words?.headings?.[`label:${k}`];
      if (w !== undefined) headings[`label:${k}`] = w;
      if (isExtraBox(k)) header[k] = String(previous.header?.[k] ?? "");
    }
  }
  return { ...into, boxRows: { ...previous.boxRows }, header, words: { ...into.words, headings } };
}

/**
 * The paper drawn with the record's own rows in its tables of boxes (F/QC/17): each run of the format's rows - its words
 * (@boxRow) and its box - drawn again for the record's rows, in its order, the words cell naming its row (rowKey).
 */
export function withRecordBoxRows(form: PaperTable, layout: Pick<LogSheetLayout, "headerFields">, data: LogSheetData | undefined): PaperTable {
  const tables = new Map(listTables(layout).map((t) => [t.first, t] as const));
  if (tables.size === 0) return form;
  const body: PaperRow[] = [];
  let i = 0;
  while (i < form.body.length) {
    const row = form.body[i];
    const m = /^@boxRow:([^:]+):\d+$/.exec(row.cells[0]?.lab ?? "");
    const t = m ? tables.get(m[1]) : undefined;
    if (!t) {
      body.push(row);
      i++;
      continue;
    }
    // The run of the table's rows, and the first one as the pattern of every row drawn.
    let j = i;
    while (j < form.body.length && new RegExp(`^@boxRow:${m![1]}:\\d+$`).test(form.body[j].cells[0]?.lab ?? "")) j++;
    const pattern = form.body[i];
    for (const key of shownRows(data, t)) {
      const [wordsCell, boxCell, ...rest] = pattern.cells;
      const label: PaperCell = { ...wordsCell, lab: undefined, t: rowWords(data, t, key), rowKey: key, rowTable: t.first };
      body.push({ ...pattern, cells: [label, { ...boxCell, box: key }, ...rest] });
    }
    i = j;
  }
  return { ...form, body };
}
