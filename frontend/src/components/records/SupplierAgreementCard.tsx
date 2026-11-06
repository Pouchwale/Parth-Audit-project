import React, { useEffect, useState } from "react";
import { FiAlertTriangle, FiCheckCircle, FiFileText, FiInfo, FiTrash2, FiUpload } from "react-icons/fi";
import type { LogSheetData } from "../../types";
import { ApiError, agreementsApi, type SupplierAgreementFile } from "../../api/client";
import { daysBetween, EXPIRY_WARNING_MONTHS, monthsBefore } from "../../engine/notificationPlan";
import { formatDisplayDate, todayISO } from "../../utils/date";

// THE SERVICE AGREEMENT / CERTIFICATE ON AN F/PUR/01 RECORD (REQUIREMENTS §192; the owner, 6-Nov-2026: "before two month of
// expiry ... the user should get the notification ... and upload the new service agreement"). A card above the form: the
// date the agreement is valid upto (the record's own box, SERVICE AGREEMENT / CERTIFICATE VALID UPTO), how long is left -
// or how long ago it ran out - and the agreement files kept on the record, newest first: each opened in the browser, the
// new one uploaded when it is renewed (a PDF, a Word file or a photograph of the signed paper, 10 MB at most), an old one
// taken off by someone who writes Purchase. The two months' warning itself is the notify job's (engine/notificationPlan.ts).

const ACCEPT = ".pdf,.docx,.doc,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const kb = (n: number): string => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function SupplierAgreementCard({ recordId, data, editable }: { recordId: string; data: LogSheetData; editable: boolean }) {
  const [files, setFiles] = useState<SupplierAgreementFile[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "info" | "error"; text: string } | null>(null);

  const validUpto = String(data.header?.agreementValidUpto ?? "").trim();
  const dated = /^\d{4}-\d{2}-\d{2}$/.test(validUpto);
  const today = todayISO();
  const left = dated ? daysBetween(today, validUpto) : null;
  const warned = dated && today >= monthsBefore(validUpto, EXPIRY_WARNING_MONTHS);

  const load = async () => {
    try {
      setFiles((await agreementsApi.list(recordId)).files);
    } catch (err) {
      setFiles([]);
      setMessage({ tone: "error", text: err instanceof ApiError ? err.message : "The agreements on this record could not be read just now." });
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId]);

  const upload = async () => {
    if (!file || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const { file: kept } = await agreementsApi.upload(recordId, file, note);
      setFile(null);
      setNote("");
      setMessage({ tone: "ok", text: `${kept.name} is on the record. Now write the date the new agreement is valid upto in SERVICE AGREEMENT / CERTIFICATE VALID UPTO below, so the next reminder comes two months before that.` });
      await load();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof ApiError ? err.message : "The file could not be uploaded — try again." });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (f: SupplierAgreementFile) => {
    setBusy(true);
    try {
      await agreementsApi.remove(recordId, f.id);
      setMessage({ tone: "info", text: `${f.name} was taken off the record.` });
      await load();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof ApiError ? err.message : "The file could not be removed — try again." });
    } finally {
      setRemoving(null);
      setBusy(false);
    }
  };

  const validity = !dated ? (
    <span className="text-muted">
      No valid-upto date yet: write it in <strong>SERVICE AGREEMENT / CERTIFICATE VALID UPTO</strong> below, and DCRS tells the people who answer for this form {EXPIRY_WARNING_MONTHS} months before it runs out.
    </span>
  ) : left! < 0 ? (
    <span style={{ color: "var(--color-danger)" }}>
      <FiAlertTriangle size={13} style={{ verticalAlign: -2 }} /> Ran out on {formatDisplayDate(validUpto)}, {-left!} {-left! === 1 ? "day" : "days"} ago. Renew it, upload the new agreement and write its new date.
    </span>
  ) : warned ? (
    <span style={{ color: "var(--color-warning)" }}>
      <FiAlertTriangle size={13} style={{ verticalAlign: -2 }} /> Valid upto {formatDisplayDate(validUpto)}: {left} {left === 1 ? "day" : "days"} left. Renew it before then and upload the new agreement.
    </span>
  ) : (
    <span>
      <FiCheckCircle size={13} style={{ verticalAlign: -2, color: "var(--color-success)" }} /> Valid upto {formatDisplayDate(validUpto)}: {left} days left. A reminder comes {EXPIRY_WARNING_MONTHS} months before.
    </span>
  );

  return (
    <div className="card mb-4 no-print" data-section="supplier-agreement" data-validity={!dated ? "none" : left! < 0 ? "expired" : warned ? "expiring" : "valid"}>
      <div className="card-pad">
        <div className="text-sm font-semibold mb-1">
          <FiFileText size={13} style={{ verticalAlign: -2 }} /> Service agreement / certificate on file
        </div>
        <div className="text-sm" data-state="agreement-validity">
          {validity}
        </div>

        {files === null ? (
          <div className="text-xs text-muted mt-2">Reading the agreements on this record…</div>
        ) : files.length === 0 ? (
          <div className="text-xs text-muted mt-2">No agreement file on this record yet.</div>
        ) : (
          <ul className="text-sm mt-2" data-list="agreement-files" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {files.map((f, i) => (
              <li key={f.id} className="flex gap-2 wrap items-center" data-file={f.id} style={{ padding: "3px 0" }}>
                <a href={agreementsApi.fileUrl(recordId, f.id)} target="_blank" rel="noopener" data-action="agreement-open">
                  {f.name}
                </a>
                <span className="text-xs text-muted">
                  {kb(f.size)} · {f.uploadedBy}, {formatDisplayDate(f.uploadedAt.slice(0, 10))}
                  {f.note ? ` · ${f.note}` : ""}
                  {i === 0 && files.length > 1 ? " · the latest" : ""}
                </span>
                {editable &&
                  (removing === f.id ? (
                    <>
                      <button className="btn btn-danger btn-sm" data-action="agreement-remove-sure" disabled={busy} onClick={() => void remove(f)}>
                        Yes, take it off
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setRemoving(null)}>
                        No
                      </button>
                    </>
                  ) : (
                    <button className="btn btn-ghost btn-sm btn-icon" data-action="agreement-remove" title="Take this file off the record" disabled={busy} onClick={() => setRemoving(f.id)}>
                      <FiTrash2 size={13} />
                    </button>
                  ))}
              </li>
            ))}
          </ul>
        )}

        {editable && (
          <div className="mt-2">
            <div className="flex gap-2 wrap items-center">
              <input
                type="file"
                className="input input-sm"
                style={{ maxWidth: 320 }}
                data-field="agreement-file"
                accept={ACCEPT}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setMessage(null);
                }}
              />
              <input className="input input-sm" style={{ maxWidth: 260 }} data-field="agreement-note" placeholder="A note (optional): signed on, period…" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn btn-primary btn-sm" data-action="agreement-upload" disabled={!file || busy} onClick={() => void upload()}>
                <FiUpload size={12} /> {busy ? "Uploading…" : files && files.length > 0 ? "Upload the new agreement" : "Upload the agreement"}
              </button>
            </div>
            <div className="text-xs text-muted mt-1">A PDF, a Word file or a photograph of the signed paper, up to 10 MB. The old agreement stays on the record under the new one.</div>
          </div>
        )}

        {message && (
          <div className="text-sm mt-2" data-state="agreement-result" data-result={message.tone}>
            {message.tone === "ok" ? <FiCheckCircle size={13} style={{ verticalAlign: -2, color: "var(--color-success)" }} /> : <FiInfo size={13} style={{ verticalAlign: -2 }} />} {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
