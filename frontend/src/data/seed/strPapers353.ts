// THE STORE'S TWO FORMATS DRAWN AS THE OWNER'S OWN PAPERS (REQUIREMENTS §353; the owner, 24-Nov-2026: "same format present in my
// system which is present in google drive ... whenever user download any document of any module or take a print on A4 size paper,
// that should be very perfect").
//
// F/STR/01 INCOMING MATERIAL VEHICLE & CONDITION MONITORING RECORD is a rubber stamp (source-documents/F-STR-01_Incoming material
// vehicle & condition monitoring record (rubber stamp).jpg, the same picture in his Drive's "BRCGS 25-26/Formats/4 Store"): one
// boxed table, its title in two underlined lines, a label column, "Yes" and "No" in a cell each on every check, the received date
// and "Checked by" written across the two answer cells. It prints no company and no number (the number is shown on the screen
// only, to be typed over). The stamp's own spellings stay: "contaminaiton", "Oil Sport".
//
// F/STR/02 SHARP METAL OBJECTS ... ISSUANCE (NEW) & RETURN (OLD) RECORD, revision 00/01.12.2021, read rule by rule off
// source-documents/F-STR-02_Sharp metal objects issuance & replacement record.pdf (the company's Word file's own print, landscape):
// the company and the title in one heavy frame, the store in-charge's rule in bold under it, the nine headings in their own box,
// a gap, the ten ruled lines, and "F/STR/02 (00/01.12.2021)" under the grid. No SR. NO. column: the paper has none.
//
// Every printed word is the record's to type over where it stands (ownWords, §275); every box and column is the layout's
// (data/seed/storeLayouts.ts), so records, auto-fill and the downloads read them as before.

import type { PaperCell, PaperPick, PaperRow, PaperTable } from "./qcPaperTables";

// ---------------------------------------------------------------------------
// F/STR/01 — the stamp, drawn across the page as the paper is printed to fill A4 (§194, §328).

/** The stamp's three columns: the label, "Yes", "No" (their shares of the stamp's width, read off the photograph). */
const S_LABEL = 97.6;
const S_YES = 51.0;
const S_NO = 37.4;
const S_W = S_LABEL + S_YES + S_NO;
const S_ROW = 10.2;
const S_PT = 15;

const STAMP_CHECKS: [string, string][] = [
  ["vehicleCovered", "Vehicle covered"],
  ["foreignMatterContaminaiton", "Foreign matter contaminaiton"],
  ["objectionableOdour", "Objectionable Odour"],
  ["areFloorAndSidesClean", "Are Floor & Sides Clean"],
  ["oilSportOnFloor", "Oil Sport on Floor"],
  ["signOfPestOrDropping", "Sign of pest or dropping"],
  ["packagingIntegrity", "Packaging integrity"],
];

const stampLabel = (t: string): PaperCell => ({ w: S_LABEL, t, edges: "ltrb", x: 1.6, vm: true, pt: S_PT });
/** The stamp's "Yes" or "No": the one chosen is ringed, as the checker marks the stamp. */
const answer = (w: number, box: string, word: "Yes" | "No"): PaperCell => ({
  w,
  t: "",
  edges: "ltrb",
  a: "c",
  vm: true,
  pt: S_PT,
  pick: [{ box, value: word, word, mark: "ring" } as PaperPick],
  // (the stamp's frame is heavier than its rules: its right edge)
  ...(word === "No" ? { heavy: "r" as const } : {}),
});

const INCOMING_STAMP: PaperTable = {
  page: "portrait",
  left: 12,
  top: 12,
  font: "calibri",
  pt: S_PT,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  // A rubber stamp has no room for a format number, revision or page: they stay on the screen, to be typed over (§86).
  numberOffPaper: true,
  head: [
    {
      h: 21.6,
      cells: [{ w: S_W, t: "INCOMING MATERIAL VEHICLE & CONDITION\nMONITORING RECORD", edges: "ltrb", a: "c", u: true, pt: 17, y: 3.2, lh: 7.6, heavy: "rb" }],
    },
  ],
  body: [
    { h: S_ROW, cells: [stampLabel("Received date"), { w: S_YES + S_NO, box: "receivedDate", edges: "ltrb", a: "c", vm: true, heavy: "r" }] },
    ...STAMP_CHECKS.map(([key, label]): PaperRow => ({ h: S_ROW, cells: [stampLabel(label), answer(S_YES, key, "Yes"), answer(S_NO, key, "No")] })),
  ],
  foot: [{ h: S_ROW + 1.2, cells: [{ ...stampLabel("Checked by"), heavy: "b" }, { w: S_YES + S_NO, box: "checkedBy", edges: "ltrb", a: "c", vm: true, heavy: "rb" }] }],
};

// ---------------------------------------------------------------------------
// F/STR/02 — the sharp metal objects register, landscape. The frame 17.53 mm to 287.61 mm across the page, 6.27 mm down.

/** The nine columns, 30 mm each as the paper rules them. */
const SH = [30.02, 30.01, 29.98, 30.03, 30.01, 30.02, 29.98, 30.02, 30.01];
const SH_W = SH.reduce((a, b) => a + b, 0);
const SH_COLS = ["date", "sharpToolDescription", "qtyIssued", "issuedTo", "department", "receiversSignature", "returnQty", "storeKeeperSign", "remarks"];
const SH_HEADS = ["DATE", "SHARP TOOL\nDESCRIPTION", "QTY. ISSUED", "ISSUED TO\n(NAME)", "DEPARTMENT", "RECEIVERS\nSIGNATURE", "RETURN QTY.", "STORE KEEPER\nSIGN", "REMARKS"];
const blankRow = (h: number): PaperRow => ({ h, cells: [{ w: SH_W, t: "", edges: "" }] });

const SHARP_REGISTER: PaperTable = {
  page: "landscape",
  left: 17.53,
  top: 6.27,
  font: "calibri",
  pt: 9,
  rules: "cells",
  ownWords: true,
  fillA4: true,
  head: [
    { h: 12.4, cells: [{ w: SH_W, t: "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED", edges: "ltrb", b: true, u: true, a: "c", pt: 15.96, y: 3.9, heavy: "rb" }] },
    {
      h: 12.28,
      cells: [{ w: SH_W, t: "SHARP METAL OBJECTS (Razor Blade, Scissor, Cutter blade, Surgical Blade) ISSUANCE (NEW) & RETURN (OLD) RECORD", edges: "ltrb", b: true, u: true, a: "c", pt: 14.04, y: 3.66, heavy: "r" }],
    },
  ],
  body: [
    // The store in-charge's rule, in bold under the frame, and its last line at the frame's left edge (as the paper sets them).
    { h: 15.6, cells: [{ w: SH_W, lab: "@instructions:0", edges: "", b: true, x: 1.6, y: 0.8, lh: 3.87, ww: 268.2 }] },
    { h: 4.17, cells: [{ w: SH_W, lab: "@instructions:1", edges: "", b: true, x: 0, y: 0.05, heavy: "b" }] },
    { h: 12.16, head: true, cells: SH_HEADS.map((t, i): PaperCell => ({ w: SH[i], t, edges: "ltrb", b: true, a: "c", pt: 11.04, y: 3.14, lh: 4.74, heavy: i === SH.length - 1 ? "rb" : "b" })) },
    blankRow(4.57),
  ],
  // The ten ruled lines: a line written is the record's line; the rest print blank, as the paper rules them.
  lines: { h: 11.02, count: 10, cells: SH_COLS.map((col, i): PaperCell => ({ w: SH[i], col, edges: "ltrb", a: "c", vm: true, ...(i === SH.length - 1 ? { heavy: "r" as const } : {}) })) },
  // (the number stands 9 mm under the grid where the paper sets it 14 mm under: so the page's margins hold the whole sheet on one
  // A4 page, as the paper is one)
  foot: [
    { h: 7.5, cells: [{ w: SH_W, t: "", edges: "" }] },
    { h: 5.2, cells: [{ w: SH_W, t: "F/STR/02 (00/01.12.2021)", edges: "", a: "c", cx: 3.55, pt: 12 }] },
  ],
};

export const STR_PAPERS_353: Record<string, PaperTable> = {
  "str-incoming-material-vehicle": INCOMING_STAMP,
  "str-sharp-metal-objects": SHARP_REGISTER,
};
