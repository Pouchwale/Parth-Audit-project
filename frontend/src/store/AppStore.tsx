import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { settingsRepository, type AppMode } from "../data/repositories/settingsRepository";
import { onExternalChange } from "../data/storageAdapter";
import type { Language } from "../i18n/strings";
import {
  getTranslateStatus,
  startGoogleTranslate,
  stopGoogleTranslate,
  subscribeTranslateStatus,
  uiLanguageFor,
  type TranslateStatus,
} from "../i18n/googleTranslate";
import { useAuth } from "./AuthContext";

interface AppStoreValue {
  mode: AppMode;
  setMode: (m: AppMode) => void;
  // Interface language. Held here (rather than in its own provider) because
  // this store already wraps the whole app, so setting it re-renders every
  // screen at once — which is exactly what changing language must do.
  /** The language the user chose — also the voice's and the assistant's reply language. */
  lang: Language;
  /**
   * The language the screens are WRITTEN in. With Gujarati chosen they stay in
   * English and Google Translate turns the whole page into Gujarati; only when
   * Google can't be reached do they use the built-in Gujarati (i18n/googleTranslate.ts).
   */
  uiLang: Language;
  translation: TranslateStatus;
  setLang: (l: Language) => void;
  // The name recorded against submit/verify/reject actions. Sourced from the
  // logged-in account (see AuthContext) — previously a free-text "Acting as"
  // dropdown with no real identity behind it (see FUTURE_ROADMAP.md).
  currentUser: string;
  version: number;
  bump: () => void;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [mode, setModeState] = useState<AppMode>(() => settingsRepository.get().mode);
  const [lang, setLangState] = useState<Language>(() => settingsRepository.get().language);
  const [version, setVersion] = useState(0);
  const translation = useSyncExternalStore(subscribeTranslateStatus, getTranslateStatus, getTranslateStatus);
  const uiLang = uiLanguageFor(lang, translation);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  // Another tab of the app saved something: redraw, so this one shows it
  // (recordRepository has already dropped its stale copy).
  useEffect(() => onExternalChange(() => bump()), [bump]);

  // Gujarati was chosen before (the choice is remembered): translate as the app opens.
  useEffect(() => {
    if (settingsRepository.get().language === "gu") startGoogleTranslate();
  }, []);

  // Tell assistive tech and the browser which language the page is written in.
  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = uiLang;
  }, [uiLang]);

  const setLang = useCallback(
    (l: Language) => {
      const previous = settingsRepository.get().language;
      if (l === previous) return;
      settingsRepository.update({ language: l });
      // Leaving Gujarati after Google translated the page: it reloads, in
      // English, on the same screen — nothing more to do here.
      if (previous === "gu" && stopGoogleTranslate()) return;
      setLangState(l);
      if (l === "gu") startGoogleTranslate();
      bump();
    },
    [bump]
  );

  const setMode = useCallback(
    (m: AppMode) => {
      settingsRepository.update({ mode: m });
      setModeState(m);
      bump();
    },
    [bump]
  );

  const currentUser = user?.name ?? "Guest User";

  const value = useMemo<AppStoreValue>(
    () => ({ mode, setMode, lang, uiLang, translation, setLang, currentUser, version, bump }),
    [mode, setMode, lang, uiLang, translation, setLang, currentUser, version, bump]
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStoreValue {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error("useAppStore must be used within AppStoreProvider");
  return ctx;
}
