import React, { useState } from "react";
import { api } from "../../api/client";
import { Modal } from "./Modal";

// A person makes their password their own (REQUIREMENTS §62). The plant's
// named accounts start on a password somebody else chose, so this is the first
// thing each of them does. The change is one line in the activity log, written
// by the server; the password itself is never logged anywhere.
export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
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
      title="Change password"
      onClose={onClose}
      width={420}
      footer={
        done ? (
          <button className="btn btn-primary btn-sm" onClick={onClose}>
            Done
          </button>
        ) : (
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary btn-sm" data-action="save-password" disabled={!ready} onClick={() => void save()}>
              Change password
            </button>
          </div>
        )
      }
    >
      {done ? (
        <p className="text-sm">Your password is changed. Use the new one the next time you sign in.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="field">
            <label>Current password</label>
            <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} data-field="current-password" />
          </div>
          <div className="field">
            <label>New password (8 characters or more)</label>
            <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} data-field="new-password" />
          </div>
          <div className="field">
            <label>New password, again</label>
            <input className="input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} data-field="new-password-again" />
          </div>
          {(problem || error) && <div className="text-sm text-danger">{problem ?? error}</div>}
        </div>
      )}
    </Modal>
  );
}
