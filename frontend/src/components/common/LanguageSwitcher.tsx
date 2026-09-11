import React from "react";
import { FiGlobe } from "react-icons/fi";
import { useAppStore } from "../../store/AppStore";
import { useT } from "../../i18n";
import { pressable } from "../../utils/pressable";
import { LANGUAGE_NAMES, type Language } from "../../i18n/strings";

const LANGS: Language[] = ["en", "gu"];

// Choosing ગુજરાતી turns Google Translate on for the whole app; choosing
// English turns it off (the page reloads in English, on the same screen).
// Without internet, Gujarati uses the built-in translation instead — the note
// under the buttons says which is showing (i18n/googleTranslate.ts). The
// language names themselves are never machine-translated (translate="no").
export function LanguageSwitcher({ variant = "pills" }: { variant?: "pills" | "compact" }) {
  const { lang, setLang, translation } = useAppStore();
  const t = useT();
  const note = lang === "gu" && translation === "loading" ? t("lang.translating") : lang === "gu" && translation === "failed" ? t("lang.builtIn") : null;

  if (variant === "compact") {
    return (
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
    );
  }

  return (
    <div className="lang-switcher">
      <div className="pill-tabs notranslate" translate="no" role="group" aria-label={t("common.language")}>
        {LANGS.map((l) => (
          <div key={l} className={`pill-tab ${lang === l ? "active" : ""}`} {...pressable(() => setLang(l), lang === l)} data-lang={l}>
            {l === "en" && <FiGlobe size={12} style={{ marginRight: 5, verticalAlign: -2 }} />}
            {LANGUAGE_NAMES[l]}
          </div>
        ))}
      </div>
      {note && (
        <div className="lang-note text-xs text-muted" data-translation={translation}>
          {note}
        </div>
      )}
    </div>
  );
}
