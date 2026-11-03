import React, { useEffect, useId, useRef, useState } from "react";
import { FiCheck, FiMonitor, FiMoon, FiSun, FiSunrise } from "react-icons/fi";
import { t } from "../../i18n";
import { previewSky, setThemeChoice, themeChoicesOffered, useTheme, type ThemeChoice } from "../../store/theme";

const ICONS: Record<ThemeChoice, typeof FiSun> = { light: FiSun, dark: FiMoon, system: FiMonitor, daylight: FiSunrise };

/** "See the day" (REQUIREMENTS §166): a minute of the plant's day to paint, from the day's own sun times. */
export const SKY_PREVIEWS = ["dawn", "noon", "evening", "night", "now"] as const;
export type SkyPreview = (typeof SKY_PREVIEWS)[number];

export function previewMinuteFor(which: SkyPreview, times: { sunrise: number; noon: number; sunset: number; dusk: number }): number | null {
  switch (which) {
    case "dawn":
      return times.sunrise + 6;
    case "noon":
      return times.noon;
    case "evening":
      return times.sunset - 12;
    case "night":
      return times.dusk + 150;
    default:
      return null;
  }
}

// THE THEME SWITCH (REQUIREMENTS §90): an icon in the top bar, after the language
// control (the bar still begins with the connection, the clock and the language,
// e2e_topbar_status), and the same at the foot of the sign-in card. It opens a small
// menu of four: Light, Dark, Same as my computer and Daylight (with the sun, §166), one
// of them ticked. With Daylight ticked the menu also says the day's sunrise and sunset
// and the sky now, and offers "See the day": dawn, noon, evening, night, now - a look
// for this page alone, never kept.
//
// The button has no word of its own (its name is "Theme", its tooltip says which is
// on), so no suite that finds a button by its words can land on it; the words are on
// the page only while the menu is open. By keyboard: Enter, Space or the down arrow
// opens it on the ticked one, the arrows move, Enter or Space chooses, Escape closes;
// focus comes back to the button. A click anywhere else closes it.
//
// Signed in, the choice is kept with the person's settings (store/theme.tsx). On the
// sign-in screen (`mirrorOnly`) this browser alone keeps it, for the sign-in screen
// and for whoever signs in next here. The words come from the plain `t`, so the switch
// works before the app's store exists; the top bar redraws it when the language changes.
export function ThemeSwitch({ mirrorOnly = false }: { mirrorOnly?: boolean }) {
  const { choice, computer, sky } = useTheme();
  const THEME_CHOICES = themeChoicesOffered();
  const [open, setOpen] = useState(false);
  const [focusAt, setFocusAt] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();
  const ticked = Math.max(0, THEME_CHOICES.indexOf(choice));
  const last = THEME_CHOICES.length - 1;

  const openAt = (index: number) => {
    setFocusAt(index);
    setOpen(true);
  };
  const close = (backToButton: boolean) => {
    setOpen(false);
    if (backToButton) buttonRef.current?.focus();
  };
  const pick = (next: ThemeChoice) => {
    setThemeChoice(next, { beforeSignIn: mirrorOnly });
    close(true);
  };

  // The item with the keyboard's focus is the one focused (and the one Tab reaches).
  useEffect(() => {
    if (open) itemRefs.current[focusAt]?.focus();
  }, [open, focusAt]);

  // A click anywhere else closes the menu (and leaves focus where the click put it).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const onButtonKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openAt(e.key === "ArrowDown" ? ticked : last);
    }
  };
  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // The arrows walk the four choices; inside "See the day" the keys are the buttons' own.
    const inPreview = !!(e.target as HTMLElement | null)?.closest?.("[data-sky-preview]");
    const move: Record<string, number> = { ArrowDown: (focusAt + 1) % THEME_CHOICES.length, ArrowUp: (focusAt + last) % THEME_CHOICES.length, Home: 0, End: last };
    if (e.key in move && !inPreview) {
      e.preventDefault();
      setFocusAt(move[e.key]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "Tab" && (inPreview || choice !== "daylight" || e.shiftKey)) {
      // Leaving by Tab: the menu closes and focus goes on where Tab takes it (with Daylight ticked, Tab first reaches "See the day").
      setOpen(false);
    }
  };

  const name = (c: ThemeChoice) => t(`theme.${c}`);
  const Icon = ICONS[choice];
  const phaseWord = sky ? t(`theme.phase.${sky.phase}`) : "";
  const showing = choice === "system" ? `${name("system")} (${t(`theme.now.${computer}`)})` : choice === "daylight" && sky ? `${name("daylight")} (${phaseWord})` : name(choice);

  return (
    <div className="theme-switch" data-theme-switch ref={wrapRef}>
      <button
        type="button"
        ref={buttonRef}
        className="btn btn-ghost btn-sm"
        data-action="theme-menu"
        aria-label={t("theme.label")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={t("theme.title", { theme: showing })}
        onClick={() => (open ? close(false) : openAt(ticked))}
        onKeyDown={onButtonKey}
      >
        <Icon size={15} aria-hidden="true" />
      </button>
      {open && (
        <div className="theme-menu" role="menu" id={menuId} aria-label={t("theme.label")} onKeyDown={onMenuKey}>
          {THEME_CHOICES.map((c, i) => {
            const ItemIcon = ICONS[c];
            return (
              <button
                key={c}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={choice === c}
                tabIndex={i === focusAt ? 0 : -1}
                className="theme-menu-item"
                data-action="set-theme"
                data-theme-choice={c}
                onClick={() => pick(c)}
              >
                <ItemIcon size={15} aria-hidden="true" />
                <span>{name(c)}</span>
                {choice === c && <FiCheck size={14} className="theme-menu-check" aria-hidden="true" />}
              </button>
            );
          })}
          {choice === "daylight" && sky ? (
            <>
              <div className="theme-menu-note" data-field="sky-note">
                {t("theme.skyNote", { sunrise: sky.sunrise, sunset: sky.sunset, phase: phaseWord })}
              </div>
              <div className="theme-menu-preview" data-field="sky-preview">
                <span className="theme-menu-preview-label">{t("theme.preview")}</span>
                {SKY_PREVIEWS.map((which) => (
                  <button
                    key={which}
                    type="button"
                    className={`btn btn-ghost btn-sm${which === "now" && !sky.preview ? " is-on" : ""}`}
                    data-action="preview-sky"
                    data-sky-preview={which}
                    onClick={() => previewSky(previewMinuteFor(which, sky.times))}
                  >
                    {t(`theme.preview.${which}`)}
                  </button>
                ))}
              </div>
              {sky.preview && <div className="theme-menu-note">{t("theme.previewNote")}</div>}
            </>
          ) : (
            <div className="theme-menu-note">{t("theme.computerNow", { theme: t(`theme.now.${computer}`) })}</div>
          )}
        </div>
      )}
    </div>
  );
}
