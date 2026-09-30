import React, { useEffect, useState } from "react";
import { useAuth } from "../../store/AuthContext";
import { CLOSING_WARNING_MS, END_OF_HOURS_REASON, momentWords } from "../../engine/workingHoursCore";

// THE CLOSE OF THE WORKING DAY, IN THE BROWSER (REQUIREMENTS §84, C4).
//
// A session of anybody but the super admin ends at the close of the plant's
// working day (6:20 pm unless Master Data says otherwise): after it the server
// answers nothing. So the browser keeps the time itself —
//   * TEN MINUTES BEFORE the close it says so, in a line at the top of the
//     screen that stays until the close (it can be put aside, and comes back for
//     the last minute);
//   * AT THE CLOSE it signs the person out by itself, saying why — "At the close
//     of working hours" in the activity log — and the sign-in page opens with
//     the reason and when DCRS opens again. It starts SIGN_OUT_LEAD_MS early, so
//     what is still on its way to the database gets there while the session is
//     still open; anything that does not is kept on this computer and sent at
//     the next sign-in (data/serverSync.ts), as with any session that ends.
//   * EVERY FIVE MINUTES it asks the server about the session again: the super
//     admin may have closed the day sooner (a holiday declared, the hours
//     changed), and then the server's word is what counts.
//
// One check every five seconds, which draws nothing until the warning is due:
// nothing here costs a low-end laptop anything. The super admin, a server that
// does not enforce the hours (DCRS_WORKING_HOURS=off, the e2e runner's) and a
// server from before §84 set none of it going.

/** The sign-out starts this long before the close, so the last saves arrive while the session is open. */
export const SIGN_OUT_LEAD_MS = 30 * 1000;
const TICK_MS = 5 * 1000;
const RECHECK_MS = 5 * 60 * 1000;

export function SessionClock() {
  const { user, session, endForHours, refreshSession } = useAuth();
  // Milliseconds to the close while the warning is due; null otherwise.
  const [left, setLeft] = useState<number | null>(null);
  const [putAside, setPutAside] = useState(false);

  // Not on a page the server opened only to print a record as a PDF (backend/pdfReport.ts marks it): a warning
  // would be printed on the paper, and a sign-out would leave the sign-in page to print instead.
  const printing = typeof window !== "undefined" && "__dcrsPdfHeldBack" in window;
  const held = !printing && !!session && session.signOutAtEnd && !!user && user.role !== "admin";

  useEffect(() => {
    if (!held || !session) {
      setLeft(null);
      return;
    }
    let done = false;
    const closeWords = momentWords(new Date(session.endsAt), session.timeZone);
    const tick = () => {
      if (done) return;
      const ms = session.endsAtLocal - Date.now();
      if (ms <= SIGN_OUT_LEAD_MS) {
        done = true;
        setLeft(null);
        void endForHours(END_OF_HOURS_REASON, `You were signed out at the close of working hours, ${closeWords}.`);
        return;
      }
      setLeft(ms <= CLOSING_WARNING_MS ? ms : null);
    };
    tick();
    const ticking = window.setInterval(tick, TICK_MS);
    const rechecking = window.setInterval(() => void refreshSession(), RECHECK_MS);
    return () => {
      done = true;
      window.clearInterval(ticking);
      window.clearInterval(rechecking);
    };
  }, [held, session, endForHours, refreshSession]);

  // A new session, or a close the server moved: the warning is shown afresh.
  useEffect(() => setPutAside(false), [session?.endsAt]);

  if (!held || !session || left === null) return null;
  const minutes = Math.max(1, Math.ceil((left - SIGN_OUT_LEAD_MS) / 60000));
  if (putAside && minutes > 1) return null;
  const closeWords = momentWords(new Date(session.endsAt), session.timeZone);
  return (
    <div
      role="alert"
      data-section="closing-warning"
      data-minutes-left={minutes}
      style={{
        position: "fixed",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 2000,
        width: "min(560px, calc(100vw - 32px))",
        background: "var(--color-warning-bg)",
        color: "var(--color-text)",
        border: "1px solid var(--color-warning)",
        borderRadius: 10,
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.18)",
        padding: "10px 14px",
        fontSize: 13.5,
        lineHeight: 1.45,
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1.2 }}>
        ⏰
      </span>
      <span style={{ flex: 1 }} data-field="closing-warning-text">
        <strong>DCRS closes at {closeWords}</strong>, the end of today's working hours. You will be signed out in {minutes === 1 ? "about a minute" : `${minutes} minutes`} — finish what you are working on now. It opens again on the next working day.
      </span>
      <button type="button" className="btn btn-ghost btn-sm" data-action="closing-warning-ok" onClick={() => setPutAside(true)}>
        OK
      </button>
    </div>
  );
}
