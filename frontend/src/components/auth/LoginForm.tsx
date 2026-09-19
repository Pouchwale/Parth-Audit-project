import React, { useState } from "react";
import { useAuth } from "../../store/AuthContext";
import { ApiError } from "../../api/client";
import { PasswordInput } from "../common/PasswordInput";

export function LoginForm({ onSwitchToSignup }: { onSwitchToSignup: () => void }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not log in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="auth-error">{error}</div>}
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
        Don't have an account?{" "}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onSwitchToSignup();
          }}
        >
          Sign up
        </a>
      </div>
    </form>
  );
}
