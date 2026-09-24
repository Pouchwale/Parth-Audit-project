// Layout description for the generic "log-sheet" document kind. A layout is
// pure configuration: which header fields sit above the grid, which columns
// the grid has, how rows are created (free-form vs. one row per fixed time
// slot vs. a single row), and — for the assistant's auto-fill — what a
// "typical" value looks like (nominal value + tolerance, carried-forward
// header fields, etc.). Nothing here is persisted: layouts are looked up by
// DocumentDefinition.id from src/data/seed/logSheetLayouts.ts at render time.

// "paragraph" is a box the form prints for a BLOCK OF PROSE, not a line: the
// Supplier Registration Form's RANGE OF PRODUCTS / SERVICES OFFERED and LIST OF
// MAJOR CUSTOMERS, the Supplier Audit Report's COMMENTS and its eight SUMMARY
// OF OBSERVATIONS prompts (REQUIREMENTS §68). It belongs among the boxes above
// or below the grid — a paragraph is never a column, because a grid cell is a
// line and the paper draws these as areas the width of the page.
export type LogFieldType = "text" | "number" | "time" | "date" | "select" | "yesno" | "paragraph";

export interface LogHeaderField {
  key: string;
  label: string; // verbatim label from the paper form
  type: LogFieldType;
  options?: string[]; // for "select"
  required?: boolean;
  // Auto-fill behaviour: carry the previous record's value forward (the
  // usual case for operator / machine / batch numbers), use a fixed default,
  // resolve a signature field to the responsible employee, or — for a date box
  // such as "Date of Inspection" — answer it with the date the record is for.
  autoFill?: { carryForward?: boolean; default?: string; sign?: boolean; dueDate?: boolean };
  width?: number;
}

export interface LogColumn {
  key: string;
  label: string; // verbatim column heading
  type: LogFieldType;
  unit?: string; // e.g. "kg", "Sec.", "°C"
  options?: string[];
  required?: boolean;
  width?: number;
  // The heading the paper draws ABOVE this column and its neighbours, spanning
  // them all — the four "METHOD OF APPROVAL" columns of the List of Approved
  // Suppliers (REQUIREMENTS §68). Columns carrying the same group name must sit
  // next to each other, and the grid then draws a second heading row for them;
  // a column with no group spans both rows, as it does on the paper.
  group?: string;
  // Read-only, pre-filled column (e.g. the fixed hourly time slot).
  fixed?: boolean;
  /** Worked out from the other cells, never typed — shown as text and not asked for (REQUIREMENTS §61). */
  computed?: boolean;
  // Acceptance band for numeric columns. Values outside are highlighted (not
  // blocked — the paper form has no such gate either; a remark is expected).
  nominal?: number;
  min?: number;
  max?: number;
  decimals?: number;
  // Auto-fill behaviour for this column. Precedence in engine/autoFill.ts:
  //   sign → nominal (random reading inside the band) → carryForward (copy
  //   the template value exactly) → jitter (template value ± jitter%) →
  //   template value as-is → default.
  // Rule of thumb: measured READINGS get a `nominal` (they genuinely vary);
  // machine SET-POINTS and weighed set quantities get `carryForward` (they
  // repeat verbatim from the previous sheet); actual weights / meters get a
  // small `jitter`.
  autoFill?: {
    // A "signature" column: fill with the name of the responsible employee
    // (resolved via documentRoleKeywords) — or, for time-slot layouts, the
    // day/night tester if `byShift` is set.
    sign?: boolean;
    byShift?: { day: string; night: string };
    // Copy the previous record's / specimen's value for the same row
    // position exactly (set-points, codes, fixed quantities).
    carryForward?: boolean;
    // Vary the template's numeric value by ± this fraction (e.g. 0.03).
    jitter?: number;
    // Fixed default value.
    default?: string | number;
    // A "clock time" column filled with the current/typical time.
    nowTime?: boolean;
  };
}

export type LogRowMode =
  // Rows added freely by the user (one per batch / job / entry).
  | { kind: "free"; minRows?: number; typicalRows?: number }
  // One fixed row per time slot, in order (e.g. hourly viscosity readings).
  | { kind: "timeSlots"; slots: string[]; slotKey: string }
  // Exactly one row (e.g. the Temperature Monitoring Record: one line per
  // day with six time-of-day readings as columns).
  | { kind: "single" }
  // A fixed list of rows printed on the form (e.g. an inspection record's
  // test parameters), each carrying constant values for the `fixed`
  // columns (parameter name, specification) — the user only fills the rest.
  | { kind: "fixedRows"; rows: Record<string, string | number | null>[] };

export interface ReferenceTable {
  title: string;
  columns: string[];
  rows: string[][];
}

export interface LogSheetLayout {
  documentId: string;
  // Text printed on the form above the grid (instructions, recommended
  // values, ALC protocol, ...), verbatim.
  instructions?: string[];
  headerFields: LogHeaderField[];
  columns: LogColumn[];
  rowMode: LogRowMode;
  // Fields printed BELOW the grid (lot status, reason for deviation,
  // inspected-by ...). Stored in LogSheetData.header alongside headerFields.
  footerFields?: LogHeaderField[];
  // Reference material printed on the form (e.g. F/QC/13's grade chart) —
  // shown collapsed, never filled in.
  referenceTables?: ReferenceTable[];
  // THE SUPPLIED ORIGINAL, shown unaltered beside the form (REQUIREMENTS §71) —
  // paths under frontend/public, one per printed page or, for F/STR/01, the
  // photograph of the rubber stamp itself. A form that was supplied as a
  // picture rather than as a document is only honestly reproduced if the
  // picture can be put next to it, so the two can be compared. Where a layout
  // sets nothing here the document page shows no such button at all.
  originalPages?: string[];
  // "Typical" example rows taken from the filled specimen, used by the
  // assistant when there is no previous record to carry forward from.
  specimenRows?: Record<string, string | number | null>[];
  specimenHeader?: Record<string, string>;
  // Which source file the specimen values came from (shown for traceability).
  specimenSource: string;
}
