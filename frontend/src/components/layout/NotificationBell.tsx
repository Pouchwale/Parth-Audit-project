import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiAlertTriangle, FiBell, FiCheck, FiX, FiZap } from "react-icons/fi";
import { useAppStore } from "../../store/AppStore";
import { useAuth } from "../../store/AuthContext";
import { useRouter } from "../../store/router";
import { todayISO } from "../../utils/date";
import { computeReminders, ensureNearTermRecordsGenerated } from "../../engine/reminders";
import { ReminderList } from "../common/ReminderList";
import { documentRepository } from "../../data/repositories/documentRepository";
import { priorityOf, PRIORITY_ORDER, type Priority } from "../../engine/notifications";
import { escalationLine } from "../../engine/performance";
import { escalationsApi, ESCALATIONS_CHANGED, forgetEscalationsSeen, type Escalation } from "../../api/client";
import { openBriefing } from "../common/AssistantBriefingPopup";
import { remindNow } from "../common/SoundVoiceHost";
import { chimeForNews, emitCue } from "../../engine/engageBus";
import { useT } from "../../i18n";

// Reminders only ever track Live records, regardless of which mode (Live /
// Demo) is currently toggled — same reasoning DashboardPage documents for
// its own generation call: demo data is synthetic and only ever created
// deliberately via Demo Mode, so it has no business generating reminders.
const IS_DEMO = false;

// A dropdown is for the next few things, not a register: capped so it
// opens instantly however large the backlog is (the rest is one click away
// in the briefing / Calendar).
const MAX_SHOWN = 20;

// A SOUND FOR WHAT IS NEW (REQUIREMENTS §81): the soft chime when the bell
// gains an urgent reminder, two firm notes for a new escalation. What the bell
// holds when the app starts is only the baseline — the shells made and the
// records pulled in while it settles are not news — so gains in the first
// seconds after the bell is drawn are taken in silently. Nor is a gain the
// person made themselves — a record they sent back or reopened is waiting
// again, and their own action has its sound (engine/engageBus.ts chimeForNews).
const SETTLE_MS = 5000;

export function NotificationBell() {
  const { version, bump } = useAppStore();
  const { user } = useAuth();
  const { navigate } = useRouter();
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const mountedAt = useRef(Date.now());

  // ONCE A DAY'S WORTH, not on every change of anything (REQUIREMENTS §65): the
  // month being looked at is what decides, and the count below is redrawn only
  // when something was really made — before, the bell could show a number that
  // did not yet include the sheets it had just created.
  const today = todayISO();
  useEffect(() => {
    if (ensureNearTermRecordsGenerated(IS_DEMO) > 0) bump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const reminders = useMemo(() => computeReminders(IS_DEMO), [version]);
  const urgentCount = reminders.filter((r) => r.urgency !== "upcoming").length;

  // The chime, in an effect (never while drawing): only when the set of urgent
  // reminders GAINS a record since the last look — one gone is not news.
  const urgentSeen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const now = new Set(reminders.filter((r) => r.urgency !== "upcoming").map((r) => r.recordId));
    const before = urgentSeen.current;
    urgentSeen.current = now;
    if (!before || Date.now() - mountedAt.current < SETTLE_MS) return;
    for (const id of now) {
      if (!before.has(id)) {
        chimeForNews();
        return;
      }
    }
  }, [reminders]);
  const shown = useMemo(() => reminders.slice(0, MAX_SHOWN), [reminders]);

  // HIGHEST FIRST, AND SAID WHY (REQUIREMENTS §69). A list of twenty documents
  // in date order tells a person nothing about what to do first. These are the
  // same reminders, grouped by what the document's own FREQUENCY makes of its
  // due date: a daily sheet due today cannot be made up tomorrow, a yearly
  // review due today can. No extra walk — the reminders are already here.
  const byPriority = useMemo(() => {
    const groups = new Map<Priority, typeof shown>();
    for (const r of shown) {
      const doc = documentRepository.getById(r.documentId);
      if (!doc) continue;
      const p = priorityOf(doc.schedule, r.daysUntilDue);
      const list = groups.get(p);
      if (list) list.push(r);
      else groups.set(p, [r]);
    }
    return groups;
  }, [shown]);
  const highCount = byPriority.get("high")?.length ?? 0;

  // ESCALATED TO YOU (REQUIREMENTS §75) — the super admin's alone. The server
  // raises a person who keeps handing their records in late, or a department
  // whose records are not done (backend/escalation.ts); they sit above every
  // reminder until the super admin acknowledges them, and count in the badge.
  // Asked of the server when the bell is first drawn and each time it is
  // opened — in an effect, never while drawing — and again after one is
  // acknowledged anywhere. A server that cannot say leaves the bell as it was.
  const isAdmin = user?.role === "admin";
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [acking, setAcking] = useState<string | null>(null);
  // The escalations the super admin has already been sounded for; the first answer is the baseline.
  const escalationsSeen = useRef<Set<string> | null>(null);
  const readEscalations = useCallback(() => {
    if (!isAdmin) return;
    escalationsApi
      .open()
      .then((res) => {
        const list = Array.isArray(res?.escalations) ? res.escalations : [];
        const before = escalationsSeen.current;
        escalationsSeen.current = new Set([...(before ?? []), ...list.map((e) => e.id)]);
        if (before && list.some((e) => !before.has(e.id))) emitCue("alert");
        setEscalations(list);
      })
      .catch(() => undefined);
  }, [isAdmin]);
  useEffect(() => {
    if (!isAdmin) {
      setEscalations([]);
      forgetEscalationsSeen();
      return;
    }
    readEscalations();
    window.addEventListener(ESCALATIONS_CHANGED, readEscalations);
    return () => window.removeEventListener(ESCALATIONS_CHANGED, readEscalations);
  }, [isAdmin, readEscalations]);
  useEffect(() => {
    if (open) readEscalations();
  }, [open, readEscalations]);

  const acknowledge = (id: string) => {
    setAcking(id);
    escalationsApi
      .acknowledge(id)
      .then(() => {
        setEscalations((list) => list.filter((e) => e.id !== id));
        window.dispatchEvent(new Event(ESCALATIONS_CHANGED));
      })
      .catch(() => undefined)
      .finally(() => setAcking(null));
  };

  const badge = reminders.length + escalations.length;

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen((o) => !o)}
        aria-label="Reminders"
        data-escalations={escalations.length}
        style={{ position: "relative" }}
      >
        <FiBell size={15} />
        {/* The count on a FILL of its level (styles.css .bell-count), so its figure
            reads in either theme (REQUIREMENTS §90). */}
        {badge > 0 && (
          <span className="bell-count" data-field="bell-count" data-level={escalations.length > 0 || highCount > 0 ? "danger" : urgentCount > 0 ? "warning" : "neutral"}>
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </button>
      {open && (
        // Placed by styles.css (.reminders-panel), which on a phone spans the window instead of running off its left edge.
        <div className="card reminders-panel">
          <div className="card-pad">
            <div className="flex items-center justify-between mb-2">
              <strong className="text-sm">Reminders{reminders.length > 0 ? ` (${reminders.length})` : ""}</strong>
              <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close reminders">
                <FiX size={14} />
              </button>
            </div>
            {escalations.length > 0 && (
              <div className="mb-3" data-section="escalations" data-count={escalations.length}>
                <div className="text-xs font-semibold mb-1 flex items-center gap-1" style={{ color: "var(--color-danger)" }}>
                  <FiAlertTriangle size={12} /> Escalated to you ({escalations.length})
                </div>
                {escalations.map((e) => (
                  <div
                    key={e.id}
                    data-escalation={e.id}
                    data-kind={e.kind}
                    className="flex items-start gap-2"
                    style={{ padding: "6px 0", borderBottom: "1px solid var(--color-border)" }}
                  >
                    <button
                      type="button"
                      className="score-open"
                      style={{ flex: 1, minWidth: 0, textAlign: "left" }}
                      data-action="open-escalation"
                      onClick={() => {
                        setOpen(false);
                        navigate("/performance");
                      }}
                    >
                      <div className="text-sm font-semibold notranslate" translate="no">
                        {e.subjectName}
                      </div>
                      <div className="text-xs text-muted">{escalationLine(e)}</div>
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      data-action="ack-escalation"
                      disabled={acking === e.id}
                      onClick={() => acknowledge(e.id)}
                      title="Mark it as seen — it opens again if more is late or not done this week"
                    >
                      <FiCheck size={12} /> Acknowledge
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* MITRA SAYS IT (REQUIREMENTS §81): the most urgent thing of theirs, aloud, now. */}
            <button
              type="button"
              className="btn btn-secondary btn-sm mb-2 w-full"
              data-action="voice-remind-now"
              title={t("voice.bell.nextTitle")}
              onClick={() => {
                setOpen(false);
                remindNow();
              }}
            >
              {t("voice.bell.next")}
            </button>
            {PRIORITY_ORDER.map((p) => {
              const list = byPriority.get(p);
              if (!list || list.length === 0) return null;
              return (
                <div key={p} className="mb-2" data-priority={p} data-count={list.length}>
                  <div
                    className="text-xs font-semibold mb-1"
                    style={{ color: p === "high" ? "var(--color-danger)" : p === "medium" ? "var(--color-warning)" : "var(--color-text-muted)" }}
                  >
                    {p === "high" ? "High priority" : p === "medium" ? "Medium" : "Low"} ({list.length})
                  </div>
                  <ReminderList reminders={list} onNavigate={() => setOpen(false)} />
                </div>
              );
            })}
            {shown.length === 0 && <ReminderList reminders={shown} onNavigate={() => setOpen(false)} />}
            {reminders.length > MAX_SHOWN && (
              <button
                className="btn btn-secondary btn-sm mt-2 w-full"
                onClick={() => {
                  setOpen(false);
                  openBriefing();
                }}
              >
                <FiZap size={12} /> …and {reminders.length - MAX_SHOWN} more — open today's briefing
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
