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
  minutesOfDay,
  motivationFor,
  praiseLine,
  SHOW_MY_DAY_EVENT,
  streakCardView,
  whenText,
  type MotivationStats,
  type StreakCardView,
} from "../../engine/motivation";
import { askSignInDaysFor, SIGN_IN_DAYS_EVENT } from "../../engine/signInDays";
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
//
// BESIDE IT, NEVER INSIDE IT, THE DAILY STREAK (the owner, 25-Oct-2026: "like
// snapchat"; engine/streakCore.ts): the big 🔥 and the working days in a row
// kept — signed in, nothing of theirs missed — how today stands, the best run,
// the last fourteen days as small squares (kept, missed, closed, today; each
// in words for a screen reader and as its tooltip), and one short line: a kept
// day is a day with nothing missed, which is what keeps the score at 0. The
// score's arithmetic is not touched (REQUIREMENTS §92: nobody is shown two
// answers). The super admin, who has no streak of their own, sees none. The top
// bar's counter opens the card (showMyDay).

/** When the top bar's counter last asked for the card: a card drawn just after (the Dashboard opening) shows itself. */
let showAskedAt = 0;

/** THE TOP BAR'S COUNTER, PRESSED: the day card scrolls into view and takes the focus — now, or as it is drawn. */
export function showMyDay(): void {
  showAskedAt = Date.now();
  try {
    window.dispatchEvent(new Event(SHOW_MY_DAY_EVENT));
  } catch {
    /* no window */
  }
}

/** The streak beside the score: the big 🔥 and the count, the strip of fourteen days, today and the best run (exported for frontend/tests/dailyStreak.test.ts). */
export function StreakBox({ view, lang }: { view: StreakCardView; lang: Language }) {
  return (
    <div className="my-day-streak" data-field="my-day-streak" data-tone={view.tone} data-days={String(view.days)}>
      <div className="my-day-streak-label">{cheerText(lang, "cheer.run.label")}</div>
      <div className="my-day-streak-head">
        <span className="my-day-streak-flame" aria-hidden="true">
          🔥
        </span>
        <span className="my-day-streak-num notranslate" translate="no" data-field="my-day-streak-days">
          {view.days}
        </span>
        <span className="my-day-streak-unit">{view.unit}</span>
      </div>
      <ol className="streak-strip" data-field="my-day-strip" aria-label={view.stripLabel}>
        {view.strip.map((d) => (
          <li key={d.date} className={`streak-day is-${d.state}`} data-state={d.state} data-date={d.date} title={d.label}>
            <span className="sr-only">{d.label}</span>
          </li>
        ))}
      </ol>
      {/* How today stands, and the best run beside it: one line, so the box keeps near the score's height. */}
      <div className="my-day-streak-row">
        <span className="my-day-streak-today" data-field="my-day-streak-today">
          {view.todayLine}
        </span>
        {view.bestLine && (
          <span className="my-day-streak-best" data-field="my-day-streak-best">
            {view.bestLine}
          </span>
        )}
      </div>
    </div>
  );
}

const RING_R = 27;
const RING_C = 2 * Math.PI * RING_R;

/** Today's score, the card's headline: the number (its own element, never translated), and how to reach 0. */
function Score({ stats, lang }: { stats: MotivationStats | null; lang: Language }) {
  // The super admin answers for no document (REQUIREMENTS §96): the plant's day, and no score of their own.
  const score = stats && !stats.plantDay ? stats.gapScore : null;
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
        {stats ? (stats.plantDay ? cheerText(lang, "cheer.score.plant") : gapScoreNote(stats.day.done, stats.day.total, lang)) : " "}
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
  const { user, session } = useAuth();
  const { navigate } = useRouter();
  const today = todayISO();
  const [stats, setStats] = useState<MotivationStats | null>(null);
  // The time of day, for the streak's hourglass from 15:30: a minute's tick redraws, nothing is walked.
  const [minutes, setMinutes] = useState(() => minutesOfDay());
  const asked = useRef(false);
  const card = useRef<HTMLElement | null>(null);

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

  // The person's own sign-in days (engine/signInDays.ts, once a day and after a sign-in): when they come — asked
  // here or by the top bar's counter — the streak is worked out again with them.
  useEffect(() => {
    let alive = true;
    const again = () => {
      if (!alive) return;
      try {
        setStats(motivationFor(user, false));
      } catch {
        /* the card keeps what it showed */
      }
    };
    window.addEventListener(SIGN_IN_DAYS_EVENT, again);
    askSignInDaysFor(user, session?.id ?? null).catch(() => false);
    const tick = window.setInterval(() => setMinutes(minutesOfDay()), 60 * 1000);
    return () => {
      alive = false;
      window.removeEventListener(SIGN_IN_DAYS_EVENT, again);
      window.clearInterval(tick);
    };
  }, [user?.id, session?.id]);

  // Asked for by the top bar's counter: into view, with the focus (a card drawn just after the ask shows itself).
  useEffect(() => {
    const show = () => {
      const el = card.current;
      if (!el) return;
      showAskedAt = 0;
      el.scrollIntoView({ block: "nearest" });
      el.focus({ preventScroll: true });
    };
    if (Date.now() - showAskedAt < 3000) window.setTimeout(show, 0);
    window.addEventListener(SHOW_MY_DAY_EVENT, show);
    return () => window.removeEventListener(SHOW_MY_DAY_EVENT, show);
  }, []);

  const title = cheerText(uiLang, "cheer.day.title", { name: firstNameOf(user?.name) });

  if (!stats) {
    return (
      <section ref={card} id="my-day" tabIndex={-1} className="card mb-4 my-day no-print" data-section="my-day" data-state="loading">
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
  // The super admin's card is the plant's day: no streak of their own (null).
  const streak = streakCardView(stats, minutes, uiLang);
  const onTime = stats.onTimeThisMonth === null ? cheerText(uiLang, "cheer.day.onTimeNone") : cheerText(uiLang, "cheer.onTimeMonth", { pct: stats.onTimeThisMonth });
  const badges = stats.achievements.map((k) => badgeFor(k, uiLang));
  const purpose = next ? purposeLine(next.module, uiLang, seed) : generalPurposeLine(uiLang, seed);
  const nextName = next ? `${next.formatNo ? `${next.formatNo} ` : ""}${documentTextIn(next.name, lang)}` : "";

  return (
    <section
      ref={card}
      id="my-day"
      tabIndex={-1}
      className={`card mb-4 my-day no-print is-${state}`}
      data-section="my-day"
      data-state={state}
      data-plant-day={stats.plantDay ? "yes" : undefined}
    >
      <div className={`my-day-body${streak ? " has-streak" : ""}`}>
        <Score stats={stats} lang={uiLang} />
        {streak && <StreakBox view={streak} lang={uiLang} />}
        <Ring done={day.done} total={day.total} label={cheerText(uiLang, "cheer.day.ring", { done: day.done, total: day.total })} />
        <div className="my-day-main">
          <div className="my-day-title">{title}</div>
          <div className="my-day-line" data-field="my-day-line">
            {line}
          </div>
          <div className="my-day-chips">
            <span className="my-day-chip" data-field="my-day-ontime">
              {onTime}
            </span>
            {day.remaining > 0 && (
              <span className="my-day-chip my-day-left" data-field="my-day-left">
                {cheerText(uiLang, day.remaining === 1 ? "cheer.day.left.one" : "cheer.day.left.many", { n: day.remaining })}
              </span>
            )}
          </div>
          {/* The streak's rule in one short line: a kept day is a day with nothing missed — what keeps the score at 0. */}
          {streak && (
            <div className="my-day-streak-rule" data-field="my-day-streak-rule">
              {`🔥 ${streak.rule}`}
            </div>
          )}
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
