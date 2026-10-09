// THE NOTIFICATION LEDGER (REQUIREMENTS §97): each person's notifications, the phones they are pushed to, and what each
// person wants pushed, kept in PostgreSQL (§55: nowhere else).
//
// LANGUAGE-NEUTRAL. A notification is stored as facts (frontend/src/engine/notificationPlan.ts NotificationData) and
// worded on every read in the language asked (engine/notificationText.ts): the bell, the phone's inbox and the push say
// the same thing, and a person who changes language reads every notification in the new one.
//
// ONE PER (PERSON, KEY). The notify job (backend/notificationJobs.ts) hands in the whole plan every few minutes; each
// item is upserted by its key ("ready|<recordId>", "due|<documentId>|<date>" ...), and an open item of a planned kind
// the plan no longer has is RESOLVED: the record moved on. An item that comes back after it was resolved (a record
// reopened) is opened again as new. A row is written only when something about it changed, so a quiet plant writes
// nothing every five minutes. The super admin's summaries are written once: the morning's says the morning's counts.
//
// NOBODY READS ANOTHER PERSON'S ITEMS: every read and every "mark read" names the person, from the session.
//
// KEPT 60 DAYS after an item is resolved (cleanUp); a push's ticket a day.
//
// THE TABLES (docs/DEPLOYMENT.md), DCRS's own in the shared database (REQUIREMENTS §83: no role of the Audit Assistant
// is granted them):
//   notifications       one row per person and key: the kind, the priority, the facts (data), when it was made,
//                       changed, read, resolved and last pushed, and how many pushes it has been in
//   push_devices        one row per phone token: whose it is, the platform and the language its pushes are worded in
//   notification_prefs  one row per person: the kinds they switched off for pushing, and the phone's own reminders
//   push_tickets        the tickets Expo's push service answered with, until their receipts are read (backend/push.ts)
import { database, registerSchema } from "./db.ts";
import { NOTIFICATION_KINDS, type NotificationData, type NotificationKind } from "../frontend/src/engine/notificationPlan.ts";

export const NOTIFICATION_SCHEMA = `
  CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    key TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'medium',
    data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    pushed_at TIMESTAMPTZ,
    push_attempts INTEGER NOT NULL DEFAULT 0,
    UNIQUE (user_id, key)
  );
  CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, id DESC);
  CREATE INDEX IF NOT EXISTS notifications_open_idx ON notifications (user_id) WHERE resolved_at IS NULL;
  CREATE INDEX IF NOT EXISTS notifications_resolved_idx ON notifications (resolved_at) WHERE resolved_at IS NOT NULL;
  CREATE TABLE IF NOT EXISTS push_devices (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'en',
    app_version TEXT NOT NULL DEFAULT '',
    device_name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS push_devices_user_idx ON push_devices (user_id);
  CREATE TABLE IF NOT EXISTS notification_prefs (
    user_id TEXT PRIMARY KEY,
    kinds JSONB NOT NULL DEFAULT '{}',
    reminders BOOLEAN,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS push_tickets (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;
registerSchema(NOTIFICATION_SCHEMA);

/** How long a resolved notification is kept. */
export const KEEP_DAYS = 60;

export type NotificationLanguage = "en" | "hi" | "gu";
export type NotificationPriority = "high" | "medium" | "low";

/** One item as the plan gives it, or as a route writes one (access_changed). */
export interface LedgerItem {
  userId: string;
  kind: NotificationKind;
  key: string;
  priority: NotificationPriority;
  data: NotificationData;
}

/** One item as it is stored. */
export interface StoredNotification extends LedgerItem {
  id: number;
  createdAt: string;
  updatedAt: string;
  readAt: string | null;
  resolvedAt: string | null;
  pushedAt: string | null;
  pushAttempts: number;
}

export interface DeviceInput {
  token: string;
  platform: "android" | "ios";
  language: NotificationLanguage;
  appVersion?: string;
  deviceName?: string;
}

export interface Device extends DeviceInput {
  userId: string;
}

export interface Preferences {
  /** Every kind, true unless the person switched it off. */
  kinds: Record<NotificationKind, boolean>;
  /** The phone's own reminders; absent until the person chooses. */
  reminders?: boolean;
}

export interface PreferencesChange {
  kinds?: Partial<Record<NotificationKind, boolean>>;
  reminders?: boolean;
}

/** What the push planner needs of one person (backend/push.ts). */
export interface PushPerson {
  userId: string;
  devices: Device[];
  prefs: Preferences;
  /** The person's open items. */
  open: StoredNotification[];
  /** The latest push today, by kind (an item resolved since still counts). */
  pushedToday: Partial<Record<NotificationKind, string>>;
}

export interface ListOptions {
  state: "open" | "all";
  limit: number;
  before?: number;
}

/** Where the notifications are kept: PostgreSQL on the server (createDatabaseLedger); a test's stand-in in the unit tests. */
export interface NotificationLedger {
  /** Upserts the plan and resolves the open items of `kinds`, for `users`, that it no longer has. */
  sync(items: readonly LedgerItem[], scope: { kinds: readonly NotificationKind[]; users: readonly string[] }): Promise<{ written: number; resolved: number }>;
  /** Upserts one item (a route's own: access_changed). */
  add(item: LedgerItem): Promise<void>;
  list(userId: string, opts: ListOptions): Promise<{ items: StoredNotification[]; unread: number; open: number }>;
  /** Marks the person's own items read (the ones named, or all); an access_changed item read is resolved. Answers the unread count. */
  markRead(userId: string, which: readonly number[] | "all"): Promise<number>;
  /** Deletes what was resolved more than KEEP_DAYS ago, and tickets a day old. Answers how many notifications went. */
  cleanUp(now: Date): Promise<number>;
  registerDevice(userId: string, device: DeviceInput): Promise<void>;
  removeDevice(userId: string, token: string): Promise<void>;
  /** A token Expo says is no longer registered: forgotten, whoever had it. */
  forgetToken(token: string): Promise<void>;
  devicesOf(userId: string): Promise<Device[]>;
  getPreferences(userId: string): Promise<Preferences>;
  setPreferences(userId: string, change: PreferencesChange): Promise<Preferences>;
  /** Everybody with a phone, with their open items, their choices and today's pushes (since `dayStart`). */
  pushPeople(dayStart: Date): Promise<PushPerson[]>;
  markPushed(ids: readonly number[], at: Date): Promise<void>;
  addTickets(tickets: readonly { id: string; token: string }[]): Promise<void>;
  /** Tickets made before `before`, oldest first. */
  ticketsBefore(before: Date, limit: number): Promise<{ id: string; token: string }[]>;
  dropTickets(ids: readonly string[]): Promise<void>;
}

/** Every kind on, then the person's own choices over it. */
export function preferencesOf(kinds: unknown, reminders: unknown): Preferences {
  const out = Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, true])) as Record<NotificationKind, boolean>;
  if (kinds && typeof kinds === "object" && !Array.isArray(kinds)) {
    for (const [k, v] of Object.entries(kinds as Record<string, unknown>)) if ((NOTIFICATION_KINDS as readonly string[]).includes(k) && typeof v === "boolean") out[k as NotificationKind] = v;
  }
  return { kinds: out, ...(typeof reminders === "boolean" ? { reminders } : {}) };
}

// ---------------------------------------------------------------------------
// PostgreSQL

interface Queryable {
  query<R extends Record<string, unknown> = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }>;
}

interface Row extends Record<string, unknown> {
  id: string;
  user_id: string;
  kind: string;
  key: string;
  priority: string;
  data: unknown;
  created_at: Date;
  updated_at: Date;
  read_at: Date | null;
  resolved_at: Date | null;
  pushed_at: Date | null;
  push_attempts: number;
}

const COLUMNS = "id::text AS id, user_id, kind, key, priority, data, created_at, updated_at, read_at, resolved_at, pushed_at, push_attempts";
const iso = (d: Date | null): string | null => (d ? new Date(d).toISOString() : null);

function fromRow(r: Row): StoredNotification {
  return {
    id: Number(r.id),
    userId: r.user_id,
    kind: r.kind as NotificationKind,
    key: r.key,
    priority: r.priority as NotificationPriority,
    data: (r.data && typeof r.data === "object" ? r.data : {}) as NotificationData,
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
    readAt: iso(r.read_at),
    resolvedAt: iso(r.resolved_at),
    pushedAt: iso(r.pushed_at),
    pushAttempts: Number(r.push_attempts) || 0,
  };
}

/** The items in batches of this many per statement. */
const BATCH = 500;

// THE UPSERT. A conflict on (user, key) updates the row only when something changed, or it was resolved (it is then
// opened again as new: unread, not pushed). A summary is never rewritten.
const UPSERT = `
  INSERT INTO notifications (user_id, kind, key, priority, data)
  SELECT u, k, y, p, d::jsonb FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[]) AS x(u, k, y, p, d)
  ON CONFLICT (user_id, key) DO UPDATE SET
    kind = EXCLUDED.kind,
    priority = EXCLUDED.priority,
    data = EXCLUDED.data,
    updated_at = now(),
    created_at = CASE WHEN notifications.resolved_at IS NULL THEN notifications.created_at ELSE now() END,
    read_at = CASE WHEN notifications.resolved_at IS NULL THEN notifications.read_at ELSE NULL END,
    pushed_at = CASE WHEN notifications.resolved_at IS NULL THEN notifications.pushed_at ELSE NULL END,
    resolved_at = NULL
  WHERE notifications.kind <> 'boss_summary'
    AND (notifications.resolved_at IS NOT NULL OR notifications.data IS DISTINCT FROM EXCLUDED.data OR notifications.priority <> EXCLUDED.priority OR notifications.kind <> EXCLUDED.kind)`;

export function createDatabaseLedger(db: () => Queryable = () => database() as unknown as Queryable): NotificationLedger {
  const upsert = async (items: readonly LedgerItem[]): Promise<number> => {
    let written = 0;
    for (let i = 0; i < items.length; i += BATCH) {
      const part = items.slice(i, i + BATCH);
      const { rowCount } = await db().query(UPSERT, [
        part.map((x) => x.userId),
        part.map((x) => x.kind),
        part.map((x) => x.key),
        part.map((x) => x.priority),
        part.map((x) => JSON.stringify(x.data ?? {})),
      ]);
      written += rowCount ?? 0;
    }
    return written;
  };

  return {
    async sync(items, scope) {
      const written = await upsert(items);
      if (scope.kinds.length === 0 || scope.users.length === 0) return { written, resolved: 0 };
      const { rowCount } = await db().query(
        `UPDATE notifications SET resolved_at = now()
          WHERE resolved_at IS NULL AND kind = ANY($1::text[]) AND user_id = ANY($2::text[])
            AND NOT EXISTS (SELECT 1 FROM unnest($3::text[], $4::text[]) AS p(u, k) WHERE p.u = notifications.user_id AND p.k = notifications.key)`,
        [scope.kinds, scope.users, items.map((x) => x.userId), items.map((x) => x.key)]
      );
      return { written, resolved: rowCount ?? 0 };
    },

    async add(item) {
      await upsert([item]);
    },

    async list(userId, opts) {
      const { rows } = await db().query<Row>(
        `SELECT ${COLUMNS} FROM notifications
          WHERE user_id = $1 AND ($2::text = 'all' OR resolved_at IS NULL) AND ($3::bigint IS NULL OR id < $3::bigint)
          ORDER BY id DESC LIMIT $4`,
        [userId, opts.state, opts.before ?? null, opts.limit]
      );
      const counts = await db().query<{ open: string; unread: string }>(
        `SELECT count(*) FILTER (WHERE resolved_at IS NULL)::text AS open, count(*) FILTER (WHERE resolved_at IS NULL AND read_at IS NULL)::text AS unread
           FROM notifications WHERE user_id = $1`,
        [userId]
      );
      return { items: rows.map(fromRow), open: Number(counts.rows[0]?.open ?? 0), unread: Number(counts.rows[0]?.unread ?? 0) };
    },

    async markRead(userId, which) {
      const all = which === "all";
      const ids = all ? [] : which.map((n) => String(n));
      await db().query(
        `UPDATE notifications SET read_at = COALESCE(read_at, now()),
                resolved_at = CASE WHEN kind = 'access_changed' AND resolved_at IS NULL THEN now() ELSE resolved_at END
          WHERE user_id = $1 AND (read_at IS NULL OR (kind = 'access_changed' AND resolved_at IS NULL)) AND ($2::boolean OR id = ANY($3::bigint[]))`,
        [userId, all, ids]
      );
      const { rows } = await db().query<{ unread: string }>("SELECT count(*)::text AS unread FROM notifications WHERE user_id = $1 AND resolved_at IS NULL AND read_at IS NULL", [userId]);
      return Number(rows[0]?.unread ?? 0);
    },

    async cleanUp(now) {
      const cutoff = new Date(now.getTime() - KEEP_DAYS * 86_400_000);
      const { rowCount } = await db().query("DELETE FROM notifications WHERE resolved_at IS NOT NULL AND resolved_at < $1", [cutoff]);
      await db().query("DELETE FROM push_tickets WHERE created_at < $1", [new Date(now.getTime() - 86_400_000)]);
      return rowCount ?? 0;
    },

    async registerDevice(userId, d) {
      await db().query(
        `INSERT INTO push_devices (token, user_id, platform, language, app_version, device_name) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, language = EXCLUDED.language,
           app_version = EXCLUDED.app_version, device_name = EXCLUDED.device_name, last_seen_at = now()`,
        [d.token, userId, d.platform, d.language, d.appVersion ?? "", d.deviceName ?? ""]
      );
    },

    async removeDevice(userId, token) {
      await db().query("DELETE FROM push_devices WHERE token = $1 AND user_id = $2", [token, userId]);
    },

    async forgetToken(token) {
      await db().query("DELETE FROM push_devices WHERE token = $1", [token]);
    },

    async devicesOf(userId) {
      const { rows } = await db().query<{ token: string; user_id: string; platform: string; language: string; app_version: string; device_name: string }>(
        "SELECT token, user_id, platform, language, app_version, device_name FROM push_devices WHERE user_id = $1 ORDER BY created_at",
        [userId]
      );
      return rows.map((r) => ({ token: r.token, userId: r.user_id, platform: r.platform as Device["platform"], language: r.language as NotificationLanguage, appVersion: r.app_version, deviceName: r.device_name }));
    },

    async getPreferences(userId) {
      const { rows } = await db().query<{ kinds: unknown; reminders: boolean | null }>("SELECT kinds, reminders FROM notification_prefs WHERE user_id = $1", [userId]);
      return preferencesOf(rows[0]?.kinds, rows[0]?.reminders);
    },

    async setPreferences(userId, change) {
      const { rows } = await db().query<{ kinds: unknown; reminders: boolean | null }>(
        `INSERT INTO notification_prefs (user_id, kinds, reminders) VALUES ($1, $2::jsonb, $3)
         ON CONFLICT (user_id) DO UPDATE SET kinds = notification_prefs.kinds || EXCLUDED.kinds,
           reminders = COALESCE(EXCLUDED.reminders, notification_prefs.reminders), updated_at = now()
         RETURNING kinds, reminders`,
        [userId, JSON.stringify(change.kinds ?? {}), typeof change.reminders === "boolean" ? change.reminders : null]
      );
      return preferencesOf(rows[0]?.kinds, rows[0]?.reminders);
    },

    async pushPeople(dayStart) {
      const devices = await db().query<{ token: string; user_id: string; platform: string; language: string; app_version: string; device_name: string }>(
        "SELECT token, user_id, platform, language, app_version, device_name FROM push_devices ORDER BY created_at"
      );
      if (devices.rows.length === 0) return [];
      const users = Array.from(new Set(devices.rows.map((d) => d.user_id)));
      const [open, pushed, prefs] = await Promise.all([
        db().query<Row>(`SELECT ${COLUMNS} FROM notifications WHERE user_id = ANY($1::text[]) AND resolved_at IS NULL ORDER BY id`, [users]),
        db().query<{ user_id: string; kind: string; at: Date }>(
          "SELECT user_id, kind, max(pushed_at) AS at FROM notifications WHERE user_id = ANY($1::text[]) AND pushed_at >= $2 GROUP BY user_id, kind",
          [users, dayStart]
        ),
        db().query<{ user_id: string; kinds: unknown; reminders: boolean | null }>("SELECT user_id, kinds, reminders FROM notification_prefs WHERE user_id = ANY($1::text[])", [users]),
      ]);
      return users.map((userId) => {
        const pref = prefs.rows.find((p) => p.user_id === userId);
        const pushedToday: Partial<Record<NotificationKind, string>> = {};
        for (const p of pushed.rows) if (p.user_id === userId) pushedToday[p.kind as NotificationKind] = new Date(p.at).toISOString();
        return {
          userId,
          devices: devices.rows
            .filter((d) => d.user_id === userId)
            .map((d) => ({ token: d.token, userId, platform: d.platform as Device["platform"], language: d.language as NotificationLanguage, appVersion: d.app_version, deviceName: d.device_name })),
          prefs: preferencesOf(pref?.kinds, pref?.reminders),
          open: open.rows.filter((r) => r.user_id === userId).map(fromRow),
          pushedToday,
        };
      });
    },

    async markPushed(ids, at) {
      if (ids.length === 0) return;
      await db().query("UPDATE notifications SET pushed_at = $2, push_attempts = push_attempts + 1 WHERE id = ANY($1::bigint[])", [ids.map(String), at]);
    },

    async addTickets(tickets) {
      if (tickets.length === 0) return;
      await db().query(
        "INSERT INTO push_tickets (id, token) SELECT i, t FROM unnest($1::text[], $2::text[]) AS x(i, t) ON CONFLICT (id) DO NOTHING",
        [tickets.map((t) => t.id), tickets.map((t) => t.token)]
      );
    },

    async ticketsBefore(before, limit) {
      const { rows } = await db().query<{ id: string; token: string }>("SELECT id, token FROM push_tickets WHERE created_at < $1 ORDER BY created_at LIMIT $2", [before, limit]);
      return rows;
    },

    async dropTickets(ids) {
      if (ids.length === 0) return;
      await db().query("DELETE FROM push_tickets WHERE id = ANY($1::text[])", [ids]);
    },
  };
}

let shared: NotificationLedger | null = null;
/** The server's ledger, over its database. */
export function databaseLedger(): NotificationLedger {
  return (shared ??= createDatabaseLedger());
}
