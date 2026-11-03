import React, { useState } from "react";
import { t } from "../../i18n";
import { useSureFirst, type RevisionChoice, type RevisionOffer } from "../common/SureFirst";

// EVERY PRINTED WORD OF A SHEET IS THE PERSON'S TO TYPE OVER (REQUIREMENTS §135; the owner, 28-Oct-2026: "each and every
// document of HR and QC in that each and every single part make sure it is always editable every single part of it").
//
// A line's printed words - a parameter, a specification, a check point's question, the PROCEDURE under the grid - stay
// drawn exactly as the paper draws them (its bold headings, its lines, its underlines), so nothing changes in print; while
// the record can be written on, a click puts the caret in them, and what is typed becomes THIS record's own words for that
// place. The format, and every other record, keep theirs (Edit format changes the format for every new sheet). Kept when
// the words are left (they are typed in place, so nothing is redrawn under the caret); Escape puts them back as they were.
// The element is drawn afresh after a change (its key), so the words the browser typed into are never the ones React
// keeps. A change is asked about first (REQUIREMENTS §138): kept on "Yes, I am sure", put back as it was on "No".

/** The words as they stand in the element: its lines, without the browser's last line break. */
function wordsIn(el: HTMLElement): string {
  return el.innerText.replace(/\r/g, "").replace(/\n+$/, "");
}

/** The words as the question quotes them: on one line, cut short past 160 letters. */
function quoted(words: string): string {
  const one = words.replace(/\s+/g, " ").trim();
  return one.length > 160 ? `${one.slice(0, 159)}…` : one;
}

export function EditableWords({
  shown,
  editable,
  onChange,
  className,
  style,
  label,
  format,
  children,
}: {
  /** The words drawn now, as the person reads them (the record's own, or the paper's in the chosen language). */
  shown: string;
  /** False on a record that cannot be written on: the words as plain text, as before. */
  editable: boolean;
  onChange: (words: string, choice?: RevisionChoice) => void;
  /**
   * The words are the FORMAT's (the service reports, REQUIREMENTS §154): the question says every report from now on
   * prints them and asks which revision - a new one, its number and date, or none (§148).
   */
  format?: { number: string; offer: RevisionOffer };
  className?: string;
  style?: React.CSSProperties;
  /** What these words are, for a screen reader. */
  label?: string;
  children: React.ReactNode;
}) {
  const [round, setRound] = useState(0);
  const sure = useSureFirst();
  // (exactly the markup it had before: its own span where it had one, the words alone where they stood in their line)
  if (!editable) {
    return className || style ? (
      <span className={className} style={style}>
        {children}
      </span>
    ) : (
      <>{children}</>
    );
  }
  // Drawn afresh after every visit: the browser's own edits never stay under React's feet.
  const again = () => setRound((r) => r + 1);
  return (
    <>
      <span
        key={`${round}|${shown}`}
        className={className ? `${className} editable-words` : "editable-words"}
        style={style}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={label ? `${label} (the printed words, yours to change on this record)` : "The printed words, yours to change on this record"}
        spellCheck={false}
        data-editable-words=""
        onBlur={(e) => {
          const next = wordsIn(e.currentTarget);
          if (next.trim() === shown.trim()) return again();
          // Asked first (REQUIREMENTS §138); what was typed stays on the screen while the question is open.
          sure.ask(
            format
              ? t("sure.formatWords", { number: format.number, from: quoted(shown), to: next.trim() ? quoted(next) : "—" })
              : next.trim()
                ? t("sure.words", { from: quoted(shown), to: quoted(next) })
                : t("sure.wordsRubbedOut", { from: quoted(shown) }),
            (choice) => {
              onChange(next, choice);
              again();
            },
            again,
            format?.offer
          );
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            again();
          }
        }}
      >
        {children}
      </span>
      {sure.dialog}
    </>
  );
}
