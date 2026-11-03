import React from "react";
import { useTheme } from "../../store/theme";

// THE SUN ON ITS ARC (REQUIREMENTS §166): while the theme follows the sun, the top bar wears the sky as a band
// (styles.css --sky-band, painted by store/theme.tsx) and this draws what is in it, placed by the minute: the sun
// from the left edge at sunrise, over the top at noon, to the right edge at sunset; by night the moon crossing the
// same way, with a few stars. Nothing here is read by anything: it is the view out of the window.

/** Where the stars stand, as a share of the bar's width and height. */
const STARS: readonly [number, number, boolean][] = [
  [9, 62, false],
  [21, 28, true],
  [33, 70, false],
  [47, 22, false],
  [61, 58, true],
  [74, 30, false],
  [88, 66, false],
  [95, 24, true],
];

export function SkyArc() {
  const { choice, sky } = useTheme();
  if (choice !== "daylight" || !sky) return null;
  const night = sky.base === "dark";
  const left = `${(6 + sky.sunX * 88).toFixed(2)}%`;
  const top = `${(13 + (1 - sky.sunY) * 31).toFixed(1)}px`;
  return (
    <div className="sky-arc" aria-hidden="true" data-sky-phase={sky.phase} data-sky-preview={sky.preview ? "on" : undefined}>
      {night && STARS.map(([x, y, bright], i) => <span key={i} className={`sky-star${bright ? " is-bright" : ""}`} style={{ left: `${x}%`, top: `${y}%` }} />)}
      <span className={night ? "sky-moon" : "sky-sun"} style={{ left, top }} />
    </div>
  );
}
