import React, { useState } from "react";
import { FiDatabase, FiPlus, FiTrash2 } from "react-icons/fi";
import { useAppStore } from "../store/AppStore";
import { useRouter } from "../store/router";
import { masterRepository } from "../data/repositories/masterRepository";
import { documentRepository } from "../data/repositories/documentRepository";
import { isDocumentIdVisible, mayDo } from "../engine/departmentScope";
import { BLADE_STOCK, SHARP_STOCK, SHARP_TOOL_DOCS, shiftOnePeople, shiftWord } from "../engine/sharpTools";
import { NotYourDepartment } from "../components/common/NotYourDepartment";
import { Modal } from "../components/common/Modal";
import { logActivity } from "../utils/activityLog";
import { generateId } from "../utils/id";
import type { SharpToolPerson } from "../types";

// SHARP OBJECTS MASTER DATA (REQUIREMENTS §254) — /production/sharp-master.
//
// The people the scissors and manual cutters are issued to - Name, Department, Shift - kept in the Production module beside
// the four Sharp Objects & Blades sheets. Each working day F/PRD/10 and F/PRD/23 get a line for every shift on this list, the
// scissors and cutters issued and returned being that shift's people (engine/sharpTools.ts); the razor blade sheets, F/PRD/22
// and F/PRD/24, keep their own stock. Written by whoever may fill one of the four sheets, read by everyone who sees them.

// TWO SHIFTS, I AND II (the owner, 18-Nov-2026: "give two options only in shift with 1 and 2 not more than that", then
// "it should be roman number which is like I and II"), written so on the page and on the sheets, as the paper does.
const SHIFTS = ["I", "II"];
/** A shift as this page shows it: I or II. */
const shiftNo = (s: string | null | undefined): string => (shiftWord(s) === "II" ? "II" : "I");
const many = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function SharpToolMasterPage() {
  const { bump } = useAppStore();
  const { navigate } = useRouter();
  const [removing, setRemoving] = useState<SharpToolPerson | null>(null);
  const visible = SHARP_TOOL_DOCS.some((id) => isDocumentIdVisible(id));
  if (!visible) return <NotYourDepartment documentId={SHARP_TOOL_DOCS[0]} what="document" />;
  const editable = SHARP_TOOL_DOCS.some((id) => mayDo(id, "start"));
  const master = masterRepository.get();
  const people = master.sharpToolPeople ?? [];
  const departments = Array.from(new Set([...(master.departments ?? []).map((d) => d.name), ...people.map((p) => p.department)].filter(Boolean))).sort();

  const save = (next: SharpToolPerson[], what: string) => {
    masterRepository.update({ sharpToolPeople: next });
    logActivity("Sharp Objects Master Data", what, "");
    bump();
  };
  const setCell = (id: string, key: "name" | "department" | "shift", value: string) => {
    const clean = key === "shift" ? shiftWord(value) : value.replace(/\s+/g, " ").trim();
    const current = masterRepository.get().sharpToolPeople ?? [];
    const was = current.find((p) => p.id === id);
    if (!was || was[key] === clean) return;
    save(current.map((p) => (p.id === id ? { ...p, [key]: clean } : p)), `${was.name || "A new line"}: ${key} ${clean || "cleared"}`);
  };
  const add = () => save([...(masterRepository.get().sharpToolPeople ?? []), { id: generateId("sharp"), name: "", department: "", shift: "I" }], "A line added");
  const remove = (p: SharpToolPerson) => {
    save((masterRepository.get().sharpToolPeople ?? []).filter((x) => x.id !== p.id), `${p.name || "A line"} deleted`);
    setRemoving(null);
  };

  // What the four sheets will be filled with, from this list.
  const sheetLine = (id: string): string => {
    const doc = documentRepository.getById(id);
    const no = doc?.formatNo ?? id;
    if (BLADE_STOCK[id]) return `${no}: one line a day from its own blade stock (always ${BLADE_STOCK[id].maintained} blades, machines' included).`;
    // One line a day, shift I: the instruments are given in the first shift only (§258).
    const count = shiftOnePeople(id, master).length;
    if (count === 0) return `${no}: nothing yet - add the people of shift I below.`;
    const stock = SHARP_STOCK[id];
    const each =
      id === "prd-sharp-object-issue"
        ? `${many(Math.min(count, stock.scissor ?? count), "scissor")} of ${stock.scissor}, ${many(Math.min(count, stock.cutter), "manual cutter")} of ${stock.cutter}`
        : `${many(Math.min(count, stock.cutter), "manual cutter")} of ${stock.cutter}`;
    return `${no}: shift I - ${each} issued and returned each day${id === "prd-pouching-cutter-issue" ? " (the pouching section's people)" : ""}, the rest in the cupboard; a worn-out one replaced now and then, so the stock stays ${id === "prd-sharp-object-issue" ? `${stock.scissor} / ${stock.cutter}` : stock.cutter}.`;
  };

  return (
    <div data-page="sharp-tool-master">
      <div className="flex items-center justify-between mb-1 wrap gap-3">
        <h1 className="text-2xl mb-1">
          <FiDatabase size={20} /> Sharp Objects Master Data
        </h1>
        {editable && (
          <button className="btn btn-primary btn-sm" data-action="sharp-add" onClick={add}>
            <FiPlus size={12} /> Add person
          </button>
        )}
      </div>
      <p className="text-sm text-muted mb-3">
        The people the scissors and manual cutters are issued to. Each working day the Sharp Objects &amp; Blades sheets are filled from this list:
      </p>
      <ul className="text-sm mb-4" data-section="sharp-sheets">
        {SHARP_TOOL_DOCS.map((id) => (
          <li key={id}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(`/document/${id}`)}>
              {sheetLine(id)}
            </button>
          </li>
        ))}
      </ul>
      <div className="doc-table">
        <table className="records-list" data-table="sharp-people">
          <thead>
            <tr>
              <th style={{ width: 60 }}>Sr. No.</th>
              <th>Name</th>
              <th>Department</th>
              <th style={{ width: 120 }}>Shift</th>
              {editable && <th className="no-print" style={{ width: 60 }} />}
            </tr>
          </thead>
          <tbody>
            {people.length === 0 && (
              <tr>
                <td colSpan={editable ? 5 : 4} className="text-muted text-center" style={{ padding: 24 }}>
                  No one on the list yet.{editable ? " Add each person with their department and shift." : ""}
                </td>
              </tr>
            )}
            {people.map((p, i) => (
              <tr key={p.id} data-person={p.id}>
                <td>{i + 1}</td>
                <td>
                  {editable ? (
                    <input className="input input-sm" data-field="sharp-name" aria-label={`Line ${i + 1} - name`} defaultValue={p.name} onBlur={(e) => setCell(p.id, "name", e.target.value)} />
                  ) : (
                    p.name
                  )}
                </td>
                <td>
                  {editable ? (
                    <input className="input input-sm" list="sharp-departments" data-field="sharp-department" aria-label={`Line ${i + 1} - department`} defaultValue={p.department} onBlur={(e) => setCell(p.id, "department", e.target.value)} />
                  ) : (
                    p.department
                  )}
                </td>
                <td>
                  {editable ? (
                    <select className="input input-sm" data-field="sharp-shift" aria-label={`Line ${i + 1} - shift`} value={shiftWord(p.shift) === "II" ? "II" : "I"} onChange={(e) => setCell(p.id, "shift", e.target.value)}>
                      {SHIFTS.map((s) => (
                        <option key={s} value={s}>
                          {shiftNo(s)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    shiftNo(p.shift)
                  )}
                </td>
                {editable && (
                  <td className="no-print">
                    <button className="btn btn-ghost btn-sm" data-action="sharp-delete" aria-label={`Delete ${p.name || `line ${i + 1}`}`} onClick={() => setRemoving(p)}>
                      <FiTrash2 size={13} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <datalist id="sharp-departments">
        {departments.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
      {removing && (
        <Modal
          title="Delete this person?"
          onClose={() => setRemoving(null)}
          footer={
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setRemoving(null)}>
                Cancel
              </button>
              <button className="btn btn-danger btn-sm" data-action="sharp-delete-confirm" onClick={() => remove(removing)}>
                Delete
              </button>
            </>
          }
        >
          <p>
            Are you sure you want to delete {removing.name || "this line"}
            {removing.department ? ` (${removing.department}, shift ${shiftNo(removing.shift)})` : ""}? Sheets already filled keep their figures; from the next day the counts leave this person out.
          </p>
        </Modal>
      )}
    </div>
  );
}
