import { useSyncExternalStore } from "react";
import { settingsRepository, type ThemeChoice } from "../data/repositories/settingsRepository";

export type { ThemeChoice };

// THE THEME (REQUIREMENTS §90, 3-Oct-2026): light, dark, or the same as the computer.
//
// One attribute on <html> switches every colour in styles.css: data-theme is "light",
// "dark" or "system" ("system" is dark while the computer is, and the browser follows a
// change of the computer's by itself). Nothing in the app is redrawn or measured again
// for it: the browser repaints with the new values, once.
//
// The choice is a person's own setting (AppSettings.theme), kept with the rest of their
// settings in PostgreSQL, so it follows them to any computer in the plant. This browser
// keeps a copy (localStorage "dcrs:theme", outside the app's dcrs:v1: items, so the sync
// with the database never sees it) for the two moments before anybody's settings are
// here: the first paint (index.html sets the attribute from it before the stylesheet is
// read, so the page never flashes the wrong theme) and the sign-in screen. It is never
// cleared on signing out: a plant computer keeps the look of whoever used it last.
//
// Light until somebody chooses, so nobody gets a surprise.

export const THEME_CHOICES: readonly ThemeChoice[] = ["light", "dark", "system"];
export const DEFAULT_THEME: ThemeChoice = "light";
/** Fired on window whenever the theme painted changes (the switches listen to it). */
export const THEME_EVENT = "dcrs:theme";
/** This browser's copy of the last choice, read by index.html before the first paint. */
export const THEME_MIRROR_KEY = "dcrs:theme";

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

/** The choice this browser last painted, or null (nothing chosen here yet, or storage blocked). */
export function readThemeMirror(): ThemeChoice | null {
  try {
    const value = window.localStorage.getItem(THEME_MIRROR_KEY);
    return isThemeChoice(value) ? value : null;
  } catch {
    return null;
  }
}

function writeThemeMirror(choice: ThemeChoice): void {
  try {
    if (window.localStorage.getItem(THEME_MIRROR_KEY) !== choice) window.localStorage.setItem(THEME_MIRROR_KEY, choice);
  } catch {
    /* storage blocked: the page still changes, only the next first paint does not know */
  }
}

function announce(): void {
  try {
    window.dispatchEvent(new Event(THEME_EVENT));
  } catch {
    /* no window (unit tests) */
  }
}

/** Paints a choice: the attribute on <html>, and this browser's copy for the next first paint. */
export function applyTheme(choice: ThemeChoice): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (root.getAttribute("data-theme") !== choice) root.setAttribute("data-theme", choice);
  writeThemeMirror(choice);
  announce();
}

/** The choice painted now (set by index.html or applyTheme); light when there is none. */
export function paintedTheme(): ThemeChoice {
  if (typeof document === "undefined") return DEFAULT_THEME;
  const value = document.documentElement.getAttribute("data-theme");
  return isThemeChoice(value) ? value : DEFAULT_THEME;
}

let darkQuery: MediaQueryList | null | undefined;
function computerQuery(): MediaQueryList | null {
  if (darkQuery === undefined) {
    try {
      darkQuery = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    } catch {
      darkQuery = null;
    }
  }
  return darkQuery;
}

/** Whether the computer itself is set to dark now. */
export function computerIsDark(): boolean {
  return computerQuery()?.matches ?? false;
}

/** How a choice looks right now: "system" is the computer's own. */
export function effectiveTheme(choice: ThemeChoice): "light" | "dark" {
  return choice === "system" ? (computerIsDark() ? "dark" : "light") : choice;
}

/** A choice made on the sign-in screen of this page, for the person who signs in next. */
let pickedBeforeSignIn = false;

/**
 * A choice made with a switch. Signed in, it is kept with the person's settings (and so
 * reaches the database); on the sign-in screen (`beforeSignIn`) this browser alone keeps
 * it, and the person who signs in next on this page takes it on (adoptPersonTheme).
 */
export function setThemeChoice(choice: ThemeChoice, { beforeSignIn = false }: { beforeSignIn?: boolean } = {}): void {
  if (beforeSignIn) pickedBeforeSignIn = true;
  else {
    try {
      settingsRepository.update({ theme: choice });
    } catch {
      /* the store is full: the page still changes for now */
    }
  }
  applyTheme(choice);
}

/**
 * Paints the signed-in person's theme once their settings are here (AppStoreProvider):
 * their own (light until they choose; a person signing in on a plant computer for the
 * first time is handed on that computer's settings, theme and all, data/serverSync.ts),
 * or the one they picked on the sign-in screen just before, which is kept with their
 * settings from then on.
 */
export function adoptPersonTheme(): ThemeChoice {
  let choice = settingsRepository.get().theme;
  const picked = pickedBeforeSignIn ? readThemeMirror() : null;
  if (picked && picked !== choice) {
    try {
      settingsRepository.update({ theme: picked });
    } catch {
      /* the store is full: painted all the same */
    }
    choice = picked;
  }
  pickedBeforeSignIn = false;
  applyTheme(choice);
  return choice;
}

/** The person's settings came in from another computer or tab: their theme, painted again if it changed there. */
export function reapplyPersonTheme(): void {
  const own = settingsRepository.get().theme;
  if (own !== paintedTheme()) applyTheme(own);
}

// ---- the hook the switches use -------------------------------------------------------

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(THEME_EVENT, onChange);
  const query = computerQuery();
  try {
    query?.addEventListener("change", onChange);
  } catch {
    /* an old browser: the note under the menu updates on the next change of theme instead */
  }
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    try {
      query?.removeEventListener("change", onChange);
    } catch {
      /* as above */
    }
  };
}

// One string, so React compares it by value: "<choice> <the computer's>".
const snapshot = (): string => `${paintedTheme()} ${computerIsDark() ? "dark" : "light"}`;
const serverSnapshot = (): string => `${DEFAULT_THEME} light`;

/** The theme as painted: the choice, the computer's own, and what shows now. Re-renders on a change of either. */
export function useTheme(): { choice: ThemeChoice; computer: "light" | "dark"; effective: "light" | "dark" } {
  const [choice, computer] = useSyncExternalStore(subscribe, snapshot, serverSnapshot).split(" ") as [ThemeChoice, "light" | "dark"];
  return { choice, computer, effective: choice === "system" ? computer : choice };
}
