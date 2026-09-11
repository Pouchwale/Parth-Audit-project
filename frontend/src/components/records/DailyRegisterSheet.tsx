import React from "react";
import type { DailyPestMonitoringData, DailyCheckpointDef, RecordInstance } from "../../types";
import { DocumentHeader } from "../documents/DocumentHeader";
import { documentRepository } from "../../data/repositories/documentRepository";
import { masterRepository } from "../../data/repositories/masterRepository";
import { recordRepository } from "../../data/repositories/recordRepository";
import { isCheckpointFinding } from "../../engine/checkpoints";
import { totalRodents } from "../../engine/rodentPattern";
import { MONTH_NAMES, daysInMonth, formatDisplayDate, pad2, todayISO } from "../../utils/date";

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

interface Note {
  day: number;
  no: number;
  note: string;
}

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
  const text = raw == null ? "" : String(raw);
  return { text: text + (ans?.note ? "*" : ""), title: ans?.note || undefined, flagged: isCheckpointFinding(cp, raw ?? null) };
}

export function DailyRegisterSheet({
  year,
  month,
  isDemo,
  onOpenDay,
}: {
  year: number;
  month: number;
  isDemo: boolean;
  onOpenDay?: (record: RecordInstance<DailyPestMonitoringData>) => void;
}) {
  const doc = documentRepository.getById(DAILY_DOC_ID);
  const checkpoints = masterRepository.get().checkpoints;
  const dim = daysInMonth(year, month);
  const records = recordRepository.query({
    documentId: DAILY_DOC_ID,
    isDemo,
    fromDate: `${year}-${pad2(month + 1)}-01`,
    toDate: `${year}-${pad2(month + 1)}-${pad2(dim)}`,
  }) as RecordInstance<DailyPestMonitoringData>[];
  const byDay = new Map<number, RecordInstance<DailyPestMonitoringData>>();
  for (const r of records) byDay.set(Number(r.dueDate.slice(8, 10)), r);
  const today = todayISO();
  const monthLabel = `${MONTH_NAMES[month]} ${year}`;
  if (!doc) return null;

  const notes: Note[] = [];
  for (const r of records) {
    if (r.data.isHoliday) continue;
    for (const cp of checkpoints) {
      const note = r.data.checkpoints[cp.no]?.note?.trim();
      if (cp.responseType === "yesno-note" && note) notes.push({ day: Number(r.dueDate.slice(8, 10)), no: cp.no, note });
    }
  }
  notes.sort((a, b) => a.day - b.day || a.no - b.no);

  const actions = records
    .flatMap((r) => r.data.summaryActions.map((a) => ({ ...a, fallbackDate: r.dueDate })))
    .sort((a, b) => (a.dateOfObservation || a.fallbackDate).localeCompare(b.dateOfObservation || b.fallbackDate));
  const summaryRows = Math.max(3, actions.length); // the paper prints three blank lines

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
          onClick={clickable ? () => onOpenDay!(r!) : undefined}
          title={r ? `${formatDisplayDate(r.dueDate)} — ${r.data.isHoliday ? "Holiday" : r.status}${clickable ? " · click to open" : ""}` : undefined}
        >
          <td className={`date-cell st-${status}`}>{beyond ? "" : `${d}.`}</td>
          {r?.data.isHoliday ? (
            <td colSpan={checkpoints.length} className="holiday-cell">
              HOLIDAY
            </td>
          ) : (
            checkpoints.map((cp) => {
              const c = cellFor(r, cp);
              return (
                <td key={cp.no} className={c.flagged ? "flagged" : ""} title={c.title}>
                  {c.text}
                </td>
              );
            })
          )}
          <td className="time-cell">{r && !r.data.isHoliday ? r.data.timeOfChecking : ""}</td>
          <td className="checker-cell">{r && !r.data.isHoliday ? r.data.checker : ""}</td>
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
    <div className="register-sheet notranslate" translate="no" data-print-doc>
      <section className="register-page">
        <DocumentHeader doc={doc} extraTitle={monthLabel} pageLabel="1 Of 3" />
        <div className="register-instructions">
          <p>{FHR17_INSTRUCTION_1}</p>
          <p className="font-semibold">{FHR17_INSTRUCTION_2}</p>
          <ol className="register-checkpoints">
            {checkpoints.map((cp) => (
              <li key={cp.no}>{cp.text}</li>
            ))}
          </ol>
        </div>
      </section>

      <section className="register-page">
        <DocumentHeader doc={doc} extraTitle={monthLabel} pageLabel="2 Of 3" />
        {grid(1, 19)}
      </section>

      <section className="register-page">
        <DocumentHeader doc={doc} extraTitle={monthLabel} pageLabel="3 Of 3" />
        {grid(20, 31)}
        {notes.length > 0 && (
          <div className="register-notes text-xs">
            <strong>* Notes (check points 8 / 9):</strong>{" "}
            {notes.map((n) => `${n.day}. — no. ${n.no}: ${n.note}`).join("; ")}
          </div>
        )}
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
                <tr key={a ? a.id : `blank-${i}`}>
                  <td>{a ? formatDisplayDate(a.dateOfObservation || a.fallbackDate) : ""}</td>
                  <td>{a?.descriptionOfObservation ?? ""}</td>
                  <td>{a?.actionTaken ?? ""}</td>
                  <td>{a?.remarks ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {onOpenDay && (
        <div className="text-xs text-faint mt-2 no-print">
          Click a date row to open that day's record. Date cell colour: green = Verified, blue = Submitted / Pending Verification, red = Rejected; a red check
          point = a finding; "*" = a note (listed under page 3). None of that prints.
        </div>
      )}
    </div>
  );
}
