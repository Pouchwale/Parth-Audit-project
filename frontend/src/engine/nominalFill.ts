import type { LogSheetData, LogSheetRow } from "../types";
import { GSM_MEASURED, GSM_PLATES } from "../data/seed/qcCalibrationLayouts";
import { RULER_300_ID, RULER_600_ID } from "../data/seed/qcRulerVerificationLayouts";

// ONE PRESS FILLS A CALIBRATION SHEET AS THE PLANT'S OWN PAGES ARE FILLED (REQUIREMENTS §136; the owner, 28-Oct-2026,
// with his filled F/QC/17 and F/QC/11 pages: "i want same observation and difference, status and calibration performed
// by ... all the field are editable but filled"):
//   F/QC/17 (600 mm and 300 mm)  every point read as the master's - Observed = the printed point, so the Difference is 0.0
//                               and the Status Pass follow (worked out) - and "Calibration performed by" the person who
//                               pressed it;
//   F/QC/11                      every plate measured at its size on its four lines - the Deviation 0% follows - Pass on
//                               the Pass/Fail line and the person's name on the Sign. line.
// The person presses it on the sheet, in their own name, and every box stays theirs to change: a point that read
// differently is typed over. DCRS never writes these by itself onto a sheet nobody has looked at (§98: a Live sheet
// holds what a person found), which is why a new sheet comes blank until the first press - and, from the second sheet
// on, is written as the last one was (§117).

/** The number a printed point holds ("100 mm" -> 100), or null. */
const pointOf = (v: unknown): number | null => {
  const n = parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : null;
};

/** What the press is called on this document's sheet, or null where there is none. */
export function nominalFillLabel(documentId: string): "ruler" | "gsm" | null {
  if (documentId === RULER_600_ID || documentId === RULER_300_ID) return "ruler";
  if (documentId === "qc-gsm-plate-calibration") return "gsm";
  return null;
}

/** The sheet filled as the plant's pages are, in `signer`'s name; null where the document has no such press. */
export function nominalFill(documentId: string, data: LogSheetData, signer: string): LogSheetData | null {
  const kind = nominalFillLabel(documentId);
  if (!kind) return null;
  const name = signer.trim();
  if (kind === "ruler") {
    const rows: LogSheetRow[] = data.rows.map((row, i) => {
      const point = pointOf(row.masterReading);
      const next: LogSheetRow = { ...row, ...(point === null ? {} : { observed: point }) };
      // The Status and the name stand once, down the six lines (merged); the Status is worked out from the readings.
      if (i === 0 && name) next.performedBy = name;
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
      else if (line === "Sign." && name) next[plate.key] = name;
    }
    return next;
  });
  return { ...data, rows };
}
