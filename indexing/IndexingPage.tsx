// /indexing — THE INDEX OF EVERY FORMAT AND DOCUMENT, THE SUPER ADMIN'S ALONE.
//
// Four tabs:
//   Formats              every format DCRS holds and every line of F/SYS/02: number, name, revision, frequency, who
//                        fills it, how it is recorded, how long it is kept, how it is disposed of, where the paper is,
//                        status, whether it runs on its own or by hand, its formulas and its records.
//   Documents            every line of F/SYS/01: the manuals, SOPs and procedures.
//   Formulas & automation  every worked-out cell, its formula (changeable) and its history; which formats run on their
//                        own and which are done by hand.
//   Versions             every saved version: who, when, why, what changed; compare two; restore one.
//
// Nothing changes until "Save as version": the edits are a draft on this screen, listed before → after, and saved with
// a reason. The server refuses the index to anybody but the super admin whatever is sent (backend/storageRoutes.ts).

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FiCheck, FiDownload, FiEdit2, FiEdit3, FiExternalLink, FiPlus, FiPrinter, FiRotateCcw, FiType, FiX } from "react-icons/fi";
import { useAuth } from "../frontend/src/store/AuthContext";
import { useAppStore } from "../frontend/src/store/AppStore";
import { Link, useRouter } from "../frontend/src/store/router";
import { canDesignGrid } from "../frontend/src/engine/formatOps";
import { requestDesign } from "../frontend/src/engine/designSession";
import type { DocumentDefinition } from "../frontend/src/types";
import { Modal } from "../frontend/src/components/common/Modal";
import { formatDisplayDate, formatDisplayDateTime } from "../frontend/src/utils/date";
import { compileFormula, type FormulaValue } from "./formulaLanguage";
import { FORMULA_SLOTS, type FormulaSlot } from "./formulas";
import { RangesSection } from "./RangesSection";
import { startTextDesign } from "./TextDesigner";
import { textEditsFor } from "./textLayout";
import { rangeText, rangesOf } from "./ranges";
import { DOCUMENT_FIELDS, FREQUENCIES, STATUSES, buildDocumentLines, buildFormatLines, type DocumentLine, type FormatLine } from "./indexRows";
import {
  DOCUMENT_FIELD_LABELS,
  FORMAT_FIELD_LABELS,
  compareSnapshots,
  currentFormula,
  currentRange,
  describeDraft,
  draftIsEmpty,
  emptyDraft,
  formulaProblem,
  newLineKey,
  restoreVersion,
  saveIndexDraft,
  openRecordsUnderFormulas,
  type IndexDraft,
} from "./indexActions";
import { PUSHED_FORMAT_FIELDS, currentVersionNo, emptySnapshot, readIndexState, type DocumentField, type FormatField, type IndexSnapshot } from "./indexState";

type Tab = "formats" | "documents" | "formulas" | "versions";

const CSS = `
.ix-table td, .ix-table th { padding: 6px 8px; vertical-align: top; font-size: 13px; }
.ix-table th { position: sticky; top: 0; background: var(--color-surface-alt); z-index: 1; white-space: nowrap; }
.ix-changed { background: var(--color-warning-bg); }
.ix-draft { background: var(--color-info-bg); outline: 1px solid var(--color-info); }
.ix-pushed-mark { color: var(--color-info); font-size: 10px; margin-left: 4px; }
.ix-cell-input { width: 100%; min-width: 90px; padding: 3px 6px; font-size: 13px; border: 1px solid var(--color-border-strong); border-radius: 4px; background: var(--color-surface); color: var(--color-text); }
.ix-tag { display: inline-block; padding: 1px 7px; margin: 1px 3px 1px 0; border-radius: 10px; font-size: 11px; background: var(--color-neutral-bg); color: var(--color-text-muted); white-space: nowrap; }
.ix-mode-Automatic { background: var(--color-success-bg); color: var(--color-success); }
.ix-mode-Manual { background: var(--color-warning-bg); color: var(--color-warning); }
.ix-mode-Reference { background: var(--color-info-bg); color: var(--color-info); }
.ix-mode-Not { background: var(--color-danger-bg); color: var(--color-danger); }
.ix-code { font-family: ui-monospace, Consolas, monospace; font-size: 12.5px; background: var(--color-surface-alt); padding: 2px 6px; border-radius: 4px; white-space: pre-wrap; word-break: break-word; }
.ix-savebar { position: sticky; bottom: 0; z-index: 5; margin-top: 12px; border: 1px solid var(--color-info); background: var(--color-surface); box-shadow: 0 -2px 10px rgba(0,0,0,.08); }
.ix-stat { min-width: 130px; padding: 10px 14px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-surface); }
.ix-stat b { display: block; font-size: 20px; }
.ix-scroll { overflow: auto; max-height: calc(100vh - 290px); border: 1px solid var(--color-border); border-radius: 8px; }
@media print { .ix-scroll { max-height: none; overflow: visible; } .no-print { display: none !important; } }
`;

const modeClass = (mode: string) => `ix-tag ix-mode-${mode.split(" ")[0]}`;

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadCsv(name: string, rows: (string | number)[][]): void {
  const text = "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const showValue = (f: FormatField | DocumentField, v: string): string => (f === "revisionDate" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? formatDisplayDate(v) : v);

export function IndexingPage() {
  const { user } = useAuth();
  const { version, bump } = useAppStore();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState<Tab>("formats");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<IndexDraft>(emptyDraft);
  const [askSave, setAskSave] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const state = useMemo(() => readIndexState(), [version, tick]);
  const formatLines = useMemo(() => buildFormatLines(), [version, tick]);
  const documentLines = useMemo(() => buildDocumentLines(), [version, tick]);
  const draftLines = useMemo(
    () => ({
      formats: buildFormatLines({ ...state.current, addedFormats: [...state.current.addedFormats, ...draft.addedFormats] }),
      documents: buildDocumentLines({ ...state.current, addedDocuments: [...state.current.addedDocuments, ...draft.addedDocuments] }),
    }),
    [state, draft.addedFormats, draft.addedDocuments, version, tick]
  );
  const changes = useMemo(() => describeDraft(draft, formatLines, documentLines), [draft, formatLines, documentLines]);

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (draftIsEmpty(draft)) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft]);

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
    bump();
  }, [bump]);

  if (!isAdmin) {
    return (
      <div className="empty-state" data-page="indexing" data-state="refused">
        <h2 className="text-xl mb-2">Indexing is the super admin's</h2>
        <p>Only the super admin can open and change the index of formats and documents.</p>
      </div>
    );
  }

  const setFormatField = (key: string, f: FormatField, value: string) =>
    setDraft((d) => ({ ...d, formats: { ...d.formats, [key]: { ...(d.formats[key] ?? {}), [f]: value } } }));
  const setDocumentField = (key: string, f: DocumentField, value: string) =>
    setDraft((d) => ({ ...d, documents: { ...d.documents, [key]: { ...(d.documents[key] ?? {}), [f]: value } } }));
  const setFormula = (slotId: string, expr: string | null) => setDraft((d) => ({ ...d, formulas: { ...d.formulas, [slotId]: expr } }));
  const setRange = (id: string, value: import("./ranges").RangeValue | null) => setDraft((d) => ({ ...d, ranges: { ...d.ranges, [id]: value } }));

  const lastVersion = state.versions[0];

  return (
    <div data-page="indexing" data-state="ready">
      <style>{CSS}</style>
      <div className="flex items-center justify-between mb-2 wrap gap-3">
        <div>
          <h1 className="text-2xl mb-1">Indexing</h1>
          <p className="text-muted text-sm" style={{ maxWidth: 900 }}>
            Every format and document of the plant in one place: its details, how it is kept, whether it runs on its own or
            by hand, and the formulas it works out. Changes are saved as versions; a format's own details and formulas
            change the format itself.
          </p>
        </div>
        <div className="text-sm text-muted" data-section="index-version">
          {lastVersion ? (
            <>
              <b>Version {lastVersion.no}</b> · {formatDisplayDateTime(lastVersion.at)} · {lastVersion.by}
            </>
          ) : (
            <b>Version 0 — as issued (all defaults)</b>
          )}
        </div>
      </div>

      {note && (
        <div className="card mb-3 no-print" role="status" style={{ borderColor: "var(--color-success)" }}>
          <div className="card-pad text-sm flex items-center justify-between gap-3">
            <span>{note}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setNote(null)}>
              Close
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between wrap gap-3 mb-3 no-print">
        <div className="pill-tabs wrap" style={{ flexWrap: "wrap" }}>
          {(
            [
              ["formats", `Formats (${draftLines.formats.length})`],
              ["documents", `Documents — F/SYS/01 (${draftLines.documents.length})`],
              ["formulas", `Formulas, ranges & automation`],
              ["versions", `Versions (${state.versions.length + 1})`],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button key={k} type="button" className={`pill-tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)} data-tab={k}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 wrap">
          {tab !== "versions" &&
            (editing ? (
              <button className="btn btn-secondary btn-sm" data-action="stop-editing" onClick={() => setEditing(false)}>
                <FiCheck size={13} /> Done editing
              </button>
            ) : (
              <button className="btn btn-primary btn-sm" data-action="edit-index" onClick={() => setEditing(true)}>
                <FiEdit2 size={13} /> Edit index
              </button>
            ))}
          <button className="btn btn-secondary btn-sm" onClick={() => window.print()}>
            <FiPrinter size={13} /> Print / PDF
          </button>
          {tab === "formats" && (
            <button className="btn btn-secondary btn-sm" onClick={() => exportFormats(formatLines)}>
              <FiDownload size={13} /> Excel (CSV)
            </button>
          )}
          {tab === "documents" && (
            <button className="btn btn-secondary btn-sm" onClick={() => exportDocuments(documentLines)}>
              <FiDownload size={13} /> Excel (CSV)
            </button>
          )}
          {tab === "formulas" && (
            <button className="btn btn-secondary btn-sm" onClick={() => exportFormulas(formatLines)}>
              <FiDownload size={13} /> Excel (CSV)
            </button>
          )}
        </div>
      </div>

      {tab === "formats" && (
        <FormatsTab
          lines={draftLines.formats}
          draft={draft}
          editing={editing}
          onField={setFormatField}
          onAdd={(values) => setDraft((d) => ({ ...d, addedFormats: [...d.addedFormats, { key: newLineKey("added-format"), values, at: new Date().toISOString(), by: user?.name ?? "Super Admin" }] }))}
        />
      )}
      {tab === "documents" && (
        <DocumentsTab
          lines={draftLines.documents}
          draft={draft}
          editing={editing}
          onField={setDocumentField}
          onAdd={(values) => setDraft((d) => ({ ...d, addedDocuments: [...d.addedDocuments, { key: newLineKey("added-document"), values, at: new Date().toISOString(), by: user?.name ?? "Super Admin" }] }))}
        />
      )}
      {tab === "formulas" && (
        <>
          <RangesSection draft={draft} editing={editing} onRange={setRange} onFormula={setFormula} />
          <FormulasTab lines={formatLines} draft={draft} editing={editing} onFormula={setFormula} />
        </>
      )}
      {tab === "versions" && (
        <VersionsTab
          actor={user?.name ?? "Super Admin"}
          hasDraft={!draftIsEmpty(draft)}
          onDone={(msg) => {
            setNote(msg);
            refresh();
          }}
        />
      )}

      {!draftIsEmpty(draft) && (
        <div className="card ix-savebar no-print" data-section="index-savebar">
          <div className="card-pad flex items-center justify-between gap-3 wrap">
            <span className="text-sm">
              <b>{changes.length}</b> unsaved change{changes.length === 1 ? "" : "s"} — nothing is changed until you save them as version {currentVersionNo(state) + 1}.
            </span>
            <div className="flex gap-2">
              <button className="btn btn-ghost btn-sm" data-action="discard-index" onClick={() => setDraft(emptyDraft())}>
                <FiX size={13} /> Discard
              </button>
              <button className="btn btn-primary btn-sm" data-action="review-index" disabled={changes.length === 0} onClick={() => setAskSave(true)}>
                <FiCheck size={13} /> Review &amp; save as version {currentVersionNo(state) + 1}
              </button>
            </div>
          </div>
        </div>
      )}

      {askSave && (
        <SaveDialog
          draft={draft}
          versionNo={currentVersionNo(state) + 1}
          onClose={() => setAskSave(false)}
          onSave={(reason) => {
            const result = saveIndexDraft(draft, reason, user?.name ?? "Super Admin");
            if (!result.ok) return result.error;
            setAskSave(false);
            setDraft(emptyDraft());
            setEditing(false);
            setNote(
              `Saved as version ${result.versionNo}: ${result.changes.length} change${result.changes.length === 1 ? "" : "s"}.` +
                (result.reworked ? ` ${result.reworked} open record${result.reworked === 1 ? " was" : "s were"} worked out again with the new formula.` : "")
            );
            refresh();
            return null;
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Formats

const FORMAT_COLUMNS: { f: FormatField; width?: number }[] = [
  { f: "formatNo", width: 110 },
  { f: "name", width: 260 },
  { f: "department", width: 120 },
  { f: "revisionNo", width: 70 },
  { f: "revisionDate", width: 120 },
  { f: "frequency", width: 120 },
  { f: "responsibleRole", width: 140 },
  { f: "methodOfRecording", width: 120 },
  { f: "retentionPeriod", width: 110 },
  { f: "methodOfDisposition", width: 120 },
  { f: "fileLocation", width: 140 },
  { f: "status", width: 120 },
  { f: "remarks", width: 160 },
];

function FieldInput({ f, value, onChange }: { f: FormatField | DocumentField; value: string; onChange: (v: string) => void }) {
  if (f === "frequency")
    return (
      <select className="ix-cell-input" value={value} onChange={(e) => onChange(e.target.value)}>
        {FREQUENCIES.map((q) => (
          <option key={q}>{q}</option>
        ))}
      </select>
    );
  if (f === "status")
    return (
      <select className="ix-cell-input" value={value} onChange={(e) => onChange(e.target.value)}>
        {[...new Set([value, ...STATUSES])].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    );
  if (f === "revisionDate") return <input type="date" className="ix-cell-input" value={value} onChange={(e) => onChange(e.target.value)} />;
  return <input className="ix-cell-input" value={value} onChange={(e) => onChange(e.target.value)} />;
}

function FormatsTab({
  lines,
  draft,
  editing,
  onField,
  onAdd,
}: {
  lines: FormatLine[];
  draft: IndexDraft;
  editing: boolean;
  onField: (key: string, f: FormatField, v: string) => void;
  onAdd: (values: Record<string, string>) => void;
}) {
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [mode, setMode] = useState("");
  const [status, setStatus] = useState("");
  const [changedOnly, setChangedOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const depts = useMemo(() => [...new Set(lines.map((l) => l.values.department).filter(Boolean))].sort(), [lines]);
  const valueOf = (l: FormatLine, f: FormatField) => draft.formats[l.key]?.[f] ?? l.values[f];
  const shown = lines.filter((l) => {
    if (dept && l.values.department !== dept) return false;
    if (mode && l.automation.mode !== mode) return false;
    if (status && valueOf(l, "status") !== status) return false;
    if (changedOnly && l.changed.size === 0 && !draft.formats[l.key]) return false;
    if (q.trim()) {
      const hay = `${l.values.formatNo} ${l.values.name} ${l.values.department} ${l.values.remarks} ${l.values.fileLocation}`.toLowerCase();
      if (!q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of lines) c[l.automation.mode] = (c[l.automation.mode] ?? 0) + 1;
    return c;
  }, [lines]);
  const openLine = open ? lines.find((l) => l.key === open) : undefined;

  return (
    <>
      <div className="flex gap-2 wrap mb-3 no-print">
        {["Automatic", "Manual start", "Reference only", "Not in DCRS"].map((m) => (
          <button key={m} type="button" className="ix-stat" style={{ textAlign: "left", cursor: "pointer", outline: mode === m ? "2px solid var(--color-primary)" : undefined }} onClick={() => setMode(mode === m ? "" : m)}>
            <b>{counts[m] ?? 0}</b>
            <span className={modeClass(m)}>{m}</span>
          </button>
        ))}
        <div className="ix-stat">
          <b>{lines.filter((l) => l.changed.size > 0).length}</b>
          <span className="text-sm text-muted">changed from default</span>
        </div>
      </div>
      <div className="flex gap-2 wrap items-center mb-2 no-print">
        <input className="input input-sm" style={{ width: 240 }} placeholder="Search number, name, location…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input input-sm" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">All departments</option>
          {depts.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <select className="input input-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <label className="text-sm flex items-center gap-1">
          <input type="checkbox" checked={changedOnly} onChange={(e) => setChangedOnly(e.target.checked)} /> Changed only
        </label>
        <span className="text-sm text-muted">
          {shown.length} of {lines.length}
        </span>
        {editing && (
          <button className="btn btn-secondary btn-sm" onClick={() => setAdding(true)}>
            <FiPlus size={13} /> Add a format line
          </button>
        )}
      </div>
      <p className="text-sm text-muted mb-2 no-print">
        <span className="ix-pushed-mark">●</span> marks a format's own detail: changing it changes the format itself (its header, revision, frequency or who is reminded). Yellow = differs from the default; blue = changed, not saved yet.
      </p>
      <div className="ix-scroll">
        <table className="doc-table ix-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th>Sr.</th>
              {FORMAT_COLUMNS.map((c) => (
                <th key={c.f}>
                  {FORMAT_FIELD_LABELS[c.f]}
                  {PUSHED_FORMAT_FIELDS.includes(c.f) && <span className="ix-pushed-mark">●</span>}
                </th>
              ))}
              <th>Automatic / manual</th>
              <th>Formulas</th>
              <th>Records</th>
              <th className="no-print"></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => (
              <tr key={l.key} data-line={l.key}>
                <td className="text-muted">{l.srNo}</td>
                {FORMAT_COLUMNS.map((c) => {
                  const drafted = draft.formats[l.key]?.[c.f];
                  const value = drafted ?? l.values[c.f];
                  const cls = drafted !== undefined && drafted !== l.values[c.f] ? "ix-draft" : l.changed.has(c.f) ? "ix-changed" : "";
                  return (
                    <td key={c.f} className={cls} style={{ minWidth: c.width }} title={l.changed.has(c.f) || drafted !== undefined ? `Default: ${showValue(c.f, l.defaults[c.f]) || "(blank)"}` : undefined}>
                      {editing && l.editable.has(c.f) ? (
                        <FieldInput f={c.f} value={value} onChange={(v) => onField(l.key, c.f, v)} />
                      ) : c.f === "name" && l.doc ? (
                        <Link to={`/document/${l.doc.id}`}>{value}</Link>
                      ) : (
                        showValue(c.f, value)
                      )}
                      {c.f === "responsibleRole" && l.responsiblePeople && <div className="text-muted" style={{ fontSize: 11 }}>{l.responsiblePeople}</div>}
                      {c.f === "frequency" && l.scheduleText && !editing && <div className="text-muted" style={{ fontSize: 11 }}>{l.scheduleText}</div>}
                    </td>
                  );
                })}
                <td style={{ minWidth: 160 }}>
                  <span className={modeClass(l.automation.mode)}>{l.automation.mode}</span>
                </td>
                <td>{l.automation.formulas.length ? <span className="ix-tag">{l.automation.formulas.length} formula{l.automation.formulas.length === 1 ? "" : "s"}</span> : <span className="text-faint">—</span>}</td>
                <td className="text-sm" style={{ whiteSpace: "nowrap" }}>
                  {l.doc ? (
                    <>
                      {l.records.filled} filled{l.records.open ? `, ${l.records.open} open` : ""}
                      {l.records.first && (
                        <div className="text-muted" style={{ fontSize: 11 }}>
                          {formatDisplayDate(l.records.first)} – {formatDisplayDate(l.records.last)}
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
                <td className="no-print" style={{ whiteSpace: "nowrap" }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setOpen(l.key)}>
                    Details
                  </button>
                  {l.doc && <EditFormatButton doc={l.doc} compact />}{" "}
                  {l.doc && <TextLayoutButton doc={l.doc} compact />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {openLine && <FormatDetails line={openLine} draft={draft} editing={editing} onField={onField} onClose={() => setOpen(null)} />}
      {adding && (
        <AddDialog
          title="Add a format line to the index"
          fields={[
            ["formatNo", "Format No."],
            ["name", "Format name"],
            ["department", "Department"],
          ]}
          onClose={() => setAdding(false)}
          onAdd={(v) => {
            onAdd(v);
            setAdding(false);
          }}
        />
      )}
    </>
  );
}

function FormatDetails({ line, draft, editing, onField, onClose }: { line: FormatLine; draft: IndexDraft; editing: boolean; onField: (key: string, f: FormatField, v: string) => void; onClose: () => void }) {
  const fields = Object.keys(FORMAT_FIELD_LABELS) as FormatField[];
  return (
    <Modal
      title={`${line.values.formatNo} ${line.values.name}`.trim()}
      onClose={onClose}
      width={760}
      footer={
        <>
          {line.doc && <EditFormatButton doc={line.doc} />}
          {line.doc && <TextLayoutButton doc={line.doc} />}
          <button className="btn btn-primary btn-sm" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="text-sm mb-3 flex gap-2 wrap">
        <span className={modeClass(line.automation.mode)}>{line.automation.mode}</span>
        {line.automation.tags.map((t) => (
          <span key={t} className="ix-tag">
            {t}
          </span>
        ))}
      </div>
      <table className="doc-table ix-table" style={{ width: "100%" }}>
        <thead>
          <tr>
            <th>Detail</th>
            <th>Now</th>
            <th>Default</th>
            {editing && <th></th>}
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => {
            const drafted = draft.formats[line.key]?.[f];
            const value = drafted ?? line.values[f];
            const differs = value !== line.defaults[f];
            return (
              <tr key={f}>
                <td className="font-semibold">
                  {FORMAT_FIELD_LABELS[f]}
                  {line.doc && PUSHED_FORMAT_FIELDS.includes(f) && <span className="ix-pushed-mark" title="Changes the format itself">●</span>}
                </td>
                <td className={drafted !== undefined && drafted !== line.values[f] ? "ix-draft" : differs ? "ix-changed" : ""}>
                  {editing && line.editable.has(f) ? <FieldInput f={f} value={value} onChange={(v) => onField(line.key, f, v)} /> : showValue(f, value) || <span className="text-faint">—</span>}
                </td>
                <td className="text-muted">{showValue(f, line.defaults[f]) || "—"}</td>
                {editing && (
                  <td>
                    {line.editable.has(f) && differs && (
                      <button className="btn btn-ghost btn-sm" title="Back to the default" onClick={() => onField(line.key, f, line.defaults[f])}>
                        <FiRotateCcw size={12} /> Default
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {editing && (
        <div className="mt-2">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              for (const f of fields) if (line.editable.has(f) && (draft.formats[line.key]?.[f] ?? line.values[f]) !== line.defaults[f]) onField(line.key, f, line.defaults[f]);
            }}
          >
            <FiRotateCcw size={12} /> Reset this whole line to default
          </button>
        </div>
      )}
      {line.automation.formulas.length > 0 && (
        <div className="mt-3">
          <div className="font-semibold mb-1">Worked-out cells</div>
          {line.automation.formulas.map((s) => (
            <div key={s.id} className="text-sm mb-1">
              {s.cell}: <span className="ix-code">{currentFormula(s.id)}</span>
            </div>
          ))}
        </div>
      )}
      {line.doc && rangesOf(line.doc.id).length > 0 && (
        <div className="mt-3">
          <div className="font-semibold mb-1">Ranges &amp; limits</div>
          {rangesOf(line.doc.id).map((r) => (
            <div key={r.id} className="text-sm mb-1">
              {r.what}: {r.kind === "typed" ? <span className="text-muted">{r.where}</span> : r.kind === "scoreBands" ? <span className="text-muted">see Formulas, ranges &amp; automation</span> : <b>{rangeText(r, currentRange(r.id))}</b>}
            </div>
          ))}
        </div>
      )}
      {line.automation.rules.length > 0 && (
        <div className="mt-2 text-sm">
          <div className="font-semibold mb-1">Built-in rules</div>
          {line.automation.rules.map((r) => (
            <div key={r}>• {r}</div>
          ))}
        </div>
      )}
      <div className="mt-3 text-sm text-muted">
        {line.doc ? `In DCRS as "${line.doc.id}". ` : "Not in DCRS: kept on paper or in SAP. "}
        {line.onMasterList ? "On the Master List of Formats (F/SYS/02)." : line.addedInIndex ? "Added in the index." : "Not on the Master List of Formats (F/SYS/02)."}
      </div>
    </Modal>
  );
}

/**
 * EDIT THE FORMAT ITSELF, from the index (the owner, 30-Oct-2026: "make sure from indexing we can edit the format also"):
 * a sheet drawn from a layout opens in its designer, on the sheet — its columns, boxes, headings and printed lines, saved as
 * a new revision with a reason (REQUIREMENTS §62, §64); any other form opens on its page, where Edit format is.
 */
/** Text & layout: every printed word of the format editable and movable, on the format's own sheet (indexing/TextDesigner.tsx). */
function TextLayoutButton({ doc, compact = false }: { doc: DocumentDefinition; compact?: boolean }) {
  const { navigate } = useRouter();
  const changed = textEditsFor(doc.id).length;
  return (
    <button
      className="btn btn-secondary btn-sm"
      data-action="index-text-layout"
      title="Change any printed word of the format — new words, hide, bold, size, alignment — and move it on the sheet"
      onClick={() => startTextDesign(doc, navigate)}
    >
      <FiType size={12} /> {compact ? "Text" : "Text & layout"}
      {changed > 0 && <span className="ix-tag">{changed}</span>}
    </button>
  );
}

function EditFormatButton({ doc, compact = false }: { doc: DocumentDefinition; compact?: boolean }) {
  const { navigate } = useRouter();
  const grid = canDesignGrid(doc);
  return (
    <button
      className="btn btn-secondary btn-sm"
      data-action="index-edit-format"
      title={grid ? "Open the format in its designer: columns, boxes, headings, printed lines" : "Open the format's page and press Edit format there"}
      onClick={() => {
        if (grid) {
          requestDesign(doc.id);
          navigate(`/document/${doc.id}`);
        } else navigate(`/document/${doc.id}`);
      }}
    >
      {grid ? <FiEdit3 size={12} /> : <FiExternalLink size={12} />} {compact ? "Format" : grid ? "Edit the format's design" : "Open the format"}
    </button>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Documents (F/SYS/01)

function DocumentsTab({
  lines,
  draft,
  editing,
  onField,
  onAdd,
}: {
  lines: DocumentLine[];
  draft: IndexDraft;
  editing: boolean;
  onField: (key: string, f: DocumentField, v: string) => void;
  onAdd: (values: Record<string, string>) => void;
}) {
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const shown = lines.filter((l) => {
    if (!q.trim()) return true;
    const hay = Object.values(l.values).join(" ").toLowerCase();
    return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
  });
  return (
    <>
      <div className="flex gap-2 wrap items-center mb-2 no-print">
        <input className="input input-sm" style={{ width: 260 }} placeholder="Search number, description…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-sm text-muted">
          {shown.length} of {lines.length}
        </span>
        {editing && (
          <button className="btn btn-secondary btn-sm" onClick={() => setAdding(true)}>
            <FiPlus size={13} /> Add a document line
          </button>
        )}
      </div>
      <div className="ix-scroll">
        <table className="doc-table ix-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th>Sr.</th>
              {DOCUMENT_FIELDS.map((f) => (
                <th key={f}>{DOCUMENT_FIELD_LABELS[f]}</th>
              ))}
              {editing && <th></th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => (
              <tr key={l.key} data-line={l.key}>
                <td className="text-muted">{l.srNo}</td>
                {DOCUMENT_FIELDS.map((f) => {
                  const drafted = draft.documents[l.key]?.[f];
                  const value = drafted ?? l.values[f];
                  const cls = drafted !== undefined && drafted !== l.values[f] ? "ix-draft" : l.changed.has(f) ? "ix-changed" : "";
                  return (
                    <td key={f} className={cls} style={{ minWidth: f === "description" ? 280 : 110 }} title={l.changed.has(f) ? `Default: ${l.defaults[f] || "(blank)"}` : undefined}>
                      {editing ? <FieldInput f={f} value={value} onChange={(v) => onField(l.key, f, v)} /> : value}
                    </td>
                  );
                })}
                {editing && (
                  <td>
                    {DOCUMENT_FIELDS.some((f) => (draft.documents[l.key]?.[f] ?? l.values[f]) !== l.defaults[f]) && (
                      <button className="btn btn-ghost btn-sm" title="Back to the default" onClick={() => DOCUMENT_FIELDS.forEach((f) => onField(l.key, f, l.defaults[f]))}>
                        <FiRotateCcw size={12} />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {adding && (
        <AddDialog
          title="Add a document line to the index"
          fields={[
            ["documentNumber", "Document No."],
            ["description", "Description"],
            ["documentControl", "Document control"],
          ]}
          onClose={() => setAdding(false)}
          onAdd={(v) => {
            onAdd(v);
            setAdding(false);
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Formulas & automation

function FormulasTab({ lines, draft, editing, onFormula }: { lines: FormatLine[]; draft: IndexDraft; editing: boolean; onFormula: (slotId: string, expr: string | null) => void }) {
  const state = readIndexState();
  const byMode = useMemo(() => {
    const m = new Map<string, FormatLine[]>();
    for (const l of lines) m.set(l.automation.mode, [...(m.get(l.automation.mode) ?? []), l]);
    return m;
  }, [lines]);
  const [openMode, setOpenMode] = useState<string | null>(null);
  return (
    <>
      <div className="card mb-3">
        <div className="card-pad">
          <div className="font-semibold mb-2">Which formats run on their own, and which are done by hand</div>
          <table className="doc-table ix-table" style={{ width: "100%" }}>
            <tbody>
              {[
                ["Automatic", "Falls due on its own by its frequency; Mitra pre-fills the known parts (machines, people, batch from the last record); reminders go to the responsible person. Readings and signatures are always a person's."],
                ["Manual start", "As Required: nothing falls due; a person starts a record when the event happens (a complaint, a breakdown, a new supplier…)."],
                ["Reference only", "Issued documents shown as they are (licence, statements of compliance); never filled."],
                ["Not in DCRS", "On the Master List, but still kept on paper or in SAP: entirely by hand."],
              ].map(([m, what]) => (
                <tr key={m}>
                  <td style={{ width: 170 }}>
                    <span className={modeClass(m)}>{m}</span>
                  </td>
                  <td className="text-sm">{what}</td>
                  <td style={{ width: 120 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setOpenMode(openMode === m ? null : m)}>
                      {byMode.get(m)?.length ?? 0} format{(byMode.get(m)?.length ?? 0) === 1 ? "" : "s"} {openMode === m ? "▲" : "▼"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {openMode && (
            <div className="mt-2 text-sm" style={{ columns: 2 }}>
              {(byMode.get(openMode) ?? []).map((l) => (
                <div key={l.key}>
                  {l.values.formatNo} {l.values.name}
                  {l.scheduleText && l.scheduleText !== "—" ? <span className="text-muted"> — {l.scheduleText}</span> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-sm text-muted mb-3">
        A changed formula is used from the moment it is saved, for every open record of the format (they are worked out again
        at once) and every new one. A record already submitted or verified keeps the formula it was signed with. Formulas are
        written like Excel: figures named below, + − * /, comparisons, IF(…), AND(…), OR(…), ABS, ROUND, MIN, MAX.
      </p>
      {FORMULA_SLOTS.map((slot) => (
        <FormulaCard key={slot.id} slot={slot} draftExpr={draft.formulas[slot.id]} editing={editing} timeline={state.formulas[slot.id] ?? []} onFormula={onFormula} />
      ))}
    </>
  );
}

function FormulaCard({
  slot,
  draftExpr,
  editing,
  timeline,
  onFormula,
}: {
  slot: FormulaSlot;
  draftExpr: string | null | undefined;
  editing: boolean;
  timeline: { expr: string | null; since: string; by: string; version: number }[];
  onFormula: (slotId: string, expr: string | null) => void;
}) {
  const now = currentFormula(slot.id);
  const shown = draftExpr === undefined ? now : (draftExpr ?? slot.defaultExpr);
  const isDefault = now === slot.defaultExpr;
  const problem = formulaProblem(slot.id, shown);
  const [sample, setSample] = useState<Record<string, string>>(() => Object.fromEntries(slot.variables.map((v) => [v.name, String(v.sample)])));
  const tried = useMemo((): string => {
    const c = compileFormula(shown, slot.variables.map((v) => v.name));
    if (!c.ok) return "—";
    try {
      const vars: Record<string, FormulaValue> = {};
      for (const v of slot.variables) vars[v.name] = Number(sample[v.name]);
      const r = c.run(vars);
      if (typeof r === "boolean") return r ? "Yes" : "No";
      return typeof r === "number" ? String(Math.round(r * 1e6) / 1e6) : r;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }, [shown, sample, slot]);
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="card mb-3" data-formula={slot.id}>
      <div className="card-pad">
        <div className="flex justify-between wrap gap-2 mb-1">
          <div>
            <div className="font-semibold">
              {slot.cell} <span className="text-muted text-sm">— {slot.title}</span>
            </div>
            <div className="text-sm text-muted">{slot.formats}</div>
          </div>
          <div className="text-sm">
            {isDefault ? <span className="ix-tag">Default formula</span> : <span className="ix-tag ix-mode-Manual">Changed in version {timeline[timeline.length - 1]?.version}</span>}
          </div>
        </div>
        <div className="mb-2">
          {editing ? (
            <>
              <textarea className={`ix-cell-input ix-code ${draftExpr !== undefined && shown !== now ? "ix-draft" : ""}`} rows={2} value={shown} onChange={(e) => onFormula(slot.id, e.target.value)} style={{ width: "100%" }} />
              {problem && <div className="text-danger text-sm">{problem}</div>}
              <div className="flex gap-2 mt-1">
                {shown !== slot.defaultExpr && (
                  <button className="btn btn-ghost btn-sm" onClick={() => onFormula(slot.id, null)}>
                    <FiRotateCcw size={12} /> Use the default formula
                  </button>
                )}
                {draftExpr !== undefined && (
                  <button className="btn btn-ghost btn-sm" onClick={() => onFormula(slot.id, now)}>
                    <FiX size={12} /> Undo my change
                  </button>
                )}
              </div>
            </>
          ) : (
            <span className="ix-code">{now}</span>
          )}
          {!isDefault && !editing && (
            <div className="text-sm text-muted mt-1">
              Default: <span className="ix-code">{slot.defaultExpr}</span>
            </div>
          )}
        </div>
        <div className="flex gap-4 wrap text-sm">
          <div>
            <div className="text-muted">Figures</div>
            {slot.variables.map((v) => (
              <div key={v.name} className="flex items-center gap-2">
                <span className="ix-code" style={{ minWidth: 70, display: "inline-block" }}>{v.name}</span>
                <input className="ix-cell-input" style={{ width: 90, minWidth: 0 }} value={sample[v.name]} onChange={(e) => setSample((s) => ({ ...s, [v.name]: e.target.value }))} />
                <span className="text-muted">{v.meaning}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="text-muted">Result with these figures</div>
            <div className="font-semibold" style={{ fontSize: 16 }}>{tried}</div>
            <div className="text-muted">Shown on the form as: {slot.shownAs}</div>
          </div>
        </div>
        {timeline.length > 0 && (
          <div className="mt-2">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowHistory((s) => !s)}>
              Formula history ({timeline.length + 1}) {showHistory ? "▲" : "▼"}
            </button>
            {showHistory && (
              <table className="doc-table ix-table mt-1" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>In force from</th>
                    <th>Formula</th>
                    <th>Saved in</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {[...timeline].reverse().map((e, i) => (
                    <tr key={`${e.since}-${i}`}>
                      <td>{formatDisplayDateTime(e.since)}</td>
                      <td>
                        <span className="ix-code">{e.expr ?? slot.defaultExpr}</span>
                        {e.expr === null && <span className="text-muted"> (default)</span>}
                        {i === 0 && <span className="ix-tag ix-mode-Automatic" style={{ marginLeft: 6 }}>in force</span>}
                      </td>
                      <td>Version {e.version}</td>
                      <td>{e.by}</td>
                    </tr>
                  ))}
                  <tr>
                    <td>From the start</td>
                    <td>
                      <span className="ix-code">{slot.defaultExpr}</span> <span className="text-muted">(default)</span>
                    </td>
                    <td>Version 0</td>
                    <td>As issued</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Versions

function VersionsTab({ actor, hasDraft, onDone }: { actor: string; hasDraft: boolean; onDone: (msg: string) => void }) {
  const state = readIndexState();
  const [openNo, setOpenNo] = useState<number | null>(null);
  const [restore, setRestore] = useState<number | null>(null);
  const [a, setA] = useState<number>(state.versions[1]?.no ?? 0);
  const [b, setB] = useState<number>(state.versions[0]?.no ?? 0);
  const snapshotOf = (no: number): IndexSnapshot => (no === 0 ? emptySnapshot() : (state.versions.find((v) => v.no === no)?.snapshot ?? emptySnapshot()));
  const diff = useMemo(() => (a === b ? [] : compareSnapshots(snapshotOf(a), snapshotOf(b))), [a, b, state]);
  const all = [...state.versions.map((v) => v.no), 0];

  return (
    <>
      {hasDraft && <div className="auth-error mb-3">You have unsaved changes on the other tabs. Save or discard them before restoring a version.</div>}
      <div className="card mb-3">
        <div className="card-pad">
          <div className="font-semibold mb-2">Compare two versions</div>
          <div className="flex gap-2 items-center wrap mb-2 text-sm">
            <select className="input input-sm" value={a} onChange={(e) => setA(Number(e.target.value))}>
              {all.map((n) => (
                <option key={n} value={n}>
                  Version {n}
                  {n === 0 ? " (as issued)" : ""}
                </option>
              ))}
            </select>
            against
            <select className="input input-sm" value={b} onChange={(e) => setB(Number(e.target.value))}>
              {all.map((n) => (
                <option key={n} value={n}>
                  Version {n}
                  {n === 0 ? " (as issued)" : ""}
                </option>
              ))}
            </select>
            <span className="text-muted">{a === b ? "Pick two different versions." : `${diff.length} difference${diff.length === 1 ? "" : "s"}`}</span>
          </div>
          {diff.length > 0 && (
            <table className="doc-table ix-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>What</th>
                  <th>Detail</th>
                  <th>Version {a}</th>
                  <th>Version {b}</th>
                </tr>
              </thead>
              <tbody>
                {diff.map((d, i) => (
                  <tr key={i}>
                    <td>{d.what}</td>
                    <td>{d.field}</td>
                    <td className={d.field === "Formula" ? "ix-code" : ""}>{d.a || "—"}</td>
                    <td className={d.field === "Formula" ? "ix-code" : ""}>{d.b || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <table className="doc-table ix-table" style={{ width: "100%" }}>
        <thead>
          <tr>
            <th>Version</th>
            <th>Saved</th>
            <th>By</th>
            <th>What kind</th>
            <th>Reason</th>
            <th>Changes</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {state.versions.map((v, i) => (
            <React.Fragment key={v.no}>
              <tr data-version={v.no}>
                <td className="font-semibold">
                  v{v.no} {i === 0 && <span className="ix-tag ix-mode-Automatic">current</span>}
                </td>
                <td>{formatDisplayDateTime(v.at)}</td>
                <td>{v.by}</td>
                <td>{v.kind}</td>
                <td style={{ maxWidth: 320 }}>{v.reason}</td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => setOpenNo(openNo === v.no ? null : v.no)}>
                    {v.changes.length} {openNo === v.no ? "▲" : "▼"}
                  </button>
                </td>
                <td>
                  {i > 0 && (
                    <button className="btn btn-secondary btn-sm" disabled={hasDraft} onClick={() => setRestore(v.no)}>
                      <FiRotateCcw size={12} /> Restore
                    </button>
                  )}
                </td>
              </tr>
              {openNo === v.no && (
                <tr>
                  <td colSpan={7}>
                    <ChangeList changes={v.changes} />
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
          <tr>
            <td className="font-semibold">v0 {state.versions.length === 0 && <span className="ix-tag ix-mode-Automatic">current</span>}</td>
            <td colSpan={4} className="text-muted">
              As issued: every value its default (the company's F/SYS/01 and F/SYS/02 and the formats as transcribed), every formula the default.
            </td>
            <td></td>
            <td>
              {state.versions.length > 0 && (
                <button className="btn btn-secondary btn-sm" disabled={hasDraft} onClick={() => setRestore(0)}>
                  <FiRotateCcw size={12} /> Reset all to default
                </button>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      {restore !== null && (
        <ReasonDialog
          title={restore === 0 ? "Reset the whole index to its defaults" : `Restore version ${restore}`}
          body={
            restore === 0
              ? "Every value goes back to its default and every formula to the default formula. The formats' own details (number, name, revision, frequency, responsible role) go back to the issued ones. This is saved as a new version, so nothing is lost."
              : `The index, the formats' own details and the formulas go back to how they were in version ${restore}. This is saved as a new version, so nothing is lost.`
          }
          confirm={restore === 0 ? "Reset to default" : `Restore version ${restore}`}
          onClose={() => setRestore(null)}
          onConfirm={(reason) => {
            const result = restoreVersion(restore, reason, actor);
            if (!result.ok) return result.error;
            setRestore(null);
            onDone(`${restore === 0 ? "Reset to default" : `Version ${restore} restored`} as version ${result.versionNo}: ${result.changes.length} change${result.changes.length === 1 ? "" : "s"}.`);
            return null;
          }}
        />
      )}
    </>
  );
}

function ChangeList({ changes }: { changes: { label: string; field: string; before: string; after: string; area: string }[] }) {
  return (
    <table className="doc-table ix-table" style={{ width: "100%" }}>
      <thead>
        <tr>
          <th>What</th>
          <th>Detail</th>
          <th>Before</th>
          <th>After</th>
        </tr>
      </thead>
      <tbody>
        {changes.map((c, i) => (
          <tr key={i}>
            <td>{c.label}</td>
            <td>{c.field}</td>
            <td className={c.area === "formula" ? "ix-code" : "text-muted"}>{c.before || "—"}</td>
            <td className={c.area === "formula" ? "ix-code" : ""}>{c.after || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// dialogs

function SaveDialog({ draft, versionNo, onClose, onSave }: { draft: IndexDraft; versionNo: number; onClose: () => void; onSave: (reason: string) => string | null }) {
  const changes = describeDraft(draft);
  const pushed = changes.filter((c) => c.area === "format" && Object.entries(FORMAT_FIELD_LABELS).some(([f, label]) => label === c.field && PUSHED_FORMAT_FIELDS.includes(f as FormatField)));
  const formulas = changes.filter((c) => c.area === "formula");
  const ranges = changes.filter((c) => c.area === "range");
  // The open records the save would work out again at once, named before the save (the owner, 31-Oct-2026).
  const reached = formulas.length > 0 ? openRecordsUnderFormulas(draft) : [];
  const reachedTotal = reached.reduce((n, r) => n + r.count, 0);
  return (
    <ReasonDialog
      title={`Save as version ${versionNo}`}
      body={
        <>
          {(pushed.length > 0 || formulas.length > 0 || ranges.length > 0) && (
            <div className="card mb-2" style={{ borderColor: "var(--color-warning)", background: "var(--color-warning-bg)" }}>
              <div className="card-pad text-sm">
                {pushed.length > 0 && <div>• {pushed.length} change{pushed.length === 1 ? "" : "s"} to a format's own details: the format itself changes (header, revision, frequency, reminders).</div>}
                {ranges.length > 0 && <div>• {ranges.length} range{ranges.length === 1 ? "" : "s"} changed: the forms judge readings by the new range from now on (the red highlight, the printed heading, Mitra's fill). Submitted and verified records keep the range they were signed with.</div>}
                {formulas.length > 0 && <div>• {formulas.length} formula{formulas.length === 1 ? "" : "s"} changed: used from now on for open and new records; the open records are worked out again. Submitted and verified records keep the formula they were signed with.</div>}
                {reachedTotal > 0 && (
                  <div data-section="index-records-reached">
                    • <strong>Are you sure?</strong> Saving works out {reachedTotal} open record{reachedTotal === 1 ? "" : "s"} again now, each with a line in its history:{" "}
                    {reached.map((r) => `${r.label} (${r.count})`).join(", ")}.
                  </div>
                )}
              </div>
            </div>
          )}
          <div style={{ maxHeight: 300, overflow: "auto" }}>
            <ChangeList changes={changes} />
          </div>
        </>
      }
      confirm={`Save version ${versionNo}`}
      onClose={onClose}
      onConfirm={onSave}
    />
  );
}

function ReasonDialog({ title, body, confirm, onClose, onConfirm }: { title: string; body: React.ReactNode; confirm: string; onClose: () => void; onConfirm: (reason: string) => string | null }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      title={title}
      onClose={onClose}
      width={760}
      footer={
        <>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            data-action="confirm-index"
            disabled={!reason.trim()}
            onClick={() => {
              const problem = onConfirm(reason);
              if (problem) setError(problem);
            }}
          >
            {confirm}
          </button>
        </>
      }
    >
      <div className="text-sm mb-2">{body}</div>
      <label className="text-sm font-semibold">Reason (kept with the version)</label>
      <textarea className="ix-cell-input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Revised as per document change request F/SYS/03 no. 12" style={{ width: "100%" }} />
      {error && <div className="auth-error mt-2">{error}</div>}
    </Modal>
  );
}

function AddDialog({ title, fields, onClose, onAdd }: { title: string; fields: [string, string][]; onClose: () => void; onAdd: (v: Record<string, string>) => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const ready = fields.slice(0, 2).every(([k]) => (values[k] ?? "").trim());
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" disabled={!ready} onClick={() => onAdd(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()])))}>
            <FiPlus size={12} /> Add (saved with the next version)
          </button>
        </>
      }
    >
      {fields.map(([k, label]) => (
        <div key={k} className="mb-2">
          <label className="text-sm font-semibold">{label}</label>
          <input className="ix-cell-input" value={values[k] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))} />
        </div>
      ))}
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// export

function exportFormats(lines: FormatLine[]): void {
  const fields = Object.keys(FORMAT_FIELD_LABELS) as FormatField[];
  downloadCsv(`Index of formats ${new Date().toISOString().slice(0, 10)}.csv`, [
    ["Sr.", ...fields.map((f) => FORMAT_FIELD_LABELS[f]), "Automatic / manual", "How it runs", "Formulas", "Records filled", "Records open", "First record", "Last record", "Responsible people", "In DCRS as"],
    ...lines.map((l) => [
      l.srNo,
      ...fields.map((f) => l.values[f]),
      l.automation.mode,
      l.automation.tags.join("; "),
      l.automation.formulas.map((s) => `${s.cell}: ${currentFormula(s.id)}`).join("; "),
      l.records.filled,
      l.records.open,
      l.records.first,
      l.records.last,
      l.responsiblePeople,
      l.doc?.id ?? "",
    ]),
  ]);
}

function exportDocuments(lines: DocumentLine[]): void {
  downloadCsv(`Index of documents ${new Date().toISOString().slice(0, 10)}.csv`, [["Sr.", ...DOCUMENT_FIELDS.map((f) => DOCUMENT_FIELD_LABELS[f])], ...lines.map((l) => [l.srNo, ...DOCUMENT_FIELDS.map((f) => l.values[f])])]);
}

function exportFormulas(lines: FormatLine[]): void {
  const rows: (string | number)[][] = [["Formats", "Cell", "What it works out", "Formula in force", "Default formula", "Figures"]];
  for (const s of FORMULA_SLOTS) rows.push([s.formats, s.cell, s.title, currentFormula(s.id), s.defaultExpr, s.variables.map((v) => `${v.name} = ${v.meaning}`).join("; ")]);
  rows.push([]);
  rows.push(["Format No.", "Format name", "Automatic / manual", "How it runs"]);
  for (const l of lines) rows.push([l.values.formatNo, l.values.name, l.automation.mode, l.automation.tags.join("; ")]);
  downloadCsv(`Index formulas and automation ${new Date().toISOString().slice(0, 10)}.csv`, rows);
}
