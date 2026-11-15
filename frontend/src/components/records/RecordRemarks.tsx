import { useState } from "react";
import { FiMessageSquare, FiX } from "react-icons/fi";
import type { RecordInstance } from "../../types";
import { formatDisplayDateTime } from "../../utils/date";

// THE REMARKS OF A RECORD, under its form and outside what prints (REQUIREMENTS §212): .no-print keeps them off the
// original-style print, and the downloads skip .no-print too (utils/documentExport.ts).
export function RecordRemarks({
  record,
  mayWrite,
  onAdd,
  onRemove,
}: {
  record: RecordInstance;
  mayWrite: boolean;
  onAdd: (text: string) => void;
  onRemove: (remarkId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const remarks = record.remarks ?? [];
  const save = () => {
    if (!text.trim()) return;
    onAdd(text);
    setText("");
    setOpen(false);
  };
  return (
    <div className="card mt-4 no-print" data-section="record-remarks">
      <div className="card-pad">
        <div className="flex items-center justify-between gap-2 wrap mb-2">
          <strong className="text-sm">Remarks</strong>
          {mayWrite && !open && (
            <button className="btn btn-secondary btn-sm" data-action="add-remark" onClick={() => setOpen(true)}>
              <FiMessageSquare size={12} /> Add remark
            </button>
          )}
        </div>
        {remarks.length === 0 && !open && <div className="text-xs text-muted">No remarks yet. Remarks show here only and are not printed on the original-style record.</div>}
        {remarks.map((r) => (
          <div key={r.id} className="flex items-start justify-between gap-2 mb-2" data-remark={r.id}>
            <div className="text-sm">
              <div style={{ whiteSpace: "pre-wrap" }}>{r.text}</div>
              <div className="text-xs text-muted">
                <span translate="no">{r.by}</span>, {formatDisplayDateTime(r.at)}
              </div>
            </div>
            {mayWrite && (
              <button className="btn btn-ghost btn-sm" data-action="remove-remark" title="Remove this remark" aria-label="Remove this remark" onClick={() => onRemove(r.id)}>
                <FiX size={12} />
              </button>
            )}
          </div>
        ))}
        {open && (
          <div className="flex flex-col gap-2">
            <textarea
              className="input"
              data-field="remark-text"
              rows={3}
              maxLength={1000}
              autoFocus
              value={text}
              placeholder="Write the remark"
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex gap-2">
              <button className="btn btn-primary btn-sm" data-action="save-remark" disabled={!text.trim()} onClick={save}>
                Save remark
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setText("");
                  setOpen(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
