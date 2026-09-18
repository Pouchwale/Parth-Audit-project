import type { LogColumn, LogHeaderField, LogSheetLayout } from "../../types";

// THE THREE CERTIFICATES OF ANALYSIS (REQUIREMENTS §57) — the Quality Control
// formats supplied on 18-Sep-2026, reproduced as log-sheet layouts:
//
//   qc-coa-label       F/QC/06  Certificate of Analysis [COA] For Label
//   qc-coa-sleeve      F/QC/07  Certificate of Analysis [COA] For Shrink Sleeves
//   qc-coa-corrugated  F/QC/25  Certificate of Analysis [COA] For CORRUGATED BOXES
//
// SOURCE FILES, all supplied 18-Sep-2026:
//   F-QC-06_Certificate of analysis (COA)-Label (2).pdf   — supplied FILLED IN
//   F-QC-07_Certificate of analysis (COA)-Sleeve.pdf      — supplied FILLED IN
//   F-QC-25_COA Corrugated.pdf                            — supplied BLANK
//
// REVISIONS: no revision number or revision date came with these three sheets
// (unlike the incoming-inspection records, which print "01 / 16.02.2022"), so
// none is recorded here. One for the MR to confirm against the controlled copy.
//
// HOW THE PAPER'S BLOCKS MAP ONTO header / grid / footer. These are
// certificates, not registers: they are printed as a stack of titled blocks of
// boxes, and only one of those blocks genuinely repeats. So each certificate is
// reproduced as one grid and two sets of boxes, and this is the mapping to
// check against the scan:
//
//   F/QC/06 (label)
//     headerFields  the certificate's own boxes at the top (Production Order
//                   No. … Tested Size Width(mm)) followed by the whole LABEL
//                   STOCK block. On the paper LABEL STOCK is a small table read
//                   Material × Face Material / Adhesive / Release Liner; here
//                   each of its twelve boxes is one field, headed the way the
//                   paper heads it ("Face Material — Required", "Adhesive —
//                   Type Required", and so on).
//     grid          the PRINTING block's colour table, one colour per line.
//     footerFields  everything printed after that table: the rest of the
//                   PRINTING block (shade, text matter, bar code), then the
//                   whole COATING block, then the whole FINISHING block, then
//                   the retest date.
//     referenceTable  the printed TOLERANCE block.
//   F/QC/07 (shrink sleeves)  the same, with SLEEVE FILM in place of LABEL
//                   STOCK and the sleeve's own COATING and FINISHING boxes.
//   F/QC/25 (corrugated boxes)  printed as a numbered list of fourteen lines,
//                   so that list IS the grid; the three boxes of its heading
//                   are the headerFields and the two signatures the footer.
//
// THE PRINTING BLOCK IS TURNED. The paper prints the ten colours as ten
// columns numbered 1 to 10, with two rows under them — "Given By Client" and
// "Color Shade Verified". A grid reads down the page, not across it, so each
// colour is ONE LINE here: the printed number in a fixed "No. of Colors"
// column and the two entries beside it, ten lines whether or not the job uses
// ten colours. Nothing is added and nothing is dropped; only the direction of
// reading changes.
//
// F/QC/25's LINES ARE NOT THE RENDERER'S Sr. No. The certificate numbers its
// lines 1 to 14 but breaks 7 into 7.1 TOP PAPER, 7.2 PLAIN PAPER and 7.3 FLUTE
// PAPER, which a running count cannot produce. The printed numbering is
// therefore a fixed column of its own, "Sr.No.", and the renderer's own Sr. No.
// runs beside it.
//
// F/QC/25's FOUR PAPER COLUMNS. Three of the fourteen lines (7.1, 7.2, 7.3)
// carry four columns of their own — Specified  GSM / Tested GSM / BF / Grade of
// Paper — where every other line carries a single Observation box spanning
// them. A grid has one set of columns for all of its lines, so all five entry
// columns are present on every line; on the paper's terms only Observation is
// filled on the eleven ordinary lines and only the four paper columns on 7.1,
// 7.2 and 7.3.
//
// NEITHER COA IS SIGNED. Both certificates print "THIS IS A SYSTEM GENERATED
// DOCUMENT.    IT DOES NOT REQUIRE A SIGNATURE.", so neither layout has a
// signature field; F/QC/25, which is signed, has its two.
//
// THE TWO SUPPLIED CERTIFICATES ARE ALSO ON FILE as real records — the specimen
// header and specimen lines below are exported so that data/seed/qcCoaRecords.ts
// files the very same cells and the page and the record cannot drift apart.
// F/QC/25 was supplied blank, so it has no specimen: a box the form leaves
// blank stays blank.

// ---------------------------------------------------------------------------
// Printed notes, shared by the two COA certificates (both print all of these).

const GRADE_SCALE_NOTE = "All Grades are given on a scale of 5";
const SUPPLIER_COA_NOTE = "Where testing is not possible result may be reported based on supplier's COA";
// The run of spaces between the two sentences is the certificate's own.
const SYSTEM_GENERATED_NOTE = "THIS IS A SYSTEM GENERATED DOCUMENT.    IT DOES NOT REQUIRE A SIGNATURE.";
// The paper prints "This material should be retested on <date> before usage.",
// the date written in per certificate; the label of the retest field below is
// that sentence up to the blank.
const RETEST_NOTE = 'The retest sentence is printed "This material should be retested on … before usage." — the date is written in per certificate and is the last box below the grid.';
const PRINTING_TURN_NOTE =
  'PRINTING: the certificate prints the ten colours across the page as columns numbered 1 to 10, with "Given By Client" and "Color Shade Verified" on two lines under them. A grid reads down the page, so each colour is one line here — the printed number, then the two entries.';

const field = (key: string, label: string, width = 170): LogHeaderField => ({ key, label, type: "text", width });
/** A specification / client detail that repeats from the previous certificate of the same job. */
const carried = (key: string, label: string, width = 170): LogHeaderField => ({
  key,
  label,
  type: "text",
  width,
  autoFill: { carryForward: true },
});
const retestField = (): LogHeaderField => ({ key: "retestOn", label: "This material should be retested on", type: "date", width: 200 });

// ---------------------------------------------------------------------------
// The PRINTING block's colour table — the only repeating block on either COA.

const COLOUR_COLUMNS: LogColumn[] = [
  { key: "colorNo", label: "No. of Colors", type: "text", fixed: true, width: 110 },
  { key: "givenByClient", label: "Given By Client", type: "text", width: 200 },
  { key: "colorShadeVerified", label: "Color Shade Verified", type: "text", width: 200 },
];

/** The ten numbers the certificate prints over the colour table. */
const COLOUR_NUMBERS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

const COLOUR_ROWS: Record<string, string>[] = COLOUR_NUMBERS.map((colorNo) => ({ colorNo }));

/** The colours written on a supplied certificate, padded out to the ten printed lines. */
function colourLines(printed: [string, string][]): Record<string, string>[] {
  return COLOUR_NUMBERS.map((colorNo, i) => ({
    colorNo,
    givenByClient: printed[i] ? printed[i][0] : "",
    colorShadeVerified: printed[i] ? printed[i][1] : "",
  }));
}

// ---------------------------------------------------------------------------
// F/QC/06 — Certificate of Analysis [COA] For Label
//
// The supplied certificate: production order 33858, Dr. fixit 301 URP pidicrete
// 1kg F & B Label Rev3 for Weener Empire Plastic P Ltd.[Masat], COA dated
// 04/01/2022, six colours, retest 03/07/2022. The Delivery No., the Bar Code
// Grade and the Bar Code Remarks are blank as issued and stay blank.

export const COA_LABEL_SPECIMEN_HEADER: Record<string, string> = {
  productionOrderNo: "33858",
  deliveryNo: "",
  coaDate: "2022-01-04",
  clientName: "Weener Empire Plastic P Ltd.[Masat]",
  gp3Code: "FGLA8400",
  clientItemCode1: "PMLB0070",
  clientItemCode2: "1463000707006001",
  productName: "Dr. fixit 301 URP pidicrete 1kg F & B Label Rev3",
  specifiedLength: "70",
  specifiedWidth: "115",
  testedLength: "70",
  testedWidth: "115",
  faceMaterialRequired: "80 GSM /Microns",
  adhesiveRequired: "27 GSM",
  releaseLinerRequired: "60 GSM",
  faceMaterialTested: "80 GSM/Microns",
  adhesiveTested: "26 GSM",
  releaseLinerTested: "59 GSM",
  faceMaterialTypeRequired: "Chromo",
  adhesiveTypeRequired: "HotMelt",
  releaseLinerTypeRequired: "Glassine",
  faceMaterialObserved: "Chromo",
  adhesiveObserved: "Rubber Based (Hot Melt)",
  releaseLinerObserved: "Glassine Paper",
  shadeMatchGrade: "4",
  remarksForShade: "Shade found to be a satisfactory match against sample",
  textMatterVerification: "Pass",
  remarksForTextVerification: "Text matter verified to be matching with control samples",
  barCodeGrade: "",
  barCodeRemarks: "",
  coatingDone: "Gloss UV",
  minGlossAqueous: "35%",
  minGlossUv: "72%",
  minGlossLamination: "75%",
  achievedGloss: "84.00%",
  scuffTest: "2 lbs, 100 rounds Okay",
  finishingQualityGrade: "4",
  dieCuttingType: "Rectangle with radius corner",
  dieCutting: "Okay",
  rewindingQuality: "Okay",
  emboss: "Not Applicable",
  packingQuality: "Okay",
  foilStamping: "Not Applicable",
  slittingQuality: "Okay",
  remarksForFinishingQuality: "Finishing Quality Found to Be Satisfactory",
  finalInspection: "Passed",
  overAllQualityRemarks: "Overall quality found to be satisfactory",
  retestOn: "2022-07-03",
};

export const COA_LABEL_SPECIMEN_ROWS: Record<string, string>[] = colourLines([
  ["Cyan", "OK"],
  ["Magenta", "OK"],
  ["Yellow", "OK"],
  ["Black", "OK"],
  ["Blue", "OK"],
  ["P.151C", "OK"],
]);

// ---------------------------------------------------------------------------
// F/QC/07 — Certificate of Analysis [COA] For Shrink Sleeves
//
// The supplied certificate: production order 33814, Narogi Churana 100g Sleeve
// Rev-1 for The Unjha Pharmacy, five colours. TWO THINGS TO RECORD FROM THIS
// SCAN: the COA Date and the retest date are both blank as issued, and the word
// "White" appears loose beside the fifth colour in the extracted text while the
// printed table shows five colours — so only the five printed colours are
// seeded and the loose "White" is left for the MR to confirm. The Delivery No.
// and both Client Item Codes are blank as issued.

export const COA_SLEEVE_SPECIMEN_HEADER: Record<string, string> = {
  productionOrderNo: "33814",
  deliveryNo: "",
  coaDate: "",
  clientName: "The Unjha Pharmacy",
  gp3Code: "FGSL0395",
  clientItemCode1: "",
  clientItemCode2: "",
  productName: "Narogi Churana 100g Sleeve Rev-1",
  specifiedCutLength: "152.40",
  specifiedOpenWidth: "168.00",
  testedCutLength: "152",
  testedOpenWidth: "168",
  thicknessRequired: "40",
  shrinkageRatioRequired: "50",
  typeRequired: "Centroiid Plastopack PVC Blown 40 mic 200 mm",
  thicknessTested: "40",
  shrinkageRatioTested: "49",
  typeTested: "PVC Blown",
  shadeMatchGrade: "4",
  remarksForShade: "Shade found to be a satisfactory match against sample",
  textMatterVerification: "4",
  remarksForTextVerification: "Text matter verified to be matching with control samples",
  barCodeGrade: "4",
  barCodeRemarks: "Bar Code Scanned and Quality Found to be Satisfactory",
  coatingDone: "Matt UV",
  aqueous: "35%",
  uv: "72%",
  lamination: "75%",
  achievedGloss: "50%",
  scuffTest: "2 lbs, 100 rounds Okay",
  finishingQualityGrade: "4",
  perforationQuality: "Not Applicable",
  rewindingQuality: "Not Applicable",
  holdingGlueQuality: "Okay",
  packingQuality: "Okay",
  whiteOpacity: "Not Applicable",
  slittingQuality: "Okay",
  remarksForFinishingQuality: "Finishing Quality Found to Be Satisfactory",
  finalInspection: "Passed",
  overAllQualityRemarks: "Overall quality found to be satisfactory",
  retestOn: "",
};

export const COA_SLEEVE_SPECIMEN_ROWS: Record<string, string>[] = colourLines([
  ["Cyan", "OK"],
  ["Magenta", "OK"],
  ["Yellow", "OK"],
  ["Black", "OK"],
  ["Gold", "OK"],
]);

// ---------------------------------------------------------------------------
// F/QC/25 — Certificate of Analysis [COA] For CORRUGATED BOXES
//
// The fourteen printed lines, with the certificate's own numbering and its own
// spacing ("JOB  NAME", "PRINTING  Details" are the paper's double spaces).

const CORRUGATED_LINES: [string, string][] = [
  ["1", "PARTY NAME"],
  ["2", "JOB  NAME"], // the paper's own double space
  ["3", "BOX SIZE"],
  ["4", "BOX B.S."],
  ["5", "BOX C.S."],
  ["6", "BOX W.T."],
  ["7", "Material Specification"],
  ["7.1", "TOP PAPER"],
  ["7.2", "PLAIN PAPER"],
  ["7.3", "FLUTE PAPER"],
  ["8", "BOX PLY"],
  ["9", "PRINTING  Details"], // the paper's own double space
  ["10", "BOX STYLE"],
  ["11", "STYLE OF FLUTE"],
  ["12", "PUNCTURE"],
  ["13", "ECT"],
  ["14", "Rub Testing Report"],
];

const CORRUGATED_COLUMNS: LogColumn[] = [
  { key: "srNo", label: "Sr.No.", type: "text", fixed: true, width: 70 },
  { key: "description", label: "Description", type: "text", fixed: true, width: 220 },
  { key: "observation", label: "Observation", type: "text", width: 260 },
  { key: "specifiedGsm", label: "Specified  GSM", type: "text", width: 130 }, // the paper's own double space
  { key: "testedGsm", label: "Tested GSM", type: "text", width: 120 },
  { key: "bf", label: "BF", type: "text", width: 90 },
  { key: "gradeOfPaper", label: "Grade of Paper", type: "text", width: 150 },
];

// ---------------------------------------------------------------------------

export const QC_COA_LAYOUTS: Record<string, LogSheetLayout> = {
  // ---- F/QC/06 — Certificate of Analysis [COA] For Label ----
  "qc-coa-label": {
    documentId: "qc-coa-label",
    instructions: [
      "Certificate of Analysis [COA] For Label. The certificate's own boxes and the LABEL STOCK block are above the grid; the PRINTING block's colours are the grid; the rest of PRINTING, the COATING block, the FINISHING block and the retest date are below it.",
      PRINTING_TURN_NOTE,
      GRADE_SCALE_NOTE, // printed on the certificate
      SUPPLIER_COA_NOTE, // printed on the certificate
      RETEST_NOTE,
      SYSTEM_GENERATED_NOTE, // printed on the certificate
    ],
    headerFields: [
      { key: "productionOrderNo", label: "Production Order No.", type: "text", width: 160 },
      { key: "deliveryNo", label: "Delivery No.", type: "text", width: 150 },
      { key: "coaDate", label: "COA Date", type: "date", width: 150 },
      carried("clientName", "Client Name", 260),
      carried("gp3Code", "GP3 Code", 150),
      carried("clientItemCode1", "Client Item Code 1", 180),
      carried("clientItemCode2", "Client Item Code 2", 200),
      carried("productName", "Product Name", 320),
      carried("specifiedLength", "Client's Specified Size Length(mm)", 190),
      carried("specifiedWidth", "Client's Specified Size Width(mm)", 190),
      field("testedLength", "Tested Size Length(mm)", 180),
      field("testedWidth", "Tested Size Width(mm)", 180),
      // LABEL STOCK — on the paper a small table read Material × Face Material
      // / Adhesive / Release Liner; here one field per printed box.
      carried("faceMaterialRequired", "Face Material — Required", 180),
      carried("adhesiveRequired", "Adhesive — Required", 180),
      carried("releaseLinerRequired", "Release Liner — Required", 180),
      field("faceMaterialTested", "Face Material — Tested", 180),
      field("adhesiveTested", "Adhesive — Tested", 180),
      field("releaseLinerTested", "Release Liner — Tested", 180),
      carried("faceMaterialTypeRequired", "Face Material — Type Required", 190),
      carried("adhesiveTypeRequired", "Adhesive — Type Required", 190),
      carried("releaseLinerTypeRequired", "Release Liner — Type Required", 190),
      field("faceMaterialObserved", "Face Material — Observed", 190),
      field("adhesiveObserved", "Adhesive — Observed", 200),
      field("releaseLinerObserved", "Release Liner — Observed", 200),
    ],
    columns: COLOUR_COLUMNS,
    rowMode: { kind: "fixedRows", rows: COLOUR_ROWS },
    footerFields: [
      // The rest of the PRINTING block, printed under the colour table.
      field("shadeMatchGrade", "Shade Match Grade", 150),
      field("remarksForShade", "Remarks For Shade :", 320), // the paper's own spaced colon
      field("textMatterVerification", "Text  Matter Verification With Specified Art Work", 260), // the paper's own double space in "Text  Matter"
      field("remarksForTextVerification", "Remarks For Text Verification", 320),
      field("barCodeGrade", "Bar Code Grade", 150),
      field("barCodeRemarks", "Bar Code Remarks", 320),
      // COATING
      field("coatingDone", "Coating Done :", 180), // the paper's own spaced colon
      carried("minGlossAqueous", "Minimum Gloss Required at 60° — Aqueous", 190),
      carried("minGlossUv", "Minimum Gloss Required at 60° — U.V", 190),
      carried("minGlossLamination", "Minimum Gloss Required at 60° — Lamination", 190),
      field("achievedGloss", "Achieved Gloss", 160),
      field("scuffTest", "Scuff Test", 220),
      // FINISHING
      field("finishingQualityGrade", "Finishing Quality Grade", 170),
      field("dieCuttingType", "Die Cutting Type", 220),
      field("dieCutting", "Die Cutting", 160),
      field("rewindingQuality", "Rewinding Quality", 170),
      field("emboss", "Emboss", 160),
      field("packingQuality", "Packing Quality", 170),
      field("foilStamping", "Foil Stamping", 170),
      field("slittingQuality", "Slitting Quality", 170),
      field("remarksForFinishingQuality", "Remarks For Finishing Quality", 320),
      field("finalInspection", "Final Inspection", 170),
      field("overAllQualityRemarks", "Over All Quality Remarks", 320),
      retestField(),
    ],
    referenceTables: [
      {
        title: "TOLERANCE",
        columns: ["Field", "Length", "Width", "Face Material", "Adhesive", "Release Liner"],
        rows: [
          ["+", "2 mm", "2 mm", "10 %", "2 GSM", "5 %"],
          ["-", "2 mm", "2 mm", "10 %", "2 GSM", "5 %"],
        ],
      },
    ],
    specimenHeader: COA_LABEL_SPECIMEN_HEADER,
    specimenRows: COA_LABEL_SPECIMEN_ROWS,
    specimenSource: "F-QC-06_Certificate of analysis (COA)-Label (2).pdf — F/QC/06, the certificate of 04/01/2022 for production order 33858",
  } satisfies LogSheetLayout,

  // ---- F/QC/07 — Certificate of Analysis [COA] For Shrink Sleeves ----
  "qc-coa-sleeve": {
    documentId: "qc-coa-sleeve",
    instructions: [
      "Certificate of Analysis [COA] For Shrink Sleeves. The certificate's own boxes and the SLEEVE FILM block are above the grid; the PRINTING block's colours are the grid; the rest of PRINTING, the COATING block, the FINISHING block and the retest date are below it.",
      PRINTING_TURN_NOTE,
      GRADE_SCALE_NOTE, // printed on the certificate
      SUPPLIER_COA_NOTE, // printed on the certificate
      // Printed on this certificate only, and printed as one sentence with no
      // space after the full stop — the paper's own.
      "Shrink Sleeves are heat sensitive.Material is valid only if stored under 30 degrees Celsius.",
      RETEST_NOTE,
      SYSTEM_GENERATED_NOTE, // printed on the certificate
    ],
    headerFields: [
      { key: "productionOrderNo", label: "Production Order No.", type: "text", width: 160 },
      { key: "deliveryNo", label: "Delivery No.", type: "text", width: 150 },
      { key: "coaDate", label: "COA Date", type: "date", width: 150 },
      carried("clientName", "Client Name", 260),
      carried("gp3Code", "GP3 Code", 150),
      carried("clientItemCode1", "Client Item Code 1", 180),
      carried("clientItemCode2", "Client Item Code 2", 200),
      carried("productName", "Product Name", 320),
      carried("specifiedCutLength", "Client's Specified Size Cut Length(mm)", 200),
      carried("specifiedOpenWidth", "Client's Specified Size Open Width(mm)", 200),
      field("testedCutLength", "Tested Size Cut Length(mm)", 190),
      field("testedOpenWidth", "Tested Size Open Width(mm)", 190),
      // SLEEVE FILM
      carried("thicknessRequired", "Thickness(Microns) Required", 190),
      carried("shrinkageRatioRequired", "Shrinkage Ratio (%) Required", 190),
      carried("typeRequired", "Type Required", 320),
      field("thicknessTested", "Thickness(Microns) Tested", 190),
      field("shrinkageRatioTested", "Shrinkage Ratio (%) Tested", 190),
      field("typeTested", "Type Tested", 240),
    ],
    columns: COLOUR_COLUMNS,
    rowMode: { kind: "fixedRows", rows: COLOUR_ROWS },
    footerFields: [
      // The rest of the PRINTING block, printed under the colour table.
      field("shadeMatchGrade", "Shade Match Grade", 150),
      field("remarksForShade", "Remarks For Shade :", 320), // the paper's own spaced colon
      field("textMatterVerification", "Text  Matter Verification", 220), // the paper's own double space in "Text  Matter"
      field("remarksForTextVerification", "Remarks For Text Verification", 320),
      field("barCodeGrade", "Bar Code Grade", 150),
      field("barCodeRemarks", "Bar Code Remarks", 320),
      // COATING
      field("coatingDone", "Coating Done :", 180), // the paper's own spaced colon
      carried("aqueous", "Aqueous", 150),
      carried("uv", "U.V", 150),
      carried("lamination", "Lamination", 150),
      field("achievedGloss", "Achieved Gloss", 160),
      field("scuffTest", "Scuff Test", 220),
      field("finishingQualityGrade", "Finishing Quality Grade", 170),
      // FINISHING
      field("perforationQuality", "Perforation Quality", 170),
      field("rewindingQuality", "Rewinding Quality", 170),
      field("holdingGlueQuality", "Holding Glue Quality", 170),
      field("packingQuality", "Packing Quality", 170),
      field("whiteOpacity", "White Opacity", 170),
      field("slittingQuality", "Slitting Quality", 170),
      field("remarksForFinishingQuality", "Remarks For Finishing Quality", 320),
      field("finalInspection", "Final Inspection", 170),
      field("overAllQualityRemarks", "Over All Quality Remarks", 320),
      retestField(),
    ],
    referenceTables: [
      {
        title: "TOLERANCE",
        // "Shrinkage Ration" is the certificate's own spelling.
        columns: ["Field", "Cut Length", "Open Width", "Shrinkage Ration", "Microns"],
        rows: [
          ["+", "2 mm", "2 mm", "5 %", "10 %"],
          ["-", "2 mm", "2 mm", "5 %", "10 %"],
        ],
      },
    ],
    specimenHeader: COA_SLEEVE_SPECIMEN_HEADER,
    specimenRows: COA_SLEEVE_SPECIMEN_ROWS,
    specimenSource: "F-QC-07_Certificate of analysis (COA)-Sleeve.pdf — F/QC/07, the certificate for production order 33814 (the certificate carries no date)",
  } satisfies LogSheetLayout,

  // ---- F/QC/25 — Certificate of Analysis [COA] For CORRUGATED BOXES ----
  "qc-coa-corrugated": {
    documentId: "qc-coa-corrugated",
    instructions: [
      // The certificate's own heading block, its own spellings kept ("GUJRAT",
      // "DEDIASAN", "ASSURENCE").
      "GUJRAT PRINT PACK PUB.LTD 308/9, GIDC DEDIASAN MEHSANA. GUJARAT. — DEPT:QUALITY ASSURENCE (2009 EDITION) — DOC.NO. QA-IP-TRFCBA-011-00-01-09-18 — FG(CO) =FINISH GOODS (CORRUGATION)",
      "CBA: CORRUGATED BOX ANALYSIS",
      "The certificate's fourteen numbered lines are printed on the form, 7 breaking into 7.1 TOP PAPER, 7.2 PLAIN PAPER and 7.3 FLUTE PAPER. Those three lines are the ones with the four paper columns — Specified  GSM, Tested GSM, BF and Grade of Paper; every other line has the single Observation box.",
    ],
    headerFields: [
      { key: "date", label: "Date", type: "date", width: 150 },
      { key: "oid", label: "OID :-", type: "text", width: 160 }, // the paper's own "OID :-"
      { key: "jobCode", label: "Job Code:", type: "text", width: 160, autoFill: { carryForward: true } },
    ],
    columns: CORRUGATED_COLUMNS,
    rowMode: { kind: "fixedRows", rows: CORRUGATED_LINES.map(([srNo, description]) => ({ srNo, description })) },
    footerFields: [
      { key: "testingBy", label: "Testing By (QA Inspector)", type: "text", width: 220, autoFill: { sign: true } },
      { key: "signBy", label: "Sign By (QA Manager)", type: "text", width: 220, autoFill: { sign: true } },
    ],
    // Supplied blank — no box on the form carries a value, so there is no
    // specimenHeader and there are no specimenRows.
    specimenSource: "F-QC-25_COA Corrugated.pdf — F/QC/25, the blank form as supplied 18-Sep-2026",
  } satisfies LogSheetLayout,
};
