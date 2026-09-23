import type { Chip } from "./guidedChecklist";
import type { ComplaintAckData, ComplaintChecklistData, DailyPestMonitoringData, DocumentDefinition, GapInspectionData, RecordInstance } from "../types";
import { masterRepository } from "../data/repositories/masterRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { documentRepository } from "../data/repositories/documentRepository";
import { computeBriefing } from "./assistantBriefing";
import { departmentScopeLabel, documentDepartmentLabel, isDocumentIdVisible } from "./departmentScope";
import { routeForRecord } from "./reminders";
import { filesRoute, isPestFileDocument, recordsInRange, scopeForDocuments } from "./fileScope";
import { dayInfo, describeDay, nextWeeklyOff, upcomingHolidays, weeklyOffDay, WEEKDAY_LONG, type DayInfo } from "./holidays";
import { t } from "../i18n";
import { guide, hello, whoIAm } from "./assistantPersona";
import { documentsByFormatNumber, formatNumberAnswer } from "./formatNumbers";
import { hrMasterChatAnswer } from "./hrMasterAssistant";
import { demoModeAvailable } from "./features";
import { addDays, compareISO, daysInMonth, formatDisplayDate, fromISODate, MONTH_NAMES, pad2, todayISO } from "../utils/date";

// WHAT THE ASSISTANT KNOWS WITHOUT ASKING THE MODEL.
//
// Three things live here:
//  * buildAssistantContext() — a short, plain-text digest of live facts (today,
//    the weekly off, the next holidays and adjustment days, what's due) sent
//    with every chat message so the model answers calendar / workload
//    questions from the app's own data instead of guessing.
//  * localAnswer() — a handful of intents answered entirely on the client,
//    instantly and without the network: "is Thursday a holiday?", "next
//    holiday?", "adjustment days?", "what's due today?", "my briefing",
//    "list <document/module> records from <date> to <date>", "help".
//    Everything else goes to the model (with the context above).
//  * listDocumentsAnswer() — "I want documents of daily pest control
//    monitoring record from 1 January to 19 January", "pest records for
//    September", "fly catcher inspections this week": enumerates exactly the
//    records due in the date span the user named (never a whole month unless
//    they asked for one), for the document(s)/module they named, and OPENS
//    the Document Files view for exactly that span (pages/FileBrowserPage.tsx)
//    — "from June to August" is 1 June to 31 August. Only fires when a date
//    is present AND a document/module is recognisable (or it says "all
//    documents/records/files") — "show me all reports of august" still goes
//    to the model and navigates to the Reports page, unchanged.

export interface LocalAnswer {
  reply: string;
  chips?: Chip[];
  /** A screen to open straight away — e.g. the Document Files view for the span asked for. */
  navigate?: string;
}

// OUT OF SCOPE — this assistant answers about this record system and nothing
// else. The model is told the same, in far more detail (the SCOPE block in
// backend/assistant.ts) and is what actually catches the general run of
// off-topic messages; these few patterns are the ones that could not
// conceivably be about the plant's paperwork, so they are declined here
// instantly, without a network round trip or a token spent.
//
// Deliberately tiny and unambiguous. A pattern that might also fit a real
// question about the work does NOT belong here — "treatment", "recipe",
// "translate" (the F/QC/13 sheet is in Gujarati) and "weather" on its own
// (it drives pest activity) are all left to the model on purpose. A false
// positive here would refuse a legitimate question, which is far worse than
// spending one model call to decline a general one.
const OFF_TOPIC_PATTERNS: RegExp[] = [
  /\b(tell|crack|say)\s+(me\s+)?(a|an|another)?\s*joke\b/i,
  /\bmake me laugh\b/i,
  /\b(write|compose|draft|give me)\s+(me\s+)?(a|an)?\s*(poem|song|story|essay|haiku|rap|novel|screenplay|shayari)\b/i,
  /\b(what'?s|how'?s|hows)\s+the\s+weather\b/i,
  /\bweather\s+(today|tomorrow|forecast)\b/i,
  /\b(cricket|football|ipl|world cup|olympics)\b/i,
  /\blatest news\b/i,
  /\bwho\s+is\s+the\s+(president|prime minister|king|queen|richest)\b/i,
  /\b(what'?s|what is)\s+the\s+capital\s+of\b/i,
  // A message that is nothing but arithmetic — "what is 27 * 4?".
  /^\s*(what\s+is|what'?s|calculate|solve)\s+[\d\s+\-*/x×÷().]+\??\s*$/i,
];

// Exported so the floating widget can decline an off-topic message even when
// a record is open (where it otherwise treats free text as data to fill in).
export function offTopicReply(message: string): LocalAnswer | null {
  const text = message.trim();
  if (!OFF_TOPIC_PATTERNS.some((re) => re.test(text))) return null;
  return {
    reply: t("ai.offTopic"),
    chips: [
      { label: t("ai.chip.dueToday"), action: { type: "navigate", route: `/day/${todayISO()}` }, tone: "primary" },
      { label: t("ai.chip.pestControl"), action: { type: "navigate", route: "/pest-control" } },
      { label: t("ai.chip.monthReports"), action: { type: "navigate", route: "/reports" } },
    ],
  };
}

const SUGGESTION_IDS = ["due", "tomorrow", "nextHoliday", "adjustment", "reports", "rat", "daily", "rodent", "range"] as const;

// Read at render time, not module load, so the questions are in whichever
// language is selected now.
export function suggestedPrompts(): { title: string; text: string }[] {
  return SUGGESTION_IDS.map((id) => ({ title: t(`sugg.${id}.title`), text: t(`sugg.${id}.text`) }));
}

// Mitra's own small talk (REQUIREMENTS §50) — deliberately narrow, so a real
// question about the work never lands here. "Who are you" and its kin are
// answered by name and honestly; a bare greeting or thanks is answered warmly.
const IDENTITY_RE =
  /\b(?:who\s+are\s+you|what(?:'?s| is)\s+your\s+name|are\s+you\s+(?:a\s+)?(?:real|human|person|bot|robot|machine|an?\s+ai|ai)|are\s+you\s+there|am\s+i\s+(?:talking|speaking|chatting)\s+(?:to|with)\s+(?:a\s+)?(?:real\s+)?(?:person|human|bot|machine))\b/i;
const GREETING_RE = /^(?:hi+|hey+|hello+|hlo|helo|namaste|namaskar|jai\s+shree\s+krishna|kem\s+cho|good\s+(?:morning|afternoon|evening))\b[\s!.,]*$/i;
const THANKS_RE = /^(?:thanks?|thank\s+you|thx|ty|shukriya|aabhar|dhanyavad|great|nice|perfect|well\s+done)\b[\s!.,]*$/i;
const CAPABILITY_RE = /\b(?:what\s+can\s+you\s+do|what\s+do\s+you\s+do|how\s+can\s+you\s+help|what\s+are\s+you\s+for|what\s+all\s+can\s+you\s+do)\b/i;

const WEEKDAY_RE = /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/i;
// Deliberately narrow: bare words like "closed" or "adjustment" also occur in
// complaint / trap-position talk ("is the complaint closed today?", "I made an
// adjustment to the box") and must reach the model, not the calendar.
const HOLIDAY_RE = /\b(holiday|holidays|weekly[ -]?off|off[ -]?day|day[ -]?off|working day|adjustment (?:day|days|date|dates)|leave calendar|non-?working day)\b/i;
const ADJUSTMENT_RE = /\badjustment (?:day|days|date|dates)\b/i;
const NEXT_RE = /\b(next|upcoming|coming up|coming|list|calendar)\b/i;
const PAST_RE = /\b(last|previous|past)\b/i;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function weekdayIndex(word: string): number {
  const w = word.toLowerCase().slice(0, 3);
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(w);
}

// "today", "tomorrow", "day after tomorrow", "yesterday", a weekday name
// ("this Thursday", "next Friday"), or an explicit date (ISO, dd-mm-yyyy,
// dd/mm/yyyy, "12 Nov", "12th November 2026").
function parseDateRef(text: string, today: string): { date: string; phrase: string } | null {
  const lower = text.toLowerCase();
  if (/\bday after tomorrow\b/.test(lower)) return { date: addDays(today, 2), phrase: "The day after tomorrow" };
  if (/\btomorrow\b/.test(lower)) return { date: addDays(today, 1), phrase: "Tomorrow" };
  if (/\byesterday\b/.test(lower)) return { date: addDays(today, -1), phrase: "Yesterday" };
  if (/\btoday\b/.test(lower)) return { date: today, phrase: "Today" };

  // A date that doesn't exist ("31-02-2026") is no date at all: built as-is
  // it rolled over, and the answer was about 3 March.
  const iso = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    if (!isValidYMD(Number(iso[1]), Number(iso[2]), Number(iso[3]))) return null;
    return { date: `${iso[1]}-${iso[2]}-${iso[3]}`, phrase: formatDisplayDate(`${iso[1]}-${iso[2]}-${iso[3]}`) };
  }
  const dmy = lower.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/);
  if (dmy) {
    if (!isValidYMD(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]))) return null;
    const date = `${dmy[3]}-${pad2(Number(dmy[2]))}-${pad2(Number(dmy[1]))}`;
    return { date, phrase: formatDisplayDate(date) };
  }
  const dMon = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:\s+(\d{4}))?\b/);
  if (dMon) {
    const year = dMon[3] ? Number(dMon[3]) : fromISODate(today).getFullYear();
    if (!isValidYMD(year, MONTHS.indexOf(dMon[2]) + 1, Number(dMon[1]))) return null;
    const date = `${year}-${pad2(MONTHS.indexOf(dMon[2]) + 1)}-${pad2(Number(dMon[1]))}`;
    return { date, phrase: formatDisplayDate(date) };
  }
  const wd = lower.match(WEEKDAY_RE);
  if (wd) {
    const target = weekdayIndex(wd[1]);
    const todayDow = fromISODate(today).getDay();
    if (PAST_RE.test(lower)) {
      // "last Thursday" = the most recent one strictly before today.
      const behind = (todayDow - target + 7) % 7 || 7;
      const date = addDays(today, -behind);
      return { date, phrase: `Last ${WEEKDAY_LONG[target]}, ${formatDisplayDate(date)}` };
    }
    let ahead = (target - todayDow + 7) % 7;
    if (/\bnext\b/.test(lower) && ahead === 0) ahead = 7;
    const date = addDays(today, ahead);
    return { date, phrase: ahead === 0 ? `Today (${WEEKDAY_LONG[target]})` : `${/\bnext\b/.test(lower) ? "Next " : "This "}${WEEKDAY_LONG[target]}, ${formatDisplayDate(date)}` };
  }
  return null;
}

function holidayChips(): Chip[] {
  return [
    { label: t("ai.chip.calendar"), action: { type: "navigate", route: "/calendar" } },
    { label: t("ai.chip.holidayMaster"), action: { type: "navigate", route: "/master-data" } },
  ];
}

function listUpcoming(today: string, limit: number): string {
  const master = masterRepository.get();
  const items = upcomingHolidays(today, master, limit, 400);
  const off = WEEKDAY_LONG[weeklyOffDay(master)];
  if (items.length === 0) return `There are no festival holidays or adjustment days on the leave calendar in the coming months — only the usual weekly off every ${off} (next one ${formatDisplayDate(nextWeeklyOff(addDays(today, 1), master))}).`;
  const lines = items.map((i) => `• ${formatDisplayDate(i.date)} (${i.weekday.slice(0, 3)}) — ${i.kind === "adjustment" ? `adjustment day${i.name ? ` for ${i.name}` : ""} (working ${i.weekday})` : i.name}`);
  return `Coming up on the Gujarat Print Pack Leave Calendar:\n${lines.join("\n")}\nThe weekly off is every ${off}; the next one is ${formatDisplayDate(nextWeeklyOff(addDays(today, 1), master))}.`;
}

function listAdjustmentDays(today: string): string {
  const master = masterRepository.get();
  const all = (master.adjustmentDays ?? []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  if (all.length === 0) return "No adjustment days are set up in Master Data → Holidays.";
  const upcoming = all.filter((a) => a.date >= today);
  const show = upcoming.length ? upcoming : all;
  const off = WEEKDAY_LONG[weeklyOffDay(master)];
  const lines = show.map((a) => {
    const info = dayInfo(a.date, master);
    return `• ${formatDisplayDate(a.date)} (${info.weekday.slice(0, 3)})${a.forHoliday ? ` — for ${a.forHoliday}` : ""}${a.note ? ` — ${a.note}` : ""}`;
  });
  return `${upcoming.length ? "Upcoming adjustment days" : "Adjustment days this year"} — everyone reports to the company on these ${off}s, so records are due as on any working day:\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// "documents of <document/module> from <date> to <date>" — enumerate exactly
// the records due in the named span, not a whole month unless that's what
// was asked. Two independent recognisers feed this: which document(s) the
// message names (matchDocuments) and what date span it names
// (parseDateRange) — both must find something, or this stays silent and the
// message goes to the model like anything else.

// Longer/more specific phrases are matched with the same weight as short
// ones (all via word-boundary regex against the whole message) — a message
// can name more than one, e.g. "rat and mice", which is fine: their ids just
// both go into the result set.
const DOC_KEYWORDS: { id: string; aliases: string[] }[] = [
  { id: "daily-pest-monitoring", aliases: ["daily pest control monitoring", "daily pest monitoring", "daily monitoring record", "daily monitoring", "f/hr/17", "daily report"] },
  { id: "fly-catcher", aliases: ["fly catcher", "flycatcher", "f/hr/18"] },
  { id: "service-report-rodent", aliases: ["rat / mice", "rat and mice", "rat & mice", "rodent control service", "rodent service", "rat report", "mice report", "rat", "mice", "rodent"] },
  { id: "service-report-general", aliases: ["general pest control", "general pest service", "ants and cockroaches", "cockroach", "cockroaches", "ants", "ant"] },
  { id: "service-report-fly", aliases: ["fly control service", "fly control services", "fly service"] },
  {
    id: "gap-inspection",
    aliases: ["internal inspection", "capa internal", "internal capa", "gap report", "gap analysis", "inspection finding", "inspection findings", "inspection findings report", "inspection report", "findings report"],
  },
  {
    id: "capa-customer-complaint",
    aliases: ["customer complaint", "capa external", "external capa", "external complaint", "f/mkt/05", "complaint checklist", "complaint handling checklist", "complaint"],
  },
  {
    id: "capa-complaint-ack",
    aliases: ["complaint acknowledgement", "complaint acknowledgment", "acknowledgement report", "acknowledgment report", "qa-caf", "qa caf", "caf report"],
  },
  { id: "pest-responsibilities", aliases: ["responsibilities of pest control", "responsibilities document", "pest responsibilities", "responsibilities"] },
  { id: "service-agreement", aliases: ["service agreement", "service provider agreement", "pest control agreement", "agreement"] },
  { id: "training-record", aliases: ["training record", "training"] },
  { id: "qc-viscosity", aliases: ["adhesive viscosity", "viscosity record", "f-qc-30", "viscosity"] },
  { id: "qc-adhesive-mixing", aliases: ["adhesive mixing", "mixing ratio", "f-qc-32"] },
  { id: "qc-temperature", aliases: ["hot room temperature", "temperature monitoring", "f-qc-40"] },
  { id: "prd-process-parameter", aliases: ["process parameter record", "process parameter"] },
  { id: "prd-alc-production", aliases: ["alc production", "alc & production", "f-prd-18", "alc report"] },
  { id: "qc-inspection-pouching", aliases: ["pouching inspection", "pouching process", "f/qc/37", "pouching"] },
  { id: "qc-inspection-slitting", aliases: ["slitting inspection", "f/qc/35", "slitting"] },
  { id: "qc-inspection-printed-film", aliases: ["printed film inspection", "printed film", "f/qc/34"] },
  { id: "qc-inprocess-printing", aliases: ["in process quality control", "in-process quality control", "in process printing", "f/qc/13"] },
  { id: "qc-weight-scale-calibration", aliases: ["weight scale calibration", "weighing balance", "weight scale", "weighing scale", "f/qc/12"] },
  { id: "qc-gsm-plate-calibration", aliases: ["gsm cutting plate", "cutting plate", "gsm plate", "f/qc/11"] },
  // Quality Control's formats supplied on 18-Sep-2026 (REQUIREMENTS §57). Every
  // one is also found by its format number, which needs no alias at all
  // (engine/formatNumbers.ts) — these are the words people say instead.
  { id: "qc-bopp-film", aliases: ["bopp film", "bopp", "inspection record bopp", "f/qc/01"] },
  { id: "qc-corrugated-box", aliases: ["corrugated box inspection", "corrugated box", "box inspection", "f/qc/02"] },
  { id: "qc-label-stock", aliases: ["label stock", "label stock inspection", "f/qc/03"] },
  { id: "qc-paper-core", aliases: ["paper core", "core inspection", "f/qc/04"] },
  { id: "qc-pvc-pet-film", aliases: ["pvc film", "pet film", "pvc pet film", "sleeve film inspection", "f/qc/05"] },
  { id: "qc-offset-ink", aliases: ["offset ink", "f/qc/18"] },
  { id: "qc-duplex-board", aliases: ["duplex board", "f/qc/19"] },
  { id: "qc-kraft-paper", aliases: ["kraft paper", "white top liner", "f/qc/20"] },
  { id: "qc-flexo-ink", aliases: ["flexo ink", "f/qc/21"] },
  { id: "qc-lamination-adhesive-inspection", aliases: ["lamination film adhesive", "lamination adhesive inspection", "adhesive inspection"] },
  { id: "qc-side-pasting-adhesive", aliases: ["side pasting adhesive", "f/qc/22"] },
  { id: "qc-starch-powder", aliases: ["corrugation starch powder", "starch powder", "f/qc/23"] },
  { id: "qc-sheet-pasting-powder", aliases: ["sheet pasting powder", "pasting powder", "f/qc/24"] },
  { id: "qc-line-clearance-printing", aliases: ["line clearance printing", "printing line clearance", "f/qc/15-a"] },
  { id: "qc-line-clearance-qc-machine", aliases: ["line clearance qc machine", "qc machine inspection clearance", "f/qc/15-c"] },
  { id: "qc-line-clearance-qc-manual", aliases: ["line clearance qc manual", "qc manual inspection clearance", "f/qc/15-d"] },
  { id: "qc-line-clearance-slitting", aliases: ["line clearance slitting", "slitting line clearance", "f/qc/15-e"] },
  { id: "qc-line-clearance-sleeve-gluing", aliases: ["line clearance sleeve gluing", "shrink sleeve gluing clearance", "f/qc/15-f"] },
  { id: "qc-line-clearance-sleeve-cutting", aliases: ["line clearance sleeve cutting", "shrink sleeve cutting clearance", "f/qc/15-g"] },
  { id: "qc-line-clearance-materials", aliases: ["line clearance materials", "materials line clearance", "line clearance checklist"] },
  { id: "qc-line-clearance-quality", aliases: ["line clearance quality", "quality line clearance", "quality clearance checklist"] },
  { id: "qc-calibration-master-list", aliases: ["master list of calibration", "calibration instruments", "calibration master list", "f/qc/08"] },
  { id: "qc-coa-label", aliases: ["coa label", "certificate of analysis label", "label coa", "f/qc/06"] },
  { id: "qc-coa-sleeve", aliases: ["coa sleeve", "certificate of analysis sleeve", "shrink sleeve coa", "f/qc/07"] },
  { id: "qc-coa-corrugated", aliases: ["coa corrugated", "corrugated box coa", "corrugated box analysis", "f/qc/25"] },
  { id: "qc-obsolete-artwork", aliases: ["obsolete artwork", "register of obsolete artwork", "artwork register", "shade card record", "f/qc/16"] },
  { id: "qc-printing-aids-destruction", aliases: ["destruction record", "printing aids destruction", "printing aids"] },
  { id: "qc-camera-challenge-test", aliases: ["camera challenge", "camera challenge test", "defect detection", "defect detection system"] },
  { id: "qc-tolerance-card-nivea", aliases: ["tolerance card", "beiersdorf", "nivea tolerance card"] },
  { id: "qc-analysis-report", aliases: ["analysis report", "psl analysis", "psl analysis report", "f/qc/29"] },
  { id: "qc-utility-test-report", aliases: ["utility test report", "utility test", "freeze desiccator oven"] },
  { id: "qc-minutes-of-meetings", aliases: ["minutes of meetings", "minutes of meeting", "meeting minutes"] },
  // Human Resources — the sixteen F/HR formats (REQUIREMENTS §46).
  { id: "hr-competence", aliases: ["personal competence", "competence record", "competence records", "competence chart", "f/hr/01", "competence"] },
  { id: "hr-skill-matrix", aliases: ["skill matrix", "operator skill", "skill status", "f/hr/03"] },
  { id: "hr-pre-employment-health", aliases: ["pre-employment", "pre employment", "medical health declaration", "medical declaration", "f/hr/04"] },
  { id: "hr-induction-staff", aliases: ["staff induction", "induction staff", "induction record staff", "f/hr/05"] },
  { id: "hr-induction-operators", aliases: ["operator induction", "operators induction", "induction operators", "induction training record", "induction training", "induction", "f/hr/06"] },
  { id: "hr-job-responsibility", aliases: ["job responsibility", "job responsibilities", "responsibility and authority", "responsibility & authority", "job description", "f/hr/07"] },
  { id: "hr-training-needs", aliases: ["training need identification", "training needs", "training need", "tni", "f/hr/08"] },
  { id: "hr-training-calendar", aliases: ["training plan calender", "training calender", "training calendar", "training plan", "f/hr/09"] },
  { id: "hr-training-effectiveness", aliases: ["training effectiveness", "effectiveness evaluation", "trainer evaluation", "f/hr/11"] },
  { id: "hr-training-feedback", aliases: ["training feedback", "feedback & evaluation", "feedback and evaluation", "f/hr/12"] },
  { id: "hr-mobile-authorization", aliases: ["mobile authorization", "mobile authorisation", "mobile usage", "mobile handset", "mobile", "f/hr/13"] },
  { id: "hr-visitor-health", aliases: ["visitor health", "visitor declaration", "visitor", "visitors", "f/hr/14"] },
  { id: "hr-gmp-checklist", aliases: ["gmp inspection", "gmp checklist", "gmp check list", "prp check list", "prp checklist", "monthly prp", "gmp", "f/hr/19"] },
  { id: "hr-psc-survey", aliases: ["product safety culture survey", "culture survey", "psc survey", "safety culture", "f/hr/20"] },
  { id: "hr-psc-survey-analysis", aliases: ["culture survey analysis", "survey analysis", "psc analysis", "f/hr/21"] },
  { id: "hr-hygiene-report", aliases: ["hygiene inspection", "hygiene report", "personal hygiene", "sanitation", "hygiene", "frisking", "f/hr/22"] },
];

// The pest control file is a shelf of the Human Resources module, not a module
// (REQUIREMENTS §46): "pest" names that shelf — F/HR/17, F/HR/18, the service
// reports, the training record — and not HR's competence or training registers.
const PEST_FILE_ALIASES = ["pest control", "pest"];

const MODULE_KEYWORDS: { module: string; aliases: string[] }[] = [
  { module: "Human Resources", aliases: ["human resources", "hr module", "hr records", "hr documents", "hr"] },
  { module: "Lamination — Quality Control", aliases: ["lamination qc", "lamination quality control", "lamination quality"] },
  { module: "Lamination — Production", aliases: ["lamination production"] },
  {
    module: "Quality Control — Inspection Records",
    aliases: ["inspection records", "inspection record", "qc inspection", "qc records", "qc record", "qc module", "quality control records", "quality control documents", "quality control module"],
  },
  { module: "CAPA (Corrective & Preventive Action)", aliases: ["capa"] },
];

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function mentionsAny(lower: string, aliases: string[]): boolean {
  return aliases.some((a) => new RegExp(`\\b${escapeReg(a)}\\b`, "i").test(lower));
}
/** The longest alias the message uses, or null. */
function longestMentioned(lower: string, aliases: string[]): string | null {
  const hits = aliases.filter((a) => new RegExp(`\\b${escapeReg(a)}\\b`, "i").test(lower));
  return hits.length ? hits.sort((a, b) => b.length - a.length)[0] : null;
}

// Which document id(s) the message names — a specific document first
// ("daily pest control monitoring record"), falling back to a whole module
// ("pest", "lamination") only when no single document was recognised, so a
// precise request never gets diluted into every document in the module.
// A document named by a longer phrase wins over one named by a word inside
// it: "complaint acknowledgement report" is the acknowledgement report, not
// also the customer complaint checklist.
export function matchDocuments(lower: string): string[] {
  // A format number names its document outright, in any module and however it
  // is written — F/HR/05, f-hr-05, hr 5 (engine/formatNumbers.ts, REQUIREMENTS
  // §52) — and only the person's own departments' documents are found.
  const byNumber = documentsByFormatNumber(lower);
  if (byNumber.length > 0) return byNumber.map((d) => d.id);
  const hits: { id: string; alias: string }[] = [];
  for (const { id, aliases } of DOC_KEYWORDS) {
    const alias = longestMentioned(lower, aliases);
    if (alias) hits.push({ id, alias });
  }
  const ids = new Set(hits.filter((h) => !hits.some((o) => o.id !== h.id && o.alias.length > h.alias.length && o.alias.includes(h.alias))).map((h) => h.id));
  // DOC_KEYWORDS is a hardcoded alias table, so a word can name a document
  // this user's department may not see — nothing above went through the
  // scoped repository. Keeping only the ids that survive a scoped lookup
  // stops the assistant naming, listing or opening another department's
  // document just because the words matched (REQUIREMENTS §40). When the
  // words named nothing visible, the message counts as naming no document at
  // all and goes to the model, rather than being answered out of somebody
  // else's paperwork.
  if (ids.size > 0) return Array.from(ids).filter((id) => documentRepository.getById(id) !== undefined);

  const recordable = documentRepository.getRecordable();
  for (const { module, aliases } of MODULE_KEYWORDS) {
    if (mentionsAny(lower, aliases)) recordable.filter((d) => d.module === module).forEach((d) => ids.add(d.id));
  }
  if (ids.size === 0 && mentionsAny(lower, PEST_FILE_ALIASES)) recordable.filter(isPestFileDocument).forEach((d) => ids.add(d.id));
  if (ids.size === 0 && /\blamination\b/i.test(lower)) {
    recordable.filter((d) => d.module.startsWith("Lamination")).forEach((d) => ids.add(d.id));
  }
  return Array.from(ids);
}

export interface DateRange {
  from: string;
  to: string;
  label: string;
}

function isValidYMD(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

interface ExplicitDate {
  date: string;
  /** Where in the message it was written — dates come back in this order. */
  pos: number;
  /** Whether the year was written, rather than assumed to be this one. */
  yearGiven: boolean;
}

// Every explicit calendar date named in the message (ISO, dd-mm-yyyy,
// "1 January[ 2026]", "January 1[, 2026]"), deduplicated, in the order the
// message names them — used for BOTH a two-sided range ("from 1 January to 19
// January" finds both) and a single date ("documents for 5 September" finds
// one, so from===to).
function extractExplicitDates(text: string, yearFallback: number): ExplicitDate[] {
  const out = new Map<string, ExplicitDate>();
  const push = (y: number, m: number, d: number, pos: number, yearGiven: boolean) => {
    if (!isValidYMD(y, m, d)) return;
    const date = `${y}-${pad2(m)}-${pad2(d)}`;
    const prev = out.get(date);
    if (!prev || pos < prev.pos) out.set(date, { date, pos, yearGiven: yearGiven || !!prev?.yearGiven });
  };
  // Shorthand where the month is only stated once for both ends — "1 to 19
  // January", "1-19 January 2026" — checked first so both day numbers get
  // the trailing month attached, not just the second one.
  for (const m of text.matchAll(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:to|-|–|—)\s*(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:\s+(\d{4}))?\b/gi
  )) {
    const year = m[4] ? Number(m[4]) : yearFallback;
    const mi = MONTHS.indexOf(m[3].toLowerCase()) + 1;
    push(year, mi, Number(m[1]), m.index, !!m[4]);
    push(year, mi, Number(m[2]), m.index + 1, !!m[4]);
  }
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) push(Number(m[1]), Number(m[2]), Number(m[3]), m.index, true);
  for (const m of text.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/g)) push(Number(m[3]), Number(m[2]), Number(m[1]), m.index, true);
  for (const m of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:\s+(\d{4}))?\b/gi)) {
    push(m[3] ? Number(m[3]) : yearFallback, MONTHS.indexOf(m[2].toLowerCase()) + 1, Number(m[1]), m.index, !!m[3]);
  }
  for (const m of text.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/gi)) {
    push(m[3] ? Number(m[3]) : yearFallback, MONTHS.indexOf(m[1].toLowerCase()) + 1, Number(m[2]), m.index, !!m[3]);
  }
  return Array.from(out.values()).sort((a, b) => a.pos - b.pos);
}

// A month as people write it — "jan", "January", "sept." — and nothing that
// merely starts like one: "marked", "decided", "augment" and "may I" are not
// months. Capture group 1 is the word; its first three letters index MONTHS.
const MONTH_WORD =
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may(?!\\s+(?:i|we|you)\\b)|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

function monthRange(year: number, month: number, label: string): DateRange {
  return { from: `${year}-${pad2(month + 1)}-01`, to: `${year}-${pad2(month + 1)}-${pad2(daysInMonth(year, month))}`, label };
}

function weekBounds(today: string, weekOffset: number): { from: string; to: string } {
  const dow = fromISODate(today).getDay();
  const from = addDays(today, -dow + weekOffset * 7);
  return { from, to: addDays(from, 6) };
}

// What span the user named — an explicit day-to-day range, a single day, a
// week, or a whole month (bare month name, or "this/last/next month") — so
// "1 to 19 January" lists 19 days and "for January" lists the whole month,
// exactly as asked. Returns null when no date reference is found at all.
export function parseDateRange(text: string, today: string): DateRange | null {
  const lower = text.toLowerCase();
  const year0 = fromISODate(today).getFullYear();

  const explicit = extractExplicitDates(text, year0);
  if (explicit.length >= 1) {
    let dates = explicit.map((e) => e.date);
    // "25 December to 5 January" with no year written runs into next year,
    // the way "November to February" does — sorted as they stood, it became
    // 5 January to 25 December of this year, nearly the whole year.
    if (explicit.length === 2 && !explicit[0].yearGiven && !explicit[1].yearGiven && compareISO(explicit[1].date, explicit[0].date) < 0) {
      const [y, m, d] = explicit[1].date.split("-").map(Number);
      if (isValidYMD(y + 1, m, d)) dates = [explicit[0].date, `${y + 1}-${pad2(m)}-${pad2(d)}`];
    }
    const sorted = dates.slice().sort(compareISO);
    const from = sorted[0];
    const to = sorted[sorted.length - 1];
    return { from, to, label: from === to ? formatDisplayDate(from) : `${formatDisplayDate(from)} to ${formatDisplayDate(to)}` };
  }

  if (/\bthis week\b/.test(lower)) {
    const { from, to } = weekBounds(today, 0);
    return { from, to, label: `this week (${formatDisplayDate(from)} to ${formatDisplayDate(to)})` };
  }
  if (/\blast week\b/.test(lower)) {
    const { from, to } = weekBounds(today, -1);
    return { from, to, label: `last week (${formatDisplayDate(from)} to ${formatDisplayDate(to)})` };
  }
  if (/\bnext week\b/.test(lower)) {
    const { from, to } = weekBounds(today, 1);
    return { from, to, label: `next week (${formatDisplayDate(from)} to ${formatDisplayDate(to)})` };
  }

  const d = fromISODate(today);
  if (/\bthis month\b/.test(lower)) return monthRange(d.getFullYear(), d.getMonth(), `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`);
  if (/\blast month\b/.test(lower)) {
    const m = (d.getMonth() + 11) % 12;
    const y = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
    return monthRange(y, m, `${MONTH_NAMES[m]} ${y}`);
  }
  if (/\bnext month\b/.test(lower)) {
    const m = (d.getMonth() + 1) % 12;
    const y = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear();
    return monthRange(y, m, `${MONTH_NAMES[m]} ${y}`);
  }

  // Month to month — "from January to March", "June-August 2026",
  // "between Nov 2025 and Feb 2026": the first day of the first month to the
  // last day of the second. With no year on the second month and it coming
  // earlier in the year than the first ("November to February"), it means
  // the following year.
  const span = lower.match(new RegExp(`\\b${MONTH_WORD}\\.?(?:\\s+(20\\d{2}))?\\s*(?:to|till|until|through|thru|and|-|–|—)\\s*${MONTH_WORD}\\.?(?:\\s+(20\\d{2}))?\\b`));
  if (span) {
    const m1 = MONTHS.indexOf(span[1].slice(0, 3));
    const m2 = MONTHS.indexOf(span[3].slice(0, 3));
    const trailingYear = lower.match(/\b(20\d{2})\b/g)?.map(Number) ?? [];
    let y1 = span[2] ? Number(span[2]) : span[4] && !span[2] ? Number(span[4]) : trailingYear[0] ?? year0;
    let y2 = span[4] ? Number(span[4]) : y1;
    if (!span[4] && m2 < m1) y2 = y1 + 1;
    if (span[4] && !span[2] && m1 > m2) y1 = y2 - 1;
    const from = monthRange(y1, m1, "").from;
    const to = monthRange(y2, m2, "").to;
    if (compareISO(from, to) <= 0) {
      return { from, to, label: `${MONTH_NAMES[m1]} ${y1} to ${MONTH_NAMES[m2]} ${y2}` };
    }
  }

  const monthMatch = lower.match(new RegExp(`\\b${MONTH_WORD}\\b`));
  if (monthMatch) {
    const mi = MONTHS.indexOf(monthMatch[1].slice(0, 3));
    const yearMatch = lower.match(/\b(20\d{2})\b/);
    const year = yearMatch ? Number(yearMatch[1]) : year0;
    return monthRange(year, mi, `${MONTH_NAMES[mi]} ${year}`);
  }

  const ref = parseDateRef(text, today);
  if (ref) return { from: ref.date, to: ref.date, label: ref.phrase };
  return null;
}

// "Reports" is left out on purpose: "all reports of August" means the monthly
// Reports page, which the model routes to.
const ALL_DOCUMENTS_RE = /\b(?:all|every)\s+(?:the\s+)?(?:documents?|records?|files?|registers?|paperwork)\b/i;
const LIST_INTENT_RE = /\b(document|documents|record|records|report|reports|register|registers|file|files|folder|folders|paperwork)\b/i;
// Rows for this many days fit comfortably on screen without needing "…and N
// more" — a bounded date range the user themselves named (never "everything
// pending") is meant to be shown in full, so this is generous compared to
// the briefing's MAX_ROWS=12.
const MAX_LISTED_RECORDS = 40;

function listDocumentsAnswer(text: string, isDemo: boolean): LocalAnswer | null {
  const lower = text.toLowerCase();
  if (!LIST_INTENT_RE.test(lower)) return null;
  // "all documents from 1 to 5 August" — every module — is the one request
  // that names no document or module and still means a listing.
  const everything = ALL_DOCUMENTS_RE.test(lower);
  const named = matchDocuments(lower);
  const docIds = named.length > 0 ? named : everything ? documentRepository.getRecordable().map((d) => d.id) : [];
  if (docIds.length === 0) return null; // no document/module named — let the model handle plain navigation requests
  const today = todayISO();
  const range = parseDateRange(text, today);
  if (!range) return null; // no date reference — e.g. "open the rat and mice service reports" navigates instead

  // Scoped to just the named document(s) — cheap even across many months,
  // and the launch-date floor still applies (see engine/recordGenerator.ts),
  // so a range before this browser went live correctly comes back empty.
  const records = recordsInRange(docIds, range.from, range.to, isDemo);
  const docs = docIds.map((id) => documentRepository.getById(id)).filter((x): x is DocumentDefinition => !!x);

  // The answer OPENS the Document Files view for exactly this span — module →
  // document → month → the dated files, nothing outside the dates asked for
  // (pages/FileBrowserPage.tsx) — and the chat keeps a short written list.
  const files = filesRoute(scopeForDocuments(docIds), range.from, range.to);
  const filesChip: Chip = { label: t("ai.chip.openFiles"), action: { type: "navigate", route: files }, tone: "primary" };
  const scopeLabel =
    named.length === 0 ? "All documents" : docs.length === 1 ? docs[0].name : docs.length > 0 ? `${docs.length} matching documents` : "matching documents";

  if (records.length === 0) {
    return {
      reply: `No ${scopeLabel} records between ${formatDisplayDate(range.from)} and ${formatDisplayDate(range.to)}${isDemo ? " (demo)" : ""}.`,
      chips: [filesChip],
      navigate: files,
    };
  }

  const shown = records.slice(0, MAX_LISTED_RECORDS);
  const lines = shown.map((r) => {
    const doc = docs.length > 1 ? documentRepository.getById(r.documentId) : docs[0];
    const holiday = r.documentId === "daily-pest-monitoring" && (r.data as DailyPestMonitoringData)?.isHoliday;
    const status = holiday ? "Holiday" : r.status;
    const prefix = docs.length > 1 ? `${formatDisplayDate(r.dueDate)} — ${doc?.name ?? r.documentId}` : formatDisplayDate(r.dueDate);
    return `• ${prefix} — ${status}${r.isDemo ? " (demo)" : ""}`;
  });
  const more = records.length > shown.length ? `\n…and ${records.length - shown.length} more — all of them are in the files view.` : "";
  const reply = `${scopeLabel} — ${range.label} (${records.length} record${records.length === 1 ? "" : "s"}):\n${lines.join("\n")}${more}`;

  const chips: Chip[] = [filesChip];
  if (shown.length === 1) {
    chips.push({ label: t("ai.chip.openIt"), action: { type: "navigate", route: routeForRecord(documentRepository.getById(shown[0].documentId), shown[0].id) } });
  } else if (shown.length <= 6) {
    for (const r of shown) chips.push({ label: formatDisplayDate(r.dueDate), action: { type: "navigate", route: routeForRecord(documentRepository.getById(r.documentId), r.id) } });
  }
  return { reply, chips, navigate: files };
}

function answerForDay(info: DayInfo, phrase: string, today: string): string {
  const master = masterRepository.get();
  const off = WEEKDAY_LONG[weeklyOffDay(master)];
  switch (info.kind) {
    case "weekly-off": {
      const adjustments = (master.adjustmentDays ?? []).filter((a) => a.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 3);
      const adj = adjustments.length
        ? ` ${off}s the plant does work (adjustment days): ${adjustments.map((a) => `${formatDisplayDate(a.date)}${a.forHoliday ? ` for ${a.forHoliday}` : ""}`).join(", ")}.`
        : "";
      return `${phrase} is the weekly off — every ${off} is a holiday here, so no records are due and the Daily Pest Control Monitoring Record is pre-marked as a holiday.${adj}`;
    }
    case "holiday":
      return `${phrase} is a company holiday — ${info.name} (Gujarat Print Pack Leave Calendar 2026). Nothing is due; anything scheduled for that day moves to the next working day.`;
    case "adjustment":
      return `${phrase} is an adjustment day${info.name ? ` for ${info.name}` : ""}: it's a ${info.weekday}, but everyone reports to the company, so it's a normal working day — records are due as usual.`;
    default:
      return `${phrase} is a working day (${info.weekday}). Records are due as normal.`;
  }
}

// "CAPA summary", "summary of the internal CAPA", "how many complaints are
// open" — answered from the records themselves, instantly and with no network
// call. Internal covers the inspection findings reports and the complaint
// acknowledgement reports; External covers the customer complaint checklists.
const CAPA_RE = /\b(capa|corrective (?:and|&) preventive|complaints?|inspection findings?)\b/i;
const CAPA_SUMMARY_RE = /\b(summary|summarise|summarize|overview|status|how many|where (?:do|does) (?:we|it|they) stand)\b/i;

function capaSummary(lower: string, isDemo: boolean): LocalAnswer {
  const today = todayISO();
  // The document ids this summary counts are written in below, so the
  // department filter the repositories apply never gets a say: asked plainly,
  // this would tell a Production or Stores account how many of Marketing's
  // customer complaints are open (REQUIREMENTS §40). Each side is reported
  // only when its own document is visible, and they are checked one at a time
  // because they belong to different departments — the inspection findings
  // report to QA, the complaint checklist and its acknowledgement to Marketing.
  const wantsInternal = !/\bexternal\b/.test(lower) && isDocumentIdVisible("gap-inspection");
  const wantsExternal = !/\binternal\b/.test(lower) && isDocumentIdVisible("capa-customer-complaint");
  const parts: string[] = [];
  const chips: Chip[] = [];
  const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  if (wantsInternal) {
    const reports = recordRepository.query({ documentId: "gap-inspection", isDemo }) as RecordInstance<GapInspectionData>[];
    const findings = reports.flatMap((r) => r.data.findings);
    const open = findings.filter((f) => f.status === "Open" || f.status === "Overdue");
    const overdue = open.filter((f) => f.status === "Overdue" || (!!f.targetDate && compareISO(f.targetDate, today) < 0));
    const closed = findings.filter((f) => f.status === "Closed" || f.status === "Verified");
    const latest = reports.slice().sort((a, b) => compareISO(b.dueDate, a.dueDate))[0];
    const acks = (isDocumentIdVisible("capa-complaint-ack")
      ? recordRepository.query({ documentId: "capa-complaint-ack", isDemo })
      : []) as RecordInstance<ComplaintAckData>[];
    const oldest = overdue.slice().sort((a, b) => compareISO(a.targetDate ?? "9999-12-31", b.targetDate ?? "9999-12-31"))[0];
    parts.push(
      [
        `Internal — ${count(reports.length, "inspection findings report")} holding ${count(findings.length, "finding")}: ${open.length} open (${overdue.length} overdue), ${closed.length} closed or verified.`,
        latest ? ` Last inspection ${formatDisplayDate(latest.data.inspectionDate || latest.dueDate)}.` : "",
        oldest ? ` Oldest overdue: "${oldest.findingOfInspection}"${oldest.targetDate ? `, target ${formatDisplayDate(oldest.targetDate)}` : ""}.` : "",
        acks.length ? ` ${count(acks.length, "complaint acknowledgement report")}, ${acks.filter((r) => r.status === "Verified").length} signed off.` : "",
      ].join("")
    );
    chips.push({ label: "Open Internal CAPA", action: { type: "navigate", route: "/gap/internal" } });
  }

  if (wantsExternal) {
    const complaints = recordRepository.query({ documentId: "capa-customer-complaint", isDemo }) as RecordInstance<ComplaintChecklistData>[];
    const approved = complaints.filter((r) => r.status === "Verified");
    const awaiting = complaints.filter((r) => r.status === "Submitted" || r.status === "Pending Verification");
    const working = complaints.filter((r) => ["Scheduled", "Due", "In Progress", "Rejected"].includes(r.status));
    const items = complaints.flatMap((r) => r.data.sections.flatMap((s) => s.items));
    const done = items.filter((it) => it.done || it.notRequired).length;
    const latest = complaints.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
    parts.push(
      [
        `External — ${count(complaints.length, "customer complaint")}: ${working.length} being worked on, ${awaiting.length} waiting for approval, ${approved.length} approved.`,
        items.length ? ` ${done} of ${items.length} checklist activities done.` : "",
        latest ? ` Latest ${latest.data.complaintNo || "(no number yet)"}${latest.data.customerName ? ` — ${latest.data.customerName}` : ""}.` : "",
      ].join("")
    );
    chips.push({ label: "Open External CAPA", action: { type: "navigate", route: "/gap/external" } });
  }

  // Nothing left to report means the CAPA documents asked about belong to
  // another department (REQUIREMENTS §40) — said plainly, and before the
  // "Demo data." prefix, so it cannot read as an empty answer or a fault.
  if (parts.length === 0) {
    return {
      reply: `That part of CAPA isn't yours to see: your account covers ${departmentScopeLabel()}, while the inspection findings reports belong to ${documentDepartmentLabel("gap-inspection")} and the customer complaint records to ${documentDepartmentLabel("capa-customer-complaint")}. Ask the system administrator to add the department to your account if you need them.`,
    };
  }

  return { reply: `${isDemo ? "Demo data. " : ""}${parts.join("\n\n")}`, chips };
}

export function localAnswer(message: string, isDemo: boolean, userName?: string): LocalAnswer | null {
  const text = message.trim();
  const lower = text.toLowerCase();
  const today = todayISO();
  const master = masterRepository.get();

  // Scope first: a message that cannot be about this system is declined
  // before any intent routing (see offTopicReply above).
  const offTopic = offTopicReply(text);
  if (offTopic) return offTopic;

  // WHO IS TALKING (REQUIREMENTS §50). A greeting, a thank you, "what can you
  // do?" and "are you a real person?" are answered here and now — a buddy
  // shouldn't need a network round trip to say hello, and the honest answer to
  // the last one is never the model's to improvise.
  if (IDENTITY_RE.test(lower)) return { reply: whoIAm(), chips: guide("home").chips };
  if (GREETING_RE.test(text)) {
    const home = guide("home");
    return { reply: `${hello(userName)}\n${home.text}`, chips: home.chips };
  }
  if (THANKS_RE.test(text)) {
    const first = (userName ?? "").trim().split(/\s+/)[0];
    return { reply: t("ai.youreWelcome", { name: first ? `, ${first}` : "" }), chips: guide("home").chips };
  }
  if (CAPABILITY_RE.test(lower)) {
    const about = guide("about");
    return { reply: about.text, chips: about.chips };
  }

  // "F/HR/05", "what is F-QC-12?", "open hr 5": the document by its format
  // number — what it is and what to do with it, asked first; opened when that
  // is what was asked (engine/formatNumbers.ts, REQUIREMENTS §52).
  const byFormat = formatNumberAnswer(text);
  if (byFormat) return byFormat;

  // "open HR master data", and where a fetch from it is done (REQUIREMENTS §53).
  const hrMaster = hrMasterChatAnswer(text);
  if (hrMaster) return hrMaster;

  if (HOLIDAY_RE.test(lower)) {
    if (ADJUSTMENT_RE.test(lower)) return { reply: listAdjustmentDays(today), chips: holidayChips() };
    const ref = parseDateRef(text, today);
    if (ref) return { reply: answerForDay(dayInfo(ref.date, master), ref.phrase, today), chips: holidayChips() };
    if (NEXT_RE.test(lower)) return { reply: listUpcoming(today, 8), chips: holidayChips() };
    return null; // e.g. "which day is our weekly off?" — the model answers from the context
  }

  if (/\b(due today|what'?s due|whats due|pending today|today'?s (work|records|tasks|list)|to-?do)\b/.test(lower)) {
    // "What's due on Friday / tomorrow / this week / next month?" is about
    // another day or a span — the model handles that (it can open /day/{date}
    // or the month's calendar); only today is answered locally.
    const ref = parseDateRef(text, today);
    if (ref && ref.date !== today) return null;
    if (/\b(week|month|year|fortnight)\b/.test(lower)) return null;
    const due = recordRepository.query({ dueDate: today, isDemo });
    const done = due.filter((r) => ["Submitted", "Pending Verification", "Verified"].includes(r.status)).length;
    const open = due.length - done;
    const info = dayInfo(today, master);
    let prepared = "";
    if (!isDemo) {
      const b = computeBriefing(userName);
      const ready = b.ready.length + b.needsInput.length;
      if (ready) prepared = ` I've already prepared ${ready} of them — ${b.ready.length} ready for your OK${b.needsInput.length ? `, ${b.needsInput.length} needing a detail only you know` : ""}.`;
      if (b.awaitingVerification.length) prepared += ` ${b.awaitingVerification.length} ${b.awaitingVerification.length === 1 ? "is" : "are"} waiting for a verifier.`;
      if (b.overdue.length) prepared += ` ${b.overdue.length} older ${b.overdue.length === 1 ? "record is" : "records are"} overdue.`;
    }
    const dayNote = info.isHoliday ? ` (${info.label} — so nothing is expected today)` : "";
    return {
      reply: `${formatDisplayDate(today)}${dayNote}: ${due.length} record${due.length === 1 ? "" : "s"} due — ${done} done, ${open} still open.${prepared}`,
      chips: [
        { label: t("ai.chip.openToday"), action: { type: "navigate", route: `/day/${today}` }, tone: "primary" },
        { label: t("ai.chip.briefing"), action: { type: "briefing" } },
      ],
    };
  }

  if (/\bbriefing\b/.test(lower) || /\bwhat (did|have) you (prepare|fill|do)/.test(lower)) {
    if (isDemo) return { reply: "The briefing covers your Live records — switch to Live Mode to see what I've prepared for you.", chips: [{ label: "Dashboard", action: { type: "navigate", route: "/dashboard" } }] };
    const b = computeBriefing(userName);
    const parts = [
      b.ready.length ? `${b.ready.length} record${b.ready.length === 1 ? "" : "s"} filled in and ready for your OK` : "",
      b.needsInput.length ? `${b.needsInput.length} needing a detail only you know` : "",
      b.awaitingVerification.length ? `${b.awaitingVerification.length} waiting for a verifier` : "",
      b.overdue.length ? `${b.overdue.length} overdue` : "",
    ].filter(Boolean);
    return {
      reply: parts.length ? `Here's where things stand: ${parts.join(", ")}. Open the briefing to review and submit them in one go.` : "You're all caught up — nothing is waiting on you right now.",
      chips: [{ label: "Open today's briefing", action: { type: "briefing" }, tone: "primary" }],
    };
  }

  if (CAPA_RE.test(lower) && CAPA_SUMMARY_RE.test(lower)) return capaSummary(lower, isDemo);

  const listing = listDocumentsAnswer(text, isDemo);
  if (listing) return listing;

  if (/^(help|\?|what can you do\??|how do you work\??)$/.test(lower) || /\b(what can you do|what do you do|how can you help)\b/.test(lower)) {
    const off = WEEKDAY_LONG[weeklyOffDay(master)];
    return {
      reply: `I can take you anywhere in the app in plain words ("show me August's reports", "open the rat / mice service reports"), list a document's records for a date range ("daily pest control monitoring record from 1 to 19 January", "pest records for September"), fill in a record you have open ("checker is Ramesh, time 9:15"), fill a whole document for you — question by question ("I want to fill the external CAPA", "walk me through it") or with realistic sample data ("fill it with sample data", "generate an external CAPA for me") — start a new one ("create a new fly catcher record"), submit it, verify it, print it, put an edit back or delete it — anything the buttons do, said in words or spoken — tell you what's due and what I've already prepared, summarise CAPA for you (internal findings and customer complaints), and answer calendar questions — holidays, the ${off} weekly off, adjustment days. I stick to this record system only — I'm not a general chatbot, so anything outside this software I'll politely decline.`,
      chips: [
        { label: t("ai.chip.dueToday"), action: { type: "navigate", route: `/day/${today}` } },
        { label: t("ai.chip.pestControl"), action: { type: "navigate", route: "/pest-control" } },
        { label: t("ai.chip.monthReports"), action: { type: "navigate", route: "/reports" } },
      ],
    };
  }

  return null;
}

export function buildAssistantContext(isDemo: boolean, userName?: string): string {
  const master = masterRepository.get();
  const today = todayISO();
  const t = dayInfo(today, master);
  const tomorrow = dayInfo(addDays(today, 1), master);
  const off = WEEKDAY_LONG[weeklyOffDay(master)];
  const upcoming = upcomingHolidays(today, master, 8, 150).map((i) =>
    i.kind === "adjustment" ? `${formatDisplayDate(i.date)} (${i.weekday}) adjustment day${i.name ? ` for ${i.name}` : ""} — a WORKING day` : `${formatDisplayDate(i.date)} (${i.weekday}) ${i.name} — holiday`
  );
  const due = recordRepository.query({ dueDate: today, isDemo });
  const done = due.filter((r) => ["Submitted", "Pending Verification", "Verified"].includes(r.status)).length;
  let workload = `Records due today: ${due.length} (${done} submitted or verified, ${due.length - done} still open).`;
  if (!isDemo) {
    const b = computeBriefing(userName);
    workload += ` Prepared by the assistant and waiting for review: ${b.ready.length + b.needsInput.length}. Awaiting verification: ${b.awaitingVerification.length}. Overdue: ${b.overdue.length}.`;
  }
  return [
    `Today: ${describeDay(t)}.`,
    `Tomorrow: ${describeDay(tomorrow)}.`,
    `Weekly off: every ${off} (next: ${formatDisplayDate(nextWeeklyOff(addDays(today, 1), master))}). An "adjustment day" is a ${off} on which everyone reports to the company — a working day that makes up for a festival holiday. Source: Gujarat Print Pack Leave Calendar 2026 (Master Data → Holidays).`,
    `Upcoming holidays / adjustment days: ${upcoming.length ? upcoming.join("; ") : "none in the next five months"}.`,
    "Scheduling rule: a Daily Pest Control Monitoring Record on a closed day is pre-marked as a holiday; other daily registers have no sheet that day; fortnightly / monthly / quarterly / yearly records that land on a closed day move to the next working day.",
    workload,
    // The model is told which mode this is only where there are two (engine/features.ts,
    // REQUIREMENTS §65): the product has one, and Mitra has no "Live mode" to speak of.
    `${demoModeAvailable() ? `Mode: ${isDemo ? "Demo (synthetic data)" : "Live"}. ` : ""}User: ${userName ?? "unknown"}.`,
  ]
    .join("\n")
    .slice(0, 3800);
}
