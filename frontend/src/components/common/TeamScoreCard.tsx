// EVERY PERSON'S MINUS SCORE ON THE ADMINISTRATOR'S DASHBOARD (REQUIREMENTS §92, 9-Oct-2026).
//
// "score system like FMS style ... any user has assign 10 tasks and he has
// completed 8 of them so his is 80 percent work is done in real but on
// superadmin and on admin dashboard he will display -20 ... this applies to all
// users of all department" (the owner, 9-Oct-2026).
//
// One line per account, worst first: the minus score as an FMS sheet writes it
// (engine/performance.ts minusScore: 8 of 10 done is −20%), with the counts it
// comes from beside it ("8 of 10 done") and a bar of the share done, so −20% is
// never read as "20% done". The whole plant's line on top, scored from its own
// counts. The figures are the Performance Scorecard's (the same records,
// people, calendar and period), so the two pages never disagree, and the card
// leads there for the details. Shown to the administrator and the super admin
// only (pages/DashboardPage.tsx); the server gives nobody else the accounts.
//
// COST (the low-end standard, REQUIREMENTS §65): the accounts are asked for
// once; the period's records are scored once, after the dashboard has drawn
// (a timeout, never while drawing), and again only when the records or the
// period change.
import React, { useEffect, useMemo, useState } from "react";
import { FiArrowRight } from "react-icons/fi";
import { ApiError, usersApi, type DirectoryPerson } from "../../api/client";
import { documentRepository } from "../../data/repositories/documentRepository";
import { masterRepository } from "../../data/repositories/masterRepository";
import { recordRepository } from "../../data/repositories/recordRepository";
import { settingsRepository } from "../../data/repositories/settingsRepository";
import { departmentName } from "../../data/seed/departments";
import { PERIODS, closedDays, formatMinus, minusScore, periodFor, scorecards, type PeriodKey, type Person, type Scorecards } from "../../engine/performance";
import { tr, type StringKey, type Vars } from "../../i18n";
import { useAppStore } from "../../store/AppStore";
import { useRouter } from "../../store/router";
import { todayISO } from "../../utils/date";

export interface TeamLine {
  id: string;
  name: string;
  /** The departments of the documents they answer for (the scorecard's), as codes. */
  departments: string[];
  /** Whether they answer for any document: without one there is no score. */
  scored: boolean;
  /** Records that fell due and are counted: on time + late + never done. */
  due: number;
  /** Handed in, on time or late. */
  done: number;
  overdue: number;
  minus: number;
}

export interface Team {
  plant: { due: number; done: number; overdue: number; minus: number };
  /** Worst first, then those with nothing due, then those who answer for no document. */
  lines: TeamLine[];
}

/** Every person's line and the plant's, from the scorecard's own figures. */
export function teamFrom(cards: Scorecards): Team {
  // Every document is in exactly one department, so the departments add up to the plant; its percentage is its own.
  let due = 0;
  let overdue = 0;
  for (const d of cards.byDepartment) {
    due += d.due;
    overdue += d.overdue;
  }
  const lines = cards.byPerson.map(
    (p): TeamLine => ({ id: p.person.id, name: p.person.name, departments: p.departments, scored: p.answers, due: p.due, done: p.due - p.overdue, overdue: p.overdue, minus: p.minus })
  );
  const group = (l: TeamLine) => (!l.scored ? 2 : l.due === 0 ? 1 : 0);
  lines.sort((a, b) => group(a) - group(b) || a.minus - b.minus || b.overdue - a.overdue || a.name.localeCompare(b.name));
  return { plant: { due, done: due - overdue, overdue, minus: minusScore(overdue, due) }, lines };
}

/** The period's scorecard for these people, worked out the way the Performance dashboard works it out. */
export function teamScores(people: readonly Person[], periodKey: PeriodKey, today: string, isDemo: boolean): Team {
  const period = periodFor(periodKey, today);
  return teamFrom(
    scorecards(recordRepository.query({ isDemo, fromDate: period.from, toDate: period.to }), documentRepository.getAll(), people, periodKey, today, {
      isClosedDay: closedDays(masterRepository.get()),
      countedFrom: isDemo ? null : settingsRepository.get().liveStartDate,
    })
  );
}

const isPeriodKey = (v: string): v is PeriodKey => PERIODS.some((p) => p.key === v);

/**
 * The card's words in the language chosen. With ગુજરાતી chosen the screens are
 * written in English for Google Translate, and Google has mistranslated the
 * minus score before ("10 runs"): so, as on the Performance dashboard, these are
 * the reviewed Gujarati of i18n/strings.score.ts on elements Google is told to
 * leave alone. In English nothing is held back.
 */
function useWords() {
  const { lang } = useAppStore();
  return useMemo(() => {
    const kept = lang !== "en";
    return {
      say: (key: StringKey, vars?: Vars) => tr(lang, key, vars),
      hold: (className = "") => (kept ? { className: `${className} notranslate`.trim(), translate: "no" as const } : { className }),
    };
  }, [lang]);
}
type Words = ReturnType<typeof useWords>;

function TeamRow({ line, words, plant = false }: { line: Omit<TeamLine, "id" | "name" | "departments" | "scored"> & Partial<TeamLine>; words: Words; plant?: boolean }) {
  const scored = plant || line.scored !== false;
  const counted = scored && line.due > 0;
  const tone = !counted ? "none" : line.minus < 0 ? "minus" : "zero";
  return (
    <li
      className={`team-minus-row${plant ? " team-minus-plant" : ""}`}
      data-person={plant ? undefined : line.name}
      data-plant={plant ? "true" : undefined}
      data-scored={scored ? "yes" : "no"}
      data-minus={counted ? line.minus : undefined}
      data-due={line.due}
      data-done={line.done}
      data-tone={tone}
    >
      <div className="team-minus-who">
        {plant ? (
          <strong {...words.hold()}>{words.say("perf.team.plant")}</strong>
        ) : (
          <strong className="notranslate" translate="no">
            {line.name}
          </strong>
        )}
        {!plant && scored && (line.departments?.length ?? 0) > 0 && <span className="team-minus-depts">{line.departments!.map(departmentName).join(" · ")}</span>}
      </div>
      <span className="team-minus-figure notranslate" translate="no" data-field="team-minus-figure">
        {counted ? formatMinus(line.minus) : "—"}
      </span>
      {counted ? (
        <>
          <span className="team-minus-bar" aria-hidden="true">
            <span style={{ width: `${Math.round((line.done / line.due) * 100)}%` }} />
          </span>
          <span {...words.hold("team-minus-done")}>{words.say("perf.team.done", { done: line.done, due: line.due })}</span>
        </>
      ) : (
        <span {...words.hold("team-minus-done")}>{words.say(scored ? "perf.team.nothingDue" : "perf.team.notScored")}</span>
      )}
    </li>
  );
}

export function TeamScoreCard() {
  const { mode, version } = useAppStore();
  const { navigate } = useRouter();
  const words = useWords();
  const isDemo = mode === "demo";
  const today = todayISO();
  const [periodKey, setPeriodKey] = useState<PeriodKey>("this-month");
  // THE ACCOUNTS, from the server; null while they are being read.
  const [people, setPeople] = useState<DirectoryPerson[] | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [team, setTeam] = useState<Team | null>(null);

  useEffect(() => {
    let alive = true;
    usersApi
      .directory()
      .then((res) => {
        // A server from before this card answers with something else: that is "cannot be read", not an empty plant.
        if (!Array.isArray(res?.people)) throw new ApiError("the server did not send the accounts", 0);
        if (alive) setPeople(res.people);
      })
      .catch((e: unknown) => {
        if (alive) setWhy(e instanceof ApiError ? e.message : "the server could not be reached");
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!people) return;
    const id = window.setTimeout(() => setTeam(teamScores(people, periodKey, today, isDemo)), 0);
    return () => window.clearTimeout(id);
  }, [people, periodKey, today, isDemo, version]);

  return (
    <section className="card mb-4 team-minus no-print" data-section="team-minus" data-period={periodKey} aria-labelledby="team-minus-title">
      <div className="card-pad">
        <div className="team-minus-head">
          <h2 id="team-minus-title" {...words.hold("text-lg")}>
            {words.say("perf.team.title")}
          </h2>
          <select
            className="input input-sm"
            style={{ width: 170 }}
            value={periodKey}
            onChange={(e) => isPeriodKey(e.target.value) && setPeriodKey(e.target.value)}
            data-field="team-minus-period"
            aria-label="Period"
          >
            {PERIODS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <p {...words.hold("text-sm text-muted mt-1")}>{words.say("perf.team.rule")}</p>
        {why !== null ? (
          <p {...words.hold("text-sm mt-3")} data-state="team-minus-unreadable">
            {words.say("perf.team.unreadable", { why })}
          </p>
        ) : team === null ? (
          <p {...words.hold("text-sm text-muted mt-3")} data-state="team-minus-loading">
            {words.say("perf.team.loading")}
          </p>
        ) : (
          <ul className="team-minus-list" data-state="team-minus-ready">
            <TeamRow line={team.plant} words={words} plant />
            {team.lines.map((l) => (
              <TeamRow key={l.id} line={l} words={words} />
            ))}
          </ul>
        )}
        <button type="button" className="btn btn-secondary btn-sm mt-3" data-action="open-performance" onClick={() => navigate("/performance")}>
          <span {...words.hold()}>{words.say("perf.team.open")}</span> <FiArrowRight size={13} />
        </button>
      </div>
    </section>
  );
}
