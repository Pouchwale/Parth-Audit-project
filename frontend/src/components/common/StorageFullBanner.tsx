import React, { useEffect, useState } from "react";
import { FiAlertTriangle } from "react-icons/fi";
import { STORAGE_NEARLY_FULL, STORAGE_WRITE_FAILED, storageNearlyFull } from "../../data/storageAdapter";
import { demoModeAvailable } from "../../engine/features";

// Everything the app records lives in this browser's storage, which has a
// fixed size. When a save doesn't fit, the change is NOT kept — this says so
// on whatever screen the user is on, instead of letting them believe it was.
export function StorageFullBanner() {
  const [failed, setFailed] = useState(false);
  // SAID BEFORE THE WALL, NOT AFTER IT (REQUIREMENTS §65). A save that does not
  // fit has already lost that change; the same banner warns while there is still
  // time to archive, from the one measurement taken at start-up
  // (data/storageAdapter.ts measureWorkingCopy).
  const [nearlyFull, setNearlyFull] = useState(storageNearlyFull);

  useEffect(() => {
    const onFail = () => setFailed(true);
    // Read, not assumed: the same word is sent when the working copy has been cut back down.
    const onNearlyFull = () => setNearlyFull(storageNearlyFull());
    window.addEventListener(STORAGE_WRITE_FAILED, onFail);
    window.addEventListener(STORAGE_NEARLY_FULL, onNearlyFull);
    return () => {
      window.removeEventListener(STORAGE_WRITE_FAILED, onFail);
      window.removeEventListener(STORAGE_NEARLY_FULL, onNearlyFull);
    };
  }, []);

  if (!failed && nearlyFull)
    return (
      <div className="card mb-4 no-print" role="status" data-section="storage-nearly-full" style={{ borderColor: "var(--color-warning)", background: "var(--color-warning-bg)" }}>
        <div className="card-pad text-sm">
          <strong>
            <FiAlertTriangle size={13} style={{ verticalAlign: -1 }} /> This browser is nearly as full as it is allowed to be.
          </strong>{" "}
          The working copy of the company's records on this computer is close to the space the browser gives the app. Everything is safe and saved in the
          database — but before it runs out, ask your administrator to back up and archive the older records (DEPLOYMENT.md → Backup).{" "}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNearlyFull(false)}>
            Dismiss
          </button>
        </div>
      </div>
    );

  if (!failed) return null;
  return (
    <div
      className="card mb-4 no-print"
      role="alert"
      data-section="storage-full"
      style={{ borderColor: "var(--color-warning)", background: "var(--color-warning-bg)" }}
    >
      <div className="card-pad text-sm">
        <strong>
          <FiAlertTriangle size={13} style={{ verticalAlign: -1 }} /> Your last change could not be saved.
        </strong>{" "}
        {/* Demo Mode is named only where it exists (engine/features.ts, REQUIREMENTS §65). */}
        This browser's storage for the app is full, so that change is not kept — everything saved before it is safe. To
        make room, {demoModeAvailable() ? "clear the demo data (Demo Mode → Clear All Demo Data), or " : ""}
        ask your administrator to back up and archive older records (DEPLOYMENT.md → Backup).{" "}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFailed(false)}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
