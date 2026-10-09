import React from "react";
import type { DocumentReminder, ReminderUrgency } from "../../engine/reminders";
import { formatDisplayDate } from "../../utils/date";
import { useRouter } from "../../store/router";
import { pressable } from "../../utils/pressable";
import { documentTextIn } from "../../i18n/documentText";
import { useAppStore } from "../../store/AppStore";
import { useT } from "../../i18n";
import { answerersOf } from "../../engine/departmentScope";

// The bell panel's own words, in the language chosen (the people review of 9-Oct-2026 found them English in Gujarati).
const URGENCY_LABEL: Record<ReminderUrgency, string> = {
  overdue: "notif.bell.overdue",
  due: "notif.bell.dueToday",
  upcoming: "notif.bell.upcoming",
};

const URGENCY_BADGE: Record<ReminderUrgency, string> = {
  overdue: "badge-Overdue",
  due: "badge-Due",
  upcoming: "badge-Scheduled",
};

function urgencyDetail(r: DocumentReminder, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const n = Math.abs(r.daysUntilDue);
  if (r.urgency === "overdue") return t(n === 1 ? "notif.bell.lateOne" : "notif.bell.late", { n });
  if (r.urgency === "due") return t("notif.bell.dueTodayLine");
  return t(r.daysUntilDue === 1 ? "notif.bell.dueInOne" : "notif.bell.dueIn", { n: r.daysUntilDue });
}

/**
 * WHO ANSWERS FOR IT (REQUIREMENTS §96): the people the owner's table names for the document, as the notifications go
 * to them; the roles of Master Data only where nobody is held to levels.
 */
function answeredBy(r: DocumentReminder): string[] {
  return answerersOf(r.documentId) ?? r.assignedEmployees.map((e) => e.name);
}

// Shared between the notification bell dropdown and the on-login popup so
// both present reminders identically.
export function ReminderList({ reminders, onNavigate }: { reminders: DocumentReminder[]; onNavigate?: () => void }) {
  // A format issued in Gujarati is named in the chosen language (REQUIREMENTS §58).
  const { lang } = useAppStore();
  const { navigate } = useRouter();
  const t = useT();

  if (reminders.length === 0) {
    return (
      <div className="text-muted text-sm" style={{ padding: "12px 4px" }}>
        {t("notif.bell.caughtUp")}
      </div>
    );
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
            <span className={`badge ${URGENCY_BADGE[r.urgency]}`}>{t(URGENCY_LABEL[r.urgency])}</span>
          </div>
          <div className="text-xs text-muted mt-1">
            {formatDisplayDate(r.dueDate)} — {urgencyDetail(r, t)}
          </div>
          <div className="text-xs mt-1" data-field="answered-by">
            {answeredBy(r).length > 0 ? (
              <span>{t("notif.bell.answers", { names: answeredBy(r).join(", ") })}</span>
            ) : (
              <span className="text-muted">{t("notif.bell.unassigned")}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
