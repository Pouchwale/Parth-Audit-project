import React from "react";
import { FiEdit3, FiPrinter, FiRotateCcw, FiSave, FiX } from "react-icons/fi";
import { useT } from "../../i18n";

// Edit / Save / Cancel (and Print) for a reference document — the SOP, the
// Chemical Master, a Statement of Compliance. Records have their own action
// bar (RecordActionBar); these documents have no draft / verify cycle, so a
// correction is simply edited in place and saved.
export function ReferenceEditBar({
  editing,
  edited,
  onEdit,
  onSave,
  onCancel,
  onRestore,
  onPrint,
}: {
  editing: boolean;
  /** Who last corrected it and when, if anyone has. */
  edited?: { editedBy: string; editedAt: string };
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  /** Offered once the document has been corrected: back to the transcription. */
  onRestore?: () => void;
  onPrint?: () => void;
}) {
  const t = useT();
  return (
    <div className="flex items-center justify-end gap-2 wrap no-print" data-section="reference-edit">
      {!editing && edited && (
        <span className="text-xs text-muted">
          Edited by <span translate="no">{edited.editedBy}</span>, {new Date(edited.editedAt).toLocaleString()}
        </span>
      )}
      {editing ? (
        <>
          <button className="btn btn-secondary btn-sm" onClick={onCancel}>
            <FiX size={13} /> {t("common.cancel")}
          </button>
          <button className="btn btn-primary btn-sm" data-action="save-reference" onClick={onSave}>
            <FiSave size={13} /> {t("common.save")}
          </button>
        </>
      ) : (
        <>
          {edited && onRestore && (
            <button className="btn btn-ghost btn-sm" data-action="restore-reference" onClick={onRestore}>
              <FiRotateCcw size={13} /> Restore the original
            </button>
          )}
          <button className="btn btn-secondary btn-sm" data-action="edit-reference" onClick={onEdit}>
            <FiEdit3 size={13} /> Edit
          </button>
          {onPrint && (
            <button className="btn btn-secondary btn-sm" onClick={onPrint}>
              <FiPrinter size={13} /> {t("common.print")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
