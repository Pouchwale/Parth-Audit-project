import React, { useRef, useState } from "react";
import { FiCamera, FiX } from "react-icons/fi";
import type { ComplaintAckData, ComplaintAckPhoto, DocumentDefinition, RecordInstance } from "../../types";
import { recordRepository } from "../../data/repositories/recordRepository";
import {
  CAF_COMPANY_LINE_1,
  CAF_COMPANY_LINE_2,
  CAF_COMPLAINT_SUB_TYPES,
  CAF_COMPLAINT_TYPES,
  CAF_DOC_ID,
  CAF_FORMAT_REF,
  CAF_MAX_PHOTOS,
  CAF_TITLE,
} from "../../data/seed/complaintAck";
import { imageFileToDataUrl } from "../../utils/image";
import { generateId } from "../../utils/id";
import { FormField as Field } from "./FormField";
import { FG_CODE_EXAMPLE, fgCodeRule } from "../../engine/documentFormats";

// The FG code on this report reads like FGSL3877 (engine/documentFormats.ts).
const FG_RULE = fgCodeRule("FG code");

// CAPA — Internal: Complaint Acknowledgement Report, QA-CAF-00 (22.03.26),
// laid out as the company's two-page form: page 1 the logo, title, date, "To",
// subject, the complaint table, the scenario with photographs and the root
// cause; page 2 the corrective and preventive action, the employee's
// acknowledgement, signature, name and date — each page with the form's footer.
// Every value is editable while the record is a draft (it saves itself — see
// RecordPage); once submitted or verified it is locked, and Edit reopens it.
// A draft shows input boxes on screen; the printout, and a locked record, show
// each value as plain text the way the paper reads, so nothing is cut off.

function Logo() {
  return (
    // The company's printed mark reads as issued in either language (REQUIREMENTS §58).
    <div className="caf-logo notranslate" translate="no" aria-label="Gujarat Print Pack Publications Pvt. Ltd.">
      <div className="l1">{CAF_COMPANY_LINE_1}</div>
      <div className="l2">{CAF_COMPANY_LINE_2}</div>
    </div>
  );
}

function Footer({ page }: { page: number }) {
  return (
    <div className="caf-footer">
      <span className="ref notranslate" translate="no">
        {CAF_FORMAT_REF}
      </span>
      <span className="page-no">{page}</span>
    </div>
  );
}

export function ComplaintAckRecordView({
  record,
  editable,
  onChange,
}: {
  doc: DocumentDefinition;
  record: RecordInstance<ComplaintAckData>;
  editable: boolean;
  onChange: (data: ComplaintAckData) => void;
}) {
  const data = record.data;
  // The latest values, for the photo reader, which finishes after the render it began in.
  const latest = useRef(data);
  latest.current = data;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [photoProblem, setPhotoProblem] = useState<string | null>(null);

  const set = (patch: Partial<ComplaintAckData>) => onChange({ ...latest.current, ...patch });

  // Suggestions for the two type columns: the specimen's wording, then what earlier reports used.
  const earlier = recordRepository.query({ documentId: CAF_DOC_ID }) as RecordInstance<ComplaintAckData>[];
  const options = (base: string[], pick: (d: ComplaintAckData) => string) =>
    Array.from(new Set([...base, ...earlier.map((r) => (pick(r.data) ?? "").trim()).filter(Boolean)]));
  const typeOptions = options(CAF_COMPLAINT_TYPES, (d) => d.complaintType);
  const subTypeOptions = options(CAF_COMPLAINT_SUB_TYPES, (d) => d.complaintSubType);

  const addPhotos = async (files: FileList | null) => {
    const picked = Array.from(files ?? []);
    if (fileRef.current) fileRef.current.value = "";
    if (picked.length === 0) return;
    const room = CAF_MAX_PHOTOS - latest.current.photos.length;
    if (room <= 0) {
      setPhotoProblem(`A report holds up to ${CAF_MAX_PHOTOS} photos — remove one to add another.`);
      return;
    }
    setBusy(true);
    setPhotoProblem(null);
    const added: ComplaintAckPhoto[] = [];
    const failed: string[] = [];
    for (const file of picked.slice(0, room)) {
      try {
        added.push({ id: generateId("photo"), name: file.name, dataUrl: await imageFileToDataUrl(file) });
      } catch {
        failed.push(file.name);
      }
    }
    setBusy(false);
    const notes: string[] = [];
    if (picked.length > room) notes.push(`Only ${room} more photo${room === 1 ? "" : "s"} fit on a report (up to ${CAF_MAX_PHOTOS}).`);
    if (failed.length) notes.push(`${failed.join(", ")} couldn't be read as a photo — use a JPG or PNG.`);
    setPhotoProblem(notes.length ? notes.join(" ") : null);
    if (added.length) set({ photos: [...latest.current.photos, ...added] });
  };
  const removePhoto = (id: string) => set({ photos: latest.current.photos.filter((p) => p.id !== id) });

  const f = (key: keyof ComplaintAckData) => ({
    field: key,
    value: String(data[key] ?? ""),
    editable,
    onChange: (v: string) => set({ [key]: v } as Partial<ComplaintAckData>),
  });

  return (
    <div className="caf-sheet" data-doc="complaint-ack">
      <section className="caf-page">
        <Logo />
        <div className="caf-title">{CAF_TITLE}</div>
        <div className="caf-row">
          <strong>Date:</strong> <Field {...f("reportDate")} kind="date" />
        </div>
        <div className="caf-row">
          <strong>To,</strong>
        </div>
        <div className="caf-row">
          {editable && (
            <>
              <input className="input caf-input caf-screen-only" data-field="toName" placeholder="Name" value={data.toName} onChange={(e) => set({ toName: e.target.value })} />
              <input
                className="input caf-input caf-screen-only"
                data-field="toDesignation"
                placeholder="Designation"
                value={data.toDesignation}
                onChange={(e) => set({ toDesignation: e.target.value })}
              />
            </>
          )}
          <span className={`caf-value notranslate${editable ? " caf-print-only" : ""}`} translate="no">
            {data.toName}
            {data.toDesignation ? ` (${data.toDesignation})` : ""}
          </span>
        </div>
        <hr className="caf-rule" />
        <div className="caf-row">
          <strong>Subject:</strong> <Field {...f("subject")} />
        </div>
        <hr className="caf-rule" />
        <div className="caf-text">
          <Field {...f("intro")} kind="long" translatable />
        </div>

        <table className="caf-table">
          <thead>
            <tr>
              <th>Customer Name</th>
              <th>FG code</th>
              <th>Complaint received on</th>
              <th>Job name</th>
              <th>Com. Type</th>
              <th>Comp. sub type</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <Field {...f("customerName")} kind="long" />
              </td>
              <td>
                <Field {...f("fgCode")} placeholder={FG_CODE_EXAMPLE} normalise={FG_RULE.normalise} problem={FG_RULE.problem} />
              </td>
              <td>
                <Field {...f("complaintReceivedOn")} kind="date" />
              </td>
              <td>
                <Field {...f("jobName")} kind="long" />
              </td>
              <td>
                <Field {...f("complaintType")} list="caf-types" />
              </td>
              <td>
                <Field {...f("complaintSubType")} list="caf-subtypes" />
              </td>
            </tr>
          </tbody>
        </table>

        <div className="caf-section">
          <span className="caf-label">Scenario:</span>
          <Field {...f("scenario")} kind="long" placeholder="What happened" />
        </div>

        <div className="caf-photos" data-section="caf-photos">
          {data.photos.map((p) => (
            <figure key={p.id} className="caf-photo">
              <img src={p.dataUrl} alt={p.name || "Complaint photograph"} />
              {editable && (
                <button className="btn btn-ghost btn-sm caf-photo-remove" title="Remove this photo" aria-label="Remove this photo" onClick={() => removePhoto(p.id)}>
                  <FiX size={14} />
                </button>
              )}
            </figure>
          ))}
          {editable && data.photos.length < CAF_MAX_PHOTOS && (
            <button type="button" className="caf-photo-add no-print" data-action="add-photo" disabled={busy} onClick={() => fileRef.current?.click()}>
              <FiCamera size={20} />
              <span>{busy ? "Adding…" : "Add photo"}</span>
              <span className="text-xs">up to {CAF_MAX_PHOTOS}</span>
            </button>
          )}
          {editable && <input ref={fileRef} type="file" accept="image/*" multiple hidden data-field="photo-upload" onChange={(e) => void addPhotos(e.target.files)} />}
        </div>
        {photoProblem && (
          <div className="text-sm text-danger no-print" role="alert">
            {photoProblem}
          </div>
        )}

        <div className="caf-section">
          <div className="caf-label">Root Cause :</div>
          <Field {...f("rootCause")} kind="long" roomy />
        </div>
        <Footer page={1} />
      </section>

      <section className="caf-page">
        <Logo />
        <div className="caf-section">
          <div className="caf-label">Corrective Action :</div>
          <Field {...f("correctiveAction")} kind="long" roomy />
        </div>
        <div className="caf-section">
          <div className="caf-label">Preventive Action :</div>
          <Field {...f("preventiveAction")} kind="long" roomy />
        </div>
        <hr className="caf-rule" />
        <div className="caf-text">
          <strong>Acknowledgement:</strong> <Field {...f("acknowledgement")} kind="long" translatable />
        </div>
        <hr className="caf-rule" />
        <div className="caf-row caf-sign">
          <strong>Employee Signature:</strong> <span className="caf-sign-line" />
        </div>
        <div className="caf-row">
          <strong>Name:</strong> <Field {...f("employeeName")} />
        </div>
        <div className="caf-row">
          <strong>Date:</strong> <Field {...f("employeeSignDate")} kind="date" />
        </div>
        <Footer page={2} />
      </section>

      <datalist id="caf-types">
        {typeOptions.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      <datalist id="caf-subtypes">
        {subTypeOptions.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </div>
  );
}
