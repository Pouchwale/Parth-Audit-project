import React, { useEffect, useState } from "react";
import { FiAlertTriangle } from "react-icons/fi";
import { STORAGE_WRITE_FAILED } from "../../data/storageAdapter";

// Everything the app records lives in this browser's storage, which has a
// fixed size. When a save doesn't fit, the change is NOT kept — this says so
// on whatever screen the user is on, instead of letting them believe it was.
export function StorageFullBanner() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onFail = () => setFailed(true);
    window.addEventListener(STORAGE_WRITE_FAILED, onFail);
    return () => window.removeEventListener(STORAGE_WRITE_FAILED, onFail);
  }, []);

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
        This browser's storage for the app is full, so that change is not kept — everything saved before it is safe. To
        make room, clear the demo data (Demo Mode → Clear All Demo Data), or ask your administrator to back up and archive
        older records (DEPLOYMENT.md → Backup).{" "}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFailed(false)}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
