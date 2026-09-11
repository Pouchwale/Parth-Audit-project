import type React from "react";

// A <div> that acts as a control — a pill tab, a calendar day, a reminder —
// was mouse-only: no tab stop, and Enter / Space did nothing, so keyboard
// users could never reach Master Data's tabs or open a day from the Calendar.
// Spread this onto it in place of a bare onClick. (Turning each into a
// <button> would restyle every pill; this keeps the look, and the test hooks,
// exactly as they are.) `pressed` marks the selected pill of a group.
export function pressable(onActivate: () => void, pressed?: boolean): React.HTMLAttributes<HTMLElement> {
  return {
    role: "button",
    tabIndex: 0,
    "aria-pressed": pressed,
    onClick: onActivate,
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault(); // Space would otherwise scroll the page
        onActivate();
      }
    },
  };
}
