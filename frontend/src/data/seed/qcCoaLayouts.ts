import type { LogColumn, LogHeaderField, LogSheetLayout } from "../../types";
import { COMPANY } from "./masterData";

// THE THREE CERTIFICATES OF ANALYSIS (REQUIREMENTS §57) — the Quality Control
// formats supplied on 18-Sep-2026, reproduced as log-sheet layouts:
//
//   qc-coa-label       F/QC/06  Certificate of Analysis [COA] For Label
//   qc-coa-sleeve      F/QC/07  Certificate of Analysis [COA] For Shrink Sleeves
//   qc-coa-corrugated  F/QC/25  Certificate of Analysis [COA] For CORRUGATED BOXES
//
// SOURCE FILES, all supplied 18-Sep-2026 and sent again on 13-Oct-2026
// (source-documents/qc-originals-2026-10-13/):
//   F-QC-06_Certificate of analysis (COA)-Label (2).pdf   — supplied FILLED IN
//   F-QC-07_Certificate of analysis (COA)-Sleeve.pdf      — supplied FILLED IN
//   F-QC-25_COA Corrugated.pdf                            — supplied BLANK
//
// REVISIONS: no revision number or revision date came with these three sheets
// (unlike the incoming-inspection records, which print "01 / 16.02.2022"), so
// none is recorded here. One for the MR to confirm against the controlled copy.
//
// EXACTLY AS THE PAPER (REQUIREMENTS §111, 13-Oct-2026). A certificate is a
// stack of titled blocks of boxes, and every block is drawn where the paper
// prints it, under the paper's own heading, with nothing of DCRS's own on the
// sheet or its print:
//
//   F/QC/06 (label)
//     above the grid  the letterhead's three lines under the company's name;
//                     the certificate's own boxes three to a line (Production
//                     Order No., Delivery No., COA Date :), Client Name, GP3
//                     Code and the two Client Item Codes, Product Name, the
//                     Specified Size block two to a line; then LABEL STOCK,
//                     three to a line (Face Material, Adhesive, Release Liner)
//                     on its four lines Required, Tested, Type Required,
//                     Observed — the paper's small table, box for box.
//     the grid        PRINTING, the colour table (below).
//     below the grid  the rest of the PRINTING block two to a line; COATING;
//                     FINISHING; then the printed TOLERANCE table, the two
//                     bullet notes and the retest sentence with its date —
//                     in that order, as printed (LogHeaderField printedAbove,
//                     tableAbove, boxesPerLine: engine/paperLayout.ts).
//     at the foot     "THIS IS A SYSTEM GENERATED DOCUMENT.    IT DOES NOT
//                     REQUIRE A SIGNATURE." and the corporate office (notesAtFoot).
//   F/QC/07 (shrink sleeves)  the same, with SLEEVE FILM (Thickness(Microns),
//                     Shrinkage Ratio (%), Type on Required and Tested) in place
//                     of LABEL STOCK, its own FINISHING boxes, and its heat
//                     sentence above the retest sentence.
//   F/QC/25 (corrugated boxes)  printed as a numbered list of fourteen lines,
//                     so that list IS the grid; its heading block above it, the
//                     three boxes of its heading (Date:, OID :-, Job Code:) and
//                     the two signatures side by side below.
//
// THE PRINTING BLOCK IS TURNED. The paper prints the ten colours as ten
// columns numbered 1 to 10, with two rows under them — "Given By Client" and
// "Color Shade Verified". A grid reads down the page, not across it, so each
// colour is ONE LINE here: the printed number in a fixed "No. of Colors"
// column and the two entries beside it, ten lines whether or not the job uses
// ten colours, all three under the block's own heading PRINTING. Nothing is
// added and nothing is dropped; only the direction of reading changes, and the
// records already written keep their lines.
//
// F/QC/25's LINES ARE NOT THE RENDERER'S Sr. No. The certificate numbers its
// lines 1 to 14 but breaks 7 into 7.1 TOP PAPER, 7.2 PLAIN PAPER and 7.3 FLUTE
// PAPER, which a running count cannot produce. The printed numbering is
// therefore a fixed column of its own, "Sr.No.", and the sheet draws no Sr. No.
// of its own beside it (ownLineNumbers, REQUIREMENTS §102): one number per line.
// The paper heads neither the descriptions nor the observations, so neither
// heading is printed here (printedLabel ""); Specified  GSM and Tested GSM stand
// under the paper's GSM.
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
// Printed words, shared by the two COA certificates (both print all of these).

/** The letterhead's three lines under the company's name (the name itself is the page's header block). */
export const COA_LETTERHEAD = [
  "308,309,232 A & B,G.I.D.C. Estate,At Dediyasan,Mehsana - 384002 Gujarat India",
  // The Contact Number is printed blank.
  "Contact Number :  , Email : info@gujprintpack.com",
  "GSTIN :  24AAACG7781P1Z1, IEC CODE : 0894007882, PAN : AAACG7781P",
];
// The two bullet notes printed under the TOLERANCE table.
export const GRADE_SCALE_NOTE = "All Grades are given on a scale of 5";
export const SUPPLIER_COA_NOTE = "Where testing is not possible result may be reported based on supplier's COA";
const bullet = (line: string) => `● ${line}`;
// The run of spaces between the two sentences is the certificate's own.
export const SYSTEM_GENERATED_NOTE = "THIS IS A SYSTEM GENERATED DOCUMENT.    IT DOES NOT REQUIRE A SIGNATURE.";
/** Printed on the shrink sleeve certificate only, as one sentence with no space after the full stop — the paper's own. */
export const HEAT_SENSITIVE_NOTE = "Shrink Sleeves are heat sensitive.Material is valid only if stored under 30 degrees Celsius.";
/** The corporate office printed at the foot of both certificates, beside the ISO 9001 mark. */
export const CORPORATE_OFFICE = [
  "Corporate Office :",
  "201, Harsh Avenue, Navjivan Press Road, Nr. Income Tax Under Pass, Ashram Road, Ahmedabad-380 014.",
  "Gujarat, INDIA. Phone : +91 79 27545314. FAX : +91 79 27545914 E-mail : marketing@gujprintpack.com",
];
/** What both certificates print at the foot, after every box. */
const COA_FOOT = [SYSTEM_GENERATED_NOTE, ...CORPORATE_OFFICE];

const field = (key: string, label: string, width = 170): LogHeaderField => ({ key, label, type: "text", width });
/** A specification / client detail that repeats from the previous certificate of the same job. */
const carried = (key: string, label: string, width = 170): LogHeaderField => ({
  key,
  label,
  type: "text",
  width,
  autoFill: { carryForward: true },
});
/** A box that starts a group of the paper's own (engine/paperLayout.ts boxGroups): its heading, and how many boxes stand to a line. */
const startsGroup = (f: LogHeaderField, boxesPerLine: number, printedAbove?: string[]): LogHeaderField => ({ ...f, boxesPerLine, ...(printedAbove ? { printedAbove } : {}) });

/**
 * The retest sentence, "This material should be retested on 03/07/2022 before usage.", with the date
 * written in per certificate — under the TOLERANCE table and the notes printed above it.
 */
const retestField = (notesAbove: string[]): LogHeaderField => ({
  key: "retestOn",
  label: "This material should be retested on",
  printedLabel: "This material should be retested on … before usage.",
  type: "date",
  width: 200,
  tableAbove: "TOLERANCE",
  printedAbove: notesAbove,
  boxesPerLine: 1,
});

/** The certificate's own boxes at its head, as the paper lines them up. */
const certificateHead = (): LogHeaderField[] => [
  { key: "productionOrderNo", label: "Production Order No.", type: "text", width: 160 },
  { key: "deliveryNo", label: "Delivery No.", type: "text", width: 150 },
  // "COA Date :" with its spaced colon, as printed; the box keeps its name.
  { key: "coaDate", label: "COA Date :", type: "date", width: 150 },
  startsGroup(carried("clientName", "Client Name", 260), 1),
  startsGroup(carried("gp3Code", "GP3 Code", 150), 3),
  carried("clientItemCode1", "Client Item Code 1", 180),
  carried("clientItemCode2", "Client Item Code 2", 200),
  startsGroup(carried("productName", "Product Name", 320), 1),
];

// ---------------------------------------------------------------------------
// The PRINTING block's colour table — the only repeating block on either COA.

const COLOUR_COLUMNS: LogColumn[] = [
  { key: "colorNo", label: "No. of Colors", type: "text", fixed: true, width: 110, group: "PRINTING" },
  { key: "givenByClient", label: "Given By Client", type: "text", width: 200, group: "PRINTING" },
  { key: "colorShadeVerified", label: "Color Shade Verified", type: "text", width: 200, group: "PRINTING" },
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

/** The rest of the PRINTING block, under the colour table: two boxes to a line, as printed. */
const printingBelowTable = (textMatterLabel: string): LogHeaderField[] => [
  startsGroup(field("shadeMatchGrade", "Shade Match Grade", 150), 2),
  field("remarksForShade", "Remarks For Shade :", 320), // the paper's own spaced colon
  field("textMatterVerification", textMatterLabel, 260),
  field("remarksForTextVerification", "Remarks For Text Verification", 320),
  field("barCodeGrade", "Bar Code Grade", 150),
  field("barCodeRemarks", "Bar Code Remarks", 320),
];

/** The three closing boxes of the FINISHING block, each the width of the sheet. */
const finishingRemarks = (): LogHeaderField[] => [
  startsGroup(field("remarksForFinishingQuality", "Remarks For Finishing Quality", 320), 1),
  field("finalInspection", "Final Inspection", 170),
  field("overAllQualityRemarks", "Over All Quality Remarks", 320),
];

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
// printed colour table shows five colours — so only the five printed colours are
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
  // The paper heads neither of these two columns (REQUIREMENTS §111); their names are what Mitra and a record's history go by.
  { key: "description", label: "Description", printedLabel: "", type: "text", fixed: true, width: 220 },
  { key: "observation", label: "Observation", printedLabel: "", type: "text", width: 260 },
  { key: "specifiedGsm", label: "Specified  GSM", type: "text", width: 130, group: "GSM" }, // the paper's own double space
  { key: "testedGsm", label: "Tested GSM", type: "text", width: 120, group: "GSM" },
  { key: "bf", label: "BF", type: "text", width: 90 },
  { key: "gradeOfPaper", label: "Grade of Paper", type: "text", width: 150 },
];

/** F/QC/25's heading block, as printed: the company's cell (its name as the owner gave it, COMPANY.name), the department's and the document number's, then the line under them. */
export const CORRUGATED_HEADING = [
  // The certificate's own spellings kept ("DEDIASAN", "ASSURENCE") — all but the company's name,
  // which is printed as the owner gave it on 02-Oct-2026 (COMPANY.name), not as the certificate abbreviates it.
  `${COMPANY.name} 308/9, GIDC DEDIASAN MEHSANA. GUJARAT. — DEPT:QUALITY ASSURENCE (2009 EDITION) — DOC.NO. QA-IP-TRFCBA-011-00-01-09-18 — FG(CO) =FINISH GOODS (CORRUGATION)`,
  "CBA: CORRUGATED BOX ANALYSIS",
];

// ---------------------------------------------------------------------------

export const QC_COA_LAYOUTS: Record<string, LogSheetLayout> = {
  // ---- F/QC/06 — Certificate of Analysis [COA] For Label ----
  "qc-coa-label": {
    documentId: "qc-coa-label",
    // The certificate prints its own numbers 1 to 10 over the colour table (REQUIREMENTS §102).
    ownLineNumbers: true,
    instructions: COA_LETTERHEAD,
    // Production Order No., Delivery No. and COA Date : on the paper's first line.
    headerColumns: 3,
    headerFields: [
      ...certificateHead(),
      // "Specified Size" over "Length(mm)" and "Width(mm)", on Client's Specified Size and Tested Size.
      startsGroup(carried("specifiedLength", "Client's Specified Size Length(mm)", 190), 2, ["Specified Size"]),
      carried("specifiedWidth", "Client's Specified Size Width(mm)", 190),
      field("testedLength", "Tested Size Length(mm)", 180),
      field("testedWidth", "Tested Size Width(mm)", 180),
      // LABEL STOCK — on the paper a small table read Material × Face Material
      // / Adhesive / Release Liner; here one box per printed cell, three to a
      // line, so the four lines Required / Tested / Type Required / Observed
      // stand as the table's four rows.
      startsGroup(carried("faceMaterialRequired", "Face Material — Required", 180), 3, ["LABEL STOCK"]),
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
      ...printingBelowTable("Text  Matter Verification With Specified Art Work"), // the paper's own double space in "Text  Matter"
      // COATING: "Coating Done :" and the Minimum Gloss Required at 60° under Aqueous, U.V and Lamination, then Achieved Gloss and Scuff Test.
      startsGroup(field("coatingDone", "Coating Done :", 180), 3, ["COATING"]), // the paper's own spaced colon
      carried("minGlossAqueous", "Minimum Gloss Required at 60° — Aqueous", 190),
      carried("minGlossUv", "Minimum Gloss Required at 60° — U.V", 190),
      carried("minGlossLamination", "Minimum Gloss Required at 60° — Lamination", 190),
      field("achievedGloss", "Achieved Gloss", 160),
      field("scuffTest", "Scuff Test", 220),
      // FINISHING, two to a line as printed, then its three remarks each the width of the sheet.
      startsGroup(field("finishingQualityGrade", "Finishing Quality Grade", 170), 2, ["FINISHING"]),
      field("dieCuttingType", "Die Cutting Type", 220),
      field("dieCutting", "Die Cutting", 160),
      field("rewindingQuality", "Rewinding Quality", 170),
      field("emboss", "Emboss", 160),
      field("packingQuality", "Packing Quality", 170),
      field("foilStamping", "Foil Stamping", 170),
      field("slittingQuality", "Slitting Quality", 170),
      ...finishingRemarks(),
      // TOLERANCE, the two notes, then the retest sentence.
      retestField([bullet(GRADE_SCALE_NOTE), bullet(SUPPLIER_COA_NOTE)]),
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
    notesAtFoot: COA_FOOT,
    specimenHeader: COA_LABEL_SPECIMEN_HEADER,
    specimenRows: COA_LABEL_SPECIMEN_ROWS,
    specimenSource: "F-QC-06_Certificate of analysis (COA)-Label (2).pdf — F/QC/06, the certificate of 04/01/2022 for production order 33858",
  } satisfies LogSheetLayout,

  // ---- F/QC/07 — Certificate of Analysis [COA] For Shrink Sleeves ----
  "qc-coa-sleeve": {
    documentId: "qc-coa-sleeve",
    // The certificate prints its own numbers 1 to 10 over the colour table (REQUIREMENTS §102).
    ownLineNumbers: true,
    instructions: COA_LETTERHEAD,
    headerColumns: 3,
    headerFields: [
      ...certificateHead(),
      // "Specified Size" over "Cut Length(mm)" and "Open Width(mm)", on Client's Specified Size and Tested Size.
      startsGroup(carried("specifiedCutLength", "Client's Specified Size Cut Length(mm)", 200), 2, ["Specified Size"]),
      carried("specifiedOpenWidth", "Client's Specified Size Open Width(mm)", 200),
      field("testedCutLength", "Tested Size Cut Length(mm)", 190),
      field("testedOpenWidth", "Tested Size Open Width(mm)", 190),
      // SLEEVE FILM — Material × Thickness(Microns) / Shrinkage Ratio (%) / Type, on Required and Tested.
      startsGroup(carried("thicknessRequired", "Thickness(Microns) Required", 190), 3, ["SLEEVE FILM"]),
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
      ...printingBelowTable("Text  Matter Verification"), // the paper's own double space in "Text  Matter"
      // COATING, as on the label certificate: the three under "Minimum Gloss Required at 60°".
      startsGroup(field("coatingDone", "Coating Done :", 180), 3, ["COATING"]), // the paper's own spaced colon
      carried("aqueous", "Minimum Gloss Required at 60° — Aqueous", 190),
      carried("uv", "Minimum Gloss Required at 60° — U.V", 190),
      carried("lamination", "Minimum Gloss Required at 60° — Lamination", 190),
      field("achievedGloss", "Achieved Gloss", 160),
      field("scuffTest", "Scuff Test", 220),
      // FINISHING: the grade alone on its line, then the six two to a line, then the three remarks.
      startsGroup(field("finishingQualityGrade", "Finishing Quality Grade", 170), 1, ["FINISHING"]),
      startsGroup(field("perforationQuality", "Perforation Quality", 170), 2),
      field("rewindingQuality", "Rewinding Quality", 170),
      field("holdingGlueQuality", "Holding Glue Quality", 170),
      field("packingQuality", "Packing Quality", 170),
      field("whiteOpacity", "White Opacity", 170),
      field("slittingQuality", "Slitting Quality", 170),
      ...finishingRemarks(),
      // TOLERANCE, the two notes and the heat sentence, then the retest sentence.
      retestField([bullet(GRADE_SCALE_NOTE), bullet(SUPPLIER_COA_NOTE), HEAT_SENSITIVE_NOTE]),
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
    notesAtFoot: COA_FOOT,
    specimenHeader: COA_SLEEVE_SPECIMEN_HEADER,
    specimenRows: COA_SLEEVE_SPECIMEN_ROWS,
    specimenSource: "F-QC-07_Certificate of analysis (COA)-Sleeve.pdf — F/QC/07, the certificate for production order 33814 (the certificate carries no date)",
  } satisfies LogSheetLayout,

  // ---- F/QC/25 — Certificate of Analysis [COA] For CORRUGATED BOXES ----
  "qc-coa-corrugated": {
    documentId: "qc-coa-corrugated",
    ownLineNumbers: true,
    instructions: CORRUGATED_HEADING,
    headerFields: [
      { key: "date", label: "Date:", type: "date", width: 150 }, // "Date:" as printed, above the grid's right-hand end
      { key: "oid", label: "OID :-", type: "text", width: 160 }, // the paper's own "OID :-"
      { key: "jobCode", label: "Job Code:", type: "text", width: 160, autoFill: { carryForward: true } },
    ],
    columns: CORRUGATED_COLUMNS,
    rowMode: { kind: "fixedRows", rows: CORRUGATED_LINES.map(([srNo, description]) => ({ srNo, description })) },
    footerFields: [
      // "Testing By" over "(QA Inspector)" on the left, "Sign By" over "(QA Manager)" on the right.
      { key: "testingBy", label: "Testing By (QA Inspector)", type: "text", width: 220, autoFill: { sign: true }, boxesPerLine: 2 },
      { key: "signBy", label: "Sign By (QA Manager)", type: "text", width: 220, autoFill: { sign: true } },
    ],
    // Supplied blank — no box on the form carries a value, so there is no
    // specimenHeader and there are no specimenRows.
    specimenSource: "F-QC-25_COA Corrugated.pdf — F/QC/25, the blank form as supplied 18-Sep-2026",
  } satisfies LogSheetLayout,
};

/**
 * THE LINES DCRS USED TO PRINT ABOVE THESE CERTIFICATES' GRIDS (REQUIREMENTS §111): its own explanations, and the
 * paper's notes now printed where the paper prints them. A format the plant edited before §111 still holds them, and
 * loses them (data/seed/logSheetLayouts.ts asThePaper).
 */
export const COA_WITHDRAWN_LINES: Record<string, string[]> = {
  "qc-coa-label": [
    "Certificate of Analysis [COA] For Label. The certificate's own boxes and the LABEL STOCK block are above the grid; the PRINTING block's colours are the grid; the rest of PRINTING, the COATING block, the FINISHING block and the retest date are below it.",
    'PRINTING: the certificate prints the ten colours across the page as columns numbered 1 to 10, with "Given By Client" and "Color Shade Verified" on two lines under them. A grid reads down the page, so each colour is one line here — the printed number, then the two entries.',
    GRADE_SCALE_NOTE,
    SUPPLIER_COA_NOTE,
    'The retest sentence is printed "This material should be retested on … before usage." — the date is written in per certificate and is the last box below the grid.',
    SYSTEM_GENERATED_NOTE,
  ],
  "qc-coa-sleeve": [
    "Certificate of Analysis [COA] For Shrink Sleeves. The certificate's own boxes and the SLEEVE FILM block are above the grid; the PRINTING block's colours are the grid; the rest of PRINTING, the COATING block, the FINISHING block and the retest date are below it.",
    'PRINTING: the certificate prints the ten colours across the page as columns numbered 1 to 10, with "Given By Client" and "Color Shade Verified" on two lines under them. A grid reads down the page, so each colour is one line here — the printed number, then the two entries.',
    GRADE_SCALE_NOTE,
    SUPPLIER_COA_NOTE,
    HEAT_SENSITIVE_NOTE,
    'The retest sentence is printed "This material should be retested on … before usage." — the date is written in per certificate and is the last box below the grid.',
    SYSTEM_GENERATED_NOTE,
  ],
  "qc-coa-corrugated": [
    "The certificate's fourteen numbered lines are printed on the form, 7 breaking into 7.1 TOP PAPER, 7.2 PLAIN PAPER and 7.3 FLUTE PAPER. Those three lines are the ones with the four paper columns — Specified  GSM, Tested GSM, BF and Grade of Paper; every other line has the single Observation box.",
  ],
};
