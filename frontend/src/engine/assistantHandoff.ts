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
