// THE REMINDER EMAILS OVER HTTP (the owner, 25-Oct-2026, backend/emailRoutes.ts), on a real Express server over the
// stand-in email tables (backend/tests/memoryEmailStore.ts). The sign-in in front of them is the server's own
// requireAuth (here a stand-in that reads the person from a header). What is proved here:
//   * THE SUPER ADMIN'S ALONE: every /api/email route answers 403 super-admin-only to a member of staff, whatever it
//     asks, and 401 with no session;
//   * a reminder email set for an account: one plain address of the person's own, refused in words (bad-address with its
//     problem) for a sign-in at gpp.local, a list, a name around it or a domain that receives no mail; the language and
//     on/off checked; an account not known, or removed, refused; set, it is listed with the person's name; removed;
//   * the activity log names the person, the language and on or off, NEVER the address;
//   * the switch: off until switched on, a line in the log only when it changes;
//   * the test email: the caller's own, at most one in 20 seconds;
//   * the email log: newest first, with names, never an address;
//   * the browser's digest is retired: POST /api/reminders/send-digest answers 410 to anybody and sends nothing;
//   * the refusals in Gujarati and Hindi when asked (X-Language).
// Run: npm run test:unit -- emailRoutes
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import express, { type NextFunction, type Request, type Response } from "express";
import type { PublicUser } from "../auth.ts";
import { EMAIL_ACTIONS } from "../db.ts";
import { DIGEST_RETIRED, registerEmailRoutes, TEST_EMAIL_EVERY_MS, type EmailAccount } from "../emailRoutes.ts";
import type { TestEmailResult } from "../emailReminders.ts";
import { createMemoryEmailStore, type MemoryEmailStore } from "./memoryEmailStore.ts";

const PEOPLE: Record<string, PublicUser> = {
  boss: { id: "u-boss", name: "Super Admin", email: "admin@gpp.local", role: "admin", departments: [] },
  kapila: { id: "u-kapila", name: "Kapila Barad", email: "kapila.barad@gpp.local", role: "staff", departments: [] },
};
const ACCOUNTS: EmailAccount[] = [
  { id: "u-boss", name: "Super Admin", removed: false },
  { id: "u-kapila", name: "Kapila Barad", removed: false },
  { id: "u-dharmik", name: "Dharmik Mistry", removed: false },
  { id: "u-gone", name: "Somebody Removed", removed: true },
];
/** Stand-in mailboxes at a reserved domain: nobody's. */
const DHARMIK_MAIL = "dharmik.reminders@example.com";

interface Logged {
  who: string;
  action: string;
  target: string;
  detail: string;
  department: string;
}

let base = "";
let store: MemoryEmailStore;
const lines: Logged[] = [];
const tests: string[] = [];
let close: () => Promise<void>;
let clockMs = Date.parse("2026-10-09T05:30:00.000Z");

before(async () => {
  store = createMemoryEmailStore();
  const app = express();
  app.use(express.json());
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const user = PEOPLE[String(req.get("x-test-person") ?? "")];
    if (!user) return void res.status(401).json({ error: "Not authenticated." });
    (req as Request & { user: PublicUser }).user = user;
    next();
  };
  registerEmailRoutes(app, {
    requireAuth,
    logActivity: (_req, who, action, target = "", detail = "", department = "") => void lines.push({ who: who?.name ?? "", action, target, detail, department }),
    store,
    accounts: async () => ACCOUNTS,
    testEmail: async (user): Promise<TestEmailResult> => (tests.push(user.id), { sent: true, captured: true }),
    now: () => clockMs,
    env: { EMAIL_TRANSPORT: "capture" },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise<void>((resolve) => server.close(() => resolve()));
});
after(() => close());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
async function call(method: string, route: string, person: string | null, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: Body; text: string }> {
  const h: Record<string, string> = { ...(person ? { "x-test-person": person } : {}), ...headers };
  if (body !== undefined) h["Content-Type"] = "application/json";
  const res = await fetch(base + route, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let parsed: Body = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed, text };
}

const ROUTES: [string, string, unknown?][] = [
  ["GET", "/api/email/contacts"],
  ["PUT", "/api/email/contacts/u-dharmik", { address: DHARMIK_MAIL }],
  ["DELETE", "/api/email/contacts/u-dharmik"],
  ["GET", "/api/email/settings"],
  ["PUT", "/api/email/settings", { enabled: true }],
  ["POST", "/api/email/test"],
  ["GET", "/api/email/log"],
];

describe("the super admin's alone", () => {
  it("a member of staff is refused every route, 403 super-admin-only, and nothing changes", async () => {
    for (const [method, route, body] of ROUTES) {
      const r = await call(method, route, "kapila", body);
      assert.equal(r.status, 403, `${method} ${route}`);
      assert.equal(r.body.code, "super-admin-only");
      assert.equal(r.body.error, "Only the super admin reads and sets the reminder emails.");
    }
    assert.equal(store.contactRows.length, 0);
    assert.equal(store.settingsRow.enabled, false);
    assert.deepEqual(tests, []);
    assert.deepEqual(lines, []);
  });

  it("nobody signed in is refused, 401", async () => {
    for (const [method, route, body] of ROUTES) assert.equal((await call(method, route, null, body)).status, 401, `${method} ${route}`);
  });

  it("the refusal in Gujarati and Hindi when asked", async () => {
    assert.match((await call("GET", "/api/email/contacts", "kapila", undefined, { "X-Language": "gu" })).body.error, /સુપર એડમિન/);
    assert.match((await call("GET", "/api/email/contacts", "kapila", undefined, { "X-Language": "hi" })).body.error, /सुपर एडमिन/);
  });
});

describe("each person's reminder email", () => {
  it("refuses what is not one plain address of the person's own, in words, and stores nothing", async () => {
    const refused: [unknown, string][] = [
      ["dharmik.mistry@gpp.local", "sign-in"],
      ["a@example.com, b@example.com", "not-one-address"],
      ["Dharmik <dharmik@example.com>", "not-one-address"],
      ["dharmik@printer.local", "no-mail-domain"],
      ["dharmik@mail.test", "no-mail-domain"],
      ["dharmik@localhost", "bad-domain"],
      ["", "empty"],
      [undefined, "empty"],
    ];
    for (const [address, problem] of refused) {
      const r = await call("PUT", "/api/email/contacts/u-dharmik", "boss", { address });
      assert.equal(r.status, 400, String(address));
      assert.equal(r.body.code, "bad-address");
      assert.equal(r.body.problem, problem, String(address));
    }
    const signIn = await call("PUT", "/api/email/contacts/u-dharmik", "boss", { address: "dharmik.mistry@gpp.local" });
    assert.equal(signIn.body.error, "That is a DCRS sign-in, not a mailbox: DCRS never sends mail to it. Give the person's own email address.");
    assert.equal((await call("PUT", "/api/email/contacts/u-dharmik", "boss", { address: DHARMIK_MAIL, language: "fr" })).body.code, "bad-language");
    assert.equal((await call("PUT", "/api/email/contacts/u-dharmik", "boss", { address: DHARMIK_MAIL, enabled: "yes" })).body.code, "bad-enabled");
    assert.equal((await call("PUT", "/api/email/contacts/u-nobody", "boss", { address: DHARMIK_MAIL })).status, 404);
    const gone = await call("PUT", "/api/email/contacts/u-gone", "boss", { address: DHARMIK_MAIL });
    assert.equal(gone.status, 409);
    assert.equal(gone.body.code, "removed-account");
    assert.equal(store.contactRows.length, 0);
    assert.deepEqual(lines, []);
  });

  it("sets one, trimmed and in small letters, with its language and on or off; listed with the person's name; the log never says the address", async () => {
    const r = await call("PUT", "/api/email/contacts/u-dharmik", "boss", { address: "  Dharmik.Reminders@Example.com ", language: "gu", enabled: true });
    assert.equal(r.status, 200);
    assert.equal(r.body.contact.address, DHARMIK_MAIL);
    assert.equal(r.body.contact.language, "gu");
    assert.equal(r.body.contact.enabled, true);
    assert.equal(r.body.contact.setBy, "Super Admin");
    assert.equal(r.body.contact.name, "Dharmik Mistry");
    const listed = await call("GET", "/api/email/contacts", "boss");
    assert.deepEqual(
      listed.body.contacts.map((c: Body) => [c.userId, c.name, c.address, c.language, c.enabled]),
      [["u-dharmik", "Dharmik Mistry", DHARMIK_MAIL, "gu", true]]
    );
    assert.equal(listed.text.includes("password"), false);
    const off = await call("PUT", "/api/email/contacts/u-dharmik", "boss", { address: DHARMIK_MAIL, enabled: false });
    assert.equal(off.body.contact.enabled, false);
    assert.equal(off.body.contact.language, "en", "the language left out is English");
    assert.deepEqual(
      lines.map((l) => [l.who, l.action, l.target, l.detail, l.department]),
      [
        ["Super Admin", EMAIL_ACTIONS.set, "Dharmik Mistry", "Emails in Gujarati; on", ""],
        ["Super Admin", EMAIL_ACTIONS.set, "Dharmik Mistry", "Emails in English; off", ""],
      ]
    );
    assert.ok(!JSON.stringify(lines).includes("@"), "never an address in the activity log");
  });

  it("removes one: listed no more, a line in the log; removed again, nothing to remove", async () => {
    const r = await call("DELETE", "/api/email/contacts/u-dharmik", "boss");
    assert.deepEqual(r.body, { removed: true });
    assert.deepEqual((await call("GET", "/api/email/contacts", "boss")).body.contacts, []);
    assert.equal(lines[lines.length - 1].action, EMAIL_ACTIONS.removed);
    assert.equal(lines[lines.length - 1].target, "Dharmik Mistry");
    assert.deepEqual((await call("DELETE", "/api/email/contacts/u-dharmik", "boss")).body, { removed: false });
  });
});

describe("the switch, the test email and the log", () => {
  it("the switch: off until switched on, with the setup; a line in the log only when it changes", async () => {
    const first = await call("GET", "/api/email/settings", "boss");
    assert.equal(first.body.enabled, false);
    assert.equal(first.body.setup.mode, "capture");
    assert.equal(first.body.setup.serverOn, true);
    assert.equal(first.body.setup.dailyCap, 150);
    assert.equal(first.body.setup.times.reminder, "15:30");
    const before = lines.length;
    const on = await call("PUT", "/api/email/settings", "boss", { enabled: true });
    assert.equal(on.body.enabled, true);
    assert.equal(on.body.setBy, "Super Admin");
    assert.equal(lines.length, before + 1);
    assert.equal(lines[lines.length - 1].action, EMAIL_ACTIONS.on);
    await call("PUT", "/api/email/settings", "boss", { enabled: true });
    assert.equal(lines.length, before + 1, "switched on again: no second line");
    assert.equal((await call("PUT", "/api/email/settings", "boss", { enabled: "on" })).body.code, "bad-enabled");
  });

  it("the test email: the caller's own, at most one in 20 seconds", async () => {
    const first = await call("POST", "/api/email/test", "boss");
    assert.deepEqual(first.body, { sent: true, captured: true });
    assert.deepEqual(tests, ["u-boss"]);
    assert.equal(lines[lines.length - 1].action, EMAIL_ACTIONS.test);
    const soon = await call("POST", "/api/email/test", "boss");
    assert.equal(soon.status, 429);
    assert.equal(soon.body.code, "too-many");
    clockMs += TEST_EMAIL_EVERY_MS;
    assert.equal((await call("POST", "/api/email/test", "boss")).status, 200);
    assert.equal(tests.length, 2);
  });

  it("the email log: newest first, with each person's name, never an address", async () => {
    await store.setContact({ userId: "u-dharmik", address: DHARMIK_MAIL, language: "en", enabled: true, setBy: "Super Admin" });
    const a = (await store.claim({ userId: "u-dharmik", day: "2026-10-09", slot: "morning", items: 2 }))!;
    await store.finish(a, { state: "captured", subject: "2 records need you", body: "Hello Dharmik Mistry,", items: 2, messageId: "captured-1" });
    const b = (await store.claim({ userId: "u-kapila", day: "2026-10-09", slot: "morning", items: 1 }))!;
    await store.finish(b, { state: "failed", error: "EENVELOPE 550 <k…@e….com> rejected", subject: "Due today: X", items: 1 });
    const r = await call("GET", "/api/email/log?limit=5", "boss");
    assert.equal(r.status, 200);
    assert.deepEqual(
      r.body.rows.map((x: Body) => [x.name, x.slot, x.state, x.items]),
      [
        ["Kapila Barad", "morning", "failed", 1],
        ["Dharmik Mistry", "morning", "captured", 2],
      ]
    );
    assert.equal(r.body.rows[1].body, "Hello Dharmik Mistry,");
    assert.ok(!r.text.includes(DHARMIK_MAIL) && !r.text.includes("messageId"), r.text);
    assert.equal((await call("GET", "/api/email/log?limit=abc", "boss")).status, 200, "a limit not a number reads the default");
  });
});

describe("the browser's digest is retired", () => {
  it("POST /api/reminders/send-digest answers 410 to anybody, says why, and sends nothing", async () => {
    for (const person of [null, "kapila", "boss"]) {
      const r = await call("POST", "/api/reminders/send-digest", person, { reminders: [{ documentName: "x", dueDate: "2026-10-09", urgency: "due", assignedEmployees: [{ name: "x", email: DHARMIK_MAIL }] }] });
      assert.equal(r.status, 410);
      assert.equal(r.body.code, "retired");
      assert.equal(r.body.error, DIGEST_RETIRED);
    }
    assert.match(DIGEST_RETIRED, /reminder email the super admin sets on Users & Access/);
  });
});
