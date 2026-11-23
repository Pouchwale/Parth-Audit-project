import type { DocumentDefinition, MasterData, RecordInstance } from "../types";
import { waitsUntil } from "./notBeforeDay";
import { createDefaultData } from "./recordDefaults";
import { todayISO } from "../utils/date";

// A SHEET BEFORE ITS DAY IS SHOWN BLANK (REQUIREMENTS §299; the owner, 23-Nov-2026, with F/QC/11 of 24-11-2026 showing its readings:
// "no document should come already filled before that date ... when user open on that day then only document should filled").
// Sheets filled before the rule of §201 and §289 still hold those words. They are not deleted, because a person may have typed
// some of them: until the first day the sheet covers, the screen, the print and the downloads show its blank format, and on
// that day it shows what it holds.

/** The record as it may be shown today: a live sheet whose day has not come carries its blank format. */
export function shownOnItsDay<T extends RecordInstance>(doc: DocumentDefinition, record: T, master: MasterData, today: string = todayISO()): T {
  if (doc.kind !== "log-sheet" || waitsUntil(doc, record, today) === null) return record;
  return { ...record, data: createDefaultData(doc, record.dueDate, master) };
}
