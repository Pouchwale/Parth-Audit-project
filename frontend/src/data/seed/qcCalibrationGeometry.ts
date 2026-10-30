// THE PAPER'S OWN MEASURES FOR THE TWO INTERNAL CALIBRATION RECORDS, F/QC/11 AND F/QC/12 (REQUIREMENTS §117, round 2
// of 20-Oct-2026). The owner has complained about these two before ("Download formatting reqd.", 16-Oct-2026); the kit
// scored them 37.4 and 30.5: DCRS printed a header block with a FORMAT / REV / DATE / PAGE band the papers do not have,
// unruled grey labels for the papers' ruled boxes, and F/QC/12's grid at 5 pt on a page 70 % empty.
//
// Both papers are Word pages: a ruled box with the company's name (underlined) and the line under it, a rule, the title
// (underlined); the ruled table of the device's boxes (F/QC/11 three columns of two lines each, the value under its words;
// F/QC/12 three by three, the words at the top left of a tall cell); the grid (F/QC/11's Calibration Date / Due Date line
// above it is taken away, the owner, 28-Oct-2026: its Calibration Expiry box holds the certificate's due date);
// the PROCEDURE under it; the format number alone, centred, at the foot of the page. Every number below is read off the
// owner's PDFs by tests/qc_visual (rules and words, in millimetres). The sheet keeps every box a box and its owner's
// overrides (REQUIREMENTS §111, §117): the standard weights, one F/QC/12 record a week (its one entry on the paper's first
// two lines; the paper's other three entries print as blank ruled lines, never stored), the carry-forward, no DATE cell,
// and the number printed as DCRS keeps it (F/QC/12, where the paper reads F/QC/13: §111).
//
// left/top  where the paper's table stands on the page (mm from its left and top edges).
// width     the header box's width; the boxes are as wide; the grid its own width (gridWidth, F/QC/12's is 1.2 mm narrower).
// head      the header box: its two blocks' heights, and where each line's letters stand in its block (mm below its top).
// boxes     the device's boxes: column widths, row heights (a gap row where the paper leaves a space), where the words start.
// grid      its column widths, its heading rows' heights, its lines' heights, the space above it.
// entries   how many entries the paper's grid prints (F/QC/12: four, two lines each).
// notes     the space between the grid and the PROCEDURE, and the pitch of its lines.
// foot      where the number's letters stand (mm from the page's top).

export interface CalibrationGeometry {
  left: number;
  top: number;
  width: number;
  gridWidth: number;
  head: { company: number; companyY: number; linesGap: number; title: number; titleY: number };
  boxes: { cols: number[]; rows: number[]; x: number[]; labelY: number[]; valueY: number[]; centred: boolean };
  grid: { cols: number[]; head: number[]; lines: number[]; gapAbove: number };
  entries?: number;
  notes: { gapAbove: number; pitch: number; x: number };
  foot: { y: number };
}

export const CALIBRATION_GEOMETRY: Record<string, CalibrationGeometry> = {
  // "F-QC-11 GSM cutting plate internal calibration record (2).pdf" (a Letter page, landscape; drawn on A4 landscape).
  "qc-gsm-plate-calibration": {
    left: 7.62,
    top: 9.61,
    width: 262.38,
    gridWidth: 262.38,
    head: { company: 9.52, companyY: 0.51, linesGap: 0.53, title: 9.54, titleY: 0.52 },
    // Two lines of three boxes, a space, then the Calibration Date (two columns wide) and the Due Date (the line taken away
    // on 28-Oct-2026 and back on 30-Oct-2026, REQUIREMENTS §147).
    boxes: { cols: [89.13, 89.12, 84.13], rows: [9.52, 9.53, 9.95, 9.01], x: [0, 0, 0], labelY: [0.42, 0.4, 0, 0.4], valueY: [0.6, 0.6, 0, 0.6], centred: true },
    grid: { cols: [24.14, 35.26, 29.73, 29.72, 29.68, 29.72, 29.77, 29.72, 24.64], head: [9.24, 9.82], lines: [9.23, 9.82, 9.24, 9.82, 9.23, 9.52], gapAbove: 0 },
    notes: { gapAbove: 5.0, pitch: 4.45, x: 1.88 },
    foot: { y: 198.98 },
  },
  // "F-QC-12 Weighing balance internal calibration record (2).pdf" (A4 landscape).
  "qc-weight-scale-calibration": {
    left: 5.71,
    top: 8.55,
    width: 286.86,
    gridWidth: 285.63,
    head: { company: 14.15, companyY: 2.33, linesGap: 1.29, title: 9.44, titleY: 1.99 },
    boxes: { cols: [89.56, 106.64, 90.66], rows: [14.73, 10.8, 13.0], x: [1.79, 1.73, 1.79], labelY: [1.99, 1.95, 1.99], valueY: [0.8, 0.4, 0.6], centred: false },
    grid: {
      cols: [20.92, 24.56, 18.16, 18.2, 18.22, 18.16, 18.16, 18.17, 18.16, 18.16, 18.2, 18.17, 18.16, 18.17, 22.06],
      head: [12.79],
      lines: [8.38, 8.34, 8.35, 8.34, 8.34, 8.34, 8.33, 8.35],
      gapAbove: 5.46,
    },
    entries: 4,
    notes: { gapAbove: 10.19, pitch: 5.13, x: 3.19 },
    foot: { y: 192.79 },
  },
};

export const calibrationGeometryFor = (documentId: string): CalibrationGeometry | undefined => CALIBRATION_GEOMETRY[documentId];
