import type { LogSheetLayout } from "../../types";

// STORE — THE TWO FORMATS THE DEPARTMENT KEEPS (REQUIREMENTS §71).
//
// The company's own Master List of Formats & Records (F/SYS/02) lists exactly
// two F/STR formats, both issued 01.12.21, and the plant supplied both on
// 23-Sep-2026:
//
//   F/STR/01  Incoming Material & Vehicle inspection Record — supplied as a
//             photograph of the RUBBER STAMP itself. It is not a sheet: it is
//             stamped onto the incoming material paperwork and filled in by
//             hand, so it is a single form of labelled boxes with no grid and
//             no column headings at all. Every label below is the stamp's own
//             wording, letter for letter — "Foreign matter contaminaiton" and
//             "Oil Sport on Floor" are the stamp's spellings, not ours, and
//             they are kept because a controlled format is reproduced, not
//             corrected. The stamp itself is shown beside the form (§71), so
//             what was supplied can always be compared with what was built.
//   F/STR/02  Sharp Metal Objects Issuance (New) & Return (Old) Record — a
//             register: one line per blade, scissor or cutter issued, with
//             what came back against it.
//
// Both are transcribed from what the plant supplied, kept in source-documents/.

// ---------------------------------------------------------------------------
// F/STR/01 — the stamp
// ---------------------------------------------------------------------------
// The seven points the stamp prints, in the stamp's own order and spelling.
// Each is answered Yes or No — the stamp prints both words side by side and
// the checker strikes one out, which is a two-way choice and is offered as
// one. They carry forward from the last consignment, and the specimen below
// supplies the first: the answers a GOOD load gets. That matters — "Foreign
// matter contaminaiton: Yes" would mean the material arrived contaminated,
// so a specimen of "Yes" all the way down would record a load that was
// contaminated, smelt, had pest droppings on it, and was accepted anyway.
const STAMP_CHECKS: { key: string; label: string; good: string }[] = [
  { key: "vehicleCovered", label: "Vehicle covered", good: "Yes" },
  { key: "foreignMatterContaminaiton", label: "Foreign matter contaminaiton", good: "No" },
  { key: "objectionableOdour", label: "Objectionable Odour", good: "No" },
  { key: "areFloorAndSidesClean", label: "Are Floor & Sides Clean", good: "Yes" },
  { key: "oilSportOnFloor", label: "Oil Sport on Floor", good: "No" },
  { key: "signOfPestOrDropping", label: "Sign of pest or dropping", good: "No" },
  { key: "packagingIntegrity", label: "Packaging integrity", good: "Yes" },
];

const INCOMING_MATERIAL_VEHICLE: LogSheetLayout = {
  documentId: "str-incoming-material-vehicle",
  headerFields: [
    { key: "receivedDate", label: "Received date", type: "date", required: true, autoFill: { dueDate: true }, width: 180 },
    ...STAMP_CHECKS.map((c) => ({
      key: c.key,
      label: c.label,
      type: "yesno" as const,
      required: true,
      autoFill: { carryForward: true },
      width: 240,
    })),
  ],
  // No grid: the stamp has none. It is one form, filled once per consignment.
  columns: [],
  rowMode: { kind: "single" },
  footerFields: [{ key: "checkedBy", label: "Checked by", type: "text", required: true, autoFill: { sign: true }, width: 220 }],
  // THE STAMP AS IT WAS SUPPLIED, shown unaltered beside the form (§71).
  originalPages: ["/source/fstr01-incoming-material-stamp.jpg"],
  specimenHeader: Object.fromEntries(STAMP_CHECKS.map((c) => [c.key, c.good])),
  specimenSource:
    "F-STR-01_Incoming material vehicle & condition monitoring record (rubber stamp).jpg — the stamp itself, photographed; the plant supplied no filled impression, so the specimen is the answers a load that passes gets",
};

// ---------------------------------------------------------------------------
// F/STR/02 — the sharp metal objects register
// ---------------------------------------------------------------------------
// Both paragraphs the format prints above the grid, verbatim. The second one
// ends without a full stop on the paper, and it stays that way.
const SHARP_TOOL_RULES = [
  "Store In-charge is overall responsible for issuance of new sharp metal object & receipt as well as safe disposal of broken or worn-out sharp metal object. New sharp metal object shall be issued against return of intact worn out sharp metal object or complete assembly of broken sharp metal object. In night shift, when Store in-charge may not be present, respective departmental supervisor shall ensure that, broken or worn-out sharp metal object is kept in container for disposal of broken or worn-out sharp tool, issue the new sharp tool & do the self-entry in this register. Store in-charge shall do the reconciliation of issued & returned sharp tool quantity as per records updated.",
  "New sharp metal object also may be issued to new employee or addition of new machine or new requirements, without receipt of new sharp metal object",
];

// The plant's own people and departments, from the personnel records already on
// file (F/HR/01, F/HR/13) — the register is a blank format, so these are sample
// lines to be checked, not records of issues that happened.
const SHARP_TOOL_SPECIMEN = [
  {
    date: "2026-09-01",
    sharpToolDescription: "Cutter blade — Olfa LB-50, large",
    qtyIssued: 10,
    issuedTo: "Pankajbhai",
    department: "Production",
    receiversSignature: "Pankajbhai",
    returnQty: 10,
    storeKeeperSign: "Hemantbhai Nayak",
    remarks: "Worn-out blades returned intact.",
  },
  {
    date: "2026-09-03",
    sharpToolDescription: "Razor Blade — single edge",
    qtyIssued: 5,
    issuedTo: "Natubhai Nayak",
    department: "Shrink Sleeve",
    receiversSignature: "Natubhai Nayak",
    returnQty: 5,
    storeKeeperSign: "Hemantbhai Nayak",
    remarks: "",
  },
  {
    date: "2026-09-08",
    sharpToolDescription: "Scissor — 8 inch",
    qtyIssued: 2,
    issuedTo: "Vijay Rawal",
    department: "Store",
    receiversSignature: "Vijay Rawal",
    returnQty: null,
    storeKeeperSign: "Hemantbhai Nayak",
    // The second paragraph of the format allows exactly this.
    remarks: "Issued against a new requirement; no old scissor returned.",
  },
  {
    date: "2026-09-12",
    sharpToolDescription: "Surgical Blade — No. 11, with handle",
    qtyIssued: 4,
    issuedTo: "Kapila Barad",
    department: "Quality Control",
    receiversSignature: "Kapila Barad",
    returnQty: 4,
    storeKeeperSign: "Hemantbhai Nayak",
    remarks: "",
  },
  {
    date: "2026-09-16",
    sharpToolDescription: "Cutter blade — Olfa A-1, small",
    qtyIssued: 10,
    issuedTo: "Ajay Thakor",
    department: "Store",
    receiversSignature: "Ajay Thakor",
    returnQty: 8,
    storeKeeperSign: "Hemantbhai Nayak",
    remarks: "Two blades broken; complete assemblies returned for disposal.",
  },
  {
    date: "2026-09-19",
    sharpToolDescription: "Razor Blade — single edge",
    qtyIssued: 5,
    issuedTo: "Milan Rajput",
    department: "Plate Making",
    receiversSignature: "Milan Rajput",
    returnQty: 5,
    storeKeeperSign: "Hemantbhai Nayak",
    remarks: "",
  },
];

const SHARP_METAL_OBJECTS: LogSheetLayout = {
  documentId: "str-sharp-metal-objects",
  instructions: SHARP_TOOL_RULES,
  headerFields: [],
  // The nine headings the paper prints, in its own words and punctuation:
  // "QTY. ISSUED" and "RETURN QTY." keep their full stops, and "RECEIVERS
  // SIGNATURE" has no apostrophe on the paper either.
  columns: [
    { key: "date", label: "DATE", type: "date", required: true, width: 120 },
    { key: "sharpToolDescription", label: "SHARP TOOL DESCRIPTION", type: "text", required: true, width: 220 },
    { key: "qtyIssued", label: "QTY. ISSUED", type: "number", required: true, decimals: 0, width: 110 },
    { key: "issuedTo", label: "ISSUED TO (NAME)", type: "text", required: true, width: 180 },
    { key: "department", label: "DEPARTMENT", type: "text", required: true, width: 150 },
    { key: "receiversSignature", label: "RECEIVERS SIGNATURE", type: "text", required: true, width: 170 },
    // NOT required: the format's own second paragraph says a new tool may be
    // issued "without receipt of new sharp metal object" — to a new employee,
    // a new machine or a new requirement — so a line with nothing returned is
    // the format working as written, not a line left half filled.
    { key: "returnQty", label: "RETURN QTY.", type: "number", decimals: 0, width: 110 },
    { key: "storeKeeperSign", label: "STORE KEEPER SIGN", type: "text", required: true, autoFill: { sign: true }, width: 170 },
    { key: "remarks", label: "REMARKS", type: "text", width: 200 },
  ],
  // A register: a line per issue, as many as the day needs. The paper prints
  // ten blank lines.
  rowMode: { kind: "free", minRows: 1, typicalRows: 6 },
  specimenRows: SHARP_TOOL_SPECIMEN,
  specimenSource: "F-STR-02_Sharp metal objects issuance & replacement record.pdf — F/STR/02 (00/01.12.2021), the blank format; the lines are sample issues to be checked",
};

export const STORE_LAYOUTS: Record<string, LogSheetLayout> = {
  [INCOMING_MATERIAL_VEHICLE.documentId]: INCOMING_MATERIAL_VEHICLE,
  [SHARP_METAL_OBJECTS.documentId]: SHARP_METAL_OBJECTS,
};
