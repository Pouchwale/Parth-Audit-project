import React, { useMemo, useState } from "react";
import { FiAlertTriangle, FiArrowRight, FiCheckCircle, FiUpload } from "react-icons/fi";
import { Modal } from "../common/Modal";
import { ApiError, hrApi, type CvReadResult } from "../../api/client";
import { useAppStore } from "../../store/AppStore";
import { useRouter } from "../../store/router";
import { documentRepository } from "../../data/repositories/documentRepository";
import { routeForRecord } from "../../engine/reminders";
import {
  addNewJoiner,
  blankJoiner,
  categoryFor,
  competenceChart,
  defaultTargets,
  gapFor,
  mobileAllowedByMatrix,
  targetStates,
  type JoinerOutcome,
  type NewJoiner,
} from "../../engine/hrJoiner";

// ADD A NEW JOINER FROM A CV (REQUIREMENTS §49) — on Personal Competence Records.
//
// 1. The CV is read on the server (backend/cvExtract.ts) — or the details are
//    entered by hand when there is no readable CV.
// 2. Everything read is shown in the form for HR to check against the CV, with
//    what only HR knows: department, designation, date of joining. What the
//    position requires comes from the plant's own competence register, and the
//    gap is worked out from it.
// 3. HR picks the formats the person goes onto; Add writes them
//    (engine/hrJoiner.ts) and says, per format, what was done.

type Step = "choose" | "review" | "done";

function Field({
  label,
  field,
  value,
  onChange,
  type = "text",
  list,
  options,
  hint,
}: {
  label: string;
  field: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "date";
  list?: string;
  options?: [string, string][];
  hint?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {options ? (
        <select className="input input-sm" data-field={field} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map(([v, text]) => (
            <option key={v} value={v}>
              {text}
            </option>
          ))}
        </select>
      ) : (
        <input className="input input-sm" data-field={field} type={type} list={list} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && <span className="text-xs text-faint">{hint}</span>}
    </div>
  );
}

const RESULT_TEXT: Record<JoinerOutcome["result"], string> = {
  added: "Line added",
  started: "Record started",
  "already-there": "Already there — nothing added",
  "not-available": "Not in your departments — nothing added",
};

export function CvImportDialog({ onClose }: { onClose: () => void }) {
  const { mode, currentUser, bump } = useAppStore();
  const { navigate } = useRouter();
  const isDemo = mode === "demo";
  const [step, setStep] = useState<Step>("choose");
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [read, setRead] = useState<CvReadResult | null>(null);
  const [joiner, setJoiner] = useState<NewJoiner>(blankJoiner);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [targets, setTargets] = useState<Set<string>>(() => new Set(defaultTargets("staff")));
  const [targetsTouched, setTargetsTouched] = useState(false);
  const [outcomes, setOutcomes] = useState<JoinerOutcome[]>([]);
  const chart = useMemo(() => competenceChart(isDemo), [isDemo]);

  // What follows from the designation — the position's requirements, the
  // usual department, operator or staff — and the gap, recomputed until HR
  // types something of their own into that field.
  const derive = (j: NewJoiner, done: Set<string>, changed: string): NewJoiner => {
    const next = { ...j };
    if (changed === "designation" || changed === "init") {
      const line = chart.forDesignation(next.designation);
      if (!done.has("eduRequired")) next.eduRequired = line?.eduRequired ?? "";
      if (!done.has("expRequired")) next.expRequired = line?.expRequired ?? "";
      if (!done.has("department") && line?.department) next.department = line.department;
      if (!done.has("category")) next.category = categoryFor(next.designation);
    }
    if (!done.has("gapJustification")) next.gapJustification = gapFor(next).justification;
    return next;
  };

  const begin = (base: NewJoiner) => {
    const next = derive(base, new Set(), "init");
    setJoiner(next);
    setTouched(new Set());
    setTargets(new Set(defaultTargets(next.category)));
    setTargetsTouched(false);
    setStep("review");
  };

  const update = (key: keyof NewJoiner, value: string) => {
    const done = new Set(touched).add(key);
    setTouched(done);
    const next = derive({ ...joiner, [key]: value } as NewJoiner, done, key);
    setJoiner(next);
    if (!targetsTouched && next.category !== joiner.category) setTargets(new Set(defaultTargets(next.category)));
  };

  const readCv = async () => {
    if (!file) return;
    setReading(true);
    setError("");
    try {
      const result = await hrApi.readCv(file);
      setRead(result);
      const p = result.profile;
      begin({ ...blankJoiner(), name: p.name, sex: p.sex, dateOfBirth: p.dateOfBirth, qualification: p.qualification, experience: p.experience, designation: p.positionAppliedFor });
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.status === 413
            ? "The CV file is larger than 5 MB."
            : e.message
          : "The CV couldn't be sent to be read — check the connection, or enter the details by hand."
      );
    } finally {
      setReading(false);
    }
  };

  const enterByHand = () => {
    setRead(null);
    begin(blankJoiner());
  };

  const states = targetStates(joiner.name, isDemo);
  const selectable = (docId: string) => {
    const s = states.find((x) => x.target.docId === docId);
    return !!s && s.available && !s.alreadyThere;
  };
  const chosen = [...targets].filter(selectable);
  const gap = gapFor(joiner);
  const line = chart.forDesignation(joiner.designation);
  const ready = !!joiner.name.trim() && !!joiner.department.trim() && !!joiner.designation.trim() && /^\d{4}-\d{2}-\d{2}$/.test(joiner.dateOfJoining) && chosen.length > 0;

  const add = () => {
    const source = read && file ? `the CV "${file.name}"` : "details entered by hand";
    setOutcomes(addNewJoiner(joiner, chosen, { actorName: currentUser, isDemo, source }));
    bump();
    setStep("done");
  };

  const open = (o: JoinerOutcome) => {
    if (!o.recordId) return;
    onClose();
    navigate(routeForRecord(documentRepository.getById(o.docId), o.recordId));
  };

  const footer =
    step === "choose" ? (
      <div className="flex items-center justify-between gap-2 wrap" style={{ width: "100%" }}>
        <button className="btn btn-ghost btn-sm" data-action="cv-manual" onClick={enterByHand}>
          Enter details by hand
        </button>
        <button className="btn btn-primary btn-sm" data-action="cv-read" disabled={!file || reading} onClick={() => void readCv()}>
          <FiUpload size={12} /> {reading ? "Reading the CV…" : "Read CV"}
        </button>
      </div>
    ) : step === "review" ? (
      <div className="flex items-center justify-between gap-2 wrap" style={{ width: "100%" }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setStep("choose")}>
          Back
        </button>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" data-action="cv-apply" disabled={!ready} onClick={add}>
            Add to {chosen.length} document{chosen.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    ) : (
      <div className="flex justify-end" style={{ width: "100%" }}>
        <button className="btn btn-primary btn-sm" data-action="cv-close" onClick={onClose}>
          Close
        </button>
      </div>
    );

  return (
    <Modal title="Add a new joiner from a CV" onClose={onClose} width={860} footer={footer}>
      {step === "choose" && (
        <div data-section="cv-choose">
          <p className="text-sm text-muted mb-3">
            Upload the candidate's CV or résumé — PDF, Word (.docx) or text. What it states is read into a form for you to check against the CV, with the
            department, designation and date of joining you add; the person then goes onto Personal Competence Records and the other HR formats that ask for the
            same details. Nothing is written until you press Add.
          </p>
          <input
            type="file"
            data-field="cv-file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError("");
            }}
          />
          {error && (
            <div className="card mt-3" data-state="cv-error" style={{ borderColor: "var(--color-danger)", background: "var(--color-danger-bg)" }}>
              <div className="card-pad text-sm">
                <FiAlertTriangle size={13} style={{ verticalAlign: -2 }} /> {error}
              </div>
            </div>
          )}
        </div>
      )}

      {step === "review" && (
        <div data-section="cv-review">
          <div className="text-xs text-muted mb-3" data-read-by={read?.readBy ?? "hand"}>
            {read ? (
              <>
                Read from “{file?.name}” {read.readBy === "assistant" ? "by the assistant" : "by the text rules"}.
                {read.missing.length > 0 && ` The CV doesn't state: ${read.missing.join(", ")}.`} Check every value against the CV before adding.
              </>
            ) : (
              "Entered by hand."
            )}
          </div>

          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "10px 16px" }}>
            <Field label="Name *" field="joiner-name" value={joiner.name} onChange={(v) => update("name", v)} />
            <Field label="Sex" field="joiner-sex" value={joiner.sex} onChange={(v) => update("sex", v)} options={[["", "—"], ["Male", "Male"], ["Female", "Female"]]} />
            <Field label="Date of Birth" field="joiner-dob" type="date" value={joiner.dateOfBirth} onChange={(v) => update("dateOfBirth", v)} />
            <Field label="Education — Available" field="joiner-qualification" value={joiner.qualification} onChange={(v) => update("qualification", v)} hint={read?.profile.qualificationDetail || undefined} />
            <Field label="Experience (in year) — Available" field="joiner-experience" value={joiner.experience} onChange={(v) => update("experience", v)} />
            <Field label="Department *" field="joiner-department" list="joiner-departments" value={joiner.department} onChange={(v) => update("department", v)} />
            <Field label="Designation *" field="joiner-designation" list="joiner-designations" value={joiner.designation} onChange={(v) => update("designation", v)} />
            <Field label="Date of Joining *" field="joiner-doj" type="date" value={joiner.dateOfJoining} onChange={(v) => update("dateOfJoining", v)} />
            <Field
              label="Category"
              field="joiner-category"
              value={joiner.category}
              onChange={(v) => update("category", v)}
              options={[
                ["staff", "Staff (Supervisor & above)"],
                ["operator", "Operator / Worker"],
              ]}
            />
            <Field label="Education — Required" field="joiner-edu-required" value={joiner.eduRequired} onChange={(v) => update("eduRequired", v)} />
            <Field label="Experience (in year) — Required" field="joiner-exp-required" value={joiner.expRequired} onChange={(v) => update("expRequired", v)} />
            <Field label="Justification for gaps if any" field="joiner-gap" value={joiner.gapJustification} onChange={(v) => update("gapJustification", v)} />
          </div>
          <datalist id="joiner-departments">
            {chart.departments.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
          <datalist id="joiner-designations">
            {chart.designations.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>

          <div className="text-xs text-muted mt-3" data-state="chart">
            {line
              ? `From the competence register: ${joiner.designation} requires ${line.eduRequired || "—"} and ${line.expRequired || "—"} (${line.lines} line${line.lines === 1 ? "" : "s"} on F/HR/01).`
              : joiner.designation.trim()
                ? "No line for this designation on F/HR/01 yet — enter what the position requires."
                : "Enter the designation the person joins as."}
          </div>
          <div className={`text-xs mt-1 ${gap.issues.length ? "text-warning" : "text-muted"}`} data-state="gap">
            {gap.issues.length
              ? `Gap: ${gap.issues.join("; ")} — write the justification.`
              : gap.compared
                ? "Meets what the position requires — the justification reads NA."
                : "Education or experience couldn't be compared with the requirement — check the gap yourself."}
          </div>
          {read && (read.profile.email || read.profile.phone || read.profile.lastDesignation || read.profile.lastEmployer) && (
            <div className="text-xs text-faint mt-1" translate="no">
              From the CV, not written on any format: {[read.profile.email, read.profile.phone, [read.profile.lastDesignation, read.profile.lastEmployer].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
            </div>
          )}

          <h4 className="text-sm font-semibold mt-4 mb-2">Add to</h4>
          <div data-section="cv-targets">
            {states.map((s) => {
              const id = s.target.docId;
              const can = s.available && !s.alreadyThere;
              return (
                <label key={id} className="flex items-start gap-2 mb-2" data-target={id} style={{ cursor: can ? "pointer" : "default" }}>
                  <input
                    type="checkbox"
                    style={{ marginTop: 3 }}
                    checked={can && targets.has(id)}
                    disabled={!can}
                    onChange={(e) => {
                      const next = new Set(targets);
                      if (e.target.checked) next.add(id);
                      else next.delete(id);
                      setTargets(next);
                      setTargetsTouched(true);
                    }}
                  />
                  <span className="text-sm">
                    <strong>{s.target.formatNo}</strong> {s.target.title} <span className="text-muted">— {s.target.what}</span>
                    {!s.available && <span className="text-xs text-faint"> · not in your departments</span>}
                    {s.alreadyThere && <span className="text-xs text-warning"> · already has {joiner.name.trim()}</span>}
                    {can && s.willReopen && (
                      <span className="text-xs text-muted">
                        {" "}
                        · {s.recordStatus}: reopened for correction to take the line, then submitted and verified again
                      </span>
                    )}
                    {id === "hr-mobile-authorization" && mobileAllowedByMatrix(joiner.designation) && (
                      <span className="text-xs text-muted"> · this designation is on the mobile-usage matrix; allowing it is the PSTL's decision</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {step === "done" && (
        <div data-section="cv-done">
          <p className="text-sm mb-3">
            <FiCheckCircle size={14} style={{ verticalAlign: -2, color: "var(--color-success)" }} /> {joiner.name.trim()} — {joiner.designation.trim()}, {joiner.department.trim()}.
          </p>
          <div className="doc-table">
            <table className="compact" data-table="cv-outcomes">
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
                      {o.reopened && " — reopened for correction; submit and verify it again"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {o.recordId && (
                        <button className="btn btn-ghost btn-sm" onClick={() => open(o)}>
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
    </Modal>
  );
}
