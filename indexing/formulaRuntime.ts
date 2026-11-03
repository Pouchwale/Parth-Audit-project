// WHICH FORMULA A RECORD IS WORKED OUT WITH.
//
// The app's calculation code (frontend/src/engine/calibration.ts, purchaseRatings.ts, auditRisk.ts, maintenanceCalc.ts,
// marketingCalc.ts) asks here, cell by cell, whether the super admin has changed that cell's formula. While nobody has,
// the answer is null and the code works the cell out exactly as it always did.
//
// A CHANGED FORMULA REACHES THE REAL DATA, BUT NEVER A SIGNED RECORD SILENTLY:
//   * every record that is still open (Scheduled, Due, In Progress, Rejected) and every new one is worked out with the
//     formula in force NOW — and the index re-works the open records the moment a formula is saved;
//   * a record already Submitted, Pending Verification or Verified is worked out with the formula that was in force when
//     it was submitted, so what a person signed and a verifier checked never changes under them. If it is reopened for
//     correction it is open again, and takes the formula in force then.
//
// The moment a record is worked out for is set around the calculation by withFormulaTime (engine/computedCells.ts);
// with none set it is now.

import { compileFormula, type CompiledFormula } from "./formulaLanguage";
import { formulaSlot } from "./formulas";
import { readIndexState, type FormulaEntry } from "./indexState";

let clock: string | undefined;

/** The moment set by withFormulaTime, or undefined (now). */
export const currentFormulaClock = (): string | undefined => clock;

/** Runs `fn` with formulas taken as they were in force at `asOf` (an ISO time); undefined means now. */
export function withFormulaTime<T>(asOf: string | undefined, fn: () => T): T {
  const before = clock;
  clock = asOf;
  try {
    return fn();
  } finally {
    clock = before;
  }
}

const LOCKED = new Set(["Submitted", "Pending Verification", "Verified"]);

/** The moment a record's formulas are taken from: its submission when it is signed, otherwise undefined (now). */
export function formulaTimeOf(record: { status?: string; submittedAt?: string; verifiedAt?: string; updatedAt?: string } | null | undefined): string | undefined {
  if (!record || !record.status || !LOCKED.has(record.status)) return undefined;
  return record.submittedAt ?? record.verifiedAt ?? record.updatedAt;
}

/** The entry of a formula's timeline in force at `asOf`, or undefined while it has never been changed by then. */
export function entryInForce(timeline: readonly FormulaEntry[] | undefined, asOf: string): FormulaEntry | undefined {
  if (!timeline || timeline.length === 0) return undefined;
  let found: FormulaEntry | undefined;
  for (const e of timeline) if (e.since <= asOf) found = e;
  return found;
}

/**
 * The changed formula for this cell, ready to work out — or null when the default formula is in force (and the app's
 * own code works the cell out, exactly as before). A stored formula that cannot be read is never used: null again.
 */
export function formulaOverride(slotId: string): CompiledFormula | null {
  const state = readIndexState();
  const timeline = state.formulas[slotId];
  if (!timeline || timeline.length === 0) return null;
  const entry = entryInForce(timeline, clock ?? new Date().toISOString());
  if (!entry || entry.expr === null) return null;
  const slot = formulaSlot(slotId);
  if (!slot) return null;
  const compiled = compileFormula(entry.expr, slot.variables.map((v) => v.name));
  return compiled.ok ? compiled.run : null;
}
