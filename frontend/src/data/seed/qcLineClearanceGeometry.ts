// THE PAPER'S OWN MEASURES FOR THE AREA LINE CLEARANCE REPORTS, F/QC/15-A to 15-G (REQUIREMENTS §117, QC visual parity of
// 20-Oct-2026). The owner: "reproduce the same layout, not a redesign." These seven are one Word template: a frame in three
// rows (the company, the title with the machine's name written in at the right, the Format no. / Rev. no. / Effective date
// in three cells), a ruled box with the Line Clearance note, the heading row, and TEN ruled lines to write in. Every number
// is read off the owner's PDF of the format (tests/qc_visual measures it, in millimetres). 15-A is the wider sheet (its
// "Previous PO Customer name" column is 33.1 mm; the other six 23.7 mm), so the sheet is drawn at the paper's own width.

export interface LineClearanceGeometry {
  /** The twelve columns' widths. */
  cols: number[];
}

const WIDE = [17.2, 17.3, 20.9, 30, 33.1, 18.8, 17.9, 17.8, 19.1, 36.4, 20.1, 21.5];
const NORMAL = [17.2, 17.3, 20.9, 30, 23.7, 18.8, 17.9, 17.8, 19.1, 36.4, 20.1, 21.5];

/** The heights of the paper's rows: the three of the head, the note's box, the heading row, a line to write in; and how many lines it prints. */
export const LINE_CLEARANCE_ROWS = { company: 7.56, title: 7.09, format: 7.07, note: 13.7, heading: 14.15, line: 10.83, lines: 10 } as const;
/** The width of the machine's name box at the right of the title row, on every one of the seven. */
export const LINE_CLEARANCE_MACHINE_WIDTH = 78;

export const LINE_CLEARANCE_GEOMETRY: Record<string, LineClearanceGeometry> = {
  "qc-line-clearance-printing": { cols: WIDE },
  "qc-line-clearance-punching": { cols: NORMAL },
  "qc-line-clearance-qc-machine": { cols: NORMAL },
  "qc-line-clearance-qc-manual": { cols: NORMAL },
  "qc-line-clearance-slitting": { cols: NORMAL },
  "qc-line-clearance-sleeve-gluing": { cols: NORMAL },
  "qc-line-clearance-sleeve-cutting": { cols: NORMAL },
};

export const lineClearanceGeometryFor = (documentId: string): LineClearanceGeometry | undefined => LINE_CLEARANCE_GEOMETRY[documentId];
