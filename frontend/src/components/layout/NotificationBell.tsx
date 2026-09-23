import React, { useEffect, useMemo, useRef, useState } from "react";
import { FiBell, FiX, FiZap } from "react-icons/fi";
import { useAppStore } from "../../store/AppStore";
import { todayISO } from "../../utils/date";
import { computeReminders, ensureNearTermRecordsGenerated } from "../../engine/reminders";
import { ReminderList } from "../common/ReminderList";
import { documentRepository } from "../../data/repositories/documentRepository";
import { priorityOf, PRIORITY_ORDER, type Priority } from "../../engine/notifications";
import { openBriefing } from "../common/AssistantBriefingPopup";

// Reminders only ever track Live records, regardless of which mode (Live /
// Demo) is currently toggled — same reasoning DashboardPage documents for
// its own generation call: demo data is synthetic and only ever created
// deliberately via Demo Mode, so it has no business generating reminders.
const IS_DEMO = false;

// A dropdown is for the next few things, not a register: capped so it
// opens instantly however large the backlog is (the rest is one click away
// in the briefing / Calendar).
const MAX_SHOWN = 20;

export function NotificationBell() {
  const { version, bump } = useAppStore();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

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
        style={{ position: "relative" }}
      >
        <FiBell size={15} />
        {reminders.length > 0 && (
          <span
            style={{
              position: "absolute",
              top: -3,
              right: -3,
              minWidth: 15,
              height: 15,
              padding: "0 3px",
              fontSize: 10,
              lineHeight: "15px",
              textAlign: "center",
              background: highCount > 0 ? "var(--color-danger)" : urgentCount > 0 ? "var(--color-warning)" : "var(--color-neutral)",
              color: "#fff",
              borderRadius: 999,
            }}
          >
            {reminders.length > 99 ? "99+" : reminders.length}
          </span>
        )}
      </button>
      {open && (
        <div
          className="card"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: 340,
            maxHeight: 420,
            overflowY: "auto",
            zIndex: 60,
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <div className="card-pad">
            <div className="flex items-center justify-between mb-2">
              <strong className="text-sm">Reminders{reminders.length > 0 ? ` (${reminders.length})` : ""}</strong>
              <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close reminders">
                <FiX size={14} />
              </button>
            </div>
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
