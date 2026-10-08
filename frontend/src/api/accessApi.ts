import { api, ApiError } from "./client";
import type { PublicHours } from "../engine/workingHoursCore";

// USER ACCESS (REQUIREMENTS §84) — the super admin's alone: the server answers
// 403 to anybody else (backend/accessRoutes.ts). Who may use which module, and
// when each person signed in and out, read from the activity log and its
// archive. A person's modules are changed through the one route that already
// changes them, POST /api/users/:id/departments (backend/index.ts), which logs it.
// The shapes mirror backend/accessRoutes.ts.

/** One person's day so far, from today's lines of the log. Moments are ISO. */
export interface AccessToday {
  firstSignIn: string | null;
  lastSignIn: string | null;
  lastSignOut: string | null;
  /** The last sign-out was the browser's own, at the close of the working hours. */
  lastSignOutAtClose: boolean;
  signIns: number;
  signOuts: number;
  failed: number;
  refused: number;
  /** Their latest line of anything but a failed or refused sign-in. */
  lastSeen: string | null;
  /**
   * The super admin's sign-in in yesterday's last ten minutes, not signed out since: a late sign-in, whose session runs
   * to tonight's midnight, so he is still signed in today in it. Null for everybody else (and from an older server).
   */
  carriedSignIn?: string | null;
}

/**
 * signed-in: signed in today, not signed out since, a line in the log in the last 30 minutes;
 * quiet: the same, but nothing in the log for longer; signed-out: signed out since their
 * last sign-in today; not-today: no sign-in today; switched-off: the account is off;
 * day-closed: signed in today and never signed out, but the working day has closed and
 * with it every session but the super admin's.
 */
export type AccessNow = "signed-in" | "quiet" | "signed-out" | "not-today" | "switched-off" | "day-closed";

export interface AccessPerson {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
  /** Their modules — department codes; empty = every module. */
  departments: string[];
  active: boolean;
  mustChangePassword: boolean;
  lastSignIn: string | null;
  createdAt: string;
  today: AccessToday;
  now: AccessNow;
  quietMinutes: number | null;
}

/** A refused or failed sign-in today. */
export interface AccessAttempt {
  id: string;
  at: string;
  action: string;
  userId: string | null;
  /** "" when the address typed has no account. */
  userName: string;
  address: string;
  detail: string;
}

export interface AccessOverview {
  /** The plant's today, YYYY-MM-DD. */
  today: string;
  /** The server's clock, ISO. */
  now: string;
  /** The plant's time zone: every time on the page is shown on its clock. */
  timeZone: string;
  /** How recent a line must be for its author to count as signed in now. */
  activeMinutes: number;
  /** The plant's working hours and where today stands, as the server's gate reads them; null when they could not be read. */
  hours: PublicHours | null;
  people: AccessPerson[];
  attempts: AccessAttempt[];
}

export type AccessHistoryKind = "session" | "sign-out-alone" | "failed" | "refused";
export type AccessSessionEnd = "signed-out" | "close-of-hours" | "not-signed-out" | "open";

export interface AccessHistoryRow {
  kind: AccessHistoryKind;
  day: string;
  userId: string | null;
  userName: string;
  userEmail: string;
  /** The sign-in, the attempt, or the lone sign-out. */
  at: string;
  signedOutAt: string | null;
  ended: AccessSessionEnd | null;
  minutes: number | null;
  detail: string;
  archived: boolean;
}

export type AccessHistoryWhich = "all" | "sessions" | "attempts";

export interface AccessHistory {
  from: string;
  to: string;
  person: string | null;
  kind: AccessHistoryWhich;
  today: string;
  timeZone: string;
  total: number;
  offset: number;
  limit: number;
  more: boolean;
  /** The span held more lines than one reading takes (maxLines); only the newest were read. */
  truncated: boolean;
  maxLines: number;
  rows: AccessHistoryRow[];
}

export interface AccessHistoryQuery {
  from: string;
  to: string;
  person?: string;
  kind: AccessHistoryWhich;
}

/** The query string of a span, without the page. */
export function historyQueryString(q: AccessHistoryQuery): string {
  const parts = [`from=${encodeURIComponent(q.from)}`, `to=${encodeURIComponent(q.to)}`, `kind=${q.kind}`];
  if (q.person) parts.push(`person=${encodeURIComponent(q.person)}`);
  return parts.join("&");
}

/** A file the server hands over, with the name it gives it. */
async function fetchFile(path: string, fallbackName: string): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`/api${path}`, { credentials: "include" });
  if (!res.ok) {
    let body: { error?: unknown; code?: unknown } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* not JSON */
    }
    throw new ApiError(typeof body.error === "string" ? body.error : `Request failed (${res.status})`, res.status, typeof body.code === "string" ? body.code : undefined);
  }
  const named = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "");
  return { blob: await res.blob(), filename: named ? named[1] : fallbackName };
}

export const accessApi = {
  /** Every account with today's sign-ins; `opened` on the page's first reading, which the server logs as "User access opened". */
  overview: (opened = false) => api.get<AccessOverview>(`/access/overview${opened ? "?opened=1" : ""}`),
  /** A page of a span's sessions and attempts, newest first. */
  history: (q: AccessHistoryQuery, offset = 0, limit = 100) => api.get<AccessHistory>(`/access/history?${historyQueryString(q)}&offset=${offset}&limit=${limit}`),
  /** The whole span as a CSV file (at most 20,000 rows). The server logs "User access exported". */
  historyCsv: (q: AccessHistoryQuery) => fetchFile(`/access/history.csv?${historyQueryString(q)}`, "sign-ins.csv"),
  /** A person's modules: department codes, or none for every module (backend/index.ts, logged there). */
  setModules: (userId: string, departments: string[]) =>
    api.post<{ user: { id: string; departments: string[] } }>(`/users/${encodeURIComponent(userId)}/departments`, { departments }),
};
