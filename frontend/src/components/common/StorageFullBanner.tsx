import React, { useEffect, useState } from "react";
import { FiAlertTriangle, FiCheck, FiTrash2 } from "react-icons/fi";
import { BROWSER_ROOM_CHARS, STORAGE_NEARLY_FULL, STORAGE_WRITE_FAILED, measureWorkingCopy, storageNearlyFull, workingCopyChars } from "../../data/storageAdapter";
import { clearAllDemoData } from "../../data/demoGenerator";
import { demoModeAvailable } from "../../engine/features";
import { purgePreLaunchNoise } from "../../engine/backlogCleanup";
import { roomLabel, storageBreakdown, type StorageBreakdown } from "../../engine/storageRoom";
import { useAppStore } from "../../store/AppStore";

// Everything the app records lives in this browser's storage, which has a
// fixed size. When a save doesn't fit, the change is NOT kept — this says so
// on whatever screen the user is on, instead of letting them believe it was.
export function StorageFullBanner() {
  const { mode, setMode, bump } = useAppStore();
  const [failed, setFailed] = useState(false);
  // SAID BEFORE THE WALL, NOT AFTER IT (REQUIREMENTS §65). A save that does not
  // fit has already lost that change; the same banner warns while there is still
  // time, from the one measurement taken at start-up
  // (data/storageAdapter.ts measureWorkingCopy).
  const [nearlyFull, setNearlyFull] = useState(storageNearlyFull);
  // WHAT IS TAKING THE ROOM, AND THE BUTTON THAT CLEARS IT (REQUIREMENTS §79):
  // added up once the banner is on screen, off the paint, so a full browser
  // draws its dashboard first.
  const [parts, setParts] = useState<StorageBreakdown | null>(null);
  const [done, setDone] = useState<string | null>(null);

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

  useEffect(() => {
    if (!nearlyFull && !failed) return;
    const id = window.setTimeout(() => setParts(storageBreakdown()), 0);
    return () => window.clearTimeout(id);
  }, [nearlyFull, failed]);

  // Cleared, measured again, and every screen redrawn: below the mark the
  // banner goes by itself (the measurement says so); above it, the figures update.
  const clear = (what: "demo" | "leftovers") => {
    const before = workingCopyChars();
    const removed = what === "demo" ? clearAllDemoData() : purgePreLaunchNoise();
    const after = measureWorkingCopy();
    // In Demo Mode the dashboard fills the demo year again the moment it redraws (DashboardPage's
    // ensureDemoRecordsGeneratedForYear), which undid the clearing at once — so the click also returns the app to
    // Live Mode, and says so.
    const toLive = what === "demo" && mode === "demo";
    if (toLive) setMode("live");
    setDone(
      `${what === "demo" ? "Cleared" : "Removed"} ${removed} ${what === "demo" ? "demo" : "blank"} record${removed === 1 ? "" : "s"} — ${roomLabel(Math.max(0, before - after))} freed.` +
        (toLive ? " The app is in Live Mode now: Demo Mode fills the demo year again when it is opened." : "")
    );
    setParts(storageBreakdown());
    bump();
  };

  if (!failed && !nearlyFull) {
    // Back under the mark the warning is gone; what the click did stays until dismissed.
    if (!done) return null;
    return (
      <div className="card mb-4 no-print" role="status" data-section="storage-room-done" style={{ borderColor: "var(--color-success)" }}>
        <div className="card-pad text-sm">
          <FiCheck size={12} style={{ verticalAlign: -1 }} /> {done}{" "}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDone(null)}>
            Dismiss
          </button>
        </div>
      </div>
    );
  }
  const used = workingCopyChars();
  const demo = parts?.demo;
  const leftovers = parts?.leftovers;
  const written = parts?.written;
  const hasClearable = (demo?.records ?? 0) > 0 || (leftovers?.records ?? 0) > 0;

  return (
    <div
      className="card mb-4 no-print"
      role={failed ? "alert" : "status"}
      data-section={failed ? "storage-full" : "storage-nearly-full"}
      data-used={used}
      style={{ borderColor: "var(--color-warning)", background: "var(--color-warning-bg)" }}
    >
      <div className="card-pad text-sm">
        <strong>
          <FiAlertTriangle size={13} style={{ verticalAlign: -1 }} /> {failed ? "Your last change could not be saved." : "This browser is nearly full."}
        </strong>{" "}
        {failed
          ? "This browser's storage for the app is full, so that change is not kept — everything saved before it is safe."
          : `The working copy of the records on this computer takes ${roomLabel(used)} of the ${roomLabel(BROWSER_ROOM_CHARS)} or so the browser allows. Everything is safe in the database.`}
        {parts && (
          <ul className="mt-2 mb-2" style={{ paddingLeft: 18 }} data-section="storage-room">
            {demo && demo.records > 0 && (
              <li data-room="demo">
                <strong>{roomLabel(demo.chars)}</strong> is {demoModeAvailable() ? "Demo Mode's " : ""}demo data — {demo.records} made-up records that can go at any time and come back at a click.
                {mode === "demo" && " Clearing it returns the app to Live Mode."}{" "}
                <button type="button" className="btn btn-secondary btn-sm" data-action="clear-demo-data" onClick={() => clear("demo")}>
                  <FiTrash2 size={12} /> Clear the demo data
                </button>
              </li>
            )}
            {leftovers && leftovers.records > 0 && (
              <li data-room="leftovers">
                <strong>{roomLabel(leftovers.chars)}</strong> is {leftovers.records} blank sheets from before the system went live, which nobody has written on.{" "}
                <button type="button" className="btn btn-secondary btn-sm" data-action="purge-leftovers" onClick={() => clear("leftovers")}>
                  <FiTrash2 size={12} /> Remove them
                </button>
              </li>
            )}
            {written && (
              <li data-room="written">
                <strong>{roomLabel(written.chars)}</strong> is the plant's own records — {written.records} of them.
                {!hasClearable && " When these alone fill the browser, the administrator backs up and archives the older ones (DEPLOYMENT.md → Backup)."}
              </li>
            )}
          </ul>
        )}
        {done && (
          <span className="text-sm" data-section="storage-room-done" style={{ marginRight: 8 }}>
            <FiCheck size={12} style={{ verticalAlign: -1 }} /> {done}
          </span>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setFailed(false);
            setNearlyFull(false);
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
