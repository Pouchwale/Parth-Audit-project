import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiBell, FiCheck, FiMail, FiPlay, FiRefreshCw } from "react-icons/fi";
import { ApiError, emailApi, escalationsApi, notificationsApi, NOTIFICATIONS_CHANGED, type EmailLogLine, type EmailSettingsAnswer, type NotificationItem, type ServerJob } from "../api/client";
import { useAuth } from "../store/AuthContext";
import { useRouter } from "../store/router";
import { useLanguage, useT } from "../i18n";
import { documentRepository } from "../data/repositories/documentRepository";
import { routeForRecord } from "../engine/reminders";
import { documentOpenRoute } from "../engine/documentRoutes";
import { appendPage, groupByDay, jobRunWords, ledgerLanguage, markedRead, nextBefore, notificationRoute } from "../engine/notificationView";
import { moduleName } from "../engine/notificationText";
import { addDays, formatDisplayDate, formatDisplayDateTime, todayISO } from "../utils/date";

// NOTIFICATIONS — /notifications (REQUIREMENTS §97), under the bell's "See all".
//
// The owner, 8-Oct-2026: "according to module, the responsible person for that particular document will receive a
// notification in mobile as well as in our audit software." The server keeps each person's notifications (the ledger,
// GET /api/notifications) and words them in the language asked; this page shows them by day, the unread marked, each
// opening its record (or its document, or the screen its kind belongs to), with "Mark all read". The super admin's
// include the morning and evening summaries by module and the escalations. A page at a time (30), the older ones on
// "Show older": nothing walks every record while drawing (§65).

const PAGE = 30;

/** Where an item opens, from the documents as this browser has them. */
export function routeForNotification(item: Pick<NotificationItem, "kind" | "data">): string {
  return notificationRoute(item, {
    record: (documentId, recordId) => routeForRecord(documentId ? documentRepository.getByIdUnscoped(documentId) : undefined, recordId),
    document: (documentId) => {
      const doc = documentRepository.getByIdUnscoped(documentId);
      return doc ? documentOpenRoute(doc) : null;
    },
  });
}

/** "Today", "Yesterday" or the date. */
function dayLabel(day: string, t: (k: string) => string): string {
  const today = todayISO();
  if (day === today) return t("notif.today");
  if (day === addDays(today, -1)) return t("notif.yesterday");
  return formatDisplayDate(day);
}

const timeOf = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** One notification: its title and body as the server worded them, unread marked; a click opens it. */
export function NotificationRow({ item, onOpen, compact = false, lang }: { item: NotificationItem; onOpen: (item: NotificationItem) => void; compact?: boolean; lang: "en" | "gu" }) {
  const t = useT();
  const unread = item.readAt === null;
  const modules = item.kind === "boss_summary" && !compact ? item.data?.modules ?? [] : [];
  return (
    <div className="notif-entry">
      <button
        type="button"
        className="notif-item"
        data-notification={item.id}
        data-kind={item.kind}
        data-unread={unread ? "yes" : "no"}
        data-priority-level={item.priority}
        data-resolved={item.resolvedAt ? "yes" : "no"}
        onClick={() => onOpen(item)}
      >
        <span className="notif-dot" aria-hidden="true" />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="notif-title block" translate="no">
            {item.title}
          </span>
          {item.body && (
            <span className="notif-body block" translate="no">
              {item.body}
            </span>
          )}
          <span className="notif-when block">
            {timeOf(item.createdAt)}
            {item.resolvedAt ? ` · ${t("notif.done")}` : ""}
            {unread ? <span className="sr-only"> · {t("notif.unreadOne")}</span> : null}
          </span>
        </span>
      </button>
      {modules.length > 0 && (
        <div className="doc-table compact mt-2" data-section="boss-summary-modules">
          <table>
            <thead>
              <tr>
                <th>{t("notif.summary.module")}</th>
                <th>{t("notif.summary.ready")}</th>
                <th>{t("notif.summary.needsInput")}</th>
                <th>{t("notif.summary.awaiting")}</th>
                <th>{t("notif.summary.notSubmitted")}</th>
                <th>{t("notif.summary.overdue")}</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((m) => (
                <tr key={m.module} data-summary-module={m.module}>
                  <td translate="no">{moduleName(m.module, lang)}</td>
                  <td>{m.ready}</td>
                  <td>{m.needsInput}</td>
                  <td>{m.awaitingVerification}</td>
                  <td>{m.notSubmitted}</td>
                  <td style={m.overdue > 0 ? { color: "var(--color-danger)", fontWeight: 600 } : undefined}>{m.overdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** A line of the email log in words: when, which email, for whom, how many records, how it went. Never an address. */
function emailLogWords(r: EmailLogLine, times: EmailSettingsAnswer["setup"]["times"] | null, t: (k: string, v?: Record<string, string | number>) => string): string {
  const slot =
    r.slot === "morning"
      ? t("email.slot.morning")
      : r.slot === "reminder"
        ? t("email.slot.reminder", { time: times?.reminder ?? "15:30" })
        : r.slot === "lastCall"
          ? t("email.slot.lastCall", { time: times?.lastCall ?? "17:45" })
          : t("email.slot.test");
  const records = r.slot.startsWith("test") ? "" : `, ${r.items === 1 ? t("email.records.one") : t("email.records.many", { n: r.items })}`;
  return `${formatDisplayDateTime(r.sentAt ?? r.claimedAt)}, ${slot}: ${r.name ?? "?"}${records}: ${t(`email.state.${r.state}`)}${r.error ? ` (${r.error})` : ""}`;
}

/**
 * THE REMINDER EMAILS (the owner, 25-Oct-2026: "the system will remind the user again and again until he or she complete
 * his tasks"; backend/emailReminders.ts). The super admin's switch (off until switched on), "Send me a test email" to the
 * super admin's own reminder email (Users & Access), how mail goes on this server, and the latest emails from the log,
 * never an address. The emails themselves go out with the notify job, in the day's three slots. `refresh` changes after
 * a run of the notifications, so the log shows what that run sent.
 */
function ReminderEmails({ refresh }: { refresh: number }) {
  const t = useT();
  const [settings, setSettings] = useState<EmailSettingsAnswer | null>(null);
  const [rows, setRows] = useState<EmailLogLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState<{ text: string; outcome: "sent" | "captured" | "failed" } | null>(null);

  const load = useCallback(() => {
    Promise.all([emailApi.settings(), emailApi.log(5)])
      .then(([s, log]) => {
        setSettings(s);
        setRows(Array.isArray(log?.rows) ? log.rows : []);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("email.error")));
  }, [t]);
  useEffect(() => {
    load();
  }, [load, refresh]);

  const on = settings?.enabled === true;
  const setup = settings?.setup ?? null;
  const flip = () => {
    setBusy(true);
    emailApi
      .setEnabled(!on)
      .then((s) => {
        setSettings(s);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("email.error")))
      .finally(() => setBusy(false));
  };
  const test = () => {
    setTesting(true);
    setTested(null);
    emailApi
      .test()
      .then((res) =>
        setTested(
          res.sent
            ? res.captured
              ? { text: t("email.testCaptured"), outcome: "captured" }
              : { text: t("email.testSent"), outcome: "sent" }
            : { text: t("email.testFailed", { why: res.reason ?? "" }), outcome: "failed" }
        )
      )
      .catch((err) => setTested({ text: t("email.testFailed", { why: err instanceof Error ? err.message : String(err) }), outcome: "failed" }))
      .finally(() => {
        setTesting(false);
        load();
      });
  };

  return (
    <div className="mt-3" data-section="reminder-emails" data-enabled={on ? "yes" : "no"} data-mode={setup?.mode ?? ""} style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
      <h3 className="text-base mb-1 flex items-center gap-2">
        <FiMail size={14} aria-hidden="true" /> {t("email.title")}
      </h3>
      <p className="text-muted text-sm mb-2">{t("email.intro", { reminder: setup?.times.reminder ?? "15:30", lastCall: setup?.times.lastCall ?? "17:45" })}</p>
      <div className="flex gap-3 wrap items-center">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          data-action="email-switch"
          className={`voice-switch ${on ? "is-on" : ""}`}
          disabled={busy || settings === null}
          onClick={flip}
        >
          <span className="voice-switch-track" aria-hidden="true">
            <span className="voice-switch-thumb" />
          </span>
          <span className="voice-switch-label">{t("email.switch")}</span>
          <span key={on ? "on" : "off"} className="voice-switch-state">
            {on ? t("email.on") : t("email.off")}
          </span>
        </button>
        <button type="button" className="btn btn-secondary btn-sm" data-action="email-test" disabled={testing} onClick={test}>
          <FiMail size={12} aria-hidden="true" /> {testing ? t("email.testing") : t("email.test")}
        </button>
      </div>
      {settings?.setBy && settings.setAt && (
        <p className="text-xs text-muted mt-1">{t("email.setBy", { state: on ? t("email.on") : t("email.off"), name: settings.setBy, when: formatDisplayDateTime(settings.setAt) })}</p>
      )}
      {setup && (
        <p className="text-xs mt-1" data-field="email-setup" style={setup.mode === "off" || !setup.serverOn ? { color: "var(--color-danger)" } : { color: "var(--color-text-muted)" }}>
          {!setup.serverOn ? t("email.serverOff") : t(`email.mode.${setup.mode}`, { cap: setup.dailyCap })}
          {setup.serverOn && setup.mode !== "off" && !setup.link ? ` ${t("email.noLink")}` : ""}
        </p>
      )}
      {tested && (
        <p className="text-sm mt-2" role="status" data-field="email-test-outcome" data-outcome={tested.outcome} style={tested.outcome === "failed" ? { color: "var(--color-danger)" } : undefined}>
          {tested.text}
        </p>
      )}
      {error && (
        <p className="text-sm mt-2" role="alert" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}
      <div className="mt-2" data-section="email-log" data-count={rows?.length ?? 0}>
        <div className="text-xs font-semibold mb-1">{t("email.log")}</div>
        {rows === null ? null : rows.length === 0 ? (
          <p className="text-xs text-muted">{t("email.logNone")}</p>
        ) : (
          <ul className="text-xs" style={{ paddingLeft: 18, margin: 0 }} translate="no">
            {rows.map((r) => (
              <li key={r.id} data-email-log={r.id} data-state={r.state} data-slot={r.slot}>
                {emailLogWords(r, setup?.times ?? null, t)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * THE SERVER'S JOBS, RUN NOW (the super admin's alone; REQUIREMENTS §97). The morning prepare and the notifications run
 * by themselves (backend/jobs.ts); the owner is not technical, so running one sooner is a button here, never an HTTP
 * call: POST /api/jobs/run, and the outcome in plain words. Both are safe to run again. Below them, the reminder emails.
 */
function ServerJobsCard({ onNotified }: { onNotified: () => void }) {
  const t = useT();
  const { lang } = useLanguage();
  const words = ledgerLanguage(lang);
  const [running, setRunning] = useState<ServerJob | null>(null);
  const [said, setSaid] = useState<{ job: ServerJob; lines: string[]; failed: boolean } | null>(null);
  const [notified, setNotified] = useState(0);
  const run = (job: ServerJob) => {
    setRunning(job);
    setSaid(null);
    escalationsApi
      .runJob(job)
      .then((res) => {
        setSaid({ job, lines: jobRunWords(res, (k, v) => t(k, v), (code) => moduleName(code, words)), failed: false });
        if (job === "notify") {
          window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
          onNotified();
          setNotified((n) => n + 1);
        }
      })
      .catch((err) => setSaid({ job, lines: [t("jobs.failed", { why: err instanceof Error ? err.message : String(err) })], failed: true }))
      .finally(() => setRunning(null));
  };
  return (
    <section className="card mb-3" data-section="server-jobs">
      <div className="card-pad">
        <h2 className="text-lg mb-1">{t("jobs.title")}</h2>
        <p className="text-muted text-sm mb-2">{t("jobs.intro")}</p>
        <div className="flex gap-2 wrap">
          {(["morning-prepare", "notify"] as const).map((job) => (
            <button key={job} type="button" className="btn btn-secondary btn-sm" data-action={`run-${job}`} disabled={running !== null} onClick={() => run(job)}>
              <FiPlay size={12} aria-hidden="true" /> {running === job ? t("jobs.running") : t(job === "morning-prepare" ? "jobs.prepare" : "jobs.notify")}
            </button>
          ))}
        </div>
        {said && (
          <div className="text-sm mt-2" role="status" data-field="job-outcome" data-job={said.job} data-failed={said.failed ? "yes" : "no"} style={said.failed ? { color: "var(--color-danger)" } : undefined}>
            {said.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}
        <ReminderEmails refresh={notified} />
      </div>
    </section>
  );
}

/** Marks read on the server, says so to the bell, and gives back the unread count (null when the server could not say). */
export async function markNotificationsRead(which: { ids: number[] } | { all: true }): Promise<number | null> {
  try {
    const res = await notificationsApi.markRead(which);
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
    return typeof res?.unread === "number" ? res.unread : null;
  } catch {
    return null;
  }
}

export function NotificationsPage() {
  const t = useT();
  const { lang } = useLanguage();
  const { user } = useAuth();
  const { navigate } = useRouter();
  const ask = ledgerLanguage(lang);
  const boss = user?.role === "admin";
  const [filter, setFilter] = useState<"all" | "open">("all");
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // The answer to the latest question only: a slow first page never lands over a newer one.
  const asked = useRef(0);

  const load = useCallback(() => {
    const n = ++asked.current;
    setError(null);
    notificationsApi
      .list({ state: filter, limit: PAGE, lang: ask })
      .then((res) => {
        if (n !== asked.current) return;
        const list = Array.isArray(res?.items) ? res.items : [];
        setItems(list);
        setUnread(typeof res?.unread === "number" ? res.unread : 0);
        setHasMore(list.length === PAGE);
      })
      .catch((err) => {
        if (n !== asked.current) return;
        setItems((was) => was ?? []);
        setError(err instanceof ApiError && err.status !== 404 ? err.message : t("notif.error"));
      });
  }, [filter, ask, t]);

  useEffect(() => {
    load();
  }, [load]);
  // Marked read in the bell or another tab: asked again.
  useEffect(() => {
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED, load);
  }, [load]);

  const showMore = () => {
    if (!items) return;
    const before = nextBefore(items);
    if (before === undefined) return;
    setLoadingMore(true);
    notificationsApi
      .list({ state: filter, limit: PAGE, lang: ask, before })
      .then((res) => {
        const page = Array.isArray(res?.items) ? res.items : [];
        setItems((was) => appendPage(was ?? [], page));
        setHasMore(page.length === PAGE);
      })
      .catch(() => setError(t("notif.error")))
      .finally(() => setLoadingMore(false));
  };

  const open = (item: NotificationItem) => {
    if (item.readAt === null) {
      setItems((was) => (was ? markedRead(was, [item.id], new Date().toISOString()) : was));
      setUnread((u) => Math.max(0, u - 1));
      void markNotificationsRead({ ids: [item.id] });
    }
    navigate(routeForNotification(item));
  };

  const markAll = () => {
    setItems((was) => (was ? markedRead(was, "all", new Date().toISOString()) : was));
    setUnread(0);
    void markNotificationsRead({ all: true }).then((left) => {
      if (left !== null) setUnread(left);
    });
  };

  const groups = useMemo(() => groupByDay(items ?? []), [items]);

  return (
    <div data-page="notifications" data-unread={unread} style={{ maxWidth: 880 }}>
      <div className="flex items-center justify-between wrap gap-3 mb-2">
        <div>
          <h1 className="text-2xl mb-1 flex items-center gap-2">
            <FiBell size={20} /> {t("notif.title")}
          </h1>
          <p className="text-muted text-sm">{boss ? t("notif.introBoss") : t("notif.intro")}</p>
        </div>
        <div className="flex gap-2 wrap items-center">
          <span className={`badge ${unread > 0 ? "badge-Due" : "badge-Verified"}`} data-field="unread-count">
            {unread === 0 ? t("notif.allRead") : unread === 1 ? t("notif.unreadOne") : t("notif.unread", { n: unread })}
          </span>
          <button className="btn btn-secondary btn-sm" data-action="mark-all-read" disabled={unread === 0} onClick={markAll}>
            <FiCheck size={12} /> {t("notif.markAllRead")}
          </button>
        </div>
      </div>

      {boss && <ServerJobsCard onNotified={load} />}

      <div className="pill-tabs notif-filter mb-3" role="tablist" style={{ display: "inline-flex" }}>
        {(["all", "open"] as const).map((f) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} className={`pill-tab ${filter === f ? "active" : ""}`} data-filter={f} onClick={() => setFilter(f)}>
            {f === "all" ? t("notif.filterAll") : t("notif.filterOpen")}
          </button>
        ))}
      </div>

      {error && (
        <div className="card mb-3" role="alert" data-state="notifications-error" style={{ borderColor: "var(--color-warning)", background: "var(--color-warning-bg)" }}>
          <div className="card-pad text-sm flex items-center justify-between gap-3">
            <span>{error}</span>
            <button className="btn btn-secondary btn-sm" onClick={load}>
              <FiRefreshCw size={12} /> {t("notif.retry")}
            </button>
          </div>
        </div>
      )}

      {items === null ? (
        <p className="text-muted text-sm" data-state="loading">
          {t("notif.loading")}
        </p>
      ) : items.length === 0 ? (
        <div className="empty-state" data-state="no-notifications">
          {filter === "open" ? t("notif.emptyOpen") : t("notif.empty")}
        </div>
      ) : (
        <div data-section="notification-list" data-count={items.length}>
          {groups.map((g) => (
            <section key={g.day} data-day={g.day}>
              <div className="notif-day">{dayLabel(g.day, t)}</div>
              {g.items.map((item) => (
                <NotificationRow key={item.id} item={item} onOpen={open} lang={ask} />
              ))}
            </section>
          ))}
          {hasMore && (
            <button className="btn btn-secondary btn-sm mt-3" data-action="show-older" disabled={loadingMore} onClick={showMore}>
              {t("notif.showMore")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

