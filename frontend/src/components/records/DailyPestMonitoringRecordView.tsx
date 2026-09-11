import React from "react";
import { FiPlus, FiTrash2, FiAlertTriangle } from "react-icons/fi";
import type { DailyPestMonitoringData, DocumentDefinition, RecordInstance, RodentCatch } from "../../types";
import { DocumentHeader } from "../documents/DocumentHeader";
import { masterRepository } from "../../data/repositories/masterRepository";
import { isCheckpointFinding } from "../../engine/checkpoints";
import { dayInfo } from "../../engine/holidays";
import { totalRodents } from "../../engine/rodentPattern";
import { Link } from "../../store/router";
import { FHR17_INSTRUCTION_1, FHR17_INSTRUCTION_2 } from "./DailyRegisterSheet";
import { MONTH_NAMES, formatDisplayDate, fromISODate } from "../../utils/date";
import { generateId } from "../../utils/id";

const RODENT_AREA_CONTEXT = "service-report:Rodent Control Service";

export function DailyPestMonitoringRecordView({
  doc,
  record,
  editable,
  onChange,
}: {
  doc: DocumentDefinition;
  record: RecordInstance<DailyPestMonitoringData>;
  editable: boolean;
  onChange: (data: DailyPestMonitoringData) => void;
}) {
  const data = record.data;
  const master = masterRepository.get();
  const checkpoints = master.checkpoints;
  const rodentAreas = master.areas.filter((a) => a.context === RODENT_AREA_CONTEXT).map((a) => a.name);
  const anyFinding = checkpoints.some((cp) => isCheckpointFinding(cp, data.checkpoints[cp.no]?.value));
  const rodentTrapped = data.checkpoints[7]?.value === "Yes";
  const catches = data.rodentCatches ?? [];

  const setField = <K extends keyof DailyPestMonitoringData>(key: K, value: DailyPestMonitoringData[K]) => {
    onChange({ ...data, [key]: value });
  };

  const setCheckpoint = (no: number, patch: Partial<{ value: string | number | null; note: string }>) => {
    const next: DailyPestMonitoringData = {
      ...data,
      checkpoints: {
        ...data.checkpoints,
        [no]: { ...(data.checkpoints[no] ?? { value: null }), ...patch },
      },
    };
    // Answering "Yes" to checkpoint 7 opens the catch-details table with
    // one row ready to fill — the count and location are what get reported.
    if (no === 7 && patch.value === "Yes" && (next.rodentCatches ?? []).length === 0) {
      next.rodentCatches = [{ id: generateId("rc"), trapBoxNo: "", location: rodentAreas[0] ?? "", count: 1 }];
    }
    onChange(next);
  };

  const updateCatch = (id: string, patch: Partial<RodentCatch>) =>
    setField("rodentCatches", catches.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const addCatch = () => setField("rodentCatches", [...catches, { id: generateId("rc"), trapBoxNo: "", location: rodentAreas[0] ?? "", count: 1 }]);
  const removeCatch = (id: string) => setField("rodentCatches", catches.filter((c) => c.id !== id));

  const addAction = () => {
    setField("summaryActions", [
      ...data.summaryActions,
      { id: generateId("act"), dateOfObservation: record.dueDate, descriptionOfObservation: "", actionTaken: "", remarks: "" },
    ]);
  };
  const removeAction = (id: string) => setField("summaryActions", data.summaryActions.filter((a) => a.id !== id));

  const due = fromISODate(record.dueDate);

  return (
    <div>
      <DocumentHeader doc={doc} extraTitle={formatDisplayDate(record.dueDate)} pageLabel={`row ${due.getDate()} of the ${MONTH_NAMES[due.getMonth()]} register`} />
      <div className="text-xs text-muted mt-2 no-print">
        This is one date row of the F/HR/17 monthly register (3 pages).{" "}
        <Link to={`/pest/daily/${due.getFullYear()}/${due.getMonth()}`}>View {MONTH_NAMES[due.getMonth()]} {due.getFullYear()} in the register format</Link>
      </div>

      <div className="card mt-4">
        <div className="card-pad">
          <p className="text-sm mb-2">{FHR17_INSTRUCTION_1}</p>
          <p className="text-sm font-semibold">{FHR17_INSTRUCTION_2}</p>

          <label className="flex items-center gap-2 mt-4" style={{ cursor: editable ? "pointer" : "default" }}>
            <input
              type="checkbox"
              checked={data.isHoliday}
              disabled={!editable}
              onChange={(e) => setField("isHoliday", e.target.checked)}
            />
            <span className="text-sm">Mark as Holiday / Non-working day (matches "H O L I D A Y" rows in the source register — no checkpoint entry required)</span>
          </label>
          {(() => {
            const day = dayInfo(record.dueDate, master);
            return day.kind !== "working" ? (
              <div className={`text-xs mt-1 no-print ${day.isHoliday ? "text-warning" : "text-success"}`} style={{ paddingLeft: 22 }}>
                {day.label} — per the working calendar (Master Data → Holidays)
                {day.isHoliday && data.isHoliday ? "; untick only if the plant actually worked this day." : ""}
                {day.isHoliday && !data.isHoliday ? "; unticked — this day is being recorded as worked, with checkpoints to fill." : ""}
              </div>
            ) : null;
          })()}
        </div>
      </div>

      {!data.isHoliday && (
        <div className="doc-table mt-4">
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>No.</th>
                <th>Check Point</th>
                <th style={{ width: 200 }}>Response</th>
                <th style={{ width: 220 }}>Note</th>
              </tr>
            </thead>
            <tbody>
              {checkpoints.map((cp) => {
                const ans = data.checkpoints[cp.no] ?? { value: null };
                const flagged = isCheckpointFinding(cp, ans.value);
                return (
                  <tr key={cp.no}>
                    <td>{cp.no}</td>
                    <td className="text-sm">{cp.text}</td>
                    <td>
                      {cp.responseType === "number" ? (
                        <input
                          type="number"
                          className="input input-sm"
                          disabled={!editable}
                          value={ans.value ?? ""}
                          onChange={(e) => setCheckpoint(cp.no, { value: e.target.value === "" ? null : Number(e.target.value) })}
                        />
                      ) : (
                        <select
                          className="input input-sm"
                          disabled={!editable}
                          value={(ans.value as string) ?? ""}
                          onChange={(e) => setCheckpoint(cp.no, { value: e.target.value || null })}
                        >
                          <option value="">Select…</option>
                          {["No", "Yes"].map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      {cp.responseType === "yesno-note" ? (
                        <input
                          className="input input-sm"
                          placeholder={cp.notePrompt}
                          disabled={!editable}
                          value={ans.note ?? ""}
                          onChange={(e) => setCheckpoint(cp.no, { note: e.target.value })}
                        />
                      ) : flagged ? (
                        <span className="text-danger text-xs">
                          <FiAlertTriangle size={11} style={{ verticalAlign: -1 }} /> Finding — log below
                        </span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!data.isHoliday && rodentTrapped && (
        <div className="card mt-4" style={{ borderLeft: "4px solid var(--color-danger)" }}>
          <div className="card-header">
            <h3 className="text-base font-semibold">
              Rodent catch details — checkpoint 7 · {totalRodents(catches)} rodent{totalRodents(catches) === 1 ? "" : "s"} today
            </h3>
            {editable && (
              <button className="btn btn-secondary btn-sm" onClick={addCatch}>
                <FiPlus size={13} /> Add box
              </button>
            )}
          </div>
          <div className="doc-table" style={{ border: "none" }}>
            <table className="compact">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Trap box no.</th>
                  <th>Location</th>
                  <th style={{ width: 130 }}>No. of rodents</th>
                  {editable && <th style={{ width: 36 }}></th>}
                </tr>
              </thead>
              <tbody>
                {catches.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-danger text-sm" style={{ padding: 12 }}>
                      <FiAlertTriangle size={12} style={{ verticalAlign: -2 }} /> Add the box, location and number of rodents.
                    </td>
                  </tr>
                )}
                {catches.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <input className="input input-sm" placeholder="RB-27" disabled={!editable} value={c.trapBoxNo} onChange={(e) => updateCatch(c.id, { trapBoxNo: e.target.value })} />
                    </td>
                    <td>
                      <input className="input input-sm" list="rodent-areas" disabled={!editable} value={c.location} onChange={(e) => updateCatch(c.id, { location: e.target.value })} />
                    </td>
                    <td>
                      <input type="number" min={1} className="input input-sm" disabled={!editable} value={c.count} onChange={(e) => updateCatch(c.id, { count: Math.max(0, Number(e.target.value) || 0) })} />
                    </td>
                    {editable && (
                      <td>
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => removeCatch(c.id)}>
                          <FiTrash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <datalist id="rodent-areas">
            {rodentAreas.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </div>
      )}

      {!data.isHoliday && (
        <div className="card mt-4">
          <div className="card-pad flex gap-4 wrap">
            <div className="field" style={{ minWidth: 160 }}>
              <label>Time of checking</label>
              <input
                type="time"
                className="input"
                disabled={!editable}
                value={data.timeOfChecking}
                onChange={(e) => setField("timeOfChecking", e.target.value)}
              />
            </div>
            <div className="field" style={{ minWidth: 220 }}>
              <label>Checker</label>
              <input
                className="input"
                disabled={!editable}
                value={data.checker}
                onChange={(e) => setField("checker", e.target.value)}
                placeholder="Name of checker"
              />
            </div>
          </div>
        </div>
      )}

      <div className="card mt-4">
        <div className="card-header">
          <h3 className="text-base font-semibold">Summary of Actions Taken if Pest Observed</h3>
          {editable && (
            <button className="btn btn-secondary btn-sm" onClick={addAction}>
              <FiPlus size={13} /> Add Row
            </button>
          )}
        </div>
        {anyFinding && data.summaryActions.length === 0 && (
          <div className="card-pad no-print" style={{ paddingBottom: 0 }}>
            <div className="text-danger text-sm">
              <FiAlertTriangle size={13} style={{ verticalAlign: -2 }} /> A checkpoint above indicates a finding. Please
              add a row describing the observation and action taken.
            </div>
          </div>
        )}
        <div className="doc-table" style={{ border: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Date of Observation</th>
                <th>Description of Observation</th>
                <th>Action Taken</th>
                <th>Remarks</th>
                {editable && <th></th>}
              </tr>
            </thead>
            <tbody>
              {data.summaryActions.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-muted text-center" style={{ padding: 16 }}>
                    No actions recorded.
                  </td>
                </tr>
              )}
              {data.summaryActions.map((a) => (
                <tr key={a.id}>
                  <td>
                    <input
                      type="date"
                      className="input input-sm"
                      disabled={!editable}
                      value={a.dateOfObservation}
                      onChange={(e) =>
                        setField(
                          "summaryActions",
                          data.summaryActions.map((x) => (x.id === a.id ? { ...x, dateOfObservation: e.target.value } : x))
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input input-sm"
                      disabled={!editable}
                      value={a.descriptionOfObservation}
                      onChange={(e) =>
                        setField(
                          "summaryActions",
                          data.summaryActions.map((x) => (x.id === a.id ? { ...x, descriptionOfObservation: e.target.value } : x))
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input input-sm"
                      disabled={!editable}
                      value={a.actionTaken}
                      onChange={(e) =>
                        setField("summaryActions", data.summaryActions.map((x) => (x.id === a.id ? { ...x, actionTaken: e.target.value } : x)))
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input input-sm"
                      disabled={!editable}
                      value={a.remarks}
                      onChange={(e) =>
                        setField("summaryActions", data.summaryActions.map((x) => (x.id === a.id ? { ...x, remarks: e.target.value } : x)))
                      }
                    />
                  </td>
                  {editable && (
                    <td>
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => removeAction(a.id)}>
                        <FiTrash2 size={13} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
