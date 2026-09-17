import React, { useState } from "react";
import { FiSave, FiSend, FiCheckCircle, FiXCircle, FiPrinter, FiRotateCcw, FiTrash2, FiEdit3, FiCheck, FiLoader, FiX } from "react-icons/fi";
import type { RecordStatus } from "../../types";
import { Modal } from "../common/Modal";
import { useT } from "../../i18n";

export type SaveState = "saved" | "saving" | "unsaved";

// Reasons offered as one-tap choices when correcting a record — the common
// ones, so nobody has to think of wording; any other reason can be typed.
const CORRECTION_REASONS = ["record.reason.assistant", "record.reason.wrongValue", "record.reason.typo", "record.reason.late", "record.reason.missing"];

export function RecordActionBar({
  status,
  dirty,
  isDemo,
  saveState,
  onSave,
  onSubmit,
  onVerify,
  onReject,
  onResume,
  onCorrect,
  onCancelCorrection,
  correctionFromStatus,
  correctionChangeCount = 0,
  onPrint,
  download,
  onDelete,
}: {
  status: RecordStatus;
  dirty: boolean;
  isDemo: boolean;
  /** When given, the page saves on its own: show where that stands instead of a Save button. */
  saveState?: SaveState;
  onSave: () => void;
  onSubmit: () => void;
  onVerify: () => void;
  onReject: (reason: string) => void;
  onResume: () => void;
  /** Reopen a submitted / verified record to correct it (reason required). */
  onCorrect?: (reason: string) => void;
  /**
   * Given while the record is open for correction: put it back exactly as it
   * was before Edit — for pressing Edit and finding nothing to change.
   */
  onCancelCorrection?: () => void;
  /** The status it will go back to (what it was reopened from). */
  correctionFromStatus?: RecordStatus;
  /** How much has been changed since Edit — 0 asks nothing, anything else confirms first. */
  correctionChangeCount?: number;
  onPrint: () => void;
  /** Download Excel / Word beside Print (components/common/DownloadDocumentButton.tsx). */
  download?: React.ReactNode;
  // Optional: omit to hide Delete entirely (e.g. while the record's own
  // page hasn't wired a destination to navigate back to after deleting).
  // The reason is what goes into the deletion log (engine/recordCrud.ts).
  onDelete?: (reason: string) => void;
}) {
  const t = useT();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const [correctionReason, setCorrectionReason] = useState("");
  const [cancellingCorrection, setCancellingCorrection] = useState(false);

  const editableStatuses: RecordStatus[] = ["Scheduled", "Due", "In Progress"];
  const verifiableStatuses: RecordStatus[] = ["Submitted", "Pending Verification"];
  // Any record can be deleted — the department asked for full CRUD on every
  // document (12-Sep-2026). A signed-off one is part of the audit trail, so it
  // takes a reason, and every deletion is recorded whatever the status
  // (engine/recordCrud.ts, Document Library → Records deleted).
  const needsReason = ["Submitted", "Pending Verification", "Verified"].includes(status);
  // A rejected record has its own way back (Resume Editing); these are the
  // ones that can only be reopened by a deliberate correction.
  const correctableStatuses: RecordStatus[] = ["Submitted", "Pending Verification", "Verified"];

  const editable = editableStatuses.includes(status);

  return (
    <div className="flex items-center justify-end gap-2 wrap no-print" style={{ marginTop: 16 }}>
      {onDelete && (
        <button className="btn btn-danger btn-sm" onClick={() => setConfirmingDelete(true)} style={{ marginRight: "auto" }}>
          <FiTrash2 size={13} /> {t("common.delete")}
        </button>
      )}
      {download}
      <button className="btn btn-secondary btn-sm" onClick={onPrint}>
        <FiPrinter size={13} /> {t("common.printRecord")}
      </button>

      {/* Pressed Edit and there was nothing to put right: back as it was. */}
      {onCancelCorrection && (
        <button
          className="btn btn-secondary"
          data-action="cancel-correction"
          title={t("record.cancelCorrectionTitle")}
          onClick={() => (correctionChangeCount > 0 ? setCancellingCorrection(true) : onCancelCorrection())}
        >
          <FiX size={14} /> {t("record.cancelCorrection")}
        </button>
      )}

      {editable && (
        <>
          {saveState ? (
            <>
              <span className={`save-state ${saveState}`} data-save-state={saveState} aria-live="polite">
                {saveState === "saving" ? <FiLoader size={13} /> : saveState === "saved" ? <FiCheck size={13} /> : null}{" "}
                {saveState === "saving" ? t("record.saving") : saveState === "saved" ? t("record.saved") : ""}
              </span>
              {dirty && (
                <button className="btn btn-secondary" data-action="save" onClick={onSave}>
                  <FiSave size={14} /> {t("record.saveNow")}
                </button>
              )}
            </>
          ) : (
            <button className="btn btn-secondary" data-action="save" onClick={onSave} disabled={!dirty}>
              <FiSave size={14} /> {t("common.save")}
            </button>
          )}
          <button className="btn btn-primary" data-action="submit" onClick={onSubmit}>
            <FiSend size={14} /> {t("common.submit")}
          </button>
        </>
      )}

      {status === "Rejected" && (
        <button className="btn btn-primary" data-action="resume" onClick={onResume}>
          <FiRotateCcw size={14} /> {t("common.resumeEditing")}
        </button>
      )}

      {onCorrect && correctableStatuses.includes(status) && (
        <button className="btn btn-secondary" data-action="correct" onClick={() => setCorrecting(true)}>
          <FiEdit3 size={14} /> {t("record.correct")}
        </button>
      )}

      {verifiableStatuses.includes(status) && (
        <>
          <button className="btn btn-danger" data-action="reject" onClick={() => setRejecting(true)}>
            <FiXCircle size={14} /> {t("common.reject")}
          </button>
          <button className="btn btn-success" data-action="verify" onClick={onVerify}>
            <FiCheckCircle size={14} /> {t("common.verify")}
            {isDemo ? ` (${t("common.demo")})` : ""}
          </button>
        </>
      )}

      {correcting && onCorrect && (
        <Modal
          title={t("record.correctTitle")}
          onClose={() => setCorrecting(false)}
          footer={
            <div className="flex justify-end gap-2 w-full items-center">
              {!correctionReason.trim() && (
                <span className="text-xs text-muted" style={{ marginRight: "auto" }}>
                  {t("record.correctReasonHint")}
                </span>
              )}
              <button className="btn btn-secondary" onClick={() => setCorrecting(false)}>
                {t("common.cancel")}
              </button>
              <button
                className="btn btn-primary"
                data-action="confirm-correct"
                disabled={!correctionReason.trim()}
                onClick={() => {
                  const why = correctionReason.trim();
                  setCorrecting(false);
                  setCorrectionReason("");
                  onCorrect(why);
                }}
              >
                <FiEdit3 size={13} /> {t("record.reopenForCorrection")}
              </button>
            </div>
          }
        >
          <p className="text-sm mb-3">{t("record.correctIntro", { status })}</p>
          <div className="field">
            <label>{t("record.correctReasonLabel")}</label>
            <div className="chat-chips mb-2">
              {CORRECTION_REASONS.map((k) => (
                <button key={k} type="button" className={`chat-chip ${correctionReason === t(k) ? "primary" : ""}`} onClick={() => setCorrectionReason(t(k))}>
                  {t(k)}
                </button>
              ))}
            </div>
            <textarea className="input" data-field="correction-reason" rows={3} value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} />
          </div>
        </Modal>
      )}

      {cancellingCorrection && onCancelCorrection && (
        <Modal
          title={t("record.cancelCorrectionTitle")}
          onClose={() => setCancellingCorrection(false)}
          footer={
            <div className="flex justify-end gap-2 w-full">
              <button className="btn btn-secondary" onClick={() => setCancellingCorrection(false)}>
                {t("record.keepEditing")}
              </button>
              <button
                className="btn btn-primary"
                data-action="confirm-cancel-correction"
                onClick={() => {
                  setCancellingCorrection(false);
                  onCancelCorrection();
                }}
              >
                <FiRotateCcw size={13} /> {t("record.putItBack")}
              </button>
            </div>
          }
        >
          <p className="text-sm">
            {t("record.cancelCorrectionBody", { count: String(correctionChangeCount), status: correctionFromStatus ?? "" })}
          </p>
        </Modal>
      )}

      {rejecting && (
        <Modal
          title="Reject record"
          onClose={() => setRejecting(false)}
          footer={
            <div className="flex justify-end gap-2 w-full items-center">
              {!reason.trim() && (
                <span className="text-xs text-muted" style={{ marginRight: "auto" }}>
                  {t("common.rejectReasonHint")}
                </span>
              )}
              <button className="btn btn-secondary" onClick={() => setRejecting(false)}>
                {t("common.cancel")}
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  onReject(reason);
                  setRejecting(false);
                  setReason("");
                }}
                disabled={!reason.trim()}
              >
                {t("common.reject")}
              </button>
            </div>
          }
        >
          <div className="field">
            <label>Reason for rejection</label>
            <textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
        </Modal>
      )}

      {confirmingDelete && onDelete && (
        <Modal
          title="Delete this record?"
          onClose={() => setConfirmingDelete(false)}
          footer={
            <div className="flex justify-end gap-2 w-full items-center">
              {needsReason && !deleteReason.trim() && (
                <span className="text-xs text-muted" style={{ marginRight: "auto" }}>
                  Type a reason first
                </span>
              )}
              <button className="btn btn-secondary" onClick={() => setConfirmingDelete(false)}>
                {t("common.cancel")}
              </button>
              <button
                className="btn btn-danger"
                data-action="confirm-delete"
                disabled={needsReason && !deleteReason.trim()}
                onClick={() => {
                  const why = deleteReason.trim() || "Deleted from the record page";
                  setConfirmingDelete(false);
                  setDeleteReason("");
                  onDelete(why);
                }}
              >
                <FiTrash2 size={13} /> {t("common.deletePermanently")}
              </button>
            </div>
          }
        >
          <p className="text-sm">
            This permanently removes the record — there's no undo.
            {needsReason
              ? ` It is ${status}, so it has been through verification: the deletion is recorded — what it was, its status, who removed it, when and why — in Document Library → Records deleted.`
              : " The deletion is recorded in Document Library → Records deleted."}
          </p>
          <div className="field mt-2">
            <label>{needsReason ? "Why is it being deleted?" : "Reason (optional)"}</label>
            <textarea className="input" data-field="delete-reason" rows={2} value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} />
          </div>
        </Modal>
      )}
    </div>
  );
}
