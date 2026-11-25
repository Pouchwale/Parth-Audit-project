import React, { useRef, useState } from "react";
import { MonthBar, inPeriod, periodOf, periodWords, yearsOf, type RecordsPeriod } from "../components/common/MonthBar";
import { formulaTimeOf } from "../../../indexing/formulaRuntime";
import { FiPlus, FiTrash2, FiArrowLeft } from "react-icons/fi";
import { useAppStore } from "../store/AppStore";
import { useRouter } from "../store/router";
import { recordRepository } from "../data/repositories/recordRepository";
import { documentRepository } from "../data/repositories/documentRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import type { RecordInstance, TrainingRecordData } from "../types";
import {
  isCorrectableStatus,
  isEditableStatus,
  cancelCorrection,
  correctionChanges,
  reopenForCorrection,
  saveDraft,
  submitRecord,
  verifyRecord,
  rejectRecord,
  resumeAfterRejection,
} from "../engine/recordLifecycle";
import { logRecordStarted } from "../engine/recordHistory";
import { printFillOf } from "../engine/printFill";
import { RecordActionBar } from "../components/records/RecordActionBar";
import { mayDo } from "../engine/departmentScope";
import { CorrectionBanner, ErrorList, RecordHistoryPanel } from "../components/records/RecordHistoryPanel";
import { StatusBadge } from "../components/common/StatusBadge";
import { DemoTag } from "../components/common/DemoTag";
import { NotYourDepartment } from "../components/common/NotYourDepartment";
import { useSetAssistantTarget } from "../store/AssistantContext";
import { generateId } from "../utils/id";
import { formatDisplayDate, todayISO } from "../utils/date";
import { printDocument } from "../utils/print";
import { DownloadDocumentButton } from "../components/common/DownloadDocumentButton";
import { deleteRecordWithTrail } from "../engine/recordCrud";
import { DocumentHeader } from "../components/documents/DocumentHeader";
import { useT } from "../i18n";
import { bindProps, trainingBind } from "../engine/roundTrip/bindingsFor";
import { waitsUntil } from "../engine/notBeforeDay";
import { TRAINING_LETTER } from "../data/seed/hrPapers357";

const TRAINING_DOC_ID = "training-record";

export function TrainingListPage() {
  const t = useT();
  const { mode, bump } = useAppStore();
  // The month the trainings are listed for (REQUIREMENTS §240): every month first, or one - by the training's date.
  const [period, setPeriod] = useState<RecordsPeriod>(() => periodOf(todayISO(), "all"));
  const { navigate, back } = useRouter();
  const isDemo = mode === "demo";
  const records = recordRepository.query({ documentId: TRAINING_DOC_ID, isDemo }) as RecordInstance<TrainingRecordData>[];
  const doc = documentRepository.getById(TRAINING_DOC_ID);

  // The training record belongs to Human Resources, so somebody from another
  // department who reaches this address by an old bookmark or a link is told
  // whose register it is instead of being shown the list and a "New Training
  // Record" button they must not use (REQUIREMENTS §40).
  if (!doc) return <NotYourDepartment documentId={TRAINING_DOC_ID} what="register" />;

  const createNew = () => {
    const now = new Date().toISOString();
    const rec: RecordInstance<TrainingRecordData> = {
      id: generateId("trn"),
      documentId: TRAINING_DOC_ID,
      periodKey: generateId("period"),
      dueDate: todayISO(),
      status: "In Progress",
      isDemo,
      data: {
        trainingDate: todayISO(),
        trainingType: "",
        trainerProvider: "",
        topics: [],
        attendees: [],
        certificateRef: "",
        remarks: "",
      },
      createdAt: now,
      updatedAt: now,
    };
    // In the activity log like any record a person starts (REQUIREMENTS §93).
    logRecordStarted(rec);
    recordRepository.upsert(rec as RecordInstance);
    bump();
    navigate(`/training/${rec.id}`);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl mb-1">{t("training.title")}</h1>
        </div>
        <button className="btn btn-primary" onClick={createNew}>
          <FiPlus size={14} /> New Training Record
        </button>
      </div>
      <MonthBar value={period} onChange={setPeriod} years={yearsOf(records.map((r) => r.data.trainingDate || r.dueDate))} today={todayISO()} />
      <div className="doc-table">
        <table className="records-list">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Trainer / Provider</th>
              <th>Attendees</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {records.filter((r) => inPeriod(r.data.trainingDate || r.dueDate, period)).length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted text-center" style={{ padding: 24 }}>
                  {records.length === 0 ? "No training records yet." : `No training in ${periodWords(period)} — choose another month, or All months.`}
                </td>
              </tr>
            )}
            {records
              .filter((r) => inPeriod(r.data.trainingDate || r.dueDate, period))
              .slice()
              .sort((a, b) => (a.data.trainingDate < b.data.trainingDate ? 1 : -1))
              .map((r) => (
                <tr key={r.id} className="card-clickable" onClick={() => navigate(`/training/${r.id}`)}>
                  <td>{formatDisplayDate(r.data.trainingDate)}</td>
                  <td>{r.data.trainingType || "—"}</td>
                  <td>
                    {r.data.trainerProvider || "—"} {r.isDemo && <DemoTag />}
                  </td>
                  <td>{r.data.attendees.length}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-ghost btn-sm">Open / Edit</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TrainingRecordPage({ recordId }: { recordId: string }) {
  const { currentUser, bump } = useAppStore();
  const { navigate, back } = useRouter();
  const t = useT();
  const [record, setRecord] = useState<RecordInstance<TrainingRecordData> | undefined>(
    () => recordRepository.getById(recordId) as RecordInstance<TrainingRecordData> | undefined
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [errorsFor, setErrorsFor] = useState<"submit" | "verify">("submit");
  const doc = documentRepository.getById(TRAINING_DOC_ID);
  const employees = masterRepository.get().employees;

  // Below Write on its document the record is read only (REQUIREMENTS §96, engine/departmentScope.ts).
  // ...and not before the first day it covers (REQUIREMENTS §201, engine/notBeforeDay.ts).
  const editable = !!record && isEditableStatus(record.status) && mayDo(record.documentId, "fill") && !waitsUntil(documentRepository.getById(record.documentId), record);

  const current = () => (recordRepository.getById(recordId) as RecordInstance<TrainingRecordData> | undefined) ?? record;

  // Every change is saved as it's made, with a line in the record's history.
  const applyPatch = (patch: Partial<TrainingRecordData>, opts: { action?: "edited" | "assistant-edit" | "imported"; note?: string } = {}) => {
    const base = current();
    if (!base) return;
    const updated = saveDraft(base, { ...base.data, ...patch }, currentUser, opts) as RecordInstance<TrainingRecordData>;
    setRecord(updated);
    bump();
  };

  // The page's own actions, for the assistant — the target is registered
  // before they are declared, so it calls them through this ref.
  const actions = useRef<{
    submit?: () => { ok: boolean; errors: string[] };
    verify?: () => { ok: boolean; errors: string[] };
    cancelCorrection?: () => void;
    remove?: (reason: string) => void;
  }>({});

  useSetAssistantTarget(
    // No `doc` means this isn't the viewer's department, and the assistant
    // must not be pointed at a training record they may not open — it would
    // read the record out to them (REQUIREMENTS §40).
    record && doc
      ? {
          documentKind: "training",
          documentId: doc.id,
          recordId: record.id,
          status: record.status,
          editable,
          currentData: record.data,
          getData: () => current()?.data,
          // Mitra's change, or one read back from an uploaded Word file ("imported", REQUIREMENTS §81).
          commit: (next, note, action) => applyPatch(next as TrainingRecordData, { action: action ?? "assistant-edit", note }),
          // A correction is Edit's step (REQUIREMENTS §96): below it Mitra is not handed a reopen at all.
          reopen:
            isCorrectableStatus(record.status) && mayDo(record.documentId, "correct")
              ? (reason) => {
                  const base = current();
                  if (!base) return;
                  setRecord(reopenForCorrection(base, currentUser, reason) as RecordInstance<TrainingRecordData>);
                  bump();
                }
              : undefined,
          correction: !!record.correction,
          // Everything the buttons do, so it can be asked for in words too.
          title: `the training record of ${formatDisplayDate(record.data.trainingDate || record.dueDate)}`,
          submit: editable ? () => actions.current.submit?.() ?? { ok: false, errors: [] } : undefined,
          verify: ["Submitted", "Pending Verification"].includes(record.status) ? () => actions.current.verify?.() ?? { ok: false, errors: [] } : undefined,
          cancelCorrection: record.correction ? () => actions.current.cancelCorrection?.() : undefined,
          remove: (reason: string) => actions.current.remove?.(reason),
          print: () => printDocument(),
        }
      : null
  );

  // Another department's training record, reached by a link or an address
  // typed by hand: whose it is, and not one word of the training itself. This
  // comes before "not found" on purpose — a person who may not see Human
  // Resources' records must be told that, not told whether this record exists
  // (REQUIREMENTS §40).
  if (!doc) return <NotYourDepartment documentId={TRAINING_DOC_ID} what="record" />;

  if (!record) {
    return (
      <div className="empty-state">
        <h2 className="text-xl mb-2">Training record not found</h2>
      </div>
    );
  }

  const data = record.data;
  const update = applyPatch;

  const addAttendee = () => {
    update({ attendees: [...data.attendees, { id: generateId("att"), employeeName: "", department: "" }] });
  };
  const addTopic = () => update({ topics: [...data.topics, ""] });

  const handleSave = () => undefined; // every change is already saved as it's made
  const handleSubmit = (): { ok: boolean; errors: string[] } => {
    const { record: updated, result } = submitRecord(doc, record, currentUser);
    if (!result.valid) {
      setErrorsFor("submit");
      setErrors(result.errors);
      return { ok: false, errors: result.errors };
    }
    setErrors([]);
    setRecord(updated as RecordInstance<TrainingRecordData>);
    bump();
    return { ok: true, errors: [] };
  };
  const handleVerify = (): { ok: boolean; errors: string[] } => {
    const { record: updated, result } = verifyRecord(doc, record, currentUser);
    if (!result.valid) {
      setErrorsFor("verify");
      setErrors(result.errors);
      return { ok: false, errors: result.errors };
    }
    setErrors([]);
    setRecord(updated as RecordInstance<TrainingRecordData>);
    bump();
    return { ok: true, errors: [] };
  };
  const handleReject = (reason: string) => {
    setRecord(rejectRecord(record, currentUser, reason) as RecordInstance<TrainingRecordData>);
    bump();
  };
  const handleResume = () => {
    setRecord(resumeAfterRejection(record, currentUser) as RecordInstance<TrainingRecordData>);
    bump();
  };
  const handleCorrect = (reason: string) => {
    setErrors([]);
    setRecord(reopenForCorrection(record, currentUser, reason) as RecordInstance<TrainingRecordData>);
    bump();
  };
  // Pressed Edit with nothing to put right: back as it was, at its old status.
  const handleCancelCorrection = () => {
    setErrors([]);
    setRecord(cancelCorrection(record, currentUser) as RecordInstance<TrainingRecordData>);
    bump();
  };
  // Any status can be deleted now; the deletion itself is recorded.
  const handleDelete = (reason: string) => {
    deleteRecordWithTrail(record, currentUser, reason);
    bump();
    // Deleted: back where the person was before the record (REQUIREMENTS §209), its list only when there is nothing behind.
    back("/training");
  };

  actions.current = { submit: handleSubmit, verify: handleVerify, cancelCorrection: handleCancelCorrection, remove: handleDelete };

  return (
    <div className={record.isDemo ? "demo-watermark" : ""}>
      <div className="flex items-center justify-between mb-3 no-print">
        {/* One Back button, the top bar's (REQUIREMENTS §207). */}
        <span />
        <div className="flex items-center gap-2">
          {record.isDemo && <DemoTag />}
          <StatusBadge status={record.status} />
        </div>
      </div>

      {record.correction && <CorrectionBanner correction={record.correction} onCancel={handleCancelCorrection} />}

      <ErrorList errors={errors} heading={errorsFor === "verify" ? t("record.fixBeforeVerify") : t("record.fixBeforeSubmit")} />

      {/* No "Your assistant has filled this in" message (the owner, 15-Nov-2026, REQUIREMENTS §218). */}

      {/* The document itself — the part that prints (utils/print.ts) — and whose
          values a downloaded file binds to this record (REQUIREMENTS §81). */}
      <div data-print-doc data-print-fill={printFillOf(doc)} data-bind-record={record.id} data-format-id={TRAINING_DOC_ID} data-format-asof={formulaTimeOf(record)}>
      {/* NO HEADER (the owner, 17-Nov-2026, REQUIREMENTS §251: "in training record remove header from Pest Control
          Awareness Training Program (annual) record"): Gurudev Pest Control's letterhead is off the record - on the page,
          on paper and in the Word file. The title and the Format No. / Rev No. / Date row came off it on 12-Sep-2026. */}

      {/* THE RECORD IS GURUDEV PEST CONTROL'S TRAINING LETTER ("Training - Yrl (1).doc", REQUIREMENTS §373): the room his
          letterhead stationery takes (left blank, §251), the date at the right, the plant as his letter addresses it, the
          subject, "Training Topics covered" and its bullets, the list of personnel who attended, numbered, and his sign-off.
          The record's own words stand where the letter writes them; what the letter has no place for is kept on the record
          under it, on the screen only. */}
      <div className="training-paper" data-section="training-letter">
        <div className="tp-date notranslate" translate="no">
          {TRAINING_LETTER.date}{" "}
          <input type="date" className="input tp-input tp-date-input" {...bindProps(trainingBind.field("trainingDate"))} disabled={!editable} value={data.trainingDate} onChange={(e) => update({ trainingDate: e.target.value })} aria-label="Training date" />
        </div>
        <div className="tp-to notranslate" translate="no">
          {TRAINING_LETTER.to.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <p className="tp-subject">{TRAINING_LETTER.subject}</p>
        <p className="tp-topics-head">{TRAINING_LETTER.topicsHeading}</p>
        <ul className="tp-topics">
          {data.topics.map((t, i) => (
            <li key={i}>
              <input
                className="input tp-input"
                {...bindProps(trainingBind.topic(i))}
                disabled={!editable}
                value={t}
                aria-label={`Topic ${i + 1}`}
                onChange={(e) => update({ topics: data.topics.map((x, xi) => (xi === i ? e.target.value : x)) })}
              />
              {editable && (
                <button className="btn btn-ghost btn-sm btn-icon tp-tool no-print" title="Remove this topic" aria-label={`Remove topic ${i + 1}`} onClick={() => update({ topics: data.topics.filter((_, xi) => xi !== i) })}>
                  <FiTrash2 size={13} />
                </button>
              )}
            </li>
          ))}
          {editable && (
            <li className="tp-add no-print">
              <button className="btn btn-secondary btn-sm" onClick={addTopic}>
                <FiPlus size={13} /> Add Topic
              </button>
            </li>
          )}
          <li>{TRAINING_LETTER.personnel}</li>
        </ul>
        <table className="tp-people">
          <tbody>
            {data.attendees.map((a, ai) => (
              <tr key={a.id}>
                <td className="tp-no">{ai + 1}.</td>
                <td>
                  <input
                    className="input tp-input"
                    {...bindProps(trainingBind.attendee(a, ai, "employeeName"))}
                    list="employee-options"
                    disabled={!editable}
                    value={a.employeeName}
                    aria-label={`Attendee ${ai + 1}`}
                    onChange={(e) => update({ attendees: data.attendees.map((x) => (x.id === a.id ? { ...x, employeeName: e.target.value } : x)) })}
                  />
                  {editable && (
                    <button className="btn btn-ghost btn-sm btn-icon tp-tool no-print" title="Remove this person" aria-label={`Remove attendee ${ai + 1}`} onClick={() => update({ attendees: data.attendees.filter((x) => x.id !== a.id) })}>
                      <FiTrash2 size={13} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {editable && (
          <div className="tp-add no-print">
            <button className="btn btn-secondary btn-sm" onClick={addAttendee}>
              <FiPlus size={13} /> Add Attendee
            </button>
          </div>
        )}
        <datalist id="employee-options">
          {employees.map((e) => (
            <option key={e.id} value={e.name} />
          ))}
        </datalist>
        <div className="tp-sign notranslate" translate="no">
          <input className="input tp-input" {...bindProps(trainingBind.field("trainerProvider"))} disabled={!editable} value={data.trainerProvider} aria-label="Trainer / Provider" onChange={(e) => update({ trainerProvider: e.target.value })} />
          <p className="tp-signatory">{TRAINING_LETTER.signatory}</p>
        </div>
      </div>
      </div>

      {/* What the letter has no place for, kept on the record: on the screen only, never printed (§373). */}
      <div data-bind-record={record.id}>
      <div className="card mt-4 no-print" data-section="training-off-paper">
        <div className="card-header">
          <h3 className="text-base font-semibold">Kept on the record, not on the letter</h3>
        </div>
        {/* The three written boxes share the row's room, and a programme's name and its reference wrap in theirs: read whole (the owner, 22-Oct-2026). */}
        <div className="card-pad flex gap-4 wrap">
          <div className="field" style={{ minWidth: 220, flex: "1 1 220px" }}>
            <label>Training Type</label>
            <textarea className="input input-cell-multiline wrap-text" rows={1} {...bindProps(trainingBind.field("trainingType"))} disabled={!editable} value={data.trainingType} onChange={(e) => update({ trainingType: e.target.value })} />
          </div>
          <div className="field" style={{ minWidth: 220, flex: "1 1 220px" }}>
            <label>Certificate / Reference</label>
            <textarea className="input input-cell-multiline wrap-text" rows={1} {...bindProps(trainingBind.field("certificateRef"))} disabled={!editable} value={data.certificateRef} onChange={(e) => update({ certificateRef: e.target.value })} />
          </div>
        </div>
        {data.attendees.length > 0 && (
          <div className="doc-table" style={{ border: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                </tr>
              </thead>
              <tbody>
                {data.attendees.map((a, ai) => (
                  <tr key={a.id}>
                    <td className="notranslate" translate="no">
                      {a.employeeName}
                    </td>
                    <td>
                      <input
                        className="input input-sm"
                        {...bindProps(trainingBind.attendee(a, ai, "department"))}
                        disabled={!editable}
                        value={a.department}
                        aria-label={`Attendee ${ai + 1}: department`}
                        onChange={(e) => update({ attendees: data.attendees.map((x) => (x.id === a.id ? { ...x, department: e.target.value } : x)) })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="card-pad field">
          <label>Remarks</label>
          <textarea className="input" {...bindProps(trainingBind.field("remarks"))} disabled={!editable} value={data.remarks} onChange={(e) => update({ remarks: e.target.value })} />
        </div>
      </div>
      </div>

      <RecordHistoryPanel record={record} />

      <RecordActionBar
        documentId={record.documentId}
        status={record.status}
        dirty={false}
        isDemo={record.isDemo}
        saveState="saved"
        onSave={handleSave}
        onSubmit={() => handleSubmit()}
        onVerify={() => handleVerify()}
        onReject={handleReject}
        onResume={handleResume}
        onCorrect={handleCorrect}
        onCancelCorrection={record.correction ? handleCancelCorrection : undefined}
        correctionFromStatus={record.correction?.fromStatus}
        correctionChangeCount={correctionChanges(record).length}
        onPrint={() => printDocument()}
        download={<DownloadDocumentButton doc={doc} dateISO={record.dueDate} />}
        onDelete={handleDelete}
      />
    </div>
  );
}
