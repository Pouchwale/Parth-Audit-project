import React, { useCallback, useEffect, useRef, useState } from "react";
import { AuthLayout } from "./AuthLayout";
import { LoginForm } from "./LoginForm";
import { SignupForm } from "./SignupForm";
import { INTRO_HARD_STOP_MS, IntroSplash, introHoldsPage, underAutomation } from "./IntroSplash";
import { signupAllowed } from "../../engine/features";

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
export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [holding, setHolding] = useState(() => introHoldsPage("signin", underAutomation()));
  const held = useRef(holding);
  const release = useCallback(() => setHolding(false), []);
  const mayCreate = signupAllowed();

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
        <AuthLayout afterIntro>
          {mayCreate && mode === "signup" ? (
            <SignupForm onSwitchToLogin={() => setMode("login")} />
          ) : (
            <LoginForm onSwitchToSignup={mayCreate ? () => setMode("signup") : undefined} />
          )}
        </AuthLayout>
      </div>
      <IntroSplash place="signin" onRelease={release} />
    </>
  );
}
