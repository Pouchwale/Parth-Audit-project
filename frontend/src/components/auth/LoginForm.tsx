import React, { useEffect, useState } from "react";
import { useAuth } from "../../store/AuthContext";
import { ApiError } from "../../api/client";
import { PasswordInput } from "../common/PasswordInput";
import { WorkingHoursNote } from "./WorkingHoursNote";

// `onSwitchToSignup` is absent where accounts are made by the administrator
// alone (REQUIREMENTS §66): then nothing here offers to create one.
//
// THE PLANT'S HOURS (REQUIREMENTS §84): above the form, when the server holds
// the plant to them, the hours and where today stands (WorkingHoursNote); after
// the browser signed somebody out by itself, why; and a sign-in refused outside
// the hours says so in the server's own plain words, with the next opening.
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
      setError(err instanceof ApiError ? { text: err.message, code: err.code } : { text: "Could not log in. Please try again." });
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
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          className="input"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
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
