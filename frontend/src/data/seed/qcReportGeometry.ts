// THE PAPER'S OWN GRIDS FOR THE QC REPORTS ON THE FRAMED PAGE (REQUIREMENTS §117, round 2 of 20-Oct-2026): F/QC/20's
// destruction record, F/QC/29's analysis report and the utility test written on the minutes format. Their page, band and
// foot are the framed page's already (qcPageFrames.ts); their grids were drawn the web's way, across the frame with
// grey headings. Here are the papers' own columns and row heights, read off the owner's PDFs by tests/qc_visual (mm);
// styles.css ("QC-REPORTS") sets their words, places and faces. `lines` the height of each printed line in turn (the last
// repeats); `pad` how many lines the paper rules: a record with fewer prints the rest as the paper's blank ruled lines,
// never stored.

export interface ReportGeometry {
  grid: { cols: number[]; head: number[]; lines: number[] };
  pad?: number;
}

export const REPORT_GEOMETRY: Record<string, ReportGeometry> = {
  // "F-QC-20.pdf": Sr. No. | Item Description | Actual Qty. | Destroyed By | Checked By, a tall heading row and a line of two.
  "qc-printing-aids-destruction": { grid: { cols: [17.79, 61.94, 25.12, 34.97, 34.98], head: [10.07], lines: [17.78] } },
  // "F-QC-29 _ Analysis report.pdf": Sr. No. | Description | Observation, eleven printed lines.
  "qc-analysis-report": { grid: { cols: [19.82, 43.23, 90.53], head: [6.14], lines: [6.6, 6.15, 6.14, 6.6, 6.14, 6.6, 6.61, 6.56, 6.6, 6.61, 6.61] } },
  // "F-QC-29 Analysis report.pdf" (the Nivea utility test on the minutes format): two heading rows, nine ruled lines.
  "qc-utility-test-report": { grid: { cols: [15.88, 44.46, 38.11, 36.54, 37.09], head: [3.86, 3.93], lines: [6.53, 5.68, 5.63, 5.67, 5.63, 5.67, 5.63, 5.67, 5.68] }, pad: 9 },
};

export const reportGeometryFor = (documentId: string): ReportGeometry | undefined => REPORT_GEOMETRY[documentId];
