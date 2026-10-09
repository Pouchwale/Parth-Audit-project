import React, { useEffect, useRef, useState } from "react";
import { FiMonitor, FiMoon, FiPlus, FiSun, FiTrash2 } from "react-icons/fi";
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
import { documentTextIn } from "../i18n/documentText";
import { useAuth } from "../store/AuthContext";
import { CUE_NAMES, type CueName } from "../engine/engageBus";
import { playCue } from "../utils/sounds";
import { onVoiceChange, serverVoiceState, updateVoiceSettings, voiceInUse, VOICE_SETTINGS_EVENT, type VoiceInUse } from "../utils/voice";
import { VoiceLanguages } from "../components/master/VoiceLanguages";
import { logActivity } from "../utils/activityLog";
import { setThemeChoice, THEME_CHOICES, useTheme, type ThemeChoice } from "../store/theme";
import {
  addDaysISO,
  clockText,
  clockWords,
  dayWords,
  DEFAULT_PLANT_TIME_ZONE,
  hoursProblem,
  parseClock,
  plantDay,
  plantNow,
  staffHoursSentence,
  superAdminHoursLine,
  todaySentence,
  weekdayName,
  weeklyOffOf,
  workingHoursOf,
  type PlantDay,
} from "../engine/workingHoursCore";

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
  const { bump, version, lang } = useAppStore();
  const [tab, setTab] = useState<Tab>("employees");
  const master = masterRepository.get();

  return (
    <div>
      <h1 className="text-2xl mb-1">{t("master.title")}</h1>
      <p className="text-muted mb-4">
        Administrator-managed reference data. Everything here was seeded from the uploaded source documents — see
        docs/REQUIREMENTS.md for provenance. Add rows as the company confirms additional locations, chemicals or staff.
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
                      <td className="font-semibold">{documentTextIn(d.name, lang)}</td>
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

      {tab === "settings" && <PlantHoursCard onOpenHolidays={() => setTab("holidays")} />}
      {tab === "settings" && (
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="card-pad">
            <h3 className="text-base font-semibold mb-1">Your briefing hours</h3>
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
      {tab === "settings" && <ThemeSettingsCard />}
      {tab === "settings" && <VoiceSettingsCard />}

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

// THE PLANT'S WORKING HOURS (REQUIREMENTS §84) — "The time runs from 8:40 am to
// 6:20 pm." Every account but the super admin may use DCRS only on a working day
// of the calendar, between these two times; outside them it cannot sign in, and
// each session is signed out at the close, with a warning ten minutes before.
// They are the STAFF's hours (the owner, 6-Oct-2026): the super admin may sign in
// and work at any time, so nothing here says DCRS is open or closed — the card
// says staff working hours, working days and days off, and tells the super admin
// that he can keep working.
// The super admin changes the two times here (the server keeps them as stored
// when anybody else writes the master data); everybody else reads them. Beside
// them, the calendar exactly as the rule reads it (engine/workingHoursCore.ts,
// the same file the server runs): the weekly off, the festival holidays, the
// adjustment days, and the next two weeks day by day.
const PLANT_DAYS_SHOWN = 14;

function PlantHoursCard({ onOpenHolidays }: { onOpenHolidays: () => void }) {
  const { user, hours: server } = useAuth();
  const { bump, uiLang } = useAppStore();
  const master = masterRepository.get();
  const current = workingHoursOf(master);
  const admin = user?.role === "admin";
  const [start, setStart] = useState(current.start);
  const [end, setEnd] = useState(current.end);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  // The stored hours changed from elsewhere (another browser, through the sync): the boxes follow.
  useEffect(() => {
    setStart(current.start);
    setEnd(current.end);
  }, [current.start, current.end]);

  const zone = server?.timeZone ?? DEFAULT_PLANT_TIME_ZONE;
  const now = plantNow(master, new Date(), zone);
  const today = now.today.date;
  const days: PlantDay[] = [];
  for (let i = 0; i < PLANT_DAYS_SHOWN; i++) days.push(plantDay(addDaysISO(today, i), master));
  const year = today.slice(0, 4);
  const nextFestival = (master.holidays ?? []).filter((h) => h.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  const nextAdjustment = (master.adjustmentDays ?? []).filter((a) => a.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  const off = weekdayName(weeklyOffOf(master));
  const changed = start !== current.start || end !== current.end;

  const save = () => {
    const problem = hoursProblem(start, end);
    if (problem) {
      setSaid({ ok: false, text: problem });
      return;
    }
    const next = { start: clockText(parseClock(start) as number), end: clockText(parseClock(end) as number) };
    const before = `${clockWords(current.startMinute)} to ${clockWords(current.endMinute)}`;
    const after = `${clockWords(parseClock(next.start) as number)} to ${clockWords(parseClock(next.end) as number)}`;
    masterRepository.update({ workingHours: next });
    bump();
    logActivity("Working hours changed", "Master Data — the plant's working hours", `${before} → ${after}`);
    setSaid({ ok: true, text: `Saved: staff working hours are now ${after} on working days. Staff signing in from now on are held to these hours.` });
  };

  return (
    <div className="card mb-4" style={{ maxWidth: 720 }} data-section="plant-hours">
      <div className="card-pad">
        <h3 className="text-base font-semibold mb-1">The plant's working hours</h3>
        <p className="text-muted text-sm mb-3">
          These are the staff's working hours. Every account but the super admin can use DCRS only on a working day of the
          calendar, between these two times of the factory's clock ({zone}). Outside them nobody else can sign in; each person
          is signed out at the close, with a warning ten minutes before, and signs in again the next working morning. The super
          admin is never held to them: he can sign in and work at any time.
        </p>
        {server && server.enforced === false && (
          <p className="text-xs mb-3" data-field="plant-hours-off" style={{ color: "var(--color-warning)", fontWeight: 600 }}>
            This server was started with DCRS_WORKING_HOURS=off, so nobody is held to the hours on it.
          </p>
        )}
        {uiLang === "gu" ? (
          <p className="text-sm mb-3" data-field="plant-hours-now">
            {staffHoursSentence(current, "gu")} {todaySentence(now, "gu")}
          </p>
        ) : (
          <p className="text-sm mb-3" data-field="plant-hours-now">
            Staff working hours:{" "}
            <strong>
              {clockWords(current.startMinute)} to {clockWords(current.endMinute)}
            </strong>{" "}
            on working days{current.isDefault ? " (the plant's standard hours)" : ""}. Today, {dayWords(today)}: {todaySentence(now)}
          </p>
        )}
        {admin && (
          <p className="text-sm mb-3" data-field="plant-hours-for-you" style={{ fontWeight: 600 }}>
            {superAdminHoursLine(uiLang)}
          </p>
        )}
        {admin ? (
          <div className="flex gap-4 wrap items-end mb-2">
            <div className="field" style={{ minWidth: 150 }}>
              <label htmlFor="plant-hours-start">Opens at</label>
              <input id="plant-hours-start" data-field="plant-hours-start" type="time" className="input" value={start} onChange={(e) => { setStart(e.target.value); setSaid(null); }} />
            </div>
            <div className="field" style={{ minWidth: 150 }}>
              <label htmlFor="plant-hours-end">Closes at</label>
              <input id="plant-hours-end" data-field="plant-hours-end" type="time" className="input" value={end} onChange={(e) => { setEnd(e.target.value); setSaid(null); }} />
            </div>
            <button type="button" className="btn btn-primary btn-sm" data-action="save-plant-hours" disabled={!changed} onClick={save}>
              Save the hours
            </button>
          </div>
        ) : (
          <p className="text-xs text-muted mb-2" data-field="plant-hours-admin-only">
            Only the super admin changes these.
          </p>
        )}
        {said && (
          <p className="text-sm mb-2" data-field="plant-hours-said" data-ok={said.ok ? "true" : "false"} style={{ color: said.ok ? "var(--color-success)" : "var(--color-danger)", fontWeight: 600 }}>
            {said.text}
          </p>
        )}

        <h4 className="text-sm font-semibold mt-3 mb-1">The calendar, as the rule reads it</h4>
        <ul className="text-sm mb-2" data-field="plant-calendar-rule" style={{ paddingLeft: 18, listStyle: "disc" }}>
          <li>
            Weekly off: <strong>{off}</strong> — a day off for staff, unless it is an adjustment day.
          </li>
          <li>
            Festival holidays: {(master.holidays ?? []).length} on the calendar — a day off for staff whatever the weekday
            {nextFestival ? `; next: ${nextFestival.name}, ${dayWords(nextFestival.date, year)}` : ""}.
          </li>
          <li>
            Adjustment days: {(master.adjustmentDays ?? []).length} — a weekly off the plant works, so staff hours apply
            {nextAdjustment ? `; next: ${dayWords(nextAdjustment.date, year)}${nextAdjustment.forHoliday ? `, for ${nextAdjustment.forHoliday}` : ""}` : ""}.
          </li>
        </ul>
        <div className="flex gap-1 wrap mb-2" data-field="plant-next-days">
          {days.map((d) => (
            <span
              key={d.date}
              data-date={d.date}
              data-open={d.open ? "true" : "false"}
              className="text-xs"
              title={d.name ?? undefined}
              style={{
                padding: "3px 8px",
                borderRadius: 999,
                background: d.open ? (d.kind === "adjustment" ? "var(--color-info-bg)" : "var(--color-success-bg)") : "var(--color-neutral-bg)",
                color: d.open ? "var(--color-text)" : "var(--color-text-muted)",
                whiteSpace: "nowrap",
              }}
            >
              {d.weekday.slice(0, 3)} {Number(d.date.slice(8))} · {d.kind === "working" ? "working day" : d.kind === "adjustment" ? "adjustment day, worked" : d.kind === "weekly-off" ? "weekly off" : d.name}
            </span>
          ))}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" data-action="open-holidays" onClick={onOpenHolidays}>
          Change the calendar in Holidays
        </button>
      </div>
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

// THE THEME (REQUIREMENTS §90): light, dark, or the same as the computer. The
// person's own setting, like the language: kept with their settings in the database,
// so it follows them to any computer in the plant (store/theme.tsx). The same three
// as the switch in the top bar, here as a row of radio buttons: a click, Enter or
// Space chooses; the arrow keys move along the row, choosing as they go; Tab reaches
// the one chosen. Under the row, what this computer is set to now (what "Same as my
// computer" shows), and that a printout is always the paper form.
const THEME_ICONS: Record<ThemeChoice, typeof FiSun> = { light: FiSun, dark: FiMoon, system: FiMonitor };

function ThemeSettingsCard() {
  const t = useT();
  const { choice, computer } = useTheme();
  const radios = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (e: React.KeyboardEvent<HTMLButtonElement>, at: number) => {
    const last = THEME_CHOICES.length - 1;
    const moves: Record<string, number> = {
      ArrowRight: at === last ? 0 : at + 1,
      ArrowDown: at === last ? 0 : at + 1,
      ArrowLeft: at === 0 ? last : at - 1,
      ArrowUp: at === 0 ? last : at - 1,
      Home: 0,
      End: last,
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    const to = moves[e.key];
    setThemeChoice(THEME_CHOICES[to]);
    radios.current[to]?.focus();
  };

  return (
    <div className="card mt-4" data-section="theme-settings" style={{ maxWidth: 560 }}>
      <div className="card-pad">
        <h3 className="text-base font-semibold mb-1">{t("theme.label")}</h3>
        <p className="text-muted text-sm mb-3">{t("theme.lead")}</p>
        <div className="pill-tabs theme-choice" role="radiogroup" aria-label={t("theme.label")}>
          {THEME_CHOICES.map((c, i) => {
            const Icon = THEME_ICONS[c];
            const on = choice === c;
            return (
              <button
                key={c}
                ref={(el) => {
                  radios.current[i] = el;
                }}
                type="button"
                className="pill-tab"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                data-action="set-theme"
                data-theme-choice={c}
                onClick={() => setThemeChoice(c)}
                onKeyDown={(e) => onKey(e, i)}
              >
                <Icon size={14} aria-hidden="true" />
                <span>{t(`theme.${c}`)}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted mt-3" data-field="theme-computer">
          {t("theme.computerNow", { theme: t(`theme.now.${computer}`) })}
        </p>
        <p className="text-xs text-faint mt-1" data-field="theme-print-note">
          {t("theme.printNote")}
        </p>
      </div>
    </div>
  );
}

// SOUNDS AND MITRA'S VOICE (REQUIREMENTS §81) — the person's own settings, kept
// with their working hours: sounds on or off, the voice on or off, a female or a
// male voice, how often a spoken reminder may come, a button to hear Mitra and
// one to hear the sounds — and which voice is actually speaking here, by name
// (REQUIREMENTS §85: Groq's natural voice from the server, else this browser's
// best — natural, online or basic — and its Gujarati voice), with what the Groq
// organisation's admin must do when the natural server voice is not available
// yet, and where a more human voice is to be had (Microsoft Edge). "Hear Mitra"
// plays a sample in the voice in use. The switches are buttons (role="switch"),
// not checkboxes. Since REQUIREMENTS §89 the voice of each of the three languages,
// with a "Hear Mitra" for each, is components/master/VoiceLanguages.tsx.
const REMIND_EVERY = [30, 45, 60, 90] as const;

function VoiceSettingsCard() {
  const t = useT();
  const [s, setS] = useState(() => settingsRepository.get());
  const [server, setServer] = useState(serverVoiceState);
  const [using, setUsing] = useState<VoiceInUse | null>(null);
  const [played, setPlayed] = useState<CueName | null>(null);
  const nextCue = useRef(0);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      setS(settingsRepository.get());
      voiceInUse()
        .then((u) => {
          if (alive) setUsing(u);
        })
        .catch(() => undefined);
    };
    refresh();
    window.addEventListener(VOICE_SETTINGS_EVENT, refresh);
    const off = onVoiceChange(() => setServer(serverVoiceState()));
    return () => {
      alive = false;
      window.removeEventListener(VOICE_SETTINGS_EVENT, refresh);
      off();
    };
  }, []);
  // Found out (Hear Mitra asked the server): say which voice it is now.
  useEffect(() => {
    let alive = true;
    voiceInUse()
      .then((u) => {
        if (alive) setUsing(u);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [server.state]);

  const change = (patch: Parameters<typeof updateVoiceSettings>[0]) => {
    updateVoiceSettings(patch);
    setS(settingsRepository.get());
  };
  // What the server's natural voice is waiting for, when it is not speaking.
  const serverNote =
    server.state === "voice-unavailable"
      ? t("voice.serverTerms")
      : server.state === "failed" && using?.source !== "server"
        ? t("voice.serverFailed")
        : "";

  const switchButton = (field: "sounds-on" | "voice-on", on: boolean, label: string, flip: () => void) => (
    <button type="button" role="switch" aria-checked={on} data-field={field} className={`voice-switch ${on ? "is-on" : ""}`} onClick={flip}>
      <span className="voice-switch-track" aria-hidden="true">
        <span className="voice-switch-thumb" />
      </span>
      <span className="voice-switch-label">{label}</span>
      <span key={on ? "on" : "off"} className="voice-switch-state">
        {on ? t("voice.settings.on") : t("voice.settings.off")}
      </span>
    </button>
  );

  return (
    <div className="card mt-4 voice-settings" style={{ maxWidth: 560 }} data-section="voice-settings">
      <div className="card-pad">
        <h3 className="text-base font-semibold mb-1">{t("voice.settings.title")}</h3>
        <p className="text-muted text-sm mb-3">{t("voice.settings.intro")}</p>
        <div className="flex gap-4 wrap mb-3">
          {switchButton("sounds-on", s.soundsOn, t("voice.settings.sounds"), () => change({ soundsOn: !s.soundsOn }))}
          {switchButton("voice-on", s.voiceOn, t("voice.settings.voice"), () => change({ voiceOn: !s.voiceOn }))}
        </div>
        <div className="voice-row mb-3">
          <span className="text-sm font-semibold">{t("voice.settings.kind")}</span>
          <div className="voice-choice" role="group" aria-label={t("voice.settings.kind")}>
            {(["female", "male"] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={`btn btn-sm ${s.voiceKind === k ? "btn-primary" : "btn-secondary"}`}
                data-voice-kind={k}
                aria-pressed={s.voiceKind === k}
                onClick={() => change({ voiceKind: k })}
              >
                {t(`voice.kind.${k}`)}
              </button>
            ))}
          </div>
        </div>
        <VoiceLanguages using={using} />
        <div className="voice-row mb-1">
          <span className="text-sm font-semibold">{t("voice.settings.every")}</span>
          <div className="voice-choice" role="group" aria-label={t("voice.settings.every")}>
            {REMIND_EVERY.map((n) => (
              <button
                key={n}
                type="button"
                className={`btn btn-sm ${s.remindEveryMin === n ? "btn-primary" : "btn-secondary"}`}
                data-remind-every={n}
                aria-pressed={s.remindEveryMin === n}
                onClick={() => change({ remindEveryMin: n })}
              >
                {t("voice.settings.minutes", { n })}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-faint mb-3">{t("voice.settings.everyHint")}</p>
        <div className="flex gap-2 wrap items-center mb-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            data-action="test-sound"
            onClick={() => {
              const cue = CUE_NAMES[nextCue.current % CUE_NAMES.length];
              nextCue.current += 1;
              playCue(cue);
              setPlayed(cue);
            }}
          >
            <span aria-hidden="true">🔔</span> {t("voice.settings.testSound")}
          </button>
          {played && (
            <span key={played} className="text-xs text-muted" data-field="test-sound-played">
              {t("voice.settings.played", { name: t(`voice.cue.${played}`) })}
            </span>
          )}
        </div>
        {serverNote && (
          <p className="text-xs mt-1" data-field="voice-server-terms" data-state={server.state} style={{ color: "var(--color-warning)" }}>
            {serverNote}
          </p>
        )}
      </div>
    </div>
  );
}
