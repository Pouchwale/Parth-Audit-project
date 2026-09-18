import type { LogColumn, LogHeaderField, LogRowMode, LogSheetLayout } from "../../types";

// THE THIRTEEN INCOMING-MATERIAL INSPECTION RECORDS (REQUIREMENTS §57) — the
// Quality Control formats supplied on 18-Sep-2026, reproduced as log-sheet
// layouts. Every one of the thirteen is printed the same way: a four-line,
// two-column header box; a grid whose TEST PARAMETERS and SPECIFICATION are
// printed on the form and whose reading(s) are filled in; and a footer with the
// lot status, the reason for a deviation and the two signatures. So the file is
// built from four shared helpers — the header block, the two printed parameter
// columns, the entry column(s), and the lot-status footer — and each format is
// then just its own list of printed lines.
//
//   qc-bopp-film                      F/QC/01 (01 / 16.02.2022)  INSPECTION RECORD - BOPP FILM
//   qc-corrugated-box                 F/QC/02 (01 / 16.02.2022)  INSPECTION RECORD - CORRUGATED BOX
//   qc-label-stock                    F/QC/03 (01 / 16.02.2022)  INSPECTION RECORD - LABEL STOCK
//   qc-paper-core                     F/QC/04 (01 / 16.02.2022)  INSPECTION RECORD: PAPER CORE
//   qc-pvc-pet-film                   F/QC/05 (01 / 16.02.2022)  INSPECTION RECORD - PVC / PET FILM
//   qc-offset-ink                     F/QC/18 (01 / 16.02.2022)  INSPECTION RECORD – OFFSET INK
//   qc-duplex-board                   F/QC/19 (01 / 16.02.2022)  INSPECTION RECORD – DUPLEX BOARD
//   qc-kraft-paper                    F/QC/20 (01 / 16.02.2022)  INSPECTION RECORD – KRAFT PAPER & WHITE TOP LINER
//   qc-flexo-ink                      F/QC/21 (00 / 01.04.2023)  INSPECTION RECORD – FLEXO INK
//   qc-lamination-adhesive-inspection F/QC/21 (01 / 16.02.2022)  INSPECTION RECORD – LAMINATION FILM ADHESIVE
//   qc-side-pasting-adhesive          F/QC/22 (01 / 16.02.2022)  INSPECTION RECORD – SIDE PASTING ADHESIVE
//   qc-starch-powder                  F/QC/23 (01 / 16.02.2022)  INSPECTION RECORD – CORRUGATION STARCH POWDER
//   qc-sheet-pasting-powder           F/QC/24 (01 / 16.02.2022)  INSPECTION RECORD – SHEET PASTING POWDER
//
// SOURCE FILES, all supplied 18-Sep-2026 and all blank forms:
//   F-QC-01_Inspection record for BOPP Film (2).pdf
//   F-QC-02_Inspection record for CORRUGATED BOX (2).pdf
//   F-QC-03_Inspection record for Label stock (2).pdf
//   F-QC-04_Inspection record for Paper core (2).pdf
//   F-QC-05_Inspection record for PVC+PET Film (2).pdf
//   F-QC-18_Inspection record for Offset Ink.pdf
//   F-QC-19_Inspection record for Duplex board.pdf
//   F-QC-20_Inspection record for Kraft Paper.pdf
//   F-QC-21- Flexo INk.pdf
//   F-QC-21_Inspection record for Lamination film adhesive.pdf
//   F-QC-22_Inspection record for Side pasting adhesive.pdf
//   F-QC-23_Inspection record for Corru. starch powder.pdf
//   F-QC-24_Inspection record for Corru.sheet pasting powder.pdf
//
// TWO FORMATS CARRY THE NUMBER F/QC/21 — the flexo ink record (Rev 00 of
// 01.04.2023) and the lamination film adhesive record (Rev 01 of 16.02.2022).
// Both were supplied that way and both are reproduced as supplied; it is for
// the MR to confirm which number the newer one should carry.
//
// NOTHING WAS SUPPLIED FILLED IN. None of the thirteen prints a value in any
// box, so there is no specimenHeader and there are no specimenRows — a box the
// form leaves blank stays blank. specimenSource names the blank form.
//
// WHERE THE SHAPE HAD TO DIFFER FROM THE PAPER, and why:
//   · LOT STATUS is printed as one line of alternatives, "ACCEPTED / REJECT &
//     SEND BACK TO SUPPLIER / SCRAP / SEGREGATION / ACCEPTED ON DEVIATION",
//     which the form describes as four statuses. Reject-and-send-back and
//     scrap are therefore the one status, as on F/QC/34–37 where the same four
//     read "Reject / Scrap". Every word of the printed line is kept.
//   · A specification printed as several stacked lines in the one box (the
//     bursting strengths, the shrinkage ratios, the Cobb values) is kept as
//     those same lines inside the one specification cell.
//   · F/QC/18's DRYING TEST specification is printed as two boxes against the
//     one parameter; a grid cannot hold that, so both lines sit in the one
//     specification cell, in the printed order.
//   · F/QC/02 and F/QC/04 are read three samples at a time, so on those two the
//     OBSERVATION column is replaced by the form's own SAMPLE – 1 / SAMPLE – 2 /
//     SAMPLE - 3 (the dashes are the paper's: en dashes on 1 and 2, a hyphen on 3).
//   · F/QC/21 FLEXO INK's header box reads "Batch number" where the other
//     twelve read "SAP Batch number".
//   · Both signature boxes are entry fields here, because the paper prints
//     both INSPECTED BY (QA INSPECTOR) and APPROVED BY (QA MANAGER) on the
//     form itself.
//
// Every label, heading, specification and unit below is the paper's own,
// including its typos ("RELEAE LINER THICKNES", "BRUSTING", "APPERANCE.",
// "MOISTURE CONTAINT", "SHRINKAGE RATIO (%))", "As per PO ((± 5)"), each of
// which carries a comment where it appears.

/** The four-line, two-column header box printed above the grid on all thirteen. */
const incomingHeader = (batchLabel = "SAP Batch number"): LogHeaderField[] => [
  { key: "supplierName", label: "Supplier Name", type: "text", width: 220, autoFill: { carryForward: true } },
  { key: "productDescription", label: "Product Description", type: "text", width: 220 },
  { key: "grnQty", label: "GRN Qty.", type: "text", width: 140 },
  { key: "reportNumber", label: "Report number", type: "text", width: 160 },
  // F/QC/21 FLEXO INK prints this box as "Batch number"; the other twelve print "SAP Batch number".
  { key: "batchNumber", label: batchLabel, type: "text", width: 170 },
  { key: "grnNumber", label: "GRN number", type: "text", width: 160 },
  { key: "dateOfInspection", label: "Date of Inspection", type: "date", required: true, width: 150, autoFill: { dueDate: true } },
];

/** The two columns printed on the form: the test parameter and its specification. */
const printedParameterColumns = (): LogColumn[] => [
  { key: "parameter", label: "TEST PARAMETERS", type: "text", fixed: true, width: 240 },
  { key: "specification", label: "SPECIFICATION", type: "text", fixed: true, width: 300 },
];

/** Eleven of the thirteen: one reading per printed parameter. */
const observationColumns = (): LogColumn[] => [
  ...printedParameterColumns(),
  { key: "observation", label: "OBSERVATION", type: "text", width: 200 },
];

/** F/QC/02 and F/QC/04: three samples per printed parameter, dashes as printed. */
const sampleColumns = (): LogColumn[] => [
  ...printedParameterColumns(),
  { key: "sample1", label: "SAMPLE – 1", type: "text", width: 140 },
  { key: "sample2", label: "SAMPLE – 2", type: "text", width: 140 },
  // The paper prints a hyphen on the third sample where the first two have en dashes.
  { key: "sample3", label: "SAMPLE - 3", type: "text", width: 140 },
];

/** The lines printed down the grid: [TEST PARAMETERS, SPECIFICATION]. */
const printedRows = (rows: [string, string][]): LogRowMode => ({
  kind: "fixedRows",
  rows: rows.map(([parameter, specification]) => ({ parameter, specification })),
});

const LOT_STATUS = [
  "ACCEPTED",
  // The paper's one line of four statuses; reject-and-send-back and scrap are the one status.
  "REJECT & SEND BACK TO SUPPLIER / SCRAP",
  "SEGREGATION",
  "ACCEPTED ON DEVIATION",
];

/** The footer box printed below the grid on all thirteen. */
const lotStatusFooter = (): LogHeaderField[] => [
  { key: "lotStatus", label: "LOT STATUS", type: "select", options: LOT_STATUS, width: 260 },
  { key: "deviationReason", label: "REASON FOR DEVIATION / REJECTION / SEGREGATION", type: "text", width: 320 },
  { key: "inspectedBy", label: "INSPECTED BY (QA INSPECTOR)", type: "text", width: 200, autoFill: { sign: true } },
  { key: "approvedBy", label: "APPROVED BY (QA MANAGER)", type: "text", width: 200, autoFill: { sign: true } },
];

const blankForm = (file: string) => `${file} (blank form supplied 18-Sep-2026 — no filled specimen)`;

export const QC_INCOMING_LAYOUTS: Record<string, LogSheetLayout> = {
  // ---- F/QC/01 (01 / 16.02.2022) — INSPECTION RECORD - BOPP FILM
  "qc-bopp-film": {
    documentId: "qc-bopp-film",
    headerFields: incomingHeader(),
    columns: observationColumns(),
    rowMode: printedRows([
      // The two spaces before "(+ 2" are the paper's own.
      ["SIZE (mm)", "Should be as per P.O.  (+ 2/- 0.0)"],
      ["COLOUR", "Transparent"],
      ["THICKNESS OF FILM (µm)", "As per P.O. (Max.± 1 micron)"],
      ["CORONA TREATMENT (Dynes)", "Both side Minimum 36 dynes"],
    ]),
    footerFields: lotStatusFooter(),
    specimenSource: blankForm("F-QC-01_Inspection record for BOPP Film (2).pdf"),
  } satisfies LogSheetLayout,

  // ---- F/QC/02 (01 / 16.02.2022) — INSPECTION RECORD - CORRUGATED BOX (three samples)
  "qc-corrugated-box": {
    documentId: "qc-corrugated-box",
    headerFields: incomingHeader(),
    columns: sampleColumns(),
    rowMode: printedRows([
      ["SIZE (L x W x H) mm", "AS PER P.O. (±5)"],
      ["NOS OF PLY", "AS PER P.O."],
      // "STRENGTH(KG/CM2)" and "STRENGTH(KGS)" are printed without a space before the bracket.
      ["BURSTING STRENGTH(KG/CM2)", "3PLY: 9 ± 1\n5PLY: 12 ± 1\n7PLY: 15 ± 1"],
      ["COMPRESSION STRENGTH(KGS)", "3PLY: 200 ± 35\n5PLY: 250 ± 50\n7PLY: 350 ± 75"],
    ]),
    footerFields: lotStatusFooter(),
    specimenSource: blankForm("F-QC-02_Inspection record for CORRUGATED BOX (2).pdf"),
  } satisfies LogSheetLayout,

  // ---- F/QC/03 (01 / 16.02.2022) — INSPECTION RECORD - LABEL STOCK
  "qc-label-stock": {
    documentId: "qc-label-stock",
    headerFields: incomingHeader(),
    columns: observationColumns(),
    rowMode: printedRows([
      ["SIZE (mm)", "Should be as per P.O."],
      ["TOTAL GSM (GSM)", "Should be as per P.O."],
      ["FACE PAPER (GSM)", "Should be as per P.O.\nTolerance: ± 5 G.S.M / micron"],
      ["ADHESIVE COATING (GSM)", "Should be as per P.O.\nTolerance: ± 2 G.S.M"],
      ["RELEASE LINER (GSM)", "Should be as per P.O.\nTolerance: ± 5 G.S.M"],
      ["TYPE OF ADHESIVE", "Should be as per P.O."],
      ["FACE PAPER THICKNESS (µm)", "Should be as per P.O./ TDS\nTolerance: ± 5 micron"],
      // "RELEAE LINER THICKNES" is the paper's own spelling.
      ["RELEAE LINER THICKNES (µm)", "Should be as per P.O./ TDS\nTolerance: ± 5 micron"],
      ["MIN. LENGTH PER REEL (meters)", "MIN: 1800 meters\nMax: 2400 meters."],
      // The two spaces in "Should  be" are the paper's own.
      ["PEEL ADHESION @ 180 DEGREE", "Should  be as per specification"],
    ]),
    footerFields: lotStatusFooter(),
    specimenSource: blankForm("F-QC-03_Inspection record for Label stock (2).pdf"),
  } satisfies LogSheetLayout,

  // ---- F/QC/04 (01 / 16.02.2022) — INSPECTION RECORD: PAPER CORE (three samples)
  "qc-paper-core": {
    documentId: "qc-paper-core",
    headerFields: incomingHeader(),
    columns: sampleColumns(),
    rowMode: printedRows([
      ["OUTER DIA (mm)", "90 (+2.0 / -1.0)"],
      ["INNER DIA (mm)", "76 (+2.0 / -0.0)"],
      ["THICKNESS (mm)", "7 (± 0.50)"],
      // The doubled opening bracket in "((± 5)" is the paper's own.
      ["LENGTH (mm)", "As per PO ((± 5)"],
      ["MOISTURE CONTENT (%)", "Max 15%"],
      // "BRUSTING STRENGTH" is the paper's own spelling.
      ["BRUSTING STRENGTH (kg/cm²)", "As per supplier COA"],
    ]),
    footerFields: lotStatusFooter(),
    specimenSource: blankForm("F-QC-04_Inspection record for Paper core (2).pdf"),
  } satisfies LogSheetLayout,

  // ---- F/QC/05 (01 / 16.02.2022) — INSPECTION RECORD - PVC / PET FILM
  "qc-pvc-pet-film": {
    documentId: "qc-pvc-pet-film",
    headerFields: incomingHeader(),
    columns: observationColumns(),
    rowMode: printedRows([
      ["SIZE (mm)", "Should be as per P.O. (±2)"],
      // "SHRINKAGE RATIO (%))" is printed with two closing brackets — the paper's own.
      [
        "SHRINKAGE RATIO (%))",
        "Should be as per Specification & P.O.\nPVC BLOWN:\nTD: 50 ± 2 %   MD: 0 TO 6 %\nPVC CAST:\nTD: 60 ± 2 % MD: 0 TO 6 %\nPET:\nTD: 75 ± 2 %   MD: 0 TO 6 %",
      ],
      ["THICKNESS (µm)", "As per P.O Tolerance ± 5%"],
      ["CORONA TREATMENT (Dynes)", "Both side Min. 36 dynes"],
    ]),
    footerFields: lotStatusFooter(),
    specimenSource: blankForm("F-QC-05_Inspection record for PVC+PET Film (2).pdf"),
  } satisfies LogSheetLayout,

  // ---- F/QC/18 (01 / 16.02.2022) — INSPECTION RECORD – OFFSET INK
  "qc-offset-ink": {
    documentId: "qc-offset-ink",
    headerFields: incomingHeader(),
    columns: observationColumns(),
    rowMode: printedRows([
      ["CODE NO.", "As per PO"],
      ["SHADE", "Should match to the master or the specimen Or To Pantone Code No"],
      ["SPECTROMETER SHADE RANGE (dE)", "Delta Value DE should be below 3.0"],
      ["SKINNING", "Very thick top layer skinning & solid particles not acceptable"],
      // The two spaces in "Silver  & Gold" are the paper's own.
      ["FLOW RATE", "Max. 120 mm (Except Silver  & Gold ink)"],
      // The paper prints this specification as two boxes against the one parameter; both
      // lines are kept here in the one specification cell, in the printed order.
      [
        "DRYING TEST",
        "By Thumb Impression : No Inking of the thumb after rubbing the roll up of one big & one small drop of ink dried for 24 hrs.\nOn Glass surface : For Solid Print Immediately drying (with in 1 hrs) For small drops of ink dried for 24hrs",
      ],
      ["ALKALI RESISTANCE (AR TEST)", "If Specified in P.O. then No fading of ink roll up in 2% NaOH Solution for 24hrs"],
      ["SOAP RESISTANCE (SR TEST)", "If Specified in P.O. then No staining of ink roll up to 20 % soap jelly kept for 24hrs"],
      ["LIGHT FASTNESS TEST", "No fading of the ink roll up when exposed to direct sun for 80hrs."],
    ]),
    footerFields: lotStatusFooter(),
    specimenSource: blankForm("F-QC-18_Inspection record for Offset Ink.pdf"),
  } satisfies LogSheetLayout,

  // ---- F/QC/19 (01 / 16.02.2022) — INSPECTION RECORD – DUPLEX BOARD
  "qc-duplex-board": {
    documentId: "qc-duplex-board",
    headerFields: incomingHeader(),
    columns: observationColumns(),
    rowMode: printedRows([
      ["Size (mm)", "As per PO"],
      ["Total GSM (gm/sq.m)", "As per PO"],
      ["BF", "As per PO"],
      ["Moisture (%)", "5.5% – 8.5%"],
      // The paper writes the wire side with an en dash and the felt side with a hyphen.
      ["Cobb Value (gm/sq.m)", "Wire Side: 30–50 GSM\nFelt Side: 30-60 GSM"],
      ["Caliper (microns)", "N.A."],
      ["Bulk Density (gm/ccm)", "N.A."],
    ]),
    footerFields: lotStatusFooter(),
    specimenSource: blankForm("F-QC-19_Inspection record for Duplex board.pdf"),
  } satisfies LogSheetLayout,

  // ---- F/QC/20 (01 / 16.02.2022) — INSPECTION RECORD – KRAFT PAPER & WHITE TOP LINER
  "qc-kraft-paper": {
    documentId: "qc-kraft-paper",
    headerFields: incomingHeader(),
    columns: observationColumns(),
    rowMode: printedRows([
      ["Size (mm)", "As per PO"],
      ["Total GSM (gm/sq.m)", "As per PO"],
      ["BF", "As per PO"],
      ["Moisture (%)", "5.5% – 8.5%"],
      ["Cobb Value (gm/sq.m)", "For Kraft Paper: 30-50\nFor White Top Liner: 25-40"],
      ["Caliper (microns)", "N.A."],
      // The trailing "+…." on both lines is the paper's own.
      ["Bulk Density (gm/ccm)", "For Kraft Paper: 1.3+….\nFor White Top Liner: 1.1 +…."],
    ]),
    footerFields: lotStatusFooter(),
    specimenSource: blankForm("F-QC-20_Inspection record for Kraft Paper.pdf"),
  } satisfies LogSheetLayout,

  // ---- F/QC/21 (00 / 01.04.2023) — INSPECTION RECORD – FLEXO INK
  // The only one of the thirteen whose header box reads "Batch number", and the
  // only one printing the system-generated note under the signatures.
  "qc-flexo-ink": {
    documentId: "qc-flexo-ink",
    instructions: ["This is a system generated document with regulated access. It does not require a signature"],
    headerFields: incomingHeader("Batch number"),
    columns: observationColumns(),
    rowMode: printedRows([
      ["Code no", "As per purchase order"],
      ["Shade", "Should match to the master or the specimen Or To Pantone Code No"],
      // The L / A / B specifications are printed as a dash — the paper's own.
      ["L Value", "-"],
      ["A Value", "-"],
      ["B Value", "-"],
      ["SPECTROMETER SHADE RANGE (dE)", "Delta Value DE should be below 2.0"],
    ]),
    footerFields: lotStatusFooter(),
    specimenSource: blankForm("F-QC-21- Flexo INk.pdf"),
  } satisfies LogSheetLayout,

  // ---- F/QC/21 (01 / 16.02.2022) — INSPECTION RECORD – LAMINATION FILM ADHESIVE
  // Carries the same format number as the flexo ink record above; see the file header.
  "qc-lamination-adhesive-inspection": {
    documentId: "qc-lamination-adhesive-inspection",
    headerFields: incomingHeader(),
    columns: observationColumns(),
    rowMode: printedRows([
      ["SKINNING AND FOREIGN PARTICLES", "skinning of the top layer and foreign particles mixed in the adhesive is not acceptable"],
      ["VISCOSITY (sec)", "Viscosity is 15 to 20 secs, when measured with B4 Ford cup"],
      ["SOLID CONTENT (%)", "Min 40%"],
      ["GLOSS (%)", "Above 85% measured with 60˚ angle with Gloss meter"],
      ["FILM CLARITY", "Clear film After lamination"],
    ]),
    footerFields: lotStatusFooter(),
    specimenSource: blankForm("F-QC-21_Inspection record for Lamination film adhesive.pdf"),
  } satisfies LogSheetLayout,

  // ---- F/QC/22 (01 / 16.02.2022) — INSPECTION RECORD – SIDE PASTING ADHESIVE
  "qc-side-pasting-adhesive": {
    documentId: "qc-side-pasting-adhesive",
    headerFields: incomingHeader(),
    columns: observationColumns(),
    rowMode: printedRows([
      ["SKINNING AND FOREIGN PARTICLES", "skinning of the top layer and foreign particles mixed in the adhesive is not acceptable"],
      ["VISCOSITY (sec)", "Mixed of adhesive with 20% water, viscosity is 30 to 40 secs, when measured with B4 Ford cup"],
      ["SOLID CONTENT (%)", "Min 50"],
    ]),
    footerFields: lotStatusFooter(),
    specimenSource: blankForm("F-QC-22_Inspection record for Side pasting adhesive.pdf"),
  } satisfies LogSheetLayout,

  // ---- F/QC/23 (01 / 16.02.2022) — INSPECTION RECORD – CORRUGATION STARCH POWDER
  "qc-starch-powder": {
    documentId: "qc-starch-powder",
    headerFields: incomingHeader(),
    columns: observationColumns(),
    rowMode: printedRows([
      // "APPERANCE." with its full stop, "CONTAINT" and "VISCOSITY.(SEC)" are the paper's own.
      ["APPERANCE.", "Milky White"],
      ["MOISTURE CONTAINT (%)", "Below 14"],
      ["RATIO", "1:2,1:3,1:4"],
      ["VISCOSITY.(SEC)", "30 ± 10"],
      ["SOLID CONTAINT (%)", "16 to 25"],
    ]),
    footerFields: lotStatusFooter(),
    specimenSource: blankForm("F-QC-23_Inspection record for Corru. starch powder.pdf"),
  } satisfies LogSheetLayout,

  // ---- F/QC/24 (01 / 16.02.2022) — INSPECTION RECORD – SHEET PASTING POWDER
  "qc-sheet-pasting-powder": {
    documentId: "qc-sheet-pasting-powder",
    headerFields: incomingHeader(),
    columns: observationColumns(),
    rowMode: printedRows([
      // "APPERANCE.", "Cremes to Brown Color", "CONTAINT" and "VISCOSITY.(SEC)" are the paper's own.
      ["APPERANCE.", "Cremes to Brown Color"],
      ["MOISTURE CONTAINT (%)", "Below 14"],
      ["RATIO", "1:2,1:3,1:4,1:5,1:6"],
      ["VISCOSITY.(SEC)", "25 ± 60"],
      ["SOLID CONTAINT (%)", "16 to 30"],
    ]),
    footerFields: lotStatusFooter(),
    specimenSource: blankForm("F-QC-24_Inspection record for Corru.sheet pasting powder.pdf"),
  } satisfies LogSheetLayout,
};
