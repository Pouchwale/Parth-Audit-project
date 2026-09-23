import React, { useEffect, useMemo, useRef, useState } from "react";
import { FiAlertCircle, FiArrowRight, FiCheck, FiCheckCircle, FiClock, FiSend, FiShield, FiTrash2, FiX } from "react-icons/fi";
import { ASSISTANT_NAME } from "../../engine/assistantPersona";
import { useAppStore } from "../../store/AppStore";
import { useAuth } from "../../store/AuthContext";
import { useRouter } from "../../store/router";
import { prepareDueRecords } from "../../engine/assistantPrepare";
import { computeBriefing, briefingHeadline, pendingCount, submitPreparedRecords, upcomingLabel, type Briefing, type BriefingItem } from "../../engine/assistantBriefing";
import { dueBriefingSlot, recordBriefingShown } from "../../engine/briefingSchedule";
import { purgePreLaunchNoise } from "../../engine/backlogCleanup";
import { computeReminders } from "../../engine/reminders";
import type { BriefingSlot } from "../../data/repositories/settingsRepository";
import { reminderDigestApi } from "../../api/client";
import { formatDisplayDate, todayISO } from "../../utils/date";

export const OPEN_BRIEFING_EVENT = "dcrs:open-briefing";

// Lets any button in the app (top bar, dashboard, assistant widget) re-open
// the briefing without threading state through the whole tree.
export function openBriefing(): void {
  window.dispatchEvent(new Event(OPEN_BRIEFING_EVENT));
}

// How many rows a section lists before collapsing to "…and N more". The
// briefing is a glance, not a register — a section with hundreds of rows
// was what made it take seconds to paint and made the top-bar button look
// dead. "Submit all" still covers every prepared record, not just the shown.
const MAX_ROWS = 12;

// THE ASSISTANT'S GREETING. Pops up by itself on the schedule in
// engine/briefingSchedule.ts (first ever open; first hour of the day; last
// hour of the day if anything is still unsubmitted) and on demand from the
// top bar. It runs the preparation step itself first, so a user who logs in
// at 07:00 still finds today's records ready rather than empty.
export function AssistantBriefingPopup() {
  const { version, bump, currentUser } = useAppStore();
  const { user } = useAuth();
  const { navigate } = useRouter();
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState<BriefingSlot | "manual">("manual");
  const [submitResult, setSubmitResult] = useState<{ submitted: number; failed: number } | null>(null);
  // The records the person has ticked as reviewed and verified, this sitting.
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [purged, setPurged] = useState<number | null>(null);

  useEffect(() => {
    const created = prepareDueRecords();
    if (created.length > 0) bump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // WORKED OUT WHEN IT IS SHOWN, not on every change of anything (REQUIREMENTS §65).
  // computeBriefing walks every recordable format's records, validates every
  // prepared one and then works out every reminder — 19 ms with a month on file
  // here, 0.1 s on a slow laptop — and this ran on every bump even while the
  // popup was closed, which is almost always. The one thing the closed popup
  // needs is whether anything is still pending, and only in the evening slot:
  // the tick below asks for that at the minute it fires.
  const briefing: Briefing | null = useMemo(() => (open ? computeBriefing(user?.name) : null), [open, version, user?.name]);

  // Scheduled showing: check on mount and then once a minute, so an app left
  // open all day still gets its end-of-day nudge at the right time.
  useEffect(() => {
    const tick = () => {
      if (open) return;
      const due = dueBriefingSlot(new Date(), () => pendingCount(computeBriefing(user?.name)) > 0);
      if (!due) return;
      recordBriefingShown(due);
      setSlot(due);
      setSubmitResult(null);
      setOpen(true);
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.name]);

  useEffect(() => {
    const onOpen = () => {
      setSlot("manual");
      setSubmitResult(null);
      setOpen(true);
    };
    window.addEventListener(OPEN_BRIEFING_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_BRIEFING_EVENT, onOpen);
  }, []);

  // Best-effort e-mail digest of anything due/overdue — the server only
  // actually sends once per calendar date (see backend/digest.ts).
  const digestRequestedRef = useRef(false);
  useEffect(() => {
    if (digestRequestedRef.current) return;
    const urgent = computeReminders(false).filter((r) => r.urgency !== "upcoming");
    if (urgent.length === 0) return;
    digestRequestedRef.current = true;
    reminderDigestApi
      .send(urgent.slice(0, 200).map((r) => ({ documentName: r.documentName, dueDate: r.dueDate, urgency: r.urgency, assignedEmployees: r.assignedEmployees.map((e) => ({ name: e.name, email: e.email })) })))
      .catch(() => {
        /* the in-app briefing already surfaced this */
      });
  }, [version]);

  if (!open || !briefing) return null;

  const dismiss = () => setOpen(false);
  const go = (route: string) => {
    dismiss();
    navigate(route);
  };
  // NOTHING GOES FOR VERIFICATION UNSEEN (REQUIREMENTS §62). Mitra fills these
  // records in, so the briefing will not submit one until the person says they
  // have reviewed and verified it — a tick per record. "Submit" is disabled
  // until then, and "Submit all" sends only the ticked ones. The tick is for
  // this sitting only: a record prepared again tomorrow is looked at again.
  const submitOne = (item: BriefingItem) => {
    if (!reviewed.has(item.recordId)) return;
    const r = submitPreparedRecords([item], currentUser);
    setSubmitResult({ submitted: r.submitted, failed: r.failed.length });
    bump();
  };
  const reviewedReady = briefing.ready.filter((item) => reviewed.has(item.recordId));
  const submitAll = () => {
    if (reviewedReady.length === 0) return;
    const r = submitPreparedRecords(reviewedReady, currentUser);
    setSubmitResult({ submitted: r.submitted, failed: r.failed.length });
    bump();
  };
  const toggleReviewed = (recordId: string) =>
    setReviewed((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  const cleanUp = () => {
    setPurged(purgePreLaunchNoise());
    bump();
  };

  const total = briefing.ready.length + briefing.needsInput.length + briefing.overdue.length + briefing.awaitingVerification.length;
  const subtitle =
    slot === "evening"
      ? "end of the day — this is what's still waiting on you before you go"
      : slot === "morning" || slot === "first"
        ? `${ASSISTANT_NAME} has been through today's paperwork`
        : "where things stand right now";

  return (
    <div className="no-print" style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.42)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="card briefing" style={{ width: 640, maxWidth: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-lg)" }}>
        <div className="briefing-head">
          <div className="flex items-center gap-3">
            <div className="briefing-avatar" style={{ fontSize: 15, fontWeight: 700 }} aria-hidden="true">
              {ASSISTANT_NAME.charAt(0)}
            </div>
            <div>
              <div className="text-lg font-bold">{slot === "evening" ? `Before you go, ${briefing.greeting.replace(/^Good \w+, /, "").replace(/!$/, "")}` : briefing.greeting}</div>
              <div className="text-xs" style={{ opacity: 0.85 }}>
                {formatDisplayDate(todayISO())} · {subtitle}
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={dismiss} aria-label="Close briefing" style={{ color: "#fff" }}>
            <FiX size={16} />
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: "16px 20px" }}>
          <p className="text-sm mb-3">{briefingHeadline(briefing)}</p>

          {submitResult && (
            <div className="card mb-3" style={{ borderColor: "var(--color-success)", background: "var(--color-success-bg)" }}>
              <div className="card-pad text-sm" style={{ padding: "10px 14px" }}>
                <FiCheckCircle size={13} style={{ verticalAlign: -2 }} /> Submitted {submitResult.submitted} record{submitResult.submitted === 1 ? "" : "s"} for verification.
                {submitResult.failed > 0 && ` ${submitResult.failed} still need${submitResult.failed === 1 ? "s" : ""} a detail from you (listed below).`}
              </div>
            </div>
          )}

          {(briefing.noiseCount > 0 || purged !== null) && (
            <Section icon={<FiTrash2 size={13} />} tone="warning" title={purged !== null ? "Cleaned up" : `${briefing.noiseCount} leftover records from before this system went live`}>
              <div className="text-xs text-muted">
                {purged !== null
                  ? `Removed ${purged} blank, untouched record${purged === 1 ? "" : "s"} dated before ${briefing.liveStartDate ? formatDisplayDate(briefing.liveStartDate) : "today"}. Nothing anyone had opened, edited or submitted was touched.`
                  : `These were generated for dates before ${briefing.liveStartDate ? formatDisplayDate(briefing.liveStartDate) : "today"} (from browsing old calendar months) and nobody has ever opened them — they aren't real work, so I've left them out of the lists below. Safe to remove; anything edited, submitted or verified is never touched.`}
              </div>
              {purged === null && (
                <div>
                  <button className="btn btn-secondary btn-sm" onClick={cleanUp}>
                    <FiTrash2 size={12} /> Clean up {briefing.noiseCount}
                  </button>
                </div>
              )}
            </Section>
          )}

          {briefing.ready.length > 0 && (
            <Section
              icon={<FiCheck size={13} />}
              tone="success"
              title={`Filled in and ready for your OK (${briefing.ready.length})`}
              action={
                <button
                  className="btn btn-success btn-sm"
                  data-action="briefing-submit-all"
                  onClick={submitAll}
                  disabled={reviewedReady.length === 0}
                  title={reviewedReady.length === 0 ? "Tick “Reviewed & verified” on the records you have checked first" : "Submit the records you have ticked as reviewed"}
                >
                  <FiSend size={12} /> Submit {reviewedReady.length} reviewed
                </button>
              }
            >
              {briefing.ready.slice(0, MAX_ROWS).map((item) => (
                <ItemRow
                  key={item.recordId}
                  item={item}
                  onView={() => go(item.route)}
                  onSubmit={() => submitOne(item)}
                  reviewed={reviewed.has(item.recordId)}
                  onReviewed={() => toggleReviewed(item.recordId)}
                />
              ))}
              <div className="text-xs text-muted mt-1" data-section="briefing-review-rule">
                I filled these in, so check each one — View opens it — and tick <strong>Reviewed &amp; verified</strong>. Only a ticked record can be submitted.
              </div>
              <More count={briefing.ready.length - MAX_ROWS} hint="Open them from the Dashboard to review them too." />
            </Section>
          )}

          {briefing.needsInput.length > 0 && (
            <Section icon={<FiAlertCircle size={13} />} tone="warning" title={`Needs a detail only you know (${briefing.needsInput.length})`}>
              {briefing.needsInput.slice(0, MAX_ROWS).map((item) => (
                <ItemRow key={item.recordId} item={item} onView={() => go(item.route)} showErrors />
              ))}
              <More count={briefing.needsInput.length - MAX_ROWS} hint="Open the Calendar to work through the rest day by day." onMore={() => go("/calendar")} />
            </Section>
          )}

          {briefing.overdue.length > 0 && (
            <Section icon={<FiAlertCircle size={13} />} tone="danger" title={`Still open from earlier (${briefing.overdue.length})`}>
              {briefing.overdue.slice(0, MAX_ROWS).map((item) => (
                <ItemRow key={item.recordId} item={item} onView={() => go(item.route)} showErrors />
              ))}
              <More count={briefing.overdue.length - MAX_ROWS} hint="Open the Calendar to see the rest." onMore={() => go("/calendar")} />
            </Section>
          )}

          {briefing.awaitingVerification.length > 0 && (
            <Section icon={<FiShield size={13} />} tone="info" title={`Waiting for a verifier (${briefing.awaitingVerification.length})`}>
              {briefing.awaitingVerification.slice(0, MAX_ROWS).map((item) => (
                <ItemRow key={item.recordId} item={item} onView={() => go(item.route)} compact />
              ))}
              <More count={briefing.awaitingVerification.length - MAX_ROWS} />
            </Section>
          )}

          {briefing.upcoming.length > 0 && (
            <Section icon={<FiClock size={13} />} tone="neutral" title={`Coming up — I'll prepare these on the day (${briefing.upcoming.length})`}>
              {briefing.upcoming.slice(0, MAX_ROWS).map((item) => (
                <div key={item.recordId} className="text-xs text-muted" style={{ padding: "3px 0" }}>
                  <span className="font-semibold" style={{ color: "var(--color-text)" }}>{item.documentName}</span> — {upcomingLabel(item)}
                </div>
              ))}
              <More count={briefing.upcoming.length - MAX_ROWS} />
            </Section>
          )}

          {briefing.renewals.length > 0 && (
            <Section icon={<FiShield size={13} />} tone="warning" title="Compliance statements due for re-issue">
              {briefing.renewals.map((r) => (
                <div key={r.documentId} className="flex items-center justify-between text-xs" style={{ padding: "4px 0" }}>
                  <span>
                    <span className="font-semibold">{r.documentName}</span> — valid until {formatDisplayDate(r.validUntil)} ({r.daysLeft < 0 ? `${-r.daysLeft} days ago` : `${r.daysLeft} days left`})
                  </span>
                  <button className="btn btn-ghost btn-sm" onClick={() => go(`/soc/${r.documentId}`)}>
                    Open <FiArrowRight size={11} />
                  </button>
                </div>
              ))}
            </Section>
          )}

          {total === 0 && briefing.upcoming.length === 0 && (
            <div className="empty-state" style={{ padding: "20px 0" }}>
              <FiCheckCircle size={26} style={{ color: "var(--color-success)" }} />
              <div className="mt-2">Nothing waiting on you. Enjoy the quiet — I'll prepare tomorrow's records when the day comes.</div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2" style={{ padding: "12px 20px", borderTop: "1px solid var(--color-border)" }}>
          <span className="text-xs text-faint">Shows itself in the first and last hour of the day; reopen any time from the top bar.</span>
          <div className="flex gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => go("/dashboard")}>
              Dashboard
            </button>
            <button className="btn btn-primary btn-sm" onClick={dismiss}>
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function More({ count, hint, onMore }: { count: number; hint?: string; onMore?: () => void }) {
  if (count <= 0) return null;
  return (
    <div className="text-xs text-muted flex items-center gap-2" style={{ padding: "2px 0" }}>
      <span>
        …and {count} more.{hint ? ` ${hint}` : ""}
      </span>
      {onMore && (
        <button className="btn btn-ghost btn-sm" style={{ padding: "2px 6px" }} onClick={onMore}>
          Calendar <FiArrowRight size={10} />
        </button>
      )}
    </div>
  );
}

function Section({ icon, tone, title, action, children }: { icon: React.ReactNode; tone: "success" | "warning" | "danger" | "info" | "neutral"; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={`briefing-section tone-${tone} mb-3`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-sm font-semibold flex items-center gap-2">
          {icon} {title}
        </div>
        {action}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </div>
  );
}

function ItemRow({
  item,
  onView,
  onSubmit,
  showErrors,
  compact,
  reviewed,
  onReviewed,
}: {
  item: BriefingItem;
  onView: () => void;
  onSubmit?: () => void;
  showErrors?: boolean;
  compact?: boolean;
  /** Ticked as reviewed and verified — what makes Submit available (REQUIREMENTS §62). */
  reviewed?: boolean;
  onReviewed?: () => void;
}) {
  const today = todayISO();
  const late = item.dueDate < today;
  return (
    <div className="briefing-item">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-semibold">{item.documentName}</span>
          {item.formatNo !== "TO BE CONFIRMED" && <span className="text-faint text-xs"> · {item.formatNo}</span>}
          <span className={`text-xs ${late ? "text-danger" : "text-muted"}`}> · {item.dueDate === today ? "today" : formatDisplayDate(item.dueDate)}</span>
        </div>
        <div className="flex gap-1">
          <button className="btn btn-ghost btn-sm" onClick={onView}>
            View <FiArrowRight size={11} />
          </button>
          {onSubmit && onReviewed && (
            <label className="text-xs flex items-center gap-1" style={{ cursor: "pointer", whiteSpace: "nowrap" }} data-field="briefing-reviewed">
              <input type="checkbox" checked={!!reviewed} onChange={onReviewed} /> Reviewed &amp; verified
            </label>
          )}
          {onSubmit && (
            <button
              className="btn btn-success btn-sm"
              data-action="briefing-submit"
              onClick={onSubmit}
              disabled={!reviewed}
              title={reviewed ? "Submit for verification" : "Review the record and tick “Reviewed & verified” first"}
            >
              <FiSend size={11} /> Submit
            </button>
          )}
        </div>
      </div>
      {!compact && item.notes.length > 0 && (
        <ul className="text-xs text-muted" style={{ margin: "4px 0 0 16px", padding: 0 }}>
          {item.notes.slice(0, 2).map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      {showErrors && item.errors.length > 0 && (
        <div className="text-xs text-danger mt-1">
          {item.errors.slice(0, 2).join(" ")}
          {item.errors.length > 2 ? ` (+${item.errors.length - 2} more)` : ""}
        </div>
      )}
    </div>
  );
}
