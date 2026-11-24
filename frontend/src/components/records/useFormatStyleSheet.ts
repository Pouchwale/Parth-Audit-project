import { createContext, useInsertionEffect } from "react";
import type { PartStyle } from "../../types";
import { formatStyleCss, registerFormatStyles } from "../../engine/formatStyles";

// THE STYLE SHEET OF A STYLED FORMAT (REQUIREMENTS §318, engine/formatStyles.ts), in the page's head while a sheet that
// carries its scope is on the screen: one sheet per set of styles, however many records of the format are drawn. In the
// head, not in the sheet: the downloads read the sheet's words (utils/documentExport.ts), never a style element's text.

/** Whether the sheet being drawn is styled: its parts then carry the markers its style sheet finds them by (data-style-*). */
export const FormatStyled = createContext(false);

const live = new Map<string, { el: HTMLStyleElement; users: number }>();

export function useFormatStyleSheet(scope: string | undefined, styles: Record<string, PartStyle> | undefined): void {
  useInsertionEffect(() => {
    if (!scope || typeof document === "undefined") return;
    registerFormatStyles(scope, styles);
    let entry = live.get(scope);
    if (!entry) {
      const el = document.createElement("style");
      el.setAttribute("data-format-style-sheet", scope);
      el.textContent = formatStyleCss(scope, styles);
      document.head.appendChild(el);
      entry = { el, users: 0 };
      live.set(scope, entry);
    }
    entry.users++;
    const held = entry;
    return () => {
      held.users--;
      if (held.users <= 0) {
        held.el.remove();
        live.delete(scope);
      }
    };
    // (the scope is the styles' own fingerprint: the same scope, the same sheet)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);
}
