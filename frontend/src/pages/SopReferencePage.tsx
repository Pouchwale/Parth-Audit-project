import React from "react";
import { FiPrinter } from "react-icons/fi";
import { documentRepository } from "../data/repositories/documentRepository";
import { DocumentHeader } from "../components/documents/DocumentHeader";
import { SOP_SECTIONS } from "../data/seed/sopContent";
import { useT } from "../i18n";
import { printDocument } from "../utils/print";

export function SopReferencePage() {
  const t = useT();
  const doc = documentRepository.getById("sop-reference")!;
  return (
    <div data-print-doc>
      <div className="flex justify-end mb-3 no-print">
        <button className="btn btn-secondary btn-sm" onClick={() => printDocument()}>
          <FiPrinter size={13} /> {t("common.print")}
        </button>
      </div>
      <DocumentHeader doc={doc} dateLabel="Reference" />
      <p className="text-muted mt-3 mb-4 no-print">
        Reference configuration derived from the Standard Operating Procedure. Used to configure checkpoints, chemicals
        and frequencies across the Pest Control module — not rewritten beyond formatting for on-screen display.
      </p>
      {/* The SOP's own wording, as issued — never machine-translated (i18n/googleTranslate.ts). */}
      <div className="notranslate mt-4" translate="no">
      {SOP_SECTIONS.map((s) => (
        <div key={s.title} className="card mb-4">
          <div className="card-header">
            <h3 className="text-base font-semibold">{s.title}</h3>
          </div>
          <div className="card-pad">
            <div className="mb-3">
              <div className="text-xs uppercase text-muted font-semibold mb-1">Chemicals to be Used</div>
              <p className="text-sm">{s.chemicals}</p>
            </div>
            <div className="mb-3">
              <div className="text-xs uppercase text-muted font-semibold mb-1">Process</div>
              <p className="text-sm">{s.process}</p>
            </div>
            <div className="mb-3">
              <div className="text-xs uppercase text-muted font-semibold mb-1">Pest Control Log Sheet</div>
              <p className="text-sm">{s.logSheet}</p>
            </div>
            <div className="mb-3">
              <div className="text-xs uppercase text-muted font-semibold mb-1">Preventive Measures</div>
              <p className="text-sm">{s.preventiveMeasures}</p>
            </div>
            <div>
              <div className="text-xs uppercase text-muted font-semibold mb-1">Frequency</div>
              <p className={`text-sm ${s.frequency.startsWith("TO BE CONFIRMED") ? "tbc" : ""}`}>{s.frequency}</p>
            </div>
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}
