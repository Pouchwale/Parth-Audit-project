// THE PAPER'S OWN MEASURES FOR THE INCOMING-MATERIAL INSPECTION RECORDS (REQUIREMENTS §117, QC visual parity of 20-Oct-2026).
// The owner: "reproduce the same layout, not a redesign ... I need same format in my audit software in QC module." These
// records are Word tables printed to PDF: a ruled table of the header boxes, the grid with its grey heading row and its
// Word row heights, the LOT STATUS table, the signature table. Every number below is read off the owner's PDF of the
// format (tests/qc_visual/ measures it: rules and words, in millimetres), so the sheet draws the paper's own columns and
// rows instead of a layout of its own. The page's frame, band and foot are qcPageFrames.ts / styles.css.
//
// head   the table of header boxes: its four column widths and its four row heights.
// grid   the grid: its column widths, and its heading row's height followed by every line's.
// lotGap the blank space between the grid and the LOT STATUS table; signGap the space between the REASON row and the
//        signature table; lotRows / signRows the heights of their rows.
// sr     where the line number stands in its column: the distance of "1." from the column's left edge.
// lh     the pitch of the grid's text lines (Word's single spacing 4.74, its 1.15 spacing 5.46); par the space after a
//        paragraph (the lines a cell holds apart, F/QC/02's plies, F/QC/05's shrinkage ratios).

export interface IncomingGeometry {
  head: { cols: number[]; rows: number[] };
  grid: { cols: number[]; rows: number[] };
  lotGap: number;
  signGap: number;
  lotRows: number[];
  signRows: number[];
  sr: number;
  lh: number;
  par: number;
  /** The cells the paper sets in Arial 10 pt (a Word cell pasted from elsewhere): [line, column], line 0 the first, column 0 the Sr. No. */
  arial?: [number, number][];
  /** The header's last line is a box of its own, its answer the width of the table (F/QC/36's 1st Pass / 2nd Pass / 3rd Pass). */
  headMore?: true;
  /** A paper of its own cut (F/QC/21 Flexo Ink): the space above the header's table, and its LOT STATUS and signature columns. */
  headGap?: number;
  lotCols?: number[];
  signCols?: number[];
}

/** The LOT STATUS table's columns, the same on every one of these papers: LOT STATUS, the four statuses; REASON takes the first two and the box the other three. */
export const LOT_COLS = [31.8, 27, 55.1, 36.4, 36.3];
/** The signature table's two columns. */
export const SIGN_COLS = [93.3, 93.3];

export const INCOMING_GEOMETRY: Record<string, IncomingGeometry> = {
  "qc-bopp-film": {
    head: { cols: [45.6, 45.5, 45.5, 45.6], rows: [7.2, 7.3, 7.3, 7.3] },
    grid: { cols: [23.1, 60.6, 45.1, 56.8], rows: [15.4, 13.9, 5.9, 11.9, 17.6] },
    lotGap: 12.3, signGap: 4.2, signRows: [9.2, 9.3, 9.2], lotRows: [13, 12.1],
    sr: 8.3, lh: 5.46, par: 0,
  },
  "qc-corrugated-box": {
    head: { cols: [45.6, 45.5, 45.5, 45.6], rows: [7.2, 7.3, 7.3, 7.3] },
    grid: { cols: [13.2, 41.6, 39.3, 28.9, 28.9, 28.9], rows: [14.4, 8.5, 8.4, 25, 25] },
    lotGap: 12.3, signGap: 8.3, signRows: [9.1, 9.3, 9.2], lotRows: [13, 12.1],
    sr: 8.3, lh: 5.46, par: 2.82,
  },
  "qc-label-stock": {
    head: { cols: [45.6, 45.5, 45.5, 45.6], rows: [7.2, 7.3, 7.3, 7.3] },
    grid: { cols: [22.1, 58, 53.5, 53.5], rows: [13.8, 8.5, 8.4, 13.2, 13.2, 13.1, 8.5, 13.2, 13.1, 13.2, 8.5] },
    lotGap: 4.2, signGap: 4.2, signRows: [9.2, 9.2, 9.2], lotRows: [13, 12.1],
    sr: 6.73, lh: 4.74, par: 0,
  },
  "qc-paper-core": {
    head: { cols: [46.9, 46.8, 46.9, 46.9], rows: [7.2, 7.3, 7.3, 7.3] },
    grid: { cols: [17.5, 45.9, 32.5, 30.4, 30.4, 30.5], rows: [7.4, 5.6, 5.7, 5.8, 5.6, 5.8, 11] },
    lotGap: 32.6, signGap: 4.2, signRows: [9.2, 9.3, 9.2], lotRows: [13, 12.1],
    sr: 8.3, lh: 5.46, par: 0,
  },
  "qc-pvc-pet-film": {
    head: { cols: [45.6, 45.5, 45.5, 45.6], rows: [7.2, 7.3, 7.3, 7.3] },
    grid: { cols: [17.9, 40, 62.1, 62.2], rows: [14.7, 8.4, 57.8, 11.3, 16.6] },
    lotGap: 8.3, signGap: 4.2, signRows: [9.3, 9.2, 9.3], lotRows: [13, 12],
    sr: 8.3, lh: 5.46, par: 2.82,
  },
  "qc-offset-ink": {
    head: { cols: [45.6, 45.5, 45.5, 45.6], rows: [7.2, 7.3, 7.3, 7.3] },
    grid: { cols: [17.5, 60.3, 69.9, 37.9], rows: [9.6, 8.4, 11.1, 7.3, 11.8, 8.1, 17.6, 16.5, 11.1, 11.1, 11.1] },
    lotGap: 4.2, signGap: 4.2, signRows: [9.3, 9.2, 9.2], lotRows: [13, 12],
    sr: 8.3, lh: 5.46, par: 0,
  },
  "qc-duplex-board": {
    head: { cols: [46.1, 46, 46.1, 46.1], rows: [7.2, 7.3, 7.3, 7.3] },
    grid: { cols: [17.5, 55.6, 57.1, 55.4], rows: [9.6, 9.5, 9.5, 9.5, 8, 11.1, 9.5, 8] },
    lotGap: 12.3, signGap: 12.3, signRows: [9.2, 9.2, 9.3], lotRows: [13, 12.1],
    sr: 8.3, lh: 4.74, par: 0,
  },
  "qc-kraft-paper": {
    head: { cols: [46.1, 46, 46.1, 46.1], rows: [7.2, 7.3, 7.3, 7.3] },
    grid: { cols: [17.5, 55.6, 60.3, 52.2], rows: [9.6, 9.5, 9.5, 9.5, 8, 11.1, 9.5, 9] },
    lotGap: 12.3, signGap: 12.4, signRows: [9.2, 9.2, 9.2], lotRows: [13, 12],
    sr: 8.3, lh: 4.74, par: 0,
    arial: [[4, 2], [6, 2]],
  },
  // F/QC/21 Flexo Ink ("F-QC-21- Flexo INk.pdf", §117 round 2): the same tables cut its own way, on a page of its own
  // (one hairline frame 15.58 mm from the left, the band and the foot inside it; styles.css "QC-FLEXO").
  "qc-flexo-ink": {
    head: { cols: [36.07, 67.99, 33.61, 42.77], rows: [6.26, 6.44, 6.08, 7.06] },
    grid: { cols: [13.93, 61.03, 69, 36.48], rows: [7.15, 6.35, 9.61, 8.41, 7.22, 6.35, 6.08] },
    lotGap: 34.47, signGap: 5.02, signRows: [8.47, 9, 9.26], lotRows: [14.38, 11.64],
    sr: 6.32, lh: 4.49, par: 0,
    headGap: 1.59, lotCols: [31.57, 27.78, 49.74, 29.19, 42.16], signCols: [81.31, 99.13],
  },
  "qc-lamination-adhesive-inspection": {
    head: { cols: [46.1, 46, 46.1, 46.1], rows: [7.2, 7.3, 7.3, 7.3] },
    grid: { cols: [17.5, 47.6, 76.2, 44.3], rows: [9.6, 13.2, 9.6, 9.5, 11.1, 9.5] },
    lotGap: 12.4, signGap: 12.4, signRows: [9.2, 9.2, 9.2], lotRows: [13, 12],
    sr: 8.3, lh: 4.74, par: 0,
  },
  "qc-side-pasting-adhesive": {
    head: { cols: [46.1, 46, 46.1, 46.1], rows: [7.2, 7.3, 7.3, 7.3] },
    grid: { cols: [17.5, 49.2, 76.3, 42.6], rows: [9.6, 13.2, 12.3, 9.5] },
    lotGap: 12.4, signGap: 12.4, signRows: [9.2, 9.2, 9.3], lotRows: [13, 12],
    sr: 8.3, lh: 4.74, par: 0,
    arial: [[1, 2]],
  },
  "qc-starch-powder": {
    head: { cols: [46.1, 46, 46.1, 46.1], rows: [7.2, 7.3, 7.3, 7.3] },
    grid: { cols: [17.5, 60.3, 52.4, 55.4], rows: [9.6, 9.5, 9.5, 9.5, 9.6, 9.5] },
    lotGap: 12.4, signGap: 12.3, signRows: [9.3, 9.2, 9.2], lotRows: [13, 12],
    sr: 8.3, lh: 4.74, par: 0,
    arial: [[0, 1], [0, 2], [1, 1], [1, 2], [2, 1], [2, 2], [3, 1], [3, 2], [4, 1], [4, 2]],
  },
  "qc-sheet-pasting-powder": {
    head: { cols: [46.1, 46, 46.1, 46.1], rows: [7.2, 7.3, 7.3, 7.3] },
    grid: { cols: [17.5, 60.3, 52.4, 55.4], rows: [9.6, 9.5, 9.5, 9.5, 9.6, 9.5] },
    lotGap: 12.4, signGap: 12.3, signRows: [9.3, 9.2, 9.2], lotRows: [13, 12],
    sr: 8.3, lh: 4.74, par: 0,
    arial: [[0, 1], [0, 2], [1, 1], [1, 2], [2, 1], [2, 2], [3, 1], [3, 2], [4, 1], [4, 2]],
  },
  "qc-incoming-lamination-film": {
    head: { cols: [45.6, 45.5, 45.5, 45.6], rows: [7.2, 7.3, 7.3, 7.3] },
    grid: { cols: [23.1, 60.6, 45.1, 56.8], rows: [15.4, 13.9, 11, 11.8, 11.9, 11.8, 17.6] },
    lotGap: 12.3, signGap: 4.2, signRows: [9.2, 9.2, 9.3], lotRows: [13, 12.1],
    sr: 8.3, lh: 5.46, par: 0,
  },
  "qc-inspection-sb-lamination": {
    head: { cols: [48, 52.5, 45, 40.9], rows: [7.2, 7.3, 7.3, 7.3] },
    grid: { cols: [23.1, 60.6, 45.1, 56.8], rows: [15.4, 16.8, 12.7, 9.1] },
    lotGap: 12.3, signGap: 4.3, signRows: [9.2, 9.2, 9.2], lotRows: [13, 12],
    sr: 8.3, lh: 5.46, par: 0, headMore: true,
  },
};

export const incomingGeometryFor = (documentId: string): IncomingGeometry | undefined => INCOMING_GEOMETRY[documentId];
