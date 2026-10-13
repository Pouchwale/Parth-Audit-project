import type { LogColumn, LogHeaderField, LogSheetLayout, ReferenceTable } from "../../types";
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
//                     Code and the two Client Item Codes, Product Name; the
//                     Specified Size table ("Specified Size" over Length(mm)
//                     and Width(mm), on Client's Specified Size and Tested
//                     Size); then LABEL STOCK over its table, "Material" over
//                     Face Material, Adhesive and Release Liner on the rows
//                     Required, Tested, Type Required, Observed — box for box.
//     the grid        PRINTING, the colour table, printed across (below).
//     below the grid  the rest of the PRINTING block two to a line; COATING
//                     over its table ("Coating Done :" in the corner, the
//                     Minimum Gloss line under Aqueous, U.V, Lamination,
//                     Achieved Gloss and Scuff Test); FINISHING; then the
//                     printed TOLERANCE table, the two bullet notes and the
//                     retest sentence with its date — in that order, as
//                     printed (LogHeaderField printedAbove, tableAbove,
//                     boxesPerLine, boxTable: engine/paperLayout.ts).
//     at the foot     "THIS IS A SYSTEM GENERATED DOCUMENT.    IT DOES NOT
//                     REQUIRE A SIGNATURE." and the corporate office (notesAtFoot).
//   F/QC/07 (shrink sleeves)  the same, with Cut Length(mm) and Open Width(mm)
//                     in its Specified Size table, SLEEVE FILM's table
//                     (Thickness(Microns), Shrinkage Ratio (%), Type on Required
//                     and Tested) in place of LABEL STOCK, its own FINISHING
//                     boxes, and its heat sentence above the retest sentence.
//   F/QC/25 (corrugated boxes)  printed as a numbered list of fourteen lines,
//                     so that list IS the grid; its letterhead above it, as the
//                     paper's three cells, its "Date:" alone at the right, then
//                     OID :- and Job Code: side by side; the two signatures side
//                     by side below, "(QA Inspector)" and "(QA Manager)" under them.
//
// AND, FROM A THIRD LOOK (part 4): the headings in the paper's own letters
// ("Length(mm)", not "LENGTH(MM)": headingsAsPrinted), the retest date inside its
// sentence (inSentence), "Coating Done :" beside its value in the table's corner.
//
// THE PRINTING BLOCK IS PRINTED ACROSS, AS THE PAPER PRINTS IT. The paper
// prints the ten colours as ten columns numbered 1 to 10, with two rows under
// them — "Given By Client" and "Color Shade Verified". The record keeps each
// colour as ONE LINE (the printed number in a fixed "No. of Colors" column and
// the two entries beside it, ten lines whether or not the job uses ten
// colours), as it always has, so no record changes shape; the sheet and its
// print turn it back across the page under the block's heading PRINTING
// (gridAcross, REQUIREMENTS §111). Before 13-Oct-2026 the sheet drew it turned,
// a colour to a line.
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
// them. A record has one set of columns for all of its lines, so all five entry
// columns are held on every line; on the paper's terms only Observation is
// filled on the eleven ordinary lines and only the four paper columns on 7.1,
// 7.2 and 7.3. Since part 4 the sheet draws them so (answerAcross): the one box
// across the four on every other line, the four's headings on line 7 where the
// paper prints them, and OID :- and Job Code: on the grid's top line.
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
/**
 * A tested box judged against the client's or the required figure by the certificate's TOLERANCE table (REQUIREMENTS
 * §111 part 6, rule 2): outside it, the box is highlighted (engine/printedBands.ts). `percent`: the table's figure is a
 * percentage of the required one ("10 %" of the face material's GSM). The table itself is printed as before.
 */
const judged = (f: LogHeaderField, of: string, tolerance: number, percent = false): LogHeaderField => ({
  ...f,
  within: { of, plus: tolerance, minus: tolerance, ...(percent ? { percent: true as const } : {}) },
});
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
/** A box that opens a table of boxes the paper prints (boxTable): the table's headings, and the heading printed over it. */
const opensTable = (f: LogHeaderField, boxTable: NonNullable<LogHeaderField["boxTable"]>, printedAbove?: string[]): LogHeaderField => ({
  ...f,
  boxTable,
  ...(printedAbove ? { printedAbove } : {}),
});
/** COATING's table on both certificates: "Coating Done :" in its corner, then the Minimum Gloss line under its five headings. */
const MIN_GLOSS_TABLE: NonNullable<LogHeaderField["boxTable"]> = {
  cornerBox: true,
  columns: ["Aqueous", "U.V", "Lamination", "Achieved Gloss", "Scuff Test"],
  rows: ["Minimum Gloss Required at 60°"],
};

/**
 * The retest sentence, "This material should be retested on 03/07/2022 before usage.", with the date
 * written in per certificate — under the TOLERANCE table and the notes printed above it.
 */
const retestField = (notesAbove: string[]): LogHeaderField => ({
  key: "retestOn",
  label: "This material should be retested on",
  printedLabel: "This material should be retested on … before usage.",
  // The date written inside the sentence, on one line, as printed (REQUIREMENTS §111, part 4).
  inSentence: { before: "This material should be retested on", after: "before usage." },
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

/**
 * F/QC/25's letterhead, as printed: three cells side by side — the company's (its name as the owner gave it,
 * COMPANY.name, then its address), the department's and the document number's — each broken into lines where
 * the paper breaks it, with no title and no heading row (REQUIREMENTS §111, part 4). The certificate's own
 * spellings are kept ("DEDIASAN", "ASSURENCE") — all but the company's name, which is printed as the owner gave
 * it on 02-Oct-2026, not as the certificate abbreviates it ("GUJRAT PRINT PACK PUB.LTD"). Before part 4 the
 * three were one line joined by dashes of DCRS's own.
 */
export const CORRUGATED_LETTERHEAD: ReferenceTable = {
  title: "Letterhead",
  untitled: true,
  columns: [],
  rows: [
    [
      `${COMPANY.name}\n308/9, GIDC DEDIASAN\nMEHSANA. GUJARAT.`,
      "DEPT:QUALITY\nASSURENCE\n(2009 EDITION)",
      "DOC.NO.\nQA-IP-TRFCBA-011-00-01-09-18\nFG(CO) =FINISH GOODS\n(CORRUGATION)",
    ],
  ],
};
/** The line printed under the letterhead (at its right on the paper). */
export const CORRUGATED_ANALYSIS_LINE = "CBA: CORRUGATED BOX ANALYSIS";
/** The heading line DCRS printed above the grid before part 4 — the letterhead's three cells joined by dashes — and the line under it. */
const CORRUGATED_HEADING_BEFORE = [
  `${COMPANY.name} 308/9, GIDC DEDIASAN MEHSANA. GUJARAT. — DEPT:QUALITY ASSURENCE (2009 EDITION) — DOC.NO. QA-IP-TRFCBA-011-00-01-09-18 — FG(CO) =FINISH GOODS (CORRUGATION)`,
  CORRUGATED_ANALYSIS_LINE,
];

// ---------------------------------------------------------------------------

export const QC_COA_LAYOUTS: Record<string, LogSheetLayout> = {
  // ---- F/QC/06 — Certificate of Analysis [COA] For Label ----
  "qc-coa-label": {
    documentId: "qc-coa-label",
    // The certificate prints its own numbers 1 to 10 over the colour table (REQUIREMENTS §102),
    // across the page, a colour to a column (gridAcross, §111).
    ownLineNumbers: true,
    gridAcross: true,
    // "Length(mm)", "Face Material", "No. of Colors" in the paper's own letters, not the sheet's capitals (§111, part 4).
    headingsAsPrinted: true,
    instructions: COA_LETTERHEAD,
    // Production Order No., Delivery No. and COA Date : on the paper's first line.
    headerColumns: 3,
    headerFields: [
      ...certificateHead(),
      // The paper's table: "Specified Size" over "Length(mm)" and "Width(mm)", on Client's Specified Size and Tested Size.
      opensTable(carried("specifiedLength", "Client's Specified Size Length(mm)", 190), {
        corner: "Specified Size",
        columns: ["Length(mm)", "Width(mm)"],
        rows: ["Client's Specified Size", "Tested Size"],
      }),
      carried("specifiedWidth", "Client's Specified Size Width(mm)", 190),
      // Judged by the TOLERANCE table below: Length and Width + 2 mm / - 2 mm.
      judged(field("testedLength", "Tested Size Length(mm)", 180), "specifiedLength", 2),
      judged(field("testedWidth", "Tested Size Width(mm)", 180), "specifiedWidth", 2),
      // LABEL STOCK — the paper's table, Material × Face Material / Adhesive /
      // Release Liner on its four rows Required / Tested / Type Required /
      // Observed; one box per printed cell, each named by its column and row.
      opensTable(
        carried("faceMaterialRequired", "Face Material — Required", 180),
        { corner: "Material", columns: ["Face Material", "Adhesive", "Release Liner"], rows: ["Required", "Tested", "Type Required", "Observed"] },
        ["LABEL STOCK"]
      ),
      carried("adhesiveRequired", "Adhesive — Required", 180),
      carried("releaseLinerRequired", "Release Liner — Required", 180),
      // Judged by the TOLERANCE table: Face Material 10 %, Adhesive 2 GSM, Release Liner 5 %.
      judged(field("faceMaterialTested", "Face Material — Tested", 180), "faceMaterialRequired", 10, true),
      judged(field("adhesiveTested", "Adhesive — Tested", 180), "adhesiveRequired", 2),
      judged(field("releaseLinerTested", "Release Liner — Tested", 180), "releaseLinerRequired", 5, true),
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
      // COATING, the paper's table: "Coating Done :" in its corner (the paper's own spaced colon), then the
      // Minimum Gloss Required at 60° under Aqueous, U.V and Lamination, with Achieved Gloss and Scuff Test.
      opensTable(field("coatingDone", "Coating Done :", 180), MIN_GLOSS_TABLE, ["COATING"]),
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
    // The certificate prints its own numbers 1 to 10 over the colour table (REQUIREMENTS §102),
    // across the page, a colour to a column (gridAcross, §111).
    ownLineNumbers: true,
    gridAcross: true,
    // "Length(mm)", "Face Material", "No. of Colors" in the paper's own letters, not the sheet's capitals (§111, part 4).
    headingsAsPrinted: true,
    instructions: COA_LETTERHEAD,
    headerColumns: 3,
    headerFields: [
      ...certificateHead(),
      // The paper's table: "Specified Size" over "Cut Length(mm)" and "Open Width(mm)", on Client's Specified Size and Tested Size.
      opensTable(carried("specifiedCutLength", "Client's Specified Size Cut Length(mm)", 200), {
        corner: "Specified Size",
        columns: ["Cut Length(mm)", "Open Width(mm)"],
        rows: ["Client's Specified Size", "Tested Size"],
      }),
      carried("specifiedOpenWidth", "Client's Specified Size Open Width(mm)", 200),
      // Judged by the TOLERANCE table below: Cut Length and Open Width + 2 mm / - 2 mm.
      judged(field("testedCutLength", "Tested Size Cut Length(mm)", 190), "specifiedCutLength", 2),
      judged(field("testedOpenWidth", "Tested Size Open Width(mm)", 190), "specifiedOpenWidth", 2),
      // SLEEVE FILM — the paper's table, Material × Thickness(Microns) / Shrinkage Ratio (%) / Type, on Required and Tested.
      opensTable(
        carried("thicknessRequired", "Thickness(Microns) Required", 190),
        { corner: "Material", columns: ["Thickness(Microns)", "Shrinkage Ratio (%)", "Type"], rows: ["Required", "Tested"] },
        ["SLEEVE FILM"]
      ),
      carried("shrinkageRatioRequired", "Shrinkage Ratio (%) Required", 190),
      carried("typeRequired", "Type Required", 320),
      // Microns 10 %. (Its "Shrinkage Ration 5 %" does not say whether of the ratio or in points of it: the inspector's.)
      judged(field("thicknessTested", "Thickness(Microns) Tested", 190), "thicknessRequired", 10, true),
      field("shrinkageRatioTested", "Shrinkage Ratio (%) Tested", 190),
      field("typeTested", "Type Tested", 240),
    ],
    columns: COLOUR_COLUMNS,
    rowMode: { kind: "fixedRows", rows: COLOUR_ROWS },
    footerFields: [
      // The rest of the PRINTING block, printed under the colour table.
      ...printingBelowTable("Text  Matter Verification"), // the paper's own double space in "Text  Matter"
      // COATING, the paper's table as on the label certificate: "Coating Done :" in its corner, the Minimum Gloss line under it.
      opensTable(field("coatingDone", "Coating Done :", 180), MIN_GLOSS_TABLE, ["COATING"]),
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
    // "Sr.No.", "Specified  GSM", "Grade of Paper" in the paper's own letters (§111, part 4).
    headingsAsPrinted: true,
    // "Date:" alone at the right above the grid, then OID :- and Job Code: side by side on the grid's top line.
    headerColumns: 2,
    headerFields: [
      // "Date:" as printed, above the grid's right-hand end — under the letterhead's three cells and the line under them.
      { key: "date", label: "Date:", type: "date", width: 150, paperColumn: 2, tableAbove: CORRUGATED_LETTERHEAD.title, printedAbove: [CORRUGATED_ANALYSIS_LINE] },
      // The paper's own "OID :-" and "Job Code:", printed on the grid's top line over the answers (part 4).
      { key: "oid", label: "OID :-", type: "text", width: 160, inGridHead: true },
      { key: "jobCode", label: "Job Code:", type: "text", width: 160, autoFill: { carryForward: true }, inGridHead: true },
    ],
    columns: CORRUGATED_COLUMNS,
    rowMode: { kind: "fixedRows", rows: CORRUGATED_LINES.map(([srNo, description]) => ({ srNo, description })) },
    // One answer box a line across the paper's four columns, but on 7.1, 7.2 and 7.3, which are written in them;
    // their headings printed on line 7, "Material Specification", not over the grid (part 4).
    answerAcross: {
      answer: "observation",
      across: ["specifiedGsm", "testedGsm", "bf", "gradeOfPaper"],
      headingLine: CORRUGATED_LINES.findIndex(([n]) => n === "7"),
      lines: CORRUGATED_LINES.flatMap(([n], i) => (n.startsWith("7.") ? [i] : [])),
    },
    referenceTables: [CORRUGATED_LETTERHEAD],
    footerFields: [
      // "Testing By" over "(QA Inspector)" on the left, "Sign By" over "(QA Manager)" on the right: the paper's words
      // over and under the space each is signed in (printedLabel, printedBelow, §111 part 4); the names stay.
      { key: "testingBy", label: "Testing By (QA Inspector)", printedLabel: "Testing By", printedBelow: "(QA Inspector)", type: "text", width: 220, autoFill: { sign: true }, boxesPerLine: 2 },
      { key: "signBy", label: "Sign By (QA Manager)", printedLabel: "Sign By", printedBelow: "(QA Manager)", type: "text", width: 220, autoFill: { sign: true } },
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
    // The letterhead drawn as its three cells, and the line under it above "Date:", since part 4.
    ...CORRUGATED_HEADING_BEFORE,
  ],
};
