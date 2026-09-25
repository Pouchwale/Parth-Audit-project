import type { LogColumn, LogHeaderField, LogSheetLayout } from "../../types";
import { HR_LAYOUTS } from "./hrLayouts";
import { QC_CALIBRATION_LAYOUTS } from "./qcCalibrationLayouts";
import { QC_INCOMING_LAYOUTS } from "./qcIncomingLayouts";
import { QC_LINE_CLEARANCE_LAYOUTS } from "./qcLineClearanceLayouts";
import { QC_GUJARATI_LINE_CLEARANCE_LAYOUTS } from "./qcGujaratiLineClearanceLayouts";
import { QC_REGISTER_LAYOUTS } from "./qcRegisterLayouts";
import { QC_COA_LAYOUTS } from "./qcCoaLayouts";
import { QC_REPORT_LAYOUTS } from "./qcReportLayouts";
import { PURCHASE_LAYOUTS } from "./purchaseLayouts";
import { DISPATCH_LAYOUTS } from "./dispatchLayouts";
import { STORE_LAYOUTS } from "./storeLayouts";
import { MAINTENANCE_LAYOUTS } from "./maintenanceLayouts";
import { SYS_DOCUMENT_CONTROL_LAYOUTS } from "./sysDocumentControlLayouts";
import { SYS_MANAGEMENT_REVIEW_LAYOUTS } from "./sysManagementReviewLayouts";
import { SYS_INTERNAL_AUDIT_LAYOUTS } from "./sysInternalAuditLayouts";
import { SYS_HARA_TRACEABILITY_LAYOUTS } from "./sysHaraTraceabilityLayouts";
import { formatEditFor } from "../formatEdits";

// Grid layouts for every "log-sheet" document, transcribed from the
// photographed specimens in the uploaded "Audit documents.zip" (WhatsApp
// images dated 2026-09-07). Column headings and instruction text are kept
// verbatim; specimen rows are the actual handwritten values (best-effort
// reads of handwriting are flagged in REQUIREMENTS.md).

const HOURLY_SLOTS = [
  "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00",
  "18:00", "19:00", "20:00", "21:00", "22:00", "23:00", "00:00", "01:00", "02:00",
  "03:00", "04:00", "05:00", "06:00", "07:00", "08:00",
];

export const LOG_SHEET_LAYOUTS: Record<string, LogSheetLayout> = {
  // ---- F-QC-30 — Lamination Adhesive Viscosity Record (Rev 00, 15.12.2024)
  "qc-viscosity": {
    documentId: "qc-viscosity",
    instructions: ["Viscosity specification: 20.0 ± 1.0 Sec. One reading every hour, round the clock (09:00 to 08:00 next day)."],
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
  "qc-adhesive-mixing": {
    documentId: "qc-adhesive-mixing",
    instructions: ["One row per adhesive batch mixed. Standard mix observed on the specimen: 15 kg adhesive : 1.65 kg hardener : 19.5 kg ethyl acetate."],
    headerFields: [],
    columns: [
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
      { time: "04:30", adhesive: 15, hardener: 1.65, ethyl: 19.5, viscosity: 19.9, remark: "", checkedBy: "Jeni", verifiedBy: "" },
      { time: "21:00", adhesive: 15, hardener: 1.65, ethyl: 19.5, viscosity: 19.76, remark: "", checkedBy: "Singh", verifiedBy: "" },
      { time: "02:50", adhesive: 15, hardener: 1.65, ethyl: 19.5, viscosity: 19.89, remark: "", checkedBy: "Singh", verifiedBy: "" },
      { time: "06:00", adhesive: 15, hardener: 1.65, ethyl: 19.5, viscosity: 20.15, remark: "", checkedBy: "Singh", verifiedBy: "" },
    ],
    specimenSource: "WhatsApp Image 2026-09-07 at 2.15.17 PM.jpeg (F-QC-32, filled 6/9/26 – 7/9/26)",
  },

  // ---- F-QC-40.C — Temperature Monitoring Record (00/28.02.25)
  "qc-temperature": {
    documentId: "qc-temperature",
    instructions: ["RECOMMENDED TEMPERATURE : HOT ROOM 45°C ± 2°C"],
    headerFields: [],
    columns: [
      { key: "t0830", label: "08:30 HRS TEMP.", type: "number", unit: "°C", nominal: 45, min: 43, max: 47, decimals: 0, required: true, width: 110 },
      { key: "t1230", label: "12:30 HRS TEMP.", type: "number", unit: "°C", nominal: 45, min: 43, max: 47, decimals: 0, required: true, width: 110 },
      { key: "t1630", label: "16:30 HRS TEMP.", type: "number", unit: "°C", nominal: 45, min: 43, max: 47, decimals: 0, required: true, width: 110 },
      { key: "t2030", label: "20:30 HRS TEMP.", type: "number", unit: "°C", nominal: 45, min: 43, max: 47, decimals: 0, required: true, width: 110 },
      { key: "t0030", label: "12:30am HRS TEMP.", type: "number", unit: "°C", nominal: 45, min: 43, max: 47, decimals: 0, required: true, width: 110 },
      { key: "t0430", label: "04:30 HRS TEMP.", type: "number", unit: "°C", nominal: 45, min: 43, max: 47, decimals: 0, required: true, width: 110 },
      { key: "sign", label: "Sign", type: "text", required: true, autoFill: { sign: true }, width: 140 },
    ],
    rowMode: { kind: "single" },
    specimenRows: [
      { t0830: 45, t1230: 45, t1630: 46, t2030: 44, t0030: 45, t0430: 46, sign: "" },
      { t0830: 44, t1230: 44, t1630: 45, t2030: 46, t0030: 44, t0430: 45, sign: "" },
      { t0830: 46, t1230: 44, t1630: 46, t2030: 45, t0030: 45, t0430: 44, sign: "" },
    ],
    specimenSource: "WhatsApp Image 2026-09-07 at 2.15.19 PM (1).jpeg (F-QC-40.C, filled 21-08-26 to 5-9-26)",
  },

  // ---- Solvent Base Lamination — Process Parameter Record (00/15.12.2024)
  "prd-process-parameter": {
    documentId: "prd-process-parameter",
    headerFields: [
      { key: "operatorName", label: "Operator Name", type: "text", required: true, autoFill: { carryForward: true, default: "Gaurav Singh" } },
      { key: "machineName", label: "Machine Name", type: "text", required: true, autoFill: { carryForward: true, default: "Lamination-1" } },
      { key: "shift", label: "Shift", type: "select", options: ["A", "B", "C"], required: true, autoFill: { default: "A" } },
      { key: "mixingRatio", label: "Adhesive + Hardener + Solvent Mixing Ratio", type: "text", autoFill: { carryForward: true, default: "10 : 1.1 : 9.5" } },
      { key: "adhesiveMake", label: "Adhesive (Make)", type: "text", autoFill: { carryForward: true, default: "DOW" } },
      { key: "adhesiveCode", label: "Adhesive (Product Code)", type: "text", autoFill: { carryForward: true, default: "545S" } },
      { key: "adhesiveBatch", label: "Adhesive (Batch Number)", type: "text", autoFill: { carryForward: true, default: "B35007107" } },
      { key: "hardenerMake", label: "Hardener (Make)", type: "text", autoFill: { carryForward: true, default: "DOW" } },
      { key: "hardenerCode", label: "Hardener (Product Code)", type: "text", autoFill: { carryForward: true, default: "F-854" } },
      { key: "hardenerBatch", label: "Hardener (Batch Number)", type: "text", autoFill: { carryForward: true, default: "44000N0301" } },
    ],
    columns: [
      { key: "poNo", label: "Internal PO No.", type: "text", required: true, width: 90 },
      { key: "fgCode", label: "FG Code", type: "text", required: true, width: 70 },
      { key: "jobName", label: "Job Name", type: "text", required: true, width: 190 },
      // Machine set-points: repeated verbatim job to job on the specimen, so
      // they are carried forward exactly; min/max only drive highlighting.
      { key: "coatingNip", label: "Coating Nip Pressure", type: "number", min: 2.5, max: 3.5, decimals: 2, autoFill: { carryForward: true, default: 3.0 }, width: 80 },
      { key: "doctorBlade", label: "Doctor Blade Pressure", type: "number", min: 1.5, max: 2.5, decimals: 2, autoFill: { carryForward: true, default: 2.0 }, width: 80 },
      { key: "primaryUw", label: "Primary U/W Tension", type: "number", min: 30, max: 50, decimals: 0, autoFill: { carryForward: true, default: 45 }, width: 80 },
      { key: "layOnRoll", label: "Lay On Roll Pressure", type: "number", min: 2.5, max: 3.5, decimals: 2, autoFill: { carryForward: true, default: 3.0 }, width: 80 },
      { key: "hoodA", label: "Hood A Temp.", type: "number", unit: "°C", min: 40, max: 45, decimals: 0, autoFill: { carryForward: true, default: 42 }, width: 70 },
      { key: "hoodB", label: "Hood B Temp.", type: "number", unit: "°C", min: 50, max: 55, decimals: 0, autoFill: { carryForward: true, default: 52 }, width: 70 },
      { key: "lineSpeed", label: "Line Speed", type: "number", min: 60, max: 140, decimals: 0, autoFill: { carryForward: true, default: 81 }, width: 70 },
      { key: "rewinderTension", label: "Rewinder Tension", type: "number", min: 30, max: 60, decimals: 0, autoFill: { carryForward: true, default: 52 }, width: 80 },
      { key: "secondaryUw", label: "Secondary U/W Tension", type: "number", min: 25, max: 45, decimals: 0, autoFill: { carryForward: true, default: 40 }, width: 80 },
      { key: "tapperTension", label: "Tapper Tension", type: "text", autoFill: { carryForward: true, default: "15%" }, width: 70 },
      { key: "laminatorNip", label: "Laminator Nip Pressure", type: "number", min: 5.5, max: 6.5, decimals: 2, autoFill: { carryForward: true, default: 6.0 }, width: 80 },
      { key: "laminationNipTemp", label: "Lamination Nip Temp.", type: "number", unit: "°C", min: 60, max: 90, decimals: 0, autoFill: { carryForward: true, default: 70 }, width: 80 },
    ],
    rowMode: { kind: "free", minRows: 1, typicalRows: 4 },
    specimenHeader: {
      operatorName: "Gaurav Singh", machineName: "Lamination-1", shift: "A", mixingRatio: "10 : 1.1 : 9.5",
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
  },

  // ---- F-PRD-18 — Solvent Base Lamination — ALC & Production Report (01/25.06.2025)
  "prd-alc-production": {
    documentId: "prd-alc-production",
    instructions: [
      "ALC PROTOCOL : Activity to make sure a production line & its processing area are completely cleared of any material from the previous process",
      "(1) Balance roll & scrap of Previous Job removed? (2) Film type & Width for Current Job verified as per New Job order? (3) Job change waste removed? (4) Finished Product Rolls of Previous Job shifted to designated place / Finish Goods Warehouse? (5) Tools & Tackles if any, removed from machine & put safely in toll box?",
    ],
    headerFields: [
      { key: "operatorName", label: "Operator Name", type: "text", required: true, autoFill: { carryForward: true, default: "Gaurav Singh" } },
      { key: "machineName", label: "Machine Name", type: "text", required: true, autoFill: { carryForward: true, default: "Lamination-1" } },
      { key: "shift", label: "Shift", type: "select", options: ["A", "B", "C"], required: true, autoFill: { default: "A" } },
    ],
    columns: [
      { key: "fgCode", label: "FG Code", type: "text", required: true, width: 70 },
      { key: "poNo", label: "Internal PO No.", type: "text", required: true, width: 90 },
      { key: "jobName", label: "Job Name", type: "text", required: true, width: 190 },
      { key: "layer1Type", label: "Layer 1 Type", type: "text", autoFill: { carryForward: true, default: "PET" }, width: 80 },
      // Actual weights / meters differ a little run to run — small jitter on
      // the carried-forward value rather than an exact copy.
      { key: "layer1Kg", label: "Layer 1 - Kgs.", type: "number", unit: "kg", decimals: 2, autoFill: { jitter: 0.03 }, width: 80 },
      { key: "layer2Type", label: "Layer 2 Type", type: "text", autoFill: { carryForward: true, default: "MetPET" }, width: 80 },
      { key: "layer2Kg", label: "Layer 2 - Kgs.", type: "number", unit: "kg", decimals: 2, autoFill: { jitter: 0.03 }, width: 80 },
      { key: "alcDone", label: "ALC Done As Per Above (Yes/No)", type: "yesno", required: true, autoFill: { carryForward: true, default: "Yes" }, width: 90 },
      { key: "operatorSign", label: "Operator Sign", type: "text", autoFill: { sign: true }, width: 120 },
      { key: "startTime", label: "Start Time", type: "time", autoFill: { carryForward: true }, width: 90 },
      { key: "endTime", label: "End Time", type: "time", autoFill: { carryForward: true }, width: 90 },
      { key: "rollWeight", label: "Laminated Roll Weight - Kgs.", type: "number", unit: "kg", decimals: 2, autoFill: { jitter: 0.03 }, width: 90 },
      { key: "okMeters", label: "OK Meters", type: "number", decimals: 0, autoFill: { jitter: 0.02 }, width: 80 },
      { key: "inTimeHotroom", label: "In Time (Hotroom)", type: "time", autoFill: { carryForward: true }, width: 90 },
    ],
    rowMode: { kind: "free", minRows: 1, typicalRows: 4 },
    specimenHeader: { operatorName: "Gaurav Singh", machineName: "Lamination-1", shift: "A" },
    specimenRows: [
      { fgCode: "7204", poNo: "88825", jobName: "VP Bedekar Fenugreek Powder", layer1Type: "PET", layer1Kg: 12, layer2Type: "MetPET", layer2Kg: 51.5, alcDone: "Yes", operatorSign: "Gaurav Singh", startTime: "09:00", endTime: "09:50", rollWeight: 69.1, okMeters: 1950, inTimeHotroom: "10:00" },
      { fgCode: "7205", poNo: "88826", jobName: "VP Bedekar Cumin Powder", layer1Type: "PET", layer1Kg: 12.5, layer2Type: "MetPET", layer2Kg: 51.1, alcDone: "Yes", operatorSign: "Gaurav Singh", startTime: "09:50", endTime: "10:45", rollWeight: 70.2, okMeters: 1950, inTimeHotroom: "10:50" },
      { fgCode: "7206", poNo: "88827", jobName: "VP Bedekar Jeshthamadh Powder", layer1Type: "PET", layer1Kg: 18, layer2Type: "MetPET", layer2Kg: 51.5, alcDone: "Yes", operatorSign: "Gaurav Singh", startTime: "10:45", endTime: "12:00", rollWeight: 70, okMeters: 1950, inTimeHotroom: "12:10" },
      { fgCode: "7202", poNo: "88823", jobName: "VP Bedekar Dry Ginger Powder", layer1Type: "PET", layer1Kg: 18, layer2Type: "MetPET", layer2Kg: 51, alcDone: "Yes", operatorSign: "Gaurav Singh", startTime: "12:00", endTime: "13:30", rollWeight: 70, okMeters: 1950, inTimeHotroom: "13:40" },
      { fgCode: "6766", poNo: "88903", jobName: "Sweet Karam Gusset", layer1Type: "BOPP", layer1Kg: null, layer2Type: "MetPET", layer2Kg: null, alcDone: "Yes", operatorSign: "Gaurav Singh", startTime: "13:30", endTime: "", rollWeight: null, okMeters: null, inTimeHotroom: "" },
    ],
    specimenSource: "WhatsApp Image 2026-09-07 at 2.15.20 PM.jpeg (F-PRD-18, filled 07-09-26, Shift A)",
  },
};

// ---------------------------------------------------------------------------
// QC INSPECTION RECORDS (F/QC/34, /35, /37) and IN-PROCESS QC (F/QC/13).
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

  // ---- F/QC/13 — In Process Quality Control (Gujarati form, printing) ----
  "qc-inprocess-printing": {
    documentId: "qc-inprocess-printing",
    instructions: [
      "પ્રોસીઝર:- ઉત્પાદનની પ્રક્રિયા દરમિયાન Q.A. વ્યક્તિ ખાતરી કરશે કે 3 પૂર્ણ સીટ્સના જોબના દર ૬૦૦૦ મીટરે નમુના લેવામાં આવે. તે નમુનાઓને નીચે જણાવેલા પોઈન્ટ પ્રમાણે ચકાસીને ગ્રેડ આપશે. જો કોઈ સમસ્યાઓની જાણ થાય તો તરત જ Q.A. મેનેજર અને સુપરવાઈઝર ને જાણ કરશે. જો મટીરીયલ્સ સ્વીકાર્ય છે, તો Q.A. મેનેજર તેમજ સુપરવાઈઝરની સહી કરાવવી આવશ્યક છે.",
      "ગ્રેડિંગ માપદંડ: બધા ગ્રેડ નીચે મુજબના માપદંડ મુજબ આપવા જોઈએ. જો કોઈ માપદંડમાં એફ ગ્રેડ આપવામાં આવે તો ઉત્પાદન બંધ કરવું આવશ્યક છે. જો ૧ થી વધુ સી ગ્રેડ મળી આવે, તો છાપવાનું બંધ કરવું જોઈએ અને ક્યુ.એ. મેનેજર કેવી રીતે આગળ વધવું તેના વિશે નિર્ણય કરશે. જો ૩ થી વધુ બી ગ્રેડ મળ્યા હોય, તો છાપવાનું બંધ કરવું જોઈએ અને ક્યુ.એ. મેનેજર કેવી રીતે આગળ વધવું તેના વિશે નિર્ણય કરશે.",
      "ખામી યુક્ત અપ્સ (બધીજ એકત્રિત સીટમાં) મુજબ ગ્રેડ: <11% of total ups = A · <21% = B · <25% = C · >25% = F. જો એરર્સ બેથી ઓછા અપ્સ માં માત્ર હોય તો એ ગ્રેડ આપવો.",
    ],
    headerFields: [
      { key: "itemCode", label: "આઇટમ કોડ (Item Code)", type: "text", required: true, autoFill: { carryForward: true } },
      { key: "poNumber", label: "પ્રો. નંબર (PO Number)", type: "text", required: true, autoFill: { carryForward: true } },
      { key: "machine", label: "મશીન (Machine)", type: "text", required: true, autoFill: { carryForward: true, default: "Lombardi" } },
      { key: "operator", label: "ઓપરેટર (Operator)", type: "text", autoFill: { carryForward: true, default: "Pankajbhai" } },
      { key: "qaPerson", label: "QA પર્સન (QA Person)", type: "text", required: true, autoFill: { sign: true } },
      { key: "sampleQty", label: "સેમ્પલ કોન્ટીટી (સીટ) (Sample Qty, sheets)", type: "text", autoFill: { carryForward: true, default: "1" } },
      { key: "totalUps", label: "ટોટલ નંબર ઓફ અપ્સ (Total Ups)", type: "text", autoFill: { carryForward: true } },
      { key: "orderLength", label: "ઓર્ડર લેન્થ ઈન મીટર (Order Length, m)", type: "text", autoFill: { carryForward: true } },
    ],
    columns: [
      { key: "parameter", label: "પેરામીટર (Parameter)", type: "text", fixed: true, width: 170 },
      { key: "testChart", label: "ટેસ્ટ ચાર્ટ (Test chart)", type: "text", fixed: true, width: 420 },
      { key: "grade", label: "ગ્રેડ (Grade)", type: "select", options: ["A", "B", "C", "F", "-"], required: true, autoFill: { carryForward: true }, width: 80 },
      { key: "pass", label: "પાસ? (Pass?)", type: "yesno", autoFill: { carryForward: true }, width: 80 },
      { key: "defectCount", label: "ખામી ગણતરી (Defect count)", type: "text", autoFill: { carryForward: true }, width: 110 },
    ],
    rowMode: {
      kind: "fixedRows",
      rows: [
        { parameter: "રજિસ્ટ્રેશન (Registration)", testChart: "બધા જ ચાર ખૂણાઓનું રજીસ્ટ્રેશન અને બબલ્સનું કેન્દ્ર નિયંત્રણમાં હોવું જોઈએ; બધાજ ઓવરલેપીંગ અને નિયંત્રણની નોંધણી ચશ્માંનો ઉપયોગ કરીને તપાસો." },
        { parameter: "શેડ (Shade)", testChart: "સીટના શેડને તપાસવા માટે શેડ કાર્ડ, પેન્ટોન કોડ અથવા છેલ્લા સ્વીકૃત સીટનો ઉપયોગ કરવો; ક્લાયન્ટની મેચીંગ સ્ટડી મુજબ જ શેડ મેચ થવો જોઈએ." },
        { parameter: "કોટીંગ (Coating)", testChart: "કોટીંગ સમાન રૂપે લાગુ થઈ રહ્યું છે અને લેમીનેશનમાં કોઈ બબલ્સની રચના નથી તેની ખાતરી કરો; વાર્નિશ ન હોય તેવા વિસ્તારો, અસમાન વાર્નિશ અને વિન્ડોઝના વિસ્તારમાં પણ વાર્નિશ તપાસો." },
        { parameter: "પંચીંગ (Punching)", testChart: "દરેક સીટમાં થોડું હાથથી પ્રેસર આપીને રીલીઝ લાઈનર તૂટતું નથી તે તપાસો; છીછરું પંચીંગ તપાસવા અમુક લેબલો કાઢીને નીચેથી પેપર જરાય તૂટે નહિ તે રીતે લેબલ આસાનીથી ઉખડે છે તેની તપાસ કરો." },
        { parameter: "પ્રિન્ટ પ્રેસર (Print pressure)", testChart: "લેબલના ચાર ખૂણા અને સીટના વચ્ચેના ભાગમાં ખુબ જ વધારે અથવા ખુબ જ ઓછા પ્રિન્ટીંગના દબાણને તપાસો; વધારે દબાણવાળા વિસ્તારો અને ઓછી/અસમાન છપાઈના હલ્કા વિસ્તારો પણ તપાસો." },
        { parameter: "પ્રિન્ટ ડીફોરમીટસ (Print deformities)", testChart: "હિકીઝ જેવી પ્રિન્ટ વિકૃતિઓ માટે સીટના બધા જ લેબલો તપાસો — બબલ્સ, ગુમ થયેલ છાપ/પ્રકાર, પેચો, રેખાઓ જેવી સમસ્યાઓ; મંજુર થયેલ આર્ટવર્કમાં અન્ય ચિહ્નો ન હોવા જોઈએ." },
      ],
    },
    footerFields: [
      { key: "mlDescription", label: "એમ.સી.નું વર્ણન (જો લાગુ પડતું હોય તો)", type: "text", autoFill: { default: "N/A" } },
      { key: "overrideReason", label: "સહી કરવાનું કારણ (ઓવરરાઈડ)", type: "text", autoFill: { default: "N/A" } },
      { key: "signOffName", label: "સાઇન ઓફ કરનાર વ્યક્તિનું નામ", type: "text", autoFill: { default: "N/A" } },
      { key: "remarks", label: "રિમાર્કસ (Remarks)", type: "text" },
      { key: "qaSign", label: "ક્યુ.એ.ની સહી (QA Sign)", type: "text", required: true, autoFill: { sign: true } },
    ],
    referenceTables: [
      {
        title: "ગ્રેડ ચાર્ટ (Grade chart) — A / B / C / F per parameter",
        columns: ["પેરામીટર", "A", "B", "C", "F"],
        rows: [
          ["રજિસ્ટ્રેશન", "બધા જ રજિસ્ટર સંપૂર્ણ પણે બરાબર છે; કોઈપણ પ્રિન્ટ ખરાબ થઈ નથી.", "રજિસ્ટરમાં અને પ્રિન્ટના વિસ્તારમાં ન્યૂનતમ ગેરરીતી મળી.", "રજિસ્ટરમાં મધ્યમ ગેરરીતી મળી, પરંતુ પ્રિન્ટ અને ટેક્સમાં ઓવર લાઈન્સ બતાવતું નથી.", "મોટી અને ગંભીર ગેરરીતીના મુદ્દાઓ અથવા ઓવરલેપ લાઈન્સ સ્પષ્ટ પણે દેખાય છે."],
          ["શેડ", "બધા જ શેડો કલરના સંદર્ભ મુજબ બરાબર મળી રહ્યા છે.", "લોગો બરાબર છે, પરંતુ બીજા કલરમાં નાના ફેરફારો જોવા મળે છે.", "લોગો અને પ્રોસેસ કલરમાં નાના ફેરફારો જોવા મળે છે.", "લોગોના કલરમાં મધ્યમ ફેરફારો અને બીજા કલરોમાં મોટા ફેરફારો જોવા મળે છે."],
          ["કોટીંગ", "કોટીંગના તમામ ક્ષેત્રો સરળ, સ્પોટ અને કરચલી વગરના મળી રહ્યા છે.", "કોટીંગવાળા વિસ્તારમાં નાની-નાની કરચલીઓ અને બબલ્સ મળી આવે છે.", "લોગો અને પ્રોસેસ કલરમાં નાના ફેરફારો જોવા મળે છે.", "લોગોના કલરમાં મધ્યમ ફેરફારો અને બીજા કલરોમાં મોટા ફેરફારો જોવા મળે છે."],
          ["પંચીંગ", "છીછરું પંચીંગ અથવા ગેરસમજ દેખાતી નથી.", "ઓછામાં ઓછું છીછરું પંચીંગ અથવા ખોટી નોંધણીનું અવલોકન થાય છે.", "ન્યૂનતમ છીછરું પંચીંગ અથવા મધ્યમ ગેરમાર્ગે પંચીંગ નજરમાં આવે છે (ટેક્સ પર મંજૂરી નથી).", "ખુબ જ વધારે છીછરું પંચીંગ / ભારે ગેરરીતી મળી."],
          ["પ્રિન્ટ પ્રેસર", "ઉચ્ચ અને નીચા છાપના દબાણવાળા કોઈપણ ક્ષેત્ર મળ્યા નથી.", "ન્યૂનતમ દબાણની સમસ્યા મળી; લોગો અને બારકોડ પર અસર થતી નથી.", "મધ્યમ દબાણની સમસ્યા મળી; લોગો અને બારકોડ પર અસર થતી નથી.", "લોગો અને બારકોડ પર મુખ્ય દબાણની અસર ગ્રસ્ત છે."],
          ["પ્રિન્ટ ડીફોરમીટસ", "કોઈ નાની અથવા મુખ્ય પ્રિન્ટની વિકૃતિનું અવલોકન થતું નથી.", "પ્રિન્ટ વિસ્તારમાં ફીકી અથવા નાની બબલ્સ મળી આવે છે.", "ટેક્સમાં, લોગોના કે નોન પ્રિન્ટ વિસ્તારમાં નાની વિકૃતિ મળી આવે છે.", "ફ્રેમ્સ, લોગોના કે નોન પ્રિન્ટ વિસ્તારમાં મોટી વિકૃતિ મળી આવે છે."],
        ],
      },
    ],
    specimenHeader: {
      itemCode: "FGLA 19377", poNumber: "89480", machine: "Lombardi", operator: "Pankajbhai", qaPerson: "HNP", sampleQty: "1", totalUps: "7", orderLength: "",
      mlDescription: "N/A", overrideReason: "N/A", signOffName: "N/A", remarks: "Adjust by Pankajbhai", qaSign: "HNP",
    },
    specimenRows: [
      { grade: "B", pass: "Yes", defectCount: "+2" }, { grade: "A", pass: "", defectCount: "-" }, { grade: "A", pass: "", defectCount: "-" },
      { grade: "-", pass: "", defectCount: "-" }, { grade: "A", pass: "", defectCount: "-" }, { grade: "B", pass: "", defectCount: "+2" },
    ],
    specimenSource: "Photographed F/QC/13 register, 2 pages (filled 6-9-26, Lombardi, PO 89480)",
  } satisfies LogSheetLayout,
});

// The sixteen Human Resources formats, F/HR/01 to F/HR/22 — data/seed/hrLayouts.ts.
Object.assign(LOG_SHEET_LAYOUTS, HR_LAYOUTS);
// Quality Control's two internal calibration records, F/QC/11 and F/QC/12.
Object.assign(LOG_SHEET_LAYOUTS, QC_CALIBRATION_LAYOUTS);

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

// The layout as it stands now: the plant's own change to the format where
// there is one (data/formatEdits.ts, REQUIREMENTS §62), the issued layout
// otherwise. `getIssuedLogSheetLayout` is the paper's own transcription.
export function getLogSheetLayout(documentId: string): LogSheetLayout | undefined {
  return formatEditFor(documentId)?.layout ?? LOG_SHEET_LAYOUTS[documentId];
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
