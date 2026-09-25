import type {
  ComplaintChecklistData,
  DailyCheckpointDef,
  DailyPestMonitoringData,
  DocumentDefinition,
  FlyCatcherData,
  GapFinding,
  GapInspectionData,
  LogColumn,
  LogSheetData,
  LogSheetLayout,
  RecordInstance,
} from "../types";
import { TBC } from "../types";
import { getLogSheetLayout, getLogSheetLayoutForRecord } from "../data/seed/logSheetLayouts";
import { COMPLAINT_DOC_ID } from "../data/seed/complaintChecklist";
import { daysInMonth, formatDisplayDate, MONTH_NAMES, pad2, toISODate } from "../utils/date";
import { countFindings } from "./checkpoints";
import { departmentScopeLabel, isDocumentIdVisible, seesEveryDepartment } from "./departmentScope";
import { insightCounts, isHumanRecord, startInsights, type Insight, type InsightInput, type InsightRun } from "./insights";
import { breakdownLines, dayMonth, luxReadings, supplierStandings, type BreakdownLine } from "./insightRules";
import {
  grade as gradeOf,
  monthRange,
  scoreOf,
  scorecards,
  type DepartmentScore,
  type DocumentScore,
  type Grade,
  type ModuleScore,
  type Person,
  type PersonScore,
  type Scorecards,
} from "./performance";
import { actionForGrade, RM_PM_PERFORMANCE_ID } from "./purchaseRatings";
import { totalRodents } from "./rodentPattern";
import { isLotAccepted, isOutOfBand } from "./validation";

// THE MONTHLY MANAGEMENT SUMMARY (REQUIREMENTS §75) — a month of the plant's
// records read the way management reads a month: what was due and done, what
// went wrong, what is still open, in plain English, a page they can print.
//
// WORKED OUT BY CODE, NOT WRITTEN BY A MODEL. Every sentence is a fixed
// template filled with numbers counted here, so the same records always give
// the same words, the report works with no network, and a test can hold it to
// its figures. Nothing is estimated and no limit is invented.
//
// THE SAME ENGINES THE SCREENS USE, so the app never disagrees with itself:
//   record-keeping   engine/performance.ts scorecards — the Performance
//                    Scorecard's own rule (on time 1, late ½, never done 0),
//                    over the month's due dates, judged today
//   CAPA             the internal CAPA report's findings, read as B4 reads them
//                    (engine/insightRules.ts overdueCapaRule), and the customer
//                    complaint checklists (F/MKT/05)
//   quality          the lot status footer (engine/validation.ts isLotAccepted),
//                    the band each form prints (isOutOfBand, the rule the
//                    Lamination QC report and the submit check count with), and
//                    the calibration insights C3
//   maintenance      F/MNT/06's lines exactly as rule M3 reads them
//                    (breakdownLines, engine/maintenanceCalc.ts minutes), the PM
//                    plan against the actual with M6's seven days, glass
//                    breakage as M4 finds it, the lux rounds as M1 reads them
//   purchase         F/PUR/05's grade worked out from the three ratings by the
//                    form's own table (engine/purchaseRatings.ts)
//   pest control     the rodents the Rodent Trend adds up (data/selectors.ts
//                    rodentsInMonth's per-day count) and the register's
//                    check point findings (engine/checkpoints.ts)
//   insights         engine/insights.ts computeInsights, as of the month's end
//
// ONLY WHAT PEOPLE WROTE (engine/insights.ts isHumanRecord). Every figure below
// is read from records a person submitted, verified, sent back or edited —
// except record-keeping, which is the scorecard's own question: a blank sheet
// whose day passed with nobody handing it in is exactly what "never done"
// counts, so that part reads every record that fell due, as the Performance
// Scorecard does.
//
// "AS OF". A figure that is a state rather than an event — a CAPA finding past
// its target, an instrument out of calibration, the supplier grades, the
// insights — is read as it stood on the month's last day, over the records
// dated up to then; for the month still running it is read as it stands today.
// A month that has not begun has nothing to report and says so.
//
// DEPARTMENT SCOPE (REQUIREMENTS §40). The records and documents come in
// already scoped (recordRepository.query, documentRepository.getAll) and every
// document is checked again with isDocumentIdVisible. A part whose documents
// are all out of the person's departments is left out (null), and the headline
// says which departments the summary covers.
//
// SPEED (REQUIREMENTS §56). Pure — records, documents, accounts and today come
// in as arguments, nothing is read from storage but the layouts. A page takes
// it a slice at a time (startMonthlySummary, the house pattern of
// startInsights): one pass over the records, the insights run in its own
// slices, the scorecard, then the parts, which read only the month's records.

// ---------------------------------------------------------------------------
// what comes in and what goes out

export interface MonthlySummaryInput extends InsightInput {
  /**
   * The accounts the record-keeping part names (GET /api/users/directory, as
   * the Performance Scorecard reads them). null or left out while they are not
   * known — the part then says nobody can be named, and everything else stands.
   */
  people?: readonly Person[] | null;
  /** The daily pest control register's check points (MasterData.checkpoints), for its findings. */
  checkpoints?: DailyCheckpointDef[];
  /**
   * The plant's date of a moment (an ISO timestamp), as engine/latenessCore.ts
   * PlantCalendar.dateOf is: left out, it is this computer's own date
   * (utils/date.ts toISODate(new Date(stamp))), which in the plant's browsers IS
   * the plant's; a caller on a clock that runs in another zone passes
   * latenessCore's dateInZone for the plant's zone. Never the timestamp's first
   * ten characters — those are the date in UTC, where a complaint approved
   * between midnight and 05:30 in the plant falls on the day, and at a month's
   * turn in the month, before (REQUIREMENTS §75).
   */
  dateOf?: (stamp: string) => string | null;
}

/** A moment as a date on this computer's own clock; null when it is not a moment at all. */
function localDateOf(stamp: string): string | null {
  const when = new Date(stamp);
  return Number.isNaN(when.getTime()) ? null : toISODate(when);
}

/** Where the month stands against today. */
export type MonthState = "past" | "current" | "future";

interface Part {
  /** The part in plain English: fixed templates filled with the figures below. */
  sentences: string[];
  /** Nothing to report — the sentences say so in one honest line. */
  empty: boolean;
}

export interface RecordsPart extends Part {
  /** Records that fell due and are counted: on time + late + never done. */
  due: number;
  onTime: number;
  late: number;
  /** Fell due and never handed in — the scorecard's "overdue". */
  never: number;
  /** Not due yet — shown, never counted. */
  pending: number;
  score: number | null;
  grade: Grade;
  /** Modules and departments with anything due or to come, worst first. */
  byModule: ModuleScore[];
  byDepartment: DepartmentScore[];
  /** Up to three documents with something late or never done, worst first. */
  worstDocuments: DocumentScore[];
  /** Up to three accounts with the most late or never done; null when the accounts are not known. */
  peopleBehind: PersonScore[] | null;
}

export interface CapaPart extends Part {
  /** The internal CAPA report's findings; null when that report is outside the person's departments. */
  internal: {
    raised: number;
    closed: number;
    /** Open as of the month's end (or today, for the month still running). */
    open: number;
    /** Of those, past their target date. */
    overdue: number;
    oldestOverdue: { finding: string; targetDate: string; days: number; recordId: string } | null;
  } | null;
  /** Customer complaints (F/MKT/05); null when that checklist is outside the person's departments. */
  external: {
    received: number;
    approved: number;
    /** Received by the month's end and not yet approved by then. */
    openAtEnd: number;
    complaints: { recordId: string; complaintNo: string; customer: string; received: string; status: string }[];
  } | null;
}

export interface LotLine {
  documentId: string;
  formatNo: string;
  lots: number;
  accepted: number;
  onDeviation: number;
  rejected: number;
  segregated: number;
  /** Any other status written, e.g. a hold. */
  other: number;
}

export interface BandLine {
  documentId: string;
  formatNo: string;
  /** Readings outside the band the form prints. */
  readings: number;
  /** Sheets with at least one of them. */
  sheets: number;
}

export interface QualityPart extends Part {
  lots: LotLine[];
  lotsInspected: number;
  /** Every lot not simply "Accepted" — on deviation, rejected, segregated or anything else. */
  lotsNotAccepted: number;
  lotsOnDeviation: number;
  outOfBand: BandLine[];
  outOfBandReadings: number;
  outOfBandSheets: number;
  /** Sheets read that print a band at all — "every reading was in band" needs some. */
  bandedSheets: number;
  /** The C3 insights as of the month's end; null when no calibration record is the person's. */
  calibrationExpired: Insight[] | null;
  calibrationExpiring: Insight[] | null;
}

export interface MachineLine {
  machine: string;
  label: string;
  breakdowns: number;
  /** Minutes down on the lines whose minutes can be worked out. */
  minutes: number;
}

export interface MaintenancePart extends Part {
  /** F/MNT/06; null when it is not one of the person's documents. */
  breakdown: {
    breakdowns: number;
    /** Lines whose minutes can be worked out (both moments written, repair after failure). */
    timed: number;
    minutes: number;
    /** Mean time to repair, minutes: minutes ÷ timed lines; null with none timed. */
    mttr: number | null;
    lossMinutes: number;
    machines: MachineLine[];
  } | null;
  /**
   * F/MNT/03 for the month; null when not the person's. planned = done +
   * notDone + notYetDue. notDone is a PM with no Actual more than seven days
   * after its plan — rule M6's "not done"; notYetDue is one not yet counted
   * against anybody: planned after today, or planned within the last seven days
   * and not written yet, which M6 does not call a slip either.
   */
  pm: { scheduleWritten: boolean; planned: number; done: number; doneLate: number; notDone: number; notYetDue: number } | null;
  /** F/MNT/09; null when not the person's. */
  glass: { sheets: number; breakages: Insight[] } | null;
  /** F/MNT/11; null when not the person's. */
  lux: { rounds: number; areas: number; falls: Insight[] } | null;
}

export interface PurchasePart extends Part {
  /** The F/PUR/05 read — the latest written by the month's end. */
  sheet: { recordId: string; dueDate: string; inMonth: boolean } | null;
  a: number;
  b: number;
  c: number;
  ungraded: number;
  gradedC: { supplier: string; overall: string; action: string }[];
}

export interface PestPart extends Part {
  /** F/HR/17; null when not the person's. */
  daily: { daysRecorded: number; rodents: number; catchDays: number; findings: number } | null;
  /** F/HR/18; null when not the person's. */
  flies: { flies: number; visits: number } | null;
}

export interface InsightsPart extends Part {
  total: number;
  high: number;
  medium: number;
  low: number;
  /** The ten most severe, most severe first. */
  top: Insight[];
}

export interface MonthlySummary {
  year: number;
  month0: number;
  /** "August 2026". */
  label: string;
  from: string;
  to: string;
  /** The day the "as of" figures are read on: the month's last day, or today for the month still running. */
  asOf: string;
  state: MonthState;
  /** departmentScopeLabel(): "every department", "Maintenance", "Quality Control and Production". */
  scope: string;
  everyDepartment: boolean;
  /** Records people wrote that are dated in the month (isHumanRecord). */
  humanRecords: number;
  /** Three to five sentences, the part a manager reads first. */
  headline: string[];
  /** A part is null when every one of its documents is outside the person's departments. */
  records: RecordsPart | null;
  capa: CapaPart | null;
  quality: QualityPart | null;
  maintenance: MaintenancePart | null;
  purchase: PurchasePart | null;
  pest: PestPart | null;
  insights: InsightsPart;
}

// ---------------------------------------------------------------------------
// words

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isISO = (v: unknown): v is string => typeof v === "string" && ISO.test(v);
const text = (v: unknown): string => String(v ?? "").trim();
const fmt = (iso: string): string => formatDisplayDate(iso);

/**
 * 5376 → "5,376", 123456 → "1,23,456": the Indian grouping the plant writes,
 * by hand for the reason engine/insightRules.ts gives (the first
 * toLocaleString loads locale data on a slow laptop for the sake of a comma).
 */
function grouped(n: number): string {
  const digits = String(Math.abs(Math.round(n)));
  const sign = n < 0 ? "-" : "";
  if (digits.length <= 3) return sign + digits;
  const parts: string[] = [];
  let rest = digits.slice(0, -3);
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) parts.unshift(rest);
  return `${sign}${parts.join(",")},${digits.slice(-3)}`;
}
const plural = (n: number, one: string, many = `${one}s`): string => `${grouped(n)} ${n === 1 ? one : many}`;
/** "a", "a and b", "a, b and c". */
function listed(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Days from one ISO date to another, on the calendar (UTC, so no time zone moves it). */
function daysBetween(from: string, to: string): number {
  const day = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, (m ?? 1) - 1, d ?? 1) / 86400000;
  };
  return day(to) - day(from);
}

/** A document's format number, or its name where the number is still to be confirmed. */
const calledBy = (doc: DocumentDefinition | undefined, fallback: string): string =>
  doc ? (doc.formatNo && doc.formatNo !== TBC && !doc.formatNo.toUpperCase().startsWith("TO BE") ? doc.formatNo : doc.name) : fallback;

// ---------------------------------------------------------------------------
// the documents each part reads

const GAP_ID = "gap-inspection";
const DAILY_PEST_ID = "daily-pest-monitoring";
const FLY_ID = "fly-catcher";
const BREAKDOWN_ID = "mnt-breakdown-record";
const YEARLY_PM_ID = "mnt-yearly-pm-schedule";
const GLASS_ID = "mnt-glass-breakage";
const LUX_ID = "mnt-lux-level";
/** M6's rule: a PM done more than this many days after its plan is a slip (engine/insightRules.ts pmSlipRule). */
const PM_SLIP_DAYS = 7;
const PM_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const TOP_INSIGHTS = 10;

/** The part of the month's figures a department account may see. */
interface Seen {
  docs: Map<string, DocumentDefinition>;
  visible: (documentId: string) => boolean;
}

// ---------------------------------------------------------------------------
// the run

/** A summary worked out a slice at a time. */
export interface MonthlySummaryRun {
  /** Does at most about `budgetMs` of work; the summary once it is complete, null until then. */
  step(budgetMs?: number): MonthlySummary | null;
}

/** The month's own dates and where it stands against today. */
export function monthFrame(
  year: number,
  month0: number,
  today: string
): { year: number; month0: number; label: string; from: string; to: string; asOf: string; state: MonthState } {
  const from = `${year}-${pad2(month0 + 1)}-01`;
  const to = `${year}-${pad2(month0 + 1)}-${pad2(daysInMonth(year, month0))}`;
  const state: MonthState = today > to ? "past" : today < from ? "future" : "current";
  // A month still running is read as it stands today; one not begun has no
  // "end" yet, so what little it says is as of today too.
  return { year, month0, label: `${MONTH_NAMES[month0]} ${year}`, from, to, asOf: state === "past" ? to : today, state };
}

/**
 * Starts working out one month's summary, to be taken a slice at a time. The
 * work, in order: one pass over the records (the month's, the human ones by
 * document, and those dated up to the month's end for the insights), the
 * insights run in its own slices, the scorecard, then the parts and the
 * headline. computeMonthlySummary is the same run in one go.
 */
export function startMonthlySummary(input: MonthlySummaryInput, year: number, month0: number): MonthlySummaryRun {
  const frame = monthFrame(year, month0, input.today);
  const { from, to, asOf, state } = frame;

  const docs = new Map<string, DocumentDefinition>();
  for (const d of input.documents) if (isDocumentIdVisible(d.id, d.formatNo)) docs.set(d.id, d);
  const seen: Seen = { docs, visible: (id) => docs.has(id) };

  // Filled by the first pass.
  const monthRecords: RecordInstance[] = [];
  const humanByDoc = new Map<string, RecordInstance[]>();
  // For a month that has ended, the insights read only what had been dated by
  // its last day; for the month still running they read every record, as the
  // Insights page does, so the two say the same thing today.
  const upTo: RecordInstance[] | null = state === "past" ? [] : null;
  let humanInMonth = 0;
  let index = 0;
  let read = false;

  let insightRun: InsightRun | null = null;
  let insights: Insight[] | null = state === "future" ? [] : null;
  let cards: Scorecards | null = null;
  let result: MonthlySummary | null = null;

  return {
    step(budgetMs = 8): MonthlySummary | null {
      if (result) return result;
      const deadline = performance.now() + budgetMs;

      if (!read) {
        const records = input.records;
        while (index < records.length) {
          const r = records[index++];
          if (r.isDemo === input.isDemo && seen.visible(r.documentId)) {
            const inMonth = r.dueDate >= from && r.dueDate <= to;
            if (inMonth) monthRecords.push(r);
            if (upTo && r.dueDate <= asOf) upTo.push(r);
            if (isHumanRecord(r, input.liveStartDate)) {
              let list = humanByDoc.get(r.documentId);
              if (!list) humanByDoc.set(r.documentId, (list = []));
              list.push(r);
              if (inMonth) humanInMonth += 1;
            }
          }
          if ((index & 255) === 0 && performance.now() > deadline) return null;
        }
        for (const list of humanByDoc.values()) list.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0));
        read = true;
        if (performance.now() > deadline) return null;
      }

      // The scorecard and the parts cannot be cut into smaller pieces, so each
      // has a slice of its own. Measured over a demo year (3,031 records, about
      // 300 in a month), on a desktop: the scorecard about 2 ms, the parts about
      // 2 ms — some 12 ms each at six times slower, under a frame. The one
      // exception is the first scorecard of a session, about 20 ms: its
      // tie-break sort's first localeCompare loads the locale data, a cost paid
      // once by whichever screen sorts by name first.
      if (!insights) {
        if (!insightRun) insightRun = startInsights({ ...input, records: upTo ?? input.records, today: asOf });
        insights = insightRun.step(Math.max(1, deadline - performance.now()));
        return null;
      }

      if (!cards) {
        const people = input.people ?? [];
        cards = scorecards(monthRecords, [...docs.values()], people, monthRange(year, month0, frame.label), input.today, {
          isClosedDay: input.isClosedDay ?? (() => false),
          countedFrom: input.isDemo ? null : input.liveStartDate,
        });
        if (budgetMs !== Number.POSITIVE_INFINITY) return null;
      }

      result = assemble(input, frame, seen, humanByDoc, humanInMonth, cards, insights);
      return result;
    },
  };
}

/** The whole summary in one go — for callers already off the drawing path (a test, Mitra). A page takes startMonthlySummary a slice at a time. */
export function computeMonthlySummary(input: MonthlySummaryInput, year: number, month0: number): MonthlySummary {
  const run = startMonthlySummary(input, year, month0);
  let out = run.step(Number.POSITIVE_INFINITY);
  while (!out) out = run.step(Number.POSITIVE_INFINITY);
  return out;
}

// ---------------------------------------------------------------------------
// the parts

type Frame = ReturnType<typeof monthFrame>;

function assemble(
  input: MonthlySummaryInput,
  frame: Frame,
  seen: Seen,
  humanByDoc: Map<string, RecordInstance[]>,
  humanInMonth: number,
  cards: Scorecards,
  insights: Insight[]
): MonthlySummary {
  const human = (documentId: string): RecordInstance[] => (seen.visible(documentId) ? humanByDoc.get(documentId) ?? [] : []);
  const inMonth = (iso: string): boolean => iso >= frame.from && iso <= frame.to;
  const monthHuman = (documentId: string): RecordInstance[] => human(documentId).filter((r) => inMonth(r.dueDate));

  const records = recordsPart(input, frame, seen, cards);
  const capa = capaPart(frame, seen, human, inMonth, input.dateOf ?? localDateOf);
  const quality = qualityPart(frame, seen, humanByDoc, inMonth, insights);
  const maintenance = maintenancePart(frame, seen, human, monthHuman, inMonth, insights, input.today);
  const purchase = purchasePart(frame, seen, human, inMonth);
  const pest = pestPart(input, frame, seen, monthHuman);
  const insightsSummary = insightsPart(frame, insights);

  const everyDepartment = seesEveryDepartment();
  const scope = departmentScopeLabel();
  const summary: MonthlySummary = {
    year: frame.year,
    month0: frame.month0,
    label: frame.label,
    from: frame.from,
    to: frame.to,
    asOf: frame.asOf,
    state: frame.state,
    scope,
    everyDepartment,
    humanRecords: humanInMonth,
    headline: [],
    records,
    capa,
    quality,
    maintenance,
    purchase,
    pest,
    insights: insightsSummary,
  };
  summary.headline = headlineOf(summary);
  return summary;
}

/** "at the month's end (31-Aug-2026)" / "as of today (24-Sep-2026)". */
const asOfPhrase = (frame: Frame): string => (frame.state === "past" ? `at the month's end (${fmt(frame.asOf)})` : `as of today (${fmt(frame.asOf)})`);
const notBegun = (frame: Frame): string => `${frame.label} has not begun yet, so nothing has been recorded for it.`;

// ---- record-keeping ----------------------------------------------------------

function recordsPart(input: MonthlySummaryInput, frame: Frame, seen: Seen, cards: Scorecards): RecordsPart | null {
  if (![...seen.docs.values()].some((d) => !d.isReferenceOnly)) return null;
  // Every document is in exactly one department, so the departments add up to
  // the plant — the Performance Scorecard's own total (pages/PerformancePage.tsx).
  let onTime = 0;
  let late = 0;
  let never = 0;
  let pending = 0;
  for (const d of cards.byDepartment) {
    onTime += d.onTime;
    late += d.late;
    never += d.overdue;
    pending += d.pending;
  }
  const due = onTime + late + never;
  const score = scoreOf(onTime, late, never);
  const g = gradeOf(score);
  const byModule = cards.byModule.filter((m) => m.due + m.pending > 0);
  const byDepartment = cards.byDepartment.filter((d) => d.due + d.pending > 0);
  const worstDocuments = cards.byDocument.filter((d) => d.late + d.overdue > 0).slice(0, 3);
  const peopleKnown = Array.isArray(input.people);
  const peopleBehind = peopleKnown
    ? cards.byPerson
        .filter((p) => p.answers && p.late + p.overdue > 0)
        // Not localeCompare: its first call loads locale data (engine/insights.ts says why that matters).
        .sort((a, b) => b.late + b.overdue - (a.late + a.overdue) || b.overdue - a.overdue || (a.person.name < b.person.name ? -1 : a.person.name > b.person.name ? 1 : 0))
        .slice(0, 3)
    : null;

  const sentences: string[] = [];
  let empty = false;
  if (due === 0) {
    empty = pending === 0;
    sentences.push(
      pending > 0
        ? `Nothing had fallen due in ${frame.label} yet; ${plural(pending, "record is", "records are")} still to come.`
        : `No record fell due in ${frame.label}.`
    );
  } else {
    sentences.push(
      `${grouped(onTime)} of ${plural(due, "record")} that fell due in ${frame.label} ${onTime === 1 ? "was" : "were"} handed in on time, ${grouped(late)} late and ${grouped(never)} never done` +
        `${pending > 0 ? ` (${grouped(pending)} more not due yet)` : ""} — a score of ${score} out of 100, ${g.label.toLowerCase()}.`
    );
    sentences.push("The score counts a record on time as 1, late as ½ and never done as 0 — the Performance Scorecard's rule.");
    const scoredModules = byModule.filter((m) => m.due > 0);
    if (scoredModules.length > 1) {
      const worst = scoredModules[0];
      const best = scoredModules[scoredModules.length - 1];
      sentences.push(
        worst.score === best.score
          ? `Every module scored ${worst.score}.`
          : `By module, ${worst.module} scored lowest (${worst.score}: ${worst.onTime} of ${worst.due} on time) and ${best.module} highest (${best.score}).`
      );
    }
    if (worstDocuments.length > 0) {
      const named = worstDocuments.map((d) => {
        const bits = [d.overdue > 0 ? `${grouped(d.overdue)} never done` : "", d.late > 0 ? `${grouped(d.late)} late` : ""].filter(Boolean).join(", ");
        return `${calledBy(d.doc, d.doc.id)} (${bits})`;
      });
      sentences.push(`Most behind: ${listed(named)}.`);
    } else {
      sentences.push("Nothing that fell due was late or missed.");
    }
    if (peopleBehind === null) {
      sentences.push("Nobody is named here: the list of accounts has not been read.");
    } else if (peopleBehind.length > 0) {
      const named = peopleBehind.map((p) => `${p.person.name} (${[p.late ? `${grouped(p.late)} late` : "", p.overdue ? `${grouped(p.overdue)} never done` : ""].filter(Boolean).join(", ")})`);
      sentences.push(`Most often late or missing: ${listed(named)}.`);
    } else if (cards.byPerson.some((p) => p.answers)) {
      sentences.push("Nobody who answers for these documents was late or missed one.");
    }
  }
  return { sentences, empty, due, onTime, late, never, pending, score, grade: g, byModule, byDepartment, worstDocuments, peopleBehind };
}

// ---- CAPA ------------------------------------------------------------------------

function capaPart(
  frame: Frame,
  seen: Seen,
  human: (documentId: string) => RecordInstance[],
  inMonth: (iso: string) => boolean,
  dateOf: (stamp: string) => string | null
): CapaPart | null {
  const internalSeen = seen.visible(GAP_ID);
  const externalSeen = seen.visible(COMPLAINT_DOC_ID);
  if (!internalSeen && !externalSeen) return null;
  const sentences: string[] = [];
  if (frame.state === "future") return { sentences: [notBegun(frame)], empty: true, internal: null, external: null };
  const at = asOfPhrase(frame);

  let internal: CapaPart["internal"] = null;
  if (internalSeen) {
    let raised = 0;
    let closed = 0;
    let open = 0;
    let overdue = 0;
    let oldest: NonNullable<CapaPart["internal"]>["oldestOverdue"] = null;
    for (const record of human(GAP_ID) as RecordInstance<GapInspectionData>[]) {
      const inspected = isISO(record.data?.inspectionDate) ? record.data.inspectionDate : record.dueDate;
      for (const f of (record.data?.findings ?? []) as GapFinding[]) {
        if (inMonth(inspected)) raised += 1;
        const closedOn = isISO(f.actualDateOfAction) ? f.actualDateOfAction : null;
        if (closedOn && inMonth(closedOn)) closed += 1;
        if (inspected > frame.asOf) continue;
        // Open on the day read: B4's own test (no action date, not Closed or
        // Verified) for the month still running; for a month that has ended, a
        // finding closed only afterwards was still open at its end.
        const isClosed = closedOn
          ? closedOn <= frame.asOf || frame.state !== "past"
          : f.status === "Closed" || f.status === "Verified" || !!f.actualDateOfAction;
        if (isClosed) continue;
        open += 1;
        if (isISO(f.targetDate) && f.targetDate < frame.asOf) {
          overdue += 1;
          const days = daysBetween(f.targetDate, frame.asOf);
          if (!oldest || days > oldest.days) oldest = { finding: text(f.findingOfInspection), targetDate: f.targetDate, days, recordId: record.id };
        }
      }
    }
    internal = { raised, closed, open, overdue, oldestOverdue: oldest };
    if (raised + closed + open === 0) sentences.push(`No CAPA finding was raised or closed in ${frame.label}, and none was open ${at}.`);
    else {
      sentences.push(
        `Internal CAPA: ${plural(raised, "finding")} raised and ${grouped(closed)} closed in ${frame.label}; ${grouped(open)} open ${at}, ${grouped(overdue)} of ${open === 1 ? "it" : "them"} past the target date.`
      );
      if (oldest) {
        const clipped = oldest.finding.length > 90 ? `${oldest.finding.slice(0, 89).trimEnd()}…` : oldest.finding;
        sentences.push(`The oldest past its target: "${clipped}", target ${fmt(oldest.targetDate)} — ${plural(oldest.days, "day")} before ${fmt(frame.asOf)}.`);
      }
    }
  }

  let external: CapaPart["external"] = null;
  if (externalSeen) {
    const complaints: NonNullable<CapaPart["external"]>["complaints"] = [];
    let received = 0;
    let approved = 0;
    let openAtEnd = 0;
    for (const r of human(COMPLAINT_DOC_ID) as RecordInstance<ComplaintChecklistData>[]) {
      const on = isISO(r.data?.complaintReceivedDate) ? r.data.complaintReceivedDate : r.dueDate;
      // Approved on the plant's date of the moment it was verified — a checklist
      // verified at 01:30 on 1-Aug in the plant is 20:00 on 31-Jul in UTC, and
      // was August's approval and still open at July's end (REQUIREMENTS §75).
      const approvedOn = r.status === "Verified" ? (r.verifiedAt ? dateOf(r.verifiedAt) ?? on : on) : null;
      if (approvedOn && inMonth(approvedOn)) approved += 1;
      if (on > frame.asOf) continue;
      if (inMonth(on)) {
        received += 1;
        complaints.push({ recordId: r.id, complaintNo: text(r.data?.complaintNo), customer: text(r.data?.customerName), received: on, status: r.status });
      }
      if (!approvedOn || approvedOn > frame.asOf) openAtEnd += 1;
    }
    external = { received, approved, openAtEnd, complaints };
    const fno = calledBy(seen.docs.get(COMPLAINT_DOC_ID), "F/MKT/05");
    sentences.push(
      received + approved + openAtEnd === 0
        ? `No customer complaint (${fno}) was received in ${frame.label}, and none was open ${at}.`
        : `Customer complaints (${fno}): ${grouped(received)} received and ${grouped(approved)} approved in ${frame.label}; ${grouped(openAtEnd)} open ${at}.`
    );
  }

  const empty = (!internal || internal.raised + internal.closed + internal.open === 0) && (!external || external.received + external.approved + external.openAtEnd === 0);
  return { sentences, empty, internal, external };
}

// ---- quality -------------------------------------------------------------------

/** A column that prints a band a reading can fall outside — the columns isOutOfBand can flag. */
const isBandColumn = (c: LogColumn): boolean => c.type === "number" && (c.min !== undefined || c.max !== undefined);

function qualityPart(
  frame: Frame,
  seen: Seen,
  humanByDoc: Map<string, RecordInstance[]>,
  inMonth: (iso: string) => boolean,
  insights: Insight[]
): QualityPart | null {
  // The quality documents a person sees: Quality Control's (and Lamination QC's)
  // modules, and any other sheet that prints a band or a lot status.
  const qualityDocs = [...seen.docs.values()].filter((d) => /quality/i.test(d.module));
  const calibrationDocs = [...seen.docs.values()].filter((d) => d.kind === "log-sheet" && !!getLogSheetLayout(d.id)?.headerFields.some((f) => f.key === "calibrationExpiry"));

  const lots: LotLine[] = [];
  const outOfBand: BandLine[] = [];
  let bandedSheets = 0;
  // One layout per document and revision in a run, as the insights read them.
  const layouts = new Map<string, { layout: LogSheetLayout | undefined; bands: LogColumn[] }>();
  const layoutOf = (r: RecordInstance) => {
    const k = `${r.documentId}|${r.formatRevision ?? ""}`;
    let hit = layouts.get(k);
    if (!hit) {
      const layout = getLogSheetLayoutForRecord(r.documentId, r);
      layouts.set(k, (hit = { layout, bands: layout ? layout.columns.filter(isBandColumn) : [] }));
    }
    return hit;
  };

  if (frame.state !== "future") {
    for (const [documentId, list] of humanByDoc) {
      const doc = seen.docs.get(documentId);
      if (!doc || doc.kind !== "log-sheet") continue;
      const lot: LotLine = { documentId, formatNo: calledBy(doc, documentId), lots: 0, accepted: 0, onDeviation: 0, rejected: 0, segregated: 0, other: 0 };
      const band: BandLine = { documentId, formatNo: lot.formatNo, readings: 0, sheets: 0 };
      for (const r of list) {
        if (!inMonth(r.dueDate)) continue;
        const data = r.data as LogSheetData | undefined;
        const status = text(data?.header?.lotStatus);
        if (status) {
          lot.lots += 1;
          if (isLotAccepted(status)) lot.accepted += 1;
          else if (/deviation/i.test(status)) lot.onDeviation += 1;
          else if (/reject|scrap/i.test(status)) lot.rejected += 1;
          else if (/segregat/i.test(status)) lot.segregated += 1;
          else lot.other += 1;
        }
        const { bands } = layoutOf(r);
        if (bands.length === 0 || !Array.isArray(data?.rows)) continue;
        bandedSheets += 1;
        // engine/validation.ts logSheetOutOfBandCount, with the layout looked up once.
        let n = 0;
        for (const row of data.rows) for (const col of bands) if (isOutOfBand(col, row[col.key])) n += 1;
        if (n > 0) {
          band.readings += n;
          band.sheets += 1;
        }
      }
      if (lot.lots > 0) lots.push(lot);
      if (band.readings > 0) outOfBand.push(band);
    }
  }
  if (qualityDocs.length === 0 && calibrationDocs.length === 0 && lots.length === 0 && outOfBand.length === 0) return null;

  const notAccepted = (l: LotLine) => l.lots - l.accepted;
  lots.sort((a, b) => notAccepted(b) - notAccepted(a) || b.lots - a.lots || (a.formatNo < b.formatNo ? -1 : 1));
  outOfBand.sort((a, b) => b.readings - a.readings || (a.formatNo < b.formatNo ? -1 : 1));
  const lotsInspected = lots.reduce((n, l) => n + l.lots, 0);
  const lotsNotAccepted = lots.reduce((n, l) => n + notAccepted(l), 0);
  const lotsOnDeviation = lots.reduce((n, l) => n + l.onDeviation, 0);
  const rejected = lots.reduce((n, l) => n + l.rejected, 0);
  const segregated = lots.reduce((n, l) => n + l.segregated, 0);
  const outOfBandReadings = outOfBand.reduce((n, b) => n + b.readings, 0);
  const outOfBandSheets = outOfBand.reduce((n, b) => n + b.sheets, 0);

  // C3 as of the month's end: HIGH is an instrument past its expiry, LOW one expiring within 30 days.
  const calibrationSeen = calibrationDocs.length > 0;
  const c3 = insights.filter((i) => i.rule === "C3");
  const calibrationExpired = calibrationSeen ? c3.filter((i) => i.severity === "high") : null;
  const calibrationExpiring = calibrationSeen ? c3.filter((i) => i.severity !== "high") : null;

  const sentences: string[] = [];
  if (frame.state === "future") return { sentences: [notBegun(frame)], empty: true, lots, lotsInspected: 0, lotsNotAccepted: 0, lotsOnDeviation: 0, outOfBand, outOfBandReadings: 0, outOfBandSheets: 0, bandedSheets: 0, calibrationExpired: null, calibrationExpiring: null };

  if (lotsInspected === 0) sentences.push(`No lot inspection with a lot status was written in ${frame.label}.`);
  else {
    const how = [lotsOnDeviation ? `${grouped(lotsOnDeviation)} accepted on deviation` : "", rejected ? `${grouped(rejected)} rejected or scrapped` : "", segregated ? `${grouped(segregated)} segregated` : ""].filter(Boolean);
    const other = lotsNotAccepted - lotsOnDeviation - rejected - segregated;
    if (other > 0) how.push(`${grouped(other)} with another status`);
    sentences.push(
      lotsNotAccepted === 0
        ? `${plural(lotsInspected, "lot")} inspected in ${frame.label}, every one accepted.`
        : `${plural(lotsInspected, "lot")} inspected in ${frame.label}; ${grouped(lotsNotAccepted)} not simply accepted — ${listed(how)}.` +
            (lots[0] && notAccepted(lots[0]) > 0 ? ` The most on ${lots[0].formatNo} (${notAccepted(lots[0])} of ${lots[0].lots}).` : "")
    );
  }
  if (outOfBandReadings > 0) {
    const top = outOfBand.slice(0, 3).map((b) => `${b.formatNo} ${grouped(b.readings)}`);
    sentences.push(`${plural(outOfBandReadings, "reading")} outside the band the form prints, on ${plural(outOfBandSheets, "sheet")}: ${listed(top)}.`);
  } else if (bandedSheets > 0) {
    sentences.push(`Every reading written on the ${plural(bandedSheets, "sheet")} that print a band was inside it.`);
  } else {
    sentences.push(`No sheet that prints a band for its readings was written in ${frame.label}.`);
  }
  if (calibrationExpired && calibrationExpiring) {
    sentences.push(
      calibrationExpired.length + calibrationExpiring.length === 0
        ? `No instrument's calibration had expired or was due within 30 days ${asOfPhrase(frame)}.`
        : `Calibration ${asOfPhrase(frame)}: ${
            calibrationExpired.length === 0 ? "no instrument" : plural(calibrationExpired.length, "instrument")
          } past ${calibrationExpired.length > 1 ? "their" : "its"} expiry date and ${calibrationExpiring.length === 0 ? "none" : grouped(calibrationExpiring.length)} expiring within 30 days.`
    );
  }
  const empty = lotsInspected === 0 && outOfBandReadings === 0 && bandedSheets === 0 && (calibrationExpired?.length ?? 0) + (calibrationExpiring?.length ?? 0) === 0;
  return {
    sentences,
    empty,
    lots,
    lotsInspected,
    lotsNotAccepted,
    lotsOnDeviation,
    outOfBand,
    outOfBandReadings,
    outOfBandSheets,
    bandedSheets,
    calibrationExpired,
    calibrationExpiring,
  };
}

// ---- maintenance -------------------------------------------------------------

function maintenancePart(
  frame: Frame,
  seen: Seen,
  human: (documentId: string) => RecordInstance[],
  monthHuman: (documentId: string) => RecordInstance[],
  inMonth: (iso: string) => boolean,
  insights: Insight[],
  today: string
): MaintenancePart | null {
  if (![...seen.docs.keys()].some((id) => id.startsWith("mnt-"))) return null;
  if (frame.state === "future") return { sentences: [notBegun(frame)], empty: true, breakdown: null, pm: null, glass: null, lux: null };
  const sentences: string[] = [];
  const name = (id: string, fallback: string) => calledBy(seen.docs.get(id), fallback);

  // ---- F/MNT/06: the month's breakdowns, by the day each machine failed ----
  let breakdown: MaintenancePart["breakdown"] = null;
  if (seen.visible(BREAKDOWN_ID)) {
    const lines: BreakdownLine[] = [];
    for (const r of human(BREAKDOWN_ID)) for (const l of breakdownLines(r)) if (inMonth(l.date)) lines.push(l);
    let minutes = 0;
    let timed = 0;
    let lossMinutes = 0;
    const byMachine = new Map<string, MachineLine>();
    for (const l of lines) {
      const ok = l.span !== null && l.span >= 0;
      if (ok) {
        minutes += l.span as number;
        timed += 1;
      }
      lossMinutes += l.loss ?? 0;
      let m = byMachine.get(l.machine);
      if (!m) byMachine.set(l.machine, (m = { machine: l.machine, label: l.machine, breakdowns: 0, minutes: 0 }));
      m.breakdowns += 1;
      if (ok) m.minutes += l.span as number;
      if (l.name) m.label = `${l.machine} (${l.name})`;
    }
    const machines = [...byMachine.values()].sort((a, b) => b.breakdowns - a.breakdowns || b.minutes - a.minutes || (a.machine < b.machine ? -1 : 1)).slice(0, 3);
    const mttr = timed > 0 ? minutes / timed : null;
    breakdown = { breakdowns: lines.length, timed, minutes, mttr, lossMinutes, machines };
    const fno = name(BREAKDOWN_ID, "F/MNT/06");
    if (lines.length === 0) sentences.push(`No breakdown was written on ${fno} in ${frame.label}.`);
    else {
      const untimed = lines.length - timed;
      sentences.push(
        `Machines broke down ${lines.length === 1 ? "once" : lines.length === 2 ? "twice" : `${grouped(lines.length)} times`} in ${frame.label} (${fno}): ${plural(minutes, "minute")} down in all` +
          (mttr !== null ? `, ${grouped(mttr)} minutes on average to repair (MTTR)` : "") +
          (untimed > 0 ? `; ${plural(untimed, "line")} without both moments written ${untimed === 1 ? "is" : "are"} counted but not timed` : "") +
          `; production lost ${plural(lossMinutes, "minute")}.`
      );
      const top = machines.filter((m) => m.breakdowns > 1 || machines.length === 1);
      if (top.length > 0) sentences.push(`Most breakdowns: ${listed(top.map((m) => `${m.label} — ${plural(m.breakdowns, "breakdown")}, ${grouped(m.minutes)} min`))}.`);
    }
  }

  // ---- F/MNT/03: the PM planned for this month against what was done ----
  // NOT DONE IS M6'S "NOT DONE" (REQUIREMENTS §75): a PM with no Actual counts
  // as not done only once more than PM_SLIP_DAYS have passed since its plan,
  // the week engine/insightRules.ts pmSlipRule allows before it calls a PM
  // missed — so a job planned for today, or three days ago, is not reported
  // "not done" here while the Insights page says nothing about it. The week is
  // counted to today, the day the Actual column is read on: the schedule is one
  // sheet for the year, so an Actual written after the month's end is read as
  // done like any other, and a PM planned for the 28th of a month that ended
  // weeks ago and still blank is not done, not "within its week".
  let pm: MaintenancePart["pm"] = null;
  if (seen.visible(YEARLY_PM_ID)) {
    const year = Number(frame.from.slice(0, 4));
    const schedules = human(YEARLY_PM_ID).filter((r) => Number(r.dueDate.slice(0, 4)) === year);
    let planned = 0;
    let done = 0;
    let doneLate = 0;
    let notDone = 0;
    // Not yet counted against anybody, told apart in the sentence: planned after today, and planned within the last week.
    let ahead = 0;
    let withinWeek = 0;
    for (const r of schedules) {
      for (const row of (r.data as LogSheetData | undefined)?.rows ?? []) {
        for (const m of PM_MONTHS) {
          const plan = dayMonth(row[`${m}Plan`], year);
          if (!plan || !inMonth(plan)) continue;
          planned += 1;
          const actualRaw = text(row[`${m}Actual`]);
          if (actualRaw) {
            done += 1;
            // Written but not as a date: taken as done, as M6 takes it.
            const actual = dayMonth(actualRaw, year);
            if (actual && daysBetween(plan, actual) > PM_SLIP_DAYS) doneLate += 1;
          } else if (plan > today) ahead += 1;
          else if (daysBetween(plan, today) > PM_SLIP_DAYS) notDone += 1;
          else withinWeek += 1;
        }
      }
    }
    const notYetDue = ahead + withinWeek;
    pm = { scheduleWritten: schedules.length > 0, planned, done, doneLate, notDone, notYetDue };
    const fno = name(YEARLY_PM_ID, "F/MNT/03");
    if (schedules.length === 0) sentences.push(`The ${year} preventive maintenance schedule (${fno}) has not been written, so there is no plan to compare with.`);
    else if (planned === 0) sentences.push(`No preventive maintenance was planned for ${frame.label} on ${fno}.`);
    else
      sentences.push(
        `Preventive maintenance (${fno}): ${grouped(planned)} planned for ${frame.label}, ${grouped(done)} done` +
          (doneLate > 0 ? ` (${grouped(doneLate)} more than ${PM_SLIP_DAYS} days after the plan)` : "") +
          `, ${grouped(notDone)} not done` +
          (withinWeek > 0 ? `, ${grouped(withinWeek)} not written yet but still within ${PM_SLIP_DAYS} days of the plan` : "") +
          (ahead > 0 ? `, ${grouped(ahead)} not due yet` : "") +
          "."
      );
  }

  // ---- F/MNT/09: glass breakage, as rule M4 finds it ----
  let glass: MaintenancePart["glass"] = null;
  if (seen.visible(GLASS_ID)) {
    const sheets = monthHuman(GLASS_ID).length;
    const breakages = insights.filter((i) => i.rule === "M4" && i.evidence.some((e) => e.documentId === GLASS_ID && inMonth(e.dueDate)));
    glass = { sheets, breakages };
    const fno = name(GLASS_ID, "F/MNT/09");
    if (breakages.length > 0) sentences.push(`Glass breakage (${fno}): recorded in ${plural(breakages.length, "week")} of ${frame.label} — each needs its CA / incident record.`);
    else if (sheets > 0) sentences.push(`No glass breakage was recorded on ${fno} in ${frame.label}.`);
    else sentences.push(`The glass breakage monitoring sheet (${fno}) for ${frame.label} has not been written.`);
  }

  // ---- F/MNT/11: lux rounds, as rule M1 reads them ----
  let lux: MaintenancePart["lux"] = null;
  if (seen.visible(LUX_ID)) {
    let rounds = 0;
    let areas = 0;
    for (const r of monthHuman(LUX_ID)) {
      const n = luxReadings(r).size;
      if (n === 0) continue;
      rounds += 1;
      areas += n;
    }
    // The area-by-area falls of 25% and more; M1's summary line is not a fall.
    const falls = insights.filter((i) => i.rule === "M1" && !i.id.startsWith("m1|summary|") && inMonth(i.evidence[0]?.dueDate ?? ""));
    lux = { rounds, areas, falls };
    const fno = name(LUX_ID, "F/MNT/11");
    if (rounds === 0) sentences.push(`No lux round was measured in ${frame.label} (${fno}).`);
    else
      sentences.push(
        `Lux (${fno}): ${plural(rounds, "round")} measured over ${plural(areas, "area")}` +
          (falls.length > 0 ? `; ${plural(falls.length, "area")} lost 25% of ${falls.length === 1 ? "its" : "their"} light or more since the round before.` : "; no area lost 25% of its light or more since the round before.")
      );
  }

  const empty =
    (!breakdown || breakdown.breakdowns === 0) && (!pm || pm.planned === 0) && (!glass || glass.breakages.length === 0) && (!lux || lux.rounds === 0);
  return { sentences, empty, breakdown, pm, glass, lux };
}

// ---- purchase -------------------------------------------------------------------

function purchasePart(frame: Frame, seen: Seen, human: (documentId: string) => RecordInstance[], inMonth: (iso: string) => boolean): PurchasePart | null {
  if (!seen.visible(RM_PM_PERFORMANCE_ID)) return null;
  const fno = calledBy(seen.docs.get(RM_PM_PERFORMANCE_ID), "F/PUR/05");
  const none = (sentence: string): PurchasePart => ({ sentences: [sentence], empty: true, sheet: null, a: 0, b: 0, c: 0, ungraded: 0, gradedC: [] });
  if (frame.state === "future") return none(notBegun(frame));
  // The supplier ratings in force at the month's end, read exactly as the SUP
  // insight reads them (insightRules.supplierStandings): the suppliers on the
  // register as it stood, each graded from its newest line with all three
  // ratings written — a blank rating is not a 0 (REQUIREMENTS §75).
  const written = human(RM_PM_PERFORMANCE_ID).filter((r) => r.dueDate <= frame.asOf);
  const standing = supplierStandings(written);
  const latest = standing.register;
  if (!latest) return none(`No supplier performance rating (${fno}) had been written ${asOfPhrase(frame)}.`);
  let a = 0;
  let b = 0;
  let c = 0;
  const ungraded = standing.notRated.length;
  const gradedC: PurchasePart["gradedC"] = [];
  for (const { supplier, cells } of standing.graded) {
    // The grade worked out again from the three ratings, by the form's own table — never the stored cell.
    if (cells.grade === "A") a += 1;
    else if (cells.grade === "B") b += 1;
    else if (cells.grade === "C") {
      c += 1;
      gradedC.push({ supplier, overall: text(cells.overallRating), action: actionForGrade("C") });
    }
  }
  const sheet = { recordId: latest.id, dueDate: latest.dueDate, inMonth: inMonth(latest.dueDate) };
  const sentences = [
    `Suppliers on ${fno} of ${fmt(latest.dueDate)}${sheet.inMonth ? " (written this month)" : ""}: ${grouped(a)} graded A, ${grouped(b)} B and ${grouped(c)} C` +
      (ungraded > 0 ? `; ${plural(ungraded, "supplier")} not rated yet` : "") +
      ".",
  ];
  if (gradedC.length > 0)
    sentences.push(`Graded C, for which the form prints "${actionForGrade("C")}": ${listed(gradedC.map((g) => `${g.supplier} (${g.overall})`))}.`);
  return { sentences, empty: a + b + c === 0, sheet, a, b, c, ungraded, gradedC };
}

// ---- pest control ----------------------------------------------------------------

function pestPart(input: MonthlySummaryInput, frame: Frame, seen: Seen, monthHuman: (documentId: string) => RecordInstance[]): PestPart | null {
  const dailySeen = seen.visible(DAILY_PEST_ID);
  const flySeen = seen.visible(FLY_ID);
  if (!dailySeen && !flySeen) return null;
  if (frame.state === "future") return { sentences: [notBegun(frame)], empty: true, daily: null, flies: null };
  const sentences: string[] = [];

  let daily: PestPart["daily"] = null;
  if (dailySeen) {
    let daysRecorded = 0;
    let rodents = 0;
    let catchDays = 0;
    let findings = 0;
    for (const r of monthHuman(DAILY_PEST_ID) as RecordInstance<DailyPestMonitoringData>[]) {
      const data = r.data;
      if (!data || data.isHoliday) continue;
      // A day counts once it has been filled in (data/selectors.ts dailyRecordFilled).
      if (!Object.values(data.checkpoints ?? {}).some((c) => c && c.value !== null && c.value !== "")) continue;
      daysRecorded += 1;
      // The rodents of the day exactly as rodentsInMonth and the Rodent Trend count them.
      const n = data.checkpoints[7]?.value === "Yes" ? Math.max(totalRodents(data.rodentCatches), data.rodentCatches?.length ? 0 : 1) : 0;
      if (n > 0) {
        rodents += n;
        catchDays += 1;
      }
      if (input.checkpoints) findings += countFindings(input.checkpoints, data.checkpoints);
    }
    daily = { daysRecorded, rodents, catchDays, findings };
    const fno = calledBy(seen.docs.get(DAILY_PEST_ID), "F/HR/17");
    sentences.push(
      daysRecorded === 0
        ? `No day of the daily pest control register (${fno}) was written in ${frame.label}.`
        : `Daily pest control monitoring (${fno}): ${plural(daysRecorded, "day")} recorded, ${plural(rodents, "rodent")} caught` +
            (rodents > 0 ? ` on ${plural(catchDays, "day")}` : "") +
            (input.checkpoints ? `, ${plural(findings, "check point finding")}` : "") +
            "."
    );
  }

  let flies: PestPart["flies"] = null;
  if (flySeen) {
    let count = 0;
    let visits = 0;
    for (const r of monthHuman(FLY_ID) as RecordInstance<FlyCatcherData>[]) {
      let counted = false;
      for (const e of r.data?.entries ?? []) {
        if (e.catchCountApprox === null || e.catchCountApprox === undefined) continue;
        counted = true;
        count += Number(e.catchCountApprox) || 0;
      }
      if (counted) visits += 1;
    }
    flies = { flies: count, visits };
    const fno = calledBy(seen.docs.get(FLY_ID), "F/HR/18");
    sentences.push(
      visits === 0
        ? `No fly catcher inspection (${fno}) was recorded in ${frame.label}.`
        : `Fly catchers (${fno}): about ${plural(count, "fly", "flies")} counted at ${plural(visits, "inspection")}.`
    );
  }

  const empty = (!daily || daily.daysRecorded === 0) && (!flies || flies.visits === 0);
  return { sentences, empty, daily, flies };
}

// ---- insights --------------------------------------------------------------------

function insightsPart(frame: Frame, insights: Insight[]): InsightsPart {
  const counts = insightCounts(insights);
  const total = insights.length;
  const top = insights.slice(0, TOP_INSIGHTS);
  let sentences: string[];
  if (frame.state === "future") sentences = [notBegun(frame)];
  else if (total === 0) sentences = [`Nothing unusual was found in the records ${asOfPhrase(frame)}.`];
  else
    sentences = [
      `${plural(total, "insight")} ${asOfPhrase(frame)}: ${grouped(counts.high)} high, ${grouped(counts.medium)} medium and ${grouped(counts.low)} low severity${total > TOP_INSIGHTS ? `; the ${TOP_INSIGHTS} most severe are listed` : ""}.`,
    ];
  return { sentences, empty: total === 0, total, high: counts.high, medium: counts.medium, low: counts.low, top };
}

// ---- the headline --------------------------------------------------------------

/** Three to five sentences: the month, what went wrong most, and the most severe insight. */
function headlineOf(s: MonthlySummary): string[] {
  const where = s.everyDepartment ? "across every department" : `in ${s.scope} only`;
  const r = s.records;
  if (s.state === "future") {
    return [
      `${s.label} has not begun yet.`,
      r && r.pending > 0 ? `${plural(r.pending, "record")} ${r.pending === 1 ? "is" : "are"} scheduled for it ${where}.` : `Nothing is scheduled for it ${where} yet.`,
      "There is nothing to summarise until the month is under way.",
    ];
  }
  const when = s.state === "current" ? `So far in ${s.label} (to ${fmt(s.asOf)})` : `In ${s.label}`;
  const out: string[] = [];
  if (!r) out.push(`${when}, ${where}: there is no document to report on.`);
  else if (r.due === 0) out.push(`${when}, ${where}, no record fell due${r.pending > 0 ? `; ${plural(r.pending, "record")} still to come` : ""}.`);
  else
    out.push(
      `${when}, ${where}, ${grouped(r.onTime)} of ${plural(r.due, "record")} due ${r.onTime === 1 ? "was" : "were"} handed in on time, ${grouped(r.late)} late and ${grouped(r.never)} never done — a score of ${r.score} (${r.grade.label.toLowerCase()}).`
    );

  // What needs attention, most serious first; a part with nothing to say gives nothing here.
  const notable: string[] = [];
  const c = s.capa;
  if (c) {
    const bits: string[] = [];
    const ci = c.internal;
    if (ci) {
      if (ci.raised) bits.push(`${plural(ci.raised, "finding")} raised`);
      if (ci.closed) bits.push(`${grouped(ci.closed)} closed`);
      if (ci.overdue) bits.push(`${grouped(ci.overdue)} past ${ci.overdue === 1 ? "its" : "their"} target date ${s.state === "past" ? "at the month's end" : "today"}`);
    }
    const ce = c.external;
    if (ce) {
      if (ce.received) bits.push(`${plural(ce.received, "customer complaint")} received`);
      if (ce.openAtEnd) bits.push(`${plural(ce.openAtEnd, "complaint")} open`);
    }
    if (bits.length) notable.push(`CAPA: ${listed(bits)}.`);
  }
  const q = s.quality;
  if (q) {
    const bits: string[] = [];
    if (q.lotsNotAccepted > 0) bits.push(`${grouped(q.lotsNotAccepted)} of ${plural(q.lotsInspected, "lot")} not simply accepted`);
    if (q.outOfBandReadings > 0) bits.push(`${plural(q.outOfBandReadings, "reading")} outside the printed band`);
    if (q.calibrationExpired && q.calibrationExpired.length > 0) bits.push(`${plural(q.calibrationExpired.length, "instrument")} out of calibration`);
    if (bits.length) notable.push(`Quality: ${listed(bits)}.`);
  }
  const m = s.maintenance;
  if (m) {
    const bits: string[] = [];
    if (m.breakdown && m.breakdown.breakdowns > 0)
      bits.push(`${plural(m.breakdown.breakdowns, "breakdown")}, ${plural(m.breakdown.minutes, "minute")} down${m.breakdown.mttr !== null ? ` (MTTR ${grouped(m.breakdown.mttr)} min)` : ""}`);
    if (m.glass && m.glass.breakages.length > 0) bits.push(`glass breakage in ${plural(m.glass.breakages.length, "week")}`);
    if (m.pm && m.pm.notDone > 0) bits.push(`${plural(m.pm.notDone, "planned PM")} not done`);
    if (m.lux && m.lux.falls.length > 0) bits.push(`${plural(m.lux.falls.length, "area")} with 25% less light`);
    if (bits.length) notable.push(`Maintenance: ${listed(bits)}.`);
  }
  const p = s.pest;
  if (p && p.daily && (p.daily.rodents > 0 || p.daily.findings > 0)) {
    const bits = [p.daily.rodents ? `${plural(p.daily.rodents, "rodent")} caught` : "", p.daily.findings ? `${plural(p.daily.findings, "check point finding")}` : ""].filter(Boolean);
    notable.push(`Pest control: ${listed(bits)} on the daily register.`);
  }
  const pu = s.purchase;
  if (pu && pu.c > 0) notable.push(`${plural(pu.c, "supplier")} graded C on the latest supplier rating.`);

  if (notable.length === 0) {
    const parts = [s.capa ? "CAPA" : "", s.quality ? "quality" : "", s.maintenance ? "maintenance" : "", s.pest ? "pest control" : "", s.purchase ? "purchase" : ""].filter(Boolean);
    out.push(parts.length ? `Nothing in ${listed(parts)} needed attention.` : "No other part of the plant's records is yours to report on.");
  } else out.push(...notable.slice(0, 3));

  const i = s.insights;
  const first = i.top[0];
  if (i.total === 0) out.push("The records show nothing unusual.");
  else if (i.high > 0 && first) out.push(`The records show ${plural(i.high, "high-severity insight")}; the first: ${first.title}.`);
  else out.push(`The records show no high-severity insight, and ${plural(i.medium, "medium one")}.`);
  return out.slice(0, 5);
}
