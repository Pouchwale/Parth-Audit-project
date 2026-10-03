// MITRA'S VOICE IN THIS BROWSER, LANGUAGE BY LANGUAGE (REQUIREMENTS §89).
//
// Inside the Master Data card "Sounds and Mitra's voice" (pages/MasterDataPage.tsx):
// for English, Hindi and Gujarati, which voice speaks it in THIS browser: Edge's
// natural Neerja, स्वरा, ધ્વની (or their male voices), Google's or Windows' voices,
// Groq's from the server for English when the browser has no natural Indian
// English voice; or that there is none here and DCRS should be opened in
// Microsoft Edge; and for each a "Hear Mitra" button that says one short sentence
// in that language (utils/voice.ts sampleLine). The female or male choice is the
// card's own, just above. Built from the card's classes only: the site's look is
// another piece of work. The English row keeps the hooks the browser suites read:
// [data-field='voice-in-use'] with its data-source, and [data-action='test-voice'].
import { useT } from "../../i18n";
import { useAuth } from "../../store/AuthContext";
import { firstNameOf } from "../../engine/assistantPersona";
import { isEdgeBrowser } from "../../utils/speech";
import type { ScriptLanguage } from "../../utils/scripts";
import { sampleLine, say, type LanguageVoice, type VoiceInUse } from "../../utils/voice";

/** Each language by its own name, and the hooks of its row. */
const ROWS: { lang: ScriptLanguage; name: string; field: string; action: string }[] = [
  { lang: "en", name: "English", field: "voice-in-use", action: "test-voice" },
  { lang: "hi", name: "हिंदी", field: "voice-hindi", action: "test-voice-hi" },
  { lang: "gu", name: "ગુજરાતી", field: "voice-gujarati", action: "test-voice-gu" },
];

export function VoiceLanguages({ using }: { using: VoiceInUse | null }) {
  const t = useT();
  const { user } = useAuth();
  const describe = (lang: ScriptLanguage, v: LanguageVoice): string => {
    if (v.source === "server") return t("voice.row.server", { name: v.name || "Groq" });
    if (v.source !== "none") return t(`voice.row.${v.source}`, { name: v.name });
    if (lang === "en") return t("voice.row.noneEnglish");
    return t(isEdgeBrowser() ? "voice.row.noneEdge" : "voice.row.none");
  };
  return (
    <div className="mb-3" data-section="voice-languages">
      <div className="text-sm font-semibold mb-1">{t("voice.langs.title")}</div>
      <p className="text-xs text-muted mb-2">{t("voice.langs.persona")}</p>
      {ROWS.map((row) => {
        const v = using?.languages[row.lang] ?? null;
        return (
          <div key={row.lang} className="voice-row mb-2" data-voice-lang={row.lang}>
            <span className="text-sm font-semibold" lang={row.lang}>
              {row.name}
            </span>
            {v && (
              <span className="text-xs text-muted" data-field={row.field} data-source={v.source}>
                {describe(row.lang, v)}
              </span>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              data-action={row.action}
              title={t("voice.row.hearTitle")}
              disabled={row.lang !== "en" && v?.source === "none"}
              onClick={() => say({ text: sampleLine(firstNameOf(user?.name), row.lang), lang: row.lang, priority: "high" })}
            >
              {t("voice.settings.test")}
            </button>
          </div>
        );
      })}
    </div>
  );
}
