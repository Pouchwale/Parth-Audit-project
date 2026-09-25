import type {
  ComplaintChecklistData,
  DailyPestMonitoringData,
  DocumentDefinition,
  FlyCatcherData,
  GapInspectionData,
  LogSheetData,
  LogSheetLayout,
  MasterData,
  RecordInstance,
} from "../types";
import { TBC } from "../types";
import type { Chip } from "./guidedChecklist";
import type { LocalAnswer } from "./assistantLocal";
import { DOC_KEYWORDS, matchDocuments, parseDateRange } from "./assistantLocal";
import { recordRepository } from "../data/repositories/recordRepository";
import { documentRepository } from "../data/repositories/documentRepository";
import { settingsRepository } from "../data/repositories/settingsRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { getLogSheetLayoutForRecord } from "../data/seed/logSheetLayouts";
import { departmentScope, departmentScopeLabel, isDocumentIdVisible } from "./departmentScope";
import { isHumanRecord, type Insight } from "./insights";
import { breakdownLines, luxReadings, normText, supplierStandings, type BreakdownLine } from "./insightRules";
import { prepareScopedInsights, scopedInsights } from "./scopedInsights";
import { isLotAccepted, isOutOfBand } from "./validation";
import { actionForGrade, RM_PM_PERFORMANCE_ID, SERVICE_PROVIDER_PERFORMANCE_ID, serviceRatingCells } from "./purchaseRatings";
import { closedDays, decisionText, scoreOf, scorecards, type Person } from "./performance";
import { machineKey, machineNumbersIn } from "./equipmentMaster";
import { keptTo } from "./latenessCore";
import { totalRodents } from "./rodentPattern";
import { routeForRecord } from "./reminders";
import { t } from "../i18n";
import { usersApi } from "../api/client";
import { addDays, compareISO, daysInMonth, formatDisplayDate, fromISODate, pad2, todayISO } from "../utils/date";

// MITRA ANSWERS FROM ALL HISTORY (REQUIREMENTS §75).
//
// "Which machine breaks down most?", "how did QC do last quarter?", "who is
// late?", "what stands out in the records?" — questions about what the plant's
// records say over time. The model cannot answer them from the page the person
// is on, and it must never guess at a number. So the APP works the figures out,
// here, and hands the model a short EVIDENCE PACK to answer from:
//
//   analyticIntent()  recognises such a question — its topics, the documents it
//                     names (assistantLocal's matchDocuments / DOC_KEYWORDS, the
//                     very words the rest of Mitra reads) and the period
//                     (parseDateRange, plus "last quarter" = the previous
//                     calendar quarter, "last 30 days", "this year", "ever").
//                     It answers null for everything another path already owns:
//                     a command ("fill it with sample data"), a screen to open
//                     ("open CAPA"), today's work ("how many records are due
//                     today?"), a machine looked up ("which machine is M-47?"),
//                     the calendar and small talk.
//   buildEvidence()   one fact per line, worked out from the records with the
//                     SAME engines the screens use — the breakdown register's
//                     minutes (engine/maintenanceCalc.ts via insightRules'
//                     breakdownLines), the lux rounds M1 compares, F/PUR/05's
//                     own grade table (engine/purchaseRatings.ts), the
//                     Performance Scorecard (engine/performance.ts), the
//                     out-of-band test the record grid highlights with
//                     (engine/validation.ts) and the insights themselves
//                     (engine/insights.ts) — so Mitra can never disagree with a
//                     page.
//   evidenceAnswer()  the same pack said in plain words: the answer when the
//                     model cannot be reached (no key, no network, the day's
//                     allowance used up), shown with the §72 label saying so.
//
// WHAT COUNTS. Only records a PERSON wrote (engine/insights.ts isHumanRecord):
// blank shells and drafts only the assistant has filled hold synthetic values.
// The one exception is lateness, which is the Performance Scorecard's own
// question — whether what fell due was handed in — and is asked of every record
// due in the period, exactly as that page asks it.
//
// SCOPE (REQUIREMENTS §40). Every record is read through the scoped
// recordRepository.query and every document through the scoped
// documentRepository, so a pack only ever holds this account's departments;
// a topic whose documents all belong elsewhere is said to be so in one line.
//
// SAFETY. Free text written on a record (a fault, a finding, a supplier's name)
// is QUOTED and cut to 80 characters, with square brackets taken out, so it
// reads as data and cannot pose as one of the app's own [rec:<id>] tags; the
// server keeps only cited ids that stand in a real tag of the pack — the ones
// at the end of a fact's line, of the app's own id shape (backend/assistant.ts
// citesFrom). EVERYTHING a person wrote goes in through quoteFree, including
// what only looks like the app's own words: a breakdown's equipment ID where it
// is not a machine number, the equipment's name standing in for it, a lot
// status the form does not offer, a date typed into a box made Text. A machine
// number is said as machineKey spells it ("M-47"), which nobody can write into.
//
// BUDGET. The Groq plan allows 8,000 tokens a minute and 200,000 a day for the
// whole plant, so a pack is 6,000 characters at most (about 1,500 tokens) —
// 1,500 per topic, five lines per list, ten record ids — and it REPLACES the
// long route guide in the prompt rather than adding to it.
//
// SPEED (REQUIREMENTS §56). Nothing here runs while a screen draws: only when a
// message is sent. Each pass over the records is a generator that stops every
// few dozen records; prepareEvidence runs it in slices of about 8 ms with the
// browser free between them (the house pattern — engine/insights.ts
// startInsights), and buildEvidence runs the same work in one go for callers
// already off the drawing path. What each record says is remembered against
// the record itself, and a whole pack against the store's version (the records
// snapshot, the documents list and the master data with the plant's calendar,
// which are new objects whenever they change) and the question's key. The one
// step that cannot be sliced — the Performance Scorecard — is kept to twelve
// months at most (peopleWork).

// ---------------------------------------------------------------------------
// the question

export type AnalyticTopic = "qc" | "maintenance" | "purchase" | "capa" | "pest" | "hr" | "store" | "dispatch" | "people";

/**
 * What kind of period was asked about, so "and before that?" steps back by one
 * of them (REQUIREMENTS §75): the quarter before "this quarter" is the whole
 * quarter before, even while this one is half gone. Absent for a run of days
 * ("the last 30 days", the default window), which steps back by as many days.
 */
export type PeriodUnit = "day" | "week" | "month" | "quarter" | "year";

export interface AnalyticIntent {
  /** What the question is about, most specific first. */
  topics: AnalyticTopic[];
  /** Documents the question names that this account may see. */
  documentIds: string[];
  /** The period, ISO, never later than today. */
  from: string;
  to: string;
  /** "the last quarter (01-Apr-2026 to 30-Jun-2026)". */
  label: string;
  /** What kind of period it is; absent for a run of days. */
  unit?: PeriodUnit;
  /** "What stands out?" — about the records as a whole. */
  general: boolean;
  /**
   * Plainly about history — a word such as "trend" or "most", a period named,
   * or a follow-up — rather than a counting word alone.
   */
  explicit: boolean;
  /** The message named its period ("last quarter", "in 2025", "ever"), or carried the one of the question it follows. */
  periodNamed: boolean;
  /** A follow-up to the last question about history ("and the month before?"). */
  followUp: boolean;
  /** What a pack for this question is kept under. */
  key: string;
}

/** Every topic, in the order a general question reads them. */
const ALL_TOPICS: AnalyticTopic[] = ["maintenance", "qc", "capa", "purchase", "pest", "people", "hr", "store", "dispatch"];

const TOPIC_NAME: Record<AnalyticTopic, string> = {
  maintenance: "Maintenance",
  qc: "Quality Control",
  purchase: "Purchase",
  capa: "CAPA",
  pest: "Pest control",
  hr: "Human Resources",
  store: "Store",
  dispatch: "Dispatch",
  people: "On time and late",
};

/** Which topic a document belongs to, by its id. */
export function topicOfDocument(documentId: string | undefined): AnalyticTopic | null {
  const id = documentId ?? "";
  if (id.startsWith("mnt-")) return "maintenance";
  if (id.startsWith("qc-") || id.startsWith("prd-")) return "qc";
  if (id.startsWith("pur-")) return "purchase";
  if (id === "gap-inspection" || id.startsWith("capa-")) return "capa";
  if (id === "daily-pest-monitoring" || id === "fly-catcher" || id.startsWith("service-report") || id === "training-record" || id.startsWith("pest-")) return "pest";
  if (id.startsWith("hr-")) return "hr";
  if (id.startsWith("str-")) return "store";
  if (id.startsWith("disp-")) return "dispatch";
  return null;
}

// Things other paths own, read first and never taken over (see the header).
const SAMPLE_RE = /\b(?:sample|dummy|fake|test|example)\s+(?:data|values?|entries|record)\b/i;
const COMMAND_RE =
  /^(?:please\s+|pls\s+|kindly\s+|mitra,?\s+|can you\s+|could you\s+|would you\s+)?(?:fill|create|start|generate|make|add|delete|remove|submit|verify|approve|print|download|export|change|set|update|correct|undo|cancel|reopen|raise|send|mark|tick|write|enter|record)\b/i;
const NAVIGATE_RE = /^(?:please\s+|pls\s+|mitra,?\s+)?(?:open|go to|goto|take me|navigate|bring up|jump to|launch)\b/i;
const DUE_TODAY_RE = /\b(?:due today|what'?s due|whats due|pending today|today'?s (?:work|records|tasks|list)|to-?do)\b|\bdue\b[^.?!]*\btoday\b|\btoday\b[^.?!]*\bdue\b/i;
const OWNED_RE = /\b(?:briefing|holidays?|weekly[ -]?off|off[ -]?day|day[ -]?off|working day|adjustment (?:day|days|date|dates)|leave calendar)\b/i;

// Words that make a question about history. STRONG ones do it alone; WEAK ones
// only in a question or with a period ("breakdowns last month", "how many
// breakdowns?") — "the breakdown record" on its own names a document. Kept to
// words that are about counting and comparing: "what does lot status mean?",
// "the best way to fill it", "how is the test done?" or "the lowest viscosity
// allowed" are about a form, and go to the model with the open record as before
// ("how often", "how long" and "how much" ask about a schedule or a method).
const STRONG_RE =
  /\b(?:trends?|trending|most(?!\s+recent)|worst|best(?!\s+(?:way|practice|practices|method))|compar(?:e|es|ed|ing|ison)|versus|vs\.?|average|avg|mttr|mtbf|drift(?:s|ed|ing)?|stands? out|standing out|unusual|anomal(?:y|ies|ous)|patterns?|recurr(?:ing|ed|ence|ences)|repeat(?:ed|edly|ing)?|again and again|ratings?|graded|how (?:is|are|was|were|did|has|have)\b[^?]{0,40}\b(?:do|doing|perform(?:ing|ed)?|going|faring))\b/i;
const WEAK_RE =
  /\b(?:how many|breakdowns?|broke down|break(?:s|ing)? down|late|lateness|overdue|on time|slipp(?:ed|ing|age)|missed|deviations?|rejected|rejections?|not accepted|out of band|out-of-band|outside (?:the )?(?:printed )?band|expired|expir(?:ing|es|y)|downtime|failures?|catch(?:es)?|caught|grades?)\b/i;
const QUESTION_RE =
  /\?\s*$|^(?:is|was|are|were|when|which|what|who|whom|whose|how|do|does|did|can|could|will|would|has|have|had|tell me|give me|list|show me|any|anything|where|why)\b/i;
const GENERAL_RE =
  /\b(?:stands? out|standing out|unusual|anomal\w*|anything (?:wrong|odd|strange|worrying|notable|important|to worry)|what(?:'s| is) (?:wrong|going on)|overall|across the plant|(?:in|from) (?:the|our|my) records|plant[- ]wide|whole plant)\b/i;

const TOPIC_WORDS: [AnalyticTopic, RegExp][] = [
  ["maintenance", /\b(?:machines?|equipments?|machinery|maintenance|breakdowns?|broke down|break(?:s|ing)? down|mttr|mtbf|downtime|pm|preventive|preventative|lux|lighting|light levels?|glass|brittle|repairs?)\b/i],
  ["qc", /\b(?:qc|quality|viscosity|temperatures?|readings?|lots?(?! of)|deviations?|out of band|out-of-band|inspections?|calibrations?|calibrated|coa|line clearance|printing stops?|adhesive|lamination|pouching|slitting|printed film)\b/i],
  ["purchase", /\b(?:suppliers?|vendors?|purchas(?:e|ing)|service providers?|ratings?|graded)\b/i],
  ["capa", /\b(?:capa|corrective|findings?|complaints?|non-?conformit(?:y|ies)|ncs?)\b/i],
  ["pest", /\b(?:pests?|rodents?|rats?|mice|mouse|flies|fly|fly catchers?|lizards?|geckos?|cockroach(?:es)?|ants?|traps?|trapped|catch(?:es)?|caught)\b/i],
  ["hr", /\b(?:hr|human resources|trainings?|employees?|joiners?|induction|visitors?|hygiene|gmp|skills?)\b/i],
  ["store", /\b(?:store|stores|blades?|cutters?|sharp (?:tools?|metal)|incoming (?:material )?vehicles?)\b/i],
  ["dispatch", /\b(?:dispatch|containers?|transporters?|stuffing)\b/i],
  ["people", /\b(?:late|lateness|on time|overdue|never done|missed|who|whom|whose|which (?:person|people|department|departments|team|teams)|people|person|staff|departments?|scores?|scorecard|performance|punctual|behind)\b/i],
];

// A follow-up to the last question about history: "and the month before?",
// "what about QC?", "same for last year".
const FOLLOW_RE =
  /^(?:and|what about|how about|same for|and for|compared (?:to|with)|vs\.?|versus|then|also|ok(?:ay)?,?\s+and|the (?:month|quarter|year|week) before|before that|previous (?:month|quarter|year|week)|earlier)\b/i;
const BEFORE_RE = /\b(?:before(?: that)?|previous|prior|earlier)\b/i;

const DEFAULT_WINDOW_DAYS = 90; // the Insights' own "in the last 90 days"
const EVERYTHING_FROM = "2000-01-01";

const fmt = (iso: string): string => formatDisplayDate(iso);

interface Period {
  from: string;
  to: string;
  label: string;
  /** Named in the message, rather than the default window. */
  named: boolean;
  /** A month, a quarter, a year…; absent for a run of days. */
  unit?: PeriodUnit;
}

// WHICH PERIOD A MESSAGE NAMES (REQUIREMENTS §75). The period it NAMES comes
// first, and only then the words that stretch one: "how many breakdowns in
// September so far?" is 1 September to today — read the other way round, "so
// far" won and the answer was about everything on file. "Ever", "all time" and
// "on file" mean everything only when nothing else is named ("how many in
// August on file?" is August); "so far", "to date" and "since" run a named
// period on to today.
const EVERYTHING_RE = /\b(?:ever|all[- ]time|all (?:the )?history|entire history|whole history|since (?:the )?(?:start|beginning)|on file|so far|till date|to date|until now|till now|up to now)\b/;
const TO_DATE_RE = /\b(?:so far|till date|to date|until now|till now|up to now)\b/;
const SINCE_RE = /\bsince\b(?!\s+(?:the\s+)?(?:start|beginning)\b)/;
// A month or a day named without its year is the last one there WAS: "in
// October", asked in September, is last October — history is never the future,
// and read as this year's it was, and the question was dropped. So is "last
// December", and "last September" asked in September. Not when the message
// says it is about what is to come.
const YEAR_WRITTEN_RE = /\b(?:19|20)\d{2}\b/;
const FUTURE_RE = /\b(?:next|coming|upcoming|tomorrow|will|shall|going to|planned|scheduled)\b/;
const MONTH_NAMES_SRC = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const MONTH_NAMED_RE = new RegExp(`\\b${MONTH_NAMES_SRC}\\b`);
const LAST_MONTH_NAMED_RE = new RegExp(`\\b(?:last|previous)\\s+${MONTH_NAMES_SRC}\\b`);
const QUARTER_RE = /\bq([1-4])(?:\s*(?:of\s+)?((?:19|20)\d{2}))?\b/;
// A YEAR NAMED ON ITS OWN ("in 2025", "how did QC do in 2024?", "since 2025")
// is the whole of that year — read as no period at all, "in 2025" was the last
// 90 days. Only a number the message plainly says is a year: after "in",
// "for", "during", "of", "since", "from", "until", "through" or "year", and not
// followed by a unit — "any lux reading below 2000?" and "of 2000 lux" are
// readings, never the year 2000 (nor 2100 a year still to come, which would
// have dropped the question as the future).
const YEAR_UNIT = "(?!\\s*(?:lux|kgs?|gms?|g|gsm|mm|cm|m|mtrs?|metres?|meters?|cps|sec(?:ond)?s?|°|%|units?|pcs|nos|rolls?|min(?:ute)?s?|h(?:ou)?rs?|times?|rpm|mpa|kpa|psi|ppm)\\b)";
const BARE_YEAR_RE = new RegExp(`\\b(?:in|for|during|of|since|from|until|till|through(?:out)?|year)\\s+((?:19|20)\\d{2})\\b${YEAR_UNIT}`);
const YEAR_SPAN_RE = new RegExp(`\\b(?:from|between)\\s+((?:19|20)\\d{2})\\s*(?:to|and|till|until|through|-|–)\\s*((?:19|20)\\d{2})\\b${YEAR_UNIT}`);

function monthEndISO(year: number, month0: number): string {
  const y = year + Math.floor(month0 / 12);
  const m = ((month0 % 12) + 12) % 12;
  return `${y}-${pad2(m + 1)}-${pad2(daysInMonth(y, m))}`;
}
const monthStartISO = (year: number, month0: number): string => {
  const y = year + Math.floor(month0 / 12);
  const m = ((month0 % 12) + 12) % 12;
  return `${y}-${pad2(m + 1)}-01`;
};

/** The same day `k` months away, kept inside the month it lands in (31 March − 1 month = 28/29 February). */
function shiftMonths(iso: string, k: number): string {
  const d = fromISODate(iso);
  const total = d.getMonth() + k;
  const y = d.getFullYear() + Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  return `${y}-${pad2(m + 1)}-${pad2(Math.min(d.getDate(), daysInMonth(y, m)))}`;
}

const earlier = (a: string, b: string): string => (compareISO(a, b) <= 0 ? a : b);

/** The period a message names, "none" when it names none, or null when it is in the future (not history). */
function periodOf(text: string, today: string): Period | "none" | null {
  const lower = text.toLowerCase();
  const named = namedPeriod(text, lower, today);
  if (named === null) return null;
  if (named === "none") return EVERYTHING_RE.test(lower) ? { from: EVERYTHING_FROM, to: today, label: "everything on file", named: true } : "none";
  // "in September so far", "since March", "since 2025": from the start of the
  // period named to today — a run of days, stepped back from by as many.
  if (compareISO(named.to, today) < 0 && (SINCE_RE.test(lower) || TO_DATE_RE.test(lower))) {
    const since = SINCE_RE.test(lower);
    // A label that already says its own dates ("last week (13-Sep-2026 to
    // 19-Sep-2026)", "05-Aug-2026") would say two periods; it is said from its first day.
    if (/\d{2}-[A-Z][a-z]{2}-\d{4}/.test(named.label)) {
      return { from: named.from, to: today, label: since ? `since ${fmt(named.from)} (to ${fmt(today)})` : `${fmt(named.from)} to ${fmt(today)}`, named: true };
    }
    return { from: named.from, to: today, label: since ? `since ${named.label}` : `${named.label} to date`, named: true };
  }
  return named;
}

/** The period a message names in so many words, before anything stretches it (see periodOf). */
function namedPeriod(text: string, lower: string, today: string): Period | "none" | null {
  const d = fromISODate(today);
  const y = d.getFullYear();
  const m = d.getMonth();
  const q = Math.floor(m / 3);
  // Cut at today, a label that says its own dates loses them, so withDates
  // says the real ones: "this week (20-Sep-2026 to 24-Sep-2026)", not to the 26th.
  const range = (from: string, to: string, label: string, unit?: PeriodUnit): Period | null =>
    compareISO(from, today) > 0
      ? null
      : {
          from,
          to: earlier(to, today),
          label: compareISO(to, today) > 0 ? label.replace(/\s*\(\d{2}-[A-Z][a-z]{2}-\d{4} to \d{2}-[A-Z][a-z]{2}-\d{4}\)$/, "") : label,
          named: true,
          ...(unit ? { unit } : {}),
        };

  if (/\b(?:last|previous|past) quarter\b/.test(lower)) {
    const pq = q === 0 ? 3 : q - 1;
    const py = q === 0 ? y - 1 : y;
    return range(monthStartISO(py, pq * 3), monthEndISO(py, pq * 3 + 2), `the last quarter, Q${pq + 1} ${py}`, "quarter");
  }
  if (/\bthis quarter\b/.test(lower)) return range(monthStartISO(y, q * 3), today, `this quarter, Q${q + 1} ${y}`, "quarter");
  // "Q2", "Q4 2025": a quarter of the year written, else the last Q2 there was.
  const qn = QUARTER_RE.exec(lower);
  if (qn) {
    const k = Number(qn[1]) - 1;
    let qy = qn[2] ? Number(qn[2]) : y;
    if (!qn[2] && k > q && !FUTURE_RE.test(lower)) qy -= 1;
    return range(monthStartISO(qy, k * 3), monthEndISO(qy, k * 3 + 2), `Q${k + 1} ${qy}`, "quarter");
  }
  const parsed = parseDateRange(text, today);
  const yearWritten = YEAR_WRITTEN_RE.test(lower);
  // "In May last year" is May of last year, not the whole of it; "May this year" is this May.
  const monthOfYear = parsed && !yearWritten && MONTH_NAMED_RE.test(lower) ? parsed : null;
  if (/\b(?:last|previous) year\b/.test(lower)) {
    if (monthOfYear) return range(shiftMonths(monthOfYear.from, -12), shiftMonths(monthOfYear.to, -12), yearBack(monthOfYear.label), unitOfRange(monthOfYear, lower));
    return range(`${y - 1}-01-01`, `${y - 1}-12-31`, `last year, ${y - 1}`, "year");
  }
  if (/\b(?:this year|so far this year|year to date|ytd)\b/.test(lower)) {
    if (monthOfYear) return range(monthOfYear.from, monthOfYear.to, monthOfYear.label, unitOfRange(monthOfYear, lower));
    return range(`${y}-01-01`, today, `this year, ${y}`, "year");
  }
  const n = lower.match(/\b(?:last|past|previous)\s+(\d{1,3})\s+(days?|weeks?|months?|years?)\b/);
  if (n) {
    const k = Number(n[1]);
    const unit = n[2].replace(/s$/, "");
    if (k > 0 && k <= 120) {
      const from =
        unit === "day"
          ? addDays(today, -(k - 1))
          : unit === "week"
            ? addDays(today, -(k * 7 - 1))
            : addDays(shiftMonths(today, unit === "month" ? -k : -12 * k), 1);
      return range(from, today, `the last ${k} ${unit}${k === 1 ? "" : "s"}`);
    }
  }
  if (/\bpast (?:week|7 days)\b/.test(lower)) return range(addDays(today, -6), today, "the past week");
  if (/\bpast month\b/.test(lower)) return range(addDays(today, -29), today, "the past month");
  if (/\bpast year\b/.test(lower)) return range(addDays(today, -364), today, "the past year");
  if (parsed) {
    const unit = unitOfRange(parsed, lower);
    if (!yearWritten && !FUTURE_RE.test(lower) && (compareISO(parsed.from, today) > 0 || (LAST_MONTH_NAMED_RE.test(lower) && compareISO(parsed.to, today) >= 0))) {
      return range(shiftMonths(parsed.from, -12), shiftMonths(parsed.to, -12), yearBack(parsed.label), unit);
    }
    return range(parsed.from, parsed.to, parsed.label, unit);
  }
  // "From 2024 to 2025": both whole years; "in 2025", "how did QC do in 2024?":
  // the whole year — each to today at most.
  const years = YEAR_SPAN_RE.exec(lower);
  if (years && Number(years[1]) <= Number(years[2])) return range(`${years[1]}-01-01`, `${years[2]}-12-31`, `${years[1]} to ${years[2]}`);
  const bare = BARE_YEAR_RE.exec(lower);
  if (bare) return range(`${bare[1]}-01-01`, `${bare[1]}-12-31`, bare[1], "year");
  return "none";
}

/** What kind of period parseDateRange read: a day, a week, a whole month, or a run of days. */
function unitOfRange(r: { from: string; to: string }, lower: string): PeriodUnit | undefined {
  if (r.from === r.to) return "day";
  const f = fromISODate(r.from);
  if (r.from.endsWith("-01") && r.to === monthEndISO(f.getFullYear(), f.getMonth())) return "month";
  if (/\b(?:this|last|next) week\b/.test(lower)) return "week";
  return undefined;
}

/** A label moved a year back with its dates: "October 2026" → "October 2025". */
const yearBack = (label: string): string => label.replace(/\b((?:19|20)\d{2})\b/g, (yy) => String(Number(yy) - 1));

function defaultPeriod(today: string): Period {
  return { from: addDays(today, -(DEFAULT_WINDOW_DAYS - 1)), to: today, label: `the last ${DEFAULT_WINDOW_DAYS} days`, named: false };
}

/**
 * The period before `p`, by `unit` — what the follow-up says ("the month
 * before") or else the kind of period p is (REQUIREMENTS §75): the month,
 * quarter, year, week or day before the one p began in; for a run of days, as
 * many days again. Stepping back from a quarter or a year still under way
 * ("this quarter", "this year") gives the whole one before it — read from its
 * dates alone, "this year" asked in September stepped back 267 days, and "this
 * quarter" in its first month one month. With no unit said or carried (a
 * question remembered from before units were kept), a period that is exactly
 * a whole month, quarter or year is taken as one.
 */
function periodBefore(p: { from: string; to: string }, said?: PeriodUnit): Period {
  const f = fromISODate(p.from);
  const fy = f.getFullYear();
  const fm = f.getMonth();
  const whole = (): PeriodUnit | undefined => {
    if (!p.from.endsWith("-01")) return undefined;
    if (p.to === monthEndISO(fy, fm)) return "month";
    if (fm % 3 === 0 && p.to === monthEndISO(fy, fm + 2)) return "quarter";
    if (fm === 0 && p.to === `${fy}-12-31`) return "year";
    return undefined;
  };
  const unit = said ?? whole();
  if (unit === "month") return { from: monthStartISO(fy, fm - 1), to: monthEndISO(fy, fm - 1), label: "the month before", named: true, unit };
  if (unit === "quarter") {
    const q0 = Math.floor(fm / 3) * 3;
    return { from: monthStartISO(fy, q0 - 3), to: monthEndISO(fy, q0 - 1), label: "the quarter before", named: true, unit };
  }
  if (unit === "year") return { from: `${fy - 1}-01-01`, to: `${fy - 1}-12-31`, label: `${fy - 1}`, named: true, unit };
  if (unit === "week") return { from: addDays(p.from, -7), to: addDays(p.from, -1), label: "the week before", named: true, unit };
  if (unit === "day") return { from: addDays(p.from, -1), to: addDays(p.from, -1), label: "the day before", named: true, unit };
  const span = Math.round((fromISODate(p.to).getTime() - f.getTime()) / 86400000) + 1;
  const to = addDays(p.from, -1);
  return { from: addDays(to, -(span - 1)), to, label: `the ${span} days before`, named: true };
}

function withDates(p: Period): string {
  if (/\d{2}-[A-Z][a-z]{2}-\d{4}/.test(p.label)) return p.label; // already says its dates (a period carried to a follow-up does)
  if (p.from === EVERYTHING_FROM) return `${p.label} (to ${fmt(p.to)})`;
  return `${p.label} (${fmt(p.from)} to ${fmt(p.to)})`;
}

// DOC_KEYWORDS' aliases as patterns, made the first time they are needed and
// kept: a message is read against every one of them.
let aliasRes: { id: string; res: RegExp[] }[] | null = null;
function aliasPatterns(): { id: string; res: RegExp[] }[] {
  if (!aliasRes) {
    aliasRes = DOC_KEYWORDS.map(({ id, aliases }) => ({ id, res: aliases.map((a) => new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i")) }));
  }
  return aliasRes;
}

function topicsIn(text: string, lower: string): { topics: AnalyticTopic[]; documentIds: string[]; namedIds: string[] } {
  const topics: AnalyticTopic[] = [];
  const add = (topic: AnalyticTopic | null) => {
    if (topic && !topics.includes(topic)) topics.push(topic);
  };
  // The documents the message names: matchDocuments keeps only those this
  // account may see; DOC_KEYWORDS also says which topic an unseen one was, so a
  // question about another department's paperwork is answered with that, not
  // with silence (REQUIREMENTS §40).
  const documentIds = matchDocuments(lower);
  for (const id of documentIds) add(topicOfDocument(id));
  const namedIds: string[] = [];
  for (const { id, res } of aliasPatterns()) if (res.some((re) => re.test(lower))) namedIds.push(id);
  for (const id of namedIds) add(topicOfDocument(id));
  if (machineNumbersIn(text).length > 0) add("maintenance");
  for (const [topic, re] of TOPIC_WORDS) if (re.test(text)) add(topic);
  return { topics, documentIds, namedIds };
}

/**
 * Is this a question about what the records say over time? Its topics,
 * documents and period, or null — for every message another path owns (see the
 * header). `previous` is the last such question in the same conversation, so a
 * follow-up ("and the month before?") keeps its topics.
 */
export function analyticIntent(message: string, today: string, previous?: AnalyticIntent | null): AnalyticIntent | null {
  const text = String(message ?? "").trim();
  if (!text || text.length > 600) return null;
  const lower = text.toLowerCase();
  if (SAMPLE_RE.test(lower) || COMMAND_RE.test(text) || DUE_TODAY_RE.test(lower) || OWNED_RE.test(lower)) return null;

  const strong = STRONG_RE.test(lower);
  if (NAVIGATE_RE.test(text) && !strong) return null;
  const generalWords = GENERAL_RE.test(lower);
  const weak = WEAK_RE.test(lower);
  const mayFollow = !!previous && text.length <= 120 && looksLikeFollowUp(text);
  // Most messages are not about history at all: let them go before any
  // document or period is looked for (REQUIREMENTS §56 — this runs on send).
  if (!strong && !generalWords && !weak && !mayFollow) return null;
  const question = QUESTION_RE.test(text);
  const period = periodOf(text, today);
  if (period === null) return null; // the future is not history
  const named = period !== "none";
  const found = topicsIn(text, lower);
  // "What stands out?" with no topic is about the records as a whole; with one
  // ("anything unusual in maintenance?") it is about that topic.
  const general = generalWords && found.topics.length === 0;

  // A follow-up keeps the last question's topics, and "before" moves its period
  // back. Only when it reads as one ("and the month before?", "what about
  // QC?", "for last quarter?"): "show me all reports of august" after a
  // question about breakdowns is still a request for the Reports page.
  const followUp = mayFollow && (FOLLOW_RE.test(text) || named);
  if (previous && followUp) {
    // "The month before" says the step; "and before that?" takes the kind of
    // period the last question was about (REQUIREMENTS §75).
    const said = lower.match(/\b(day|week|month|quarter|year)\b/)?.[1] as PeriodUnit | undefined;
    const p = named
      ? (period as Period)
      : BEFORE_RE.test(lower)
        ? periodBefore(previous, said ?? previous.unit)
        : { from: previous.from, to: previous.to, label: previous.label, named: true, ...(previous.unit ? { unit: previous.unit } : {}) };
    const topics = found.topics.length ? found.topics : previous.topics;
    return makeIntent(topics, found.documentIds.length ? found.documentIds : previous.documentIds, p, previous.general && found.topics.length === 0, true, true);
  }

  const analytic = strong || general || (weak && (question || named));
  if (!analytic) return null;
  if (found.topics.length === 0 && !general) return null;
  return makeIntent(found.topics.length ? found.topics : ALL_TOPICS, found.documentIds, named ? (period as Period) : defaultPeriod(today), general, strong || general || named, false);
}

// About the record that is open, not about history: "this sheet", "the
// current record", "today" — whatever else the question says. "Open" alone is
// not one of them: "how many open reports last quarter?" asks about CAPA's
// open findings, not the record on screen ("the open record" still is).
const ABOUT_OPEN_RECORD_RE =
  /\b(?:this|the current|current|present)\s+(?:sheet|record|form|page|log(?:\s*sheet)?|register|report|entry|document|shift|batch|lot|roll|job|round|visit|inspection)\b|\bthe open\s+(?:sheet|record|form|page|log(?:\s*sheet)?|register|document|entry)\b|\b(?:today|today'?s|tonight)\b|\bon here\b|\bin here\b/i;

/**
 * WITH A RECORD OPEN, IS THIS STILL A QUESTION ABOUT HISTORY? (REQUIREMENTS
 * §75, §72.) The analyst prompt answers from the evidence pack alone and never
 * sees the open record's data, so a question about the sheet in front of the
 * person must keep the record's own prompt — "what's the average viscosity on
 * this sheet?" went to the analyst for its word "average", and the answer was
 * about the last 90 days of every viscosity sheet. Only a question that names a
 * period ("the average viscosity last month"), follows one about history ("and
 * the month before?") or asks what stands out in the records goes to the
 * analyst; a word such as "average", "worst" or "compare" alone does not, and
 * nothing that says "this sheet", "this record" or "today" does.
 */
export function historyWithRecordOpen(intent: AnalyticIntent, message: string): boolean {
  if (ABOUT_OPEN_RECORD_RE.test(String(message ?? ""))) return false;
  return intent.periodNamed || intent.followUp || intent.general;
}

/**
 * Does this read as a follow-up to the last question ("and the month before?",
 * "what about QC?", "for last quarter?")? Cheap, so a screen asks it before
 * looking back through the conversation for the question it would follow.
 */
export function looksLikeFollowUp(message: string): boolean {
  const text = String(message ?? "").trim();
  return FOLLOW_RE.test(text) || (/^(?:in|for|during|over)\b/i.test(text) && text.length <= 40);
}

function makeIntent(topics: AnalyticTopic[], documentIds: string[], p: Period, general: boolean, explicit: boolean, followUp: boolean): AnalyticIntent {
  const label = withDates(p);
  // The label is in the pack ("Period asked about: …"), so it is in the key too.
  const key = `${general ? "g" : ""}|${topics.join(",")}|${[...documentIds].sort().join(",")}|${p.from}|${p.to}|${label}`;
  return {
    topics: [...topics],
    documentIds: [...documentIds],
    from: p.from,
    to: p.to,
    label,
    ...(p.unit ? { unit: p.unit } : {}),
    general,
    explicit,
    periodNamed: p.named,
    followUp,
    key,
  };
}

// ---------------------------------------------------------------------------
// the question, remembered with the message that asked it

/**
 * A QUESTION ABOUT HISTORY AS IT WAS UNDERSTOOD WHEN IT WAS SENT (REQUIREMENTS
 * §75), kept on the user's message in the Assistant page's conversation. A
 * follow-up builds on THIS rather than on the words read again: read again,
 * "last month" asked on 31 August meant September by the time "and the month
 * before?" came on 1 September, and only the last six messages were read, so a
 * seventh "and the month before?" had nothing to follow.
 */
export interface KeptIntent {
  topics: AnalyticTopic[];
  documentIds: string[];
  from: string;
  to: string;
  label: string;
  unit?: PeriodUnit;
  general: boolean;
}

export function keepIntent(intent: AnalyticIntent): KeptIntent {
  return {
    topics: [...intent.topics],
    documentIds: [...intent.documentIds],
    from: intent.from,
    to: intent.to,
    label: intent.label,
    ...(intent.unit ? { unit: intent.unit } : {}),
    general: intent.general,
  };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const UNITS: readonly PeriodUnit[] = ["day", "week", "month", "quarter", "year"];

/**
 * A kept question back as one a follow-up can build on — or null when what is
 * kept is not one: the conversation is read back from this browser's storage
 * and from the server's copy, so its shape is checked, never assumed.
 */
export function intentFromKept(value: unknown): AnalyticIntent | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<KeptIntent>;
  if (typeof v.from !== "string" || typeof v.to !== "string" || !ISO_DAY.test(v.from) || !ISO_DAY.test(v.to) || compareISO(v.from, v.to) > 0) return null;
  const topics = Array.isArray(v.topics) ? v.topics.filter((t): t is AnalyticTopic => ALL_TOPICS.includes(t as AnalyticTopic)) : [];
  if (topics.length === 0) return null;
  const documentIds = Array.isArray(v.documentIds) ? v.documentIds.filter((id): id is string => typeof id === "string" && isDocumentIdVisible(id)) : [];
  const unit = UNITS.includes(v.unit as PeriodUnit) ? (v.unit as PeriodUnit) : undefined;
  const label = typeof v.label === "string" && v.label.trim() ? tidy(v.label, 120) : `${fmt(v.from)} to ${fmt(v.to)}`;
  return makeIntent(topics, documentIds, { from: v.from, to: v.to, label, named: true, ...(unit ? { unit } : {}) }, v.general === true, true, false);
}

// ---------------------------------------------------------------------------
// the pack

/** One fact, as the plain answer says it; its records are tagged in the model's copy. */
export interface EvidenceFact {
  text: string;
  recordIds: string[];
  /** How the plain answer says it, where that differs (an insight without its rule letter). */
  plain?: string;
}

export interface EvidenceSection {
  topic: AnalyticTopic | "insights" | "scope";
  heading: string;
  facts: EvidenceFact[];
}

export interface EvidencePack {
  /** What the model is given: one fact per line, records tagged [rec:<id>]. */
  text: string;
  /** Every record id tagged in `text`, at most ten. */
  recordIds: string[];
  chars: number;
  /** The same facts, for evidenceAnswer. */
  sections: EvidenceSection[];
}

export interface EvidenceOptions {
  /** The account asking. */
  self?: Person | null;
  /**
   * WHOM A PERSON'S SCORE IS WORKED OUT AMONG (REQUIREMENTS §64, §75): every
   * account that shares a department with `self` — GET /api/users/directory,
   * the very list the Performance Scorecard scores with. Where a department has
   * two accounts, a record one of them handed in counts for that one; scored
   * alone, an account was charged with its colleague's work and credited with
   * it, and Mitra's score disagreed with the Scorecard's. Null or absent when
   * the list could not be read: then no person's score is given at all, since
   * from here there is no telling whether a department is shared.
   */
  directory?: readonly Person[] | null;
}

const SECTION_BUDGET = 1500;
const LIST_MAX = 5;
const MAX_RECORD_IDS = 10;
const QUOTE_MAX = 80;

/** Text written on a record, made safe to hand the model: one line, no brackets, quoted, 80 characters at most. */
export function quoteFree(value: unknown, max = QUOTE_MAX): string {
  let s = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\[/g, "(")
    .replace(/\]/g, ")")
    // Every kind of double quote, so nothing inside can seem to close the quote around it.
    .replace(/["“”„‟«»]/g, "'")
    .trim();
  const room = Math.max(4, max - 2);
  if (s.length > room) s = `${s.slice(0, room - 1).trimEnd()}…`;
  return `"${s}"`;
}

/**
 * Text longer than one quote may be — an insight's title, which repeats what
 * people wrote — made safe as quoteFree makes it (one line, no brackets, every
 * double quote made single), cut to `max` and then quoted in pieces of at most
 * QUOTE_MAX, split between words: every word of it inside quotes, so nothing in
 * it reads as the app's own, and none of it lost to an 80-character cut.
 */
function quotedPieces(value: unknown, max: number): string {
  const whole = quoteFree(value, max + 2).slice(1, -1);
  const room = QUOTE_MAX - 2;
  const pieces: string[] = [];
  let rest = whole;
  while (rest.length > room) {
    const cut = rest.lastIndexOf(" ", room);
    const at = cut > room / 2 ? cut : room;
    pieces.push(rest.slice(0, at).trimEnd());
    rest = rest.slice(at).trimStart();
  }
  if (rest || pieces.length === 0) pieces.push(rest);
  return pieces.map((p) => `"${p}"`).join(" ");
}

/** An app-made line that may carry clipped record text (an insight's title): one line, no brackets, bounded. */
function tidy(value: unknown, max = 220): string {
  const s = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\[/g, "(")
    .replace(/\]/g, ")")
    .trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const round = (n: number, places = 0): string => String(Math.round(n * 10 ** places) / 10 ** places);
const text = (v: unknown): string => String(v ?? "").trim();
const inRange = (iso: string, from: string, to: string): boolean => !!iso && compareISO(iso, from) >= 0 && compareISO(iso, to) <= 0;
const daysBetween = (from: string, to: string): number => Math.round((fromISODate(to).getTime() - fromISODate(from).getTime()) / 86400000);

/** A real calendar day, ISO — what a date box holds, and not always what a box the Format Editor made Text holds. */
function isDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/**
 * A date a person wrote on a record (an inspection date, a target date): shown
 * as a date when it is one, and otherwise QUOTED as written — formatted
 * regardless, "12.09.2026" threw and took the whole pack with it, and a box of
 * free text is record text like any other.
 */
const writtenDay = (value: unknown): string => {
  const s = text(value);
  return isDay(s) ? fmt(s) : quoteFree(s, 24);
};

/**
 * WHICH EQUIPMENT A BREAKDOWN WAS ON, as the pack says it (REQUIREMENTS §75).
 * insightRules.breakdownLines groups the lines by `machine` — the machine
 * number, else the ID as written in capitals, else the name in curly quotes —
 * which is a key, not something to hand the model: the ID and the name are
 * whatever the person typed, brackets and "SYSTEM NOTE"s included. So the label
 * is made here from safe parts only: the machine number as machineKey spells it
 * ("M-47"), else the ID or the name through quoteFree. `named` says whether the
 * label already is the name, so it is not said twice.
 */
function equipmentLabel(line: BreakdownLine): { label: string; named: boolean } {
  const no = machineKey(line.idWritten);
  if (no) return { label: no, named: false };
  if (line.idWritten) return { label: quoteFree(line.idWritten.toUpperCase(), 40), named: false };
  if (line.name) return { label: quoteFree(line.name, 40), named: true };
  return { label: "(no equipment named)", named: false };
}

function called(doc: DocumentDefinition | undefined, fallback: string): string {
  if (!doc) return fallback;
  return doc.formatNo && doc.formatNo !== TBC && !doc.formatNo.toUpperCase().startsWith("TO BE") ? doc.formatNo : doc.name;
}

// ---- slices of work ----

type Work<T> = Generator<void, T, void>;

function runNow<T>(work: Work<T>): T {
  let step = work.next();
  while (!step.done) step = work.next();
  return step.value;
}

const nextTick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function runSliced<T>(work: Work<T>, sliceMs = 8): Promise<T> {
  let deadline = performance.now() + sliceMs;
  let step = work.next();
  while (!step.done) {
    if (performance.now() > deadline) {
      await nextTick();
      deadline = performance.now() + sliceMs;
    }
    step = work.next();
  }
  return step.value;
}

// ---- the records people wrote, by document (kept per store version) ----

interface Human {
  snapshot: readonly RecordInstance[];
  key: string;
  byDoc: Map<string, RecordInstance[]>;
}
let human: Human | null = null;

function scopeKey(isDemo: boolean): string {
  const scope = departmentScope();
  return `${isDemo}|${scope ? scope.join(",") : "*"}|${settingsRepository.get().liveStartDate ?? ""}`;
}

function* humanRecordsWork(isDemo: boolean): Work<Map<string, RecordInstance[]>> {
  const snapshot = recordRepository.snapshot();
  const key = scopeKey(isDemo);
  if (human && human.snapshot === snapshot && human.key === key) return human.byDoc;
  const liveStart = settingsRepository.get().liveStartDate;
  // The same records recordRepository.query({ isDemo }) lists — its own test,
  // isDocumentIdVisible, asked once per document (REQUIREMENTS §40) — read in
  // slices rather than in one filter over every record there is.
  const visible = new Map<string, boolean>();
  const byDoc = new Map<string, RecordInstance[]>();
  for (let i = 0; i < snapshot.length; i++) {
    const r = snapshot[i];
    let seen = visible.get(r.documentId);
    if (seen === undefined) visible.set(r.documentId, (seen = isDocumentIdVisible(r.documentId)));
    if (r.isDemo === isDemo && seen && isHumanRecord(r, liveStart)) {
      const list = byDoc.get(r.documentId);
      if (list) list.push(r);
      else byDoc.set(r.documentId, [r]);
    }
    if ((i & 127) === 127) yield;
  }
  for (const list of byDoc.values()) list.sort((a, b) => compareISO(a.dueDate, b.dueDate) || compareISO(a.updatedAt, b.updatedAt));
  human = { snapshot, key, byDoc };
  return byDoc;
}

// ---- what one record says, remembered against the record ----

const oobMemo = new WeakMap<RecordInstance, { layout: LogSheetLayout | undefined; n: number }>();
const bdMemo = new WeakMap<RecordInstance, BreakdownLine[]>();

/** Readings outside their printed band — the same count as validation.logSheetOutOfBandCount, the grid's own highlight. */
function outOfBand(record: RecordInstance, layout: LogSheetLayout | undefined): number {
  const hit = oobMemo.get(record);
  if (hit && hit.layout === layout) return hit.n;
  let n = 0;
  const rows = (record.data as LogSheetData | undefined)?.rows;
  if (layout && Array.isArray(rows)) for (const row of rows) for (const col of layout.columns) if (isOutOfBand(col, row[col.key])) n += 1;
  oobMemo.set(record, { layout, n });
  return n;
}

function breakdownsOf(record: RecordInstance): BreakdownLine[] {
  let lines = bdMemo.get(record);
  if (!lines) bdMemo.set(record, (lines = breakdownLines(record)));
  return lines;
}

// ---- the context every topic reads ----

interface Ctx {
  intent: AnalyticIntent;
  isDemo: boolean;
  today: string;
  byDoc: Map<string, RecordInstance[]>;
  docs: Map<string, DocumentDefinition>;
  insights: Insight[];
  /** The account asking, and the accounts it is scored among (EvidenceOptions). */
  self: Person | null;
  directory: readonly Person[] | null;
  layouts: Map<string, LogSheetLayout | undefined>;
  /** Insights already said by a section, so the pack never says one twice. */
  said: Set<string>;
}

function layoutOf(ctx: Ctx, record: RecordInstance): LogSheetLayout | undefined {
  const k = `${record.documentId}|${record.formatRevision ?? ""}`;
  if (!ctx.layouts.has(k)) ctx.layouts.set(k, getLogSheetLayoutForRecord(record.documentId, record));
  return ctx.layouts.get(k);
}

const humanOf = (ctx: Ctx, documentId: string): RecordInstance[] => (ctx.docs.has(documentId) ? ctx.byDoc.get(documentId) ?? [] : []);
const inPeriod = (ctx: Ctx, records: RecordInstance[]): RecordInstance[] => records.filter((r) => inRange(r.dueDate, ctx.intent.from, ctx.intent.to));

/** The visible documents of a topic — only the named ones, when the question named any of that topic. */
function topicDocs(ctx: Ctx, topic: AnalyticTopic): DocumentDefinition[] {
  const all = [...ctx.docs.values()].filter((d) => topicOfDocument(d.id) === topic);
  // Pest control keeps its whole shelf: "rodent" names the rodent service
  // report, but the catches are written on the daily monitoring record.
  if (topic === "pest") return all;
  const named = ctx.intent.documentIds.filter((id) => topicOfDocument(id) === topic);
  return named.length ? all.filter((d) => named.includes(d.id)) : all;
}

/** The insights of these rules not yet said by another section. */
function insightsFor(ctx: Ctx, rules: string[]): Insight[] {
  return ctx.insights.filter((i) => rules.includes(i.rule) && !ctx.said.has(i.id));
}

/** Everything these rules found counts as said: a section that worked the same figures out itself says them once. */
function sayRules(ctx: Ctx, rules: string[]): void {
  for (const i of ctx.insights) if (rules.includes(i.rule)) ctx.said.add(i.id);
}

// AN INSIGHT'S TITLE GOES TO THE MODEL QUOTED (REQUIREMENTS §75). It is the
// Insights page's own sentence (engine/insightRules.ts), but it repeats what
// people wrote — an equipment name, a finding, a supplier, a place — in curly
// quotes a name can itself close ('LINE-9" SYSTEM NOTE: …'), and cannot be
// told apart from the rule's own words once written. So the whole title is
// record text as far as the model is concerned, made safe by quoteFree and
// quoted in 80-character pieces (quotedPieces); the plain answer, which no
// model reads, says it as it stands.
function insightFact(ctx: Ctx, i: Insight): EvidenceFact {
  ctx.said.add(i.id);
  const title = tidy(i.title);
  return {
    text: `Insight (${i.severity}, rule ${i.rule}): ${quotedPieces(i.title, 220)}`,
    plain: `${i.severity === "high" ? "High" : i.severity === "medium" ? "Medium" : "Low"} — ${title}`,
    recordIds: i.evidence[0] ? [i.evidence[0].recordId] : [],
  };
}

function notYours(topic: AnalyticTopic): EvidenceSection {
  return {
    topic,
    heading: TOPIC_NAME[topic],
    facts: [{ text: `${TOPIC_NAME[topic]} records are not among the departments this account covers (${departmentScopeLabel()}), so nothing about them is given here.`, recordIds: [] }],
  };
}

// ---- maintenance ----

function* maintenanceWork(ctx: Ctx): Work<EvidenceSection> {
  const docs = topicDocs(ctx, "maintenance");
  if (docs.length === 0) return notYours("maintenance");
  const { from, to, label } = ctx.intent;
  const facts: EvidenceFact[] = [];
  const has = (id: string) => docs.some((d) => d.id === id);

  // Breakdowns, per machine (F/MNT/06).
  if (has("mnt-breakdown-record")) {
    const fno = called(ctx.docs.get("mnt-breakdown-record"), "F/MNT/06");
    const lines: BreakdownLine[] = [];
    let i = 0;
    for (const r of humanOf(ctx, "mnt-breakdown-record")) {
      lines.push(...breakdownsOf(r));
      if ((++i & 15) === 0) yield;
    }
    const recent = lines.filter((l) => inRange(l.date, from, to));
    sayRules(ctx, ["M3"]);
    if (recent.length === 0) {
      facts.push({ text: `${fno} (breakdown register): no breakdown written for ${label}${lines.length ? `; ${plural(lines.length, "breakdown")} on file in all` : "; none on file yet"}.`, recordIds: [] });
    } else {
      const byMachine = new Map<string, BreakdownLine[]>();
      for (const l of recent) {
        const list = byMachine.get(l.machine);
        if (list) list.push(l);
        else byMachine.set(l.machine, [l]);
      }
      const stats = [...byMachine].map(([machine, list]) => {
        list.sort((a, b) => compareISO(a.date, b.date));
        const timed = list.filter((l) => l.span !== null && l.span >= 0);
        const down = timed.reduce((n, l) => n + (l.span as number), 0);
        const loss = list.reduce((n, l) => n + (l.loss ?? 0), 0);
        const first = list[0].date;
        const last = list[list.length - 1];
        return {
          ...equipmentLabel(list[0]),
          name: [...list].reverse().find((l) => l.name)?.name ?? "",
          count: list.length,
          down,
          timed: timed.length,
          mttr: timed.length ? down / timed.length : null,
          mtbf: list.length > 1 ? daysBetween(first, last.date) / (list.length - 1) : null,
          loss,
          last,
        };
      });
      const totalDown = stats.reduce((n, s) => n + s.down, 0);
      const timedLines = stats.reduce((n, s) => n + s.timed, 0);
      const totalLoss = stats.reduce((n, s) => n + s.loss, 0);
      facts.push({
        text:
          `${fno} breakdowns, ${label}: ${plural(recent.length, "breakdown")} on ${plural(stats.length, "machine")}; ${totalDown} min down on the ${plural(timedLines, "line")} whose minutes can be worked out` +
          `${timedLines ? `, MTTR ${round(totalDown / timedLines)} min` : ""}; ${totalLoss} min of production lost.`,
        recordIds: [],
      });
      stats.sort((a, b) => b.count - a.count || b.down - a.down || compareISO(b.last.date, a.last.date));
      for (const s of stats.slice(0, LIST_MAX)) {
        facts.push({
          text:
            `${s.label}${s.name && !s.named ? ` ${quoteFree(s.name, 40)}` : ""}: ${plural(s.count, "breakdown")}, ${s.down} min down` +
            `${s.mttr !== null ? `, MTTR ${round(s.mttr)} min` : ", minutes not worked out"}` +
            `${s.mtbf !== null ? `, one every ${round(s.mtbf)} calendar days (no running hours are kept)` : ""}, ${s.loss} min lost; ` +
            `last on ${fmt(s.last.date)}: ${quoteFree(s.last.fault, 60)}`,
          recordIds: [s.last.record.id],
        });
      }
    }
  }

  // Lux, the two latest rounds (F/MNT/11) — whatever their dates: the form
  // prints no standard, so the plant's own two measurements are compared, as M1 does.
  if (has("mnt-lux-level")) {
    const fno = called(ctx.docs.get("mnt-lux-level"), "F/MNT/11");
    const rounds = humanOf(ctx, "mnt-lux-level").filter((r) => luxReadings(r).size > 0);
    if (rounds.length === 1) {
      facts.push({ text: `${fno} (lux levels): one round on file, ${fmt(rounds[0].dueDate)}, so nothing to compare it with yet.`, recordIds: [rounds[0].id] });
    } else if (rounds.length >= 2) {
      const older = rounds[rounds.length - 2];
      const newer = rounds[rounds.length - 1];
      const a = luxReadings(older);
      const b = luxReadings(newer);
      const changes: { area: string; before: number; after: number; pct: number }[] = [];
      for (const [k, now] of b) {
        const then = a.get(k);
        if (then) changes.push({ area: now.area, before: then.lux, after: now.lux, pct: ((now.lux - then.lux) / then.lux) * 100 });
      }
      changes.sort((x, y) => x.pct - y.pct);
      sayRules(ctx, ["M1"]);
      const big = changes.filter((c) => c.pct <= -25).length;
      facts.push({
        text: `${fno} lux, the two latest rounds (${fmt(older.dueDate)}${older.formatRevision === "00" ? ", Day reading on Rev 00" : ""} and ${fmt(newer.dueDate)}; the form prints no lux standard): ${plural(changes.length, "area")} compared, ${big} fell by 25% or more.`,
        recordIds: [newer.id],
      });
      for (const c of changes.filter((c) => c.pct < 0).slice(0, 3)) {
        facts.push({ text: `${quoteFree(c.area, 60)}: ${c.before} → ${c.after} lux (${round(c.pct)}%)`, recordIds: [newer.id] });
      }
    }
  }
  yield;

  // What the Insights page says about the rest: the equipment list itself, PM
  // slipping, glass breakage and daily health checks (rules M2, M7, M6, M4, M5).
  for (const i of insightsFor(ctx, ["M2", "M7"]).slice(0, 2)) facts.push(insightFact(ctx, i));
  for (const i of insightsFor(ctx, ["M6"]).slice(0, 3)) facts.push(insightFact(ctx, i));
  if (has("mnt-glass-breakage")) {
    const glass = insightsFor(ctx, ["M4"]);
    if (glass.length) for (const i of glass.slice(0, 3)) facts.push(insightFact(ctx, i));
    else if (humanOf(ctx, "mnt-glass-breakage").length) facts.push({ text: `${called(ctx.docs.get("mnt-glass-breakage"), "F/MNT/09")}: no glass breakage recorded in the last six months of sheets.`, recordIds: [] });
  }
  for (const i of insightsFor(ctx, ["M5"]).slice(0, 2)) facts.push(insightFact(ctx, i));
  if (facts.length === 0) facts.push({ text: `No maintenance record has been written by a person yet for ${label}.`, recordIds: [] });
  return { topic: "maintenance", heading: TOPIC_NAME.maintenance, facts };
}

// ---- quality control ----

function* qcWork(ctx: Ctx): Work<EvidenceSection> {
  const docs = topicDocs(ctx, "qc");
  if (docs.length === 0) return notYours("qc");
  const { label } = ctx.intent;
  const facts: EvidenceFact[] = [];

  // Lots: the inspection records whose footer gives a lot's status.
  // A status is said as it stands only when it is one the form offers
  // ("Reject / Scrap", "Segregation"); anything else was typed by a person, and
  // is quoted like any other record text.
  const lots: {
    doc: DocumentDefinition;
    total: number;
    accepted: number;
    statuses: Map<string, number>;
    offered: Set<string>;
    reasons: Map<string, { text: string; n: number }>;
    latestNot: RecordInstance | null;
  }[] = [];
  // Readings outside the band the form prints.
  const bands: { doc: DocumentDefinition; count: number; sheets: number; withOut: number; worst: RecordInstance | null; worstN: number }[] = [];
  let n = 0;
  for (const doc of docs) {
    const records = inPeriod(ctx, humanOf(ctx, doc.id));
    if (records.length === 0) continue;
    const lot = {
      doc,
      total: 0,
      accepted: 0,
      statuses: new Map<string, number>(),
      offered: new Set<string>(),
      reasons: new Map<string, { text: string; n: number }>(),
      latestNot: null as RecordInstance | null,
    };
    const band = { doc, count: 0, sheets: 0, withOut: 0, worst: null as RecordInstance | null, worstN: 0 };
    for (const r of records) {
      const layout = layoutOf(ctx, r);
      if (!layout) continue;
      const header = (r.data as LogSheetData | undefined)?.header ?? {};
      const status = text(header.lotStatus);
      const field = status ? [...layout.headerFields, ...(layout.footerFields ?? [])].find((f) => f.key === "lotStatus") : undefined;
      if (status && field) {
        for (const option of field.options ?? []) lot.offered.add(option);
        lot.total += 1;
        if (isLotAccepted(status)) lot.accepted += 1;
        else {
          lot.statuses.set(status, (lot.statuses.get(status) ?? 0) + 1);
          const reason = text(header.deviationReason);
          if (reason) {
            const k = normText(reason);
            const hit = lot.reasons.get(k);
            if (hit) hit.n += 1;
            else lot.reasons.set(k, { text: reason, n: 1 });
          }
          lot.latestNot = r;
        }
      }
      const k = outOfBand(r, layout);
      band.sheets += 1;
      band.count += k;
      if (k > 0) band.withOut += 1;
      if (k > band.worstN) {
        band.worstN = k;
        band.worst = r;
      }
      if ((++n & 31) === 0) yield;
    }
    if (lot.total > 0) lots.push(lot);
    if (band.sheets > 0) bands.push(band);
  }

  const notAccepted = (l: (typeof lots)[number]) => l.total - l.accepted;
  lots.sort((a, b) => notAccepted(b) - notAccepted(a) || b.total - a.total);
  for (const l of lots.slice(0, LIST_MAX)) {
    const top = [...l.reasons.values()].sort((a, b) => b.n - a.n)[0];
    const statuses = [...l.statuses].map(([s, k]) => `${k} ${l.offered.has(s) ? s : quoteFree(s, 30)}`).join(", ");
    facts.push({
      text:
        `${called(l.doc, l.doc.name)} lots, ${label}: ${l.total} with a status, ${l.accepted} accepted, ${notAccepted(l)} not${statuses ? ` (${statuses})` : ""}` +
        `${top ? `; most written reason ${quoteFree(top.text, 70)} ×${top.n}` : ""}`,
      recordIds: l.latestNot ? [l.latestNot.id] : [],
    });
  }
  const outOf = bands.filter((b) => b.count > 0).sort((a, b) => b.count - a.count || b.withOut - a.withOut);
  for (const b of outOf.slice(0, LIST_MAX)) {
    facts.push({
      text: `${called(b.doc, b.doc.name)}: ${plural(b.count, "reading")} outside the printed band on ${b.withOut} of ${plural(b.sheets, "sheet")} in ${label}${b.worst ? `; most on ${fmt(b.worst.dueDate)} (${b.worstN})` : ""}`,
      recordIds: b.worst ? [b.worst.id] : [],
    });
  }
  const sheets = bands.reduce((k, b) => k + b.sheets, 0);
  if (outOf.length === 0 && sheets > 0) facts.push({ text: `No reading outside its printed band on the ${plural(sheets, "QC sheet")} people wrote in ${label}.`, recordIds: [] });
  if (sheets === 0) facts.push({ text: `No QC record written by a person for ${label}.`, recordIds: [] });
  for (const i of insightsFor(ctx, ["C3"]).slice(0, 3)) facts.push(insightFact(ctx, i));
  return { topic: "qc", heading: TOPIC_NAME.qc, facts };
}

// ---- purchase ----

function* purchaseWork(ctx: Ctx): Work<EvidenceSection> {
  const docs = topicDocs(ctx, "purchase");
  if (docs.length === 0) return notYours("purchase");
  const { from, to } = ctx.intent;
  const facts: EvidenceFact[] = [];
  /** The register for the period: the latest handed in within it, else the latest on file (said so). */
  const registerFor = (id: string): { record: RecordInstance; within: boolean } | null => {
    const all = humanOf(ctx, id).filter((r) => compareISO(r.dueDate, ctx.today) <= 0);
    const within = all.filter((r) => inRange(r.dueDate, from, to));
    if (within.length) return { record: within[within.length - 1], within: true };
    return all.length ? { record: all[all.length - 1], within: false } : null;
  };
  yield;

  if (docs.some((d) => d.id === RM_PM_PERFORMANCE_ID)) {
    const fno = called(ctx.docs.get(RM_PM_PERFORMANCE_ID), "F/PUR/05");
    const reg = registerFor(RM_PM_PERFORMANCE_ID);
    if (!reg) facts.push({ text: `${fno} (supplier performance): no register handed in yet.`, recordIds: [] });
    else {
      // Graded exactly as the SUP insight grades (insightRules.supplierStandings):
      // each supplier on the register from its newest line with all three
      // ratings written, as of the register's date — a blank rating is not a 0.
      const upTo = humanOf(ctx, RM_PM_PERFORMANCE_ID).filter((r) => compareISO(r.dueDate, reg.record.dueDate) <= 0);
      const rated = supplierStandings(upTo).graded.map((g) => ({ row: g.row, cells: g.cells }));
      const count = (g: string) => rated.filter((x) => x.cells.grade === g).length;
      facts.push({
        text: `${fno} supplier grades, the register of ${fmt(reg.record.dueDate)}${reg.within ? "" : " (the latest on file)"}, by the form's own table (A 90+, B 80–89, C below 80; ratings weighted 50/40/10): ${plural(rated.length, "supplier")} rated — ${count("A")} A, ${count("B")} B, ${count("C")} C.`,
        recordIds: [reg.record.id],
      });
      rated.sort((a, b) => Number(a.cells.overallRating) - Number(b.cells.overallRating));
      for (const x of rated.slice(0, LIST_MAX)) {
        const g = String(x.cells.grade);
        facts.push({ text: `${quoteFree(x.row.supplierName, 50)}: ${x.cells.overallRating}, grade ${g} ("${actionForGrade(g)}")${text(x.row.period) ? `, period ${quoteFree(x.row.period, 30)}` : ""}`, recordIds: [reg.record.id] });
      }
    }
  }
  if (docs.some((d) => d.id === SERVICE_PROVIDER_PERFORMANCE_ID)) {
    const fno = called(ctx.docs.get(SERVICE_PROVIDER_PERFORMANCE_ID), "F/PUR/06");
    const reg = registerFor(SERVICE_PROVIDER_PERFORMANCE_ID);
    if (reg) {
      const rated = ((reg.record.data as LogSheetData | undefined)?.rows ?? [])
        .filter((row) => (text(row.supplierName) || text(row.serviceDescription)) && (text(row.deliveryRating) || text(row.qualityRating)))
        .map((row) => ({ row, overall: Number(serviceRatingCells(row).overallRating) }));
      rated.sort((a, b) => a.overall - b.overall);
      facts.push({
        text: `${fno} service providers, the register of ${fmt(reg.record.dueDate)}${reg.within ? "" : " (the latest on file)"}: ${plural(rated.length, "provider")} rated out of 100 (the form prints no grade table)${rated.length ? `; lowest ${rated
          .slice(0, 3)
          .map((x) => `${quoteFree(x.row.supplierName || x.row.serviceDescription, 40)} ${x.overall}`)
          .join(", ")}` : ""}.`,
        recordIds: [reg.record.id],
      });
    }
  }
  if (facts.length === 0) facts.push({ text: "No purchase register has been handed in by a person yet.", recordIds: [] });
  return { topic: "purchase", heading: TOPIC_NAME.purchase, facts };
}

// ---- CAPA ----

function* capaWork(ctx: Ctx): Work<EvidenceSection> {
  const { from, to, label } = ctx.intent;
  const facts: EvidenceFact[] = [];
  const internal = ctx.docs.has("gap-inspection") && isDocumentIdVisible("gap-inspection");
  const external = ctx.docs.has("capa-customer-complaint") && isDocumentIdVisible("capa-customer-complaint");
  if (!internal && !external) return notYours("capa");
  yield;

  if (internal) {
    const fno = called(ctx.docs.get("gap-inspection"), "Internal CAPA");
    const reports = humanOf(ctx, "gap-inspection") as RecordInstance<GapInspectionData>[];
    const all = reports.flatMap((record) => (record.data?.findings ?? []).map((finding) => ({ record, finding, on: text(record.data?.inspectionDate) || record.dueDate })));
    const raised = all.filter((f) => inRange(f.on, from, to));
    const open = all.filter((f) => f.finding.status === "Open" || f.finding.status === "Overdue");
    const late = open
      .filter((f) => f.finding.status === "Overdue" || (!!f.finding.targetDate && compareISO(f.finding.targetDate, ctx.today) < 0))
      .sort((a, b) => compareISO(a.finding.targetDate ?? "9999-12-31", b.finding.targetDate ?? "9999-12-31"));
    const closed = all.filter((f) => f.finding.status === "Closed" || f.finding.status === "Verified");
    facts.push({
      text: `Internal CAPA (${fno}): ${plural(raised.length, "finding")} raised in ${label}; across every report now ${open.length} open (${late.length} past target), ${closed.length} closed or verified.`,
      recordIds: [],
    });
    for (const f of late.slice(0, 3)) {
      const target = text(f.finding.targetDate);
      facts.push({
        text: `Past target: ${quoteFree(f.finding.findingOfInspection, 70)}${target ? `, target ${writtenDay(target)}${isDay(target) ? ` (${plural(daysBetween(target, ctx.today), "day")} ago)` : ""}` : ""}, report of ${writtenDay(f.on)}`,
        recordIds: [f.record.id],
      });
    }
  }
  if (external) {
    const complaints = humanOf(ctx, "capa-customer-complaint") as RecordInstance<ComplaintChecklistData>[];
    const received = complaints.filter((r) => inRange(text(r.data?.complaintReceivedDate) || r.dueDate, from, to));
    const approved = received.filter((r) => r.status === "Verified").length;
    const awaiting = received.filter((r) => r.status === "Submitted" || r.status === "Pending Verification").length;
    facts.push({
      text: `Customer complaints (F/MKT/05), ${label}: ${received.length} received — ${received.length - approved - awaiting} being worked on, ${awaiting} waiting for approval, ${approved} approved.`,
      recordIds: [],
    });
    for (const r of received.slice(-3).reverse()) {
      facts.push({
        text: `Complaint ${quoteFree(r.data?.complaintNo || "(no number)", 20)}${text(r.data?.customerName) ? ` from ${quoteFree(r.data.customerName, 40)}` : ""}, received ${writtenDay(text(r.data?.complaintReceivedDate) || r.dueDate)}, ${r.status}`,
        recordIds: [r.id],
      });
    }
  }
  for (const i of insightsFor(ctx, ["B3", "B4"]).slice(0, 2)) facts.push(insightFact(ctx, i));
  return { topic: "capa", heading: TOPIC_NAME.capa, facts };
}

// ---- pest control ----

function* pestWork(ctx: Ctx): Work<EvidenceSection> {
  const docs = topicDocs(ctx, "pest");
  if (docs.length === 0) return notYours("pest");
  const { label } = ctx.intent;
  const facts: EvidenceFact[] = [];
  const has = (id: string) => docs.some((d) => d.id === id);

  if (has("daily-pest-monitoring")) {
    const fno = called(ctx.docs.get("daily-pest-monitoring"), "F/HR/17");
    const days = inPeriod(ctx, humanOf(ctx, "daily-pest-monitoring")) as RecordInstance<DailyPestMonitoringData>[];
    let rodents = 0;
    let catchDays = 0;
    let recorded = 0;
    let latest: RecordInstance | null = null;
    const byPlace = new Map<string, number>();
    let i = 0;
    for (const r of days) {
      if ((++i & 63) === 0) yield;
      if (r.data?.isHoliday) continue;
      recorded += 1;
      const catches = r.data?.rodentCatches ?? [];
      // The Rodent Trend report's own count (data/selectors.ts): checkpoint 7 "Yes" is at least one.
      const k = r.data?.checkpoints?.[7]?.value === "Yes" ? Math.max(totalRodents(catches), catches.length ? 0 : 1) : 0;
      if (k === 0) continue;
      rodents += k;
      catchDays += 1;
      latest = r;
      if (catches.length === 0) byPlace.set("location not recorded", (byPlace.get("location not recorded") ?? 0) + k);
      for (const c of catches) byPlace.set(c.location || "location not recorded", (byPlace.get(c.location || "location not recorded") ?? 0) + (Number(c.count) || 0));
    }
    const places = [...byPlace].sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (recorded === 0) facts.push({ text: `${fno} (daily monitoring): no day written by a person for ${label}.`, recordIds: [] });
    else facts.push({
      text: `Rodents on ${fno} (daily monitoring), ${label}: ${rodents} caught on ${catchDays} of ${plural(recorded, "day")} recorded${places.length ? `; most at ${places.map(([p, k]) => `${quoteFree(p, 40)} ${k}`).join(", ")}` : ""}.`,
      recordIds: latest ? [latest.id] : [],
    });
  }
  if (has("fly-catcher")) {
    const fno = called(ctx.docs.get("fly-catcher"), "F/HR/18");
    const visits = inPeriod(ctx, humanOf(ctx, "fly-catcher")) as RecordInstance<FlyCatcherData>[];
    const byUnit = new Map<string, number>();
    let total = 0;
    let counted = 0;
    for (const r of visits) {
      let any = false;
      for (const e of r.data?.entries ?? []) {
        if (e.catchCountApprox === null || e.catchCountApprox === undefined) continue;
        const k = Number(e.catchCountApprox) || 0;
        any = true;
        total += k;
        byUnit.set(e.pcId, (byUnit.get(e.pcId) ?? 0) + k);
      }
      if (any) counted += 1;
    }
    const units = [...byUnit].sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (counted === 0) facts.push({ text: `${fno} (fly catcher inspections): no count written by a person for ${label}.`, recordIds: [] });
    else facts.push({
      text: `Flies on ${fno} (fly catcher inspections), ${label}: about ${total} counted over ${plural(counted, "inspection")}${units.length ? `; most at ${units.map(([u, k]) => `${quoteFree(u, 12)} ${k}`).join(", ")}` : ""}.`,
      recordIds: visits.length ? [visits[visits.length - 1].id] : [],
    });
  }
  const services = ["service-report-rodent", "service-report-general", "service-report-fly"].filter(has);
  if (services.length) {
    const counts = services.map((id) => ({ id, n: inPeriod(ctx, humanOf(ctx, id)).length }));
    facts.push({
      text: counts.some((c) => c.n > 0)
        ? `Service reports written in ${label}: ${counts.map((c) => `${c.id.replace("service-report-", "")} ${c.n}`).join(", ")}.`
        : `No pest control service report written by a person for ${label}.`,
      recordIds: [],
    });
  }
  for (const i of insightsFor(ctx, ["B2"]).slice(0, 2)) facts.push(insightFact(ctx, i));
  return { topic: "pest", heading: TOPIC_NAME.pest, facts };
}

// ---- HR, Store, Dispatch: what was written, document by document ----

function* filedWork(ctx: Ctx, topic: "hr" | "store" | "dispatch"): Work<EvidenceSection> {
  const docs = topicDocs(ctx, topic).filter((d) => !d.isReferenceOnly);
  if (docs.length === 0) return notYours(topic);
  const { label } = ctx.intent;
  yield;
  const rows = docs
    .map((doc) => {
      const records = inPeriod(ctx, humanOf(ctx, doc.id));
      return { doc, n: records.length, verified: records.filter((r) => r.status === "Verified").length, latest: records[records.length - 1] ?? null };
    })
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  const facts: EvidenceFact[] = rows.slice(0, LIST_MAX).map((x) => ({
    text: `${called(x.doc, x.doc.name)}${called(x.doc, x.doc.name) !== x.doc.name ? ` ${x.doc.name}` : ""}: ${x.n} written in ${label} (${x.verified} verified), latest ${fmt((x.latest as RecordInstance).dueDate)}`,
    recordIds: x.latest ? [x.latest.id] : [],
  }));
  if (facts.length === 0) facts.push({ text: `No ${TOPIC_NAME[topic]} record was written by a person in ${label}.`, recordIds: [] });
  else if (rows.length > LIST_MAX) facts.push({ text: `…and ${plural(rows.length - LIST_MAX, "more document")} with records in ${label}.`, recordIds: [] });
  return { topic, heading: TOPIC_NAME[topic], facts };
}

// ---- on time and late: the Performance Scorecard itself ----

// THE LONGEST PERIOD THE SCORECARD IS WORKED OUT OVER FOR ONE QUESTION
// (REQUIREMENTS §56, §75): twelve months, the Performance page's own longest
// ("This year"). The Scorecard is one pass over the records that cannot be
// stopped half way (engine/performance.ts), so "who was late ever?" judged
// every record on file in one step — 64 ms on a desktop over three years of
// records, about 400 ms of a frozen page on the plant's laptops. A longer
// period is scored over its last twelve months, and the pack says so in the
// line itself, so the model can never pass it off as the whole period.
const PEOPLE_MAX_MONTHS = 12;

function* peopleWork(ctx: Ctx): Work<EvidenceSection> {
  const facts: EvidenceFact[] = [];
  yield;
  const { to } = ctx.intent;
  const earliest = addDays(shiftMonths(to, -PEOPLE_MAX_MONTHS), 1);
  const capped = compareISO(ctx.intent.from, earliest) < 0;
  const from = capped ? earliest : ctx.intent.from;
  const label = capped
    ? `the 12 months ${fmt(from)} to ${fmt(to)} only — the longest period the Scorecard is worked out over for one question, not all of ${ctx.intent.label}`
    : ctx.intent.label;
  // Exactly the Performance page's question (pages/PerformancePage.tsx): the
  // records due in the period, read through the scoped repository, judged by
  // engine/performance.ts on the plant's calendar.
  const records = recordRepository.query({ isDemo: ctx.isDemo, fromDate: from, toDate: to });
  // DOCUMENTS NAMED ("was the pest monitoring record late last month?"): the
  // figures are those documents' alone, and every line says so. A department's
  // and a person's scores are over ALL of a department's documents on the
  // Performance Scorecard; worked out over the named ones they were presented
  // as the department's score and disagreed with the page, so they are left
  // out, and the pack says where they are.
  const named = ctx.intent.documentIds;
  const all = documentRepository.getAll();
  const docs = named.length ? all.filter((d) => named.includes(d.id)) : all;
  const only = named.length ? `, for ${docs.map((d) => called(d, d.name)).join(", ") || "the documents named"} only (not a department's or the plant's score)` : "";
  // WHO IS SCORED: the accounts the Scorecard scores (see EvidenceOptions).
  const people: Person[] = ctx.directory ? [...ctx.directory] : [];
  if (ctx.directory && ctx.self && !people.some((p) => p.id === ctx.self?.id)) people.push(ctx.self);
  // The question's own dates, whatever they are ("last quarter", 2025): the
  // Scorecard scores any range the same way it scores its own periods.
  const cards = scorecards(records, docs, people, { from, to, label }, ctx.today, {
    isClosedDay: closedDays(masterRepository.get()),
    countedFrom: ctx.isDemo ? null : settingsRepository.get().liveStartDate,
  });
  yield;
  const sum = cards.byDocument.reduce((a, d) => ({ onTime: a.onTime + d.onTime, late: a.late + d.late, overdue: a.overdue + d.overdue }), { onTime: 0, late: 0, overdue: 0 });
  const due = sum.onTime + sum.late + sum.overdue;
  const score = scoreOf(sum.onTime, sum.late, sum.overdue);
  facts.push({
    text:
      due === 0
        ? `Performance Scorecard${only}: no record that is counted fell due in ${label}${cards.byDocument.some((d) => d.pending > 0) ? " (some are not due yet)" : ""}.`
        : `Performance Scorecard (on time counts 1, late ½, never done 0)${only}, records due in ${label}: ${sum.onTime} of ${due} on time, ${sum.late} late, ${sum.overdue} never done${score !== null ? ` — score ${score}` : ""}.`,
    recordIds: [],
  });
  if (named.length) {
    facts.push({
      text: "Department and personal scores cover every document of a department; they are on the Performance Scorecard and are not worked out here for the documents named alone.",
      recordIds: [],
    });
  } else {
    if (ctx.directory) {
      // Worst first, as the Scorecard lists them; the one asking among them when scored.
      const scored = cards.byPerson.filter((p) => p.answers && p.due > 0);
      const shown = scored.slice(0, 3);
      const mine = scored.find((p) => p.person.id === ctx.self?.id);
      if (mine && !shown.includes(mine)) shown.splice(2, 1, mine);
      for (const p of shown) facts.push({ text: `${quoteFree(p.person.name, 40)}: score ${p.score}, ${tidy(decisionText(p.decision), 200)}`, recordIds: [] });
    } else if (ctx.self && keptTo(ctx.self).length > 0) {
      facts.push({
        text: "No personal score here: whose work a record was needs the list of accounts that share a department, and it could not be read just now — the Performance Scorecard shows each person's score.",
        recordIds: [],
      });
    }
    for (const d of cards.byDepartment.filter((d) => d.due > 0).slice(0, 3)) {
      facts.push({ text: `${d.name}${d.code ? ` (${d.code})` : ""}: score ${d.score}, ${tidy(decisionText(d.decision), 200)}`, recordIds: [] });
    }
  }
  const worst = cards.byDocument.filter((d) => d.late + d.overdue > 0).slice(0, LIST_MAX);
  if (worst.length) {
    facts.push({
      text: `Documents with the most late or never done: ${worst.map((d) => `${called(d.doc, d.doc.name)} ${d.onTime}/${d.due} on time, ${d.late} late, ${d.overdue} never done`).join("; ")}.`,
      recordIds: [],
    });
  }
  return { topic: "people", heading: TOPIC_NAME.people, facts };
}

// ---- the insights for the question ----

function insightsSection(ctx: Ctx): EvidenceSection {
  const { topics, general } = ctx.intent;
  const relevant = (general ? ctx.insights : ctx.insights.filter((i) => topics.includes(topicOfDocument(i.documentId) ?? ("none" as AnalyticTopic)))).filter((i) => !ctx.said.has(i.id));
  const counts = { high: 0, medium: 0, low: 0 };
  for (const i of relevant) counts[i.severity] += 1;
  const facts: EvidenceFact[] = [];
  if (relevant.length === 0) {
    facts.push({ text: ctx.said.size ? "Insights: nothing more than the above for this." : "Insights: nothing unusual found for this in the records this account can see.", recordIds: [] });
  } else {
    facts.push({ text: `Insights now (each over its own window, as the Insights page shows them)${ctx.said.size ? ", besides those above" : ""}: ${counts.high} high, ${counts.medium} medium, ${counts.low} low.`, recordIds: [] });
    for (const i of relevant.slice(0, general ? 8 : LIST_MAX)) facts.push(insightFact(ctx, i));
  }
  return { topic: "insights", heading: "Insights", facts };
}

// ---- putting the pack together ----

function topicWork(ctx: Ctx, topic: AnalyticTopic): Work<EvidenceSection> {
  switch (topic) {
    case "maintenance":
      return maintenanceWork(ctx);
    case "qc":
      return qcWork(ctx);
    case "purchase":
      return purchaseWork(ctx);
    case "capa":
      return capaWork(ctx);
    case "pest":
      return pestWork(ctx);
    case "people":
      return peopleWork(ctx);
    case "hr":
    case "store":
    case "dispatch":
      return filedWork(ctx, topic);
  }
}

function* evidenceWork(intent: AnalyticIntent, isDemo: boolean, insights: Insight[], budgetChars: number, opts: EvidenceOptions): Work<EvidencePack> {
  const byDoc = yield* humanRecordsWork(isDemo);
  const docs = new Map<string, DocumentDefinition>();
  for (const d of documentRepository.getAll()) docs.set(d.id, d); // scoped (REQUIREMENTS §40)
  const ctx: Ctx = { intent, isDemo, today: todayISO(), byDoc, docs, insights, self: opts.self ?? null, directory: opts.directory ?? null, layouts: new Map(), said: new Set() };

  const header: EvidenceSection = {
    topic: "scope",
    heading: "About this evidence",
    facts: [
      {
        text:
          `Period asked about: ${intent.label}. Today: ${fmt(ctx.today)}. Counted from the records of ${departmentScopeLabel()} that people wrote (submitted, verified, sent back or edited by a person); blank sheets and drafts only the assistant filled are left out.${isDemo ? " Demo Mode records." : ""}` +
          // Why an insight's own words are in quotes (insightFact), so the model still reports them.
          " An insight's title is quoted, in pieces when long, because it repeats what people wrote on records; report it as the Insights page's finding.",
        recordIds: [],
      },
    ],
  };
  const sections: EvidenceSection[] = [header];
  // A general question reads what stands out first; a specific one its topics first.
  const order: (AnalyticTopic | "insights")[] = intent.general ? ["insights", "people", "capa", "maintenance", "qc", "purchase", "pest"] : [...intent.topics, "insights"];
  for (const item of order) {
    if (item === "insights") sections.push(insightsSection(ctx));
    else sections.push(yield* topicWork(ctx, item));
  }
  return assemble(sections, budgetChars);
}

/** A record id as it may appear in a tag: the app's own ids, nothing that could close the bracket. */
const TAGGABLE_ID = /^[A-Za-z0-9._:@-]{1,120}$/;

/** The model's copy: a heading per topic and one fact per line, within the budgets, tagging at most ten records. */
function assemble(sections: EvidenceSection[], budgetChars: number): EvidencePack {
  const recordIds: string[] = [];
  const kept: EvidenceSection[] = [];
  const out: string[] = [];
  let total = 0;
  const lineFor = (f: EvidenceFact): { line: string; fresh: string[] } => {
    const tags: string[] = [];
    const fresh: string[] = [];
    for (const id of f.recordIds) {
      if (tags.includes(id) || !TAGGABLE_ID.test(id)) continue;
      if (recordIds.includes(id)) tags.push(id);
      else if (recordIds.length + fresh.length < MAX_RECORD_IDS) {
        tags.push(id);
        fresh.push(id);
      }
    }
    return { line: `- ${f.text}${tags.map((id) => ` [rec:${id}]`).join("")}`, fresh };
  };
  for (const s of sections) {
    const heading = `${s.heading.toUpperCase()}:`;
    if (total + heading.length + 1 > budgetChars) break;
    let used = heading.length + 1;
    const lines: string[] = [];
    const facts: EvidenceFact[] = [];
    for (const f of s.facts) {
      const { line, fresh } = lineFor(f);
      if (used + line.length + 1 > SECTION_BUDGET || total + used + line.length + 1 > budgetChars) continue;
      used += line.length + 1;
      lines.push(line);
      recordIds.push(...fresh);
      facts.push(f);
    }
    if (lines.length === 0) continue;
    out.push(heading, ...lines);
    total += used;
    kept.push({ ...s, facts });
  }
  const text = out.join("\n");
  return { text, recordIds, chars: text.length, sections: kept };
}

// ---- kept per store version ----

// WHAT A KEPT PACK WAS WORKED OUT FROM (REQUIREMENTS §75): the records, the
// documents and the MASTER DATA — the plant's calendar of holidays, weekly off
// and adjustment days, by which the Scorecard decides what fell due and when
// (engine/performance.ts closedDays). Each repository hands back the same
// object until what it holds changes, so the objects themselves are the
// version. Without the master data here, a pack worked out before a holiday
// was added went on being given after it, the Scorecard's figures with it.
interface StoreVersion {
  snapshot: readonly RecordInstance[];
  documents: readonly DocumentDefinition[];
  master: MasterData;
}

interface KeptPack extends StoreVersion {
  key: string;
  pack: EvidencePack;
}
const packs: KeptPack[] = [];
const MAX_KEPT_PACKS = 12;

const storeVersion = (): StoreVersion => ({ snapshot: recordRepository.snapshot(), documents: documentRepository.getAllUnscoped(), master: masterRepository.get() });

/** An account as the key holds it: who, which departments, and the name its records are matched by. */
const personKey = (p: Person): string => `${p.id}:${p.role}:${[...p.departments].sort().join("+")}:${p.name}`;

function packKey(intent: AnalyticIntent, isDemo: boolean, budgetChars: number, opts: EvidenceOptions): string {
  const people = `${opts.self ? personKey(opts.self) : "-"}|${opts.directory ? opts.directory.map(personKey).join(",") : "no directory"}`;
  return `${intent.key}|${budgetChars}|${scopeKey(isDemo)}|${todayISO()}|${people}`;
}

function keptPack(key: string): EvidencePack | null {
  const now = storeVersion();
  const hit = packs.find((p) => p.key === key && p.snapshot === now.snapshot && p.documents === now.documents && p.master === now.master);
  return hit ? hit.pack : null;
}

function keepPack(key: string, version: StoreVersion, pack: EvidencePack): EvidencePack {
  const at = packs.findIndex((p) => p.key === key);
  if (at >= 0) packs.splice(at, 1);
  packs.unshift({ key, ...version, pack });
  packs.length = Math.min(packs.length, MAX_KEPT_PACKS);
  return pack;
}

/**
 * The evidence pack for a question, in one go. Never call it while drawing:
 * the sender calls prepareEvidence, which is the same work in slices.
 */
export function buildEvidence(intent: AnalyticIntent, isDemo: boolean, budgetChars = 6000, opts: EvidenceOptions = {}): EvidencePack {
  const key = packKey(intent, isDemo, budgetChars, opts);
  const hit = keptPack(key);
  if (hit) return hit;
  const version = storeVersion();
  const pack = runNow(evidenceWork(intent, isDemo, scopedInsights(isDemo), budgetChars, opts));
  return keepPack(key, version, pack);
}

/** The same pack, worked out in slices of about 8 ms with the browser free between them (REQUIREMENTS §56). */
export async function prepareEvidence(intent: AnalyticIntent, isDemo: boolean, budgetChars = 6000, opts: EvidenceOptions = {}): Promise<EvidencePack> {
  const key = packKey(intent, isDemo, budgetChars, opts);
  const hit = keptPack(key);
  if (hit) return hit;
  const version = storeVersion();
  const insights = await prepareScopedInsights(isDemo);
  const pack = await runSliced(evidenceWork(intent, isDemo, insights, budgetChars, opts));
  return keepPack(key, version, pack);
}

// ---- whom a question about lateness scores ----

let directoryKept: { userId: string; at: number; people: Person[] } | null = null;
/** How long the list of accounts is kept before it is asked for again: accounts change rarely, questions come in runs. */
const DIRECTORY_KEEP_MS = 5 * 60 * 1000;
/** How long a question waits for the list; after that it is answered without a person's score. */
const DIRECTORY_WAIT_MS = 3000;

/** Does this pack say anything about people's scores — so is the list of accounts worth asking for? */
const scoresPeople = (intent: AnalyticIntent): boolean => (intent.general || intent.topics.includes("people")) && intent.documentIds.length === 0;

/**
 * THE OPTIONS A SENDER PASSES FOR A QUESTION ABOUT HISTORY (REQUIREMENTS §64,
 * §75): the account asking and, when the pack will hold people's scores, the
 * accounts the Performance Scorecard scores it among — GET /api/users/directory,
 * asked here on send (never while drawing), kept for a few minutes, and given
 * up on after three seconds or when the browser is offline, so a question is
 * never held up for long by it. Without the list no person's score is given
 * (EvidenceOptions.directory). `read` is the request itself, replaceable in a test.
 */
export async function evidenceOptionsFor(
  intent: AnalyticIntent,
  user: Person | null | undefined,
  read: () => Promise<{ people: Person[] }> = () => usersApi.directory()
): Promise<EvidenceOptions> {
  const self: Person | null = user ? { id: user.id, name: user.name, role: user.role, departments: [...(user.departments ?? [])] } : null;
  if (!self || !scoresPeople(intent)) return { self };
  if (directoryKept && directoryKept.userId === self.id && Date.now() - directoryKept.at < DIRECTORY_KEEP_MS) return { self, directory: directoryKept.people };
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { self, directory: null };
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const res = await Promise.race([
      read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("the list of accounts took too long")), DIRECTORY_WAIT_MS);
      }),
    ]).finally(() => clearTimeout(timer));
    if (!Array.isArray(res?.people)) return { self, directory: null };
    const people = res.people
      .filter((p) => p && typeof p.id === "string" && typeof p.name === "string" && Array.isArray(p.departments))
      .map((p) => ({ id: p.id, name: p.name, role: p.role, departments: p.departments.filter((c): c is string => typeof c === "string") }));
    directoryKept = { userId: self.id, at: Date.now(), people };
    return { self, directory: people };
  } catch (err) {
    console.error("The list of accounts could not be read; a person's score is left out of this answer", err);
    return { self, directory: null };
  }
}

// ---------------------------------------------------------------------------
// the plain answer, when the model cannot be reached

/** A word from i18n/strings.ts once it is there, the English until then. */
function say(key: string, english: string): string {
  const s = t(key);
  return s === key.split(".").pop() ? english : s;
}

const ANSWER_LINES = 16;

/**
 * The pack in plain words (REQUIREMENTS §72/§75): a LocalAnswer of kind "reply",
 * so the question still goes to the model first and this is what is shown —
 * labelled as the app's own answer — when the model cannot be reached.
 */
export function evidenceAnswer(intent: AnalyticIntent, pack: EvidencePack): LocalAnswer {
  const lines: string[] = [];
  for (const s of pack.sections) {
    if (s.topic === "scope") continue;
    if (lines.length + 2 > ANSWER_LINES) break;
    lines.push(`${s.heading}:`);
    for (const f of s.facts) {
      if (lines.length >= ANSWER_LINES) break;
      lines.push(`• ${f.plain ?? f.text}`);
    }
  }
  const chips: Chip[] = [{ label: say("ai.chip.insights", "Open Insights"), action: { type: "navigate", route: "/insights" }, tone: "primary" }];
  if (intent.topics.includes("people") || intent.general) chips.push({ label: say("ai.chip.performance", "Performance Scorecard"), action: { type: "navigate", route: "/performance" } });
  const lead = say("ai.history.lead", "Here is what the records you can see show for {period}:").replace("{period}", intent.label);
  const body = lines.length ? lines.join("\n") : say("ai.history.nothing", "Nothing has been written on these records by a person yet.");
  return { kind: "reply", reply: `${lead}\n${body}`, chips };
}

// ---------------------------------------------------------------------------
// the conversation so far, and the records an answer names

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

/**
 * The last turns of the conversation for the model, so a follow-up ("and the
 * month before?") can be understood: at most six, each at most 800 characters,
 * 3,000 in all — the most recent kept. The server checks the same limits.
 */
export function historyForModel(turns: readonly ChatTurn[], maxTurns = 6, maxEach = 800, maxTotal = 3000): ChatTurn[] {
  const out = turns
    .filter((x) => (x.role === "user" || x.role === "assistant") && typeof x.text === "string" && x.text.trim())
    .slice(-maxTurns)
    .map((x) => ({ role: x.role, text: x.text.trim().length > maxEach ? `${x.text.trim().slice(0, maxEach - 1)}…` : x.text.trim() }));
  let total = out.reduce((n, x) => n + x.text.length, 0);
  while (out.length && total > maxTotal) total -= (out.shift() as ChatTurn).text.length;
  return out;
}

/** The last question about history among a conversation's last six messages, read again today — for a conversation kept before questions were (previousIntentIn). */
export function lastAnalyticIntent(userTexts: readonly string[], today: string): AnalyticIntent | null {
  let found: AnalyticIntent | null = null;
  for (const text of userTexts.slice(-6)) found = analyticIntent(text, today, found) ?? found;
  return found;
}

/** A message of a kept conversation, as far as a follow-up reads it. */
export interface AskedMessage {
  role: string;
  text: string;
  /** The question about history it asked, as understood when it was sent (keepIntent). */
  intent?: unknown;
}

/**
 * THE QUESTION A FOLLOW-UP BUILDS ON (REQUIREMENTS §75): the last question
 * about history in the conversation, as it was kept on the message that asked
 * it — however many messages back, with its dates as they were understood
 * then. A conversation kept before questions were has its last six messages
 * read again, as before (lastAnalyticIntent).
 */
export function previousIntentIn(messages: readonly AskedMessage[], today: string): AnalyticIntent | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user" || m.intent === undefined) continue;
    const kept = intentFromKept(m.intent);
    if (kept) return kept;
  }
  return lastAnalyticIntent(
    messages.filter((m) => m.role === "user").map((m) => m.text),
    today
  );
}

export interface CiteLink {
  recordId: string;
  route: string;
  label: string;
}

/**
 * The records an answer cites, as links to open them: only ids the evidence
 * pack tagged, only records this account may open (REQUIREMENTS §40), at most
 * five — "Open F/MNT/06 · 18-Sep-2026".
 */
export function citeLinks(ids: readonly string[] | undefined, allowed: readonly string[], openWord = say("ai.cite.open", "Open")): CiteLink[] {
  const out: CiteLink[] = [];
  for (const id of ids ?? []) {
    if (out.length >= 5) break;
    if (!allowed.includes(id) || out.some((c) => c.recordId === id)) continue;
    const record = recordRepository.getById(id);
    const doc = record ? documentRepository.getById(record.documentId) : undefined;
    if (!record || !doc) continue;
    out.push({ recordId: id, route: routeForRecord(doc, id), label: `${openWord} ${called(doc, doc.name)} · ${fmt(record.dueDate)}` });
  }
  return out;
}
