import React, { useState } from "react";
import type { DailyPestMonitoringData, DailyCheckpointDef, RecordInstance } from "../../types";
import { DocumentHeader } from "../documents/DocumentHeader";
import { FORMAT_HEADER_FIELDS, useHeaderEditing } from "../documents/HeaderEditing";
import { documentRepository } from "../../data/repositories/documentRepository";
import { masterRepository } from "../../data/repositories/masterRepository";
import { recordRepository } from "../../data/repositories/recordRepository";
import { isCheckpointFinding } from "../../engine/checkpoints";
import { printFillOf } from "../../engine/printFill";
import { totalRodents } from "../../engine/rodentPattern";
import { MONTH_NAMES, daysInMonth, formatDisplayDate, pad2, todayISO } from "../../utils/date";
import { BIND_RECORD_ATTR } from "../../engine/roundTrip/bindPath";
import { bindProps, dailyPestBind } from "../../engine/roundTrip/bindingsFor";
import { FHR17_PAPER_CELLS, HR_PAPER_COMPANY } from "../../data/seed/hrPapers357";

// THE DAILY PEST CONTROL MONITORING RECORD IN ITS OWN FORMAT — F/HR/17,
// exactly as the company prints it ("Daily pest control monitoring record
// .pdf"): a three-page monthly register.
//   Page 1 of 3 — header, the two instruction lines, the ten check points.
//   Page 2 of 3 — one row per date, 1–19: check points 1–10 | Time of
//                 checking | Checker.
//   Page 3 of 3 — dates 20–31, then SUMMARY OF ACTIONS TAKEN IF PEST
//                 OBSERVED (Date of observation | Description of Observation
//                 | Action Taken | Remarks).
// Each row is that day's record (one record per date in the app), so this is
// a view over the same data the per-day record page edits — nothing is
// stored twice. Cells follow the printed instruction: Yes / No against each
// check point except no. 7, which carries the number of pests trapped (the
// box and location are in the summary); no. 4 is the count of traps; a
// closed day is written across the row as HOLIDAY, like the paper.

export const DAILY_DOC_ID = "daily-pest-monitoring";

export const FHR17_ORIGINAL_PAGES = ["/source/fhr17-format-page-1.jpg", "/source/fhr17-format-page-2.jpg", "/source/fhr17-format-page-3.jpg"];

// Verbatim from page 1 of the format.
export const FHR17_INSTRUCTION_1 =
  "Please check the following points on a Daily basis for monitoring of Rodent / Pest infestation & report to Production supervisor / Pest control agency for further investigation & necessary actions.";
export const FHR17_INSTRUCTION_2 = "Please mention the status as Yes / No against each check point except point no. 7";

interface CellView {
  text: string;
  title?: string;
  flagged?: boolean;
}

function cellFor(r: RecordInstance<DailyPestMonitoringData> | undefined, cp: DailyCheckpointDef): CellView {
  if (!r) return { text: "" };
  const ans = r.data.checkpoints[cp.no];
  const raw = ans?.value;
  if (cp.no === 7) {
    if (raw === "Yes") {
      const catches = r.data.rodentCatches ?? [];
      const n = Math.max(totalRodents(catches), catches.length ? 0 : 1);
      return {
        text: String(n),
        title: catches.length ? catches.map((c) => `${c.count} at ${c.trapBoxNo || "?"} (${c.location})`).join("; ") : "Pest trapped — box / location not recorded",
        flagged: true,
      };
    }
    return { text: raw == null ? "" : String(raw) };
  }
  if (cp.responseType === "number") return { text: raw == null ? "" : String(raw) };
  // A note written against the point is the screen's tooltip and the day's record's own: the paper carries no mark for
  // it and no list of them (the owner, 7-Nov-2026, of the list of notes that stood under page 3: "remove this line", §198).
  const text = raw == null ? "" : String(raw);
  return { text, title: ans?.note || undefined, flagged: isCheckpointFinding(cp, raw ?? null) };
}

export function DailyRegisterSheet({
  year,
  month,
  isDemo,
  onOpenDay,
  headerEditable = false,
  onMonthChange,
  only,
}: {
  year: number;
  month: number;
  isDemo: boolean;
  onOpenDay?: (record: RecordInstance<DailyPestMonitoringData>) => void;
  /** The register's own page offers its header typed over in place (REQUIREMENTS §86); a report shows it only. */
  headerEditable?: boolean;
  /**
   * THE MONTH IN THE TITLE CHANGED IN PLACE (the owner, 6-Nov-2026: "i cannot be able to edit month so do make that
   * editable", REQUIREMENTS §197): a click on "— November 2026" opens the month and the year to choose, and the page
   * follows (its own pickers say the same). Given by the register's own page; a report shows the month only.
   */
  onMonthChange?: (year: number, month: number) => void;
  /**
   * A DAY'S RECORD PRINTED ON ITS PAPER (REQUIREMENTS §373): the three pages with this record alone on its date's line and
   * in the summary, as it stands on its page (what is typed and not yet saved too). Drawn inside the record's own printed
   * document (DailyPestMonitoringRecordView), so the sheet is no document of its own.
   */
  only?: RecordInstance<DailyPestMonitoringData>;
}) {
  const doc = documentRepository.getById(DAILY_DOC_ID);
  // The first page's header takes the clicks; the other two repeat it. Its Date cell
  // prints the format's revision date, so that is the format's to change too.
  const { edit: headerEdit, panel: headerPanel } = useHeaderEditing({
    doc: headerEditable ? doc : undefined,
    formatFields: FORMAT_HEADER_FIELDS,
  });
  const checkpoints = masterRepository.get().checkpoints;
  const dim = daysInMonth(year, month);
  const records = only
    ? [only]
    : (recordRepository.query({
        documentId: DAILY_DOC_ID,
        isDemo,
        fromDate: `${year}-${pad2(month + 1)}-01`,
        toDate: `${year}-${pad2(month + 1)}-${pad2(dim)}`,
      }) as RecordInstance<DailyPestMonitoringData>[]);
  const byDay = new Map<number, RecordInstance<DailyPestMonitoringData>>();
  for (const r of records) byDay.set(Number(r.dueDate.slice(8, 10)), r);
  const today = todayISO();
  const monthLabel = `${MONTH_NAMES[month]} ${year}`;
  // The month and the year chosen in the title's place (§197): this year and the two before, as the page's own picker offers.
  const [changingMonth, setChangingMonth] = useState(false);
  const thisYear = new Date().getFullYear();
  const years = Array.from(new Set([year - 1, year, year + 1, thisYear].filter((y) => y <= thisYear))).sort();
  const monthEdit =
    headerEditable && onMonthChange
      ? {
          editing: changingMonth,
          onEdit: () => setChangingMonth(true),
          action: "change-register-month",
          box: (
            <span className="register-month-box no-print" data-section="register-month-box" style={{ display: "inline-flex", gap: 6, alignItems: "center", verticalAlign: "middle" }}>
              <select className="input input-sm" data-field="register-month" aria-label="Month of the register" value={month} onChange={(e) => onMonthChange(year, Number(e.target.value))}>
                {MONTH_NAMES.map((n, i) => (
                  <option key={n} value={i}>
                    {n}
                  </option>
                ))}
              </select>
              <select className="input input-sm" data-field="register-year" aria-label="Year of the register" value={year} onChange={(e) => onMonthChange(Number(e.target.value), month)}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-secondary btn-sm" data-action="register-month-done" onClick={() => setChangingMonth(false)}>
                Done
              </button>
            </span>
          ),
        }
      : undefined;
  if (!doc) return null;

  const actions = records
    .flatMap((r) => r.data.summaryActions.map((a, index) => ({ ...a, fallbackDate: r.dueDate, recordId: r.id, index })))
    .sort((a, b) => (a.dateOfObservation || a.fallbackDate).localeCompare(b.dateOfObservation || b.fallbackDate));
  // The paper's three lines, on the screen; printed, only the lines written once one is (REQUIREMENTS §126).
  const summaryRows = Math.max(3, actions.length);

  const rows = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i).map((d) => {
      const beyond = d > dim;
      const r = beyond ? undefined : byDay.get(d);
      const dateISO = `${year}-${pad2(month + 1)}-${pad2(d)}`;
      const isToday = !beyond && dateISO === today;
      const clickable = !!r && !!onOpenDay;
      const status = r ? r.status.replace(/\s+/g, "-").toLowerCase() : "none";
      return (
        <tr
          key={d}
          data-day={d}
          className={`register-row${isToday ? " is-today" : ""}${clickable ? " clickable" : ""}${beyond ? " beyond-month" : ""}`}
          // Which day's record the line is, and where each value on it lives in
          // that record, so the register downloaded, edited and uploaded
          // changes the right days (REQUIREMENTS §81).
          {...(r ? { [BIND_RECORD_ATTR]: r.id } : undefined)}
          onClick={clickable ? () => onOpenDay!(r!) : undefined}
          title={r ? `${formatDisplayDate(r.dueDate)} — ${r.data.isHoliday ? "Holiday" : r.status}${clickable ? " · click to open" : ""}` : undefined}
        >
          <td className={`date-cell st-${status}`}>{beyond ? "" : `${d}.`}</td>
          {r?.data.isHoliday ? (
            <td colSpan={checkpoints.length} className="holiday-cell">
              HOLIDAY{String(r.data.holidayReason ?? "").trim() ? ` — ${String(r.data.holidayReason).trim()}` : ""}
            </td>
          ) : (
            checkpoints.map((cp) => {
              const c = cellFor(r, cp);
              // No. 7 is written as the number of rodents the catch table adds up to — worked out, not bound.
              const bound = r && cp.no !== 7 ? bindProps(dailyPestBind.checkpoint(cp)) : undefined;
              return (
                <td key={cp.no} className={c.flagged ? "flagged" : ""} title={c.title} {...bound}>
                  {c.text}
                </td>
              );
            })
          )}
          {/* What was written in the register reads as it was written, in either
              language; the register's own printed words follow the chosen one
              (REQUIREMENTS §58). */}
          <td className="time-cell notranslate" translate="no" {...(r && !r.data.isHoliday ? bindProps(dailyPestBind.timeOfChecking()) : undefined)}>
            {r && !r.data.isHoliday ? r.data.timeOfChecking : ""}
          </td>
          <td className="checker-cell notranslate" translate="no" {...(r && !r.data.isHoliday ? bindProps(dailyPestBind.checker()) : undefined)}>
            {r && !r.data.isHoliday ? r.data.checker : ""}
          </td>
        </tr>
      );
    });

  const grid = (from: number, to: number) => (
    <div className="doc-table register-grid-wrap">
      <table className="register-grid">
        <thead>
          <tr>
            <th rowSpan={2} className="date-head">
              Date
            </th>
            <th colSpan={checkpoints.length}>Check points numbers as per above guidelines</th>
            <th rowSpan={2} className="time-head">
              Time of checking
            </th>
            <th rowSpan={2} className="checker-head">
              Checker
            </th>
          </tr>
          <tr>
            {checkpoints.map((cp) => (
              <th key={cp.no}>{cp.no}</th>
            ))}
          </tr>
        </thead>
        <tbody>{rows(from, to)}</tbody>
      </table>
    </div>
  );

  return (
    // An HR register: printed, each of its three pages fills its A4 sheet (§194's fill; the owner, 7-Nov-2026, §198).
    // (a day's record printed on it is its record page's document: no document of its own here, §373)
    <div className="register-sheet fhr17-sheet" {...(only ? {} : { "data-print-doc": "", "data-print-fill": printFillOf(doc) })}>
      <section className="register-page">
        {/* "DAILY PEST CONTROL MONITORING RECORD November 2026": no dash before the month (the owner, 6-Nov-2026, §197). */}
        {/* THE PAPER'S OWN HEADER (§373): his company's name, the title, and one row "Format No.: F/HR/17 | Rev No: 00 | Date:
            01.12.2021 | Page No.: 1 Of 3" (FHR17_PAPER_CELLS; styles.css .fhr17-sheet). */}
        <DocumentHeader doc={doc} companyName={HR_PAPER_COMPANY} extraTitle={monthLabel} extraTitleSeparator=" " extraTitleEdit={monthEdit} pageLabel="1 Of 3" edit={headerEdit} labels={FHR17_PAPER_CELLS} dotDates />
        {headerPanel}
        {/* THE FIRST PAGE A FORM, NOT A QUESTION PAPER (REQUIREMENTS §243; the owner, 17-Nov-2026, of the printed page: "it
            is looking like question paper"): the instructions in a ruled box, the ten check points a ruled table across
            the page - Sr. No. and Check Point - as the register's own pages after it are ruled. */}
        <div className="register-instructions">
          {/* Both lines bold, as the paper prints them (§373). */}
          <div className="register-instruction-box">
            <p className="font-semibold">{FHR17_INSTRUCTION_1}</p>
            <p className="font-semibold">{FHR17_INSTRUCTION_2}</p>
          </div>
          <div className="doc-table register-grid-wrap">
            <table className="register-grid register-checkpoints">
              <thead>
                <tr>
                  <th className="cp-no">Sr. No.</th>
                  <th className="cp-text">Check Point</th>
                </tr>
              </thead>
              <tbody>
                {checkpoints.map((cp) => (
                  <tr key={cp.no} data-checkpoint={cp.no}>
                    <td className="cp-no">{cp.no}</td>
                    <td className="cp-text">{cp.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="register-page">
        <DocumentHeader doc={doc} companyName={HR_PAPER_COMPANY} extraTitle={monthLabel} extraTitleSeparator=" " pageLabel="2 Of 3" labels={FHR17_PAPER_CELLS} dotDates />
        {grid(1, 19)}
      </section>

      <section className="register-page">
        <DocumentHeader doc={doc} companyName={HR_PAPER_COMPANY} extraTitle={monthLabel} extraTitleSeparator=" " pageLabel="3 Of 3" labels={FHR17_PAPER_CELLS} dotDates />
        {/* THE MONTH'S OWN DAYS, NOT A LINE MORE (REQUIREMENTS §244; the owner, 17-Nov-2026, of November's page 3 with a blank
            line after the 30th: "after 30 there is new month so make sure in this record i want only one month all days not
            one extra row"): the 20th to the month's last day - the 30th, the 31st, February's 28th or 29th. */}
        {grid(20, dim)}
        <div className="register-summary-title">SUMMARY OF ACTIONS TAKEN IF PEST OBSERVED</div>
        <div className="doc-table register-grid-wrap">
          <table className="register-grid register-summary">
            <thead>
              <tr>
                <th style={{ width: 120 }}>Date of observation</th>
                <th>Description of Observation</th>
                <th>Action Taken</th>
                <th style={{ width: 160 }}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: summaryRows }, (_, i) => actions[i]).map((a, i) => (
                <tr
                  key={a ? a.id : `blank-${i}`}
                  data-empty-line={!a && actions.length > 0 ? "" : undefined}
                  {...(a ? { [BIND_RECORD_ATTR]: a.recordId } : undefined)}
                >
                  <td className="notranslate" translate="no" {...(a ? bindProps(dailyPestBind.action(a, a.index, "dateOfObservation")) : undefined)}>
                    {a ? formatDisplayDate(a.dateOfObservation || a.fallbackDate) : ""}
                  </td>
                  <td className="notranslate" translate="no" {...(a ? bindProps(dailyPestBind.action(a, a.index, "descriptionOfObservation")) : undefined)}>
                    {a?.descriptionOfObservation ?? ""}
                  </td>
                  <td className="notranslate" translate="no" {...(a ? bindProps(dailyPestBind.action(a, a.index, "actionTaken")) : undefined)}>
                    {a?.actionTaken ?? ""}
                  </td>
                  <td className="notranslate" translate="no" {...(a ? bindProps(dailyPestBind.action(a, a.index, "remarks")) : undefined)}>
                    {a?.remarks ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {onOpenDay && !only && (
        <div className="text-xs text-faint mt-2 no-print">
          Click a date row to open that day's record. Date cell colour: green = Verified, blue = Submitted / Pending Verification, red = Rejected; a red check
          point = a finding; a note written against a point shows when its cell is pointed at. None of that prints.
        </div>
      )}
    </div>
  );
}
