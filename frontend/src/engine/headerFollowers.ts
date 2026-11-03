import type { LogSheetData, LogSheetLayout, LogSheetRow } from "../types";

// A COLUMN THAT FOLLOWS A HEADER BOX (REQUIREMENTS §159; the owner, 2-Nov-2026):
// "in HR 05 the planned date is filled according to date of joining of the
// user which user will select." The induction record's Planned Date on every
// topic line is the new employee's Date of Joining — the day the induction is
// planned for — so when that box is chosen (typed, fetched from HR Master
// Data, or written by Mitra) every line's Planned Date takes it.
//
// A column says which box it follows with autoFill.fromHeader (types/logSheet.ts).
// The rule is the same wherever a record is saved:
//   - a line's cell that is blank takes the box's value;
//   - a cell that still holds the box's PREVIOUS value moves with it (the joining
//     date corrected from the 5th to the 7th moves every planned date that was
//     the 5th), and is cleared when the box is cleared;
//   - a cell the person wrote differently is theirs, and is left alone.
// Nothing is written when the box is blank and the cell did not follow it.

const text = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());

/** The columns of this layout that follow a header box, with the box each follows. */
export function headerFollowers(layout: LogSheetLayout): { key: string; from: string }[] {
  return layout.columns.flatMap((c) => (c.autoFill?.fromHeader && !c.fixed && !c.computed && !c.linkedFrom ? [{ key: c.key, from: c.autoFill.fromHeader }] : []));
}

/**
 * `next` with every following column's cells brought in line with its header box, given the record as it was
 * before the change (`before`; absent for a record just made). The data is returned as it came when there is
 * nothing to change.
 */
export function followHeader(layout: LogSheetLayout, before: LogSheetData | undefined, next: LogSheetData): LogSheetData {
  const followers = headerFollowers(layout);
  if (followers.length === 0 || !Array.isArray(next.rows)) return next;
  let changed = false;
  const rows: LogSheetRow[] = next.rows.map((row) => {
    let out = row;
    for (const { key, from } of followers) {
      const now = text(next.header?.[from]);
      const was = text(before?.header?.[from]);
      const cell = text(row[key]);
      const follows = cell === "" || (was !== "" && cell === was);
      if (!follows || cell === now) continue;
      if (now === "" && cell === "") continue;
      if (out === row) out = { ...row };
      out[key] = now;
      changed = true;
    }
    return out;
  });
  return changed ? { ...next, rows } : next;
}
