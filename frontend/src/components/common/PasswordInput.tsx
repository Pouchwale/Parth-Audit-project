import React, { useState } from "react";
import { FiEye, FiEyeOff } from "react-icons/fi";

// A password box with an eye beside it (REQUIREMENTS §63): pressed, the box
// shows what has been typed, so a person can check it before signing in rather
// than find out from "Invalid email or password"; pressed again, it is dots
// again. Every box has its own eye and starts hidden.
//
// The eye is a `type="button"`, so it never submits the form it sits in, and it
// keeps the box's own id, name and autocomplete, so the label, the browser's
// password manager and everything that finds the box by its id are unchanged.
export function PasswordInput({ className = "input", ...rest }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="password-field">
      <input {...rest} className={className} type={shown ? "text" : "password"} />
      <button
        type="button"
        className="password-toggle"
        data-action="toggle-password"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        title={shown ? "Hide password" : "Show password"}
      >
        {shown ? <FiEyeOff size={16} /> : <FiEye size={16} />}
      </button>
    </div>
  );
}
