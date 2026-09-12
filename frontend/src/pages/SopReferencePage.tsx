import React, { useState } from "react";
import { documentRepository } from "../data/repositories/documentRepository";
import { SOP_DOC_ID, referenceRepository, sopSections } from "../data/repositories/referenceRepository";
import type { SopSection } from "../data/seed/sopContent";
import { DocumentHeader } from "../components/documents/DocumentHeader";
import { ReferenceEditBar } from "../components/documents/ReferenceEditBar";
import { useAppStore } from "../store/AppStore";
import { useSetAssistantTarget } from "../store/AssistantContext";
import { printDocument } from "../utils/print";

const FIELDS: { key: Exclude<keyof SopSection, "title">; label: string }[] = [
  { key: "chemicals", label: "Chemicals to be Used" },
  { key: "process", label: "Process" },
  { key: "logSheet", label: "Pest Control Log Sheet" },
  { key: "preventiveMeasures", label: "Preventive Measures" },
  { key: "frequency", label: "Frequency" },
];

export function SopReferencePage() {
  const { currentUser, bump } = useAppStore();
  const doc = documentRepository.getById(SOP_DOC_ID)!;
  // The SOP being corrected, while Edit is on; null otherwise.
  const [draft, setDraft] = useState<SopSection[] | null>(null);
  const editing = draft !== null;
  const sections = draft ?? sopSections();
  const edited = referenceRepository.get<SopSection[]>(SOP_DOC_ID);

  const save = (next: SopSection[]) => {
    referenceRepository.save(SOP_DOC_ID, next, currentUser);
    setDraft(null);
    bump();
  };
  const setField = (i: number, key: keyof SopSection, value: string) => setDraft(sections.map((s, idx) => (idx === i ? { ...s, [key]: value } : s)));
  const restore = () => {
    referenceRepository.reset(SOP_DOC_ID);
    bump();
  };

  // The assistant can correct the SOP too — "change the frequency of rodent
  // control to monthly" — through the same checked-and-listed path as a record.
  useSetAssistantTarget({
    documentKind: "reference",
    documentId: SOP_DOC_ID,
    recordId: SOP_DOC_ID,
    status: "In Progress",
    editable: true,
    currentData: { sections },
    getData: () => ({ sections: sopSections() }),
    commit: (next) => {
      const proposed = (next as { sections?: SopSection[] }).sections;
      if (Array.isArray(proposed)) save(proposed);
    },
  });

  return (
    <div data-print-doc>
      <div className="mb-3 no-print">
        <ReferenceEditBar
          editing={editing}
          edited={edited}
          onEdit={() => setDraft(sopSections())}
          onSave={() => draft && save(draft)}
          onCancel={() => setDraft(null)}
          onRestore={restore}
          onPrint={() => printDocument()}
        />
      </div>
      <DocumentHeader doc={doc} dateLabel="Reference" />
      <p className="text-muted mt-3 mb-4 no-print">
        {editing
          ? "Editing — correct any wording that is wrong, then Save. The original transcription can be restored at any time."
          : "Reference configuration derived from the Standard Operating Procedure. Used to configure checkpoints, chemicals and frequencies across the Pest Control module — not rewritten beyond formatting for on-screen display. Edit it here, or ask the assistant to."}
      </p>
      {/* The SOP's own wording, as issued — never machine-translated (i18n/googleTranslate.ts). */}
      <div className="notranslate mt-4" translate="no">
        {sections.map((s, i) => (
          <div key={i} className="card mb-4">
            <div className="card-header">
              {editing ? (
                <input className="input" data-field="sop-title" value={s.title} onChange={(e) => setField(i, "title", e.target.value)} />
              ) : (
                <h3 className="text-base font-semibold">{s.title}</h3>
              )}
            </div>
            <div className="card-pad">
              {FIELDS.map((f, fi) => (
                <div key={f.key} className={fi < FIELDS.length - 1 ? "mb-3" : ""}>
                  <div className="text-xs uppercase text-muted font-semibold mb-1">{f.label}</div>
                  {editing ? (
                    <textarea className="input" data-field={`sop-${f.key}`} rows={f.key === "process" ? 4 : 2} value={s[f.key]} onChange={(e) => setField(i, f.key, e.target.value)} />
                  ) : (
                    <p className={`text-sm ${f.key === "frequency" && s.frequency.startsWith("TO BE CONFIRMED") ? "tbc" : ""}`}>{s[f.key]}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
