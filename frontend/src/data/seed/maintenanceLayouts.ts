import type { LogColumn, LogSheetLayout } from "../../types";

// MAINTENANCE — THE EIGHT FORMATS THE DEPARTMENT SUPPLIED (REQUIREMENTS §74).
//
// The company's Master List of Formats & Records (F/SYS/02) lists eleven
// F/MNT formats. Eight were supplied on 24-Sep-2026 and are built here, from
// the pages themselves (source-documents/F-MNT-*.pdf, rendered unaltered to
// frontend/public/source/fmnt*.jpg so each can be shown beside its form):
//
//   F/MNT/01  List of Equipments & Utilities — the EQUIPMENT MASTER. The
//             other formats fetch a machine from it (engine/equipmentMaster.ts).
//   F/MNT/02  Preventive Maintenance Schedule & Record — built at Rev 01, the
//             higher of the two revisions supplied. The Rev 00 "CHECK LIST &
//             RECORD" page is shown as the superseded original.
//   F/MNT/03  Yearly Preventive Maintenance Schedule.
//   F/MNT/04  Daily Equipment Health Status & Cleaning Record — printed in
//             HINDI and GUJARATI side by side.
//   F/MNT/06  Equipments Breakdown Maintenance Record — its TOTAL BREAKDOWN
//             MINUTES is worked out, never typed (engine/maintenanceCalc.ts).
//   F/MNT/08  New Equipment Installation Report.
//   F/MNT/09  List of Glass Articles & Weekly Glass Breakage Monitoring Record.
//   F/MNT/11  Lux Level Measurement Record — built at Rev 01; the filled Rev 00
//             page of 11.05.2024 keeps its own Day/Night layout (a record is
//             read under the revision it was made on).
//
// NOT SUPPLIED, and so not built — nothing stands in for them: F/MNT/05
// Breakdown intimation Slip, F/MNT/07 Temporary engineering record, F/MNT/10
// Weekly Wooden article condition monitoring record.
//
// VERBATIM MEANS VERBATIM. Every label below is the paper's own wording and
// spelling — "Equipoment Name", "Monthaly", "Machine discription", "BREKAGE",
// "VARIFIED", "Articals", "Trail Production date", "Accessible & ease to
// clean", "Poucing", "Itlay", "Febraury" — because a controlled format is
// reproduced, not corrected. Where a page's text layer was garbled (the Hindi
// and Gujarati of F/MNT/04) the words were read from the rendered page instead.
//
// WHERE A GRID IS TURNED, AND WHY. The rule followed is the paper's own shape:
// a matrix of ITEMS down and PERIODS across (F/MNT/03's machines by month,
// F/MNT/09's areas by week) is kept exactly as printed. F/MNT/04 is different:
// its rows are not items but the same two marks (a tick and the operator)
// repeated for 31 days in two half-month strips, so each DAY is made a line
// with its day-shift and night-shift marks side by side — the words are all
// the paper's, only the strip is turned so that a day is entered in one place.

/** A supplied page, shown unaltered beside the form (REQUIREMENTS §71). */
const page = (file: string, caption: string) => ({ src: `/source/${file}`, caption });

// ===========================================================================
// F/MNT/01 — LIST OF EQUIPMENTS & UTILITIES (the Equipment Master)
// ===========================================================================

/**
 * The 43 machines on the page, cell for cell. The numbering has gaps
 * (M-05, M-16/17, M-22..32, M-37..43, M-61..67, M-69..82) — the file name says
 * "Flexo & Pouch" but only the Flexo list and one Common forklift are on it.
 *
 * M-68 IS PRINTED ONE COLUMN OUT OF STEP ON THE PAPER ITSELF: the manufacturer
 * cell is empty and every value after it sits one box to the right, so the
 * page reads Country of Origin "DCM Sleeve Seaming", Size "France", Year
 * "December", Serial No. "2023". It is kept as printed and flagged for the
 * department to confirm (engine/insights.ts reports it), rather than quietly
 * straightened. M-85's Location / Room is blank on the page.
 */
export const EQUIPMENT_LIST_ROWS: Record<string, string>[] = (
  [
    ["M-01", "Flexo", "Gallus Printing", "Gallus Ferd Reusch Gmbh", "Gallus ECS 340", "UV Flexo Printing Machine", "Germany", "340 mm", "November", "2014", "340-224"],
    ["M-02", "Flexo", "Gallus Printing", "UV Graphics Pvt Ltd", "UltraFlex Video Plate Mounter", "Flexo Plate Mounter", "India", "370 mm", "December", "2014", "NA"],
    ["M-03", "Flexo", "Label Stock Store", "C Trivedi Pvt Ltd", "FireSlit 1000", "Jumbo Roll Slitting Machine", "India", "1000 mm", "January", "2012", "NA"],
    ["M-04", "Flexo", "Packing", "C Trivedi Pvt Ltd", "Corecut", "Core Cutting Machine", "India", "1000 mm", "NA", "2012", "NA"],
    ["M-06", "Flexo", "Slitting room", "C Trivedi Pvt Ltd", "FireSlit 350", "Label slitting Machine", "India", "350 mm", "NA", "2018", "NA"],
    ["M-07", "Flexo", "Packing", "Zhejiang Machinery Co Ltd", "DK-450", "Label Slitting Machine", "China", "450 mm", "July", "2015", "153Q721M"],
    ["M-08", "Flexo", "Sleeve", "HCI Converting Co Ltd", "FK 250 PVC", "Sleeve Seaming Machine", "Taiwan", "500 mm", "March", "2007", "320-206-121"],
    ["M-09", "Flexo", "Sleeve", "XL Plastics Pvt Ltd", "DynaStar", "Sheet Cutting Machine", "India", "250 mm", "March", "2011", "2706138"],
    ["M-10", "Flexo", "Sleeve", "Kanara Packaging", "Easy Cut", "Sheet Cutting Machine", "India", "250 mm", "NA", "2016", "NA"],
    ["M-11", "Flexo", "Punching", "Brison Inc", "Fast Punch", "Die Cutting Machine", "China", "450 mm", "December", "2017", "450-14"],
    ["M-12", "Flexo", "Punching", "Zonten", "Zonten Diecutting", "Die Cutting Machine", "Spain", "400 mm", "", "-", "-"],
    ["M-13", "Flexo", "QC", "Brison Inc", "Brison 370", "Label Inspection Machine", "China", "350 mm", "February", "2018", "370-15"],
    ["M-14", "Flexo", "QC", "Brison Inc", "Brison 370", "Label Inspection Machine", "China", "350 mm", "February", "2018", "370-16"],
    ["M-15", "Flexo", "QC", "BST Sayona GmBh", "Perfecto Slit 450", "Label Inspection Machine", "Germany", "450 mm", "October", "2014", "NA"],
    ["M-18", "Flexo", "Ink Kitchen", "Harper Scientific Technologies", "Roll Kit", "Ink Rollup Kit", "India", "80 mm", "November", "2015", "NA"],
    ["M-19", "Flexo", "Aquaflex Printing", "Brison Inc", "Anilox Cleaner", "Anilox Cleaner", "China", "450 mm", "April", "2018", "NA"],
    ["M-20", "Flexo", "Label Stock Store", "Eagle Pvt Ltd", "Crane", "Overhead Crane", "India", "10'x40'", "NA", "2011", "NA"],
    ["M-21", "Flexo", "Walk Way", "Eagle Pvt Ltd", "Lift", "Materials Lift", "India", "6'x5'x25'", "NA", "2015", "NA"],
    ["M-33", "Common", "Forklift", "Toyota Industry Co. Ltd.", "FDZN30", "Petrol Powered Forklift", "Japan", "2850 Kg", "NA", "2017", "FDZN30-26489"],
    ["M-34", "Flexo", "Flexo Utility Room", "Elgi Equipments Limited", "ELLen-7", "Compressor", "India", "1.71 m3/min", "NA", "2014", "GNFC370139"],
    ["M-35", "Flexo", "Flexo Utility Room", "Elgi Equipments Limited", "ELRD-100", "Dryer", "India", "100 CFM", "NA", "2014", "8788-08-14"],
    ["M-36", "Flexo", "Flexo Utility Room", "Hyfra Industrukuhalanlagen GmbH", "SVK540-1-S", "Chiller", "India", "60600 / 42 C", "NA", "2014", "13050606"],
    ["M-44", "Flexo", "QC", "Brison Inc", "Brison 300", "Label Inspection Machine", "China", "300 mm", "Febraury", "2018", "16"],
    ["M-45", "Flexo", "Slitting room", "Brison Inc", "Brison 450", "Label slitting Machine", "China", "450 mm", "April", "2020", "DCGFQ450"],
    ["M-46", "Flexo", "QC", "Zhejiang Machinery Co Ltd", "NA", "Label Inspection Machine - Manual", "China", "350 mm", "July", "2015", "1435461-M"],
    ["M-47", "Flexo", "Lombardi Printing", "Lombardi", "Delta 330", "UV Flexo Printing Machine", "Itlay", "330 mm", "November", "2021", "88562"],
    ["M-48", "Flexo", "Lombardi Printing", "Brison Inc", "UltraFlex Video Plate Mounter", "Flexo Plate Mounter", "India", "370 mm", "November", "2021", "NA"],
    ["M-49", "Flexo", "Lombardi Printing", "Elgi Equipments Limited", "EGRD-080", "Air cooled dryer", "India", "NA", "November", "2021", "21T003086"],
    ["M-50", "Flexo", "Lombardi Printing", "Agnes", "NA", "Chiller", "India", "NA", "November", "2021", "NA"],
    ["M-51", "Flexo", "QC", "Wenhou Denchern Machinery Co. Ltd.", "HSR-550", "Slitting & Rewinding machine", "China", "550mm", "August", "2022", "22080301"],
    ["M-52", "Flexo", "QC", "-", "-", "Manual QC Inspection machine", "China", "350mm", "August", "2022", "-"],
    ["M-53", "Flexo", "QC", "-", "-", "Manual QC Inspection machine", "China", "350mm", "August", "2022", "-"],
    ["M-54", "Flexo", "QC", "Wenhou Denchern Machinery Co. Ltd.", "DCMF-480", "Semi rotary die cutting machine", "China", "480mm", "August", "2022", "22080302"],
    ["M-55", "Flexo", "QC", "Harmony", "Y-MQ-420", "Die Cutting Machine", "China", "400mm", "May", "2023", "23041503"],
    ["M-56", "Flexo", "QC", "-", "-", "Manual QC Inspection machine", "China", "350mm", "May", "2023", "-"],
    ["M-57", "Flexo", "QC", "-", "-", "Manual QC Inspection machine", "China", "350mm", "May", "2023", "-"],
    ["M-58", "Flexo", "QC", "Orthotec", "SRC3030", "Compact Screen printing machine", "Taiwan", "300*300mm", "April", "2023", "22073"],
    ["M-59", "Flexo", "QC", "Shenzhen", "450", "Brison QC Inspection machine", "China", "450mm", "June", "2023", "-"],
    ["M-60", "Flexo", "QC", "Wenhou Denchern Machinery Co. Ltd.", "SR-550", "Slitting & Rewinding machine", "China", "550mm", "June", "2023", "-"],
    ["M-68", "Flexo", "Sleeve", "", "DCM Usimeca", "1102-31203-SL3", "DCM Sleeve Seaming", "France", "", "December", "2023"],
    ["M-83", "Flexo", "Lombardi Printing", "Lombardi", "Delta 430", "UV Flexo Printing Machine", "Itlay", "430 mm", "November", "2018", "A0199"],
    ["M-84", "Flexo", "Lombardi Printing", "Brison Inc", "UltraFlex Video Plate Mounter", "Flexo Plate Mounter", "India", "580 mm", "November", "2021", "NA"],
    ["M-85", "Flexo", "", "Brotech", "Konika Minolta - DP330", "Digital printing machine", "Japan", "330 mm", "June", "2025", "BTHD2505004"],
  ] as const
).map(([machineNo, department, location, manufacturer, model, description, countryOfOrigin, size, month, year, serialNo]) => ({
  machineNo,
  department,
  location,
  manufacturer,
  model,
  description,
  countryOfOrigin,
  size,
  month,
  year,
  serialNo,
}));

const EQUIPMENT_LIST: LogSheetLayout = {
  documentId: "mnt-equipment-list",
  headerFields: [],
  // Eleven headings as printed. "Department" on this page holds a plant
  // SECTION (Flexo / Common), not one of the system's department codes, and
  // must never be read as one. The Month heading wraps on the paper as
  // "manufactur / e" in a narrow box; the word is "manufacture".
  columns: [
    { key: "machineNo", label: "Machine No.", type: "text", required: true, width: 90 },
    { key: "department", label: "Department", type: "text", width: 100 },
    { key: "location", label: "Location / Room", type: "text", width: 150 },
    { key: "manufacturer", label: "Machine Manufacturer Name", type: "text", width: 220 },
    { key: "model", label: "Machine Name / Model No.", type: "text", width: 200 },
    { key: "description", label: "Machine Description", type: "text", width: 210 },
    { key: "countryOfOrigin", label: "Country of Origin", type: "text", width: 120 },
    { key: "size", label: "Machine Size / Capacity", type: "text", width: 120 },
    { key: "month", label: "Month of manufacture", type: "text", width: 110 },
    { key: "year", label: "Year of Manufacture", type: "text", width: 100 },
    { key: "serialNo", label: "Serial No.", type: "text", width: 130 },
  ],
  // A list, not a period's sheet: a machine is added as a new line.
  rowMode: { kind: "free", minRows: 1, typicalRows: EQUIPMENT_LIST_ROWS.length },
  specimenRows: EQUIPMENT_LIST_ROWS,
  originalPages: [page("fmnt01-equipment-list-p1.jpg", "F/MNT/01 (00/01.12.2021) — List of Equipments & Utilities, as supplied")],
  specimenSource: "F-MNT- 01_Master List of Equipments-Flexo & Pouch.pdf — F/MNT/01 (00/01.12.2021), 43 machines; row M-68 printed one column out of step",
};

// ===========================================================================
// F/MNT/02 — PREVENTIVE MAINTENANCE SCHEDULE & RECORD (Rev 01)
// ===========================================================================

/**
 * The PM slots the Rev 01 page prints, in its order: twelve monthly, four
 * quarterly, two six-monthly and one yearly — each a Date / Maintenance /
 * Supervisor triple. The page prints no number on a slot, so none is added:
 * the sheet's own Sr. No. tells them apart.
 */
const PM_SLOTS: string[] = [
  ...Array.from({ length: 12 }, () => "Monthly Preventive maintenance"),
  ...Array.from({ length: 4 }, () => "Quarterly Preventive maintenance"),
  ...Array.from({ length: 2 }, () => "Six monthly Preventive maintenance"),
  "Yearly Preventive maintenance",
];

const PM_RECORD: LogSheetLayout = {
  documentId: "mnt-pm-record",
  // Printed under the grid on page 1, verbatim.
  instructions: [
    "Hygiene clearance: - Prior to start of Maintenance activity, Product & product contact surfaces shall be adequately isolated / protected from maintenance debris, tools, cotton waste, lubricants etc. Maintenance Technician / Production in charge shall ensure that all the Maintenance related tools, lubricants, cotton waste, spares, are removed from the equipments after completion of the maintenance activity. Respective product supervisor/ in charge shall verify & acknowledge that post maintenance activity, equipment & Product contact surface is free from all tools, lubricant, cotton waste etc.",
  ],
  // One sheet per machine: picked from the Equipment Master (F/MNT/01) by its
  // Machine No., which fills the name (engine/equipmentMaster.ts). The four
  // check-point lists are the machine's own and are carried to its next sheet.
  headerFields: [
    { key: "machineName", label: "Machine Name:", type: "text", required: true, autoFill: { carryForward: true } },
    { key: "machineIdNo", label: "Machine Identification No", type: "text", required: true, autoFill: { carryForward: true } },
    { key: "monthlyCheckPoints", label: "Monthly Check points", type: "paragraph", autoFill: { carryForward: true } },
    { key: "quarterlyCheckPoints", label: "3 Monthly Check points", type: "paragraph", autoFill: { carryForward: true } },
    { key: "sixMonthlyCheckPoints", label: "6 Monthly Check points", type: "paragraph", autoFill: { carryForward: true } },
    { key: "yearlyCheckPoints", label: "Yearly Check points", type: "paragraph", autoFill: { carryForward: true } },
  ],
  // PAGE 2 IS JOINED TO THE SLOT IT DESCRIBES. Its table — "Date of Preventive
  // maintenance / Any abnormal findings / learning or observation / Action
  // taken" — records what a particular PM visit found; on paper the date has
  // to be written twice to tie the two pages together. Here each slot carries
  // its own findings and action, so they can never drift apart. The quarterly
  // block prints its headings abbreviated ("Maint.", "S/visor"); the columns
  // use the full words the other three blocks print.
  columns: [
    { key: "parameter", label: "Preventive maintenance", type: "text", fixed: true, width: 250 },
    { key: "date", label: "Date", type: "date", width: 130 },
    { key: "maintenance", label: "Maintenance", type: "text", width: 160 },
    { key: "supervisor", label: "Supervisor", type: "text", width: 160 },
    { key: "findings", label: "Any abnormal findings / learning or observation", type: "text", width: 260, group: "Remarks / Any abnormal observation or findings during preventive maintenance" },
    { key: "actionTaken", label: "Action taken", type: "text", width: 220, group: "Remarks / Any abnormal observation or findings during preventive maintenance" },
  ],
  rowMode: { kind: "fixedRows", rows: PM_SLOTS.map((parameter) => ({ parameter })) },
  // A sheet is filled over a machine's year, visit by visit, so a new one
  // starts with the machine and nothing else. The sample is the plant's own
  // M-47 from the Equipment Master.
  specimenHeader: { machineName: "Delta 330", machineIdNo: "M-47" },
  originalPages: [
    page("fmnt02-rev01-pm-schedule-record-p1.jpg", "F/MNT/02 Rev 01 — Preventive Maintenance Schedule & Record, page 1 of 2, as supplied"),
    page("fmnt02-rev01-pm-schedule-record-p2.jpg", "F/MNT/02 Rev 01 — page 2 of 2 (remarks and findings), as supplied"),
    page("fmnt02-rev00-pm-checklist-record-p1.jpg", "F/MNT/02 Rev 00 (00/01.12.2021) — the SUPERSEDED Preventive Maintenance Check List & Record, as supplied"),
  ],
  specimenSource: "F-MNT-02_PM schedule & record-1.pdf — F/MNT/02 Rev 01, Date 01.12.2021 (blank format, two pages)",
};

// ===========================================================================
// F/MNT/03 — YEARLY PREVENTIVE MAINTENANCE SCHEDULE
// ===========================================================================

// The months exactly as the paper heads them, dots and all.
const MONTHS: { key: string; label: string }[] = [
  { key: "jan", label: "Jan" },
  { key: "feb", label: "Feb" },
  { key: "mar", label: "Mar." },
  { key: "apr", label: "Apr" },
  { key: "may", label: "May" },
  { key: "jun", label: "Jun." },
  { key: "jul", label: "July" },
  { key: "aug", label: "Aug." },
  { key: "sep", label: "Sep." },
  { key: "oct", label: "Oct." },
  { key: "nov", label: "Nov." },
  { key: "dec", label: "Dec." },
];

/** The Plan / Actual column key for a month, e.g. janPlan. */
export const pmScheduleKey = (month: string, which: "Plan" | "Actual") => `${month}${which}`;
export const PM_SCHEDULE_MONTH_KEYS = MONTHS.map((m) => m.key);

const FREQUENCIES = ["Monthaly", "Half Yearly", "Yearly"];

const YEARLY_PM_SCHEDULE: LogSheetLayout = {
  documentId: "mnt-yearly-pm-schedule",
  headerFields: [],
  // The paper writes Plan and Actual as two lines under each frequency and the
  // months across. Here Plan and Actual sit side by side under each month's
  // heading instead — the F/HR/09 training calendar's shape — so a month's
  // plan and what was actually done are read in one place, and a slipped PM
  // is visible on the line itself. Every heading is the paper's.
  columns: [
    { key: "equipment", label: "Equipoment Name", type: "text", fixed: true, width: 150 },
    { key: "frequency", label: "Frequency", type: "text", fixed: true, width: 110 },
    ...MONTHS.flatMap((m): LogColumn[] => [
      { key: pmScheduleKey(m.key, "Plan"), label: "Plan", type: "text", width: 62, group: m.label },
      { key: pmScheduleKey(m.key, "Actual"), label: "Actual", type: "text", width: 62, group: m.label },
    ]),
  ],
  // Three machine blocks, as printed: PRINTING MACHINE, SLITTING MACHINE and a
  // third block whose name the paper leaves blank for the plant to write in —
  // so that name box is left open here too.
  rowMode: {
    kind: "fixedRows",
    rows: ["PRINTING MACHINE", "SLITTING MACHINE", ""].flatMap((equipment) => FREQUENCIES.map((frequency) => ({ equipment, frequency }))),
  },
  // The only marks on the supplied page: PRINTING MACHINE monthly, planned
  // 10.01 and done 28.01; SLITTING MACHINE monthly, planned 12.01. The page
  // prints no year, so they are the specimen, not a record of a year.
  specimenRows: [{ janPlan: "10.01", janActual: "28.01" }, {}, {}, { janPlan: "12.01" }],
  originalPages: [page("fmnt03-yearly-pm-schedule-p1.jpg", "F/MNT/03 (00/01.12.2021) — Yearly Preventive Maintenance Schedule, as supplied")],
  specimenSource: "F-MNT-03_Yearly PM Schedule .pdf — F/MNT/03 (00/01.12.2021); January marks only, year not printed",
};

// ===========================================================================
// F/MNT/04 — DAILY EQUIPMENT HEALTH STATUS & CLEANING RECORD
// ===========================================================================

/**
 * The check parameters, HINDI and GUJARATI side by side as the page prints
 * them, read from the rendered page (the PDF's text layer is mis-encoded:
 * "मर्ीन" for "मशीन", "બલકેગે" for "લિકેગે"). The paper's own spellings are
 * kept: "अनावस्यक", "તાપસ", "કરવની", "સુપરવયज़र". Each pair is one line, as
 * each is one row of the paper's table.
 */
export const MNT04_CHECK_PARAMETERS: [hindi: string, gujarati: string, english: string][] = [
  ["मशीन को साफ करे ।", "મશીન સાફ કરવું .", "Clean the machine."],
  ["इलेक्ट्रिक पैनलों की जाँच करे।", "ઇલેક્ટ્રિક પેનલ્સ તપાસો.", "Check the electrical panels."],
  ["मशीन में कुछ अलग सी आवाज़ आ रहीं है ?", "મશીનમાં કઈ અલગ અવાજ આવે છે ?", "Is the machine making any unusual sound?"],
  ["कोई पाइप लीकेज है ?", "કોઈ એર પાઇપ લિકેગે છે કે નહિ તે તાપસ કરવું.", "Is there any pipe leakage? Check whether any air pipe is leaking or not."],
  [
    "सप्ताह में एक बार, जब भी मशीन बंद होती है, तो आपातकालीन बटन दबाने से मशीन बंद होती है या नहीं यह जाँच करे?",
    "અઠવાડિયામાં એકવાર, જ્યારે પણ મશીન બંધ હોય, ત્યારે ઇમરજન્સી બટન દબાવવાથી મશીન બંધ થાય છે કે નહિ તે ચેક કરવું",
    "Once a week, whenever the machine is stopped, check whether pressing the emergency button stops the machine.",
  ],
  ["मशीन के एयर प्रेशर और वाटर प्रेशर चेक करे|", "મશીન ના તમામ હવા ના દબાણ અને પાણી ના દબાણ તપાસો.", "Check all of the machine's air pressures and its water pressure."],
  [
    "कृपया काम करने वाले फर्श पर पड़े हुए अनावस्यक उपकरणों और ब्लेड को उठवा ले |",
    "કૃપા કરીને કામ કરવની જગ્યા (ફ્લૉર)પર પડેલા બિનજરૂરી સાધનો અને બ્લેડ દૂર કરવો .",
    "Please have unnecessary tools and blades lying on the working floor picked up and removed.",
  ],
];

// The two footnotes, each on its own line on the paper (the Gujarati in bold).
export const MNT04_FOOTNOTES: [printed: string, english: string][] = [
  ["* उपरोक्त चेक पैरामीटर ध्यानमें लेकर मशीनमें कोई दिक्कतें हो तो सुपरवयज़रको बताइये |", "* Keeping the above check parameters in mind, tell the supervisor if the machine has any problem."],
  ["* ઉપરનાં ચેક પેરામીટર ધ્યાનમાં લઈ મશીનમાં કઇ ખામી હોય તો સુપરવાયઝરને જાણ કરવી.", "* Keeping the above check parameters in mind, inform the supervisor if the machine has any fault."],
];

/** One printed row of the check-parameter table: Hindi | Gujarati. */
const bilingual = (hindi: string, gujarati: string) => `${hindi}  |  ${gujarati}`;

/**
 * THE FORM IN ENGLISH, for i18n/documentTextEn.ts (REQUIREMENTS §58): with
 * English chosen the Hindi and Gujarati lines read in the plant's own English,
 * with no network; with Gujarati chosen the form reads exactly as issued.
 */
export const MNT04_TEXT_EN: Record<string, string> = {
  ...Object.fromEntries(MNT04_CHECK_PARAMETERS.map(([h, g, en]) => [bilingual(h, g), en])),
  ...Object.fromEntries(MNT04_FOOTNOTES),
};

const DAILY_HEALTH: LogSheetLayout = {
  documentId: "mnt-daily-health",
  instructions: ["Check Parameter", ...MNT04_CHECK_PARAMETERS.map(([h, g]) => bilingual(h, g)), ...MNT04_FOOTNOTES.map(([printed]) => printed)],
  // "Month & Year : -" and the two machine boxes, verbatim with the paper's
  // "discription". The machine comes from the Equipment Master (F/MNT/01).
  headerFields: [
    { key: "monthYear", label: "Month & Year : -", type: "text" },
    { key: "machineDescription", label: "Machine discription :", type: "text", required: true, autoFill: { carryForward: true } },
    { key: "machineNo", label: "Machine No. :", type: "text", required: true, autoFill: { carryForward: true } },
  ],
  columns: [
    { key: "date", label: "Date", type: "text", fixed: true, width: 60 },
    { key: "dayCheck", label: "✓", type: "select", options: ["✓"], width: 70, group: "DAY SHIFT" },
    { key: "dayOperator", label: "Operator", type: "text", width: 170, group: "DAY SHIFT", autoFill: { sign: true } },
    { key: "nightCheck", label: "✓", type: "select", options: ["✓"], width: 70, group: "NIGHT SHIFT" },
    { key: "nightOperator", label: "Operator", type: "text", width: 170, group: "NIGHT SHIFT", autoFill: { sign: true } },
  ],
  rowMode: { kind: "fixedRows", rows: Array.from({ length: 31 }, (_, i) => ({ date: String(i + 1) })) },
  // "PTO": the paper sends observations to the back of the sheet. The back was
  // not supplied; the box below is where those details go, under the paper's
  // own sentence.
  footerFields: [
    {
      key: "observations",
      label: "If any Observation found by operator , details of concerns & actions taken shall be described on back side of this page.",
      type: "paragraph",
    },
  ],
  specimenHeader: { machineDescription: "UV Flexo Printing Machine", machineNo: "M-47" },
  specimenRows: Array.from({ length: 31 }, () => ({ dayCheck: "✓", nightCheck: "✓" })),
  originalPages: [page("fmnt04-daily-equipment-health-p1.jpg", "F/MNT/04 (00/01.12.2021) — Daily Equipment Health Status & Cleaning Record, as supplied (Hindi and Gujarati)")],
  specimenSource: "F-MNT-04_Daily Equipment Health Status & Cleaning Record.pdf — F/MNT/04 (00/01.12.2021), blank format; Hindi and Gujarati read from the rendered page",
};

// ===========================================================================
// F/MNT/06 — EQUIPMENTS BREAKDOWN MAINTENANCE RECORD
// ===========================================================================

const HISTORY = "BREAKDOWN HISTORY";
const MATERIALS = "USED MATERIALS";
const SUMMARY = "BREAKDOWN HISTORY & SUMMARY";

const BREAKDOWN_RECORD: LogSheetLayout = {
  documentId: "mnt-breakdown-record",
  headerFields: [],
  // The three spanning headings and ACTION TAKEN between them, as printed. The
  // paper's own SR.NO. sits inside BREAKDOWN HISTORY; the sheet draws its own
  // Sr. No. down the side, so it is not declared again and that heading spans
  // six columns here rather than seven.
  columns: [
    { key: "failureDate", label: "EQUIPMENT FAILURE REPORTED DATE", type: "date", required: true, width: 130, group: HISTORY, autoFill: { dueDate: true } },
    { key: "failureTime", label: "EQUIPMENT FAILURE REPORTED TIME", type: "time", required: true, width: 110, group: HISTORY },
    { key: "equipmentName", label: "EQUIPMENT NAME", type: "text", required: true, width: 170, group: HISTORY },
    { key: "equipmentIdNo", label: "EQUIPMENT ID NO.", type: "text", required: true, width: 100, group: HISTORY },
    { key: "faultReported", label: "FAULT REPORTED", type: "text", required: true, width: 210, group: HISTORY },
    { key: "faultAttendedBy", label: "FAULT ATTEND. BY", type: "text", width: 150, group: HISTORY, autoFill: { sign: true } },
    { key: "actionTaken", label: "ACTION TAKEN", type: "text", required: true, width: 220 },
    { key: "specification", label: "SPECIFICATION", type: "text", width: 150, group: MATERIALS },
    { key: "qty", label: "QTY.", type: "text", width: 70, group: MATERIALS },
    { key: "repairedDate", label: "EQUIPMENT REPAIRED DATE", type: "date", width: 130, group: SUMMARY, autoFill: { dueDate: true } },
    { key: "repairedTime", label: "EQUIPMENT REPAIRED TIME", type: "time", width: 110, group: SUMMARY },
    // WORKED OUT, NEVER TYPED (engine/maintenanceCalc.ts): the minutes between
    // the failure being reported and the machine being repaired. Never
    // required, so an open breakdown can still be written down.
    { key: "totalBreakdownMinutes", label: "TOTAL BREAKDOWN MINUTES", type: "text", computed: true, width: 110, group: SUMMARY },
    { key: "productionLossMinutes", label: "PRODUCTION LOSS MINUTES", type: "number", decimals: 0, width: 110, group: SUMMARY },
    { key: "reason", label: "REASON For Breakdown", type: "text", width: 200, group: SUMMARY },
  ],
  rowMode: { kind: "free", minRows: 1, typicalRows: 2 },
  // The page is blank. These are SAMPLE lines to be checked, on the plant's
  // own machines from F/MNT/01 — never a record of a breakdown that happened.
  specimenRows: [
    {
      failureTime: "10:15",
      equipmentName: "Delta 330",
      equipmentIdNo: "M-47",
      faultReported: "Web break at the UV curing station",
      actionTaken: "Web re-threaded, tension roller cleaned and re-set",
      specification: "",
      qty: "",
      repairedTime: "11:40",
      productionLossMinutes: 85,
      reason: "Tension roller fouled with ink",
    },
    {
      failureTime: "14:05",
      equipmentName: "ELLen-7",
      equipmentIdNo: "M-34",
      faultReported: "Compressor tripping on high temperature",
      actionTaken: "Air filter changed, cooler fins cleaned",
      specification: "Air filter element",
      qty: "1",
      repairedTime: "15:10",
      productionLossMinutes: 40,
      reason: "Choked air filter",
    },
  ],
  originalPages: [page("fmnt06-breakdown-record-p1.jpg", "F/MNT/06 (00/01.12.2021) — Equipments Breakdown Maintenance Record, as supplied")],
  specimenSource: "F-MNT-06_Equipment breakdown record.pdf — F/MNT/06 (00/01.12.2021), blank format; the lines are sample breakdowns to be checked",
};

// ===========================================================================
// F/MNT/08 — NEW EQUIPMENT INSTALLATION REPORT
// ===========================================================================

// The ten requirements, in the paper's words: "ease to clean" and "Trail
// Production date" are the page's own.
const INSTALLATION_REQUIREMENTS = [
  "Meets production needs:\n• Adequate capacity\n• Dust control\n• Cleanout capabilities",
  "Accessible & ease to clean",
  "Accessible & easy to Maintain",
  "Prevents contamination of product during operations (i.e., lubricants/hydraulic fluid are food grade)",
  "Incorporates controls to address food safety i.e., magnet, screener, filters",
  "Operational manual & Service manual provided by machine manufacturer",
  "Manufacturer/Supplier of equipment provided employee training.",
  "Spares provided by Machine manufacturer",
  "Trail Production date",
  "Productivity as per expected criteria",
];

const HANDOVER = "Hand over & Take over Protocol";

const NEW_EQUIPMENT: LogSheetLayout = {
  documentId: "mnt-new-equipment",
  // Printed on page 2 between the Risks box and the hand-over signatures: the
  // declaration the three heads sign under.
  instructions: ["The Benefits and Risks have been assessed, PM, Sanitation etc. Attach any supportive documents, procedures photos. Approval has been made."],
  // A NEW machine is not on the Equipment Master yet — it goes onto F/MNT/01
  // once installed — so these boxes are written, not fetched.
  headerFields: [
    { key: "equipmentName", label: "Name of Equipment:", type: "text", required: true, autoFill: { carryForward: true } },
    { key: "manufacturer", label: "Manufacturer:", type: "text", autoFill: { carryForward: true } },
    { key: "supplier", label: "Supplier (contact information)", type: "text", autoFill: { carryForward: true } },
    { key: "modelSerial", label: "Model & Serial Number:", type: "text", autoFill: { carryForward: true } },
    { key: "locationFunction", label: "Location and Function of Equipment:", type: "paragraph", autoFill: { carryForward: true } },
  ],
  columns: [
    { key: "parameter", label: "Requirement", type: "text", fixed: true, width: 330 },
    // The paper heads it "Y/N", so the two answers are its own letters.
    { key: "assessment", label: "Assessment of Equipment Y/N", type: "select", options: ["Y", "N"], required: true, width: 130 },
    { key: "comments", label: "Comments along with date of action", type: "text", width: 300 },
  ],
  rowMode: { kind: "fixedRows", rows: INSTALLATION_REQUIREMENTS.map((parameter) => ({ parameter })) },
  footerFields: [
    { key: "benefits", label: "Benefits:", type: "paragraph" },
    { key: "risks", label: "Risks including deviation accepted conditionally:", type: "paragraph" },
    { key: "maintenanceHead", label: `${HANDOVER} — Maintenance Head: -`, type: "text", autoFill: { sign: true } },
    { key: "maintenanceHeadDate", label: `${HANDOVER} — Maintenance Head — Date:`, type: "date", autoFill: { dueDate: true } },
    { key: "productionHead", label: `${HANDOVER} — Production Head: -`, type: "text" },
    { key: "productionHeadDate", label: `${HANDOVER} — Production Head — Date:`, type: "date" },
    { key: "qcHead", label: `${HANDOVER} — QC Head: -`, type: "text" },
    { key: "qcHeadDate", label: `${HANDOVER} — QC Head — Date:`, type: "date" },
  ],
  // The sample is the plant's newest machine on F/MNT/01 — M-85, the Konika
  // Minolta DP330 digital press of June 2025 — as it would have been written
  // up when it came in. Sample data, to be checked.
  specimenHeader: {
    equipmentName: "Konika Minolta - DP330",
    manufacturer: "Brotech",
    supplier: "",
    modelSerial: "Konika Minolta - DP330 / BTHD2505004",
    locationFunction: "Digital printing machine",
  },
  specimenRows: INSTALLATION_REQUIREMENTS.map(() => ({ assessment: "Y" })),
  originalPages: [
    page("fmnt08-new-equipment-installation-p1.jpg", "F/MNT/08 (00/01.12.2021) — New Equipment Installation Report, page 1, as supplied"),
    page("fmnt08-new-equipment-installation-p2.jpg", "F/MNT/08 — page 2 (benefits, risks and hand-over), as supplied"),
  ],
  specimenSource: "F-MNT-08_New Equipment Installation & commissioning record.pdf — F/MNT/08 (00/01.12.2021), blank format (two pages)",
};

// ===========================================================================
// F/MNT/09 — LIST OF GLASS ARTICLES & WEEKLY GLASS BREAKAGE MONITORING RECORD
// ===========================================================================

/**
 * PAGE 1 — the list of glass and brittle plastic articles by area, at Rev 02
 * (01.09.2025), cell for cell. Every row total and column total on the page
 * was added up by hand and is right; the page leaves the grand total blank
 * (it would be 3,980) and so does this. The list IS the format: it changes by
 * revising F/MNT/09, which is what the revision history below records — so it
 * is printed text of the format, not something a week's sheet fills in.
 */
export const GLASS_ARTICLE_TYPES = ["Glass Window/Door", "Acrylic Sheets for False Ceiling", "Tubelight", "CCTV Camera", "LED Light", "Monitor+TV", "Insect Killer"];

export const GLASS_ARTICLES: [area: string, counts: number[], total: number][] = [
  ["QC+Slitting", [9, 780, 80, 7, 38, 5, 1], 920],
  ["AKO 320 Room + outside Area", [18, 297, 0, 3, 0, 4, 0], 322],
  ["Sleeve Room", [8, 202, 20, 2, 18, 3, 1], 254],
  ["Utility Room", [3, 0, 2, 1, 0, 0, 0], 6],
  ["Ink kitchen", [20, 0, 2, 4, 8, 1, 0], 35],
  ["Pasting Area", [62, 312, 22, 6, 31, 5, 1], 439],
  ["Gallus Area + PPC", [48, 417, 0, 6, 52, 5, 3], 531],
  ["Pouching Area", [26, 292, 19, 10, 44, 1, 1], 393],
  ["Lamination Area", [34, 310, 2, 6, 24, 0, 0], 376],
  ["Lab Area", [19, 122, 0, 2, 17, 1, 0], 161],
  ["AKO 520 + Lombardi Area", [30, 283, 31, 9, 46, 8, 1], 408],
  ["Warehouse", [72, 0, 4, 10, 46, 3, 0], 135],
];
const GLASS_TOTALS = [349, 3015, 182, 66, 324, 36, 8];

/**
 * PAGE 2 — the weekly monitoring grid. Its area names are NOT page 1's: the
 * page writes "Qc+Slitting", "Ink kitchen And Screen Room", "Gallus Area" and
 * "Old Lab Area" where page 1 has "QC+Slitting", "Ink kitchen", "Gallus Area +
 * PPC" and "Lab Area". Both are kept as printed.
 */
export const GLASS_MONITORING_AREAS = [
  "Qc+Slitting",
  "AKO 320 Room + outside Area",
  "Sleeve Room",
  "Utility Room",
  "Ink kitchen And Screen Room",
  "Pasting Area",
  "Gallus Area",
  "Pouching Area",
  "Lamination Area",
  "Old Lab Area",
  "AKO 520 + Lombardi Area",
  "Warehouse",
];
export const GLASS_DATE_ROW = "Date of monitoring";
export const GLASS_BREAKAGE_ROW = "BREAKAGE – YES / NO";
export const GLASS_CHECKED_ROW = "CHECKED BY - TECHNICIAN – MAINTENANCE";
export const GLASS_VERIFIED_ROW = "VARIFIED BY – HOD MAINTENANCE";

// The week headings, dash for dash: weeks 1 and 5 are printed with a hyphen,
// weeks 2 to 4 with an en dash.
const GLASS_WEEKS: { key: string; label: string }[] = [
  { key: "week1", label: "Week - 1" },
  { key: "week2", label: "Week – 2" },
  { key: "week3", label: "Week – 3" },
  { key: "week4", label: "Week – 4" },
  { key: "week5", label: "Week - 5" },
];

const GLASS_BREAKAGE: LogSheetLayout = {
  documentId: "mnt-glass-breakage",
  // The four instructions printed beside the grid, verbatim ("In-charge" is
  // hyphenated across a line on the paper).
  instructions: [
    "• Pl checks the condition of Glass / Brittle Plastic article for any sign of breakage / cracks as per List of Glass articles mentioned above.",
    "• In case of any crack or breakage of Glass / Brittle Plastic article is noted during Weekly monitoring, Maintenance Fitter shall immediately inform to Maintenance In-charge as well as HOD of the area, where deviation found",
    "• Please refer SOP for Handling of Glass breakage for prevention of cross contamination of affected products",
    "• Pl fill up CA / Incident record along with root cause analysis, correction & corrective action for actual breakage or crack",
  ],
  headerFields: [{ key: "monthYear", label: "Month & Year", type: "text" }],
  referenceTables: [
    {
      title: "Nos. & Type of articles",
      columns: ["Location / Area Of Glass", ...GLASS_ARTICLE_TYPES, "Total Qty"],
      rows: [
        ...GLASS_ARTICLES.map(([area, counts, total]) => [area, ...counts.map(String), String(total)]),
        ["TOTAL", ...GLASS_TOTALS.map(String), ""],
      ],
    },
    {
      title: "Revision history for update in addition / removal of Glass & Brittle plastic articles",
      columns: ["Rev. no.", "Effective date", "Details of change", "Reason for change"],
      rows: [
        ["1.", "15.12.2024", "New Glass Articals Added", "New Warehouse Constructed & Old Paper Godown Converted To Pouching Department"],
        ["2.", "01.09.2025", "New Glass Articals Added", "New ink kitchen added, Old ink kitchen merged with slitting room"],
        ["3.", "", "", ""],
      ],
    },
  ],
  columns: [
    { key: "parameter", label: "Monitoring Weeks", type: "text", fixed: true, width: 290 },
    ...GLASS_WEEKS.map((w): LogColumn => ({ key: w.key, label: w.label, type: "text", width: 115 })),
  ],
  rowMode: {
    kind: "fixedRows",
    rows: [GLASS_DATE_ROW, ...GLASS_MONITORING_AREAS, GLASS_BREAKAGE_ROW, GLASS_CHECKED_ROW, GLASS_VERIFIED_ROW].map((parameter) => ({ parameter })),
  },
  // Sample: four weeks checked with nothing broken. The dates are left for the
  // person — a sample must never invent the days a check was made — and the
  // two signatures are the department's own people (hrRecords.ts): Rahul Patel
  // (Supervisor - Mentainance) and Mukesh Patel (Manager - Mentainance).
  specimenRows: [
    {},
    ...GLASS_MONITORING_AREAS.map(() => ({ week1: "✓", week2: "✓", week3: "✓", week4: "✓" })),
    { week1: "NO", week2: "NO", week3: "NO", week4: "NO" },
    { week1: "Rahul Patel", week2: "Rahul Patel", week3: "Rahul Patel", week4: "Rahul Patel" },
    { week1: "Mukesh Patel", week2: "Mukesh Patel", week3: "Mukesh Patel", week4: "Mukesh Patel" },
  ],
  originalPages: [
    page("fmnt09-glass-articles-p1.jpg", "F/MNT/09 (02 / 01.09.2025) — List of Glass Articles and revision history, page 1, as supplied"),
    page("fmnt09-glass-articles-p2.jpg", "F/MNT/09 — Weekly Glass Breakage Monitoring Record, page 2, as supplied"),
  ],
  specimenSource: "F-MNT-09_List of Glass articles & weekly Glass Breakage monitoring record Dt.17-01-2024 (1) (2).pdf — F/MNT/09 (02 / 01.09.2025)",
};

// ===========================================================================
// F/MNT/11 — LUX LEVEL MEASUREMENT RECORD (Rev 01, and the superseded Rev 00)
// ===========================================================================

/** The lux meter, printed in the form's header on both revisions. */
const LUX_METER_FIELDS = [
  { key: "makeModel", label: "Make/Model:", type: "text" as const, required: true, autoFill: { default: "Kusam-Meco/KM-LUX-99" } },
  { key: "serialNo", label: "Sr.No.:", type: "text" as const, required: true, autoFill: { default: "S1135510" } },
  { key: "range", label: "Range:", type: "text" as const, autoFill: { default: "0 to 2000/20000 Lux" } },
];

const LUX_METER_VALUES = { makeModel: "Kusam-Meco/KM-LUX-99", serialNo: "S1135510", range: "0 to 2000/20000 Lux" };

/** Rev 01 (01/15.12.2024): 26 areas and one Lux Level, filled 12.08.2025. */
export const LUX_REV01_READINGS: [area: string, lux: number][] = [
  ["Printing machine - Ground Floor", 1750],
  ["Anilox cleaning area - Ground floor", 880],
  ["Store - Label stock & PVC / PET Films - Ground floor", 1250],
  ["Ink store - Ground floor", 500],
  ["FG Dispatch room - Ground floor", 760],
  ["Walkways - Ground Floor", 810],
  ["First floor - Walkways", 860],
  ["First floor - Slitting & Packing", 1007],
  ["First floor - Offline punching & QC Inspection", 1130],
  ["First floor - Printing machine", 1240],
  ["First floor - Ink Kitchen", 843],
  ["First floor - Shrink Sleeve production", 1024],
  ["First floor - Intermediate Store", 690],
  ["Change room & Locker room - Ground Floor", 1060],
  ["Ground floor - Doctoring Area", 445],
  ["Ground floor - Slitting Area", 560],
  ["Ground floor - Printing Area", 926],
  ["Ground floor - Printing Area -AKO 520", 1840],
  ["Ground floor - Lamination Area", 549],
  ["Ground floor - Poucing Area", 540],
  ["Ground floor - QC & Packing Area", 560],
  ["QC Lab", 1522],
  ["QC Lab - Colour matching cabinet", 1025],
  ["Printing machine - Ground Floor- Colour matching cabinet", 1184],
  ["First floor - Printing machine - Colour matching cabinet", 1970],
  ["Canteen", 1100],
];

/** Rev 00 (00/01.12.2021): 19 areas, Day and Night, filled 11.05.2024. */
export const LUX_REV00_READINGS: [area: string, day: number, night: number][] = [
  ["Printing machine - Ground Floor", 1672, 1548],
  ["Anilox cleaning area - Ground floor", 824, 800],
  ["Store - Label stock & PVC / PET Films - Ground floor", 1370, 1289],
  ["Ink store - Ground floor", 488, 432],
  ["FG Dispatch room - Ground floor", 652, 550],
  ["Walkways - Ground Floor", 758, 516],
  ["First floor - Walkways", 748, 698],
  ["First floor - Slitting & Packing", 934, 950],
  ["First floor - Offline punching & QC Inspection", 1238, 900],
  ["First floor - Printing machine", 1386, 1241],
  ["First floor - Ink Kitchen", 935, 850],
  ["First floor - Shrink Sleeve production", 1271, 1150],
  ["First floor - Intermediate Store", 788, 687],
  ["Change room & Locker room - Ground Floor", 755, 670],
  ["QC Lab", 1665, 1642],
  ["QC Lab - Colour matching cabinet", 1863, 1821],
  ["Printing machine - Ground Floor- Colour matching cabinet", 1902, 1784],
  ["First floor - Printing machine - Colour matching cabinet", 1878, 1823],
  ["Canteen", 1021, 900],
];

/**
 * THE SUPERSEDED REVISION, kept so that the page filled on it reads as it was
 * written (REQUIREMENTS §74): Rev 00 measured every area by DAY and by NIGHT,
 * over 19 areas. Rev 01 (15.12.2024) dropped the night reading and added the
 * seven ground-floor production areas. A record pinned to "00" is drawn,
 * printed and checked with this layout, never the current one.
 */
const LUX_REV00: LogSheetLayout = {
  documentId: "mnt-lux-level",
  headerFields: LUX_METER_FIELDS,
  columns: [
    { key: "parameter", label: "Area & Location", type: "text", fixed: true, width: 380 },
    { key: "measurementDate", label: "Date of Measurement", type: "date", required: true, width: 150 },
    { key: "luxDay", label: "Lux Level (Day)", type: "number", decimals: 0, required: true, width: 130 },
    { key: "luxNight", label: "Lux Level (Night)", type: "number", decimals: 0, required: true, width: 130 },
  ],
  rowMode: { kind: "fixedRows", rows: LUX_REV00_READINGS.map(([parameter]) => ({ parameter })) },
  specimenSource: "F-MNT-11_LUX LEVEL MEASUREMENT RECORD-2.pdf — F/MNT/11 (00/01.12.2021), filled 11.05.2024",
};

const LUX_LEVEL: LogSheetLayout = {
  documentId: "mnt-lux-level",
  headerFields: LUX_METER_FIELDS,
  columns: [
    { key: "parameter", label: "Area & Location", type: "text", fixed: true, width: 380 },
    { key: "measurementDate", label: "Date of Measurement", type: "date", required: true, width: 150, autoFill: { dueDate: true } },
    { key: "luxLevel", label: "Lux Level", type: "number", decimals: 0, required: true, width: 130 },
  ],
  rowMode: { kind: "fixedRows", rows: LUX_REV01_READINGS.map(([parameter]) => ({ parameter })) },
  specimenHeader: LUX_METER_VALUES,
  // The supplied 12.08.2025 readings are the specimen — a sample fill shows
  // them as sample data to be measured again, never as a new measurement.
  specimenRows: LUX_REV01_READINGS.map(([, luxLevel]) => ({ luxLevel })),
  supersededRevisions: {
    "00": {
      revisionDate: "2021-12-01",
      layout: LUX_REV00,
      note: "Rev 00 measured Day and Night over 19 areas; Rev 01 (15.12.2024) measures one Lux Level over 26.",
    },
  },
  originalPages: [
    page("fmnt11-rev01-lux-2025-p1.jpg", "F/MNT/11 Rev 01 (01/15.12.2024) — filled 12.08.2025, as supplied"),
    page("fmnt11-rev00-lux-2024-p1.jpg", "F/MNT/11 Rev 00 (00/01.12.2021), the SUPERSEDED revision — filled 11.05.2024, as supplied"),
  ],
  specimenSource: "F-MNT-11_LUX LEVEL MEASUREMENT RECORD.pdf — F/MNT/11 (01/15.12.2024), filled 12.08.2025",
};

export const LUX_METER = LUX_METER_VALUES;

export const MAINTENANCE_LAYOUTS: Record<string, LogSheetLayout> = {
  [EQUIPMENT_LIST.documentId]: EQUIPMENT_LIST,
  [PM_RECORD.documentId]: PM_RECORD,
  [YEARLY_PM_SCHEDULE.documentId]: YEARLY_PM_SCHEDULE,
  [DAILY_HEALTH.documentId]: DAILY_HEALTH,
  [BREAKDOWN_RECORD.documentId]: BREAKDOWN_RECORD,
  [NEW_EQUIPMENT.documentId]: NEW_EQUIPMENT,
  [GLASS_BREAKAGE.documentId]: GLASS_BREAKAGE,
  [LUX_LEVEL.documentId]: LUX_LEVEL,
};
