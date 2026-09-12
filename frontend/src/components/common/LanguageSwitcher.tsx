import React from "react";
import { useAppStore } from "../../store/AppStore";
import { useT } from "../../i18n";
import { LANGUAGE_NAMES, type Language } from "../../i18n/strings";

const LANGS: Language[] = ["en", "gu"];

// THE APP'S ONE LANGUAGE CONTROL, in the top bar so it is reachable from every
// screen. Choosing ગુજરાતી turns Google Translate on for the whole app;
// choosing English turns it off (the page reloads in English, on the same
// screen). Without internet, Gujarati uses the built-in translation instead —
// the word beside the box says which is showing, with the whole sentence as its
// tooltip (i18n/googleTranslate.ts). The language names themselves are never
// machine-translated (translate="no").
export function LanguageSwitcher() {
  const { lang, setLang, translation } = useAppStore();
  const t = useT();
  const note = lang === "gu" && translation === "loading" ? t("lang.translating") : lang === "gu" && translation === "failed" ? t("lang.builtIn") : null;
  const shortNote = lang === "gu" && translation === "loading" ? t("lang.translatingShort") : lang === "gu" && translation === "failed" ? t("lang.builtInShort") : null;

  return (
    <div className="lang-switcher-compact">
      <select
        className="input input-sm lang-select notranslate"
        translate="no"
        aria-label={t("common.language")}
        title={note ?? t("common.language")}
        value={lang}
        onChange={(e) => setLang(e.target.value as Language)}
      >
        {LANGS.map((l) => (
          <option key={l} value={l}>
            {LANGUAGE_NAMES[l]}
          </option>
        ))}
      </select>
      {shortNote && (
        <span className="lang-note text-xs text-muted" data-translation={translation} title={note ?? undefined}>
          {shortNote}
        </span>
      )}
    </div>
  );
}
