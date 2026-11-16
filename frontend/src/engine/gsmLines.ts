// F/QC/11'S LINES ADDED AND TAKEN OFF ANYWHERE (REQUIREMENTS §233; the owner, 16-Nov-2026: "in qc-11 add add row button
// like user can add new row or delete also in between anywhere"; asked: the test lines numbered again, Pass/Fail and Sign.
// at the bottom). The paper's grid is four test lines - "Tasted-1", "2", "3", "4" - then Pass/Fail and Sign., one cell a
// plate. A line put in after any test line is a test line, its plates' sizes written as on the others; the test lines
// are then numbered Tasted-1, 2, 3, 4, 5 … down the page, and Pass/Fail and Sign. stay at the foot. A line taken off
// leaves the others numbered again the same way.

import type { LogSheetRow } from "../types";
import { GSM_PLATES } from "../data/seed/qcCalibrationLayouts";

export const GSM_DOC = "qc-gsm-plate-calibration";

const words = (v: unknown): string => String(v ?? "").trim();
/** A line a plate is measured on: "Tasted-1", "2", "3" … */
export const isGsmTestLine = (parameter: unknown): boolean => /^(tasted\s*-?\s*)?\d{1,3}$/i.test(words(parameter));
/** The paper's last two lines: Pass/Fail and Sign., one cell a plate. */
export const isGsmFootLine = (parameter: unknown): boolean => /^(pass\s*\/\s*fail|sign\.?)$/i.test(words(parameter));
/** What the n-th test line is called, as the paper calls its four. */
export const gsmTestLineName = (n: number): string => (n === 1 ? "Tasted-1" : String(n));

/** The lines in the paper's order - Pass/Fail and Sign. at the foot - and the test lines numbered 1, 2, 3 … down the page. */
export function gsmLinesInOrder(rows: LogSheetRow[]): LogSheetRow[] {
  const ordered = [...rows.filter((r) => !isGsmFootLine(r.parameter)), ...rows.filter((r) => isGsmFootLine(r.parameter))];
  let n = 0;
  return ordered.map((r) => {
    if (!isGsmTestLine(r.parameter)) return r;
    const name = gsmTestLineName(++n);
    return words(r.parameter) === name ? r : { ...r, parameter: name };
  });
}

/**
 * A new test line put in under `afterId` (under the last test line when that is Pass/Fail or Sign., or not given): the
 * plates' sizes written in it, as the sheet writes them on the others (engine/nominalFill.ts), every line in order.
 */
export function gsmLineInserted(rows: LogSheetRow[], line: LogSheetRow, afterId?: string): LogSheetRow[] {
  const next: LogSheetRow = { ...line, parameter: "0" };
  for (const plate of GSM_PLATES) {
    if (!words(next[plate.key])) next[plate.key] = plate.size;
  }
  const clicked = afterId ? rows.findIndex((r) => r.id === afterId) : -1;
  const lastTest = rows.reduce((at, r, i) => (isGsmTestLine(r.parameter) ? i : at), -1);
  const firstFoot = rows.findIndex((r) => isGsmFootLine(r.parameter));
  const under = clicked >= 0 && !isGsmFootLine(rows[clicked].parameter) ? clicked : lastTest >= 0 ? lastTest : firstFoot >= 0 ? firstFoot - 1 : rows.length - 1;
  return gsmLinesInOrder([...rows.slice(0, under + 1), next, ...rows.slice(under + 1)]);
}
