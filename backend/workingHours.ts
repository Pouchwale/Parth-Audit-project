// THE PLANT'S WORKING HOURS, HELD BY THE SERVER (REQUIREMENTS §84).
//
// Every account but the super admin may use DCRS only on a working day of the
// plant's calendar, from START to END in the factory's time zone (C1, C2). The
// rule itself — the calendar, the hours, the next opening, the words — is
// frontend/src/engine/workingHoursCore.ts, the same file the browser runs. What
// is here is where the server gets the rule's inputs and how it answers:
//
//   * THE CALENDAR AND THE HOURS are the company's master data, the `master`
//     item of app_storage — the Master Data page's own copy, the Holidays tab and
//     the working hours both. It is read again only when it has changed (its
//     `seq` moves on every write), and only its calendar and hours are kept.
//     With no master item stored at all (a new database nobody has signed in to
//     yet) the seeded calendar is used: the 2026 leave calendar, adjustment days
//     and all (frontend/src/data/seed/masterData.ts) — never "every Thursday
//     closed" by default, which would refuse the plant on its adjustment days.
//   * THE FACTORY'S CLOCK is PLANT_TIMEZONE (db.ts plantTimeZone), Asia/Kolkata
//     unless set: a hosted server's clock usually runs in UTC.
//   * DCRS_WORKING_HOURS=off switches the gate off — nobody is refused, and a
//     session runs to the factory's midnight for everybody. The e2e runner's
//     test servers are started so (scripts/run-e2e.ts): the suites run at any
//     hour of any day. Anything else, unset included, holds the plant to its hours.
//
// The routes that use it are in backend/index.ts (sign-in, sign-up, sign-out,
// requireAuth, requireSession, /api/auth/me and /api/auth/config) and
// backend/apiV1.ts (the Audit Assistant's signed-in check). Its tests are
// backend/tests/workingHours.test.ts, with a clock the test sets.
import { database, plantTimeZone } from "./db.ts";
import {
  outsideHoursRefusal,
  personHours,
  plantNow,
  publicHours,
  sessionEndsAt,
  type HoursCalendar,
  type OutsideHoursRefusal,
  type PersonHours,
  type PlantNow,
  type PublicHours,
} from "../frontend/src/engine/workingHoursCore.ts";

/** Whether this server holds the plant to its hours: anything but DCRS_WORKING_HOURS=off (or 0, false, no). */
export function workingHoursEnforced(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.DCRS_WORKING_HOURS ?? "").trim().toLowerCase();
  return !(v === "off" || v === "0" || v === "false" || v === "no");
}

/** Where the master item is read from: the server's own database, or a test's stand-in. */
export interface MasterSource {
  /** The stored master item's seq (it moves on every write), or null when none is stored. */
  seq(): Promise<number | null>;
  /** The stored master item's JSON, or null. */
  read(): Promise<string | null>;
}

export const databaseMasterSource: MasterSource = {
  async seq() {
    const { rows } = await database().query<{ seq: string }>("SELECT seq::text AS seq FROM app_storage WHERE scope = 'company' AND key = 'master'");
    return rows[0] ? Number(rows[0].seq) : null;
  },
  async read() {
    const { rows } = await database().query<{ value: string }>("SELECT value FROM app_storage WHERE scope = 'company' AND key = 'master'");
    return rows[0]?.value ?? null;
  },
};

/** Only what the rule reads, so a cached calendar never holds the whole master data. */
function calendarFields(value: unknown): HoursCalendar | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const m = value as Record<string, unknown>;
  return {
    weeklyOffDay: typeof m.weeklyOffDay === "number" ? m.weeklyOffDay : null,
    holidays: Array.isArray(m.holidays) ? m.holidays : [],
    adjustmentDays: Array.isArray(m.adjustmentDays) ? m.adjustmentDays : [],
    workingHours: m.workingHours && typeof m.workingHours === "object" ? (m.workingHours as HoursCalendar["workingHours"]) : null,
  };
}

// The seeded master data, loaded when first needed. A path held in a variable,
// so the type checker does not follow the app's extensionless imports into it;
// Node itself loads it (its only import is a type, which is stripped).
const SEED_MASTER_FILE: string = "../frontend/src/data/seed/masterData.ts";
let seeded: Promise<HoursCalendar | null> | null = null;
export function seededCalendar(): Promise<HoursCalendar | null> {
  seeded ??= (import(SEED_MASTER_FILE) as Promise<{ SEED_MASTER_DATA?: unknown }>)
    .then((m) => calendarFields(m.SEED_MASTER_DATA))
    .catch((err: unknown) => {
      console.error("[working hours] the seeded calendar could not be loaded:", err instanceof Error ? err.message : err);
      return null;
    });
  return seeded;
}

export interface WorkingHoursGateOptions {
  source?: MasterSource;
  /** The time now; a test sets it. */
  clock?: () => Date;
  /** Left out: DCRS_WORKING_HOURS decides. */
  enforced?: boolean;
  /** Left out: PLANT_TIMEZONE (db.ts). */
  timeZone?: () => string;
  /** The calendar when no master item is stored; left out, the seeded one. */
  seed?: () => Promise<HoursCalendar | null>;
}

/** What a session is told about its own end (C3, C4): in /api/auth/login and /api/auth/me. */
export interface SessionAnswer {
  /** When this session ends: END of today for an account held to the hours, the factory's midnight otherwise. */
  endsAt: string;
  /** The browser signs this account out by itself at `endsAt`, with a warning ten minutes before (a non-admin while the hours are enforced). */
  signOutAtEnd: boolean;
  /** The server's clock, so a browser whose own clock is off can allow for it. */
  now: string;
  /**
   * The session's own id (backend/auth.ts): a tab that ends its session by itself names it in POST /api/auth/logout,
   * so it never ends a newer session of the same browser. Left out for a token made before sessions had ids.
   */
  id?: string;
}

export interface WorkingHoursGate {
  readonly enforced: boolean;
  /** The time now, by the gate's clock. */
  now(): Date;
  /** The calendar and hours in force (read again only when the master item has changed). */
  calendar(): Promise<HoursCalendar | null>;
  /** Where the plant's day stands now. */
  state(): Promise<PlantNow>;
  /** Null when this account may use DCRS now; the 403 body otherwise. The super admin is never refused. */
  refusal(user: { role: string }): Promise<OutsideHoursRefusal | null>;
  /** When a session this account starts now ends (C3). */
  sessionEnd(user: { role: string }): Promise<Date>;
  /** What a session is told about its end: the earlier of its token's end and the close of today by the calendar as it stands now; with its id, when it has one. */
  sessionAnswer(user: { role: string }, tokenEndsAt: Date, sessionId?: string | null): Promise<SessionAnswer>;
  /** The public answer: the staff's hours and where today stands, in words. */
  publicAnswer(): Promise<PublicHours>;
  /** The answer for one signed-in person: the public one, whether the hours hold them, and the super admin's own line. */
  personAnswer(user: { role: string }): Promise<PersonHours>;
}

export function createWorkingHoursGate(opts: WorkingHoursGateOptions = {}): WorkingHoursGate {
  const source = opts.source ?? databaseMasterSource;
  const clock = opts.clock ?? (() => new Date());
  const enforced = opts.enforced ?? workingHoursEnforced();
  const zone = opts.timeZone ?? plantTimeZone;
  const seed = opts.seed ?? seededCalendar;
  let cached: { seq: number | null; calendar: HoursCalendar | null } | null = null;

  async function calendar(): Promise<HoursCalendar | null> {
    const seq = await source.seq();
    if (cached && cached.seq === seq) return cached.calendar;
    let read: HoursCalendar | null = null;
    if (seq === null) {
      read = await seed();
    } else {
      const text = await source.read();
      try {
        read = text === null ? null : calendarFields(JSON.parse(text));
      } catch {
        // Unreadable: the plain rule (Thursday off, 08:40–18:20) rather than no rule at all.
        read = null;
      }
    }
    cached = { seq, calendar: read };
    return read;
  }

  const state = async (): Promise<PlantNow> => plantNow(await calendar(), clock(), zone());
  const heldToHours = (user: { role: string }): boolean => enforced && user.role !== "admin";

  return {
    enforced,
    now: clock,
    calendar,
    state,
    async refusal(user) {
      if (!heldToHours(user)) return null;
      const now = await state();
      return now.open ? null : outsideHoursRefusal(now);
    },
    async sessionEnd(user) {
      return sessionEndsAt({ admin: user.role === "admin", enforced, state: await state() });
    },
    async sessionAnswer(user, tokenEndsAt, sessionId) {
      const now = await state();
      const byCalendar = sessionEndsAt({ admin: user.role === "admin", enforced, state: now });
      // The token's own end stands unless the calendar now closes the day sooner (the super admin moved END earlier, say).
      const endsAt = heldToHours(user) && byCalendar.getTime() < tokenEndsAt.getTime() ? byCalendar : tokenEndsAt;
      return { endsAt: endsAt.toISOString(), signOutAtEnd: heldToHours(user), now: now.now.toISOString(), ...(sessionId ? { id: sessionId } : {}) };
    },
    async publicAnswer() {
      return publicHours(await state(), enforced);
    },
    async personAnswer(user) {
      return personHours(await state(), enforced, { admin: user.role === "admin" });
    },
  };
}
