// What the filler takes besides the template and the page, and what it says it did (REQUIREMENTS §119).

/**
 * Per-document help where the generic matcher cannot tell (utils/originalFill/hints.ts) - kept few, each with its reason.
 */
export interface FillHints {
  /** xlsx: the sheet's 1-based row of a grid's (last) heading row, by the grid's order on the page. */
  headingRow?: Record<number, number>;
  /** The grids of the page to leave out of the file (a grid DCRS shows that the paper does not have). */
  skipGrids?: number[];
  /** docx: the template's table (0-based, in body order) of a grid, by the grid's order on the page. */
  table?: Record<number, number>;
  /** Labels of boxes the paper does not print: their values are not placed (and the check says so). */
  notOnPaper?: string[];
  /**
   * The paper's own words for a DCRS label or grid heading, where the paper words it differently or in another language
   * (F/DISP/02's Gujarati form): DCRS label -> the paper's words. The box or column is then found by the paper's words.
   */
  labelAs?: Record<string, string>;
  /**
   * docx: a grid the paper prints with no heading row of its own (F/HR/07's responsibilities): the template's table (0-based,
   * in body order), its first and last body row (0-based), and each DCRS column's table column.
   */
  gridRows?: Record<number, { table: number; from: number; to: number; cols: Record<number, number> }>;
  /**
   * docx: the template holds further filled copies of the same form after its first (F/HR/07's other positions): everything
   * from this table (0-based, in body order; the section's own page settings kept) is the owner's examples and is left out.
   */
  cutFromTable?: number;
  /** xlsx: a box the paper has a cell for but no label (F/HR/21's overall result under its Achieved column): label -> "N20". */
  cellOf?: Record<string, string>;
  /**
   * docx: a box whose place is the owner's example written inside a sentence of the paper (F/DISP/01's "valid for the period
   * of 01.04.2025 to 31.03.2026"): the example's exact words -> DCRS's label. The value takes those words' place.
   */
  exampleOf?: Record<string, string>;
  /**
   * xlsx: boxes the paper has one area for, written there as lines "Label: value" (F/SYS/13's "Information of the product"):
   * the area's heading -> DCRS's labels.
   */
  areaOf?: Record<string, string[]>;
}

export interface FillReport {
  kind: "xlsx" | "docx";
  /** Bound values written into the file. */
  placed: number;
  /** Bound values DCRS shows that found no place in the file, by their label. */
  notPlaced: string[];
  /** Values of boxes the paper does not print (hints.ts notOnPaper), left out on purpose, by their label. */
  leftOut: string[];
  /** Grids of the page (with lines) whose headings were not found on the paper: their first heading's words. */
  gridsMissed: string[];
  /** Grids: how many lines DCRS has, how many rows the paper gave them, how many were added. */
  grids: { rows: number; paperRows: number; added: number; where: string }[];
  /** Cells or paragraphs of the owner's example entries cleared. */
  cleared: number;
  /** Fixed words replaced by DCRS's (the company's name, a format number, an edited label). */
  replaced: string[];
  /** The header's DATE cells blanked (REQUIREMENTS §117). */
  dateCellsBlanked: number;
  /**
   * Values DCRS records that the paper has no box for, written where a person filling the paper by hand would - in its empty
   * space, as "Label: value" (REQUIREMENTS §119 round 2): "label -> where".
   */
  outside: string[];
}

export const emptyReport = (kind: "xlsx" | "docx"): FillReport => ({ kind, placed: 0, notPlaced: [], leftOut: [], gridsMissed: [], grids: [], cleared: 0, replaced: [], dateCellsBlanked: 0, outside: [] });
