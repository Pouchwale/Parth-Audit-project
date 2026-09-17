import React, { useState } from "react";
import { FiCheckCircle, FiDatabase, FiInfo, FiUserPlus } from "react-icons/fi";
import type { HrMasterPerson, LogSheetData, LogSheetLayout, LogSheetRow } from "../../types";
import { hrMasterRepository } from "../../data/repositories/hrMasterRepository";
import { useRouter } from "../../store/router";
import {
  applyFills,
  describePerson,
  fillBlanksFromMaster,
  lineForPerson,
  lineOfPerson,
  namesPerson,
  personFill,
  sameGp3,
  searchPeople,
  type FieldFill,
  type HrMasterLink,
} from "../../engine/hrMaster";

// FETCH FROM HR MASTER DATA ON A RECORD (REQUIREMENTS §53) — the bar above an
// HR format that names a person, shown while the record can be written in.
//
//   a form about one person (F/HR/04, 05, 11, 20)   GP3 No. or name → Fetch
//   a register of people (F/HR/01, 03, 06, 08, 12, 13)   GP3 No. or name → Add line
//   either                                            Fill blanks from the sheet
//
// Blank boxes are filled straight away. A box that already holds something
// else is listed with what the sheet has, and replaced only on "Replace" —
// which works out the change again against the form as it is by then, so a
// box typed into, or a line added or removed, since the list was shown is
// never overwritten by an old list. It is rendered keyed by the record, so a
// question about one record never carries over to another.

type Result = "filled" | "added" | "conflict" | "not-found" | "several" | "nothing" | "already" | "several-lines";

interface Pending {
  person: HrMasterPerson;
  /** The register line's id — null for the form's header. */
  rowId: string | null;
  conflicts: FieldFill[];
}

export function blankLogRow(layout: LogSheetLayout): LogSheetRow {
  const row: LogSheetRow = { id: "" };
  for (const c of layout.columns) row[c.key] = c.type === "number" ? null : c.autoFill?.default !== undefined && c.type !== "text" ? String(c.autoFill.default) : "";
  return row;
}

export function HrMasterFetch({
  link,
  layout,
  data,
  onChange,
  newRowId,
}: {
  link: HrMasterLink;
  layout: LogSheetLayout;
  data: LogSheetData;
  onChange: (data: LogSheetData) => void;
  newRowId: () => string;
}) {
  const { navigate } = useRouter();
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<HrMasterPerson[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [outcome, setOutcome] = useState<{ result: Result; text: string } | null>(null);
  const perHeader = link.where === "header";

  const labelOf = (key: string) => [...layout.headerFields, ...(layout.footerFields ?? []), ...layout.columns].find((f) => f.key === key)?.label ?? key;
  const listed = (fills: FieldFill[]) => fills.map((f) => labelOf(f.key)).join(", ");
  const say = (result: Result, text: string) => setOutcome({ result, text });
  const lineNo = (rowId: string | null) => (rowId === null ? null : data.rows.findIndex((r) => r.id === rowId) + 1);

  const write = (person: HrMasterPerson, rowId: string | null, fills: FieldFill[]) => {
    if (rowId === null) onChange({ ...data, header: applyFills(data.header ?? {}, fills) });
    else onChange({ ...data, rows: data.rows.map((r) => (r.id === rowId ? applyFills(r, fills) : r)) });
    const n = lineNo(rowId);
    say("filled", `Filled from HR Master Data — ${describePerson(person)}${n ? ` (line ${n})` : ""}: ${listed(fills)}.`);
  };

  const take = (person: HrMasterPerson) => {
    setCandidates([]);
    setPending(null);
    const people = hrMasterRepository.all();
    let rowId: string | null = null;
    if (!perHeader) {
      const match = lineOfPerson(link, data.rows, person, people);
      if (match.kind === "several") {
        say("several-lines", `${person.fullName} could be line ${match.indexes.map((i) => i + 1).join(" or line ")} of this register — nothing fetched; fill the right line by hand.`);
        return;
      }
      if (match.kind === "none") {
        const line = lineForPerson(link, person, { ...blankLogRow(layout), id: newRowId() });
        onChange({ ...data, rows: [...data.rows, line] });
        say("added", `Line ${data.rows.length + 1} added for ${describePerson(person)}.`);
        return;
      }
      rowId = data.rows[match.index].id;
    }
    const current = rowId === null ? (data.header ?? {}) : data.rows.find((r) => r.id === rowId) ?? {};
    const { fills, conflicts } = personFill(link, person, current);
    const where = rowId === null ? "The form" : `${person.fullName} is already on line ${lineNo(rowId)}, and it`;
    if (conflicts.length > 0) {
      setPending({ person, rowId, conflicts });
      say("conflict", `${where} already has something else in ${listed(conflicts)}. Replace it with what HR Master Data has for ${person.fullName}?`);
    } else if (fills.length > 0) write(person, rowId, fills);
    else if (rowId === null) say("nothing", `The form already has ${person.fullName}'s details — nothing to fetch.`);
    else say("already", `${person.fullName} is already on line ${lineNo(rowId)}, with the same details.`);
  };

  const find = () => {
    setPending(null);
    const { exact, candidates: found } = searchPeople(query, hrMasterRepository.all());
    if (exact) {
      take(exact);
      setQuery("");
    } else if (found.length > 0) {
      setCandidates(found);
      say("several", found.length === 1 ? "Is this who you mean?" : `${found.length} people on HR Master Data match "${query.trim()}" — which one?`);
    } else {
      setCandidates([]);
      say("not-found", `No one on HR Master Data has the GP3 No. or name "${query.trim()}".`);
    }
  };

  const fillBlanks = () => {
    setPending(null);
    setCandidates([]);
    const { data: next, filled, notOnSheet, onSeveralLines } = fillBlanksFromMaster(link, data, hrMasterRepository.all());
    const missing = notOnSheet.length > 0 ? ` ${notOnSheet.length} name${notOnSheet.length === 1 ? " is" : "s are"} not on HR Master Data: ${notOnSheet.slice(0, 5).join(", ")}${notOnSheet.length > 5 ? "…" : ""}.` : "";
    const several = onSeveralLines.length > 0 ? ` Left alone, being on more than one line: ${onSeveralLines.join(", ")}.` : "";
    if (filled.length === 0) {
      say("nothing", `Nothing to fill — ${perHeader ? "the form's person has no blank boxes the sheet can fill" : "no line of a person on the sheet has a blank box the sheet can fill"}.${missing}${several}`);
      return;
    }
    onChange(next);
    const boxes = filled.reduce((n, f) => n + f.fills.length, 0);
    say(
      "filled",
      perHeader
        ? `Filled from HR Master Data — ${filled[0].name}: ${listed(filled[0].fills)}.${missing}`
        : `Filled ${boxes} blank box${boxes === 1 ? "" : "es"} on ${filled.length} line${filled.length === 1 ? "" : "s"} from HR Master Data.${missing}${several}`
    );
  };

  // Worked out again against the form as it is now: only what was shown is replaced.
  const resolve = (replace: boolean) => {
    if (!pending) return;
    const { person, rowId } = pending;
    setPending(null);
    const current = rowId === null ? (data.header ?? {}) : data.rows.find((r) => r.id === rowId);
    if (!current || (rowId !== null && !(namesPerson(current[link.nameField], person) || (!!person.gp3No && sameGp3(current[link.nameField], person.gp3No))))) {
      say("nothing", "That line has changed since — nothing fetched. Fetch again.");
      return;
    }
    const { fills, conflicts } = personFill(link, person, current);
    const shown = (c: FieldFill) => pending.conflicts.some((p) => p.key === c.key && p.before === c.before && p.after === c.after);
    if (replace && !conflicts.every(shown)) {
      setPending({ person, rowId, conflicts });
      say("conflict", `The form has changed since — now ${listed(conflicts)} would be replaced. Replace it with what HR Master Data has for ${person.fullName}?`);
      return;
    }
    const writing = replace ? [...fills, ...conflicts] : fills;
    if (writing.length === 0) say("nothing", "Left as it was — nothing to fill.");
    else write(person, rowId, writing);
  };

  return (
    <div className="card mt-4 no-print" data-section="hr-master-fetch" style={{ borderStyle: "dashed" }}>
      <div className="card-pad">
        <div className="flex items-center gap-2 wrap">
          <span className="text-sm font-semibold">
            <FiDatabase size={13} style={{ verticalAlign: -2 }} /> Fetch from HR Master Data
          </span>
          <input
            className="input input-sm"
            style={{ maxWidth: 260 }}
            data-field="hr-master-query"
            list="hr-master-people"
            placeholder="GP3 No. or name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) find();
            }}
          />
          <button className="btn btn-primary btn-sm" data-action={perHeader ? "hr-master-fetch" : "hr-master-add-line"} disabled={!query.trim()} onClick={find}>
            {perHeader ? (
              "Fetch"
            ) : (
              <>
                <FiUserPlus size={12} /> Add line
              </>
            )}
          </button>
          <button className="btn btn-secondary btn-sm" data-action="hr-master-fill-blanks" onClick={fillBlanks}>
            Fill blanks from the sheet
          </button>
          <button className="btn btn-ghost btn-sm" data-action="open-hr-master" onClick={() => navigate("/hr/master-data")}>
            Open HR Master Data
          </button>
        </div>
        <div className="text-xs text-muted mt-1">
          {perHeader
            ? "Type the person's GP3 No. or name: blank boxes are filled from the sheet, anything already written only if you say so."
            : "Type a GP3 No. or name to add that person's line, or fill the blank boxes of every line whose name is on the sheet."}
        </div>

        {outcome && (
          <div className="text-sm mt-2" data-state="hr-master-result" data-result={outcome.result}>
            {outcome.result === "filled" || outcome.result === "added" ? <FiCheckCircle size={13} style={{ verticalAlign: -2, color: "var(--color-success)" }} /> : <FiInfo size={13} style={{ verticalAlign: -2 }} />}{" "}
            {outcome.text}
          </div>
        )}

        {candidates.length > 0 && (
          <div className="flex gap-2 wrap mt-2" data-list="hr-master-candidates">
            {candidates.map((p) => (
              <button key={p.id} className="btn btn-secondary btn-sm" data-candidate={p.id} onClick={() => take(p)}>
                {describePerson(p)}
              </button>
            ))}
          </div>
        )}

        {pending && (
          <div className="mt-2" data-section="hr-master-conflicts">
            <ul className="text-sm mb-2">
              {pending.conflicts.map((c) => (
                <li key={c.key}>
                  {labelOf(c.key)}: “{c.before}” → “{c.after}”
                </li>
              ))}
            </ul>
            <div className="flex gap-2 wrap">
              <button className="btn btn-primary btn-sm" data-action="hr-master-replace" onClick={() => resolve(true)}>
                Replace
              </button>
              <button className="btn btn-secondary btn-sm" data-action="hr-master-blanks-only" onClick={() => resolve(false)}>
                Fill only the blank boxes
              </button>
              <button
                className="btn btn-ghost btn-sm"
                data-action="hr-master-cancel"
                onClick={() => {
                  setPending(null);
                  say("nothing", "Left as it was — nothing fetched.");
                }}
              >
                Leave it
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** The sheet's people, for the name boxes' suggestion list. */
export function HrMasterPeopleList() {
  const people = hrMasterRepository.all();
  return (
    <datalist id="hr-master-people">
      {people
        .filter((p) => p.fullName.trim())
        .map((p) => (
          <option key={p.id} value={p.fullName}>
            {[p.gp3No ? `GP3 No. ${p.gp3No}` : "", p.department, p.designation].filter(Boolean).join(" · ")}
          </option>
        ))}
    </datalist>
  );
}
