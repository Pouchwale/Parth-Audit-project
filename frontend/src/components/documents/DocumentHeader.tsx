import React from "react";
import type { DocumentDefinition } from "../../types";
import { COMPANY } from "../../data/seed/masterData";
import { documentTextIn } from "../../i18n/documentText";
import { useAppStore } from "../../store/AppStore";
import { formatDisplayDate } from "../../utils/date";

// Reproduces the original paper header block: company name, document title,
// Format No. / Rev No. / Date / Page No. row — used by every record view so
// the digital version is immediately recognizable as "the same document"
// (section 3). A document issued on somebody else's letterhead — the Pest
// Control Training Record, which the service provider runs and issues — passes
// that letterhead in `letterhead`, and it takes the company line's place.
//
// The title and the row's labels follow the language chosen beside Today's
// Briefing (REQUIREMENTS §58). What never follows it: the company's registered
// name, the format number, the revision number and the dates — the marks that
// identify the document and the record, which read as issued in every
// language.
export function DocumentHeader({
  doc,
  extraTitle,
  dateLabel,
  pageLabel,
  companyName,
  letterhead,
  title,
}: {
  doc: DocumentDefinition;
  extraTitle?: string;
  dateLabel?: string;
  pageLabel?: string;
  /** The company name exactly as THIS form prints it (spellings differ between forms). */
  companyName?: string;
  /** The printed letterhead this form carries, instead of the company name line. */
  letterhead?: React.ReactNode;
  /** The title exactly as the form prints it, when it differs from doc.name. */
  title?: string;
}) {
  // A form issued in Gujarati carries its Gujarati title; with English chosen
  // the title reads in English like the rest of it (REQUIREMENTS §58).
  const { lang } = useAppStore();
  return (
    <div className="doc-header">
      {letterhead ?? (
        <div className="company-name notranslate" translate="no">
          {companyName ?? COMPANY.name}
        </div>
      )}
      <div className="doc-title">
        {documentTextIn(title ?? doc.name, lang).toUpperCase()}
        {extraTitle ? ` — ${extraTitle}` : ""}
      </div>
      <div className="meta-row">
        <div className="meta-cell">
          <span className="k">Format No.</span>
          <span className="v notranslate" translate="no">
            {doc.formatNo}
          </span>
        </div>
        <div className="meta-cell">
          <span className="k">Rev No.</span>
          <span className="v notranslate" translate="no">
            {doc.revisionNo}
          </span>
        </div>
        <div className="meta-cell">
          <span className="k">Date</span>
          <span className="v notranslate" translate="no">
            {dateLabel ?? formatDisplayDate(doc.revisionDate)}
          </span>
        </div>
        {pageLabel && (
          <div className="meta-cell">
            <span className="k">Page No.</span>
            <span className="v notranslate" translate="no">
              {pageLabel}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
