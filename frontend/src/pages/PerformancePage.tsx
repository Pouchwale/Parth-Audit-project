import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiDownload, FiPrinter, FiRefreshCw } from "react-icons/fi";
import { ApiError, usersApi, type DirectoryPerson } from "../api/client";
import { useAppStore } from "../store/AppStore";
import { useRouter } from "../store/router";
import { documentRepository } from "../data/repositories/documentRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { settingsRepository } from "../data/repositories/settingsRepository";
import { COMPANY } from "../data/seed/masterData";
import { departmentName } from "../data/seed/departments";
import { departmentScope, departmentScopeLabel, seesEveryDepartment } from "../engine/departmentScope";
import { documentOpenRoute } from "../engine/documentRoutes";
import {
  AS_REQUIRED_DAYS,
  PERIODS,
  closedDays,
  decisionText,
  grade,
  periodFor,
  scoreOf,
  scorecards,
  type Decision,
  type DocumentScore,
  type PeriodKey,
  type PersonScore,
  type ScoreLine,
} from "../engine/performance";
import { documentTextIn } from "../i18n/documentText";
import { useT, type Language } from "../i18n";
import { downloadCSV, toCSV } from "../utils/csv";
import { formatDisplayDate, todayISO } from "../utils/date";
import { printDocument } from "../utils/print";
import { useProgressiveCount } from "../utils/useProgressive";
import type { DocumentDefinition } from "../types";

// PERFORMANCE SCORECARD — /performance (REQUIREMENTS §64).
//
// "make separate dashboard which give score to Kapila, HR's and module wise who
// is responsible for their document and decision will be taken on basis of what
// assigned task is done on time or not."
//
// A dashboard of its own: a card for each person with the score, the grade and
// the decision in a plain sentence, then the same figures by department, by
// module and by document, worst first, for the period chosen. The arithmetic
// is engine/performance.ts and the rule it follows is printed at the top of the
// scorecard, because people are judged by it.
//
// Demo Mode scores the demo records and Live the live ones, like every other
// page. An account kept to departments sees its own department only: the
// repositories hand it that department's documents and records, and the server
// hands it that department's accounts (GET /api/users/directory). The accounts
// are the one thing here that comes from the server — when they cannot be read
// the people's cards say why and everything else still stands.
//
// The scorecard only reads. The records it scores are made where they always
// were — the top bar's reminders keep the Live shells coming, the Dashboard and
// the Demo Mode page make the demo year — so opening it can never change what
// anybody is judged on.

const isPeriodKey = (v: string): v is PeriodKey => PERIODS.some((p) => p.key === v);

/** A format number is shown as written, the name in the chosen language (REQUIREMENTS §58). */
function DocumentName({ doc, lang }: { doc: DocumentDefinition; lang: Language }) {
  const numbered = !doc.formatNo.toUpperCase().startsWith("TO BE");
  return (
    <>
      {numbered && (
        <>
          <span className="notranslate" translate="no">
            {doc.formatNo}
          </span>{" "}
          -{" "}
        </>
      )}
      {documentTextIn(doc.name, lang)}
    </>
  );
}

function DecisionLine({ decision }: { decision: Decision }) {
  if (!decision.named) return <>{decision.summary}.</>;
  return (
    <>
      {decision.summary}; {decision.lead}{" "}
      <span className="notranslate" translate="no">
        {decision.named}
      </span>
      .
    </>
  );
}

function GradeBadge({ line }: { line: ScoreLine }) {
  return (
    <span className="score-grade" data-grade={line.grade.key}>
      <span aria-hidden="true">{line.grade.emoji}</span> {line.grade.label}
    </span>
  );
}

/** The six figures every table shares, each cell named so a reader — or a test — never has to count columns. */
function ScoreCells({ line }: { line: ScoreLine }) {
  return (
    <>
      <td className="score-num" data-col="due">
        {line.due}
      </td>
      <td className="score-num" data-col="onTime">
        {line.onTime}
      </td>
      <td className={`score-num ${line.late ? "text-warning" : ""}`} data-col="late">
        {line.late}
      </td>
      <td className={`score-num ${line.overdue ? "text-danger font-semibold" : ""}`} data-col="overdue">
        {line.overdue}
      </td>
      <td className="score-num text-muted" data-col="pending">
        {line.pending}
      </td>
      <td className="score-num font-bold" data-col="score">
        {line.score === null ? "—" : line.score}
      </td>
      <td data-col="grade">
        <GradeBadge line={line} />
      </td>
    </>
  );
}

function ScoreHeadings({ first }: { first: string }) {
  return (
    <thead>
      <tr>
        <th>{first}</th>
        <th className="score-num">Records due</th>
        <th className="score-num">On time</th>
        <th className="score-num">Late</th>
        <th className="score-num">Never done</th>
        <th className="score-num">Not due yet</th>
        <th className="score-num">Score</th>
        <th>Grade</th>
      </tr>
    </thead>
  );
}

const NothingHere = ({ children }: { children: React.ReactNode }) => (
  <tr>
    <td colSpan={8} className="text-muted text-center" style={{ padding: 18 }}>
      {children}
    </td>
  </tr>
);

// A PART OF SOMEBODY'S WORK. An account kept to departments is handed only its
// own departments' records, so a person it shares one department with — but who
// answers for another as well — is scored on that screen from part of what they
// do. The card and the export say so: the figure is what people are judged by,
// and the whole of it is on the scorecard of somebody who sees every department.
function outsideView(p: PersonScore, scope: string[] | null): string[] {
  return scope ? p.departments.filter((code) => !scope.includes(code)) : [];
}

function PersonCard({ p, lang, scope, onOpen }: { p: PersonScore; lang: Language; scope: string[] | null; onOpen: (doc: DocumentDefinition) => void }) {
  const unseen = outsideView(p, scope);
  return (
    <div className="score-card" data-person={p.person.name} data-scored={p.answers ? "yes" : "no"} data-grade={p.answers ? p.grade.key : "not-scored"}>
      <div className="score-card-head">
        <div style={{ minWidth: 0 }}>
          <div className="score-card-name notranslate" translate="no">
            {p.person.name}
          </div>
          <div className="text-xs text-muted">{p.answers ? p.departments.map(departmentName).join(" · ") : p.person.role === "admin" ? "Administrator — every department" : "Every department"}</div>
        </div>
        {p.answers && <GradeBadge line={p} />}
      </div>

      {p.answers ? (
        <>
          <div className="score-card-figure">
            <span className="score-big notranslate" translate="no" data-field="person-score">
              {p.score === null ? "—" : p.score}
            </span>
            {p.score !== null && <span className="text-muted text-sm">out of 100</span>}
          </div>
          <div className="score-counts">
            <span data-count="onTime">
              <strong>{p.onTime}</strong> on time
            </span>
            <span data-count="late">
              <strong>{p.late}</strong> late
            </span>
            <span data-count="overdue">
              <strong>{p.overdue}</strong> never done
            </span>
            {p.pending > 0 && (
              <span data-count="pending" className="text-muted">
                <strong>{p.pending}</strong> not due yet
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="score-card-figure">
          <span className="score-unscored" data-field="person-unscored">
            No score
          </span>
        </div>
      )}

      <p className="score-decision" data-section="person-decision">
        <DecisionLine decision={p.decision} />
      </p>

      {p.shared.length > 0 && (
        <p className="text-xs text-faint mt-2">Shares {p.shared.map(departmentName).join(" and ")} with another account: a record counts for whoever handed it in.</p>
      )}

      {unseen.length > 0 && (
        <p className="text-xs text-warning mt-2" data-section="person-partial">
          Also answers for {unseen.map(departmentName).join(" and ")}, outside your departments: those records are not in this score.
        </p>
      )}

      {p.answers && p.due > 0 && (
        <div className="score-worst" data-section="person-worst">
          <div className="text-xs uppercase text-muted mb-1">Most behind</div>
          {p.worst.length === 0 ? (
            <div className="text-sm text-muted">Nothing late and nothing missed.</div>
          ) : (
            p.worst.map((w) => (
              <button key={w.doc.id} type="button" className="score-open score-worst-line" data-action="open-worst-document" data-document={w.doc.id} onClick={() => onOpen(w.doc)}>
                <span className="score-worst-name">
                  <DocumentName doc={w.doc} lang={lang} />
                </span>
                <span className="score-worst-figures">
                  {w.overdue > 0 && <span className="text-danger">{w.overdue} never done</span>}
                  {w.late > 0 && <span className="text-warning">{w.late} late</span>}
                  <strong className="notranslate" translate="no">
                    {w.score}
                  </strong>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function DocumentsTable({ rows, lang, onOpen }: { rows: DocumentScore[]; lang: Language; onOpen: (doc: DocumentDefinition) => void }) {
  // Seventy formats and more: the first lines at once, the rest a batch at a time (REQUIREMENTS §56).
  const shown = useProgressiveCount(rows.length, 40, 60);
  return (
    <div className="doc-table" style={{ border: "none" }}>
      <table className="compact" data-table="performance-documents">
        <ScoreHeadings first="Document" />
        <tbody>
          {rows.length === 0 && <NothingHere>No documents to score.</NothingHere>}
          {rows.slice(0, shown).map((row) => (
            <tr key={row.doc.id} className="card-clickable" data-document={row.doc.id} data-grade={row.grade.key} onClick={() => onOpen(row.doc)}>
              <td>
                {/* The name is the control a keyboard reaches; the whole line takes the click. */}
                <button type="button" className="score-open font-semibold text-sm" data-action="open-scored-document">
                  <DocumentName doc={row.doc} lang={lang} />
                </button>
                <div className="text-xs text-faint">
                  {row.department ? departmentName(row.department) : "No department assigned"} · {row.doc.frequency}
                </div>
              </td>
              <ScoreCells line={row} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PerformancePage() {
  const { mode, version, lang } = useAppStore();
  const { navigate } = useRouter();
  const t = useT();
  const isDemo = mode === "demo";
  const today = todayISO();
  const [periodKey, setPeriodKey] = useState<PeriodKey>("this-month");
  const scorecardRef = useRef<HTMLDivElement>(null);

  // THE ACCOUNTS, from the server. null while they are being read.
  const [people, setPeople] = useState<DirectoryPerson[] | null>(null);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const readDirectory = useCallback(() => {
    setDirectoryError(null);
    usersApi
      .directory()
      .then((res) => {
        // A server from before this page answers with something else: that is "cannot be read", not an empty plant.
        if (!Array.isArray(res?.people)) throw new ApiError("the server did not send the accounts", 0);
        setPeople(res.people);
      })
      .catch((e) => {
        setPeople(null);
        setDirectoryError(e instanceof ApiError ? e.message : "the server could not be reached");
      });
  }, []);
  useEffect(readDirectory, [readDirectory]);

  // Live records from before the system went live are the generator's leftovers,
  // not work (engine/backlogCleanup.ts) — and the rule on the page says from when.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const countedFrom = useMemo(() => (isDemo ? null : settingsRepository.get().liveStartDate), [isDemo, version]);

  // Worked out once per change — a year of records is one pass (engine/performance.ts).
  const cards = useMemo(() => {
    const period = periodFor(periodKey, today);
    return scorecards(recordRepository.query({ isDemo, fromDate: period.from, toDate: period.to }), documentRepository.getAll(), people ?? [], periodKey, today, {
      isClosedDay: closedDays(masterRepository.get()),
      countedFrom,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo, version, periodKey, today, people, countedFrom]);

  // Every document is in exactly one department, so the departments add up to the plant.
  const overall = useMemo(() => {
    const sum = { onTime: 0, late: 0, overdue: 0, pending: 0 };
    for (const d of cards.byDepartment) {
      sum.onTime += d.onTime;
      sum.late += d.late;
      sum.overdue += d.overdue;
      sum.pending += d.pending;
    }
    const score = scoreOf(sum.onTime, sum.late, sum.overdue);
    return { ...sum, due: sum.onTime + sum.late + sum.overdue, score, grade: grade(score) };
  }, [cards]);

  const open = useCallback((doc: DocumentDefinition) => navigate(documentOpenRoute(doc)), [navigate]);
  const range = `${formatDisplayDate(cards.period.from)} to ${formatDisplayDate(cards.period.to)}`;
  const periodLabel = PERIODS.find((p) => p.key === periodKey)?.label ?? "";

  const scope = departmentScope();

  const exportCSV = () => {
    const figures = (l: ScoreLine, note = "") => [l.due, l.onTime, l.late, l.overdue, l.pending, l.score === null ? "" : l.score, l.grade.label, decisionText(l.decision) + note];
    // The same warning the card carries, for a person scored here on part of their work.
    const partly = (p: PersonScore) => {
      const unseen = outsideView(p, scope);
      return unseen.length ? ` Not counted here: ${unseen.map(departmentName).join(" and ")}, outside the departments of whoever exported this.` : "";
    };
    const rows: (string | number)[][] = [
      ...cards.byPerson.map((p) => ["Person", p.person.name, p.answers ? p.departments.join(" ") : "Every department — not scored", ...(p.answers ? figures(p, partly(p)) : ["", "", "", "", "", "", "No score", decisionText(p.decision)])]),
      ...cards.byDepartment.map((d) => ["Department", d.name, d.code, ...figures(d)]),
      ...cards.byModule.map((m) => ["Module", m.module, "", ...figures(m)]),
      ...cards.byDocument.map((d) => ["Document", `${d.doc.formatNo.toUpperCase().startsWith("TO BE") ? "" : `${d.doc.formatNo} `}${d.doc.name}`, d.department, ...figures(d)]),
    ];
    downloadCSV(
      `performance-scorecard-${cards.period.from}-to-${cards.period.to}${isDemo ? "-demo" : ""}.csv`,
      toCSV(["Scored", "Name", "Department", "Records due", "On time", "Late", "Never done", "Not due yet", "Score", "Grade", "Decision"], rows)
    );
  };

  return (
    <div data-page="performance" className={isDemo ? "demo-watermark" : ""}>
      <div className="flex items-center justify-between mb-1 wrap gap-3">
        <h1 className="text-2xl">Performance Scorecard</h1>
        <div className="flex gap-2 wrap items-center no-print">
          <select
            className="input input-sm"
            style={{ width: 170 }}
            value={periodKey}
            onChange={(e) => isPeriodKey(e.target.value) && setPeriodKey(e.target.value)}
            data-field="performance-period"
            aria-label="Period"
          >
            {PERIODS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <button className="btn btn-secondary btn-sm" onClick={exportCSV} data-action="performance-export">
            <FiDownload size={13} /> Export CSV
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => printDocument(scorecardRef.current)} data-action="performance-print">
            <FiPrinter size={13} /> Print
          </button>
        </div>
      </div>
      <p className="text-muted mb-4">
        Who did their documents on time, who was late, and what was never done — for each person, department, module and document.
        {!seesEveryDepartment() && <span data-section="performance-scope"> You are seeing {departmentScopeLabel()} only.</span>}
      </p>

      {/* The scorecard is what prints (utils/print.ts) — not the period picker and the buttons above it. */}
      <div data-print-doc data-section="performance-scorecard" ref={scorecardRef}>
        <div className="doc-header print-only mb-4">
          <div className="company-name notranslate" translate="no">
            {COMPANY.name}
          </div>
          <div className="doc-title">
            PERFORMANCE SCORECARD —{" "}
            <span className="notranslate" translate="no">
              {range}
            </span>
          </div>
        </div>

        <div className="score-rule mb-4" data-section="performance-rule">
          <strong>How a score is worked out.</strong> Every record that fell due in the period counts: on time 1, late ½, never done 0. The score is what
          was earned out of the records due, as a percentage — 90 and over is excellent, 75 on track, 50 needs attention, under 50 falling behind. A
          scheduled record is on time when it is submitted on or before its due date; an as-required record gets {AS_REQUIRED_DAYS} days from the date it is
          for, and the last of them is never a day the plant was closed. A record put right later is judged by when it was first submitted. Not counted: a day the plant was closed, a holiday line, a reference
          document, and a record that is not due yet.
          {countedFrom && (
            <span data-section="performance-counted-from">
              {" "}
              Nor is a record nobody submitted that is dated before the system went live on{" "}
              <span className="notranslate" translate="no">
                {formatDisplayDate(countedFrom)}
              </span>
              .
            </span>
          )}
        </div>

        <div className="flex gap-3 wrap mb-6" data-section="performance-overall" data-period={periodKey}>
          <div className="stat-tile">
            <div className="stat-value notranslate" translate="no" data-overall="score">
              {overall.score === null ? "—" : overall.score}
            </div>
            <div className="stat-label">
              <span aria-hidden="true">{overall.grade.emoji}</span> {overall.grade.label} — {periodLabel.toLowerCase()}
            </div>
            <div className="text-xs text-faint notranslate" translate="no">
              {range}
            </div>
          </div>
          <div className="stat-tile">
            <div className="stat-value" data-overall="due">
              {overall.due}
            </div>
            <div className="stat-label">Records due</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value" style={{ color: "var(--color-success)" }} data-overall="onTime">
              {overall.onTime}
            </div>
            <div className="stat-label">On time</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value" style={{ color: "var(--color-warning)" }} data-overall="late">
              {overall.late}
            </div>
            <div className="stat-label">Late</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value" style={{ color: "var(--color-danger)" }} data-overall="overdue">
              {overall.overdue}
            </div>
            <div className="stat-label">Never done</div>
          </div>
        </div>

        <h3 className="text-sm uppercase text-muted mb-2">People</h3>
        <div className="mb-6" data-section="performance-people">
          <p className="text-xs text-muted mb-3" data-section="performance-people-rule">
            A person answers for the documents of the department their account is kept to. Where a department has more than one account, a record that
            was submitted counts for the person who submitted it; one that nobody submitted — or that somebody outside those accounts submitted — counts
            for every account of that department. An account with no departments works across the plant and is listed without a score.
          </p>
          {directoryError ? (
            <div className="card card-pad text-sm" data-section="performance-people-unavailable">
              <strong>The people's scores cannot be shown:</strong> the list of accounts could not be read ({directoryError}). A person's score needs to
              know which department each account answers for, and that is kept on the server. The departments, modules and documents below are worked
              out on this computer and are complete.
              <div className="mt-3 no-print">
                <button className="btn btn-secondary btn-sm" onClick={readDirectory} data-action="performance-retry-directory">
                  <FiRefreshCw size={13} /> Try again
                </button>
              </div>
            </div>
          ) : people === null ? (
            <div className="text-sm text-muted">Reading the accounts…</div>
          ) : (
            <div className="score-cards">
              {cards.byPerson.map((p) => (
                <PersonCard key={p.person.id} p={p} lang={lang} scope={scope} onOpen={open} />
              ))}
            </div>
          )}
        </div>

        <div className="card mb-6">
          <div className="card-header">
            <h3 className="text-lg">Departments</h3>
            <span className="text-muted text-sm">worst first</span>
          </div>
          <div className="doc-table" style={{ border: "none" }}>
            <table className="compact" data-table="performance-departments">
              <ScoreHeadings first="Department" />
              <tbody>
                {cards.byDepartment.length === 0 && <NothingHere>No departments to score.</NothingHere>}
                {cards.byDepartment.map((d) => (
                  <tr key={d.code || "none"} data-row={d.code || "none"} data-grade={d.grade.key}>
                    <td>
                      <div className="font-semibold text-sm">{d.name}</div>
                      <div className="text-xs text-faint">
                        {d.documents} document{d.documents === 1 ? "" : "s"}
                        {d.people.length > 0 && (
                          <>
                            {" · "}
                            <span className="notranslate" translate="no">
                              {d.people.join(", ")}
                            </span>
                          </>
                        )}
                      </div>
                    </td>
                    <ScoreCells line={d} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card mb-6">
          <div className="card-header">
            <h3 className="text-lg">Modules</h3>
            <span className="text-muted text-sm">worst first</span>
          </div>
          <div className="doc-table" style={{ border: "none" }}>
            <table className="compact" data-table="performance-modules">
              <ScoreHeadings first="Module" />
              <tbody>
                {cards.byModule.length === 0 && <NothingHere>No modules to score.</NothingHere>}
                {cards.byModule.map((m) => (
                  <tr key={m.module} data-row={m.module} data-grade={m.grade.key}>
                    <td>
                      <div className="font-semibold text-sm">{t(`module.${m.module}`)}</div>
                      <div className="text-xs text-faint">
                        {m.documents} document{m.documents === 1 ? "" : "s"}
                      </div>
                    </td>
                    <ScoreCells line={m} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="text-lg">Documents</h3>
            <span className="text-muted text-sm">worst first — a line opens the format's own page</span>
          </div>
          {/* Keyed by what is being scored, so a new period starts its long list afresh. */}
          <DocumentsTable key={`${periodKey}|${isDemo}`} rows={cards.byDocument} lang={lang} onOpen={open} />
        </div>
      </div>
    </div>
  );
}
