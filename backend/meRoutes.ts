// A PERSON'S OWN SIGN-IN DAYS, FOR THEIR DAILY STREAK (the owner, 25-Oct-2026).
//
// "Also add streak for user can atleast login daily for once and complete it work which is help to
// improve there score so there improved like snapchat." A working day counts for the streak only if the
// person signed in that day (frontend/src/engine/streakCore.ts), and every sign-in is already a row of
// user_sessions (REQUIREMENTS §106: backend/deviceSessions.ts writes it at the sign-in and at the sign-up,
// on the website and through the Mitra phone app; nothing deletes a row). This is the one question the
// browser could not answer itself:
//
//   GET /api/me/sign-in-days?from=YYYY-MM-DD
//     { days: ["2026-10-12", ...], firstDay: "2026-10-09" | null, from, to }
//
// THE CALLER'S OWN, AND NOBODY ELSE'S: the account is the session's (requireAuth: the cookie, the plant's
// hours, the forced password change), and the route takes no account at all - a `user` or `userId` in the
// address is not read. `days` are the plant days (the connection's own time zone, db.ts: the plant's) of
// their sessions from `from` to today, each once, oldest first; `firstDay` is the first plant day any
// sign-in of theirs is on record, so the streak knows from when a day with none is a day missed. Only the
// person's own sign-ins count: the website and the phone app, never another program signing in for them
// (place "api", the Audit Assistant's DCRS token). The window is at most SIGN_IN_DAYS_WINDOW days: an
// older `from` is read as the window's first day, a later one as today.
//
// FAST: one range read of the index made here, user_sessions (user_id, signed_in_at), and one look at its
// first entry - a person signs in once or twice a day, so a whole window is a few hundred rows at most.
import type { Express, Request, RequestHandler, Response } from "express";
import type { PublicUser } from "./auth.ts";
import { database, isDatabaseUnavailable, plantTimeZone, registerSchema } from "./db.ts";
import { addDaysISO, dateInZone } from "../frontend/src/engine/latenessCore.ts";

// THE INDEX THE QUESTION IS ANSWERED FROM, made with the rest of the schema when the database is opened
// (db.ts registerSchema, IF NOT EXISTS, under its lock): the table's own index covers only open sessions.
registerSchema(`
  CREATE INDEX IF NOT EXISTS user_sessions_user_signed_in_idx ON user_sessions (user_id, signed_in_at);
`);

/** The longest span of days one question may cover. */
export const SIGN_IN_DAYS_WINDOW = 200;

/** The sessions that are the person's own sign-in: the website, and the Mitra phone app. */
export const OWN_SIGN_IN_PLACES: readonly string[] = ["website", "phone-app"];

/** Where the days are read from: PostgreSQL, or a stand-in in a test. */
export interface SignInDaysSource {
  /** The plant days (YYYY-MM-DD) from `from` to `to`, both counted, on which this account signed in. */
  days(userId: string, from: string, to: string): Promise<string[]>;
  /** The first plant day any sign-in of this account is on record; null for none. */
  firstDay(userId: string): Promise<string | null>;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A real date written YYYY-MM-DD (2026-02-30 is not one). */
function isRealDay(text: string): boolean {
  if (!DAY_RE.test(text)) return false;
  const [y, m, d] = text.split("-").map(Number);
  const when = new Date(Date.UTC(y, m - 1, d));
  return when.getUTCFullYear() === y && when.getUTCMonth() === m - 1 && when.getUTCDate() === d;
}

/** The sessions in PostgreSQL (db.ts user_sessions); every connection counts days in the plant's zone. */
export function postgresSignInDays(): SignInDaysSource {
  return {
    async days(userId, from, to) {
      const { rows } = await database().query<{ day: string }>(
        `SELECT DISTINCT to_char(signed_in_at, 'YYYY-MM-DD') AS day
           FROM user_sessions
          WHERE user_id = $1 AND place = ANY($2::text[])
            AND signed_in_at >= $3::date AND signed_in_at < $4::date + 1
          ORDER BY day`,
        [userId, OWN_SIGN_IN_PLACES, from, to]
      );
      return rows.map((r) => r.day);
    },
    async firstDay(userId) {
      const { rows } = await database().query<{ day: string | null }>(
        "SELECT to_char(min(signed_in_at), 'YYYY-MM-DD') AS day FROM user_sessions WHERE user_id = $1 AND place = ANY($2::text[])",
        [userId, OWN_SIGN_IN_PLACES]
      );
      return rows[0]?.day ?? null;
    },
  };
}

export interface MeRoutesDeps {
  /** backend/index.ts requireAuth: the session, the plant's hours, the forced password change. */
  requireAuth: RequestHandler;
  /** Where the days come from; PostgreSQL unless a test says otherwise. */
  source?: SignInDaysSource;
  /** The plant's date today; the server's clock in the plant's zone unless a test says otherwise. */
  today?: () => string;
  /** Where an unexpected failure is said; the server's console unless a test says otherwise. */
  log?: (line: string) => void;
}

/** The routes of the signed-in person's own: GET /api/me/sign-in-days. */
export function registerMeRoutes(app: Express, deps: MeRoutesDeps): void {
  const source = deps.source ?? postgresSignInDays();
  const today = deps.today ?? (() => dateInZone(new Date(), plantTimeZone()) ?? new Date().toISOString().slice(0, 10));
  const log = deps.log ?? ((line: string) => console.error(line));

  app.get("/api/me/sign-in-days", deps.requireAuth, async (req: Request, res: Response): Promise<void> => {
    res.set("Cache-Control", "no-store");
    // The session's account, and only that: nothing in the address names anybody.
    const me = (req as Request & { user: PublicUser }).user;
    const to = today();
    const earliest = addDaysISO(to, -SIGN_IN_DAYS_WINDOW);
    const asked = req.query.from;
    let from = earliest;
    if (asked !== undefined) {
      if (typeof asked !== "string" || !isRealDay(asked)) {
        res.status(400).json({ error: "from must be a date written YYYY-MM-DD.", code: "bad-request" });
        return;
      }
      from = asked < earliest ? earliest : asked > to ? to : asked;
    }
    try {
      const [days, firstDay] = await Promise.all([source.days(me.id, from, to), source.firstDay(me.id)]);
      res.json({ days: days.filter((d) => DAY_RE.test(d) && d >= from && d <= to), firstDay: firstDay && DAY_RE.test(firstDay) ? firstDay : null, from, to });
    } catch (err) {
      if (!isDatabaseUnavailable(err)) log(`[sign-in days] ${err instanceof Error ? err.message : String(err)}`);
      res.status(503).json({ error: "The sign-in days could not be read just now.", code: "unavailable" });
    }
  });
}
