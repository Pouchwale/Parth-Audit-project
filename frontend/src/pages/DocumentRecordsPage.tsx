import React, { useMemo, useState } from "react";
import { FiArrowRight, FiDatabase, FiEdit3, FiExternalLink, FiPlus, FiPrinter, FiUpload, FiBookOpen } from "react-icons/fi";
import { FormatEditor } from "../components/documents/FormatEditor";
import { MonthBar, inPeriod, type RecordsPeriod } from "../components/common/MonthBar";
import { SheetDesigner } from "../components/documents/SheetDesigner";
import { canDesignGrid } from "../engine/formatOps";
import { printFillOf } from "../engine/printFill";
import { formulaTimeOf } from "../../../indexing/formulaRuntime";
import { takeDesignRequest } from "../engine/designSession";
import { useAppStore } from "../store/AppStore";
import { useRouter } from "../store/router";
import { documentRepository } from "../data/repositories/documentRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { getLogSheetLayout, getLogSheetLayoutForRecord } from "../data/seed/logSheetLayouts";
import { hrPageForDocument } from "../data/seed/hrModule";
import { useEnsureMonth } from "../utils/useEnsureMonth";
import { recordCoveringDate } from "../engine/recordCrud";
import { newRecordFromButton, noteOnOpen } from "../engine/newRecord";
import { slotOf } from "../engine/rulerSlots";
import { isRulerVerification } from "../data/seed/qcRulerVerificationLayouts";
import { createDefaultData } from "../engine/recordDefaults";
import { shownOnItsDay } from "../engine/beforeItsDay";
import { routeForRecord } from "../engine/reminders";
import { hrMasterLinkFor } from "../engine/hrMaster";
import { LogSheetRecordView } from "../components/records/LogSheetRecordView";
import { StatusBadge } from "../components/common/StatusBadge";
import { DemoTag } from "../components/common/DemoTag";
import { NotYourDepartment } from "../components/common/NotYourDepartment";
import { CvImportDialog } from "../components/hr/CvImportDialog";
import { InductionFillCard } from "../components/hr/InductionFillCard";
import { nextDueDate } from "./PestControlPages";
import { moduleSlug } from "../utils/moduleSlug";
import { useT } from "../i18n";
import { printDocument } from "../utils/print";
import { DownloadDocumentButton } from "../components/common/DownloadDocumentButton";
import { compareISO, formatDisplayDate, MONTH_NAMES, todayISO } from "../utils/date";
import { documentLayoutIn, documentTextIn } from "../i18n/documentText";
import { logActivity } from "../utils/activityLog";
import { useProgressiveCount } from "../utils/useProgressive";
import type { Language } from "../i18n/strings";
import type { DocumentDefinition, LogSheetData, RecordInstance } from "../types";
import { runningNumbers as numberedRecords } from "../engine/runningNumbers";
import { serialNumbersOnSheets } from "../data/serialNumbersMigration";
import { mayDo } from "../engine/departmentScope";
import { AccessReason } from "../components/common/AccessReason";

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
/** F/QC/17's records of one day by their number, 01 first (REQUIREMENTS §220); 0 for any other. */
const rulerOrder = (a: RecordInstance, b: RecordInstance): number => (slotOf(a) ?? 0) - (slotOf(b) ?? 0);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const shownValue = (v: unknown): string => {
  const s = String(v ?? "").trim();
  return ISO.test(s) ? formatDisplayDate(s) : s;
};

/** What tells this record from the format's other records: its position, period, trainee… */
/**
 * THE RECORDS NUMBERED IN PLACE OF DETAILS (REQUIREMENTS §226, §233; the owner, 16-Nov-2026, of F/QC/11's list and then
 * F/QC/12's: "remove detail from screen and instead of that add serial number"; asked: a running number, 1, 2, 3 in
 * date order). The oldest record is 1; a new one continues the count (engine/runningNumbers.ts).
 */
const runningNumbers = (doc: DocumentDefinition, records: RecordInstance[]): Map<string, string> | null => numberedRecords(doc.id, records);

function describeRecord(doc: DocumentDefinition, record: RecordInstance, lang: Language, numbers?: Map<string, string> | null): string {
  if (numbers) return numbers.get(record.id) ?? "";
  const header = (record.data as LogSheetData | undefined)?.header ?? {};
  // F/QC/17: the ruler's Serial number, in its own column (REQUIREMENTS §220).
  if (isRulerVerification(doc.id)) return String(header.serialNo ?? "").trim();
  const hr = hrPageForDocument(doc.id);
  if (hr?.labelKey && shownValue(header[hr.labelKey])) return shownValue(header[hr.labelKey]);
  // Read with the boxes of the revision the record was filled on (REQUIREMENTS §74).
  const layout = documentLayoutIn(getLogSheetLayoutForRecord(doc.id, record), lang);
  const first = layout?.headerFields.find((f) => shownValue(header[f.key]));
  return first ? `${first.label}: ${shownValue(header[first.key])}` : "";
}

/** "80 of 80": the lines with something written in them, of the lines on the sheet. */
function linesFilled(doc: DocumentDefinition, record: RecordInstance): string {
  // Counted in the record's own revision's columns: F/MNT/11's 2024 page wrote
  // Day and Night readings, which the current revision has no column for (§74).
  const layout = getLogSheetLayoutForRecord(doc.id, record);
  const rows = (record.data as LogSheetData | undefined)?.rows;
  if (!layout || !rows) return "—";
  const filled = rows.filter((row) => layout.columns.some((c) => !c.fixed && String(row[c.key] ?? "").trim() !== "")).length;
  return `${filled} of ${rows.length}`;
}

// THE LINES OF THE RECORDS TABLE, drawn a batch at a time (REQUIREMENTS §65).
//
// A daily format has a record for every day of the year so far — by September
// 255 of them, seven cells each with a badge and a button: about 5,200 elements,
// which the browser then measures column by column to size an auto-laid-out
// table. That was most of the second those pages took to open on a slow laptop
// (F/QC/13 and F/QC/34 were the two that were noticed; every daily format was
// the same).
//
// A component of its own because the hook cannot go in the page — the page
// returns early, above where `records` exists. The COUNTS on the tiles above
// still come from the whole list, so nothing on the page is ever short; only
// the drawing is spread out. First forty at once, then sixty a frame, and
// everything before a print (utils/useProgressive.ts).
function RecordLines({
  doc,
  records,
  lang,
  selectedId,
  onSelect,
  onOpen,
  numbers,
}: {
  doc: DocumentDefinition;
  records: RecordInstance[];
  lang: Language;
  numbers?: Map<string, string> | null;
  selectedId?: string;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const shownCount = useProgressiveCount(records.length, 40, 60);
  return (
    <>
      {records.slice(0, shownCount).map((r) => (
        <tr
          key={r.id}
          data-record={r.id}
          className={`card-clickable ${selectedId === r.id ? "is-selected" : ""}`}
          onClick={() => onSelect(r.id)}
          title="Show this record below"
        >
          <td className="font-semibold">{formatDisplayDate(r.dueDate)}</td>
          <td className="text-sm" translate="no">
            {describeRecord(doc, r, lang, numbers) || <span className="text-faint">—</span>}
          </td>
          <td className="text-sm">{linesFilled(doc, shownOnItsDay(doc, r, masterRepository.get()))}</td>
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
                onOpen(r.id);
              }}
            >
              Open <FiArrowRight size={12} />
            </button>
          </td>
        </tr>
      ))}
    </>
  );
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
  const t = useT();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The month the list is for (REQUIREMENTS §227): this month, or every month for a document filled once a quarter or less.
  const [period, setPeriodState] = useState<RecordsPeriod>(() => {
    const t = todayISO();
    const kind = documentRepository.getById(docId)?.schedule.type;
    return { year: Number(t.slice(0, 4)), month: kind === "yearly" || kind === "half-yearly" || kind === "quarterly" ? "all" : Number(t.slice(5, 7)) - 1 };
  });
  const setPeriod = (p: RecordsPeriod) => {
    setPeriodState(p);
    setSelectedId(null);
  };
  const [cvOpen, setCvOpen] = useState(false);
  // Opening a format's page is a line of the activity log (REQUIREMENTS §62).
  React.useEffect(() => {
    const d = documentRepository.getById(docId);
    if (d) logActivity("Document opened", `${d.formatNo.startsWith("TO BE") ? "" : `${d.formatNo} `}${d.name}`, "", d.id);
  }, [docId]);

  // This month's due sheet exists before the page shows the records — in an
  // effect keyed on the document, which redraws only when it really made one
  // (utils/useEnsureMonth.ts, REQUIREMENTS §65). It used to run from inside the
  // render on every bump: a generator pass and a write to storage per keystroke
  // saved anywhere in the app.
  const thisMonth = new Date();
  useEnsureMonth(thisMonth.getFullYear(), thisMonth.getMonth(), [docId]);
  // ...and the month the bar is on, an earlier or a later one (REQUIREMENTS §248; the owner, 17-Nov-2026: "in qc-11 and qc-12
  // when i have clicked on next month then documents has not coming"): its records made by the frequency, as the month's
  // own morning would make them - December's Tuesdays for F/QC/11, its sheet for F/QC/12.
  useEnsureMonth(period.year, period.month === "all" ? thisMonth.getMonth() : period.month, [docId]);
  // F/QC/11 and F/QC/12: each sheet's Serial No box holds the record's running number shown below (REQUIREMENTS §233),
  // a new record's too - written when the list changes, only where the box needs it.
  React.useEffect(() => {
    if (serialNumbersOnSheets(docId) > 0) bump();
  }, [docId, version, bump]);

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
  // Newest first; of two on one day, the one started last (REQUIREMENTS §93).
  const records = (recordRepository.query({ documentId: doc.id, isDemo }) as RecordInstance[])
    .slice()
    .sort((a, b) => compareISO(b.dueDate, a.dueDate) || rulerOrder(a, b) || (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  // WHAT IS SHOWN BELOW THE TABLE (REQUIREMENTS §93): the record New opens —
  // today's sheet, or the sheet of the week, month or year today is in — then
  // the latest one not dated ahead. The month's sheets are made ahead of their
  // days, so "the newest" was a blank sheet for the 31st, not the record just started.
  // ...of the month chosen above the list (REQUIREMENTS §227): its records only; this month's shows the record New opens.
  const listed = records.filter((r) => inPeriod(r.dueDate, period));
  const covering = recordCoveringDate(doc, today, isDemo);
  const shown =
    listed.find((r) => r.id === selectedId) ??
    (covering && inPeriod(covering.dueDate, period) ? covering : undefined) ??
    listed.find((r) => compareISO(r.dueDate, today) <= 0) ??
    listed[0];
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
  // (a sheet whose day has not come shows blank, here and in its print and downloads: §299)
  const preview = shown ? shownOnItsDay(doc, shown, master, today) : blank;
  const next = doc.schedule.type === "as-required" ? null : nextDueDate(doc, today);
  const done = records.filter((r) => DONE.has(r.status)).length;
  // F/QC/17: Serial number in place of Details (the owner, 15-Nov-2026, REQUIREMENTS §220).
  const numbers = runningNumbers(doc, records);
  const detailsTitle = isRulerVerification(doc.id) || numbers ? "Serial number" : hr?.labelTitle ?? "Details";

  const startRecord = () => {
    // New record: this period's record first, then the next one's (REQUIREMENTS §211, engine/newRecord.ts).
    const { record, notice } = newRecordFromButton(doc, isDemo, today);
    noteOnOpen(record.id, notice);
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
          {mayDo(doc.id, "format") && (
            <button
              className="btn btn-secondary btn-sm"
              data-action="edit-format"
              aria-pressed={designing}
              onClick={() => (canDesignGrid(doc) ? setDesigningId(doc.id) : setEditingFormat(true))}
              title={`Now Rev ${doc.revisionNo}`}
            >
              <FiEdit3 size={12} /> Edit format
            </button>
          )}
          {/* Not beside a sheet being designed: it would file a record before the pop-up could ask about leaving. */}
          {!doc.isReferenceOnly && !designing && mayDo(doc.id, "start") && (
            <button className="btn btn-primary btn-sm" data-action="document-new-record" onClick={startRecord}>
              <FiPlus size={12} /> New record
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(hr ? "/hr" : `/library/${moduleSlug(doc.module)}`)}>
            <FiBookOpen size={12} /> {hr ? "All HR records" : "Document Library"}
          </button>
        </div>
      </div>
      {/* The document's description is not drawn here (the owner, 6-Nov-2026, REQUIREMENTS §193): the page is the format's name, its
          number and its records; the description stays in the catalogue for Mitra and the search. */}
      {/* Why New record or Edit format is not here, for a person whose level stops it (REQUIREMENTS §96). */}
      <AccessReason documentId={doc.id} action={doc.isReferenceOnly ? "format" : "start"} className="mb-4" />
      {doc.id === "hr-induction-staff" && !isDemo && !designing && mayDo(doc.id, "format") && <InductionFillCard onChanged={bump} />}

      {/* No button for the supplied original (the owner, 15-Nov-2026, REQUIREMENTS §210): the page is the format and its records. */}
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

          <MonthBar value={period} onChange={setPeriod} years={Array.from(new Set(records.map((r) => Number(r.dueDate.slice(0, 4))).filter((y) => y > 2000)))} today={today} />
          <div className="doc-table">
            <table className="compact records-list" data-table="document-records">
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
                {records.length > 0 && listed.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-muted text-center" style={{ padding: 20 }} data-state="month-empty">
                      No record dated in {period.month === "all" ? "any month" : `${MONTH_NAMES[period.month]} ${period.year}`} — choose another month, or All months.
                    </td>
                  </tr>
                )}
                <RecordLines
                  doc={doc}
                  records={listed}
                  lang={lang}
                  numbers={numbers}
                  selectedId={shown?.id}
                  onSelect={setSelectedId}
                  onOpen={(id) => navigate(routeForRecord(doc, id))}
                />
              </tbody>
            </table>
          </div>
          {listed.length > 1 && <div className="text-xs text-muted mt-2">Click a line to show that record below; Open takes it to its own page to fill in, submit or verify.</div>}

          {layout && preview && (
            <div className="mt-5" data-section="document-preview" data-record={preview.id}>
              <div className="flex items-center justify-between wrap gap-2 mb-2">
                <h2 className="text-lg">{shown ? `On file — ${numbers ? `Serial number ${numbers.get(shown.id) ?? ""} · ${formatDisplayDate(shown.dueDate)}` : describeRecord(doc, shown, lang) || formatDisplayDate(shown.dueDate)}` : records.length > 0 && period.month !== "all" ? `Blank format — nothing dated in ${MONTH_NAMES[period.month]} ${period.year}` : "Blank format — nothing on file yet"}</h2>
                <div className="flex items-center gap-2 wrap">
                  {shown && <StatusBadge status={shown.status} />}
                  {shown ? (
                    <button className="btn btn-primary btn-sm" data-action="open-shown-record" onClick={() => navigate(routeForRecord(doc, shown.id))}>
                      Open record <FiExternalLink size={12} />
                    </button>
                  ) : mayDo(doc.id, "start") ? (
                    <button className="btn btn-primary btn-sm" data-action="start-from-blank" onClick={startRecord}>
                      <FiPlus size={12} /> Start this record
                    </button>
                  ) : null}
                  <DownloadDocumentButton doc={doc} dateISO={preview?.dueDate} />
                  <button className="btn btn-secondary btn-sm" onClick={() => printDocument()}>
                    <FiPrinter size={12} /> Print
                  </button>
                </div>
              </div>
              {/* The form as issued, in the chosen language (REQUIREMENTS §58), and the part that prints (utils/print.ts). */}
              <div data-print-doc data-print-fill={printFillOf(doc)} data-format-id={doc.id} data-format-asof={formulaTimeOf(preview)}>
                <LogSheetRecordView key={preview.id} doc={doc} record={preview as RecordInstance<LogSheetData>} editable={false} onChange={() => undefined} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
