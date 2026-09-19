import React, { useMemo, useState } from "react";
import { FiArrowLeft, FiArrowRight, FiDatabase, FiEdit3, FiExternalLink, FiPlus, FiPrinter, FiUpload } from "react-icons/fi";
import { FormatEditor } from "../components/documents/FormatEditor";
import { SheetDesigner } from "../components/documents/SheetDesigner";
import { canDesignGrid } from "../engine/formatOps";
import { takeDesignRequest } from "../engine/designSession";
import { useAppStore } from "../store/AppStore";
import { useRouter } from "../store/router";
import { documentRepository } from "../data/repositories/documentRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { getLogSheetLayout } from "../data/seed/logSheetLayouts";
import { hrPageForDocument } from "../data/seed/hrModule";
import { ensureRecordsGeneratedForMonth } from "../engine/recordGenerator";
import { createRecordForDocument } from "../engine/recordCrud";
import { createDefaultData } from "../engine/recordDefaults";
import { routeForRecord } from "../engine/reminders";
import { hrMasterLinkFor } from "../engine/hrMaster";
import { LogSheetRecordView } from "../components/records/LogSheetRecordView";
import { StatusBadge } from "../components/common/StatusBadge";
import { DemoTag } from "../components/common/DemoTag";
import { NotYourDepartment } from "../components/common/NotYourDepartment";
import { CvImportDialog } from "../components/hr/CvImportDialog";
import { DocMeta, nextDueDate } from "./PestControlPages";
import { moduleSlug } from "../utils/moduleSlug";
import { printDocument } from "../utils/print";
import { DownloadDocumentButton } from "../components/common/DownloadDocumentButton";
import { compareISO, formatDisplayDate, todayISO } from "../utils/date";
import { documentLayoutIn, documentTextIn } from "../i18n/documentText";
import { logActivity } from "../utils/activityLog";
import type { Language } from "../i18n/strings";
import type { DocumentDefinition, LogSheetData, RecordInstance } from "../types";

// ONE DOCUMENT'S OWN PAGE (REQUIREMENTS §47) — /hr/{slug} for the sixteen HR
// formats, /document/{id} for every other log sheet.
//
// What "Open Document" shows: the document's records on file, and the latest of
// them in full, exactly as the form prints — so opening a register opens the
// register. A line of the table shows that record instead; Open takes it to its
// own page to fill in, submit or verify. A format with nothing on file yet shows
// its blank form, with New to start one.
//
// EDIT FORMAT turns the page into the format's DESIGNER (REQUIREMENTS §64): the
// records and the preview give way to the sheet itself, to be changed the way a
// spreadsheet is (components/documents/SheetDesigner.tsx), and come back when
// design mode is left. A form the program draws by hand has no sheet to design,
// so there the button opens the Edit format dialog as before (§62).

const DONE = new Set(["Submitted", "Pending Verification", "Verified"]);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const shownValue = (v: unknown): string => {
  const s = String(v ?? "").trim();
  return ISO.test(s) ? formatDisplayDate(s) : s;
};

/** What tells this record from the format's other records: its position, period, trainee… */
function describeRecord(doc: DocumentDefinition, record: RecordInstance, lang: Language): string {
  const header = (record.data as LogSheetData | undefined)?.header ?? {};
  const hr = hrPageForDocument(doc.id);
  if (hr?.labelKey && shownValue(header[hr.labelKey])) return shownValue(header[hr.labelKey]);
  const layout = documentLayoutIn(getLogSheetLayout(doc.id), lang);
  const first = layout?.headerFields.find((f) => shownValue(header[f.key]));
  return first ? `${first.label}: ${shownValue(header[first.key])}` : "";
}

/** "80 of 80": the lines with something written in them, of the lines on the sheet. */
function linesFilled(doc: DocumentDefinition, record: RecordInstance): string {
  const layout = getLogSheetLayout(doc.id);
  const rows = (record.data as LogSheetData | undefined)?.rows;
  if (!layout || !rows) return "—";
  const filled = rows.filter((row) => layout.columns.some((c) => !c.fixed && String(row[c.key] ?? "").trim() !== "")).length;
  return `${filled} of ${rows.length}`;
}

export function DocumentRecordsPage({ docId }: { docId: string }) {
  const { mode, version, bump, lang, currentUser } = useAppStore();
  const [editingFormat, setEditingFormat] = useState(false);
  // Design mode belongs to the format it was opened on, so what is kept is WHICH
  // format is being designed. Both routes take this page down between documents
  // today (App.tsx keys it), but a page handed another document without that
  // would otherwise draw that one's designer — and open its design session —
  // for the one render an effect takes to notice.
  const [designingId, setDesigningId] = useState<string | null>(null);
  const designing = designingId === docId;
  // The Document Library's Edit format opens this page already in design mode (engine/designSession.ts).
  React.useEffect(() => {
    if (takeDesignRequest(docId)) setDesigningId(docId);
  }, [docId]);
  const { navigate } = useRouter();
  const isDemo = mode === "demo";
  const today = todayISO();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cvOpen, setCvOpen] = useState(false);
  // Opening a format's page is a line of the activity log (REQUIREMENTS §62).
  React.useEffect(() => {
    const d = documentRepository.getById(docId);
    if (d) logActivity("Document opened", `${d.formatNo.startsWith("TO BE") ? "" : `${d.formatNo} `}${d.name}`, "", d.id);
  }, [docId]);

  // This month's due sheet exists before the page reads the records, as on the
  // Calendar and the pest control pages (the generator keeps the launch-date floor).
  useMemo(() => {
    const now = new Date();
    ensureRecordsGeneratedForMonth(now.getFullYear(), now.getMonth(), { documentIds: [docId], isDemo: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, version]);

  const doc = documentRepository.getById(docId);
  // Another department's document is refused by name, not reported missing
  // (REQUIREMENTS §40); an address that names no document at all is the empty state.
  if (!doc) {
    const unscoped = documentRepository.getByIdUnscoped(docId);
    if (unscoped) return <NotYourDepartment documentId={unscoped.id} formatNo={unscoped.formatNo} what="document" />;
    return (
      <div className="empty-state">
        <h2 className="text-xl mb-2">Unknown document</h2>
        <p>Choose a document from the Document Library.</p>
      </div>
    );
  }

  const master = masterRepository.get();
  const hr = hrPageForDocument(doc.id);
  const layout = doc.kind === "log-sheet" ? getLogSheetLayout(doc.id) : undefined;
  const records = (recordRepository.query({ documentId: doc.id, isDemo }) as RecordInstance[]).slice().sort((a, b) => compareISO(b.dueDate, a.dueDate));
  const shown = records.find((r) => r.id === selectedId) ?? records[0];
  const blank: RecordInstance<LogSheetData> | undefined =
    !shown && layout
      ? {
          id: "blank-format",
          documentId: doc.id,
          periodKey: "",
          dueDate: today,
          status: "Scheduled",
          isDemo,
          data: createDefaultData(doc, today, master) as LogSheetData,
          createdAt: today,
          updatedAt: today,
        }
      : undefined;
  const preview = shown ?? blank;
  const next = doc.schedule.type === "as-required" ? null : nextDueDate(doc, today);
  const done = records.filter((r) => DONE.has(r.status)).length;
  const detailsTitle = hr?.labelTitle ?? "Details";

  const startRecord = () => {
    const { record } = createRecordForDocument(doc, { dateISO: today, isDemo });
    bump();
    navigate(routeForRecord(doc, record.id));
  };

  return (
    <div className={isDemo ? "demo-watermark" : ""} data-page="document-records" data-document={doc.id}>
      {editingFormat && (
        <FormatEditor
          doc={doc}
          actor={currentUser}
          onClose={() => setEditingFormat(false)}
          onSaved={() => {
            setEditingFormat(false);
            bump();
          }}
        />
      )}
      <div className="flex items-center justify-between mb-1 wrap gap-3">
        <div>
          <div className="text-xs text-muted mb-1" data-crumb>
            {hr ? `HR Records · ${hr.section}` : `${doc.module}${doc.section ? ` · ${doc.section}` : ""}`}
          </div>
          <h1 className="text-2xl mb-1">{documentTextIn(doc.name, lang)}</h1>
          <DocMeta doc={doc} />
        </div>
        <div className="flex gap-2 wrap">
          {/* A new joiner from their CV, onto F/HR/01 and the other HR formats
              that ask for the same details (REQUIREMENTS §49). */}
          {doc.id === "hr-competence" && !designing && (
            <button className="btn btn-primary btn-sm" data-action="cv-import" onClick={() => setCvOpen(true)}>
              <FiUpload size={12} /> Add from CV / Resume
            </button>
          )}
          {/* The HR formats that fetch a person from HR Master Data (REQUIREMENTS §53). */}
          {hrMasterLinkFor(doc.id) && (
            <button className="btn btn-secondary btn-sm" data-action="open-hr-master" onClick={() => navigate("/hr/master-data")}>
              <FiDatabase size={12} /> HR Master Data
            </button>
          )}
          {/* The format itself can be changed; saving raises its revision (REQUIREMENTS §62).
              A sheet drawn from a layout is designed on the sheet; any other form, in the dialog (§64). */}
          <button
            className="btn btn-secondary btn-sm"
            data-action="edit-format"
            aria-pressed={designing}
            onClick={() => (canDesignGrid(doc) ? setDesigningId(doc.id) : setEditingFormat(true))}
            title={`Now Rev ${doc.revisionNo}`}
          >
            <FiEdit3 size={12} /> Edit format
          </button>
          {/* Not beside a sheet being designed: it would file a record before the pop-up could ask about leaving. */}
          {!doc.isReferenceOnly && !designing && (
            <button className="btn btn-primary btn-sm" data-action="document-new-record" onClick={startRecord}>
              <FiPlus size={12} /> New record
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(hr ? "/hr" : `/library/${moduleSlug(doc.module)}`)}>
            <FiArrowLeft size={12} /> {hr ? "All HR records" : "Document Library"}
          </button>
        </div>
      </div>
      <p className="text-muted mb-4">{doc.description}</p>
      {cvOpen && <CvImportDialog onClose={() => setCvOpen(false)} />}

      {designing ? (
        // The sheet, to be designed. A save shows in the page's header at once; leaving puts the page back.
        <SheetDesigner
          key={doc.id}
          doc={doc}
          actor={currentUser}
          onSaved={bump}
          onExit={() => {
            setDesigningId(null);
            bump();
          }}
        />
      ) : (
        <>
          <div className="flex gap-3 wrap mb-4">
            <div className="stat-tile">
              <div className="stat-value" data-stat="on-file">
                {records.length}
              </div>
              <div className="stat-label">Records on file{isDemo ? " (demo)" : ""}</div>
            </div>
            <div className="stat-tile">
              <div className="stat-value" style={{ fontSize: 18 }}>
                {records[0] ? formatDisplayDate(records[0].dueDate) : "—"}
              </div>
              <div className="stat-label">Latest{records[0] ? ` · ${records[0].status}` : ""}</div>
            </div>
            <div className="stat-tile">
              <div className="stat-value" style={{ fontSize: 18 }}>
                {next ? formatDisplayDate(next) : doc.frequency}
              </div>
              <div className="stat-label">{next ? `Next due · ${doc.frequency}` : "Started when needed"}</div>
            </div>
            <div className="stat-tile">
              <div className="stat-value">{done}</div>
              <div className="stat-label">Submitted or verified</div>
            </div>
          </div>

          <div className="doc-table">
            <table className="compact" data-table="document-records">
              <thead>
                <tr>
                  <th>Dated</th>
                  <th>{detailsTitle}</th>
                  <th>Lines filled</th>
                  <th>Status</th>
                  <th>Submitted by</th>
                  <th>Verified by</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-muted text-center" style={{ padding: 20 }}>
                      No {documentTextIn(doc.name, lang)} on file yet{isDemo ? " (demo)" : ""} — start one with New record.{layout ? " The blank format is shown below." : ""}
                    </td>
                  </tr>
                )}
                {records.map((r) => (
                  <tr
                    key={r.id}
                    data-record={r.id}
                    className={`card-clickable ${shown?.id === r.id ? "is-selected" : ""}`}
                    onClick={() => setSelectedId(r.id)}
                    title="Show this record below"
                  >
                    <td className="font-semibold">{formatDisplayDate(r.dueDate)}</td>
                    <td className="text-sm" translate="no">
                      {describeRecord(doc, r, lang) || <span className="text-faint">—</span>}
                    </td>
                    <td className="text-sm">{linesFilled(doc, r)}</td>
                    <td>
                      <StatusBadge status={r.status} />
                      {r.isDemo && <DemoTag />}
                    </td>
                    <td className="text-sm" translate="no">
                      {r.submittedBy || <span className="text-faint">—</span>}
                    </td>
                    <td className="text-sm" translate="no">
                      {r.verifiedBy || <span className="text-faint">—</span>}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        data-action="open-record"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(routeForRecord(doc, r.id));
                        }}
                      >
                        Open <FiArrowRight size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {records.length > 1 && <div className="text-xs text-muted mt-2">Click a line to show that record below; Open takes it to its own page to fill in, submit or verify.</div>}

          {layout && preview && (
            <div className="mt-5" data-section="document-preview" data-record={preview.id}>
              <div className="flex items-center justify-between wrap gap-2 mb-2">
                <h2 className="text-lg">{shown ? `On file — ${describeRecord(doc, shown, lang) || formatDisplayDate(shown.dueDate)}` : "Blank format — nothing on file yet"}</h2>
                <div className="flex items-center gap-2 wrap">
                  {shown && <StatusBadge status={shown.status} />}
                  {shown ? (
                    <button className="btn btn-primary btn-sm" data-action="open-shown-record" onClick={() => navigate(routeForRecord(doc, shown.id))}>
                      Open record <FiExternalLink size={12} />
                    </button>
                  ) : (
                    <button className="btn btn-primary btn-sm" data-action="start-from-blank" onClick={startRecord}>
                      <FiPlus size={12} /> Start this record
                    </button>
                  )}
                  <DownloadDocumentButton doc={doc} dateISO={preview?.dueDate} />
                  <button className="btn btn-secondary btn-sm" onClick={() => printDocument()}>
                    <FiPrinter size={12} /> Print
                  </button>
                </div>
              </div>
              {/* The form as issued, in the chosen language (REQUIREMENTS §58), and the part that prints (utils/print.ts). */}
              <div data-print-doc>
                <LogSheetRecordView key={preview.id} doc={doc} record={preview as RecordInstance<LogSheetData>} editable={false} onChange={() => undefined} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
