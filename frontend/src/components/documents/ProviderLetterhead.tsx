import React from "react";
import { SA_PROVIDER_LETTERHEAD } from "../../data/seed/serviceAgreement";

// GURUDEV PEST CONTROL'S PRINTED LETTERHEAD, transcribed from "Letter head.pdf"
// exactly as it prints: the GPC mark, the two mobile numbers on the right, the
// name, the two address lines, the email and website, and the rule beneath.
// The documents the service provider issues carry it — the Pest Control
// Training Record (the training is theirs) and the Pest Control Service
// Agreement — so it lives here rather than inside either one.
//
// The printed mark is a green badge with the letters GPC and a small insect
// device; the lettering is reproduced, the artwork is TO BE CONFIRMED
// (REQUIREMENTS §33).
export function ProviderLetterhead() {
  const L = SA_PROVIDER_LETTERHEAD;
  return (
    <div className="provider-letterhead notranslate" translate="no" data-section="provider-letterhead">
      <div className="pl-logo" aria-hidden="true">
        {L.logo}
      </div>
      <div className="pl-phones">{L.phones}</div>
      <div className="pl-name">{L.name}</div>
      <div className="pl-address">
        {L.addressLines.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
      <div className="pl-contact">
        <div>Email : {L.email}</div>
        <div>Website : {L.website}</div>
      </div>
      <hr className="pl-rule" />
    </div>
  );
}
