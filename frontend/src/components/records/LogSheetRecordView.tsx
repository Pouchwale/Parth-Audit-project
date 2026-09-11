import React from "react";
import { FiAlertTriangle, FiPlus, FiTrash2 } from "react-icons/fi";
import type { DocumentDefinition, LogColumn, LogHeaderField, LogSheetData, LogSheetRow, RecordInstance } from "../../types";
import { DocumentHeader } from "../documents/DocumentHeader";
import { getLogSheetLayout } from "../../data/seed/logSheetLayouts";
import { masterRepository } from "../../data/repositories/masterRepository";
import { isOutOfBand } from "../../engine/validation";
import { formatDisplayDate } from "../../utils/date";
import { generateId } from "../../utils/id";

// One renderer for every grid-shaped log sheet. The shape of the form —
// header fields, columns, how rows are created — comes entirely from the
// document's LogSheetLayout, so a new register is configuration, not code.
export function LogSheetRecordView({
  doc,
  record,
  editable,
  onChange,
}: {
  doc: DocumentDefinition;
  record: RecordInstance<LogSheetData>;
  editable: boolean;
  onChange: (data: LogSheetData) => void;
}) {
  const layout = getLogSheetLayout(doc.id);
  const data = record.data ?? { header: {}, rows: [] };
  const employees = masterRepository.get().employees;
  // Before the early return below: a hook called only on some renders breaks
  // React ("rendered fewer hooks than expected") the moment this component is
  // reused for a document without a layout.
  const [showReference, setShowReference] = React.useState(false);

  if (!layout) {
    return <div className="empty-state">No layout is configured for this document (id: {doc.id}).</div>;
  }

  const setHeader = (key: string, value: string) => onChange({ ...data, header: { ...data.header, [key]: value } });
  const setCell = (rowId: string, key: string, value: string | number | null) =>
    onChange({ ...data, rows: data.rows.map((r) => (r.id === rowId ? { ...r, [key]: value } : r)) });
  const addRow = () => {
    const row: LogSheetRow = { id: generateId("row") };
    for (const c of layout.columns) row[c.key] = c.type === "number" ? null : c.autoFill?.default !== undefined && c.type !== "text" ? String(c.autoFill.default) : "";
    onChange({ ...data, rows: [...data.rows, row] });
  };
  const removeRow = (rowId: string) => onChange({ ...data, rows: data.rows.filter((r) => r.id !== rowId) });

  const mode = layout.rowMode;
  const canAddRows = editable && mode.kind === "free";
  const canRemoveRows = editable && mode.kind === "free" && data.rows.length > (mode.minRows ?? 0);
  const outOfBand = data.rows.reduce((n, row) => n + layout.columns.filter((c) => isOutOfBand(c, row[c.key])).length, 0);

  return (
    <div>
      <DocumentHeader doc={doc} dateLabel={formatDisplayDate(record.dueDate)} pageLabel="1 of 1 (digital)" />

      {(layout.instructions?.length || layout.headerFields.length > 0) && (
        <div className="card mt-4">
          <div className="card-pad">
            {layout.instructions?.map((line, i) => (
              <p key={i} className={`text-sm ${i === 0 ? "font-semibold" : "text-muted"} ${i < (layout.instructions?.length ?? 0) - 1 ? "mb-1" : ""}`}>
                {line}
              </p>
            ))}
            {layout.referenceTables?.map((t) => (
              <div key={t.title} className="mt-2">
                <button className="btn btn-ghost btn-sm no-print" style={{ padding: "2px 6px" }} onClick={() => setShowReference((s) => !s)}>
                  {showReference ? "Hide" : "Show"} {t.title}
                </button>
                {showReference && (
                  <div className="doc-table mt-2" style={{ overflowX: "auto" }}>
                    <table className="compact">
                      <thead>
                        <tr>
                          {t.columns.map((c) => (
                            <th key={c}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {t.rows.map((r, ri) => (
                          <tr key={ri}>
                            {r.map((cell, ci) => (
                              <td key={ci} className={`text-xs ${ci === 0 ? "font-semibold" : ""}`} style={{ verticalAlign: "top", whiteSpace: "normal" }}>
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
            {layout.headerFields.length > 0 && (
              <div className="grid mt-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px 16px" }}>
                {layout.headerFields.map((f) => (
                  <HeaderFieldInput key={f.key} field={f} value={data.header?.[f.key] ?? ""} editable={editable} onChange={(v) => setHeader(f.key, v)} employees={employees.map((e) => e.name)} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {outOfBand > 0 && (
        <div className="card mt-4 no-print" style={{ borderColor: "var(--color-warning)", background: "var(--color-warning-bg)" }}>
          <div className="card-pad text-sm">
            <FiAlertTriangle size={13} style={{ verticalAlign: -2 }} /> {outOfBand} reading{outOfBand === 1 ? " is" : "s are"} outside the printed acceptance band (highlighted). Add a remark
            explaining the deviation and inform the shift in-charge.
          </div>
        </div>
      )}

      <div className="doc-table mt-4" style={{ overflowX: "auto" }}>
        <table className="compact log-sheet">
          <thead>
            <tr>
              <th style={{ width: 44 }}>Sr. No.</th>
              {layout.columns.map((c) => (
                <th key={c.key} style={c.width ? { minWidth: c.width } : undefined} title={c.nominal !== undefined ? `Nominal ${c.nominal}${c.unit ? " " + c.unit : ""}; band ${c.min}–${c.max}` : undefined}>
                  {c.label}
                </th>
              ))}
              {canRemoveRows && <th style={{ width: 36 }}></th>}
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={layout.columns.length + 2} className="text-muted text-center" style={{ padding: 16 }}>
                  No rows yet.
                </td>
              </tr>
            )}
            {data.rows.map((row, i) => (
              <tr key={row.id}>
                <td className="text-muted">{i + 1}</td>
                {layout.columns.map((c) => (
                  <td key={c.key} className={isOutOfBand(c, row[c.key]) ? "cell-out-of-band" : ""}>
                    <CellInput col={c} value={row[c.key]} editable={editable && !c.fixed} onChange={(v) => setCell(row.id, c.key, v)} employees={employees.map((e) => e.name)} />
                  </td>
                ))}
                {canRemoveRows && (
                  <td>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => removeRow(row.id)} title="Remove row">
                      <FiTrash2 size={13} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canAddRows && (
        <button className="btn btn-secondary btn-sm mt-2" onClick={addRow}>
          <FiPlus size={13} /> Add Row
        </button>
      )}

      {layout.footerFields && layout.footerFields.length > 0 && (
        <div className="card mt-4">
          <div className="card-pad">
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px 16px" }}>
              {layout.footerFields.map((f) => (
                <HeaderFieldInput key={f.key} field={f} value={data.header?.[f.key] ?? ""} editable={editable} onChange={(v) => setHeader(f.key, v)} employees={employees.map((e) => e.name)} />
              ))}
            </div>
            <div className="text-xs text-muted mt-3">
              "Approved by (QA Manager)" on the paper form is the <strong>Verify</strong> step here — the verifier's name and time are stamped automatically.
            </div>
          </div>
        </div>
      )}
      <datalist id="log-sheet-employees">
        {employees.map((e) => (
          <option key={e.id} value={e.name} />
        ))}
      </datalist>
      <div className="text-xs text-faint mt-3">Specimen source: {layout.specimenSource}</div>
    </div>
  );
}

function HeaderFieldInput({
  field,
  value,
  editable,
  onChange,
  employees,
}: {
  field: LogHeaderField;
  value: string;
  editable: boolean;
  onChange: (v: string) => void;
  employees: string[];
}) {
  const isName = /operator|name|inspected|person|sign/i.test(field.label) && field.type === "text" && !/job name|customer name/i.test(field.label);
  return (
    <div className="field">
      <label>
        {field.label}
        {field.required ? " *" : ""}
      </label>
      {field.type === "select" ? (
        <select className="input input-sm" disabled={!editable} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="input input-sm"
          type={field.type === "date" ? "date" : field.type === "time" ? "time" : "text"}
          list={isName ? "log-sheet-employees" : undefined}
          disabled={!editable}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {isName && employees.length === 0 ? null : null}
    </div>
  );
}

function CellInput({
  col,
  value,
  editable,
  onChange,
  employees,
}: {
  col: LogColumn;
  value: string | number | null | undefined;
  editable: boolean;
  onChange: (v: string | number | null) => void;
  employees: string[];
}) {
  if (col.fixed) return <span className={`text-sm ${col.key === "specification" || col.key === "testChart" ? "text-muted" : "font-semibold"}`} style={{ whiteSpace: "normal" }}>{value ?? ""}</span>;
  if (col.type === "number") {
    return (
      <input
        type="number"
        step={col.decimals === 0 ? 1 : Math.pow(10, -(col.decimals ?? 2))}
        className="input input-sm"
        disabled={!editable}
        value={value === null || value === undefined ? "" : value}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        title={col.unit}
      />
    );
  }
  if (col.type === "yesno" || col.type === "select") {
    const opts = col.type === "yesno" ? ["Yes", "No"] : (col.options ?? []);
    return (
      <select className="input input-sm" disabled={!editable} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  const isSign = !!col.autoFill?.sign || /sign|by$/i.test(col.label);
  return (
    <input
      type={col.type === "time" ? "time" : col.type === "date" ? "date" : "text"}
      className="input input-sm"
      list={isSign && employees.length ? "log-sheet-employees" : undefined}
      disabled={!editable}
      value={(value as string) ?? ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
