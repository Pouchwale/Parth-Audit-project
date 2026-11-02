import React, { useMemo, useState } from "react";
import { FiAlertTriangle, FiArrowRight, FiCheckCircle, FiFileText } from "react-icons/fi";
import { Modal } from "../common/Modal";
import { useAppStore } from "../../store/AppStore";
import { useRouter } from "../../store/router";
import { documentRepository } from "../../data/repositories/documentRepository";
import { routeForRecord } from "../../engine/reminders";
import { HR_MASTER_COLUMNS, describePerson, linkedFieldLabel, missingColumns } from "../../engine/hrMaster";
import { fileFromMaster, fileTargetStates, type FileOutcome, type FileResult } from "../../engine/hrMasterFile";
import type { HrMasterPerson } from "../../types";
import { formatDisplayDate } from "../../utils/date";

// FILL HR FORMATS FOR ONE EMPLOYEE, FROM THEIR LINE ON HR MASTER DATA
// (REQUIREMENTS §160). The sheet's six details are read once and shown; HR
// ticks the formats; one press files the person onto every one of them with
// exactly the boxes each prints (engine/hrMasterFile.ts). Each record filed is
// opened from here — where it prints and downloads as Word or Excel (§156).
// Nothing is written before the press, and a column blank on the sheet is
// named, not made up (§159).

const RESULT_TEXT: Record<FileResult, string> = {
  started: "Record of their own started",
  added: "Line added",
  filled: "Blank boxes filled",
  "already-there": "Already on it, with these details — left as it is",
  "several-lines": "On more than one line of the register — fill the right line on the form",
  "not-available": "Not one of your formats",
};

export function FileFromMasterDialog({ person, onClose }: { person: HrMasterPerson; onClose: () => void }) {
  const { currentUser, mode, bump } = useAppStore();
  const { navigate } = useRouter();
  const isDemo = mode === "demo";
  const states = useMemo(() => fileTargetStates(person, isDemo), [person, isDemo]);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(states.filter((s) => s.available && !s.severalLines && !(s.alreadyThere && s.blanks === 0)).map((s) => s.link.docId)));
  const [outcomes, setOutcomes] = useState<FileOutcome[] | null>(null);
  const missing = missingColumns({ docId: "", formatNo: "", where: "header", nameField: "", fields: HR_MASTER_COLUMNS.map((c) => ({ key: c.key, from: c.key })) }, person);

  const toggle = (docId: string) =>
    setChosen((s) => {
      const next = new Set(s);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });

  const go = () => {
    setOutcomes(fileFromMaster(person, Array.from(chosen), { actorName: currentUser, isDemo }));
    bump();
  };

  const open = (o: FileOutcome) => {
    if (!o.recordId) return;
    onClose();
    navigate(routeForRecord(documentRepository.getById(o.docId), o.recordId));
  };

  return (
    <Modal
      title={`Fill HR formats — ${person.fullName || "this person"}`}
      onClose={onClose}
      width={760}
      footer={
        <div className="flex justify-end gap-2" style={{ width: "100%" }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            {outcomes ? "Close" : "Cancel"}
          </button>
          {!outcomes && (
            <button className="btn btn-primary btn-sm" data-action="hr-master-file-go" disabled={chosen.size === 0} onClick={go}>
              <FiFileText size={12} /> {chosen.size === 0 ? "Tick a format" : `Fill ${chosen.size} format${chosen.size === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      }
    >
      <div data-section="hr-master-file">
        <p className="text-sm mb-2">
          From HR Master Data — <strong>{describePerson(person)}</strong>. Each format below gets only the boxes it prints, in its own style; what is already
          written on a record is never changed.
        </p>
        <div className="doc-table mb-3" style={{ overflowX: "auto" }}>
          <table className="compact" data-table="hr-master-file-details">
            <thead>
              <tr>
                {HR_MASTER_COLUMNS.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {HR_MASTER_COLUMNS.map((c) => {
                  const v = person[c.key];
                  return (
                    <td key={c.key} data-detail={c.key} data-missing={v ? undefined : "true"} className={v ? "" : "cell-out-of-band"}>
                      {v ? (c.kind === "date" ? formatDisplayDate(v) : v) : <span className="text-xs">not on the sheet</span>}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
        {missing.length > 0 && !outcomes && (
          <p className="text-xs tbc mb-3" data-state="hr-master-file-missing">
            <FiAlertTriangle size={11} style={{ verticalAlign: -1 }} /> HR Master Data has no {missing.map((k) => HR_MASTER_COLUMNS.find((c) => c.key === k)?.label ?? k).join(", ")} for{" "}
            {person.fullName || "this person"}: those boxes stay blank on the forms — nothing is made up. Add them on the sheet first if the formats need them.
          </p>
        )}

        {!outcomes && (
          <div data-list="hr-master-file-targets">
            {states.map((s) => {
              const doc = documentRepository.getById(s.link.docId);
              const can = s.available && !s.severalLines && !(s.alreadyThere && s.blanks === 0);
              const note = !s.available
                ? "not one of your formats"
                : s.severalLines
                  ? "on more than one line of the register — fill the right line on the form"
                  : s.alreadyThere
                    ? s.blanks === 0
                      ? s.conflicts > 0
                        ? `${s.link.where === "header" ? "already has a record" : "already on the register"} — ${s.conflicts} box${s.conflicts === 1 ? " says" : "es say"} something else than the sheet; open it and use Fetch to replace it`
                        : s.link.where === "header"
                          ? "already has a record with these details"
                          : "already on the register with these details"
                      : `${s.link.where === "header" ? "has a record" : "is on the register"} — ${s.blanks} blank box${s.blanks === 1 ? "" : "es"} to fill${s.conflicts > 0 ? `, ${s.conflicts} left as written` : ""}${s.willReopen ? `; ${s.recordStatus}, reopened for correction` : ""}`
                    : s.link.where === "header"
                      ? "a record of their own"
                      : `a line on the register${s.willReopen ? ` — ${s.recordStatus}, reopened for correction, then submitted and verified again` : ""}`;
              return (
                <label key={s.link.docId} className="flex items-start gap-2 mb-2" style={{ cursor: can ? "pointer" : "default", opacity: can ? 1 : 0.6 }}>
                  <input type="checkbox" data-target={s.link.docId} checked={chosen.has(s.link.docId)} disabled={!can} onChange={() => toggle(s.link.docId)} style={{ marginTop: 3 }} />
                  <span className="text-sm">
                    <strong>{s.link.formatNo}</strong> {doc?.name ?? s.title}
                    <span className="text-xs text-muted"> · {note}</span>
                    <div className="text-xs text-faint">{s.link.fields.map((f) => linkedFieldLabel(s.link.docId, f)).join(" · ")}</div>
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {outcomes && (
          <div data-section="hr-master-file-done">
            <p className="text-sm mb-2">
              <FiCheckCircle size={14} style={{ verticalAlign: -2, color: "var(--color-success)" }} /> Done. Open a record to see it filled, print it, or download it as Word or Excel.
            </p>
            <div className="doc-table">
              <table className="compact" data-table="hr-master-file-outcomes">
                <thead>
                  <tr>
                    <th>Format</th>
                    <th>What was done</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {outcomes.map((o) => (
                    <tr key={o.docId} data-outcome={o.docId} data-result={o.result}>
                      <td className="text-sm">
                        <strong>{o.formatNo}</strong> {o.title}
                      </td>
                      <td className="text-sm">
                        {RESULT_TEXT[o.result]}
                        {o.written.length > 0 && <span className="text-xs text-muted"> — {o.written.join(", ")}</span>}
                        {o.reopened && <span className="text-xs text-muted"> — reopened for correction; submit and verify it again</span>}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {o.recordId && (
                          <button className="btn btn-ghost btn-sm" data-action="hr-master-file-open" onClick={() => open(o)}>
                            Open <FiArrowRight size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
