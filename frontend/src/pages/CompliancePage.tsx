import React from "react";
import { FiArrowLeft, FiPrinter, FiShield } from "react-icons/fi";
import { useRouter } from "../store/router";
import { documentRepository } from "../data/repositories/documentRepository";
import { COMPLIANCE_STATEMENTS, complianceValidUntil } from "../data/seed/complianceStatements";
import { formatDisplayDate, todayISO } from "../utils/date";
import { printDocument } from "../utils/print";
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
  const statements = Object.values(COMPLIANCE_STATEMENTS);
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
                    <button className="btn btn-ghost btn-sm">Open</button>
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

export function ComplianceDetailPage({ documentId }: { documentId: string }) {
  const { navigate } = useRouter();
  const s = COMPLIANCE_STATEMENTS[documentId];
  const doc = documentRepository.getById(documentId);
  if (!s || !doc) {
    return (
      <div className="empty-state">
        <h2 className="text-xl mb-2">Statement not found</h2>
        <button className="btn btn-secondary" onClick={() => navigate("/soc")}>
          <FiArrowLeft size={13} /> Back
        </button>
      </div>
    );
  }
  const validUntil = complianceValidUntil(s);
  return (
    <div data-print-doc>
      <div className="flex items-center justify-between mb-3 no-print">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate("/soc")}>
          <FiArrowLeft size={13} /> Back to Statements
        </button>
        <div className="flex items-center gap-2">
          {validityBadge(validUntil)}
          <button className="btn btn-secondary btn-sm" onClick={() => printDocument()}>
            <FiPrinter size={13} /> Print
          </button>
        </div>
      </div>

      <div className="doc-header notranslate" translate="no">
        <div className="company-name">GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED</div>
        <div className="doc-title">{s.headerTitle}</div>
        <div className="meta-row">
          <div className="meta-cell">
            <span className="k">Format / Rev</span>
            <span className="v">{s.footerRef}</span>
          </div>
          <div className="meta-cell">
            <span className="k">Date of publication</span>
            <span className="v">{formatDisplayDate(s.signedOn)}</span>
          </div>
          <div className="meta-cell">
            <span className="k">Valid until</span>
            <span className="v">{formatDisplayDate(validUntil)}</span>
          </div>
          {s.referenceSource && (
            <div className="meta-cell" style={{ flex: 2 }}>
              <span className="k">Reference source</span>
              <span className="v">{s.referenceSource}</span>
            </div>
          )}
        </div>
      </div>

      <div className="doc-table mt-4 notranslate" translate="no">
        <table>
          <tbody>
            {s.sections.map((sec) => (
              <tr key={sec.label}>
                <td className="font-semibold text-sm" style={{ width: 220, verticalAlign: "top", background: "var(--color-surface-alt)" }}>
                  {sec.label}
                </td>
                <td className="text-sm">
                  {sec.lines.map((l, i) => (
                    <div key={i} className={i > 0 ? "mt-1" : ""}>
                      {l}
                    </div>
                  ))}
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
          {s.declarations.map((d, i) => (
            <p key={i} className={`text-sm ${i < s.declarations.length - 1 ? "mb-2" : ""}`}>
              {d}
            </p>
          ))}
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-pad text-sm">
          <div>Signed</div>
          <div className="mt-3" style={{ borderTop: "1px solid var(--color-border-strong)", width: 220 }} />
          <div className="font-semibold mt-1">{s.signedBy}</div>
          <div className="text-muted">({s.signedTitle})</div>
          <div className="text-muted mt-1">{formatDisplayDate(s.signedOn)}</div>
        </div>
      </div>
      <div className="text-xs text-faint mt-3 no-print">Source: {doc.sourceFile}</div>
    </div>
  );
}
