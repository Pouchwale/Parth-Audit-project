import React, { useEffect, useMemo, useRef, useState } from "react";
import { FiAlertTriangle, FiArrowLeft, FiCheckCircle, FiDownload, FiInfo, FiPlus, FiPrinter, FiTrash2, FiUpload } from "react-icons/fi";
import { useAppStore } from "../store/AppStore";
import { useRouter } from "../store/router";
import { hrMasterRepository } from "../data/repositories/hrMasterRepository";
import { documentRepository } from "../data/repositories/documentRepository";
import { HR_RECORD_PAGES, hrPageForDocument } from "../data/seed/hrModule";
import { isDocumentIdVisible } from "../engine/departmentScope";
import {
  HR_MASTER_COLUMNS,
  HR_MASTER_LINKS,
  HR_MASTER_SHEET_NAME,
  gp3Key,
  hrMasterColumnLabel,
  linkedFieldLabel,
  personProblems,
  planImport,
  type ImportPlan,
} from "../engine/hrMaster";
import { NotYourDepartment } from "../components/common/NotYourDepartment";
import { Modal } from "../components/common/Modal";
import { buildXlsx, readFirstSheet, sniffSpreadsheet, SpreadsheetReadError } from "../utils/xlsx";
import { downloadBlob, parseCSV } from "../utils/csv";
import { printDocument } from "../utils/print";
import { formatDisplayDate, todayISO } from "../utils/date";
import type { HrMasterColumnKey, HrMasterPerson } from "../types";
import { useT } from "../i18n";
import { useProgressiveCount } from "../utils/useProgressive";

// HR MASTER DATA (REQUIREMENTS §53) — /hr/master-data.
//
// The Human Resources employee master sheet, laid out as the spreadsheet HR
// keeps: GP3 No., Joining Date, Full Name, Department, Designation/Position,
// Date of Birth. Every cell is written in place and saved as it is left; lines
// are added and removed; the whole sheet goes out as a real Excel workbook and
// comes back in from one (or from a CSV), shown first line by line before
// anything is changed. The HR formats that name a person fetch that person's
// details from here (engine/hrMaster.ts, components/records/HrMasterFetch.tsx).

type SortKey = HrMasterColumnKey | null;

interface PendingImport {
  fileName: string;
  plan: ImportPlan;
}

async function gridOf(file: File): Promise<string[][]> {
  const buffer = await file.arrayBuffer();
  const kind = sniffSpreadsheet(buffer);
  if (kind === "xls") throw new SpreadsheetReadError("This is an old-style .xls workbook (or a password-protected one). Save it from Excel as .xlsx, or as CSV UTF-8, and upload that.");
  if (kind === "xlsx") return (await readFirstSheet(buffer)).rows;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder("windows-1252").decode(buffer);
  }
  return parseCSV(text);
}

export function HrMasterDataPage() {
  const { version, bump, currentUser, mode } = useAppStore();
  const { navigate } = useRouter();
  const t = useT();
  const [query, setQuery] = useState(() => hrMasterRepository.takePendingFilter());
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: null, dir: 1 });
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [notesOpen, setNotesOpen] = useState<string | null>(null);
  const [removing, setRemoving] = useState<HrMasterPerson | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const people = useMemo(() => hrMasterRepository.all(), [version]);
  const visible = HR_RECORD_PAGES.some((p) => isDocumentIdVisible(p.docId));

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = people.map((person, index) => ({ person, index }));
    const filtered = q
      ? rows.filter(({ person }) =>
          HR_MASTER_COLUMNS.some((c) => {
            const v = person[c.key];
            return v.toLowerCase().includes(q) || (c.kind === "date" && v && formatDisplayDate(v).toLowerCase().includes(q));
          })
        )
      : rows;
    if (!sort.key) return filtered;
    const key = sort.key;
    return [...filtered].sort((a, b) => {
      const x = a.person[key];
      const y = b.person[key];
      if (!x && y) return 1;
      if (x && !y) return -1;
      return x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" }) * sort.dir;
    });
  }, [people, query, sort]);

  const problems = useMemo(() => {
    // Only a person whose GP3 No. is also someone else's needs the whole sheet
    // compared against them — found in one pass, not a search per person.
    const byNumber = new Map<string, number>();
    for (const p of people) {
      const k = gp3Key(p.gp3No);
      const n = /^\d+$/.test(k) ? String(Number(k)) : k;
      if (n) byNumber.set(n, (byNumber.get(n) ?? 0) + 1);
    }
    const shared = (p: HrMasterPerson) => {
      const k = gp3Key(p.gp3No);
      const n = /^\d+$/.test(k) ? String(Number(k)) : k;
      return !!n && (byNumber.get(n) ?? 0) > 1;
    };
    return new Map(people.map((p) => [p.id, personProblems(p, shared(p) ? people : [p])]));
  }, [people]);
  // A long sheet shows its first lines at once and the rest a batch at a time (utils/useProgressive.ts).
  const rowsShown = useProgressiveCount(shown.length, 30, 40);

  // A line just added gets the cursor in its GP3 No., once.
  useEffect(() => {
    if (!focusId) return;
    const box = document.querySelector(`[data-table='hr-master'] tr[data-person='${focusId}'] input[data-field='gp3No']`);
    if (box instanceof HTMLInputElement) box.focus();
    setFocusId(null);
  }, [focusId, people]);

  if (!visible) return <NotYourDepartment documentId="hr-competence" formatNo="F/HR/01" what="register" />;

  const isDemo = mode === "demo";
  const withProblems = people.filter((p) => (problems.get(p.id)?.length ?? 0) > 0).length;

  const edit = (person: HrMasterPerson, key: HrMasterColumnKey, value: string) => {
    const next = key === "joiningDate" || key === "dateOfBirth" ? value : value.replace(/\s+/g, " ").trim();
    if (next === person[key]) return;
    hrMasterRepository.update(person.id, key, next, currentUser);
    bump();
  };

  const addLine = () => {
    const person = hrMasterRepository.add({}, currentUser);
    setQuery("");
    setSort({ key: null, dir: 1 });
    setFocusId(person.id);
    setMessage(null);
    bump();
  };

  const exportSheet = () => {
    const bytes = buildXlsx(
      HR_MASTER_SHEET_NAME,
      HR_MASTER_COLUMNS.map((c) => ({ header: c.label, kind: c.kind, width: c.width })),
      people.map((p) => HR_MASTER_COLUMNS.map((c) => p[c.key]))
    );
    downloadBlob(`HR Master Data ${todayISO()}.xlsx`, new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    setMessage({ tone: "ok", text: `Downloaded the sheet as an Excel workbook — ${people.length} employee${people.length === 1 ? "" : "s"}.` });
  };

  const chooseFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setMessage(null);
    try {
      const plan = planImport(await gridOf(file), hrMasterRepository.all());
      if ("error" in plan) setMessage({ tone: "warn", text: `${file.name}: ${plan.error}` });
      else setPending({ fileName: file.name, plan });
    } catch (e) {
      setMessage({ tone: "warn", text: `${file.name}: ${e instanceof SpreadsheetReadError ? e.message : "the file could not be read as an Excel workbook or a CSV."}` });
    }
  };

  const applyImport = () => {
    if (!pending) return;
    const { added, updated } = hrMasterRepository.applyImport(pending.plan, currentUser);
    setPending(null);
    setMessage({ tone: "ok", text: `Uploaded ${pending.fileName}: ${added} employee${added === 1 ? "" : "s"} added, ${updated} updated.` });
    bump();
  };

  const toggleSort = (key: HrMasterColumnKey) =>
    setSort((s) => (s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : { key: null, dir: 1 }));

  return (
    <div className={isDemo ? "demo-watermark" : ""} data-page="hr-master-data">
      <div className="flex items-center justify-between mb-1 wrap gap-3">
        <div>
          <div className="text-xs text-muted mb-1" data-crumb>
            HR Records · Master Data
          </div>
          <h1 className="text-2xl mb-1">{t("nav.hrMasterData")}</h1>
        </div>
        <div className="flex gap-2 wrap">
          <button className="btn btn-primary btn-sm" data-action="hr-master-add" onClick={addLine}>
            <FiPlus size={12} /> Add employee
          </button>
          <button className="btn btn-secondary btn-sm" data-action="hr-master-export" onClick={exportSheet}>
            <FiDownload size={12} /> Download Excel
          </button>
          <button className="btn btn-secondary btn-sm" data-action="hr-master-import" onClick={() => fileRef.current?.click()}>
            <FiUpload size={12} /> Upload Excel / CSV
          </button>
          <input
            ref={fileRef}
            type="file"
            data-field="hr-master-file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            style={{ display: "none" }}
            onChange={(e) => void chooseFile(e.target.files?.[0])}
          />
          <button className="btn btn-secondary btn-sm" data-action="hr-master-print" onClick={() => printDocument(sheetRef.current)}>
            <FiPrinter size={12} /> Print
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate("/hr")}>
            <FiArrowLeft size={12} /> All HR records
          </button>
        </div>
      </div>
      <p className="text-muted mb-4">
        Human Resources' employee master sheet — one line per employee: GP3 No., Joining Date, Full Name, Department, Designation/Position and Date of Birth.
        The HR formats that name a person fetch that person's details from here, so they are written once. Type in any cell (it is saved when you leave it),
        or download the sheet to Excel and upload it back. It is the same sheet in Live and Demo mode.
      </p>

      <div className="flex gap-3 wrap mb-4">
        <div className="stat-tile">
          <div className="stat-value" data-stat="people">
            {people.length}
          </div>
          <div className="stat-label">Employees on the sheet</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value" data-stat="no-gp3">
            {people.filter((p) => !p.gp3No.trim()).length}
          </div>
          <div className="stat-label">Without a GP3 No.</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value" data-stat="no-dob">
            {people.filter((p) => !p.dateOfBirth).length}
          </div>
          <div className="stat-label">Without a Date of Birth</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value" data-stat="to-confirm">
            {people.filter((p) => p.notes?.length).length}
          </div>
          <div className="stat-label">Lines with a note to confirm</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value" data-stat="problems" style={withProblems ? { color: "var(--color-danger)" } : undefined}>
            {withProblems}
          </div>
          <div className="stat-label">Lines needing a correction</div>
        </div>
      </div>

      {message && (
        <div
          className="card mb-3"
          data-state={message.tone === "ok" ? "hr-master-done" : "hr-master-error"}
          style={message.tone === "ok" ? { borderColor: "var(--color-success)", background: "var(--color-success-bg)" } : { borderColor: "var(--color-danger)", background: "var(--color-danger-bg)" }}
        >
          <div className="card-pad text-sm">
            {message.tone === "ok" ? <FiCheckCircle size={13} style={{ verticalAlign: -2 }} /> : <FiAlertTriangle size={13} style={{ verticalAlign: -2 }} />} {message.text}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 wrap mb-2">
        <input
          className="input input-sm"
          style={{ maxWidth: 360 }}
          data-field="hr-master-search"
          placeholder="Search by GP3 No., name, department, designation…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="text-sm text-muted" data-state="hr-master-count">
          {shown.length === people.length ? `${people.length} employees` : `${shown.length} of ${people.length} employees`}
        </span>
      </div>

      <div ref={sheetRef} data-print-doc>
        <div className="doc-table" style={{ overflowX: "auto" }}>
          <table className="compact" data-table="hr-master">
            <thead>
              <tr>
                <th style={{ width: 44 }}>#</th>
                {HR_MASTER_COLUMNS.map((c) => (
                  <th key={c.key} style={{ minWidth: c.kind === "date" ? 150 : c.key === "fullName" ? 230 : 150 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ padding: "0 2px", fontWeight: 600 }}
                      data-sort={c.key}
                      onClick={() => toggleSort(c.key)}
                      title="Sort by this column"
                    >
                      {c.label}
                      {sort.key === c.key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                    </button>
                    <span className="print-only">{c.label}</span>
                  </th>
                ))}
                <th className="no-print" style={{ width: 70 }}></th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={HR_MASTER_COLUMNS.length + 2} className="text-muted text-center" style={{ padding: 16 }}>
                    {people.length === 0 ? "No employees on the sheet yet — add one, or upload the sheet from Excel." : "No employee matches the search."}
                  </td>
                </tr>
              )}
              {shown.slice(0, rowsShown).map(({ person, index }) => {
                const issues = problems.get(person.id) ?? [];
                return (
                  <React.Fragment key={person.id}>
                    <tr data-person={person.id} data-problems={issues.length}>
                      <td className="text-muted">{index + 1}</td>
                      {HR_MASTER_COLUMNS.map((c) => {
                        const issue = issues.find((i) => i.field === c.key);
                        return (
                          <td key={c.key} className={issue ? "cell-out-of-band" : ""} title={issue?.message}>
                            <input
                              // Keyed by what is saved, so an upload shows in the cell; a cell being typed in keeps its place.
                              key={`${c.key}:${person[c.key]}`}
                              className="input input-sm"
                              data-field={c.key}
                              type={c.kind === "date" ? "date" : "text"}
                              defaultValue={person[c.key]}
                              aria-label={`${c.label}${person.fullName ? ` — ${person.fullName}` : ""}`}
                              onBlur={(e) => edit(person, c.key, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              }}
                            />
                          </td>
                        );
                      })}
                      <td className="no-print" style={{ whiteSpace: "nowrap" }}>
                        {(person.notes?.length || person.sources?.length) && (
                          <button
                            className="btn btn-ghost btn-sm btn-icon"
                            data-action="hr-master-notes"
                            title={person.notes?.length ? "Notes to confirm" : "Where this line came from"}
                            style={person.notes?.length ? { color: "var(--color-warning)" } : undefined}
                            onClick={() => setNotesOpen((open) => (open === person.id ? null : person.id))}
                          >
                            {person.notes?.length ? <FiAlertTriangle size={13} /> : <FiInfo size={13} />}
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm btn-icon" data-action="hr-master-delete" title="Remove from the sheet" onClick={() => setRemoving(person)}>
                          <FiTrash2 size={13} />
                        </button>
                      </td>
                    </tr>
                    {(notesOpen === person.id || issues.length > 0) && (
                      <tr className="no-print" data-notes-for={person.id}>
                        <td></td>
                        <td colSpan={HR_MASTER_COLUMNS.length + 1} className="text-xs" style={{ whiteSpace: "normal" }}>
                          {issues.map((i) => (
                            <div key={i.field + i.message} style={{ color: "var(--color-danger)" }}>
                              <FiAlertTriangle size={11} style={{ verticalAlign: -1 }} /> {i.message}
                            </div>
                          ))}
                          {notesOpen === person.id && (
                            <>
                              {person.notes?.map((n) => (
                                <div key={n} className="tbc">
                                  {n}
                                </div>
                              ))}
                              {person.sources?.length ? <div className="text-muted">Put on the sheet from {person.sources.join(" and ")}.</div> : null}
                            </>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mt-4" data-section="hr-master-links">
        <div className="card-header">
          <h3 className="text-base font-semibold">Fetched by these HR formats</h3>
          <span className="badge badge-Due">{HR_MASTER_LINKS.length} formats</span>
        </div>
        <div className="card-pad text-sm">
          <p className="text-muted mb-2">
            On a record of any of these, pick the person by GP3 No. or name and their details are filled in — blank boxes straight away, anything already written
            only if you say so. A register line whose name is on the sheet can have its blanks filled in one go. What a record fetched stays on it if the sheet
            changes later.
          </p>
          <div className="doc-table">
            <table className="compact">
              <thead>
                <tr>
                  <th>Format</th>
                  <th>Fills</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {HR_MASTER_LINKS.map((link) => {
                  const doc = documentRepository.getById(link.docId);
                  const page = hrPageForDocument(link.docId);
                  if (!doc) return null;
                  return (
                    <tr key={link.docId} data-linked-doc={link.docId}>
                      <td>
                        <div className="font-semibold">{doc.name}</div>
                        <div className="text-xs text-faint">
                          {doc.formatNo} · {link.where === "header" ? "one person per record" : "a line per person"}
                        </div>
                      </td>
                      <td className="text-xs">{link.fields.map((f) => linkedFieldLabel(link.docId, f)).join(" · ")}</td>
                      <td style={{ textAlign: "right" }}>
                        {page && (
                          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/hr/${page.slug}`)}>
                            Open
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {removing && (
        <Modal
          title="Remove from HR Master Data"
          onClose={() => setRemoving(null)}
          footer={
            <div className="flex justify-end gap-2" style={{ width: "100%" }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setRemoving(null)}>
                Keep
              </button>
              <button
                className="btn btn-danger btn-sm"
                data-action="hr-master-confirm-delete"
                onClick={() => {
                  hrMasterRepository.remove(removing.id);
                  setMessage({ tone: "ok", text: `${removing.fullName || "The line"} was removed from the sheet.` });
                  setRemoving(null);
                  bump();
                }}
              >
                Remove
              </button>
            </div>
          }
        >
          <p className="text-sm">
            Remove <strong>{removing.fullName || "this line"}</strong>
            {removing.gp3No ? ` (GP3 No. ${removing.gp3No})` : ""} from the sheet? Records that already carry their details keep them.
          </p>
        </Modal>
      )}

      {pending && <ImportPreview pending={pending} onCancel={() => setPending(null)} onApply={applyImport} />}
    </div>
  );
}

function ImportPreview({ pending, onCancel, onApply }: { pending: PendingImport; onCancel: () => void; onApply: () => void }) {
  const { plan } = pending;
  const nothing = plan.additions.length === 0 && plan.updates.length === 0;
  const missing = HR_MASTER_COLUMNS.filter((c) => !plan.columns.includes(c.key)).map((c) => c.label);
  return (
    <Modal
      title={`Upload ${pending.fileName}`}
      onClose={onCancel}
      width={820}
      footer={
        <div className="flex justify-end gap-2" style={{ width: "100%" }}>
          <button className="btn btn-secondary btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" data-action="hr-master-apply-import" disabled={nothing} onClick={onApply}>
            {nothing ? "Nothing to change" : `Add ${plan.additions.length}, update ${plan.updates.length}`}
          </button>
        </div>
      }
    >
      <div data-section="hr-master-import-preview">
        <p className="text-sm mb-2" data-state="import-summary">
          Headings found on line {plan.headerLine}.{" "}
          <strong data-count="additions">{plan.additions.length}</strong> to add, <strong data-count="updates">{plan.updates.length}</strong> to update,{" "}
          <strong data-count="unchanged">{plan.unchanged}</strong> already the same, <strong data-count="skipped">{plan.skipped.length}</strong> left out. Nothing
          changes until you press the button below.
        </p>
        {missing.length > 0 && <p className="text-sm tbc mb-2">The file has no column for {missing.join(", ")} — those stay as they are on the sheet.</p>}
        {plan.notes.map((n) => (
          <p key={n} className="text-sm tbc mb-2" data-state="import-note">
            {n}
          </p>
        ))}
        <p className="text-xs text-muted mb-3">A line is matched to the sheet by its GP3 No., or by its Full Name when it has none; a blank cell in the file leaves what the sheet has.</p>

        {plan.updates.length > 0 && (
          <>
            <h4 className="text-sm font-semibold mb-1">To update</h4>
            <div className="doc-table mb-3">
              <table className="compact" data-table="import-updates">
                <tbody>
                  {plan.updates.map((u) => (
                    <tr key={u.personId}>
                      <td className="text-muted">Line {u.line}</td>
                      <td className="font-semibold">{u.fullName}</td>
                      <td className="text-xs" style={{ whiteSpace: "normal" }}>
                        {u.changes.map((c) => (
                          <div key={c.key}>
                            {hrMasterColumnLabel(c.key)}: {c.before ? `“${c.key === "joiningDate" || c.key === "dateOfBirth" ? formatDisplayDate(c.before) : c.before}”` : "blank"} → “
                            {c.key === "joiningDate" || c.key === "dateOfBirth" ? formatDisplayDate(c.after) : c.after}”
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {plan.additions.length > 0 && (
          <>
            <h4 className="text-sm font-semibold mb-1">To add</h4>
            <div className="doc-table mb-3" style={{ overflowX: "auto" }}>
              <table className="compact" data-table="import-additions">
                <thead>
                  <tr>
                    <th>Line</th>
                    {HR_MASTER_COLUMNS.map((c) => (
                      <th key={c.key}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plan.additions.map((a) => (
                    <tr key={a.line}>
                      <td className="text-muted">{a.line}</td>
                      {HR_MASTER_COLUMNS.map((c) => (
                        <td key={c.key}>{c.kind === "date" && a.values[c.key] ? formatDisplayDate(a.values[c.key]) : a.values[c.key]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {(plan.skipped.length > 0 || plan.warnings.length > 0) && (
          <>
            <h4 className="text-sm font-semibold mb-1">Left out</h4>
            <ul className="text-sm" data-list="import-left-out">
              {plan.skipped.map((s) => (
                <li key={`s${s.line}`}>
                  Line {s.line}: {s.reason}
                </li>
              ))}
              {plan.warnings.map((w, i) => (
                <li key={`w${w.line}-${i}`}>
                  Line {w.line}: {w.message}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
