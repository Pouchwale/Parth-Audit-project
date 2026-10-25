// THE REMINDER EMAILS' TABLES (backend/emailContacts.ts): one set of checks, run on the stand-in the other tests use
// (backend/tests/memoryEmailStore.ts) and, when DCRS_EMAIL_TEST_URL names a PostgreSQL database, on the real tables in a
// schema of their own (made, then dropped; nothing else in that database is touched):
//   * the switch: off until switched on, with who and when;
//   * a reminder email set, replaced (a new address forgets the old one's failure, the same address keeps it), listed and
//     removed; a failure noted and cleared;
//   * THE CLAIM: one line per person, day and slot; a second claim of the same gets nothing (so a restart or a second
//     server never sends twice); a failed line is claimed again only while it has had fewer tries than allowed, and only
//     once at a time; finished as sent, captured (its text kept) or failed;
//   * the open notifications of the people asked, of the kinds asked, read from the ledger's table;
//   * a day's lines in order, the newest first for the page, 60 days kept.
// Run: npm run test:unit -- emailStore
//      DCRS_EMAIL_TEST_URL=postgres://user:password@127.0.0.1:<port>/a_throwaway_database npm run test:unit -- emailStore
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, describe, it } from "node:test";
import pg from "pg";
import { createDatabaseEmailStore, EMAIL_SCHEMA, type EmailStore, type OpenItem } from "../emailContacts.ts";
import { NOTIFICATION_SCHEMA } from "../notifications.ts";
import { createMemoryEmailStore } from "./memoryEmailStore.ts";

interface Harness {
  store: EmailStore;
  /** Puts open (and one resolved) notifications in the ledger. */
  notifications(items: (Omit<OpenItem, "id"> & { resolved?: boolean })[]): Promise<void>;
  /** Moves a line's claim `days` into the past. */
  age(id: number, days: number): Promise<void>;
  close(): Promise<void>;
}

const MAIL = { a: "a.reminders@example.com", b: "b.reminders@example.com" };

function contract(name: string, make: () => Promise<Harness>): void {
  describe(name, { timeout: 120_000 }, () => {
    let h: Harness;
    let S: EmailStore;
    before(async () => {
      h = await make();
      S = h.store;
    });
    after(() => h.close());

    it("the switch: off until switched on, with who and when", async () => {
      assert.deepEqual(await S.settings(), { enabled: false, setBy: null, setAt: null });
      const on = await S.setSettings(true, "Super Admin");
      assert.equal(on.enabled, true);
      assert.equal(on.setBy, "Super Admin");
      assert.ok(on.setAt);
      assert.equal((await S.settings()).enabled, true);
      assert.equal((await S.setSettings(false, "Super Admin")).enabled, false);
    });

    it("a reminder email set, replaced, listed, removed; a failure noted, kept for the same address, forgotten for a new one", async () => {
      const set = await S.setContact({ userId: "u-a", address: MAIL.a, language: "gu", enabled: true, setBy: "Super Admin" });
      assert.deepEqual([set.userId, set.address, set.language, set.enabled, set.setBy, set.lastFailure], ["u-a", MAIL.a, "gu", true, "Super Admin", null]);
      await S.noteFailure("u-a", "EAUTH 535 Invalid login");
      const failed = (await S.contactOf("u-a"))!;
      assert.equal(failed.lastFailure, "EAUTH 535 Invalid login");
      assert.ok(failed.lastFailureAt);
      await S.setContact({ userId: "u-a", address: MAIL.a, language: "en", enabled: false, setBy: "Super Admin" });
      assert.equal((await S.contactOf("u-a"))!.lastFailure, "EAUTH 535 Invalid login", "the same address keeps its failure");
      const moved = await S.setContact({ userId: "u-a", address: MAIL.b, language: "hi", enabled: true, setBy: "Super Admin" });
      assert.deepEqual([moved.address, moved.language, moved.enabled, moved.lastFailure, moved.lastFailureAt], [MAIL.b, "hi", true, null, null]);
      await S.noteFailure("u-a", "x");
      await S.noteFailure("u-a", null);
      assert.equal((await S.contactOf("u-a"))!.lastFailure, null);
      await S.setContact({ userId: "u-b", address: MAIL.a, language: "en", enabled: true, setBy: "Super Admin" });
      assert.deepEqual((await S.contacts()).map((c) => c.userId).sort(), ["u-a", "u-b"]);
      assert.equal(await S.removeContact("u-b"), true);
      assert.equal(await S.removeContact("u-b"), false);
      assert.equal(await S.contactOf("u-b"), null);
    });

    it("THE CLAIM: once per person, day and slot; a failed line again only below its tries, and once at a time", async () => {
      const id = await S.claim({ userId: "u-a", day: "2026-10-09", slot: "morning", items: 3 });
      assert.ok(typeof id === "number" && id > 0);
      assert.equal(await S.claim({ userId: "u-a", day: "2026-10-09", slot: "morning", items: 3 }), null, "a second claim of the same slot gets nothing");
      const other = await S.claim({ userId: "u-a", day: "2026-10-09", slot: "reminder", items: 2 });
      const tomorrow = await S.claim({ userId: "u-a", day: "2026-10-10", slot: "morning", items: 1 });
      assert.ok(other && tomorrow && other !== id && tomorrow !== id);
      assert.equal(await S.claimRetry(id!, 3), false, "a line still claimed is not claimed again");
      await S.finish(id!, { state: "failed", error: "EENVELOPE 550 <a…@e….com>", subject: "3 records need you", items: 3 });
      let row = (await S.logOfDay("2026-10-09")).find((r) => r.id === id)!;
      assert.deepEqual([row.state, row.attempts, row.error, row.sentAt], ["failed", 1, "EENVELOPE 550 <a…@e….com>", null]);
      const [x, y] = await Promise.all([S.claimRetry(id!, 3), S.claimRetry(id!, 3)]);
      assert.deepEqual([x, y].sort(), [false, true], "two runs at one moment: one of them tries again");
      await S.finish(id!, { state: "failed", error: "again", items: 3 });
      assert.equal(await S.claimRetry(id!, 3), true);
      await S.finish(id!, { state: "failed", error: "and again", items: 3 });
      assert.equal(await S.claimRetry(id!, 3), false, "three tries, no more");
      row = (await S.logOfDay("2026-10-09")).find((r) => r.id === id)!;
      assert.equal(row.attempts, 3);
      await S.finish(other!, { state: "captured", messageId: "captured-1", subject: "Still open: 2 records need you", body: "Hello,\n- one", items: 2 });
      const captured = (await S.logOfDay("2026-10-09")).find((r) => r.id === other)!;
      assert.deepEqual([captured.state, captured.messageId, captured.subject, captured.body, captured.error], ["captured", "captured-1", "Still open: 2 records need you", "Hello,\n- one", null]);
      assert.ok(captured.sentAt);
      await S.finish(tomorrow!, { state: "sent", messageId: "<m1@example.com>", subject: "1", items: 1 });
      const sent = (await S.logOfDay("2026-10-10"))[0];
      assert.deepEqual([sent.state, sent.body], ["sent", null], "a sent email's text is not kept");
      assert.deepEqual((await S.logOfDay("2026-10-09")).map((r) => r.id), [id, other], "a day's lines in order");
      assert.deepEqual((await S.latest(2)).map((r) => r.id), [tomorrow, other], "the newest first");
    });

    it("the open notifications of the people asked, of the kinds asked", async () => {
      await h.notifications([
        { userId: "u-a", kind: "due", key: "due|d1|2026-10-09", priority: "high", data: { documentId: "d1", formatNo: "F/QC/01", dueDate: "2026-10-09" } },
        { userId: "u-a", kind: "boss_summary", key: "boss_summary|2026-10-09|morning", priority: "medium", data: { part: "morning" } },
        { userId: "u-a", kind: "verify", key: "verify|r1", priority: "medium", data: { recordId: "r1", by: "Vinay Bhojak" } },
        { userId: "u-a", kind: "ready", key: "ready|r2", priority: "high", data: { recordId: "r2" }, resolved: true },
        { userId: "u-b", kind: "due", key: "due|d2|2026-10-09", priority: "high", data: { documentId: "d2" } },
      ]);
      const got = await S.openItems(["u-a"], ["due", "verify", "ready"]);
      assert.deepEqual(got.map((n) => [n.userId, n.kind, n.key]), [
        ["u-a", "due", "due|d1|2026-10-09"],
        ["u-a", "verify", "verify|r1"],
      ]);
      assert.equal(got[0].data.formatNo, "F/QC/01");
      assert.ok(got[0].id < got[1].id);
      assert.deepEqual(await S.openItems([], ["due"]), []);
    });

    it("60 days of the log kept", async () => {
      const old = (await S.claim({ userId: "u-b", day: "2026-08-01", slot: "morning", items: 1 }))!;
      const recent = (await S.claim({ userId: "u-b", day: "2026-08-20", slot: "morning", items: 1 }))!;
      await h.age(old, 61);
      await h.age(recent, 59);
      assert.ok((await S.cleanUp(new Date())) >= 1);
      assert.deepEqual((await S.logOfDay("2026-08-01")).length, 0);
      assert.deepEqual((await S.logOfDay("2026-08-20")).length, 1);
    });
  });
}

contract("the stand-in email tables", async () => {
  const store = createMemoryEmailStore();
  let id = 0;
  return {
    store,
    async notifications(items) {
      store.items = items.filter((n) => !n.resolved).map(({ resolved: _resolved, ...n }) => ({ ...n, id: ++id }));
    },
    async age(lineId, days) {
      const r = store.rows.find((x) => x.id === lineId)!;
      r.claimedAt = new Date(Date.now() - days * 86_400_000).toISOString();
    },
    async close() {},
  };
});

const URL = process.env.DCRS_EMAIL_TEST_URL?.trim() ?? "";
if (URL) {
  contract("the PostgreSQL email tables (DCRS_EMAIL_TEST_URL)", async () => {
    const schema = `email_test_${randomBytes(4).toString("hex")}`;
    const admin = new pg.Client({ connectionString: URL });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    const pool = new pg.Pool({ connectionString: URL, max: 4, options: `-c search_path=${schema}` });
    // The accounts the contacts point at (users(id), as db.ts makes it), then the ledger's table and these.
    await pool.query("CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '')");
    await pool.query("INSERT INTO users (id, name) VALUES ('u-a', 'A'), ('u-b', 'B')");
    await pool.query(NOTIFICATION_SCHEMA);
    await pool.query(EMAIL_SCHEMA);
    return {
      store: createDatabaseEmailStore(() => pool as never),
      async notifications(items) {
        for (const n of items) {
          await pool.query("INSERT INTO notifications (user_id, kind, key, priority, data, resolved_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6)", [n.userId, n.kind, n.key, n.priority, JSON.stringify(n.data), n.resolved ? new Date() : null]);
        }
      },
      async age(lineId, days) {
        await pool.query("UPDATE email_log SET claimed_at = now() - make_interval(days => $2::int) WHERE id = $1", [String(lineId), days]);
      },
      async close() {
        await pool.query(`DROP SCHEMA ${schema} CASCADE`);
        await pool.end();
      },
    };
  });
} else {
  it("the PostgreSQL email tables: skipped (DCRS_EMAIL_TEST_URL is not set; the same checks run on a real database when it is)", { skip: true }, () => undefined);
}
