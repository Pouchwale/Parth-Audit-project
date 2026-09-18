import React from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import type { DocumentDefinition, RecordInstance, ServiceReportAreaLine, ServiceReportData } from "../../types";
import { COMPANY } from "../../data/seed/masterData";
import { fixedMaterialForServiceArea, isQuantityLine, normalizeServiceLines } from "../../engine/serviceMaterials";
import { formatDisplayDate } from "../../utils/date";

export function ServiceReportRecordView({
  doc,
  record,
  editable,
  countersignEditable = false,
  onChange,
}: {
  doc: DocumentDefinition;
  record: RecordInstance<ServiceReportData>;
  editable: boolean;
  // While the report waits for verification, the customer's representative
  // still countersigns it — and Verify requires that signature — so that one
  // field stays writable then (everything else is locked).
  countersignEditable?: boolean;
  onChange: (data: ServiceReportData) => void;
}) {
  const data = record.data;

  // Every change to the lines goes through the service's fixed rules
  // (engine/serviceMaterials.ts): material and method follow the area, and the
  // quantity follows the first line of its material.
  const setLines = (lines: ServiceReportAreaLine[]) => onChange({ ...data, lines: normalizeServiceLines(doc.variantKey, lines) });
  const updateLine = (slNo: number, patch: Partial<ServiceReportAreaLine>) => setLines(data.lines.map((l) => (l.slNo === slNo ? { ...l, ...patch } : l)));
  const addLine = () => {
    const nextNo = (data.lines.at(-1)?.slNo ?? 0) + 1;
    const fixed = fixedMaterialForServiceArea(doc.variantKey, "");
    setLines([...data.lines, { slNo: nextNo, areaName: "", materialName: fixed.materialName, qtyUsed: "", methodOfApplication: fixed.methodOfApplication, remarks: "" }]);
  };
  const removeLine = (slNo: number) => setLines(data.lines.filter((l) => l.slNo !== slNo));
  const linesWith = (material: string) => data.lines.filter((l) => l.materialName === material);

  return (
    <div>
      <div className="doc-header">
        <div className="company-name">Pest Control Service Report</div>
        <div className="meta-row">
          <div className="meta-cell" style={{ flex: 2 }}>
            <span className="k">Provider / Unit</span>
            {/* The provider, the plant and its address read as issued in either language (REQUIREMENTS §58). */}
            <span className="v notranslate" translate="no">
              {COMPANY.serviceProvider} — {COMPANY.name}
            </span>
            <div className="text-faint notranslate" translate="no" style={{ fontSize: 10 }}>
              {COMPANY.address}
            </div>
          </div>
          <div className="meta-cell">
            <span className="k">Service Name</span>
            <span className="v">{data.serviceName}</span>
          </div>
          <div className="meta-cell">
            <span className="k">Date</span>
            <span className="v">{formatDisplayDate(record.dueDate)}</span>
          </div>
        </div>
      </div>

      <div className="doc-table mt-4">
        <table data-table="service-lines">
          <thead>
            <tr>
              <th style={{ width: 40 }}>Sl.No</th>
              <th>Area of Pesticide Applied</th>
              <th style={{ width: 170 }}>Material Name</th>
              <th style={{ width: 130 }}>Qty Used</th>
              <th style={{ width: 150 }}>Method of Application</th>
              <th>Remarks</th>
              {editable && <th className="no-print"></th>}
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l, i) => {
              const entersQty = isQuantityLine(data.lines, i);
              const group = linesWith(l.materialName);
              return (
                <tr key={l.slNo} data-line={l.slNo}>
                  <td>{l.slNo}</td>
                  <td>
                    <input
                      className="input input-sm"
                      disabled={!editable}
                      value={l.areaName}
                      onChange={(e) => updateLine(l.slNo, { areaName: e.target.value })}
                    />
                  </td>
                  {/* The chemical and the method come from the Chemical Master and read as
                      it names them, in either language (REQUIREMENTS §58). */}
                  <td className="text-sm notranslate" translate="no" data-cell="material" title="Fixed for this service — the SOP / Chemical Master material for this area">
                    {l.materialName || <span className="text-faint">—</span>}
                  </td>
                  <td data-cell="qty">
                    {editable && entersQty ? (
                      <>
                        <input
                          className="input input-sm"
                          data-field="qty"
                          placeholder="Qty used"
                          value={l.qtyUsed}
                          onChange={(e) => updateLine(l.slNo, { qtyUsed: e.target.value })}
                          title={group.length > 1 ? `Entered once — the same on all ${group.length} ${l.materialName} lines` : undefined}
                        />
                        {group.length > 1 && (
                          <div className="text-xs text-muted mt-1 no-print">
                            Same on all {group.length} {l.materialName} lines
                          </div>
                        )}
                      </>
                    ) : (
                      <input
                        className="input input-sm"
                        disabled
                        value={l.qtyUsed}
                        title={entersQty ? undefined : `Same as line ${group[0]?.slNo} — the quantity is entered once, on the first ${l.materialName} line`}
                      />
                    )}
                  </td>
                  <td className="text-sm notranslate" translate="no" data-cell="method" title="Fixed for this service — the SOP method for this area">
                    {l.methodOfApplication || <span className="text-faint">—</span>}
                  </td>
                  <td>
                    <input
                      className="input input-sm"
                      disabled={!editable}
                      value={l.remarks}
                      onChange={(e) => updateLine(l.slNo, { remarks: e.target.value })}
                    />
                  </td>
                  {editable && (
                    <td className="no-print">
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => removeLine(l.slNo)}>
                        <FiTrash2 size={13} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="flex items-center gap-3 wrap mt-2 no-print">
          <button className="btn btn-secondary btn-sm" onClick={addLine}>
            <FiPlus size={13} /> Add Area
          </button>
          <span className="text-xs text-muted">
            Material and method are fixed for this service. The quantity is entered once, on the first line of each material, and is the same on every line
            with that material.
          </span>
        </div>
      )}

      <div className="card mt-4">
        <div className="card-pad flex gap-4 wrap">
          <div className="field" style={{ minWidth: 220 }}>
            <label>GPC Technician Sign</label>
            <input
              className="input"
              disabled={!editable}
              value={data.technicianSign}
              onChange={(e) => onChange({ ...data, technicianSign: e.target.value })}
              placeholder="Technician name"
            />
          </div>
          <div className="field" style={{ minWidth: 220 }}>
            <label>Customer's Representative Sign</label>
            <input
              className="input"
              data-field="customer-sign"
              disabled={!(editable || countersignEditable)}
              value={data.customerSign}
              onChange={(e) => onChange({ ...data, customerSign: e.target.value })}
              placeholder="Customer representative name (required to verify)"
            />
            {countersignEditable && !data.customerSign.trim() && (
              <div className="text-xs text-muted mt-1 no-print">The customer's representative countersigns here — it's needed before this report can be verified.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
