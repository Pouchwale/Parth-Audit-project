import React, { useEffect, useState } from "react";
import { FiCheckCircle, FiMessageSquare, FiSlash } from "react-icons/fi";
import { ApiError, assistantAccessApi, type AssistantAccessAnswer } from "../../api/client";
import { formatDisplayDateTime } from "../../utils/date";

// MITRA FOR THE STAFF — the super admin's switch on Users & Access (the owner, 2-Nov-2026: "give an option to the
// super admin only, that he can disable the AI option for all the other users"). One switch for the whole plant
// (backend/assistantSwitch.ts): off, nobody but the super admin sees the Ask Mitra page, the floating Mitra or its
// buttons, and the server refuses Mitra's routes for them. The super admin's own Mitra is never touched. The change
// reaches each person at their next page load or sign-in; the server refuses straight away.

export function MitraSwitch() {
  const [state, setState] = useState<AssistantAccessAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    assistantAccessApi
      .get()
      .then((a) => alive && setState(a))
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : "The switch could not be read."));
    return () => {
      alive = false;
    };
  }, []);

  const set = async (staff: boolean) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const next = await assistantAccessApi.set(staff);
      setState(next);
      setNote(staff ? "Mitra is on for everybody again. Each person sees it at their next page load." : "Mitra is off for everybody but you. Each person loses it at their next page load; the server refuses it for them at once.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The switch could not be set.");
    } finally {
      setBusy(false);
    }
  };

  const on = state?.staff !== false;
  return (
    <div className="card mb-4" data-section="mitra-switch" data-state={state ? (on ? "on" : "off") : "loading"}>
      <div className="card-header">
        <h3 className="text-base font-semibold">
          <FiMessageSquare size={14} style={{ verticalAlign: -2 }} /> Mitra (AI) for the staff
        </h3>
        {state && (
          <span className={`badge ${on ? "badge-Verified" : "badge-Rejected"}`} data-state="mitra-switch-badge">
            {on ? "On for everybody" : "Off — super admin only"}
          </span>
        )}
      </div>
      <div className="card-pad text-sm">
        <p className="text-muted mb-2">
          Switch Mitra — the Ask Mitra page, the floating Mitra on every screen, its buttons, its voice and its reading of files — off for every account but the super
          admin's, or on again. Your own Mitra is never touched. The server refuses Mitra's routes for the staff while it is off, whatever their screen shows.
        </p>
        {state && (state.by || state.at) && (
          <p className="text-xs text-muted mb-2" data-state="mitra-switch-by">
            Last set by {state.by || "the super admin"}
            {state.at ? ` on ${formatDisplayDateTime(state.at)}` : ""}.
          </p>
        )}
        <div className="flex gap-2 wrap">
          {on ? (
            <button className="btn btn-danger btn-sm" data-action="mitra-off" disabled={busy || !state} onClick={() => void set(false)}>
              <FiSlash size={12} /> Switch Mitra off for the staff
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" data-action="mitra-on" disabled={busy || !state} onClick={() => void set(true)}>
              <FiCheckCircle size={12} /> Switch Mitra on for everybody
            </button>
          )}
        </div>
        {note && (
          <p className="text-sm mt-2" data-state="mitra-switch-note">
            <FiCheckCircle size={13} style={{ verticalAlign: -2, color: "var(--color-success)" }} /> {note}
          </p>
        )}
        {error && (
          <p className="auth-error mt-2" data-state="mitra-switch-error">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
