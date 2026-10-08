// EACH PERSON'S NOTIFICATIONS OVER HTTP (REQUIREMENTS §97, backend/notificationRoutes.ts), on a real Express server over
// the stand-in ledger (backend/tests/memoryLedger.ts). The sign-in in front of them is the server's own (requireAuth for
// the website, backend/apiV1.ts signedIn for the phone; backend/tests/apiV1.test.ts proves every /api/v1 route answers
// 401 without a session). What is proved here:
//   * the person reads only their own items, worded in the language asked (en, hi, gu), newest first, a page at a time;
//     a language, a state or a page not known is refused in words;
//   * "mark read" touches only the person's own items, by id or all;
//   * the website's routes read the same ledger by the session cookie's person;
//   * a phone is registered with its language and removed at sign-out; the activity log says which phone, never the
//     token; a token that is not an Expo push token is refused;
//   * the choices: every kind pushed until switched off, a change keeps the rest, a kind not known is refused.
// Run: npm run test:unit -- notificationRoutes
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import express, { type NextFunction, type Request, type Response } from "express";
import type { PublicUser } from "../auth.ts";
import { registerNotificationRoutes, registerNotificationRoutesV1 } from "../notificationRoutes.ts";
import { createMemoryLedger, type MemoryLedger } from "./memoryLedger.ts";

const PEOPLE: Record<string, PublicUser> = {
  kapila: { id: "u-kapila", name: "Kapila Barad", email: "kapila.barad@gpp.local", role: "staff", departments: [] },
  vinay: { id: "u-vinay", name: "Vinay Bhojak", email: "vinay.bhojak@gpp.local", role: "staff", departments: [] },
};

interface Logged {
  who: string;
  action: string;
  target: string;
  detail: string;
}

let base = "";
let ledger: MemoryLedger;
const lines: Logged[] = [];
let close: () => Promise<void>;

// The person comes from the session: here, a stand-in header the guards read.
const personOf = (req: Request): PublicUser | undefined => PEOPLE[String(req.get("x-test-person") ?? "")];

before(async () => {
  ledger = createMemoryLedger();
  const app = express();
  app.use(express.json());
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const user = personOf(req);
    if (!user) return void res.status(401).json({ error: "Not authenticated." });
    (req as Request & { user: PublicUser }).user = user;
    next();
  };
  const signedIn = (req: Request, res: Response, next: NextFunction) => {
    const user = personOf(req);
    if (!user) return void res.status(401).json({ error: "Not signed in.", code: "not-signed-in" });
    res.locals.caller = { user };
    next();
  };
  registerNotificationRoutes(app, { requireAuth, ledger });
  registerNotificationRoutesV1(app, {
    signedIn,
    callerOf: (res) => res.locals.caller as { user: PublicUser },
    logActivity: (_req, who, action, target = "", detail = "") => lines.push({ who: who?.name ?? "", action, target, detail }),
    ledger,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise<void>((resolve) => server.close(() => resolve()));

  const doc = { documentId: "daily-pest-monitoring", formatNo: "F/HR/17", documentName: "Daily Pest Control Monitoring Record", module: "HR", dueDate: "2026-10-09" };
  await ledger.sync(
    [
      { userId: "u-kapila", kind: "needs_input", key: "needs_input|r1", priority: "high", data: { ...doc, recordId: "r1", count: 12 } },
      { userId: "u-kapila", kind: "upcoming", key: "upcoming|monthly|2026-10-12", priority: "low", data: { ...doc, documentName: "Monthly Cleaning Record", dueDate: "2026-10-12" } },
      { userId: "u-kapila", kind: "verify", key: "verify|r2", priority: "medium", data: { ...doc, recordId: "r2", by: "Vinay Bhojak" } },
      { userId: "u-vinay", kind: "ready", key: "ready|r3", priority: "high", data: { ...doc, recordId: "r3" } },
    ],
    { kinds: ["needs_input", "upcoming", "verify", "ready"], users: ["u-kapila", "u-vinay"] }
  );
});
after(() => close());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
async function call(method: string, route: string, person: string | null, body?: unknown): Promise<{ status: number; body: Body }> {
  const headers: Record<string, string> = person ? { "x-test-person": person } : {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(base + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

describe("the person's notifications", () => {
  it("lists only the caller's own, newest first, worded in the language asked", async () => {
    const en = await call("GET", "/api/v1/notifications", "kapila");
    assert.equal(en.status, 200);
    assert.deepEqual(en.body.items.map((i: Body) => i.kind), ["verify", "upcoming", "needs_input"]);
    assert.equal(en.body.unread, 3);
    assert.equal(en.body.open, 3);
    const needs = en.body.items[2];
    assert.equal(needs.title, "12 readings to enter: Daily Pest Control Monitoring Record");
    assert.deepEqual(Object.keys(needs).sort(), ["body", "createdAt", "data", "id", "kind", "priority", "readAt", "resolvedAt", "title"]);
    assert.equal(needs.data.recordId, "r1");
    const gu = await call("GET", "/api/v1/notifications?lang=gu", "kapila");
    assert.match(gu.body.items[2].title, /^12 રીડિંગ ભરવાના બાકી/);
    const hi = await call("GET", "/api/v1/notifications?lang=hi", "kapila");
    assert.match(hi.body.items[0].body, /^Vinay Bhojak ने /);
    const vinay = await call("GET", "/api/v1/notifications", "vinay");
    assert.deepEqual(vinay.body.items.map((i: Body) => i.data.recordId), ["r3"], "nobody reads another person's items");
  });

  it("a page at a time; a language, a state or a page not known is refused in words", async () => {
    const first = await call("GET", "/api/v1/notifications?limit=2", "kapila");
    assert.equal(first.body.items.length, 2);
    const rest = await call("GET", `/api/v1/notifications?limit=2&before=${first.body.items[1].id}`, "kapila");
    assert.deepEqual(rest.body.items.map((i: Body) => i.kind), ["needs_input"]);
    for (const q of ["lang=fr", "state=closed", "limit=0", "before=x"]) {
      const bad = await call("GET", `/api/v1/notifications?${q}`, "kapila");
      assert.equal(bad.status, 400, q);
      assert.equal(bad.body.code, "bad-request");
      assert.ok(bad.body.error.length > 10);
    }
    assert.equal((await call("GET", "/api/v1/notifications", null)).status, 401);
  });

  it("marks only the caller's own read, by id or all", async () => {
    const vinayItem = (await call("GET", "/api/v1/notifications", "vinay")).body.items[0];
    const mine = (await call("GET", "/api/v1/notifications", "kapila")).body.items;
    const one = await call("POST", "/api/v1/notifications/read", "kapila", { ids: [mine[0].id, vinayItem.id] });
    assert.equal(one.status, 200);
    assert.equal(one.body.unread, 2);
    assert.equal((await call("GET", "/api/v1/notifications", "vinay")).body.unread, 1, "Vinay's is untouched");
    for (const body of [{}, { ids: [] }, { ids: ["1"] }, { all: "yes" }, { ids: Array.from({ length: 501 }, (_, i) => i + 1) }]) {
      assert.equal((await call("POST", "/api/v1/notifications/read", "kapila", body)).status, 400, JSON.stringify(body).slice(0, 60));
    }
    const all = await call("POST", "/api/v1/notifications/read", "kapila", { all: true });
    assert.equal(all.body.unread, 0);
  });

  it("the website reads the same ledger by its session's person", async () => {
    const web = await call("GET", "/api/notifications?limit=20", "vinay");
    assert.equal(web.status, 200);
    assert.deepEqual(web.body.items.map((i: Body) => i.key ?? i.kind), ["ready"]);
    const read = await call("POST", "/api/notifications/read", "vinay", { all: true });
    assert.equal(read.body.unread, 0);
    assert.equal((await call("GET", "/api/notifications", null)).status, 401);
  });
});

describe("the phone's registration and the choices", () => {
  const token = "ExponentPushToken[AbCdEf123456_-xyz]";

  it("registers a phone with its language; says which phone in the activity log, never the token; removes it at sign-out", async () => {
    const r = await call("POST", "/api/v1/devices", "kapila", { token, platform: "android", language: "gu", appVersion: "1.1.0", deviceName: "Galaxy A14" });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true });
    assert.deepEqual(ledger.devices.map((d) => [d.userId, d.language, d.appVersion]), [["u-kapila", "gu", "1.1.0"]]);
    const line = lines.find((l) => l.action === "Phone registered for notifications")!;
    assert.equal(line.who, "Kapila Barad");
    assert.equal(line.target, "Galaxy A14");
    assert.ok(!JSON.stringify(lines).includes("AbCdEf123456"), "the token is never written");
    for (const body of [
      { token: "not-a-token", platform: "android", language: "en" },
      { token, platform: "windows", language: "en" },
      { token, platform: "ios", language: "fr" },
      { token, platform: "ios", language: "en", deviceName: "x".repeat(121) },
    ]) {
      const bad = await call("POST", "/api/v1/devices", "kapila", body);
      assert.equal(bad.status, 400, JSON.stringify(body));
    }
    assert.equal((await call("DELETE", "/api/v1/devices", "vinay", { token })).status, 200);
    assert.equal(ledger.devices.length, 1, "not Vinay's to remove");
    assert.equal((await call("DELETE", "/api/v1/devices", "kapila", { token })).status, 200);
    assert.equal(ledger.devices.length, 0);
    assert.equal((await call("DELETE", "/api/v1/devices", "kapila", {})).status, 400);
  });

  it("every kind is pushed until switched off; a change keeps the rest; a kind not known is refused", async () => {
    const first = await call("GET", "/api/v1/notification-preferences", "kapila");
    assert.equal(first.status, 200);
    assert.equal(Object.keys(first.body.kinds).length, 10);
    assert.ok(Object.values(first.body.kinds).every((v) => v === true));
    assert.equal(first.body.reminders, undefined);
    const set = await call("PUT", "/api/v1/notification-preferences", "kapila", { kinds: { upcoming: false }, reminders: false });
    assert.equal(set.status, 200);
    assert.equal(set.body.kinds.upcoming, false);
    assert.equal(set.body.kinds.ready, true);
    assert.equal(set.body.reminders, false);
    assert.deepEqual((await call("GET", "/api/v1/notification-preferences", "kapila")).body, set.body);
    assert.ok(lines.some((l) => l.action === "Notification choices changed" && /not pushed: upcoming/.test(l.detail)));
    for (const body of [{ kinds: { weather: false } }, { kinds: { ready: "no" } }, { kinds: [] }, { reminders: "on" }]) {
      assert.equal((await call("PUT", "/api/v1/notification-preferences", "kapila", body)).status, 400, JSON.stringify(body));
    }
    assert.equal((await call("GET", "/api/v1/notification-preferences", "vinay")).body.kinds.upcoming, true, "one person's choice is theirs alone");
  });
});
