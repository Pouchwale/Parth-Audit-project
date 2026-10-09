// WHETHER A FORM NUMBERS ITS OWN LINES (REQUIREMENTS §102, engine/lineNumbers.ts).
import type { LogSheetLayout } from "../types";
import { getIssuedLogSheetLayout } from "../data/seed/logSheetLayouts";

/** Whether the form numbers its own lines; the issued layout is asked too, so a format the plant edited before §102 keeps it. */
export function numbersOwnLines(layout: LogSheetLayout): boolean {
  return layout.ownLineNumbers === true || getIssuedLogSheetLayout(layout.documentId)?.ownLineNumbers === true;
}
