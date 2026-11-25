// THE BOXES AND COLUMNS OF THE FORMATS ADDED FROM THE OWNER'S GOOGLE DRIVE (REQUIREMENTS §332). Each is a register: a line per
// entry, as many as the day needs. F/STR/02A, 02B and 02C are F/STR/02's own register (its nine columns, its rules, its keys)
// for one tool each, as the owner split it on 01.01.2026; F/PRD/11 and F/PRD/30 are drawn as his papers
// (data/seed/drivePapers332.ts), whose ruled lines are these columns; F-PRD-17's ink formulas are kept in his workbook of
// nine sheets, and a new formulation is entered here under its nine headings.

import type { LogSheetLayout } from "../../types";
import { STORE_LAYOUTS } from "./storeLayouts";

const SHARP = STORE_LAYOUTS["str-sharp-metal-objects"];

/** F/STR/02's register for one tool: its columns, rules and keys, its sample lines naming that tool. */
const toolRegister = (documentId: string, tool: string, file: string): LogSheetLayout => ({
  ...SHARP,
  documentId,
  paper: "landscape",
  specimenRows: (SHARP.specimenRows ?? []).map((r) => ({ ...r, sharpToolDescription: tool })),
  originalPages: undefined,
  specimenSource: `${file} (the owner's Google Drive, BRCGS 25-26 / Store; 00/01.01.2026), the blank format; the lines are sample issues to be checked`,
});

const REPLACED = "Nos. of new blades replaced on Machine";

export const DRIVE_LAYOUTS_332: Record<string, LogSheetLayout> = {
  "str-scissor-issuance": toolRegister("str-scissor-issuance", "Scissor", "F-STR-02A_SCISSOR BLADE ISSUANCE (NEW) & RETURN (OLD) RECORD.docx"),
  "str-tio2-blade-issuance": toolRegister("str-tio2-blade-issuance", "TiO2 coated blade", "F-STR-02B_TiO2 COATED BLADE ISSUANCE (NEW) & RETURN (OLD) RECORD.docx"),
  "str-safety-cutter-issuance": toolRegister("str-safety-cutter-issuance", "Safety cutter blade", "F-STR-02C_SAFETY CUTTER & BLADE ISSUANCE (NEW) & RETURN (OLD) RECORD.docx"),

  // F/PRD/11 SURGICAL BLADE ( USED ON SLITTING MACHINE BLADE HOLDER) MONITORING RECORD (00/01.12.21): the stock of 20 blades, a
  // line per change; its headings in the workbook's own words.
  "prd-surgical-blade": {
    documentId: "prd-surgical-blade",
    paper: "landscape",
    instructions: ["LOOSE BLADES IN STOCK INCLUDING - INSTALLED ON MACHINE + LOOSE OK BLADE + LOOSE DISCARDED BLADE) SHALL BE ALWAYS MAINTAINED 20 NOS"],
    headerFields: [],
    columns: [
      { key: "date", label: "Date", type: "date", required: true },
      { key: "openingOkStock", label: "Opening stock of OK Blade", type: "number", decimals: 0 },
      { key: "newIssuedFromStore", label: "New Blades Issued from Store", type: "number", decimals: 0 },
      { key: "totalStock", label: "Total Stock", type: "number", decimals: 0 },
      { key: "replacedShift", label: "SHIFT", type: "text", group: REPLACED },
      { key: "replacedNewBladeNos", label: "New Blade nos.", type: "number", decimals: 0, group: REPLACED },
      { key: "replacedOperator", label: "Machine Operator NAME", type: "text", group: REPLACED },
      { key: "closingOkStock", label: "Closing stock of OK Blade", type: "number", decimals: 0 },
      { key: "closingDiscarded", label: "Closing Stock of Discarded blades", type: "number", decimals: 0 },
      { key: "discardedReturned", label: "Nos. of discarded blades returned to Store", type: "number", decimals: 0 },
      { key: "verifiedBy", label: "Varified & Checked by - Produciton Manager", type: "text" },
    ],
    rowMode: { kind: "free", minRows: 1, typicalRows: 2 },
    // The workbook's own example lines (03.02.2022 to 07.02.2022), the check left for the production manager who signs it.
    specimenRows: [
      { date: "2022-02-03", openingOkStock: 20, newIssuedFromStore: 0, totalStock: 20, replacedShift: "1", replacedNewBladeNos: 0, replacedOperator: "Laxman", closingOkStock: 20, closingDiscarded: 0, discardedReturned: 0, verifiedBy: "" },
      { date: "2022-02-04", openingOkStock: 20, newIssuedFromStore: 0, totalStock: 20, replacedShift: "2", replacedNewBladeNos: 2, replacedOperator: "Ramesh", closingOkStock: 18, closingDiscarded: 2, discardedReturned: 0, verifiedBy: "" },
    ],
    originalPages: [{ src: "/source/fprd11-surgical-blade-p1.jpg", caption: "F/PRD/11 (00/01.12.21) - Surgical Blade Monitoring Record, the workbook as supplied, its example lines of February 2022" }],
    specimenSource: "F-PRD-11_Surgical Machine Blade Change Record.xlsx (the owner's Google Drive, BRCGS 25-26 / Formats / 6 Production), F/PRD/11 (00/01.12.21): the workbook's own example lines",
  },

  // F/PRD/30 SHRINK SLEEVE ADHESIVE MIXING RATIO RECORD (00/17.08.2026): a line per batch mixed.
  "prd-ss-adhesive-mixing": {
    documentId: "prd-ss-adhesive-mixing",
    paper: "portrait",
    instructions: [
      "Standard Mixing ratio : 1:2:2 (20% 1.4 Dixolen + 40% Cyclohexane + 40% THF)",
      "Ex. : for 5kg batch (1kg 1.4 Dixolen + 2kg Cyclohexane + 2kg THF)",
    ],
    headerFields: [],
    columns: [
      { key: "date", label: "Date", type: "date", required: true },
      { key: "time", label: "TIME", type: "time" },
      { key: "batchMixId", label: "Batch / Mix ID", type: "text", required: true },
      { key: "totalBatchQty", label: "Total Batch Qty. (kg)", type: "number", decimals: 2 },
      { key: "dixolenQty", label: "1.4 Dixolen Qty (kg)", type: "number", decimals: 2 },
      { key: "cyclohexaneQty", label: "Cyclohexane Qty (kg)", type: "number", decimals: 2 },
      { key: "thfQty", label: "THF Qty (kg)", type: "number", decimals: 2 },
      { key: "remarks", label: "Remarks", type: "text" },
      { key: "preparedBySign", label: "Prepared by sign", type: "text" },
      { key: "verifiedBySign", label: "Verified by sign", type: "text" },
    ],
    rowMode: { kind: "free", minRows: 1, typicalRows: 3 },
    // The batch the sheet itself works out (5 kg: 1 + 2 + 2).
    specimenRows: [
      { date: "2026-09-01", time: "09:30", batchMixId: "SS-GLUE-01", totalBatchQty: 5, dixolenQty: 1, cyclohexaneQty: 2, thfQty: 2, remarks: "", preparedBySign: "", verifiedBySign: "" },
    ],
    originalPages: [{ src: "/source/fprd30-ss-adhesive-mixing-p1.jpg", caption: "F-PRD-30 (00/17.08.2026) - Shrink Sleeve Adhesive Mixing Ratio Record, the workbook as supplied (it prints F/PRD/31)" }],
    specimenSource: "F-PRD-30 -SS_Adhesive_Mixing__Ratio_Record.xlsx (the owner's Google Drive, BRCGS 25-26 / Formats), 00/17.08.2026: the 5 kg batch its own example works out",
  },

  // F-PRD-17 INK FORMULATION RECORD: the headings of the owner's workbook (its LABEL, SLEEVE, POUCH ... sheets), a line per ink
  // of a formula; the sheet it belongs to chosen above.
  "prd-ink-formulation": {
    documentId: "prd-ink-formulation",
    headerFields: [
      { key: "sheet", label: "SHEET", type: "select", options: ["LABEL", "SLEEVE", "POUCH", "HIMALAYA", "NIVEA", "LOW MIGRATION", "P&G", "LED", "UV"] },
    ],
    columns: [
      { key: "bucketNo", label: "BUCKET NO", type: "text", required: true, width: 110 },
      { key: "pantone", label: "PANTONE", type: "text", width: 120 },
      { key: "formula", label: "FORMULA", type: "text", required: true, width: 150 },
      { key: "grams", label: "GRAMS", type: "number", decimals: 0, required: true, width: 90 },
      { key: "partyName", label: "PARTY NAME", type: "text", width: 170 },
      { key: "fglaCode", label: "FGLA CODE", type: "text", width: 120 },
      { key: "batch", label: "BATCH", type: "text", width: 110 },
      { key: "date", label: "DATE", type: "date", width: 110 },
    ],
    rowMode: { kind: "free", minRows: 1, typicalRows: 4 },
    // The workbook's first formula (its LABEL sheet: bucket OR-061, four inks).
    specimenHeader: { sheet: "LABEL" },
    specimenRows: [
      { bucketNo: "OR-061", pantone: "SP PARTY", formula: "WARM RED", grams: 450, partyName: "", fglaCode: "", batch: "", date: "" },
      { bucketNo: "OR-061", pantone: "SP PARTY", formula: "YELLOW", grams: 275, partyName: "", fglaCode: "", batch: "", date: "" },
      { bucketNo: "OR-061", pantone: "SP PARTY", formula: "BLACK", grams: 8, partyName: "", fglaCode: "", batch: "", date: "" },
      { bucketNo: "OR-061", pantone: "SP PARTY", formula: "ORANGE", grams: 75, partyName: "", fglaCode: "", batch: "", date: "" },
    ],
    specimenSource: "F-PRD-17- Ink formulation.xlsx (the owner's Google Drive, BRCGS 25-26 / Formats): its LABEL sheet's first formula",
  },
};
