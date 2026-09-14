import React, { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { FiCheck, FiEdit3, FiLoader, FiPlus, FiPrinter, FiX } from "react-icons/fi";
import type { FlyCatcherData, FlyCatcherEntry, PCLocation, RecordInstance } from "../../types";
import { DocumentHeader } from "../documents/DocumentHeader";
import { documentRepository } from "../../data/repositories/documentRepository";
import { masterRepository } from "../../data/repositories/masterRepository";
import { recordRepository } from "../../data/repositories/recordRepository";
import { FLY_DOC_ID, addFlyCatcherVisit, newVisitProblem, suggestedVisitDate, visitsInMonth } from "../../engine/flyRegister";
import { isEditableStatus, saveDraft } from "../../engine/recordLifecycle";
import { useAppStore } from "../../store/AppStore";
import { useT } from "../../i18n";
import { printDocument } from "../../utils/print";
import { MONTH_NAMES, daysInMonth, formatDisplayDate, pad2, todayISO } from "../../utils/date";
import { TUBE_LIGHT_DUE, TUBE_LIGHT_INSTALLED } from "../../engine/flyPattern";

// THE FLY CATCHER REGISTER IN ITS OWN FORMAT — F/HR/18 Rev 02, exactly as the
// company prints it ("Fly catcher reports .pdf", and pages 5-6 of "Kapila mam
// department reports .pdf"): a two-page MONTHLY register.
//   Both pages — header (company / title / Format No. / Rev No. / Date /
//                Page No.), the Month & Year box, and the PC location legend.
//   Page 1 of 2 — PC-01 to PC-08.   Page 2 of 2 — PC-09 to PC-13.
//   Each unit gets one row per fortnightly visit (the 3rd and the 17th):
//   PC ID NO. | DATE OF SERVICE | FLIES CATCH COUNT APPROX. | DATE OF TUBE
//   LIGHT INSTALLATION | DUE DATE FOR TUBE LIGHT REPLACEMENT | CLEANING DONE
//   BY | VERIFIED BY.
// In the app each visit is its own record (the 13 units' counts for that
// date), so this is a view over the same records the visit page edits —
// nothing is stored twice. Cells are written the way the specimen writes
// them: dates as d/mm/yy, counts as two digits, and the tube-light dates
// once per unit with a ditto mark on the rows below when they haven't changed.
//
// The register can also be filled in where it stands, for whichever Month &
// Year is chosen: "Add visit" puts a visit on the register for the date it was
// carried out (engine/flyRegister.ts) and "Edit register" turns every draft
// visit's cells into inputs, saved a moment after the last keystroke through
// the visit's own saveDraft — so each change is in that visit's history, as if
// it had been typed on the visit's page. A visit already submitted or verified
// stays locked here; it is corrected from its own page, with a reason.

export { FLY_DOC_ID };

// Printed wording, verbatim. This form spells the company "PRINT PACK" (two
// words); the pest-control trend report spells it "PRINTPACK" — each keeps
// its own, because the digital record must read as the paper one does.
export const FHR18_COMPANY = "GUJARAT PRINT PACK PUBLICATION PRIVATE LIMITED";
export const FHR18_TITLE = "FORTNIGHTLY – FLY CATCHER INSPECTION & CLEANING RECORD";
export const FHR18_DATE = "15.12.2024";

// The location legend, in the order the form prints it: two columns, the
// first four rows pairing PC-01..04 with PC-05..08, then PC-09/10, 11/12, 13.
const FHR18_LEGEND_ROWS: [string, string | null][] = [
  ["PC-01", "PC-05"],
  ["PC-02", "PC-06"],
  ["PC-03", "PC-07"],
  ["PC-04", "PC-08"],
  ["PC-09", "PC-10"],
  ["PC-11", "PC-12"],
  ["PC-13", null],
];

// Units on page 1; the rest go on page 2 (PC-09..PC-13 on the specimen).
const PAGE_ONE_UNITS = 8;
// The paper has two lines per unit — the two fortnightly visits.
const MIN_ROWS_PER_UNIT = 2;
// What is typed into the register is saved this long after the last
// keystroke — the same as on a visit's own page.
const AUTOSAVE_MS = 700;

export function locationLabel(pc: PCLocation): string {
  // PC-10 is printed as plain "Warehouse office wall", with no floor.
  const floor = pc.floor && pc.floor !== "TO BE CONFIRMED" ? ` (${pc.floor})` : "";
  return `${pc.location}${floor}`;
}

/** 2026-08-03 -> "3/08/26", the way the specimen writes a date. */
export function paperDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${Number(d)}/${m}/${y.slice(2)}`;
}

/** 1 -> "01", as the specimen writes a count. */
function paperCount(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return String(n).padStart(2, "0");
}

const DITTO = '"';

const hasCount = (e: FlyCatcherEntry) => e.catchCountApprox !== null && e.catchCountApprox !== undefined;

interface VisitRow {
  record?: RecordInstance<FlyCatcherData>;
  entry?: FlyCatcherEntry;
}

type EntryPatch = Partial<Omit<FlyCatcherEntry, "pcId">>;

export function FlyCatcherRegisterSheet({
  year,
  month,
  isDemo,
  onOpenVisit,
  allowEdit = false,
}: {
  year: number;
  month: number;
  isDemo: boolean;
  onOpenVisit?: (record: RecordInstance<FlyCatcherData>) => void;
  /** Offer Add visit / Edit register / Print register for this Month & Year. */
  allowEdit?: boolean;
}) {
  const t = useT();
  const { currentUser, bump } = useAppStore();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<{ date: string; problem: string | null } | null>(null);
  // What has been typed into the register and not saved yet, by visit (record id).
  const pending = useRef(new Map<string, FlyCatcherData>());
  const [dirty, setDirty] = useState(false);
  const [keystrokes, setKeystrokes] = useState(0);
  const user = useRef(currentUser);
  user.current = currentUser;

  // Saves what was typed into each visit through the visit's own saveDraft,
  // so every change lands in that visit's history.
  const flush = useCallback(() => {
    if (pending.current.size === 0) return;
    for (const [id, data] of pending.current) {
      const rec = recordRepository.getById(id) as RecordInstance<FlyCatcherData> | undefined;
      // Only a draft is written to: a visit submitted meanwhile (in another
      // tab) keeps exactly what was submitted.
      if (rec && isEditableStatus(rec.status)) saveDraft(rec, data, user.current);
    }
    pending.current.clear();
    setDirty(false);
    bump();
  }, [bump]);

  useEffect(() => {
    if (!dirty) return;
    const h = window.setTimeout(flush, AUTOSAVE_MS);
    return () => window.clearTimeout(h);
  }, [dirty, keystrokes, flush]);
  // Another month, year or mode — or leaving the page: whatever was typed is saved first.
  useEffect(() => () => flush(), [year, month, isDemo, flush]);
  useEffect(() => {
    if (!dirty) return;
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [dirty, flush]);

  const doc = documentRepository.getById(FLY_DOC_ID);
  if (!doc) return null;
  const master = masterRepository.get();
  const pcLocations = master.pcLocations;
  const today = todayISO();
  const visits = visitsInMonth(year, month, isDemo);

  const monthYear = `${MONTH_NAMES[month].toUpperCase()}-${String(year).slice(2)}`;
  const monthName = `${MONTH_NAMES[month]} ${year}`;
  const rowsPerUnit = Math.max(MIN_ROWS_PER_UNIT, visits.length);
  const byId = new Map(pcLocations.map((pc) => [pc.id, pc]));

  // Any unit an admin has added beyond the printed thirteen goes on the end
  // of the legend, paired up the same way.
  const printed = new Set(FHR18_LEGEND_ROWS.flat().filter(Boolean) as string[]);
  const extra = pcLocations.filter((pc) => !printed.has(pc.id)).map((pc) => pc.id);
  const legendRows: [string | null, string | null][] = [...FHR18_LEGEND_ROWS];
  if (extra.length) {
    const last = legendRows[legendRows.length - 1];
    if (last[1] === null) legendRows[legendRows.length - 1] = [last[0], extra.shift() ?? null];
    for (let i = 0; i < extra.length; i += 2) legendRows.push([extra[i], extra[i + 1] ?? null]);
  }

  const dataOf = (r: RecordInstance<FlyCatcherData>): FlyCatcherData => pending.current.get(r.id) ?? r.data;

  const updateEntry = (r: RecordInstance<FlyCatcherData>, pcId: string, patch: EntryPatch) => {
    const base = dataOf(r);
    const entries = base.entries.some((e) => e.pcId === pcId)
      ? base.entries.map((e) => (e.pcId === pcId ? { ...e, ...patch } : e))
      // A unit missing from an older record gets its row built here. The
      // tube-light dates are the register's own fixed pair, not blanks
      // (engine/flyPattern.ts, REQUIREMENTS §44).
      : [
          ...base.entries,
          {
            pcId,
            catchCountApprox: null,
            tubeLightInstallDate: TUBE_LIGHT_INSTALLED,
            tubeLightDueDate: TUBE_LIGHT_DUE,
            cleaningDoneBy: "",
            verifiedBy: "",
            ...patch,
          },
        ];
    pending.current.set(r.id, { ...base, entries });
    setDirty(true);
    setKeystrokes((n) => n + 1);
  };

  const openVisit = (r: RecordInstance<FlyCatcherData>) => {
    flush();
    onOpenVisit?.(r);
  };

  const toggleEditing = () => {
    if (editing) flush();
    setAdding(null);
    setEditing(!editing);
  };

  const openAdd = () => setAdding({ date: suggestedVisitDate(year, month, isDemo, today), problem: null });

  const confirmAdd = () => {
    if (!adding) return;
    const problem = newVisitProblem(adding.date, year, month, isDemo, today);
    if (problem) {
      setAdding({ ...adding, problem });
      return;
    }
    flush();
    addFlyCatcherVisit(adding.date, isDemo, currentUser);
    setAdding(null);
    // Straight into the register, so the counts can be typed in.
    setEditing(true);
    bump();
  };

  const print = () => {
    flush();
    // The register prints as the paper form, not as a page of input boxes.
    if (editing) flushSync(() => setEditing(false));
    printDocument(sheetRef.current);
  };

  const unitRows = (pcId: string): VisitRow[] => {
    const rows: VisitRow[] = visits.map((record) => {
      const data = dataOf(record);
      const entry = data.entries.find((e) => e.pcId === pcId);
      // On paper a visit not yet carried out is a blank line; while editing,
      // every visit shows its line so it can be filled in.
      return editing || data.entries.some(hasCount) ? { record, entry } : { record };
    });
    while (rows.length < rowsPerUnit) rows.push({});
    return rows;
  };

  const firstDay = `${year}-${pad2(month + 1)}-01`;
  const lastDay = `${year}-${pad2(month + 1)}-${pad2(daysInMonth(year, month))}`;
  const latestAllowed = lastDay < today ? lastDay : today;

  const header = (page: string) => (
    <>
      <DocumentHeader doc={doc} companyName={FHR18_COMPANY} title={FHR18_TITLE} dateLabel={FHR18_DATE} pageLabel={page} />
      <div className="fhr18-month">
        <span className="k">Month &amp; Year</span>
        <span className="v">{monthYear}</span>
      </div>
      <table className="register-grid fhr18-legend">
        <tbody>
          {legendRows.map(([left, right], i) => (
            <tr key={i}>
              <td className="pc-id">{left ?? ""}</td>
              <td className="pc-loc">{left && byId.get(left) ? locationLabel(byId.get(left)!) : ""}</td>
              <td className="pc-id">{right ?? ""}</td>
              <td className="pc-loc">{right && byId.get(right) ? locationLabel(byId.get(right)!) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );

  const grid = (units: PCLocation[]) => (
    <div className="doc-table register-grid-wrap">
      <table className="register-grid fhr18-grid">
        <thead>
          <tr>
            <th className="pc-head">PC ID NO.</th>
            <th>DATE OF SERVICE</th>
            <th>FLIES CATCH COUNT APPROX.</th>
            <th>DATE OF TUBE LIGHT INSTALLATION</th>
            <th>DUE DATE FOR TUBE LIGHT REPLACEMENT</th>
            <th>CLEANING DONE BY</th>
            <th>VERIFIED BY</th>
          </tr>
        </thead>
        {units.map((pc) => {
          const rows = unitRows(pc.id);
          return (
            <tbody key={pc.id} className="fhr18-unit" data-pc={pc.id}>
              {rows.map((row, i) => {
                const r = row.record;
                const e = row.entry;
                const canEdit = editing && !!r && isEditableStatus(r.status);
                const locked = editing && !!r && !canEdit;
                const above = i > 0 ? rows[i - 1].entry : undefined;
                // THE TWO TUBE-LIGHT COLUMNS ARE FIXED ON THIS REGISTER (24-11-2025
                // and 23-11-2026, REQUIREMENTS §44), so they are printed on every
                // line — a unit's line shows them whether or not that fortnight's
                // visit has been carried out yet, because the tube in it was still
                // fitted on that date and is still due on the other. Only what the
                // VISIT records — the date of service, the catch count, the two
                // names — stays blank until the visit happens. The second line of a
                // unit carries the ditto mark, as the specimen writes it.
                const tube = (value: string | null | undefined, previous: string | null | undefined) =>
                  !value ? "" : !editing && i > 0 && previous === value ? DITTO : paperDate(value);
                const clickable = !editing && !!r && !!onOpenVisit;
                const status = r ? r.status.replace(/\s+/g, "-").toLowerCase() : "none";
                const isToday = r?.dueDate === today;
                const showDate = editing ? !!r : !!e;
                const label = r ? `${pc.id}, visit of ${formatDisplayDate(r.dueDate)}` : "";
                return (
                  <tr
                    key={r?.id ?? `blank-${i}`}
                    className={`register-row${clickable ? " clickable" : ""}${isToday ? " is-today" : ""}${locked ? " locked" : ""}`}
                    data-visit={r?.dueDate}
                    onClick={clickable ? () => onOpenVisit!(r!) : undefined}
                    title={
                      r
                        ? `${pc.id} — visit of ${formatDisplayDate(r.dueDate)} (${r.status})${clickable ? " · click to open" : locked ? " · locked: open the visit to correct it" : ""}`
                        : undefined
                    }
                  >
                    {i === 0 && (
                      <td rowSpan={rows.length} className="pc-cell">
                        {pc.id}
                      </td>
                    )}
                    <td className={`date-cell st-${status}`}>{showDate ? paperDate(r!.dueDate) : ""}</td>
                    {canEdit ? (
                      <>
                        <td className="edit-cell">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            className="input input-sm fhr18-input"
                            data-field="count"
                            aria-label={`${label} — flies catch count`}
                            value={e?.catchCountApprox ?? ""}
                            onChange={(ev) => {
                              const n = Number(ev.target.value);
                              updateEntry(r!, pc.id, { catchCountApprox: ev.target.value === "" || !Number.isFinite(n) ? null : Math.max(0, n) });
                            }}
                          />
                        </td>
                        <td className="edit-cell">
                          <input
                            type="date"
                            className="input input-sm fhr18-input"
                            data-field="installed"
                            aria-label={`${label} — date of tube light installation`}
                            value={e?.tubeLightInstallDate ?? TUBE_LIGHT_INSTALLED}
                            onChange={(ev) => updateEntry(r!, pc.id, { tubeLightInstallDate: ev.target.value || null })}
                          />
                        </td>
                        <td className="edit-cell">
                          <input
                            type="date"
                            className="input input-sm fhr18-input"
                            data-field="due"
                            aria-label={`${label} — due date for tube light replacement`}
                            value={e?.tubeLightDueDate ?? TUBE_LIGHT_DUE}
                            onChange={(ev) => updateEntry(r!, pc.id, { tubeLightDueDate: ev.target.value || null })}
                          />
                        </td>
                        <td className="edit-cell">
                          <input
                            className="input input-sm fhr18-input"
                            list="fhr18-people"
                            data-field="cleaning"
                            aria-label={`${label} — cleaning done by`}
                            value={e?.cleaningDoneBy ?? ""}
                            onChange={(ev) => updateEntry(r!, pc.id, { cleaningDoneBy: ev.target.value })}
                          />
                        </td>
                        <td className="edit-cell">
                          <input
                            className="input input-sm fhr18-input"
                            list="fhr18-people"
                            data-field="verified"
                            aria-label={`${label} — verified by`}
                            value={e?.verifiedBy ?? ""}
                            onChange={(ev) => updateEntry(r!, pc.id, { verifiedBy: ev.target.value })}
                          />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="count-cell">{paperCount(e?.catchCountApprox)}</td>
                        <td>{tube(e?.tubeLightInstallDate ?? TUBE_LIGHT_INSTALLED, above?.tubeLightInstallDate ?? TUBE_LIGHT_INSTALLED)}</td>
                        <td>{tube(e?.tubeLightDueDate ?? TUBE_LIGHT_DUE, above?.tubeLightDueDate ?? TUBE_LIGHT_DUE)}</td>
                        <td className="name-cell">{e?.cleaningDoneBy ?? ""}</td>
                        <td className="name-cell">{e?.verifiedBy ?? ""}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>
    </div>
  );

  const pageOne = pcLocations.slice(0, PAGE_ONE_UNITS);
  const pageTwo = pcLocations.slice(PAGE_ONE_UNITS);

  return (
    <div className="fhr18-register" data-section="fhr18-register">
      {allowEdit && (
        <div className="fhr18-toolbar no-print" data-section="fhr18-toolbar">
          <div className="text-sm">
            <strong>Month &amp; Year:</strong>{" "}
            <span className="notranslate" translate="no">
              {monthYear}
            </span>
            <span className="text-muted">
              {" "}
              · {visits.length} visit{visits.length === 1 ? "" : "s"} on this register
            </span>
          </div>
          <div className="flex items-center gap-2 wrap">
            {editing && (
              <span className={`save-state ${dirty ? "saving" : "saved"}`} data-save-state={dirty ? "saving" : "saved"} aria-live="polite">
                {dirty ? <FiLoader size={13} /> : <FiCheck size={13} />} {dirty ? t("record.saving") : t("record.saved")}
              </span>
            )}
            <button className="btn btn-secondary btn-sm" data-action="fhr18-add" onClick={openAdd}>
              <FiPlus size={12} /> {t("pest.addVisit")}
            </button>
            <button className={`btn btn-sm ${editing ? "btn-primary" : "btn-secondary"}`} data-action="fhr18-edit" aria-pressed={editing} onClick={toggleEditing}>
              {editing ? <FiCheck size={12} /> : <FiEdit3 size={12} />} {editing ? t("pest.doneEditing") : t("pest.editRegister")}
            </button>
            <button className="btn btn-secondary btn-sm" data-action="fhr18-print" onClick={print}>
              <FiPrinter size={12} /> {t("pest.printRegister")}
            </button>
          </div>
        </div>
      )}

      {allowEdit && adding && (
        <div className="card fhr18-add no-print" data-section="fhr18-add">
          <div className="card-pad flex gap-3 wrap items-end">
            <div className="field">
              <label htmlFor="fhr18-add-date">Date of service ({monthName})</label>
              <input
                id="fhr18-add-date"
                type="date"
                className="input input-sm"
                data-field="fhr18-add-date"
                min={firstDay}
                max={latestAllowed >= firstDay ? latestAllowed : undefined}
                value={adding.date}
                onChange={(e) => setAdding({ date: e.target.value, problem: null })}
              />
            </div>
            <button className="btn btn-primary btn-sm" data-action="fhr18-add-confirm" onClick={confirmAdd}>
              <FiPlus size={12} /> {t("pest.addVisit")}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setAdding(null)}>
              <FiX size={12} /> {t("common.cancel")}
            </button>
            <div className="text-xs text-muted" style={{ flexBasis: "100%" }}>
              The visit goes on the {monthName} register for the date it was carried out, with the tube-light dates and names carried forward from the visit
              before it. The counts are then typed straight into the register.
            </div>
            {adding.problem && (
              <div className="text-sm text-danger" role="alert" data-section="fhr18-add-problem" style={{ flexBasis: "100%" }}>
                {adding.problem}
              </div>
            )}
          </div>
        </div>
      )}

      {allowEdit && editing && (
        <div className="fhr18-edit-hint text-xs text-muted no-print" data-section="fhr18-edit-hint">
          {visits.length === 0 ? (
            <>
              No visit is on the {monthName} register yet — press <strong>{t("pest.addVisit")}</strong> to put one on it.
            </>
          ) : (
            <>
              Type straight into the register: each change saves itself a moment later and is kept in that visit's history. A visit already submitted or
              verified is locked (grey) — open it to correct it. Visits on this register:{" "}
              {visits.map((r, i) => (
                <React.Fragment key={r.id}>
                  {i > 0 && " · "}
                  <button type="button" className="fhr18-visit-link" data-visit-open={r.dueDate} onClick={() => openVisit(r)}>
                    {paperDate(r.dueDate)} ({r.status})
                  </button>
                </React.Fragment>
              ))}
            </>
          )}
        </div>
      )}

      <div ref={sheetRef} className="register-sheet fhr18-sheet notranslate" translate="no" data-print-doc data-editing={editing ? "true" : undefined}>
        <section className="register-page">
          {header("1 of 2")}
          {grid(pageOne)}
        </section>
        <section className="register-page">
          {header("2 of 2")}
          {grid(pageTwo)}
        </section>
      </div>

      {onOpenVisit && !editing && (
        <div className="text-xs text-faint mt-2 no-print">
          One line per unit per fortnightly visit (scheduled on the 3rd and the 17th; a visit falling on the weekly off is carried out the next working day). Click a
          line to open that visit's record. Date colour: green = Verified, blue = Submitted /
          Pending Verification, red = Rejected. A visit not yet carried out is left blank, as on paper. None of that colouring prints.
        </div>
      )}

      {allowEdit && (
        <datalist id="fhr18-people">
          {master.employees.map((e) => (
            <option key={e.id} value={e.name} />
          ))}
        </datalist>
      )}
    </div>
  );
}
