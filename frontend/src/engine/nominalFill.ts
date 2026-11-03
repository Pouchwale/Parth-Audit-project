import type { LogSheetData, LogSheetRow } from "../types";
import { FIXED_TESTED_VALUES, GSM_MEASURED, GSM_PLATES, STANDARD_WEIGHTS } from "../data/seed/qcCalibrationLayouts";
import { RULER_300_ID, RULER_600_ID } from "../data/seed/qcRulerVerificationLayouts";
import { formulaTestedValue } from "./calibration";

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
// THE ONE EXCEPTION, F/QC/12 (the owner, 30-Oct-2026): its weekly lines are filled by the server's morning prepare on the
// line's own date, with nobody opening the sheet (fillScaleLinesDue, engine/assistantPrepare.ts fillScaleWeeksDue); a line
// dated later stays blank, and the filled line waits, marked to be confirmed, with a daily reminder to the person who answers for it.

/**
 * F/QC/12'S READINGS FILLED, TO BE CONFIRMED (the owner, 30-Oct-2026: "i want the data should be filled automatically").
 * The week's line is filled by the index's "qc12.tested-value-3/4/5" formulas (30-Oct-2026): Tested Values 3 to 5 a random
 * reading within the Acceptable Tolerance of the standard weights (100.000gm, 200.000gm, 400.000gm), so the line Passes;
 * the standard weight itself where the tolerance cannot be read. The line carries this mark until a
 * person confirms the scale showed those values — one click — or types the reading it did show; the sheet is not
 * submitted while a line carries it (engine/validation.ts). A reading is a person's word: the mark is what makes it so.
 */
export const READINGS_TO_CONFIRM = "readingsToConfirm";

/** What the record's history says of the fill. */
export const NOMINAL_FILL_NOTE = "Filled as the plant's pages are filled, on opening: every point read as the master's / every plate at its size / F/QC/12's Tested Values as the standard weights (to be confirmed), Pass, the opener's name (REQUIREMENTS §136)";

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

/**
 * A LINE ON THE LABORATORY'S FIXED WEIGHTS (the owner, 30-Oct-2026, REQUIREMENTS §146: "weight 1 is 0.050 mg, weight 2 is
 * 50.000 gm and weight 3 is 100.000 gm, weight 4 is 200.000 gm, and weight 5 is 400.000 gm so first fix this in all four
 * rows"): the five weights are the standards whatever the line held; Tested Values 1 and 2 the fixed ones where blank, or
 * where a line of the former weights held their nominal figure; that former nominal figure in 3 to 5 is no reading and
 * is rubbed out, with a Pass that stood on no reading. A reading a person typed is kept: its deviation is worked out
 * against the right weight. The same object back when nothing changes.
 */
export function onStandardWeights(row: LogSheetRow): LogSheetRow {
  const former = SCALE_WEIGHTS.every((w, i) => sameFigure(row[w.weight], FORMER_WEIGHTS[i]));
  const next: LogSheetRow = { ...row };
  SCALE_WEIGHTS.forEach((w, i) => {
    next[w.weight] = STANDARD_WEIGHTS[i];
    const tested = String(row[w.tested] ?? "").trim();
    const nominal = former && tested !== "" && sameFigure(tested, FORMER_WEIGHTS[i]);
    // The former nominal figures were no readings. Tested Values 1 and 2 are written, like 3 to 5, when the line's date comes.
    if (nominal) next[w.tested] = "";
  });
  if (former && unreadLine(next) && String(row.passFail ?? "").trim()) next.passFail = "";
  const changed = Object.keys(next).some((k) => next[k] !== row[k]);
  return changed ? next : row;
}

/**
 * F/QC/12's LINE, ITS DAY HAVING COME: Tested Values 1 and 2 are the fixed ones (the weight itself, 0%), written where
 * blank; Tested Values 3 to 5, where nobody has written any, by the index's "qc12.tested-value-3/4/5" formulas (the
 * standard weight itself where they give none) with the mark that they are to be confirmed. Null where there is
 * nothing to write. The caller decides whether the day has come.
 */
export function fillScaleLine(row: LogSheetRow, tolerance: unknown): LogSheetRow | null {
  const next: LogSheetRow = { ...row };
  let changed = false;
  for (let w = 1; w <= FIXED_TESTED_VALUES; w++) {
    if (!String(row[`testedValue${w}`] ?? "").trim()) {
      next[`testedValue${w}`] = STANDARD_WEIGHTS[w - 1];
      changed = true;
    }
  }
  if (!row[READINGS_TO_CONFIRM] && unreadLine(row)) {
    for (let w = FIXED_TESTED_VALUES + 1; w <= 5; w++) next[`testedValue${w}`] = formulaTestedValue(w as 3 | 4 | 5, STANDARD_WEIGHTS[w - 1], tolerance) ?? STANDARD_WEIGHTS[w - 1];
    next[READINGS_TO_CONFIRM] = "yes";
    changed = true;
  }
  return changed ? next : null;
}

/** A line's readings, and what stands on them, taken out: a week that has not come has no reading, no Pass, nobody's name. */
function clearedLine(row: LogSheetRow): LogSheetRow | null {
  const keys = [1, 2, 3, 4, 5].flatMap((i) => [`testedValue${i}`, `deviation${i}`]).concat(["passFail", "testedBy", "sign", READINGS_TO_CONFIRM]);
  if (!keys.some((k) => String(row[k] ?? "").trim() !== "")) return null;
  const next: LogSheetRow = { ...row };
  for (const k of keys) {
    if (k === READINGS_TO_CONFIRM) delete next[k];
    else next[k] = "";
  }
  return next;
}

/** The note in the record's history when the assistant fills a week's readings on the day. */
export const SCALE_DAY_NOTE = "F/QC/12: the week's date came; Tested Values 3 to 5 filled by the index's formulas, to be confirmed by the person who answers for the sheet";

/**
 * THE WEEKS WHOSE DAY HAS COME, FILLED ON THE DAY (the owner, 30-Oct-2026: a line is filled only when its date is today
 * or earlier, a future-dated line stays blank until its date arrives, and it happens by itself). The server's morning
 * prepare (engine/assistantPrepare.ts) calls it on a sheet whose dates are worked out: every line dated `today` or
 * before, with nothing written in Tested Values 3 to 5 and not already waiting to be confirmed, is filled and marked to
 * be confirmed. A line a person has read, a line without a date and a line dated later are left. Null: nothing to fill.
 */
export function fillScaleLinesDue(data: LogSheetData, today: string): LogSheetData | null {
  if (!Array.isArray(data?.rows)) return null;
  let changed = false;
  const rows = data.rows.map((row) => {
    const day = String(row.date ?? "").trim();
    if (!day || day > today) return row;
    const filled = fillScaleLine(onStandardWeights(row), data.header?.acceptableTolerance);
    if (!filled) return row;
    changed = true;
    return filled;
  });
  return changed ? { ...data, rows } : null;
}

/**
 * THE SHEET'S WEEKS SETTLED AGAINST THEIR DATES, when a date is changed (the owner, 30-Oct-2026): a line whose date is
 * later than `today` has no readings, no Pass and nobody's name - they are taken out; a line whose date is today or
 * earlier is filled as it is on its day (fillScaleLine). The same object back when nothing changes.
 */
export function settleScaleLines(data: LogSheetData, today: string): LogSheetData {
  if (!Array.isArray(data?.rows)) return data;
  let changed = false;
  const rows = data.rows.map((row) => {
    const day = String(row.date ?? "").trim();
    if (!day) return row;
    const next = day > today ? clearedLine(row) : fillScaleLine(onStandardWeights(row), data.header?.acceptableTolerance);
    if (!next) return row;
    changed = true;
    return next;
  });
  return changed ? { ...data, rows } : data;
}

/** The line this week's calibration goes on (a sheet a month, a line a week, §145): the first not read yet; -1 when all are. */
const lineNow = (rows: LogSheetRow[]): number => rows.findIndex(unreadLine);

/** No reading on the sheet yet: at no point (F/QC/17), of no plate (F/QC/11); on F/QC/12, whose fixed Tested Values come
 * with the line (§142), nobody's name on it yet. A name carried from the last sheet (its signer) is no reading, and is kept. */
export function nominalFillWaits(documentId: string, data: LogSheetData | undefined): boolean {
  const kind = nominalFillLabel(documentId);
  if (!kind || !Array.isArray(data?.rows) || data.rows.length === 0) return false;
  const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";
  // (or a sheet written as last year's, its readings carried, with this year's tester still to be named: the owner, 31-Oct-2026)
  if (kind === "ruler") return data.rows.every((r) => blank(r.observed)) || blank(data.rows[0]?.performedBy);
  if (kind === "scale") {
    // The week's line, nobody's name on it yet: the opener's (§145 - the weeks below wait for their own testers).
    // Not while a week's filled readings still wait for the person to confirm them (READINGS_TO_CONFIRM).
    if (data.rows.some((r) => r[READINGS_TO_CONFIRM])) return false;
    const now = lineNow(data.rows);
    return now >= 0 && blank(data.rows[now].testedBy) && blank(data.rows[now].sign);
  }
  // F/QC/11: nobody's name on its Sign. line yet (the owner, 30-Oct-2026: a sheet carried from last month with its sizes
  // on it opened with its Sign. line empty - the fill had waited for blank sizes). The fill writes only what is blank.
  const sign = data.rows.find((r) => String(r.parameter ?? "") === "Sign.");
  return !!sign && GSM_PLATES.every((p) => blank(sign[p.key]));
}

/**
 * A line a person adds to F/QC/12 with Add Row, filled as the sheet is on opening and in that person's name (REQUIREMENTS
 * §140, §142): its standards (the weights, the fixed Tested Values 1 and 2) and Tested By and Sign theirs; Tested Values
 * 3 to 5 the person's to type. A line added to any other sheet starts blank, as Add Row always has (§98).
 */
export function nominalFillAdded(documentId: string, data: LogSheetData, line: LogSheetRow, signer: string): LogSheetRow {
  if (nominalFillLabel(documentId) !== "scale") return line;
  const filled = nominalFill(documentId, { ...data, rows: [line] }, signer)?.rows[0] ?? line;
  // An added line is a week still to come: its readings wait for its own week (filled when its day comes).
  const next: LogSheetRow = { ...filled };
  for (let w = 1; w <= 5; w++) next[`testedValue${w}`] = line[`testedValue${w}`] ?? "";
  delete next[READINGS_TO_CONFIRM];
  return next;
}

/** The sheet filled as the plant's pages are, in `signer`'s name, where nothing is observed on it yet; null otherwise. */
export function nominalFillOnOpen(documentId: string, data: LogSheetData | undefined, signer: string, firstDate?: string): LogSheetData | null {
  return data && nominalFillWaits(documentId, data) ? nominalFill(documentId, data, signer, firstDate) : null;
}

/** The sheet filled as the plant's pages are, in `signer`'s name; null where the document is not one of the three. */
export function nominalFill(documentId: string, data: LogSheetData, signer: string, firstDate?: string): LogSheetData | null {
  const kind = nominalFillLabel(documentId);
  if (!kind) return null;
  const name = signer.trim();
  if (kind === "ruler") {
    // A sheet with any reading on it (carried from last year's, or a person's) keeps every reading as it is: only this
    // year's tester's name goes on, where none is (the owner, 31-Oct-2026). The printed points fill a sheet with none.
    const read = data.rows.some((r) => String(r.observed ?? "").trim() !== "");
    const rows: LogSheetRow[] = data.rows.map((row, i) => {
      if (read) return i === 0 && name && !String(row.performedBy ?? "").trim() ? { ...row, performedBy: name } : row;
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
    const standard: LogSheetRow[] = data.rows.map(onStandardWeights);
    // Tested By and Sign the opener's on the week's own line only (a sheet a month, a line a week, the owner,
    // 29-Oct-2026, §145): the weeks below wait for whoever tests them. No date is written: the date is the person's, and
    // each Next Due Date and the next line's date follow it (engine/nextDueChain.ts).
    const now = lineNow(standard);
    // THE FIRST LINE'S DATE (the owner, 30-Oct-2026, engine/calibrationWeeks.ts): the previous week's Next Due Date, where
    // the caller has it and no date is written; the Next Due Dates and the lines below follow it (engine/nextDueChain.ts).
    const dated = firstDate && standard.length > 0 && !String(standard[0].date ?? "").trim() ? [{ ...standard[0], date: firstDate }, ...standard.slice(1)] : standard;
    const today = new Date().toISOString().slice(0, 10);
    const rows = dated.map((row, i) => {
      if (i !== now) return row;
      const next: LogSheetRow = { ...row };
      // The week's readings, the standard weights, to be confirmed — only on a line whose day has come (a week ahead is
      // its own week's), and only in boxes nobody has written.
      const day = String(row.date ?? "").trim();
      if (!day || day <= today) Object.assign(next, fillScaleLine(row, data.header?.acceptableTolerance) ?? {});
      if (!name) return next;
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
      // A size or a Pass a person wrote is kept: only a blank cell takes the plant's usual (§136).
      if (GSM_MEASURED.includes(line) && !String(row[plate.key] ?? "").trim()) next[plate.key] = plate.size;
      else if (line === "Pass/Fail" && !String(row[plate.key] ?? "").trim()) next[plate.key] = "Pass";
      else if (line === "Sign." && name && !String(row[plate.key] ?? "").trim()) next[plate.key] = name;
    }
    return next;
  });
  return { ...data, rows };
}
