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
import { withCalibration } from "../engine/calibration";
import { logActivity } from "../utils/activityLog";
import { recordLabel } from "../engine/recordHistory";
import { documentLayoutIn, documentTextIn, isGujaratiDocument } from "../i18n/documentText";
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

// What the page says when the record moved on under it (REQUIREMENTS §65). It
// does not say WHERE: a colleague's computer, or Today's Briefing in this very tab.
const changedElsewhere = (now: RecordInstance, typingSetAside: boolean): string =>
  `This record was changed elsewhere while it was open here and is now ${now.status}.${
    typingSetAside ? " What was typed here in the last moment was not saved." : ""
  } It is shown as it now stands.`;
const DELETED_ELSEWHERE = "This record was deleted while it was open here. The deletion is recorded in Document Library → Records deleted.";

export function RecordPage({ recordId }: { recordId?: string }) {
  const { navigate } = useRouter();
  const { currentUser, bump, lang, version } = useAppStore();
  const t = useT();
  const [record, setRecord] = useState<RecordInstance | undefined>(() => (recordId ? recordRepository.getById(recordId) : undefined));
  const [data, setData] = useState<unknown>(record?.data);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [errorsFor, setErrorsFor] = useState<"submit" | "verify">("submit");
  // Said once when a change made elsewhere took the place of what was on screen.
  const [notice, setNotice] = useState<string | null>(null);
  // Deleted with this page's own button: on its way to the calendar, nothing to adopt or save.
  const removedHere = useRef(false);

  const doc = record ? documentRepository.getById(record.documentId) : undefined;
  // Opening a record is a line of the activity log too (REQUIREMENTS §62) — once per visit, not for demo data.
  React.useEffect(() => {
    if (record && !record.isDemo) logActivity("Record opened", recordLabel(record), record.status, record.documentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId]);
  const editable = !!record && isEditableStatus(record.status);
  const countersign = !!record && doc?.kind === "service-report" && COUNTERSIGN_STATUSES.includes(record.status);
  const canWrite = editable || countersign;
  const labels = doc ? fieldLabels(doc.kind, doc.id) : {};
  // What the ASSISTANT calls each box: the words on screen. What goes into the
  // record's history is `labels` above, the words the form was issued in, so
  // two people correcting the same box in different languages leave the same
  // entry behind (REQUIREMENTS §58).
  const displayLabels =
    doc && lang === "en" && isGujaratiDocument(doc.id) ? Object.fromEntries(Object.entries(labels).map(([k, v]) => [k, documentTextIn(v, lang)])) : labels;

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
      setNotice(null);
      bump();
    },
    [bump]
  );

  // A COLLEAGUE'S CHANGE IS NEVER SAVED OVER (REQUIREMENTS §65). This page holds
  // its own copy of the record, because what is being typed lives here until the
  // autosave; a pull (data/serverSync.ts) can store a newer one underneath it at
  // any moment — a cell filled, the sheet submitted, verified or deleted on
  // another computer. adopt() puts the STORED record on screen in place of the
  // copy held; nothing is written. `why` is said only when something the person
  // did was set aside, never for a change that simply arrived.
  const adopt = useCallback((stored: RecordInstance | undefined, why?: string) => {
    latest.current = { ...latest.current, record: stored, data: stored?.data, dirty: false };
    setRecord(stored);
    setData(stored?.data);
    setDirty(false);
    setErrors([]); // they described a copy that is no longer on screen
    setNotice(why ?? null);
  }, []);

  /**
   * Saves any pending edit now (with its change history) and returns the record
   * AS STORED — so whatever the caller does next (submit, verify, send back,
   * reopen) is done to the record as it stands, not to the copy this page
   * opened with. Undefined when there is no record to act on: none open, or it
   * was deleted elsewhere — saving then would bring a deleted record back, here
   * and, through the merge, on every computer (REQUIREMENTS §65).
   */
  const flush = useCallback((): RecordInstance | undefined => {
    const { record: r, data: d, dirty: isDirty, canWrite: w, labels: l } = latest.current;
    if (!r || removedHere.current) return undefined;
    // Read again, the way GapPage, CapaPage and TrainingPage save from current().
    // updatedAt is compared, never identity: a pull parses every record anew.
    const stored = recordRepository.getById(r.id);
    if (!stored) {
      adopt(undefined, DELETED_ELSEWHERE);
      return undefined;
    }
    if (!isDirty || !w) {
      if (stored.updatedAt !== r.updatedAt) adopt(stored);
      return stored;
    }
    // Still open to the kind of writing that was being done here? A sheet that
    // was being filled in has to be editable still; the customer's countersign
    // (COUNTERSIGN_STATUSES) has to be waiting for verification still. Submitted,
    // verified or reopened elsewhere in the meantime: the stored record stands
    // and what was typed is NOT written — a signed-off record is changed only
    // through Correct, with a reason. The page says so.
    const stillOpen = isEditableStatus(r.status) ? isEditableStatus(stored.status) : COUNTERSIGN_STATUSES.includes(stored.status);
    if (!stillOpen) {
      adopt(stored, changedElsewhere(stored, true));
      return stored;
    }
    // Saved FROM the stored record, carrying this page's data: a colleague's
    // history lines, status and stamps survive, and withEditHistory diffs against
    // what is stored, so a cell they filled within the autosave's pause and this
    // save puts back is a recorded change with a name on it, not a silent loss.
    // (The later save still wins that race for the whole sheet — there is no
    // cell-by-cell merge of two people's typing.)
    const updated = saveDraft(stored, d, currentUser, { labels: l });
    persistLocal(updated);
    return updated;
  }, [currentUser, persistLocal, adopt]);

  useEffect(() => {
    flush(); // anything pending on the record we're leaving
    const r = recordId ? recordRepository.getById(recordId) : undefined;
    removedHere.current = false;
    latest.current = { ...latest.current, record: r, data: r?.data, dirty: false };
    setRecord(r);
    setData(r?.data);
    setDirty(false);
    setErrors([]);
    setNotice(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId]);

  // THE STORE MOVED ON: show the record as it now stands (REQUIREMENTS §65).
  // Every bump asks one question — is the stored record the one held? — by
  // updatedAt, so this page's own save (persistLocal holds exactly what upsert
  // stamped) and everybody's changes to OTHER records are a no-op. While
  // something typed is waiting for the autosave nothing is adopted, or the
  // typing would be thrown away: flush() reads the store again and decides.
  // A record that has gone is shown as gone at once — there is nothing left to
  // save it into. One that was not here yet when the page opened is shown when
  // it arrives.
  useEffect(() => {
    if (removedHere.current) return;
    const held = latest.current.record;
    const id = held?.id ?? recordId;
    if (!id) return;
    const stored = recordRepository.getById(id);
    if (!stored) {
      if (held) adopt(undefined, DELETED_ELSEWHERE);
      return;
    }
    if (held && (stored.updatedAt === held.updatedAt || latest.current.dirty)) return;
    adopt(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

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
    // THREE EVENTS, NOT ONE (REQUIREMENTS §72). beforeunload is the event
    // browsers are least willing to fire: a tab discarded under memory
    // pressure, a phone putting the app to sleep, or a connection lost while
    // the page sits in the background can all skip it. pagehide fires in those
    // cases, and a tab merely being hidden is caught too — whichever comes
    // first, the keystroke inside the autosave's pause is already written.
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    window.addEventListener("beforeunload", onLeave);
    window.addEventListener("pagehide", onLeave);
    document.addEventListener("visibilitychange", onHide);
    // The connection going is not itself a reason to lose anything: what is
    // typed goes to this computer's own storage now, and data/serverSync.ts
    // sends it to PostgreSQL when the database can be reached again.
    window.addEventListener("offline", onLeave);
    return () => {
      window.removeEventListener("beforeunload", onLeave);
      window.removeEventListener("pagehide", onLeave);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("offline", onLeave);
    };
  }, [dirty, flush]);

  // The two calibration records work their deviations out from what is written
  // (engine/calibration.ts, REQUIREMENTS §61) — whoever writes it.
  const handleChange = (next: unknown) => {
    setData(withCalibration(doc?.id, next));
    setDirty(true);
  };

  // For log sheets the assistant needs the printed layout to map "11 o'clock
  // viscosity was 20.4" onto the right cell — sent alongside the data, never
  // stored, and stripped from anything it sends back.
  const layout = doc?.kind === "log-sheet" ? documentLayoutIn(getLogSheetLayout(doc.id), lang) : undefined;
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
          labels: displayLabels,
          // Both start from flush(): the record as stored now, never a copy kept
          // from an earlier render (REQUIREMENTS §65). Mitra only commits to a
          // record she was told is editable (or has just reopened, a line above
          // in the same breath); one signed off elsewhere since is left alone.
          commit: (next, note) => {
            const base = flush();
            if (!base) return;
            if (!isEditableStatus(base.status)) {
              setNotice((said) => said ?? changedElsewhere(base, true));
              return;
            }
            persistLocal(saveDraft(base, withCalibration(doc?.id, next), currentUser, { action: "assistant-edit", note, labels: latest.current.labels }));
          },
          reopen: isCorrectableStatus(record.status)
            ? (reason) => {
                const base = flush();
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
        {/* It was here a moment ago: deleted elsewhere while open (REQUIREMENTS §65). */}
        {notice && (
          <p className="text-sm mb-3" data-record-notice>
            {notice}
          </p>
        )}
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

  // EVERY BUTTON ACTS ON THE RECORD AS STORED (REQUIREMENTS §65). flush() hands
  // it back, having adopted it if it moved on elsewhere. When it is no longer in
  // a status the button was offered for — somebody else already submitted,
  // verified or reopened it, or it has gone — nothing is done to it, the page
  // shows it as it stands and says why the press did nothing.
  const movedOn = (now: RecordInstance | undefined): { ok: boolean; errors: string[] } => {
    const why = now ? changedElsewhere(now, false) : DELETED_ELSEWHERE;
    if (now) setNotice((said) => said ?? why); // flush() may just have said more: that typing was set aside
    return { ok: false, errors: [why] };
  };

  const handleSubmit = (): { ok: boolean; errors: string[] } => {
    const saved = flush();
    if (!saved || !isEditableStatus(saved.status)) return movedOn(saved);
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
    const saved = flush(); // the customer's countersign, if it was just written
    if (!saved || !VERIFIABLE_STATUSES.includes(saved.status)) return movedOn(saved);
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

  const handleReject = (reason: string) => {
    const saved = flush();
    if (!saved || !VERIFIABLE_STATUSES.includes(saved.status)) return void movedOn(saved);
    persistLocal(rejectRecord(saved, currentUser, reason));
  };
  const handleResume = () => {
    const saved = flush();
    if (!saved || saved.status !== "Rejected") return void movedOn(saved);
    persistLocal(resumeAfterRejection(saved, currentUser));
  };
  const handleCorrect = (reason: string) => {
    setErrors([]);
    const saved = flush();
    if (!saved || !isCorrectableStatus(saved.status)) return void movedOn(saved);
    persistLocal(reopenForCorrection(saved, currentUser, reason));
  };

  // Pressed Edit and there was nothing to put right (or a change of mind):
  // the record goes back exactly as it was, at the status it came from.
  const handleCancelCorrection = () => {
    setErrors([]);
    const saved = flush();
    if (!saved || !saved.correction) return void movedOn(saved);
    persistLocal(cancelCorrection(saved, currentUser, labels));
  };
  // Counted against what is on screen, including an edit not yet autosaved.
  const undoneChanges = record.correction ? correctionChanges({ ...record, data }, labels).length : 0;

  // Delete is offered whatever the status now; a signed-off record takes a
  // reason, and every deletion is recorded (engine/recordCrud.ts).
  const handleDelete = (reason: string) => {
    latest.current = { ...latest.current, dirty: false }; // nothing left to save
    // The deletions log says what the record WAS: its status as stored now. One
    // already deleted elsewhere is not logged a second time.
    const stored = recordRepository.getById(record.id);
    if (!stored) return adopt(undefined, DELETED_ELSEWHERE);
    removedHere.current = true;
    deleteRecordWithTrail(stored, currentUser, reason);
    bump();
    navigate("/calendar");
  };

  // "Fill again" replaces the form with a fresh fill from the assistant; the
  // history records exactly what that changed.
  const handleReprepare = () => {
    const before = flush();
    if (!before || !isEditableStatus(before.status)) return void movedOn(before);
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

      {/* The record moved on elsewhere and something done here was set aside (REQUIREMENTS §65). Gone with the next save. */}
      {notice && (
        <div className="card mb-4 no-print" data-record-notice role="status" style={{ borderColor: "var(--color-warning)", background: "var(--color-warning-bg)" }}>
          <div className="card-pad text-sm">{notice}</div>
        </div>
      )}

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

      {/* The form as issued, in the language chosen beside Today's Briefing (REQUIREMENTS §58). */}
      {/* ...and the part that prints (utils/print.ts): the form, nothing around it. */}
      <div data-print-doc>
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
