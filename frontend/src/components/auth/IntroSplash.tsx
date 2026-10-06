import React, { useEffect, useRef, useState } from "react";
import type { IconType } from "react-icons";
import {
  FiAlertCircle,
  FiArchive,
  FiCheckSquare,
  FiCompass,
  FiLayers,
  FiPackage,
  FiShield,
  FiShoppingCart,
  FiTool,
  FiTrendingUp,
  FiTruck,
  FiUsers,
} from "react-icons/fi";
import { t } from "../../i18n";
import { COMPANY } from "../../data/seed/masterData";

// THE OPENING OF THE SYSTEM, IN MOTION GRAPHICS (REQUIREMENTS §81, §84, §85).
// §81: "make starting of this system like introduction of project name in 3d".
// §84 (30-Sep-2026): "the starting animation: use motion graphics there too, and it
// should take its time and only then open — make it really awesome for the user".
// §85 (30-Sep-2026): "Till now you have not added motion graphics before the login."
// The owner had never seen it: it played once per browser tab session, only in the
// first seconds after a page opened, and his first click or key lifted it — so a
// reload, a sign-out or the next morning's sign-in showed nothing.
//
// A 4.8 s sequence, opaque while it plays (public/styles/brand.css, section 3b, has
// the timeline; public/styles/delight.css, section 6, what §85 added): light blooms
// and rays turn in the dark while particles stream out of it and streaks of light
// race across; the company's mark turns in, rings of light leave it and sparks
// circle it; "DCRS" flips up letter by letter as an extruded 3D wordmark, a shock
// ring spreads behind it and a light sweeps across it; the system's name rises into
// place word by word; the company's name — "Gujarat Print Pack Publications Pvt Ltd",
// as the owner gave it on 02-Oct-2026 — assembles out of letters flying
// in from every side; the modules' marks (the sidebar's, in its order) turn in one
// after another; a flare crosses the whole of it while a progress line fills; then
// a line of light splits the veil, which opens top and bottom.
//
// WHERE IT PLAYS, AND HOW (the two places are different on purpose):
//   * THE SIGN-IN SCREEN (AuthScreen, place "signin") — EVERY TIME it is shown: a
//     fresh load, a reload, after signing out, after the day's session ended
//     (§84 ends every session at the close of its day). In full, and BEFORE the
//     form can be used: the form beneath is inert while it plays (AuthScreen), a
//     layer catches the pointer (.intro-catch), so a stray click or key does
//     nothing; a clear "Skip" button and the Escape key lift it at once.
//     Somebody whose system asks for less motion gets the CALM version (kind
//     "calm", INTRO_CALM_MS): the same pieces arriving by fades and glows —
//     sparkles, a breathing light, a halo, letters appearing one by one — with
//     nothing travelling, turning or flying.
//   * THE OPENING OF A SIGNED-IN SESSION (SessionIntro, place "session") — as
//     before §85: once a browser session, within its opening moments, a layer
//     that catches nothing and that the first key, click, tap or wheel lifts;
//     a plain fade under reduced motion.
//
// AUTOMATION (navigator.webdriver is true: Playwright, Selenium — never a person's
// browser). The suites type into the sign-in form within a second or two of
// loading it, and 51 of them know nothing of this. So under automation, and only
// there, the sign-in opening behaves as it did before §85: the same sequence, but
// a layer that catches nothing over a form that is not held, which YIELDS at once
// to the first key, click, tap, wheel or focus in the form — the moment a script
// types into it. A person never meets this path; tests/e2e_intro_and_fonts.py
// tests both, the person's by overriding navigator.webdriver.
//
// What it never does:
//   * outstay its welcome: it ends at its length by its own timer, at
//     INTRO_HARD_STOP_MS by a second one whatever became of the first, its
//     stylesheet leaves it transparent at its length and moves the pointer
//     catcher off the screen at the hard stop even if no script ran at all, and
//     AuthScreen lets go of the form at the hard stop by a timer of its own;
//   * play right after signing in, or on the choose-your-password step
//     (AuthLayout), or twice over a session's app (sessionStorage);
//   * use anything but CSS transforms and opacity: no canvas, no WebGL, no library,
//     nothing fetched but the logo and the faces every screen uses anyway. Every
//     movement runs on the graphics card, so a busy page thread does not stutter it.
// Its words are marks: "DCRS", the system's name, and the company's name, which is
// written as it is in every language (REQUIREMENTS §58).

/** The whole sequence, from the first frame to leaving the page. */
export const INTRO_MS = 4800;
/** When the veil starts to open on the page (brand.css: the doors hold until 88.5% of INTRO_MS). */
export const INTRO_REVEAL_MS = 4250;
/** The calm version on the sign-in screen, under prefers-reduced-motion (REQUIREMENTS §85): fades and glows. */
export const INTRO_CALM_MS = 4400;
/** A signed-in session's opening under prefers-reduced-motion: a plain fade, nothing moving. */
export const INTRO_PLAIN_MS = 900;
/** After Skip, Escape (or, for a session's opening, any key or click): the veil fades at once, in this long. */
export const INTRO_SKIP_MS = 380;
/** Whatever happens — a lost timer, a stalled page — it is gone by then. */
export const INTRO_HARD_STOP_MS = 6000;
/** A session's app reached later than this after the page opened is not its opening. */
export const OPENING_WINDOW_MS = 15000;
/** sessionStorage: the introduction has played in this browser session (a signed-in session's opening then does not). */
export const INTRO_SEEN_KEY = "dcrs:intro-seen";
/** On <html> while the introduction plays: the sign-in title waits for the veil to open (brand.css). */
export const INTRO_PLAYING_ATTR = "data-intro-playing";
/** The company's name as the owner gave it on 02-Oct-2026 (its stylesheet sets it in capitals) — a mark, never translated. */
export const INTRO_COMPANY = COMPANY.shortName;
/**
 * When the pieces drawn here set off, in ms from the first frame, and how long
 * each takes (the rest of the timeline is in brand.css, section 3b). Every piece
 * has arrived before the veil opens (INTRO_REVEAL_MS).
 */
export const INTRO_TIMELINE = {
  /** The system's name, word by word. */
  nameAt: 1350,
  nameWordStep: 110,
  nameTakes: 560,
  /** The company's name, letter by letter in a scattered order. */
  companyAt: 1850,
  companyStep: 26,
  companyTakes: 900,
  /** The modules' marks, one after another. */
  marksAt: 2350,
  marksStep: 65,
  marksTake: 620,
} as const;
/**
 * The calm version's timeline (delight.css, section 6): every piece fades in by
 * this plan, and all have arrived before the whole begins its gentle fade out
 * (86% of INTRO_CALM_MS).
 */
export const INTRO_CALM_TIMELINE = {
  logoAt: 150,
  logoTakes: 800,
  /** "DCRS", letter by letter (delight.css: calc(lettersAt + i * letterStep)). */
  lettersAt: 500,
  letterStep: 160,
  letterTakes: 700,
  nameAt: 1250,
  nameWordStep: 140,
  nameTakes: 700,
  companyAt: 1750,
  companyStep: 30,
  companyTakes: 600,
  marksAt: 2300,
  marksStep: 60,
  marksTake: 600,
  /** When the whole starts to fade (delight.css @keyframes intro-calm: 86%). */
  fadeAt: Math.round(INTRO_CALM_MS * 0.86),
} as const;

const WORDMARK = ["D", "C", "R", "S"] as const;

/** The modules' marks: the sidebar's own icon for each module, in the sidebar's order (Sidebar.tsx MODULE_ICONS). */
export const INTRO_MODULE_MARKS: readonly IconType[] = [
  FiCompass, // System / Management
  FiTrendingUp, // Marketing
  FiUsers, // Human Resources
  FiAlertCircle, // CAPA
  FiLayers, // Lamination — Quality Control
  FiPackage, // Production (REQUIREMENTS §91)
  FiTool, // Maintenance
  FiShoppingCart, // Purchase
  FiArchive, // Store
  FiTruck, // Dispatch
  FiCheckSquare, // Quality Control — Inspection Records
  FiShield, // Quality — Compliance
];

/** Where the opening plays: the sign-in screen, or over the app at a signed-in session's opening. */
export type IntroPlace = "signin" | "session";
/** The full sequence; the calm one (sign-in, less motion); the plain fade (a session's opening, less motion). */
export type IntroKind = "motion" | "calm" | "plain";

export interface IntroEnvironment {
  reducedMotion: boolean;
  seenThisSession: boolean;
  msSinceOpen: number;
}

/**
 * Whether a signed-in session's opening plays (SessionIntro): once a session,
 * within the opening moments — as before REQUIREMENTS §85. (The sign-in screen
 * plays it every time and asks nobody: AuthScreen.)
 */
export function introWantedFor(env: IntroEnvironment): boolean {
  return !env.seenThisSession && env.msSinceOpen <= OPENING_WINDOW_MS;
}

/** The full sequence; for somebody who asks for less motion, the calm version on the sign-in screen and the plain fade over the app. */
export function introKindFor(env: Pick<IntroEnvironment, "reducedMotion">, place: IntroPlace = "session"): IntroKind {
  if (!env.reducedMotion) return "motion";
  return place === "signin" ? "calm" : "plain";
}

/** How long each kind stays on the page by its own timer; never beyond the hard stop. */
export function introLengthFor(kind: IntroKind): number {
  const length = kind === "motion" ? INTRO_MS : kind === "calm" ? INTRO_CALM_MS : INTRO_PLAIN_MS;
  return Math.min(length, INTRO_HARD_STOP_MS);
}

/**
 * Whether a script drives this browser (navigator.webdriver — Playwright,
 * Selenium, a PDF renderer; never a person's browser). Anything it cannot say
 * counts as a person.
 */
export function underAutomation(): boolean {
  try {
    return typeof navigator !== "undefined" && navigator.webdriver === true;
  } catch {
    return false;
  }
}

/**
 * Whether the opening holds the page beneath until it is over or skipped: on
 * the sign-in screen, for a person. Under automation it yields to the first
 * thing typed instead, and a session's opening never holds anything.
 */
export function introHoldsPage(place: IntroPlace, automated: boolean): boolean {
  return place === "signin" && !automated;
}

/** What lifts the opening at once, besides its Skip button (and Escape, on the sign-in screen). */
export function introLiftEvents(place: IntroPlace, automated: boolean): readonly string[] {
  if (place === "session") return SESSION_LIFT_EVENTS;
  // The sign-in screen: for a person, only Skip and Escape — a stray click or key does nothing.
  // Under automation it yields as before §85, and to the form being typed into (focusin).
  return automated ? [...SESSION_LIFT_EVENTS, "focusin"] : [];
}

const SESSION_LIFT_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/** What the browser says. Anything it cannot say counts against moving, or against playing a session's opening at all. */
export function readIntroEnvironment(): IntroEnvironment {
  let reducedMotion = true;
  try {
    reducedMotion = typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    reducedMotion = true;
  }
  let seenThisSession = true;
  try {
    seenThisSession = window.sessionStorage.getItem(INTRO_SEEN_KEY) !== null;
  } catch {
    // Site data blocked: it could not be remembered, so a session's opening is not played at all.
    seenThisSession = true;
  }
  let msSinceOpen = 0;
  try {
    msSinceOpen = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : 0;
  } catch {
    msSinceOpen = 0;
  }
  return { reducedMotion, seenThisSession, msSinceOpen };
}

/** Whether a signed-in session's opening plays — read once, when the app first draws (SessionIntro's state). Never throws. */
export function introWanted(): boolean {
  try {
    return introWantedFor(readIntroEnvironment());
  } catch {
    return false;
  }
}

function introKind(place: IntroPlace): IntroKind {
  try {
    return introKindFor(readIntroEnvironment(), place);
  } catch {
    return place === "signin" ? "calm" : "plain";
  }
}

export function markIntroSeen(): void {
  try {
    window.sessionStorage.setItem(INTRO_SEEN_KEY, "1");
  } catch {
    /* not remembered — readIntroEnvironment then counts it as seen anyway */
  }
}

// The faces of the wordmark and the names, asked for as the script starts rather
// than when the introduction first draws, so no word is first seen in a stand-in
// face. All are used on every screen anyway; a failure changes nothing.
try {
  if (typeof document !== "undefined" && document.fonts && typeof document.fonts.load === "function") {
    document.fonts.load('800 100px "Baloo Bhai 2"', "DCRS GUJARAT PRINT PACK PUBLICATIONS PVT LTD").catch(() => {});
    document.fonts.load('700 16px "Plus Jakarta Sans"', "DIGITAL CONTROLLED RECORD SYSTEM").catch(() => {});
  }
} catch {
  /* a browser without the Font Loading API draws the stand-in first, as before */
}

/** The system's name in the interface's language (English on the sign-in screen, as a rule). */
function introName(): string {
  try {
    return t("intro.name");
  } catch {
    return "Digital Controlled Record System";
  }
}

// Letter-spacing would pull Gujarati's joined letters apart (brand.css .is-gu).
// (Built from char codes: this file carries no escapes.)
const GUJARATI = new RegExp(`[${String.fromCharCode(0x0a80)}-${String.fromCharCode(0x0aff)}]`);

// The particles: where each one streams from (percent of the screen), its kind, and
// when it sets off — fixed, laid out once on the golden angle so they fill the dark
// evenly, and the same on every screen. In the calm version the same points
// twinkle where they are.
const PARTICLES = Array.from({ length: 28 }, (_, i) => {
  const angle = i * 2.399963;
  const r = 4 + ((i * 53) % 38);
  return {
    x: Math.round((50 + Math.cos(angle) * r) * 10) / 10,
    y: Math.round((44 + Math.sin(angle) * r * 0.82) * 10) / 10,
    kind: i % 3,
    delay: (i * 613) % 2400,
  };
});

// The streaks of light racing across the dark at the start (motion only): the
// height of each (percent of the screen), its length (percent of the width), when
// it sets off and how long it takes — fixed, spread by numbers prime to the count.
export const INTRO_STREAKS = Array.from({ length: 10 }, (_, i) => ({
  top: 6 + ((i * 37) % 88),
  width: 16 + ((i * 23) % 22),
  delay: 60 + ((i * 97) % 900),
  takes: 620 + ((i * 131) % 320),
}));

type Delay = React.CSSProperties & Record<"--d", string>;
/** A piece's start, for both kinds: the full sequence reads animation-delay, the calm version --d (delight.css). */
const delayed = (ms: number): Delay => ({ animationDelay: `${ms}ms`, "--d": `${ms}ms` });

/** Letters of a Latin name, one span each, with the space between words kept as text. */
function Letters({ text, firstDelay, step, order, variants }: { text: string; firstDelay: number; step: number; order?: (i: number, n: number) => number; variants?: number }) {
  const words = text.split(/\s+/).filter(Boolean);
  const total = words.reduce((n, w) => n + w.length, 0);
  let i = 0;
  return (
    <>
      {words.map((word, w) => (
        <React.Fragment key={w}>
          {w > 0 ? " " : null}
          <span className="intro-w">
            {Array.from(word).map((ch, k) => {
              const index = i++;
              const at = order ? order(index, total) : index;
              return (
                <span key={k} className={variants ? `intro-ch a${index % variants}` : "intro-ch"} style={delayed(firstDelay + at * step)}>
                  {ch}
                </span>
              );
            })}
          </span>
        </React.Fragment>
      ))}
    </>
  );
}

/** Words of a name, each one a piece that moves (the system's name, in any language: Gujarati letters join, so never letters). */
function Words({ text, firstDelay, step }: { text: string; firstDelay: number; step: number }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <>
      {words.map((word, w) => (
        <React.Fragment key={w}>
          {w > 0 ? " " : null}
          <span className="intro-w" style={delayed(firstDelay + w * step)}>
            {word}
          </span>
        </React.Fragment>
      ))}
    </>
  );
}

// The company's letters arrive in a scattered order, not left to right: each one's
// place in the arrival is its position times a number prime to the count — 7, which
// the 34 letters of "Gujarat Print Pack Publications Pvt Ltd" are (frontend/tests/intro.test.ts).
export const scattered = (i: number, n: number) => (n > 1 ? (i * 7) % n : 0);

/**
 * THE OPENING OF A SIGNED-IN SESSION (REQUIREMENTS §81), unchanged by §85.
 * Mounted once above the app (main.tsx), it plays the same introduction when the
 * signed-in app is the first thing a browser session draws; the same rules decide
 * (introWanted): once a session, within the opening moments. Signing in within the
 * session (the sign-in screen's opening marked it seen), or a reload, finds it
 * already seen.
 */
export function SessionIntro() {
  const [intro] = useState(introWanted);
  return intro ? <IntroSplash place="session" /> : null;
}

/**
 * The introduction. `place`: the sign-in screen (every time, holding the form
 * until it is over or skipped) or a session's opening (mount it only where
 * introWanted() said so). `onRelease`: called once, the moment the page beneath
 * may be used — Skip, Escape, its end, or anything going wrong inside it. It
 * removes itself.
 *
 * Memoised: the sign-in screen is drawn again whenever the session's state moves
 * (main.tsx Root reads useAuth) — the server's public answer (/api/auth/config)
 * lands a moment after the opening appears — and without it all ~150 pieces of
 * the art were laid out again mid-play: a task of 115-460 ms at 6x CPU throttle,
 * for a person as much as under automation (1-Oct-2026). Its props never change
 * while it plays (AuthScreen's release is a stable callback).
 */
export const IntroSplash = React.memo(function IntroSplash({ place = "session", onRelease }: { place?: IntroPlace; onRelease?: () => void }) {
  return (
    <IntroGuard onRelease={onRelease}>
      <IntroPlayer place={place} onRelease={onRelease} />
    </IntroGuard>
  );
});

/** Whatever goes wrong inside the introduction, the page beneath is never taken with it — nor left held. */
class IntroGuard extends React.Component<{ children: React.ReactNode; onRelease?: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(): void {
    try {
      document.documentElement.removeAttribute(INTRO_PLAYING_ATTR);
    } catch {
      /* nothing more to undo */
    }
    try {
      this.props.onRelease?.();
    } catch {
      /* the page's own timer lets go of the form anyway (AuthScreen) */
    }
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function IntroPlayer({ place, onRelease }: { place: IntroPlace; onRelease?: () => void }) {
  const [kind] = useState<IntroKind>(() => introKind(place));
  const [automated] = useState(underAutomation);
  const holds = introHoldsPage(place, automated);
  const [phase, setPhase] = useState<"playing" | "leaving" | "gone">("playing");
  // TWO FRAMES, NOT ONE (a slow laptop): the veil and its Skip button are drawn with the
  // page, and the art — some 150 pieces to lay out — a moment later, in a task of its
  // own, so neither the page's first layout nor the art's runs long (at 6x CPU
  // throttle the page and the art together took one task of up to 120 ms, 30-Sep-2026).
  const [artDrawn, setArtDrawn] = useState(false);
  const releaseRef = useRef(onRelease);
  releaseRef.current = onRelease;
  const skipRef = useRef<() => void>(() => {});
  const layerRef = useRef<HTMLDivElement>(null);
  const skipButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    markIntroSeen();
    const root = document.documentElement;
    let finished = false;
    let lifting = false;
    let released = false;
    const timers: number[] = [];
    const listen: AddEventListenerOptions = { capture: true, passive: true };
    const lifts = introLiftEvents(place, automated);
    // The page beneath may be used from now: once, whichever way it came.
    const releasePage = () => {
      try {
        root.removeAttribute(INTRO_PLAYING_ATTR);
      } catch {
        /* nothing to release */
      }
      if (released) return;
      released = true;
      try {
        releaseRef.current?.();
      } catch {
        /* the page's own timer lets go of the form anyway (AuthScreen) */
      }
    };
    const unlisten = () => {
      for (const name of lifts) window.removeEventListener(name, lift, listen);
      window.removeEventListener("keydown", onKey, true);
    };
    function end() {
      if (finished) return;
      finished = true;
      unlisten();
      for (const id of timers) window.clearTimeout(id);
      releasePage();
      setPhase("gone");
    }
    // Skip, Escape, or (a session's opening; the sign-in screen under automation) the first key or click.
    function skip() {
      if (finished || lifting) return;
      lifting = true;
      unlisten();
      releasePage();
      setPhase((p) => (p === "playing" ? "leaving" : p));
      timers.push(window.setTimeout(end, INTRO_SKIP_MS));
    }
    // Only listens: the key, click or tap still does what it does on the page beneath.
    function lift(e: Event) {
      // Focus moving onto the Skip button is not the page being typed into.
      if (e.type === "focusin" && layerRef.current && e.target instanceof Node && layerRef.current.contains(e.target)) return;
      skip();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "Esc") skip();
    }
    skipRef.current = skip;
    try {
      root.setAttribute(INTRO_PLAYING_ATTR, kind);
    } catch {
      /* the title then simply does not wait */
    }
    timers.push(window.setTimeout(() => setArtDrawn(true), 0));
    timers.push(window.setTimeout(end, introLengthFor(kind)));
    // The hard stop: a second timer, so a first one lost for any reason still ends it.
    timers.push(window.setTimeout(end, INTRO_HARD_STOP_MS));
    for (const name of lifts) window.addEventListener(name, lift, listen);
    if (place === "signin") window.addEventListener("keydown", onKey, true);
    // A person on the sign-in screen: the one thing to press is ready under the keyboard (Enter or Space skips).
    if (holds) {
      try {
        skipButtonRef.current?.focus({ preventScroll: true });
      } catch {
        /* Escape still skips */
      }
    }
    return () => {
      // Unmounted (signed in, or React trying the effect twice): the attribute goes;
      // the page's own state goes with it, so nothing is released from here.
      finished = true;
      unlisten();
      for (const id of timers) window.clearTimeout(id);
      try {
        root.removeAttribute(INTRO_PLAYING_ATTR);
      } catch {
        /* nothing to release */
      }
    };
  }, [kind, place, automated, holds]);

  if (phase === "gone") return null;
  const motion = kind === "motion";
  const calm = kind === "calm";
  const art = motion || calm;
  const name = introName();
  const gujaratiName = GUJARATI.test(name);
  const T = motion ? INTRO_TIMELINE : INTRO_CALM_TIMELINE;
  const kindClass = motion ? "" : calm ? " is-calm" : " is-plain";
  return (
    <div
      ref={layerRef}
      className={`intro-splash no-print notranslate is-${place}${kindClass}${phase === "leaving" ? " is-leaving" : ""}`}
      translate="no"
      aria-hidden={place === "session" ? "true" : undefined}
      data-section="intro-splash"
      data-kind={kind}
      data-phase={phase}
      data-place={place}
      data-holds={holds ? "1" : "0"}
      style={{ pointerEvents: "none" }}
    >
      <div className="intro-door is-top" aria-hidden="true" />
      <div className="intro-door is-bottom" aria-hidden="true" />
      {artDrawn && (
        <div className="intro-stage" aria-hidden="true">
          {motion && <div className="intro-floor" />}
          {art && <div className="intro-rays" />}
          {art && <div className="intro-glow" />}
          {motion && (
            <div className="intro-streaks">
              {INTRO_STREAKS.map((s, i) => (
                <span key={i} className="intro-streak" style={{ top: `${s.top}%`, width: `${s.width}vw`, animationDelay: `${s.delay}ms`, animationDuration: `${s.takes}ms` }} />
              ))}
            </div>
          )}
          {art && (
            <div className="intro-particles">
              {PARTICLES.map((p, i) => (
                <span key={i} className={`intro-p v${p.kind}`} style={{ left: `${p.x}%`, top: `${p.y}%`, ...delayed(p.delay) }} />
              ))}
            </div>
          )}
          <div className="intro-rig">
            <div className="intro-mark">
              {art && <span className="intro-ring" />}
              {motion && <span className="intro-ring is-late" />}
              {motion && (
                <span className="intro-orbit">
                  <span className="intro-spark" />
                  <span className="intro-spark is-b" />
                  <span className="intro-spark is-c" />
                </span>
              )}
              <img className="intro-logo" src="brand/logo-192.png" width={100} height={100} alt="" decoding="async" draggable={false} />
            </div>
            <div className="intro-word">
              {motion && <span className="intro-shock" />}
              {calm && <span className="intro-halo" />}
              {WORDMARK.map((letter, i) => (
                <span key={letter} className="intro-letter" data-l={letter} style={{ ["--i" as string]: String(i) } as React.CSSProperties}>
                  {letter}
                </span>
              ))}
              {motion && (
                <span className="intro-shine">
                  <span className="intro-shine-text">
                    {WORDMARK.map((letter) => (
                      <span key={letter}>{letter}</span>
                    ))}
                  </span>
                </span>
              )}
            </div>
            <div className={`intro-name${gujaratiName ? " is-gu" : ""}`}>{art ? <Words text={name} firstDelay={T.nameAt} step={T.nameWordStep} /> : name}</div>
            <div className="intro-company">
              {art ? <Letters text={INTRO_COMPANY} firstDelay={T.companyAt} step={T.companyStep} order={scattered} variants={motion ? 6 : undefined} /> : INTRO_COMPANY}
            </div>
            <div className="intro-modules">
              {INTRO_MODULE_MARKS.map((Mark, i) => (
                <span key={i} className="intro-mod" style={art ? delayed(T.marksAt + i * T.marksStep) : undefined}>
                  <Mark aria-hidden="true" focusable="false" />
                </span>
              ))}
            </div>
          </div>
          {motion && <div className="intro-flare" />}
        </div>
      )}
      {artDrawn && motion && <div className="intro-seam" aria-hidden="true" />}
      {artDrawn && art && (
        <div className="intro-progress" aria-hidden="true">
          <span className="intro-progress-fill" />
          <span className="intro-progress-head" />
        </div>
      )}
      {/* A person's stray click lands here and does nothing (delight.css moves it off the screen at the hard stop). */}
      {holds && phase === "playing" && <div className="intro-catch" data-section="intro-catch" aria-hidden="true" />}
      {place === "signin" && (
        <button ref={skipButtonRef} type="button" className="intro-skip" data-action="intro-skip" aria-label="Skip the opening (Escape)" onClick={() => skipRef.current()}>
          Skip <kbd aria-hidden="true">Esc</kbd>
        </button>
      )}
    </div>
  );
}
