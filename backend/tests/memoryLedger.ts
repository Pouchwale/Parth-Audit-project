// A STAND-IN FOR THE NOTIFICATION LEDGER (backend/notifications.ts), in memory, for the unit tests: the same rules as the
// PostgreSQL ledger, which backend/tests/notificationLedger.test.ts holds the two to (the PostgreSQL one when
// DCRS_LEDGER_TEST_URL names a database). Not a test file itself.
import { KEEP_DAYS, preferencesOf, type Device, type LedgerItem, type NotificationLedger, type PushPerson, type StoredNotification } from "../notifications.ts";

export interface MemoryLedger extends NotificationLedger {
  rows: StoredNotification[];
  devices: Device[];
  tickets: { id: string; token: string; createdAt: number }[];
  /** The clock the stand-in stamps rows with; a test may move it. */
  now: () => Date;
}

export function createMemoryLedger(clock: () => Date = () => new Date()): MemoryLedger {
  const rows: StoredNotification[] = [];
  const devices: Device[] = [];
  const prefs = new Map<string, { kinds: Record<string, boolean>; reminders?: boolean }>();
  const tickets: { id: string; token: string; createdAt: number }[] = [];
  let lastId = 0;
  const stamp = () => clock().toISOString();
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  const upsert = (items: readonly LedgerItem[]): number => {
    let written = 0;
    for (const x of items) {
      const row = rows.find((r) => r.userId === x.userId && r.key === x.key);
      if (!row) {
        const now = stamp();
        rows.push({ ...x, data: JSON.parse(JSON.stringify(x.data ?? {})), id: ++lastId, createdAt: now, updatedAt: now, readAt: null, resolvedAt: null, pushedAt: null, pushAttempts: 0 });
        written += 1;
        continue;
      }
      if (row.kind === "boss_summary") continue;
      const reopened = row.resolvedAt !== null;
      if (!reopened && same(row.data, x.data) && row.priority === x.priority && row.kind === x.kind) continue;
      const now = stamp();
      Object.assign(row, { kind: x.kind, priority: x.priority, data: JSON.parse(JSON.stringify(x.data ?? {})), updatedAt: now });
      if (reopened) Object.assign(row, { createdAt: now, readAt: null, pushedAt: null, resolvedAt: null });
      written += 1;
    }
    return written;
  };

  const ledger: MemoryLedger = {
    rows,
    devices,
    tickets,
    now: clock,
    async sync(items, scope) {
      const written = upsert(items);
      const planned = new Set(items.map((x) => `${x.userId}\u0000${x.key}`));
      let resolved = 0;
      for (const r of rows) {
        if (r.resolvedAt === null && scope.kinds.includes(r.kind) && scope.users.includes(r.userId) && !planned.has(`${r.userId}\u0000${r.key}`)) {
          r.resolvedAt = stamp();
          resolved += 1;
        }
      }
      return { written, resolved };
    },
    async add(item) {
      upsert([item]);
    },
    async list(userId, opts) {
      const mine = rows.filter((r) => r.userId === userId);
      const items = mine
        .filter((r) => (opts.state === "all" || r.resolvedAt === null) && (opts.before === undefined || r.id < opts.before))
        .sort((a, b) => b.id - a.id)
        .slice(0, opts.limit)
        .map((r) => ({ ...r, data: JSON.parse(JSON.stringify(r.data)) }));
      return { items, open: mine.filter((r) => r.resolvedAt === null).length, unread: mine.filter((r) => r.resolvedAt === null && r.readAt === null).length };
    },
    async markRead(userId, which) {
      for (const r of rows) {
        if (r.userId !== userId || (which !== "all" && !which.includes(r.id))) continue;
        r.readAt ??= stamp();
        if (r.kind === "access_changed") r.resolvedAt ??= stamp();
      }
      return rows.filter((r) => r.userId === userId && r.resolvedAt === null && r.readAt === null).length;
    },
    async cleanUp(now) {
      const cutoff = now.getTime() - KEEP_DAYS * 86_400_000;
      const before = rows.length;
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].resolvedAt !== null && Date.parse(rows[i].resolvedAt!) < cutoff) rows.splice(i, 1);
      for (let i = tickets.length - 1; i >= 0; i--) if (tickets[i].createdAt < now.getTime() - 86_400_000) tickets.splice(i, 1);
      return before - rows.length;
    },
    async registerDevice(userId, d) {
      const i = devices.findIndex((x) => x.token === d.token);
      const device: Device = { token: d.token, userId, platform: d.platform, language: d.language, appVersion: d.appVersion ?? "", deviceName: d.deviceName ?? "" };
      if (i >= 0) devices[i] = device;
      else devices.push(device);
    },
    async removeDevice(userId, token) {
      const i = devices.findIndex((x) => x.token === token && x.userId === userId);
      if (i >= 0) devices.splice(i, 1);
    },
    async forgetToken(token) {
      const i = devices.findIndex((x) => x.token === token);
      if (i >= 0) devices.splice(i, 1);
    },
    async devicesOf(userId) {
      return devices.filter((d) => d.userId === userId).map((d) => ({ ...d }));
    },
    async getPreferences(userId) {
      const p = prefs.get(userId);
      return preferencesOf(p?.kinds, p?.reminders);
    },
    async setPreferences(userId, change) {
      const p = prefs.get(userId) ?? { kinds: {} };
      p.kinds = { ...p.kinds, ...(change.kinds ?? {}) } as Record<string, boolean>;
      if (typeof change.reminders === "boolean") p.reminders = change.reminders;
      prefs.set(userId, p);
      return preferencesOf(p.kinds, p.reminders);
    },
    async pushPeople(dayStart) {
      const users = Array.from(new Set(devices.map((d) => d.userId)));
      return users.map((userId): PushPerson => {
        const pushedToday: PushPerson["pushedToday"] = {};
        for (const r of rows) {
          if (r.userId !== userId || !r.pushedAt || Date.parse(r.pushedAt) < dayStart.getTime()) continue;
          if (!pushedToday[r.kind] || pushedToday[r.kind]! < r.pushedAt) pushedToday[r.kind] = r.pushedAt;
        }
        const p = prefs.get(userId);
        return {
          userId,
          devices: devices.filter((d) => d.userId === userId).map((d) => ({ ...d })),
          prefs: preferencesOf(p?.kinds, p?.reminders),
          open: rows.filter((r) => r.userId === userId && r.resolvedAt === null).sort((a, b) => a.id - b.id).map((r) => ({ ...r })),
          pushedToday,
        };
      });
    },
    async markPushed(ids, at) {
      for (const r of rows) if (ids.includes(r.id)) Object.assign(r, { pushedAt: at.toISOString(), pushAttempts: r.pushAttempts + 1 });
    },
    async addTickets(list) {
      for (const t of list) if (!tickets.some((x) => x.id === t.id)) tickets.push({ ...t, createdAt: clock().getTime() });
    },
    async ticketsBefore(before, limit) {
      return tickets.filter((t) => t.createdAt < before.getTime()).slice(0, limit).map(({ id, token }) => ({ id, token }));
    },
    async dropTickets(ids) {
      for (let i = tickets.length - 1; i >= 0; i--) if (ids.includes(tickets[i].id)) tickets.splice(i, 1);
    },
  };
  return ledger;
}
