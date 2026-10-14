import React, { useEffect, useState } from "react";
import { signInWordsLanguage, useAuth } from "../../store/AuthContext";
import { ApiError } from "../../api/client";
import { DEVICE_LIMIT_CODE, deviceLimitWordsOf } from "../../engine/deviceWords";
import { accountWord } from "../../engine/accountWords";
import { PasswordInput } from "../common/PasswordInput";
import { WorkingHoursNote } from "./WorkingHoursNote";

// `onSwitchToSignup` is absent where accounts are made by the administrator
// alone (REQUIREMENTS §66): then nothing here offers to create one.
//
// THE PLANT'S HOURS (REQUIREMENTS §84): above the form, when the server holds
// the plant to them, the hours and where today stands (WorkingHoursNote); after
// the browser signed somebody out by itself, why; and a sign-in refused outside
// the hours says so in the server's own plain words, with the next opening.
//
// ONE DEVICE TOO MANY (REQUIREMENTS §106): an account already signed in on as many devices as it may be is
// refused with the devices named and since when, and what to do, in the screens' language.
//
// THE SHORT NAME (REQUIREMENTS §110): the box takes an address or the short name of one of the plant's own accounts
// ("kapila.barad" or "kapila barad" for kapila.barad@gpp.local), so it is a text box, not an email box (the browser
// would refuse a short name before the server saw it). An account the super admin removed is told so.
export function LoginForm({ onSwitchToSignup }: { onSwitchToSignup?: () => void }) {
  const { login, notice } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<{ text: string; code?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // The notice stays until the person does something about it: a new attempt replaces it.
  const [shownNotice, setShownNotice] = useState(notice);
  useEffect(() => setShownNotice(notice), [notice]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setShownNotice(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      const words =
        err instanceof ApiError && err.code === DEVICE_LIMIT_CODE
          ? deviceLimitWordsOf(signInWordsLanguage(), err.data)
          : err instanceof ApiError && err.code === "account-removed"
            ? accountWord(signInWordsLanguage(), "err.accountRemoved")
            : null;
      setError(err instanceof ApiError ? { text: words ?? err.message, code: err.code } : { text: "Could not log in. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {shownNotice && (
        <div className="auth-error" data-section="signed-out-notice" style={{ background: "var(--color-warning-bg)", color: "var(--color-text)" }}>
          {shownNotice}
        </div>
      )}
      {error && (
        <div className="auth-error" data-code={error.code ?? undefined}>
          {error.text}
        </div>
      )}
      <WorkingHoursNote />
      <div className="field mb-3">
        <label htmlFor="login-email">{accountWord(signInWordsLanguage(), "login.label")}</label>
        <input
          id="login-email"
          type="text"
          inputMode="email"
          className="input"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby="login-email-hint"
        />
        <p id="login-email-hint" className="text-xs text-muted mt-1" data-section="short-sign-in">
          {accountWord(signInWordsLanguage(), "login.hint")}
        </p>
      </div>
      <div className="field mb-4">
        <label htmlFor="login-password">Password</label>
        <PasswordInput id="login-password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={submitting}>
        {submitting ? "Logging in…" : "Log In"}
      </button>
      <div className="auth-footer">
        {onSwitchToSignup ? (
          <>
            Don&apos;t have an account?{" "}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onSwitchToSignup();
              }}
            >
              Sign up
            </a>
          </>
        ) : (
          <span data-section="accounts-by-administrator">Accounts are created by the administrator. Ask them for yours.</span>
        )}
      </div>
    </form>
  );
}
