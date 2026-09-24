import assert from "node:assert/strict";
import type { LogSheetLayout } from "../../src/types";
import { LOG_SHEET_LAYOUTS } from "../../src/data/seed/logSheetLayouts";

/** One layout a record can be drawn with, and how a failure should name it. */
export interface NamedLayout {
  /** "qc-viscosity", or "mnt-lux-level (Rev 00)" for a superseded revision. */
  name: string;
  layout: LogSheetLayout;
}

// EVERY GRID A RECORD CAN BE DRAWN WITH: each issued layout, and each revision
// it replaced (REQUIREMENTS §74). A record filled on F/MNT/11 Rev 00 is drawn,
// checked and printed with that revision's own layout, so a duplicate key or a
// number in a fixed row there breaks a real record just as it would on the
// current revision, and the checks walk both.
export function everyLayout(): NamedLayout[] {
  const out: NamedLayout[] = [];
  for (const [id, layout] of Object.entries(LOG_SHEET_LAYOUTS)) {
    out.push({ name: id, layout });
    for (const [revision, superseded] of Object.entries(layout.supersededRevisions ?? {})) {
      out.push({ name: `${id} (Rev ${revision})`, layout: superseded.layout });
    }
  }
  return out;
}

// A catalogue check fails once with EVERY offender listed, one per line, rather
// than at the first: whoever wires a format in fixes them all in one pass
// instead of rerunning once per mistake.
export function noProblems(what: string, problems: string[]): void {
  if (problems.length === 0) return;
  assert.fail(`${what} — ${problems.length} problem${problems.length === 1 ? "" : "s"}:\n  ${problems.join("\n  ")}`);
}
