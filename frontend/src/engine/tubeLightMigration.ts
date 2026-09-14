import type { FlyCatcherData, RecordInstance } from "../types";
import { recordRepository } from "../data/repositories/recordRepository";
import { historyOf, withEditHistory } from "./recordHistory";
import { isEditableStatus } from "./recordLifecycle";
import { TUBE_LIGHT_DUE, TUBE_LIGHT_INSTALLED } from "./flyPattern";

// FLY CATCHER TUBE-LIGHT DATES COME INTO LINE WITH THE REGISTER. Runs at every
// boot (idempotent).
//
// WHY THIS EXISTS. Until 13-Sep-2026 the app COMPUTED these two dates from the
// service date, on a rolling annual cycle it read off a photographed specimen
// as 24 December / 23 December. The department then stated them: installation
// 24-11-2025, replacement due 23-11-2026, fixed, every unit. Every F/HR/18
// record a browser already holds was filled in by that old code and carries a
// December pair — and because auto-fill carries the previous visit's dates
// forward, one stale record would keep seeding the next one for as long as the
// register runs. Fixing the constants alone would leave the plant's own
// register showing dates the plant says are wrong.
//
// WHAT IT TOUCHES, and what it will not. Only a date the OLD CODE could have
// produced: an install date on a 24 December, or a due date on a 23 December.
// Those values came from the defect, not from a person. Anything else somebody
// typed — a tube genuinely changed on another day — is left exactly as it is.
// And only drafts: Scheduled, Due, In Progress. A submitted, verified or
// rejected sheet is signed paperwork and changes only through a correction, so
// it keeps what it was signed with; the assistant flags such a record the next
// time it prepares one, since its carried-forward dates no longer match.
//
// The change goes into the record's own history, by "System", so nothing moves
// silently; updatedAt is left alone (upsertMany), so a prepared draft nobody
// has opened still reads as untouched to the clean-ups. REQUIREMENTS §44.

export const TUBE_LIGHT_NOTE =
  "Tube light dates brought into line with the F/HR/18 register: installed 24-11-2025, replacement due 23-11-2026 on every unit, as the department states them. The dates replaced were computed by an earlier version of this system, not entered by a person.";

/** A date the withdrawn annual-December cycle could have written. */
const fromOldCycle = (iso: string | null | undefined, monthDay: string): boolean =>
  typeof iso === "string" && iso.length === 10 && iso.slice(5) === monthDay;

export function alignTubeLightDates(): number {
  const updates: RecordInstance[] = [];
  // Unscoped on purpose: a boot-time clean-up works on the whole register,
  // not only the departments the person logged in may see
  // (engine/departmentScope.ts).
  for (const r of recordRepository.getAll()) {
    if (r.documentId !== "fly-catcher" || !isEditableStatus(r.status)) continue;
    const data = r.data as FlyCatcherData;
    if (!Array.isArray(data?.entries) || data.entries.length === 0) continue;
    let changed = false;
    const entries = data.entries.map((e) => {
      const install = fromOldCycle(e.tubeLightInstallDate, "12-24") ? TUBE_LIGHT_INSTALLED : e.tubeLightInstallDate;
      const due = fromOldCycle(e.tubeLightDueDate, "12-23") ? TUBE_LIGHT_DUE : e.tubeLightDueDate;
      if (install === e.tubeLightInstallDate && due === e.tubeLightDueDate) return e;
      changed = true;
      return { ...e, tubeLightInstallDate: install, tubeLightDueDate: due };
    });
    if (!changed) continue;
    // Keep the timeline the history panel showed before (e.g. "prepared by the
    // assistant", derived from the stamps) ahead of this entry.
    const base = r.history?.length ? r : { ...r, history: historyOf(r) };
    updates.push(withEditHistory(base, { ...data, entries }, "System", { note: TUBE_LIGHT_NOTE }));
  }
  if (updates.length) recordRepository.upsertMany(updates);
  return updates.length;
}
