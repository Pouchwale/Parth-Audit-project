import type { LogColumn, LogHeaderField, LogSheetData, LogSheetLayout, ReferenceTable } from "../types";
import { getLogSheetLayout } from "../data/seed/logSheetLayouts";

// EVERY QC FORMAT EXACTLY AS THE PAPER (REQUIREMENTS §111, 13-Oct-2026).
//
// Four things the paper does that a layout could not say before, and the one
// place each is worked out, so the sheet, its print, the Excel and Word files
// made from it, the format's designer, Mitra and the phone all read them alike:
//
//   a box the paper fills in print   LogHeaderField.printed — F/QC/11's Device ID
//                                    No "1-54, 2-55, 3-56, 4-57", Location "LAB".
//                                    Shown as text, written into every record
//                                    (withPrintedBoxes, run with the worked-out
//                                    cells), never typed, uploaded or asked for.
//   the day in the Sr. No. column    LogSheetLayout.srNoShowsDate — F-QC-30 writes
//                                    the date on the day's first line only.
//   an entry of two lines            LogColumn.beneath with the layout's
//                                    secondLine — F/QC/12's "Deviation %" line.
//   the text below the grid          LogSheetLayout.notesBelow — the PROCEDURE.
//
// And, for the incoming material records, the certificates of analysis and the
// tolerance card, the places the paper puts its boxes and words:
//
//   the boxes in the paper's groups  LogHeaderField.printedAbove, tableAbove and
//                                    boxesPerLine, above or below the grid —
//                                    F/QC/06's LABEL STOCK three across, its
//                                    COATING, FINISHING and TOLERANCE in their
//                                    places (boxGroups).
//   the text at the foot             LogSheetLayout.notesAtFoot — the
//                                    certificates' "THIS IS A SYSTEM GENERATED
//                                    DOCUMENT." after every box.
//   a heading the paper leaves out   LogColumn.printedLabel — F/QC/25 heads its
//                                    descriptions with nothing (columnHeading).
//   a box in its column of the line  LogHeaderField.paperColumn — an incoming
//                                    record's Date of Inspection at the right.
//   boxes as the paper's table       LogHeaderField.boxTable — a certificate's
//                                    Specified Size, LABEL STOCK, SLEEVE FILM and
//                                    the Minimum Gloss line (boxGroups).
//   the grid printed across          LogSheetLayout.gridAcross — a certificate's
//                                    PRINTING, its colours 1 to 10 across.
//
// And, from a third look at the same originals (part 4), the paper's own marks:
//
//   the choices printed across       LogHeaderField.choicesAcross — an incoming
//                                    record's LOT STATUS, the one that holds
//                                    marked (choiceWords).
//   the words under a box            LogHeaderField.printedBelow — "QA INSPECTOR"
//                                    under INSPECTED BY.
//   a value inside its sentence      LogHeaderField.inSentence — "This material
//                                    should be retested on … before usage."
//   the Sr. No. with its full stop   LogSheetLayout.srNoFullStop — "1.", "2.".
//   headings in the paper's letters  LogSheetLayout.headingsAsPrinted — a
//                                    certificate's "Length(mm)", not "LENGTH(MM)".
//   one answer across the columns    LogSheetLayout.answerAcross — F/QC/25's one
//                                    answer box a line, its GSM / BF / Grade of
//                                    Paper headed on line 7 (answerAcrossOf), and
//                                    LogHeaderField.inGridHead — its OID :- and
//                                    Job Code: on the grid's top line
//                                    (gridHeadBoxes, boxGroupsBesideGrid).

/** A box the paper prints its value in (REQUIREMENTS §111). */
export const isPrintedBox = (f: Pick<LogHeaderField, "printed">): f is LogHeaderField & { printed: string } => typeof f.printed === "string";

// Worked out once per layout object: every sheet of a format shares it
// (getLogSheetLayout hands back the same object until the format is changed).
const printedOf = new WeakMap<LogSheetLayout, LogHeaderField[]>();

/** The boxes above and below the grid whose value the paper prints. */
export function printedBoxes(layout: LogSheetLayout): LogHeaderField[] {
  const hit = printedOf.get(layout);
  if (hit) return hit;
  const boxes = [...layout.headerFields, ...(layout.footerFields ?? [])].filter(isPrintedBox);
  printedOf.set(layout, boxes);
  return boxes;
}

/**
 * The record's data with every printed box holding what the paper prints; the
 * same object when nothing changes, and any other document's data as it is.
 * Run with the worked-out cells (engine/computedCells.ts) wherever a log sheet
 * is shown or stored, so a record written before the box was printed — or one
 * somebody typed "WS-2026-10" into — reads the paper's value.
 */
export function withPrintedBoxes<T>(documentId: string | undefined, data: T): T {
  if (!documentId) return data;
  const layout = getLogSheetLayout(documentId);
  if (!layout) return data;
  const boxes = printedBoxes(layout);
  if (boxes.length === 0) return data;
  const d = data as unknown as Partial<LogSheetData> | null | undefined;
  if (!d || typeof d !== "object" || !Array.isArray(d.rows)) return data;
  const header = d.header ?? {};
  let next: Record<string, string> | null = null;
  for (const f of boxes) {
    if (header[f.key] === f.printed) continue;
    next = next ?? { ...header };
    next[f.key] = f.printed!;
  }
  return next ? ({ ...d, header: next } as unknown as T) : data;
}

/** The two lines of an entry, as the grid draws them. */
export interface GridLines {
  /** The columns drawn on the entry's own line, in order — every column not drawn beneath another. */
  first: LogColumn[];
  /**
   * The second line, one place per column of the first: the column drawn under it, or null.
   * Absent when the layout gives its entries one line.
   */
  second?: { label: string; under: (LogColumn | null)[] };
}

const linesOf = new WeakMap<LogSheetLayout, GridLines>();

/**
 * How an entry is drawn: one line, or — where the paper gives each entry a second
 * line (F/QC/12's "Deviation %") — the columns on each. A column `beneath` one
 * that is not on the first line, or on a layout with no `secondLine`, is drawn on
 * the first line as before, so a format edited into such a shape loses nothing.
 */
export function gridLines(layout: LogSheetLayout): GridLines {
  const hit = linesOf.get(layout);
  if (hit) return hit;
  // A column can be drawn under any column of the first line but the first, which holds the second line's heading.
  const onFirst = new Set(layout.columns.filter((c) => !c.beneath).map((c) => c.key));
  const lead = layout.columns.find((c) => !c.beneath)?.key;
  const below = (c: LogColumn): boolean => !!layout.secondLine && !!c.beneath && c.beneath !== lead && onFirst.has(c.beneath);
  const first = layout.columns.filter((c) => !below(c));
  let out: GridLines = { first };
  if (layout.secondLine && first.length < layout.columns.length) {
    const under = first.map((c) => layout.columns.find((b) => below(b) && b.beneath === c.key) ?? null);
    out = { first, second: { label: layout.secondLine.label, under } };
  }
  linesOf.set(layout, out);
  return out;
}

/**
 * What the sheet's own Sr. No. column shows on a line: the line's number, or —
 * where the paper writes the day there (F-QC-30) — the record's date on the
 * first line and nothing on the others.
 */
export function srNoText(layout: LogSheetLayout, index: number, recordDate: string): string {
  if (layout.srNoShowsDate) return index === 0 ? recordDate : "";
  // "1." where the paper prints its numbers with a full stop (part 4).
  return layout.srNoFullStop ? `${index + 1}.` : String(index + 1);
}

/**
 * THE CHOICES THE PAPER PRINTS ACROSS A BOX'S LINE (REQUIREMENTS §111, part 4): each option with the paper's
 * own word for it (F/QC/21 Flexo Ink's "Accepted"), and whether it is the one the record holds. Null for a
 * box that is not printed so — or whose words do not match its options one for one, which is then drawn as
 * the choice box it always was rather than a line that says something else.
 */
export function choiceWords(f: Pick<LogHeaderField, "type" | "options" | "choicesAcross">, value: string): { option: string; word: string; chosen: boolean }[] | null {
  const words = f.choicesAcross;
  const options = f.type === "yesno" ? ["Yes", "No"] : (f.options ?? []);
  if (!words || words.length === 0 || words.length !== options.length || (f.type !== "select" && f.type !== "yesno")) return null;
  return options.map((option, i) => ({ option, word: words[i], chosen: value !== "" && value === option }));
}

/** The heading the sheet draws over a column: the paper's own words where they differ from its name, "" for none (REQUIREMENTS §111). */
export const columnHeading = (c: Pick<LogColumn, "label" | "printedLabel">): string => c.printedLabel ?? c.label;

/** One group of boxes, above or below the grid, as the paper draws it. */
export interface BoxGroup {
  /** The boxes, each with its place among the area's boxes (the issued layout's box at the same place names it, §58). */
  boxes: { field: LogHeaderField; index: number }[];
  /** The boxes before any box that starts a group of its own: drawn as every sheet's boxes always were. */
  lead: boolean;
  /** The printed table just above the group (tableAbove), drawn open. */
  table?: ReferenceTable;
  /** The lines printed just above the group (printedAbove). */
  lines: string[];
  /** Boxes to a line; none: as many as the screen holds. */
  perLine?: number;
  /** The group's boxes are the cells of the paper's table (boxTable): its column and row headings. */
  boxTable?: NonNullable<LogHeaderField["boxTable"]>;
}

/** A box that starts a group of its own: it has words or a table printed above it, its own number of boxes to a line, or it opens the paper's table of boxes. */
export const startsBoxGroup = (f: Pick<LogHeaderField, "printedAbove" | "tableAbove" | "boxesPerLine" | "boxTable">): boolean =>
  (f.printedAbove?.length ?? 0) > 0 || !!f.tableAbove || f.boxesPerLine !== undefined || f.boxTable !== undefined;

/**
 * A BOX IN ITS COLUMN OF THE LINE (REQUIREMENTS §111): the attributes that put it there among boxes
 * standing a set number to a line (styles.css .sheet-boxes-paper [data-paper-column]); none for the rest.
 */
export function paperColumnProps(f: Pick<LogHeaderField, "paperColumn">): { "data-paper-column"?: string } {
  return f.paperColumn && f.paperColumn > 1 ? { "data-paper-column": String(f.paperColumn) } : {};
}

/** A group's box drawn as a cell of the paper's table (under the table's words, not its own label): every box of a boxTable group but a corner box. */
export const inBoxTable = (group: Pick<BoxGroup, "boxTable">, at: number): boolean => !!group.boxTable && !(group.boxTable.cornerBox && at === 0);

/** The rows of the paper's table of boxes (boxTable): the boxes a row at a time, a row's spare cells empty. */
export function boxTableRows<T>(table: NonNullable<LogHeaderField["boxTable"]>, boxes: T[]): (T | undefined)[][] {
  const across = Math.max(1, table.columns.length);
  const rows: (T | undefined)[][] = [];
  for (let at = 0; at < boxes.length; at += across) {
    rows.push(Array.from({ length: across }, (_, c) => boxes[at + c]));
  }
  return rows;
}

const groupsOf = { header: new WeakMap<LogSheetLayout, BoxGroup[]>(), footer: new WeakMap<LogSheetLayout, BoxGroup[]>() };

/**
 * THE BOXES IN THE PAPER'S GROUPS (REQUIREMENTS §93, §111). The boxes above the grid (`header`) or
 * below it (`footer`), cut at every box that starts a group of its own: F/MNT/08's hand-over under its
 * declaration, a certificate of analysis' LABEL STOCK three across, its COATING and FINISHING, its
 * TOLERANCE table and notes just above the retest date. The boxes before the first such box are the
 * lead group, drawn as they always were: above the grid as many to a line as the paper says
 * (headerColumns) or the screen holds, below it as the screen holds. A later group takes its first
 * box's boxesPerLine; without one, two to a line below the grid (the paper's two columns, F/MNT/08) and
 * as the lead group above it. A group whose first box opens the paper's table (boxTable) is drawn as
 * that table. Worked out once per layout.
 */
export function boxGroups(layout: LogSheetLayout, area: "header" | "footer"): BoxGroup[] {
  const hit = groupsOf[area].get(layout);
  if (hit) return hit;
  const fields = area === "header" ? layout.headerFields : (layout.footerFields ?? []);
  const groups: BoxGroup[] = [];
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index];
    let current = groups[groups.length - 1];
    if (!current || startsBoxGroup(field)) {
      const lead = !current && !startsBoxGroup(field);
      const table = field.tableAbove ? layout.referenceTables?.find((t) => t.title === field.tableAbove) : undefined;
      const perLine = lead ? (area === "header" ? layout.headerColumns : undefined) : (field.boxesPerLine ?? (area === "footer" ? 2 : layout.headerColumns));
      current = {
        boxes: [],
        lead,
        lines: lead ? [] : (field.printedAbove ?? []),
        ...(table ? { table } : {}),
        ...(perLine ? { perLine } : {}),
        ...(field.boxTable ? { boxTable: field.boxTable } : {}),
      };
      groups.push(current);
    }
    current.boxes.push({ field, index });
  }
  groupsOf[area].set(layout, groups);
  return groups;
}

/** One answer across the paper's columns (answerAcross), with its columns found in the layout. */
export interface AnswerAcross {
  /** The column of the one answer box. */
  answer: LogColumn;
  /** The columns it stands across, in the layout's order. */
  across: LogColumn[];
  /** The columns drawn before them on every line (F/QC/25's Sr.No. and its printed words). */
  lead: LogColumn[];
  /** The printed line the `across` columns' headings stand on. */
  headingLine: number;
  /** The printed lines written in the `across` columns. */
  lines: Set<number>;
}

const answerAcrossCache = new WeakMap<LogSheetLayout, AnswerAcross | null>();

/**
 * ONE ANSWER ACROSS THE PAPER'S COLUMNS (REQUIREMENTS §111, part 4), as the grid draws it — or null where the layout
 * says none, or names a column it does not have (a format edited since: drawn as every grid is, losing nothing).
 */
export function answerAcrossOf(layout: LogSheetLayout): AnswerAcross | null {
  const hit = answerAcrossCache.get(layout);
  if (hit !== undefined) return hit;
  let out: AnswerAcross | null = null;
  const spec = layout.answerAcross;
  if (spec && !layout.gridAcross && !layout.secondLine) {
    const answer = layout.columns.find((c) => c.key === spec.answer);
    const across = layout.columns.filter((c) => spec.across.includes(c.key));
    if (answer && across.length === spec.across.length && across.length > 0 && !spec.across.includes(spec.answer)) {
      const lead = layout.columns.filter((c) => c.key !== spec.answer && !spec.across.includes(c.key));
      out = { answer, across, lead, headingLine: spec.headingLine, lines: new Set(spec.lines) };
    }
  }
  answerAcrossCache.set(layout, out);
  return out;
}

/** The boxes above the grid that stand on its top line (inGridHead), each with its place among the boxes — where the grid has room for them (answerAcross). */
export function gridHeadBoxes(layout: LogSheetLayout): { field: LogHeaderField; index: number }[] {
  if (!answerAcrossOf(layout)) return [];
  return layout.headerFields.flatMap((field, index) => (field.inGridHead ? [{ field, index }] : []));
}

/** How many of the answers' columns each box on the grid's top line spans: the place shared out in order, the first ones taking any spare. */
export function gridHeadSpans(boxes: number, columns: number): number[] {
  if (boxes <= 0) return [];
  if (boxes >= columns) return [columns];
  const base = Math.floor(columns / boxes);
  return Array.from({ length: boxes }, (_, i) => base + (i < columns % boxes ? 1 : 0));
}

const besideGrid = new WeakMap<LogSheetLayout, BoxGroup[]>();

/** The groups of boxes above the grid as the record's sheet draws them: those on the grid's top line taken out (they are drawn there), a group left with nothing to draw dropped. */
export function boxGroupsBesideGrid(layout: LogSheetLayout): BoxGroup[] {
  const hit = besideGrid.get(layout);
  if (hit) return hit;
  // ...and those the paper writes inside its small tables' headings (F-QC-14's inspectors and FG code, panels).
  const inPanels = panelBoxes(layout).header;
  const inHead = new Set([...gridHeadBoxes(layout).map((b) => b.index), ...layout.headerFields.flatMap((f, i) => (inPanels.has(f.key) ? [i] : []))]);
  const groups = boxGroups(layout, "header");
  const out =
    inHead.size === 0
      ? groups
      : groups
          .map((g) => ({ ...g, boxes: g.boxes.filter((b) => !inHead.has(b.index)) }))
          .filter((g) => g.boxes.length > 0 || g.lines.length > 0 || g.table !== undefined);
  besideGrid.set(layout, out);
  return out;
}

/** The titles of the printed tables drawn in their own place among the boxes (tableAbove), not behind "Show" above the sheet. */
export function placedTables(layout: LogSheetLayout): Set<string> {
  const out = new Set<string>();
  for (const f of [...layout.headerFields, ...(layout.footerFields ?? [])]) {
    if (f.tableAbove && layout.referenceTables?.some((t) => t.title === f.tableAbove)) out.add(f.tableAbove);
  }
  return out;
}

// ---------------------------------------------------------------------------
// FROM THE REVIEW OF 13-OCT-2026 (REQUIREMENTS §111): what the papers of group B do that a layout could not say.
//
//   one cell down a run of lines     LogColumn.merged — the Gujarati line clearance's process and its two
//                                    signatures once per process, F/QC/13's one પાસ? (mergedRuns,
//                                    withMergedRuns).
//   a blank line between the runs    LogSheetLayout.gapBetweenRuns — between the Gujarati line clearance's
//                                    processes (runStarts).
//   the paper's small tables         LogSheetLayout.panels — F-QC-14's checks, two to a row (panelsOf,
//                                    panelBoxes, footerGroupsBesideGrid).

/** What a line holds in a column, or — on a form that prints its lines — what the form prints there (a record written before the column was printed). */
function lineValue(layout: LogSheetLayout, rows: readonly Record<string, unknown>[], i: number, key: string): string {
  const held = rows[i]?.[key];
  if (held !== undefined && held !== null && held !== "") return String(held);
  const fixed = layout.rowMode.kind === "fixedRows" ? layout.rowMode.rows[i]?.[key] : undefined;
  return fixed === undefined || fixed === null ? "" : String(fixed);
}

/** The runs of lines whose `by` column holds the same words, as [first, length] — the whole sheet where there is no `by`. */
function runsOf(layout: LogSheetLayout, rows: readonly Record<string, unknown>[], by: string | undefined): [number, number][] {
  const runs: [number, number][] = [];
  for (let i = 0; i < rows.length; i++) {
    const last = runs[runs.length - 1];
    if (last && (by === undefined || lineValue(layout, rows, i, by) === lineValue(layout, rows, last[0], by))) last[1]++;
    else runs.push([i, 1]);
  }
  return runs;
}

/** The merged columns of a layout. */
export const mergedColumns = (layout: LogSheetLayout): LogColumn[] => layout.columns.filter((c) => c.merged !== undefined);

/**
 * ONE CELL DOWN A RUN OF LINES (LogColumn.merged): for each merged column, each line's span — on a run's first line
 * the number of lines its one cell runs down, 0 on the lines that cell covers. Empty for a layout with none.
 */
export function mergedRuns(layout: LogSheetLayout, rows: readonly Record<string, unknown>[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const c of mergedColumns(layout)) {
    const spans = new Array<number>(rows.length).fill(0);
    for (const [first, length] of runsOf(layout, rows, c.merged?.by)) spans[first] = length;
    out.set(c.key, spans);
  }
  return out;
}

/**
 * The lines with every merged column holding its run's value on the run's first line and nothing on the others (a
 * "No" anywhere in a yes/no run is the run's "No"; otherwise the first value written) — the same array when nothing
 * changes. Demo Mode's and the sample fill's lines are written once per line and are brought to the paper's one cell here.
 */
export function withMergedRuns<R extends Record<string, string | number | null>>(layout: LogSheetLayout, rows: R[]): R[] {
  // A printed column (the Gujarati line clearance's process) keeps its words on every line: only its drawing is one cell.
  const merged = mergedColumns(layout).filter((c) => !c.fixed);
  if (merged.length === 0 || rows.length === 0) return rows;
  let out: R[] | null = null;
  for (const c of merged) {
    const blank = c.type === "number" ? null : "";
    for (const [first, length] of runsOf(layout, rows, c.merged?.by)) {
      const values = rows.slice(first, first + length).map((r) => r[c.key]).filter((v) => v !== null && v !== undefined && v !== "");
      const value = c.type === "yesno" && values.includes("No") ? "No" : (values[0] ?? blank);
      for (let i = first; i < first + length; i++) {
        const want = i === first ? value : blank;
        if ((rows[i][c.key] ?? blank) === want) continue;
        out = out ?? rows.slice();
        out[i] = { ...(out[i] as R), [c.key]: want };
      }
    }
  }
  return out ?? rows;
}

/** The lines a new run of the `gapBetweenRuns` column starts on (never the first): the paper leaves a blank line above each. */
export function runStarts(layout: LogSheetLayout, rows: readonly Record<string, unknown>[]): Set<number> {
  if (!layout.gapBetweenRuns) return new Set();
  return new Set(
    runsOf(layout, rows, layout.gapBetweenRuns)
      .map(([first]) => first)
      .filter((i) => i > 0)
  );
}

/** One of the paper's small tables (LogSheetLayout.panels). */
export interface PanelTable {
  /** Its place among the tables, from 0. */
  index: number;
  /** The record's first line it holds. */
  first: number;
  /** How many lines it holds. */
  length: number;
  /** The words over its readings (the check and its specification), from its first line's printed heading cell. */
  heading: string;
  /** Its first column's heading, "{key}" standing for a box above the grid. */
  firstHeading: string;
  /** The box below the grid printed under its lines. */
  footer?: LogHeaderField;
}

export interface Panels {
  tables: PanelTable[];
  /** The columns each table draws, in order: every column but the one whose words head the tables. */
  columns: LogColumn[];
  perRow: number;
  namesUnder: Record<string, string>;
  footerLabel: string;
}

const panelsCache = new WeakMap<LogSheetLayout, Panels | null>();

/**
 * THE PAPER'S SMALL TABLES (LogSheetLayout.panels), as the sheet draws them — or null where the layout says none, or
 * says them of a grid it cannot cut so (a format edited since: drawn as every grid is, losing nothing).
 */
export function panelsOf(layout: LogSheetLayout): Panels | null {
  const hit = panelsCache.get(layout);
  if (hit !== undefined) return hit;
  let out: Panels | null = null;
  const spec = layout.panels;
  const mode = layout.rowMode;
  // The tables need the column that heads them and at least one more to draw.
  if (
    spec &&
    mode.kind === "fixedRows" &&
    spec.lines > 0 &&
    !layout.gridAcross &&
    !layout.answerAcross &&
    !layout.secondLine &&
    layout.columns.some((c) => c.key === spec.headingColumn) &&
    layout.columns.length > 1
  ) {
    const count = Math.ceil(mode.rows.length / spec.lines);
    const footers = layout.footerFields ?? [];
    const tables: PanelTable[] = Array.from({ length: count }, (_, index) => {
      const first = index * spec.lines;
      const footer = footers.find((f) => f.key === spec.footers?.[index]);
      return {
        index,
        first,
        length: Math.min(spec.lines, mode.rows.length - first),
        heading: String(mode.rows[first]?.[spec.headingColumn] ?? ""),
        firstHeading: spec.firstHeadings[index] ?? "",
        ...(footer ? { footer } : {}),
      };
    });
    out = {
      tables,
      columns: layout.columns.filter((c) => c.key !== spec.headingColumn),
      perRow: Math.max(1, spec.perRow),
      namesUnder: spec.namesUnder ?? {},
      footerLabel: spec.footerLabel ?? "",
    };
  }
  panelsCache.set(layout, out);
  return out;
}

/** The "{key}" boxes a heading is written with: its words and the boxes between them, in order. */
export function headingParts(words: string): ({ text: string } | { box: string })[] {
  const parts: ({ text: string } | { box: string })[] = [];
  let at = 0;
  for (const m of words.matchAll(/\{([A-Za-z0-9_]+)\}/g)) {
    if ((m.index ?? 0) > at) parts.push({ text: words.slice(at, m.index) });
    parts.push({ box: m[1] });
    at = (m.index ?? 0) + m[0].length;
  }
  if (at < words.length) parts.push({ text: words.slice(at) });
  return parts;
}

const panelBoxesCache = new WeakMap<LogSheetLayout, { header: Set<string>; footer: Set<string> }>();

/** The boxes the paper writes inside its small tables — above the grid (the inspectors' names, the FG code) and below it (each Conclusion) — and so not drawn among the other boxes. */
export function panelBoxes(layout: LogSheetLayout): { header: Set<string>; footer: Set<string> } {
  const hit = panelBoxesCache.get(layout);
  if (hit) return hit;
  const panels = panelsOf(layout);
  const header = new Set<string>();
  const footer = new Set<string>();
  if (panels) {
    const headerKeys = new Set(layout.headerFields.map((f) => f.key));
    for (const t of panels.tables) {
      for (const p of headingParts(t.firstHeading)) if ("box" in p && headerKeys.has(p.box)) header.add(p.box);
      if (t.footer) footer.add(t.footer.key);
    }
    for (const key of Object.values(panels.namesUnder)) if (headerKeys.has(key)) header.add(key);
  }
  const out = { header, footer };
  panelBoxesCache.set(layout, out);
  return out;
}

const footerBeside = new WeakMap<LogSheetLayout, BoxGroup[]>();

/** The groups of boxes below the grid as the record's sheet draws them: those the paper prints inside its small tables taken out, a group left with nothing to draw dropped. */
export function footerGroupsBesideGrid(layout: LogSheetLayout): BoxGroup[] {
  const hit = footerBeside.get(layout);
  if (hit) return hit;
  const inPanels = panelBoxes(layout).footer;
  const groups = boxGroups(layout, "footer");
  const out =
    inPanels.size === 0
      ? groups
      : groups
          .map((g) => ({ ...g, boxes: g.boxes.filter((b) => !inPanels.has(b.field.key)) }))
          .filter((g) => g.boxes.length > 0 || g.lines.length > 0 || g.table !== undefined);
  footerBeside.set(layout, out);
  return out;
}
