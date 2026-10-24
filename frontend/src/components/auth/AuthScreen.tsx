import React, { useCallback, useEffect, useRef, useState } from "react";
import { AuthLayout } from "./AuthLayout";
import { LoginForm } from "./LoginForm";
import { SignupForm } from "./SignupForm";
import { INTRO_HARD_STOP_MS, IntroSplash, introHoldsPage, underAutomation } from "./IntroSplash";
import { signupAllowed } from "../../engine/features";
import { MitraFace } from "../common/MitraFace";

// SIGNING IN IS THE ONLY WAY IN (REQUIREMENTS §66). The administrator makes
// every account and says which departments it may see, so there is nothing here
// to create one with: no tab, no link, and nothing that could be reached by
// asking for it. A server started with ALLOW_SIGNUP=1 — the test runner's, and
// the one start that makes a first administrator on an empty database — offers
// both, exactly as before.
//
// THE OPENING, EVERY TIME THIS SCREEN IS SHOWN (REQUIREMENTS §85): the system's
// name in motion graphics — on a fresh load, a reload, after signing out and after
// the day's session ended — in full, and before the form can be used. The form is
// in place from the first frame but INERT while it plays (no click, key or tab
// reaches it); Skip or Escape lifts it at once; and whatever becomes of the
// opening, this screen lets go of the form by a timer of its own at the hard stop.
// Under automation (navigator.webdriver — the Playwright suites) the form is never
// held and the opening yields to the first thing typed (IntroSplash.tsx says why).
//
// THE CARTOON (REQUIREMENTS §122; the owner, 24-Oct-2026): "add cartoon in login when user login and entering
// his password then that cartoon will closing eye and opening it has some emotions". Mitra's face stands above
// the card's title and plays the classic sign-in mascot: it watches a name being typed (the eyes follow how far
// the writing has got), shuts its eyes the moment a password box has the focus — the sign-up form's two just the
// same — is attentive (calm) while the server is asked, and sad when the attempt is refused, cheered the moment
// the person types again. All of it is read off the forms' own events where they bubble (focus, blur and input
// on one wrapper with no box of its own), so neither form's markup changes and PasswordInput is left alone; the
// forms only say how their attempt stands (onStanding). No timers: every feeling is somebody's own doing.

/** How a form's attempt stands, told to the cartoon: asking the server, refused, or nothing the matter. */
export type AuthStanding = "trying" | "failed" | "fine";

/** The eyes rest centred between glances. */
const REST = { x: 0, y: 0 };

/**
 * A password box by its id as well as its type: PasswordInput's eye may have turned the box to type="text",
 * and the cartoon must not peek at a password somebody chose to show (login-password, signup-password,
 * signup-confirm all carry the word).
 */
function passwordBox(el: EventTarget | null): boolean {
  return el instanceof HTMLInputElement && (el.type === "password" || /password|confirm/.test(el.id));
}

/** Where the eyes glance while a name is typed: left to right with the writing, a touch downward at the box. */
function glanceAt(typed: string): { x: number; y: number } {
  return typed ? { x: Math.min(1, -0.8 + typed.length / 12), y: 0.35 } : REST;
}

export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [holding, setHolding] = useState(() => introHoldsPage("signin", underAutomation()));
  const held = useRef(holding);
  const release = useCallback(() => setHolding(false), []);
  const mayCreate = signupAllowed();

  // The cartoon's three strings (§122): whether its eyes are shut, where they glance, and how it feels.
  const [eyes, setEyes] = useState<"open" | "closed">("open");
  const [look, setLook] = useState(REST);
  const [feeling, setFeeling] = useState<"happy" | "calm" | "sad">("happy");

  // The form says how its attempt stands; the face wears it.
  const standing = useCallback((s: AuthStanding) => setFeeling(s === "trying" ? "calm" : s === "failed" ? "sad" : "happy"), []);

  // Swapping forms: the face comes to rest with the fresh form.
  const switchTo = useCallback((m: "login" | "signup") => {
    setMode(m);
    setEyes("open");
    setLook(REST);
    setFeeling("happy");
  }, []);

  // The forms' own events, where they bubble to the one wrapper — nothing is added to any field.
  const watch = {
    onFocus: (e: React.FocusEvent<HTMLDivElement>) => {
      setEyes(passwordBox(e.target) ? "closed" : "open");
      setLook(!passwordBox(e.target) && e.target instanceof HTMLInputElement ? glanceAt(e.target.value) : REST);
    },
    onBlur: (e: React.FocusEvent<HTMLDivElement>) => {
      // Only leaving the form altogether — stepping to its next box fires onFocus right after.
      if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
      setEyes("open");
      setLook(REST);
    },
    onInput: (e: React.FormEvent<HTMLDivElement>) => {
      setFeeling((f) => (f === "sad" ? "happy" : f)); // typing again cheers it up
      if (e.target instanceof HTMLInputElement && !passwordBox(e.target)) setLook(glanceAt(e.target.value));
    },
  };

  // Never held past the opening's hard stop, whatever happened to it.
  useEffect(() => {
    if (!holding) return;
    const id = window.setTimeout(release, INTRO_HARD_STOP_MS + 400);
    return () => window.clearTimeout(id);
  }, [holding, release]);

  // Let go: for a person, the email box is ready to type in (unless they are already somewhere in the form).
  useEffect(() => {
    if (holding || !held.current) return;
    held.current = false;
    const active = document.activeElement;
    const nowhere = !active || active === document.body || !!active.closest?.("[data-section='intro-splash']");
    if (nowhere) document.getElementById(mode === "signup" ? "signup-name" : "login-email")?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holding]);

  return (
    <>
      {/* No box of its own (display: contents): only there to hold the form while the opening plays. */}
      <div className="auth-hold" style={{ display: "contents" }} inert={holding} data-held={holding ? "1" : "0"}>
        <AuthLayout
          afterIntro
          mascot={
            <div className="auth-mascot" data-section="login-mascot">
              <MitraFace mood={feeling} eyes={eyes} look={look} size={68} />
            </div>
          }
        >
          {/* The watcher has no box of its own either: the card's layout is exactly as it was. */}
          <div style={{ display: "contents" }} {...watch}>
            {mayCreate && mode === "signup" ? (
              <SignupForm onSwitchToLogin={() => switchTo("login")} onStanding={standing} />
            ) : (
              <LoginForm onSwitchToSignup={mayCreate ? () => switchTo("signup") : undefined} onStanding={standing} />
            )}
          </div>
        </AuthLayout>
      </div>
      <IntroSplash place="signin" onRelease={release} />
    </>
  );
}
