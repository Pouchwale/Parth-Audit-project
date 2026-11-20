import type { DocumentDefinition, LogSheetData, LogSheetRow, MasterData, RecordInstance } from "../types";
import { documentRepository } from "../data/repositories/documentRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { settingsRepository } from "../data/repositories/settingsRepository";
import { autoFillRecord } from "./autoFill";
import { prepareKnownParts, PREPARED_NOTE } from "./knownParts";
import { ensureNearTermRecordsGenerated } from "./reminders";
import { fillsThroughYear } from "./recordGenerator";
import { diffRecordData, makeEntry } from "./recordHistory";
import { fieldLabels } from "./recordPatch";
import { supersededRevisionOf } from "./validation";
import { compareISO, todayISO } from "../utils/date";
import { mayWriteRecordsOf } from "./departmentScope";
import { fillScaleLinesDue, SCALE_DAY_NOTE } from "./nominalFill";
import { firstWeekDate } from "./calibrationWeeks";
import { withComputedCells } from "./computedCells";
import { bladeClosingBefore, bladeLineClosing, closedDayLine, isSharpMonthSheet, razorBladeRow, RAZOR_BLADE_DOCS, sharpIssueRows, sharpLineFigures, sharpLineHoldsFigure, sharpLineWritten, sharpSteadyLine, assistantsLine, lineFingerprint, ASSISTANT_LINE, sharpSheetAssistantOwn, SHARP_FILL_NOTE, SHARP_TOOL_DOCS, withMonthDays } from "./sharpTools";
import { getLogSheetLayout } from "../data/seed/logSheetLayouts";
import { blankLogRow } from "./recordDefaults";
import { dayInfo, effectiveDueDatesInMonth } from "./holidays";
import { untouchedByPeople } from "./calendarMigration";
import { periodKeyFor } from "./recordGenerator";

// Statuses in which a record is still an untouched shell the assistant may
// fill. "In Progress" is deliberately excluded: that means a person has
// started editing, and their partial work must never be overwritten.
const BLANK_STATUSES = ["Scheduled", "Due"] as const;
const CONFIRMED_STATUSES = ["Submitted", "Pending Verification", "Verified"] as const;

// The most recent record a real person confirmed for this document before
// the given date — the carry-forward source for the assistant. A record filled
// on a revision the format has since replaced (F/MNT/11's 2024 page, on Rev 00)
// is passed over: its boxes and columns are not this revision's, so there is
// nothing in it to carry into a sheet of the current one (REQUIREMENTS §74).
export function latestConfirmedRecord(documentId: string, beforeISO: string, isDemo: boolean): RecordInstance | undefined {
  return recordRepository
    // Unscoped: what to carry forward is a property of the register, not of
    // who is looking at it (engine/departmentScope.ts).
    .queryUnscoped({ documentId, isDemo })
    .filter(
      (r) =>
        CONFIRMED_STATUSES.includes(r.status as (typeof CONFIRMED_STATUSES)[number]) &&
        compareISO(r.dueDate, beforeISO) < 0 &&
        !supersededRevisionOf(r)
    )
    .sort((a, b) => compareISO(b.dueDate, a.dueDate))[0];
}

// "PREPARE MY RECORDS." Runs on app start and whenever the user comes back
// to the app, in the engine host on the server, and in the server's morning
// job: every Live record that is due today or earlier and still a blank shell
// gets its KNOWN PARTS from the assistant (engine/knownParts.ts: the record and
// its date, the fixed rows, the standing values, what truly carries forward;
// never a reading, a count, an answer or a signature, REQUIREMENTS §98) and
// moves to In Progress, stamped with what was filled and why, with a line in
// its history. Idempotent — a record is prepared at most once (the `prepared`
// stamp + status check), and a fresh shell for a future date is left blank
// until its day comes.
export function prepareDueRecords(referenceISO = todayISO()): RecordInstance[] {
  ensureNearTermRecordsGenerated(false);
  const master = masterRepository.get();
  // Unscoped: the assistant prepares the plant's due records whoever opened
  // the app — a department's paperwork must not go unprepared because nobody
  // from that department logged in today (engine/departmentScope.ts). The
  // briefing that SHOWS them is scoped, so each person still only sees their
  // own (engine/assistantBriefing.ts).
  // Of those, the documents the signed-in person may fill (REQUIREMENTS §96): the server's morning job prepares the
  // rest of the plant's, and refuses a change below Write from a browser (engine/departmentScope.ts).
  const docs = documentRepository.getRecordableUnscoped().filter((d) => mayWriteRecordsOf(d.id));
  const now = new Date().toISOString();
  const prepared: RecordInstance[] = [];
  // Same launch-date floor as the generator (ensureNearTermRecordsGenerated,
  // above, already called ensureRecordsGeneratedForMonth at least once, so
  // this is guaranteed set by now). A blank shell from before this browser's
  // launch date is backlog noise, not something actually due — it must NOT
  // get silently promoted to "In Progress" / surfaced as "ready for your OK"
  // on the very next load, before the Dashboard's cleanup banner is even
  // seen (see engine/backlogCleanup.ts, which only targets still-"Due"
  // records for exactly this reason).
  const { liveStartDate } = settingsRepository.get();

  // DRAFTS THE SIMULATION FILLED BEFORE 8-OCT-2026 (REQUIREMENTS §98). Until
  // then the prepare wrote plausible readings into Live drafts (engine/autoFill.ts).
  // A draft nobody has touched since still holds them, one click from being
  // submitted as somebody's observation. Each is prepared again by the rule:
  // the known parts kept, the made-up readings taken out, the change in its
  // history. A draft a person has worked on is never touched.
  for (const record of untouchedSimulatedDrafts()) {
    const doc = documentRepository.getByIdUnscoped(record.documentId);
    if (!doc || !mayWriteRecordsOf(doc.id)) continue;
    const result = prepareKnownParts(doc, record.dueDate, master, latestConfirmedRecord(doc.id, record.dueDate, false));
    if (!result) continue;
    const entry = makeEntry("prepared", "Assistant", { note: REPREPARED_NOTE, changes: diffRecordData(record.data, result.data, fieldLabels(doc.kind, doc.id)) });
    prepared.push({
      ...record,
      data: result.data,
      updatedAt: now,
      prepared: { at: now, by: "assistant", notes: result.notes, basedOn: result.basedOn, knownPartsOnly: true },
      history: [...(record.history ?? []), { ...entry, at: now }],
    });
  }

  for (const doc of docs) {
    const records = recordRepository
      .queryUnscoped({ documentId: doc.id, isDemo: false })
      .filter(
        (r) =>
          BLANK_STATUSES.includes(r.status as (typeof BLANK_STATUSES)[number]) &&
          !r.prepared &&
          // A year-long sheet made ahead of its year (the training plan calendar, REQUIREMENTS §164) is prepared as soon
          // as it is made: its known parts are the coming year's plan, wanted a month before the year begins.
          (compareISO(r.dueDate, referenceISO) <= 0 || (fillsThroughYear(doc) && doc.madeAheadDays !== undefined)) &&
          (!liveStartDate || compareISO(r.dueDate, liveStartDate) >= 0)
      )
      .sort((a, b) => compareISO(a.dueDate, b.dueDate));

    for (const record of records) {
      const previous = latestConfirmedRecord(doc.id, record.dueDate, false);
      const result = prepareKnownParts(doc, record.dueDate, master, previous);
      if (!result) continue;
      prepared.push(
        withPreparedEntry(
          {
            ...record,
            data: result.data,
            status: "In Progress",
            // updatedAt is stamped here (matching prepared.at exactly) rather
            // than left for upsertMany to fill in — upsertMany no longer
            // re-stamps it (see recordRepository.ts), specifically so this
            // equality is real and not two independent clock reads that happen
            // to be close together. findPreLaunchNoise() depends on it holding
            // for a genuinely untouched, just-prepared record.
            updatedAt: now,
            prepared: { at: now, by: "assistant", notes: result.notes, basedOn: result.basedOn, knownPartsOnly: true },
          },
          record.data,
          doc,
          now
        )
      );
    }
  }

  if (prepared.length > 0) recordRepository.upsertMany(prepared);

  // F/QC/12's WEEKS FILL ON THEIR DAY, by themselves (the owner, 30-Oct-2026): see fillScaleWeeksDue.
  // ...and the Sharp Objects & Blades sheets, from their master data and their stock (§254): see fillSharpToolsDue.
  const later = [...fillScaleWeeksDue(referenceISO), ...fillSharpToolsDue(referenceISO)];
  if (later.length === 0) return prepared;
  const ids = new Set(later.map((r) => r.id));
  return [...prepared.filter((r) => !ids.has(r.id)), ...later];
}

/**
 * THE SHARP OBJECTS & BLADES SHEETS, ONE A MONTH, A LINE FILLED EACH DAY (the owner, 17-Nov-2026, REQUIREMENTS §254; one
 * sheet a month, §259; engine/sharpTools.ts). Every open Live sheet of F/PRD/10, 22, 23 and 24 whose month has begun gets a
 * line for every date of the month, and each line dated `referenceISO` or earlier (and not before the system went live)
 * with nothing written on it is filled: F/PRD/10 and 23 shift I's people from the Sharp Objects Master Data (§258), F/PRD/22
 * and 24 the day's blades from the stock the line before closed with; a closed day says so. A line a person wrote on a day's
 * sheet from before §259 is laid on its date. A sheet still the assistant's own, nobody's since, is worked out again when
 * its figures are not the ones now due (the master data changed); a line a person wrote on is never touched. A line dated
 * later stays blank until its day. Run again it fills nothing. Returns the sheets changed.
 */
export function fillSharpToolsDue(referenceISO = todayISO()): RecordInstance[] {
  const { liveStartDate } = settingsRepository.get();
  const master = masterRepository.get();
  const now = new Date().toISOString();
  const changed: RecordInstance[] = [];
  for (const id of SHARP_TOOL_DOCS) {
    const doc = documentRepository.getByIdUnscoped(id);
    if (!doc || !mayWriteRecordsOf(doc.id)) continue;
    const all = recordRepository.queryUnscoped({ documentId: id, isDemo: false }).slice().sort((a, b) => compareISO(a.dueDate, b.dueDate));
    const blades = (RAZOR_BLADE_DOCS as readonly string[]).includes(id);
    const layout = getLogSheetLayout(id);
    if (!layout) continue;
    // The line a day's sheet from before §259 holds, by its date: a person's first, then the assistant's (its figures
    // stand; the day's sheet is then folded away, data/sharpMonthMigration.ts).
    const personLines = new Map<string, LogSheetRow>();
    const daySheets = all.filter((r) => !isSharpMonthSheet(r.data as LogSheetData | undefined) && !isMonthKeyOf(doc, r, master));
    for (const r of [...daySheets.filter((x) => !untouchedByPeople(x)), ...daySheets.filter((x) => untouchedByPeople(x))]) {
      for (const row of (r.data as LogSheetData | undefined)?.rows ?? []) {
        const d = String(row.date ?? "").slice(0, 10) || r.dueDate;
        if (sharpLineHoldsFigure(id, row) && !personLines.has(d)) personLines.set(d, row);
      }
    }
    for (let i = 0; i < all.length; i++) {
      const record = all[i];
      if (!["Scheduled", "Due", "In Progress"].includes(record.status)) continue;
      const month = record.dueDate.slice(0, 7);
      // A month's sheet only: the one the monthly schedule makes (due on the month's last working day), or a day's sheet
      // from before §259 holding its key. Every other day's sheet of a month the schedule covers is left (a person's) or
      // taken away at the start (data/sharpMonthMigration.ts).
      if (!isSharpMonthSheet(record.data as LogSheetData | undefined) && !isMonthKeyOf(doc, record, master)) continue;
      if (compareISO(`${month}-01`, referenceISO) > 0) continue;
      const own = sharpSheetAssistantOwn(record);
      const before = record.data as LogSheetData | undefined;
      const days = withMonthDays(id, before, month) ?? before;
      if (!days) continue;
      const rows = days.rows.map((r) => ({ ...r }));
      let carried: { ok: number; discarded: number } | null = blades ? bladeClosingBefore(all, `${month}-01`, record.id) : null;
      for (let k = 0; k < rows.length; k++) {
        const row = rows[k];
        const date = String(row.date ?? "").slice(0, 10);
        const due = date.slice(0, 7) === month && compareISO(date, referenceISO) <= 0 && (!liveStartDate || compareISO(date, liveStartDate) >= 0);
        const written = sharpLineWritten(id, row);
        // A line the assistant wrote and nobody has changed since (its mark, §261; or the paper's usual count it wrote on
        // every day on 20-Nov-2026 before §261) is its own to write again when the figures due are other.
        const steady = sharpSteadyLine(id, date);
        const mine = assistantsLine(id, row) || (!!steady && lineFingerprint(id, row) === lineFingerprint(id, steady) && !String(row.supervisorSign ?? "").trim());
        // A line written and not the assistant's to work out again: as it is, its stock carried to the next.
        if (!due || (written && !own && !mine)) {
          if (blades) carried = bladeLineClosing(row) ?? carried;
          continue;
        }
        let line: Partial<LogSheetRow> | null = null;
        const persons = personLines.get(date);
        const day = dayInfo(date, master);
        if (persons) line = sharpLineFigures(id, persons);
        else if (day.isHoliday) line = closedDayLine(id, date, day, carried);
        else if (blades) line = razorBladeRow(id, date, carried);
        else line = sharpIssueRows(id, date, master)?.[0] ?? null;
        if (!line) continue;
        const { id: _drop, ...figures } = line as LogSheetRow;
        void _drop;
        rows[k] = { ...blankLogRow(layout, row.id), ...figures, date };
        // Marked as the assistant's (§261), unless it is a line a day's sheet held: a person's stays a person's.
        if (!persons) rows[k][ASSISTANT_LINE] = lineFingerprint(id, rows[k]);
        if (blades) carried = bladeLineClosing(rows[k]) ?? carried;
      }
      const filled = withComputedCells(id, { header: { ...(days.header ?? {}) }, rows: rows as LogSheetData["rows"] });
      const all_changes = diffRecordData(record.data, filled, fieldLabels(doc.kind, doc.id));
      if (!all_changes?.length) continue;
      // (the assistant's mark on its lines is not shown in the history: it is never printed either)
      const changes = all_changes.filter((c) => !c.field.endsWith(ASSISTANT_LINE));
      const entry = { ...makeEntry("prepared", "Assistant", { note: SHARP_FILL_NOTE, ...(changes.length ? { changes } : {}) }), at: now };
      // Still the assistant's own work, nobody's yet (prepared.at = updatedAt): two copies of the month's sheet made in two
      // places merge into one (data/serverSync.ts withoutDuplicateBlanks), and a person's change wins over it.
      const next: RecordInstance = {
        ...record,
        data: filled,
        status: "In Progress",
        updatedAt: now,
        prepared: { at: now, by: "assistant", notes: [SHARP_FILL_NOTE], basedOn: blades ? "the blade stock the line before closed with" : "the Sharp Objects Master Data", knownPartsOnly: true },
        history: [...(record.history ?? []), entry],
      };
      // A sheet a person has written on stays theirs: the assistant's lines are added, the sheet not marked its own.
      if (!own && !untouchedByPeople(record)) next.prepared = record.prepared;
      all[i] = next;
      changed.push(next);
    }
  }
  if (changed.length > 0) recordRepository.upsertMany(changed);
  return changed;
}

/** Whether the record holds the key of its month's sheet (the monthly schedule's date for that month). */
function isMonthKeyOf(doc: DocumentDefinition, record: RecordInstance, master: MasterData): boolean {
  if (doc.schedule.type !== "monthly") return false;
  const [y, m] = record.dueDate.split("-").map(Number);
  return effectiveDueDatesInMonth(doc, y, m - 1, master).some((d) => record.periodKey === periodKeyFor(doc, d.scheduled));
}

const SCALE_ID = "qc-weight-scale-calibration";

/**
 * F/QC/12'S WEEKLY LINES FILLED ON THEIR DAY (the owner, 30-Oct-2026: "till today or upcoming date only it will fill the
 * form ... it should feel automatically"). Every open F/QC/12 sheet of the month that has begun gets its dates worked out
 * (the first line starts on the previous week's Next Due Date, engine/calibrationWeeks.ts; each line below on the Next Due
 * Date above it), and every line whose date is `referenceISO` or earlier and not yet read is filled by the index's
 * formulas (engine/nominalFill.ts) and marked to be confirmed: nobody's name goes on it, the person who answers for the
 * sheet confirms it (the notify job reminds them every day, engine/notificationPlan.ts). A line dated later stays blank
 * until its day comes. A sheet already filled for the day is left, so run again it fills nothing. Returns the sheets changed.
 */
export function fillScaleWeeksDue(referenceISO = todayISO()): RecordInstance[] {
  const doc = documentRepository.getByIdUnscoped(SCALE_ID);
  if (!doc || !mayWriteRecordsOf(doc.id)) return [];
  const { liveStartDate } = settingsRepository.get();
  const now = new Date().toISOString();
  const changed: RecordInstance[] = [];
  for (const record of recordRepository.queryUnscoped({ documentId: SCALE_ID, isDemo: false })) {
    if (!["Scheduled", "Due", "In Progress"].includes(record.status)) continue;
    if (compareISO(record.dueDate, referenceISO) > 0 || (liveStartDate && compareISO(record.dueDate, liveStartDate) < 0)) continue;
    const data = record.data as LogSheetData | undefined;
    if (!data || !Array.isArray(data.rows) || data.rows.length === 0) continue;
    // The dates first: the first line's, where nobody has written one, then the chain below it.
    const first = data.rows[0];
    const started = String(first.date ?? "").trim() ? data : { ...data, rows: [{ ...first, date: firstWeekDate(SCALE_ID, record) }, ...data.rows.slice(1)] };
    const dated = withComputedCells(SCALE_ID, started, data);
    const filled = fillScaleLinesDue(dated, referenceISO);
    if (!filled) continue;
    const after = withComputedCells(SCALE_ID, filled, dated);
    const entry = { ...makeEntry("prepared", "Assistant", { note: SCALE_DAY_NOTE, changes: diffRecordData(record.data, after, fieldLabels(doc.kind, doc.id)) }), at: now };
    if (!entry.changes?.length) delete entry.changes;
    changed.push({ ...record, data: after, status: "In Progress", updatedAt: now, history: [...(record.history ?? []), entry] });
  }
  if (changed.length > 0) recordRepository.upsertMany(changed);
  return changed;
}

/** The history line of a draft the simulation filled before 8-Oct-2026, prepared again by the rule. */
export const REPREPARED_NOTE = "Prepared again by the assistant: the known parts only. The readings an earlier version filled in were never observed, so they are taken out; the readings are the person's";

/**
 * Live drafts the earlier prepare filled with the simulation and nobody has touched since: In Progress,
 * prepared but not by the rule, saved last by the prepare itself (updatedAt is prepared.at), and no entry
 * in the history by a person.
 */
function untouchedSimulatedDrafts(): RecordInstance[] {
  return recordRepository
    .queryUnscoped({ isDemo: false })
    .filter(
      (r) =>
        r.status === "In Progress" &&
        !!r.prepared &&
        !r.prepared.knownPartsOnly &&
        r.updatedAt === r.prepared.at &&
        !(r.history ?? []).some((h) => h.action !== "prepared" && h.by !== "Assistant" && h.by !== "System")
    );
}

// THE HISTORY LINE OF A PREPARATION (REQUIREMENTS §98): who prepared it, the
// rule it was prepared by, and every box it wrote, before and after. Written
// into the record itself, so it stays when a person's own entries follow it.
// No activity-log line here: what the start-up does by itself is nobody's act
// (engine/recordHistory.ts logEntry), and the server's morning job writes its
// own one line for the day ("The assistant prepared N records").
function withPreparedEntry(record: RecordInstance, before: unknown, doc: { kind: string; id: string }, at: string): RecordInstance {
  const entry = { ...makeEntry("prepared", "Assistant", { note: PREPARED_NOTE, changes: diffRecordData(before, record.data, fieldLabels(doc.kind, doc.id)) }), at };
  if (!entry.changes?.length) delete entry.changes;
  return { ...record, history: [...(record.history ?? []), entry] };
}

// Lets the user ask the assistant to redo one record from scratch (e.g.
// after they cleared it). Only valid while the record is still a draft. A
// Live record gets the known parts again and nothing more (engine/knownParts.ts);
// a Demo Mode record is the simulation's (engine/autoFill.ts).
export function reprepareRecord(recordId: string): RecordInstance | undefined {
  const record = recordRepository.getById(recordId);
  if (!record || !["Scheduled", "Due", "In Progress", "Rejected"].includes(record.status)) return undefined;
  const doc = documentRepository.getByIdUnscoped(record.documentId);
  if (!doc) return undefined;
  const previous = latestConfirmedRecord(doc.id, record.dueDate, record.isDemo);
  const result = record.isDemo ? autoFillRecord(doc, record.dueDate, masterRepository.get(), previous) : prepareKnownParts(doc, record.dueDate, masterRepository.get(), previous);
  if (!result) return undefined;
  return recordRepository.upsert({
    ...record,
    data: result.data,
    status: "In Progress",
    prepared: { at: new Date().toISOString(), by: "assistant", notes: result.notes, basedOn: result.basedOn, ...(record.isDemo ? {} : { knownPartsOnly: true as const }) },
  });
}
