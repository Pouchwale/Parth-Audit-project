// THE NOTIFICATION LEDGER (REQUIREMENTS §97, backend/notifications.ts): one set of checks, run on the stand-in the other
// tests use (backend/tests/memoryLedger.ts) and, when DCRS_LEDGER_TEST_URL names a PostgreSQL database, on the real
// ledger in a schema of its own (made, then dropped; nothing else in that database is touched):
//   * the upsert by (person, key): a plan written twice writes nothing the second time; a changed fact is written;
//   * resolution: an open item of a planned kind the plan no longer has is resolved, for the people the plan covered
//     only, and kinds the plan does not own (the escalations, an access change) are left alone; one planned again
//     after it was resolved is opened again as new, unread and not pushed;
//   * the super admin's summary is written once;
//   * per person: nobody lists, or marks read, another person's items; an access change read is done with;
//   * newest first, a page at a time; kept 60 days after it is resolved;
//   * the phones (a token moves to the account that registers it last), the choices, today's pushes and the tickets.
// Run: npm run test:unit -- notificationLedger
//      DCRS_LEDGER_TEST_URL=postgres://user:password@127.0.0.1:5433/a_throwaway_database npm run test:unit -- notificationLedger
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, describe, it } from "node:test";
import pg from "pg";
import { createDatabaseLedger, NOTIFICATION_SCHEMA, type LedgerItem, type NotificationLedger } from "../notifications.ts";
import { PLANNED_KINDS } from "../../frontend/src/engine/notificationPlan.ts";
import { createMemoryLedger, type MemoryLedger } from "./memoryLedger.ts";

interface Harness {
  ledger: NotificationLedger;
  /** Moves an item's resolution `days` into the past. */
  age(userId: string, key: string, days: number): Promise<void>;
  close(): Promise<void>;
}

const A = "u-a";
const B = "u-b";
const item = (userId: string, kind: LedgerItem["kind"], key: string, data: LedgerItem["data"] = {}, priority: LedgerItem["priority"] = "medium"): LedgerItem => ({ userId, kind, key, priority, data });
const ready = (userId: string, id: string) => item(userId, "ready", `ready|${id}`, { recordId: id, documentName: "Doc", dueDate: "2026-10-09" }, "high");
const SCOPE = { kinds: PLANNED_KINDS, users: [A, B] };

function contract(name: string, make: () => Promise<Harness>): void {
  describe(name, { timeout: 120_000 }, () => {
    let h: Harness;
    let L: NotificationLedger;
    before(async () => {
      h = await make();
      L = h.ledger;
    });
    after(() => h.close());

    it("upserts by person and key; the same plan again writes nothing; a changed fact is written, its read kept", async () => {
      const plan = [ready(A, "r1"), ready(A, "r2"), item(A, "overdue", "overdue|r3", { recordId: "r3", daysLate: 1 }, "high"), ready(B, "r9")];
      const first = await L.sync(plan, SCOPE);
      assert.deepEqual(first, { written: 4, resolved: 0 });
      assert.deepEqual(await L.sync(plan, SCOPE), { written: 0, resolved: 0 }, "a quiet plant writes nothing");
      const listed = await L.list(A, { state: "open", limit: 50 });
      assert.equal(listed.items.length, 3);
      assert.ok(listed.items.every((i) => i.userId === A), "only the person's own");
      assert.equal(listed.unread, 3);
      const overdue = listed.items.find((i) => i.key === "overdue|r3")!;
      await L.markRead(A, [overdue.id]);
      const next = [plan[0], plan[1], item(A, "overdue", "overdue|r3", { recordId: "r3", daysLate: 2 }, "high"), plan[3]];
      assert.deepEqual(await L.sync(next, SCOPE), { written: 1, resolved: 0 });
      const after = (await L.list(A, { state: "open", limit: 50 })).items.find((i) => i.key === "overdue|r3")!;
      assert.equal(after.data.daysLate, 2);
      assert.equal(after.id, overdue.id, "the same item");
      assert.ok(after.readAt, "still read");
    });

    it("an item the plan no longer has is resolved, for the people the plan covered only; kinds it does not own stay", async () => {
      await L.add(item(A, "escalation", "escalation|7", { subject: "Store", late: 3 }, "high"));
      await L.add(item("u-other", "ready", "ready|x1", { recordId: "x1" }));
      const result = await L.sync([ready(A, "r1"), ready(B, "r9")], SCOPE);
      assert.equal(result.resolved, 2, "r2 and r3 moved on");
      const open = (await L.list(A, { state: "open", limit: 50 })).items.map((i) => i.key).sort();
      assert.deepEqual(open, ["escalation|7", "ready|r1"]);
      const all = await L.list(A, { state: "all", limit: 50 });
      assert.ok(all.items.find((i) => i.key === "ready|r2")?.resolvedAt, "kept, resolved");
      assert.equal((await L.list("u-other", { state: "open", limit: 50 })).items.length, 1, "a person outside the plan's scope is left alone");
    });

    it("an item planned again after it was resolved is opened again as new: unread, not pushed", async () => {
      const r2 = (await L.list(A, { state: "all", limit: 50 })).items.find((i) => i.key === "ready|r2")!;
      await L.markRead(A, [r2.id]);
      await L.markPushed([r2.id], new Date());
      await L.sync([ready(A, "r1"), ready(A, "r2"), ready(B, "r9")], SCOPE);
      const again = (await L.list(A, { state: "open", limit: 50 })).items.find((i) => i.key === "ready|r2")!;
      assert.equal(again.id, r2.id);
      assert.equal(again.resolvedAt, null);
      assert.equal(again.readAt, null);
      assert.equal(again.pushedAt, null);
    });

    it("the super admin's summary is written once: the morning's keeps the morning's counts", async () => {
      const morning = (n: number) => item(A, "boss_summary", "boss_summary|2026-10-09|morning", { part: "morning", modules: [{ module: "QC", ready: n, needsInput: 0, awaitingVerification: 0, notSubmitted: 0, overdue: 0 }] });
      await L.sync([ready(A, "r1"), ready(A, "r2"), ready(B, "r9"), morning(1)], SCOPE);
      await L.sync([ready(A, "r1"), ready(A, "r2"), ready(B, "r9"), morning(5)], SCOPE);
      const summary = (await L.list(A, { state: "open", limit: 50 })).items.find((i) => i.kind === "boss_summary")!;
      assert.equal(summary.data.modules?.[0].ready, 1);
    });

    it("nobody marks another person's items read; all marks only the person's own; an access change read is done with", async () => {
      const bItem = (await L.list(B, { state: "open", limit: 50 })).items[0];
      await L.markRead(A, [bItem.id]);
      assert.equal((await L.list(B, { state: "open", limit: 50 })).unread, 1, "B's is untouched");
      await L.add(item(A, "access_changed", "access_changed|1", { module: "QC", level: "read", by: "Super Admin" }));
      assert.equal(await L.markRead(A, "all"), 0);
      assert.equal((await L.list(B, { state: "open", limit: 50 })).unread, 1);
      const changed = (await L.list(A, { state: "all", limit: 50 })).items.find((i) => i.kind === "access_changed")!;
      assert.ok(changed.readAt && changed.resolvedAt, "read, and so done with");
    });

    it("newest first, a page at a time", async () => {
      const plan = Array.from({ length: 7 }, (_, i) => ready("u-page", `p${i}`));
      await L.sync(plan, { kinds: PLANNED_KINDS, users: ["u-page"] });
      const page1 = await L.list("u-page", { state: "open", limit: 3 });
      assert.equal(page1.items.length, 3);
      assert.ok(page1.items[0].id > page1.items[1].id);
      const page2 = await L.list("u-page", { state: "open", limit: 3, before: page1.items[2].id });
      assert.equal(page2.items.length, 3);
      assert.ok(page2.items.every((i) => i.id < page1.items[2].id));
      assert.equal(page1.open, 7);
    });

    it("kept 60 days after it is resolved", async () => {
      await h.age(A, "ready|r2", 30);
      await L.sync([ready(A, "r1"), ready(B, "r9")], SCOPE);
      await h.age(A, "ready|r2", 61);
      const gone = await L.cleanUp(new Date());
      assert.ok(gone >= 1);
      const all = (await L.list(A, { state: "all", limit: 100 })).items.map((i) => i.key);
      assert.ok(!all.includes("ready|r2"));
      assert.ok(all.includes("ready|r1"), "an open item is kept");
    });

    it("phones: a token moves to the account that registers it last; a person removes only their own; Expo's dead token is forgotten", async () => {
      const token = "ExponentPushToken[abcdefghijklmnop]";
      await L.registerDevice(A, { token, platform: "android", language: "gu", appVersion: "1.1.0", deviceName: "Galaxy" });
      assert.equal((await L.devicesOf(A)).length, 1);
      await L.registerDevice(B, { token, platform: "android", language: "hi" });
      assert.equal((await L.devicesOf(A)).length, 0, "one phone, one person");
      assert.equal((await L.devicesOf(B))[0].language, "hi");
      await L.removeDevice(A, token);
      assert.equal((await L.devicesOf(B)).length, 1, "not A's to remove");
      await L.forgetToken(token);
      assert.equal((await L.devicesOf(B)).length, 0);
    });

    it("choices: every kind on until switched off; a change keeps the rest", async () => {
      const first = await L.getPreferences(A);
      assert.ok(Object.values(first.kinds).every((v) => v === true));
      assert.equal(first.reminders, undefined);
      await L.setPreferences(A, { kinds: { upcoming: false } });
      const now = await L.setPreferences(A, { kinds: { overdue: false }, reminders: true });
      assert.equal(now.kinds.upcoming, false);
      assert.equal(now.kinds.overdue, false);
      assert.equal(now.kinds.ready, true);
      assert.equal(now.reminders, true);
      assert.deepEqual(await L.getPreferences(A), now);
    });

    it("the people to push: those with a phone, their open items, their choices and today's pushes; and the tickets", async () => {
      await L.registerDevice(A, { token: "ExponentPushToken[aaaaaaaaaaaa]", platform: "android", language: "en" });
      const before = await L.pushPeople(new Date(Date.now() - 3_600_000));
      assert.deepEqual(before.map((p) => p.userId), [A]);
      const open = before[0].open;
      assert.ok(open.length > 0 && open.every((i) => i.userId === A && i.resolvedAt === null));
      assert.equal(before[0].prefs.kinds.upcoming, false);
      await L.markPushed([open[0].id], new Date());
      const after = await L.pushPeople(new Date(Date.now() - 3_600_000));
      assert.ok(after[0].pushedToday[open[0].kind]);
      assert.equal(after[0].open.find((i) => i.id === open[0].id)?.pushAttempts, 1);
      await L.addTickets([{ id: "t-1", token: "ExponentPushToken[aaaaaaaaaaaa]" }]);
      assert.deepEqual(await L.ticketsBefore(new Date(Date.now() + 60_000), 10), [{ id: "t-1", token: "ExponentPushToken[aaaaaaaaaaaa]" }]);
      assert.deepEqual(await L.ticketsBefore(new Date(Date.now() - 60_000), 10), []);
      await L.dropTickets(["t-1"]);
      assert.deepEqual(await L.ticketsBefore(new Date(Date.now() + 60_000), 10), []);
    });
  });
}

contract("the stand-in ledger (memory)", async () => {
  const ledger: MemoryLedger = createMemoryLedger();
  return {
    ledger,
    async age(userId, key, days) {
      const row = ledger.rows.find((r) => r.userId === userId && r.key === key);
      if (row?.resolvedAt) row.resolvedAt = new Date(Date.parse(row.resolvedAt) - days * 86_400_000).toISOString();
    },
    async close() {},
  };
});

const URL = process.env.DCRS_LEDGER_TEST_URL?.trim() ?? "";
if (URL) {
  contract("the PostgreSQL ledger (DCRS_LEDGER_TEST_URL)", async () => {
    const schema = `ledger_test_${randomBytes(4).toString("hex")}`;
    const admin = new pg.Client({ connectionString: URL });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    const pool = new pg.Pool({ connectionString: URL, max: 2, options: `-c search_path=${schema}` });
    await pool.query(NOTIFICATION_SCHEMA);
    return {
      ledger: createDatabaseLedger(() => pool as never),
      async age(userId, key, days) {
        await pool.query(`UPDATE notifications SET resolved_at = resolved_at - make_interval(days => $3::int) WHERE user_id = $1 AND key = $2 AND resolved_at IS NOT NULL`, [userId, key, days]);
      },
      async close() {
        await pool.query(`DROP SCHEMA ${schema} CASCADE`);
        await pool.end();
      },
    };
  });
} else {
  it("the PostgreSQL ledger: skipped (DCRS_LEDGER_TEST_URL is not set; the same checks run on a real database when it is)", { skip: true }, () => undefined);
}
