import React, { useMemo, useState } from "react";
import { FiArrowLeft, FiArrowRight, FiPlus, FiZap, FiUsers, FiSearch } from "react-icons/fi";
import { useAppStore } from "../store/AppStore";
import { useRouter } from "../store/router";
import { recordRepository } from "../data/repositories/recordRepository";
import { documentRepository } from "../data/repositories/documentRepository";
import { refreshGapFindingStatuses, openCorrectiveActionsCount } from "../data/selectors";
import { COMPLAINT_DOC_ID, COMPLAINT_FOOTER_NOTE, COMPLAINT_ACTIVITY_COUNT, isConditionalActivity, newComplaintChecklistData } from "../data/seed/complaintChecklist";
import { CAF_DOC_ID } from "../data/seed/complaintAck";
import type { ChecklistItem, ComplaintChecklistData, RecordInstance } from "../types";
import {
  cancelCorrection,
  correctionChanges,
  isCorrectableStatus,
  isEditableStatus,
  reopenForCorrection,
  saveDraft,
  submitRecord,
  verifyRecord,
  rejectRecord,
  resumeAfterRejection,
} from "../engine/recordLifecycle";
import { currentActivity, isItemOpen, summarise } from "../engine/guidedChecklist";
import { RecordActionBar } from "../components/records/RecordActionBar";
import { CorrectionBanner, ErrorList, RecordHistoryPanel } from "../components/records/RecordHistoryPanel";
import { DocumentHeader } from "../components/documents/DocumentHeader";
import { StatusBadge } from "../components/common/StatusBadge";
import { DemoTag } from "../components/common/DemoTag";
import { NotYourDepartment } from "../components/common/NotYourDepartment";
import { useSetAssistantTarget } from "../store/AssistantContext";
import { startGuidedChecklist } from "../components/common/DocumentAssistant";
import { generateId } from "../utils/id";
import { formatDisplayDate, todayISO } from "../utils/date";
import { codeRulesFor, nextComplaintNo } from "../engine/documentFormats";
import { printDocument } from "../utils/print";
import { DownloadDocumentButton } from "../components/common/DownloadDocumentButton";
import { deleteRecordWithTrail } from "../engine/recordCrud";
import { useT } from "../i18n";

const GAP_DOC_ID = "gap-inspection";

// ---------------------------------------------------------------------------
// /gap — the CAPA module's front door: Internal or External.

export function CapaHomePage() {
  const t = useT();
  const { mode, version } = useAppStore();
  const { navigate } = useRouter();
  const isDemo = mode === "demo";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stats = useMemo(() => {
    refreshGapFindingStatuses(isDemo);
    const internal = recordRepository.query({ documentId: GAP_DOC_ID, isDemo });
    const external = recordRepository.query({ documentId: COMPLAINT_DOC_ID, isDemo }) as RecordInstance<ComplaintChecklistData>[];
    return {
      internalCount: internal.length,
      openFindings: openCorrectiveActionsCount(isDemo),
      externalCount: external.length,
      awaitingApproval: external.filter((r) => r.status === "Submitted" || r.status === "Pending Verification").length,
      inProgress: external.filter((r) => ["Scheduled", "Due", "In Progress"].includes(r.status)).length,
    };
  }, [isDemo, version]);

  // CAPA's two halves belong to different departments — the inspection
  // findings report to Quality Assurance, the customer complaint checklist to
  // Marketing — so a card is only offered to somebody who may open what is
  // behind it; otherwise it would show a count of 0 and land on a refusal
  // (REQUIREMENTS §40).
  const canSeeInternal = !!documentRepository.getById(GAP_DOC_ID) || !!documentRepository.getById(CAF_DOC_ID);
  const canSeeExternal = !!documentRepository.getById(COMPLAINT_DOC_ID);

  if (!canSeeInternal && !canSeeExternal) return <NotYourDepartment documentId={COMPLAINT_DOC_ID} what="module" />;

  return (
    <div>
      <h1 className="text-2xl mb-1">{t("capa.title")}</h1>
      <p className="text-muted mb-5">Where did the issue come from? Pick one — the assistant takes it from there.</p>

      <div className="flex gap-4 wrap">
        {canSeeInternal && (
        <div className="card capa-option" onClick={() => navigate("/gap/internal")}>
          <div className="card-pad">
            <div className="flex items-center gap-2 mb-2">
              <FiSearch size={18} style={{ color: "var(--color-primary)" }} />
              <h2 className="text-xl">Internal</h2>
            </div>
            <p className="text-sm text-muted mb-3">
              Findings raised by our own or our service provider's pest control inspections (e.g. the Dec-2023 GAP report), each
              with a corrective action tracked to closure — and Complaint Acknowledgement Reports (QA-CAF-00): a customer complaint
              explained to the employee involved, with photos, root cause and corrective / preventive action.
            </p>
            <div className="flex gap-3 wrap mb-3">
              <div className="stat-tile" style={{ padding: "10px 14px", minWidth: 110 }}>
                <div className="stat-value" style={{ fontSize: 20 }}>{stats.internalCount}</div>
                <div className="stat-label">Reports</div>
              </div>
              <div className="stat-tile" style={{ padding: "10px 14px", minWidth: 110 }}>
                <div className="stat-value" style={{ fontSize: 20, color: stats.openFindings ? "var(--color-danger)" : "var(--color-success)" }}>{stats.openFindings}</div>
                <div className="stat-label">Open findings</div>
              </div>
            </div>
            <button className="btn btn-primary btn-sm">
              Open Internal <FiArrowRight size={12} />
            </button>
          </div>
        </div>

        )}
        {canSeeExternal && (
        <div className="card capa-option external" onClick={() => navigate("/gap/external")}>
          <div className="card-pad">
            <div className="flex items-center gap-2 mb-2">
              <FiUsers size={18} style={{ color: "var(--color-accent)" }} />
              <h2 className="text-xl">External</h2>
            </div>
            <p className="text-sm text-muted mb-3">
              Customer complaints, handled on the Customer Complaint Handling Checklist (F/MKT/05). The assistant walks you
              through sections A to E — receipt, investigation, CAPA, customer communication, closure — then asks for approval.
            </p>
            <div className="flex gap-3 wrap mb-3">
              <div className="stat-tile" style={{ padding: "10px 14px", minWidth: 110 }}>
                <div className="stat-value" style={{ fontSize: 20 }}>{stats.externalCount}</div>
                <div className="stat-label">Complaints</div>
              </div>
              <div className="stat-tile" style={{ padding: "10px 14px", minWidth: 110 }}>
                <div className="stat-value" style={{ fontSize: 20, color: "var(--color-warning)" }}>{stats.awaitingApproval}</div>
                <div className="stat-label">Awaiting approval</div>
              </div>
              <div className="stat-tile" style={{ padding: "10px 14px", minWidth: 110 }}>
                <div className="stat-value" style={{ fontSize: 20, color: "var(--color-info)" }}>{stats.inProgress}</div>
                <div className="stat-label">In progress</div>
              </div>
            </div>
            <button className="btn btn-primary btn-sm" style={{ background: "var(--color-accent)" }}>
              Open External <FiArrowRight size={12} />
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// /gap/external — the complaint checklists.

function progressOf(data: ComplaintChecklistData): { answered: number; total: number } {
  const s = summarise(data);
  return { answered: s.done + s.notRequired, total: s.total };
}

export function ComplaintListPage() {
  const { mode, bump } = useAppStore();
  const { navigate } = useRouter();
  const isDemo = mode === "demo";
  const records = recordRepository.query({ documentId: COMPLAINT_DOC_ID, isDemo }) as RecordInstance<ComplaintChecklistData>[];
  const doc = documentRepository.getById(COMPLAINT_DOC_ID);

  // The complaint register is Marketing's own (F/MKT/05), so somebody from
  // another department who reaches this address by an old bookmark or a link
  // is told whose register it is instead of being shown the register, an empty
  // list and a "New Complaint" button they must not use (REQUIREMENTS §40).
  if (!doc) return <NotYourDepartment documentId={COMPLAINT_DOC_ID} what="register" />;

  const createNew = () => {
    const now = new Date().toISOString();
    // The next free number for this year — 26-27/001, /002, … — which the
    // person can change on the form (engine/documentFormats.ts).
    const complaintNo = nextComplaintNo(records.map((r) => r.data.complaintNo));
    const rec: RecordInstance<ComplaintChecklistData> = {
      id: generateId("complaint"),
      documentId: COMPLAINT_DOC_ID,
      periodKey: generateId("period"),
      dueDate: todayISO(),
      status: "In Progress",
      isDemo,
      data: newComplaintChecklistData(complaintNo),
      createdAt: now,
      updatedAt: now,
    };
    recordRepository.upsert(rec as RecordInstance);
    bump();
    navigate(`/gap/complaint/${rec.id}`);
  };

  return (
    <div>
      <button className="btn btn-ghost btn-sm mb-3" onClick={() => navigate("/gap")}>
        <FiArrowLeft size={13} /> CAPA
      </button>
      <div className="flex items-center justify-between mb-4 gap-3 wrap">
        <div>
          <h1 className="text-2xl mb-1">External — Customer Complaints</h1>
          <p className="text-muted">
            {doc.name.replace(/^CAPA — External: /, "")} · {doc.formatNo} (Rev {doc.revisionNo} / {formatDisplayDate(doc.revisionDate)})
          </p>
        </div>
        <button className="btn btn-primary" onClick={createNew}>
          <FiPlus size={14} /> New Complaint
        </button>
      </div>

      <div className="doc-table">
        <table>
          <thead>
            <tr>
              <th>Complaint No.</th>
              <th>Customer</th>
              <th>Job</th>
              <th>Received</th>
              <th style={{ width: 180 }}>Progress</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr>
                <td colSpan={7} className="text-muted text-center" style={{ padding: 24 }}>
                  No customer complaints logged yet. "New Complaint" opens a fresh checklist and the assistant starts asking.
                </td>
              </tr>
            )}
            {records
              .slice()
              .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
              .map((r) => {
                const p = progressOf(r.data);
                return (
                  <tr key={r.id} className="card-clickable" onClick={() => navigate(`/gap/complaint/${r.id}`)}>
                    <td className="font-semibold">
                      {r.data.complaintNo || <span className="text-muted">—</span>} {r.isDemo && <DemoTag />}
                    </td>
                    <td>{r.data.customerName || <span className="text-muted">—</span>}</td>
                    <td className="text-sm">{r.data.jobName || "—"}</td>
                    <td className="text-sm">{r.data.complaintReceivedDate ? formatDisplayDate(r.data.complaintReceivedDate) : "—"}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="progress-bar" style={{ flex: 1 }}>
                          <div style={{ width: `${Math.round((p.answered / p.total) * 100)}%` }} />
                        </div>
                        <span className="text-xs text-muted" style={{ whiteSpace: "nowrap" }}>
                          {p.answered}/{p.total}
                        </span>
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn btn-ghost btn-sm">Open</button>
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

// ---------------------------------------------------------------------------
// /gap/complaint/:id — one checklist, the paper form on screen, with the
// assistant's walk-through wired in.

export function ComplaintChecklistPage({ recordId }: { recordId: string }) {
  const { currentUser, bump } = useAppStore();
  const { navigate } = useRouter();
  const [record, setRecord] = useState<RecordInstance<ComplaintChecklistData> | undefined>(
    () => recordRepository.getById(recordId) as RecordInstance<ComplaintChecklistData> | undefined
  );
  const [errors, setErrors] = useState<string[]>([]);
  const doc = documentRepository.getById(COMPLAINT_DOC_ID);

  const t = useT();
  const [errorsFor, setErrorsFor] = useState<"submit" | "verify">("submit");
  const editable = !!record && isEditableStatus(record.status);
  const canApprove = !!record && ["Submitted", "Pending Verification"].includes(record.status);

  const current = () => (recordRepository.getById(recordId) as RecordInstance<ComplaintChecklistData> | undefined) ?? record;

  const persist = (next: RecordInstance<ComplaintChecklistData>) => {
    setRecord(next);
    recordRepository.upsert(next as RecordInstance);
    bump();
  };
  // Every change is saved as it's made, with a line in the record's history.
  const setData = (data: ComplaintChecklistData, opts: { action?: "edited" | "assistant-edit"; note?: string } = {}) => {
    const base = current();
    if (!base) return;
    setRecord(saveDraft(base, data, currentUser, opts) as RecordInstance<ComplaintChecklistData>);
    bump();
  };
  const patch = (p: Partial<ComplaintChecklistData>) => {
    const base = current();
    if (base) setData({ ...base.data, ...p });
  };

  // Submit stamps Prepared By with the logged-in user if they haven't typed
  // a name; approval (Verify) stamps Approved By with the approver. Both
  // still go through the normal lifecycle validation.
  const doSubmit = (): { ok: boolean; errors: string[] } => {
    const current = recordRepository.getById(recordId) as RecordInstance<ComplaintChecklistData> | undefined;
    if (!current) return { ok: false, errors: ["Record not found."] };
    // Nobody outside Marketing gets this far — the refusal below replaces the
    // form before a button or the assistant can call this (REQUIREMENTS §40) —
    // but the lifecycle validates against the definition, so it is never
    // called without one.
    if (!doc) return { ok: false, errors: ["This checklist belongs to another department."] };
    const prepared = {
      name: current.data.preparedBy.name.trim() || currentUser,
      designation: current.data.preparedBy.designation,
      date: current.data.preparedBy.date ?? todayISO(),
    };
    const withSignoff = { ...current, data: { ...current.data, preparedBy: prepared } };
    recordRepository.upsert(withSignoff as RecordInstance);
    const { record: updated, result } = submitRecord(doc, withSignoff as RecordInstance, currentUser);
    if (!result.valid) {
      setRecord(withSignoff);
      setErrorsFor("submit");
      setErrors(result.errors);
      bump();
      return { ok: false, errors: result.errors };
    }
    setErrors([]);
    setRecord(updated as RecordInstance<ComplaintChecklistData>);
    bump();
    return { ok: true, errors: [] };
  };

  const doApprove = (): { ok: boolean; errors: string[] } => {
    const current = recordRepository.getById(recordId) as RecordInstance<ComplaintChecklistData> | undefined;
    if (!current) return { ok: false, errors: ["Record not found."] };
    // As in doSubmit: unreachable once the refusal has replaced the form
    // (REQUIREMENTS §40), and verification needs the definition.
    if (!doc) return { ok: false, errors: ["This checklist belongs to another department."] };
    const approved = {
      name: current.data.approvedBy.name.trim() || currentUser,
      designation: current.data.approvedBy.designation.trim() || "QA Head",
      date: todayISO(),
    };
    const withSignoff = { ...current, data: { ...current.data, approvedBy: approved } };
    recordRepository.upsert(withSignoff as RecordInstance);
    const { record: updated, result } = verifyRecord(doc, withSignoff as RecordInstance, currentUser);
    if (!result.valid) {
      setRecord(withSignoff);
      setErrorsFor("verify");
      setErrors(result.errors);
      bump();
      return { ok: false, errors: result.errors };
    }
    setErrors([]);
    setRecord(updated as RecordInstance<ComplaintChecklistData>);
    bump();
    return { ok: true, errors: [] };
  };

  const doSendBack = (reason: string) => {
    const current = recordRepository.getById(recordId);
    if (!current) return;
    setRecord(rejectRecord(current, currentUser, reason) as RecordInstance<ComplaintChecklistData>);
    bump();
  };

  const answered = record ? summarise(record.data) : null;
  // Nothing recorded yet, so the assistant offers to walk the sheet through.
  // The complaint number doesn't count: the app fills that in itself the
  // moment the complaint is opened (26-27/001 — see engine/documentFormats.ts),
  // and a number nobody typed is not the same as a sheet somebody has begun.
  const isFresh =
    !!record &&
    editable &&
    !record.data.customerName &&
    !record.data.jobName &&
    !record.data.jobCode &&
    !record.data.poNo &&
    !record.data.complaintReceivedDate &&
    answered?.done === 0 &&
    answered?.notRequired === 0;

  const doCorrect = (reason: string) => {
    const base = current();
    if (!base) return;
    setErrors([]);
    setRecord(reopenForCorrection(base, currentUser, reason) as RecordInstance<ComplaintChecklistData>);
    bump();
  };

  // Pressed Edit with nothing to put right: back as it was, at its old status.
  const doCancelCorrection = () => {
    const base = current();
    if (!base) return;
    setErrors([]);
    setRecord(cancelCorrection(base, currentUser) as RecordInstance<ComplaintChecklistData>);
    bump();
  };

  useSetAssistantTarget(
    // No `doc` means this isn't the viewer's department, and the assistant
    // must not be pointed at a checklist they may not open — it would read the
    // complaint out to them (REQUIREMENTS §40).
    record && doc
      ? {
          documentKind: "complaint-checklist",
          documentId: doc.id,
          recordId: record.id,
          status: record.status,
          editable,
          currentData: record.data,
          getData: () => current()?.data,
          commit: (next, note) => setData(next as ComplaintChecklistData, { action: "assistant-edit", note }),
          reopen: isCorrectableStatus(record.status) ? doCorrect : undefined,
          // The rest of what the buttons do, for the assistant (typed or spoken).
          title: `complaint ${record.data.complaintNo || "(no number)"}`,
          submit: editable ? () => doSubmit() : undefined,
          verify: canApprove ? () => doApprove() : undefined,
          cancelCorrection: record.correction ? doCancelCorrection : undefined,
          remove: (reason: string) => {
            deleteRecordWithTrail(record, currentUser, reason);
            bump();
            navigate("/gap/external");
          },
          print: () => printDocument(),
          checklist: {
            recordId: record.id,
            title: `Complaint ${record.data.complaintNo || "(new)"}${record.data.customerName ? ` · ${record.data.customerName}` : ""}`,
            getData: () => (recordRepository.getById(recordId) as RecordInstance<ComplaintChecklistData> | undefined)?.data ?? record.data,
            setData,
            editable,
            canApprove,
            submit: doSubmit,
            approve: doApprove,
            sendBack: doSendBack,
            autoStart: isFresh,
          },
        }
      : null
  );

  // Another department's checklist, reached by a link or an address typed by
  // hand: whose it is, and not one word of the complaint itself. This comes
  // before "not found" on purpose — a person who may not see Marketing's
  // checklists must be told that, not told whether the complaint exists
  // (REQUIREMENTS §40).
  if (!doc) return <NotYourDepartment documentId={COMPLAINT_DOC_ID} what="checklist" />;

  if (!record) {
    return (
      <div className="empty-state">
        <h2 className="text-xl mb-2">Complaint checklist not found</h2>
        <button className="btn btn-secondary" onClick={() => navigate("/gap/external")}>
          <FiArrowLeft size={13} /> Back
        </button>
      </div>
    );
  }

  const data = record.data;
  const progress = progressOf(data);
  // The one activity the checklist is waiting on — nothing after it can be
  // answered until it is (engine/guidedChecklist.ts, REQUIREMENTS §37).
  const waitingOn = currentActivity(data);

  const updateItem = (sectionIndex: number, itemIndex: number, p: Partial<ChecklistItem>) => {
    setData({
      ...data,
      sections: data.sections.map((s, si) =>
        si === sectionIndex ? { ...s, items: s.items.map((it, ii) => (ii === itemIndex ? { ...it, ...p } : it)) } : s
      ),
    });
  };

  // The coded fields (Complaint No., Job Code, PO No.) carry the plant's own
  // formats: what is typed is tidied when the field is left, and anything that
  // doesn't fit says so under the box and blocks Submit.
  const codeRules = codeRulesFor("complaint-checklist");
  const headerField = (label: string, key: keyof ComplaintChecklistData, type: "text" | "date" = "text") => {
    const rule = codeRules[key as string];
    const value = (data[key] as string | null) ?? "";
    const says = rule && editable ? rule.problem(String(value)) : null;
    return (
      <div className="field">
        <label>{label}</label>
        <input
          type={type}
          className={`input input-sm${says ? " error" : ""}`}
          data-field={key}
          placeholder={rule ? rule.example : undefined}
          disabled={!editable}
          value={value}
          onChange={(e) => patch({ [key]: e.target.value || (type === "date" ? null : "") } as Partial<ComplaintChecklistData>)}
          onBlur={
            rule
              ? (e) => {
                  const tidied = rule.normalise(e.target.value);
                  if (tidied !== e.target.value) patch({ [key]: tidied } as Partial<ComplaintChecklistData>);
                }
              : undefined
          }
        />
        {says && (
          <div className="text-xs text-danger mt-1 no-print" data-problem={key}>
            {says}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={record.isDemo ? "demo-watermark" : ""}>
      <div className="flex items-center justify-between mb-3 no-print">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate("/gap/external")}>
          <FiArrowLeft size={13} /> Back to complaints
        </button>
        <div className="flex items-center gap-2">
          {record.isDemo && <DemoTag />}
          <StatusBadge status={record.status} />
        </div>
      </div>

      {record.correction && <CorrectionBanner correction={record.correction} onCancel={doCancelCorrection} />}

      <ErrorList errors={errors} heading={errorsFor === "verify" ? t("record.fixBeforeVerify") : t("record.fixBeforeSubmit")} />

      {record.status === "Rejected" && record.rejectionReason && (
        <div className="card mb-4" style={{ borderColor: "var(--color-danger)", background: "var(--color-danger-bg)" }}>
          <div className="card-pad text-sm">
            <strong>Sent back</strong> by <span translate="no">{record.rejectedBy}</span> — {record.rejectionReason}
          </div>
        </div>
      )}

      {/* The document itself — the part that prints (utils/print.ts). */}
      <div data-print-doc>
      <DocumentHeader doc={doc} dateLabel={formatDisplayDate(record.dueDate)} pageLabel="1 of 1 (digital)" />

      <div className="card mt-4 no-print" style={{ borderLeft: "4px solid var(--color-accent)" }}>
        <div className="card-pad flex items-center justify-between gap-4 wrap">
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="flex items-center gap-2 mb-1">
              <div className="progress-bar" style={{ flex: 1 }}>
                <div style={{ width: `${Math.round((progress.answered / progress.total) * 100)}%` }} />
              </div>
              <span className="text-sm font-semibold" style={{ whiteSpace: "nowrap" }}>
                {progress.answered} / {progress.total}
              </span>
            </div>
            <div className="text-xs text-muted">
              {answered?.done ?? 0} done · {answered?.notRequired ?? 0} not required · {answered?.blank ?? 0} to go, across sections A–E
            </div>
            {editable && waitingOn && (
              <div className="text-xs mt-2" data-waiting-on={waitingOn.label}>
                <strong>One at a time.</strong> This checklist is waiting on <strong>{waitingOn.label}</strong> — “{waitingOn.activity}”. Every activity after it is locked
                until this one is answered: tick <em>Done</em> with its date, mark it <em>N/R</em> if it doesn't apply, or write what happened in Comments. The assistant can
                answer it for you — just tell it what happened.
              </div>
            )}
            {editable && !waitingOn && (
              <div className="text-xs mt-2" data-waiting-on="none">
                Every activity in all five sections is answered — check it over and submit it for approval.
              </div>
            )}
          </div>
          {editable && (
            <button className="btn btn-primary" onClick={() => startGuidedChecklist()}>
              <FiZap size={14} /> Walk me through it (A → E)
            </button>
          )}
          {canApprove && (
            <button className="btn btn-success" onClick={() => startGuidedChecklist()}>
              <FiZap size={14} /> Review &amp; approve with the assistant
            </button>
          )}
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-pad">
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px 16px" }}>
            {headerField("Customer Name", "customerName")}
            {headerField("Complaint No.", "complaintNo")}
            {headerField("Job Name", "jobName")}
            {headerField("Job Code", "jobCode")}
            {headerField("Complaint Received Date", "complaintReceivedDate", "date")}
            {headerField("PO No.", "poNo")}
          </div>
        </div>
      </div>

      {data.sections.map((s, si) => (
        <div key={s.key} className="card mt-4" data-section={s.key}>
          <div className="card-header">
            <span className="checklist-section-title">
              {s.key}. {s.title}
            </span>
            <div className="flex items-center gap-2">
              {editable && waitingOn && waitingOn.sectionIndex < si && (
                <span className="badge badge-Scheduled no-print" data-section-locked={s.key}>
                  Locked — finish Section {data.sections[waitingOn.sectionIndex].key} first
                </span>
              )}
              {editable && waitingOn && waitingOn.sectionIndex === si && (
                <span className="badge badge-Due no-print">Waiting on {waitingOn.label}</span>
              )}
              <span className="text-xs text-muted">
                {s.items.filter((it) => it.done || it.notRequired).length} / {s.items.length}
              </span>
            </div>
          </div>
          <div className="doc-table notranslate" translate="no" style={{ border: "none" }}>
            <table className="compact">
              <thead>
                <tr>
                  <th style={{ width: 56 }}>Sr. No.</th>
                  <th>Activity</th>
                  <th style={{ width: 70 }}>Done</th>
                  <th style={{ width: 140 }}>Date</th>
                  <th>Comments</th>
                </tr>
              </thead>
              <tbody>
                {s.items.map((it, ii) => {
                  // Answered, or the one being waited on: anything else stays
                  // locked until the checklist gets past it. A signed-off
                  // checklist answers nothing — `editable` still decides that,
                  // or an answered activity on a verified sheet would be
                  // writable again.
                  const open = editable && isItemOpen(data, si, ii);
                  const locked = editable && !open;
                  const isCurrent = !!waitingOn && waitingOn.sectionIndex === si && waitingOn.itemIndex === ii;
                  return (
                    <tr
                      key={it.srNo}
                      className={`${it.done ? "checklist-done" : ""}${locked ? " checklist-locked" : ""}${editable && isCurrent ? " checklist-current" : ""}`.trim()}
                      data-activity={`${s.key}${it.srNo}`}
                      data-locked={locked ? "1" : undefined}
                      title={locked && waitingOn ? `Answer ${waitingOn.label} first — this checklist is filled one activity at a time.` : undefined}
                    >
                      <td className="text-muted">{it.srNo}</td>
                      <td className="text-sm">
                        {it.activity}
                        {it.notRequired && <span className="badge badge-Scheduled" style={{ marginLeft: 6 }}>Not required</span>}
                        {editable && isCurrent && <span className="badge badge-Due no-print" style={{ marginLeft: 6 }}>Answer this one next</span>}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={it.done}
                          disabled={!open}
                          data-field="done"
                          onChange={(e) => updateItem(si, ii, { done: e.target.checked, notRequired: e.target.checked ? false : it.notRequired, date: e.target.checked ? it.date ?? todayISO() : it.date })}
                        />
                        {/* "Not required" is one of the three valid answers (the
                            "(If required)" activities on the printed form expect
                            it), so it has to be answerable here too — otherwise
                            the one-at-a-time rule would trap an activity that
                            genuinely doesn't apply. Screen only; what prints is
                            the badge beside the activity. */}
                        {editable && (
                          <button
                            type="button"
                            className={`btn btn-sm no-print ${it.notRequired ? "btn-secondary" : "btn-ghost"}`}
                            style={{ marginTop: 4, padding: "1px 6px", fontSize: 10 }}
                            disabled={!open}
                            data-field="not-required"
                            title={isConditionalActivity(it.activity) ? "Not required for this complaint" : "Not applicable to this complaint"}
                            onClick={() =>
                              updateItem(si, ii, {
                                notRequired: !it.notRequired,
                                done: false,
                                // Pressed again, the note this button wrote is
                                // taken back with it — otherwise the activity
                                // would stay "answered" on a comment nobody
                                // typed, and the next one would stay open.
                                comment: it.notRequired ? (it.comment.trim() === "Not required" ? "" : it.comment) : it.comment || "Not required",
                              })
                            }
                          >
                            N/R
                          </button>
                        )}
                      </td>
                      <td>
                        <input type="date" className="input input-sm" disabled={!open} value={it.date ?? ""} onChange={(e) => updateItem(si, ii, { date: e.target.value || null })} />
                      </td>
                      <td>
                        <input className="input input-sm" disabled={!open} value={it.comment} onChange={(e) => updateItem(si, ii, { comment: e.target.value })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="card mt-4">
        <div className="card-header">
          <span className="checklist-section-title">APPROVAL</span>
        </div>
        <div className="card-pad">
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
            <div>
              <div className="text-xs text-muted font-semibold mb-2">PREPARED BY</div>
              <div className="field mb-2">
                <label>Name</label>
                <input className="input input-sm" disabled={!editable} value={data.preparedBy.name} placeholder={currentUser} onChange={(e) => patch({ preparedBy: { ...data.preparedBy, name: e.target.value } })} />
              </div>
              <div className="field mb-2">
                <label>Designation</label>
                <input className="input input-sm" disabled={!editable} value={data.preparedBy.designation} onChange={(e) => patch({ preparedBy: { ...data.preparedBy, designation: e.target.value } })} />
              </div>
              <div className="field">
                <label>Sign &amp; Date</label>
                <input type="date" className="input input-sm" disabled={!editable} value={data.preparedBy.date ?? ""} onChange={(e) => patch({ preparedBy: { ...data.preparedBy, date: e.target.value || null } })} />
              </div>
            </div>
            <div>
              <div className="text-xs text-muted font-semibold mb-2">APPROVED BY</div>
              <div className="field mb-2">
                <label>Name</label>
                <input className="input input-sm" disabled value={data.approvedBy.name} placeholder="Stamped on approval" />
              </div>
              <div className="field mb-2">
                <label>Designation</label>
                <input className="input input-sm" disabled={!canApprove} value={data.approvedBy.designation} placeholder="QA Head" onChange={(e) => patch({ approvedBy: { ...data.approvedBy, designation: e.target.value } })} />
              </div>
              <div className="field">
                <label>Sign &amp; Date</label>
                <input type="date" className="input input-sm" disabled value={data.approvedBy.date ?? ""} />
              </div>
              <div className="text-xs text-muted mt-2">Approval is the Verify step — the approver's name and date are stamped automatically.</div>
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted mt-3" style={{ fontStyle: "italic" }}>
        {COMPLAINT_FOOTER_NOTE}
      </p>
      <div className="text-xs text-faint mt-1 no-print">
        Format number: {doc.formatNo} ({doc.revisionNo} / {formatDisplayDate(doc.revisionDate)}) · {COMPLAINT_ACTIVITY_COUNT} activities · Source: {doc.sourceFile}
      </div>
      </div>

      <RecordHistoryPanel record={record} />

      <RecordActionBar
        status={record.status}
        dirty={false}
        isDemo={record.isDemo}
        saveState="saved"
        onSave={() => undefined}
        onSubmit={() => doSubmit()}
        onVerify={() => doApprove()}
        onReject={doSendBack}
        onResume={() => persist(resumeAfterRejection(record, currentUser) as RecordInstance<ComplaintChecklistData>)}
        onCorrect={doCorrect}
        onCancelCorrection={record.correction ? doCancelCorrection : undefined}
        correctionFromStatus={record.correction?.fromStatus}
        correctionChangeCount={correctionChanges(record).length}
        onPrint={() => printDocument()}
        download={<DownloadDocumentButton doc={doc} dateISO={record.dueDate} />}
        onDelete={(reason) => {
          deleteRecordWithTrail(record, currentUser, reason);
          bump();
          navigate("/gap/external");
        }}
      />
    </div>
  );
}
