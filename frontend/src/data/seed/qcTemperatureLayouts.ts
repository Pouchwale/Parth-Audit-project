import type { LogColumn, LogSheetLayout } from "../../types";

// F-QC-40.A AND F-QC-40.B, THE TEMPERATURE MONITORING RECORDS OF THE PRINTING AREA, THE INK KITCHEN AND THE WARE
// HOUSE, AND OF THE SLEEVE DIVISION (REQUIREMENTS §111, part 8). The owner sent both blank formats on 14-Oct-2026
// ("F-QC-40  -TEMPERATURE Monitoring-A.pdf" and "-B.pdf", source-documents/qc-originals-2026-10-13/); until then they
// were on the Master List of Formats only (F/SYS/02: F-QC-40. A, Rev 02 of 01.07.2026; F-QC-40. B, Rev 00 of
// 28.02.2025). F-QC-40.C, the hot room's, is logSheetLayouts.ts "qc-temperature", and these follow it: one record a
// day holding the day's line, DATE the record's day, every reading with its sign under it in the paper's one cell
// (the entry's second line, headed with nothing), headed SR NO in the paper's letters.
//
// The papers print SR NO 1 to 31, a month's days on one page; DCRS keeps the day's line as a record of its own, as
// it does F-QC-40.C's, so the readings are judged, reminded and reported day by day.

/** A reading and the sign under it in its cell: the shift's QC lab executive signs (engine/autoFill.ts signFor). */
const reading = (key: string, heading: string, time: string, band: { nominal: number; min: number; max: number }): LogColumn[] => [
  { key, label: heading, type: "number", unit: "°C", ...band, decimals: 0, required: true, width: 110 },
  {
    key: `${key}Sign`,
    label: `${heading.replace(/ TEMP\. \+ SIGN$/, "")} SIGN`,
    type: "text",
    required: true,
    beneath: key,
    width: 110,
    autoFill: { sign: true, atTime: time },
  },
];

/** F-QC-40.B: "SLEEVE DIVISION 28°C ± 2°C". */
const SLEEVE = { nominal: 28, min: 26, max: 30 };

/**
 * F-QC-40.A's three times, each "08:30 HRS" over the one cell the temperature and the humidity are written in and
 * the sign under them: "RECOMMENDED TEMPERATURE & HUMIDITY : 25°C ± 2°C / 45 ± 5%". The two readings are columns of
 * their own under the time (a group that prints no heading of its own over each, so the paper's one heading is drawn
 * over both), each judged by its own band; the sign is under the temperature, on the entry's second line.
 */
const timeAndSign = (key: string, time: string): LogColumn[] => {
  const heading = `${time} HRS`;
  return [
    { key, label: `${heading} TEMPERATURE`, printedLabel: "", group: heading, type: "number", unit: "°C", nominal: 25, min: 23, max: 27, decimals: 0, required: true, width: 80 },
    { key: `${key}Humidity`, label: `${heading} HUMIDITY`, printedLabel: "", group: heading, type: "number", unit: "%", nominal: 45, min: 40, max: 50, decimals: 0, required: true, width: 80 },
    {
      key: `${key}Sign`,
      label: `${heading} SIGN`,
      type: "text",
      required: true,
      beneath: key,
      width: 110,
      autoFill: { sign: true, atTime: time },
    },
  ];
};

/** F-QC-40.A's areas, as the paper prints them across its AREA line, the one the sheet is for marked. */
export const MONITORED_AREAS = ["PRINTING", "INK KITCHEN", "WARE HOUSE"];

export const QC_TEMPERATURE_LAYOUTS: Record<string, LogSheetLayout> = {
  // ---- F-QC-40.A — TEMPERATURE & HUMIDITY MONITORING RECORD (02/01.07.26)
  // As the paper: the recommended line; AREA: PRINTING/ INK KITCHEN/ WARE HOUSE at the left of the next line and
  // M/C NO. : at its right; "MONITORING RECORD - TIME & SIGN." across the table; SR NO | DATE | 08:30 HRS | 12:30 HRS |
  // 16:30 HRS. The Excel page also prints, outside its print area at the right, a second copy of its number and its
  // M/C NO. box under "PRINTING AREA & INK KITCHEN, WARE HOUSE:" — a leftover of the workbook, not part of the form.
  "qc-temperature-humidity": {
    documentId: "qc-temperature-humidity",
    paperTitle: "TEMPERATURE & HUMIDITY MONITORING RECORD",
    // The paper's line across the top of its table, under its boxes.
    boxesAboveInstructions: true,
    instructions: ["MONITORING RECORD - TIME & SIGN."],
    headingsAsPrinted: true,
    srNoLabel: "SR NO",
    secondLine: { label: "" },
    headerFields: [
      {
        key: "area",
        label: "AREA:",
        type: "select",
        options: MONITORED_AREAS,
        // The paper's words, "PRINTING/ INK KITCHEN/ WARE HOUSE", the one the sheet is for marked.
        choicesAcross: ["PRINTING/", "INK KITCHEN/", "WARE HOUSE"],
        required: true,
        autoFill: { carryForward: true },
        printedAbove: ["RECOMMENDED TEMPERATURE & HUMIDITY : 25°C ± 2°C / 45 ± 5%"],
        boxesPerLine: 2,
      },
      { key: "machineNo", label: "M/C NO. :", type: "text", list: "equipment-machines", autoFill: { carryForward: true } },
    ],
    columns: [
      { key: "date", label: "DATE", type: "date", width: 130, autoFill: { dueDate: true } },
      ...timeAndSign("t0830", "08:30"),
      ...timeAndSign("t1230", "12:30"),
      ...timeAndSign("t1630", "16:30"),
    ],
    rowMode: { kind: "single" },
    // Demo Mode's and a sample day's sheet is the printing area's (engine/autoFill.ts names its machine); a Live sheet's
    // area and machine are the person's.
    specimenHeader: { area: "PRINTING" },
    specimenSource: "F-QC-40  -TEMPERATURE Monitoring-A.pdf (the blank format, Rev 02 of 01.07.26, supplied 14-Oct-2026)",
    originalPages: [{ src: "/source/fqc40a-temperature-humidity-monitoring.jpg", caption: "F-QC-40.A (02/01.07.26) - Temperature & Humidity Monitoring Record, the blank format as supplied on 14-Oct-2026" }],
  },

  // ---- F-QC-40.B — TEMPERATURE MONITORING RECORD (00/28.02.25)
  // As the paper: the recommended temperature for the sleeve division, then SR NO | DATE | six readings, each
  // "... HRS TEMP. + SIGN" — the same paper as F-QC-40.C, the hot room's, with the sleeve division's 28°C ± 2°C.
  "qc-temperature-sleeve": {
    documentId: "qc-temperature-sleeve",
    paperTitle: "TEMPERATURE MONITORING RECORD",
    instructions: ["RECOMMENDED TEMPERATURE : SLEEVE DIVISION 28°C ± 2°C"],
    headingsAsPrinted: true,
    srNoLabel: "SR NO",
    secondLine: { label: "" },
    headerFields: [],
    columns: [
      { key: "date", label: "DATE", type: "date", width: 130, autoFill: { dueDate: true } },
      ...reading("t0830", "08:30 HRS TEMP. + SIGN", "08:30", SLEEVE),
      ...reading("t1230", "12:30 HRS TEMP. + SIGN", "12:30", SLEEVE),
      ...reading("t1630", "16:30 HRS TEMP. + SIGN", "16:30", SLEEVE),
      ...reading("t2030", "20:30 HRS TEMP. + SIGN", "20:30", SLEEVE),
      ...reading("t0030", "12:30am HRS TEMP. + SIGN", "00:30", SLEEVE),
      ...reading("t0430", "04:30 HRS TEMP. + SIGN", "04:30", SLEEVE),
    ],
    rowMode: { kind: "single" },
    specimenSource: "F-QC-40  -TEMPERATURE Monitoring-B.pdf (the blank format, Rev 00 of 28.02.25, supplied 14-Oct-2026)",
    originalPages: [{ src: "/source/fqc40b-temperature-monitoring-sleeve.jpg", caption: "F-QC-40.B (00/28.02.25) - Temperature Monitoring Record, Sleeve Division, the blank format as supplied on 14-Oct-2026" }],
  },
};
