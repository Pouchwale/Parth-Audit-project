import React, { useMemo, useState } from "react";
import { FiAlertTriangle, FiCheckCircle, FiInfo } from "react-icons/fi";
import type { HrMasterPerson } from "../../types";
import { useAppStore } from "../../store/AppStore";
import { useRouter } from "../../store/router";
import { hrMasterRepository } from "../../data/repositories/hrMasterRepository";
import { hrPageForDocument } from "../../data/seed/hrModule";
import {
  audienceOf,
  defaultChoice,
  fileEveryone,
  filePerson,
  placementsFor,
  planEveryone,
  ROLE_WORDS,
  roleOf,
  type EveryoneOutcome,
  type FilingOutcome,
} from "../../engine/hrMasterFiling";
import { describePerson } from "../../engine/hrMaster";
import { Modal } from "../common/Modal";

// FILE ON THE HR FORMATS, FROM THE SHEET (REQUIREMENTS §53; engine/hrMasterFiling.ts).
//
// One person: their role from the Designation/Position, the formats for that
// role ticked, where they already are shown and left alone, a format kept for
// the other role offered with a warning — then one press files them. Everyone:
// what would be written on each format, counted, before anything is.

const recordPath = (docId: string, recordId: string | null) => {
  const page = hrPageForDocument(docId);
  return recordId ? `/records/${recordId}` : page ? `/hr/${page.slug}` : "/hr";
};

function OutcomeLine({ o, onOpen }: { o: FilingOutcome; onOpen: (path: string) => void }) {
  const words =
    o.result === "added"
      ? `line ${o.line} added${o.reopened ? " (the register was reopened for correction: submit and verify it again)" : ""}`
      : o.result === "started"
        ? "a record of their own started"
        : o.result === "already"
          ? o.line
            ? `already on line ${o.line} — left as it is`
            : "already has a record of their own — left as it is"
          : o.result === "unclear"
            ? `nothing written — ${o.why}`
            : "not one of your formats";
  const good = o.result === "added" || o.result === "started";
  return (
    <li data-outcome={o.docId} data-result={o.result}>
      {good ? <FiCheckCircle size={12} style={{ verticalAlign: -2, color: "var(--color-success)" }} /> : <FiInfo size={12} style={{ verticalAlign: -2 }} />}{" "}
      <strong>{o.formatNo}</strong> {o.title}: {words}
      {o.recordId && (
        <>
          {" "}
          <button className="btn btn-ghost btn-sm" style={{ padding: "0 4px" }} onClick={() => onOpen(recordPath(o.docId, o.recordId))}>
            Open
          </button>
        </>
      )}
    </li>
  );
}

/** One person from the sheet, filed on the formats for their role. */
export function HrMasterFilingDialog({ person, onClose, onDone }: { person: HrMasterPerson; onClose: () => void; onDone: () => void }) {
  const { currentUser, mode } = useAppStore();
  const { navigate } = useRouter();
  const isDemo = mode === "demo";
  const placements = useMemo(() => placementsFor(person, hrMasterRepository.all(), isDemo), [person, isDemo]);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(defaultChoice(placements)));
  const [outcomes, setOutcomes] = useState<FilingOutcome[] | null>(null);
  const role = roleOf(person);
  const writable = placements.filter((p) => p.standing.kind === "add" || p.standing.kind === "start");
  const picked = writable.filter((p) => chosen.has(p.target.docId));
  const mismatched = picked.filter((p) => p.mismatch);

  const toggle = (docId: string) =>
    setChosen((s) => {
      const next = new Set(s);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });

  const file = () => {
    setOutcomes(filePerson(person, [...chosen], { actorName: currentUser, isDemo }));
    onDone();
  };

  const open = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <Modal
      title={outcomes ? "Filed on the HR formats" : "File on the HR formats"}
      onClose={onClose}
      width={760}
      footer={
        <div className="flex justify-end gap-2" style={{ width: "100%" }}>
          {outcomes ? (
            <button className="btn btn-primary btn-sm" data-action="hr-filing-close" onClick={onClose}>
              Done
            </button>
          ) : (
            <>
              <button className="btn btn-secondary btn-sm" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" data-action="hr-filing-file" disabled={picked.length === 0} onClick={file}>
                {picked.length === 0 ? "Nothing to file" : `File on ${picked.length} format${picked.length === 1 ? "" : "s"}`}
              </button>
            </>
          )}
        </div>
      }
    >
      <div data-section="hr-filing" data-role={role}>
        <p className="text-sm mb-2">
          <strong>{describePerson(person)}</strong>
        </p>
        <p className="text-sm mb-3" data-state="hr-filing-role">
          {person.designation.trim() ? (
            <>
              Designation <strong>{person.designation}</strong> → <strong>{ROLE_WORDS[role]}</strong>. The formats for that role are ticked; the sheet's own details go on each, in
              the register's own date style.
            </>
          ) : (
            <>
              No Designation/Position on the sheet, so counted as <strong>{ROLE_WORDS[role]}</strong> — write the designation on the sheet first if that is wrong.
            </>
          )}
        </p>

        {outcomes ? (
          <ul className="text-sm" data-list="hr-filing-outcomes">
            {outcomes.map((o) => (
              <OutcomeLine key={o.docId} o={o} onOpen={open} />
            ))}
          </ul>
        ) : (
          <>
            <ul className="text-sm" data-list="hr-filing-targets" style={{ listStyle: "none", padding: 0 }}>
              {placements.map((p) => {
                const { target, standing } = p;
                const can = standing.kind === "add" || standing.kind === "start";
                const note =
                  standing.kind === "already"
                    ? standing.line
                      ? `already on line ${standing.line}`
                      : "already has a record of their own"
                    : standing.kind === "unclear"
                      ? standing.why
                      : standing.kind === "not-available"
                        ? "not one of your formats"
                        : standing.willReopen
                          ? `${standing.recordStatus ?? "submitted"} — will be reopened for correction, and goes back to be verified`
                          : target.what;
                return (
                  <li key={target.docId} data-target={target.docId} data-standing={standing.kind} style={{ padding: "4px 0" }}>
                    <label className="flex gap-2" style={{ alignItems: "flex-start", cursor: can ? "pointer" : "default" }}>
                      <input type="checkbox" data-field={`file-${target.docId}`} checked={can ? chosen.has(target.docId) : standing.kind === "already"} disabled={!can} onChange={() => toggle(target.docId)} />
                      <span>
                        <strong>{target.formatNo}</strong> {target.title}
                        {p.byRole ? "" : target.docId === "hr-mobile-authorization" ? <span className="text-xs text-muted"> · the PSTL's decision, never ticked by itself</span> : <span className="text-xs text-muted"> · not for this role</span>}
                        <div className="text-xs text-muted">{note}</div>
                        {p.mismatch && can && (
                          <div className="text-xs" style={{ color: "var(--color-warning)" }} data-state="hr-filing-mismatch">
                            <FiAlertTriangle size={11} style={{ verticalAlign: -1 }} /> Kept for {ROLE_WORDS[audienceOf(p.target.docId) ?? "staff"]}; {person.fullName || "this person"} is {ROLE_WORDS[role]}.
                          </div>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {mismatched.length > 0 && (
              <p className="text-sm mt-2" style={{ color: "var(--color-warning)" }} data-state="hr-filing-warning">
                <FiAlertTriangle size={12} style={{ verticalAlign: -2 }} /> {mismatched.map((p) => p.target.formatNo).join(", ")} {mismatched.length === 1 ? "is" : "are"} kept for the other role. Untick{" "}
                {mismatched.length === 1 ? "it" : "them"} unless HR means it.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/** Everyone on the sheet, filed on the formats for their role — counted first, written on one press. */
export function HrMasterFileEveryoneDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { currentUser, mode } = useAppStore();
  const { navigate } = useRouter();
  const isDemo = mode === "demo";
  const people = useMemo(() => hrMasterRepository.all(), []);
  const plan = useMemo(() => planEveryone(people, isDemo), [people, isDemo]);
  const [outcome, setOutcome] = useState<EveryoneOutcome | null>(null);
  const toAdd = plan.lines.reduce((n, l) => n + l.toAdd, 0);

  const file = () => {
    setOutcome(fileEveryone(people, { actorName: currentUser, isDemo }));
    onDone();
  };

  const lines = outcome ? outcome.written : plan.lines;
  const unclearPeople = outcome ? outcome.filed.filter((f) => f.outcomes.some((o) => o.result === "unclear")) : [];

  return (
    <Modal
      title={outcome ? "Everyone filed on their formats" : "File everyone on the HR formats"}
      onClose={onClose}
      width={760}
      footer={
        <div className="flex justify-end gap-2" style={{ width: "100%" }}>
          {outcome ? (
            <button className="btn btn-primary btn-sm" data-action="hr-filing-close" onClick={onClose}>
              Done
            </button>
          ) : (
            <>
              <button className="btn btn-secondary btn-sm" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" data-action="hr-filing-everyone" disabled={toAdd === 0} onClick={file}>
                {toAdd === 0 ? "Nothing to file" : `File ${toAdd} line${toAdd === 1 ? "" : "s"} and record${toAdd === 1 ? "" : "s"}`}
              </button>
            </>
          )}
        </div>
      }
    >
      <div data-section="hr-filing-everyone">
        <p className="text-sm mb-2" data-state="hr-filing-everyone-summary">
          {outcome ? (
            <>
              Written for <strong>{outcome.filed.length}</strong> people on the sheet.
            </>
          ) : (
            <>
              <strong>{plan.people}</strong> people on the sheet; <strong>{plan.settled}</strong> already on every format for their role. Each person goes on the formats for their
              role — staff on F/HR/01, F/HR/05 and F/HR/04, operators / workers on F/HR/03 and F/HR/06, everyone on F/HR/08 — in the register's own style. Nobody gets a second
              line. Nothing changes until you press the button.
            </>
          )}
        </p>
        <div className="doc-table mb-3">
          <table className="compact" data-table="hr-filing-lines">
            <thead>
              <tr>
                <th>Format</th>
                <th>{outcome ? "Written" : "To write"}</th>
                <th>Already there</th>
                <th>Left out</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.docId} data-line={l.docId}>
                  <td>
                    <strong>{l.formatNo}</strong> {l.title}
                  </td>
                  <td data-count="to-add">{l.toAdd}</td>
                  <td data-count="already">{l.already}</td>
                  <td data-count="unclear">{l.unclear}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!outcome && plan.unclear.length > 0 && (
          <div className="text-sm" data-list="hr-filing-everyone-unclear">
            <p className="mb-1">
              <FiAlertTriangle size={12} style={{ verticalAlign: -2, color: "var(--color-warning)" }} /> Left off the registers, so nothing is guessed:
            </p>
            <ul>
              {plan.unclear.slice(0, 12).map((u) => (
                <li key={u.person.id}>
                  {u.person.fullName || "(no name)"} — {u.why}
                </li>
              ))}
              {plan.unclear.length > 12 && <li>…and {plan.unclear.length - 12} more</li>}
            </ul>
          </div>
        )}
        {outcome && unclearPeople.length > 0 && (
          <div className="text-sm" data-list="hr-filing-everyone-unclear">
            <p className="mb-1">Not written, so nothing is guessed:</p>
            <ul>
              {unclearPeople.slice(0, 12).map((f) => (
                <li key={f.person.id}>
                  {f.person.fullName || "(no name)"} — {f.outcomes.find((o) => o.result === "unclear")?.why}
                </li>
              ))}
              {unclearPeople.length > 12 && <li>…and {unclearPeople.length - 12} more</li>}
            </ul>
          </div>
        )}
        {outcome && (
          <p className="text-xs text-muted mt-2">
            A register that was submitted or verified was reopened for correction with the reason written, and goes back to be verified.{" "}
            <button className="btn btn-ghost btn-sm" style={{ padding: "0 4px" }} onClick={() => { onClose(); navigate("/hr"); }}>
              All HR records
            </button>
          </p>
        )}
      </div>
    </Modal>
  );
}
