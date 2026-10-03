import { useCallback } from "react";
import { useAppStore } from "../store/AppStore";
import { settingsRepository } from "../data/repositories/settingsRepository";
import { STRINGS, type Language, type StringKey } from "./strings";
import { uiLanguageFor } from "./googleTranslate";

export { LANGUAGE_NAMES, SPEECH_LOCALES, type Language, type StringKey } from "./strings";

export type Vars = Record<string, string | number>;

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

// Translate for an explicitly given language. The `en` table is the source of
// truth for the key set and `gu` is typed against it, so a lookup can only
// fail for data-driven keys built at runtime (e.g. `status.${s}`) — those fall
// back to the key's own tail rather than rendering "undefined".
export function tr(lang: Language, key: StringKey | string, vars?: Vars): string {
  const table = STRINGS[lang] ?? STRINGS.en;
  const hit = (table as Record<string, string>)[key] ?? (STRINGS.en as Record<string, string>)[key];
  if (hit === undefined) return String(key).split(".").pop() ?? String(key);
  return interpolate(hit, vars);
}

/** The language the user chose (voice, assistant replies). */
export function currentLanguage(): Language {
  return settingsRepository.get().language;
}

// THE LANGUAGE AN ANSWER IS WRITTEN IN (REQUIREMENTS §89). Mitra's own answers
// (engine/assistantLocal.ts) follow the language the question was asked in where
// both tables have the words: a question in Gujarati gets Gujarati and one in
// English gets English, whatever the screens are in. Set for one answer only.
let answering: Language | null = null;

/** Runs `make` with `t()` writing in `lang`; null keeps the screens' language. */
export function answerIn<T>(lang: Language | null, make: () => T): T {
  const before = answering;
  answering = lang;
  try {
    return make();
  } finally {
    answering = before;
  }
}

// For code outside React (engines, the assistant's canned replies) — reads the
// stored language at call time. Text is written in English while Google
// Translate is turning the page into Gujarati (i18n/googleTranslate.ts).
export function t(key: StringKey | string, vars?: Vars): string {
  return tr(answering ?? uiLanguageFor(currentLanguage()), key, vars);
}

// For components: identical to `t`, but reading it through the store means the
// component re-renders when the language changes.
export function useT(): (key: StringKey | string, vars?: Vars) => string {
  const { uiLang } = useAppStore();
  return useCallback((key: StringKey | string, vars?: Vars) => tr(uiLang, key, vars), [uiLang]);
}

export function useLanguage(): { lang: Language; setLang: (l: Language) => void } {
  const { lang, setLang } = useAppStore();
  return { lang, setLang };
}
