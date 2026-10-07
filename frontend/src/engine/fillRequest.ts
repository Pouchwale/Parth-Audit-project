// IS THIS A FILL, AND WHAT DID THE PERSON SAY? DCRS's own reading, with no
// network (REQUIREMENTS §94).
//
// The owner, 7-Oct-2026: "chatbot is open documents but it is not filling
// record which i want it fill ... both can perform". The diagnoses of that day
// found the model rarely got a record's shape right and that a fill cost 6,000
// to 21,000 tokens. So a fill is read here first, by rules, in English, Hindi
// and Gujarati, in their own scripts and in Latin letters:
//
//   * WHETHER it is a fill: a fill verb or a sample word (fill, enter, write,
//     put, भर/भरो/लिखो/दर्ज, ભર/ભરો/લખો/નોંધ, bharo/likho/nondh …), or a
//     document named, open or just filled together with a value its form
//     recognises (a time-slot reading, an option of a select, a name after a
//     sign word, "label is value", a check point). A question is never a fill.
//   * WHICH document: its format number, its aliases, else its words with
//     stems (cleaned = cleaning) and a small Hindi/Gujarati noun table
//     (ગાડી/गाड़ी = vehicle, સફાઈ/सफाई = cleaning …), a matching select option
//     raising a candidate's score. Not one: at most twelve candidates.
//   * WHICH day: today, yesterday, tomorrow, આજે, ગઈકાલે, આવતીકાલે, आज, and
//     every date normDate reads. "kal"/"कल"/"કાલે" alone is yesterday or
//     tomorrow: it is asked, never guessed.
//   * WHAT values (Tier 0): slot readings ("18 at 10:00 and 19 at 14:00",
//     "09:00 20.1, 10:00 20.3", "सुबह 10 बजे 18"), "label is value"
//     (engine/recordPatch.ts parseLocalEdit), F/HR/17's "all fine" in the three
//     languages (check points 1-3 and 5-10 fine, 4 untouched without a count) and
//     "no rodent caught" (point 7 No), a name after a sign word (driver,
//     checker, tested by, ड्राइवर, ડ્રાઇવર …), a select option said by its own
//     word (ECHO, dry), a time of checking, a count of traps.
//   * WHAT IS LEFT: `residual` is true when words that carry a value were not
//     read. Only then is the model asked (engine/fillPlan.ts says how the two
//     readings are merged: on a check point the rules win).
//
// Nothing here writes, opens or starts anything.
import type { DocumentDefinition, LogColumn, LogHeaderField, LogSheetLayout, RecordInstance } from "../types";
import { documentRepository } from "../data/repositories/documentRepository";
import { recordRepository } from "../data/repositories/recordRepository";
import { masterRepository } from "../data/repositories/masterRepository";
import { getLogSheetLayoutForRecord } from "../data/seed/logSheetLayouts";
import { matchDocuments } from "./assistantLocal";
import { documentsByFormatNumber } from "./formatNumbers";
import { normDate, parseLocalEdit, type ItemEdit } from "./recordPatch";
import { createDefaultData } from "./recordDefaults";
import { periodKeyFor } from "./recordGenerator";
import { isSignField, MAX_CANDIDATES } from "./fillCard";
import { askedLanguage } from "../utils/scripts";
import { addDays, pad2, todayISO } from "../utils/date";
import type { FillLanguage } from "../i18n/fillPhrases";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

export type FillMode = "values" | "sample" | "bare" | "guide" | "copy";

/** The values to write, in the fixed shape the model also answers in (backend/mitraFill.ts FILL_PROMPT). */
export interface FillValues {
  doc?: string;
  date?: string | null;
  header?: Obj;
  slots?: Record<string, Obj>;
  rows?: Obj[];
  checks?: Record<string, unknown>;
  fields?: Obj;
  submit?: boolean;
  unclear?: string;
  /** The rules' own line edits (parseLocalEdit); never from the model. */
  itemEdits?: ItemEdit[];
}

/** What the rules read of the person's words, besides the values: what decides merging and grounding. */
export interface RulesReading {
  values: FillValues;
  /** "All fine" said (F/HR/17): the rules beat the model on every check point not named. */
  allFine: boolean;
  /** Check point numbers the person named (by number or by its subject). */
  namedPoints: number[];
  /** At least one value was read. */
  recognised: boolean;
  /** Words that carry a value were left unread. */
  residual: boolean;
}

export interface FillRequestContext {
  today?: string;
  isDemo: boolean;
  /** The record on screen (the dock on a record page), if any. */
  openRecordId?: string | null;
  /** The document whose own page is on screen, if any. */
  screenDocumentId?: string | null;
  /** The record the last fill in this conversation was made on. */
  lastRecordId?: string | null;
  /** Named outright by the caller (the fill_record tool, the phone's API). */
  documentId?: string | null;
  recordId?: string | null;
  dateISO?: string | null;
  /** The fill_record tool: the model has decided it is a fill. */
  forceFill?: boolean;
  /** The fill_record tool's sample:true. */
  forceSample?: boolean;
  /** The conversation's language, for words that have none of their own ("fill it"). */
  language?: FillLanguage;
}

export type FillRequest =
  | { kind: "not-a-fill" }
  | {
      kind: "fill";
      /** The document, when one is certain. */
      doc: DocumentDefinition | null;
      /** When not certain: the documents that fit, best first (at most twelve). */
      candidates: DocumentDefinition[];
      dateISO: string;
      /** The person said a day (today, a date …). */
      dateSaid: boolean;
      /** "kal" said alone: which day is asked. */
      dayQuestion?: { word: string; yesterday: string; tomorrow: string };
      /** Where the record came from: the open one, one named by id, the last one filled, or found by document and date. */
      recordRef: "open" | "named" | "last" | null;
      /** The record named or open, when there is one. */
      recordId: string | null;
      /** A document that keeps one record per thing (F/DISP/04, one per vehicle): the thing said. */
      identity: { key: string; label: string; value: string } | null;
      mode: FillMode;
      rules: RulesReading | null;
      submitAsked: boolean;
      language: FillLanguage;
      words: string;
    };

// ---------------------------------------------------------------------------
// words

/** Devanagari and Gujarati digits as ASCII ones: "૧૮" and "१८" are 18. */
export function asciiDigits(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x966 && c <= 0x96f) out += String(c - 0x966);
    else if (c >= 0xae6 && c <= 0xaef) out += String(c - 0xae6);
    else out += ch;
  }
  return out;
}

const WORD_RE = /[\p{L}\p{M}\p{N}]+/gu;

/** The words of a text, lower case, NFC, digits as ASCII. */
export function wordsOf(text: string): string[] {
  return (asciiDigits(String(text ?? "")).normalize("NFC").toLowerCase().match(WORD_RE) ?? []).map((w) => w.normalize("NFC"));
}

// THE NOUN TABLE: what a Hindi or Gujarati word (or a near English one) means, in the
// words the forms print, so a document and an option are found from any of the three.
const NOUN_TABLE: [string[], string][] = [
  [["ગાડી", "ગાડીની", "ગાડીનું", "गाड़ी", "गाडी", "गाड़ी", "gadi", "gaadi", "vehicle", "vehicles", "truck", "van", "vahan", "वाहन", "વાહન"], "vehicle"],
  [["સાફ", "સફાઈ", "સફાઇ", "सफाई", "साफ", "safai", "saaf", "saf", "clean", "cleaned", "cleaning"], "cleaning"],
  [["પેસ્ટ", "पेस्ट", "pest", "pests", "જીવાત", "कीट"], "pest"],
  [["ઉંદર", "ઉંદરો", "चूहा", "चूहे", "chuha", "chuhe", "undar", "rodent", "rodents", "rat", "rats", "mice", "mouse"], "rodent"],
  [["વિસ્કોસિટી", "विस्कोसिटी", "viscosity", "visc"], "viscosity"],
  [["તાપમાન", "तापमान", "temperature", "temp", "tapman"], "temperature"],
  [["ડ્રાઇવર", "ડ્રાઈવર", "ड्राइवर", "ड्राईवर", "driver", "draiver"], "driver"],
  [["ચેકર", "चेकर", "checker"], "checker"],
  [["ડ્રાય", "ડ્રાઈ", "ड्राई", "ड्राय", "dry", "સૂકું", "सूखा", "sukha", "sukhu"], "dry"],
  [["વેટ", "वेट", "wet", "ભીનું", "गीला", "bhinu", "gila"], "wet"],
  [["મોપિંગ", "મોપીંગ", "मॉपिंग", "मोपिंग", "mopping", "mop", "પોતું", "पोंछा", "potu", "pochha"], "mopping"],
  [["રેકોર્ડ", "रिकॉर्ड", "रेकॉर्ड", "रिकार्ड", "record", "રજિસ્ટર", "रजिस्टर", "register", "પત્રક"], "record"],
  [["દૈનિક", "રોજનું", "दैनिक", "रोजाना", "daily", "roj", "rojnu", "rozana"], "daily"],
  [["કંટ્રોલ", "कंट्रोल", "control", "niyantran", "નિયંત્રણ", "नियंत्रण"], "control"],
  [["મોનિટરિંગ", "मॉनिटरिंग", "monitoring"], "monitoring"],
  [["ફ્લાય", "फ्लाई", "fly", "માખી", "मक्खी", "makhi", "makkhi"], "fly"],
  [["કેચર", "कैचर", "catcher"], "catcher"],
  [["એડહેસિવ", "एडहेसिव", "adhesive", "ગુંદર", "gum"], "adhesive"],
  [["લેમિનેશન", "लेमिनेशन", "lamination"], "lamination"],
  [["મશીન", "मशीन", "machine", "mashin"], "machine"],
  [["ટ્રેપ", "ट्रैप", "trap", "traps", "પીંજરા", "पिंजरा"], "trap"],
  [["પોઈન્ટ", "પોઇન્ટ", "पॉइंट", "प्वाइंट", "point", "points", "cp"], "point"],
  [["સમય", "समय", "time", "samay"], "time"],
  [["ચેક", "चेक", "check", "checked", "checking", "તપાસ", "जाँच", "जांच", "tapas", "janch"], "check"],
  [["ટેસ્ટ", "टेस्ट", "test", "tested", "testing"], "test"],
  [["ગેપ", "गैप", "gap", "gaps", "તિરાડ", "दरार"], "gap"],
  [["દરવાજો", "દરવાજા", "दरवाजा", "दरवाज़ा", "door", "doors", "shutter"], "door"],
  [["લાઇટ", "લાઈટ", "लाइट", "light", "lights", "tube"], "light"],
];
const NOUNS = new Map<string, string>();
for (const [words, canon] of NOUN_TABLE) for (const w of words) NOUNS.set(w.normalize("NFC").toLowerCase(), canon);

/** "cleaned" and "cleaning" alike: a light stem for Latin words. */
function stem(w: string): string {
  if (!/^[a-z]+$/.test(w)) return w;
  let s = w;
  if (s.length > 4 && s.endsWith("ies")) s = `${s.slice(0, -3)}y`;
  else if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1);
  if (s.length > 5 && s.endsWith("ing")) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith("ed")) s = s.slice(0, -2);
  return s;
}

/** A word as the documents are searched by: the noun table's meaning, else its stem. */
export function canon(w: string): string {
  const n = NOUNS.get(w);
  return stem(n ?? w);
}

// The words that carry no value of their own, in the three languages.
const FILLER = new Set(
  [
    // English
    "the", "a", "an", "and", "or", "of", "to", "for", "at", "in", "on", "by", "with", "from", "as", "today", "todays", "s", "yesterday",
    "tomorrow", "please", "pls", "kindly", "can", "you", "could", "would", "will", "just", "now", "it", "this", "that", "these", "those",
    "its", "is", "are", "was", "were", "be", "been", "has", "have", "had", "done", "also", "then", "here", "there", "my", "our", "me",
    "i", "we", "record", "records", "sheet", "form", "register", "entry", "entries", "reading", "readings", "value", "values", "fill",
    "filled", "enter", "write", "put", "note", "down", "open", "seconds", "second", "sec", "secs", "hrs", "hr", "hours", "minutes",
    "mins", "morning", "evening", "afternoon", "night", "am", "pm", "o", "clock", "oclock", "ok", "okay", "fine", "normal", "all",
    "everything", "every", "each", "them", "they", "set", "change", "update", "correct", "mark", "make", "data", "following", "below",
    "per", "slot", "slots", "line", "lines", "row", "rows", "date", "day", "type", "sign", "name", "kg", "mm", "deg", "degree", "c",
    "want", "need", "help", "let", "lets", "start", "go", "ahead", "yourself", "automatically", "rest", "remaining", "whole",
    // Hindi
    "आज", "और", "का", "की", "के", "को", "में", "है", "हैं", "हुई", "हुआ", "हो", "गई", "गया", "था", "थी", "ने", "से", "पर", "भी",
    "तो", "यह", "ये", "वह", "सब", "सारे", "भरो", "भर", "दो", "दें", "करो", "कर", "किया", "करें", "सुबह", "सवेरे", "दोपहर", "शाम", "रात",
    "बजे", "सेकंड", "सेकेंड", "रिकॉर्ड", "फॉर्म", "मिला", "मिले", "लिखो", "लिखें", "दर्ज", "डालो", "का", "वाला", "वाली", "कृपया",
    // Gujarati
    "આજે", "આજનો", "આજનું", "આજની", "અને", "નો", "ની", "નું", "ના", "ને", "માં", "છે", "છો", "હતું", "હતી", "હતો", "કરી", "કર્યું",
    "કરો", "ભરો", "ભરી", "દો", "દેજો", "થી", "પર", "પણ", "તો", "આ", "એ", "સવારે", "બપોરે", "સાંજે", "રાત્રે", "વાગ્યે", "વાગે",
    "સેકન્ડ", "ફોર્મ", "લખો", "લખી", "નોંધો", "નાખો", "થયું", "થઈ", "થયો", "ગયું", "કૃપા", "કરીને",
    // Hindi and Gujarati in Latin letters
    "aaj", "aaje", "aajnu", "aajno", "aur", "ane", "ka", "ki", "ke", "ko", "mein", "me", "ma", "che", "chhe", "hai", "nu", "ni", "no",
    "na", "ne", "bharo", "bhari", "bhar", "bhardo", "do", "karo", "kari", "kar", "likho", "nondh", "nondho", "lakho", "subah", "savare",
    "baje", "vagye", "vage", "bapore", "sanje", "hua", "hui", "thayu", "thai",
  ].map((w) => w.normalize("NFC"))
);

// ---------------------------------------------------------------------------
// whether it is a fill

const FILL_VERBS = new Set(
  [
    "fill", "enter", "write", "put", "note", "set", "change", "update", "correct", "भर", "भरो", "भरें", "भरिए", "भरना", "भरदो", "लिखो",
    "लिखें", "लिख", "दर्ज", "डालो", "ભર", "ભરો", "ભરી", "ભરવું", "ભરવાનું", "લખો", "લખી", "લખ", "નોંધ", "નોંધો", "નાખો", "bhar",
    "bharo", "bhari", "bhardo", "bharna", "bharvanu", "likho", "likh", "nondh", "nondho", "lakho", "lakhi",
  ].map((w) => w.normalize("NFC"))
);
const QUESTION_FIRST = new Set(
  [
    "what", "which", "when", "who", "whom", "whose", "why", "how", "is", "was", "are", "were", "did", "does", "do", "has", "have",
    "show", "list", "tell", "find", "search", "kya", "kyu", "kyon", "kab", "kaun", "kitna", "kitne", "kitni", "shu", "kem", "ketla",
    "ketlu", "kyare", "kayu", "kayo", "क्या", "कब", "कौन", "कितना", "कितने", "कितनी", "किसने", "क्यों", "कहाँ", "कैसे", "શું", "ક્યારે",
    "કોણ", "કેટલા", "કેટલું", "કેટલી", "કયું", "કયો", "કઈ", "કેમ", "ક્યાં",
  ].map((w) => w.normalize("NFC"))
);
const POLITE_START = /^(?:please\s+|pls\s+|kindly\s+)?(?:can|could|would|will)\s+you\b/i;

const SAMPLE_RE = /\b(?:sample|dummy|fake|demo|made[- ]up|placeholder|test (?:data|values|entries))\b|नमूना|सैंपल|डमी|નમૂના|સેમ્પલ|ડમી|\bnamuna\b/i;
const GUIDE_RE =
  /\b(?:walk me through|step by step|question by question|one by one|one at a time|guide me|help me(?: to)?(?: fill| with)?|ask me(?: each| every| the)?|interview me|take me through|check the estimates|i (?:want|need|have) to fill|let'?s fill|let us fill)\b|पूछो|पूछिए|पूछ\s*पूछ|एक एक करके|મને પૂછો|પૂછો|પૂછીને|એક એક કરીને|\bpu+chh?o\b/i;
const COPY_RE = /\bcopy (?:it |them )?(?:from|of)\b|\bsame as (?:yesterday|last)\b|से कॉपी|માંથી નકલ|\bcopy kar/i;
const SUBMIT_RE = /\bsubmit\b|\bsend (?:it |this )?for (?:verification|approval)\b|सबमिट|जमा कर|જમા કર|સબમિટ|\bjama kar/i;
// A change to the FORMAT, not to a record: never read as a fill (engine/formatCommands.ts takes it).
const FORMAT_RE = /\b(?:add|remove|rename|delete|insert|move)\b.*\b(?:column|box|header|field)\b|\b(?:revision|rev\s?\d|format change)\b/i;
const OPEN_ONLY_RE = /^(?:please\s+)?(?:open|show|go to|take me to)\b/i;

// ---------------------------------------------------------------------------
// days

const TODAY = new Set(["today", "todays", "aaj", "aaje", "aajnu", "aajno", "આજે", "આજનો", "આજનું", "આજની", "આજ", "आज"].map((w) => w.normalize("NFC")));
const YESTERDAY = new Set(["yesterday", "yesterdays", "ગઈકાલે", "ગઇકાલે", "ગઈકાલનું", "gaikale", "beeta"].map((w) => w.normalize("NFC")));
const TOMORROW = new Set(["tomorrow", "tomorrows", "આવતીકાલે", "આવતીકાલનું", "aavtikale", "avtikale"].map((w) => w.normalize("NFC")));
const KAL = new Set(["kal", "kale", "कल", "કાલે", "કાલ"].map((w) => w.normalize("NFC")));
const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec";

interface Span {
  start: number;
  end: number;
}

interface DayReading {
  iso: string;
  said: boolean;
  question?: { word: string; yesterday: string; tomorrow: string };
  spans: Span[];
}

function readDay(text: string, today: string): DayReading {
  const spans: Span[] = [];
  const found: string[] = [];
  const explicit: RegExp[] = [
    /\b(\d{4}-\d{2}-\d{2})\b/g,
    /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/g,
    /\b(\d{1,2}\.\d{1,2}\.\d{4})\b/g,
    new RegExp(`\\b(\\d{1,2}(?:st|nd|rd|th)?[\\s-]+(?:${MONTHS})[a-z]*\\.?(?:[\\s-]+\\d{2,4})?)\\b`, "gi"),
  ];
  for (const re of explicit) {
    for (const m of text.matchAll(re)) {
      const iso = normDate(m[1].replace(/\s*-\s*/g, " ").replace(/\./g, m[1].includes("-") ? "-" : "."), today) ?? normDate(m[1], today);
      if (!iso) continue;
      found.push(iso);
      spans.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
    }
  }
  if (found.length) return { iso: found[0], said: true, spans };
  const words = wordsOf(text);
  if (words.some((w) => YESTERDAY.has(w)) || /बीता कल|पिछला कल|ગઈ કાલે|gai kale/i.test(text)) return { iso: addDays(today, -1), said: true, spans };
  if (words.some((w) => TOMORROW.has(w)) || /आने वाला कल|अगले दिन|આવતી કાલે|aavti kale/i.test(text)) return { iso: addDays(today, 1), said: true, spans };
  const kal = words.find((w) => KAL.has(w));
  if (kal && !words.some((w) => TODAY.has(w))) return { iso: today, said: false, spans, question: { word: kal, yesterday: addDays(today, -1), tomorrow: addDays(today, 1) } };
  if (words.some((w) => TODAY.has(w))) return { iso: today, said: true, spans };
  return { iso: today, said: false, spans };
}

// ---------------------------------------------------------------------------
// times and numbers

const AM_WORDS = "सुबह|सवेरे|subah|savere|સવારે|savare|morning";
const PM_WORDS = "दोपहर|dopahar|બપોરે|bapore|afternoon|शाम|shaam|sham|સાંજે|sanje|evening|रात|raat|રાત્રે|ratre|night";
const HOUR_WORDS = "बजे|baje|વાગ્યે|વાગે|vagye|vage|vaage|o'?clock|hrs|hours";

export interface TimeHit extends Span {
  time: string;
}

function withPeriod(h: number, period: string | undefined, ap: string | undefined): number | null {
  let hour = h;
  const a = (ap ?? "").toLowerCase().replace(/\./g, "");
  if (a === "pm" && hour < 12) hour += 12;
  if (a === "am" && hour === 12) hour = 0;
  if (!a && period) {
    const p = period.toLowerCase();
    if (new RegExp(`^(?:${AM_WORDS})$`, "i").test(p)) {
      if (hour === 12) hour = 0;
    } else if (/^(?:दोपहर|dopahar|બપોરે|bapore|afternoon)$/i.test(p)) {
      if (hour < 12 && hour <= 6) hour += 12;
    } else if (/^(?:शाम|shaam|sham|સાંજે|sanje|evening)$/i.test(p)) {
      if (hour < 12) hour += 12;
    } else if (/^(?:रात|raat|રાત્રે|ratre|night)$/i.test(p)) {
      if (hour >= 7 && hour < 12) hour += 12;
      else if (hour === 12) hour = 0;
    }
  }
  return hour >= 0 && hour <= 23 ? hour : null;
}

/** Every time of day written in the text (digits already ASCII), with where it stands. */
export function scanTimes(text: string): TimeHit[] {
  const hits: TimeHit[] = [];
  const taken = (s: number, e: number) => hits.some((h) => s < h.end && e > h.start);
  const push = (start: number, end: number, h: number, min: number) => {
    if (h > 23 || min > 59 || taken(start, end)) return;
    hits.push({ start, end, time: `${pad2(h)}:${pad2(min)}` });
  };
  const period = `(?:(${AM_WORDS}|${PM_WORDS})\\s*(?:के|ના|ni|na|ka)?\\s*)?`;
  // 10:00, 9:30 am, सुबह 9:30, 2:00 बजे; a dot only with am/pm or an hour word (20.15 is a reading).
  const colon = new RegExp(`${period}(\\d{1,2}):(\\d{2})(?!\\d)\\s*(am|pm|a\\.m\\.|p\\.m\\.)?\\s*(?:${HOUR_WORDS})?`, "giu");
  for (const m of text.matchAll(colon)) {
    const h = withPeriod(Number(m[2]), m[1], m[4]);
    if (h !== null) push(m.index ?? 0, (m.index ?? 0) + m[0].length, h, Number(m[3]));
  }
  const dotted = new RegExp(`${period}(\\d{1,2})\\.(\\d{2})\\s*(am|pm|a\\.m\\.|p\\.m\\.|${HOUR_WORDS})`, "giu");
  for (const m of text.matchAll(dotted)) {
    const ap = /^(am|pm|a\.m\.|p\.m\.)$/i.test(m[4]) ? m[4] : undefined;
    const h = withPeriod(Number(m[2]), m[1], ap);
    if (h !== null) push(m.index ?? 0, (m.index ?? 0) + m[0].length, h, Number(m[3]));
  }
  const ampm = new RegExp(`${period}(\\d{1,2})\\s*(am|pm|a\\.m\\.|p\\.m\\.)(?![a-z])`, "giu");
  for (const m of text.matchAll(ampm)) {
    const h = withPeriod(Number(m[2]), m[1], m[3]);
    if (h !== null) push(m.index ?? 0, (m.index ?? 0) + m[0].length, h, 0);
  }
  const hourWord = new RegExp(`${period}(\\d{1,2})\\s*(?:${HOUR_WORDS})`, "giu");
  for (const m of text.matchAll(hourWord)) {
    const h = withPeriod(Number(m[2]), m[1], undefined);
    if (h !== null) push(m.index ?? 0, (m.index ?? 0) + m[0].length, h, 0);
  }
  return hits.sort((a, b) => a.start - b.start);
}

interface NumberHit extends Span {
  value: number;
  raw: string;
}

const inside = (s: Span, spans: readonly Span[]): boolean => spans.some((x) => s.start < x.end && s.end > x.start);

function scanNumbers(text: string, skip: readonly Span[]): NumberHit[] {
  const out: NumberHit[] = [];
  for (const m of text.matchAll(/(?<![\p{L}\p{N}.\-/])-?\d+(?:\.\d+)?(?![\p{L}\p{N}]|[.\-/]\d)/gu)) {
    const span = { start: m.index ?? 0, end: (m.index ?? 0) + m[0].length };
    if (inside(span, skip)) continue;
    out.push({ ...span, value: Number(m[0]), raw: m[0] });
  }
  return out;
}

/** Format numbers and codes (F-QC-30, F/HR/17, GJ02ZZ6403, rec-…): never readings. */
function codeSpans(text: string): Span[] {
  const spans: Span[] = [];
  // F/HR/17, F-QC-30, F-QC-40.C; QC-30; GJ02ZZ6403 (letters, digits, letters); a record's id.
  const res = [/\b[a-z]{1,4}[/-][a-z]{1,5}(?:[/-][a-z0-9.]+)+\b/gi, /\b[a-z]{1,4}[/-]\d+[a-z0-9./-]*\b/gi, /\b[a-z]+\d+[a-z]+\d*[a-z0-9]*\b/gi, /\brec-[a-z0-9-]+\b/gi];
  for (const re of res) for (const m of text.matchAll(re)) spans.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  return spans;
}

// ---------------------------------------------------------------------------
// the document

const GENERIC_DOC_WORDS = new Set(["record", "report", "register", "sheet", "form", "checklist", "format", "document"]);
const DOC_STOP = new Set(["the", "and", "for", "fill", "open", "today", "todays", "yesterday", "tomorrow", "with", "this", "that", "please", "data", "sample", "it", "in", "of", "at", "on", "to", "a", "an", "all", "by", "is", "was"]);

function docVocabulary(doc: DocumentDefinition): Set<string> {
  const vocab = new Set<string>();
  const add = (s: string | undefined | null) => {
    for (const w of wordsOf(s ?? "")) vocab.add(canon(w));
  };
  add(doc.name);
  add(doc.formatNo);
  add(doc.module);
  add(doc.section);
  if (doc.kind === "log-sheet") {
    const layout = getLogSheetLayoutForRecord(doc.id, null);
    if (layout) {
      for (const f of [...layout.headerFields, ...(layout.footerFields ?? []), ...layout.columns]) add(f.label);
      for (const line of layout.instructions ?? []) add(line);
    }
  }
  if (doc.kind === "daily-pest-monitoring") {
    for (const c of masterRepository.get().checkpoints) add(c.text);
    add("checker time of checking holiday");
  }
  return vocab;
}

const vocabCache = new Map<string, Set<string>>();
function vocabularyOf(doc: DocumentDefinition): Set<string> {
  let v = vocabCache.get(doc.id);
  if (!v) {
    v = docVocabulary(doc);
    vocabCache.set(doc.id, v);
  }
  return v;
}

/** Select options said by a word of their own ("ECHO", "dry"): field key → option. */
interface OptionHit extends Span {
  field: LogHeaderField | LogColumn;
  where: "header" | "column";
  option: string;
}

function distinctive(options: readonly string[]): Map<string, string[]> {
  const tokensOf = (o: string) => [...new Set(wordsOf(o).map(canon))].filter((t) => t.length >= 3 && !FILLER.has(t) && !/^\d+$/.test(t));
  const all = options.map(tokensOf);
  const out = new Map<string, string[]>();
  options.forEach((o, i) => {
    out.set(
      o,
      all[i].filter((t) => all.every((other, j) => j === i || !other.includes(t)))
    );
  });
  return out;
}

const YESNO_OPTION = /^(?:yes|no|ok|not ok|na|n\/a|c|nc|હા|ના|नहीं|हाँ|good|bad|pass|fail|accepted|rejected)$/i;

function optionHits(text: string, layout: LogSheetLayout): OptionHit[] {
  const hits: OptionHit[] = [];
  const lower = asciiDigits(text).normalize("NFC");
  const fields: { f: LogHeaderField | LogColumn; where: "header" | "column" }[] = [
    ...[...layout.headerFields, ...(layout.footerFields ?? [])].filter((f) => f.type === "select" && !f.computed).map((f) => ({ f, where: "header" as const })),
    ...(layout.rowMode.kind === "free" || layout.rowMode.kind === "single" ? layout.columns.filter((c) => c.type === "select" && !c.fixed && !c.computed).map((f) => ({ f, where: "column" as const })) : []),
  ];
  for (const { f, where } of fields) {
    const options = (f.options ?? []).filter((o) => !YESNO_OPTION.test(o.trim()));
    if (options.length < 2 || options.length > 16) continue;
    const marks = distinctive(options);
    const found: { option: string; span: Span }[] = [];
    for (const m of lower.matchAll(WORD_RE)) {
      const t = canon(m[0].toLowerCase());
      for (const [option, toks] of marks) if (toks.includes(t)) found.push({ option, span: { start: m.index ?? 0, end: (m.index ?? 0) + m[0].length } });
    }
    const distinct = [...new Set(found.map((x) => x.option))];
    if (distinct.length !== 1) continue;
    for (const x of found) hits.push({ field: f, where, option: x.option, ...x.span });
  }
  return hits;
}

/** Whether one of a log sheet's own select options is said by a word of its own (ECHO, dry). */
function optionSaidFor(doc: DocumentDefinition, text: string): boolean {
  if (doc.kind !== "log-sheet") return false;
  const layout = getLogSheetLayoutForRecord(doc.id, null);
  return !!layout && optionHits(asciiDigits(text).normalize("NFC"), layout).length > 0;
}

/** The documents the words name, best first, with how sure (`byNumber`: named by its format number). */
function documentsNamed(text: string, lower: string, dayWord: boolean): { doc: DocumentDefinition | null; candidates: DocumentDefinition[]; explicit: boolean; byNumber: boolean } {
  // A format number names its document outright; "F-QC-30" written so is F-QC-30, not the minutes' F/QC/30.
  const byNumber = documentsByFormatNumber(lower);
  if (byNumber.length === 1) return { doc: byNumber[0], candidates: [], explicit: true, byNumber: true };
  if (byNumber.length > 1) {
    const spelled = byNumber.filter((d) => d.formatNo && lower.includes(d.formatNo.toLowerCase()));
    if (spelled.length === 1) return { doc: spelled[0], candidates: [], explicit: true, byNumber: true };
  }
  const words = wordsOf(text).filter((w) => !DOC_STOP.has(w) && !FILLER.has(w) || NOUNS.has(w));
  const said = [...new Set(words.map(canon))].filter((w) => w.length >= 3 || /[^\x00-\x7f]/.test(w));
  const pool = byNumber.length > 1 ? byNumber : documentRepository.getRecordable();
  const aliasIds = byNumber.length > 1 ? [] : matchDocuments(lower);
  const scored = pool
    .map((d) => {
      const vocab = vocabularyOf(d);
      let n = 0;
      for (const w of said) if (vocab.has(w)) n += GENERIC_DOC_WORDS.has(w) ? 0.5 : 1;
      if (aliasIds.length > 0 && aliasIds.length <= 3 && aliasIds.includes(d.id)) n += 1.5;
      if (d.kind === "log-sheet") {
        const layout = getLogSheetLayoutForRecord(d.id, null);
        if (layout && optionHits(text, layout).length) n += 2;
      }
      return { d, n };
    })
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  if (scored.length === 0) return { doc: null, candidates: byNumber, explicit: false, byNumber: false };
  const top = scored[0].n;
  let best = scored.filter((x) => Math.abs(x.n - top) < 1e-9);
  // A day said ("tomorrow's pest control record") leans to the register kept day by day.
  if (best.length > 1 && dayWord) {
    const daily = best.filter((x) => x.d.schedule.type === "daily");
    if (daily.length === 1) best = daily;
  }
  if (best.length === 1 && (top >= 2 || aliasIds.length === 1 || byNumber.length > 1)) {
    return { doc: best[0].d, candidates: [], explicit: aliasIds.includes(best[0].d.id) || byNumber.length > 1, byNumber: byNumber.length > 1 };
  }
  const candidates = scored.filter((x) => x.n >= Math.max(1, top - 1)).map((x) => x.d);
  return { doc: null, candidates: candidates.slice(0, MAX_CANDIDATES), explicit: false, byNumber: false };
}

// ---------------------------------------------------------------------------
// the values (Tier 0)

const NAME_STOP = new Set(
  [
    ...FILLER,
    "not", "absent", "present", "sir", "madam", "ji", "bhai", "is", "was", "did", "has", "were", "will", "also", "checked", "check", "time",
    "at", "on", "for", "nahi", "nathi", "नहीं", "નથી", "ok", "fine", "yes", "no", "હા", "ના", "हाँ",
  ].map((w) => w.normalize("NFC"))
);

/** The words that call a sign box by its job: "Driver sign" → driver; "Tested By" → test; F/HR/17's checker → checker, checked by. */
function signTriggers(label: string, key: string): string[] {
  if (/checker/i.test(key)) return ["checker", "check"];
  const words = wordsOf(label.split(" (")[0])
    .filter((w) => w.length >= 3 && !FILLER.has(w))
    .map(canon)
    .filter((w) => !["sign", "signature", "name", "random", "verification"].includes(w));
  return [...new Set(words)];
}

interface NameHit extends Span {
  name: string;
}

/** The name said right after a box's own word: "driver Rameshbhai", "ચેકર વિનય ભોજક", "tested by Jeni". */
function nameAfter(text: string, triggers: string[]): NameHit | null {
  const tokens = [...asciiDigits(text).normalize("NFC").matchAll(WORD_RE)].map((m) => ({ w: m[0], lw: m[0].toLowerCase(), start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
  for (let i = 0; i < tokens.length; i++) {
    if (!triggers.includes(canon(tokens[i].lw))) continue;
    let j = i + 1;
    // "checked by", "tested by", "driver name is", "ડ્રાઇવર નું નામ", ":" between.
    while (j < tokens.length && ["by", "is", "was", "name", "sign", "नाम", "નામ", "નું", "का", "की", "ના", "નો", "-"].includes(tokens[j].lw)) j++;
    const parts: typeof tokens = [];
    for (let k = j; k < tokens.length && parts.length < 4; k++) {
      const between = text.slice(k === j ? tokens[i].end : tokens[k - 1].end, tokens[k].start);
      if (k > j && /[,.;:!?।\n]|\band\b|और|અને/.test(between)) break;
      if (k === j && /[,.;!?।\n]/.test(text.slice(tokens[i].end, tokens[k].start).replace(/^[\s:=-]+/, ""))) break;
      const t = tokens[k];
      if (/\d/.test(t.w) || NAME_STOP.has(t.lw) || FILL_VERBS.has(t.lw) || NOUNS.has(t.lw)) break;
      parts.push(t);
    }
    if (parts.length === 0) continue;
    return { start: tokens[i].start, end: parts[parts.length - 1].end, name: text.slice(parts[0].start, parts[parts.length - 1].end).trim() };
  }
  return null;
}

// F/HR/17: "all fine" in the three languages, and "no rodent caught".
const ALL_FINE_RE =
  /\b(?:all (?:(?:ten|10|of them|points?|check ?points?) )?(?:are |is )?(?:ok|okay|fine|normal|good)|everything (?:is )?(?:ok|okay|fine|normal|good)|no problems?|nothing wrong)\b|सब(?:\s*कुछ)?\s*(?:ठीक|बराबर|सही|नॉर्मल)|सभी\s*ठीक|બધ(?:ું|ુ|ા)\s*(?:બરાબર|ઠીક|સારું|ઓકે|ok)|\b(?:sab(?:\s*kuch)?\s*(?:theek|thik|sahi|barabar|normal)|badh(?:u|a)\s*(?:barabar|thik|theek|saru))\b/iu;
const NO_RODENT_RE =
  /\bno (?:rodents?|rats?|mice|pests?) (?:caught|found|trapped|seen)\b|\bnothing (?:caught|trapped)\b|\bno rodents?\b|कोई\s*चूहा\s*नहीं|चूहा\s*नहीं|કોઈ\s*ઉંદર\s*(?:મળ્યો\s*)?નથી|ઉંદર\s*(?:મળ્યો\s*)?નથી|\bkoi (?:chuha|undar) (?:nahi|nathi)\b/iu;
const POINT_SUBJECTS: [number, RegExp][] = [
  [1, /\bdoors?\b|self.?closer|strip curtain|દરવાજ|दरवाज/iu],
  [2, /\bgaps?\b|shutter|cable entry|ગેપ|गैप|તિરાડ|दरार/iu],
  [3, /fly ?catcher|ફ્લાય|फ्लाई/iu],
  [4, /number of (?:rodent )?traps|traps? provided|traps? count/iu],
  [5, /traps? numbered/iu],
  [6, /recorded place|traps? placed/iu],
  [7, /pest trapped|trapped in/iu],
  [8, /dead rodent|dead rat|મરેલ|मरा/iu],
  [9, /cake|biting/iu],
  [10, /tube ?lights?|validity/iu],
];

function pestReading(text: string, spans: Span[]): { checks: Record<string, unknown>; fields: Obj; allFine: boolean; named: number[]; recognised: boolean } {
  const checks: Record<string, unknown> = {};
  const fields: Obj = {};
  const master = masterRepository.get();
  const allFine = ALL_FINE_RE.exec(text);
  if (allFine) {
    spans.push({ start: allFine.index, end: allFine.index + allFine[0].length });
    for (const cp of master.checkpoints) if (cp.responseType !== "number") checks[String(cp.no)] = "ok";
    // "…, yes for all of them" beside "all fine" says the same thing again.
    const yesAll = /\byes (?:for|to) (?:all|every)(?: of them| points?)?\b|\bhaan? sab(?:ke)? (?:liye )?\b/i.exec(text);
    if (yesAll) spans.push({ start: yesAll.index, end: yesAll.index + yesAll[0].length });
  }
  const noRodent = NO_RODENT_RE.exec(text);
  if (noRodent) {
    spans.push({ start: noRodent.index, end: noRodent.index + noRodent[0].length });
    checks["7"] = "ok";
  }
  // A count of traps, only when a count is said.
  const traps = /(\d{1,4})\s*(?:rodent\s*)?(?:traps?|ટ્રેપ|ट्रैप)|(?:traps?|ટ્રેપ|ट्रैप)\s*(?:provided|are|=|:)?\s*(\d{1,4})/iu.exec(text);
  if (traps) {
    checks["4"] = Number(traps[1] ?? traps[2]);
    spans.push({ start: traps.index, end: traps.index + traps[0].length });
  }
  // Points named by number: "point 2", "cp 3", "check point 5 no".
  const named = new Set<number>();
  for (const m of text.matchAll(/(?:check\s*-?\s*points?|points?|cp|no\.?|#|પોઈન્ટ|પોઇન્ટ|पॉइंट|नंबर|નંબર)\s*(\d{1,2})\b/giu)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 10) named.add(n);
  }
  for (const [n, re] of POINT_SUBJECTS) if (re.test(text)) named.add(n);
  const checker = nameAfter(text, ["checker", "check"]);
  if (checker) {
    fields.checker = checker.name;
    spans.push(checker);
  }
  const times = scanTimes(text).filter((t) => !inside(t, spans));
  if (times.length === 1) {
    fields.timeOfChecking = times[0].time;
    spans.push(times[0]);
  }
  return { checks, fields, allFine: !!allFine, named: [...named].sort((a, b) => a - b), recognised: Object.keys(checks).length > 0 || Object.keys(fields).length > 0 };
}

const writableCol = (c: LogColumn): boolean => !c.fixed && !c.computed && !c.linkedFrom;

// Words that may stand between a time and its reading ("10:00 viscosity 18 sec", "18 seconds at 10:00").
function joinerOk(between: string, layout: LogSheetLayout): boolean {
  const allowed = new Set(["at", "is", "was", "=", "sec", "secs", "second", "seconds", "s", "reading", "the", "of", "on", "पर", "को", "से", "सेकंड", "सेकेंड", "સેકન્ડ", "એ", "ના", "ને", "ni", "na", "par", "ko"]);
  for (const c of layout.columns) for (const w of wordsOf(c.label)) allowed.add(canon(w));
  for (const c of layout.columns) for (const w of wordsOf(c.unit ?? "")) allowed.add(w);
  return wordsOf(between).every((w) => allowed.has(w) || allowed.has(canon(w)));
}

/** Slot readings on a time-slot sheet: [[time, value], …] with the spans read. */
function slotReadings(text: string, layout: LogSheetLayout, skip: Span[]): { pairs: [string, number][]; spans: Span[] } {
  const mode = layout.rowMode;
  if (mode.kind !== "timeSlots") return { pairs: [], spans: [] };
  const times = scanTimes(text).filter((t) => !inside(t, skip));
  const nums = scanNumbers(text, [...skip, ...times]);
  type Item = { kind: "t"; hit: TimeHit } | { kind: "n"; hit: NumberHit };
  const items: Item[] = [...times.map((hit) => ({ kind: "t" as const, hit })), ...nums.map((hit) => ({ kind: "n" as const, hit }))].sort((a, b) => a.hit.start - b.hit.start);
  const pairs: [string, number][] = [];
  const spans: Span[] = [];
  if (items.length < 2) return { pairs, spans };
  const numFirst = items[0].kind === "n";
  for (let i = 0; i + 1 < items.length; i++) {
    const a = items[i];
    const b = items[i + 1];
    const t = numFirst ? (b.kind === "t" ? b : null) : a.kind === "t" ? a : null;
    const n = numFirst ? (a.kind === "n" ? a : null) : b.kind === "n" ? b : null;
    if (!t || !n) continue;
    const between = text.slice(a.hit.end, b.hit.start);
    if (!joinerOk(between, layout)) continue;
    pairs.push([t.hit.time, n.hit.value]);
    spans.push({ start: a.hit.start, end: b.hit.end });
    i++;
  }
  return { pairs, spans };
}

/** The clauses of a message: split at commas, semicolons, full stops (not decimal points) and "and". */
function clauses(text: string): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  const re = /[,;]|\.(?!\d)|\s+(?:and|then|और|અને)\s+|।/giu;
  let last = 0;
  for (const m of text.matchAll(re)) {
    out.push({ text: text.slice(last, m.index), start: last });
    last = (m.index ?? 0) + m[0].length;
  }
  out.push({ text: text.slice(last), start: last });
  return out.filter((c) => c.text.trim());
}

/** What the rules read of the words for this document. */
export function readValues(doc: DocumentDefinition, record: RecordInstance | null, text: string, dateSaid: boolean, dateISO: string, skip: Span[] = []): RulesReading {
  const t = asciiDigits(text).normalize("NFC");
  const spans: Span[] = [...skip, ...codeSpans(t)];
  const values: FillValues = {};
  let allFine = false;
  let named: number[] = [];
  const kind = doc.kind;
  // What "label is value" is read against: the record, or the form as a new one would start.
  const data = record?.data ?? createDefaultData(doc, dateISO, masterRepository.get());

  if (kind === "daily-pest-monitoring") {
    const p = pestReading(t, spans);
    if (Object.keys(p.checks).length) values.checks = p.checks;
    if (Object.keys(p.fields).length) values.fields = p.fields;
    allFine = p.allFine;
    named = p.named;
  }

  const layout = kind === "log-sheet" ? getLogSheetLayoutForRecord(doc.id, record) : undefined;
  if (layout) {
    // Slot readings, and "tested by X" on the slots given only.
    const slots = slotReadings(t, layout, spans);
    const numCols = layout.columns.filter((c) => writableCol(c) && c.type === "number");
    if (slots.pairs.length && numCols.length === 1) {
      values.slots = {};
      for (const [time, v] of slots.pairs) values.slots[time] = { [numCols[0].key]: v };
      spans.push(...slots.spans);
    }
    // Select options said by their own word: the vehicle, the cleaning type.
    const freeLine: Obj = {};
    for (const hit of optionHits(t, layout)) {
      if (hit.where === "header") values.header = { ...(values.header ?? {}), [hit.field.key]: hit.option };
      else freeLine[hit.field.key] = hit.option;
      spans.push(hit);
    }
    // Names after a sign box's own word.
    const signs = [...[...layout.headerFields, ...(layout.footerFields ?? [])].filter((f) => !f.computed && isSignField(f)).map((f) => ({ f, where: "header" as const })), ...layout.columns.filter((c) => writableCol(c) && isSignField(c)).map((f) => ({ f, where: "column" as const }))];
    for (const { f, where } of signs) {
      const hit = nameAfter(t, signTriggers(f.label, f.key));
      if (!hit) continue;
      spans.push(hit);
      if (where === "header") values.header = { ...(values.header ?? {}), [f.key]: hit.name };
      else if (layout.rowMode.kind === "timeSlots" && values.slots) for (const time of Object.keys(values.slots)) values.slots[time][f.key] = hit.name;
      else if (layout.rowMode.kind === "free" || layout.rowMode.kind === "single") freeLine[f.key] = hit.name;
    }
    if (Object.keys(freeLine).length) {
      // The line's own date, when the person said the day (engine/autoFill.ts dueDate columns).
      const ownDate = layout.columns.find((c) => writableCol(c) && c.type === "date" && (c.autoFill?.dueDate || c.required));
      if (ownDate && dateSaid) freeLine[ownDate.key] = dateISO;
      values.rows = [freeLine];
    }
  }

  // "label is value", clause by clause (engine/recordPatch.ts parseLocalEdit).
  if (isObj(data)) {
    const base = data;
    for (const c of clauses(t)) {
      const span = { start: c.start, end: c.start + c.text.length };
      if (inside(span, spans.filter((s) => s.end - s.start < c.text.length))) {
        // Already read in part above; parseLocalEdit would read the same words again.
        if (!/\b(?:is|to|=|:)\b|[=:]/.test(c.text)) continue;
      }
      const local = parseLocalEdit(kind, doc.id, base, c.text, record);
      if (!local) continue;
      let used = false;
      for (const [k, v] of Object.entries(local)) {
        if (k === "header" && isObj(v)) {
          values.header = { ...(values.header ?? {}), ...v };
          used = true;
        } else if (k === "checkpoints" && isObj(v)) {
          values.checks = { ...(values.checks ?? {}), ...v };
          for (const n of Object.keys(v)) if (!named.includes(Number(n))) named.push(Number(n));
          used = true;
        } else if (k === "itemEdits" && Array.isArray(v)) {
          values.itemEdits = [...(values.itemEdits ?? []), ...(v as ItemEdit[])];
          used = true;
        } else if (!isObj(v) && !Array.isArray(v)) {
          values.fields = { ...(values.fields ?? {}), [k]: v };
          used = true;
        }
      }
      if (used) spans.push(span);
    }
  }

  const recognised = !!(values.header || values.slots || values.rows || values.checks || values.fields || values.itemEdits);
  return { values, allFine, namedPoints: named, recognised, residual: hasResidual(t, spans, doc) };
}

/** Whether words that carry a value were left unread: a number, or a word that is neither filler nor the form's own. */
function hasResidual(text: string, spans: readonly Span[], doc: DocumentDefinition): boolean {
  const vocab = vocabularyOf(doc);
  for (const m of text.matchAll(WORD_RE)) {
    const span = { start: m.index ?? 0, end: (m.index ?? 0) + m[0].length };
    if (inside(span, spans)) continue;
    const w = m[0].toLowerCase().normalize("NFC");
    if (/^\d/.test(w)) return true;
    if (FILLER.has(w) || FILL_VERBS.has(w) || TODAY.has(w) || YESTERDAY.has(w) || TOMORROW.has(w) || KAL.has(w)) continue;
    if (NOUNS.has(w) || vocab.has(canon(w)) || vocab.has(w)) continue;
    if (/^[a-z]$/.test(w)) continue;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// the reading

/** The language a fill is answered in: the script of the words, else their everyday words in Latin letters. */
export function fillLanguageOf(text: string, fallback: FillLanguage = "en"): FillLanguage {
  return askedLanguage(text) ?? fallback;
}

/** A document that keeps one record per thing, and which box says the thing (F/DISP/04: the vehicle). */
export function identityField(doc: DocumentDefinition): LogHeaderField | null {
  if (doc.schedule.type !== "as-required" || doc.kind !== "log-sheet") return null;
  const layout = getLogSheetLayoutForRecord(doc.id, null);
  if (!layout) return null;
  return layout.headerFields.find((f) => f.type === "select" && f.required && f.autoFill?.carryForward) ?? null;
}

const recordById = (id: string | null | undefined): RecordInstance | undefined => (id ? recordRepository.getById(id) : undefined);

export function readFillRequest(text: string, ctx: FillRequestContext): FillRequest {
  const words = String(text ?? "").trim();
  if (!words) return { kind: "not-a-fill" };
  const today = ctx.today ?? todayISO();
  const ascii = asciiDigits(words).normalize("NFC");
  const lower = ascii.toLowerCase();
  const tokens = wordsOf(words);
  const language = fillLanguageOf(words);

  const polite = POLITE_START.test(lower);
  const question = !polite && (/[?？]\s*$/.test(words) || QUESTION_FIRST.has(tokens[0] ?? ""));
  if (question && !ctx.forceFill) return { kind: "not-a-fill" };
  if (FORMAT_RE.test(lower) && !ctx.forceFill) return { kind: "not-a-fill" };

  const fillVerb = tokens.some((w) => FILL_VERBS.has(w)) || /^record\b/i.test(lower);
  const sample = SAMPLE_RE.test(words) || !!ctx.forceSample;
  const guide = GUIDE_RE.test(words);
  const copy = COPY_RE.test(words);

  const day = readDay(ascii, today);
  const dateISO = ctx.dateISO ? (normDate(ctx.dateISO, today) ?? day.iso) : day.iso;
  const dateSaid = !!ctx.dateISO || day.said;

  // The document: named outright, else named in the words, else the record on screen, else the last one filled.
  const openRecord = recordById(ctx.openRecordId);
  const named = recordById(ctx.recordId);
  const last = recordById(ctx.lastRecordId);
  let doc: DocumentDefinition | null = null;
  let candidates: DocumentDefinition[] = [];
  // Named for certain: given by the caller, or by its format number (not by a word or two it shares with the words).
  let certain = false;
  let recordRef: "open" | "named" | "last" | null = null;
  let recordId: string | null = null;
  if (named) {
    doc = documentRepository.getById(named.documentId) ?? null;
    recordRef = "named";
    recordId = named.id;
    certain = true;
  } else if (ctx.documentId) {
    doc = documentRepository.getById(ctx.documentId) ?? documentsNamed(ctx.documentId, ctx.documentId.toLowerCase(), false).doc;
    certain = !!doc;
  }
  if (!doc) {
    const found = documentsNamed(words, lower, dateSaid);
    doc = found.doc;
    candidates = found.candidates;
    certain = found.byNumber;
  }
  const openDoc = openRecord ? documentRepository.getById(openRecord.documentId) ?? null : null;
  const screenDoc = !openDoc && ctx.screenDocumentId ? documentRepository.getById(ctx.screenDocumentId) ?? null : null;
  if (openDoc && !named && !ctx.documentId) {
    // The record on screen wins unless the words name another document for
    // certain: by its format number, or by an option only that form has
    // ("vehicle ECHO cleaned" on an open F-QC-30 is F/DISP/04). Words two forms
    // share never move a value off the record on screen: "viscosity 19.9 at
    // 04:30" on an open F-QC-32 is that sheet's viscosity, not F-QC-30's.
    const elsewhere = !!doc && doc.id !== openDoc.id && (certain || optionSaidFor(doc, words));
    if (!elsewhere) {
      doc = openDoc;
      candidates = [];
      if (!dateSaid || openRecord!.dueDate === dateISO) {
        recordRef = "open";
        recordId = openRecord!.id;
      }
    }
  }
  if (!doc && candidates.length === 0 && screenDoc) doc = screenDoc;
  if (!doc && candidates.length === 0 && last) {
    doc = documentRepository.getById(last.documentId) ?? null;
    if (doc && (!dateSaid || last.dueDate === dateISO)) {
      recordRef = "last";
      recordId = last.id;
    }
  }

  // The rules read against the record the values would go on: the one named or open, else the day's own.
  const contextRecord = recordId ? (recordById(recordId) ?? null) : doc && !identityField(doc) ? dayRecordOf(doc, dateISO, ctx.isDemo) : null;
  const rules = doc ? readValues(doc, contextRecord, words, dateSaid, dateISO, day.spans) : null;

  // WHETHER it is a fill (see the header). Without a fill verb, the document must be
  // named for certain, be the one on screen (or the last filled), or have one of
  // its own options said: a word or two shared with a form's name is not enough
  // ("row 1 tested value 4 is 200.06 gm", said with nothing open, is no fill).
  const optionSaid = !!doc && optionSaidFor(doc, words);
  const docEvidence = !!doc && (certain || recordRef !== null || !!screenDoc || optionSaid);
  const isFill = ctx.forceFill || fillVerb || sample || (guide && (!!doc || candidates.length > 0)) || copy || (!!rules?.recognised && docEvidence);
  if (!isFill) return { kind: "not-a-fill" };
  // "Open today's F-QC-30" names a record to open, not values to write.
  if (!fillVerb && !sample && !guide && !copy && OPEN_ONLY_RE.test(lower) && !rules?.recognised && !ctx.forceFill) return { kind: "not-a-fill" };

  // The thing a record is kept for (the vehicle), said.
  let identity: { key: string; label: string; value: string } | null = null;
  const idField = doc ? identityField(doc) : null;
  if (idField) {
    const said = rules?.values.header?.[idField.key];
    if (typeof said === "string" && said) identity = { key: idField.key, label: idField.label, value: said };
  }

  // What is asked: sample data, a copy, values, to be asked box by box, or just "fill it".
  let mode: FillMode;
  if (sample) mode = "sample";
  else if (copy) mode = "copy";
  else if (rules?.recognised) mode = "values";
  else if (guide) mode = "guide";
  else if ((rules ? rules.residual : true) && hasValueWords(words, doc)) mode = "values";
  else mode = "bare";

  return {
    kind: "fill",
    doc,
    candidates: doc ? [] : candidates,
    dateISO,
    dateSaid,
    ...(day.question && !ctx.dateISO ? { dayQuestion: day.question } : {}),
    recordRef,
    recordId,
    identity,
    mode,
    rules,
    submitAsked: SUBMIT_RE.test(words),
    language: ctx.language && askedLanguage(words) === null ? ctx.language : language,
    words,
  };
}

/** The record of a scheduled document for a day (its period), as createRecordForDocument finds it; the newest when there are several. */
export function dayRecordOf(doc: DocumentDefinition, dateISO: string, isDemo: boolean): RecordInstance | null {
  const records = recordRepository
    .query({ documentId: doc.id, isDemo })
    .filter((r) => r.dueDate === dateISO || (doc.schedule.type !== "as-required" && r.periodKey === periodKeyFor(doc, dateISO)))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return records[0] ?? null;
}

/** Whether the words hold anything that could be a value at all: a digit, or a word that is not filler, a verb or the form's own. */
function hasValueWords(text: string, doc: DocumentDefinition | null): boolean {
  const t = asciiDigits(text).normalize("NFC");
  const skip = codeSpans(t);
  for (const m of t.matchAll(WORD_RE)) {
    const span = { start: m.index ?? 0, end: (m.index ?? 0) + m[0].length };
    if (inside(span, skip)) continue;
    const w = m[0].toLowerCase();
    if (/^\d/.test(w)) return true;
    if (FILLER.has(w) || FILL_VERBS.has(w) || TODAY.has(w) || YESTERDAY.has(w) || TOMORROW.has(w) || NOUNS.has(w) || DOC_STOP.has(w)) continue;
    if (doc && vocabularyOf(doc).has(canon(w))) continue;
    if (/^(?:it|me|us|please|now|in|up|out|for|yourself|automatically)$/.test(w)) continue;
    return true;
  }
  return false;
}

/** Every time said in the words (for grounding a time value): "2 pm" is 14:00. */
export function timesSaid(text: string): string[] {
  return scanTimes(asciiDigits(text).normalize("NFC")).map((t) => t.time);
}

/** Every number said in the words, any script. */
export function numbersSaid(text: string): number[] {
  return [...asciiDigits(text).matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}

/** Every date said (ISO), and the day words' dates. */
export function datesSaid(text: string, today = todayISO()): string[] {
  const d = readDay(asciiDigits(text).normalize("NFC"), today);
  return d.said ? [d.iso] : [];
}
