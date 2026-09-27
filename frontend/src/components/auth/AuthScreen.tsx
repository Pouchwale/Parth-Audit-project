import React, { useState } from "react";
import { AuthLayout } from "./AuthLayout";
import { LoginForm } from "./LoginForm";
import { SignupForm } from "./SignupForm";
import { IntroSplash, introWanted } from "./IntroSplash";
import { signupAllowed } from "../../engine/features";

// SIGNING IN IS THE ONLY WAY IN (REQUIREMENTS §66). The administrator makes
// every account and says which departments it may see, so there is nothing here
// to create one with: no tab, no link, and nothing that could be reached by
// asking for it. A server started with ALLOW_SIGNUP=1 — the test runner's, and
// the one start that makes a first administrator on an empty database — offers
// both, exactly as before.
//
// THE OPENING (REQUIREMENTS §81): the system's name in 3D, once per browser
// session, over this screen and never in its way (IntroSplash.tsx). Decided once,
// as the screen first draws; the form beneath is there from that same frame.
export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [intro] = useState(introWanted);
  const mayCreate = signupAllowed();

  return (
    <>
      <AuthLayout afterIntro={intro}>
        {mayCreate && mode === "signup" ? (
          <SignupForm onSwitchToLogin={() => setMode("login")} />
        ) : (
          <LoginForm onSwitchToSignup={mayCreate ? () => setMode("signup") : undefined} />
        )}
      </AuthLayout>
      {intro && <IntroSplash />}
    </>
  );
}
