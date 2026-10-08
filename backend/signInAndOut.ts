// SIGNING IN AND OUT AT THE DOOR (REQUIREMENTS §66, §84 and its addendum): the sign-in throttle, and what a sign-out
// ends and what its line says. The routes are in backend/index.ts (POST /api/auth/login, POST /api/auth/logout); the
// rules are here, where backend/tests/signInAndOut.test.ts proves them without a server.
import { END_OF_DAY_REASON, END_OF_HOURS_REASON, OUTSIDE_HOURS_REASON } from "../frontend/src/engine/workingHoursCore.ts";

// ---------------------------------------------------------------------------
// the sign-in throttle

/** Wrong passwords for one address, from one computer, within the window: then that computer waits for the window. */
export const MAX_SIGN_IN_ATTEMPTS = 8;
export const SIGN_IN_WINDOW_MS = 10 * 60 * 1000;

/**
 * THE GUARD AGAINST GUESSING A PASSWORD, kept in memory (it starts afresh with the server; enough for the plant's own
 * network, not a substitute for a firewall).
 *
 * KEYED BY THE ADDRESS TYPED AND THE COMPUTER IT CAME FROM (its IP address). Until 8-Oct-2026 it was keyed by the
 * address alone, and so anybody who could reach the sign-in page could keep the super admin out for ten minutes, again
 * and again, with eight wrong passwords for his address — while the owner's rule is that he may sign in at any time
 * (6-Oct-2026; the review of 8-Oct-2026; audit M-22). Now eight wrong passwords hold back only the computer they came
 * from: there even the right password waits out the ten minutes, so guessing gets no faster, while the same address
 * signs in at once from any other computer.
 */
export interface SignInThrottle {
  /** True while this computer must wait before trying this address again. */
  held(email: string, ip: string | undefined): boolean;
  /** A wrong password (or no such account) for this address from this computer. */
  failed(email: string, ip: string | undefined): void;
  /** Signed in: this computer's count for this address starts again. */
  succeeded(email: string, ip: string | undefined): void;
  /** Forgets every count older than the window (the server calls it once a minute). */
  sweep(): void;
  /** How many counts are kept. */
  readonly size: number;
}

export function createSignInThrottle(clock: () => number = Date.now): SignInThrottle {
  const attempts = new Map<string, { count: number; first: number }>();
  // A line break cannot be in an address the sign-in accepts, so the two parts never run together.
  const keyOf = (email: string, ip: string | undefined): string => `${email}\n${ip || "unknown"}`;
  return {
    held(email, ip) {
      const key = keyOf(email, ip);
      const rec = attempts.get(key);
      if (!rec) return false;
      if (clock() - rec.first > SIGN_IN_WINDOW_MS) {
        attempts.delete(key);
        return false;
      }
      return rec.count >= MAX_SIGN_IN_ATTEMPTS;
    },
    failed(email, ip) {
      const key = keyOf(email, ip);
      const rec = attempts.get(key) ?? { count: 0, first: clock() };
      rec.count += 1;
      attempts.set(key, rec);
    },
    succeeded(email, ip) {
      attempts.delete(keyOf(email, ip));
    },
    sweep() {
      const now = clock();
      for (const [key, rec] of attempts) if (now - rec.first > SIGN_IN_WINDOW_MS) attempts.delete(key);
    },
    get size() {
      return attempts.size;
    },
  };
}

// ---------------------------------------------------------------------------
// a sign-out

/** The words of the "Signed out" line for each reason a browser gives when it signs a person out by itself (§84, C4). */
export const SIGN_OUT_WORDS = {
  // Staff's browser at the close of their working hours.
  [END_OF_HOURS_REASON]: "At the close of working hours",
  // Staff's session refused outside the hours, and the browser signed out.
  [OUTSIDE_HOURS_REASON]: "Outside working hours",
  // The super admin's session at the end of its day, the factory's midnight (§84 addendum, 6-Oct-2026).
  [END_OF_DAY_REASON]: "At the end of the day (midnight)",
} as const;

/**
 * The words for a sign-out's reason — only a reason that fits the account (the review of 8-Oct-2026): the end of the
 * day (midnight) is the super admin's alone, as staff's sessions end with their working hours; the close of the hours
 * and a refusal outside them are staff's alone, as the hours never hold him. Any other reason, or one that does not
 * fit, is a plain sign-out: "".
 */
export function signOutWords(reason: unknown, role: string): string {
  if (reason === END_OF_DAY_REASON) return role === "admin" ? SIGN_OUT_WORDS[END_OF_DAY_REASON] : "";
  if (reason === END_OF_HOURS_REASON || reason === OUTSIDE_HOURS_REASON) return role === "admin" ? "" : SIGN_OUT_WORDS[reason];
  return "";
}

/**
 * Whether a sign-out ends the session this browser's cookie holds.
 *
 * An ordinary sign-out — the Log Out button — names no session, and ends whatever session the browser has. A tab that
 * ends its session by itself (at the close of the hours, at the end of the day, refused outside them) names the
 * session it is ending (`sessionId`, the id its sign-in answer gave). When the browser's cookie holds another session
 * by then, that one is left alone: he has signed in again in another tab while this one's clock ran late (Chrome wakes
 * a tab hidden for five minutes once a minute; a laptop wakes from sleep). Before 8-Oct-2026 such a tab's sign-out
 * ended the session he had just started, and wrote a false "Signed out" line for it.
 */
export function endsThisSession(named: unknown, cookieSession: string | null | undefined): boolean {
  if (typeof named !== "string" || named === "") return true;
  return cookieSession === named;
}
