import React, { useMemo } from "react";
import { FiActivity, FiArchive, FiArrowRight, FiAward, FiBarChart2, FiBookOpen, FiCheckSquare, FiInbox, FiLayers, FiShield, FiTool } from "react-icons/fi";
import type { IconType } from "react-icons";
import { useAppStore } from "../store/AppStore";
import { useRouter } from "../store/router";
import { documentRepository } from "../data/repositories/documentRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { QC_COMPLIANCE_MODULE, QC_GROUPS, QC_LAMINATION_MODULE, QC_OTHER_GROUP_TITLE, QC_OVERVIEW_DOCUMENT_IDS } from "../data/seed/qcModule";
import { documentOpenRoute } from "../engine/documentRoutes";
import { ensureRecordsGeneratedForMonth } from "../engine/recordGenerator";
import { StatusBadge } from "../components/common/StatusBadge";
import { NotYourDepartment } from "../components/common/NotYourDepartment";
import { nextDueDate } from "./PestControlPages";
import { documentTextIn, isGujaratiDocument } from "../i18n/documentText";
import { useT } from "../i18n";
import { compareISO, formatDisplayDate, todayISO } from "../utils/date";
import type { DocumentDefinition, RecordInstance } from "../types";

// QC RECORDS — the Quality Control module's own overview (REQUIREMENTS §58),
// laid out the way HR Records is (src/pages/HrPages.tsx): one card per section
// of the department's paperwork, and in it every format as the department
// asks for it — FORMAT NUMBER, then the name — with what is on file, what is
// next due, and a click onto the format's own page.
//
// What each card holds comes from data/seed/qcModule.ts, which reads the
// document definitions themselves: a format added to the module appears here
// the same day, in its section, without this file being touched.

const GROUP_ICONS: Record<string, IconType> = {
  "In-Process & Inspection": FiActivity,
  "Incoming Material Inspection": FiInbox,
  "Line Clearance": FiCheckSquare,
  Calibration: FiTool,
  "Certificates of Analysis": FiAward,
  "Registers & Records": FiArchive,
  "Analysis & Meetings": FiBarChart2,
  [QC_LAMINATION_MODULE]: FiLayers,
  [QC_COMPLIANCE_MODULE]: FiShield,
  [QC_OTHER_GROUP_TITLE]: FiCheckSquare,
};

const GROUP_NOTES: Record<string, string> = {
  "In-Process & Inspection": "What is checked on the machine while a job runs — the printing record graded A / B / C / F, and the inspection of printed film, slitting and pouching.",
  "Incoming Material Inspection": "Every material as it arrives: film, board, paper, cores, inks, adhesives and powders, checked against the specification printed on each form and accepted, rejected, segregated or accepted on deviation.",
  "Line Clearance": "Before a job change: the area reports that register each changeover, and the two checklists a QA person ticks and signs — the previous job's materials off the line, and the new job's parameters right.",
  Calibration: "The instruments themselves: the master list of what is calibrated and when, and the internal calibration records kept between external calibrations.",
  "Certificates of Analysis": "What is certified with a delivery — labels, shrink sleeves and corrugated boxes — against the client's order and the tolerance agreed.",
  "Registers & Records": "Kept alongside the inspections: obsolete artwork and shade cards, printing aids destroyed, the camera challenge test, and the customer's own tolerance card.",
  "Analysis & Meetings": "The analyses written up for a client, the utility tests behind them, and the minutes of the meetings where they were agreed.",
  [QC_LAMINATION_MODULE]: "Three more of Quality Control's log sheets, kept with the lamination line's own paperwork in the Lamination module — they open the same way from here.",
  [QC_COMPLIANCE_MODULE]: "The two Statements of Compliance the department issues with a delivery, F/QC-09 for pressure labels and F/QC-38 for flexible packaging — each read and re-issued on its own page.",
  [QC_OTHER_GROUP_TITLE]: "Formats shelved in the module without one of the department's seven sections — here so that a new format is never simply missing from this page.",
};

/** /qc — Quality Control's overview of its whole collection. */
export function QcOverviewPage() {
  const { mode, version, lang } = useAppStore();
  const { navigate } = useRouter();
  const t = useT();
  const isDemo = mode === "demo";
  const today = todayISO();

  useMemo(() => {
    const now = new Date();
    ensureRecordsGeneratedForMonth(now.getFullYear(), now.getMonth(), { documentIds: [...QC_OVERVIEW_DOCUMENT_IDS], isDemo: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // Read once for the whole page, not once per scheduled row: the master sheet
  // is parsed out of storage on every call (REQUIREMENTS §56).
  const master = masterRepository.get();
  const docs = documentRepository.getAll();
  const byId = new Map<string, DocumentDefinition>(docs.map((d) => [d.id, d]));
  const groups = QC_GROUPS.map((g) => ({
    group: g,
    rows: g.documentIds.map((id) => byId.get(id)).filter((d): d is DocumentDefinition => !!d),
  })).filter((g) => g.rows.length > 0);

  // Quality Control's paperwork, so a viewer from another department is refused
  // by name rather than shown nine empty cards (REQUIREMENTS §40). The eight
  // formats the paper heads "Quality Assurance" are Quality Control's for
  // access, as their F/QC numbers say (data/seed/documentDepartments.ts) — the
  // department each row names is the one printed on the form.
  if (groups.length === 0) return <NotYourDepartment documentId="qc-bopp-film" formatNo="F/QC/01" what="document" />;

  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const departments = Array.from(new Set(groups.flatMap((g) => g.rows.map((d) => d.department)))).sort();

  return (
    <div className={isDemo ? "demo-watermark" : ""} data-page="qc-overview">
      <div className="flex items-center justify-between mb-1 wrap gap-3">
        <h1 className="text-2xl">{t("qc.title")}</h1>
        <div className="flex gap-2 wrap">
          <button className="btn btn-secondary btn-sm" data-action="open-qc-library" onClick={() => navigate("/library/quality-control-inspection-records")}>
            <FiBookOpen size={13} /> All Quality Control documents
          </button>
        </div>
      </div>
      <p className="text-muted mb-4">
        {total} formats in {groups.length} groups, kept by {departments.join(" and ")} — each listed by its format number, and each opening on a page of its own with its
        records on file{isDemo ? " (demo data)" : ""}. Everything here, the forms included, reads in the language chosen beside Today{"'"}s Briefing.
      </p>

      <div className="pest-grid">
        {groups.map(({ group, rows }) => {
          const Icon = GROUP_ICONS[group.title] ?? FiCheckSquare;
          return (
            <div className="card" key={group.title} data-qc-section={group.title}>
              <div className="card-header">
                <h3 className="text-base font-semibold">
                  <Icon size={14} style={{ verticalAlign: -2 }} /> {group.title}
                </h3>
                <span className="badge badge-Due">
                  {rows.length} format{rows.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="card-pad" style={{ paddingTop: 8 }}>
                <div className="text-sm text-muted mb-2">{GROUP_NOTES[group.title]}</div>
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
                      {rows.map((doc) => {
                        const records = (recordRepository.query({ documentId: doc.id, isDemo }) as RecordInstance[]).slice().sort((a, b) => compareISO(b.dueDate, a.dueDate));
                        const latest = records[0];
                        const next = doc.schedule.type === "as-required" ? null : nextDueDate(doc, today, master);
                        // The house style for a format the paper carries no number for
                        // (components/master/DepartmentsAccess.tsx): its name alone, with
                        // the faint line below saying why.
                        const numbered = !doc.formatNo.startsWith("TO BE");
                        return (
                          <tr key={doc.id} className="card-clickable" data-qc-doc={doc.id} onClick={() => navigate(documentOpenRoute(doc))}>
                            <td>
                              <div className="font-semibold text-sm" data-qc-format={doc.formatNo}>
                                {/* The format number identifies the document, so it is never machine-translated. */}
                                {numbered && (
                                  <>
                                    <span className="notranslate" translate="no">
                                      {doc.formatNo}
                                    </span>{" "}
                                    -{" "}
                                  </>
                                )}
                                {documentTextIn(doc.name, lang)}
                              </div>
                              <div className="text-xs text-faint">
                                {doc.department} · {doc.frequency}
                                {numbered ? "" : " · no format number printed"}
                                {isGujaratiDocument(doc.id) ? ` · ${lang === "en" ? t("qc.gujaratiInEnglish") : t("qc.gujaratiForm")}` : ""}
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
