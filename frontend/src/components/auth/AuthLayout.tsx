import React from "react";

// THE FIRST SCREEN ANYBODY SEES (REQUIREMENTS §65): the company's mark, the
// system's name, whose system it is, and one plain line saying what it is for.
// The 192px file drawn at 72px stays crisp on a 2× screen; alt is empty because
// the name is written under it; the address is relative, like assets/styles.css
// in index.html. The company name is shown as written, never machine-translated
// (REQUIREMENTS §58). Nothing here reaches the forms below: the suites find
// their inputs by id, name and autocomplete.
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
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
            Gujarat Printpack Publication Pvt. Ltd.
          </div>
          <div className="purpose">Every controlled record — filled, reviewed, verified and on file.</div>
        </div>
        {children}
      </div>
    </div>
  );
}
