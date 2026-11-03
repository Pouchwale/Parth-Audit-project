import type { LogSheetData, LogSheetRow } from "../types";
import { GSM_PLATES } from "../data/seed/qcCalibrationLayouts";
import { isRulerVerification, rulerScaleOf } from "../data/seed/qcRulerVerificationLayouts";
// INDEXING: a formula the super admin changed in the index is worked out in place of the code below (indexing/formulaRuntime.ts).
import { currentFormulaClock, formulaOverride } from "../../../indexing/formulaRuntime";
import { asNumber, asYes, compileFormula, runFormula } from "../../../indexing/formulaLanguage";
import { formulaSlot } from "../../../indexing/formulas";

// THE DEVIATION ON THE TWO INTERNAL CALIBRATION RECORDS IS WORKED OUT, NOT
// TYPED (REQUIREMENTS §61).
//
//   F/QC/12  weight scale       (tested value − weight) ÷ weight × 100, for each
//                               of the five weights, whatever unit each is
//                               written in — "0.050mg", "200.04 gm", "0.2 kg" —
//                               and Pass / Fail against the sheet's own
//                               Acceptable Tolerance
//   F/QC/11  GSM cutting plate  the measured plate against the size printed at
//                               the head of its column — "20 x 20cm" — by AREA,
//                               because area is what a GSM plate is for
//   F/QC/17  measuring scale    the observed reading less the master's printed
//                               point ("50 mm"), in mm to one place ("0.0"), and
//                               the one Status down the six lines against the
//                               printed "+ / - 1 mm" (REQUIREMENTS §111, part 8)
//
// It is done here, on the data, so it is the same whoever wrote the figures:
// a person typing into the sheet, Mitra filling it, or sample data. A figure
// that cannot be read as a number leaves its deviation blank rather than
// guessing; nothing else on the record is touched.

const MG_PER: Record<string, number> = { mg: 1, g: 1000, gm: 1000, gms: 1000, gram: 1000, grams: 1000, kg: 1_000_000 };

/** "200.04 gm" → the figure and the unit it was written with (none for a bare number). */
function figure(text: unknown): { n: number; unit: string } | null {
  const m = String(text ?? "").trim().toLowerCase().match(/^(-?\d+(?:\.\d+)?)\s*([a-z]*)\.?$/);
  if (!m || (m[2] && MG_PER[m[2]] === undefined)) return null;
  return { n: Number(m[1]), unit: m[2] };
}

/** 0.0199… → "0.02%": enough places to show a real deviation, no trailing noughts. */
export function formatDeviation(percent: number): string {
  const rounded = Math.round(percent * 1000) / 1000;
  return `${Object.is(rounded, -0) ? 0 : rounded}%`;
}

/** The standard weight and the tested value, both in mg, or null when either cannot be read. */
function weightsInMg(weight: unknown, tested: unknown): { wmg: number; tmg: number } | null {
  const w = figure(weight);
  const t = figure(tested);
  if (!w || !t) return null;
  // A figure written bare is in the unit of the one beside it ("200.04 gm" against "200.06").
  return { wmg: w.n * MG_PER[w.unit || t.unit || "gm"], tmg: t.n * MG_PER[t.unit || w.unit || "gm"] };
}

export function weightDeviation(weight: unknown, tested: unknown): number | null {
  const mg = weightsInMg(weight, tested);
  if (!mg) return null;
  const { wmg, tmg } = mg;
  return wmg === 0 ? null : ((tmg - wmg) / wmg) * 100;
}

/**
 * F/QC/12'S DEVIATION IS NEVER WRITTEN WITH A MINUS (the owner, 30-Oct-2026: "make sure deviation should not be in
 * minus"): the size of the difference, |tested − weight| ÷ weight × 100, judged against ± the Acceptable Tolerance as
 * before. From that day; a sheet submitted before it keeps the signed figure it was signed with (indexing/formulaRuntime.ts).
 */
export const POSITIVE_DEVIATION_SINCE = "2026-10-30T00:00:00.000Z";
const positiveDeviationNow = (): boolean => {
  const asOf = currentFormulaClock();
  return asOf === undefined || asOf >= POSITIVE_DEVIATION_SINCE;
};

/**
 * A FIGURE TYPED BARE, IN THE UNIT AND PLACES OF THE CELL IT IS READ AGAINST (LogColumn.unitFrom): "100.002" under
 * "100.000gm" → "100.002gm", "100" → "100.000gm". Null where there is nothing to add: a figure with its own unit, not a
 * figure, or a reference with no unit.
 */
export function unitized(typed: unknown, reference: unknown): string | null {
  const t = String(typed ?? "").trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(t)) return null;
  const m = String(reference ?? "").trim().match(/^-?\d+(?:\.(\d+))?\s*([a-z]+)\.?$/i);
  if (!m) return null;
  const places = m[1]?.length ?? 0;
  const own = t.includes(".") ? t.split(".")[1].length : 0;
  const figure = own < places ? Number(t).toFixed(places) : t;
  return `${figure}${m[2]}`;
}

/** weightDeviation, or the index's formula for it when the super admin changed it (indexing, "qc12.deviation"). */
function weightDeviationNow(weight: unknown, tested: unknown): number | null {
  const changed = formulaOverride("qc12.deviation");
  if (!changed) {
    const d = weightDeviation(weight, tested);
    return d !== null && positiveDeviationNow() ? Math.abs(d) : d;
  }
  const mg = weightsInMg(weight, tested);
  return mg ? asNumber(runFormula(changed, { W: mg.wmg, T: mg.tmg })) : null;
}

/** Whether a deviation is within the tolerance: the code's rule, or the index's ("qc12.within" / "qc17.within"). */
function withinNow(slotId: string, d: number, tolerance: number): boolean {
  const changed = formulaOverride(slotId);
  if (!changed) return Math.abs(d) <= tolerance + 1e-9;
  return asYes(runFormula(changed, { D: d, TOL: tolerance })) === true;
}

/**
 * F/QC/12'S FILLED TESTED VALUE (the index's "qc12.tested-value-3 / -4 / -5", Mihir, 30-Oct-2026): a random reading a small
 * deviation either side of the standard weight, worked out in mg from W (the weight) and the slot's own figures
 * (MIN_DEV, MAX_DEV, and TOL where the formula names it - the sheet's Acceptable Tolerance), and written in the weight's
 * own unit and places ("100.000gm" -> "100.004gm"). The formula in force is the super admin's changed one, or the
 * default. Null - and the caller keeps the standard weight itself - when the weight cannot be read, the formula gives no
 * figure, or the written reading would be outside the sheet's tolerance.
 */
export function formulaTestedValue(position: 3 | 4 | 5, weight: unknown, toleranceText: unknown): string | null {
  const w = figure(weight);
  if (!w || !w.unit || w.n <= 0) return null;
  const slot = formulaSlot(`qc12.tested-value-${position}`);
  if (!slot) return null;
  const run = formulaOverride(slot.id) ?? (() => {
    const c = compileFormula(slot.defaultExpr, slot.variables.map((v) => v.name));
    return c.ok ? c.run : null;
  })();
  if (!run) return null;
  const perUnit = MG_PER[w.unit];
  const wmg = w.n * perUnit;
  const tol = tolerancePercent(toleranceText);
  const vars: Record<string, number> = {};
  for (const v of slot.variables) vars[v.name] = v.sample;
  vars.W = wmg;
  if (tol !== null) vars.TOL = tol;
  const mg = asNumber(runFormula(run, vars));
  if (mg === null || mg <= 0) return null;
  const places = String(weight).match(/\.(\d+)/)?.[1].length ?? 0;
  const text = `${(mg / perUnit).toFixed(places)}${w.unit}`;
  const written = weightDeviation(weight, text);
  if (written === null || (tol !== null && Math.abs(written) > tol + 1e-9)) return null;
  return text;
}

/** "20.1 x 19.9cm" → 399.99; a single figure is the side of a square plate. */
function area(text: unknown): number | null {
  const nums = String(text ?? "").match(/\d+(?:\.\d+)?/g)?.map(Number);
  if (!nums || nums.length === 0 || nums.length > 2) return null;
  return nums.length === 2 ? nums[0] * nums[1] : nums[0] * nums[0];
}

export function plateDeviation(size: string, measured: unknown): number | null {
  const nominal = area(size);
  const found = area(measured);
  if (!nominal || found === null) return null;
  const changed = formulaOverride("qc11.deviation");
  if (changed) return asNumber(runFormula(changed, { N: nominal, M: found }));
  return ((found - nominal) / nominal) * 100;
}

const tolerancePercent = (text: unknown): number | null => {
  const m = String(text ?? "").match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};

function weightScaleRow(row: LogSheetRow, tolerance: number | null): LogSheetRow {
  const next: LogSheetRow = { ...row };
  const found: number[] = [];
  for (let i = 1; i <= 5; i++) {
    const dev = weightDeviationNow(row[`weight${i}`], row[`testedValue${i}`]);
    next[`deviation${i}`] = dev === null ? "" : formatDeviation(dev);
    if (dev !== null) found.push(dev);
  }
  // Pass / Fail follows the tolerance once every weight placed has its reading (REQUIREMENTS §142: a line with only its
  // fixed Tested Values 1 and 2 is no Pass yet) and there is a tolerance to judge it by; otherwise it is left as the
  // tester set it.
  const placed = [1, 2, 3, 4, 5].filter((i) => String(row[`weight${i}`] ?? "").trim() !== "").length;
  if (found.length > 0 && found.length >= placed && tolerance !== null) next.passFail = found.every((d) => withinNow("qc12.within", d, tolerance)) ? "Pass" : "Fail";
  return next;
}

function gsmRow(row: LogSheetRow): LogSheetRow {
  const label = String(row.parameter ?? "");
  if (label === "Pass/Fail" || label === "Sign.") return row;
  const next: LogSheetRow = { ...row };
  for (const plate of GSM_PLATES) {
    const dev = plateDeviation(plate.size, row[plate.key]);
    next[`${plate.key}dev`] = dev === null ? "" : formatDeviation(dev);
  }
  return next;
}

/** A ruler's difference from the master's point, as the paper writes it: "0.0", "1.0", "-0.5". */
export function formatDifference(mm: number): string {
  const text = (Math.round(mm * 10) / 10).toFixed(1);
  return text === "-0.0" ? "0.0" : text;
}

/** F/QC/17: each line's Difference, and the Status on the first line once a point is outside or all six are within. */
function rulerRows(rows: LogSheetRow[], tolerance: number | null, points: readonly number[]): LogSheetRow[] {
  const mm = (v: unknown): number | null => {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    const m = String(v ?? "").trim().match(/^-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : null;
  };
  const found: (number | null)[] = rows.map((row, i) => {
    const point = mm(row.masterReading) ?? points[i] ?? null;
    const observed = mm(row.observed);
    if (point === null || observed === null) return null;
    const changed = formulaOverride("qc17.difference");
    return changed ? asNumber(runFormula(changed, { O: observed, P: point })) : observed - point;
  });
  const out: LogSheetRow[] = rows.map((row, i) => {
    const d = found[i];
    return { ...row, difference: d === null ? "" : formatDifference(d) };
  });
  if (tolerance !== null && out.length > 0) {
    const outside = found.some((d) => d !== null && !withinNow("qc17.within", d, tolerance));
    const allRead = found.length === points.length && found.every((d) => d !== null);
    // The one Status cell is the first line's (LogColumn.merged); left as the tester set it until there is a verdict.
    if (outside) out[0] = { ...out[0], status: "Fail" };
    else if (allRead) out[0] = { ...out[0], status: "Pass" };
  }
  return out;
}

/** The record's data with every deviation worked out; any other document's data is returned as it is. */
export function withCalibration<T>(documentId: string | undefined, data: T): T {
  if (documentId !== "qc-weight-scale-calibration" && documentId !== "qc-gsm-plate-calibration" && !isRulerVerification(documentId)) return data;
  const d = data as unknown as LogSheetData | undefined;
  if (!d || !Array.isArray(d.rows)) return data;
  if (isRulerVerification(documentId)) {
    // "+ / - 1 mm": the figure printed in the box (engine/printedBands.ts reads it the same way for the highlight).
    const m = String(d.header?.acceptableTolerance ?? "").match(/\d+(?:\.\d+)?/);
    const worked = rulerRows(d.rows, m ? Number(m[0]) : null, rulerScaleOf(documentId)?.points ?? []);
    const rows = worked.map((next, i) => (Object.keys(next).every((k) => next[k] === d.rows[i][k]) ? d.rows[i] : next));
    return rows.every((r, i) => r === d.rows[i]) ? data : ({ ...d, rows } as unknown as T);
  }
  const tolerance = tolerancePercent(d.header?.acceptableTolerance);
  // A line whose figures are unchanged is handed back as it was, so the sheet
  // redraws only the line that changed (components/records/LogSheetRecordView.tsx SheetRow).
  const rows = d.rows.map((r) => {
    const next = documentId === "qc-weight-scale-calibration" ? weightScaleRow(r, tolerance) : gsmRow(r);
    return Object.keys(next).every((k) => next[k] === r[k]) ? r : next;
  });
  const same = rows.every((r, i) => r === d.rows[i]);
  return same ? data : ({ ...d, rows } as unknown as T);
}
