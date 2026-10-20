import React, { useState } from "react";
import { FiArrowLeft, FiShield } from "react-icons/fi";
import { useRouter } from "../store/router";
import { useAppStore } from "../store/AppStore";
import { useSetAssistantTarget } from "../store/AssistantContext";
import { documentRepository } from "../data/repositories/documentRepository";
import { complianceValidUntil, isPublicationDate, keepPublicationDate, type ComplianceSection, type ComplianceStatement } from "../data/seed/complianceStatements";
import { allComplianceStatements, complianceStatement, referenceRepository } from "../data/repositories/referenceRepository";
import { COMPANY } from "../data/seed/masterData";
import { ReferenceEditBar } from "../components/documents/ReferenceEditBar";
import { NotYourDepartment } from "../components/common/NotYourDepartment";
import { formatDisplayDate, todayISO } from "../utils/date";
import { printDocument } from "../utils/print";
import { DownloadDocumentButton } from "../components/common/DownloadDocumentButton";
import { useT } from "../i18n";
import { bindProps, complianceBind } from "../engine/roundTrip/bindingsFor";

function validityBadge(validUntil: string) {
  // No readable date of publication: nothing to count the days from.
  if (!validUntil) return <span className="badge badge-PendingVerification">Date of publication to be confirmed</span>;
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
                    {formatDisplayDate(isPublicationDate(s.signedOn) ? s.signedOn : "")} — {s.signedBy} ({s.signedTitle})
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

/** The words of a declaration with the terms its page prints in bold (the product, "GPPPL"), as the page prints them. */
function withBold(text: string, terms: string[] | undefined): React.ReactNode {
  const wanted = (terms ?? []).filter(Boolean);
  if (wanted.length === 0) return text;
  const parts = text.split(new RegExp(`(${wanted.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`));
  return parts.map((p, i) => (wanted.includes(p) ? <strong key={i}>{p}</strong> : p));
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** The signature's date as the page writes it: "1st April 2025" (F/QC-09, F/QC-10), "24 FEB 2025" (F/QC-38). */
function signedOnAsPrinted(iso: string, style: ComplianceStatement["signedOnStyle"]): React.ReactNode {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m || !style) return formatDisplayDate(isPublicationDate(iso) ? iso : "");
  const day = Number(m[3]);
  const month = MONTHS[Number(m[2]) - 1];
  if (style === "caps") return `${day} ${month.slice(0, 3).toUpperCase()} ${m[1]}`;
  const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return (
    <>
      {day}
      <sup>{suffix}</sup> {month} {m[1]}
    </>
  );
}

/**
 * Where each statement's page puts its foot (mm from the page's top: the top of the letters) and how far up its text may run,
 * measured off the owner's PDFs (F/QC-10, F/QC-38) and Word's PDF of his F/QC-09 .docx (§117 round 2).
 */
const SOC_FOOT: Record<string, { top: number; margin: number }> = {
  "soc-flexible-packaging": { top: 281.57, margin: 16.5 },
};
const SOC_FOOT_DEFAULT = { top: 272.42, margin: 25 };

/** The printed page's rule: its bottom margin, and the statement's number line in it, on every page. */
function socPageRule(s: ComplianceStatement, documentId: string): string {
  const foot = SOC_FOOT[documentId] ?? SOC_FOOT_DEFAULT;
  const padding = Math.max(0, foot.top - (297 - foot.margin) - 0.4);
  return `@media print { @page { margin: 0 0 ${foot.margin}mm 0; @bottom-center { content: ${JSON.stringify(s.footerRef)}; vertical-align: top; padding-top: ${padding.toFixed(2)}mm; font-family: "Century Gothic", "URW Gothic", Calibri, Arial, sans-serif; font-size: 9.96pt; line-height: 9.96pt; font-weight: ${s.footBold ? 700 : 400}; color: #000; } } }`;
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

  // A correction never leaves the statement without a date of publication (an
  // uploaded file or a proposed change that emptied it keeps the date it has):
  // its re-issue date is worked out from it.
  const save = (next: ComplianceStatement) => {
    referenceRepository.save(documentId, tidy(keepPublicationDate(next, complianceStatement(documentId))), currentUser);
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
  // Where each value lives in the statement, for an edited Word file read back
  // (REQUIREMENTS §81) — on the box while Edit is on, and on the words
  // otherwise. A section's lines are bound one by one where they are shown one
  // by one; the box that holds them all while Edit is on is not (no binding
  // holds a list).
  const bound = (key: Parameters<typeof complianceBind.field>[0]) => bindProps(complianceBind.field(key));

  return (
    <div data-print-doc data-bind-record={documentId} className="soc-sheet" data-soc={documentId} data-paper-left="12.78">
      <div className="flex items-center justify-between mb-3 no-print wrap gap-2">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate("/soc")}>
          <FiArrowLeft size={13} /> Back to Statements
        </button>
        <div className="flex items-center gap-2 wrap">
          {validityBadge(validUntil)}
          <ReferenceEditBar
            documentId={documentId}
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

      <div className="doc-header">
        <div className="company-name notranslate" translate="no">
          {COMPANY.name}
        </div>
        <div className="doc-title">
          {editing ? (
            <input className="input input-sm" data-field="soc-title" {...bound("headerTitle")} value={s.headerTitle} onChange={(e) => patch({ headerTitle: e.target.value })} />
          ) : (
            <span {...bound("headerTitle")}>{s.headerTitle}</span>
          )}
        </div>
        <div className="meta-row">
          <div className="meta-cell">
            <span className="k">Format / Rev</span>
            {editing ? (
              <input className="input input-sm" {...bound("footerRef")} value={s.footerRef} onChange={(e) => patch({ footerRef: e.target.value })} />
            ) : (
              <span className="v notranslate" translate="no" {...bound("footerRef")}>
                {s.footerRef}
              </span>
            )}
          </div>
          <div className="meta-cell">
            <span className="k">Date of publication</span>
            {editing ? (
              <input type="date" className="input input-sm" {...bound("signedOn")} value={s.signedOn} onChange={(e) => e.target.value && patch({ signedOn: e.target.value })} />
            ) : (
              <span className="v" {...bound("signedOn")}>
                {formatDisplayDate(isPublicationDate(s.signedOn) ? s.signedOn : "")}
              </span>
            )}
          </div>
          <div className="meta-cell">
            <span className="k">Valid until</span>
            <span className="v">{formatDisplayDate(validUntil)}</span>
          </div>
        </div>
      </div>

      <div className="soc-body">
      <div className="doc-table mt-4">
        <table>
          <tbody>
            {/* "Reference source" is the table's first line, in bold, as the page prints it (§117 round 2); a statement that
                prints none (F/QC-09) has no such line. */}
            {(s.referenceSource || editing) && (
              <tr className="soc-reference">
                <td className="font-semibold text-sm soc-label" style={{ width: "var(--soc-label-w, 220px)", verticalAlign: "top", background: "var(--soc-label-bg, var(--color-surface-alt))" }}>
                  <span className="soc-cell">Reference source</span>
                </td>
                <td className="text-sm font-semibold">
                  {editing ? (
                    <input className="input input-sm" {...bound("referenceSource")} value={s.referenceSource ?? ""} onChange={(e) => patch({ referenceSource: e.target.value })} />
                  ) : (
                    <div className="soc-cell" {...bound("referenceSource")}>
                      {s.referenceSource}
                    </div>
                  )}
                </td>
              </tr>
            )}
            {s.sections.map((sec, i) => (
              <tr key={i}>
                <td
                  className="font-semibold text-sm soc-label"
                  style={{ width: "var(--soc-label-w, 220px)", verticalAlign: "top", background: "var(--soc-label-bg, var(--color-surface-alt))" }}
                  {...(editing ? undefined : bindProps(complianceBind.sectionLabel(i)))}
                >
                  {editing ? (
                    <input className="input input-sm" {...bindProps(complianceBind.sectionLabel(i))} value={sec.label} onChange={(e) => setSection(i, { label: e.target.value })} />
                  ) : (
                    <span className="soc-cell">{sec.label}</span>
                  )}
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
                      <div key={li} className={`soc-cell${li > 0 ? " mt-1" : ""}${/^[•❖✓]/.test(l) ? " soc-marked" : ""}`} {...bindProps(complianceBind.sectionLine(i, li))}>
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

      {/* What the document prints after its table, as it prints it (REQUIREMENTS §111, the review of 13-Oct-2026): no
          heading of DCRS's over it; a heading the document prints in the list (F/QC-38's REACH) as a heading, and a "⇨"
          line as a bullet of the line above it. The heading on screen only names the card. */}
      <div className="card mt-4" data-section="soc-list">
        <div className="card-header no-print">
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
                {...bindProps(complianceBind.declaration(i))}
                rows={3}
                value={d}
                onChange={(e) => patch({ declarations: s.declarations.map((x, xi) => (xi === i ? e.target.value : x)) })}
              />
            ) : (
              <p
                key={i}
                // A bullet to each item, as the documents print their list (REQUIREMENTS §111, part 8): drawn by the
                // stylesheet, so the words a download holds and reads back are the item's alone. A heading (REACH) has
                // none; a "⇨" line is a bullet of the item above, with its own arrow.
                className={`text-sm ${i < s.declarations.length - 1 ? "mb-2" : ""}${s.headings?.includes(d) ? " font-semibold" : d.startsWith("⇨") ? "" : " soc-item"}`}
                style={d.startsWith("⇨") ? { paddingLeft: 24 } : undefined}
                {...bindProps(complianceBind.declaration(i))}
              >
                {withBold(d, s.printedBold)}
              </p>
            )
          )}
        </div>
      </div>

      <div className="card mt-4 soc-sign">
        <div className="card-pad text-sm">
          <div>Signed</div>
          <div className="mt-3 soc-sign-line" style={{ borderTop: "1px solid var(--color-border-strong)", width: 220 }} />
          {/* The page's own line to sign on: underscores, as typed on the Word page (§117 round 2). */}
          <div className="soc-sign-rule" aria-hidden="true">
            ________________________
          </div>
          {editing ? (
            <div className="flex gap-2 wrap mt-1">
              <input className="input input-sm" {...bound("signedBy")} style={{ maxWidth: 220 }} placeholder="Signed by" value={s.signedBy} onChange={(e) => patch({ signedBy: e.target.value })} />
              <input className="input input-sm" {...bound("signedTitle")} style={{ maxWidth: 220 }} placeholder="Title" value={s.signedTitle} onChange={(e) => patch({ signedTitle: e.target.value })} />
            </div>
          ) : (
            <>
              <div className="font-semibold mt-1" {...bound("signedBy")}>
                {s.signedBy}
              </div>
              <div className="text-muted">
                (<span {...bound("signedTitle")}>{s.signedTitle}</span>)
              </div>
            </>
          )}
          <div className="text-muted mt-1 soc-date-screen" {...bound("signedOn")}>
            {formatDisplayDate(isPublicationDate(s.signedOn) ? s.signedOn : "")}
          </div>
          {/* The date as the page writes it ("1st April 2025", "24 FEB 2025"): printed; the bound date above is the record's. */}
          <div className="soc-date-printed" aria-hidden="true">
            {signedOnAsPrinted(s.signedOn, s.signedOnStyle)}
          </div>
        </div>
      </div>
      </div>
      {/* THE PAGE'S FOOT ON EVERY PAGE (§117 round 2): the number line the Word page prints at the foot of each page, in the
          page's own bottom margin (the browser's page margin box), its words the statement's Format / Rev, typed over above. */}
      <style>{socPageRule(s, documentId)}</style>
      <div className="text-xs text-faint mt-3 no-print">Source: {doc.sourceFile}</div>
    </div>
  );
}
