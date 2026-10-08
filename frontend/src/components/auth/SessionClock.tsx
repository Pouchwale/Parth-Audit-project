import React, { useEffect, useState } from "react";
import { useAuth } from "../../store/AuthContext";
import { CLOSING_WARNING_MS, END_OF_DAY_REASON, END_OF_HOURS_REASON, momentWords } from "../../engine/workingHoursCore";
import { currentLanguage } from "../../i18n";
import { uiLanguageFor } from "../../i18n/googleTranslate";
import { hoursWord } from "../../i18n/strings.hours";

// THE END OF A DAY'S SESSION, IN THE BROWSER (REQUIREMENTS §84, C4, and its
// addendum of 6-Oct-2026).
//
// STAFF. A session of anybody but the super admin ends at the close of the
// staff's working hours (6:20 pm unless Master Data says otherwise): after it
// the server answers nothing. So the browser keeps the time itself —
//   * TEN MINUTES BEFORE the close it says so, in a line at the top of the
//     screen that stays until the close (it can be put aside, and comes back for
//     the last minute): "Your working hours end at 6:20 pm …";
//   * AT THE CLOSE it signs the person out by itself, saying why — "At the close
//     of working hours" in the activity log — and the sign-in page opens with
//     the reason. It starts SIGN_OUT_LEAD_MS early, so what is still on its way
//     to the database gets there while the session is still open; anything that
//     does not is kept on this computer and sent at the next sign-in
//     (data/serverSync.ts), as with any session that ends.
//   * EVERY FIVE MINUTES it asks the server about the session again: the super
//     admin may have closed the day sooner (a holiday declared, the hours
//     changed), and then the server's word is what counts.
//
// THE SUPER ADMIN. The hours never hold him (he may sign in and work at any hour
// of any day), but his session still ends with its day, at the factory's
// midnight, so that he too signs in each day. Before 6-Oct-2026 it ended there
// without a word: the next request found the session gone and the whole app
// gave way to the sign-in page, taking with it whatever was only on screen.
// Now the same clock runs for him, in his own words — a warning ten minutes
// before ("Your session for today ends at 12:00 am … sign in again straight
// away to keep working"), then at the end the same clean sign-out as staff get
// (what is still on its way is sent first; "Signed out — At the end of the day
// (midnight)" in the activity log) and the sign-in page saying why. He signs in
// again at once and carries on. Only for a session the server says is not
// signed out at the close of the hours (signOutAtEnd false), which is every
// session of his; staff on a server that holds nobody to the hours
// (DCRS_WORKING_HOURS=off, the e2e runner's) see nothing new.
//
// One check every five seconds, which draws nothing until the warning is due:
// nothing here costs a low-end laptop anything. A server from before §84 sets
// none of it going.

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
  // Staff, held to the hours: warned before their close and signed out at it.
  const held = !printing && !!session && session.signOutAtEnd && !!user && user.role !== "admin";
  // The super admin: warned before the end of his day's session and signed out cleanly at it.
  const dayEnd = !printing && !!session && !session.signOutAtEnd && !!user && user.role === "admin";
  const running = held || dayEnd;

  useEffect(() => {
    if (!running || !session) {
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
        if (held) void endForHours(END_OF_HOURS_REASON, `You were signed out at the close of working hours, ${closeWords}.`);
        else void endForHours(END_OF_DAY_REASON, `Your session for today ended at ${closeWords}, the end of the day. Sign in again to keep working — the super admin can sign in at any time.`);
        return;
      }
      setLeft(ms <= CLOSING_WARNING_MS ? ms : null);
    };
    tick();
    const ticking = window.setInterval(tick, TICK_MS);
    // Only staff's close can be moved by the calendar; the super admin's day ends at its midnight whatever it says.
    const rechecking = held ? window.setInterval(() => void refreshSession(), RECHECK_MS) : 0;
    return () => {
      done = true;
      window.clearInterval(ticking);
      if (rechecking) window.clearInterval(rechecking);
    };
  }, [running, held, session, endForHours, refreshSession]);

  // A new session, or a close the server moved: the warning is shown afresh.
  useEffect(() => setPutAside(false), [session?.endsAt]);

  if (!running || !session || left === null) return null;
  const minutes = Math.max(1, Math.ceil((left - SIGN_OUT_LEAD_MS) / 60000));
  if (putAside && minutes > 1) return null;
  // The app's own Gujarati where it shows (ગુજરાતી chosen, Google's translator out of reach); English otherwise.
  const lang = uiLanguageFor(currentLanguage());
  const time = momentWords(new Date(session.endsAt), session.timeZone, lang);
  const leftWords = minutes === 1 ? hoursWord(lang, "hours.closing.minute") : hoursWord(lang, "hours.closing.minutes", { n: minutes });
  return (
    <div
      role="alert"
      data-section={held ? "closing-warning" : "day-end-warning"}
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
        // The theme's own shadow for what floats over the page (REQUIREMENTS §90): warm in light, deeper in dark.
        boxShadow: "var(--shadow-lg)",
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
      <span style={{ flex: 1 }} data-field={held ? "closing-warning-text" : "day-end-warning-text"}>
        <strong>{hoursWord(lang, held ? "hours.closing.staff" : "hours.closing.admin", { time })}</strong>
        {hoursWord(lang, held ? "hours.closing.staffRest" : "hours.closing.adminRest", { left: leftWords })}
      </span>
      <button type="button" className="btn btn-ghost btn-sm" data-action={held ? "closing-warning-ok" : "day-end-warning-ok"} onClick={() => setPutAside(true)}>
        {hoursWord(lang, "hours.closing.ok")}
      </button>
    </div>
  );
}
