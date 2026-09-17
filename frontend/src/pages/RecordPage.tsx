import React, { useCallback, useEffect, useRef, useState } from "react";
import { FiArrowLeft } from "react-icons/fi";
import { useRouter } from "../store/router";
import { useAppStore } from "../store/AppStore";
import { recordRepository } from "../data/repositories/recordRepository";
import { documentRepository } from "../data/repositories/documentRepository";
import {
  isCorrectableStatus,
  isEditableStatus,
  rejectRecord,
  cancelCorrection,
  correctionChanges,
  reopenForCorrection,
  resumeAfterRejection,
  saveDraft,
  submitRecord,
  verifyRecord,
} from "../engine/recordLifecycle";
import { withEditHistory } from "../engine/recordHistory";
import { fieldLabels } from "../engine/recordPatch";
import { reprepareRecord } from "../engine/assistantPrepare";
import { getLogSheetLayout } from "../data/seed/logSheetLayouts";
import type {
  ComplaintAckData,
  DailyPestMonitoringData,
  FlyCatcherData,
  LogSheetData,
  PestResponsibilitiesData,
  RecordInstance,
  ServiceAgreementData,
  ServiceReportData,
} from "../types";
import { DailyPestMonitoringRecordView } from "../components/records/DailyPestMonitoringRecordView";
import { FlyCatcherRecordView } from "../components/records/FlyCatcherRecordView";
import { ServiceReportRecordView } from "../components/records/ServiceReportRecordView";
import { LogSheetRecordView } from "../components/records/LogSheetRecordView";
import { ComplaintAckRecordView } from "../components/records/ComplaintAckRecordView";
import { ServiceAgreementRecordView } from "../components/records/ServiceAgreementRecordView";
import { PestResponsibilitiesRecordView } from "../components/records/PestResponsibilitiesRecordView";
import { PreparedBanner } from "../components/records/PreparedBanner";
import { RecordActionBar } from "../components/records/RecordActionBar";
import { CorrectionBanner, ErrorList, RecordHistoryPanel } from "../components/records/RecordHistoryPanel";
import { StatusBadge } from "../components/common/StatusBadge";
import { DemoTag } from "../components/common/DemoTag";
import { NotYourDepartment } from "../components/common/NotYourDepartment";
import { useSetAssistantTarget } from "../store/AssistantContext";
import { useT } from "../i18n";
import { formatDisplayDate, todayISO } from "../utils/date";
import { printDocument } from "../utils/print";
import { DownloadDocumentButton } from "../components/common/DownloadDocumentButton";
import { deleteRecordWithTrail } from "../engine/recordCrud";

// Record kinds this page renders AND the assistant has a field guide for.
const ASSISTANT_KINDS = new Set(["daily-pest-monitoring", "fly-catcher", "service-report", "log-sheet", "complaint-ack", "pest-responsibilities", "service-agreement"]);
// A change is saved this long after the last keystroke — nobody has to
// remember a Save button, and leaving the page mid-edit loses nothing.
const AUTOSAVE_MS = 700;
// The customer's representative countersigns a service report while it waits
// for verification (Verify requires that signature), so that one field stays
// writable then — see ServiceReportRecordView.
const COUNTERSIGN_STATUSES = ["Submitted", "Pending Verification"];
// The statuses a record can be verified from — the same set the action bar uses.
const VERIFIABLE_STATUSES = ["Submitted", "Pending Verification"];

export function RecordPage({ recordId }: { recordId?: string }) {
  const { navigate } = useRouter();
  const { currentUser, bump } = useAppStore();
  const t = useT();
  const [record, setRecord] = useState<RecordInstance | undefined>(() => (recordId ? recordRepository.getById(recordId) : undefined));
  const [data, setData] = useState<unknown>(record?.data);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [errorsFor, setErrorsFor] = useState<"submit" | "verify">("submit");

  const doc = record ? documentRepository.getById(record.documentId) : undefined;
  const editable = !!record && isEditableStatus(record.status);
  const countersign = !!record && doc?.kind === "service-report" && COUNTERSIGN_STATUSES.includes(record.status);
  const canWrite = editable || countersign;
  const labels = doc ? fieldLabels(doc.kind, doc.id) : {};

  // What the page's own buttons do, for the assistant to call. The target is
  // registered above where the handlers are declared (hooks can't move below
  // the "record not found" return), so it goes through this ref.
  const actions = useRef<{
    submit?: () => { ok: boolean; errors: string[] };
    verify?: () => { ok: boolean; errors: string[] };
    cancelCorrection?: () => void;
    remove?: (reason: string) => void;
  }>({});

  // The latest values, for callbacks that outlive a render (the autosave
  // timer, leaving the page, the assistant committing a change).
  const latest = useRef({ record, data, dirty, canWrite, labels });
  latest.current = { record, data, dirty, canWrite, labels };

  const persistLocal = useCallback(
    (updated: RecordInstance) => {
      latest.current = { ...latest.current, record: updated, data: updated.data, dirty: false };
      setRecord(updated);
      setData(updated.data);
      setDirty(false);
      bump();
    },
    [bump]
  );

  /** Saves any pending edit now (with its change history) and returns the saved record. */
  const flush = useCallback((): RecordInstance | undefined => {
    const { record: r, data: d, dirty: isDirty, canWrite: w, labels: l } = latest.current;
    if (!r) return undefined;
    if (!isDirty || !w) return r;
    const updated = saveDraft(r, d, currentUser, { labels: l });
    persistLocal(updated);
    return updated;
  }, [currentUser, persistLocal]);

  useEffect(() => {
    flush(); // anything pending on the record we're leaving
    const r = recordId ? recordRepository.getById(recordId) : undefined;
    latest.current = { ...latest.current, record: r, data: r?.data, dirty: false };
    setRecord(r);
    setData(r?.data);
    setDirty(false);
    setErrors([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId]);

  // Autosave, a moment after the last change.
  useEffect(() => {
    if (!dirty || !canWrite) return;
    const h = window.setTimeout(() => flush(), AUTOSAVE_MS);
    return () => window.clearTimeout(h);
  }, [data, dirty, canWrite, flush]);

  // Leaving the page — inside the app or by closing the tab — never loses a change.
  useEffect(() => () => void flush(), [flush]);
  useEffect(() => {
    if (!dirty) return;
    const onLeave = () => void flush();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty, flush]);

  const handleChange = (next: unknown) => {
    setData(next);
    setDirty(true);
  };

  // For log sheets the assistant needs the printed layout to map "11 o'clock
  // viscosity was 20.4" onto the right cell — sent alongside the data, never
  // stored, and stripped from anything it sends back.
  const layout = doc?.kind === "log-sheet" ? getLogSheetLayout(doc.id) : undefined;
  const assistantData = layout
    ? {
        ...(data as Record<string, unknown>),
        _layout: {
          headerFields: [...layout.headerFields, ...(layout.footerFields ?? [])].map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options })),
          columns: layout.columns.map((c) => ({ key: c.key, label: c.label, type: c.type, unit: c.unit, fixed: c.fixed, options: c.options })),
          rowMode: layout.rowMode.kind,
          ...(layout.rowMode.kind === "timeSlots" ? { slotKey: layout.rowMode.slotKey } : {}),
        },
      }
    : data;

  useSetAssistantTarget(
    doc && record && ASSISTANT_KINDS.has(doc.kind)
      ? {
          documentKind: doc.kind,
          documentId: doc.id,
          recordId: record.id,
          status: record.status,
          editable,
          currentData: assistantData,
          getData: () => latest.current.data,
          labels,
          commit: (next, note) => {
            const base = flush() ?? latest.current.record;
            if (!base) return;
            persistLocal(saveDraft(base, next, currentUser, { action: "assistant-edit", note, labels: latest.current.labels }));
          },
          reopen: isCorrectableStatus(record.status)
            ? (reason) => {
                const base = flush() ?? latest.current.record;
                if (base) persistLocal(reopenForCorrection(base, currentUser, reason));
              }
            : undefined,
          // The rest of what the buttons do, so the assistant can do it too —
          // typed or spoken (engine/assistantCommands.ts).
          title: `${doc.name} for ${formatDisplayDate(record.dueDate)}`,
          submit: editable ? () => actions.current.submit?.() ?? { ok: false, errors: ["This record can't be submitted."] } : undefined,
          verify: VERIFIABLE_STATUSES.includes(record.status) ? () => actions.current.verify?.() ?? { ok: false, errors: ["This record can't be verified."] } : undefined,
          cancelCorrection: record.correction && canWrite ? () => actions.current.cancelCorrection?.() : undefined,
          remove: (reason: string) => actions.current.remove?.(reason),
          print: () => printDocument(),
        }
      : null
  );

  if (!record) {
    return (
      <div className="empty-state">
        <h2 className="text-xl mb-2">Record not found</h2>
        <button className="btn btn-secondary" onClick={() => navigate("/calendar")}>
          <FiArrowLeft size={13} /> Back to Calendar
        </button>
      </div>
    );
  }

  // A scoped lookup that finds nothing almost always means this record belongs
  // to a department the account may not see (REQUIREMENTS §40) rather than
  // that anything is broken, so the unscoped lookup tells the two apart: if the
  // plant still holds the definition this is a department refusal, and it is
  // shown before any of the record's own values are rendered. Only a definition
  // that has really gone (a withdrawn format whose records outlived it) keeps
  // the old message, which would otherwise send somebody hunting a bug that
  // isn't there.
  if (!doc) {
    const unscoped = documentRepository.getByIdUnscoped(record.documentId);
    if (unscoped) return <NotYourDepartment documentId={unscoped.id} formatNo={unscoped.formatNo} what="record" />;
    return <div className="empty-state">Document definition missing for this record.</div>;
  }

  const handleSave = () => void flush();

  const handleSubmit = (): { ok: boolean; errors: string[] } => {
    const saved = flush() ?? record;
    const { record: updated, result } = submitRecord(doc, saved, currentUser);
    if (!result.valid) {
      setErrorsFor("submit");
      setErrors(result.errors);
      return { ok: false, errors: result.errors };
    }
    setErrors([]);
    persistLocal(updated);
    return { ok: true, errors: [] };
  };

  const handleVerify = (): { ok: boolean; errors: string[] } => {
    const saved = flush() ?? record;
    const { record: updated, result } = verifyRecord(doc, saved, currentUser);
    if (!result.valid) {
      setErrorsFor("verify");
      setErrors(result.errors);
      return { ok: false, errors: result.errors };
    }
    setErrors([]);
    persistLocal(updated);
    return { ok: true, errors: [] };
  };

  const handleReject = (reason: string) => persistLocal(rejectRecord(flush() ?? record, currentUser, reason));
  const handleResume = () => persistLocal(resumeAfterRejection(record, currentUser));
  const handleCorrect = (reason: string) => {
    setErrors([]);
    persistLocal(reopenForCorrection(flush() ?? record, currentUser, reason));
  };

  // Pressed Edit and there was nothing to put right (or a change of mind):
  // the record goes back exactly as it was, at the status it came from.
  const handleCancelCorrection = () => {
    setErrors([]);
    persistLocal(cancelCorrection(flush() ?? record, currentUser, labels));
  };
  // Counted against what is on screen, including an edit not yet autosaved.
  const undoneChanges = record.correction ? correctionChanges({ ...record, data }, labels).length : 0;

  // Delete is offered whatever the status now; a signed-off record takes a
  // reason, and every deletion is recorded (engine/recordCrud.ts).
  const handleDelete = (reason: string) => {
    latest.current = { ...latest.current, dirty: false }; // nothing left to save
    deleteRecordWithTrail(record, currentUser, reason);
    bump();
    navigate("/calendar");
  };

  // "Fill again" replaces the form with a fresh fill from the assistant; the
  // history records exactly what that changed.
  const handleReprepare = () => {
    const before = flush() ?? record;
    const refreshed = reprepareRecord(record.id);
    if (!refreshed) return;
    const logged = withEditHistory({ ...refreshed, data: before.data, history: before.history }, refreshed.data, "Assistant", {
      action: "assistant-edit",
      note: t("record.filledAgain"),
      labels,
    });
    persistLocal(recordRepository.upsert(logged));
  };

  actions.current = { submit: handleSubmit, verify: handleVerify, cancelCorrection: handleCancelCorrection, remove: handleDelete };

  const overdue = record.dueDate < todayISO() && ["Scheduled", "Due", "In Progress"].includes(record.status);

  return (
    <div className={record.isDemo ? "demo-watermark" : ""}>
      <div className="flex items-center justify-between mb-3 no-print">
        <button className="btn btn-ghost btn-sm" onClick={() => window.history.back()}>
          <FiArrowLeft size={13} /> Back
        </button>
        <div className="flex items-center gap-2">
          {record.isDemo && <DemoTag />}
          <StatusBadge status={record.status} overdue={overdue} />
        </div>
      </div>

      {record.correction && <CorrectionBanner correction={record.correction} onCancel={canWrite ? handleCancelCorrection : undefined} />}

      {record.prepared && <PreparedBanner prepared={record.prepared} status={record.status} onReprepare={editable ? handleReprepare : undefined} />}

      {record.status === "Rejected" && record.rejectionReason && (
        <div className="card mb-4" style={{ borderColor: "var(--color-danger)", background: "var(--color-danger-bg)" }}>
          <div className="card-pad text-sm">
            <strong>Rejected</strong> by <span translate="no">{record.rejectedBy}</span> — {record.rejectionReason}
          </div>
        </div>
      )}

      <ErrorList errors={errors} heading={errorsFor === "verify" ? t("record.fixBeforeVerify") : t("record.fixBeforeSubmit")} />

      {/* The form exactly as issued — Google Translate leaves it alone (i18n/googleTranslate.ts). */}
      {/* ...and the part that prints (utils/print.ts): the form, nothing around it. */}
      <div className="notranslate" translate="no" data-print-doc>
      {doc.kind === "daily-pest-monitoring" && (
        <DailyPestMonitoringRecordView doc={doc} record={{ ...record, data: data as DailyPestMonitoringData }} editable={editable} onChange={handleChange} />
      )}
      {doc.kind === "fly-catcher" && <FlyCatcherRecordView doc={doc} record={{ ...record, data: data as FlyCatcherData }} editable={editable} onChange={handleChange} />}
      {doc.kind === "service-report" && (
        <ServiceReportRecordView
          doc={doc}
          record={{ ...record, data: data as ServiceReportData }}
          editable={editable}
          countersignEditable={countersign}
          onChange={handleChange}
        />
      )}
      {doc.kind === "log-sheet" && <LogSheetRecordView doc={doc} record={{ ...record, data: data as LogSheetData }} editable={editable} onChange={handleChange} />}
      {doc.kind === "complaint-ack" && (
        <ComplaintAckRecordView doc={doc} record={{ ...record, data: data as ComplaintAckData }} editable={editable} onChange={handleChange} />
      )}
      {doc.kind === "service-agreement" && (
        <ServiceAgreementRecordView doc={doc} record={{ ...record, data: data as ServiceAgreementData }} editable={editable} onChange={handleChange} />
      )}
      {doc.kind === "pest-responsibilities" && (
        <PestResponsibilitiesRecordView doc={doc} record={{ ...record, data: data as PestResponsibilitiesData }} editable={editable} onChange={handleChange} />
      )}
      </div>
      {doc.kind === "training-record" && (
        <div className="empty-state">
          Training records open in the Training module.{" "}
          <button className="btn btn-primary btn-sm" onClick={() => navigate(`/training/${record.id}`)}>
            Open there
          </button>
        </div>
      )}

      <div className="card mt-4 no-print">
        <div className="card-pad flex gap-6 wrap text-xs text-muted">
          <div>Created: {new Date(record.createdAt).toLocaleString()}</div>
          {record.prepared && <div>Prepared by assistant: {new Date(record.prepared.at).toLocaleString()}</div>}
          {record.submittedAt && (
            <div>
              Submitted: {new Date(record.submittedAt).toLocaleString()} by <span translate="no">{record.submittedBy}</span>
            </div>
          )}
          {record.verifiedAt && (
            <div>
              Verified: {new Date(record.verifiedAt).toLocaleString()} by <span translate="no">{record.verifiedBy}</span>
            </div>
          )}
          <div>Last saved: {new Date(record.updatedAt).toLocaleString()}</div>
        </div>
      </div>

      <RecordHistoryPanel record={record} />

      <RecordActionBar
        status={record.status}
        dirty={dirty}
        isDemo={record.isDemo}
        saveState={canWrite ? (dirty ? "saving" : "saved") : undefined}
        onSave={handleSave}
        onSubmit={() => handleSubmit()}
        onVerify={() => handleVerify()}
        onReject={handleReject}
        onResume={handleResume}
        onCorrect={handleCorrect}
        onCancelCorrection={record.correction && canWrite ? handleCancelCorrection : undefined}
        correctionFromStatus={record.correction?.fromStatus}
        correctionChangeCount={undoneChanges}
        onPrint={() => printDocument()}
        download={<DownloadDocumentButton doc={doc} dateISO={record.dueDate} />}
        onDelete={handleDelete}
      />
    </div>
  );
}
