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
}

export const emptyReport = (kind: "xlsx" | "docx"): FillReport => ({ kind, placed: 0, notPlaced: [], leftOut: [], gridsMissed: [], grids: [], cleared: 0, replaced: [], dateCellsBlanked: 0 });
