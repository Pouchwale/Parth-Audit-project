import React, { useRef, useState } from "react";
import { FiPlus, FiTrash2, FiArrowLeft } from "react-icons/fi";
import { useAppStore } from "../store/AppStore";
import { useRouter } from "../store/router";
import { recordRepository } from "../data/repositories/recordRepository";
import { documentRepository } from "../data/repositories/documentRepository";
import { refreshGapFindingStatuses } from "../data/selectors";
import type { ComplaintAckData, GapFinding, GapInspectionData, RecordInstance } from "../types";
import { CAF_DOC_ID, CAF_FORMAT_REF, newComplaintAckData } from "../data/seed/complaintAck";
import {
  cancelCorrection,
  isCorrectableStatus,
  isEditableStatus,
  reopenForCorrection,
  saveDraft,
  submitRecord,
  verifyRecord,
  rejectRecord,
  resumeAfterRejection,
} from "../engine/recordLifecycle";
import { deleteRecordWithTrail } from "../engine/recordCrud";
import { RecordActionBar } from "../components/records/RecordActionBar";
import { CorrectionBanner, ErrorList, RecordHistoryPanel } from "../components/records/RecordHistoryPanel";
import { useT } from "../i18n";
import { StatusBadge } from "../components/common/StatusBadge";
import { DemoTag } from "../components/common/DemoTag";
import { NotYourDepartment } from "../components/common/NotYourDepartment";
import { useSetAssistantTarget } from "../store/AssistantContext";
import { generateId } from "../utils/id";
import { formatDisplayDate, todayISO } from "../utils/date";
import { printDocument } from "../utils/print";
import { DownloadDocumentButton } from "../components/common/DownloadDocumentButton";
import { COMPANY } from "../data/seed/masterData";

const GAP_DOC_ID = "gap-inspection";

export function GapListPage() {
  const { mode, bump } = useAppStore();
  const { navigate } = useRouter();
  const isDemo = mode === "demo";
  refreshGapFindingStatuses(isDemo);
  const records = recordRepository.query({ documentId: GAP_DOC_ID, isDemo }) as RecordInstance<GapInspectionData>[];
  const acks = (recordRepository.query({ documentId: CAF_DOC_ID, isDemo }) as RecordInstance<ComplaintAckData>[])
    .slice()
    .sort((a, b) => (a.data.reportDate < b.data.reportDate ? 1 : -1));

  // A Complaint Acknowledgement Report is started by hand and opens on its own
  // page (RecordPage), with the form's wording already filled in.
  const createAck = () => {
    const now = new Date().toISOString();
    const rec: RecordInstance<ComplaintAckData> = {
      id: generateId("caf"),
      documentId: CAF_DOC_ID,
      periodKey: generateId("period"),
      dueDate: todayISO(),
      status: "In Progress",
      isDemo,
      data: newComplaintAckData(todayISO()),
      createdAt: now,
      updatedAt: now,
    };
    recordRepository.upsert(rec as RecordInstance);
    bump();
    navigate(`/record/${rec.id}`);
  };
  const doc = documentRepository.getById(GAP_DOC_ID);
  // The inspection findings report belongs to Quality Assurance, so somebody
  // outside QA reaching this address by bookmark or link is told whose
  // register it is instead of being shown it (REQUIREMENTS §40).
  if (!doc) return <NotYourDepartment documentId={GAP_DOC_ID} what="register" />;
  // The Complaint Acknowledgement Report is Marketing's own format, and this
  // list is only its neighbour here: when it is out of the viewer's
  // departments we must not offer to start one (REQUIREMENTS §40).
  const canCreateAck = !!documentRepository.getById(CAF_DOC_ID);

  const createNew = () => {
    const now = new Date().toISOString();
    const rec: RecordInstance<GapInspectionData> = {
      id: generateId("gap"),
      documentId: GAP_DOC_ID,
      periodKey: generateId("period"),
      dueDate: todayISO(),
      status: "In Progress",
      isDemo,
      data: {
        inspectionDate: todayISO(),
        premisesName: COMPANY.name,
        premisesAddress: COMPANY.address,
        contactPerson: "",
        findings: [],
        generalComments: [],
      },
      createdAt: now,
      updatedAt: now,
    };
    recordRepository.upsert(rec as RecordInstance);
    bump();
    navigate(`/gap/${rec.id}`);
  };

  return (
    <div>
      <button className="btn btn-ghost btn-sm mb-3" onClick={() => navigate("/gap")}>
        <FiArrowLeft size={13} /> CAPA
      </button>
      <div className="flex items-center justify-between mb-4 gap-3 wrap">
        <div>
          <h1 className="text-2xl mb-1">Internal — Inspection Findings</h1>
          <p className="text-muted">{doc.description}</p>
        </div>
        <button className="btn btn-primary" onClick={createNew}>
          <FiPlus size={14} /> New Internal CAPA Record
        </button>
      </div>

      <div className="doc-table">
        <table>
          <thead>
            <tr>
              <th>Inspection Date</th>
              <th>Premises</th>
              <th>Findings</th>
              <th>Open / Overdue</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted text-center" style={{ padding: 24 }}>
                  No CAPA records recorded yet.
                </td>
              </tr>
            )}
            {records
              .slice()
              .sort((a, b) => (a.data.inspectionDate < b.data.inspectionDate ? 1 : -1))
              .map((r) => {
                const open = r.data.findings.filter((f) => f.status === "Open" || f.status === "Overdue").length;
                return (
                  <tr key={r.id} className="card-clickable" onClick={() => navigate(`/gap/${r.id}`)}>
                    <td>{formatDisplayDate(r.data.inspectionDate)}</td>
                    <td>
                      {r.data.premisesName} {r.isDemo && <DemoTag />}
                    </td>
                    <td>{r.data.findings.length}</td>
                    <td>{open > 0 ? <span className="badge badge-Overdue">{open} open</span> : <span className="badge badge-Verified">0</span>}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn btn-ghost btn-sm">Open / Edit</button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* CAPA — Internal: Complaint Acknowledgement Reports (QA-CAF-00). */}
      <div className="flex items-center justify-between mt-6 mb-3 gap-3 wrap" data-section="complaint-ack">
        <div>
          <h2 className="text-xl mb-1">Complaint Acknowledgement Reports</h2>
          <p className="text-muted text-sm">
            Format {CAF_FORMAT_REF} — a customer complaint explained to the employee(s) involved: the complaint, what happened (with photos), root cause,
            corrective and preventive action, and the employee's signed acknowledgement.
          </p>
        </div>
        {canCreateAck && (
          <button className="btn btn-primary" data-action="new-complaint-ack" onClick={createAck}>
            <FiPlus size={14} /> New Complaint Acknowledgement
          </button>
        )}
      </div>
      <div className="doc-table">
        <table data-table="complaint-ack">
          <thead>
            <tr>
              <th>Date</th>
              <th>Customer</th>
              <th>FG code</th>
              <th>Job name</th>
              <th>Com. type</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {acks.length === 0 && (
              <tr>
                <td colSpan={7} className="text-muted text-center" style={{ padding: 24 }}>
                  No complaint acknowledgements yet.
                </td>
              </tr>
            )}
            {acks.map((r) => (
              <tr key={r.id} className="card-clickable" onClick={() => navigate(`/record/${r.id}`)}>
                <td>{r.data.reportDate ? formatDisplayDate(r.data.reportDate) : "—"}</td>
                <td>
                  {r.data.customerName || "—"} {r.isDemo && <DemoTag />}
                </td>
                <td>{r.data.fgCode || "—"}</td>
                <td className="text-sm">{r.data.jobName || "—"}</td>
                <td className="text-sm">{r.data.complaintType || "—"}</td>
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

export function GapRecordPage({ recordId }: { recordId: string }) {
  const { currentUser, bump } = useAppStore();
  const { navigate } = useRouter();
  const t = useT();
  const [record, setRecord] = useState<RecordInstance<GapInspectionData> | undefined>(
    () => recordRepository.getById(recordId) as RecordInstance<GapInspectionData> | undefined
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [errorsFor, setErrorsFor] = useState<"submit" | "verify">("submit");
  const doc = documentRepository.getById(GAP_DOC_ID);

  const editable = !!record && isEditableStatus(record.status);
  // Closing a finding is a follow-up to a report that has already been
  // filed, so it stays possible while the report awaits verification —
  // otherwise the only way to clear a long-done action would be to reject
  // the whole report and resubmit it.
  const canClose = editable || (!!record && ["Submitted", "Pending Verification"].includes(record.status));

  const current = () => (recordRepository.getById(recordId) as RecordInstance<GapInspectionData> | undefined) ?? record;

  // Every change is saved as it's made, with a line in the record's history.
  const applyPatch = (patch: Partial<GapInspectionData>, opts: { action?: "edited" | "assistant-edit"; note?: string } = {}) => {
    const base = current();
    if (!base) return;
    const updated = saveDraft(base, { ...base.data, ...patch }, currentUser, opts) as RecordInstance<GapInspectionData>;
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
    // The hook has to stay above the returns below, so the document being out
    // of the viewer's departments is handled here too: no target is registered,
    // because the assistant must not read out or edit another department's
    // record either (REQUIREMENTS §40).
    record && doc
      ? {
          documentKind: "gap",
          documentId: doc.id,
          recordId: record.id,
          status: record.status,
          editable,
          currentData: record.data,
          getData: () => current()?.data,
          commit: (next, note) => applyPatch(next as GapInspectionData, { action: "assistant-edit", note }),
          reopen: isCorrectableStatus(record.status)
            ? (reason) => {
                const base = current();
                if (!base) return;
                setRecord(reopenForCorrection(base, currentUser, reason) as RecordInstance<GapInspectionData>);
                bump();
              }
            : undefined,
          // Everything the buttons do, so it can be asked for in words too
          // (engine/assistantCommands.ts) — the same as every other record.
          title: `the inspection findings report of ${formatDisplayDate(record.data.inspectionDate || record.dueDate)}`,
          submit: editable ? () => actions.current.submit?.() ?? { ok: false, errors: [] } : undefined,
          verify: ["Submitted", "Pending Verification"].includes(record.status) ? () => actions.current.verify?.() ?? { ok: false, errors: [] } : undefined,
          cancelCorrection: record.correction ? () => actions.current.cancelCorrection?.() : undefined,
          remove: (reason: string) => actions.current.remove?.(reason),
          print: () => printDocument(),
        }
      : null
  );

  // recordRepository.getById stays unscoped on purpose, so the record above is
  // found whoever is logged in; it is the document that decides who may open
  // it. This comes before the "not found" return so that nothing of the
  // record — not even whether that address exists — reaches somebody outside
  // Quality Assurance (REQUIREMENTS §40).
  if (!doc) return <NotYourDepartment documentId={GAP_DOC_ID} what="report" />;

  if (!record) {
    return (
      <div className="empty-state">
        <h2 className="text-xl mb-2">CAPA record not found</h2>
        <button className="btn btn-secondary" onClick={() => navigate("/gap/internal")}>
          <FiArrowLeft size={13} /> Back
        </button>
      </div>
    );
  }

  const data = record.data;
  const update = applyPatch;

  const updateFinding = (id: string, patch: Partial<GapFinding>) => {
    update({ findings: data.findings.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  };
  const addFinding = () => {
    const sNo = (data.findings.at(-1)?.sNo ?? 0) + 1;
    update({
      findings: [
        ...data.findings,
        {
          id: generateId("finding"),
          sNo,
          findingOfInspection: "",
          commentsOnFindings: "",
          correctiveActionContractor: "",
          correctiveActionClient: "",
          targetDate: null,
          actualDateOfAction: null,
          verifiedByServiceProvider: "",
          status: "Open",
          source: "Internal",
        },
      ],
    });
  };
  const removeFinding = (id: string) => update({ findings: data.findings.filter((f) => f.id !== id) });

  const closeFinding = (id: string) => {
    updateFinding(id, { status: "Closed", actualDateOfAction: todayISO() });
  };
  const openFindings = data.findings.filter((f) => f.status === "Open" || f.status === "Overdue");
  const closeAll = () => {
    update({ findings: data.findings.map((f) => (f.status === "Open" || f.status === "Overdue" ? { ...f, status: "Closed", actualDateOfAction: f.actualDateOfAction ?? todayISO() } : f)) });
  };

  const handleSave = () => undefined; // every change is already saved as it's made
  const handleSubmit = (): { ok: boolean; errors: string[] } => {
    const base = current() ?? record;
    const { record: updated, result } = submitRecord(doc, base, currentUser);
    if (!result.valid) {
      setErrorsFor("submit");
      setErrors(result.errors);
      return { ok: false, errors: result.errors };
    }
    setErrors([]);
    setRecord(updated as RecordInstance<GapInspectionData>);
    bump();
    return { ok: true, errors: [] };
  };
  const handleVerify = (): { ok: boolean; errors: string[] } => {
    const base = current() ?? record;
    const { record: updated, result } = verifyRecord(doc, base, currentUser);
    if (!result.valid) {
      setErrorsFor("verify");
      setErrors(result.errors);
      return { ok: false, errors: result.errors };
    }
    setErrors([]);
    setRecord(updated as RecordInstance<GapInspectionData>);
    bump();
    return { ok: true, errors: [] };
  };
  const handleReject = (reason: string) => {
    setRecord(rejectRecord(record, currentUser, reason) as RecordInstance<GapInspectionData>);
    bump();
  };
  const handleResume = () => {
    setRecord(resumeAfterRejection(record, currentUser) as RecordInstance<GapInspectionData>);
    bump();
  };
  const handleCorrect = (reason: string) => {
    setErrors([]);
    setRecord(reopenForCorrection(record, currentUser, reason) as RecordInstance<GapInspectionData>);
    bump();
  };
  // Pressed Edit with nothing to put right: back as it was, at its old status.
  const handleCancelCorrection = () => {
    setErrors([]);
    setRecord(cancelCorrection(current() ?? record, currentUser) as RecordInstance<GapInspectionData>);
    bump();
  };
  // Any status can be deleted now; the deletion itself is recorded
  // (engine/recordCrud.ts) — the same trail as every other document.
  const handleDelete = (reason: string) => {
    deleteRecordWithTrail(current() ?? record, currentUser, reason);
    bump();
    navigate("/gap/internal");
  };

  actions.current = { submit: handleSubmit, verify: handleVerify, cancelCorrection: handleCancelCorrection, remove: handleDelete };

  return (
    <div className={record.isDemo ? "demo-watermark" : ""}>
      <div className="flex items-center justify-between mb-3 no-print">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate("/gap/internal")}>
          <FiArrowLeft size={13} /> Back to internal findings
        </button>
        <div className="flex items-center gap-2">
          {record.isDemo && <DemoTag />}
          <StatusBadge status={record.status} />
        </div>
      </div>

      {record.correction && <CorrectionBanner correction={record.correction} />}

      <ErrorList errors={errors} heading={errorsFor === "verify" ? t("record.fixBeforeVerify") : t("record.fixBeforeSubmit")} />

      {/* The document itself — the part that prints (utils/print.ts). */}
      <div data-print-doc>
      <div className="doc-header notranslate" translate="no">
        <div className="company-name">CAPA — Internal: Pest Control Inspection Findings Report</div>
        <div className="meta-row">
          <div className="meta-cell">
            <span className="k">Date of Inspection</span>
            <input
              type="date"
              className="input input-sm"
              disabled={!editable}
              value={data.inspectionDate}
              onChange={(e) => update({ inspectionDate: e.target.value })}
            />
          </div>
          <div className="meta-cell" style={{ flex: 2 }}>
            <span className="k">Name &amp; Address of Premises Inspected</span>
            <input
              className="input input-sm"
              disabled={!editable}
              value={data.premisesName}
              onChange={(e) => update({ premisesName: e.target.value })}
            />
            <input
              className="input input-sm mt-1"
              disabled={!editable}
              value={data.premisesAddress}
              placeholder="Address"
              onChange={(e) => update({ premisesAddress: e.target.value })}
            />
          </div>
          <div className="meta-cell">
            <span className="k">Contact Person</span>
            <input
              className="input input-sm"
              disabled={!editable}
              value={data.contactPerson}
              onChange={(e) => update({ contactPerson: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="doc-table mt-4 notranslate" translate="no">
        <table>
          <thead>
            <tr>
              <th style={{ width: 32 }}>S.No</th>
              <th>Finding</th>
              <th>Comments</th>
              <th>Corrective Action (Client)</th>
              <th>Corrective Action (Contractor)</th>
              <th style={{ width: 110 }}>Source</th>
              <th style={{ width: 120 }}>Target Date</th>
              <th style={{ width: 120 }}>Actual Date</th>
              <th style={{ width: 130 }}>Verified by Service Provider</th>
              <th style={{ width: 100 }}>Status</th>
              {editable && <th></th>}
            </tr>
          </thead>
          <tbody>
            {data.findings.map((f) => (
              <tr key={f.id}>
                <td>{f.sNo}</td>
                <td>
                  <input className="input input-sm" disabled={!editable} value={f.findingOfInspection} onChange={(e) => updateFinding(f.id, { findingOfInspection: e.target.value })} />
                </td>
                <td>
                  <input className="input input-sm" disabled={!editable} value={f.commentsOnFindings} onChange={(e) => updateFinding(f.id, { commentsOnFindings: e.target.value })} />
                </td>
                <td>
                  <input className="input input-sm" disabled={!editable} value={f.correctiveActionClient} onChange={(e) => updateFinding(f.id, { correctiveActionClient: e.target.value })} />
                </td>
                <td>
                  <input
                    className="input input-sm"
                    disabled={!editable}
                    value={f.correctiveActionContractor}
                    onChange={(e) => updateFinding(f.id, { correctiveActionContractor: e.target.value })}
                  />
                </td>
                <td>
                  <select className="input input-sm" disabled={!editable} value={f.source} onChange={(e) => updateFinding(f.id, { source: e.target.value as GapFinding["source"] })}>
                    <option value="Internal">Internal</option>
                    <option value="External">External</option>
                  </select>
                </td>
                <td>
                  <input
                    type="date"
                    className="input input-sm"
                    disabled={!editable}
                    value={f.targetDate ?? ""}
                    onChange={(e) => updateFinding(f.id, { targetDate: e.target.value || null })}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    className="input input-sm"
                    disabled={!editable}
                    value={f.actualDateOfAction ?? ""}
                    onChange={(e) => updateFinding(f.id, { actualDateOfAction: e.target.value || null })}
                  />
                </td>
                <td>
                  <input
                    className="input input-sm"
                    disabled={!canClose}
                    value={f.verifiedByServiceProvider}
                    onChange={(e) => updateFinding(f.id, { verifiedByServiceProvider: e.target.value })}
                  />
                </td>
                <td>
                  <span className={`badge badge-${f.status === "Overdue" ? "Overdue" : f.status === "Open" ? "Due" : "Verified"}`}>{f.status}</span>
                  {(f.status === "Open" || f.status === "Overdue") && canClose && (
                    <button className="btn btn-ghost btn-sm" style={{ marginLeft: 4 }} onClick={() => closeFinding(f.id)}>
                      Close
                    </button>
                  )}
                </td>
                {editable && (
                  <td>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => removeFinding(f.id)}>
                      <FiTrash2 size={13} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {data.findings.length === 0 && (
              <tr>
                <td colSpan={11} className="text-muted text-center" style={{ padding: 16 }}>
                  No findings added.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {(editable || (canClose && openFindings.length > 0)) && (
        <div className="flex gap-2 mt-2 wrap">
          {editable && (
            <button className="btn btn-secondary btn-sm" onClick={addFinding}>
              <FiPlus size={13} /> Add Finding
            </button>
          )}
          {canClose && openFindings.length > 0 && (
            <button className="btn btn-success btn-sm" onClick={closeAll} title="Stamp today's date as the actual date of action on every open finding">
              Close all {openFindings.length} open finding{openFindings.length === 1 ? "" : "s"} (action done today)
            </button>
          )}
        </div>
      )}

      <div className="card mt-4">
        <div className="card-header">
          <h3 className="text-base font-semibold">General Comments</h3>
          {editable && (
            <button className="btn btn-secondary btn-sm" onClick={() => update({ generalComments: [...data.generalComments, ""] })}>
              <FiPlus size={13} /> Add
            </button>
          )}
        </div>
        <div className="card-pad">
          {data.generalComments.map((c, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input
                className="input"
                disabled={!editable}
                value={c}
                onChange={(e) =>
                  update({ generalComments: data.generalComments.map((x, xi) => (xi === i ? e.target.value : x)) })
                }
              />
              {editable && (
                <button
                  className="btn btn-ghost btn-icon"
                  onClick={() => update({ generalComments: data.generalComments.filter((_, xi) => xi !== i) })}
                >
                  <FiTrash2 size={13} />
                </button>
              )}
            </div>
          ))}
          {data.generalComments.length === 0 && <p className="text-muted text-sm">No general comments.</p>}
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
        onCancelCorrection={record.correction ? handleCancelCorrection : undefined}
        correctionFromStatus={record.correction?.fromStatus}
        onPrint={() => printDocument()}
        download={<DownloadDocumentButton doc={doc} dateISO={record.dueDate} />}
        onDelete={handleDelete}
      />
    </div>
  );
}
