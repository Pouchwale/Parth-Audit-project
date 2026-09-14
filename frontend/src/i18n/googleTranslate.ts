import type { Language } from "./strings";
import { installTranslateGuard } from "./translateGuard";

// GUJARATI THROUGH GOOGLE TRANSLATE.
//
// Choosing ગુજરાતી switches Google's website translator on for the whole
// app: the screens are written in English and Google turns every page into
// Gujarati as it appears — menus, pages, lists, the assistant's chat.
// Choosing English switches it off again by reloading the page (same screen,
// nothing lost — every record saves itself, and RecordPage flushes on
// unload), which is the only way to get Google's rewritten text back to the
// original exactly.
//
// Two things are never handed to Google:
//   * the issued documents themselves — every form, register, header, the
//     licence and Statements of Compliance carry translate="no", so a
//     controlled record reads exactly as issued (and its contents aren't sent
//     to Google);
//   * anything at all while English is chosen — the script isn't even loaded.
//
// If Google can't be reached (no internet on the plant network, blocked),
// Gujarati falls back to the app's own built-in Gujarati text (i18n/
// strings.ts), so the choice always does something.
//
// Google rewrites the page's text behind React's back; translateGuard.ts
// keeps the two from tripping over each other.

export type TranslateStatus = "off" | "loading" | "on" | "failed";

const TARGET = "gu";
const CALLBACK = "dcrsGoogleTranslateReady";
const SCRIPT_URL = `https://translate.google.com/translate_a/element.js?cb=${CALLBACK}`;
const CONTAINER_ID = "google_translate_element";
// Script loaded and the page translated within this long, or it counts as
// unreachable and the built-in Gujarati takes over.
const READY_TIMEOUT_MS = 9000;

let status: TranslateStatus = "off";
const listeners = new Set<() => void>();

function setStatus(next: TranslateStatus): void {
  if (status === next) return;
  status = next;
  listeners.forEach((fn) => fn());
}

export function getTranslateStatus(): TranslateStatus {
  return status;
}

export function subscribeTranslateStatus(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/**
 * The language the screens are WRITTEN in. With Gujarati chosen they stay in
 * English for Google to translate — unless Google couldn't be reached, when
 * the built-in Gujarati is used instead.
 */
export function uiLanguageFor(lang: Language, s: TranslateStatus = status): Language {
  return lang === "gu" && s !== "failed" ? "en" : lang;
}

function isTranslated(): boolean {
  const c = document.documentElement.classList;
  return c.contains("translated-ltr") || c.contains("translated-rtl");
}

// Google's widget reads (and writes) the "googtrans" cookie: /en/gu means
// "translate this site from English to Gujarati", including after a reload.
function writeCookie(value: string | null): void {
  if (value !== null) {
    document.cookie = `googtrans=${value}; path=/`;
    return;
  }
  const host = window.location.hostname;
  for (const domain of ["", `; domain=${host}`, `; domain=.${host}`]) {
    document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain}`;
  }
}

interface GoogleTranslateWindow {
  google?: { translate?: { TranslateElement?: new (opts: object, id: string) => unknown } };
  [CALLBACK]?: () => void;
}

export function startGoogleTranslate(): void {
  if (typeof document === "undefined" || status === "loading" || status === "on") return;
  installTranslateGuard();
  writeCookie(`/en/${TARGET}`);
  setStatus("loading");
  const started = Date.now();
  const fail = () => {
    if (status === "loading") setStatus("failed");
  };

  if (!document.getElementById(CONTAINER_ID)) {
    const box = document.createElement("div");
    box.id = CONTAINER_ID;
    box.className = "gt-container";
    box.setAttribute("aria-hidden", "true");
    document.body.appendChild(box);
  }

  const w = window as unknown as GoogleTranslateWindow;
  const create = () => {
    if (status !== "loading") return; // switched back to English meanwhile
    const Element = w.google?.translate?.TranslateElement;
    if (!Element) return fail();
    try {
      new Element({ pageLanguage: "en", includedLanguages: TARGET, autoDisplay: false }, CONTAINER_ID);
    } catch {
      fail();
    }
  };
  if (w.google?.translate?.TranslateElement) {
    create();
  } else {
    w[CALLBACK] = create;
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onerror = fail;
    document.head.appendChild(script);
  }

  // Pick Gujarati in the widget's (hidden) language box as soon as it exists,
  // then wait for Google to say the page is translated.
  const poll = window.setInterval(() => {
    if (status !== "loading") return window.clearInterval(poll);
    if (isTranslated()) {
      window.clearInterval(poll);
      return setStatus("on");
    }
    const combo = document.querySelector<HTMLSelectElement>("select.goog-te-combo");
    if (combo && combo.value !== TARGET && combo.querySelector(`option[value="${TARGET}"]`)) {
      combo.value = TARGET;
      combo.dispatchEvent(new Event("change"));
    }
    if (Date.now() - started > READY_TIMEOUT_MS) {
      window.clearInterval(poll);
      fail();
    }
  }, 150);
}

/**
 * Switch Google Translate off. Returns true when the page is being reloaded
 * to bring the original English back (Google had translated it, or was part
 * way through); false when nothing on the page was touched.
 */
export function stopGoogleTranslate(): boolean {
  writeCookie(null);
  const touched = status === "on" || status === "loading" || (typeof document !== "undefined" && isTranslated());
  setStatus("off");
  if (touched) window.location.reload();
  return touched;
}
