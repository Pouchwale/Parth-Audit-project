import React, { useState } from "react";
import { FiCheckCircle, FiInfo, FiPlus, FiTool } from "react-icons/fi";
import type { LogSheetData, LogSheetLayout } from "../../types";
import { useRouter } from "../../store/router";
import { applyFills, type FieldFill } from "../../engine/hrMaster";
import {
  allMachines,
  describeMachine,
  EQUIPMENT_LIST_FORMAT_NO,
  EQUIPMENT_LIST_NAME,
  EQUIPMENT_LIST_ROUTE,
  fillBlanksFromEquipment,
  lineForMachine,
  machineFill,
  machineKey,
  outOfStepNote,
  searchMachines,
  type EquipmentLink,
  type Machine,
} from "../../engine/equipmentMaster";
import { blankLogRow } from "./HrMasterFetch";

// FETCH A MACHINE FROM F/MNT/01 ON A RECORD (REQUIREMENTS §74). This is the bar
// above a Maintenance format that names a machine, shown while the record can
// be written in. It is HR Master Data's bar (HrMasterFetch.tsx, §53) with
// machines in place of people:
//
//   a form about one machine (F/MNT/02, F/MNT/04)   Machine No. → Fetch
//   the breakdown register (F/MNT/06)              Machine No. → Add line
//   either                                         Fill blanks from F/MNT/01
//
// Blank boxes are filled straight away. A box that already holds something
// else is listed beside what the list has, and replaced only on "Replace".
// Replace works the change out again against the form as it is by then, so a
// box typed into since the list was shown is never overwritten by an old list.
//
// ONE DIFFERENCE FROM HR, ON PURPOSE. A register of people has one line per
// person, so HR's "Add line" first looks for that person's line. A register of
// breakdowns has a line per BREAKDOWN, and M-47 breaking down twice is two
// lines. So "Add line" here always adds one and never asks.
//
// A machine is found by its number, never by its model name: several machines
// share one (engine/equipmentMaster.ts). A name gives buttons to choose from.
// The bar is keyed by the record where it is mounted, so a question about one
// record never carries over to another.

type Result = "filled" | "added" | "conflict" | "not-found" | "several" | "nothing";

interface Pending {
  machine: Machine;
  conflicts: FieldFill[];
}

export function EquipmentFetch({
  link,
  layout,
  data,
  onChange,
  newRowId,
}: {
  link: EquipmentLink;
  layout: LogSheetLayout;
  data: LogSheetData;
  onChange: (data: LogSheetData) => void;
  newRowId: () => string;
}) {
  const { navigate } = useRouter();
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Machine[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [outcome, setOutcome] = useState<{ result: Result; text: string } | null>(null);
  const perHeader = link.where === "header";

  // A label as it reads inside a sentence: "Machine No." rather than the form's "Machine No. :".
  const labelOf = (key: string) =>
    ([...layout.headerFields, ...(layout.footerFields ?? []), ...layout.columns].find((f) => f.key === key)?.label ?? key).replace(/[\s:–-]+$/, "");
  const listed = (fills: FieldFill[]) => fills.map((f) => labelOf(f.key)).join(", ");
  const say = (result: Result, text: string) => setOutcome({ result, text });

  // Only the boxes this format still has. The Sheet Designer can remove a
  // column the map names, and a fetch must not bring it back as a hidden value.
  // Worked out when a button is pressed, never while drawing.
  const present = (): EquipmentLink => {
    const keys = new Set((perHeader ? [...layout.headerFields, ...(layout.footerFields ?? [])] : layout.columns).map((f) => f.key));
    return { ...link, fields: link.fields.filter((f) => keys.has(f.key)) };
  };

  const write = (machine: Machine, fills: FieldFill[]) => {
    onChange({ ...data, header: applyFills(data.header ?? {}, fills) });
    say("filled", `Filled from ${EQUIPMENT_LIST_FORMAT_NO} for ${describeMachine(machine)}: ${listed(fills)}.${outOfStepNote(machine)}`);
  };

  const take = (machine: Machine) => {
    setCandidates([]);
    setPending(null);
    const usable = present();
    if (!perHeader) {
      const line = lineForMachine(usable, machine, { ...blankLogRow(layout), id: newRowId() });
      onChange({ ...data, rows: [...data.rows, line] });
      say("added", `Line ${data.rows.length + 1} added for ${describeMachine(machine)}.${outOfStepNote(machine)}`);
      return;
    }
    const { fills, conflicts } = machineFill(usable, machine, data.header ?? {});
    if (conflicts.length > 0) {
      setPending({ machine, conflicts });
      say("conflict", `The form already has something else in ${listed(conflicts)}. Replace it with what ${EQUIPMENT_LIST_FORMAT_NO} has for ${machine.machineNo}?`);
    } else if (fills.length > 0) write(machine, fills);
    else say("nothing", `The form already has ${machine.machineNo}'s details, so there is nothing to fetch.`);
  };

  const find = () => {
    setPending(null);
    const machines = allMachines();
    const q = query.trim();
    if (machines.length === 0) {
      setCandidates([]);
      say("not-found", `There is no ${EQUIPMENT_LIST_NAME} (${EQUIPMENT_LIST_FORMAT_NO}) on file to fetch from.`);
      return;
    }
    const { exact, candidates: found } = searchMachines(q, machines);
    if (exact) {
      take(exact);
      setQuery("");
    } else if (found.length > 0) {
      setCandidates(found);
      say(
        "several",
        found.length === 1
          ? "Is this the machine you mean?"
          : `${found.length} machines on ${EQUIPMENT_LIST_FORMAT_NO} match "${q}". Which one? The Machine No. tells them apart.`
      );
    } else {
      setCandidates([]);
      const key = machineKey(q);
      say("not-found", key ? `${key} is not on ${EQUIPMENT_LIST_FORMAT_NO} (${EQUIPMENT_LIST_NAME}).` : `No machine on ${EQUIPMENT_LIST_FORMAT_NO} has the Machine No., serial or name "${q}".`);
    }
  };

  const fillBlanks = () => {
    setPending(null);
    setCandidates([]);
    const { data: next, filled, notOnList } = fillBlanksFromEquipment(present(), data, allMachines());
    const missing =
      notOnList.length > 0
        ? ` ${notOnList.length === 1 ? "This is" : "These are"} not a machine on ${EQUIPMENT_LIST_FORMAT_NO}: ${notOnList.slice(0, 5).join(", ")}${notOnList.length > 5 ? "…" : ""}.`
        : "";
    if (filled.length === 0) {
      const idBlank = perHeader && !String(data.header?.[link.idField] ?? "").trim();
      say(
        "nothing",
        idBlank
          ? `Type the machine's number in “${labelOf(link.idField)}” first. A machine is found by its number, never by its name.`
          : `Nothing to fill. ${perHeader ? "The form's machine has no blank box the list can fill." : "No line whose machine is on the list has a blank box it can fill."}${missing}`
      );
      return;
    }
    onChange(next);
    const boxes = filled.reduce((n, f) => n + f.fills.length, 0);
    const shifted = filled.find((f) => f.outOfStep);
    const note = shifted ? ` ${EQUIPMENT_LIST_FORMAT_NO} prints ${shifted.machineNo}'s line one column out of step, so it was read one column to the left. Confirm it against the machine's plate.` : "";
    say(
      "filled",
      perHeader
        ? `Filled from ${EQUIPMENT_LIST_FORMAT_NO} for ${filled[0].machineNo}: ${listed(filled[0].fills)}.${missing}${note}`
        : `Filled ${boxes} blank box${boxes === 1 ? "" : "es"} on ${filled.length} line${filled.length === 1 ? "" : "s"} from ${EQUIPMENT_LIST_FORMAT_NO}.${missing}${note}`
    );
  };

  // Worked out again against the form as it is now: only what was shown is replaced.
  const resolve = (replace: boolean) => {
    if (!pending) return;
    const { machine } = pending;
    setPending(null);
    const { fills, conflicts } = machineFill(present(), machine, data.header ?? {});
    const shown = (c: FieldFill) => pending.conflicts.some((p) => p.key === c.key && p.before === c.before && p.after === c.after);
    if (replace && !conflicts.every(shown)) {
      setPending({ machine, conflicts });
      say("conflict", `The form has changed since, and now ${listed(conflicts)} would be replaced. Replace it with what ${EQUIPMENT_LIST_FORMAT_NO} has for ${machine.machineNo}?`);
      return;
    }
    const writing = replace ? [...fills, ...conflicts] : fills;
    if (writing.length === 0) say("nothing", "Left as it was. There was nothing to fill.");
    else write(machine, writing);
  };

  return (
    <div className="card mt-4 no-print" data-section="equipment-fetch" style={{ borderStyle: "dashed" }}>
      <div className="card-pad">
        <div className="flex items-center gap-2 wrap">
          <span className="text-sm font-semibold">
            <FiTool size={13} style={{ verticalAlign: -2 }} /> Fetch from {EQUIPMENT_LIST_FORMAT_NO}, the equipment list
          </span>
          <input
            className="input input-sm"
            style={{ maxWidth: 260 }}
            data-field="equipment-query"
            list="equipment-machines"
            placeholder="Machine No. (M-47) or serial"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) find();
            }}
          />
          <button className="btn btn-primary btn-sm" data-action={perHeader ? "equipment-fetch" : "equipment-add-line"} disabled={!query.trim()} onClick={find}>
            {perHeader ? (
              "Fetch"
            ) : (
              <>
                <FiPlus size={12} /> Add line
              </>
            )}
          </button>
          <button className="btn btn-secondary btn-sm" data-action="equipment-fill-blanks" onClick={fillBlanks}>
            Fill blanks from {EQUIPMENT_LIST_FORMAT_NO}
          </button>
          <button className="btn btn-ghost btn-sm" data-action="open-equipment-list" onClick={() => navigate(EQUIPMENT_LIST_ROUTE)}>
            Open {EQUIPMENT_LIST_FORMAT_NO}
          </button>
        </div>
        <div className="text-xs text-muted mt-1">
          {perHeader
            ? "Type the Machine No. or its serial. Blank boxes are filled from the list, and anything already written only if you say so. Several machines share a model name, so a name only offers machines to choose from."
            : "Type a Machine No. to add a line for it. Every fetch adds a new line, because each breakdown is a line of its own. Or fill the blank boxes of every line whose Machine No. is on the list."}
        </div>

        {outcome && (
          <div className="text-sm mt-2" data-state="equipment-result" data-result={outcome.result}>
            {outcome.result === "filled" || outcome.result === "added" ? <FiCheckCircle size={13} style={{ verticalAlign: -2, color: "var(--color-success)" }} /> : <FiInfo size={13} style={{ verticalAlign: -2 }} />}{" "}
            {outcome.text}
          </div>
        )}

        {candidates.length > 0 && (
          <div className="flex gap-2 wrap mt-2" data-list="equipment-candidates">
            {candidates.map((m) => (
              <button key={m.rowId || m.machineNo} className="btn btn-secondary btn-sm" data-candidate={m.machineNo} onClick={() => take(m)}>
                {describeMachine(m)}
              </button>
            ))}
          </div>
        )}

        {pending && (
          <div className="mt-2" data-section="equipment-conflicts">
            <ul className="text-sm mb-2">
              {pending.conflicts.map((c) => (
                <li key={c.key}>
                  {labelOf(c.key)}: “{c.before}” → “{c.after}”
                </li>
              ))}
            </ul>
            <div className="flex gap-2 wrap">
              <button className="btn btn-primary btn-sm" data-action="equipment-replace" onClick={() => resolve(true)}>
                Replace
              </button>
              <button className="btn btn-secondary btn-sm" data-action="equipment-blanks-only" onClick={() => resolve(false)}>
                Fill only the blank boxes
              </button>
              <button
                className="btn btn-ghost btn-sm"
                data-action="equipment-cancel"
                onClick={() => {
                  setPending(null);
                  say("nothing", "Left as it was. Nothing was fetched.");
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

/** The list's machines, for the number boxes' suggestion list: the number to type, and what the machine is beside it. */
export function EquipmentMachineList() {
  const machines = allMachines();
  return (
    <datalist id="equipment-machines">
      {machines
        .filter((m) => machineKey(m.machineNo))
        .map((m) => (
          <option key={m.rowId || m.machineNo} value={m.machineNo} label={describeMachine(m)} />
        ))}
    </datalist>
  );
}
