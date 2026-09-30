// THE SUPER ADMIN'S USER ACCESS DASHBOARD (REQUIREMENTS §84), backend/accessRoutes.ts,
// run on a real Express server over a stand-in for the database — no PostgreSQL.
// What needs no database is proved here:
//   * the door: not signed in is refused, anybody but the super admin gets 403
//     on every route and the database is never asked;
//   * today's figures: first sign-in, last sign-out (and whether it was the
//     browser's own at the close of working hours), the counts, and "signed in
//     now" — signed in today, not signed out since, a line in the last 30
//     minutes; otherwise "quiet", "signed out", "not today" or "switched off";
//   * the pairing of sign-ins with sign-outs: within the plant's day, the
//     latest open sign-in closed first, a day with no sign-out, today's "no
//     sign-out yet", a lone sign-out, the refused and failed rows, the archive;
//   * the span's query read and refused in words, the paging, a span longer
//     than one reading takes;
//   * the CSV: headings, times on the factory's clock, Excel's formula guard,
//     the byte-order mark, and its line in the activity log;
//   * the working hours and today's state, the gate's own answer, handed on as
//     it is; once the working day has closed, nobody but the super admin is
//     "signed in now"; the page still answers when the hours cannot be read.
// The same routes are driven end to end by tests/e2e_user_access.py.
// Run: npm run test:unit -- accessRoutes
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import express, { type NextFunction, type Request, type Response } from "express";
import type { PublicUser } from "../auth.ts";
import { plantNow, publicHours, type PublicHours } from "../../frontend/src/engine/workingHoursCore.ts";
import {
  ACTIVE_MINUTES,
  ATTEMPTS_SQL,
  CLOSE_OF_HOURS,
  CSV_HEADINGS,
  MAX_LINES,
  NO_DAY,
  SIGNED_IN,
  SIGNED_OUT,
  SIGN_IN_FAILED,
  SIGN_IN_REFUSED,
  addDays,
  calendarDay,
  displayDay,
  nowState,
  pairSignIns,
  plantDayOf,
  readHistoryQuery,
  registerAccessRoutes,
  type AccessDatabase,
  type HistoryRow,
  type SignLine,
} from "../accessRoutes.ts";

const ZONE = "Asia/Kolkata";
/** 14:00 at the factory on Wednesday 30 September 2026. */
const NOW = Date.parse("2026-09-30T08:30:00Z");
const TODAY = "2026-09-30";

/** A factory time on a day, as ISO (India is UTC+05:30 all year). */
const at = (day: string, hhmmss: string): string => new Date(`${day}T${hhmmss.length === 5 ? `${hhmmss}:00` : hhmmss}+05:30`).toISOString();

// ---------------------------------------------------------------------------
// the stand-in database

interface StoredLine {
  id: number;
  at: string;
  day: string;
  user_id: string | null;
  user_name: string;
  user_email: string;
  action: string;
  target: string;
  detail: string;
  archived: boolean;
}

interface StoredUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
  departments: string;
  active: boolean;
  must_change_password: boolean;
  last_sign_in: string | null;
  created_at: string;
}

class FakeDb implements AccessDatabase {
  users: StoredUser[] = [];
  lines: StoredLine[] = [];
  calls: { text: string; values: unknown[] }[] = [];
  private nextId = 1;

  user(u: Partial<StoredUser> & Pick<StoredUser, "id" | "name" | "email">): void {
    this.users.push({ role: "staff", departments: "", active: true, must_change_password: false, last_sign_in: null, created_at: `2026-09-0${this.users.length + 1}T00:00:00.000Z`, ...u });
  }

  line(day: string, time: string, who: StoredUser | null, action: string, detail = "", extra: Partial<StoredLine> = {}): void {
    this.lines.push({
      id: this.nextId++,
      at: at(day, time),
      day,
      user_id: who?.id ?? null,
      user_name: who?.name ?? "",
      user_email: who?.email ?? "",
      action,
      target: who?.email ?? "",
      detail,
      archived: false,
      ...extra,
    });
  }

  byEmail(email: string): StoredUser {
    const u = this.users.find((x) => x.email === email);
    assert.ok(u, email);
    return u;
  }

  async query(text: string, values: unknown[] = []): Promise<{ rows: Record<string, unknown>[] }> {
    this.calls.push({ text, values });
    if (text.includes("/* access:users */")) return { rows: this.users.map((u) => ({ ...u })) };
    if (text.includes("/* access:today */")) {
      const [from, to, inA, outA, failA, refA] = values as string[];
      const byUser = new Map<string, StoredLine[]>();
      for (const l of this.lines) {
        if (l.archived || !l.user_id || l.day < from || l.day > to) continue;
        byUser.set(l.user_id, [...(byUser.get(l.user_id) ?? []), l]);
      }
      const rows = [...byUser.entries()].map(([user_id, ls]) => {
        const of = (a: string) => ls.filter((l) => l.action === a).sort((x, y) => (x.at < y.at ? -1 : 1));
        const seen = ls.filter((l) => l.action !== failA && l.action !== refA).sort((x, y) => (x.at < y.at ? -1 : 1));
        const ins = of(inA);
        const outs = of(outA);
        return {
          user_id,
          first_in: ins[0]?.at ?? null,
          last_in: ins.at(-1)?.at ?? null,
          last_out: outs.at(-1)?.at ?? null,
          last_out_detail: outs.at(-1)?.detail ?? null,
          // pg hands a count back as text
          sign_ins: String(ins.length),
          sign_outs: String(outs.length),
          failed: String(of(failA).length),
          refused: String(of(refA).length),
          last_seen: seen.at(-1)?.at ?? null,
        };
      });
      return { rows };
    }
    if (text.includes("/* access:attempts */")) {
      const [day, actions] = values as [string, string[]];
      const rows = this.lines
        .filter((l) => !l.archived && l.day === day && actions.includes(l.action))
        .sort((a, b) => b.id - a.id)
        .slice(0, 100)
        .map((l) => ({ ...l, id: String(l.id) }));
      return { rows };
    }
    if (text.includes("/* access:history */")) {
      const [actions, from, to, limit, person] = values as [string[], string, string, number, string | undefined];
      assert.equal(text.includes("user_id = $5"), person !== undefined, "the person is a parameter when, and only when, one is asked for");
      const rows = this.lines
        .filter((l) => actions.includes(l.action) && l.day >= from && l.day <= to && (person === undefined || l.user_id === person))
        .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.id - a.id))
        .slice(0, limit)
        // pg hands a timestamptz back as a Date
        .map((l) => ({ ...l, id: String(l.id), at: new Date(l.at) }));
      return { rows };
    }
    throw new Error(`a query the stand-in does not know: ${text.slice(0, 80)}`);
  }
}

/** The plant's accounts, and a day of their comings and goings. */
function plant(): FakeDb {
  const db = new FakeDb();
  db.user({ id: "u-admin", name: "Super Admin", email: "admin@gpp.local", role: "admin" });
  db.user({ id: "u-kapila", name: "Kapila Barad", email: "kapila.barad@gpp.local", departments: "QC" });
  db.user({ id: "u-vinay", name: "Vinay Bhojak", email: "vinay.bhojak@gpp.local", departments: "HR" });
  db.user({ id: "u-sandeep", name: "Sandeep Parekh", email: "sandeep.parekh@gpp.local", departments: "HR" });
  db.user({ id: "u-meena", name: "Meena Joshi", email: "meena.joshi@gpp.local", departments: "QC,PRD", active: false });
  const [admin, kapila, vinay, sandeep, meena] = db.users;

  // An archived day, long ago.
  db.line("2025-01-10", "09:00", kapila, SIGNED_IN, "", { archived: true });
  db.line("2025-01-10", "17:00", kapila, SIGNED_OUT, "", { archived: true });
  // Yesterday: Kapila never signed out; Vinay was signed out by his browser at the close.
  db.line("2026-09-29", "09:00", kapila, SIGNED_IN);
  db.line("2026-09-29", "09:05", vinay, SIGNED_IN);
  db.line("2026-09-29", "18:20", vinay, SIGNED_OUT, CLOSE_OF_HOURS);
  // Today.
  db.line(TODAY, "08:40", admin, SIGNED_IN);
  db.line(TODAY, "08:45", vinay, SIGNED_IN);
  db.line(TODAY, "09:00", vinay, "Document opened");
  db.line(TODAY, "09:02:11", kapila, SIGNED_IN);
  db.line(TODAY, "10:00", sandeep, SIGN_IN_FAILED, "Wrong password");
  db.line(TODAY, "10:05", null, SIGN_IN_FAILED, "No such account", { target: "nobody@gpp.local" });
  db.line(TODAY, "11:00", meena, SIGN_IN_REFUSED, "The account is switched off");
  db.line(TODAY, "13:10", kapila, SIGNED_OUT);
  db.line(TODAY, "13:40", kapila, SIGNED_IN);
  db.line(TODAY, "13:50", kapila, "Record opened");
  db.line(TODAY, "13:55", admin, "User access opened");
  return db;
}

// ---------------------------------------------------------------------------
// the server

const ADMIN: PublicUser = { id: "u-admin", name: "Super Admin", email: "admin@gpp.local", role: "admin", departments: [] };
const STAFF: PublicUser = { id: "u-kapila", name: "Kapila Barad", email: "kapila.barad@gpp.local", role: "staff", departments: ["QC"] };
const EVERY_STAFF: PublicUser = { id: "u-qa", name: "QA Manager", email: "qa@gpp.local", role: "staff", departments: [] };

// The server's own requireAuth reads the session; this one reads a test header.
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const who = req.get("x-test-user");
  const user = who === "admin" ? ADMIN : who === "staff" ? STAFF : who === "every" ? EVERY_STAFF : null;
  if (!user) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }
  (req as Request & { user: PublicUser }).user = user;
  next();
}

interface Logged {
  who: string | undefined;
  action: string;
  target: string;
  detail: string;
}

let db: FakeDb;
const logged: Logged[] = [];
/** What the server's gate says about the hours; null = it failed. */
let hoursNow: () => Promise<PublicHours | null> = async () => null;
/** The gate's answer at a moment, on the plain calendar (Thursday off, 08:40 to 18:20). */
const gateAt = (iso: string, enforced: boolean): PublicHours => publicHours(plantNow(null, new Date(iso), ZONE), enforced);
let base = "";
let close: () => Promise<void> = async () => undefined;

before(async () => {
  const app = express();
  registerAccessRoutes(app, {
    requireAuth,
    logActivity: (_req, who, action, target = "", detail = "") => logged.push({ who: who?.email, action, target, detail }),
    database: () => db,
    clock: () => NOW,
    timeZone: () => ZONE,
    hours: () => hoursNow(),
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise<void>((resolve) => server.close(() => resolve()));
});
after(async () => {
  await close();
});

function fresh(): FakeDb {
  db = plant();
  logged.length = 0;
  hoursNow = async () => gateAt(new Date(NOW).toISOString(), true);
  return db;
}

async function get(route: string, who: string | null = "admin"): Promise<{ status: number; json: any; text: string; headers: Headers }> {
  const res = await fetch(base + route, { headers: who ? { "x-test-user": who } : {} });
  // Decoded by hand: fetch's text() drops a byte-order mark, and the CSV's is checked.
  const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await res.arrayBuffer());
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text, headers: res.headers };
}

const ROUTES = ["/api/access/overview", "/api/access/overview?opened=1", "/api/access/history", "/api/access/history?from=2026-09-01&to=2026-09-30", "/api/access/history.csv"];

// ---------------------------------------------------------------------------

describe("the door", () => {
  it("refuses anybody not signed in, and the database is never asked", async () => {
    fresh();
    for (const route of ROUTES) assert.equal((await get(route, null)).status, 401, route);
    assert.equal(db.calls.length, 0);
  });

  it("answers 403 to any account but the super admin's — a department's, and one with every module alike", async () => {
    fresh();
    for (const who of ["staff", "every"]) {
      for (const route of ROUTES) {
        const res = await get(route, who);
        assert.equal(res.status, 403, `${who} ${route}`);
        assert.equal(res.json.code, "super-admin-only");
        assert.match(res.json.error, /super admin/);
      }
    }
    assert.equal(db.calls.length, 0, "the database is never asked for somebody who may not see it");
    assert.equal(logged.length, 0, "and nothing is logged as opened or exported");
  });

  it("serves the CSV at its own address, not as a person called 'history.csv'", async () => {
    fresh();
    const res = await get("/api/access/history.csv");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /^text\/csv/);
  });
});

describe("today", () => {
  it("lists every account, the super admin first, then everybody switched on, then the rest", async () => {
    fresh();
    const res = await get("/api/access/overview");
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.json.people.map((p: { name: string }) => p.name),
      ["Super Admin", "Kapila Barad", "Sandeep Parekh", "Vinay Bhojak", "Meena Joshi"]
    );
    assert.equal(res.json.today, TODAY);
    assert.equal(res.json.timeZone, ZONE);
    assert.equal(res.json.activeMinutes, ACTIVE_MINUTES);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const meena = res.json.people.find((p: { name: string }) => p.name === "Meena Joshi");
    assert.deepEqual(meena.departments, ["QC", "PRD"], "the modules, as codes");
    assert.equal(meena.active, false);
    assert.ok(!("password_hash" in meena), "nothing of anybody's password");
    assert.ok(!res.text.includes("password_hash"));
  });

  it("gives each person's first sign-in, last sign-out and the counts of the day", async () => {
    fresh();
    const res = await get("/api/access/overview");
    const kapila = res.json.people.find((p: { email: string }) => p.email === "kapila.barad@gpp.local");
    assert.equal(kapila.today.firstSignIn, at(TODAY, "09:02:11"));
    assert.equal(kapila.today.lastSignIn, at(TODAY, "13:40"));
    assert.equal(kapila.today.lastSignOut, at(TODAY, "13:10"));
    assert.equal(kapila.today.signIns, 2);
    assert.equal(kapila.today.signOuts, 1);
    assert.equal(kapila.today.lastSeen, at(TODAY, "13:50"));
    const sandeep = res.json.people.find((p: { email: string }) => p.email === "sandeep.parekh@gpp.local");
    assert.equal(sandeep.today.failed, 1);
    assert.equal(sandeep.today.lastSeen, null, "a failed sign-in is not the person being seen — anybody can type their address");
    assert.equal(sandeep.today.firstSignIn, null);
  });

  it("says who is signed in now, and what that rests on", async () => {
    fresh();
    const res = await get("/api/access/overview");
    const now = Object.fromEntries(res.json.people.map((p: { name: string; now: string; quietMinutes: number | null }) => [p.name, [p.now, p.quietMinutes]]));
    assert.deepEqual(now["Kapila Barad"], ["signed-in", null], "signed in again after signing out, a line ten minutes ago");
    assert.deepEqual(now["Super Admin"], ["signed-in", null]);
    assert.deepEqual(now["Vinay Bhojak"], ["quiet", 300], "signed in, nothing in the log for five hours");
    assert.deepEqual(now["Sandeep Parekh"], ["not-today", null], "a failed sign-in is no sign-in");
    assert.deepEqual(now["Meena Joshi"], ["switched-off", null]);
  });

  it("lists today's refused and failed sign-ins, newest first, an address with no account included", async () => {
    fresh();
    const res = await get("/api/access/overview");
    assert.deepEqual(
      res.json.attempts.map((a: { action: string; address: string; userName: string; detail: string }) => [a.action, a.address, a.userName, a.detail]),
      [
        [SIGN_IN_REFUSED, "meena.joshi@gpp.local", "Meena Joshi", "The account is switched off"],
        [SIGN_IN_FAILED, "nobody@gpp.local", "", "No such account"],
        [SIGN_IN_FAILED, "sandeep.parekh@gpp.local", "Sandeep Parekh", "Wrong password"],
      ]
    );
  });

  it("orders the attempts by the log's own id, not by the text it is handed out as", () => {
    // `id::text AS id` then a bare `ORDER BY id` sorts the text: "64" before "524461".
    // The stand-in cannot run SQL, so the statement itself is held to it.
    assert.match(ATTEMPTS_SQL, /ORDER BY activity_log\.id DESC/);
    assert.doesNotMatch(ATTEMPTS_SQL, /ORDER BY id\b/);
  });

  it("sorts names as a person reads them: Operator 2 before Operator 10", async () => {
    fresh();
    db.user({ id: "u-op10", name: "Operator 10", email: "op10@gpp.local", departments: "PRD" });
    db.user({ id: "u-op2", name: "Operator 2", email: "op2@gpp.local", departments: "PRD" });
    const names = (await get("/api/access/overview")).json.people.map((p: { name: string }) => p.name);
    assert.ok(names.indexOf("Operator 2") < names.indexOf("Operator 10"), names.join(", "));
  });

  it("logs the page's opening, and not a refresh of it", async () => {
    fresh();
    await get("/api/access/overview?opened=1");
    await get("/api/access/overview");
    assert.deepEqual(
      logged.map((l) => [l.who, l.action]),
      [["admin@gpp.local", "User access opened"]]
    );
  });

  it("reads today on the factory's clock: 00:10 in India is still the day before in London", () => {
    assert.equal(plantDayOf(Date.parse("2026-09-29T18:40:00Z"), ZONE), "2026-09-30");
    assert.equal(plantDayOf(Date.parse("2026-09-29T18:40:00Z"), "Europe/London"), "2026-09-29");
  });
});

describe("the working hours", () => {
  it("hands on the gate's own answer: the hours and where today stands, in words", async () => {
    fresh();
    const res = await get("/api/access/overview");
    assert.equal(res.json.hours.hoursText, "DCRS is open 8:40 am to 6:20 pm on working days.");
    assert.equal(res.json.hours.todayText, "Today is a working day — open now, until 6:20 pm.");
    assert.equal(res.json.hours.phase, "open");
    assert.equal(res.json.hours.enforced, true);
  });

  it("once the working day has closed, nobody but the super admin is signed in — whatever the log last said", async () => {
    fresh();
    // 18:25 at the factory: five minutes after the close, Kapila's last line was at 18:10.
    hoursNow = async () => gateAt("2026-09-30T12:55:00Z", true);
    db.line(TODAY, "18:10", db.byEmail("kapila.barad@gpp.local"), "Record opened");
    db.line(TODAY, "18:10", db.byEmail("admin@gpp.local"), "Record opened");
    const res = await get("/api/access/overview");
    const now = Object.fromEntries(res.json.people.map((p: { name: string; now: string }) => [p.name, p.now]));
    assert.equal(res.json.hours.phase, "after-closing");
    assert.equal(now["Kapila Barad"], "day-closed");
    assert.equal(now["Vinay Bhojak"], "day-closed");
    assert.equal(now["Super Admin"], "signed-in", "the super admin is never held to the hours");
    assert.equal(now["Sandeep Parekh"], "not-today");
    assert.equal(now["Meena Joshi"], "switched-off");
  });

  it("leaves 'now' to the log on a server that holds nobody to the hours", async () => {
    fresh();
    hoursNow = async () => gateAt("2026-09-30T12:55:00Z", false);
    const res = await get("/api/access/overview");
    assert.equal(res.json.hours.enforced, false);
    assert.notEqual(res.json.people.find((p: { name: string }) => p.name === "Kapila Barad").now, "day-closed");
  });

  it("still shows the accounts when the hours cannot be read, and says nothing about them rather than guess", async () => {
    fresh();
    hoursNow = async () => {
      throw new Error("the master data is unreadable");
    };
    const res = await get("/api/access/overview");
    assert.equal(res.status, 200);
    assert.equal(res.json.hours, null);
    assert.equal(res.json.people.length, 5);
  });

  it("knows a Thursday for the weekly off", () => {
    const thursday = gateAt("2026-10-01T06:00:00Z", true);
    assert.equal(thursday.phase, "closed-day");
    assert.match(thursday.todayText, /Thursday, the weekly off/);
  });
});

describe("signed in now", () => {
  const signedIn = at(TODAY, "09:00");
  const day = (over: Partial<typeof NO_DAY>) => ({ ...NO_DAY, lastSignIn: signedIn, firstSignIn: signedIn, signIns: 1, ...over });
  const nowAt = (hhmm: string) => Date.parse(at(TODAY, hhmm));

  it("is signed in today, not signed out since, and a line in the last 30 minutes", () => {
    assert.equal(nowState(day({ lastSeen: at(TODAY, "10:00") }), true, nowAt("10:30")).state, "signed-in", "exactly 30 minutes");
    assert.deepEqual(nowState(day({ lastSeen: at(TODAY, "10:00") }), true, nowAt("10:31")), { state: "quiet", quietMinutes: 31 });
  });

  it("counts the sign-in itself as being seen", () => {
    assert.equal(nowState(day({}), true, nowAt("09:20")).state, "signed-in");
    assert.deepEqual(nowState(day({ lastSeen: at(TODAY, "08:00") }), true, nowAt("09:45")), { state: "quiet", quietMinutes: 45 });
  });

  it("is signed out once a sign-out follows the last sign-in, and signed in again after a new one", () => {
    assert.equal(nowState(day({ lastSignOut: at(TODAY, "12:00"), lastSeen: at(TODAY, "12:00") }), true, nowAt("12:05")).state, "signed-out");
    assert.equal(nowState(day({ lastSignIn: at(TODAY, "12:30"), lastSignOut: at(TODAY, "12:00") }), true, nowAt("12:35")).state, "signed-in");
  });

  it("is not today without a sign-in today, and switched off whatever the log says", () => {
    assert.equal(nowState({ ...NO_DAY }, true, nowAt("12:00")).state, "not-today");
    assert.equal(nowState(day({ lastSeen: at(TODAY, "11:59") }), false, nowAt("12:00")).state, "switched-off");
  });

  it("is over with the working day for a session never signed out, and still 'signed out' for one that was", () => {
    assert.equal(nowState(day({ lastSeen: at(TODAY, "18:15") }), true, nowAt("18:25"), ACTIVE_MINUTES, true).state, "day-closed");
    assert.equal(nowState(day({ lastSignOut: at(TODAY, "18:20") }), true, nowAt("18:25"), ACTIVE_MINUTES, true).state, "signed-out");
    assert.equal(nowState({ ...NO_DAY }, true, nowAt("18:25"), ACTIVE_MINUTES, true).state, "not-today");
  });
});

describe("pairing sign-ins with sign-outs", () => {
  let id = 0;
  const L = (day: string, time: string, userId: string | null, action: string, detail = "", archived = false): SignLine => ({
    id: String(++id),
    at: at(day, time),
    day,
    userId,
    userName: userId ? userId.toUpperCase() : "",
    userEmail: userId ? `${userId}@gpp.local` : "",
    action,
    target: userId ? `${userId}@gpp.local` : "typed@gpp.local",
    detail,
    archived,
  });
  const brief = (rows: HistoryRow[]) => rows.map((r) => [r.kind, r.userId, r.day, r.at.slice(11, 16), r.signedOutAt?.slice(11, 16) ?? null, r.ended, r.minutes]);

  it("pairs a sign-in with the sign-out after it, and gives the minutes between", () => {
    const rows = pairSignIns([L(TODAY, "09:00", "k", SIGNED_IN), L(TODAY, "17:30", "k", SIGNED_OUT)], TODAY);
    assert.deepEqual(brief(rows), [["session", "k", TODAY, "03:30", "12:00", "signed-out", 510]]);
  });

  it("knows the browser's own sign-out at the close of working hours", () => {
    const rows = pairSignIns([L("2026-09-29", "09:00", "v", SIGNED_IN), L("2026-09-29", "18:20", "v", SIGNED_OUT, CLOSE_OF_HOURS)], TODAY);
    assert.equal(rows[0].ended, "close-of-hours");
    assert.equal(rows[0].minutes, 560);
  });

  it("leaves a past day's sign-in with no sign-out as 'no sign-out that day', and today's as 'no sign-out yet'", () => {
    const rows = pairSignIns([L("2026-09-29", "09:00", "k", SIGNED_IN), L(TODAY, "09:00", "k", SIGNED_IN)], TODAY);
    assert.deepEqual(
      rows.map((r) => [r.day, r.ended, r.signedOutAt, r.minutes]),
      [
        [TODAY, "open", null, null],
        ["2026-09-29", "not-signed-out", null, null],
      ]
    );
  });

  it("never pairs across days: a session ends with its day", () => {
    const rows = pairSignIns([L("2026-09-29", "17:00", "k", SIGNED_IN), L(TODAY, "09:00", "k", SIGNED_OUT)], TODAY);
    assert.deepEqual(
      rows.map((r) => [r.kind, r.day, r.ended]),
      [
        ["sign-out-alone", TODAY, "signed-out"],
        ["session", "2026-09-29", "not-signed-out"],
      ]
    );
  });

  it("pairs two browsers at once as they happened: a sign-out closes the latest sign-in still open", () => {
    const rows = pairSignIns(
      [L(TODAY, "09:00", "k", SIGNED_IN), L(TODAY, "10:00", "k", SIGNED_IN), L(TODAY, "11:00", "k", SIGNED_OUT), L(TODAY, "17:00", "k", SIGNED_OUT)],
      TODAY
    );
    assert.deepEqual(
      rows.map((r) => [r.at.slice(11, 16), r.signedOutAt?.slice(11, 16)]),
      [
        ["04:30", "05:30"],
        ["03:30", "11:30"],
      ]
    );
  });

  it("keeps each person's sessions their own", () => {
    const rows = pairSignIns([L(TODAY, "09:00", "a", SIGNED_IN), L(TODAY, "09:05", "b", SIGNED_IN), L(TODAY, "12:00", "a", SIGNED_OUT)], TODAY);
    assert.deepEqual(
      rows.map((r) => [r.userId, r.ended]),
      [
        ["b", "open"],
        ["a", "signed-out"],
      ]
    );
  });

  it("gives each refused and failed sign-in a row of its own, with the address typed where there is no account", () => {
    const rows = pairSignIns(
      [L(TODAY, "09:00", "s", SIGN_IN_FAILED, "Wrong password"), L(TODAY, "09:01", null, SIGN_IN_FAILED, "No such account"), L(TODAY, "09:02", "m", SIGN_IN_REFUSED, "The account is switched off")],
      TODAY
    );
    assert.deepEqual(
      rows.map((r) => [r.kind, r.userName, r.userEmail, r.detail]),
      [
        ["refused", "M", "m@gpp.local", "The account is switched off"],
        ["failed", "", "typed@gpp.local", "No such account"],
        ["failed", "S", "s@gpp.local", "Wrong password"],
      ]
    );
  });

  it("marks a session read from the archive, and pairs lines however they arrive", () => {
    const lines = [L("2025-01-10", "17:00", "k", SIGNED_OUT, "", true), L("2025-01-10", "09:00", "k", SIGNED_IN, "", true)];
    const rows = pairSignIns(lines, TODAY);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].archived, true);
    assert.equal(rows[0].ended, "signed-out");
  });
});

describe("a span", () => {
  it("reads the last seven days by default, and refuses what is not a span, in words", () => {
    assert.deepEqual(readHistoryQuery({}, TODAY), { from: "2026-09-24", to: TODAY, person: null, which: "all", limit: 100, offset: 0 });
    assert.deepEqual(readHistoryQuery({ to: "2026-03-01" }, TODAY), { from: "2026-02-23", to: "2026-03-01", person: null, which: "all", limit: 100, offset: 0 });
    for (const [query, words] of [
      [{ from: "2026-02-30" }, /first day/],
      [{ to: "30-09-2026" }, /last day/],
      [{ from: "2026-10-01", to: "2026-09-30" }, /after the last/],
      [{ kind: "everything" }, /sessions or attempts/],
      [{ person: "x'; drop table users;--" }, /No such account/],
      [{ limit: "0" }, /limit/],
      [{ limit: "501" }, /limit/],
      [{ offset: "-1" }, /offset/],
      [{ from: ["2026-09-01", "2026-09-02"] }, /first day/],
    ] as [Record<string, unknown>, RegExp][]) {
      const read = readHistoryQuery(query, TODAY);
      assert.ok("error" in read, JSON.stringify(query));
      assert.match((read as { error: string }).error, words);
    }
  });

  it("knows a real day from one that is not", () => {
    assert.equal(calendarDay("2028-02-29"), "2028-02-29");
    assert.equal(calendarDay("2026-02-29"), null);
    assert.equal(calendarDay("2026-13-01"), null);
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
    assert.equal(displayDay("2026-09-03"), "03-Sep-2026");
  });

  it("pairs the span's lines, the archive's included, newest first", async () => {
    fresh();
    const res = await get("/api/access/history?from=2025-01-01&to=2026-09-30");
    assert.equal(res.status, 200);
    const rows = res.json.rows as HistoryRow[];
    assert.deepEqual(
      rows.map((r) => [r.kind, r.userName, r.day, r.ended]),
      [
        ["session", "Kapila Barad", TODAY, "open"],
        ["refused", "Meena Joshi", TODAY, null],
        ["failed", "", TODAY, null],
        ["failed", "Sandeep Parekh", TODAY, null],
        ["session", "Kapila Barad", TODAY, "signed-out"],
        ["session", "Vinay Bhojak", TODAY, "open"],
        ["session", "Super Admin", TODAY, "open"],
        ["session", "Vinay Bhojak", "2026-09-29", "close-of-hours"],
        ["session", "Kapila Barad", "2026-09-29", "not-signed-out"],
        ["session", "Kapila Barad", "2025-01-10", "signed-out"],
      ]
    );
    assert.equal(rows.at(-1)!.archived, true);
    assert.equal(res.json.total, 10);
    assert.equal(res.json.more, false);
    assert.equal(res.json.truncated, false);
    // Only the four lines of the door are asked for; "Record opened" is never read here.
    const asked = db.calls.find((c) => c.text.includes("access:history"))!;
    assert.deepEqual(asked.values[0], [SIGNED_IN, SIGNED_OUT, SIGN_IN_FAILED, SIGN_IN_REFUSED]);
  });

  it("reads one person's, or only the sessions, or only the refused and failed", async () => {
    fresh();
    const kapila = await get("/api/access/history?from=2026-09-29&to=2026-09-30&person=u-kapila");
    assert.deepEqual(
      (kapila.json.rows as HistoryRow[]).map((r) => [r.day, r.at, r.signedOutAt, r.ended, r.minutes]),
      [
        [TODAY, at(TODAY, "13:40"), null, "open", null],
        [TODAY, at(TODAY, "09:02:11"), at(TODAY, "13:10"), "signed-out", 248],
        ["2026-09-29", at("2026-09-29", "09:00"), null, "not-signed-out", null],
      ]
    );
    const sessions = await get("/api/access/history?kind=sessions");
    assert.ok((sessions.json.rows as HistoryRow[]).every((r) => r.kind === "session"));
    assert.deepEqual(db.calls.filter((c) => c.text.includes("access:history")).at(-1)!.values[0], [SIGNED_IN, SIGNED_OUT]);
    const attempts = await get("/api/access/history?kind=attempts");
    assert.deepEqual(
      (attempts.json.rows as HistoryRow[]).map((r) => r.kind),
      ["refused", "failed", "failed"]
    );
  });

  it("hands the rows over a page at a time", async () => {
    fresh();
    const first = await get("/api/access/history?from=2025-01-01&limit=4");
    assert.equal(first.json.rows.length, 4);
    assert.equal(first.json.total, 10);
    assert.equal(first.json.more, true);
    const last = await get("/api/access/history?from=2025-01-01&limit=4&offset=8");
    assert.equal(last.json.rows.length, 2);
    assert.equal(last.json.more, false);
    assert.equal(last.json.rows[1].day, "2025-01-10");
    const bad = await get("/api/access/history?from=2026-09-31");
    assert.equal(bad.status, 400);
    assert.match(bad.json.error, /first day/);
  });

  it("says so when a span holds more lines than one reading takes", async () => {
    fresh();
    const kapila = db.byEmail("kapila.barad@gpp.local");
    db.lines = [];
    for (let n = 0; n <= MAX_LINES; n++) db.line("2026-09-01", "09:00", kapila, SIGN_IN_FAILED, "Wrong password");
    const res = await get("/api/access/history?from=2026-09-01&kind=attempts&limit=1");
    assert.equal(res.json.truncated, true);
    assert.equal(res.json.total, MAX_LINES);
  });
});

describe("the CSV file", () => {
  it("holds the span's rows with their times on the factory's clock, and is a line in the log", async () => {
    fresh();
    const res = await get("/api/access/history.csv?from=2026-09-29&to=2026-09-30&person=u-kapila&kind=sessions");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-disposition") ?? "", /attachment; filename="sign-ins 2026-09-29 to 2026-09-30 Kapila Barad\.csv"/);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.text.charCodeAt(0), 0xfeff, "a byte-order mark first, so Excel reads it as UTF-8");
    const lines = res.text.slice(1).split("\n");
    assert.equal(lines[0], CSV_HEADINGS.join(","));
    assert.deepEqual(lines.slice(1), [
      "30-Sep-2026,13:40:00,Kapila Barad,kapila.barad@gpp.local,Signed in,,No sign-out yet,,,",
      "30-Sep-2026,09:02:11,Kapila Barad,kapila.barad@gpp.local,Signed in,13:10:00,Signed out,248,,",
      "29-Sep-2026,09:00:00,Kapila Barad,kapila.barad@gpp.local,Signed in,,No sign-out that day,,,",
    ]);
    assert.deepEqual(logged, [
      { who: "admin@gpp.local", action: "User access exported", target: "Kapila Barad", detail: "3 rows as CSV · sign-ins and sign-outs · 29-Sep-2026 to 30-Sep-2026" },
    ]);
  });

  it("writes the refused and failed, the archived, and the close of working hours in words", async () => {
    fresh();
    const res = await get("/api/access/history.csv?from=2025-01-10&to=2026-09-30");
    const rows = res.text.slice(1).split("\n");
    assert.ok(rows.includes("30-Sep-2026,10:05:00,No such account,nobody@gpp.local,Sign-in failed,,,,No such account,"), rows.join("\n"));
    assert.ok(rows.includes("30-Sep-2026,11:00:00,Meena Joshi,meena.joshi@gpp.local,Sign-in refused,,,,The account is switched off,"));
    assert.ok(rows.includes("29-Sep-2026,09:05:00,Vinay Bhojak,vinay.bhojak@gpp.local,Signed in,18:20:00,Signed out at the close of working hours,555,,"));
    assert.ok(rows.includes("10-Jan-2025,09:00:00,Kapila Barad,kapila.barad@gpp.local,Signed in,17:00:00,Signed out,480,,Yes"));
    assert.equal(logged[0].target, "Everybody");
  });

  it("keeps a cell from running as a formula when the file is opened in Excel", async () => {
    fresh();
    db.line(TODAY, "12:00", null, SIGN_IN_FAILED, "No such account", { target: "=HYPERLINK(\"http://x\")@gpp.local" });
    const res = await get("/api/access/history.csv?kind=attempts");
    assert.ok(res.text.includes(`"'=HYPERLINK(""http://x"")@gpp.local"`), res.text);
  });
});
