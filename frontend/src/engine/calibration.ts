import type { LogSheetData, LogSheetRow } from "../types";
import { GSM_PLATES } from "../data/seed/qcCalibrationLayouts";

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

export function weightDeviation(weight: unknown, tested: unknown): number | null {
  const w = figure(weight);
  const t = figure(tested);
  if (!w || !t) return null;
  // A figure written bare is in the unit of the one beside it ("200.04 gm" against "200.06").
  const wmg = w.n * MG_PER[w.unit || t.unit || "gm"];
  const tmg = t.n * MG_PER[t.unit || w.unit || "gm"];
  return wmg === 0 ? null : ((tmg - wmg) / wmg) * 100;
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
    const dev = weightDeviation(row[`weight${i}`], row[`testedValue${i}`]);
    next[`deviation${i}`] = dev === null ? "" : formatDeviation(dev);
    if (dev !== null) found.push(dev);
  }
  // Pass / Fail follows the tolerance once there is something to judge and a
  // tolerance to judge it by; otherwise it is left as the tester set it.
  if (found.length > 0 && tolerance !== null) next.passFail = found.every((d) => Math.abs(d) <= tolerance + 1e-9) ? "Pass" : "Fail";
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

/** The record's data with every deviation worked out; any other document's data is returned as it is. */
export function withCalibration<T>(documentId: string | undefined, data: T): T {
  if (documentId !== "qc-weight-scale-calibration" && documentId !== "qc-gsm-plate-calibration") return data;
  const d = data as unknown as LogSheetData | undefined;
  if (!d || !Array.isArray(d.rows)) return data;
  const tolerance = tolerancePercent(d.header?.acceptableTolerance);
  const rows = d.rows.map((r) => (documentId === "qc-weight-scale-calibration" ? weightScaleRow(r, tolerance) : gsmRow(r)));
  const same = rows.every((r, i) => Object.keys(r).every((k) => r[k] === d.rows[i][k]));
  return same ? data : ({ ...d, rows } as unknown as T);
}
