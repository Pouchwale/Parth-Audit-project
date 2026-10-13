import type { LogColumn, LogHeaderField, LogSheetData, LogSheetLayout } from "../types";
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
