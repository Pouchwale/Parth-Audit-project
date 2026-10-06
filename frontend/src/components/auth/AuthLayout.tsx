import React from "react";
import { COMPANY } from "../../data/seed/masterData";
import { ThemeSwitch } from "../layout/ThemeSwitch";

// THE FIRST SCREEN ANYBODY SEES (REQUIREMENTS §65): the company's mark, the
// system's name, whose system it is (the company's name as the owner gave it on
// 02-Oct-2026), and one plain line saying what it is for.
// The 192px file drawn at 72px stays crisp on a 2× screen; alt is empty because
// the name is written under it; the address is relative, like assets/styles.css
// in index.html. The company name is shown as written, never machine-translated
// (REQUIREMENTS §58). Nothing here reaches the forms below: the suites find
// their inputs by id, name and autocomplete.
//
// The system's name is a 3D wordmark in the display face (REQUIREMENTS §81,
// public/styles/brand.css): a gradient face over three steps of depth, drawn
// once, and a single entrance of the TITLE alone as the screen opens — the card
// and the form never move. `afterIntro`: the introduction is playing over this
// screen (AuthScreen, IntroSplash.tsx), so the title's entrance waits for its
// veil to lift. Fixed for the life of the screen, so the entrance never restarts.
export function AuthLayout({ children, afterIntro = false }: { children: React.ReactNode; afterIntro?: boolean }) {
  return (
    <div className="auth-shell" data-intro={afterIntro ? "playing" : undefined}>
      <div className="auth-card">
        <div className="auth-brand">
          <img
            className="auth-logo notranslate"
            translate="no"
            src="brand/logo-192.png"
            width={72}
            height={72}
            alt=""
            decoding="async"
            draggable={false}
          />
          <div className="title">Digital Controlled Record System</div>
          <div className="subtitle notranslate" translate="no">
            {COMPANY.shortName}
          </div>
          <div className="purpose">Every controlled record — filled, reviewed, verified and on file.</div>
        </div>
        {children}
        {/* The theme, at the card's foot (REQUIREMENTS §90): this computer's look until
            somebody signs in, and theirs from then on (store/theme.tsx). */}
        <div className="auth-theme">
          <ThemeSwitch mirrorOnly />
        </div>
      </div>
    </div>
  );
}
