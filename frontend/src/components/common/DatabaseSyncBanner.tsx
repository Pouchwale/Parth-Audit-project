import React, { useEffect, useState } from "react";
import { FiAlertTriangle } from "react-icons/fi";
import { SYNC_STATE_EVENT, syncState } from "../../data/serverSync";

// Said on every screen while changes have not reached the PostgreSQL database
// (REQUIREMENTS §55): they are on this computer and are being sent again — so
// nobody closes the browser believing a record is saved when the database has
// not got it yet.
export function DatabaseSyncBanner() {
  const [state, setState] = useState(syncState);
  // WHETHER THIS MACHINE HAS A NETWORK AT ALL (REQUIREMENTS §72). The banner
  // below used to wait for a save to FAIL before saying anything — so somebody
  // whose internet had just gone was told nothing at the very moment they most
  // wanted telling that their work was safe.
  const [offline, setOffline] = useState(typeof navigator !== "undefined" && navigator.onLine === false);
  useEffect(() => {
    const update = () => setState(syncState());
    const gone = () => setOffline(true);
    const back = () => setOffline(false);
    window.addEventListener(SYNC_STATE_EVENT, update);
    window.addEventListener("offline", gone);
    window.addEventListener("online", back);
    return () => {
      window.removeEventListener(SYNC_STATE_EVENT, update);
      window.removeEventListener("offline", gone);
      window.removeEventListener("online", back);
    };
  }, []);
  if (!state.failing && !offline) return null;
  return (
    <div
      className="card mb-3 no-print"
      data-state={state.failing ? "database-sync-failing" : "offline"}
      style={{ borderColor: "var(--color-warning)", background: "var(--color-warning-bg)" }}
    >
      <div className="card-pad text-sm">
        <FiAlertTriangle size={13} style={{ verticalAlign: -2 }} />{" "}
        {offline && !state.failing
          ? "This computer has no internet just now. Keep working — everything you type is saved here as you go, and it is sent to the database as soon as the connection is back."
          : `The database can't be reached just now — your changes are kept on this computer and are being sent again${state.pending > 0 ? ` (${state.pending} waiting)` : ""}. They will go as soon as it answers; leaving this browser means another computer cannot see them yet.`}
      </div>
    </div>
  );
}
