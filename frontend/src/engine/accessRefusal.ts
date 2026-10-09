import { documentRepository } from "../data/repositories/documentRepository";
import { documentLevel, mayDo } from "./departmentScope";
import { levelNeeded, type DocumentAction } from "./accessRules";
import { languageOfWords, refusalSentence, type AccessLanguage } from "./accessWords";

// WHY A BUTTON IS NOT THERE, OR WHY MITRA SAYS NO (REQUIREMENTS §96).
//
// The record pages show no Start, Submit, Verify, Correct, Delete or format button below the level the step needs, and
// say why in one line; Mitra's tools and the rules path refuse the same step with the same words, in the language of
// the person (engine/accessWords.ts). The level is the signed-in person's own (engine/departmentScope.ts).

/** How a document is called in a sentence: its format number and name ("F/QC/13 Daily Lamination Log"). */
export function documentCalled(documentId: string): string {
  const doc = documentRepository.getByIdUnscoped(documentId);
  if (!doc) return "";
  return doc.formatNo && !doc.formatNo.toUpperCase().startsWith("TO BE") ? `${doc.formatNo} ${doc.name}` : doc.name;
}

/** The refusal for this step on this document in `lang`, or null when the signed-in person may do it. */
export function refusalFor(documentId: string | undefined, action: DocumentAction, lang: AccessLanguage = "en"): string | null {
  if (!documentId || mayDo(documentId, action)) return null;
  return refusalSentence(lang, documentCalled(documentId), documentLevel(documentId), levelNeeded(action), action);
}

/** As refusalFor, in the language of what the person typed or said (Hindi in Devanagari, Gujarati in its own script), else `fallback`. */
export function refusalForWords(documentId: string | undefined, action: DocumentAction, words: string | undefined, fallback: AccessLanguage): string | null {
  return refusalFor(documentId, action, languageOfWords(words, fallback));
}
