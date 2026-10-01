// TEXT MADE FOR THE EAR (REQUIREMENTS §85, part D — "it should sound like a human only").
//
// A voice reads what it is handed, mark by mark: "F/HR/17" comes out as "F slash
// H R slash seventeen", "30-Sep-2026" as "thirty dash sep dash two thousand …",
// "**Due**" as "star star due", "✅" as "white heavy check mark". A person reading
// the same line aloud says "form F H R 17", "30th September", "due", and nothing
// for the tick. forTheEar rewrites a line the way a person says it, before any
// voice gets it — the browser's (utils/speech.ts speakWithBrowser) or Groq's on
// the server (utils/voice.ts):
//
//   - markdown in a reply (**bold**, `code`, # headings, - bullets, [links](…),
//     table bars, > quotes) is dropped; a line that ends without a stop gets one,
//     so the voice pauses where the eye would; a web address is "a link";
//   - pictures (emoji, ticks and crosses) are not read;
//   - a format number reads as "form F H R 17" ("form F Q C 15 B" for F/QC/15-B),
//     a machine number "M-16" as "M 16";
//   - dates as a person says them — "30th September" (the year only when it is not
//     this one), from 30-Sep-2026, 2026-09-30 or 30/09/2026;
//   - times on the twelve-hour clock — "2:30 PM", "9 AM";
//   - 92% is "92 percent", ₹1,200 or Rs. 1200 "1,200 rupees", 25°C "25 degrees
//     Celsius", ± "plus or minus", & "and", 10-20 "10 to 20", 12 x 18 "12 by 18",
//     Yes/No "Yes or No", N/A "not applicable", e.g. / i.e. / etc. / vs / No. 5 /
//     Sr. No. / Qty and units after a number (kg, mm, hrs, mins) in words;
//   - a spaced dash or brackets become the pauses they stand for (commas).
//
// A Gujarati line gets only what is not English: markdown, pictures, format and
// machine numbers spelled out (without the English word "form"), symbols, and
// the percent sign. Pure: `now` decides "this year"; any slip returns the text
// as it was given, never an error.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** A month as the plant writes it — "Sep", "Sept", "September", "SEP" — to its index; anything else is not a month. */
function monthOf(word: string): number | null {
  const w = word.toLowerCase();
  for (let i = 0; i < MONTHS.length; i++) {
    const full = MONTHS[i].toLowerCase();
    if (w === full || w === full.slice(0, 3) || (i === 8 && w === "sept")) return i;
  }
  return null;
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const unit = n % 10;
  return `${n}${unit === 1 ? "st" : unit === 2 ? "nd" : unit === 3 ? "rd" : "th"}`;
}

/** "30th September", or "30th September 2025" when the year is not this one. Null for a day that is not a date. */
function spokenDate(day: number, month: number, year: number | null, thisYear: number): string | null {
  if (!(month >= 0 && month <= 11) || !(day >= 1 && day <= 31)) return null;
  const full = year !== null && year < 100 ? 2000 + year : year;
  return `${ordinal(day)} ${MONTHS[month]}${full !== null && full !== thisYear ? ` ${full}` : ""}`;
}

/** "2:30 PM", "9 AM", "12 PM". */
function spokenTime(h: number, m: number): string {
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

const spell = (letters: string): string => letters.toUpperCase().split("").join(" ");

/** Markdown and line breaks: what a reader sees, said as sentences. */
function unmark(text: string, en: boolean): string {
  let s = text.replace(/\r\n?/g, "\n");
  s = s.replace(/^\s*```[^\n]*$/gm, "");
  s = s.replace(/!?\[([^\]\n]*)\]\((?:[^()\s]|\([^()\s]*\))*\)/g, "$1");
  s = s.replace(/\b(?:https?:\/\/|www\.)[^\s<>()]+/gi, en ? "a link" : "");
  const lines = s.split("\n").map((line) => {
    let l = line.trim();
    if (!l) return "";
    if (/^\|?[\s:|-]+\|?$/.test(l) && l.includes("-") && (l.includes("|") || /^-{3,}$/.test(l))) return ""; // a table's rule, or a horizontal rule
    l = l.replace(/^#{1,6}\s*/, "");
    l = l.replace(/^>(?!=?\s*[-−]?\d)\s?/, ""); // a quote mark - never the ">" of ">25%"
    l = l.replace(/^(?:[-*+•·]|\d{1,3}[.)])\s+/, "");
    if (l.includes("|")) l = l.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()).filter(Boolean).join(", ");
    return l;
  });
  // Each line is said as a sentence of its own: one with no stop at its end gets one.
  s = lines
    .filter(Boolean)
    .map((l) => (/[.!?:;,…।]["'”’)]*$/.test(l) ? l : `${l}.`))
    .join(" ");
  s = s.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "$2");
  s = s.replace(/(^|[\s(])[*_](?=\S)([^*_\n]*?\S)[*_](?=[\s).,!?:;]|$)/g, "$1$2");
  s = s.replace(/`([^`]*)`/g, "$1");
  s = s.replace(/~~([^~]+)~~/g, "$1");
  return s;
}

/**
 * Pictures are not read: emoji, flags, ticks and crosses become the short pause
 * a reader makes over them (a comma, tidied away at a sentence's end); their
 * joiners and variation marks go.
 */
function unpicture(s: string): string {
  return s
    .replace(/\p{Emoji_Modifier}|\p{Variation_Selector}|\p{Join_Control}/gu, "")
    .replace(/(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[✓✔✗✘☐☑☒★☆])+/gu, ", ");
}

/** Format numbers, spelled as a person reads them. */
function formatNumbers(s: string, en: boolean): string {
  // F/HR/17, F/QC/15-B, F/QC-09, F-QC-40.C, F/SYS/04-A — "form F H R 17".
  s = s.replace(
    /(\b(?:form|format)\s+)?\bF\s?[/-]\s?([A-Za-z]{2,4})\s?[/-]\s?(\d{1,3})(?:[-.]([A-Za-z])(?![A-Za-z]))?(?![\d/])/gi,
    (_whole, said: string | undefined, dept: string, num: string, letter: string | undefined) => {
      const lead = said ? said : en ? "form " : "";
      return `${lead}F ${spell(dept)} ${num.length > 1 && num.startsWith("0") ? `0 ${num.slice(1)}` : num}${letter ? ` ${letter.toUpperCase()}` : ""}`;
    }
  );
  return s;
}

/** Machine numbers — M-16, PRD-01: the letters one by one, the number after them. */
function machineNumbers(s: string): string {
  return s.replace(/\b([A-Z]{1,3})-(\d{1,4})\b/g, (_w, letters: string, num: string) => `${spell(letters)} ${num}`);
}

function datesAndTimes(s: string, thisYear: number): string {
  // 2026-09-30
  s = s.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (whole, y: string, m: string, d: string) => spokenDate(Number(d), Number(m) - 1, Number(y), thisYear) ?? whole);
  // 30-Sep-2026, 30 Sep 2026, 30 September, 30-Sep-26. The month starts with a
  // capital ("3 may be late" is not a date); a two-figure year only after a dash,
  // slash or point ("30 Sep, 12 records" keeps its 12).
  s = s.replace(/\b(\d{1,2})(?:st|nd|rd|th)?[-\s/.]([A-Z][A-Za-z]{2,8})\.?(?:(?:[-/.]|,?\s)(\d{4})(?!\d)|[-/.](\d{2})(?!\d))?(?![A-Za-z])/g, (whole, d: string, mon: string, y4: string | undefined, y2: string | undefined) => {
    const month = monthOf(mon);
    if (month === null) return whole;
    const y = y4 ?? y2;
    return spokenDate(Number(d), month, y ? Number(y) : null, thisYear) ?? whole;
  });
  // 30/09/2026, 30.09.2026, 30-09-2026 (day first, as the plant writes them)
  s = s.replace(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g, (whole, d: string, m: string, y: string) => spokenDate(Number(d), Number(m) - 1, Number(y), thisYear) ?? whole);
  // 14:30, 09:00, 9:00 am, 17:45:00
  s = s.replace(/\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?(?:\s?([AaPp])\.?\s?[Mm]\.?(?![A-Za-z]))?/g, (_w, h: string, m: string, ap: string | undefined) => {
    let hour = Number(h);
    if (ap) {
      const pm = ap.toLowerCase() === "p";
      if (hour === 12) hour = pm ? 12 : 0;
      else if (pm) hour += 12;
    }
    return spokenTime(hour, Number(m));
  });
  return s;
}

const WORDS_FOR: [RegExp, string][] = [
  [/\bSr\.?\s?No\.?/gi, "serial number"],
  [/\band\/or\b/gi, "and or"],
  [/\bN\/A\b/g, "not applicable"],
  [/\be\.g\.(?=\s|,|$)/gi, "for example"],
  [/\bi\.e\.(?=\s|,|$)/gi, "that is"],
  [/\betc\.(?=\s|,|$)/gi, "etcetera"],
  [/\betc\b/gi, "etcetera"],
  [/\bvs\.?(?=\s)/gi, "versus"],
  [/\bapprox\.?(?=\s)/gi, "about"],
  [/\bQty\b\.?/gi, "quantity"],
  [/\bDept\b\.?/gi, "department"],
  [/\bNo\.\s?(?=\d)/g, "number "],
  [/#\s?(?=\d)/g, "number "],
];

const UNITS: Record<string, string> = {
  kg: "kilograms",
  kgs: "kilograms",
  mm: "millimetres",
  cm: "centimetres",
  ml: "millilitres",
  hr: "hours",
  hrs: "hours",
  min: "minutes",
  mins: "minutes",
  sec: "seconds",
  secs: "seconds",
};

function amountsAndSymbols(s: string, en: boolean): string {
  s = s.replace(/(\d)\s?%/g, en ? "$1 percent" : "$1 ટકા");
  if (!en) return s;
  s = s.replace(/(?:₹|\bRs\.?|\bINR)\s?(\d[\d,]*(?:\.\d+)?)/g, "$1 rupees");
  s = s.replace(/(\d)\s?°\s?C\b/g, "$1 degrees Celsius");
  s = s.replace(/(\d)\s?°\s?F\b/g, "$1 degrees Fahrenheit");
  s = s.replace(/(\d)\s?°/g, "$1 degrees");
  // A rate is "per", never two choices: 1.3 gm/ccm, 120 gm/sq.m., kg/cm², 20 ml / 1 lit - before the units are said in words.
  s = s.replace(/(\d\s?[A-Za-z]{1,12}|\b(?:kgs?|gms?|mg|g|km|mm|cm|m|ml|ltr|lit|l|ccm|cc|hrs?|h|mins?|secs?|s))\/((?:sq\.?\s?m\.?|cm²|m²|ccm|cc|cm|mm|m|ml|ltr|lit|l|kgs?|gms?|g|hrs?|h|mins?|secs?|s|day|week|month|year))(?![\w/])/gi, "$1 per $2");
  s = s.replace(/(\d\s?[A-Za-z]{1,12})\s\/\s(?=\d)/g, "$1 per ");
  s = s.replace(/(\d)\s?(kgs?|mm|cm|ml|hrs?|mins?|secs?)\b/gi, (_w, n: string, unit: string) => `${n} ${UNITS[unit.toLowerCase()] ?? unit}`);
  for (const [re, words] of WORDS_FOR) s = s.replace(re, words);
  s = s.replace(/(\d)\s?[x×]\s?(\d)/g, "$1 by $2");
  s = s.replace(/\b(\d{1,4}(?:\.\d+)?)\s?[–-]\s?(\d{1,4}(?:\.\d+)?)\b/g, "$1 to $2");
  // Comparisons, next to a number only ("<25% = C" is "less than 25 percent is C"); "->" and "=>" are left for the arrows.
  s = s.replace(/<=\s?(?=[-−]?\d)/g, " at most ");
  s = s.replace(/(?<![-=])>=\s?(?=[-−]?\d)/g, " at least ");
  s = s.replace(/<\s?(?=[-−]?\d)/g, " less than ");
  s = s.replace(/(?<![-=])>\s?(?=[-−]?\d)/g, " more than ");
  s = s.replace(/(?<=[\w%)])\s?=\s?(?=[\w(−-])/g, " is ");
  s = s.replace(/(^|[\s(])[−-](\d)/g, "$1minus $2");
  s = s.replace(/−/g, " minus ");
  s = s.replace(/±/g, " plus or minus ");
  s = s.replace(/≥/g, " at least ");
  s = s.replace(/≤/g, " at most ");
  s = s.replace(/\s&\s|&/g, " and ");
  s = s.replace(/(\S)@(\S)/g, "$1 at $2");
  // "Yes/No" is "Yes or No" - but a code such as QC/WP/38 or FLX/SOP/19 stays one code.
  s = s.replace(/(?<![\w/])([A-Za-z]{2,})\/([A-Za-z]{2,})(?![\w/])/g, "$1 or $2");
  // A score is "out of" (45 / 50); a frequency is "a" (Once / Year).
  s = s.replace(/(\d)\s\/\s(?=\d)/g, "$1 out of ");
  s = s.replace(/\s\/\s(?=(?:day|week|month|year|shift|batch)\b)/gi, " a ");
  s = s.replace(/\s\/\s/g, " or ");
  return s;
}

/** Dashes and brackets as the pauses they stand for; leftover marks dropped; spaces and stops tidied. */
function pausesAndTidy(s: string): string {
  s = s.replace(/\s[—–-]{1,2}\s|—|–/g, ", ");
  s = s.replace(/[()[\]{}]/g, ", ");
  s = s.replace(/→|⇒|->/g, " to ");
  s = s.replace(/[*_~^`|\\<>=•·»«]/g, " ");
  s = s.replace(/\s+/g, " ");
  s = s.replace(/\s+([,.;:!?…])/g, "$1");
  s = s.replace(/,(?:\s*,)+/g, ",");
  s = s.replace(/,\s*([.;:!?…])/g, "$1");
  s = s.replace(/([.;:!?…])\s*,/g, "$1");
  s = s.replace(/^[,\s]+/, "");
  s = s.replace(/[,\s]+$/, "");
  s = s.replace(/\.{3,}/g, "…");
  s = s.replace(/\.{2}/g, ".");
  return s.trim();
}

/**
 * The line as a person would say it (see the header). `lang` is the line's
 * language: "gu" gets only the parts that are not English. `now` decides this
 * year (a date of this year is said without it).
 */
export function forTheEar(text: string, lang = "en", now: Date = new Date()): string {
  const original = String(text ?? "");
  if (!original.trim()) return "";
  try {
    const en = !String(lang).toLowerCase().startsWith("gu");
    let s = unmark(original, en);
    s = unpicture(s);
    s = formatNumbers(s, en);
    if (en) s = datesAndTimes(s, now.getFullYear());
    s = machineNumbers(s);
    s = amountsAndSymbols(s, en);
    s = pausesAndTidy(s);
    return s || original.replace(/\s+/g, " ").trim();
  } catch {
    return original.replace(/\s+/g, " ").trim();
  }
}

/**
 * The sentences of a line, in order: cut after a full stop, a question or an
 * exclamation mark, the Devanagari danda or an ellipsis, when a space follows
 * (so 92.5 and 2:30 stay whole).
 */
export function sentencesOf(text: string): string[] {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  return clean.split(/(?<=[.!?।…])\s+/).filter(Boolean);
}
