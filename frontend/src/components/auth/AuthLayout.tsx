import React from "react";
import { COMPANY } from "../../data/seed/masterData";
import { ThemeSwitch } from "../layout/ThemeSwitch";

// THE FIRST SCREEN ANYBODY SEES (REQUIREMENTS §65): the company's mark, the
// system's name and whose system it is (the company's name as the owner gave it on
// 02-Oct-2026). The line under them that said what it is for is gone (REQUIREMENTS
// §123; the owner, 24-Oct-2026: "second is ok but remove the below line"): the
// title and the company's name stand on their own.
// The 192px file drawn at 72px stays crisp on a 2× screen; alt is empty because
// the name is written under it; the address is relative, like assets/styles.css
// in index.html. The company name is shown as written, never machine-translated
// (REQUIREMENTS §58). Nothing here reaches the forms below: the suites find
// their inputs by id, name and autocomplete.
//
// The system's name is a 3D wordmark in the display face (REQUIREMENTS §81,
// public/styles/brand.css) — since §123 the app's own Plus Jakarta Sans at its
// heaviest: a gradient face over three steps of depth, drawn once, and a single
// entrance of the TITLE alone as the screen opens — the card and the form never
// move. `afterIntro`: the introduction is playing over this screen (AuthScreen,
// IntroSplash.tsx), so the title's entrance waits for its veil to lift. Fixed for
// the life of the screen, so the entrance never restarts.
//
// `mascot`: the sign-in screen's cartoon (REQUIREMENTS §122; the owner, 24-Oct-2026: "add cartoon in login when
// user login and entering his password then that cartoon will closing eye and opening it has some emotions"),
// handed in by AuthScreen and drawn above everything else on the card — above the title, as asked. A prop, not
// a fixture, so the choose-your-password card (main.tsx) stays bare as before.
// THE WELCOME BESIDE THE CARD (REQUIREMENTS §204; the owner, 7-Nov-2026: "make login page very interesting and make it more
// engaging like something is very important opening after only"): what stands behind the sign-in - the plant's controlled
// records, every register and report, Mitra - and the day, said once beside the card on a wide screen and above it on a
// phone. Words and a drawn backdrop, nothing that moves: the card, its title's entrance and the suites' checks of them
// are exactly as before (`welcome` is the sign-in screen's; the choose-your-password card stays bare).
const DOORS: { icon: string; title: string; words: string }[] = [
  { icon: "☀", title: "Today's briefing", words: "what is due, what is late, what Mitra prepared" },
  { icon: "▤", title: "Every register and report", words: "filled, printed and filed as the company's papers are" },
  { icon: "✦", title: "Mitra", words: "prepares, reminds, answers - by text or by voice" },
];

function dayWords(): string {
  try {
    return new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  } catch {
    return "";
  }
}

export function AuthWelcome() {
  return (
    <aside className="auth-welcome" data-section="auth-welcome" aria-label="What signing in opens">
      <div className="auth-welcome-eyebrow">Authorised people only · every change is kept in a record's history</div>
      <h2 className="auth-welcome-title">Everything the plant records, kept right.</h2>
      <p className="auth-welcome-words">Behind this sign-in is the plant's controlled record system: the formats the auditors read, filled on the day and never lost.</p>
      <ul className="auth-doors">
        {DOORS.map((d) => (
          <li key={d.title}>
            <span className="auth-door-icon" aria-hidden="true">
              {d.icon}
            </span>
            <span>
              <strong>{d.title}</strong> — {d.words}
            </span>
          </li>
        ))}
      </ul>
      <div className="auth-welcome-day notranslate" translate="no">
        {dayWords()}
      </div>
    </aside>
  );
}

export function AuthLayout({ children, afterIntro = false, mascot, welcome = false }: { children: React.ReactNode; afterIntro?: boolean; mascot?: React.ReactNode; welcome?: boolean }) {
  return (
    <div className="auth-shell" data-intro={afterIntro ? "playing" : undefined} data-welcome={welcome ? "1" : undefined}>
      <div className="auth-stage" aria-hidden="true" />
      <div className="auth-frame">
      {welcome && <AuthWelcome />}
      <div className="auth-card">
        {mascot}
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
        </div>
        {children}
        {/* The theme, at the card's foot (REQUIREMENTS §90): this computer's look until
            somebody signs in, and theirs from then on (store/theme.tsx). */}
        <div className="auth-theme">
          <ThemeSwitch mirrorOnly />
        </div>
      </div>
      </div>
    </div>
  );
}
