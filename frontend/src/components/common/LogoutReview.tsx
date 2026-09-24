import React, { useEffect, useMemo, useState } from "react";
import { FiAlertTriangle, FiArrowRight, FiCheckCircle, FiLogOut } from "react-icons/fi";
import { Modal } from "./Modal";
import { useAuth } from "../../store/AuthContext";
import { useRouter } from "../../store/router";
import { notificationsFor, PRIORITY_ORDER, type DaysWork, type Notification } from "../../engine/notifications";
import { firstNameOf } from "../../engine/assistantPersona";
import { syncState } from "../../data/serverSync";

// "REVIEW AND SUBMIT TODAY'S WORK" — ASKED EVERY TIME ANYBODY LOGS OUT
// (REQUIREMENTS §72).
//
// "when user logout out every time the pop should also come that have to
// reviewed and submitted your todays work and this is applicable to all user of
// all module."
//
// Every time, for every account, in every module. A day's paperwork that was
// filled in but never submitted is, to an auditor, a day with no record: the
// whole point of asking at the door is that the person is still here to fix it.
//
// It lists what is waiting for THEM — their department's documents and the ones
// Master Data names them on, the same rule the daily notification uses (§69) —
// worst first, and offers to open the first one. Nobody is held here: "Log out"
// always logs out. Being told is the point; being trapped is not.
//
// WORKED OUT WHEN IT OPENS, never while drawing (§65): the question walks every
// format's records, and logging out is exactly the moment there is time for it.

const MAX_LISTED = 6;

export function LogoutReview({ onCancel, onLogout }: { onCancel: () => void; onLogout: () => void }) {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const [work, setWork] = useState<DaysWork | null>(null);
  // WHAT HAS NOT REACHED THE DATABASE YET (REQUIREMENTS §55, §72). Everything
  // typed is already saved on this computer — that happens as you go
  // (pages/RecordPage.tsx) — but until data/serverSync.ts has sent it to
  // PostgreSQL no other computer can see it. Logging out at that moment is
  // safe and loses nothing; it is still worth knowing, and this is the one
  // moment the person is still here to be told.
  const [sync] = useState(() => syncState());

  useEffect(() => {
    // Live work only: the demo year is synthetic and nobody is behind on it.
    try {
      setWork(notificationsFor(user, false));
    } catch {
      // The list is a courtesy; it must never stand between a person and the
      // door. With no list the pop-up still asks, with no counts.
      setWork(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const outstanding: Notification[] = useMemo(() => {
    if (!work) return [];
    // What is actually DUE — today or already late. Something due next week is
    // not "today's work" and saying so at the door would cry wolf every
    // evening until people stopped reading it.
    return work.notifications.filter((n) => n.daysUntilDue <= 0);
  }, [work]);

  const first = firstNameOf(user?.name);
  const late = outstanding.filter((n) => n.daysUntilDue < 0).length;
  const dueToday = outstanding.length - late;
  const nothing = outstanding.length === 0;
  const rank = (n: Notification) => PRIORITY_ORDER.indexOf(n.priority);
  const listed = outstanding.slice().sort((a, b) => rank(a) - rank(b) || a.daysUntilDue - b.daysUntilDue);

  return (
    <Modal
      title={nothing ? "Log out" : "Before you go — today's work"}
      onClose={onCancel}
      width={620}
      footer={
        <div className="flex items-center justify-between gap-2 wrap" style={{ width: "100%" }}>
          <span className="text-xs text-faint">
            {work === null
              ? "Your work is saved as you type."
              : nothing
                ? "Everything of yours that fell due has been submitted."
                : "Anything left in progress stays saved — it is waiting to be submitted, not lost."}
          </span>
          <div className="flex gap-2 wrap">
            {!nothing && (
              <button
                className="btn btn-primary btn-sm"
                data-action="logout-review-open"
                onClick={() => {
                  onCancel();
                  navigate(listed[0].route);
                }}
              >
                Review it now <FiArrowRight size={12} />
              </button>
            )}
            <button className="btn btn-secondary btn-sm" data-action="logout-review-stay" onClick={onCancel}>
              Stay signed in
            </button>
            <button className={`btn btn-sm ${nothing ? "btn-primary" : "btn-ghost"}`} data-action="logout-review-confirm" onClick={onLogout}>
              <FiLogOut size={12} /> Log out
            </button>
          </div>
        </div>
      }
    >
      <div data-section="logout-review" data-outstanding={outstanding.length} data-late={late} data-unsent={sync.pending}>
        {(sync.pending > 0 || sync.failing) && (
          <p className="text-xs mb-3" data-field="logout-review-unsent" style={{ color: "var(--color-warning)", fontWeight: 600 }}>
            {sync.failing
              ? "The database cannot be reached just now, so some of your work is still held on this computer. Nothing is lost — it is sent as soon as the database answers, and it will go the next time you sign in on this machine."
              : `${sync.pending} ${sync.pending === 1 ? "change is" : "changes are"} still on their way to the database. They are saved here and will finish sending; logging out now loses nothing.`}
          </p>
        )}
        {work === null ? (
          <p className="text-sm">
            {first ? `${first}, ` : ""}are you sure you want to log out? Everything you have typed is saved.
          </p>
        ) : nothing ? (
          <p className="text-sm flex items-start gap-2">
            <FiCheckCircle size={16} style={{ color: "var(--color-success)", flex: "0 0 auto", marginTop: 1 }} />
            <span data-field="logout-review-headline">
              {work.theirOwn
                ? `Nothing is waiting for you${first ? `, ${first}` : ""} — everything of yours that fell due today is submitted. Log out?`
                : `Nothing is waiting anywhere today — the whole file is in. Log out?`}
            </span>
          </p>
        ) : (
          <>
            <p className="text-sm flex items-start gap-2 mb-3">
              <FiAlertTriangle size={16} style={{ color: late > 0 ? "var(--color-danger)" : "var(--color-warning)", flex: "0 0 auto", marginTop: 1 }} />
              <span data-field="logout-review-headline">
                {first ? `${first}, ` : ""}
                {late > 0
                  ? `${late} ${late === 1 ? "document is" : "documents are"} late${dueToday > 0 ? ` and ${dueToday} more ${dueToday === 1 ? "is" : "are"} due today` : ""}.`
                  : `${dueToday} ${dueToday === 1 ? "document is" : "documents are"} due today and not submitted yet.`}{" "}
                {work.theirOwn ? "They are yours to review and submit." : "They are the plant's, not assigned to anybody in particular."}
              </span>
            </p>
            <ul className="plain-list" data-field="logout-review-list">
              {listed.slice(0, MAX_LISTED).map((n) => (
                <li key={n.recordId} data-document={n.documentId} data-priority={n.priority}>
                  <button
                    className="link-button text-sm"
                    onClick={() => {
                      onCancel();
                      navigate(n.route);
                    }}
                  >
                    {n.what}
                  </button>
                  <div className="text-xs text-muted">
                    {n.module} · {n.frequency} ·{" "}
                    <span style={{ color: n.daysUntilDue < 0 ? "var(--color-danger)" : "var(--color-warning)", fontWeight: 600 }}>{n.when}</span>
                  </div>
                </li>
              ))}
            </ul>
            {listed.length > MAX_LISTED && <div className="text-xs text-faint mt-2">…and {listed.length - MAX_LISTED} more.</div>}
          </>
        )}
      </div>
    </Modal>
  );
}
