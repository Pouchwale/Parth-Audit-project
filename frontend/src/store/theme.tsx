import { useSyncExternalStore } from "react";
import { settingsRepository, type ThemeChoice } from "../data/repositories/settingsRepository";
import { paletteAt, skyFor, skyWords, type Sky, type SkyPhase } from "../engine/daylight";
import { DEFAULT_PLANT_TIME_ZONE, wallClock } from "../engine/workingHoursCore";
import { daylightThemeAvailable } from "../engine/features";

export type { ThemeChoice };

// THE THEME (REQUIREMENTS §90, 3-Oct-2026): light, dark, or the same as the computer -
// and, since §166 (2-Nov-2026), DAYLIGHT: with the sun over the plant.
//
// One attribute on <html> switches every colour in styles.css: data-theme is "light",
// "dark", "system" ("system" is dark while the computer is, and the browser follows a
// change of the computer's by itself) or "daylight". Nothing in the app is redrawn or
// measured again for it: the browser repaints with the new values, once.
//
// DAYLIGHT reads the plant's wall clock every minute (engine/daylight.ts: the real
// sunrise, noon and sunset over Mehsana for the day) and paints the sky on <html>:
// data-sky names the phase (night, dawn, morning, noon, afternoon, evening, dusk) and
// the surfaces' tokens are set inline, tinted toward the sky's light; at night the dark
// theme's values are the base (styles.css has them for the first paint), by day the
// light theme's. The top bar wears the sky as a band with the sun on its arc
// (components/layout/SkyArc.tsx). While printing the inline tokens are lifted, so a
// printout is the paper form as ever. A preview (the switch's "See the day") paints
// another minute of the day for this page alone, until Now or the next load.
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

export const THEME_CHOICES: readonly ThemeChoice[] = ["light", "dark", "system", "daylight"];

/** The choices a switch offers: the four, or the three of §90 on a server that does not offer Daylight (engine/features.ts). */
export function themeChoicesOffered(): readonly ThemeChoice[] {
  return daylightThemeAvailable() ? THEME_CHOICES : THEME_CHOICES.filter((c) => c !== "daylight");
}
export const DEFAULT_THEME: ThemeChoice = "light";
/** Fired on window whenever the theme painted changes (the switches listen to it). */
export const THEME_EVENT = "dcrs:theme";
/** This browser's copy of the last choice, read by index.html before the first paint. */
export const THEME_MIRROR_KEY = "dcrs:theme";
/** This browser's copy of the sky's base ("night" or "day"), read by index.html before the first paint of daylight. */
export const SKY_MIRROR_KEY = "dcrs:sky";
/** The tokens the sky paints inline on <html> (engine/daylight.ts paletteAt), without their leading dashes. */
export const SKY_TOKENS: readonly string[] = ["canvas", "surface", "surface-sunken", "surface-raised", "shell", "hairline", "hairline-strong", "field-bg", "sky-top", "sky-bottom", "sky-band", "sun-color", "sun-glow", "sun-x", "sun-y"];

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system" || value === "daylight";
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

// ---- the sky ---------------------------------------------------------------------------

let skyTimer: ReturnType<typeof setInterval> | null = null;
let previewMinutes: number | null = null;
let currentSky: Sky | null = null;
let printing = false;
let printListening = false;

/** The plant's date and the minute of its day, now (engine/workingHoursCore.ts, Asia/Kolkata). */
function plantNowMinutes(): { date: string; minutes: number } {
  const { date, secondOfDay } = wallClock(new Date(), DEFAULT_PLANT_TIME_ZONE);
  return { date, minutes: secondOfDay / 60 };
}

/** The sky over the plant now - or at the minute being previewed. */
export function readSky(): Sky {
  const { date, minutes } = plantNowMinutes();
  return skyFor(date, previewMinutes ?? minutes);
}

/** The sky as last painted (null while the theme is not daylight). */
export function paintedSky(): Sky | null {
  return currentSky;
}

/** Whether "See the day" is showing another minute than now. */
export function skyPreviewOn(): boolean {
  return previewMinutes !== null;
}

type RootStyle = { setProperty: (name: string, value: string) => void; removeProperty: (name: string) => void; colorScheme?: string } | undefined;

const rootStyle = (): RootStyle => (typeof document === "undefined" ? undefined : ((document.documentElement as unknown as { style?: RootStyle }).style ?? undefined));

function liftSkyTokens(): void {
  const style = rootStyle();
  if (!style) return;
  for (const name of SKY_TOKENS) style.removeProperty(`--${name}`);
  if ("colorScheme" in style) style.colorScheme = "";
}

function paintSky(): void {
  if (typeof document === "undefined") return;
  const sky = readSky();
  currentSky = sky;
  const root = document.documentElement;
  if (root.getAttribute("data-sky") !== sky.phase) root.setAttribute("data-sky", sky.phase);
  const style = rootStyle();
  if (style && !printing) {
    const palette = paletteAt(sky);
    for (const [name, value] of Object.entries(palette)) style.setProperty(`--${name}`, value);
    if ("colorScheme" in style) style.colorScheme = sky.base;
  }
  // The base mirrored for the next first paint is the real sky's, never a preview's.
  if (previewMinutes === null) {
    try {
      const base = sky.base === "dark" ? "night" : "day";
      if (window.localStorage.getItem(SKY_MIRROR_KEY) !== base) window.localStorage.setItem(SKY_MIRROR_KEY, base);
    } catch {
      /* storage blocked: the next first paint starts light for a moment */
    }
  }
  announce();
}

function listenForPrint(): void {
  if (printListening || typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  printListening = true;
  window.addEventListener("beforeprint", () => {
    printing = true;
    liftSkyTokens();
  });
  window.addEventListener("afterprint", () => {
    printing = false;
    if (currentSky) paintSky();
  });
}

function startSky(): void {
  listenForPrint();
  paintSky();
  if (skyTimer === null && typeof setInterval === "function") skyTimer = setInterval(paintSky, 60_000);
}

function stopSky(): void {
  if (skyTimer !== null) {
    clearInterval(skyTimer);
    skyTimer = null;
  }
  previewMinutes = null;
  currentSky = null;
  if (typeof document === "undefined") return;
  document.documentElement.removeAttribute("data-sky");
  liftSkyTokens();
}

/** "See the day": paints the sky at another minute of the plant's day for this page alone; null puts the real sky back. */
export function previewSky(minutes: number | null): void {
  previewMinutes = minutes === null ? null : ((minutes % 1440) + 1440) % 1440;
  if (currentSky || paintedTheme() === "daylight") paintSky();
}

// ---- painting a choice ----------------------------------------------------------------

/** Paints a choice: the attribute on <html>, and this browser's copy for the next first paint. */
export function applyTheme(choice: ThemeChoice): void {
  if (typeof document === "undefined") return;
  // Daylight on a server that does not offer it (engine/features.ts): light, as before the choice existed.
  const painted: ThemeChoice = choice === "daylight" && !daylightThemeAvailable() ? "light" : choice;
  const root = document.documentElement;
  if (root.getAttribute("data-theme") !== painted) root.setAttribute("data-theme", painted);
  if (painted === "daylight") startSky();
  else stopSky();
  writeThemeMirror(painted);
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

/** How a choice looks right now: "system" is the computer's own; "daylight" is dark by night and light by day. */
export function effectiveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice === "system") return computerIsDark() ? "dark" : "light";
  if (choice === "daylight") return (currentSky ?? readSky()).base;
  return choice;
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

export interface SkyView {
  phase: SkyPhase;
  base: "light" | "dark";
  sunrise: string;
  sunset: string;
  sunX: number;
  sunY: number;
  preview: boolean;
  /** The day's minutes, for the preview's buttons. */
  times: Sky["times"];
}

// One string, so React compares it by value: "<choice> <the computer's> <the sky's>".
const skyKey = (): string => {
  const sky = paintedTheme() === "daylight" ? (currentSky ?? readSky()) : null;
  if (!sky) return "-";
  const w = skyWords(sky);
  return `${w.phase}|${w.sunrise}|${w.sunset}|${previewMinutes === null ? 0 : 1}|${sky.sunX.toFixed(3)}|${sky.sunY.toFixed(3)}|${sky.base}`;
};
const snapshot = (): string => `${paintedTheme()} ${computerIsDark() ? "dark" : "light"} ${skyKey()}`;
const serverSnapshot = (): string => `${DEFAULT_THEME} light -`;

/** The theme as painted: the choice, the computer's own, what shows now, and the sky while daylight is on. Re-renders on a change of any. */
export function useTheme(): { choice: ThemeChoice; computer: "light" | "dark"; effective: "light" | "dark"; sky: SkyView | null } {
  const [choice, computer, key] = useSyncExternalStore(subscribe, snapshot, serverSnapshot).split(" ") as [ThemeChoice, "light" | "dark", string];
  let sky: SkyView | null = null;
  if (choice === "daylight" && key !== "-") {
    const [phase, sunrise, sunset, preview, sunX, sunY, base] = key.split("|");
    const times = (currentSky ?? readSky()).times;
    sky = { phase: phase as SkyPhase, base: base as "light" | "dark", sunrise, sunset, preview: preview === "1", sunX: Number(sunX), sunY: Number(sunY), times };
  }
  const effective: "light" | "dark" = choice === "system" ? computer : choice === "daylight" ? (sky?.base ?? "light") : choice;
  return { choice, computer, effective, sky };
}
