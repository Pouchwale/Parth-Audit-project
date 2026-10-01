import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { settingsRepository } from "../../data/repositories/settingsRepository";
import { todayISO } from "../../utils/date";
import { underAutomation } from "../auth/IntroSplash";
import { placeCard, spotFor, tourStartsByItself, tourSteps, unionBox, type Box, type CardSide, type TourStep } from "./tourSteps";

// THE GUIDED TOUR OF THE WHOLE SOFTWARE (REQUIREMENTS §85), drawn over the
// Dashboard. What it says and where it points is tourSteps.ts; this is the
// drawing and the keys.
//
//   * It STARTS BY ITSELF once a day, on the person's first visit to the Dashboard,
//     for everybody — the super admin included — until they tick "Don't show this
//     again" (their own setting, kept with their other settings in the database,
//     so it holds on every computer they sign in on). It waits for anything
//     already over the Dashboard to go first: the day's briefing, a pop-up, the
//     opening. "Take the tour" on the Dashboard runs it at any time.
//   * NOT BY ITSELF UNDER AUTOMATION (navigator.webdriver, i.e. the Playwright
//     suites): the 51 suites that do not know it exists would find it over the
//     Dashboard and every click of theirs caught. tests/e2e_tour.py overrides
//     navigator.webdriver to test the real start.
//   * While it runs it has the screen: the part it speaks of is lit, the rest is
//     dimmed and takes no click; Next, Back and Skip tour, the arrow keys, and
//     Escape to end it. When it is not running it is not on the page at all —
//     nothing of it can cover a click.
//   * Cheap on a slow laptop: a handful of elements, measured once a step (and
//     again only when the window scrolls or the page's size changes); nothing
//     animates but a fade and a pulse on transforms and opacity, and nothing at
//     all for somebody who asks for less motion (public/styles/tour.css).

/** Fired on window to run the tour (the Dashboard's "Take the tour"). */
export const START_TOUR_EVENT = "dcrs:start-tour";

/** Runs the tour now, from its first step. */
export function startTour(): void {
  window.dispatchEvent(new Event(START_TOUR_EVENT));
}

/** Things that may be over the Dashboard when the tour would start by itself: it waits for each to go. */
export const TOUR_WAITS_FOR = ".briefing, .modal-overlay, [data-section='intro-splash'], [data-section='password-required']";
/** The first look, once the Dashboard and whatever opens with it have drawn; then again every so often while something is over it. */
const FIRST_LOOK_MS = 1200;
const LOOK_AGAIN_MS = 800;
/** The card's width before it has been measured (tour.css: min(360px, 100vw - 24px)). */
const CARD_GUESS = { width: 360, height: 230 };

export interface GuidedTourProps {
  /** The signed-in account's id: whose "Don't show this again" and "started today" these are. */
  personId: string;
  personName: string;
  /** The super admin (role "admin"): the tour covers their own pages too. */
  admin: boolean;
}

/**
 * The tour's host, mounted on the Dashboard. Memoised on its three plain props,
 * so the Dashboard drawing itself again (every change to the records) never
 * draws the tour again.
 */
export const GuidedTour = React.memo(function GuidedTour({ personId, personName, admin }: GuidedTourProps) {
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [run, setRun] = useState(0);
  const [off, setOff] = useState(false);
  // Run on this visit already (by hand, or by itself): the day's start by itself must not run it over again.
  const begun = useRef(false);

  const begin = useCallback(() => {
    begun.current = true;
    // The modules as this person's sidebar names them, in its order.
    const modules = Array.from(document.querySelectorAll("#app-sidebar .nav-module-name"), (e) => (e.textContent || "").trim()).filter(Boolean);
    const all = tourSteps({ name: personName, admin, modules });
    // A step whose part is nowhere on this person's screen is left out, so the counter never counts it.
    const shown = all.filter((s) => !s.target || [...s.target, ...(s.fallback ?? [])].some((sel) => document.querySelector(sel)));
    setOff(settingsRepository.tourFor(personId).off);
    setRun((n) => n + 1);
    setSteps(shown);
  }, [personId, personName, admin]);

  useEffect(() => {
    const onStart = () => begin();
    window.addEventListener(START_TOUR_EVENT, onStart);
    return () => window.removeEventListener(START_TOUR_EVENT, onStart);
  }, [begin]);

  // By itself: once a day, on the first visit to the Dashboard, once nothing else is over it.
  useEffect(() => {
    if (!personId) return;
    const automated = underAutomation();
    const today = todayISO();
    if (!tourStartsByItself(settingsRepository.tourFor(personId), today, automated)) return;
    let alive = true;
    let timer = 0;
    const look = () => {
      if (!alive) return;
      // "Take the tour" ran it while this waited: today's tour has been shown, so it is not started (or restarted) again.
      if (begun.current) {
        settingsRepository.markTourStarted(personId, today);
        return;
      }
      if (document.hidden || document.querySelector(TOUR_WAITS_FOR)) {
        timer = window.setTimeout(look, LOOK_AGAIN_MS);
        return;
      }
      // Asked again: another tab may have started it meanwhile.
      if (!tourStartsByItself(settingsRepository.tourFor(personId), today, automated)) return;
      settingsRepository.markTourStarted(personId, today);
      begin();
    };
    timer = window.setTimeout(look, FIRST_LOOK_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [personId, begin]);

  const dontShow = useCallback(
    (value: boolean) => {
      setOff(value);
      settingsRepository.setTourOff(personId, value);
    },
    [personId]
  );
  const end = useCallback(() => setSteps(null), []);

  if (!steps || steps.length === 0) return null;
  // Drawn at the foot of the document, outside the page: a page arriving is moved for a moment (delight.css),
  // and a moved ancestor would carry a fixed layer with it.
  return createPortal(<TourLayer key={run} steps={steps} off={off} onDontShow={dontShow} onEnd={end} />, document.body);
});

/** Shown, drawn and not tucked away (a closed menu is hidden from everybody and marked so). */
function shown(el: Element): boolean {
  if (el.closest("[aria-hidden='true'], [inert]")) return false;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none";
}

function onScreen(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
}

/**
 * Brings a part into sight, moving nothing that need not move ("nearest": not the
 * window for a sidebar link already in it, only the sidebar's own list) — and, for
 * a part of the page itself, clear of the top bar, which stays over the page as it
 * scrolls.
 */
function bringIntoSight(el: Element): void {
  try {
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" as ScrollBehavior });
  } catch {
    return;
  }
  if (!el.closest(".app-content")) return;
  const bar = document.querySelector(".app-topbar")?.getBoundingClientRect().bottom ?? 0;
  const r = el.getBoundingClientRect();
  let dy = 0;
  if (r.top < bar + 8) dy = r.top - bar - 8;
  else if (r.bottom > window.innerHeight - 8) dy = Math.min(r.bottom - window.innerHeight + 8, r.top - bar - 8);
  if (dy) window.scrollBy({ top: dy, behavior: "instant" as ScrollBehavior });
}

/** The parts a step speaks of that can be seen; brought into sight when asked — the last, then the first, so as many as fit are in sight together. */
function partsOf(selectors: string[], scroll: boolean): Element[] {
  const parts: Element[] = [];
  for (const sel of selectors) {
    for (const el of Array.from(document.querySelectorAll(sel))) if (shown(el)) parts.push(el);
  }
  if (scroll && parts.length) {
    if (parts.length > 1) bringIntoSight(parts[parts.length - 1]);
    bringIntoSight(parts[0]);
  }
  return parts.filter(onScreen);
}

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

interface Placed {
  spot: Box | null;
  card: { left: number; top: number; side: CardSide };
  /** Whether the step's own part was found (not its fallback, not nothing). */
  found: "target" | "fallback" | "none" | "centre";
}

function TourLayer({ steps, off, onDontShow, onEnd }: { steps: TourStep[]; off: boolean; onDontShow: (value: boolean) => void; onEnd: () => void }) {
  const [index, setIndex] = useState(0);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;
  const text = placed?.found === "fallback" && step.fallbackText ? step.fallbackText : step.text;

  // What had the keyboard, and where the window was, before: both given back at the end.
  const before = useRef<{ focus: Element | null; scrollY: number }>({ focus: null, scrollY: 0 });
  useEffect(() => {
    before.current = { focus: document.activeElement, scrollY: window.scrollY };
    return () => {
      const { focus, scrollY } = before.current;
      try {
        window.scrollTo({ top: scrollY, behavior: "instant" as ScrollBehavior });
      } catch {
        window.scrollTo(0, scrollY);
      }
      const back = focus instanceof HTMLElement && focus.isConnected && focus !== document.body ? focus : (document.querySelector("[data-action='take-tour']") as HTMLElement | null);
      back?.focus({ preventScroll: true });
    };
  }, []);

  const measure = useCallback(
    (scroll: boolean) => {
      const view = { width: document.documentElement.clientWidth || window.innerWidth, height: window.innerHeight };
      let found: Placed["found"] = "centre";
      let parts: Element[] = [];
      if (step.target) {
        parts = partsOf(step.target, scroll);
        found = parts.length ? "target" : "none";
        if (!parts.length && step.fallback) {
          parts = partsOf(step.fallback, scroll);
          if (parts.length) found = "fallback";
        }
      }
      const spot = spotFor(unionBox(parts.map(boxOf)), view);
      const el = cardRef.current;
      const size = el ? { width: el.offsetWidth, height: el.offsetHeight } : CARD_GUESS;
      const card = placeCard(spot, size, view);
      setPlaced((prev) =>
        prev && prev.found === found && prev.card.left === card.left && prev.card.top === card.top && prev.card.side === card.side && sameBox(prev.spot, spot) ? prev : { spot, card, found }
      );
    },
    [step]
  );

  // Each step: its part brought into sight and measured before the frame is painted; measured
  // again when the words changed the card's height (a fallback's words are other words).
  useLayoutEffect(() => {
    measure(true);
  }, [measure]);
  useLayoutEffect(() => {
    measure(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed?.found]);

  // The keyboard to the Next button at each step.
  useEffect(() => {
    try {
      nextRef.current?.focus({ preventScroll: true });
    } catch {
      /* the keys below still work */
    }
  }, [index]);

  // Followed when the window scrolls or changes size, or the page under it grows (a notice arriving):
  // measured at most once a frame, never scrolling anything itself.
  useEffect(() => {
    let frame = 0;
    const again = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        measure(false);
      });
    };
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener("resize", again, opts);
    document.addEventListener("scroll", again, opts);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver === "function") {
      observer = new ResizeObserver(again);
      for (const el of Array.from(document.querySelectorAll(".app-content, #app-sidebar"))) observer.observe(el);
    }
    return () => {
      window.removeEventListener("resize", again, opts);
      document.removeEventListener("scroll", again, opts);
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [measure]);

  const next = useCallback(() => (last ? onEnd() : setIndex((i) => Math.min(i + 1, steps.length - 1))), [last, onEnd, steps.length]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Escape ends it; the arrows move through it; Tab stays in the card.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Esc") {
        e.preventDefault();
        e.stopPropagation();
        onEnd();
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "ArrowRight") next();
        else back();
        return;
      }
      if (e.key === "Tab" && cardRef.current) {
        const stops = Array.from(cardRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)"));
        if (!stops.length) return;
        const at = stops.indexOf(document.activeElement as HTMLElement);
        const to = e.shiftKey ? (at <= 0 ? stops.length - 1 : at - 1) : at < 0 || at >= stops.length - 1 ? 0 : at + 1;
        e.preventDefault();
        stops[to].focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [next, back, onEnd]);

  const spot = placed?.spot ?? null;
  const card = placed?.card;
  return (
    <div className="tour-layer no-print" data-section="tour" data-step={step.id} data-index={index} data-count={steps.length} data-found={placed?.found ?? "none"}>
      {/* Takes every click while the tour runs: the page under it waits. */}
      <div className="tour-block" aria-hidden="true" />
      {spot ? (
        <div className="tour-spot" data-section="tour-spot" aria-hidden="true" style={{ left: spot.left, top: spot.top, width: spot.width, height: spot.height }} key={`spot-${index}`} />
      ) : (
        <div className="tour-dim" aria-hidden="true" />
      )}
      <div
        ref={cardRef}
        key={`card-${index}`}
        className="tour-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-text"
        data-side={card?.side ?? "center"}
        style={card ? { left: card.left, top: card.top } : { left: -10000, top: 0 }}
      >
        <div className="tour-head">
          <span className="tour-count" data-field="tour-count">
            Step {index + 1} of {steps.length}
          </span>
          <span className="tour-bar" aria-hidden="true">
            <span className="tour-bar-fill" style={{ transform: `scaleX(${(index + 1) / steps.length})` }} />
          </span>
        </div>
        <h2 id="tour-title" className="tour-title">
          {step.title}
        </h2>
        <p id="tour-text" className="tour-text">
          {text}
        </p>
        <label className="tour-optout">
          <input type="checkbox" data-field="tour-dont-show" checked={off} onChange={(e) => onDontShow(e.target.checked)} />
          <span>Don&apos;t show this again</span>
        </label>
        <div className="tour-actions">
          <button type="button" className="btn btn-ghost btn-sm" data-action="tour-skip" onClick={onEnd}>
            Skip tour
          </button>
          <span className="tour-gap" />
          <button type="button" className="btn btn-secondary btn-sm" data-action="tour-back" onClick={back} disabled={index === 0}>
            Back
          </button>
          <button ref={nextRef} type="button" className="btn btn-primary btn-sm" data-action="tour-next" onClick={next}>
            {last ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

function sameBox(a: Box | null, b: Box | null): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
}
