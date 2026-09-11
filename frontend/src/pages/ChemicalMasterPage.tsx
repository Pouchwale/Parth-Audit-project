import React from "react";
import { FiPrinter } from "react-icons/fi";
import { documentRepository } from "../data/repositories/documentRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { DocumentHeader } from "../components/documents/DocumentHeader";
import { useT } from "../i18n";
import { printDocument } from "../utils/print";

export function ChemicalMasterPage() {
  const t = useT();
  const doc = documentRepository.getById("chemical-master")!;
  const rows = masterRepository.get().serviceTypeChemicals;

  return (
    <div data-print-doc>
      <div className="flex justify-end mb-3 no-print">
        <button className="btn btn-secondary btn-sm" onClick={() => printDocument()}>
          <FiPrinter size={13} /> {t("common.print")}
        </button>
      </div>
      <DocumentHeader doc={doc} dateLabel="Reference" />
      <p className="text-muted mt-3 mb-4 no-print">
        Source: Pesticide Application Chart. Selecting a Service Type in a Service Report auto-suggests the pest
        covered, chemicals and dilution ratio below — nothing here is invented; blank cells are marked TO BE CONFIRMED.
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
