// THE REMINDER EMAILS' TABLES (the owner, 25-Oct-2026; backend/emailReminders.ts sends the emails): who gets one and
// where, whether they go out at all, and what went to whom and when. Kept in PostgreSQL (REQUIREMENTS §55: nowhere
// else), DCRS's own in the shared database (§83: no role of the Audit Assistant is granted them).
//
//   email_contacts  one row per account given a reminder email by the super admin: the address (a mailbox of the
//                   person's own, never the sign-in, which receives no mail), the language the email is written in
//                   (en, gu, hi), on or off, who set it and when, and the last failure to send to it. Only the super
//                   admin reads or sets them (backend/emailRoutes.ts): never in /api/users/directory, never in a log
//                   line, never in the activity log. Not in Master Data either, which every account reads and writes.
//   email_settings  one row: whether the reminder emails go out (the super admin's switch, on the Notifications page),
//                   who set it and when. OFF until the super admin switches them on; EMAIL_ENABLED=0 stops them on the
//                   server whatever the row says.
//   email_log       one row per person, plant day and slot (morning, reminder, lastCall; each test email a slot of its
//                   own, "test-<time>"): CLAIMED before the email is sent (INSERT ... ON CONFLICT DO NOTHING on the
//                   UNIQUE (user_id, day, slot)), so a restart, a second server or a run by hand in the same minute
//                   never sends a slot's email twice; then sent, captured (EMAIL_TRANSPORT=capture: nothing left the PC;
//                   the text is kept here, the proof of what would have gone) or failed (tried again at most twice later
//                   in the same slot). Never an address: an error's text is masked before it is written (backend/email.ts
//                   scrubAddresses). Kept 60 days.
//
// READ BY THE SENDER WITH ITS OWN QUERY: each person's OPEN notifications (the ledger's notifications table,
// backend/notifications.ts; open = resolved_at IS NULL), the kinds an email carries only.
import { database, registerSchema } from "./db.ts";
import type { NotificationData, NotificationKind } from "../frontend/src/engine/notificationPlan.ts";
import { isReminderLanguage, type ReminderLanguage } from "../frontend/src/engine/reminderEmail.ts";

export const EMAIL_SCHEMA = `
  CREATE TABLE IF NOT EXISTS email_contacts (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    address TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'en',
    enabled BOOLEAN NOT NULL DEFAULT true,
    set_by TEXT,
    set_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_failure TEXT,
    last_failure_at TIMESTAMPTZ
  );
  CREATE TABLE IF NOT EXISTS email_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled BOOLEAN NOT NULL DEFAULT false,
    set_by TEXT,
    set_at TIMESTAMPTZ
  );
  CREATE TABLE IF NOT EXISTS email_log (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    day TEXT NOT NULL,
    slot TEXT NOT NULL,
    items INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL DEFAULT 'claimed',
    attempts INTEGER NOT NULL DEFAULT 1,
    message_id TEXT,
    error TEXT,
    subject TEXT,
    body TEXT,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ,
    UNIQUE (user_id, day, slot)
  );
  CREATE INDEX IF NOT EXISTS email_log_day_idx ON email_log (day);
  CREATE INDEX IF NOT EXISTS email_log_claimed_idx ON email_log (claimed_at);
`;
registerSchema(EMAIL_SCHEMA);

/** How long a line of the email log is kept. */
export const EMAIL_LOG_KEEP_DAYS = 60;

export type EmailState = "claimed" | "sent" | "failed" | "captured";

export interface EmailContact {
  userId: string;
  address: string;
  language: ReminderLanguage;
  enabled: boolean;
  /** The super admin who set it, by name. */
  setBy: string | null;
  setAt: string;
  /** The last send that failed, masked; cleared by the next that goes. */
  lastFailure: string | null;
  lastFailureAt: string | null;
}

export interface EmailSettings {
  /** The super admin's switch: off until switched on. */
  enabled: boolean;
  setBy: string | null;
  setAt: string | null;
}

export interface EmailLogRow {
  id: number;
  userId: string;
  /** The plant's date, YYYY-MM-DD. */
  day: string;
  /** morning, reminder or lastCall; "test-..." for a test email. */
  slot: string;
  /** How many open items the email listed. */
  items: number;
  state: EmailState;
  attempts: number;
  messageId: string | null;
  /** Why the last try failed, masked. */
  error: string | null;
  subject: string | null;
  /** The plain-text part, kept only when the email was captured (nothing left the PC). */
  body: string | null;
  claimedAt: string;
  sentAt: string | null;
}

/** One of a person's open notifications, as the ledger keeps it (the facts, never a sentence). */
export interface OpenItem {
  id: number;
  userId: string;
  kind: NotificationKind;
  key: string;
  priority: string;
  data: NotificationData;
}

export interface EmailFinish {
  state: "sent" | "captured" | "failed";
  messageId?: string | null;
  error?: string | null;
  subject?: string | null;
  body?: string | null;
  items?: number;
}

/** Where the reminder emails' rows are kept: PostgreSQL on the server (createDatabaseEmailStore); a test's stand-in otherwise. */
export interface EmailStore {
  settings(): Promise<EmailSettings>;
  setSettings(enabled: boolean, by: string): Promise<EmailSettings>;
  /** Every reminder email, on or off. */
  contacts(): Promise<EmailContact[]>;
  contactOf(userId: string): Promise<EmailContact | null>;
  /** Sets (or replaces) a person's reminder email; a new address forgets the old one's last failure. */
  setContact(c: { userId: string; address: string; language: ReminderLanguage; enabled: boolean; setBy: string }): Promise<EmailContact>;
  /** Answers whether there was one. */
  removeContact(userId: string): Promise<boolean>;
  /** The last failure to send to the person (masked), or null once a send has gone. */
  noteFailure(userId: string, failure: string | null): Promise<void>;
  /** The open notifications of these people, of these kinds, oldest first. */
  openItems(userIds: readonly string[], kinds: readonly string[]): Promise<OpenItem[]>;
  /** Every line of one plant day, every person. */
  logOfDay(day: string): Promise<EmailLogRow[]>;
  /** Claims the person's slot of the day: the new line's id, or null when another run has it already. */
  claim(row: { userId: string; day: string; slot: string; items: number }): Promise<number | null>;
  /** Claims a FAILED line again for one more try (attempts + 1), only while it has had fewer than `maxAttempts`. */
  claimRetry(id: number, maxAttempts: number): Promise<boolean>;
  finish(id: number, outcome: EmailFinish): Promise<void>;
  /** The newest lines first. */
  latest(limit: number): Promise<EmailLogRow[]>;
  /** Deletes the lines older than EMAIL_LOG_KEEP_DAYS. Answers how many went. */
  cleanUp(now: Date): Promise<number>;
}

// ---------------------------------------------------------------------------
// PostgreSQL

interface Queryable {
  query<R extends Record<string, unknown> = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }>;
}

const iso = (d: unknown): string | null => (d ? new Date(d as string | Date).toISOString() : null);

interface ContactRow extends Record<string, unknown> {
  user_id: string;
  address: string;
  language: string;
  enabled: boolean;
  set_by: string | null;
  set_at: Date;
  last_failure: string | null;
  last_failure_at: Date | null;
}

const CONTACT_COLUMNS = "user_id, address, language, enabled, set_by, set_at, last_failure, last_failure_at";

function contactOfRow(r: ContactRow): EmailContact {
  return {
    userId: r.user_id,
    address: r.address,
    language: isReminderLanguage(r.language) ? r.language : "en",
    enabled: r.enabled !== false,
    setBy: r.set_by ?? null,
    setAt: iso(r.set_at) ?? new Date(0).toISOString(),
    lastFailure: r.last_failure ?? null,
    lastFailureAt: iso(r.last_failure_at),
  };
}

interface LogRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  day: string;
  slot: string;
  items: number;
  state: string;
  attempts: number;
  message_id: string | null;
  error: string | null;
  subject: string | null;
  body: string | null;
  claimed_at: Date;
  sent_at: Date | null;
}

const LOG_COLUMNS = "id::text AS id, user_id, day, slot, items, state, attempts, message_id, error, subject, body, claimed_at, sent_at";
const STATES: readonly EmailState[] = ["claimed", "sent", "failed", "captured"];

function logOfRow(r: LogRow): EmailLogRow {
  return {
    id: Number(r.id),
    userId: r.user_id,
    day: r.day,
    slot: r.slot,
    items: Number(r.items) || 0,
    state: (STATES as readonly string[]).includes(r.state) ? (r.state as EmailState) : "failed",
    attempts: Number(r.attempts) || 0,
    messageId: r.message_id ?? null,
    error: r.error ?? null,
    subject: r.subject ?? null,
    body: r.body ?? null,
    claimedAt: iso(r.claimed_at) ?? new Date(0).toISOString(),
    sentAt: iso(r.sent_at),
  };
}

export function createDatabaseEmailStore(db: () => Queryable = () => database() as unknown as Queryable): EmailStore {
  return {
    async settings() {
      const { rows } = await db().query<{ enabled: boolean; set_by: string | null; set_at: Date | null }>("SELECT enabled, set_by, set_at FROM email_settings WHERE id = 1");
      const r = rows[0];
      return r ? { enabled: r.enabled === true, setBy: r.set_by ?? null, setAt: iso(r.set_at) } : { enabled: false, setBy: null, setAt: null };
    },

    async setSettings(enabled, by) {
      const { rows } = await db().query<{ enabled: boolean; set_by: string | null; set_at: Date | null }>(
        `INSERT INTO email_settings (id, enabled, set_by, set_at) VALUES (1, $1, $2, now())
         ON CONFLICT (id) DO UPDATE SET enabled = EXCLUDED.enabled, set_by = EXCLUDED.set_by, set_at = EXCLUDED.set_at
         RETURNING enabled, set_by, set_at`,
        [enabled, by]
      );
      return { enabled: rows[0]?.enabled === true, setBy: rows[0]?.set_by ?? null, setAt: iso(rows[0]?.set_at) };
    },

    async contacts() {
      const { rows } = await db().query<ContactRow>(`SELECT ${CONTACT_COLUMNS} FROM email_contacts ORDER BY set_at, user_id`);
      return rows.map(contactOfRow);
    },

    async contactOf(userId) {
      const { rows } = await db().query<ContactRow>(`SELECT ${CONTACT_COLUMNS} FROM email_contacts WHERE user_id = $1`, [userId]);
      return rows[0] ? contactOfRow(rows[0]) : null;
    },

    async setContact(c) {
      const { rows } = await db().query<ContactRow>(
        `INSERT INTO email_contacts (user_id, address, language, enabled, set_by, set_at) VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (user_id) DO UPDATE SET address = EXCLUDED.address, language = EXCLUDED.language, enabled = EXCLUDED.enabled,
           set_by = EXCLUDED.set_by, set_at = EXCLUDED.set_at,
           last_failure = CASE WHEN email_contacts.address = EXCLUDED.address THEN email_contacts.last_failure ELSE NULL END,
           last_failure_at = CASE WHEN email_contacts.address = EXCLUDED.address THEN email_contacts.last_failure_at ELSE NULL END
         RETURNING ${CONTACT_COLUMNS}`,
        [c.userId, c.address, c.language, c.enabled, c.setBy]
      );
      return contactOfRow(rows[0]);
    },

    async removeContact(userId) {
      const { rowCount } = await db().query("DELETE FROM email_contacts WHERE user_id = $1", [userId]);
      return (rowCount ?? 0) > 0;
    },

    async noteFailure(userId, failure) {
      await db().query("UPDATE email_contacts SET last_failure = $2, last_failure_at = CASE WHEN $2::text IS NULL THEN NULL ELSE now() END WHERE user_id = $1", [userId, failure]);
    },

    async openItems(userIds, kinds) {
      if (userIds.length === 0 || kinds.length === 0) return [];
      const { rows } = await db().query<{ id: string; user_id: string; kind: string; key: string; priority: string; data: unknown }>(
        `SELECT id::text AS id, user_id, kind, key, priority, data FROM notifications
          WHERE user_id = ANY($1::text[]) AND resolved_at IS NULL AND kind = ANY($2::text[])
          ORDER BY notifications.id`,
        [[...userIds], [...kinds]]
      );
      return rows.map((r) => ({
        id: Number(r.id),
        userId: r.user_id,
        kind: r.kind as NotificationKind,
        key: r.key,
        priority: r.priority,
        data: (r.data && typeof r.data === "object" ? r.data : {}) as NotificationData,
      }));
    },

    async logOfDay(day) {
      // By the table's id: a bare "id" would be the text column of the same name in the list, which sorts 10 before 9.
      const { rows } = await db().query<LogRow>(`SELECT ${LOG_COLUMNS} FROM email_log WHERE day = $1 ORDER BY email_log.id`, [day]);
      return rows.map(logOfRow);
    },

    async claim(row) {
      const { rows } = await db().query<{ id: string }>(
        `INSERT INTO email_log (user_id, day, slot, items, state, attempts) VALUES ($1, $2, $3, $4, 'claimed', 1)
         ON CONFLICT (user_id, day, slot) DO NOTHING RETURNING id::text AS id`,
        [row.userId, row.day, row.slot, row.items]
      );
      return rows[0] ? Number(rows[0].id) : null;
    },

    async claimRetry(id, maxAttempts) {
      const { rowCount } = await db().query(
        "UPDATE email_log SET state = 'claimed', attempts = attempts + 1, claimed_at = now() WHERE id = $1 AND state = 'failed' AND attempts < $2",
        [String(id), maxAttempts]
      );
      return (rowCount ?? 0) > 0;
    },

    async finish(id, o) {
      await db().query(
        `UPDATE email_log SET state = $2, message_id = COALESCE($3, message_id), error = $4, subject = COALESCE($5, subject), body = $6,
                items = COALESCE($7, items), sent_at = CASE WHEN $2 IN ('sent', 'captured') THEN now() ELSE sent_at END
          WHERE id = $1`,
        [String(id), o.state, o.messageId ?? null, o.error ?? null, o.subject ?? null, o.body ?? null, typeof o.items === "number" ? o.items : null]
      );
    },

    async latest(limit) {
      const { rows } = await db().query<LogRow>(`SELECT ${LOG_COLUMNS} FROM email_log ORDER BY email_log.id DESC LIMIT $1`, [limit]);
      return rows.map(logOfRow);
    },

    async cleanUp(now) {
      const { rowCount } = await db().query("DELETE FROM email_log WHERE claimed_at < $1", [new Date(now.getTime() - EMAIL_LOG_KEEP_DAYS * 86_400_000)]);
      return rowCount ?? 0;
    },
  };
}

let shared: EmailStore | null = null;
/** The server's email store, over its database. */
export function databaseEmailStore(): EmailStore {
  return (shared ??= createDatabaseEmailStore());
}
