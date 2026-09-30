import React, { useEffect } from "react";
import { useAuth } from "../../store/AuthContext";

// THE PLANT'S HOURS ON THE SIGN-IN PAGE (REQUIREMENTS §84): "DCRS is open 8:40 am
// to 6:20 pm on working days." and where today stands — open until the close,
// not open yet, over for the day, or a closed day with the next opening — in
// the words the server itself worked out (engine/workingHoursCore.ts), from the
// public answer GET /api/auth/config gives before anybody signs in. Shown only
// where the server holds the plant to its hours: a test server started with
// DCRS_WORKING_HOURS=off says nothing here, as before.
//
// While the page stays open it asks again once a minute, so "not open yet"
// becomes "open now" at 8:40 without a reload.
const REFRESH_MS = 60 * 1000;

export function WorkingHoursNote() {
  const { hours, refreshHours } = useAuth();
  const enforced = hours?.enforced === true;

  useEffect(() => {
    if (!enforced) return;
    const timer = window.setInterval(refreshHours, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [enforced, refreshHours]);

  if (!hours || !enforced) return null;
  let ownZone = "";
  try {
    ownZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    ownZone = "";
  }
  const open = hours.openNow;
  return (
    <div
      data-section="working-hours"
      data-phase={hours.phase}
      data-open={open ? "true" : "false"}
      style={{
        background: open ? "var(--color-info-bg)" : "var(--color-warning-bg)",
        color: "var(--color-text)",
        borderRadius: "var(--radius-sm)",
        padding: "9px 12px",
        fontSize: 12.5,
        lineHeight: 1.45,
        marginBottom: 16,
      }}
    >
      <div data-field="hours-text" style={{ fontWeight: 600 }}>
        {hours.hoursText}
      </div>
      <div data-field="today-text">{hours.todayText}</div>
      <div data-field="hours-who" style={{ color: "var(--color-text-muted)", fontSize: 11.5, marginTop: 4 }}>
        {ownZone && ownZone !== hours.timeZone ? `Times are the factory's (${hours.timeZone}). ` : ""}Each session ends at the close of the day, so sign in each morning. The super admin may sign in at any time.
      </div>
    </div>
  );
}
