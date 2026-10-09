// WHETHER A FORM NUMBERS ITS OWN LINES (REQUIREMENTS §102, engine/lineNumbers.ts).
import type { LogSheetLayout } from "../types";
import { getIssuedLogSheetLayout } from "../data/seed/logSheetLayouts";
import { withoutLineNumber } from "./lineNumbers";

/** Whether the form numbers its own lines; the issued layout is asked too, so a format the plant edited before §102 keeps it. */
export function numbersOwnLines(layout: LogSheetLayout): boolean {
  return layout.ownLineNumbers === true || getIssuedLogSheetLayout(layout.documentId)?.ownLineNumbers === true;
}

/** A sheet's lines with each printed cell's own number taken off (the same lines when nothing changes), for a reader such as Mitra. */
export function printedWordsOnce<R extends Record<string, unknown>>(rows: readonly R[], layout: LogSheetLayout): readonly R[] {
  if (numbersOwnLines(layout)) return rows;
  const fixed = layout.columns.filter((c) => c.fixed).map((c) => c.key);
  if (fixed.length === 0) return rows;
  let changed = false;
  const out = rows.map((row, i) => {
    let line: R | null = null;
    for (const key of fixed) {
      const v = row[key];
      if (typeof v !== "string") continue;
      const once = withoutLineNumber(v, i + 1);
      if (once === v) continue;
      line = line ?? { ...row };
      (line as Record<string, unknown>)[key] = once;
    }
    if (line) changed = true;
    return line ?? row;
  });
  return changed ? out : rows;
}
