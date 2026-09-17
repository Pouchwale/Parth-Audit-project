import React, { useEffect, useState } from "react";
import { FiAlertTriangle } from "react-icons/fi";
import { SYNC_STATE_EVENT, syncState } from "../../data/serverSync";

// Said on every screen while changes have not reached the PostgreSQL database
// (REQUIREMENTS §55): they are on this computer and are being sent again — so
// nobody closes the browser believing a record is saved when the database has
// not got it yet.
export function DatabaseSyncBanner() {
  const [state, setState] = useState(syncState);
  useEffect(() => {
    const update = () => setState(syncState());
    window.addEventListener(SYNC_STATE_EVENT, update);
    return () => window.removeEventListener(SYNC_STATE_EVENT, update);
  }, []);
  if (!state.failing) return null;
  return (
    <div className="card mb-3 no-print" data-state="database-sync-failing" style={{ borderColor: "var(--color-warning)", background: "var(--color-warning-bg)" }}>
      <div className="card-pad text-sm">
        <FiAlertTriangle size={13} style={{ verticalAlign: -2 }} /> The database can't be reached just now — your changes are kept on this computer and are being sent again
        {state.pending > 0 ? ` (${state.pending} waiting)` : ""}. Don't close the browser until this message goes.
      </div>
    </div>
  );
}
