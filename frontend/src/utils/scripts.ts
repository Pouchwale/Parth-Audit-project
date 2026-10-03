// THE LANGUAGE A PIECE OF TEXT IS IN, FROM ITS SCRIPT (REQUIREMENTS §89).
//
// "If the user asks in Gujarati or Hindi then the bot should reply in that
// language: Gujarati asked, Gujarati answered; the same for Hindi and English."
// The plant writes three languages: English in Latin letters, Hindi in
// Devanagari, Gujarati in Gujarati script, and Hindi and Gujarati in Latin
// letters too ("aaj ka record kholo", "aaje nu record kholo"). Two questions are
// answered here, without a browser:
//
//   askedLanguage   which language a QUESTION was asked in, so Mitra's own
//                   answers (engine/assistantLocal.ts) can follow it: the Indic
//                   script when the question has one, else Hindi or Gujarati in
//                   Latin letters by their everyday words, else English; null
//                   when it has no words of its own (a bare yes or no, a format
//                   number), so the conversation's language carries on.
//   voiceSegments   which VOICE says each part of a REPLY (utils/speech.ts,
//                   utils/voice.ts), sentence by sentence: Gujarati script to the
//                   Gujarati voice, Devanagari to the Hindi voice, the rest to the
//                   Indian English voice; neighbouring sentences of one language
//                   said as one piece. An Indian voice reads the English words in a
//                   Gujarati or Hindi sentence well, so a document's English name
//                   keeps its sentence in that language; an English voice cannot
//                   read Indic script at all, so a sentence counts as English only
//                   when its Indic words are few (a name), and those few are left
//                   out of what the English voice is given (utils/earText.ts).
//
// Words, not letters, are counted: Gujarati and Devanagari write their vowels as
// marks, so a Gujarati word has fewer letters than the English word beside it.

export type ScriptLanguage = "en" | "hi" | "gu";

/** The tag each language's voice is asked for with (the Web Speech API's BCP-47 tags). */
export const SPEECH_TAGS: Record<ScriptLanguage, string> = { en: "en-IN", hi: "hi-IN", gu: "gu-IN" };

/** The language of a speech tag or a language code: "gu-IN" and "gu" are Gujarati, "hi-IN" Hindi, anything else English. */
export function scriptLanguageOfTag(tag: string): ScriptLanguage {
  const l = String(tag ?? "").trim().toLowerCase();
  return l.startsWith("gu") ? "gu" : l.startsWith("hi") ? "hi" : "en";
}

const GUJARATI_LETTER = /\p{Script=Gujarati}/u;
const DEVANAGARI_LETTER = /\p{Script=Devanagari}/u;
const LATIN_LETTER = /\p{Script=Latin}/u;
const WORDS = /[\p{L}\p{M}]+/gu;

export interface WordCounts {
  /** Words in Latin letters. */
  en: number;
  /** Words in Devanagari. */
  hi: number;
  /** Words in Gujarati script. */
  gu: number;
  /** Words in any other script. */
  other: number;
}

function scriptOfWord(word: string): keyof WordCounts {
  const first = /\p{L}/u.exec(word)?.[0] ?? "";
  if (GUJARATI_LETTER.test(first)) return "gu";
  if (DEVANAGARI_LETTER.test(first)) return "hi";
  if (LATIN_LETTER.test(first)) return "en";
  return "other";
}

/** The words of `text`, counted by script. */
export function wordCounts(text: string): WordCounts {
  const counts: WordCounts = { en: 0, hi: 0, gu: 0, other: 0 };
  for (const word of String(text ?? "").match(WORDS) ?? []) counts[scriptOfWord(word)] += 1;
  return counts;
}

/** Whether `text` has any Devanagari in it. */
export const hasDevanagari = (text: string): boolean => /\p{Script=Devanagari}/u.test(String(text ?? ""));

// The everyday little words of a Gujarati or Hindi sentence: one of them marks the
// sentence as that language even when most of its words are English names
// ("Line Clearance Checklist ભરો.").
const GUJARATI_GRAMMAR = new Set(["છે", "છો", "છું", "અને", "માં", "નું", "ની", "નો", "ના", "ને", "થી", "પર", "કરો", "ભરો", "હતું", "હતી", "હશે", "નથી", "શું", "કયું", "કયો", "કેટલા", "ક્યારે", "આજે", "બાકી"]);
const HINDI_GRAMMAR = new Set(["है", "हैं", "और", "में", "का", "की", "के", "को", "से", "पर", "करें", "भरें", "था", "थी", "नहीं", "क्या", "कौन", "कितने", "कब", "आज", "बाकी", "यह", "वह"]);

/**
 * The voice a sentence wants: Gujarati or Hindi when a third or more of its words
 * are in that script, or one of its grammar words is; else English. Null when it
 * has no words at all ("92%", "---").
 */
export function sentenceLanguage(sentence: string): ScriptLanguage | null {
  const c = wordCounts(sentence);
  const indic = c.gu + c.hi;
  const all = indic + c.en + c.other;
  if (all === 0) return null;
  if (indic === 0) return "en";
  const words = String(sentence).match(WORDS) ?? [];
  const grammar = words.some((w) => GUJARATI_GRAMMAR.has(w) || HINDI_GRAMMAR.has(w));
  if (grammar || indic / all >= 0.3) return c.gu >= c.hi ? "gu" : "hi";
  return "en";
}

export interface VoiceSegment {
  lang: ScriptLanguage;
  /** The words, line breaks kept (a markdown list is read item by item: utils/earText.ts). */
  text: string;
}

/** A line cut after each sentence: a stop, a question or exclamation mark or an ellipsis followed by a space; the danda (। ॥) always. */
function sentencePieces(line: string): string[] {
  return line.split(/(?<=[.!?…])\s+|(?<=[।॥])\s*/).filter((p) => p.trim());
}

/**
 * The text as the parts different voices say, in order (see the header). A
 * sentence with no words takes the language of the one before it (else the one
 * after; else `fallback`). Never empty for text with something in it.
 */
export function voiceSegments(text: string, fallback: ScriptLanguage = "en"): VoiceSegment[] {
  const pieces: { text: string; startsLine: boolean; lang: ScriptLanguage | null }[] = [];
  for (const line of String(text ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    sentencePieces(line).forEach((piece, i) => pieces.push({ text: piece.trim(), startsLine: i === 0, lang: sentenceLanguage(piece) }));
  }
  if (!pieces.length) return [];
  for (let i = 1; i < pieces.length; i++) if (pieces[i].lang === null) pieces[i].lang = pieces[i - 1].lang;
  for (let i = pieces.length - 2; i >= 0; i--) if (pieces[i].lang === null) pieces[i].lang = pieces[i + 1].lang;
  const out: VoiceSegment[] = [];
  for (const p of pieces) {
    const lang = p.lang ?? fallback;
    const last = out[out.length - 1];
    if (last && last.lang === lang) last.text += `${p.startsLine ? "\n" : " "}${p.text}`;
    else out.push({ lang, text: p.text });
  }
  return out;
}

// HINDI AND GUJARATI IN LATIN LETTERS. Words that belong to one language and are
// not English words ("main", "din", "mate", "have" are English too, so they are
// not here); a question needs two of them to count, and more of its own
// language's than of the other's. Words both languages share ("kholo", "karo",
// "baki") decide nothing.
const HINDI_LATIN = new Set([
  "hai", "hain", "kya", "kaise", "kaisa", "kaisi", "kitna", "kitne", "kitni", "mujhe", "mera", "meri", "mere", "aaj", "kal",
  "ka", "ki", "mein", "nahi", "nahin", "kab", "kahan", "kaun", "kyun", "kyon", "dikhao", "dikhaiye", "batao", "bataiye",
  "chahiye", "karna", "karni", "kariye", "kijiye", "hoga", "hogi", "tha", "thi", "raha", "rahi", "rahe", "wala", "wali",
  "abhi", "sabhi", "bhi", "aur", "iska", "uska", "dijiye", "sakte", "sakta", "sakti", "liye",
]);
const GUJARATI_LATIN = new Set([
  "che", "chhe", "chho", "cho", "chu", "chhu", "nu", "nathi", "maru", "mari", "mara", "mane", "tame", "tamaru", "tamari",
  "tamne", "shu", "kem", "kyare", "aaje", "kale", "ketla", "ketli", "ketlu", "batavo", "bataavo", "joie", "joiye", "karvanu",
  "bharvanu", "kholvanu", "hatu", "hati", "hata", "ane", "etle", "kayu", "sathe", "haju", "aapo", "aapjo", "jovu", "juo",
]);

/** A reply with no language of its own: yes, no, okay, thanks — in any of the three, in Latin letters. */
const BARE_REPLY = /^(?:yes|yeah|yep|yup|no|nope|ok|okay|sure|done|ha+|haa+n|han|haan\s?ji|ji|ji\s?haan|nahi|nahin|na+|nai|hmm+|thik|theek|thik\s+che|theek\s+hai|thanks?|thank\s+you|thx)[\s.!?]*$/i;

/** Codes are nobody's language: F/QC/30, F-QC-40.C, M-47, FGSL3877, 26-27/001, a record's id. */
const CODES = /\b[A-Za-z]{1,4}\s?[/-]\s?[A-Za-z0-9]+(?:[/.-][A-Za-z0-9]+)*\b|\b[\w-]*\d[\w-]*\b/g;

/**
 * The language a question was asked in (see the header): "gu" or "hi" when it is
 * written in that script (or reads as one in Latin letters), "en" for English,
 * null when it has no words of its own.
 */
export function askedLanguage(text: string): ScriptLanguage | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const c = wordCounts(raw);
  if (c.gu + c.hi > 0) {
    const asSentence = sentenceLanguage(raw);
    if (asSentence && asSentence !== "en") return asSentence;
  }
  if (BARE_REPLY.test(raw)) return null;
  const words = raw.replace(CODES, " ").toLowerCase().match(/[a-z]{2,}/g) ?? [];
  if (!words.length) return null;
  let hi = 0;
  let gu = 0;
  for (const w of new Set(words)) {
    if (HINDI_LATIN.has(w)) hi += 1;
    if (GUJARATI_LATIN.has(w)) gu += 1;
  }
  if (hi >= 2 && hi > gu) return "hi";
  if (gu >= 2 && gu > hi) return "gu";
  return "en";
}
