// THE WORDS OF A REFUSAL BY ACCESS LEVEL, IN ENGLISH, GUJARATI AND HINDI (REQUIREMENTS §96).
//
// When a person asks for something their level on a document does not allow (start a record of a document they may
// only read, correct a signed-off record with Write, change a format), the website, Mitra and the server say so in the
// same plain words: what they have, what the step needs, and that the super admin gives it. The owner, 8-Oct-2026:
// "only the superadmin can do this: make an option for which user can access what, and give read, write and edit
// access accordingly."
//
// WITH NO IMPORTS (the type import below is erased), like engine/accessRules.ts: the server loads this file with Node's
// type stripping, so backend/ may word its 403 answers from it too. The English level names are the ones
// engine/accessRules.ts LEVEL_WORDS gives; frontend/tests/accessWords.test.ts holds the two equal.
import type { AccessLevel, DocumentAction } from "./accessRules";

export type AccessLanguage = "en" | "gu" | "hi";

/** The code a refusal by access level carries (the server's { error, code } and the browser's own). */
export const ACCESS_LEVEL_CODE = "access-level";

/** The short names of the levels. Gujarati and Hindi keep the English name beside their own, as the super admin's grid shows them (the same words engine/notificationText.ts uses). */
export const LEVEL_NAMES: Record<AccessLanguage, Record<AccessLevel, string>> = {
  en: { none: "No access", read: "Read", write: "Write", edit: "Edit" },
  gu: { none: "ઍક્સેસ નથી", read: "Read (ફક્ત જોવું)", write: "Write (ભરવું અને સબમિટ કરવું)", edit: "Edit (સુધારો પણ)" },
  hi: { none: "ऐक्सेस नहीं", read: "Read (केवल देखना)", write: "Write (भरना और जमा करना)", edit: "Edit (सुधार भी)" },
};

/** What each step is called in a sentence: "Submitting a record needs Write access." */
const ACTION_WORDS: Record<AccessLanguage, Record<DocumentAction, string>> = {
  en: {
    view: "Seeing it",
    start: "Starting a record",
    fill: "Filling in a record",
    submit: "Submitting a record",
    verify: "Verifying a record",
    send_back: "Sending a record back",
    correct: "Correcting a signed-off record",
    delete: "Deleting a record",
    format: "Changing the format",
  },
  gu: {
    view: "તેને જોવા",
    start: "રેકોર્ડ શરૂ કરવા",
    fill: "રેકોર્ડ ભરવા",
    submit: "રેકોર્ડ જમા કરવા",
    verify: "રેકોર્ડ ચકાસવા",
    send_back: "રેકોર્ડ પાછો મોકલવા",
    correct: "સહી થયેલો રેકોર્ડ સુધારવા",
    delete: "રેકોર્ડ કાઢી નાખવા",
    format: "ફોર્મેટ બદલવા",
  },
  hi: {
    view: "इसे देखने",
    start: "रिकॉर्ड शुरू करने",
    fill: "रिकॉर्ड भरने",
    submit: "रिकॉर्ड जमा करने",
    verify: "रिकॉर्ड जाँचने",
    send_back: "रिकॉर्ड वापस भेजने",
    correct: "साइन हो चुका रिकॉर्ड सुधारने",
    delete: "रिकॉर्ड हटाने",
    format: "फ़ॉर्मेट बदलने",
  },
};

/** The English level names, for a sentence in any language (the super admin's grid uses them). */
const SHORT: Record<AccessLevel, string> = { none: "No access", read: "Read", write: "Write", edit: "Edit" };

/**
 * THE REFUSAL, IN ONE OR TWO SHORT SENTENCES: what the person has on the document, and the level the step needs.
 *   none  "You do not have access to F/QC/13 Daily Lamination Log. Ask the super admin for Write access."
 *   read  "F/QC/13 Daily Lamination Log is Read only for you. Submitting a record needs Write access: ask the super admin for it."
 *   write "You have Write access to F/QC/13 Daily Lamination Log. Deleting a record needs Edit access: ask the super admin for it."
 * `document` is how the document is called (its format number and name); no pronoun names the person.
 */
export function refusalSentence(lang: AccessLanguage, document: string, have: AccessLevel, need: AccessLevel, action: DocumentAction): string {
  const doc = document.trim() || (lang === "gu" ? "આ દસ્તાવેજ" : lang === "hi" ? "यह दस्तावेज़" : "this document");
  const what = ACTION_WORDS[lang][action];
  const needName = SHORT[need];
  if (lang === "gu") {
    if (have === "none") return `${doc} ની ઍક્સેસ તમારી પાસે નથી. સુપર એડમિન પાસે ${needName} ઍક્સેસ માગો.`;
    if (have === "read") return `${doc} તમારા માટે ફક્ત Read છે. ${what} માટે ${needName} ઍક્સેસ જોઈએ: સુપર એડમિનને કહો.`;
    return `${doc} પર તમારી પાસે ${SHORT[have]} ઍક્સેસ છે. ${what} માટે ${needName} ઍક્સેસ જોઈએ: સુપર એડમિનને કહો.`;
  }
  if (lang === "hi") {
    if (have === "none") return `${doc} का ऐक्सेस आपके पास नहीं है। सुपर एडमिन से ${needName} ऐक्सेस माँगें।`;
    if (have === "read") return `${doc} आपके लिए केवल Read है। ${what} के लिए ${needName} ऐक्सेस चाहिए: सुपर एडमिन से कहें।`;
    return `${doc} पर आपके पास ${SHORT[have]} ऐक्सेस है। ${what} के लिए ${needName} ऐक्सेस चाहिए: सुपर एडमिन से कहें।`;
  }
  if (have === "none") return `You do not have access to ${doc}. Ask the super admin for ${needName} access.`;
  if (have === "read") return `${doc} is Read only for you. ${what} needs ${needName} access: ask the super admin for it.`;
  return `You have ${SHORT[have]} access to ${doc}. ${what} needs ${needName} access: ask the super admin for it.`;
}

/** The language of what a person typed or said, when it is plain from the letters: Devanagari is Hindi, Gujarati script is Gujarati. */
export function languageOfWords(words: string | undefined | null, fallback: AccessLanguage): AccessLanguage {
  if (!words) return fallback;
  if (/[ऀ-ॿ]/.test(words)) return "hi";
  if (/[઀-૿]/.test(words)) return "gu";
  return fallback;
}
