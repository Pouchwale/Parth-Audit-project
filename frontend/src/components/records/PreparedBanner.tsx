import React, { useState } from "react";
import { FiRefreshCw, FiZap } from "react-icons/fi";
import type { PreparedInfo, RecordStatus } from "../../types";
import { useT } from "../../i18n";

// Shown at the top of any record the assistant pre-filled. Says exactly what
// was filled in and where the values came from, so "review and confirm" is a
// real review and not a rubber stamp. A Live record holds only the known parts
// (engine/knownParts.ts, REQUIREMENTS §98), and the banner says so: the
// readings are the person's.
export function PreparedBanner({
  prepared,
  status,
  onReprepare,
  mayWrite = true,
}: {
  prepared: PreparedInfo;
  status: RecordStatus;
  onReprepare?: () => void;
  /** May the viewer fill it (Write or more, REQUIREMENTS §96)? A person who only reads it is never told to enter or submit anything. */
  mayWrite?: boolean;
}) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const draft = ["Scheduled", "Due", "In Progress", "Rejected"].includes(status);
  const knownParts = prepared.knownPartsOnly === true;
  const when = new Date(prepared.at);
  return (
    <div className="prepared-banner mb-4">
      <div className="flex items-start justify-between gap-3 wrap">
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="font-semibold text-sm flex items-center gap-2">
            <FiZap size={14} />{" "}
            {knownParts
              ? draft
                ? mayWrite
                  ? "Your assistant has filled this in as far as it is known: the readings are yours to enter"
                  : "The assistant prepared the known parts; the readings are for the people who answer for this document"
                : "The known parts were prepared by your assistant; the readings were entered and submitted by people"
              : draft
                ? "Your assistant has filled this in for you"
                : "Filled in by your assistant, then reviewed and submitted"}
          </div>
          <div className="text-xs text-muted mt-1">
            Prepared {when.toLocaleString()} · based on {prepared.basedOn}
          </div>
          <ul className="text-sm mt-2" style={{ margin: "8px 0 0 18px", padding: 0 }}>
            {prepared.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
          {draft && mayWrite && (
            <div className="text-xs mt-2 text-muted">
              {knownParts ? "Enter what you saw, check the rest, then press " : "Have a look, change anything that was different today, then press "}
              <strong>Submit</strong>. Nothing is recorded as yours until you do.
            </div>
          )}
        </div>
        {draft && onReprepare && !confirming && (
          <button className="btn btn-secondary btn-sm no-print" onClick={() => setConfirming(true)} title="Let the assistant fill it in again">
            <FiRefreshCw size={12} /> Fill again
          </button>
        )}
        {draft && onReprepare && confirming && (
          // "Fill again" replaces the whole form — ask once, so a stray click
          // can't wipe what someone just typed.
          <div className="no-print text-sm" style={{ maxWidth: 260 }}>
            <div className="mb-2">{t("record.fillAgainConfirm")}</div>
            <div className="flex gap-2">
              <button
                className="btn btn-primary btn-sm"
                data-action="confirm-fill-again"
                onClick={() => {
                  setConfirming(false);
                  onReprepare();
                }}
              >
                <FiRefreshCw size={12} /> {t("record.replace")}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
