import React, { useMemo, useRef, useState } from "react";
import { FiAlertTriangle, FiArrowRight, FiCheckCircle, FiClock, FiFileText, FiPaperclip } from "react-icons/fi";
import { useAppStore } from "../../store/AppStore";
import { useRouter } from "../../store/router";
import { Modal } from "../common/Modal";
import { agreementStatus, createAgreement, snoozeAgreementReminder, type AgreementStatus } from "../../engine/serviceAgreement";
import { recordRepository } from "../../data/repositories/recordRepository";
import { SA_MAX_SCANS, SA_TERM_YEARS } from "../../data/seed/serviceAgreement";
import { imageFileToDataUrl } from "../../utils/image";
import { generateId } from "../../utils/id";
import { formatDisplayDate } from "../../utils/date";
import type { RecordInstance, ServiceAgreementData, ServiceAgreementScan } from "../../types";

// THE TWO-YEARLY AGREEMENT REMINDER, on the Service Provider page (the
// department asked for it there, 12-Sep-2026). It puts the question the moment
// the page opens — sixty days before the agreement runs out, and every time
// after that until there is one — and offers the two ways out of it: let the
// system draft the next agreement on the provider's letterhead, or upload the
// signed copy that already exists. "Remind me later" is a week, not for ever.
//
// The card below the pop-up says the same thing quietly, so the state of the
// agreement is on the page whether or not the pop-up is showing.

const MAX_PDF_BYTES = 2.5 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Unreadable file"));
    reader.readAsDataURL(file);
  });
}

function describe(status: AgreementStatus): { tone: "danger" | "warning" | "ok"; headline: string; detail: string } {
  if (status.state === "none")
    return {
      tone: "warning",
      headline: "No service provider agreement is on file",
      detail: `The agreement with the pest control service provider runs ${SA_TERM_YEARS} years. There isn't one here yet — the system can draft it on the provider's letterhead, or you can upload the signed copy you already have.`,
    };
  if (status.state === "expired")
    return {
      tone: "danger",
      headline: `The agreement ran out on ${formatDisplayDate(status.effectiveTo)}`,
      detail: `That was ${Math.abs(status.daysLeft ?? 0)} day(s) ago. Renew it for the next ${SA_TERM_YEARS} years — drafted for you on the provider's letterhead, or upload the signed copy.`,
    };
  if (status.state === "due")
    return {
      tone: "warning",
      headline: `The agreement runs out on ${formatDisplayDate(status.effectiveTo)}`,
      detail: `${status.daysLeft} day(s) left. Renew it for the next ${SA_TERM_YEARS} years — drafted for you on the provider's letterhead, or upload the signed copy.`,
    };
  return {
    tone: "ok",
    headline: `Agreement in force to ${formatDisplayDate(status.effectiveTo)}`,
    detail: `${status.daysLeft} day(s) to run. The system will ask again sixty days before it ends.`,
  };
}

export function ServiceAgreementReminder() {
  const { mode, bump, version } = useAppStore();
  const { navigate } = useRouter();
  const isDemo = mode === "demo";
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const status = useMemo(() => agreementStatus(isDemo), [isDemo, version]);
  const [dismissed, setDismissed] = useState(false);
  const said = describe(status);

  const openAgreement = (record: RecordInstance<ServiceAgreementData>) => {
    bump();
    navigate(`/record/${record.id}`);
  };

  const generate = () => {
    setDismissed(true);
    openAgreement(createAgreement(isDemo));
  };

  const upload = async (files: FileList | null) => {
    const picked = Array.from(files ?? []).slice(0, SA_MAX_SCANS);
    if (fileRef.current) fileRef.current.value = "";
    if (picked.length === 0) return;
    setBusy(true);
    setProblem(null);
    const scans: ServiceAgreementScan[] = [];
    const failed: string[] = [];
    for (const file of picked) {
      try {
        if (file.type === "application/pdf") {
          if (file.size > MAX_PDF_BYTES) {
            failed.push(`${file.name} (over 2.5 MB — scan it smaller, or add the pages as photos)`);
            continue;
          }
          scans.push({ id: generateId("scan"), name: file.name, kind: "pdf", dataUrl: await readAsDataUrl(file), addedAt: new Date().toISOString() });
        } else {
          scans.push({ id: generateId("scan"), name: file.name, kind: "image", dataUrl: await imageFileToDataUrl(file), addedAt: new Date().toISOString() });
        }
      } catch {
        failed.push(file.name);
      }
    }
    setBusy(false);
    if (scans.length === 0) {
      setProblem(`Couldn't be read: ${failed.join(", ")}. Use a JPG, PNG or PDF.`);
      return;
    }
    // The agreement the signed copy belongs to, with its pages attached.
    const record = createAgreement(isDemo, { origin: "uploaded" });
    const withScans = { ...record, data: { ...record.data, scans } };
    recordRepository.upsert(withScans as RecordInstance);
    setDismissed(true);
    openAgreement(withScans);
  };

  const later = () => {
    snoozeAgreementReminder();
    setDismissed(true);
    bump();
  };

  // One file input for the whole component — the pop-up and the card below it
  // are on screen at the same time, and two hidden inputs of the same name
  // would be one too many for anything trying to find it.
  const uploadButton = (action: string, small = false) => (
    <button className={`btn btn-secondary${small ? " btn-sm" : ""}`} data-action={action} disabled={busy} onClick={() => fileRef.current?.click()}>
      <FiPaperclip size={small ? 13 : 14} /> {busy ? "Reading…" : "Upload the signed agreement"}
    </button>
  );

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden data-field="agreement-upload-now" onChange={(e) => void upload(e.target.files)} />
      {status.remind && !dismissed && (
        <Modal
          title="Service provider agreement"
          onClose={later}
          footer={
            <div className="flex justify-end gap-2 w-full items-center wrap">
              <button className="btn btn-ghost" data-action="agreement-later" style={{ marginRight: "auto" }} onClick={later}>
                Remind me later
              </button>
              {uploadButton("upload-agreement-now")}
              <button className="btn btn-primary" data-action="generate-agreement" onClick={generate}>
                <FiFileText size={14} /> Draft it for me
              </button>
            </div>
          }
        >
          <div data-section="agreement-reminder">
            <p className="text-sm mb-2">
              <strong>{said.headline}.</strong>
            </p>
            <p className="text-sm mb-3">{said.detail}</p>
            <ul className="text-sm text-muted" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
              <li>
                <strong>Draft it for me</strong> — the agreement is written out on the provider's own letterhead for the next {SA_TERM_YEARS} years, with the services,
                their frequencies and the licence number already filled in from what this system holds. Anything nobody has told the system (the charges, the payment
                terms) is left as TO BE CONFIRMED for the two of you to complete.
              </li>
              <li>
                <strong>Upload the signed agreement</strong> — the scan, photographs of the pages, or the PDF. It goes on file as the agreement itself.
              </li>
            </ul>
            {problem && (
              <div className="text-sm text-danger mt-2" role="alert">
                {problem}
              </div>
            )}
          </div>
        </Modal>
      )}

      <div className={`card mb-4 no-print agreement-card ${said.tone}`} data-section="agreement-status">
        <div className="card-pad">
          <div className="flex items-center justify-between gap-3 wrap">
            <div>
              <div className="text-base font-semibold">
                {said.tone === "ok" ? <FiCheckCircle size={14} style={{ verticalAlign: -2 }} /> : said.tone === "danger" ? <FiAlertTriangle size={14} style={{ verticalAlign: -2 }} /> : <FiClock size={14} style={{ verticalAlign: -2 }} />}{" "}
                Service provider agreement — {said.headline}
              </div>
              <div className="text-sm text-muted mt-1">{said.detail}</div>
              {status.record && (
                <div className="text-xs text-faint mt-1">
                  {status.record.data.origin === "uploaded" ? "Signed copy on file" : "Drafted on the provider's letterhead"} ·{" "}
                  {status.record.data.scans.length > 0 ? `${status.record.data.scans.length} scanned page(s)` : "no scan attached"} · {status.record.status}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 wrap">
              {status.record && (
                <button className="btn btn-secondary btn-sm" data-action="open-agreement" onClick={() => openAgreement(status.record!)}>
                  Open the agreement <FiArrowRight size={12} />
                </button>
              )}
              {status.state !== "current" && (
                <>
                  {uploadButton("upload-agreement-card", true)}
                  <button className="btn btn-primary btn-sm" data-action="generate-agreement-card" onClick={generate}>
                    <FiFileText size={13} /> Draft it for me
                  </button>
                </>
              )}
            </div>
          </div>
          {problem && !status.remind && (
            <div className="text-sm text-danger mt-2" role="alert">
              {problem}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
