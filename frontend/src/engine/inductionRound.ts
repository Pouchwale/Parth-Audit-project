import type { HrMasterPerson, LogSheetData, LogSheetRow, MasterData, RecordInstance } from "../types";
import { documentRepository } from "../data/repositories/documentRepository";
import { hrMasterRepository } from "../data/repositories/hrMasterRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { getLogSheetLayout } from "../data/seed/logSheetLayouts";
import { logActivity } from "../utils/activityLog";
import { todayISO } from "../utils/date";
import { generateId } from "../utils/id";
import { followHeader } from "./headerFollowers";
import { nextWorkingDay } from "./holidays";
import { describePerson, HR_MASTER_TAG, hrMasterLinkFor, isIsoDate, linkedValue, namesPerson, parseWrittenDate, personNamed, sameGp3, writeDate } from "./hrMaster";
import { placementsFor, roleOf, type PassMemo } from "./hrMasterFiling";
import { inductionDayOf, inductionFormOf, INDUCTION_STAFF_ID } from "./inductionDay";
import { deletionLog, startingData } from "./recordCrud";
import { withEditHistory } from "./recordHistory";
import { isEditableStatus, saveDraft } from "./recordLifecycle";
import { fieldLabels } from "./recordPatch";

// F/HR/05 FOR SUPERVISOR AND ABOVE, FILLED ON THE DAY THE OWNER ASSIGNS (REQUIREMENTS §303; the owner, 23-Nov-2026: "has name
// should come and filled by system automatically according to assigned date and day ... whenver i want it should be filled on
// that"). Nothing is made until a date is set on the document's page. From that day (the next working day when it is a holiday)
// each person in these roles has one form with their details and each topic's Planned Date. Actual Date and the signatures stay
// for the people who hold the induction. This is the owner's own exception to "nothing fills until it is opened" (§289).

const SUPERVISOR_AND_ABOVE = /\b(?:supervisor|team\s*leader|exe?cutive|exucutive|sr|senior|engineer|manager|mgr|hod|head|director|ceo)\b/i;

export const takesInductionForm = (p: Pick<HrMasterPerson, "designation" | "sources">): boolean =>
  SUPERVISOR_AND_ABOVE.test(p.designation ?? "") && roleOf(p) === "staff";

/** The day the forms are filled: the date set, moved to the next working day when the plant is closed on it. "" when none is set. */
export function inductionFillDay(master: MasterData = masterRepository.get()): string {
  const set = master.inductionFillDate ?? "";
  return isIsoDate(set) ? nextWorkingDay(set, master) : "";
}

export interface InductionStanding {
  /** Everyone on the sheet in these roles. */
  people: number;
  haveForm: number;
  /** Would get a form on the day. */
  toMake: HrMasterPerson[];
  /** Their joining day is still ahead, or the sheet has none: a form waits for it. */
  notJoined: number;
  /** A form HR deleted, which does not come back. */
  deleted: number;
}

const removedByHr = (person: HrMasterPerson, removed: string[]): boolean =>
  removed.some((who) => (!!person.gp3No.trim() && sameGp3(who, person.gp3No)) || namesPerson(who, person));

export function inductionStanding(today = todayISO()): InductionStanding {
  const people = hrMasterRepository.all().filter((p) => p.fullName.trim() && takesInductionForm(p));
  const removed = deletionLog(false).flatMap((d) => (d.documentId === INDUCTION_STAFF_ID && d.person ? [d.person] : []));
  const out: InductionStanding = { people: people.length, haveForm: 0, toMake: [], notJoined: 0, deleted: 0 };
  for (const person of people) {
    if (inductionFormOf(person)) out.haveForm++;
    else if (removedByHr(person, removed)) out.deleted++;
    else if (!isIsoDate(person.joiningDate) || person.joiningDate > today) out.notJoined++;
    else out.toMake.push(person);
  }
  return out;
}

/** On or after the assigned day: a form for everyone in these roles who has none. Returns how many were made. */
export function runInductionRound(today = todayISO()): number {
  const day = inductionFillDay();
  if (!day || day > today) return 0;
  const doc = documentRepository.getByIdUnscoped(INDUCTION_STAFF_ID);
  const layout = getLogSheetLayout(INDUCTION_STAFF_ID);
  const link = hrMasterLinkFor(INDUCTION_STAFF_ID);
  if (!doc || !layout || !link) return 0;
  const people = hrMasterRepository.all();
  const labels = fieldLabels(doc.kind, doc.id);
  const memo: PassMemo = new Map();
  const at = new Date().toISOString();
  const made: RecordInstance[] = [];
  for (const person of inductionStanding(today).toMake) {
    // Someone the sheet cannot tell from a namesake (no GP3 No.) waits, as on every other filing.
    if (placementsFor(person, people, false, memo).find((p) => p.target.docId === INDUCTION_STAFF_ID)?.standing.kind !== "start") continue;
    const blank = startingData(doc, today, false) as LogSheetData;
    const header: Record<string, string> = { ...blank.header };
    for (const f of link.fields) {
      const value = linkedValue(person, f);
      if (value) header[f.key] = value;
    }
    if (person.gp3No.trim()) header[HR_MASTER_TAG] = person.gp3No.trim();
    const record: RecordInstance<LogSheetData> = {
      id: generateId("rec"),
      documentId: doc.id,
      periodKey: `${doc.id}:${today}:${generateId("p")}`,
      dueDate: today,
      status: "In Progress",
      isDemo: false,
      data: blank,
      createdAt: at,
      updatedAt: at,
    };
    const data = followHeader(layout, undefined, { header, rows: blank.rows });
    made.push(withEditHistory(record, data, "DCRS", { action: "edited", note: `Filled from HR Master Data: ${describePerson(person)}`, labels }) as RecordInstance);
  }
  // One write for all of them: a save each would rewrite the whole record store once a person.
  recordRepository.upsertMany(made);
  if (made.length > 0) logActivity("Induction forms filled", `${doc.formatNo} ${doc.name}`, `${made.length} forms for Supervisor and above`, doc.id);
  return made.length;
}

// ---------------------------------------------------------------------------
// F/HR/06 takes the day from F/HR/05

const INDUCTIONS_ID = "hr-induction-operators";
const DATE_KEY = "dateOfJoiningInduction";
/** The date the system last wrote on a line: while the box still holds it, the box follows F/HR/05. A date typed over it stays. */
export const INDUCTION_MARK = "inductionAuto";

function personOfLine(row: LogSheetRow, people: HrMasterPerson[]): HrMasterPerson | null {
  const tag = String(row[HR_MASTER_TAG] ?? "").trim();
  return (tag ? people.find((p) => sameGp3(p.gp3No, tag)) : undefined) ?? personNamed(row.name, people);
}

/** An open F/HR/06, when a person opens it: each named line's induction date brought in line. A submitted or verified sheet stays. */
export function syncInductionDates(recordId: string): void {
  const record = recordRepository.getById(recordId) as RecordInstance<LogSheetData> | undefined;
  if (!record || record.isDemo || record.documentId !== INDUCTIONS_ID || !isEditableStatus(record.status)) return;
  const doc = documentRepository.getByIdUnscoped(INDUCTIONS_ID);
  if (!doc || !hrMasterLinkFor(INDUCTIONS_ID) || !Array.isArray(record.data?.rows)) return;
  const people = hrMasterRepository.all();
  let moved = false;
  let marked = false;
  const rows = record.data.rows.map((row) => {
    if (!String(row.name ?? "").trim()) return row;
    const person = personOfLine(row, people);
    const want = person ? writeDate(inductionDayOf(person), "dayFirst") : "";
    if (!person || !want) return row;
    const cell = String(row[DATE_KEY] ?? "").trim();
    const mark = String(row[INDUCTION_MARK] ?? "");
    const follows = cell === "" || cell === mark || parseWrittenDate(cell, "dmy") === person.joiningDate;
    if (!follows || (cell === want && mark === want)) return row;
    if (cell !== want) moved = true;
    marked = true;
    return { ...row, [DATE_KEY]: want, [INDUCTION_MARK]: want };
  });
  if (!marked || (!moved && (record.status === "Due" || record.status === "Scheduled"))) return;
  saveDraft(record, { ...record.data, rows }, "DCRS", { action: "edited", note: "Induction date taken from F/HR/05 Planned Date", labels: fieldLabels(doc.kind, doc.id) });
}
