// A STAND-IN FOR THE REMINDER EMAILS' TABLES (backend/emailContacts.ts), in memory, for the unit tests: the same rules as
// PostgreSQL's (one line per person, day and slot: a second claim gets nothing; a failed line claimed again only while it
// has had fewer tries than allowed; a new address forgets the old one's failure), which
// backend/tests/emailReminders.test.ts holds the two to (the PostgreSQL store when DCRS_EMAIL_TEST_URL names a
// database). The open notifications are read from a stand-in ledger (backend/tests/memoryLedger.ts), or set by hand.
// Not a test file itself.
import { EMAIL_LOG_KEEP_DAYS, type EmailContact, type EmailLogRow, type EmailSettings, type EmailStore, type OpenItem } from "../emailContacts.ts";
import type { MemoryLedger } from "./memoryLedger.ts";

export interface MemoryEmailStore extends EmailStore {
  rows: EmailLogRow[];
  contactRows: EmailContact[];
  /** The open items when no ledger is given. */
  items: OpenItem[];
  settingsRow: EmailSettings;
}

export function createMemoryEmailStore(opts: { clock?: () => Date; ledger?: MemoryLedger } = {}): MemoryEmailStore {
  const clock = opts.clock ?? (() => new Date());
  const stamp = () => clock().toISOString();
  let lastId = 0;
  const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

  const store: MemoryEmailStore = {
    rows: [],
    contactRows: [],
    items: [],
    settingsRow: { enabled: false, setBy: null, setAt: null },

    async settings() {
      return { ...store.settingsRow };
    },
    async setSettings(enabled, by) {
      store.settingsRow = { enabled, setBy: by, setAt: stamp() };
      return { ...store.settingsRow };
    },
    async contacts() {
      return store.contactRows.map(copy);
    },
    async contactOf(userId) {
      const c = store.contactRows.find((x) => x.userId === userId);
      return c ? copy(c) : null;
    },
    async setContact(c) {
      const now = store.contactRows.find((x) => x.userId === c.userId);
      const same = now?.address === c.address;
      const row: EmailContact = {
        userId: c.userId,
        address: c.address,
        language: c.language,
        enabled: c.enabled,
        setBy: c.setBy,
        setAt: stamp(),
        lastFailure: same ? (now?.lastFailure ?? null) : null,
        lastFailureAt: same ? (now?.lastFailureAt ?? null) : null,
      };
      if (now) Object.assign(now, row);
      else store.contactRows.push(row);
      return copy(row);
    },
    async removeContact(userId) {
      const i = store.contactRows.findIndex((x) => x.userId === userId);
      if (i < 0) return false;
      store.contactRows.splice(i, 1);
      return true;
    },
    async noteFailure(userId, failure) {
      const c = store.contactRows.find((x) => x.userId === userId);
      if (c) Object.assign(c, { lastFailure: failure, lastFailureAt: failure === null ? null : stamp() });
    },
    async openItems(userIds, kinds) {
      const from: OpenItem[] = opts.ledger
        ? opts.ledger.rows.filter((r) => r.resolvedAt === null).map((r) => ({ id: r.id, userId: r.userId, kind: r.kind, key: r.key, priority: r.priority, data: r.data }))
        : store.items;
      return from
        .filter((n) => userIds.includes(n.userId) && kinds.includes(n.kind))
        .sort((a, b) => a.id - b.id)
        .map(copy);
    },
    async logOfDay(day) {
      return store.rows.filter((r) => r.day === day).sort((a, b) => a.id - b.id).map(copy);
    },
    async claim(row) {
      if (store.rows.some((r) => r.userId === row.userId && r.day === row.day && r.slot === row.slot)) return null;
      const id = ++lastId;
      store.rows.push({ id, userId: row.userId, day: row.day, slot: row.slot, items: row.items, state: "claimed", attempts: 1, messageId: null, error: null, subject: null, body: null, claimedAt: stamp(), sentAt: null });
      return id;
    },
    async claimRetry(id, maxAttempts) {
      const r = store.rows.find((x) => x.id === id);
      if (!r || r.state !== "failed" || r.attempts >= maxAttempts) return false;
      Object.assign(r, { state: "claimed", attempts: r.attempts + 1, claimedAt: stamp() });
      return true;
    },
    async finish(id, o) {
      const r = store.rows.find((x) => x.id === id);
      if (!r) return;
      Object.assign(r, {
        state: o.state,
        messageId: o.messageId ?? r.messageId,
        error: o.error ?? null,
        subject: o.subject ?? r.subject,
        body: o.body ?? null,
        items: typeof o.items === "number" ? o.items : r.items,
        sentAt: o.state === "sent" || o.state === "captured" ? stamp() : r.sentAt,
      });
    },
    async latest(limit) {
      return store.rows
        .slice()
        .sort((a, b) => b.id - a.id)
        .slice(0, limit)
        .map(copy);
    },
    async cleanUp(now) {
      const cutoff = now.getTime() - EMAIL_LOG_KEEP_DAYS * 86_400_000;
      const before = store.rows.length;
      for (let i = store.rows.length - 1; i >= 0; i--) if (Date.parse(store.rows[i].claimedAt) < cutoff) store.rows.splice(i, 1);
      return before - store.rows.length;
    },
  };
  return store;
}
