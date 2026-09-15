import React, { useMemo } from "react";
import { FiActivity, FiArrowRight, FiAward, FiBarChart2, FiBookOpen, FiCheckSquare, FiUserCheck, FiUsers } from "react-icons/fi";
import type { IconType } from "react-icons";
import { useAppStore } from "../store/AppStore";
import { useRouter } from "../store/router";
import { documentRepository } from "../data/repositories/documentRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { HR_SECTIONS } from "../data/seed/documentDefinitions";
import { HR_RECORD_PAGES, hrPageForSlug, type HrSection } from "../data/seed/hrModule";
import { ensureRecordsGeneratedForMonth } from "../engine/recordGenerator";
import { StatusBadge } from "../components/common/StatusBadge";
import { NotYourDepartment } from "../components/common/NotYourDepartment";
import { DocumentRecordsPage } from "./DocumentRecordsPage";
import { nextDueDate } from "./PestControlPages";
import { useT } from "../i18n";
import { compareISO, formatDisplayDate, todayISO } from "../utils/date";
import type { RecordInstance } from "../types";

// HR RECORDS — the Human Resources module's own sixteen F/HR formats, laid out
// the way its pest control file is (REQUIREMENTS §47): this overview of the five
// groups at /hr, and one page per format at /hr/{slug} (DocumentRecordsPage).

const SECTION_ICONS: Record<HrSection, IconType> = {
  "Personnel & Competence": FiUsers,
  Training: FiAward,
  "Induction & Health": FiUserCheck,
  "Hygiene & GMP": FiCheckSquare,
  "Product Safety Culture": FiBarChart2,
};

const SECTION_NOTES: Record<HrSection, string> = {
  "Personnel & Competence": "Who the plant employs and what each position needs: the competence review, the operators' skills, job responsibilities and mobile authorisations.",
  Training: "The year's training need identification and plan, and how each training landed.",
  "Induction & Health": "Health declarations before employment and at the gate, and the induction of new staff and operators.",
  "Hygiene & GMP": "The monthly GMP inspection walk and the daily personal hygiene check at frisking.",
  "Product Safety Culture": "The survey each employee answers, and the analysis of each round.",
};

export function HrOverviewPage() {
  const { mode, version } = useAppStore();
  const { navigate } = useRouter();
  const t = useT();
  const isDemo = mode === "demo";
  const today = todayISO();

  useMemo(() => {
    const now = new Date();
    ensureRecordsGeneratedForMonth(now.getFullYear(), now.getMonth(), { documentIds: HR_RECORD_PAGES.map((p) => p.docId), isDemo: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const docs = documentRepository.getAll();
  const items = HR_RECORD_PAGES.map((page) => ({ page, doc: docs.find((d) => d.id === page.docId) })).filter(
    (x): x is { page: (typeof HR_RECORD_PAGES)[number]; doc: NonNullable<typeof x.doc> } => !!x.doc
  );
  // Only Human Resources' own paperwork is here, so a viewer outside it is
  // refused by name rather than shown five empty groups (REQUIREMENTS §40).
  if (items.length === 0) return <NotYourDepartment documentId="hr-competence" formatNo="F/HR/01" what="document" />;

  const groups = HR_SECTIONS.map((section) => ({ section, rows: items.filter((x) => x.page.section === section) })).filter((g) => g.rows.length > 0);

  return (
    <div className={isDemo ? "demo-watermark" : ""} data-page="hr-overview">
      <div className="flex items-center justify-between mb-1 wrap gap-3">
        <h1 className="text-2xl">{t("hr.title")}</h1>
        <div className="flex gap-2 wrap">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate("/pest-control")}>
            <FiActivity size={13} /> Pest Control file
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate("/library/human-resources")}>
            <FiBookOpen size={13} /> All Human Resources documents
          </button>
        </div>
      </div>
      <p className="text-muted mb-4">
        Human Resources' own formats, F/HR/01 to F/HR/22, in their five groups — each opens on a page of its own with its records on file{isDemo ? " (demo data)" : ""}.
      </p>

      <div className="pest-grid">
        {groups.map(({ section, rows }) => {
          const Icon = SECTION_ICONS[section];
          return (
            <div className="card" key={section} data-hr-section={section}>
              <div className="card-header">
                <h3 className="text-base font-semibold">
                  <Icon size={14} style={{ verticalAlign: -2 }} /> {section}
                </h3>
                <span className="badge badge-Due">
                  {rows.length} format{rows.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="card-pad" style={{ paddingTop: 8 }}>
                <div className="text-sm text-muted mb-2">{SECTION_NOTES[section]}</div>
                <div className="doc-table">
                  <table className="compact">
                    <thead>
                      <tr>
                        <th>Format</th>
                        <th>On file</th>
                        <th>Next due</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ page, doc }) => {
                        const records = (recordRepository.query({ documentId: doc.id, isDemo }) as RecordInstance[]).slice().sort((a, b) => compareISO(b.dueDate, a.dueDate));
                        const latest = records[0];
                        const next = doc.schedule.type === "as-required" ? null : nextDueDate(doc, today);
                        return (
                          <tr key={doc.id} className="card-clickable" data-hr-doc={doc.id} onClick={() => navigate(`/hr/${page.slug}`)}>
                            <td>
                              <div className="font-semibold text-sm">{doc.name}</div>
                              <div className="text-xs text-faint">
                                {doc.formatNo} · {doc.frequency}
                              </div>
                            </td>
                            <td className="text-sm">
                              {latest ? (
                                <span className="flex items-center gap-2 wrap">
                                  {records.length} · {formatDisplayDate(latest.dueDate)} <StatusBadge status={latest.status} />
                                </span>
                              ) : (
                                <span className="text-faint">none yet</span>
                              )}
                            </td>
                            <td className="text-sm">{next ? formatDisplayDate(next) : "As required"}</td>
                            <td style={{ textAlign: "right" }}>
                              <button className="btn btn-ghost btn-sm">
                                Open <FiArrowRight size={12} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** /hr/{slug} — one HR format's own page. */
export function HrDocumentPage({ slug }: { slug: string }) {
  const page = hrPageForSlug(slug);
  if (!page) {
    return (
      <div className="empty-state">
        <h2 className="text-xl mb-2">Unknown HR record</h2>
        <p>Choose one of the sixteen formats from HR Records.</p>
      </div>
    );
  }
  return <DocumentRecordsPage docId={page.docId} />;
}
