import React, { useState } from "react";
import { api } from "../../api/client";
import { Modal } from "./Modal";
import { PasswordInput } from "./PasswordInput";

// A person makes their password their own (REQUIREMENTS §62). The plant's
// named accounts start on a password somebody else chose, so this is the first
// thing each of them does. The change is one line in the activity log, written
// by the server; the password itself is never logged anywhere.
//
// `required` is the first sign-in of an account the administrator made
// (REQUIREMENTS §66): then it cannot be closed or dismissed, says why, and
// offers signing out as the only other way — and the server refuses that
// session everything but this until it is done, so the dialog is the way
// through rather than the lock itself.
export function ChangePasswordDialog({ onClose, required, onSignOut }: { onClose: () => void; required?: boolean; onSignOut?: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const problem = next.length > 0 && next.length < 8 ? "The new password must be at least 8 characters." : again.length > 0 && again !== next ? "The two new passwords are not the same." : null;
  const ready = current.length > 0 && next.length >= 8 && again === next && !busy;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/change-password", { currentPassword: current, newPassword: next });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The password could not be changed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={required ? "Choose your own password" : "Change password"}
      // Nothing dismisses it while it is required: no Escape, no backdrop, no close cross.
      onClose={required ? () => undefined : onClose}
      dismissible={!required}
      width={420}
      footer={
        done ? (
          <button className="btn btn-primary btn-sm" data-action="password-done" onClick={onClose}>
            {required ? "Carry on" : "Done"}
          </button>
        ) : (
          <div className="flex gap-2">
            {required ? (
              onSignOut && (
                <button className="btn btn-ghost btn-sm" data-action="sign-out-instead" onClick={onSignOut}>
                  Sign out
                </button>
              )
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={onClose}>
                Cancel
              </button>
            )}
            <button className="btn btn-primary btn-sm" data-action="save-password" disabled={!ready} onClick={() => void save()}>
              {required ? "Save and carry on" : "Change password"}
            </button>
          </div>
        )
      }
    >
      {required && !done && (
        <p className="text-sm mb-3" data-section="password-required">
          Your password was set by the administrator, so nobody but you should know the next one. Choose your own to carry on — until you do, the records are
          not opened.
        </p>
      )}
      {done ? (
        <p className="text-sm">Your password is changed. Use the new one the next time you sign in.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="field">
            <label>Current password</label>
            <PasswordInput autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} data-field="current-password" />
          </div>
          <div className="field">
            <label>New password (8 characters or more)</label>
            <PasswordInput autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} data-field="new-password" />
          </div>
          <div className="field">
            <label>New password, again</label>
            <PasswordInput autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} data-field="new-password-again" />
          </div>
          {(problem || error) && <div className="text-sm text-danger">{problem ?? error}</div>}
        </div>
      )}
    </Modal>
  );
}
