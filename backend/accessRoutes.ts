import type { Express, Request, RequestHandler, Response } from "express";
import type { PublicUser } from "./auth.ts";
import { database, plantTimeZone } from "./db.ts";
import { csvText } from "./overviewRoutes.ts";
import { createWorkingHoursGate } from "./workingHours.ts";
import { SIGN_OUT_WORDS } from "./signInAndOut.ts";
import { END_OF_DAY_REASON, END_OF_HOURS_REASON, LATE_SIGN_IN_MS, nextMidnight, type PublicHours } from "../frontend/src/engine/workingHoursCore.ts";

// USER ACCESS, FOR THE SUPER ADMIN (REQUIREMENTS §84).
//
// "Make sure the super admin has every kind of detail: which user can see what,
// and when each logs in and logs out. ... The super admin has access to every
// module, and can remove or add any user from any module, from a dedicated
// dashboard for it."
//
// The page (frontend/src/pages/AccessDashboardPage.tsx) reads everything it
// shows from here, except two things it already has: which documents each
// module holds (the plant's catalogue, which the browser holds whole, grouped
// by the same departmentOfDocument the server scopes records by) and the
// change of a person's modules, which goes through the existing
// POST /api/users/:id/departments (backend/index.ts), so there is still one
// way to change who sees what, and it is logged there.
//
//   GET /api/access/overview[?opened=1]   every account, with today's first
//                                         sign-in, last sign-out and whether
//                                         they are signed in now; today's
//                                         refused and failed sign-ins; the
//                                         plant's working hours and where
//                                         today stands (backend/workingHours.ts,
//                                         on engine/workingHoursCore.ts — the
//                                         gate's own answer, not a guess)
//   GET /api/access/history               sign-ins and sign-outs paired into
//                                         sessions, and the refused and failed
//                                         ones, over a span of days:
//                                         ?from=&to=&person=&kind=&limit=&offset=
//   GET /api/access/history.csv           the same rows as a CSV file
//
// WHERE IT COMES FROM. The activity log (REQUIREMENTS §62) and its archive
// (§75) — the four lines the server writes at the door: "Signed in",
// "Signed out" (with "At the close of working hours" when the browser signed
// the person out at the close, §84 C4), "Sign-in failed" (wrong password, or
// no such account) and "Sign-in refused" (the reason in the detail). Nothing
// new is stored and nothing is written but the two lines below.
//
// "SIGNED IN NOW" RESTS ON THE LOG, and says so. A session is a signed cookie;
// the server keeps no list of them and no record of requests, only of the
// requests that write a line (opening a document or a record, saving,
// submitting, printing, downloading ...). So a person is "signed in now" when
// they signed in today, have not signed out since, and have a line in the log
// from the last 30 minutes. Signed in but with nothing in the log for longer
// is "quiet for N minutes": reading one page for a long while looks the same
// as a browser closed without signing out, and the page says exactly that.
// Once the working day has closed (§84 C3), nobody but the super admin has a
// session left, whatever the log last said: "day-closed".
//
// ONE PERSON'S DAY. A session is paired within the plant's day it began: a
// "Signed out" closes that person's latest sign-in of the same day that is
// still open (two browsers at once pair as they happened). A day's sessions
// end with the day (§84 C3), so a sign-in with no sign-out is "no sign-out
// that day" — or, today, "no sign-out yet" — never a session running for days.
// One exception, the super admin's LATE SIGN-IN (§84 addendum): his sign-in in
// a day's last ten minutes runs to the midnight after, so it is a session of
// the next day too — after midnight he is still "signed in now" in it, and a
// sign-out the next day closes it. The browser's own sign-out at the end of the
// day (midnight) closes a session that ends with that day, never this one
// (review of 8-Oct-2026).
//
// SUPER ADMIN ONLY, WHATEVER THE SCREEN SHOWS: every route answers 403 to any
// other account, after the same sign-in check as every other route
// (requireAuth: signed in, on a password of their own, and — for everybody but
// the super admin — within the working hours). Opening the page and each CSV
// taken away are lines in the activity log.
//
// HOW LONG IT TAKES. Today's figures read only today's lines (the log's index
// on `at`). A span reads the four actions over those days, in the log and in
// its archive (each through its own index on `at`, or on the person and `at`
// when one person is asked for): a week of a busy plant is a few thousand
// lines to read and a few hundred rows to pair. At most MAX_LINES lines are
// read for one span, newest first; the page says so when a span holds more.

type LogActivity = (req: Request, who: PublicUser | null, action: string, target?: string, detail?: string, department?: string) => void;

/** Where the routes read. The server's own pool by default; a unit test hands in a stand-in. */
export interface AccessDatabase {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface AccessDeps {
  requireAuth: RequestHandler;
  logActivity: LogActivity;
  /** The database to read. The server's own by default. */
  database?: () => AccessDatabase;
  /** The clock, in milliseconds. Date.now by default; a test sets its own. */
  clock?: () => number;
  /** The plant's time zone. PLANT_TIMEZONE (db.ts) by default. */
  timeZone?: () => string;
  /** The working hours and where today stands: the server's own gate (backend/workingHours.ts) by default. */
  hours?: () => Promise<PublicHours | null>;
}

// ---------------------------------------------------------------------------
// the four lines, as the server writes them (backend/index.ts)

export const SIGNED_IN = "Signed in";
export const SIGNED_OUT = "Signed out";
export const SIGN_IN_FAILED = "Sign-in failed";
export const SIGN_IN_REFUSED = "Sign-in refused";
/** The detail of the "Signed out" line the browser writes at the close of the working hours (§84 C4). */
export const CLOSE_OF_HOURS: string = SIGN_OUT_WORDS[END_OF_HOURS_REASON];
/** The detail of the "Signed out" line the browser writes at the super admin's own end of the day, the factory's midnight. */
export const END_OF_DAY: string = SIGN_OUT_WORDS[END_OF_DAY_REASON];

const SESSION_ACTIONS = [SIGNED_IN, SIGNED_OUT];
const ATTEMPT_ACTIONS = [SIGN_IN_FAILED, SIGN_IN_REFUSED];

/** How recent a line must be for its author to count as "signed in now". */
export const ACTIVE_MINUTES = 30;
/** The most lines one span reads. */
export const MAX_LINES = 50_000;
/** The most rows in one CSV file. */
export const MAX_CSV_ROWS = 20_000;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
/** The span shown first: the last seven days, today included. */
export const DEFAULT_SPAN_DAYS = 7;

// ---------------------------------------------------------------------------
// days and times, on the plant's clock

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A real calendar day, YYYY-MM-DD, or null. */
export function calendarDay(value: unknown): string | null {
  if (typeof value !== "string" || !DAY_RE.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? value : null;
}

/** The day `days` after (or before) a day. */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The plant's day a moment falls on, YYYY-MM-DD. */
export function plantDayOf(ms: number, zone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/** 2026-09-30 -> 30-Sep-2026, the way the app writes a date. */
export function displayDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${String(d).padStart(2, "0")}-${MONTHS[m - 1]}-${y}`;
}

/**
 * Whether a sign-in at `at` is the super admin's late sign-in: in the last LATE_SIGN_IN_MS before the factory's
 * midnight, so that its session runs to the midnight after (engine/workingHoursCore.ts sessionEndsAt, the same rule).
 */
export function lateSignIn(at: string, zone: string): boolean {
  const t = Date.parse(at);
  return Number.isFinite(t) && nextMidnight(new Date(t), zone).getTime() - t <= LATE_SIGN_IN_MS;
}

/** A moment's time of day on the plant's clock, "09:02:11". */
function clockFormatter(zone: string): (iso: string | null) => string {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  return (iso) => (iso ? f.format(new Date(iso)) : "");
}

/** A value PostgreSQL handed back as a moment (a Date from pg, text from a stand-in), as ISO; null for none. */
function isoOf(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const text = (value: unknown): string => (typeof value === "string" ? value : value === null || value === undefined ? "" : String(value));
const count = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

// ---------------------------------------------------------------------------
// today: each person's first sign-in, last sign-out, and "now"

/** One person's day so far, from today's lines. */
export interface TodayFigures {
  firstSignIn: string | null;
  lastSignIn: string | null;
  lastSignOut: string | null;
  /** The last sign-out was the browser's own, at the close of the working hours. */
  lastSignOutAtClose: boolean;
  signIns: number;
  signOuts: number;
  failed: number;
  refused: number;
  /** Their latest line of anything but a failed or refused sign-in (which anybody could cause by typing their address). */
  lastSeen: string | null;
  /**
   * The super admin's sign-in in yesterday's last ten minutes, not signed out since: his late sign-in, whose session
   * runs to tonight's midnight, so he is still signed in today in it (§84 addendum). Null for everybody else.
   */
  carriedSignIn: string | null;
}

export const NO_DAY: TodayFigures = {
  firstSignIn: null,
  lastSignIn: null,
  lastSignOut: null,
  lastSignOutAtClose: false,
  signIns: 0,
  signOuts: 0,
  failed: 0,
  refused: 0,
  lastSeen: null,
  carriedSignIn: null,
};

/**
 * signed-in   signed in today (or in the super admin's session carried from yesterday's last ten minutes), not
 *             signed out since, a line in the last 30 minutes
 * quiet       signed in today, not signed out since, but nothing in the log for longer
 * signed-out  signed out since their last sign-in today
 * not-today   no sign-in today
 * switched-off the account is switched off: whatever it had open stopped at its next request
 * day-closed  signed in today and never signed out, but the working day has closed and
 *             with it every session but the super admin's (§84 C3): `sessionOver`
 */
export type NowState = "signed-in" | "quiet" | "signed-out" | "not-today" | "switched-off" | "day-closed";

export function nowState(day: TodayFigures, active: boolean, nowMs: number, windowMinutes = ACTIVE_MINUTES, sessionOver = false): { state: NowState; quietMinutes: number | null } {
  if (!active) return { state: "switched-off", quietMinutes: null };
  // Today's last sign-in; failing that, the super admin's late sign-in of yesterday that is still open.
  const lastIn = day.lastSignIn ?? day.carriedSignIn ?? null;
  if (!lastIn) return { state: "not-today", quietMinutes: null };
  const signedIn = Date.parse(lastIn);
  if (day.lastSignOut && Date.parse(day.lastSignOut) >= signedIn) return { state: "signed-out", quietMinutes: null };
  if (sessionOver) return { state: "day-closed", quietMinutes: null };
  const seen = Math.max(signedIn, day.lastSeen ? Date.parse(day.lastSeen) : 0);
  const quiet = Math.max(0, nowMs - seen);
  if (quiet <= windowMinutes * 60_000) return { state: "signed-in", quietMinutes: null };
  return { state: "quiet", quietMinutes: Math.floor(quiet / 60_000) };
}

/** Today's figures from one row of the query below, with the super admin's late sign-in carried from yesterday. */
export function todayFrom(row: Record<string, unknown> | undefined, carriedSignIn: string | null = null): TodayFigures {
  if (!row) return { ...NO_DAY, carriedSignIn };
  return {
    firstSignIn: isoOf(row.first_in),
    lastSignIn: isoOf(row.last_in),
    lastSignOut: isoOf(row.last_out),
    lastSignOutAtClose: text(row.last_out_detail) === CLOSE_OF_HOURS,
    signIns: count(row.sign_ins),
    signOuts: count(row.sign_outs),
    failed: count(row.failed),
    refused: count(row.refused),
    lastSeen: isoOf(row.last_seen),
    carriedSignIn,
  };
}

/**
 * The late sign-ins of yesterday's last ten minutes still open, from the rows of LATE_SQL: user id → when. A sign-in
 * is still open when no sign-out came after it there — leaving out a sign-out at the end of the day (midnight), which
 * is another session's own end. Only the super admin's are carried (the route asks only for them): nobody else's
 * session runs past midnight.
 */
export function carriedSignIns(rows: readonly Record<string, unknown>[]): Map<string, string> {
  const carried = new Map<string, string>();
  for (const r of rows) {
    const signedIn = isoOf(r.late_in);
    if (!signedIn || r.user_id === null || r.user_id === undefined) continue;
    const signedOut = isoOf(r.late_out);
    if (signedOut && Date.parse(signedOut) >= Date.parse(signedIn)) continue;
    carried.set(text(r.user_id), signedIn);
  }
  return carried;
}

// ---------------------------------------------------------------------------
// a span: the lines paired into sessions

/** One of the four lines, as read. `day` is the plant's day it was written on. */
export interface SignLine {
  id: string;
  at: string;
  day: string;
  userId: string | null;
  userName: string;
  userEmail: string;
  action: string;
  target: string;
  detail: string;
  archived: boolean;
}

/**
 * signed-out      a "Signed out" line closed it
 * close-of-hours  the browser signed them out at the close of the working hours
 * not-signed-out  a day now over, with no sign-out for it
 * open            today, with no sign-out yet
 */
export type SessionEnd = "signed-out" | "close-of-hours" | "not-signed-out" | "open";

/** session: a sign-in and what ended it; sign-out-alone: a sign-out with no sign-in that day; failed / refused: a sign-in that did not get in. */
export type HistoryKind = "session" | "sign-out-alone" | "failed" | "refused";

export interface HistoryRow {
  kind: HistoryKind;
  day: string;
  userId: string | null;
  /** The account's name; "" for an address with no account. */
  userName: string;
  /** The account's sign-in address, or the address typed for one that has none. */
  userEmail: string;
  /** The sign-in (or the attempt, or the lone sign-out). */
  at: string;
  signedOutAt: string | null;
  ended: SessionEnd | null;
  /** Whole minutes from signing in to signing out; null while there is no sign-out. */
  minutes: number | null;
  detail: string;
  /** Read from the log's archive (§75). */
  archived: boolean;
}

/** A line's id is a bigint as text: compared by length, then by its digits. */
const compareIds = (a: string, b: string): number => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
const compareLines = (a: { at: string; id: string }, b: { at: string; id: string }): number =>
  a.at < b.at ? -1 : a.at > b.at ? 1 : compareIds(a.id, b.id);

/**
 * THE LINES AS SESSIONS, newest first. Walked oldest first: a sign-in opens a
 * session for that person; a sign-out closes the latest-begun one still open
 * that it can end — one begun that day (a day's session ends with its day), or
 * a sign-in of the day before whose session runs on into this one
 * (`carriesOver`: the super admin's late sign-in, §84 addendum) — so two
 * browsers at once pair as they happened. A sign-out at the end of the day
 * (midnight) is a browser's own at its session's end, so it closes a session
 * that ends with that day, never one carried past it. A failed or refused
 * sign-in is a row of its own. What is still open at the end is "no sign-out
 * yet" while its last day is today, and "no sign-out that day" once it is over.
 */
export function pairSignIns(lines: readonly SignLine[], today: string, carriesOver?: (line: SignLine) => boolean): HistoryRow[] {
  const ordered = [...lines].sort(compareLines);
  // Each person's sessions still open, in the order they began, with the last day each can be closed on.
  const open = new Map<string, { row: HistoryRow; lastDay: string }[]>();
  const rows: HistoryRow[] = [];
  for (const l of ordered) {
    const base = { day: l.day, userId: l.userId, userName: l.userName, userEmail: l.userEmail || l.target, at: l.at, detail: l.detail, archived: l.archived };
    if (l.action === SIGNED_IN && l.userId) {
      const row: HistoryRow = { ...base, kind: "session", signedOutAt: null, ended: null, minutes: null, detail: "" };
      rows.push(row);
      const mine = open.get(l.userId);
      const entry = { row, lastDay: carriesOver?.(l) ? addDays(l.day, 1) : l.day };
      if (mine) mine.push(entry);
      else open.set(l.userId, [entry]);
    } else if (l.action === SIGNED_OUT && l.userId) {
      const mine = open.get(l.userId) ?? [];
      const endOfDay = l.detail === END_OF_DAY;
      // Newest first, and no further back than the day before: nothing older can still be open on this day.
      const dayBefore = addDays(l.day, -1);
      let found = -1;
      for (let i = mine.length - 1; i >= 0 && mine[i].row.day >= dayBefore; i--) {
        const s = mine[i];
        if (s.row.day <= l.day && l.day <= s.lastDay && (!endOfDay || s.lastDay === l.day)) {
          found = i;
          break;
        }
      }
      const row = found >= 0 ? mine.splice(found, 1)[0].row : undefined;
      if (row) {
        row.signedOutAt = l.at;
        row.ended = l.detail === CLOSE_OF_HOURS ? "close-of-hours" : "signed-out";
        row.minutes = Math.max(0, Math.round((Date.parse(l.at) - Date.parse(row.at)) / 60_000));
        row.archived = row.archived || l.archived;
      } else {
        rows.push({ ...base, kind: "sign-out-alone", signedOutAt: l.at, ended: l.detail === CLOSE_OF_HOURS ? "close-of-hours" : "signed-out", minutes: null });
      }
    } else if (l.action === SIGN_IN_FAILED || l.action === SIGN_IN_REFUSED) {
      rows.push({ ...base, kind: l.action === SIGN_IN_FAILED ? "failed" : "refused", signedOutAt: null, ended: null, minutes: null });
    }
  }
  for (const mine of open.values()) for (const { row, lastDay } of mine) row.ended = lastDay >= today ? "open" : "not-signed-out";
  // Newest first. Rows were made oldest first, so for two at the same moment
  // the later-made one comes first as well.
  return rows
    .map((row, n) => ({ row, n }))
    .sort((a, b) => (a.row.at < b.row.at ? 1 : a.row.at > b.row.at ? -1 : b.n - a.n))
    .map((x) => x.row);
}

/** A row read from the database, as a SignLine. */
export function signLineFrom(row: Record<string, unknown>): SignLine | null {
  const at = isoOf(row.at);
  const day = calendarDay(text(row.day));
  if (!at || !day) return null;
  return {
    id: text(row.id),
    at,
    day,
    userId: row.user_id === null || row.user_id === undefined ? null : text(row.user_id),
    userName: text(row.user_name),
    userEmail: text(row.user_email),
    action: text(row.action),
    target: text(row.target),
    detail: text(row.detail),
    archived: row.archived === true || row.archived === "t" || row.archived === "true",
  };
}

// ---------------------------------------------------------------------------
// what a span asks for

export type HistoryWhich = "all" | "sessions" | "attempts";

export interface HistoryQuery {
  from: string;
  to: string;
  person: string | null;
  which: HistoryWhich;
  limit: number;
  offset: number;
}

/** The request's span, person, kind and page — or what is wrong with it, in words. */
export function readHistoryQuery(query: Record<string, unknown>, today: string): HistoryQuery | { error: string } {
  const fromRaw = query.from;
  const toRaw = query.to;
  const to = toRaw === undefined || toRaw === "" ? today : calendarDay(toRaw);
  if (!to) return { error: "The last day must be a date, YYYY-MM-DD." };
  const from = fromRaw === undefined || fromRaw === "" ? addDays(to, -(DEFAULT_SPAN_DAYS - 1)) : calendarDay(fromRaw);
  if (!from) return { error: "The first day must be a date, YYYY-MM-DD." };
  if (from > to) return { error: "The first day is after the last." };
  const personRaw = query.person;
  let person: string | null = null;
  if (personRaw !== undefined && personRaw !== "") {
    if (typeof personRaw !== "string" || personRaw.length > 64 || !/^[A-Za-z0-9_-]+$/.test(personRaw)) return { error: "No such account." };
    person = personRaw;
  }
  const kindRaw = query.kind === undefined || query.kind === "" ? "all" : query.kind;
  if (kindRaw !== "all" && kindRaw !== "sessions" && kindRaw !== "attempts") return { error: "Show all, sessions or attempts." };
  const whole = (value: unknown, fallback: number, min: number, max: number): number | null => {
    if (value === undefined || value === "") return fallback;
    if (typeof value !== "string" || !/^\d{1,9}$/.test(value)) return null;
    const n = Number(value);
    return n < min || n > max ? null : n;
  };
  const limit = whole(query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  if (limit === null) return { error: `limit must be a whole number from 1 to ${MAX_LIMIT}.` };
  const offset = whole(query.offset, 0, 0, MAX_LINES);
  if (offset === null) return { error: `offset must be a whole number up to ${MAX_LINES.toLocaleString("en-IN")}.` };
  return { from, to, person, which: kindRaw, limit, offset };
}

// ---------------------------------------------------------------------------
// the CSV file

const WHAT: Record<HistoryKind, string> = {
  session: "Signed in",
  "sign-out-alone": "Signed out, with no sign-in that day",
  failed: "Sign-in failed",
  refused: "Sign-in refused",
};

export const ENDED_WORDS: Record<SessionEnd, string> = {
  "signed-out": "Signed out",
  "close-of-hours": "Signed out at the close of working hours",
  "not-signed-out": "No sign-out that day",
  open: "No sign-out yet",
};

export const CSV_HEADINGS = ["Day", "Time", "Person", "Sign-in address", "What", "Signed out at", "How it ended", "Minutes signed in", "Detail", "Archived"];

/** The rows as a CSV file, times on the plant's clock; the app's own writer (Excel's formula guard, a byte-order mark). */
export async function historyCsv(rows: readonly HistoryRow[], zone: string): Promise<string> {
  const clock = clockFormatter(zone);
  return csvText(
    CSV_HEADINGS.map((label) => ({ name: label, label, comment: null })),
    rows.map((r) => [
      displayDay(r.day),
      clock(r.at),
      r.userName || "No such account",
      r.userEmail,
      WHAT[r.kind],
      clock(r.signedOutAt),
      r.ended ? ENDED_WORDS[r.ended] : "",
      r.minutes === null ? "" : String(r.minutes),
      r.detail,
      r.archived ? "Yes" : "",
    ])
  );
}

/** A file name with nothing in it a browser or a disk could stumble on. */
const fileName = (words: string): string => `${words.replace(/[^A-Za-z0-9 ._-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "sign-ins"}.csv`;

// ---------------------------------------------------------------------------
// the accounts

export interface AccessPerson {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
  /** Their modules: department codes; empty = every module (§84 C5). */
  departments: string[];
  active: boolean;
  mustChangePassword: boolean;
  lastSignIn: string | null;
  createdAt: string;
  today: TodayFigures;
  now: NowState;
  quietMinutes: number | null;
}

export interface AttemptLine {
  id: string;
  at: string;
  action: string;
  userId: string | null;
  userName: string;
  /** The address typed. */
  address: string;
  detail: string;
}

const splitCodes = (value: unknown): string[] =>
  text(value)
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

/** The super admin first, then everybody switched on, then the rest; by name within each. */
function byStanding(a: AccessPerson, b: AccessPerson): number {
  const rank = (p: AccessPerson) => (p.role === "admin" ? 0 : p.active ? 1 : 2);
  // "Operator 2" before "Operator 10".
  return rank(a) - rank(b) || a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" });
}

// ---------------------------------------------------------------------------
// the routes

// A marker at the head of each statement, so a stand-in database (the unit
// test) can tell them apart; PostgreSQL reads it as a comment.
const USERS_SQL = `/* access:users */
SELECT id, name, email, role, departments, active, must_change_password, last_sign_in, created_at FROM users ORDER BY created_at`;

// THE SUPER ADMIN'S LATE SIGN-IN of yesterday's last LATE_SIGN_IN_MS (§84 addendum): each person's latest sign-in
// there, and latest sign-out but for one at the end of the day (midnight), another session's own end. Ten minutes of
// the log, through its index on `at`. $2 is the span, '600 seconds'.
const LATE_SQL = `/* access:late */
SELECT user_id,
       max(at) FILTER (WHERE action = $3) AS late_in,
       max(at) FILTER (WHERE action = $4 AND detail IS DISTINCT FROM $5) AS late_out
  FROM activity_log
 WHERE at >= ($1::date - $2::interval) AND at < $1::date AND action IN ($3, $4) AND user_id IS NOT NULL
 GROUP BY user_id`;

const TODAY_SQL = `/* access:today */
SELECT user_id,
       min(at) FILTER (WHERE action = $3) AS first_in,
       max(at) FILTER (WHERE action = $3) AS last_in,
       max(at) FILTER (WHERE action = $4) AS last_out,
       (array_agg(detail ORDER BY at DESC, id DESC) FILTER (WHERE action = $4))[1] AS last_out_detail,
       count(*) FILTER (WHERE action = $3) AS sign_ins,
       count(*) FILTER (WHERE action = $4) AS sign_outs,
       count(*) FILTER (WHERE action = $5) AS failed,
       count(*) FILTER (WHERE action = $6) AS refused,
       max(at) FILTER (WHERE action <> $5 AND action <> $6) AS last_seen
  FROM activity_log
 WHERE at >= $1::date AND at < ($2::date + 1) AND user_id IS NOT NULL
 GROUP BY user_id`;

// ORDERED BY THE TABLE'S id, not the text of the same name in the SELECT list:
// a bare `ORDER BY id` sorts that text, and "64" came before "524461" (found on
// a long log; db.ts listActivity says the same of the log's own list).
export const ATTEMPTS_SQL = `/* access:attempts */
SELECT id::text AS id, at, user_id, user_name, user_email, action, target, detail
  FROM activity_log
 WHERE at >= $1::date AND at < ($1::date + 1) AND action = ANY($2::text[])
 ORDER BY activity_log.id DESC LIMIT 100`;

/** The lines of a span, the log's and its archive's, newest first; at most $n. */
function historySql(withPerson: boolean): string {
  const cond = `action = ANY($1::text[]) AND at >= $2::date AND at < ($3::date + 1)${withPerson ? " AND user_id = $5" : ""}`;
  return `/* access:history */
SELECT line.id::text AS id, line.at, to_char(line.at, 'YYYY-MM-DD') AS day, line.user_id, line.user_name, line.user_email, line.action, line.target, line.detail, line.archived
  FROM ((SELECT id, at, user_id, user_name, user_email, action, target, detail, false AS archived FROM activity_log WHERE ${cond})
        UNION ALL
        (SELECT id, at, user_id, user_name, user_email, action, target, detail, true AS archived FROM activity_log_archive WHERE ${cond})) AS line
 ORDER BY line.at DESC, line.id DESC
 LIMIT $4`;
}

const serverDatabase = (): AccessDatabase => ({
  query: (sql, values) => database().query(sql, values as unknown[]) as unknown as Promise<{ rows: Record<string, unknown>[] }>,
});

export function registerAccessRoutes(app: Express, deps: AccessDeps): void {
  const { requireAuth, logActivity } = deps;
  const db = deps.database ?? serverDatabase;
  const clock = deps.clock ?? Date.now;
  const zone = deps.timeZone ?? plantTimeZone;
  const hours =
    deps.hours ??
    (() => {
      const gate = createWorkingHoursGate();
      return () => gate.publicAnswer();
    })();

  /** The super admin, or null having answered 403. */
  const superAdmin = (req: Request, res: Response): PublicUser | null => {
    const user = (req as Request & { user?: PublicUser }).user;
    if (!user || user.role !== "admin") {
      res.status(403).json({ error: "Only the super admin can see who may use which module, and when each person signed in and out.", code: "super-admin-only" });
      return null;
    }
    return user;
  };

  /** A span's rows, paired, with whether the span held more lines than one reading takes. */
  const readSpan = async (q: HistoryQuery, today: string): Promise<{ rows: HistoryRow[]; truncated: boolean }> => {
    const actions = q.which === "sessions" ? SESSION_ACTIONS : q.which === "attempts" ? ATTEMPT_ACTIONS : [...SESSION_ACTIONS, ...ATTEMPT_ACTIONS];
    const values: unknown[] = [actions, q.from, q.to, MAX_LINES + 1];
    if (q.person) values.push(q.person);
    const [{ rows }, accounts] = await Promise.all([db().query(historySql(!!q.person), values), db().query(USERS_SQL)]);
    const truncated = rows.length > MAX_LINES;
    const lines = (truncated ? rows.slice(0, MAX_LINES) : rows).map(signLineFrom).filter((l): l is SignLine => l !== null);
    // The super admin's late sign-ins run on into the next day (§84 addendum); nobody else's session passes midnight.
    const admins = new Set(accounts.rows.filter((u) => u.role === "admin").map((u) => text(u.id)));
    const tz = zone();
    return { rows: pairSignIns(lines, today, (l) => !!l.userId && admins.has(l.userId) && lateSignIn(l.at, tz)), truncated };
  };

  app.get("/api/access/overview", requireAuth, async (req: Request, res: Response): Promise<void> => {
    const me = superAdmin(req, res);
    if (!me) return;
    const nowMs = clock();
    const tz = zone();
    const today = plantDayOf(nowMs, tz);
    const [users, days, late, attempts, plant] = await Promise.all([
      db().query(USERS_SQL),
      db().query(TODAY_SQL, [today, today, SIGNED_IN, SIGNED_OUT, SIGN_IN_FAILED, SIGN_IN_REFUSED]),
      db().query(LATE_SQL, [today, `${LATE_SIGN_IN_MS / 1000} seconds`, SIGNED_IN, SIGNED_OUT, END_OF_DAY]),
      db().query(ATTEMPTS_SQL, [today, ATTEMPT_ACTIONS]),
      // The hours are an extra: the accounts are still shown if they cannot be read.
      hours().catch((err: unknown) => {
        console.warn("[user access] the working hours could not be read:", err instanceof Error ? err.message : err);
        return null;
      }),
    ]);
    // Closed for the day (or not yet open), with the hours held: nobody but the super admin has a session (§84 C3).
    const dayClosed = !!plant && plant.enforced && !plant.openNow;
    const dayOf = new Map(days.rows.map((r) => [text(r.user_id), r] as const));
    const carried = carriedSignIns(late.rows);
    const people: AccessPerson[] = users.rows
      .map((u) => {
        const id = text(u.id);
        const active = u.active !== false && u.active !== "f";
        const day = todayFrom(dayOf.get(id), u.role === "admin" ? (carried.get(id) ?? null) : null);
        const now = nowState(day, active, nowMs, ACTIVE_MINUTES, dayClosed && u.role !== "admin");
        return {
          id,
          name: text(u.name),
          email: text(u.email),
          role: u.role === "admin" ? ("admin" as const) : ("staff" as const),
          departments: splitCodes(u.departments),
          active,
          mustChangePassword: u.must_change_password === true || u.must_change_password === "t",
          lastSignIn: isoOf(u.last_sign_in),
          createdAt: text(u.created_at),
          today: day,
          now: now.state,
          quietMinutes: now.quietMinutes,
        };
      })
      .sort(byStanding);
    const lines: AttemptLine[] = attempts.rows.map((r) => ({
      id: text(r.id),
      at: isoOf(r.at) ?? "",
      action: text(r.action),
      userId: r.user_id === null || r.user_id === undefined ? null : text(r.user_id),
      userName: text(r.user_name),
      address: text(r.target) || text(r.user_email),
      detail: text(r.detail),
    }));
    // Opening the page is a line; a refresh of it is not.
    if (req.query.opened === "1") logActivity(req, me, "User access opened", "", "Who may use which module, and every sign-in and sign-out");
    res.set("Cache-Control", "no-store");
    res.json({ today, now: new Date(nowMs).toISOString(), timeZone: tz, activeMinutes: ACTIVE_MINUTES, hours: plant, people, attempts: lines });
  });

  app.get("/api/access/history", requireAuth, async (req: Request, res: Response): Promise<void> => {
    if (!superAdmin(req, res)) return;
    const today = plantDayOf(clock(), zone());
    const q = readHistoryQuery(req.query as Record<string, unknown>, today);
    if ("error" in q) {
      res.status(400).json({ error: q.error });
      return;
    }
    const { rows, truncated } = await readSpan(q, today);
    const page = rows.slice(q.offset, q.offset + q.limit);
    res.set("Cache-Control", "no-store");
    res.json({
      from: q.from,
      to: q.to,
      person: q.person,
      kind: q.which,
      today,
      timeZone: zone(),
      total: rows.length,
      offset: q.offset,
      limit: q.limit,
      more: q.offset + page.length < rows.length,
      truncated,
      maxLines: MAX_LINES,
      rows: page,
    });
  });

  app.get("/api/access/history.csv", requireAuth, async (req: Request, res: Response): Promise<void> => {
    const me = superAdmin(req, res);
    if (!me) return;
    const tz = zone();
    const today = plantDayOf(clock(), tz);
    const q = readHistoryQuery(req.query as Record<string, unknown>, today);
    if ("error" in q) {
      res.status(400).json({ error: q.error });
      return;
    }
    const { rows } = await readSpan(q, today);
    const shown = rows.slice(0, MAX_CSV_ROWS);
    let who = "Everybody";
    if (q.person) {
      const found = (await db().query(USERS_SQL)).rows.find((u) => text(u.id) === q.person);
      who = found ? text(found.name) : q.person;
    }
    const span = q.from === q.to ? displayDay(q.from) : `${displayDay(q.from)} to ${displayDay(q.to)}`;
    const what = q.which === "sessions" ? "sign-ins and sign-outs" : q.which === "attempts" ? "refused and failed sign-ins" : "sign-ins, sign-outs, refused and failed";
    const n = `${shown.length.toLocaleString("en-IN")} row${shown.length === 1 ? "" : "s"} as CSV${rows.length > shown.length ? `, the newest ${MAX_CSV_ROWS.toLocaleString("en-IN")} of ${rows.length.toLocaleString("en-IN")}` : ""}`;
    logActivity(req, me, "User access exported", who, `${n} · ${what} · ${span}`);
    const body = await historyCsv(shown, tz);
    res
      .status(200)
      .set({
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName(`sign-ins ${q.from} to ${q.to}${q.person ? ` ${who}` : ""}`)}"`,
        "Cache-Control": "no-store",
      })
      .send(body);
  });
}
