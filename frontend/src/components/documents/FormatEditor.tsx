import React, { useMemo, useState } from "react";
import { FiArrowDown, FiArrowUp, FiPlus, FiRotateCcw, FiTrash2 } from "react-icons/fi";
import type { DocumentDefinition, LogColumn, LogFieldType, LogHeaderField, LogSheetLayout } from "../../types";
import { Modal } from "../common/Modal";
import { getIssuedLogSheetLayout, getLogSheetLayout } from "../../data/seed/logSheetLayouts";
import { dropFormatEdit, formatEditFor, nextRevisionNo, saveFormatEdit, type FormatRevision } from "../../data/formatEdits";
import { SEED_DOCUMENTS } from "../../data/seed/documentDefinitions";
import { logActivity } from "../../utils/activityLog";
import { formatDisplayDate, todayISO } from "../../utils/date";

// EDIT FORMAT — any document's format can be changed by the plant
// (REQUIREMENTS §62): rename it; on a log sheet add, rename, retype, reorder
// or remove the boxes above and below the grid and the grid's columns, reword
// the printed instructions, and add, reword or remove the lines a form prints
// down its side. Saving raises the REVISION NUMBER, dates it today, and records
// who changed what and why; the list of those is the format's change history.
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

const TYPES: { value: LogFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "time", label: "Time" },
  { value: "yesno", label: "Yes / No" },
  { value: "select", label: "Choice" },
];

type Item = (LogHeaderField | LogColumn) & { isNew?: boolean };

const slug = (label: string): string => {
  const words = label.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, 4);
  const camel = words.map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1))).join("");
  return camel || "field";
};

function uniqueKey(label: string, taken: Set<string>): string {
  const base = slug(label);
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}${n}`;
  taken.add(key);
  return key;
}

function move<T>(list: T[], i: number, by: number): T[] {
  const j = i + by;
  if (j < 0 || j >= list.length) return list;
  const next = list.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** What changed between two lists of boxes or columns, in words. */
function describeItems(what: string, before: Item[], after: Item[]): string[] {
  const out: string[] = [];
  const was = new Map(before.map((b) => [b.key, b]));
  const now = new Map(after.map((a) => [a.key, a]));
  for (const a of after) {
    const b = was.get(a.key);
    if (!b) out.push(`added ${what} “${a.label}”`);
    else {
      if (b.label !== a.label) out.push(`renamed ${what} “${b.label}” to “${a.label}”`);
      if (b.type !== a.type) out.push(`${what} “${a.label}” is now ${TYPES.find((t) => t.value === a.type)?.label ?? a.type}`);
      if (!!b.required !== !!a.required) out.push(`${what} “${a.label}” is ${a.required ? "now required" : "no longer required"}`);
      if ((b.options ?? []).join("|") !== (a.options ?? []).join("|")) out.push(`changed the choices of ${what} “${a.label}”`);
    }
  }
  for (const b of before) if (!now.has(b.key)) out.push(`removed ${what} “${b.label}”`);
  const kept = after.filter((a) => was.has(a.key)).map((a) => a.key);
  const keptBefore = before.filter((b) => now.has(b.key)).map((b) => b.key);
  if (kept.join("|") !== keptBefore.join("|")) out.push(`reordered the ${what}s`);
  return out;
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
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
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
  const [reason, setReason] = useState("");
  const [instructions, setInstructions] = useState((current?.instructions ?? []).join("\n"));
  const [headerFields, setHeaderFields] = useState<Item[]>(current?.headerFields ?? []);
  const [columns, setColumns] = useState<Item[]>(current?.columns ?? []);
  const [footerFields, setFooterFields] = useState<Item[]>(current?.footerFields ?? []);
  const fixedMode = current?.rowMode.kind === "fixedRows" ? current.rowMode : null;
  const [printedRows, setPrintedRows] = useState<Record<string, string | number | null>[]>(fixedMode ? fixedMode.rows : []);
  const [error, setError] = useState<string | null>(null);

  const printedColumns = (columns as LogColumn[]).filter((c) => c.fixed);

  const save = () => {
    setError(null);
    if (!name.trim()) return setError("The format needs a name.");
    if (!revisionNo.trim()) return setError("Give the new revision number.");
    if (!reason.trim()) return setError("Say why the format is changing — it goes in its change history.");
    const all = [...headerFields, ...columns, ...footerFields];
    if (all.some((it) => !it.label.trim())) return setError("Every box and column needs a name.");
    if (current && columns.length === 0) return setError("A sheet needs at least one column.");

    // A new box or column gets a key of its own; an existing one keeps its key
    // whatever it is renamed to, so the records on file still find their values.
    const taken = new Set(all.filter((it) => it.key).map((it) => it.key));
    const keyed = <T extends Item>(list: T[]): T[] =>
      list.map((it) => {
        const { isNew: _isNew, ...rest } = it;
        void _isNew;
        return { ...rest, label: it.label.trim(), key: it.key || uniqueKey(it.label, taken) } as T;
      });

    const summary: string[] = [];
    if (name.trim() !== doc.name) summary.push(`renamed the format from “${doc.name}” to “${name.trim()}”`);
    let layout: LogSheetLayout | undefined = existing?.layout;
    if (current) {
      const nextHeader = keyed(headerFields) as LogHeaderField[];
      const nextColumns = keyed(columns) as LogColumn[];
      const nextFooter = keyed(footerFields) as LogHeaderField[];
      const nextInstructions = instructions.split("\n").map((l) => l.trim()).filter(Boolean);
      summary.push(...describeItems("box", current.headerFields, nextHeader));
      summary.push(...describeItems("column", current.columns, nextColumns));
      summary.push(...describeItems("footer box", current.footerFields ?? [], nextFooter));
      if (nextInstructions.join("\n") !== (current.instructions ?? []).join("\n")) summary.push("reworded the printed instructions");
      let rowMode = current.rowMode;
      if (fixedMode) {
        const rows = printedRows.map((r) => {
          const out: Record<string, string | number | null> = {};
          for (const c of nextColumns.filter((c) => c.fixed)) out[c.key] = r[c.key] ?? "";
          return out;
        });
        if (JSON.stringify(rows) !== JSON.stringify(fixedMode.rows)) summary.push(`changed the printed lines (${fixedMode.rows.length} → ${rows.length})`);
        rowMode = { ...fixedMode, rows };
      }
      layout = { ...current, instructions: nextInstructions.length ? nextInstructions : undefined, headerFields: nextHeader, columns: nextColumns, footerFields: nextFooter.length ? nextFooter : undefined, rowMode };
    }
    if (summary.length === 0) return setError("Nothing about the format has been changed yet.");

    const today = todayISO();
    const revision: FormatRevision = { revisionNo: revisionNo.trim(), revisionDate: today, by: actor, at: new Date().toISOString(), reason: reason.trim(), summary: summary.join("; ") };
    const ok = saveFormatEdit(doc.id, {
      revisionNo: revision.revisionNo,
      revisionDate: today,
      name: name.trim() !== (issuedDoc?.name ?? doc.name) ? name.trim() : undefined,
      layout,
      revisions: [revision, ...(existing?.revisions ?? [])],
    });
    if (!ok) return setError("The change could not be stored.");
    logActivity("Format changed", `${doc.formatNo.startsWith("TO BE") ? "" : `${doc.formatNo} `}${name.trim()}`, `Rev ${doc.revisionNo} → ${revision.revisionNo}: ${revision.summary}. Reason: ${revision.reason}`, doc.id);
    onSaved();
  };

  const restore = () => {
    if (!existing) return;
    dropFormatEdit(doc.id);
    logActivity("Format restored to the issued one", `${doc.formatNo.startsWith("TO BE") ? "" : `${doc.formatNo} `}${issuedDoc?.name ?? doc.name}`, `Rev ${doc.revisionNo} → ${issuedDoc?.revisionNo ?? ""}`, doc.id);
    onSaved();
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
