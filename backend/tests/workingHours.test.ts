// THE PLANT'S WORKING HOURS, HELD BY THE SERVER (REQUIREMENTS §84) —
// backend/workingHours.ts, backend/auth.ts's day-long session, and the same gate
// on the Audit Assistant's routes (backend/apiV1.ts). The rule itself is
// frontend/src/engine/workingHoursCore.ts, proved day by day in
// frontend/tests/workingHours.test.ts; what is proved here is the server's side,
// always with a clock the test sets and never the real one:
//   * staff are refused outside the hours — the weekly off, a festival, before
//     08:40, at 18:20 — with 403's body: the reason in plain words, the code and
//     the next opening; let in at 08:40 and until 18:19:59; an adjustment
//     Thursday is open;
//   * the super admin is never refused, at any hour of any day;
//   * DCRS_WORKING_HOURS=off switches the gate off: nobody is refused, and a
//     session runs to the factory's midnight for everybody;
//   * a session ends at the close of its day — 18:20 for staff, midnight for the
//     super admin — in its token, which refuses itself afterwards; a token from
//     before the rule (seven days) is refused; the day can only close sooner;
//   * the master data is read again only when it has changed, the seeded
//     calendar stands in when nothing is stored, and an unreadable one falls back
//     to the plain rule;
//   * /api/v1 answers 403 outside-working-hours to staff and not to the super
//     admin, before its password check.
// Run: npm run test:unit -- workingHours
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import cookieParser from "cookie-parser";
import express from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET, signSessionToken, verifySessionToken, type PublicUser } from "../auth.ts";
import { plantTimeZone, type StoredItem, type UserRow, type WriteResult } from "../db.ts";
import { nextMidnight } from "../../frontend/src/engine/workingHoursCore.ts";
import { registerApiV1, type ApiV1Store } from "../apiV1.ts";
import { createWorkingHoursGate, seededCalendar, workingHoursEnforced, type MasterSource } from "../workingHours.ts";

const IST = "Asia/Kolkata";

/** A moment on the factory's clock in India (UTC+5:30). */
function ist(date: string, h: number, m: number, s = 0): Date {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, m, s) - (5 * 60 + 30) * 60 * 1000);
}

/** The plant's calendar as the Master Data page stores it, with only what the rule reads. */
const CALENDAR = {
  weeklyOffDay: 4,
  holidays: [
    { id: "hol-2026-09-04", date: "2026-09-04", name: "Janmashtami" },
    { id: "hol-2026-10-20", date: "2026-10-20", name: "Navratri Navam" },
  ],
  adjustmentDays: [{ id: "adj-2026-10-22", date: "2026-10-22", forHoliday: "Navratri Navam (20-10-2026)" }],
  employees: [{ id: "e1", name: "Somebody", role: "Checker", active: true }],
};

class MemoryMaster implements MasterSource {
  value: string | null;
  seqNow = 1;
  reads = 0;
  constructor(value: unknown) {
    this.value = value === null ? null : typeof value === "string" ? value : JSON.stringify(value);
  }
  set(value: unknown): void {
    this.value = JSON.stringify(value);
    this.seqNow += 1;
  }
  async seq(): Promise<number | null> {
    return this.value === null ? null : this.seqNow;
  }
  async read(): Promise<string | null> {
    this.reads += 1;
    return this.value;
  }
}

const STAFF = { role: "staff" };
const ADMIN = { role: "admin" };

function gateAt(now: Date, master: MasterSource = new MemoryMaster(CALENDAR), enforced = true) {
  let clock = now;
  const gate = createWorkingHoursGate({ source: master, clock: () => clock, enforced, timeZone: () => IST });
  return { gate, setClock: (d: Date) => (clock = d) };
}

// ---------------------------------------------------------------------------

describe("the switch", () => {
  it("holds the plant to its hours unless DCRS_WORKING_HOURS says off", () => {
    assert.equal(workingHoursEnforced({}), true);
    assert.equal(workingHoursEnforced({ DCRS_WORKING_HOURS: "" }), true);
    assert.equal(workingHoursEnforced({ DCRS_WORKING_HOURS: "on" }), true);
    for (const off of ["off", "OFF", " off ", "0", "false", "no"]) assert.equal(workingHoursEnforced({ DCRS_WORKING_HOURS: off }), false, off);
  });
});

describe("the gate, on a clock the test sets", () => {
  it("refuses staff on the weekly off with the reason in plain words, the code and the next opening", async () => {
    const { gate } = gateAt(ist("2026-10-01", 10, 0)); // a Thursday
    const refused = await gate.refusal(STAFF);
    assert.deepEqual(refused, {
      error: "DCRS is open 8:40 am to 6:20 pm on working days. Today is Thursday, the weekly off — it opens again on Friday 2 October at 8:40 am.",
      code: "outside-working-hours",
      opensAt: "2026-10-02T03:10:00.000Z",
    });
  });

  it("lets staff in from 08:40 to 18:19:59 on a working day, and not a second either side", async () => {
    const { gate, setClock } = gateAt(ist("2026-09-30", 8, 39, 59));
    assert.equal((await gate.refusal(STAFF))?.code, "outside-working-hours");
    assert.match((await gate.refusal(STAFF))!.error, /It is not open yet — it opens today at 8:40 am\.$/);
    setClock(ist("2026-09-30", 8, 40));
    assert.equal(await gate.refusal(STAFF), null);
    setClock(ist("2026-09-30", 18, 19, 59));
    assert.equal(await gate.refusal(STAFF), null);
    setClock(ist("2026-09-30", 18, 20));
    const late = await gate.refusal(STAFF);
    assert.equal(late?.error, "DCRS is open 8:40 am to 6:20 pm on working days. Today's working hours ended at 6:20 pm — it opens again on Friday 2 October at 8:40 am.");
    assert.equal(late?.opensAt, "2026-10-02T03:10:00.000Z");
  });

  it("closes on a festival and opens on an adjustment Thursday", async () => {
    const { gate, setClock } = gateAt(ist("2026-09-04", 11, 0));
    assert.match((await gate.refusal(STAFF))!.error, /Today is Janmashtami, a company holiday — it opens again on Saturday 5 September at 8:40 am\./);
    setClock(ist("2026-10-22", 11, 0));
    assert.equal(await gate.refusal(STAFF), null);
    setClock(ist("2026-10-15", 11, 0));
    assert.notEqual(await gate.refusal(STAFF), null);
  });

  it("never refuses the super admin, at any hour of any day", async () => {
    const { gate, setClock } = gateAt(ist("2026-10-01", 10, 0));
    for (const at of [ist("2026-10-01", 10, 0), ist("2026-09-30", 23, 30), ist("2026-09-30", 6, 0), ist("2026-09-04", 12, 0), ist("2026-09-30", 18, 20)]) {
      setClock(at);
      assert.equal(await gate.refusal(ADMIN), null, at.toISOString());
    }
  });

  it("switched off, refuses nobody and ends every session at the factory's midnight", async () => {
    const { gate } = gateAt(ist("2026-10-01", 22, 0), new MemoryMaster(CALENDAR), false);
    assert.equal(gate.enforced, false);
    assert.equal(await gate.refusal(STAFF), null);
    assert.equal((await gate.sessionEnd(STAFF)).toISOString(), "2026-10-01T18:30:00.000Z");
    const answer = await gate.sessionAnswer(STAFF, new Date("2026-10-01T18:30:00.000Z"));
    assert.equal(answer.signOutAtEnd, false);
    assert.equal((await gate.publicAnswer()).enforced, false);
  });

  it("ends staff sessions at 18:20 and the super admin's at midnight, and tells staff the browser signs them out", async () => {
    const { gate, setClock } = gateAt(ist("2026-09-30", 9, 15));
    const staffEnd = await gate.sessionEnd(STAFF);
    assert.equal(staffEnd.toISOString(), "2026-09-30T12:50:00.000Z");
    assert.equal((await gate.sessionEnd(ADMIN)).toISOString(), "2026-09-30T18:30:00.000Z");
    const told = await gate.sessionAnswer(STAFF, staffEnd);
    assert.deepEqual(told, { endsAt: "2026-09-30T12:50:00.000Z", signOutAtEnd: true, now: ist("2026-09-30", 9, 15).toISOString() });
    assert.equal((await gate.sessionAnswer(ADMIN, new Date("2026-09-30T18:30:00.000Z"))).signOutAtEnd, false);
    // Staff outside the hours get no session: its end is now.
    setClock(ist("2026-10-01", 10, 0));
    assert.equal((await gate.sessionEnd(STAFF)).getTime(), ist("2026-10-01", 10, 0).getTime());
  });

  it("closes the day sooner when the super admin moves END earlier, never later than the session's own end", async () => {
    const master = new MemoryMaster(CALENDAR);
    const { gate } = gateAt(ist("2026-09-30", 11, 0), master);
    const tokenEnd = await gate.sessionEnd(STAFF); // 18:20
    master.set({ ...CALENDAR, workingHours: { start: "08:40", end: "17:00" } });
    assert.equal((await gate.sessionAnswer(STAFF, tokenEnd)).endsAt, ist("2026-09-30", 17, 0).toISOString());
    master.set({ ...CALENDAR, workingHours: { start: "08:40", end: "20:00" } });
    assert.equal((await gate.sessionAnswer(STAFF, tokenEnd)).endsAt, tokenEnd.toISOString());
  });

  it("follows the hours in the master data, and reads it again only when it has changed", async () => {
    const master = new MemoryMaster({ ...CALENDAR, workingHours: { start: "09:00", end: "17:30" } });
    const { gate, setClock } = gateAt(ist("2026-09-30", 8, 50), master);
    assert.notEqual(await gate.refusal(STAFF), null);
    setClock(ist("2026-09-30", 9, 0));
    assert.equal(await gate.refusal(STAFF), null);
    setClock(ist("2026-09-30", 17, 45));
    assert.match((await gate.refusal(STAFF))!.error, /^DCRS is open 9:00 am to 5:30 pm on working days\. Today's working hours ended at 5:30 pm/);
    assert.equal(master.reads, 1, "read once while it has not changed");
    master.set({ ...CALENDAR, workingHours: { start: "08:40", end: "18:20" } });
    assert.equal(await gate.refusal(STAFF), null);
    assert.equal(master.reads, 2);
    const answer = await gate.publicAnswer();
    assert.equal(answer.start, "08:40");
    assert.equal(answer.end, "18:20");
    assert.equal(answer.hoursText, "DCRS is open 8:40 am to 6:20 pm on working days.");
    assert.equal(master.reads, 2);
  });

  it("with nothing stored yet, stands on the seeded 2026 calendar — adjustment days and festivals included", async () => {
    const seeded = await seededCalendar();
    assert.ok(seeded, "the seeded calendar loads on the server");
    assert.equal(seeded!.holidays?.length, 13);
    assert.equal(seeded!.adjustmentDays?.length, 5);
    assert.deepEqual(seeded!.workingHours, { start: "08:40", end: "18:20" });
    const nothing = new MemoryMaster(null);
    const { gate, setClock } = gateAt(ist("2026-01-22", 10, 0), nothing); // an adjustment Thursday on the seeded calendar
    assert.equal(await gate.refusal(STAFF), null);
    setClock(ist("2026-08-28", 10, 0)); // Rakshabandhan, a Friday — only the seeded calendar knows it
    assert.match((await gate.refusal(STAFF))!.error, /Today is Rakshabandhan, a company holiday/);
    assert.equal(nothing.reads, 0);
  });

  it("an unreadable master item falls back to the plain rule (Thursday off, 08:40 to 18:20) rather than to no rule", async () => {
    const { gate, setClock } = gateAt(ist("2026-10-01", 10, 0), new MemoryMaster("{not json"));
    assert.notEqual(await gate.refusal(STAFF), null);
    setClock(ist("2026-09-30", 10, 0));
    assert.equal(await gate.refusal(STAFF), null);
  });
});

describe("a day's session in its token (backend/auth.ts)", () => {
  const user: PublicUser = { id: "u-1", name: "Kapila Barad", email: "kapila@test.local", role: "staff", departments: ["QC"] };

  it("carries its end, and the cookie's end is the token's", () => {
    const endsAt = new Date(Date.now() + 60 * 60 * 1000);
    const token = signSessionToken(user, endsAt);
    const read = verifySessionToken(token);
    assert.equal(read?.sub, "u-1");
    assert.equal(read?.endsAt.getTime(), Math.floor(endsAt.getTime() / 1000) * 1000);
  });

  it("refuses itself once its day has closed; read with ignoreExpiration only for the sign-out line", () => {
    const closed = signSessionToken(user, new Date(Date.now() - 60 * 1000));
    assert.equal(verifySessionToken(closed), null);
    assert.equal(verifySessionToken(closed, { ignoreExpiration: true })?.sub, "u-1");
  });

  it("left without an end, runs to the factory's next midnight at the latest", () => {
    const read = verifySessionToken(signSessionToken(user));
    assert.ok(read);
    const hoursLeft = (read!.endsAt.getTime() - Date.now()) / 3_600_000;
    assert.ok(hoursLeft > 0 && hoursLeft <= 24, String(hoursLeft));
    // The factory's midnight (18:30 UTC in India, the default PLANT_TIMEZONE).
    assert.equal(read!.endsAt.getTime(), Math.floor(nextMidnight(new Date(), plantTimeZone()).getTime() / 1000) * 1000);
  });

  it("refuses a token made before sessions ended with their day (they lasted seven days) and one it did not sign", () => {
    const old = jwt.sign({ sub: "u-1", email: user.email, role: "staff" }, JWT_SECRET, { expiresIn: 7 * 24 * 60 * 60 });
    assert.equal(verifySessionToken(old), null);
    assert.equal(verifySessionToken(jwt.sign({ sub: "u-1", v: 2 }, "another secret", { expiresIn: 60 })), null);
    assert.equal(verifySessionToken("not-a-token"), null);
  });
});

// ---------------------------------------------------------------------------
// the same gate on the Audit Assistant's routes

class ApiStore implements ApiV1Store {
  users = new Map<string, UserRow>();
  items = new Map<string, StoredItem>();
  async userById(id: string) {
    return this.users.get(id);
  }
  async itemSeq(scope: string, key: string) {
    return scope === "company" ? (this.items.get(key)?.seq ?? null) : null;
  }
  async readItem(scope: string, key: string) {
    return scope === "company" ? (this.items.get(key) ?? null) : null;
  }
  async writeItem(): Promise<WriteResult> {
    return { ok: false, current: null };
  }
}

function account(id: string, role: "admin" | "staff", extra: Partial<UserRow> = {}): UserRow {
  return { id, name: id, email: `${id}@test.local`, password_hash: "x", role, created_at: "2026-01-01T00:00:00.000Z", departments: "", must_change_password: false, active: true, last_sign_in: null, ...extra };
}

describe("the Audit Assistant's routes keep the same hours (backend/apiV1.ts)", () => {
  let base = "";
  let close: () => Promise<void> = async () => undefined;
  let now = ist("2026-10-01", 10, 0);
  const saved = process.env.DCRS_WORKING_HOURS;
  const store = new ApiStore();
  const rows = { staff: account("u-staff", "staff"), admin: account("u-admin", "admin"), change: account("u-change", "staff", { must_change_password: true }) };
  const token = (row: UserRow) => signSessionToken({ id: row.id, name: row.name, email: row.email, role: row.role, departments: [] });

  before(async () => {
    delete process.env.DCRS_WORKING_HOURS; // the gate reads the switch when the routes are registered
    for (const r of Object.values(rows)) store.users.set(r.id, r);
    store.items.set("master", { key: "master", value: JSON.stringify(CALENDAR), version: 1, seq: 1 });
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    registerApiV1(app, { requireAuth: (_req, _res, next) => next(), logActivity: () => undefined, store, clock: () => now });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => new Promise((resolve) => server.close(() => resolve()));
  });
  after(async () => {
    if (saved === undefined) delete process.env.DCRS_WORKING_HOURS;
    else process.env.DCRS_WORKING_HOURS = saved;
    await close();
  });

  const me = async (row: UserRow) => {
    const res = await fetch(`${base}/api/v1/me`, { headers: { Authorization: `Bearer ${token(row)}` } });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  it("refuses staff on the weekly off with 403 outside-working-hours, the words and the next opening", async () => {
    now = ist("2026-10-01", 10, 0);
    const r = await me(rows.staff);
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "outside-working-hours");
    assert.equal(r.body.opensAt, "2026-10-02T03:10:00.000Z");
    assert.equal(r.body.error, "DCRS is open 8:40 am to 6:20 pm on working days. Today is Thursday, the weekly off — it opens again on Friday 2 October at 8:40 am.");
  });

  it("serves the super admin at the same moment", async () => {
    now = ist("2026-10-01", 10, 0);
    const r = await me(rows.admin);
    assert.equal(r.status, 200);
    assert.equal(r.body.role, "admin");
  });

  it("says outside-working-hours before password-change-required, and the password check still holds within the hours", async () => {
    now = ist("2026-10-01", 10, 0);
    assert.equal((await me(rows.change)).body.code, "outside-working-hours");
    now = ist("2026-09-30", 10, 0);
    assert.equal((await me(rows.change)).body.code, "password-change-required");
    assert.equal((await me(rows.staff)).status, 200);
  });

  it("follows the master data this API reads: an adjustment Thursday is open", async () => {
    now = ist("2026-10-22", 10, 0);
    assert.equal((await me(rows.staff)).status, 200);
    now = ist("2026-10-22", 18, 25);
    assert.equal((await me(rows.staff)).body.code, "outside-working-hours");
  });
});
