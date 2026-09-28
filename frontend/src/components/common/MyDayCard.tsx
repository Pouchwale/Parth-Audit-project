import React, { useEffect, useRef, useState } from "react";
import { FiArrowRight } from "react-icons/fi";
import { useAppStore } from "../../store/AppStore";
import { useAuth } from "../../store/AuthContext";
import { useRouter } from "../../store/router";
import {
  askAccountsFor,
  badgeFor,
  cheerText,
  firstNameOf,
  formatGapScore,
  gapScoreNote,
  gapTone,
  lateLine,
  motivationFor,
  praiseLine,
  whenText,
  type MotivationStats,
} from "../../engine/motivation";
import { generalPurposeLine, purposeLine } from "../../engine/purpose";
import { documentTextIn } from "../../i18n/documentText";
import type { Language } from "../../i18n/strings";
import { todayISO } from "../../utils/date";

// THE PERSON'S DAY, AT THE TOP OF THE DASHBOARD (REQUIREMENTS §81).
//
// One look says how today is going and what to do next: a ring of today's work
// done, the streak of days all on time, the month's on-time share, the badges
// today's work has earned, the next thing to do (one press away), and — so the
// motivation is never only a number — why that next record matters to the
// customer, the team, an audit or somebody's safety (engine/purpose.ts). When
// it is all done the card says so, warmly.
//
// WORKED OUT AFTER THE DASHBOARD IS DRAWN (engine/motivation.ts walks the
// person's records): first in a timeout just after the page paints, then again
// half a second after the store changes (a record saved here or pulled from a
// colleague), never while drawing. Every figure sits in an element of its own,
// so a page translated by Google keeps working when a figure changes. Never
// printed; never wider than a phone.
//
// THE HEADLINE IS TODAY'S SCORE, counted from what is missing (the plant,
// 27-Sep-2026): 8 of 10 done reads −20, not 80 — "only" is what moves people —
// and only a day with nothing missing reads 0. Under it, in plain words, what
// the number means and how to reach 0 (engine/motivation.ts dayGapScore).

const RING_R = 27;
const RING_C = 2 * Math.PI * RING_R;

/** Today's score, the card's headline: the number (its own element, never translated), and how to reach 0. */
function Score({ stats, lang }: { stats: MotivationStats | null; lang: Language }) {
  const score = stats ? stats.gapScore : null;
  const tone = score === null ? "none" : gapTone(score);
  return (
    <div className="my-day-score" data-tone={tone} title={cheerText(lang, "cheer.score.explain")}>
      <div className="my-day-score-label">{cheerText(lang, "cheer.score.label")}</div>
      <div
        className={`my-day-score-num notranslate tone-${tone}`}
        translate="no"
        data-field={score === null ? undefined : "my-day-score"}
        data-score={score === null ? undefined : String(score)}
        data-tone={score === null ? undefined : tone}
      >
        {score === null ? "–" : formatGapScore(score)}
      </div>
      <div className="my-day-score-line" data-field={stats ? "my-day-score-line" : undefined}>
        {stats ? gapScoreNote(stats.day.done, stats.day.total, lang) : " "}
      </div>
    </div>
  );
}

function Ring({ done, total, label }: { done: number; total: number; label: string }) {
  const frac = total === 0 ? 1 : Math.min(1, done / total);
  return (
    <div className="my-day-ring" role="img" aria-label={label}>
      <svg viewBox="0 0 64 64" width="76" height="76" aria-hidden="true" focusable="false">
        <circle className="my-day-ring-track" cx="32" cy="32" r={RING_R} />
        <circle
          className="my-day-ring-fill"
          cx="32"
          cy="32"
          r={RING_R}
          strokeDasharray={`${RING_C.toFixed(2)} ${RING_C.toFixed(2)}`}
          strokeDashoffset={(RING_C * (1 - frac)).toFixed(2)}
          transform="rotate(-90 32 32)"
        />
      </svg>
      <span className="my-day-ring-count notranslate" translate="no" data-field="my-day-count">
        {total === 0 ? "✓" : `${done}/${total}`}
      </span>
    </div>
  );
}

export function MyDayCard() {
  const { version, lang, uiLang } = useAppStore();
  const { user } = useAuth();
  const { navigate } = useRouter();
  const today = todayISO();
  const [stats, setStats] = useState<MotivationStats | null>(null);
  const asked = useRef(false);

  useEffect(() => {
    // The first time just after the page has painted; after that, half a second after the last change.
    const delay = asked.current ? 500 : 60;
    asked.current = true;
    let alive = true;
    const show = () => {
      if (!alive) return;
      try {
        setStats(motivationFor(user, false));
      } catch {
        /* the card keeps what it showed */
      }
    };
    const timer = window.setTimeout(() => {
      show();
      // The accounts of their departments (kept a few minutes): when a new list comes, a record a colleague
      // of a shared department handed in is told apart, and the figures are worked out again with it.
      askAccountsFor(user)
        .then((fresh) => {
          if (fresh) show();
        })
        .catch(() => undefined);
    }, delay);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [version, user?.id, user?.name, user?.departments?.join(","), today]);

  const title = cheerText(uiLang, "cheer.day.title", { name: firstNameOf(user?.name) });

  if (!stats) {
    return (
      <section className="card mb-4 my-day no-print" data-section="my-day" data-state="loading">
        <div className="my-day-body">
          <Score stats={null} lang={uiLang} />
          <Ring done={0} total={1} label={cheerText(uiLang, "cheer.day.loading")} />
          <div className="my-day-main">
            <div className="my-day-title">{title}</div>
            <div className="my-day-line" data-field="my-day-line">
              {cheerText(uiLang, "cheer.day.loading")}
            </div>
          </div>
        </div>
      </section>
    );
  }

  const { day, next } = stats;
  const state = day.total === 0 ? "free" : day.remaining === 0 ? "all-done" : "working";
  const seed = `${today}|${day.done}|${day.remaining}`;
  const line =
    state === "free"
      ? praiseLine("nothingDue", stats, uiLang, seed)
      : state === "all-done"
        ? praiseLine("dayHappy", stats, uiLang, seed)
        : day.overdue > 0
          ? lateLine("waiting", { count: day.overdue, today }, uiLang, seed)
          : praiseLine("progress", stats, uiLang, seed);
  const streak =
    stats.streakDays === 0
      ? cheerText(uiLang, "cheer.day.streak.none")
      : cheerText(uiLang, stats.streakDays === 1 ? "cheer.day.streak.one" : "cheer.day.streak.many", { n: stats.streakDays });
  const onTime = stats.onTimeThisMonth === null ? cheerText(uiLang, "cheer.day.onTimeNone") : cheerText(uiLang, "cheer.onTimeMonth", { pct: stats.onTimeThisMonth });
  const badges = stats.achievements.map((k) => badgeFor(k, uiLang));
  const purpose = next ? purposeLine(next.module, uiLang, seed) : generalPurposeLine(uiLang, seed);
  const nextName = next ? `${next.formatNo ? `${next.formatNo} ` : ""}${documentTextIn(next.name, lang)}` : "";

  return (
    <section className={`card mb-4 my-day no-print is-${state}`} data-section="my-day" data-state={state}>
      <div className="my-day-body">
        <Score stats={stats} lang={uiLang} />
        <Ring done={day.done} total={day.total} label={cheerText(uiLang, "cheer.day.ring", { done: day.done, total: day.total })} />
        <div className="my-day-main">
          <div className="my-day-title">{title}</div>
          <div className="my-day-line" data-field="my-day-line">
            {line}
          </div>
          <div className="my-day-chips">
            <span className="my-day-chip my-day-streak" data-field="my-day-streak">
              {streak}
            </span>
            <span className="my-day-chip" data-field="my-day-ontime">
              {onTime}
            </span>
            {day.remaining > 0 && (
              <span className="my-day-chip my-day-left" data-field="my-day-left">
                {cheerText(uiLang, day.remaining === 1 ? "cheer.day.left.one" : "cheer.day.left.many", { n: day.remaining })}
              </span>
            )}
          </div>
          {badges.length > 0 && (
            <div className="my-day-badges" data-field="my-day-badges" aria-label={cheerText(uiLang, "cheer.day.badges")}>
              {badges.map((b) => (
                <span key={b.key} className="cheer-badge" data-badge={b.module ? "module-hero" : b.key} title={b.module}>
                  {`${b.emoji} ${b.label}`}
                </span>
              ))}
            </div>
          )}
          <div className="my-day-purpose" data-field="my-day-purpose">
            {`💡 ${purpose}`}
          </div>
        </div>
        {next && (
          <div className="my-day-next" data-field="my-day-next">
            <div className="my-day-next-label">{cheerText(uiLang, "cheer.day.nextUp")}</div>
            <div className="my-day-next-what notranslate" translate="no" title={nextName}>
              {nextName}
            </div>
            <div className={`my-day-next-when${next.daysUntilDue < 0 ? " is-late" : ""}`}>{whenText(next.dueDate, today, uiLang)}</div>
            <button type="button" className="btn btn-primary btn-sm" data-action="my-day-next" data-route={next.route} onClick={() => navigate(next.route)}>
              <span>{cheerText(uiLang, "cheer.day.next")}</span>
              <FiArrowRight size={13} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
