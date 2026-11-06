import type { LogSheetRow } from "../types";

// A WORKED-OUT CELL A PERSON TYPED OVER (REQUIREMENTS §188; the owner, 6-Nov-2026: "make sure each and every part of this
// purchase module and all the documents in it are completely editable"). A column the format marks `typable` is worked
// out as before (F/PUR/05's weightages, Overall Rating and Grade; F/PUR/06's Overall Rating), and a person may type over
// it on the record: the typed figure stands, marked, until the cell is emptied, when it is worked out again. The record
// remembers which of a line's cells were typed over under one key of the line, never a column of the sheet.

/** The line's key that names its typed-over cells, comma-separated. */
export const TYPED_CELLS = "typedCells";

/** The keys of the cells typed over on this line. */
export const typedKeys = (row: Partial<LogSheetRow> | null | undefined): string[] =>
  String(row?.[TYPED_CELLS] ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

/** Is this cell of the line typed over? */
export const isTyped = (row: Partial<LogSheetRow> | null | undefined, key: string): boolean => typedKeys(row).includes(key);

/** The line with a worked-out cell typed over — or, the cell emptied, given back to the working-out. */
export function typedOver(row: LogSheetRow, key: string, value: string | number | null): LogSheetRow {
  const blank = value === null || String(value).trim() === "";
  const keys = typedKeys(row).filter((k) => k !== key);
  if (!blank) keys.push(key);
  const next: LogSheetRow = { ...row, [key]: blank ? "" : value };
  if (keys.length > 0) next[TYPED_CELLS] = keys.join(",");
  else delete next[TYPED_CELLS];
  return next;
}
