import type { LogSheetData, LogSheetRow } from "../types";
import { FIXED_TESTED_VALUES, GSM_MEASURED, GSM_PLATES, STANDARD_WEIGHTS } from "../data/seed/qcCalibrationLayouts";
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
//   F/QC/12                      (since 29-Oct-2026, the owner's own page, REQUIREMENTS §142) Tested Values 1 and 2 are
//                               the plant's fixed ones, the weight itself (0.050mg, 50.000gm: standards of every new
//                               line, 0%); 3 to 5 are what the scale shows, the person's to type, the Deviation and
//                               Pass / Fail following; Tested By and Sign the opener's name; the Next Due Date theirs.
//                               Never a made-up reading (asked for 28 and 29-Oct-2026, declined).
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

/** The weights every F/QC/12 line started with before §142 ("50 gm" .. "600 gm", §117): an older open sheet's, put onto
 * the standards of the laboratory's page when a person opens it, as its readings are then that person's to type. */
const FORMER_WEIGHTS = ["50 gm", "100 gm", "200 gm", "500 gm", "600 gm"];
const sameFigure = (a: unknown, b: string): boolean => String(a ?? "").replace(/\s+/g, "").toLowerCase() === b.replace(/\s+/g, "").toLowerCase();

/** No reading of a person's on the line: Tested Values 3 to 5 blank - or, on a sheet started before §142, the former
 *  nominal figures (each weight's own) - so the week it stands for is still to be written. */
const unreadLine = (r: LogSheetRow): boolean => {
  const former = SCALE_WEIGHTS.every((w, i) => sameFigure(r[w.weight], FORMER_WEIGHTS[i]));
  return SCALE_WEIGHTS.slice(FIXED_TESTED_VALUES).every((w) => {
    const v = String(r[w.tested] ?? "").trim();
    return !v || (former && sameFigure(v, FORMER_WEIGHTS[SCALE_WEIGHTS.indexOf(w)]));
  });
};

/** The line this week's calibration goes on (a sheet a month, a line a week, §145): the first not read yet; -1 when all are. */
const lineNow = (rows: LogSheetRow[]): number => rows.findIndex(unreadLine);

/** No reading on the sheet yet: at no point (F/QC/17), of no plate (F/QC/11); on F/QC/12, whose fixed Tested Values come
 * with the line (§142), nobody's name on it yet. A name carried from the last sheet (its signer) is no reading, and is kept. */
export function nominalFillWaits(documentId: string, data: LogSheetData | undefined): boolean {
  const kind = nominalFillLabel(documentId);
  if (!kind || !Array.isArray(data?.rows) || data.rows.length === 0) return false;
  const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";
  if (kind === "ruler") return data.rows.every((r) => blank(r.observed));
  if (kind === "scale") {
    // The week's line, nobody's name on it yet: the opener's (§145 - the weeks below wait for their own testers).
    const now = lineNow(data.rows);
    return now >= 0 && blank(data.rows[now].testedBy) && blank(data.rows[now].sign);
  }
  return data.rows.every((r) => !GSM_MEASURED.includes(String(r.parameter ?? "")) || GSM_PLATES.every((p) => blank(r[p.key])));
}

/**
 * A line a person adds to F/QC/12 with Add Row, filled as the sheet is on opening and in that person's name (REQUIREMENTS
 * §140, §142): its standards (the weights, the fixed Tested Values 1 and 2) and Tested By and Sign theirs; Tested Values
 * 3 to 5 the person's to type. A line added to any other sheet starts blank, as Add Row always has (§98).
 */
export function nominalFillAdded(documentId: string, data: LogSheetData, line: LogSheetRow, signer: string): LogSheetRow {
  if (nominalFillLabel(documentId) !== "scale") return line;
  return nominalFill(documentId, { ...data, rows: [line] }, signer)?.rows[0] ?? line;
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
    const standard: LogSheetRow[] = data.rows.map((row) => {
      const next: LogSheetRow = { ...row };
      // A line of a sheet started before §142, still holding every one of the former weights and no reading: its weights
      // become the laboratory's page's (the owner, 29-Oct-2026). A weight a person wrote is kept.
      const former = SCALE_WEIGHTS.every((w, i) => sameFigure(row[w.weight], FORMER_WEIGHTS[i]));
      const unread = SCALE_WEIGHTS.every((w) => !String(row[w.tested] ?? "").trim() || sameFigure(row[w.tested], FORMER_WEIGHTS[SCALE_WEIGHTS.indexOf(w)]));
      if (former && unread) {
        SCALE_WEIGHTS.forEach((w, i) => {
          next[w.weight] = STANDARD_WEIGHTS[i];
          if (String(row[w.tested] ?? "").trim()) next[w.tested] = "";
        });
        // A Pass that stood on the line with no reading of a person's was never a verdict: it waits for the readings.
        next.passFail = "";
      }
      // The fixed Tested Values 1 and 2, where a line lacks them (a sheet started before §142); 3 to 5 are the person's.
      for (const w of SCALE_WEIGHTS.slice(0, FIXED_TESTED_VALUES)) {
        const weight = String(next[w.weight] ?? "").trim();
        if (weight && !String(next[w.tested] ?? "").trim()) next[w.tested] = weight;
      }
      return next;
    });
    // Tested By and Sign the opener's on the week's own line only (a sheet a month, a line a week, the owner,
    // 29-Oct-2026, §145): the weeks below wait for whoever tests them. No date is written: the date is the person's, and
    // each Next Due Date and the next line's date follow it (engine/nextDueChain.ts).
    const now = lineNow(standard);
    const rows = standard.map((row, i) => {
      if (i !== now || !name) return row;
      const next: LogSheetRow = { ...row };
      if (!String(row.testedBy ?? "").trim()) next.testedBy = name;
      if (!String(row.sign ?? "").trim()) next.sign = name;
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
