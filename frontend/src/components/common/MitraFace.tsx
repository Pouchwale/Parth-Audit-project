import React from "react";
import type { MitraMood } from "../../engine/mitraMood";

// MITRA'S FACE (REQUIREMENTS §122; the owner, 24-Oct-2026): one little drawn face wherever Mitra stands — the Ask
// Mitra pill, the chat's avatars, the sign-in screen — with a mood on it (data-mood: the brows, the blush and the
// mouth change) and eyes that can close (data-eyes: the sign-in screen's cartoon shuts them while a password is
// typed). Drawn as plain SVG with no wrapper, no effects and no listeners, so a server-side render carries it whole
// (frontend/tests/mitraLook.test.ts matches `<span class="chat-avatar" aria-hidden="true"><svg`); every movement —
// the blink, a glance, the pop of joy — is the stylesheet's ("MITRA'S FACE" in styles.css), inside the motion rules
// that same test keeps.
export interface MitraFaceProps {
  mood?: MitraMood;
  /** "closed" while a password is typed (the sign-in screen): the lids drawn shut, nothing animated. */
  eyes?: "open" | "closed";
  /** Where the eyes look, each -1..1 (the sign-in cartoon follows the name being typed); unset, they rest centred. */
  look?: { x: number; y: number };
  size?: number;
  className?: string;
}

/** The mouth of each mood (joy's open smile is drawn apart, filled). */
const MOUTH: Record<Exclude<MitraMood, "joy">, string> = {
  happy: "M11 19.8 Q16 23.6 21 19.8",
  calm: "M12.4 20.4 Q16 22.6 19.6 20.4",
  sad: "M11.6 22.6 Q16 19.6 20.4 22.6",
  upset: "M11.8 21.9 L20.2 21.9",
};

const hold = (v: number): number => Math.max(-1, Math.min(1, v));

export function MitraFace({ mood = "happy", eyes = "open", look, size = 20, className }: MitraFaceProps) {
  const style = look ? ({ "--mf-lx": String(hold(look.x)), "--mf-ly": String(hold(look.y)) } as React.CSSProperties) : undefined;
  return (
    <svg
      className={`mitra-face${className ? ` ${className}` : ""}`}
      data-mood={mood}
      data-eyes={eyes}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      <circle className="mf-skin" cx="16" cy="16" r="15" />
      <path className="mf-brow mf-brow-l" d="M8.6 10.6 Q11 9.1 13.4 10.1" />
      <path className="mf-brow mf-brow-r" d="M18.6 10.1 Q21 9.1 23.4 10.6" />
      {eyes === "open" ? (
        <g className="mf-eyes">
          <ellipse cx="11.2" cy="14" rx="1.9" ry="2.5" />
          <ellipse cx="20.8" cy="14" rx="1.9" ry="2.5" />
        </g>
      ) : (
        <g className="mf-lids">
          <path d="M9 14.2 Q11.2 16.4 13.4 14.2" />
          <path d="M18.6 14.2 Q20.8 16.4 23 14.2" />
        </g>
      )}
      <g className="mf-blush">
        <circle cx="8.3" cy="17.8" r="1.6" />
        <circle cx="23.7" cy="17.8" r="1.6" />
      </g>
      {mood === "joy" ? (
        <path className="mf-mouth mf-mouth-open" d="M10.6 19.4 Q16 25.8 21.4 19.4 Q16 21.8 10.6 19.4 Z" />
      ) : (
        <path className="mf-mouth" d={MOUTH[mood]} />
      )}
    </svg>
  );
}
