import React, { useEffect, useState } from "react";
import { signInWordsLanguage, useAuth } from "../../store/AuthContext";
import { ApiError } from "../../api/client";
import { DEVICE_LIMIT_CODE, deviceLimitWordsOf } from "../../engine/deviceWords";
import { accountWord } from "../../engine/accountWords";
import { PasswordInput } from "../common/PasswordInput";

// `onSwitchToSignup` is absent where accounts are made by the administrator
// alone (REQUIREMENTS §66): then nothing here offers to create one.
//
// THE PLANT'S HOURS (REQUIREMENTS §84): after the browser signed somebody out by
// itself, why; and a sign-in refused outside the hours says so in the server's own
// plain words, with the next opening. No standing box of the hours above the form
// any more (REQUIREMENTS §123; the owner, 24-Oct-2026, of that box: "remove this
// message"): the hours are said only where they bite — the refusal, the warning
// before the close and the notice after it — and the server holds staff to them
// exactly as before.
//
// ONE DEVICE TOO MANY (REQUIREMENTS §106): an account already signed in on as many devices as it may be is
// refused with the devices named and since when, and what to do, in the screens' language.
//
// THE SHORT NAME (REQUIREMENTS §110): the box takes an address or the short name of one of the plant's own accounts
// ("kapila.barad" or "kapila barad" for kapila.barad@gpp.local), so it is a text box, not an email box (the browser
// would refuse a short name before the server saw it). An account the super admin removed is told so.
//
// `onStanding` tells the sign-in screen's cartoon how the attempt stands (REQUIREMENTS §122; the owner,
// 24-Oct-2026: "...that cartoon will closing eye and opening it has some emotions"): asking the server,
// refused, or nothing the matter — AuthScreen turns it into the face's mood.
export function LoginForm({ onSwitchToSignup, onStanding }: { onSwitchToSignup?: () => void; onStanding?: (s: "trying" | "failed" | "fine") => void }) {
  const { login, notice } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<{ text: string; code?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // The notice stays until the person does something about it: a new attempt replaces it.
  const [shownNotice, setShownNotice] = useState(notice);
  useEffect(() => setShownNotice(notice), [notice]);
  useEffect(() => onStanding?.(submitting ? "trying" : error ? "failed" : "fine"), [submitting, error, onStanding]);

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
