import React, { useState } from "react";
import { FiArrowLeft, FiShield } from "react-icons/fi";
import { useRouter } from "../store/router";
import { useAppStore } from "../store/AppStore";
import { useSetAssistantTarget } from "../store/AssistantContext";
import { documentRepository } from "../data/repositories/documentRepository";
import { complianceValidUntil, type ComplianceSection, type ComplianceStatement } from "../data/seed/complianceStatements";
import { allComplianceStatements, complianceStatement, referenceRepository } from "../data/repositories/referenceRepository";
import { ReferenceEditBar } from "../components/documents/ReferenceEditBar";
import { NotYourDepartment } from "../components/common/NotYourDepartment";
import { formatDisplayDate, todayISO } from "../utils/date";
import { printDocument } from "../utils/print";
import { DownloadDocumentButton } from "../components/common/DownloadDocumentButton";
import { useT } from "../i18n";

function validityBadge(validUntil: string) {
  const today = todayISO();
  const daysLeft = Math.round((Date.parse(validUntil) - Date.parse(today)) / 86400000);
  if (daysLeft < 0) return <span className="badge badge-Overdue">Expired {-daysLeft} days ago</span>;
  if (daysLeft <= 90) return <span className="badge badge-PendingVerification">Re-issue due in {daysLeft} days</span>;
  return <span className="badge badge-Verified">Valid — {daysLeft} days left</span>;
}

export function ComplianceListPage() {
  const t = useT();
  const { navigate } = useRouter();
  const issued = allComplianceStatements();
  // Both Statements of Compliance are Quality Control's own formats (F/QC-09
  // and F/QC-38), so a statement whose document is outside the viewer's
  // departments must not be listed at all — a row naming it, with an
  // "Open / Edit" button, is already more than they may see (REQUIREMENTS
  // §40). When that leaves nothing we show the refusal rather than an empty
  // table, because the only reason the list can be empty is the viewer's
  // department, and the refusal is what says whose documents these are and
  // how to be given them.
  const statements = issued.filter((s) => documentRepository.getById(s.documentId));
  if (statements.length === 0 && issued.length > 0) return <NotYourDepartment documentId={issued[0].documentId} what="document" />;

  return (
    <div>
      <h1 className="text-2xl mb-1">{t("soc.title")}</h1>
      <p className="text-muted mb-4">
        Declarations of Compliance issued to customers. Each is valid for two years from the date of publication — the assistant reminds you 90 days
        before a re-issue is due.
      </p>
      <div className="doc-table">
        <table>
          <thead>
            <tr>
              <th>Document</th>
              <th>Format / Rev</th>
              <th>Signed</th>
              <th>Valid until</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {statements.map((s) => {
              const doc = documentRepository.getById(s.documentId);
              const validUntil = complianceValidUntil(s);
              return (
                <tr key={s.documentId} className="card-clickable" onClick={() => navigate(`/soc/${s.documentId}`)}>
                  <td className="font-semibold">{doc?.name ?? s.headerTitle}</td>
                  <td className="text-sm">{s.footerRef}</td>
                  <td className="text-sm">
                    {formatDisplayDate(s.signedOn)} — {s.signedBy} ({s.signedTitle})
                  </td>
                  <td className="text-sm">{formatDisplayDate(validUntil)}</td>
                  <td>{validityBadge(validUntil)}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-ghost btn-sm">Open / Edit</button>
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

// Blank lines left while typing are dropped when a correction is saved.
function tidy(s: ComplianceStatement): ComplianceStatement {
  return {
    ...s,
    sections: (s.sections ?? []).map((sec) => ({ ...sec, lines: (sec.lines ?? []).map((l) => l.trimEnd()).filter((l) => l.trim() !== "") })),
    declarations: (s.declarations ?? []).map((d) => d.trim()).filter(Boolean),
  };
}

export function ComplianceDetailPage({ documentId }: { documentId: string }) {
  const { navigate } = useRouter();
  const { currentUser, bump } = useAppStore();
  // The statement being corrected, while Edit is on; null otherwise.
  const [draft, setDraft] = useState<ComplianceStatement | null>(null);
  const current = complianceStatement(documentId);
  const doc = documentRepository.getById(documentId);
  const editing = draft !== null;
  const s = draft ?? current;

  const save = (next: ComplianceStatement) => {
    referenceRepository.save(documentId, tidy(next), currentUser);
    setDraft(null);
    bump();
  };

  // The assistant can correct a statement too — "signed by Shail Patel on 1
  // April 2026" — through the same checked-and-listed path as a record.
  useSetAssistantTarget(
    current && doc
      ? {
          documentKind: "reference",
          documentId,
          recordId: documentId,
          status: "In Progress",
          editable: true,
          currentData: current,
          getData: () => complianceStatement(documentId),
          commit: (next) => save(next as ComplianceStatement),
        }
      : null
  );

  if (!current || !s) {
    return (
      <div className="empty-state">
        <h2 className="text-xl mb-2">Statement not found</h2>
        <button className="btn btn-secondary" onClick={() => navigate("/soc")}>
          <FiArrowLeft size={13} /> Back
        </button>
      </div>
    );
  }

  // The statement exists but its document belongs to Quality Control, so
  // somebody outside QC who reaches /soc/<id> by an old bookmark or a link is
  // told whose document it is instead of being shown the statement itself and
  // an Edit bar they must not use (REQUIREMENTS §40). It is kept apart from
  // the "Statement not found" return above so an address that names no
  // statement still reads as a wrong address, not as another department's.
  // Both returns sit below every hook, the assistant target included, so the
  // order of hooks never changes between renders.
  if (!doc) return <NotYourDepartment documentId={documentId} what="document" />;
  const edited = referenceRepository.get<ComplianceStatement>(documentId);
  const validUntil = complianceValidUntil(s);
  const patch = (p: Partial<ComplianceStatement>) => setDraft({ ...s, ...p });
  const setSection = (i: number, p: Partial<ComplianceSection>) => patch({ sections: s.sections.map((sec, idx) => (idx === i ? { ...sec, ...p } : sec)) });

  return (
    <div data-print-doc>
      <div className="flex items-center justify-between mb-3 no-print wrap gap-2">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate("/soc")}>
          <FiArrowLeft size={13} /> Back to Statements
        </button>
        <div className="flex items-center gap-2 wrap">
          {validityBadge(validUntil)}
          <ReferenceEditBar
            editing={editing}
            edited={edited}
            onEdit={() => setDraft(current)}
            onSave={() => draft && save(draft)}
            onCancel={() => setDraft(null)}
            onRestore={() => {
              referenceRepository.reset(documentId);
              bump();
            }}
            onPrint={() => printDocument()}
            download={<DownloadDocumentButton doc={doc} />}
          />
        </div>
      </div>

      <div className="doc-header notranslate" translate="no">
        <div className="company-name">GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED</div>
        <div className="doc-title">
          {editing ? <input className="input input-sm" data-field="soc-title" value={s.headerTitle} onChange={(e) => patch({ headerTitle: e.target.value })} /> : s.headerTitle}
        </div>
        <div className="meta-row">
          <div className="meta-cell">
            <span className="k">Format / Rev</span>
            {editing ? <input className="input input-sm" value={s.footerRef} onChange={(e) => patch({ footerRef: e.target.value })} /> : <span className="v">{s.footerRef}</span>}
          </div>
          <div className="meta-cell">
            <span className="k">Date of publication</span>
            {editing ? (
              <input type="date" className="input input-sm" value={s.signedOn} onChange={(e) => e.target.value && patch({ signedOn: e.target.value })} />
            ) : (
              <span className="v">{formatDisplayDate(s.signedOn)}</span>
            )}
          </div>
          <div className="meta-cell">
            <span className="k">Valid until</span>
            <span className="v">{formatDisplayDate(validUntil)}</span>
          </div>
          {(s.referenceSource || editing) && (
            <div className="meta-cell" style={{ flex: 2 }}>
              <span className="k">Reference source</span>
              {editing ? (
                <input className="input input-sm" value={s.referenceSource ?? ""} onChange={(e) => patch({ referenceSource: e.target.value })} />
              ) : (
                <span className="v">{s.referenceSource}</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="doc-table mt-4 notranslate" translate="no">
        <table>
          <tbody>
            {s.sections.map((sec, i) => (
              <tr key={i}>
                <td className="font-semibold text-sm" style={{ width: 220, verticalAlign: "top", background: "var(--color-surface-alt)" }}>
                  {editing ? <input className="input input-sm" value={sec.label} onChange={(e) => setSection(i, { label: e.target.value })} /> : sec.label}
                </td>
                <td className="text-sm">
                  {editing ? (
                    <textarea
                      className="input"
                      data-field="soc-lines"
                      rows={Math.max(2, sec.lines.length)}
                      value={sec.lines.join("\n")}
                      onChange={(e) => setSection(i, { lines: e.target.value.split("\n") })}
                    />
                  ) : (
                    sec.lines.map((l, li) => (
                      <div key={li} className={li > 0 ? "mt-1" : ""}>
                        {l}
                      </div>
                    ))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card mt-4">
        <div className="card-header">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <FiShield size={14} /> Declarations
          </h3>
        </div>
        <div className="card-pad">
          {s.declarations.map((d, i) =>
            editing ? (
              <textarea
                key={i}
                className="input mb-2"
                rows={3}
                value={d}
                onChange={(e) => patch({ declarations: s.declarations.map((x, xi) => (xi === i ? e.target.value : x)) })}
              />
            ) : (
              <p key={i} className={`text-sm ${i < s.declarations.length - 1 ? "mb-2" : ""}`}>
                {d}
              </p>
            )
          )}
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-pad text-sm">
          <div>Signed</div>
          <div className="mt-3" style={{ borderTop: "1px solid var(--color-border-strong)", width: 220 }} />
          {editing ? (
            <div className="flex gap-2 wrap mt-1">
              <input className="input input-sm" style={{ maxWidth: 220 }} placeholder="Signed by" value={s.signedBy} onChange={(e) => patch({ signedBy: e.target.value })} />
              <input className="input input-sm" style={{ maxWidth: 220 }} placeholder="Title" value={s.signedTitle} onChange={(e) => patch({ signedTitle: e.target.value })} />
            </div>
          ) : (
            <>
              <div className="font-semibold mt-1">{s.signedBy}</div>
              <div className="text-muted">({s.signedTitle})</div>
            </>
          )}
          <div className="text-muted mt-1">{formatDisplayDate(s.signedOn)}</div>
        </div>
      </div>
      <div className="text-xs text-faint mt-3 no-print">Source: {doc.sourceFile}</div>
    </div>
  );
}
