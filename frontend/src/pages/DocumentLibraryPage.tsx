import React, { useState } from "react";
import { FiChevronDown, FiChevronUp, FiEdit3, FiExternalLink, FiPlus, FiSearch, FiTrash2, FiX } from "react-icons/fi";
import { FormatEditor } from "../components/documents/FormatEditor";
import { documentRepository } from "../data/repositories/documentRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { useRouter } from "../store/router";
import { getDocumentInfo } from "../engine/documentInfo";
import { formatDisplayDate, todayISO } from "../utils/date";
import { useAppStore } from "../store/AppStore";
import { createRecordForDocument, deletionLog } from "../engine/recordCrud";
import type { DocumentDefinition } from "../types";
import { moduleSlug } from "../utils/moduleSlug";
import { useT } from "../i18n";
import { MODULE_SECTIONS } from "../data/seed/documentDefinitions";
import { routeForRecord } from "../engine/reminders";
import { departmentScopeLabel, isDocumentIdVisible } from "../engine/departmentScope";
import { documentOpenRoute } from "../engine/documentRoutes";
import { documentTextIn } from "../i18n/documentText";


// Which documents hold records at all: the reference ones — the Chemical
// Master, a Statement of Compliance, the licence — are single
// documents kept as issued, edited in place, so there is nothing to create or
// delete for them (they have their own Edit / Cancel on the page).
const RECORDABLE_KINDS = new Set([
  "daily-pest-monitoring",
  "fly-catcher",
  "service-report",
  "log-sheet",
  "gap-inspection",
  "complaint-checklist",
  "complaint-ack",
  "training-record",
  "pest-responsibilities",
  "service-agreement",
]);

// Within a module, documents are listed in the order of their sections (the
// department's own grouping — see DocumentDefinition.section), each section
// named on a row of its own above its documents; documents without a section
// keep their seed order after any sectioned ones.
const SECTION_ORDER: readonly string[] = MODULE_SECTIONS;
const sectionRank = (section: string | undefined) => {
  const i = section ? SECTION_ORDER.indexOf(section) : -1;
  return i === -1 ? SECTION_ORDER.length : i;
};

export function DocumentLibraryPage({ moduleSlug: activeSlug }: { moduleSlug?: string }) {
  const t = useT();
  const { navigate } = useRouter();
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { mode, bump, version, lang, currentUser } = useAppStore();
  const [editingFormat, setEditingFormat] = useState<DocumentDefinition | null>(null);
  const isDemo = mode === "demo";
  const docs = documentRepository.getAll();
  const master = masterRepository.get();
  // The deletion log is kept in its own store (engine/recordCrud.ts), so
  // nothing has filtered it by department: unfiltered, it would name another
  // department's documents, dates and reasons on this page (REQUIREMENTS
  // §40). The scope only changes at sign-in, so it needs no extra dependency
  // here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const deletions = React.useMemo(() => deletionLog(isDemo).filter((d) => isDocumentIdVisible(d.documentId)), [isDemo, version]);

  // CREATE: a record for this document, dated today — or the one that already
  // covers today, since a controlled register must not hold two sheets for one
  // day (engine/recordCrud.ts).
  const startRecord = (doc: DocumentDefinition) => {
    const { record } = createRecordForDocument(doc, { dateISO: todayISO(), isDemo });
    bump();
    // Opened where the module's own pages open it (engine/reminders.ts).
    navigate(routeForRecord(doc, record.id));
  };

  const activeModule = activeSlug ? docs.find((d) => moduleSlug(d.module) === activeSlug)?.module : undefined;
  // A slug that matches no real module (a stale/bad deep link) must show
  // nothing, not silently fall through to the unfiltered list — otherwise
  // the "Filtered to: {slug}" badge below would be showing next to the full
  // library, implying a filter that isn't actually applied.
  const activeSlugIsUnknown = !!activeSlug && !activeModule;

  const needle = query.trim().toLowerCase();
  const filtered = docs.filter((d) => {
    if (activeSlugIsUnknown) return false;
    if (activeModule && d.module !== activeModule) return false;
    if (!needle) return true;
    const info = getDocumentInfo(d, master);
    const haystack = [d.name, d.formatNo, d.department, d.module, d.frequency, info.whoLabel].join(" ").toLowerCase();
    return haystack.includes(needle);
  });

  const byModule = new Map<string, typeof docs>();
  for (const d of filtered) {
    const arr = byModule.get(d.module) ?? [];
    arr.push(d);
    byModule.set(d.module, arr);
  }
  for (const [module, list] of byModule) byModule.set(module, list.slice().sort((a, b) => sectionRank(a.section) - sectionRank(b.section)));

  return (
    <div>
      {editingFormat && (
        <FormatEditor
          doc={editingFormat}
          actor={currentUser}
          onClose={() => setEditingFormat(null)}
          onSaved={() => {
            setEditingFormat(null);
            bump();
          }}
        />
      )}
      <h1 className="text-2xl mb-1">{t("lib.title")}</h1>
      <p className="text-muted mb-4">
        Every controlled document identified from the uploaded source files. {docs.length} documents configured — click
        a row for the full What / How / Who / When summary.
      </p>

      {activeSlug && (
        <div className="flex items-center gap-2 mb-3">
          <span className="badge badge-Verified">
            Filtered to: {activeModule ?? activeSlug}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate("/library")}>
            <FiX size={11} /> Clear filter
          </button>
        </div>
      )}

      <div style={{ position: "relative", maxWidth: 420 }} className="mb-5">
        <FiSearch
          size={14}
          style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-faint)" }}
        />
        <input
          className="input"
          style={{ paddingLeft: 32, width: "100%" }}
          placeholder="Search by name, format no., department, or responsible person…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {byModule.size === 0 && (
        <div className="empty-state">
          {/* An empty library because of the department scope is not a failed
              search, and must not be reported as one (REQUIREMENTS §40): a
              person shown "No documents match" would go looking for lost
              documents that are simply somebody else's. */}
          {docs.length === 0
            ? `Your account covers ${departmentScopeLabel()}, and no document on the Master List of Formats & Records is assigned to it — ask the system administrator to add a department to your account (Master Data → Departments & access).`
            : `No documents match "${query || activeSlug}".`}
        </div>
      )}

      {Array.from(byModule.entries()).map(([module, list]) => (
        <div key={module} className="mb-6">
          <h3 className="text-sm uppercase text-muted mb-2">{module}</h3>
          <div className="doc-table">
            <table>
              <thead>
                <tr>
                  <th>Document Name</th>
                  <th>Format No.</th>
                  <th>Responsible (Who)</th>
                  <th>Frequency (When)</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((d, i) => {
                  const info = getDocumentInfo(d, master);
                  const isOpen = expandedId === d.id;
                  // A module that shelves its documents by section prints the
                  // section's name above its first document.
                  const sectionStart = !!d.section && (i === 0 || list[i - 1].section !== d.section);
                  return (
                    <React.Fragment key={d.id}>
                      {sectionStart && (
                        <tr className="doc-section-row" data-section={d.section}>
                          <td colSpan={6}>{d.section}</td>
                        </tr>
                      )}
                      <tr className="card-clickable" onClick={() => setExpandedId(isOpen ? null : d.id)}>
                        <td>
                          <div className="flex items-center gap-2 wrap">
                            {isOpen ? <FiChevronUp size={12} /> : <FiChevronDown size={12} />}
                            {/* A format issued in Gujarati is listed in the chosen language (REQUIREMENTS §58). */}
                            <span className="font-semibold">{documentTextIn(d.name, lang)}</span>
                            {d.section && <span className="text-xs text-faint">· {d.section}</span>}
                          </div>
                        </td>
                        <td className={d.formatNo === "TO BE CONFIRMED" ? "tbc" : ""}>
                          {d.formatNo}
                          {d.revisionNo && d.revisionNo !== "TO BE CONFIRMED" ? ` (Rev ${d.revisionNo})` : ""}
                        </td>
                        <td className="text-sm">{info.whoLabel}</td>
                        <td>
                          <span className="badge badge-Due">{d.frequency}</span>
                        </td>
                        <td>
                          <span className="badge badge-Verified">{d.status}</span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div className="flex items-center justify-end gap-2 wrap">
                            {/* CREATE, for every document that holds records —
                                the same starting data the schedule would give
                                it (engine/recordCrud.ts). */}
                            {RECORDABLE_KINDS.has(d.kind) && (
                              <button
                                className="btn btn-primary btn-sm"
                                data-action="new-record"
                                data-document={d.id}
                                title={`Start a ${d.name} for today`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startRecord(d);
                                }}
                              >
                                <FiPlus size={12} /> New
                              </button>
                            )}
                            {/* EDIT FORMAT: every document's, from here (REQUIREMENTS §62). */}
                            <button
                              className="btn btn-ghost btn-sm"
                              data-action="edit-format"
                              data-document={d.id}
                              title={`Edit the format — now Rev ${d.revisionNo}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingFormat(d);
                              }}
                            >
                              <FiEdit3 size={12} />
                            </button>
                            {/* OPEN: the document's own page — never the Record
                                Calendar (engine/documentRoutes.ts, REQUIREMENTS §47). */}
                            <button
                              className="btn btn-secondary btn-sm"
                              data-action="open-document"
                              data-document={d.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(documentOpenRoute(d));
                              }}
                            >
                              Open Document <FiExternalLink size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="no-print">
                          <td colSpan={6} style={{ background: "var(--color-surface-alt)" }}>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                                gap: 16,
                                padding: "14px 6px",
                              }}
                            >
                              <div>
                                <div className="text-xs text-muted font-semibold">WHAT</div>
                                <div className="text-sm">{info.what}</div>
                              </div>
                              <div>
                                <div className="text-xs text-muted font-semibold">HOW</div>
                                <div className="text-sm">{info.how}</div>
                              </div>
                              <div>
                                <div className="text-xs text-muted font-semibold">WHO</div>
                                <div className="text-sm">{info.whoLabel}</div>
                              </div>
                              <div>
                                <div className="text-xs text-muted font-semibold">WHEN</div>
                                <div className="text-sm">{info.when}</div>
                              </div>
                            </div>
                            <div className="text-xs text-faint" style={{ padding: "0 6px 10px" }}>
                              Department: {d.department}
                              {d.revisionDate ? ` · Revision date: ${formatDisplayDate(d.revisionDate)}` : ""}
                            </div>
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
      ))}

      {/* DELETE leaves a trail: a record can be removed whatever its status,
          and what it was stays here (engine/recordCrud.ts). */}
      {deletions.length > 0 && (
        <details className="card mt-4 no-print" data-section="deleted-records">
          <summary className="record-history-summary">
            <span className="text-base font-semibold">
              <FiTrash2 size={14} style={{ verticalAlign: -2 }} /> Records deleted ({deletions.length})
            </span>
            <span className="text-xs text-muted">what was removed, by whom, when and why</span>
          </summary>
          <div className="doc-table">
            <table className="compact">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Dated</th>
                  <th>Status when deleted</th>
                  <th>Deleted by</th>
                  <th>When</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {deletions.map((d) => (
                  <tr key={d.id} data-deleted-record={d.recordId}>
                    <td>{d.documentName}</td>
                    <td>{formatDisplayDate(d.dueDate)}</td>
                    <td>
                      <span className="badge badge-Rejected">{d.status}</span>
                    </td>
                    <td translate="no">{d.deletedBy}</td>
                    <td className="text-sm">{new Date(d.deletedAt).toLocaleString()}</td>
                    <td className="text-sm">{d.reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
