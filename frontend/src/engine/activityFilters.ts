// THE ACTIVITY LOG'S CHIPS (the owner, 14-Oct-2026: "which user what does and
// in which modules and documents") — the query they build, and the figures
// shown beside them, kept out of the page so they can be proved without a
// browser (frontend/tests/activityFilters.test.ts).
//
// Every chip goes to the SERVER as one query parameter (backend/activityRoutes.ts
// readActivityFilter): a year of a busy plant is far more lines than the page
// should hold, so nothing is filtered in the browser. The chips combine — each
// is one more AND — and "Show older" and the CSV read with the very same query.
import type { ActivityTally } from "./activityWork";

// A DAY, A MONTH, A YEAR (REQUIREMENTS §73).
//
// "whatever the work that user has done in whole day, month, year and
// according to that logs also score will decide."
//
// The spans a person actually asks for, each as two plain dates the server
// filters on. "All" sends none, which is the log as it was before.
export type SpanId = "day" | "month" | "year" | "all";

export const SPAN_IDS: SpanId[] = ["day", "month", "year", "all"];

const pad = (n: number): string => String(n).padStart(2, "0");
const iso = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Both ends included, as a person means them. */
export function spanDates(span: SpanId, now = new Date()): { from?: string; to?: string } {
  if (span === "all") return {};
  const to = iso(now);
  if (span === "day") return { from: to, to };
  if (span === "month") return { from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, to };
  return { from: `${now.getFullYear()}-01-01`, to };
}

/** What the page is kept to: the span, and each chip ("" = not pressed). */
export interface ActivityChips {
  span: SpanId;
  /** An account id. */
  person: string;
  /** A module's code ("QC"). */
  department: string;
  /** Words of a format number or name, typed or picked. */
  document: string;
  /** An action exactly as the log holds it ("Record started"). */
  action: string;
  /** The search box. */
  q: string;
}

export const NO_CHIPS: ActivityChips = { span: "day", person: "", department: "", document: "", action: "", q: "" };

/**
 * The query string the lines, the tally, the archive's readings and "Show
 * older" are all read with — the same one, built once per reading. Empty for
 * "Everything" with no chip pressed. Values are encoded, so "F/QC/01" and a
 * search with an ampersand travel whole.
 */
export function activityQuery(chips: ActivityChips, now = new Date()): string {
  const { from, to } = spanDates(chips.span, now);
  const q = chips.q.trim();
  const document = chips.document.trim();
  const parts: [string, string | undefined][] = [
    ["from", from],
    ["to", to],
    ["person", chips.person || undefined],
    ["department", chips.department || undefined],
    ["document", document || undefined],
    ["action", chips.action || undefined],
    ["q", q || undefined],
  ];
  return parts
    .filter((p): p is [string, string] => Boolean(p[1]))
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
}

/** Whether any chip (not the span, not the search) is pressed. */
export const anyChip = (chips: ActivityChips): boolean => Boolean(chips.person || chips.department || chips.document || chips.action);

/** The count of lines the reading matched: the tally counts every line of the same filter in the database. */
export const matchingLines = (tallies: readonly ActivityTally[]): number => tallies.reduce((n, t) => n + (t.total || 0), 0);

/**
 * The actions the log holds, for the action chips: everything the readings so
 * far have counted, so that pressing one chip does not make the others vanish
 * (the tally of a reading kept to one action holds that action alone).
 */
export function actionsHeld(tallies: readonly ActivityTally[], known: readonly string[] = []): string[] {
  const all = new Set(known);
  for (const t of tallies) for (const a of Object.keys(t.byAction)) if (a) all.add(a);
  return [...all].sort((a, b) => a.localeCompare(b));
}
