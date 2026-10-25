// A PERSON'S OWN SIGN-IN DAYS OVER HTTP (backend/meRoutes.ts; the daily streak, the owner, 25-Oct-2026), on a real
// Express server over a stand-in for the sessions (the sign-in in front of it is backend/index.ts's requireAuth; here a
// stand-in header names the session's person). What is proved:
//   * nobody signed in is refused 401;
//   * the caller reads their OWN days and nobody else's: the account is the session's, and a `user` or `userId` in the
//     address is never read - a staff account cannot read another's;
//   * the window is at most 200 days: an older `from` is read as the window's first day, a later one as today, no
//     `from` is the whole window; a `from` that is not a real date is refused 400 in words;
//   * the answer is never cached, and a store that cannot be read is 503 in words, never a stack trace;
//   * the streak's rule (frontend/src/engine/streakCore.ts) loads on the server as it is, with no imports to follow.
// With DCRS_SESSIONS_TEST_URL set (a throwaway PostgreSQL), the same days are read from user_sessions itself: the plant's
// day of each sign-in (a sign-in at 23:45 UTC is the next morning in the plant), each day once, only the website's and
// the phone app's sessions, the first sign-in on record, and the index the question is answered from.
// Run: npm run test:unit -- meRoutes
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import express, { type NextFunction, type Request, type Response } from "express";
import type { PublicUser } from "../auth.ts";
import { OWN_SIGN_IN_PLACES, SIGN_IN_DAYS_WINDOW, postgresSignInDays, registerMeRoutes, type SignInDaysSource } from "../meRoutes.ts";
import { judgeStreak, streakSignIns } from "../../frontend/src/engine/streakCore.ts";
import { plantClosedDays } from "../../frontend/src/engine/latenessCore.ts";

const TODAY = "2026-10-26";

const PEOPLE: Record<string, PublicUser> = {
  kapila: { id: "u-kapila", name: "Kapila Barad", email: "kapila.barad@gpp.local", role: "staff", departments: ["HR"] },
  vinay: { id: "u-vinay", name: "Vinay Bhojak", email: "vinay.bhojak@gpp.local", role: "staff", departments: ["HR"] },
};

/** The stand-in sessions: each person's sign-in days, and what the route asked of it. */
const SIGNED_IN: Record<string, string[]> = {
  "u-kapila": ["2026-04-01", "2026-10-09", "2026-10-12", "2026-10-13", "2026-10-26"],
  "u-vinay": ["2026-10-20", "2026-10-21"],
};
const asked: { userId: string; from: string; to: string }[] = [];
let failing = false;
const logged: string[] = [];
const memory: SignInDaysSource = {
  async days(userId, from, to) {
    if (failing) throw new Error("the store is down");
    asked.push({ userId, from, to });
    return (SIGNED_IN[userId] ?? []).filter((d) => d >= from && d <= to);
  },
  async firstDay(userId) {
    if (failing) throw new Error("the store is down");
    return [...(SIGNED_IN[userId] ?? [])].sort()[0] ?? null;
  },
};

let base = "";
let close: () => Promise<void>;

before(async () => {
  const app = express();
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const user = PEOPLE[String(req.get("x-test-person") ?? "")];
    if (!user) return void res.status(401).json({ error: "Not authenticated." });
    (req as Request & { user: PublicUser }).user = user;
    next();
  };
  registerMeRoutes(app, { requireAuth, source: memory, today: () => TODAY, log: (line) => logged.push(line) });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise<void>((resolve) => server.close(() => resolve()));
});
after(() => close());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
async function get(route: string, person: string | null): Promise<{ status: number; body: Body; cache: string | null }> {
  const res = await fetch(base + route, { headers: person ? { "x-test-person": person } : {} });
  return { status: res.status, body: await res.json(), cache: res.headers.get("cache-control") };
}

describe("GET /api/me/sign-in-days", () => {
  it("refuses anybody not signed in", async () => {
    const r = await get("/api/me/sign-in-days?from=2026-10-01", null);
    assert.equal(r.status, 401);
  });

  it("answers the caller's own days from `from` to today, the first sign-in on record, and is never cached", async () => {
    asked.length = 0;
    const r = await get("/api/me/sign-in-days?from=2026-10-10", "kapila");
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { days: ["2026-10-12", "2026-10-13", "2026-10-26"], firstDay: "2026-04-01", from: "2026-10-10", to: TODAY });
    assert.equal(r.cache, "no-store");
    assert.deepEqual(asked, [{ userId: "u-kapila", from: "2026-10-10", to: TODAY }]);
  });

  it("is the session's own account only: a user or userId in the address is never read, so a staff account cannot read another's", async () => {
    asked.length = 0;
    for (const q of ["userId=u-vinay", "user=u-vinay", "id=u-vinay", "userId=u-vinay&user=vinay"]) {
      const r = await get(`/api/me/sign-in-days?from=2026-10-01&${q}`, "kapila");
      assert.equal(r.status, 200, q);
      assert.deepEqual(r.body.days, ["2026-10-09", "2026-10-12", "2026-10-13", "2026-10-26"], `${q}: Kapila's own days`);
      assert.ok(!r.body.days.includes("2026-10-20"), `${q}: never Vinay's`);
    }
    assert.ok(asked.every((a) => a.userId === "u-kapila"), "the store is only ever asked for the caller");
    const vinay = await get("/api/me/sign-in-days?from=2026-10-01&userId=u-kapila", "vinay");
    assert.deepEqual(vinay.body.days, ["2026-10-20", "2026-10-21"]);
    assert.equal(vinay.body.firstDay, "2026-10-20");
  });

  it(`holds the window to ${SIGN_IN_DAYS_WINDOW} days: an older from is the window's first day, a later one today, none the whole window`, async () => {
    const earliest = "2026-04-09"; // 200 days before 26-Oct-2026
    const old = await get("/api/me/sign-in-days?from=2025-01-01", "kapila");
    assert.equal(old.body.from, earliest);
    assert.ok(!old.body.days.includes("2026-04-01"), "a sign-in older than the window is not listed");
    assert.equal(old.body.firstDay, "2026-04-01", "...though the first one on record is still said");
    const none = await get("/api/me/sign-in-days", "kapila");
    assert.equal(none.status, 200);
    assert.equal(none.body.from, earliest);
    const later = await get("/api/me/sign-in-days?from=2027-01-01", "kapila");
    assert.equal(later.body.from, TODAY);
    assert.deepEqual(later.body.days, [TODAY]);
  });

  it("refuses a from that is not a real date written YYYY-MM-DD, in words", async () => {
    for (const from of ["yesterday", "2026-1-5", "26-10-26", "2026-02-30", "2026-13-01", ""]) {
      const r = await get(`/api/me/sign-in-days?from=${encodeURIComponent(from)}`, "kapila");
      assert.equal(r.status, 400, from);
      assert.equal(r.body.code, "bad-request");
      assert.match(r.body.error, /YYYY-MM-DD/);
    }
    const twice = await get("/api/me/sign-in-days?from=2026-10-01&from=2026-10-02", "kapila");
    assert.equal(twice.status, 400, "one from, not two");
  });

  it("says in words when the sessions cannot be read, and gives no stack", async () => {
    failing = true;
    try {
      const r = await get("/api/me/sign-in-days?from=2026-10-01", "kapila");
      assert.equal(r.status, 503);
      assert.deepEqual(r.body, { error: "The sign-in days could not be read just now.", code: "unavailable" });
      assert.deepEqual(logged, ["[sign-in days] the store is down"], "the failure is said once on the server, not to the browser");
    } finally {
      failing = false;
    }
  });

  it("counts only the person's own sign-ins: the website and the phone app, never another program signing in for them", () => {
    assert.deepEqual([...OWN_SIGN_IN_PLACES].sort(), ["phone-app", "website"]);
  });
});

describe("the streak's rule on the server", () => {
  it("loads as it is (no imports to follow) and gives the same answer the page does", () => {
    const closed = plantClosedDays({});
    const signIns = streakSignIns(["2026-10-24", "2026-10-25"], "2026-10-24", TODAY, true);
    const r = judgeStreak({ today: TODAY, judged: new Map(), waiting: 0, signIns, isClosedDay: closed, countedFrom: "2026-10-01" });
    assert.equal(r.days, 3, "Saturday, Sunday and today, each kept by the sign-in alone");
    assert.equal(r.todayKept, true);
  });
});

// ---------------------------------------------------------------------------
// the days, read from user_sessions itself (a throwaway PostgreSQL)

const PG_URL = process.env.DCRS_SESSIONS_TEST_URL;
if (PG_URL) {
  describe("the sign-in days, in PostgreSQL (user_sessions)", () => {
    let db: typeof import("../db.ts");
    before(async () => {
      db = await import("../db.ts");
      process.env.DATABASE_URL = PG_URL;
      await db.openDatabase();
      const pool = db.database();
      for (const id of ["u-days-a", "u-days-b"]) {
        await pool.query("INSERT INTO users (id, name, email, password_hash, created_at) VALUES ($1, $1, $2, 'x', now()::text) ON CONFLICT (id) DO NOTHING", [id, `${id}@days.test`]);
        await pool.query("DELETE FROM user_sessions WHERE user_id = $1", [id]);
      }
      const at = (id: string, user: string, signedInAt: string, place = "website") =>
        pool.query("INSERT INTO user_sessions (id, user_id, place, signed_in_at, last_used_at, ends_at) VALUES ($1, $2, $3, $4, $4, $4::timestamptz + interval '8 hours')", [id, user, place, signedInAt]);
      await at("s-days-1", "u-days-a", "2026-10-12T03:40:00Z"); // 09:10 in the plant
      await at("s-days-2", "u-days-a", "2026-10-12T09:00:00Z"); // the same day again
      await at("s-days-3", "u-days-a", "2026-10-13T23:45:00Z"); // 05:15 on the 14th in the plant
      await at("s-days-4", "u-days-a", "2026-10-15T05:00:00Z", "phone-app");
      await at("s-days-5", "u-days-a", "2026-10-16T05:00:00Z", "api"); // another program, signing in for them
      await at("s-days-6", "u-days-a", "2026-09-01T05:00:00Z");
      await at("s-days-7", "u-days-b", "2026-10-17T05:00:00Z");
    });
    after(() => db.closeDatabase());

    it("lists each plant day once, the website's and the phone's, and the first on record", async () => {
      const source = postgresSignInDays();
      assert.deepEqual(await source.days("u-days-a", "2026-10-01", "2026-10-31"), ["2026-10-12", "2026-10-14", "2026-10-15"]);
      assert.deepEqual(await source.days("u-days-a", "2026-10-13", "2026-10-14"), ["2026-10-14"], "the window's ends are counted in the plant's days");
      assert.equal(await source.firstDay("u-days-a"), "2026-09-01");
      assert.deepEqual(await source.days("u-days-b", "2026-10-01", "2026-10-31"), ["2026-10-17"], "nobody else's");
      assert.equal(await source.firstDay("u-days-none"), null);
    });

    it("is answered from the index made for it", async () => {
      const { rows } = await db.database().query<{ indexdef: string }>("SELECT indexdef FROM pg_indexes WHERE indexname = 'user_sessions_user_signed_in_idx'");
      assert.equal(rows.length, 1);
      assert.match(rows[0].indexdef, /\(user_id, signed_in_at\)/);
    });
  });
} else {
  describe("the sign-in days, in PostgreSQL (user_sessions)", () => {
    it("skipped (DCRS_SESSIONS_TEST_URL is not set; the same checks run on a throwaway database when it is)", { skip: true }, () => undefined);
  });
}
