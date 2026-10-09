// HOW THE WEBSITE SHOWS THE NOTIFICATION LEDGER (REQUIREMENTS §97): grouped by day, newest first, and where each one
// opens. Pure: the bell (components/layout/NotificationBell.tsx) and the Notifications page (pages/NotificationsPage.tsx)
// read it, and frontend/tests/notificationView.test.ts holds it.
//
// The owner, 8-Oct-2026: "the responsible person for that particular document will receive a notification in mobile as
// well as in our audit software." The server keeps the ledger and words each item in the language asked
// (GET /api/notifications); this file never words a notification itself.

/** The few fields of an item this file reads (api/client.ts NotificationItem fits). */
export interface ViewItem {
  id: number;
  kind: string;
  createdAt: string;
  readAt: string | null;
  resolvedAt: string | null;
  data: { documentId?: string; recordId?: string } | null | undefined;
}

export interface DayGroup<T extends ViewItem> {
  /** YYYY-MM-DD on this computer's calendar, which in the plant's browsers is the plant's. */
  day: string;
  items: T[];
}

/** An ISO moment as this computer's calendar date. */
export function localDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The items by the day each arrived, newest day first and newest first within a day. Never changes what it was given. */
export function groupByDay<T extends ViewItem>(items: readonly T[]): DayGroup<T>[] {
  const sorted = items.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id - a.id));
  const groups: DayGroup<T>[] = [];
  for (const item of sorted) {
    const day = localDay(item.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}

/** A further page appended to what is shown: once each, by id. */
export function appendPage<T extends ViewItem>(shown: readonly T[], page: readonly T[]): T[] {
  const have = new Set(shown.map((i) => i.id));
  return [...shown, ...page.filter((i) => !have.has(i.id))];
}

/** The id to ask for the page after these (the oldest shown), or undefined when nothing is shown. */
export function nextBefore(shown: readonly ViewItem[]): number | undefined {
  if (shown.length === 0) return undefined;
  return shown.reduce((min, i) => (i.id < min ? i.id : min), shown[0].id);
}

/**
 * WHERE AN ITEM OPENS: its record when it names one (on the record's own page for its kind), else its document's page,
 * else the screen its kind belongs to: the boss's summaries the dashboard, an escalation the scorecard, a change of
 * access the library (what the person now sees). `routeOf` gives a record's and a document's routes (engine/reminders.ts
 * routeForRecord, engine/documentRoutes.ts documentOpenRoute), so this file reads no repository.
 */
export function notificationRoute(
  item: Pick<ViewItem, "kind" | "data">,
  routeOf: { record: (documentId: string | undefined, recordId: string) => string; document: (documentId: string) => string | null }
): string {
  const data = item.data ?? {};
  if (data.recordId) return routeOf.record(data.documentId, data.recordId);
  if (data.documentId) {
    const doc = routeOf.document(data.documentId);
    if (doc) return doc;
  }
  switch (item.kind) {
    case "boss_summary":
      return "/dashboard";
    case "escalation":
      return "/performance";
    case "access_changed":
      return "/library";
    default:
      return "/notifications";
  }
}

/** What a run of the server's jobs answers (api/client.ts JobRun fits): the job's own figures. */
export interface JobRunView {
  job: string;
  outcome: string;
  result?: { prepared?: number; modules?: { module: string | null; count: number }[]; planned?: number; written?: number; resolved?: number; push?: string } | null;
}

/**
 * THE LINE A RUN OF THE SERVER'S JOBS IS TOLD IN (the super admin's Notifications page, REQUIREMENTS §97): how many
 * records were prepared and in which modules, or how many notifications were worked out, from the job's own figures,
 * in the words `say` gives (the page's i18n strings). The push's own line is the server's, as the activity log has it.
 */
export function jobRunWords(run: JobRunView, say: (key: string, vars?: Record<string, string | number>) => string, moduleWords: (code: string) => string): string[] {
  const r = run.result ?? {};
  if (run.job === "morning-prepare") {
    const n = typeof r.prepared === "number" ? r.prepared : 0;
    if (n === 0) return [say("jobs.prepared.none")];
    const modules = (r.modules ?? []).map((m) => `${m.module ? moduleWords(m.module) : "-"} ${m.count}`).join(", ");
    return [say(n === 1 ? "jobs.prepared.one" : "jobs.prepared.many", { n, modules })];
  }
  if (run.job === "notify") {
    const lines = [say("jobs.notified", { n: r.planned ?? 0, written: r.written ?? 0, resolved: r.resolved ?? 0 })];
    if (typeof r.push === "string" && r.push) lines.push(say("jobs.phones", { push: r.push }));
    return lines;
  }
  return [run.outcome];
}

/** The language the ledger is asked for: the one the person chose for the screens (Gujarati or English). */
export const ledgerLanguage = (chosen: string): "en" | "gu" => (chosen === "gu" ? "gu" : "en");

/** Marks these as read in what is shown (after POST /api/notifications/read). */
export function markedRead<T extends ViewItem>(shown: readonly T[], ids: readonly number[] | "all", at: string): T[] {
  const set = ids === "all" ? null : new Set(ids);
  return shown.map((i) => (i.readAt === null && (set === null || set.has(i.id)) ? { ...i, readAt: at } : i));
}
