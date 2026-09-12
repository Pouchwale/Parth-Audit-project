import React, { useEffect, useRef } from "react";
import { FiAlertTriangle, FiClock, FiEdit3, FiX } from "react-icons/fi";
import type { CorrectionInfo, HistoryAction, RecordInstance } from "../../types";
import { historyIsDerived, historyOf } from "../../engine/recordHistory";
import { useT } from "../../i18n";

// What an auditor asks to see first: every change to this record, who made
// it, when, and what it said before. Newest first. Collapsed by default so it
// never gets in the way of filling the form in.

const ACTION_KEY: Record<HistoryAction, string> = {
  prepared: "history.prepared",
  edited: "history.edited",
  "assistant-edit": "history.assistantEdit",
  submitted: "history.submitted",
  verified: "history.verified",
  rejected: "history.rejected",
  resumed: "history.resumed",
  reopened: "history.reopened",
  "correction-cancelled": "history.correctionCancelled",
};

const TONE: Partial<Record<HistoryAction, string>> = {
  verified: "ok",
  rejected: "bad",
  reopened: "warn",
  "assistant-edit": "ai",
};

export function RecordHistoryPanel({ record }: { record: RecordInstance }) {
  const t = useT();
  const entries = historyOf(record).slice().reverse();
  const derived = historyIsDerived(record);
  return (
    <details className="card mt-4 record-history no-print" data-section="record-history">
      <summary className="record-history-summary">
        <span className="text-base font-semibold">
          <FiClock size={14} style={{ verticalAlign: -2 }} /> {t("record.history")} ({entries.length})
        </span>
        <span className="text-xs text-muted">{t("record.historyHint")}</span>
      </summary>
      <div className="card-pad">
        {derived && entries.length > 0 && <p className="text-xs text-muted mb-2">{t("record.historyDerived")}</p>}
        {entries.length === 0 && <p className="text-sm text-muted">{t("record.historyEmpty")}</p>}
        <ol className="history-list">
          {entries.map((e) => (
            <li key={e.id} className={`history-entry ${TONE[e.action] ?? ""}`} data-history-action={e.action}>
              <div className="history-head">
                <strong>{t(ACTION_KEY[e.action])}</strong>
                <span className="text-muted">
                  {" "}
                  — <span translate="no">{e.by}</span> · {new Date(e.at).toLocaleString()}
                </span>
              </div>
              {e.note && <div className="text-sm history-note">{e.note}</div>}
              {e.changes && e.changes.length > 0 && (
                <div className="doc-table history-changes-wrap">
                  <table className="compact history-changes">
                    <thead>
                      <tr>
                        <th>{t("record.field")}</th>
                        <th>{t("record.before")}</th>
                        <th>{t("record.after")}</th>
                      </tr>
                    </thead>
                    <tbody className="notranslate" translate="no">
                      {e.changes.map((c) => (
                        <tr key={c.field}>
                          <td>{c.label}</td>
                          <td className="before">{c.before || t("record.blank")}</td>
                          <td className="after">{c.after || t("record.blank")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {e.moreChanges ? <div className="text-xs text-muted">{t("record.moreChanges", { n: e.moreChanges })}</div> : null}
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}

// "reopened by {by} on …" with the person's name kept out of Google Translate
// (a name must never be translated) — the sentence around it still is.
function CorrectionBy({ correction }: { correction: CorrectionInfo }) {
  const t = useT();
  const NAME = "";
  const [before, after = ""] = t("record.correctionBy", { by: NAME, when: new Date(correction.at).toLocaleString(), status: correction.fromStatus }).split(NAME);
  return (
    <>
      {before}
      <span translate="no">{correction.by}</span>
      {after}
    </>
  );
}

/** Shown while a record that had been submitted or verified is reopened to correct it. */
// `onCancel`, where the page offers it, puts the record straight back as it was
// before Edit — for the common case of opening a record to correct it and
// finding there was nothing to correct.
export function CorrectionBanner({ correction, onCancel }: { correction: CorrectionInfo; onCancel?: () => void }) {
  const t = useT();
  return (
    <div className="card mb-4 correction-banner no-print" data-section="correction-banner" role="status">
      <div className="card-pad text-sm">
        <div className="flex items-start justify-between gap-2 wrap">
          <div>
            <strong>
              <FiEdit3 size={13} style={{ verticalAlign: -1 }} /> {t("record.beingCorrected")}
            </strong>{" "}
            — <CorrectionBy correction={correction} />
            <div className="mt-1">
              <strong>{t("record.reason")}:</strong> <span translate="no">{correction.reason}</span>
            </div>
            <div className="text-xs text-muted mt-1">{onCancel ? t("record.correctionNextOrCancel") : t("record.correctionNext")}</div>
          </div>
          {onCancel && (
            <button className="btn btn-secondary btn-sm" data-action="cancel-correction-banner" onClick={onCancel}>
              <FiX size={13} /> {t("record.cancelCorrection")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** The list of what's stopping a submit/verify — scrolled into view, so it's never missed. */
export function ErrorList({ errors, heading }: { errors: string[]; heading: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (errors.length > 0) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [errors]);
  if (errors.length === 0) return null;
  return (
    <div ref={ref} className="card mb-4 no-print error-list" role="alert" style={{ borderColor: "var(--color-danger)", background: "var(--color-danger-bg)" }}>
      <div className="card-pad">
        <strong className="text-danger">
          <FiAlertTriangle size={14} style={{ verticalAlign: -2 }} /> {heading}
        </strong>
        <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
          {errors.map((e, i) => (
            <li key={i} className="text-danger text-sm">
              {e}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
