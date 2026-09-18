import React, { useRef, useState } from "react";
import { FiPaperclip, FiPlus, FiTrash2, FiFileText } from "react-icons/fi";
import type { DocumentDefinition, RecordInstance, ResponsibilitySignatory, ServiceAgreementData, ServiceAgreementParty, ServiceAgreementScan } from "../../types";
import { SA_MAX_SCANS, SA_TITLE } from "../../data/seed/serviceAgreement";
import { ProviderLetterhead } from "../documents/ProviderLetterhead";
import { imageFileToDataUrl } from "../../utils/image";
import { generateId } from "../../utils/id";
import { FormField } from "./FormField";

// PEST CONTROL SERVICE AGREEMENT, laid out on the service provider's own
// letterhead exactly as "Letter head.pdf" prints it — the GPC mark, the name,
// the address, the telephone numbers, the email and the website — then the
// term, the two parties, the scope of services, the schedule, the obligations,
// the commercial terms and the signatures of both parties.
//
// Two ways to hold one, both the user's choice (engine/serviceAgreement.ts):
// the system drafts it in this format, or the signed copy is uploaded — the
// pages of a scan, a photograph of it, or the PDF. Where a signed copy is
// held, it is shown first, because that is the document; the typed format
// below it is then the readable version, the same way the licence page works.
//
// Every line is editable — by hand or by asking the assistant — and a point can
// be added or removed. A signed-off agreement is corrected through Edit.

function ClauseList({
  items,
  marker,
  editable,
  field,
  onChange,
}: {
  items: string[];
  marker: (i: number) => string;
  editable: boolean;
  field: string;
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="pr-list" data-list={field}>
      {items.map((text, i) => (
        <div key={i} className="pr-item">
          <span className="pr-marker">{marker(i)}</span>
          <div className="pr-item-text">
            {/* A printed clause is the paper's own wording (REQUIREMENTS §58). */}
            <FormField field={`${field}-${i + 1}`} kind="long" translatable value={text} editable={editable} onChange={(v) => onChange(items.map((x, xi) => (xi === i ? v : x)))} />
          </div>
          {editable && (
            <button className="btn btn-ghost btn-sm btn-icon no-print" title="Remove this point" aria-label="Remove this point" onClick={() => onChange(items.filter((_, xi) => xi !== i))}>
              <FiTrash2 size={13} />
            </button>
          )}
        </div>
      ))}
      {editable && (
        <button className="btn btn-secondary btn-sm mt-1 no-print" data-action={`add-${field}`} onClick={() => onChange([...items, ""])}>
          <FiPlus size={12} /> Add point
        </button>
      )}
    </div>
  );
}

function PartyBlock({
  party,
  label,
  field,
  editable,
  onChange,
}: {
  party: ServiceAgreementParty;
  label: string;
  field: string;
  editable: boolean;
  onChange: (next: ServiceAgreementParty) => void;
}) {
  const set = (patch: Partial<ServiceAgreementParty>) => onChange({ ...party, ...patch });
  return (
    <td className="pr-signatory">
      <div className="pr-sign-role">{label}</div>
      <FormField field={`${field}-organisation`} kind="long" value={party.organisation} editable={editable} onChange={(v) => set({ organisation: v })} />
      <FormField field={`${field}-address`} kind="long" value={party.addressLines.join(", ")} editable={editable} onChange={(v) => set({ addressLines: [v] })} />
      <div className="caf-row">
        <strong>Contact:</strong> <FormField field={`${field}-contact`} value={party.contactName} editable={editable} onChange={(v) => set({ contactName: v })} />
      </div>
      <div className="caf-row">
        <strong>Designation:</strong> <FormField field={`${field}-designation`} value={party.designation} editable={editable} onChange={(v) => set({ designation: v })} />
      </div>
      <div className="caf-row">
        <strong>Phone:</strong> <FormField field={`${field}-phone`} value={party.phone} editable={editable} onChange={(v) => set({ phone: v })} />
      </div>
      <div className="caf-row">
        <strong>Email:</strong> <FormField field={`${field}-email`} value={party.email} editable={editable} onChange={(v) => set({ email: v })} />
      </div>
    </td>
  );
}

function SignatoryCell({
  who,
  label,
  field,
  editable,
  onChange,
}: {
  who: ResponsibilitySignatory;
  label: string;
  field: string;
  editable: boolean;
  onChange: (next: ResponsibilitySignatory) => void;
}) {
  const set = (patch: Partial<ResponsibilitySignatory>) => onChange({ ...who, ...patch });
  return (
    <td className="pr-signatory">
      <div className="pr-sign-role">{label}</div>
      <FormField field={`${field}-organisation`} kind="long" value={who.organisation} editable={editable} onChange={(v) => set({ organisation: v })} />
      <div className="caf-row">
        <strong>Name:</strong> <FormField field={`${field}-name`} value={who.name} editable={editable} onChange={(v) => set({ name: v })} />
      </div>
      <div className="caf-row">
        <strong>Designation:</strong> <FormField field={`${field}-designation`} value={who.designation} editable={editable} onChange={(v) => set({ designation: v })} />
      </div>
      <div className="caf-row">
        <strong>Dated:</strong> <FormField field={`${field}-dated`} kind="date" value={who.dated} editable={editable} onChange={(v) => set({ dated: v })} />
      </div>
      <div className="caf-row">
        <strong>Sign &amp; Stamp:</strong> <span className="caf-sign-line" />
      </div>
    </td>
  );
}

export function ServiceAgreementRecordView({
  record,
  editable,
  onChange,
}: {
  doc: DocumentDefinition;
  record: RecordInstance<ServiceAgreementData>;
  editable: boolean;
  onChange: (data: ServiceAgreementData) => void;
}) {
  const data = record.data;
  // The latest values, for the file reader, which finishes after the render it began in.
  const latest = useRef(data);
  latest.current = data;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const set = (patch: Partial<ServiceAgreementData>) => onChange({ ...latest.current, ...patch });

  // A PDF is held as it is (nothing can scale it down), so it has to be a
  // sensible size — the whole system lives in about 5 MB of browser storage.
  const MAX_PDF_BYTES = 2.5 * 1024 * 1024;

  const readPdf = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Unreadable file"));
      reader.readAsDataURL(file);
    });

  const addFiles = async (files: FileList | null) => {
    const picked = Array.from(files ?? []);
    if (fileRef.current) fileRef.current.value = "";
    if (picked.length === 0) return;
    const room = SA_MAX_SCANS - latest.current.scans.length;
    if (room <= 0) {
      setProblem(`An agreement holds up to ${SA_MAX_SCANS} pages — remove one to add another.`);
      return;
    }
    setBusy(true);
    setProblem(null);
    const added: ServiceAgreementScan[] = [];
    const failed: string[] = [];
    for (const file of picked.slice(0, room)) {
      try {
        if (file.type === "application/pdf") {
          if (file.size > MAX_PDF_BYTES) {
            failed.push(`${file.name} (over 2.5 MB — scan it smaller, or add the pages as photos)`);
            continue;
          }
          added.push({ id: generateId("scan"), name: file.name, kind: "pdf", dataUrl: await readPdf(file), addedAt: new Date().toISOString() });
        } else {
          added.push({ id: generateId("scan"), name: file.name, kind: "image", dataUrl: await imageFileToDataUrl(file), addedAt: new Date().toISOString() });
        }
      } catch {
        failed.push(file.name);
      }
    }
    setBusy(false);
    const notes: string[] = [];
    if (picked.length > room) notes.push(`Only ${room} more page${room === 1 ? "" : "s"} fit on an agreement (up to ${SA_MAX_SCANS}).`);
    if (failed.length) notes.push(`Couldn't be read: ${failed.join(", ")}. Use a JPG, PNG or PDF.`);
    setProblem(notes.length ? notes.join(" ") : null);
    if (added.length) set({ scans: [...latest.current.scans, ...added], origin: "uploaded" });
  };

  const removeScan = (id: string) => set({ scans: latest.current.scans.filter((s) => s.id !== id) });

  const f = (key: "agreementNo" | "effectiveFrom" | "effectiveTo" | "providerLicenceNo") => ({
    field: key,
    value: String(data[key] ?? ""),
    editable,
    onChange: (v: string) => set({ [key]: v } as Partial<ServiceAgreementData>),
  });

  return (
    <div className="caf-sheet sa-sheet" data-doc="service-agreement">
      {/* The signed copy, where there is one: that IS the agreement. */}
      {(data.scans.length > 0 || editable) && (
        <section className="sa-scans" data-section="agreement-scans">
          <div className="sa-scans-head no-print">
            <strong>Signed copy on file</strong>
            <span className="text-xs text-muted">
              {data.scans.length === 0 ? "None yet — upload the signed agreement, or use the format below." : `${data.scans.length} of ${SA_MAX_SCANS} pages`}
            </span>
          </div>
          {data.scans.map((s) => (
            <figure key={s.id} className="sa-scan">
              {s.kind === "image" ? (
                <img src={s.dataUrl} alt={s.name || "Signed agreement"} />
              ) : (
                <a className="sa-pdf" href={s.dataUrl} target="_blank" rel="noopener noreferrer">
                  <FiFileText size={18} /> {s.name || "Signed agreement (PDF)"}
                </a>
              )}
              <figcaption className="text-xs text-muted">
                {s.name}
                {editable && (
                  <button className="btn btn-ghost btn-sm no-print" title="Remove this page" aria-label="Remove this page" onClick={() => removeScan(s.id)}>
                    <FiTrash2 size={13} />
                  </button>
                )}
              </figcaption>
            </figure>
          ))}
          {editable && data.scans.length < SA_MAX_SCANS && (
            <>
              <button type="button" className="btn btn-secondary btn-sm no-print" data-action="upload-agreement" disabled={busy} onClick={() => fileRef.current?.click()}>
                <FiPaperclip size={13} /> {busy ? "Adding…" : "Upload the signed agreement"}
              </button>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden data-field="agreement-upload" onChange={(e) => void addFiles(e.target.files)} />
            </>
          )}
          {problem && (
            <div className="text-sm text-danger no-print" role="alert">
              {problem}
            </div>
          )}
        </section>
      )}

      <section className="caf-page">
        <ProviderLetterhead />
        <div className="caf-title">{SA_TITLE}</div>

        <div className="caf-row">
          <strong>Agreement No.:</strong> <FormField {...f("agreementNo")} />
        </div>
        <div className="caf-row">
          <strong>Term:</strong> <FormField {...f("effectiveFrom")} kind="date" /> <span className="sa-to">to</span> <FormField {...f("effectiveTo")} kind="date" />
          <span className="text-xs text-muted sa-term-note no-print"> (two years — the system asks for the renewal sixty days before it ends)</span>
        </div>
        <div className="caf-row">
          <strong>Service provider's insecticide licence:</strong> <FormField {...f("providerLicenceNo")} />
        </div>

        <table className="caf-table sa-parties">
          <tbody>
            <tr>
              <PartyBlock party={data.client} label="Client" field="client" editable={editable} onChange={(v) => set({ client: v })} />
              <PartyBlock party={data.provider} label="Service provider" field="provider" editable={editable} onChange={(v) => set({ provider: v })} />
            </tr>
          </tbody>
        </table>

        <div className="caf-section">
          <div className="caf-label">1. Scope of services</div>
          <ClauseList items={data.scopeOfServices} marker={(i) => `1.${i + 1}`} editable={editable} field="scope" onChange={(next) => set({ scopeOfServices: next })} />
        </div>

        <div className="caf-section">
          <div className="caf-label">2. Schedule and reporting</div>
          <ClauseList items={data.serviceSchedule} marker={(i) => `2.${i + 1}`} editable={editable} field="schedule" onChange={(next) => set({ serviceSchedule: next })} />
        </div>
      </section>

      <section className="caf-page">
        <ProviderLetterhead />
        <div className="caf-section">
          <div className="caf-label">3. Obligations of the parties</div>
          <ClauseList items={data.obligations} marker={(i) => `3.${i + 1}`} editable={editable} field="obligations" onChange={(next) => set({ obligations: next })} />
        </div>

        <div className="caf-section">
          <div className="caf-label">4. Commercial terms</div>
          <ClauseList items={data.commercialTerms} marker={(i) => `4.${i + 1}`} editable={editable} field="commercial" onChange={(next) => set({ commercialTerms: next })} />
        </div>

        <div className="caf-section">
          <div className="caf-label">5. General</div>
          <ClauseList items={data.generalTerms} marker={(i) => `5.${i + 1}`} editable={editable} field="general" onChange={(next) => set({ generalTerms: next })} />
        </div>

        <table className="caf-table pr-signatories mt-3">
          <tbody>
            <tr>
              <SignatoryCell who={data.clientSignatory} label="For the client" field="client-sign" editable={editable} onChange={(v) => set({ clientSignatory: v })} />
              <SignatoryCell who={data.providerSignatory} label="For the service provider" field="provider-sign" editable={editable} onChange={(v) => set({ providerSignatory: v })} />
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
