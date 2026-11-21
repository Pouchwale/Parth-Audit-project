import type { HistoryEntry, LogSheetData, RecordInstance } from "../types";
import { recordRepository } from "./repositories/recordRepository";
import { hrMasterRepository } from "./repositories/hrMasterRepository";
import { readJSON } from "./storageAdapter";
import { HR_FEEDBACK_ON_FILE, type FeedbackSheetOnFile } from "./seed/hrFeedbackOnFile";
import { mayWriteRecordsOf } from "../engine/departmentScope";
import { nameKey, sameGp3 } from "../engine/hrMaster";

// WHAT THE OWNER SUPPLIED FOR THE HR MODULE ON 21-NOV-2026 (REQUIREMENTS §273: hrauditdoc.zip, rehrauditdoc.zip).
//
// THE 38 FILLED F/HR/12 SHEETS, 2024 TO 2026, each a Live record of its training's own date, its figures as the paper has
// them. In Progress, its Evaluated By left empty, on the owner's word: only one paper has anything in that box (a date), so
// HR checks each sheet and signs it. Each is added once, under a fixed id so two devices make the same record; one somebody
// deleted is not put back. All are dated before the plant went live (14-10-2026), so none is counted late.
//
// THE THREE DIRECTORS' NUMBERS. Master Data.xlsx writes DIR.001 to DIR.003 for the three people HR Master Data holds with no
// GP3 No. Only an empty GP3 No. box is written, and only with a number nobody else holds.

export const HR_FEEDBACK_DOC = "hr-training-feedback";
const SUPPLIED_AT = "2026-11-21T06:00:00.000Z";

export const feedbackRecordId = (key: string): string => `hr-feedback-file-${key}`;

/** One supplied sheet as its record: the same on every device. */
export function feedbackRecord(s: FeedbackSheetOnFile): RecordInstance<LogSheetData> {
  const note = [`Entered from the company's filled sheet ${s.file}; Evaluated By is left for HR to sign (REQUIREMENTS §273)`, ...s.note].join(". ");
  const entry: HistoryEntry = { id: `hist-hr-feedback-${s.key}`, at: SUPPLIED_AT, by: "System", action: "imported", note };
  return {
    id: feedbackRecordId(s.key),
    documentId: HR_FEEDBACK_DOC,
    periodKey: `${HR_FEEDBACK_DOC}:${s.date}:file-${s.key}`,
    dueDate: s.date,
    status: "In Progress",
    isDemo: false,
    filedFromPaper: true,
    data: {
      header: { trainingDate: s.date, topic: s.topic, impartedBy: s.by, duration: s.duration, evaluatedBy: "", evalDate: "" },
      rows: s.lines.map(([name, rating], i) => ({ id: `hrfb-${s.key}-${i + 1}`, name, rating, additionalTraining: "", remarks: "" })),
    },
    createdAt: SUPPLIED_AT,
    updatedAt: SUPPLIED_AT,
    history: [entry],
  };
}

/** The supplied sheets not on file yet are added, one deleted stays deleted. Returns those added. */
export function hrFeedbackSheetsOnFile(): RecordInstance[] {
  if (!mayWriteRecordsOf(HR_FEEDBACK_DOC)) return [];
  const all = recordRepository.getAll();
  // (a sheet stored before it carried the mark takes it, and nothing else changes)
  const unmarked = all.filter((r) => r.id.startsWith("hr-feedback-file-") && !r.filedFromPaper);
  if (unmarked.length > 0) recordRepository.upsertMany(unmarked.map((r) => ({ ...r, filedFromPaper: true })));
  const have = new Set(all.map((r) => r.id));
  const deleted = new Set(readJSON<{ recordId?: string; id?: string; periodKey?: string }[]>("deletions", []).flatMap((d) => [d.recordId, d.id, d.periodKey]));
  const add = HR_FEEDBACK_ON_FILE.map(feedbackRecord).filter((r) => !have.has(r.id) && !deleted.has(r.id) && !deleted.has(r.periodKey));
  if (add.length > 0) recordRepository.upsertMany(add);
  return add;
}

const DIRECTOR_NUMBERS: readonly (readonly [string, string])[] = [
  ["Shail Patel", "DIR.001"],
  ["Swarup Rajgor", "DIR.002"],
  ["Virat Rajgor", "DIR.003"],
];

/** The three directors' GP3 Nos. written where the box is empty. Returns how many were written. */
export function hrDirectorNumbers(): number {
  if (!mayWriteRecordsOf("hr-competence")) return 0;
  let written = 0;
  for (const [name, number] of DIRECTOR_NUMBERS) {
    const people = hrMasterRepository.all();
    const named = people.filter((p) => nameKey(p.fullName) === nameKey(name));
    if (named.length !== 1 || named[0].gp3No.trim() || people.some((p) => sameGp3(p.gp3No, number))) continue;
    if (hrMasterRepository.update(named[0].id, "gp3No", number, "System")) written += 1;
  }
  return written;
}
