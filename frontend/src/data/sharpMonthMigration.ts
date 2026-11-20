import type { LogSheetData } from "../types";
import { documentRepository } from "./repositories/documentRepository";
import { masterRepository } from "./repositories/masterRepository";
import { recordRepository } from "./repositories/recordRepository";
import { untouchedByPeople } from "../engine/calendarMigration";
import { mayWriteRecordsOf } from "../engine/departmentScope";
import { effectiveDueDatesInMonth } from "../engine/holidays";
import { periodKeyFor } from "../engine/recordGenerator";
import { isSharpMonthSheet, SHARP_TOOL_DOCS } from "../engine/sharpTools";
import { compareISO } from "../utils/date";

/**
 * THE DAY'S SHEETS FOLDED INTO THE MONTH'S (the owner, 20-Nov-2026, REQUIREMENTS §259). F/PRD/10, 22, 23 and 24 are one
 * sheet a month from November 2026, a line for every date of it. A day's sheet of theirs from that month on that nobody
 * has written on (made, or filled by the assistant, and nothing since: engine/calendarMigration.ts untouchedByPeople) is
 * taken away; its day's line is filled on the month's sheet the same (engine/assistantPrepare.ts fillSharpToolsDue). A
 * day's sheet a person wrote on stays on file, and its line is laid on the month's sheet. The month's own sheet - a day's
 * blank sheet holding its key included - stays, to be made the month's. Runs at every start, before the month's sheets
 * are made: nothing to do, nothing written. Returns how many sheets went.
 */
export function sharpDaySheetsFolded(): number {
  const master = masterRepository.get();
  const removeIds: string[] = [];
  for (const id of SHARP_TOOL_DOCS) {
    const doc = documentRepository.getByIdUnscoped(id);
    if (!doc || doc.schedule.type !== "monthly" || !doc.scheduleSince || !mayWriteRecordsOf(id)) continue;
    const monthKeys = new Map<string, Set<string>>();
    const keysOf = (month: string) => {
      if (!monthKeys.has(month)) {
        const [y, m] = month.split("-").map(Number);
        monthKeys.set(month, new Set(effectiveDueDatesInMonth(doc, y, m - 1, master).map((d) => periodKeyFor(doc, d.scheduled))));
      }
      return monthKeys.get(month)!;
    };
    for (const r of recordRepository.queryUnscoped({ documentId: id, isDemo: false })) {
      if (compareISO(r.dueDate, doc.scheduleSince) < 0 || isSharpMonthSheet(r.data as LogSheetData | undefined)) continue;
      if (keysOf(r.dueDate.slice(0, 7)).has(r.periodKey ?? "")) continue;
      if (untouchedByPeople(r)) removeIds.push(r.id);
    }
  }
  return removeIds.length ? recordRepository.removeIds(removeIds) : 0;
}
