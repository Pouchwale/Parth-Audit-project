import React from "react";
import { TBC, type DocumentDefinition, type PageFrame } from "../../types";
import type { HeaderField } from "../../engine/formatOps";
import { COMPANY } from "../../data/seed/masterData";
import { documentTextIn } from "../../i18n/documentText";
import type { Language } from "../../i18n/strings";
import { useAppStore } from "../../store/AppStore";
import { formatDisplayDate } from "../../utils/date";
import { isPlaceholder } from "../../engine/observations";

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
// draft's values, and the box to draw in the cell being typed.
//
// A REVISION NOBODY HAS GIVEN PRINTS EMPTY (REQUIREMENTS §111 part 6). A format
// whose paper prints no revision, and whose revision the plant has not confirmed
// (F/QC/25, F-QC-19's tolerance card), is held as "TO BE CONFIRMED": the screen
// says so, the print leaves the cell empty, as the paper does. A record headed
// with its own date prints the format's revision date beside it ("Rev Date"),
// the date the paper prints in its own header.
//
// AND ON EVERY RECORD (REQUIREMENTS §86): a record page passes `edit` as well,
// with `fields` naming the cells that take a click there. The format's own
// cells — the company, the title, the number, the revision and its date —
// change the FORMAT (a new revision, with a reason: components/documents/
// HeaderEditing.tsx); the record's own Page No. changes that record alone and
// goes in its history. The designer passes no `fields`, so there the format's
// five do, as before.
//
// NO DATE CELL (REQUIREMENTS §117). The owner, 16-Oct-2026, with the DATE cell
// crossed out on every printed page: "remove date from all formats". The header
// block prints what the paper prints — Format No. | Rev No. | Rev Date | Page
// No. — and the record's own date stands only where the PAPER has a box for it
// (a Date column, a "Date:" line, a Calibration Date). The cell DCRS added for
// it is gone from the screen, the preview, the print and every download (which
// are made from the header as drawn here), and no title is suffixed with a date.

/** A title the paper breaks after its dash: "INSPECTION RECORD –" over "SOLVENT BASE LAMINATION FILM". */
function brokenAfterDash(text: string): React.ReactNode {
  const at = text.indexOf(" – ");
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at + 2)}
      <br />
      {text.slice(at + 3)}
    </>
  );
}

/** The parts of the header a format's designer can change — one type with the engine's (engine/formatOps.ts). */
export type { HeaderField } from "../../engine/formatOps";

/** The record's own cell of the header block: its page number (REQUIREMENTS §86; the Date cell is gone, §117). */
export type RecordHeaderField = "page";
export type AnyHeaderField = HeaderField | RecordHeaderField;

const FORMAT_FIELDS: ReadonlySet<AnyHeaderField> = new Set<AnyHeaderField>(["companyName", "title", "formatNo", "revisionNo", "revisionDate"]);

export interface HeaderEdit {
  /** The field being typed over, or null. */
  editing: AnyHeaderField | null;
  onEdit: (field: AnyHeaderField) => void;
  /** The draft's values, where they differ from the format as it stands. */
  values: { companyName?: string; formatNo?: string; revisionNo?: string; revisionDate?: string };
  /** The box drawn in the cell being typed over. */
  box: (field: AnyHeaderField) => React.ReactNode;
  /** The cells that take a click — the format's five when absent (the Sheet Designer). */
  fields?: ReadonlySet<AnyHeaderField>;
}

const ACTIONS: Record<AnyHeaderField, string> = {
  companyName: "rename-company",
  title: "rename-title",
  formatNo: "rename-format-no",
  revisionNo: "rename-revision",
  revisionDate: "rename-revision-date",
  page: "rename-page-no",
};

/** A value of the header: as text, or — while the format is being designed, or on a record — clickable, or the box it is typed in. */
function Cell({ field, edit, className, translate: noTranslate, children }: { field: AnyHeaderField; edit?: HeaderEdit; className?: string; translate?: boolean; children: React.ReactNode }) {
  if (edit?.editing === field) return <>{edit.box(field)}</>;
  if (!edit || !(edit.fields ?? FORMAT_FIELDS).has(field)) {
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

/**
 * A value of the header where the paper draws it in a table of its own (components/records/PaperTableSheet.tsx, §117
 * round 2): the certificate's company and title in its letterhead. The same click, the same box and the same reason
 * asked for as in the header block (REQUIREMENTS §77, §86).
 */
export function HeaderWord({ field, edit, children }: { field: AnyHeaderField; edit?: HeaderEdit; children: React.ReactNode }) {
  return (
    <Cell field={field} edit={edit} translate>
      {children}
    </Cell>
  );
}

/** An ISO date as the framed papers print it: 16.02.2022. */
export function dottedDate(iso: string | null | undefined): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

export function DocumentHeader({
  doc,
  extraTitle,
  pageLabel,
  companyName,
  letterhead,
  title,
  titleAsPrinted = false,
  underCompany,
  revision,
  edit,
  language,
  numberNotPrinted,
  printedWithNumber,
  frame,
  part = "head",
  lineClearance,
  labels,
  dotDates = false,
}: {
  doc: DocumentDefinition;
  /**
   * THE AREA LINE CLEARANCE REPORTS' FRAME (F/QC/15-A to G, §117): the company's name; the title with the machine's name
   * written in at its right (`machine`, the record's box); Format no. / Rev. no. / Effective date in three cells
   * (`cols`: their widths in millimetres). No Page No. cell: the paper has none.
   */
  lineClearance?: { machine: React.ReactNode; cols: number[]; machineWidth: number };
  /**
   * THE PAPER'S FRAMED PAGE (PageFrame, §117): the head is the company's logo and the title in a heavy-bordered band, and
   * the Format number and Page number move to a line of their own at the foot of the page (`part` "foot"), as on the paper.
   */
  frame?: PageFrame;
  /** Which part of a framed paper is drawn: its head, or the bordered Format number / Page line of its foot. */
  part?: "head" | "foot";
  /** Words after the title — a register's year, never a record's date (§117). */
  extraTitle?: string;
  pageLabel?: string;
  /** The company name exactly as THIS form prints it (spellings differ between forms). */
  companyName?: string;
  /** The printed letterhead this form carries, instead of the company name line. */
  letterhead?: React.ReactNode;
  /** The title exactly as the form prints it, when it differs from doc.name. */
  title?: string;
  /** The title in the paper's own letters, not the header's capitals (LogSheetLayout.titleAsPrinted, §111 part 6). */
  titleAsPrinted?: boolean;
  /** The lines the paper prints under the company's name or its letterhead, before the title (§111 part 6). */
  underCompany?: string[];
  /** The superseded revision a record was filled on (number, ISO issue date), printed in place of the current one. */
  revision?: { no: string; date: string };
  /** The header being designed in place (REQUIREMENTS §77). */
  edit?: HeaderEdit;
  /** The language the form's own words read in, where it is not the chosen one: a QC paper printed in Gujarati is printed as issued (REQUIREMENTS §111). */
  language?: Language;
  /** The paper prints no format number and no revision (the Gujarati checklists, REQUIREMENTS §111): an unconfirmed one prints empty. */
  numberNotPrinted?: boolean;
  /** The paper's own lines printed with its format number (F/QC/20's issue and review dates, REQUIREMENTS §111), after the revision. */
  printedWithNumber?: { label: string; value: string }[];
  /** The words the paper puts in its four cells where they are not the header's ("Format No.:", "Rev No:", "Date:", "Page No.:" on F/HR/18, REQUIREMENTS §118). */
  labels?: { formatNo?: string; revNo?: string; revDate?: string; page?: string };
  /** The revision date as the paper writes it, 15.12.2024, not 15-Dec-2024 (F/HR/18). */
  dotDates?: boolean;
}) {
  // A form issued in Gujarati carries its Gujarati title; with English chosen
  // the title reads in English like the rest of it (REQUIREMENTS §58) — unless
  // the form is printed as issued in every language (§111).
  const { lang: chosen } = useAppStore();
  const lang = language ?? chosen;
  // A number the paper does not print, and DCRS has not been told, prints empty — never "TO BE CONFIRMED" on the sheet (§111).
  const asPrinted = (value: string | null | undefined): string => (numberNotPrinted && (!value || value.trim() === TBC) ? "" : (value ?? ""));
  // What the plant changed on the format wins over what the form was issued
  // with (data/formatEdits.ts); a draft being designed wins over both.
  const company = edit?.values.companyName ?? doc.companyName ?? companyName ?? COMPANY.name;
  const formatNo = edit?.values.formatNo ?? doc.formatNo;
  const revisionNo = revision ? revision.no : (edit?.values.revisionNo ?? doc.revisionNo);
  const revisionDate = revision ? revision.date : (edit?.values.revisionDate ?? doc.revisionDate);
  // THE FRAMED PAPER (§117). Foot: "Format number: - F/QC/01 (01 / 16.02.2022)" and "Page 1 of 1" in a bordered line, each
  // value as clickable as it is in the header block. Head: the logo, which carries the company's name, and the title.
  if (frame && part === "foot") {
    const pages = (pageLabel ?? "").split(" of ");
    const pageCell = (
      <>
        {pageLabel ? (
          <>
            Page{" "}
            <Cell field="page" edit={edit} translate>
              {pages.length === 2 ? (
                <>
                  <b>{pages[0]}</b> of <b>{pages[1]}</b>
                </>
              ) : (
                <b>{pageLabel}</b>
              )}
            </Cell>
          </>
        ) : null}
      </>
    );
    // A paper that prints its issue and review dates with its number (F/QC/20's destruction record, printedWithNumber) has a
    // foot of two lines: Format number | Rev. no. | Page, then each date under them. The words are the paper's, as issued.
    if (printedWithNumber && printedWithNumber.length === 2) {
      const ordinal = (v: string) => {
        const m = /^(\d+)(st|nd|rd|th)( .*)$/.exec(v);
        return m ? (
          <>
            {m[1]}
            <sup>{m[2]}</sup>
            {m[3]}
          </>
        ) : (
          v
        );
      };
      return (
        <div className="page-foot page-foot-dated" data-section="page-foot">
          <div className="pf-format notranslate" translate="no">
            Format number: -{" "}
            <Cell field="formatNo" edit={edit} translate>
              {asPrinted(formatNo)}
            </Cell>
          </div>
          <div className="pf-cell notranslate" translate="no">
            Rev. no. -{" "}
            <Cell field="revisionNo" edit={edit} translate>
              {asPrinted(revisionNo)}
            </Cell>
          </div>
          <div className="pf-cell pf-page notranslate" translate="no">
            {pageCell}
          </div>
          {printedWithNumber.map((m, i) => (
            <React.Fragment key={m.label}>
              <div className={`pf-cell${i === 0 ? " pf-first" : ""} notranslate`} translate="no">
                {m.label}
              </div>
              <div className="pf-cell notranslate" translate="no">
                {ordinal(m.value)}
              </div>
            </React.Fragment>
          ))}
        </div>
      );
    }
    return (
      <div className="page-foot" data-section="page-foot">
        <div className="pf-format notranslate" translate="no">
          Format number: -{" "}
          <Cell field="formatNo" edit={edit} translate>
            {asPrinted(formatNo)}
          </Cell>{" "}
          (
          <Cell field="revisionNo" edit={edit} translate>
            {asPrinted(revisionNo)}
          </Cell>{" "}
          /{" "}
          <Cell field="revisionDate" edit={edit} translate>
            {dottedDate(revisionDate)}
          </Cell>
          )
        </div>
        <div className="pf-page notranslate" translate="no">
          {pageCell}
        </div>
      </div>
    );
  }
  if (lineClearance) {
    return (
      <div className="doc-header doc-header-lc" data-lc-head="">
        <div className="lc-company notranslate" translate="no">
          <Cell field="companyName" edit={edit}>
            {company.toUpperCase()}
          </Cell>
        </div>
        <div className="lc-titlerow" style={{ "--lc-machine": `calc(${lineClearance.machineWidth} * var(--u))` } as React.CSSProperties}>
          <div className="lc-title">
            <Cell field="title" edit={edit}>
              {documentTextIn(title ?? doc.name, lang).toUpperCase()}
            </Cell>
          </div>
          <div className="lc-machine">{lineClearance.machine}</div>
        </div>
        <div className="lc-meta notranslate" translate="no" style={{ "--lc-meta": lineClearance.cols.map((c) => `calc(${c} * var(--u))`).join(" ") } as React.CSSProperties}>
          <div>
            Format no. -{" "}
            <Cell field="formatNo" edit={edit} translate>
              {asPrinted(formatNo)}
            </Cell>
          </div>
          <div>
            Rev. no. -{" "}
            <Cell field="revisionNo" edit={edit} translate>
              {asPrinted(revisionNo)}
            </Cell>
          </div>
          <div>
            Effective date :{" "}
            <Cell field="revisionDate" edit={edit} translate>
              {dottedDate(revisionDate)}
            </Cell>
          </div>
        </div>
      </div>
    );
  }
  if (frame) {
    return (
      <div className="doc-header doc-header-frame" data-frame-head="">
        <div className="dhf-logo">
          <img src="brand/gpp-paper-logo.png" width={206} height={69} alt={company} draggable={false} />
        </div>
        <div className={`dhf-title ${frame.titleAlign}`} style={frame.title ? ({ "--title-pt": frame.title.size, color: frame.title.color } as React.CSSProperties) : undefined}>
          <Cell field="title" edit={edit}>
            {frame.titleBreak ? brokenAfterDash(documentTextIn(title ?? doc.name, lang).toUpperCase()) : documentTextIn(title ?? doc.name, lang).toUpperCase()}
            {extraTitle ? ` — ${extraTitle}` : ""}
          </Cell>
        </div>
      </div>
    );
  }
  const dateWords = (iso: string) => (dotDates && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : formatDisplayDate(iso));
  return (
    <div className="doc-header">
      {letterhead ?? (
        <div className={underCompany?.length ? "company-name has-lines notranslate" : "company-name notranslate"} translate="no">
          <Cell field="companyName" edit={edit}>
            {company}
          </Cell>
        </div>
      )}
      {/* The paper's own lines under the company's name — F/QC/11's "Manufacturers of ...", a certificate's address —
          as issued, in every language (§111 part 6). */}
      {underCompany && underCompany.length > 0 && (
        <div className="company-lines notranslate" translate="no" data-section="under-company">
          {underCompany.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
      <div className="doc-title">
        <Cell field="title" edit={edit}>
          {titleAsPrinted ? documentTextIn(title ?? doc.name, lang) : documentTextIn(title ?? doc.name, lang).toUpperCase()}
          {extraTitle ? ` — ${extraTitle}` : ""}
        </Cell>
      </div>
      <div className="meta-row">
        <div className="meta-cell">
          <span className="k">{labels?.formatNo ?? "Format No."}</span>
          <Cell field="formatNo" edit={edit} className="v notranslate" translate>
            {asPrinted(formatNo)}
          </Cell>
        </div>
        <div className="meta-cell">
          <span className="k">{labels?.revNo ?? "Rev No."}</span>
          {edit?.editing === "revisionNo" ? (
            edit.box("revisionNo")
          ) : (
            <span className="v notranslate" translate="no" data-revision={revision ? revision.no : undefined}>
              <Cell field="revisionNo" edit={edit}>
                {/* A number the paper does not print prints empty (§111); one not yet given is said on screen and an empty
                    cell in print (§111 part 6). */}
                {numberNotPrinted ? (
                  asPrinted(revisionNo)
                ) : isPlaceholder(revisionNo) ? (
                  <span className="no-print text-muted" data-revision-unconfirmed="">
                    {revisionNo}
                  </span>
                ) : (
                  revisionNo
                )}
              </Cell>
            </span>
          )}
        </div>
        {printedWithNumber?.map((m) => (
          <div key={m.label} className="meta-cell" data-meta="printed-with-number">
            <span className="k">{m.label}</span>
            <span className="v notranslate" translate="no">
              {m.value}
            </span>
          </div>
        ))}
        {/* The date the revision was issued: half of what identifies the paper
            the record was written on, and the date the paper itself prints in
            its header (§111 part 6). A superseded revision's takes no click; the
            current one's changes the format, as its number does. One the plant
            has not given prints nothing (§111 part 6). No cell for the record's
            own date stands beside it (§117). */}
        {revision && (
          <div className="meta-cell" data-meta="revision-date">
            <span className="k">{labels?.revDate ?? "Rev Date"}</span>
            <span className="v notranslate" translate="no">
              {dateWords(revision.date)}
            </span>
          </div>
        )}
        {!revision && revisionDate && (
          <div className="meta-cell" data-meta="revision-date">
            <span className="k">{labels?.revDate ?? "Rev Date"}</span>
            <Cell field="revisionDate" edit={edit} className="v notranslate" translate>
              {dateWords(revisionDate)}
            </Cell>
          </div>
        )}
        {pageLabel && (
          <div className="meta-cell">
            <span className="k">{labels?.page ?? "Page No."}</span>
            <Cell field="page" edit={edit} className="v notranslate" translate>
              {pageLabel}
            </Cell>
          </div>
        )}
      </div>
    </div>
  );
}
