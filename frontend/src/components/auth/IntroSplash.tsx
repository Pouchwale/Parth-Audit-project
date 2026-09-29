import React, { useEffect, useState } from "react";
import { t } from "../../i18n";

// THE OPENING OF THE SYSTEM (REQUIREMENTS §81): "make starting of this system like
// introduction of project name in 3d". The company's mark turns in, "DCRS" flips
// up letter by letter as an extruded 3D wordmark with a light sweeping across it,
// the system's name and the company's beneath — then it all rushes past and the
// veil lifts off the sign-in screen. 1.6 s, then it leaves the page.
//
// What it never does (the suites and the people signing in rely on every one):
//   * stand in the way. It is a layer over the page that catches nothing
//     (pointer-events: none throughout); the sign-in form is in the page and in
//     place from the first frame, so an address typed or a click made while it
//     plays lands in the form;
//   * play anywhere but at the OPENING of the system: on the sign-in screen
//     (AuthScreen), or — since a session lasts seven days, so most mornings start
//     signed in — when the signed-in app first draws in a new browser session
//     (SessionIntro, main.tsx). Never right after signing in, never when a page is
//     reloaded, never on the choose-your-password step (AuthLayout);
//   * play twice in one browser session (sessionStorage), or on a screen reached
//     long after the page opened (a sign-out, an expired session);
//   * play for somebody whose system asks for less motion;
//   * use anything but CSS transforms and opacity (public/styles/brand.css): no
//     WebGL, no library, nothing fetched but the logo and the display face.
// Its words are marks: "DCRS", the system's name, and the company's registered
// name, which is written as it is in every language (REQUIREMENTS §58).

/** From the first frame to leaving the page. */
export const INTRO_MS = 1600;
/** The sign-in screen reached later than this after the page opened is not its opening. */
export const OPENING_WINDOW_MS = 15000;
/** sessionStorage: the introduction has played in this browser session. */
export const INTRO_SEEN_KEY = "dcrs:intro-seen";

const WORDMARK = ["D", "C", "R", "S"] as const;
const COMPANY = "Gujarat Printpack Publication Pvt. Ltd.";

export interface IntroEnvironment {
  reducedMotion: boolean;
  seenThisSession: boolean;
  msSinceOpen: number;
}

/** Whether the introduction plays, given where and when the sign-in screen is being shown. */
export function introWantedFor(env: IntroEnvironment): boolean {
  return !env.reducedMotion && !env.seenThisSession && env.msSinceOpen <= OPENING_WINDOW_MS;
}

/** What the browser says. Anything it cannot say counts against playing. */
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

/** Read once, when the sign-in screen first draws (AuthScreen's state). Never throws. */
export function introWanted(): boolean {
  try {
    return introWantedFor(readIntroEnvironment());
  } catch {
    return false;
  }
}

export function markIntroSeen(): void {
  try {
    window.sessionStorage.setItem(INTRO_SEEN_KEY, "1");
  } catch {
    /* not remembered — readIntroEnvironment then counts it as seen anyway */
  }
}

// The wordmark's face and the text face, asked for as the script starts rather
// than when the splash first draws, so "DCRS" is not first seen in a stand-in
// face. Both are used on every screen anyway; a failure changes nothing.
try {
  if (typeof document !== "undefined" && document.fonts && typeof document.fonts.load === "function") {
    document.fonts.load('800 100px "Baloo Bhai 2"', "DCRS").catch(() => {});
    document.fonts.load('700 16px "Plus Jakarta Sans"', "DCRS").catch(() => {});
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

/**
 * THE OPENING OF A SIGNED-IN SESSION (REQUIREMENTS §81). A session lasts seven
 * days (backend/auth.ts SESSION_TTL_MS), so on most mornings the system opens
 * straight into the app, never showing the sign-in screen — and "the starting of
 * this system" had no introduction. Mounted once above the app (main.tsx), it
 * plays the same introduction when the signed-in app is the first thing a browser
 * session draws; the same rules decide (introWanted): once a session, within the
 * opening moments, never under reduced motion. Signing in within the session, or
 * a reload, finds it already seen.
 */
export function SessionIntro() {
  const [intro] = useState(introWanted);
  return intro ? <IntroSplash /> : null;
}

/** The introduction. Mount it only where introWanted() said so; it removes itself. */
export function IntroSplash() {
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    markIntroSeen();
    const timer = window.setTimeout(() => setPlaying(false), INTRO_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!playing) return null;
  const name = introName();
  return (
    <div className="intro-splash no-print notranslate" translate="no" aria-hidden="true" data-section="intro-splash">
      <div className="intro-stage">
        <div className="intro-floor" />
        <div className="intro-glow" />
        <div className="intro-rig">
          <img className="intro-logo" src="brand/logo-192.png" width={108} height={108} alt="" decoding="async" draggable={false} />
          <div className="intro-word">
            {WORDMARK.map((letter, i) => (
              <span key={letter} className="intro-letter" data-l={letter} style={{ ["--i" as string]: String(i) } as React.CSSProperties}>
                {letter}
              </span>
            ))}
            <span className="intro-shine">
              <span className="intro-shine-text">
                {WORDMARK.map((letter) => (
                  <span key={letter}>{letter}</span>
                ))}
              </span>
            </span>
          </div>
          <div className={`intro-name${/[\u0A80-\u0AFF]/.test(name) ? " is-gu" : ""}`}>{name}</div>
          <div className="intro-company">{COMPANY}</div>
        </div>
      </div>
    </div>
  );
}
