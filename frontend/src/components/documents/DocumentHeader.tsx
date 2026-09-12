import React from "react";
import type { DocumentDefinition } from "../../types";
import { COMPANY } from "../../data/seed/masterData";
import { formatDisplayDate } from "../../utils/date";

// Reproduces the original paper header block: company name, document title,
// Format No. / Rev No. / Date / Page No. row — used by every record view so
// the digital version is immediately recognizable as "the same document"
// (section 3). A document issued on somebody else's letterhead — the Pest
// Control Training Record, which the service provider runs and issues — passes
// that letterhead in `letterhead`, and it takes the company line's place.
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
  return (
    <div className="doc-header notranslate" translate="no">
      {letterhead ?? <div className="company-name">{companyName ?? COMPANY.name}</div>}
      <div className="doc-title">
        {title ?? doc.name.toUpperCase()}
        {extraTitle ? ` — ${extraTitle}` : ""}
      </div>
      <div className="meta-row">
        <div className="meta-cell">
          <span className="k">Format No.</span>
          <span className="v">{doc.formatNo}</span>
        </div>
        <div className="meta-cell">
          <span className="k">Rev No.</span>
          <span className="v">{doc.revisionNo}</span>
        </div>
        <div className="meta-cell">
          <span className="k">Date</span>
          <span className="v">{dateLabel ?? formatDisplayDate(doc.revisionDate)}</span>
        </div>
        {pageLabel && (
          <div className="meta-cell">
            <span className="k">Page No.</span>
            <span className="v">{pageLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
}
