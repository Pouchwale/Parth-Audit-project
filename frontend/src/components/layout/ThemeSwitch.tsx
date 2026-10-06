import React, { useEffect, useId, useRef, useState } from "react";
import { FiCheck, FiMonitor, FiMoon, FiSun } from "react-icons/fi";
import { t } from "../../i18n";
import { setThemeChoice, THEME_CHOICES, useTheme, type ThemeChoice } from "../../store/theme";

const ICONS: Record<ThemeChoice, typeof FiSun> = { light: FiSun, dark: FiMoon, system: FiMonitor };

// THE THEME SWITCH (REQUIREMENTS §90): an icon in the top bar, after the language
// control (the bar still begins with the connection, the clock and the language,
// e2e_topbar_status), and the same at the foot of the sign-in card. It opens a small
// menu of three: Light, Dark and Same as my computer, one of them ticked.
//
// The button has no word of its own (its name is "Theme", its tooltip says which is
// on), so no suite that finds a button by its words can land on it; the three words
// are on the page only while the menu is open. By keyboard: Enter, Space or the down
// arrow opens it on the ticked one, the arrows move, Enter or Space chooses, Escape
// closes; focus comes back to the button. A click anywhere else closes it.
//
// Signed in, the choice is kept with the person's settings (store/theme.tsx). On the
// sign-in screen (`mirrorOnly`) this browser alone keeps it, for the sign-in screen
// and for whoever signs in next here. The words come from the plain `t`, so the switch
// works before the app's store exists; the top bar redraws it when the language changes.
export function ThemeSwitch({ mirrorOnly = false }: { mirrorOnly?: boolean }) {
  const { choice, computer } = useTheme();
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
    const move: Record<string, number> = { ArrowDown: (focusAt + 1) % THEME_CHOICES.length, ArrowUp: (focusAt + last) % THEME_CHOICES.length, Home: 0, End: last };
    if (e.key in move) {
      e.preventDefault();
      setFocusAt(move[e.key]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "Tab") {
      // Leaving by Tab: the menu closes and focus goes on where Tab takes it.
      setOpen(false);
    }
  };

  const name = (c: ThemeChoice) => t(`theme.${c}`);
  const Icon = ICONS[choice];
  const showing = choice === "system" ? `${name("system")} (${t(`theme.now.${computer}`)})` : name(choice);

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
          <div className="theme-menu-note">{t("theme.computerNow", { theme: t(`theme.now.${computer}`) })}</div>
        </div>
      )}
    </div>
  );
}
