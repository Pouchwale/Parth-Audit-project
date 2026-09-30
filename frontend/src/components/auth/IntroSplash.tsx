import React, { useEffect, useState } from "react";
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

// THE OPENING OF THE SYSTEM, IN MOTION GRAPHICS (REQUIREMENTS §81, §84).
// §81: "make starting of this system like introduction of project name in 3d".
// §84 (30-Sep-2026): "the starting animation: use motion graphics there too, and it
// should take its time and only then open — make it really awesome for the user".
//
// A 4.8 s sequence, opaque while it plays (public/styles/brand.css, section 3b, has
// the whole timeline): light blooms and rays turn in the dark while particles stream
// out of it; the company's mark turns in and rings of light leave it; "DCRS" flips up
// letter by letter as an extruded 3D wordmark with a light sweeping across it; the
// system's name rises into place word by word; the company's name — "Gujarat Print Pack
// Publication", as the owner writes it and the plant's papers print it — assembles
// out of letters flying in from every side; the modules' marks (the sidebar's, in
// its order) turn in one after another; a flare crosses the whole of it while a
// progress line fills; then a line of light splits the veil, which opens top and
// bottom on the sign-in screen or the app.
//
// What it never does (the suites and the people signing in rely on every one):
//   * stand in the way. It is a layer over the page that catches nothing
//     (pointer-events: none throughout); the page beneath is in place from the
//     first frame, so an address typed or a click made while it plays lands in the
//     form — and the first key, click, tap or turn of the wheel lifts the veil at
//     once (INTRO_SKIP_MS), for somebody who has seen it before and is in a hurry;
//   * outstay its welcome: it ends at INTRO_MS by its own timer, at
//     INTRO_HARD_STOP_MS by a second one whatever became of the first, and its
//     stylesheet leaves it transparent at INTRO_MS even if no script ran at all;
//   * play anywhere but at the OPENING of the system: on the sign-in screen
//     (AuthScreen), or when the signed-in app is the first thing a browser session
//     draws (SessionIntro, main.tsx). Never right after signing in, never when a
//     page is reloaded, never on the choose-your-password step (AuthLayout);
//   * play twice in one browser session (sessionStorage), or on a screen reached
//     long after the page opened (a sign-out, an expired session);
//   * move for somebody whose system asks for less motion: they get a plain fade
//     of INTRO_PLAIN_MS instead, nothing turning or flying;
//   * use anything but CSS transforms and opacity: no canvas, no WebGL, no library,
//     nothing fetched but the logo and the faces every screen uses anyway. Every
//     movement runs on the graphics card, so a busy page thread does not stutter it.
// Its words are marks: "DCRS", the system's name, and the company's name, which is
// written as it is in every language (REQUIREMENTS §58).

/** The whole sequence, from the first frame to leaving the page. */
export const INTRO_MS = 4800;
/** When the veil starts to open on the page (brand.css: the doors hold until 88.5% of INTRO_MS). */
export const INTRO_REVEAL_MS = 4250;
/** Under prefers-reduced-motion: a plain fade, nothing moving. */
export const INTRO_PLAIN_MS = 900;
/** After a key, click, tap or wheel: the veil fades at once, in this long. */
export const INTRO_SKIP_MS = 380;
/** Whatever happens — a lost timer, a stalled page — it is gone by then. */
export const INTRO_HARD_STOP_MS = 6000;
/** The sign-in screen reached later than this after the page opened is not its opening. */
export const OPENING_WINDOW_MS = 15000;
/** sessionStorage: the introduction has played in this browser session. */
export const INTRO_SEEN_KEY = "dcrs:intro-seen";
/** On <html> while the introduction plays: the sign-in title waits for the veil to open (brand.css). */
export const INTRO_PLAYING_ATTR = "data-intro-playing";
/** The company's name as the owner writes it and the plant's papers print it — a mark, never translated. */
export const INTRO_COMPANY = "Gujarat Print Pack Publication";
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

const WORDMARK = ["D", "C", "R", "S"] as const;

/** The modules' marks: the sidebar's own icon for each module, in the sidebar's order (Sidebar.tsx MODULE_ICONS). */
export const INTRO_MODULE_MARKS: readonly IconType[] = [
  FiCompass, // System / Management
  FiTrendingUp, // Marketing
  FiUsers, // Human Resources
  FiAlertCircle, // CAPA
  FiLayers, // Lamination — Quality Control
  FiPackage, // Lamination — Production
  FiTool, // Maintenance
  FiShoppingCart, // Purchase
  FiArchive, // Store
  FiTruck, // Dispatch
  FiCheckSquare, // Quality Control — Inspection Records
  FiShield, // Quality — Compliance
];

export type IntroKind = "motion" | "plain";

export interface IntroEnvironment {
  reducedMotion: boolean;
  seenThisSession: boolean;
  msSinceOpen: number;
}

/** Whether the introduction plays, given where and when the screen is being shown. */
export function introWantedFor(env: IntroEnvironment): boolean {
  return !env.seenThisSession && env.msSinceOpen <= OPENING_WINDOW_MS;
}

/** The full sequence, or — for somebody who asks for less motion — the plain fade. */
export function introKindFor(env: Pick<IntroEnvironment, "reducedMotion">): IntroKind {
  return env.reducedMotion ? "plain" : "motion";
}

/** How long each kind stays on the page by its own timer; never beyond the hard stop. */
export function introLengthFor(kind: IntroKind): number {
  return Math.min(kind === "plain" ? INTRO_PLAIN_MS : INTRO_MS, INTRO_HARD_STOP_MS);
}

/** What the browser says. Anything it cannot say counts against moving, or against playing at all. */
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
    // Site data blocked: it could not be remembered, so it is not played at all.
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

/** Read once, when the screen first draws (AuthScreen's and SessionIntro's state). Never throws. */
export function introWanted(): boolean {
  try {
    return introWantedFor(readIntroEnvironment());
  } catch {
    return false;
  }
}

function introKind(): IntroKind {
  try {
    return introKindFor(readIntroEnvironment());
  } catch {
    return "plain";
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
    document.fonts.load('800 100px "Baloo Bhai 2"', "DCRS GUJARAT PRINT PACK PUBLICATION").catch(() => {});
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
// evenly, and the same on every screen.
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
                <span key={k} className={variants ? `intro-ch a${index % variants}` : "intro-ch"} style={{ animationDelay: `${firstDelay + at * step}ms` }}>
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
          <span className="intro-w" style={{ animationDelay: `${firstDelay + w * step}ms` }}>
            {word}
          </span>
        </React.Fragment>
      ))}
    </>
  );
}

// The company's letters arrive in a scattered order, not left to right: each one's
// place in the arrival is its position times a number prime to the count.
const scattered = (i: number, n: number) => (n > 1 ? (i * 7) % n : 0);

/**
 * THE OPENING OF A SIGNED-IN SESSION (REQUIREMENTS §81). A session used to last
 * seven days, so on most mornings the system opened straight into the app, never
 * showing the sign-in screen — and "the starting of this system" had no
 * introduction. Mounted once above the app (main.tsx), it plays the same
 * introduction when the signed-in app is the first thing a browser session draws;
 * the same rules decide (introWanted): once a session, within the opening moments.
 * Signing in within the session, or a reload, finds it already seen.
 */
export function SessionIntro() {
  const [intro] = useState(introWanted);
  return intro ? <IntroSplash /> : null;
}

/** The introduction. Mount it only where introWanted() said so; it removes itself. */
export function IntroSplash() {
  return (
    <IntroGuard>
      <IntroPlayer />
    </IntroGuard>
  );
}

/** Whatever goes wrong inside the introduction, the page beneath is never taken with it. */
class IntroGuard extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
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
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const SKIP_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

function IntroPlayer() {
  const [kind] = useState<IntroKind>(introKind);
  const [phase, setPhase] = useState<"playing" | "leaving" | "gone">("playing");

  useEffect(() => {
    markIntroSeen();
    const root = document.documentElement;
    let finished = false;
    const timers: number[] = [];
    const listen: AddEventListenerOptions = { capture: true, passive: true };
    const release = () => {
      try {
        root.removeAttribute(INTRO_PLAYING_ATTR);
      } catch {
        /* nothing to release */
      }
    };
    const unlisten = () => {
      for (const name of SKIP_EVENTS) window.removeEventListener(name, skip, listen);
    };
    function end() {
      if (finished) return;
      finished = true;
      unlisten();
      for (const id of timers) window.clearTimeout(id);
      release();
      setPhase("gone");
    }
    // Only listens: the key, click or tap still does what it does on the page beneath.
    function skip() {
      if (finished) return;
      unlisten();
      release();
      setPhase((p) => (p === "playing" ? "leaving" : p));
      timers.push(window.setTimeout(end, INTRO_SKIP_MS));
    }
    try {
      root.setAttribute(INTRO_PLAYING_ATTR, kind);
    } catch {
      /* the title then simply does not wait */
    }
    timers.push(window.setTimeout(end, introLengthFor(kind)));
    // The hard stop: a second timer, so a first one lost for any reason still ends it.
    timers.push(window.setTimeout(end, INTRO_HARD_STOP_MS));
    for (const name of SKIP_EVENTS) window.addEventListener(name, skip, listen);
    return () => {
      finished = true;
      unlisten();
      for (const id of timers) window.clearTimeout(id);
      release();
    };
  }, [kind]);

  if (phase === "gone") return null;
  const motion = kind === "motion";
  const name = introName();
  const gujaratiName = GUJARATI.test(name);
  return (
    <div
      className={`intro-splash no-print notranslate${motion ? "" : " is-plain"}${phase === "leaving" ? " is-leaving" : ""}`}
      translate="no"
      aria-hidden="true"
      data-section="intro-splash"
      data-kind={kind}
      data-phase={phase}
      style={{ pointerEvents: "none" }}
    >
      <div className="intro-door is-top" />
      <div className="intro-door is-bottom" />
      <div className="intro-stage">
        {motion && <div className="intro-floor" />}
        {motion && <div className="intro-rays" />}
        {motion && <div className="intro-glow" />}
        {motion && (
          <div className="intro-particles">
            {PARTICLES.map((p, i) => (
              <span key={i} className={`intro-p v${p.kind}`} style={{ left: `${p.x}%`, top: `${p.y}%`, animationDelay: `${p.delay}ms` }} />
            ))}
          </div>
        )}
        <div className="intro-rig">
          <div className="intro-mark">
            {motion && <span className="intro-ring" />}
            {motion && <span className="intro-ring is-late" />}
            <img className="intro-logo" src="brand/logo-192.png" width={100} height={100} alt="" decoding="async" draggable={false} />
          </div>
          <div className="intro-word">
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
          <div className={`intro-name${gujaratiName ? " is-gu" : ""}`}>
            {motion ? <Words text={name} firstDelay={INTRO_TIMELINE.nameAt} step={INTRO_TIMELINE.nameWordStep} /> : name}
          </div>
          <div className="intro-company">
            {motion ? <Letters text={INTRO_COMPANY} firstDelay={INTRO_TIMELINE.companyAt} step={INTRO_TIMELINE.companyStep} order={scattered} variants={6} /> : INTRO_COMPANY}
          </div>
          <div className="intro-modules">
            {INTRO_MODULE_MARKS.map((Mark, i) => (
              <span key={i} className="intro-mod" style={motion ? { animationDelay: `${INTRO_TIMELINE.marksAt + i * INTRO_TIMELINE.marksStep}ms` } : undefined}>
                <Mark aria-hidden="true" focusable="false" />
              </span>
            ))}
          </div>
        </div>
        {motion && <div className="intro-flare" />}
      </div>
      {motion && <div className="intro-seam" />}
      {motion && (
        <div className="intro-progress">
          <span className="intro-progress-fill" />
          <span className="intro-progress-head" />
        </div>
      )}
    </div>
  );
}
