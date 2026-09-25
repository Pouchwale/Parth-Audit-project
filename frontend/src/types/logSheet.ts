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
  // THE SUGGESTION LIST THIS BOX OFFERS, by the id of a <datalist> on the page —
  // "equipment-machines" on a Machine No. box (REQUIREMENTS §74). Without it a
  // box whose label names a person offers the employee names, and any other box
  // offers nothing.
  list?: string;
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
  /**
   * Worked out from the other cells, never typed — shown as text and not asked
   * for (REQUIREMENTS §61). Never required either: validation skips it, because
   * a blank one means the cells it is worked out from are not all written yet,
   * and it is those the person is asked for (engine/computedCells.ts, §74).
   */
  computed?: boolean;
  // Acceptance band for numeric columns. Values outside are highlighted (not
  // blocked — the paper form has no such gate either; a remark is expected).
  nominal?: number;
  min?: number;
  max?: number;
  decimals?: number;
  /** As on a header box: the id of the <datalist> this column's cells offer (REQUIREMENTS §74). */
  list?: string;
  /**
   * A cell that holds SEVERAL LINES — a bulleted observation, a requirement's
   * full text (REQUIREMENTS §76). It is written in a box that keeps its line
   * breaks and grows with what it holds; a one-line box would join the lines
   * the moment somebody typed into it.
   */
  multiline?: boolean;
  // Auto-fill behaviour for this column. Precedence in engine/autoFill.ts:
  //   dueDate → sign → nominal (random reading inside the band) → carryForward
  //   (copy the template value exactly) → jitter (template value ± jitter%) →
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
    // A date column that answers with the date the record is for, on every
    // line — F/MNT/11's "Date of Measurement", where the whole round is walked
    // on one day (REQUIREMENTS §74). Copying the previous sheet's date instead
    // would put last year's date on this year's readings.
    dueDate?: boolean;
    // A JUDGEMENT MADE AFRESH EACH TIME — an audit's Compliance / NC, a
    // verification's C / NC, an assessment's observation, a month's actual
    // (REQUIREMENTS §76). It is never copied from the last sheet or from the
    // specimen: carried forward, the assistant would write last year's audit
    // findings into an audit that has not happened yet. Left for the person.
    fresh?: boolean;
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
  //
  // A page can carry a caption of its own — { src, caption } — where the pages
  // are not simply page 1, 2, 3 of one issue: Maintenance's F/MNT/02 and
  // F/MNT/11 were supplied at their current AND their superseded revision, and
  // a filled page beside a blank one (REQUIREMENTS §74), and a picture that
  // does not say which it is would invite the two to be confused.
  originalPages?: (string | { src: string; caption: string })[];
  // THE REVISIONS THIS FORMAT REPLACED, by revision number, each with the layout
  // it was printed with (REQUIREMENTS §74). A record filled on a superseded
  // revision says so (RecordInstance.formatRevision) and is drawn, checked and
  // headed with THAT revision's layout: F/MNT/11's 2024 lux readings were taken
  // on Rev 00, which had Day and Night columns and 19 areas, and redrawing them
  // on Rev 01's single column and 26 areas would hide half of what was written
  // and label it with a revision it was never on. Only the current revision is
  // ever filled in, so nothing here is scheduled, carried forward or corrected.
  supersededRevisions?: Record<string, SupersededRevision>;
  // "Typical" example rows taken from the filled specimen, used by the
  // assistant when there is no previous record to carry forward from.
  specimenRows?: Record<string, string | number | null>[];
  specimenHeader?: Record<string, string>;
  // Which source file the specimen values came from (shown for traceability).
  specimenSource: string;
}

/** One revision a format has replaced: when it was issued, how it was printed, and why it matters. */
export interface SupersededRevision {
  /** ISO date the superseded revision was issued, as its own header printed it. */
  revisionDate: string;
  /** The grid and boxes as that revision printed them. */
  layout: LogSheetLayout;
  /** A plain-English line on what changed, shown beside a record filled on it. */
  note?: string;
}
