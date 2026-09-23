import { useLayoutEffect } from "react";
import { useAppStore } from "../store/AppStore";
import { ensureRecordsGeneratedForMonth } from "../engine/recordGenerator";

// A MONTH'S DUE SHEETS EXIST BEFORE THE PAGE SHOWS THEM (REQUIREMENTS §65).
// The pages used to call the generator WHILE DRAWING, from a useMemo keyed on
// the store's version: a generator pass on every bump on every page, a write to
// storage (and to the queue for PostgreSQL) from inside a render that React may
// throw away, and no bump after it — so the bell and the briefing, drawn in the
// same pass, stayed one bump behind the records. This is CalendarPage's idiom
// instead: an effect keyed on WHAT is being looked at (the month, the
// documents), which redraws everything only when it really made something.
//
// A LAYOUT effect, deliberately: it runs before the browser paints, and the
// bump it makes is drawn in the same breath, so a page opened first on a fresh
// database never shows — not for one frame, and not to a test reading the table
// the moment it appears — a month without its sheet.
//
// Always Live (isDemo: false): demo records are only ever made deliberately, by
// Demo Mode's own generator — see the matching comment in DashboardPage.tsx.
// The generator keeps the launch-date floor itself, so browsing an old month
// never fabricates a backlog (engine/recordGenerator.ts).
export function useEnsureMonth(year: number, month: number, documentIds?: readonly string[]): void {
  const { bump } = useAppStore();
  // The ids as one string: a page that builds its list while drawing hands over
  // a new array every time, and that must not read as "something changed".
  const only = documentIds ? documentIds.join("\n") : null;
  useLayoutEffect(() => {
    const made = ensureRecordsGeneratedForMonth(year, month, { documentIds: only === null ? undefined : only.split("\n"), isDemo: false });
    if (made.length > 0) bump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, only]);
}
