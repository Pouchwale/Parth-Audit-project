import type { DocumentDefinition, RecordInstance, ScheduleConfig } from "../types";
import { createRecordForDocument, recordCoveringDate } from "./recordCrud";
import { isRulerVerification } from "../data/seed/qcRulerVerificationLayouts";
import { slotOf } from "./rulerSlots";
import { isPscSurvey } from "./pscSurveyRound";
import { schedulePeriodOf } from "./frequencyEngine";
import { addDays, formatDisplayDate, todayISO } from "../utils/date";

// NEW RECORD: THIS PERIOD'S FIRST, THEN THE NEXT (REQUIREMENTS §211; the owner, 15-Nov-2026: "if user will click on new
// record then it should be open but it will tell user that this year record is not filled then only he can fill next
// year record", and, asked what New does once this year's is filled: "Start next year's record").
//
// On a document with a frequency, New opens the record of the period today falls in while it is not filled yet (not
// submitted, or reopened for correction, or sent back), and says so: that one first. Once it is filled, New starts the
// next period's record - next year's F/QC/17 - dated by the frequency (§208), which waits for its own day like any
// other (§201, the waits-for-day card says from when). An as-required document starts a record every time, as before.

const FILLED = new Set(["Submitted", "Pending Verification", "Verified"]);

/** Filled: handed in or signed off, and not reopened for correction. */
export const isFilledRecord = (r: RecordInstance): boolean => FILLED.has(r.status) && !r.correction;

/** "This year's" / "next year's" in the document's own frequency. */
export function periodWords(schedule: ScheduleConfig): { now: string; next: string } {
  switch (schedule.type) {
    case "yearly":
      return { now: "This year's", next: "next year's" };
    case "half-yearly":
      return { now: "This half-year's", next: "the next half-year's" };
    case "quarterly":
      return { now: "This quarter's", next: "next quarter's" };
    case "monthly":
      return { now: "This month's", next: "next month's" };
    case "fortnightly":
      return { now: "This fortnight's", next: "the next fortnight's" };
    case "weekly":
      return { now: "This week's", next: "next week's" };
    case "daily":
      return { now: "Today's", next: "tomorrow's" };
    default:
      return { now: "This period's", next: "the next period's" };
  }
}

export interface NewRecordResult {
  record: RecordInstance;
  existed: boolean;
  /** What the record page says about it when it opens, when there is something to say. */
  notice?: string;
}

/** What the New record button does (the document page, the library, the search). */
export function newRecordFromButton(doc: DocumentDefinition, isDemo: boolean, today: string = todayISO()): NewRecordResult {
  // F/HR/20: a form for one more person, every time (REQUIREMENTS §266; the year's round is made in January).
  if (doc.schedule.type === "as-required" || doc.kind === "training-record" || isPscSurvey(doc.id)) return createRecordForDocument(doc, { dateISO: today, isDemo });
  // F/QC/17: the first of the year's twenty not filled, else the next number (REQUIREMENTS §220).
  if (isRulerVerification(doc.id)) {
    const made = createRecordForDocument(doc, { dateISO: today, isDemo });
    const no = String(slotOf(made.record) ?? "").padStart(2, "0");
    return {
      ...made,
      // A new record every time New is pressed, as many as the person wants (REQUIREMENTS §245).
      notice: `Record ${no} added to this year's records.`,
    };
  }
  const words = periodWords(doc.schedule);
  let day = today;
  let filled: RecordInstance | null = null;
  // This period's, then the next one's; a third step only when the next is somehow signed already (a demo, say).
  for (let step = 0; step < 4; step++) {
    const period = schedulePeriodOf(doc, day);
    const on = recordCoveringDate(doc, day, isDemo);
    if (!on || !isFilledRecord(on) || !period) {
      const made = createRecordForDocument(doc, { dateISO: day, isDemo });
      if (step === 0) {
        if (!on || !period) return made;
        return {
          ...made,
          notice: `${words.now} record (dated ${formatDisplayDate(made.record.dueDate)}) is not filled yet. Fill it and submit it first: ${words.next} record can be started only after that.`,
        };
      }
      const nextUp = `${words.next.charAt(0).toUpperCase()}${words.next.slice(1)}`;
      return {
        ...made,
        notice: `${words.now} record (dated ${formatDisplayDate(filled!.dueDate)}) is filled, so this is ${words.next} record, dated ${formatDisplayDate(made.record.dueDate)}.${made.existed ? "" : ` ${nextUp} record is started.`}`,
      };
    }
    filled = on;
    day = addDays(period.to, 1);
  }
  return createRecordForDocument(doc, { dateISO: day, isDemo });
}

// THE WORDS, CARRIED TO THE RECORD PAGE: kept until the page that opens the record has read them (read twice in React's
// strict mode, so reading leaves them; the page forgets them once it is up).
const pending = new Map<string, string>();

export function noteOnOpen(recordId: string, text: string | undefined): void {
  pending.clear();
  if (text) pending.set(recordId, text);
}

export function peekNoteOnOpen(recordId: string | undefined): string | null {
  return recordId ? pending.get(recordId) ?? null : null;
}

export function forgetNoteOnOpen(recordId: string | undefined): void {
  if (recordId) pending.delete(recordId);
}
