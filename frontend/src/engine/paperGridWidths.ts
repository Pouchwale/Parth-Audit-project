// THE PAPER'S COLUMNS ON A GRID THE PLANT HAS CHANGED (REQUIREMENTS §117, §62; 25-Oct-2026).
//
// A QC paper is drawn on its own measured grid: one width per column its issued layout draws, the Sr. No. first where
// the sheet numbers its lines (data/seed/qcIncomingGeometry.ts, qcLineClearanceGeometry.ts, qcCalibrationGeometry.ts,
// qcReportGeometry.ts), in millimetres, in a table of fixed layout as wide as the paper's (styles.css, the paper form).
// A column Edit format added had no width of the paper's, so the table gave it none: drawn 0 mm wide (print takes the
// same rule), it could be neither read nor typed in (F/QC/01, found by tests/e2e_portal_controls.py on 25-Oct-2026).
//
// So a changed grid is laid out the way a word processor lays out a table as wide as the page when a column is put
// in: every column the paper measures keeps its width, a new one comes in as wide as its own typing width reads beside
// theirs (or as an average column of the paper, when it has none), and then all of them are narrowed together to the
// paper's width. A column taken out gives its width back to the others; a moved one takes its width along; a renamed
// one keeps it. A grid as issued is drawn on the paper's own widths, untouched.

/** A column of the grid, as far as its width goes. */
export interface GridColumn {
  key: string;
  /** The column's typing width in pixels (LogColumn.width); none on a column just added. */
  width?: number;
}

/**
 * The widths, in the paper's millimetres, of the columns `drawn` — the Sr. No. first when `numbered.drawn` — on a paper
 * whose measured widths `paper` are those of its `issued` columns (the Sr. No. first when `numbered.paper`). The same
 * array when the grid is the issued one.
 */
export function paperGridWidths(
  paper: readonly number[],
  issued: readonly GridColumn[],
  drawn: readonly GridColumn[],
  numbered: { paper: boolean; drawn: boolean }
): readonly number[] {
  const lead = numbered.paper ? 1 : 0;
  // The paper's widths are its issued columns', one each (every QC paper's: frontend/tests/paperGridWidths.test.ts).
  // A paper measured any other way is drawn as it is.
  if (paper.length !== lead + issued.length) return paper;
  if (numbered.paper === numbered.drawn && drawn.length === issued.length && drawn.every((c, i) => c.key === issued[i].key)) return paper;
  const own = new Map(issued.map((c, i) => [c.key, paper[lead + i]] as const));
  // Millimetres to a pixel of typing width, read off the paper's own columns.
  const typed = issued.filter((c) => (c.width ?? 0) > 0);
  const mmPerPx = typed.length > 0 ? typed.reduce((s, c) => s + (own.get(c.key) ?? 0), 0) / typed.reduce((s, c) => s + (c.width ?? 0), 0) : 0;
  const average = issued.length > 0 ? paper.slice(lead).reduce((a, b) => a + b, 0) / issued.length : 0;
  const widthOf = (c: GridColumn): number => own.get(c.key) ?? ((c.width ?? 0) > 0 && mmPerPx > 0 ? (c.width ?? 0) * mmPerPx : average);
  const wanted = [...(numbered.drawn ? [numbered.paper ? paper[0] : average] : []), ...drawn.map(widthOf)];
  const total = paper.reduce((a, b) => a + b, 0);
  const sum = wanted.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return paper;
  return wanted.map((w) => Math.round(((w * total) / sum) * 100) / 100);
}

/** Where the paper's column `at` (its place among the issued columns) stands among the `drawn` ones; -1 once it is taken out. */
export function drawnColumnOf(at: number, issued: readonly GridColumn[], drawn: readonly GridColumn[]): number {
  const key = issued[at]?.key;
  return key === undefined ? -1 : drawn.findIndex((c) => c.key === key);
}
