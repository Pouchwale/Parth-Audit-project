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
  return String(index + 1);
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

/** The titles of the printed tables drawn in their own place among the boxes (tableAbove), not behind "Show" above the sheet. */
export function placedTables(layout: LogSheetLayout): Set<string> {
  const out = new Set<string>();
  for (const f of [...layout.headerFields, ...(layout.footerFields ?? [])]) {
    if (f.tableAbove && layout.referenceTables?.some((t) => t.title === f.tableAbove)) out.add(f.tableAbove);
  }
  return out;
}
