import React from "react";
import type { DocumentReminder, ReminderUrgency } from "../../engine/reminders";
import { formatDisplayDate } from "../../utils/date";
import { useRouter } from "../../store/router";
import { pressable } from "../../utils/pressable";
import { documentTextIn } from "../../i18n/documentText";
import { useAppStore } from "../../store/AppStore";

const URGENCY_LABEL: Record<ReminderUrgency, string> = {
  overdue: "Overdue",
  due: "Due Today",
  upcoming: "Upcoming",
};

const URGENCY_BADGE: Record<ReminderUrgency, string> = {
  overdue: "badge-Overdue",
  due: "badge-Due",
  upcoming: "badge-Scheduled",
};

function urgencyDetail(r: DocumentReminder): string {
  if (r.urgency === "overdue") return `${Math.abs(r.daysUntilDue)} day${Math.abs(r.daysUntilDue) === 1 ? "" : "s"} overdue`;
  if (r.urgency === "due") return "due today";
  return `due in ${r.daysUntilDue} day${r.daysUntilDue === 1 ? "" : "s"}`;
}

// Shared between the notification bell dropdown and the on-login popup so
// both present reminders identically.
export function ReminderList({ reminders, onNavigate }: { reminders: DocumentReminder[]; onNavigate?: () => void }) {
  // A format issued in Gujarati is named in the chosen language (REQUIREMENTS §58).
  const { lang } = useAppStore();
  const { navigate } = useRouter();

  if (reminders.length === 0) {
    return <div className="text-muted text-sm" style={{ padding: "12px 4px" }}>Nothing due — you're all caught up.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {reminders.map((r) => (
        <div
          key={r.recordId}
          className="card-clickable"
          style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", padding: "8px 10px", cursor: "pointer" }}
          {...pressable(() => {
            navigate(r.route);
            onNavigate?.();
          })}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">{documentTextIn(r.documentName, lang)}</span>
            <span className={`badge ${URGENCY_BADGE[r.urgency]}`}>{URGENCY_LABEL[r.urgency]}</span>
          </div>
          <div className="text-xs text-muted mt-1">
            {formatDisplayDate(r.dueDate)} — {urgencyDetail(r)}
          </div>
          <div className="text-xs mt-1">
            {r.assignedEmployees.length > 0 ? (
              <span>Assigned: {r.assignedEmployees.map((e) => e.name).join(", ")}</span>
            ) : (
              <span className="text-muted">Unassigned — set a role in Master Data</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
