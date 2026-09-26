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
//
// A record filled on a revision the format has since replaced is headed with
// THAT revision (REQUIREMENTS §74): F/MNT/11's 2024 page says Rev 00 and the
// date Rev 00 was issued, as the paper it was written on did, not the Rev 01
// that replaced it. The caller passes `revision` only for such a record, so
// every other header reads exactly as before.
//
// THE HEADER IS DESIGNED IN PLACE TOO (REQUIREMENTS §77): on a format opened
// with Edit format, the company's name, the title, the format number, the
// revision and its date are each clicked and typed over where they stand, the
// way a column heading is (components/documents/SheetDesigner.tsx). The caller
// passes `edit` only then: the field being typed, what to do on a click, the
// draft's values, and the box to draw in the cell being typed. A record's own
// date (`dateLabel`) is never one of them — it is the record's, not the form's.

/** The parts of the header a format's designer can change. */
export type HeaderField = "companyName" | "title" | "formatNo" | "revisionNo" | "revisionDate";

export interface HeaderEdit {
  /** The field being typed over, or null. */
  editing: HeaderField | null;
  onEdit: (field: HeaderField) => void;
  /** The draft's values, where they differ from the format as it stands. */
  values: { companyName?: string; formatNo?: string; revisionNo?: string; revisionDate?: string };
  /** The box drawn in the cell being typed over. */
  box: (field: HeaderField) => React.ReactNode;
}

const ACTIONS: Record<HeaderField, string> = {
  companyName: "rename-company",
  title: "rename-title",
  formatNo: "rename-format-no",
  revisionNo: "rename-revision",
  revisionDate: "rename-revision-date",
};

/** A value of the header: as text, or — while the format is being designed — clickable, or the box it is typed in. */
function Cell({ field, edit, className, translate: noTranslate, children }: { field: HeaderField; edit?: HeaderEdit; className?: string; translate?: boolean; children: React.ReactNode }) {
  if (edit?.editing === field) return <>{edit.box(field)}</>;
  if (!edit) {
    return (
      <span className={className} translate={noTranslate ? "no" : undefined}>
        {children}
      </span>
    );
  }
  return (
    <span
      role="button"
      tabIndex={0}
      className={`${className ?? ""} designer-head`.trim()}
      translate={noTranslate ? "no" : undefined}
      data-action={ACTIONS[field]}
      title="Click to change"
      onClick={() => edit.onEdit(field)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          edit.onEdit(field);
        }
      }}
    >
      {children}
    </span>
  );
}

export function DocumentHeader({
  doc,
  extraTitle,
  dateLabel,
  pageLabel,
  companyName,
  letterhead,
  title,
  revision,
  edit,
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
  /** The superseded revision a record was filled on (number, ISO issue date), printed in place of the current one. */
  revision?: { no: string; date: string };
  /** The header being designed in place (REQUIREMENTS §77). */
  edit?: HeaderEdit;
}) {
  // A form issued in Gujarati carries its Gujarati title; with English chosen
  // the title reads in English like the rest of it (REQUIREMENTS §58).
  const { lang } = useAppStore();
  // What the plant changed on the format wins over what the form was issued
  // with (data/formatEdits.ts); a draft being designed wins over both.
  const company = edit?.values.companyName ?? doc.companyName ?? companyName ?? COMPANY.name;
  const formatNo = edit?.values.formatNo ?? doc.formatNo;
  const revisionNo = revision ? revision.no : (edit?.values.revisionNo ?? doc.revisionNo);
  const revisionDate = revision ? revision.date : (edit?.values.revisionDate ?? doc.revisionDate);
  return (
    <div className="doc-header">
      {letterhead ?? (
        <div className="company-name notranslate" translate="no">
          <Cell field="companyName" edit={edit}>
            {company}
          </Cell>
        </div>
      )}
      <div className="doc-title">
        <Cell field="title" edit={edit}>
          {documentTextIn(title ?? doc.name, lang).toUpperCase()}
          {extraTitle ? ` — ${extraTitle}` : ""}
        </Cell>
      </div>
      <div className="meta-row">
        <div className="meta-cell">
          <span className="k">Format No.</span>
          <Cell field="formatNo" edit={edit} className="v notranslate" translate>
            {formatNo}
          </Cell>
        </div>
        <div className="meta-cell">
          <span className="k">Rev No.</span>
          {edit?.editing === "revisionNo" ? (
            edit.box("revisionNo")
          ) : (
            <span className="v notranslate" translate="no" data-revision={revision ? revision.no : undefined}>
              <Cell field="revisionNo" edit={edit}>
                {revisionNo}
              </Cell>
            </span>
          )}
        </div>
        {/* Where the Date cell is taken by the record's own date, the date the
            superseded revision was issued still has to be on the header — it is
            half of what identifies the paper the record was written on. */}
        {revision && dateLabel !== undefined && (
          <div className="meta-cell" data-meta="revision-date">
            <span className="k">Rev Date</span>
            <span className="v notranslate" translate="no">
              {formatDisplayDate(revision.date)}
            </span>
          </div>
        )}
        <div className="meta-cell">
          <span className="k">Date</span>
          {dateLabel !== undefined ? (
            <span className="v notranslate" translate="no">
              {dateLabel}
            </span>
          ) : (
            <Cell field="revisionDate" edit={edit} className="v notranslate" translate>
              {formatDisplayDate(revisionDate)}
            </Cell>
          )}
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
