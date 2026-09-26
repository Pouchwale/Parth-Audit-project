import React, { useMemo, useState } from "react";
import { FiArrowDown, FiArrowUp, FiPlus, FiRotateCcw, FiTrash2 } from "react-icons/fi";
import type { DocumentDefinition, LogColumn, LogFieldType, LogHeaderField, LogSheetLayout } from "../../types";
import { Modal } from "../common/Modal";
import { getIssuedLogSheetLayout, getLogSheetLayout } from "../../data/seed/logSheetLayouts";
import { formatEditFor, nextRevisionNo } from "../../data/formatEdits";
import { BOX_TYPES, COLUMN_TYPES, FIELD_TYPE_LABELS, commitFormatChange, newKey, restoreIssuedFormat, setInstructions as withInstructions } from "../../engine/formatOps";
import { SEED_DOCUMENTS } from "../../data/seed/documentDefinitions";
import { COMPANY } from "../../data/seed/masterData";
import { formatDisplayDate, todayISO } from "../../utils/date";

// EDIT FORMAT — any document's format can be changed by the plant
// (REQUIREMENTS §62): rename it; on a log sheet add, rename, retype, reorder
// or remove the boxes above and below the grid and the grid's columns, reword
// the printed instructions, and add, reword or remove the lines a form prints
// down its side. Saving raises the REVISION NUMBER, dates it today, and records
// who changed what and why; the list of those is the format's change history.
//
// THE SHEET ITSELF IS WHERE A FORMAT IS DESIGNED NOW (REQUIREMENTS §64,
// components/documents/SheetDesigner.tsx); this dialog is what "More options…"
// opens — the change history, restoring the issued format, and the same
// changes as lists. It keeps step with the sheet on what a box can BE: since
// §68 that includes a block of prose, and a box's printed words are reworded
// line by line on the sheet rather than in this textarea.
//
// WHAT A CHANGE DOES TO RECORDS ALREADY ON FILE: nothing. A record keeps every
// value it holds under the key it was written with — a column taken off the
// format simply is not drawn any more, and one added is blank on the older
// records. Keys are never renamed or reused, which is what makes that safe: a
// new box gets a new key, and renaming a box changes only its label.
//
// The forms that are drawn by hand rather than from a layout — the daily pest
// register, the fly catcher register, the service reports, the complaint
// forms, the licence — have their name and revision changed here; their grid is
// code, so a change to it is a change to the program.

// WHAT A BOX OR A COLUMN CAN BE, the one list the whole app works from
// (engine/formatOps.ts): every type for a box above or below the grid — a
// block of prose among them since §68 — and all but Paragraph for a column,
// because a cell of the grid is one line. A dialog offering fewer than the
// sheet does would show a prose box as blank and retype it the moment anybody
// touched it.
const typesFor = (column?: boolean): LogFieldType[] => (column ? COLUMN_TYPES : BOX_TYPES);

type Item = (LogHeaderField | LogColumn) & { isNew?: boolean };

function move<T>(list: T[], i: number, by: number): T[] {
  const j = i + by;
  if (j < 0 || j >= list.length) return list;
  const next = list.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function ItemList({ title, what, items, onChange, column }: { title: string; what: string; items: Item[]; onChange: (next: Item[]) => void; column?: boolean }) {
  const set = (i: number, patch: Partial<Item>) => onChange(items.map((it, ii) => (ii === i ? ({ ...it, ...patch } as Item) : it)));
  return (
    <div className="mb-4" data-section={`format-${what}s`}>
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-semibold">{title}</h4>
        <button
          className="btn btn-secondary btn-sm"
          data-action={`add-${what}`}
          onClick={() => onChange([...items, { key: "", label: "", type: "text", isNew: true } as Item])}
        >
          <FiPlus size={12} /> Add {what}
        </button>
      </div>
      {items.length === 0 && <div className="text-xs text-faint">None.</div>}
      {items.map((it, i) => {
        const locked = column && ((it as LogColumn).fixed || (it as LogColumn).computed);
        return (
          <div key={it.key || `new-${i}`} className="flex items-center gap-2 mb-1 wrap" data-format-item={it.key || "new"}>
            <input className="input input-sm" style={{ flex: "2 1 200px" }} placeholder={`Name of the ${what}`} value={it.label} onChange={(e) => set(i, { label: e.target.value })} data-field="format-label" />
            <select className="input input-sm" style={{ flex: "0 0 110px" }} value={it.type} disabled={!!locked} onChange={(e) => set(i, { type: e.target.value as LogFieldType })}>
              {typesFor(column).map((t) => (
                <option key={t} value={t}>
                  {FIELD_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            {it.type === "select" && (
              <input
                className="input input-sm"
                style={{ flex: "2 1 160px" }}
                placeholder="Choices, separated by commas"
                value={(it.options ?? []).join(", ")}
                onChange={(e) => set(i, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })}
              />
            )}
            <label className="text-xs flex items-center gap-1" style={{ whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={!!it.required} disabled={!!locked} onChange={(e) => set(i, { required: e.target.checked || undefined })} /> Required
            </label>
            {locked && <span className="text-xs text-faint">{(it as LogColumn).computed ? "worked out" : "printed"}</span>}
            <button className="btn btn-ghost btn-sm btn-icon" title="Move up" onClick={() => onChange(move(items, i, -1))} disabled={i === 0}>
              <FiArrowUp size={12} />
            </button>
            <button className="btn btn-ghost btn-sm btn-icon" title="Move down" onClick={() => onChange(move(items, i, 1))} disabled={i === items.length - 1}>
              <FiArrowDown size={12} />
            </button>
            <button className="btn btn-ghost btn-sm btn-icon" title={`Remove this ${what}`} data-action={`remove-${what}`} onClick={() => onChange(items.filter((_, ii) => ii !== i))}>
              <FiTrash2 size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function FormatEditor({ doc, actor, onClose, onSaved }: { doc: DocumentDefinition; actor: string; onClose: () => void; onSaved: () => void }) {
  const current = doc.kind === "log-sheet" ? getLogSheetLayout(doc.id) : undefined;
  const existing = formatEditFor(doc.id);
  const issuedDoc = useMemo(() => SEED_DOCUMENTS.find((d) => d.id === doc.id), [doc.id]);

  const [name, setName] = useState(doc.name);
  const [revisionNo, setRevisionNo] = useState(nextRevisionNo(doc.revisionNo));
  // The rest of the header — every format's, whatever draws it (REQUIREMENTS §77).
  const [companyName, setCompanyName] = useState(doc.companyName ?? COMPANY.name);
  const [formatNo, setFormatNo] = useState(doc.formatNo);
  const [revisionDate, setRevisionDate] = useState(todayISO());
  const [reason, setReason] = useState("");
  const [instructions, setInstructions] = useState((current?.instructions ?? []).join("\n"));
  const [headerFields, setHeaderFields] = useState<Item[]>(current?.headerFields ?? []);
  const [columns, setColumns] = useState<Item[]>(current?.columns ?? []);
  const [footerFields, setFooterFields] = useState<Item[]>(current?.footerFields ?? []);
  const fixedMode = current?.rowMode.kind === "fixedRows" ? current.rowMode : null;
  const [printedRows, setPrintedRows] = useState<Record<string, string | number | null>[]>(fixedMode ? fixedMode.rows : []);
  const [error, setError] = useState<string | null>(null);

  const printedColumns = (columns as LogColumn[]).filter((c) => c.fixed);

  // Saved the one way a format change is saved (engine/formatOps.ts): the next
  // revision, dated, with who changed what and why, and a line in the activity log.
  const save = () => {
    setError(null);
    const all = [...headerFields, ...columns, ...footerFields];
    if (all.some((it) => !it.label.trim())) return setError("Every box and column needs a name.");
    let layout: LogSheetLayout | undefined;
    if (current) {
      // A new box or column gets a key of its own; an existing one keeps its key
      // whatever it is renamed to, so the records on file still find their values.
      // `keyed` always holds every key already spoken for — the ones on the form
      // now and the ones handed out so far — so two new items never share one.
      let keyed: LogSheetLayout = {
        ...current,
        headerFields: headerFields.filter((x) => x.key) as LogHeaderField[],
        columns: columns.filter((x) => x.key) as LogColumn[],
        footerFields: footerFields.filter((x) => x.key) as LogHeaderField[],
      };
      const withKey = <T extends Item>(it: T): T => {
        const { isNew: _isNew, ...rest } = it;
        void _isNew;
        const key = it.key || newKey(keyed, it.label);
        if (!it.key) keyed = { ...keyed, columns: [...keyed.columns, { key, label: it.label, type: "text" }] };
        return { ...rest, label: it.label.trim(), key } as T;
      };
      const nextHeader = headerFields.map(withKey) as LogHeaderField[];
      const nextColumns = columns.map(withKey) as LogColumn[];
      const nextFooter = footerFields.map(withKey) as LogHeaderField[];
      layout = withInstructions({ ...current, headerFields: nextHeader, columns: nextColumns, footerFields: nextFooter.length ? nextFooter : undefined }, instructions.split(/\r?\n/));
      if (fixedMode) {
        const printed = layout.columns.filter((c) => c.fixed);
        layout = {
          ...layout,
          rowMode: { ...fixedMode, rows: printedRows.map((r) => Object.fromEntries(printed.map((c) => [c.key, r[c.key] ?? ""]))) },
        };
      }
    }
    const result = commitFormatChange(doc, { name, layout, companyName, formatNo, revisionDate }, { actor, reason, revisionNo });
    if (!result.ok) return setError(result.error);
    onSaved();
  };

  const restore = () => {
    if (restoreIssuedFormat(doc)) onSaved();
  };

  const issuedLayout = getIssuedLogSheetLayout(doc.id);

  return (
    <Modal
      title={`Edit format — ${doc.formatNo.startsWith("TO BE") ? "" : `${doc.formatNo} `}${doc.name}`}
      onClose={onClose}
      width={900}
      footer={
        <div className="flex items-center justify-between gap-2 wrap" style={{ width: "100%" }}>
          <div>
            {existing && (
              <button className="btn btn-ghost btn-sm" data-action="restore-format" onClick={restore} title={`Back to the format as issued (Rev ${issuedDoc?.revisionNo ?? "—"})`}>
                <FiRotateCcw size={12} /> Restore the issued format
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary btn-sm" data-action="save-format" onClick={save}>
              Save as Rev {revisionNo || "…"}
            </button>
          </div>
        </div>
      }
    >
      <div data-section="format-editor" style={{ maxHeight: "68vh", overflowY: "auto", paddingRight: 4 }}>
        <p className="text-sm text-muted mb-3">
          Now at <strong>Rev {doc.revisionNo}</strong>
          {doc.revisionDate ? ` of ${formatDisplayDate(doc.revisionDate)}` : ""}. Saving raises the revision, dates it today and records who changed what and why. Records already on file keep everything
          written on them.
        </p>
        <div className="grid mb-4" style={{ gridTemplateColumns: "2fr 1fr", gap: "10px 16px" }}>
          <div className="field">
            <label>Name of the format</label>
            <input className="input input-sm" value={name} onChange={(e) => setName(e.target.value)} data-field="format-name" />
          </div>
          <div className="field">
            <label>New revision number</label>
            <input className="input input-sm" value={revisionNo} onChange={(e) => setRevisionNo(e.target.value)} data-field="format-revision" />
          </div>
          {/* The rest of the header block (REQUIREMENTS §77): the company's name as the form prints it, its number, and the date this revision carries. */}
          <div className="field">
            <label>Company name (as the header prints it)</label>
            <input className="input input-sm notranslate" translate="no" value={companyName} onChange={(e) => setCompanyName(e.target.value)} data-field="format-company" />
          </div>
          <div className="field">
            <label>Format No.</label>
            <input className="input input-sm notranslate" translate="no" value={formatNo} onChange={(e) => setFormatNo(e.target.value)} data-field="format-number" />
          </div>
          <div className="field">
            <label>Date of this revision</label>
            <input className="input input-sm notranslate" translate="no" type="date" value={revisionDate} onChange={(e) => setRevisionDate(e.target.value)} data-field="format-revision-date" />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Why is the format changing? *</label>
            <input className="input input-sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer audit asked for the batch number on every line" data-field="format-reason" />
          </div>
        </div>

        {current ? (
          <>
            <div className="field mb-4">
              <label>Printed instructions (one per line)</label>
              <textarea className="input" rows={Math.min(6, Math.max(2, instructions.split("\n").length))} value={instructions} onChange={(e) => setInstructions(e.target.value)} data-field="format-instructions" />
            </div>
            <ItemList title="Boxes above the grid" what="box" items={headerFields} onChange={setHeaderFields} />
            <ItemList title="Columns of the grid" what="column" items={columns} onChange={setColumns} column />
            {fixedMode && printedColumns.length > 0 && (
              <div className="mb-4" data-section="format-lines">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-sm font-semibold">Lines the form prints down its side</h4>
                  <button className="btn btn-secondary btn-sm" data-action="add-line" onClick={() => setPrintedRows([...printedRows, {}])}>
                    <FiPlus size={12} /> Add line
                  </button>
                </div>
                {printedRows.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-faint" style={{ width: 22 }}>
                      {i + 1}.
                    </span>
                    {printedColumns.map((c) => (
                      <input
                        key={c.key}
                        className="input input-sm"
                        style={{ flex: 1 }}
                        placeholder={c.label}
                        value={String(r[c.key] ?? "")}
                        onChange={(e) => setPrintedRows(printedRows.map((x, xi) => (xi === i ? { ...x, [c.key]: e.target.value } : x)))}
                      />
                    ))}
                    <button className="btn btn-ghost btn-sm btn-icon" title="Remove this line" onClick={() => setPrintedRows(printedRows.filter((_, xi) => xi !== i))}>
                      <FiTrash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <ItemList title="Boxes below the grid" what="footer box" items={footerFields} onChange={setFooterFields} />
          </>
        ) : (
          <p className="text-sm text-muted mb-4">
            This form is drawn by the program itself rather than from a layout, so its name and its revision are changed here; a change to its grid is a change to the program — tell the system&apos;s
            keeper what should change and it is issued as the next revision.
          </p>
        )}

        {error && (
          <div className="text-sm text-danger mb-3" role="alert" data-section="format-error">
            {error}
          </div>
        )}

        <h4 className="text-sm font-semibold mb-1">Change history</h4>
        <div className="doc-table">
          <table className="compact" data-table="format-history">
            <thead>
              <tr>
                <th style={{ width: 70 }}>Rev</th>
                <th style={{ width: 110 }}>Date</th>
                <th style={{ width: 130 }}>By</th>
                <th>What changed, and why</th>
              </tr>
            </thead>
            <tbody>
              {(existing?.revisions ?? []).map((r) => (
                <tr key={r.at}>
                  <td className="text-sm">{r.revisionNo}</td>
                  <td className="text-sm">{formatDisplayDate(r.revisionDate)}</td>
                  <td className="text-sm notranslate" translate="no">
                    {r.by}
                  </td>
                  <td className="text-sm">
                    {r.summary}
                    <div className="text-xs text-muted">Reason: {r.reason}</div>
                  </td>
                </tr>
              ))}
              <tr>
                <td className="text-sm">{issuedDoc?.revisionNo ?? "—"}</td>
                <td className="text-sm">{issuedDoc?.revisionDate ? formatDisplayDate(issuedDoc.revisionDate) : "—"}</td>
                <td className="text-sm text-muted">—</td>
                <td className="text-sm text-muted">As issued{issuedLayout?.specimenSource ? ` — ${issuedLayout.specimenSource}` : issuedDoc?.sourceFile ? ` — ${issuedDoc.sourceFile}` : ""}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
