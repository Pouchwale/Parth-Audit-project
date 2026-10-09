import React, { useEffect } from "react";
import { useAuth } from "../../store/AuthContext";

// THE STAFF'S WORKING HOURS ON THE SIGN-IN PAGE (REQUIREMENTS §84, and its
// addendum of 6-Oct-2026). Before anybody signs in nobody knows who is signing
// in, so the page's MAIN words say whose hours these are and who they do not
// hold: "Staff working hours: 8:40 am to 6:20 pm on working days. The super
// admin can sign in at any time." — then where today stands for the staff
// ("Today's staff hours ended at 6:20 pm; they start again on Wednesday
// 7 October at 8:40 am."), never "DCRS is open" or "it opens again", as if DCRS
// itself closed: the owner can sign in at any hour. The words are the server's
// own (engine/workingHoursCore.ts publicHours), from the public answer GET
// /api/auth/config gives before anybody signs in. Shown only where the server
// holds staff to the hours: a test server started with DCRS_WORKING_HOURS=off
// says nothing here, as before. The sign-in page is in English, as a rule.
//
// While the page stays open it asks again once a minute, so "Staff hours start
// today at 8:40 am" becomes "staff hours run until 6:20 pm" at 8:40 without a
// reload.
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
        {ownZone && ownZone !== hours.timeZone ? `Times are the factory's (${hours.timeZone}). ` : ""}Each session ends at the close of the day, so sign in each day.
      </div>
    </div>
  );
}
