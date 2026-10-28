import type { LogSheetData, LogSheetRow } from "../types";
import { GSM_MEASURED, GSM_PLATES } from "../data/seed/qcCalibrationLayouts";
import { RULER_300_ID, RULER_600_ID } from "../data/seed/qcRulerVerificationLayouts";

// A CALIBRATION SHEET IS FILLED AS THE PLANT'S OWN PAGES ARE THE MOMENT A PERSON OPENS IT (REQUIREMENTS §136; the owner,
// 28-Oct-2026, with his filled F/QC/17 and F/QC/11 pages: "i want same observation and difference, status and calibration
// performed by ... all the field are editable but filled", then "whenever user open any date new record to fill than it
// should be filled"):
//   F/QC/17 (600 mm and 300 mm)  every point read as the master's - Observed = the printed point, so the Difference is 0.0
//                               and the Status Pass follow (worked out) - and "Calibration performed by" the person who
//                               pressed it;
//   F/QC/11                      every plate measured at its size on its four lines - the Deviation 0% follows - Pass on
//                               the Pass/Fail line and the person's name on the Sign. line;
//   F/QC/12                      each Tested Value the exact weight placed ("50 gm" against 50 gm), so the Deviation 0%
//                               and Pass follow; Tested By and Sign the person's name; the Next Due Date theirs to write.
//                               Never a made-up reading that varies within the tolerance (the owner asked for one,
//                               28-Oct-2026): what the scale showed is the person's to type over the weight.
// It is written when a person who may fill the sheet opens it (the record page), in that person's name, with a line in
// the record's history, and every box stays theirs to change: a point that read differently is typed over. DCRS never
// writes these by itself onto a sheet nobody has looked at (§98: a Live sheet holds what a person found): the schedule's
// shells and the morning prepare leave the readings blank, and a sheet already written on - by a person, or as the
// last one was (§117) - is left as it is.

/** What the record's history says of the fill. */
export const NOMINAL_FILL_NOTE = "Filled as the plant's pages are filled, on opening: every point read as the master's / every plate at its size, Pass, the opener's name (REQUIREMENTS §136)";

/** The number a printed point holds ("100 mm" -> 100), or null. */
const pointOf = (v: unknown): number | null => {
  const n = parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : null;
};

/** What the press is called on this document's sheet, or null where there is none. */
export function nominalFillLabel(documentId: string): "ruler" | "gsm" | "scale" | null {
  if (documentId === RULER_600_ID || documentId === RULER_300_ID) return "ruler";
  if (documentId === "qc-gsm-plate-calibration") return "gsm";
  if (documentId === "qc-weight-scale-calibration") return "scale";
  return null;
}

/** F/QC/12's five weights and the tested value written against each. */
const SCALE_WEIGHTS = [1, 2, 3, 4, 5].map((i) => ({ weight: `weight${i}`, tested: `testedValue${i}` }));

/** No reading on the sheet yet: at no point (F/QC/17), against no weight (F/QC/12), of no plate (F/QC/11). A name carried
 * from the last sheet (its signer) is no reading, and is kept. */
export function nominalFillWaits(documentId: string, data: LogSheetData | undefined): boolean {
  const kind = nominalFillLabel(documentId);
  if (!kind || !Array.isArray(data?.rows) || data.rows.length === 0) return false;
  const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";
  if (kind === "ruler") return data.rows.every((r) => blank(r.observed));
  if (kind === "scale") return data.rows.every((r) => SCALE_WEIGHTS.every((w) => blank(r[w.tested])));
  return data.rows.every((r) => !GSM_MEASURED.includes(String(r.parameter ?? "")) || GSM_PLATES.every((p) => blank(r[p.key])));
}

/** The sheet filled as the plant's pages are, in `signer`'s name, where nothing is observed on it yet; null otherwise. */
export function nominalFillOnOpen(documentId: string, data: LogSheetData | undefined, signer: string): LogSheetData | null {
  return data && nominalFillWaits(documentId, data) ? nominalFill(documentId, data, signer) : null;
}

/** The sheet filled as the plant's pages are, in `signer`'s name; null where the document is not one of the three. */
export function nominalFill(documentId: string, data: LogSheetData, signer: string): LogSheetData | null {
  const kind = nominalFillLabel(documentId);
  if (!kind) return null;
  const name = signer.trim();
  if (kind === "ruler") {
    const rows: LogSheetRow[] = data.rows.map((row, i) => {
      const point = pointOf(row.masterReading);
      const next: LogSheetRow = { ...row, ...(point === null ? {} : { observed: point }) };
      // The Status and the name stand once, down the six lines (merged); the Status is worked out from the readings. A
      // name already there (the last sheet's signer, carried) is kept.
      if (i === 0 && name && !String(row.performedBy ?? "").trim()) next.performedBy = name;
      return next;
    });
    return { ...data, rows };
  }
  if (kind === "scale") {
    const rows: LogSheetRow[] = data.rows.map((row) => {
      const next: LogSheetRow = { ...row };
      for (const w of SCALE_WEIGHTS) {
        const weight = String(row[w.weight] ?? "").trim();
        if (weight) next[w.tested] = weight;
      }
      if (name && !String(row.testedBy ?? "").trim()) next.testedBy = name;
      if (name && !String(row.sign ?? "").trim()) next.sign = name;
      return next;
    });
    return { ...data, rows };
  }
  const rows: LogSheetRow[] = data.rows.map((row) => {
    const line = String(row.parameter ?? "");
    const next: LogSheetRow = { ...row };
    for (const plate of GSM_PLATES) {
      if (GSM_MEASURED.includes(line)) next[plate.key] = plate.size;
      else if (line === "Pass/Fail") next[plate.key] = "Pass";
      else if (line === "Sign." && name && !String(row[plate.key] ?? "").trim()) next[plate.key] = name;
    }
    return next;
  });
  return { ...data, rows };
}
