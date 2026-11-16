import type { FlyCatcherData, RecordInstance } from "../types";
import { recordRepository } from "./repositories/recordRepository";
import { appendHistory, diffRecordData, historyOf, makeEntry } from "../engine/recordHistory";
import { mayWriteRecordsOf } from "../engine/departmentScope";
import { withVisitMonthYear } from "../engine/flyMonthYear";
import { formatDisplayDate } from "../utils/date";

const FLY = "fly-catcher";

/** What the history says of a visit put back on its Monday. */
export const BACK_ON_MONDAY_NOTE = "Dated back on its Monday - the 1st and 3rd Monday of the month - on the owner's word of 16-Nov-2026 (REQUIREMENTS §238)";
/** What the history says when a visit's Month & Year follows its date. */
export const VISIT_MONTH_NOTE = "Month & Year written as the visit's own month, as its date is (REQUIREMENTS §238)";

/**
 * NOVEMBER 2026'S TWO VISITS BACK ON THEIR MONDAYS (REQUIREMENTS §238; the owner, 16-Nov-2026, asked: "Put both back on
 * Mondays"). On the plant the 02-11 visit had been dated 16-11 and the 16-11 visit 16-12 by hand, so December would have
 * held three; each goes back to the Monday its key names - 02-11, then 16-11 - with what was written on it, signed or not,
 * and a line in its history. Only while it still stands on the day it was moved to: run at every start, once.
 */
const MOVED_BACK: { id: string; from: string; to: string }[] = [
  { id: "rec-mvtaykce-19-bmvydf", from: "2026-11-16", to: "2026-11-02" },
  { id: "rec-mvvzonba-7-em8tcc", from: "2026-12-16", to: "2026-11-16" },
];

export function flyVisitsBackOnMondays(): number {
  if (!mayWriteRecordsOf(FLY)) return 0;
  let n = 0;
  // In order: the 16-11 visit leaves its day before the 16-12 visit comes to it.
  for (const m of MOVED_BACK) {
    const r = recordRepository.getById(m.id);
    if (!r || r.isDemo || r.documentId !== FLY || r.dueDate !== m.from || r.periodKey !== `${FLY}:${m.to}`) continue;
    if (recordRepository.queryUnscoped({ documentId: FLY, isDemo: false }).some((o) => o.id !== r.id && o.dueDate === m.to)) continue;
    const data = withVisitMonthYear(r.data as FlyCatcherData, m.to) ?? (r.data as FlyCatcherData);
    const changes = [{ field: "dueDate", label: "Dated", before: formatDisplayDate(m.from), after: formatDisplayDate(m.to) }, ...diffRecordData(r.data, data)];
    recordRepository.upsert(appendHistory({ ...r, dueDate: m.to, data }, makeEntry("edited", "System", { changes, note: BACK_ON_MONDAY_NOTE })));
    n++;
  }
  return n;
}

/** Every Live visit's Month & Year its own month's where DCRS wrote it (engine/flyMonthYear.ts); returns how many changed. */
export function flyMonthYearsFollowDates(): number {
  if (!mayWriteRecordsOf(FLY)) return 0;
  const updates: RecordInstance[] = [];
  for (const r of recordRepository.snapshot()) {
    if (r.documentId !== FLY || r.isDemo) continue;
    const data = withVisitMonthYear(r.data as FlyCatcherData, r.dueDate);
    if (!data) continue;
    const entry = appendHistory({ ...r, history: [] }, makeEntry("edited", "System", { changes: diffRecordData(r.data, data), note: VISIT_MONTH_NOTE })).history![0];
    updates.push({ ...r, data, history: [...historyOf(r), entry] });
  }
  if (updates.length) recordRepository.upsertMany(updates);
  return updates.length;
}
