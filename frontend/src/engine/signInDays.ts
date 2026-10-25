// THE PERSON'S OWN SIGN-IN DAYS, FOR THE DAILY STREAK (the owner, 25-Oct-2026; engine/streakCore.ts).
//
// "Also add streak for user can atleast login daily for once and complete it work ... like snapchat."
// A working day counts for the streak only if the person signed in that day, so the browser asks the
// server which days those were: GET /api/me/sign-in-days (backend/meRoutes.ts) - the plant days of their
// own sessions, on the website or the Mitra phone app, and the first of them on record.
//
// ASKED ONCE A DAY PER PERSON, AND AGAIN AFTER A SIGN-IN (a new session): one small request, kept in this
// tab's memory only - the days are the server's to keep (PostgreSQL, user_sessions), never written anywhere
// here. Offline, refused or unreadable, they are simply not known, and the streak is judged by the records
// alone (streakCore): what could not be read never breaks anybody's streak. The super admin is never asked
// for: he has no streak of his own. When a new answer comes, SIGN_IN_DAYS_EVENT is said on window, so the
// top bar's counter and the day card work the streak out again (engine/motivation.ts keeps the answer's
// identity in what it remembers).
import { meApi, type SignInDaysAnswer } from "../api/client";
import { addDaysISO } from "./latenessCore";
import { STREAK_LOOKBACK_DAYS } from "./streakCore";
import { todayISO } from "../utils/date";

/** Said on window when a person's sign-in days arrive or change. */
export const SIGN_IN_DAYS_EVENT = "dcrs:sign-in-days";

/** What the streak needs of the answer: the days, and the first sign-in on record (null: none). */
export interface SignInFacts {
  days: readonly string[];
  firstDay: string | null;
}

/** After an answer that could not be read, how long before it is asked for again. */
const RETRY_MS = 60 * 1000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The last answer, for one person; `key` says for which day and which session it was asked. */
let kept: { person: string; key: string; at: number; facts: SignInFacts | null } | null = null;
let asking: { key: string; answer: Promise<boolean> } | null = null;

/** The days as far as they can be believed: plant dates only, in order, each once. */
function factsOf(res: SignInDaysAnswer | null | undefined): SignInFacts | null {
  if (!res || !Array.isArray(res.days)) return null;
  const days = Array.from(new Set(res.days.filter((d): d is string => typeof d === "string" && DAY_RE.test(d)))).sort();
  return { days, firstDay: typeof res.firstDay === "string" && DAY_RE.test(res.firstDay) ? res.firstDay : null };
}

const same = (a: SignInFacts | null, b: SignInFacts | null): boolean =>
  !!a && !!b && a.firstDay === b.firstDay && a.days.length === b.days.length && a.days.every((d, i) => d === b.days[i]);

/**
 * The person's sign-in days as last read, or null (never read, or unreadable): the streak is then judged by
 * the records alone. The same object until a different answer comes, so what is remembered against it holds.
 */
export function knownSignIns(personId: string | null | undefined): SignInFacts | null {
  return personId && kept && kept.person === personId ? kept.facts : null;
}

/**
 * ASK THE SERVER FOR THE PERSON'S SIGN-IN DAYS — once a day per person, and again for a new session (a sign-in
 * since). Never for the super admin or a name alone, nor while the browser is offline; one request at a time.
 * Resolves true when a new answer came (and says so on window), so the caller works the streak out again;
 * never rejects and never logs. `read` is the request itself, replaceable in a test.
 */
export function askSignInDaysFor(
  person: { id?: string; role?: string } | null | undefined,
  sessionId?: string | null,
  read: (from: string) => Promise<SignInDaysAnswer> = (from) => meApi.signInDays(from)
): Promise<boolean> {
  const id = typeof person?.id === "string" ? person.id : "";
  if (!id || person?.role === "admin") return Promise.resolve(false);
  const today = todayISO();
  const key = `${id}|${today}|${sessionId ?? ""}`;
  if (kept && kept.key === key && (kept.facts !== null || Date.now() - kept.at < RETRY_MS)) return Promise.resolve(false);
  if (asking && asking.key === key) return asking.answer;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return Promise.resolve(false);
  const answer = Promise.resolve()
    .then(() => read(addDaysISO(today, -STREAK_LOOKBACK_DAYS)))
    .then(
      (res) => {
        const before = knownSignIns(id);
        const facts = factsOf(res);
        const fresh = facts !== null && !same(facts, before);
        kept = { person: id, key, at: Date.now(), facts: fresh ? facts : before };
        if (fresh) {
          try {
            window.dispatchEvent(new Event(SIGN_IN_DAYS_EVENT));
          } catch {
            /* no window: the caller has the answer */
          }
        }
        return fresh;
      },
      () => {
        // Not read: whatever was known of this person stays; asked again in a minute.
        kept = { person: id, key, at: Date.now(), facts: knownSignIns(id) };
        return false;
      }
    )
    .finally(() => {
      if (asking && asking.answer === answer) asking = null;
    });
  asking = { key, answer };
  return answer;
}

/** Forgets what was read — for a test, which starts each case from nothing known. */
export function forgetSignInDays(): void {
  kept = null;
  asking = null;
}
