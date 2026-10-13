import type { LogColumn, LogHeaderField, LogSheetLayout } from "../../types";
import { HR_LAYOUTS } from "./hrLayouts";
import { CALIBRATION_PROCEDURE, QC_CALIBRATION_LAYOUTS } from "./qcCalibrationLayouts";
import { FLEXO_INK_SYSTEM_NOTE, QC_INCOMING_LAYOUTS, signatureBoxes } from "./qcIncomingLayouts";
import { FQC13_WITHDRAWN_LINES, QC_IN_PROCESS_LAYOUTS } from "./qcInProcessLayouts";
import { LINE_CLEARANCE_TITLE_LINES, QC_LINE_CLEARANCE_LAYOUTS } from "./qcLineClearanceLayouts";
import { QC_GUJARATI_LINE_CLEARANCE_LAYOUTS } from "./qcGujaratiLineClearanceLayouts";
import { PRINTING_AIDS_WITHDRAWN_LINE, QC_REGISTER_LAYOUTS, TOLERANCE_CARD_NOTE } from "./qcRegisterLayouts";
import { COA_WITHDRAWN_LINES, QC_COA_LAYOUTS } from "./qcCoaLayouts";
import { QC_REPORT_LAYOUTS, QC_REPORT_WITHDRAWN_LINES } from "./qcReportLayouts";
import { QC_TEST_RELIABILITY_LAYOUTS } from "./qcTestReliabilityLayouts";
import { PURCHASE_LAYOUTS } from "./purchaseLayouts";
import { DISPATCH_LAYOUTS } from "./dispatchLayouts";
import { STORE_LAYOUTS } from "./storeLayouts";
import { MAINTENANCE_LAYOUTS } from "./maintenanceLayouts";
import { SYS_DOCUMENT_CONTROL_LAYOUTS } from "./sysDocumentControlLayouts";
import { SYS_MANAGEMENT_REVIEW_LAYOUTS } from "./sysManagementReviewLayouts";
import { SYS_INTERNAL_AUDIT_LAYOUTS } from "./sysInternalAuditLayouts";
import { SYS_HARA_TRACEABILITY_LAYOUTS } from "./sysHaraTraceabilityLayouts";
import { MKT_LAYOUTS } from "./mktLayouts";
import { PRODUCTION_LAYOUTS } from "./productionLayouts";
import { formatEditFor } from "../formatEdits";
import { withoutLineNumber } from "../../engine/lineNumbers";

// Grid layouts for every "log-sheet" document, transcribed from the
// photographed specimens in the uploaded "Audit documents.zip" (WhatsApp
// images dated 2026-09-07). Column headings and instruction text are kept
// verbatim; specimen rows are the actual handwritten values (best-effort
// reads of handwriting are flagged in docs/REQUIREMENTS.md).

const HOURLY_SLOTS = [
  "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00",
  "18:00", "19:00", "20:00", "21:00", "22:00", "23:00", "00:00", "01:00", "02:00",
  "03:00", "04:00", "05:00", "06:00", "07:00", "08:00",
];

export const LOG_SHEET_LAYOUTS: Record<string, LogSheetLayout> = {
  // ---- F-QC-30 — Lamination Adhesive Viscosity Record (Rev 00, 15.12.2024)
  // As the paper (REQUIREMENTS §111): Sr. No. | Date/Time | Viscosity (20.0 ± 1.0 Sec.) | Tested By, and
  // nothing printed above the grid — the specification is in the Viscosity heading, where the paper prints it
  // and where it sets the band a reading outside is highlighted by. The owner crossed out the line DCRS
  // printed above, and circled its numbered Sr. No.: on the paper the day's date is written there on the
  // day's first line ("6/9/26", "7/9/26") and the hours under Date/Time.
  "qc-viscosity": {
    documentId: "qc-viscosity",
    srNoShowsDate: true,
    headerFields: [],
    columns: [
      { key: "time", label: "Date/Time", type: "time", fixed: true, width: 90 },
      { key: "viscosity", label: "Viscosity (20.0 ± 1.0 Sec.)", type: "number", unit: "Sec.", nominal: 20.0, min: 19.0, max: 21.0, decimals: 2, required: true, width: 150 },
      { key: "testedBy", label: "Tested By", type: "text", required: true, autoFill: { sign: true, byShift: { day: "Jeni", night: "Singh" } }, width: 140 },
    ],
    rowMode: { kind: "timeSlots", slots: HOURLY_SLOTS, slotKey: "time" },
    specimenRows: [
      { time: "09:00", viscosity: 19.93, testedBy: "Jeni" }, { time: "10:00", viscosity: 20.19, testedBy: "Jeni" },
      { time: "11:00", viscosity: 21.08, testedBy: "Jeni" }, { time: "12:00", viscosity: 20.96, testedBy: "Jeni" },
      { time: "13:00", viscosity: 21.0, testedBy: "Jeni" }, { time: "14:00", viscosity: 20.89, testedBy: "Jeni" },
      { time: "15:00", viscosity: 19.73, testedBy: "Jeni" }, { time: "16:00", viscosity: 19.92, testedBy: "Jeni" },
      { time: "17:00", viscosity: 19.2, testedBy: "Jeni" }, { time: "18:00", viscosity: 20.12, testedBy: "Singh" },
      { time: "19:00", viscosity: 20.52, testedBy: "Singh" }, { time: "20:00", viscosity: 20.54, testedBy: "Singh" },
      { time: "21:00", viscosity: 20.16, testedBy: "Singh" }, { time: "22:00", viscosity: 19.78, testedBy: "Singh" },
      { time: "23:00", viscosity: 20.15, testedBy: "Singh" }, { time: "00:00", viscosity: 20.89, testedBy: "Singh" },
      { time: "01:00", viscosity: 20.58, testedBy: "Singh" }, { time: "02:00", viscosity: 19.76, testedBy: "Singh" },
      { time: "03:00", viscosity: 19.87, testedBy: "Singh" }, { time: "04:00", viscosity: 19.52, testedBy: "Singh" },
      { time: "05:00", viscosity: 19.78, testedBy: "Singh" }, { time: "06:00", viscosity: 19.16, testedBy: "Singh" },
      { time: "07:00", viscosity: 19.76, testedBy: "Singh" }, { time: "08:00", viscosity: 19.59, testedBy: "Jeni" },
    ],
    specimenSource: "WhatsApp Image 2026-09-07 at 2.15.18 PM.jpeg (F-QC-30, filled 6/9/26 – 7/9/26)",
  },

  // ---- F-QC-32 — Adhesive Mixing Ratio Record (Rev 00, 15.12.2024)
  // As the paper (REQUIREMENTS §111): Sr. No. | Date | Time | Adhesive (kg) | Hardener (kg) | Ethyl (kg) |
  // Viscosity (Sec.) | Remark | Checked by | Verified by. The Date column was missing; nothing is printed above
  // the grid (DCRS's "One row per adhesive batch mixed..." was its own explanation, not the paper's).
  "qc-adhesive-mixing": {
    documentId: "qc-adhesive-mixing",
    headerFields: [],
    columns: [
      // The day the batch was mixed: the record's date (a line written after midnight is changed by the person).
      { key: "date", label: "Date", type: "date", width: 130, autoFill: { dueDate: true } },
      { key: "time", label: "Time", type: "time", required: true, width: 90, autoFill: { nowTime: true } },
      // Weighed set quantities — always the same 15 / 1.65 / 19.5 on the
      // specimen, so they are copied exactly (band only drives highlighting).
      { key: "adhesive", label: "Adhesive (kg)", type: "number", unit: "kg", min: 14.5, max: 15.5, decimals: 2, required: true, autoFill: { carryForward: true, default: 15 }, width: 100 },
      { key: "hardener", label: "Hardener (kg)", type: "number", unit: "kg", min: 1.6, max: 1.7, decimals: 2, required: true, autoFill: { carryForward: true, default: 1.65 }, width: 100 },
      { key: "ethyl", label: "Ethyl (kg)", type: "number", unit: "kg", min: 19.0, max: 20.0, decimals: 2, required: true, autoFill: { carryForward: true, default: 19.5 }, width: 100 },
      { key: "viscosity", label: "Viscosity (Sec.)", type: "number", unit: "Sec.", nominal: 20.0, min: 19.0, max: 21.0, decimals: 2, required: true, width: 110 },
      { key: "remark", label: "Remark", type: "text" },
      { key: "checkedBy", label: "Checked by", type: "text", autoFill: { sign: true, byShift: { day: "Jeni", night: "Singh" } }, width: 130 },
      { key: "verifiedBy", label: "Verified by", type: "text", width: 130 },
    ],
    rowMode: { kind: "free", minRows: 1, typicalRows: 3 },
    specimenRows: [
      { date: "2026-09-06", time: "04:30", adhesive: 15, hardener: 1.65, ethyl: 19.5, viscosity: 19.9, remark: "", checkedBy: "Jeni", verifiedBy: "" },
      { date: "2026-09-06", time: "21:00", adhesive: 15, hardener: 1.65, ethyl: 19.5, viscosity: 19.76, remark: "", checkedBy: "Singh", verifiedBy: "" },
      { date: "2026-09-06", time: "02:50", adhesive: 15, hardener: 1.65, ethyl: 19.5, viscosity: 19.89, remark: "", checkedBy: "Singh", verifiedBy: "" },
      { date: "2026-09-06", time: "06:00", adhesive: 15, hardener: 1.65, ethyl: 19.5, viscosity: 20.15, remark: "", checkedBy: "Singh", verifiedBy: "" },
    ],
    specimenSource: "WhatsApp Image 2026-09-07 at 2.15.17 PM.jpeg (F-QC-32, filled 6/9/26 – 7/9/26)",
  },

  // ---- F-QC-40.C — Temperature Monitoring Record (00/28.02.25)
  // As the photographed register (REQUIREMENTS §111): headed TEMPERATURE MONITORING RECORD, the recommended
  // temperature printed above the grid, then SR NO | DATE | six readings, each column "... HRS TEMP. + SIGN" — the
  // reading and the tester's sign written in the one cell. The DATE column was missing (the record's day; one line a
  // day), and DCRS's own Sign column, which the paper does not have, is gone; a record that holds one keeps it.
  "qc-temperature": {
    documentId: "qc-temperature",
    paperTitle: "TEMPERATURE MONITORING RECORD",
    instructions: ["RECOMMENDED TEMPERATURE : HOT ROOM 45°C ± 2°C"],
    headerFields: [],
    columns: [
      { key: "date", label: "DATE", type: "date", width: 130, autoFill: { dueDate: true } },
      { key: "t0830", label: "08:30 HRS TEMP. + SIGN", type: "number", unit: "°C", nominal: 45, min: 43, max: 47, decimals: 0, required: true, width: 110 },
      { key: "t1230", label: "12:30 HRS TEMP. + SIGN", type: "number", unit: "°C", nominal: 45, min: 43, max: 47, decimals: 0, required: true, width: 110 },
      { key: "t1630", label: "16:30 HRS TEMP. + SIGN", type: "number", unit: "°C", nominal: 45, min: 43, max: 47, decimals: 0, required: true, width: 110 },
      { key: "t2030", label: "20:30 HRS TEMP. + SIGN", type: "number", unit: "°C", nominal: 45, min: 43, max: 47, decimals: 0, required: true, width: 110 },
      { key: "t0030", label: "12:30am HRS TEMP. + SIGN", type: "number", unit: "°C", nominal: 45, min: 43, max: 47, decimals: 0, required: true, width: 110 },
      { key: "t0430", label: "04:30 HRS TEMP. + SIGN", type: "number", unit: "°C", nominal: 45, min: 43, max: 47, decimals: 0, required: true, width: 110 },
    ],
    rowMode: { kind: "single" },
    specimenRows: [
      { date: "2026-08-21", t0830: 45, t1230: 45, t1630: 46, t2030: 44, t0030: 45, t0430: 46 },
      { date: "2026-08-22", t0830: 44, t1230: 44, t1630: 45, t2030: 46, t0030: 44, t0430: 45 },
      { date: "2026-08-23", t0830: 46, t1230: 44, t1630: 46, t2030: 45, t0030: 45, t0430: 44 },
    ],
    specimenSource: "WhatsApp Image 2026-09-07 at 2.15.19 PM (1).jpeg (F-QC-40.C, filled 21-08-26 to 5-9-26)",
  },

  // ---- F-PRD-19 - SOLVENT BASE LAMINATION - PROCESS PARAMETER RECORD (00/15.12.2024)
  // Built from the photographed register (§12), whose number was under the clip; the owner sent the format itself on
  // 06-Oct-2026 (REQUIREMENTS §91), with the company's own .xlsx: it prints F-PRD-19 (00/15.12.2024), and every box
  // and heading below is now the original's own text, its capitals and its spellings ("LINE SPEET", "LAMINATOR NIP
  // PRESSUTE") included. The keys are unchanged, so every record already on file reads as it did. DATE & SHIFT is
  // one box written by the person, as on the paper (productionLayouts.ts says why); it was a Shift choice (A, B, C),
  // and a record that holds one still shows it.
  "prd-process-parameter": {
    documentId: "prd-process-parameter",
    headerFields: [
      { key: "operatorName", label: "OPERATOR NAME :", type: "text", required: true, autoFill: { carryForward: true, default: "Gaurav Singh" } },
      { key: "machineName", label: "MACHINE NAME :", type: "text", required: true, autoFill: { carryForward: true, default: "Lamination-1" } },
      { key: "shift", label: "DATE & SHIFT :", type: "text" },
      { key: "mixingRatio", label: "ADHESIVE + HARDENER + SOLVENT MIXING RATIO :", type: "text", autoFill: { carryForward: true, default: "10 : 1.1 : 9.5" } },
      { key: "adhesiveMake", label: "ADHESIVE (MAKE) :", type: "text", autoFill: { carryForward: true, default: "DOW" } },
      { key: "adhesiveCode", label: "ADHESIVE (PRODUCT CODE) :", type: "text", autoFill: { carryForward: true, default: "545S" } },
      { key: "adhesiveBatch", label: "ADHESIVE (BATCH NUMBER) :", type: "text", autoFill: { carryForward: true, default: "B35007107" } },
      { key: "hardenerMake", label: "HARDENER (MAKE) :", type: "text", autoFill: { carryForward: true, default: "DOW" } },
      { key: "hardenerCode", label: "HARDENER (PRODUCT CODE) :", type: "text", autoFill: { carryForward: true, default: "F-854" } },
      { key: "hardenerBatch", label: "HARDENER (BATCH NUMBER) :", type: "text", autoFill: { carryForward: true, default: "44000N0301" } },
    ],
    columns: [
      { key: "poNo", label: "INTERNAL PO No.", type: "text", required: true, width: 90 },
      { key: "fgCode", label: "FG CODE", type: "text", required: true, width: 70 },
      { key: "jobName", label: "JOB NAME", type: "text", required: true, width: 190 },
      // Machine set-points: repeated verbatim job to job on the specimen, so
      // they are carried forward exactly; min/max only drive highlighting.
      { key: "coatingNip", label: "COATING NIP PRESSURE", type: "number", min: 2.5, max: 3.5, decimals: 2, autoFill: { carryForward: true, default: 3.0 }, width: 80 },
      { key: "doctorBlade", label: "DOCTOR BLADE PRESSURE", type: "number", min: 1.5, max: 2.5, decimals: 2, autoFill: { carryForward: true, default: 2.0 }, width: 80 },
      { key: "primaryUw", label: "PRIMARY U/W TENSION", type: "number", min: 30, max: 50, decimals: 0, autoFill: { carryForward: true, default: 45 }, width: 80 },
      { key: "layOnRoll", label: "LAY ON ROLL PRESSURE", type: "number", min: 2.5, max: 3.5, decimals: 2, autoFill: { carryForward: true, default: 3.0 }, width: 80 },
      { key: "hoodA", label: "HOOD A TEMP.", type: "number", unit: "°C", min: 40, max: 45, decimals: 0, autoFill: { carryForward: true, default: 42 }, width: 70 },
      { key: "hoodB", label: "HOOD B TEMP.", type: "number", unit: "°C", min: 50, max: 55, decimals: 0, autoFill: { carryForward: true, default: 52 }, width: 70 },
      // "SPEET" is the original's own spelling.
      { key: "lineSpeed", label: "LINE SPEET", type: "number", min: 60, max: 140, decimals: 0, autoFill: { carryForward: true, default: 81 }, width: 70 },
      { key: "rewinderTension", label: "REWINDER TENSION", type: "number", min: 30, max: 60, decimals: 0, autoFill: { carryForward: true, default: 52 }, width: 80 },
      { key: "secondaryUw", label: "SECONDARY U/W TENSION", type: "number", min: 25, max: 45, decimals: 0, autoFill: { carryForward: true, default: 40 }, width: 80 },
      { key: "tapperTension", label: "TAPPER TENSION", type: "text", autoFill: { carryForward: true, default: "15%" }, width: 70 },
      // "PRESSUTE" is the original's own spelling.
      { key: "laminatorNip", label: "LAMINATOR NIP PRESSUTE", type: "number", min: 5.5, max: 6.5, decimals: 2, autoFill: { carryForward: true, default: 6.0 }, width: 80 },
      { key: "laminationNipTemp", label: "LAMINATION NIP TEMP.", type: "number", unit: "°C", min: 60, max: 90, decimals: 0, autoFill: { carryForward: true, default: 70 }, width: 80 },
    ],
    rowMode: { kind: "free", minRows: 1, typicalRows: 4 },
    specimenHeader: {
      operatorName: "Gaurav Singh", machineName: "Lamination-1", mixingRatio: "10 : 1.1 : 9.5",
      adhesiveMake: "DOW", adhesiveCode: "545S", adhesiveBatch: "B35007107", hardenerMake: "DOW", hardenerCode: "F-854", hardenerBatch: "44000N0301",
    },
    specimenRows: [
      { poNo: "88825", fgCode: "7204", jobName: "VP Bedekar Fenugreek Powder", coatingNip: 3, doctorBlade: 2, primaryUw: 45, layOnRoll: 3, hoodA: 42, hoodB: 52, lineSpeed: 81, rewinderTension: 52, secondaryUw: 40, tapperTension: "15%", laminatorNip: 6, laminationNipTemp: 65 },
      { poNo: "88826", fgCode: "7205", jobName: "VP Bedekar Cumin Powder", coatingNip: 3, doctorBlade: 2, primaryUw: 45, layOnRoll: 3, hoodA: 42, hoodB: 52, lineSpeed: 81, rewinderTension: 52, secondaryUw: 40, tapperTension: "15%", laminatorNip: 6, laminationNipTemp: 70 },
      { poNo: "88827", fgCode: "7206", jobName: "VP Bedekar Jeshthamadh Powder", coatingNip: 3, doctorBlade: 2, primaryUw: 45, layOnRoll: 3, hoodA: 42, hoodB: 52, lineSpeed: 65, rewinderTension: 52, secondaryUw: 40, tapperTension: "15%", laminatorNip: 6, laminationNipTemp: 70 },
      { poNo: "88823", fgCode: "7202", jobName: "VP Bedekar Dry Ginger Powder", coatingNip: 3, doctorBlade: 2, primaryUw: 45, layOnRoll: 3, hoodA: 42, hoodB: 52, lineSpeed: 65, rewinderTension: 52, secondaryUw: 40, tapperTension: "15%", laminatorNip: 6, laminationNipTemp: 70 },
      { poNo: "88903", fgCode: "6766", jobName: "Sweet Karam Gusset", coatingNip: 3, doctorBlade: 2, primaryUw: 35, layOnRoll: 3, hoodA: 42, hoodB: 52, lineSpeed: 130, rewinderTension: 32, secondaryUw: 28, tapperTension: "15%", laminatorNip: 6, laminationNipTemp: 60 },
    ],
    specimenSource: "WhatsApp Image 2026-09-07 at 2.15.19 PM.jpeg (Process Parameter Record, filled 07-09-26)",
    originalPages: [
      { src: "/source/fprd19-sb-lamination-process-parameter-p1.jpg", caption: "F-PRD-19 (00/15.12.2024) - Solvent Base Lamination - Process Parameter Record, the blank format as supplied on 06-Oct-2026" },
      { src: "/source/fprd19-sb-lamination-process-parameter-p2.jpg", caption: "F-PRD-19, page 2: the grid's fifteenth line, which Excel printed on a page of its own" },
    ],
  },

  // ---- F-PRD-18 - SOLVENT BASE LAMINATION - ALC & PRODUCTION REPORT (01/25.06.2025)
  // Built from the photographed register (§13); the owner sent the format itself on 06-Oct-2026 (REQUIREMENTS §91),
  // with the company's own .xls, and every box, heading and line of the ALC PROTOCOL is now the original's own text:
  // its capitals, "OK METERs", "LAMINATED ROLL WEIGHT -  Kgs." with its two spaces, and the space the protocol prints
  // before each question mark (the photograph's reading had dropped them). The ALC PROTOCOL is the original's two
  // lines, broken where its cell breaks. The keys are unchanged, so every record already on file reads as it did.
  // DATE & SHIFT is one box written by the person, as on the paper; it was a Shift choice (A, B, C), and a record
  // that holds one still shows it.
  "prd-alc-production": {
    documentId: "prd-alc-production",
    instructions: [
      "ALC PROTOCOL : Activity to make sure a production line & its processing area are completely cleared of any material from the previous process",
      "(1) Balance roll & scrap of Previous Job removed ? (2) Film type & Width for Current Job verified as per New Job order ? (3) Job change waste removed ? (4) Finished Product Rolls of Previous Job shifted to designated place / Finish Goods Warehouse ? (5) Tools & Tackles if any, removed from machine & put safely in toll box ?",
    ],
    headerFields: [
      { key: "operatorName", label: "OPERATOR NAME :", type: "text", required: true, autoFill: { carryForward: true, default: "Gaurav Singh" } },
      { key: "machineName", label: "MACHINE NAME :", type: "text", required: true, autoFill: { carryForward: true, default: "Lamination-1" } },
      { key: "shift", label: "DATE & SHIFT :", type: "text" },
    ],
    columns: [
      { key: "fgCode", label: "FG CODE", type: "text", required: true, width: 70 },
      { key: "poNo", label: "INTERNAL PO No.", type: "text", required: true, width: 90 },
      { key: "jobName", label: "JOB NAME", type: "text", required: true, width: 190 },
      { key: "layer1Type", label: "LAYER 1 TYPE", type: "text", autoFill: { carryForward: true, default: "PET" }, width: 80 },
      // Actual weights / meters differ a little run to run — small jitter on
      // the carried-forward value rather than an exact copy.
      { key: "layer1Kg", label: "LAYER 1 - Kgs.", type: "number", unit: "kg", decimals: 2, autoFill: { jitter: 0.03 }, width: 80 },
      { key: "layer2Type", label: "LAYER 2 TYPE", type: "text", autoFill: { carryForward: true, default: "MetPET" }, width: 80 },
      { key: "layer2Kg", label: "LAYER 2 - Kgs.", type: "number", unit: "kg", decimals: 2, autoFill: { jitter: 0.03 }, width: 80 },
      { key: "alcDone", label: "ALC DONE AS PER ABOVE (YES/NO)", type: "yesno", required: true, autoFill: { carryForward: true, default: "Yes" }, width: 90 },
      // The operator signs each line, as on F-PRD-20 and F-PRD-26: never the assistant, never a name the
      // role lookup returns (the audit of 7-Oct-2026, H-11; REQUIREMENTS §91.4, §98).
      { key: "operatorSign", label: "OPERATOR SIGN", type: "text", autoFill: { fresh: true }, width: 120 },
      { key: "startTime", label: "START TIME", type: "time", autoFill: { carryForward: true }, width: 90 },
      { key: "endTime", label: "END TIME", type: "time", autoFill: { carryForward: true }, width: 90 },
      // The two spaces before "Kgs." are the original's own.
      { key: "rollWeight", label: "LAMINATED ROLL WEIGHT -  Kgs.", type: "number", unit: "kg", decimals: 2, autoFill: { jitter: 0.03 }, width: 90 },
      { key: "okMeters", label: "OK METERs", type: "number", decimals: 0, autoFill: { jitter: 0.02 }, width: 80 },
      { key: "inTimeHotroom", label: "IN TIME (HOTROOM)", type: "time", autoFill: { carryForward: true }, width: 90 },
    ],
    rowMode: { kind: "free", minRows: 1, typicalRows: 4 },
    specimenHeader: { operatorName: "Gaurav Singh", machineName: "Lamination-1" },
    specimenRows: [
      { fgCode: "7204", poNo: "88825", jobName: "VP Bedekar Fenugreek Powder", layer1Type: "PET", layer1Kg: 12, layer2Type: "MetPET", layer2Kg: 51.5, alcDone: "Yes", operatorSign: "Gaurav Singh", startTime: "09:00", endTime: "09:50", rollWeight: 69.1, okMeters: 1950, inTimeHotroom: "10:00" },
      { fgCode: "7205", poNo: "88826", jobName: "VP Bedekar Cumin Powder", layer1Type: "PET", layer1Kg: 12.5, layer2Type: "MetPET", layer2Kg: 51.1, alcDone: "Yes", operatorSign: "Gaurav Singh", startTime: "09:50", endTime: "10:45", rollWeight: 70.2, okMeters: 1950, inTimeHotroom: "10:50" },
      { fgCode: "7206", poNo: "88827", jobName: "VP Bedekar Jeshthamadh Powder", layer1Type: "PET", layer1Kg: 18, layer2Type: "MetPET", layer2Kg: 51.5, alcDone: "Yes", operatorSign: "Gaurav Singh", startTime: "10:45", endTime: "12:00", rollWeight: 70, okMeters: 1950, inTimeHotroom: "12:10" },
      { fgCode: "7202", poNo: "88823", jobName: "VP Bedekar Dry Ginger Powder", layer1Type: "PET", layer1Kg: 18, layer2Type: "MetPET", layer2Kg: 51, alcDone: "Yes", operatorSign: "Gaurav Singh", startTime: "12:00", endTime: "13:30", rollWeight: 70, okMeters: 1950, inTimeHotroom: "13:40" },
      { fgCode: "6766", poNo: "88903", jobName: "Sweet Karam Gusset", layer1Type: "BOPP", layer1Kg: null, layer2Type: "MetPET", layer2Kg: null, alcDone: "Yes", operatorSign: "Gaurav Singh", startTime: "13:30", endTime: "", rollWeight: null, okMeters: null, inTimeHotroom: "" },
    ],
    specimenSource: "WhatsApp Image 2026-09-07 at 2.15.20 PM.jpeg (F-PRD-18, filled 07-09-26, Shift A)",
    originalPages: [
      { src: "/source/fprd18-sb-lamination-alc-production-p1.jpg", caption: "F-PRD-18 (01/25.06.2025) - Solvent Base Lamination - ALC & Production Report, the blank format as supplied on 06-Oct-2026" },
      { src: "/source/fprd18-sb-lamination-alc-production-p2.jpg", caption: "F-PRD-18, page 2: the grid's twelfth line, which Excel printed on a page of its own" },
    ],
  },
};

// ---------------------------------------------------------------------------
// QC INSPECTION RECORDS (F/QC/34, /35, /36, /37). F/QC/13 is in qcInProcessLayouts.ts.
// Shared shape: job header, a fixed list of test parameters with a printed
// specification and an observation to fill, a lot-status decision, and the
// QA inspector's sign. "Approved by / QA Manager" on the paper is the app's
// Verify action (verifiedBy), so it is deliberately NOT a field to type.

const LOT_STATUS = ["Accepted", "Reject / Scrap", "Segregation", "Accepted on Deviation"];

const inspectionFooter = (): LogHeaderField[] => [
  { key: "lotStatus", label: "Lot Status", type: "select", options: LOT_STATUS, required: true, autoFill: { default: "Accepted" } },
  { key: "deviationReason", label: "Reason for Deviation / Rejection / Segregation", type: "text" },
  { key: "inspectedBy", label: "Inspected By (QA Inspector)", type: "text", required: true, autoFill: { sign: true } },
];

const inspectionColumns = (): LogColumn[] => [
  { key: "parameter", label: "Test Parameters", type: "text", fixed: true, width: 240 },
  { key: "specification", label: "Specification", type: "text", fixed: true, width: 220 },
  { key: "observation", label: "Observation", type: "text", required: true, autoFill: { carryForward: true }, width: 200 },
];

const fixedParams = (list: [string, string][]) => list.map(([parameter, specification]) => ({ parameter, specification }));
/** F/QC/36's four lot statuses, as printed across its LOT STATUS line ("REJECT / SCRAP" where the incoming records print more). */
const SB_LAMINATION_LOT_STATUS = ["ACCEPTED", "REJECT / SCRAP", "SEGREGATION", "ACCEPTED ON DEVIATION"];

Object.assign(LOG_SHEET_LAYOUTS, {
  // ---- F/QC/37 — Inspection Record – Pouching Process (00/15.12.2024)
  "qc-inspection-pouching": {
    documentId: "qc-inspection-pouching",
    headerFields: [
      { key: "fgCode", label: "Job Code (FG Code)", type: "text", required: true, autoFill: { carryForward: true } },
      { key: "poNumber", label: "PO Number", type: "text", required: true, autoFill: { carryForward: true } },
      { key: "customerName", label: "Customer Name", type: "text", autoFill: { carryForward: true } },
      { key: "jobName", label: "Job Name", type: "text", required: true, autoFill: { carryForward: true } },
      { key: "shift", label: "Shift", type: "select", options: ["1st", "2nd", "3rd"], required: true, autoFill: { default: "1st" } },
      { key: "substrate", label: "Substrate Details", type: "text", autoFill: { carryForward: true } },
    ],
    columns: inspectionColumns(),
    rowMode: {
      kind: "fixedRows",
      rows: fixedParams([
        ["Pouch Height (mm)", "FG Product specification"],
        ["Pouch Width (mm)", "FG Product specification"],
        ["Centre Seal Width (mm)", "FG Product specification"],
        ["Side Seal Width (mm)", "FG Product specification"],
        ["Gusset Width (mm) (Side/Bottom)", "FG Product specification"],
        ["Total Pouch Thickness (micron)", "FG Product specification"],
        ["Zipper Position From Top (Only if customer requirement)", "FG Product specification"],
        ["Total GSM", "FG Product specification"],
        ["Wt. of Pouch", "FG Product specification"],
        ["Type of Pouch", "FG Product specification"],
        ["Leak Test", "NO LEAK"],
      ]),
    },
    footerFields: inspectionFooter(),
    specimenHeader: {
      fgCode: "5420", poNumber: "81509", customerName: "Gulab Oil And Food", jobName: "California Almonds and Whole Cashews", shift: "1st",
      substrate: "25 mic Matte BOPP + 12 mic METPET + 85 mic Nat LDPE", lotStatus: "Accepted", deviationReason: "",
    },
    specimenRows: [
      { observation: "181" }, { observation: "119" }, { observation: "-" }, { observation: "10" }, { observation: "41" }, { observation: "95" },
      { observation: "-" }, { observation: "97.0" }, { observation: "5.84" }, { observation: "Standy + Zipper" }, { observation: "PASS" },
    ],
    specimenSource: "Photographed F/QC/37 register (filled 06/03/26, 1st shift)",
  } satisfies LogSheetLayout,

  // ---- F/QC/36 — Inspection Record – Solvent Base Lamination Film (00/15.12.2024)
  // Supplied 02-Oct-2026 as a PDF with its Word original (REQUIREMENTS §86): every label and
  // line is the .doc's own text, in its own capitals and spacing ("Date / SHIFT", "2nd  SUBSTRATE
  // DETAILS"), where F/QC/34/35/37 were read off photographs. Held against the original again on
  // 13-Oct-2026 (§111): the header box is two boxes to a line, read across as the paper reads it;
  // below the grid the LOT STATUS and the REASON each take a line, and the paper's two signatures,
  // INSPECTED BY (QA INSPECTOR) and APPROVED BY (QA MANAGER), stand side by side — the paper prints
  // both, so both are boxes here (the verifier's Verify is stamped as on every record besides). And
  // (part 4) the statuses printed across their line, QA INSPECTOR and QA MANAGER under the signatures,
  // the lines numbered "1.", "2.", "3.".
  "qc-inspection-sb-lamination": {
    documentId: "qc-inspection-sb-lamination",
    headerColumns: 2,
    // Its lines numbered "1.", "2.", "3." as printed (REQUIREMENTS §111, part 4).
    srNoFullStop: true,
    headerFields: [
      { key: "fgCode", label: "JOB CODE (FG CODE)", type: "text", required: true, autoFill: { carryForward: true } },
      { key: "poNumber", label: "PO NUMBER", type: "text", required: true, autoFill: { carryForward: true } },
      // One box on the paper: the date and the shift written together — by the person, never copied from the last sheet.
      { key: "dateShift", label: "Date / SHIFT", type: "text" },
      { key: "laminatedRoll", label: "Laminated Roll number", type: "text", autoFill: { carryForward: true } },
      { key: "substrate1", label: "1st SUBSTRATE DETAILS", type: "text", autoFill: { carryForward: true } },
      // The two spaces after "2nd" are the paper's own.
      { key: "substrate2", label: "2nd  SUBSTRATE DETAILS", type: "text", autoFill: { carryForward: true } },
      // The header box's last line is this box alone, its answer the width of the sheet (REQUIREMENTS §111).
      { key: "pass", label: "1st Pass / 2nd Pass / 3rd Pass", type: "select", options: ["1st Pass", "2nd Pass", "3rd Pass"], required: true, autoFill: { default: "1st Pass" }, boxesPerLine: 1 },
    ],
    columns: [
      { key: "parameter", label: "TEST PARAMETERS", type: "text", fixed: true, width: 300 },
      { key: "specification", label: "SPECIFICATION", type: "text", fixed: true, width: 200 },
      { key: "observation", label: "OBSERVATION", type: "text", required: true, autoFill: { carryForward: true }, width: 200 },
    ],
    rowMode: {
      kind: "fixedRows",
      rows: fixedParams([
        // "(*)NA" with no space, and the (*) marks with no footnote, are the paper's own.
        ["COMPOSITE GSM (*)NA (IF JOB INVOLVES 2nd Pass / 3rd Pass Lamination process)", "FG Product Specification"],
        ["GREEN BOND STRENGTH (*) – ONLY FOR INDICATIVE PURPOSE", "NA"],
        ["ODOUR TEST", "No abnormal odour"],
      ]),
    },
    footerFields: [
      // The four statuses printed across the line for the inspector to mark one (choicesAcross, §111 part 4).
      {
        key: "lotStatus",
        label: "LOT STATUS",
        type: "select",
        options: SB_LAMINATION_LOT_STATUS,
        choicesAcross: SB_LAMINATION_LOT_STATUS,
        required: true,
        autoFill: { default: "ACCEPTED" },
        boxesPerLine: 1,
      },
      { key: "deviationReason", label: "REASON FOR DEVIATION / REJECTION / SEGREGATION", type: "text" },
      // INSPECTED BY over QA INSPECTOR and APPROVED BY over QA MANAGER, side by side, as on the incoming records. The
      // inspector signs; APPROVED BY is printed on the paper beside it (§111) and signed by the QA Manager, so never
      // required of the inspector.
      ...signatureBoxes().map((f) => (f.key === "inspectedBy" ? { ...f, required: true } : f)),
    ],
    // Nothing was supplied filled in: these are typical values for the assistant, worded as F/QC/35's register words them.
    specimenHeader: {
      fgCode: "5703", poNumber: "81857", laminatedRoll: "1",
      substrate1: "25 mic Matt BOPP", substrate2: "12 mic MetPET", pass: "1st Pass", lotStatus: "ACCEPTED", deviationReason: "",
    },
    specimenRows: [{ observation: "As per FG specification" }, { observation: "NA" }, { observation: "Pass" }],
    specimenSource: "F-QC-36_Inspection record for SB Lamination Film.pdf (blank form supplied 02-Oct-2026 — typical values as on the F/QC/35 register)",
    originalPages: [
      { src: "/source/fqc36-sb-lamination-film-p1.jpg", caption: "F/QC/36 (00 / 15.12.2024) — Inspection Record – Solvent Base Lamination Film, the blank format as supplied" },
    ],
  } satisfies LogSheetLayout,

  // ---- F/QC/35 — Inspection Record – Slitting - Lamination Grade Film (00/15.12.2024)
  "qc-inspection-slitting": {
    documentId: "qc-inspection-slitting",
    headerFields: [
      { key: "fgCode", label: "Job Code (FG Code)", type: "text", required: true, autoFill: { carryForward: true } },
      { key: "poNumber", label: "PO Number", type: "text", required: true, autoFill: { carryForward: true } },
      { key: "shift", label: "Shift", type: "select", options: ["1st", "2nd", "3rd"], required: true, autoFill: { default: "1st" } },
      { key: "motherRoll", label: "Laminated – Mother Roll number", type: "text", autoFill: { carryForward: true } },
      { key: "substrate", label: "Substrate Details", type: "text", autoFill: { carryForward: true } },
    ],
    columns: inspectionColumns(),
    rowMode: {
      kind: "fixedRows",
      rows: fixedParams([
        ["Bond Strength", "FG Product Specification"],
        ["Odour Test", "No abnormal odour"],
        ["Slitted Roll Width (mm)", "As per Job card"],
      ]),
    },
    footerFields: inspectionFooter(),
    specimenHeader: {
      fgCode: "5703", poNumber: "81857", shift: "1st", motherRoll: "1",
      substrate: "L1 = 25 mic Matt BOPP + 12 mic MetPET; L2 = L1 + 85 mic LDPE (Nat)", lotStatus: "Accepted", deviationReason: "",
    },
    specimenRows: [{ observation: "L1 = 0.306 kg (BRK); L2 = 0.435 kg (BRK)" }, { observation: "Pass" }, { observation: "260 mm" }],
    specimenSource: "Photographed F/QC/35 register (filled 1-3-26, 1st shift)",
  } satisfies LogSheetLayout,

  // ---- F/QC/34 — Inspection Record – Lamination Grade Printed Film (00/15.12.2024)
  "qc-inspection-printed-film": {
    documentId: "qc-inspection-printed-film",
    headerFields: [
      { key: "fgCode", label: "Job Code (FG Code)", type: "text", required: true, autoFill: { carryForward: true } },
      { key: "poNumber", label: "PO Number", type: "text", required: true, autoFill: { carryForward: true } },
      { key: "shift", label: "Shift", type: "select", options: ["I", "II", "III"], required: true, autoFill: { default: "I" } },
      { key: "printedRoll", label: "Printed Roll number", type: "text", autoFill: { carryForward: true } },
      { key: "substrate", label: "Substrate Details", type: "text", autoFill: { carryForward: true } },
      { key: "machineName", label: "Machine Name", type: "text", autoFill: { carryForward: true, default: "Lombardi" } },
    ],
    columns: inspectionColumns(),
    rowMode: {
      kind: "fixedRows",
      rows: fixedParams([
        ["Size (mm)", "As per Job card"],
        ["Thickness of Film (µm)", "As per Job card"],
        ["Repeat Length (mm)", "As per Job card"],
        ["Shade / Colour", "As per Shade card / As per given Reference"],
        ["Text Matter", "As per Shade card / As per Artwork"],
        ["Unwinding Direction (Only for Roll form job)", "As per Job card"],
        ["Tape Test", "PASS / FAIL"],
        ["Odour Test", "No abnormal odour"],
      ]),
    },
    footerFields: inspectionFooter(),
    specimenHeader: { fgCode: "FGP0698Z", poNumber: "88083", shift: "I", printedRoll: "I", substrate: "Matt BOPP 25 mic", machineName: "Lombardi", lotStatus: "Accepted", deviationReason: "" },
    specimenRows: [
      { observation: "H-304 W-203.2" }, { observation: "25 mic" }, { observation: "203.2" }, { observation: "OK" },
      { observation: "OK" }, { observation: "N/A" }, { observation: "Pass" }, { observation: "Pass" },
    ],
    specimenSource: "Photographed F/QC/34 register (filled 18/8/26, shift I, Lombardi)",
  } satisfies LogSheetLayout,
});

// The sixteen Human Resources formats, F/HR/01 to F/HR/22 — data/seed/hrLayouts.ts.
Object.assign(LOG_SHEET_LAYOUTS, HR_LAYOUTS);
// Quality Control's two internal calibration records, F/QC/11 and F/QC/12.
Object.assign(LOG_SHEET_LAYOUTS, QC_CALIBRATION_LAYOUTS);
// F/QC/13, In Process Quality Control, the Gujarati form as the owner's original of 13-Oct-2026 (REQUIREMENTS §111).
Object.assign(LOG_SHEET_LAYOUTS, QC_IN_PROCESS_LAYOUTS);

// Quality Control's formats supplied on 18-Sep-2026 (REQUIREMENTS §57): the
// thirteen incoming material inspection records, the seven line clearances
// (F/QC/15-A to F/QC/15-G plus the two Gujarati checklists), the registers,
// the three Certificates of Analysis, and the analyses and minutes.
Object.assign(LOG_SHEET_LAYOUTS, QC_INCOMING_LAYOUTS);
Object.assign(LOG_SHEET_LAYOUTS, QC_LINE_CLEARANCE_LAYOUTS);
Object.assign(LOG_SHEET_LAYOUTS, QC_GUJARATI_LINE_CLEARANCE_LAYOUTS);
Object.assign(LOG_SHEET_LAYOUTS, QC_REGISTER_LAYOUTS);
Object.assign(LOG_SHEET_LAYOUTS, QC_COA_LAYOUTS);
Object.assign(LOG_SHEET_LAYOUTS, QC_REPORT_LAYOUTS);
// F-QC-14, the internal test reliability record, its Label and Sleeve sheets, supplied on 13-Oct-2026 (REQUIREMENTS §111).
Object.assign(LOG_SHEET_LAYOUTS, QC_TEST_RELIABILITY_LAYOUTS);

// Purchase's formats supplied on 23-Sep-2026 (REQUIREMENTS §68): the supplier
// registration form and the supplier audit report, the list of approved
// suppliers, and the two performance monitoring registers whose weighted
// ratings are worked out (engine/purchaseRatings.ts). F/PUR/04 was not supplied.
Object.assign(LOG_SHEET_LAYOUTS, PURCHASE_LAYOUTS);
Object.assign(LOG_SHEET_LAYOUTS, DISPATCH_LAYOUTS);
// Store's two formats, supplied 23-Sep-2026 (REQUIREMENTS §71): the incoming
// material and vehicle check, supplied as the rubber stamp itself and shown
// beside the form, and the sharp metal objects register.
Object.assign(LOG_SHEET_LAYOUTS, STORE_LAYOUTS);
// Maintenance's eight formats, supplied 24-Sep-2026 (REQUIREMENTS §74): the
// equipment master and the seven formats that name a machine or an area.
Object.assign(LOG_SHEET_LAYOUTS, MAINTENANCE_LAYOUTS);
// System / Management — the PSTL's own F/SYS formats, supplied 25-Sep-2026
// (REQUIREMENTS §76): document control, the management review and the
// objectives, the internal audit and corrective action, HARA verification and
// site security, and traceability and the mock product withdrawal.
Object.assign(LOG_SHEET_LAYOUTS, SYS_DOCUMENT_CONTROL_LAYOUTS);
Object.assign(LOG_SHEET_LAYOUTS, SYS_MANAGEMENT_REVIEW_LAYOUTS);
Object.assign(LOG_SHEET_LAYOUTS, SYS_INTERNAL_AUDIT_LAYOUTS);
Object.assign(LOG_SHEET_LAYOUTS, SYS_HARA_TRACEABILITY_LAYOUTS);
// Marketing (REQUIREMENTS §77): the customer's feedback and its analysis, the complaint trend and its Pareto.
Object.assign(LOG_SHEET_LAYOUTS, MKT_LAYOUTS);
// Production (REQUIREMENTS §91): the slitting, pouching and doctoring records and the sharp object and blade
// records, supplied 06-Oct-2026 with the company's own originals (the two lamination records are above).
Object.assign(LOG_SHEET_LAYOUTS, PRODUCTION_LAYOUTS);

// The layout as it stands now: the plant's own change to the format where
// there is one (data/formatEdits.ts, REQUIREMENTS §62), the issued layout
// otherwise. `getIssuedLogSheetLayout` is the paper's own transcription.
export function getLogSheetLayout(documentId: string): LogSheetLayout | undefined {
  const edited = formatEditFor(documentId)?.layout;
  return edited ? printedLinesOnce(asThePaper(edited)) : LOG_SHEET_LAYOUTS[documentId];
}

// THE PAPER'S OWN SHAPE IN A FORMAT EDITED BEFORE §111 TOO (REQUIREMENTS §111). A format the
// plant changed before 13-Oct-2026 was stored whole, with DCRS's explanations above its grid and
// none of what the paper does that a layout could not say then: a box it prints the value of, the
// date in its Sr. No., an entry of two lines, its text below the grid and at its foot, its boxes in
// the paper's groups under the lines and tables printed above them, a heading it leaves out, a box
// in its column of the line, boxes printed as a table, a grid printed across. Such a
// layout (one that says none of those) takes them from the issued one, box by box and column by
// column where the key is still there, and loses the explanation lines §111 took off the issued
// layouts (and the paper's own lines §111 moved below the grid or to the foot, which would print twice). A format edited
// since is the plant's own word and is left as it is. The same object until the edit changes.
const WITHDRAWN_EXPLANATIONS: Record<string, string[]> = {
  "qc-viscosity": ["Viscosity specification: 20.0 ± 1.0 Sec. One reading every hour, round the clock (09:00 to 08:00 next day)."],
  "qc-adhesive-mixing": ["One row per adhesive batch mixed. Standard mix observed on the specimen: 15 kg adhesive : 1.65 kg hardener : 19.5 kg ethyl acetate."],
  "qc-weight-scale-calibration": [
    "WEEKLY INTERNAL CALIBRATION RECORDS - WEIGHT SCALE. One line per weekly calibration: the five test weights, the value the scale showed for each, the deviation, Pass / Fail, the tester's sign and when the next one is due.",
    "On the paper the Deviation % of each entry is written on a second line beneath it; here every weight carries its own Deviation % column on the same line. Each Deviation % is worked out from the weight and its tested value — (tested − weight) ÷ weight × 100, in whatever unit they are written — and Pass / Fail follows the Acceptable Tolerance above.",
    // Printed below the grid now, as the paper prints it.
    `PROCEDURE: ${CALIBRATION_PROCEDURE}`,
  ],
  "qc-gsm-plate-calibration": [
    "MONTHLY INTERNAL CALIBRATION RECORDS – GSM CUTTING PLATE. The four plates — No. 54 (20 x 20cm), No. 55 (10 x 10cm), No. 56 (5 x 5cm), No. 57 (2.5 x 2.5cm) — measured four times each, with the deviation beside every measurement, then Pass / Fail and the tester's sign for each plate.",
    "Each Deviation % is worked out from the size written beside it, by area, against the plate's own size printed at the head of its column.",
    `PROCEDURE: ${CALIBRATION_PROCEDURE}`,
  ],
  // Printed at the foot of the page now, as the paper prints it.
  "qc-flexo-ink": [FLEXO_INK_SYSTEM_NOTE],
  // The certificates' explanations, and their printed notes now in the paper's places (qcCoaLayouts.ts).
  ...COA_WITHDRAWN_LINES,
  "qc-tolerance-card-nivea": [TOLERANCE_CARD_NOTE],
  // F/QC/15-A to F/QC/15-G: the title, printed in the header, was printed again above the grid.
  ...Object.fromEntries(Object.entries(LINE_CLEARANCE_TITLE_LINES).map(([id, title]) => [id, [title]])),
  // F/QC/29 (both), F/QC/30 and F/QC/20: DCRS's lines above their grids.
  ...QC_REPORT_WITHDRAWN_LINES,
  "qc-printing-aids-destruction": [PRINTING_AIDS_WITHDRAWN_LINE],
  // F/QC/13: two lines of grading rules the owner's original of 13-Oct-2026 does not print.
  "qc-inprocess-printing": FQC13_WITHDRAWN_LINES,
  // The two Gujarati checklists: DCRS's own line saying the two are printed on one page.
  "qc-line-clearance-materials": ["આ ફોર્મ અને ક્વોલીટી શહી (Line Clearance — Quality) એક જ પાના પર છપાયેલાં છે."],
  "qc-line-clearance-quality": ["આ ફોર્મ અને લાઈન કિલયરન્સ (Line Clearance — Materials) એક જ પાના પર છપાયેલાં છે."],
};

const asPaper = new WeakMap<LogSheetLayout, LogSheetLayout>();
/** The edited format's tables, with each table an issued box prints above it (tableAbove) that the edit does not hold. */
function placedTablesFrom(issued: LogSheetLayout, edited: LogSheetLayout): { referenceTables?: LogSheetLayout["referenceTables"] } {
  const own = edited.referenceTables ?? [];
  const keys = new Set([...edited.headerFields, ...(edited.footerFields ?? [])].map((f) => f.key));
  const wanted = new Set([...issued.headerFields, ...(issued.footerFields ?? [])].filter((f) => f.tableAbove && keys.has(f.key)).map((f) => f.tableAbove!));
  const missing = (issued.referenceTables ?? []).filter((t) => wanted.has(t.title) && !own.some((o) => o.title === t.title));
  return missing.length > 0 ? { referenceTables: [...own, ...missing] } : {};
}
/** The paper's words for a box's choices fit an edited box only while it offers the same choices (else they would print other words). */
const sameChoices = (own: LogHeaderField, edited: LogHeaderField): boolean =>
  (own.options ?? []).length === (edited.options ?? []).length && (own.options ?? []).every((o, i) => edited.options?.[i] === o);
function asThePaper(edited: LogSheetLayout): LogSheetLayout {
  const known = asPaper.get(edited);
  if (known) return known;
  let out = edited;
  const issued = LOG_SHEET_LAYOUTS[edited.documentId];
  const boxes = [...edited.headerFields, ...(edited.footerFields ?? [])];
  const saysPaper =
    edited.srNoShowsDate !== undefined || edited.secondLine !== undefined || edited.notesBelow !== undefined || edited.headerColumns !== undefined ||
    edited.notesAtFoot !== undefined || edited.gridAcross !== undefined || edited.srNoFullStop !== undefined || edited.headingsAsPrinted !== undefined ||
    edited.answerAcross !== undefined ||
    boxes.some(
      (f) =>
        f.printed !== undefined || f.tableAbove !== undefined || f.boxesPerLine !== undefined || f.paperColumn !== undefined || f.boxTable !== undefined ||
        f.choicesAcross !== undefined || f.printedBelow !== undefined || f.inSentence !== undefined || f.inGridHead !== undefined
    ) ||
    edited.columns.some((c) => c.beneath !== undefined || c.printedLabel !== undefined);
  if (issued && !saysPaper) {
    const issuedBoxes = new Map([...issued.headerFields, ...(issued.footerFields ?? [])].map((f) => [f.key, f]));
    const issuedColumns = new Map(issued.columns.map((c) => [c.key, c]));
    // The paper's own words and places of a box (§111): its printed value, the table and lines printed above it, how
    // many boxes stand to a line from it, the words printed beside it — each where the edited box says nothing of its own.
    const box = (f: LogHeaderField): LogHeaderField => {
      const own = issuedBoxes.get(f.key);
      if (!own) return f;
      const paper: Partial<LogHeaderField> = {};
      if (own.printed !== undefined) paper.printed = own.printed;
      if (own.tableAbove !== undefined) paper.tableAbove = own.tableAbove;
      if (own.boxesPerLine !== undefined) paper.boxesPerLine = own.boxesPerLine;
      if (own.paperColumn !== undefined) paper.paperColumn = own.paperColumn;
      if (own.boxTable !== undefined) paper.boxTable = own.boxTable;
      // The paper's own marks (part 4): its choices printed across, its words under the box, its sentence.
      if (own.choicesAcross !== undefined && sameChoices(own, f)) paper.choicesAcross = own.choicesAcross;
      if (own.printedBelow !== undefined) paper.printedBelow = own.printedBelow;
      if (own.inSentence !== undefined) paper.inSentence = own.inSentence;
      if (own.inGridHead !== undefined) paper.inGridHead = own.inGridHead;
      if (own.printedAbove !== undefined && f.printedAbove === undefined) paper.printedAbove = own.printedAbove;
      if (own.printedLabel !== undefined && f.printedLabel === undefined) paper.printedLabel = own.printedLabel;
      return Object.keys(paper).length === 0 ? f : { ...f, ...paper };
    };
    const withdrawn = new Set(WITHDRAWN_EXPLANATIONS[edited.documentId] ?? []);
    const instructions = edited.instructions?.filter((line) => !withdrawn.has(line));
    out = {
      ...edited,
      ...(issued.srNoShowsDate ? { srNoShowsDate: issued.srNoShowsDate } : {}),
      ...(issued.secondLine ? { secondLine: issued.secondLine } : {}),
      ...(issued.notesBelow ? { notesBelow: issued.notesBelow } : {}),
      ...(issued.notesAtFoot ? { notesAtFoot: issued.notesAtFoot } : {}),
      ...(issued.headerColumns ? { headerColumns: issued.headerColumns } : {}),
      ...(issued.gridAcross ? { gridAcross: issued.gridAcross } : {}),
      ...(issued.srNoFullStop ? { srNoFullStop: issued.srNoFullStop } : {}),
      ...(issued.headingsAsPrinted ? { headingsAsPrinted: issued.headingsAsPrinted } : {}),
      // The one answer across the paper's columns (F/QC/25); a column the edit took off and it is drawn as every grid is (answerAcrossOf).
      ...(issued.answerAcross ? { answerAcross: issued.answerAcross } : {}),
      instructions: instructions && instructions.length > 0 ? instructions : undefined,
      // A table the paper prints among the boxes that the edited format never held (F/QC/25's letterhead, part 4)
      // comes with the box it stands above; the format's own tables are kept as they are.
      ...placedTablesFrom(issued, edited),
      headerFields: edited.headerFields.map(box),
      footerFields: edited.footerFields?.map(box),
      columns: edited.columns.map((c) => {
        const own = issuedColumns.get(c.key);
        const paper: Partial<LogColumn> = {};
        if (own?.beneath !== undefined) paper.beneath = own.beneath;
        if (own?.printedLabel !== undefined) paper.printedLabel = own.printedLabel;
        return Object.keys(paper).length === 0 ? c : { ...c, ...paper };
      }),
    };
    if (edited.instructions === undefined) delete out.instructions;
    if (edited.footerFields === undefined) delete out.footerFields;
  }
  asPaper.set(edited, out);
  return out;
}

// ONE NUMBER PER LINE IN AN EDITED FORMAT TOO (REQUIREMENTS §102). A format the plant
// edited before the issued layouts stopped numbering their lines in their words keeps
// "1. I can freely ..." in its stored lines; it is read without the line's own number, so
// a new record never takes the number again. The same object until the edit changes.
const unnumbered = new WeakMap<LogSheetLayout, LogSheetLayout>();
function printedLinesOnce(layout: LogSheetLayout): LogSheetLayout {
  const known = unnumbered.get(layout);
  if (known) return known;
  let out = layout;
  const mode = layout.rowMode;
  const ownNumbers = layout.ownLineNumbers === true || LOG_SHEET_LAYOUTS[layout.documentId]?.ownLineNumbers === true;
  if (mode.kind === "fixedRows" && !ownNumbers) {
    let changed = false;
    const rows = mode.rows.map((row, i) => {
      let line: typeof row | null = null;
      for (const [key, value] of Object.entries(row)) {
        const once = withoutLineNumber(value, i + 1);
        if (once === value) continue;
        line = line ?? { ...row };
        line[key] = once as string;
      }
      if (line) changed = true;
      return line ?? row;
    });
    if (changed) out = { ...layout, rowMode: { ...mode, rows } };
  }
  unnumbered.set(layout, out);
  return out;
}

export function getIssuedLogSheetLayout(documentId: string): LogSheetLayout | undefined {
  return LOG_SHEET_LAYOUTS[documentId];
}

// The layout ONE RECORD is drawn, checked and edited with (REQUIREMENTS §74).
// A record filled on a revision the format has since replaced names it
// (RecordInstance.formatRevision), and when the current layout lists that
// revision among its supersededRevisions the record keeps the layout it was
// written on — F/MNT/11's 2024 Day/Night lux readings on Rev 00. Every other
// record, which names no revision or names the current one, reads with the
// layout as it stands now, exactly as getLogSheetLayout gives it.
export function getLogSheetLayoutForRecord(documentId: string, record?: { formatRevision?: string } | null): LogSheetLayout | undefined {
  const current = getLogSheetLayout(documentId);
  const revision = record?.formatRevision;
  if (!revision) return current;
  return current?.supersededRevisions?.[revision]?.layout ?? current;
}
