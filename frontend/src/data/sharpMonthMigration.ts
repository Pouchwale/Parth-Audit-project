import type { LogSheetData, LogSheetRow, RecordInstance } from "../types";
import { documentRepository } from "./repositories/documentRepository";
import { masterRepository } from "./repositories/masterRepository";
import { recordRepository } from "./repositories/recordRepository";
import { untouchedByPeople } from "../engine/calendarMigration";
import { mayWriteRecordsOf } from "../engine/departmentScope";
import { effectiveDueDatesInMonth } from "../engine/holidays";
import { periodKeyFor } from "../engine/recordGenerator";
import { deleteRecordWithTrail } from "../engine/recordCrud";
import { isSharpMonthSheet, sharpLineFigures, sharpLineHoldsFigure, SHARP_TOOL_DOCS } from "../engine/sharpTools";
import { compareISO } from "../utils/date";

/** The day the owner asked for a sheet a month (REQUIREMENTS §259): a Daily frequency set on the four before it is lifted. */
export const SHARP_MONTH_RULE_DAY = "2026-11-20";

/** What a folded day sheet's deletion says (Users & Access → deleted records). */
export const SHARP_FOLD_NOTE = "Folded into the month's sheet: F/PRD/10, 22, 23 and 24 are one sheet a month, a line for every date (the owner, 20-Nov-2026, REQUIREMENTS §259); its line, if any, is on that date's line";

/**
 * THE DAILY FREQUENCY SET BEFORE §259 LIFTED (the owner, 20-Nov-2026: "on one sheet whole month date wise data is present so
 * that how i want ... i don't want that my user should open date wise on different on different page"). On 18-Nov-2026 the
 * four were set Daily on the Frequency page (Master Data's scheduleOverrides), and a frequency set there wins over the
 * format's own: the plant kept making a sheet a day. That setting, made before the owner asked for a sheet a month, is taken
 * off, so the four are monthly again; a frequency set on or after 20-Nov-2026 is the owner's and stays. Returns how many
 * were lifted.
 */
export function sharpDailyFrequencyLifted(): number {
  const master = masterRepository.get();
  const overrides = master.scheduleOverrides ?? {};
  const lift = SHARP_TOOL_DOCS.filter((id) => {
    const o = overrides[id];
    return !!o && o.schedule.type === "daily" && compareISO(o.since ?? "", SHARP_MONTH_RULE_DAY) < 0 && mayWriteRecordsOf(id);
  });
  if (lift.length === 0) return 0;
  const next = { ...overrides };
  for (const id of lift) delete next[id];
  masterRepository.update({ scheduleOverrides: next });
  return lift.length;
}

const OPEN = new Set(["Scheduled", "Due", "In Progress"]);

/** Whether `row`'s figures are those the month sheet's line of the same date holds. */
function onMonthLine(documentId: string, row: LogSheetRow, date: string, month: RecordInstance | undefined): boolean {
  if (!month) return false;
  const line = ((month.data as LogSheetData | undefined)?.rows ?? []).find((r) => String(r.date ?? "").slice(0, 10) === date);
  if (!line) return false;
  return Object.entries(sharpLineFigures(documentId, row)).every(([k, v]) => /shift/i.test(k) || String(line[k] ?? "").trim() === String(v ?? "").trim());
}

/**
 * THE DAY'S SHEETS FOLDED INTO THE MONTH'S (the owner, 20-Nov-2026, REQUIREMENTS §259). F/PRD/10, 22, 23 and 24 are one
 * sheet a month from November 2026, a line for every date of it. A day's sheet of theirs from that month on, still open
 * (never submitted, verified or rejected), is taken away when it holds no figure - a blank one, made or opened and left so -
 * or when every line it holds is on the month's sheet, on its date (engine/assistantPrepare.ts fillSharpToolsDue lays them
 * there); one a person had opened goes with a line in the deleted records. The month's own sheet - a day's sheet holding its
 * key included - stays, to be made the month's, and a day's sheet submitted or signed off stays on file. Runs at every
 * start, before the month's sheets are made and again after they are filled: nothing to do, nothing written. Returns how
 * many sheets went.
 */
export function sharpDaySheetsFolded(): number {
  const master = masterRepository.get();
  const quietly: string[] = [];
  let gone = 0;
  for (const id of SHARP_TOOL_DOCS) {
    const doc = documentRepository.getByIdUnscoped(id);
    if (!doc || doc.schedule.type !== "monthly" || !doc.scheduleSince || !mayWriteRecordsOf(id)) continue;
    const records = recordRepository.queryUnscoped({ documentId: id, isDemo: false });
    const keys = new Map<string, Set<string>>();
    const keysOf = (month: string) => {
      if (!keys.has(month)) {
        const [y, m] = month.split("-").map(Number);
        keys.set(month, new Set(effectiveDueDatesInMonth(doc, y, m - 1, master).map((d) => periodKeyFor(doc, d.scheduled))));
      }
      return keys.get(month)!;
    };
    const isMonth = (r: RecordInstance) => isSharpMonthSheet(r.data as LogSheetData | undefined) || keysOf(r.dueDate.slice(0, 7)).has(r.periodKey ?? "");
    const monthSheet = (month: string) => records.find((r) => r.dueDate.slice(0, 7) === month && isMonth(r) && isSharpMonthSheet(r.data as LogSheetData | undefined));
    for (const r of records) {
      if (compareISO(r.dueDate, doc.scheduleSince) < 0 || isMonth(r)) continue;
      if (!OPEN.has(r.status) || r.submittedAt || r.verifiedAt || r.rejectedAt) continue;
      const lines = ((r.data as LogSheetData | undefined)?.rows ?? []).filter((row) => sharpLineHoldsFigure(id, row));
      const month = monthSheet(r.dueDate.slice(0, 7));
      const folded = lines.length === 0 || lines.every((row) => onMonthLine(id, row, String(row.date ?? "").slice(0, 10) || r.dueDate, month));
      if (!folded) continue;
      if (untouchedByPeople(r)) quietly.push(r.id);
      else {
        deleteRecordWithTrail(r, "System", SHARP_FOLD_NOTE);
        gone += 1;
      }
    }
  }
  return gone + (quietly.length ? recordRepository.removeIds(quietly) : 0);
}
