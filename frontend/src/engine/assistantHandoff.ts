// A REQUEST THAT OUTLIVES A NAVIGATION. "Generate an external CAPA for me" or
// "I want to fill the daily monitoring record" is often said where no record
// is open — on the full-page Assistant, in the library, on the dashboard. The
// assistant then creates or finds the record, opens it, and only THEN can act
// on it (the record page has to be on screen to hand the widget its live
// data). What to do once it opens is parked here, keyed to the record, and
// the widget collects it when that record registers itself. Module state is
// enough: the app is one page, and a hash navigation never reloads it.

export type HandoffAction = "interview" | "sample";

interface Handoff {
  recordId: string;
  then: HandoffAction;
}

let pending: Handoff | null = null;

/** Park what the assistant should do the moment this record is open. */
export function queueAfterOpen(recordId: string, then: HandoffAction): void {
  pending = { recordId, then };
}

/** The parked action for this record, if any — taken once. A request for a
 *  different record supersedes it, so going somewhere else first simply drops it. */
export function takeHandoff(recordId: string): HandoffAction | null {
  if (!pending || pending.recordId !== recordId) return null;
  const then = pending.then;
  pending = null;
  return then;
}

// THE BOXES A FILL CHANGED (REQUIREMENTS §94), to glow for two seconds once the
// record they are on is drawn: a fill made from the Ask Mitra page or from another
// page opens the record afterwards, and the person sees what changed. Keyed to the
// record, like the action above; a later fill of another record supersedes it.
let glow: { recordId: string; paths: string[] } | null = null;

/** Park the changed boxes' binding paths (engine/roundTrip/bindingsFor.ts) for this record. */
export function queueHighlight(recordId: string, paths: string[]): void {
  glow = paths.length ? { recordId, paths: paths.slice(0, 200) } : null;
}

/** The parked paths for this record — taken once, or only looked at (`peek`). */
export function takeHighlight(recordId: string, peek = false): string[] | null {
  if (!glow || glow.recordId !== recordId) return null;
  const paths = glow.paths;
  if (!peek) glow = null;
  return paths;
}
