import React, { useRef, useState } from "react";
import { FiCheckCircle, FiInfo, FiUpload } from "react-icons/fi";
import type { LogSheetData, LogSheetLayout } from "../../types";
import { ApiError, purchaseApi } from "../../api/client";
import { applyFills, type FieldFill } from "../../engine/hrMaster";
import { supplierFormFills } from "../../engine/supplierFormImport";

// F/PUR/01 FILLED FROM THE SUPPLIER'S OWN COPY OF THE FORM (REQUIREMENTS §191): a card above the form - choose the file
// the supplier sent back (PDF with text, Word .docx or plain text, 5 MB at most), "Read & fill", and the form's blank
// boxes are written from it at once; a box already holding something else is listed, to be replaced only if the person
// says so; what the file did not give is said. Nothing is stored but what lands on the record.

const ACCEPT = ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

export function SupplierFormImport({ layout, data, onChange }: { layout: LogSheetLayout; data: LogSheetData; onChange: (data: LogSheetData) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [outcome, setOutcome] = useState<{ tone: "ok" | "info" | "error"; text: string } | null>(null);
  const [conflicts, setConflicts] = useState<FieldFill[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // A label as it reads inside a sentence: "SUPPLIER'S NAME" rather than the form's "SUPPLIER'S NAME :", without the paper's
  // notes ("(Please attach a separate sheet if required)").
  const labelOf = (key: string) =>
    (layout.headerFields.find((f) => f.key === key)?.label ?? key)
      .replace(/\s*\([^)]*\)/g, "")
      .replace(/[\s:–-]+$/, "")
      .trim();
  const listed = (fills: FieldFill[]) => fills.map((f) => labelOf(f.key)).join(", ");
  const boxes = (n: number) => `${n} box${n === 1 ? "" : "es"}`;

  const read = async () => {
    if (!file || reading) return;
    setReading(true);
    setOutcome(null);
    setConflicts([]);
    try {
      const result = await purchaseApi.readSupplierForm(file);
      // Only the boxes this format still has (the Sheet Designer can remove one).
      const { fills, conflicts: held } = supplierFormFills(
        result.fields,
        data.header ?? {},
        layout.headerFields.map((f) => f.key)
      );
      if (fills.length > 0) onChange({ ...data, header: applyFills(data.header ?? {}, fills) });
      setConflicts(held);
      const missing = result.missing.length > 0 ? ` Not found in the file: ${result.missing.join(", ")}.` : "";
      const given = Object.values(result.fields).filter((v) => String(v ?? "").trim()).length;
      if (fills.length === 0 && held.length === 0) {
        setOutcome({ tone: "info", text: given > 0 ? `Nothing to fill from ${file.name}: the form already holds what it states.${missing}` : `No box of the form could be read from ${file.name}.${missing}` });
      } else {
        setOutcome({
          tone: "ok",
          text:
            (fills.length > 0 ? `Filled ${boxes(fills.length)} from ${file.name}: ${listed(fills)}.` : `Nothing blank to fill from ${file.name}.`) +
            (held.length > 0 ? ` ${boxes(held.length)} already hold something else — replace them below if the file is right.` : "") +
            missing,
        });
      }
    } catch (err) {
      setOutcome({ tone: "error", text: err instanceof ApiError ? err.message : "The file couldn't be read — enter the details by hand." });
    } finally {
      setReading(false);
    }
  };

  const replace = () => {
    if (conflicts.length === 0) return;
    onChange({ ...data, header: applyFills(data.header ?? {}, conflicts) });
    setOutcome({ tone: "ok", text: `Replaced ${listed(conflicts)} with what the file states.` });
    setConflicts([]);
  };

  return (
    <div className="card mb-4 no-print" data-section="supplier-form-import">
      <div className="card-pad">
        <div className="text-sm font-semibold mb-1">
          <FiUpload size={13} style={{ verticalAlign: -2 }} /> Fill this form from the supplier's filled-in copy
        </div>
        <div className="flex gap-2 wrap items-center">
          <input
            ref={inputRef}
            type="file"
            className="input input-sm"
            style={{ maxWidth: 360 }}
            data-field="supplier-form-file"
            accept={ACCEPT}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setOutcome(null);
              setConflicts([]);
            }}
          />
          <button className="btn btn-primary btn-sm" data-action="supplier-form-read" disabled={!file || reading} onClick={() => void read()}>
            {reading ? "Reading…" : "Read & fill"}
          </button>
        </div>
        <div className="text-xs text-muted mt-1">
          The form the supplier sent back, as a PDF with text, a Word (.docx) file or plain text, up to 5 MB. Its blank boxes above are filled from it at once; a box already written is replaced only if you say so. A
          scanned picture has no text to read — type those details in.
        </div>
        {outcome && (
          <div className="text-sm mt-2" data-state="supplier-form-result" data-result={outcome.tone}>
            {outcome.tone === "ok" ? <FiCheckCircle size={13} style={{ verticalAlign: -2, color: "var(--color-success)" }} /> : <FiInfo size={13} style={{ verticalAlign: -2 }} />} {outcome.text}
          </div>
        )}
        {conflicts.length > 0 && (
          <div className="mt-2" data-section="supplier-form-conflicts">
            <ul className="text-sm mb-2">
              {conflicts.map((c) => (
                <li key={c.key}>
                  {labelOf(c.key)}: “{c.before}” → “{c.after}”
                </li>
              ))}
            </ul>
            <div className="flex gap-2 wrap">
              <button className="btn btn-primary btn-sm" data-action="supplier-form-replace" onClick={replace}>
                Replace with the file's
              </button>
              <button className="btn btn-secondary btn-sm" data-action="supplier-form-keep" onClick={() => setConflicts([])}>
                Keep what is written
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
