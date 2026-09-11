import React, { useState } from "react";
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
  reopenForCorrection,
  saveDraft,
  submitRecord,
  verifyRecord,
  rejectRecord,
  resumeAfterRejection,
} from "../engine/recordLifecycle";
import { withEditHistory } from "../engine/recordHistory";
import { RecordActionBar } from "../components/records/RecordActionBar";
import { CorrectionBanner, ErrorList, RecordHistoryPanel } from "../components/records/RecordHistoryPanel";
import { StatusBadge } from "../components/common/StatusBadge";
import { DemoTag } from "../components/common/DemoTag";
import { useSetAssistantTarget } from "../store/AssistantContext";
import { generateId } from "../utils/id";
import { formatDisplayDate, todayISO } from "../utils/date";
import { printDocument } from "../utils/print";
import { DocumentHeader } from "../components/documents/DocumentHeader";
import { PreparedBanner } from "../components/records/PreparedBanner";
import { reprepareRecord } from "../engine/assistantPrepare";
import { useT } from "../i18n";

const TRAINING_DOC_ID = "training-record";

export function TrainingListPage() {
  const t = useT();
  const { mode, bump } = useAppStore();
  const { navigate } = useRouter();
  const isDemo = mode === "demo";
  const records = recordRepository.query({ documentId: TRAINING_DOC_ID, isDemo }) as RecordInstance<TrainingRecordData>[];
  const doc = documentRepository.getById(TRAINING_DOC_ID)!;

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
    recordRepository.upsert(rec as RecordInstance);
    bump();
    navigate(`/training/${rec.id}`);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl mb-1">{t("training.title")}</h1>
          <p className="text-muted">{doc.description}</p>
        </div>
        <button className="btn btn-primary" onClick={createNew}>
          <FiPlus size={14} /> New Training Record
        </button>
      </div>
      <div className="doc-table">
        <table>
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
            {records.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted text-center" style={{ padding: 24 }}>
                  No training records yet.
                </td>
              </tr>
            )}
            {records
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
                    <button className="btn btn-ghost btn-sm">Open</button>
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
  const { navigate } = useRouter();
  const t = useT();
  const [record, setRecord] = useState<RecordInstance<TrainingRecordData> | undefined>(
    () => recordRepository.getById(recordId) as RecordInstance<TrainingRecordData> | undefined
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [errorsFor, setErrorsFor] = useState<"submit" | "verify">("submit");
  const doc = documentRepository.getById(TRAINING_DOC_ID)!;
  const employees = masterRepository.get().employees;

  const editable = !!record && isEditableStatus(record.status);

  const current = () => (recordRepository.getById(recordId) as RecordInstance<TrainingRecordData> | undefined) ?? record;

  // Every change is saved as it's made, with a line in the record's history.
  const applyPatch = (patch: Partial<TrainingRecordData>, opts: { action?: "edited" | "assistant-edit"; note?: string } = {}) => {
    const base = current();
    if (!base) return;
    const updated = saveDraft(base, { ...base.data, ...patch }, currentUser, opts) as RecordInstance<TrainingRecordData>;
    setRecord(updated);
    bump();
  };

  useSetAssistantTarget(
    record
      ? {
          documentKind: "training",
          documentId: doc.id,
          recordId: record.id,
          status: record.status,
          editable,
          currentData: record.data,
          getData: () => current()?.data,
          commit: (next, note) => applyPatch(next as TrainingRecordData, { action: "assistant-edit", note }),
          reopen: isCorrectableStatus(record.status)
            ? (reason) => {
                const base = current();
                if (!base) return;
                setRecord(reopenForCorrection(base, currentUser, reason) as RecordInstance<TrainingRecordData>);
                bump();
              }
            : undefined,
        }
      : null
  );

  if (!record) {
    return (
      <div className="empty-state">
        <h2 className="text-xl mb-2">Training record not found</h2>
        <button className="btn btn-secondary" onClick={() => navigate("/training")}>
          <FiArrowLeft size={13} /> Back
        </button>
      </div>
    );
  }

  const data = record.data;
  const update = applyPatch;

  const addAttendee = () => {
    update({ attendees: [...data.attendees, { id: generateId("att"), employeeName: "", department: "", attended: true }] });
  };
  const addTopic = () => update({ topics: [...data.topics, ""] });

  const handleSave = () => undefined; // every change is already saved as it's made
  const handleSubmit = () => {
    const { record: updated, result } = submitRecord(doc, record, currentUser);
    if (!result.valid) {
      setErrorsFor("submit");
      return setErrors(result.errors);
    }
    setErrors([]);
    setRecord(updated as RecordInstance<TrainingRecordData>);
    bump();
  };
  const handleVerify = () => {
    const { record: updated, result } = verifyRecord(doc, record, currentUser);
    if (!result.valid) {
      setErrorsFor("verify");
      return setErrors(result.errors);
    }
    setErrors([]);
    setRecord(updated as RecordInstance<TrainingRecordData>);
    bump();
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
  const handleDelete = () => {
    recordRepository.remove(record.id);
    bump();
    navigate("/training");
  };

  return (
    <div className={record.isDemo ? "demo-watermark" : ""}>
      <div className="flex items-center justify-between mb-3 no-print">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate("/training")}>
          <FiArrowLeft size={13} /> Back to Training list
        </button>
        <div className="flex items-center gap-2">
          {record.isDemo && <DemoTag />}
          <StatusBadge status={record.status} />
        </div>
      </div>

      {record.correction && <CorrectionBanner correction={record.correction} />}

      <ErrorList errors={errors} heading={errorsFor === "verify" ? t("record.fixBeforeVerify") : t("record.fixBeforeSubmit")} />

      {record.prepared && (
        <PreparedBanner
          prepared={record.prepared}
          status={record.status}
          onReprepare={
            editable
              ? () => {
                  const before = current() ?? record;
                  const refreshed = reprepareRecord(record.id) as RecordInstance<TrainingRecordData> | undefined;
                  if (!refreshed) return;
                  // Record exactly what the fresh fill changed.
                  const logged = withEditHistory({ ...refreshed, data: before.data, history: before.history }, refreshed.data, "Assistant", {
                    action: "assistant-edit",
                    note: t("record.filledAgain"),
                  });
                  setRecord(recordRepository.upsert(logged as RecordInstance) as RecordInstance<TrainingRecordData>);
                  bump();
                }
              : undefined
          }
        />
      )}

      {/* The document itself — the part that prints (utils/print.ts). */}
      <div data-print-doc>
      <DocumentHeader doc={doc} dateLabel={formatDisplayDate(data.trainingDate)} />

      <div className="card mt-4">
        <div className="card-pad flex gap-4 wrap">
          <div className="field" style={{ minWidth: 160 }}>
            <label>Training Date</label>
            <input type="date" className="input" disabled={!editable} value={data.trainingDate} onChange={(e) => update({ trainingDate: e.target.value })} />
          </div>
          <div className="field" style={{ minWidth: 220 }}>
            <label>Training Type</label>
            <input className="input" disabled={!editable} value={data.trainingType} onChange={(e) => update({ trainingType: e.target.value })} />
          </div>
          <div className="field" style={{ minWidth: 220 }}>
            <label>Trainer / Provider</label>
            <input className="input" disabled={!editable} value={data.trainerProvider} onChange={(e) => update({ trainerProvider: e.target.value })} />
          </div>
          <div className="field" style={{ minWidth: 220 }}>
            <label>Certificate / Reference</label>
            <input className="input" disabled={!editable} value={data.certificateRef} onChange={(e) => update({ certificateRef: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-header">
          <h3 className="text-base font-semibold">Topics Covered</h3>
          {editable && (
            <button className="btn btn-secondary btn-sm" onClick={addTopic}>
              <FiPlus size={13} /> Add Topic
            </button>
          )}
        </div>
        <div className="card-pad">
          {data.topics.map((t, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <span className="text-muted text-sm" style={{ width: 20 }}>
                {i + 1}.
              </span>
              <input
                className="input"
                disabled={!editable}
                value={t}
                onChange={(e) => update({ topics: data.topics.map((x, xi) => (xi === i ? e.target.value : x)) })}
              />
              {editable && (
                <button className="btn btn-ghost btn-icon" onClick={() => update({ topics: data.topics.filter((_, xi) => xi !== i) })}>
                  <FiTrash2 size={13} />
                </button>
              )}
            </div>
          ))}
          {data.topics.length === 0 && <p className="text-muted text-sm">No topics added.</p>}
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-header">
          <h3 className="text-base font-semibold">Attendees</h3>
          {editable && (
            <button className="btn btn-secondary btn-sm" onClick={addAttendee}>
              <FiPlus size={13} /> Add Attendee
            </button>
          )}
        </div>
        <div className="doc-table notranslate" translate="no" style={{ border: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th style={{ width: 90 }}>Attended</th>
                {editable && <th></th>}
              </tr>
            </thead>
            <tbody>
              {data.attendees.map((a) => (
                <tr key={a.id}>
                  <td>
                    <input
                      className="input input-sm"
                      list="employee-options"
                      disabled={!editable}
                      value={a.employeeName}
                      onChange={(e) =>
                        update({ attendees: data.attendees.map((x) => (x.id === a.id ? { ...x, employeeName: e.target.value } : x)) })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input input-sm"
                      disabled={!editable}
                      value={a.department}
                      onChange={(e) => update({ attendees: data.attendees.map((x) => (x.id === a.id ? { ...x, department: e.target.value } : x)) })}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      disabled={!editable}
                      checked={a.attended}
                      onChange={(e) => update({ attendees: data.attendees.map((x) => (x.id === a.id ? { ...x, attended: e.target.checked } : x)) })}
                    />
                  </td>
                  {editable && (
                    <td>
                      <button
                        className="btn btn-ghost btn-sm btn-icon"
                        onClick={() => update({ attendees: data.attendees.filter((x) => x.id !== a.id) })}
                      >
                        <FiTrash2 size={13} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {data.attendees.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-muted text-center" style={{ padding: 16 }}>
                    No attendees added.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <datalist id="employee-options">
          {employees.map((e) => (
            <option key={e.id} value={e.name} />
          ))}
        </datalist>
      </div>

      <div className="card mt-4">
        <div className="card-pad field">
          <label>Remarks</label>
          <textarea className="input" disabled={!editable} value={data.remarks} onChange={(e) => update({ remarks: e.target.value })} />
        </div>
      </div>

      </div>

      <RecordHistoryPanel record={record} />

      <RecordActionBar
        status={record.status}
        dirty={false}
        isDemo={record.isDemo}
        saveState="saved"
        onSave={handleSave}
        onSubmit={handleSubmit}
        onVerify={handleVerify}
        onReject={handleReject}
        onResume={handleResume}
        onCorrect={handleCorrect}
        onPrint={() => printDocument()}
        onDelete={handleDelete}
      />
    </div>
  );
}
