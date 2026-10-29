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
  // `newest`: a CALIBRATION CERTIFICATE'S DATE (the owner, 27-Oct-2026: F/QC/11 and F/QC/12 calibrated 21-09-26, due
  // 20-09-27; F/QC/17's ruler 23-09-26, due 22-09-27): a standing box that starts as `default`, editable, and a new
  // sheet keeps the LATER of the last sheet's date and that one - a certificate's dates only move forward, so an
  // older date carried from 2024 never comes back, and a newer one somebody writes is kept (engine/carryForward.ts).
  autoFill?: { carryForward?: boolean; default?: string; sign?: boolean; dueDate?: boolean; newest?: boolean };
  width?: number;
  /**
   * A box WORKED OUT from what is written on the sheet, never typed — F/MKT/02's
   * Average Rating, Ideal Rating and % Satisfaction Index (REQUIREMENTS §77),
   * as a computed column is for a cell (engine/computedCells.ts). Shown as
   * text, skipped by validation and by the assistant's fill.
   */
  computed?: boolean;
  // THE SUGGESTION LIST THIS BOX OFFERS, by the id of a <datalist> on the page —
  // "equipment-machines" on a Machine No. box (REQUIREMENTS §74). Without it a
  // box whose label names a person offers the employee names, and any other box
  // offers nothing.
  list?: string;
  /**
   * THE WORDS THE PAPER PRINTS BESIDE THE BOX, where its name (`label`, which
   * the record's history, Mitra and the checks go by) has to say more to tell
   * it apart: F/MNT/08 prints "Date:" beside each of its three heads, and
   * "Date:" alone would not say whose date a history line changed
   * (REQUIREMENTS §93). The sheet shows these words; everything else, the name.
   */
  printedLabel?: string;
  /**
   * Lines the paper prints across the sheet just above this box — F/MNT/08's
   * declaration and its "Hand over & Take over Protocol" heading below the grid
   * (REQUIREMENTS §93), a certificate of analysis' LABEL STOCK above it and its
   * COATING and FINISHING below it (§111) — and the boxes from this one on, to
   * the next box that starts a group of its own, are drawn under them: below the
   * grid in the paper's two columns, a head beside its date, unless
   * `boxesPerLine` says otherwise; above it as the other boxes above it are.
   */
  printedAbove?: string[];
  /**
   * THE TABLE THE PAPER PRINTS JUST ABOVE THIS BOX (REQUIREMENTS §111): the
   * title of one of the layout's `referenceTables` — the certificates of
   * analysis print their TOLERANCE between the FINISHING boxes and the notes —
   * drawn open in that place, on the sheet and in its print, not behind "Show"
   * above the sheet. The box starts a group of its own, as with printedAbove.
   */
  tableAbove?: string;
  /**
   * HOW MANY BOXES THE PAPER PUTS ON ONE LINE from this box on, to the next box
   * that starts a group of its own (REQUIREMENTS §111): F/QC/06's LABEL STOCK
   * is three across (Face Material, Adhesive, Release Liner), an inspection
   * record's lot status takes a line of its own and its two signatures stand
   * side by side. The box starts a group of its own.
   */
  boxesPerLine?: number;
  /**
   * THE COLUMN OF ITS LINE THE BOX STANDS IN, counted from 1, where the paper
   * leaves the cells before it empty (REQUIREMENTS §111): an incoming material
   * record prints Date of Inspection in the right-hand column of its header
   * box's fourth line, F/QC/25 its "Date:" at the right above the grid. Honoured
   * where the boxes stand a set number to a line (headerColumns, boxesPerLine);
   * a phone takes them one under another.
   */
  paperColumn?: number;
  /**
   * THE BOXES DRAWN AS THE PAPER'S TABLE (REQUIREMENTS §111): from this box on,
   * to the next box that starts a group of its own, the boxes are the cells of
   * a table, a row at a time, `columns` printed over them, each row's heading
   * (`rows`) printed at its left and `corner` above those. F/QC/06 prints its
   * LABEL STOCK as "Material" over Face Material / Adhesive / Release Liner on
   * Required, Tested, Type Required and Observed. A box's label stays its name
   * (Mitra, a record's history, the checks, a downloaded file); the table's
   * words are what the sheet and its print show. The box starts a group of its
   * own. With `cornerBox` the group's first box stands in the corner, under its
   * own label, and the table's cells are the boxes after it: F/QC/06 prints
   * "Coating Done : Gloss UV" over the Minimum Gloss line's row headings.
   */
  boxTable?: { corner?: string; cornerBox?: true; columns: string[]; rows: string[] };
  /**
   * THE VALUE THE PAPER PRINTS IN THE BOX (REQUIREMENTS §111): F/QC/11 prints
   * "1-54, 2-55, 3-56, 4-57" in its Device ID No box, "LAB" in Location and
   * Department, "Global Eng. Co. (GEC)" in Manufacturer. Such a box is shown as
   * text and never typed into: a new record is written with it, every record
   * shows it (engine/computedCells.ts writes it on the way in and out), an
   * upload cannot change it, Mitra and the phone are told it is printed and
   * never write it, and nobody is asked for it.
   */
  printed?: string;
  /**
   * THE CHOICES THE PAPER PRINTS ACROSS THE BOX'S LINE, in the order of `options`, for the one that holds
   * to be marked (REQUIREMENTS §111, part 4): an incoming material record prints "LOT STATUS ⇒ ACCEPTED |
   * REJECT & SEND BACK TO SUPPLIER / SCRAP | SEGREGATION | ACCEPTED ON DEVIATION" and the inspector marks
   * one. Each is the paper's own word for the option at its place — F/QC/21 Flexo Ink prints "Accepted" —
   * while the record keeps the option itself. The sheet signed off and every print show the words across
   * with the chosen one marked; open for writing, the box is the choice box it always was.
   */
  choicesAcross?: string[];
  /**
   * THE WORDS THE PAPER PRINTS UNDER THE BOX (REQUIREMENTS §111, part 4): an incoming record heads its
   * signature box "INSPECTED BY" and prints "QA INSPECTOR" under the space it is signed in; F/QC/25 prints
   * "(QA Inspector)" under "Testing By". The box's name stays what it was.
   */
  printedBelow?: string;
  /**
   * THE VALUE WRITTEN INSIDE THE PAPER'S SENTENCE (REQUIREMENTS §111, part 4): a certificate of analysis
   * prints "This material should be retested on 03/07/2022 before usage." — the words before the box, the
   * box, the words after it, on one line.
   */
  inSentence?: { before: string; after: string };
  /**
   * THE BOX STANDS ON THE GRID'S TOP LINE (REQUIREMENTS §111, part 4): F/QC/25 prints "OID :-" and "Job Code:" in the
   * heading line of its table, over the answers. Honoured where the layout draws one answer across the paper's columns
   * (`answerAcross`): the boxes share that line's place over the answers, in their order. Elsewhere, among the boxes.
   */
  inGridHead?: true;
  /**
   * THE PAPER'S HEADING, WRITTEN BY THE PERSON (REQUIREMENTS §111, the review of 13-Oct-2026): F/QC/29's analysis
   * report prints "PSL Analysis Report" centred over its table, in bold, with no label beside it; another analysis
   * is headed with its own words. The box takes a line of its own and is drawn as that heading. Its label is its
   * name (Mitra, a record's history, a downloaded file) and is not printed.
   */
  asHeading?: true;
  /**
   * THE BOX IS JUDGED AGAINST ANOTHER BY THE PAPER'S TOLERANCE (REQUIREMENTS §111, rule 2): a certificate of
   * analysis prints its TOLERANCE table — Length + 2 mm / - 2 mm, Face Material ± 10 % — and its Tested Size
   * Length outside the Client's Specified Size Length by more than that is highlighted. `of`: the box holding the
   * figure it is judged against; `plus` and `minus`: the table's figures, in the box's unit or, with `percent`, a
   * percentage of that figure (engine/printedBands.ts). Nothing is judged where either box is not a plain figure.
   */
  within?: { of: string; plus: number; minus: number; percent?: true };
}

export interface LogColumn {
  key: string;
  label: string; // verbatim column heading
  /**
   * THE HEADING THE PAPER PRINTS OVER THE COLUMN, where its name (`label`, which
   * a record's history, Mitra and the checks go by) has to say what the paper
   * leaves unsaid (REQUIREMENTS §111): F/QC/25 prints no heading over its
   * descriptions or its observations, the tolerance card none over its panels'
   * headings, so "" draws the heading empty. The sheet and its print show these
   * words; everything else, the name.
   */
  printedLabel?: string;
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
  /**
   * THE GROUP'S HEADING IN A CELL OF ITS OWN over this column, beside a column of the same group (REQUIREMENTS §111,
   * the review of 13-Oct-2026): F/QC/29's utility test prints "Observation (24Hrs.)" over Freeze, again over
   * Desiccator and again over Oven — three cells, not one across the three.
   */
  groupApart?: true;
  /**
   * ONE CELL DOWN A RUN OF LINES (REQUIREMENTS §111, the review of 13-Oct-2026): the paper merges this column's cell
   * down the lines that print the same words in the column `by` names — the Gujarati line clearance prints each
   * process once beside its lines, and its operator's and QA's signatures once for the process — or down every line,
   * with no `by` (F/QC/13's one "પાસ?" beside its six parameters). The value is the run's first line's: drawn there,
   * across the run; the run's other lines hold nothing in it (engine/paperLayout.ts mergedRuns).
   */
  merged?: { by?: string };
  // Read-only, pre-filled column (e.g. the fixed hourly time slot).
  fixed?: boolean;
  /**
   * Worked out from the other cells, never typed — shown as text and not asked
   * for (REQUIREMENTS §61). Never required either: validation skips it, because
   * a blank one means the cells it is worked out from are not all written yet,
   * and it is those the person is asked for (engine/computedCells.ts, §74).
   */
  computed?: boolean;
  /**
   * READ LIVE FROM ANOTHER DOCUMENT, never stored on this one (REQUIREMENTS §82):
   * the id of the document whose records fill this column when the sheet is shown
   * — F/MNT/03's Actual dates come from F/MNT/02 (engine/pmSchedule.ts). Always
   * `computed` as well, so nothing types, fills, uploads or validates it.
   */
  linkedFrom?: string;
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
  /**
   * DRAWN ON THE ENTRY'S SECOND LINE, UNDER THE COLUMN THIS NAMES (REQUIREMENTS
   * §111): F/QC/12 gives every calibration two lines, the second headed
   * "Deviation %" (the layout's `secondLine`), with each weight's Deviation %
   * under its Tested Value. The column has no heading of its own and the line's
   * data stays one object; only the drawing (the sheet, its print, the Excel and
   * Word files made from it, the format's designer) puts it below.
   */
  beneath?: string;
  /**
   * THE BAND IS THE TOLERANCE WRITTEN IN A BOX ABOVE THE GRID (REQUIREMENTS §111, rule 2): F/QC/12 prints
   * "Acceptable Tolerance:" among its boxes, and each Deviation % ("0.02%") outside ± that figure ("0.05 %")
   * is highlighted as a reading outside its printed band is. The key of that box; the band is read from what
   * the record holds there, so a sheet with no tolerance written highlights nothing (engine/printedBands.ts).
   */
  toleranceFrom?: string;
  /**
   * THE STANDARD THE PLANT'S PRACTICE WRITES IN THIS CELL OF EVERY NEW LINE (REQUIREMENTS §117, the owner,
   * 16-Oct-2026: "Weights should be fixed (default)"): F/QC/12's five test weights, 50 gm to 600 gm. Written into
   * every new line — a new record's, Add line's, Mitra's (engine/recordDefaults.ts blankLogRow) — and the person
   * may write another over it. Not a reading: for the morning prepare and the count of what waits it is a printed
   * part of the line, as a fixed column is (engine/observations.ts), but it stays editable.
   */
  standard?: string;
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
    // The clock time the reading this sign is under is taken at ("20:30" on F-QC-40.C), so `byShift` names
    // whoever was on shift then, on a sheet whose line has no time of its own (REQUIREMENTS §111).
    atTime?: string;
    // The line's own number, on a paper that numbers its lines in a column of its own (F/QC/16's Sr. No.,
    // REQUIREMENTS §111): a new line is numbered after the one above it; the person may write another.
    lineNumber?: boolean;
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
  /** The headings over its columns; none, and no heading row is drawn. */
  columns: string[];
  rows: string[][];
  /**
   * THE PAPER PRINTS NO TITLE OVER IT (REQUIREMENTS §111, part 4): F/QC/25's letterhead, three cells side by side.
   * `title` is then only its name among the layout's tables (a box's `tableAbove`), never drawn.
   */
  untitled?: true;
  /**
   * PRINTED ON THE PAGE, NOT SHOWN ON REQUEST (REQUIREMENTS §111): F/QC/13 prints its grade criteria in full
   * under the procedure, so the table is drawn open on the sheet and in its print, with no title of DCRS's above
   * it, each cell keeping its own lines. Without it the table is a reference shown on a click and never printed.
   */
  printed?: true;
}

/**
 * THE PAGE THE PAPER IS DRAWN ON (REQUIREMENTS §117, QC visual parity, 20-Oct-2026): the incoming-material inspection
 * records and the report forms of the same make (F/QC/01 to 05, 18 to 24, 29, 30, 33, 36) are printed on a FRAMED page: the
 * company's logo in a cell with the title beside it, in heavy borders, at the head; the Format number and the Page number
 * in a bordered line of their own, and the address, at the foot of the PAGE (not under the grid); Calibri throughout.
 * Named by document in data/seed/qcPageFrames.ts, so no other module's output changes.
 */
export interface PageFrame {
  /** Where the title stands in its cell: the incoming records start it at the left, the reports centre it. */
  titleAlign: "left" | "center";
  /** The title's own size (pt) and colour where the paper does not set it in the Word default (navy 20 pt): the destruction record's is black 18 pt. */
  title?: { size: number; color: string };
  /** The address the paper prints at the foot of its page where the layout holds none of its own (notesAtFoot): the reports and the destruction record. */
  address?: string;
  /** The paper breaks its title after the dash (F/QC/36: "INSPECTION RECORD –" over "SOLVENT BASE LAMINATION FILM"). */
  titleBreak?: true;
}

export interface LogSheetLayout {
  documentId: string;
  /**
   * THE TITLE AS THE PAPER PRINTS IT, where the name the document is filed and found under says more
   * (REQUIREMENTS §111): F/QC/13 prints "In Process Quality Control", filed as "In Process Quality Control
   * (Printing) — ઇન પ્રોસેસ ક્વોલિટી કંટ્રોલ"; the Nivea utility test is printed on the "MINUTES OF MEETINGS"
   * format. A record and its print are headed with it; a format the plant has renamed is headed with its new name.
   */
  paperTitle?: string;
  /**
   * THE TITLE IN THE PAPER'S OWN LETTERS (REQUIREMENTS §111 part 6): the header block prints every title in
   * capitals, as most papers do; the certificates print "Certificate of Analysis [COA] For Label", F/QC/13 "In
   * Process Quality Control", and theirs is printed so.
   */
  titleAsPrinted?: true;
  /**
   * THE LINES THE PAPER PRINTS UNDER THE COMPANY'S NAME, in the header block (REQUIREMENTS §111 part 6): F/QC/11
   * and F/QC/12 print "Manufacturers of Printed Cartons, Self Adhesive Labels, Shrink sleeves, Corrugated Boxes";
   * the certificates of analysis their address, contact and GSTIN lines; F/QC/25 "CBA: CORRUGATED BOX ANALYSIS"
   * under its letterhead. Before the title, where the paper prints them.
   */
  underCompany?: string[];
  /**
   * THE PAPER'S OWN LETTERHEAD IN PLACE OF THE COMPANY'S LINE (REQUIREMENTS §111 part 6): the title of one of the
   * layout's `referenceTables` (untitled) drawn at the top of the header block — F/QC/25's three cells, the
   * company's name in the first — so the name is printed once and the title stands under it, as on the paper.
   */
  letterhead?: string;
  // Text printed on the form above the grid (instructions, recommended
  // values, ALC protocol, ...), verbatim. Only what the paper prints: an
  // explanation of DCRS's own is never put here (REQUIREMENTS §111).
  instructions?: string[];
  headerFields: LogHeaderField[];
  columns: LogColumn[];
  rowMode: LogRowMode;
  // THE FORM NUMBERS ITS OWN LINES (REQUIREMENTS §102): a "#", "No.", "Sr.No.",
  // "Number" or "Index" column of the paper's own, or each printed line opening
  // with the paper's own number (F/HR/04's "06. — Diabetes"). The sheet then
  // draws no Sr. No. column of its own, so no line is numbered twice. Without
  // it the sheet numbers the lines, and a printed line never repeats that
  // number in its words (engine/lineNumbers.ts).
  ownLineNumbers?: true;
  /**
   * THE SR. NO. COLUMN HOLDS THE DAY, NOT A COUNT (REQUIREMENTS §111): on
   * F-QC-30 the hours are written under Date/Time and the day's date is written
   * in the Sr. No. column on its first line only ("6/9/26", then nothing until
   * "7/9/26"). The sheet's Sr. No. shows the record's date on the first line and
   * is empty on the others.
   */
  srNoShowsDate?: true;
  /**
   * THE SR. NO. PRINTED WITH ITS FULL STOP (REQUIREMENTS §111, part 4): thirteen of the incoming material
   * records and F/QC/36 number their lines "1.", "2.", "3."; F/QC/21 Flexo Ink, like most papers, "1", "2".
   */
  srNoFullStop?: true;
  /**
   * THE PAPER'S HEADINGS IN THE PAPER'S OWN LETTERS (REQUIREMENTS §111, part 4): the sheet prints every
   * heading of its tables in capitals, which turned a certificate's "Length(mm)" into "LENGTH(MM)" — a unit
   * the paper does not print. A sheet that says so prints its headings as they are written.
   */
  headingsAsPrinted?: true;
  /**
   * THE HEADING THE PAPER PRINTS OVER ITS OWN NUMBERING COLUMN (REQUIREMENTS §111, the review of 13-Oct-2026): the
   * sheet's Sr. No. column is headed "Sr. No." unless the paper heads it otherwise — F-QC-40.C's "SR NO", and ""
   * for F/QC/30's key points, which the paper numbers "1.", "2." under no heading of their own.
   */
  srNoLabel?: string;
  /**
   * THE PAPER PRINTS NO FORMAT NUMBER AND NO REVISION (REQUIREMENTS §111, the review of 13-Oct-2026): the two
   * Gujarati line clearance checklists. The header's Format No. and Rev No. print empty, never "TO BE CONFIRMED";
   * the document is still filed and found as DCRS lists it.
   */
  numberNotPrinted?: true;
  /**
   * THE PAPER'S OWN LINES PRINTED WITH ITS FORMAT NUMBER (REQUIREMENTS §111, the review of 13-Oct-2026): F/QC/20
   * prints "Current Issue date | 1st January 2022" and "Next Review date | 31st December 2024" in the block that holds
   * its format number and its revision. The header prints them there, after the revision.
   */
  printedWithNumber?: { label: string; value: string }[];
  /**
   * THE BOXES THE PAPER PRINTS ABOVE ITS PARAGRAPH (REQUIREMENTS §111, the review of 13-Oct-2026): F/QC/15-A to G
   * print the machine box beside the title, above "Line Clearance * :"; the Gujarati checklists their આઈટમ નં. and
   * પ્રો.નં. above the procedure. Without it the paper's paragraph comes first, as on most forms.
   */
  boxesAboveInstructions?: true;
  /**
   * THE PAPER LEAVES A BLANK LINE BETWEEN THE RUNS of the column this names (REQUIREMENTS §111, the review of
   * 13-Oct-2026): the Gujarati line clearance's processes. Drawn on the sheet and its print; never a line of the record.
   */
  gapBetweenRuns?: string;
  /**
   * THE PAPER PRINTS A PHOTOGRAPH UNDER ITS TABLE (REQUIREMENTS §111, the review of 13-Oct-2026): F/QC/29's analysis
   * report prints the label roll it analysed. The sheet has a place for it there: added from a picture while the
   * record is open for writing, kept in the record (LogSheetData.photos, scaled down as the complaint report keeps its
   * photographs) and printed where the paper prints it. Never filled by Demo Mode or a sample.
   */
  photoBelowGrid?: true;
  /**
   * THE PAPER'S "APPROVED BY (QA MANAGER)" IS DCRS'S VERIFY (REQUIREMENTS §74, §111): F/QC/34, /35 and /37 print an
   * approval DCRS stamps when the record is verified, not a box to type. Only such a sheet says so on the screen
   * (a line that does not print); a paper with no approval says nothing of one (the review of 13-Oct-2026).
   */
  approvedOnVerify?: true;
  /**
   * THE GRID PRINTED AS THE PAPER'S SMALL TABLES (REQUIREMENTS §111, the review of 13-Oct-2026): F-QC-14 prints each
   * check as a table of its own, two to a row — the check and its specification over the inspectors, each inspector's
   * name under his heading, the first column headed with what was sampled, three lines, and the check's Conclusion
   * under them. The record is unchanged — its lines in order, `lines` to a table, and its boxes; only the drawing (the
   * sheet, its print, the server's PDF and the Excel and Word files made from it) puts them in the paper's tables.
   */
  panels?: {
    /** The record's lines each table holds, in order. */
    lines: number;
    /** Tables to a row on the paper. */
    perRow: number;
    /** The printed column whose words head each table (the check and its specification); not drawn as a column. */
    headingColumn: string;
    /** Each table's first heading, in order; "{key}" stands for the box above the grid of that key, written in it ("{fgCode} sample no."). */
    firstHeadings: string[];
    /** By column, the box above the grid whose value the paper writes under the column's heading, in brackets ("Inspector - 1" over "(Kapila)"). */
    namesUnder?: Record<string, string>;
    /** Each table's box below the grid, in order, printed under its lines beside `footerLabel`. */
    footers?: string[];
    footerLabel?: string;
  };
  /**
   * ONE ANSWER ACROSS THE PAPER'S COLUMNS, AND THEIR HEADINGS ON A PRINTED LINE (REQUIREMENTS §111, part 4): F/QC/25
   * gives each of its printed lines one answer box across the page, but for 7.1 TOP PAPER, 7.2 PLAIN PAPER and 7.3
   * FLUTE PAPER, which are written in four columns — Specified GSM and Tested GSM under GSM, BF, Grade of Paper —
   * whose headings it prints on line 7, "Material Specification", not over the grid. `answer` is the column of the one
   * box; `across`, the columns it stands across; `headingLine`, the printed line (counted from 0) the `across`
   * columns' headings stand on; `lines`, the printed lines written in the `across` columns. The record's data is
   * unchanged: every line still holds every column.
   */
  answerAcross?: { answer: string; across: string[]; headingLine: number; lines: number[] };
  /**
   * ONE CELL A HEADING ON THESE PRINTED LINES (REQUIREMENTS §111): F/QC/11 prints its Pass/Fail and Sign. lines with
   * one cell under each plate, across the plate's size and Deviation columns. On these lines (counted from 0) each
   * run of columns under one heading (LogColumn.group) is drawn as one cell, its first column's; the record keeps
   * every column, the others empty.
   */
  groupCellLines?: number[];
  /**
   * A PRINTED LINE THAT CONTINUES THE ONE ABOVE IT (REQUIREMENTS §111 part 6): F/QC/18 prints DRYING TEST once over
   * two specifications — "By Thumb Impression : ..." and, on an unnumbered line under it, "On Glass surface : ..." —
   * each with its own OBSERVATION box. On these lines (counted from 0) the printed cells left empty stand merged with
   * the line above's (its Sr. No. and its TEST PARAMETERS), and the line takes no number; its other cells are its own.
   */
  continuationLines?: number[];
  /**
   * THE SPECIFICATION PRINTED ON EACH LINE IS THE LINE'S BAND (REQUIREMENTS §111, rule 2): an incoming material
   * record prints "OUTER DIA (mm) | 90 (+2.0 / -1.0)", "MOISTURE CONTENT (%) | Max 15%", "VISCOSITY.(SEC) | 30 ± 10"
   * down its side, and a reading written in `readings` outside the figures `spec` prints is highlighted. Only a
   * specification that is a plain figure is read ("As per P.O.", a band for each ply or side, "Except ..." are left
   * to the inspector), and only a reading that is a plain figure is judged (engine/printedBands.ts).
   */
  specBand?: { spec: string; readings: string[] };
  /**
   * EVERY ENTRY TAKES TWO LINES (REQUIREMENTS §111): the second line's own
   * heading, written in the first column — F/QC/12's "Deviation %". The columns
   * drawn on it are those with `beneath`.
   */
  secondLine?: { label: string };
  /**
   * The paper's text BELOW the grid, verbatim and in its order — F/QC/11's and
   * F/QC/12's PROCEDURE (REQUIREMENTS §111). `instructions` is what it prints
   * above. Never filled in, never stored on a record.
   */
  notesBelow?: string[];
  /**
   * How many boxes the paper puts on one line above the grid: F/QC/12's nine
   * header boxes are three rows of three (REQUIREMENTS §111). Without it the
   * boxes flow as many to a line as the screen holds.
   */
  headerColumns?: number;
  /**
   * THE NEW SHEET IS WRITTEN AS THE LAST ONE WAS (REQUIREMENTS §117, the owner, 16-Oct-2026: "once I have filled
   * the data, same should be filled automatically as per previous & I will edit whichever filled reqd editing"):
   * QC's calibration and verification records (F/QC/11, F/QC/12, F/QC/17). Every box and every line of the
   * document's previous record is carried onto a new one — the person's own earlier entries, every one editable —
   * but a date box or column answered with the record's day, which takes the new day, a box the paper prints,
   * which stays the paper's, and the cells worked out, which are worked out again (engine/carryForward.ts).
   * Without a previous record the sheet starts as the paper's blank, with its standards.
   */
  carryForwardAll?: true;
  /** With carryForwardAll: the boxes are carried but not the lines - each new sheet's lines start from the columns'
   *  standards (F/QC/12, REQUIREMENTS §142: its readings are the week's own). */
  carryLines?: false;
  /** THE WEEKS OF A PAGE FOLLOW ONE ANOTHER (F/QC/12, REQUIREMENTS §145): a line's `nextKey` is its `dateKey` + `days`
   *  where none is written, and the line below starts on it; the first line's date is the person's
   *  (engine/nextDueChain.ts). */
  nextDueChain?: { dateKey: string; nextKey: string; days: number };
  /**
   * THE LINES A FORMER PAGE OF THE PAPER PRINTED, each as its fixed rows' starts: a previous sheet whose lines are
   * exactly one of these (as numbers) belongs to the old page, so a new sheet carries its boxes and not its lines
   * (engine/carryForward.ts). F/QC/17's 600 mm page printed 50 to 290 mm until the owner's updated page of
   * 27-Oct-2026 (100 to 590 mm); readings a person wrote over the points are theirs and still carry.
   */
  formerRows?: Record<string, string>[][];
  /**
   * THE PAPER'S ORIENTATION (REQUIREMENTS §117, the owner, 16-Oct-2026: "Download formatting reqd.", every QC and HR
   * document printed on A4 "portrait or landscape as the paper is"): F/QC/11 and F/QC/12 are landscape pages, F/QC/17
   * a portrait one. The print and the server's PDF (utils/print.ts) turn the page as it says and scale the sheet to
   * that page's width; the Word and Excel files (utils/docx.ts, utils/documentExport.ts) are set up on it. Where a
   * layout says nothing the page is chosen by the sheet's width, as before (§54).
   */
  paper?: "portrait" | "landscape";
  /**
   * The paper's text AT THE FOOT of the sheet, after the boxes below the grid,
   * verbatim and in its order (REQUIREMENTS §111): F/QC/21's "This is a system
   * generated document ...", the certificates of analysis' "THIS IS A SYSTEM
   * GENERATED DOCUMENT." and their corporate office. `notesBelow` is what the
   * paper prints straight under the grid. Never filled in, never stored.
   */
  notesAtFoot?: string[];
  /**
   * THE GRID PRINTED ACROSS THE PAGE (REQUIREMENTS §111): the paper prints each
   * line as a column and each column as a line — F/QC/06's and F/QC/07's PRINTING
   * table numbers its ten colours 1 to 10 across, with "Given By Client" and
   * "Color Shade Verified" on the two lines under them. The record's lines stay
   * its lines; only the drawing (the sheet, its print and the server's PDF, the
   * Excel and Word files made from it) turns them. For a sheet of printed lines
   * that numbers its own (ownLineNumbers): no Sr. No. is drawn.
   */
  gridAcross?: true;
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
  // THE CHARTS THE FORM PRINTS FROM ITS OWN FIGURES (REQUIREMENTS §77): the
  // complaint trend's bar chart of the years and its Pareto of the causes are
  // drawn from the record's boxes and lines by components/charts/SheetChart.tsx,
  // exactly as the paper prints them beside the figures — never a picture
  // pasted in. Nothing here is filled in or stored.
  charts?: LogSheetChart[];
}

/** One chart a form prints, and where on the sheet its figures are. */
export type LogSheetChart =
  | {
      kind: "bars";
      title: string;
      /** Each bar is a pair of boxes above or below the grid: the bar's name and its height. A pair with no name written draws no bar. */
      bars: { labelKey: string; valueKey: string }[];
      yAxisLabel?: string;
      xAxisLabel?: string;
    }
  | {
      kind: "pareto";
      title: string;
      /** A box whose value is written after the title — the period the Pareto covers. */
      titleKey?: string;
      /** The grid columns holding each cause and how many defects it caused. */
      labelColumn: string;
      valueColumn: string;
      /** The box holding the cumulative-percentage cutoff (a whole number of per cent); 80 when it is blank or absent. */
      cutoffKey?: string;
      yAxisLabel?: string;
      xAxisLabel?: string;
    };

/** One revision a format has replaced: when it was issued, how it was printed, and why it matters. */
export interface SupersededRevision {
  /** ISO date the superseded revision was issued, as its own header printed it. */
  revisionDate: string;
  /** The grid and boxes as that revision printed them. */
  layout: LogSheetLayout;
  /** A plain-English line on what changed, shown beside a record filled on it. */
  note?: string;
}
