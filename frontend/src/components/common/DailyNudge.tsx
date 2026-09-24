import React, { useEffect, useMemo, useState } from "react";
import { FiAlertTriangle, FiAward, FiArrowRight, FiBell, FiX, FiZap } from "react-icons/fi";
import { useAppStore } from "../../store/AppStore";
import { useAuth } from "../../store/AuthContext";
import { useRouter } from "../../store/router";
import { settingsRepository } from "../../data/repositories/settingsRepository";
import { recordRepository } from "../../data/repositories/recordRepository";
import { documentRepository } from "../../data/repositories/documentRepository";
import { masterRepository } from "../../data/repositories/masterRepository";
import { notificationsFor, encourage, type DaysWork, type Standing } from "../../engine/notifications";
import { closedDays, scorecards } from "../../engine/performance";
import { firstNameOf } from "../../engine/assistantPersona";
import { openBriefing } from "./AssistantBriefingPopup";
import { todayISO } from "../../utils/date";
import { escalationsApi } from "../../api/client";

// THE DAY'S NOTIFICATION (REQUIREMENTS §69).
//
// "make a dedicated notification system which comes daily to encourage the user
// to finish there work and lead in that score dashboard."
//
// Once a day, on the first screen of the day, a person is told in one line what
// is waiting for THEM — their department's documents and the ones Master Data
// names them on — how much of it is high priority, and where that leaves them
// on the Performance Scorecard (§64), which is what they are measured by. Then
// it goes: a notice that comes back every reload is a notice people learn to
// close without reading.
//
// WORKED OUT ONCE, when it is shown. Both questions behind it walk every
// format's records (engine/reminders.ts and engine/performance.ts), so this
// must never be asked while drawing (§65) — the day it was last shown is kept
// with the person's own settings, so the walk happens once a day, not once a
// render.
//
// THE SUPER ADMIN IS ALSO TOLD WHO WAS ESCALATED THIS WEEK (REQUIREMENTS §75):
// "N people were late repeatedly this week", with a way to the Performance
// Scorecard. The server works that out every working day (backend/escalation.ts);
// it is asked once, when the day's notification is, and the line appears when
// the answer comes — the notification never waits for it.
export function DailyNudge() {
  const { mode, version } = useAppStore();
  const { user } = useAuth();
  const { navigate } = useRouter();
  const today = todayISO();
  const [dismissed, setDismissed] = useState(false);
  // null until the day's question has been asked; then what it answered.
  const [day, setDay] = useState<{ work: DaysWork; standing: Standing | null } | null>(null);
  // The super admin's: this week's escalations — people late repeatedly, and those behind with records never done.
  const [escalated, setEscalated] = useState<{ late: number; neverDone: number } | null>(null);

  useEffect(() => {
    if (!user || settingsRepository.nudgeShownOn(today)) return;
    // Live work only: demo records are synthetic and nobody is behind on them.
    const work = notificationsFor(user, false);
    // THEIR OWN SCORE, from what this browser already holds. Where they stand
    // against everybody else needs the directory of accounts, which is the
    // Performance Scorecard's own question (§64) — so the line says what is
    // true here and sends them there for the rest.
    let standing: Standing | null = null;
    try {
      const me = { id: user.id, name: user.name, role: user.role, departments: user.departments };
      const cards = scorecards(
        recordRepository.queryUnscoped({ isDemo: false }),
        documentRepository.getAll(),
        [me],
        "this-month",
        today,
        { isClosedDay: closedDays(masterRepository.get()), countedFrom: settingsRepository.get().liveStartDate }
      );
      const mine = cards.byPerson.find((p) => p.person.id === user.id);
      if (mine && mine.score !== null) standing = { score: mine.score, grade: mine.grade.label, rank: null, outOf: 1, best: null };
    } catch {
      /* the scorecard is an extra: never let it stop the notification */
    }
    settingsRepository.markNudgeShown(today);
    setDay({ work, standing });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, today]);

  // Asked once the day's notification is up, and only for the super admin. Its
  // own effect, keyed on the notification being shown, so an effect run twice
  // (React's development check) still ends with the answer on the screen.
  const isAdmin = user?.role === "admin";
  const shown = day !== null;
  useEffect(() => {
    if (!shown || !isAdmin) return;
    let alive = true;
    escalationsApi
      .recent()
      .then((res) => {
        if (!alive || !Array.isArray(res?.escalations)) return;
        const thisWeek = res.escalations.filter((e) => e.period === res.week);
        const late = new Set(thisWeek.filter((e) => e.kind === "person" && e.late >= res.rule.late).map((e) => e.subjectKey)).size;
        const neverDone = thisWeek.filter((e) => e.neverDone >= res.rule.neverDone).length;
        setEscalated(late + neverDone > 0 ? { late, neverDone } : null);
      })
      // An extra: the day's notification stands without it.
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [shown, isAdmin]);

  const words = useMemo(() => (day ? encourage(day.work, day.standing, firstNameOf(user?.name)) : null), [day, user?.name]);
  // Demo Mode shows synthetic records; the day's real work is not that.
  if (!day || !words || dismissed || mode === "demo") return null;
  const { work } = day;
  const nothing = work.notifications.length === 0;
  void version;

  return (
    <div
      className="card mb-4 no-print"
      role="status"
      data-section="daily-nudge"
      data-high={work.high}
      data-total={work.notifications.length}
      style={{ borderLeft: `4px solid ${nothing ? "var(--color-success)" : work.high > 0 ? "var(--color-danger)" : "var(--color-warning)"}` }}
    >
      <div className="card-pad">
        <div className="flex items-start justify-between gap-3 wrap">
          <div style={{ minWidth: 0 }}>
            <div className="text-sm font-semibold flex items-center gap-2">
              <FiBell size={14} /> <span data-field="nudge-headline">{words.headline}</span>
            </div>
            {words.standing && (
              <div className="text-xs text-muted mt-1" data-field="nudge-standing">
                {words.standing}
              </div>
            )}
            {escalated && (
              <div className="text-xs mt-2 flex items-center gap-2 wrap" data-section="nudge-escalations" data-late={escalated.late} data-never-done={escalated.neverDone}>
                <FiAlertTriangle size={12} style={{ color: "var(--color-danger)" }} />
                <span style={{ color: "var(--color-danger)", fontWeight: 600 }} data-field="nudge-escalations-text">
                  {[
                    escalated.late > 0 ? `${escalated.late} ${escalated.late === 1 ? "person was" : "people were"} late repeatedly this week` : "",
                    escalated.neverDone > 0 ? `${escalated.neverDone} escalated for records never done` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <button className="btn btn-secondary btn-sm" data-action="nudge-escalations-review" onClick={() => navigate("/performance")}>
                  Review <FiArrowRight size={12} />
                </button>
              </div>
            )}
            {!nothing && (
              <div className="text-xs mt-2 flex gap-3 wrap" data-field="nudge-counts">
                {work.high > 0 && <span style={{ color: "var(--color-danger)", fontWeight: 600 }}>{work.high} high priority</span>}
                {work.medium > 0 && <span style={{ color: "var(--color-warning)", fontWeight: 600 }}>{work.medium} medium</span>}
                {work.low > 0 && <span className="text-muted">{work.low} low</span>}
                {work.modules.length > 0 && <span className="text-faint">· {work.modules.slice(0, 2).join(" · ")}{work.modules.length > 2 ? ` · and ${work.modules.length - 2} more` : ""}</span>}
              </div>
            )}
          </div>
          <div className="flex gap-2 wrap" style={{ flexShrink: 0 }}>
            {!nothing && (
              <button className="btn btn-primary btn-sm" data-action="nudge-open-first" onClick={() => navigate(work.notifications[0].route)}>
                Start with {work.notifications[0].what.split(" ")[0]} <FiArrowRight size={12} />
              </button>
            )}
            <button className="btn btn-secondary btn-sm" data-action="nudge-briefing" onClick={() => openBriefing()}>
              <FiZap size={12} /> Today&apos;s briefing
            </button>
            <button className="btn btn-secondary btn-sm" data-action="nudge-scorecard" onClick={() => navigate("/performance")}>
              <FiAward size={12} /> Scorecard
            </button>
            <button className="btn btn-ghost btn-sm" data-action="nudge-dismiss" onClick={() => setDismissed(true)} aria-label="Dismiss">
              <FiX size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
