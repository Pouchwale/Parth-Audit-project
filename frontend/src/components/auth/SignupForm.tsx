import React, { useState } from "react";
import { useAuth } from "../../store/AuthContext";
import { ApiError } from "../../api/client";
import { DEPARTMENTS } from "../../data/seed/departments";

export function SignupForm({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const { signup } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Which department the new joiner works in — they then see that
  // department's documents and no others (REQUIREMENTS §40). Blank means every
  // department, which is what management / the MR need and what the answer
  // stays unless somebody chooses; the administrator can change it afterwards
  // in Master Data → Departments & access.
  const [department, setDepartment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await signup(name.trim(), email.trim(), password, department ? [department] : []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create account. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="auth-error">{error}</div>}
      <div className="field mb-3">
        <label htmlFor="signup-name">Full Name</label>
        <input id="signup-name" className="input" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field mb-3">
        <label htmlFor="signup-email">Email</label>
        <input
          id="signup-email"
          type="email"
          className="input"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="field mb-3">
        <label htmlFor="signup-password">Password</label>
        <input
          id="signup-password"
          type="password"
          className="input"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="field mb-4">
        <label htmlFor="signup-confirm">Confirm Password</label>
        <input
          id="signup-confirm"
          type="password"
          className="input"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>
      <div className="field mb-4">
        <label htmlFor="signup-department">Department</label>
        <select id="signup-department" className="input" value={department} onChange={(e) => setDepartment(e.target.value)}>
          <option value="">All departments (management / QA)</option>
          {DEPARTMENTS.map((d) => (
            <option key={d.code} value={d.code}>
              {d.name} ({d.code})
            </option>
          ))}
        </select>
        <div className="text-xs text-muted mt-1">
          You'll see the documents of the department you pick — its formats on the company's master list ({DEPARTMENTS.map((d) => d.formatPrefix).slice(0, 3).join(", ")}
          …). Pick "All departments" if you work across the plant; an administrator can change this later.
        </div>
      </div>
      <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={submitting}>
        {submitting ? "Creating account…" : "Create Account"}
      </button>
      <div className="auth-footer">
        Already have an account?{" "}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onSwitchToLogin();
          }}
        >
          Log in
        </a>
      </div>
    </form>
  );
}
