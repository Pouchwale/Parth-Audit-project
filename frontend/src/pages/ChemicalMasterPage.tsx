import React, { useState } from "react";
import type { ServiceTypeChemical } from "../types";
import { documentRepository } from "../data/repositories/documentRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { DocumentHeader } from "../components/documents/DocumentHeader";
import { ReferenceEditBar } from "../components/documents/ReferenceEditBar";
import { useAppStore } from "../store/AppStore";
import { printDocument } from "../utils/print";

export function ChemicalMasterPage() {
  const { bump } = useAppStore();
  const doc = documentRepository.getById("chemical-master")!;
  // The chart being corrected, while Edit is on; null otherwise. Its rows are
  // master data, so a correction is saved there (masterRepository).
  const [draft, setDraft] = useState<ServiceTypeChemical[] | null>(null);
  const editing = draft !== null;
  const rows = draft ?? masterRepository.get().serviceTypeChemicals;

  const setRow = (i: number, patch: Partial<ServiceTypeChemical>) => setDraft(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const save = () => {
    if (draft) masterRepository.update({ serviceTypeChemicals: draft.map((r) => ({ ...r, chemicals: r.chemicals.map((c) => c.trim()).filter(Boolean) })) });
    setDraft(null);
    bump();
  };

  return (
    <div data-print-doc>
      <div className="mb-3 no-print">
        <ReferenceEditBar
          editing={editing}
          onEdit={() => setDraft(masterRepository.get().serviceTypeChemicals)}
          onSave={save}
          onCancel={() => setDraft(null)}
          onPrint={() => printDocument()}
        />
      </div>
      <DocumentHeader doc={doc} dateLabel="Reference" />
      <p className="text-muted mt-3 mb-4 no-print">
        {editing
          ? "Editing — correct any cell that is wrong, then Save. Chemicals: one per line."
          : "Source: Pesticide Application Chart. Selecting a Service Type in a Service Report auto-suggests the pest covered, chemicals and dilution ratio below — nothing here is invented; blank cells are marked TO BE CONFIRMED."}
      </p>
      <div className="doc-table mt-4">
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>Sr. No</th>
              <th>Services Name</th>
              <th>Pest Covered</th>
              <th>Chemicals to be Used</th>
              <th>Dilution Ratio</th>
            </tr>
          </thead>
          <tbody className="notranslate" translate="no">
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td>{i + 1}</td>
                {editing ? (
                  <>
                    <td>
                      <input className="input input-sm" data-field="chem-service" value={r.serviceName} onChange={(e) => setRow(i, { serviceName: e.target.value })} />
                    </td>
                    <td>
                      <textarea className="input" rows={2} value={r.pestCovered} onChange={(e) => setRow(i, { pestCovered: e.target.value })} />
                    </td>
                    <td>
                      <textarea className="input" rows={Math.max(2, r.chemicals.length)} value={r.chemicals.join("\n")} onChange={(e) => setRow(i, { chemicals: e.target.value.split("\n") })} />
                    </td>
                    <td>
                      <input className="input input-sm" value={r.dilutionRatio} onChange={(e) => setRow(i, { dilutionRatio: e.target.value })} />
                    </td>
                  </>
                ) : (
                  <>
                    <td className="font-semibold">{r.serviceName}</td>
                    <td>{r.pestCovered}</td>
                    <td>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {r.chemicals.map((c) => (
                          <li key={c} className="text-sm">
                            {c}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="text-sm">{r.dilutionRatio}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
