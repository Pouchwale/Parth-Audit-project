import React, { useState } from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { useAppStore } from "../store/AppStore";
import { masterRepository } from "../data/repositories/masterRepository";
import { documentRepository } from "../data/repositories/documentRepository";
import { settingsRepository } from "../data/repositories/settingsRepository";
import { generateId } from "../utils/id";
import { pressable } from "../utils/pressable";
import { todayISO } from "../utils/date";
import { scheduleLabel } from "../engine/frequencyEngine";
import { resolveResponsibleEmployees } from "../engine/documentInfo";
import { weeklyOffDay, WEEKDAY_LONG } from "../engine/holidays";
import type { AdjustmentDay, CompanyHoliday, Employee } from "../types";
import { DepartmentsAccess } from "../components/master/DepartmentsAccess";
import { useT } from "../i18n";

type Tab = "employees" | "departments" | "chemicals" | "pcLocations" | "rodentStations" | "areas" | "checkpoints" | "documents" | "holidays" | "settings";

const TABS: { key: Tab; label: string }[] = [
  { key: "employees", label: "Employees" },
  { key: "departments", label: "Departments & access" },
  { key: "chemicals", label: "Chemicals" },
  { key: "pcLocations", label: "PC IDs (Fly Catchers)" },
  { key: "rodentStations", label: "Rodent Stations" },
  { key: "areas", label: "Areas" },
  { key: "checkpoints", label: "Checkpoints" },
  { key: "documents", label: "Documents / Formats" },
  { key: "holidays", label: "Holidays" },
  { key: "settings", label: "Working Hours & Briefing" },
];

export function MasterDataPage() {
  const t = useT();
  const { bump, version } = useAppStore();
  const [tab, setTab] = useState<Tab>("employees");
  const master = masterRepository.get();

  return (
    <div>
      <h1 className="text-2xl mb-1">{t("master.title")}</h1>
      <p className="text-muted mb-4">
        Administrator-managed reference data. Everything here was seeded from the uploaded source documents — see
        REQUIREMENTS.md for provenance. Add rows as the company confirms additional locations, chemicals or staff.
      </p>

      <div className="pill-tabs mb-4 wrap" style={{ flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <div key={t.key} className={`pill-tab ${tab === t.key ? "active" : ""}`} {...pressable(() => setTab(t.key), tab === t.key)}>
            {t.label}
          </div>
        ))}
      </div>

      {tab === "employees" && (
        <>
          <p className="text-muted text-sm mb-3">
            Role and email drive reminders (see the Documents tab): a document's reminders go to whichever active
            employee's role contains that document's assigned keyword.
          </p>
          <EmployeesTable
            employees={master.employees}
            onAdd={() => {
              masterRepository.update({
                employees: [...master.employees, { id: generateId("emp"), name: "New Employee", role: "TO BE CONFIRMED", active: true }],
              });
              bump();
            }}
            onRemove={(i) => {
              masterRepository.update({ employees: master.employees.filter((_, idx) => idx !== i) });
              bump();
            }}
            onUpdate={(i, patch) => {
              masterRepository.update({ employees: master.employees.map((e, idx) => (idx === i ? { ...e, ...patch } : e)) });
              bump();
            }}
          />
        </>
      )}

      {tab === "departments" && <DepartmentsAccess />}

      {tab === "chemicals" && (
        <SimpleTable
          columns={["Name", "Active Ingredient", "Formulation"]}
          rows={master.chemicals.map((c) => [c.name, c.activeIngredient ?? "", c.formulation ?? ""])}
          editableCols={[0, 1, 2]}
          onEdit={(i, col, value) => {
            const field = (["name", "activeIngredient", "formulation"] as const)[col];
            masterRepository.update({ chemicals: master.chemicals.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)) });
            bump();
          }}
          onAdd={() => {
            masterRepository.update({ chemicals: [...master.chemicals, { id: generateId("chem"), name: "New Chemical" }] });
            bump();
          }}
          onRemove={(i) => {
            masterRepository.update({ chemicals: master.chemicals.filter((_, idx) => idx !== i) });
            bump();
          }}
        />
      )}

      {tab === "pcLocations" && (
        <SimpleTable
          columns={["PC ID", "Location", "Floor"]}
          rows={master.pcLocations.map((p) => [p.id, p.location, p.floor])}
          // The PC ID is what every fly catcher record refers to, so it stays
          // fixed; its location and floor can be corrected.
          editableCols={[1, 2]}
          onEdit={(i, col, value) => {
            const field = (["id", "location", "floor"] as const)[col];
            masterRepository.update({ pcLocations: master.pcLocations.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)) });
            bump();
          }}
          onAdd={() => {
            // Next free number — counting rows would reuse an ID after a delete.
            const nextNum = Math.max(0, ...master.pcLocations.map((p) => Number(p.id.replace(/\D/g, "")) || 0)) + 1;
            masterRepository.update({
              pcLocations: [...master.pcLocations, { id: `PC-${String(nextNum).padStart(2, "0")}`, location: "TO BE CONFIRMED", floor: "TO BE CONFIRMED" }],
            });
            bump();
          }}
          onRemove={(i) => {
            masterRepository.update({ pcLocations: master.pcLocations.filter((_, idx) => idx !== i) });
            bump();
          }}
        />
      )}

      {tab === "rodentStations" && (
        <>
          {master.rodentStations.length === 0 && (
            <div className="card mb-3">
              <div className="card-pad text-sm tbc">
                No Rodent Bait Station master list was present in the uploaded source files (the Dec-2023 GAP report
                flags that station numbering was missing at the time of inspection). Add stations below once the
                company's RBS layout/numbering is confirmed.
              </div>
            </div>
          )}
          <SimpleTable
            columns={["Station ID", "Location", "Type", "Status"]}
            rows={master.rodentStations.map((r) => [r.id, r.location, r.type, r.status])}
            editableCols={[1, 2, 3]}
            onEdit={(i, col, value) => {
              const field = (["id", "location", "type", "status"] as const)[col];
              masterRepository.update({ rodentStations: master.rodentStations.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)) });
              bump();
            }}
            onAdd={() => {
              masterRepository.update({
                rodentStations: [
                  ...master.rodentStations,
                  { id: generateId("RBS"), location: "TO BE CONFIRMED", type: "TO BE CONFIRMED", status: "TO BE CONFIRMED" },
                ],
              });
              bump();
            }}
            onRemove={(i) => {
              masterRepository.update({ rodentStations: master.rodentStations.filter((_, idx) => idx !== i) });
              bump();
            }}
          />
        </>
      )}

      {tab === "areas" && (
        <div className="doc-table">
          <table>
            <thead>
              <tr>
                <th>Area Name</th>
                <th>Belongs To</th>
              </tr>
            </thead>
            <tbody className="notranslate" translate="no">
              {master.areas.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td className="text-sm text-muted">{a.context}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "checkpoints" && (
        <div className="doc-table">
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>No.</th>
                <th>Checkpoint Text (Daily Pest Control Monitoring Record)</th>
                <th>Response Type</th>
              </tr>
            </thead>
            <tbody className="notranslate" translate="no">
              {master.checkpoints.map((c) => (
                <tr key={c.no}>
                  <td>{c.no}</td>
                  <td className="text-sm">{c.text}</td>
                  <td>
                    <span className="badge badge-Due">{c.responseType}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "documents" && (
        <>
          <p className="text-muted text-sm mb-3">
            "Assigned Role Keyword" is matched case-insensitively against each employee's Role (Employees tab) to
            decide who gets reminders for that document — e.g. "Checker" matches "Checker / Verifier — ...".
          </p>
          <div className="doc-table">
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Format No.</th>
                  <th>Revision</th>
                  <th>Frequency / Schedule</th>
                  <th style={{ width: 180 }}>Assigned Role Keyword</th>
                  <th>Currently Assigned</th>
                </tr>
              </thead>
              <tbody className="notranslate" translate="no">
                {documentRepository.getAll().map((d) => {
                  const keyword = master.documentRoleKeywords?.[d.id] ?? "";
                  const matched = resolveResponsibleEmployees(d, master);
                  return (
                    <tr key={d.id}>
                      <td className="font-semibold">{d.name}</td>
                      <td className={d.formatNo === "TO BE CONFIRMED" ? "tbc" : ""}>{d.formatNo}</td>
                      <td className={d.revisionNo === "TO BE CONFIRMED" ? "tbc" : ""}>{d.revisionNo}</td>
                      <td className="text-sm">{scheduleLabel(d)}</td>
                      <td>
                        {d.isReferenceOnly ? (
                          <span className="text-muted text-sm">—</span>
                        ) : (
                          <input
                            className="input input-sm"
                            placeholder="e.g. Checker"
                            value={keyword}
                            onChange={(e) => {
                              masterRepository.update({
                                documentRoleKeywords: { ...(master.documentRoleKeywords ?? {}), [d.id]: e.target.value },
                              });
                              bump();
                            }}
                          />
                        )}
                      </td>
                      <td className="text-sm">
                        {d.isReferenceOnly ? (
                          <span className="text-muted">—</span>
                        ) : matched.length > 0 ? (
                          matched.map((e) => e.name).join(", ")
                        ) : (
                          <span className="text-muted">Unassigned</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "settings" && (
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="card-pad">
            <h3 className="text-base font-semibold mb-1">Working hours</h3>
            <p className="text-muted text-sm mb-3">
              The assistant's briefing pops up by itself once in the <strong>first hour</strong> of the working day ("here's
              what I've prepared") and once in the <strong>last hour</strong> — only if something is still unsubmitted
              ("before you go"). Any other time it's a click away in the top bar.
            </p>
            {(() => {
              const s = settingsRepository.get();
              return (
                <div className="flex gap-4 wrap">
                  <div className="field" style={{ minWidth: 160 }}>
                    <label>Day starts</label>
                    <input
                      type="time"
                      className="input"
                      value={s.workdayStart}
                      onChange={(e) => {
                        if (e.target.value) settingsRepository.update({ workdayStart: e.target.value });
                        bump();
                      }}
                    />
                  </div>
                  <div className="field" style={{ minWidth: 160 }}>
                    <label>Day ends</label>
                    <input
                      type="time"
                      className="input"
                      value={s.workdayEnd}
                      onChange={(e) => {
                        if (e.target.value) settingsRepository.update({ workdayEnd: e.target.value });
                        bump();
                      }}
                    />
                  </div>
                </div>
              );
            })()}
            <p className="text-xs text-faint mt-3">
              Morning briefing: {settingsRepository.get().workdayStart} for one hour · End-of-day briefing: the hour before{" "}
              {settingsRepository.get().workdayEnd}. Records dated before {settingsRepository.get().liveStartDate ?? "—"} (when the system first ran for the
              company) are treated as pre-launch and never generated or reminded about.
            </p>
          </div>
        </div>
      )}

      {tab === "holidays" && (
        <>
          <p className="text-muted text-sm mb-3">
            The company's working calendar (Gujarat Print Pack Leave Calendar 2026). On a closed day — the weekly off or a
            festival holiday — the Daily Pest Control Monitoring Record is pre-marked as a holiday, no other daily register is
            expected, no reminder fires, and a fortnightly / monthly / quarterly / yearly record that lands on it is due the next
            working day instead. An adjustment day is the opposite: a weekly-off day on which everyone reports to the company.
          </p>

          <div className="card mb-4">
            <div className="card-pad flex items-center gap-3 wrap">
              <label className="text-sm font-semibold" htmlFor="weekly-off-day">
                Weekly off day
              </label>
              <select
                id="weekly-off-day"
                aria-label="Weekly off day"
                className="input input-sm"
                style={{ width: 160 }}
                value={weeklyOffDay(master)}
                onChange={(e) => {
                  masterRepository.update({ weeklyOffDay: Number(e.target.value) });
                  bump();
                }}
              >
                {WEEKDAY_LONG.map((name, i) => (
                  <option key={name} value={i}>
                    {name}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted">Every {WEEKDAY_LONG[weeklyOffDay(master)]} is a holiday unless it is listed as an adjustment day below.</span>
            </div>
          </div>

          <h3 className="text-sm uppercase text-muted mb-2">Festival holidays</h3>
          <HolidaysTable
            holidays={master.holidays ?? []}
            onAdd={() => {
              masterRepository.update({
                holidays: [...(master.holidays ?? []), { id: generateId("hol"), date: todayISO(), name: "New Holiday" }],
              });
              bump();
            }}
            onRemove={(i) => {
              const removedId = (master.holidays ?? [])[i]?.id;
              masterRepository.update({
                holidays: (master.holidays ?? []).filter((_, idx) => idx !== i),
                // Remembered so the seed merge doesn't bring it back next boot.
                removedSeedIds: removedId ? [...(master.removedSeedIds ?? []), removedId] : master.removedSeedIds,
              });
              bump();
            }}
            onUpdate={(i, patch) => {
              masterRepository.update({
                holidays: (master.holidays ?? []).map((h, idx) => (idx === i ? { ...h, ...patch } : h)),
              });
              bump();
            }}
          />

          <h3 className="text-sm uppercase text-muted mb-2 mt-5">Adjustment (working) days</h3>
          <p className="text-muted text-xs mb-2">
            "Everyone must report to the company on adjustment Day is written next to this holiday" — the {WEEKDAY_LONG[weeklyOffDay(master)]}s the plant works, as printed on
            the notice. 20-11-2026 is printed as a Thursday but is a Friday — TO BE CONFIRMED with HR.
          </p>
          <AdjustmentDaysTable
            days={master.adjustmentDays ?? []}
            onAdd={() => {
              masterRepository.update({
                adjustmentDays: [...(master.adjustmentDays ?? []), { id: generateId("adj"), date: todayISO(), forHoliday: "", note: "" }],
              });
              bump();
            }}
            onRemove={(i) => {
              const removedId = (master.adjustmentDays ?? [])[i]?.id;
              masterRepository.update({
                adjustmentDays: (master.adjustmentDays ?? []).filter((_, idx) => idx !== i),
                removedSeedIds: removedId ? [...(master.removedSeedIds ?? []), removedId] : master.removedSeedIds,
              });
              bump();
            }}
            onUpdate={(i, patch) => {
              masterRepository.update({
                adjustmentDays: (master.adjustmentDays ?? []).map((a, idx) => (idx === i ? { ...a, ...patch } : a)),
              });
              bump();
            }}
          />
        </>
      )}
    </div>
  );
}

function AdjustmentDaysTable({
  days,
  onAdd,
  onRemove,
  onUpdate,
}: {
  days: AdjustmentDay[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, patch: Partial<AdjustmentDay>) => void;
}) {
  return (
    <div>
      <div className="doc-table">
        <table className="adjustment-days">
          <thead>
            <tr>
              <th style={{ width: 160 }}>Date</th>
              <th style={{ width: 110 }}>Day</th>
              <th>For holiday</th>
              <th>Note</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody className="notranslate" translate="no">
            {days
              .slice()
              .sort((a, b) => (a.date < b.date ? -1 : 1))
              .map((a) => {
                const index = days.indexOf(a);
                const dow = a.date ? WEEKDAY_LONG[new Date(`${a.date}T00:00:00`).getDay()] : "";
                return (
                  <tr key={a.id}>
                    <td>
                      <input type="date" className="input input-sm" value={a.date} onChange={(e) => onUpdate(index, { date: e.target.value })} />
                    </td>
                    <td className="text-sm">{dow}</td>
                    <td>
                      <input className="input input-sm" placeholder="e.g. Republic Day (26-01-2026)" value={a.forHoliday ?? ""} onChange={(e) => onUpdate(index, { forHoliday: e.target.value })} />
                    </td>
                    <td>
                      <input className="input input-sm" value={a.note ?? ""} onChange={(e) => onUpdate(index, { note: e.target.value })} />
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => onRemove(index)}>
                        <FiTrash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            {days.length === 0 && (
              <tr>
                <td colSpan={5} className="text-muted text-center" style={{ padding: 16 }}>
                  No adjustment days — every weekly-off day is a holiday.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button className="btn btn-secondary btn-sm mt-2" onClick={onAdd}>
        <FiPlus size={13} /> Add Adjustment Day
      </button>
    </div>
  );
}

function HolidaysTable({
  holidays,
  onAdd,
  onRemove,
  onUpdate,
}: {
  holidays: CompanyHoliday[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, patch: Partial<CompanyHoliday>) => void;
}) {
  return (
    <div>
      <div className="doc-table">
        <table>
          <thead>
            <tr>
              <th style={{ width: 160 }}>Date</th>
              <th>Name</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody className="notranslate" translate="no">
            {holidays
              .slice()
              .sort((a, b) => (a.date < b.date ? -1 : 1))
              .map((h) => {
                const index = holidays.indexOf(h);
                return (
                  <tr key={h.id}>
                    <td>
                      <input type="date" className="input input-sm" value={h.date} onChange={(e) => onUpdate(index, { date: e.target.value })} />
                    </td>
                    <td>
                      <input className="input input-sm" value={h.name} onChange={(e) => onUpdate(index, { name: e.target.value })} />
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => onRemove(index)}>
                        <FiTrash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            {holidays.length === 0 && (
              <tr>
                <td colSpan={3} className="text-muted text-center" style={{ padding: 16 }}>
                  No holidays added yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button className="btn btn-secondary btn-sm mt-2" onClick={onAdd}>
        <FiPlus size={13} /> Add Holiday
      </button>
    </div>
  );
}

function EmployeesTable({
  employees,
  onAdd,
  onRemove,
  onUpdate,
}: {
  employees: Employee[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, patch: Partial<Employee>) => void;
}) {
  const [confirming, setConfirming] = useState<number | null>(null);
  return (
    <div>
      <div className="doc-table">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Department</th>
              <th>Email</th>
              <th style={{ width: 70 }}>Active</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody className="notranslate" translate="no">
            {employees.map((e, i) => (
              <tr key={e.id}>
                <td>
                  <input className="input input-sm" value={e.name} onChange={(ev) => onUpdate(i, { name: ev.target.value })} />
                </td>
                <td>
                  <input className="input input-sm" value={e.role} onChange={(ev) => onUpdate(i, { role: ev.target.value })} />
                </td>
                <td>
                  <input
                    className="input input-sm"
                    value={e.department ?? ""}
                    onChange={(ev) => onUpdate(i, { department: ev.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="email"
                    className="input input-sm"
                    placeholder="name@company.com"
                    value={e.email ?? ""}
                    onChange={(ev) => onUpdate(i, { email: ev.target.value })}
                  />
                </td>
                <td style={{ textAlign: "center" }}>
                  <input type="checkbox" checked={e.active} onChange={(ev) => onUpdate(i, { active: ev.target.checked })} />
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <DeleteButton confirming={confirming === i} onAsk={() => setConfirming(i)} onCancel={() => setConfirming(null)} onConfirm={() => { setConfirming(null); onRemove(i); }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn btn-secondary btn-sm mt-2" onClick={onAdd}>
        <FiPlus size={13} /> Add Row
      </button>
    </div>
  );
}

// Two taps to delete a master-data row — a row other records refer to
// shouldn't vanish on one slip of the mouse.
function DeleteButton({ confirming, onAsk, onCancel, onConfirm }: { confirming: boolean; onAsk: () => void; onCancel: () => void; onConfirm: () => void }) {
  if (!confirming) {
    return (
      <button className="btn btn-ghost btn-sm btn-icon" onClick={onAsk} title="Delete this row">
        <FiTrash2 size={13} />
      </button>
    );
  }
  return (
    <span className="flex gap-1">
      <button className="btn btn-danger btn-sm" data-action="confirm-delete" onClick={onConfirm}>
        Delete
      </button>
      <button className="btn btn-ghost btn-sm" onClick={onCancel}>
        Keep
      </button>
    </span>
  );
}

function SimpleTable({
  columns,
  rows,
  editableCols = [],
  onEdit,
  onAdd,
  onRemove,
}: {
  columns: string[];
  rows: string[][];
  /** Column indexes whose cells can be typed into. */
  editableCols?: number[];
  onEdit?: (row: number, col: number, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  const [confirming, setConfirming] = useState<number | null>(null);
  return (
    <div>
      <div className="doc-table">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody className="notranslate" translate="no">
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((cell, ci) =>
                  onEdit && editableCols.includes(ci) ? (
                    <td key={ci}>
                      <input
                        className={`input input-sm ${cell === "TO BE CONFIRMED" ? "tbc" : ""}`}
                        value={cell}
                        onFocus={(e) => {
                          // A placeholder is meant to be replaced — select it so typing replaces it.
                          if (cell === "TO BE CONFIRMED" || cell === "New Chemical") e.target.select();
                        }}
                        onChange={(e) => onEdit(i, ci, e.target.value)}
                      />
                    </td>
                  ) : (
                    <td key={ci} className={cell === "TO BE CONFIRMED" ? "tbc" : ""}>
                      {cell || <span className="text-faint">—</span>}
                    </td>
                  )
                )}
                <td style={{ whiteSpace: "nowrap" }}>
                  <DeleteButton confirming={confirming === i} onAsk={() => setConfirming(i)} onCancel={() => setConfirming(null)} onConfirm={() => { setConfirming(null); onRemove(i); }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn btn-secondary btn-sm mt-2" onClick={onAdd}>
        <FiPlus size={13} /> Add Row
      </button>
    </div>
  );
}
