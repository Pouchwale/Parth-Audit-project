import React from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import type { DocumentDefinition, PestResponsibilitiesData, ResponsibilitySignatory, RecordInstance } from "../../types";
import { PR_LETTERHEAD } from "../../data/seed/pestResponsibilities";
import { FormField } from "./FormField";

// RESPONSIBILITIES OF PEST CONTROL — SITE & SERVICE PROVIDER, as the company's
// three letterhead pages read ("responsibilities of pest control report .pdf"):
//   Page 1 — Responsibilities of Site, the fourteen numbered points.
//   Page 2 — Responsibilities of Pest control service provider: equipment &
//            storage, the emergency call table, the yearly training note and
//            the lettered Environmental, Health & Safety clauses.
//   Page 3 — the further clauses (h to l) and the two signatories.
// Nothing here is filled in by the assistant: it is an agreement people write.
// Every line can be edited — by hand or by asking the assistant — and a line
// can be added or removed; a signed-off copy is corrected through Edit, like
// any other record.

function Letterhead() {
  return (
    <div className="pr-letterhead">
      <div className="caf-logo" aria-label="Gujarat Print Pack Publications Pvt. Ltd.">
        <div className="l1">GUJARAT PRINT PACK</div>
        <div className="l2">PUBLICATIONS PVT. LTD.</div>
      </div>
      <div className="pr-address">
        {PR_LETTERHEAD.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
    </div>
  );
}

function ListBlock({
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
            <FormField field={`${field}-${i + 1}`} kind="long" value={text} editable={editable} onChange={(v) => onChange(items.map((x, xi) => (xi === i ? v : x)))} />
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

function SignatoryCell({
  who,
  label,
  editable,
  onChange,
}: {
  who: ResponsibilitySignatory;
  label: string;
  editable: boolean;
  onChange: (next: ResponsibilitySignatory) => void;
}) {
  const set = (patch: Partial<ResponsibilitySignatory>) => onChange({ ...who, ...patch });
  return (
    <td className="pr-signatory">
      <div className="pr-sign-role">{label}</div>
      <FormField field={`${label}-organisation`} kind="long" value={who.organisation} editable={editable} onChange={(v) => set({ organisation: v })} />
      <div className="caf-row">
        <strong>Name:</strong> <FormField field={`${label}-name`} value={who.name} editable={editable} onChange={(v) => set({ name: v })} />
      </div>
      <div className="caf-row">
        <strong>Designation:</strong> <FormField field={`${label}-designation`} value={who.designation} editable={editable} onChange={(v) => set({ designation: v })} />
      </div>
      <div className="caf-row">
        <strong>Department:</strong> <FormField field={`${label}-department`} value={who.department} editable={editable} onChange={(v) => set({ department: v })} />
      </div>
      <div className="caf-row">
        <strong>Dated:</strong> <FormField field={`${label}-dated`} kind="date" value={who.dated} editable={editable} onChange={(v) => set({ dated: v })} />
      </div>
      <div className="caf-row">
        <strong>Sign &amp; Stamp:</strong> <span className="caf-sign-line" />
      </div>
    </td>
  );
}

export function PestResponsibilitiesRecordView({
  record,
  editable,
  onChange,
}: {
  doc: DocumentDefinition;
  record: RecordInstance<PestResponsibilitiesData>;
  editable: boolean;
  onChange: (data: PestResponsibilitiesData) => void;
}) {
  const data = record.data;
  const set = (patch: Partial<PestResponsibilitiesData>) => onChange({ ...data, ...patch });
  const setCall = (i: number, patch: Partial<PestResponsibilitiesData["emergencyCalls"][number]>) =>
    set({ emergencyCalls: data.emergencyCalls.map((c, ci) => (ci === i ? { ...c, ...patch } : c)) });

  return (
    <div className="caf-sheet pr-sheet notranslate" translate="no" data-doc="pest-responsibilities">
      <section className="caf-page">
        <Letterhead />
        <div className="caf-title pr-heading">Responsibilities of Site</div>
        <ListBlock items={data.siteResponsibilities} marker={(i) => `${i + 1}.`} editable={editable} field="site" onChange={(next) => set({ siteResponsibilities: next })} />
      </section>

      <section className="caf-page">
        <Letterhead />
        <div className="caf-title pr-heading">Responsibilities of Pest control service provider</div>
        <div className="pr-subheading">Equipment &amp; Storage Specifications:</div>
        <ListBlock items={data.equipmentStorage} marker={() => "•"} editable={editable} field="equipment" onChange={(next) => set({ equipmentStorage: next })} />

        <div className="pr-subheading mt-3">Emergency call procedures</div>
        <table className="caf-table pr-calls">
          <tbody>
            {data.emergencyCalls.map((c, i) => (
              <tr key={i}>
                <td>
                  <FormField field={`call-${i + 1}-issue`} value={c.issue} editable={editable} onChange={(v) => setCall(i, { issue: v })} />
                </td>
                <td>
                  <FormField field={`call-${i + 1}-name`} value={c.name} editable={editable} onChange={(v) => setCall(i, { name: v })} />
                </td>
                <td>
                  <FormField field={`call-${i + 1}-phone`} value={c.phone} editable={editable} onChange={(v) => setCall(i, { phone: v })} />
                </td>
                {editable && (
                  <td className="no-print" style={{ border: "none", width: 34 }}>
                    <button
                      className="btn btn-ghost btn-sm btn-icon"
                      title="Remove this contact"
                      aria-label="Remove this contact"
                      onClick={() => set({ emergencyCalls: data.emergencyCalls.filter((_, ci) => ci !== i) })}
                    >
                      <FiTrash2 size={13} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {editable && (
          <button className="btn btn-secondary btn-sm mt-1 no-print" data-action="add-call" onClick={() => set({ emergencyCalls: [...data.emergencyCalls, { issue: "", name: "", phone: "" }] })}>
            <FiPlus size={12} /> Add contact
          </button>
        )}

        <div className="pr-note mt-3">
          <FormField field="trainingNote" kind="long" value={data.trainingNote} editable={editable} onChange={(v) => set({ trainingNote: v })} />
        </div>

        <div className="pr-subheading mt-3">Environmental, Health &amp; Safety Clauses</div>
        <ListBlock
          items={data.ehsClauses}
          marker={(i) => `${String.fromCharCode(97 + (i % 26))})`}
          editable={editable}
          field="ehs"
          onChange={(next) => set({ ehsClauses: next })}
        />
      </section>

      <section className="caf-page">
        <Letterhead />
        <ListBlock
          items={data.serviceClauses}
          marker={(i) => `${String.fromCharCode(104 + (i % 22))}.`}
          editable={editable}
          field="clause"
          onChange={(next) => set({ serviceClauses: next })}
        />

        <table className="caf-table pr-signatures mt-4">
          <tbody>
            <tr>
              <SignatoryCell who={data.client} label="Client Representative" editable={editable} onChange={(next) => set({ client: next })} />
              <SignatoryCell who={data.provider} label="Pest control agency representative" editable={editable} onChange={(next) => set({ provider: next })} />
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
