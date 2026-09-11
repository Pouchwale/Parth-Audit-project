import React from "react";
import type { DocumentDefinition, FlyCatcherData, RecordInstance } from "../../types";
import { DocumentHeader } from "../documents/DocumentHeader";
import { masterRepository } from "../../data/repositories/masterRepository";
import { formatDisplayDate } from "../../utils/date";

export function FlyCatcherRecordView({
  doc,
  record,
  editable,
  onChange,
}: {
  doc: DocumentDefinition;
  record: RecordInstance<FlyCatcherData>;
  editable: boolean;
  onChange: (data: FlyCatcherData) => void;
}) {
  const data = record.data;
  const pcLocations = masterRepository.get().pcLocations;

  const updateEntry = (pcId: string, patch: Partial<FlyCatcherData["entries"][number]>) => {
    onChange({
      ...data,
      entries: data.entries.map((e) => (e.pcId === pcId ? { ...e, ...patch } : e)),
    });
  };

  return (
    <div>
      <DocumentHeader doc={doc} dateLabel={formatDisplayDate(record.dueDate)} pageLabel="1 of 1 (digital)" />

      <div className="card mt-4">
        <div className="card-pad">
          <div className="field" style={{ maxWidth: 220 }}>
            <label>Month &amp; Year</label>
            <input className="input" value={data.monthYear} disabled={!editable} onChange={(e) => onChange({ ...data, monthYear: e.target.value })} />
          </div>
          <div className="mt-3 text-xs text-muted no-print">
            PC ID and location are master data, auto-populated from the Fly Catcher master list — not re-entered each visit.
          </div>
          <div className="grid mt-2" style={{ gridTemplateColumns: "repeat(2, 1fr)", gap: "4px 24px" }}>
            {pcLocations.map((pc) => (
              <div key={pc.id} className="text-xs flex justify-between" style={{ borderBottom: "1px dotted var(--color-border)", padding: "3px 0" }}>
                <span className="font-semibold">{pc.id}</span>
                <span className="text-muted">
                  {pc.location} ({pc.floor})
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="doc-table mt-4">
        <table>
          <thead>
            <tr>
              <th>PC ID No.</th>
              <th>Location</th>
              <th style={{ width: 130 }}>Flies Catch Count Approx.</th>
              <th style={{ width: 150 }}>Tube Light Installed</th>
              <th style={{ width: 150 }}>Tube Light Due</th>
              <th style={{ width: 140 }}>Cleaning Done By</th>
              <th style={{ width: 140 }}>Verified By</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((e) => {
              const loc = pcLocations.find((p) => p.id === e.pcId);
              return (
                <tr key={e.pcId}>
                  <td className="font-semibold">{e.pcId}</td>
                  <td className="text-sm text-muted">
                    {loc?.location} ({loc?.floor})
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      className="input input-sm"
                      disabled={!editable}
                      value={e.catchCountApprox ?? ""}
                      onChange={(ev) => updateEntry(e.pcId, { catchCountApprox: ev.target.value === "" ? null : Number(ev.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      className="input input-sm"
                      disabled={!editable}
                      value={e.tubeLightInstallDate ?? ""}
                      onChange={(ev) => updateEntry(e.pcId, { tubeLightInstallDate: ev.target.value || null })}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      className="input input-sm"
                      disabled={!editable}
                      value={e.tubeLightDueDate ?? ""}
                      onChange={(ev) => updateEntry(e.pcId, { tubeLightDueDate: ev.target.value || null })}
                    />
                  </td>
                  <td>
                    <input
                      className="input input-sm"
                      disabled={!editable}
                      value={e.cleaningDoneBy}
                      onChange={(ev) => updateEntry(e.pcId, { cleaningDoneBy: ev.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input input-sm"
                      disabled={!editable}
                      value={e.verifiedBy}
                      onChange={(ev) => updateEntry(e.pcId, { verifiedBy: ev.target.value })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
