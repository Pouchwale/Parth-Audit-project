import React, { useEffect, useMemo, useRef, useState } from "react";
import { FiAlertTriangle, FiAward, FiArrowRight, FiBell, FiX, FiZap } from "react-icons/fi";
import { useAppStore } from "../../store/AppStore";
import { useAuth } from "../../store/AuthContext";
import { useRouter } from "../../store/router";
import { settingsRepository } from "../../data/repositories/settingsRepository";
import { recordRepository } from "../../data/repositories/recordRepository";
import { documentRepository } from "../../data/repositories/documentRepository";
import { masterRepository } from "../../data/repositories/masterRepository";
import { departmentOfDocument } from "../../data/seed/departments";
import { notificationsFor, encourage, type DaysWork, type Standing } from "../../engine/notifications";
import { closedDays, periodFor, scorecards, type Person, type PlantCalendar } from "../../engine/performance";
import { attribute, keptTo, sameName } from "../../engine/latenessCore";
import { firstNameOf } from "../../engine/assistantPersona";
import { openBriefing } from "./AssistantBriefingPopup";
import { todayISO } from "../../utils/date";
import { escalationsApi, usersApi } from "../../api/client";
import type { DocumentDefinition, RecordInstance } from "../../types";

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
//
// THEIR OWN SCORE IS THE SCORECARD'S OWN FIGURE (REQUIREMENTS §75). Worked out
// with every account in the list, as the Performance page works it out — see
// ownStanding below for why the person alone gives a different number in a
// department two accounts share. The list is the page's own question (GET
// /api/users/directory), asked here once per showing, after the notification
// is up; the score line appears when it has come, and is left out when the
// list cannot be read and the score alone might be wrong.

/**
 * THE PERSON'S OWN LINE ON THE PERFORMANCE SCORECARD THIS MONTH — the figure
 * the page shows them, never another (REQUIREMENTS §64, §75).
 *
 * The scorecard is worked out over EVERY account (`directory`, the list GET
 * /api/users/directory gives, which pages/PerformancePage.tsx reads), then the
 * person's own line is read out of it. Not over the person alone: where a
 * department has more than one account (HR has two), a record one of them
 * handed in counts for that one only (engine/latenessCore.ts attribute), and
 * worked out with nobody else in the list, a colleague's on-time record would
 * count for this person as well — a score the scorecard never shows them.
 *
 * `directory` null means the list could not be read. The person's line is then
 * worked out alone, and given only when it cannot differ from the scorecard's:
 * nobody but them handed in a record of their departments this month, so there
 * is nothing that could have counted for a colleague instead. Otherwise the
 * score is left out — the notification still sends them to the scorecard —
 * rather than a wrong one said.
 *
 * Pure, and a walk over the month's records: asked from an effect, never while
 * drawing (§65).
 */
export function ownStanding(
  me: Person,
  directory: readonly Person[] | null,
  records: readonly RecordInstance[],
  docs: readonly DocumentDefinition[],
  today: string,
  calendar: PlantCalendar
): Standing | null {
  let people: readonly Person[];
  if (directory) {
    // The page's own list; the person themself is on it, and is added in the odd case they are not.
    people = directory.some((p) => p.id === me.id) ? directory : [...directory, me];
  } else {
    const mine = sameName(me.name);
    let handedInByAnother = false;
    attribute(records, docs, [me], periodFor("this-month", today), today, calendar, (d) => departmentOfDocument(d.id, d.formatNo), ({ judgement, answering }) => {
      if (answering.length > 0 && judgement.by && sameName(judgement.by) !== mine) handedInByAnother = true;
    });
    if (handedInByAnother) return null;
    people = [me];
  }
  const cards = scorecards(records, docs, people, "this-month", today, calendar);
  const line = cards.byPerson.find((p) => p.person.id === me.id);
  if (!line || !line.answers || line.score === null) return null;
  return { score: line.score, grade: line.grade.label, rank: null, outOf: 1, best: null };
}

export function DailyNudge() {
  const { mode, version } = useAppStore();
  const { user } = useAuth();
  const { navigate } = useRouter();
  const today = todayISO();
  const [dismissed, setDismissed] = useState(false);
  // null until the day's question has been asked; then what it answered.
  const [day, setDay] = useState<{ work: DaysWork } | null>(null);
  // Their own score on the scorecard, once the list of accounts has come; null until then, and when there is none to say.
  const [standing, setStanding] = useState<Standing | null>(null);
  // The list of accounts, asked once per showing (below): the showing it was asked for, and the answer to come.
  const directoryAsked = useRef<{ showing: object; answer: Promise<Person[] | null> } | null>(null);
  // The super admin's: this week's escalations — people late repeatedly, and those behind with records never done.
  const [escalated, setEscalated] = useState<{ late: number; neverDone: number } | null>(null);

  useEffect(() => {
    if (!user || settingsRepository.nudgeShownOn(today)) return;
    // Live work only: demo records are synthetic and nobody is behind on them.
    const work = notificationsFor(user, false);
    settingsRepository.markNudgeShown(today);
    setDay({ work });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, today]);

  // THEIR OWN SCORE, once the notification is up: the list of accounts is
  // asked for once per showing — the question is kept with the showing it was
  // asked for, so an effect run twice (React's development check) waits on the
  // same answer instead of asking again — and the scorecard is worked out when
  // the answer comes, in its callback, never while drawing. A new day's showing
  // (the tab left open past midnight) asks afresh and scores the new month.
  const userId = user?.id;
  useEffect(() => {
    // The administrator and an account kept to no department answer for no document: there is no score to ask for.
    if (!day || !user || keptTo(user).length === 0) return;
    let alive = true;
    if (directoryAsked.current?.showing !== day) {
      setStanding(null);
      directoryAsked.current = {
        showing: day,
        answer: usersApi.directory().then(
          // A server from before the directory answers with something else: that is "cannot be read", not an empty plant.
          (res) => (Array.isArray(res?.people) ? res.people : null),
          () => null
        ),
      };
    }
    const me: Person = { id: user.id, name: user.name, role: user.role, departments: user.departments };
    directoryAsked.current.answer.then((directory) => {
      if (!alive) return;
      let mine: Standing | null = null;
      try {
        // The Performance page's own question: this month's live records of the documents this account may see.
        const period = periodFor("this-month", today);
        mine = ownStanding(
          me,
          directory,
          recordRepository.query({ isDemo: false, fromDate: period.from, toDate: period.to }),
          documentRepository.getAll(),
          today,
          { isClosedDay: closedDays(masterRepository.get()), countedFrom: settingsRepository.get().liveStartDate }
        );
      } catch {
        /* the scorecard is an extra: never let it stop the notification */
      }
      setStanding(mine);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, userId]);

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

  const words = useMemo(() => (day ? encourage(day.work, standing, firstNameOf(user?.name)) : null), [day, standing, user?.name]);
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
