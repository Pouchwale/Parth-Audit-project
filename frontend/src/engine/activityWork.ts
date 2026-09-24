// WHAT THE ACTIVITY LOG SAYS A PERSON DID (REQUIREMENTS §73).
//
// "whatever the work that user has done in whole day, month, year and
// according to that logs also score will decide."
//
// The counts come from the server, grouped in PostgreSQL (backend/db.ts
// activitySummary) — a year of a busy plant is far more lines than a page
// should hold. What lives here is only the reading of them, shared by the two
// screens that show them: the Activity Log, which has the lines themselves for
// a day, a month or a year, and the Performance Scorecard, which shows the
// tally BESIDE the score.
//
// Beside, not inside. The score is the RECORDS' own arithmetic — what fell due
// and what was submitted on time (§64) — and it stays exactly as it was. This
// answers the other half of the same question: who actually did the work. A
// department can be perfectly up to date because one person did all of it, and
// the score alone would never say so.

/** One person's tally for a span, exactly as the server counted it. */
export interface ActivityTally {
  userId: string | null;
  userName: string;
  /** Lines, by action — the action strings the log itself writes. */
  byAction: Record<string, number>;
  total: number;
  firstAt: string;
  lastAt: string;
  /** Separate days they did anything at all — the honest measure of a month. */
  activeDays: number;
}

// THE ACTIONS THAT ARE THE WORK ITSELF, in the order the paperwork moves, and
// under the names the log ACTUALLY writes (engine/recordHistory.ts,
// ACTIVITY_WORDS): "Record edited", not "Record saved". Getting these wrong
// does not break anything — it silently shows a column of zeros — so they are
// taken from that table rather than guessed at.
//
// Filling a record in through Mitra is still filling it in. A record the
// assistant prepared counts as filled in too: preparing it is what the person
// then checks, and it is their record from that moment on (§64).
export const FILLED_IN = ["Record edited", "Record edited through Mitra", "Record prepared"];
export const SUBMITTED = ["Record submitted for verification"];
export const APPROVED = ["Record verified"];

/** How many of these actions this person did. Unknown actions count as none. */
export const countOf = (t: ActivityTally, actions: readonly string[]): number => actions.reduce((n, a) => n + (t.byAction[a] ?? 0), 0);

/**
 * THE WORK ITSELF: filled in, sent for approval, approved. Everything else a
 * person does — opening a document, printing it, downloading it — is in the
 * total but is not what a day is judged on, so it is not counted here.
 */
export const worked = (t: ActivityTally): number => countOf(t, FILLED_IN) + countOf(t, SUBMITTED) + countOf(t, APPROVED);
