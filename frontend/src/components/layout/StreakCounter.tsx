import React, { useEffect, useRef, useState } from "react";
import { useAppStore } from "../../store/AppStore";
import { useAuth } from "../../store/AuthContext";
import { useRouter } from "../../store/router";
import { askAccountsFor, keptDayToCelebrate, minutesOfDay, motivationFor, STREAK_KEPT_EVENT, streakBarView, type MotivationStats } from "../../engine/motivation";
import { askSignInDaysFor, SIGN_IN_DAYS_EVENT } from "../../engine/signInDays";
import { REACTION_EVENT } from "../../engine/reactions";
import { showMyDay } from "../common/MyDayCard";
import { todayISO } from "../../utils/date";

// THE DAILY STREAK IN THE TOP BAR, ON EVERY SCREEN (the owner, 25-Oct-2026: "streak for user can atleast
// login daily for once and complete it work ... like snapchat").
//
// "🔥 6": the working days in a row the person kept - signed in, website or phone, and nothing of theirs
// late or never done (engine/streakCore.ts). With none, a quiet grey "🔥 0 Start a streak". From 15:30,
// while today is not kept yet, "⌛ 6 at risk", the reason in words in its tooltip ("Your 6-day streak is
// at risk: 2 records still to do today"); once kept, "Sign in tomorrow to keep it going". On a phone only
// the sign and the number (styles.css hides .topbar-label). A press opens the Dashboard's day card, with
// the last fourteen days. After the sound button, so the bar still begins connection, clock, language,
// theme, sound (the suites read that order). The super admin has no streak of their own: no counter.
//
// CHEAP ON EVERY SCREEN (REQUIREMENTS §65). engine/motivation.ts motivationFor is remembered against the
// records, the day, the person and their sign-in days, and is asked here only from a timeout: a moment
// after the page paints, a moment after the person hands something in (the "dcrs:reaction" of a submit,
// a verify, a send-back), when the sign-in days arrive, and a few seconds after the stored records last
// changed (a colleague's work pulled in) - so a sheet being typed into, saved every 700 ms, is never walked
// while the typing goes on, and nothing is walked while drawing. A minute's tick only redraws (the
// hourglass at 15:30), and works the streak out again only on a new day.
//
// WHEN TODAY BECOMES KEPT and was not celebrated yet - at the sign-in on a day with nothing of theirs due,
// or when a colleague's work leaves nothing waiting - it asks components/common/Celebration.tsx for the
// kept day's celebration (STREAK_KEPT_EVENT), once a day; the last record's own celebration counts as
// today's. The flame lights up (a short scale, once; nothing moves under reduced motion) when today
// becomes kept or the streak grows while the page is open.

/** The first look, once the page has painted. */
const FIRST_MS = 700;
/** After something handed in here: after the reaction's own celebration (150 ms) has had its turn. */
const AFTER_REACTION_MS = 1200;
/** After the stored records last changed: a sheet autosaves every 700 ms while typed into. */
const SETTLE_MS = 4000;
/** The minute's tick: the hourglass at 15:30, a new day at midnight. */
const TICK_MS = 60 * 1000;

export function StreakCounter() {
  const { user, session } = useAuth();
  const { version, uiLang } = useAppStore();
  const { navigate } = useRouter();
  const staff = !!user && user.role !== "admin";
  const [stats, setStats] = useState<MotivationStats | null>(null);
  const [minutes, setMinutes] = useState(() => minutesOfDay());
  const [litSeq, setLitSeq] = useState(0);
  const live = useRef({ user, stats });
  live.current = { user, stats };
  // Whether this person's sign-in days have been asked for (answered or not): a kept day is celebrated
  // only after, so the celebration counts the days the way the counter will show them.
  const signInsAsked = useRef(false);
  /** The streak as last worked out with the sign-in days asked for: what "it grew" is measured from. */
  const settled = useRef<MotivationStats | null>(null);
  const timers = useRef<{ soon?: number; settle?: number }>({});

  const work = useRef(() => {});
  work.current = () => {
    const person = live.current.user;
    if (!person || person.role === "admin") return;
    let next: MotivationStats;
    try {
      next = motivationFor(person, false);
    } catch {
      return; // the counter keeps what it showed
    }
    setStats(next);
    setMinutes(minutesOfDay());
    // Lit when today becomes kept, or the streak grows, while the page is open - not when the sign-in days
    // first arrive and the count the records alone gave is put right.
    const asked = signInsAsked.current;
    const before = settled.current;
    if (asked) settled.current = next;
    const celebrate = asked && keptDayToCelebrate(next);
    const grew = asked && !!before && next.today === before.today && next.streakDays > before.streakDays;
    if (celebrate || grew) setLitSeq((n) => n + 1);
    if (celebrate) {
      try {
        window.dispatchEvent(new Event(STREAK_KEPT_EVENT));
      } catch {
        /* a celebration is never worth an error */
      }
    }
  };

  /** Works the streak out `ms` from now, unless it is already due sooner. */
  const soon = (ms: number) => {
    if (timers.current.soon !== undefined) window.clearTimeout(timers.current.soon);
    timers.current.soon = window.setTimeout(() => {
      timers.current.soon = undefined;
      work.current();
    }, ms);
  };

  // The person's own sign-in days, once a day and again after a sign-in (a new session); the accounts of their
  // departments (a colleague's record is theirs). Each, when it comes, has the streak worked out again.
  useEffect(() => {
    if (!staff) return;
    signInsAsked.current = false;
    let alive = true;
    askSignInDaysFor(user, session?.id ?? null)
      .catch(() => false)
      .finally(() => {
        if (!alive) return;
        signInsAsked.current = true;
        soon(300);
      });
    askAccountsFor(user)
      .then((fresh) => {
        if (alive && fresh) soon(300);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [staff, user?.id, user?.departments?.join(","), session?.id]);

  // The first look; the person's own actions; sign-in days that arrived for another reason (the day card asked).
  useEffect(() => {
    if (!staff) return;
    soon(FIRST_MS);
    const onReaction = () => soon(AFTER_REACTION_MS);
    const onSignIns = () => soon(300);
    window.addEventListener(REACTION_EVENT, onReaction);
    window.addEventListener(SIGN_IN_DAYS_EVENT, onSignIns);
    const tick = window.setInterval(() => {
      setMinutes(minutesOfDay());
      // A new day: everything is judged afresh (today, yesterday's last records, the sign-in days).
      const shown = live.current.stats;
      if (shown && shown.today !== todayISO()) {
        askSignInDaysFor(live.current.user, null).catch(() => false);
        soon(300);
      }
    }, TICK_MS);
    return () => {
      window.removeEventListener(REACTION_EVENT, onReaction);
      window.removeEventListener(SIGN_IN_DAYS_EVENT, onSignIns);
      window.clearInterval(tick);
      for (const t of Object.values(timers.current)) if (t !== undefined) window.clearTimeout(t);
      timers.current = {};
    };
  }, [staff, user?.id]);

  // The stored records changed (a save here, a colleague's work pulled in): a while after the last change.
  const firstVersion = useRef(true);
  useEffect(() => {
    if (!staff) return;
    if (firstVersion.current) {
      firstVersion.current = false;
      return;
    }
    if (timers.current.settle !== undefined) window.clearTimeout(timers.current.settle);
    timers.current.settle = window.setTimeout(() => {
      timers.current.settle = undefined;
      work.current();
    }, SETTLE_MS);
  }, [staff, version]);

  if (!staff) return null;
  const view = streakBarView(stats, minutes, uiLang);
  return (
    <button
      type="button"
      className={`btn btn-ghost btn-sm streak-counter is-${view.state}`}
      data-action="open-streak"
      data-field="topbar-streak"
      data-state={view.state}
      data-days={stats ? String(view.days) : undefined}
      aria-label={view.tip}
      title={view.tip}
      onClick={() => {
        navigate("/dashboard");
        showMyDay();
      }}
    >
      <span key={litSeq} className={`streak-counter-icon${litSeq > 0 ? " is-lit" : ""}`} aria-hidden="true">
        {view.icon}
      </span>
      <span className="streak-counter-num notranslate" translate="no" data-field="topbar-streak-days">
        {stats ? view.days : "–"}
      </span>
      {view.label && <span className="topbar-label streak-counter-label">{view.label}</span>}
    </button>
  );
}
